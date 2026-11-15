import { fetchText, sleep } from "../lib/http";
import { isQuotaError, isRetryableStatus } from "../lib/retry";
import { editorPrompt, memePickPrompt, scriptPrompt } from "./prompts";
import type { MemePick, Pick, Script, ScriptProvider, Usage } from "./types";

export const ANTHROPIC_MODEL = "claude-opus-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2026-10-21";

type JsonSchema = Record<string, unknown>;

const SCRIPT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    panels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          scene: { type: "string" },
          cast: { type: "array", items: { type: "string", enum: ["Boss Blob", "Coin", "Robo", "Newsie", "The Crowd"] } },
          caption: { type: "string" },
        },
        required: ["scene", "cast", "caption"],
        additionalProperties: false,
      },
    },
    realStory: { type: "string" },
  },
  required: ["title", "panels", "realStory"],
  additionalProperties: false,
};

const PICK_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          itemIds: { type: "array", items: { type: "string" } },
          headline: { type: "string" },
          whyFunny: { type: "string" },
          score: { type: "number" },
        },
        required: ["itemIds", "headline", "whyFunny", "score"],
        additionalProperties: false,
      },
    },
  },
  required: ["groups"],
  additionalProperties: false,
};

const MEME_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    jokes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          theJoke: { type: "string" },
          format: { anyOf: [{ type: "string" }, { type: "null" }] },
          sourceUrls: { type: "array", items: { type: "string" } },
          score: { type: "number" },
        },
        required: ["topic", "theJoke", "format", "sourceUrls", "score"],
        additionalProperties: false,
      },
    },
  },
  required: ["jokes"],
  additionalProperties: false,
};

type CallResult = { ok: true; json: unknown; usage: Usage } | { ok: false; reason: string; usage?: Usage };

export async function callClaude(
  apiKey: string,
  prompt: string,
  schema: JsonSchema,
  opts: { timeoutMs: number; retries: number; maxTokens: number },
): Promise<CallResult> {
  let last: CallResult = { ok: false, reason: "not attempted" };
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    if (attempt > 0) await sleep(2000 * Math.pow(2, attempt - 1));
    const res = await fetchText(API_URL, {
      method: "POST",
      timeoutMs: opts.timeoutMs,
      maxBytes: 2 * 1024 * 1024,
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": API_VERSION },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: opts.maxTokens,
        messages: [{ role: "user", content: prompt }],
        output_config: { format: { type: "json_schema", schema } },
      }),
    });
    if (!res.ok) {
      const kind = errorType(res.text);
      last = { ok: false, reason: res.status ? `anthropic HTTP ${res.status}${kind ? " " + kind : ""}` : `anthropic ${res.error}` };
      if (res.status && (isQuotaError(res.status, res.text) || !isRetryableStatus(res.status))) return last;
      continue;
    }
    return parseMessage(res.text);
  }
  return last;
}

function errorType(body: string): string {
  try {
    const t = (JSON.parse(body) as { error?: { type?: unknown } }).error?.type;
    return typeof t === "string" ? t : "";
  } catch {
    return "";
  }
}

export function parseMessage(body: string): CallResult {
  let msg: { content?: { type?: string; text?: string }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  try {
    msg = JSON.parse(body);
  } catch {
    return { ok: false, reason: "anthropic sent malformed JSON" };
  }
  const usage = { inputTokens: msg.usage?.input_tokens ?? 0, outputTokens: msg.usage?.output_tokens ?? 0 };
  if (msg.stop_reason === "refusal") return { ok: false, reason: "model refused", usage };
  if (msg.stop_reason === "max_tokens") return { ok: false, reason: "answer cut off at max_tokens", usage };
  const text = msg.content?.find((b) => b.type === "text")?.text;
  if (typeof text !== "string") return { ok: false, reason: "no text block in answer", usage };
  try {
    return { ok: true, json: JSON.parse(text), usage };
  } catch {
    return { ok: false, reason: "answer was not valid JSON", usage };
  }
}

export function anthropicProvider(apiKey: string): ScriptProvider {
  return {
    name: "anthropic",
    async writeScript(input) {
      const r = await callClaude(apiKey, scriptPrompt(input), SCRIPT_SCHEMA, { timeoutMs: 60_000, retries: 1, maxTokens: 3000 });
      if (!r.ok) return r;
      return { ok: true, script: r.json as Script, usage: r.usage };
    },
    async pickStories(input) {
      const r = await callClaude(apiKey, editorPrompt(input), PICK_SCHEMA, { timeoutMs: 40_000, retries: 1, maxTokens: 4000 });
      if (!r.ok) return r;
      const groups = (r.json as { groups?: unknown }).groups;
      if (!Array.isArray(groups)) return { ok: false, reason: "editor answer has no groups", usage: r.usage };
      return { ok: true, picks: groups as Pick[], usage: r.usage };
    },
    async pickMemes(input) {
      const r = await callClaude(apiKey, memePickPrompt(input), MEME_SCHEMA, { timeoutMs: 40_000, retries: 1, maxTokens: 4000 });
      if (!r.ok) return r;
      const jokes = (r.json as { jokes?: unknown }).jokes;
      if (!Array.isArray(jokes)) return { ok: false, reason: "meme answer has no jokes", usage: r.usage };
      return { ok: true, picks: jokes as MemePick[], usage: r.usage };
    },
  };
}
