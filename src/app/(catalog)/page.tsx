import { connection } from "next/server";
import { Clapperboard } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Hero } from "@/components/hero";
import { TitleRow } from "@/components/title-row";
import { getTitle, listTitles, topGenres } from "@/lib/catalog";

export default async function HomePage() {
  await connection();
  const recent = await listTitles({ limit: 20 });

  if (!recent.length) {
    return (
      <div className="pt-24">
        <EmptyState icon={Clapperboard} title="No movies yet">
          Upload a video to your vault group and the bot will add it here within seconds. Captions like{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground">Inception (2010)</code> or{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground">Dark S01E02</code> work best.
        </EmptyState>
      </div>
    );
  }

  const featured = await getTitle((recent.find((t) => t.backdropUrl) ?? recent[0]).id);
  const movies = await listTitles({ kind: "movie", limit: 20 });
  const shows = await listTitles({ kind: "show", limit: 20 });
  const genreNames = await topGenres();
  const genres = await Promise.all(genreNames.map(async (genre) => ({ genre, titles: await listTitles({ genre, limit: 20 }) })));
  const topRated = [...recent, ...movies, ...shows]
    .filter((t, i, all) => t.rating && all.findIndex((x) => x.id === t.id) === i)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 12);

  return (
    <>
      {featured ? <Hero title={featured} /> : <div className="h-20" />}
      <div className="relative z-10 -mt-4 space-y-10 sm:-mt-8">
        <TitleRow title="Recently added" titles={recent} />
        <TitleRow title="Movies" titles={movies} href="/movies" />
        <TitleRow title="TV Shows" titles={shows} href="/shows" />
        {topRated.length >= 4 ? <TitleRow title="Top rated" titles={topRated} /> : null}
        {genres.map(({ genre, titles }) => (
          <TitleRow key={genre} title={genre} titles={titles} href={`/search?genre=${encodeURIComponent(genre)}`} />
        ))}
      </div>
    </>
  );
}
