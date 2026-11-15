export type Section = "tech" | "money" | "culture" | "memes";

export type ScriptInput = {
  section: Section;
  kind: "news" | "meme" | "commission";
  headline: string;
  facts: string[];
  formats?: string[];
};

export type ScriptPanel = { scene: string; cast: string[]; caption: string };

export type Script = { title: string; panels: ScriptPanel[]; realStory: string };

export type ScriptResult = { ok: true; script: Script } | { ok: false; reason: string };

export interface ScriptProvider {
  readonly name: string;
  writeScript(input: ScriptInput): Promise<ScriptResult>;
}

export type PanelInput = {
  prompt: string;
  scene: string;
  cast: string[];
  section: Section;
  seed: string;
};

export type ImageResult =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; reason: string; retryable: boolean; retryAfterMs?: number };

export interface ImageProvider {
  readonly name: string;
  drawPanel(input: PanelInput): Promise<ImageResult>;
}
