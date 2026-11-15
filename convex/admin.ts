import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { pacificDate } from "./lib/dates";
import { COMIC_DEADLINE_MS, deleteComic, imageCap, settle } from "./pipeline";

export const IMAGE_USD = 0.06;
export const INPUT_USD_PER_MTOK = 4;
export const OUTPUT_USD_PER_MTOK = 20;

export const listDay = internalQuery({
  args: { date: v.string() },
  returns: v.array(
    v.object({
      comicId: v.id("comics"),
      order: v.number(),
      section: v.string(),
      kind: v.string(),
      title: v.string(),
      status: v.string(),
      hidden: v.boolean(),
      fresh: v.boolean(),
      panelsDrawn: v.number(),
      error: v.union(v.string(), v.null()),
      sourceName: v.string(),
      sourceUrl: v.string(),
    }),
  ),
  handler: async (ctx, { date }) => {
    const edition = await ctx.db
      .query("editions")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();
    if (!edition) return [];
    const comics = await ctx.db
      .query("comics")
      .withIndex("by_edition_order", (q) => q.eq("editionId", edition._id))
      .take(64);
    return comics.map((c) => ({
      comicId: c._id,
      order: c.order,
      section: c.section,
      kind: c.kind,
      title: c.title,
      status: c.status,
      hidden: c.hidden === true,
      fresh: c.fresh === true,
      panelsDrawn: c.panels.filter((p) => p.imageId).length,
      error: c.error ?? null,
      sourceName: c.sourceName,
      sourceUrl: c.sourceUrl,
    }));
  },
});

export const setHidden = internalMutation({
  args: { comicId: v.id("comics"), hidden: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { comicId, hidden }) => {
    const comic = await ctx.db.get(comicId);
    if (!comic) return null;
    await ctx.db.patch(comicId, { hidden: hidden || undefined });
    await settle(ctx, comic.editionId);
    return null;
  },
});

export const retryComic = internalMutation({
  args: { comicId: v.id("comics") },
  returns: v.union(v.literal("retrying"), v.literal("not_failed"), v.literal("spend_cap"), v.literal("missing")),
  handler: async (ctx, { comicId }) => {
    const comic = await ctx.db.get(comicId);
    if (!comic) return "missing" as const;
    if (comic.status !== "failed") return "not_failed" as const;
    const missing = comic.panels.map((p, i) => (p.imageId ? -1 : i)).filter((i) => i >= 0);
    const now = Date.now();
    const date = pacificDate(comic.createdAt);
    const row = await ctx.db
      .query("spend")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();
    if ((row?.imagesReserved ?? 0) + missing.length > imageCap()) return "spend_cap" as const;
    if (row) await ctx.db.patch(row._id, { imagesReserved: row.imagesReserved + missing.length });
    else await ctx.db.insert("spend", { date, imagesReserved: missing.length, imagesUsed: 0, scriptCalls: 0 });
    await ctx.db.patch(comicId, {
      status: "drawing",
      hidden: undefined,
      error: undefined,
      drawStartedAt: now,
      deadline: now + COMIC_DEADLINE_MS,
      panels: comic.panels.map((p) => (p.imageId ? p : { scene: p.scene, cast: p.cast, caption: p.caption })),
    });
    for (const index of missing) await ctx.scheduler.runAfter(0, internal.pipeline.drawPanel, { comicId, index, attempt: 1 });
    await ctx.scheduler.runAfter(COMIC_DEADLINE_MS, internal.pipeline.checkDeadline, { comicId });
    await settle(ctx, comic.editionId);
    return "retrying" as const;
  },
});

export const wipeDay = internalMutation({
  args: { date: v.string() },
  returns: v.number(),
  handler: async (ctx, { date }) => {
    const edition = await ctx.db
      .query("editions")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();
    if (!edition) return 0;
    const comics = await ctx.db
      .query("comics")
      .withIndex("by_edition_order", (q) => q.eq("editionId", edition._id))
      .take(64);
    for (const c of comics) await deleteComic(ctx, c, true);
    await ctx.db.delete(edition._id);
    return comics.length;
  },
});

export const spendToday = internalQuery({
  args: { date: v.optional(v.string()) },
  returns: v.object({
    date: v.string(),
    cap: v.number(),
    imagesReserved: v.number(),
    imagesUsed: v.number(),
    scriptCalls: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    estimatedUsd: v.number(),
  }),
  handler: async (ctx, args) => {
    const date = args.date ?? pacificDate(Date.now());
    const row = await ctx.db
      .query("spend")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();
    const inputTokens = row?.inputTokens ?? 0;
    const outputTokens = row?.outputTokens ?? 0;
    const imagesUsed = row?.imagesUsed ?? 0;
    const usd = imagesUsed * IMAGE_USD + (inputTokens * INPUT_USD_PER_MTOK + outputTokens * OUTPUT_USD_PER_MTOK) / 1e6;
    return {
      date,
      cap: imageCap(),
      imagesReserved: row?.imagesReserved ?? 0,
      imagesUsed,
      scriptCalls: row?.scriptCalls ?? 0,
      inputTokens,
      outputTokens,
      estimatedUsd: Math.round(usd * 100) / 100,
    };
  },
});
