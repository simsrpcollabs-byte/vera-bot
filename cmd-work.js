const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { identityChoices, labelChoices, platformChoices } = require('./autocomplete');
const { isAdmin } = require('./access');
const { generateOpeningMetrics } = require('./metrics');
const { verifiedName, isRegisteredIdentityName, applyPlatformBrand } = require('./display');
const { publishAsPersona } = require('./proxyPublisher');

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
      sub.setName('submit').setDescription('Publish work instantly and receive opening metrics.')
        .addStringOption((opt) => opt.setName('persona').setDescription('Persona responsible for the work').setRequired(true).setAutocomplete(true))
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
        .addStringOption((opt) => opt.setName('label').setDescription('Record label, if applicable').setAutocomplete(true))
        .addStringOption((opt) => opt.setName('series').setDescription('Parent television series (required for episodes)').setAutocomplete(true));
      return sub;
    })
    .addSubcommand((sub) => sub
      .setName('view')
      .setDescription('View a submitted work.')
      .addIntegerOption((opt) => opt.setName('id').setDescription('Work ID').setRequired(true).setMinValue(1))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'persona') return interaction.respond(identityChoices(interaction, true));
    if (focused.name === 'label') return interaction.respond(labelChoices(interaction, true));
    if (focused.name === 'series') {
      const search = focused.value.toLowerCase();
      const rows = db.prepare(`
        SELECT id, title, credited_name FROM works
        WHERE guild_id = ? AND status = 'released' AND work_type = 'show'
          AND (LOWER(title) LIKE ? OR LOWER(credited_name) LIKE ? OR CAST(id AS TEXT) LIKE ?)
        ORDER BY title LIMIT 25
      `).all(interaction.guildId, `%${search}%`, `%${search}%`, `%${search}%`);
      return interaction.respond(rows.map((row) => ({
        name: `${row.title} — ${row.credited_name} (#${row.id})`.slice(0, 100), value: String(row.id),
      })));
    }
    return interaction.respond(platformChoices(interaction));
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'view') {
      const work = db.prepare(`
        SELECT w.*, i.civilian_name, i.verified, p.name AS platform_name,
               p.logo_url AS platform_logo_url, p.brand_color AS platform_brand_color,
               l.name AS label_name,
               wm.metrics_json
        FROM works w
        JOIN identities i ON i.id = w.identity_id
        JOIN platforms p ON p.code = w.platform_code
        LEFT JOIN labels l ON l.id = w.label_id
        LEFT JOIN work_metrics wm ON wm.work_id = w.id
        WHERE w.guild_id = ? AND w.id = ?
      `).get(interaction.guildId, interaction.options.getInteger('id'));
      if (!work) return interaction.reply({ content: 'That work was not found.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor(0x28c8ff)
        .setTitle(work.title)
        .addFields(
          { name: 'Credited artist/creator', value: verifiedName(work.credited_name, work.verified), inline: true },
          { name: 'Persona', value: work.civilian_name, inline: true },
          { name: 'Type', value: work.work_type, inline: true },
          { name: 'Platform', value: work.platform_name, inline: true },
          { name: 'Label', value: work.label_name || 'Independent / not applicable', inline: true },
          { name: 'Release date', value: work.release_date || 'Not scheduled', inline: true },
          { name: 'Promo', value: work.promo_level, inline: true },
          { name: 'Status', value: work.status, inline: true },
        );
      let metricAccent = 0x28c8ff;
      if (work.metrics_json) {
        const metrics = JSON.parse(work.metrics_json);
        metricAccent = metrics.accent || metricAccent;
        embed
          .setDescription(metrics.description)
          .setColor(metrics.accent)
          .addFields(...metrics.fields)
          .setFooter({ text: `Opening metrics · Work #${work.id}` });
      }
      applyPlatformBrand(embed, {
        logo_url: work.platform_logo_url,
        brand_color: work.platform_brand_color,
      }, metricAccent);
      return interaction.reply({ embeds: [embed] });
    }

    const identityId = Number(interaction.options.getString('persona'));
    const identity = db.prepare(`
      SELECT * FROM identities WHERE guild_id = ? AND id = ? AND status = 'approved'
    `).get(interaction.guildId, identityId);
    if (!identity) return interaction.reply({ content: 'That persona was not found.', ephemeral: true });
    if (identity.owner_user_id !== interaction.user.id && !isAdmin(interaction)) {
      return interaction.reply({ content: 'Only the persona owner or an admin can submit work for this person.', ephemeral: true });
    }

    const workType = interaction.options.getString('type');
    const platformCode = interaction.options.getString('platform').toUpperCase();
    const platform = db.prepare(`SELECT * FROM platforms WHERE code = ? AND active = 1`).get(platformCode);
    if (!platform) return interaction.reply({ content: 'That platform was not found.', ephemeral: true });
    if (!allowedCategories[workType]?.includes(platform.category)) {
      return interaction.reply({ content: `A **${workType}** cannot be released through **${platform.name}**. Choose a matching network or platform.`, ephemeral: true });
    }
    const destination = db.prepare(`SELECT channel_id FROM platform_channels WHERE guild_id = ? AND platform_code = ?`)
      .get(interaction.guildId, platformCode);
    if (!destination) {
      return interaction.reply({ content: `The official **${platform.name}** channel has not been assigned yet. Ask a VERA admin to use \`/platform channel\`.`, ephemeral: true });
    }
    const channel = await interaction.client.channels.fetch(destination.channel_id).catch(() => null);
    if (!channel?.isTextBased()) {
      return interaction.reply({ content: `VERA cannot access the official **${platform.name}** channel. Ask an admin to configure it again.`, ephemeral: true });
    }
    const personaProxy = db.prepare(`SELECT id FROM tupper_links WHERE guild_id = ? AND identity_id = ? AND active = 1 ORDER BY id DESC LIMIT 1`)
      .get(interaction.guildId, identityId);
    if (!personaProxy) {
      return interaction.reply({ content: 'Link this persona’s Tupperbox proxy with `/persona link-tupper` before publishing.', ephemeral: true });
    }

    const rawSeriesId = interaction.options.getString('series');
    const seriesId = rawSeriesId ? Number(rawSeriesId) : null;
    if (workType === 'episode' && !seriesId) {
      return interaction.reply({ content: 'Episodes must cite their parent series so VERA can build the show’s ratings history.', ephemeral: true });
    }
    if (seriesId) {
      const series = db.prepare(`
        SELECT id, platform_code, identity_id FROM works
        WHERE guild_id = ? AND id = ? AND work_type = 'show' AND status = 'released'
      `).get(interaction.guildId, seriesId);
      if (!series) return interaction.reply({ content: 'That parent series was not found.', ephemeral: true });
      if (workType !== 'episode') return interaction.reply({ content: 'Only episode submissions can cite a parent series right now.', ephemeral: true });
      if (series.identity_id !== identityId && !isAdmin(interaction)) {
        return interaction.reply({ content: 'Only the registered series owner or a VERA admin can attach episodes to that show.', ephemeral: true });
      }
      if (series.platform_code !== platformCode) {
        return interaction.reply({ content: 'The episode must use the same Lumi or Canvas network as its parent series.', ephemeral: true });
      }
    }

    const rawLabelId = interaction.options.getString('label');
    const labelId = rawLabelId ? Number(rawLabelId) : null;
    if (labelId) {
      const label = db.prepare(`SELECT id FROM labels WHERE guild_id = ? AND id = ? AND status = 'approved'`).get(interaction.guildId, labelId);
      if (!label) return interaction.reply({ content: 'That label was not found or is not approved.', ephemeral: true });
    }

    const title = interaction.options.getString('title').trim();
    const creditedName = interaction.options.getString('credited_name').trim();
    if (!isRegisteredIdentityName(db, identity, creditedName)) {
      return interaction.reply({ content: 'That credited name is not registered to this persona. Add it first with `/persona alias-add`.', ephemeral: true });
    }
    const releaseDate = interaction.options.getString('release_date');
    const promo = interaction.options.getString('promo') || 'standard';

    const publish = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO works
          (guild_id, submitted_by, identity_id, label_id, platform_code, title, work_type,
           credited_name, release_date, promo_level, status, reviewed_by, reviewed_at, parent_work_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'released', ?, CURRENT_TIMESTAMP, ?)
      `).run(
        interaction.guildId,
        interaction.user.id,
        identityId,
        labelId,
        platformCode,
        title,
        workType,
        creditedName,
        releaseDate,
        promo,
        interaction.user.id,
        seriesId,
      );

      const metrics = generateOpeningMetrics({
        workId: Number(result.lastInsertRowid),
        title,
        workType,
        platform,
        identity,
        promo,
      });
      db.prepare(`
        INSERT INTO work_metrics (work_id, metrics_json) VALUES (?, ?)
      `).run(result.lastInsertRowid, JSON.stringify(metrics));
      if (metrics.socialGain) {
        db.prepare(`
          INSERT INTO social_profiles (guild_id, identity_id, platform_code, followers, activity_score, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(guild_id, identity_id, platform_code) DO UPDATE SET
            followers = followers + excluded.followers,
            activity_score = activity_score + excluded.activity_score,
            updated_at = CURRENT_TIMESTAMP
        `).run(interaction.guildId, identityId, platformCode, metrics.socialGain, metrics.chart?.score || 0);
      }
      return { workId: Number(result.lastInsertRowid), metrics };
    });

    const { workId, metrics } = publish();
    const embed = new EmbedBuilder()
      .setTitle(metrics.title)
      .setDescription(metrics.description)
      .addFields(
        { name: 'Artist / creator', value: verifiedName(creditedName, identity.verified), inline: true },
        { name: 'Platform', value: platform.name, inline: true },
        { name: 'Promo', value: promo, inline: true },
        ...metrics.fields,
      )
      .setFooter({ text: `Work #${workId} · Published instantly · Metrics saved` });
    applyPlatformBrand(embed, platform, metrics.accent);
    try {
      const message = await publishAsPersona({
        channel,
        platformCode,
        identityId,
        creditedName,
        payload: { embeds: [embed] },
      });
      const jumpUrl = `https://discord.com/channels/${interaction.guildId}/${channel.id}/${message.id}`;
      return interaction.reply({ content: `Published **${title}** in ${channel} as **${creditedName}**. [View release](${jumpUrl})`, ephemeral: true });
    } catch (error) {
      console.error('Could not publish work through persona webhook:', error);
      return interaction.reply({
        content: `The metrics were saved as work #${workId}, but VERA could not post in ${channel}. Make sure VERA has **Manage Webhooks**, then try \`/work view id:${workId}\`.`,
        ephemeral: true,
      });
    }
  },
};
