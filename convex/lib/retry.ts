export const MAX_PANEL_ATTEMPTS = 3;

export function retryDelayMs(attempt: number, retryAfterMs?: number): number {
  const backoff = 2000 * Math.pow(4, Math.max(0, attempt - 1));
  return Math.min(60_000, Math.max(retryAfterMs ?? 0, backoff));
}

export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

export function isQuotaError(status: number, body: string): boolean {
  if (status === 402) return true;
  if (status !== 429) return false;
  return /check your plan|billing|insufficient_quota|exceeded your current quota|credit balance/i.test(body);
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
