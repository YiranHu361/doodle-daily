import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { pacificDate } from "./lib/dates";
import { isReplaceable } from "./lib/dto";
import { isAggregatorUrl, publisherOf, type Section } from "./lib/feeds";
import { isSafeStory } from "./lib/filter";
import { describeFormat, formatKeyFor, formatsForPicker } from "./lib/formats";
import { sharesEvent } from "./lib/overlap";
import { constantTimeEqual, MAX_PANEL_ATTEMPTS, retryDelayMs } from "./lib/retry";
import { cleanScript, validateScript, type Script } from "./lib/script";
import { cut } from "./lib/text";
import { ingestAll, type IngestReport } from "./ingest";
import { getImageProvider, getScriptProvider, panelPrompt, type ScriptProvider } from "./providers";
import { comicKind, section } from "./schema";

export const COMIC_DEADLINE_MS = 10 * 60 * 1000;
export const HARD_STOP_MS = 20 * 60 * 1000;
const DRAW_EXTENSION_MS = 3 * 60 * 1000;
const SLOT_COUNT = 8;
const SLOT_TTL_MS = 3 * 60 * 1000;
const SLOT_WAIT_MS = 4000;
export const STORY_WINDOW_MS = 36 * 60 * 60 * 1000;
const CANDIDATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CANDIDATES = 60;
const BUILD_LOCK_MS = 9 * 60 * 1000;
export const FRESH_LOCK_MS = 5 * 60 * 1000;
const EXTRA_PICKS = 2;
const IMAGES_PER_COMIC = 4;
const MAX_REFERENCES = 3;
export const SECTION_PLAN: [Section, number][] = [
  ["tech", 3],
  ["money", 2],
  ["culture", 2],
  ["memes", 2],
];
const DEVICE_ID = /^[A-Za-z0-9-]{8,64}$/;

export function imageCap(): number {
  const n = Number(process.env.DAILY_IMAGE_CAP);
  return Number.isFinite(n) && n > 0 ? n : 80;
}

function token(): string {
  return crypto.randomUUID();
}

const scriptValidator = v.object({
  title: v.string(),
  realStory: v.string(),
  panels: v.array(v.object({ scene: v.string(), cast: v.array(v.string()), caption: v.string() })),
});

const storyInput = v.object({
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
  owner: v.optional(v.string()),
  unverified: v.optional(v.boolean()),
});
type StoryInput = typeof storyInput.type;

// ---------- locks ----------

async function acquire(ctx: MutationCtx, name: string, holder: string, ttlMs: number): Promise<boolean> {
  const now = Date.now();
  const row = await ctx.db
    .query("locks")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (!row) {
    await ctx.db.insert("locks", { name, holder, expiresAt: now + ttlMs });
    return true;
  }
  if (row.expiresAt > now && row.holder !== holder) return false;
  await ctx.db.patch(row._id, { holder, expiresAt: now + ttlMs });
  return true;
}

export async function release(ctx: MutationCtx, name: string, holder: string): Promise<boolean> {
  const row = await ctx.db
    .query("locks")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (!row || row.holder !== holder) return false;
  await ctx.db.patch(row._id, { expiresAt: 0 });
  return true;
}

async function isHeld(ctx: MutationCtx, name: string): Promise<boolean> {
  const row = await ctx.db
    .query("locks")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  return !!row && row.expiresAt > Date.now();
}

export const acquireLock = internalMutation({
  args: { name: v.string(), holder: v.string(), ttlMs: v.number() },
  returns: v.boolean(),
  handler: (ctx, { name, holder, ttlMs }) => acquire(ctx, name, holder, ttlMs),
});

export const releaseLock = internalMutation({
  args: { name: v.string(), holder: v.string() },
  returns: v.boolean(),
  handler: (ctx, { name, holder }) => release(ctx, name, holder),
});

// ---------- spend ----------

async function spendRow(ctx: MutationCtx, date: string): Promise<Doc<"spend">> {
  const row = await ctx.db
    .query("spend")
    .withIndex("by_date", (q) => q.eq("date", date))
    .unique();
  if (row) return row;
  const id = await ctx.db.insert("spend", { date, imagesReserved: 0, imagesUsed: 0, scriptCalls: 0, inputTokens: 0, outputTokens: 0 });
  return (await ctx.db.get(id))!;
}

async function reserve(ctx: MutationCtx, date: string, count: number): Promise<boolean> {
  const row = await spendRow(ctx, date);
  if (row.imagesReserved + count > imageCap()) return false;
  await ctx.db.patch(row._id, { imagesReserved: row.imagesReserved + count });
  return true;
}

async function refund(ctx: MutationCtx, date: string, count: number) {
  if (count <= 0) return;
  const row = await spendRow(ctx, date);
  await ctx.db.patch(row._id, { imagesReserved: Math.max(0, row.imagesReserved - count) });
}

export const capLeft = internalQuery({
  args: { date: v.string() },
  returns: v.number(),
  handler: async (ctx, { date }) => {
    const row = await ctx.db
      .query("spend")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();
    return imageCap() - (row?.imagesReserved ?? 0);
  },
});

export const reserveImages = internalMutation({
  args: { date: v.string(), count: v.number() },
  returns: v.boolean(),
  handler: (ctx, { date, count }) => reserve(ctx, date, count),
});

export const noteImageUsed = internalMutation({
  args: { date: v.string() },
  returns: v.null(),
  handler: async (ctx, { date }) => {
    const row = await spendRow(ctx, date);
    await ctx.db.patch(row._id, { imagesUsed: row.imagesUsed + 1 });
    return null;
  },
});

