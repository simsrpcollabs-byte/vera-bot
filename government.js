function clamp(value) {
  return Math.min(100, Math.max(0, Number(value || 0)));
}

function applyGovernmentImpact(db, identityId, {
  approval = 0, trust = 0, favorability = 0, recognition = 0,
  attention = 0, controversy = 0,
} = {}) {
  const persona = db.prepare(`SELECT industry FROM identities WHERE id = ?`).get(identityId);
  if (persona?.industry !== 'government') return false;
  db.prepare(`INSERT INTO government_profiles (identity_id) VALUES (?) ON CONFLICT(identity_id) DO NOTHING`).run(identityId);
  const current = db.prepare(`SELECT * FROM government_profiles WHERE identity_id = ?`).get(identityId);
  const nextApproval = clamp(Number(current.approval) + approval);
  const nextDisapproval = clamp(Number(current.disapproval) - approval);
  const total = nextApproval + nextDisapproval;
  const scale = total > 100 ? 100 / total : 1;
  const finalApproval = nextApproval * scale;
  const finalDisapproval = nextDisapproval * scale;
  db.prepare(`
    UPDATE government_profiles SET
      approval = ?, disapproval = ?, undecided = ?,
      public_trust = ?, favorability = ?, name_recognition = ?,
      media_attention = ?, controversy = ?, updated_at = CURRENT_TIMESTAMP
    WHERE identity_id = ?
  `).run(
    finalApproval, finalDisapproval, 100 - finalApproval - finalDisapproval,
    clamp(Number(current.public_trust) + trust),
    clamp(Number(current.favorability) + favorability),
    clamp(Number(current.name_recognition) + recognition),
    clamp(Number(current.media_attention) + attention),
    clamp(Number(current.controversy) + controversy), identityId,
  );
  return true;
}

function engagementImpact(db, identityId, action, sentiment = 0, rating = null) {
  let opinion = sentiment * 0.12;
  if (rating) opinion = (Number(rating) - 3) * 0.08;
  if (!sentiment && ['like', 'flash', 'save', 'share', 'echo'].includes(action)) opinion = 0.04;
  return applyGovernmentImpact(db, identityId, {
    approval: opinion,
    favorability: opinion * 0.8,
    recognition: 0.03,
    attention: ['share', 'echo', 'comment', 'reply', 'review'].includes(action) ? 0.08 : 0.03,
    controversy: sentiment < 0 ? 0.05 : 0,
  });
}

module.exports = { applyGovernmentImpact, engagementImpact };
