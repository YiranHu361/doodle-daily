import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { CAST } from "./lib/cast";
import { pacificDate } from "./lib/dates";
import { decodePng, downscale, shrinkPng } from "./lib/png";
import { getImageProvider, sheetPrompt } from "./providers";
import { encodePng } from "./providers/placeholder";
import { castName } from "./schema";

const REF_SIZE = 512;

export const saveSheet = internalMutation({
  args: { name: castName, sheetId: v.id("_storage"), refId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { name, sheetId, refId }) => {
    const member = CAST.find((c) => c.name === name)!;
    const row = await ctx.db
      .query("cast")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (row) {
      for (const old of [row.sheetId, row.refId]) if (old && old !== sheetId && old !== refId) await ctx.storage.delete(old);
      await ctx.db.patch(row._id, { description: member.description, sheetId, refId, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("cast", { name, description: member.description, sheetId, refId, updatedAt: Date.now() });
    }
    return null;
  },
});

export const sheets = internalQuery({
  args: {},
  returns: v.array(v.object({ name: v.string(), sheetUrl: v.union(v.string(), v.null()), refUrl: v.union(v.string(), v.null()) })),
  handler: async (ctx) => {
    const rows = await ctx.db.query("cast").take(10);
    return await Promise.all(
      rows.map(async (r) => ({
        name: r.name,
        sheetUrl: r.sheetId ? await ctx.storage.getUrl(r.sheetId) : null,
        refUrl: r.refId ? await ctx.storage.getUrl(r.refId) : null,
      })),
    );
  },
});

export const sheetIds = internalQuery({
  args: {},
  returns: v.array(v.object({ name: castName, sheetId: v.id("_storage") })),
  handler: async (ctx) => {
    const rows = await ctx.db.query("cast").take(10);
    return rows.flatMap((r) => (r.sheetId ? [{ name: r.name, sheetId: r.sheetId }] : []));
  },
});

export const refreshRefs = internalAction({
  args: {},
  returns: v.array(v.object({ name: v.string(), note: v.string() })),
  handler: async (ctx): Promise<{ name: string; note: string }[]> => {
    const rows = await ctx.runQuery(internal.cast.sheetIds, {});
    const notes: { name: string; note: string }[] = [];
    for (const row of rows) {
      const blob = await ctx.storage.get(row.sheetId);
      if (!blob) {
        notes.push({ name: row.name, note: "sheet missing" });
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      try {
        const img = await decodePng(bytes);
        if (!img) throw new Error("not a decodable PNG");
        const small = await encodePng(downscale(img, REF_SIZE), REF_SIZE);
        const refId = await ctx.storage.store(new Blob([small as BlobPart], { type: "image/png" }));
        await ctx.runMutation(internal.cast.saveSheet, { name: row.name, sheetId: row.sheetId, refId });
        notes.push({ name: row.name, note: `reference ${small.length} bytes` });
      } catch (e) {
        notes.push({ name: row.name, note: `error: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
    return notes;
  },
});

export const drawSheets = internalAction({
  args: { names: v.optional(v.array(castName)) },
  returns: v.array(v.object({ name: v.string(), ok: v.boolean(), note: v.string() })),
  handler: async (ctx, { names }): Promise<{ name: string; ok: boolean; note: string }[]> => {
    const wanted = CAST.filter((c) => !names || names.includes(c.name));
    const date = pacificDate(Date.now());
    if (!(await ctx.runMutation(internal.pipeline.reserveImages, { date, count: wanted.length }))) {
      return wanted.map((c) => ({ name: c.name, ok: false, note: "image cap reached" }));
    }
    const provider = getImageProvider();
    return await Promise.all(
      wanted.map(async (member) => {
        const result = await provider.drawPanel({
          prompt: sheetPrompt(member.name),
          scene: "character reference sheet",
          cast: [member.name],
          section: "tech",
          seed: `sheet:${member.name}`,
          format: "png",
        });
        if (!result.ok) return { name: member.name, ok: false, note: result.reason };
        await ctx.runMutation(internal.pipeline.noteImageUsed, { date });
        const small = await shrinkPng(result.bytes, REF_SIZE);
        const sheetId = await ctx.storage.store(new Blob([result.bytes as BlobPart], { type: result.contentType }));
        const refId = small && small !== result.bytes ? await ctx.storage.store(new Blob([small as BlobPart], { type: "image/png" })) : sheetId;
        await ctx.runMutation(internal.cast.saveSheet, { name: member.name, sheetId, refId });
        return { name: member.name, ok: true, note: `${result.bytes.length} bytes, reference ${(small ?? result.bytes).length} bytes` };
      }),
    );
  },
});
