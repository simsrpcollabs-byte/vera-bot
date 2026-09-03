function verifiedName(name, verified) {
  return verified ? `${name} ✓` : name;
}

function verificationLabel(verified) {
  return verified ? 'Verified VORTEX persona ✓' : 'Unverified';
}

function isRegisteredIdentityName(db, identity, name) {
  if (identity.civilian_name.toLowerCase() === name.toLowerCase()) return true;
  return Boolean(db.prepare(`
    SELECT id FROM identity_aliases
    WHERE identity_id = ? AND active = 1 AND LOWER(alias_name) = LOWER(?)
  `).get(identity.id, name));
}

function platformColor(platform, fallback = 0x28c8ff) {
  const value = platform?.brand_color?.replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(value || '') ? Number.parseInt(value, 16) : fallback;
}

function applyPlatformBrand(embed, platform, fallback) {
  embed.setColor(platformColor(platform, fallback));
  if (platform?.logo_url) embed.setThumbnail(platform.logo_url);
  return embed;
}

module.exports = {
  verifiedName,
  verificationLabel,
  isRegisteredIdentityName,
  platformColor,
  applyPlatformBrand,
};
