import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { addDays, pacificDate } from "./lib/dates";
import { signWebhook } from "./lib/webhook";
import { imageCap } from "./pipeline";
import { setProvidersForTests } from "./providers";

const SECRET = "ws_test_secret_value";
const DEVICE = "device-1234-abcd";
const OTHER = "device-9999-zzzz";
const PLUS_PLAN = "plan_plus_test";
const COMMISSION_PLAN = "plan_commission_test";
const DAY = 24 * 60 * 60 * 1000;

const INVESTIGATION_URL = "https://news.example.com/acme-ceo-investigated";
const AFFAIR_URL = "https://news.example.com/acme-ceo-affairs";
const HARMLESS_URL = "https://www.bloomberg.com/news/articles/robots-learn-to-fold-laundry-at-home-x7k2p9q1";
const WSJ_URL = "https://www.wsj.com/business/nvidia-is-preparing-to-oust-nvidia-ceo-jensen-huang-30f421ad?mod=e2tw";
const READABLE_URL = "https://www.reuters.com/business/acme-ships-a-folding-robot-2026-11-15/";
const ARTICLES: Record<string, string> = {
  [INVESTIGATION_URL]:
    '<html><head><meta property="og:site_name" content="Example News"><meta property="og:title" content="Regulators investigate Acme chief executive Jane Smith"><meta property="og:description" content="Regulators opened an investigation into the accounts."></head></html>',
  [AFFAIR_URL]: '<html><head><meta property="og:title" content="Acme chief executive Jane Smith and her affairs"></head></html>',
  [READABLE_URL]: "<html><head><title>Acme's robot folds laundry in under a minute</title></head></html>",
};

type T = ReturnType<typeof convexTest>;
type Call = { method: string; url: string; body: unknown };

