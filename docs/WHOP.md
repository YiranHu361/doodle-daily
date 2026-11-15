# Doodle Daily x Whop

Whop is how the paper gets paid. Everything here runs in the **Whop sandbox**
(`sandbox.whop.com`, no real money). Read Whop's own docs before writing any
call and do not guess API shapes: `docs.whop.com/developer/quickstart`,
`docs.whop.com/developer/guides/webhooks`, `docs.whop.com/developer/guides/sandbox`,
and the API reference for checkout configurations, plans, payments and
memberships. If a name below differs from the live docs, the docs win; note the
difference in `NOTES.md`.

## What we sell

### A. Commission a comic ($1, one-time)

The headline feature. The reader pastes a link or types a topic ("our seed
round", "my roommate's sourdough obsession"), pays $1, and Robo draws a 4-panel
comic about it that appears live at the top of Today, marked "Commissioned".

Flow:

1. The app calls `commissions:start`. The server validates and stores the request
   (`awaiting_payment`), creates a Whop hosted checkout for the one-time $1 plan
   with `metadata: { kind: "commission", deviceId, commissionId }`, and returns
   the checkout URL.
2. The app opens the URL with `expo-web-browser`. Test card `4242 4242 4242 4242`,
   any future expiry, any CVC.
3. Whop calls our webhook. The handler marks the commission `paid` and schedules
   the writer and artist. Closing the browser unlocks nothing: the app only
   watches `commissions:mine`, which changes when the webhook lands.
4. The comic arrives through the normal reactive issue query, like a fresh draw.

Rules for commissions:

- A link: fetch only the page's title and description (Open Graph or meta tags),
  6 s timeout, 3 MB cap, never the article text. A topic: at most 140 characters.
- The same content rules apply (BRIEF section 3 and the filter in LESSONS 20).
  Check **before** creating the checkout and refuse with a friendly reason, so
  nobody pays for something Robo will not draw.
- A commission counts against the daily image cap; if the cap is spent, refuse
  before checkout.
- If drawing fails after payment, mark it `failed`, show "Robo could not finish
  this one", and issue a refund through the Whop API (if the sandbox supports
  it; otherwise record that a refund is owed).
- `kind: "commission"`, `sourceName` "Commissioned by a reader", `sourceUrl` the
  pasted link or empty.

### B. Doodle Daily Plus (subscription, $3 a month)

- **Back issues.** Free readers see today's issue and yesterday's; Plus opens
  the whole archive.
- **Unlimited fresh draws.** Free readers get 1 "Draw a fresh one" a day; after
  that the action returns `needs_plus` and the app shows the paywall.
- **Combo freeze.** One a week: a single missed day is forgiven automatically
  and shown as a shield in the week strip and month grid.

Same flow as A with a recurring plan and `metadata: { kind: "plus", deviceId }`.
The webhook writes the entitlement. Also handle the membership ending or a
payment failing (read the webhooks guide for the event names) by ending Plus.

### C. Run your own paper (pitch screen only)

One screen reached from the paywall: "Run your own paper". A creator picks a
niche (crypto, K-pop, a campus, a fan community), we draw their daily issue, and
Whop handles their plans, members and payouts. Build the screen with a niche
picker, a mock preview masthead ("THE K-POP DOODLE") and a "Join the waitlist"
button that stores the device id and niche. No Whop calls behind it today.

## Setup (done by the human; values arrive as environment variables)

1. Sandbox account at `sandbox.whop.com`; an Admin API key from its Developer page.
2. Webhook at `https://resilient-ostrich-674.convex.site/whop`, subscribed to
   `payment_succeeded`; copy its secret.
3. In Capy's project environment: `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET`,
   `WHOP_ENVIRONMENT=sandbox`. Copy them to Convex with `npx convex env set`. If
   `WHOP_ENVIRONMENT` is not `sandbox` the SDK calls production: refuse to start
   a checkout unless it is set.
