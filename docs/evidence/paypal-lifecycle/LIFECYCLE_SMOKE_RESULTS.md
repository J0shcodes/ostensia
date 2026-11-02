# Adapter lifecycle run (Increment 4)

- Date: 2026-11-02
- Environment: PayPal sandbox (`https://api-m.sandbox.paypal.com`)
- Run by: the developer, with their own sandbox credentials and vault id
- Command: `pnpm --filter @ostensia/api smoke`, then the same with `--lifecycle`
- Source: the sanitized report that `apps/api/scripts/paypal-smoke.ts` prints,
  pasted by the developer. The script prints statuses, kinds and yes/no
  answers only. No ids, tokens or secrets appear. The pnpm lines that show a
  local path were left out. The run moves $1.00 of sandbox money once.

## Without `--lifecycle` (read-only)

```
PayPal sandbox smoke run (sanitized)
VAULT: ok
LIFECYCLE: skipped (pass --lifecycle to run the capture and void paths; it moves $1.00 of sandbox money once)
RESULT: all steps that ran passed
```

## With `--lifecycle`

```
PayPal sandbox smoke run (sanitized)
VAULT: ok
LIFECYCLE: running (two sandbox orders; one $1.00 capture)
CAPTURE PATH
1. create order: created; order status COMPLETED (completed); authorizations in response: 1
2. get authorization: status CREATED (created); amount 100 USD; days to expiry 29
   PASS  authorization is CREATED before the capture
   PASS  custom_id equals the hash that was sent (R1)
3. capture: accepted; status COMPLETED (completed); amount 100 USD
   PASS  capture is COMPLETED
4. replay of the capture: accepted; status COMPLETED (completed)
   PASS  replay returns the same capture id and status
5. get authorization after capture: status CAPTURED (captured)
   PASS  authorization is CAPTURED (R2)
6. get order after capture: status COMPLETED (completed); captures: COMPLETED (completed)
   PASS  exactly one capture exists after the replay (R3)
7. void after capture: already settled: PREVIOUSLY_CAPTURED (status 422)
   PASS  void is refused with PREVIOUSLY_CAPTURED
VOID PATH
1. create order: created; order status COMPLETED (completed)
2. void (confirmed by a read): voided
   PASS  void is confirmed as VOIDED
3. capture after void: already settled: AUTHORIZATION_VOIDED (status 422)
   PASS  capture is refused with AUTHORIZATION_VOIDED
RESULT: every step passed
RESULT: all steps that ran passed
```

(The two `RESULT:` lines were printed by the script as it was run. The
lifecycle's own line is now labelled `LIFECYCLE RESULT:`.)

## What this shows

Observed through the adapter, against the real sandbox, in one run:

- A capture of a vault-order authorization completed with status COMPLETED
  and the authorized amount (100 minor units, USD).
- A replay of the capture with the same attempt id was accepted and returned
  the same capture id and status. The report does not print the HTTP status;
  E-1 recorded 200 for the replay.
- **R2 is closed:** the authorization read CAPTURED after the capture, through
  the adapter.
- **R3 is closed:** the order's captures were read from
  `purchase_units[].payments.captures` and there was exactly one, COMPLETED,
  after the replay.
- A void after the capture was refused with 422 PREVIOUSLY_CAPTURED.
- A void on a second authorization returned success and a read confirmed
  VOIDED, and a capture afterwards was refused with 422 AUTHORIZATION_VOIDED.
- Every authorization this run created was settled (one captured, one
  voided), and no sandbox id was printed, so the cleanup path did not run.

## What this does not show

- Only the success path ran. Rejections, 5xx, timeouts, a 401, an expired
  token, a pending capture and the anomaly paths were not exercised against
  PayPal (TD-015).
- The lifecycle's cleanup path (void after an unsettled step) was not run
  against PayPal. It is tested only against a stub.
- The authorization left open by the Increment 3 `--create` run is not
  affected by this run (TD-017).
