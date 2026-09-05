const { EmbedBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./database');

const CULTURELINE_WEBHOOK_NAME = 'CultureLine • VERA Newsroom';
const CULTURELINE_AVATAR = path.join(__dirname, 'cultureline.png');
const MILESTONES = [3, 5, 10, 25, 50, 100, 250, 500, 1000];

async function ensureCultureLineWebhook(channel) {
  const webhooks = await channel.fetchWebhooks();
  const existing = webhooks.find((webhook) => webhook.name === CULTURELINE_WEBHOOK_NAME && webhook.owner?.id === channel.client.user.id);
  if (existing) return existing;
  return channel.createWebhook({
    name: CULTURELINE_WEBHOOK_NAME,
    avatar: fs.readFileSync(CULTURELINE_AVATAR),
    reason: 'Publish CultureLine entertainment updates to ECHO',
  });
}

function claimStory(guildId, eventKey, eventType, workId = null, createdBy = 'VERA') {
  return Boolean(db.prepare(`
    INSERT OR IGNORE INTO cultureline_events
      (guild_id, work_id, event_key, event_type, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, workId, eventKey, eventType, createdBy).changes);
}

async function echoChannel(client, guildId) {
  const destination = db.prepare(`SELECT channel_id FROM platform_channels WHERE guild_id = ? AND platform_code = 'ECHO'`).get(guildId);
  if (!destination) return null;
  const channel = await client.channels.fetch(destination.channel_id).catch(() => null);
  return channel?.isTextBased() ? channel : null;
}

async function publishStory({ client, guildId, headline, description, fields = [], color = 0xed1c24 }) {
  const channel = await echoChannel(client, guildId);
  if (!channel) return null;
  const webhook = await ensureCultureLineWebhook(channel);
  return webhook.send({
    username: 'CultureLine ✓',
    allowedMentions: { parse: [] },
    embeds: [new EmbedBuilder()
      .setColor(color)
      .setTitle(`CULTURELINE // ${headline}`)
      .setDescription(description)
      .addFields(fields)
      .setFooter({ text: 'CultureLine ✓ · Verified VORTEX publication · Pop culture. Real talk. All access.' })
      .setTimestamp()],
  });
}

function workDetails(guildId, workId) {
  return db.prepare(`
    SELECT w.*, p.name AS platform_name, i.civilian_name, i.verified
    FROM works w JOIN platforms p ON p.code = w.platform_code
    JOIN identities i ON i.id = w.identity_id
    WHERE w.id = ? AND w.status = 'released'
  `).get(workId);
}

async function publishReleaseStory({ client, guildId, workId, createdBy }) {
  const work = workDetails(guildId, workId);
  if (!work || !claimStory(guildId, `release:${workId}`, 'release', workId, createdBy)) return null;
  return publishStory({
    client, guildId, headline: 'JUST RELEASED',
    description: `**${work.credited_name}${work.verified ? ' ✓' : ''}** just released **${work.title}** on ${work.platform_name}.`,
    fields: [
      { name: 'Release', value: work.title, inline: true },
      { name: 'Type', value: String(work.work_type).replaceAll('_', ' '), inline: true },
      { name: 'Where to find it', value: work.platform_name, inline: true },
    ],
  });
}

function reachedMilestone(value) {
  return [...MILESTONES].reverse().find((milestone) => value >= milestone) || null;
}

