import { env } from "@/lib/env";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

export type TmdbMeta = {
  tmdbId: number;
  name: string;
  year: number | null;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: string[];
  rating: number | null;
};

type SearchHit = {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
};

type Details = SearchHit & {
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: { name: string }[];
  vote_average?: number;
};

async function get<T>(path: string, params: Record<string, string>): Promise<T | null> {
  if (!env.tmdbKey) return null;
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { accept: "application/json" };
  // v4 "read access tokens" are long JWTs; v3 keys are 32-char hex.
  if (env.tmdbKey.length > 40) headers.authorization = `Bearer ${env.tmdbKey}`;
  else url.searchParams.set("api_key", env.tmdbKey);

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`[tmdb] ${res.status} for ${path}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn("[tmdb] request failed:", (err as Error).message);
    return null;
  }
}

/** Look up poster, backdrop, overview and genres. Returns null when TMDB is not configured or nothing matches. */
export async function lookupTmdb(kind: "movie" | "show", name: string, year: number | null): Promise<TmdbMeta | null> {
  const type = kind === "movie" ? "movie" : "tv";
  const params: Record<string, string> = { query: name, include_adult: "false" };
  if (year) params[kind === "movie" ? "year" : "first_air_date_year"] = String(year);

  let search = await get<{ results: SearchHit[] }>(`/search/${type}`, params);
  if (year && !search?.results.length) {
    delete params.year;
    delete params.first_air_date_year;
    search = await get<{ results: SearchHit[] }>(`/search/${type}`, params);
  }
  const hit = search?.results[0];
  if (!hit) return null;

  const d = await get<Details>(`/${type}/${hit.id}`, {});
  if (!d) return null;
  const date = d.release_date || d.first_air_date;
  return {
    tmdbId: d.id,
    name: d.title || d.name || name,
    year: date ? Number(date.slice(0, 4)) : year,
    overview: d.overview || null,
    posterUrl: d.poster_path ? `${IMG}/w500${d.poster_path}` : null,
    backdropUrl: d.backdrop_path ? `${IMG}/w1280${d.backdrop_path}` : null,
    genres: d.genres?.map((g) => g.name) ?? [],
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
  };
}
