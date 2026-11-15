# Whop sandbox spike: findings (2026-11-15)

All calls were real, against `https://sandbox-api.whop.com/api/v1` with `Authorization: Bearer $WHOP_API_KEY`
(account `biz_tG3czpaGV4BMlu`, "Ambees"). Live OpenAPI `x-api-version-date` is `2026-11-14-1`.
Where this differs from docs/WHOP.md, this file wins.

## Plan ids to keep

```
WHOP_PLAN_COMMISSION=plan_11KXzNpGFglYT   # product prod_QRS3ac7ualOPi "Doodle Daily Commission", one_time $1
WHOP_PLAN_PLUS=plan_yLXU6pnd4Kh6z         # product prod_p9PWOeuSvJr8g "Doodle Daily Plus", renewal 30 days $3
```

Whop now calls plans **variants**: `POST /plans` is a deprecated alias of `POST /variants`; ids still start with `plan_`.
Kept on purpose: the two products and variants above, two test memberships on them (`mem_xXgxylsepImROq`, `mem_6rINo2rRWiVA3O`,
buyer `user_6gaG9ydn81agP`) and their payments. Deleted/archived: promo code `promo_xuvCMsIH2MUk`, affiliate `aff_2QKuFI5cDe5o0Q`.

## Summary

| # | Item | Result |
| - | ---- | ------ |
| 1 | Product + one-time $1 and monthly $3 variants | **works** |
| 2 | Checkout configuration with metadata, hosted URL, card 4242 | **works** (both plans paid) |
| 3 | Webhook signature scheme | **works** (verified locally with the real secret; no live delivery captured) |
| 3 | Live payload of payment.succeeded / membership.activated | **not tried**: key lacks webhook scope, and Convex has no `/whop` route yet |
| 4 | List/retrieve memberships, valid-access check | **works** |
| 5 | Extend Membership (free days) | **works** on the renewal plan; **fails** on one-time |
| 6 | Promo codes | **works** (create/delete via API; field on hosted checkout) |
| 7 | Affiliates | create **works**; assign to membership **fails** (owner self-referral); checkout `affiliate_code` accepted but not attributed |
| 8 | @whop/sdk in Convex default runtime | **not tried in Convex**; bundles for a neutral (non-Node) target, so likely works |

## 1. Products and variants

- `POST /products` `{ "title", "description", "visibility": "visible" }` -> `{ id: "prod_…", route, variants: [], global_affiliate_status: "enabled", global_affiliate_percentage: 30.0, … }`.
  New products get a 30% global affiliate program by default; set `global_affiliate_status: "disabled"` if unwanted.
- `POST /variants` one-time: `{ product_id, title, billing_type: "one_time", initial_price: 1, currency: "usd", visibility: "visible", release_method: "buy_now" }`.
- `POST /variants` monthly: `{ …, billing_type: "renewal", billing_period: 30, initial_price: 0, renewal_price: 3 }`.
- **Gotcha:** on a renewal variant `initial_price` is charged *in addition to* the first period. `initial_price: 3, renewal_price: 3`
  gave `initial_price_due.amount: "6.00"`; fixed with `PATCH /variants/{id}` `{ initial_price: 0 }` -> "3.00", "$3.00 / month".
- Response has `purchase_url` (`https://sandbox.whop.com/checkout/plan_…`), `formatted_price`, `deletable`, `metadata`.
- Every response carries a `recommended_action` upsell string ("Economic Intelligence"); ignore it.

## 2. Checkout configuration

`POST /checkout_configurations`
```json
{ "variant_id": "plan_11KXzNpGFglYT", "redirect_url": "https://example.com/done",
  "metadata": { "kind": "commission", "deviceId": "spike-device", "commissionId": "spike-c1" } }
```
-> `{ id: "ch_TIuGIUeGATQ3psn", mode: "payment", variant: {…}, metadata: {…}, affiliate_code: null,
  purchase_url: "https://sandbox.whop.com/checkout/ch_TIuGIUeGATQ3psn/" }`. Other fields: `affiliate_code`, `currency`, `mode`
(`payment`|`setup`), `variant` (inline variant instead of `variant_id`), `payment_method_configuration`, `three_ds_level`.

Completed in a browser with 4242 4242 4242 4242, 12/34, CVC 123, email, name and a US address (the form needs a full billing
address). No Whop login needed. After paying, the browser lands on
`redirect_url?receipt_id=…&payment_id=…&checkout_status=…&status=…&state_id=…` (do not trust these; wait for the webhook).

**Metadata propagates**: the checkout's metadata appears verbatim as `metadata` on the payment (`GET /payments/{id}`) and on the
membership, and the payment also carries `checkout_configuration_id`. Result: `pay_hrauTbesj3LCZ0`, `status: "paid"`,
`substatus: "succeeded"`, `billing_reason: "one_time"`, `total.amount: "1.00"`, `amount_after_fees: "0.57"`, `membership_id`,
`user.id`, `product_id`, `variant_id`, `refundable: true`. The Plus checkout (`ch_OIxAkhIaZ95r0gN`) produced an `active` membership.
Money fields are objects `{ currency, amount: "1.00", decimals }`, not numbers.

## 3. Webhooks