let calls: Call[] = [];
let periodEnd = Date.UTC(2026, 11, 15);
let membershipStatus = "active";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeWhop(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  calls.push({ method, url, body });
  if (url.endsWith("/checkout_configurations")) {
    const n = calls.length;
    return Promise.resolve(json({ id: `ch_test${n}`, purchase_url: `https://sandbox.whop.com/checkout/ch_test${n}/`, metadata: body.metadata }));
  }
  const extend = /\/memberships\/(mem_\w+)\/extend$/.exec(url);
  if (extend) {
    periodEnd += body.days * DAY;
    return Promise.resolve(json({ id: extend[1], status: "active", current_period_end: new Date(periodEnd).toISOString() }));
  }
  const mem = /\/memberships\/(mem_\w+)$/.exec(url);
  if (mem) {
    return Promise.resolve(
      json({ id: mem[1], status: membershipStatus, variant_id: PLUS_PLAN, current_period_end: new Date(periodEnd).toISOString(), metadata: { kind: "plus", deviceId: DEVICE } }),
    );
  }
  const article = ARTICLES[url];
  if (article) return Promise.resolve(new Response(article, { status: 200, headers: { "Content-Type": "text/html" } }));
  const refund = /\/payments\/(pay_\w+)\/refund$/.exec(url);
  if (refund) return Promise.resolve(json({ id: refund[1], status: "paid", refunded_amount: 1 }));
  return Promise.resolve(json({ error: { message: "not found" } }, 404));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T20:00:00Z"));
  calls = [];
  periodEnd = Date.UTC(2026, 11, 15);
  membershipStatus = "active";
  vi.stubGlobal("fetch", vi.fn(fakeWhop));
  process.env.MOCK_IMAGE_DELAY_MS = "0";
  process.env.DEMO_SECRET = "demo";
  process.env.WHOP_ENVIRONMENT = "sandbox";
  process.env.WHOP_API_KEY = "test-key";
  process.env.WHOP_WEBHOOK_SECRET = SECRET;
  process.env.WHOP_PLAN_PLUS = PLUS_PLAN;
  process.env.WHOP_PLAN_COMMISSION = COMMISSION_PLAN;
  delete process.env.DAILY_IMAGE_CAP;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  setProvidersForTests({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function settle(t: T, ms = 60_000) {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
    await t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(1000);
  }
  await t.finishInProgressScheduledFunctions();
}

async function deliver(t: T, event: { type: string; data: unknown }, opts: { id?: string; tamper?: boolean; unsigned?: boolean; ageS?: number } = {}) {
  const id = opts.id ?? `msg_${Math.random().toString(36).slice(2)}`;
  const timestamp = String(Math.floor(Date.now() / 1000) - (opts.ageS ?? 0));
  const body = JSON.stringify({ id, api_version: "v1", timestamp: new Date().toISOString(), ...event });
  const signature = await signWebhook(SECRET, id, timestamp, body);
  const headers: Record<string, string> = { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": timestamp };
  if (!opts.unsigned) headers["webhook-signature"] = `v1,${signature}`;
  return await t.fetch("/whop", { method: "POST", headers, body: opts.tamper ? body.replace("succeeded", "succeeded ") : body });
}

async function events(t: T) {
  return await t.run(async (ctx) => ctx.db.query("webhookEvents").collect());
}

async function grantPlus(t: T, deviceId = DEVICE, membershipId = "mem_plus1") {
  await deliver(t, {
    type: "membership.activated",
    data: { id: membershipId, status: "active", variant_id: PLUS_PLAN, current_period_end: new Date(periodEnd).toISOString(), metadata: { kind: "plus", deviceId } },
  });
  await settle(t, 2000);
}

describe("POST /whop", () => {
  test("accepts a signed event and rejects unsigned, tampered and stale ones", async () => {
    const t = convexTest(schema, modules);
    const data = { id: "pay_x", metadata: {} };
    expect((await deliver(t, { type: "payment.succeeded", data })).status).toBe(200);
    expect((await deliver(t, { type: "payment.succeeded", data }, { unsigned: true })).status).toBe(401);
    expect((await deliver(t, { type: "payment.succeeded", data }, { tamper: true })).status).toBe(401);
    expect((await deliver(t, { type: "payment.succeeded", data }, { ageS: 3600 })).status).toBe(401);
    const res = await t.fetch("/whop", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    expect(await events(t)).toHaveLength(1);
  });

  test("a duplicate delivery is ignored", async () => {
    const t = convexTest(schema, modules);
    const event = {
      type: "membership.activated",
      data: { id: "mem_dup", status: "active", variant_id: PLUS_PLAN, current_period_end: new Date(periodEnd).toISOString(), metadata: { kind: "plus", deviceId: DEVICE } },
    };
    expect((await deliver(t, event, { id: "msg_same" })).status).toBe(200);
    expect((await deliver(t, event, { id: "msg_same" })).status).toBe(200);
    await settle(t, 2000);
    expect(await events(t)).toHaveLength(1);
    const rows = await t.run(async (ctx) => ctx.db.query("entitlements").collect());
    expect(rows).toHaveLength(1);
  });
});

describe("commissions", () => {
  test("a banned topic is refused with a reason before any checkout exists", async () => {
    const t = convexTest(schema, modules);
    expect(await t.action(api.commissions.start, { deviceId: DEVICE, topic: "my neighbour was arrested" })).toEqual({ ok: false, reason: "not_allowed", refusal: "private_person" });
    expect(await t.action(api.commissions.start, { deviceId: DEVICE, topic: "a storm that killed three people" })).toEqual({ ok: false, reason: "not_allowed", refusal: "tragedy" });
    expect(await t.action(api.commissions.start, { deviceId: DEVICE, topic: "Acme chief executive Jane Smith's affairs" })).toEqual({ ok: false, reason: "not_allowed", refusal: "private_life" });
    expect(await t.action(api.commissions.start, { deviceId: DEVICE, link: AFFAIR_URL })).toEqual({ ok: false, reason: "not_allowed", refusal: "private_life" });
    expect(await t.action(api.commissions.start, { deviceId: DEVICE, topic: "Acme chief executive Jane Smith is being investigated" })).toEqual({
      ok: false,
      reason: "not_allowed",
      refusal: "needs_source",
      message: "That one needs a source. Paste a link to the article and Robo will draw it.",
    });
    calls = [];
    expect(await t.action(api.commissions.start, { deviceId: DEVICE, topic: "x".repeat(141) })).toEqual({ ok: false, reason: "bad_input" });
    expect(await t.action(api.commissions.start, { deviceId: DEVICE })).toEqual({ ok: false, reason: "bad_input" });
    expect(await t.action(api.commissions.start, { deviceId: DEVICE, link: "ftp://example.com/a" })).toEqual({ ok: false, reason: "bad_input" });
    expect(calls).toHaveLength(0);
    expect(await t.run(async (ctx) => ctx.db.query("commissions").collect())).toHaveLength(0);
  });

  test("the same legal story passes as a link to an article, and the writer learns the publisher", async () => {
    const t = convexTest(schema, modules);
    const res = await t.action(api.commissions.start, { deviceId: DEVICE, link: INVESTIGATION_URL });
    if (!res.ok) throw new Error(`start failed: ${JSON.stringify(res)}`);
    const [row] = await t.run(async (ctx) => ctx.db.query("commissions").collect());
    expect(row).toMatchObject({ link: INVESTIGATION_URL, headline: "Regulators investigate Acme chief executive Jane Smith" });
    expect(row.facts).toContain("The article was published by Example News.");
  });

  async function payFor(t: T, commissionId: string, paymentId: string) {
    await deliver(t, { type: "payment.succeeded", data: { id: paymentId, variant_id: COMMISSION_PLAN, metadata: { kind: "commission", deviceId: DEVICE, commissionId } } });
    await settle(t, 30_000);
  }

  test("an unreadable slug about a named executive being ousted is accepted and drawn as an unverified link", async () => {
    const t = convexTest(schema, modules);
    const res = await t.action(api.commissions.start, { deviceId: DEVICE, link: WSJ_URL });
    if (!res.ok) throw new Error(`start failed: ${JSON.stringify(res)}`);
    expect(calls.find((c) => c.url === WSJ_URL)).toBeDefined();
    const [row] = await t.run(async (ctx) => ctx.db.query("commissions").collect());
    expect(row).toMatchObject({
      link: WSJ_URL,
      topic: "Nvidia is preparing to oust nvidia ceo jensen huang",
      headline: "Nvidia is preparing to oust nvidia ceo jensen huang",
      facts: ["A link a reader pasted from The Wall Street Journal is titled: Nvidia is preparing to oust nvidia ceo jensen huang. Doodle Daily could not open the article to check it."],
      unverified: true,
    });
    await payFor(t, res.commissionId, "pay_wsj");
    const comic = (await t.query(api.editions.today, { deviceId: DEVICE }))!.comics[0];
    expect(comic).toMatchObject({ kind: "commission", status: "ready", unverified: true, sourceUrl: WSJ_URL });
    for (const p of comic.panels) {
      expect(p.caption).toMatch(/^(The link says|According to the link's headline)/);
      expect(p.caption).not.toMatch(/reports|Wall Street Journal/);
    }
    expect(comic.realStory.endsWith("Doodle Daily could not open the article to check it.")).toBe(true);
  });

  test("a harmless unreadable slug is drawn in the unverified frame, only for its creator", async () => {
    const t = convexTest(schema, modules);
    const res = await t.action(api.commissions.start, { deviceId: DEVICE, link: HARMLESS_URL });
    if (!res.ok) throw new Error(`start failed: ${JSON.stringify(res)}`);
    const [row] = await t.run(async (ctx) => ctx.db.query("commissions").collect());
    expect(row.facts).toEqual([
      "A link a reader pasted from Bloomberg is titled: Robots learn to fold laundry at home. Doodle Daily could not open the article to check it.",
    ]);
    await payFor(t, res.commissionId, "pay_harmless");
    const comic = (await t.query(api.editions.today, { deviceId: DEVICE }))!.comics[0];
    expect(comic).toMatchObject({ unverified: true, status: "ready" });
    expect(comic.panels[0].caption).toBe("The link says Robots learn to fold laundry at home");
    expect(await t.query(api.editions.today, { deviceId: OTHER })).toBeNull();
  });

  test("an unreadable link with a short slug is refused, and slug headlines follow the content rules", async () => {
    const t = convexTest(schema, modules);
    expect(await t.action(api.commissions.start, { deviceId: DEVICE, link: "https://www.wsj.com/tech/nvidia-earnings-30f421ad?mod=e2tw" })).toEqual({
      ok: false,
      reason: "bad_input",
      refusal: "unreadable_link",
      message: "Robo could not open that page. Type the headline instead.",
    });
    expect(await t.action(api.commissions.start, { deviceId: DEVICE, link: "https://www.nytimes.com/2026/11/15/business/acme-chief-executive-and-her-affairs.html" })).toEqual({
      ok: false,
      reason: "not_allowed",
      refusal: "private_life",
    });
    expect(await t.run(async (ctx) => ctx.db.query("commissions").collect())).toHaveLength(0);
  });

  test("a readable page still uses its real title, not the slug", async () => {
    const t = convexTest(schema, modules);
    const res = await t.action(api.commissions.start, { deviceId: DEVICE, link: READABLE_URL });
    if (!res.ok) throw new Error(`start failed: ${JSON.stringify(res)}`);
    const [row] = await t.run(async (ctx) => ctx.db.query("commissions").collect());
    expect(row.headline).toBe("Acme's robot folds laundry in under a minute");
    expect(row.facts).toContain("The article was published by Reuters.");
  });

  test("a spent image cap is refused before checkout", async () => {
    const t = convexTest(schema, modules);
    process.env.DAILY_IMAGE_CAP = "4";
    await t.mutation(internal.pipeline.reserveImages, { date: pacificDate(Date.now()), count: 2 });
    expect(await t.action(api.commissions.start, { deviceId: DEVICE, topic: "a robot learns to fold laundry" })).toEqual({ ok: false, reason: "spend_cap" });
    expect(calls).toHaveLength(0);
  });

  test("checkout carries metadata, and only the signed payment draws the comic", async () => {
    const t = convexTest(schema, modules);
    const res = await t.action(api.commissions.start, { deviceId: DEVICE, topic: "a robot learns to fold laundry" });
    if (!res.ok) throw new Error("start failed");
    expect(res.url).toMatch(/^https:\/\/sandbox\.whop\.com\/checkout\//);
    expect(calls[0]).toMatchObject({ method: "POST", body: { variant_id: COMMISSION_PLAN, metadata: { kind: "commission", deviceId: DEVICE, commissionId: res.commissionId } } });
    expect(calls[0].url).toBe("https://sandbox-api.whop.com/api/v1/checkout_configurations");
    expect((await t.query(api.commissions.mine, { deviceId: DEVICE }))[0]).toMatchObject({ status: "awaiting_payment", comicId: null });
    await settle(t, 5000);
    expect(await t.query(api.editions.today, {})).toBeNull();

    await deliver(t, {
      type: "payment.succeeded",
      data: { id: "pay_c1", variant_id: COMMISSION_PLAN, membership_id: "mem_c1", metadata: { kind: "commission", deviceId: DEVICE, commissionId: res.commissionId } },
    });
    await settle(t, 30_000);
    const [mine] = await t.query(api.commissions.mine, { deviceId: DEVICE });
    expect(mine.status).toBe("ready");
    expect(await t.query(api.editions.today, { deviceId: OTHER })).toBeNull();
    expect(await t.query(api.editions.today, {})).toBeNull();
    expect(await t.query(api.editions.list, { deviceId: OTHER })).toEqual([]);
    const today = (await t.query(api.editions.today, { deviceId: DEVICE }))!;
    expect(await t.query(api.editions.byDate, { date: today.date, deviceId: OTHER })).toBeNull();
    expect((await t.query(api.editions.byDate, { date: today.date, deviceId: DEVICE }))!.comics).toHaveLength(1);
    expect(await t.query(api.editions.list, { deviceId: DEVICE })).toHaveLength(1);
    expect(today.comics[0]).toMatchObject({ _id: mine.comicId, kind: "commission", sourceName: "Created by a reader", status: "ready" });
    expect(today.comics[0].panels).toHaveLength(4);
    expect(await t.query(api.commissions.mine, { deviceId: OTHER })).toEqual([]);
  });

  test("a payment for someone else's commission or another plan changes nothing", async () => {
    const t = convexTest(schema, modules);
    const res = await t.action(api.commissions.start, { deviceId: DEVICE, topic: "our seed round" });
    if (!res.ok) throw new Error("start failed");
    await deliver(t, { type: "payment.succeeded", data: { id: "pay_a", variant_id: COMMISSION_PLAN, metadata: { kind: "commission", deviceId: OTHER, commissionId: res.commissionId } } });
    await deliver(t, { type: "payment.succeeded", data: { id: "pay_b", variant_id: PLUS_PLAN, metadata: { kind: "commission", deviceId: DEVICE, commissionId: res.commissionId } } });
    await settle(t, 5000);
    expect((await t.query(api.commissions.mine, { deviceId: DEVICE }))[0].status).toBe("awaiting_payment");
  });

  test("a commission that cannot be drawn after payment is failed and refunded", async () => {
    const t = convexTest(schema, modules);
    const res = await t.action(api.commissions.start, { deviceId: DEVICE, topic: "my cat runs a bakery" });
    if (!res.ok) throw new Error("start failed");
    process.env.DAILY_IMAGE_CAP = "4";
    await t.mutation(internal.pipeline.reserveImages, { date: pacificDate(Date.now()), count: 1 });
    await deliver(t, { type: "payment.succeeded", data: { id: "pay_fail", variant_id: COMMISSION_PLAN, metadata: { kind: "commission", deviceId: DEVICE, commissionId: res.commissionId } } });
    await settle(t, 5000);
    expect((await t.query(api.commissions.mine, { deviceId: DEVICE }))[0].status).toBe("refunded");
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/payments/pay_fail/refund"))).toBe(true);
  });
});

describe("Plus", () => {
  test("a Plus payment writes the entitlement from the membership; failure and deactivation end it", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.billing.status, { deviceId: DEVICE })).toMatchObject({ plus: false, freeDrawsLeftToday: 1, freezesLeftThisWeek: 0 });
    const checkout = await t.action(api.billing.startPlusCheckout, { deviceId: DEVICE });
    expect(checkout.ok).toBe(true);
    expect(calls[0].body).toMatchObject({ variant_id: PLUS_PLAN, metadata: { kind: "plus", deviceId: DEVICE } });
    expect((await t.query(api.billing.status, { deviceId: DEVICE })).plus).toBe(false);

    await deliver(t, { type: "payment.succeeded", data: { id: "pay_p1", variant_id: PLUS_PLAN, membership_id: "mem_p1", metadata: { kind: "plus", deviceId: DEVICE } } });
    await settle(t, 2000);
    expect(calls.some((c) => c.method === "GET" && c.url.endsWith("/memberships/mem_p1"))).toBe(true);
    expect(await t.query(api.billing.status, { deviceId: DEVICE })).toMatchObject({ plus: true, plusUntil: periodEnd, freeDrawsLeftToday: null, freezesLeftThisWeek: 1 });
    expect(await t.action(api.billing.startPlusCheckout, { deviceId: DEVICE })).toEqual({ ok: false, reason: "already_plus" });

    await deliver(t, { type: "payment.failed", data: { id: "pay_p2", membership_id: "mem_p1", metadata: { kind: "plus", deviceId: DEVICE } } });
    await settle(t, 2000);
    expect((await t.query(api.billing.status, { deviceId: DEVICE })).plus).toBe(false);

    await deliver(t, { type: "membership.updated", data: { id: "mem_p1", status: "active", current_period_end: new Date(periodEnd).toISOString(), metadata: {} } });
    await settle(t, 2000);
    expect((await t.query(api.billing.status, { deviceId: DEVICE })).plus).toBe(true);

    await deliver(t, { type: "membership.deactivated", data: { id: "mem_p1", status: "expired", metadata: {} } });
    await settle(t, 2000);
    expect((await t.query(api.billing.status, { deviceId: DEVICE })).plus).toBe(false);
  });

  test("Plus ends by itself when the period runs out", async () => {
    const t = convexTest(schema, modules);
    await grantPlus(t);
    expect((await t.query(api.billing.status, { deviceId: DEVICE })).plus).toBe(true);
    vi.setSystemTime(periodEnd + 1000);
    expect((await t.query(api.billing.status, { deviceId: DEVICE })).plus).toBe(false);
  });

  test("a membership on another plan does not grant Plus", async () => {
    const t = convexTest(schema, modules);
    await deliver(t, {
      type: "membership.activated",
      data: { id: "mem_other", status: "active", variant_id: "plan_someone_else", current_period_end: new Date(periodEnd).toISOString(), metadata: { kind: "plus", deviceId: DEVICE } },
    });
    await settle(t, 2000);
    expect((await t.query(api.billing.status, { deviceId: DEVICE })).plus).toBe(false);
  });

  test("a paper membership unlocks that paper only", async () => {
    const t = convexTest(schema, modules);
    const paperId = await t.run(async (ctx) =>
      ctx.db.insert("papers", { deviceId: OTHER, name: "Founder Daily", niche: "startups", priceUsd: 3, status: "live", planId: "plan_paper", productId: "prod_p", purchaseUrl: "https://sandbox.whop.com/checkout/plan_paper", createdAt: Date.now() }),
    );
    await deliver(t, {
      type: "membership.activated",
      data: { id: "mem_paper", status: "active", variant_id: "plan_paper", current_period_end: new Date(periodEnd).toISOString(), metadata: { kind: "paper", deviceId: DEVICE, paperId } },
    });
    await settle(t, 2000);
    const rows = await t.query(internal.billing.entitlementsFor, { deviceId: DEVICE });
    expect(rows).toEqual([{ kind: "paper", membershipId: "mem_paper", status: "active", periodEnd }]);
    expect((await t.query(api.billing.status, { deviceId: DEVICE })).plus).toBe(false);
  });
});

describe("combo pays for Plus", () => {
  test("refused for a reader without Plus", async () => {
    const t = convexTest(schema, modules);
    expect(await t.action(api.billing.claimComboReward, { deviceId: DEVICE, comboDays: 7 })).toEqual({ ok: false, reason: "not_plus" });
    expect(calls.filter((c) => c.url.includes("/extend"))).toHaveLength(0);
  });

  test("each milestone pays one day once, at most once per 6 days", async () => {
    const t = convexTest(schema, modules);
    await grantPlus(t);
    const start = periodEnd;
    expect(await t.action(api.billing.claimComboReward, { deviceId: DEVICE, comboDays: 6 })).toEqual({ ok: false, reason: "not_milestone" });
    expect(await t.action(api.billing.claimComboReward, { deviceId: DEVICE, comboDays: 7 })).toEqual({ ok: true, periodEnd: start + DAY, freeDaysEarned: 1 });
    expect(calls.find((c) => c.url.endsWith("/memberships/mem_plus1/extend"))?.body).toEqual({ days: 1 });
    expect(await t.action(api.billing.claimComboReward, { deviceId: DEVICE, comboDays: 7 })).toEqual({ ok: false, reason: "already_claimed" });
    expect(await t.action(api.billing.claimComboReward, { deviceId: DEVICE, comboDays: 14 })).toEqual({ ok: false, reason: "too_soon" });
    vi.advanceTimersByTime(7 * DAY);
    expect(await t.action(api.billing.claimComboReward, { deviceId: DEVICE, comboDays: 14 })).toEqual({ ok: true, periodEnd: start + 2 * DAY, freeDaysEarned: 2 });
    expect(calls.filter((c) => c.url.includes("/extend"))).toHaveLength(2);
    expect(await t.query(api.billing.status, { deviceId: DEVICE })).toMatchObject({ plusUntil: start + 2 * DAY, freeDaysEarned: 2 });
  });

  test("a failed extend call does not use up the milestone", async () => {
    const t = convexTest(schema, modules);
    await grantPlus(t);
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "nope" } }, 400)));
    expect(await t.action(api.billing.claimComboReward, { deviceId: DEVICE, comboDays: 7 })).toEqual({ ok: false, reason: "unavailable" });
    vi.stubGlobal("fetch", vi.fn(fakeWhop));
    expect((await t.action(api.billing.claimComboReward, { deviceId: DEVICE, comboDays: 7 })).ok).toBe(true);
  });
});

