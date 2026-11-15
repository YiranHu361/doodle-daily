# Notes: where the build differs from the docs

## Thread 1 (scaffold)

- **Versions.** Expo SDK 58 (React Native 0.88, React 19.3), Expo Router 58,
  Convex 1.50, vitest 5, convex-test 0.0.71, TypeScript 6. `react-dom` is pinned
  to 19.3.0 so npm's peer resolution matches `react`.
- **Routes live in `app/`** at the repo root (as the thread ownership list says),
  not `src/app/` as the Expo template's AGENTS.md suggests.
- **Mock pictures are PNG, not JPEG.** The mock image provider draws a crayon-ish
  placeholder (sky, hills, sun, one shape per cast member) in plain TypeScript and
  encodes it as a 512 px PNG (about 10 KB, deflated with `CompressionStream`).
  Real panels from thread 2 should still follow LESSONS 25 (JPEG, quality 85).
- **Seed stories are sample content, not news.** Each one is sourced to
  "Doodle Daily sample desk" with an `example.com` link so nothing pretends to be
  a real report. The real issue comes from thread 2's pipeline.
- **`hidden` flag on comics.** Comics carry an optional `hidden` flag in addition
  to the `failed` status; public queries drop both (LESSONS 10, 11).
- **`isNew`** is derived from an optional `fresh` flag on the comic, which the
  "Draw a fresh one" path (thread 2) should set.
- **`editions:today`** looks back at most 7 issues for one with a visible comic;
  `editions:list` skips issues with no visible comics.
- **Device ids** must match `^[A-Za-z0-9-]{8,64}$` (the app uses a UUID).
  `reactions:toggle` throws `ConvexError("bad_device_id")` otherwise and
  `ConvexError("comic_not_found")` for a missing, failed or hidden comic.
- **Convex CLI wording.** `npx convex dev --once` with the deploy key prints
  "Provisioned a dev deployment" but it targets the existing
  `resilient-ostrich-674`; no new project was created.
- **Stubs.** `src/streak` keeps read comics in memory only (thread 4 persists them);
  `src/robo/Robo.tsx` is a blue square; `src/intro/Intro.tsx` calls `onDone` at once;
  `src/billing` returns a free reader and renders nothing.

## Thread 2 (backend pipeline)

- **Provider choice.** Real providers run when their key is set; `SCRIPT_PROVIDER=mock` or
  `IMAGE_PROVIDER=mock` forces the mock. The seed always uses the mocks, so seeding never
  costs money. `MOCK_IMAGE_DELAY_MS` shortens the mock's 1 to 3 s delay.
- **Anthropic (live docs, 2026-11-15).** The docs' examples send `anthropic-version: 2026-10-21`
  (this repo named no value), so that is what we send. Structured output is
  `output_config.format = { type: "json_schema", schema }` as LESSONS says. Opus 5.5 is
  $4 / $20 per million input / output tokens, which is what the spend estimate uses.
- **OpenAI images (live docs).** `/v1/images/edits` takes JSON with `images: [{ image_url }]`
  (an array of objects, at most 16), plus `output_format`, `output_compression` and `quality`.
  The edits default model is `gpt-image-2.5-sunburst`, so `model` is always sent. Edits need at
  least one image, so cast sheets use `/v1/images/generations`. There is a new optional
  `complexity` field, which we leave unset. `gpt-image-1` was shut down on 2026-10-23.
- **Convex runtime has no `DecompressionStream` or `CompressionStream`.** Downscaling a cast
  sheet to 512 px needs to inflate the PNG, so `convex/lib/inflate.ts` is a small inflater.
  Re-encoding falls back to stored (uncompressed) zlib, so each 512 px reference is about
  787 KB instead of about 500 KB. `cast:refreshRefs` rebuilds references from stored sheets.
- **No new dependencies.** Feeds are parsed with a small tested RSS/Atom reader in
  `convex/lib/feeds.ts` instead of `fast-xml-parser`, so `package.json` stays untouched while
  threads 3 and 4 run.
- **`npx convex codegen` pushes code to the deployment** with this CLI version, so crons go live
  the moment it runs.
- **`pipeline:drawFromBrief`** returns `{ ok: true, comicId } | { ok: false, reason:
  "bad_brief" | "unsafe" | "spend_cap" | "bad_script" }` rather than a bare id, so the
  commission flow can tell why it failed. The section is guessed from the brief (money or tech
  keywords, otherwise culture; memes for `kind: "meme"`). The comic goes to the top of the
  newest issue with `isNew: true`, like a fresh draw.
