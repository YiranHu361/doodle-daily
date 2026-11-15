import { localTime, type Clock } from "./dates";
import {
  banner,
  comboState,
  decode,
  dropStaleArm,
  dueCelebration,
  emptyData,
  encode,
  freeze,
  markPlayed,
  readIds,
  recordRead,
  type Banner,
  type Celebration,
  type ComboState,
  type StreakData,
} from "./model";

export const STORAGE_KEY = "dd.streak.v1";
export const BACKUP_PREFIX = "dd.streak.backup.";
export const CELEBRATION_IDLE_MS = 4000;

export type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type Timers = {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type Snapshot = ComboState & { ready: boolean; banner: Banner | null };

export type StreakStore = ReturnType<typeof createStreakStore>;

export function createStreakStore({ storage, clock, timers }: { storage: Storage; clock: Clock; timers: Timers }) {
  let data: StreakData = emptyData();
  let loaded = false;
  let pending: (() => void)[] = [];
  let ids = new Set<string>();
  let snapshot: Snapshot;
  let showingEndedFor: string | null = null;
  let writes: Promise<void> = Promise.resolve();

  let busy = false;
  let idleTimer: unknown = null;
  let showing: Celebration | null = null;
  const listeners = new Set<() => void>();

  const now = () => localTime(clock.now(), clock.timeZone());

  function compute(): Snapshot {
    const { day, hour } = now();
    const state = comboState(data, day, hour);
    if (state.ended && data.endedShownFor !== state.ended.runEnd && loaded) {
      showingEndedFor = state.ended.runEnd;
      data = { ...data, endedShownFor: state.ended.runEnd };
      persist();
    }
    const endedVisible = state.ended !== null && showingEndedFor === state.ended.runEnd;
    return { ...state, ready: loaded, banner: banner(state, endedVisible) };
  }

  function emit() {
    snapshot = compute();
    listeners.forEach((l) => l());
  }

  function persist() {
    const raw = encode(data);
    writes = writes.then(() => storage.setItem(STORAGE_KEY, raw)).catch(() => undefined);
  }

  function update(next: StreakData) {
    if (next === data) return;
    data = next;
    ids = readIds(data);
    persist();
  }

  function whenLoaded(fn: () => void) {
    if (loaded) fn();
    else pending.push(fn);
  }

  function clearIdle() {
    if (idleTimer !== null) timers.clearTimeout(idleTimer);
    idleTimer = null;
  }

  function startIdle() {
    clearIdle();
    idleTimer = timers.setTimeout(() => {
      idleTimer = null;
      tryPlay();
    }, CELEBRATION_IDLE_MS);
  }

  function tryPlay() {
    if (busy || showing) return;
    const { day } = now();
    update(dropStaleArm(data, day));
    const due = dueCelebration(data, day);
    if (!due) return;
    clearIdle();
    update(markPlayed(data, day));
    showing = due;
    emit();
  }

  snapshot = compute();

  const ready = (async () => {
    let raw: string | null = null;
    try {
      raw = await storage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    const decoded = decode(raw);
    if (decoded.lossy && raw !== null) {
      try {
        await storage.setItem(`${BACKUP_PREFIX}${clock.now()}`, raw);
      } catch {
        // keep going with defaults; the original value stays in place until the next write
      }
    }
    data = decoded.data;
    ids = readIds(data);
    loaded = true;
    const queued = pending;
    pending = [];
    queued.forEach((fn) => fn());
    emit();
  })();

  return {
    ready,
    flushed: () => ready.then(() => writes),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getCelebration: () => showing,
    isRead: (comicId: string) => ids.has(comicId),
    markComicRead(comicId: string) {
      if (!comicId) return;
      whenLoaded(() => {
        const { day, hour } = now();
        const result = recordRead(dropStaleArm(data, day), comicId, day, hour);
        update(result.data);
        if (result.clearedNewDay) {
          showingEndedFor = null;
          startIdle();
        }
        emit();
      });
    },
    applyFreeze(day: string) {
      whenLoaded(() => {
        update(freeze(data, day));
        emit();
      });
    },
    notifyReaderClosed() {
      whenLoaded(tryPlay);
    },
    notifyBusy(isBusy: boolean) {
      if (busy === isBusy) return;
      busy = isBusy;
      if (busy) {
        clearIdle();
        return;
      }
      whenLoaded(() => {
        if (dueCelebration(data, now().day)) startIdle();
      });
    },
    dismissCelebration() {
      if (!showing) return;
      showing = null;
      emit();
    },
    refresh() {
      const next = compute();
      const prev = snapshot;
      if (loaded) update(dropStaleArm(data, next.today));
      if (
        next.today !== prev.today ||
        next.atRisk !== prev.atRisk ||
        next.ready !== prev.ready ||
        next.banner?.text !== prev.banner?.text
      ) {
        snapshot = next;
        listeners.forEach((l) => l());
      }
    },
    async reset() {
      await ready;
      clearIdle();
      showing = null;
      showingEndedFor = null;
      data = emptyData();
      ids = new Set();
      writes = writes.then(() => storage.removeItem(STORAGE_KEY)).catch(() => undefined);
      await writes;
      emit();
    },
  };
}
