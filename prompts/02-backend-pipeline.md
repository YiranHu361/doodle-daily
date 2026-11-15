# Thread 2: backend pipeline (after thread 1 merges; parallel with 3 and 4)

Read `docs/BRIEF.md` sections 3, 4 and 7 and all of `docs/LESSONS.md` (items 1
to 25 and the provider and feed tables are requirements for this thread). Check
each provider's current API docs before writing a call.

You own `convex/` (except `http.ts`, `billing.ts`, `commissions.ts`,
`waitlist.ts`) and `scripts/`. Do not touch `app/` or `src/`. Do not change the
shape of any existing public function.

## Build

1. **Real providers** behind the interfaces from thread 1, chosen by environment
   variable with `mock` as the default when a key is missing: Anthropic for picks
   and scripts (`claude-opus-5-5`, raw `fetch`, structured JSON output), OpenAI
   for panels (`gpt-image-2.6-flare`, `/v1/images/edits`, reference images, 1024
   px, JPEG quality 85). Keys are already on the deployment: `ANTHROPIC_API_KEY`,
   `OPENAI_API_KEY`, `X_BEARER_TOKEN`, `FINNHUB_API_KEY`. Never log a key or a
   provider response that may echo one.
2. **Cast sheets**: an internal action that draws one reference sheet per cast
   member (style block plus "character reference sheet, front view and side view,
   plain paper background" plus the description in BRIEF section 3), stores them
   in Convex storage and records them in the `cast` table. Run it once; look at
   the five pictures; redraw any that is off model. Panels attach the sheets of
   the cast in that panel (up to 3), downscaled to 512 px.
3. **Ingest**: every source in the LESSONS feed table plus Hacker News, Finnhub,
   X trends and posts, and Imgflip names, with the limits stated there.
4. **Editor, writer, artist** using the prompts in BRIEF section 4 verbatim, the
   code-level story filter, script validation with one repair round, one
   scheduled action per panel, retries, the per-comic deadline, panel slots, the
   reserve-and-refund image cap (`DAILY_IMAGE_CAP`), and the build lock.
5. **`pipeline:buildEdition`** (internal): 3 tech, 2 money, 2 culture, 2 memes;
   safe to run twice; removes an issue where everything failed.
6. **Crons**: ingest every 2 hours; build when the Pacific hour is 6, 7 or 8.
7. **`pipeline:drawFreshOne`** (public action, shape in BRIEF): checks
   `DEMO_SECRET` in constant time, the fresh lock and the cap, takes the best
   unused story from the last 36 hours (running one fallback pick behind the
   lock if none), returns once the script exists; the comic goes to the top of
   the newest issue with `isNew: true`.
8. **An internal `pipeline:drawFromBrief`** that thread 5 will call for paid
   commissions: `{ headline, facts: string[], sourceName, sourceUrl, kind }` in,
   comic id out, same validation, cap and deadline.
9. **Admin helpers** (internal): list a day's comics, hide and unhide a comic,
   retry a failed comic, wipe a day, today's spend with a cost estimate.

## Tests

Everything in LESSONS marked (test) for the backend, plus: feed parsing for RSS
and Atom samples; the story filter; script validation cases; a full build on
mock providers that ends published without relying on any safety-net timer; a
panel that fails three times hides its comic and refunds the cap; drawFreshOne
with wrong secret, busy, cap reached, and no story.

## Prove it

- `npm run check` passes offline.
- On the deployment: run ingest (report how many items per source), then one
  real comic end to end and look at all four pictures against BRIEF section 3;
  then `pipeline:buildEdition` for today. Report: comics made, any hidden and
  why, time taken, images used, estimated cost. Stop if the day's images pass 60.
- Call `pipeline:drawFreshOne` once with the secret and confirm a second call
  right away returns `busy`.
- One pull request with the "verified / not verified" note. List every place
  the live provider docs differed from the docs in this repo.