4. Create the two plans (one-time $1, monthly $3) through the API or the sandbox
   dashboard and store their ids in Convex env as `WHOP_PLAN_COMMISSION` and
   `WHOP_PLAN_PLUS`. A small internal action that creates them if missing is fine.

## Backend

Use `@whop/sdk` inside Convex actions (default runtime; if the SDK needs Node
APIs, call the REST API with `fetch` instead).

Tables:

- `entitlements`: `deviceId`, `plus: boolean`, `plusSince`, `whopMembershipId`,
  `updatedAt`. Index by `deviceId`.
- `commissions`: `deviceId`, `topic`, `link`, `status` (`awaiting_payment`,
  `paid`, `drawing`, `ready`, `failed`, `refunded`), `whopPaymentId`, `comicId`,
  `createdAt`. Indexes by `deviceId` and by `whopPaymentId`.
- `webhookEvents`: the Whop event id, so a delivery handled once is ignored the
  second time.
- `draws`: per device per Pacific day, how many fresh draws were used.

HTTP action `POST /whop` (in `convex/http.ts`):

- Verify the signature with the webhook secret exactly as the webhooks guide
  says, on the raw body, before parsing. Reject anything unsigned with 401.
- Ignore events already in `webhookEvents`. Answer 200 quickly; do the work in a
  scheduled mutation or action.
- `payment_succeeded` with `kind: "commission"`: mark paid, schedule the comic.
  With `kind: "plus"`: write the entitlement.
- Never trust amounts or ids from the client; read the payment from Whop if the
  event does not carry what you need.

Public functions (validators on all):

| Function | Type | Args | Returns |
| --- | --- | --- | --- |
| `billing:status` | query | `{ deviceId }` | `{ plus: boolean, freeDrawsLeftToday: number, freezesLeftThisWeek: number }` |
| `billing:startPlusCheckout` | action | `{ deviceId }` | `{ ok: true, url } \| { ok: false, reason }` |
| `commissions:start` | action | `{ deviceId, topic?: string, link?: string }` | `{ ok: true, commissionId, url } \| { ok: false, reason: "not_allowed" \| "spend_cap" \| "bad_input" \| "unavailable" }` |
| `commissions:mine` | query | `{ deviceId }` | newest first, at most 20: `{ _id, topic, status, comicId \| null, createdAt }` |
| `waitlist:join` | mutation | `{ deviceId, niche }` | `null` |

`pipeline:drawFreshOne` enforces the free limit from `draws` and `entitlements`.
`editions:list` and `editions:byDate` take an optional `deviceId` and return
only today and yesterday to readers without Plus (with a `locked: true` flag on
the rest of the list so the app can show them with a lock).

Tests: signature accepted and rejected; duplicate delivery ignored; commission
and Plus paths from a fake signed event; free-draw limit; locked archive;
refusal before checkout for a banned topic.

## App

- **Commission.** A second dock button next to "Draw a fresh one" (pencil icon,
  "Commission") opens a sheet: a text field ("Paste a link or type a topic"),
  the price, and a volt "Pay $1 and draw it" button. After checkout the sheet
  shows the live status (waiting for payment, paid, drawing, ready) from
  `commissions:mine`, then closes and scrolls Today to the new comic.
- **Paywall sheet** (when `needs_plus` comes back, on a locked back issue, or
  from a "Plus" chip in the combo sheet): Robo wearing a tiny crown, three lines
  (all back issues, unlimited fresh draws, a weekly combo freeze), "$3 a month",
  a volt "Get Plus" button, "Run your own paper" as a quiet link.
- Plus members see a small "PLUS" tag next to the issue tag.
- Hosted checkout works in Expo Go and in a Revyl simulator build. "Sign in with
  Whop" is out of scope.
- testIDs: `commissionButton`, `commissionInput`, `commissionPay`,
  `commissionStatus`, `plusButton`, `paywallSheet`, `ownPaperLink`.
