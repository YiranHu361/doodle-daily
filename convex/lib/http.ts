export const MAX_BYTES = 3 * 1024 * 1024;

export type FetchResult = { ok: true; status: number; text: string; headers: Headers } | { ok: false; status: number; text: string; headers: Headers | null; error: string };

export async function fetchText(
  url: string,
  init: RequestInit & { timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchResult> {
  const { timeoutMs = 6000, maxBytes = MAX_BYTES, ...rest } = init;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timeout after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  try {
    const run = async (): Promise<FetchResult> => {
      const res = await fetch(url, { ...rest, signal: controller.signal });
      const text = await readCapped(res, maxBytes);
      if (!res.ok) return { ok: false, status: res.status, text, headers: res.headers, error: `HTTP ${res.status}` };
      return { ok: true, status: res.status, text, headers: res.headers };
    };
    return await Promise.race([run(), timeout]);
  } catch (e) {
    return { ok: false, status: 0, text: "", headers: null, error: e instanceof Error ? e.message : "fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("response too large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  return new TextDecoder().decode(all);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
