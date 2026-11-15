import type { ComicStatus } from "./types";

export const REAL_STORY_PAGE = 4;

export function shouldMarkRead(seenPages: ReadonlySet<number>, page: number, status: ComicStatus): boolean {
  if (page !== REAL_STORY_PAGE || status !== "ready") return false;
  return [0, 1, 2, 3].every((p) => seenPages.has(p));
}
