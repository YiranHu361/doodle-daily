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
