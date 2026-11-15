import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { activeEntitlements } from "./billing";
import { pacificDate } from "./lib/dates";
import { checkDeviceId } from "./lib/device";
import { isSafeStory } from "./lib/filter";
import { cut } from "./lib/text";
import { createCheckout, whop, whopConfig } from "./lib/whop";

export const NAME_MAX = 30;
export const NICHE_MAX = 80;
export const MAX_PAPERS_PER_DEVICE = 2;
const IMAGES_PER_COMIC = 4;

const createResult = v.union(
  v.object({ ok: v.literal(true), paperId: v.id("papers"), productId: v.string(), planId: v.string(), purchaseUrl: v.string() }),
  v.object({ ok: v.literal(false), reason: v.union(v.literal("bad_input"), v.literal("not_allowed"), v.literal("limit"), v.literal("spend_cap"), v.literal("unavailable")) }),
);
type CreateResult = typeof createResult.type;

export const reserve = internalMutation({
  args: { deviceId: v.string(), name: v.string(), niche: v.string(), priceUsd: v.number() },
  returns: v.union(v.id("papers"), v.null()),
  handler: async (ctx, args) => {
    const mine = await ctx.db
      .query("papers")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .take(MAX_PAPERS_PER_DEVICE + 1);
    if (mine.length >= MAX_PAPERS_PER_DEVICE) return null;
    return await ctx.db.insert("papers", { ...args, status: "creating", createdAt: Date.now() });
  },
});

export const finishCreate = internalMutation({
  args: { paperId: v.id("papers"), whop: v.optional(v.object({ productId: v.string(), planId: v.string(), purchaseUrl: v.string() })) },
  returns: v.null(),
  handler: async (ctx, { paperId, whop }) => {
    if (!whop) {
      await ctx.db.delete(paperId);
      return null;
    }
    await ctx.db.patch(paperId, { ...whop, status: "live" });
    await ctx.scheduler.runAfter(0, internal.papers.drawSample, { paperId });
    return null;
  },
});

export const create = action({
  args: { deviceId: v.string(), name: v.string(), niche: v.string(), priceUsd: v.number() },
  returns: createResult,
  handler: async (ctx, args): Promise<CreateResult> => {
    checkDeviceId(args.deviceId);
    const name = args.name.replace(/\s+/g, " ").trim();
    const niche = args.niche.replace(/\s+/g, " ").trim();
    const priceUsd = Math.round(args.priceUsd * 100) / 100;
    if (!name || name.length > NAME_MAX || !niche || niche.length > NICHE_MAX) return { ok: false, reason: "bad_input" };
    if (!Number.isFinite(priceUsd) || priceUsd < 1 || priceUsd > 20) return { ok: false, reason: "bad_input" };
    if (!isSafeStory(name) || !isSafeStory(niche)) return { ok: false, reason: "not_allowed" };
    if ((await ctx.runQuery(internal.pipeline.capLeft, { date: pacificDate(Date.now()) })) < IMAGES_PER_COMIC) return { ok: false, reason: "spend_cap" };
    const config = whopConfig();
    if (!config.ok) return { ok: false, reason: "unavailable" };
    const paperId = await ctx.runMutation(internal.papers.reserve, { deviceId: args.deviceId, name, niche, priceUsd });
    if (!paperId) return { ok: false, reason: "limit" };
    const product = await whop("POST", "/products", {
      ...(config.companyId ? { account_id: config.companyId } : {}),
      title: name,
      description: cut(`A daily comic paper about ${niche}, drawn by Robo for Doodle Daily.`, 500),
      visibility: "visible",
      metadata: { doodlePaperId: paperId },
    });
    const productId = product.ok && typeof product.data.id === "string" ? product.data.id : null;
    const variant = productId
      ? await whop("POST", "/variants", {
          ...(config.companyId ? { account_id: config.companyId } : {}),
          product_id: productId,
          title: `${name} monthly`,
          billing_type: "renewal",
          billing_period: 30,
          initial_price: 0,
          renewal_price: priceUsd,
          currency: "usd",
          visibility: "visible",
          release_method: "buy_now",
          metadata: { doodlePaperId: paperId },
        })
      : null;
    const planId = variant?.ok && typeof variant.data.id === "string" ? variant.data.id : null;
    const purchaseUrl = variant?.ok && typeof variant.data.purchase_url === "string" ? variant.data.purchase_url : null;
    if (!productId || !planId || !purchaseUrl) {
      console.error(`paper create failed: ${!product.ok ? product.error : variant && !variant.ok ? variant.error : "missing ids"}`);
      await ctx.runMutation(internal.papers.finishCreate, { paperId });
      return { ok: false, reason: "unavailable" };
    }
    await ctx.runMutation(internal.papers.finishCreate, { paperId, whop: { productId, planId, purchaseUrl } });
    return { ok: true, paperId, productId, planId, purchaseUrl };
  },
});

