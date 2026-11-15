import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { fetchPage, pageMeta } from "./commissions";
import { pacificDate } from "./lib/dates";
import { FEEDS, USER_AGENT_HEADERS, parseFeed, type FeedItem, type Section } from "./lib/feeds";
import { isSafeStory } from "./lib/filter";
import { fetchText } from "./lib/http";
import { distinctiveWords, sharesEvent } from "./lib/overlap";
import { cut, stripHtml } from "./lib/text";
import { isRealSource, normaliseUrl } from "./lib/urls";
import { ANTHROPIC_MODEL } from "./providers/anthropic";
import { section } from "./schema";

export const DEEP_SEARCH_MIN = 6;
const LOCK_MS = 20 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const STOCK_WINDOW_MS = 7 * 24 * HOUR_MS;
const WINDOWS_MS = [36 * HOUR_MS, 72 * HOUR_MS, STOCK_WINDOW_MS];
const MEME_WINDOW_MS = 36 * HOUR_MS;
const MAX_SEARCHES = 4;
const SEARCH_BUDGET_MS = 150_000;
const SEARCH_TIMEOUT_MS = 60_000;
const MAX_MEMES_PER_SEARCH = 6;
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2026-10-21";
export const WEB_SEARCH_TOOL = "web_search_20250305";

export type Found = { url: string; publisher: string; headline: string; facts: string[]; meme?: string };
export type SearchRequest = { section: Section; exclude: string[]; memes: string[] };
export type SearchResult = { stories: Found[]; note?: string };
export type SearchFn = (req: SearchRequest) => Promise<SearchResult>;

const report = v.object({
  section: v.string(),
  status: v.union(v.literal("ok"), v.literal("locked")),
  ms: v.number(),
  found: v.number(),
  verified: v.number(),
  dropped: v.number(),
  saved: v.number(),
  searches: v.number(),
  notes: v.array(v.string()),
});
export type DeepSearchReport = typeof report.type;

let searchOverride: SearchFn | null = null;

export function setSearchForTests(fn: SearchFn | null): void {
  searchOverride = fn;
}

export function sharesKeyWords(headline: string, pageText: string): boolean {
  const wanted = [...distinctiveWords(headline)];
  if (wanted.length === 0) return false;
  const have = distinctiveWords(pageText);
  const hits = wanted.filter((w) => have.has(w)).length;
  return hits >= 2 || hits >= Math.ceil(wanted.length / 2);
}

async function verifyPage(url: string, headline: string): Promise<{ ok: true; title: string } | { ok: false; why: string }> {
  if (!isRealSource(url)) return { ok: false, why: "not a real source" };
  const res = await fetchPage(url);
  if (!res.ok) return { ok: false, why: res.error };
  const meta = pageMeta(res.text);
  const text = `${meta.title} ${meta.description} ${stripHtml(res.text.slice(0, 400_000))}`;
  if (!sharesKeyWords(headline, text)) return { ok: false, why: "page does not match headline" };
  return { ok: true, title: meta.title };
}

export const stock = internalQuery({
  args: { section, now: v.number() },
  returns: v.number(),
  handler: async (ctx, { section, now }) => {
    const rows = await ctx.db
      .query("stories")
      .withIndex("by_used_createdAt", (q) => q.eq("used", false).gte("createdAt", now - STOCK_WINDOW_MS))
      .order("desc")
      .take(500);
    return rows.filter((s) => s.section === section && isRealSource(s.sourceUrl) && isSafeStory(`${s.headline} ${s.facts.join(" ")}`)).length;
  },
});

export const known = internalQuery({
  args: { section, now: v.number() },
  returns: v.object({ headlines: v.array(v.string()), sectionHeadlines: v.array(v.string()), urls: v.array(v.string()) }),
  handler: async (ctx, { section, now }) => {
    const since = now - STOCK_WINDOW_MS;
    const recent = [
      ...(await ctx.db
        .query("stories")
        .withIndex("by_used_createdAt", (q) => q.eq("used", false).gte("createdAt", since))
        .order("desc")
        .take(500)),
      ...(await ctx.db
        .query("stories")
        .withIndex("by_used_createdAt", (q) => q.eq("used", true).gte("createdAt", since))
        .order("desc")
        .take(500)),
    ];
    const headlines = recent.map((s) => s.headline);
    const urls = recent.flatMap((s) => [s.sourceUrl, s.originUrl ?? ""]).map((u) => normaliseUrl(u) ?? "").filter(Boolean);
    const newest = await ctx.db.query("editions").withIndex("by_date").order("desc").first();
    if (newest) {
      const comics = await ctx.db
        .query("comics")
        .withIndex("by_edition_order", (q) => q.eq("editionId", newest._id))
        .take(64);
      headlines.push(...comics.map((c) => c.title));
    }
    const pooled = await ctx.db
      .query("comics")
      .withIndex("by_pooled", (q) => q.eq("pooled", true))
      .take(64);
    headlines.push(...pooled.map((c) => c.title));
    const sectionHeadlines = recent.filter((s) => s.section === section && !s.used).map((s) => s.headline).slice(0, 40);
    return { headlines, sectionHeadlines, urls };
  },
});

