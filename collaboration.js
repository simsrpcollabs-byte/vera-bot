const { audienceGain, addAudience } = require('./audience');

const COLLABORATOR_ROLES = [
  ['Featured artist', 'featured_artist'],
  ['Producer', 'producer'],
  ['Songwriter', 'songwriter'],
  ['Actor / cast member', 'actor'],
  ['Director', 'director'],
  ['Writer', 'writer'],
  ['Executive producer', 'executive_producer'],
  ['Creator', 'creator'],
  ['Guest / co-host', 'guest'],
  ['Editor', 'editor'],
  ['Photographer', 'photographer'],
  ['Model', 'model'],
  ['Stylist', 'stylist'],
  ['Brand partner', 'brand_partner'],
  ['Choreographer', 'choreographer'],
];

const ROLE_LABELS = Object.fromEntries(COLLABORATOR_ROLES.map(([label, value]) => [value, label]));
const ROLE_WEIGHTS = {
  featured_artist: 0.65,
  producer: 0.5,
  songwriter: 0.4,
  actor: 0.55,
  director: 0.65,
  writer: 0.45,
  executive_producer: 0.4,
  creator: 0.7,
  guest: 0.35,
  editor: 0.25,
  photographer: 0.3,
  model: 0.3,
  stylist: 0.2,
  brand_partner: 0.25,
  choreographer: 0.35,
};

function roleLabel(role) {
  return ROLE_LABELS[role] || String(role || 'Collaborator').replaceAll('_', ' ');
}

function roleWeight(role) {
  return ROLE_WEIGHTS[role] || 0.25;
}

function getCollaborators(db, workId) {
  return db.prepare(`
    SELECT wc.*, i.civilian_name, i.verified
    FROM work_collaborators wc
    JOIN identities i ON i.id = wc.identity_id
    WHERE wc.work_id = ? AND wc.active = 1
    ORDER BY wc.created_at, wc.id
  `).all(workId);
}

function formatCollaborators(rows) {
  if (!rows.length) return 'No additional collaborators credited.';
  const lines = rows.map((row) => `**${row.credited_name}** — ${roleLabel(row.role)}${row.verified ? ' ✓' : ''}`);
  let result = '';
  for (const line of lines) {
    const next = result ? `${result}\n${line}` : line;
    if (next.length > 950) break;
    result = next;
  }
  const shown = result ? result.split('\n').length : 0;
  if (shown < lines.length) result += `\n*Plus ${lines.length - shown} more credit${lines.length - shown === 1 ? '' : 's'}.*`;
  return result;
}

function creditOpeningMetrics(db, work, identityId, role) {
  const stored = db.prepare(`SELECT metrics_json FROM work_metrics WHERE work_id = ?`).get(work.id);
  if (!stored) return;
  let metrics = {};
  try { metrics = JSON.parse(stored.metrics_json); } catch {}
  const weight = roleWeight(role);
  const gain = Math.round(audienceGain(metrics) * weight);
  if (gain) addAudience(db, work.guild_id, identityId, work.platform_code, gain, Number(metrics.chart?.score || 0) * weight);
  db.prepare(`
    UPDATE identities
    SET recognition = LEAST(100, recognition + ?), heat = LEAST(100, heat + ?)
    WHERE id = ?
  `).run(0.18 * weight, 0.12 * weight, identityId);
}

function updateCollaboratorCareer(db, workId, heatDelta = 0, affinityDelta = 0) {
  const rows = getCollaborators(db, workId);
  for (const row of rows) {
    const weight = roleWeight(row.role);
    db.prepare(`
      UPDATE identities
      SET heat = LEAST(100, GREATEST(0, heat + ?)),
          affinity = LEAST(100, GREATEST(0, affinity + ?))
      WHERE id = ?
    `).run(Number(heatDelta || 0) * weight, Number(affinityDelta || 0) * weight, row.identity_id);
  }
}

function addCollaboratorAudience(db, workId, platformCode, audienceAmount, score = 0) {
  for (const row of getCollaborators(db, workId)) {
    const weight = roleWeight(row.role);
    addAudience(db, null, row.identity_id, platformCode, Math.round(Number(audienceAmount || 0) * weight), Number(score || 0) * weight);
  }
}

module.exports = {
  COLLABORATOR_ROLES,
  roleLabel,
  roleWeight,
  getCollaborators,
  formatCollaborators,
  creditOpeningMetrics,
  updateCollaboratorCareer,
  addCollaboratorAudience,
};
