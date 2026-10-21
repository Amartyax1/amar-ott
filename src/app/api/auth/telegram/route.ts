import { NextResponse } from "next/server";
import { z } from "zod";
import { loginWithTelegram } from "@/lib/access";
import { isMock } from "@/lib/env";
import { createSession } from "@/lib/session";

const schema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number().int(),
  hash: z.string().min(8),
});

/** Telegram Login Widget callback. Works on the Vercel domain after /setdomain in BotFather. */
export async function POST(req: Request) {
  if (isMock) return NextResponse.json({ error: "Telegram login is disabled in mock mode." }, { status: 400 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid Telegram login." }, { status: 400 });

  const result = await loginWithTelegram(body.data);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 403 });
  await createSession(result.user.id);
  return NextResponse.json({ status: "ok", name: result.user.firstName });
}
