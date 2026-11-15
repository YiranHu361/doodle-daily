import { drawPlaceholder, encodePng, hashSeed } from "./placeholder";
import type { ImageProvider, ImageResult, PanelInput } from "./types";

export const PLACEHOLDER_SIZE = 512;

export function mockImageProvider(opts: { minDelayMs?: number; maxDelayMs?: number; size?: number } = {}): ImageProvider {
  const min = opts.minDelayMs ?? 1000;
  const max = opts.maxDelayMs ?? 3000;
  const size = opts.size ?? PLACEHOLDER_SIZE;
  return {
    name: "mock",
    async drawPanel(input: PanelInput): Promise<ImageResult> {
      const delay = min + (hashSeed(input.seed) % Math.max(1, max - min + 1));
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      const rgb = drawPlaceholder(size, { seed: input.seed, cast: input.cast, section: input.section });
      return { ok: true, bytes: await encodePng(rgb, size), contentType: "image/png" };
    },
  };
}
