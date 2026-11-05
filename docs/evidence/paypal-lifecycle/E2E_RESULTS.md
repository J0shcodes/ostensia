# End-to-end run through the API (Increment 5b)

- Date: 2026-11-05
- Environment: PayPal sandbox (`https://api-m.sandbox.paypal.com`)
- Run by: the developer, with their own sandbox credentials and vault id
- Command: `pnpm --filter @ostensia/api e2e`
- Source: the sanitized report that `apps/api/scripts/e2e.ts` prints, pasted by
  the developer. The script prints statuses and yes/no answers only. No ids,
  tokens or secrets appear. The run created two sandbox orders and moved $1.00
  of sandbox money once (one capture). It drives the API's own routes in memory
  (nothing listened on a port), with the real adapter and a real audit file.
- What it covers: the gate and the routes on the success path of each scenario
  below. It does not cover failure paths (timeouts, a pending capture, an
  unknown outcome), which are still tested only against the stub (TD-015). The
  purchases came from the simulated shopping agent and a synthetic catalogue
  (D-012).

```
Ostensia end-to-end sandbox run (sanitized)
VAULT: ok
RUNNING: two sandbox orders; one $1.00 capture
1. The simulated catalogue
   PASS  the catalogue is labelled simulated
2. A compliant purchase is captured
   PASS  create a mandate (201, status confirmed)
   PASS  simulated agent builds "compliant" and labels it simulated
   PASS  the attempt ends captured (got captured)
   PASS  PayPal saw one order and one capture, and no void
3. The same request again changes nothing
   PASS  the same attempt comes back, still captured
   PASS  no further PayPal call was made
4. A mandate is used once
   PASS  a second attempt on the spent mandate is refused (409 mandate_in_use)
   PASS  no PayPal call was made
5. A purchase over the unit-price limit is blocked before PayPal
   PASS  create a mandate (201, status confirmed)
   PASS  simulated agent builds "over_unit_price" and labels it simulated
   PASS  the attempt ends blocked_precheck (got blocked_precheck)
   PASS  an explanation is given
   PASS  no PayPal call was made
6. Revoke before settlement: the authorization is voided, not captured
   PASS  simulated agent builds "compliant" and labels it simulated
   PASS  authorize only: the attempt waits as authorized (got authorized)
   PASS  PayPal saw a second order, and no capture or void yet
   PASS  the mandate is revoked
   PASS  settle ends voided (got voided)
   PASS  PayPal saw one void, and still one capture
   PASS  the explanation says the mandate was revoked
7. The audit record
   PASS  the void was recorded before its result
8. A restart rebuilds the same state from the log
   PASS  a gate started from the same file has the same mandates and attempts
   PASS  the log replayed without warnings
RESULT: every step passed
```

## What this shows

- MVP steps 4 to 7 work through the API against the real sandbox: a compliant
  purchase was captured; a non-compliant one was blocked with no PayPal call; a
  purchase that became non-compliant after authorization (mandate revoked) was
  voided and not captured; an explanation and an audit record exist.
- The write-ahead order held in the real run: the void was recorded before its
  result.
- The stub adapter's behaviour matched the real sandbox on every step that ran.

## What it does not show

- Nothing about timeouts, rejected requests, a pending capture, an expired
  authorization, or any other failure path against PayPal.
- Nothing about AI drafting (Increment 6) or the UI (Increment 7).
