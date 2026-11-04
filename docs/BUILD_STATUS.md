# BUILD_STATUS

Compact status note. Read this first at the start of every session.

Last updated: 2026-11-02

## Status

- **Current increment:** Increment 5a — the gate core (no HTTP): mandates,
  the attempt state machine, the audit log, the state rebuilt from it,
  authorize, settle, run and reconcile. Implemented and verified against a
  stub adapter on branch feat/gate-store-and-api (from main at 27edf3d);
  awaiting the walkthrough, comprehension questions and commit authorization.
  It has never run against the real sandbox: the gate is not wired to the
  server, and 5b adds the routes and the end-to-end sandbox run.
- **Passed:**
  - Repository audit (2026-10-29).
  - Directory rename, MIT license and decisions D-001 to D-005,
    committed in 5d426d5.
  - Increment 0 (documentation and decision records, D-006 to D-013),
    committed in 41632a4.
  - Increment 1 (workspace and /health), committed in d916d84 and b2cd853
    and merged to main through PR #1 (01afa89).
  - Increment 2a (domain schemas, canonical hashing, pre-check evaluator),
    committed in 4a4de58 and 2fd55f8 on feat/01-domain-policy. Checks: 257
    tests, 16 of 16 deliberate rule mutations caught.
  - Increment 2b (final evaluation, PayPal status mappings, payment-action
    rule), committed in d95cd6d and 6817a58. Checks (2026-10-31): 466 tests
    in 15 files, typecheck clean, 18 of 18 deliberate rule mutations caught,
    and GET /health returns 200 from a real node process. Increment 2 was
    merged to main through PR #2 (4484fc5).
  - E-1 evidence and D-019, committed in 6393471.
  - Increment 3 (PayPal adapter: token, vault check, create order, reads),
    committed in d98e76e and 8fa99c5 and merged to main through PR #3
    (c900015). Checks: 723 tests, 31 of 31 mutations caught; the developer's
    sandbox smoke run passed on the success path.
  - Increment 4 (capture and void in the adapter, `smoke --lifecycle`),
    committed in e5ae3b4 and 07ad473 and merged to main through PR #4
    (27edf3d). Checks: 827 tests, 22 of 22 mutations caught; the developer's
    sandbox lifecycle run passed every step.
  - Increment 5a checks (2026-11-02), all against a stub adapter (D-011):
    pnpm test passes (33 files, 1124 tests), pnpm typecheck passes, 30 of 31
    deliberate rule mutations were caught (the survivor is the fsync of the
    log, which a test cannot observe), and GET /health returns 200 from a real
    node process. Nothing was sent to PayPal.
- **Broken:** The spike runner (docs/evidence/spike/scripts/run-spike.js)
  points to countersign-spike.* files and a SPIKE_README.md that do not
  exist (TD-001). The application does not use it.
- **Not yet existing (expected):** HTTP routes, the synthetic catalogue and
  simulated-agent scenarios, AI integration, the frontend. The PayPal adapter
  (apps/api/src/paypal/) and the gate (apps/api/src/gate/) exist but are not
  wired into the server. The audit file path is not configured yet (5b); no
  audit file exists.
- **Sandbox smoke run, Increment 3 (done 2026-11-02 by the developer):** the
  read-only run and the `--create` run both passed on the success path; R1 is
  closed. The sanitized report is in
  docs/evidence/paypal-lifecycle/ADAPTER_SMOKE_RESULTS.md. That `--create` run
  left one authorization in status CREATED, whose id was not recorded, so it
  cannot be voided; it expires by itself about 29 days after 2026-11-02
  (TD-017). `--create` no longer exists.
- **Sandbox lifecycle run, Increment 4 (done 2026-11-02 by the developer):**
  `pnpm --filter @ostensia/api smoke --lifecycle` created two sandbox orders,
  captured one ($1.00), replayed the capture, voided the other, and checked the
  refusals. Every step passed, including R1, R2 and R3, and no authorization
  was left open. The sanitized report is in
  docs/evidence/paypal-lifecycle/LIFECYCLE_SMOKE_RESULTS.md. It covers the
  success path only (TD-015).
- **Next approved task:** None. Increment 5b (routes, catalogue, scenarios,
  end-to-end sandbox run) needs its own proposal and approval after 5a.
- **Next comprehension gate:** Increment 5a walkthrough.

## Evidence gates

