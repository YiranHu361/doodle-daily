import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addDays, pacificDate } from "./lib/dates";
import { checkDeviceId } from "./lib/device";
import { isVisible } from "./lib/dto";
import { isSafeStory } from "./lib/filter";
import { isRealSource } from "./lib/urls";
import { getScriptProvider } from "./providers";
import { callClaude } from "./providers/anthropic";

export const QUIZ_MODEL = "claude-haiku-5-5";
export const BOARD_SIZE = 20;
export const DAILY_ANSWER_LIMIT = 60;
export const RIGHT_POINTS = 10;
export const MAX_SPEED_BONUS = 5;
const LOCK_TTL_MS = 60_000;
export const QUIZ_RETRY_MS = 5_000;
export const QUIZ_RETRIES = 3;
const QUIZ_REPAIR = "Your last answer broke the rules. Reply with one question of at most 18 words, exactly three different options of at most 8 words each, and answer as 0, 1 or 2.";
const RANK_SCAN_LIMIT = 1000;

const ADJECTIVES = ["Neon", "Turbo", "Cosmic", "Fuzzy", "Sneaky", "Mighty", "Jolly", "Pixel", "Zippy", "Bouncy", "Crafty", "Sunny", "Lucky", "Rocket", "Velvet", "Wobbly"];
const ANIMALS = ["Otter", "Pigeon", "Panda", "Llama", "Gecko", "Walrus", "Badger", "Koala", "Falcon", "Narwhal", "Hamster", "Moose", "Puffin", "Ferret", "Yak", "Lemur"];

