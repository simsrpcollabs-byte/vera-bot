CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS platforms (
  code TEXT PRIMARY KEY, name CITEXT NOT NULL UNIQUE, category TEXT NOT NULL,
  description TEXT, logo_url TEXT, brand_color TEXT, active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS identities (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
  civilian_name CITEXT NOT NULL, pronouns TEXT, bio TEXT,
  recognition DOUBLE PRECISION NOT NULL DEFAULT 5, heat DOUBLE PRECISION NOT NULL DEFAULT 5,
  affinity DOUBLE PRECISION NOT NULL DEFAULT 5, verified SMALLINT NOT NULL DEFAULT 0,
  verified_by TEXT, verified_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'approved',
  reviewed_by TEXT, reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_identities_owner ON identities(guild_id, owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_owner_name ON identities(guild_id, owner_user_id, civilian_name);
CREATE TABLE IF NOT EXISTS identity_aliases (
  id BIGSERIAL PRIMARY KEY, identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  alias_type TEXT NOT NULL, alias_name CITEXT NOT NULL, industry TEXT, active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(identity_id, alias_type, alias_name)
);
CREATE TABLE IF NOT EXISTS labels (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, owner_user_id TEXT NOT NULL, name CITEXT NOT NULL,
  parent_company TEXT, genre_focus TEXT, status TEXT NOT NULL DEFAULT 'pending', reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(guild_id, name)
);
CREATE TABLE IF NOT EXISTS label_roster (
  id BIGSERIAL PRIMARY KEY, label_id BIGINT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE CASCADE, credited_name TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, left_at TIMESTAMPTZ, UNIQUE(label_id, identity_id)
);
CREATE TABLE IF NOT EXISTS works (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, submitted_by TEXT NOT NULL,
  identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
  label_id BIGINT REFERENCES labels(id) ON DELETE SET NULL,
  platform_code TEXT NOT NULL REFERENCES platforms(code) ON DELETE RESTRICT,
  title TEXT NOT NULL, work_type TEXT NOT NULL, credited_name TEXT NOT NULL, release_date TEXT,
  promo_level TEXT NOT NULL DEFAULT 'standard', status TEXT NOT NULL DEFAULT 'released',
  reviewed_by TEXT, reviewed_at TIMESTAMPTZ,
  parent_work_id BIGINT REFERENCES works(id) ON DELETE SET NULL,
  media_url TEXT, media_type TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_works_identity ON works(guild_id, identity_id);
CREATE TABLE IF NOT EXISTS work_metrics (
  id BIGSERIAL PRIMARY KEY, work_id BIGINT NOT NULL UNIQUE REFERENCES works(id) ON DELETE CASCADE,
  metrics_json TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chart_settings (
  guild_id TEXT PRIMARY KEY, channel_id TEXT, publish_day INTEGER NOT NULL DEFAULT 1,
  publish_hour INTEGER NOT NULL DEFAULT 14, timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chart_weeks (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, week_key TEXT NOT NULL, published_at TIMESTAMPTZ,
  channel_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(guild_id, week_key)
);
CREATE TABLE IF NOT EXISTS chart_entries (
  id BIGSERIAL PRIMARY KEY, chart_week_id BIGINT NOT NULL REFERENCES chart_weeks(id) ON DELETE CASCADE,
  chart_code TEXT NOT NULL, work_id BIGINT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL, previous_rank INTEGER, score DOUBLE PRECISION NOT NULL,
  weeks_on_chart INTEGER NOT NULL DEFAULT 1, peak_rank INTEGER NOT NULL,
  UNIQUE(chart_week_id, chart_code, work_id), UNIQUE(chart_week_id, chart_code, rank)
);
CREATE INDEX IF NOT EXISTS idx_chart_entries_work ON chart_entries(work_id, chart_code, rank);
CREATE TABLE IF NOT EXISTS social_profiles (
  guild_id TEXT NOT NULL, identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  platform_code TEXT NOT NULL REFERENCES platforms(code) ON DELETE CASCADE,
  followers BIGINT NOT NULL DEFAULT 0, activity_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(guild_id, identity_id, platform_code)
);
CREATE TABLE IF NOT EXISTS verification_requests (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_verification_requests ON verification_requests(guild_id, status, created_at);
CREATE TABLE IF NOT EXISTS platform_channels (
  guild_id TEXT NOT NULL, platform_code TEXT NOT NULL REFERENCES platforms(code) ON DELETE CASCADE,
  channel_id TEXT NOT NULL, webhook_id TEXT, webhook_token TEXT, configured_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(guild_id, platform_code)
);
CREATE TABLE IF NOT EXISTS social_posts (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, submitted_by TEXT NOT NULL,
  identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  work_id BIGINT NOT NULL UNIQUE REFERENCES works(id) ON DELETE CASCADE,
  platform_code TEXT NOT NULL REFERENCES platforms(code) ON DELETE RESTRICT,
  credited_name TEXT NOT NULL, caption TEXT NOT NULL, media_url TEXT, media_type TEXT,
  metrics_json TEXT NOT NULL, channel_id TEXT, message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS content_engagements (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL,
  work_id BIGINT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  engagement_type TEXT NOT NULL, response_text TEXT, rating INTEGER,
  created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(work_id, identity_id, engagement_type)
);
CREATE INDEX IF NOT EXISTS idx_content_engagements_work ON content_engagements(guild_id, work_id, created_at);
CREATE TABLE IF NOT EXISTS promotions (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL,
  social_post_id BIGINT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  started_by TEXT NOT NULL, promo_level TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
  starts_at_ms BIGINT NOT NULL, expires_at_ms BIGINT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  channel_id TEXT, message_id TEXT, final_metrics_json TEXT, completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(status, expires_at_ms);
CREATE TABLE IF NOT EXISTS tupper_link_requests (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL,
  identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL, channel_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'awaiting_message',
  tupper_name TEXT, tupper_avatar_url TEXT, webhook_id TEXT, captured_message_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL, approved_by TEXT, reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tupper_links (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL,
  identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  tupper_name TEXT NOT NULL, tupper_avatar_url TEXT, webhook_id TEXT NOT NULL,
  approved_by TEXT NOT NULL, active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tupper_proxy ON tupper_links(guild_id, webhook_id, tupper_name, active);
CREATE TABLE IF NOT EXISTS rp_messages (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE, identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  raw_content TEXT NOT NULL, audible_dialogue TEXT NOT NULL DEFAULT '[]',
  actions_and_thoughts TEXT NOT NULL DEFAULT '[]', narration TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rp_messages_identity ON rp_messages(guild_id, identity_id, created_at);
CREATE TABLE IF NOT EXISTS rp_buzz_events (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, message_id TEXT NOT NULL,
  speaker_identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  work_id BIGINT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  sentiment SMALLINT NOT NULL DEFAULT 0, points DOUBLE PRECISION NOT NULL DEFAULT 0,
  audible SMALLINT NOT NULL DEFAULT 0, metric_gain BIGINT NOT NULL DEFAULT 0,
  audience_gain BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, work_id)
);
CREATE INDEX IF NOT EXISTS idx_rp_buzz_daily ON rp_buzz_events(guild_id, work_id, speaker_identity_id, created_at);
CREATE TABLE IF NOT EXISTS work_buzz (
  work_id BIGINT PRIMARY KEY REFERENCES works(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL, mentions INTEGER NOT NULL DEFAULT 0,
  positive_mentions INTEGER NOT NULL DEFAULT 0, negative_mentions INTEGER NOT NULL DEFAULT 0,
  buzz_score DOUBLE PRECISION NOT NULL DEFAULT 0, metric_gain BIGINT NOT NULL DEFAULT 0,
  audience_gain BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE works ADD COLUMN IF NOT EXISTS parent_work_id BIGINT REFERENCES works(id) ON DELETE SET NULL;
ALTER TABLE works ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE works ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS brand_color TEXT;
ALTER TABLE platform_channels ADD COLUMN IF NOT EXISTS webhook_id TEXT;
ALTER TABLE platform_channels ADD COLUMN IF NOT EXISTS webhook_token TEXT;

INSERT INTO platforms (code,name,category,description,brand_color) VALUES
('LUMI','Lumi','television','Television network','8B63FF'),
('CANVAS','Canvas','television','Television network','6757FF'),
('PULSE','PULSE','music','Music streaming platform','2DDCFF'),
('FRAME','FRAME','video','Open video platform','17C3B2'),
('XPOSURE','Xposure','social-profile','Profile-based social platform','FF5EDB'),
('KNETIK','KNETIK','social-short','Short-form social video platform','FF7A67'),
('ECHO','ECHO','social-micro','Real-time public conversation platform','8A5CFF')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category,
description=EXCLUDED.description, brand_color=COALESCE(platforms.brand_color,EXCLUDED.brand_color), active=1;
