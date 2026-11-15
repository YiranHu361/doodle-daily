# Thread 13: every comic is backed by a real source

Start from the latest `main`. Urgent and it must be right: the demo is in about two
hours and a judge noticed comics with no real source. Open the pull request within
35 minutes. Threads 11 (story web link, `convex/http.ts`) and 12 (quiz, the end of
the comic pipeline) run in parallel; rebase on `main` before you open the pull
request and before any deploy.

## What went wrong

The scaffold's seed stories ("Doodle Daily sample desk", `https://example.com/sample/…`)
are still in the `stories` table. When real stories ran out, `bestUnusedStory` and
the fresh pool picked them, so made-up stories were drawn and shown as news. I have
hidden the visible ones by hand. Three are still sitting in the pool.

The rule from now on: **we never make anything up. A public news or meme comic
exists only if a real, reachable article or post backs it.** If a source is hard to
find, search harder and take longer: comics are drawn ahead of time, so slow is fine.

## Fix 1: clean up, and make it impossible again

- New internal mutation `admin:purgeUnsourced`: every comic and story whose source
  is not real (empty `sourceUrl`, host `example.com`, source name "Doodle Daily
  sample desk" or "Doodle Daily newsroom") is hidden, taken out of the pool
  (`pooled` cleared so it can never be revealed) and its story marked used. It
  returns what it changed. Created comics (`kind: "commission"`) and `paper-sample`
  comics are left alone; they have their own rules. I will run it after the merge.
- One helper `isRealSource(url)` in `convex/lib/urls.ts`: https, a real public host,
  not `example.com`/`example.org`/`localhost`, not empty. Use it in three places:
  the story pickers (`bestUnusedStory`, `pickNews`, `fallbackPick`, the meme
  picker) never return a story that fails it; `startComic` refuses to write a
  `news` or `meme` comic that fails it (reason `no_source`); and the visibility
  helper in `convex/lib/dto.ts` never shows a `news` or `meme` comic that fails it.
- The seed (`convex/seed.ts`, `seedData.ts`) must be impossible to run against a
  real deployment by accident: it only runs when an explicit `ALLOW_SEED=1` is set,
  and its stories are created already marked used.
- Remove the "Slow news day" strip from the public path (`SLOW_NEWS_STORY`,
  `SLOW_NEWS_SCRIPT`): it is invented content. When nothing sourced can be found the
  draw returns `no_story`, and the app says "Robo is still checking sources. Try
  again in a minute." The next fix makes that very unlikely.

## Fix 2: search harder for real stories

Add a "deep search" step (`convex/ingest.ts` or a new `convex/sourcing.ts`) that
runs whenever a picker finds fewer than 6 unused, safe, real-sourced stories in a
section, and from the pool top-up before it gives up:

1. **More feeds.** Extend the feed list with at least 6 more working, reputable RSS
   or Atom feeds per section (for example BBC, NPR, The Guardian, AP, TechCrunch,
   Wired, Engadget, Fortune, Polygon, Pitchfork, Rolling Stone, and Know Your Meme
   for the memes section). Fetch each one once from your machine and keep only
   feeds that answer with items today.
2. **Wider window.** Look back 36 hours, then 72 hours, then 7 days, newest first.
3. **Web search.** Ask Claude with Anthropic's web search tool (check the live docs
   for the current tool name and version; `ANTHROPIC_API_KEY` is set) for today's
   notable, light, safe stories in the section that are not already in our list.
   It must return, for each story, the article URL, the publisher, the headline as
   published and two or three facts that the article states. Structured output.
4. **Verify before saving.** For every candidate from step 3, our own code fetches
   the URL (reuse the page helpers in `convex/commissions.ts`): it must answer 200,
   pass `isRealSource`, and its title or text must share the headline's key words.
   Anything that fails is dropped. A story is saved only with a verified URL.
5. **Memes and X trends.** A meme story keeps its X post link as `originUrl` (new
   optional field) and the same search looks for an article that explains it (a news
   write-up or a Know Your Meme entry). When one is found and verified it becomes
   `sourceUrl`/`sourceName`; when none is found the X post stays as the source.
6. The existing safety filter and overlap check still apply to everything found.
7. Budget: at most 4 web-search calls per deep search and one deep search per
   section every 20 minutes (a lock), logged in the `runs` table with what was
   found, verified and dropped.

Raise the fresh pool to 5 comics, and make the pool top-up use the deep search
before it reports that it could not fill a slot.

## Fix 3: captions come from the article

At pick time, when the article page is readable, pass an excerpt of its text (first
1,500 characters of the main text) to the script writer along with the facts, and
tell it that every caption and the "Real story" line must be supported by that
text or the facts. When the page is not readable (paywall), the script uses only
the feed's own title and summary, as today.

## Fix 4: an audit I can run

Internal query `admin:sourceAudit`: for today's issue and the pool, one row per
comic with its kind, title, source name, source host and whether it passes
`isRealSource`. It must report zero failures after `purgeUnsourced`.

## Tests

convex-test: a seed/sample story is never picked by any picker and `startComic`
refuses it; `purgeUnsourced` hides and un-pools the bad ones and leaves real and
created comics alone; deep search saves only candidates whose page fetch verifies
(stub the search and the fetch: one good, one 404, one whose page does not mention
the headline); a meme gains an article source when one verifies and keeps the X
link when none does; an empty pool with nothing sourced returns `no_story` and
never writes an invented comic; the audit flags a bad row.

## Prove it

- `npm run check` passes.
- After rebasing on the latest `main`, you may deploy to the shared deployment
  (a phone is using it live: additive changes only). Then run
  `admin:purgeUnsourced`, one deep search for one section, and `admin:sourceAudit`,
  and paste the three results in the pull request, with how long the deep search
  took and how many stories it found, verified and dropped.
- One pull request. Say what you verified and what you did not. Skip Revyl.
