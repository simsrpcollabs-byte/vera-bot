const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { identityChoices } = require('./autocomplete');
const { isAdmin } = require('./access');
const { generateOpeningMetrics } = require('./metrics');
const { buildSocialPostEmbed } = require('./socialPosts');
const { isRegisteredIdentityName } = require('./display');
const { publishAsPersona } = require('./proxyPublisher');
const { addAudience, audienceGain } = require('./audience');

function validImageUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('post')
    .setDescription('Publish and view Xposure or KNETIK content.')
    .addSubcommand((sub) => sub
      .setName('submit')
      .setDescription('Publish a social post in its official platform channel.')
      .addStringOption((opt) => opt.setName('persona').setDescription('Persona behind the account').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('platform').setDescription('Social platform').setRequired(true).addChoices(
        { name: 'Xposure', value: 'XPOSURE' }, { name: 'KNETIK', value: 'KNETIK' },
      ))
      .addStringOption((opt) => opt.setName('credited_name').setDescription('Stage name or social handle shown publicly').setRequired(true).setMaxLength(80))
      .addStringOption((opt) => opt.setName('caption').setDescription('Post caption').setRequired(true).setMaxLength(1800))
      .addAttachmentOption((opt) => opt.setName('media').setDescription('Optional image or video'))
      .addStringOption((opt) => opt.setName('media_url').setDescription('Optional direct image or video URL').setMaxLength(500)))
    .addSubcommand((sub) => sub
      .setName('view')
      .setDescription('View a saved social post and its current metrics.')
      .addIntegerOption((opt) => opt.setName('id').setDescription('Post ID').setRequired(true).setMinValue(1))),

  async autocomplete(interaction) {
    await interaction.respond(identityChoices(interaction, true));
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'view') {
      const post = db.prepare(`
        SELECT sp.*, i.civilian_name, i.verified, p.name AS platform_name,
               p.logo_url, p.brand_color
        FROM social_posts sp JOIN identities i ON i.id = sp.identity_id
        JOIN platforms p ON p.code = sp.platform_code
        WHERE sp.guild_id = ? AND sp.id = ?
      `).get(interaction.guildId, interaction.options.getInteger('id'));
      if (!post) return interaction.reply({ content: 'That social post was not found.', ephemeral: true });
      return interaction.reply({ embeds: [buildSocialPostEmbed(post, post, JSON.parse(post.metrics_json), {}, post)] });
    }

    await interaction.deferReply({ ephemeral: true });
    const identityId = Number(interaction.options.getString('persona'));
    const identity = db.prepare(`SELECT * FROM identities WHERE guild_id = ? AND id = ? AND status = 'approved'`)
      .get(interaction.guildId, identityId);
    if (!identity) return interaction.editReply('That persona was not found.');
    if (identity.owner_user_id !== interaction.user.id && !isAdmin(interaction)) {
      return interaction.editReply('Only the persona owner or a VERA admin can publish for this account.');
    }

    const platformCode = interaction.options.getString('platform');
    const platform = db.prepare(`SELECT * FROM platforms WHERE code = ? AND active = 1`).get(platformCode);
    const destination = db.prepare(`SELECT channel_id FROM platform_channels WHERE guild_id = ? AND platform_code = ?`)
      .get(interaction.guildId, platformCode);
    if (!destination) return interaction.editReply(`A VERA admin must configure the official ${platform.name} channel with \`/platform channel\` first.`);
    const channel = await interaction.client.channels.fetch(destination.channel_id).catch(() => null);
    if (!channel?.isTextBased()) return interaction.editReply('VERA cannot access the configured platform channel. Ask an admin to configure it again.');
    const personaProxy = db.prepare(`SELECT id FROM tupper_links WHERE guild_id = ? AND identity_id = ? AND active = 1 ORDER BY id DESC LIMIT 1`)
      .get(interaction.guildId, identityId);
    if (!personaProxy) return interaction.editReply('Link this persona’s Tupperbox proxy with `/persona link-tupper` before publishing.');

    const attachment = interaction.options.getAttachment('media');
    if (attachment?.contentType && !attachment.contentType.startsWith('image/') && !attachment.contentType.startsWith('video/')) {
      return interaction.editReply('The post attachment must be an image or video.');
    }
    const typedUrl = interaction.options.getString('media_url');
    const mediaUrl = attachment?.url || validImageUrl(typedUrl);
    const mediaType = attachment?.contentType || (typedUrl ? 'link' : null);
    if (typedUrl && !mediaUrl) return interaction.editReply('That media URL is not valid. Use a full http or https link.');
    const caption = interaction.options.getString('caption').trim();
    const creditedName = interaction.options.getString('credited_name').trim();
    if (!isRegisteredIdentityName(db, identity, creditedName)) {
      return interaction.editReply('That stage name or handle is not registered to this persona. Add it first with `/persona alias-add`.');
    }
    const workType = platformCode === 'XPOSURE' ? 'xposure_post' : 'knetik_video';

    const create = db.transaction(() => {
      const workResult = db.prepare(`
        INSERT INTO works
          (guild_id, submitted_by, identity_id, platform_code, title, work_type, credited_name,
           promo_level, status, reviewed_by, reviewed_at, media_url, media_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'standard', 'released', ?, CURRENT_TIMESTAMP, ?, ?)
      `).run(interaction.guildId, interaction.user.id, identityId, platformCode,
        caption.slice(0, 100), workType, creditedName, interaction.user.id, mediaUrl, mediaType);
      const workId = Number(workResult.lastInsertRowid);
      const metrics = generateOpeningMetrics({ workId, title: caption.slice(0, 100), workType, platform, identity, promo: 'standard' });
      db.prepare(`INSERT INTO work_metrics (work_id, metrics_json) VALUES (?, ?)`).run(workId, JSON.stringify(metrics));
      addAudience(db, interaction.guildId, identityId, platformCode, audienceGain(metrics), metrics.chart?.score || 0);
      const postResult = db.prepare(`
        INSERT INTO social_posts
          (guild_id, submitted_by, identity_id, work_id, platform_code, credited_name, caption, media_url, media_type, metrics_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(interaction.guildId, interaction.user.id, identityId, workId, platformCode,
        creditedName, caption, mediaUrl, mediaType, JSON.stringify(metrics));
      return { postId: Number(postResult.lastInsertRowid), workId, metrics };
    });
    const created = create();
    const post = { id: created.postId, platform_code: platformCode, credited_name: creditedName, caption, media_url: mediaUrl, media_type: mediaType, created_at: new Date().toISOString() };
    let message;
    try {
      message = await publishAsPersona({
        channel,
        platformCode,
        identityId,
        creditedName,
        payload: { embeds: [buildSocialPostEmbed(post, identity, created.metrics, {}, platform)] },
      });
    } catch (error) {
      console.error('Could not publish social post through persona webhook:', error);
      return interaction.editReply(`The metrics were saved as post #${created.postId}, but VERA could not publish it. Make sure VERA has **Manage Webhooks** permission.`);
    }
    db.prepare(`UPDATE social_posts SET channel_id = ?, message_id = ? WHERE id = ?`)
      .run(channel.id, message.id, created.postId);
    const jumpUrl = `https://discord.com/channels/${interaction.guildId}/${channel.id}/${message.id}`;
    return interaction.editReply(`Published **post #${created.postId}** to ${channel}. [View post](${jumpUrl})`);
  },
};
