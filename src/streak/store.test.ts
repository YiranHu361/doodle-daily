import { describe, expect, it } from "vitest";
import { colors } from "../theme";
import { localTime } from "./dates";
import { decode, heatColor, heatLevel } from "./model";
import { BACKUP_PREFIX, CELEBRATION_IDLE_MS, createStreakStore, STORAGE_KEY, type Storage } from "./store";

const LA = "America/Los_Angeles";
const NY = "America/New_York";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const storage: Storage = {
    getItem: async (k) => items.get(k) ?? null,
    setItem: async (k, v) => {
      items.set(k, v);
    },
    removeItem: async (k) => {
      items.delete(k);
    },
  };
  return { storage, items };
}

function fakeTimers() {
  let t = 0;
  let next = 1;
  const queue = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      setTimeout: (fn: () => void, ms: number) => {
        const id = next++;
        queue.set(id, { at: t + ms, fn });
        return id;
      },
      clearTimeout: (h: unknown) => {
        queue.delete(h as number);
      },
    },
    advance(ms: number) {
      t += ms;
      for (const [id, job] of [...queue]) {
        if (job.at <= t) {
          queue.delete(id);
          job.fn();
        }
      }
    },
  };
}

function wall(local: string, timeZone = LA): number {
  const guess = Date.parse(`${local}Z`);
  for (let offset = -14; offset <= 14; offset++) {
    const ms = guess - offset * 3_600_000;
    const lt = localTime(ms, timeZone);
    if (`${lt.day}T${String(lt.hour).padStart(2, "0")}` === local.slice(0, 13)) return ms;
  }
  throw new Error(`no instant for ${local} in ${timeZone}`);
}

async function setup(start: string, opts: { timeZone?: string; stored?: Record<string, string> } = {}) {
  const clock = { ms: wall(start, opts.timeZone), tz: opts.timeZone ?? LA };
  const mem = memoryStorage(opts.stored);
  const t = fakeTimers();
  const store = createStreakStore({
    storage: mem.storage,
    clock: { now: () => clock.ms, timeZone: () => clock.tz },
    timers: t.timers,
  });
  await store.ready;
  const at = (local: string, timeZone = clock.tz) => {
    clock.tz = timeZone;
    clock.ms = wall(local, timeZone);
    store.refresh();
    return store.getSnapshot();
  };
  return { store, mem, t, at, snap: () => store.getSnapshot() };
}

