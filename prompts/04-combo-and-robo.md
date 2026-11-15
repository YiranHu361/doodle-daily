# Thread 4: combo, celebration and Robo (after thread 1 merges; parallel with 2 and 3)

Read `docs/BRIEF.md` section 6, `docs/DESIGN.md` sections 1 to 7 (especially
Motion, Robo and Copy), and `docs/LESSONS.md` items 36 and 37. This is the habit
loop: the "Duolingo for news" part.

You own `src/streak/`, `src/robo/` and `src/intro/`. Keep the exported names and
signatures that thread 1 created (other threads import them); you may add
optional props. Do not edit `app/`, `src/components/`, `convex/` or
`src/billing/`. If you need a theme token that is missing, define it locally and
list it in the pull request.

## Build

1. **Streak store** (pure logic plus an AsyncStorage adapter): read days as
   local `YYYY-MM-DD`, read comic ids, current combo, best combo, at-risk (today
   not cleared and it is after 6 pm local), combo ended (shown once), week strip
   and month grid data with a heat level per day, celebration armed and played
   flags that carry their day. Clock and time zone are injected. Stored data
   decodes with defaults for missing fields; unreadable data is copied to a
   backup key instead of being overwritten. `markComicRead` is idempotent.
   Leave a hook for a "freeze" (a forgiven missed day) that thread 5 will turn
   on: `applyFreeze(day)` and a `frozen` flag on week and month cells.
2. **`useCombo()`**, `markComicRead`, `isRead` backed by the store, refreshing
   when the app returns to the foreground and when the day changes.
3. **`<ComboPill />`**: bolt and number in a cut-corner tube; volt when today is
   cleared, dim outline when not, pink flicker when at risk.
4. **`<ComboSheet />`**: Robo and status line, big bolt and number, "High score"
   and "Comics read" tiles, "This week" strip, month grid where a cleared day is
   lit volt with a small bolt, "How it works".
5. **`<CelebrationHost />`**: listens for the first completed comic of the day
   and plays the celebration in DESIGN section 5, once per day, 4 idle seconds
   after the Real story page is reached or when the Reader closes, never while
   the in-app browser or share sheet is open, never for a day other than the one
   that earned it. Expose `notifyReaderClosed()`, `notifyBusy(isBusy)` for the
   Reader to call (thread 3 will wire them; keep them safe to never be called).
   A tap before the end skips to the resting state; "Keep reading" dismisses.
6. **`<Robo />`** in `react-native-svg` on a 100 x 100 grid with the five poses
   and idle blinking; honours Reduce Motion.
7. **`<Intro />`**: three skippable cards (the news, drawn in crayon; one comic
   a day keeps the combo; every comic has its real story), shown on first launch.
8. Banners' data: at-risk and combo-ended messages from the copy table, exposed
   from `useCombo()` for Today to render.

## Tests

Time-travel unit tests: one comic clears the day; consecutive days grow the
combo; today not yet cleared keeps yesterday's combo "at risk"; a missed day
resets to 0 and keeps the best; re-reading counts once in "Comics read" but still
clears a new day; midnight and a time-zone change; a celebration armed at 23:59
is not played at 00:02 for the new day, and the new day can still earn its own;
older stored data missing fields decodes; garbage is backed up; heat levels and
their colours; a frozen day keeps the combo.

## Prove it

- `npm run check` passes.
- Build the iOS app on Revyl as a standalone simulator build, with the JavaScript
  bundled and `EXPO_PUBLIC_CONVEX_URL` set, then install it on a cloud iPhone.
  Check in plain English: "the combo pill shows 0 on a fresh install"; "after
  opening a comic, swiping through four panels and waiting on the last page, a
  screen saying DAY CLEARED appears with the number 1"; "after Keep reading, the
  combo pill shows 1"; "tapping the pill shows Your combo with today lit".
- Attach screenshots of each Robo pose, the celebration at rest and the combo
  sheet to the pull request, and say what you could not verify.
