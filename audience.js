const LABELS = {
  XPOSURE: 'Watchers',
  KNETIK: 'Followers',
  FRAME: 'Subscribers',
  PULSE: 'Listeners',
  ECHO: 'Listeners',
};

function audienceLabel(platformCode) {
  return LABELS[String(platformCode || '').toUpperCase()] || 'Followers';
}

function audienceGain(metrics = {}) {
  return Math.max(0, Math.round(Number(metrics.audienceGain ?? metrics.socialGain ?? 0)));
}

function addAudience(db, guildId, identityId, platformCode, gain, score = 0) {
  const amount = Math.max(0, Math.round(Number(gain || 0)));
  if (!amount) return;
  db.prepare(`
    INSERT INTO social_profiles (guild_id, identity_id, platform_code, followers, activity_score, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(guild_id, identity_id, platform_code) DO UPDATE SET
      followers = social_profiles.followers + EXCLUDED.followers,
      activity_score = social_profiles.activity_score + EXCLUDED.activity_score,
      updated_at = CURRENT_TIMESTAMP
  `).run(guildId, identityId, platformCode, amount, Number(score || 0));
}

module.exports = { addAudience, audienceGain, audienceLabel };