describe("combo rules", () => {
  it("starts at zero", async () => {
    const { snap } = await setup("2026-11-15T09:00:00");
    expect(snap()).toMatchObject({ current: 0, best: 0, todayCleared: false, atRisk: false, comicsRead: 0, ready: true, banner: null });
  });

  it("one comic clears the day", async () => {
    const { store, snap } = await setup("2026-11-15T09:00:00");
    store.markComicRead("a");
    expect(snap()).toMatchObject({ current: 1, best: 1, todayCleared: true, comicsRead: 1 });
    expect(store.isRead("a")).toBe(true);
    expect(store.isRead("b")).toBe(false);
  });

  it("consecutive days grow the combo", async () => {
    const { store, at } = await setup("2026-11-13T09:00:00");
    store.markComicRead("a");
    at("2026-11-14T12:00:00");
    store.markComicRead("b");
    expect(at("2026-11-15T08:00:00")).toMatchObject({ current: 2, todayCleared: false });
    store.markComicRead("c");
    expect(at("2026-11-15T08:30:00")).toMatchObject({ current: 3, best: 3, todayCleared: true, comicsRead: 3 });
  });

  it("today not cleared keeps yesterday's combo, at risk after 6 pm", async () => {
    const { store, at } = await setup("2026-11-14T09:00:00");
    store.markComicRead("a");
    expect(at("2026-11-15T10:00:00")).toMatchObject({ current: 1, todayCleared: false, atRisk: false, banner: null });
    expect(at("2026-11-15T17:59:00")).toMatchObject({ atRisk: false });
    const evening = at("2026-11-15T18:00:00");
    expect(evening).toMatchObject({ current: 1, atRisk: true });
    expect(evening.banner).toEqual({ kind: "atRisk", text: "Your 1-day combo ends at midnight. One comic saves it." });
    store.markComicRead("b");
    expect(at("2026-11-15T18:05:00")).toMatchObject({ current: 2, atRisk: false, banner: null });
  });

  it("a missed day resets to 0, keeps the best, and shows the ended banner once", async () => {
    const { store, at } = await setup("2026-11-10T09:00:00");
    store.markComicRead("a");
    at("2026-11-11T09:00:00");
    store.markComicRead("b");
    const after = at("2026-11-13T09:00:00");
    expect(after).toMatchObject({ current: 0, best: 2, atRisk: false });
    expect(after.ended).toEqual({ n: 2, best: 2, runEnd: "2026-11-11" });
    expect(after.banner).toEqual({ kind: "ended", text: "Combo over at 2. High score 2. New game?" });
    store.markComicRead("c");
    expect(at("2026-11-13T09:05:00")).toMatchObject({ current: 1, best: 2, banner: null, ended: null });
  });

  it("the ended banner is not shown again after a restart", async () => {
    const first = await setup("2026-11-10T09:00:00");
    first.store.markComicRead("a");
    expect(first.at("2026-11-13T09:00:00").banner?.kind).toBe("ended");
    await first.store.flushed();
    const stored = Object.fromEntries(first.mem.items);
    const second = await setup("2026-11-13T10:00:00", { stored });
    expect(second.snap().ended).not.toBeNull();
    expect(second.snap().banner).toBeNull();
  });

  it("re-reading counts once in comics read but still clears a new day", async () => {
    const { store, at, snap } = await setup("2026-11-14T09:00:00");
    store.markComicRead("a");
    store.markComicRead("a");
    expect(snap()).toMatchObject({ current: 1, comicsRead: 1 });
    at("2026-11-15T09:00:00");
    store.markComicRead("a");
    expect(snap()).toMatchObject({ current: 2, todayCleared: true, comicsRead: 1 });
  });

  it("the day turns at local midnight", async () => {
    const { store, at } = await setup("2026-11-14T23:59:00");
    store.markComicRead("a");
    expect(at("2026-11-14T23:59:00")).toMatchObject({ today: "2026-11-14", current: 1, todayCleared: true });
    expect(at("2026-11-15T00:01:00")).toMatchObject({ today: "2026-11-15", current: 1, todayCleared: false, atRisk: false });
    store.markComicRead("b");
    expect(at("2026-11-15T00:02:00")).toMatchObject({ current: 2, todayCleared: true });
  });

  it("uses the time zone at the moment of reading", async () => {
    const { store, at, mem } = await setup("2026-11-14T22:30:00", { timeZone: LA });
    store.markComicRead("a");
    expect(at("2026-11-15T02:00:00", NY)).toMatchObject({ today: "2026-11-15", current: 1, todayCleared: false });
    store.markComicRead("b");
    await store.flushed();
    expect(Object.keys(JSON.parse(mem.items.get(STORAGE_KEY)!).days)).toEqual(["2026-11-14", "2026-11-15"]);
    expect(at("2026-11-14T23:10:00", LA)).toMatchObject({ today: "2026-11-14", todayCleared: true, current: 1 });
  });

  it("a frozen day keeps the combo", async () => {
    const { store, at } = await setup("2026-11-12T09:00:00");
    store.markComicRead("a");
    at("2026-11-13T09:00:00");
    store.markComicRead("b");
    expect(at("2026-11-15T09:00:00")).toMatchObject({ current: 0 });
    store.applyFreeze("2026-11-14");
    const s = at("2026-11-15T19:00:00");
    expect(s).toMatchObject({ current: 2, atRisk: true, ended: null });
    expect(s.month.cells[13]).toMatchObject({ day: "2026-11-14", frozen: true, cleared: false });
    expect(s.week[0]).toMatchObject({ day: "2026-11-15", frozen: false });
    store.markComicRead("c");
    expect(at("2026-11-15T19:05:00")).toMatchObject({ current: 3, best: 3 });
  });
});

