# Ostensia PayPal Spike Findings

Evidence date: 2026-10-28 (UTC)
Latest known dispute-body debugging: 2026-10-29
Source workbook: Ostensia-spike-report.xlsx
The original workbook and unredacted runner reports are private references.

## 1. Summary of the evidence

The workbook consolidates 13 runner reports.

- 42 requests summed across reports.
- 41 deduplicated rows in the Request Log.
- 23 requests passed and 18 failed in the deduplicated log.
- 71 assertions; 24 failed assertions.
- Consolidated check matrix: 6 passed, 2 failed, 2 not run.

These totals are not a general product reliability score. The run set
includes exploratory requests, known runner bugs and failures that
cascaded after an earlier step did not succeed.

## 2. Demonstrated capabilities

### Vaulting
A setup token was created, the buyer manually approved it, and the
subsequent flow obtained an approved vault_id. The complete flow was
observed across multiple runs rather than in one uninterrupted run.

### Authorization using a previously approved vault
Creating an order with vault_id returned an already-authorized order
without a separate buyer redirect.

A subsequent explicit authorize call returned
ORDER_ALREADY_AUTHORIZED (HTTP 422). This is consistent with the
order already being authorized. Do not blindly issue another authorize
call after creating such an order; inspect and handle the actual state.

First-time vault setup did require manual buyer approval.

### Mandate-hash round-trip
The test's SHA-256 mandate hash was supplied through purchase_units[].custom_id
and read back unchanged in two runs.

This proves metadata round-tripping in the tested path. It does not prove
that PayPal enforces the mandate or that the hash is a signature.

### Capture
Capture completed in two runs using separate sandbox orders.

### Void
A sandbox authorization was voided and the VOIDED status was confirmed.
The void test was run once.

### Shipment tracking
Tracking was accepted with HTTP 201 in two runs.

## 3. Unresolved dispute creation

The buyer-side Create Dispute test did not succeed.

Observed sequence in the aggregate report:
- An earlier 401 invalid_subject occurred when buyer_email was empty.
- A later failure was 400: "No permissions to set target_client_id".
- Retrying with a buyer-side transaction ID did not resolve that error.

Additional debugging after the workbook was generated also returned
MISSING_OR_INVALID_REQUEST_BODY from the Create Dispute endpoint,
including attempts using Postman and cURL.

The root cause is unresolved. Do not infer that the transaction is
ineligible, that the request schema alone is wrong, or that disputes
are impossible without further evidence.

This endpoint is not a dependency of the hackathon's central payment flow.

## 4. Disputes created through the Resolution Center

Two UI-created disputes were readable through the API. Both remained
UNDER_REVIEW at stage INQUIRY and returned only a self link in the
observed details response.

The tested actions require-evidence, provide-evidence, adjudicate
and escalate were refused with ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE
for those dispute states.

Important: message, offer and accept were marked NOT RUN in the
consolidated Check Matrix. Do not report them as proven failures.

The report's prose summary generalizes the write-action failures more
broadly than the detailed Check Matrix supports. Prefer the specific
run observations and Check Matrix status.

## 5. Other test limitations

- Early buyer-token failures were partly caused by a runner fallback bug.
- An empty buyer_email environment variable caused one assertion failure.
- An empty dispute ID caused cascading 404s in an earlier run.
- Webhook simulation was NOT RUN.
- End-to-end webhook signature verification was NOT established by
  this spike.
- Dispute resolution and evidence submission were NOT demonstrated
  successfully through the desired API lifecycle.

## 6. Build decisions derived from the evidence

1. Reuse the tested PayPal request patterns as reference, after
   sanitizing the collection and environment.
2. Implement the policy decision in application code.
3. Validate the mandate and purchase before capture.
4. Handle the already-authorized vault-order path without issuing a
   duplicate authorize request.
5. Capture only after an explicit compliant result and a verified
   permitted payment state.
6. Block capture on violations; void only when the current state allows it.
7. Keep dispute integration behind an isolated boundary and outside
   the demo's critical path.
8. Do not claim webhook, dispute-write or production behavior is proven.
9. Convert important policy assertions into normal automated tests.
10. Use fresh, synthetic examples in public fixtures and documentation.

## 7. Evidence still required for future dispute integration

Before treating the Resolver as a real PayPal capability, establish:
- The exact supported authentication and permissions for the intended
  dispute API operation.
- The correct multipart body format and required fields for Create Dispute.
- A reproducible transaction and dispute-creation procedure.
- A dispute state that exposes the intended action link.
- A successful, permitted seller action in the sandbox.
- Webhook reception and signature verification, if webhooks are used.

Any future test must preserve request/response evidence with credentials
and unnecessary identifiers removed.

## 8. Safe scope boundary

For the current MVP, build and test the pre-capture mandate gate.
Any dispute scenario that is not successfully executed through PayPal
must be explicitly presented as a simulation.

Never use a mock response to claim a real PayPal operation succeeded.