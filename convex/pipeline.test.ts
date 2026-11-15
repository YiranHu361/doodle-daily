import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { pacificDate } from "./lib/dates";
import { setProvidersForTests, type ImageProvider, type PanelInput } from "./providers";
import { mockImageProvider } from "./providers/mockImage";
import { COMIC_DEADLINE_MS, STORY_WINDOW_MS } from "./pipeline";

const SECRET = "test-demo-secret";
const DEVICE = "device-1234-abcd";

beforeEach(() => {
  vi.useFakeTimers();
  process.env.MOCK_IMAGE_DELAY_MS = "0";
  process.env.DEMO_SECRET = SECRET;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.DAILY_IMAGE_CAP;
  setProvidersForTests({});
});

afterEach(() => {
  setProvidersForTests({});
  vi.useRealTimers();
});

type T = ReturnType<typeof convexTest>;

const TITLES: Record<string, string[]> = {
  tech: ["Robot vacuum learns to climb stairs", "Tiny phone folds into a cube", "Browser adds a nap button", "Smart fridge orders too much cheese", "Drone delivers a single sock"],
  money: ["Coffee prices hit a record high", "Bank opens branch on a train", "Pension fund buys a forest", "Mortgage rates drift lower again"],
  culture: ["Museum hangs a painting upside down", "Orchestra plays for a room of cats", "Bestseller list topped by a cookbook", "Film festival adds a pillow fort"],
};

async function addItems(t: T) {
  const now = Date.now();
  await t.run(async (ctx) => {
    let n = 0;
    for (const [section, titles] of Object.entries(TITLES)) {
      for (const title of titles) {
        n++;
        await ctx.db.insert("items", {
          section: section as "tech" | "money" | "culture",
          source: "Example",
          publisher: "example.com",
          title,
          summary: `${title} according to a report. Officials said it went well.`,
          url: `https://example.com/${n}`,
          normalizedUrl: `https://example.com/${n}`,
          publishedAt: now - n * 60_000,
          fetchedAt: now,
        });
      }
    }
    for (const [i, trend] of ["Pumpkin Spice Season", "Monday Mood"].entries()) {
      for (let p = 0; p < 2; p++) {
        await ctx.db.insert("items", {
          section: "memes",
          source: "X",
          publisher: "x.com",
          title: trend,
          summary: `${100 - p} likes: everyone is posting about it`,
          url: `https://x.com/i/web/status/${i}${p}1`,
          normalizedUrl: `https://x.com/i/web/status/${i}${p}1`,
          publishedAt: now - p * 1000,
          fetchedAt: now,
        });
      }
    }
  });
}

async function settleAll(t: T, maxMs = 60_000) {
  for (let elapsed = 0; elapsed < maxMs; elapsed += 500) {
    await t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(500);
  }
  await t.finishInProgressScheduledFunctions();
}

async function spend(t: T) {
  return await t.query(internal.admin.spendToday, {});
}

function failingImages(shouldFail: (input: PanelInput) => boolean, result: { retryable: boolean; reason?: string }) {
  const real = mockImageProvider({ minDelayMs: 0, maxDelayMs: 0, size: 16 });
  const calls: string[] = [];
  const provider: ImageProvider = {
    name: "flaky",
    async drawPanel(input) {
      calls.push(input.seed);
      if (shouldFail(input)) return { ok: false, reason: result.reason ?? "boom", retryable: result.retryable };
      return real.drawPanel(input);
    },
  };
  return { provider, calls };
}

