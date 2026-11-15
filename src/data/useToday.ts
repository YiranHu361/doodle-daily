import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { decodeEdition } from "./decode";
import type { Edition } from "./types";

const CACHE_KEY = "dd.lastIssue.v1";

export type TodayState =
  | { state: "loading"; edition: null }
  | { state: "empty"; edition: null }
  | { state: "ready"; edition: Edition; fromCache: boolean };

export function useToday(): TodayState {
  const live = useQuery(api.editions.today, {});
  const [cached, setCached] = useState<Edition | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => (raw ? setCached(decodeEdition(JSON.parse(raw))) : undefined))
      .catch(() => undefined);
  }, []);

  const decoded = useMemo(() => (live ? decodeEdition(live) : live), [live]);

  useEffect(() => {
    if (decoded) void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(decoded)).catch(() => undefined);
  }, [decoded]);

  if (decoded) return { state: "ready", edition: decoded, fromCache: false };
  if (decoded === undefined && cached) return { state: "ready", edition: cached, fromCache: true };
  if (decoded === null) return { state: "empty", edition: null };
  return { state: "loading", edition: null };
}
