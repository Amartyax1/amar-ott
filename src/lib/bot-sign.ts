import crypto from "node:crypto";
import { env } from "@/lib/env";

export function signBotBody(body: string) {
  return crypto.createHmac("sha256", env.botToken).update(body).digest("hex");
}

export function verifyBotBody(body: string, signature: string | null) {
  if (!env.botToken || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = signBotBody(body);
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}
