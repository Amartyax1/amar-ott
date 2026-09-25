"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initial);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const q = value.trim();
      router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [value, pathname, router]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search movies, shows, genres..."
        aria-label="Search the library"
        className="h-12 rounded-xl border-white/10 bg-white/5 pr-10 pl-11 text-base md:text-base"
      />
      {value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
