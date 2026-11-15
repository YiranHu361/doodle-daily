import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { addDays, pacificDate } from "./lib/dates";
import { comicKind, section } from "./schema";
import { getImageProvider, getScriptProvider, panelPrompt, type Script } from "./providers";
import { TODAY_STORIES, YESTERDAY_STORIES, type SeedStory } from "./seedData";

const COMIC_DEADLINE_MS = 10 * 60 * 1000;

const scriptPanel = v.object({ scene: v.string(), cast: v.array(v.string()), caption: v.string() });
const seedComic = v.object({
  section,
  kind: comicKind,
  headline: v.string(),
  facts: v.array(v.string()),
  sourceName: v.string(),
  sourceUrl: v.string(),
  title: v.string(),
  realStory: v.string(),
  panels: v.array(scriptPanel),
});

const writtenEdition = v.object({
  editionId: v.id("editions"),
  comicIds: v.array(v.id("comics")),
});

async function deleteEdition(ctx: MutationCtx, editionId: Id<"editions">) {
  const comics = await ctx.db
    .query("comics")
    .withIndex("by_edition_order", (q) => q.eq("editionId", editionId))
    .collect();
  for (const comic of comics) {
    for (const panel of comic.panels) if (panel.imageId) await ctx.storage.delete(panel.imageId);
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_comic_device", (q) => q.eq("comicId", comic._id))
      .collect();
    for (const r of reactions) await ctx.db.delete(r._id);
    const counts = await ctx.db
      .query("reactionCounts")
      .withIndex("by_comic", (q) => q.eq("comicId", comic._id))
      .collect();
    for (const c of counts) await ctx.db.delete(c._id);
    if (comic.storyId) await ctx.db.delete(comic.storyId);
    await ctx.db.delete(comic._id);
  }
  await ctx.db.delete(editionId);
}

export const writeEdition = internalMutation({
  args: { date: v.string(), replace: v.boolean(), comics: v.array(seedComic) },
  returns: v.union(writtenEdition, v.null()),
  handler: async (ctx, { date, replace, comics }) => {
    const existing = await ctx.db
      .query("editions")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();
    if (existing && !replace) return null;
    let number = existing?.number;
    if (existing) await deleteEdition(ctx, existing._id);
    if (number === undefined) {
      const newest = await ctx.db.query("editions").withIndex("by_number").order("desc").first();
      number = (newest?.number ?? 0) + 1;
    }
    const now = Date.now();
    const editionId = await ctx.db.insert("editions", { date, number, status: "building", createdAt: now });
    const comicIds: Id<"comics">[] = [];
    for (const [order, c] of comics.entries()) {
      const storyId = await ctx.db.insert("stories", {
        section: c.section,
        kind: c.kind,
        headline: c.headline,
        facts: c.facts,
        itemIds: [],
        sourceName: c.sourceName,
        sourceUrl: c.sourceUrl,
        score: 5,
        used: true,
        claimedAt: now,
        createdAt: now,
      });
      comicIds.push(
        await ctx.db.insert("comics", {
          editionId,
          storyId,
          section: c.section,
          kind: c.kind,
          title: c.title,
          realStory: c.realStory,
          sourceName: c.sourceName,
          sourceUrl: c.sourceUrl,
          status: "drawing",
          order,
          createdAt: now + order,
          deadline: now + COMIC_DEADLINE_MS,
          panels: c.panels,
        }),
      );
    }
    return { editionId, comicIds };
  },
});

export const attachPanel = internalMutation({
  args: { comicId: v.id("comics"), index: v.number(), imageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { comicId, index, imageId }) => {
    const comic = await ctx.db.get(comicId);
    if (!comic || comic.panels[index]?.imageId) {
      await ctx.storage.delete(imageId);
      return null;
    }
    const panels = comic.panels.map((p, i) => (i === index ? { ...p, imageId } : p));
    const ready = panels.every((p) => p.imageId);
    await ctx.db.patch(comicId, { panels, status: ready ? "ready" : "drawing" });
    return null;
  },
});

export const settleEdition = internalMutation({
  args: { editionId: v.id("editions") },
  returns: v.null(),
  handler: async (ctx, { editionId }) => {
    const comics = await ctx.db
      .query("comics")
      .withIndex("by_edition_order", (q) => q.eq("editionId", editionId))
      .collect();
    if (comics.every((c) => c.status === "ready" || c.status === "failed")) {
      await ctx.db.patch(editionId, { status: "published", publishedAt: Date.now() });
    }
    return null;
  },
});

export const logRun = internalMutation({
  args: { date: v.string(), note: v.string(), startedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { date, note, startedAt }) => {
    await ctx.db.insert("runs", { kind: "seed", date, status: "ok", startedAt, finishedAt: Date.now(), note });
    return null;
  },
});

export const run = internalAction({
  args: {
    replace: v.optional(v.boolean()),
    leaveOneDrawing: v.optional(v.boolean()),
    fast: v.optional(v.boolean()),
  },
  returns: v.object({ today: v.string(), written: v.array(v.string()) }),
  handler: async (ctx, args): Promise<{ today: string; written: string[] }> => {
    const startedAt = Date.now();
    const today = pacificDate(startedAt);
    const scripts = getScriptProvider();
    const images = getImageProvider(args.fast ? { minDelayMs: 0, maxDelayMs: 0, size: 16 } : {});
    const written: string[] = [];
    const days: [string, SeedStory[]][] = [
      [addDays(today, -1), YESTERDAY_STORIES],
      [today, TODAY_STORIES],
    ];
    for (const [date, stories] of days) {
      const comics: (SeedStory & Script)[] = [];
      for (const story of stories) {
        const result = await scripts.writeScript(story);
        if (!result.ok) throw new Error(`seed script failed: ${result.reason}`);
        comics.push({ ...story, ...result.script });
      }
      const edition = await ctx.runMutation(internal.seed.writeEdition, {
        date,
        replace: args.replace ?? false,
        comics,
      });
      if (!edition) continue;
      written.push(date);
      const leaveDrawing = args.leaveOneDrawing === true && date === today;
      await Promise.all(
        edition.comicIds.flatMap((comicId, c) =>
          comics[c].panels.map(async (panel, index) => {
            if (leaveDrawing && c === comics.length - 1 && index >= 2) return;
            const image = await images.drawPanel({
              prompt: panelPrompt(panel.scene, panel.cast),
              scene: panel.scene,
              cast: panel.cast,
              section: comics[c].section,
              seed: `${date}:${c}:${index}`,
            });
            if (!image.ok) throw new Error(`seed image failed: ${image.reason}`);
            const imageId = await ctx.storage.store(new Blob([image.bytes as BlobPart], { type: image.contentType }));
            await ctx.runMutation(internal.seed.attachPanel, { comicId, index, imageId });
          }),
        ),
      );
      await ctx.runMutation(internal.seed.settleEdition, { editionId: edition.editionId });
    }
    await ctx.runMutation(internal.seed.logRun, {
      date: today,
      startedAt,
      note: written.length ? `seeded ${written.join(", ")}` : "nothing to seed",
    });
    return { today, written };
  },
});
