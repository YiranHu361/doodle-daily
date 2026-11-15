#!/usr/bin/env node
import { readFileSync } from "node:fs";

const key = process.env.KEIKI_API_KEY;
const secret = process.env.KEIKI_TOOL_SECRET;
const site = (process.env.CONVEX_SITE_URL ?? "https://resilient-ostrich-674.convex.site").replace(/\/$/, "");
if (!key || !secret) {
  console.error("Set KEIKI_API_KEY and KEIKI_TOOL_SECRET (npx convex env get KEIKI_TOOL_SECRET).");
  process.exit(1);
}

const systemPrompt = readFileSync(new URL("./newsie-prompt.md", import.meta.url), "utf8").trim();
const toolUrl = (name) => `${site}/keiki/${secret}/${name}`;

const body = {
  external_ref: "doodle-daily-newsie",
  agent: { name: "Newsie", system_prompt: systemPrompt, features: { sandbox: true } },
  channels: [{ type: "api" }],
  tools: [
    {
      name: "make_comic",
      description: "Start drawing a four-panel Doodle Daily comic about a news story the person texted. Returns ok with a commission_id at once; the comic takes about a minute and a platform notice says when it is done. Returns ok: false with a reply to send when it cannot.",
      inputSchema: {
        type: "object",
        properties: { request: { type: "string", description: "Exactly what the person texted: an article link, or a few words about the story." } },
        required: ["request"],
      },
      executionType: "webhook",
      webhookUrl: toolUrl("commission"),
    },
    {
      name: "get_comic_status",
      description: "Look up a comic started with make_comic. Answers drawing, failed with a reason to send, or ready with the title, four pictures (imageUrl and caption, in order), realStory, sourceUrl and appLink.",
      inputSchema: {
        type: "object",
        properties: { commission_id: { type: "string", description: "The commission_id from make_comic or from the notice." } },
        required: ["commission_id"],
      },
      executionType: "webhook",
      webhookUrl: toolUrl("status"),
    },
    {
      name: "get_today",
      description: "Today's lead Doodle Daily comic, in the same ready shape as get_comic_status.",
      inputSchema: { type: "object", properties: {} },
      executionType: "webhook",
      webhookUrl: toolUrl("today"),
    },
  ],
};

const res = await fetch("https://onkeiki.com/api/v1/developer/deployments", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const out = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Deploy failed (${res.status}):`, JSON.stringify(out));
  process.exit(1);
}
const agent = out.deployment?.agent ?? {};
console.log(JSON.stringify({ created: out.created, agentId: agent.id, name: agent.name, channels: out.channels, missingSecrets: out.deployment?.missingSecrets }, null, 2));
console.log(`Next: npx convex env set KEIKI_AGENT_ID ${agent.id}`);
