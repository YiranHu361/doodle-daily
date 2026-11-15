import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { REVEAL_DELAY_MS } from "./freshPool";
import { pacificDate } from "./lib/dates";
import { SLOW_NEWS_SOURCE } from "./pipeline";
import { setProvidersForTests } from "./providers";

const SECRET = "test-demo-secret";
const DEVICE = "device-1234-abcd";
const DAY_MS = 24 * 60 * 60 * 1000;

type T = ReturnType<typeof convexTest>;
let fetched: string[] = [];
let feeds: Record<string, string> = {};

beforeEach(() => {
  vi.useFakeTimers();
  process.env.MOCK_IMAGE_DELAY_MS = "0";
  process.env.DEMO_SECRET = SECRET;
  delete process.env.DEMO_MODE;
  delete process.env.FRESH_POOL_SIZE;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.DAILY_IMAGE_CAP;
  setProvidersForTests({});
  fetched = [];
  feeds = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      fetched.push(url);
      const body = feeds[url];
      return body ? new Response(body, { status: 200, headers: { "Content-Type": "application/rss+xml" } }) : new Response("nope", { status: 404 });
    }),
  );
});

afterEach(() => {
  setProvidersForTests({});
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const HEADLINES = ["Robot vacuum learns to climb stairs", "Bank opens branch on a train", "Museum hangs a painting upside down", "Orchestra plays for a room of cats", "Tiny phone folds into a cube"];

async function addStories(t: T, headlines = HEADLINES, age = 0) {
  await t.run(async (ctx) => {
    for (const [i, headline] of headlines.entries()) {
      await ctx.db.insert("stories", {
        section: (["tech", "money", "culture"] as const)[i % 3],
        kind: "news",
        headline,
        facts: [`${headline}, according to a report.`],
        itemIds: [],
        sourceName: "Example",
        sourceUrl: `https://example.com/${i}`,
        score: 5,
        used: false,
        createdAt: Date.now() - age - i,
      });
    }
  });
}

async function settleAll(t: T, maxMs: number) {
  for (let elapsed = 0; elapsed < maxMs; elapsed += 500) {
    await t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(500);
  }
  await t.finishInProgressScheduledFunctions();
}

async function fillPool(t: T) {
  await addStories(t);
  const res = await t.action(internal.freshPool.topUp, {});
  expect(res.started).toBe(3);
  await settleAll(t, 5_000);
  expect(await t.query(internal.freshPool.status, {})).toMatchObject({ size: 3, ready: 3, drawing: 0 });
}

const draw = (t: T) => t.action(api.pipeline.drawFreshOne, { deviceId: DEVICE, secret: SECRET });

async function todayIds(t: T): Promise<string[]> {
  return ((await t.query(api.editions.today, {}))?.comics ?? []).map((c) => c._id);
}

async function scheduled(t: T): Promise<string[]> {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((j) => j.state.kind === "pending").map((j) => j.name);
}

describe("freshPool", () => {
  test("pooled comics never leak into editions, voice, reactions or Keiki today", async () => {
    const t = convexTest(schema, modules);
    await fillPool(t);
    const pooled = await t.run((ctx) => ctx.db.query("comics").collect());
    expect(pooled).toHaveLength(3);
    expect(pooled.every((c) => c.pooled === true && c.status === "ready")).toBe(true);
    expect(await t.query(api.editions.today, {})).toBeNull();
    expect(await t.query(api.editions.list, {})).toEqual([]);
    expect(await t.query(api.editions.byDate, { date: (await t.run((ctx) => ctx.db.get(pooled[0].editionId)))!.date })).toBeNull();
    expect(await t.query(api.voice.forComic, { comicId: pooled[0]._id })).toEqual({ panels: [null, null, null, null], realStory: null });
    await expect(t.mutation(api.reactions.toggle, { comicId: pooled[0]._id, deviceId: DEVICE, kind: "lol" })).rejects.toThrow(/comic_not_found/);
    expect(await t.query(internal.keiki.lead, {})).toBeNull();
  });

  test("two concurrent claims never take the same comic", async () => {
    process.env.FRESH_POOL_SIZE = "1";
    const t = convexTest(schema, modules);
    await addStories(t);
    await t.action(internal.freshPool.topUp, {});
    await settleAll(t, 5_000);
    const [a, b] = await Promise.all([t.mutation(internal.freshPool.claim, {}), t.mutation(internal.freshPool.claim, {})]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  test("two concurrent presses in demo mode get different comics", async () => {
    process.env.DEMO_MODE = "1";
    const t = convexTest(schema, modules);
    await fillPool(t);
    const [a, b] = await Promise.all([draw(t), draw(t)]);
    expect(a.ok && b.ok).toBe(true);
    const ids = [a, b].map((r) => (r as { comicId: Id<"comics"> }).comicId);
    expect(new Set(ids).size).toBe(2);
    const claimed = await t.run((ctx) => Promise.all(ids.map((id) => ctx.db.get(id))));
    expect(claimed.every((c) => c?.pooled === true && c.revealAt !== undefined)).toBe(true);
  });

  test("a claimed comic stays invisible until the reveal, then leads today's issue as new", async () => {
    process.env.DEMO_MODE = "1";
    const t = convexTest(schema, modules);
    await fillPool(t);
    const claimedAt = Date.now();
    const res = await draw(t);
    expect(res.ok).toBe(true);
    const comicId = (res as { comicId: Id<"comics"> }).comicId;
    expect(Date.now() - claimedAt).toBeLessThan(REVEAL_DELAY_MS);
    vi.advanceTimersByTime(REVEAL_DELAY_MS - 100);
    await t.finishInProgressScheduledFunctions();
    expect(await todayIds(t)).not.toContain(comicId);
    vi.advanceTimersByTime(200);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const today = (await t.query(api.editions.today, {}))!;
    expect(today.comics[0]).toMatchObject({ _id: comicId, isNew: true, status: "ready" });
    expect(today.comics[0].createdAt).toBeGreaterThanOrEqual(claimedAt + REVEAL_DELAY_MS);
    expect(today.status).toBe("published");
  });

  test("a claim schedules a refill that brings the pool back to full", async () => {
    process.env.DEMO_MODE = "1";
    const t = convexTest(schema, modules);
    await fillPool(t);
    await draw(t);
    expect(await scheduled(t)).toEqual(expect.arrayContaining(["freshPool:topUp", "freshPool:reveal"]));
    await settleAll(t, 10_000);
    expect(await t.query(internal.freshPool.status, {})).toMatchObject({ ready: 3, revealing: 0 });
  });

  test("normal mode: one free draw a day, and the pool claim holds the busy lock until the reveal", async () => {
    const t = convexTest(schema, modules);
    await fillPool(t);
    expect((await draw(t)).ok).toBe(true);
    await settleAll(t, 10_000);
    expect(await draw(t)).toEqual({ ok: false, reason: "needs_plus" });
    const plus = "device-plus-5678";
    await t.run((ctx) => ctx.db.insert("entitlements", { deviceId: plus, kind: "plus", membershipId: "mem_test", status: "active", since: Date.now(), updatedAt: Date.now() }));
    expect((await t.action(api.pipeline.drawFreshOne, { deviceId: plus, secret: SECRET })).ok).toBe(true);
    expect(await t.action(api.pipeline.drawFreshOne, { deviceId: plus, secret: SECRET })).toEqual({ ok: false, reason: "busy" });
    await settleAll(t, 10_000);
    expect((await t.action(api.pipeline.drawFreshOne, { deviceId: plus, secret: SECRET })).ok).toBe(true);
  });

  test("demo mode lifts the daily limit and serves three presses in a row from the pool", async () => {
    process.env.DEMO_MODE = "1";
    const t = convexTest(schema, modules);
    await fillPool(t);
    const results = [await draw(t), await draw(t), await draw(t)];
    expect(results.every((r) => r.ok)).toBe(true);
    await settleAll(t, 10_000);
    expect(await todayIds(t)).toEqual([(results[2] as { comicId: string }).comicId]);
    expect((await draw(t)).ok).toBe(true);
  });
});

const PANEL = { scene: "Robo waves.", caption: "Robo waves.", cast: ["Robo"] };

async function seedToday(t: T, comics: Partial<Doc<"comics">>[]): Promise<Id<"comics">[]> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const editionId = await ctx.db.insert("editions", { date: pacificDate(now), number: 1, status: "published", createdAt: now });
    const ids: Id<"comics">[] = [];
    for (const [i, extra] of comics.entries()) {
      ids.push(
        await ctx.db.insert("comics", {
          editionId,
          section: "tech",
          kind: "news",
          title: `Seeded comic ${i}`,
          realStory: "Seeded.",
          sourceName: "Example",
          sourceUrl: `https://example.com/seeded/${i}`,
          status: "ready",
          order: i,
          createdAt: now,
          deadline: now + DAY_MS,
          panels: [PANEL, PANEL, PANEL, PANEL],
          ...extra,
        }),
      );
    }
    return ids;
  });
}

const comicIdOf = (res: Awaited<ReturnType<typeof draw>>) => {
  expect(res.ok).toBe(true);
  return (res as { comicId: Id<"comics"> }).comicId;
};

describe("Draw a fresh one replaces the top comic", () => {
  test("the revealed comic takes the lead's place; the old lead leaves Today but stays readable by id", async () => {
    process.env.DEMO_MODE = "1";
    const t = convexTest(schema, modules);
    const seeded = await seedToday(t, [{}, {}, {}]);
    await fillPool(t);
    expect(await todayIds(t)).toEqual(seeded);
    const fresh = comicIdOf(await draw(t));
    await settleAll(t, 10_000);
    expect(await todayIds(t)).toEqual([fresh, seeded[1], seeded[2]]);
    const date = pacificDate(Date.now());
    expect((await t.query(api.editions.byDate, { date }))!.comics).toHaveLength(3);
    expect((await t.query(api.editions.list, {}))[0].comicCount).toBe(3);
    const old = (await t.run((ctx) => ctx.db.get(seeded[0])))!;
    expect(old.replacedAt).toBeDefined();
    expect(old.hidden).toBeUndefined();
    await t.mutation(api.reactions.toggle, { comicId: seeded[0], deviceId: DEVICE, kind: "lol" });
    expect(await t.query(api.reactions.counts, { comicId: seeded[0], deviceId: DEVICE })).toMatchObject({ lol: 1, mine: "lol" });
  });

  test("three draws in a row keep the count unchanged, each new comic replacing the last", async () => {
    process.env.DEMO_MODE = "1";
    const t = convexTest(schema, modules);
    const seeded = await seedToday(t, [{}, {}, {}]);
    await fillPool(t);
    for (let i = 0; i < 3; i++) {
      const fresh = comicIdOf(await draw(t));
      await settleAll(t, 10_000);
      expect(await todayIds(t)).toEqual([fresh, seeded[1], seeded[2]]);
    }
  });

  test("an owned, commission or sponsored comic on top is never replaced; the first replaceable one below is", async () => {
    process.env.DEMO_MODE = "1";
    const t = convexTest(schema, modules);
    const seeded = await seedToday(t, [{ sponsored: true }, { kind: "commission", owner: DEVICE }, { owner: DEVICE }, {}, {}]);
    await fillPool(t);
    const fresh = comicIdOf(await draw(t));
    await settleAll(t, 10_000);
    const ids = ((await t.query(api.editions.today, { deviceId: DEVICE }))?.comics ?? []).map((c) => c._id);
    expect(ids).toEqual([seeded[0], seeded[1], seeded[2], fresh, seeded[4]]);
    const kept = await t.run((ctx) => Promise.all(seeded.slice(0, 3).map((id) => ctx.db.get(id))));
    expect(kept.every((c) => c?.replacedAt === undefined)).toBe(true);
  });

  test("with an empty pool the live draw lands in the lead slot at once", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedToday(t, [{}, {}]);
    await addStories(t, ["Bank opens branch on a train"]);
    const fresh = comicIdOf(await draw(t));
    expect(await todayIds(t)).toEqual([fresh, seeded[1]]);
    await settleAll(t, 10_000);
    expect(await todayIds(t)).toEqual([fresh, seeded[1]]);
  });

  test("the slow-news-day fallback lands in the lead slot too", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedToday(t, [{}, {}]);
    const fresh = comicIdOf(await draw(t));
    await settleAll(t, 10_000);
    expect(await todayIds(t)).toEqual([fresh, seeded[1]]);
    expect((await t.run((ctx) => ctx.db.get(fresh)))!.sourceName).toBe(SLOW_NEWS_SOURCE);
  });

  test("a live draw that fails gives the lead back", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedToday(t, [{}, {}]);
    await addStories(t, ["Bank opens branch on a train"]);
    const fresh = comicIdOf(await draw(t));
    await t.run((ctx) => ctx.db.patch(fresh, { deadline: Date.now() - 1 }));
    await t.mutation(internal.pipeline.checkDeadline, { comicId: fresh });
    expect(await todayIds(t)).toEqual(seeded);
  });
});

