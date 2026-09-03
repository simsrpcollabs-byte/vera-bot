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

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.commands = new Collection();
for (const command of commands) client.commands.set(command.data.name, command);

client.once(Events.ClientReady, (readyClient) => {
  console.log(`VERA is online as ${readyClient.user.tag} (${readyClient.user.id}).`);
  startWeeklyPublisher(readyClient);
  startPromotionScheduler(readyClient);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
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
    if (interaction.replied || interaction.deferred) await interaction.followUp(response).catch(() => {});
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