export const noteScriptCall = internalMutation({
  args: { date: v.string(), inputTokens: v.number(), outputTokens: v.number() },
  returns: v.null(),
  handler: async (ctx, { date, inputTokens, outputTokens }) => {
    const row = await spendRow(ctx, date);
    await ctx.db.patch(row._id, {
      scriptCalls: row.scriptCalls + 1,
      inputTokens: (row.inputTokens ?? 0) + inputTokens,
      outputTokens: (row.outputTokens ?? 0) + outputTokens,
    });
    return null;
  },
});

// ---------- runs ----------

export const startRun = internalMutation({
  args: { kind: v.string(), date: v.string() },
  returns: v.id("runs"),
  handler: (ctx, { kind, date }) => ctx.db.insert("runs", { kind, date, status: "running", startedAt: Date.now(), note: "" }),
});

export const finishRun = internalMutation({
  args: { runId: v.id("runs"), ok: v.boolean(), note: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, ok, note }) => {
    await ctx.db.patch(runId, { status: ok ? "ok" : "failed", finishedAt: Date.now(), note: cut(note, 4000) });
    return null;
  },
});

// ---------- editions and settling ----------

export async function newestEdition(ctx: MutationCtx): Promise<Doc<"editions"> | null> {
  return await ctx.db.query("editions").withIndex("by_date").order("desc").first();
}

export async function createEdition(ctx: MutationCtx, date: string): Promise<Doc<"editions">> {
  const newest = await ctx.db.query("editions").withIndex("by_number").order("desc").first();
  const id = await ctx.db.insert("editions", { date, number: (newest?.number ?? 0) + 1, status: "building", createdAt: Date.now() });
  return (await ctx.db.get(id))!;
}

export async function replaceTop(ctx: MutationCtx, editionId: Id<"editions">, now: number): Promise<Doc<"comics"> | null> {
  const comics = await editionComics(ctx, editionId);
  const lead = comics.find(isReplaceable);
  if (lead) await ctx.db.patch(lead._id, { replacedAt: now });
  return lead ?? null;
}

async function editionComics(ctx: MutationCtx, editionId: Id<"editions">) {
  return await ctx.db
    .query("comics")
    .withIndex("by_edition_order", (q) => q.eq("editionId", editionId))
    .take(64);
}

export async function deleteComic(ctx: MutationCtx, comic: Doc<"comics">, releaseStory: boolean) {
  for (const p of comic.panels) if (p.imageId) await ctx.storage.delete(p.imageId);
  const reactions = await ctx.db
    .query("reactions")
    .withIndex("by_comic_device", (q) => q.eq("comicId", comic._id))
    .take(1000);
  for (const r of reactions) await ctx.db.delete(r._id);
  const counts = await ctx.db
    .query("reactionCounts")
    .withIndex("by_comic", (q) => q.eq("comicId", comic._id))
    .take(10);
  for (const c of counts) await ctx.db.delete(c._id);
  if (releaseStory && comic.storyId) {
    const story = await ctx.db.get(comic.storyId);
    if (story) await ctx.db.patch(story._id, { used: false, claimedAt: undefined });
  }
  await ctx.db.delete(comic._id);
}

export async function settle(ctx: MutationCtx, editionId: Id<"editions">): Promise<"building" | "published" | "removed" | "missing"> {
  const edition = await ctx.db.get(editionId);
  if (!edition) return "missing";
  const all = await editionComics(ctx, editionId);
  const comics = all.filter((c) => c.pooled !== true);
  const busy = comics.some((c) => c.status === "scripted" || c.status === "drawing");
  if (busy || (await isHeld(ctx, `build:${edition.date}`))) {
    if (edition.status !== "building") await ctx.db.patch(editionId, { status: "building" });
    return "building";
  }
  const visible = comics.filter((c) => c.status === "ready" && c.hidden !== true);
  if (visible.length === 0 && comics.every((c) => c.status === "failed") && all.length === comics.length) {
    for (const c of comics) await deleteComic(ctx, c, true);
    await ctx.db.delete(editionId);
    return "removed";
  }
  if (edition.status !== "published") await ctx.db.patch(editionId, { status: "published", publishedAt: Date.now() });
  return "published";
}

export const settleEdition = internalMutation({
  args: { editionId: v.id("editions") },
  returns: v.union(v.literal("building"), v.literal("published"), v.literal("removed"), v.literal("missing")),
  handler: (ctx, { editionId }) => settle(ctx, editionId),
});

const editionState = v.object({
  editionId: v.id("editions"),
  counts: v.object({ tech: v.number(), money: v.number(), culture: v.number(), memes: v.number() }),
  inPaper: v.array(v.string()),
});

export const ensureEdition = internalMutation({
  args: { date: v.string() },
  returns: editionState,
  handler: async (ctx, { date }) => {
    const edition =
      (await ctx.db
        .query("editions")
        .withIndex("by_date", (q) => q.eq("date", date))
        .unique()) ?? (await createEdition(ctx, date));
    const comics = await editionComics(ctx, edition._id);
    const counts = { tech: 0, money: 0, culture: 0, memes: 0 };
    const inPaper: string[] = [];
    for (const c of comics) {
      if (c.status === "failed" || c.fresh) continue;
      const story = c.storyId ? await ctx.db.get(c.storyId) : null;
      inPaper.push(story?.headline ?? c.title);
      if (!c.hidden) counts[c.section]++;
    }
    return { editionId: edition._id, counts, inPaper };
  },
});

// ---------- stories ----------

export const saveStories = internalMutation({
  args: { stories: v.array(storyInput) },
  returns: v.array(v.id("stories")),
  handler: async (ctx, { stories }) => {
    const now = Date.now();
    const ids: Id<"stories">[] = [];
    for (const s of stories) ids.push(await ctx.db.insert("stories", { ...s, used: false, createdAt: now }));
    return ids;
  },
});

