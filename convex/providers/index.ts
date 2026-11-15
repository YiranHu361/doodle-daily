import { CAST } from "../lib/cast";
import { mockImageProvider } from "./mockImage";
import { mockScriptProvider } from "./mockScript";
import type { ImageProvider, ScriptProvider } from "./types";

export const STYLE_BLOCK = `STYLE: hand-drawn wax crayon illustration on off-white textured paper, thick
wobbly dark outlines, chubby rounded characters with dot eyes and simple
smiles, bright flat primary colors, uneven crayon fill slightly outside the
lines, simple backgrounds (rolling green hills, big yellow sun, or a plain
room with two or three objects), square 1:1 frame, no text, no letters, no
logos, no speech bubbles, no watermarks.`;

export function panelPrompt(scene: string, cast: string[]): string {
  const characters = CAST.filter((c) => cast.includes(c.name))
    .map((c) => `${c.name}: ${c.description}.`)
    .join(" ");
  return [
    STYLE_BLOCK,
    `CHARACTERS: use the attached reference sheets exactly. ${characters}`,
    `SCENE: ${scene}`,
    "Composition: one clear action in the center, characters large, plenty of empty paper around them.",
  ].join("\n");
}

export function getScriptProvider(): ScriptProvider {
  return mockScriptProvider;
}

export function getImageProvider(opts?: { minDelayMs?: number; maxDelayMs?: number; size?: number }): ImageProvider {
  return mockImageProvider(opts);
}

export type * from "./types";
