import { expect, test } from "vitest";
import { SHARE_WIDTH, shareLayout } from "./layout";

test("the share image is 1080 px wide and tall enough for title, four panels with captions and the footer", () => {
  const l = shareLayout();
  expect(l.width).toBe(SHARE_WIDTH);
  expect(l.width).toBe(1080);
  expect(l.panelSize + l.padding * 2).toBe(l.width);
  expect(l.height).toBe(l.padding * 2 + l.titleHeight + 4 * (l.panelSize + l.captionHeight + l.gap) + l.footerHeight);
  expect(l.height).toBeGreaterThan(4 * l.panelSize);
  expect(l.captionFont).toBeGreaterThanOrEqual(17 * 2);
});
