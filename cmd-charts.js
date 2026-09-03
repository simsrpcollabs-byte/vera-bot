const { ChannelType, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('./database');
const { identityChoices } = require('./autocomplete');
const { isAdmin } = require('./access');
const { chartDefinitions, buildChartWeek, getChart, movement, weekKeyFor } = require('./chartEngine');
const { verifiedName } = require('./display');
const { audienceLabel } = require('./audience');

const chartCodes = ['songs', 'albums', 'television', 'frame', 'knetik', 'exposure'];
const dayChoices = [
  ['Sunday', 0], ['Monday', 1], ['Tuesday', 2], ['Wednesday', 3],
  ['Thursday', 4], ['Friday', 5], ['Saturday', 6],
];

function chartLine(entry) {
  return `**#${entry.rank}** ${movement(entry)} · **${entry.title}** — ${verifiedName(entry.credited_name, entry.verified)}\n`+
    `Peak #${entry.peak_rank} · ${entry.weeks_on_chart} week${entry.weeks_on_chart === 1 ? '' : 's'}`;
}

function createChartEmbed(guildId, code, limit = 10) {
  const definition = chartDefinitions[code];
  const entries = getChart(guildId, code, limit);
  return new EmbedBuilder()
    .setColor(code === 'exposure' ? 0xff5edb : code === 'knetik' ? 0xff7a67 : 0x2ddcff)
    .setTitle(`${definition.emoji} ${definition.name}`)
    .setDescription(entries.length ? entries.map(chartLine).join('\n\n') : 'No eligible releases have entered this chart yet.')
    .setFooter({ text: `VERA // ${weekKeyFor()} · updates automatically` })
    .setTimestamp();
}

function createWeeklyDigest(guildId) {
  buildChartWeek(guildId);
  const fields = chartCodes.map((code) => {
    const definition = chartDefinitions[code];
    const [numberOne] = getChart(guildId, code, 1);
    return {
      name: `${definition.emoji} ${definition.name}`,
      value: numberOne ? `**#1 ${numberOne.title}**\n${verifiedName(numberOne.credited_name, numberOne.verified)}` : 'No entries yet',
      inline: true,
    };
  });
  const gainers = chartCodes.flatMap((code) => getChart(guildId, code, 25)
    .filter((entry) => entry.previous_rank && entry.previous_rank > entry.rank)
    .map((entry) => ({ ...entry, gain: entry.previous_rank - entry.rank, code })))
    .sort((a, b) => b.gain - a.gain);
  const breakout = chartCodes.flatMap((code) => getChart(guildId, code, 25)
    .filter((entry) => !entry.previous_rank)
    .map((entry) => ({ ...entry, code })))
    .sort((a, b) => a.rank - b.rank)[0];
  fields.push({
    name: '🚀 Biggest gainer',
    value: gainers[0] ? `**${gainers[0].title}** rises ${gainers[0].gain} spots on ${chartDefinitions[gainers[0].code].name}.` : 'No returning gainer this week.',
    inline: false,
  });
  fields.push({
    name: '✨ Breakout release',
    value: breakout ? `**${breakout.title}** enters ${chartDefinitions[breakout.code].name} at #${breakout.rank}.` : 'No new breakout this week.',
    inline: false,
  });
  return new EmbedBuilder()
    .setColor(0x6757ff)
    .setTitle(`VERA // ${weekKeyFor()}`)
    .setDescription('The official weekly pulse of entertainment across The Vortex.')
    .addFields(...fields)
    .setFooter({ text: 'PULSE · Lumi · Canvas · FRAME · Xposure · KNETIK' })
    .setTimestamp();
}

function metricValue(metrics, name) {
  return metrics?.fields?.find((field) => field.name === name)?.value || '—';
}

module.exports = {
  data: (() => {
    const command = new SlashCommandBuilder().setName('charts').setDescription('Browse VERA rankings, careers, and ratings histories.');
    for (const code of chartCodes) {
      command.addSubcommand((sub) => sub
        .setName(code)
        .setDescription(`View ${chartDefinitions[code].name}.`)
        .addIntegerOption((opt) => opt.setName('entries').setDescription('Number of positions to display').addChoices(
          { name: 'Top 10', value: 10 }, { name: 'Top 25', value: 25 },
        )));
    }
    command
      .addSubcommand((sub) => sub
        .setName('artist')
        .setDescription('View an artist or creator career summary.')
        .addStringOption((opt) => opt.setName('persona').setDescription('Artist or creator persona').setRequired(true).setAutocomplete(true)))
      .addSubcommand((sub) => sub
        .setName('show')
        .setDescription('View a series and its episode ratings history.')
        .addStringOption((opt) => opt.setName('series').setDescription('Registered television show').setRequired(true).setAutocomplete(true)))
      .addSubcommand((sub) => {
        sub.setName('setup').setDescription('Choose where and when VERA publishes the weekly issue.')
          .addChannelOption((opt) => opt.setName('channel').setDescription('Weekly charts channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
          .addIntegerOption((opt) => {
            opt.setName('day').setDescription('Publication day').setRequired(true);
            for (const [name, value] of dayChoices) opt.addChoices({ name, value });
            return opt;
          })
          .addIntegerOption((opt) => opt.setName('hour').setDescription('Publication hour in Central Time (0–23)').setRequired(true).setMinValue(0).setMaxValue(23));
        return sub;
      })
      .addSubcommand((sub) => sub.setName('publish').setDescription('Publish this week’s VERA issue now.'));
    return command;
  })(),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'persona') return interaction.respond(identityChoices(interaction, true));
    const search = focused.value.toLowerCase();
    const shows = db.prepare(`
      SELECT id, title, credited_name FROM works
      WHERE guild_id = ? AND status = 'released' AND work_type = 'show'
        AND (LOWER(title) LIKE ? OR LOWER(credited_name) LIKE ? OR CAST(id AS TEXT) LIKE ?)
      ORDER BY title LIMIT 25
    `).all(interaction.guildId, `%${search}%`, `%${search}%`, `%${search}%`);
    return interaction.respond(shows.map((show) => ({
      name: `${show.title} — ${show.credited_name} (#${show.id})`.slice(0, 100), value: String(show.id),
    })));
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (chartCodes.includes(subcommand)) {
      return interaction.reply({ embeds: [createChartEmbed(interaction.guildId, subcommand, interaction.options.getInteger('entries') || 10)] });
    }

    if (subcommand === 'setup') {
      if (!isAdmin(interaction)) return interaction.reply({ content: 'Only a VERA admin can configure weekly publication.', ephemeral: true });
      const channel = interaction.options.getChannel('channel');
      const day = interaction.options.getInteger('day');
      const hour = interaction.options.getInteger('hour');
      db.prepare(`
        INSERT INTO chart_settings (guild_id, channel_id, publish_day, publish_hour, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id,
          publish_day = excluded.publish_day, publish_hour = excluded.publish_hour,
          updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
      `).run(interaction.guildId, channel.id, day, hour, interaction.user.id);
      return interaction.reply({ content: `VERA will publish weekly in ${channel} every ${dayChoices.find((item) => item[1] === day)[0]} at ${String(hour).padStart(2, '0')}:00 Central Time.`, ephemeral: true });
    }

    if (subcommand === 'publish') {
      if (!isAdmin(interaction)) return interaction.reply({ content: 'Only a VERA admin can publish the weekly issue.', ephemeral: true });
      const embed = createWeeklyDigest(interaction.guildId);
      const week = buildChartWeek(interaction.guildId);
      db.prepare(`UPDATE chart_weeks SET published_at = CURRENT_TIMESTAMP, channel_id = ? WHERE id = ?`).run(interaction.channelId, week.id);
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'artist') {
      buildChartWeek(interaction.guildId);
      const identityId = Number(interaction.options.getString('persona'));
      const identity = db.prepare(`SELECT * FROM identities WHERE guild_id = ? AND id = ? AND status = 'approved'`).get(interaction.guildId, identityId);
      if (!identity) return interaction.reply({ content: 'That persona was not found.', ephemeral: true });
      const stats = db.prepare(`
        SELECT COUNT(DISTINCT w.id) AS releases,
          COUNT(DISTINCT CASE WHEN ce.rank = 1 THEN w.id END) AS number_ones,
          COUNT(DISTINCT CASE WHEN ce.rank <= 10 THEN w.id END) AS top_tens,
          MIN(ce.rank) AS best_rank
        FROM works w LEFT JOIN chart_entries ce ON ce.work_id = w.id
        WHERE w.guild_id = ? AND w.identity_id = ? AND w.status = 'released'
      `).get(interaction.guildId, identityId);
      const aliases = db.prepare(`SELECT alias_name FROM identity_aliases WHERE identity_id = ? AND active = 1 ORDER BY id`).all(identityId);
      const social = db.prepare(`SELECT platform_code, followers FROM social_profiles WHERE guild_id = ? AND identity_id = ? ORDER BY platform_code`).all(interaction.guildId, identityId);
      const releases = db.prepare(`
        SELECT w.title, w.credited_name, MIN(ce.rank) AS peak
        FROM works w LEFT JOIN chart_entries ce ON ce.work_id = w.id
        WHERE w.guild_id = ? AND w.identity_id = ? AND w.status = 'released'
        GROUP BY w.id ORDER BY w.created_at DESC LIMIT 5
      `).all(interaction.guildId, identityId);
      const embed = new EmbedBuilder().setColor(0x6757ff).setTitle(verifiedName(identity.civilian_name, identity.verified))
        .setDescription(aliases.length ? `Also known as **${aliases.map((alias) => alias.alias_name).join(', ')}**` : 'VERA career profile')
        .addFields(
          { name: 'Published releases', value: String(stats.releases), inline: true },
          { name: 'Top 10s', value: String(stats.top_tens), inline: true },
          { name: '#1s', value: String(stats.number_ones), inline: true },
          { name: 'Career peak', value: stats.best_rank ? `#${stats.best_rank}` : 'Not charted', inline: true },
          { name: 'Platform audiences', value: social.length ? social.map((row) => `**${row.platform_code}:** ${Number(row.followers).toLocaleString()} ${audienceLabel(row.platform_code)}`).join('\n') : 'No tracked audience yet' },
          { name: 'Recent work', value: releases.length ? releases.map((work) => `**${work.title}** — ${work.credited_name}${work.peak ? ` · Peak #${work.peak}` : ''}`).join('\n') : 'No published work yet' },
        ).setFooter({ text: `Persona #${identity.id} · VERA career history` });
      return interaction.reply({ embeds: [embed] });
    }

    const seriesId = Number(interaction.options.getString('series'));
    const series = db.prepare(`
      SELECT w.*, wm.metrics_json, i.verified FROM works w
      JOIN identities i ON i.id = w.identity_id
      LEFT JOIN work_metrics wm ON wm.work_id = w.id
      WHERE w.guild_id = ? AND w.id = ? AND w.work_type = 'show' AND w.status = 'released'
    `).get(interaction.guildId, seriesId);
    if (!series) return interaction.reply({ content: 'That registered television show was not found.', ephemeral: true });
    const episodes = db.prepare(`
      SELECT w.*, wm.metrics_json FROM works w JOIN work_metrics wm ON wm.work_id = w.id
      WHERE w.guild_id = ? AND w.parent_work_id = ? AND w.work_type = 'episode' AND w.status = 'released'
      ORDER BY w.created_at, w.id
    `).all(interaction.guildId, seriesId);
    const lines = episodes.map((episode, index) => {
      let metrics = {}; try { metrics = JSON.parse(episode.metrics_json); } catch {}
      return `**${index + 1}. ${episode.title}** · 7-day ${metricValue(metrics, '7-day viewers')} · 18–49 ${metricValue(metrics, '18–49 rating')} · Audience ${metricValue(metrics, 'Audience score')}`;
    });
    let seriesMetrics = {}; try { seriesMetrics = JSON.parse(series.metrics_json); } catch {}
    const best = db.prepare(`SELECT MIN(rank) AS peak FROM chart_entries WHERE work_id = ? AND chart_code = 'television'`).get(seriesId);
    const visibleLines = lines.slice(0, 8);
    if (lines.length > visibleLines.length) visibleLines.push(`*Plus ${lines.length - visibleLines.length} more episode(s).*`);
    const embed = new EmbedBuilder().setColor(0x8b63ff).setTitle(`📺 ${series.title}`)
      .setDescription(`${verifiedName(series.credited_name, series.verified)} · ${series.platform_code}`)
      .addFields(
        { name: 'Series opening', value: `7-day ${metricValue(seriesMetrics, '7-day viewers')} · Audience ${metricValue(seriesMetrics, 'Audience score')}` },
        { name: 'Chart peak', value: best.peak ? `#${best.peak} on VORTEX Television` : 'Not charted yet', inline: true },
        { name: 'Episodes tracked', value: String(episodes.length), inline: true },
        { name: 'Ratings history', value: visibleLines.length ? visibleLines.join('\n') : 'No episodes are linked to this series yet.' },
      ).setFooter({ text: `Series work #${series.id}` });
    return interaction.reply({ embeds: [embed] });
  },

  createWeeklyDigest,
};
