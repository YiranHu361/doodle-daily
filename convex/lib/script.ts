import { CAST_NAMES, isCastName } from "./cast";
import { isLegalStory, storyRefusal } from "./filter";
import { sentenceCount, wordCount } from "./text";

export type ScriptPanel = { scene: string; cast: string[]; caption: string };
export type Script = { title: string; panels: ScriptPanel[]; realStory: string };

const QUOTES = /["\u201C\u201D\u201E\u00AB\u00BB]|(?:^|\s)['\u2018\u2019][^'\u2018\u2019]+['\u2018\u2019](?:\s|[.,!?]|$)/;
const BUBBLES = /\b(speech|thought)?\s*(bubble|bubbles|balloon|balloons)\b/i;
const WRITING =
  /\b(sign|signs|signboard|banner|banners|placard|placards|poster|posters|billboard|billboards|label|labels|labeled|labelled|caption|captions|headline|headlines|text|texts|word|words|letter|letters|lettering|writing|written|writes|reads|reading|says|saying|logo|logos|newspaper headline|chalkboard text|screen showing text)\b/i;
const PEOPLE =
  /\b(man|men|woman|women|person|people|boy|girl|child|children|kid|kids|guy|lady|gentleman|ceo|executive|president|senator|politician|celebrity|actor|actress|singer|player|athlete|human|humans|crowd of people|audience members|warrior|warriors|knight|knights|soldier|soldiers|astronaut|astronauts|silhouette|stick figure|stick figures)\b/i;
const CAST_WORDS = new Set(
  CAST_NAMES.flatMap((n) => n.split(" ")).map((w) => w.toLowerCase()),
);
const COMMON_CAPS = new Set(["The", "A", "An", "In", "On", "At", "As", "And", "But", "With", "After", "Before", "New", "How", "Why", "What", "When", "Who", "Is", "Are", "To", "Of", "For", "By", "From", "Its", "It", "This", "That", "Says", "Will", "Can", "Could", "Up", "Down", "Out", "Over"]);

export function headlineNames(headline: string): string[] {
  const names = new Set<string>();
  for (const m of headline.matchAll(/\b[A-Z][a-zA-Z0-9'’&.-]*[a-zA-Z0-9]\b|\b[A-Z]\b/g)) {
    const word = m[0].replace(/['’]s$/, "");
    if (word.length < 2 || COMMON_CAPS.has(word) || CAST_WORDS.has(word.toLowerCase())) continue;
    names.add(word);
  }
  return [...names];
}

const ATTRIBUTION = /\baccording to \S+|\S+ (?:reports?|reported|says|said|writes|wrote|alleges|alleged)\b/i;

const REFUSAL_TOPICS = {
  tragedy: "death, violence, disasters, illness or abuse",
  private_life: "sex or someone's private life",
  private_person: "a private individual",
  needs_source: "an unsourced claim",
} as const;

export function validateScript(script: unknown, opts: { kind: "news" | "meme" | "commission"; headline: string; source?: string }): string[] {
  const errors: string[] = [];
  const s = script as Partial<Script> | null;
  if (!s || typeof s !== "object") return ["answer is not an object"];
  if (typeof s.title !== "string" || !s.title.trim()) errors.push("title is missing");
  else if (wordCount(s.title) >= 7) errors.push("title must be under 7 words");
  if (!Array.isArray(s.panels) || s.panels.length !== 4) {
    errors.push("there must be exactly 4 panels");
    return errors;
  }
  const names = headlineNames(opts.headline);
  s.panels.forEach((p, i) => {
    const n = i + 1;
    if (!p || typeof p !== "object") {
      errors.push(`panel ${n} is not an object`);
      return;
    }
    if (typeof p.caption !== "string" || !p.caption.trim()) errors.push(`panel ${n} caption is missing`);
    else {
      if (wordCount(p.caption) >= 16) errors.push(`panel ${n} caption must be under 16 words`);
      if (QUOTES.test(p.caption)) errors.push(`panel ${n} caption must not contain quotation marks`);
    }
    if (!Array.isArray(p.cast) || p.cast.length < 1 || p.cast.length > 3) errors.push(`panel ${n} must use 1 to 3 cast members`);
    else {
      for (const c of p.cast) if (typeof c !== "string" || !isCastName(c)) errors.push(`panel ${n} cast member ${String(c)} is not one of the five`);
    }
    if (typeof p.scene !== "string" || !p.scene.trim()) {
      errors.push(`panel ${n} scene is missing`);
      return;
    }
    if (wordCount(p.scene) >= 40) errors.push(`panel ${n} scene must be under 40 words`);
    const sceneWithoutCast = CAST_NAMES.reduce((acc, name) => acc.split(name).join(" "), p.scene);
    const named = names.filter((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(sceneWithoutCast));
    if (named.length) errors.push(`panel ${n} scene names ${named.join(", ")} from the headline; show them as a cast member instead`);
    if (BUBBLES.test(p.scene)) errors.push(`panel ${n} scene mentions a bubble or balloon`);
    if (WRITING.test(sceneWithoutCast)) errors.push(`panel ${n} scene mentions written words, signs or text`);
    if (PEOPLE.test(sceneWithoutCast)) errors.push(`panel ${n} scene shows a person who is not a cast member`);
  });
  const words = [s.title, s.realStory, ...s.panels.map((p) => `${p?.caption ?? ""} ${p?.scene ?? ""}`)].filter((t) => typeof t === "string").join(" ");
  const refusal = storyRefusal(words, { sourced: true });
  if (refusal) errors.push(`the comic touches a banned topic (${REFUSAL_TOPICS[refusal]})`);
  else if (isLegalStory(`${opts.headline} ${words}`)) {
    const source = opts.source?.trim().toLowerCase();
    s.panels.forEach((p, i) => {
      const caption = typeof p?.caption === "string" ? p.caption : "";
      const named = source ? caption.toLowerCase().includes(source) : ATTRIBUTION.test(caption);
      if (!named) errors.push(`panel ${i + 1} caption must name the source, as in ${opts.source?.trim() || "the outlet"} reports ..., because this is a legal or business story about real people`);
    });
  }
  const wanted = opts.kind === "meme" ? 1 : 2;
  if (typeof s.realStory !== "string" || !s.realStory.trim()) errors.push("realStory is missing");
  else if (sentenceCount(s.realStory) !== wanted) errors.push(`realStory must be exactly ${wanted} sentence${wanted === 1 ? "" : "s"}`);
  return errors;
}

export function cleanScript(script: Script): Script {
  return {
    title: script.title.trim(),
    realStory: script.realStory.trim(),
    panels: script.panels.map((p) => ({ scene: p.scene.trim(), cast: [...new Set(p.cast)], caption: p.caption.trim() })),
  };
}
