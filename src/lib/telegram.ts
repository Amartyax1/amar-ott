import { Bot } from "grammy";
import { env } from "@/lib/env";

let api: Bot["api"] | null = null;

/** Bot API client without long-polling. Safe to use from Vercel route handlers. */
export function telegramApi() {
  if (!env.botToken) throw new Error("BOT_TOKEN is not set.");
  if (!api) api = new Bot(env.botToken).api;
  return api;
}

export async function isVaultMember(userId: number): Promise<boolean> {
  if (env.vaultChatId === null) return false;
  try {
    const m = await telegramApi().getChatMember(env.vaultChatId, userId);
    return ["creator", "administrator", "member", "restricted"].includes(m.status);
  } catch {
    return false;
  }
}