- **Fresh lock.** `drawFreshOne` holds the `fresh` lock until its comic is ready or failed
  (5 minute expiry), so a second press while it draws returns `busy`.
- **Hidden comics** still count as "in the paper" for the overlap check (their event is not
  picked again) but not toward a section's quota, so a rebuild backfills them.
- **Filter additions after the live run.** "charged over", smuggling and spying were getting
  through (an Nvidia story), and script validation now runs the same filter on captions and
  `realStory`. Scene validation also rejects warriors, knights, soldiers and similar people.
- **X budget.** At most 4 X runs per Pacific day, counted in `runs`. Two ingests started in the
  same second can both count as under the limit; the cron spacing makes that rare.

### Admin (all internal; run with `npx convex run`)

| Function | What it does |
| --- | --- |
| `ingest:run` | fetch every source now; returns items per source |
| `cast:drawSheets` / `cast:refreshRefs` / `cast:sheets` | draw the five sheets, rebuild 512 px refs, list URLs |
| `pipeline:buildEdition '{"limit":1,"skipIngest":true}'` | build today (both args optional) |
| `admin:listDay '{"date":"2026-11-15"}'` | every comic of a day, including hidden and failed, with errors |
| `admin:setHidden '{"comicId":"...","hidden":true}'` | hide or unhide one comic |
| `admin:retryComic '{"comicId":"..."}'` | redraw the missing panels of a failed comic (reserves the cap again) |
| `admin:wipeDay '{"date":"..."}'` | delete a day's issue and release its stories |
| `admin:spendToday` | images reserved and used, script calls, tokens, estimated USD |

## Thread 3 (app screens)

- **Launch flags.** Build-time env `EXPO_PUBLIC_FIXTURES`, `EXPO_PUBLIC_SKIP_INTRO`,
  `EXPO_PUBLIC_RESET`, `EXPO_PUBLIC_NOW` (ISO or ms), or a deep link such as
  `doodledaily://launch?fixtures=1&skipIntro=1&reset=1&now=2026-11-15T17:00:00Z`.
  Reset clears AsyncStorage and the device id. The fixed "now" drives the app's own
  clock (dates, older-issue banner); the streak store keeps its own injected clock.
- **Fixtures** live in `src/data/fixtures/`: an 8-comic issue (two per section), a
  6-comic yesterday, one locked back issue, local 192 px pictures, in-memory
  reactions, and a simulated "Draw a fresh one" that fills in panel by panel.
- **`pipeline:drawFreshOne`** gets the demo secret from `EXPO_PUBLIC_DEMO_SECRET` at build time;
  a build without it gets `bad_secret`, shown as "My crayon snapped. Try again." To build with
  it, write it to a git-excluded env file just for the build and delete it afterwards, never
  committing or printing it. `.capyignore` drops `.env*.local` from Revyl archives, so use
  `.env.production` (add it to `.git/info/exclude`):
  `printf 'EXPO_PUBLIC_DEMO_SECRET=%s\n' "$(npx convex env get DEMO_SECRET)" > .env.production`,
  then in the build `set -a && . ./.env.production && set +a` before `xcodebuild`.
- **`editions:list` / `editions:byDate`** are called without `deviceId` (the deployed
  validators reject extra args). Thread 5 should add it in `src/data/hooks.ts` when the
  server accepts it; the app already decodes and honours `locked`.
- **CelebrationHost** stays mounted once in the root layout rather than inside the
  Reader: the Reader is a pushed (non-modal) stack screen, so the root overlay draws
  above it and keeps playing after the Reader closes. The Reader and Share call
  `notifyReaderClosed()` and `notifyBusy()` from `src/streak`. Launch reset also calls the
  streak's `resetLocalState()` (combo, intro, device id).
- **testIDs** with an index are 0-based: `comicCard_0`, `panel_0`..`panel_3`,
  `archiveRow_0`. Extra ids: `wordmark`, `todayList`, `realStoryThumb_{i}`,
  `offlineBanner`, `olderIssueBanner`, `buildingBanner`, `emptySection`,
  `archiveEmpty`, `errorState`, `retryButton`, `backButton`, `toast`.
- **Tests** are vitest over pure modules (decode, chips, draw flow, reactions,
  read rule, connection state, flags, share layout). No React Native Testing Library:
  vitest here runs in the edge runtime and rendering RN components needs a jest-expo
  setup, which would change `package.json` that other threads share.
- **Image memory cap.** expo-image has no API to cap its memory cache; pictures use
  `cachePolicy="memory-disk"` with downscaling, so each is fetched once.

