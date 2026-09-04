const { EmbedBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./database');

const CULTURELINE_WEBHOOK_NAME = 'CultureLine • VERA Newsroom';
const CULTURELINE_AVATAR = path.join(__dirname, 'cultureline.png');

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

function receptionLine(title, positive, negative) {
  const total = positive + negative;
  if (!total) return `**${title}** is picking up attention across the VORTEX.`;
  const approval = positive / total;
  if (total >= 3 && approval >= 0.75) return `People are really loving **${title}**.`;
  if (total >= 3 && approval <= 0.35) return `Viewers are not feeling **${title}** — but they are definitely talking.`;
  if (total >= 3) return `**${title}** has the audience divided.`;
  return positive > negative
    ? `Early reactions to **${title}** are looking good.`
    : `**${title}** just got a less-than-glowing reaction.`;
}

function activityLine(work, action, identityName) {
  const phrases = {
    like: 'liked', flash: 'flashed', save: 'saved', share: 'shared', echo: 'echoed',
    comment: 'commented on', reply: 'replied to', review: 'reviewed', rate: 'rated',
  };
  const verb = phrases[action] || 'engaged with';
  return `**${identityName}** ${verb} **${work.title}**. The release is gaining activity on ${work.platform_name}.`;
}

async function publishCultureLine(interaction, { work, identity, action, sentiment = null }) {
  const destination = db.prepare(`SELECT channel_id FROM platform_channels WHERE guild_id = ? AND platform_code = 'ECHO'`)
    .get(interaction.guildId);
  if (!destination) return null;
  const channel = await interaction.client.channels.fetch(destination.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return null;

  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN sentiment = 1 THEN 1 ELSE 0 END) AS positive,
      SUM(CASE WHEN sentiment = -1 THEN 1 ELSE 0 END) AS negative,
      COUNT(*) AS activity
    FROM content_engagements WHERE guild_id = ? AND work_id = ?
  `).get(interaction.guildId, work.id);
  const positive = Number(totals?.positive || 0);
  const negative = Number(totals?.negative || 0);
  const description = sentiment === null
    ? activityLine(work, action, identity.civilian_name)
    : receptionLine(work.title, positive, negative);
  const reaction = sentiment === 1 ? '👍 Positive' : sentiment === -1 ? '👎 Negative' : null;

  const webhook = await ensureCultureLineWebhook(channel);
  return webhook.send({
    username: 'CultureLine ✓',
    allowedMentions: { parse: [] },
    embeds: [new EmbedBuilder()
      .setColor(0xf04f8b)
      .setTitle('CULTURELINE // CULTURE WATCH')
      .setDescription(description)
      .addFields(
        { name: 'Now buzzing', value: work.title, inline: true },
        { name: 'Platform', value: work.platform_name, inline: true },
        ...(reaction ? [{ name: 'Latest reaction', value: reaction, inline: true }] : []),
        { name: 'Audience pulse', value: `${positive} 👍 · ${negative} 👎 · ${Number(totals?.activity || 0)} total actions`, inline: false },
      )
      .setFooter({ text: 'CultureLine ✓ · Verified VORTEX publication · What’s moving culture right now' })
      .setTimestamp()],
  });
}

module.exports = { ensureCultureLineWebhook, publishCultureLine };
