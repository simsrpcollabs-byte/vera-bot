const { SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { identityChoices } = require('./autocomplete');
const { publishStory } = require('./cultureline');
const { applyGovernmentImpact } = require('./government');

function ownedPersona(interaction, identityId) {
  return db.prepare(`
    SELECT * FROM identities
    WHERE id = ? AND owner_user_id = ? AND status = 'approved'
  `).get(identityId, interaction.user.id);
}

function recordEvent(interaction, eventType, workId = null) {
  db.prepare(`
    INSERT INTO cultureline_events (guild_id, work_id, event_key, event_type, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(interaction.guildId, workId, `${eventType}:${interaction.id}`, eventType, interaction.user.id);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cultureline')
    .setDescription('Report a newsworthy persona appearance or public feud to CultureLine.')
    .addSubcommand((sub) => sub
      .setName('appearance')
      .setDescription('Announce a public appearance for one of your personas.')
      .addStringOption((opt) => opt.setName('persona').setDescription('Persona making the appearance').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('event').setDescription('Event, premiere, performance, interview, or appearance').setRequired(true).setMaxLength(150))
      .addStringOption((opt) => opt.setName('details').setDescription('Brief public details').setMaxLength(500))
      .addStringOption((opt) => opt.setName('location').setDescription('Venue or location').setMaxLength(100)))
    .addSubcommand((sub) => sub
      .setName('feud')
      .setDescription('Report a public feud involving one of your personas.')
      .addStringOption((opt) => opt.setName('persona').setDescription('Your persona involved in the feud').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('opponent').setDescription('Other persona involved').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName('details').setDescription('What happened publicly?').setRequired(true).setMaxLength(500))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    await interaction.respond(identityChoices(interaction, true, focused.name === 'persona'));
  },

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const subcommand = interaction.options.getSubcommand();
    const identityId = Number(interaction.options.getString('persona'));
    const persona = ownedPersona(interaction, identityId);
    if (!persona) return interaction.editReply('You can only submit CultureLine events for personas you registered.');

    if (subcommand === 'appearance') {
      const event = interaction.options.getString('event').trim();
      const details = interaction.options.getString('details')?.trim();
      const location = interaction.options.getString('location')?.trim();
      const message = await publishStory({
        client: interaction.client,
        guildId: interaction.guildId,
        headline: 'SPOTTED',
        description: `**${persona.civilian_name}${persona.verified ? ' ✓' : ''}** made an appearance at **${event}**.${details ? `\n\n${details}` : ''}`,
        fields: location ? [{ name: 'Location', value: location, inline: true }] : [],
        color: 0xf04f8b,
        thumbnailUrl: persona.profile_photo_url,
      });
      if (!message) return interaction.editReply('CultureLine could not publish because the official ECHO channel is not configured.');
      recordEvent(interaction, 'appearance');
      applyGovernmentImpact(db, persona.id, { recognition: 0.2, attention: 0.25, favorability: 0.05 });
      return interaction.editReply(`CultureLine published the appearance in <#${message.channelId}>.`);
    }

    const opponentId = Number(interaction.options.getString('opponent'));
    const opponent = db.prepare(`SELECT * FROM identities WHERE id = ? AND status = 'approved'`)
      .get(opponentId);
    if (!opponent) return interaction.editReply('The other persona was not found.');
    if (opponent.id === persona.id) return interaction.editReply('Choose a different persona as the other side of the feud.');
    const details = interaction.options.getString('details').trim();
    const message = await publishStory({
      client: interaction.client,
      guildId: interaction.guildId,
      headline: 'PUBLIC FEUD',
      description: `Things are getting tense between **${persona.civilian_name}${persona.verified ? ' ✓' : ''}** and **${opponent.civilian_name}${opponent.verified ? ' ✓' : ''}**.\n\n${details}`,
      fields: [{ name: 'Status', value: 'Developing', inline: true }],
      color: 0xed1c24,
      thumbnailUrl: persona.profile_photo_url,
    });
    if (!message) return interaction.editReply('CultureLine could not publish because the official ECHO channel is not configured.');
    recordEvent(interaction, 'public_feud');
    applyGovernmentImpact(db, persona.id, { attention: 0.45, controversy: 0.5, trust: -0.08 });
    applyGovernmentImpact(db, opponent.id, { attention: 0.45, controversy: 0.5, trust: -0.08 });
    return interaction.editReply(`CultureLine published the feud in <#${message.channelId}>.`);
  },
};
