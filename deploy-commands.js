const { REST, Routes } = require('discord.js');
const config = require('./config');
const commands = require('./commands');
const db = require('./database');

async function deploy() {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const body = commands.map((command) => command.data.toJSON());
  console.log(`Deploying ${body.length} VERA commands to server ${config.guildId}...`);
  const result = await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body },
  );
  console.log(`Success: ${result.length} commands deployed.`);
}

deploy()
  .catch((error) => {
    console.error('Command deployment failed:', error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
