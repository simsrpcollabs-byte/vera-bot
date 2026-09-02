const db = require('./database');

function choices(rows, labelKey = 'name') {
  return rows.slice(0, 25).map((row) => ({
    name: `${row[labelKey]} (#${row.id ?? row.code})`.slice(0, 100),
    value: String(row.id ?? row.code),
  }));
}

function identityChoices(interaction, approvedOnly = false) {
  const focused = interaction.options.getFocused().toLowerCase();
  const statusSql = approvedOnly ? "AND status = 'approved'" : '';
  const rows = db.prepare(`
    SELECT id, civilian_name AS name
    FROM identities
    WHERE guild_id = ? ${statusSql}
      AND (LOWER(civilian_name) LIKE ? OR CAST(id AS TEXT) LIKE ?)
    ORDER BY civilian_name
    LIMIT 25
  `).all(interaction.guildId, `%${focused}%`, `%${focused}%`);
  return choices(rows);
}

function labelChoices(interaction, approvedOnly = false) {
  const focused = interaction.options.getFocused().toLowerCase();
  const statusSql = approvedOnly ? "AND status = 'approved'" : '';
  const rows = db.prepare(`
    SELECT id, name
    FROM labels
    WHERE guild_id = ? ${statusSql}
      AND (LOWER(name) LIKE ? OR CAST(id AS TEXT) LIKE ?)
    ORDER BY name
    LIMIT 25
  `).all(interaction.guildId, `%${focused}%`, `%${focused}%`);
  return choices(rows);
}

function platformChoices(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const rows = db.prepare(`
    SELECT code, name
    FROM platforms
    WHERE active = 1 AND (LOWER(name) LIKE ? OR LOWER(code) LIKE ?)
    ORDER BY name
    LIMIT 25
  `).all(`%${focused}%`, `%${focused}%`);
  return choices(rows);
}

module.exports = { identityChoices, labelChoices, platformChoices };
