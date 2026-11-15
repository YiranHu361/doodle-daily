import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { httpAction, internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { pageMeta, parseLink, TOPIC_MAX, type PageMeta } from "./commissions";
import { pacificDate } from "./lib/dates";
import { isVisible, visibleComics } from "./lib/dto";
import { USER_AGENT_HEADERS } from "./lib/feeds";
import { storyRefusal } from "./lib/filter";
import { fetchText } from "./lib/http";
import { constantTimeEqual } from "./lib/retry";
import { cut } from "./lib/text";
import { imageCap } from "./pipeline";
import { textFailure } from "./schema";

export const TEXTS_PER_DAY = 2;
const IMAGES_PER_COMIC = 4;
const WATCH_EVERY_MS = 10_000;
const WATCH_LIMIT = 150;
const SECRET_MIN = 24;
const SENDER_MAX = 120;
const NOTICE_TIMEOUT_MS = 10_000;
const KEIKI_API = "https://onkeiki.com/api/v1/developer";
export const TEXT_SOURCE = "Texted in by a reader";

type TextFailure = typeof textFailure.type;

export const FRIENDLY: Record<TextFailure, string> = {
  limit: "That's your two comics for today. Text me again tomorrow.",
  spend_cap: "The crayon box is empty for today. Try again tomorrow.",
  unsafe: "That one's not for the funny pages. Send me a lighter story?",
  needs_source: "Send me a link to the article for that one, so I draw what was really reported.",
  bad_link: "I couldn't open that link. Try another one, or tell me the story in a few words.",
  bad_input: "Send me an article link or a few words, like \"the Fed meeting\".",
  bad_script: "My crayon snapped on that one. Try a different story?",
  unfinished: "My crayon snapped on that one. Try a different story?",
};

export function appLink(comicId: string): string {
  return `doodledaily://reader/${comicId}`;
}

export function textCommissionCheckoutUrl(_sender: string): string | null {
  return null;
}

export function splitRequest(raw: string): { link: string | null; topic: string } {
  const text = raw.replace(/\s+/g, " ").trim();
  const match = /https?:\/\/\S+/i.exec(text);
  const link = match ? match[0].replace(/[)\]}>.,!?'"]+$/, "") : null;
  const topic = (match ? text.replace(match[0], " ") : text).replace(/\s+/g, " ").trim();
  return { link, topic };
}

export function briefFor(topic: string, page: PageMeta): { headline: string; facts: string[] } {
  const headline = page.title || topic;
  const facts = [
    ...new Set(
      [
        page.title ? `The linked article is titled ${page.title.replace(/[.!?]+$/, "")}.` : "",
        page.description,
        topic ? `A reader texted in asking for a comic about ${topic.replace(/[.!?]+$/, "")}.` : "",
        "The reader wants a light, friendly four-panel strip about it.",
      ].filter(Boolean),
    ),
  ];
  return { headline, facts };
}

const comicOut = v.object({
  status: v.literal("ready"),
  title: v.string(),
  panels: v.array(v.object({ imageUrl: v.string(), caption: v.string() })),
  realStory: v.string(),
  sourceName: v.string(),
  sourceUrl: v.string(),
  appLink: v.string(),
});
type ComicOut = typeof comicOut.type;
const statusOut = v.union(
  comicOut,
  v.object({ status: v.literal("drawing"), message: v.string() }),
  v.object({ status: v.literal("failed"), reason: v.string() }),
  v.object({ status: v.literal("not_found"), reason: v.string() }),
);
type StatusOut = typeof statusOut.type;

async function readyComic(ctx: QueryCtx, comic: Doc<"comics">): Promise<ComicOut | null> {
  if (comic.status !== "ready" || !isVisible(comic)) return null;
  const panels: { imageUrl: string; caption: string }[] = [];
  for (const p of comic.panels) {
    const imageUrl = p.imageId ? await ctx.storage.getUrl(p.imageId) : null;
    if (!imageUrl) return null;
    panels.push({ imageUrl, caption: p.caption });
  }
  return {
    status: "ready",
    title: comic.title,
    panels,
    realStory: comic.realStory,
    sourceName: comic.sourceName,
    sourceUrl: comic.sourceUrl,
    appLink: appLink(comic._id),
  };
}