export function generatedName(deviceId: string): string {
  let h = 2166136261;
  for (let i = 0; i < deviceId.length; i++) h = Math.imul(h ^ deviceId.charCodeAt(i), 16777619) >>> 0;
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${ANIMALS[Math.floor(h / ADJECTIVES.length) % ANIMALS.length]}`;
}

const LINK = /(https?:|www\.|@|\b[a-z0-9-]+\.(com|net|org|io|co|app|ly|gg|me|xyz|dev|ai|tv|us|uk)\b)/i;

export function cleanName(raw: string): { ok: true; name: string } | { ok: false; reason: "bad_name" | "not_allowed" } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 16) return { ok: false, reason: "bad_name" };
  if (LINK.test(name) || !isSafeStory(name)) return { ok: false, reason: "not_allowed" };
  return { ok: true, name };
}

export function speedBonus(elapsedMs: number): number {
  const ms = Number.isFinite(elapsedMs) ? Math.min(60_000, Math.max(0, elapsedMs)) : 60_000;
  if (ms <= 3000) return MAX_SPEED_BONUS;
  if (ms >= 15_000) return 0;
  return Math.round((MAX_SPEED_BONUS * (15_000 - ms)) / 12_000);
}

export function quizPrompt(comic: Pick<Doc<"comics">, "title" | "realStory" | "panels">): string {
  return [
    "Write one multiple-choice question for readers who just finished this four-panel comic and its real story.",
    "Rules: the answer must be found in the captions or the real story below, never in outside knowledge.",
    "No trick questions, no negatives (\"which is NOT\"), no dates or exact numbers unless they are stated below.",
    "Three short options (at most 8 words each), exactly one right. The wrong options must be plausible but clearly wrong to anyone who read the comic.",
    "The question is at most 18 words. Friendly, light tone.",
    `Title: ${comic.title}`,
    ...comic.panels.map((p, i) => `Caption ${i + 1}: ${p.caption}`),
    `Real story: ${comic.realStory}`,
  ].join("\n");
}

const QUIZ_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string" },
    options: { type: "array", items: { type: "string" } },
    answer: { type: "integer" },
  },
  required: ["question", "options", "answer"],
  additionalProperties: false,
};

export function checkQuiz(raw: unknown): { question: string; options: string[]; answer: number } | null {
  const q = raw as { question?: unknown; options?: unknown; answer?: unknown };
  if (typeof q?.question !== "string" || !Array.isArray(q.options) || typeof q.answer !== "number") return null;
  const question = q.question.trim();
  const options = q.options.map((o) => (typeof o === "string" ? o.trim() : ""));
  if (!question || question.length > 200 || options.length !== 3) return null;
  if (options.some((o) => !o || o.length > 80) || new Set(options.map((o) => o.toLowerCase())).size !== 3) return null;
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 2) return null;
  return { question, options, answer: q.answer };
}

function canHaveQuiz(comic: Doc<"comics"> | null): comic is Doc<"comics"> {
  return (
    !!comic && comic.status === "ready" && comic.hidden !== true && comic.owner === undefined && comic.panels.length === 4 && isRealSource(comic.sourceUrl)
  );
}

async function quizFor(ctx: QueryCtx, comicId: Id<"comics">) {
  return ctx.db
    .query("quizzes")
    .withIndex("by_comic", (q) => q.eq("comicId", comicId))
    .unique();
}

async function lockFor(ctx: MutationCtx, name: string) {
  return ctx.db
    .query("locks")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
}

export const reserve = internalMutation({
  args: { comicId: v.id("comics"), holder: v.string(), canGenerate: v.boolean() },
  returns: v.union(
    v.object({ ok: v.literal(true), title: v.string(), realStory: v.string(), captions: v.array(v.string()) }),
    v.object({ ok: v.literal(false), reason: v.union(v.literal("ready"), v.literal("busy"), v.literal("not_found"), v.literal("unavailable")) }),
  ),
  handler: async (ctx, { comicId, holder, canGenerate }) => {
    if (await quizFor(ctx, comicId)) return { ok: false as const, reason: "ready" as const };
    const comic = await ctx.db.get(comicId);
    if (!canHaveQuiz(comic)) return { ok: false as const, reason: "not_found" as const };
    if (!canGenerate) return { ok: false as const, reason: "unavailable" as const };
    const now = Date.now();
    const name = `quiz:${comicId}`;
    const lock = await lockFor(ctx, name);
    if (lock && lock.expiresAt > now && lock.holder !== holder) return { ok: false as const, reason: "busy" as const };
    if (lock) await ctx.db.patch(lock._id, { holder, expiresAt: now + LOCK_TTL_MS });
    else await ctx.db.insert("locks", { name, holder, expiresAt: now + LOCK_TTL_MS });
    return { ok: true as const, title: comic.title, realStory: comic.realStory, captions: comic.panels.map((p) => p.caption) };
  },
});

export const save = internalMutation({
  args: { comicId: v.id("comics"), holder: v.string(), quiz: v.union(v.null(), v.object({ question: v.string(), options: v.array(v.string()), answer: v.number() })) },
  returns: v.boolean(),
  handler: async (ctx, { comicId, holder, quiz }) => {
    const lock = await lockFor(ctx, `quiz:${comicId}`);
    if (lock && lock.holder === holder) await ctx.db.patch(lock._id, { expiresAt: 0 });
    if (!quiz || (await quizFor(ctx, comicId))) return false;
    await ctx.db.insert("quizzes", { comicId, ...quiz, createdAt: Date.now() });
    return true;
  },
});

function shuffle(quiz: { question: string; options: string[]; answer: number }) {
  const order = [0, 1, 2].sort(() => Math.random() - 0.5);
  return { question: quiz.question, options: order.map((i) => quiz.options[i]), answer: order.indexOf(quiz.answer) };
}

const ensureResult = v.union(
  v.object({ ok: v.literal(true), status: v.union(v.literal("ready"), v.literal("busy")) }),
  v.object({ ok: v.literal(false), reason: v.union(v.literal("not_found"), v.literal("unavailable"), v.literal("failed")) }),
);
type EnsureResult = Infer<typeof ensureResult>;

async function ensureQuiz(ctx: ActionCtx, comicId: Id<"comics">): Promise<EnsureResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const holder = crypto.randomUUID();
  const canGenerate = !!apiKey && getScriptProvider().name === "anthropic";
  const job = await ctx.runMutation(internal.quiz.reserve, { comicId, holder, canGenerate });
  if (!job.ok) {
    if (job.reason === "ready" || job.reason === "busy") return { ok: true, status: job.reason };
    return { ok: false, reason: job.reason };
  }
  let quiz: ReturnType<typeof checkQuiz> = null;
  try {
    const prompt = quizPrompt({ title: job.title, realStory: job.realStory, panels: job.captions.map((caption) => ({ caption, scene: "", cast: [] })) });
    for (const extra of ["", QUIZ_REPAIR]) {
      const r = await callClaude(apiKey!, extra ? `${prompt}\n${extra}` : prompt, QUIZ_SCHEMA, { timeoutMs: 15_000, retries: 1, maxTokens: 400, model: QUIZ_MODEL });
      if (!r.ok) {
        console.warn(`quiz ${comicId}: ${r.reason}`);
        break;
      }
      quiz = checkQuiz(r.json);
      if (quiz) break;
    }
  } finally {
    await ctx.runMutation(internal.quiz.save, { comicId, holder, quiz: quiz && shuffle(quiz) });
  }
  return quiz ? { ok: true, status: "ready" } : { ok: false, reason: "failed" };
}

export const ensure = action({
  args: { comicId: v.id("comics") },
  returns: ensureResult,
  handler: async (ctx, { comicId }): Promise<EnsureResult> => ensureQuiz(ctx, comicId),
});

export const ensureLater = internalAction({
  args: { comicId: v.id("comics"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { comicId, attempt }) => {
    const r = await ensureQuiz(ctx, comicId);
    if (!r.ok && r.reason === "failed" && attempt <= QUIZ_RETRIES) await ctx.scheduler.runAfter(QUIZ_RETRY_MS, internal.quiz.ensureLater, { comicId, attempt: attempt + 1 });
    return null;
  },
});

export async function scheduleQuiz(ctx: MutationCtx, comicId: Id<"comics">): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.quiz.ensureLater, { comicId, attempt: 1 });
}

const result = v.object({ choice: v.number(), right: v.boolean(), answer: v.number(), points: v.number() });

export const forComic = query({
  args: { comicId: v.id("comics"), deviceId: v.string() },
  returns: v.union(v.null(), v.object({ question: v.string(), options: v.array(v.string()), result: v.union(v.null(), result) })),
  handler: async (ctx, { comicId, deviceId }) => {
    const comic = await ctx.db.get(comicId);
    if (!canHaveQuiz(comic) || !isVisible(comic)) return null;
    const quiz = await quizFor(ctx, comicId);
    if (!quiz) return null;
    const mine = await ctx.db
      .query("quizAnswers")
      .withIndex("by_comic_device", (q) => q.eq("comicId", comicId).eq("deviceId", deviceId))
      .unique();
    return {
      question: quiz.question,
      options: quiz.options,
      result: mine ? { choice: mine.choice, right: mine.right, answer: quiz.answer, points: mine.points } : null,
    };
  },
});

async function dayRow(ctx: QueryCtx, deviceId: string, date: string) {
  return ctx.db
    .query("playerDays")
    .withIndex("by_device_date", (q) => q.eq("deviceId", deviceId).eq("date", date))
    .unique();
}

async function playerName(ctx: QueryCtx, deviceId: string): Promise<string> {
  const player = await ctx.db
    .query("players")
    .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
    .unique();
  return player?.name ?? generatedName(deviceId);
}

export const answer = mutation({
  args: { comicId: v.id("comics"), deviceId: v.string(), choice: v.number(), elapsedMs: v.number() },
  returns: v.union(
    v.object({ ok: v.literal(true), right: v.boolean(), answer: v.number(), points: v.number() }),
    v.object({ ok: v.literal(false), reason: v.union(v.literal("not_found"), v.literal("already_answered"), v.literal("limit")) }),
  ),
  handler: async (ctx, { comicId, deviceId, choice, elapsedMs }) => {
    checkDeviceId(deviceId);
    if (!Number.isInteger(choice) || choice < 0 || choice > 2) throw new ConvexError("bad_choice");
    const comic = await ctx.db.get(comicId);
    const quiz = canHaveQuiz(comic) && isVisible(comic) ? await quizFor(ctx, comicId) : null;
    if (!quiz) return { ok: false as const, reason: "not_found" as const };
    const existing = await ctx.db
      .query("quizAnswers")
      .withIndex("by_comic_device", (q) => q.eq("comicId", comicId).eq("deviceId", deviceId))
      .unique();
    if (existing) return { ok: false as const, reason: "already_answered" as const };
    const now = Date.now();
    const date = pacificDate(now);
    const todays = await ctx.db
      .query("quizAnswers")
      .withIndex("by_device_date", (q) => q.eq("deviceId", deviceId).eq("date", date))
      .take(DAILY_ANSWER_LIMIT);
    if (todays.length >= DAILY_ANSWER_LIMIT) return { ok: false as const, reason: "limit" as const };

    const right = choice === quiz.answer;
    const points = right ? RIGHT_POINTS + speedBonus(elapsedMs) : 0;
    await ctx.db.insert("quizAnswers", { comicId, deviceId, date, choice, right, points, createdAt: now });

    const today = await dayRow(ctx, deviceId, date);
    if (today) {
      const firstRight = right && today.rightAnswers === 0;
      await ctx.db.patch(today._id, {
        points: today.points + points,
        negPoints: -(today.points + points),
        rightAnswers: today.rightAnswers + (right ? 1 : 0),
        streak: firstRight ? today.streak + 1 : today.streak,
        reachedAt: points ? now : today.reachedAt,
      });
    } else {
      const yesterday = await dayRow(ctx, deviceId, addDays(date, -1));
      const carried = yesterday && yesterday.rightAnswers > 0 ? yesterday.streak : 0;
      await ctx.db.insert("playerDays", {
        deviceId,
        date,
        points,
        negPoints: -points,
        rightAnswers: right ? 1 : 0,
        streak: right ? carried + 1 : carried,
        reachedAt: now,
      });
    }
    return { ok: true as const, right, answer: quiz.answer, points };
  },
});

const boardRow = v.object({ key: v.string(), rank: v.number(), name: v.string(), points: v.number(), streak: v.number(), me: v.boolean() });

export const board = query({
  args: { deviceId: v.string() },
  returns: v.object({
    date: v.string(),
    rows: v.array(boardRow),
    me: v.object({ rank: v.union(v.number(), v.null()), name: v.string(), points: v.number(), streak: v.number() }),
  }),
  handler: async (ctx, { deviceId }) => {
    checkDeviceId(deviceId);
    const date = pacificDate(Date.now());
    const top = await ctx.db
      .query("playerDays")
      .withIndex("by_date_rank", (q) => q.eq("date", date))
      .take(BOARD_SIZE);
    const rows = await Promise.all(
      top.map(async (r, i) => ({ key: r._id, rank: i + 1, name: await playerName(ctx, r.deviceId), points: r.points, streak: r.streak, me: r.deviceId === deviceId })),
    );
    const name = await playerName(ctx, deviceId);
    const mineInTop = rows.find((r) => r.me);
    if (mineInTop) return { date, rows, me: { rank: mineInTop.rank, name, points: mineInTop.points, streak: mineInTop.streak } };

    const mine = await dayRow(ctx, deviceId, date);
    if (!mine) {
      const yesterday = await dayRow(ctx, deviceId, addDays(date, -1));
      return { date, rows, me: { rank: null, name, points: 0, streak: yesterday && yesterday.rightAnswers > 0 ? yesterday.streak : 0 } };
    }
    const ahead = await ctx.db
      .query("playerDays")
      .withIndex("by_date_rank", (q) => q.eq("date", date).lte("negPoints", mine.negPoints))
      .take(RANK_SCAN_LIMIT);
    const before = ahead.filter((r) => r.negPoints < mine.negPoints || r.reachedAt < mine.reachedAt || (r.reachedAt === mine.reachedAt && r._id < mine._id));
    const rank = ahead.length >= RANK_SCAN_LIMIT ? null : before.length + 1;
    return { date, rows, me: { rank, name, points: mine.points, streak: mine.streak } };
  },
});

export const rename = mutation({
  args: { deviceId: v.string(), name: v.string() },
  returns: v.union(v.object({ ok: v.literal(true), name: v.string() }), v.object({ ok: v.literal(false), reason: v.union(v.literal("bad_name"), v.literal("not_allowed")) })),
  handler: async (ctx, { deviceId, name }) => {
    checkDeviceId(deviceId);
    const checked = cleanName(name);
    if (!checked.ok) return checked;
    const player = await ctx.db
      .query("players")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .unique();
    if (player) await ctx.db.patch(player._id, { name: checked.name, updatedAt: Date.now() });
    else await ctx.db.insert("players", { deviceId, name: checked.name, updatedAt: Date.now() });
    return { ok: true as const, name: checked.name };
  },
});
