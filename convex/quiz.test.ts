import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { pacificDate } from "./lib/dates";
import { cleanName, generatedName, QUIZ_MODEL, speedBonus } from "./quiz";
import schema from "./schema";
import { modules, seedForTests } from "./test.setup";

const ME = "device-me-0001";
const FRIEND = "device-friend-01";
let calls: { model: string; prompt: string }[] = [];

beforeEach(() => {
  calls = [];
  process.env.ANTHROPIC_API_KEY = "test-key";
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { model: string; messages: { content: string }[] };
    calls.push({ model: body.model, prompt: body.messages[0].content });
    await new Promise((r) => setTimeout(r, 20));
    const quiz = { question: "What did Robo buy?", options: ["A kite", "A boat", "A hat"], answer: 1 };
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(quiz) }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.ANTHROPIC_API_KEY;
});

async function setup() {
  const t = convexTest(schema, modules);
  await seedForTests(t);
  const today = (await t.query(api.editions.today, {}))!;
  return { t, comics: today.comics.map((c) => c._id as Id<"comics">) };
}

async function addQuiz(t: Awaited<ReturnType<typeof setup>>["t"], comicId: Id<"comics">, answer = 0) {
  await t.run((ctx) => ctx.db.insert("quizzes", { comicId, question: "Which one?", options: ["Red", "Green", "Blue"], answer, createdAt: Date.now() }));
}

test("ensure asks the model once, even when two callers race", async () => {
  const { t, comics } = await setup();
  const [a, b] = await Promise.all([t.action(api.quiz.ensure, { comicId: comics[0] }), t.action(api.quiz.ensure, { comicId: comics[0] })]);
  expect([a, b].map((r) => (r.ok ? r.status : r.reason)).sort()).toEqual(["busy", "ready"]);
  expect(calls).toHaveLength(1);
  expect(calls[0].model).toBe(QUIZ_MODEL);
  expect(calls[0].prompt).toMatch(/never in outside knowledge/);
  expect(await t.action(api.quiz.ensure, { comicId: comics[0] })).toEqual({ ok: true, status: "ready" });
  expect(calls).toHaveLength(1);
  const rows = await t.run((ctx) => ctx.db.query("quizzes").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].options[rows[0].answer]).toBe("A boat");
});

test("ensure without a key or for private or hidden comics makes nothing", async () => {
  const { t, comics } = await setup();
  await t.run(async (ctx) => {
    await ctx.db.patch(comics[0], { owner: ME });
    await ctx.db.patch(comics[1], { hidden: true });
  });
  expect(await t.action(api.quiz.ensure, { comicId: comics[0] })).toEqual({ ok: false, reason: "not_found" });
  expect(await t.action(api.quiz.ensure, { comicId: comics[1] })).toEqual({ ok: false, reason: "not_found" });
  delete process.env.ANTHROPIC_API_KEY;
  expect(await t.action(api.quiz.ensure, { comicId: comics[2] })).toEqual({ ok: false, reason: "unavailable" });
  expect(calls).toHaveLength(0);

  await addQuiz(t, comics[1]);
  expect(await t.query(api.quiz.forComic, { comicId: comics[1], deviceId: ME })).toBeNull();
  await expect(t.mutation(api.quiz.answer, { comicId: comics[1], deviceId: ME, choice: 0, elapsedMs: 1000 })).resolves.toEqual({ ok: false, reason: "not_found" });
});

test("forComic never leaks the answer before this device answers", async () => {
  const { t, comics } = await setup();
  await addQuiz(t, comics[0], 2);
  const before = await t.query(api.quiz.forComic, { comicId: comics[0], deviceId: ME });
  expect(before).toEqual({ question: "Which one?", options: ["Red", "Green", "Blue"], result: null });
  expect(JSON.stringify(before)).not.toMatch(/answer/);

  await t.mutation(api.quiz.answer, { comicId: comics[0], deviceId: ME, choice: 0, elapsedMs: 5000 });
  expect((await t.query(api.quiz.forComic, { comicId: comics[0], deviceId: ME }))!.result).toEqual({ choice: 0, right: false, answer: 2, points: 0 });
  expect((await t.query(api.quiz.forComic, { comicId: comics[0], deviceId: FRIEND }))!.result).toBeNull();
});

test("one answer per device per comic, and 60 a day", async () => {
  const { t, comics } = await setup();
  await addQuiz(t, comics[0]);
  await addQuiz(t, comics[1]);
  expect(await t.mutation(api.quiz.answer, { comicId: comics[0], deviceId: ME, choice: 0, elapsedMs: 1000 })).toEqual({ ok: true, right: true, answer: 0, points: 15 });
  expect(await t.mutation(api.quiz.answer, { comicId: comics[0], deviceId: ME, choice: 1, elapsedMs: 1000 })).toEqual({ ok: false, reason: "already_answered" });
  await expect(t.mutation(api.quiz.answer, { comicId: comics[1], deviceId: ME, choice: 3, elapsedMs: 1000 })).rejects.toThrow(/bad_choice/);
  await expect(t.mutation(api.quiz.answer, { comicId: comics[1], deviceId: "bad", choice: 0, elapsedMs: 1000 })).rejects.toThrow(/bad_device_id/);

  const date = pacificDate(Date.now());
  await t.run(async (ctx) => {
    for (let i = 0; i < 59; i++) await ctx.db.insert("quizAnswers", { comicId: comics[2], deviceId: ME, date, choice: 0, right: false, points: 0, createdAt: Date.now() });
  });
  expect(await t.mutation(api.quiz.answer, { comicId: comics[1], deviceId: ME, choice: 0, elapsedMs: 1000 })).toEqual({ ok: false, reason: "limit" });
});

