# Doodle Daily

The news, drawn in crayon. Every morning Doodle Daily turns real stories in tech,
money, culture and memes into 4-panel comics starring five recurring characters,
each ending with the real story in two sentences and a link to the source. Read
one whole comic and the day is cleared; come back tomorrow and it becomes a combo.

Readers can commission a comic about anything for $1, and Doodle Daily Plus
opens the back issues, unlimited fresh draws and a weekly combo freeze.

**Stack:** Capy writes it, Convex runs it, Revyl puts it on a phone, Whop gets it paid.

Built on Sunday, November 15, 2026 at the Consumer Mobile Hackathon. Start with
`docs/BRIEF.md`; the build threads are in `prompts/`, in order.

## How to run

Requirements: Node 22+ and npm. Everything below works without API keys; the
backend uses mock script and image providers until thread 2 adds real ones.

```bash
npm install
npm run check            # typecheck + eslint + vitest (no network, no keys)
```

**Backend (Convex).** The app talks to the existing deployment
`https://resilient-ostrich-674.convex.cloud`. With `CONVEX_DEPLOY_KEY` set:

```bash
npx convex dev --once                     # push functions and regenerate convex/_generated
npx convex run seed:run '{}'              # write yesterday's and today's issue (skips dates that exist)
npx convex run seed:run '{"replace": true, "leaveOneDrawing": true}'  # rebuild both, one comic left mid-draw
npx convex run editions:today             # read the live issue
```

**App.** `EXPO_PUBLIC_CONVEX_URL` is read at bundle time (it falls back to the
deployment above). `npx convex dev` also writes it to `.env.local`.

```bash
EXPO_PUBLIC_CONVEX_URL=https://resilient-ostrich-674.convex.cloud npx expo start
```

**iOS simulator build (what Revyl runs).** A standalone Release build with the
JavaScript bundled in:

```bash
npm ci
CI=1 npx expo prebuild --platform ios --clean
EXPO_PUBLIC_CONVEX_URL=https://resilient-ostrich-674.convex.cloud xcodebuild \
  -workspace ios/DoodleDaily.xcworkspace -scheme DoodleDaily -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO build
# -> ios/build/Build/Products/Release-iphonesimulator/DoodleDaily.app
```

### Layout

| Path | What | Owner after thread 1 |
| --- | --- | --- |
| `convex/` | schema, public queries/mutations, mock providers, seed | thread 2 (thread 5: `http.ts`, `billing.ts`, `commissions.ts`, `waitlist.ts`) |
| `app/` | Expo Router screens | thread 3 |
| `src/theme/`, `src/data/`, `src/components/` | tokens, typed live-data hooks, views | thread 3 |
| `src/streak/`, `src/robo/`, `src/intro/` | combo, Robo, intro (stubs) | thread 4 |
| `src/billing/` | Plus and commissions (stubs) | thread 5 |

The public Convex API is pinned by `convex/publicApi.test.ts`; add a function to
its allow-list when you make it public.
