import { describe, expect, test } from "vitest";
import { parseFeed, parseFinnhub, parseHnItem, parsePosts, parseTrends, postUrl, trendItems } from "./feeds";
import { isSafeStory } from "./filter";
import { describeFormat, formatKeyFor, EVERGREEN_FORMATS } from "./formats";
import { sharesEvent } from "./overlap";
import { constantTimeEqual, isQuotaError, parseRetryAfter, retryDelayMs } from "./retry";
import { validateScript, type Script } from "./script";
import { parseMessage } from "../providers/anthropic";
import { scriptPrompt } from "../providers/prompts";

const NOW = Date.UTC(2026, 10, 15, 18, 0);

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Feed</title>
<item>
  <title><![CDATA[Robots learn to fold &amp; stack towels]]></title>
  <link>https://example.com/robots?utm_source=rss</link>
  <description><![CDATA[<p>A lab showed <b>robots</b> folding towels.</p><img src="x.png"/>]]></description>
  <pubDate>Sun, 15 Nov 2026 16:00:00 GMT</pubDate>
</item>
<item>
  <title>Old news</title>
  <link>https://example.com/old</link>
  <pubDate>Fri, 13 Nov 2026 16:00:00 GMT</pubDate>
</item>
<item><title>No link at all</title></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>The Verge</title>
  <entry>
    <title type="html">Phones get &lt;em&gt;bigger&lt;/em&gt; again</title>
    <link rel="alternate" type="text/html" href="https://www.theverge.com/phones/123"/>
    <link rel="replies" href="https://www.theverge.com/phones/123#comments"/>
    <published>2026-11-15T10:00:00-08:00</published>
    <summary type="html">&lt;p&gt;Every phone this year is &lt;strong&gt;huge&lt;/strong&gt;.&lt;/p&gt;</summary>
  </entry>
