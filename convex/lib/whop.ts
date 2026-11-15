import { fetchText } from "./http";

export const WHOP_API = "https://sandbox-api.whop.com/api/v1";

export type WhopConfig = { ok: true; apiKey: string; companyId: string } | { ok: false; reason: "not_sandbox" | "not_configured" };

export function whopConfig(): WhopConfig {
  if (process.env.WHOP_ENVIRONMENT !== "sandbox") return { ok: false, reason: "not_sandbox" };
  const apiKey = process.env.WHOP_API_KEY ?? "";
  if (!apiKey) return { ok: false, reason: "not_configured" };
  return { ok: true, apiKey, companyId: process.env.WHOP_COMPANY_ID ?? "" };
}

export function planId(kind: "commission" | "plus" | "promo"): string {
  if (kind === "promo") return process.env.WHOP_PLAN_PROMO || planId("commission");
  return (kind === "commission" ? process.env.WHOP_PLAN_COMMISSION : process.env.WHOP_PLAN_PLUS) ?? "";
}

export type WhopResult = { ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string };

export async function whop(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<WhopResult> {
  const config = whopConfig();
  if (!config.ok) return { ok: false, status: 0, error: config.reason };
  const res = await fetchText(`${WHOP_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    timeoutMs: 15_000,
  });
  let data: unknown = null;
  try {
    data = res.text ? JSON.parse(res.text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = (data as { error?: { message?: string }; message?: string } | null)?.error?.message ?? (data as { message?: string } | null)?.message;
    return { ok: false, status: res.status, error: (message ?? res.error).slice(0, 300) };
  }
  if (!data || typeof data !== "object") return { ok: false, status: res.status, error: "bad json" };
  return { ok: true, data: data as Record<string, unknown> };
}

export async function createCheckout(variantId: string, metadata: Record<string, string>): Promise<{ ok: true; id: string; url: string } | { ok: false; error: string }> {
  if (!variantId) return { ok: false, error: "plan not configured" };
  const site = process.env.CONVEX_SITE_URL;
  const res = await whop("POST", "/checkout_configurations", {
    variant_id: variantId,
    metadata,
    ...(site ? { redirect_url: `${site}/whop/done` } : {}),
  });
  if (!res.ok) return { ok: false, error: res.error };
  const id = res.data.id;
  const url = res.data.purchase_url;
  if (typeof id !== "string" || typeof url !== "string" || !url.startsWith("https://")) return { ok: false, error: "checkout without a url" };
  return { ok: true, id, url };
}

export type Membership = { id: string; status: string; periodEnd: number | undefined; metadata: Record<string, string> };

export function parseMembership(raw: unknown): Membership | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string" || !m.id.startsWith("mem_")) return null;
  const end = typeof m.current_period_end === "string" ? Date.parse(m.current_period_end) : NaN;
  return {
    id: m.id,
    status: typeof m.status === "string" ? m.status : "unknown",
    periodEnd: Number.isFinite(end) ? end : undefined,
    metadata: stringRecord(m.metadata),
  };
}

export function stringRecord(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  return out;
}

export function isValidMembership(status: string, periodEnd: number | undefined, now: number): boolean {
  if (status !== "active" && status !== "trialing") return false;
  return periodEnd === undefined || periodEnd > now;
}
