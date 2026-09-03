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

module.exports = { verifiedName, verificationLabel, isRegisteredIdentityName };
