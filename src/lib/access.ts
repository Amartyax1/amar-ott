import crypto from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { invites, loginTokens, users, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { isVaultMember } from "@/lib/telegram";

const LOGIN_TTL_MS = 10 * 60 * 1000;

export const hashNonce = (nonce: string) => crypto.createHash("sha256").update(nonce).digest("hex");

export type TelegramProfile = { id: number; first_name: string; last_name?: string; username?: string };

export async function upsertUser(p: TelegramProfile): Promise<User> {
  await ensureSchema();
  const [user] = await db
    .insert(users)
    .values({ id: p.id, firstName: p.first_name, lastName: p.last_name, username: p.username })
    .onConflictDoUpdate({
      target: users.id,
      set: { firstName: p.first_name, lastName: p.last_name ?? null, username: p.username ?? null, lastSeenAt: Date.now() },
    })
    .returning();
  return user;
}

export async function getUser(id: number): Promise<User | undefined> {
  await ensureSchema();
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export async function createLoginToken(browserNonce: string, inviteCode?: string | null) {
  await ensureSchema();
  await db.delete(loginTokens).where(lt(loginTokens.expiresAt, Date.now() - LOGIN_TTL_MS));
  const token = crypto.randomBytes(16).toString("base64url");
  const expiresAt = Date.now() + LOGIN_TTL_MS;
  await db.insert(loginTokens).values({
    token,
    browserHash: hashNonce(browserNonce),
    inviteCode: inviteCode?.trim().toUpperCase() || null,
    expiresAt,
  });
  return { token, expiresAt };
}

export type ClaimResult =
  | { status: "pending" | "expired" | "invalid" }
  | { status: "denied"; reason: string }
  | { status: "ok"; user: User };

export async function claimLogin(token: string, browserNonce: string): Promise<ClaimResult> {
  await ensureSchema();
  const [row] = await db.select().from(loginTokens).where(eq(loginTokens.token, token)).limit(1);
  if (!row || row.browserHash !== hashNonce(browserNonce) || row.status === "consumed") return { status: "invalid" };
  if (row.status === "denied") return { status: "denied", reason: row.reason ?? "Access denied." };
  if (row.status === "pending") return row.expiresAt < Date.now() ? { status: "expired" } : { status: "pending" };

  const user = row.userId ? await getUser(row.userId) : undefined;
  if (!user) return { status: "invalid" };
  await db.update(loginTokens).set({ status: "consumed" }).where(eq(loginTokens.token, token));
  return { status: "ok", user };
}

export type ConfirmResult = { ok: true; user: User; isNew: boolean } | { ok: false; message: string };

async function admit(profile: TelegramProfile, inviteCode?: string | null): Promise<ConfirmResult> {
  const existing = await getUser(profile.id);
  let allowed =
    Boolean(existing) || env.openRegistration || env.allowedUserIds.includes(profile.id) || (await isVaultMember(profile.id));

  if (!allowed && inviteCode) {
    const [used] = await db
      .update(invites)
      .set({ usedBy: profile.id, usedAt: Date.now() })
      .where(and(eq(invites.code, inviteCode.trim().toUpperCase()), isNull(invites.usedBy)))
      .returning();
    allowed = Boolean(used);
  }

  if (!allowed) {
    return {
      ok: false,
      message: inviteCode
        ? "That invite code is invalid or already used. Ask the owner for a new one."
        : "You're not on the guest list yet. Ask the owner for an invite code.",
    };
  }

  const user = await upsertUser(profile);
  return { ok: true, user, isNew: !existing };
}

export async function confirmLogin(token: string, profile: TelegramProfile): Promise<ConfirmResult> {
  await ensureSchema();
  const [row] = await db.select().from(loginTokens).where(eq(loginTokens.token, token)).limit(1);
  if (!row) return { ok: false, message: "This login link is invalid. Go back to the website and try again." };
  if (row.status !== "pending") return { ok: false, message: "This login link was already used." };
  if (row.expiresAt < Date.now()) {
    return { ok: false, message: "This login link expired. Go back to the website and press Log in again." };
  }

  const result = await admit(profile, row.inviteCode);
  if (!result.ok) {
    await db.update(loginTokens).set({ status: "denied", reason: result.message }).where(eq(loginTokens.token, token));
    return result;
  }
  await db.update(loginTokens).set({ status: "confirmed", userId: result.user.id }).where(eq(loginTokens.token, token));
  return result;
}

/** Telegram Login Widget payload. Hash is HMAC-SHA256 of the other fields using SHA256(bot token). */
export type TelegramWidgetAuth = TelegramProfile & {
  auth_date: number;
  hash: string;
  last_name?: string;
  photo_url?: string;
};

export function verifyTelegramWidget(data: TelegramWidgetAuth): boolean {
  if (!env.botToken) return false;
  const age = Date.now() / 1000 - Number(data.auth_date);
  if (!Number.isFinite(age) || age > 86400 || age < -60) return false;

  const { hash, ...rest } = data;
  const check = Object.entries(rest)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = crypto.createHash("sha256").update(env.botToken).digest();
  const hmac = crypto.createHmac("sha256", secret).update(check).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(hash));
}

export async function loginWithTelegram(data: TelegramWidgetAuth, inviteCode?: string | null): Promise<ConfirmResult> {
  await ensureSchema();
  if (!verifyTelegramWidget(data)) return { ok: false, message: "Telegram login could not be verified. Try again." };
  return admit({ id: data.id, first_name: data.first_name, last_name: data.last_name, username: data.username }, inviteCode);
}

export async function createInvite(): Promise<string> {
  await ensureSchema();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  await db.insert(invites).values({ code });
  return code;
}
