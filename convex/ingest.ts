import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { pacificDate } from "./lib/dates";
import {
  FEEDS,
  ITEM_MAX_AGE_MS,
  parseFeed,
  parseFinnhub,
  parseHnItem,
  parseImgflipNames,
  parsePosts,
  parseTrends,
  trendItems,
  USER_AGENT_HEADERS,
  type FeedItem,
} from "./lib/feeds";
import { fetchText } from "./lib/http";
import { normaliseUrl } from "./lib/urls";
import { section } from "./schema";

const HN_TOP = 30;
const X_RUNS_PER_DAY = 4;
const X_TRENDS = 4;
const X_POSTS_PER_TREND = 25;
const US_WOEID = 23424977;
const PRUNE_BATCH = 300;

const feedItem = v.object({
  section,
  source: v.string(),
  publisher: v.string(),
  title: v.string(),
  summary: v.string(),
  url: v.string(),
  publishedAt: v.number(),
});

export type IngestReport = Record<string, number | string>;

function clean(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetchText(url, { headers: { ...USER_AGENT_HEADERS, ...headers } });
  if (!res.ok) throw new Error(res.status ? `HTTP ${res.status}` : res.error);
  return JSON.parse(res.text);
}

async function hackerNews(now: number): Promise<FeedItem[]> {
  const ids = await getJson("https://hacker-news.firebaseio.com/v0/topstories.json");
  if (!Array.isArray(ids)) throw new Error("unexpected answer");
  const items = await Promise.all(
    ids.slice(0, HN_TOP).map(async (id) => {
      try {
        return parseHnItem(await getJson(`https://hacker-news.firebaseio.com/v0/item/${Number(id)}.json`), now);
      } catch {
        return null;
      }
    }),
  );
  return items.filter((i): i is FeedItem => i !== null);
}

async function finnhub(now: number): Promise<FeedItem[]> {
  const key = clean(process.env.FINNHUB_API_KEY);
  if (!key) throw new Error("no key");
  return parseFinnhub(await getJson("https://finnhub.io/api/v1/news?category=general", { "X-Finnhub-Token": key }), now);
}

async function x(now: number): Promise<FeedItem[]> {
  const token = clean(process.env.X_BEARER_TOKEN);
  if (!token) throw new Error("no key");
  const auth = { authorization: `Bearer ${token}` };
  const trends = parseTrends(await getJson(`https://api.x.com/2/trends/by/woeid/${US_WOEID}?max_trends=20`, auth));
  const picked = trends.filter((t) => !/^#?\d+$/.test(t.name)).slice(0, X_TRENDS);
  const groups = await Promise.all(
    picked.map(async (trend) => {
      const params = new URLSearchParams({
        query: `${trend.name.includes(" ") ? `"${trend.name.replace(/"/g, "")}"` : trend.name} -is:retweet -is:reply lang:en`,
        max_results: String(X_POSTS_PER_TREND),
        "tweet.fields": "public_metrics,created_at",
        sort_order: "relevancy",
      });
      try {
        return trendItems(trend, parsePosts(await getJson(`https://api.x.com/2/tweets/search/recent?${params}`, auth), now), now);
      } catch {
        return [];
      }
    }),
  );
  return groups.flat();
}

