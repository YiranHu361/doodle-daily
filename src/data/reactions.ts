import type { ReactionCounts, ReactionKind } from "./types";

export const REACTION_KINDS: readonly ReactionKind[] = ["lol", "wow", "yikes"];

export function applyToggle(counts: ReactionCounts, kind: ReactionKind): ReactionCounts {
  const next = { ...counts };
  if (counts.mine) next[counts.mine] = Math.max(0, next[counts.mine] - 1);
  if (counts.mine === kind) return { ...next, mine: null };
  next[kind] += 1;
  return { ...next, mine: kind };
}

export type ReactionState = { server: ReactionCounts | null; optimistic: ReactionCounts | null; pending: number };

export type ReactionEvent =
  | { type: "server"; counts: ReactionCounts }
  | { type: "tap"; kind: ReactionKind }
  | { type: "settled"; ok: boolean };

export const initialReactionState: ReactionState = { server: null, optimistic: null, pending: 0 };

function caughtUp(state: ReactionState): ReactionState {
  if (state.pending > 0 || !state.optimistic || !state.server) return state;
  return state.server.mine === state.optimistic.mine ? { ...state, optimistic: null } : state;
}

export function reactionReducer(state: ReactionState, event: ReactionEvent): ReactionState {
  switch (event.type) {
    case "server":
      return caughtUp({ ...state, server: event.counts });
    case "tap": {
      const base = state.optimistic ?? state.server;
      if (!base) return state;
      return { ...state, optimistic: applyToggle(base, event.kind), pending: state.pending + 1 };
    }
    case "settled": {
      const pending = Math.max(0, state.pending - 1);
      if (!event.ok) return { ...state, pending, optimistic: pending > 0 ? state.optimistic : null };
      return caughtUp({ ...state, pending });
    }
  }
}

export function visibleCounts(state: ReactionState): ReactionCounts | null {
  return state.optimistic ?? state.server;
}
