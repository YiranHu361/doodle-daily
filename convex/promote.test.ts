import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { pacificDate } from "./lib/dates";
import { signWebhook } from "./lib/webhook";
import { setProvidersForTests } from "./providers";
import { mockScriptProvider } from "./providers/mockScript";
import { LIMITS, MAX_QUESTIONS } from "./promote";

const SECRET = "ws_test_secret_value";
const DEVICE = "device-1234-abcd";
const COMMISSION_PLAN = "plan_commission_test";
const PROMO_PLAN = "plan_promo_test";
const PRODUCT_URL = "https://acmenotes.app/launch";
const SITE = "acmenotes.app";
const DEAD_URL = "https://gone.example.com/launch";
const PRODUCT_PAGE =
  '<html><head><meta property="og:site_name" content="Acme Notes"><title>Acme Notes 2.0 is here</title><meta name="description" content="The note app for founders."></head><body><h1>Acme Notes 2.0</h1><p>Acme Notes now has 40,000 users and syncs offline on every phone. Try the beta today.</p></body></html>';
const BRIEF = { name: "Acme Notes", pitch: "A note app for founders, now with offline sync.", claims: ["Has 40,000 users", "Won an Apple Design Award"], cta: "Try the beta" };

type T = ReturnType<typeof convexTest>;
type Call = { url: string; body: unknown };
let calls: Call[] = [];
let modelCalls = 0;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function claude(obj: unknown) {
  return json({ content: [{ type: "text", text: JSON.stringify(obj) }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } });
}

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url === "https://api.anthropic.com/v1/messages") {
    modelCalls++;
    const body = JSON.parse(String(init?.body));
    const prompt: string = body.messages[0].content;
    if (prompt.includes("CLAIMS:")) {
      const claims = prompt.split("CLAIMS:")[1].trim().split("\n");
      return claude({ claims: claims.map((c, i) => ({ index: i + 1, backed: /40,000/.test(c) })) });
    }
    const kinds: string[] = body.output_config.format.schema.properties.kind.enum;
    if (kinds.includes("question")) return claude({ kind: "question", question: "What should readers do next", name: "", pitch: "", claims: [], cta: "" });
    return claude({ kind: "brief", question: "", ...BRIEF });
  }
  if (url === "https://api.openai.com/v1/audio/transcriptions") {
    calls.push({ url, body: null });
    return json({ text: "  We make Acme Notes, a note app for founders.  " });
  }
  if (url.endsWith("/checkout_configurations")) {
    const body = JSON.parse(String(init?.body));
    calls.push({ url, body });
    return json({ id: `ch_${calls.length}`, purchase_url: `https://sandbox.whop.com/checkout/ch_${calls.length}/` });
  }
  if (url === PRODUCT_URL) return new Response(PRODUCT_PAGE, { status: 200, headers: { "Content-Type": "text/html" } });
  return new Response("nope", { status: 404 });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T20:00:00Z"));
  calls = [];
  modelCalls = 0;
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  process.env.MOCK_IMAGE_DELAY_MS = "0";
  process.env.WHOP_ENVIRONMENT = "sandbox";
  process.env.WHOP_API_KEY = "test-key";
  process.env.WHOP_WEBHOOK_SECRET = SECRET;
  process.env.WHOP_PLAN_COMMISSION = COMMISSION_PLAN;
  process.env.WHOP_PLAN_PROMO = PROMO_PLAN;
  process.env.ANTHROPIC_API_KEY = "test-anthropic";
  process.env.OPENAI_API_KEY = "test-openai";
  process.env.IMAGE_PROVIDER = "mock";
  delete process.env.DAILY_IMAGE_CAP;
  setProvidersForTests({ script: mockScriptProvider });
});

