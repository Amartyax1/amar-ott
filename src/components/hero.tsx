import Link from "next/link";
import { Info, ListVideo, Star } from "lucide-react";
import { Artwork } from "@/components/artwork";
import { SendButton } from "@/components/send-button";
import { WatchButton } from "@/components/watch-button";
import { buttonVariants } from "@/components/ui/button";
import type { TitleDetail } from "@/lib/catalog";
import { streamingEnabled } from "@/lib/env";
import { formatDuration } from "@/lib/format";
import { isLikelyPlayable } from "@/lib/playable";
import { cn } from "@/lib/utils";

export function Hero({ title }: { title: TitleDetail }) {
  const movieFile = title.kind === "movie" ? title.files.at(-1) : undefined;
  const episodeCount = title.seasons.reduce((n, s) => n + s.episodes.length, 0);

  return (
    <section className="relative isolate flex min-h-[72svh] items-end overflow-hidden pt-24 pb-10 sm:min-h-[78vh] sm:pb-16">
      <Artwork
        name={title.name}
        kind={title.kind}
        src={title.backdropUrl ?? title.posterUrl}
        variant="backdrop"
        priority
        className="absolute inset-0 -z-20"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/60 to-background/10" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background/90 via-background/30 to-transparent" />

      <div className="max-w-2xl px-4 sm:px-8 lg:px-12">
        <p className="mb-3 text-xs font-semibold tracking-[0.25em] text-primary uppercase">
          Newly added {title.kind === "show" ? "series" : "film"}
        </p>
        <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl">{title.name}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground/75">
          {title.rating ? (
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <Star className="size-4 fill-amber-400 text-amber-400" />
              {title.rating.toFixed(1)}
            </span>
          ) : null}
          {title.year ? <span>{title.year}</span> : null}
          {title.kind === "show" ? (
            <span>
              {title.seasons.length} {title.seasons.length === 1 ? "season" : "seasons"} · {episodeCount} episodes
            </span>
          ) : movieFile?.duration ? (
            <span>{formatDuration(movieFile.duration)}</span>
          ) : null}
          {title.genres.slice(0, 3).map((g) => (
            <span key={g} className="rounded-full border border-white/15 px-2 py-0.5 text-xs">
              {g}
            </span>
          ))}
        </div>
        {title.overview ? (
          <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-relaxed text-foreground/80 sm:text-base">
            {title.overview}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {movieFile && streamingEnabled ? (
            <WatchButton
              fileId={movieFile.id}
              label={title.name}
              likelyPlayable={isLikelyPlayable(movieFile)}
              size="lg"
              className="h-11 px-5 text-base"
            />
          ) : null}
          {movieFile ? (
            <SendButton
              fileIds={[movieFile.id]}
              label={title.name}
              size="lg"
              variant={streamingEnabled ? "secondary" : "default"}
              className="h-11 px-5 text-base"
            />
          ) : (
            <Link href={`/title/${title.id}`} className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}>
              <ListVideo />
              Browse episodes
            </Link>
          )}
          <Link
            href={`/title/${title.id}`}
            className={cn(
              buttonVariants({ variant: "secondary", size: "lg" }),
              "h-11 bg-white/15 px-5 text-base backdrop-blur hover:bg-white/25",
            )}
          >
            <Info />
            More info
          </Link>
        </div>
      </div>
    </section>
  );
}