describe("week and month", () => {
  it("builds the week from Sunday and the month with leading blanks and heat", async () => {
    const { store, at } = await setup("2026-11-15T09:00:00");
    ["a", "b", "c", "d"].forEach((id) => store.markComicRead(id));
    at("2026-11-16T09:00:00");
    store.markComicRead("e");
    store.markComicRead("f");
    const s = at("2026-11-17T09:00:00");
    expect(s.week.map((c) => c.day)).toEqual([
      "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21",
    ]);
    expect(s.week.map((c) => c.heat)).toEqual([3, 2, 0, 0, 0, 0, 0]);
    expect(s.week[2]).toMatchObject({ isToday: true, cleared: false });
    expect(s.week[3]).toMatchObject({ isFuture: true });
    expect(s.month.month).toBe("2026-11-01");
    expect(s.month.leading).toBe(0);
    expect(s.month.cells).toHaveLength(30);
    expect(s.month.cells[14]).toMatchObject({ dayOfMonth: 15, comics: 4, heat: 3, cleared: true });
  });

  it("maps heat levels to the design colours", () => {
    expect([0, 1, 2, 3, 4, 9].map(heatLevel)).toEqual([0, 1, 2, 2, 3, 3]);
    expect([0, 1, 2, 3].map((l) => heatColor(l as 0 | 1 | 2 | 3))).toEqual([colors.heat.none, "#C4AF47", "#E6D141", "#FFE83D"]);
    expect(colors.heat.none).toBe("#261E63");
  });
});

describe("celebration", () => {
  it("plays once, 4 idle seconds after the first comic of the day", async () => {
    const { store, t } = await setup("2026-11-15T09:00:00");
    store.markComicRead("a");
    t.advance(CELEBRATION_IDLE_MS - 1);
    expect(store.getCelebration()).toBeNull();
    t.advance(1);
    expect(store.getCelebration()).toEqual({
      day: "2026-11-15", from: 0, to: 1, bubble: "That's day one. Come back tomorrow and it becomes a combo.",
    });
    store.dismissCelebration();
    store.markComicRead("b");
    store.notifyReaderClosed();
    t.advance(CELEBRATION_IDLE_MS);
    expect(store.getCelebration()).toBeNull();
  });

  it("plays at once when the Reader closes, and counts up from yesterday", async () => {
    const { store, at } = await setup("2026-11-14T09:00:00");
    store.markComicRead("a");
    store.notifyReaderClosed();
    store.dismissCelebration();
    at("2026-11-15T09:00:00");
    store.markComicRead("b");
    store.notifyReaderClosed();
    expect(store.getCelebration()).toMatchObject({ from: 1, to: 2, bubble: "2 days. The crayons are warm." });
  });

  it("waits while the browser or share sheet is open", async () => {
    const { store, t } = await setup("2026-11-15T09:00:00");
    store.markComicRead("a");
    t.advance(2000);
    store.notifyBusy(true);
    t.advance(10_000);
    store.notifyReaderClosed();
    expect(store.getCelebration()).toBeNull();
    store.notifyBusy(false);
    t.advance(CELEBRATION_IDLE_MS - 1);
    expect(store.getCelebration()).toBeNull();
    t.advance(1);
    expect(store.getCelebration()).not.toBeNull();
  });

  it("is safe when the Reader never calls the notify hooks", async () => {
    const { store, t } = await setup("2026-11-15T09:00:00");
    store.markComicRead("a");
    t.advance(CELEBRATION_IDLE_MS);
    expect(store.getCelebration()?.to).toBe(1);
  });

  it("armed at 23:59 does not play at 00:02, and the new day earns its own", async () => {
    const { store, t, at } = await setup("2026-11-14T23:59:00");
    store.markComicRead("a");
    store.notifyBusy(true);
    at("2026-11-15T00:02:00");
    store.notifyBusy(false);
    t.advance(CELEBRATION_IDLE_MS);
    store.notifyReaderClosed();
    expect(store.getCelebration()).toBeNull();
    store.markComicRead("b");
    t.advance(CELEBRATION_IDLE_MS);
    expect(store.getCelebration()).toMatchObject({ day: "2026-11-15", from: 1, to: 2 });
  });

  it("does not replay after a restart", async () => {
    const first = await setup("2026-11-15T09:00:00");
    first.store.markComicRead("a");
    first.store.notifyReaderClosed();
    expect(first.store.getCelebration()).not.toBeNull();
    await first.store.flushed();
    const second = await setup("2026-11-15T09:10:00", { stored: Object.fromEntries(first.mem.items) });
    second.store.notifyReaderClosed();
    expect(second.store.getCelebration()).toBeNull();
  });
});

