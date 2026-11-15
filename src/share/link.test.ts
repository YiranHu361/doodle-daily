import { describe, expect, test } from "vitest";
import { shareMessage, siteUrl, storyLink } from "./link";

describe("story link", () => {
  test("turns the Convex cloud URL into the site URL", () => {
    expect(siteUrl("https://resilient-ostrich-674.convex.cloud")).toBe("https://resilient-ostrich-674.convex.site");
    expect(siteUrl("https://resilient-ostrich-674.convex.cloud/")).toBe("https://resilient-ostrich-674.convex.site");
  });

  test("builds the /s/<comicId> link", () => {
    expect(storyLink("k57abc123", "https://happy-otter-1.convex.cloud")).toBe("https://happy-otter-1.convex.site/s/k57abc123");
    expect(storyLink("a/b", "https://happy-otter-1.convex.cloud")).toBe("https://happy-otter-1.convex.site/s/a%2Fb");
  });

  test("defaults to the shared deployment", () => {
    expect(storyLink("k57abc123")).toMatch(/^https:\/\/[a-z0-9-]+\.convex\.site\/s\/k57abc123$/);
  });

  test("share text is the quoted title and the link", () => {
    expect(shareMessage("Robo Buys a Cloud", "https://x.convex.site/s/1")).toBe('"Robo Buys a Cloud" https://x.convex.site/s/1');
  });
});
