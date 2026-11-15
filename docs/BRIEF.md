# Doodle Daily: build brief

Read this first. Companion files: `docs/DESIGN.md` (look, motion, copy),
`docs/LESSONS.md` (pitfalls stated as requirements), `docs/WHOP.md` (payments).
Where a live provider doc disagrees with this brief, the live doc wins; write the
difference in `NOTES.md`.

## 1. Product

Doodle Daily is the news, drawn in crayon. Every morning it publishes one issue of
4-panel comics about real stories in tech, money, culture and memes. A recurring
cast of five characters acts out each story; the app draws the captions as real
text; every comic ends with a 2-sentence "Real story" and a link to the source.
It is a habit app ("Duolingo for news"): reading one whole comic clears the day
and grows a daily combo. Stack: Capy writes it, Convex runs it, Revyl puts it on a
phone, Whop gets it paid.

Platform: Expo (Expo Router, TypeScript), iPhone portrait first. No sign-in: a
random device id stored on the device identifies the reader.

## 2. Screens and behaviour

- **Today.** Masthead (date, "ISSUE N", wordmark, Robo, combo pill), section
  chips (All, Tech, Money, Culture, Memes) pinned under it, then comic cards. The
  first card is large (panel 1 as cover, section tag, title); the rest are rows
  (thumbnail, tag, title). Read comics carry a READ stamp. A comic still being
  drawn shows a crayon-scribble placeholder and fills in live. Footer: "Back
  issues" button and a closing line. A floating "Draw a fresh one" button sits
  over the bottom of the list.
- **Reader.** Full screen over Today. Top bar: close, progress pips, "1/4".
  Section tag and title. Swipe sideways through 4 square panels on paper, each
  with its caption under the picture on the same sheet. Page 5 is the **Real
  story** card: four panel thumbnails (tap to jump back), the summary, source
  name, "Open source" (in-app browser). Bottom bar on every page: three reaction
  buttons with live counts and Share.
- **Reactions.** lol, wow, yikes. One per device per comic; tapping the same one
  removes it, another replaces it. Optimistic, rolled back with a toast on error.
- **Share.** Renders the 4 panels with captions, the title and a "Doodle Daily"
  footer as one tall image (1080 px wide) and opens the system share sheet.
- **Back issues.** Past issues newest first (cover, date, issue number, comic
  count). Opening one shows its comics; they open in the same Reader. Friendly
  empty state when there are none yet.
- **Draw a fresh one.** Asks the backend for one new comic from the newest unused
  story. The button shows a busy state; the new comic appears at the top as a
  placeholder, panels arrive one by one, then it gets a NEW badge. Takes about 30
  seconds end to end.
- **Daily combo.** See section 6. Pill in the masthead, a sheet with the count,
  best ("High score"), comics read, this week's strip and the month grid, and a
  celebration the first time a comic is finished each day.
- **States every screen handles:** loading, building (issue still being drawn),
  ready, empty, offline, error. Showing yesterday's issue is a state too ("Today's
  issue isn't out yet").
- **Intro** (first launch only, skippable): three cards explaining the paper,
  the combo, and the real story behind each comic.

## 3. Art and content rules (hard requirements)

Style block, pasted unchanged at the top of every image prompt:

```
STYLE: hand-drawn wax crayon illustration on off-white textured paper, thick
wobbly dark outlines, chubby rounded characters with dot eyes and simple
smiles, bright flat primary colors, uneven crayon fill slightly outside the
lines, simple backgrounds (rolling green hills, big yellow sun, or a plain
room with two or three objects), square 1:1 frame, no text, no letters, no
logos, no speech bubbles, no watermarks.
```

The cast (original characters; never name or imitate an existing show):

| Name | Looks like | Plays |
| --- | --- | --- |
| Boss Blob | round purple blob with a tiny red tie | any CEO or executive |
| Coin | yellow coin with a face, thin legs, red sneakers | markets, money, investors |
| Robo | boxy blue robot, one antenna with a yellow ball, three chest lights | AI and tech products |
| Newsie | small orange bird wearing a folded paper hat | the narrator, reacts to everything |
| The Crowd | three small green blobs, always together | the public, users, the internet |

Rules: no likeness of a real person (a cast member plays them; the caption may
name them; the image prompt never does). No invented quotes: captions are the
narrator's voice and state only what the source reports. No logos, no text in
pictures. Every comic keeps its source link. Skip stories about death, violence,
disasters, illness, abuse, crime, or private individuals. Memes: borrow the
format, never repost an image, never copy a post's text.

Captions are drawn by the app as real text, never by the image model.

## 4. Backend (Convex)

### Pipeline

