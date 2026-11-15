import { useConvexConnectionState } from "convex/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { COLD_START_LIMIT_MS } from "./connection";
import { useFlags } from "./flags";

let startedAt = Date.now();
let epoch = 0;
const listeners = new Set<() => void>();

export function restartColdStartWindow(): void {
  startedAt = Date.now();
  epoch += 1;
  listeners.forEach((l) => l());
}

function useEpoch(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => epoch,
  );
}

export function useConnection(): { everConnected: boolean; connected: boolean; sinceLaunchMs: number } {
  const state = useConvexConnectionState();
  const { fixtures } = useFlags();
  const current = useEpoch();
  const [expired, setExpired] = useState(-1);
  useEffect(() => {
    const remaining = Math.max(0, COLD_START_LIMIT_MS - (Date.now() - startedAt));
    const t = setTimeout(() => setExpired(current), remaining);
    return () => clearTimeout(t);
  }, [current]);
  const sinceLaunchMs = expired === current ? COLD_START_LIMIT_MS : 0;
  if (fixtures) return { everConnected: true, connected: true, sinceLaunchMs };
  return { everConnected: state.hasEverConnected, connected: state.isWebSocketConnected, sinceLaunchMs };
}
