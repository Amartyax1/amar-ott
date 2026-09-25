import crypto from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { invites, loginTokens, users, type User } from "@/db/schema";
import { env } from "@/lib/env";

const LOGIN_TTL_MS = 10 * 60 * 1000;

export const hashNonce = (nonce: string) => crypto.createHash("sha256").update(nonce).digest("hex");

export type TelegramProfile = { id: number; first_name: string; last_name?: string; username?: string };

export function upsertUser(p: TelegramProfile): User {
  return db
    .insert(users)
    .values({ id: p.id, firstName: p.first_name, lastName: p.last_name, username: p.username })
    .onConflictDoUpdate({
      target: users.id,
      set: { firstName: p.first_name, lastName: p.last_name ?? null, username: p.username ?? null, lastSeenAt: Date.now() },
    })
    .returning()
    .get();
}

export function getUser(id: number): User | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

// ---------------------------------------------------------------------------
// Website side

export function createLoginToken(browserNonce: string, inviteCode?: string | null) {
  db.delete(loginTokens).where(lt(loginTokens.expiresAt, Date.now() - LOGIN_TTL_MS)).run();
  const token = crypto.randomBytes(16).toString("base64url");
  const expiresAt = Date.now() + LOGIN_TTL_MS;
  db.insert(loginTokens)
    .values({
      token,
      browserHash: hashNonce(browserNonce),
      inviteCode: inviteCode?.trim().toUpperCase() || null,
      expiresAt,
    })
    .run();
  return { token, expiresAt };
}

export type ClaimResult =
  | { status: "pending" | "expired" | "invalid" }
  | { status: "denied"; reason: string }
  | { status: "ok"; user: User };

/** Called by the browser while polling. Only the browser that created the token can claim it. */
export function claimLogin(token: string, browserNonce: string): ClaimResult {
  const row = db.select().from(loginTokens).where(eq(loginTokens.token, token)).get();
  if (!row || row.browserHash !== hashNonce(browserNonce) || row.status === "consumed") return { status: "invalid" };
  if (row.status === "denied") return { status: "denied", reason: row.reason ?? "Access denied." };
  if (row.status === "pending") return row.expiresAt < Date.now() ? { status: "expired" } : { status: "pending" };

  const user = row.userId ? getUser(row.userId) : undefined;
  if (!user) return { status: "invalid" };
  db.update(loginTokens).set({ status: "consumed" }).where(eq(loginTokens.token, token)).run();
  return { status: "ok", user };
}

// ---------------------------------------------------------------------------
// Bot side

export type ConfirmResult = { ok: true; user: User; isNew: boolean } | { ok: false; message: string };

/**
 * Called when someone opens t.me/<bot>?start=login_<token>.
 * `isVaultMember` lets the owner (anyone in the vault group) in without extra setup.
 */
export function confirmLogin(token: string, profile: TelegramProfile, isVaultMember: boolean): ConfirmResult {
  const row = db.select().from(loginTokens).where(eq(loginTokens.token, token)).get();
  if (!row) return { ok: false, message: "This login link is invalid. Go back to the website and try again." };
  if (row.status !== "pending") return { ok: false, message: "This login link was already used." };
  if (row.expiresAt < Date.now()) {
    return { ok: false, message: "This login link expired. Go back to the website and press Log in again." };
  }

  const existing = getUser(profile.id);
  let allowed =
    Boolean(existing) || env.openRegistration || isVaultMember || env.allowedUserIds.includes(profile.id);

  if (!allowed && row.inviteCode) {
    const used = db
      .update(invites)
      .set({ usedBy: profile.id, usedAt: Date.now() })
      .where(and(eq(invites.code, row.inviteCode), isNull(invites.usedBy)))
      .returning()
      .get();
    allowed = Boolean(used);
  }

  if (!allowed) {
    const reason = row.inviteCode
      ? "That invite code is invalid or already used. Ask the owner for a new one."
      : "You're not on the guest list yet. Ask the owner for an invite code and enter it on the login page.";
    db.update(loginTokens).set({ status: "denied", reason }).where(eq(loginTokens.token, token)).run();
    return { ok: false, message: reason };
  }

  const user = upsertUser(profile);
  db.update(loginTokens).set({ status: "confirmed", userId: user.id }).where(eq(loginTokens.token, token)).run();
  return { ok: true, user, isNew: !existing };
}

export function createInvite(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  db.insert(invites).values({ code }).run();
  return code;
}
