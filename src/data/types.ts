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
  panels: Panel[];
};

export type Edition = {
  _id: string;
  date: string;
  number: number;
  status: "building" | "published";
  comics: Comic[];
};