// ---------- commission ----------

const createResult = v.union(
  v.object({ ok: v.literal(true), commissionId: v.id("textCommissions") }),
  v.object({ ok: v.literal(false), reason: textFailure }),
);

export const createCommission = internalMutation({
  args: { sender: v.string(), topic: v.string(), link: v.optional(v.string()), headline: v.string(), facts: v.array(v.string()) },
  returns: createResult,
  handler: async (ctx, args): Promise<typeof createResult.type> => {
    const now = Date.now();
    const date = pacificDate(now);
    const sent = await ctx.db
      .query("textCommissions")
      .withIndex("by_sender_date", (q) => q.eq("sender", args.sender).eq("date", date))
      .take(TEXTS_PER_DAY);
    if (sent.length >= TEXTS_PER_DAY) return { ok: false, reason: "limit" };
    const spend = await ctx.db
      .query("spend")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();
    if (imageCap() - (spend?.imagesReserved ?? 0) < IMAGES_PER_COMIC) return { ok: false, reason: "spend_cap" };
    const commissionId = await ctx.db.insert("textCommissions", { ...args, date, status: "drawing", createdAt: now, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.keiki.draw, { commissionId });
    return { ok: true, commissionId };
  },
});

export const brief = internalQuery({
  args: { commissionId: v.id("textCommissions") },
  returns: v.union(v.null(), v.object({ headline: v.string(), facts: v.array(v.string()), link: v.string() })),
  handler: async (ctx, { commissionId }) => {
    const row = await ctx.db.get(commissionId);
    if (!row || row.status !== "drawing" || row.comicId) return null;
    return { headline: row.headline, facts: row.facts, link: row.link ?? "" };
  },
});

export const draw = internalAction({
  args: { commissionId: v.id("textCommissions") },
  returns: v.null(),
  handler: async (ctx, { commissionId }): Promise<null> => {
    const job = await ctx.runQuery(internal.keiki.brief, { commissionId });
    if (!job) return null;
    try {
      const res = await ctx.runAction(internal.pipeline.drawFromBrief, {
        headline: job.headline,
        facts: job.facts,
        sourceName: TEXT_SOURCE,
        sourceUrl: job.link,
        kind: "commission",
      });
      if (res.ok) await ctx.runMutation(internal.keiki.drawStarted, { commissionId, comicId: res.comicId });
      else
        await ctx.runMutation(internal.keiki.fail, {
          commissionId,
          reason: res.reason === "spend_cap" || res.reason === "unsafe" ? res.reason : "bad_script",
          error: `draw refused: ${res.reason}`,
        });
    } catch (e) {
      await ctx.runMutation(internal.keiki.fail, { commissionId, reason: "unfinished", error: e instanceof Error ? cut(e.message, 200) : "draw crashed" });
    }
    return null;
  },
});

export const drawStarted = internalMutation({
  args: { commissionId: v.id("textCommissions"), comicId: v.id("comics") },
  returns: v.null(),
  handler: async (ctx, { commissionId, comicId }) => {
    await ctx.db.patch(commissionId, { comicId, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(WATCH_EVERY_MS, internal.keiki.watch, { commissionId, checks: 1 });
    return null;
  },
});

async function finish(ctx: MutationCtx, commissionId: Id<"textCommissions">, patch: Partial<Doc<"textCommissions">>) {
  await ctx.db.patch(commissionId, { ...patch, updatedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.keiki.notify, { commissionId });
}

export const fail = internalMutation({
  args: { commissionId: v.id("textCommissions"), reason: textFailure, error: v.string() },
  returns: v.null(),
  handler: async (ctx, { commissionId, reason, error }) => {
    const row = await ctx.db.get(commissionId);
    if (!row || row.status !== "drawing") return null;
    await finish(ctx, commissionId, { status: "failed", reason, error: cut(error, 300) });
    return null;
  },
});

export const watch = internalMutation({
  args: { commissionId: v.id("textCommissions"), checks: v.number() },
  returns: v.null(),
  handler: async (ctx, { commissionId, checks }) => {
    const row = await ctx.db.get(commissionId);
    if (!row || row.status !== "drawing" || !row.comicId) return null;
    const comic = await ctx.db.get(row.comicId);
    if (comic && (await readyComic(ctx, comic))) {
      await finish(ctx, commissionId, { status: "ready" });
      return null;
    }
    if (!comic || comic.status === "failed" || comic.hidden === true || checks >= WATCH_LIMIT) {
      await finish(ctx, commissionId, { status: "failed", reason: "unfinished", error: cut(comic?.error ?? "comic did not finish", 300) });
      return null;
    }
    await ctx.scheduler.runAfter(WATCH_EVERY_MS, internal.keiki.watch, { commissionId, checks: checks + 1 });
    return null;
  },
});

// ---------- delivery ----------

export const noticeTarget = internalQuery({
  args: { commissionId: v.id("textCommissions") },
  returns: v.union(v.null(), v.object({ sender: v.string(), status: v.string() })),
  handler: async (ctx, { commissionId }) => {
    const row = await ctx.db.get(commissionId);
    return row && row.status !== "drawing" && !row.notifiedAt ? { sender: row.sender, status: row.status } : null;
  },
});

export const noticeSent = internalMutation({
  args: { commissionId: v.id("textCommissions"), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { commissionId, error }) => {
    await ctx.db.patch(commissionId, error ? { noticeError: cut(error, 300) } : { notifiedAt: Date.now(), noticeError: undefined });
    return null;
  },
});

export function noticeText(commissionId: string, status: string): string {
  const what = status === "ready" ? "is ready" : "could not be drawn";
  return `The comic this person texted in (commission ${commissionId}) ${what}. Call get_comic_status with commission_id ${commissionId} now and send them what it returns, following your instructions for a ready or failed comic.`;
}

export function noticeOutcome(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { results?: { outcome?: unknown }[] };
    const outcome = parsed.results?.[0]?.outcome;
    return typeof outcome === "string" ? outcome : null;
  } catch {
    return null;
  }
}

export const notify = internalAction({
  args: { commissionId: v.id("textCommissions") },
  returns: v.null(),
  handler: async (ctx, { commissionId }): Promise<null> => {
    const target = await ctx.runQuery(internal.keiki.noticeTarget, { commissionId });
    if (!target) return null;
    const key = process.env.KEIKI_API_KEY ?? "";
    const agentId = process.env.KEIKI_AGENT_ID ?? "";
    if (!key || !agentId) {
      await ctx.runMutation(internal.keiki.noticeSent, { commissionId, error: "KEIKI_API_KEY or KEIKI_AGENT_ID is not set" });
      return null;
    }
    const res = await fetchText(`${KEIKI_API}/agents/${encodeURIComponent(agentId)}/notice`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: noticeText(commissionId, target.status), phone: target.sender }),
      timeoutMs: NOTICE_TIMEOUT_MS,
    });
    const outcome = res.ok ? noticeOutcome(res.text) : null;
    const error = !res.ok ? `notice ${res.status}: ${cut(res.error, 200)}` : outcome === "unavailable" ? "notice unavailable for this conversation" : undefined;
    await ctx.runMutation(internal.keiki.noticeSent, { commissionId, error });
    return null;
  },
});

