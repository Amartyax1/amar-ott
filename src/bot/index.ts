import "./load-env";
import { Bot, GrammyError, type Context } from "grammy";
import type { Message } from "grammy/types";
import { env, isMock } from "@/lib/env";
import { confirmLogin, createInvite } from "@/lib/access";
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
import { runSendWorker } from "./worker";

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
  "/invite - create a one-time invite code for a friend",
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
  const me = await bot.api.getMe();
  if (env.botUsername && env.botUsername.toLowerCase() !== me.username.toLowerCase()) {
    console.warn(`[bot] BOT_USERNAME=${env.botUsername} but the token belongs to @${me.username}`);
  }
  if (env.vaultChatId === null) {
    console.warn("[bot] VAULT_CHAT_ID is not set. Add the bot to your vault group and send /chatid there.");
  }

  async function isVaultMember(userId: number): Promise<boolean> {
    if (env.vaultChatId === null) return false;
    try {
      const m = await bot.api.getChatMember(env.vaultChatId, userId);
      return ["creator", "administrator", "member", "restricted"].includes(m.status);
    } catch {
      return false;
    }
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

  // --- private chats: login & welcome ---------------------------------------

  const privateChat = bot.chatType("private");

  privateChat.command("start", async (ctx) => {
    const payload = ctx.match.trim();
    if (payload.startsWith("login_")) {
      const result = confirmLogin(payload.slice("login_".length), ctx.from, await isVaultMember(ctx.from.id));
      if (!result.ok) return ctx.reply(result.message);
      return ctx.reply(
        `You're logged in, ${result.user.firstName}. Head back to the website - it will continue on its own.\n\n` +
          "Anything you pick there will be sent to this chat.",
      );
    }
    return ctx.reply(
      `Hi ${ctx.from.first_name}! I deliver movies and shows from the ReelVault library.\n\n` +
        `Browse and pick something at ${env.siteUrl} and I'll send it right here.`,
    );
  });

  privateChat.command("help", (ctx) =>
    ctx.reply(`Pick a movie or episode at ${env.siteUrl} and press "Send to Telegram". It will show up in this chat.`),
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

  function repliedFile(ctx: Context) {
    const target = ctx.msg?.reply_to_message;
    if (!target || env.vaultChatId === null) return null;
    return findVaultFile(env.vaultChatId, target.message_id) ?? null;
  }

  const vault = bot.filter(isVault);

  vault.command(["title", "movie", "tv"], async (ctx) => {
    const file = repliedFile(ctx);
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
    const file = repliedFile(ctx);
    if (!file) return quietReply(ctx, "Reply to an indexed file with /delete.");
    removeFile(file.id);
    return quietReply(ctx, "Removed from the website. The message in this chat is untouched.");
  });

  vault.command("invite", (ctx) => {
    const code = createInvite();
    return ctx.reply(
      `Invite code: ${code}\n\nShare it with one friend. They enter it on the login page at ${env.siteUrl}/login. It works once.`,
    );
  });

  vault.command("stats", (ctx) => {
    const s = catalogStats();
    return ctx.reply(`${s.movies} movies, ${s.shows} shows, ${s.files} files indexed.`);
  });

  vault.command("help", (ctx) => ctx.reply(HELP_VAULT));

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

  void runSendWorker(bot.api, controller.signal);
  console.log(
    `[bot] @${me.username} is running. Vault: ${env.vaultChatId ?? "not set"}. Login links: t.me/${me.username}?start=login_...`,
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
  void runSendWorker(null, controller.signal);
} else {
  void start();
}
