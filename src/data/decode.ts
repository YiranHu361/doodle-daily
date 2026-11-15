import type { Comic, ComicStatus, Edition, Panel, Section } from "./types";

const SECTIONS: readonly Section[] = ["tech", "money", "culture", "memes"];
const STATUSES: readonly ComicStatus[] = ["scripted", "drawing", "ready"];
const KINDS: readonly Comic["kind"][] = ["news", "meme", "commission"];

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function decodePanel(raw: unknown): Panel | null {
  if (!isObj(raw)) return null;
  const caption = str(raw.caption);
  if (caption === null) return null;
  return {
    scene: str(raw.scene) ?? "",
    caption,
    cast: Array.isArray(raw.cast) ? raw.cast.filter((c): c is string => typeof c === "string") : [],
    imageUrl: str(raw.imageUrl),
  };
}

export function decodeComic(raw: unknown): Comic | null {
  if (!isObj(raw)) return null;
  const _id = str(raw._id);
  const title = str(raw.title);
  const section = str(raw.section) as Section | null;
  const status = str(raw.status) as ComicStatus | null;
  if (!_id || !title || !section || !SECTIONS.includes(section) || !status || !STATUSES.includes(status)) return null;
  if (!Array.isArray(raw.panels) || raw.panels.length !== 4) return null;
  const panels = raw.panels.map(decodePanel);
  if (panels.some((p) => p === null)) return null;
  const kind = str(raw.kind) as Comic["kind"] | null;
  return {
    _id,
    section,
    kind: kind && KINDS.includes(kind) ? kind : "news",
    title,
    realStory: str(raw.realStory) ?? "",
    sourceName: str(raw.sourceName) ?? "",
    sourceUrl: str(raw.sourceUrl) ?? "",
    status,
    order: num(raw.order) ?? 0,
    createdAt: num(raw.createdAt) ?? 0,
    isNew: raw.isNew === true,
    panels: panels as Panel[],
  };
}

export function decodeEdition(raw: unknown): Edition | null {
  if (!isObj(raw)) return null;
  const _id = str(raw._id);
  const date = str(raw.date);
  const number = num(raw.number);
  if (!_id || !date || number === null) return null;
  const comics = (Array.isArray(raw.comics) ? raw.comics : [])
    .map(decodeComic)
    .filter((c): c is Comic => c !== null)
    .sort((a, b) => a.order - b.order);
  return { _id, date, number, status: raw.status === "building" ? "building" : "published", comics };
}
