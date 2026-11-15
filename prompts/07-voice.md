# Thread 7: Newsie reads it aloud (OpenAI voice)

Start from the latest `main` (threads 1, 2 and 3 are merged). Read `docs/BRIEF.md`,
`docs/DESIGN.md` and `docs/LESSONS.md`. Runs in parallel with thread 5 (Whop) and
thread 8 (Keiki).

## What the reader gets

A speaker button in the Reader's top bar. With it on, Newsie (the narrator bird)
reads each panel's caption as the panel comes into view, then reads the Real story
on the last page. The voice is a warm, slightly wry newsreader. The first time the
speaker is turned on, show one line of small text: "Newsie's voice is AI-generated."
The choice (on or off) is remembered on the device. Off by default.

## Build

1. **Backend, new file `convex/voice.ts`** (this thread owns it):
   - Internal action that makes speech with OpenAI's text-to-speech endpoint
     (`POST /v1/audio/speech`; check the live docs for the current model, voices and
     the delivery-instructions field; `OPENAI_API_KEY` is already set on the
     deployment). MP3 output, stored in Convex file storage.
   - One clip per panel caption and one for the Real story: 5 clips per comic.
     Delivery instructions change a little by section (tech: deadpan; money: brisk;
     culture: amused; memes: playful). Never invent words: the clip says exactly the
     caption text.
   - Generate lazily and once: a public action `voice:ensure({ comicId })` returns
     at once if the clips exist, otherwise makes the missing ones (in parallel,
     with a timeout and at most 2 retries each) and saves their storage ids on the
     comic. A lock stops two callers paying twice. Count clips against a new
     `DAILY_VOICE_CAP` (default 400 clips a day) and refuse politely when it is used up.
   - Public query `voice:forComic({ comicId })` returns
     `{ panels: (string | null)[4], realStory: string | null }` of audio URLs, and
     updates live as clips arrive. Add both functions to the public allow-list test.
   - Schema: add the optional audio ids to the comic document; touch nothing else
     in `convex/schema.ts`.
2. **App, new folder `src/voice/`** (this thread owns it): install `expo-audio`;
   a `useNarration(comicId, pageIndex, enabled)` hook that calls `voice:ensure`
   when narration is switched on, plays the clip for the current page, stops the
   previous clip on swipe, and never overlaps two clips; a `<SpeakerButton />`.
   Respect the phone's silent switch. No narration while the celebration plays.
3. **Reader**: add the speaker button to the top bar and call the hook. Keep the
   edit to the Reader file as small as you can (thread 6 polishes that file later).
4. Accessibility: the button is labelled "Read aloud", with its state; when
   VoiceOver is running, narration stays off so two voices never talk at once.

## Tests

convex-test: `ensure` makes 5 clips once and is idempotent under two concurrent
calls (stub the HTTP call); a failed clip leaves the others usable; the cap refuses;
the query returns nulls until clips exist. A unit test for the play/stop logic of
the hook with a fake player.

## Prove it

- `npm run check` passes.
- On the deployment: call `voice:ensure` for one real comic, then fetch one returned
  URL and confirm it is `audio/mpeg` with a sensible length. Report the cost of one
  comic's narration.
- Build on Revyl as a standalone simulator build (JavaScript bundled,
  `EXPO_PUBLIC_CONVEX_URL` set), install on a cloud iPhone, and check in plain
  English: "the Reader shows a speaker button", "tapping it shows the AI voice note".
- One pull request. Say what you verified and what you did not (you cannot hear the
  cloud phone; say so).
