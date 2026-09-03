const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { isAdmin } = require('./access');

const categories = [
  { name: 'Identity', value: 'identity' },
  { name: 'Label', value: 'label' },
];

const tableMap = {
  identity: { table: 'identities', name: 'civilian_name' },
  label: { table: 'labels', name: 'name' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Approve or reject VERA registrations.')
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
      .addStringOption((opt) => opt.setName('reason').setDescription('Reason for rejection').setRequired(true).setMaxLength(300))),

  async execute(interaction) {
    if (!isAdmin(interaction)) {
      return interaction.reply({ content: 'You need the configured VERA admin role or Manage Server permission.', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();
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
