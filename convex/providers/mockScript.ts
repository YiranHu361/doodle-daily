import type { Script, ScriptInput, ScriptProvider, ScriptResult } from "./types";

const SECTION_CAST: Record<ScriptInput["section"], string[]> = {
  tech: ["Robo", "Boss Blob"],
  money: ["Coin", "Boss Blob"],
  culture: ["The Crowd", "Newsie"],
  memes: ["The Crowd", "Robo"],
};

const SCENES = [
  (a: string, b: string) => `${a} stands in the middle of a green hill under a big yellow sun, looking at a small box.`,
  (a: string, b: string) => `${b} rushes in waving both arms while ${a} holds the box up high.`,
  (a: string, b: string) => `${a} and ${b} tug the box in opposite directions as Newsie watches from a fence.`,
  (a: string, b: string) => `${a} sits on the box, ${b} shrugs, and Newsie tips its paper hat.`,
];

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function words(text: string, max: number): string {
  const list = text.replace(/["\u201C\u201D]/g, "").split(/\s+/).filter(Boolean);
  const cut = list.slice(0, max).join(" ");
  return list.length > max ? cut.replace(/[.,;:!?]*$/, "") + "." : cut;
}

export function mockScript(input: ScriptInput): Script {
  const [a, b] = SECTION_CAST[input.section];
  const facts = input.facts.flatMap(sentences);
  const pool = facts.length > 0 ? facts : [input.headline];
  const captions = [0, 1, 2, 3].map((i) => words(pool[i % pool.length], 15));
  const story = pool.slice(0, input.kind === "meme" ? 1 : 2);
  while (story.length < (input.kind === "meme" ? 1 : 2)) story.push(input.headline + ".");
  return {
    title: words(input.headline, 6).replace(/\.$/, ""),
    panels: SCENES.map((scene, i) => ({
      scene: scene(a, b),
      cast: i === 2 || i === 3 ? [a, b, "Newsie"] : i === 1 ? [a, b] : [a],
      caption: captions[i],
    })),
    realStory: story.join(" "),
  };
}

export const mockScriptProvider: ScriptProvider = {
  name: "mock",
  async writeScript(input: ScriptInput): Promise<ScriptResult> {
    return { ok: true, script: mockScript(input) };
  },
};
