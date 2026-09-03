const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vera')
    .setDescription('Learn what VERA tracks.')
    .addSubcommand((sub) => sub.setName('info').setDescription('Show VERA information.')),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x6757ff)
      .setTitle('VERA')
      .setDescription('VORTEX Entertainment Registration & Analytics')
      .addFields(
        { name: 'Television', value: 'Lumi • Canvas', inline: true },
        { name: 'Music & Video', value: 'PULSE • FRAME', inline: true },
        { name: 'Social', value: 'Xposure • KNETIK', inline: true },
        { name: 'Personas', value: 'Self-service registration · owner-approved verification ✓', inline: true },
        { name: 'Promotion', value: 'Timed sponsored placements', inline: true },
      )
      .setFooter({ text: 'Register talent, publish content, run promo, and build career history.' });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
