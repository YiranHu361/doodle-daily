import type { Comic, Section } from "./types";

export type Chip = "all" | Section;
export const CHIPS: readonly Chip[] = ["all", "tech", "money", "culture", "memes"];

export function filterComics(comics: readonly Comic[], chip: Chip): Comic[] {
  return chip === "all" ? [...comics] : comics.filter((c) => c.section === chip);
}

export function orderForToday(comics: readonly Comic[], pinnedId: string | null): Comic[] {
  const pinned = (c: Comic) => c._id === pinnedId || c.isNew;
  const top = comics.filter(pinned).sort((a, b) => b.createdAt - a.createdAt);
  return [...top, ...comics.filter((c) => !pinned(c))];
}

export function stillDrawing(comics: readonly Comic[]): number {
  return comics.filter((c) => c.status !== "ready").length;
}

export function panelsDrawn(comic: Comic): number {
  return comic.panels.filter((p) => p.imageUrl !== null).length;
}