describe("pipeline:buildEdition on mock providers", () => {
  test("builds 3 tech, 2 money, 2 culture, 2 memes and publishes without any safety-net timer", async () => {
    const t = convexTest(schema, modules);
    await addItems(t);
    const result = await t.action(internal.pipeline.buildEdition, { skipIngest: true });
    expect(result.status).toBe("ok");
    expect(result.comics).toBe(9);
    await settleAll(t, 30_000);
    const today = (await t.query(api.editions.today, {}))!;
    expect(today.status).toBe("published");
    expect(today.comics).toHaveLength(9);
    expect(today.comics.map((c) => c.section)).toEqual(["tech", "tech", "tech", "money", "money", "culture", "culture", "memes", "memes"].sort((a, b) => ["tech", "money", "culture", "memes"].indexOf(a) - ["tech", "money", "culture", "memes"].indexOf(b)));
    for (const c of today.comics) {
      expect(c.status).toBe("ready");
      expect(c.panels.every((p) => p.imageUrl)).toBe(true);
    }
    const memes = today.comics.filter((c) => c.section === "memes");
    expect(memes.every((c) => c.kind === "meme" && c.sourceUrl.startsWith("https://x.com/i/web/status/"))).toBe(true);
    expect(await spend(t)).toMatchObject({ imagesReserved: 36, imagesUsed: 36 });
    const unused = await t.run((ctx) => ctx.db.query("stories").withIndex("by_used_createdAt", (q) => q.eq("used", false)).collect());
    expect(unused.length).toBeGreaterThan(0);
  });

  test("is safe to run twice for the same date", async () => {
    const t = convexTest(schema, modules);
    await addItems(t);
    await t.action(internal.pipeline.buildEdition, { skipIngest: true });
    await settleAll(t, 20_000);
    const again = await t.action(internal.pipeline.buildEdition, { skipIngest: true });
    expect(again.comics).toBe(0);
    await settleAll(t, 5_000);
    const today = (await t.query(api.editions.today, {}))!;
    expect(today.comics).toHaveLength(9);
    expect((await t.query(api.editions.list, {})).length).toBe(1);
  });

  test("a second build while one holds the lock returns busy", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.pipeline.acquireLock, { name: `build:${pacificDate(Date.now())}`, holder: "other", ttlMs: 60_000 });
    expect((await t.action(internal.pipeline.buildEdition, { skipIngest: true })).status).toBe("busy");
  });
});

