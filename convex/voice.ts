import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, query, type MutationCtx } from "./_generated/server";
import { pacificDate } from "./lib/dates";
import { isVisible } from "./lib/dto";
import { sleep } from "./lib/http";
import { isQuotaError, isRetryableStatus, parseRetryAfter } from "./lib/retry";
import type { section } from "./schema";

type Section = Infer<typeof section>;
type ClipId = Id<"_storage"> | null;

export const SPEECH_URL = "https://api.openai.com/v1/audio/speech";
export const VOICE_MODEL = "gpt-4o-mini-tts";
export const VOICE_NAME = "cedar";
export const CLIPS_PER_COMIC = 5;
export const DEFAULT_DAILY_VOICE_CAP = 400;
export const MAX_CLIP_ATTEMPTS = 3;
const CLIP_TIMEOUT_MS = 30_000;
const LOCK_TTL_MS = 3 * 60_000;
const MIN_CLIP_BYTES = 512;
const MAX_CLIP_BYTES = 5 * 1024 * 1024;
const MAX_VOICE_RUNS = 1000;

const NEWSIE =
  "You are Newsie, a small orange bird in a folded paper hat who reads a crayon-drawn newspaper aloud. " +
  "Sound like a warm newsreader with a slightly wry edge. Read the text exactly as written, word for word: " +
  "never add, drop or change a word, and add no greeting, heading or sign-off.";

const DELIVERY: Record<Section, string> = {
  tech: "Delivery: deadpan, as if none of this is surprising.",
  money: "Delivery: brisk and businesslike, keep it moving.",
  culture: "Delivery: quietly amused, a smile in the voice.",
  memes: "Delivery: playful and light, enjoying the joke.",
};

export function voiceInstructions(s: Section): string {
  return `${NEWSIE} ${DELIVERY[s]}`;
}

export function voiceRetryDelayMs(attempt: number, retryAfterMs?: number): number {
  return Math.min(10_000, Math.max(retryAfterMs ?? 0, 1000 * Math.pow(3, Math.max(0, attempt - 1))));
}

export function dailyVoiceCap(raw = process.env.DAILY_VOICE_CAP): number {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_DAILY_VOICE_CAP;
}

export function noteClips(note: string): number {
  try {
    const clips = (JSON.parse(note) as { clips?: unknown }).clips;
    return typeof clips === "number" && Number.isFinite(clips) && clips > 0 ? clips : 0;
  } catch {
    return 0;
  }
}

function clipIds(comic: Doc<"comics">): ClipId[] {
  const panels = comic.panelAudioIds ?? [];
  return [0, 1, 2, 3].map((i) => panels[i] ?? null).concat(comic.realStoryAudioId ?? null);
}

function clipTexts(comic: Doc<"comics">): string[] {
  return [...comic.panels.map((p) => p.caption), comic.realStory];
}

async function lockFor(ctx: MutationCtx, name: string) {
  return ctx.db
    .query("locks")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
}

async function clipsUsedOn(ctx: MutationCtx, date: string): Promise<number> {
  const runs = await ctx.db
    .query("runs")
    .withIndex("by_kind_startedAt", (q) => q.eq("kind", "voice"))
    .order("desc")
    .take(MAX_VOICE_RUNS);
  let used = 0;
  for (const run of runs) {
    if (run.date !== date) break;
    used += noteClips(run.note);
  }
  return used;
}

const clipJob = v.object({ slot: v.number(), text: v.string() });

export const reserve = internalMutation({
  args: { comicId: v.id("comics"), holder: v.string(), canGenerate: v.boolean() },
  returns: v.union(
    v.object({ ok: v.literal(true), runId: v.id("runs"), section: v.string(), clips: v.array(clipJob) }),
    v.object({
      ok: v.literal(false),
      reason: v.union(v.literal("not_found"), v.literal("ready"), v.literal("busy"), v.literal("voice_cap"), v.literal("unavailable")),
    }),
  ),
  handler: async (ctx, { comicId, holder, canGenerate }) => {
    const comic = await ctx.db.get(comicId);
    if (!comic || !isVisible(comic)) return { ok: false as const, reason: "not_found" as const };
    const texts = clipTexts(comic);
    const clips = clipIds(comic)
      .map((id, slot) => ({ id, slot, text: texts[slot] }))
      .filter((c) => !c.id && c.text.trim())
      .map(({ slot, text }) => ({ slot, text }));
    if (!clips.length) return { ok: false as const, reason: "ready" as const };
    if (!canGenerate) return { ok: false as const, reason: "unavailable" as const };

    const now = Date.now();
    const name = `voice:${comicId}`;
    const lock = await lockFor(ctx, name);
    if (lock && lock.expiresAt > now && lock.holder !== holder) return { ok: false as const, reason: "busy" as const };

    const date = pacificDate(now);
    if ((await clipsUsedOn(ctx, date)) + clips.length > dailyVoiceCap()) return { ok: false as const, reason: "voice_cap" as const };

    if (lock) await ctx.db.patch(lock._id, { holder, expiresAt: now + LOCK_TTL_MS });
    else await ctx.db.insert("locks", { name, holder, expiresAt: now + LOCK_TTL_MS });
    const runId = await ctx.db.insert("runs", {
      kind: "voice",
      date,
      status: "running",
      startedAt: now,
      note: JSON.stringify({ comicId, clips: clips.length }),
    });
    return { ok: true as const, runId, section: comic.section, clips };
  },
});

