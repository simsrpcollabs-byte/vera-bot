const INDUSTRIES = [
  ['Civilian / General', 'general'],
  ['Acting', 'acting'],
  ['Music', 'music'],
  ['Film & Television Production', 'film_tv'],
  ['Content Creation / Influencing', 'creator'],
  ['Modeling / Fashion', 'fashion'],
  ['Dance', 'dance'],
  ['Sports', 'sports'],
  ['Business / Entrepreneurship', 'business'],
  ['Journalism / Media', 'media'],
  ['Government / Politics', 'government'],
  ['Education', 'education'],
  ['Healthcare', 'healthcare'],
  ['Culinary / Hospitality', 'hospitality'],
  ['Visual Arts / Writing', 'arts'],
  ['Other', 'other'],
];

const CAREERS = {
  general: ['Civilian', 'Student', 'Retired', 'Unspecified'],
  acting: ['Actor', 'Voice actor', 'Theatre performer', 'Child actor'],
  music: ['Recording artist', 'Singer', 'Rapper', 'Songwriter', 'Producer', 'DJ', 'Musician'],
  film_tv: ['Director', 'Producer', 'Screenwriter', 'Showrunner', 'Cinematographer', 'Editor', 'Crew member'],
  creator: ['Influencer', 'Content creator', 'Streamer', 'Podcaster', 'Digital personality'],
  fashion: ['Model', 'Designer', 'Stylist', 'Creative director', 'Beauty professional'],
  dance: ['Dancer', 'Choreographer', 'Dance instructor'],
  sports: ['Athlete', 'Coach', 'Sports executive', 'Sports personality'],
  business: ['Founder', 'Executive', 'Entrepreneur', 'Investor', 'Business professional'],
  media: ['Journalist', 'Reporter', 'Host', 'Editor', 'Photographer', 'Media executive'],
  government: ['Elected official', 'Political candidate', 'Appointed official', 'Government employee', 'Diplomat', 'Political staff', 'Activist / organizer', 'First family', 'Political commentator'],
  education: ['Student', 'Teacher', 'Professor', 'Administrator', 'Education professional'],
  healthcare: ['Doctor', 'Nurse', 'Therapist', 'Healthcare professional'],
  hospitality: ['Chef', 'Restaurateur', 'Hospitality executive', 'Hospitality professional'],
  arts: ['Author', 'Writer', 'Visual artist', 'Photographer', 'Designer'],
  other: ['Other'],
};

const STATUS_LABELS = { civilian: 'Civilian', emerging: 'Emerging', public_figure: 'Public Figure' };
const INDUSTRY_LABELS = Object.fromEntries(INDUSTRIES.map(([label, value]) => [value, label]));

function careerChoices(industry, search = '') {
  const needle = String(search).toLowerCase();
  return (CAREERS[industry] || CAREERS.other)
    .filter((career) => career.toLowerCase().includes(needle))
    .slice(0, 25)
    .map((career) => ({ name: career, value: career.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') }));
}

function careerLabel(value) {
  return String(value || 'unspecified').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function reachMultiplier(identity = {}) {
  const status = identity.public_status || 'civilian';
  if (status === 'public_figure') return Number(identity.verified) ? 1.15 : 1;
  if (status === 'emerging') return 0.4;
  return 0.08;
}

function evaluatePublicStatus(db, identityId) {
  const identity = db.prepare(`SELECT id, public_status, public_status_locked, recognition FROM identities WHERE id = ?`).get(identityId);
  if (!identity || Number(identity.public_status_locked)) return identity?.public_status || 'civilian';
  const audience = db.prepare(`SELECT COALESCE(SUM(followers), 0) AS total FROM social_profiles WHERE identity_id = ?`).get(identityId);
  const total = Number(audience?.total || 0);
  const recognition = Number(identity.recognition || 0);
  const next = total >= 25000 || recognition >= 55 ? 'public_figure'
    : total >= 1000 || recognition >= 15 ? 'emerging' : 'civilian';
  if (next !== identity.public_status) db.prepare(`UPDATE identities SET public_status = ? WHERE id = ?`).run(next, identityId);
  return next;
}

module.exports = {
  CAREERS, INDUSTRIES, INDUSTRY_LABELS, STATUS_LABELS,
  careerChoices, careerLabel, evaluatePublicStatus, reachMultiplier,
};