async function maybePublishTraction({ client, guildId, workId }) {
  const work = workDetails(guildId, workId);
  if (!work) return null;
  const totals = db.prepare(`
    SELECT COUNT(*) AS activity, COUNT(DISTINCT identity_id) AS personas,
      SUM(CASE WHEN sentiment = 1 THEN 1 ELSE 0 END) AS positive,
      SUM(CASE WHEN sentiment = -1 THEN 1 ELSE 0 END) AS negative
    FROM content_engagements WHERE work_id = ?
  `).get(workId);
  const activity = Number(totals.activity || 0);
  const personas = Number(totals.personas || 0);
  const positive = Number(totals.positive || 0);
  const negative = Number(totals.negative || 0);
  const reactions = positive + negative;
  const reactionMilestone = reachedMilestone(reactions);
  const activityMilestone = reachedMilestone(activity);

  if (reactionMilestone) {
    const negativeShare = negative / reactions;
    const positiveShare = positive / reactions;
    const mood = negativeShare >= 0.67 ? 'negative' : positiveShare >= 0.67 ? 'positive' : 'mixed';
    if (claimStory(guildId, `reception:${workId}:${reactionMilestone}:${mood}`, `${mood}_reception`, workId)) {
      if (activityMilestone) claimStory(guildId, `traction:${workId}:${activityMilestone}`, 'traction', workId);
      const description = mood === 'positive'
        ? `People are really loving **${work.title}**. Positive reactions are driving the conversation across the VORTEX.`
        : mood === 'negative'
          ? `**${work.title}** is attracting negative attention. The audience may not love it, but they are definitely talking.`
          : `The audience is split on **${work.title}**—and the debate is giving it even more momentum.`;
      return publishStory({
        client, guildId, headline: mood === 'negative' ? 'UNDER FIRE' : mood === 'mixed' ? 'AUDIENCE DIVIDED' : 'CATCHING FIRE',
        description,
        fields: [
          { name: 'Audience pulse', value: `${positive} 👍 · ${negative} 👎`, inline: true },
          { name: 'Community reach', value: `${personas} persona${personas === 1 ? '' : 's'} engaged`, inline: true },
          { name: 'Platform', value: work.platform_name, inline: true },
        ],
        color: mood === 'positive' ? 0x35d07f : mood === 'negative' ? 0xed1c24 : 0xf5b942,
      });
    }
  }

  if (activityMilestone && claimStory(guildId, `traction:${workId}:${activityMilestone}`, 'traction', workId)) {
    return publishStory({
      client, guildId, headline: 'GAINING TRACTION',
      description: `**${work.title}** is picking up momentum on ${work.platform_name}. People are watching, reacting, and joining the conversation.`,
      fields: [
        { name: 'Activity milestone', value: `${activityMilestone}+ community actions`, inline: true },
        { name: 'Community reach', value: `${personas} persona${personas === 1 ? '' : 's'}`, inline: true },
        { name: 'Credited to', value: work.credited_name, inline: true },
      ],
    });
  }
  return null;
}

async function maybePublishRpAttention({ client, guildId, workId }) {
  const work = workDetails(guildId, workId);
  if (!work) return null;
  const buzz = db.prepare(`SELECT * FROM work_buzz WHERE work_id = ?`).get(workId);
  if (!buzz) return null;
  const negative = Number(buzz.negative_mentions || 0);
  const positive = Number(buzz.positive_mentions || 0);
  const mentions = Number(buzz.mentions || 0);
  const negativeMilestone = reachedMilestone(negative);
  const mentionMilestone = reachedMilestone(mentions);
  if (negativeMilestone && negative > positive && claimStory(guildId, `rp-negative:${workId}:${negativeMilestone}`, 'negative_attention', workId)) {
    return publishStory({
      client, guildId, headline: 'PUBLIC REACTION',
      description: `The conversation around **${work.title}** is turning negative. Criticism is spreading beyond the original audience.`,
      fields: [
        { name: 'Public discussion', value: `${mentions} counted mentions`, inline: true },
        { name: 'Negative mentions', value: String(negative), inline: true },
        { name: 'Platform', value: work.platform_name, inline: true },
      ], color: 0xed1c24,
    });
  }
  if (mentionMilestone && claimStory(guildId, `rp-buzz:${workId}:${mentionMilestone}`, 'rp_traction', workId)) {
    return publishStory({
      client, guildId, headline: 'EVERYBODY’S TALKING',
      description: `**${work.title}** has broken out of the feed and into the public conversation.`,
      fields: [
        { name: 'Public discussion', value: `${mentions} counted mentions`, inline: true },
        { name: 'Credited to', value: work.credited_name, inline: true },
        { name: 'Platform', value: work.platform_name, inline: true },
      ],
    });
  }
  return null;
}

module.exports = { ensureCultureLineWebhook, maybePublishRpAttention, maybePublishTraction, publishReleaseStory, publishStory };
