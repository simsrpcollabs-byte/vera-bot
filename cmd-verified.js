const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { identityChoices } = require('./autocomplete');
const { ownsIdentity } = require('./access');
const { verifiedName, verificationLabel } = require('./display');

function isServerOwner(interaction) {
  return interaction.guild?.ownerId === interaction.user.id;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verified')
    .setDescription('Request and manage VERA identity verification.')
    .addSubcommand((sub) => sub
      .setName('request')
      .setDescription('Request verification for one of your approved identities.')
      .addStringOption((opt) => opt.setName('identity').setDescription('Identity to verify').setRequired(true).setAutocomplete(true)))
    .addSubcommand((sub) => sub
      .setName('status')
      .setDescription('View an identity’s verification status.')
      .addStringOption((opt) => opt.setName('identity').setDescription('Identity').setRequired(true).setAutocomplete(true)))
    .addSubcommand((sub) => sub
      .setName('approve')
      .setDescription('Approve a verification request (server owner only).')
      .addIntegerOption((opt) => opt.setName('request_id').setDescription('Verification request ID').setRequired(true).setMinValue(1)))
    .addSubcommand((sub) => sub
      .setName('reject')
      .setDescription('Reject a verification request (server owner only).')
      .addIntegerOption((opt) => opt.setName('request_id').setDescription('Verification request ID').setRequired(true).setMinValue(1))
      .addStringOption((opt) => opt.setName('reason').setDescription('Optional reason').setMaxLength(300)))
    .addSubcommand((sub) => sub
      .setName('revoke')
      .setDescription('Remove verification from an identity (server owner only).')
      .addStringOption((opt) => opt.setName('identity').setDescription('Verified identity').setRequired(true).setAutocomplete(true)))
    .addSubcommand((sub) => sub
      .setName('queue')
      .setDescription('View pending requests (server owner only).')),

  async autocomplete(interaction) {
    await interaction.respond(identityChoices(interaction, true));
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (['approve', 'reject', 'revoke', 'queue'].includes(subcommand) && !isServerOwner(interaction)) {
      return interaction.reply({ content: 'Only the Discord server owner can make VERA verification decisions.', ephemeral: true });
    }

    if (subcommand === 'queue') {
      const rows = db.prepare(`
        SELECT vr.id, i.civilian_name, vr.created_at
        FROM verification_requests vr JOIN identities i ON i.id = vr.identity_id
        WHERE vr.guild_id = ? AND vr.status = 'pending' ORDER BY vr.created_at LIMIT 25
      `).all(interaction.guildId);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x2ddcff).setTitle('VERA verification queue')
          .setDescription(rows.length ? rows.map((row) => `**#${row.id}** — ${row.civilian_name}`).join('\n') : 'No verification requests are waiting.')],
        ephemeral: true,
      });
    }

    if (subcommand === 'approve' || subcommand === 'reject') {
      const requestId = interaction.options.getInteger('request_id');
      const request = db.prepare(`
        SELECT vr.*, i.civilian_name FROM verification_requests vr
        JOIN identities i ON i.id = vr.identity_id
        WHERE vr.guild_id = ? AND vr.id = ? AND vr.status = 'pending'
      `).get(interaction.guildId, requestId);
      if (!request) return interaction.reply({ content: 'That pending verification request was not found.', ephemeral: true });
      const status = subcommand === 'approve' ? 'approved' : 'rejected';
      const decide = db.transaction(() => {
        db.prepare(`UPDATE verification_requests SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(status, interaction.user.id, requestId);
        if (status === 'approved') {
          db.prepare(`UPDATE identities SET verified = 1, verified_by = ?, verified_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(interaction.user.id, request.identity_id);
        }
      });
      decide();
      const reason = interaction.options.getString('reason');
      return interaction.reply({ content: `Verification request #${requestId} for **${request.civilian_name}** was **${status}**.${reason ? ` ${reason}` : ''}`, ephemeral: true });
    }

    const identityId = Number(interaction.options.getString('identity'));
    const { identity, allowed } = ownsIdentity(db, interaction.guildId, identityId, interaction.user.id);
    if (!identity || identity.status !== 'approved') return interaction.reply({ content: 'That approved identity was not found.', ephemeral: true });

    if (subcommand === 'status') {
      const pending = db.prepare(`SELECT id FROM verification_requests WHERE guild_id = ? AND identity_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`)
        .get(interaction.guildId, identityId);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(identity.verified ? 0x2ddcff : 0x777777)
          .setTitle(verifiedName(identity.civilian_name, identity.verified))
          .setDescription(pending ? `Verification request #${pending.id} is awaiting the server owner.` : verificationLabel(identity.verified))],
        ephemeral: true,
      });
    }

    if (subcommand === 'revoke') {
      db.prepare(`UPDATE identities SET verified = 0, verified_by = NULL, verified_at = NULL WHERE id = ?`).run(identityId);
      return interaction.reply({ content: `Verification was removed from **${identity.civilian_name}**.`, ephemeral: true });
    }

    if (!allowed) return interaction.reply({ content: 'Only the identity owner can request verification.', ephemeral: true });
    if (identity.verified) return interaction.reply({ content: `**${identity.civilian_name}** is already verified.`, ephemeral: true });
    const pending = db.prepare(`SELECT id FROM verification_requests WHERE guild_id = ? AND identity_id = ? AND status = 'pending'`).get(interaction.guildId, identityId);
    if (pending) return interaction.reply({ content: `Verification request #${pending.id} is already waiting for review.`, ephemeral: true });
    const result = db.prepare(`INSERT INTO verification_requests (guild_id, identity_id, requested_by) VALUES (?, ?, ?)`)
      .run(interaction.guildId, identityId, interaction.user.id);
    return interaction.reply({ content: `Verification request #${result.lastInsertRowid} was submitted for **${identity.civilian_name}**. Only the server owner can approve it.`, ephemeral: true });
  },
};
