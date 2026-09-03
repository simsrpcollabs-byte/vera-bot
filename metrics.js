const promoMultipliers = {
  none: 0.72,
  light: 0.88,
  standard: 1,
  heavy: 1.34,
  saturation: 1.7,
};

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = hashString(seed);
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function between(random, minimum, maximum) {
  return minimum + ((maximum - minimum) * random());
}

function whole(value) {
  return Math.max(0, Math.round(value));
}

function compact(value) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function integer(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function rankFromImpact(impact, chartSize = 100) {
  return clamp(Math.round(68 / Math.max(impact, 0.45)), 1, chartSize);
}

function field(name, value, inline = true) {
  return { name, value: String(value), inline };
}

function generateOpeningMetrics({ workId, title, workType, platform, identity, promo }) {
  const random = seededRandom(`${workId}:${identity.id}:${platform.code}:${workType}:${title}`);
  const careerScore = (
    (Number(identity.recognition) * 0.45)
    + (Number(identity.heat) * 0.35)
    + (Number(identity.affinity) * 0.2)
  );
  const promoMultiplier = promoMultipliers[promo] || promoMultipliers.standard;
  const impact = (0.68 + (careerScore / 55)) * promoMultiplier * between(random, 0.84, 1.28);
  const sentiment = clamp(Math.round(68 + (Number(identity.affinity) * 0.22) + between(random, -4, 12)), 55, 98);

  if (platform.category === 'music') {
    if (workType === 'album' || workType === 'ep') {
      const baseStreams = workType === 'album' ? 7_200_000 : 3_600_000;
      const streams = whole(baseStreams * impact);
      const sales = whole((workType === 'album' ? 7_400 : 3_600) * impact * between(random, 0.82, 1.18));
      const units = whole((streams / 1250) + sales);
      const rank = rankFromImpact(impact * (workType === 'album' ? 1 : 0.82), 200);
      const audienceGain = whole(streams * between(random, 0.001, 0.002));
      return {
        title: 'PULSE OPENING WEEK',
        description: `**${title}** opens at **#${rank}** on the Vortex 200.`,
        accent: 0x2ddcff,
        fields: [
          field('On-demand streams', compact(streams)),
          field('Pure sales', integer(sales)),
          field('Equivalent units', integer(units)),
          field('Vortex 200 debut', `#${rank}`),
          field('Listener score', `${sentiment}%`),
          field('New PULSE listeners', `+${integer(audienceGain)}`),
        ],
        chart: { code: 'albums', name: 'Vortex 200', score: units, predictedRank: rank },
        raw: { streams, sales, units, sentiment },
        audienceGain,
      };
    }

    const streams = whole(1_250_000 * impact);
    const sales = whole(4_800 * impact * between(random, 0.8, 1.2));
    const radioAudience = whole(8_600_000 * impact * between(random, 0.65, 1.25));
    const chartPoints = whole((streams / 1600) + (sales * 2.8) + (radioAudience / 11000));
    const rank = rankFromImpact(impact, 100);
    const audienceGain = whole(streams * between(random, 0.0015, 0.0035));
    return {
      title: 'PULSE OPENING METRICS',
      description: `**${title}** debuts at **#${rank}** on the Vortex Hot 100.`,
      accent: 0x2ddcff,
      fields: [
        field('First-week streams', compact(streams)),
        field('Digital sales', integer(sales)),
        field('Radio audience', compact(radioAudience)),
        field('Chart points', integer(chartPoints)),
        field('Hot 100 debut', `#${rank}`),
        field('New PULSE listeners', `+${integer(audienceGain)}`),
      ],
      chart: { code: 'songs', name: 'Vortex Hot 100', score: chartPoints, predictedRank: rank },
      raw: { streams, sales, radioAudience, chartPoints },
      audienceGain,
    };
  }

  if (platform.category === 'television') {
    const live = whole(880_000 * impact);
    const sameDay = whole(live * between(random, 1.16, 1.42));
    const sevenDay = whole(live * between(random, 1.85, 2.7));
    const rating = clamp(live / 4_400_000, 0.03, 3.5).toFixed(2);
    const rank = clamp(Math.round(16 / Math.max(impact, 0.55)), 1, 25);
    return {
      title: `${platform.name.toUpperCase()} OPENING RATINGS`,
      description: `**${title}** ranks **#${rank}** among scripted VORTEX releases.`,
      accent: 0x8b63ff,
      fields: [
        field('Live viewers', compact(live)),
        field('Live + same day', compact(sameDay)),
        field('7-day viewers', compact(sevenDay)),
        field('18–49 rating', rating),
        field('Audience score', `${sentiment}%`),
      ],
      chart: { code: 'television', name: 'VORTEX Television', score: sevenDay + (Number(rating) * 1_000_000), predictedRank: rank },
      raw: { live, sameDay, sevenDay, rating: Number(rating), sentiment },
    };
  }

  if (platform.category === 'video') {
    const firstDay = whole(620_000 * impact);
    const sevenDay = whole(firstDay * between(random, 2.5, 4.8));
    const likes = whole(firstDay * between(random, 0.065, 0.13));
    const comments = whole(firstDay * between(random, 0.004, 0.012));
    const watchRate = clamp(Math.round(between(random, 42, 76) + (Number(identity.affinity) * 0.08)), 30, 92);
    const audienceGain = whole(firstDay * between(random, 0.006, 0.018));
    return {
      title: 'FRAME OPENING METRICS',
      description: `**${title}** is now live on FRAME.`,
      accent: 0x2ddcff,
      fields: [
        field('First 24 hours', compact(firstDay)),
        field('Projected 7-day views', compact(sevenDay)),
        field('Likes', compact(likes)),
        field('Comments', compact(comments)),
        field('Average viewed', `${watchRate}%`),
        field('New FRAME subscribers', `+${integer(audienceGain)}`),
      ],
      chart: { code: 'frame', name: 'FRAME Top Videos', score: sevenDay + (likes * 4) + (comments * 12) },
      raw: { firstDay, sevenDay, likes, comments, watchRate },
      audienceGain,
    };
  }

  if (platform.category === 'social-profile') {
    const reach = whole(230_000 * impact);
    const impressions = whole(reach * between(random, 1.18, 1.62));
    const flashes = whole(reach * between(random, 0.07, 0.16));
    const comments = whole(reach * between(random, 0.003, 0.011));
    const watchers = whole(reach * between(random, 0.004, 0.022));
    return {
      title: 'XPOSURE POST INSIGHTS',
      description: `**${title}** is now In Full View.`,
      accent: 0xff5edb,
      fields: [
        field('Accounts reached', compact(reach)),
        field('Impressions', compact(impressions)),
        field('Flashes', compact(flashes)),
        field('Comments', compact(comments)),
        field('New Watchers', compact(watchers)),
      ],
      chart: { code: 'exposure', name: 'Xposure Most Watched', score: reach + (flashes * 5) + (comments * 10) },
      raw: { reach, impressions, flashes, comments, watchers },
      socialGain: watchers,
      audienceGain: watchers,
    };
  }

  const views = whole(780_000 * impact);
  const likes = whole(views * between(random, 0.085, 0.18));
  const shares = whole(views * between(random, 0.009, 0.035));
  const completion = clamp(Math.round(between(random, 46, 83) + (Number(identity.affinity) * 0.06)), 35, 95);
  const watchers = whole(views * between(random, 0.004, 0.02));
  return {
    title: 'KNETIK OPENING METRICS',
    description: `**${title}** is moving on KNETIK.`,
    accent: 0xff7a67,
    fields: [
      field('First 24 hours', compact(views)),
      field('Likes', compact(likes)),
      field('Shares', compact(shares)),
      field('Completion rate', `${completion}%`),
      field('New Followers', compact(watchers)),
    ],
    chart: { code: 'knetik', name: 'KNETIK Trending', score: views + (likes * 4) + (shares * 12) },
    raw: { views, likes, shares, completion, watchers },
    socialGain: watchers,
    audienceGain: watchers,
  };
}

function applyPromotionBoost(originalMetrics, level, durationMinutes) {
  const metrics = JSON.parse(JSON.stringify(originalMetrics));
  const levelBonus = { light: 0.12, standard: 0.25, heavy: 0.5, saturation: 0.85 }[level] || 0.25;
  const durationFactor = durationMinutes <= 60 ? 0.35
    : durationMinutes <= 360 ? 0.65
      : durationMinutes <= 1440 ? 1 : durationMinutes <= 4320 ? 1.5 : 2.1;
  const multiplier = 1 + (levelBonus * durationFactor);
  const raw = metrics.raw || {};
  const beforeWatchers = Number(raw.watchers) || 0;
  const increase = (key) => { raw[key] = whole((Number(raw[key]) || 0) * multiplier); };
  const setField = (name, value) => {
    const target = metrics.fields?.find((item) => item.name === name);
    if (target) target.value = value;
  };

  if (metrics.chart?.code === 'exposure') {
    ['reach', 'impressions', 'flashes', 'comments', 'watchers'].forEach(increase);
    metrics.chart.score = raw.reach + (raw.flashes * 5) + (raw.comments * 10);
    setField('Accounts reached', compact(raw.reach));
    setField('Impressions', compact(raw.impressions));
    setField('Flashes', compact(raw.flashes));
    setField('Comments', compact(raw.comments));
    setField('New Watchers', compact(raw.watchers));
  } else if (metrics.chart?.code === 'knetik') {
    ['views', 'likes', 'shares', 'watchers'].forEach(increase);
    metrics.chart.score = raw.views + (raw.likes * 4) + (raw.shares * 12);
    setField('First 24 hours', compact(raw.views));
    setField('Likes', compact(raw.likes));
    setField('Shares', compact(raw.shares));
    setField('New Followers', compact(raw.watchers));
  }
  metrics.raw = raw;
  metrics.socialGain = raw.watchers;
  metrics.promotion = { level, durationMinutes, multiplier };
  return { metrics, watcherDelta: Math.max(0, (Number(raw.watchers) || 0) - beforeWatchers) };
}

module.exports = { generateOpeningMetrics, applyPromotionBoost, compact, integer };
