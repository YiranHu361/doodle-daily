import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { setProvidersForTests } from "./providers";

const DEVICE = "device-1234-abcd";
const OTHER = "device-9999-zzzz";
type Call = { method: string; url: string; body: Record<string, unknown> | null };
let calls: Call[] = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeWhop(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  calls.push({ method: init?.method ?? "GET", url, body });
  const n = calls.length;
  if (url.endsWith("/products")) return Promise.resolve(json({ id: `prod_test${n}`, title: body.title }));
  if (url.endsWith("/variants")) return Promise.resolve(json({ id: `plan_test${n}`, purchase_url: `https://sandbox.whop.com/checkout/plan_test${n}` }));
  if (url.endsWith("/checkout_configurations")) return Promise.resolve(json({ id: `ch_${n}`, purchase_url: `https://sandbox.whop.com/checkout/ch_${n}/` }));
  return Promise.resolve(json({}, 404));
}

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  vi.stubGlobal("fetch", vi.fn(fakeWhop));
  process.env.MOCK_IMAGE_DELAY_MS = "0";
  process.env.WHOP_ENVIRONMENT = "sandbox";
  process.env.WHOP_API_KEY = "test-key";
  process.env.WHOP_COMPANY_ID = "biz_test";
  delete process.env.DAILY_IMAGE_CAP;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  setProvidersForTests({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function settle(t: ReturnType<typeof convexTest>, ms = 20_000) {
  for (let e = 0; e < ms; e += 1000) {
    await t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(1000);
  }
}

const FOUNDER = { deviceId: DEVICE, name: "Founder Daily", niche: "startup and YC news", priceUsd: 3 };

describe("papers", () => {
  test("creates a Whop product and a monthly variant with no extra first charge, then draws one sample", async () => {
    const t = convexTest(schema, modules);
    const res = await t.action(api.papers.create, FOUNDER);
    if (!res.ok) throw new Error(res.reason);
    expect(res.purchaseUrl).toMatch(/^https:\/\/sandbox\.whop\.com\/checkout\//);
    expect(calls[0]).toMatchObject({ method: "POST", body: { account_id: "biz_test", title: "Founder Daily", visibility: "visible" } });
    expect(calls[1].body).toMatchObject({ product_id: res.productId, billing_type: "renewal", billing_period: 30, initial_price: 0, renewal_price: 3, currency: "usd" });
    await settle(t);
    const [paper] = await t.query(api.papers.list, { deviceId: OTHER });
    expect(paper).toMatchObject({ name: "Founder Daily", priceUsd: 3, mine: false, locked: true, subscribers: 0, sample: { status: "ready" } });
    expect(paper.sample.firstPanelUrl).toEqual(expect.any(String));
    expect((await t.query(api.papers.list, { deviceId: DEVICE }))[0].mine).toBe(true);
    expect(await t.query(api.editions.today, {})).toBeNull();
    const comics = await t.run(async (ctx) => ctx.db.query("comics").collect());
    expect(comics.map((c) => c.kind)).toEqual(["paper-sample"]);
  });

  test("refuses bad input and banned niches before any Whop call, and caps at two papers", async () => {
    const t = convexTest(schema, modules);
    expect(await t.action(api.papers.create, { ...FOUNDER, name: "x".repeat(31) })).toEqual({ ok: false, reason: "bad_input" });
    expect(await t.action(api.papers.create, { ...FOUNDER, niche: "y".repeat(81) })).toEqual({ ok: false, reason: "bad_input" });
    expect(await t.action(api.papers.create, { ...FOUNDER, priceUsd: 21 })).toEqual({ ok: false, reason: "bad_input" });
    expect(await t.action(api.papers.create, { ...FOUNDER, niche: "war news" })).toEqual({ ok: false, reason: "not_allowed" });
    expect(calls).toHaveLength(0);
    expect((await t.action(api.papers.create, FOUNDER)).ok).toBe(true);
    expect((await t.action(api.papers.create, { ...FOUNDER, name: "Crypto Daily" })).ok).toBe(true);
    expect(await t.action(api.papers.create, { ...FOUNDER, name: "Third" })).toEqual({ ok: false, reason: "limit" });
  });

  test("a failed Whop call leaves no paper behind", async () => {
    const t = convexTest(schema, modules);
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "nope" } }, 400)));
    expect(await t.action(api.papers.create, FOUNDER)).toEqual({ ok: false, reason: "unavailable" });
    expect(await t.run(async (ctx) => ctx.db.query("papers").collect())).toHaveLength(0);
  });

  test("checkout carries the paper metadata; outside the sandbox nothing is created", async () => {
    const t = convexTest(schema, modules);
    const res = await t.action(api.papers.create, FOUNDER);
    if (!res.ok) throw new Error(res.reason);
    expect((await t.action(api.papers.startCheckout, { deviceId: OTHER, paperId: res.paperId })).ok).toBe(true);
    expect(calls[2].body).toMatchObject({ variant_id: res.planId, metadata: { kind: "paper", deviceId: OTHER, paperId: res.paperId } });
    process.env.WHOP_ENVIRONMENT = "production";
    expect(await t.action(api.papers.create, { ...FOUNDER, deviceId: OTHER })).toEqual({ ok: false, reason: "unavailable" });
    expect(await t.action(api.papers.startCheckout, { deviceId: OTHER, paperId: res.paperId })).toEqual({ ok: false, reason: "unavailable" });
    expect(calls).toHaveLength(3);
  });

  test("a paper entitlement unlocks the paper and counts as a member", async () => {
    const t = convexTest(schema, modules);
    const res = await t.action(api.papers.create, FOUNDER);
    if (!res.ok) throw new Error(res.reason);
    await t.run(async (ctx) =>
      ctx.db.insert("entitlements", { deviceId: OTHER, kind: "paper", paperId: res.paperId, membershipId: "mem_x", status: "active", since: Date.now(), updatedAt: Date.now() }),
    );
    const [paper] = await t.query(api.papers.list, { deviceId: OTHER });
    expect(paper).toMatchObject({ locked: false, subscribers: 1 });
  });
});
