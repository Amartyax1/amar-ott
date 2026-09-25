# ReelVault

A private, Netflix-style website for a movie and TV library that lives in Telegram.

You upload movies and episodes to a private Telegram group shared by you and your bot. The bot indexes every upload. Friends log in to the website with Telegram, browse posters, pick a movie, an episode or a whole season, and the bot sends the file to their Telegram DM.

Files are never downloaded or re-uploaded. The bot re-sends Telegram's own `file_id`, so full-size uploads (up to 2 GB, or 4 GB with Premium) arrive instantly.

```
you --upload--> vault group --update--> bot --index--> SQLite <-- website <-- friends
                                         |                           |
                                         +-- sends file to DM <--queue+
```

## Stack

- **Website:** Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui
- **Bot:** [grammY](https://grammy.dev), long polling, in the same repo (`src/bot`)
- **Storage:** SQLite (`better-sqlite3` + Drizzle ORM), shared by both processes
- **Metadata:** optional [TMDB](https://www.themoviedb.org) lookups for posters, synopses, genres and ratings

## Run it locally

Requires Node.js 20+.

```bash
npm install
cp .env.example .env    # optional: leave BOT_TOKEN empty for demo mode
npm run dev
```

Open http://localhost:4317.

`npm run dev` starts two processes: the website (`dev:web`) and the bot plus delivery worker (`dev:bot`). Sends are queued in SQLite and delivered by the bot process, so keep both running.

### Demo mode

With no `BOT_TOKEN`, the app:

- seeds a fictional demo library
- shows an "Enter the demo library" button instead of Telegram login
- has the bot process print each "send" to the terminal

Use it to see the UI before setting up Telegram.

## Connect Telegram

1. **Create the bot.** Message [@BotFather](https://t.me/BotFather), send `/newbot`, and copy the token into `BOT_TOKEN` and the username into `BOT_USERNAME`.
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

1. On `/login` the site creates a one-time token and shows a `t.me/<bot>?start=login_<token>` link, plus a QR code on desktop.
2. The friend taps **Start** in Telegram. The bot receives their Telegram id, which Telegram vouches for, and approves the token if they're allowed.
3. The page, which has been polling, gets a signed session cookie. The token only works in the browser that requested it.

Pressing **Start** also opens the chat, which Telegram requires before a bot can DM someone.

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
| `npm run bot` | Bot and delivery worker only |
| `npm test` | Parser unit tests (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

## Project layout

```
src/
  app/(catalog)/        home, movies, shows, search, title/[id] (login required)
  app/login/            Telegram deep-link login
  app/api/              auth + send queue endpoints
  bot/                  grammY bot and paced delivery worker
  db/                   Drizzle schema, SQLite setup, demo seed
  lib/parse.ts          caption / file-name parser (+ tests)
  lib/catalog.ts        indexing and catalog queries
  lib/access.ts         login tokens, allowlist, invites
  lib/sends.ts          per-user rate limit and delivery queue
```

## Deploying

Run it anywhere that supports a long-running Node process and a persistent disk, such as a VPS, Fly.io or Railway. Serverless hosts are not a fit because of the long-polling bot and SQLite. Set `SITE_URL` to your https URL so cookies are marked secure. Only upload content you have the rights to share.
