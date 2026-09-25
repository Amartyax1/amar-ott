import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueSends, getSendStatuses } from "@/lib/sends";
import { getSessionUser } from "@/lib/session";

const schema = z.object({ fileIds: z.array(z.number().int().positive()).min(1).max(50) });

/** Queue files for delivery to the logged-in user's Telegram DM. The bot process drains the queue. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = enqueueSends(user.id, body.data.fileIds);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ids: result.ids });
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 50);
  return NextResponse.json({ sends: getSendStatuses(user.id, ids) });
}
