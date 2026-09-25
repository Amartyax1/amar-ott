import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { episodes, files, sends, titles, type Send } from "@/db/schema";
import { env } from "@/lib/env";

export type EnqueueResult = { ok: true; ids: number[] } | { ok: false; error: string; status: 400 | 429 };

export function enqueueSends(userId: number, fileIds: number[]): EnqueueResult {
  const unique = [...new Set(fileIds)].filter(Number.isInteger);
  if (!unique.length) return { ok: false, error: "Nothing to send.", status: 400 };

  const valid = db
    .select({ id: files.id })
    .from(files)
    .where(and(inArray(files.id, unique), eq(files.hidden, false)))
    .all()
    .map((r) => r.id);
  if (valid.length !== unique.length) return { ok: false, error: "Some of those files are no longer available.", status: 400 };

  const hourAgo = Date.now() - 60 * 60 * 1000;
  const { used } = db
    .select({ used: sql<number>`count(*)` })
    .from(sends)
    .where(and(eq(sends.userId, userId), gt(sends.createdAt, hourAgo)))
    .get()!;
  const remaining = env.sendLimitPerHour - used;
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

  const rows = db
    .insert(sends)
    .values(valid.map((fileId) => ({ userId, fileId })))
    .returning({ id: sends.id })
    .all();
  return { ok: true, ids: rows.map((r) => r.id) };
}

export function getSendStatuses(userId: number, ids: number[]): Pick<Send, "id" | "status" | "error">[] {
  if (!ids.length) return [];
  return db
    .select({ id: sends.id, status: sends.status, error: sends.error })
    .from(sends)
    .where(and(eq(sends.userId, userId), inArray(sends.id, ids)))
    .all();
}

// ---------------------------------------------------------------------------
// Worker side (bot process)

export type Delivery = {
  sendId: number;
  userId: number;
  telegramFileId: string;
  mediaType: "video" | "document";
  caption: string;
};

/** Crash recovery: anything left mid-send by a previous process goes back in the queue. */
export function requeueStuck() {
  db.update(sends).set({ status: "queued" }).where(eq(sends.status, "sending")).run();
}

export function claimNextSend(): Delivery | null {
  const row = db.$client
    .prepare(
      `UPDATE sends SET status = 'sending'
       WHERE id = (SELECT id FROM sends WHERE status = 'queued' ORDER BY id LIMIT 1)
       RETURNING id, user_id AS userId, file_id AS fileId`,
    )
    .get() as { id: number; userId: number; fileId: number } | undefined;
  if (!row) return null;

  const f = db
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
    .where(eq(files.id, row.fileId))
    .get();

  if (!f) {
    finishSend(row.id, "File was removed from the catalog.");
    return claimNextSend();
  }

  let caption = f.year ? `${f.name} (${f.year})` : f.name;
  if (f.season !== null && f.episode !== null) {
    caption = `${f.name} - S${String(f.season).padStart(2, "0")}E${String(f.episode).padStart(2, "0")}`;
    if (f.episodeName) caption += ` - ${f.episodeName}`;
  }

  return { sendId: row.id, userId: row.userId, telegramFileId: f.telegramFileId, mediaType: f.mediaType, caption };
}

export function finishSend(id: number, error?: string) {
  db.update(sends)
    .set(error ? { status: "failed", error } : { status: "sent", sentAt: Date.now() })
    .where(eq(sends.id, id))
    .run();
}
