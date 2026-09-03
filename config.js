require('dotenv').config();

function requireValue(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

module.exports = {
  token: requireValue('DISCORD_TOKEN'),
  clientId: requireValue('CLIENT_ID'),
  guildId: requireValue('GUILD_ID'),
  adminRoleId: process.env.ADMIN_ROLE_ID?.trim() || null,
  databaseUrl: requireValue('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL?.trim().toLowerCase() !== 'false',
};
