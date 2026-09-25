export type ParsedMedia =
  | { kind: "movie"; title: string; year: number | null }
  | {
      kind: "episode";
      show: string;
      year: number | null;
      season: number;
      episode: number;
      episodeTitle: string | null;
    };

const VIDEO_EXT = /\.(mkv|mp4|m4v|avi|mov|wmv|webm|flv|ts|m2ts|mpg|mpeg)$/i;

/** Release-name junk that ends the useful part of a title. */
const JUNK =
  /\b(2160p|1080p|720p|576p|480p|360p|4k|uhd|hdr10?\+?|dv|dolby ?vision|web-?dl|web-?rip|webrip|web|blu-?ray|brrip|bdrip|dvdrip|dvdscr|hdrip|hdtv|hdcam|camrip|remux|x26[45]|h\.?26[45]|hevc|avc|xvid|divx|aac(2\.0|5\.1)?|ac3|eac3|ddp?5\.1|dts(-hd)?|atmos|truehd|10bit|8bit|proper|repack|extended|unrated|remastered|imax|internal|limited|multi|dual[- ]audio|hindi|english|esub|esubs|subs?|nf|amzn|dsnp|hmax|atvp|yts|yify|rarbg|psa|galaxyrg|tgx)\b/i;

const EPISODE_PATTERNS: RegExp[] = [
  /\bS(\d{1,2})\s*[.\-_ ]?\s*E(\d{1,3})\b/i,
  /\b(\d{1,2})x(\d{1,3})\b/i,
  /\bSeason\s*(\d{1,2})\s*[,.\-_ ]*\s*(?:Episode|Ep\.?|E)\s*(\d{1,3})\b/i,
];

function clean(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[._]+/g, " ")
    .replace(/\s+-\s*$/, "")
    .replace(/[\s\-–—:|]+$/g, "")
    .replace(/^[\s\-–—:|]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cutAtJunk(text: string): string {
  const m = JUNK.exec(text);
  return m ? text.slice(0, m.index) : text;
}

function smartCase(text: string): string {
  if (text !== text.toLowerCase() && text !== text.toUpperCase()) return text;
  const small = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "vs"]);
  return text
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function extractYear(text: string): { before: string; year: number | null } {
  const paren = /[([](19\d{2}|20\d{2})[)\]]/.exec(text);
  if (paren) return { before: text.slice(0, paren.index), year: Number(paren[1]) };
  // A bare year only counts if something precedes it ("2012" alone is a title).
  const matches = [...text.matchAll(/(?<=\S\s)(19\d{2}|20\d{2})\b/g)];
  const last = matches.at(-1);
  if (last?.index !== undefined) return { before: text.slice(0, last.index), year: Number(last[1]) };
  return { before: text, year: null };
}

/**
 * Parse a Telegram caption (preferred) or file name into movie / episode info.
 * Captions like "Inception (2010)" or "Dark S01E02 - Secrets" and release names like
 * "The.Office.US.S02E05.720p.WEB.mkv" are all understood.
 */
export function parseMedia(caption: string | null | undefined, fileName?: string | null): ParsedMedia | null {
  const candidates = [caption?.split("\n").find((l) => l.trim())?.trim(), fileName?.trim()].filter(
    (s): s is string => Boolean(s),
  );

  for (const source of candidates) {
    const text = source.replace(VIDEO_EXT, "").replace(/[._]+/g, " ").replace(/\s{2,}/g, " ").trim();
    if (!text) continue;

    for (const pattern of EPISODE_PATTERNS) {
      const m = pattern.exec(text);
      if (!m || m.index === undefined) continue;
      const { before, year } = extractYear(text.slice(0, m.index));
      const show = smartCase(clean(cutAtJunk(before)));
      if (!show) continue;
      const after = clean(cutAtJunk(text.slice(m.index + m[0].length).replace(/^[\s\-–—:|]*E\d{1,3}\b/i, "")));
      return {
        kind: "episode",
        show,
        year,
        season: Number(m[1]),
        episode: Number(m[2]),
        episodeTitle: after ? smartCase(after) : null,
      };
    }

    const { before, year } = extractYear(cutAtJunk(text));
    const title = smartCase(clean(before));
    if (title) return { kind: "movie", title, year };
  }
  return null;
}

/** Stable grouping key so "The Office", "the.office" and "The Office!" collapse together. */
export function titleKey(name: string, year?: number | null): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return year ? `${base} ${year}` : base;
}

export function isVideoFile(fileName?: string | null, mimeType?: string | null): boolean {
  return Boolean(mimeType?.startsWith("video/") || (fileName && VIDEO_EXT.test(fileName)));
}
