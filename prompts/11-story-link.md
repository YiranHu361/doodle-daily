# Thread 11: a web link for every story

Start from the latest `main`. Small, fast thread: the demo is in about two hours.
Open the pull request within 25 minutes. Threads 9 (fresh draw) and 10 (Promote)
are running in parallel; rebase on `main` before you open the pull request.

## Why

Sharing today sends a picture only. People need a link to one specific story that
opens for anyone, with or without the app, so a reader can send "read this one".

## What people get

- Every comic has a public web address:
  `https://resilient-ostrich-674.convex.site/s/<comicId>`.
- Opening it in any browser shows that one story as a page in the app's look
  (dark, the same colours and fonts as `docs/DESIGN.md`, system font fallbacks are
  fine): the section tag, the title, the four pictures with their captions in
  order, the "Real story" line, the source link, and one button "Open in Doodle
  Daily" that opens the app at that comic (`doodledaily://reader/<comicId>`).
  Sponsored comics (field `sponsored`, added by thread 10; treat it as optional)
  show a "SPONSORED" tag. Unverified ones keep their "UNVERIFIED LINK" tag.
- The page has link-preview tags (`og:title`, `og:description`, `og:image` set to
  the first panel picture, `twitter:card` `summary_large_image`) so the link
  unfurls with the comic's picture in iMessage, X and Discord.
- In the app, the Reader's last page and the existing share action now share
  "<title>" plus that link (keep the picture card too where the share sheet takes
  both). Add a "Copy link" button on the last page; show a toast "Link copied".
- `doodledaily://reader/<comicId>` opens the Reader for that comic (check the
  Expo Router route name and make the deep link work).

## Build

- One Convex HTTP action `GET /s/<comicId>` in `convex/http.ts` (add only your own
  route) with the page built in a new file `convex/storyPage.ts`. Server-rendered
  HTML string, no client JavaScript needed, all text escaped (titles and captions
  come from a model: escape `<`, `>`, `&`, quotes). Cache header of 60 seconds.
- Rules: an unknown or malformed id gives a small 404 page. A hidden or failed
  comic, a comic still being drawn, a pooled comic that is not revealed yet, and a
  comic with `owner` set (private to its creator) all give the same 404. A comic
  with `replacedAt` still opens.
- The link builder lives in one place in the app (`src/share/link.ts`), derived
  from `EXPO_PUBLIC_CONVEX_URL` (`.convex.cloud` -> `.convex.site`).

## Tests

convex-test for the route: a ready comic returns 200 with the title, four image
URLs and the preview tags; text is escaped (a title containing `<script>`);
hidden, failed, drawing, pooled and owned comics return 404; a bad id returns 404.
Unit test for the link builder.

## Prove it

- `npm run check` passes.
- Do NOT deploy your branch to the shared Convex deployment; I deploy from `main`
  after the merge. Paste the rendered HTML of one test comic in the pull request.
- One pull request. Say what you verified and what you did not. Skip Revyl.