export async function ingestAll(ctx: ActionCtx): Promise<IngestReport> {
  const now = Date.now();
  const report: IngestReport = {};
  const xRuns: number = await ctx.runQuery(internal.ingest.xRunsToday, { date: pacificDate(now) });
  const jobs: [string, () => Promise<FeedItem[]>][] = [
    ...FEEDS.map((feed): [string, () => Promise<FeedItem[]>] => [
      feed.source,
      async () => {
        const res = await fetchText(feed.url, { headers: USER_AGENT_HEADERS });
        if (!res.ok) throw new Error(res.status ? `HTTP ${res.status}` : res.error);
        return parseFeed(res.text, feed, now);
      },
    ]),
    ["Hacker News", () => hackerNews(now)],
    ["Finnhub", () => finnhub(now)],
  ];
  if (xRuns < X_RUNS_PER_DAY) jobs.push(["X", () => x(now)]);
  else report.X = "skipped: 4 runs today";
  const results = await Promise.allSettled(jobs.map(([, job]) => job()));
  const items: FeedItem[] = [];
  results.forEach((r, i) => {
    const name = jobs[i][0];
    if (r.status === "fulfilled") {
      items.push(...r.value);
      report[name] = r.value.length;
    } else report[name] = `error: ${r.reason instanceof Error ? r.reason.message : "failed"}`;
  });
  if (xRuns < X_RUNS_PER_DAY) await ctx.runMutation(internal.ingest.noteXRun, { date: pacificDate(now), note: String(report.X) });
  try {
    const names = parseImgflipNames(await getJson("https://api.imgflip.com/get_memes"));
    await ctx.runMutation(internal.ingest.saveFormats, { names });
    report.Imgflip = names.length;
  } catch (e) {
    report.Imgflip = `error: ${e instanceof Error ? e.message : "failed"}`;
  }
  let added = 0;
  for (let i = 0; i < items.length; i += 200) {
    added += await ctx.runMutation(internal.ingest.saveItems, { items: items.slice(i, i + 200), now });
  }
  report.added = added;
  report.pruned = await ctx.runMutation(internal.ingest.prune, { before: now - ITEM_MAX_AGE_MS });
  return report;
}

export const run = internalAction({
  args: {},
  returns: v.record(v.string(), v.union(v.number(), v.string())),
  handler: async (ctx): Promise<IngestReport> => {
    const startedAt = Date.now();
    const report = await ingestAll(ctx);
    await ctx.runMutation(internal.ingest.logRun, { startedAt, note: JSON.stringify(report) });
    return report;
  },
});

export const xRunsToday = internalQuery({
  args: { date: v.string() },
  returns: v.number(),
  handler: async (ctx, { date }) => {
    const recent = await ctx.db
      .query("runs")
      .withIndex("by_kind_startedAt", (q) => q.eq("kind", "x"))
      .order("desc")
      .take(10);
    return recent.filter((r) => r.date === date).length;
  },
});

export const noteXRun = internalMutation({
  args: { date: v.string(), note: v.string() },
  returns: v.null(),
  handler: async (ctx, { date, note }) => {
    const now = Date.now();
    await ctx.db.insert("runs", { kind: "x", date, status: "ok", startedAt: now, finishedAt: now, note });
    return null;
  },
});

export const logRun = internalMutation({
  args: { startedAt: v.number(), note: v.string() },
  returns: v.null(),
  handler: async (ctx, { startedAt, note }) => {
    await ctx.db.insert("runs", { kind: "ingest", date: pacificDate(startedAt), status: "ok", startedAt, finishedAt: Date.now(), note });
    return null;
  },
});

export const saveItems = internalMutation({
  args: { items: v.array(feedItem), now: v.number() },
  returns: v.number(),
  handler: async (ctx, { items, now }) => {
    let added = 0;
    const seen = new Set<string>();
    for (const item of items) {
      const normalizedUrl = normaliseUrl(item.url);
      if (!normalizedUrl || seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);
      const existing = await ctx.db
        .query("items")
        .withIndex("by_normalizedUrl", (q) => q.eq("normalizedUrl", normalizedUrl))
        .first();
      if (existing) continue;
      await ctx.db.insert("items", { ...item, normalizedUrl, fetchedAt: now });
      added++;
    }
    return added;
  },
});

export const prune = internalMutation({
  args: { before: v.number() },
  returns: v.number(),
  handler: async (ctx, { before }) => {
    const old = await ctx.db
      .query("items")
      .withIndex("by_fetchedAt", (q) => q.lt("fetchedAt", before))
      .take(PRUNE_BATCH);
    for (const item of old) await ctx.db.delete(item._id);
    return old.length;
  },
});

export const saveFormats = internalMutation({
  args: { names: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { names }) => {
    const now = Date.now();
    for (const name of names.slice(0, 100)) {
      const existing = await ctx.db
        .query("memeFormats")
        .withIndex("by_name", (q) => q.eq("name", name))
        .unique();
      if (existing) await ctx.db.patch(existing._id, { fetchedAt: now });
      else await ctx.db.insert("memeFormats", { name, fetchedAt: now });
    }
    return null;
  },
});
