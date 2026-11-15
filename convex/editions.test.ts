import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { addDays, pacificDate } from "./lib/dates";
import { mockScript } from "./providers/mockScript";
import { TODAY_STORIES } from "./seedData";

async function seeded(opts: { leaveOneDrawing?: boolean } = {}) {
  const t = convexTest(schema, modules);
  await t.action(internal.seed.run, { fast: true, ...opts });
  return t;
}

async function setStatus(t: ReturnType<typeof convexTest>, id: Id<"comics">, patch: { status?: "failed"; hidden?: boolean }) {
  await t.run(async (ctx) => ctx.db.patch(id, patch));
}

describe("editions:today", () => {
  test("returns today's seeded issue with 6 comics of 4 panels each, ordered", async () => {
    const t = await seeded();
    const today = await t.query(api.editions.today, {});
    expect(today).not.toBeNull();
    expect(today!.date).toBe(pacificDate(Date.now()));
    expect(today!.status).toBe("published");
    expect(today!.comics).toHaveLength(6);
    expect(today!.comics[0].title).toBe(mockScript(TODAY_STORIES[0]).title);
    const orders = today!.comics.map((c) => c.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (const comic of today!.comics) {
      expect(comic.panels).toHaveLength(4);
      expect(comic.status).toBe("ready");
      for (const panel of comic.panels) expect(panel.imageUrl).toEqual(expect.any(String));
    }
    expect(new Set(today!.comics.map((c) => c.section))).toEqual(new Set(["tech", "money", "culture", "memes"]));
  });

  test("hidden and failed comics never appear", async () => {
    const t = await seeded();
    const before = (await t.query(api.editions.today, {}))!;
    await setStatus(t, before.comics[1]._id, { status: "failed" });
    await setStatus(t, before.comics[2]._id, { hidden: true });
    const after = (await t.query(api.editions.today, {}))!;
    const ids = after.comics.map((c) => c._id);
    expect(ids).toHaveLength(4);
    expect(ids).not.toContain(before.comics[1]._id);
    expect(ids).not.toContain(before.comics[2]._id);
    const byDate = (await t.query(api.editions.byDate, { date: before.date }))!;
    expect(byDate.comics.map((c) => c._id)).toEqual(ids);
    const list = await t.query(api.editions.list, {});
    expect(list[0].comicCount).toBe(4);
  });

  test("falls back to the previous issue when today has nothing visible", async () => {
    const t = await seeded();
    const today = (await t.query(api.editions.today, {}))!;
    for (const c of today.comics) await setStatus(t, c._id, { status: "failed" });
    const fallback = await t.query(api.editions.today, {});
    expect(fallback!.date).toBe(addDays(today.date, -1));
    expect(fallback!.number).toBe(today.number - 1);
  });

  test("returns null with no issues", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.editions.today, {})).toBeNull();
    expect(await t.query(api.editions.list, {})).toEqual([]);
  });

  test("a comic left mid-draw is visible with missing pictures and keeps the issue building", async () => {
    const t = await seeded({ leaveOneDrawing: true });
    const today = (await t.query(api.editions.today, {}))!;
    expect(today.status).toBe("building");
    const last = today.comics[today.comics.length - 1];
    expect(last.status).toBe("drawing");
    expect(last.panels.map((p) => p.imageUrl === null)).toEqual([false, false, true, true]);
  });

  test("seeding twice keeps one issue per date", async () => {
    const t = await seeded();
    await t.action(internal.seed.run, { fast: true });
    const list = await t.query(api.editions.list, {});
    expect(list.map((e) => e.number)).toEqual([2, 1]);
  });
});

describe("editions:byDate and editions:list", () => {
  test("byDate returns the issue for a date and null otherwise", async () => {
    const t = await seeded();
    const yesterday = addDays(pacificDate(Date.now()), -1);
    const issue = await t.query(api.editions.byDate, { date: yesterday });
    expect(issue!.date).toBe(yesterday);
    expect(issue!.comics).toHaveLength(6);
    expect(await t.query(api.editions.byDate, { date: "1999-01-01" })).toBeNull();
  });

  test("list is newest first with counts and covers", async () => {
    const t = await seeded();
    const list = await t.query(api.editions.list, {});
    expect(list).toHaveLength(2);
    expect(list[0].date > list[1].date).toBe(true);
    for (const e of list) {
      expect(e.comicCount).toBe(6);
      expect(e.coverUrl).toEqual(expect.any(String));
    }
  });

  test("byDate rejects bad args", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.editions.byDate, { date: 5 } as never)).rejects.toThrow();
  });
});
