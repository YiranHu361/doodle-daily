import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const section = v.union(
  v.literal("tech"),
  v.literal("money"),
  v.literal("culture"),
  v.literal("memes"),
);
export const comicKind = v.union(v.literal("news"), v.literal("meme"), v.literal("commission"));
export const comicStatus = v.union(
  v.literal("scripted"),
  v.literal("drawing"),
  v.literal("ready"),
  v.literal("failed"),
);
export const editionStatus = v.union(v.literal("building"), v.literal("published"));
export const reactionKind = v.union(v.literal("lol"), v.literal("wow"), v.literal("yikes"));
export const castName = v.union(
  v.literal("Boss Blob"),
  v.literal("Coin"),
  v.literal("Robo"),
  v.literal("Newsie"),
  v.literal("The Crowd"),
);

export const panel = v.object({
  scene: v.string(),
  cast: v.array(v.string()),
  caption: v.string(),
  imageId: v.optional(v.id("_storage")),
  attempts: v.optional(v.number()),
  claimedAt: v.optional(v.number()),
});

export default defineSchema({
  items: defineTable({
    section,
    source: v.string(),
    publisher: v.string(),
    title: v.string(),
    summary: v.string(),
    url: v.string(),
    normalizedUrl: v.string(),
    publishedAt: v.number(),
    fetchedAt: v.number(),
  })
    .index("by_normalizedUrl", ["normalizedUrl"])
    .index("by_section_publishedAt", ["section", "publishedAt"])
    .index("by_fetchedAt", ["fetchedAt"]),

  stories: defineTable({
    section,
    kind: comicKind,
    headline: v.string(),
    facts: v.array(v.string()),
    itemIds: v.array(v.id("items")),
    sourceName: v.string(),
    sourceUrl: v.string(),
    score: v.number(),
    whyFunny: v.optional(v.string()),
    format: v.optional(v.string()),
    used: v.boolean(),
    claimedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_used_createdAt", ["used", "createdAt"]),

  comics: defineTable({
    editionId: v.id("editions"),
    storyId: v.optional(v.id("stories")),
    section,
    kind: comicKind,
    title: v.string(),
    realStory: v.string(),
    sourceName: v.string(),
    sourceUrl: v.string(),
    status: comicStatus,
    hidden: v.optional(v.boolean()),
    fresh: v.optional(v.boolean()),
    lockToken: v.optional(v.string()),
    drawStartedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    order: v.number(),
    createdAt: v.number(),
    deadline: v.number(),
    panels: v.array(panel),
  })
    .index("by_edition_order", ["editionId", "order"])
    .index("by_status_deadline", ["status", "deadline"]),

  editions: defineTable({
    date: v.string(),
    number: v.number(),
    status: editionStatus,
    createdAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index("by_date", ["date"])
    .index("by_number", ["number"]),

  reactions: defineTable({
    comicId: v.id("comics"),
    deviceId: v.string(),
    kind: reactionKind,
    createdAt: v.number(),
  }).index("by_comic_device", ["comicId", "deviceId"]),

  reactionCounts: defineTable({
    comicId: v.id("comics"),
    lol: v.number(),
    wow: v.number(),
    yikes: v.number(),
  }).index("by_comic", ["comicId"]),

  cast: defineTable({
    name: castName,
    description: v.string(),
    sheetId: v.optional(v.id("_storage")),
    refId: v.optional(v.id("_storage")),
    updatedAt: v.optional(v.number()),
  }).index("by_name", ["name"]),

  spend: defineTable({
    date: v.string(),
    imagesReserved: v.number(),
    imagesUsed: v.number(),
    scriptCalls: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  }).index("by_date", ["date"]),

  locks: defineTable({
    name: v.string(),
    holder: v.string(),
    expiresAt: v.number(),
  }).index("by_name", ["name"]),

  slots: defineTable({
    slot: v.number(),
    holder: v.optional(v.string()),
    expiresAt: v.number(),
  }).index("by_slot", ["slot"]),

  memeFormats: defineTable({
    name: v.string(),
    fetchedAt: v.number(),
  }).index("by_name", ["name"]),

  runs: defineTable({
    kind: v.string(),
    date: v.optional(v.string()),
    status: v.union(v.literal("running"), v.literal("ok"), v.literal("failed")),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    note: v.string(),
  }).index("by_kind_startedAt", ["kind", "startedAt"]),
});
