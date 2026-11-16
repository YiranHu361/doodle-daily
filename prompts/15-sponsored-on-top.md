# Thread 15: a sponsored comic is the top story, and quiz questions never go missing

Start from the latest `main`. Very small and urgent: the demo video is being
recorded now. Open the pull request within 12 minutes. Do not deploy your branch;
I deploy from `main` after the merge.

## Part 1: the comic you just paid for is the top story

Today a promoted comic is placed second on the server, and on the phone it ends up
far down the list because the Today screen sorts "new" comics first. In the demo
nobody can tell which comic we just created.

- Server (`convex/pipeline.ts` / `convex/promote.ts`, wherever a promo comic gets
  its `order`): a promoted comic takes the top slot of today's issue (lower
  `order` than every other comic), for every reader. If two promos exist, the
  newest is on top. A fresh draw still never replaces a `sponsored` comic; it
  replaces the first replaceable comic below it, as today.
- Client (`src/data/filter.ts` `orderForToday`, `app/index.tsx`): sponsored comics
  keep their server position ahead of the "new" pinning, so a sponsored comic at
  the top stays at the top in the All list and in its section's list.
- The lead card of a sponsored comic shows the SPONSORED tag and "by <name>"
  clearly (large lead layout, same as any lead card).
- For the device that paid (the comic id is in `commissions:mine`), the card also
  shows a small "YOUR COMIC" badge.
- When the Promote sheet reaches "Your comic is live" and the person taps Done (or
  the sheet closes), Today switches to the All chip and scrolls to the top so the
  new comic is the first thing on screen.
- Update the texts that say "Second in today's paper" to "Top of today's paper".
- Update the tests that expected second place.

## Part 2: a comic never opens without its quick question

Seen live: a freshly revealed pool comic showed "No question for this one yet"
and stayed that way until `quiz:ensure` was run by hand; and `quiz:ensure`
sometimes returns `failed` on the first try.

- When a comic becomes ready (including pooled comics, at the moment they finish
  drawing, not at reveal), schedule `quiz:ensure` for it, and reschedule up to 3
  times with a few seconds between tries when it fails.
- In the Reader, when the quiz page mounts and there is no question, call
  `quiz:ensure` and show "Robo is writing the question" with the pulsing dots;
  retry up to 3 times; the page updates by itself when the question arrives.
- Inside `quiz:ensure`, retry the model call once with a slightly different
  instruction when the answer fails validation.

## Prove it

- `npm run check` passes.
- One pull request. Say what you verified and what you did not. Skip Revyl.
