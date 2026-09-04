const db = require('./database');
const { parseRpMarkup } = require('./rpMarkup');
const { processRpBuzz } = require('./rpBuzz');

async function recordLinkedRpMessage(message) {
  if (!message.guildId || !message.webhookId || !message.content) return null;
  const link = db.prepare(`
    SELECT identity_id
    FROM tupper_links
    WHERE guild_id = ? AND webhook_id = ? AND LOWER(tupper_name) = LOWER(?) AND active = 1
    ORDER BY id DESC LIMIT 1
  `).get(message.guildId, message.webhookId, message.author.username);
  if (!link) return null;

  const parsed = parseRpMarkup(message.content);
  const saved = db.prepare(`
    INSERT OR IGNORE INTO rp_messages
      (guild_id, channel_id, message_id, identity_id, raw_content,
       audible_dialogue, actions_and_thoughts, narration)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    message.guildId,
    message.channelId,
    message.id,
    link.identity_id,
    message.content,
    JSON.stringify(parsed.dialogue),
    JSON.stringify(parsed.actionsAndThoughts),
    JSON.stringify(parsed.narration),
  );
  if (saved.changes) processRpBuzz({ message, speakerIdentityId: link.identity_id, parsed });
  return parsed;
}

module.exports = { parseRpMarkup, recordLinkedRpMessage };
