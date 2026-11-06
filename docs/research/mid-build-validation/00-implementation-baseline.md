# Ostensia: Implementation Baseline (mid-build validation, report 00)

**Status of this document:** a research artefact. It is not a project decision and
changes nothing in the project's records. Proposed changes to other files are
listed in Appendix C for the developer's approval and have not been applied.

## 0. Audit record

| Item | Value |
|---|---|
| Audit date | 2026-11-05 (first command run at 18:05:20 UTC) |
| Branch audited | `feat/ai-drafting` |
| Commit audited | `9c4293b6dad32ce72a9db862b984d02083e1529f` ("docs: record D-025, the agent smoke results, TD-024, TD-025 and Increment 6b status") |
| `main` / `origin/main` | `959f1b4afa273e96ad7a44dfa13cd81095407c09` (merge of PR #5) |
| Relation to remote | HEAD is **4 commits ahead** of `origin/main` and 0 behind: `b717727`, `74cfb9d`, `1242f79`, `9c4293b` (Increments 6a and 6b) are not pushed |
| Working tree at start | No tracked changes and no untracked files |
| Tracked files | 134 (`git ls-files`) |
| Auditor | Claude Code (model `claude-sonnet-5-5`) |

**Independence limitation (important).** The auditor is the same assistant that
implemented most of the code under audit (Increments 2 to 6) in earlier sessions,
at the developer's direction. This audit re-reads the files and re-runs the
checks, but it is a self-review and should be read with that bias in mind.
Where possible each claim below is tied to a file and line or to a command that
the developer can re-run.

### How to read the labels

- **[V] Verified fact:** confirmed in this audit in code, in a test run, or in a
  recorded result, with a path and line.
- **[D] Developer-reported:** stated in a recorded result that the developer
  produced and pasted; the audit could not observe it independently.
- **[I] Interpretation:** a reading of the evidence.
- **[H] Hypothesis:** a claim that external research or a test could confirm or refute.
- **[R] Recommendation:** a suggestion, not a decision.
- **[U] Unverified / unresolved:** could not be established from the repository.

---

## 1. Scope and methodology

### 1.1 Scope

The state of the repository after Increment 6b, ahead of Increment 7 (Next.js
frontend). The audit covers what is implemented, what evidence supports it, what
rests on unvalidated assumptions, and what the frontend and the demo can and
cannot rely on. It does **not** include external research (PayPal documentation,
market, competitors, the hackathon site). Those are listed as questions in
section 9.

### 1.2 What was inspected

Tracked files only, by their actual paths (`git ls-files`):

- Project instructions and records: `CLAUDE.md`, `README.md`, `docs/BUILD_STATUS.md`,
  `docs/DECISIONS.md`, `docs/LEARNING_NOTES.md` (existence and headings only),
  `docs/TECH_DEBT.md`, `docs/research-summary.md`, `docs/spike-findings.md`.
- PayPal and AI evidence: `docs/evidence/paypal-lifecycle/` (`E1_RESULTS.md`,
  `ADAPTER_SMOKE_RESULTS.md`, `LIFECYCLE_SMOKE_RESULTS.md`, `E2E_RESULTS.md`,
  `README.md`, `ostensia-e1.postman_collection.json`), `docs/evidence/ai-drafting/`
  (`DRAFT_SMOKE_RESULTS.md`, `AGENT_SMOKE_RESULTS.md`), `docs/evidence/spike/README.md`.
- Code: `packages/domain/src/` (12 test files, 726 non-test lines), `apps/api/src/`
  and `apps/api/scripts/` (39 non-test source files across both; 3,022 non-test
  lines in `apps/api/src/`). Line counts exclude any file whose name contains
  "test", which also drops the `test-support.ts` helpers.
- `apps/web/.env.example` (the only tracked file under `apps/web/`).

### 1.3 Commands run (read-only, or output to the console only)

`git status`, `git log`, `git rev-parse`, `git branch --contains`, `git ls-files`,
`git grep`, `git check-ignore`; `pnpm typecheck`; `pnpm exec vitest run` (five full
runs, one of them with the JSON reporter writing to a scratch directory outside the
repository). Running the tests can create caches under the ignored
`node_modules/`; no tracked file was written. The only repository write in this
task is this report and the empty directory created for it.

### 1.4 What was not inspected

- `docs/evidence/spike/ostensia-spike.postman_environment.json` exists on disk but
  is untracked and ignored (`.gitignore:20`). **It was not opened**, because it may
  hold live values.
- `apps/api/.env` (the developer's credentials). Not opened.
- The "historical research report" that `docs/research-summary.md:126-128` cites.
  **It does not exist in the working tree** (section 13, C6).
- Raw Postman and runner output from the spike and from E-1. These are kept
  outside the repository by design (`docs/evidence/spike/README.md:5-6`).
- `docs/LEARNING_NOTES.md` body text, and the code of most test files beyond
  headings and counts.
- Any external source (PayPal developer documentation, the hackathon site, market
  sources). A request to fetch the official rules page returned HTTP 403 earlier in
  this project; the rules text used by the project was pasted by the developer.

### 1.5 Limitations of the method

- Every sandbox and AI result is **developer-reported** text pasted into a
  sanitized file [D]. The audit cannot confirm that the runs happened as described.
- Mutation-test results (for example "32 of 32 caught") are recorded in
  `docs/BUILD_STATUS.md` and the decision records. They were **not re-run** here.
- Line numbers are those of commit `9c4293b`.

---

## 2. Executive summary

1. **[V] The core product path is implemented and has run end to end against the
   real PayPal sandbox on its success paths.** A person-confirmed mandate is
   evaluated by deterministic domain code, a compliant purchase is authorized and
   captured, a non-compliant one is blocked before any PayPal call, and a
   purchase that becomes non-compliant after authorization (mandate revoked) is
   voided and not captured. Evidence: `docs/evidence/paypal-lifecycle/E2E_RESULTS.md`
   (developer's run, 2026-11-05).
2. **[V] The failure paths against PayPal have never been exercised against the
   real sandbox.** Rejections, 5xx, timeouts, token expiry, pending or partial
   captures, expired authorizations, and the gate's reconcile path run only against
   a fake or stub (`docs/TECH_DEBT.md:268-298`, TD-015; `LIFECYCLE_SMOKE_RESULTS.md:75-81`).
3. **[V] AI is used in two places, both advisory:** mandate drafting and a labelled
   shopping agent. Both were run against the real model on a small fixed set of
   fictional prompts (8 draft runs, 6 agent runs). **No AI-agent cart has been
   sent through the gate to PayPal in any recorded run**: the sandbox e2e uses the
   six deterministic scenarios (`apps/api/scripts/e2e-run.ts:100`).
4. **[V] There is no frontend.** `apps/web/` holds only `.env.example`.
5. **[V] The repository documentation has drifted from the code**, and the
   `README.md` still says the repository is not a runnable application and has no
   setup instructions (`README.md:6-9`, `:31-35`). The hackathon rules the project
   recorded require run instructions or a hosted demo. This is the largest
   readiness gap that is not code.
6. **[V] The research basis is thin and partly missing.** The "historical research
   report" is cited but absent from the tree. Target user, willingness to pay and
   differentiation are recorded as hypotheses (`docs/research-summary.md:44-58`).
7. **[V] One intermittent test failure was observed** during this audit (5 of 1,419
   tests in one of five full runs; the next four runs passed). The cause was not
   established (section 5.4).
8. **[R] Nothing found argues for changing the architecture or the payment path.**
   The items to resolve before the demo are documentation, judge access, a
   CORS/proxy decision, the frontend itself, and a demo script that does not depend
   on a non-deterministic AI outcome (section 11).

---

## 3. Implementation status against the approved increments

The increment list is `docs/BUILD_STATUS.md:158-175`. "Real" means exercised
against the real PayPal sandbox or the real model by a recorded run. "Stub" or
"fake" means tested only against test doubles. "Simulated" means the thing itself
is synthetic.

| # | Increment | Code state [V] | Real-world evidence | Class |
|---|---|---|---|---|
| 0 | Records and decisions | `docs/DECISIONS.md` D-001..D-025, `docs/TECH_DEBT.md` TD-001..TD-025 | n/a | complete |
| 1 | Workspace and `/health` | `package.json`, `pnpm-workspace.yaml`, `apps/api/src/server.ts:52` | real node process (recorded) | complete |
| 2a/2b | Domain: schemas, canonical hash, pre-check, final evaluation, status mappings, payment-action rule | `packages/domain/src/` (`evaluate.ts:18,22`, `payment-action.ts:19-24`, `paypal-status.ts:13,28,42,63`) | status values taken from E-1 observations only (TD-005) | complete; status lists partly unconfirmed |
| 3 | PayPal adapter (token, vault check, create order, reads) | `apps/api/src/paypal/adapter.ts` | real, success path (`ADAPTER_SMOKE_RESULTS.md`) | complete; failure paths fake |
| 4 | Capture and void in the adapter | `adapter.ts:485-516` | real, success path (`LIFECYCLE_SMOKE_RESULTS.md`) | complete; failure paths fake |
| 5a | Gate core (mandates, attempts, audit log, authorize, settle, reconcile) | `apps/api/src/gate/gate.ts:295,370,436` | via 5b e2e on the success path; reconcile never run for real | complete; recovery paths stub only |
| 5b | Routes, synthetic catalogue, scenario agent, e2e script | `apps/api/src/routes/`, `apps/api/src/simulation/`, `apps/api/scripts/e2e*.ts` | real, success paths (`E2E_RESULTS.md`) | complete; **shop and scenario agent are simulated** |
| 6a | AI mandate drafting | `packages/domain/src/draft.ts:31`, `apps/api/src/ai/drafter.ts`, `apps/api/src/routes/draft.ts:17` | real model: 2 runs x 4 prompts (`DRAFT_SMOKE_RESULTS.md`) | complete; small sample |
| 6b | AI shopping agent | `apps/api/src/ai/shopper.ts`, `cart.ts`, `apps/api/src/routes/agent.ts:25` | real model: 1 run x 6 tasks, **pre-check only** (`AGENT_SMOKE_RESULTS.md`) | complete; never sent to PayPal |
| 7 | Next.js frontend | **absent** (`apps/web/.env.example` only) | none | unimplemented |
| 8 | Demo hardening, publication review | not started | none | unimplemented |

**Not in scope of any increment and absent [V]:** webhooks (`docs/TECH_DEBT.md:171`,
TD-010), disputes and the resolver (`docs/spike-findings.md:57-102`), shipment
tracking in the application (only a spike request), refunds, re-authorization,
authentication (TD-007), multi-user, a real merchant or catalogue.

---

## 4. Actual end-to-end functionality

### 4.1 The API surface (all on `127.0.0.1`, `apps/api/src/config.ts:6,56`)

| Endpoint | What it does | Source | Real / AI / simulated |
|---|---|---|---|
| `GET /health` | status | `server.ts:52` | n/a |
| `POST /mandates/draft {instruction}` | AI draft, completeness, warnings; creates nothing | `routes/draft.ts:17` | AI (Claude); 503 without key |
| `POST /mandates {terms, intentSummary}` | confirm a mandate (gate validates, hashes, logs) | `routes/mandates.ts:12` | real logic |
| `GET /mandates`, `GET /mandates/:id` | read | `routes/mandates.ts:20,22` | |
| `POST /mandates/:id/revoke` | revoke | `routes/mandates.ts:28` | |
| `GET /catalogue` | synthetic shop | `routes/simulation.ts:14` | **simulated**, labelled |
| `POST /mandates/:id/simulated-proposal {scenario}` | deterministic cart (6 scenarios) | `routes/simulation.ts:16`, `simulation/scenarios.ts:14,61` | **simulated**, labelled |
| `POST /mandates/:id/agent-proposal {mode, task?}` | AI cart, priced by code | `routes/agent.ts:25`, `ai/cart.ts:26` | AI + simulated shop, labelled |
| `POST /attempts {attemptId, mandateId, proposal, settleNow?}` | authorize (and settle if `settleNow`) | `routes/attempts.ts:9-25` | **real PayPal sandbox** |
| `POST /attempts/:id/settle`, `/reconcile` | settle; read-only reconcile | `routes/attempts.ts:27,31` | settle real; reconcile stub-tested only |
| `GET /attempts`, `GET /attempts/:id` | list; detail with explanation and audit events | `routes/attempts.ts:43,45` | |

### 4.2 The flow that works today [V]

1. (Optional) `POST /mandates/draft` returns an AI draft with `missing` fields and
   warnings. A person fills the gaps.
2. `POST /mandates` confirms terms. The gate recomputes nothing at this step; it
   validates, computes the hash (`apps/api/src/mandate-hash.ts:13`) and appends a
   `mandate_created` event (`gate.ts:263`).
3. A proposal comes from `simulated-proposal` or `agent-proposal` (or any client).
4. `POST /attempts`: integrity check, pre-check (`gate.ts:332`), then, only if
   allowed, one order creation (`gate.ts:353`). A block makes **no PayPal call**.
5. `settle`: read the authorization, integrity check again, final evaluation that
   includes what PayPal reported (`gate.ts:397`), then `nextPaymentAction`
   (`gate.ts:401`) chooses capture, void or nothing.
6. Every PayPal write is recorded and flushed before it is sent
   (`apps/api/src/gate/audit-log.ts:60` `datasync`); a request with no result after
   a crash is `unknown`, never `failed` (`state.ts:234`).

### 4.3 Simulated or synthetic elements [V]

- The shop: four fictional products (`simulation/catalogue.ts:14-19`).
- The six scenario proposals (`simulation/scenarios.ts`).
- The buyer: one configured sandbox vault (`apps/api/src/paypal/paypal-config.ts`).
  There is no buyer identity, session or in-app payment approval.
- PayPal receives only the order **total**, `custom_id` (the mandate hash) and
  `invoice_id`. **No line items are sent** (`adapter.ts:408-422` builds `amount`
  only). The proposal's lines exist only in the application's own audit log.

---

## 5. Evidence and test coverage

### 5.1 Automated tests (re-run in this audit)

`pnpm typecheck`: passes (exit 0). `pnpm exec vitest run`: **47 files, 1,419 tests,
all passing** in four of five full runs.

| Area | Files | Tests |
|---|---|---|
| `packages/domain` | 12 | 472 |
| `apps/api/src/paypal` | 9 | 347 |
| `apps/api/src/gate` | 8 | 295 |
| `apps/api/src/ai` | 7 | 122 |
| `apps/api/src/routes` | 4 | 111 |
| `apps/api/src/other` (config, hash, purity, server) | 4 | 34 |
| `apps/api/scripts` | 2 | 23 |
| `apps/api/src/simulation` | 1 | 15 |

**[V] Test doubles used.** PayPal tests use a fake `fetch` built from E-1 response
shapes with synthetic values (`docs/DECISIONS.md:576`, D-011; TD-015). Gate tests
use a stateful stub adapter (`apps/api/src/gate/test-support.ts`). AI tests use a
fake client; **no test calls a provider**.

**[V] Structural scans** exist as tests (`gate-boundaries.test.ts`,
`paypal-boundaries.test.ts:40` forbids `authorize`/`reauthorize`/`refund` paths,
`routes-boundaries.test.ts`, `ai-boundaries.test.ts`, `domain-purity.test.ts`).

**[D] Mutation checks** recorded in `docs/BUILD_STATUS.md` and decision records
(for example 30 of 31 for the gate, 24 of 25 for 5b, 29 of 30 for 6a, 32 of 32 for
6b). Not re-run here.

### 5.2 Real PayPal sandbox evidence [D]

| Capability | Real sandbox evidence | Where |
|---|---|---|
| Vault payment-token read | yes | `ADAPTER_SMOKE_RESULTS.md:16,26`; `E1_RESULTS.md:12` |
| Create order, intent AUTHORIZE, `vault_id`, no authorize call; order `COMPLETED` with one authorization `CREATED` | yes | `E1_RESULTS.md:13-14`; `LIFECYCLE_SMOKE_RESULTS.md:28` |
| `custom_id` equals the mandate hash on GET authorization | yes | `ADAPTER_SMOKE_RESULTS.md:30,46` |
| Authorization expiry 29 days after creation | yes (observed) | `E1_RESULTS.md:73`; `LIFECYCLE_SMOKE_RESULTS.md:29` |
| Capture (`final_capture: true`), `COMPLETED`; authorization then `CAPTURED` | yes (the `CAPTURED` status was first developer-reported, then read through the adapter) | `E1_RESULTS.md:17,74-75`; `LIFECYCLE_SMOKE_RESULTS.md:32-37` |
| Capture replay with the same request id returns the same capture; one capture exists | yes | `E1_RESULTS.md:18-19`; `LIFECYCLE_SMOKE_RESULTS.md:34-39` |
| Void, then GET shows `VOIDED` | yes | `E1_RESULTS.md:29-30`; `LIFECYCLE_SMOKE_RESULTS.md:44-45` |
| Void after capture refused (422 `PREVIOUSLY_CAPTURED`); capture after void refused (422 `AUTHORIZATION_VOIDED`) | yes | `E1_RESULTS.md:20,31`; `LIFECYCLE_SMOKE_RESULTS.md:40-47` |
| Gate: compliant purchase captured; over-limit purchase blocked with no PayPal call; mandate single use; revoke before settlement ends voided; restart rebuilds the same state | yes, success paths, through the API | `E2E_RESULTS.md` (all steps PASS) |

### 5.3 What has only been tested with doubles, or not at all [V]

- PayPal 4xx/5xx bodies, timeouts, an expired or rejected token, redirects.
- Capture `PENDING`, authorization `PARTIALLY_CAPTURED`, `PENDING`, `DENIED`,
  `EXPIRED`, order `APPROVED` (`docs/TECH_DEBT.md:81-104`, TD-005).
- The gate's `unknown` outcomes and `reconcile` against real PayPal
  (`apps/api/src/gate/gate-recovery.test.ts` is stub-based).
- The lifecycle script's own cleanup path (`LIFECYCLE_SMOKE_RESULTS.md:80-81`).
- `stored_credential` is not sent and was never tested (`docs/TECH_DEBT.md:61-80`, TD-004).
- Webhooks, disputes, tracking in the app, refunds: not implemented or not
  established (`docs/spike-findings.md:57-102`).
- The AI agent's carts through the gate to PayPal.

### 5.4 AI evidence [D]

- **Drafting:** 2 runs x 4 fictional descriptions. Run 1 passed every check, but
  reading the drafts found `allowedVariantIds: []` in two samples (an invalid
  term). The prompt was fixed; run 2 showed no such problem
  (`DRAFT_SMOKE_RESULTS.md`). Roughly 1.7 cents a draft at list price.
- **Agent:** 1 run x 6 tasks, pre-check only: informed agent within limits or
  declined in 4 of 4; uninformed agent over the limits in 2 of 2 and blocked
  (`AGENT_SMOKE_RESULTS.md`). One sample of a non-deterministic model.
- The only real-API error path observed is a 401 from a placeholder key (recorded
  in `docs/BUILD_STATUS.md:58-77` and the decision records).

### 5.5 Intermittent test failure observed in this audit [V] (cause [U])

During this audit the first full `vitest` run (immediately after `pnpm typecheck`)
reported **5 failing tests out of 1,419**, in `apps/api/src/server.test.ts`,
`apps/api/src/routes/draft.test.ts`, `agent.test.ts`, `routes.test.ts` and
`apps/api/scripts/e2e-run.test.ts`; the files involved took 5.8 to 8.6 seconds.
The failure messages were not captured. Four subsequent full runs (one with the JSON reporter), and a run of
two of the files alone, passed (12.8 to 14.9 seconds for the full runs). The repository has no
`vitest.config.*` and no `testTimeout` setting, so Vitest's defaults apply.
**[H]** a default per-test timeout was exceeded under load during a cold run.
This is not confirmed.

---

## 6. PayPal lifecycle implementation against the E-1 record

E-1 is the developer's Postman run of 2026-11-02 (`E1_RESULTS.md`; requests in
`ostensia-e1.postman_collection.json`). The comparison below is code against that
record. It is not a re-test.

| Topic | E-1 record | Implementation | Assessment |
|---|---|---|---|
| Order request | intent `AUTHORIZE`; `payment_source.paypal.vault_id`; `purchase_units[]` with `reference_id`, `custom_id`, `invoice_id`, `description`, `amount`; **no `stored_credential`** (collection, request `E1-C.1`) | `adapter.ts:408-422`: same fields | [V] consistent. Differences: `reference_id` is the attempt id (E-1: a fixed text), `invoice_id` is `ostensia-<attemptId>`, `description` text differs. **Not re-tested with these exact values in E-1**, but the Increment 3/4/5b real runs used the adapter's body. |
| No authorize call | "no `/authorize` call used" (`E1_RESULTS.md:6`) | `adapter.ts:19-20`; scan test `paypal-boundaries.test.ts:40` | [V] consistent |
| Amounts | E-1: 72.00 USD (`E1_RESULTS.md:16`) | adapter requires USD and two decimals; real runs used 1.00 USD | [V] consistent; amounts above 1.00 were not run through the gate in recorded evidence |
| Capture | `{"final_capture": true}`, 201, `COMPLETED` | `adapter.ts:491` | [V] consistent |
| Replay | identical request id gives 200 and the same capture | deterministic id per attempt and operation (`apps/api/src/paypal/request-id.ts`), used at `adapter.ts:459,488,516` | [V] consistent |
| Capture count | order GET after replay | reads `purchase_units[].payments.captures` (R3, `LIFECYCLE_SMOKE_RESULTS.md:66-69`) | [V] consistent |
| Void | 204, then GET `VOIDED` | void confirmed by one GET, else `void_unconfirmed` (`adapter.ts:513-516`) | [V] consistent |
| Refusals | 422 `PREVIOUSLY_CAPTURED`, 422 `AUTHORIZATION_VOIDED` | returned as `already_terminal` outcomes (`adapter.ts`) | [V] consistent |
| Authorization states | observed `CREATED`, `VOIDED`, `CAPTURED` | `paypal-status.ts:42-59` maps seven values; others map to `unknown` | [V] consistent; `PARTIALLY_CAPTURED`, `PENDING`, `DENIED`, `EXPIRED` never observed (TD-005) |
| Policy at capture | n/a | capture only for a valid allow and authorization exactly `created` (`payment-action.ts:19-24`, `gate.ts:401`) | [V] matches the project rule in `CLAUDE.md` section 7 |
| Binding | `custom_id` round-trips | final evaluation compares echoed `custom_id` to the stored hash (`evaluate.ts:83`) | [V] consistent; the hash is metadata, not enforcement (`mandate-hash.ts:9-12`) |
| Vault | first check returned 404; per the developer, a setup-token id was used where the vault id belongs (`E1_RESULTS.md:48,76-79`) | one configured vault id, validated by shape (`paypal-config.ts`) | [D] explanation not independently confirmed; the earlier spike vault id was never re-tested; vault lifetime unknown (TD-009, `docs/TECH_DEBT.md:150`) |
| Sandbox lock | n/a | base URL is a constant; redirects are errors (`paypal-config.ts:7,33`, `http.ts:89`) | [V] |

**[I]** The implementation reproduces what E-1 and the later real runs
observed and nothing more. The adapter does not exercise any PayPal behaviour that
no recorded run has shown on its success path.

**[V] Provenance caveat.** E-1 and every later sandbox report are the developer's
sanitized text. The raw request and response data are not in the repository.

---

## 7. Unvalidated assumptions embedded in the implementation

| # | Assumption | Where it lives | Status |
|---|---|---|---|
| A1 | A **vaulted, buyer-not-present AUTHORIZE flow** is a faithful model of AI-agent purchasing, and is permitted and low-friction outside the sandbox (no `stored_credential`, no buyer step per purchase) | `adapter.ts:408-422`; `docs/TECH_DEBT.md:61-80` (TD-004); `docs/spike-findings.md:38` (first-time vault setup needed manual buyer approval) | [H] not researched |
| A2 | The 29-day authorization window and its effect on the buyer's funds match production behaviour and what a user would accept | observed in `E1_RESULTS.md:73` | [U] only timestamps observed |
| A3 | **Single-use mandates** fit real purchasing policies (a mandate is consumed by one purchase) | `docs/DECISIONS.md:1355` (D-022); `apps/api/src/gate/state.ts:62` | [H] a product choice, not a finding |
| A4 | The mandate fields (products, variants, quantity, unit price, total, expiry, USD) express the limits users or merchants actually want | `packages/domain/src/mandate.ts`; D-009 (`docs/DECISIONS.md:462`) | [H] no user evidence (`CLAUDE.md:194`; `docs/research-summary.md:50-51`) |
| A5 | The primary user and problem (consumer control, merchant evidence, developer infrastructure) | `docs/research-summary.md:44-58` | [U] recorded as hypotheses |
| A6 | A SHA-256 hash in `custom_id` has value as a binding to anyone other than the application | `apps/api/src/mandate-hash.ts:9-12`; `docs/spike-findings.md:44-45` | [H] no third-party verifier exists; the spike says the hash is not a signature |
| A7 | AI drafting and the shopping agent behave acceptably beyond the fictional prompts tried | `DRAFT_SMOKE_RESULTS.md`; `AGENT_SMOKE_RESULTS.md`; TD-022, TD-025 | [H] 14 samples in total; the prompts were written by the auditor (the same assistant that built the features) |
| A8 | The AI cost (about 1.1 to 1.9 thousand input tokens and 135 to 570 output tokens per call) and latency are acceptable | `AGENT_SMOKE_RESULTS.md`; `DRAFT_SMOKE_RESULTS.md` | cost is a list-price figure, not a bill; **latency was not measured** [U] |
| A9 | Structured-output schemas constrain the model | `apps/api/src/ai/drafter.ts:56`, `shopper.ts:91` | [V] **false for enum and const** with SDK 1.3.0, per reading the SDK source; our own validation is the guarantee (TD-024, `docs/TECH_DEBT.md:483`) |
| A10 | A hackathon judge can run or evaluate the project (the rules require a working build, by run instructions or a hosted demo) | `docs/BUILD_STATUS.md:114-120` (a paraphrase); the rules text is not in the repository | [U] see issue 11.1 |
| A11 | Sandbox behaviour reflects production behaviour | all evidence | [U] never tested |
| A12 | One process, in-memory state and a local append-only file are adequate for the demo | D-006, D-008 (`docs/DECISIONS.md:304,414`); TD-003, TD-021 | [I] adequate for a local demo; not for hosting |
| A13 | Showing only an order total to PayPal is adequate, with the proposal kept in the application's own log | `adapter.ts:408-422` | [H] this limits any "merchant-side evidence" use of the record (`docs/research-summary.md:46-48`) |
| A14 | USD only, two-decimal amounts | `adapter.ts`; TD-008 | [I] deliberate MVP limit |

---

## 8. Technical limitations that could affect the frontend or the demo

| # | Limitation | Evidence | Effect |
|---|---|---|---|
| L1 | **CORS versus proxy is undecided.** D-006 says Next.js reaches Fastify "through a rewrite" so that "no CORS setup is needed" (`docs/DECISIONS.md:320-322`), but `apps/web/.env.example:1-2` sets a browser-visible `NEXT_PUBLIC_API_BASE_URL`, and the API has no CORS support (`apps/api/package.json` dependencies: `@anthropic-ai/sdk`, `@ostensia/domain`, `fastify`, `zod`) | files cited | A browser calling the API directly would fail without a decision |
| L2 | No authentication and no notion of a user. Mandates and attempts are global | TD-007 (`docs/TECH_DEBT.md:121`) | fine locally; blocks a hosted demo |
| L3 | The buyer is one configured vault. Vault onboarding is manual through Postman and a buyer approval | TD-009 (`:150`); `docs/evidence/paypal-lifecycle/ostensia-e1.postman_collection.json` folders `01a`/`01b` | judges cannot reproduce the payment path without their own sandbox app and vault |
| L4 | A mandate is single use. After a capture the mandate is spent; a blocked or voided attempt frees it (`state.ts:62`) | D-022 | the UI must create a new mandate per demo run |
| L5 | The client chooses the attempt id; a repeated request returns the same attempt, a different request under one id is refused (`routes/attempts.ts:9-16`, `gate.ts:295`) | | the UI must generate unique ids |
| L6 | `settleNow: false` leaves an authorization open (up to 29 days) until `settle` is called; nothing settles it automatically | `gate.ts:370`; `E1_RESULTS.md:73` | abandoned demo attempts leave open sandbox authorizations |
| L7 | The AI origin of a proposal is not recorded; the agent's reasoning is not recorded (TD-025) | `docs/TECH_DEBT.md:511` | provenance is only available client-side |
| L8 | Block explanations repeat a line when a violation applies to two cart lines | `AGENT_SMOKE_RESULTS.md` (run 5) | the UI should group them |
| L9 | AI features answer 503 without `ANTHROPIC_API_KEY`; they spend the developer's key with no rate limit (TD-023) | `routes/draft.ts`, `routes/agent.ts` | a hosted demo needs a cap or passcode |
| L10 | AI outcomes vary by run (TD-025) | `AGENT_SMOKE_RESULTS.md` | a video that needs a block should use a scenario |
| L11 | The audit file lives under `apps/api/data/` (gitignored); events are held in memory for the life of the process (TD-021) | `config.ts`, `docs/TECH_DEBT.md:414` | fine for a demo |
| L12 | Latency of AI calls and of PayPal calls was never measured | not in any evidence file | the UI needs loading states; the demo timing is unknown [U] |
| L13 | Money is minor units everywhere | `packages/domain/src/money.ts` | the UI must format |
| L14 | Intermittent test failure observed (section 5.5) | | a flaky suite is a risk when demonstrating or when judges run it |
| L15 | The API listens on `127.0.0.1` only | `config.ts:6` | a hosted or containerized demo needs a decision |

---

## 9. Product decisions that external research should investigate

These are questions, each with the project decision it bears on. None is answered
by anything in the repository.

1. **What problem does a pre-capture purchasing-policy gate solve, for whom?**
   Consumer control of an agent, a merchant's confidence in agent purchases, or
   developer infrastructure (`docs/research-summary.md:44-58`). Bears on the demo
   narrative and the "Potential Impact" criterion. **[H]** none of the three is validated.
2. **What does PayPal already provide for agentic purchasing, and how does Ostensia
   relate to it?** The hackathon lists a "Best Use of Agentic Commerce" prize and
   sponsor tools. Whether PayPal's own tooling overlaps, complements or replaces
   this gate is unknown. Bears on positioning and on "Technological Implementation".
3. **Is the vaulted, merchant-initiated authorization flow the right model**
   (A1), including `stored_credential` expectations and what a real buyer must
   approve and when? Bears on whether the demo's payment path is credible.
4. **What do authorization holds mean for a buyer's funds in practice**
   (29-day expiry observed; A2)? Bears on the void story and on abandoned attempts.
5. **Should a mandate be reusable with a budget** instead of single use (A3)?
   Bears on the mandate model and on the domain schema.
6. **Which constraints do users and merchants want** (category, merchant allowlist,
   time windows, per-day totals; A4)? Bears on the mandate schema and the drafting prompt.
7. **Is the mandate hash in `custom_id` useful to anyone**, and is there any
   verifiable record a third party could check (A6, A13)? Bears on the audit story.
8. **What do judges value and how will they evaluate?** The rules' criteria are
   in the conversation, not the repository. Bears on the frontend scope and the video.
9. **How do comparable products present agent spending controls?** Bears on the
   frontend design (Increment 7).
10. **Is the original post-purchase dispute-evidence thesis worth revisiting after
    the hackathon?** (`docs/research-summary.md:56-58`). Out of MVP scope.

---

## 10. Features ready to expose through the frontend

Ready means implemented, tested, and exercised by a recorded real run where one
applies. Everything below is labelled in the API response where it is simulated or
AI-generated.

| Feature | Basis |
|---|---|
| Describe a purchase, get an AI draft with missing fields and warnings | real model, 8 runs; `routes/draft.ts` |
| Fill gaps, review and confirm a mandate | `POST /mandates`; e2e step 2 |
| Browse the synthetic catalogue, labelled simulated | `routes/simulation.ts:14` |
| Propose a cart by scenario (deterministic) | e2e steps 2 to 6 on the real sandbox |
| Propose a cart by AI agent (informed or uninformed), labelled | real model, pre-check only |
| Submit a proposal: authorize, then settle (or both) | real sandbox, success paths |
| See the decision and a plain-language explanation | `routes/respond.ts`; domain `explain.ts:15,67` |
| Revoke a mandate before settlement and see the void | e2e step 6 on the real sandbox |
| View an attempt's audit events | `routes/attempts.ts:45`; e2e step 7 |
| Restart the server and see the same state | e2e step 8 |

**Not ready to expose as working features:** reconcile of an unknown outcome
(stub only), anything about disputes, webhooks or tracking, onboarding a vault,
user accounts, a real merchant.

---

## 11. Issues to resolve before the demo

### 11.1 Blocking or high

1. **README and judge access.** `README.md:6-9,31-35` says the repository is not
   runnable and has no setup instructions; `docs/DECISIONS.md` D-002 promised the
   README would document pnpm. The recorded rules require run instructions or a
   hosted demo, and the payment path needs a vault that only a manual Postman flow
   can create (L3). A decision is needed on hosted demo versus instructions versus
   video-only, and on what a judge without PayPal or AI credentials can still do.
2. **The frontend does not exist** (Increment 7) and the deadline is 2026-11-12
   12:00 Pacific (`docs/research-summary.md:113-114`).
3. **CORS/proxy decision** (L1).
4. **A demo script that does not depend on a non-deterministic AI outcome** for the
   block and the void (L10).
5. **The unpushed commits.** Increments 6a and 6b exist only on a local branch.
6. **Documentation drift** that a reviewer will see first (section 13, C1 to C5).
7. **Public-repository readiness:** the repository is private; the "Countersign"
   name remains in tracked evidence (`git grep`: 7 occurrences in
   `ostensia-e1.postman_collection.json`, 9 in `ostensia-spike.postman_collection.json`,
   7 in `docs/evidence/spike/scripts/run-spike.js`); the manual sanitization and
   dependency-licence reviews are open (TD-001, TD-002, `docs/TECH_DEBT.md:3,21`),
   and the new `@anthropic-ai/sdk` is Apache-2.0 (D-024).

### 11.2 Should be resolved

8. The intermittent test failure (section 5.5), before judges run the suite.
9. The missing research report (C6) and the absence of the rules text from the
   repository.
10. Failure-path behaviour against the real sandbox is unobserved; decide whether a
    small set of real failure observations is worth the time.
11. Group repeated block explanations (L8).
12. Open sandbox authorizations from abandoned attempts (L6); the Increment 3
    orphan expires about 2026-12-01 (`docs/TECH_DEBT.md:299`, TD-017).

---

## 12. Existing features that should remain unchanged unless strong evidence justifies a change

| Feature | Why |
|---|---|
| Deterministic server-side evaluation (`evaluate.ts`) and the payment-action table (`payment-action.ts:19-24`) | the project's central safety rule; heavily tested; matches E-1 |
| Write-ahead audit log, fail-closed gate, `unknown` instead of `failed` after a crash (`audit-log.ts:60`, `state.ts:234`, `gate.ts:167-190`) | exercised by tests and by the e2e restart step |
| Adapter outcome model, no automatic write retries, sandbox-locked URL, no redirects (`paypal-config.ts:7`, `http.ts:89`) | matches CLAUDE.md section 7 |
| Secrets server-side only; `.env` ignored | CLAUDE.md section 8 |
| AI only proposes; prices come from the catalogue in code; labels on everything simulated or AI-generated (`ai/cart.ts:26`, `routes/draft.ts`, `routes/agent.ts`) | D-024, D-025; CLAUDE.md section 7 |
| The hash is metadata binding, not enforcement (`mandate-hash.ts:9-12`) | CLAUDE.md section 7 |
| One Fastify process; no separate services; no database | CLAUDE.md section 2; D-006, D-008 |
| Integer minor units, USD only | D-009; TD-008 |

---

## 13. Contradictory evidence and documentation drift (preserved)

| # | Statement A | Statement B | Note |
|---|---|---|---|
| C1 | `README.md:6-9,31-35`: the scaffold is not complete; "Do not treat the current repository as a runnable application yet"; setup instructions "will be added" | The repository has a runnable API, 47 test files, and run scripts (`apps/api/package.json`); D-002 says run requirements "will be documented in the README" | README is stale |
| C2 | `docs/BUILD_STATUS.md:9-15`: 6b "awaiting ... commit authorization"; `:173`: 6b "awaiting commit" | `git log`: 6b is committed (`1242f79`, `9c4293b`) | stale |
| C3 | `docs/BUILD_STATUS.md:170`: 5a "on feat/gate-store-and-api, not yet pushed" | `git branch --contains 6fcfced`: contained in `main` and `origin/main` | stale |
| C4 | `docs/BUILD_STATUS.md:67-68` and `:77`: "The real model has not been run" | `:69-70`, `:106-127`: real-model runs recorded | historical snapshot not marked superseded |
| C5 | `docs/BUILD_STATUS.md:81`: "Not yet existing (expected): AI integration, the frontend" | `apps/api/src/ai/` and the AI routes exist | stale for AI |
| C6 | `docs/research-summary.md:8-12` and `:126-128` treat an "original desk-research report" at `docs/research/archive/PayPal-AI-Hackathon-Research-2026-10-02.md` as the origin of the thesis | The directory `docs/research/archive/` is empty and nothing under `docs/research/` was tracked before this report; the audit request states desk research was not completed | **unresolved**: what that report was, whether it exists elsewhere, and what the thesis rests on |
| C7 | `docs/DECISIONS.md:320-322` (D-006): a rewrite, so no CORS | `apps/web/.env.example:1-2`: a public API base URL; no CORS support in the API | undecided (L1) |
| C8 | `docs/TECH_DEBT.md:222-239` (TD-013) and `:81-104` (TD-005): review triggers "Increment 5" and "Increment 4", status Open | Those increments are complete | stale triggers |
| C9 | `docs/DECISIONS.md` D-024 (`:1525-1671`) says the model output is limited to the draft shape and checked by code | D-025 and TD-024 (`:1672`, `docs/TECH_DEBT.md:483`) record that the API does not enforce enum and const | clarified in later records; D-024 itself unedited |
| C10 | `docs/TECH_DEBT.md:299` (TD-017) appears before `:327` (TD-016) | numeric order | cosmetic |
| C11 | `docs/evidence/paypal-lifecycle/README.md` calls the collection variable-names-only | the same file contains the old project name "Countersign" (e.g. in request `05.4`) | naming only, TD-001; not a secret |

---

## 14. Missing evidence and unresolved questions

1. Where is the historical research report, and what evidence did it contain? (C6)
2. The official hackathon rules text is not stored in the repository; the project's
   statements about them come from developer-pasted text. Has the live page changed?
3. Behaviour of the gate against PayPal failures: 4xx, 5xx, timeouts, token expiry,
   pending capture, expired authorization.
4. Does `reconcile` work against real PayPal after a real ambiguous outcome?
5. Why did 5 tests fail in one full run? (section 5.5)
6. Latency of AI and PayPal calls in the demo path.
7. What a judge without PayPal and AI credentials can run (issue 11.1).
8. Whether the AI agent's carts, once sent through the gate, behave the same on the
   real sandbox as the scenario carts did (not run).
9. Whether the vault id stays valid, and for how long (TD-009).
10. External questions in section 9.

---

## 15. Limitations of this audit

- Self-review by the assistant that wrote most of the code (section 0).
- No external research; no live checks of PayPal, Anthropic or the hackathon site.
- Sandbox and model evidence is developer-reported text.
- Mutation results were not re-run.
- Some test files were read only for headings or counts.
- The intermittent failure's cause is unknown.

---

## 16. Conclusions

1. **[V]** The deterministic gate, the PayPal adapter and the audit log are
   implemented to the approved design and have run end to end on the real sandbox
   for the success paths of capture, pre-check block and revoke-then-void.
2. **[V]** AI is advisory and bounded; both uses have run against the real model on
   a small sample, and the agent's carts have not been sent to PayPal.
3. **[V]** The largest gaps are not in the payment logic: the frontend does not
   exist, the README says the opposite of the repository's state, judge access to a
   payment path that needs a manual vault is unresolved, and the research basis is
   thin and partly missing.
4. **[I]** The code needs no rework before Increment 7. The records need a drift
   fix, and the demo needs a deterministic spine with the AI features layered on top.
5. **[R]** Before Increment 7 starts, decide the CORS/proxy question and the judge
   access model, because both change what the frontend is built to do.

---

## Appendix A: files inspected

`CLAUDE.md`; `README.md`; `docs/BUILD_STATUS.md` (full); `docs/DECISIONS.md`
(D-002 and D-006 to D-013 in full; D-022 to D-025 sections; other decisions by
heading only);
`docs/TECH_DEBT.md` (headings, statuses, TD-001..TD-025); `docs/LEARNING_NOTES.md`
(existence); `docs/research-summary.md`; `docs/spike-findings.md`;
`docs/evidence/paypal-lifecycle/*` (all six); `docs/evidence/ai-drafting/*`;
`docs/evidence/spike/README.md`; `package.json`; `pnpm-workspace.yaml`;
`apps/web/.env.example`; `apps/api/package.json`; in `apps/api/src/`:
`server.ts`, `config.ts`, `mandate-hash.ts`, `gate/{gate,state,audit-log,events}.ts`,
`paypal/{adapter,paypal-config,http,request-id}.ts`, `paypal/paypal-boundaries.test.ts`,
`routes/{attempts,mandates,draft,agent,simulation,respond}.ts`,
`ai/{drafter,shopper,prompt,shopper-prompt,cart}.ts`, `simulation/{catalogue,scenarios}.ts`;
in `apps/api/scripts/`: `e2e-run.ts`; in `packages/domain/src/`:
`evaluate.ts`, `payment-action.ts`, `paypal-status.ts`, `decision.ts`, `draft.ts`,
`explain.ts`, `canonical.ts`.

## Appendix B: key commands (re-runnable)

```
git rev-parse HEAD; git status --short; git log --oneline -8
git rev-list --left-right --count origin/main...HEAD
git branch -a --contains 6fcfced
git ls-files | wc -l
pnpm typecheck
pnpm exec vitest run
git grep -c -i countersign -- .
```

## Appendix C: proposed changes to other files (NOT applied; for approval)

| File | Proposed change | Why |
|---|---|---|
| `README.md` | Replace the status text; add prerequisites (Node 24, pnpm), install, test and run commands, environment variables, and what is simulated | C1; judge access |
| `docs/BUILD_STATUS.md` | Update the current-increment paragraph, the 5a and 6b roadmap rows, and mark the superseded "real model has not been run" lines; remove "AI integration" from "Not yet existing" | C2 to C5 |
| `docs/TECH_DEBT.md` | New items: intermittent test failure (cause unknown); CORS/proxy undecided; README drift; missing research report; refresh the stale review triggers on TD-005 and TD-013 | C6 to C8; section 5.5 |
| `docs/DECISIONS.md` | New decisions to make, not to record yet: browser-to-API route (rewrite versus CORS); judge access (hosted, instructions, or video-only) | L1; issue 11.1 |
| `docs/research-summary.md` | Note that the cited archive report is not in the tree | C6 |
| new file | Store the official hackathon rules text with its source and retrieval date | A10; section 14 item 2 |
| test configuration | Consider an explicit test timeout, only after the cause of the failure is understood | section 5.5 |

No application code change is proposed.
