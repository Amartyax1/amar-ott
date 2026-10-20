"use client";

import { useRouter } from "next/navigation";
import { useState, type ComponentProps } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Status = { id: number; status: "queued" | "sending" | "sent" | "failed"; error: string | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function finishFromStatuses(sends: Status[], toastId: string | number, label: string): boolean {
  const failed = sends.filter((s) => s.status === "failed");
  if (failed.length === sends.length) {
    toast.error("Couldn't deliver", { id: toastId, description: failed[0]?.error ?? undefined });
    return false;
  }
  if (failed.length) {
    toast.warning(`${sends.length - failed.length} of ${sends.length} sent`, {
      id: toastId,
      description: failed[0]?.error ?? undefined,
    });
    return true;
  }
  toast.success("Check your Telegram", { id: toastId, description: `${label} is waiting in your chat with the bot.` });
  return true;
}

async function track(ids: number[], toastId: string | number, label: string): Promise<boolean> {
  // The bot paces deliveries (~1/s), so allow time proportional to the batch.
  const deadline = Date.now() + 30_000 + ids.length * 2_500;
  while (Date.now() < deadline) {
    await sleep(1200);
    const res = await fetch(`/api/send?ids=${ids.join(",")}`, { cache: "no-store" });
    if (!res.ok) continue;
    const { sends } = (await res.json()) as { sends: Status[] };
    const done = sends.filter((s) => s.status === "sent" || s.status === "failed");
    const failed = sends.filter((s) => s.status === "failed");

    if (done.length < ids.length) {
      if (ids.length > 1) toast.loading(`Sending ${label}: ${done.length} of ${ids.length} delivered`, { id: toastId });
      continue;
    }
    if (failed.length === ids.length) {
      toast.error("Couldn't deliver", { id: toastId, description: failed[0]?.error ?? undefined });
      return false;
    }
    if (failed.length) {
      toast.warning(`${ids.length - failed.length} of ${ids.length} sent`, {
        id: toastId,
        description: failed[0]?.error ?? undefined,
      });
      return true;
    }
    toast.success("Check your Telegram", { id: toastId, description: `${label} is waiting in your chat with the bot.` });
    return true;
  }
  toast.info("Still on its way", {
    id: toastId,
    description: "The bot is working through the queue. Your files will arrive in Telegram shortly.",
  });
  return true;
}

type SendButtonProps = {
  fileIds: number[];
  label: string;
  children?: React.ReactNode;
} & Omit<ComponentProps<typeof Button>, "onClick" | "children">;

export function SendButton({ fileIds, label, children, disabled, ...buttonProps }: SendButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function send() {
    setState("sending");
    const toastId = toast.loading(`Sending ${label}...`);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileIds }),
      });
      const data = (await res.json().catch(() => ({}))) as { ids?: number[]; sends?: Status[]; error?: string };
      if (res.status === 401) {
        toast.error("Your session expired", { id: toastId, description: "Log in again to keep watching." });
        router.push("/login");
        return;
      }
      if (!res.ok || !data.ids) {
        toast.error("Couldn't send", { id: toastId, description: data.error ?? "Something went wrong." });
        setState("idle");
        return;
      }
      const ok = data.sends?.length
        ? finishFromStatuses(data.sends, toastId, label)
        : await track(data.ids, toastId, label);
      setState(ok ? "sent" : "idle");
      if (ok) setTimeout(() => setState("idle"), 4000);
    } catch {
      toast.error("Network error", { id: toastId, description: "Check your connection and try again." });
      setState("idle");
    }
  }

  return (
    <Button {...buttonProps} disabled={disabled || state === "sending" || !fileIds.length} onClick={send}>
      {state === "sending" ? (
        <Loader2 className="animate-spin" />
      ) : state === "sent" ? (
        <Check />
      ) : (
        <Send />
      )}
      {children ?? (state === "sent" ? "Sent" : "Send to Telegram")}
    </Button>
  );
}
