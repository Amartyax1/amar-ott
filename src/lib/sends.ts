import { GrammyError } from "grammy";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { episodes, files, sends, titles, type Send } from "@/db/schema";
import { env, isMock } from "@/lib/env";
import { telegramApi } from "@/lib/telegram";

export type SendStatus = Pick<Send, "id" | "status" | "error">;
export type DeliverResult = { ok: true; ids: number[]; sends: SendStatus[] } | { ok: false; error: string; status: 400 | 429 };

function explain(err: unknown): string {
  if (err instanceof GrammyError) {
    if (err.error_code === 403) return "Open a chat with the bot in Telegram and tap Start, then try again.";
    if (/wrong file identifier|file reference/i.test(err.description)) {
      return "Telegram no longer recognises this file. Ask the owner to re-upload it.";
    }
    return err.description;
  }
  return (err as Error)?.message ?? "Unknown error";
}

export async function deliverNow(userId: number, fileIds: number[]): Promise<DeliverResult> {
  await ensureSchema();
  const unique = [...new Set(fileIds)].filter(Number.isInteger);
  if (!unique.length) return { ok: false, error: "Nothing to send.", status: 400 };

  const valid = (
    await db
      .select({ id: files.id })
      .from(files)
      .where(and(inArray(files.id, unique), eq(files.hidden, false)))
  ).map((r) => r.id);
  if (valid.length !== unique.length) return { ok: false, error: "Some of those files are no longer available.", status: 400 };

  const hourAgo = Date.now() - 60 * 60 * 1000;
  const [{ used }] = await db
    .select({ used: sql<number>`count(*)::int` })
    .from(sends)
    .where(and(eq(sends.userId, userId), gt(sends.createdAt, hourAgo)));
  const remaining = env.sendLimitPerHour - Number(used);
  if (valid.length > remaining) {
    return {
      ok: false,
      error:
        remaining <= 0
          ? `You've hit the limit of ${env.sendLimitPerHour} files per hour. Try again a bit later.`
          : `That's ${valid.length} files but you only have ${remaining} sends left this hour.`,
      status: 429,
    };
  }

  const rows = await db.insert(sends).values(valid.map((fileId) => ({ userId, fileId }))).returning({ id: sends.id, fileId: sends.fileId });

  const statuses: SendStatus[] = [];
  for (const row of rows) {
    const meta = await fileCaption(row.fileId);
    if (!meta) {
      await db.update(sends).set({ status: "failed", error: "File was removed from the catalog." }).where(eq(sends.id, row.id));
      statuses.push({ id: row.id, status: "failed", error: "File was removed from the catalog." });
      continue;
    }
    try {
      if (isMock) {
        console.log(`[mock-send] -> user ${userId}: ${meta.caption} (${meta.mediaType})`);
      } else if (meta.mediaType === "video") {
        await telegramApi().sendVideo(userId, meta.telegramFileId, { caption: meta.caption, supports_streaming: true });
      } else {
        await telegramApi().sendDocument(userId, meta.telegramFileId, { caption: meta.caption });
      }
      await db.update(sends).set({ status: "sent", sentAt: Date.now() }).where(eq(sends.id, row.id));
      statuses.push({ id: row.id, status: "sent", error: null });
    } catch (err) {
      const error = explain(err);
      console.error(`[send] ${row.id} failed:`, error);
      await db.update(sends).set({ status: "failed", error }).where(eq(sends.id, row.id));
      statuses.push({ id: row.id, status: "failed", error });
    }
  }

  return { ok: true, ids: rows.map((r) => r.id), sends: statuses };
}

async function fileCaption(fileId: number) {
  const [f] = await db
    .select({
      telegramFileId: files.telegramFileId,
      mediaType: files.mediaType,
      name: titles.name,
      year: titles.year,
      season: episodes.season,
      episode: episodes.episode,
      episodeName: episodes.name,
    })
    .from(files)
    .innerJoin(titles, eq(titles.id, files.titleId))
    .leftJoin(episodes, eq(episodes.id, files.episodeId))
    .where(eq(files.id, fileId))
    .limit(1);
  if (!f) return null;
  let caption = f.year ? `${f.name} (${f.year})` : f.name;
  if (f.season !== null && f.episode !== null) {
    caption = `${f.name} - S${String(f.season).padStart(2, "0")}E${String(f.episode).padStart(2, "0")}`;
    if (f.episodeName) caption += ` - ${f.episodeName}`;
  }
  return { ...f, caption };
}

export async function getSendStatuses(userId: number, ids: number[]): Promise<SendStatus[]> {
  if (!ids.length) return [];
  await ensureSchema();
  return db
    .select({ id: sends.id, status: sends.status, error: sends.error })
    .from(sends)
    .where(and(eq(sends.userId, userId), inArray(sends.id, ids)));
}
