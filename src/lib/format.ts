export function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function qualityLabel(height: number | null | undefined, fileName?: string | null): string | null {
  const fromName = fileName?.match(/\b(2160p|1080p|720p|480p|4k)\b/i)?.[1];
  if (fromName) return fromName.toLowerCase() === "4k" ? "4K" : fromName.toLowerCase();
  if (!height) return null;
  if (height >= 2000) return "4K";
  if (height >= 1000) return "1080p";
  if (height >= 700) return "720p";
  return `${height}p`;
}

export function episodeCode(season: number, episode: number): string {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const day = 86_400_000;
  if (diff < 3_600_000) return "just now";
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Deterministic hue from a string, for generated artwork when there's no poster. */
export function hueFor(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** The largest upload is assumed to be the best quality. */
export function bestVersion<T extends { size: number | null }>(files: T[]): T {
  return files.reduce((a, b) => ((b.size ?? 0) > (a.size ?? 0) ? b : a));
}
