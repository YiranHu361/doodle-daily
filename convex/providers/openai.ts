import { fetchText, fromBase64, toBase64 } from "../lib/http";
import { isQuotaError, isRetryableStatus, parseRetryAfter } from "../lib/retry";
import type { ImageProvider, ImageResult, PanelInput } from "./types";

export const OPENAI_IMAGE_MODEL = "gpt-image-2.6-flare";
const BASE = "https://api.openai.com/v1/images";

export function openaiImageProvider(apiKey: string): ImageProvider {
  return {
    name: "openai",
    async drawPanel(input: PanelInput): Promise<ImageResult> {
      const format = input.format ?? "jpeg";
      const refs = input.references ?? [];
      const body: Record<string, unknown> = {
        model: OPENAI_IMAGE_MODEL,
        prompt: input.prompt,
        n: 1,
        size: "1024x1024",
        quality: "medium",
        output_format: format,
        ...(format === "jpeg" ? { output_compression: 85 } : {}),
      };
      if (refs.length) body.images = refs.map((r) => ({ image_url: `data:${r.contentType};base64,${toBase64(r.bytes)}` }));
      const res = await fetchText(`${BASE}/${refs.length ? "edits" : "generations"}`, {
        method: "POST",
        timeoutMs: 150_000,
        maxBytes: 20 * 1024 * 1024,
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (!res.status) return { ok: false, reason: `openai ${res.error}`, retryable: true };
        const code = errorCode(res.text);
        return {
          ok: false,
          reason: `openai HTTP ${res.status}${code ? " " + code : ""}`,
          retryable: !isQuotaError(res.status, res.text) && isRetryableStatus(res.status),
          retryAfterMs: parseRetryAfter(res.headers?.get("retry-after") ?? null),
        };
      }
      let b64: unknown;
      try {
        b64 = (JSON.parse(res.text) as { data?: { b64_json?: unknown }[] }).data?.[0]?.b64_json;
      } catch {
        return { ok: false, reason: "openai sent malformed JSON", retryable: true };
      }
      if (typeof b64 !== "string" || !b64) return { ok: false, reason: "openai answer had no image", retryable: true };
      return { ok: true, bytes: fromBase64(b64), contentType: format === "jpeg" ? "image/jpeg" : "image/png" };
    },
  };
}

function errorCode(body: string): string {
  try {
    const e = (JSON.parse(body) as { error?: { code?: unknown; type?: unknown } }).error;
    const code = typeof e?.code === "string" ? e.code : typeof e?.type === "string" ? e.type : "";
    return code.replace(/[^a-z0-9_.-]/gi, "").slice(0, 60);
  } catch {
    return "";
  }
}
