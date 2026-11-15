# Thread 5: Whop payments (after threads 2 and 3 merge)

Read `docs/WHOP-FINDINGS.md` first: it records real calls against our sandbox
(endpoints, shapes, the webhook signature scheme, what works) and it wins over
everything else. Then read `docs/WHOP.md` for the product design, with the
changes listed under "Direction" below. Use plain `fetch` and the WebCrypto
verifier described in the findings; do not guess API shapes.

Environment: `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET` and `WHOP_ENVIRONMENT=sandbox`
and `WHOP_COMPANY_ID` are set in this project's environment. Set them on the
Convex deployment with `npx convex env set`, together with the two plan ids that
already exist in the sandbox: `WHOP_PLAN_COMMISSION=plan_11KXzNpGFglYT` and
`WHOP_PLAN_PLUS=plan_yLXU6pnd4Kh6z` (do not create them again). The sandbox webhook
already points at `<deployment>.convex.site/whop` and sends `payment.succeeded`,
`payment.failed` and every `membership.*` event (names use dots). Never print them. Refuse to create a checkout unless
`WHOP_ENVIRONMENT` is `sandbox`.

You own `convex/http.ts`, `convex/billing.ts`, `convex/commissions.ts`,
`convex/waitlist.ts` and `src/billing/`. You may add tables to the schema, add
the free-draw check to `pipeline:drawFreshOne`, add the optional `deviceId` and
`locked` flag to the archive queries, and extend the public allow-list test.
Keep the exports of `src/billing/index.ts` that other code imports. Touch `app/`
only to mount what `docs/WHOP.md` asks for.

## Direction (replaces parts of docs/WHOP.md)

Three things a judge from Whop should see, in this order of importance:

- **Commission a comic** ($1, one-time): paste a link or a topic, pay, watch it drawn.
- **Doodle Daily Plus** ($3 a month) where **your combo pays for it**: every 7-day
  combo adds one free day to the membership through Whop's Extend Membership call.
- **Start your own paper**: anyone can open a paper on a niche and sell it; we
  create the Whop product and monthly plan for them through the API. This
  replaces the pitch-only screen and the waitlist.

## Build

1. `commissions:start`: validate the topic or link, run the content filter and
   the image-cap check **before** creating the checkout, store the commission,
   create the hosted checkout with `metadata { kind: "commission", deviceId,
   commissionId }`, return the URL.
2. `billing:startPlusCheckout`: the same for the subscription with
   `metadata { kind: "plus", deviceId }`.
3. `POST /whop` HTTP action: verify the signature on the raw body exactly as the
   findings describe, ignore duplicate deliveries (dedupe on `webhook-id`),
   answer 200 within 5 seconds, then: commission paid, call
   `pipeline:drawFromBrief` and track the comic; Plus or paper membership active,
   write the entitlement with its `membership_id` and period end; membership
   deactivated or payment failed, end it. Access is unlocked only by what the
   webhook writes, never by the browser closing.
4. `billing:status`, `commissions:mine`, the 1-a-day free draw limit
   (`needs_plus`), and the locked archive for free readers.
5. **Combo pays for Plus**: `billing:claimComboReward({ deviceId, comboDays })`.
   For a Plus member whose combo has reached a new multiple of 7, call
   `POST /memberships/{id}/extend` with `{ days: 1 }`, record the claim so each
   milestone pays once (and never more than one claim per 6 days per membership),
   and return the new period end. The app calls it when the celebration shows a
   multiple of 7 and adds one line to the celebration: "Robo paid for a day.
   Plus now runs to <date>." The Plus sheet shows "Free days earned: N". A reader
   without Plus sees "Plus members earn a free day every 7-day combo" on the
   paywall. Also keep the combo freeze from docs/WHOP.md (one forgiven day a week
   for Plus).
6. App: the Commission button and sheet with live status, the paywall sheet, the
   PLUS tag. Open checkout with `expo-web-browser`.
7. A failed commission after payment is marked failed, the reader is told, and a
   refund is issued through the API if the sandbox supports it.
8. **Start your own paper** (do this last; if time is short, open the pull
   request with items 1 to 7 first and continue in a second one):
   - `papers:create({ deviceId, name, niche, priceUsd })`: validate (name up to 30
     characters, niche up to 80, price 1 to 20, content filter on both), create a
     Whop product and a monthly variant through the API (remember the findings'
     note that `initial_price` must be 0 on a renewal variant), store a `papers`
     row with the product id, plan id and hosted `purchase_url`, and start one
     sample comic about the niche through `pipeline:drawFromBrief`
     (`kind: "paper-sample"`, counted against the image cap). At most 2 papers per
     device.
   - `papers:list({ deviceId })`: the papers with name, niche, price, sample comic,
     subscriber count, and whether this device has subscribed (`locked`).
   - `papers:startCheckout({ deviceId, paperId })` with
     `metadata { kind: "paper", deviceId, paperId }`; the webhook unlocks it.
   - App: a "Papers" row in Today's footer opening a shelf: "Doodle Daily" (the
     free paper) first, then each paper as a card with its sample comic's first
     panel, price and a Subscribe button, and a "Start your own paper" card that
     opens a three-field form. After creating, the owner sees "Your paper is live"
     with the checkout link to copy or share, and the line "Whop handles checkout,
     members and payouts; new Whop products come with a 30% affiliate programme".
   - Be honest in the UI: a new paper has one sample comic; daily issues for
     papers are labelled "starts tomorrow".

## Tests

Signed webhook accepted, unsigned or tampered rejected, duplicate ignored;
commission, Plus and paper paths from a fake signed event to the right records;
a combo reward pays once per milestone and is refused for a non-member; banned
topic refused before any checkout exists; free-draw limit and reset at Pacific
midnight; locked archive for free, open for Plus; sandbox guard.

## Prove it

- `npm run check` passes.
- On the deployment: start a commission for the topic "a robot learns to fold
  laundry", pay in the hosted checkout with card 4242 4242 4242 4242 (any future
  expiry, any CVC), confirm the webhook arrived (show the record, not a secret)
  and that a 4-panel comic appeared in today's issue. Do the same for Plus and
  show `billing:status` before and after.
- Build the iOS app on Revyl as a standalone simulator build, with the JavaScript
  bundled and `EXPO_PUBLIC_CONVEX_URL` set, then install it on a cloud iPhone.
  Check in plain English: "tapping Commission opens a sheet with a text field
  and a Pay $1 button"; "after paying with the test card the sheet shows the
  comic being drawn"; "a second Draw a fresh one on the same day shows the Plus
  paywall"; "the Papers shelf shows Doodle Daily and a Start your own paper card".
- On the deployment, show Extend Membership working from our code: call
  `billing:claimComboReward` for the test Plus membership and show the period end
  before and after. Create one paper ("Founder Daily", niche "startup and YC
  news", $3) and show its Whop product id, plan id and checkout URL.
- One pull request. List every difference between Whop's live docs and
  `docs/WHOP.md`, and anything you could not verify in the sandbox.