describe("failures", () => {
  test("a panel that fails three times hides its comic, refunds the cap, and an all-failed issue is removed with its story released", async () => {
    const t = convexTest(schema, modules);
    const { provider, calls } = failingImages((i) => i.seed.endsWith(":1"), { retryable: true });
    setProvidersForTests({ image: provider });
    const res = await t.action(internal.pipeline.drawFromBrief, {
      headline: "A robot learns to fold laundry",
      facts: ["A reader asked for a comic about a robot that folds laundry."],
      sourceName: "Commissioned by a reader",
      sourceUrl: "",
      kind: "commission",
    });
    expect(res.ok).toBe(true);
    await settleAll(t, 60_000);
    expect(calls.filter((s) => s.endsWith(":1"))).toHaveLength(3);
    expect(await t.query(api.editions.today, {})).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("editions").collect())).toHaveLength(0);
    expect(await spend(t)).toMatchObject({ imagesReserved: 3, imagesUsed: 3 });
    const stories = await t.run((ctx) => ctx.db.query("stories").collect());
    expect(stories.map((s) => s.used)).toEqual([false]);
  });

  test("a quota error is not retried", async () => {
    const t = convexTest(schema, modules);
    const { provider, calls } = failingImages(() => true, { retryable: false, reason: "openai HTTP 429 insufficient_quota" });
    setProvidersForTests({ image: provider });
    await t.action(internal.pipeline.drawFromBrief, {
      headline: "A robot learns to fold laundry",
      facts: ["A robot folds laundry slowly."],
      sourceName: "Commissioned by a reader",
      sourceUrl: "",
      kind: "commission",
    });
    await settleAll(t, 60_000);
    expect(calls.length).toBeLessThanOrEqual(4);
    expect(new Set(calls).size).toBe(calls.length);
    expect(await spend(t)).toMatchObject({ imagesReserved: 0, imagesUsed: 0 });
  });

  test("a comic past its deadline is failed and hidden; claiming a panel extends the deadline", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { comicId, editionId } = await t.run(async (ctx) => {
      const editionId = await ctx.db.insert("editions", { date: pacificDate(now), number: 1, status: "building", createdAt: now });
      const ok = await ctx.db.insert("comics", {
        editionId, section: "tech", kind: "news", title: "Visible", realStory: "A. B.", sourceName: "s", sourceUrl: "https://e.com",
        status: "ready", order: 0, createdAt: now, deadline: now + COMIC_DEADLINE_MS,
        panels: [0, 1, 2, 3].map(() => ({ scene: "Robo waves.", cast: ["Robo"], caption: "Hi." })),
      });
      const comicId = await ctx.db.insert("comics", {
        editionId, section: "tech", kind: "news", title: "Stuck", realStory: "A. B.", sourceName: "s", sourceUrl: "https://e.com",
        status: "drawing", order: 1, createdAt: now, deadline: now + COMIC_DEADLINE_MS,
        panels: [0, 1, 2, 3].map(() => ({ scene: "Robo waves.", cast: ["Robo"], caption: "Hi." })),
      });
      return { comicId, editionId, ok };
    });
    vi.advanceTimersByTime(COMIC_DEADLINE_MS - 60_000);
    const claim = await t.mutation(internal.pipeline.claimPanel, { comicId, index: 0, attempt: 1 });
    expect(claim.kind).toBe("go");
    expect(await t.mutation(internal.pipeline.claimPanel, { comicId, index: 0, attempt: 1 })).toEqual({ kind: "skip" });
    const extended = (await t.run((ctx) => ctx.db.get(comicId)))!.deadline;
    expect(extended).toBeGreaterThan(now + COMIC_DEADLINE_MS);
    await t.mutation(internal.pipeline.checkDeadline, { comicId });
    expect((await t.run((ctx) => ctx.db.get(comicId)))!.status).toBe("drawing");
    vi.advanceTimersByTime(extended - Date.now() + 1);
    await t.mutation(internal.pipeline.checkDeadline, { comicId });
    const stuck = (await t.run((ctx) => ctx.db.get(comicId)))!;
    expect(stuck.status).toBe("failed");
    expect(stuck.hidden).toBe(true);
    const today = (await t.query(api.editions.today, {}))!;
    expect(today.comics.map((c) => c.title)).toEqual(["Visible"]);
    expect((await t.run((ctx) => ctx.db.get(editionId)))!.status).toBe("published");
  });

  test("a duplicate result for an already drawn panel deletes its upload", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { comicId, first, second } = await t.run(async (ctx) => {
      const editionId = await ctx.db.insert("editions", { date: pacificDate(now), number: 1, status: "building", createdAt: now });
      const first = await ctx.storage.store(new Blob(["a"]));
      const second = await ctx.storage.store(new Blob(["b"]));
      const comicId = await ctx.db.insert("comics", {
        editionId, section: "tech", kind: "news", title: "T", realStory: "A. B.", sourceName: "s", sourceUrl: "https://e.com",
        status: "drawing", order: 0, createdAt: now, deadline: now + COMIC_DEADLINE_MS,
        panels: [0, 1, 2, 3].map((i) => ({ scene: "Robo waves.", cast: ["Robo"], caption: "Hi.", ...(i === 0 ? { imageId: first } : {}) })),
      });
      return { comicId, first, second };
    });
    await t.mutation(internal.pipeline.panelDrawn, { comicId, index: 0, attempt: 2, slot: 0, holder: "x", imageId: second });
    const comic = (await t.run((ctx) => ctx.db.get(comicId)))!;
    expect(comic.panels[0].imageId).toBe(first);
    expect(await t.run((ctx) => ctx.storage.get(second))).toBeNull();
  });
});

