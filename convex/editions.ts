import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { plusEntitlement } from "./billing";
import { addDays, pacificDate } from "./lib/dates";
import { editionDTO, editionSummaryDTO, toEditionDTO, visibleComics, type EditionDTO, type EditionSummaryDTO } from "./lib/dto";

const TODAY_LOOKBACK = 7;
const LIST_LIMIT = 30;

async function oldestOpenDate(ctx: QueryCtx, deviceId: string | undefined): Promise<string> {
  if (await plusEntitlement(ctx, deviceId)) return "";
  return addDays(pacificDate(Date.now()), -1);
}

export const today = query({
  args: { deviceId: v.optional(v.string()) },
  returns: v.union(editionDTO, v.null()),
  handler: async (ctx, { deviceId }): Promise<EditionDTO | null> => {
    const recent = await ctx.db.query("editions").withIndex("by_date").order("desc").take(TODAY_LOOKBACK);
    for (const edition of recent) {
      const comics = await visibleComics(ctx, edition._id, deviceId);
      if (comics.length > 0) return toEditionDTO(ctx, edition, comics);
    }
    return null;
  },
});

export const byDate = query({
  args: { date: v.string(), deviceId: v.optional(v.string()) },
  returns: v.union(editionDTO, v.null()),
  handler: async (ctx, { date, deviceId }): Promise<EditionDTO | null> => {
    const edition = await ctx.db
      .query("editions")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();
    if (!edition) return null;
    const comics = await visibleComics(ctx, edition._id, deviceId);
    if (comics.length === 0) return null;
    if (edition.date < (await oldestOpenDate(ctx, deviceId))) {
      return { _id: edition._id, date: edition.date, number: edition.number, status: edition.status, comics: [], locked: true };
    }
    return toEditionDTO(ctx, edition, comics);
  },
});

export const list = query({
  args: { deviceId: v.optional(v.string()) },
  returns: v.array(editionSummaryDTO),
  handler: async (ctx, { deviceId }): Promise<EditionSummaryDTO[]> => {
    const openFrom = await oldestOpenDate(ctx, deviceId);
    const editions = await ctx.db.query("editions").withIndex("by_date").order("desc").take(LIST_LIMIT);
    const summaries: EditionSummaryDTO[] = [];
    for (const edition of editions) {
      const comics = await visibleComics(ctx, edition._id, deviceId);
      if (comics.length === 0) continue;
      const coverId = comics.find((c) => c.panels[0].imageId)?.panels[0].imageId;
      summaries.push({
        _id: edition._id,
        date: edition.date,
        number: edition.number,
        status: edition.status,
        comicCount: comics.length,
        coverUrl: coverId ? await ctx.storage.getUrl(coverId) : null,
        ...(edition.date < openFrom ? { locked: true } : {}),
      });
    }
    return summaries;
  },
});