</feed>`;

const TECHMEME = `<rss><channel><item>
<title>Startup ships a talking toaster (Jane Doe/Example News)</title>
<link>https://www.techmeme.com/261115/p1#a261115p1</link>
<description>&lt;a href="https://www.techmeme.com/261115/p1"&gt;&lt;/a&gt;&lt;a href="https://examplenews.com/toaster"&gt;Example&lt;/a&gt; A toaster talks.</description>
<pubDate>Sun, 15 Nov 2026 15:00:00 GMT</pubDate>
</item></channel></rss>`;

describe("feed parsing", () => {
  test("RSS: strips HTML and entities, keeps the link as published, drops old and linkless items", () => {
    const items = parseFeed(RSS, { section: "tech", source: "Example", url: "" }, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      section: "tech",
      source: "Example",
      publisher: "example.com",
      title: "Robots learn to fold & stack towels",
      summary: "A lab showed robots folding towels.",
      url: "https://example.com/robots?utm_source=rss",
      publishedAt: Date.UTC(2026, 10, 15, 16, 0),
    });
  });

  test("Atom: reads the alternate link, published date and HTML summary", () => {
    const [item] = parseFeed(ATOM, { section: "tech", source: "The Verge", url: "" }, NOW);
    expect(item.title).toBe("Phones get bigger again");
    expect(item.url).toBe("https://www.theverge.com/phones/123");
    expect(item.summary).toBe("Every phone this year is huge.");
    expect(item.publishedAt).toBe(Date.UTC(2026, 10, 15, 18, 0));
  });

  test("prefers the publisher's link over the aggregator's", () => {
    const [item] = parseFeed(TECHMEME, { section: "tech", source: "Techmeme", url: "" }, NOW);
    expect(item.url).toBe("https://examplenews.com/toaster");
    expect(item.publisher).toBe("examplenews.com");
  });

  test("summaries are cut to 400 characters", () => {
    const long = RSS.replace("A lab showed", "word ".repeat(200));
    const [item] = parseFeed(long, { section: "tech", source: "Example", url: "" }, NOW);
    expect(item.summary.length).toBeLessThanOrEqual(400);
  });

  test("Hacker News, Finnhub, X and garbage", () => {
    expect(parseHnItem({ id: 1, type: "story", title: "Show HN: A crayon", url: "https://crayon.dev", time: NOW / 1000, score: 50 }, NOW)?.url).toBe("https://crayon.dev");
    expect(parseHnItem({ id: 2, type: "story", title: "Ask HN: Why?", time: NOW / 1000 }, NOW)?.url).toBe("https://news.ycombinator.com/item?id=2");
    expect(parseHnItem({ id: 3, type: "comment" }, NOW)).toBeNull();
    expect(parseHnItem("nope", NOW)).toBeNull();
    expect(parseFinnhub([{ headline: "Stocks rise", url: "https://x.example/a", datetime: NOW / 1000, source: "Reuters" }, { headline: 3 }], NOW)).toHaveLength(1);
    expect(parseFinnhub({ error: "bad" }, NOW)).toEqual([]);
    const trends = parseTrends({ data: [{ trend_name: "Pumpkin Spice", tweet_count: 1000 }, { nope: 1 }] });
    expect(trends).toEqual([{ name: "Pumpkin Spice", postCount: 1000 }]);
    const posts = parsePosts({ data: [{ id: "123", text: "lol &amp; more", public_metrics: { like_count: 9 } }, { id: "abc", text: "bad id" }] }, NOW);
    expect(posts).toEqual([{ id: "123", text: "lol & more", likes: 9, createdAt: NOW }]);
    expect(trendItems(trends[0], posts, NOW)[0]).toMatchObject({ section: "memes", source: "X", url: postUrl("123") });
  });
});

describe("story filter", () => {
  test.each([
    "Three dead after storm hits coast",
    "Actor dies at 80",
    "War in the region enters third month",
    "Earthquake shakes the city",
    "New cancer drug approved",
    "Coach accused of abuse",
    "Star's affair revealed",
    "CEO arrested at airport",
    "Founder indicted on fraud charges",
    "Former exec jailed for five years",
    "Manager charged over chip smuggling",
    "Explicit sexual content found in app",
  ])("drops %s", (title) => expect(isSafeStory(title)).toBe(false));

  test.each([
    "Stocks crash as rates rise",
    "Apple's killer feature is a button",
    "Cyberattack hits a retailer's checkout",
    "The streaming wars get a new player",
    "Bitcoin prices plunge again",
  ])("keeps %s", (title) => expect(isSafeStory(title)).toBe(true));
});

function goodScript(): Script {
  return {
    title: "Robots fold the laundry",
    panels: [
      { scene: "Robo stands on a hill holding a towel.", cast: ["Robo"], caption: "A lab says its robot can fold towels." },
      { scene: "Robo folds a towel into a tiny square while The Crowd watches.", cast: ["Robo", "The Crowd"], caption: "It takes about an hour per towel." },
      { scene: "Boss Blob holds up a stopwatch next to a pile of towels.", cast: ["Boss Blob", "Robo"], caption: "The company wants to sell it next year." },
      { scene: "Newsie naps on the folded pile.", cast: ["Newsie"], caption: "Laundry day may never be the same." },
    ],
    realStory: "A lab showed a robot that folds towels. It is slow but the company plans to sell it.",
  };
}

describe("script validation", () => {
  const opts = { kind: "news" as const, headline: "Acme robot from Tesla folds towels" };

  test("accepts a good script", () => expect(validateScript(goodScript(), opts)).toEqual([]));

  test("rejects wrong panel count, long captions, quotes, unknown cast", () => {
    expect(validateScript({ ...goodScript(), panels: goodScript().panels.slice(0, 3) }, opts)).toContain("there must be exactly 4 panels");
    const s = goodScript();
    s.panels[0].caption = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen";
    s.panels[1].caption = 'The boss said "fold faster" today.';
    s.panels[2].cast = ["Mickey"];
    s.panels[3].scene = "word ".repeat(40);
    const errors = validateScript(s, opts);
    expect(errors.join("\n")).toMatch(/panel 1 caption must be under 16 words/);
    expect(errors.join("\n")).toMatch(/panel 2 caption must not contain quotation marks/);
    expect(errors.join("\n")).toMatch(/panel 3 cast member Mickey/);
    expect(errors.join("\n")).toMatch(/panel 4 scene must be under 40 words/);
  });

  test("rejects headline names, bubbles, written words and real people in scenes", () => {
    const s = goodScript();
    s.panels[0].scene = "Robo hands a towel to Tesla's boss.";
    s.panels[1].scene = "Robo with a speech bubble above its head.";
    s.panels[2].scene = "Boss Blob holds a sign that reads FOLD.";
    s.panels[3].scene = "Newsie points at a screen showing a helmeted warrior with a sword.";
    const errors = validateScript(s, opts).join("\n");
    expect(errors).toMatch(/panel 1 scene names Tesla/);
    expect(errors).toMatch(/panel 2 scene mentions a bubble/);
    expect(errors).toMatch(/panel 3 scene mentions written words/);
    expect(errors).toMatch(/panel 4 scene shows a person/);
  });

  test("realStory must be 2 sentences for news and 1 for memes", () => {
    expect(validateScript({ ...goodScript(), realStory: "Just one sentence." }, opts)).toContain("realStory must be exactly 2 sentences");
    expect(validateScript({ ...goodScript(), realStory: "One sentence about the trend." }, { kind: "meme", headline: "Pumpkin" })).toEqual([]);
    expect(validateScript(goodScript(), { kind: "meme", headline: "Pumpkin" })).toContain("realStory must be exactly 1 sentence");
  });

  test("rejects banned topics and non-objects", () => {
    const s = goodScript();
    s.panels[0].caption = "The founder was arrested on Tuesday.";
    expect(validateScript(s, opts).join()).toMatch(/banned topic/);
    expect(validateScript(null, opts)).toEqual(["answer is not an object"]);
  });
});

describe("model answers", () => {
  test("refusal, cut-off and malformed JSON are ordinary failures", () => {
    expect(parseMessage(JSON.stringify({ stop_reason: "refusal", content: [] }))).toMatchObject({ ok: false, reason: "model refused" });
    expect(parseMessage(JSON.stringify({ stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] }))).toMatchObject({ ok: false });
    expect(parseMessage(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "{not json" }] }))).toMatchObject({ ok: false });
    expect(parseMessage("<html>")).toMatchObject({ ok: false });
    expect(
      parseMessage(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "thinking" }, { type: "text", text: '{"a":1}' }], usage: { input_tokens: 5, output_tokens: 7 } })),
    ).toEqual({ ok: true, json: { a: 1 }, usage: { inputTokens: 5, outputTokens: 7 } });
  });

  test("the writer never sees a meme template name, only our description", () => {
    const key = formatKeyFor("Distracted Boyfriend");
    expect(key).toBe("distracted");
    const prompt = scriptPrompt({ section: "memes", kind: "meme", headline: "A joke", facts: ["A joke."], formats: [describeFormat(key)!] });
    expect(prompt).not.toMatch(/Boyfriend/);
    expect(EVERGREEN_FORMATS).toHaveLength(12);
    expect(formatKeyFor("Some Celebrity Face")).toBeNull();
  });
});

describe("helpers", () => {
  test("retry delays follow max(Retry-After, 2s x 4^(n-1)) capped at 60s", () => {
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(2)).toBe(8000);
    expect(retryDelayMs(3)).toBe(32000);
    expect(retryDelayMs(1, 20000)).toBe(20000);
    expect(retryDelayMs(4)).toBe(60000);
    expect(retryDelayMs(1, 999999)).toBe(60000);
    expect(parseRetryAfter("7")).toBe(7000);
  });

  test("quota errors are recognised and not retried", () => {
    expect(isQuotaError(429, '{"error":{"message":"You exceeded your current quota, please check your plan and billing details."}}')).toBe(true);
    expect(isQuotaError(429, '{"error":{"message":"Rate limit reached"}}')).toBe(false);
    expect(isQuotaError(500, "check your plan")).toBe(false);
  });

  test("constant-time compare", () => {
    expect(constantTimeEqual("secret", "secret")).toBe(true);
    expect(constantTimeEqual("secret", "secreT")).toBe(false);
    expect(constantTimeEqual("secret", "secret2")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  test("one event never fills two sections", () => {
    expect(sharesEvent("Nvidia CEO steps down", "Nvidia shares fall after CEO steps down")).toBe(true);
    expect(sharesEvent("Nvidia ships a new chip", "Apple ships a new phone")).toBe(false);
    expect(sharesEvent("Nvidia ships a new chip", "Nvidia earnings beat estimates")).toBe(false);
  });
});
