const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { identityChoices, labelChoices } = require('./autocomplete');
const { isAdmin } = require('./access');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('label')
    .setDescription('Register and manage record labels.')
    .addSubcommand((sub) => sub
      .setName('register')
      .setDescription('Register a record label.')
      .addStringOption((opt) => opt.setName('name').setDescription('Record label name').setRequired(true).setMaxLength(100))
      .addStringOption((opt) => opt.setName('parent_company').setDescription('Optional parent company').setMaxLength(100))
      .addStringOption((opt) => opt.setName('genre_focus').setDescription('Optional genre focus').setMaxLength(100)))
    .addSubcommand((sub) => sub
      .setName('view')
      .setDescription('View a record label.')
      .addStringOption((opt) => opt.setName('label').setDescription('Select a label').setRequired(true).setAutocomplete(true)))
    .addSubcommand((sub) => sub
      .setName('roster-add')
      .setDescription('Add a persona to an approved label roster.')
      .addStringOption((opt) => opt.setName('label').setDescription('Select a label').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('persona').setDescription('Select an artist persona').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('credited_name').setDescription('Stage name used on this roster').setMaxLength(80))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'persona') return interaction.respond(identityChoices(interaction, true));
    return interaction.respond(labelChoices(interaction));
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'register') {
      const name = interaction.options.getString('name').trim();
      try {
        const result = db.prepare(`
          INSERT INTO labels (guild_id, owner_user_id, name, parent_company, genre_focus)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          interaction.guildId,
          interaction.user.id,
          name,
          interaction.options.getString('parent_company'),
          interaction.options.getString('genre_focus'),
        );
        return interaction.reply({ content: `**${name}** was submitted as label #${result.lastInsertRowid}.`, ephemeral: true });
      } catch (error) {
        if (error.code?.startsWith('SQLITE_CONSTRAINT')) {
          return interaction.reply({ content: 'A label with that name is already registered.', ephemeral: true });
        }
        throw error;
      }
    }

    const labelId = Number(interaction.options.getString('label'));
    const label = db.prepare(`SELECT * FROM labels WHERE guild_id = ? AND id = ?`).get(interaction.guildId, labelId);
    if (!label) return interaction.reply({ content: 'That label was not found.', ephemeral: true });

    if (subcommand === 'view') {
      const roster = db.prepare(`
        SELECT i.civilian_name, lr.credited_name
        FROM label_roster lr JOIN identities i ON i.id = lr.identity_id
        WHERE lr.label_id = ? AND lr.left_at IS NULL
        ORDER BY COALESCE(lr.credited_name, i.civilian_name)
      `).all(labelId);
      const embed = new EmbedBuilder()
        .setColor(0xff4fc8)
        .setTitle(label.name)
        .addFields(
          { name: 'Status', value: label.status, inline: true },
          { name: 'Parent company', value: label.parent_company || 'Independent', inline: true },
          { name: 'Genre focus', value: label.genre_focus || 'Multiple genres', inline: true },
          {
            name: 'Roster',
            value: roster.length
              ? roster.map((artist) => artist.credited_name || artist.civilian_name).join('\n')
              : 'No artists added',
          },
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (label.owner_user_id !== interaction.user.id && !isAdmin(interaction)) {
      return interaction.reply({ content: 'Only the label owner or an admin can edit this roster.', ephemeral: true });
    }
    if (label.status !== 'approved') {
      return interaction.reply({ content: 'The label must be approved before artists can join its roster.', ephemeral: true });
    }

    const identityId = Number(interaction.options.getString('persona'));
    const identity = db.prepare(`
      SELECT * FROM identities WHERE guild_id = ? AND id = ? AND status = 'approved'
    `).get(interaction.guildId, identityId);
    if (!identity) return interaction.reply({ content: 'That artist persona was not found.', ephemeral: true });

    db.prepare(`
      INSERT INTO label_roster (label_id, identity_id, credited_name)
      VALUES (?, ?, ?)
      ON CONFLICT(label_id, identity_id) DO UPDATE SET
        credited_name = excluded.credited_name,
        left_at = NULL
    `).run(labelId, identityId, interaction.options.getString('credited_name'));
    return interaction.reply({ content: `Added **${identity.civilian_name}** to **${label.name}**.`, ephemeral: true });
  },
};
