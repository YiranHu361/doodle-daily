# Keiki findings (spike, 2026-11-15)

Research and setup only; no app or Convex code changed. Sources: onkeiki.com/setup.md, /llms.txt,
/docs/mcp.md, /docs/cloud-agents.md, /docs/channels.md, /docs/partner-deployments.md,
/docs/external-harness.md, /openapi.json, consumermobilehackathon.com/keiki. Calls were made over the
Keiki MCP server (`https://onkeiki.com/mcp`, OAuth, no key) as owner of "Yiran's Organization",
which has **no plan** (sandbox).

Legend: **works**, **fails** (with the error), **not tried**, **docs only** (read, not exercised).

## Headline

The sandbox org can create and chat with an agent, but every turn runs **capped**: a cheap model,
few steps and **no tools at all** (our webhook tools are never called). The shared iMessage number
also needs a plan. So Newsie can be built and its prompt tested now, but nothing in thread 8's
backend flow can be proven end to end until the org has a plan (Starter: $1/mo promo, $20 credits).

## Setup and agent

| Item | Result |
| --- | --- |
| Connect over MCP | **works**. `current_context` → owner, org `07d001fb-…`. |
| `list_agent_templates` | **works**. orchid, office-hours, event-companion, dental-front-desk, realtor-concierge, study-coach, salon-front-desk, property-desk, restaurant-host, instinct, night-drop, company-brain, leaf, agency-desk, and more. None is news, so Newsie uses an inline spec. |
| `deploy_agent` Newsie, no channels | **works**. `external_ref: doodle-daily-newsie`, agent id `21564241-8b64-4521-8de9-d3c6d301314b`, harness `flue`, `missingSecrets: []`, 3 probe webhook tools. Left deployed. |
| `talk_to_agent` "hey who are you?" | **works** (1.7 s), in-voice reply. Response has `sandboxCapped: true`: "no plan, so the turn ran capped … no MCP tools instead of Newsie's own". |
| `talk_to_agent` with an article link | **fails**: 36.8 s, empty reply ("The agent sent no text back."), no tool call. |
| `talk_to_agent` "run the slow test" | **fails**: model tried `doodle_daily_paper.slow_probe`, replied "the tool wasn't available"; our server got no request. |
| `list_channel_types` | **works**: imessage (no fields), telegram (bot_token), whatsapp, slack, agentmail. |
| `get_lines` | **works**: `[]`. |

## Questions from the brief

**1. How an agent calls an outside HTTPS tool.** **docs only**; the real call **fails** in sandbox (tools disabled).
- Declared in `deploy_agent.tools[]`: `{ name (^[a-z][a-z0-9_]{0,62}$), description, inputSchema,
  executionType: "webhook", webhookUrl, timeout? (integer, unit undocumented), policy? }`.
  Sending `tools` replaces the deployment's whole developer tool list.
- Request: `POST webhookUrl` with JSON `{ "input": {...}, "context": {...} }`. `context` carries
  `userId` / `phone` (sender id), `attachments[<id>].url` (15 min), `internal`, `messages`.
  Documented headers: `X-Orchid-User-Id`, and `X-Orchid-Internal: true` on dashboard-steered turns.
  Response: any JSON, read by the model; an optional `delivered` field records what our backend
  sent the contact itself.
