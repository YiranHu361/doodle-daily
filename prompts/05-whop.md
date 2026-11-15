# Thread 5: Whop payments (after threads 2 and 3 merge)

Read `docs/WHOP.md` in full; it is the spec for this thread. Then read Whop's
own docs before writing any call, and follow them over our doc where they
differ: `docs.whop.com/developer/quickstart`,
`docs.whop.com/developer/guides/webhooks`,
`docs.whop.com/developer/guides/sandbox`, and the API reference for checkout
configurations, plans, payments and memberships. Do not guess API shapes.

Environment: `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET` and `WHOP_ENVIRONMENT=sandbox`
are set in this project's environment. Set them on the Convex deployment with
`npx convex env set`. Never print them. Refuse to create a checkout unless
`WHOP_ENVIRONMENT` is `sandbox`.

You own `convex/http.ts`, `convex/billing.ts`, `convex/commissions.ts`,
`convex/waitlist.ts` and `src/billing/`. You may add tables to the schema, add
the free-draw check to `pipeline:drawFreshOne`, add the optional `deviceId` and
`locked` flag to the archive queries, and extend the public allow-list test.
Keep the exports of `src/billing/index.ts` that other code imports. Touch `app/`
only to mount what `docs/WHOP.md` asks for.

## Build

1. The two plans (one-time $1 "Commission a comic", monthly $3 "Doodle Daily
   Plus") in the sandbox, ids stored as `WHOP_PLAN_COMMISSION` and
   `WHOP_PLAN_PLUS` on the deployment.
2. `commissions:start`: validate the topic or link, run the content filter and
   the image-cap check **before** creating the checkout, store the commission,
   create the hosted checkout with `metadata { kind: "commission", deviceId,
   commissionId }`, return the URL.
3. `billing:startPlusCheckout`: the same for the subscription with
   `metadata { kind: "plus", deviceId }`.
4. `POST /whop` HTTP action: verify the signature on the raw body as Whop's
   webhook guide specifies, ignore duplicate deliveries, answer 200 fast, then:
   commission paid, call `pipeline:drawFromBrief` and track the comic; Plus
   paid, write the entitlement; membership ended or payment failed, end Plus.
   Access is unlocked only by what the webhook writes, never by the browser
   closing.
5. `billing:status`, `commissions:mine`, `waitlist:join`, the 1-a-day free draw
   limit (`needs_plus`), and the locked archive for free readers.
6. App: the Commission button and sheet with live status, the paywall sheet,
   the PLUS tag, the combo freeze (turn on the hook thread 4 left: one forgiven
   day a week for Plus members), and the "Run your own paper" pitch screen with
   its waitlist button. Open checkout with `expo-web-browser`.
7. A failed commission after payment is marked failed, the reader is told, and a
   refund is issued through the API if the sandbox supports it.

## Tests

Signed webhook accepted, unsigned or tampered rejected, duplicate ignored;
commission and Plus paths from a fake signed event to the right records; banned
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
  paywall"; "the paywall has a Run your own paper link that opens a pitch
  screen".
- One pull request. List every difference between Whop's live docs and
  `docs/WHOP.md`, and anything you could not verify in the sandbox.
