import type { MemePickInput, PickInput, ScriptInput } from "./types";

export function editorPrompt(input: PickInput): string {
  const lines = input.items.map((it) => `${it.id} | ${it.source} | ${it.title}${it.summary ? " - " + it.summary : ""}`);
  const already = input.alreadyInPaper.length
    ? `\n\nAlready in today's paper (do not pick these events again):\n${input.alreadyInPaper.map((h) => "- " + h).join("\n")}`
    : "";
  return `You are the editor of a daily comic newspaper. Below are today's headlines for
the ${input.section} section, each with an id, source and one-line summary.

1. Group headlines that are about the same event.
2. Remove any group about death, violence, disasters, illness, abuse, crimes
   against people, or private individuals.
3. Score each remaining group 1-10 on: how many sources cover it (importance),
   how surprising or absurd it is, and how easy it is to show in 4 simple
   drawings.
4. Return the top ${input.n} groups as JSON:
   [{ "itemIds": [...], "headline": "...", "whyFunny": "...", "score": 8 }]
Use only facts in the headlines and summaries. Do not add facts.

Wrap the list in an object: { "groups": [...] }.${already}

HEADLINES:
${lines.join("\n")}`;
}

export function memePickPrompt(input: MemePickInput): string {
  const trends = input.trends
    .map((t) => `TREND: ${t.topic}\n${t.posts.map((p) => `  - (${p.likes} likes, ${p.url}) ${p.text}`).join("\n")}`)
    .join("\n");
  const already = input.alreadyInPaper.length
    ? `\n\nAlready in today's paper (do not pick these again):\n${input.alreadyInPaper.map((h) => "- " + h).join("\n")}`
    : "";
  return `Below are today's trending topics on X with sample posts and like counts, and a
list of well-known meme format names.

Find the 4 funniest jokes that (a) most people would get without context,
(b) are not cruel, political attacks, sexual, or about tragedy, and (c) can be
retold in 4 simple drawings with a new cast of cartoon characters.

For each, return JSON:
{ "topic": "...", "theJoke": "one sentence explaining why people find it
funny", "format": "name of the meme format if one applies, else null",
"sourceUrls": ["..."], "score": 1-10 }
Describe the joke in your own words. Never copy a post's text.

Wrap the list in an object: { "jokes": [...] }.${already}

MEME FORMATS: ${input.formats.join(", ")}

${trends}`;
}

const CAST_AND_RULES = (realStory: string) => `CAST you must use (pick 1-3 per panel): Boss Blob (any executive), Coin
(money, markets), Robo (AI, tech products), Newsie (narrator bird),
The Crowd (the public).

Rules:
- Panel 1 sets up, 2 and 3 escalate, 4 is the punchline.
- "scene" describes only what is visible, in under 40 words, using cast names
  and simple objects. No real people's names, no brand names, no words to be
  written in the picture.
- "caption" is narrator voice, under 16 words, may name real people and
  companies, states only what the FACTS say. No quotation marks, no invented
  quotes.
- "realStory" is ${realStory}

Return JSON only:
{ "title": "under 7 words", "panels": [ { "scene": "", "cast": [""],
"caption": "" } x4 ], "realStory": "" }`;

export function scriptPrompt(input: ScriptInput): string {
  const header = `You write 4-panel comics for a daily crayon-drawn newspaper for adults.
Tone: playful, dry, kind. The humor comes from showing serious news as a
child's drawing. Never mean, never invents facts.
`;
  const formats = input.formats && input.formats.length ? input.formats.join("; ") : "none today";
  const body =
    input.kind === "meme"
      ? `
JOKE: ${input.headline}
FORMAT: ${formats}
FACTS (the only facts you may use): ${input.facts.join(" ")}

${CAST_AND_RULES("1 plain sentence that explains the trend.")}`
      : `
STORY: ${input.headline}
FACTS (the only facts you may use): ${input.facts.join(" ")}
OPTIONAL FORMATS you may borrow if one fits: ${formats}

${CAST_AND_RULES("2 plain sentences a reader could repeat to a friend.")}`;
  const repair = input.repair
    ? `

Your previous answer was:
${JSON.stringify(input.repair.previous)}
It failed these checks:
${input.repair.errors.map((e) => "- " + e).join("\n")}
Fix every problem and return the whole comic again.`
    : "";
  return header + body + repair;
}
