"use client";

import Link from "next/link";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TitleCard } from "@/components/title-card";
import type { TitleCard as TitleCardData } from "@/lib/catalog";

export function TitleRow({ title, titles, href }: { title: string; titles: TitleCardData[]; href?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  if (!titles.length) return null;

  const scroll = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className="group/row relative">
      <div className="mb-3 flex items-end justify-between px-4 sm:px-8 lg:px-12">
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
        {href ? (
          <Link href={href} className="text-sm text-muted-foreground transition hover:text-foreground">
            See all
          </Link>
        ) : null}
      </div>
      <div className="relative">
        <div
          ref={scroller}
          className="scrollbar-none flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pt-1 pb-2 sm:scroll-px-8 sm:gap-4 sm:px-8 lg:scroll-px-12 lg:px-12"
        >
          {titles.map((t) => (
            <TitleCard key={t.id} title={t} className="w-[38vw] max-w-44 shrink-0 snap-start sm:w-40 lg:w-44" />
          ))}
        </div>
        <button
          type="button"
          aria-label={`Scroll ${title} left`}
          onClick={() => scroll(-1)}
          className="absolute inset-y-0 left-0 z-10 hidden w-12 items-center justify-center bg-gradient-to-r from-background to-transparent opacity-0 transition group-hover/row:opacity-100 md:flex"
        >
          <ChevronLeft className="size-7" />
        </button>
        <button
          type="button"
          aria-label={`Scroll ${title} right`}
          onClick={() => scroll(1)}
          className="absolute inset-y-0 right-0 z-10 hidden w-12 items-center justify-center bg-gradient-to-l from-background to-transparent opacity-0 transition group-hover/row:opacity-100 md:flex"
        >
          <ChevronRight className="size-7" />
        </button>
      </div>
    </section>
  );
}
