const { PermissionFlagsBits } = require('discord.js');
const config = require('./config');

function isAdmin(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (!config.adminRoleId) return false;
  return interaction.member?.roles?.cache?.has(config.adminRoleId) ?? false;
}

function ownsIdentity(db, guildId, identityId, userId) {
  const identity = db.prepare(`
    SELECT * FROM identities WHERE id = ?
  `).get(identityId);
  return { identity, allowed: Boolean(identity && identity.owner_user_id === userId) };
}

module.exports = { isAdmin, ownsIdentity };
