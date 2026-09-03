const { ChannelType, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { platformChoices } = require('./autocomplete');
const { isAdmin } = require('./access');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('platform')
    .setDescription('View VORTEX networks and platforms.')
    .addSubcommand((sub) => sub.setName('list').setDescription('List active platforms.'))
    .addSubcommand((sub) => sub
      .setName('channel')
      .setDescription('Choose the official Discord channel for a platform.')
      .addStringOption((opt) => opt.setName('platform').setDescription('Platform').setRequired(true).setAutocomplete(true))
      .addChannelOption((opt) => opt.setName('channel').setDescription('Official platform channel').setRequired(true).addChannelTypes(ChannelType.GuildText))),

  async autocomplete(interaction) {
    await interaction.respond(platformChoices(interaction));
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'channel') {
      if (!isAdmin(interaction)) return interaction.reply({ content: 'Only a VERA admin can configure platform channels.', ephemeral: true });
      const platformCode = interaction.options.getString('platform').toUpperCase();
      const platform = db.prepare(`SELECT * FROM platforms WHERE code = ? AND active = 1`).get(platformCode);
      if (!platform) return interaction.reply({ content: 'That platform was not found.', ephemeral: true });
      const channel = interaction.options.getChannel('channel');
      db.prepare(`
        INSERT INTO platform_channels (guild_id, platform_code, channel_id, configured_by, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(guild_id, platform_code) DO UPDATE SET channel_id = excluded.channel_id,
          configured_by = excluded.configured_by, updated_at = CURRENT_TIMESTAMP
      `).run(interaction.guildId, platformCode, channel.id, interaction.user.id);
      return interaction.reply({ content: `Official **${platform.name}** posts will now publish in ${channel}.`, ephemeral: true });
    }
    const rows = db.prepare(`
      SELECT p.name, p.category, p.description, pc.channel_id
      FROM platforms p LEFT JOIN platform_channels pc
        ON pc.platform_code = p.code AND pc.guild_id = ?
      WHERE p.active = 1 ORDER BY p.category, p.name
    `).all(interaction.guildId);
    const embed = new EmbedBuilder()
      .setColor(0x28c8ff)
      .setTitle('Registered Networks & Platforms')
      .setDescription(rows.map((row) => `**${row.name}** — ${row.description}${row.channel_id ? ` · <#${row.channel_id}>` : ''}`).join('\n'));
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