describe("locks, stories and the cap", () => {
  test("only the holder releases a lock", async () => {
    const t = convexTest(schema, modules);
    const lock = { name: "fresh", ttlMs: 60_000 };
    expect(await t.mutation(internal.pipeline.acquireLock, { ...lock, holder: "a" })).toBe(true);
    expect(await t.mutation(internal.pipeline.acquireLock, { ...lock, holder: "b" })).toBe(false);
    expect(await t.mutation(internal.pipeline.releaseLock, { name: "fresh", holder: "b" })).toBe(false);
    expect(await t.mutation(internal.pipeline.acquireLock, { ...lock, holder: "b" })).toBe(false);
    expect(await t.mutation(internal.pipeline.releaseLock, { name: "fresh", holder: "a" })).toBe(true);
    expect(await t.mutation(internal.pipeline.acquireLock, { ...lock, holder: "b" })).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(await t.mutation(internal.pipeline.acquireLock, { ...lock, holder: "c" })).toBe(true);
  });

  test("a story is claimed once, so two writers never pay for it", async () => {
    const t = convexTest(schema, modules);
    const [storyId] = await t.mutation(internal.pipeline.saveStories, {
      stories: [{ section: "tech", kind: "news", headline: "H", facts: ["F."], itemIds: [], sourceName: "s", sourceUrl: "https://e.com", score: 5 }],
    });
    const [a, b] = await Promise.all([
      t.mutation(internal.pipeline.claimStory, { storyId }),
      t.mutation(internal.pipeline.claimStory, { storyId }),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  test("20 old high-scoring stories do not crowd out a fresh one", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const fresh = await t.run(async (ctx) => {
      const base = { section: "tech" as const, kind: "news" as const, facts: ["F."], itemIds: [], sourceName: "s", sourceUrl: "https://e.com", used: false };
      for (let i = 0; i < 20; i++) await ctx.db.insert("stories", { ...base, headline: `Old ${i}`, score: 10, createdAt: now - STORY_WINDOW_MS - (i + 1) * 60_000 });
      return await ctx.db.insert("stories", { ...base, headline: "Fresh", score: 3, createdAt: now - 1000 });
    });
    expect(await t.query(internal.pipeline.bestUnusedStory, { now })).toBe(fresh);
  });

  test("an unused story about an event already in the paper is skipped", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const other = await t.run(async (ctx) => {
      const base = { section: "tech" as const, kind: "news" as const, facts: ["F."], itemIds: [], sourceName: "s", sourceUrl: "https://e.com" };
      const usedId = await ctx.db.insert("stories", { ...base, headline: "SpaceX catches Starship with chopsticks", score: 9, used: true, createdAt: now });
      await ctx.db.insert("stories", { ...base, headline: "SpaceX Starship chopsticks catch wows fans", score: 9, used: false, createdAt: now });
      const other = await ctx.db.insert("stories", { ...base, headline: "Browser adds a nap button", score: 4, used: false, createdAt: now });
      const editionId = await ctx.db.insert("editions", { date: pacificDate(now), number: 1, status: "published", createdAt: now });
      await ctx.db.insert("comics", {
        editionId, storyId: usedId, section: "tech", kind: "news", title: "Chopsticks", realStory: "A. B.", sourceName: "s", sourceUrl: "https://e.com",
        status: "ready", order: 0, createdAt: now, deadline: now, panels: [],
      });
      return other;
    });
    expect(await t.query(internal.pipeline.bestUnusedStory, { now })).toBe(other);
  });

  test("the image cap is reserved before drawing", async () => {
    const t = convexTest(schema, modules);
    process.env.DAILY_IMAGE_CAP = "6";
    const date = pacificDate(Date.now());
    expect(await t.mutation(internal.pipeline.reserveImages, { date, count: 4 })).toBe(true);
    expect(await t.mutation(internal.pipeline.reserveImages, { date, count: 4 })).toBe(false);
    expect(await t.query(internal.pipeline.capLeft, { date })).toBe(2);
  });
});

describe("pipeline:drawFreshOne", () => {
  test("wrong secret", async () => {
    const t = convexTest(schema, modules);
    expect(await t.action(api.pipeline.drawFreshOne, { deviceId: DEVICE, secret: "nope" })).toEqual({ ok: false, reason: "bad_secret" });
    delete process.env.DEMO_SECRET;
    expect(await t.action(api.pipeline.drawFreshOne, { deviceId: DEVICE, secret: "" })).toEqual({ ok: false, reason: "bad_secret" });
  });

  test("no story", async () => {
    const t = convexTest(schema, modules);
    expect(await t.action(api.pipeline.drawFreshOne, { deviceId: DEVICE, secret: SECRET })).toEqual({ ok: false, reason: "no_story" });
    expect(await t.mutation(internal.pipeline.acquireLock, { name: "fresh", holder: "after", ttlMs: 1000 })).toBe(true);
  });

  test("cap reached", async () => {
    const t = convexTest(schema, modules);
    await addItems(t);
    await t.mutation(internal.pipeline.reserveImages, { date: pacificDate(Date.now()), count: 78 });
    expect(await t.action(api.pipeline.drawFreshOne, { deviceId: DEVICE, secret: SECRET })).toEqual({ ok: false, reason: "spend_cap" });
  });

  test("draws the best unused story to the top of the newest issue, and a second press is busy until it lands", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) =>
      ctx.db.insert("entitlements", { deviceId: DEVICE, kind: "plus", membershipId: "mem_test", status: "active", since: Date.now(), updatedAt: Date.now() }),
    );
    await addItems(t);
    await t.action(internal.pipeline.buildEdition, { skipIngest: true });
    await settleAll(t, 20_000);
    const first = await t.action(api.pipeline.drawFreshOne, { deviceId: DEVICE, secret: SECRET });
    expect(first.ok).toBe(true);
    expect(await t.action(api.pipeline.drawFreshOne, { deviceId: DEVICE, secret: SECRET })).toEqual({ ok: false, reason: "busy" });
    const during = (await t.query(api.editions.today, {}))!;
    expect(during.comics[0]._id).toBe((first as { comicId: Id<"comics"> }).comicId);
    expect(during.comics[0].isNew).toBe(true);
    expect(during.status).toBe("building");
    await settleAll(t, 10_000);
    const after = (await t.query(api.editions.today, {}))!;
    expect(after.status).toBe("published");
    expect(after.comics[0]).toMatchObject({ isNew: true, status: "ready" });
    expect(after.comics).toHaveLength(10);
    const second = await t.action(api.pipeline.drawFreshOne, { deviceId: DEVICE, secret: SECRET });
    expect(second.ok).toBe(true);
  });

  test("runs one fallback pick when no unused story is left", async () => {
    const t = convexTest(schema, modules);
    await addItems(t);
    const res = await t.action(api.pipeline.drawFreshOne, { deviceId: DEVICE, secret: SECRET });
    expect(res.ok).toBe(true);
    await settleAll(t, 10_000);
    const today = (await t.query(api.editions.today, {}))!;
    expect(today.comics).toHaveLength(1);
    expect(today.comics[0].section).toBe("tech");
  });

  test("rejects a bad device id", async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(api.pipeline.drawFreshOne, { deviceId: "x", secret: SECRET })).rejects.toThrow(/bad_device_id/);
  });
});

