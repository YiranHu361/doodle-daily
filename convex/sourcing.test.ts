import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { setSearchForTests, sharesKeyWords, type SearchRequest } from "./sourcing";
import { modules } from "./test.setup";

let pages: Record<string, string> = {};

const page = (title: string, body = "") => `<html><head><title>${title}</title></head><body><p>${body}</p></body></html>`;

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  pages = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      const body = pages[url];
      return body ? new Response(body, { status: 200, headers: { "Content-Type": "text/html" } }) : new Response("nope", { status: 404 });
    }),
  );
});

afterEach(() => {
  setSearchForTests(null);
  vi.unstubAllGlobals();
});

async function addXPost(t: ReturnType<typeof convexTest>, trend: string, id: string) {
  const url = `https://x.com/i/web/status/${id}`;
  await t.run(async (ctx) => {
    await ctx.db.insert("items", {
      section: "memes",
      source: "X",
      publisher: "x.com",
      title: trend,
      summary: "4200 likes: everyone is posting their cat as a tiny chef today",
      url,
      normalizedUrl: url,
      publishedAt: Date.now() - 60_000,
      fetchedAt: Date.now(),
    });
  });
  return url;
}

describe("deep search", () => {
  test("saves only candidates whose page verifies", async () => {
    const t = convexTest(schema, modules);
    pages["https://www.theverge.com/2026/robot-vacuum-stairs"] = page("Robot vacuum learns to climb stairs at last", "The robot vacuum climbs stairs.");
    pages["https://www.wired.com/story/unrelated"] = page("Ten great hiking boots", "Boots for walking.");
    setSearchForTests(async () => ({
      stories: [
        { url: "https://www.theverge.com/2026/robot-vacuum-stairs", publisher: "The Verge", headline: "Robot vacuum learns to climb stairs", facts: ["The vacuum climbs stairs."] },
        { url: "https://www.engadget.com/gone", publisher: "Engadget", headline: "Folding phone becomes a cube", facts: ["It folds."] },
        { url: "https://www.wired.com/story/unrelated", publisher: "Wired", headline: "Orchestra plays concert for a room of cats", facts: ["Cats listened."] },
      ],
    }));
    const report = await t.action(internal.sourcing.run, { section: "tech" });
    expect(report.status).toBe("ok");
    expect(report.found).toBe(3);
    expect(report.verified).toBe(1);
    expect(report.dropped).toBe(2);
    expect(report.saved).toBe(1);
    expect(report.searches).toBe(2);
    const stories = await t.run((ctx) => ctx.db.query("stories").collect());
    expect(stories).toHaveLength(1);
    expect(stories[0]).toMatchObject({ section: "tech", kind: "news", sourceUrl: "https://www.theverge.com/2026/robot-vacuum-stairs", sourceName: "The Verge", itemIds: [] });
    expect(stories[0].facts.length).toBeGreaterThan(0);
    const runs = await t.run((ctx) => ctx.db.query("runs").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0].kind).toBe("deep_search");
    expect(JSON.parse(runs[0].note)).toMatchObject({ found: 3, verified: 1, dropped: 2, saved: 1 });
  });

  test("a meme gains a verified article source and keeps the X link as origin", async () => {
    const t = convexTest(schema, modules);
    const chef = await addXPost(t, "Tiny Chef Cats", "111");
    const ghost = await addXPost(t, "Gravy Ghost Dance", "222");
    pages["https://knowyourmeme.com/memes/tiny-chef-cats"] = page("Tiny Chef Cats | Know Your Meme", "People dress their cats as tiny chefs.");
    let asked: SearchRequest | null = null;
    setSearchForTests(async (req) => {
      if (req.memes.length) asked = req;
      return {
        stories: req.memes.length
          ? [
              { url: "https://knowyourmeme.com/memes/tiny-chef-cats", publisher: "Know Your Meme", headline: "Tiny Chef Cats", facts: ["People dress their cats as tiny chefs."], meme: "Tiny Chef Cats" },
              { url: "https://www.dailydot.com/missing-ghost", publisher: "Daily Dot", headline: "Gravy Ghost Dance explained", facts: ["A dance."], meme: "Gravy Ghost Dance" },
            ]
          : [],
      };
    });
    await t.action(internal.sourcing.run, { section: "memes" });
    expect(asked!.memes.sort()).toEqual(["Gravy Ghost Dance", "Tiny Chef Cats"]);
    const stories = await t.run((ctx) => ctx.db.query("stories").collect());
    const chefStory = stories.find((s) => s.originUrl === chef);
    const ghostStory = stories.find((s) => s.originUrl === ghost);
    expect(chefStory).toMatchObject({ kind: "meme", sourceUrl: "https://knowyourmeme.com/memes/tiny-chef-cats", sourceName: "Know Your Meme" });
    expect(ghostStory).toMatchObject({ kind: "meme", sourceUrl: ghost, sourceName: "X" });
  });

  test("a second run within 20 minutes is locked", async () => {
    const t = convexTest(schema, modules);
    const search = vi.fn(async () => ({ stories: [] }));
    setSearchForTests(search);
    expect((await t.action(internal.sourcing.run, { section: "money" })).status).toBe("ok");
    expect((await t.action(internal.sourcing.run, { section: "money" })).status).toBe("locked");
    expect((await t.action(internal.sourcing.run, { section: "culture" })).status).toBe("ok");
  });

  test("a missing API key skips the search with a note", async () => {
    const t = convexTest(schema, modules);
    const report = await t.action(internal.sourcing.run, { section: "culture" });
    expect(report.saved).toBe(0);
    expect(report.notes.some((n) => n.includes("ANTHROPIC_API_KEY"))).toBe(true);
  });

  test("stock counts only real, safe, unused stories in the section", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      const base = { section: "tech" as const, kind: "news" as const, facts: ["A fact from the article."], itemIds: [], sourceName: "Source", score: 5, used: false, createdAt: now - 1000 };
      await ctx.db.insert("stories", { ...base, headline: "Robot vacuum learns to climb stairs", sourceUrl: "https://www.theverge.com/a" });
      await ctx.db.insert("stories", { ...base, headline: "Tiny phone folds into a cube", sourceUrl: "https://example.com/b" });
      await ctx.db.insert("stories", { ...base, headline: "Museum hangs a painting upside down", sourceUrl: "https://www.wired.com/c", used: true });
      await ctx.db.insert("stories", { ...base, headline: "Bank opens a branch on a train", sourceUrl: "https://www.cnbc.com/d", section: "money" });
      await ctx.db.insert("stories", { ...base, headline: "Old gadget story", sourceUrl: "https://www.wired.com/e", createdAt: now - 8 * 24 * 60 * 60 * 1000 });
    });
    expect(await t.query(internal.sourcing.stock, { section: "tech", now })).toBe(1);
  });
});

describe("sharesKeyWords", () => {
  test("needs two distinctive words or half of them", () => {
    expect(sharesKeyWords("Robot vacuum learns to climb stairs", "a robot that can climb")).toBe(true);
    expect(sharesKeyWords("Robot vacuum learns to climb stairs", "a robot")).toBe(false);
    expect(sharesKeyWords("Pikachu", "pikachu is back")).toBe(true);
    expect(sharesKeyWords("the and of", "the and of")).toBe(false);
  });
});
