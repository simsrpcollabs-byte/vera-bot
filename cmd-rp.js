const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { parseRpMarkup } = require('./rpMarkup');
const { formatBuzz, getWorkBuzz } = require('./rpBuzz');
const db = require('./database');

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
      .addStringOption((opt) => opt.setName('text').setDescription('Paste a formatted RP message').setRequired(true).setMaxLength(1500)))
    .addSubcommand((sub) => sub
      .setName('buzz')
      .setDescription('View the organic RP impact on a release.')
      .addIntegerOption((opt) => opt.setName('work_id').setDescription('Work ID').setRequired(true).setMinValue(1))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'rules') {
      return interaction.reply({
        content: '**VERA RP rules**\n`**bold**` = audible dialogue and can shape public sentiment\n`*italics*` or `_italics_` = actions/internal thoughts; never public sentiment\nUnformatted text = narration/context\n\nMentioning a published work by its title can create capped organic buzz. New outside personas carry more influence than repeated self-promo.',
        ephemeral: true,
      });
    }

    if (subcommand === 'buzz') {
      const workId = interaction.options.getInteger('work_id');
      const work = db.prepare(`
        SELECT id, guild_id, title, credited_name, platform_code
        FROM works WHERE guild_id = ? AND id = ? AND status = 'released'
      `).get(interaction.guildId, workId);
      if (!work) return interaction.reply({ content: 'That published work was not found.', ephemeral: true });
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x6757ff)
          .setTitle(`🎭 ${work.title}`)
          .setDescription(formatBuzz(getWorkBuzz(work.id), work.platform_code))
          .setFooter({ text: `${work.credited_name} · Work #${work.id}` })],
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
