# ReelVault

A private, Netflix-style website for a movie and TV library that lives in Telegram.

You upload movies and episodes to a private Telegram group shared by you and your bot. The bot indexes every upload. Friends log in to the website with Telegram, browse posters, pick a movie, an episode or a whole season, and the bot sends the file to their Telegram DM.

Press **Send to Telegram** and the bot delivers a copy to that person's DM. Files are never re-uploaded: Telegram reuses the original `file_id`.

```
you --upload--> vault group --update--> laptop bot --index--> Supabase <-- Vercel site <-- friends
                                                                  |
                                                                  +-- Send to Telegram DM (from the site)
```

## Stack

- **Website:** Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui
- **Bot:** [grammY](https://grammy.dev), long polling, in the same repo (`src/bot`)
- **Storage:** Supabase Postgres (Drizzle ORM)
- **Metadata:** optional [TMDB](https://www.themoviedb.org) lookups for posters, synopses, genres and ratings

## Run it locally

Requires Node.js 20+.

```bash
npm install
cp .env.example .env    # this file lives in the project root, next to package.json
npm run dev
```

Open http://localhost:4317.

`npm run dev` starts two processes: the website (`dev:web`) and the indexing bot (`dev:bot`). Sends go out from the website immediately, so the bot is only needed while you upload.

### Demo mode

With no `BOT_TOKEN`, the app shows an "Enter the demo library" button instead of Telegram login, and prints each "send" to the terminal instead of delivering. Use it to see the UI before setting up Telegram.

## Connect Telegram

All of these go in `.env` in the project root (the same folder as `package.json`). Copy `.env.example` if the file is not there yet.

1. **Create the bot.** Message [@BotFather](https://t.me/BotFather), send `/newbot`, and copy the token into `BOT_TOKEN` and the username (without `@`) into `BOT_USERNAME`.
2. **Let it read the group.** In BotFather, send `/setprivacy`, choose your bot, then **Disable**. Alternatively, make the bot an admin in the group.
3. **Create the vault.** Create a private group with just you and the bot. Start `npm run dev`, send `/chatid` in the group, and put the id (e.g. `-1001234567890`) in `VAULT_CHAT_ID`. Restart.
4. **Set `SESSION_SECRET`** to something random: `openssl rand -hex 32`.
5. **Optional:** get a free TMDB API key and set `TMDB_API_KEY` for real posters and descriptions.

The bot only sees messages sent after it joined the group, so add it before uploading.

### Uploading

Send videos, or video files as documents, to the vault group. The bot reads the caption first, then the file name:

| Upload caption or file name | Indexed as |
| --- | --- |
| `Inception (2010)` | Movie "Inception", 2010 |
| `Blade.Runner.2049.2017.2160p.WEB-DL.mkv` | Movie "Blade Runner 2049", 2017 |
| `Dark S01E02 - Lies` | "Dark", season 1, episode 2, "Lies" |
| `The.Office.US.S02E05.720p.mkv` | "The Office US", season 2, episode 5 |
| `Friends 1x02.mp4` | "Friends", season 1, episode 2 |

Episodes of the same show are grouped into seasons automatically. Uploading the same movie twice in different qualities shows both as versions. The bot replies in the group with what it indexed.

**Owner commands.** Reply to an uploaded file in the vault group with:

- `/title Correct Name (2019)` to re-tag it as a movie
- `/tv Show Name S02E05` to re-tag it as an episode
- `/delete` to remove it from the website (the Telegram message is untouched)

These work anywhere in the vault group:

- `/invite` creates a one-time invite code for a friend
- `/stats` shows the catalog size
- `/help` lists the commands

## How login works

On the production domain, friends can use the Telegram Login Widget (after `/setdomain` in BotFather). On localhost, they can still confirm via a `t.me/<bot>?start=login_<token>` deep link: the bot process must be running to receive that `/start`.

**Who is allowed in:**

- members of the vault group, i.e. you
- anyone who has logged in before
- ids listed in `ALLOWED_USER_IDS`
- anyone with a valid `/invite` code, entered via "I have an invite code"
- everyone, if `OPEN_REGISTRATION=true`

To revoke someone, delete their row from the `users` table.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Website on port 4317, plus the bot in watch mode |
| `npm run build && npm start` | Production build, plus the bot |
| `npm run bot` | Indexing bot only (run while uploading) |
| `npm test` | Parser unit tests (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

## Project layout

```
src/
  app/(catalog)/        home, movies, shows, search, title/[id] (login required)
  app/login/            Telegram Login Widget + deep-link fallback
  app/api/              auth and send endpoints
  bot/                  grammY indexing bot (laptop, while uploading)
  db/                   Drizzle schema and Postgres connection
  lib/parse.ts          caption / file-name parser (+ tests)
  lib/catalog.ts        indexing and catalog queries
  lib/access.ts         login tokens, allowlist, invites
  lib/sends.ts          per-user rate limit and immediate delivery
```

## Deploying

The website can run on Vercel (Hobby). Catalog and login live in Supabase Postgres. Sending a file is a Telegram Bot API call from the Vercel route — the laptop does not need to stay on.

Run `npm run bot` on your laptop **only when you upload** to the vault group, so new titles get indexed.

Set these on Vercel: `BOT_TOKEN`, `BOT_USERNAME`, `VAULT_CHAT_ID`, `SESSION_SECRET`, `DATABASE_URL`, `SITE_URL=https://your-app.vercel.app`. In BotFather, `/setdomain` to that host (no `https://`).

Only upload content you have the rights to share.
