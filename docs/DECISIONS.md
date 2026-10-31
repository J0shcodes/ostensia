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
Verified in Increment 1 (2026-10-30): pnpm install resolved the three
workspace projects, apps/api imports packages/domain through the workspace
link, and tests and typecheck run from the root.

### Revisit trigger
The workspace link between packages fails in a way that costs more time
than the isolation is worth, or the hackathon run-ability criterion
requires npm only.

### Follow-up
Answered in Increment 1 (see D-014): apps/api consumes the TypeScript
source of packages/domain directly through Node's native type stripping.
No tsx and no build step.

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
  Increment 1, and check that they match. Done in Increment 1: the root,
  apps/api and packages/domain all say MIT.
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
Verified in Increment 1 (2026-10-30): Vitest 4.1.12 is installed and 20
tests pass from the root with pnpm test.

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
Verified in Increment 1 (2026-10-30): the scaffold contains only the
approved files, and GET /health returned 200 from a real process.

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

## Decision D-014 — Toolchain versions and how the API consumes the domain package

Date: 2026-10-30
Status: Accepted
Related increment: Increment 1
Related findings: npm registry check on 2026-10-30; D-002 open question
Related risks: Newly released tool majors; syntax that Node cannot run directly

### Context
Increment 1 needed exact versions and an answer to D-002's open question
about how apps/api consumes packages/domain. On 2026-10-30 the latest
releases were TypeScript 7.0.2 (2026-07-08), Vitest 5.0.5 (2026-10-15),
Fastify 5.12.7 and @types/node 26.6.6.

### Options considered
1. TypeScript 6.0.3 and Vitest 4.1.12.
   - Benefits: the versions already approved; Vitest 4 declares its Vite
     dependency itself.
   - Costs/risks: one major version behind on each.
2. TypeScript 7.0.2 and Vitest 5.0.5.
   - Benefits: newest releases.
   - Costs/risks: a new compiler; Vitest 5 is two weeks old and needs Vite
     as a separate direct dependency.
3. Consuming the domain package through tsx or compiled output.
   - Benefits: no reliance on Node's type stripping.
   - Costs/risks: an extra dependency or a build step.

### Decision
Option 1, with every version pinned exactly: typescript 6.0.3, vitest
4.1.12, fastify 5.12.7, @types/node 24.19.2 (which matches the Node 24
runtime). The domain package's exports field points at src/index.ts, and
the API runs with node src/index.ts using native type stripping.

tsconfig.base.json makes TypeScript reject syntax that Node cannot strip
(erasableSyntaxOnly, verbatimModuleSyntax, allowImportingTsExtensions)
and sets noEmit, so TypeScript only typechecks. Node types are loaded
only in apps/api, so the domain package cannot use Node globals by
accident. The API binds to 127.0.0.1 only, and config errors name the
variable but never echo its value.

### Rationale
Pinned, already-approved versions keep the scaffold reviewable, and native
type stripping removes a dependency and a build step.

### Trade-offs
- Both tools are one major version behind, and upgrades are deferred.
- The API depends on Node 24's type stripping.
- Increment 2 must decide how canonical hashing gets SHA-256 without
  giving the domain package Node types.
- D-004 named a successful native-stripping test as a possible reason to
  reconsider Vitest. Vitest stays, because it was approved and gives
  mocking and extensionless imports. The question can be revisited.

### Verification
Increment 1, on Windows with Node v24.12.0 and pnpm 10.28.0:
- pnpm test: 3 files, 20 tests passed.
- pnpm typecheck: exit code 0 for both packages.
- A plain node process started with the pnpm start command's flags
  returned 200 {"status":"ok","domain":"@ostensia/domain"} from
  GET /health, and the domain value comes from the workspace import.
- PORT and NODE_ENV set to invalid values exited with code 1, and the
  output did not contain the bad values.

### Revisit trigger
Native type stripping fails on another platform or Node version, or the
dependency upgrades become worth the cost.

### Follow-up
Decide the SHA-256 approach in the Increment 2 proposal.

## Decision D-015 — Canonical mandate binding, with SHA-256 computed in the API

Date: 2026-10-31
Status: Accepted
Related increment: Increment 2a
Related findings: D-009; D-014 (domain package has no Node types)
Related risks: Hash not matching the mandate; non-deterministic encoding; cryptographic mistakes

### Context
The mandate hash goes into PayPal's custom_id (D-009). The domain package
must stay free of I/O and of Node types (D-014), but SHA-256 normally
comes from node:crypto.

