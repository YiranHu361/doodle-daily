import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules, seedForTests } from "./test.setup";

const A = "device-aaaaaaaa";
const B = "device-bbbbbbbb";

async function setup() {
  const t = convexTest(schema, modules);
  await seedForTests(t);
  const today = (await t.query(api.editions.today, {}))!;
  return { t, comicId: today.comics[0]._id, other: today.comics[1]._id };
}

test("toggle on, switch, off", async () => {
  const { t, comicId } = await setup();
  expect(await t.query(api.reactions.counts, { comicId, deviceId: A })).toEqual({ lol: 0, wow: 0, yikes: 0, mine: null });
  await t.mutation(api.reactions.toggle, { comicId, deviceId: A, kind: "lol" });
  expect(await t.query(api.reactions.counts, { comicId, deviceId: A })).toEqual({ lol: 1, wow: 0, yikes: 0, mine: "lol" });
  await t.mutation(api.reactions.toggle, { comicId, deviceId: A, kind: "wow" });
  expect(await t.query(api.reactions.counts, { comicId, deviceId: A })).toEqual({ lol: 0, wow: 1, yikes: 0, mine: "wow" });
  await t.mutation(api.reactions.toggle, { comicId, deviceId: A, kind: "wow" });
  expect(await t.query(api.reactions.counts, { comicId, deviceId: A })).toEqual({ lol: 0, wow: 0, yikes: 0, mine: null });
});

test("two devices count separately and see their own choice", async () => {
  const { t, comicId, other } = await setup();
  await t.mutation(api.reactions.toggle, { comicId, deviceId: A, kind: "yikes" });
  await t.mutation(api.reactions.toggle, { comicId, deviceId: B, kind: "yikes" });
  await t.mutation(api.reactions.toggle, { comicId, deviceId: B, kind: "lol" });
  expect(await t.query(api.reactions.counts, { comicId, deviceId: A })).toEqual({ lol: 1, wow: 0, yikes: 1, mine: "yikes" });
  expect(await t.query(api.reactions.counts, { comicId, deviceId: B })).toEqual({ lol: 1, wow: 0, yikes: 1, mine: "lol" });
  expect(await t.query(api.reactions.counts, { comicId: other, deviceId: A })).toEqual({ lol: 0, wow: 0, yikes: 0, mine: null });
  const rows = await t.run((ctx) => ctx.db.query("reactionCounts").collect());
  expect(rows).toHaveLength(1);
});

test("bad args are rejected", async () => {
  const { t, comicId } = await setup();
  await expect(t.mutation(api.reactions.toggle, { comicId, deviceId: A, kind: "meh" } as never)).rejects.toThrow();
  await expect(t.mutation(api.reactions.toggle, { comicId: "nope", deviceId: A, kind: "lol" } as never)).rejects.toThrow();
  await expect(t.mutation(api.reactions.toggle, { comicId, deviceId: "x", kind: "lol" })).rejects.toThrow(/bad_device_id/);
  await expect(t.mutation(api.reactions.toggle, { comicId, kind: "lol" } as never)).rejects.toThrow();
});

test("reacting to a failed comic is refused", async () => {
  const { t, comicId } = await setup();
  await t.run((ctx) => ctx.db.patch(comicId, { status: "failed" }));
  await expect(t.mutation(api.reactions.toggle, { comicId, deviceId: A, kind: "lol" })).rejects.toThrow(/comic_not_found/);
});
