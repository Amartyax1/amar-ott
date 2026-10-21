"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ExternalLink, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Pending = { token: string; deepLink: string; appLink: string; expiresAt: number };
type Phase = { name: "starting" } | { name: "waiting"; login: Pending } | { name: "error"; message: string };

const STORAGE_KEY = "rv_pending_login";

function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pending;
    if (!parsed?.token || !parsed.deepLink || parsed.expiresAt < Date.now() + 5_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function LoginPanel({ mock, botUsername }: { mock: boolean; botUsername: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "starting" });
  const [devBusy, setDevBusy] = useState(false);
  const generation = useRef(0);
  const refreshed = useRef(false);
  const booted = useRef(false);

  const begin = useCallback(async (forceNew = false) => {
    const id = ++generation.current;
    if (!forceNew) {
      const saved = readPending();
      if (saved) {
        setPhase({ name: "waiting", login: saved });
        return;
      }
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }

    setPhase({ name: "starting" });
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (id !== generation.current) return;
      if (!res.ok) throw new Error(data.error ?? "Couldn't start login.");
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setPhase({ name: "waiting", login: data as Pending });
    } catch (err) {
      if (id !== generation.current) return;
      setPhase({ name: "error", message: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    if (mock || booted.current) return;
    booted.current = true;
    void begin();
  }, [mock, begin]);

  const waitingToken = phase.name === "waiting" ? phase.login.token : null;

  useEffect(() => {
    if (!waitingToken) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (!active) return;
      try {
        const res = await fetch(`/api/auth/login?token=${encodeURIComponent(waitingToken)}`, { cache: "no-store" });
        const data = (await res.json()) as { status: string; reason?: string; name?: string };
        if (!active) return;
        if (data.status === "ok") {
          active = false;
          sessionStorage.removeItem(STORAGE_KEY);
          toast.success(`Welcome, ${data.name ?? "friend"}!`);
          router.replace("/");
          router.refresh();
          return;
        }
        if (data.status === "denied") {
          active = false;
          sessionStorage.removeItem(STORAGE_KEY);
          setPhase({ name: "error", message: data.reason ?? "Access denied." });
          return;
        }
        if (data.status === "expired" || data.status === "invalid") {
          active = false;
          sessionStorage.removeItem(STORAGE_KEY);
          if (!refreshed.current) {
            refreshed.current = true;
            void begin(true);
            return;
          }
          setPhase({ name: "error", message: "That login code expired. Start again to get a fresh one." });
          return;
        }
      } catch {
        // Transient network error: keep polling.
      }
      if (active) timer = setTimeout(() => void poll(), 400);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [waitingToken, router, begin]);

  async function devLogin() {
    setDevBusy(true);
    const res = await fetch("/api/auth/dev-login", { method: "POST" });
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      setDevBusy(false);
      toast.error("Demo login failed.");
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card/80 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-8">
      {mock ? (
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-400/20">
            <Sparkles className="size-3.5" />
            Demo mode
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Take a look around</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            No Telegram bot is connected yet, so you&apos;re browsing a demo library. Sends are logged by the bot
            process instead of delivered. Add <code className="text-foreground">BOT_TOKEN</code> and{" "}
            <code className="text-foreground">BOT_USERNAME</code> to <code className="text-foreground">.env</code> to
            switch to real Telegram login.
          </p>
          <Button onClick={devLogin} disabled={devBusy} size="lg" className="mt-6 h-11 w-full text-base">
            {devBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Enter the demo library
          </Button>
        </>
      ) : phase.name === "waiting" ? (
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Scan to enter</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Scan this code, then tap <span className="font-semibold text-foreground">Start</span> in @{botUsername}.
            That signs you in. This page opens the library on its own.
          </p>
          <div className="mx-auto mt-6 w-fit rounded-xl bg-white p-3">
            <QRCodeSVG value={phase.login.deepLink} size={196} level="M" />
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <a
              href={phase.login.deepLink}
              target="_blank"
              rel="noopener"
              className={cn(buttonVariants({ size: "lg" }), "h-11 bg-[#2AABEE] text-base text-white hover:bg-[#229ED9]")}
            >
              <ExternalLink />
              Open in Telegram
            </a>
            <Button variant="ghost" onClick={() => void begin(true)}>
              Get a new code
            </Button>
          </div>
          <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Waiting for you to tap Start...
          </p>
        </div>
      ) : phase.name === "error" ? (
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Login didn&apos;t start</h1>
          <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive ring-1 ring-destructive/20">
            {phase.message}
          </p>
          <Button onClick={() => void begin(true)} size="lg" className="mt-6 h-11 w-full text-base">
            Try again
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 text-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Preparing your login code...</p>
        </div>
      )}
      {mock ? null : (
        <p className="mt-6 flex items-start gap-2 border-t border-white/5 pt-5 text-xs leading-relaxed text-muted-foreground">
          <Send className="mt-0.5 size-3.5 shrink-0" />
          Telegram only shares your name and username. Anyone who taps Start is let in.
        </p>
      )}
    </div>
  );
}