export const claimStory = internalMutation({
  args: { storyId: v.id("stories") },
  returns: v.union(v.null(), v.object({ story: v.any() })),
  handler: async (ctx, { storyId }) => {
    const story = await ctx.db.get(storyId);
    if (!story || story.used) return null;
    await ctx.db.patch(storyId, { used: true, claimedAt: Date.now() });
    return { story: { ...story, used: true } };
  },
});

export const bestUnusedStory = internalQuery({
  args: { now: v.number(), windowMs: v.optional(v.number()) },
  returns: v.union(v.id("stories"), v.null()),
  handler: async (ctx, { now, windowMs }) => {
    const newest = await ctx.db.query("editions").withIndex("by_date").order("desc").first();
    const inPaper: string[] = [];
    if (newest) {
      const comics = await ctx.db
        .query("comics")
        .withIndex("by_edition_order", (q) => q.eq("editionId", newest._id))
        .take(64);
      for (const c of comics) {
        const story = c.storyId ? await ctx.db.get(c.storyId) : null;
        inPaper.push(story?.headline ?? c.title);
      }
    }
    const pooled = await ctx.db
      .query("comics")
      .withIndex("by_pooled", (q) => q.eq("pooled", true))
      .take(64);
    for (const c of pooled) inPaper.push(c.title);
    const fresh = await ctx.db
      .query("stories")
      .withIndex("by_used_createdAt", (q) => q.eq("used", false).gte("createdAt", now - (windowMs ?? STORY_WINDOW_MS)))
      .order("desc")
      .take(100);
    const best = fresh
      .filter((s) => isSafeStory(`${s.headline} ${s.facts.join(" ")}`))
      .filter((s) => !inPaper.some((h) => sharesEvent(h, s.headline)))
      .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)[0];
    return best?._id ?? null;
  },
});

const candidate = v.object({ _id: v.id("items"), source: v.string(), publisher: v.string(), title: v.string(), summary: v.string(), url: v.string() });

export const candidates = internalQuery({
  args: { section, since: v.number() },
  returns: v.array(candidate),
  handler: async (ctx, { section, since }) => {
    const items = await ctx.db
      .query("items")
      .withIndex("by_section_publishedAt", (q) => q.eq("section", section).gte("publishedAt", since))
      .order("desc")
      .take(200);
    return items.map((i) => ({ _id: i._id, source: i.source, publisher: i.publisher, title: i.title, summary: i.summary, url: i.url }));
  },
});

export const formatNames = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => (await ctx.db.query("memeFormats").take(100)).map((f) => f.name),
});

type Candidate = typeof candidate.type;

function storyFromItems(sectionName: Section, items: Candidate[], headline: string, score: number, whyFunny: string): StoryInput {
  const primary = items.find((i) => !isAggregatorUrl(i.url)) ?? items[0];
  const facts = [...new Set(items.map((i) => (i.summary ? `${i.title}. ${i.summary}` : i.title)))].filter(isSafeStory).slice(0, 5);
  return {
    section: sectionName,
    kind: "news",
    headline: cut(headline, 200),
    facts,
    itemIds: items.map((i) => i._id),
    sourceName: primary.source === "Hacker News" || primary.source === "Techmeme" ? publisherOf(primary.url, primary.source) : primary.source,
    sourceUrl: primary.url,
    score: Math.max(1, Math.min(10, score)),
    whyFunny: cut(whyFunny, 300),
  };
}

async function pickNews(
  ctx: ActionCtx,
  provider: ScriptProvider,
  sectionName: Exclude<Section, "memes">,
  n: number,
  inPaper: string[],
  date: string,
): Promise<{ stories: StoryInput[]; note: string }> {
  const items = (await ctx.runQuery(internal.pipeline.candidates, { section: sectionName, since: Date.now() - CANDIDATE_WINDOW_MS }))
    .filter((i) => isSafeStory(`${i.title} ${i.summary}`))
    .filter((i) => !inPaper.some((h) => sharesEvent(h, i.title)))
    .slice(0, MAX_CANDIDATES);
  if (items.length === 0) return { stories: [], note: `${sectionName}: no candidates` };
  const byShortId = new Map(items.map((it, i) => [`i${i + 1}`, it]));
  const result = await provider.pickStories({
    section: sectionName,
    n: n + EXTRA_PICKS,
    items: [...byShortId].map(([id, it]) => ({ id, source: it.source, title: it.title, summary: cut(it.summary, 200) })),
    alreadyInPaper: inPaper,
  });
  if (result.usage) await ctx.runMutation(internal.pipeline.noteScriptCall, { date, ...result.usage });
  if (!result.ok) return { stories: [], note: `${sectionName}: editor failed (${result.reason})` };
  const taken = [...inPaper];
  const stories: StoryInput[] = [];
  for (const pick of [...result.picks].sort((a, b) => b.score - a.score)) {
    const picked = (Array.isArray(pick.itemIds) ? pick.itemIds : []).map((id) => byShortId.get(String(id))).filter((i): i is Candidate => !!i);
    if (picked.length === 0 || typeof pick.headline !== "string" || !pick.headline.trim()) continue;
    if (!isSafeStory(pick.headline)) continue;
    if (taken.some((h) => sharesEvent(h, pick.headline))) continue;
    const story = storyFromItems(sectionName, picked, pick.headline, Number(pick.score) || 5, String(pick.whyFunny ?? ""));
    if (story.facts.length === 0) continue;
    taken.push(pick.headline);
    stories.push(story);
  }
  return { stories, note: `${sectionName}: ${items.length} candidates, ${stories.length} picks` };
}

