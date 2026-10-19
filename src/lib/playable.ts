const PLAYABLE_EXT = /\.(mp4|m4v|webm|mov)$/i;
const HEVC = /\b(hevc|x265|h\.?265)\b/i;

/** Browsers reliably play MP4/WebM with H.264 or VP9. HEVC and MKV usually fail. */
export function isLikelyPlayable(file: { fileName?: string | null; mimeType?: string | null }): boolean {
  const name = file.fileName ?? "";
  const mime = (file.mimeType ?? "").toLowerCase();
  if (HEVC.test(name)) return false;
  if (mime === "video/mp4" || mime === "video/webm" || mime === "video/quicktime") return true;
  return PLAYABLE_EXT.test(name);
}

export function guessMime(file: { fileName?: string | null; mimeType?: string | null }): string {
  if (file.mimeType && file.mimeType !== "application/octet-stream") return file.mimeType;
  const name = file.fileName ?? "";
  if (/\.webm$/i.test(name)) return "video/webm";
  if (/\.(mov|qt)$/i.test(name)) return "video/quicktime";
  if (/\.mkv$/i.test(name)) return "video/x-matroska";
  return "video/mp4";
}

export function parseByteRange(header: string | null, size: number): { start: number; end: number; partial: boolean } {
  if (!header || !header.startsWith("bytes=") || size <= 0) {
    return { start: 0, end: Math.max(size - 1, 0), partial: false };
  }
  const spec = header.slice("bytes=".length).split(",")[0]?.trim() ?? "";
  const [rawStart, rawEnd] = spec.split("-");
  if (rawStart === "" && rawEnd) {
    const suffix = Math.min(Number(rawEnd), size);
    return { start: Math.max(size - suffix, 0), end: size - 1, partial: true };
  }
  const start = Math.min(Math.max(Number(rawStart) || 0, 0), Math.max(size - 1, 0));
  const end = rawEnd === "" || rawEnd === undefined ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { start: 0, end: Math.max(size - 1, 0), partial: false };
  }
  return { start, end, partial: true };
}
