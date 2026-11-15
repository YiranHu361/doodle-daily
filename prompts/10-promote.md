# Thread 10: Promote (sponsored comics for creators and founders)

Start from the latest `main`. Read `docs/WHOP.md`, `docs/WHOP-FINDINGS.md` and
`docs/LESSONS.md`. The demo is in under three hours: aim to open the pull request
within 45 minutes, working end to end first and polish second. Thread 9 runs in
parallel in `convex/freshPool.ts`, `convex/lib/dto.ts`, `app/index.tsx`; rebase on
`main` before you open the pull request.

## Why

Whop's judges asked for a fuller way to pay to be in the paper. Today "Create"
draws a private $1 comic from a topic or a link. Promote turns that into a small
ad product: a creator or a founder buys a comic in a section of today's paper,
briefs Robo by typing or by voice, and gives one link that backs up what they say.

## What the person gets (the Create sheet becomes a short flow)

1. **Who is it for**: three big choices. "I'm a creator" (a channel, a newsletter,
   a course, a drop), "I'm a founder" (a product, a launch, a raise), "Just for me"
   (the existing private Create flow, unchanged).
2. **Pick a section** to appear in: Tech, Money, Culture or Memes. One line each on
   what runs there.
3. **Tell Robo**: a chat. One text box and a microphone button. The person says what
   they want to promote in their own words. Robo (the agent) answers with one short
   follow-up question at a time, at most three in total, only for what is still
   missing: the name, what it is, what is new, and what readers should do next.
   Founder and creator get slightly different questions. Then Robo shows a brief
   card: name, one-line pitch, the claims it will draw, the call to action. The
   person can edit by answering again ("change the pitch to…").
4. **The link that backs it up** (required, last question): Robo opens the page and
   checks each claim against it. The card then shows every claim with a tick
   (the page says so) or a cross (the page does not say so). Crossed claims are
   left out of the comic. If the page cannot be read, say so, let the person give
   another link, or continue with the comic marked "claims not checked" (reuse the
   existing `unverified` frame).
5. **Pay and publish**: "Publish in Tech for $1" opens Whop hosted checkout, the
   same way Create does today. After the payment webhook the comic is drawn and
   published in the chosen section of today's issue, for every reader.
6. **Done**: "Your comic is live in Tech" with a Share button (reuse `src/share`).

## How a promoted comic appears

- Public (no `owner`), `kind: "commission"`, in the chosen `section`, with new
  optional comic fields `sponsored: true`, `sponsorName`, `sponsorKind`
  (`creator` | `founder`), `ctaLabel`. `sourceUrl` is the backing link and
  `sourceName` is its site name.
- Placed second in today's issue (right under the lead), never in the lead slot.
  Thread 9 guarantees a fresh draw never replaces a comic with `sponsored: true`.
- Today card and Reader show a clear "SPONSORED" tag and "by <name>". The Reader's
  last page shows the call to action as a button that opens the backing link, and
  the line "Claims checked against <site>" (or "Claims not checked").
- Add the new fields to the DTO and the client decoder.

## Backend (new file `convex/promote.ts`; extend the commission path, do not copy it)

- `promote:reply` (public action): args `{ deviceId, persona, section, messages }`
  where messages are `{ role: "user" | "robo", text }[]`. Calls Claude with
  structured output and returns either `{ kind: "question", text }` or
  `{ kind: "brief", brief: { name, pitch, claims: string[] (max 4), cta } }`.
  After three questions it must return a brief. Use a fast model for these chat
  turns (`claude-haiku-5-5`) with a short timeout and one retry; keep
  `claude-opus-5-5` for the comic script.
- `promote:transcribe` (public action) plus a public mutation that returns a Convex
  upload URL: the app records audio, uploads it, and the action sends it to
  OpenAI's speech-to-text endpoint (`POST /v1/audio/transcriptions`; check the live
  docs for the current model), returns the text and deletes the audio file. Cap the
  clip at 60 seconds and 2 MB.
- `promote:check` (public action): args `{ link, brief }`. Fetch the page with the
  helpers already in `convex/commissions.ts`; ask Claude which claims the page text
  supports; return `{ readable, site, claims: { text, backed }[] }`.
- `promote:start` (public action): validates everything again on the server
  (re-run the check; never trust the client's ticks), stores the promo on the
  commission record (optional `promo` object: persona, section, name, pitch,
  backed claims, cta), creates the Whop checkout with the existing plan and
  metadata, and returns the checkout URL. The existing webhook, draw, watch, fail
  and refund steps then run as they do for Create, and the draw step publishes the
  comic as described above when the commission has a `promo`.
- Limits per device: 40 chat turns, 10 transcriptions, 10 link checks a day.
  Constant-time errors, friendly messages.
- Ad rules, checked on the brief and again on the script: the existing
  `storyRefusal` rules, plus refuse gambling, adult content, weapons, drugs,
  political campaigns, medical or financial promises ("guaranteed returns",
  "cures"), and anything that attacks a named person or competitor. A refusal is
  one kind line and nothing is charged.
- Add every new public function to the public allow-list test.

## App (`src/billing/`, plus the small card and reader edits)

- Rework `src/billing/Commission.tsx` into the steps above (split into files as
  you like). The button on Today keeps the label "Create".
- Microphone: record with `expo-audio` (already installed, works in Expo Go; ask
  for the microphone permission the first time, with a clear message if refused).
  Tap to start, tap to stop, show a level or a timer, then the transcript appears
  in the text box for the person to edit before sending. Voice is optional: typing
  always works.
- The keyboard must never cover the text box or the send button (see the fix in
  pull request 13).
- Keep test ids: `commissionButton`, `promoPersona-creator`, `promoPersona-founder`,
  `promoPersona-me`, `promoSection-<section>`, `promoInput`, `promoMic`, `promoSend`,
  `promoLink`, `promoBrief`, `promoPay`, `promoShare`.

## Tests

convex-test with the model, the page fetch and Whop stubbed: reply returns a
question then a brief and never more than three questions; check marks unsupported
claims and `start` drops them even if the client says they are backed; an
unreadable link yields an `unverified` promo; ad rules refuse; a paid promo ends as
a public, sponsored comic in the chosen section, second in the issue; an unpaid one
never appears; limits refuse. Unit tests for the step logic of the sheet.

## Prove it

- `npm run check` passes.
- You may deploy your branch to the shared Convex deployment (rebase on `main`
  first; a phone is using it live, so only additive changes). Prove with real
  calls: one `promote:reply` conversation that ends in a brief, one `promote:check`
  against a real product page with one true and one invented claim, and one
  `promote:transcribe` of a short generated clip. Report the seconds each took.
  Do not make a payment. Tell me any environment variable I must set (none
  expected: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and the Whop variables are set).
- One pull request. Say what you verified and what you did not. Skip Revyl for
  this thread; I will run it on a phone myself.
