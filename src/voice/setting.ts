import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
import { onLocalReset } from "../data/flags";

const KEY = "dd.voice.v1";

export type VoiceSetting = { on: boolean; noteSeen: boolean; notice: string | null; loaded: boolean };

const initial: VoiceSetting = { on: false, noteSeen: false, notice: null, loaded: false };
let state = initial;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<VoiceSetting>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function persist() {
  void AsyncStorage.setItem(KEY, JSON.stringify({ on: state.on, noteSeen: state.noteSeen })).catch(() => undefined);
}

function load() {
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      const saved = raw ? (JSON.parse(raw) as { on?: unknown; noteSeen?: unknown }) : {};
      set({ on: saved.on === true, noteSeen: saved.noteSeen === true, loaded: true });
    })
    .catch(() => set({ loaded: true }));
}

onLocalReset(() => {
  loading = null;
  state = initial;
  load();
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVoiceSetting(): VoiceSetting {
  useEffect(load, []);
  return useSyncExternalStore(subscribe, () => state);
}

export function toggleVoice(): { firstTime: boolean } {
  const firstTime = !state.on && !state.noteSeen;
  set({ on: !state.on, noteSeen: true, notice: null });
  persist();
  return { firstTime };
}

export function setVoiceNotice(notice: string | null) {
  if (state.notice !== notice) set({ notice });
}
