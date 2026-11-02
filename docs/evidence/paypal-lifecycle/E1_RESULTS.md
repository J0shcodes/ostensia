# E-1 Results: PayPal Authorization Lifecycle

- Test date: 2026-11-02
- Environment: PayPal sandbox (`https://api-m.sandbox.paypal.com`)
- Placeholders: Order `<ORDER_CAPTURE_1>`, Auth `<AUTH_CAPTURE_1>`, Capture `<CAPTURE_1>`, Order `<ORDER_VOID_1>`, Auth `<AUTH_VOID_1>`
- Sequence: E1-C.0 to C.7, then E1-V.1 to V.5 (no `/authorize` call used)

## Capture path

| Test | HTTP | Observed |
|---|---|---|
| Vault token check (C.0) | 200 | Readable (second attempt, see Unexpected errors) |
| Create vault order | 201 | order status: COMPLETED |
| Authorization in create response | n/a | present (<AUTH_CAPTURE_1>), status: CREATED  |
| GET order fallback (C.2) | n/a (not sent) | Not needed: authorization was in the create response |
| GET authorization | 200 | status: CREATED / amount: 72.00 / currency: USD / expiry: 2026-12-01T12:29:15Z |
| Capture (C.4) | 201 | capture: `<CAPTURE_1>` / status: COMPLETED / amount: 72.00 |
| Capture replay (same request ID) | 200 | same capture ID observed and same status of COMPLETED |
| Duplicate capture created? (C.6) | 200 | captures count: 1 |
| Void after capture (C.7) | 422 | error name: Unprocessable Entity / issue: PREVIOUSLY_CAPTURED |

## Void path

| Test | HTTP | Observed |
|---|---|---|
| Create second vault order | 201 | order status: COMPLETED |
| Authorization | n/a | present (<AUTH_VOID_1>), status: CREATED |
| GET authorization (V.2) | 200 | status: CREATED / amount: 72.00 / currency: USD / expiry: 2026-12-01T12:55:36Z |
| Void (V.3) | 204 | body empty |
| GET after void (V.4) | 200 | status: VOIDED |
| Capture after void (V.5) | 422 | error name: Unprocessable Entity / issue: AUTHORIZATION_VOIDED |

## Acceptance

- [x] Vault-order request produces an authorization
- [x] Order status recorded
- [x] Pre-capture authorization status recorded
- [x] Amount, currency, expiry recorded
- [x] Capture behaviour recorded
- [x] Replay with same request ID tested
- [x] Void-after-capture recorded
- [x] Separate authorization voided
- [x] GET confirms VOIDED
- [x] Capture-after-void recorded

## Unexpected errors / unresolved questions

- C.0 initially returned 404 `RESOURCE_NOT_FOUND` on the vault token. Resolved by re-running vault setup (01a/01b) with matching credentials; C.0 passed on the second attempt. Setup issue, not a lifecycle finding.
- No other unexpected errors. All `EXPECTATION:` checks in both paths matched PayPal's documented behavior.
- Note (not an error): the order status returned by the create-order call was `COMPLETED` in both paths, not `APPROVED`. The previous spike accepted either without distinguishing them; E-1 confirms `COMPLETED` is what this vault flow actually returns.

## Verdict

PASS: every E-1 acceptance condition is met and all observed behavior (authorization creation, capture, idempotent replay, single capture on replay, void-after-capture refusal with `PREVIOUSLY_CAPTURED`, independent void, confirmed `VOIDED`, capture-after-void refusal with `AUTHORIZATION_VOIDED`) matches what the PayPal adapter in Increment 3 will need to reproduce.

## Addendum (2026-11-02): details supplied by the developer after review

The original tables above are unchanged except for the placeholders and the
test date (the date comes from the `create_time` of the first authorization).
Everything below was reported by the developer after the run. It was not in
the original run notes, and the HTTP status of the reads below was not
recorded.

- **Fields on GET authorization** (field names only; values were redacted in
  the copy shared): id, status, amount (currency_code, value), invoice_id,
  custom_id, seller_protection, supplementary_data.related_ids.order_id,
  payee, expiration_time, create_time, update_time, links (self, capture,
  void, reauthorize, up).
  - `custom_id` is present on this resource. Its value was not shared, so
    that it equals the mandate hash on this resource is not evidenced here.
    The spike showed the round-trip on the order (spike-findings.md).
  - `create_time` is 2026-11-02T12:29:15Z and `expiration_time` is
    2026-12-01T12:29:15Z, which is exactly 29 days later.
- **After the capture:** the order status was COMPLETED and the authorization
  status was CAPTURED (developer-reported).
- **The 404 on C.0:** the developer's explanation is that the setup-token id
  was used where the vault id (payment token) belongs. This replaces the
  "matching credentials" wording in the section above. Whether the earlier
  spike `vault_id` is still valid was not tested.
- **Captures count (C.6):** request E1-C.6 in the collection is a GET on the
  order, so the count came from the order read. The field path was not
  recorded.
- **Request definitions:** `ostensia-e1.postman_collection.json` in this
  folder.
  - The create-order body has `payment_source.paypal.vault_id` and no
    `stored_credential`.
  - The capture body is `{"final_capture": true}`.
  - The replay (C.5) reuses the identical request id, body and
    authorization.
  - Void bodies are `{}`.

Project assessment of the gate: see docs/BUILD_STATUS.md and D-019. The
verdict above is the developer's own.
