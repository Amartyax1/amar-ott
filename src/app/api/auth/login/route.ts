import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { claimLogin, createLoginToken } from "@/lib/access";
import { env, isMock } from "@/lib/env";
import { createSession, getLoginNonce, setLoginNonce } from "@/lib/session";

const startSchema = z.object({ inviteCode: z.string().max(32).optional() });

/** Start a login: returns a t.me deep link that the user opens to confirm with the bot. */
export async function POST(req: Request) {
  if (isMock) return NextResponse.json({ error: "Telegram login is disabled in mock mode." }, { status: 400 });
  if (!env.botUsername) return NextResponse.json({ error: "BOT_USERNAME is not configured." }, { status: 500 });

  const body = startSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid invite code." }, { status: 400 });

  const nonce = crypto.randomBytes(24).toString("base64url");
  await setLoginNonce(nonce);
  const { token, expiresAt } = await createLoginToken(nonce, body.data.inviteCode);
  const payload = `login_${token}`;
  return NextResponse.json({
    token,
    expiresAt,
    deepLink: `https://t.me/${env.botUsername}?start=${payload}`,
    appLink: `tg://resolve?domain=${env.botUsername}&start=${payload}`,
  });
}

/** Poll a login started in this browser. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const nonce = await getLoginNonce();
  if (!token || !nonce) return NextResponse.json({ status: "invalid" });

  const result = await claimLogin(token, nonce);
  if (result.status === "ok") {
    await createSession(result.user.id);
    return NextResponse.json({ status: "ok", name: result.user.firstName });
  }
  return NextResponse.json(result);
}
