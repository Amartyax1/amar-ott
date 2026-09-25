import type { Metadata } from "next";
import { connection } from "next/server";
import { BrowsePage } from "@/components/browse-page";

export const metadata: Metadata = { title: "Movies" };

export default async function MoviesPage({ searchParams }: PageProps<"/movies">) {
  await connection();
  const { genre } = await searchParams;
  return <BrowsePage kind="movie" genre={typeof genre === "string" ? genre : undefined} />;
}
