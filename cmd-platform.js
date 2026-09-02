const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('platform')
    .setDescription('View VORTEX networks and platforms.')
    .addSubcommand((sub) => sub.setName('list').setDescription('List active platforms.')),
  async execute(interaction) {
    const rows = db.prepare(`
      SELECT name, category, description FROM platforms WHERE active = 1 ORDER BY category, name
    `).all();
    const embed = new EmbedBuilder()
      .setColor(0x28c8ff)
      .setTitle('Registered Networks & Platforms')
      .setDescription(rows.map((row) => `**${row.name}** — ${row.description}`).join('\n'));
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