export const logRun = internalMutation({
  args: { date: v.string(), startedAt: v.number(), note: v.string() },
  returns: v.null(),
  handler: async (ctx, { date, startedAt, note }) => {
    await ctx.db.insert("runs", { kind: "deep_search", date, status: "ok", startedAt, finishedAt: Date.now(), note });
    return null;
  },
});

function factsFrom(summary: string): string[] {
  return (summary.match(/[^.!?]+[.!?]+/g) ?? [summary])
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .slice(0, 3)
    .map((s) => cut(s, 300));
}

function cleanFacts(facts: unknown): string[] {
  if (!Array.isArray(facts)) return [];
  return facts.filter((f): f is string => typeof f === "string" && f.trim().length > 0).slice(0, 3).map((f) => cut(f.trim(), 300));
}

async function fetchSectionFeeds(sectionName: Section, now: number): Promise<{ items: FeedItem[]; notes: string[] }> {
  const notes: string[] = [];
  const results = await Promise.all(
    FEEDS.filter((f) => f.section === sectionName).map(async (feed) => {
      const res = await fetchText(feed.url, { headers: USER_AGENT_HEADERS, timeoutMs: 6000 });
      if (!res.ok) {
        notes.push(`feed ${feed.source}: ${res.error}`);
        return [];
      }
      return parseFeed(res.text, feed, now, STOCK_WINDOW_MS);
    }),
  );
  return { items: results.flat().sort((a, b) => b.publishedAt - a.publishedAt), notes };
}

const FOUND_SCHEMA = {
  type: "object",
  properties: {
    stories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          publisher: { type: "string" },
          headline: { type: "string" },
          facts: { type: "array", items: { type: "string" } },
          meme: { type: "string" },
        },
        required: ["url", "publisher", "headline", "facts", "meme"],
        additionalProperties: false,
      },
    },
  },
  required: ["stories"],
  additionalProperties: false,
};

const SECTION_TOPICS: Record<Section, string> = {
  tech: "technology (gadgets, apps, AI, internet companies, science-y tech)",
  money: "business and money (companies, markets, consumer prices, quirky business news)",
  culture: "culture (film, TV, music, games, sport, celebrities' public work)",
  memes: "internet memes and viral online trends",
};

function searchPrompt(req: SearchRequest, today: string): string {
  const rules = [
    `Today is ${today}. Use web search to find real, published articles.`,
    "Every story must be light and safe: no deaths, disasters, crime victims, war, illness, or private people's personal lives.",
    "For each story return: url (the article's own https link, never a search page or aggregator), publisher, headline exactly as published, and facts: two or three facts the article itself states.",
    "Only return URLs you saw in search results. If you are not sure a URL is real, leave the story out.",
  ];
  const exclude = req.exclude.length ? `\nAlready covered, do not return these:\n${req.exclude.map((h) => `- ${h}`).join("\n")}` : "";
  if (req.memes.length) {
    return [
      ...rules,
      "For each of these trends on X, find one article that explains it (a news write-up or a Know Your Meme entry). Set meme to the trend name exactly as written below. Skip a trend if no article explains it.",
      ...req.memes.map((m) => `- ${m}`),
    ].join("\n");
  }
  return [
    ...rules,
    `Find up to 6 of today's notable, light, fun stories about ${SECTION_TOPICS[req.section]}. Prefer the last 36 hours. Set meme to an empty string.${exclude}`,
  ].join("\n");
}

