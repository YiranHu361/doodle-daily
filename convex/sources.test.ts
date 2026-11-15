import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { poolSize } from "./freshPool";
import { pacificDate } from "./lib/dates";
import { isRealSource } from "./lib/urls";
import schema from "./schema";
import { setSearchForTests } from "./sourcing";
import { modules } from "./test.setup";

type T = ReturnType<typeof convexTest>;
const REAL = "https://www.npr.org/2026/11/15/robot-vacuum";

describe("isRealSource", () => {
  test("accepts real https publisher links", () => {
    for (const url of [REAL, "https://x.com/i/web/status/123", "https://knowyourmeme.com/memes/foo", "https://www.bbc.co.uk/news/articles/abc"]) {
      expect(isRealSource(url)).toBe(true);
    }
  });
  test("refuses empty, sample, local and non-https links", () => {
    for (const url of ["", "  ", "https://example.com/sample/robot", "https://news.example.org/x", "https://example.net", "http://www.npr.org/x", "https://localhost/x", "https://127.0.0.1/x", "javascript:alert(1)", "https://intranet/x", "https://site.test/x", "not a url"]) {
      expect(isRealSource(url)).toBe(false);
    }
  });
});

async function story(t: T, fields: { sourceUrl: string; sourceName?: string; kind?: "news" | "meme"; headline?: string; used?: boolean }) {
  return await t.run((ctx) =>
    ctx.db.insert("stories", {
      section: "tech",
      kind: fields.kind ?? "news",
      headline: fields.headline ?? "Office robot vacuum maps every desk",
      facts: ["The robot vacuum mapped the office floor overnight."],
      itemIds: [],
      sourceName: fields.sourceName ?? "NPR",
      sourceUrl: fields.sourceUrl,
      score: 9,
      used: fields.used ?? false,
      createdAt: Date.now(),
    }),
  );
}

const SCRIPT = {
  title: "Robo Maps the Office",
  realStory: "A robot vacuum mapped an office. It parked under the snack table.",
  panels: [0, 1, 2, 3].map((i) => ({ scene: `Robo rolls across the office floor, part ${i + 1}.`, cast: ["Robo"], caption: `Robo maps desk number ${i + 1}.` })),
};

describe("sample stories are never drawn", () => {
  test("bestUnusedStory skips a sample story even when it scores higher", async () => {
    const t = convexTest(schema, modules);
    await story(t, { sourceUrl: "https://example.com/sample/robot-vacuum-map", sourceName: "Doodle Daily sample desk" });
    expect(await t.query(internal.pipeline.bestUnusedStory, { now: Date.now() })).toBeNull();
    const real = await story(t, { sourceUrl: REAL, headline: "Bakery sells bread shaped like phones" });
    expect(await t.query(internal.pipeline.bestUnusedStory, { now: Date.now() })).toBe(real);
  });

  test("startComic refuses a news or meme story without a real source and retires it", async () => {
    const t = convexTest(schema, modules);
    for (const [kind, sourceUrl] of [["news", "https://example.com/sample/coffee"], ["meme", ""]] as const) {
      const id = await story(t, { kind, sourceUrl });
      expect(await t.mutation(internal.pipeline.startComic, { storyId: id, script: SCRIPT })).toEqual({ ok: false, reason: "no_source" });
      expect((await t.run((ctx) => ctx.db.get(id)))!.used).toBe(true);
    }
    expect(await t.run((ctx) => ctx.db.query("comics").collect())).toEqual([]);
  });
});

async function comic(t: T, editionId: Id<"editions">, fields: Record<string, unknown>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const images = await Promise.all([0, 1, 2, 3].map((i) => ctx.storage.store(new Blob([`png-${i}`]))));
    return await ctx.db.insert("comics", {
      editionId,
      section: "tech",
      kind: "news",
      title: "A comic",
      realStory: "One. Two.",
      sourceName: "NPR",
      sourceUrl: REAL,
      status: "ready",
      order: 0,
      createdAt: now,
      deadline: now + 60_000,
      panels: [0, 1, 2, 3].map((i) => ({ scene: "Robo draws.", cast: ["Robo"], caption: "Robo draws.", imageId: images[i] })),
      ...fields,
    });
  });
}

