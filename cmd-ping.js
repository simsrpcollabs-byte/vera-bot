const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether VERA is online.'),
  async execute(interaction) {
    await interaction.reply({ content: 'VERA is online and listening. 📊', ephemeral: true });
  },
};
