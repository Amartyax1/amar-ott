import { and, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { episodes, files, titles, type Episode, type FileRow, type Title } from "@/db/schema";
import { parseMedia, titleKey, type ParsedMedia } from "@/lib/parse";
import { lookupTmdb } from "@/lib/tmdb";

export type TitleCard = Pick<
  Title,
  "id" | "kind" | "name" | "year" | "overview" | "posterUrl" | "backdropUrl" | "genres" | "rating"
> & { addedAt: number; fileCount: number; seasonCount: number };

type CardRow = Omit<TitleCard, "genres"> & { genres: string[] | string };

function toCard(row: CardRow): TitleCard {
  const genres = Array.isArray(row.genres) ? row.genres : JSON.parse(row.genres || "[]");
  return { ...row, genres, addedAt: Number(row.addedAt), fileCount: Number(row.fileCount), seasonCount: Number(row.seasonCount) };
}

function cardQuery(extra: ReturnType<typeof sql>, limit: number) {
  return sql`
    SELECT t.id, t.kind, t.name, t.year, t.overview, t.poster_url AS "posterUrl", t.backdrop_url AS "backdropUrl",
           t.genres, t.rating, MAX(f.created_at) AS "addedAt", COUNT(f.id)::int AS "fileCount",
           COUNT(DISTINCT e.season)::int AS "seasonCount"
    FROM titles t
    JOIN files f ON f.title_id = t.id AND f.hidden = false
    LEFT JOIN episodes e ON e.id = f.episode_id
    WHERE t.hidden = false
    ${extra}
    GROUP BY t.id ORDER BY MAX(f.created_at) DESC LIMIT ${limit}
  `;
}

export async function listTitles(opts: { kind?: "movie" | "show"; limit?: number; genre?: string } = {}): Promise<TitleCard[]> {
  await ensureSchema();
  const extra = sql`
    ${opts.kind ? sql`AND t.kind = ${opts.kind}` : sql``}
    ${opts.genre ? sql`AND t.genres @> ${JSON.stringify([opts.genre])}::jsonb` : sql``}
  `;
  const rows = await db.execute(cardQuery(extra, opts.limit ?? 500));
  return ([...rows] as unknown as CardRow[]).map(toCard);
}

export async function searchTitles(q: string, limit = 60): Promise<TitleCard[]> {
  await ensureSchema();
  const term = q.trim();
  if (!term) return [];
  const like = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const key = `%${titleKey(term)}%`;
  const prefix = `${term}%`;
  const extra = sql`
    AND (t.name ILIKE ${like} ESCAPE '\\' OR t.key LIKE ${key} ESCAPE '\\' OR t.overview ILIKE ${like} ESCAPE '\\' OR t.genres::text ILIKE ${like} ESCAPE '\\')
  `;
  const rows = await db.execute(sql`
    SELECT t.id, t.kind, t.name, t.year, t.overview, t.poster_url AS "posterUrl", t.backdrop_url AS "backdropUrl",
           t.genres, t.rating, MAX(f.created_at) AS "addedAt", COUNT(f.id)::int AS "fileCount",
           COUNT(DISTINCT e.season)::int AS "seasonCount"
    FROM titles t
    JOIN files f ON f.title_id = t.id AND f.hidden = false
    LEFT JOIN episodes e ON e.id = f.episode_id
    WHERE t.hidden = false
    ${extra}
    GROUP BY t.id
    ORDER BY (t.name ILIKE ${prefix} ESCAPE '\\') DESC, MAX(f.created_at) DESC LIMIT ${limit}
  `);
  return ([...rows] as unknown as CardRow[]).map(toCard);
}

export async function topGenres(minTitles = 3, max = 6): Promise<string[]> {
  await ensureSchema();
  const rows = await db.execute(sql`
    SELECT g AS genre, COUNT(DISTINCT t.id)::int AS n
    FROM titles t, jsonb_array_elements_text(t.genres) g
    WHERE t.hidden = false AND EXISTS (SELECT 1 FROM files f WHERE f.title_id = t.id AND f.hidden = false)
    GROUP BY g HAVING COUNT(DISTINCT t.id) >= ${minTitles}
    ORDER BY n DESC LIMIT ${max}
  `);
  return ([...rows] as unknown as { genre: string }[]).map((r) => r.genre);
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

export async function getTitle(id: number): Promise<TitleDetail | null> {
  await ensureSchema();
  const [title] = await db.select().from(titles).where(and(eq(titles.id, id), eq(titles.hidden, false))).limit(1);
  if (!title) return null;

  const rows = await db
    .select(VERSION_COLUMNS)
    .from(files)
    .where(and(eq(files.titleId, id), eq(files.hidden, false)))
    .orderBy(files.createdAt);
  if (!rows.length) return null;

  const eps = await db.select().from(episodes).where(eq(episodes.titleId, id)).orderBy(episodes.season, episodes.episode);

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
  const key = titleKey(name, kind === "movie" ? parsed.year : null);

  const [existing] = await db.select().from(titles).where(and(eq(titles.kind, kind), eq(titles.key, key))).limit(1);
  if (existing) {
    if (existing.hidden) await db.update(titles).set({ hidden: false }).where(eq(titles.id, existing.id));
    return existing;
  }

  const meta = await lookupTmdb(kind, name, parsed.year);
  const [row] = await db
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
    .returning();
  return row;
}

async function upsertEpisode(titleId: number, parsed: ParsedMedia): Promise<Episode | null> {
  if (parsed.kind !== "episode") return null;
  const [found] = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.titleId, titleId), eq(episodes.season, parsed.season), eq(episodes.episode, parsed.episode)))
    .limit(1);
  if (found) {
    if (!found.name && parsed.episodeTitle) {
      await db.update(episodes).set({ name: parsed.episodeTitle }).where(eq(episodes.id, found.id));
      return { ...found, name: parsed.episodeTitle };
    }
    return found;
  }
  const [row] = await db
    .insert(episodes)
    .values({ titleId, season: parsed.season, episode: parsed.episode, name: parsed.episodeTitle })
    .returning();
  return row;
}

