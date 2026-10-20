import { NextResponse } from "next/server";
import { upsertUser } from "@/lib/access";
import { isMock } from "@/lib/env";
import { createSession } from "@/lib/session";

const DEMO_USER = { id: 1000001, first_name: "Demo", last_name: "Viewer", username: "demo_viewer" };

export async function POST() {
  if (!isMock) return NextResponse.json({ error: "Not available." }, { status: 404 });
  const user = await upsertUser(DEMO_USER);
  await createSession(user.id);
  return NextResponse.json({ status: "ok", name: user.firstName });
}
