# Thread 9: "Draw a fresh one" replaces the top comic

Start from the latest `main`. Small, fast thread: the demo is in under three hours.
Aim to open the pull request within 20 minutes.

## What is wrong

Each tap on "Draw a fresh one" adds one more comic to Today, so the list keeps
growing. The reader should see the top comic swap for a new one instead.

## What the reader gets

- Tap "Draw a fresh one": the card in the lead (top) slot turns into the "Robo is
  drawing" state in place. No extra card appears anywhere in the list, and the list
  does not grow or jump.
- About 7 seconds later the lead slot shows the new comic (the existing reveal).
- The comic that was in the lead slot leaves Today. It is not deleted.
- Tapping again replaces that new comic in the same way. The number of comics on
  Today stays the same however many times the button is tapped.

## Rules

- Server side (`convex/freshPool.ts` `reveal`, and the visibility helper in
  `convex/lib/dto.ts`): when a pooled comic is revealed it takes the `order` of the
  comic it replaces, and the replaced comic is marked with a new optional field
  `replacedAt` (a timestamp) and is left out of `editions:today`, `editions:byDate`
  and `editions:list` counts. Do this in the same mutation as the reveal so the
  two never show together.
- What may be replaced: the top visible comic of the newest edition whose `kind`
  is `news` or `meme`. Never replace a comic with `owner` set (a reader's private
  created comic), a `commission` comic, or a comic with `sponsored: true` (another
  thread is adding that optional field right now: add it to the schema as
  `sponsored: v.optional(v.boolean())` if it is not there yet, and expect a tiny
  schema merge). If nothing can be replaced, keep today's behaviour (put it on top).
- A comic with `replacedAt` keeps working when opened by id (reader, share links,
  reactions, voice) so a reader who is mid-read is not thrown out.
- Client side (`app/index.tsx`, `src/data/filter.ts`, `src/data/drawFlow.ts`):
  while a draw is requested or revealing, show the drawing state in the lead slot
  in place of the lead card, not as an added card. Keep the scroll-to-top.
- The slow-news-day and no-pool fallbacks from thread 21 must keep working and
  must also land in the lead slot.

## Tests

convex-test: after `drawFreshOne` and the reveal, today's comic count is unchanged,
the new comic is first, the old lead is gone from `editions:today` but still
readable by id; three draws in a row keep the count unchanged; an owned, commission
or sponsored comic at the top is never replaced (the first replaceable one below it
is). Unit test for the client ordering: no extra card while drawing.

## Prove it

- `npm run check` passes.
- Do NOT deploy to the shared Convex deployment from your branch. I deploy from
  `main` after the merge.
- One pull request. Say what you verified and what you did not. Skip Revyl for
  this thread.
