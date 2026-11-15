# Thread 1: scaffold (run first; merge before starting any other thread)

Read `docs/BRIEF.md`, `docs/DESIGN.md` sections 1 to 3, and `docs/LESSONS.md`
items 1 to 7 and 26 to 28. Build the skeleton every later thread works inside.
This repo is empty apart from the docs; write everything fresh.

## Build

1. **Expo app**: Expo Router, TypeScript strict, iPhone portrait, dark status
   bar. Install the libraries named in BRIEF section 5. Add `npm run check`
   (typecheck + eslint + vitest), `npm run typecheck`, `npm run lint`, `npm test`.
2. **Convex**: connect to the existing deployment
   `https://resilient-ostrich-674.convex.cloud` with the deploy key in the
   `CONVEX_DEPLOY_KEY` environment variable (`npx convex deploy` or
   `npx convex dev --once`; do not create a new project). Commit
   `convex/_generated`.
3. **Schema** for items, stories, comics (4 panels each with scene, cast,
   caption, optional image id), editions, reactions, reaction counts, cast,
   spend, runs. Index every lookup the public queries need.
4. **Public functions** exactly as BRIEF section 4: `editions:today`,
   `editions:byDate`, `editions:list`, `reactions:toggle`, `reactions:counts`,
   with `args` and `returns` validators. A test must fail if any other function
   is public (allow-list; later threads extend the list).
5. **Provider interfaces** for the script model and the image model with `mock`
   implementations only (deterministic 4-panel script from a story's facts; a
   generated placeholder picture after 1 to 3 s). Real providers come in thread 2.
6. **Seed**: an internal function that writes yesterday's and today's issue (6
   comics across the four sections, mock pictures stored in Convex storage, one
   comic left mid-draw when asked) so the app has data. Run it once on the
   deployment.
7. **App shell**: `ConvexProvider`, the three fonts loaded, a theme module with
   every colour and type token from DESIGN, a device id created once and kept in
   AsyncStorage, and a first **Today** screen that lists the live issue from
   `editions:today` (cover picture, section tag, title) and updates reactively.
8. **Stubs with fixed signatures** so later threads can work in parallel without
   touching each other's files. Create them now, minimal but working:
   - `src/streak/index.ts`: `useCombo(): { current, best, todayCleared, atRisk, comicsRead }`, `markComicRead(comicId: string): void`, `isRead(comicId: string): boolean`
   - `src/streak/ui.tsx`: `<ComboPill onPress />`, `<ComboSheet visible onClose />`, `<CelebrationHost />`
   - `src/robo/Robo.tsx`: `<Robo pose="idle" | "cheer" | "drawing" | "sleepy" | "glitch" size />` (a plain blue square for now)
   - `src/intro/Intro.tsx`: `<Intro onDone />` (renders nothing and calls `onDone`)
   - `src/billing/index.ts`: `usePlus(): { plus: boolean, freeDrawsLeftToday: number }` (returns free), `<PaywallSheet visible onClose />`, `<CommissionButton />` (both render nothing)
9. `README.md` gets a "How to run" section; `NOTES.md` starts with anything that
   differs from the docs.

## Ownership

This thread owns the whole repo. After it merges: thread 2 owns `convex/`
(except `http.ts`, `billing.ts`, `commissions.ts`, `waitlist.ts`) and `scripts/`;
thread 3 owns `app/`, `src/components/`, `src/theme/`, `src/data/`, `src/share/`;
thread 4 owns `src/streak/`, `src/robo/`, `src/intro/`; thread 5 owns
`src/billing/` and the four Convex files above. Threads 2, 3 and 4 run in
parallel after this merges; 5 after 2 and 3; 6 last.

## Tests

vitest with `convex-test`: each public query on the seeded data (hidden and
failed comics never appear, panels always 4, order ascending), reaction toggle
on, switch, off, two devices, bad args; the public allow-list test; pure helpers
(Pacific date, URL normalising).

## Prove it

- `npm run check` passes with no network and no keys.
- `npx convex run editions:today` on the deployment returns the seeded issue.
- Build the iOS app on Revyl as a standalone simulator build, with the JavaScript
  bundled and `EXPO_PUBLIC_CONVEX_URL` set, then install it on a cloud iPhone.
  Check in plain English: "Today shows at least 6 comic titles with pictures";
  "the first title matches the seeded issue".
- Turn on Revyl proof of changes for this repository.
- Open one pull request. In it, say what you verified and what you did not.
