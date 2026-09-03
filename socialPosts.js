const { EmbedBuilder } = require('discord.js');
const { verifiedName } = require('./display');

function platformColor(platformCode) {
  return platformCode === 'XPOSURE' ? 0xff5edb : 0xff7a67;
}

function buildSocialPostEmbed(post, identity, metrics, options = {}) {
  const platformName = post.platform_code === 'XPOSURE' ? 'Xposure' : 'KNETIK';
  const embed = new EmbedBuilder()
    .setColor(platformColor(post.platform_code))
    .setAuthor({ name: verifiedName(post.credited_name, identity.verified) })
    .setTitle(options.sponsored ? `${platformName} · Sponsored` : platformName)
    .setDescription(post.caption)
    .addFields(...(metrics?.fields || []).slice(0, 5))
    .setFooter({ text: `${identity.verified ? 'Verified VORTEX persona · ' : ''}Post #${post.id}` })
    .setTimestamp(new Date(post.created_at || Date.now()));
  if (post.media_url && post.media_type?.startsWith('image/')) embed.setImage(post.media_url);
  else if (post.media_url) embed.addFields({ name: 'Media', value: `[View upload](${post.media_url})`, inline: false });
  if (options.expiresAtMs) {
    embed.addFields({ name: 'Promotion ends', value: `<t:${Math.floor(options.expiresAtMs / 1000)}:R>`, inline: false });
  }
  return embed;
}

module.exports = { buildSocialPostEmbed, platformColor };