function parseFound(body: string): { stories: Found[] } | { error: string } {
  let msg: { content?: { type?: string; text?: string }[]; stop_reason?: string };
  try {
    msg = JSON.parse(body);
  } catch {
    return { error: "anthropic sent malformed JSON" };
  }
  if (msg.stop_reason === "refusal") return { error: "model refused" };
  const blocks = msg.content ?? [];
  const lastTool = blocks.map((b) => b.type).lastIndexOf("web_search_tool_result");
  const texts = blocks.slice(lastTool + 1).filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text as string);
  const candidates = [texts.join(""), ...texts.reverse()];
  for (const t of candidates) {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      const json = JSON.parse(t.slice(start, end + 1)) as { stories?: unknown };
      if (!Array.isArray(json.stories)) continue;
      const stories = json.stories
        .map((s) => s as Record<string, unknown>)
        .filter((s) => typeof s.url === "string" && typeof s.headline === "string")
        .map((s) => ({
          url: (s.url as string).trim(),
          publisher: typeof s.publisher === "string" ? s.publisher.trim() : "",
          headline: (s.headline as string).trim(),
          facts: cleanFacts(s.facts),
          meme: typeof s.meme === "string" && s.meme.trim() ? s.meme.trim() : undefined,
        }));
      return { stories };
    } catch {
      continue;
    }
  }
  return { error: msg.stop_reason === "pause_turn" ? "search paused before answering" : "no JSON in answer" };
}

const anthropicSearch: SearchFn = async (req) => {
  const apiKey = typeof process !== "undefined" ? process.env.ANTHROPIC_API_KEY : undefined;
  if (!apiKey) return { stories: [], note: "web search skipped: ANTHROPIC_API_KEY is not set" };
  const prompt = searchPrompt(req, pacificDate(Date.now()));
  const send = (structured: boolean) =>
    fetchText(API_URL, {
      method: "POST",
      timeoutMs: SEARCH_TIMEOUT_MS,
      maxBytes: 3 * 1024 * 1024,
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": API_VERSION },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: structured ? prompt : `${prompt}\nAnswer with only a JSON object: {"stories": [{"url", "publisher", "headline", "facts": [..], "meme"}]}.` }],
        tools: [{ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: 3 }],
        ...(structured ? { output_config: { format: { type: "json_schema", schema: FOUND_SCHEMA } } } : {}),
      }),
    });
  let res = await send(true);
  if (!res.ok && res.status === 400) res = await send(false);
  if (!res.ok) return { stories: [], note: `web search failed: ${res.status ? `HTTP ${res.status}` : res.error}` };
  const parsed = parseFound(res.text);
  return "error" in parsed ? { stories: [], note: `web search: ${parsed.error}` } : parsed;
};

type Draft = {
  section: Section;
  kind: "news" | "meme";
  headline: string;
  facts: string[];
  itemIds: [];
  sourceName: string;
  sourceUrl: string;
  originUrl?: string;
  score: number;
};

