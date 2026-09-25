import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Clock, HardDrive, Star } from "lucide-react";
import { Artwork } from "@/components/artwork";
import { EpisodeBrowser } from "@/components/episode-browser";
import { SendButton } from "@/components/send-button";
import { Badge } from "@/components/ui/badge";
import { getTitle } from "@/lib/catalog";
import { bestVersion, formatBytes, formatDuration, qualityLabel, timeAgo } from "@/lib/format";

async function load(params: PageProps<"/title/[id]">["params"]) {
  await connection();
  const id = Number((await params).id);
  return Number.isInteger(id) ? getTitle(id) : null;
}

export async function generateMetadata({ params }: PageProps<"/title/[id]">): Promise<Metadata> {
  const title = await load(params);
  return { title: title?.name ?? "Not found" };
}

export default async function TitlePage({ params }: PageProps<"/title/[id]">) {
  const title = await load(params);
  if (!title) notFound();

  const movieBest = title.kind === "movie" && title.files.length ? bestVersion(title.files) : null;
  const episodeCount = title.seasons.reduce((n, s) => n + s.episodes.length, 0);

  return (
    <article>
      <div className="relative isolate h-[42vh] min-h-72 overflow-hidden sm:h-[55vh]">
        <Artwork
          name={title.name}
          kind={title.kind}
          src={title.backdropUrl ?? title.posterUrl}
          variant="backdrop"
          priority
          className="absolute inset-0 -z-10"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/20" />
        <Link
          href={title.kind === "show" ? "/shows" : "/movies"}
          className="absolute top-20 left-4 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-sm text-white/90 backdrop-blur transition hover:bg-black/60 sm:left-8 lg:left-12"
        >
          <ArrowLeft className="size-4" />
          {title.kind === "show" ? "TV Shows" : "Movies"}
        </Link>
      </div>

      <div className="relative -mt-40 px-4 sm:-mt-52 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-6 md:flex-row md:gap-10">
          <Artwork
            name={title.name}
            kind={title.kind}
            year={title.year}
            src={title.posterUrl}
            variant="poster"
            sizes="(max-width: 768px) 45vw, 260px"
            className="aspect-[2/3] w-36 shrink-0 rounded-xl shadow-2xl ring-1 shadow-black/60 ring-white/15 sm:w-48 md:w-64"
          />

          <div className="min-w-0 flex-1 md:pt-28">
            <h1 className="text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-5xl">
              {title.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-foreground/75">
              {title.rating ? (
                <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                  <Star className="size-4 fill-amber-400 text-amber-400" />
                  {title.rating.toFixed(1)}
                </span>
              ) : null}
              {title.year ? <span>{title.year}</span> : null}
              <Badge variant="outline" className="border-white/15">
                {title.kind === "show" ? "Series" : "Movie"}
              </Badge>
              {title.kind === "show" ? (
                <span>
                  {title.seasons.length} {title.seasons.length === 1 ? "season" : "seasons"} · {episodeCount}{" "}
                  {episodeCount === 1 ? "episode" : "episodes"}
                </span>
              ) : null}
              {movieBest?.duration ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {formatDuration(movieBest.duration)}
                </span>
              ) : null}
            </div>

            {title.genres.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {title.genres.map((g) => (
                  <Link
                    key={g}
                    href={`/search?genre=${encodeURIComponent(g)}`}
                    className="rounded-full bg-white/5 px-3 py-1 text-xs text-foreground/80 ring-1 ring-white/10 transition hover:bg-white/10"
                  >
                    {g}
                  </Link>
                ))}
              </div>
            ) : null}

            <p className="mt-5 max-w-3xl leading-relaxed text-foreground/80">
              {title.overview ?? "No synopsis yet. Add a TMDB API key to pull in posters and descriptions automatically."}
            </p>

            {movieBest ? (
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <SendButton fileIds={[movieBest.id]} label={title.name} size="lg" className="h-11 px-5 text-base" />
                <p className="text-xs text-muted-foreground">Delivered to your Telegram chat with the bot.</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-12 max-w-5xl">
          {title.kind === "show" ? (
            <EpisodeBrowser showName={title.name} seasons={title.seasons} />
          ) : title.files.length > 1 ? (
            <section>
              <h2 className="text-xl font-semibold tracking-tight">Available versions</h2>
              <ul className="mt-4 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-card/40">
                {[...title.files].reverse().map((f) => (
                  <li key={f.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                    <HardDrive className="size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.fileName ?? "Video file"}</p>
                      <p className="text-xs text-muted-foreground">
                        {[qualityLabel(f.height, f.fileName), formatBytes(f.size), `added ${timeAgo(f.createdAt)}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <SendButton fileIds={[f.id]} label={title.name} size="sm" variant="secondary">
                      <span className="hidden sm:inline">Send</span>
                    </SendButton>
                  </li>
                ))}
              </ul>
            </section>
          ) : movieBest ? (
            <dl className="grid max-w-xl grid-cols-2 gap-4 rounded-xl border border-white/10 bg-card/40 p-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Quality</dt>
                <dd className="mt-1 font-medium">{qualityLabel(movieBest.height, movieBest.fileName) ?? "Original"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Size</dt>
                <dd className="mt-1 font-medium">{formatBytes(movieBest.size) ?? "Unknown"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Added</dt>
                <dd className="mt-1 font-medium">{timeAgo(movieBest.createdAt)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      </div>
    </article>
  );
}