### Options considered
1. The domain produces the canonical string; apps/api hashes it with
   node:crypto.
   - Benefits: the domain stays pure; Node's audited SHA-256 is used;
     hashing is synchronous.
   - Costs/risks: the hash is computed in the API, so the evaluator cannot
     recompute it.
2. Web Crypto (crypto.subtle) inside the domain.
   - Benefits: everything in one package.
   - Costs/risks: asynchronous; needs extra type libraries in the domain.
3. A hand-written SHA-256 in the domain.
   - Benefits: pure and synchronous.
   - Costs/risks: our own cryptographic code.

### Decision
Option 1.
- The binding payload is { id, version, terms }. status, confirmedAt,
  intentSummary and hash are excluded, so revoking a mandate does not
  change its hash.
- canonicalize writes object keys in sorted (UTF-16 code unit) order and
  keeps array order. It accepts only null, booleans, strings, safe
  integers, arrays and plain objects, and throws on anything else
  (undefined, NaN, fractions, bigint, Date, Map, class instances, sparse
  arrays, nesting deeper than 32).
- Strings are not Unicode-normalised.
- Ids (mandate, product, variant) must match
  ^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$, so ids compare, hash and print
  predictably.

### Rationale
The only cryptography is Node's own, and the domain stays pure and
testable.

### Trade-offs
- The evaluator compares the stored hash and never recomputes it.
- Reordering a mandate's items changes its hash.
- Visually identical strings in different Unicode forms hash differently.
- The hash is not a signature (D-009).

### Verification
Increment 2a: sha256Hex matches the published SHA-256 vectors for "abc" and
the empty string; the hash of the golden canonical string is pinned and was
computed with sha256sum, not with this code; tests cover key order, nesting,
Unicode and every rejected value type.

### Revisit trigger
A need for signatures, or a mandate schema version 2.

### Follow-up
- The gate (Increment 5) must recompute hashMandate and compare it with the
  stored mandate.hash before evaluating.
- Increment 2b compares PayPal's custom_id with mandate.hash.

## Decision D-016 — Zod 4.6.7 as a runtime dependency of the domain package

Date: 2026-10-31
Status: Accepted
Related increment: Increment 2a
Related findings: D-009; npm registry check on 2026-10-30
Related risks: A new runtime dependency in the policy code

### Context
D-009 chose Zod schemas for mandates and proposals, subject to approval of
the dependency.

### Options considered
1. Zod 4.6.7.
   - Benefits: one source for types and validation; strict objects reject
     unknown keys; z.toJSONSchema can serve AI structured output later.
   - Costs/risks: a runtime dependency in the policy code.
2. Hand-written validators.
   - Benefits: no dependency.
   - Costs/risks: duplicated types and more room for gaps.
3. JSON Schema with Ajv.
   - Benefits: native format for AI structured output.
   - Costs/risks: types drift from the schema.

### Decision
Option 1. Zod 4.6.7 is pinned exactly and is a dependency of
packages/domain only. The release date is 2026-10-12, the license is MIT
and the installed package declares no dependencies of its own.

### Rationale
It is the smallest way to get types and runtime validation from one
definition.

### Trade-offs
- Unknown keys are rejected, so an AI draft with extra keys fails
  validation. How to handle that is decided in the AI increment.
- The domain gains one runtime dependency.

### Verification
Increment 2a: schema tests for every rejected shape; the purity test allows
only "zod" and relative imports in the domain sources.

### Revisit trigger
A Zod release that changes validation behaviour this code relies on.

### Follow-up
Include Zod in the dependency license review (TD-002).

## Decision D-017 — Pre-check evaluator semantics

Date: 2026-10-31
Status: Accepted
Related increment: Increment 2a
Related findings: CLAUDE.md section 7; D-007
Related risks: Rules bypassed by splitting or under-declaring; arithmetic overflow; unclear boundaries

### Context
The pre-check runs before any PayPal call (D-007) and must be
block-by-default. Several boundaries needed an explicit choice.

### Options considered
1. Collect every violation, with a fixed order and a fixed explanation per
   code.
   - Benefits: the user sees the whole picture; results are reproducible.
   - Costs/risks: slightly more code.
2. Stop at the first violation.
   - Benefits: simpler.
   - Costs/risks: a blocked purchase would be explained one rule at a time.

### Decision
Option 1, with these rules.
- Invalid mandate, proposal or clock blocks. All three are reported
  together, and nothing else is evaluated.
- The total is always computed from unit prices and quantities. The
  proposal's declared total is only compared with it.