export const sampleBrief = internalQuery({
  args: { paperId: v.id("papers") },
  returns: v.union(v.null(), v.object({ name: v.string(), niche: v.string() })),
  handler: async (ctx, { paperId }) => {
    const paper = await ctx.db.get(paperId);
    return paper && !paper.sampleComicId ? { name: paper.name, niche: paper.niche } : null;
  },
});

export const sampleDone = internalMutation({
  args: { paperId: v.id("papers"), comicId: v.optional(v.id("comics")), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { paperId, comicId, error }) => {
    await ctx.db.patch(paperId, { sampleComicId: comicId, sampleError: error });
    return null;
  },
});

export const drawSample = internalAction({
  args: { paperId: v.id("papers") },
  returns: v.null(),
  handler: async (ctx, { paperId }): Promise<null> => {
    const brief = await ctx.runQuery(internal.papers.sampleBrief, { paperId });
    if (!brief) return null;
    const res = await ctx.runAction(internal.pipeline.drawFromBrief, {
      headline: `${brief.name}: the first issue about ${brief.niche}`,
      facts: [`${brief.name} is a brand new daily comic paper about ${brief.niche}.`, `This sample shows what a typical day in ${brief.niche} looks like.`],
      sourceName: brief.name,
      sourceUrl: "",
      kind: "paper-sample",
    });
    await ctx.runMutation(internal.papers.sampleDone, res.ok ? { paperId, comicId: res.comicId } : { paperId, error: res.reason });
    return null;
  },
});

const paperItem = v.object({
  _id: v.id("papers"),
  name: v.string(),
  niche: v.string(),
  priceUsd: v.number(),
  purchaseUrl: v.string(),
  mine: v.boolean(),
  locked: v.boolean(),
  subscribers: v.number(),
  sample: v.object({
    status: v.union(v.literal("drawing"), v.literal("ready"), v.literal("failed")),
    title: v.union(v.string(), v.null()),
    firstPanelUrl: v.union(v.string(), v.null()),
  }),
  createdAt: v.number(),
});

export const list = query({
  args: { deviceId: v.string() },
  returns: v.array(paperItem),
  handler: async (ctx, { deviceId }) => {
    checkDeviceId(deviceId);
    const subscribed = new Set<Id<"papers"> | undefined>((await activeEntitlements(ctx, deviceId, "paper")).map((e) => e.paperId));
    const papers = await ctx.db.query("papers").withIndex("by_createdAt").order("desc").take(50);
    const out = [];
    const now = Date.now();
    for (const p of papers) {
      if (p.status !== "live" || !p.purchaseUrl) continue;
      const comic = p.sampleComicId ? await ctx.db.get(p.sampleComicId) : null;
      const firstImage = comic?.panels[0]?.imageId;
      const failed = !!p.sampleError || comic?.status === "failed" || comic?.hidden === true;
      const subs = await ctx.db
        .query("entitlements")
        .withIndex("by_paper", (q) => q.eq("paperId", p._id))
        .take(500);
      out.push({
        _id: p._id,
        name: p.name,
        niche: p.niche,
        priceUsd: p.priceUsd,
        purchaseUrl: p.purchaseUrl,
        mine: p.deviceId === deviceId,
        locked: !subscribed.has(p._id),
        subscribers: subs.filter((s) => (s.status === "active" || s.status === "trialing") && (s.periodEnd === undefined || s.periodEnd > now)).length,
        sample: {
          status: failed ? ("failed" as const) : comic?.status === "ready" ? ("ready" as const) : ("drawing" as const),
          title: comic && !failed ? comic.title : null,
          firstPanelUrl: firstImage && !failed ? await ctx.storage.getUrl(firstImage) : null,
        },
        createdAt: p.createdAt,
      });
    }
    return out;
  },
});

export const paperPlan = internalQuery({
  args: { paperId: v.id("papers") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { paperId }) => {
    const paper = await ctx.db.get(paperId);
    return paper?.status === "live" && paper.planId ? paper.planId : null;
  },
});

export const startCheckout = action({
  args: { deviceId: v.string(), paperId: v.id("papers") },
  returns: v.union(v.object({ ok: v.literal(true), url: v.string() }), v.object({ ok: v.literal(false), reason: v.union(v.literal("not_found"), v.literal("unavailable")) })),
  handler: async (ctx, { deviceId, paperId }): Promise<{ ok: true; url: string } | { ok: false; reason: "not_found" | "unavailable" }> => {
    checkDeviceId(deviceId);
    if (!whopConfig().ok) return { ok: false, reason: "unavailable" };
    const plan = await ctx.runQuery(internal.papers.paperPlan, { paperId });
    if (!plan) return { ok: false, reason: "not_found" };
    const checkout = await createCheckout(plan, { kind: "paper", deviceId, paperId });
    if (!checkout.ok) {
      console.error(`paper checkout failed: ${checkout.error}`);
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, url: checkout.url };
  },
});
