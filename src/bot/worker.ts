import { GrammyError, type Api } from "grammy";
import { claimNextSend, finishSend, requeueStuck, type Delivery } from "@/lib/sends";
import { db } from "@/db";
import { sends } from "@/db/schema";
import { eq } from "drizzle-orm";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Telegram allows roughly one message per second per chat, so deliveries are paced. */
const PACE_MS = 1100;
const IDLE_MS = 1000;

function explain(err: unknown): string {
  if (err instanceof GrammyError) {
    if (err.error_code === 403) return "The bot can't message you. Open the bot in Telegram and press Start.";
    if (/wrong file identifier|file reference/i.test(err.description)) {
      return "Telegram no longer recognises this file. Ask the owner to re-upload it.";
    }
    return err.description;
  }
  return (err as Error)?.message ?? "Unknown error";
}

async function deliver(api: Api | null, d: Delivery) {
  if (!api) {
    console.log(`[mock-send] -> user ${d.userId}: ${d.caption} (${d.mediaType})`);
    await sleep(700);
    return;
  }
  const opts = { caption: d.caption };
  if (d.mediaType === "video") await api.sendVideo(d.userId, d.telegramFileId, { ...opts, supports_streaming: true });
  else await api.sendDocument(d.userId, d.telegramFileId, opts);
}

export async function runSendWorker(api: Api | null, signal: AbortSignal) {
  requeueStuck();
  while (!signal.aborted) {
    const job = claimNextSend();
    if (!job) {
      await sleep(IDLE_MS);
      continue;
    }
    try {
      await deliver(api, job);
      finishSend(job.sendId);
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 429) {
        const wait = (err.parameters.retry_after ?? 5) * 1000;
        console.warn(`[worker] rate limited, retrying in ${wait}ms`);
        db.update(sends).set({ status: "queued" }).where(eq(sends.id, job.sendId)).run();
        await sleep(wait);
        continue;
      }
      console.error(`[worker] send ${job.sendId} failed:`, explain(err));
      finishSend(job.sendId, explain(err));
    }
    await sleep(PACE_MS);
  }
}
