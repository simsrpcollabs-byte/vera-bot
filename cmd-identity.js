const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { identityChoices } = require('./autocomplete');
const { isAdmin, ownsIdentity } = require('./access');
const { verifiedName, verificationLabel } = require('./display');
const { audienceLabel } = require('./audience');
const { roleLabel } = require('./collaboration');

const aliasTypes = [
  ['Stage name', 'stage'],
  ['Screen name', 'screen'],
  ['Professional name', 'professional'],
  ['Social handle', 'social'],
  ['Former name', 'former'],
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('persona')
    .setDescription('Register and manage a VORTEX persona and their professional names.')
    .addSubcommand((sub) => sub
      .setName('register')
      .setDescription('Register a persona and begin linking their Tupperbox proxy.')
      .addStringOption((opt) => opt.setName('civilian_name').setDescription('Their civilian name').setRequired(true).setMaxLength(80))
      .addStringOption((opt) => opt.setName('pronouns').setDescription('Optional pronouns').setMaxLength(40))
      .addStringOption((opt) => opt.setName('bio').setDescription('Optional short bio').setMaxLength(500)))
    .addSubcommand((sub) => sub
      .setName('alias-add')
      .setDescription('Add a stage, screen, former, or social name.')
      .addStringOption((opt) => opt.setName('persona').setDescription('Select the persona').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => {
        opt.setName('type').setDescription('Alias type').setRequired(true);
        for (const [name, value] of aliasTypes) opt.addChoices({ name, value });
        return opt;
      })
      .addStringOption((opt) => opt.setName('name').setDescription('The public or professional name').setRequired(true).setMaxLength(80))
      .addStringOption((opt) => opt.setName('industry').setDescription('Music, acting, directing, social, etc.').setMaxLength(60)))
    .addSubcommand((sub) => sub
      .setName('profile')
      .setDescription('View a registered persona.')
      .addStringOption((opt) => opt.setName('persona').setDescription('Select a persona').setRequired(false).setAutocomplete(true)))
    .addSubcommand((sub) => sub
      .setName('edit')
      .setDescription('Edit one of your registered personas.')
      .addStringOption((opt) => opt.setName('persona').setDescription('Select your persona').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('civilian_name').setDescription('Updated civilian name').setMaxLength(80))
      .addStringOption((opt) => opt.setName('pronouns').setDescription('Updated pronouns').setMaxLength(40))
      .addStringOption((opt) => opt.setName('bio').setDescription('Updated short bio').setMaxLength(500)))
    .addSubcommand((sub) => sub
      .setName('delete')
      .setDescription('Delete an unused persona you registered.')
      .addStringOption((opt) => opt.setName('persona').setDescription('Select your persona').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('confirmation').setDescription('Type DELETE to confirm').setRequired(true).setMaxLength(6)))
    .addSubcommand((sub) => sub
      .setName('link-tupper')
      .setDescription('Reconnect or change a persona’s Tupperbox proxy.')
      .addStringOption((opt) => opt.setName('persona').setDescription('Select the persona').setRequired(true).setAutocomplete(true))),

  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.respond(identityChoices(interaction, false, subcommand !== 'profile'));
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'register') {
      const civilianName = interaction.options.getString('civilian_name').trim();
      const duplicate = db.prepare(`
        SELECT id FROM identities
        WHERE owner_user_id = ? AND LOWER(civilian_name) = LOWER(?)
      `).get(interaction.user.id, civilianName);
      if (duplicate) {
        return interaction.reply({ content: `You already registered that persona as #${duplicate.id}.`, ephemeral: true });
      }

      const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      const register = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO identities (guild_id, owner_user_id, civilian_name, pronouns, bio, status, reviewed_by, reviewed_at)
          VALUES (?, ?, ?, ?, ?, 'approved', ?, CURRENT_TIMESTAMP)
        `).run(
          interaction.guildId,
          interaction.user.id,
          civilianName,
          interaction.options.getString('pronouns'),
          interaction.options.getString('bio'),
          interaction.user.id,
        );
        db.prepare(`
          UPDATE tupper_link_requests SET status = 'expired'
          WHERE guild_id = ? AND requested_by = ? AND status = 'awaiting_message'
        `).run(interaction.guildId, interaction.user.id);
        const link = db.prepare(`
          INSERT INTO tupper_link_requests
            (guild_id, identity_id, requested_by, channel_id, expires_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(interaction.guildId, result.lastInsertRowid, interaction.user.id, interaction.channelId, expiresAt);
        return { personaId: Number(result.lastInsertRowid), linkId: Number(link.lastInsertRowid) };
      });
      const result = register();
      return interaction.reply({
        content: `**${civilianName}** is registered as persona #${result.personaId} and is ready to use. Now send one message through their Tupperbox proxy in this channel within two minutes; VERA will link it automatically.`,
        ephemeral: true,
      });
    }

    const rawId = interaction.options.getString('persona');
    if (subcommand === 'profile' && !rawId) {
      const rows = db.prepare(`
        SELECT id, civilian_name, status FROM identities
        ORDER BY civilian_name
      `).all();
      const text = rows.length
        ? rows.map((row) => `#${row.id} — **${row.civilian_name}** (${row.status})`).join('\n')
        : 'No personas have been registered in this server yet.';
      return interaction.reply({ content: text, ephemeral: true });
    }

    const identityId = Number(rawId);
    const { identity, allowed } = ownsIdentity(db, interaction.guildId, identityId, interaction.user.id);
    if (!identity) return interaction.reply({ content: 'That persona was not found.', ephemeral: true });

    if (subcommand === 'profile') {
      const aliases = db.prepare(`
        SELECT alias_type, alias_name, industry FROM identity_aliases
        WHERE identity_id = ? AND active = 1 ORDER BY alias_type, alias_name
      `).all(identityId);
      const audiences = db.prepare(`
        SELECT platform_code, SUM(followers) AS followers FROM social_profiles
        WHERE identity_id = ? GROUP BY platform_code ORDER BY platform_code
      `).all(identityId);
      const collaborationCredits = db.prepare(`
        SELECT w.id AS work_id, w.title, wc.role, wc.credited_name
        FROM work_collaborators wc
        JOIN works w ON w.id = wc.work_id
        WHERE wc.identity_id = ? AND wc.active = 1 AND w.status = 'released'
        ORDER BY wc.created_at DESC LIMIT 8
      `).all(identityId);
      const embed = new EmbedBuilder()
        .setColor(0x6757ff)
        .setTitle(verifiedName(identity.civilian_name, identity.verified))
        .setDescription(identity.bio || 'No biography has been added.')
        .addFields(
          { name: 'Persona ID', value: String(identity.id), inline: true },
          { name: 'Status', value: identity.status, inline: true },
          { name: 'Pronouns', value: identity.pronouns || 'Not listed', inline: true },
          { name: 'Verification', value: verificationLabel(identity.verified), inline: true },
          {
            name: 'Professional names',
            value: aliases.length
              ? aliases.map((alias) => `**${alias.alias_name}** — ${alias.alias_type}${alias.industry ? ` (${alias.industry})` : ''}`).join('\n')
              : 'None registered',
          },
          {
            name: 'Platform audiences',
            value: audiences.length
              ? audiences.map((row) => `**${row.platform_code}:** ${Number(row.followers).toLocaleString()} ${audienceLabel(row.platform_code)}`).join('\n')
              : 'No tracked audience yet',
          },
          {
            name: 'Project credits',
            value: collaborationCredits.length
              ? collaborationCredits.map((credit) => `**${credit.title}** — ${credit.credited_name} · ${roleLabel(credit.role)}`).join('\n')
              : 'No collaborator credits yet',
          },
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!allowed) return interaction.reply({ content: 'You can only manage personas you registered.', ephemeral: true });

    if (subcommand === 'edit') {
      const civilianName = interaction.options.getString('civilian_name')?.trim();
      const pronouns = interaction.options.getString('pronouns')?.trim();
      const bio = interaction.options.getString('bio')?.trim();
      if (civilianName === undefined && pronouns === undefined && bio === undefined) {
        return interaction.reply({ content: 'Add at least one field to update: civilian name, pronouns, or bio.', ephemeral: true });
      }
      if (civilianName && civilianName.toLowerCase() !== String(identity.civilian_name).toLowerCase()) {
        const duplicate = db.prepare(`
          SELECT id FROM identities WHERE owner_user_id = ?
            AND LOWER(civilian_name) = LOWER(?) AND id <> ?
        `).get(interaction.user.id, civilianName, identityId);
        if (duplicate) return interaction.reply({ content: 'You already have a persona with that civilian name.', ephemeral: true });
      }
      db.prepare(`UPDATE identities SET civilian_name = ?, pronouns = ?, bio = ? WHERE id = ?`)
        .run(civilianName ?? identity.civilian_name, pronouns ?? identity.pronouns, bio ?? identity.bio, identityId);
      return interaction.reply({ content: `Updated **${civilianName || identity.civilian_name}**.`, ephemeral: true });
    }

    if (subcommand === 'delete') {
      if (interaction.options.getString('confirmation') !== 'DELETE') {
        return interaction.reply({ content: 'Deletion cancelled. Type **DELETE** exactly to confirm.', ephemeral: true });
      }
      const published = db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM works WHERE identity_id = ?) +
          (SELECT COUNT(*) FROM work_collaborators WHERE identity_id = ?) AS count
      `).get(identityId, identityId);
      if (Number(published.count)) {
        return interaction.reply({
          content: `**${identity.civilian_name}** cannot be deleted because they have ${Number(published.count)} published work or project credit${Number(published.count) === 1 ? '' : 's'}. This protects VERA’s career history.`,
          ephemeral: true,
        });
      }
      db.prepare(`DELETE FROM identities WHERE id = ? AND owner_user_id = ?`)
        .run(identityId, interaction.user.id);
      return interaction.reply({ content: `Deleted **${identity.civilian_name}** and their linked aliases and proxy data.`, ephemeral: true });
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
          return interaction.reply({ content: 'That alias is already attached to this persona.', ephemeral: true });
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
        content: `Link request #${result.lastInsertRowid} started for **${identity.civilian_name}**. Within two minutes, send one message in this channel through the correct Tupperbox proxy. VERA will link it automatically.`,
        ephemeral: true,
      });
    }
  },
};
