import "./load-env";
import { Bot, GrammyError, type Context } from "grammy";
import type { Message } from "grammy/types";
import { env, isMock } from "@/lib/env";
import { confirmLogin } from "@/lib/access";
import { ensureSchema } from "@/db";
import {
  catalogStats,
  describeMedia,
  findVaultFile,
  indexUpload,
  removeFile,
  retagFile,
  type UploadInfo,
} from "@/lib/catalog";
import { isVideoFile, parseMedia } from "@/lib/parse";

const controller = new AbortController();

function shutdown(stop?: () => unknown) {
  controller.abort();
  void stop?.();
  setTimeout(() => process.exit(0), 300).unref();
}

const HELP_VAULT = [
  "Vault commands (reply to an uploaded file):",
  "/title Name (Year) - re-tag as a movie",
  "/tv Show S01E02 - re-tag as an episode",
  "/delete - remove it from the website",
  "",
  "Other commands:",
  "/stats - catalog size",
  "/chatid - show this chat's id",
].join("\n");

function toUpload(msg: Message): UploadInfo | null {
  const common = {
    vaultChatId: msg.chat.id,
    vaultMessageId: msg.message_id,
    caption: msg.caption ?? null,
  };
  if (msg.video) {
    const v = msg.video;
    return {
      ...common,
      telegramFileId: v.file_id,
      telegramFileUniqueId: v.file_unique_id,
      mediaType: "video",
      fileName: v.file_name ?? null,
      mimeType: v.mime_type ?? null,
      size: v.file_size ?? null,
      duration: v.duration ?? null,
      width: v.width ?? null,
      height: v.height ?? null,
    };
  }
  if (msg.document && isVideoFile(msg.document.file_name, msg.document.mime_type)) {
    const d = msg.document;
    return {
      ...common,
      telegramFileId: d.file_id,
      telegramFileUniqueId: d.file_unique_id,
      mediaType: "document",
      fileName: d.file_name ?? null,
      mimeType: d.mime_type ?? null,
      size: d.file_size ?? null,
      duration: null,
      width: null,
      height: null,
    };
  }
  return null;
}

const isVault = (ctx: Context) => env.vaultChatId !== null && ctx.chat?.id === env.vaultChatId;

