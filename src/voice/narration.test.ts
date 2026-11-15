import { expect, test } from "vitest";
import { clipForPage, createNarration, type ClipPlayer } from "./narration";

function fakePlayer() {
  const log: string[] = [];
  let current: string | null = null;
  let overlaps = 0;
  const player: ClipPlayer = {
    play(url) {
      if (current) overlaps++;
      current = url;
      log.push(`play ${url}`);
    },
    stop() {
      current = null;
      log.push("stop");
    },
  };
  return { player, log, overlaps: () => overlaps };
}

test("plays the clip for the page once, and stops it on swipe before the next starts", () => {
  const f = fakePlayer();
  const n = createNarration(f.player);
  n.update({ page: 0, url: "a", active: true });
  n.update({ page: 0, url: "a", active: true });
  n.update({ page: 1, url: "b", active: true });
  expect(f.log).toEqual(["play a", "stop", "play b"]);
  expect(f.overlaps()).toBe(0);
});

test("waits for a clip that has not arrived, then plays it while still on the page", () => {
  const f = fakePlayer();
  const n = createNarration(f.player);
  n.update({ page: 2, url: null, active: true });
  expect(f.log).toEqual([]);
  n.update({ page: 2, url: "c", active: true });
  expect(f.log).toEqual(["play c"]);
});

test("a clip that arrives after the reader moved on does not play on the old page", () => {
  const f = fakePlayer();
  const n = createNarration(f.player);
  n.update({ page: 0, url: null, active: true });
  n.update({ page: 1, url: null, active: true });
  n.update({ page: 1, url: "b", active: true });
  expect(f.log).toEqual(["play b"]);
});

test("a finished clip is not stopped again and does not replay", () => {
  const f = fakePlayer();
  const n = createNarration(f.player);
  n.update({ page: 0, url: "a", active: true });
  n.finished();
  n.update({ page: 0, url: "a", active: true });
  n.update({ page: 1, url: "b", active: true });
  expect(f.log).toEqual(["play a", "play b"]);
});

test("switching off stops at once; switching on reads the current page again", () => {
  const f = fakePlayer();
  const n = createNarration(f.player);
  n.update({ page: 3, url: "d", active: true });
  n.update({ page: 3, url: "d", active: false });
  n.update({ page: 3, url: "d", active: false });
  n.update({ page: 3, url: "d", active: true });
  expect(f.log).toEqual(["play d", "stop", "play d"]);
});

test("nothing plays while inactive, and dispose stops a playing clip", () => {
  const f = fakePlayer();
  const n = createNarration(f.player);
  n.update({ page: 0, url: "a", active: false });
  expect(f.log).toEqual([]);
  n.update({ page: 4, url: "r", active: true });
  n.dispose();
  expect(f.log).toEqual(["play r", "stop"]);
});

test("clipForPage maps pages 0-3 to panels and 4 to the real story", () => {
  const clips = { panels: ["a", null, "c", "d"], realStory: "r" };
  expect([0, 1, 2, 3, 4].map((p) => clipForPage(clips, p))).toEqual(["a", null, "c", "d", "r"]);
  expect(clipForPage(undefined, 0)).toBeNull();
});
