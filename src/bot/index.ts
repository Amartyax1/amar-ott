import "./load-env";
import { Bot, GrammyError, type Context } from "grammy";
import type { Message } from "grammy/types";
import { env, isMock } from "@/lib/env";
import { type UploadInfo } from "@/lib/catalog";
import { isVideoFile, parseMedia } from "@/lib/parse";
import { SiteError, confirmOnSite, deleteOnSite, findFileOnSite, indexOnSite, retagOnSite, statsOnSite } from "./site";

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
        const result = await confirmOnSite(payload.slice("login_".length), {
          id: from.id,
          first_name: from.first_name,
          last_name: from.last_name,
          username: from.username,
        });
        if (!result.ok) return ctx.reply(result.message ?? "Login didn't go through. Go back to the site and try again.");
        return ctx.reply(
          `You're in, ${result.name}. Go back to the website. It will open on its own.\n\n` +
            "Anything you pick there will be sent to this chat.",
        );
      } catch (err) {
        console.error("[bot] login failed", err);
        const detail = err instanceof SiteError ? err.message : "Try again in a moment.";
        return ctx.reply(`I couldn't finish login. ${detail}`);
      }
    }
    return ctx.reply(
      `Hi ${from.first_name}. Open ${env.siteUrl} and tap Start from the login page. I'll sign you in here.\n\n` +
        "After that, pick a movie on the site and I'll send it to this chat.",
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
      const result = await indexOnSite(upload);
      const label = result.label;
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
    const found = await findFileOnSite(env.vaultChatId, target.message_id);
    return found.id === null ? null : { id: found.id };
  }

  const vault = bot.filter(isVault);

  vault.command(["title", "movie", "tv"], async (ctx) => {
    const file = await repliedFile(ctx);
    if (!file) return quietReply(ctx, "Reply to an indexed file with this command.");
    const wantsEpisode = ctx.message?.text?.startsWith("/tv") ?? false;
    const parsed = parseMedia(ctx.match, null);
    if (!parsed || (wantsEpisode && parsed.kind !== "episode")) {
      return quietReply(ctx, wantsEpisode ? "Usage: /tv Show Name S01E02" : "Usage: /title Movie Name (2010)");
    }
    const result = await retagOnSite(file.id, ctx.match, wantsEpisode);
    return quietReply(ctx, `Updated: ${result.label}`);
  });

  vault.command("delete", async (ctx) => {
    const file = await repliedFile(ctx);
    if (!file) return quietReply(ctx, "Reply to an indexed file with /delete.");
    await deleteOnSite(file.id);
    return quietReply(ctx, "Removed from the website. The message in this chat is untouched.");
  });

  vault.command("stats", async (ctx) => {
    const s = await statsOnSite();
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
        `To sign in, open ${env.siteUrl} and tap Start from the login page. That's enough.\n\n` +
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

  console.log(
    `[bot] @${me.username} is running. Site: ${env.siteUrl}. Vault: ${env.vaultChatId ?? "not set"}.`,
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
