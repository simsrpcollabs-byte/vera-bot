const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { identityChoices } = require('./autocomplete');
const { isAdmin, ownsIdentity } = require('./access');

const aliasTypes = [
  ['Stage name', 'stage'],
  ['Screen name', 'screen'],
  ['Professional name', 'professional'],
  ['Social handle', 'social'],
  ['Former name', 'former'],
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('identity')
    .setDescription('Register and manage a fictional person and their professional names.')
    .addSubcommand((sub) => sub
      .setName('register')
      .setDescription('Register a fictional person by civilian name.')
      .addStringOption((opt) => opt.setName('civilian_name').setDescription('Their civilian name').setRequired(true).setMaxLength(80))
      .addStringOption((opt) => opt.setName('pronouns').setDescription('Optional pronouns').setMaxLength(40))
      .addStringOption((opt) => opt.setName('bio').setDescription('Optional short bio').setMaxLength(500)))
    .addSubcommand((sub) => sub
      .setName('alias-add')
      .setDescription('Add a stage, screen, former, or social name.')
      .addStringOption((opt) => opt.setName('identity').setDescription('Select the civilian identity').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => {
        opt.setName('type').setDescription('Alias type').setRequired(true);
        for (const [name, value] of aliasTypes) opt.addChoices({ name, value });
        return opt;
      })
      .addStringOption((opt) => opt.setName('name').setDescription('The public or professional name').setRequired(true).setMaxLength(80))
      .addStringOption((opt) => opt.setName('industry').setDescription('Music, acting, directing, social, etc.').setMaxLength(60)))
    .addSubcommand((sub) => sub
      .setName('profile')
      .setDescription('View a registered identity.')
      .addStringOption((opt) => opt.setName('identity').setDescription('Select an identity').setRequired(false).setAutocomplete(true)))
    .addSubcommand((sub) => sub
      .setName('link-tupper')
      .setDescription('Begin linking a Tupperbox proxy to a civilian identity.')
      .addStringOption((opt) => opt.setName('identity').setDescription('Select the civilian identity').setRequired(true).setAutocomplete(true))),

  async autocomplete(interaction) {
    await interaction.respond(identityChoices(interaction));
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'register') {
      const civilianName = interaction.options.getString('civilian_name').trim();
      const duplicate = db.prepare(`
        SELECT id FROM identities
        WHERE guild_id = ? AND owner_user_id = ? AND LOWER(civilian_name) = LOWER(?)
      `).get(interaction.guildId, interaction.user.id, civilianName);
      if (duplicate) {
        return interaction.reply({ content: `You already registered that civilian identity as #${duplicate.id}.`, ephemeral: true });
      }

      const result = db.prepare(`
        INSERT INTO identities (guild_id, owner_user_id, civilian_name, pronouns, bio)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        interaction.guildId,
        interaction.user.id,
        civilianName,
        interaction.options.getString('pronouns'),
        interaction.options.getString('bio'),
      );
      return interaction.reply({
        content: `**${civilianName}** was submitted as identity #${result.lastInsertRowid}. An admin must approve it before official releases can use it.`,
        ephemeral: true,
      });
    }

    const rawId = interaction.options.getString('identity');
    if (subcommand === 'profile' && !rawId) {
      const rows = db.prepare(`
        SELECT id, civilian_name, status FROM identities
        WHERE guild_id = ? AND owner_user_id = ? ORDER BY civilian_name
      `).all(interaction.guildId, interaction.user.id);
      const text = rows.length
        ? rows.map((row) => `#${row.id} — **${row.civilian_name}** (${row.status})`).join('\n')
        : 'You have not registered any identities yet.';
      return interaction.reply({ content: text, ephemeral: true });
    }

    const identityId = Number(rawId);
    const { identity, allowed } = ownsIdentity(db, interaction.guildId, identityId, interaction.user.id);
    if (!identity) return interaction.reply({ content: 'That identity was not found.', ephemeral: true });

    if (subcommand === 'profile') {
      const aliases = db.prepare(`
        SELECT alias_type, alias_name, industry FROM identity_aliases
        WHERE identity_id = ? AND active = 1 ORDER BY alias_type, alias_name
      `).all(identityId);
      const embed = new EmbedBuilder()
        .setColor(0x6757ff)
        .setTitle(identity.civilian_name)
        .setDescription(identity.bio || 'No biography has been added.')
        .addFields(
          { name: 'Identity ID', value: String(identity.id), inline: true },
          { name: 'Status', value: identity.status, inline: true },
          { name: 'Pronouns', value: identity.pronouns || 'Not listed', inline: true },
          {
            name: 'Professional names',
            value: aliases.length
              ? aliases.map((alias) => `**${alias.alias_name}** — ${alias.alias_type}${alias.industry ? ` (${alias.industry})` : ''}`).join('\n')
              : 'None registered',
          },
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!allowed && !isAdmin(interaction)) {
      return interaction.reply({ content: 'Only the identity owner or an admin can make that change.', ephemeral: true });
    }

    if (subcommand === 'alias-add') {
      const aliasType = interaction.options.getString('type');
      const aliasName = interaction.options.getString('name').trim();
      const industry = interaction.options.getString('industry');
      try {
        db.prepare(`
          INSERT INTO identity_aliases (identity_id, alias_type, alias_name, industry)
          VALUES (?, ?, ?, ?)
        `).run(identityId, aliasType, aliasName, industry);
      } catch (error) {
        if (error.code?.startsWith('SQLITE_CONSTRAINT')) {
          return interaction.reply({ content: 'That alias is already attached to this identity.', ephemeral: true });
        }
        throw error;
      }
      return interaction.reply({ content: `Added **${aliasName}** as a ${aliasType} name for **${identity.civilian_name}**.`, ephemeral: true });
    }

    if (subcommand === 'link-tupper') {
      const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      db.prepare(`
        UPDATE tupper_link_requests
        SET status = 'expired'
        WHERE guild_id = ? AND requested_by = ? AND status = 'awaiting_message'
      `).run(interaction.guildId, interaction.user.id);
      const result = db.prepare(`
        INSERT INTO tupper_link_requests
          (guild_id, identity_id, requested_by, channel_id, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(interaction.guildId, identityId, interaction.user.id, interaction.channelId, expiresAt);
      return interaction.reply({
        content: `Link request #${result.lastInsertRowid} started for **${identity.civilian_name}**. Within two minutes, send one message in this channel through the correct Tupperbox proxy. An admin will verify it before the link becomes active.`,
        ephemeral: true,
      });
    }
  },
};
