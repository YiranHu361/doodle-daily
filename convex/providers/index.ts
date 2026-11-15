import { CAST } from "../lib/cast";
import { anthropicProvider } from "./anthropic";
import { mockImageProvider } from "./mockImage";
import { mockScriptProvider } from "./mockScript";
import { openaiImageProvider } from "./openai";
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

export function sheetPrompt(name: string): string {
  const member = CAST.find((c) => c.name === name);
  return [
    STYLE_BLOCK,
    "character reference sheet, front view and side view, plain paper background",
    `${member?.name ?? name}: ${member?.description ?? ""}.`,
  ].join("\n");
}

type Overrides = { script?: ScriptProvider; image?: ImageProvider };
let overrides: Overrides = {};

export function setProvidersForTests(next: Overrides): void {
  overrides = next;
}

function clean(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

export function getScriptProvider(): ScriptProvider {
  if (overrides.script) return overrides.script;
  const choice = clean(process.env.SCRIPT_PROVIDER);
  const key = clean(process.env.ANTHROPIC_API_KEY);
  if (choice !== "mock" && key) return anthropicProvider(key);
  return mockScriptProvider;
}

export function getImageProvider(opts?: { minDelayMs?: number; maxDelayMs?: number; size?: number }): ImageProvider {
  if (overrides.image) return overrides.image;
  const choice = clean(process.env.IMAGE_PROVIDER);
  const key = clean(process.env.OPENAI_API_KEY);
  if (choice !== "mock" && key) return openaiImageProvider(key);
  const raw = clean(process.env.MOCK_IMAGE_DELAY_MS);
  const delay = Number(raw);
  return mockImageProvider(raw && Number.isFinite(delay) ? { minDelayMs: delay, maxDelayMs: delay, size: 64, ...opts } : opts);
}

export { mockImageProvider, mockScriptProvider };
export type * from "./types";
