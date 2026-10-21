# ReelVault

A private movie and TV site. The films live in a Telegram group. People browse the site, press **Send to Telegram**, and the file shows up in their chat with the bot.

## Watch something

1. Open https://amar-ott.vercel.app.
2. Scan the code with your phone, or tap **Open in Telegram**.
3. In the chat with the bot, tap **Start**.
4. The site opens the library on its own. Pick a movie, an episode, or a whole season.
5. Press **Send to Telegram**. The file arrives in that same chat.

No invite code. Anyone who taps **Start** is let in.

The bot on your computer has to be running when they tap **Start**. If it is not, nothing answers.

## Add a movie

Open a terminal and run these two lines. Leave that window open.

```bash
cd ~/telegram-movie-delivery/telegram-movie-delivery
npm run bot
```

You should see a line that says the bot is running. Then, in the private group that has only you and the bot:

1. Send the video into the group.
2. Put the title in the caption, or in the file name. These work:
   - `Inception (2010)`
   - `Blade.Runner.2049.2017.2160p.WEB-DL.mkv`
   - `Dark S01E02 - Lies`
   - `Friends 1x02.mp4`
3. Wait until the bot replies `Added: ...`. It is on the site after that.

If the title is wrong, reply to that file with `/title Correct Name (2019)` or `/tv Show Name S02E05`.

Reply to a file with `/delete` to take it off the site. The message in the group stays. `/stats` shows how many titles are indexed. `/help` lists the commands.

Uploading the same movie twice in different qualities keeps both. Episodes of one show are grouped into seasons.

## If `npm run dev` failed

Do not use `npm run dev` for this. The website is already running. `npm run dev` tries to start a second copy of the website and the bot together. When the website copy fails, it shuts the bot down too.

Also check the folder. The project is the inner one:

`~/telegram-movie-delivery/telegram-movie-delivery`

The outer folder, `~/telegram-movie-delivery`, is an older copy. It has no installed packages, so `npm run dev` there stops immediately with `concurrently: not found`.

Use `npm run bot` in the inner folder, and leave it running while you upload or while someone new logs in.

## For setup (you only do this once)

1. Message [@BotFather](https://t.me/BotFather), send `/newbot`, and keep the token and the username.
2. In BotFather, send `/setprivacy`, choose the bot, and choose **Disable**. Or make the bot an admin of the group. Otherwise it never sees the videos.
3. Create a private group with only you and the bot. Add the bot before you upload anything. It cannot see files that were already there.
4. In the inner project folder, copy `.env.example` to `.env` if `.env` is missing. Fill in `BOT_TOKEN`, `BOT_USERNAME` (no `@`), `SESSION_SECRET`, `DATABASE_URL`, and `SITE_URL`. `.env` stays on your computer. It is not on GitHub.
5. Run `npm install` once in that inner folder.
6. Run `npm run bot`. In the group, send `/chatid`. Put the number it replies with into `VAULT_CHAT_ID` in `.env`, then stop the bot and start `npm run bot` again.

`SESSION_SECRET` can be anything long and random (`openssl rand -hex 32`). `DATABASE_URL` is the Supabase Postgres address (pooler, port 6543). If the database password contains `@`, write it as `%40`. `TMDB_API_KEY` is optional. It adds posters and descriptions.

Friends need the public site address, not an address that starts with `localhost`. `localhost` only opens on your computer. `SITE_URL` in `.env` should be that public `https` address.

This computer needs Node.js 20 or newer. The copy in `~/.local/bin` is the one that works. The system Node is too old for this project.

Only upload films you have the rights to share.
