import type { Metadata } from "next";
import { connection } from "next/server";
import { BrowsePage } from "@/components/browse-page";

export const metadata: Metadata = { title: "TV Shows" };

export default async function ShowsPage({ searchParams }: PageProps<"/shows">) {
  await connection();
  const { genre } = await searchParams;
  return <BrowsePage kind="show" genre={typeof genre === "string" ? genre : undefined} />;
}
