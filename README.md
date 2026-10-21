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

`npm run dev` starts two processes: the website (`dev:web`) and the indexing bot (`dev:bot`). The website can send files on its own. The bot has to be running to answer messages, to sign someone in after they scan the login code, and to index new uploads.

### Demo mode

With no `BOT_TOKEN`, the app shows an "Enter the demo library" button instead of Telegram login, and prints each "send" to the terminal instead of delivering. Use it to see the UI before setting up Telegram.

## Before you add movies

Do this before the first file goes into the vault group. The bot only sees messages sent after it joined, and it only indexes a file while its process is running. Anything uploaded earlier, or while the bot is stopped, never shows up on the site.

### In Telegram, once

1. **Create the bot.** Message [@BotFather](https://t.me/BotFather) and send `/newbot`. Keep the token and the username it replies with. You will paste them into `.env` in the next section.
2. **Let the bot see the files.** In BotFather, send `/setprivacy`, choose your bot, and choose **Disable**. Making the bot an admin of the vault group does the same job. Do one of those. If privacy stays on and the bot is not an admin, it never sees the videos you upload.
3. **Create the vault group.** Make a private group with only you and the bot. Add the bot now, before any movie. The bot cannot see files that were already in the group when it joined.

### In `.env`, once

`.env` lives in the project root, next to `package.json`. Git does not commit it. If the file is missing, run `cp .env.example .env`. Put the real values only in `.env`.

4. **Fill in these values, then save the file.**
   - `BOT_TOKEN` — the token from BotFather.
   - `BOT_USERNAME` — the username, without `@`.
   - `SESSION_SECRET` — run `openssl rand -hex 32` and paste the result.
   - `DATABASE_URL` — the Supabase Postgres URL (transaction pooler, port 6543). If the password contains `@`, write it as `%40`.
   - `SITE_URL` — leave `http://localhost:4317` while you are the only one on this machine. A friend on another phone cannot open localhost. Deploy the site, or put a tunnel in front of it, and set `SITE_URL` to that public `https` URL before you send anyone the link.
   - `VAULT_CHAT_ID` — leave this empty until step 6. It looks like `-1001234567890`. Your number will be different.

   `TMDB_API_KEY` is optional. It fills in posters, synopses, genres and ratings.

### Commands you run

5. **Start the bot.** In this folder, run `npm install` if you have not already, then `npm run dev`. That starts the website at http://localhost:4317 and the bot together. If the website is already up and you are only uploading, `npm run bot` is enough. The bot process has to stay running. If it is stopped, new uploads are not indexed and a login scan gets no answer.
6. **Get the vault id.** In the vault group, send `/chatid`. The bot replies with this chat's id. Put that number in `VAULT_CHAT_ID`, then restart (`Ctrl+C`, then `npm run dev` or `npm run bot` again). Changing `.env` does nothing until you restart.

### Add a movie

7. **Upload the file.** Send the video, or the video file as a document, into the vault group. Put the title in the caption, or in the file name. These already work: `Inception (2010)`, `Blade.Runner.2049.2017.2160p.WEB-DL.mkv`, `Dark S01E02 - Lies`.
8. **Wait for the reply.** The bot answers `Added: ...` in the group. If it parsed the title wrong, reply to that file with `/title Correct Name (2019)` or `/tv Show Name S02E05`. Those two commands are only the fix.

The bot reads the caption first, then the file name:

| Upload caption or file name | Indexed as |
| --- | --- |
| `Inception (2010)` | Movie "Inception", 2010 |
| `Blade.Runner.2049.2017.2160p.WEB-DL.mkv` | Movie "Blade Runner 2049", 2017 |
| `Dark S01E02 - Lies` | "Dark", season 1, episode 2, "Lies" |
| `The.Office.US.S02E05.720p.mkv` | "The Office US", season 2, episode 5 |
| `Friends 1x02.mp4` | "Friends", season 1, episode 2 |

Episodes of the same show are grouped into seasons automatically. Uploading the same movie twice in different qualities shows both as versions.

**Other vault commands.** Reply to an uploaded file with `/delete` to remove it from the website (the Telegram message stays). Anywhere in the group, `/stats` shows the catalog size and `/help` lists the commands.

## How login works

The login page shows a QR code. The person scans it, or taps **Open in Telegram**, and presses **Start**. The bot replies that they are in, and the page opens the library on its own. There is no guest list and no invite code. Anyone who taps Start is signed in.

The bot process has to be running (`npm run dev` or `npm run bot`), or that Start press has nobody to answer it. The website they opened has to be the one in `SITE_URL`. In a private chat, any other text gets a short reply, so you can tell the bot is online.

If `SITE_URL` is still `http://localhost:4317`, that address only works on your computer. Friends on other phones cannot open localhost. Deploy the site (or tunnel it) and set `SITE_URL` to that public `https` URL before you show it to anyone. Send them that public URL. They need the Telegram app, the link, and a tap on Start.

To revoke someone, delete their row from the `users` table.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Website on port 4317, plus the bot in watch mode |
| `npm run build && npm start` | Production build, plus the bot |
| `npm run bot` | Bot only (run it while uploading, and while someone logs in) |
| `npm test` | Parser unit tests (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

## Project layout

```
src/
  app/(catalog)/        home, movies, shows, search, title/[id] (login required)
  app/login/            QR code login via the bot
  app/api/              auth and send endpoints
  bot/                  grammY bot (laptop: indexing and login)
  db/                   Drizzle schema and Postgres connection
  lib/parse.ts          caption / file-name parser (+ tests)
  lib/catalog.ts        indexing and catalog queries
  lib/access.ts         login tokens and sessions
  lib/sends.ts          per-user rate limit and immediate delivery
```

## Deploying

The website can run on Vercel (Hobby). Catalog and login state live in Supabase Postgres. Sending a file is a Telegram Bot API call from the Vercel route, so the laptop does not need to stay on for **Send to Telegram**.

Login and indexing still need the bot. Run `npm run bot` on your laptop whenever someone might scan the login code, and whenever you upload to the vault group. If that process is stopped, Start gets no reply and new uploads are not indexed.

Set these on Vercel, and use the same values in the laptop `.env`: `BOT_TOKEN`, `BOT_USERNAME`, `VAULT_CHAT_ID`, `SESSION_SECRET`, `DATABASE_URL`, `SITE_URL=https://your-app.vercel.app`. Friends open that public URL. `http://localhost:4317` only works on your machine.

Only upload content you have the rights to share.
