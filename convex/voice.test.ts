import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { dailyVoiceCap, noteClips, SPEECH_URL, VOICE_MODEL, voiceRetryDelayMs } from "./voice";

type Call = { model: string; voice: string; input: string; instructions: string; response_format: string };

let calls: Call[] = [];
let failInput: string | null = null;

function stubSpeech(delayMs = 20) {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    expect(url).toBe(SPEECH_URL);
    const body = JSON.parse(String(init.body)) as Call;
    calls.push(body);
    await new Promise((r) => setTimeout(r, delayMs));
    if (body.input === failInput) return new Response(JSON.stringify({ error: { code: "invalid_request" } }), { status: 400 });
    return new Response(new Uint8Array(4096).fill(0xff), { status: 200, headers: { "content-type": "audio/mpeg" } });
  });
}

beforeEach(() => {
  calls = [];
  failInput = null;
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.DAILY_VOICE_CAP;
  stubSpeech();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  delete process.env.DAILY_VOICE_CAP;
});

async function setup() {
  const t = convexTest(schema, modules);
  await t.action(internal.seed.run, { fast: true });
  const seeded = (await t.query(api.editions.today, {}))!;
  await t.run(async (ctx) => {
    for (const c of seeded.comics) {
      const comic = (await ctx.db.get(c._id))!;
      await ctx.db.patch(c._id, { panels: comic.panels.map((p, i) => ({ ...p, caption: `Caption ${i + 1} of ${c.title}.` })) });
    }
  });
  const today = (await t.query(api.editions.today, {}))!;
  return { t, comics: today.comics };
}

const empty = { panels: [null, null, null, null], realStory: null };

test("ensure makes 5 clips once, even when two callers race", async () => {
  const { t, comics } = await setup();
  const comic = comics[0];
  const [a, b] = await Promise.all([
    t.action(api.voice.ensure, { comicId: comic._id }),
    t.action(api.voice.ensure, { comicId: comic._id }),
  ]);
  expect([a, b].map((r) => (r.ok ? r.status : r.reason)).sort()).toEqual(["busy", "ready"]);
  expect(calls).toHaveLength(5);
  expect(calls.map((c) => c.input).sort()).toEqual([...comic.panels.map((p) => p.caption), comic.realStory].sort());
  for (const c of calls) {
    expect(c.model).toBe(VOICE_MODEL);
    expect(c.response_format).toBe("mp3");
    expect(c.instructions).toMatch(/exactly as written/);
  }

  const urls = await t.query(api.voice.forComic, { comicId: comic._id });
  expect(urls.panels.every((u) => typeof u === "string")).toBe(true);
  expect(typeof urls.realStory).toBe("string");

  expect(await t.action(api.voice.ensure, { comicId: comic._id })).toEqual({ ok: true, status: "ready" });
  expect(calls).toHaveLength(5);
  const runs = await t.run((ctx) => ctx.db.query("runs").filter((q) => q.eq(q.field("kind"), "voice")).collect());
  expect(runs.map((r) => noteClips(r.note))).toEqual([5]);
});

test("delivery follows the section", async () => {
  const { t, comics } = await setup();
  const tech = comics.find((c) => c.section === "tech")!;
  const money = comics.find((c) => c.section === "money")!;
  await t.action(api.voice.ensure, { comicId: tech._id });
  expect(calls.every((c) => /deadpan/.test(c.instructions))).toBe(true);
  calls = [];
  await t.action(api.voice.ensure, { comicId: money._id });
  expect(calls.every((c) => /brisk/.test(c.instructions))).toBe(true);
});

test("a failed clip leaves the others usable and is made on the next call", async () => {
  const { t, comics } = await setup();
  const comic = comics[0];
  failInput = comic.panels[2].caption;
  expect(await t.action(api.voice.ensure, { comicId: comic._id })).toEqual({ ok: true, status: "partial" });
  expect(calls).toHaveLength(5);
  const urls = await t.query(api.voice.forComic, { comicId: comic._id });
  expect(urls.panels[2]).toBeNull();
  expect([urls.panels[0], urls.panels[1], urls.panels[3], urls.realStory].every((u) => typeof u === "string")).toBe(true);

  failInput = null;
  calls = [];
  expect(await t.action(api.voice.ensure, { comicId: comic._id })).toEqual({ ok: true, status: "ready" });
  expect(calls.map((c) => c.input)).toEqual([comic.panels[2].caption]);
  expect((await t.query(api.voice.forComic, { comicId: comic._id })).panels[2]).not.toBeNull();
});

test("retryable failures are retried at most twice", async () => {
  const { t, comics } = await setup();
  let tries = 0;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const input = (JSON.parse(String(init.body)) as Call).input;
    if (input === comics[0].realStory) {
      tries++;
      return new Response("busy", { status: 503 });
    }
    return new Response(new Uint8Array(4096), { status: 200 });
  });
  expect(await t.action(api.voice.ensure, { comicId: comics[0]._id })).toEqual({ ok: true, status: "partial" });
  expect(tries).toBe(3);
  expect((await t.query(api.voice.forComic, { comicId: comics[0]._id })).realStory).toBeNull();
});

test("the daily cap refuses politely and counts only clips that were made", async () => {
  const { t, comics } = await setup();
  process.env.DAILY_VOICE_CAP = "9";
  failInput = comics[0].panels[0].caption;
  expect(await t.action(api.voice.ensure, { comicId: comics[0]._id })).toEqual({ ok: true, status: "partial" });
  calls = [];
  expect(await t.action(api.voice.ensure, { comicId: comics[1]._id })).toEqual({ ok: true, status: "ready" });
  calls = [];
  expect(await t.action(api.voice.ensure, { comicId: comics[2]._id })).toEqual({ ok: false, reason: "voice_cap" });
  expect(calls).toHaveLength(0);
  expect(await t.query(api.voice.forComic, { comicId: comics[2]._id })).toEqual(empty);
});

test("the query returns nulls until clips exist, and for hidden comics", async () => {
  const { t, comics } = await setup();
  const comicId = comics[0]._id as Id<"comics">;
  expect(await t.query(api.voice.forComic, { comicId })).toEqual(empty);
  await t.action(api.voice.ensure, { comicId });
  expect((await t.query(api.voice.forComic, { comicId })).realStory).not.toBeNull();
  await t.run((ctx) => ctx.db.patch(comicId, { hidden: true }));
  expect(await t.query(api.voice.forComic, { comicId })).toEqual(empty);
  expect(await t.action(api.voice.ensure, { comicId })).toEqual({ ok: false, reason: "not_found" });
});

test("without a key nothing is attempted", async () => {
  const { t, comics } = await setup();
  delete process.env.OPENAI_API_KEY;
  expect(await t.action(api.voice.ensure, { comicId: comics[0]._id })).toEqual({ ok: false, reason: "unavailable" });
  expect(calls).toHaveLength(0);
});

test("helpers", () => {
  expect(dailyVoiceCap(undefined)).toBe(400);
  expect(dailyVoiceCap("12")).toBe(12);
  expect(dailyVoiceCap("nope")).toBe(400);
  expect(voiceRetryDelayMs(1)).toBe(1000);
  expect(voiceRetryDelayMs(2)).toBe(3000);
  expect(voiceRetryDelayMs(2, 20_000)).toBe(10_000);
  expect(noteClips('{"clips":4}')).toBe(4);
  expect(noteClips("garbage")).toBe(0);
});