1. **Ingest** (every 2 hours and before a build): fetch all sources in parallel,
   6 s timeout each, one failure never fails the run. Normalise to
   `{section, source, publisher, title, summary, url, publishedAt}`; strip HTML,
   cut summaries to 400 characters, dedupe by normalised URL, keep 24 hours.
   Sources and their quirks are listed in `docs/LESSONS.md`.
2. **Pick** (one model call per section): group, filter, score, return the top
   stories. Memes: X trends plus sample posts, pick jokes and a format.
3. **Write** (one call per comic): a 4-panel script, validated in code; one
   repair round on failure, then give up on that story.
4. **Draw** (one scheduled action per panel): image model with the cast reference
   sheets attached; store the picture in Convex file storage.
5. **Publish**: the issue is `building` while comics arrive and `published` once
   it settles. A comic is visible from the moment its script exists.

Editor prompt (per section), script prompt and panel prompt, to be used verbatim
(wrap the JSON answer in an object for structured output):

```
You are the editor of a daily comic newspaper. Below are today's headlines for
the {section} section, each with an id, source and one-line summary.

1. Group headlines that are about the same event.
2. Remove any group about death, violence, disasters, illness, abuse, crimes
   against people, or private individuals.
3. Score each remaining group 1-10 on: how many sources cover it (importance),
   how surprising or absurd it is, and how easy it is to show in 4 simple
   drawings.
4. Return the top {n} groups as JSON:
   [{ "itemIds": [...], "headline": "...", "whyFunny": "...", "score": 8 }]
Use only facts in the headlines and summaries. Do not add facts.
```

```
You write 4-panel comics for a daily crayon-drawn newspaper for adults.
Tone: playful, dry, kind. The humor comes from showing serious news as a
child's drawing. Never mean, never invents facts.

STORY: {headline}
FACTS (the only facts you may use): {summaries from sources}
OPTIONAL FORMATS you may borrow if one fits: {today's meme formats}

CAST you must use (pick 1-3 per panel): Boss Blob (any executive), Coin
(money, markets), Robo (AI, tech products), Newsie (narrator bird),
The Crowd (the public).

Rules:
- Panel 1 sets up, 2 and 3 escalate, 4 is the punchline.
- "scene" describes only what is visible, in under 40 words, using cast names
  and simple objects. No real people's names, no brand names, no words to be
  written in the picture.
- "caption" is narrator voice, under 16 words, may name real people and
  companies, states only what the FACTS say. No quotation marks, no invented
  quotes.
- "realStory" is 2 plain sentences a reader could repeat to a friend.

Return JSON only:
{ "title": "under 7 words", "panels": [ { "scene": "", "cast": [""],
"caption": "" } x4 ], "realStory": "" }
```

```
{STYLE block}
CHARACTERS: use the attached reference sheets exactly. {for each cast member
in this panel: one-line description}
SCENE: {scene}
Composition: one clear action in the center, characters large, plenty of
empty paper around them.
```

Meme picking prompt:

```
Below are today's trending topics on X with sample posts and like counts, and a
list of well-known meme format names.

Find the 4 funniest jokes that (a) most people would get without context,
(b) are not cruel, political attacks, sexual, or about tragedy, and (c) can be
retold in 4 simple drawings with a new cast of cartoon characters.

For each, return JSON:
{ "topic": "...", "theJoke": "one sentence explaining why people find it
funny", "format": "name of the meme format if one applies, else null",
"sourceUrls": ["..."], "score": 1-10 }
Describe the joke in your own words. Never copy a post's text.
```

The meme script prompt is the news one with STORY and FACTS swapped for the joke
and format, and `realStory` being one sentence that explains the trend.

### Public API (the only functions the app may call)

Numbers are float64. Dates are `"YYYY-MM-DD"` in America/Los_Angeles. Timestamps
are milliseconds.

```ts
type Section = "tech" | "money" | "culture" | "memes";
type ComicStatus = "scripted" | "drawing" | "ready";   // failed never leaves the server
type ReactionKind = "lol" | "wow" | "yikes";
type PanelDTO = { scene: string; caption: string; cast: string[]; imageUrl: string | null };
type ComicDTO = { _id: Id<"comics">; section: Section; kind: "news" | "meme" | "commission";
  title: string; realStory: string; sourceName: string; sourceUrl: string;
  status: ComicStatus; order: number; createdAt: number; isNew: boolean;
  panels: PanelDTO[] /* exactly 4 */ };
type EditionDTO = { _id: Id<"editions">; date: string; number: number;
  status: "building" | "published"; comics: ComicDTO[] /* sorted by order */ };
type EditionSummaryDTO = { _id: Id<"editions">; date: string; number: number;
  status: "building" | "published"; comicCount: number; coverUrl: string | null };
```

