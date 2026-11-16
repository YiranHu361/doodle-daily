import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

type T = ReturnType<typeof convexTest>;
type ComicFields = Partial<Omit<Doc<"comics">, "_id" | "_creationTime" | "editionId">>;

async function insertComic(t: T, fields: ComicFields = {}, withImages = true) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const editionId = await ctx.db.insert("editions", { date: "2026-11-15", number: 1, status: "published", createdAt: now });
    const images = withImages ? await Promise.all([0, 1, 2, 3].map((i) => ctx.storage.store(new Blob([`png-${i}`])))) : [];
    return await ctx.db.insert("comics", {
      editionId,
      section: "tech",
      kind: "news",
      title: "Robo Buys a Cloud",
      realStory: "A company bought a lot of servers. Prices went up.",
      sourceName: "Example News",
      sourceUrl: "https://www.npr.org/fixture/story",
      status: "ready",
      order: 0,
      createdAt: now,
      deadline: now + 60_000,
      panels: [0, 1, 2, 3].map((i) => ({ scene: `Scene ${i + 1}`, cast: ["Robo"], caption: `Caption ${i + 1}`, imageId: images[i] })),
      ...fields,
    });
  });
}

async function get(t: T, path: string) {
  const res = await t.fetch(path, { method: "GET" });
  return { status: res.status, body: await res.text(), cache: res.headers.get("cache-control"), type: res.headers.get("content-type") };
}

describe("GET /s/<comicId>", () => {
  test("a ready comic renders its title, four pictures, captions and preview tags", async () => {
    const t = convexTest(schema, modules);
    const id = await insertComic(t);
    const page = await get(t, `/s/${id}`);
    expect(page.status).toBe(200);
    expect(page.type).toBe("text/html; charset=utf-8");
    expect(page.cache).toBe("public, max-age=60");
    expect(page.body).toContain("<h1>Robo Buys a Cloud</h1>");
    const images = [...page.body.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]);
    expect(images).toHaveLength(4);
    expect(new Set(images).size).toBe(4);
    expect([1, 2, 3, 4].map((n) => page.body.indexOf(`Caption ${n}`))).toEqual([...[1, 2, 3, 4].map((n) => page.body.indexOf(`Caption ${n}`))].sort((a, b) => a - b));
    expect(page.body).toContain('<meta property="og:title" content="Robo Buys a Cloud">');
    expect(page.body).toContain(`<meta property="og:image" content="${images[0]}">`);
    expect(page.body).toMatch(/<meta property="og:description" content="A company bought/);
    expect(page.body).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(page.body).toContain(`href="doodledaily://reader/${id}"`);
    expect(page.body).toContain("Open in Doodle Daily");
    expect(page.body).toContain('<a href="https://www.npr.org/fixture/story"');
    expect(page.body).toContain(">TECH<");
    expect(page.body).not.toContain("SPONSORED");
    expect(page.body).not.toContain("UNVERIFIED LINK");
    expect(page.body).not.toContain("<script");
  });

  test("model text is escaped", async () => {
    const t = convexTest(schema, modules);
    const ok = await insertComic(t, { title: `<script>alert("x")</script> & 'friends'`, realStory: "<b>bold</b>", sourceUrl: "javascript:alert(1)", kind: "commission", sponsored: true });
    const page = await get(t, `/s/${ok}`);
    expect(page.status).toBe(200);
    expect(page.body).not.toContain("<script>");
    expect(page.body).not.toContain("<b>bold</b>");
    expect(page.body).not.toContain("javascript:");
    expect(page.body).toContain("<h1>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;friends&#39;</h1>");
    expect(page.body).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  test("unverified and sponsored comics keep their tags; a replaced comic still opens", async () => {
    const t = convexTest(schema, modules);
    const unverified = await insertComic(t, { unverified: true });
    expect((await get(t, `/s/${unverified}`)).body).toContain("UNVERIFIED LINK");
    const sponsored = await insertComic(t, { kind: "commission", sponsored: true, sponsorName: "Acme <Notes>", ctaLabel: "Try the beta" });
    const promo = await get(t, `/s/${sponsored}`);
    expect(promo.status).toBe(200);
    expect(promo.body).toContain("SPONSORED");
    expect(promo.body).toContain("SPONSORED · by Acme &lt;Notes&gt;");
    expect(promo.body).toContain(">Try the beta</a>");
    const replaced = await insertComic(t, { replacedAt: Date.now() });
    const page = await get(t, `/s/${replaced}`);
    expect(page.status).toBe(200);
    expect(page.body).toContain("Robo Buys a Cloud");
  });

  test.each<[string, ComicFields, boolean?]>([
    ["hidden", { hidden: true }],
    ["failed", { status: "failed" }],
    ["drawing", { status: "drawing" }],
    ["pooled", { pooled: true }],
    ["pooled while revealing", { pooled: true, revealAt: Date.now() + 7000 }],
    ["owned", { kind: "commission", owner: "device-1234-abcd" }],
    ["unsponsored commission without an owner", { kind: "commission" }],
    ["owned by a texter", { kind: "commission", owner: "text:+15555550100" }],
    ["missing pictures", {}, false],
  ])("a %s comic is a 404", async (_name, fields, withImages) => {
    const t = convexTest(schema, modules);
    const id = await insertComic(t, fields, withImages ?? true);
    const page = await get(t, `/s/${id}`);
    expect(page.status).toBe(404);
    expect(page.body).toContain("This story isn't here.");
    expect(page.body).not.toContain("og:image");
  });

  test("unknown and malformed ids are a 404", async () => {
    const t = convexTest(schema, modules);
    const id = await insertComic(t);
    await t.run((ctx) => ctx.db.delete(id));
    for (const path of [`/s/${id}`, "/s/not-an-id", "/s/", "/s/abc/def", "/s/%3Cscript%3E"]) {
      expect((await get(t, path)).status, path).toBe(404);
    }
  });
});

describe("storyPage:comic", () => {
  test("returns a public comic by id, an owned one only to its owner", async () => {
    const t = convexTest(schema, modules);
    const pub = await insertComic(t);
    const owned = await insertComic(t, { kind: "commission", owner: "device-1234-abcd" });
    const hidden = await insertComic(t, { hidden: true });
    expect((await t.query(api.storyPage.comic, { comicId: pub }))?.title).toBe("Robo Buys a Cloud");
    expect(await t.query(api.storyPage.comic, { comicId: owned })).toBeNull();
    expect((await t.query(api.storyPage.comic, { comicId: owned, deviceId: "device-1234-abcd" }))?._id).toBe(owned);
    expect(await t.query(api.storyPage.comic, { comicId: hidden })).toBeNull();
    expect(await t.query(api.storyPage.comic, { comicId: "nope" })).toBeNull();
  });
});
