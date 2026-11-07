# BUILD_STATUS

Compact status note. Read this first at the start of every session.

Last updated: 2026-11-06

## Status

- **Current increment:** Increment 7b - the web app's proposal and result screens (D-030
  Accepted; brand guidelines version 1.1, section 12). Implemented and verified on branch
  feat/frontend (not committed). The developer's sandbox walkthrough is done
  (docs/evidence/frontend/PROPOSAL_RESULT_WALKTHROUGH.md, Part 2); awaiting the comprehension
  confirmation and commit authorization.
  Increment 7a is complete (committed in 1230b97 and f1bf31a; D-029 Accepted). The audit
  view is Increment 7c and needs its own proposal.
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
  - Increment 5a (gate core, no HTTP), committed in 6fcfced and 5a40d0f.
    Checks (2026-11-02), all against a stub adapter (D-011): 1124 tests in 33
    files, typecheck clean, 30 of 31 deliberate rule mutations caught (the
    survivor is the fsync of the log, which a test cannot observe), and GET
    /health returns 200 from a real node process. Nothing was sent to PayPal.
  - Increment 5b checks (2026-11-04), against a stub adapter (D-011): pnpm test
    passes (37 files, 1205 tests), pnpm typecheck passes, and 24 of 25
    deliberate mutations of the new code were caught (the survivor is the
    restart comparison inside the e2e script, which can only fail if replay
    differs from the live gate; that is tested in the gate's own tests). A real
    node process with placeholder credentials answered /health, created a
    mandate, blocked an over-total purchase, rebuilt the attempt from the log
    after a restart, and refused to start with a missing credential or a damaged
    log. Nothing was sent to PayPal.
  - Increment 5b (routes, simulated agent, e2e script), committed in 797652d
    and 6693e8a and merged to main through PR #5 (959f1b4). The developer's
    sandbox run passed every step (2026-11-05).
  - Increment 6a checks (2026-11-05), against a fake client (D-011): pnpm test
    passes (43 files, 1332 tests), pnpm typecheck passes, and 29 of 30
    deliberate mutations of the new code were caught (the survivor is a
    fail-closed guard in completeDraft that is unreachable while the terms
    schema requires every field). A real node process with placeholder values:
    drafting off without a key (503 not_configured); with a placeholder key the
    provider's real 401 came back as 503 auth; a malformed key and a foreign
    ANTHROPIC_BASE_URL stopped the start; the key appeared in no log; drafting
    wrote nothing to the audit log. That placeholder-key request sent one
    fictional sentence to the provider and nothing else. The real model has not
    been run.
  - Increment 6a (AI mandate drafting), committed in b717727 and 74cfb9d. The
    developer's two draft-smoke runs against the real model passed.
  - Increment 6b checks (2026-11-05), against a fake client (D-011): pnpm test
    passes (47 files, 1419 tests), pnpm typecheck passes, and 32 of 32 deliberate
    mutations of the new code were caught. A real node process with placeholder
    values: no key gave 503 not_configured; a placeholder key drew a real 401 from
    the provider (503 auth); the key appeared in no log; nothing was written to the
    audit log. That placeholder-key request sent one fictional sentence to the
    provider and nothing else. The real model has not been run as a shopper.
  - Increment 7a checks (2026-11-06): pnpm test passes (56 files, 1686 tests; 267
    new in apps/web), pnpm typecheck passes for the domain, the API and the web app,
    pnpm audit on the repository lockfile found no known vulnerabilities, and 41 of
    41 deliberate mutations of the new logic and scan tests were caught. `next build`
    passes. The real API (placeholder values, no AI key, no PayPal call) was driven
    through the Next.js rewrite by a headless Chrome script: 96 of 96 checks passed,
    including the manual path with no AI key, the AI-off notice, validation, both ways
    a confirmation can fail to come back (the page did not retry; exactly one mandate
    was created), the API being down, four viewport widths, tab order and fonts. A
    40 s response completed through the rewrite (Next.js's default would cut at 30 s).
    A first run found four defects, fixed. The developer then ran the walkthrough
    (2026-11-06): no problems found; one real AI draft took about 16 to 18 s.
  - Increment 7b checks (2026-11-06): pnpm test passes (64 files, 1825 tests; 139 new
    in apps/web), pnpm typecheck passes, 40 of 40 deliberate mutations were caught, no
    dependency was added, and nothing in apps/api or packages/domain changed. `next
    build` passes. The real API (placeholder values, no AI key) was driven through the
    rewrite by a headless Chrome script: 78 of 78 checks passed, including a blocked cart,
    "check and settle", an allowed cart that reached the order step with placeholder
    credentials (status "Order not created", no false success), both ways an answer can
    fail to come back (no automatic resend; exactly one attempt each time), a revoked
    mandate, unknown ids, four viewport widths. One real defect found and fixed (a route id
    encoded twice). That run sent one token request with a fictional client id and secret
    to PayPal's sandbox token endpoint, which refused it; no order was created. The
    developer then ran the sandbox walkthrough (2026-11-07, real PayPal Sandbox and
    Anthropic key): two-step and one-step capture, revoke then settle ending in "Voided",
    one live attempt per mandate, blocked carts, the AI agent's cart (3 to 5 s) and an
    agent cart through authorization and capture (TD-026 resolved), and "Check status"
    after an API restart all worked. Not exercised anywhere: "Check PayPal's record"
    (reconcile) and the notice for a request that went nowhere while funds are on hold.
- **Broken:** The spike runner (docs/evidence/spike/scripts/run-spike.js)
  points to countersign-spike.* files and a SPIKE_README.md that do not
  exist (TD-001). The application does not use it.
- **Not yet existing (expected):** the audit timeline and the list of all attempts
  (Increment 7c). The PayPal adapter, the gate, the routes and the
  simulated agent exist and are wired into the server (AUDIT_LOG_PATH, default
  data/audit.jsonl under apps/api/, gitignored); the e2e run wrote its own
  gitignored data/e2e-*.jsonl; the server has not been started with real
  credentials.
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
- **Sandbox end-to-end run, Increment 5b (done 2026-11-05 by the developer):**
  `pnpm --filter @ostensia/api e2e` created two sandbox orders, captured $1.00
  once, blocked an over-limit purchase with no PayPal call, refused a second use
  of a mandate, voided the authorization of a revoked mandate, and rebuilt the
  same state after a restart. Every step passed. The sanitized report is in
  docs/evidence/paypal-lifecycle/E2E_RESULTS.md. Success paths only (TD-015).
- **Draft smoke runs, Increment 6a (done 2026-11-05 by the developer):** four
  fictional descriptions against the real model, twice. Every check passed,
  nothing was invented, the hidden instruction was not obeyed, and the cost was
  about 1.7 cents a draft. Reading the first run's drafts found that the model
  sent an empty allowedVariantIds list in two samples (an invalid term); the
  prompt and the script's checks were fixed, and the second run showed no such
  problem. Two runs of a non-deterministic model are a sample, not a guarantee
  (TD-022). Evidence: docs/evidence/ai-drafting/DRAFT_SMOKE_RESULTS.md.
- **Open decisions for Increment 8 (hackathon rules, checked 2026-11-05):** the
  rules require a working build that judges can run or interact with, through
  setup and run instructions in the repository or a hosted demo; a public
  repository with a detectable open-source licence; and a video under three
  minutes. Hosting is not required (D-013 stands). Judges would need their own
  PayPal sandbox app and vault id (TD-009) and an AI key; no keys may be
  committed.
- **Agent smoke run, Increment 6b (done 2026-11-05 by the developer):** six
  fictional tasks against the real model, pre-check only, no PayPal and no
  attempts. The informed agent stayed within the limits (or declined) in all four
  runs; the uninformed agent exceeded them in both runs and the pre-check blocked
  both; the hidden instruction was not obeyed; about 1 cent a call. One sample of
  a non-deterministic model (TD-025). Evidence:
  docs/evidence/ai-drafting/AGENT_SMOKE_RESULTS.md.
- **Next approved task:** None. Increment 7c (the audit view) and Increment 8 (demo
  hardening) each need their own proposal and approval.
- **Next comprehension gate:** Increment 7b walkthrough.

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
| 5a | Gate core: mandates, attempts, audit log, authorize, settle, reconcile (no HTTP) | Complete (6fcfced, 5a40d0f); on feat/gate-store-and-api, not yet pushed |
| 5b | Routes, synthetic catalogue, simulated-agent scenarios, end-to-end sandbox run | Complete (797652d, 6693e8a; merged in 959f1b4); the developer's `e2e` sandbox run passed every step |
| 6a | AI mandate drafting: draft route, completeness check, warnings (Claude, D-024) | Complete (b717727, 74cfb9d); the developer's two `draft-smoke` runs against the real model passed |
| 6b | A labelled AI shopping agent that proposes carts, checked by the same deterministic gate (D-025) | Implemented; the developer's `agent-smoke` run against the real model passed; awaiting commit |
| 7a | Next.js app: the /api rewrite (D-027) and the mandate screen (D-026 to D-029) | Complete (1230b97, f1bf31a); the developer's walkthrough is done and D-029 is Accepted; on feat/frontend, not pushed |
| 7b | Frontend: proposal and result screens (D-030; guidelines section 12) | Implemented and verified (a browser run against the real API, then the developer's sandbox walkthrough); D-030 Accepted; uncommitted on feat/frontend; awaiting commit authorization |
| 7c | Frontend: the audit timeline and the list of attempts | Not started; needs its own proposal |
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
