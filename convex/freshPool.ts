import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { pacificDate } from "./lib/dates";
import { createEdition, fallbackPick, newestEdition, release, replaceTop, searchHarder, settle, WIDE_STORY_WINDOW_MS, writeComic } from "./pipeline";
import { getScriptProvider } from "./providers";

export const REVEAL_DELAY_MS = 7000;
const POOL_LOCK = "pool";
const POOL_LOCK_MS = 5 * 60 * 1000;
const RETRY_BUSY_MS = 30_000;
const IMAGES_PER_COMIC = 4;

export function poolSize(): number {
  const n = Number(process.env.FRESH_POOL_SIZE);
  return Number.isInteger(n) && n >= 0 ? n : 5;
}

export const status = internalQuery({
  args: {},
  returns: v.object({ size: v.number(), ready: v.number(), drawing: v.number(), revealing: v.number() }),
  handler: async (ctx) => {
    const pooled = await ctx.db
      .query("comics")
      .withIndex("by_pooled", (q) => q.eq("pooled", true))
      .take(64);
    const waiting = pooled.filter((c) => c.revealAt === undefined);
    return {
      size: poolSize(),
      ready: waiting.filter((c) => c.status === "ready").length,
      drawing: waiting.filter((c) => c.status === "drawing" || c.status === "scripted").length,
      revealing: pooled.length - waiting.length,
    };
  },
});

export const claim = internalMutation({
  args: { lockToken: v.optional(v.string()) },
  returns: v.union(v.id("comics"), v.null()),
  handler: async (ctx, { lockToken }) => {
    const pooled = await ctx.db
      .query("comics")
      .withIndex("by_pooled", (q) => q.eq("pooled", true))
      .take(64);
    const comic = pooled.find((c) => c.status === "ready" && c.revealAt === undefined);
    if (!comic) return null;
    await ctx.db.patch(comic._id, { revealAt: Date.now() + REVEAL_DELAY_MS, lockToken });
    await ctx.scheduler.runAfter(REVEAL_DELAY_MS, internal.freshPool.reveal, { comicId: comic._id });
    await ctx.scheduler.runAfter(0, internal.freshPool.topUp, {});
    return comic._id;
  },
});

export const reveal = internalMutation({
  args: { comicId: v.id("comics") },
  returns: v.null(),
  handler: async (ctx, { comicId }) => {
    const comic = await ctx.db.get(comicId);
    if (!comic || comic.pooled !== true) return null;
    const now = Date.now();
    const edition = (await newestEdition(ctx)) ?? (await createEdition(ctx, pacificDate(now)));
    const replaced = await replaceTop(ctx, edition._id, now);
    const top = replaced
      ? null
      : await ctx.db
          .query("comics")
          .withIndex("by_edition_order", (q) => q.eq("editionId", edition._id))
          .order("asc")
          .first();
    await ctx.db.patch(comicId, {
      editionId: edition._id,
      order: replaced ? replaced.order : top ? top.order - 1 : 0,
      createdAt: now,
      fresh: true,
      pooled: undefined,
      revealAt: undefined,
      lockToken: undefined,
    });
    if (comic.lockToken) await release(ctx, "fresh", comic.lockToken);
    await settle(ctx, edition._id);
    return null;
  },
});

const topUpResult = v.object({ status: v.union(v.literal("busy"), v.literal("ok")), started: v.number(), note: v.string() });
type TopUpResult = typeof topUpResult.type;

export const topUp = internalAction({
  args: { retried: v.optional(v.boolean()) },
  returns: topUpResult,
  handler: async (ctx, { retried }): Promise<TopUpResult> => {
    const holder = crypto.randomUUID();
    if (!(await ctx.runMutation(internal.pipeline.acquireLock, { name: POOL_LOCK, holder, ttlMs: POOL_LOCK_MS }))) {
      if (!retried) await ctx.scheduler.runAfter(RETRY_BUSY_MS, internal.freshPool.topUp, { retried: true });
      return { status: "busy", started: 0, note: "another top-up holds the lock" };
    }
    const notes: string[] = [];
    let started = 0;
    let searched = false;
    try {
      const provider = getScriptProvider();
      const date = pacificDate(Date.now());
      for (let round = 0; round < poolSize() * 2; round++) {
        const pool = await ctx.runQuery(internal.freshPool.status, {});
        if (pool.ready + pool.drawing >= pool.size) break;
        if ((await ctx.runQuery(internal.pipeline.capLeft, { date })) < IMAGES_PER_COMIC) {
          notes.push("image cap reached");
          break;
        }
        const best = async (): Promise<Id<"stories"> | null> =>
          (await ctx.runQuery(internal.pipeline.bestUnusedStory, { now: Date.now() })) ??
          (await ctx.runQuery(internal.pipeline.bestUnusedStory, { now: Date.now(), windowMs: WIDE_STORY_WINDOW_MS }));
        let storyId: Id<"stories"> | null = (await best()) ?? (await fallbackPick(ctx, provider, date));
        if (!storyId && !searched) {
          searched = true;
          notes.push(...(await searchHarder(ctx)));
          storyId = await best();
        }
        if (!storyId) {
          notes.push("no unused story");
          break;
        }
        const outcome = await writeComic(ctx, provider, storyId, { pooled: true });
        if (outcome.ok) started++;
        else notes.push(`${outcome.reason}${outcome.detail ? ` (${outcome.detail})` : ""}`);
        if (!outcome.ok && outcome.reason === "spend_cap") break;
      }
    } finally {
      await ctx.runMutation(internal.pipeline.releaseLock, { name: POOL_LOCK, holder });
    }
    return { status: "ok", started, note: notes.join(" | ") };
  },
});
