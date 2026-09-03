const db = require('./database');
const { buildChartWeek, weekKeyFor } = require('./chartEngine');
const { createWeeklyDigest } = require('./cmd-charts');

const weekdayNumbers = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function localScheduleParts(timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { day: weekdayNumbers[values.weekday], hour: Number(values.hour) };
}

async function publishDueIssues(client) {
  const settings = db.prepare(`SELECT * FROM chart_settings WHERE channel_id IS NOT NULL`).all();
  for (const setting of settings) {
    const now = localScheduleParts(setting.timezone || 'America/Chicago');
    if (now.day !== setting.publish_day || now.hour !== setting.publish_hour) continue;
    const weekKey = weekKeyFor();
    const chartWeek = buildChartWeek(setting.guild_id, weekKey);
    if (chartWeek.published_at) continue;
    try {
      const channel = await client.channels.fetch(setting.channel_id);
      if (!channel?.isTextBased()) throw new Error('Configured chart channel is not text-based.');
      await channel.send({ embeds: [createWeeklyDigest(setting.guild_id)] });
      db.prepare(`
        UPDATE chart_weeks SET published_at = CURRENT_TIMESTAMP, channel_id = ? WHERE id = ?
      `).run(setting.channel_id, chartWeek.id);
      console.log(`Published VERA weekly issue ${weekKey} in guild ${setting.guild_id}.`);
    } catch (error) {
      console.error(`Could not publish VERA weekly issue for guild ${setting.guild_id}:`, error);
    }
  }
}

function startWeeklyPublisher(client) {
  publishDueIssues(client).catch((error) => console.error('Weekly chart check failed:', error));
  const timer = setInterval(() => {
    publishDueIssues(client).catch((error) => console.error('Weekly chart check failed:', error));
  }, 60_000);
  timer.unref();
}

module.exports = { publishDueIssues, startWeeklyPublisher };
