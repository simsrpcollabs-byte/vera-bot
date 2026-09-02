const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { parseRpMarkup } = require('./rpMarkup');

function list(items) {
  return items.length ? items.map((item) => `• ${item}`).join('\n').slice(0, 1024) : 'None detected';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rp')
    .setDescription('View or test VERA roleplay formatting rules.')
    .addSubcommand((sub) => sub.setName('rules').setDescription('Show the roleplay formatting rules.'))
    .addSubcommand((sub) => sub
      .setName('parse')
      .setDescription('Test how VERA interprets a roleplay message.')
      .addStringOption((opt) => opt.setName('text').setDescription('Paste a formatted RP message').setRequired(true).setMaxLength(1500))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'rules') {
      return interaction.reply({
        content: '**VERA RP rules**\n`**bold**` = audible dialogue\n`*italics*` or `_italics_` = actions/internal thoughts\nUnformatted text = narration/context',
        ephemeral: true,
      });
    }

    const parsed = parseRpMarkup(interaction.options.getString('text'));
    const embed = new EmbedBuilder()
      .setColor(0x6757ff)
      .setTitle('VERA RP Interpretation')
      .addFields(
        { name: '🔊 Audible dialogue', value: list(parsed.dialogue) },
        { name: '💭 Actions / internal thoughts', value: list(parsed.actionsAndThoughts) },
        { name: '📖 Narration / context', value: list(parsed.narration) },
      )
      .setFooter({ text: 'Only bold text is treated as something other characters heard.' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