async function pickMemes(
  ctx: ActionCtx,
  provider: ScriptProvider,
  n: number,
  inPaper: string[],
  date: string,
): Promise<{ stories: StoryInput[]; note: string }> {
  const items = (await ctx.runQuery(internal.pipeline.candidates, { section: "memes", since: Date.now() - CANDIDATE_WINDOW_MS })).filter(
    (i) => i.source === "X" && isSafeStory(`${i.title} ${i.summary}`),
  );
  const trends = new Map<string, Candidate[]>();
  for (const it of items) trends.set(it.title, [...(trends.get(it.title) ?? []), it]);
  if (trends.size === 0) return { stories: [], note: "memes: no trends" };
  const formats = formatsForPicker(await ctx.runQuery(internal.pipeline.formatNames, {}));
  const result = await provider.pickMemes({
    trends: [...trends].slice(0, 12).map(([topic, posts]) => ({
      topic,
      posts: posts.slice(0, 3).map((p) => {
        const m = p.summary.match(/^(\d+) likes: ([\s\S]*)$/);
        return { text: m ? m[2] : p.summary, likes: m ? Number(m[1]) : 0, url: p.url };
      }),
    })),
    formats,
    alreadyInPaper: inPaper,
  });
  if (result.usage) await ctx.runMutation(internal.pipeline.noteScriptCall, { date, ...result.usage });
  if (!result.ok) return { stories: [], note: `memes: picker failed (${result.reason})` };
  const known = new Map(items.map((i) => [i.url, i]));
  const taken = [...inPaper];
  const stories: StoryInput[] = [];
  for (const joke of [...result.picks].sort((a, b) => b.score - a.score)) {
    if (typeof joke.topic !== "string" || typeof joke.theJoke !== "string" || !joke.theJoke.trim()) continue;
    if (!isSafeStory(`${joke.topic} ${joke.theJoke}`) || taken.some((h) => sharesEvent(h, joke.topic))) continue;
    const linked = (Array.isArray(joke.sourceUrls) ? joke.sourceUrls : []).map((u) => known.get(String(u))).filter((i): i is Candidate => !!i);
    const fallback = trends.get(joke.topic) ?? [];
    const sources = linked.length ? linked : fallback;
    if (sources.length === 0) continue;
    taken.push(joke.topic);
    stories.push({
      section: "memes",
      kind: "meme",
      headline: cut(joke.topic, 200),
      facts: [cut(joke.theJoke, 400)],
      itemIds: sources.map((s) => s._id),
      sourceName: "X",
      sourceUrl: sources[0].url,
      score: Math.max(1, Math.min(10, Number(joke.score) || 5)),
      whyFunny: cut(joke.theJoke, 300),
      format: formatKeyFor(joke.format) ?? undefined,
    });
  }
  return { stories: stories.slice(0, n + EXTRA_PICKS), note: `memes: ${trends.size} trends, ${stories.length} picks` };
}

// ---------- writing ----------

type StoryDoc = Doc<"stories">;

export async function writeValidScript(ctx: ActionCtx, provider: ScriptProvider, story: StoryDoc, date: string): Promise<Script | { error: string }> {
  const formatDescription = describeFormat(story.format);
  const base = {
    section: story.section,
    kind: story.kind,
    headline: story.kind === "meme" ? (story.whyFunny ?? story.headline) : story.headline,
    facts: story.facts,
    formats: formatDescription ? [formatDescription] : [],
    unverified: story.unverified === true,
  };
  let repair: { previous: unknown; errors: string[] } | undefined;
  for (let round = 0; round < 2; round++) {
    const result = await provider.writeScript({ ...base, repair });
    if (result.usage) await ctx.runMutation(internal.pipeline.noteScriptCall, { date, ...result.usage });
    if (!result.ok) {
      repair = { previous: null, errors: [result.reason] };
      continue;
    }
    const errors = validateScript(result.script, { kind: story.kind === "meme" ? "meme" : "news", headline: story.headline, unverified: story.unverified === true });
    if (errors.length === 0) return cleanScript(result.script);
    repair = { previous: result.script, errors };
  }
  return { error: `script failed validation: ${(repair?.errors ?? []).slice(0, 4).join("; ")}` };
}

type WriteOutcome = { ok: true; comicId: Id<"comics"> } | { ok: false; reason: "taken" | "bad_script" | "spend_cap" | "no_edition" };

export async function writeComic(
  ctx: ActionCtx,
  provider: ScriptProvider,
  storyId: Id<"stories">,
  target: { editionId?: Id<"editions">; fresh?: boolean; pooled?: boolean; lockToken?: string; replaceTop?: boolean },
): Promise<WriteOutcome & { detail?: string }> {
  const claimed = await ctx.runMutation(internal.pipeline.claimStory, { storyId });
  if (!claimed) return { ok: false, reason: "taken" };
  const story = claimed.story as StoryDoc;
  const date = pacificDate(Date.now());
  const script = await writeValidScript(ctx, provider, story, date);
  if ("error" in script) return { ok: false, reason: "bad_script", detail: script.error };
  return await ctx.runMutation(internal.pipeline.startComic, { storyId, script, ...target });
}

