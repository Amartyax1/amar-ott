"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Clapperboard, LogOut, Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/movies", label: "Movies" },
  { href: "/shows", label: "TV Shows" },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-extrabold tracking-tight", className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/30">
        <Clapperboard className="size-4.5" />
      </span>
      <span className="text-lg">
        Reel<span className="text-primary">Vault</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ user }: { user: { firstName: string; username: string | null } }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState(pathname === "/search" ? (params.get("q") ?? "") : "");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search");
  }

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-colors duration-300",
        scrolled
          ? "border-b border-white/5 bg-background/85 backdrop-blur-xl"
          : "bg-gradient-to-b from-black/80 via-black/40 to-transparent",
      )}
    >
      <div className="flex h-16 items-center gap-6 px-4 sm:px-8 lg:px-12">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition",
                isActive(pathname, item.href)
                  ? "font-semibold text-foreground"
                  : "text-foreground/65 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <form onSubmit={submit} className="relative hidden sm:block" role="search">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Titles, genres..."
              aria-label="Search the library"
              className="h-9 w-44 border-white/10 bg-black/40 pl-8 backdrop-blur transition-[width] focus-visible:w-64 lg:w-56"
            />
          </form>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Account menu"
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar className="size-8 ring-1 ring-white/15">
                <AvatarFallback className="bg-primary/20 text-sm font-semibold text-primary">
                  {user.firstName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <p className="font-medium text-foreground">{user.firstName}</p>
                  {user.username ? <p className="text-xs text-muted-foreground">@{user.username}</p> : null}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
