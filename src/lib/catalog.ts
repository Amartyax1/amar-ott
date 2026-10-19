import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { episodes, files, titles, type Episode, type FileRow, type Title } from "@/db/schema";
import { parseMedia, titleKey, type ParsedMedia } from "@/lib/parse";
import { lookupTmdb } from "@/lib/tmdb";

export type TitleCard = Pick<
  Title,
  "id" | "kind" | "name" | "year" | "overview" | "posterUrl" | "backdropUrl" | "genres" | "rating"
> & { addedAt: number; fileCount: number; seasonCount: number };

type CardRow = Omit<TitleCard, "genres"> & { genres: string };

const CARD_SELECT = `
  SELECT t.id, t.kind, t.name, t.year, t.overview, t.poster_url AS posterUrl, t.backdrop_url AS backdropUrl,
         t.genres, t.rating, MAX(f.created_at) AS addedAt, COUNT(f.id) AS fileCount,
         COUNT(DISTINCT e.season) AS seasonCount
  FROM titles t
  JOIN files f ON f.title_id = t.id AND f.hidden = 0
  LEFT JOIN episodes e ON e.id = f.episode_id
  WHERE t.hidden = 0`;

function toCard(row: CardRow): TitleCard {
  return { ...row, genres: JSON.parse(row.genres || "[]") };
}

export function listTitles(opts: { kind?: "movie" | "show"; limit?: number; genre?: string } = {}): TitleCard[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.kind) {
    where.push("t.kind = ?");
    params.push(opts.kind);
  }
  if (opts.genre) {
    where.push("EXISTS (SELECT 1 FROM json_each(t.genres) g WHERE g.value = ?)");
    params.push(opts.genre);
  }
  const query = `${CARD_SELECT} ${where.map((w) => `AND ${w}`).join(" ")}
    GROUP BY t.id ORDER BY addedAt DESC LIMIT ?`;
  params.push(opts.limit ?? 500);
  return (db.$client.prepare(query).all(...params) as CardRow[]).map(toCard);
}

export function searchTitles(q: string, limit = 60): TitleCard[] {
  const term = q.trim();
  if (!term) return [];
  const like = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const query = `${CARD_SELECT}
    AND (t.name LIKE ? ESCAPE '\\' OR t.key LIKE ? ESCAPE '\\' OR t.overview LIKE ? ESCAPE '\\' OR t.genres LIKE ? ESCAPE '\\')
    GROUP BY t.id
    ORDER BY (t.name LIKE ? ESCAPE '\\') DESC, addedAt DESC LIMIT ?`;
  const key = `%${titleKey(term)}%`;
  return (db.$client.prepare(query).all(like, key, like, like, `${term}%`, limit) as CardRow[]).map(toCard);
}

/** Genres that have enough titles to deserve their own row on the home page. */
export function topGenres(minTitles = 3, max = 6): string[] {
  const rows = db.$client
    .prepare(
      `SELECT g.value AS genre, COUNT(DISTINCT t.id) AS n
       FROM titles t, json_each(t.genres) g
       WHERE t.hidden = 0 AND EXISTS (SELECT 1 FROM files f WHERE f.title_id = t.id AND f.hidden = 0)
       GROUP BY g.value HAVING n >= ? ORDER BY n DESC LIMIT ?`,
    )
    .all(minTitles, max) as { genre: string }[];
  return rows.map((r) => r.genre);
}

export type FileVersion = Pick<
  FileRow,
  "id" | "fileName" | "mimeType" | "size" | "duration" | "width" | "height" | "mediaType" | "createdAt"
>;

export type EpisodeWithFiles = Pick<Episode, "id" | "season" | "episode" | "name"> & { files: FileVersion[] };

export type TitleDetail = Title & {
  files: FileVersion[];
  seasons: { season: number; episodes: EpisodeWithFiles[] }[];
};

const VERSION_COLUMNS = {
  id: files.id,
  fileName: files.fileName,
  mimeType: files.mimeType,
  size: files.size,
  duration: files.duration,
  width: files.width,
  height: files.height,
  mediaType: files.mediaType,
  createdAt: files.createdAt,
  episodeId: files.episodeId,
};

function toVersion(row: FileVersion & { episodeId: number | null }): FileVersion {
  const { episodeId, ...version } = row;
  void episodeId;
  return version;
}

export function getTitle(id: number): TitleDetail | null {
  const title = db.select().from(titles).where(and(eq(titles.id, id), eq(titles.hidden, false))).get();
  if (!title) return null;

  const rows = db
    .select(VERSION_COLUMNS)
    .from(files)
    .where(and(eq(files.titleId, id), eq(files.hidden, false)))
    .orderBy(files.createdAt)
    .all();
  if (!rows.length) return null;

  const eps = db
    .select()
    .from(episodes)
    .where(eq(episodes.titleId, id))
    .orderBy(episodes.season, episodes.episode)
    .all();

  const bySeason = new Map<number, EpisodeWithFiles[]>();
  for (const ep of eps) {
    const epFiles = rows.filter((f) => f.episodeId === ep.id).map(toVersion);
    if (!epFiles.length) continue;
    const list = bySeason.get(ep.season) ?? [];
    list.push({ id: ep.id, season: ep.season, episode: ep.episode, name: ep.name, files: epFiles });
    bySeason.set(ep.season, list);
  }

  return {
    ...title,
    files: rows.filter((f) => f.episodeId === null).map(toVersion),
    seasons: [...bySeason.entries()].map(([season, episodes]) => ({ season, episodes })),
  };
}

// ---------------------------------------------------------------------------
// Indexing (used by the bot)

