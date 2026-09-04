const path = require('node:path');
const { Worker } = require('node:worker_threads');
const config = require('./config');

// Keep VERA's existing synchronous query API while a dedicated worker owns
// the asynchronous Supabase/Postgres connection.
const BUFFER_BYTES = 8 * 1024 * 1024;
let worker = null;
let workerFailure = null;
let closing = false;

function createWorker() {
  const next = new Worker(path.join(__dirname, 'database-worker.js'), {
    workerData: { connectionString: config.databaseUrl, ssl: config.databaseSsl },
  });
  workerFailure = null;
  next.on('error', (error) => { workerFailure = error; });
  next.on('exit', (code) => {
    if (!closing && code !== 0) workerFailure = new Error(`Database worker exited with code ${code}.`);
    if (worker === next) worker = null;
  });
  worker = next;
  return next;
}

function activeWorker() {
  if (closing) throw new Error('The database connection is closing.');
  if (!worker || workerFailure) {
    if (worker) worker.terminate().catch(() => {});
    return createWorker();
  }
  return worker;
}

function callDatabase(operation, sql = null, args = []) {
  const shared = new SharedArrayBuffer(BUFFER_BYTES);
  const state = new Int32Array(shared, 0, 2);
  const bytes = new Uint8Array(shared, 8);
  const target = activeWorker();
  target.postMessage({ shared, operation, sql, args });
  if (Atomics.wait(state, 0, 0, 15_000) === 'timed-out') {
    workerFailure = new Error('Supabase request timed out.');
    target.terminate().catch(() => {});
    throw new Error('Supabase did not respond within 15 seconds. VERA reset the database connection; try once more.');
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
    try { callDatabase('close'); } finally {
      closing = true;
      if (worker) worker.terminate().catch(() => {});
      worker = null;
    }
  },
};

createWorker();
callDatabase('init');
module.exports = db;
