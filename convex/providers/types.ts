export type Section = "tech" | "money" | "culture" | "memes";

export type Usage = { inputTokens: number; outputTokens: number };

export type ScriptInput = {
  section: Section;
  kind: "news" | "meme" | "commission" | "paper-sample";
  headline: string;
  facts: string[];
  formats?: string[];
  unverified?: boolean;
  repair?: { previous: unknown; errors: string[] };
};

export type ScriptPanel = { scene: string; cast: string[]; caption: string };

export type Script = { title: string; panels: ScriptPanel[]; realStory: string };

export type ScriptResult = { ok: true; script: Script; usage?: Usage } | { ok: false; reason: string; usage?: Usage };

export type PickCandidate = { id: string; source: string; title: string; summary: string };

export type PickInput = { section: Section; n: number; items: PickCandidate[]; alreadyInPaper: string[] };

export type Pick = { itemIds: string[]; headline: string; whyFunny: string; score: number };

export type PickResult = { ok: true; picks: Pick[]; usage?: Usage } | { ok: false; reason: string; usage?: Usage };

export type TrendInput = { topic: string; posts: { text: string; likes: number; url: string }[] };

export type MemePickInput = { trends: TrendInput[]; formats: string[]; alreadyInPaper: string[] };

export type MemePick = { topic: string; theJoke: string; format: string | null; sourceUrls: string[]; score: number };

export type MemePickResult = { ok: true; picks: MemePick[]; usage?: Usage } | { ok: false; reason: string; usage?: Usage };

export interface ScriptProvider {
  readonly name: string;
  writeScript(input: ScriptInput): Promise<ScriptResult>;
  pickStories(input: PickInput): Promise<PickResult>;
  pickMemes(input: MemePickInput): Promise<MemePickResult>;
}

export type Reference = { bytes: Uint8Array; contentType: string };

export type PanelInput = {
  prompt: string;
  scene: string;
  cast: string[];
  section: Section;
  seed: string;
  references?: Reference[];
  format?: "jpeg" | "png";
};

export type ImageResult =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; reason: string; retryable: boolean; retryAfterMs?: number };

export interface ImageProvider {
  readonly name: string;
  drawPanel(input: PanelInput): Promise<ImageResult>;
}
