import { colors } from "../theme";
import { addDays, daysInMonth, isDay, monthStart, weekday } from "./dates";
import { copy } from "./copy";

export const AT_RISK_HOUR = 18;

export type Armed = { day: string; from: number; to: number };

export type StreakData = {
  v: 1;
  days: Record<string, string[]>;
  best: number;
  frozen: string[];
  celebration: { armed: Armed | null; playedDay: string | null };
  endedShownFor: string | null;
};

export function emptyData(): StreakData {
  return { v: 1, days: {}, best: 0, frozen: [], celebration: { armed: null, playedDay: null }, endedShownFor: null };
}

export type Decoded = { data: StreakData; lossy: boolean };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

export function decode(raw: string | null): Decoded {
  if (raw === null) return { data: emptyData(), lossy: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { data: emptyData(), lossy: true };
  }
  if (!isObject(parsed)) return { data: emptyData(), lossy: true };

  const data = emptyData();
  let lossy = false;

  if (parsed.days !== undefined) {
    if (!isObject(parsed.days)) lossy = true;
    else {
      for (const [day, ids] of Object.entries(parsed.days)) {
        if (!isDay(day) || !Array.isArray(ids)) {
          lossy = true;
          continue;
        }
        const clean = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
        if (clean.length !== ids.length) lossy = true;
        if (clean.length > 0) data.days[day] = clean;
      }
    }
  }

  if (parsed.frozen !== undefined) {
    if (!Array.isArray(parsed.frozen)) lossy = true;
    else data.frozen = [...new Set(parsed.frozen.filter(isDay))];
  }

  if (parsed.best !== undefined) {
    const best = count(parsed.best);
    if (best === null) lossy = true;
    else data.best = best;
  }

  if (isObject(parsed.celebration)) {
    const c = parsed.celebration;
    if (isObject(c.armed) && isDay(c.armed.day) && count(c.armed.from) !== null && count(c.armed.to) !== null) {
      data.celebration.armed = { day: c.armed.day, from: count(c.armed.from)!, to: count(c.armed.to)! };
    }
    if (isDay(c.playedDay)) data.celebration.playedDay = c.playedDay;
  }

  if (isDay(parsed.endedShownFor)) data.endedShownFor = parsed.endedShownFor;

  data.best = Math.max(data.best, longestRun(data));
  return { data, lossy };
}

export function encode(data: StreakData): string {
  return JSON.stringify(data);
}

function clearedDays(data: StreakData): Set<string> {
  return new Set(Object.keys(data.days).filter((d) => data.days[d].length > 0));
}

function clamp(day: string, today: string): string {
  return day > today ? today : day;
}

export function isCleared(data: StreakData, day: string, today: string): boolean {
  if (day === today) return Object.keys(data.days).some((d) => d >= today && data.days[d].length > 0);
  return (data.days[day]?.length ?? 0) > 0;
}

