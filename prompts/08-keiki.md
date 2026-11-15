# Thread 8: Text Newsie a link (Keiki, iMessage)

Start from the latest `main` (threads 1, 2 and 3 are merged). Read `docs/BRIEF.md`,
`docs/LESSONS.md` and `docs/WHOP.md`. Runs in parallel with thread 5 (Whop) and
thread 7 (voice). The project variable `KEIKI_API_KEY` is set; never print it.

First read, in this order: https://consumermobilehackathon.com/keiki (it has
ready-made setup prompts; follow them), https://onkeiki.com/setup.md,
https://onkeiki.com/llms.txt and the docs it links (channels, cloud agents, tools,
files, notices). Where those disagree with this file, they win; write the
difference in `NOTES.md`.

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
   - `POST /keiki/commission`: input a URL or topic and the sender's id. Check the
     request really comes from Keiki (signature or shared secret, as their docs
     describe; store the secret with `npx convex env set`). Limit each sender to 2
     comics a day and count pictures against the existing daily image cap. Start
     the comic through the pipeline's internal entry point for a brief
     (`pipeline:drawFromBrief`, from thread 2) with `kind: "commission"`, and
     return a commission id straight away.
   - `POST /keiki/status`: given a commission id, return `drawing`, `failed` with a
     friendly reason, or `ready` with the title, the four picture URLs and captions,
     the real story, the source link and the app link.
   - `POST /keiki/today`: today's lead comic in the same `ready` shape.
   - If Keiki tool calls time out before 30 seconds, use whichever of these their
     docs support: the tool returns quickly and the agent checks status again, or
     our backend pushes the result with Keiki's notice endpoint when the comic is
     ready. Pick the one that works on the shared number and say which.
   - The story safety rules in LESSONS apply to texted links too: refuse stories
     about death, violence, crime, private people, with a kind one-line reply.
3. **Sending pictures**: use Keiki's file sending for the four panels (one message
   each, in order, or one message if it supports several). If the shared number
   cannot send files, send the app link and the four captions as text, and say so
   in `NOTES.md`.
4. **App**: a small "Text Newsie" row in Today's footer that opens Messages to the
   agent with the join text prefilled. Keep the edit to the Today screen small.
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
