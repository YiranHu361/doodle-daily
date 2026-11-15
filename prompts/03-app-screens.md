# Thread 3: app screens (after thread 1 merges; parallel with 2 and 4)

Read `docs/BRIEF.md` sections 2, 5 and 7, all of `docs/DESIGN.md`, and
`docs/LESSONS.md` items 26 to 37. Build the reading experience to the design.

You own `app/`, `src/components/`, `src/theme/`, `src/data/` and `src/share/`.
Do not edit `convex/`, `src/streak/`, `src/robo/`, `src/intro/` or
`src/billing/`: import their exports as they are (thread 4 and 5 are replacing
the stubs behind the same signatures). Do not add public backend functions.

## Build

1. **Theme and primitives**: tokens, the three fonts, cut-corner shapes drawn
   with SVG, the neon tube border, the paper sheet with a section-coloured
   backlight, primary and secondary buttons, section tag, READ stamp, toast,
   banner. Neon never touches paper.
2. **Data hooks** over the Convex queries with defensive decoding, a cached last
   issue shown at once on launch, and connection state that does not report
   offline before the first connection.
3. **Today** as DESIGN section 4 describes: masthead with `<Robo />` and
   `<ComboPill />`, pinned chip row that fits five chips at 390 pt, lead card and
   row cards, READ stamps from `isRead`, placeholders for comics still being
   drawn that fill in live, footer with "Back issues", and the floating "Draw a
   fresh one" dock with its busy, success and failure states (every `reason` has
   its message from the copy table). Render `<CommissionButton />` beside the
   dock button and `<PaywallSheet />` when `needs_plus` comes back.
4. **Reader**: full-screen route, paged panels on paper with captions, progress
   pips, the Real story page with four tappable thumbnails, source name and
   "Open source" in the in-app browser, pull down from the top area to close.
   Call `markComicRead(comicId)` when the Real story page is reached after all
   four panels were seen and the comic is ready. Mount `<CelebrationHost />`.
5. **Reactions**: three tiles with live counts, optimistic toggle, rollback with
   a toast, disabled until counts arrive.
6. **Share**: render title, four panels with captions and the footer as one
   image 1080 px wide when Share is tapped, then open the share sheet.
7. **Back issues** list and issue screen, with the empty state; rows marked
   `locked` open `<PaywallSheet />` instead.
8. **States**: loading skeleton, building line, empty section, older issue
   banner, offline banner with cached issue, error with "Try again".
9. **Test hooks**: a fixtures mode (bundled JSON issue with at least 6 comics and
   small local pictures), skip intro, reset state (also clears the device id),
   and a fixed clock, switchable by environment variable or deep link.
10. testIDs and accessibility labels exactly as BRIEF section 5 lists them.

## Tests

Unit tests (jest or vitest with React Native Testing Library): decoding drops a
bad comic and keeps the issue; chip filtering; the draw flow for every refusal
reason, a timeout, and a comic that vanishes; optimistic reactions including a
stale server value; "read" requires all four panels and a ready comic; the
share layout size.

## Prove it

- `npm run check` passes.
- Build the iOS app on Revyl as a standalone simulator build, with the JavaScript
  bundled and `EXPO_PUBLIC_CONVEX_URL` set, then install it on a cloud iPhone.
  Check in plain English: "Today shows the wordmark DOODLE DAILY and five
  chips"; "tapping Money shows only Money comics"; "opening the first comic
  shows panel 1 with a caption under the picture"; "swiping left four times
  shows THE REAL STORY and a source name"; "tapping the first reaction raises
  its count by one"; "Share opens the share sheet"; "Back issues opens a list
  or a friendly empty state".
- Attach screenshots of Today, a panel, the Real story page and Back issues to
  the pull request, and say what you could not verify.
