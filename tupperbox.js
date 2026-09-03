const db = require('./database');

async function captureTupperMessage(message) {
  // Tupperbox proxies are webhook messages. Newer Tupperbox messages can also
  // include an applicationId, so applicationId must not be used to exclude them.
  if (!message.guildId || !message.webhookId) return;

  // Never treat one of VERA's own platform-publishing webhooks as a Tupper.
  const veraPublisher = db.prepare(`
    SELECT platform_code FROM platform_channels
    WHERE guild_id = ? AND webhook_id = ? LIMIT 1
  `).get(message.guildId, message.webhookId);
  if (veraPublisher) return;

  // Keep the linked proxy's current display name and avatar in sync. VERA
  // publishes through its own webhook, but mirrors the real linked Tupper.
  const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 256 });
  const linkedProxy = db.prepare(`
    SELECT id FROM tupper_links
    WHERE guild_id = ? AND webhook_id = ? AND LOWER(tupper_name) = LOWER(?) AND active = 1
    ORDER BY id DESC LIMIT 1
  `).get(message.guildId, message.webhookId, message.author.username);
  if (linkedProxy) {
    db.prepare(`
      UPDATE tupper_links SET tupper_name = ?, tupper_avatar_url = ? WHERE id = ?
    `).run(message.author.username, avatarUrl, linkedProxy.id);
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE tupper_link_requests SET status = 'expired'
    WHERE status = 'awaiting_message' AND expires_at <= ?
  `).run(now);

  const pending = db.prepare(`
    SELECT r.*, i.civilian_name
    FROM tupper_link_requests r
    JOIN identities i ON i.id = r.identity_id
    WHERE r.guild_id = ? AND r.channel_id = ?
      AND r.status = 'awaiting_message' AND r.expires_at > ?
    ORDER BY r.created_at DESC
  `).all(message.guildId, message.channelId, now);

  if (pending.length !== 1) return;
  const request = pending[0];
  const transaction = db.transaction(() => {
    // Relinking the same proxy replaces its previous active link instead of
    // leaving two identities attached to one Tupperbox persona.
    db.prepare(`
      UPDATE tupper_links SET active = 0
      WHERE guild_id = ? AND webhook_id = ? AND LOWER(tupper_name) = LOWER(?)
    `).run(message.guildId, message.webhookId, message.author.username);

    db.prepare(`
      INSERT INTO tupper_links
        (guild_id, identity_id, tupper_name, tupper_avatar_url, webhook_id, approved_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      request.guild_id,
      request.identity_id,
      message.author.username,
      avatarUrl,
      message.webhookId,
      request.requested_by,
    );

    db.prepare(`
      UPDATE tupper_link_requests
      SET status = 'linked', tupper_name = ?, tupper_avatar_url = ?,
          webhook_id = ?, captured_message_id = ?, approved_by = ?,
          reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      message.author.username,
      avatarUrl,
      message.webhookId,
      message.id,
      request.requested_by,
      request.id,
    );
  });
  transaction();

  await message.channel.send({
    content: `✅ <@${request.requested_by}> linked **${message.author.username}** to **${request.civilian_name}**. VERA will now recognize this Tupper automatically.`,
    allowedMentions: { users: [request.requested_by] },
  });
}

async function handleTupperButton(interaction) {
  // Kept so old approval buttons fail gracefully after this update.
  if (!interaction.customId.startsWith('tupper:')) return false;
  await interaction.reply({
    content: 'Tupper links are now activated automatically. Start a fresh link with `/persona link-tupper`.',
    ephemeral: true,
  });
  return true;
}

module.exports = { captureTupperMessage, handleTupperButton };
