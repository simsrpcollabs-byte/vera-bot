const { REST, Routes } = require('discord.js');
const config = require('./config');
const commands = require('./commands');
const db = require('./database');

async function deploy() {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const body = commands.map((command) => command.data.toJSON());
  console.log(`Deploying ${body.length} VERA commands globally...`);

await rest.put(
  Routes.applicationCommands(config.clientId),
  { body }
);
  console.log(`Success: ${result.length} commands deployed.`);
}

deploy()
  .catch((error) => {
    console.error('Command deployment failed:', error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
