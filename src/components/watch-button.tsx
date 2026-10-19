"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { Loader2, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type WatchButtonProps = {
  fileId: number;
  label: string;
  likelyPlayable?: boolean;
  children?: React.ReactNode;
} & Omit<ComponentProps<typeof Button>, "onClick" | "children">;

export function WatchButton({ fileId, label, likelyPlayable = true, children, ...buttonProps }: WatchButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button {...buttonProps} onClick={() => setOpen(true)}>
        <Play />
        {children ?? "Watch"}
      </Button>
      {open ? (
        <PlayerOverlay fileId={fileId} label={label} likelyPlayable={likelyPlayable} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function PlayerOverlay({
  fileId,
  label,
  likelyPlayable,
  onClose,
}: {
  fileId: number;
  label: string;
  likelyPlayable: boolean;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(likelyPlayable ? null : null);
  const [hint] = useState(
    likelyPlayable
      ? null
      : "This file is probably MKV or HEVC, which most browsers cannot play. If it fails, send it to Telegram instead.",
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-label={`Watch ${label}`} aria-modal="true">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <p className="truncate text-sm font-medium text-white/90">{label}</p>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={onClose} aria-label="Close player">
          <X />
        </Button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6 sm:px-8">
        {error ? (
          <p className="max-w-md px-4 text-center text-sm text-white/80">{error}</p>
        ) : (
          <>
            <Loader2 className="absolute size-8 animate-spin text-white/40" />
            <video
              key={fileId}
              className="relative z-10 max-h-full max-w-full bg-black"
              controls
              autoPlay
              playsInline
              preload="metadata"
              src={`/api/stream/${fileId}`}
              onError={() =>
                setError(
                  likelyPlayable
                    ? "The player couldn't start. Check that TELEGRAM_API_ID and TELEGRAM_API_HASH are set, or send the file to Telegram instead."
                    : "This format won't play in the browser. Send it to Telegram — Telegram's player handles MKV and HEVC.",
                )
              }
            />
          </>
        )}
      </div>
      {hint && !error ? <p className="px-6 pb-4 text-center text-xs text-white/50">{hint}</p> : null}
    </div>
  );
}
