# Thread 12: one quick question per story, and a live leaderboard

Start from the latest `main`. The demo is in about two hours and this is the
Convex showpiece of the pitch: "my friend answers on their phone and my leaderboard
moves at once, with no sync code". Keep it slim. Open the pull request within 40
minutes. Threads 9 (fresh draw), 10 (Promote) and 11 (story web link) run in
parallel and 10 and 11 also touch the Reader's last page: keep your Reader edit to
one small block and rebase on `main` before you open the pull request. Do not
change the on-device combo in `src/streak/`; this sits beside it.

## What the reader gets

1. **Quick question.** After the "Real story" page of a comic, one more page:
   a single multiple-choice question about that story with three answers. Tap one:
   right turns green with "+10" (plus a speed bonus), wrong shows the right answer
   in one kind line. One try per comic per device. A comic you already answered
   shows your result.
2. **Leaderboard.** A trophy button on Today (next to the combo pill) opens a
   "Today's board" screen: rank, name, points today and day streak for the top 20,
   and your own row pinned at the bottom if you are not in the top 20. It updates
   live while it is open: when another phone answers a question, the rows move
   (animate the reorder; honour reduce motion).
3. **Name.** Each device gets a fun generated name the first time ("Neon Otter",
   "Turbo Pigeon"); tapping your row lets you change it (2 to 16 characters, the
   existing text filter applies, no links).
4. **Challenge.** After answering, a "Challenge a friend" button shares
   "Beat me on this one: <title>" plus the story's web link
   (`https://resilient-ostrich-674.convex.site/s/<comicId>`; thread 11 adds
   `src/share/link.ts`, use it if it is on `main` when you rebase, otherwise build
   the same address in one small helper).

## Backend (new file `convex/quiz.ts`; add its tables to the schema)

- `quiz:ensure` (public action, `{ comicId }`): returns at once if the question
  exists; otherwise asks Claude (`claude-haiku-5-5`, structured output, short
  timeout, one retry) for one question with three options and the index of the
  right one, answerable only from the comic's own captions and real story, never
  from outside knowledge, never a trick. A lock stops two callers paying twice.
  Also create the question at the end of the comic pipeline when a comic becomes
  ready, so most questions exist before anyone opens them.
- `quiz:forComic` (public query, `{ comicId, deviceId }`): the question and options
  without the answer, plus this device's result if it has answered.
- `quiz:answer` (public mutation, `{ comicId, deviceId, choice, elapsedMs }`):
  checks on the server, stores one answer per device per comic, and awards 10
  points for a right answer plus a speed bonus of up to 5 (full bonus under 3
  seconds, none after 15; clamp what the client sends). Updates the player's
  points for today's Pacific date and their day streak (days in a row with at
  least one right answer). Returns right or wrong and the right option.
- `quiz:board` (public query, `{ deviceId }`): today's top 20 by points (ties by
  earlier time), each with name, points and streak, plus the caller's own rank
  and row. Index it so it does not scan the table.
- `quiz:rename` (public mutation).
- Limits: 60 answers a day per device; private (`owner`) comics and hidden comics
  have no question. Add every new public function to the allow-list test.

## Tests

convex-test with the model stubbed: `ensure` is idempotent under two concurrent
calls; `forComic` never leaks the answer; a second answer from the same device is
refused; points, speed bonus clamping and the streak across two Pacific days; the
board orders correctly, updates after an answer and returns the caller's rank when
outside the top 20; rename rules. Unit test for the answer-page state.

## Prove it

- `npm run check` passes.
- Do NOT deploy your branch to the shared Convex deployment; I deploy from `main`
  after the merge.
- One pull request. Say what you verified and what you did not. Skip Revyl.
