# BUILD_STATUS

Compact status note. Read this first at the start of every session.

Last updated: 2026-11-02

## Status

- **Current increment:** Increment 3 — PayPal adapter (token, vault check,
  create order, read order and authorization). Complete on branch
  feat/03-paypal-adapter (created from main at 4484fc5): code committed in
  d98e76e, records in the docs commit that follows it. Not pushed or merged
  yet. The automatic tests use a fake PayPal; the developer's smoke run
  exercised the success path against the real sandbox (see below).
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
  - Increment 3 checks (2026-11-02), all against a fake fetch built from the
    E-1 response shapes with synthetic values (D-011): pnpm test passes (23
    files, 723 tests), pnpm typecheck passes, 31 of 31 deliberate rule
    mutations were caught, GET /health returns 200 from a real node
    process, and the smoke script's configuration errors print only variable
    names. Nothing was sent to PayPal.
- **Broken:** The spike runner (docs/evidence/spike/scripts/run-spike.js)
  points to countersign-spike.* files and a SPIKE_README.md that do not
  exist (TD-001). The application does not use it.
- **Not yet existing (expected):** capture and void code, the gate, routes
  and store, AI integration, persistence, the frontend. The PayPal adapter
  exists in apps/api/src/paypal/ but is not wired into the server.
- **Sandbox smoke run (done 2026-11-02 by the developer):** the read-only
  run and the `--create` run both passed on the success path; R1 is closed.
  The sanitized report is in
  docs/evidence/paypal-lifecycle/ADAPTER_SMOKE_RESULTS.md. The `--create`
  run left one authorization in status CREATED, which the developer voids in
  Postman (not recorded). Failure paths have not been exercised against
  PayPal (TD-015).
- **Next approved task:** None. Increment 4 needs a separate approval, and
  E-1 stays open for it (R1 to R4).
- **Next comprehension gate:** None open. The Increment 3 walkthrough was
  done; the developer skipped the second set of re-check questions.

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
  Increment 3 proposal only (2026-11-02). Four residuals (R1 to R4 in
  TD-014) are to be recorded in the Increment 4 sandbox run. E-1 stays open
  for capture and void integration (Increment 4) until then. The adapter
  contract points are in D-019 (Accepted).

## Increment roadmap

Each increment needs separate approval.

| # | Increment | Status |
|---|---|---|
| 0 | Documentation and decision records | Complete (41632a4) |
| 1 | Workspace and Fastify /health | Complete (d916d84, b2cd853; merged in 01afa89) |
| 2a | Domain: schemas, canonical hash, pre-check evaluator, explanations | Complete (4a4de58, 2fd55f8) |
| 2b | Domain: final evaluation, PayPal status mappings, payment-action rules | Complete (d95cd6d, 6817a58; merged in 4484fc5) |
| 3 | PayPal adapter: token, vault check, create order, read order and authorization | Complete (d98e76e and its docs commit); success path confirmed by the developer's sandbox smoke run; not yet merged |
| 4 | Capture and void integration | E-1 stays open until R1 to R4 (TD-014) are recorded in this increment's sandbox run |
| 5 | Gate service, store, routes | Not started |
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
