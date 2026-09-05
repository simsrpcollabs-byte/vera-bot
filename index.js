const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
} = require('discord.js');
const config = require('./config');
require('./database');
const commands = require('./commands');
const { captureTupperMessage, handleTupperButton } = require('./tupperbox');
const { recordLinkedRpMessage } = require('./rpParser');
const { startWeeklyPublisher } = require('./weeklyPublisher');
const { startPromotionScheduler } = require('./promotionScheduler');
const engageCommand = require('./cmd-engage');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.commands = new Collection();
for (const command of commands) client.commands.set(command.data.name, command);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`VERA is online as ${readyClient.user.tag} (${readyClient.user.id}).`);
  for (const guild of readyClient.guilds.cache.values()) {
    try {
      await readyClient.application.commands.set([], guild.id);
      console.log(`Cleared old server-specific VERA commands from ${guild.name} (${guild.id}).`);
    } catch (error) {
      console.error(`Could not clear old commands from ${guild.name} (${guild.id}):`, error.message);
    }
  }
  startWeeklyPublisher(readyClient);
  startPromotionScheduler(readyClient);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isModalSubmit()) {
      if (await engageCommand.handleModal(interaction)) return;
    }

    if (interaction.isStringSelectMenu()) {
      if (await engageCommand.handleComponent(interaction)) return;
    }

    if (interaction.isButton()) {
      if (await engageCommand.handleComponent(interaction)) return;
      await handleTupperButton(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) await command.autocomplete(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error handling ${interaction.commandName || interaction.customId}:`, error);
    const response = { content: 'VERA hit an error while processing that. Check the console for details.', ephemeral: true };
    if (interaction.deferred && !interaction.replied) await interaction.editReply(response).catch(() => {});
    else if (interaction.replied) await interaction.followUp(response).catch(() => {});
    else await interaction.reply(response).catch(() => {});
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await captureTupperMessage(message);
    await recordLinkedRpMessage(message);
  } catch (error) {
    console.error('Tupperbox capture error:', error);
  }
});

client.login(config.token);
