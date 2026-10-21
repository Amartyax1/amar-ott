import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmLogin } from "@/lib/access";
import { verifyBotBody } from "@/lib/bot-sign";
import { catalogStats, describeMedia, findVaultFile, indexUpload, removeFile, retagFile } from "@/lib/catalog";
import { parseMedia } from "@/lib/parse";

export const runtime = "nodejs";

const uploadSchema = z.object({
  telegramFileId: z.string().min(1),
  telegramFileUniqueId: z.string().min(1),
  mediaType: z.enum(["video", "document"]),
  fileName: z.string().nullable(),
  mimeType: z.string().nullable(),
  size: z.number().nullable(),
  duration: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  vaultChatId: z.number(),
  vaultMessageId: z.number().int(),
  caption: z.string().nullable(),
});

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm-login"),
    at: z.number(),
    token: z.string().min(8),
    profile: z.object({
      id: z.number().int().positive(),
      first_name: z.string().min(1),
      last_name: z.string().optional(),
      username: z.string().optional(),
    }),
  }),
  z.object({ action: z.literal("index"), at: z.number(), upload: uploadSchema }),
  z.object({
    action: z.literal("find-file"),
    at: z.number(),
    vaultChatId: z.number(),
    vaultMessageId: z.number().int(),
  }),
  z.object({
    action: z.literal("retag"),
    at: z.number(),
    fileId: z.number().int().positive(),
    text: z.string().min(1).max(300),
    wantsEpisode: z.boolean(),
  }),
  z.object({ action: z.literal("delete"), at: z.number(), fileId: z.number().int().positive() }),
  z.object({ action: z.literal("stats"), at: z.number() }),
]);

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyBotBody(raw, req.headers.get("x-reelvault-signature"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = schema.safeParse(parsed);
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (Math.abs(Date.now() - body.data.at) > 2 * 60 * 1000) {
    return NextResponse.json({ error: "That request expired. Try again." }, { status: 400 });
  }

  try {
    switch (body.data.action) {
      case "confirm-login": {
        const result = await confirmLogin(body.data.token, body.data.profile);
        if (!result.ok) return NextResponse.json({ ok: false, message: result.message });
        return NextResponse.json({ ok: true, name: result.user.firstName });
      }
      case "index": {
        const result = await indexUpload(body.data.upload);
        return NextResponse.json({ duplicate: result.duplicate, label: describeMedia(result) });
      }
      case "find-file": {
        const file = await findVaultFile(body.data.vaultChatId, body.data.vaultMessageId);
        return NextResponse.json({ id: file ? Number(file.id) : null });
      }
      case "retag": {
        const parsed = parseMedia(body.data.text, null);
        if (!parsed || (body.data.wantsEpisode && parsed.kind !== "episode")) {
          return NextResponse.json(
            { error: body.data.wantsEpisode ? "Usage: /tv Show Name S01E02" : "Usage: /title Movie Name (2010)" },
            { status: 400 },
          );
        }
        const result = await retagFile(body.data.fileId, parsed);
        return NextResponse.json({ label: describeMedia(result) });
      }
      case "delete": {
        await removeFile(body.data.fileId);
        return NextResponse.json({ ok: true });
      }
      case "stats":
        return NextResponse.json(await catalogStats());
    }
  } catch (err) {
    console.error("[api/bot]", err);
    return NextResponse.json({ error: "The site couldn't finish that." }, { status: 500 });
  }
}
