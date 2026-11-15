import { cut, decodeEntities, stripHtml } from "./text";
import { normaliseUrl } from "./urls";

export type Section = "tech" | "money" | "culture" | "memes";

export type FeedItem = {
  section: Section;
  source: string;
  publisher: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: number;
};

export const SUMMARY_MAX = 400;
export const USER_AGENT_HEADERS = { "User-Agent": "DoodleDaily/1.0" };
export const ITEM_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type FeedSource = { section: Section; source: string; url: string };

export const FEEDS: FeedSource[] = [
  { section: "tech", source: "Techmeme", url: "https://www.techmeme.com/feed.xml" },
  { section: "tech", source: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { section: "tech", source: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { section: "tech", source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { section: "money", source: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { section: "money", source: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { section: "money", source: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { section: "culture", source: "BBC Entertainment", url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml" },
  { section: "culture", source: "Variety", url: "https://variety.com/feed/" },
  { section: "culture", source: "ESPN", url: "https://www.espn.com/espn/rss/news" },
  { section: "tech", source: "BBC Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { section: "tech", source: "Wired", url: "https://www.wired.com/feed/rss" },
  { section: "tech", source: "Engadget", url: "https://www.engadget.com/rss.xml" },
  { section: "tech", source: "NPR Technology", url: "https://feeds.npr.org/1019/rss.xml" },
  { section: "tech", source: "Gizmodo", url: "https://gizmodo.com/rss" },
  { section: "tech", source: "ZDNet", url: "https://www.zdnet.com/news/rss.xml" },
  { section: "tech", source: "9to5Mac", url: "https://9to5mac.com/feed/" },
  { section: "money", source: "Fortune", url: "https://fortune.com/feed/" },
  { section: "money", source: "NPR Business", url: "https://feeds.npr.org/1006/rss.xml" },
  { section: "money", source: "The Guardian Business", url: "https://www.theguardian.com/uk/business/rss" },
  { section: "money", source: "CNBC Business", url: "https://www.cnbc.com/id/10001147/device/rss/rss.html" },
  { section: "money", source: "Business Insider", url: "https://feeds.businessinsider.com/custom/all" },
  { section: "money", source: "Fast Company", url: "https://www.fastcompany.com/latest/rss" },
  { section: "culture", source: "Polygon", url: "https://www.polygon.com/rss/index.xml" },
  { section: "culture", source: "Pitchfork", url: "https://pitchfork.com/feed/feed-news/rss" },
  { section: "culture", source: "Rolling Stone", url: "https://www.rollingstone.com/feed/" },
  { section: "culture", source: "NPR Arts", url: "https://feeds.npr.org/1008/rss.xml" },
  { section: "culture", source: "The Guardian Culture", url: "https://www.theguardian.com/culture/rss" },
  { section: "culture", source: "Billboard", url: "https://www.billboard.com/feed/" },
  { section: "culture", source: "Kotaku", url: "https://kotaku.com/rss" },
  { section: "culture", source: "Deadline", url: "https://deadline.com/feed/" },
  { section: "culture", source: "The Hollywood Reporter", url: "https://www.hollywoodreporter.com/feed/" },
  { section: "memes", source: "Know Your Meme", url: "https://knowyourmeme.com/newsfeed.rss" },
  { section: "memes", source: "Know Your Meme Entries", url: "https://knowyourmeme.com/memes.rss" },
  { section: "memes", source: "Daily Dot", url: "https://www.dailydot.com/feed/" },
  { section: "memes", source: "Mashable", url: "https://mashable.com/feeds/rss/all" },
  { section: "memes", source: "BBC Newsbeat", url: "https://feeds.bbci.co.uk/news/newsbeat/rss.xml" },
  { section: "memes", source: "NPR Pop Culture", url: "https://feeds.npr.org/1048/rss.xml" },
];

const AGGREGATORS = ["techmeme.com", "news.ycombinator.com", "news.google.com"];

export function isAggregatorUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return AGGREGATORS.some((a) => host === a || host.endsWith("." + a));
  } catch {
    return false;
  }
}

export function publisherOf(url: string, fallback: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return fallback;
  }
}

function tag(block: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

function attr(block: string, name: string, attribute: string, where?: (el: string) => boolean): string | null {
  const re = new RegExp(`<${name}\\b[^>]*>`, "gi");
  for (const m of block.matchAll(re)) {
    if (where && !where(m[0])) continue;
    const a = m[0].match(new RegExp(`\\s${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
    if (a) return a[2] ?? a[3] ?? null;
  }
  return null;
}

function text(raw: string | null): string {
  return raw === null ? "" : stripHtml(raw);
}

function rawLink(raw: string | null): string {
  if (raw === null) return "";
  return decodeEntities(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
}

function firstExternalLink(html: string): string | null {
  for (const m of decodeEntities(html).matchAll(/href\s*=\s*"(https?:[^"]+)"/gi)) {
    if (!isAggregatorUrl(m[1])) return m[1];
  }
  return null;
}

function parseDate(raw: string): number | null {
  const ms = Date.parse(raw.trim());
  return Number.isFinite(ms) ? ms : null;
}

export function parseFeed(xml: string, feed: FeedSource, now: number, maxAgeMs = ITEM_MAX_AGE_MS): FeedItem[] {
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blocks = [...xml.matchAll(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const items: FeedItem[] = [];
  for (const block of blocks) {
    const title = text(tag(block, "title"));
    const body = tag(block, isAtom ? "summary" : "description") ?? tag(block, "content") ?? tag(block, "content:encoded") ?? "";
    let link = isAtom
      ? (attr(block, "link", "href", (el) => !/rel\s*=\s*["'](?!alternate)/i.test(el)) ?? "")
      : rawLink(tag(block, "link")) || rawLink(tag(block, "guid"));
    if (isAggregatorUrl(link)) link = firstExternalLink(body) ?? link;
    const dateRaw = tag(block, isAtom ? "published" : "pubDate") ?? tag(block, "updated") ?? tag(block, "dc:date");
    const publishedAt = dateRaw ? parseDate(text(dateRaw)) : null;
    if (!title || !normaliseUrl(link)) continue;
    const at = publishedAt ?? now;
    if (now - at > maxAgeMs || at - now > 60 * 60 * 1000) continue;
    items.push({
      section: feed.section,
      source: feed.source,
      publisher: publisherOf(link, feed.source),
      title: cut(title, 300),
      summary: cut(text(body), SUMMARY_MAX),
      url: link,
      publishedAt: at,
    });
  }
  return items;
}

type HnItem = { id?: number; type?: string; title?: string; url?: string; text?: string; time?: number; dead?: boolean; deleted?: boolean };

export function parseHnItem(raw: unknown, now: number): FeedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const it = raw as HnItem;
  if (it.type !== "story" || it.dead || it.deleted || typeof it.title !== "string" || typeof it.id !== "number") return null;
  const publishedAt = typeof it.time === "number" ? it.time * 1000 : now;
  if (now - publishedAt > ITEM_MAX_AGE_MS) return null;
  const url = typeof it.url === "string" && normaliseUrl(it.url) ? it.url : `https://news.ycombinator.com/item?id=${it.id}`;
  return {
    section: "tech",
    source: "Hacker News",
    publisher: publisherOf(url, "Hacker News"),
    title: cut(stripHtml(it.title), 300),
    summary: cut(stripHtml(it.text ?? ""), SUMMARY_MAX),
    url,
    publishedAt,
  };
}

type FinnhubItem = { headline?: string; summary?: string; url?: string; datetime?: number; source?: string };

export function parseFinnhub(raw: unknown, now: number): FeedItem[] {
  if (!Array.isArray(raw)) return [];
  const items: FeedItem[] = [];
  for (const entry of raw as FinnhubItem[]) {
    if (!entry || typeof entry.headline !== "string" || typeof entry.url !== "string" || !normaliseUrl(entry.url)) continue;
    const publishedAt = typeof entry.datetime === "number" ? entry.datetime * 1000 : now;
    if (now - publishedAt > ITEM_MAX_AGE_MS) continue;
    items.push({
      section: "money",
      source: "Finnhub",
      publisher: typeof entry.source === "string" && entry.source ? entry.source : publisherOf(entry.url, "Finnhub"),
      title: cut(stripHtml(entry.headline), 300),
      summary: cut(stripHtml(entry.summary ?? ""), SUMMARY_MAX),
      url: entry.url,
      publishedAt,
    });
  }
  return items;
}

export type Trend = { name: string; postCount: number | null };

export function parseTrends(raw: unknown): Trend[] {
  const data = (raw as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((t) => t as { trend_name?: unknown; tweet_count?: unknown })
    .filter((t) => typeof t.trend_name === "string" && t.trend_name.trim())
    .map((t) => ({ name: (t.trend_name as string).trim(), postCount: typeof t.tweet_count === "number" ? t.tweet_count : null }));
}

export type XPost = { id: string; text: string; likes: number; createdAt: number };

export function parsePosts(raw: unknown, now: number): XPost[] {
  const data = (raw as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const posts: XPost[] = [];
  for (const p of data as { id?: unknown; text?: unknown; created_at?: unknown; public_metrics?: { like_count?: unknown } }[]) {
    if (typeof p.id !== "string" || !/^\d+$/.test(p.id) || typeof p.text !== "string") continue;
    const created = typeof p.created_at === "string" ? Date.parse(p.created_at) : NaN;
    posts.push({
      id: p.id,
      text: stripHtml(p.text),
      likes: typeof p.public_metrics?.like_count === "number" ? p.public_metrics.like_count : 0,
      createdAt: Number.isFinite(created) ? created : now,
    });
  }
  return posts;
}

export function postUrl(id: string): string {
  return `https://x.com/i/web/status/${id}`;
}

export function trendItems(trend: Trend, posts: XPost[], now: number): FeedItem[] {
  return [...posts]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 3)
    .map((p) => ({
      section: "memes" as const,
      source: "X",
      publisher: "x.com",
      title: cut(trend.name, 120),
      summary: cut(`${p.likes} likes: ${p.text}`, SUMMARY_MAX),
      url: postUrl(p.id),
      publishedAt: Math.min(p.createdAt, now),
    }));
}

export function parseImgflipNames(raw: unknown): string[] {
  const memes = (raw as { data?: { memes?: unknown } })?.data?.memes;
  if (!Array.isArray(memes)) return [];
  return memes
    .map((m) => (m as { name?: unknown }).name)
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .map((n) => n.trim())
    .slice(0, 100);
}
