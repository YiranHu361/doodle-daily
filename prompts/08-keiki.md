# Thread 8: Text Newsie a link (Keiki, iMessage)

Start from the latest `main` (threads 1 to 4 and voice are merged). Read
`docs/KEIKI-FINDINGS.md` first: it records what was really tried against our Keiki
organization and it wins over the rest of this file. Then `docs/BRIEF.md` and
`docs/LESSONS.md`. Runs in parallel with thread 5 (Whop).

State of play:
- Keiki is connected to this Capy project over its MCP server (no key needed for
  setup). The agent already exists: `external_ref: doodle-daily-newsie`. Update it
  with `deploy_agent`; do not create a second one.
- When the findings were written the organization was in sandbox mode (no tools,
  no shared number). It has since been unlocked with the hackathon code. **First
  thing to do: re-run the probes** (a webhook tool call, `get_agents_shared_line`,
  `send_file`) and record what works now. If tools still do not run, stop and tell
  me exactly what Keiki says is missing.
- `KEIKI_API_KEY` is a project variable (a live key; never print it). Set it on the
  Convex deployment with `npx convex env set`. Our backend needs it only for the
  notice endpoint.

## What the person gets

They text an article link (or a few words, "the Fed meeting") to the Doodle Daily
agent on iMessage. Newsie answers at once in one short line ("On it. Sharpening
crayons."), and about 30 seconds later sends the finished 4-panel comic: the four
pictures with their captions, the one-line real story, the source link, and a link
that opens the comic in the app. Texting "today" or "what's the news" sends today's
lead comic the same way. Anything else gets a one-line friendly nudge on what to send.

## Build

1. **Keiki agent**: create one agent named Newsie with a short system prompt in the
   paper's voice (warm, wry, never invents facts, never more than two short lines),
   on the shared iMessage number from the hackathon signup. Register our Convex
   HTTP actions below as its tools. Put the join code or number in `README.md`.
2. **Backend, new file `convex/keiki.ts`** plus two routes in `convex/http.ts`
   (thread 5 also adds a route there: add only your own lines and rebase if it
   moved):
   - `POST /keiki/<secret>/commission`: input a URL or topic and the sender's id
     (`context.userId` or `context.phone`). Keiki documents no signature for cloud
     webhook tools, so put a long random secret in the URL path, store it with
     `npx convex env set KEIKI_TOOL_SECRET`, and refuse any request without it
     (compare in constant time). The same goes for the other two routes. Limit each sender to 2
     comics a day and count pictures against the existing daily image cap. Start
     the comic through the pipeline's internal entry point for a brief
     (`pipeline:drawFromBrief`, from thread 2) with `kind: "commission"`, and
     return a commission id straight away.
   - `POST /keiki/status`: given a commission id, return `drawing`, `failed` with a
     friendly reason, or `ready` with the title, the four picture URLs and captions,
     the real story, the source link and the app link.
   - `POST /keiki/today`: today's lead comic in the same `ready` shape.
   - Delivery: the commission tool returns fast with an id and the agent says
     "On it". When the comic is ready (or has failed), our backend calls Keiki's
     notice endpoint for that conversation (`POST /api/v1/developer/agents/{id}/notice`
     with the sender's phone); the notice starts an agent turn, the agent calls
     `status` and sends the result. The notice text is paraphrased by the agent, so
     keep the facts in the tool result, not in the notice.
   - The story safety rules in LESSONS apply to texted links too: refuse stories
     about death, violence, crime, private people, with a kind one-line reply.
3. **Sending pictures**: `send_file` delivers a file from the agent's sandbox, so
   the agent first downloads the four picture URLs into its sandbox, then sends
   them in order with their captions. If that does not work on the shared number,
   send the four captions as text plus the app link, and say so in `NOTES.md`.
4. **App**: a small "Text Newsie" row in Today's footer that opens Messages to the
   agent with the join text prefilled (the join code and link come from the agent's
   shared line; read them with `get_agents_shared_line`). Keep the edit to the Today screen small.
5. Later hook, not now: where a commission should cost $1, the reply would carry a
   Whop checkout link first. Leave a clearly named function for it and do not build it.

## Tests

convex-test: a bad signature is refused; the per-sender limit and the image cap
refuse with a friendly reason; a commission moves from drawing to ready and status
returns four URLs; an unsafe story is refused; `today` returns the lead comic.

## Prove it

- `npm run check` passes.
- A real round trip: send a link to the agent through whichever test channel Keiki
  gives you (their API, Telegram, or the iMessage number) and show the reply text
  and the returned pictures. Report how long it took and what it cost.
- One pull request. Say what you verified, what you did not, and exactly what a
  human must do to try it from their own iPhone.
