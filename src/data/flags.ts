import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { setFixedNow } from "./clock";
import { resetDeviceId } from "./deviceId";
import { DEFAULT_FLAGS, flagsFromEnv, flagsFromUrl, type LaunchFlags } from "./flagsParse";

let current: LaunchFlags = { ...DEFAULT_FLAGS };
const listeners = new Set<() => void>();
const resetListeners = new Set<() => void>();

export function getFlags(): LaunchFlags {
  return current;
}

export function useFlags(): LaunchFlags {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function onLocalReset(listener: () => void): () => void {
  resetListeners.add(listener);
  return () => resetListeners.delete(listener);
}

export async function resetLocalState(): Promise<void> {
  await AsyncStorage.clear().catch(() => undefined);
  await resetDeviceId();
  resetListeners.forEach((l) => l());
}

export async function applyFlags(flags: Partial<LaunchFlags>): Promise<void> {
  if (flags.reset) await resetLocalState();
  if (flags.now !== undefined) setFixedNow(flags.now);
  current = { ...current, ...flags, reset: false };
  listeners.forEach((l) => l());
}

export async function applyFlagsFromUrl(url: string | null): Promise<boolean> {
  const flags = url ? flagsFromUrl(url) : null;
  if (!flags) return false;
  await applyFlags(flags);
  return true;
}

export function envFlags(): Partial<LaunchFlags> {
  return flagsFromEnv({
    fixtures: process.env.EXPO_PUBLIC_FIXTURES,
    skipIntro: process.env.EXPO_PUBLIC_SKIP_INTRO,
    reset: process.env.EXPO_PUBLIC_RESET,
    now: process.env.EXPO_PUBLIC_NOW,
  });
}
