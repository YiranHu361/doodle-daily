import { useSyncExternalStore } from "react";

export type Combo = {
  current: number;
  best: number;
  todayCleared: boolean;
  atRisk: boolean;
  comicsRead: number;
};

const read = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: Combo = { current: 0, best: 0, todayCleared: false, atRisk: false, comicsRead: 0 };

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCombo(): Combo {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function markComicRead(comicId: string): void {
  if (read.has(comicId)) return;
  read.add(comicId);
  snapshot = { current: 1, best: Math.max(1, snapshot.best), todayCleared: true, atRisk: false, comicsRead: read.size };
  listeners.forEach((l) => l());
}

export function isRead(comicId: string): boolean {
  return read.has(comicId);
}
