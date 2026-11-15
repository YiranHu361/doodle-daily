export type LaunchFlags = { fixtures: boolean; skipIntro: boolean; reset: boolean; now: number | null };

export const DEFAULT_FLAGS: LaunchFlags = { fixtures: false, skipIntro: false, reset: false, now: null };

const TRUE = ["1", "true", "yes", "on"];

export function flagBool(value: string | undefined | null): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return TRUE.includes(value.toLowerCase());
}

export function parseNow(value: string | undefined | null): number | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function clean(flags: Partial<LaunchFlags>): Partial<LaunchFlags> {
  return Object.fromEntries(Object.entries(flags).filter(([, v]) => v !== undefined)) as Partial<LaunchFlags>;
}

export function flagsFromEnv(env: { fixtures?: string; skipIntro?: string; reset?: string; now?: string }): Partial<LaunchFlags> {
  return clean({ fixtures: flagBool(env.fixtures), skipIntro: flagBool(env.skipIntro), reset: flagBool(env.reset), now: parseNow(env.now) });
}

export function queryParams(url: string): Record<string, string> {
  const query = url.split("#")[0].split("?")[1];
  if (!query) return {};
  const out: Record<string, string> = {};
  for (const pair of query.split("&")) {
    const [k, v = ""] = pair.split("=");
    if (!k) continue;
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " "));
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function flagsFromUrl(url: string): Partial<LaunchFlags> | null {
  const q = queryParams(url);
  const flags = clean({
    fixtures: flagBool(q.fixtures),
    skipIntro: flagBool(q.skipIntro ?? q.skip_intro),
    reset: flagBool(q.reset),
    now: parseNow(q.now),
  });
  return Object.keys(flags).length > 0 ? flags : null;
}
