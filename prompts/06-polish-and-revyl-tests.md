# Thread 6: polish and Revyl tests (last, after everything else merges)

Read `docs/DESIGN.md` sections 5 and 8, `docs/BRIEF.md` section 8, and the
"verified / not verified" notes in the earlier pull requests. The app works;
make it feel finished and prove it on a phone. You may touch any file, but keep
changes small and do not change public function shapes.

## Polish (in this order; stop adding and start testing by 5:00 pm)

1. **Card to Reader**: the shared flight of the paper cover into panel 1 and
   back, with the fade fallback kept for Reduce Motion and for any case where it
   is not reliable. It must never leave the Reader untappable.
2. **Celebration** timing against the DESIGN timeline; confetti; haptics.
3. **Draw a fresh one** and **Commission** states: busy text with pulsing dots,
   the dashed drawing card, the NEW or "Commissioned" badge popping in, and
   scrolling Today to the new comic.
4. **Launch** sequence and the intro.
5. **Picture arrival** fade with backlight pulse; skeleton shimmer.
6. Layout on a small phone (375 pt wide) and at the largest text size: nothing
   clipped, the chip row scrolls, the caption never drops below 17 pt.
7. **Accessibility pass**: labels on every control, panel images labelled with
   their scene, reading order, the celebration as a modal, 44 pt targets,
   Reduce Motion and Increase Contrast behaviour.
8. A real app icon (Robo's face on bg.night with a volt bolt) and splash.

## Revyl tests (plain-English steps, kept in the repo and run on a cloud iPhone)

Build the iOS app on Revyl as a standalone simulator build, with the JavaScript
bundled and `EXPO_PUBLIC_CONVEX_URL` set, install it on a cloud iPhone, and
write one Revyl test per flow:

1. **Read and clear the day.** Fresh install. Skip the intro. Open the first
   comic. Swipe left through four panels. Expect "THE REAL STORY" and a source
   name. Wait. Expect "DAY CLEARED" and the number 1. Tap "Keep reading". Close
   the comic. Expect the first card to be marked READ and the combo pill to show 1.
2. **React.** Open a comic. Note the first reaction's count. Tap it. Expect the
   count to be one higher and the button to look selected. Tap again. Expect the
   original count.
3. **Draw a fresh one.** On Today, note the first title. Tap "Draw a fresh one".
   Expect "Robo is on it". Within 90 seconds expect a different first title with
   a NEW badge and a picture.
4. **Commission.** Tap "Commission". Type "a robot learns to fold laundry". Tap
   pay. In the checkout, pay with card 4242 4242 4242 4242, any future expiry and
   any CVC. Expect the sheet to show the comic being drawn, then a new comic at
   the top of Today marked "Commissioned".
5. **Back issues and paywall.** Scroll to the end of Today. Tap "Back issues".
   Expect a list or the empty state. Tap a locked issue if there is one. Expect
   the Plus paywall.

Run all five. Fix what they find, then run them again. Make sure Revyl proof of
changes is on and passing for the final pull request.

## Prove it

- `npm run check` passes.
- All five Revyl tests pass on the final build; link each run in the pull
  request.
- A 60-second screen recording from the cloud iPhone of flows 1, 3 and 4.
- A final note: what is verified on a device, what is only unit-tested, and the
  day's image count and estimated spend.
