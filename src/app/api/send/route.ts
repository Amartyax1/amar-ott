import { NextResponse } from "next/server";
import { z } from "zod";
import { deliverNow, getSendStatuses } from "@/lib/sends";
import { getSessionUser } from "@/lib/session";

export const maxDuration = 60;

const schema = z.object({ fileIds: z.array(z.number().int().positive()).min(1).max(20) });

/** Send files to the logged-in user's Telegram DM immediately (no always-on worker). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = await deliverNow(user.id, body.data.fileIds);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ids: result.ids, sends: result.sends });
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 50);
  return NextResponse.json({ sends: await getSendStatuses(user.id, ids) });
}
