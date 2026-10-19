import { getFileById } from "@/lib/catalog";
import { streamingEnabled } from "@/lib/env";
import { streamFileRange } from "@/lib/mtproto";
import { guessMime, parseByteRange } from "@/lib/playable";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function fileHeaders(mime: string, size: number, range: { start: number; end: number; partial: boolean }) {
  const length = range.end - range.start + 1;
  const headers = new Headers({
    "content-type": mime,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=0, no-store",
    "content-length": String(Math.max(length, 0)),
  });
  if (range.partial && size > 0) {
    headers.set("content-range", `bytes ${range.start}-${range.end}/${size}`);
  }
  return headers;
}

async function resolveFile(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, response: new Response("Log in to watch.", { status: 401 }) };
  if (!streamingEnabled) {
    return {
      ok: false as const,
      response: new Response("In-browser playback is not configured. Add TELEGRAM_API_ID and TELEGRAM_API_HASH.", {
        status: 503,
      }),
    };
  }
  const id = Number((await ctx.params).id);
  const file = Number.isInteger(id) ? getFileById(id) : undefined;
  if (!file || file.vaultChatId === 0) {
    return { ok: false as const, response: new Response("File not found.", { status: 404 }) };
  }
  const size = file.size ?? 0;
  const range = parseByteRange(req.headers.get("range"), size);
  return { ok: true as const, file, size, range, mime: guessMime(file) };
}

export async function HEAD(req: Request, ctx: Ctx) {
  const resolved = await resolveFile(req, ctx);
  if (!resolved.ok) return resolved.response;
  const { size, range, mime } = resolved;
  return new Response(null, { status: range.partial ? 206 : 200, headers: fileHeaders(mime, size, range) });
}

/** Proxy a byte range of a Telegram vault file to the browser video player. */
export async function GET(req: Request, ctx: Ctx) {
  const resolved = await resolveFile(req, ctx);
  if (!resolved.ok) return resolved.response;
  const { file, size, range, mime } = resolved;
  try {
    const body = await streamFileRange(file, range.start, range.end, req.signal);
    return new Response(body, { status: range.partial ? 206 : 200, headers: fileHeaders(mime, size, range) });
  } catch (err) {
    console.error("[stream]", err);
    return new Response((err as Error).message ?? "Could not read that file from Telegram.", { status: 502 });
  }
}
