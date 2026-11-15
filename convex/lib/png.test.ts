import { describe, expect, test } from "vitest";
import { inflateZlib } from "./inflate";
import { decodePng, shrinkPng } from "./png";
import { drawPlaceholder, encodePng } from "../providers/placeholder";

describe("png", () => {
  test("decodes our own PNG and shrinks it to the requested size", async () => {
    const rgb = drawPlaceholder(64, { seed: "png", cast: ["Coin"], section: "money" });
    const png = await encodePng(rgb, 64);
    const decoded = await decodePng(png);
    expect(decoded?.width).toBe(64);
    expect(decoded?.rgb).toEqual(rgb);
    const small = await shrinkPng(png, 32);
    const again = await decodePng(small!);
    expect([again?.width, again?.height]).toEqual([32, 32]);
  });

  test("the built-in inflater matches the platform one", async () => {
    const data = new Uint8Array(20000).map((_, i) => (i * 7) % 251 ^ (i >> 5));
    const zipped = new Uint8Array(
      await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer(),
    );
    expect(inflateZlib(zipped)).toEqual(data);
    const png = await encodePng(drawPlaceholder(48, { seed: "z", cast: ["Robo", "Newsie"], section: "tech" }), 48);
    expect(inflateZlib(png.subarray(41, png.length - 16)).length).toBe(48 * (48 * 3 + 1));
  });

  test("returns null for something that is not a PNG", async () => {
    expect(await shrinkPng(new Uint8Array([1, 2, 3]), 32)).toBeNull();
  });
});