## Thread 5 (Whop payments)

- **Plain `fetch`, no SDK.** `convex/lib/whop.ts` calls `https://sandbox-api.whop.com/api/v1` and
  `convex/lib/webhook.ts` verifies Standard Webhooks signatures with WebCrypto (key = UTF-8 bytes of the
  whole `ws_…` secret, 5 minute tolerance, constant-time compare). Every Whop call goes through
  `whopConfig()`, which refuses unless `WHOP_ENVIRONMENT=sandbox`.
- **Webhook flow.** `POST /whop` verifies the raw body, dedupes on `webhook-id` in `webhookEvents`,
  answers 200 and schedules `billing:handleEvent`. Each handled event writes a one-line `note`
  (`billing:recentEvents` lists them). A live checkout sends both `membership.activated` (with the
  checkout metadata) and `payment.succeeded`; either one writes the entitlement.
- **Ending Plus.** Whop's live spec (2026-11-14-1) lists `membership.activated`, `membership.updated` and
  `membership.trial_ending_soon` but no `membership.deactivated`/`went_invalid`. The handler ends Plus on
  those if they ever arrive, on `payment.failed`, and on any `membership.*` whose status is not
  active/trialing; a lapsed `current_period_end` also ends Plus without any event.
- **`billing:status`** returns `{ plus, plusUntil, freeDrawsLeftToday, freezesLeftThisWeek, freeDaysEarned }`;
  `freeDrawsLeftToday` is `null` (unlimited) for Plus.
- **Free draws.** `pipeline:drawFreshOne` claims the day's free draw (Pacific date) before the lock and gives
  it back if no comic starts, so busy/no-story/cap answers do not use it up. The existing "second press"
  pipeline test now runs as a Plus reader.
- **Locked archive.** `editions:list`/`byDate` take an optional `deviceId`; without Plus, issues older
  than yesterday come back with `locked: true` (`byDate` returns the issue header with no comics).
  A missing `deviceId` counts as a free reader.
- **Combo pays for Plus.** `billing:claimComboReward` pays one day per milestone (the combo floored to a
  multiple of 7) per membership, at most once per 6 days, and stores the claim before calling
  `POST /memberships/{id}/extend` (a failed call releases the claim). The combo itself lives on the
  device, so the server trusts `comboDays`; the milestone and 6-day rules bound what a forged value buys.
- **Combo freeze.** `billing:useFreeze` records one forgiven day per week (Sunday-start) for Plus;
  `ComboFreeze` on Today applies it to the local streak when exactly yesterday was missed.
- **Refunds.** `POST /payments/{id}/refund` works in the sandbox and answers with the Payment
  (`substatus: "refunded"`), not a Refund object, so `commissions.refundId` holds the payment id.
  If the call fails the commission keeps `refundOwed: true`.
- **Shared deployment.** Threads deploy to the same `resilient-ostrich-674`; `npx convex dev --once`
  replaces every function and the schema, so deploy a merge of the open branches (the voice thread's
  schema adds fields to `comics`).
- **Waitlist dropped.** "Start your own paper" replaces the pitch screen and `waitlist:join`.

## Thread 7 (voice)

- **Model.** `gpt-4o-mini-tts` (alias of `gpt-4o-mini-tts-2025-12-15`) on `POST /v1/audio/speech`, voice
  `cedar`, `response_format: "mp3"`, delivery in the `instructions` field (base Newsie voice plus one line per
  section). OpenAI's docs mark every `/v1/audio/speech` model deprecated, shutting down **2027-01-06**; the
  replacement (`gpt-realtime-2.1-mini`) only works through the Realtime API, so narration needs a rewrite
  before then.
- **Schema.** Only two optional fields on `comics`: `panelAudioIds` (4 entries, null where missing) and
  `realStoryAudioId`.
- **Cap and lock without new tables.** Each `voice:ensure` that makes clips writes a `runs` row (`kind: "voice"`)
  whose note is JSON `{ comicId, clips }`; `clips` is reserved up front and lowered to the clips actually made
  when the run finishes. `DAILY_VOICE_CAP` (default 400) is checked against the sum for the Pacific day. The
  lock is a `locks` row named `voice:{comicId}` with a 3 minute expiry; a second caller gets
  `{ ok: true, status: "busy" }` and the live query delivers the clips.
- **`voice:ensure` returns** `{ ok: true, status: "ready" | "partial" | "busy" } | { ok: false, reason:
  "not_found" | "voice_cap" | "unavailable" }` (`unavailable` = no `OPENAI_API_KEY`). Each clip: 30 s timeout,
  at most 2 retries (1 s, then 3 s, or Retry-After up to 10 s); quota errors are not retried.
