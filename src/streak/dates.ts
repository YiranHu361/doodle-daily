export type Clock = {
  now(): number;
  timeZone(): string;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  timeZone: () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  },
};

export type LocalTime = { day: string; hour: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function localTime(ms: number, timeZone: string): LocalTime {
  try {
    let f = formatters.get(timeZone);
    if (!f) {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
      });
      formatters.set(timeZone, f);
    }
    const parts: Record<string, string> = {};
    for (const p of f.formatToParts(new Date(ms))) parts[p.type] = p.value;
    const hour = Number(parts.hour) % 24;
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    if (isDay(day) && Number.isFinite(hour)) return { day, hour };
  } catch {
    // fall through to the device's own zone
  }
  const d = new Date(ms);
  return { day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hour: d.getHours() };
}

export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toUtc(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(day: string, n: number): string {
  const date = toUtc(day);
  date.setUTCDate(date.getUTCDate() + n);
  return fromUtc(date);
}

export function weekday(day: string): number {
  return toUtc(day).getUTCDay();
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function daysInMonth(day: string): number {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthName(day: string): string {
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return names[Number(day.slice(5, 7)) - 1];
}
