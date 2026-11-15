import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { pacificDate } from "./lib/dates";
import { checkDeviceId } from "./lib/device";
import { USER_AGENT_HEADERS } from "./lib/feeds";
import { storyRefusal } from "./lib/filter";
import { UNVERIFIED_SENTENCE } from "./lib/script";
import { fetchText } from "./lib/http";
import { cut, decodeEntities, stripHtml } from "./lib/text";
import { createCheckout, planId, whop, whopConfig } from "./lib/whop";
import { commissionStatus, promo } from "./schema";

export const TOPIC_MAX = 140;
const LINK_MAX = 2000;
const IMAGES_PER_COMIC = 4;
const WATCH_EVERY_MS = 20_000;
const WATCH_LIMIT = 75;
export const COMMISSION_SOURCE = "Created by a reader";
export const NEEDS_SOURCE_MESSAGE = "That one needs a source. Paste a link to the article and Robo will draw it.";
export const UNREADABLE_LINK_MESSAGE = "Robo could not open that page. Type the headline instead.";

const PUBLISHERS: Record<string, string> = {
  "wsj.com": "The Wall Street Journal",
  "nytimes.com": "The New York Times",
  "bloomberg.com": "Bloomberg",
  "ft.com": "Financial Times",
  "reuters.com": "Reuters",
  "washingtonpost.com": "The Washington Post",
  "theinformation.com": "The Information",
  "economist.com": "The Economist",
  "businessinsider.com": "Business Insider",
  "cnbc.com": "CNBC",
};

export function publisherFor(link: string): string {
  const host = new URL(link).hostname.toLowerCase().replace(/^www\./, "");
  const known = Object.keys(PUBLISHERS).find((domain) => host === domain || host.endsWith(`.${domain}`));
  return known ? PUBLISHERS[known] : host;
}

export function slugHeadline(link: string): string | null {
  const segment = new URL(link).pathname.split("/").filter(Boolean).pop() ?? "";
  let slug = segment;
  try {
    slug = decodeURIComponent(segment);
  } catch {}
  const words = slug
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/-(?=[a-z0-9]*\d)[a-z0-9]{6,}$/i, "")
    .split(/[-_\s]+/)
    .filter(Boolean);
  if (words.length < 4) return null;
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type PageMeta = { title: string; description: string };

function metaContent(html: string, names: string[]): string {
  for (const name of names) {
    const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i").exec(html)?.[0];
    const content = tag ? /content=["']([^"']*)["']/i.exec(tag)?.[1] : undefined;
    if (content?.trim()) return content;
  }
  return "";
}

export function pageMeta(html: string): PageMeta {
  const head = html.slice(0, 200_000);
  const title = metaContent(head, ["og:title", "twitter:title"]) || (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "");
  const description = metaContent(head, ["og:description", "description", "twitter:description"]);
  const clean = (s: string) => decodeEntities(s).replace(/\s+/g, " ").trim();
  return { title: cut(clean(title), 200), description: cut(clean(description), 400) };
}

export const EXCERPT_MAX = 1500;
const MIN_READABLE = 300;

export function articleText(html: string): string {
  const body = html
    .slice(0, 2_000_000)
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|figure)\b[\s\S]*?<\/\1>/gi, " ");
  const scope = /<article\b[\s\S]*?<\/article>/i.exec(body)?.[0] ?? body;
  const paragraphs = [...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter((p) => p.split(" ").length >= 8);
  return paragraphs.join(" ").replace(/\s+/g, " ").trim();
}

export async function readArticle(link: string): Promise<string | null> {
  const res = await fetchPage(link);
  if (!res.ok) return null;
  const text = articleText(res.text);
  return text.length >= MIN_READABLE ? text.slice(0, EXCERPT_MAX) : null;
}

export function parseLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > LINK_MAX) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|0\.|\[)/i.test(url.hostname) || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export type LinkRead = { page: PageMeta; publisher: string; slug: { headline: string; fact: string } | null };

export function siteName(html: string, link: string): string {
  const name = decodeEntities(metaContent(html.slice(0, 200_000), ["og:site_name"])).replace(/\s+/g, " ").trim();
  return cut(name, 80) || publisherFor(link);
}

export function fetchPage(link: string) {
  return fetchText(link, { headers: USER_AGENT_HEADERS, timeoutMs: 6000 });
}

