const db = require('./database');
const { addAudience } = require('./audience');
const { addCollaboratorAudience, updateCollaboratorCareer } = require('./collaboration');

const POSITIVE = ['love', 'loved', 'obsessed', 'amazing', 'good', 'great', 'beautiful', 'fire', 'hit', 'iconic', 'favorite', 'favourite', 'ate', 'slayed', 'slays', 'bop', 'watching', 'streaming'];
const NEGATIVE = ['hate', 'hated', 'bad', 'awful', 'terrible', 'boring', 'flop', 'trash', 'weak', 'mess', 'mid', 'annoying', 'disappointed', 'disappointing'];

const IMPACT = {
  PULSE: { label: 'projected streams', perPoint: 25_000, audiencePerPoint: 120 },
  FRAME: { label: 'projected views', perPoint: 15_000, audiencePerPoint: 90 },
  XPOSURE: { label: 'additional impressions', perPoint: 12_000, audiencePerPoint: 65 },
  KNETIK: { label: 'projected views', perPoint: 18_000, audiencePerPoint: 85 },
  ECHO: { label: 'additional reach', perPoint: 14_000, audiencePerPoint: 70 },
  LUMI: { label: 'projected viewers', perPoint: 8_000, audiencePerPoint: 0 },
  CANVAS: { label: 'projected viewers', perPoint: 8_000, audiencePerPoint: 0 },
};

function containsTerm(text, terms) {
  const normalized = ` ${String(text || '').toLowerCase().replace(/[^a-z0-9'’]+/g, ' ')} `;
  return terms.some((term) => normalized.includes(` ${term} `));
}

function sentimentFor(dialogue) {
  const positive = containsTerm(dialogue, POSITIVE);
  const negative = containsTerm(dialogue, NEGATIVE);
  if (positive === negative) return 0;
  return positive ? 1 : -1;
}

function titleAppears(text, title) {
  const needle = String(title || '').trim().toLowerCase();
  if (needle.length < 4) return false;
  return String(text || '').toLowerCase().includes(needle);
}

function processRpBuzz({ message, speakerIdentityId, parsed }) {
  const works = db.prepare(`
    SELECT id, identity_id, platform_code, title
    FROM works
    WHERE status = 'released'
    ORDER BY created_at DESC LIMIT 200
  `).all();
  const fullText = message.content || '';
  const dialogue = parsed.dialogue.join(' ');
  const sentiment = sentimentFor(dialogue);
  const affected = [];

  for (const work of works) {
    if (!titleAppears(fullText, work.title)) continue;
    const daily = db.prepare(`
      SELECT COUNT(*) AS count FROM rp_buzz_events
      WHERE guild_id = ? AND work_id = ? AND speaker_identity_id = ?
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `).get(message.guildId, work.id, speakerIdentityId);
    if (Number(daily.count) >= 3) continue;

    const prior = db.prepare(`
      SELECT id FROM rp_buzz_events
      WHERE guild_id = ? AND work_id = ? AND speaker_identity_id = ? LIMIT 1
    `).get(message.guildId, work.id, speakerIdentityId);
    const mentionedAudibly = titleAppears(dialogue, work.title);
    let points = mentionedAudibly ? 1.5 : 1;
    if (!prior) points += 0.5;
    if (sentiment !== 0) points += sentiment > 0 ? 1 : 0.75;
    if (Number(work.identity_id) === Number(speakerIdentityId)) points *= 0.35;
    points = Math.round(points * 100) / 100;

    const impact = IMPACT[work.platform_code] || { label: 'additional reach', perPoint: 8_000, audiencePerPoint: 40 };
    const metricGain = Math.round(points * impact.perPoint);
    const audienceGain = Math.round(points * impact.audiencePerPoint);
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO rp_buzz_events
        (guild_id, message_id, speaker_identity_id, work_id, sentiment, points,
         audible, metric_gain, audience_gain)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(message.guildId, message.id, speakerIdentityId, work.id, sentiment, points,
      mentionedAudibly ? 1 : 0, metricGain, audienceGain);
    if (!inserted.changes) continue;

    db.prepare(`
      INSERT INTO work_buzz
        (guild_id, work_id, mentions, positive_mentions, negative_mentions,
         buzz_score, metric_gain, audience_gain, updated_at)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(work_id) DO UPDATE SET
        mentions = work_buzz.mentions + 1,
        positive_mentions = work_buzz.positive_mentions + EXCLUDED.positive_mentions,
        negative_mentions = work_buzz.negative_mentions + EXCLUDED.negative_mentions,
        buzz_score = work_buzz.buzz_score + EXCLUDED.buzz_score,
        metric_gain = work_buzz.metric_gain + EXCLUDED.metric_gain,
        audience_gain = work_buzz.audience_gain + EXCLUDED.audience_gain,
        updated_at = CURRENT_TIMESTAMP
    `).run(message.guildId, work.id, sentiment > 0 ? 1 : 0, sentiment < 0 ? 1 : 0,
      points, metricGain, audienceGain);

    if (audienceGain > 0) addAudience(db, message.guildId, work.identity_id, work.platform_code, audienceGain, points);
    if (audienceGain > 0) addCollaboratorAudience(db, work.id, work.platform_code, audienceGain, points);
    db.prepare(`
      UPDATE identities SET
        heat = LEAST(100, heat + ?),
        affinity = LEAST(100, GREATEST(0, affinity + ?))
      WHERE id = ?
    `).run(points * 0.08, sentiment * 0.04, work.identity_id);
    updateCollaboratorCareer(db, work.id, points * 0.08, sentiment * 0.04);
    affected.push({ workId: work.id, title: work.title, points, metricGain, label: impact.label });
  }
  return affected;
}

function getWorkBuzz(workId) {
  return db.prepare(`
    SELECT wb.*,
      (SELECT COUNT(DISTINCT speaker_identity_id) FROM rp_buzz_events WHERE work_id = wb.work_id) AS unique_personas
    FROM work_buzz wb WHERE wb.work_id = ?
  `).get(workId);
}

function formatBuzz(buzz, platformCode) {
  if (!buzz) return 'No organic RP discussion yet.';
  const impact = IMPACT[platformCode] || { label: 'additional reach' };
  const sentimentTotal = Number(buzz.positive_mentions) + Number(buzz.negative_mentions);
  const positiveShare = sentimentTotal
    ? Math.round((Number(buzz.positive_mentions) / sentimentTotal) * 100)
    : null;
  return [
    `**${Number(buzz.mentions).toLocaleString()}** counted mention${Number(buzz.mentions) === 1 ? '' : 's'} from **${Number(buzz.unique_personas || 0)}** persona${Number(buzz.unique_personas) === 1 ? '' : 's'}`,
    `**+${Number(buzz.metric_gain).toLocaleString()}** ${impact.label}`,
    positiveShare === null ? '**Neutral/mixed** public sentiment' : `**${positiveShare}% positive** public sentiment`,
  ].join('\n');
}

module.exports = { formatBuzz, getWorkBuzz, processRpBuzz };
