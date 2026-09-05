# VERA Bot

**Current version: 0.6.0**

**VERA — VORTEX Entertainment Registration & Analytics**

VERA registers fictional entertainment personas, professional names, record labels, networks, platforms, and releases for The Vortex. Publishing work produces immediate opening ratings, streams, views, or social insights based on its platform.

The version shown here, in `package.json`, and in `/vera info` stays synchronized. Before packaging a small update, run `npm run version:patch`; use `npm run version:minor` for a feature release or `npm run version:major` for a major rebuild.

## Included in Version 0.6.0

- Self-service personas with separate civilian, stage, screen, former, professional, and social names
- Server-wide persona directory and profiles viewable by every member
- VORTEX-wide personas that retain their owner, aliases, verification, proxy, audience, work, and metrics across every VERA server
- Record-label registration and rosters
- Lumi, Canvas, PULSE, FRAME, Xposure, KNETIK, and ECHO seeded automatically
- Custom platform logos, brand colors, and assigned Discord channels
- Proxy-style publishing under each persona’s credited stage or screen name
- Instant work publishing with a chosen credited name and distributor
- Platform-specific opening metrics saved with every published work
- Live rankings for songs, albums, television, FRAME, Xposure, and KNETIK
- Artist career summaries, platform audiences, and television episode histories
- Automatic weekly VERA chart publication in a chosen Discord channel
- Persona verification approved exclusively by the Discord server owner
- Official Xposure, KNETIK, and ECHO channels with instant branded social posting
- Cross-platform `/engage` browsing for watching, streaming, liking, flashing, saving, sharing, echoing, rating, replying, commenting, and reviewing
- CultureLine ECHO coverage for releases, traction milestones, negative attention, appearances, and public feuds
- Post-watch and post-stream thumbs-up/thumbs-down reactions that separate buzz from approval
- Timed sponsored placements that expire automatically and preserve the original post
- Admin approval queue for record labels
- Automatic Tupperbox proxy linking during persona registration
- Automatic VORTEX RP formatting recognition for linked Tuppers
- Organic RP buzz that affects charts, platform audiences, career heat, and sentiment
- Persistent Supabase Postgres database that survives Railway deployments
- Image uploads for Xposure, KNETIK, cover artwork, and FRAME thumbnails
- Automatic refresh of linked Tupper proxy avatars

## Commands

- `/ping`
- `/vera info`
- `/platform list`
- `/platform channel` (admin)
- `/platform branding` (admin)
- `/persona register`
- `/persona alias-add`
- `/persona profile`
- `/persona edit`
- `/persona delete`
- `/persona link-tupper`
- `/label register`
- `/label view`
- `/label roster-add`
- `/work submit`
- `/work view`
- `/post submit`
- `/post view`
- `/promo start`
- `/promo status`
- `/engage`
- `/cultureline appearance`
- `/cultureline feud`
- `/charts songs`
- `/charts albums`
- `/charts television`
- `/charts frame`
- `/charts exposure`
- `/charts knetik`
- `/charts echo` (The Grapevine)
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
- `/admin persona-audience` (server owner)
- `/admin persona-verification` (server owner)
- `/rp rules`
- `/rp parse`
- `/rp buzz`

## Requirements

- Node.js 22 LTS recommended (Railway can run it for you)
- A Discord application and bot token
- The bot invited to your Discord server
- A free Supabase project

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
   DATABASE_URL=your_supabase_transaction_pooler_url
   DATABASE_SSL=true
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

VERA also needs **Manage Webhooks**, **View Channel**, **Send Messages**, **Embed Links**, **Read Message History**, and **Use Slash Commands** permissions. Manage Webhooks lets VERA publish under the persona’s credited stage or screen name and linked Tupper avatar.

## ECHO and engagement

Assign ECHO's official channel once with `/platform channel platform:ECHO`. Users publish a **Voice** through `/post submit platform:ECHO`; reposts are **Echoes**, followers are **Listeners**, and trending Voices appear on **The Grapevine**.

Run `/engage persona:<name>` to browse any network or platform. VERA first asks for the platform, then the release or post, and finally shows the actions supported there. Choosing Comment, Reply, or Review opens a 300-character form and publishes the response through the persona's linked Tupper proxy. Ratings use a 1–5 form. A persona can use each engagement type once per work.

