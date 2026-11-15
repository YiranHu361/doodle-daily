import { expect, test } from "vitest";
import { decodeCounts, decodeDrawResult, decodeEdition, decodeSummaries } from "./decode";

const panel = (i: number, imageUrl: string | null = `https://x/${i}.png`) => ({ scene: "s", caption: `c${i}`, cast: ["Robo"], imageUrl });
const comic = (id: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  section: "tech",
  kind: "news",
  title: `Title ${id}`,
  realStory: "A. B.",
  sourceName: "src",
  sourceUrl: "https://example.com",
  status: "ready",
  order: 0,
  createdAt: 1,
  isNew: false,
  panels: [panel(1), panel(2), panel(3), panel(4)],
  ...extra,
});

test("one bad comic is dropped, not the whole issue", () => {
  const edition = decodeEdition({
    _id: "e1",
    date: "2026-11-15",
    number: 2,
    status: "published",
    comics: [
      comic("a", { order: 2 }),
      comic("b", { section: "sports" }),
      comic("c", { status: "failed" }),
      comic("d", { panels: [panel(1)] }),
      null,
      comic("e", { order: 1, panels: [panel(1), panel(2, null), panel(3), panel(4)] }),
      comic("f", { panels: [panel(1), { scene: "no caption" }, panel(3), panel(4)] }),
    ],
  });
  expect(edition!.comics.map((c) => c._id)).toEqual(["e", "a"]);
  expect(edition!.comics[0].panels[1].imageUrl).toBeNull();
});

test("garbage is not an edition", () => {
  expect(decodeEdition(null)).toBeNull();
  expect(decodeEdition({ date: "2026-11-15" })).toBeNull();
});

test("summaries keep good rows, read the locked flag and sort newest first", () => {
  const list = decodeSummaries([
    { _id: "a", date: "2026-11-13", number: 1, status: "published", comicCount: 6, coverUrl: null },
    { _id: "bad" },
    { _id: "b", date: "2026-11-14", number: 2, status: "published", comicCount: 5, coverUrl: "https://x", locked: true },
  ]);
  expect(list.map((s) => s._id)).toEqual(["b", "a"]);
  expect(list[0].locked).toBe(true);
  expect(list[1].locked).toBe(false);
  expect(decodeSummaries("nope")).toEqual([]);
});

test("counts default missing fields and reject an unknown mine", () => {
  expect(decodeCounts({ lol: 2, mine: "meh" })).toEqual({ lol: 2, wow: 0, yikes: 0, mine: null });
  expect(decodeCounts(null)).toBeNull();
});

test("draw results decode every reason and reject unknown ones", () => {
  expect(decodeDrawResult({ ok: true, comicId: "c1" })).toEqual({ ok: true, comicId: "c1" });
  for (const reason of ["bad_secret", "no_story", "spend_cap", "busy", "needs_plus"]) {
    expect(decodeDrawResult({ ok: false, reason })).toEqual({ ok: false, reason });
  }
  expect(decodeDrawResult({ ok: false, reason: "weird" })).toBeNull();
  expect(decodeDrawResult({ ok: true })).toBeNull();
});
