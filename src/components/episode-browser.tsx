"use client";

import { useState } from "react";
import { SendButton } from "@/components/send-button";
import { WatchButton } from "@/components/watch-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EpisodeWithFiles } from "@/lib/catalog";
import { bestVersion, episodeCode, formatBytes, formatDuration, qualityLabel } from "@/lib/format";
import { isLikelyPlayable } from "@/lib/playable";

type Season = { season: number; episodes: EpisodeWithFiles[] };

export function EpisodeBrowser({
  showName,
  seasons,
  canStream = false,
}: {
  showName: string;
  seasons: Season[];
  canStream?: boolean;
}) {
  const [current, setCurrent] = useState(String(seasons[0]?.season ?? 1));
  const season = seasons.find((s) => String(s.season) === current) ?? seasons[0];
  if (!season) return null;

  const seasonFileIds = season.episodes.map((e) => bestVersion(e.files).id);
  const items = seasons.map((s) => ({ value: String(s.season), label: `Season ${s.season}` }));

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Episodes</h2>
          {seasons.length > 1 ? (
            <Select items={items} value={current} onValueChange={(v) => v && setCurrent(v)}>
              <SelectTrigger className="h-9 min-w-32 border-white/10 bg-white/5" aria-label="Choose season">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-muted-foreground">Season {season.season}</span>
          )}
        </div>
        <SendButton
          fileIds={seasonFileIds}
          label={`${showName} season ${season.season}`}
          variant="outline"
          className="border-white/15"
        >
          Send whole season ({seasonFileIds.length})
        </SendButton>
      </div>

      <ol className="mt-5 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-card/40">
        {season.episodes.map((ep) => {
          const best = bestVersion(ep.files);
          const others = ep.files.filter((f) => f.id !== best.id);
          const code = episodeCode(ep.season, ep.episode);
          const meta = [formatDuration(best.duration), formatBytes(best.size), qualityLabel(best.height, best.fileName)]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={ep.id} className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-white/[0.03] sm:px-5">
              <span className="w-8 shrink-0 text-center text-2xl font-bold text-muted-foreground/60 tabular-nums">
                {ep.episode}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{ep.name ?? `Episode ${ep.episode}`}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {code}
                  {meta ? ` · ${meta}` : ""}
                </p>
                {others.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {others.map((f) => (
                      <SendButton
                        key={f.id}
                        fileIds={[f.id]}
                        label={`${showName} ${code}`}
                        size="xs"
                        variant="ghost"
                        className="border border-white/10"
                      >
                        {qualityLabel(f.height, f.fileName) ?? formatBytes(f.size) ?? "Alt version"}
                      </SendButton>
                    ))}
                  </div>
                ) : null}
              </div>
              {canStream ? (
                <WatchButton
                  fileId={best.id}
                  label={`${showName} ${code}`}
                  likelyPlayable={isLikelyPlayable(best)}
                  size="sm"
                  aria-label={`Watch ${code}`}
                >
                  <span className="hidden sm:inline">Watch</span>
                </WatchButton>
              ) : null}
              <SendButton
                fileIds={[best.id]}
                label={`${showName} ${code}`}
                size="sm"
                variant="secondary"
                aria-label={`Send ${code} to Telegram`}
              >
                <span className="hidden sm:inline">Send</span>
              </SendButton>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
