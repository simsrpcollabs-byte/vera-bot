const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { identityChoices, labelChoices, platformChoices } = require('./autocomplete');
const { isAdmin } = require('./access');
const { generateOpeningMetrics } = require('./metrics');
const { verifiedName, isRegisteredIdentityName, applyPlatformBrand } = require('./display');
const { publishAsPersona } = require('./proxyPublisher');
const { addAudience, audienceGain } = require('./audience');
const { formatBuzz, getWorkBuzz } = require('./rpBuzz');

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
        .addStringOption((opt) => opt.setName('series').setDescription('Parent television series (required for episodes)').setAutocomplete(true))
        .addAttachmentOption((opt) => opt.setName('artwork').setDescription('Optional cover art, photo, or FRAME thumbnail'));
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
      const buzz = getWorkBuzz(work.id);
      embed.addFields({ name: '🎭 Organic RP impact', value: formatBuzz(buzz, work.platform_code) });
      const engagement = db.prepare(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE engagement_type IN ('comment','reply','review')) AS responses,
          ROUND(AVG(rating)::numeric, 1) AS average_rating
        FROM content_engagements WHERE guild_id = ? AND work_id = ?
      `).get(interaction.guildId, work.id);
      if (Number(engagement.total)) embed.addFields({
        name: '💫 VERA community activity',
        value: `**${Number(engagement.total).toLocaleString()}** engagement${Number(engagement.total) === 1 ? '' : 's'} · **${Number(engagement.responses).toLocaleString()}** written response${Number(engagement.responses) === 1 ? '' : 's'}${engagement.average_rating ? ` · **${engagement.average_rating}/5** average rating` : ''}`,
      });
      if (work.media_url && (!work.media_type || work.media_type.startsWith('image/'))) embed.setImage(work.media_url);
      applyPlatformBrand(embed, {
        logo_url: work.platform_logo_url,
        brand_color: work.platform_brand_color,
      }, metricAccent);
      return interaction.reply({ embeds: [embed] });
    }

    // Supabase checks can take longer than Discord's three-second response
    // window, especially when Railway and Supabase are in different regions.
    await interaction.deferReply({ ephemeral: true });

    const identityId = Number(interaction.options.getString('persona'));
    const identity = db.prepare(`
      SELECT * FROM identities WHERE guild_id = ? AND id = ? AND status = 'approved'
    `).get(interaction.guildId, identityId);
    if (!identity) return interaction.editReply('That persona was not found.');
    if (identity.owner_user_id !== interaction.user.id && !isAdmin(interaction)) {
      return interaction.editReply('Only the persona owner or an admin can submit work for this person.');
    }

    const workType = interaction.options.getString('type');
    const platformCode = interaction.options.getString('platform').toUpperCase();
    const platform = db.prepare(`SELECT * FROM platforms WHERE code = ? AND active = 1`).get(platformCode);
    if (!platform) return interaction.editReply('That platform was not found.');
    if (!allowedCategories[workType]?.includes(platform.category)) {
      return interaction.editReply(`A **${workType}** cannot be released through **${platform.name}**. Choose a matching network or platform.`);
    }
    const destination = db.prepare(`SELECT channel_id FROM platform_channels WHERE guild_id = ? AND platform_code = ?`)
      .get(interaction.guildId, platformCode);
    if (!destination) {
      return interaction.editReply(`The official **${platform.name}** channel has not been assigned yet. Ask a VERA admin to use \`/platform channel\`.`);
    }
    const channel = await interaction.client.channels.fetch(destination.channel_id).catch(() => null);
    if (!channel?.isTextBased()) {
      return interaction.editReply(`VERA cannot access the official **${platform.name}** channel. Ask an admin to configure it again.`);
    }
    const personaProxy = db.prepare(`SELECT id FROM tupper_links WHERE guild_id = ? AND identity_id = ? AND active = 1 ORDER BY id DESC LIMIT 1`)
      .get(interaction.guildId, identityId);
    if (!personaProxy) {
      return interaction.editReply('Link this persona’s Tupperbox proxy with `/persona link-tupper` before publishing.');
    }

    const rawSeriesId = interaction.options.getString('series');
    const seriesId = rawSeriesId ? Number(rawSeriesId) : null;
    if (workType === 'episode' && !seriesId) {
      return interaction.editReply('Episodes must cite their parent series so VERA can build the show’s ratings history.');
    }
    if (seriesId) {
      const series = db.prepare(`
        SELECT id, platform_code, identity_id FROM works
        WHERE guild_id = ? AND id = ? AND work_type = 'show' AND status = 'released'
      `).get(interaction.guildId, seriesId);
      if (!series) return interaction.editReply('That parent series was not found.');
      if (workType !== 'episode') return interaction.editReply('Only episode submissions can cite a parent series right now.');
      if (series.identity_id !== identityId && !isAdmin(interaction)) {
        return interaction.editReply('Only the registered series owner or a VERA admin can attach episodes to that show.');
      }
      if (series.platform_code !== platformCode) {
        return interaction.editReply('The episode must use the same Lumi or Canvas network as its parent series.');
      }
    }

    const rawLabelId = interaction.options.getString('label');
    const labelId = rawLabelId ? Number(rawLabelId) : null;
    if (labelId) {
      const label = db.prepare(`SELECT id FROM labels WHERE guild_id = ? AND id = ? AND status = 'approved'`).get(interaction.guildId, labelId);
      if (!label) return interaction.editReply('That label was not found or is not approved.');
    }

    const title = interaction.options.getString('title').trim();
    const creditedName = interaction.options.getString('credited_name').trim();
    if (!isRegisteredIdentityName(db, identity, creditedName)) {
      return interaction.editReply('That credited name is not registered to this persona. Add it first with `/persona alias-add`.');
    }
    const releaseDate = interaction.options.getString('release_date');
    const promo = interaction.options.getString('promo') || 'standard';
    const artwork = interaction.options.getAttachment('artwork');
    if (artwork?.contentType && !artwork.contentType.startsWith('image/')) {
      return interaction.editReply('Artwork must be an image file.');
    }
    const mediaUrl = artwork?.url || null;
    const mediaType = artwork?.contentType || null;

    const publish = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO works
          (guild_id, submitted_by, identity_id, label_id, platform_code, title, work_type,
           credited_name, release_date, promo_level, status, reviewed_by, reviewed_at, parent_work_id,
           media_url, media_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'released', ?, CURRENT_TIMESTAMP, ?, ?, ?)
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
        mediaUrl,
        mediaType,
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
      addAudience(db, interaction.guildId, identityId, platformCode, audienceGain(metrics), metrics.chart?.score || 0);
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
    if (mediaUrl) embed.setImage(mediaUrl);
    try {
      const message = await publishAsPersona({
        channel,
        platformCode,
        identityId,
        creditedName,
        payload: { embeds: [embed] },
      });
      const jumpUrl = `https://discord.com/channels/${interaction.guildId}/${channel.id}/${message.id}`;
      return interaction.editReply(`Published **${title}** in ${channel} as **${creditedName}**. [View release](${jumpUrl})`);
    } catch (error) {
      console.error('Could not publish work through persona webhook:', error);
      return interaction.editReply(`The metrics were saved as work #${workId}, but VERA could not post in ${channel}. Make sure VERA has **Manage Webhooks**, then try \`/work view id:${workId}\`.`);
    }
  },
};
