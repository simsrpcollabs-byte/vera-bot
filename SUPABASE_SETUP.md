# Connect VERA to Supabase

This upgrade moves VERA's live data out of Railway's temporary container and into a persistent Supabase Postgres database.

## 1. Create the database

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Select **New project**.
3. Choose a project name such as `VERA` and create a strong database password.
4. Save that password somewhere private and wait for the project to finish provisioning.

## 2. Copy the correct connection string

1. In the Supabase project, open **Project Settings**.
2. Open **Database** and find **Connection string**.
3. Choose **Transaction pooler**. It normally uses port `6543` and works well from Railway.
4. Copy the URI. It will resemble:

   ```text
   postgresql://postgres.PROJECT_REF:[YOUR-PASSWORD]@aws-0-REGION.pooler.supabase.com:6543/postgres
   ```

5. Replace `[YOUR-PASSWORD]` with the password created in step 1.

Keep this URI private. Anyone with it can access VERA's database.

## 3. Add it to Railway

1. Open the Railway project and select the `vera-bot` service.
2. Open **Variables**.
3. Add:

   ```text
   DATABASE_URL=the_complete_connection_string_from_supabase
   DATABASE_SSL=true
   ```

4. Keep the existing `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, and optional `ADMIN_ROLE_ID` values.
5. Delete `DATABASE_PATH`; the updated bot no longer uses it.

## 4. Replace the GitHub files

1. Extract the supplied ZIP.
2. In the private GitHub repository, choose **Add file → Upload files**.
3. Select every extracted file, including `.env.example` and `supabase-schema.sql`.
4. Let files with matching names replace the old versions, then commit to `main`.
5. Railway should deploy automatically.

VERA creates and updates its Supabase tables automatically during startup. You do not need to paste the SQL into Supabase.

## 5. Confirm the upgrade

In Railway's deploy logs, look for:

```text
VERA is online as ...
```

Then run `/ping` and `/persona profile` in Discord. New personas and posts will persist across future deployments.

## Troubleshooting

- **`Missing DATABASE_URL`**: the Railway variable is missing or was not applied to the service.
- **Password authentication failed**: replace the password placeholder in the copied URI. URL-encode special characters in the password.
- **Connection timeout**: confirm you copied the **Transaction pooler** URI rather than the direct connection string.
- **Slash commands did not change**: Railway must run `npm run deploy` as its pre-deploy command, or run it once after the new code is deployed.
- **Old personas are missing**: Supabase begins as a new database. It cannot restore a SQLite file that Railway already discarded.
