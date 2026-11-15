import { expect, test } from "vitest";
import { decodeEdition } from "./decode";

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
    ],
  });
  expect(edition!.comics.map((c) => c._id)).toEqual(["e", "a"]);
  expect(edition!.comics[0].panels[1].imageUrl).toBeNull();
});

test("garbage is not an edition", () => {
  expect(decodeEdition(null)).toBeNull();
  expect(decodeEdition({ date: "2026-11-15" })).toBeNull();
});
