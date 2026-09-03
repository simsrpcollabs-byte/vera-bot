const fs = require('node:fs');
const path = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');
const { Pool, types } = require('pg');

types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

const pool = new Pool({
  connectionString: workerData.connectionString,
  ssl: workerData.ssl ? { rejectUnauthorized: false } : false,
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});
const serialTables = new Set(['identities','identity_aliases','labels','label_roster','works','work_metrics','chart_weeks','chart_entries','verification_requests','social_posts','promotions','tupper_link_requests','tupper_links','rp_messages']);
let initialized = false;
let transactionClient = null;

function placeholders(sql) {
  let index = 0; let quote = null; let result = '';
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if ((char === "'" || char === '"') && sql[i - 1] !== '\\') {
      if (!quote) quote = char; else if (quote === char) quote = null;
    }
    result += char === '?' && !quote ? `$${++index}` : char;
  }
  return result;
}

function normalize(sql, operation) {
  let value = String(sql).trim().replace(/;\s*$/, '');
  const ignore = /^INSERT\s+OR\s+IGNORE\s+INTO/i.test(value);
  if (ignore) value = value.replace(/^INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO');
  value = placeholders(value);
  if (ignore && !/\bON\s+CONFLICT\b/i.test(value)) value += ' ON CONFLICT DO NOTHING';
  if (operation === 'run' && /^INSERT\s+INTO/i.test(value) && !/\bRETURNING\b/i.test(value)) {
    const table = value.match(/^INSERT\s+INTO\s+([a-z_][a-z0-9_]*)/i)?.[1]?.toLowerCase();
    if (serialTables.has(table)) value += ' RETURNING id';
  }
  return value;
}

async function query(sql, args = []) { return (transactionClient || pool).query(sql, args); }
async function initialize() {
  if (initialized) return;
  await pool.query(fs.readFileSync(path.join(__dirname, 'supabase-schema.sql'), 'utf8'));
  initialized = true;
}
function serializeError(error) {
  let code = error.code || 'DATABASE_ERROR';
  if (code === '23505') code = 'SQLITE_CONSTRAINT_UNIQUE';
  if (code === '23503' || code === '23502') code = 'SQLITE_CONSTRAINT';
  return { ok: false, code, message: error.message, detail: error.detail };
}
function respond(shared, payload) {
  const state = new Int32Array(shared, 0, 2);
  let output = Buffer.from(JSON.stringify(payload));
  if (output.length > shared.byteLength - 8) output = Buffer.from(JSON.stringify({ ok:false, code:'RESULT_TOO_LARGE', message:'Database result exceeded the bridge buffer.' }));
  new Uint8Array(shared, 8, output.length).set(output);
  Atomics.store(state, 1, output.length); Atomics.store(state, 0, 1); Atomics.notify(state, 0);
}

parentPort.on('message', async ({ shared, operation, sql, args }) => {
  try {
    if (operation === 'init') { await initialize(); respond(shared,{ok:true,value:true}); return; }
    await initialize();
    if (operation === 'begin') {
      if (transactionClient) throw new Error('A database transaction is already active.');
      transactionClient = await pool.connect(); await transactionClient.query('BEGIN'); respond(shared,{ok:true,value:true}); return;
    }
    if (operation === 'commit' || operation === 'rollback') {
      if (transactionClient) { await transactionClient.query(operation.toUpperCase()); transactionClient.release(); transactionClient=null; }
      respond(shared,{ok:true,value:true}); return;
    }
    if (operation === 'close') { if (transactionClient) transactionClient.release(); transactionClient=null; await pool.end(); respond(shared,{ok:true,value:true}); return; }
    if (operation === 'exec') { await query(sql); respond(shared,{ok:true,value:true}); return; }
    const result = await query(normalize(sql, operation), args || []);
    if (operation === 'get') respond(shared,{ok:true,value:result.rows[0]});
    else if (operation === 'all') respond(shared,{ok:true,value:result.rows});
    else respond(shared,{ok:true,value:{changes:result.rowCount,lastInsertRowid:result.rows[0]?.id ?? null}});
  } catch (error) {
    if (transactionClient && ['commit','rollback'].includes(operation)) { transactionClient.release(); transactionClient=null; }
    respond(shared,serializeError(error));
  }
});
