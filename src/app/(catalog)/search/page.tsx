import type { Metadata } from "next";
import { connection } from "next/server";
import { SearchX, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { SearchBox } from "@/components/search-box";
import { TitleGrid } from "@/components/title-grid";
import { listTitles, searchTitles } from "@/lib/catalog";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await connection();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const genre = typeof params.genre === "string" ? params.genre : "";

  const results = genre && !q ? await listTitles({ genre }) : await searchTitles(q);
  const suggestions = !q && !genre ? await listTitles({ limit: 12 }) : [];

  return (
    <div className="px-4 pt-24 sm:px-8 lg:px-12">
      <div className="max-w-2xl">
        <SearchBox key={genre} initial={q} />
      </div>

      <div className="mt-8">
        {genre && !q ? (
          <>
            <h1 className="mb-6 text-2xl font-bold tracking-tight">{genre}</h1>
            <TitleGrid titles={results} />
          </>
        ) : q ? (
          results.length ? (
            <>
              <p className="mb-6 text-sm text-muted-foreground">
                {results.length} {results.length === 1 ? "result" : "results"} for{" "}
                <span className="text-foreground">&ldquo;{q}&rdquo;</span>
              </p>
              <TitleGrid titles={results} />
            </>
          ) : (
            <EmptyState icon={SearchX} title={`Nothing matches "${q}"`}>
              Try a shorter title, a different spelling, or a genre like &ldquo;Comedy&rdquo;.
            </EmptyState>
          )
        ) : suggestions.length ? (
          <>
            <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="size-4 text-primary" />
              Fresh in the vault
            </h2>
            <TitleGrid titles={suggestions} />
          </>
        ) : (
          <EmptyState icon={SearchX} title="The library is empty">
            Once movies are uploaded to the vault group, you can search them here.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