export type UploadInfo = {
  telegramFileId: string;
  telegramFileUniqueId: string;
  mediaType: "video" | "document";
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  vaultChatId: number;
  vaultMessageId: number;
  caption: string | null;
};

export type IndexResult = { file: FileRow; title: Title; episode: Episode | null; duplicate: boolean };

function fallbackParse(upload: Pick<UploadInfo, "fileName" | "vaultMessageId">): ParsedMedia {
  return { kind: "movie", title: upload.fileName || `Untitled upload #${upload.vaultMessageId}`, year: null };
}

async function upsertTitle(parsed: ParsedMedia): Promise<Title> {
  const kind = parsed.kind === "movie" ? "movie" : "show";
  const name = parsed.kind === "movie" ? parsed.title : parsed.show;
  // Movies are grouped by name + year (remakes differ); shows by name only so uploads without a year still group.
  const key = titleKey(name, kind === "movie" ? parsed.year : null);

  const existing = db.select().from(titles).where(and(eq(titles.kind, kind), eq(titles.key, key))).get();
  if (existing) {
    if (existing.hidden) db.update(titles).set({ hidden: false }).where(eq(titles.id, existing.id)).run();
    return existing;
  }

  const meta = await lookupTmdb(kind, name, parsed.year);
  return db
    .insert(titles)
    .values({
      kind,
      key,
      name: meta?.name ?? name,
      year: meta?.year ?? parsed.year,
      overview: meta?.overview,
      posterUrl: meta?.posterUrl,
      backdropUrl: meta?.backdropUrl,
      genres: meta?.genres ?? [],
      rating: meta?.rating,
      tmdbId: meta?.tmdbId,
    })
    .onConflictDoUpdate({ target: [titles.kind, titles.key], set: { updatedAt: Date.now() } })
    .returning()
    .get();
}

function upsertEpisode(titleId: number, parsed: ParsedMedia): Episode | null {
  if (parsed.kind !== "episode") return null;
  const found = db
    .select()
    .from(episodes)
    .where(and(eq(episodes.titleId, titleId), eq(episodes.season, parsed.season), eq(episodes.episode, parsed.episode)))
    .get();
  if (found) {
    if (!found.name && parsed.episodeTitle) {
      db.update(episodes).set({ name: parsed.episodeTitle }).where(eq(episodes.id, found.id)).run();
      return { ...found, name: parsed.episodeTitle };
    }
    return found;
  }
  return db
    .insert(episodes)
    .values({ titleId, season: parsed.season, episode: parsed.episode, name: parsed.episodeTitle })
    .returning()
    .get();
}

function touch(titleId: number) {
  db.update(titles).set({ updatedAt: Date.now() }).where(eq(titles.id, titleId)).run();
}

/** Remove titles/episodes that no longer have any files attached. */
export function pruneOrphans() {
  db.$client.exec(`
    DELETE FROM episodes WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.episode_id = episodes.id);
    DELETE FROM titles WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.title_id = titles.id);
  `);
}

export async function indexUpload(upload: UploadInfo): Promise<IndexResult> {
  const dup = db.select().from(files).where(eq(files.telegramFileUniqueId, upload.telegramFileUniqueId)).get();
  if (dup) {
    const title = db.select().from(titles).where(eq(titles.id, dup.titleId)).get()!;
    const episode = dup.episodeId
      ? (db.select().from(episodes).where(eq(episodes.id, dup.episodeId)).get() ?? null)
      : null;
    return { file: dup, title, episode, duplicate: true };
  }

  const parsed = parseMedia(upload.caption, upload.fileName) ?? fallbackParse(upload);
  const title = await upsertTitle(parsed);
  const episode = upsertEpisode(title.id, parsed);
  const file = db
    .insert(files)
    .values({ ...upload, titleId: title.id, episodeId: episode?.id ?? null })
    .returning()
    .get();
  touch(title.id);
  return { file, title, episode, duplicate: false };
}

export function getFileById(id: number): FileRow | undefined {
  return db.select().from(files).where(and(eq(files.id, id), eq(files.hidden, false))).get();
}

export function findVaultFile(vaultChatId: number, vaultMessageId: number): FileRow | undefined {
  return db
    .select()
    .from(files)
    .where(and(eq(files.vaultChatId, vaultChatId), eq(files.vaultMessageId, vaultMessageId)))
    .get();
}

/** Move an indexed file to a different title/episode (owner correction). */
export async function retagFile(fileId: number, parsed: ParsedMedia): Promise<IndexResult> {
  const title = await upsertTitle(parsed);
  const episode = upsertEpisode(title.id, parsed);
  const file = db
    .update(files)
    .set({ titleId: title.id, episodeId: episode?.id ?? null, hidden: false })
    .where(eq(files.id, fileId))
    .returning()
    .get();
  touch(title.id);
  pruneOrphans();
  return { file, title, episode, duplicate: false };
}

export function removeFile(fileId: number) {
  db.delete(files).where(eq(files.id, fileId)).run();
  pruneOrphans();
}

export function describeMedia(result: Pick<IndexResult, "title" | "episode">): string {
  const { title, episode } = result;
  const year = title.year ? ` (${title.year})` : "";
  if (!episode) return `${title.name}${year}`;
  const se = `S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`;
  return `${title.name} ${se}${episode.name ? ` - ${episode.name}` : ""}`;
}

export function catalogStats() {
  return db.$client
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM titles WHERE kind = 'movie') AS movies,
         (SELECT COUNT(*) FROM titles WHERE kind = 'show') AS shows,
         (SELECT COUNT(*) FROM files) AS files`,
    )
    .get() as { movies: number; shows: number; files: number };
}