export const startComic = internalMutation({
  args: {
    storyId: v.id("stories"),
    script: scriptValidator,
    editionId: v.optional(v.id("editions")),
    fresh: v.optional(v.boolean()),
    pooled: v.optional(v.boolean()),
    lockToken: v.optional(v.string()),
    replaceTop: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), comicId: v.id("comics") }),
    v.object({ ok: v.literal(false), reason: v.union(v.literal("spend_cap"), v.literal("no_edition"), v.literal("taken"), v.literal("bad_script")) }),
  ),
  handler: async (ctx, { storyId, script, editionId, fresh, pooled, lockToken, replaceTop: replace }) => {
    const story = await ctx.db.get(storyId);
    if (!story) return { ok: false as const, reason: "taken" as const };
    const now = Date.now();
    const date = pacificDate(now);
    if (!(await reserve(ctx, date, IMAGES_PER_COMIC))) {
      await ctx.db.patch(storyId, { used: false, claimedAt: undefined });
      return { ok: false as const, reason: "spend_cap" as const };
    }
    const edition = editionId ? await ctx.db.get(editionId) : ((await newestEdition(ctx)) ?? (await createEdition(ctx, date)));
    if (!edition) {
      await refund(ctx, date, IMAGES_PER_COMIC);
      return { ok: false as const, reason: "no_edition" as const };
    }
    const existing = await ctx.db
      .query("comics")
      .withIndex("by_edition_order", (q) => q.eq("editionId", edition._id))
      .order(fresh ? "asc" : "desc")
      .first();
    const replaced = replace ? await replaceTop(ctx, edition._id, now) : null;
    const order = replaced ? replaced.order : existing ? existing.order + (fresh ? -1 : 1) : 0;
    const comicId = await ctx.db.insert("comics", {
      editionId: edition._id,
      storyId,
      section: story.section,
      kind: story.kind,
      title: script.title,
      realStory: script.realStory,
      sourceName: story.sourceName,
      sourceUrl: story.sourceUrl,
      status: "drawing",
      fresh: fresh || pooled || undefined,
      pooled: pooled || undefined,
      lockToken,
      order,
      createdAt: now,
      deadline: now + COMIC_DEADLINE_MS,
      panels: script.panels.map((p) => ({ scene: p.scene, cast: p.cast, caption: p.caption })),
      owner: story.owner,
      unverified: story.unverified || undefined,
    });
    if (!pooled && edition.status !== "building") await ctx.db.patch(edition._id, { status: "building" });
    for (let index = 0; index < 4; index++) await ctx.scheduler.runAfter(0, internal.pipeline.drawPanel, { comicId, index, attempt: 1 });
    await ctx.scheduler.runAfter(COMIC_DEADLINE_MS, internal.pipeline.checkDeadline, { comicId });
    return { ok: true as const, comicId };
  },
});

// ---------- drawing ----------

async function takeSlot(ctx: MutationCtx, holder: string): Promise<number | null> {
  const now = Date.now();
  const start = Math.floor(Math.random() * SLOT_COUNT);
  for (let k = 0; k < SLOT_COUNT; k++) {
    const slot = (start + k) % SLOT_COUNT;
    const row = await ctx.db
      .query("slots")
      .withIndex("by_slot", (q) => q.eq("slot", slot))
      .unique();
    if (!row) {
      await ctx.db.insert("slots", { slot, holder, expiresAt: now + SLOT_TTL_MS });
      return slot;
    }
    if (!row.holder || row.expiresAt <= now) {
      await ctx.db.patch(row._id, { holder, expiresAt: now + SLOT_TTL_MS });
      return slot;
    }
  }
  return null;
}

async function freeSlot(ctx: MutationCtx, slot: number, holder: string) {
  const row = await ctx.db
    .query("slots")
    .withIndex("by_slot", (q) => q.eq("slot", slot))
    .unique();
  if (row && row.holder === holder) await ctx.db.patch(row._id, { holder: undefined, expiresAt: 0 });
}

const claimResult = v.union(
  v.object({ kind: v.literal("skip") }),
  v.object({ kind: v.literal("wait") }),
  v.object({
    kind: v.literal("go"),
    slot: v.number(),
    holder: v.string(),
    prompt: v.string(),
    scene: v.string(),
    cast: v.array(v.string()),
    section,
    refIds: v.array(v.id("_storage")),
  }),
);

export const claimPanel = internalMutation({
  args: { comicId: v.id("comics"), index: v.number(), attempt: v.number() },
  returns: claimResult,
  handler: async (ctx, { comicId, index, attempt }) => {
    const comic = await ctx.db.get(comicId);
    const panel = comic?.panels[index];
    if (!comic || !panel || comic.status === "failed" || comic.status === "ready" || panel.imageId) return { kind: "skip" as const };
    if ((panel.attempts ?? 0) >= attempt) return { kind: "skip" as const };
    const holder = `${comicId}:${index}:${attempt}`;
    const slot = await takeSlot(ctx, holder);
    if (slot === null) return { kind: "wait" as const };
    const now = Date.now();
    const hardStop = (comic.drawStartedAt ?? comic.createdAt) + HARD_STOP_MS;
    const panels = comic.panels.map((p, i) => (i === index ? { ...p, attempts: attempt, claimedAt: now } : p));
    await ctx.db.patch(comicId, { panels, deadline: Math.min(hardStop, Math.max(comic.deadline, now + DRAW_EXTENSION_MS)) });
    const refIds: Id<"_storage">[] = [];
    for (const name of panel.cast.slice(0, MAX_REFERENCES)) {
      const member = await ctx.db
        .query("cast")
        .withIndex("by_name", (q) => q.eq("name", name as Doc<"cast">["name"]))
        .unique();
      const ref = member?.refId ?? member?.sheetId;
      if (ref) refIds.push(ref);
    }
    return {
      kind: "go" as const,
      slot,
      holder,
      prompt: panelPrompt(panel.scene, panel.cast),
      scene: panel.scene,
      cast: panel.cast,
      section: comic.section,
      refIds,
    };
  },
});

