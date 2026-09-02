const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS platforms (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    category TEXT NOT NULL,
    description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    civilian_name TEXT NOT NULL COLLATE NOCASE,
    pronouns TEXT,
    bio TEXT,
    recognition REAL NOT NULL DEFAULT 5,
    heat REAL NOT NULL DEFAULT 5,
    affinity REAL NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_identities_owner
    ON identities(guild_id, owner_user_id);

  CREATE TABLE IF NOT EXISTS identity_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identity_id INTEGER NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    alias_type TEXT NOT NULL,
    alias_name TEXT NOT NULL COLLATE NOCASE,
    industry TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(identity_id, alias_type, alias_name)
  );

  CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE,
    parent_company TEXT,
    genre_focus TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, name)
  );

  CREATE TABLE IF NOT EXISTS label_roster (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    identity_id INTEGER NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    credited_name TEXT,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at TEXT,
    UNIQUE(label_id, identity_id)
  );

  CREATE TABLE IF NOT EXISTS works (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    identity_id INTEGER NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
    label_id INTEGER REFERENCES labels(id) ON DELETE SET NULL,
    platform_code TEXT NOT NULL REFERENCES platforms(code) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    work_type TEXT NOT NULL,
    credited_name TEXT NOT NULL,
    release_date TEXT,
    promo_level TEXT NOT NULL DEFAULT 'standard',
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_works_identity
    ON works(guild_id, identity_id);

  CREATE TABLE IF NOT EXISTS tupper_link_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    identity_id INTEGER NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    requested_by TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'awaiting_message',
    tupper_name TEXT,
    tupper_avatar_url TEXT,
    webhook_id TEXT,
    captured_message_id TEXT,
    expires_at TEXT NOT NULL,
    approved_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tupper_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    identity_id INTEGER NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    tupper_name TEXT NOT NULL,
    tupper_avatar_url TEXT,
    webhook_id TEXT NOT NULL,
    approved_by TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rp_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL UNIQUE,
    identity_id INTEGER NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    raw_content TEXT NOT NULL,
    audible_dialogue TEXT NOT NULL DEFAULT '[]',
    actions_and_thoughts TEXT NOT NULL DEFAULT '[]',
    narration TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_rp_messages_identity
    ON rp_messages(guild_id, identity_id, created_at);
`);

const platforms = [
  ['LUMI', 'Lumi', 'television', 'Television network'],
  ['CANVAS', 'Canvas', 'television', 'Television network'],
  ['PULSE', 'PULSE', 'music', 'Music streaming platform'],
  ['FRAME', 'FRAME', 'video', 'Open video platform'],
  ['XPOSURE', 'Xposure', 'social-profile', 'Profile-based social platform'],
  ['KNETIK', 'KNETIK', 'social-short', 'Short-form social video platform'],
];

const seedPlatform = db.prepare(`
  INSERT INTO platforms (code, name, category, description)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    category = excluded.category,
    description = excluded.description,
    active = 1
`);

const seedAll = db.transaction(() => {
  for (const platform of platforms) seedPlatform.run(...platform);
});
seedAll();

module.exports = db;