Standard Webhooks spec. Headers `webhook-id`, `webhook-timestamp` (unix seconds), `webhook-signature: v1,<base64>`
(space-separated list if several). Signature = base64(HMAC-SHA256(key, `${id}.${timestamp}.${rawBody}`)) where
**key = the UTF-8 bytes of the whole `ws_…` secret** (not base64-decoded, prefix not stripped; the SDK helper does exactly this).
Verify on the raw body before parsing, compare in constant time, reject timestamps more than ~5 minutes off. Answer within 5 s or Whop retries.

Verified: I signed a payment.succeeded envelope with `WHOP_WEBHOOK_SECRET` using only WebCrypto (`crypto.subtle`, as in Convex),
and `unwrapWebhook` from `@whop/sdk/helpers` 2.8.1 accepted it; a tampered body failed ("No matching signature found") and a
1-hour-old timestamp failed ("Message timestamp too old").

Envelope (docs, API version 2026-08-14+; older pins send `company_id` instead of `account_id`):
```json
{ "id": "msg_…", "type": "payment.succeeded", "api_version": "v1", "api_version_date": "2026-08-14",
  "timestamp": "2026-08-10T17:03:24.291Z", "account_id": "biz_…", "data": { "id": "pay_…", "…": "full Payment object" } }
```
`data` for payment.succeeded is the Payment object above (includes `metadata`, `membership_id`, `user`); for
membership.activated it is the Membership object in section 4 (includes `metadata`, `status`, `current_period_end`).
Use `webhook-id`/`id` as the dedupe key. Event names use dots (`payment.succeeded`, `payment.failed`,
`membership.activated`, `membership.deactivated`, all present in the spec), not the underscores in docs/WHOP.md.

Not captured live: `GET/POST /webhooks` returns 403 "Company API key is not authorized for the developer:manage_webhook scope",
so I could not add a capture endpoint or read deliveries, and the registered URL (`…convex.site/whop`) has no handler yet
(no `convex/http.ts`). Two real payments were made, so deliveries should be visible in the sandbox dashboard's Developer tab.
Also check that webhook subscribes to `membership.activated`/`membership.deactivated`, not only payments.

## 4. Memberships and valid access

- `GET /memberships?account_id=…&user_id=user_…` (also `product_id(s)`, `variant_id(s)`, `status`/`statuses`, cursor `first`/`after`) -> `{ data: [...], page_info }`.
- `GET /memberships/{id}` -> `{ id, status, user_id, member_id, product_id, variant_id, current_period_start, current_period_end,
  expires_at, cancel_at_period_end, canceled_at, metadata, affiliate, promo_code_id, manage_url, … }`.
- Observed: one-time $1 -> `status: "completed"`, no period. Plus -> `status: "active"`, `current_period_end` +30 days.
- There is no `valid` boolean. `status` enum (spec): trialing, active, past_due, completed, canceled, expired, unresolved, drafted.
  Treat Plus as valid when `status` is `active` or `trialing` and `current_period_end` is in the future (a membership set to
  cancel stays `active` with `cancel_at_period_end: true`). Spec also has `membership.went_valid` / `membership.went_invalid` events. We have no Whop user per device, so store `membership_id` from the webhook
  (metadata.deviceId maps it) and re-read `GET /memberships/{id}` rather than listing by user.

## 5. Extend Membership

`POST /memberships/{id}/extend` `{ "days": 7 }` with this (Admin) key:
- Plus `mem_6rINo2rRWiVA3O`: **works**, 200, `current_period_end` 2026-12-15 -> 2026-12-22.
- One-time `mem_xXgxylsepImROq`: **fails**, 400 "This membership can't be extended."

## 6. Promo codes

`POST /promo_codes` required: `account_id, code, amount_off, base_currency, promo_type ("percentage"|"flat_amount"),
new_users_only, promo_duration_months`; optional `product_id`, `variant_ids`, `unlimited_stock`, `stock`, `expires_at`, `one_per_customer`.
**Works**: `{ code: "DOODLESPIKE50", amount_off: 50, promo_type: "percentage", product_id: Plus, … }` -> `promo_…`, code stored
lowercased, `amount_off` returned as `0.5`, `duration: "once"`. `DELETE /promo_codes/{id}` works. The hosted Plus checkout shows an
"Add promo code" button (the $1 one-time checkout did not). Checkout configurations have no promo field; `POST /memberships/{id}/apply_promo_code` exists (not tried).

## 7. Affiliates

- `POST /affiliates` `{ account_id, user_identifier: "<username>" }` **works** -> `aff_…`. `POST /affiliates/{id}/archive` works.
- `POST /memberships/{id}/assign_affiliate` `{ username|user_id|email, commission_type: "percentage"|"flat_fee", commission_value }`
  **fails** with 400 "You cannot be referred by the owner of the company." (the only user I had was the owner). Per the spec it
  needs an active recurring membership; retry with a non-owner user.
- Checkout `affiliate_code: "humidstable"` is accepted and echoed, but the resulting membership had `affiliate: null`
  (same owner restriction presumably). Not proven with a non-owner affiliate.

## 8. @whop/sdk in Convex

`@whop/sdk` 2.8.1 ESM: named exports only (`WhopClient`, `WhopEnvironment`, no default export), one dependency
(`standardwebhooks`), no `node:` imports. esbuild `--platform=neutral` bundles client plus `unwrapWebhook` (2.6 MB) with
only a guarded `Buffer` mention. Use `new WhopClient({ token, environment: WhopEnvironment.Sandbox })`. Not run inside Convex.
Recommendation: plain `fetch` for the ~4 calls we need and the WebCrypto verifier above (~20 lines). That keeps the bundle small and works in the default runtime.
