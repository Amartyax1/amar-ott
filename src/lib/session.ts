import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import { getUser } from "@/lib/access";
import { env } from "@/lib/env";
import type { User } from "@/db/schema";

const SESSION_COOKIE = "rv_session";
export const LOGIN_NONCE_COOKIE = "rv_login_nonce";
const MAX_AGE = 60 * 60 * 24 * 30;

// Falls back to a key derived from the bot token so a missing SESSION_SECRET never means unsigned sessions.
const secret = new TextEncoder().encode(
  env.sessionSecret ||
    crypto.createHash("sha256").update(`reelvault-session:${env.botToken || "mock-mode"}`).digest("hex"),
);

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.siteUrl.startsWith("https://"),
  path: "/",
};

export async function createSession(userId: number) {
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret);
  (await cookies()).set(SESSION_COOKIE, jwt, { ...cookieOptions, maxAge: MAX_AGE });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    // Deleting a row from `users` revokes access immediately.
    return getUser(Number(payload.sub)) ?? null;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function setLoginNonce(nonce: string) {
  (await cookies()).set(LOGIN_NONCE_COOKIE, nonce, { ...cookieOptions, maxAge: 60 * 15 });
}

export async function getLoginNonce() {
  return (await cookies()).get(LOGIN_NONCE_COOKIE)?.value ?? null;
}