test("points, a clamped speed bonus, and the streak across two Pacific days", async () => {
  expect([-5000, 0, 3000, 9000, 15_000, 1e12, NaN].map(speedBonus)).toEqual([5, 5, 5, 3, 0, 0, 0]);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T20:00:00Z"));
  const { t, comics } = await setup();
  for (const c of comics.slice(0, 4)) await addQuiz(t, c);

  expect(await t.mutation(api.quiz.answer, { comicId: comics[0], deviceId: ME, choice: 0, elapsedMs: -99_999 })).toMatchObject({ points: 15 });
  expect(await t.mutation(api.quiz.answer, { comicId: comics[1], deviceId: ME, choice: 0, elapsedMs: 9000 })).toMatchObject({ points: 13 });
  vi.setSystemTime(new Date("2026-11-16T07:30:00Z"));
  expect(await t.mutation(api.quiz.answer, { comicId: comics[2], deviceId: ME, choice: 1, elapsedMs: 1000 })).toMatchObject({ right: false, points: 0 });
  let board = await t.query(api.quiz.board, { deviceId: ME });
  expect(board.date).toBe("2026-11-15");
  expect(board.me).toEqual({ rank: 1, name: generatedName(ME), points: 28, streak: 1 });

  vi.setSystemTime(new Date("2026-11-16T09:00:00Z"));
  board = await t.query(api.quiz.board, { deviceId: ME });
  expect(board.date).toBe("2026-11-16");
  expect(board.rows).toEqual([]);
  expect(board.me).toEqual({ rank: null, name: generatedName(ME), points: 0, streak: 1 });
  expect(await t.mutation(api.quiz.answer, { comicId: comics[3], deviceId: ME, choice: 0, elapsedMs: 20_000 })).toMatchObject({ points: 10 });
  board = await t.query(api.quiz.board, { deviceId: ME });
  expect(board.me).toEqual({ rank: 1, name: generatedName(ME), points: 10, streak: 2 });
});

test("the board orders by points then time, updates after an answer and ranks a caller outside the top 20", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T20:00:00Z"));
  const { t, comics } = await setup();
  await addQuiz(t, comics[0]);
  const date = pacificDate(Date.now());
  await t.run(async (ctx) => {
    for (let i = 0; i < 22; i++) {
      const points = 100 - Math.floor(i / 2) * 5;
      await ctx.db.insert("playerDays", { deviceId: `device-other-${i}`, date, points, negPoints: -points, rightAnswers: 1, streak: 1, reachedAt: Date.now() - i });
    }
  });
  let board = await t.query(api.quiz.board, { deviceId: ME });
  expect(board.rows).toHaveLength(20);
  expect(board.rows.map((r) => r.points).slice(0, 4)).toEqual([100, 100, 95, 95]);
  expect(board.rows[0].name).toBe(generatedName("device-other-1"));
  expect(board.rows.every((r) => !r.me)).toBe(true);
  expect(board.me.rank).toBeNull();

  await t.mutation(api.quiz.answer, { comicId: comics[0], deviceId: ME, choice: 0, elapsedMs: 1000 });
  board = await t.query(api.quiz.board, { deviceId: ME });
  expect(board.me).toMatchObject({ rank: 23, points: 15 });
  expect(board.rows.some((r) => r.me)).toBe(false);

  await t.run(async (ctx) => {
    const row = (await ctx.db.query("playerDays").withIndex("by_device_date", (q) => q.eq("deviceId", ME).eq("date", date)).unique())!;
    await ctx.db.patch(row._id, { points: 97, negPoints: -97 });
  });
  board = await t.query(api.quiz.board, { deviceId: ME });
  expect(board.rows[2]).toMatchObject({ rank: 3, points: 97, me: true });
  expect(board.me.rank).toBe(3);
});

test("rename rules", async () => {
  const { t } = await setup();
  expect(cleanName("  Neon   Otter ")).toEqual({ ok: true, name: "Neon Otter" });
  expect(cleanName("A")).toEqual({ ok: false, reason: "bad_name" });
  expect(cleanName("Seventeen chars!!")).toEqual({ ok: false, reason: "bad_name" });
  expect(cleanName("www.spam")).toEqual({ ok: false, reason: "not_allowed" });
  expect(cleanName("buy cheap.com")).toEqual({ ok: false, reason: "not_allowed" });
  expect(cleanName("http://x")).toEqual({ ok: false, reason: "not_allowed" });
  expect(cleanName("murder")).toEqual({ ok: false, reason: "not_allowed" });
  expect(generatedName(ME)).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);

  expect(await t.mutation(api.quiz.rename, { deviceId: ME, name: "x" })).toEqual({ ok: false, reason: "bad_name" });
  expect(await t.mutation(api.quiz.rename, { deviceId: ME, name: "Turbo Pigeon" })).toEqual({ ok: true, name: "Turbo Pigeon" });
  expect(await t.mutation(api.quiz.rename, { deviceId: ME, name: "Zippy Yak" })).toEqual({ ok: true, name: "Zippy Yak" });
  expect((await t.query(api.quiz.board, { deviceId: ME })).me.name).toBe("Zippy Yak");
  await expect(t.mutation(api.quiz.rename, { deviceId: "no", name: "Zippy Yak" })).rejects.toThrow(/bad_device_id/);
});
