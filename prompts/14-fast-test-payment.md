# Thread 14: one-tap test payment, and no claim check in Promote

Start from the latest `main`. The demo is in under two hours. Open the pull
request within 20 minutes. Nothing else is running in parallel, but rebase on
`main` before you deploy or open the pull request.

## Part 1: pay in one tap in the sandbox

Why: Whop's hosted sandbox checkout has a ten-field card form that is slow and
error-prone on a phone, Apple Pay does not work in sandbox, and a payment just
failed in front of us. We need a payment that goes through Whop for real (sandbox)
without the form.

What I proved by hand against our sandbox, just now:

```
POST https://sandbox-api.whop.com/api/v1/payments
{ "account_id": "<WHOP_COMPANY_ID>",
  "member_id": "<WHOP_TEST_MEMBER_ID>",
  "payment_method_id": "<WHOP_TEST_PAYMENT_METHOD_ID>",
  "off_session": true,
  "line_items": [{ "variant_id": "<plan id>", "quantity": 1 }],
  "metadata": { "kind": "commission", "deviceId": "...", "commissionId": "..." } }
```

It answers in about 1.5 s with `{ id: "pay_…", status: "open", substatus:
"incomplete" }` (collection runs in the background). About 8 seconds later our
existing `/whop` webhook received `payment.succeeded` with the metadata, the
commission moved to `drawing`, and the comic was ready 46 s after the call. Note
the field is `account_id`, not `company_id`. The saved method is Whop's test Visa
4242 on a sandbox test member. `WHOP_TEST_MEMBER_ID` and
`WHOP_TEST_PAYMENT_METHOD_ID` are already set on the Convex deployment.

Build:

- `payWithTestCard` in `convex/lib/whop.ts` (the call above) and one public action
  `billing:payTest` with args `{ deviceId, secret, commissionId }`:
  - refuses unless `WHOP_ENVIRONMENT` is `sandbox` and both test variables are set
    (so it can never charge anyone in production);
  - checks `secret` against `DEMO_SECRET` in constant time, the same way
    `pipeline:drawFreshOne` does (the app has it as `EXPO_PUBLIC_DEMO_SECRET`);
  - the commission must belong to that device and be `awaiting_payment`; the plan
    is the one that commission was started with (`WHOP_PLAN_PROMO` for a promo,
    `WHOP_PLAN_COMMISSION` otherwise);
  - at most 10 test payments per device per day; stores the returned payment id on
    the commission so a double tap cannot pay twice;
  - returns quickly; the existing webhook does the rest. Add a watchdog: if no
    webhook has moved the commission 60 s after the call, fetch the payment from
    Whop once and apply its result through the same code path as the webhook.
- If the same call works for the Plus plan (a renewal variant), add
  `billing:payTestPlus` the same way. Try it once against the sandbox; if Whop
  refuses, leave Plus on the hosted checkout and say so. Do not spend more than
  five minutes on this.
- App, on every pay step (Promote, "Just for me", and Plus if it worked): when the
  app is in sandbox mode, the main button is **"Pay $5 with test card"** (or $1,
  $3). One tap, the sheet stays open and shows "Paying through Whop sandbox",
  then the existing statuses ("Paid", "Robo is drawing", "Your comic is live").
  Under it, a small text button "Open Whop checkout instead" keeps today's hosted
  page. The fine print reads "Whop sandbox: a saved test card is charged, no real
  money."
- A failed payment must never dead-end: when the commission shows a payment error,
  show the reason in one line and both buttons again.
- Add the new public functions to the allow-list test.

## Part 2: Promote no longer cross-checks claims

Remove the claim check from the Promote flow for now. Keep the code for
`promote:check` in the repo but do not call it.

- The link step stays and is still required: one field, "The link that backs it
  up". The server only checks that it is a well-formed https link
  (`parseLink` + `isRealSource`). No page fetch, no ticks and crosses, no
  "claims not checked" choice.
- `promote:start` keeps every claim in the brief (the ad rules and the safety
  filter still apply) and does not set `unverified` for a promo.
- The brief card shows the claims as a plain list. After the link is entered the
  next button is the pay step directly.
- On the card, the Reader's last page and the public story page, a sponsored comic
  shows "SPONSORED · by <name>" and the call-to-action button to the link, with the
  line "Source: <site>" in place of "Claims checked against <site>".
- Update the tests that expected dropped claims.

## Prove it

- `npm run check` passes.
- After rebasing on the latest `main`, deploy to the shared deployment and make
  one real sandbox test payment end to end through `billing:payTest` for a promo
  (use a harmless brief such as a made-up lemonade stand with the link
  `https://www.convex.dev`): report the seconds from the call to `payment.succeeded`
  and to the comic being ready. Then hide that test comic with `admin:setHidden`.
- One pull request. Say what you verified and what you did not. Skip Revyl.
