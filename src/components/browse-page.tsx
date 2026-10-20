import Link from "next/link";
import { Film, Tv } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { TitleGrid } from "@/components/title-grid";
import { listTitles } from "@/lib/catalog";
import { cn } from "@/lib/utils";

const COPY = {
  movie: { heading: "Movies", noun: "movies", icon: Film, path: "/movies" },
  show: { heading: "TV Shows", noun: "shows", icon: Tv, path: "/shows" },
} as const;

export async function BrowsePage({ kind, genre }: { kind: "movie" | "show"; genre?: string }) {
  const copy = COPY[kind];
  const all = await listTitles({ kind });
  const genres = [...new Set(all.flatMap((t) => t.genres))].sort();
  const titles = genre ? all.filter((t) => t.genres.includes(genre)) : all;

  const chip = (label: string, href: string, active: boolean) => (
    <Link
      key={label}
      href={href}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-white/10 bg-white/5 text-foreground/80 hover:border-white/25 hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="px-4 pt-24 sm:px-8 lg:px-12">
      <div className="flex items-baseline gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{copy.heading}</h1>
        <span className="text-sm text-muted-foreground">{titles.length} titles</span>
      </div>

      {genres.length ? (
        <div className="scrollbar-none -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {chip("All", copy.path, !genre)}
          {genres.map((g) => chip(g, `${copy.path}?genre=${encodeURIComponent(g)}`, g === genre))}
        </div>
      ) : null}

      <div className="mt-8">
        {titles.length ? (
          <TitleGrid titles={titles} />
        ) : (
          <EmptyState icon={copy.icon} title={genre ? `No ${genre} ${copy.noun} yet` : `No ${copy.noun} yet`}>
            {kind === "show"
              ? "Upload episodes with names like \"Show Name S01E01\" to your vault group and they'll be grouped into seasons here."
              : "Upload a movie to your vault group with a caption like \"Movie Name (2020)\" and it will appear here."}
          </EmptyState>
        )}
      </div>
    </div>
  );
}
