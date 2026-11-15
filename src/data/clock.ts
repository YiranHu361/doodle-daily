let fixedNow: number | null = null;
let fixedSetAt = 0;

export function setFixedNow(ms: number | null): void {
  fixedNow = ms;
  fixedSetAt = Date.now();
}

export function now(): number {
  return fixedNow === null ? Date.now() : fixedNow + (Date.now() - fixedSetAt);
}

const PACIFIC = "America/Los_Angeles";

export function pacificDate(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days, 12));
  return t.toISOString().slice(0, 10);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatIssueDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  return `${weekday}, ${MONTHS[m - 1]} ${d}`;
}
