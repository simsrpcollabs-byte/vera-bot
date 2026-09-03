# VERA Bot

**VERA — VORTEX Entertainment Registration & Analytics**

VERA registers fictional entertainment identities, professional names, record labels, networks, platforms, and releases for The Vortex. Publishing work produces immediate opening ratings, streams, views, or social insights based on its platform.

## Included in Version 0.1

- Civilian identities with separate stage, screen, former, professional, and social names
- Record-label registration and rosters
- Lumi, Canvas, PULSE, FRAME, Xposure, and KNETIK seeded automatically
- Instant work publishing with a chosen credited name and distributor
- Platform-specific opening metrics saved with every published work
- Live rankings for songs, albums, television, FRAME, Xposure, and KNETIK
- Artist career summaries, social followings, and television episode histories
- Automatic weekly VERA chart publication in a chosen Discord channel
- Identity verification approved exclusively by the Discord server owner
- Official Xposure and KNETIK channels with instant branded social posting
- Timed sponsored placements that expire automatically and preserve the original post
- Admin approval queues for identities and record labels
- Admin-verified Tupperbox proxy linking
- Automatic VORTEX RP formatting recognition for linked Tuppers
- Local SQLite database with WAL mode

## Commands

- `/ping`
- `/vera info`
- `/platform list`
- `/platform channel` (admin)
- `/identity register`
- `/identity alias-add`
- `/identity profile`
- `/identity link-tupper`
- `/label register`
- `/label view`
- `/label roster-add`
- `/work submit`
- `/work view`
- `/post submit`
- `/post view`
- `/promo start`
- `/promo status`
- `/charts songs`
- `/charts albums`
- `/charts television`
- `/charts frame`
- `/charts exposure`
- `/charts knetik`
- `/charts artist`
- `/charts show`
- `/charts setup` (admin)
- `/charts publish` (admin)
- `/verified request`
- `/verified status`
- `/verified queue` (server owner)
- `/verified approve` (server owner)
- `/verified reject` (server owner)
- `/verified revoke` (server owner)
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

## Instant publishing and metrics

`/work submit` publishes immediately. Users do not wait for an admin to approve the work. VERA responds publicly with a saved opening-metrics card:

- PULSE: streams, sales, radio audience, chart points, and debut position
- Lumi or Canvas: live viewers, same-day viewers, 7-day viewers, demographic rating, and audience score
- FRAME: first-day and projected 7-day views, likes, comments, and average viewed
- Xposure: reach, impressions, Flashes, comments, and new Watchers
- KNETIK: first-day views, likes, shares, completion rate, and new Watchers

Identity and label approvals remain in place. They protect character ownership and prevent users from releasing work through an unverified label. Work itself does not enter an approval queue.

## Charts and weekly publication

Every instant release is automatically eligible for its matching chart. Rankings combine the saved opening metrics with platform-specific catalog decay and a small deterministic weekly variation. Viewing a chart never rerolls the underlying opening metrics.

- PULSE songs enter the **Vortex Hot 100**.
- PULSE albums and EPs enter the **Vortex 200**.
- Lumi and Canvas releases enter **VORTEX Television**.
- FRAME uploads enter **FRAME Top Videos**.
- Xposure posts enter **Xposure Most Watched**.
- KNETIK videos enter **KNETIK Trending**.

Use `/charts setup` once to choose a text channel, publication day, and Central Time publication hour. VERA checks the schedule automatically while the bot is online and publishes one weekly issue. Admins can use `/charts publish` to post the current issue immediately.

Use `/charts artist` for career totals, chart peaks, recent releases, and accumulated Xposure/KNETIK Watchers. Use `/charts show` for a series overview and episode-by-episode ratings. When submitting an episode, select its parent show in the new `series` field.

## Verification

Verification belongs to the fictional identity—not the player’s Discord account—so it follows the character across stage names, work releases, charts, career pages, and social posts. A verified name displays with a **✓** badge.

1. The identity owner uses `/verified request`.
2. The Discord server owner views `/verified queue`.
3. Only the Discord server owner can use `/verified approve`, `/verified reject`, or `/verified revoke`.

VERA admins cannot approve verification unless that admin is also the server owner.

## Social channels and posts

An admin first connects the official channels using `/platform channel` for Xposure and KNETIK. Users can then run `/post submit` from any channel; VERA routes the finished branded post into the correct official channel automatically. A post can include an uploaded image or video, or a direct media URL, and immediately receives platform metrics. Its activity adds Watchers to the identity’s career profile and enters the matching social chart. A credited stage name or handle must already belong to that identity through `/identity alias-add`.

## Timed promotion

Use `/promo start` with a post ID, promotion level, and duration. Available durations are 1 hour, 6 hours, 24 hours, 3 days, and 7 days. VERA posts a separate **Sponsored** placement in the official platform channel and shows its expiration time. When the campaign ends, VERA automatically:

- applies the final reach, engagement, and Watcher boost;
- saves the improved metrics and updates chart scoring;
- refreshes the original social post;
- removes the temporary sponsored placement; and
- preserves the original post and promotion history.

Use `/promo status` to view a post’s campaigns.

## VORTEX roleplay formatting

VERA automatically parses messages from approved linked Tuppers:

- `**bold text**` is audible dialogue that other characters can hear.
- `*italic text*` or `_italic text_` is an action or internal thought and is not audible.
- `***bold italic text***` is treated as emphasized audible dialogue because bold takes priority.
- Unformatted text is narration or context.

Use `/rp parse` to test a message before relying on the classification. Parsed messages are stored in the local database so future activity and sentiment systems can use the correct context. Italic internal thoughts will never be treated as public speech.

## Current scope

This build includes immediate opening metrics, rolling rankings, week-over-week movement, catalog decay, social-follower growth, career summaries, verification, official social posting, timed promotion, television histories, and automatic weekly publication. Deeper event boosts—award-show performances, soundtrack placements, controversies, collaborations, and cross-platform viral effects—remain a future simulation layer.
