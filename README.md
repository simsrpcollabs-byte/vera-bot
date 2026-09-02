# VERA Bot

**VERA — VORTEX Entertainment Registration & Analytics**

VERA registers fictional entertainment identities, professional names, record labels, networks, platforms, and releases for The Vortex. This starter build establishes the database and approval workflow that later ratings, charts, streams, views, and social-growth simulations will use.

## Included in Version 0.1

- Civilian identities with separate stage, screen, former, professional, and social names
- Record-label registration and rosters
- Lumi, Canvas, PULSE, FRAME, Xposure, and KNETIK seeded automatically
- Work submission with a chosen credited name and distributor
- Admin approval queues
- Admin-verified Tupperbox proxy linking
- Automatic VORTEX RP formatting recognition for linked Tuppers
- Local SQLite database with WAL mode

## Commands

- `/ping`
- `/vera info`
- `/platform list`
- `/identity register`
- `/identity alias-add`
- `/identity profile`
- `/identity link-tupper`
- `/label register`
- `/label view`
- `/label roster-add`
- `/work submit`
- `/work view`
- `/admin queue`
- `/admin approve`
- `/admin reject`
- `/rp rules`
- `/rp parse`

## Requirements

- Windows, macOS, or Linux
- Node.js 22 LTS recommended (Node 20 also works; do not use Node 24 for this starter)
- A Discord application and bot token
- The bot invited to your Discord server

## First-time setup

1. Put all of these files directly inside your `vera-bot` folder. This flat edition does not require you to upload any folders to GitHub.
2. Open PowerShell or Terminal in that folder.
3. Install packages:

   ```powershell
   npm install
   ```

4. Make a copy of `.env.example` named `.env`.
5. Fill in `.env`:

   ```text
   DISCORD_TOKEN=your_bot_token
   CLIENT_ID=your_application_id
   GUILD_ID=your_server_id
   ADMIN_ROLE_ID=optional_admin_role_id
   DATABASE_PATH=./data/vera.sqlite
   ```

6. Register the slash commands:

   ```powershell
   npm run deploy
   ```

7. Start VERA:

   ```powershell
   npm start
   ```

### Required Discord bot setting

In the Discord Developer Portal, open **Bot → Privileged Gateway Intents** and enable **Message Content Intent**. VERA needs it to distinguish bold audible dialogue from italic actions and internal thoughts in linked Tupperbox messages.

## GitHub browser upload

You do not need GitHub Desktop.

1. Open the private `vera-bot` repository.
2. Choose **Add file → Upload files**.
3. Extract `VERA_BOT_FLAT_FILES.zip` on your computer.
4. Open the extracted folder.
5. Select every file and drag them into GitHub's upload box.
6. Confirm that `package.json`, `index.js`, `commands.js`, `.env.example`, and `.gitignore` appear.
7. Commit the upload to `main`.

Never upload a real `.env` file or Discord bot token.

## Multiple computers

The code can live in this private GitHub repository and be downloaded on each computer. Only one computer or hosting service should run the live bot at a time. VERA creates the `data` folder and SQLite database automatically on that live host; do not sync the live database through OneDrive or Dropbox while VERA is running.

## Tupperbox linking

1. Register the civilian person with `/identity register`.
2. Add stage or screen names with `/identity alias-add`.
3. Use `/identity link-tupper` in a designated linking channel.
4. Send one message through the intended Tupperbox proxy within two minutes.
5. A VERA admin verifies the proxy owner and approves the link.

The Tupperbox proxy attaches to the civilian person. Work submissions still choose the correct stage or professional name.

## VORTEX roleplay formatting

VERA automatically parses messages from approved linked Tuppers:

- `**bold text**` is audible dialogue that other characters can hear.
- `*italic text*` or `_italic text_` is an action or internal thought and is not audible.
- `***bold italic text***` is treated as emphasized audible dialogue because bold takes priority.
- Unformatted text is narration or context.

Use `/rp parse` to test a message before relying on the classification. Parsed messages are stored in the local database so future activity and sentiment systems can use the correct context. Italic internal thoughts will never be treated as public speech.

## Current scope

This is the registration foundation. It does not simulate weekly television ratings, music charts, FRAME views, or social metrics yet. Those engines come next after the registry is running and tested.
