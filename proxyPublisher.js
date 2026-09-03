const { WebhookClient } = require('discord.js');
const db = require('./database');

function safeUsername(value) {
  const name = String(value || 'VERA Persona').trim().slice(0, 80);
  return /^clyde$/i.test(name) ? `${name} VORTEX` : name;
}

async function ensurePlatformWebhook(channel, platformCode) {
  const configured = db.prepare(`
    SELECT * FROM platform_channels WHERE guild_id = ? AND platform_code = ?
  `).get(channel.guildId, platformCode);
  if (!configured || configured.channel_id !== channel.id) {
    const error = new Error('The official platform channel is not configured.');
    error.code = 'PLATFORM_CHANNEL_MISSING';
    throw error;
  }

  if (configured.webhook_id && configured.webhook_token) {
    return new WebhookClient({ id: configured.webhook_id, token: configured.webhook_token });
  }

  const webhook = await channel.createWebhook({
    name: `${platformCode} • VERA Publisher`,
    reason: 'Publish VERA platform posts under persona stage and screen names',
  });
  db.prepare(`
    UPDATE platform_channels SET webhook_id = ?, webhook_token = ?, updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = ? AND platform_code = ?
  `).run(webhook.id, webhook.token, channel.guildId, platformCode);
  return webhook;
}

function linkedPersona(identityId, guildId) {
  return db.prepare(`
    SELECT tupper_name, tupper_avatar_url
    FROM tupper_links
    WHERE guild_id = ? AND identity_id = ? AND active = 1
    ORDER BY id DESC LIMIT 1
  `).get(guildId, identityId);
}

async function publishAsPersona({ channel, platformCode, identityId, creditedName, payload }) {
  const proxy = linkedPersona(identityId, channel.guildId);
  if (!proxy) {
    const error = new Error('This persona must link a Tupperbox proxy before publishing.');
    error.code = 'PERSONA_PROXY_MISSING';
    throw error;
  }
  const webhook = await ensurePlatformWebhook(channel, platformCode);
  return webhook.send({
    ...payload,
    username: safeUsername(creditedName),
    avatarURL: proxy.tupper_avatar_url || undefined,
    allowedMentions: { parse: [] },
  });
}

module.exports = { ensurePlatformWebhook, publishAsPersona };