export async function readLink(link: string): Promise<LinkRead | null> {
  const res = await fetchPage(link);
  const page = res.ok ? pageMeta(res.text) : { title: "", description: "" };
  const publisher = res.ok ? siteName(res.text, link) : publisherFor(link);
  if (page.title) return { page, publisher, slug: null };
  const headline = slugHeadline(link);
  return headline ? { page, publisher, slug: { headline, fact: `A link a reader pasted from ${publisher} is titled: ${headline}. ${UNVERIFIED_SENTENCE}` } } : null;
}

const startResult = v.union(
  v.object({ ok: v.literal(true), commissionId: v.id("commissions"), url: v.string() }),
  v.object({
    ok: v.literal(false),
    reason: v.union(v.literal("not_allowed"), v.literal("spend_cap"), v.literal("bad_input"), v.literal("unavailable")),
    refusal: v.optional(
      v.union(v.literal("needs_source"), v.literal("private_life"), v.literal("tragedy"), v.literal("private_person"), v.literal("unreadable_link")),
    ),
    message: v.optional(v.string()),
  }),
);
type StartResult = typeof startResult.type;

export const create = internalMutation({
  args: {
    deviceId: v.string(),
    topic: v.string(),
    link: v.optional(v.string()),
    headline: v.string(),
    facts: v.array(v.string()),
    unverified: v.optional(v.boolean()),
    promo: v.optional(promo),
  },
  returns: v.id("commissions"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("commissions", { ...args, status: "awaiting_payment", createdAt: now, updatedAt: now });
  },
});

export const attachCheckout = internalMutation({
  args: { commissionId: v.id("commissions"), checkoutId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { commissionId, checkoutId }) => {
    if (checkoutId) await ctx.db.patch(commissionId, { checkoutId, updatedAt: Date.now() });
    else await ctx.db.delete(commissionId);
    return null;
  },
});

export const start = action({
  args: { deviceId: v.string(), topic: v.optional(v.string()), link: v.optional(v.string()) },
  returns: startResult,
  handler: async (ctx, args): Promise<StartResult> => {
    checkDeviceId(args.deviceId);
    const topic = (args.topic ?? "").replace(/\s+/g, " ").trim();
    const rawLink = (args.link ?? "").trim();
    if (topic.length > TOPIC_MAX || (!topic && !rawLink)) return { ok: false, reason: "bad_input" };
    let link: string | undefined;
    let page: PageMeta = { title: "", description: "" };
    let publisher = "";
    let slug: LinkRead["slug"] = null;
    if (rawLink) {
      const parsed = parseLink(rawLink);
      if (!parsed) return { ok: false, reason: "bad_input" };
      link = parsed;
      const read = await readLink(parsed);
      if (!read) return { ok: false, reason: "bad_input", refusal: "unreadable_link", message: UNREADABLE_LINK_MESSAGE };
      ({ page, publisher, slug } = read);
    }
    const headline = topic || page.title || slug?.headline || "";
    const facts = slug
      ? [slug.fact]
      : [
          ...new Set(
            [
              page.title ? `The linked page is titled ${page.title.replace(/[.!?]+$/, "")}.` : "",
              page.description,
              publisher ? `The article was published by ${publisher}.` : "",
              topic ? `A reader commissioned a comic about ${topic.replace(/[.!?]+$/, "")}.` : "",
              "The reader wants a light, friendly four-panel strip about it.",
            ].filter(Boolean),
          ),
        ];
    const refusal = storyRefusal(`${headline} ${facts.join(" ")}`, { sourced: !!link });
    if (refusal) return { ok: false, reason: "not_allowed", refusal, ...(refusal === "needs_source" ? { message: NEEDS_SOURCE_MESSAGE } : {}) };
    if ((await ctx.runQuery(internal.pipeline.capLeft, { date: pacificDate(Date.now()) })) < IMAGES_PER_COMIC) return { ok: false, reason: "spend_cap" };
    if (!whopConfig().ok) return { ok: false, reason: "unavailable" };
    const commissionId = await ctx.runMutation(internal.commissions.create, {
      deviceId: args.deviceId,
      topic: headline,
      link,
      headline,
      facts,
      unverified: slug ? true : undefined,
    });
    const checkout = await createCheckout(planId("commission"), { kind: "commission", deviceId: args.deviceId, commissionId });
    await ctx.runMutation(internal.commissions.attachCheckout, { commissionId, checkoutId: checkout.ok ? checkout.id : undefined });
    if (!checkout.ok) {
      console.error(`commission checkout failed: ${checkout.error}`);
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, commissionId, url: checkout.url };
  },
});

