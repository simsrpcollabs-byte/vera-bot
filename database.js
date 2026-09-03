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
    verified INTEGER NOT NULL DEFAULT 0,
    verified_by TEXT,
    verified_at TEXT,
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

  CREATE TABLE IF NOT EXISTS work_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL UNIQUE REFERENCES works(id) ON DELETE CASCADE,
    metrics_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chart_settings (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT,
    publish_day INTEGER NOT NULL DEFAULT 1,
    publish_hour INTEGER NOT NULL DEFAULT 14,
    timezone TEXT NOT NULL DEFAULT 'America/Chicago',
    updated_by TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chart_weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    week_key TEXT NOT NULL,
    published_at TEXT,
    channel_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, week_key)
  );

  CREATE TABLE IF NOT EXISTS chart_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chart_week_id INTEGER NOT NULL REFERENCES chart_weeks(id) ON DELETE CASCADE,
    chart_code TEXT NOT NULL,
    work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    previous_rank INTEGER,
    score REAL NOT NULL,
    weeks_on_chart INTEGER NOT NULL DEFAULT 1,
    peak_rank INTEGER NOT NULL,
    UNIQUE(chart_week_id, chart_code, work_id),
    UNIQUE(chart_week_id, chart_code, rank)
  );

  CREATE INDEX IF NOT EXISTS idx_chart_entries_work
    ON chart_entries(work_id, chart_code, rank);

  CREATE TABLE IF NOT EXISTS social_profiles (
    guild_id TEXT NOT NULL,
    identity_id INTEGER NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    platform_code TEXT NOT NULL REFERENCES platforms(code) ON DELETE CASCADE,
    followers INTEGER NOT NULL DEFAULT 0,
    activity_score REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, identity_id, platform_code)
  );

  CREATE TABLE IF NOT EXISTS verification_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    identity_id INTEGER NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    requested_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_verification_requests
    ON verification_requests(guild_id, status, created_at);

  CREATE TABLE IF NOT EXISTS platform_channels (
    guild_id TEXT NOT NULL,
    platform_code TEXT NOT NULL REFERENCES platforms(code) ON DELETE CASCADE,
    channel_id TEXT NOT NULL,
    configured_by TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, platform_code)
  );

  CREATE TABLE IF NOT EXISTS social_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    identity_id INTEGER NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    work_id INTEGER NOT NULL UNIQUE REFERENCES works(id) ON DELETE CASCADE,
    platform_code TEXT NOT NULL REFERENCES platforms(code) ON DELETE RESTRICT,
    credited_name TEXT NOT NULL,
    caption TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT,
    metrics_json TEXT NOT NULL,
    channel_id TEXT,
    message_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    social_post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    started_by TEXT NOT NULL,
    promo_level TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    starts_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    channel_id TEXT,
    message_id TEXT,
    final_metrics_json TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_promotions_active
    ON promotions(status, expires_at_ms);

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

// Safe, additive migration for databases created before series tracking existed.
const workColumns = db.prepare(`PRAGMA table_info(works)`).all();
if (!workColumns.some((column) => column.name === 'parent_work_id')) {
  db.exec(`ALTER TABLE works ADD COLUMN parent_work_id INTEGER REFERENCES works(id) ON DELETE SET NULL`);
}

const identityColumns = db.prepare(`PRAGMA table_info(identities)`).all();
if (!identityColumns.some((column) => column.name === 'verified')) {
  db.exec(`ALTER TABLE identities ADD COLUMN verified INTEGER NOT NULL DEFAULT 0`);
  db.exec(`ALTER TABLE identities ADD COLUMN verified_by TEXT`);
  db.exec(`ALTER TABLE identities ADD COLUMN verified_at TEXT`);
}

const socialPostColumns = db.prepare(`PRAGMA table_info(social_posts)`).all();
if (!socialPostColumns.some((column) => column.name === 'media_type')) {
  db.exec(`ALTER TABLE social_posts ADD COLUMN media_type TEXT`);
}

// Identity registration is self-service. Preserve rejected records, but make
// any identities left in the former approval queue immediately usable.
db.prepare(`
  UPDATE identities
  SET status = 'approved', reviewed_by = owner_user_id, reviewed_at = CURRENT_TIMESTAMP
  WHERE status = 'pending'
`).run();

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
