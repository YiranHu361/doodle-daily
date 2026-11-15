import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { resolveScreen, type ScreenState } from "./connection";
import { useConnection } from "./connectionHooks";
import { decodeCounts, decodeDrawResult, decodeEdition, decodeSummaries } from "./decode";
import { useDeviceId } from "./deviceId";
import { drawReducer, initialDrawState, isBusy, type DrawFailure, type DrawState } from "./drawFlow";
import { fixtureStore } from "./fixtures";
import { onLocalReset, useFlags } from "./flags";
import { initialReactionState, reactionReducer, visibleCounts } from "./reactions";
import { DRAW_TIMEOUT_MS, REACTION_TIMEOUT_MS, TimeoutError, withTimeout } from "./timeout";
import type { Comic, Edition, EditionSummary, ReactionCounts, ReactionKind } from "./types";

const CACHE_KEY = "dd.lastIssue.v1";

function useFixtureVersion(): number {
  return useSyncExternalStore(fixtureStore.subscribe, fixtureStore.version);
}

function useCachedIssue(): Edition | null {
  const [cached, setCached] = useState<Edition | null>(null);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (live && raw) setCached(decodeEdition(JSON.parse(raw)));
      })
      .catch(() => undefined);
    const off = onLocalReset(() => setCached(null));
    return () => {
      live = false;
      off();
    };
  }, []);
  return cached;
}

export function useToday(enabled = true): ScreenState<Edition> {
  const { fixtures } = useFlags();
  const version = useFixtureVersion();
  const deviceId = useDeviceId();
  const raw = useQuery(api.editions.today, enabled && !fixtures && deviceId ? { deviceId } : "skip");
  const cached = useCachedIssue();
  const conn = useConnection();
  const live = useMemo(() => {
    void version;
    if (fixtures) return fixtureStore.today();
    return raw === undefined ? undefined : decodeEdition(raw);
  }, [fixtures, raw, version]);

  useEffect(() => {
    if (live && !fixtures) void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(live)).catch(() => undefined);
  }, [live, fixtures]);

  return resolveScreen({ live, cached: fixtures ? null : cached, ...conn });
}

export function useEditionByDate(date: string | null): ScreenState<Edition> {
  const { fixtures } = useFlags();
  const version = useFixtureVersion();
  const deviceId = useDeviceId();
  const raw = useQuery(api.editions.byDate, date && deviceId && !fixtures ? { date, deviceId } : "skip");
  const conn = useConnection();
  const live = useMemo(() => {
    void version;
    if (!date) return undefined;
    if (fixtures) return fixtureStore.byDate(date);
    return raw === undefined ? undefined : decodeEdition(raw);
  }, [date, fixtures, raw, version]);
  return resolveScreen({ live, cached: null, ...conn });
}

export function useIssue(date: string | null): ScreenState<Edition> {
  const today = useToday(date === null);
  const byDate = useEditionByDate(date);
  return date === null ? today : byDate;
}

export function useEditionList(): ScreenState<EditionSummary[]> {
  const { fixtures } = useFlags();
  const version = useFixtureVersion();
  const deviceId = useDeviceId();
  const raw = useQuery(api.editions.list, fixtures || !deviceId ? "skip" : { deviceId });
  const conn = useConnection();
  const live = useMemo(() => {
    void version;
    if (fixtures) return fixtureStore.list();
    return raw === undefined ? undefined : decodeSummaries(raw);
  }, [fixtures, raw, version]);
  return resolveScreen({ live, cached: null, ...conn });
}

export function useReactions(comicId: string, onError: () => void): {
  counts: ReactionCounts | null;
  toggle: (kind: ReactionKind) => void;
} {
  const { fixtures } = useFlags();
  const version = useFixtureVersion();
  const deviceId = useDeviceId();
  const raw = useQuery(api.reactions.counts, !fixtures && deviceId ? { comicId: comicId as Id<"comics">, deviceId } : "skip");
  const mutate = useMutation(api.reactions.toggle);
  const [state, dispatch] = useReducer(reactionReducer, initialReactionState);
  const source = useMemo(() => {
    void version;
    return fixtures ? fixtureStore.counts(comicId) : raw;
  }, [fixtures, raw, version, comicId]);

  useEffect(() => {
    const counts = decodeCounts(source);
    if (counts) dispatch({ type: "server", counts });
  }, [source]);

  const counts = visibleCounts(state);
  const toggle = useCallback(
    (kind: ReactionKind) => {
      if (!counts || !deviceId) return;
      dispatch({ type: "tap", kind });
      const call = fixtures ? fixtureStore.toggle(comicId, kind) : mutate({ comicId: comicId as Id<"comics">, deviceId, kind });
      withTimeout(call, REACTION_TIMEOUT_MS).then(
        () => dispatch({ type: "settled", ok: true }),
        () => {
          dispatch({ type: "settled", ok: false });
          onError();
        },
      );
    },
    [counts, deviceId, fixtures, comicId, mutate, onError],
  );

  return { counts: deviceId ? counts : null, toggle };
}

export function useDrawFresh(
  comics: readonly Comic[],
  handlers: { onFailed: (reason: DrawFailure) => void; onDone: (comicId: string) => void },
): { state: DrawState; busy: boolean; start: () => void } {
  const { fixtures } = useFlags();
  const deviceId = useDeviceId();
  const action = useAction(api.pipeline.drawFreshOne);
  const [state, dispatch] = useReducer(drawReducer, initialDrawState);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    dispatch({ type: "snapshot", comics, now: Date.now() });
  }, [comics]);

  const drawing = state.phase === "drawing";
  useEffect(() => {
    if (!drawing) return;
    const t = setInterval(() => dispatch({ type: "snapshot", comics, now: Date.now() }), 5_000);
    return () => clearInterval(t);
  }, [drawing, comics]);

  useEffect(() => {
    if (state.phase === "failed") {
      handlersRef.current.onFailed(state.reason);
      dispatch({ type: "reset" });
    } else if (state.phase === "done") {
      handlersRef.current.onDone(state.comicId);
      dispatch({ type: "reset" });
    }
  }, [state]);

  const busy = isBusy(state);
  const start = useCallback(() => {
    if (busy || !deviceId) return;
    dispatch({ type: "start", now: Date.now() });
    const secret = process.env.EXPO_PUBLIC_DEMO_SECRET ?? "";
    const call = fixtures ? fixtureStore.drawFreshOne() : action({ deviceId, secret });
    withTimeout(call, DRAW_TIMEOUT_MS).then(
      (raw) => dispatch({ type: "result", result: decodeDrawResult(raw) ?? { ok: false, reason: "error" }, now: Date.now() }),
      (error: unknown) =>
        dispatch({ type: "result", result: { ok: false, reason: error instanceof TimeoutError ? "timeout" : "error" }, now: Date.now() }),
    );
  }, [busy, deviceId, fixtures, action]);

  return { state, busy, start };
}
