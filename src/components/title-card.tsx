import Link from "next/link";
import { Star } from "lucide-react";
import { Artwork } from "@/components/artwork";
import type { TitleCard as TitleCardData } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export function TitleCard({ title, className }: { title: TitleCardData; className?: string }) {
  const meta =
    title.kind === "show"
      ? `${title.seasonCount} ${title.seasonCount === 1 ? "season" : "seasons"} · ${title.fileCount} ep`
      : title.year;

  return (
    <Link
      href={`/title/${title.id}`}
      className={cn(
        "group/card block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg ring-1 ring-white/10 transition duration-300 ease-out group-hover/card:-translate-y-1 group-hover/card:shadow-2xl group-hover/card:shadow-black/60 group-hover/card:ring-white/25">
        <Artwork
          name={title.name}
          kind={title.kind}
          year={title.year}
          src={title.posterUrl}
          variant="poster"
          className="size-full transition duration-500 group-hover/card:scale-105"
        />
        {title.rating ? (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
            <Star className="size-3 fill-amber-400 text-amber-400" />
            {title.rating.toFixed(1)}
          </span>
        ) : null}
      </div>
      <div className="mt-2 px-0.5">
        <p className="truncate text-sm font-medium text-foreground/90 group-hover/card:text-foreground">{title.name}</p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
    </Link>
  );
}
