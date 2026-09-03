const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { isAdmin } = require('./access');
const { applyPromotionBoost } = require('./metrics');
const { buildSocialPostEmbed } = require('./socialPosts');
const { publishAsPersona } = require('./proxyPublisher');

const durations = [
  ['1 hour', 60], ['6 hours', 360], ['24 hours', 1440], ['3 days', 4320], ['7 days', 10080],
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('promo')
    .setDescription('Run a timed sponsored placement for a social post.')
    .addSubcommand((sub) => {
      sub.setName('start').setDescription('Start an automatic timed promotion.')
        .addIntegerOption((opt) => opt.setName('post_id').setDescription('Social post ID').setRequired(true).setMinValue(1))
        .addStringOption((opt) => opt.setName('level').setDescription('Promotion strength').setRequired(true).addChoices(
          { name: 'Light', value: 'light' }, { name: 'Standard', value: 'standard' },
          { name: 'Heavy', value: 'heavy' }, { name: 'Saturation', value: 'saturation' },
        ))
        .addIntegerOption((opt) => {
          opt.setName('duration').setDescription('How long the sponsored placement remains live').setRequired(true);
          for (const [name, value] of durations) opt.addChoices({ name, value });
          return opt;
        });
      return sub;
    })
    .addSubcommand((sub) => sub
      .setName('status')
      .setDescription('View the promotion history for a social post.')
      .addIntegerOption((opt) => opt.setName('post_id').setDescription('Social post ID').setRequired(true).setMinValue(1))),

  async execute(interaction) {
    const postId = interaction.options.getInteger('post_id');
    const post = db.prepare(`
      SELECT sp.*, i.civilian_name, i.verified, p.name AS platform_name, p.logo_url, p.brand_color FROM social_posts sp
      JOIN identities i ON i.id = sp.identity_id
      JOIN platforms p ON p.code = sp.platform_code
      WHERE sp.guild_id = ? AND sp.id = ?
    `).get(interaction.guildId, postId);
    if (!post) return interaction.reply({ content: 'That social post was not found.', ephemeral: true });

    if (interaction.options.getSubcommand() === 'status') {
      const rows = db.prepare(`
        SELECT * FROM promotions WHERE guild_id = ? AND social_post_id = ? ORDER BY id DESC LIMIT 10
      `).all(interaction.guildId, postId);
      const description = rows.length ? rows.map((row) => {
        const timing = row.status === 'active' ? `ends <t:${Math.floor(row.expires_at_ms / 1000)}:R>` : row.status;
        return `**#${row.id}** · ${row.promo_level} · ${durations.find((item) => item[1] === row.duration_minutes)?.[0] || `${row.duration_minutes} minutes`} · ${timing}`;
      }).join('\n') : 'This post has not been promoted.';
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffc857).setTitle(`Promotion history · Post #${postId}`).setDescription(description)], ephemeral: true });
    }

    if (post.submitted_by !== interaction.user.id && !isAdmin(interaction)) {
      return interaction.reply({ content: 'Only the post owner or a VERA admin can promote it.', ephemeral: true });
    }
    const active = db.prepare(`SELECT id FROM promotions WHERE social_post_id = ? AND status = 'active'`).get(postId);
    if (active) return interaction.reply({ content: `Promotion #${active.id} is already active for this post.`, ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const level = interaction.options.getString('level');
    const durationMinutes = interaction.options.getInteger('duration');
    const startsAtMs = Date.now();
    const expiresAtMs = startsAtMs + (durationMinutes * 60_000);
    const metrics = JSON.parse(post.metrics_json);
    const preview = applyPromotionBoost(metrics, level, durationMinutes).metrics;
    const destination = db.prepare(`SELECT channel_id FROM platform_channels WHERE guild_id = ? AND platform_code = ?`)
      .get(interaction.guildId, post.platform_code);
    if (!destination) return interaction.editReply('The official platform channel is no longer configured.');
    const channel = await interaction.client.channels.fetch(destination.channel_id).catch(() => null);
    if (!channel?.isTextBased()) return interaction.editReply('VERA cannot access the configured platform channel.');

    const promoEmbed = buildSocialPostEmbed(post, post, preview, { sponsored: true, expiresAtMs }, post)
      .addFields({ name: 'Campaign', value: `${level.toUpperCase()} promotion · projected campaign metrics`, inline: false });
    let message;
    try {
      message = await publishAsPersona({
        channel,
        platformCode: post.platform_code,
        identityId: post.identity_id,
        creditedName: post.credited_name,
        payload: { embeds: [promoEmbed] },
      });
    } catch (error) {
      console.error('Could not publish promotion through persona webhook:', error);
      return interaction.editReply('VERA could not publish this promotion. Confirm that the persona is linked and VERA has **Manage Webhooks** permission.');
    }
    const result = db.prepare(`
      INSERT INTO promotions
        (guild_id, social_post_id, started_by, promo_level, duration_minutes,
         starts_at_ms, expires_at_ms, channel_id, message_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(interaction.guildId, postId, interaction.user.id, level, durationMinutes,
      startsAtMs, expiresAtMs, channel.id, message.id);
    return interaction.editReply(`Promotion #${result.lastInsertRowid} is live in ${channel} and will end <t:${Math.floor(expiresAtMs / 1000)}:R>. The original post will remain.`);
  },
};
