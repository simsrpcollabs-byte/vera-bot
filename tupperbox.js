const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const db = require('./database');
const { isAdmin } = require('./access');

async function captureTupperMessage(message) {
  if (!message.guildId || !message.webhookId || message.applicationId) return;

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
  const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 256 });
  db.prepare(`
    UPDATE tupper_link_requests
    SET status = 'captured', tupper_name = ?, tupper_avatar_url = ?,
        webhook_id = ?, captured_message_id = ?
    WHERE id = ?
  `).run(message.author.username, avatarUrl, message.webhookId, message.id, request.id);

  const embed = new EmbedBuilder()
    .setColor(0xffc857)
    .setTitle('Tupperbox link needs verification')
    .setDescription(`Confirm that **${message.author.username}** belongs to <@${request.requested_by}> and should link to **${request.civilian_name}**.`)
    .setThumbnail(avatarUrl)
    .setFooter({ text: `Link request #${request.id}` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tupper:approve:${request.id}`).setLabel('Approve link').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tupper:reject:${request.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger),
  );
  await message.channel.send({ embeds: [embed], components: [row] });
}

async function handleTupperButton(interaction) {
  if (!interaction.customId.startsWith('tupper:')) return false;
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: 'Only a VERA admin can verify Tupperbox links.', ephemeral: true });
    return true;
  }

  const [, action, rawId] = interaction.customId.split(':');
  const requestId = Number(rawId);
  const request = db.prepare(`SELECT * FROM tupper_link_requests WHERE id = ?`).get(requestId);
  if (!request || request.guild_id !== interaction.guildId || request.status !== 'captured') {
    await interaction.reply({ content: 'This link request is missing or has already been reviewed.', ephemeral: true });
    return true;
  }

  if (action === 'approve') {
    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO tupper_links
          (guild_id, identity_id, tupper_name, tupper_avatar_url, webhook_id, approved_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        request.guild_id,
        request.identity_id,
        request.tupper_name,
        request.tupper_avatar_url,
        request.webhook_id,
        interaction.user.id,
      );
      db.prepare(`
        UPDATE tupper_link_requests
        SET status = 'approved', approved_by = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(interaction.user.id, requestId);
    });
    transaction();
    await interaction.update({ content: `Approved Tupperbox link #${requestId}.`, embeds: [], components: [] });
  } else {
    db.prepare(`
      UPDATE tupper_link_requests
      SET status = 'rejected', approved_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(interaction.user.id, requestId);
    await interaction.update({ content: `Rejected Tupperbox link #${requestId}.`, embeds: [], components: [] });
  }
  return true;
}

module.exports = { captureTupperMessage, handleTupperButton };
