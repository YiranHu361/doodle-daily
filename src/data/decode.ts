import type {
  Comic,
  ComicStatus,
  DrawReason,
  DrawResult,
  Edition,
  EditionSummary,
  Panel,
  ReactionCounts,
  ReactionKind,
  Section,
} from "./types";

const SECTIONS: readonly Section[] = ["tech", "money", "culture", "memes"];
const STATUSES: readonly ComicStatus[] = ["scripted", "drawing", "ready"];
const KINDS: readonly Comic["kind"][] = ["news", "meme", "commission"];
const REACTIONS: readonly ReactionKind[] = ["lol", "wow", "yikes"];
const DRAW_REASONS: readonly DrawReason[] = ["bad_secret", "no_story", "spend_cap", "busy", "needs_plus"];

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
    unverified: raw.unverified === true,
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

function decodeSummary(raw: unknown): EditionSummary | null {
  if (!isObj(raw)) return null;
  const _id = str(raw._id);
  const date = str(raw.date);
  const number = num(raw.number);
  if (!_id || !date || number === null) return null;
  return {
    _id,
    date,
    number,
    status: raw.status === "building" ? "building" : "published",
    comicCount: num(raw.comicCount) ?? 0,
    coverUrl: str(raw.coverUrl),
    locked: raw.locked === true,
  };
}

export function decodeSummaries(raw: unknown): EditionSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(decodeSummary)
    .filter((s): s is EditionSummary => s !== null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.number - a.number));
}

export function decodeCounts(raw: unknown): ReactionCounts | null {
  if (!isObj(raw)) return null;
  const mine = str(raw.mine) as ReactionKind | null;
  return {
    lol: Math.max(0, num(raw.lol) ?? 0),
    wow: Math.max(0, num(raw.wow) ?? 0),
    yikes: Math.max(0, num(raw.yikes) ?? 0),
    mine: mine && REACTIONS.includes(mine) ? mine : null,
  };
}

export function decodeDrawResult(raw: unknown): DrawResult | null {
  if (!isObj(raw)) return null;
  if (raw.ok === true) {
    const comicId = str(raw.comicId);
    return comicId ? { ok: true, comicId } : null;
  }
  const reason = str(raw.reason) as DrawReason | null;
  return raw.ok === false && reason && DRAW_REASONS.includes(reason) ? { ok: false, reason } : null;
}
