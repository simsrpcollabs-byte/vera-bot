const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { isAdmin } = require('./access');
const { identityChoices, platformChoices } = require('./autocomplete');
const { audienceLabel } = require('./audience');
const { STATUS_LABELS } = require('./personaCareer');

const categories = [
  { name: 'Label', value: 'label' },
];

const tableMap = {
  label: { table: 'labels', name: 'name' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Approve or reject record-label registrations.')
    .addSubcommand((sub) => sub
      .setName('queue')
      .setDescription('View pending registrations.')
      .addStringOption((opt) => opt.setName('category').setDescription('Queue type').setRequired(true).addChoices(...categories)))
    .addSubcommand((sub) => sub
      .setName('approve')
      .setDescription('Approve a pending registration.')
      .addStringOption((opt) => opt.setName('category').setDescription('Registration type').setRequired(true).addChoices(...categories))
      .addIntegerOption((opt) => opt.setName('id').setDescription('Registration ID').setRequired(true).setMinValue(1)))
    .addSubcommand((sub) => sub
      .setName('reject')
      .setDescription('Reject a pending registration.')
      .addStringOption((opt) => opt.setName('category').setDescription('Registration type').setRequired(true).addChoices(...categories))
      .addIntegerOption((opt) => opt.setName('id').setDescription('Registration ID').setRequired(true).setMinValue(1))
      .addStringOption((opt) => opt.setName('reason').setDescription('Reason for rejection').setRequired(true).setMaxLength(300)))
    .addSubcommand((sub) => sub
      .setName('persona-audience')
      .setDescription('Set any persona’s follower or listener count (server owner).')
      .addStringOption((opt) => opt.setName('persona').setDescription('Select any persona').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('platform').setDescription('Select a platform').setRequired(true).setAutocomplete(true))
      .addIntegerOption((opt) => opt.setName('count').setDescription('New audience count').setRequired(true).setMinValue(0).setMaxValue(2000000000)))
    .addSubcommand((sub) => sub
      .setName('persona-verification')
      .setDescription('Set any persona’s verification status (server owner).')
      .addStringOption((opt) => opt.setName('persona').setDescription('Select any persona').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('status').setDescription('Verification status').setRequired(true).addChoices(
        { name: 'Verified', value: 'verified' }, { name: 'Unverified', value: 'unverified' },
      )))
    .addSubcommand((sub) => sub
      .setName('persona-status')
      .setDescription('Set a persona’s Civilian, Emerging, or Public Figure status.')
      .addStringOption((opt) => opt.setName('persona').setDescription('Select any persona').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('status').setDescription('Public account status').setRequired(true).addChoices(
        { name: 'Civilian', value: 'civilian' }, { name: 'Emerging', value: 'emerging' },
        { name: 'Public Figure', value: 'public_figure' }, { name: 'Return to automatic', value: 'automatic' },
      )))
    .addSubcommand((sub) => sub
      .setName('government-metrics')
      .setDescription('Update a government persona’s public-opinion metrics.')
      .addStringOption((opt) => opt.setName('persona').setDescription('Select a government persona').setRequired(true).setAutocomplete(true))
      .addNumberOption((opt) => opt.setName('approval').setDescription('Approval percentage').setMinValue(0).setMaxValue(100))
      .addNumberOption((opt) => opt.setName('disapproval').setDescription('Disapproval percentage').setMinValue(0).setMaxValue(100))
      .addNumberOption((opt) => opt.setName('name_recognition').setDescription('Name recognition percentage').setMinValue(0).setMaxValue(100))
      .addNumberOption((opt) => opt.setName('public_trust').setDescription('Public trust percentage').setMinValue(0).setMaxValue(100))
      .addNumberOption((opt) => opt.setName('favorability').setDescription('Favorability percentage').setMinValue(0).setMaxValue(100))
      .addNumberOption((opt) => opt.setName('media_attention').setDescription('Media attention percentage').setMinValue(0).setMaxValue(100))
      .addNumberOption((opt) => opt.setName('controversy').setDescription('Controversy percentage').setMinValue(0).setMaxValue(100))
      .addIntegerOption((opt) => opt.setName('endorsements').setDescription('Total endorsements').setMinValue(0).setMaxValue(1000000))
      .addStringOption((opt) => opt.setName('office').setDescription('Office or position').setMaxLength(100))
      .addStringOption((opt) => opt.setName('jurisdiction').setDescription('Constituency or jurisdiction').setMaxLength(100))
      .addStringOption((opt) => opt.setName('affiliation').setDescription('Party or affiliation').setMaxLength(100))
      .addStringOption((opt) => opt.setName('campaign_status').setDescription('Current campaign status').addChoices(
        { name: 'Not campaigning', value: 'not_campaigning' }, { name: 'Exploring', value: 'exploring' },
        { name: 'Campaigning', value: 'campaigning' }, { name: 'Elected', value: 'elected' },
        { name: 'Appointed', value: 'appointed' }, { name: 'Withdrawn', value: 'withdrawn' },
      ))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'persona') return interaction.respond(identityChoices(interaction, true, false));
    return interaction.respond(platformChoices(interaction));
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (['persona-audience', 'persona-verification', 'persona-status', 'government-metrics'].includes(subcommand)) {
      if (interaction.guild?.ownerId !== interaction.user.id) {
        return interaction.reply({ content: 'Only the Discord server owner can edit persona audiences, status, verification, or government metrics.', ephemeral: true });
      }
      const identityId = Number(interaction.options.getString('persona'));
      const identity = db.prepare(`SELECT * FROM identities WHERE id = ? AND status = 'approved'`)
        .get(identityId);
      if (!identity) return interaction.reply({ content: 'That persona was not found.', ephemeral: true });

      if (subcommand === 'persona-audience') {
        const platformCode = interaction.options.getString('platform').toUpperCase();
        const platform = db.prepare(`SELECT * FROM platforms WHERE code = ? AND active = 1`).get(platformCode);
        if (!platform) return interaction.reply({ content: 'That platform was not found.', ephemeral: true });
        const count = interaction.options.getInteger('count');
        db.prepare(`
          INSERT INTO social_profiles (guild_id, identity_id, platform_code, followers, activity_score, updated_at)
          VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
          ON CONFLICT(guild_id, identity_id, platform_code) DO UPDATE SET
            followers = excluded.followers, updated_at = CURRENT_TIMESTAMP
        `).run(identity.guild_id, identityId, platformCode, count);
        return interaction.reply({
          content: `Set **${identity.civilian_name}** to **${count.toLocaleString()} ${audienceLabel(platformCode)}** on **${platform.name}**.`,
          ephemeral: true,
        });
      }

      if (subcommand === 'persona-status') {
        const requested = interaction.options.getString('status');
        const automatic = requested === 'automatic';
        const status = automatic ? 'civilian' : requested;
        db.prepare(`UPDATE identities SET public_status = ?, public_status_locked = ? WHERE id = ?`)
          .run(status, automatic ? 0 : 1, identityId);
        if (automatic) {
          const { evaluatePublicStatus } = require('./personaCareer');
          const evaluated = evaluatePublicStatus(db, identityId);
          return interaction.reply({ content: `**${identity.civilian_name}** now uses automatic status and is currently **${STATUS_LABELS[evaluated]}**.`, ephemeral: true });
        }
        return interaction.reply({ content: `**${identity.civilian_name}** is now classified as **${STATUS_LABELS[status]}**.`, ephemeral: true });
      }

      if (subcommand === 'government-metrics') {
        if (identity.industry !== 'government') {
          return interaction.reply({ content: 'That persona is not registered in Government / Politics. Update their industry first.', ephemeral: true });
        }
        const existing = db.prepare(`SELECT * FROM government_profiles WHERE identity_id = ?`).get(identityId) || {};
        const number = (name) => interaction.options.getNumber(name);
        const approval = number('approval') ?? Number(existing.approval ?? 35);
        const disapproval = number('disapproval') ?? Number(existing.disapproval ?? 15);
        if (approval + disapproval > 100) {
          return interaction.reply({ content: 'Approval and disapproval cannot total more than 100%.', ephemeral: true });
        }
        const values = {
          name_recognition: number('name_recognition'), public_trust: number('public_trust'),
          favorability: number('favorability'), media_attention: number('media_attention'),
          controversy: number('controversy'), endorsements: interaction.options.getInteger('endorsements'),
          office: interaction.options.getString('office'), jurisdiction: interaction.options.getString('jurisdiction'),
          affiliation: interaction.options.getString('affiliation'), campaign_status: interaction.options.getString('campaign_status'),
        };
        if (number('approval') === null && number('disapproval') === null && Object.values(values).every((value) => value === null)) {
          return interaction.reply({ content: 'Add at least one government field or metric to update.', ephemeral: true });
        }
        db.prepare(`
          INSERT INTO government_profiles
            (identity_id, office, jurisdiction, affiliation, approval, disapproval, undecided,
             name_recognition, public_trust, favorability, media_attention, controversy,
             endorsements, campaign_status, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(identity_id) DO UPDATE SET
            office = EXCLUDED.office, jurisdiction = EXCLUDED.jurisdiction,
            affiliation = EXCLUDED.affiliation, approval = EXCLUDED.approval,
            disapproval = EXCLUDED.disapproval, undecided = EXCLUDED.undecided,
            name_recognition = EXCLUDED.name_recognition, public_trust = EXCLUDED.public_trust,
            favorability = EXCLUDED.favorability, media_attention = EXCLUDED.media_attention,
            controversy = EXCLUDED.controversy, endorsements = EXCLUDED.endorsements,
            campaign_status = EXCLUDED.campaign_status, updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          identityId, values.office ?? existing.office ?? null, values.jurisdiction ?? existing.jurisdiction ?? null,
          values.affiliation ?? existing.affiliation ?? null, approval, disapproval, 100 - approval - disapproval,
          values.name_recognition ?? Number(existing.name_recognition ?? 5),
          values.public_trust ?? Number(existing.public_trust ?? 50),
          values.favorability ?? Number(existing.favorability ?? 50),
          values.media_attention ?? Number(existing.media_attention ?? 5),
          values.controversy ?? Number(existing.controversy ?? 0),
          values.endorsements ?? Number(existing.endorsements ?? 0),
          values.campaign_status ?? existing.campaign_status ?? 'not_campaigning', interaction.user.id,
        );
        return interaction.reply({ content: `Updated **${identity.civilian_name}**: **${approval.toFixed(1)}% approve**, **${disapproval.toFixed(1)}% disapprove**, **${(100 - approval - disapproval).toFixed(1)}% undecided**.`, ephemeral: true });
      }

      const verified = interaction.options.getString('status') === 'verified';
      db.prepare(`
        UPDATE identities SET verified = ?, verified_by = ?, verified_at = ? WHERE id = ?
      `).run(verified ? 1 : 0, verified ? interaction.user.id : null, verified ? new Date().toISOString() : null, identityId);
      return interaction.reply({ content: `**${identity.civilian_name}** is now **${verified ? 'verified' : 'unverified'}**.`, ephemeral: true });
    }

    if (!isAdmin(interaction)) {
      return interaction.reply({ content: 'You need the configured VERA admin role or Manage Server permission.', ephemeral: true });
    }

    const category = interaction.options.getString('category');
    const config = tableMap[category];

    if (subcommand === 'queue') {
      const rows = db.prepare(`
        SELECT id, ${config.name} AS display_name, created_at
        FROM ${config.table}
        WHERE guild_id = ? AND status = 'pending'
        ORDER BY created_at LIMIT 20
      `).all(interaction.guildId);
      const embed = new EmbedBuilder()
        .setColor(0xffc857)
        .setTitle(`Pending ${category} registrations`)
        .setDescription(rows.length
          ? rows.map((row) => `#${row.id} — **${row.display_name}**`).join('\n')
          : 'The queue is empty.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const id = interaction.options.getInteger('id');
    const row = db.prepare(`
      SELECT id, status FROM ${config.table} WHERE guild_id = ? AND id = ?
    `).get(interaction.guildId, id);
    if (!row) return interaction.reply({ content: `That ${category} was not found.`, ephemeral: true });

    const nextStatus = subcommand === 'approve' ? 'approved' : 'rejected';
    db.prepare(`
      UPDATE ${config.table}
      SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE guild_id = ? AND id = ?
    `).run(nextStatus, interaction.user.id, interaction.guildId, id);

    const reason = interaction.options.getString('reason');
    return interaction.reply({
      content: `${category} #${id} is now **${nextStatus}**.${reason ? ` Reason: ${reason}` : ''}`,
      ephemeral: true,
    });
  },
};
