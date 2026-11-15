import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";

const KEY = "dd.deviceId.v1";
let pending: Promise<string> | null = null;

export function getDeviceId(): Promise<string> {
  pending ??= (async () => {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) return stored;
    const id = Crypto.randomUUID();
    await AsyncStorage.setItem(KEY, id);
    return id;
  })();
  return pending;
}

export async function resetDeviceId(): Promise<void> {
  pending = null;
  await AsyncStorage.removeItem(KEY);
}

export function useDeviceId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getDeviceId().then((value) => live && setId(value));
    return () => {
      live = false;
    };
  }, []);
  return id;
}
