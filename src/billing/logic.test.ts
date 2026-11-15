import { describe, expect, test } from "vitest";
import { commissionArgs, commissionLine, freezeDay, isMilestone, looksLikeLink, parsePrice, rewardLine } from "./logic";

describe("billing logic", () => {
  test("a pasted link is sent as a link, anything else as a topic", () => {
    expect(looksLikeLink(" https://example.com/a ")).toBe(true);
    expect(looksLikeLink("our seed round")).toBe(false);
    expect(commissionArgs("https://example.com/a")).toEqual({ link: "https://example.com/a" });
    expect(commissionArgs("  a robot learns to fold laundry ")).toEqual({ topic: "a robot learns to fold laundry" });
  });

  test("a combo pays at every multiple of 7", () => {
    expect([6, 7, 13, 14, 21, 0].map(isMilestone)).toEqual([false, true, false, true, true, false]);
  });

  test("a single missed day yesterday is the one to freeze", () => {
    expect(freezeDay({ runEnd: "2026-11-13" }, "2026-11-15")).toBe("2026-11-14");
    expect(freezeDay({ runEnd: "2026-11-12" }, "2026-11-15")).toBeNull();
    expect(freezeDay(null, "2026-11-15")).toBeNull();
  });

  test("paper prices are 1 to 20 dollars", () => {
    expect(["3", "$4.5", "0.5", "21", "abc"].map(parsePrice)).toEqual([3, 4.5, null, null, null]);
  });

  test("status lines tell the reader what happens", () => {
    expect(commissionLine("failed")).toMatch(/could not finish/);
    expect(rewardLine(Date.UTC(2026, 11, 16, 20))).toBe("Robo paid for a day. Plus now runs to Dec 16.");
  });
});
