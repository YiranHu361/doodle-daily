import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { noticeOutcome, parseToolPath, splitRequest, TEXTS_PER_DAY } from "./keiki";
import schema from "./schema";
import { setProvidersForTests } from "./providers";
import { modules } from "./test.setup";

const SECRET = "keiki-test-secret-0123456789abcdef";
const PHONE = "+15555550100";
const AGENT = "agent-test-1";

type T = ReturnType<typeof convexTest>;
type Call = { url: string; body: unknown };

let notices: Call[] = [];
let pages: Record<string, string> = {};

beforeEach(() => {
  vi.useFakeTimers();
  process.env.MOCK_IMAGE_DELAY_MS = "0";
  process.env.KEIKI_TOOL_SECRET = SECRET;
  process.env.KEIKI_API_KEY = "sk_test_fake";
  process.env.KEIKI_AGENT_ID = AGENT;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.DAILY_IMAGE_CAP;
  setProvidersForTests({});
  notices = [];
  pages = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://onkeiki.com/")) {
        notices.push({ url, body: JSON.parse(String(init?.body ?? "null")) });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const html = pages[url];
      return html ? new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }) : new Response("nope", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  setProvidersForTests({});
  vi.useRealTimers();
});

async function callTool(t: T, tool: string, input: Record<string, unknown>, opts: { secret?: string; phone?: string } = {}) {
  const res = await t.fetch(`/keiki/${opts.secret ?? SECRET}/${tool}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, context: { phone: opts.phone ?? PHONE, userId: "user-1" } }),
  });
  return { status: res.status, body: res.status === 200 ? await res.json() : await res.text() };
}

async function settleAll(t: T, maxMs = 60_000) {
  for (let elapsed = 0; elapsed < maxMs; elapsed += 500) {
    await t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(500);
  }
  await t.finishInProgressScheduledFunctions();
}

describe("keiki tool endpoint", () => {
  test("refuses a request without the right secret", async () => {
    const t = convexTest(schema, modules);
    expect((await callTool(t, "commission", { request: "coffee prices" }, { secret: "wrong-secret-0123456789abcdef" })).status).toBe(404);
    expect((await callTool(t, "today", {}, { secret: SECRET.slice(0, -1) })).status).toBe(404);
    process.env.KEIKI_TOOL_SECRET = "short";
    expect((await callTool(t, "today", {}, { secret: "short" })).status).toBe(404);
    expect(await t.run((ctx) => ctx.db.query("textCommissions").collect())).toHaveLength(0);
  });

  test("limits each sender to two comics a day", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < TEXTS_PER_DAY; i++) {
      expect((await callTool(t, "commission", { request: `coffee prices ${i}` })).body).toMatchObject({ ok: true, status: "drawing" });
    }
    const third = await callTool(t, "commission", { request: "coffee prices again" });
    expect(third.body).toMatchObject({ ok: false, reason: "limit", reply: expect.stringMatching(/tomorrow/) });
    expect((await callTool(t, "commission", { request: "coffee prices" }, { phone: "+15555550199" })).body).toMatchObject({ ok: true });
  });

  test("counts pictures against the daily image cap", async () => {
    process.env.DAILY_IMAGE_CAP = "3";
    const t = convexTest(schema, modules);
    const res = await callTool(t, "commission", { request: "the new bakery on Main Street" });
    expect(res.body).toMatchObject({ ok: false, reason: "spend_cap", reply: expect.stringMatching(/crayon box/) });
    expect(await t.run((ctx) => ctx.db.query("textCommissions").collect())).toHaveLength(0);
  });

  test("refuses unsafe stories, from a topic or a linked page", async () => {
    const t = convexTest(schema, modules);
    expect((await callTool(t, "commission", { request: "the murder trial downtown" })).body).toMatchObject({ ok: false, reason: "unsafe" });
    pages["https://news.example.com/story"] = `<html><head><title>Pop star's secret affair revealed</title></head></html>`;
    expect((await callTool(t, "commission", { request: "https://news.example.com/story" })).body).toMatchObject({ ok: false, reason: "unsafe" });
    expect((await callTool(t, "commission", { request: "Senator Jane Smith indicted for fraud" })).body).toMatchObject({ ok: false, reason: "needs_source", reply: expect.stringMatching(/link/) });
    pages["https://news.example.com/indicted"] = `<html><head><title>Senator Jane Smith indicted for fraud</title></head></html>`;
    expect((await callTool(t, "commission", { request: "https://news.example.com/indicted" })).body).toMatchObject({ ok: true });
    expect((await callTool(t, "commission", { request: "https://news.example.com/missing" })).body).toMatchObject({ ok: false, reason: "bad_link" });
    const wsj = "https://www.wsj.com/business/nvidia-is-preparing-to-oust-nvidia-ceo-jensen-huang-30f421ad?mod=e2tw";
    expect((await callTool(t, "commission", { request: wsj })).body).toMatchObject({ ok: true });
    const texted = (await t.run((ctx) => ctx.db.query("textCommissions").collect())).find((row) => row.link === wsj);
    expect(texted).toMatchObject({
      headline: "Nvidia is preparing to oust nvidia ceo jensen huang",
      facts: ["A link a reader pasted from The Wall Street Journal is titled: Nvidia is preparing to oust nvidia ceo jensen huang. Doodle Daily could not open the article to check it."],
      unverified: true,
    });
    expect((await callTool(t, "commission", { request: "   " })).body).toMatchObject({ ok: false, reason: "bad_input" });
  });

  test("a texted link moves from drawing to ready and notifies the agent", async () => {
    const t = convexTest(schema, modules);
    pages["https://news.example.com/coffee"] = `<html><head><meta property="og:title" content="Coffee prices hit a record high"><meta name="description" content="Beans cost more than ever this week."></head></html>`;
    const start = await callTool(t, "commission", { request: "draw this https://news.example.com/coffee." });
    expect(start.body).toMatchObject({ ok: true, status: "drawing" });
    const id = (start.body as { commission_id: string }).commission_id;
    expect((await callTool(t, "status", { commission_id: id })).body).toMatchObject({ status: "drawing" });

    await settleAll(t);
    const ready = (await callTool(t, "status", { commission_id: id })).body as { status: string; panels: { imageUrl: string; caption: string }[]; sourceUrl: string; appLink: string; realStory: string };
    expect(ready.status).toBe("ready");
    expect(ready.panels).toHaveLength(4);
    for (const p of ready.panels) {
      expect(p.imageUrl).toMatch(/^https?:\/\//);
      expect(p.caption.length).toBeGreaterThan(0);
    }
    expect(ready.sourceUrl).toBe("https://news.example.com/coffee");
    expect(ready.realStory.length).toBeGreaterThan(0);
    expect(ready.appLink).toMatch(/^doodledaily:\/\/reader\//);

    expect(notices).toHaveLength(1);
    expect(notices[0].url).toBe(`https://onkeiki.com/api/v1/developer/agents/${AGENT}/notice`);
    expect(notices[0].body).toMatchObject({ phone: PHONE, text: expect.stringContaining(id) });

    expect((await callTool(t, "status", { commission_id: id }, { phone: "+15555550199" })).body).toMatchObject({ status: "not_found" });
    expect((await callTool(t, "status", {})).body).toMatchObject({ status: "ready", sourceUrl: "https://news.example.com/coffee" });
  });

  test("a failed draw ends as failed with a friendly reason and still notifies", async () => {
    const t = convexTest(schema, modules);
    const start = await callTool(t, "commission", { request: "coffee prices" });
    const id = (start.body as { commission_id: string }).commission_id;
    await t.mutation(internal.keiki.fail, { commissionId: id as never, reason: "bad_script", error: "test" });
    await settleAll(t, 2_000);
    expect((await callTool(t, "status", { commission_id: id })).body).toMatchObject({ status: "failed", reason: expect.stringMatching(/crayon snapped/) });
    expect(notices).toHaveLength(1);
  });

  test("today returns the lead comic in the ready shape", async () => {
    const t = convexTest(schema, modules);
    expect((await callTool(t, "today", {})).body).toMatchObject({ status: "failed" });
    await callTool(t, "commission", { request: "coffee prices hit a record high" });
    await settleAll(t);
    expect((await callTool(t, "today", {})).body).toMatchObject({ status: "failed" });
    const [texted] = await t.run((ctx) => ctx.db.query("comics").collect());
    expect(texted).toMatchObject({ kind: "commission", owner: `text:${PHONE}` });
    await t.action(internal.pipeline.drawFromBrief, {
      headline: "Coffee prices hit a record high",
      facts: ["Coffee prices hit a record high this week.", "Beans cost more than ever."],
      sourceName: "Example News",
      sourceUrl: "https://news.example.com/coffee",
      kind: "news",
    });
    await settleAll(t);
    const today = (await callTool(t, "today", {})).body as { status: string; title: string; panels: unknown[]; appLink: string };
    expect(today.status).toBe("ready");
    expect(today.panels).toHaveLength(4);
    expect(today.title.length).toBeGreaterThan(0);
    expect(today.appLink).toMatch(/^doodledaily:\/\/reader\//);
  });
});

describe("keiki helpers", () => {
  test("splits a texted link from the words around it", () => {
    expect(splitRequest("look at this https://a.example.com/x?y=1).")).toEqual({ link: "https://a.example.com/x?y=1", topic: "look at this" });
    expect(splitRequest("  the Fed   meeting ")).toEqual({ link: null, topic: "the Fed meeting" });
  });

  test("reads the notice outcome for the one conversation", () => {
    expect(noticeOutcome(JSON.stringify({ ok: true, results: [{ phone: "+1555", outcome: "unavailable" }] }))).toBe("unavailable");
    expect(noticeOutcome(JSON.stringify({ ok: true, results: [{ outcome: "ran" }] }))).toBe("ran");
    expect(noticeOutcome("not json")).toBeNull();
  });

  test("reads the secret and tool from the path", () => {
    expect(parseToolPath("/keiki/abc/commission")).toEqual({ secret: "abc", tool: "commission" });
    expect(parseToolPath("/keiki/abc")).toBeNull();
    expect(parseToolPath("/keiki/abc/def/status")).toBeNull();
  });
});
