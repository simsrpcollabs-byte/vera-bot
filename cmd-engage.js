const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const db = require('./database');
const { identityChoices } = require('./autocomplete');
const { isAdmin } = require('./access');
const { applyPlatformBrand } = require('./display');
const { publishAsPersona } = require('./proxyPublisher');
const { maybePublishTraction } = require('./cultureline');

const ACTIONS = {
  LUMI: [['watch', 'Watch', '▶️'], ['rate', 'Rate', '⭐'], ['review', 'Review', '📝']],
  CANVAS: [['watch', 'Watch', '▶️'], ['rate', 'Rate', '⭐'], ['review', 'Review', '📝']],
  PULSE: [['stream', 'Stream', '🎧'], ['save', 'Save', '💾'], ['share', 'Share', '↗️']],
  FRAME: [['watch', 'Watch', '▶️'], ['like', 'Like', '❤️'], ['comment', 'Comment', '💬'], ['share', 'Share', '↗️']],
  XPOSURE: [['flash', 'Flash', '📸'], ['comment', 'Comment', '💬'], ['share', 'Share', '↗️']],
  KNETIK: [['watch', 'Watch', '▶️'], ['like', 'Like', '❤️'], ['comment', 'Comment', '💬'], ['share', 'Share', '↗️']],
  ECHO: [['like', 'Like', '❤️'], ['reply', 'Reply', '💬'], ['echo', 'Echo', '🔊']],
};

const SCORE = { watch: 8, stream: 8, like: 5, flash: 5, save: 7, share: 12, echo: 16, comment: 10, reply: 10, review: 12 };
const TEXT_ACTIONS = new Set(['comment', 'reply', 'review']);
const PAST_TENSE = { watch: 'watched', stream: 'streamed', like: 'liked', flash: 'flashed', save: 'saved', share: 'shared', echo: 'echoed' };
const REACTION_ACTIONS = new Set(['watch', 'stream']);

function parseId(customId) {
  const [root, step, identityId, workId, action] = customId.split(':');
  return { root, step, identityId: Number(identityId), workId: Number(workId), action };
}

function ownsPersona(interaction, identityId) {
  const identity = db.prepare(`SELECT * FROM identities WHERE guild_id = ? AND id = ? AND status = 'approved'`)
    .get(interaction.guildId, identityId);
  if (!identity) return null;
  if (identity.owner_user_id !== interaction.user.id) return null;
  return identity;
}

function platformMenu(identityId) {
  const platforms = db.prepare(`SELECT code, name, description FROM platforms WHERE active = 1 ORDER BY category, name`).all();
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`engage:platform:${identityId}`)
    .setPlaceholder('Choose a network or platform')
    .addOptions(platforms.slice(0, 25).map((platform) => ({
      label: platform.name,
      value: platform.code,
      description: (platform.description || 'Browse available content').slice(0, 100),
    }))));
}

function contentMenu(identityId, platformCode, works) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`engage:content:${identityId}:${platformCode}`)
    .setPlaceholder(`Choose ${platformCode} content`)
    .addOptions(works.map((work) => ({
      label: work.title.slice(0, 100),
      value: String(work.id),
      description: `${work.credited_name} · ${work.work_type}`.slice(0, 100),
    }))));
}

function actionRows(identityId, work) {
  const buttons = (ACTIONS[work.platform_code] || [['like', 'Like', '❤️']]).map(([action, label, emoji]) => new ButtonBuilder()
    .setCustomId(`engage:act:${identityId}:${work.id}:${action}`)
    .setLabel(label).setEmoji(emoji).setStyle(action === 'echo' || action === 'share' ? ButtonStyle.Primary : ButtonStyle.Secondary));
  return [new ActionRowBuilder().addComponents(buttons)];
}

function reactionRow(identityId, workId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`engage:react:${identityId}:${workId}:up`).setLabel('I liked it').setEmoji('👍').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`engage:react:${identityId}:${workId}:down`).setLabel('Not for me').setEmoji('👎').setStyle(ButtonStyle.Danger),
  );
}

function workEmbed(work, prompt = 'Choose how this persona engages.') {
  const embed = new EmbedBuilder()
    .setTitle(work.title)
    .setDescription(prompt)
    .addFields(
      { name: 'Credited to', value: work.credited_name, inline: true },
      { name: 'Platform', value: work.platform_name, inline: true },
      { name: 'Work ID', value: `#${work.id}`, inline: true },
    );
  applyPlatformBrand(embed, work, 0x8a5cff);
  if (work.media_url && work.media_type?.startsWith('image/')) embed.setImage(work.media_url);
  return embed;
}

