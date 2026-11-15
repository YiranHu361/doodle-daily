import { describe, expect, test } from "vitest";
import { addDays, isIsoDate, pacificDate } from "./dates";
import { normaliseUrl } from "./urls";
import { mockScript } from "../providers/mockScript";
import { isCastName } from "./cast";
import { drawPlaceholder, encodePng } from "../providers/placeholder";

describe("pacificDate", () => {
  test("uses the Los Angeles calendar day", () => {
    expect(pacificDate(Date.UTC(2026, 10, 15, 7, 59))).toBe("2026-11-14");
    expect(pacificDate(Date.UTC(2026, 10, 15, 8, 0))).toBe("2026-11-15");
    expect(pacificDate(Date.UTC(2026, 6, 1, 6, 59))).toBe("2026-06-30");
    expect(pacificDate(Date.UTC(2026, 6, 1, 7, 0))).toBe("2026-07-01");
  });

  test("addDays crosses months and years", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-11-15")).toBe(true);
  });
});

describe("normaliseUrl", () => {
  test("drops tracking, www, fragments and trailing slashes", () => {
    expect(normaliseUrl("http://www.Example.com/a/b/?utm_source=x&id=2&fbclid=y#top")).toBe("https://example.com/a/b?id=2");
    expect(normaliseUrl("https://example.com/a?b=2&a=1")).toBe(normaliseUrl("https://example.com/a/?a=1&b=2"));
    expect(normaliseUrl("https://m.example.com/")).toBe("https://example.com");
  });

  test("rejects non-web urls", () => {
    expect(normaliseUrl("not a url")).toBeNull();
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseUrl("ftp://example.com/x")).toBeNull();
  });
});

describe("mock providers", () => {
  test("mock script is deterministic and well formed", () => {
    const input = {
      section: "tech" as const,
      kind: "news" as const,
      headline: "A robot learns to fold towels at home",
      facts: ["A robot folded towels in a test. It took an hour per towel."],
    };
    const a = mockScript(input);
    expect(mockScript(input)).toEqual(a);
    expect(a.panels).toHaveLength(4);
    expect(a.title.split(" ").length).toBeLessThan(7);
    for (const p of a.panels) {
      expect(p.caption.split(" ").length).toBeLessThan(16);
      expect(p.caption).not.toMatch(/["\u201C\u201D]/);
      expect(p.scene.split(" ").length).toBeLessThan(40);
      expect(p.cast.every(isCastName)).toBe(true);
    }
    expect(a.realStory.split(/(?<=\.)\s+/)).toHaveLength(2);
  });

  test("placeholder is a valid PNG", async () => {
    const png = await encodePng(drawPlaceholder(64, { seed: "x", cast: ["Robo"], section: "tech" }), 64);
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});