describe("stored data", () => {
  it("decodes older data with missing fields", async () => {
    const stored = { [STORAGE_KEY]: JSON.stringify({ days: { "2026-11-13": ["a"], "2026-11-14": ["b", "a"] } }) };
    const { snap, store, mem } = await setup("2026-11-15T09:00:00", { stored });
    expect(snap()).toMatchObject({ current: 2, best: 2, comicsRead: 2, todayCleared: false });
    expect(store.isRead("b")).toBe(true);
    expect([...mem.items.keys()].some((k) => k.startsWith(BACKUP_PREFIX))).toBe(false);
  });

  it("ignores unknown fields", () => {
    const { data, lossy } = decode(JSON.stringify({ v: 1, days: {}, best: 4, future: { x: 1 } }));
    expect(lossy).toBe(false);
    expect(data.best).toBe(4);
  });

  it("backs up garbage instead of overwriting it", async () => {
    const stored = { [STORAGE_KEY]: "{not json" };
    const { store, mem, snap } = await setup("2026-11-15T09:00:00", { stored });
    expect(snap()).toMatchObject({ current: 0, ready: true });
    const backups = [...mem.items.entries()].filter(([k]) => k.startsWith(BACKUP_PREFIX));
    expect(backups).toHaveLength(1);
    expect(backups[0][1]).toBe("{not json");
    store.markComicRead("a");
    await store.flushed();
    expect(JSON.parse(mem.items.get(STORAGE_KEY)!).days["2026-11-15"]).toEqual(["a"]);
    expect(backups[0][1]).toBe("{not json");
  });

  it("backs up data with broken fields and keeps the readable parts", async () => {
    const raw = JSON.stringify({ days: { "2026-11-14": ["a"], "not-a-day": ["b"] }, best: "lots" });
    const { mem, snap } = await setup("2026-11-15T09:00:00", { stored: { [STORAGE_KEY]: raw } });
    expect(snap()).toMatchObject({ current: 1, best: 1, comicsRead: 1 });
    expect([...mem.items.values()]).toContain(raw);
  });

  it("queues reads made before storage has loaded", async () => {
    const mem = memoryStorage();
    const store = createStreakStore({
      storage: mem.storage,
      clock: { now: () => wall("2026-11-15T09:00:00"), timeZone: () => LA },
      timers: fakeTimers().timers,
    });
    store.markComicRead("a");
    await store.ready;
    expect(store.getSnapshot()).toMatchObject({ current: 1, ready: true });
  });

  it("reset clears the combo", async () => {
    const { store, mem, snap } = await setup("2026-11-15T09:00:00");
    store.markComicRead("a");
    await store.reset();
    expect(snap()).toMatchObject({ current: 0, comicsRead: 0 });
    expect(mem.items.has(STORAGE_KEY)).toBe(false);
  });
});