async function touch(titleId: number) {
  await db.update(titles).set({ updatedAt: Date.now() }).where(eq(titles.id, titleId));
}

export async function pruneOrphans() {
  await db.execute(sql`
    DELETE FROM episodes WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.episode_id = episodes.id);
    DELETE FROM titles WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.title_id = titles.id);
  `);
}

export async function indexUpload(upload: UploadInfo): Promise<IndexResult> {
  await ensureSchema();
  const [dup] = await db.select().from(files).where(eq(files.telegramFileUniqueId, upload.telegramFileUniqueId)).limit(1);
  if (dup) {
    const [title] = await db.select().from(titles).where(eq(titles.id, dup.titleId)).limit(1);
    const episode = dup.episodeId
      ? ((await db.select().from(episodes).where(eq(episodes.id, dup.episodeId)).limit(1))[0] ?? null)
      : null;
    return { file: dup, title: title!, episode, duplicate: true };
  }

  const parsed = parseMedia(upload.caption, upload.fileName) ?? fallbackParse(upload);
  const title = await upsertTitle(parsed);
  const episode = await upsertEpisode(title.id, parsed);
  const [file] = await db
    .insert(files)
    .values({ ...upload, titleId: title.id, episodeId: episode?.id ?? null })
    .returning();
  await touch(title.id);
  return { file, title, episode, duplicate: false };
}

export async function getFileById(id: number): Promise<FileRow | undefined> {
  await ensureSchema();
  const [row] = await db.select().from(files).where(and(eq(files.id, id), eq(files.hidden, false))).limit(1);
  return row;
}

export async function findVaultFile(vaultChatId: number, vaultMessageId: number): Promise<FileRow | undefined> {
  await ensureSchema();
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.vaultChatId, vaultChatId), eq(files.vaultMessageId, vaultMessageId)))
    .limit(1);
  return row;
}

export async function retagFile(fileId: number, parsed: ParsedMedia): Promise<IndexResult> {
  await ensureSchema();
  const title = await upsertTitle(parsed);
  const episode = await upsertEpisode(title.id, parsed);
  const [file] = await db
    .update(files)
    .set({ titleId: title.id, episodeId: episode?.id ?? null, hidden: false })
    .where(eq(files.id, fileId))
    .returning();
  await touch(title.id);
  await pruneOrphans();
  return { file, title, episode, duplicate: false };
}

export async function removeFile(fileId: number) {
  await ensureSchema();
  await db.delete(files).where(eq(files.id, fileId));
  await pruneOrphans();
}

export function describeMedia(result: Pick<IndexResult, "title" | "episode">): string {
  const { title, episode } = result;
  const year = title.year ? ` (${title.year})` : "";
  if (!episode) return `${title.name}${year}`;
  const se = `S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`;
  return `${title.name} ${se}${episode.name ? ` - ${episode.name}` : ""}`;
}

export async function catalogStats() {
  await ensureSchema();
  const rows = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM titles WHERE kind = 'movie') AS movies,
      (SELECT COUNT(*)::int FROM titles WHERE kind = 'show') AS shows,
      (SELECT COUNT(*)::int FROM files) AS files
  `);
  const row = ([...rows] as unknown as { movies: number; shows: number; files: number }[])[0];
  return { movies: Number(row.movies), shows: Number(row.shows), files: Number(row.files) };
}