describe("drawFreshOne never says no_story", () => {
  async function landed(t: T, res: Awaited<ReturnType<typeof draw>>) {
    expect(res.ok).toBe(true);
    await settleAll(t, 10_000);
    return (await t.run((ctx) => ctx.db.get((res as { comicId: Id<"comics"> }).comicId)))!;
  }

  test("widens to unused stories from the last 7 days before any ingest", async () => {
    const t = convexTest(schema, modules);
    await addStories(t, ["Bank opens branch on a train"], 3 * DAY_MS);
    const comic = await landed(t, await draw(t));
    expect(comic.sourceUrl).toBe("https://example.com/0");
    expect(fetched).toEqual([]);
  });

  test("then runs a fresh ingest and retries once", async () => {
    const t = convexTest(schema, modules);
    await addStories(t, ["Bank opens branch on a train"], 8 * DAY_MS);
    feeds["https://www.techmeme.com/feed.xml"] =
      `<rss><channel><item><title>Smart fridge orders too much cheese</title><link>https://example.org/fridge</link><description>The fridge ordered forty wheels of cheese, the company said.</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
    const comic = await landed(t, await draw(t));
    expect(fetched).toContain("https://www.techmeme.com/feed.xml");
    expect(comic.sourceUrl).toBe("https://example.org/fridge");
  });

  test("last resort is a Slow news day comic with no source link", async () => {
    const t = convexTest(schema, modules);
    const comic = await landed(t, await draw(t));
    expect(fetched.length).toBeGreaterThan(0);
    expect(comic).toMatchObject({ sourceName: SLOW_NEWS_SOURCE, sourceUrl: "", status: "ready", section: "culture" });
  });
});