// ---------- reads ----------

export const status = internalQuery({
  args: { commissionId: v.string(), sender: v.string() },
  returns: statusOut,
  handler: async (ctx, { commissionId, sender }): Promise<StatusOut> => {
    const id = ctx.db.normalizeId("textCommissions", commissionId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.sender !== sender) return { status: "not_found", reason: "I can't find that comic. Send me the link again?" };
    if (row.status === "failed") return { status: "failed", reason: FRIENDLY[row.reason ?? "unfinished"] };
    const comic = row.comicId ? await ctx.db.get(row.comicId) : null;
    const ready = row.status === "ready" && comic ? await readyComic(ctx, comic) : null;
    if (ready) return ready;
    if (row.status === "ready") return { status: "failed", reason: FRIENDLY.unfinished };
    return { status: "drawing", message: "Still drawing. It usually takes about a minute." };
  },
});

export const lead = internalQuery({
  args: {},
  returns: v.union(comicOut, v.null()),
  handler: async (ctx): Promise<ComicOut | null> => {
    const recent = await ctx.db.query("editions").withIndex("by_date").order("desc").take(7);
    for (const edition of recent) {
      for (const comic of await visibleComics(ctx, edition._id)) {
        const ready = await readyComic(ctx, comic);
        if (ready) return ready;
      }
    }
    return null;
  },
});