export const drawPanel = internalAction({
  args: { comicId: v.id("comics"), index: v.number(), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { comicId, index, attempt }): Promise<null> => {
    const claim = await ctx.runMutation(internal.pipeline.claimPanel, { comicId, index, attempt });
    if (claim.kind === "skip") return null;
    if (claim.kind === "wait") {
      await ctx.scheduler.runAfter(SLOT_WAIT_MS, internal.pipeline.drawPanel, { comicId, index, attempt });
      return null;
    }
    const base = { comicId, index, attempt, slot: claim.slot, holder: claim.holder };
    try {
      const references = [];
      for (const id of claim.refIds) {
        const blob = await ctx.storage.get(id);
        if (blob) references.push({ bytes: new Uint8Array(await blob.arrayBuffer()), contentType: blob.type || "image/png" });
      }
      const result = await getImageProvider().drawPanel({
        prompt: claim.prompt,
        scene: claim.scene,
        cast: claim.cast,
        section: claim.section,
        seed: `${comicId}:${index}`,
        references,
        format: "jpeg",
      });
      if (!result.ok) {
        await ctx.runMutation(internal.pipeline.panelFailed, { ...base, retryable: result.retryable, retryAfterMs: result.retryAfterMs, reason: result.reason });
        return null;
      }
      const imageId = await ctx.storage.store(new Blob([result.bytes as BlobPart], { type: result.contentType }));
      await ctx.runMutation(internal.pipeline.panelDrawn, { ...base, imageId });
    } catch (e) {
      await ctx.runMutation(internal.pipeline.panelFailed, {
        ...base,
        retryable: true,
        reason: e instanceof Error ? cut(e.message, 200) : "draw crashed",
      });
    }
    return null;
  },
});

const panelArgs = { comicId: v.id("comics"), index: v.number(), attempt: v.number(), slot: v.number(), holder: v.string() };

export const panelDrawn = internalMutation({
  args: { ...panelArgs, imageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { comicId, index, slot, holder, imageId }) => {
    await freeSlot(ctx, slot, holder);
    const comic = await ctx.db.get(comicId);
    const spendDate = pacificDate(comic?.createdAt ?? Date.now());
    const row = await spendRow(ctx, spendDate);
    await ctx.db.patch(row._id, { imagesUsed: row.imagesUsed + 1 });
    if (!comic || comic.status === "failed" || comic.panels[index]?.imageId) {
      await ctx.storage.delete(imageId);
      if (comic?.status === "failed") await ctx.db.patch(row._id, { imagesReserved: row.imagesReserved + 1 });
      return null;
    }
    const panels = comic.panels.map((p, i) => (i === index ? { ...p, imageId } : p));
    const ready = panels.every((p) => p.imageId);
    await ctx.db.patch(comicId, { panels, status: ready ? "ready" : "drawing" });
    if (ready) {
      if (comic.lockToken) await release(ctx, "fresh", comic.lockToken);
      await settle(ctx, comic.editionId);
    }
    return null;
  },
});

async function failComic(ctx: MutationCtx, comic: Doc<"comics">, reason: string) {
  if (comic.status === "failed" || comic.status === "ready") return;
  await refund(ctx, pacificDate(comic.createdAt), comic.panels.filter((p) => !p.imageId).length);
  await ctx.db.patch(comic._id, { status: "failed", hidden: true, error: cut(reason, 300) });
  const replaced = (await editionComics(ctx, comic.editionId)).find((c) => c.replacedAt === comic.createdAt && c._id !== comic._id);
  if (replaced) await ctx.db.patch(replaced._id, { replacedAt: undefined });
  if (comic.lockToken) await release(ctx, "fresh", comic.lockToken);
  await settle(ctx, comic.editionId);
}

export const panelFailed = internalMutation({
  args: { ...panelArgs, retryable: v.boolean(), retryAfterMs: v.optional(v.number()), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { comicId, index, attempt, slot, holder, retryable, retryAfterMs, reason }) => {
    await freeSlot(ctx, slot, holder);
    const comic = await ctx.db.get(comicId);
    if (!comic || comic.status === "failed" || comic.status === "ready") return null;
    if (retryable && attempt < MAX_PANEL_ATTEMPTS) {
      await ctx.db.patch(comicId, { error: cut(`panel ${index + 1} attempt ${attempt}: ${reason}`, 300) });
      await ctx.scheduler.runAfter(retryDelayMs(attempt, retryAfterMs), internal.pipeline.drawPanel, { comicId, index, attempt: attempt + 1 });
      return null;
    }
    await failComic(ctx, comic, `panel ${index + 1} gave up after attempt ${attempt}: ${reason}`);
    return null;
  },
});

export const checkDeadline = internalMutation({
  args: { comicId: v.id("comics") },
  returns: v.null(),
  handler: async (ctx, { comicId }) => {
    const comic = await ctx.db.get(comicId);
    if (!comic || (comic.status !== "drawing" && comic.status !== "scripted")) return null;
    const now = Date.now();
    const hardStop = (comic.drawStartedAt ?? comic.createdAt) + HARD_STOP_MS;
    const due = Math.min(comic.deadline, hardStop);
    if (now >= due) {
      await failComic(ctx, comic, "deadline passed");
      return null;
    }
    await ctx.scheduler.runAfter(due - now, internal.pipeline.checkDeadline, { comicId });
    return null;
  },
});

// ---------- build ----------

const buildResult = v.object({
  date: v.string(),
  status: v.union(v.literal("busy"), v.literal("ok"), v.literal("failed")),
  comics: v.number(),
  note: v.string(),
});
type BuildResult = typeof buildResult.type;