describe("pipeline:drawFromBrief", () => {
  test("refuses banned topics and empty briefs before paying for anything", async () => {
    const t = convexTest(schema, modules);
    const base = { sourceName: "Commissioned by a reader", sourceUrl: "", kind: "commission" as const };
    expect(await t.action(internal.pipeline.drawFromBrief, { ...base, headline: "My neighbour was arrested", facts: ["He was arrested."] })).toEqual({ ok: false, reason: "unsafe" });
    expect(await t.action(internal.pipeline.drawFromBrief, { ...base, headline: " ", facts: [] })).toEqual({ ok: false, reason: "bad_brief" });
    expect(await spend(t)).toMatchObject({ imagesReserved: 0, scriptCalls: 0 });
  });

  test("draws a commission into today's paper", async () => {
    const t = convexTest(schema, modules);
    const res = await t.action(internal.pipeline.drawFromBrief, {
      headline: "Our seed round closed",
      facts: ["The startup closed its seed round on Friday.", "The money will pay for a bigger office."],
      sourceName: "Commissioned by a reader",
      sourceUrl: "",
      kind: "commission",
    });
    expect(res.ok).toBe(true);
    await settleAll(t, 10_000);
    const today = (await t.query(api.editions.today, {}))!;
    expect(today.comics[0]).toMatchObject({ kind: "commission", section: "money", sourceName: "Commissioned by a reader", status: "ready" });
  });
});
