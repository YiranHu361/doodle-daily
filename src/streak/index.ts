import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { resetDeviceId } from "../data/deviceId";
import { resetIntro } from "../intro/state";
import { systemClock } from "./dates";
import type { Banner, Celebration, DayCell, Ended, MonthGrid } from "./model";
import { createStreakStore } from "./store";

export type { Banner, Celebration, DayCell, Ended, MonthGrid };

export type Combo = {
  current: number;
  best: number;
  todayCleared: boolean;
  atRisk: boolean;
  comicsRead: number;
  ready: boolean;
  today: string;
  week: DayCell[];
  month: MonthGrid;
  ended: Ended | null;
  banner: Banner | null;
};

const REFRESH_MS = 30_000;

export const streakStore = createStreakStore({
  storage: AsyncStorage,
  clock: systemClock,
  timers: { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
});

let watchers = 0;
let stopWatching: (() => void) | null = null;

function watch() {
  watchers += 1;
  if (watchers === 1) {
    const interval = setInterval(() => streakStore.refresh(), REFRESH_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") streakStore.refresh();
    });
    stopWatching = () => {
      clearInterval(interval);
      sub.remove();
    };
  }
  return () => {
    watchers -= 1;
    if (watchers === 0) {
      stopWatching?.();
      stopWatching = null;
    }
  };
}

export function useCombo(): Combo {
  useEffect(watch, []);
  return useSyncExternalStore(streakStore.subscribe, streakStore.getSnapshot);
}

export function useCelebration(): Celebration | null {
  useEffect(watch, []);
  return useSyncExternalStore(streakStore.subscribe, streakStore.getCelebration);
}

export function markComicRead(comicId: string): void {
  streakStore.markComicRead(comicId);
}

export function isRead(comicId: string): boolean {
  return streakStore.isRead(comicId);
}

export function notifyReaderClosed(): void {
  streakStore.notifyReaderClosed();
}

export function notifyBusy(isBusy: boolean): void {
  streakStore.notifyBusy(isBusy);
}

export function applyFreeze(day: string): void {
  streakStore.applyFreeze(day);
}

export async function resetLocalState(): Promise<void> {
  await Promise.all([streakStore.reset(), resetIntro(), resetDeviceId()]);
}