export const buildEdition = internalAction({
  args: { date: v.optional(v.string()), skipIngest: v.optional(v.boolean()), limit: v.optional(v.number()) },
  returns: buildResult,
  handler: async (ctx, args): Promise<BuildResult> => {
    const date = args.date ?? pacificDate(Date.now());
    const holder = token();
    const lock = `build:${date}`;
    if (!(await ctx.runMutation(internal.pipeline.acquireLock, { name: lock, holder, ttlMs: BUILD_LOCK_MS }))) {
      return { date, status: "busy", comics: 0, note: "another build holds the lock" };
    }
    const runId = await ctx.runMutation(internal.pipeline.startRun, { kind: "build", date });
    const notes: string[] = [];
    let made = 0;
    let editionId: Id<"editions"> | null = null;
    let ok = true;
    try {
      if (!args.skipIngest) {
        const report: IngestReport = await ingestAll(ctx).catch((e: unknown) => ({ error: e instanceof Error ? e.message : "ingest failed" }));
        notes.push(`ingest ${JSON.stringify(report)}`);
      }
      const state = await ctx.runMutation(internal.pipeline.ensureEdition, { date });
      editionId = state.editionId;
      const inPaper = [...state.inPaper];
      const provider = getScriptProvider();
      for (const [sectionName, wanted] of SECTION_PLAN) {
        const need = Math.min(wanted - state.counts[sectionName], (args.limit ?? Infinity) - made);
        if (need <= 0) continue;
        if ((await ctx.runQuery(internal.pipeline.capLeft, { date })) < IMAGES_PER_COMIC) {
          notes.push("image cap reached");
          break;
        }
        const picked =
          sectionName === "memes"
            ? await pickMemes(ctx, provider, need, inPaper, date)
            : await pickNews(ctx, provider, sectionName, need, inPaper, date);
        notes.push(picked.note);
        if (picked.stories.length === 0) continue;
        const ids = await ctx.runMutation(internal.pipeline.saveStories, { stories: picked.stories });
        const outcomes = await Promise.all(ids.slice(0, need).map((id) => writeComic(ctx, provider, id, { editionId: state.editionId })));
        outcomes.forEach((o, i) => {
          if (o.ok) {
            made++;
            inPaper.push(picked.stories[i].headline);
          } else notes.push(`${sectionName}: ${o.reason}${o.detail ? " (" + o.detail + ")" : ""}`);
        });
      }
    } catch (e) {
      ok = false;
      notes.push(`error: ${e instanceof Error ? e.message : "build failed"}`);
    } finally {
      await ctx.runMutation(internal.pipeline.releaseLock, { name: lock, holder });
      if (editionId) notes.push(`edition ${await ctx.runMutation(internal.pipeline.settleEdition, { editionId })}`);
      await ctx.runMutation(internal.pipeline.finishRun, { runId, ok, note: notes.join(" | ") });
    }
    return { date, status: ok ? "ok" : "failed", comics: made, note: notes.join(" | ") };
  },
});

export const morningBuild = internalAction({
  args: {},
  returns: v.union(buildResult, v.null()),
  handler: async (ctx): Promise<BuildResult | null> => {
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(new Date()));
    if (hour < 6 || hour > 8) return null;
    return await ctx.runAction(internal.pipeline.buildEdition, {});
  },
});

// ---------- draw a fresh one ----------

const freshResult = v.union(
  v.object({ ok: v.literal(true), comicId: v.id("comics") }),
  v.object({
    ok: v.literal(false),
    reason: v.union(v.literal("bad_secret"), v.literal("no_story"), v.literal("spend_cap"), v.literal("busy"), v.literal("needs_plus")),
  }),
);
type FreshResult = typeof freshResult.type;

export async function fallbackPick(ctx: ActionCtx, provider: ScriptProvider, date: string): Promise<Id<"stories"> | null> {
  for (const sectionName of ["tech", "money", "culture"] as const) {
    const picked = await pickNews(ctx, provider, sectionName, 1, [], date);
    if (picked.stories.length === 0) continue;
    const ids = await ctx.runMutation(internal.pipeline.saveStories, { stories: picked.stories });
    return ids[0];
  }
  return null;
}

export const WIDE_STORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const SLOW_NEWS_SOURCE = "Doodle Daily newsroom";

export function demoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

const SLOW_NEWS_STORY: StoryInput = {
  section: "culture",
  kind: "news",
  headline: "Slow news day in the newsroom",
  facts: [
    "It is a slow news day at the Doodle Daily newsroom.",
    "Boss Blob, Coin, Robo, Newsie and The Crowd wait around the newsroom for a story to come in.",
    "This strip is about the cast only and makes no claims about real events, people or companies.",
  ],
  itemIds: [],
  sourceName: SLOW_NEWS_SOURCE,
  sourceUrl: "",
  score: 0,
};

const SLOW_NEWS_SCRIPT: Script = {
  title: "Slow news day",
  realStory: "Nothing new came in to the newsroom this time, so the cast waited for the next story.",
  panels: [
    { scene: "Newsie sits at a messy newsroom desk, staring at a silent telephone.", cast: ["Newsie"], caption: "The newsroom phone has not rung all morning." },
    { scene: "Robo taps an empty screen while Boss Blob paces past the desks.", cast: ["Robo", "Boss Blob"], caption: "Robo refreshes the feed for the hundredth time." },
    { scene: "Coin flips itself on a desk while The Crowd peeks in at the door.", cast: ["Coin", "The Crowd"], caption: "Coin suggests flipping for who writes the next story." },
    { scene: "Newsie, Robo and Boss Blob share a box of crayons around one desk.", cast: ["Newsie", "Robo", "Boss Blob"], caption: "Slow news day. Robo draws the team instead." },
  ],
};

type LiveOutcome = { ok: true; comicId: Id<"comics"> } | { ok: false; reason: "spend_cap" | "no_story" };

export async function drawLive(ctx: ActionCtx, provider: ScriptProvider, date: string, lockToken: string): Promise<LiveOutcome> {
  const target = { fresh: true, lockToken, replaceTop: true };
  const recent = async () => await ctx.runQuery(internal.pipeline.bestUnusedStory, { now: Date.now() });
  let ingested = false;
  for (let tries = 0; tries < 3; tries++) {
    let storyId =
      (await recent()) ??
      (tries === 0 ? await fallbackPick(ctx, provider, date) : null) ??
      (await ctx.runQuery(internal.pipeline.bestUnusedStory, { now: Date.now(), windowMs: WIDE_STORY_WINDOW_MS }));
    if (!storyId && !ingested) {
      ingested = true;
      await ingestAll(ctx).catch(() => null);
      storyId = (await recent()) ?? (await fallbackPick(ctx, provider, date));
    }
    if (!storyId) break;
    const outcome = await writeComic(ctx, provider, storyId, target);
    if (outcome.ok) return outcome;
    if (outcome.reason === "spend_cap") return { ok: false, reason: "spend_cap" };
  }
  const [storyId] = await ctx.runMutation(internal.pipeline.saveStories, { stories: [SLOW_NEWS_STORY] });
  const written = await writeComic(ctx, provider, storyId, target);
  if (written.ok) return written;
  if (written.reason === "spend_cap") return { ok: false, reason: "spend_cap" };
  const canned = await ctx.runMutation(internal.pipeline.startComic, { storyId, script: SLOW_NEWS_SCRIPT, ...target });
  if (canned.ok) return canned;
  return { ok: false, reason: canned.reason === "spend_cap" ? "spend_cap" : "no_story" };
}

