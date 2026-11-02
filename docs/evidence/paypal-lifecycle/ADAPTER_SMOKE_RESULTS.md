# Adapter smoke run (Increment 3)

- Date: 2026-11-02
- Environment: PayPal sandbox (`https://api-m.sandbox.paypal.com`)
- Run by: the developer, with their own sandbox credentials and vault id
- Command: `pnpm --filter @ostensia/api smoke`, then the same with `--create`
- Source: the sanitized report that `apps/api/scripts/paypal-smoke.ts` prints,
  pasted by the developer. The script prints statuses, kinds and yes/no
  answers only. No ids, tokens or secrets appear. The pnpm lines that show a
  local path were left out.

## Without `--create` (read-only)

```
PayPal sandbox smoke run (sanitized)
1. vault check: ok
2. create order: skipped (pass --create to create one sandbox authorization)
RESULT: all steps that ran passed
```

## With `--create`

```
PayPal sandbox smoke run (sanitized)
1. vault check: ok
2. create order: created; order status COMPLETED (completed); authorizations in response: 1
3. get authorization:
   status: CREATED (created)
   amount in minor units: 100, currency: USD
   custom_id present: true; equals the hash that was sent (R1): true
   order id present: true; expiration present: true; days from create to expiry: 29
4. get order: status COMPLETED (completed); authorizations: CREATED (created)
NOTE: one sandbox authorization is still CREATED. Void it in Postman. This script never captures or voids.
RESULT: all steps that ran passed
```

## What this shows

Observed through the adapter, against the real sandbox, in one run:

- The vault check returned 200.
- Creating a vault order returned an order with status COMPLETED and exactly one
  authorization in the response, so no re-read was needed.
- GET authorization returned status CREATED, USD, and an amount that the
  adapter read as 100 minor units from PayPal's decimal string.
- **R1 is closed:** `custom_id` on GET authorization equals the hash that was
  sent.
- Expiry is 29 days after creation, as in E-1.
- GET order showed COMPLETED with one CREATED authorization.

## What this does not show

- Only the success path ran. Rejections, 5xx, timeouts, a 401 or an expired
  token, and the anomaly paths were not exercised against PayPal.
- R2, R3 and R4 (TD-014) are untouched.
- Whether the authorization created by this run was voided afterwards is not
  recorded here.
