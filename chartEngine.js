const db = require('./database');

const chartDefinitions = {
  songs: { name: 'Vortex Hot 100', emoji: '🎵', limit: 100, decay: 0.91 },
  albums: { name: 'Vortex 200', emoji: '💿', limit: 200, decay: 0.87 },
  television: { name: 'VORTEX Television', emoji: '📺', limit: 50, decay: 0.89 },
  frame: { name: 'FRAME Top Videos', emoji: '▶️', limit: 50, decay: 0.84 },
  knetik: { name: 'KNETIK Trending', emoji: '⚡', limit: 50, decay: 0.72 },
  exposure: { name: 'Xposure Most Watched', emoji: '📸', limit: 50, decay: 0.76 },
};

function weekKeyFor(date = new Date()) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function chartCodeFor(work, metrics) {
  if (metrics?.chart?.code) return metrics.chart.code;
  if (work.platform_code === 'PULSE') return ['album', 'ep'].includes(work.work_type) ? 'albums' : 'songs';
  if (['LUMI', 'CANVAS'].includes(work.platform_code)) return 'television';
  if (work.platform_code === 'FRAME') return 'frame';
  if (work.platform_code === 'KNETIK') return 'knetik';
  if (work.platform_code === 'XPOSURE') return 'exposure';
  return null;
}

function numericField(metrics, name) {
  const value = metrics?.fields?.find((item) => item.name === name)?.value;
  if (!value) return 0;
  const cleaned = String(value).replace(/[$,%#]/g, '').trim().toUpperCase();
  const match = cleaned.match(/^([0-9.]+)\s*([KMB])?$/);
  if (!match) return Number(cleaned.replace(/,/g, '')) || 0;
  const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[match[2]] || 1;
  return Number(match[1]) * multiplier;
}

function scoreFor(code, metrics) {
  if (Number(metrics?.chart?.score) > 0) return Number(metrics.chart.score);
  if (code === 'songs') return numericField(metrics, 'Chart points');
  if (code === 'albums') return numericField(metrics, 'Equivalent units');
  if (code === 'television') {
    return numericField(metrics, '7-day viewers') + (numericField(metrics, '18–49 rating') * 1_000_000);
  }
  if (code === 'frame') {
    return numericField(metrics, 'Projected 7-day views')
      + (numericField(metrics, 'Likes') * 4)
      + (numericField(metrics, 'Comments') * 12);
  }
  if (code === 'exposure') {
    return numericField(metrics, 'Accounts reached')
      + (numericField(metrics, 'Flashes') * 5)
      + (numericField(metrics, 'Comments') * 10);
  }
  return numericField(metrics, 'First 24 hours')
    + (numericField(metrics, 'Likes') * 4)
    + (numericField(metrics, 'Shares') * 12);
}

function variation(workId, weekKey) {
  let hash = 2166136261;
  for (const char of `${workId}:${weekKey}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 0.94 + (((hash >>> 0) % 1300) / 10000);
}

function ageInWeeks(createdAt) {
  const created = new Date(`${String(createdAt).replace(' ', 'T')}Z`);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / (7 * 86400000)));
}

function buildChartWeek(guildId, weekKey = weekKeyFor()) {
  const currentWeek = weekKey === weekKeyFor();
  const build = db.transaction(() => {
    db.prepare(`
      INSERT INTO chart_weeks (guild_id, week_key) VALUES (?, ?)
      ON CONFLICT(guild_id, week_key) DO NOTHING
    `).run(guildId, weekKey);
    const chartWeek = db.prepare(`
      SELECT * FROM chart_weeks WHERE guild_id = ? AND week_key = ?
    `).get(guildId, weekKey);

    const existingCount = db.prepare(`
      SELECT COUNT(*) AS count FROM chart_entries WHERE chart_week_id = ?
    `).get(chartWeek.id).count;
    if (existingCount && !currentWeek) return chartWeek;
    db.prepare(`DELETE FROM chart_entries WHERE chart_week_id = ?`).run(chartWeek.id);

    const previousWeek = db.prepare(`
      SELECT id FROM chart_weeks
      WHERE guild_id = ? AND week_key < ?
      ORDER BY week_key DESC LIMIT 1
    `).get(guildId, weekKey);
    const previousEntries = previousWeek ? db.prepare(`
      SELECT chart_code, work_id, rank FROM chart_entries WHERE chart_week_id = ?
    `).all(previousWeek.id) : [];
    const previousMap = new Map(previousEntries.map((entry) => [`${entry.chart_code}:${entry.work_id}`, entry.rank]));

    const works = db.prepare(`
      SELECT w.*, wm.metrics_json
      FROM works w
      JOIN work_metrics wm ON wm.work_id = w.id
      WHERE w.guild_id = ? AND w.status = 'released'
    `).all(guildId);
    const grouped = {};
    for (const work of works) {
      let metrics;
      try { metrics = JSON.parse(work.metrics_json); } catch { continue; }
      const code = chartCodeFor(work, metrics);
      const definition = chartDefinitions[code];
      if (!definition) continue;
      const baseScore = scoreFor(code, metrics);
      if (!baseScore) continue;
      const weeksOld = ageInWeeks(work.created_at);
      const score = baseScore * (definition.decay ** weeksOld) * variation(work.id, weekKey);
      if (!grouped[code]) grouped[code] = [];
      grouped[code].push({ work, score });
    }

    const insert = db.prepare(`
      INSERT INTO chart_entries
        (chart_week_id, chart_code, work_id, rank, previous_rank, score, weeks_on_chart, peak_rank)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [code, candidates] of Object.entries(grouped)) {
      const ranked = candidates.sort((a, b) => b.score - a.score).slice(0, chartDefinitions[code].limit);
      ranked.forEach((candidate, index) => {
        const rank = index + 1;
        const previousRank = previousMap.get(`${code}:${candidate.work.id}`) || null;
        const history = db.prepare(`
          SELECT COUNT(*) AS weeks, MIN(ce.rank) AS peak
          FROM chart_entries ce
          JOIN chart_weeks cw ON cw.id = ce.chart_week_id
          WHERE cw.guild_id = ? AND ce.chart_code = ? AND ce.work_id = ? AND cw.id != ?
        `).get(guildId, code, candidate.work.id, chartWeek.id);
        insert.run(
          chartWeek.id, code, candidate.work.id, rank, previousRank, candidate.score,
          Number(history.weeks) + 1, Math.min(rank, Number(history.peak) || rank),
        );
      });
    }
    return chartWeek;
  });
  return build();
}

function getChart(guildId, code, limit = 10, weekKey = weekKeyFor()) {
  if (!chartDefinitions[code]) return [];
  const chartWeek = buildChartWeek(guildId, weekKey);
  return db.prepare(`
    SELECT ce.*, w.title, w.credited_name, w.platform_code, w.work_type, i.verified
    FROM chart_entries ce
    JOIN works w ON w.id = ce.work_id
    JOIN identities i ON i.id = w.identity_id
    WHERE ce.chart_week_id = ? AND ce.chart_code = ?
    ORDER BY ce.rank LIMIT ?
  `).all(chartWeek.id, code, limit);
}

function movement(entry) {
  if (!entry.previous_rank) return 'NEW';
  if (entry.previous_rank === entry.rank) return '—';
  return entry.previous_rank > entry.rank
    ? `▲ ${entry.previous_rank - entry.rank}`
    : `▼ ${entry.rank - entry.previous_rank}`;
}

module.exports = { chartDefinitions, buildChartWeek, getChart, movement, weekKeyFor };