- **Auth / signature: not documented for cloud webhook tools**, and the tool schema has no
  `headers` field. Signed requests (`Keiki-Signature: t=…,v1=HMAC-SHA256(secret, "t.rawBody")`,
  plus `Keiki-Signature-Ed25519` against Keiki's JWKS) exist only for the **external harness** and
  event webhooks. Options: an unguessable secret in the webhook URL path, checked in Convex; or our
  tools behind an MCP connection with `auth_mode: "headers"` and `{{secret.NAME}}` (needs the
  `sandbox` and `mcp` features and a plan). Ask in #keiki which they intend.
- Timeout: the per-tool `timeout` default is undocumented. The turn budget is `turn_deadline_ms`,
  30 000–900 000 ms, default 5 min.

**2. Can a tool take 30 s?** **not tried**: tools never ran, and my 30 s probe endpoint got zero
calls. The docs suggest yes (5 min turns; `talk_to_agent` already ran a 36.8 s turn). Safest plan
anyway: return a commission id fast, let the agent say "On it", then push the result (item 4).

**3. Pictures (`send_file`).** **docs only**. `send_file` "delivers a **sandbox** file", so the
agent needs the sandbox feature and must put the image in its sandbox first. iMessage lines can send
files (100 MB). The shared number runs sandbox orgs under Live Test limits ("a small model, no tools,
no memory"), so **no `send_file` on the shared number without a plan**. Fallback: captions + app link.

**4. Backend push into an existing conversation.**
- Notice: `POST /api/v1/developer/agents/{agentId}/notice` `{ text, phone?, line? }` (REST needs
  an API key; MCP tool `post_agents_notice`). **works** over MCP without `phone`: `202 {started:
  true, conversations: 0}`, because Newsie has no real conversations (`talk_to_agent` threads don't
  count). The text is **never delivered verbatim**: it starts an agent turn and the agent decides what
  to say, which fits "comic ready → agent calls status → sends it". With `phone`: **not tried**.
- Takeover send: `POST /conversations/:phone/messages` is verbatim, but only while a teammate has
  taken the conversation over (409 otherwise). Not suitable. **not tried**.

**5. Joining the shared number.** **fails**: `get_agents_shared_line` → `{ join: null,
planRequired: true }`. With a plan, the agent's Channels tab shows a join code like `K-7QF2MD` and
"Copy link", which opens Messages prefilled with a sample text plus the code. A contact texts the code
once; one agent per contact per shared number; the agent cannot text first; no contact card; no groups.

**6. Sandbox limits.** Turns capped (cheap model, few steps, no tools, no MCP). Shared number needs a
plan, except a Live Test while `/onboarding` is open (and 15 min after, max a day after the code
first shows). Every channel except a bought iMessage line answers `plan_required`; the `channels`
OAuth scope needs a plan. iMessage caps: 7,000 sent and 50 new conversations per line per UTC day,
pooled across every org on the shared number. Bought lines cost $300/mo on Starter.

**7. API key needed?** Not for anything above: MCP OAuth covered deploy, chat, notice and reads. A
scoped developer key (`sk_test_…` in sandbox, `Authorization: Bearer` or `x-api-key`, from
Settings → API keys) is needed only when **our Convex backend** calls REST, i.e. the notice endpoint.
`KEIKI_API_KEY` is **not** set in this project today (only Convex and Whop variables are).

## What must change in prompts/08-keiki.md

1. Drop "The project variable `KEIKI_API_KEY` is set": a human must create it (Settings → API keys)
   and add it. Agent setup goes through the Keiki MCP server, which needs no key.
2. State the plan requirement up front: without one, tools never run, the shared number has no join
   code, and the "real round trip" in Prove it is impossible. Make a plan (or a hackathon perk) a
   precondition, or downgrade Prove it to a text-only `talk_to_agent` check.
3. Build step 1: Newsie already exists; update it with `deploy_agent` and `external_ref:
   doodle-daily-newsie` (inline spec, no news template), declaring the Convex tools there.
4. "Check the request really comes from Keiki (signature …)": Keiki documents no signature for cloud
   webhook tools. Use a secret path segment in `webhookUrl` (stored with `npx convex env set`), or
   the external harness if signed requests are required.
5. Delivery: pick the notice endpoint (`phone` = the conversation's `context.phone`), called from
   Convex when the comic is ready; it is agent-paraphrased, not verbatim. Key the 2-a-day limit on
   `context.userId` / `context.phone`.
6. Pictures: `send_file` needs the agent's sandbox feature and a plan; say the agent downloads the
   four picture URLs into its sandbox, else text + app link. Drop "one message if it supports
   several" (not documented for iMessage).
7. "Text Newsie" row: the prefilled text and code come from the Channels tab "Copy link"
   (`K-XXXXXX`), available only once the shared number is enabled.
8. Reading list: name docs/mcp.md, cloud-agents.md, channels.md, partner-deployments.md and
   openapi.json; "tools, files, notices" are not separate pages.
