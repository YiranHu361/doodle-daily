import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { section, comicKind, editionStatus, reactionKind } from "../schema";

export const panelDTO = v.object({
  scene: v.string(),
  caption: v.string(),
  cast: v.array(v.string()),
  imageUrl: v.union(v.string(), v.null()),
});

export const comicDTO = v.object({
  _id: v.id("comics"),
  section,
  kind: comicKind,
  title: v.string(),
  realStory: v.string(),
  sourceName: v.string(),
  sourceUrl: v.string(),
  status: v.union(v.literal("scripted"), v.literal("drawing"), v.literal("ready")),
  order: v.number(),
  createdAt: v.number(),
  isNew: v.boolean(),
  unverified: v.boolean(),
  panels: v.array(panelDTO),
});

export const editionDTO = v.object({
  _id: v.id("editions"),
  date: v.string(),
  number: v.number(),
  status: editionStatus,
  comics: v.array(comicDTO),
  locked: v.optional(v.boolean()),
});

export const editionSummaryDTO = v.object({
  _id: v.id("editions"),
  date: v.string(),
  number: v.number(),
  status: editionStatus,
  comicCount: v.number(),
  coverUrl: v.union(v.string(), v.null()),
  locked: v.optional(v.boolean()),
});

export const reactionCountsDTO = v.object({
  lol: v.number(),
  wow: v.number(),
  yikes: v.number(),
  mine: v.union(reactionKind, v.null()),
});

export type ComicDTO = Infer<typeof comicDTO>;
export type EditionDTO = Infer<typeof editionDTO>;
export type EditionSummaryDTO = Infer<typeof editionSummaryDTO>;

export const MAX_EDITION_COMICS = 64;

export function isVisible(comic: Doc<"comics">): boolean {
  return comic.status !== "failed" && comic.hidden !== true && comic.panels.length === 4;
}

export function isCreatedFor(comic: Doc<"comics">, viewer: string | undefined): boolean {
  return comic.kind !== "commission" || (comic.owner !== undefined && comic.owner === viewer);
}

export async function visibleComics(ctx: QueryCtx, editionId: Doc<"editions">["_id"], viewer?: string) {
  const comics = await ctx.db
    .query("comics")
    .withIndex("by_edition_order", (q) => q.eq("editionId", editionId))
    .take(MAX_EDITION_COMICS);
  return comics.filter((c) => isVisible(c) && c.kind !== "paper-sample" && isCreatedFor(c, viewer));
}

export async function toComicDTO(ctx: QueryCtx, comic: Doc<"comics">): Promise<ComicDTO> {
  const panels = await Promise.all(
    comic.panels.map(async (p) => ({
      scene: p.scene,
      caption: p.caption,
      cast: p.cast,
      imageUrl: p.imageId ? await ctx.storage.getUrl(p.imageId) : null,
    })),
  );
  return {
    _id: comic._id,
    section: comic.section,
    kind: comic.kind,
    title: comic.title,
    realStory: comic.realStory,
    sourceName: comic.sourceName,
    sourceUrl: comic.sourceUrl,
    status: comic.status === "failed" ? "scripted" : comic.status,
    order: comic.order,
    createdAt: comic.createdAt,
    isNew: comic.fresh === true,
    unverified: comic.unverified === true,
    panels,
  };
}

export async function toEditionDTO(ctx: QueryCtx, edition: Doc<"editions">, comics: Doc<"comics">[]): Promise<EditionDTO> {
  return {
    _id: edition._id,
    date: edition.date,
    number: edition.number,
    status: edition.status,
    comics: await Promise.all(comics.map((c) => toComicDTO(ctx, c))),
  };
}
