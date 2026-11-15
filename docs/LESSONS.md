# Lessons, stated as requirements

Each line is something that went wrong in an earlier prototype of this idea.
Treat every item as a requirement and cover the ones marked (test) with a test.

## Convex

1. Scheduled actions are **not retried** by Convex. Build retries by hand:
   re-schedule with a counter, at most 3 attempts per panel.
2. Crons are **UTC only**. The morning build must run when the Pacific hour is 6,
   7 or 8 (cron slots at 13, 14, 15 and 16 UTC cover both PST and PDT) and must
   be safe to run twice for the same date (test).
3. Do not use `"use node"`. `fetch`, `fast-xml-parser`, Blob and file storage all
   work in the default runtime, and it keeps mutations and actions in one file.
4. Functions that reference `internal.*` need explicit return types, or TypeScript
   reports circular inference.
5. Read environment variables defensively inside handlers; a missing required
   variable must not block a deploy.
6. Never read an unbounded table. Index by date and status; unused stories are
   read by an index on (used, createdAt) limited to the last 36 hours (test: 20
   old high-scoring stories must not crowd out a fresh one).
7. Keep counters off hot documents: reaction counts and the day's spend each live
   in their own small row.

## Pipeline safety nets

8. An issue where every comic failed must be **removed**, with its stories
   released, so `editions:today` falls back to the previous issue and a later
   run can rebuild the day (test).
9. `editions:today` never returns an issue that is settled with nothing visible.
10. Every comic gets a **deadline** when it is created (10 minutes, extended
    while a draw is in flight, 20 minutes hard stop). Past it, the comic is
    failed and hidden, so nothing spins forever (test).
11. A failed comic simply disappears from public queries; "failed" never reaches
    the app.
12. Panel retries wait `max(Retry-After, 2 s x 4^(attempt-1))`, capped at 60 s.
    A quota or billing error (429 with "check your plan") is not retried (test).
13. The daily image cap is **reserved** in a mutation before drawing and
    **refunded** for panels never attempted when a comic fails (test).
14. Drawing is idempotent: claim a panel before calling the model; a second job
    for the same panel does nothing; a duplicate result deletes its upload.
15. Limit concurrent image calls (8) with slots rather than one shared range
    read, to avoid write conflicts.
16. Bound the build's total time: editor calls get 40 s and one retry, so three
    sections cannot pass the 10-minute action limit. Every run writes a row
    saying what happened.
17. One "Draw a fresh one" at a time, guarded by a lock that has a holder and an
    expiry; only the holder releases it (test). A press while one is drawing
    returns `busy`.
18. A story is claimed in a mutation before a script is paid for, so two writers
    never pay for the same story (test).

## Content

19. Pick sections one after another and tell each call what is already in the
    paper; drop a pick that shares a proper name and another distinctive word
    with one already taken. One event must not fill three sections.
20. A code-level filter drops stories before the model sees them: death,
    violence, war, disasters, illness, abuse, sexual content, affairs, and
    people who were jailed, convicted, indicted or arrested. Keep ordinary
    business language ("stocks crash", "killer feature", "cyberattack") (test).
21. Script validation in code: exactly 4 panels; caption under 16 words with no
    quotation marks; scene under 40 words; cast names only from the five;
    `realStory` exactly 2 sentences (1 for memes); reject a scene that contains a
    capitalised name from the headline, any kind of bubble or balloon, written
    words or signs with text, or a person who is not a cast member (a real
    person must be played by a cast member). One repair round, then give up.
22. Model answers: the structured-output schema needs an object at the top
    level; handle a refusal (HTTP 200 with a refusal stop reason) and malformed
    JSON as ordinary failures.
23. Never send meme template names to the writer (they often contain a brand or
    celebrity). Map them to your own one-line format descriptions and keep a
    written list of 12 evergreen formats as the fallback when X is unavailable.
24. Keep publisher links exactly as published, but prefer the publisher's own
    link over an aggregator's (Techmeme, Hacker News, news.google.com).
25. Ask the image model for JPEG at quality 85 (about 300 KB instead of 2 MB per
    panel) and send the cast sheets downscaled to 512 px.

## Providers (verify against live docs before coding)

- Anthropic Messages API: `POST https://api.anthropic.com/v1/messages`, headers
  `x-api-key` and `anthropic-version`, structured output through
  `output_config.format` with a JSON schema; the JSON arrives in the first text
  block; do not send temperature or top_p. A script took 7 to 13 s.
- OpenAI images: `POST https://api.openai.com/v1/images/edits` as JSON with the
  reference images as data URLs; the picture comes back base64 in
  `data[0].b64_json`. About $0.06 and 11 to 15 s per panel at medium quality.
- X: `GET https://api.x.com/2/trends/by/woeid/23424977` and
  `/2/tweets/search/recent` (max_results at least 10). Pay per use: at most 4
  runs a day and 100 posts per run. Link a post as
  `https://x.com/i/web/status/{id}`.
- Finnhub: `GET https://finnhub.io/api/v1/news?category=general` with the key in
  the `X-Finnhub-Token` header, never in the URL.
- Imgflip: `https://api.imgflip.com/get_memes` (names only, never images).

## Feeds that answered (send `User-Agent: DoodleDaily/1.0`, 6 s timeout, 3 MB cap)

| Section | Source | URL |
| --- | --- | --- |
| tech | Hacker News | `https://hacker-news.firebaseio.com/v0/topstories.json` then `/v0/item/{id}.json` for the top 30 |
| tech | Techmeme | `https://www.techmeme.com/feed.xml` |
| tech | TechCrunch | `https://techcrunch.com/feed/` |
| tech | The Verge (Atom, not RSS) | `https://www.theverge.com/rss/index.xml` |
| tech | Ars Technica | `https://feeds.arstechnica.com/arstechnica/index` |
| money | CNBC | `https://www.cnbc.com/id/100003114/device/rss/rss.html` |
| money | BBC Business | `https://feeds.bbci.co.uk/news/business/rss.xml` |
| money | MarketWatch | `https://feeds.content.dowjones.io/public/rss/mw_topstories` |
| money | Finnhub | see above |
| culture | BBC Entertainment | `https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml` |
| culture | Variety | `https://variety.com/feed/` |
| culture | ESPN | `https://www.espn.com/espn/rss/news` (returns an empty 202 to browser-like user agents) |

Yahoo Finance's feed returns 404; do not use it. Reddit is off the table.

## App

26. Decode defensively: one bad comic is dropped, not the whole issue; unknown
    sections or statuses are skipped; `imageUrl` may be null (test).
27. Do not show "offline" or an error before the first successful connection;
    stay in loading for up to 12 s on a cold start (test).
28. Cache the last issue on the device and show it at once on launch.
29. Reaction buttons are disabled until the first counts arrive; a stale server
    value must not snap an optimistic count back (test).
30. Timeouts must really fire: a draw gets 60 s, a reaction 12 s, even if the
    underlying call never settles (test).
31. A fresh comic that appeared and then vanished (it failed) must end the busy
    state with "My crayon snapped. Try again." (test).
32. Download each picture once however many views ask for it; decode list covers
    at display size; cap the memory cache (about 80 MB).
33. Render the share image when Share is tapped, wait for late panels, never
    block swiping.
34. Pull-down-to-close must not fight vertical scrolling on the Real story page.
35. The floating dock covers the end of the list: add bottom padding, and in UI
    tests scroll to the very end before tapping the footer.
36. Clearing app state for a demo also clears the device id, or old reactions
    make counts go down.
37. Test the default celebration path (4 idle seconds, waits for the browser to
    close), not only a shortened test mode.