const mineItem = v.object({
  _id: v.id("commissions"),
  topic: v.string(),
  status: commissionStatus,
  comicId: v.union(v.id("comics"), v.null()),
  createdAt: v.number(),
});

export const mine = query({
  args: { deviceId: v.string() },
  returns: v.array(mineItem),
  handler: async (ctx, { deviceId }) => {
    checkDeviceId(deviceId);
    const rows = await ctx.db
      .query("commissions")
      .withIndex("by_device_createdAt", (q) => q.eq("deviceId", deviceId))
      .order("desc")
      .take(20);
    const out = [];
    for (const r of rows) {
      let status = r.status;
      if (status === "drawing" && r.comicId) {
        const comic = await ctx.db.get(r.comicId);
        if (comic?.status === "ready" && comic.hidden !== true) status = "ready";
        else if (!comic || comic.status === "failed") status = "failed";
      }
      out.push({ _id: r._id, topic: r.topic, status, comicId: status === "ready" ? (r.comicId ?? null) : null, createdAt: r.createdAt });
    }
    return out;
  },
});

// ---------- after payment ----------

export const markPaid = internalMutation({
  args: { commissionId: v.string(), deviceId: v.string(), paymentId: v.string(), variantId: v.optional(v.string()), checkoutId: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, { commissionId, deviceId, paymentId, variantId, checkoutId }) => {
    const id = ctx.db.normalizeId("commissions", commissionId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.deviceId !== deviceId) return "ignored: unknown commission";
    if (variantId && variantId !== planId("commission") && variantId !== planId("promo")) return "ignored: not the commission plan";
    if (checkoutId && row.checkoutId && checkoutId !== row.checkoutId) return "ignored: checkout mismatch";
    if (row.status !== "awaiting_payment") return `ignored: already ${row.status}`;
    await ctx.db.patch(row._id, { status: "paid", whopPaymentId: paymentId || undefined, error: undefined, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.commissions.draw, { commissionId: row._id });
    return "commission paid, drawing scheduled";
  },
});

export const notePaymentFailed = internalMutation({
  args: { commissionId: v.string() },
  returns: v.string(),
  handler: async (ctx, { commissionId }) => {
    const id = ctx.db.normalizeId("commissions", commissionId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.status !== "awaiting_payment") return "ignored";
    await ctx.db.patch(row._id, { error: "payment failed", updatedAt: Date.now() });
    return "commission payment failed";
  },
});

export const beginDraw = internalMutation({
  args: { commissionId: v.id("commissions") },
  returns: v.union(
    v.null(),
    v.object({ headline: v.string(), facts: v.array(v.string()), link: v.string(), deviceId: v.string(), unverified: v.boolean(), promo: v.optional(promo) }),
  ),
  handler: async (ctx, { commissionId }) => {
    const row = await ctx.db.get(commissionId);
    if (!row || row.status !== "paid") return null;
    await ctx.db.patch(commissionId, { status: "drawing", updatedAt: Date.now() });
    return { headline: row.headline, facts: row.facts, link: row.link ?? "", deviceId: row.deviceId, unverified: row.unverified === true, promo: row.promo };
  },
});

export const drawStarted = internalMutation({
  args: { commissionId: v.id("commissions"), comicId: v.id("comics") },
  returns: v.null(),
  handler: async (ctx, { commissionId, comicId }) => {
    await ctx.db.patch(commissionId, { comicId, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(WATCH_EVERY_MS, internal.commissions.watch, { commissionId, checks: 1 });
    return null;
  },
});

export const draw = internalAction({
  args: { commissionId: v.id("commissions") },
  returns: v.null(),
  handler: async (ctx, { commissionId }): Promise<null> => {
    const brief = await ctx.runMutation(internal.commissions.beginDraw, { commissionId });
    if (!brief) return null;
    try {
      const res = await ctx.runAction(internal.pipeline.drawFromBrief, {
        headline: brief.headline,
        facts: brief.facts,
        sourceName: brief.promo ? brief.promo.site : COMMISSION_SOURCE,
        sourceUrl: brief.link,
        kind: "commission",
        owner: brief.promo ? undefined : brief.deviceId,
        unverified: brief.unverified || undefined,
        ...(brief.promo ? { section: brief.promo.section, sponsor: { name: brief.promo.name, kind: brief.promo.persona, cta: brief.promo.cta } } : {}),
      });
      if (res.ok) await ctx.runMutation(internal.commissions.drawStarted, { commissionId, comicId: res.comicId });
      else await ctx.runMutation(internal.commissions.fail, { commissionId, error: `draw refused: ${res.reason}` });
    } catch (e) {
      await ctx.runMutation(internal.commissions.fail, { commissionId, error: e instanceof Error ? cut(e.message, 200) : "draw crashed" });
    }
    return null;
  },
});

export const watch = internalMutation({
  args: { commissionId: v.id("commissions"), checks: v.number() },
  returns: v.null(),
  handler: async (ctx, { commissionId, checks }) => {
    const row = await ctx.db.get(commissionId);
    if (!row || row.status !== "drawing" || !row.comicId) return null;
    const comic = await ctx.db.get(row.comicId);
    if (comic?.status === "ready" && comic.hidden !== true) {
      await ctx.db.patch(commissionId, { status: "ready", updatedAt: Date.now() });
      return null;
    }
    if (!comic || comic.status === "failed" || comic.hidden === true || checks >= WATCH_LIMIT) {
      await failCommission(ctx, commissionId, comic?.error ?? "comic did not finish");
      return null;
    }
    await ctx.scheduler.runAfter(WATCH_EVERY_MS, internal.commissions.watch, { commissionId, checks: checks + 1 });
    return null;
  },
});

async function failCommission(ctx: MutationCtx, commissionId: Id<"commissions">, error: string) {
  const row = await ctx.db.get(commissionId);
  if (!row || row.status === "failed" || row.status === "refunded" || row.status === "ready") return;
  await ctx.db.patch(commissionId, { status: "failed", error: cut(error, 300), updatedAt: Date.now() });
  if (row.whopPaymentId) await ctx.scheduler.runAfter(0, internal.commissions.refund, { commissionId });
}

export const fail = internalMutation({
  args: { commissionId: v.id("commissions"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { commissionId, error }) => {
    await failCommission(ctx, commissionId, error);
    return null;
  },
});

export const refundTarget = internalQuery({
  args: { commissionId: v.id("commissions") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { commissionId }) => {
    const row = await ctx.db.get(commissionId);
    return row && row.status === "failed" && row.whopPaymentId && !row.refundId ? row.whopPaymentId : null;
  },
});

export const refunded = internalMutation({
  args: { commissionId: v.id("commissions"), refundId: v.optional(v.string()), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { commissionId, refundId, error }) => {
    if (refundId) await ctx.db.patch(commissionId, { status: "refunded", refundId, refundOwed: undefined, updatedAt: Date.now() });
    else await ctx.db.patch(commissionId, { refundOwed: true, error: cut(`refund owed: ${error ?? "unknown"}`, 300), updatedAt: Date.now() });
    return null;
  },
});

export const refund = internalAction({
  args: { commissionId: v.id("commissions") },
  returns: v.null(),
  handler: async (ctx, { commissionId }): Promise<null> => {
    const paymentId = await ctx.runQuery(internal.commissions.refundTarget, { commissionId });
    if (!paymentId) return null;
    const res = await whop("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, {});
    const refundId = res.ok ? (typeof res.data.id === "string" ? res.data.id : paymentId) : undefined;
    await ctx.runMutation(internal.commissions.refunded, { commissionId, refundId, error: res.ok ? undefined : res.error });
    return null;
  },
});

export const inspect = internalQuery({
  args: { commissionId: v.id("commissions") },
  returns: v.any(),
  handler: async (ctx, { commissionId }) => {
    const row = await ctx.db.get(commissionId);
    if (!row) return null;
    const comic = row.comicId ? await ctx.db.get(row.comicId) : null;
    const comicInfo = comic ? { _id: comic._id, status: comic.status, kind: comic.kind, title: comic.title, panels: comic.panels.length, drawn: comic.panels.filter((p) => p.imageId).length } : null;
    return { ...row, comic: comicInfo } as unknown as Record<string, unknown> & { _id: Id<"commissions"> };
  },
});