function changeMetricField(metrics, names, amount = 1) {
  for (const name of names) {
    const target = metrics.fields?.find((field) => field.name.toLowerCase() === name.toLowerCase());
    if (!target) continue;
    const numeric = Number(String(target.value).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(numeric) && !/[KMB]/i.test(String(target.value))) target.value = String(numeric + amount);
    return;
  }
}

function recordEngagement(interaction, identityId, workId, action, responseText = null, rating = null) {
  const work = db.prepare(`
    SELECT w.*, p.name AS platform_name, p.logo_url, p.brand_color
    FROM works w JOIN platforms p ON p.code = w.platform_code
    WHERE w.guild_id = ? AND w.id = ? AND w.status = 'released'
  `).get(interaction.guildId, workId);
  if (!work) throw new Error('That content is no longer available.');
  if (!(ACTIONS[work.platform_code] || []).some(([key]) => key === action)) throw new Error('That engagement is not available here.');

  let points = SCORE[action] || 5;
  if (action === 'rate') points = (Number(rating) - 3) * 8;
  const save = db.transaction(() => {
    db.prepare(`
      INSERT INTO content_engagements (guild_id, work_id, identity_id, engagement_type, response_text, rating, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(interaction.guildId, workId, identityId, action, responseText, rating, interaction.user.id);
    const stored = db.prepare(`SELECT metrics_json FROM work_metrics WHERE work_id = ?`).get(workId);
    if (stored) {
      const metrics = JSON.parse(stored.metrics_json);
      if (metrics.chart) metrics.chart.score = Math.max(0, Number(metrics.chart.score || 0) + points);
      const fieldNames = {
        like: ['Likes'], flash: ['Flashes'], share: ['Shares'], echo: ['Echoes'],
        comment: ['Comments'], reply: ['Replies'], watch: ['Views'], stream: ['Streams'], save: ['Saves'],
      }[action];
      if (fieldNames) changeMetricField(metrics, fieldNames);
      db.prepare(`UPDATE work_metrics SET metrics_json = ? WHERE work_id = ?`).run(JSON.stringify(metrics), workId);
      db.prepare(`UPDATE social_posts SET metrics_json = ? WHERE work_id = ?`).run(JSON.stringify(metrics), workId);
    }
    db.prepare(`UPDATE identities SET heat = LEAST(100, heat + ?), affinity = LEAST(100, GREATEST(0, affinity + ?)) WHERE id = ?`)
      .run(points > 0 ? 0.03 : 0, action === 'rate' ? (Number(rating) - 3) * 0.03 : 0.01, work.identity_id);
  });
  save();
  return { work, points };
}

function modalFor(identityId, workId, action) {
  const isRating = action === 'rate';
  const modal = new ModalBuilder()
    .setCustomId(`engage:modal:${identityId}:${workId}:${action}`)
    .setTitle(isRating ? 'Rate this release' : `${action[0].toUpperCase()}${action.slice(1)}`);
  const input = new TextInputBuilder()
    .setCustomId('response')
    .setLabel(isRating ? 'Rating from 1–5' : action === 'review' ? 'Write your review' : 'What do you want to say?')
    .setStyle(isRating ? TextInputStyle.Short : TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(isRating ? 1 : 300);
  return modal.addComponents(new ActionRowBuilder().addComponents(input));
}

async function publishWrittenResponse(interaction, identityId, work, action, response) {
  if (!TEXT_ACTIONS.has(action)) return null;
  const destination = db.prepare(`SELECT channel_id FROM platform_channels WHERE guild_id = ? AND platform_code = ?`)
    .get(interaction.guildId, work.platform_code);
  if (!destination) throw new Error(`The official ${work.platform_name} channel is not configured.`);
  const channel = await interaction.client.channels.fetch(destination.channel_id).catch(() => null);
  if (!channel?.isTextBased()) throw new Error(`VERA cannot access the official ${work.platform_name} channel.`);
  const link = db.prepare(`SELECT id, tupper_name FROM tupper_links WHERE guild_id = ? AND identity_id = ? AND active = 1 ORDER BY id DESC LIMIT 1`)
    .get(interaction.guildId, identityId);
  if (!link) throw new Error('Link this persona’s Tupperbox proxy before leaving a public comment or review.');
  const identity = db.prepare(`SELECT * FROM identities WHERE id = ?`).get(identityId);
  const label = action === 'review' ? 'Review' : action === 'reply' ? 'Reply' : 'Comment';
  return publishAsPersona({
    channel,
    platformCode: work.platform_code,
    identityId,
    creditedName: link.tupper_name || identity.civilian_name,
    payload: {
      embeds: [new EmbedBuilder()
        .setColor(Number.parseInt(work.brand_color || '8A5CFF', 16))
        .setAuthor({ name: `${label} on ${work.title}` })
        .setDescription(response)
        .setFooter({ text: `${work.platform_name} · VERA community engagement` })],
    },
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('engage')
    .setDescription('Engage with content across every VERA platform.')
    .addStringOption((option) => option.setName('persona').setDescription('Persona engaging with the content').setRequired(true).setAutocomplete(true)),

  async autocomplete(interaction) {
    await interaction.respond(identityChoices(interaction, true, true));
  },

  async execute(interaction) {
    const identityId = Number(interaction.options.getString('persona'));
    const identity = ownsPersona(interaction, identityId);
    if (!identity) return interaction.reply({ content: 'Choose one of your registered personas.', ephemeral: true });
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x8a5cff).setTitle('VERA // ENGAGE').setDescription(`Engaging as **${identity.civilian_name}**. Choose where you want to browse.`)],
      components: [platformMenu(identityId)], ephemeral: true,
    });
  },

  async handleComponent(interaction) {
    if (!interaction.customId.startsWith('engage:')) return false;
    const parsed = parseId(interaction.customId);
    const identity = ownsPersona(interaction, parsed.identityId);
    if (!identity) {
      await interaction.reply({ content: 'This engagement menu belongs to another user or persona.', ephemeral: true });
      return true;
    }

    if (parsed.step === 'platform') {
      const platformCode = interaction.values[0];
      const works = db.prepare(`
        SELECT id, title, credited_name, work_type FROM works
        WHERE guild_id = ? AND platform_code = ? AND status = 'released'
        ORDER BY created_at DESC LIMIT 25
      `).all(interaction.guildId, platformCode);
      if (!works.length) {
        await interaction.update({ content: `There is no released ${platformCode} content to engage with yet.`, embeds: [], components: [platformMenu(parsed.identityId)] });
        return true;
      }
      await interaction.update({
        content: '', embeds: [new EmbedBuilder().setColor(0x8a5cff).setTitle(`${platformCode} // BROWSE`).setDescription('Choose a release or post.')],
        components: [contentMenu(parsed.identityId, platformCode, works)],
      });
      return true;
    }

    if (parsed.step === 'content') {
      const workId = Number(interaction.values[0]);
      const work = db.prepare(`SELECT w.*, p.name AS platform_name, p.logo_url, p.brand_color FROM works w JOIN platforms p ON p.code = w.platform_code WHERE w.guild_id = ? AND w.id = ?`).get(interaction.guildId, workId);
      if (!work) {
        await interaction.update({ content: 'That content is no longer available.', embeds: [], components: [] });
        return true;
      }
      await interaction.update({ content: '', embeds: [workEmbed(work)], components: actionRows(parsed.identityId, work) });
      return true;
    }

    if (parsed.step === 'act') {
      if (TEXT_ACTIONS.has(parsed.action) || parsed.action === 'rate') {
        await interaction.showModal(modalFor(parsed.identityId, parsed.workId, parsed.action));
        return true;
      }
      try {
        await interaction.deferUpdate();
        const { work } = recordEngagement(interaction, parsed.identityId, parsed.workId, parsed.action);
        if (!REACTION_ACTIONS.has(parsed.action)) {
          await maybePublishTraction({ client: interaction.client, guildId: interaction.guildId, workId: work.id })
            .catch((error) => console.error('CultureLine traction check error:', error));
        }
        const prompt = REACTION_ACTIONS.has(parsed.action)
          ? `✅ **${identity.civilian_name}** ${PAST_TENSE[parsed.action]} this content. What did they think?`
          : `✅ **${identity.civilian_name}** ${PAST_TENSE[parsed.action] || 'engaged with'} this content. VERA updated its activity.`;
        await interaction.editReply({ embeds: [workEmbed(work, prompt)], components: REACTION_ACTIONS.has(parsed.action) ? [reactionRow(parsed.identityId, parsed.workId)] : [] });
      } catch (error) {
        const duplicate = ['23505', 'SQLITE_CONSTRAINT_UNIQUE'].includes(error.code);
        const response = { content: duplicate ? `This persona already used **${parsed.action}** on that content.` : error.message, embeds: [], components: [] };
        if (interaction.deferred) await interaction.editReply(response); else await interaction.reply({ ...response, ephemeral: true });
      }
      return true;
    }

    if (parsed.step === 'react') {
      await interaction.deferUpdate();
      const sentiment = parsed.action === 'up' ? 1 : -1;
      const engagement = db.prepare(`
        SELECT ce.id AS engagement_id, ce.sentiment, w.*, p.name AS platform_name, p.logo_url, p.brand_color
        FROM content_engagements ce
        JOIN works w ON w.id = ce.work_id
        JOIN platforms p ON p.code = w.platform_code
        WHERE ce.guild_id = ? AND ce.work_id = ? AND ce.identity_id = ?
          AND ce.engagement_type IN ('watch', 'stream')
        ORDER BY ce.created_at DESC LIMIT 1
      `).get(interaction.guildId, parsed.workId, parsed.identityId);
      if (!engagement) {
        await interaction.editReply({ content: 'VERA could not find the watch or stream activity for this reaction.', embeds: [], components: [] });
        return true;
      }
      if (engagement.sentiment !== null && engagement.sentiment !== undefined) {
        await interaction.editReply({ content: 'This persona already reacted to that content.', embeds: [], components: [] });
        return true;
      }
      db.prepare(`UPDATE content_engagements SET sentiment = ? WHERE id = ?`).run(sentiment, engagement.engagement_id);
      await maybePublishTraction({ client: interaction.client, guildId: interaction.guildId, workId: parsed.workId })
        .catch((error) => console.error('CultureLine traction check error:', error));
      await interaction.editReply({
        embeds: [workEmbed(engagement, `${sentiment === 1 ? '👍' : '👎'} **${identity.civilian_name}** marked this ${sentiment === 1 ? 'as something they liked' : 'as not for them'}. VERA saved the reaction; CultureLine will report it only if it becomes newsworthy.`)],
        components: [],
      });
      return true;
    }
    return false;
  },

  async handleModal(interaction) {
    if (!interaction.customId.startsWith('engage:modal:')) return false;
    const parsed = parseId(interaction.customId);
    const identity = ownsPersona(interaction, parsed.identityId);
    if (!identity) {
      await interaction.reply({ content: 'This engagement form belongs to another user or persona.', ephemeral: true });
      return true;
    }
    const response = interaction.fields.getTextInputValue('response').trim();
    const rating = parsed.action === 'rate' ? Number(response) : null;
    if (parsed.action === 'rate' && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      await interaction.reply({ content: 'Enter a whole-number rating from **1 to 5**.', ephemeral: true });
      return true;
    }
    try {
      await interaction.deferReply({ ephemeral: true });
      const { work } = recordEngagement(interaction, parsed.identityId, parsed.workId, parsed.action, parsed.action === 'rate' ? null : response, rating);
      let publicMessage = null; let publishWarning = '';
      if (!rating) {
        try { publicMessage = await publishWrittenResponse(interaction, parsed.identityId, work, parsed.action, response); }
        catch (publishError) {
          console.error('Could not publish written engagement:', publishError);
          publishWarning = `\n\nVERA saved the engagement, but could not post it publicly: ${publishError.message}`;
        }
      }
      await maybePublishTraction({ client: interaction.client, guildId: interaction.guildId, workId: work.id })
        .catch((error) => console.error('CultureLine traction check error:', error));
      const jump = publicMessage ? ` [View it](https://discord.com/channels/${interaction.guildId}/${publicMessage.channelId}/${publicMessage.id})` : '';
      await interaction.editReply({ embeds: [workEmbed(work, `✅ **${identity.civilian_name}** submitted a ${parsed.action}${rating ? ` of **${rating}/5**` : ''}. VERA updated its activity.${jump}${publishWarning}`)] });
    } catch (error) {
      const duplicate = ['23505', 'SQLITE_CONSTRAINT_UNIQUE'].includes(error.code);
      if (interaction.deferred) await interaction.editReply({ content: duplicate ? `This persona already submitted a **${parsed.action}** for that content.` : error.message });
      else await interaction.reply({ content: duplicate ? `This persona already submitted a **${parsed.action}** for that content.` : error.message, ephemeral: true });
    }
    return true;
  },
};
