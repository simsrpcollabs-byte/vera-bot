const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { identityChoices, labelChoices, platformChoices } = require('./autocomplete');
const { isAdmin } = require('./access');

const workTypes = [
  ['Song', 'song'], ['Album', 'album'], ['EP', 'ep'],
  ['Music video', 'music_video'], ['Creator video', 'creator_video'], ['Trailer or clip', 'trailer_clip'],
  ['Television show', 'show'], ['Episode', 'episode'], ['Television special', 'special'],
  ['Televised performance', 'performance'], ['Xposure post', 'xposure_post'], ['KNETIK video', 'knetik_video'],
];

const allowedCategories = {
  song: ['music'], album: ['music'], ep: ['music'],
  music_video: ['video'], creator_video: ['video'], trailer_clip: ['video'],
  show: ['television'], episode: ['television'], special: ['television'],
  performance: ['television', 'video', 'social-short'],
  xposure_post: ['social-profile'], knetik_video: ['social-short'],
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Submit and view entertainment work.')
    .addSubcommand((sub) => {
      sub.setName('submit').setDescription('Submit work for approval and future metrics.')
        .addStringOption((opt) => opt.setName('identity').setDescription('Civilian identity responsible for the work').setRequired(true).setAutocomplete(true))
        .addStringOption((opt) => opt.setName('title').setDescription('Title of the work').setRequired(true).setMaxLength(120))
        .addStringOption((opt) => {
          opt.setName('type').setDescription('Type of work').setRequired(true);
          for (const [name, value] of workTypes) opt.addChoices({ name, value });
          return opt;
        })
        .addStringOption((opt) => opt.setName('platform').setDescription('Network or platform').setRequired(true).setAutocomplete(true))
        .addStringOption((opt) => opt.setName('credited_name').setDescription('Stage or professional name displayed publicly').setRequired(true).setMaxLength(80))
        .addStringOption((opt) => opt.setName('release_date').setDescription('YYYY-MM-DD or an in-universe date').setMaxLength(40))
        .addStringOption((opt) => opt.setName('promo').setDescription('Promotion level').addChoices(
          { name: 'None', value: 'none' }, { name: 'Light', value: 'light' },
          { name: 'Standard', value: 'standard' }, { name: 'Heavy', value: 'heavy' },
          { name: 'Saturation', value: 'saturation' },
        ))
        .addStringOption((opt) => opt.setName('label').setDescription('Record label, if applicable').setAutocomplete(true));
      return sub;
    })
    .addSubcommand((sub) => sub
      .setName('view')
      .setDescription('View a submitted work.')
      .addIntegerOption((opt) => opt.setName('id').setDescription('Work ID').setRequired(true).setMinValue(1))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'identity') return interaction.respond(identityChoices(interaction, true));
    if (focused.name === 'label') return interaction.respond(labelChoices(interaction, true));
    return interaction.respond(platformChoices(interaction));
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'view') {
      const work = db.prepare(`
        SELECT w.*, i.civilian_name, p.name AS platform_name, l.name AS label_name
        FROM works w
        JOIN identities i ON i.id = w.identity_id
        JOIN platforms p ON p.code = w.platform_code
        LEFT JOIN labels l ON l.id = w.label_id
        WHERE w.guild_id = ? AND w.id = ?
      `).get(interaction.guildId, interaction.options.getInteger('id'));
      if (!work) return interaction.reply({ content: 'That work was not found.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor(0x28c8ff)
        .setTitle(work.title)
        .addFields(
          { name: 'Credited artist/creator', value: work.credited_name, inline: true },
          { name: 'Civilian identity', value: work.civilian_name, inline: true },
          { name: 'Type', value: work.work_type, inline: true },
          { name: 'Platform', value: work.platform_name, inline: true },
          { name: 'Label', value: work.label_name || 'Independent / not applicable', inline: true },
          { name: 'Release date', value: work.release_date || 'Not scheduled', inline: true },
          { name: 'Promo', value: work.promo_level, inline: true },
          { name: 'Status', value: work.status, inline: true },
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const identityId = Number(interaction.options.getString('identity'));
    const identity = db.prepare(`
      SELECT * FROM identities WHERE guild_id = ? AND id = ? AND status = 'approved'
    `).get(interaction.guildId, identityId);
    if (!identity) return interaction.reply({ content: 'That identity was not found or is not approved.', ephemeral: true });
    if (identity.owner_user_id !== interaction.user.id && !isAdmin(interaction)) {
      return interaction.reply({ content: 'Only the identity owner or an admin can submit work for this person.', ephemeral: true });
    }

    const workType = interaction.options.getString('type');
    const platformCode = interaction.options.getString('platform').toUpperCase();
    const platform = db.prepare(`SELECT * FROM platforms WHERE code = ? AND active = 1`).get(platformCode);
    if (!platform) return interaction.reply({ content: 'That platform was not found.', ephemeral: true });
    if (!allowedCategories[workType]?.includes(platform.category)) {
      return interaction.reply({ content: `A **${workType}** cannot be released through **${platform.name}**. Choose a matching network or platform.`, ephemeral: true });
    }

    const rawLabelId = interaction.options.getString('label');
    const labelId = rawLabelId ? Number(rawLabelId) : null;
    if (labelId) {
      const label = db.prepare(`SELECT id FROM labels WHERE guild_id = ? AND id = ? AND status = 'approved'`).get(interaction.guildId, labelId);
      if (!label) return interaction.reply({ content: 'That label was not found or is not approved.', ephemeral: true });
    }

    const result = db.prepare(`
      INSERT INTO works
        (guild_id, submitted_by, identity_id, label_id, platform_code, title, work_type, credited_name, release_date, promo_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      interaction.guildId,
      interaction.user.id,
      identityId,
      labelId,
      platformCode,
      interaction.options.getString('title').trim(),
      workType,
      interaction.options.getString('credited_name').trim(),
      interaction.options.getString('release_date'),
      interaction.options.getString('promo') || 'standard',
    );
    return interaction.reply({ content: `Submitted work #${result.lastInsertRowid} for approval. Metrics will begin only after it is approved and released.`, ephemeral: true });
  },
};
