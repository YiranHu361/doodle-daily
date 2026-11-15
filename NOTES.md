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

