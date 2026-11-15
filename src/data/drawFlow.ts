import type { ComicStatus, DrawReason, DrawResult } from "./types";

export const APPEAR_LIMIT_MS = 60_000;

export type DrawFailure = DrawReason | "timeout" | "error" | "vanished";

export type DrawState =
  | { phase: "idle" }
  | { phase: "requesting"; startedAt: number }
  | { phase: "drawing"; comicId: string; seen: boolean; startedAt: number }
  | { phase: "done"; comicId: string }
  | { phase: "failed"; reason: DrawFailure };

export type DrawEvent =
  | { type: "start"; now: number }
  | { type: "result"; result: DrawResult | { ok: false; reason: "timeout" | "error" }; now: number }
  | { type: "snapshot"; comics: readonly { _id: string; status: ComicStatus }[]; now: number }
  | { type: "reset" };

export const initialDrawState: DrawState = { phase: "idle" };

export function isBusy(state: DrawState): boolean {
  return state.phase === "requesting" || state.phase === "drawing";
}

export function drawingInLead(state: DrawState): boolean {
  return state.phase === "requesting" || (state.phase === "drawing" && !state.seen);
}

export function drawReducer(state: DrawState, event: DrawEvent): DrawState {
  switch (event.type) {
    case "start":
      return isBusy(state) ? state : { phase: "requesting", startedAt: event.now };
    case "reset":
      return isBusy(state) ? state : initialDrawState;
    case "result":
      if (state.phase !== "requesting") return state;
      return event.result.ok
        ? { phase: "drawing", comicId: event.result.comicId, seen: false, startedAt: event.now }
        : { phase: "failed", reason: event.result.reason };
    case "snapshot": {
      if (state.phase !== "drawing") return state;
      const comic = event.comics.find((c) => c._id === state.comicId);
      if (comic) return comic.status === "ready" ? { phase: "done", comicId: state.comicId } : state.seen ? state : { ...state, seen: true };
      if (state.seen || event.now - state.startedAt > APPEAR_LIMIT_MS) return { phase: "failed", reason: "vanished" };
      return state;
    }
  }
}

export const DRAW_MESSAGES: Record<Exclude<DrawFailure, "needs_plus">, string> = {
  no_story: "No fresh stories right now.",
  spend_cap: "Robo is out of crayons for today.",
  busy: "Robo is already drawing one.",
  bad_secret: "My crayon snapped. Try again.",
  timeout: "My crayon snapped. Try again.",
  error: "My crayon snapped. Try again.",
  vanished: "My crayon snapped. Try again.",
};

export function drawMessage(reason: DrawFailure): string | null {
  return reason === "needs_plus" ? null : DRAW_MESSAGES[reason];
}
