# BUILD_STATUS

Compact status note. Read this first at the start of every session.

Last updated: 2026-10-31

## Status

- **Current increment:** Increment 2b — final evaluation, PayPal status
  mappings and payment-action rule. Implemented and verified on branch
  feat/01-domain-policy; awaiting the walkthrough, comprehension questions
  and commit authorization.
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
  - Increment 2b checks (2026-10-31): pnpm test passes (15 files, 466
    tests), pnpm typecheck passes, 18 of 18 deliberate rule mutations were
    caught by at least one test, and GET /health returns 200 from a real
    node process.
- **Broken:** The spike runner (docs/evidence/spike/scripts/run-spike.js)
  points to countersign-spike.* files and a SPIKE_README.md that do not
  exist (TD-001). The application does not use it.
- **Not yet existing (expected):** PayPal code, AI integration,
  persistence, the frontend.
- **Next approved task:** None. Increment 3 (PayPal adapter) needs a
  separate approval, and E-1 is recommended first.
- **Next comprehension gate:** Increment 2b walkthrough.
- **Not pushed:** feat/01-domain-policy exists only locally.

## Evidence gates

- **E-1, PayPal lifecycle (pending, run by the developer in Postman):**
  record the following after a vault order:
  - order status and authorization status;
  - authorization expiration_time;
  - capture status;
  - result of replaying a capture with the same PayPal-Request-Id;
  - void-after-capture refusal and capture-after-void refusal;
  - whether the vault_id is still valid.

  E-1 blocks capture and void integration. It does not block
  Increments 1 and 2.

## Increment roadmap

Each increment needs separate approval.

| # | Increment | Status |
|---|---|---|
| 0 | Documentation and decision records | Complete (41632a4) |
| 1 | Workspace and Fastify /health | Complete (d916d84, b2cd853; merged in 01afa89) |
| 2a | Domain: schemas, canonical hash, pre-check evaluator, explanations | Complete (4a4de58, 2fd55f8) |
| 2b | Domain: final evaluation, PayPal status mappings, payment-action rules | Implemented; awaiting walkthrough and commit |
| 3 | PayPal adapter: token, create order, read order and authorization | Needs separate approval; E-1 recommended first |
| 4 | Capture and void integration | Blocked by E-1 |
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
