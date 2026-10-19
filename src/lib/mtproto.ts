import "server-only";
import fs from "node:fs";
import path from "node:path";
import bigInt from "big-integer";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import type { FileRow } from "@/db/schema";
import { env, streamingEnabled } from "@/lib/env";

const REQUEST_SIZE = 512 * 1024;

let clientPromise: Promise<TelegramClient> | null = null;

function sessionFile() {
  return path.resolve(process.cwd(), path.dirname(env.databasePath), "mtproto.session");
}

/** One shared MTProto connection, logged in as the bot. */
export async function getMtproto(): Promise<TelegramClient> {
  if (!streamingEnabled) {
    throw new Error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env to enable in-browser playback.");
  }
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

async function connect(): Promise<TelegramClient> {
  const file = sessionFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const saved = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const session = new StringSession(saved);
  const client = new TelegramClient(session, env.telegramApiId, env.telegramApiHash, {
    connectionRetries: 8,
    retryDelay: 2000,
  });
  await client.start({ botAuthToken: env.botToken });
  fs.writeFileSync(file, session.save(), "utf8");
  console.log("[mtproto] connected as bot");
  return client;
}

async function vaultMedia(client: TelegramClient, file: FileRow) {
  const messages = await client.getMessages(file.vaultChatId, { ids: file.vaultMessageId });
  const media = messages[0]?.media;
  if (!media || !("document" in media || "video" in media || "photo" in media)) {
    throw new Error("That file is no longer in the vault group. Re-upload it and try again.");
  }
  return media;
}

function expired(err: unknown): boolean {
  const text = String((err as { message?: string })?.message ?? err);
  return /FILE_REFERENCE_EXPIRED|FILE_REFERENCE_INVALID/i.test(text);
}

/**
 * Stream `start..end` (inclusive) of a vault file. The browser's Range requests map onto
 * Telegram GetFile chunks, so seeking does not download the whole movie.
 */
export async function streamFileRange(
  file: FileRow,
  start: number,
  end: number,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const client = await getMtproto();
  const length = Math.max(end - start + 1, 0);
  const chunkLimit = Math.ceil(length / REQUEST_SIZE) + 2;

  const open = async () => {
    const media = await vaultMedia(client, file);
    return client.iterDownload({
      file: media,
      offset: bigInt(start),
      requestSize: REQUEST_SIZE,
      limit: chunkLimit,
      msgData: [file.vaultChatId, file.vaultMessageId],
    });
  };

  let download = await open();
  const iterator = download[Symbol.asyncIterator]();
  let sent = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (signal.aborted || sent >= length) {
        await download.close().catch(() => undefined);
        controller.close();
        return;
      }
      try {
        const { value, done } = await iterator.next();
        if (done || !value) {
          controller.close();
          return;
        }
        const slice = value.subarray(0, Math.min(value.length, length - sent));
        sent += slice.length;
        controller.enqueue(new Uint8Array(slice));
        if (sent >= length) {
          await download.close().catch(() => undefined);
          controller.close();
        }
      } catch (err) {
        if (signal.aborted) {
          controller.close();
          return;
        }
        if (expired(err) && sent === 0) {
          download = await open();
          const { value, done } = await download[Symbol.asyncIterator]().next();
          if (done || !value) {
            controller.close();
            return;
          }
          const slice = value.subarray(0, Math.min(value.length, length - sent));
          sent += slice.length;
          controller.enqueue(new Uint8Array(slice));
          return;
        }
        controller.error(err);
      }
    },
    async cancel() {
      await download.close().catch(() => undefined);
    },
  });
}