Watching or streaming ends with an **I liked it 👍 / Not for me 👎** prompt. The activity creates buzz either way, while the reaction records whether reception is positive or negative. Routine likes, comments, replies, shares, and individual reactions update VERA's metrics quietly. CultureLine only publishes when a work reaches a community-activity milestone, receives a pattern of positive or negative reactions, or builds enough audible RP discussion to become newsworthy.

CultureLine uses the ECHO channel configured through `/platform channel platform:ECHO`. Its official `cultureline.png` profile picture is bundled as a flat root file with VERA, so no separate Railway avatar variable is required. CultureLine publishes as **CultureLine ✓**, a verified VORTEX publication.

New `/work submit` releases receive a CultureLine release announcement automatically. Persona owners can use `/cultureline appearance` for premieres, performances, interviews, events, and other public appearances. They can use `/cultureline feud` when one of their personas is publicly feuding with another registered persona. These commands publish the news event; ordinary social-media engagement never creates a one-action CultureLine broadcast.

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

## Supabase and Railway

VERA now keeps its data in Supabase instead of Railway's temporary filesystem. Personas, aliases, Tupper links, labels, posts, metrics, followers, charts, and verification records remain available when Railway rebuilds or replaces the container.

1. Create a project at [supabase.com](https://supabase.com).
2. Save the database password you choose during project creation.
3. Open **Project Settings → Database → Connection string**.
4. Choose **Transaction pooler**. This is the Railway-friendly connection option and normally uses port `6543`.
5. Copy the URI and replace its password placeholder with your real database password.
6. In Railway, open the VERA service and choose **Variables**.
7. Add `DATABASE_URL` with the complete URI as its value.
8. Add `DATABASE_SSL` with the value `true`.
9. Remove the old `DATABASE_PATH` variable if it is still present.
10. Upload these replacement files to GitHub and let Railway redeploy.

VERA runs `supabase-schema.sql` automatically when it starts, so you do not have to create the tables manually. The first successful deploy log should include `VERA is online`.

Do not post or screenshot `DATABASE_URL`: it contains the database password. If the password includes reserved URL characters such as `@`, `:`, `/`, `#`, or `%`, URL-encode the password before placing it in the connection string.

### Existing SQLite data

The Supabase database starts empty. This upgrade preserves all data created **after** Supabase is connected, but it cannot automatically retrieve an old `vera.sqlite` file that Railway has already erased. If the current bot only contains test personas, deploy the upgrade and register them again. If live data must be migrated, save the existing `/data/vera.sqlite` file before replacing the code and keep it private.

## Multiple computers

The code can remain in your private GitHub repository and be managed from any browser or computer. Railway runs the one live copy of VERA, while Supabase holds the shared live data. Never upload `.env`, the Discord token, the Supabase URL, or a database export to GitHub.

## Tupperbox linking

1. Register the person with `/persona register`.
2. Within two minutes, send one message through that persona’s Tupperbox proxy in the same channel.
3. VERA links the proxy automatically—no admin approval is needed.
4. Add stage, screen, and social names with `/persona alias-add`.
5. Use `/persona link-tupper` only when reconnecting or changing a proxy later.

The Tupperbox proxy attaches to the civilian person. Work submissions still choose the correct stage or professional name.

VERA cannot send through Tupperbox's private webhook. Instead, it uses a VERA-owned webhook with the public stage/screen name and mirrors the linked Tupper's current avatar. Whenever the linked proxy speaks in a channel VERA can read, VERA refreshes its saved avatar automatically.

## Instant publishing and metrics

`/work submit` publishes immediately. Users do not wait for an admin to approve the work. VERA routes the saved opening-metrics card to the platform’s assigned channel and publishes it under the selected credited stage or screen name:

- PULSE: streams, sales, radio audience, chart points, debut position, and new listeners
- Lumi or Canvas: live viewers, same-day viewers, 7-day viewers, demographic rating, and audience score
- FRAME: first-day and projected 7-day views, likes, comments, average viewed, and new subscribers
- Xposure: reach, impressions, Flashes, comments, and new Watchers
- KNETIK: first-day views, likes, shares, completion rate, and new Followers

Persona registration is self-service. Only record-label registration and persona verification require approval. Work itself does not enter an approval queue.

## Charts and weekly publication

Every instant release is automatically eligible for its matching chart. Rankings combine the saved opening metrics with platform-specific catalog decay and a small deterministic weekly variation. Viewing a chart never rerolls the underlying opening metrics.

- PULSE songs enter the **Vortex Hot 100**.
- PULSE albums and EPs enter the **Vortex 200**.
- Lumi and Canvas releases enter **VORTEX Television**.
- FRAME uploads enter **FRAME Top Videos**.
- Xposure posts enter **Xposure Most Watched**.
- KNETIK videos enter **KNETIK Trending**.

Use `/charts setup` once to choose a text channel, publication day, and Central Time publication hour. VERA checks the schedule automatically while the bot is online and publishes one weekly issue. Admins can use `/charts publish` to post the current issue immediately.

Use `/charts artist` for career totals, chart peaks, recent releases, and audiences across PULSE, FRAME, Xposure, and KNETIK. `/persona profile` also shows the persona's current audience totals. Use `/charts show` for a series overview and episode-by-episode ratings. When submitting an episode, select its parent show in the `series` field.

## Verification

Verification belongs to the fictional persona—not the player’s Discord account—so it follows the character across stage names, work releases, charts, career pages, and social posts. A verified name displays with a **✓** badge.

1. The persona owner uses `/verified request`.
2. The Discord server owner views `/verified queue`.
3. Only the Discord server owner can use `/verified approve`, `/verified reject`, or `/verified revoke`.

VERA admins cannot approve verification unless that admin is also the server owner.

## Social channels and posts

An admin connects the official channel for each network or platform using `/platform channel`, then adds its logo and hex color with `/platform branding`. Users can run `/post submit` or `/work submit` from any channel; VERA routes the finished branded post into the correct official channel automatically. It appears under the chosen stage, screen, or social name with the persona’s linked Tupper avatar. A post can include an uploaded image or video, or a direct media URL, and immediately receives platform metrics. `/work submit` also accepts optional artwork for covers, release photos, and FRAME thumbnails. A credited name must already belong to that persona through `/persona alias-add`.

Audience terminology follows each platform:

- **Xposure:** Watchers
- **KNETIK:** Followers
- **FRAME:** Subscribers
- **PULSE:** Listeners

## Timed promotion

Use `/promo start` with a post ID, promotion level, and duration. Available durations are 1 hour, 6 hours, 24 hours, 3 days, and 7 days. VERA posts a separate **Sponsored** placement in the official platform channel and shows its expiration time. When the campaign ends, VERA automatically:

- applies the final reach, engagement, and Watcher boost;
- saves the improved metrics and updates chart scoring;
- refreshes the original social post;
- removes the temporary sponsored placement; and
- preserves the original post and promotion history.

Use `/promo status` to view a post’s campaigns.

## VORTEX roleplay formatting

VERA automatically parses messages from linked Tuppers:

- `**bold text**` is audible dialogue that other characters can hear.
- `*italic text*` or `_italic text_` is an action or internal thought and is not audible.
- `***bold italic text***` is treated as emphasized audible dialogue because bold takes priority.
- Unformatted text is narration or context.

Use `/rp parse` to test a message before relying on the classification. Parsed messages are stored in Supabase so future activity and sentiment systems can use the correct context. Italic internal thoughts will never be treated as public speech.

### How RP affects VERA

When a linked Tupper mentions the exact title of a published work, VERA records organic buzz for that release. The impact is deliberately capped so active storytelling helps careers without rewarding spam.

- A new outside persona discussing a release carries the most weight.
- The artist or creator can self-promote, but self-promo receives reduced weight.
- Each persona can create at most three counted mentions for the same release in a rolling 24-hour period.
- Bold dialogue can contribute positive or negative public sentiment.
- Italic actions and internal thoughts can establish that a work was played or viewed, but never become public opinion.
- Negative discussion can raise attention while slightly lowering affinity.
- Buzz can increase PULSE listeners, FRAME subscribers, Xposure Watchers, or KNETIK Followers.
- Lumi and Canvas buzz adds projected viewers rather than a personal follower count.
- Current-week chart scores can receive up to a 30% organic-buzz lift.

Use `/rp buzz work_id:` to see counted mentions, unique personas, projected metric gains, and public sentiment for a release. `/work view` and `/post view` also display the release's current RP impact.

## Current scope

This build includes immediate opening metrics, rolling rankings, week-over-week movement, catalog decay, social-follower growth, career summaries, verification, official social posting, timed promotion, television histories, and automatic weekly publication. Deeper event boosts—award-show performances, soundtrack placements, controversies, collaborations, and cross-platform viral effects—remain a future simulation layer.