| Function | Type | Args | Returns |
| --- | --- | --- | --- |
| `editions:today` | query | `{}` | `EditionDTO \| null`, the newest issue that has something to show |
| `editions:byDate` | query | `{ date }` | `EditionDTO \| null` |
| `editions:list` | query | `{}` | `EditionSummaryDTO[]`, newest first, at most 30 |
| `reactions:toggle` | mutation | `{ comicId, deviceId, kind }` | `null` |
| `reactions:counts` | query | `{ comicId, deviceId }` | `{ lol, wow, yikes, mine: ReactionKind \| null }` |
| `pipeline:drawFreshOne` | action | `{ deviceId, secret }` | `{ ok: true, comicId } \| { ok: false, reason: "bad_secret" \| "no_story" \| "spend_cap" \| "busy" \| "needs_plus" }` |

Plus the billing and commission functions in `docs/WHOP.md`. Every public
function has `args` and `returns` validators; everything else is internal; a test
fails if any other function becomes public.

### Environment (already set on the Convex deployment; never print values)

`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `X_BEARER_TOKEN`, `FINNHUB_API_KEY`,
`DEMO_SECRET`, `DAILY_IMAGE_CAP=80`. Whop variables are in `docs/WHOP.md`.
Deployment: `https://resilient-ostrich-674.convex.cloud` (HTTP actions on
`https://resilient-ostrich-674.convex.site`). The app reads
`EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_DEMO_SECRET` at build time.

Models (check each provider's current docs before coding; details in LESSONS):

- Scripts and picks: `claude-opus-5-5`, raw `fetch` to the Messages API with
  structured JSON output. No SDK.
- Panels: `gpt-image-2.6-flare` through `/v1/images/edits`, cast sheets as
  reference images, 1024 x 1024, JPEG output at quality 85, medium quality.
- Both sit behind small provider interfaces with a `mock` implementation
  (deterministic script; generated placeholder picture after 1 to 3 s) so tests
  and the seed never need a key.

## 5. App architecture

- Expo Router, TypeScript strict, Convex React client (`ConvexProvider`,
  `useQuery`). Live data only through typed hooks in one folder; views stay dumb.
- Reanimated and Gesture Handler for motion, `react-native-svg` for Robo and
  shapes, `expo-image` for pictures (disk cache, downsized decode),
  `expo-web-browser` for links and checkout, `expo-sharing` plus
  `react-native-view-shot` for the share image, `expo-haptics`,
  `@expo-google-fonts/*` for the three typefaces, AsyncStorage for local state.
- Launch flags for tests, read from a deep link or env: use fixtures, skip intro,
  reset state, fixed "now".
- Every tappable element and every panel image has a `testID` and an
  accessibility label. Names: `comicCard_{i}`, `chip_{section}`, `panel_{i}`,
  `panelCaption_{i}`, `realStory`, `sourceName`, `openSourceButton`,
  `reaction_{kind}`, `shareButton`, `closeReader`, `drawFreshButton`,
  `streakPill`, `streakSheet`, `celebrationOverlay`, `celebrationContinue`,
  `archiveButton`, `archiveRow_{i}`, `commissionButton`, `plusButton`.

## 6. Combo rules (local to the device)

- A comic is read when the reader reaches the Real story page after seeing all 4
  panels. Any comic counts, including back issues and re-reads; "Comics read"
  counts unique comics.
- The day boundary is the device's local midnight (use the current time zone at
  the moment of reading). Store read days as local `"YYYY-MM-DD"` plus read ids.
- Combo = consecutive cleared days ending today, or ending yesterday when today
  is not cleared yet (then it is "at risk", not broken). A missed day resets it
  to 0. Best combo is kept forever.
- The celebration plays once per day: 4 idle seconds after arriving on the Real
  story page, or when the Reader closes, never while the browser or share sheet
  is up. A celebration armed before midnight must not play for the next day.
- The clock is injected so tests can time-travel. Stored data must survive new
  fields (decode with defaults; back up unreadable data instead of wiping it).

## 7. Engineering standards

- Small pure helpers with unit tests; side effects at the edges; validate every
  boundary (model output, feeds, public args, webhooks).
- Every outside call: timeout, at most 2 retries with backoff, a failure path
  that leaves the app usable.
- No secrets in the repo, logs or stored documents. The only values in the app
  bundle are the Convex URL and the demo secret.
- `npm run check` = typecheck + lint + all tests, green with no network and no
  keys. One pull request per thread, small commits, a short "what was verified
  and what was not" note in every PR.

## 8. Definition of done (6:00 pm)

1. A real issue of at least 6 comics is live on the deployment, read by a person
   against section 3.
2. On a Revyl cloud iPhone: open a comic, swipe four panels, reach the Real
   story, see the celebration, react, draw a fresh one and watch it arrive.
3. A $1 commission paid with the Whop test card produces a comic.
4. Revyl tests for those flows pass and proof of changes is on.
5. `npm run check` is green.
