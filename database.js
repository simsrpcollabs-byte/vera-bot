const path = require('node:path');
const { Worker } = require('node:worker_threads');
const config = require('./config');

// Keep VERA's existing synchronous query API while a dedicated worker owns
// the asynchronous Supabase/Postgres connection.
const worker = new Worker(path.join(__dirname, 'database-worker.js'), {
  workerData: { connectionString: config.databaseUrl, ssl: config.databaseSsl },
});
const BUFFER_BYTES = 8 * 1024 * 1024;

function callDatabase(operation, sql = null, args = []) {
  const shared = new SharedArrayBuffer(BUFFER_BYTES);
  const state = new Int32Array(shared, 0, 2);
  const bytes = new Uint8Array(shared, 8);
  worker.postMessage({ shared, operation, sql, args });
  if (Atomics.wait(state, 0, 0, 30_000) === 'timed-out') {
    throw new Error('Supabase did not respond within 30 seconds. Check DATABASE_URL and Railway networking.');
  }
  const length = Atomics.load(state, 1);
  const payload = JSON.parse(Buffer.from(bytes.subarray(0, length)).toString('utf8'));
  if (!payload.ok) {
    const error = new Error(payload.message || 'Database request failed.');
    error.code = payload.code;
    error.detail = payload.detail;
    throw error;
  }
  return payload.value;
}

const db = {
  prepare(sql) {
    return {
      get: (...args) => callDatabase('get', sql, args),
      all: (...args) => callDatabase('all', sql, args),
      run: (...args) => callDatabase('run', sql, args),
    };
  },
  exec: (sql) => callDatabase('exec', sql),
  transaction(fn) {
    return (...args) => {
      callDatabase('begin');
      try {
        const result = fn(...args);
        callDatabase('commit');
        return result;
      } catch (error) {
        try { callDatabase('rollback'); } catch { /* keep original error */ }
        throw error;
      }
    };
  },
  close() {
    try { callDatabase('close'); } finally { worker.terminate(); }
  },
};

callDatabase('init');
module.exports = db;