export const saveClip = internalMutation({
  args: { comicId: v.id("comics"), slot: v.number(), storageId: v.id("_storage") },
  returns: v.boolean(),
  handler: async (ctx, { comicId, slot, storageId }) => {
    const comic = await ctx.db.get(comicId);
    if (!comic || clipIds(comic)[slot] !== null || !Number.isInteger(slot) || slot < 0 || slot >= CLIPS_PER_COMIC) {
      await ctx.storage.delete(storageId);
      return false;
    }
    if (slot === 4) {
      await ctx.db.patch(comicId, { realStoryAudioId: storageId });
    } else {
      const panelAudioIds = clipIds(comic).slice(0, 4);
      panelAudioIds[slot] = storageId;
      await ctx.db.patch(comicId, { panelAudioIds });
    }
    return true;
  },
});

export const finish = internalMutation({
  args: { comicId: v.id("comics"), holder: v.string(), runId: v.id("runs"), made: v.number(), errors: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { comicId, holder, runId, made, errors }) => {
    await ctx.db.patch(runId, {
      status: errors.length && !made ? "failed" : "ok",
      finishedAt: Date.now(),
      note: JSON.stringify({ comicId, clips: made, errors }),
    });
    const lock = await lockFor(ctx, `voice:${comicId}`);
    if (lock && lock.holder === holder) await ctx.db.patch(lock._id, { expiresAt: 0 });
    return null;
  },
});

type Speech = { ok: true; bytes: ArrayBuffer } | { ok: false; reason: string; retryable: boolean; retryAfterMs?: number };

async function requestSpeech(apiKey: string, input: string, instructions: string): Promise<Speech> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Speech>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, reason: `timeout after ${CLIP_TIMEOUT_MS} ms`, retryable: true });
    }, CLIP_TIMEOUT_MS);
  });
  const run = async (): Promise<Speech> => {
    const res = await fetch(SPEECH_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: VOICE_MODEL, voice: VOICE_NAME, input, instructions, response_format: "mp3" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        reason: `openai HTTP ${res.status}`,
        retryable: !isQuotaError(res.status, body) && isRetryableStatus(res.status),
        retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
      };
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < MIN_CLIP_BYTES || bytes.byteLength > MAX_CLIP_BYTES) {
      return { ok: false, reason: `openai clip of ${bytes.byteLength} bytes`, retryable: true };
    }
    return { ok: true, bytes };
  };
  try {
    return await Promise.race([run(), timeout]);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message.slice(0, 80) : "fetch failed", retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

async function speak(apiKey: string, input: string, instructions: string): Promise<Speech> {
  let last: Speech = { ok: false, reason: "not tried", retryable: false };
  for (let attempt = 1; attempt <= MAX_CLIP_ATTEMPTS; attempt++) {
    last = await requestSpeech(apiKey, input, instructions);
    if (last.ok || !last.retryable || attempt === MAX_CLIP_ATTEMPTS) return last;
    await sleep(voiceRetryDelayMs(attempt, last.retryAfterMs));
  }
  return last;
}

const ensureResult = v.union(
  v.object({ ok: v.literal(true), status: v.union(v.literal("ready"), v.literal("partial"), v.literal("busy")) }),
  v.object({ ok: v.literal(false), reason: v.union(v.literal("not_found"), v.literal("voice_cap"), v.literal("unavailable")) }),
);
type EnsureResult = Infer<typeof ensureResult>;

export const ensure = action({
  args: { comicId: v.id("comics") },
  returns: ensureResult,
  handler: async (ctx, { comicId }): Promise<EnsureResult> => {
    const apiKey = process.env.OPENAI_API_KEY;
    const holder = crypto.randomUUID();
    const job = await ctx.runMutation(internal.voice.reserve, { comicId, holder, canGenerate: !!apiKey });
    if (!job.ok) {
      if (job.reason === "ready") return { ok: true, status: "ready" };
      if (job.reason === "busy") return { ok: true, status: "busy" };
      return { ok: false, reason: job.reason };
    }
    const instructions = voiceInstructions(job.section as Section);
    let made = 0;
    const errors: string[] = [];
    try {
      await Promise.all(
        job.clips.map(async ({ slot, text }) => {
          const speech = await speak(apiKey!, text, instructions);
          if (!speech.ok) {
            errors.push(`clip ${slot}: ${speech.reason}`);
            return;
          }
          const storageId = await ctx.storage.store(new Blob([speech.bytes], { type: "audio/mpeg" }));
          if (await ctx.runMutation(internal.voice.saveClip, { comicId, slot, storageId })) made++;
        }),
      );
    } catch (e) {
      errors.push(e instanceof Error ? e.message.slice(0, 120) : "voice failed");
    } finally {
      await ctx.runMutation(internal.voice.finish, { comicId, holder, runId: job.runId, made, errors });
    }
    return { ok: true, status: errors.length ? "partial" : "ready" };
  },
});

const clipUrls = v.object({ panels: v.array(v.union(v.string(), v.null())), realStory: v.union(v.string(), v.null()) });

export const forComic = query({
  args: { comicId: v.id("comics") },
  returns: clipUrls,
  handler: async (ctx, { comicId }) => {
    const comic = await ctx.db.get(comicId);
    if (!comic || !isVisible(comic)) return { panels: [null, null, null, null], realStory: null };
    const urls = await Promise.all(clipIds(comic).map((id) => (id ? ctx.storage.getUrl(id) : null)));
    return { panels: urls.slice(0, 4), realStory: urls[4] };
  },
});
