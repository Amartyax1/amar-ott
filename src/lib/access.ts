import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { loginTokens, users, type User } from "@/db/schema";
import { env } from "@/lib/env";

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
  const token = crypto.randomBytes(16).toString("base64url");
  const expiresAt = Date.now() + LOGIN_TTL_MS;
  const invite = inviteCode?.trim().toUpperCase() || null;
  // One round-trip: drop long-dead tokens and insert the new one together.
  await db.execute(sql`
    WITH purged AS (
      DELETE FROM login_tokens WHERE expires_at < ${Date.now() - LOGIN_TTL_MS}
    )
    INSERT INTO login_tokens (token, browser_hash, invite_code, expires_at)
    VALUES (${token}, ${hashNonce(browserNonce)}, ${invite}, ${expiresAt})
  `);
  return { token, expiresAt };
}

export type ClaimResult =
  | { status: "pending" | "expired" | "invalid" }
  | { status: "denied"; reason: string }
  | { status: "ok"; user: User };

export async function claimLogin(token: string, browserNonce: string): Promise<ClaimResult> {
  await ensureSchema();
  const [row] = await db
    .select({
      status: loginTokens.status,
      browserHash: loginTokens.browserHash,
      expiresAt: loginTokens.expiresAt,
      reason: loginTokens.reason,
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
    })
    .from(loginTokens)
    .leftJoin(users, eq(users.id, loginTokens.userId))
    .where(eq(loginTokens.token, token))
    .limit(1);
  if (!row || row.browserHash !== hashNonce(browserNonce) || row.status === "consumed") return { status: "invalid" };
  if (row.status === "denied") return { status: "denied", reason: row.reason ?? "Access denied." };
  if (row.status === "pending") return row.expiresAt < Date.now() ? { status: "expired" } : { status: "pending" };
  if (row.id == null || !row.firstName || row.createdAt == null || row.lastSeenAt == null) return { status: "invalid" };

  const user: User = {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    username: row.username,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
  };
  await db
    .update(loginTokens)
    .set({ status: "consumed" })
    .where(and(eq(loginTokens.token, token), eq(loginTokens.status, "confirmed")));
  return { status: "ok", user };
}

export type ConfirmResult = { ok: true; user: User; isNew: boolean } | { ok: false; message: string };

/** Anyone who confirms in Telegram is signed in. Scanning the login code is the whole check. */
async function admit(profile: TelegramProfile): Promise<ConfirmResult> {
  const now = Date.now();
  const [user] = await db
    .insert(users)
    .values({
      id: profile.id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      username: profile.username,
      createdAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        firstName: profile.first_name,
        lastName: profile.last_name ?? null,
        username: profile.username ?? null,
        lastSeenAt: now,
      },
    })
    .returning();
  return { ok: true, user, isNew: user.createdAt === now };
}

type ConfirmRow = {
  status: string | null;
  expiresAt: string | number | null;
  found: boolean;
  id: string | number | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  createdAt: string | number | null;
  lastSeenAt: string | number | null;
  isNew: boolean | null;
  confirmed: boolean;
};

function asNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

export async function confirmLogin(token: string, profile: TelegramProfile): Promise<ConfirmResult> {
  await ensureSchema();
  const now = Date.now();
  // One round-trip: read the token, upsert the user, and mark it confirmed.
  const rows = await db.execute<ConfirmRow>(sql`
    WITH existing AS (
      SELECT token, status, expires_at
      FROM login_tokens
      WHERE token = ${token}
    ),
    admitted AS (
      INSERT INTO users (id, first_name, last_name, username, created_at, last_seen_at)
      SELECT ${profile.id}::bigint, ${profile.first_name}, ${profile.last_name ?? null}, ${profile.username ?? null}, ${now}::bigint, ${now}::bigint
      FROM existing
      WHERE status = 'pending' AND expires_at >= ${now}::bigint
      ON CONFLICT (id) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        username = EXCLUDED.username,
        last_seen_at = EXCLUDED.last_seen_at
      RETURNING id, first_name, last_name, username, created_at, last_seen_at,
                (created_at = ${now}::bigint) AS is_new
    ),
    confirmed AS (
      UPDATE login_tokens
      SET status = 'confirmed', user_id = (SELECT id FROM admitted)
      WHERE token = ${token}
        AND status = 'pending'
        AND expires_at >= ${now}::bigint
        AND EXISTS (SELECT 1 FROM admitted)
      RETURNING token
    )
    SELECT
      e.status AS status,
      e.expires_at AS "expiresAt",
      (e.token IS NOT NULL) AS found,
      a.id AS id,
      a.first_name AS "firstName",
      a.last_name AS "lastName",
      a.username AS username,
      a.created_at AS "createdAt",
      a.last_seen_at AS "lastSeenAt",
      a.is_new AS "isNew",
      (c.token IS NOT NULL) AS confirmed
    FROM (SELECT 1) AS anchor
    LEFT JOIN existing e ON true
    LEFT JOIN admitted a ON true
    LEFT JOIN confirmed c ON true
  `);
  const row = [...rows][0];
  if (!row || !asBool(row.found)) return { ok: false, message: "This login link is invalid. Go back to the website and try again." };
  if (row.status !== "pending") return { ok: false, message: "This login link was already used." };
  if (row.expiresAt == null || asNumber(row.expiresAt) < now) {
    return { ok: false, message: "This login link expired. Go back to the website and press Log in again." };
  }
  if (!asBool(row.confirmed) || row.id == null || !row.firstName || row.createdAt == null || row.lastSeenAt == null) {
    return { ok: false, message: "This login link was already used." };
  }
  return {
    ok: true,
    isNew: asBool(row.isNew),
    user: {
      id: asNumber(row.id),
      firstName: row.firstName,
      lastName: row.lastName,
      username: row.username,
      createdAt: asNumber(row.createdAt),
      lastSeenAt: asNumber(row.lastSeenAt),
    },
  };
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

export async function loginWithTelegram(data: TelegramWidgetAuth): Promise<ConfirmResult> {
  await ensureSchema();
  if (!verifyTelegramWidget(data)) return { ok: false, message: "Telegram login could not be verified. Try again." };
  return admit({
    id: data.id,
    first_name: data.first_name,
    last_name: data.last_name,
    username: data.username,
  });
}