describe("free draws and freezes", () => {
  test("one free draw a day, reset at Pacific midnight; Plus is unlimited", async () => {
    const t = convexTest(schema, modules);
    vi.setSystemTime(new Date("2026-11-16T07:30:00Z"));
    expect(await t.mutation(internal.billing.claimFreeDraw, { deviceId: DEVICE })).toBe("free");
    expect(await t.mutation(internal.billing.claimFreeDraw, { deviceId: DEVICE })).toBe("needs_plus");
    expect((await t.query(api.billing.status, { deviceId: DEVICE })).freeDrawsLeftToday).toBe(0);
    expect(await t.action(api.pipeline.drawFreshOne, { deviceId: DEVICE, secret: "demo" })).toEqual({ ok: false, reason: "needs_plus" });
    vi.setSystemTime(new Date("2026-11-16T08:00:01Z"));
    expect((await t.query(api.billing.status, { deviceId: DEVICE })).freeDrawsLeftToday).toBe(1);
    expect(await t.mutation(internal.billing.claimFreeDraw, { deviceId: DEVICE })).toBe("free");
    await grantPlus(t);
    expect(await t.mutation(internal.billing.claimFreeDraw, { deviceId: DEVICE })).toBe("plus");
  });

  test("a draw that does not start gives the free draw back", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.pipeline.reserveImages, { date: pacificDate(Date.now()), count: imageCap() - 1 });
    expect(await t.action(api.pipeline.drawFreshOne, { deviceId: DEVICE, secret: "demo" })).toEqual({ ok: false, reason: "spend_cap" });
    expect((await t.query(api.billing.status, { deviceId: DEVICE })).freeDrawsLeftToday).toBe(1);
  });

  test("Plus forgives one missed day a week", async () => {
    const t = convexTest(schema, modules);
    vi.setSystemTime(new Date("2026-11-18T20:00:00Z"));
    const today = pacificDate(Date.now());
    expect(await t.mutation(api.billing.useFreeze, { deviceId: DEVICE, day: addDays(today, -1) })).toEqual({ ok: false, reason: "not_plus" });
    await grantPlus(t);
    expect(await t.mutation(api.billing.useFreeze, { deviceId: DEVICE, day: today })).toEqual({ ok: false, reason: "bad_day" });
    expect(await t.mutation(api.billing.useFreeze, { deviceId: DEVICE, day: addDays(today, -1) })).toEqual({ ok: true });
    expect(await t.mutation(api.billing.useFreeze, { deviceId: DEVICE, day: addDays(today, -1) })).toEqual({ ok: true });
    expect((await t.query(api.billing.status, { deviceId: DEVICE })).freezesLeftThisWeek).toBe(0);
  });
});

