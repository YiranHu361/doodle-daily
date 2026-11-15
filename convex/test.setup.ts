/// <reference types="vite/client" />
import type { TestConvex } from "convex-test";
import { internal } from "./_generated/api";
import type schema from "./schema";

export const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./test.setup.ts"]);

export const TEST_SOURCE_URL = "https://www.reuters.com/lifestyle/doodle-daily-test-fixture";

export async function seedForTests(t: TestConvex<typeof schema>, opts: { replace?: boolean; leaveOneDrawing?: boolean; fast?: boolean } = {}) {
  process.env.ALLOW_SEED = "1";
  try {
    await t.action(internal.seed.run, { fast: true, ...opts });
  } finally {
    delete process.env.ALLOW_SEED;
  }
  await t.run(async (ctx) => {
    for (const comic of await ctx.db.query("comics").collect()) {
      if (comic.sourceUrl.startsWith("https://example.com/")) await ctx.db.patch(comic._id, { sourceUrl: TEST_SOURCE_URL, sourceName: "Reuters" });
    }
  });
}