export function comboEndingAt(data: StreakData, end: string, today: string): number {
  const cleared = new Set([...clearedDays(data)].map((d) => clamp(d, today)));
  const frozen = new Set(data.frozen);
  let n = 0;
  let cursor = end;
  while (cleared.has(cursor) || frozen.has(cursor)) {
    if (cleared.has(cursor)) n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function longestRun(data: StreakData): number {
  const all = [...new Set([...clearedDays(data), ...data.frozen])].sort();
  const cleared = clearedDays(data);
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of all) {
    if (prev === null || addDays(prev, 1) !== day) run = 0;
    if (cleared.has(day)) run += 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

export type HeatLevel = 0 | 1 | 2 | 3;

export function heatLevel(comics: number): HeatLevel {
  if (comics <= 0) return 0;
  if (comics === 1) return 1;
  if (comics <= 3) return 2;
  return 3;
}

export function heatColor(level: HeatLevel): string {
  return [colors.heat.none, colors.heat.one, colors.heat.few, colors.heat.many][level];
}

export type DayCell = {
  day: string;
  dayOfMonth: number;
  comics: number;
  heat: HeatLevel;
  cleared: boolean;
  frozen: boolean;
  isToday: boolean;
  isFuture: boolean;
};

function cell(data: StreakData, day: string, today: string): DayCell {
  const comics = day === today
    ? Object.keys(data.days).filter((d) => d >= today).reduce((sum, d) => sum + data.days[d].length, 0)
    : day > today
      ? 0
      : (data.days[day]?.length ?? 0);
  return {
    day,
    dayOfMonth: Number(day.slice(8, 10)),
    comics,
    heat: heatLevel(comics),
    cleared: comics > 0,
    frozen: data.frozen.includes(day),
    isToday: day === today,
    isFuture: day > today,
  };
}

export function weekStrip(data: StreakData, today: string): DayCell[] {
  const sunday = addDays(today, -weekday(today));
  return Array.from({ length: 7 }, (_, i) => cell(data, addDays(sunday, i), today));
}

export type MonthGrid = { month: string; leading: number; cells: DayCell[] };

export function monthGrid(data: StreakData, today: string): MonthGrid {
  const first = monthStart(today);
  return {
    month: first,
    leading: weekday(first),
    cells: Array.from({ length: daysInMonth(today) }, (_, i) => cell(data, addDays(first, i), today)),
  };
}

export type Ended = { n: number; best: number; runEnd: string };

export function comboEnded(data: StreakData, today: string): Ended | null {
  const yesterday = addDays(today, -1);
  if (isCleared(data, today, today) || comboEndingAt(data, yesterday, today) > 0) return null;
  const past = [...clearedDays(data)].filter((d) => d < yesterday).sort();
  const runEnd = past[past.length - 1];
  if (!runEnd) return null;
  const n = comboEndingAt(data, runEnd, today);
  return n > 0 ? { n, best: data.best, runEnd } : null;
}

export type Banner = { kind: "atRisk" | "ended"; text: string };

export type ComboState = {
  today: string;
  current: number;
  best: number;
  todayCleared: boolean;
  atRisk: boolean;
  comicsRead: number;
  ended: Ended | null;
  week: DayCell[];
  month: MonthGrid;
};

export function comboState(data: StreakData, today: string, hour: number): ComboState {
  const todayCleared = isCleared(data, today, today);
  const current = comboEndingAt(data, todayCleared ? today : addDays(today, -1), today);
  return {
    today,
    current,
    best: Math.max(data.best, current),
    todayCleared,
    atRisk: !todayCleared && current > 0 && hour >= AT_RISK_HOUR,
    comicsRead: readIds(data).size,
    ended: comboEnded(data, today),
    week: weekStrip(data, today),
    month: monthGrid(data, today),
  };
}

export function readIds(data: StreakData): Set<string> {
  return new Set(Object.values(data.days).flat());
}

export type ReadResult = { data: StreakData; clearedNewDay: boolean };

export function recordRead(data: StreakData, comicId: string, today: string, hour: number): ReadResult {
  if (data.days[today]?.includes(comicId)) return { data, clearedNewDay: false };
  const before = comboState(data, today, hour);
  const next: StreakData = { ...data, days: { ...data.days, [today]: [...(data.days[today] ?? []), comicId] } };
  const after = comboState(next, today, hour);
  next.best = Math.max(next.best, after.current);
  if (before.todayCleared) return { data: next, clearedNewDay: false };
  next.celebration = { ...next.celebration, armed: { day: today, from: before.current, to: after.current } };
  return { data: next, clearedNewDay: true };
}

export function freeze(data: StreakData, day: string): StreakData {
  if (!isDay(day) || data.frozen.includes(day)) return data;
  const next = { ...data, frozen: [...data.frozen, day].sort() };
  next.best = Math.max(next.best, longestRun(next));
  return next;
}

export type Celebration = Armed & { bubble: string };

export function dueCelebration(data: StreakData, today: string): Celebration | null {
  const armed = data.celebration.armed;
  if (!armed || armed.day !== today || data.celebration.playedDay === armed.day) return null;
  return { ...armed, bubble: copy.bubble(armed.to) };
}

export function markPlayed(data: StreakData, day: string): StreakData {
  return { ...data, celebration: { armed: null, playedDay: day } };
}

export function dropStaleArm(data: StreakData, today: string): StreakData {
  const armed = data.celebration.armed;
  if (!armed || armed.day === today) return data;
  return { ...data, celebration: { ...data.celebration, armed: null } };
}

export function banner(state: ComboState, endedVisible: boolean): Banner | null {
  if (state.atRisk) return { kind: "atRisk", text: copy.atRisk(state.current) };
  if (state.ended && endedVisible) return { kind: "ended", text: copy.ended(state.ended.n, state.best) };
  return null;
}
