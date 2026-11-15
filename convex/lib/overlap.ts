const STOP = new Set(
  "a an the and or but of in on at to for from by with as is are was were be been it its this that these those after before over under into out up down new says say said will would can could may might than then there their they them we you he she his her our your more most less least about amid just only not no yes what why how when who which while also has have had do does did get gets got make makes made first last year years day days week weeks month months today report reports".split(" "),
);

function words(text: string): string[] {
  return text.match(/[A-Za-z][A-Za-z0-9'’-]+/g) ?? [];
}

export function properNames(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of words(text)) {
    const bare = w.replace(/['’]s$/, "");
    if (/^[A-Z]/.test(bare) && !STOP.has(bare.toLowerCase()) && bare.length > 1) out.add(bare.toLowerCase());
  }
  return out;
}

export function distinctiveWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of words(text)) {
    const lower = w.toLowerCase().replace(/['’]s$/, "");
    if (lower.length >= 4 && !STOP.has(lower)) out.add(lower);
  }
  return out;
}

export function sharesEvent(a: string, b: string): boolean {
  const namesA = properNames(a);
  const namesB = properNames(b);
  const sharedNames = [...namesA].filter((n) => namesB.has(n));
  if (sharedNames.length === 0) return false;
  const wordsA = distinctiveWords(a);
  const wordsB = distinctiveWords(b);
  return [...wordsA].some((w) => wordsB.has(w) && !sharedNames.includes(w));
}