- **Live run (2026-11-15, issue 2, "Dinner Is Served, Rocket Style").** 5 clips in 4.6 s, all `audio/mpeg`,
  4.3 / 3.8 / 6.2 / 6.0 s per caption and 15.4 s for the Real story (35.6 s, 570 KB). At OpenAI's estimate of
  about $0.015 per minute of speech that is about **$0.01 per comic**; a full 400-clip day is roughly $1.
- **App.** `useNarration` stays quiet while VoiceOver runs, while the celebration shows, and in fixture mode.
  The setting lives in AsyncStorage under `dd.voice.v1` and is cleared by the reset flag. The silent switch is
  respected (`playsInSilentMode: false`). The `expo-audio` plugin is configured without microphone permission
  or background audio.


## Content filter (owner change, 2026-11-15)

- **Allowed now, with a source.** Business and legal news about public figures and companies (investigations,
  lawsuits, charges, arrests, convictions, firings, resignations) passes the filter for feed stories and pasted
  article links. When a comic is such a story, script validation makes every caption name the source (`X reports
  ...` or `according to X`); with a `source` option it must name that exact source. `pipeline.ts` does not pass
  `source` yet, so feed comics are held to the attribution form, not the exact outlet.
- **Refused everywhere** (`storyRefusal` in `convex/lib/filter.ts`): `tragedy` (death, violence, war, disasters,
  illness, abuse), `private_life` (sex, affairs, relationships, health, family of real people) and
  `private_person` (neighbours, co-workers, "local man", private citizens). Checked in that order.
- **Typed topics are unsourced.** A commission with no link that claims misconduct or legal trouble by a named
  person or a role such as CEO gets `needs_source`. Companies, products, ideas, the reader's own life and public
  figures' work are fine.
- **`commissions:start` refusals** keep `reason: "not_allowed"` (the app's `startFailMessage` is typed to the old
  list) and add `refusal`: `needs_source` | `private_life` | `tragedy` | `private_person`. `needs_source` also
  carries `message`: That one needs a source. Paste a link to the article and Robo will draw it. A link commission
  adds a fact naming the publisher (`og:site_name`, else the host) so the writer can name it.
- **`isSafeStory`** is `storyRefusal(text, { sourced: true }) === null`, so paper names and niches
  (`papers:create`) get the same looser rules.
## Thread 6 (polish and Revyl tests)

- **Card to Reader flight** (`src/components/Flight.tsx`). Native-stack screens cannot share elements, so the
  flight is a root overlay above the stack: the card measures its cover, the overlay lifts it, the Reader measures
  its panel-1 picture and the cover springs into it while the Reader fades in behind (stack `fade`, 200 ms). The
  Reader keeps panel 1's picture hidden and the caption faded until the flight lands. The overlay never takes
  touches, a flight with no target after 700 ms is dropped, and every flight is cleared after 1.6 s, so the Reader
  can never be left blank or untappable. Closing from panel 1 flies the picture back to the card it came from.
  Reduce Motion skips the flight and keeps the plain fade.
- **Wording.** People see "Create" where the docs say "Commission": the dock button, "Create a comic", status lines
  ("Creating your comic"), the toast, the CREATED badge, and "Created by a reader" as the Real story source for
  those comics. Internal names (the `commissions` table, functions, testIDs, Whop metadata `kind`) are unchanged.
  The stored `sourceName` of those comics is still "Commissioned by a reader"; the app relabels it. The Whop
  checkout page still shows the sandbox product name "Doodle Daily Commission".
- **Launch** plays once per app start (`src/components/launch.ts`): grid fade, wordmark tube flicker, Robo drop,
  dock slide. **Picture arrival** pulses the paper's backlight once when a picture first appears.
- **Icon and splash** are drawn from Robo's own SVG shapes with resvg (no new dependency in the app).
- **Revyl tests** live in `.revyl/tests/` in Revyl's YAML format (`revyl test create <name> --from-file …`). This
  machine has no Revyl CLI, so the flows were run step by step on a Revyl cloud iPhone 16 from Capy rather than
  through `revyl test run`. The Whop web checkout is hard to drive on the phone (the page scrolls as fields
  focus), so the paid run filled the same checkout URL in a desktop browser and returned to the app.
- **Spend at 1:45 pm (Pacific), 2026-11-15:** 85 images used of a 160 cap, 37 script calls, about $6.13.

