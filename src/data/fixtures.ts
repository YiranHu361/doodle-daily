import { addDays, now, pacificDate } from "./clock";
import { decodeEdition } from "./decode";
import { applyToggle } from "./reactions";
import raw from "./fixtures/issue.json";
import type { Comic, DrawResult, Edition, EditionSummary, ReactionCounts, ReactionKind } from "./types";

export const FIXTURE_IMAGES: Record<string, number> = {
  "fixture:0": require("./fixtures/panel0.png"),
  "fixture:1": require("./fixtures/panel1.png"),
  "fixture:2": require("./fixtures/panel2.png"),
  "fixture:3": require("./fixtures/panel3.png"),
  "fixture:4": require("./fixtures/panel4.png"),
  "fixture:5": require("./fixtures/panel5.png"),
  "fixture:6": require("./fixtures/panel6.png"),
  "fixture:7": require("./fixtures/panel7.png"),
};

type Store = { today: Edition; yesterday: Edition; counts: Map<string, ReactionCounts>; drawing: boolean };

let store: Store | null = null;
let version = 0;
const listeners = new Set<() => void>();

function build(): Store {
  const date = pacificDate(now());
  const base = decodeEdition({ ...raw, date })!;
  const yesterday: Edition = {
    ...base,
    _id: "fixture-edition-yesterday",
    date: addDays(date, -1),
    number: base.number - 1,
    comics: base.comics.slice(0, 6).map((c, i) => ({ ...c, _id: `fixture-old-${i}`, order: i })),
  };
  const counts = new Map<string, ReactionCounts>();
  [...base.comics, ...yesterday.comics].forEach((c, i) => counts.set(c._id, { lol: 3 + (i % 4), wow: 1 + (i % 3), yikes: i % 2, mine: null }));
  return { today: base, yesterday, counts, drawing: false };
}

function get(): Store {
  store ??= build();
  return store;
}

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

export function resetFixtures(): void {
  store = null;
  emit();
}

export const fixtureStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  version: () => version,
  today: (): Edition => get().today,
  byDate: (date: string): Edition | null => [get().today, get().yesterday].find((e) => e.date === date) ?? null,
  list: (): EditionSummary[] => {
    const { today, yesterday } = get();
    const locked: EditionSummary = {
      _id: "fixture-edition-locked",
      date: addDays(today.date, -2),
      number: today.number - 2,
      status: "published",
      comicCount: 6,
      coverUrl: "fixture:5",
      locked: true,
    };
    return [today, yesterday].map((e) => ({
      _id: e._id,
      date: e.date,
      number: e.number,
      status: e.status,
      comicCount: e.comics.length,
      coverUrl: e.comics[0]?.panels[0].imageUrl ?? null,
      locked: false,
    })).concat(locked);
  },
  counts: (comicId: string): ReactionCounts => get().counts.get(comicId) ?? { lol: 0, wow: 0, yikes: 0, mine: null },
  async toggle(comicId: string, kind: ReactionKind): Promise<null> {
    await new Promise((r) => setTimeout(r, 300));
    get().counts.set(comicId, applyToggle(fixtureStore.counts(comicId), kind));
    emit();
    return null;
  },
  async drawFreshOne(): Promise<DrawResult> {
    await new Promise((r) => setTimeout(r, 800));
    const s = get();
    if (s.drawing) return { ok: false, reason: "busy" };
    s.drawing = true;
    const template = s.today.comics[s.today.comics.length - 1];
    const id = `fixture-fresh-${Date.now()}`;
    const fresh: Comic = {
      ...template,
      _id: id,
      title: "Robo draws a fresh one",
      status: "scripted",
      order: -1,
      createdAt: now(),
      isNew: false,
      panels: template.panels.map((p) => ({ ...p, imageUrl: null })),
    };
    const update = (fn: (c: Comic) => Comic) => {
      s.today = { ...s.today, comics: s.today.comics.map((c) => (c._id === id ? fn(c) : c)) };
      emit();
    };
    setTimeout(() => {
      s.today = { ...s.today, comics: [fresh, ...s.today.comics] };
      s.counts.set(id, { lol: 0, wow: 0, yikes: 0, mine: null });
      emit();
    }, 1000);
    for (let p = 0; p < 4; p += 1) {
      setTimeout(() => update((c) => ({ ...c, status: "drawing", panels: c.panels.map((panel, i) => (i === p ? { ...panel, imageUrl: template.panels[p].imageUrl } : panel)) })), 2500 + p * 1500);
    }
    setTimeout(() => {
      update((c) => ({ ...c, status: "ready", isNew: true }));
      s.drawing = false;
    }, 2500 + 4 * 1500);
    return { ok: true, comicId: id };
  },
};