async function start() {
  const bot = new Bot(env.botToken);

  bot.use(async (ctx, next) => {
    const text = ctx.msg && "text" in ctx.msg ? ctx.msg.text : undefined;
    if (text) console.log(`[bot] heard chat ${ctx.chat?.id}: ${text.slice(0, 160)}`);
    await next();
  });

  const me = await bot.api.getMe();
  if (env.botUsername && env.botUsername.toLowerCase() !== me.username.toLowerCase()) {
    console.warn(`[bot] BOT_USERNAME=${env.botUsername} but the token belongs to @${me.username}`);
  }
  if (env.vaultChatId === null) {
    console.warn("[bot] VAULT_CHAT_ID is not set. Add the bot to your vault group and send /chatid there.");
  }

  const quietReply = (ctx: Context, text: string) =>
    ctx.reply(text, {
      disable_notification: true,
      reply_parameters: ctx.msg ? { message_id: ctx.msg.message_id, allow_sending_without_reply: true } : undefined,
    });

  // --- anywhere -------------------------------------------------------------

  bot.command("chatid", (ctx) =>
    ctx.reply(`This chat's id is ${ctx.chat.id}${isVault(ctx) ? " (this is your vault)" : ""}.`),
  );

  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const payload = ctx.match.trim();
    if (payload.startsWith("login_")) {
      try {
        await ctx.reply("Signing you in...");
      } catch (err) {
        console.error("[bot] login ack failed", err);
      }
      try {
        const result = await confirmLogin(payload.slice("login_".length), from);
        if (!result.ok) return ctx.reply(result.message);
        return ctx.reply(
          `You're in, ${result.user.firstName}. Go back to the website — it will open on its own.\n\n` +
            "Anything you pick there will be sent to this chat.",
        );
      } catch (err) {
        console.error("[bot] login failed", err);
        return ctx.reply("I couldn't finish login (database is not configured). Set DATABASE_URL in .env and restart.");
      }
    }
    return ctx.reply(
      `Hi ${from.first_name}! I deliver movies and shows from the ReelVault library.\n\n` +
        `Open a private chat with me, browse ${env.siteUrl}, and I'll send files here.\n\n` +
        `This chat's id is ${ctx.chat.id}${isVault(ctx) ? " (this is your vault)" : ""}.`,
    );
  });

  bot.command("help", (ctx) =>
    ctx.reply(
      ctx.chat.type === "private"
        ? `Pick a movie or episode at ${env.siteUrl} and press "Send to Telegram". It will show up in this chat.`
        : HELP_VAULT,
    ),
  );

  // --- vault: indexing -------------------------------------------------------

  async function handleUpload(ctx: Context, msg: Message) {
    if (env.vaultChatId === null) {
      if (msg.chat.type !== "private") {
        await ctx.reply(`To index uploads here, set VAULT_CHAT_ID=${msg.chat.id} and restart the bot.`);
      }
      return;
    }
    if (msg.chat.id !== env.vaultChatId) return;
    const upload = toUpload(msg);
    if (!upload) return;
    try {
      const result = await indexUpload(upload);
      const label = describeMedia(result);
      console.log(`[bot] ${result.duplicate ? "duplicate" : "indexed"}: ${label}`);
      await quietReply(
        ctx,
        result.duplicate
          ? `Already in the library as: ${label}`
          : `Added: ${label}\nWrong? Reply to the file with /title Name (Year) or /tv Show S01E02`,
      );
    } catch (err) {
      console.error("[bot] indexing failed", err);
      await quietReply(ctx, `Couldn't index this file: ${(err as Error).message}`);
    }
  }

  bot.on(["message:video", "message:document"], (ctx) => handleUpload(ctx, ctx.msg));
  bot.on(["channel_post:video", "channel_post:document"], (ctx) => handleUpload(ctx, ctx.msg));

  // --- vault: owner commands -------------------------------------------------

  async function repliedFile(ctx: Context) {
    const target = ctx.msg?.reply_to_message;
    if (!target || env.vaultChatId === null) return null;
    return (await findVaultFile(env.vaultChatId, target.message_id)) ?? null;
  }

  const vault = bot.filter(isVault);

  vault.command(["title", "movie", "tv"], async (ctx) => {
    const file = await repliedFile(ctx);
    if (!file) return quietReply(ctx, "Reply to an indexed file with this command.");
    const parsed = parseMedia(ctx.match, null);
    const wantsEpisode = ctx.message?.text?.startsWith("/tv") ?? false;
    if (!parsed || (wantsEpisode && parsed.kind !== "episode")) {
      return quietReply(ctx, wantsEpisode ? "Usage: /tv Show Name S01E02" : "Usage: /title Movie Name (2010)");
    }
    const result = await retagFile(file.id, parsed);
    return quietReply(ctx, `Updated: ${describeMedia(result)}`);
  });

  vault.command("delete", async (ctx) => {
    const file = await repliedFile(ctx);
    if (!file) return quietReply(ctx, "Reply to an indexed file with /delete.");
    await removeFile(file.id);
    return quietReply(ctx, "Removed from the website. The message in this chat is untouched.");
  });

  vault.command("stats", async (ctx) => {
    const s = await catalogStats();
    return ctx.reply(`${s.movies} movies, ${s.shows} shows, ${s.files} files indexed.`);
  });

  vault.command("help", (ctx) => ctx.reply(HELP_VAULT));

  // After the commands, so /start and the vault commands are not swallowed.
  const handledCommand = /^(?:start|help|chatid|title|movie|tv|delete|stats)$/;
  bot.on("message:text", async (ctx) => {
    if (ctx.chat?.type !== "private") return;
    const command = /^\/([A-Za-z0-9_]+)/.exec(ctx.msg.text)?.[1]?.toLowerCase();
    if (command && handledCommand.test(command)) return;
    const name = ctx.from?.first_name ?? "there";
    await ctx.reply(
      `Hi ${name}. I'm online.\n\n` +
        `To sign in, open ${env.siteUrl}/login and scan the code, then tap Start in this chat. That's enough - you're in.\n\n` +
        `After that, pick something on the site and I'll send it here.`,
    );
  });

  bot.catch((err) => {
    const e = err.error;
    console.error("[bot] handler error:", e instanceof GrammyError ? e.description : e);
  });

  await bot.api.setMyCommands([
    { command: "start", description: "Get started" },
    { command: "help", description: "How to request a movie" },
  ]);

  process.once("SIGINT", () => shutdown(() => bot.stop()));
  process.once("SIGTERM", () => shutdown(() => bot.stop()));

  try {
    await ensureSchema();
  } catch (err) {
    console.error("[bot] database not ready (indexing and login will fail until DATABASE_URL is set):", err);
  }
  console.log(
    `[bot] @${me.username} is running. Vault: ${env.vaultChatId ?? "not set"}.`,
  );
  await bot.start({
    allowed_updates: ["message", "channel_post"],
    drop_pending_updates: false,
  });
}

if (isMock) {
  console.log(
    "[bot] BOT_TOKEN is not set: running in mock mode. Sends from the website are logged here instead of hitting Telegram.",
  );
  process.once("SIGINT", () => shutdown());
  process.once("SIGTERM", () => shutdown());
} else {
  void start().catch((err) => {
    console.error("[bot] failed to start:", err);
  });
}
