"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ExternalLink, Loader2, Send, Sparkles, TicketCheck } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Pending = { token: string; deepLink: string; appLink: string; expiresAt: number };
type Phase =
  | { name: "idle" }
  | { name: "starting" }
  | { name: "waiting"; login: Pending }
  | { name: "error"; message: string };

function TelegramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M21.94 4.3a1.5 1.5 0 0 0-1.63-.23L2.9 11.2a1.2 1.2 0 0 0 .09 2.24l4.3 1.43 1.66 5.2a1 1 0 0 0 1.67.4l2.44-2.39 4.3 3.17a1.5 1.5 0 0 0 2.35-.88l2.8-14.5a1.5 1.5 0 0 0-.57-1.57ZM9.9 14.46l-.45 3.53-1.2-3.8 9.54-6.3-7.9 6.57Z" />
    </svg>
  );
}

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

export function LoginPanel({ mock, botUsername }: { mock: boolean; botUsername: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [invite, setInvite] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const polling = useRef(false);
  const widget = useRef<HTMLDivElement>(null);
  const inviteRef = useRef(invite);
  inviteRef.current = invite;

  useEffect(() => {
    if (mock || !botUsername || !widget.current) return;
    widget.current.innerHTML = "";
    window.onTelegramAuth = async (user) => {
      const res = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...user, inviteCode: inviteRef.current.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; name?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Telegram login failed.");
        return;
      }
      toast.success(`Welcome, ${data.name ?? "friend"}!`);
      router.replace("/");
      router.refresh();
    };
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    widget.current.append(script);
    return () => {
      delete window.onTelegramAuth;
    };
  }, [mock, botUsername, router]);

  const waitingToken = phase.name === "waiting" ? phase.login.token : null;

  useEffect(() => {
    if (!waitingToken) return;
    polling.current = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (!polling.current) return;
      try {
        const res = await fetch(`/api/auth/login?token=${encodeURIComponent(waitingToken)}`, { cache: "no-store" });
        const data = (await res.json()) as { status: string; reason?: string; name?: string };
        if (data.status === "ok") {
          polling.current = false;
          toast.success(`Welcome, ${data.name ?? "friend"}!`);
          router.replace("/");
          router.refresh();
          return;
        }
        if (data.status === "denied") {
          setPhase({ name: "error", message: data.reason ?? "Access denied." });
          return;
        }
        if (data.status === "expired" || data.status === "invalid") {
          setPhase({ name: "error", message: "That login link expired. Start again to get a fresh one." });
          return;
        }
      } catch {
        // Transient network error: keep polling.
      }
      timer = setTimeout(poll, 1500);
    };
    timer = setTimeout(poll, 1500);
    return () => {
      polling.current = false;
      clearTimeout(timer);
    };
  }, [waitingToken, router]);

  async function start() {
    setPhase({ name: "starting" });
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteCode: invite.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start login.");
      setPhase({ name: "waiting", login: data as Pending });
      if (window.matchMedia("(pointer: coarse)").matches) window.location.href = data.deepLink;
      else window.open(data.deepLink, "_blank", "noopener");
    } catch (err) {
      setPhase({ name: "error", message: (err as Error).message });
    }
  }

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
          <h1 className="text-2xl font-bold tracking-tight">Confirm in Telegram</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tap <span className="font-semibold text-foreground">Start</span> in your chat with @{botUsername}. This page
            continues automatically.
          </p>
          <div className="mx-auto mt-6 hidden w-fit rounded-xl bg-white p-3 sm:block">
            <QRCodeSVG value={phase.login.deepLink} size={168} level="M" />
          </div>
          <p className="mt-3 hidden text-xs text-muted-foreground sm:block">Or scan with your phone camera</p>
          <div className="mt-6 flex flex-col gap-2">
            <a
              href={phase.login.deepLink}
              target="_blank"
              rel="noopener"
              className={cn(buttonVariants({ size: "lg" }), "h-11 bg-[#2AABEE] text-base text-white hover:bg-[#229ED9]")}
            >
              <ExternalLink />
              Open Telegram again
            </a>
            <Button variant="ghost" onClick={() => setPhase({ name: "idle" })}>
              Cancel
            </Button>
          </div>
          <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Waiting for confirmation...
          </p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Your movie night starts here</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Log in with Telegram. Anything you pick gets delivered straight to your chat with the bot, ready to watch
            or download.
          </p>

          {phase.name === "error" ? (
            <p role="alert" className="mt-5 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive ring-1 ring-destructive/20">
              {phase.message}
            </p>
          ) : null}

          {showInvite ? (
            <div className="mt-5">
              <label htmlFor="invite" className="text-xs font-medium text-muted-foreground">
                Invite code
              </label>
              <Input
                id="invite"
                value={invite}
                onChange={(e) => setInvite(e.target.value.toUpperCase())}
                placeholder="e.g. K7Q2MX9P"
                autoComplete="off"
                maxLength={32}
                className="mt-1.5 h-10 font-mono tracking-widest uppercase"
              />
            </div>
          ) : null}

          <div ref={widget} className="mt-6 flex justify-center" />

          <Button
            onClick={start}
            disabled={phase.name === "starting"}
            variant="ghost"
            className="mt-3 w-full"
          >
            {phase.name === "starting" ? <Loader2 className="animate-spin" /> : <TelegramGlyph className="size-5" />}
            Or confirm in the bot (works on localhost)
          </Button>

          {!showInvite ? (
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <TicketCheck className="size-4" />I have an invite code
            </button>
          ) : null}

          <p className="mt-6 flex items-start gap-2 border-t border-white/5 pt-5 text-xs leading-relaxed text-muted-foreground">
            <Send className="mt-0.5 size-3.5 shrink-0" />
            We never see your phone number. Telegram only shares your name and username with the bot.
          </p>
        </>
      )}
    </div>
  );
}
