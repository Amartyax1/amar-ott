import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Artwork } from "@/components/artwork";
import { Logo } from "@/components/site-header";
import { listTitles } from "@/lib/catalog";
import { env, isMock } from "@/lib/env";
import { getSessionUser } from "@/lib/session";
import { LoginPanel } from "./login-panel";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  await connection();
  if (await getSessionUser()) redirect("/");
  const wall = await listTitles({ limit: 24 });

  return (
    <div className="relative isolate flex min-h-svh flex-col overflow-hidden">
      {wall.length ? (
        <div
          aria-hidden
          className="absolute inset-0 -z-20 grid rotate-[-8deg] scale-125 grid-cols-4 gap-3 opacity-40 sm:grid-cols-6 lg:grid-cols-8"
        >
          {[...wall, ...wall].slice(0, 32).map((t, i) => (
            <Artwork
              key={`${t.id}-${i}`}
              name={t.name}
              kind={t.kind}
              year={t.year}
              src={t.posterUrl}
              variant="poster"
              className="aspect-[2/3] rounded-lg"
            />
          ))}
        </div>
      ) : null}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/70 via-background/90 to-background" />

      <header className="px-6 py-5 sm:px-10">
        <Logo />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <LoginPanel mock={isMock} botUsername={env.botUsername} />
      </main>
    </div>
  );
}
