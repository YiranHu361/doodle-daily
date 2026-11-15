import { afterEach, describe, expect, test, vi } from "vitest";
import { addDays, formatIssueDate, pacificDate } from "./clock";
import { resolveScreen } from "./connection";
import { APPEAR_LIMIT_MS, drawingInLead, drawMessage, drawReducer, initialDrawState, isBusy, type DrawState } from "./drawFlow";
import { DRAWING_SLOT, filterComics, orderForToday, withDrawingLead } from "./filter";
import { flagsFromEnv, flagsFromUrl } from "./flagsParse";
import { applyToggle, initialReactionState, reactionReducer, visibleCounts } from "./reactions";
import { shouldMarkRead } from "./readTracker";
import { TimeoutError, withTimeout } from "./timeout";
import type { Comic, Section } from "./types";

const comic = (id: string, section: Section, extra: Partial<Comic> = {}): Comic => ({
  _id: id,
  section,
  kind: "news",
  title: id,
  realStory: "",
  sourceName: "",
  sourceUrl: "",
  status: "ready",
  order: 0,
  createdAt: 0,
  isNew: false,
  panels: [],
  ...extra,
});

describe("chips", () => {
  const comics = [comic("a", "tech"), comic("b", "money"), comic("c", "money"), comic("d", "memes")];
  test("All shows everything, a section shows only its comics", () => {
    expect(filterComics(comics, "all").map((c) => c._id)).toEqual(["a", "b", "c", "d"]);
    expect(filterComics(comics, "money").map((c) => c._id)).toEqual(["b", "c"]);
    expect(filterComics(comics, "culture")).toEqual([]);
  });
  test("the comic being drawn and new comics go to the top", () => {
    const list = [comic("a", "tech"), comic("n", "tech", { isNew: true, createdAt: 5 }), comic("f", "tech", { createdAt: 9 })];
    expect(orderForToday(list, "f").map((c) => c._id)).toEqual(["f", "n", "a"]);
  });
  test("while drawing, the drawing card takes the lead slot and adds no extra card", () => {
    const list = [comic("a", "tech"), comic("b", "money"), comic("c", "culture")];
    const ids = (slots: ReturnType<typeof withDrawingLead>) => slots.map((s) => (s === DRAWING_SLOT ? s : s._id));
    expect(ids(withDrawingLead(list, true))).toEqual([DRAWING_SLOT, "b", "c"]);
    expect(withDrawingLead(list, true)).toHaveLength(list.length);
    expect(ids(withDrawingLead(list, false))).toEqual(["a", "b", "c"]);
    expect(ids(withDrawingLead([], true))).toEqual([DRAWING_SLOT]);
  });
  test("the lead shows the drawing state from the press until the new comic is seen", () => {
    const requesting = drawReducer(initialDrawState, { type: "start", now: 0 });
    const drawing = drawReducer(requesting, { type: "result", result: { ok: true, comicId: "n" }, now: 1 });
    const seen = drawReducer(drawing, { type: "snapshot", comics: [{ _id: "n", status: "drawing" }], now: 2 });
    expect([initialDrawState, requesting, drawing, seen].map(drawingInLead)).toEqual([false, true, true, false]);
  });
});

describe("draw flow", () => {
  const start = (): DrawState => drawReducer(initialDrawState, { type: "start", now: 0 });

  test.each(["bad_secret", "no_story", "spend_cap", "busy", "needs_plus"] as const)("refusal %s ends the busy state with its message", (reason) => {
    const s = drawReducer(start(), { type: "result", result: { ok: false, reason }, now: 1 });
    expect(s).toEqual({ phase: "failed", reason });
    expect(isBusy(s)).toBe(false);
  });

  test("every refusal has the copy from the design", () => {
    expect(drawMessage("no_story")).toBe("No fresh stories right now.");
    expect(drawMessage("spend_cap")).toBe("Robo is out of crayons for today.");
    expect(drawMessage("busy")).toBe("Robo is already drawing one.");
    expect(drawMessage("bad_secret")).toBe("My crayon snapped. Try again.");
    expect(drawMessage("timeout")).toBe("My crayon snapped. Try again.");
    expect(drawMessage("needs_plus")).toBeNull();
  });

  test("a timeout fails the draw", () => {
    const s = drawReducer(start(), { type: "result", result: { ok: false, reason: "timeout" }, now: 60_000 });
    expect(s).toEqual({ phase: "failed", reason: "timeout" });
    expect(drawMessage("timeout")).toBe("My crayon snapped. Try again.");
  });

  test("a second press while busy does nothing", () => {
    const s = start();
    expect(drawReducer(s, { type: "start", now: 5 })).toBe(s);
  });

  test("success: placeholder appears, then the comic turns ready", () => {
    let s = drawReducer(start(), { type: "result", result: { ok: true, comicId: "c1" }, now: 1 });
    expect(s.phase).toBe("drawing");
    s = drawReducer(s, { type: "snapshot", comics: [{ _id: "c1", status: "scripted" }], now: 2 });
    expect(s).toMatchObject({ phase: "drawing", seen: true });
    s = drawReducer(s, { type: "snapshot", comics: [{ _id: "c1", status: "ready" }], now: 3 });
    expect(s).toEqual({ phase: "done", comicId: "c1" });
  });

  test("a comic that appears and then vanishes ends busy with the snapped message", () => {
    let s = drawReducer(start(), { type: "result", result: { ok: true, comicId: "c1" }, now: 1 });
    s = drawReducer(s, { type: "snapshot", comics: [{ _id: "c1", status: "drawing" }], now: 2 });
    s = drawReducer(s, { type: "snapshot", comics: [], now: 3 });
    expect(s).toEqual({ phase: "failed", reason: "vanished" });
    expect(drawMessage("vanished")).toBe("My crayon snapped. Try again.");
  });

  test("a comic that never appears fails after the appear limit", () => {
    let s = drawReducer(start(), { type: "result", result: { ok: true, comicId: "c1" }, now: 0 });
    s = drawReducer(s, { type: "snapshot", comics: [], now: APPEAR_LIMIT_MS - 1 });
    expect(s.phase).toBe("drawing");
    s = drawReducer(s, { type: "snapshot", comics: [], now: APPEAR_LIMIT_MS + 1 });
    expect(s).toEqual({ phase: "failed", reason: "vanished" });
  });
});

