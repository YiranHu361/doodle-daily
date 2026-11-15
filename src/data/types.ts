export type Section = "tech" | "money" | "culture" | "memes";
export type ComicStatus = "scripted" | "drawing" | "ready";
export type ReactionKind = "lol" | "wow" | "yikes";

export type Panel = { scene: string; caption: string; cast: string[]; imageUrl: string | null };

export type Comic = {
  _id: string;
  section: Section;
  kind: "news" | "meme" | "commission";
  title: string;
  realStory: string;
  sourceName: string;
  sourceUrl: string;
  status: ComicStatus;
  order: number;
  createdAt: number;
  isNew: boolean;
  unverified?: boolean;
  panels: Panel[];
};

export type Edition = {
  _id: string;
  date: string;
  number: number;
  status: "building" | "published";
  comics: Comic[];
};

export type EditionSummary = {
  _id: string;
  date: string;
  number: number;
  status: "building" | "published";
  comicCount: number;
  coverUrl: string | null;
  locked: boolean;
};

export type ReactionCounts = { lol: number; wow: number; yikes: number; mine: ReactionKind | null };

export type DrawReason = "bad_secret" | "no_story" | "spend_cap" | "busy" | "needs_plus";
export type DrawResult = { ok: true; comicId: string } | { ok: false; reason: DrawReason };