afterEach(() => {
  setProvidersForTests({});
  delete process.env.IMAGE_PROVIDER;
  delete process.env.WHOP_PLAN_PROMO;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
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

async function pay(t: T, commissionId: string, plan = PROMO_PLAN) {
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ id, type: "payment.succeeded", data: { id: `pay_${id}`, variant_id: plan, metadata: { kind: "commission", deviceId: DEVICE, commissionId } } });
  const signature = await signWebhook(SECRET, id, timestamp, body);
  await t.fetch("/whop", { method: "POST", headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}` }, body });
}

async function seedIssue(t: T) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const editionId = await ctx.db.insert("editions", { date: pacificDate(now), number: 1, status: "published", createdAt: now, publishedAt: now });
    const panels = [0, 1, 2, 3].map(() => ({ scene: "Robo on a hill.", cast: ["Robo"], caption: "Robo waves." }));
    for (const [order, title] of [[0, "The lead"], [1, "The second"], [2, "The third"]] as const) {
      await ctx.db.insert("comics", { editionId, section: "tech", kind: "news", title, realStory: "One. Two.", sourceName: "X", sourceUrl: "https://www.npr.org/fixture", status: "ready", order, createdAt: now, deadline: now + 1e6, panels });
    }
  });
}

describe("promote:reply", () => {
  test("asks one question at a time and never more than three before the brief", async () => {
    const t = convexTest(schema, modules);
    const messages: { role: "user" | "robo"; text: string }[] = [{ role: "user", text: "Promote my note app Acme Notes" }];
    let questions = 0;
    for (;;) {
      const res = await t.action(api.promote.reply, { deviceId: DEVICE, persona: "founder", section: "tech", messages });
      if (res.kind === "question") {
        questions++;
        expect(res.text.endsWith("?")).toBe(true);
        messages.push({ role: "robo", text: res.text }, { role: "user", text: "Try the beta" });
        expect(questions).toBeLessThanOrEqual(MAX_QUESTIONS);
        continue;
      }
      expect(res).toEqual({ kind: "brief", brief: BRIEF });
      break;
    }
    expect(questions).toBe(MAX_QUESTIONS);
  });

  test("ad rules refuse without calling the model, and bad input is refused", async () => {
    const t = convexTest(schema, modules);
    for (const text of ["Promote my online casino", "Our supplement cures anxiety", "Guaranteed returns of 20% a month", "Vote for Jane in the midterms", "Our app is better than Notion, Notion sucks"]) {
      const res = await t.action(api.promote.reply, { deviceId: DEVICE, persona: "founder", section: "money", messages: [{ role: "user", text }] });
      expect(res, text).toMatchObject({ kind: "error", reason: "not_allowed" });
    }
    expect(modelCalls).toBe(0);
    expect(await t.action(api.promote.reply, { deviceId: DEVICE, persona: "creator", section: "tech", messages: [] })).toMatchObject({ kind: "error", reason: "bad_input" });
    expect(await t.action(api.promote.reply, { deviceId: DEVICE, persona: "creator", section: "tech", messages: [{ role: "robo", text: "Hi?" }] })).toMatchObject({ kind: "error", reason: "bad_input" });
  });

  test("chat turns are limited per device per day", async () => {
    const t = convexTest(schema, modules);
    const args = { deviceId: DEVICE, persona: "creator" as const, section: "culture" as const, messages: [{ role: "user" as const, text: "My cooking channel" }] };
    for (let i = 0; i < LIMITS.reply; i++) expect((await t.action(api.promote.reply, args)).kind).not.toBe("error");
    expect(await t.action(api.promote.reply, args)).toMatchObject({ kind: "error", reason: "limit" });
    expect((await t.action(api.promote.reply, { ...args, deviceId: "device-other-1234" })).kind).not.toBe("error");
  });
});

describe("promote:check and promote:start", () => {
  test("check (kept, no longer called by the app) ticks what the page says", async () => {
    const t = convexTest(schema, modules);
    const checked = await t.action(api.promote.check, { deviceId: DEVICE, link: PRODUCT_URL, brief: BRIEF });
    expect(checked).toEqual({
      kind: "checked",
      readable: true,
      site: "Acme Notes",
      claims: [
        { text: "Has 40,000 users", backed: true },
        { text: "Won an Apple Design Award", backed: false },
      ],
    });
  });

  test("start keeps every claim, never reads the page and charges the promo plan", async () => {
    const t = convexTest(schema, modules);
    const res = await t.action(api.promote.start, { deviceId: DEVICE, persona: "founder", section: "tech", brief: BRIEF, link: PRODUCT_URL });
    if (res.kind !== "checkout") throw new Error("start failed");
    expect(modelCalls).toBe(0);
    expect(vi.mocked(fetch).mock.calls.map(([u]) => String(u))).not.toContain(PRODUCT_URL);
    expect(calls.at(-1)!.body).toMatchObject({ variant_id: PROMO_PLAN, metadata: { kind: "commission", deviceId: DEVICE, commissionId: res.commissionId } });
    const row = await t.run(async (ctx) => ctx.db.get(res.commissionId as Id<"commissions">));
    expect(row!.promo).toMatchObject({ persona: "founder", section: "tech", name: "Acme Notes", claims: ["Has 40,000 users", "Won an Apple Design Award"], site: SITE, cta: "Try the beta" });
    expect(row!.facts.join(" ")).toMatch(/Apple Design Award/);
    expect(row!.unverified).toBeUndefined();
  });

  test("falls back to the commission plan when WHOP_PLAN_PROMO is unset", async () => {
    delete process.env.WHOP_PLAN_PROMO;
    const t = convexTest(schema, modules);
    const res = await t.action(api.promote.start, { deviceId: DEVICE, persona: "creator", section: "culture", brief: BRIEF, link: PRODUCT_URL });
    expect(res.kind).toBe("checkout");
    expect(calls.at(-1)!.body).toMatchObject({ variant_id: COMMISSION_PLAN });
  });

  test("start only needs a well-formed https link; an unreadable page is fine and never unverified", async () => {
    const t = convexTest(schema, modules);
    expect(await t.action(api.promote.check, { deviceId: DEVICE, link: DEAD_URL, brief: BRIEF })).toMatchObject({ kind: "checked", readable: false, site: "gone.example.com" });
    for (const link of [DEAD_URL, "http://acmenotes.app/launch", "not a link"]) {
      expect(await t.action(api.promote.start, { deviceId: DEVICE, persona: "founder", section: "money", brief: BRIEF, link })).toMatchObject({ kind: "error", reason: "bad_input" });
    }
    const dead = "https://gone-for-good.app/launch";
    const res = await t.action(api.promote.start, { deviceId: DEVICE, persona: "founder", section: "money", brief: BRIEF, link: dead });
    if (res.kind !== "checkout") throw new Error("start failed");
    await seedIssue(t);
    await pay(t, res.commissionId);
    await settle(t, 30_000);
    const today = (await t.query(api.editions.today, {}))!;
    expect(today.comics[1]).toMatchObject({ sponsored: true, unverified: false, section: "money", sourceUrl: dead, sourceName: "gone-for-good.app" });
  });

  test("ad rules refuse at start and nothing is charged", async () => {
    const t = convexTest(schema, modules);
    const bad = { ...BRIEF, claims: ["Guaranteed returns every month"] };
    expect(await t.action(api.promote.start, { deviceId: DEVICE, persona: "founder", section: "money", brief: bad, link: PRODUCT_URL })).toMatchObject({ kind: "error", reason: "not_allowed" });
    expect(await t.action(api.promote.start, { deviceId: DEVICE, persona: "founder", section: "money", brief: { ...BRIEF, pitch: "Online casino with live poker" }, link: PRODUCT_URL })).toMatchObject({
      kind: "error",
      reason: "not_allowed",
    });
    expect(calls).toHaveLength(0);
    expect(await t.run(async (ctx) => ctx.db.query("commissions").collect())).toHaveLength(0);
  });

  test("link checks are limited per device per day", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < LIMITS.check; i++) expect((await t.action(api.promote.check, { deviceId: DEVICE, link: PRODUCT_URL, brief: BRIEF })).kind).toBe("checked");
    expect(await t.action(api.promote.check, { deviceId: DEVICE, link: PRODUCT_URL, brief: BRIEF })).toMatchObject({ kind: "error", reason: "limit" });
  });
});

describe("a paid promo", () => {
  test("ends as a public sponsored comic, second in the issue; an unpaid one never appears", async () => {
    const t = convexTest(schema, modules);
    await seedIssue(t);
    const unpaid = await t.action(api.promote.start, { deviceId: DEVICE, persona: "creator", section: "culture", brief: BRIEF, link: PRODUCT_URL });
    const paid = await t.action(api.promote.start, { deviceId: DEVICE, persona: "founder", section: "memes", brief: BRIEF, link: PRODUCT_URL });
    if (paid.kind !== "checkout" || unpaid.kind !== "checkout") throw new Error("start failed");
    await pay(t, paid.commissionId);
    await settle(t, 30_000);
    const mine = await t.query(api.commissions.mine, { deviceId: DEVICE });
    expect(mine.find((m) => m._id === paid.commissionId)).toMatchObject({ status: "ready" });
    expect(mine.find((m) => m._id === unpaid.commissionId)).toMatchObject({ status: "awaiting_payment" });
    const today = (await t.query(api.editions.today, { deviceId: "device-stranger-1" }))!;
    expect(today.comics.map((c) => c.title)).toEqual(["The lead", expect.any(String), "The second", "The third"]);
    expect(today.comics[1]).toMatchObject({
      kind: "commission",
      section: "memes",
      sponsored: true,
      sponsorName: "Acme Notes",
      sponsorKind: "founder",
      ctaLabel: "Try the beta",
      sourceUrl: PRODUCT_URL,
      sourceName: SITE,
      unverified: false,
      isNew: false,
    });
    expect(today.comics[0].sponsored).toBe(false);
    const comic = await t.run(async (ctx) => ctx.db.get(today.comics[1]._id));
    expect(comic!.owner).toBeUndefined();
  });

  test("a payment on the $1 plan still pays a commission", async () => {
    const t = convexTest(schema, modules);
    const res = await t.action(api.promote.start, { deviceId: DEVICE, persona: "creator", section: "tech", brief: BRIEF, link: PRODUCT_URL });
    if (res.kind !== "checkout") throw new Error("start failed");
    await pay(t, res.commissionId, COMMISSION_PLAN);
    await settle(t, 5000);
    expect((await t.query(api.commissions.mine, { deviceId: DEVICE }))[0].status).not.toBe("awaiting_payment");
  });
});

describe("promote:transcribe", () => {
  test("transcribes a clip and deletes it; oversized clips and the daily limit are refused", async () => {
    const t = convexTest(schema, modules);
    const store = (bytes: number) => t.run(async (ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: "audio/mp4" })));
    const small = await store(1000);
    expect(await t.action(api.promote.transcribe, { deviceId: DEVICE, storageId: small })).toEqual({ kind: "text", text: "We make Acme Notes, a note app for founders." });
    expect(await t.run(async (ctx) => ctx.db.system.get(small))).toBeNull();
    const big = await store(2 * 1024 * 1024 + 1);
    expect(await t.action(api.promote.transcribe, { deviceId: DEVICE, storageId: big })).toMatchObject({ kind: "error", reason: "bad_input" });
    expect(await t.run(async (ctx) => ctx.db.system.get(big))).toBeNull();
    for (let i = 1; i < LIMITS.transcribe; i++) expect((await t.action(api.promote.transcribe, { deviceId: DEVICE, storageId: await store(10) })).kind).toBe("text");
    expect(await t.action(api.promote.transcribe, { deviceId: DEVICE, storageId: await store(10) })).toMatchObject({ kind: "error", reason: "limit" });
    expect(typeof (await t.mutation(api.promote.audioUploadUrl, { deviceId: DEVICE }))).toBe("string");
  });
});