export async function deepSearch(ctx: ActionCtx, sectionName: Section): Promise<DeepSearchReport> {
  const startedAt = Date.now();
  const out: DeepSearchReport = { section: sectionName, status: "ok", ms: 0, found: 0, verified: 0, dropped: 0, saved: 0, searches: 0, notes: [] };
  const holder = `deep-${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
  if (!(await ctx.runMutation(internal.pipeline.acquireLock, { name: `deep:${sectionName}`, holder, ttlMs: LOCK_MS }))) {
    return { ...out, status: "locked", ms: Date.now() - startedAt };
  }
  const kind = sectionName === "memes" ? "meme" : "news";
  const have = await ctx.runQuery(internal.sourcing.stock, { section: sectionName, now: startedAt });
  const need = Math.max(DEEP_SEARCH_MIN - have, 0);
  const ctxInfo = await ctx.runQuery(internal.sourcing.known, { section: sectionName, now: startedAt });
  const seenUrls = new Set(ctxInfo.urls);
  const headlines = [...ctxInfo.headlines];
  const drafts: Draft[] = [];

  const accept = (d: Draft, urls: string[]): string | null => {
    const keys = urls.map((u) => normaliseUrl(u) ?? "");
    if (keys.some((k) => !k || seenUrls.has(k))) return "already saved";
    if (!isSafeStory(`${d.headline} ${d.facts.join(" ")}`)) return "unsafe";
    if (headlines.some((h) => sharesEvent(h, d.headline))) return "overlaps a known story";
    if (d.facts.length === 0) return "no facts";
    keys.forEach((k) => seenUrls.add(k));
    headlines.push(d.headline);
    drafts.push(d);
    return null;
  };

  if (sectionName === "memes") {
    const xItems = (await ctx.runQuery(internal.pipeline.candidates, { section: "memes", since: startedAt - MEME_WINDOW_MS })).filter(
      (i) => i.source === "X" && isSafeStory(`${i.title} ${i.summary}`) && !seenUrls.has(normaliseUrl(i.url) ?? ""),
    );
    const byTrend = new Map<string, (typeof xItems)[number]>();
    for (const i of xItems) if (!byTrend.has(i.title) && !headlines.some((h) => sharesEvent(h, i.title))) byTrend.set(i.title, i);
    const trends = [...byTrend.keys()].slice(0, Math.max(need, 1) + 2).slice(0, MAX_MEMES_PER_SEARCH);
    const explainers = new Map<string, Found>();
    if (trends.length) {
      out.searches++;
      const res = await (searchOverride ?? anthropicSearch)({ section: "memes", exclude: [], memes: trends });
      if (res.note) out.notes.push(res.note);
      out.found += res.stories.length;
      const checks = await Promise.all(res.stories.map(async (f) => ({ f, check: f.meme && trends.includes(f.meme) ? await verifyPage(f.url, f.headline) : { ok: false as const, why: "unknown trend" } })));
      for (const { f, check } of checks) {
        if (check.ok && f.facts.length && !explainers.has(f.meme as string)) {
          out.verified++;
          explainers.set(f.meme as string, f);
        } else {
          out.dropped++;
          out.notes.push(`dropped ${f.url}: ${check.ok ? "duplicate or no facts" : check.why}`);
        }
      }
    }
    for (const trend of trends) {
      const post = byTrend.get(trend)!;
      const article = explainers.get(trend);
      const text = post.summary.replace(/^\d+ likes: /, "");
      const draft: Draft = article
        ? { section: "memes", kind, headline: cut(article.headline, 200), facts: article.facts, itemIds: [], sourceName: article.publisher || new URL(article.url).hostname.replace(/^www\./, ""), sourceUrl: article.url, originUrl: post.url, score: 6 }
        : { section: "memes", kind, headline: cut(trend, 200), facts: [cut(`A trending post on X about ${trend} says: ${text}`, 300)], itemIds: [], sourceName: "X", sourceUrl: post.url, originUrl: post.url, score: 5 };
      const why = accept(draft, article ? [article.url, post.url] : [post.url]);
      if (why) out.notes.push(`skipped meme ${trend}: ${why}`);
    }
  }

  const feed = await fetchSectionFeeds(sectionName, startedAt);
  out.notes.push(...feed.notes);
  for (const windowMs of WINDOWS_MS) {
    if (drafts.length >= need) break;
    for (const item of feed.items) {
      if (drafts.length >= need) break;
      if (startedAt - item.publishedAt > windowMs || !isRealSource(item.url)) continue;
      accept({ section: sectionName, kind, headline: item.title, facts: factsFrom(item.summary), itemIds: [], sourceName: item.source, sourceUrl: item.url, score: 5 }, [item.url]);
    }
  }

  const searchUntil = startedAt + SEARCH_BUDGET_MS;
  const tried = new Set<string>();
  while (drafts.length < need && out.searches < MAX_SEARCHES && Date.now() < searchUntil) {
    out.searches++;
    const res = await (searchOverride ?? anthropicSearch)({ section: sectionName, exclude: [...ctxInfo.sectionHeadlines, ...drafts.map((d) => d.headline)].slice(-60), memes: [] });
    if (res.note) out.notes.push(res.note);
    const fresh = res.stories.filter((f) => {
      const key = normaliseUrl(f.url) ?? f.url;
      if (tried.has(key) || seenUrls.has(key)) return false;
      tried.add(key);
      return true;
    });
    out.found += fresh.length;
    const before = drafts.length;
    const checks = await Promise.all(fresh.map(async (f) => ({ f, check: await verifyPage(f.url, f.headline) })));
    for (const { f, check } of checks) {
      if (!check.ok) {
        out.dropped++;
        out.notes.push(`dropped ${f.url}: ${check.why}`);
        continue;
      }
      out.verified++;
      const sourceName = f.publisher || new URL(f.url).hostname.replace(/^www\./, "");
      const why = accept({ section: sectionName, kind, headline: cut(f.headline, 200), facts: f.facts, itemIds: [], sourceName, sourceUrl: f.url, score: 6 }, [f.url]);
      if (why) out.notes.push(`skipped ${f.url}: ${why}`);
    }
    if (drafts.length === before) break;
  }

  if (drafts.length) await ctx.runMutation(internal.pipeline.saveStories, { stories: drafts });
  out.saved = drafts.length;
  out.ms = Date.now() - startedAt;
  await ctx.runMutation(internal.sourcing.logRun, {
    date: pacificDate(startedAt),
    startedAt,
    note: JSON.stringify({ section: sectionName, stock: have, found: out.found, verified: out.verified, dropped: out.dropped, saved: out.saved, searches: out.searches, notes: out.notes.slice(0, 30) }),
  });
  return out;
}

export const run = internalAction({
  args: { section },
  returns: report,
  handler: (ctx, { section }): Promise<DeepSearchReport> => deepSearch(ctx, section),
});