- Quantity is summed per product across all lines.
- A mandate is valid only while expiresAt is later than now. An expiry equal
  to now, or one that cannot be parsed, counts as expired.
- If the mandate lists allowed variants, every line for that product needs
  one of them; a missing variant is blocked. With no list, any variant is
  allowed.
- Currency must be exactly "USD".
- A total that leaves the safe-integer range blocks with AMOUNT_OVERFLOW.
- Input bounds: quantity up to 1,000,000, at most 50 mandate items and 100
  purchase lines (TD-012).

### Rationale
Each rule closes a specific bypass: splitting a product over lines,
declaring a low total, expiring at the boundary, or overflowing the sum.

### Trade-offs
- The bounds are arbitrary MVP limits.
- Objects with throwing property getters were not tested (TD-013).

### Verification
Increment 2a: 257 tests including boundary and bypass cases, a 2000-case
seeded comparison against an independent BigInt implementation, and 16 of 16
deliberate rule mutations caught.

### Revisit trigger
Real catalogue data that the bounds or the id charset reject.

### Follow-up
Increment 2b adds the final evaluation with PayPal-observed facts (D-018).

## Decision D-018 — Final evaluation, status mappings and the payment-action rule

Date: 2026-10-31
Status: Accepted
Related increment: Increment 2b
Related findings: D-007, D-010; CLAUDE.md section 7
Related risks: Capturing on an unreadable decision; an irreversible void on an unreadable decision; treating the hash as a tamper check; reading PayPal strings loosely
Related questions: Whether the status lists are complete (TD-005, E-1)

### Context
D-007 has two evaluation points and a rule that turns the final decision
and the authorization status into a PayPal write. Increment 2a built the
first evaluation point. Four choices needed an explicit decision.

### Options considered
1. A missing custom_id.
   - BINDING_MISMATCH: a missing binding is a binding failure.
   - OBSERVATION_INVALID: the observation is incomplete.
2. A decision that is malformed, or a block with no violations.
   - No action: nothing is written.
   - Void: treat any block as a reason to release the hold.
3. Status lists.
   - Only the values in our records (TD-005).
   - PayPal's full documented lists, added now.
4. Converting PayPal's amount string ("95.00") to cents.
   - In the adapter, in Increment 3, checked against real E-1 responses.
   - A pure parser in the domain now.

### Decision
- Option 1: BINDING_MISMATCH. customId is null when PayPal returned none.
- Option 2: no action. A void cannot be undone, and D-010 says anything not
  understood performs no write. The cost is that an unreadable block leaves
  funds held until the authorization expires.
- Option 3: only values in our records. Only authorization "created" permits
  a write, so an unlisted value can only cause "no action".
- Option 4: in the adapter.

Rules of the final evaluation (finalEvaluatePurchase):
- It repeats every pre-check rule at the current time, then compares what
  PayPal reported: amount against the computed total (not the declared one),
  currency exactly, and custom_id exactly and case-sensitively against
  mandate.hash.
- An invalid observation is reported with the other invalid inputs.
- BINDING_MISMATCH compares the echoed custom_id with the stored hash. It
  does not recompute the hash, so it is not a tamper check. That stays in
  the gate (D-015).
- The pre-check and the final evaluation share one internal function, so the
  policy rules cannot drift apart.

Status mappings are exact and case-sensitive, with three separate families
(order, authorization, capture). Unlisted values and non-strings map to
"unknown".

nextPaymentAction(decision, authorization) takes both arguments as unknown.
It returns capture for a valid allow, void for a valid block, and only when
the authorization is exactly "created". Everything else, including a raw
PayPal string such as "CREATED", returns none.

### Rationale
Each default is the safe one: no decision means no write.

### Trade-offs
- Status lists may be incomplete; a legitimate status could give "no
  action" until E-1 widens them.
- The caller must pass the final decision. The domain cannot know which
  decision it was given, so the ordering is enforced by the gate
  (Increment 5).

### Verification
Increment 2b: 466 tests in total. This covers every new violation code,
each boundary, a 24-case action table, malformed decisions, near-miss status
strings, and a 2000-case seeded comparison with the BigInt reference
(a matching observation allows exactly when the reference does, and each of
four changed observations blocks). 18 of 18 deliberate mutations were
caught.

### Revisit trigger
E-1 shows other status values, or PayPal reports amounts in a form the
adapter cannot convert exactly.

### Follow-up
Increment 3 converts PayPal amount strings to minor units. Increment 5 wires
the two evaluation points, recomputes the hash and passes the final decision
to nextPaymentAction.

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
