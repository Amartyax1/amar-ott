"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Film, Home, Search, Tv } from "lucide-react";
import { isActive } from "@/components/site-header";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/movies", label: "Movies", icon: Film },
  { href: "/shows", label: "Shows", icon: Tv },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <ul className="grid grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] transition",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-5", active && "text-primary")} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
