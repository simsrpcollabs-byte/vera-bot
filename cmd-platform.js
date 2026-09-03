const { ChannelType, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { platformChoices } = require('./autocomplete');
const { isAdmin } = require('./access');
const { ensurePlatformWebhook } = require('./proxyPublisher');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('platform')
    .setDescription('View VORTEX networks and platforms.')
    .addSubcommand((sub) => sub.setName('list').setDescription('List active platforms.'))
    .addSubcommand((sub) => sub
      .setName('channel')
      .setDescription('Choose the official Discord channel for a platform.')
      .addStringOption((opt) => opt.setName('platform').setDescription('Platform').setRequired(true).setAutocomplete(true))
      .addChannelOption((opt) => opt.setName('channel').setDescription('Official platform channel').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((sub) => sub
      .setName('branding')
      .setDescription('Set a platform logo and brand color.')
      .addStringOption((opt) => opt.setName('platform').setDescription('Platform').setRequired(true).setAutocomplete(true))
      .addAttachmentOption((opt) => opt.setName('logo').setDescription('Platform logo image'))
      .addStringOption((opt) => opt.setName('logo_url').setDescription('Or paste a direct logo URL').setMaxLength(500))
      .addStringOption((opt) => opt.setName('color').setDescription('Six-digit hex color, such as 2DDCFF').setMaxLength(7))),

  async autocomplete(interaction) {
    await interaction.respond(platformChoices(interaction));
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'channel' || subcommand === 'branding') {
      if (!isAdmin(interaction)) return interaction.reply({ content: 'Only a VERA admin can configure platform channels.', ephemeral: true });
      const platformCode = interaction.options.getString('platform').toUpperCase();
      const platform = db.prepare(`SELECT * FROM platforms WHERE code = ? AND active = 1`).get(platformCode);
      if (!platform) return interaction.reply({ content: 'That platform was not found.', ephemeral: true });
      if (subcommand === 'branding') {
        const attachment = interaction.options.getAttachment('logo');
        const typedUrl = interaction.options.getString('logo_url')?.trim();
        const rawColor = interaction.options.getString('color')?.trim().replace(/^#/, '').toUpperCase();
        if (attachment?.contentType && !attachment.contentType.startsWith('image/')) {
          return interaction.reply({ content: 'The platform logo must be an image.', ephemeral: true });
        }
        if (typedUrl) {
          try {
            const url = new URL(typedUrl);
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
          } catch {
            return interaction.reply({ content: 'The logo URL must be a full http or https link.', ephemeral: true });
          }
        }
        if (rawColor && !/^[0-9A-F]{6}$/.test(rawColor)) {
          return interaction.reply({ content: 'Use a six-digit hex color such as `2DDCFF`.', ephemeral: true });
        }
        const logoUrl = attachment?.url || typedUrl || platform.logo_url;
        const brandColor = rawColor || platform.brand_color;
        if (!attachment && !typedUrl && !rawColor) {
          return interaction.reply({ content: 'Add a logo image, logo URL, or brand color to update.', ephemeral: true });
        }
        db.prepare(`UPDATE platforms SET logo_url = ?, brand_color = ? WHERE code = ?`)
          .run(logoUrl, brandColor, platformCode);
        const embed = new EmbedBuilder()
          .setColor(Number.parseInt(brandColor || '28C8FF', 16))
          .setTitle(`${platform.name} branding updated`)
          .setDescription(`Brand color: **#${brandColor || '28C8FF'}**`);
        if (logoUrl) embed.setThumbnail(logoUrl);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      const channel = interaction.options.getChannel('channel');
      try {
        // Save the channel first so the publisher can create/reuse its webhook.
        db.prepare(`
          INSERT INTO platform_channels (guild_id, platform_code, channel_id, configured_by, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(guild_id, platform_code) DO UPDATE SET channel_id = excluded.channel_id,
            webhook_id = CASE WHEN platform_channels.channel_id = excluded.channel_id THEN platform_channels.webhook_id ELSE NULL END,
            webhook_token = CASE WHEN platform_channels.channel_id = excluded.channel_id THEN platform_channels.webhook_token ELSE NULL END,
            configured_by = excluded.configured_by, updated_at = CURRENT_TIMESTAMP
        `).run(interaction.guildId, platformCode, channel.id, interaction.user.id);
        await ensurePlatformWebhook(channel, platformCode);
      } catch (error) {
        console.error('Could not configure platform publishing webhook:', error);
        return interaction.reply({
          content: `VERA could not create the ${platform.name} publisher in ${channel}. Make sure VERA has **Manage Webhooks**, **View Channel**, and **Send Messages** permissions, then run this command again.`,
          ephemeral: true,
        });
      }
      return interaction.reply({ content: `Official **${platform.name}** posts will now publish in ${channel} under each persona’s stage or screen name.`, ephemeral: true });
    }
    const rows = db.prepare(`
      SELECT p.name, p.category, p.description, p.logo_url, p.brand_color, pc.channel_id
      FROM platforms p LEFT JOIN platform_channels pc
        ON pc.platform_code = p.code AND pc.guild_id = ?
      WHERE p.active = 1 ORDER BY p.category, p.name
    `).all(interaction.guildId);
    const embed = new EmbedBuilder()
      .setColor(0x28c8ff)
      .setTitle('Registered Networks & Platforms')
      .setDescription(rows.map((row) => `**${row.name}** — ${row.description}${row.channel_id ? ` · <#${row.channel_id}>` : ' · channel not assigned'}${row.logo_url ? ' · logo ✓' : ''}`).join('\n'));
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
