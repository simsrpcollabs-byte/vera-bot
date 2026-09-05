const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { isAdmin } = require('./access');
const { identityChoices, platformChoices } = require('./autocomplete');
const { audienceLabel } = require('./audience');

const categories = [
  { name: 'Label', value: 'label' },
];

const tableMap = {
  label: { table: 'labels', name: 'name' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Approve or reject record-label registrations.')
    .addSubcommand((sub) => sub
      .setName('queue')
      .setDescription('View pending registrations.')
      .addStringOption((opt) => opt.setName('category').setDescription('Queue type').setRequired(true).addChoices(...categories)))
    .addSubcommand((sub) => sub
      .setName('approve')
      .setDescription('Approve a pending registration.')
      .addStringOption((opt) => opt.setName('category').setDescription('Registration type').setRequired(true).addChoices(...categories))
      .addIntegerOption((opt) => opt.setName('id').setDescription('Registration ID').setRequired(true).setMinValue(1)))
    .addSubcommand((sub) => sub
      .setName('reject')
      .setDescription('Reject a pending registration.')
      .addStringOption((opt) => opt.setName('category').setDescription('Registration type').setRequired(true).addChoices(...categories))
      .addIntegerOption((opt) => opt.setName('id').setDescription('Registration ID').setRequired(true).setMinValue(1))
      .addStringOption((opt) => opt.setName('reason').setDescription('Reason for rejection').setRequired(true).setMaxLength(300)))
    .addSubcommand((sub) => sub
      .setName('persona-audience')
      .setDescription('Set any persona’s follower or listener count (server owner).')
      .addStringOption((opt) => opt.setName('persona').setDescription('Select any persona').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('platform').setDescription('Select a platform').setRequired(true).setAutocomplete(true))
      .addIntegerOption((opt) => opt.setName('count').setDescription('New audience count').setRequired(true).setMinValue(0).setMaxValue(2000000000)))
    .addSubcommand((sub) => sub
      .setName('persona-verification')
      .setDescription('Set any persona’s verification status (server owner).')
      .addStringOption((opt) => opt.setName('persona').setDescription('Select any persona').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('status').setDescription('Verification status').setRequired(true).addChoices(
        { name: 'Verified', value: 'verified' }, { name: 'Unverified', value: 'unverified' },
      ))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'persona') return interaction.respond(identityChoices(interaction, true, false));
    return interaction.respond(platformChoices(interaction));
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (['persona-audience', 'persona-verification'].includes(subcommand)) {
      if (interaction.guild?.ownerId !== interaction.user.id) {
        return interaction.reply({ content: 'Only the Discord server owner can edit persona audiences or verification.', ephemeral: true });
      }
      const identityId = Number(interaction.options.getString('persona'));
      const identity = db.prepare(`SELECT * FROM identities WHERE id = ? AND status = 'approved'`)
        .get(identityId);
      if (!identity) return interaction.reply({ content: 'That persona was not found.', ephemeral: true });

      if (subcommand === 'persona-audience') {
        const platformCode = interaction.options.getString('platform').toUpperCase();
        const platform = db.prepare(`SELECT * FROM platforms WHERE code = ? AND active = 1`).get(platformCode);
        if (!platform) return interaction.reply({ content: 'That platform was not found.', ephemeral: true });
        const count = interaction.options.getInteger('count');
        db.prepare(`
          INSERT INTO social_profiles (guild_id, identity_id, platform_code, followers, activity_score, updated_at)
          VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
          ON CONFLICT(guild_id, identity_id, platform_code) DO UPDATE SET
            followers = excluded.followers, updated_at = CURRENT_TIMESTAMP
        `).run(identity.guild_id, identityId, platformCode, count);
        return interaction.reply({
          content: `Set **${identity.civilian_name}** to **${count.toLocaleString()} ${audienceLabel(platformCode)}** on **${platform.name}**.`,
          ephemeral: true,
        });
      }

      const verified = interaction.options.getString('status') === 'verified';
      db.prepare(`
        UPDATE identities SET verified = ?, verified_by = ?, verified_at = ? WHERE id = ?
      `).run(verified ? 1 : 0, verified ? interaction.user.id : null, verified ? new Date().toISOString() : null, identityId);
      return interaction.reply({ content: `**${identity.civilian_name}** is now **${verified ? 'verified' : 'unverified'}**.`, ephemeral: true });
    }

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: 'You need the configured VERA admin role or Manage Server permission.', ephemeral: true });
    }

    const category = interaction.options.getString('category');
    const config = tableMap[category];

    if (subcommand === 'queue') {
      const rows = db.prepare(`
        SELECT id, ${config.name} AS display_name, created_at
        FROM ${config.table}
        WHERE guild_id = ? AND status = 'pending'
        ORDER BY created_at LIMIT 20
      `).all(interaction.guildId);
      const embed = new EmbedBuilder()
        .setColor(0xffc857)
        .setTitle(`Pending ${category} registrations`)
        .setDescription(rows.length
          ? rows.map((row) => `#${row.id} — **${row.display_name}**`).join('\n')
          : 'The queue is empty.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const id = interaction.options.getInteger('id');
    const row = db.prepare(`
      SELECT id, status FROM ${config.table} WHERE guild_id = ? AND id = ?
    `).get(interaction.guildId, id);
    if (!row) return interaction.reply({ content: `That ${category} was not found.`, ephemeral: true });

    const nextStatus = subcommand === 'approve' ? 'approved' : 'rejected';
    db.prepare(`
      UPDATE ${config.table}
      SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE guild_id = ? AND id = ?
    `).run(nextStatus, interaction.user.id, interaction.guildId, id);

    const reason = interaction.options.getString('reason');
    return interaction.reply({
      content: `${category} #${id} is now **${nextStatus}**.${reason ? ` Reason: ${reason}` : ''}`,
      ephemeral: true,
    });
  },
};