- **E-1, PayPal lifecycle (run by the developer in Postman on 2026-11-02;
  results in docs/evidence/paypal-lifecycle/E1_RESULTS.md).** Reviewed on
  2026-11-02 against these criteria:

  | Criterion | Result |
  |---|---|
  | Order status and authorization status | Observed: COMPLETED and CREATED |
  | Authorization expiration_time | Observed: 29 days after create_time |
  | Capture status | Observed: COMPLETED |
  | Replay with the same PayPal-Request-Id | Observed: 200, same capture id, one capture |
  | Void-after-capture refusal | Observed: 422 PREVIOUSLY_CAPTURED |
  | Capture-after-void refusal | Observed: 422 AUTHORIZATION_VOIDED |
  | Void and confirmation | Observed: 204, then GET shows VOIDED |
  | Post-capture statuses | Developer-reported: order COMPLETED, authorization CAPTURED |
  | Whether the vault_id is still valid | The 404 was an identifier mix-up (setup token used as vault id), per the developer. The earlier spike vault_id was not tested. |

  The lifecycle conditions are met. The developer closed E-1 for the
  Increment 3 proposal (2026-11-02) and, on terms recorded in D-021
  (2026-11-02), for the Increment 4 implementation. Those terms are now met:
  R1 was closed by the Increment 3 smoke run, R2 and R3 by the `smoke
  --lifecycle` run (LIFECYCLE_SMOKE_RESULTS.md), and R4 was closed as not
  needed. TD-014 is resolved, so **E-1 is closed**. The adapter contract
  points are in D-019 (Accepted).

## Increment roadmap

Each increment needs separate approval.

| # | Increment | Status |
|---|---|---|
| 0 | Documentation and decision records | Complete (41632a4) |
| 1 | Workspace and Fastify /health | Complete (d916d84, b2cd853; merged in 01afa89) |
| 2a | Domain: schemas, canonical hash, pre-check evaluator, explanations | Complete (4a4de58, 2fd55f8) |
| 2b | Domain: final evaluation, PayPal status mappings, payment-action rules | Complete (d95cd6d, 6817a58; merged in 4484fc5) |
| 3 | PayPal adapter: token, vault check, create order, read order and authorization | Complete (d98e76e, 8fa99c5; merged in c900015); success path confirmed by the developer's sandbox smoke run |
| 4 | Capture and void in the adapter, and the sandbox lifecycle run | Complete (e5ae3b4, 07ad473; merged in 27edf3d); the developer's `smoke --lifecycle` run passed every step (R2, R3 closed; E-1 closed) |
| 5a | Gate core: mandates, attempts, audit log, authorize, settle, reconcile (no HTTP) | Implemented against a stub adapter; awaiting walkthrough and commit |
| 5b | Routes, synthetic catalogue, simulated-agent scenarios, end-to-end sandbox run | Not started; needs its own proposal |
| 6 | AI mandate drafting | Not started; provider undecided |
| 7 | Next.js frontend | Not started |
| 8 | Demo hardening and publication review | Not started |

## Earlier generated code

Code generated without approval is preserved on backup/unapproved-codegen,
feat/repo-bootstrap and stash 1579901. It remains unapproved and is not
reused automatically (D-013).

## Guardrails for Git, tests, dependencies and secrets

Use these rules for the entire build.

### Git and branching

Keep a stable `main` branch and work on one feature branch for the MVP, or use a simple branch-per-increment strategy if you are comfortable with it. Commit after each completed and verified increment, for example `feat/mandate-review` or `test/policy-engine`. Don't let Claude amend previous commits, reset branches or push code without approval.

### Tests

Require a test for every deterministic policy rule and a reproducible test of each core payment path. Test the expected negative path just as seriously as the positive path. For sandbox operations, use the smallest reliable integration test set and record the real request/result evidence with secrets removed.

### Dependencies

Claude must explain any proposed package in terms of need, alternatives, version compatibility, bundle/runtime impact and maintenance cost before adding it. If a feature can reasonably be implemented with the existing stack, don't add another library just because it is convenient.

### Secrets

Keep secrets out of browser-accessible code, public files, commits and logs. Use a `.env.example` with variable names but no real values. Rotate exposed credentials if they are accidentally committed or recorded.

### Ask before

Any framework or architecture change, new service, new database, payment behavior change, sensitive configuration change, destructive migration, file deletion, new external API, deployment, Git push, commit, licensing change or substantial scope expansion.
