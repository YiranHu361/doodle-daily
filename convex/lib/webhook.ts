import { constantTimeEqual } from "./retry";
import { toBase64 } from "./http";

export const WEBHOOK_TOLERANCE_S = 5 * 60;

export async function signWebhook(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${timestamp}.${body}`));
  return toBase64(new Uint8Array(mac));
}

export async function verifyWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowMs: number,
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!/^\d+$/.test(timestamp) || Math.abs(nowMs / 1000 - ts) > WEBHOOK_TOLERANCE_S) return false;
  const expected = await signWebhook(secret, id, timestamp, body);
  let match = false;
  for (const part of signature.split(" ")) {
    const [version, sig] = part.split(",", 2);
    if (version === "v1" && sig && constantTimeEqual(sig, expected)) match = true;
  }
  return match;
}
