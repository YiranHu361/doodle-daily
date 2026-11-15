import { useQuery } from "convex/react";
import * as WebBrowser from "expo-web-browser";
import { api } from "../../convex/_generated/api";
import { useDeviceId } from "../data/deviceId";
import { useFlags } from "../data/flags";

export type PlusState = {
  ready: boolean;
  plus: boolean;
  plusUntil: number | null;
  freeDrawsLeftToday: number;
  freezesLeftThisWeek: number;
  freeDaysEarned: number;
};

export function useBillingDevice(): string | null {
  const { fixtures } = useFlags();
  const deviceId = useDeviceId();
  return fixtures ? null : deviceId;
}

export function usePlus(): PlusState {
  const deviceId = useBillingDevice();
  const raw = useQuery(api.billing.status, deviceId ? { deviceId } : "skip");
  return {
    ready: raw !== undefined,
    plus: raw?.plus ?? false,
    plusUntil: raw?.plusUntil ?? null,
    freeDrawsLeftToday: raw ? (raw.freeDrawsLeftToday ?? Infinity) : 1,
    freezesLeftThisWeek: raw?.freezesLeftThisWeek ?? 0,
    freeDaysEarned: raw?.freeDaysEarned ?? 0,
  };
}

export async function openCheckout(url: string): Promise<void> {
  await WebBrowser.openBrowserAsync(url);
}
