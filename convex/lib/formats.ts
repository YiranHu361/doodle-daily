export type MemeFormat = { key: string; description: string };

export const EVERGREEN_FORMATS: MemeFormat[] = [
  { key: "two-buttons", description: "a character sweats while choosing between two buttons that are both bad ideas" },
  { key: "distracted", description: "a character walking with a partner turns to stare at something shinier passing by" },
  { key: "expanding-brain", description: "four steps of an idea, each one sillier while the character looks more enlightened" },
  { key: "this-is-fine", description: "a character sips a drink calmly while everything around them is going wrong" },
  { key: "drake", description: "a character waves away one option, then happily points at a slightly different one" },
  { key: "change-my-mind", description: "a character sits at a little table, confidently daring everyone to argue" },
  { key: "galaxy-plan", description: "a character presents a plan on an easel; the last step makes everyone stare" },
  { key: "expectation-reality", description: "the same scene twice: what was promised, then what actually showed up" },
  { key: "is-this", description: "a character points at something ordinary and confidently names it as something else" },
  { key: "surprised", description: "a character does the obvious thing, then is shocked by the obvious result" },
  { key: "everyone-then-me", description: "the crowd does one thing calmly while one character does it in a wildly extra way" },
  { key: "starter-pack", description: "a character is shown with the handful of objects that always come with a trend" },
];

const TEMPLATE_KEYS: [RegExp, string][] = [
  [/two buttons/i, "two-buttons"],
  [/distracted/i, "distracted"],
  [/expanding brain|galaxy brain/i, "expanding-brain"],
  [/this is fine/i, "this-is-fine"],
  [/drake|hotline/i, "drake"],
  [/change my mind/i, "change-my-mind"],
  [/gru'?s plan/i, "galaxy-plan"],
  [/expectation|reality/i, "expectation-reality"],
  [/is this a pigeon/i, "is-this"],
  [/surprised pikachu|surprised/i, "surprised"],
  [/everyone.*then me|nobody:/i, "everyone-then-me"],
  [/starter pack/i, "starter-pack"],
];

export function formatKeyFor(name: string | null | undefined): string | null {
  if (!name) return null;
  const direct = EVERGREEN_FORMATS.find((f) => f.key === name.trim().toLowerCase());
  if (direct) return direct.key;
  return TEMPLATE_KEYS.find(([re]) => re.test(name))?.[1] ?? null;
}

export function describeFormat(key: string | null | undefined): string | null {
  if (!key) return null;
  return EVERGREEN_FORMATS.find((f) => f.key === key)?.description ?? null;
}

export function formatsForPicker(imgflipNames: string[]): string[] {
  const keys = new Set<string>();
  for (const name of imgflipNames) {
    const key = formatKeyFor(name);
    if (key) keys.add(key);
  }
  for (const f of EVERGREEN_FORMATS) keys.add(f.key);
  return [...keys];
}