describe("locked archive", () => {
  async function withOldIssue(t: T) {
    await t.action(internal.seed.run, { fast: true });
    const old = addDays(pacificDate(Date.now()), -5);
    await t.run(async (ctx) => {
      const source = (await ctx.db.query("comics").first())!;
      const editionId = await ctx.db.insert("editions", { date: old, number: 0, status: "published", createdAt: Date.now() });
      const { _id, _creationTime, ...rest } = source;
      void _id;
      void _creationTime;
      await ctx.db.insert("comics", { ...rest, editionId, storyId: undefined });
    });
    return old;
  }

  test("free readers see today and yesterday; the rest is locked", async () => {
    const t = convexTest(schema, modules);
    const old = await withOldIssue(t);
    const list = await t.query(api.editions.list, { deviceId: DEVICE });
    expect(list.map((e) => !!e.locked)).toEqual([false, false, true]);
    const locked = (await t.query(api.editions.byDate, { date: old, deviceId: DEVICE }))!;
    expect(locked).toMatchObject({ date: old, locked: true, comics: [] });
    expect((await t.query(api.editions.byDate, { date: old }))!.locked).toBe(true);
  });

  test("Plus opens the whole archive", async () => {
    const t = convexTest(schema, modules);
    const old = await withOldIssue(t);
    await grantPlus(t);
    const list = await t.query(api.editions.list, { deviceId: DEVICE });
    expect(list.every((e) => !e.locked)).toBe(true);
    const issue = (await t.query(api.editions.byDate, { date: old, deviceId: DEVICE }))!;
    expect(issue.locked).toBeUndefined();
    expect(issue.comics).toHaveLength(1);
  });
});

describe("sandbox guard", () => {
  test("no checkout, extend or commission outside the sandbox", async () => {
    const t = convexTest(schema, modules);
    await grantPlus(t);
    process.env.WHOP_ENVIRONMENT = "production";
    expect(await t.action(api.billing.startPlusCheckout, { deviceId: OTHER })).toEqual({ ok: false, reason: "unavailable" });
    expect(await t.action(api.commissions.start, { deviceId: DEVICE, topic: "a robot learns to fold laundry" })).toEqual({ ok: false, reason: "unavailable" });
    expect(await t.action(api.billing.claimComboReward, { deviceId: DEVICE, comboDays: 7 })).toEqual({ ok: false, reason: "unavailable" });
    delete process.env.WHOP_ENVIRONMENT;
    expect(await t.action(api.billing.startPlusCheckout, { deviceId: OTHER })).toEqual({ ok: false, reason: "unavailable" });
    expect(calls).toHaveLength(0);
    expect(await t.run(async (ctx) => ctx.db.query("commissions").collect())).toHaveLength(0);
  });
});

void (null as unknown as Id<"papers">);
