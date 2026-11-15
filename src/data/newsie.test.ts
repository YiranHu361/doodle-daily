import { describe, expect, test } from "vitest";
import { newsieSmsUrl } from "./newsie";

describe("newsieSmsUrl", () => {
  test("opens Messages to the shared number with the join text", () => {
    expect(newsieSmsUrl("+1 (555) 010-0100", "Hi Newsie! K-7QF2MD")).toBe("sms:+15550100100&body=Hi%20Newsie!%20K-7QF2MD");
  });

  test("hides the row until a number is configured", () => {
    expect(newsieSmsUrl("", "K-7QF2MD")).toBeNull();
    expect(newsieSmsUrl("call me", "")).toBeNull();
  });
});
