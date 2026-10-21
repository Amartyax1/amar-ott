import { env } from "@/lib/env";
import { signBotBody } from "@/lib/bot-sign";
import type { UploadInfo } from "@/lib/catalog";

export class SiteError extends Error {}

/** The laptop cannot open Supabase's database ports. The website can, so the bot asks the site. */
export async function siteCall<T>(action: string, fields: Record<string, unknown> = {}): Promise<T> {
  const body = JSON.stringify({ action, at: Date.now(), ...fields });
  const url = `${env.siteUrl.replace(/\/$/, "")}/api/bot`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-reelvault-signature": signBotBody(body),
      },
      body,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SiteError(`Couldn't reach ${env.siteUrl}.`);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new SiteError(data.error || `The site returned ${res.status}.`);
  return data;
}

export function confirmOnSite(token: string, profile: { id: number; first_name: string; last_name?: string; username?: string }) {
  return siteCall<{ ok: boolean; message?: string; name?: string }>("confirm-login", { token, profile });
}

export function indexOnSite(upload: UploadInfo) {
  return siteCall<{ duplicate: boolean; label: string }>("index", { upload });
}

export function findFileOnSite(vaultChatId: number, vaultMessageId: number) {
  return siteCall<{ id: number | null }>("find-file", { vaultChatId, vaultMessageId });
}

export function retagOnSite(fileId: number, text: string, wantsEpisode: boolean) {
  return siteCall<{ label: string }>("retag", { fileId, text, wantsEpisode });
}

export function deleteOnSite(fileId: number) {
  return siteCall<{ ok: true }>("delete", { fileId });
}

export function statsOnSite() {
  return siteCall<{ movies: number; shows: number; files: number }>("stats");
}
