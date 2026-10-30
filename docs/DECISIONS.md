# Ostensia Decision Log

Entries D-001 to D-005 are the repository bootstrap decisions, made on
2026-10-29 before any application code existed. Entries D-006 to D-013
record the MVP architecture approved on 2026-10-30. Use the template at
the end of this file for later entries.

## Decision D-001 — Remove the leading space from top-level directory names

Date: 2026-10-29
Status: Accepted
Related increment: Increment 0 (repository hygiene)
Related findings: Repository audit, 2026-10-29
Related risks: Broken paths and non-matching .gitignore rules

### Context
The first commit stored the top-level directories as " apps", " docs"
and " packages", each with a leading space. Paths in CLAUDE.md, README.md
and the research summary (for example docs/research-summary.md) did not
resolve. Anchored .gitignore rules, such as /docs/evidence/spike/raw/,
did not match, and a workspace glob such as apps/* would have matched
nothing.

### Options considered
1. Rename the directories with git mv.
   - Benefits: every documented path becomes correct, and the ignore
     rules work as written. Git records pure renames.
   - Costs/risks: editor tabs pointing at the old paths need reopening.
2. Keep the spaces and rewrite every reference.
   - Benefits: no renames.
   - Costs/risks: all tooling must quote the paths, and globs and
     scripts become fragile.
3. Rewrite history to correct the first commit.
   - Benefits: clean history.
   - Costs/risks: destructive, and unnecessary for a one-commit
     repository.

### Decision
Option 1. apps, docs and packages were renamed with git mv. The empty
packages directory was moved on disk only, because Git does not track
empty directories.

### Rationale
It is the smallest change that makes the existing documentation and
configuration correct, and it is cheapest to do before any code or
manifest depends on the paths.

### Trade-offs
The rename is a separate commit from the first one, so the first
commit's tree still contains the spaced names.

### Verification
git status lists all 11 tracked files as renames with 0 insertions and
0 deletions. git ls-files shows no leading spaces. git check-ignore
confirms the Postman environment file is still ignored at its new path.
The rename was committed in 5d426d5 after the developer authorized it.

### Revisit trigger
None expected.

### Follow-up
Done (5d426d5). The "Countersign" naming left in the spike artifacts is a
separate cleanup (see D-003).

## Decision D-002 — pnpm workspaces and monorepo layout

Date: 2026-10-29
Status: Accepted
Related increment: Increment 1 (workspace scaffold)
Related findings: Repository audit, 2026-10-29
Related risks: Unverified module resolution across workspace packages

### Context
The repository needs a package manager and layout before any
package.json exists. The research summary calls for a Fastify API, a
separate pure TypeScript domain module and a Next.js frontend. The
policy engine must be enforced in deterministic code that other layers
cannot bypass.

### Options considered
1. pnpm workspaces.
   - Benefits: strict dependency isolation, so a package cannot import
     something it did not declare. Fast installs.
   - Costs/risks: anyone running the repository needs pnpm.
2. npm workspaces.
   - Benefits: no extra tool to install.
   - Costs/risks: hoisting lets undeclared imports work by accident.
3. One package with no workspace.
   - Benefits: least configuration.
   - Costs/risks: the domain boundary is only a folder convention, and
     splitting out the Next.js app later is harder.

### Decision
Option 1, with this layout:
- apps/api: Fastify server (routes, PayPal adapter).
- apps/web: Next.js, created in a later increment.
- packages/domain: pure TypeScript for the mandate schema and
  deterministic purchase evaluation, with no I/O and no framework
  imports.

The root package.json will pin the version with the packageManager field
and set engines to node >=24.

### Rationale
Strict isolation enforces the domain boundary mechanically, which
supports the rule that purchasing rules are enforced in deterministic
server-side code. The installed versions on the developer machine are
Node v24.12.0 and pnpm 10.28.0.

### Trade-offs
Judges and reviewers need pnpm. This will be documented in the README.
npm workspaces is the closest alternative if ease of running matters
more than strictness.

### Verification
Not yet verified. Nothing has been created. Increment 1 must show that
apps/api can import packages/domain and that tests run.

### Revisit trigger
The workspace link between packages fails in a way that costs more time
than the isolation is worth, or the hackathon run-ability criterion
requires npm only.

### Follow-up
Open question for Increment 1: how apps/api consumes packages/domain
(TypeScript source through a runner such as tsx, Node's native type
stripping, or compiled output). It has not been tested and will be
decided separately with evidence.

## Decision D-003 — MIT license

Date: 2026-10-29
Status: Accepted
Related increment: Increment 0 (repository hygiene)
Related findings: Hackathon requires a public repository with an
open-source license (docs/research-summary.md, section 7)
Related risks: No explicit patent grant; unchecked third-party content

### Context
The hackathon requires a public repository with an open-source license.

### Options considered
1. MIT.
   - Benefits: short, common in the JS and TS ecosystem, simple for
     judges to read.
   - Costs/risks: no explicit patent grant. It allows commercial reuse
     and redistribution of modified versions.
2. Apache-2.0.
   - Benefits: explicit patent grant from contributors.
   - Costs/risks: longer, with a NOTICE convention.

### Decision
MIT, with "Copyright (c) 2026 J0shcodes" as the holder, matching the Git
author. The developer stated awareness that MIT permits commercial reuse
and has no patent grant. The project name is Ostensia. The old name
"Countersign" remains only in the spike artifacts and will be cleaned up
separately.

### Rationale
It satisfies the public source-code requirement and keeps licensing
straightforward.

### Trade-offs
No patent grant. The copyright holder is the Git username, not a legal
name, and may be changed later.

### Verification
The root LICENSE file was created. A text search of the tracked files
found no existing license notices, copyright lines or SPDX tags. This
search does not establish the provenance of the spike collection or
runner.

### Revisit trigger
A plan to commercialize or accept outside contributions where a patent
grant matters, or a decision to use a legal name as the holder.

### Follow-up
- Set "license": "MIT" in the root and every workspace package.json in
  Increment 1, and check that they match.
- Before publishing, review every dependency's license and complete the
  manual sanitization and provenance review of the spike artifacts.
- Rename "Countersign" references in the spike collection, runner file
  paths and environment name.

## Decision D-004 — Vitest as the test runner, with test conventions

Date: 2026-10-29
Status: Accepted
Related increment: Increment 1 (workspace scaffold)
Related findings: None
Related risks: Unverified type-stripping behavior across workspace
packages

### Context
CLAUDE.md requires automated tests for policy rules and important
payment-state logic, including negative paths such as no capture on a
missing, invalid or unknown policy result.

### Options considered
1. Vitest.
   - Benefits: TypeScript works without .ts import suffixes, workspace
     imports are resolved by the tool, built-in mocking, and it can be
     reused for apps/web.
   - Costs/risks: one dev dependency. It does not typecheck.
2. Node's built-in node:test.
   - Benefits: no new dependency.
   - Costs/risks: needs .ts import extensions and has no support for
     enums or path aliases. Whether type stripping works on
     workspace-linked packages is untested.
3. Jest.
   - Benefits: widely known.
   - Costs/risks: needs the most TypeScript configuration, with no
     advantage here.

### Decision
Option 1. Conventions:
- Domain tests sit beside the code as *.test.ts. They are pure and use
  no network.
- The PayPal adapter is tested against a faked fetch. Live sandbox calls
  are not part of the automated suite and are run manually, with
  evidence recorded and secrets removed.
- A test never claims that a real PayPal operation succeeded when the
  response was mocked. Mocked tests are named as such.
- Typechecking is a separate step (tsc --noEmit).

### Rationale
The deciding factor is schedule risk. With about 14 days to the
deadline, Vitest avoids the untested workspace type-stripping question.

### Trade-offs
One extra dev dependency, whose exact version will be named and
justified in the Increment 1 proposal.

### Verification
Not yet verified. Nothing has been installed or run.

### Revisit trigger
A quick test in Increment 1 showing that native type stripping works
across the workspace link would make zero dependencies reasonable.

### Follow-up
Name and justify the Vitest version when proposing Increment 1.

## Decision D-005 — First scaffold covers the API and domain package only

Date: 2026-10-29
Status: Accepted
Related increment: Increment 1 (workspace scaffold)
Related findings: Repository audit, 2026-10-29
Related risks: Over-scaffolding; unreviewable change size

### Context
CLAUDE.md forbids scaffolding the whole architecture at once, and the
developer wants to understand each piece.

### Options considered
1. API and domain only.
   - Benefits: tests the workspace link between api and domain, which is
     the part most likely to cause trouble, and gives a runnable
     /health endpoint.
   - Costs/risks: Fastify is a framework dependency.
2. API, domain and a Next.js shell.
   - Benefits: all three apps exist early.
   - Costs/risks: large dependency and configuration surface with no
     feature using it.
3. Domain only.
   - Benefits: smallest review size.
   - Costs/risks: does not test that api can import domain.

### Decision
Option 1. Increment 1 contains:
- Root package.json, pnpm-workspace.yaml, a shared tsconfig.base.json and
  scripts for test and typecheck.
- packages/domain with one trivial exported function and a passing
  Vitest test, to prove the wiring.
- apps/api with Fastify, GET /health and env loading that fails fast on
  invalid configuration. It imports from domain to prove the link, and
  it does not touch PayPal.

Out of scope: PayPal, AI, persistence and apps/web. A schema-validation
library such as Zod is not decided here and will be raised as its own
question in Increment 2.

### Rationale
The workspace link is the foundation for everything after it. Next.js is
not needed until the gate works.

### Trade-offs
No UI exists until a later increment.

### Verification
Not yet verified. Increment 1 acceptance criteria will be proposed and
approved separately before any file is created.

### Revisit trigger
The workspace link or Fastify setup takes much longer than planned.

### Follow-up
Propose Increment 1 in detail: exact files, pinned dependency versions,
scripts and tests. Stop for approval before implementing.

## Decision D-006 — MVP architecture: one API process, pure domain, isolated PayPal adapter

Date: 2026-10-30
Status: Accepted
Related increment: Increments 1–8
Related findings: docs/research-summary.md section 5; architecture plan review
Related risks: Policy logic leaking into I/O code; secrets reaching the browser

### Context
The MVP needs a frontend, an API, policy evaluation, PayPal calls, AI
drafting and an audit record. The historical report proposed separate
Gate, Resolver and Harness services, plus AG Studio and PostgreSQL.

### Options considered
1. A single Fastify process holding all secrets. A pure domain package for
   schemas, evaluation and payment-action rules. A PayPal adapter module.
   Next.js as a thin client that reaches Fastify through a rewrite.
   - Benefits: deterministic rules can be tested without I/O; secrets stay
     in one process; no CORS setup is needed.
   - Costs/risks: two processes to run locally.
2. Next.js route handlers only.
   - Benefits: one process.
   - Costs/risks: payment secrets and policy code live inside the web app,
     against the agreed stack.
3. Separate services, as in the historical design.
   - Benefits: matches the original report.
   - Costs/risks: deployment and coordination cost with no MVP need.

### Decision
Option 1.
- Gate becomes the domain evaluator plus a gate module in the API.
- Resolver is deferred. At most it becomes a labelled simulated view
  built from the audit record.
- Harness becomes the test strategy (D-011).
- AG Studio is dropped for the MVP.
- PostgreSQL is deferred (D-008).

### Rationale
This is the smallest structure that keeps enforcement deterministic,
server-side and testable.

### Trade-offs
- Locks and state are valid only within one process.
- The developer runs both the web app and the API.

### Verification
Increment 1 must show that the API imports the domain package. Increment 2
must show that the domain has no I/O imports.

### Revisit trigger
Multi-instance hosting, or a proven need for a separate dispute service.

### Follow-up
None.

## Decision D-007 — Gate ordering: pre-check, vault order, final evaluation, capture or void

Date: 2026-10-30
Status: Accepted
Related increment: Increments 2, 5
Related findings: Spike collection 02.1–02.4 and 03.1–03.4; docs/spike-findings.md section 2
Related risks: Funds held for non-compliant purchases; void not demonstrable

### Context
An order created with a previously approved vault_id came back already
authorized: a later authorize call returned 422 ORDER_ALREADY_AUTHORIZED.
The only way to avoid holding funds is to check the purchase before the
order is created.

### Options considered
1. Authorize first, then evaluate, then capture or void.
   - Benefits: a void happens on every block.
   - Costs/risks: funds are held even for obviously non-compliant purchases.
2. Evaluate first and authorize only compliant purchases.
   - Benefits: nothing is held.
   - Costs/risks: void never happens, and amounts PayPal reports are never
     checked.
3. Pre-check, then create the vault order, then run a final evaluation
   that includes PayPal-observed facts, then capture or void.
   - Benefits: no hold for an obvious violation. A void still covers
     violations that appear after authorization: mandate revoked or
     expired, or a mismatch in observed amount, currency or custom_id.
   - Costs/risks: two evaluation points to test and explain.

### Decision
Option 3. Capture happens only when the final decision is "allow" and the
observed authorization status is CREATED. Void happens only when the final
decision is "block" and the status is CREATED. Every other combination
performs no PayPal write.

### Rationale
The flow follows the payment lifecycle the spike evidenced, rather than
forcing a void into every block.

### Trade-offs
The demo shows a void through a labelled "revoke before settlement"
scenario. If a void is not permitted, the attempt ends blocked and
uncaptured, and the authorization lapses at expiry.

### Verification
Increment 2: exhaustive tests of the payment-action table. Increment 5:
fake-PayPal tests confirm zero PayPal calls on a pre-check block and zero
captures on any failure. Increment 7: a manual sandbox end-to-end run.

### Revisit trigger
E-1 shows that the vault order no longer authorizes without the buyer.

### Follow-up
None.

## Decision D-008 — Persistence: in memory plus an append-only JSONL audit log

Date: 2026-10-30
Status: Accepted
Related increment: Increment 5
Related findings: Architecture plan review
Related risks: Audit loss; concurrency across processes

### Context
The MVP needs immutable confirmed mandates, purchase-attempt state and an
audit trail that survives restarts. The historical report proposed
PostgreSQL.

### Options considered
1. In memory only.
   - Benefits: nothing to set up.
   - Costs/risks: the audit is lost on restart.
2. In memory plus an append-only JSONL file replayed at startup.
   - Benefits: no new dependency; the audit is human-readable and survives
     restarts.
   - Costs/risks: single process only; replay code must be written by hand.
3. SQLite through node:sqlite.
   - Benefits: transactions.
   - Costs/risks: its stability in Node 24 is not yet verified.
4. PostgreSQL with an ORM.
   - Benefits: multi-user and concurrent.
   - Costs/risks: a server, migrations and hosting for a single-user demo.

### Decision
Option 2. The JSONL file lives in a gitignored data/ directory.

### Rationale
One process and one user, with no cross-instance locking. PostgreSQL is not
justified now.

### Trade-offs
Not suitable for multi-instance hosting. A corrupt final line is skipped
with a warning.

### Verification
Increment 5: the audit survives a restart.

### Revisit trigger
Multi-user hosting, more than one API instance, or real customers.

### Follow-up
None.

## Decision D-009 — Mandate model, and the hash as binding rather than enforcement

Date: 2026-10-30
Status: Accepted
Related increment: Increment 2
Related findings: docs/spike-findings.md section 2 (custom_id round-trip)
Related risks: Treating the hash as enforcement; AI-invented limits

### Context
The AI proposes mandates, and the user confirms them. PayPal stores
custom_id and echoes it back, but it does not interpret it.

### Options considered
1. Zod schemas: a lenient Draft that may hold null fields, and a strict
   confirmed Mandate.
   - Benefits: one source for types and validation; "AI-proposed" and
     "user-confirmed" stay distinct.
   - Costs/risks: one runtime dependency, approved separately in
     Increment 2.
2. Hand-written validators.
   - Benefits: no dependency.
   - Costs/risks: types and checks are duplicated.
3. JSON Schema with Ajv.
   - Benefits: a natural fit for AI structured output.
   - Costs/risks: types drift away from the schema.

### Decision
Option 1, subject to approval of the Zod dependency in Increment 2.
- Confirmed mandates are immutable. An edit creates a new mandate.
- Money is held as integer minor units, USD only.
- The SHA-256 hash of the mandate's canonical JSON goes in custom_id.
- The hash binds a payment to a mandate. It does not enforce the mandate.

### Rationale
Only deterministic evaluation decides compliance. The hash lets anyone
check later which mandate a payment claimed to follow.

### Trade-offs
A schema that is too strict may reject real intents.

### Verification
Increment 2 tests for canonical-hash stability (key order, Unicode) and
for every rule.

### Revisit trigger
A need for multiple currencies or for mandate signatures.

### Follow-up
None.

## Decision D-010 — PayPal lifecycle and request contract

Date: 2026-10-30
Status: Accepted
Related increment: Increments 3, 4
Related findings: Spike collection 02.x and 03.x; PayPal Orders v2 and Payments v2 documentation reviewed 2026-10-30
Related risks: Duplicate capture; unverified request shapes; misreading payment state

### Context
The spike created orders with intent AUTHORIZE and
payment_source.paypal.vault_id, with custom_id set to the mandate hash.
- An authorization existed afterwards: step 02.3 found it on the order,
  and the authorize call returned 422 ORDER_ALREADY_AUTHORIZED.
- Capture and void each succeeded, on different authorizations.
- PayPal documentation also recommends stored_credential for payments the
  merchant initiates. The spike did not send it.

### Options considered
1. A custom adapter over fetch that reproduces the spike's exact request
   body.
   - Benefits: matches the evidence; full control of headers.
   - Costs/risks: about 200 lines of our own code.
2. PayPal's server SDK.
   - Benefits: typed.
   - Costs/risks: behaviour differs from the evidenced REST calls; a new
     dependency.
3. Adding stored_credential now.
   - Benefits: follows the documentation's recommendation.
   - Costs/risks: an untested request shape.

### Decision
Option 1, with these rules:
- No authorize call.
- Order, authorization and capture statuses are kept as separate families.
  Each raw value is stored and mapped to a neutral state; an unrecognised
  value maps to "unknown".
- Only authorization status CREATED permits capture or void.
- PayPal-Request-Id values are deterministic per attempt and operation.
- Write operations are never retried automatically. A timeout leaves the
  outcome unknown, and the next step is to reconcile by reading state.
- PayPal calls are locked to the sandbox base URL.
- stored_credential is not sent (TD-004).

### Rationale
Only evidenced operations are used, and the code never depends on status
values that were not observed.

### Trade-offs
- The status value lists must be confirmed in E-1 and against the
  Payments v2 schema.
- The deviation from the documented stored_credential recommendation is
  accepted for the sandbox MVP.

### Verification
Increment 3: tests assert the exact request shape. E-1 and Increment 4: one
real capture and one real void are recorded, with identifiers sanitized.

### Revisit trigger
E-1 contradicts the evidence, or PayPal rejects the request without
stored_credential.

### Follow-up
None.

## Decision D-011 — Test strategy and the E-1 evidence gate

Date: 2026-10-30
Status: Accepted
Related increment: All
Related findings: D-004
Related risks: False confidence from mocks; repeated manual sandbox runs

### Context
Payment behaviour must be tested without repeated manual sandbox runs.
Mocks must never be presented as real PayPal results.

### Options considered
1. Domain unit tests, a faked fetch for the adapter, a stateful fake PayPal
   with failure injection for the gate, fixtures taken from sanitized real
   responses, and manual smoke runs.
   - Benefits: fast and repeatable; covers timeouts, duplicate requests and
     unknown statuses.
   - Costs/risks: the fake can drift from real PayPal behaviour.
2. Automated sandbox tests.
   - Benefits: real behaviour.
   - Costs/risks: credentials needed in CI; slow; manual vault approval.
3. Re-using the Postman runner.
   - Benefits: already exists.
   - Costs/risks: does not test our code, and its paths are broken.

### Decision
Option 1. E-1 is a manual Postman run by the developer that records the
real lifecycle, sanitized. It is a hard gate before capture and void
integration (Increment 4). It does not block Increments 1 and 2.

### Rationale
Real responses keep the fakes honest. Hard safety properties, such as zero
capture calls on any failure, are tested automatically.

### Trade-offs
One manual run is required.

### Verification
E-1 results recorded under docs/evidence/paypal-lifecycle/.

### Revisit trigger
The fake contradicts real responses.

### Follow-up
None.

## Decision D-012 — Purchase source: synthetic catalogue and a labelled simulated agent

Date: 2026-10-30
Status: Accepted
Related increment: Increments 5, 7
Related findings: No shopping-agent source is defined in the project documents
Related risks: The demo implying a real merchant or agent

### Context
Something has to propose purchases for evaluation.

### Options considered
1. A synthetic catalogue with preset scenarios and an editable cart,
   labelled "Simulated shopping agent".
   - Benefits: deterministic, quick to build, honest.
   - Costs/risks: not a real agent.
2. An AI agent that browses real merchants.
   - Benefits: realistic.
   - Costs/risks: large scope; unpredictable.

### Decision
Option 1.

### Rationale
The gate is the product. The cart source only needs to produce compliant
and non-compliant proposals reliably.

### Trade-offs
Less impressive realism.

### Verification
Increment 7: simulation labels are visible in the UI.

### Revisit trigger
After the MVP.

### Follow-up
None.

## Decision D-013 — Local-first hosting; earlier generated code not reused

Date: 2026-10-30
Status: Accepted
Related increment: All
Related findings: Recovery after unapproved implementation, 2026-10-29
Related risks: A hosting requirement discovered late; scope creep from earlier code

### Context
The hackathon's hosting requirement is unverified. Code produced earlier
without approval exists on backup/unapproved-codegen, on
feat/repo-bootstrap and in stash 1579901.

### Options considered
1. Develop locally first and verify the hosting rules.
   - Benefits: no deployment, authentication or storage-durability work up
     front.
   - Costs/risks: hosting may be needed late.
2. Host from the start.
   - Benefits: no late surprise.
   - Costs/risks: authentication and durable storage become MVP scope.

### Decision
Option 1. Earlier generated code stays unapproved. It is not reused
automatically and may only be consulted with explicit approval for a
specific increment.

### Rationale
Keeps every increment reviewable and approved.

### Trade-offs
Some work may be redone.

### Verification
Hosting rules checked against the official hackathon rules before
Increment 8.

### Revisit trigger
The rules require a hosted demo (TD-007).

### Follow-up
Verify the hackathon rules.

## Template for later entries

### Decision D-NNN — [Title]

Date:
Status: Proposed / Accepted / Rejected / Superseded
Related increment:
Related findings:
Related risks:

#### Context
What decision must be made, and why does it matter?

#### Options considered
1. Option A
   - Benefits:
   - Costs/risks:

2. Option B
   - Benefits:
   - Costs/risks:

#### Decision
What was selected?

#### Rationale
Why is the selected option suitable for the current product and deadline?

#### Trade-offs
What are we accepting or giving up?

#### Verification
What tests or observations show that the decision works?

#### Revisit trigger
What evidence would cause us to reconsider the decision?

#### Follow-up
What should be documented or done later?
