export const COLD_START_LIMIT_MS = 12_000;

export type ScreenState<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T; offline: boolean; fromCache: boolean }
  | { kind: "empty"; offline: boolean }
  | { kind: "error" };

export function resolveScreen<T>(input: {
  live: T | null | undefined;
  cached: T | null;
  everConnected: boolean;
  connected: boolean;
  sinceLaunchMs: number;
  coldStartLimitMs?: number;
}): ScreenState<T> {
  const { live, cached, everConnected, connected, sinceLaunchMs } = input;
  const limit = input.coldStartLimitMs ?? COLD_START_LIMIT_MS;
  const offline = everConnected ? !connected : sinceLaunchMs >= limit;
  if (live === null) return { kind: "empty", offline: everConnected && !connected };
  if (live !== undefined) return { kind: "ready", data: live, offline: everConnected && !connected, fromCache: false };
  if (cached) return { kind: "ready", data: cached, offline, fromCache: true };
  return offline ? { kind: "error" } : { kind: "loading" };
}
