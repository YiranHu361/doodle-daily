import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { reactionKind } from "./schema";
import { isVisible, reactionCountsDTO } from "./lib/dto";

type Kind = "lol" | "wow" | "yikes";

const DEVICE_ID = /^[A-Za-z0-9-]{8,64}$/;

function checkDeviceId(deviceId: string) {
  if (!DEVICE_ID.test(deviceId)) throw new ConvexError("bad_device_id");
}

async function bump(ctx: MutationCtx, comicId: Id<"comics">, kind: Kind, delta: number) {
  const row = await ctx.db
    .query("reactionCounts")
    .withIndex("by_comic", (q) => q.eq("comicId", comicId))
    .unique();
  if (!row) {
    await ctx.db.insert("reactionCounts", {
      comicId,
      lol: 0,
      wow: 0,
      yikes: 0,
      [kind]: Math.max(0, delta),
    });
    return;
  }
  await ctx.db.patch(row._id, { [kind]: Math.max(0, row[kind] + delta) });
}

export const toggle = mutation({
  args: { comicId: v.id("comics"), deviceId: v.string(), kind: reactionKind },
  returns: v.null(),
  handler: async (ctx, { comicId, deviceId, kind }) => {
    checkDeviceId(deviceId);
    const comic = await ctx.db.get(comicId);
    if (!comic || !isVisible(comic)) throw new ConvexError("comic_not_found");
    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_comic_device", (q) => q.eq("comicId", comicId).eq("deviceId", deviceId))
      .unique();
    if (existing && existing.kind === kind) {
      await ctx.db.delete(existing._id);
      await bump(ctx, comicId, kind, -1);
      return null;
    }
    if (existing) {
      await ctx.db.patch(existing._id, { kind, createdAt: Date.now() });
      await bump(ctx, comicId, existing.kind, -1);
    } else {
      await ctx.db.insert("reactions", { comicId, deviceId, kind, createdAt: Date.now() });
    }
    await bump(ctx, comicId, kind, 1);
    return null;
  },
});

export const counts = query({
  args: { comicId: v.id("comics"), deviceId: v.string() },
  returns: reactionCountsDTO,
  handler: async (ctx, { comicId, deviceId }) => {
    const row = await ctx.db
      .query("reactionCounts")
      .withIndex("by_comic", (q) => q.eq("comicId", comicId))
      .unique();
    const mine = DEVICE_ID.test(deviceId)
      ? await ctx.db
          .query("reactions")
          .withIndex("by_comic_device", (q) => q.eq("comicId", comicId).eq("deviceId", deviceId))
          .unique()
      : null;
    return {
      lol: row?.lol ?? 0,
      wow: row?.wow ?? 0,
      yikes: row?.yikes ?? 0,
      mine: mine?.kind ?? null,
    };
  },
});