// ---------- tool endpoint ----------

type ToolCall = { input: Record<string, unknown>; sender: string };

function json(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { "Content-Type": "application/json" } });
}

function refuse(reason: TextFailure): Response {
  return json({ ok: false, reason, reply: FRIENDLY[reason] });
}

export function parseToolPath(pathname: string): { secret: string; tool: string } | null {
  const m = /^\/keiki\/([^/]+)\/([a-z_]+)\/?$/.exec(pathname);
  return m ? { secret: m[1], tool: m[2] } : null;
}

export function secretMatches(given: string): boolean {
  const expected = process.env.KEIKI_TOOL_SECRET ?? "";
  return expected.length >= SECRET_MIN && constantTimeEqual(given, expected);
}

function readCall(raw: unknown): ToolCall {
  const body = (raw && typeof raw === "object" ? raw : {}) as { input?: unknown; context?: unknown };
  const input = (body.input && typeof body.input === "object" ? body.input : {}) as Record<string, unknown>;
  const context = (body.context && typeof body.context === "object" ? body.context : {}) as Record<string, unknown>;
  const id = [context.phone, context.userId].find((x): x is string => typeof x === "string" && x.trim().length > 0);
  return { input, sender: id ? id.trim().slice(0, SENDER_MAX) : "" };
}

export const tool = httpAction(async (ctx, req) => {
  const route = parseToolPath(new URL(req.url).pathname);
  if (!route || !secretMatches(route.secret)) return new Response("not found", { status: 404 });
  let call: ToolCall;
  try {
    call = readCall(await req.json());
  } catch {
    return json({ ok: false, error: "bad json" }, 400);
  }

  if (route.tool === "today") {
    const comic = await ctx.runQuery(internal.keiki.lead, {});
    return json(comic ?? { status: "failed", reason: "Today's paper is still at the printer. Try again in a bit." });
  }

  if (!call.sender) return json({ ok: false, error: "no sender in context" }, 400);

  if (route.tool === "status") {
    const commissionId = typeof call.input.commission_id === "string" ? call.input.commission_id : "";
    return json(await ctx.runQuery(internal.keiki.status, { commissionId, sender: call.sender }));
  }

  if (route.tool !== "commission") return new Response("not found", { status: 404 });
  const { link: rawLink, topic } = splitRequest(typeof call.input.request === "string" ? call.input.request : "");
  if (topic.length > TOPIC_MAX || (!topic && !rawLink)) return refuse("bad_input");
  let link: string | undefined;
  let page: PageMeta = { title: "", description: "" };
  if (rawLink) {
    const parsed = parseLink(rawLink);
    if (!parsed) return refuse("bad_link");
    const res = await fetchText(parsed, { headers: USER_AGENT_HEADERS, timeoutMs: 6000 });
    if (res.ok) page = pageMeta(res.text);
    if (!page.title) return refuse("bad_link");
    link = parsed;
  }
  const { headline, facts } = briefFor(topic, page);
  const refusal = storyRefusal(`${headline} ${facts.join(" ")}`, { sourced: !!link });
  if (refusal) return refuse(refusal === "needs_source" ? "needs_source" : "unsafe");
  const checkoutUrl = textCommissionCheckoutUrl(call.sender);
  if (checkoutUrl) return json({ ok: false, reason: "payment_needed", checkoutUrl });
  const res = await ctx.runMutation(internal.keiki.createCommission, {
    sender: call.sender,
    topic: cut(topic || page.title, TOPIC_MAX),
    link,
    headline: cut(headline, 200),
    facts,
  });
  if (!res.ok) return refuse(res.reason);
  return json({ ok: true, commission_id: res.commissionId, status: "drawing", eta_seconds: 60 });
});