describe("admin:purgeUnsourced and admin:sourceAudit", () => {
  test("hides and un-pools unsourced comics, retires their stories, leaves real and created comics alone", async () => {
    const t = convexTest(schema, modules);
    const editionId = await t.run((ctx) => ctx.db.insert("editions", { date: pacificDate(Date.now()), number: 1, status: "published", createdAt: Date.now() }));
    const sampleStory = await story(t, { sourceUrl: "https://example.com/sample/kazoo", sourceName: "Doodle Daily sample desk", used: true });
    const sample = await comic(t, editionId, { title: "Kazoo choir", sourceName: "Doodle Daily sample desk", sourceUrl: "https://example.com/sample/kazoo", storyId: sampleStory, order: 1 });
    const pooledStory = await story(t, { sourceUrl: "", sourceName: "Doodle Daily newsroom", used: true });
    const pooled = await comic(t, editionId, { title: "Slow news day", kind: "meme", sourceName: "Doodle Daily newsroom", sourceUrl: "", storyId: pooledStory, pooled: true, fresh: true });
    const real = await comic(t, editionId, { title: "Real one", order: 2 });
    const created = await comic(t, editionId, { title: "Mine", kind: "commission", owner: "device-1234", sourceUrl: "", sourceName: "Created by a reader", order: 3 });
    const paper = await comic(t, editionId, { title: "Paper", kind: "paper-sample", sourceUrl: "https://example.com/x", order: 4 });
    const leftover = await story(t, { sourceUrl: "https://example.com/sample/coffee", sourceName: "Doodle Daily sample desk" });

    const before = await t.query(internal.admin.sourceAudit, {});
    expect(before.failures).toBe(2);
    expect(before.rows.find((r) => r.comicId === sample)).toMatchObject({ failure: true, realSource: false, sourceHost: "example.com", where: "issue" });
    expect(before.rows.find((r) => r.comicId === pooled)).toMatchObject({ failure: true, where: "pool" });
    expect(before.rows.find((r) => r.comicId === real)).toMatchObject({ failure: false, realSource: true, sourceHost: "www.npr.org" });

    const res = await t.mutation(internal.admin.purgeUnsourced, {});
    expect(res.comics.map((c) => c.comicId).sort()).toEqual([sample, pooled].sort());
    expect(res.storiesRetired).toBe(3);

    const docs = await t.run(async (ctx) => ({
      sample: await ctx.db.get(sample),
      pooled: await ctx.db.get(pooled),
      real: await ctx.db.get(real),
      created: await ctx.db.get(created),
      paper: await ctx.db.get(paper),
      leftover: await ctx.db.get(leftover),
    }));
    expect(docs.sample).toMatchObject({ hidden: true });
    expect(docs.pooled).toMatchObject({ hidden: true });
    expect(docs.pooled!.pooled).toBeUndefined();
    expect(docs.real!.hidden).toBeUndefined();
    expect(docs.created!.hidden).toBeUndefined();
    expect(docs.paper!.hidden).toBeUndefined();
    expect(docs.leftover!.used).toBe(true);

    expect((await t.query(internal.admin.sourceAudit, {})).failures).toBe(0);
    expect(await t.mutation(internal.freshPool.claim, {})).toBeNull();
    expect((await t.query(api.editions.today, {}))!.comics.map((c) => c.title)).toEqual(["Real one"]);
  });

  test("the visibility helper never shows an unsourced news comic even if nobody hid it", async () => {
    const t = convexTest(schema, modules);
    const editionId = await t.run((ctx) => ctx.db.insert("editions", { date: pacificDate(Date.now()), number: 1, status: "published", createdAt: Date.now() }));
    await comic(t, editionId, { title: "Sample", sourceUrl: "https://example.com/sample/a" });
    await comic(t, editionId, { title: "Real", sourceUrl: REAL, order: 1 });
    expect((await t.query(api.editions.today, {}))!.comics.map((c) => c.title)).toEqual(["Real"]);
  });

  test("no quiz is reserved for a comic without a real source", async () => {
    const t = convexTest(schema, modules);
    const editionId = await t.run((ctx) => ctx.db.insert("editions", { date: pacificDate(Date.now()), number: 1, status: "published", createdAt: Date.now() }));
    const bad = await comic(t, editionId, { sourceUrl: "https://example.com/sample/a" });
    const good = await comic(t, editionId, { order: 1 });
    expect(await t.mutation(internal.quiz.reserve, { comicId: bad, holder: "h", canGenerate: true })).toEqual({ ok: false, reason: "not_found" });
    expect(await t.mutation(internal.quiz.reserve, { comicId: good, holder: "h", canGenerate: true })).toMatchObject({ ok: true });
  });
});

describe("seed", () => {
  test("refuses to run without ALLOW_SEED=1", async () => {
    const t = convexTest(schema, modules);
    delete process.env.ALLOW_SEED;
    await expect(t.action(internal.seed.run, { fast: true })).rejects.toThrow(/ALLOW_SEED/);
    expect(await t.run((ctx) => ctx.db.query("stories").collect())).toEqual([]);
  });
});

describe("fresh pool and deep search", () => {
  test("the pool holds 5 comics by default", () => {
    delete process.env.FRESH_POOL_SIZE;
    expect(poolSize()).toBe(5);
  });

  test("an empty pool runs the deep search before giving up and draws only the verified story", async () => {
    process.env.FRESH_POOL_SIZE = "1";
    process.env.MOCK_IMAGE_DELAY_MS = "0";
    delete process.env.ANTHROPIC_API_KEY;
    const good = "https://www.npr.org/2026/11/15/library-cat-gets-a-library-card";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url === good) return new Response("<html><head><title>Library cat gets its own library card</title></head><body></body></html>", { status: 200 });
        return new Response("nope", { status: 404 });
      }),
    );
    setSearchForTests(async () => ({
      stories: [
        { url: good, publisher: "NPR", headline: "Library cat gets its own library card", facts: ["A library gave its resident cat a library card.", "The cat sleeps on the returns desk."] },
        { url: "https://www.npr.org/missing-page", publisher: "NPR", headline: "Parrot learns to order pizza online", facts: ["A parrot ordered a pizza."] },
      ],
    }));
    const t = convexTest(schema, modules);
    try {
      const res = await t.action(internal.freshPool.topUp, {});
      expect(res.note).toMatch(/deep search/);
      expect(res.started).toBe(1);
      const comics = await t.run((ctx) => ctx.db.query("comics").collect());
      expect(comics.map((c) => c.sourceUrl)).toEqual([good]);
    } finally {
      setSearchForTests(null);
      vi.unstubAllGlobals();
      delete process.env.FRESH_POOL_SIZE;
    }
  });
});