export const drawFreshOne = action({
  args: { deviceId: v.string(), secret: v.string() },
  returns: freshResult,
  handler: async (ctx, { deviceId, secret }): Promise<FreshResult> => {
    const expected = process.env.DEMO_SECRET ?? "";
    if (!expected || !constantTimeEqual(secret, expected)) return { ok: false, reason: "bad_secret" };
    if (!DEVICE_ID.test(deviceId)) throw new ConvexError("bad_device_id");
    const demo = demoMode();
    const tier = demo ? "demo" : await ctx.runMutation(internal.billing.claimFreeDraw, { deviceId });
    if (tier === "needs_plus") return { ok: false, reason: "needs_plus" };
    const holder = token();
    let locked = false;
    let keepLock = false;
    try {
      if (!demo) {
        locked = await ctx.runMutation(internal.pipeline.acquireLock, { name: "fresh", holder, ttlMs: FRESH_LOCK_MS });
        if (!locked) return { ok: false, reason: "busy" };
      }
      const pooled = await ctx.runMutation(internal.freshPool.claim, { lockToken: locked ? holder : undefined });
      if (pooled) {
        keepLock = true;
        return { ok: true, comicId: pooled };
      }
      if (!locked) {
        locked = await ctx.runMutation(internal.pipeline.acquireLock, { name: "fresh", holder, ttlMs: FRESH_LOCK_MS });
        if (!locked) return { ok: false, reason: "busy" };
      }
      const date = pacificDate(Date.now());
      if ((await ctx.runQuery(internal.pipeline.capLeft, { date })) < IMAGES_PER_COMIC) return { ok: false, reason: "spend_cap" };
      const outcome = await drawLive(ctx, getScriptProvider(), date, holder);
      keepLock = outcome.ok;
      return outcome;
    } finally {
      if (!keepLock) {
        if (locked) await ctx.runMutation(internal.pipeline.releaseLock, { name: "fresh", holder });
        if (tier === "free") await ctx.runMutation(internal.billing.returnFreeDraw, { deviceId });
      }
    }
  },
});

// ---------- commissions ----------

const SECTION_WORDS: [Section, RegExp][] = [
  ["money", /\b(stock|stocks|market|markets|price|prices|bank|banks|money|dollar|economy|inflation|rates?|invest\w*|ipo|earnings|crypto|bitcoin|funding|seed round|startup valuation|tariffs?|salary|rent)\b/i],
  ["tech", /\b(ai|robot\w*|app|apps|software|phone|iphone|android|chip|chips|computer|startup|tech|code|coding|internet|website|gadget|laptop|cloud|model|gpu)\b/i],
];

export function sectionForBrief(text: string, kind: typeof comicKind.type): Section {
  if (kind === "meme") return "memes";
  return SECTION_WORDS.find(([, re]) => re.test(text))?.[0] ?? "culture";
}

const briefResult = v.union(
  v.object({ ok: v.literal(true), comicId: v.id("comics") }),
  v.object({ ok: v.literal(false), reason: v.union(v.literal("bad_brief"), v.literal("unsafe"), v.literal("spend_cap"), v.literal("bad_script")) }),
);
type BriefResult = typeof briefResult.type;

export const drawFromBrief = internalAction({
  args: {
    headline: v.string(),
    facts: v.array(v.string()),
    sourceName: v.string(),
    sourceUrl: v.string(),
    kind: comicKind,
    owner: v.optional(v.string()),
    unverified: v.optional(v.boolean()),
  },
  returns: briefResult,
  handler: async (ctx, args): Promise<BriefResult> => {
    const headline = args.headline.trim();
    const facts = args.facts.map((f) => f.trim()).filter(Boolean).slice(0, 8).map((f) => cut(f, 600));
    if (!headline || headline.length > 300 || facts.length === 0) return { ok: false, reason: "bad_brief" };
    if (!isSafeStory(`${headline} ${facts.join(" ")}`)) return { ok: false, reason: "unsafe" };
    const date = pacificDate(Date.now());
    if ((await ctx.runQuery(internal.pipeline.capLeft, { date })) < IMAGES_PER_COMIC) return { ok: false, reason: "spend_cap" };
    const [storyId] = await ctx.runMutation(internal.pipeline.saveStories, {
      stories: [
        {
          section: sectionForBrief(`${headline} ${facts.join(" ")}`, args.kind),
          kind: args.kind,
          headline: cut(headline, 200),
          facts,
          itemIds: [],
          sourceName: cut(args.sourceName.trim() || "Created by a reader", 120),
          sourceUrl: args.sourceUrl.trim(),
          score: 0,
          owner: args.owner,
          unverified: args.unverified || undefined,
        },
      ],
    });
    const outcome = await writeComic(ctx, getScriptProvider(), storyId, { fresh: true });
    if (outcome.ok) return { ok: true, comicId: outcome.comicId };
    return { ok: false, reason: outcome.reason === "spend_cap" ? "spend_cap" : "bad_script" };
  },
});