describe("timeouts really fire", () => {
  afterEach(() => vi.useRealTimers());
  test("a call that never settles rejects after the limit", async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => undefined);
    const p = withTimeout(never, 12_000);
    const check = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(12_000);
    await check;
  });
  test("a call that settles in time passes its value through", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });
});

describe("optimistic reactions", () => {
  const server = { lol: 2, wow: 1, yikes: 0, mine: null };

  test("toggle on, switch, off", () => {
    const on = applyToggle(server, "lol");
    expect(on).toEqual({ lol: 3, wow: 1, yikes: 0, mine: "lol" });
    const sw = applyToggle(on, "wow");
    expect(sw).toEqual({ lol: 2, wow: 2, yikes: 0, mine: "wow" });
    expect(applyToggle(sw, "wow")).toEqual({ lol: 2, wow: 1, yikes: 0, mine: null });
  });

  test("disabled until the first counts arrive", () => {
    const s = reactionReducer(initialReactionState, { type: "tap", kind: "lol" });
    expect(visibleCounts(s)).toBeNull();
  });

  test("a stale server value does not snap the optimistic count back", () => {
    let s = reactionReducer(initialReactionState, { type: "server", counts: server });
    s = reactionReducer(s, { type: "tap", kind: "lol" });
    expect(visibleCounts(s)!.lol).toBe(3);
    s = reactionReducer(s, { type: "server", counts: { ...server, wow: 4 } });
    expect(visibleCounts(s)!.lol).toBe(3);
    s = reactionReducer(s, { type: "settled", ok: true });
    s = reactionReducer(s, { type: "server", counts: server });
    expect(visibleCounts(s)!.lol).toBe(3);
    s = reactionReducer(s, { type: "server", counts: { lol: 3, wow: 4, yikes: 0, mine: "lol" } });
    expect(s.optimistic).toBeNull();
    expect(visibleCounts(s)).toEqual({ lol: 3, wow: 4, yikes: 0, mine: "lol" });
  });

  test("an error rolls back to the server value", () => {
    let s = reactionReducer(initialReactionState, { type: "server", counts: server });
    s = reactionReducer(s, { type: "tap", kind: "yikes" });
    s = reactionReducer(s, { type: "settled", ok: false });
    expect(visibleCounts(s)).toEqual(server);
  });
});

describe("read", () => {
  test("requires all four panels and a ready comic", () => {
    expect(shouldMarkRead(new Set([0, 1, 2, 3]), 4, "ready")).toBe(true);
    expect(shouldMarkRead(new Set([0, 1, 3]), 4, "ready")).toBe(false);
    expect(shouldMarkRead(new Set([0, 1, 2, 3]), 4, "drawing")).toBe(false);
    expect(shouldMarkRead(new Set([0, 1, 2, 3]), 3, "ready")).toBe(false);
  });
});

describe("connection state", () => {
  const base = { live: undefined, cached: null, everConnected: false, connected: false, sinceLaunchMs: 0 };
  test("stays loading for up to 12 s on a cold start, never offline before the first connection", () => {
    expect(resolveScreen(base)).toEqual({ kind: "loading" });
    expect(resolveScreen({ ...base, sinceLaunchMs: 11_999 })).toEqual({ kind: "loading" });
    expect(resolveScreen({ ...base, sinceLaunchMs: 12_000 })).toEqual({ kind: "error" });
  });
  test("a cached issue shows at once, without an offline banner before 12 s", () => {
    expect(resolveScreen({ ...base, cached: "issue" })).toEqual({ kind: "ready", data: "issue", offline: false, fromCache: true });
    expect(resolveScreen({ ...base, cached: "issue", sinceLaunchMs: 13_000 })).toEqual({ kind: "ready", data: "issue", offline: true, fromCache: true });
  });
  test("losing the connection after it worked shows offline with the issue kept", () => {
    expect(resolveScreen({ ...base, live: "live", everConnected: true, connected: false })).toEqual({ kind: "ready", data: "live", offline: true, fromCache: false });
    expect(resolveScreen({ ...base, live: null, everConnected: true, connected: true })).toEqual({ kind: "empty", offline: false });
  });
});

describe("launch flags", () => {
  test("from a deep link", () => {
    expect(flagsFromUrl("doodledaily://launch?fixtures=1&skipIntro=true&reset=1&now=2026-11-15T17:00:00Z")).toEqual({
      fixtures: true,
      skipIntro: true,
      reset: true,
      now: Date.parse("2026-11-15T17:00:00Z"),
    });
    expect(flagsFromUrl("doodledaily://reader/abc")).toBeNull();
  });
  test("from the environment", () => {
    expect(flagsFromEnv({ fixtures: "1", skipIntro: "0" })).toEqual({ fixtures: true, skipIntro: false });
    expect(flagsFromEnv({})).toEqual({});
  });
});

describe("dates", () => {
  test("pacific date, day math and the masthead format", () => {
    expect(pacificDate(Date.parse("2026-11-15T07:30:00Z"))).toBe("2026-11-14");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(formatIssueDate("2026-11-14")).toBe("Saturday, Nov 14");
  });
});
