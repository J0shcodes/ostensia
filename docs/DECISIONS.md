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

## Decision D-019 — Adapter contract points taken from the E-1 evidence

Date: 2026-11-02
Status: Accepted (2026-11-02, by the developer)
Related increment: Increments 3, 4, 5
Related findings: docs/evidence/paypal-lifecycle/E1_RESULTS.md and its addendum; D-007, D-010
Related risks: Writing on a misread state; double capture; treating a create response as the source of truth
Related questions: The residuals listed below

### Context
E-1 ran the lifecycle in the sandbox on 2026-11-02. What was observed:
- Create vault order: 201, order COMPLETED, authorization present in the
  response with status CREATED. No /authorize call was used.
- GET authorization: 200, CREATED, amount "72.00" USD, create_time and
  expiration_time exactly 29 days apart, and a custom_id field.
- Capture: 201, COMPLETED. Replay with the identical request id, body and
  authorization: 200, same capture id. Order read shows one capture.
- Void after capture: 422 PREVIOUSLY_CAPTURED.
- Separate authorization: void returned 204 with an empty body, GET then
  showed VOIDED, and a capture afterwards returned 422 AUTHORIZATION_VOIDED.
- Developer-reported afterwards: order COMPLETED and authorization CAPTURED
  after the capture.

### Options considered
1. Adopt the contract points below now.
   - Benefits: Increment 3 can be proposed against real shapes.
   - Costs/risks: a few points rest on developer-reported details.
2. Wait for another sandbox run that records those details.
   - Benefits: stronger evidence.
   - Costs/risks: delays Increment 3 for details the Increment 4 smoke test
     will also show.

### Decision
Option 1. The developer accepted every contract point below on 2026-11-02,
and closed E-1 for the Increment 3 proposal only. R1 to R4 are to be recorded
in the Increment 4 sandbox run; E-1 is not closed for Increment 4 until
then. The contract points are:
- The final evaluation's observed facts (amount, currency, custom_id) and the
  authorization status and expiry come from GET authorization, not from the
  create response.
- The anomaly rule applies to any order status: an order with no
  authorization performs no write. COMPLETED with a CREATED authorization is
  the normal vault case.
- The adapter builds URLs from its sandbox base URL and ids. It never follows
  the hrefs in a response's links.
- A void is recorded as voided only after a GET shows VOIDED. The 204 alone
  is a request outcome. The adapter must not parse a body on a 204.
- A repeated capture response (2xx, same capture id) is the same result, not
  a second capture. D-010 stands: writes are not retried automatically, and
  reconciliation reads the authorization (CAPTURED was reported after
  capture).
- 422 PREVIOUSLY_CAPTURED and 422 AUTHORIZATION_VOIDED are classified as
  "already terminal, reconcile by reading". Any other error leaves the state
  unknown and performs no write. Only the issue strings were recorded, so
  the adapter must not rely on the rest of the error body.
- Amounts are decimal strings with exactly two decimals ("72.00"). Anything
  else is an invalid observation. The domain compares minor units (D-018).
- A 404 RESOURCE_NOT_FOUND from the vault is a distinct "vault unavailable"
  failure, and no order is created. The vault id in the environment is the
  payment-token id, not the setup-token id, and .env.example will say so.

### Rationale
Each point follows an observed response or the rule that nothing unknown
permits a write. No domain code changes: COMPLETED, CREATED, CAPTURED and
VOIDED are already mapped (D-018).

### Trade-offs
- Residuals, none of which blocks the Increment 3 proposal:
  - R1 (closed 2026-11-02 by the adapter smoke run): the value of custom_id
    on GET authorization was not shared, so the round-trip on that resource
    was not evidenced (the spike showed it on the order).
  - R2: the post-capture statuses are developer-reported, with no HTTP
    status.
  - R3: the field path of the captures count on the order was not recorded.
  - R4: whether the earlier spike vault id is still valid was not tested.
- Unobserved statuses are unchanged (TD-005).

### Verification
Increment 3: fixtures built only from sanitized real shapes, with tests for
each point above. Increment 4: one real capture and one real void against the
sandbox, recorded with identifiers sanitized.

### Revisit trigger
A sandbox response that contradicts E1_RESULTS.md, or a residual that turns
out to matter.

### Follow-up
TD-014 tracks the residuals. They are recorded in the Increment 4 sandbox
run, and the developer closes E-1 for Increment 4 after that.

## Decision D-020 — PayPal adapter: validation, base URL, smoke run and outcome model

Date: 2026-11-02
Status: Accepted (2026-11-02, by the developer)
Related increment: Increment 3
Related findings: D-010, D-011, D-019; docs/evidence/paypal-lifecycle/
Related risks: Writing on a misread response; credentials sent to another host; a retried write; secrets in logs; claiming the adapter works without a real run
Related questions: R1 (custom_id on GET authorization)

### Context
Increment 3 builds the PayPal adapter that Increment 5's gate will call. D-010
and D-019 fix its contract. Four choices were left open in the proposal.

### Options considered
1. How to validate PayPal responses.
   - zod 4.6.7 in apps/api. Benefits: the exact version already in the
     lockfile (no new download); the same tool as the domain.
   - Hand-written checks. Benefits: no dependency. Costs: more code to review.
   - Schemas in the domain. Costs: puts PayPal's wire format in the pure
     package.
2. The base URL.
   - A code constant, and a ConfigError if PAYPAL_BASE_URL is set to anything
     else.
   - An environment variable validated to the sandbox value.
3. The smoke run.
   - Read-only plus one opt-in create, which can close R1.
   - Read-only only.
4. The timeout: 15 seconds, or another value.

### Decision
- Option 1A. zod 4.6.7 is added to apps/api. The lockfile changed by three
  lines, a workspace link only.
- Option 2A. The sandbox URL is a constant. Requests use only paths built
  from ids restricted to letters, digits, hyphens and underscores, and the
  resolved origin must equal the sandbox origin. Redirects are never followed
  and response links are never followed.
- Option 3A. apps/api/scripts/paypal-smoke.ts is run by the developer. It
  creates an order only with --create, prints a sanitized report, and never
  captures or voids.
- Option 4: 15 seconds, set per call with AbortSignal.timeout.

The outcome model, which every adapter method follows:
- A value is returned for everything PayPal or the network can do. The only
  throw is AdapterInputError, for arguments our own code got wrong.
- not_sent: no token, so nothing reached the endpoint.
- rejected: PayPal answered with a 4xx other than 408, 409 and 429. Only the
  error name and issue strings are returned, clipped, never the message.
- unknown: a timeout, a network error, 408, 409, 429, 5xx, an unexpected
  status, or a 2xx that cannot be read. For the create call the order id is
  returned when it is known.
- A write is sent exactly once. Nothing is retried. A 401 invalidates the
  cached token for the next call and does not repeat the failed one.
- Create order keeps the E-1 request shape: intent AUTHORIZE, only
  payment_source.paypal.vault_id, no stored_credential, no authorize call.
- A 2xx without an authorization causes one re-read of the order. Still none
  gives an anomaly. More than one authorization gives an anomaly, with no
  guessing which to use.
- The final evaluation's observed facts come from GET authorization (D-019).
  An amount that is not exactly two decimals stays null and the evaluator
  blocks with OBSERVATION_INVALID.

### Rationale
Every result is something the caller must look at, so a forgotten catch
block cannot lead to a capture. The unknown outcomes keep the "a timeout is
not a failure" rule from D-010.

### Trade-offs
- The adapter has not been run against the real sandbox. Its tests use a fake
  built from the E-1 shapes (D-011). TD-015 records this.
- There is no automatic token refresh-and-retry (TD-016).
- checkVault reads only the status, because E-1 recorded nothing else.

### Verification
23 test files and 723 tests, including a request-shape test, every failure
class with a count of POST calls, the amount parser, the sandbox guard, token
caching, and a path from adapter output through the final evaluation to the
payment-action rule. 31 of 31 deliberate mutations were caught. Two redundant
guards that no test could distinguish were removed, and one unreachable check
was made reachable and tested.

### Revisit trigger
The smoke run or the Increment 4 sandbox run contradicts a fixture shape.

### Follow-up
The developer runs the smoke script (R1). Increment 4 adds capture and void
behind the same outcome model. Increment 5 wires the adapter into the gate.

## Decision D-021 — Capture and void in the adapter, and closing E-1 for Increment 4

Date: 2026-11-02
Status: Accepted (2026-11-02, by the developer)
Related increment: Increment 4
Related findings: D-007, D-010, D-018, D-019, D-020; docs/evidence/paypal-lifecycle/ (E1-C.4 to C.7, E1-V.3 to V.5)
Related risks: A duplicate capture; a capture whose outcome is unknown; reporting a void that did not happen; leaving a sandbox authorization open
Related questions: R2 and R3 (TD-014)

### Context
The domain can already decide capture, void or nothing (nextPaymentAction,
D-018). The adapter could create orders and read state but could not perform
either payment write. E-1 was still formally open for this increment because of
the residuals R2 to R4 (TD-014).

### Options considered
1. E-1 closure for this increment.
   - A. Close R3 from the collection definition, close R4 as not needed, and
     make R2 an acceptance criterion of the lifecycle run, so code proceeds
     on the shapes E-1 observed.
   - B. The developer records R2 in Postman before any capture or void code is
     written.
2. Where void confirmation lives.
   - A. Inside voidAuthorization, with one GET.
   - B. Return "void requested" and let the gate confirm.
3. The capture body.
   - A. The E-1 shape, {"final_capture": true}, with no amount.
   - B. The amount sent explicitly (an untested request shape).
4. The lifecycle run.
   - A. Both paths.
   - B. The capture path only.
5. The script option that creates orders.
   - Replace --create with --lifecycle, which settles everything it creates.
   - Keep --create.

### Decision
Option A for 1 to 4, and the replacement in 5, all chosen by the developer.
- E-1 is closed for Increment 4 on these terms: R3's field path is
  purchase_units[].payments.captures, from request E1-C.6; R4 is closed as
  not needed; R2 must pass in the lifecycle run (the authorization reads
  CAPTURED after a capture). The developer records the run.
- captureAuthorization sends the E-1 capture request once: a full capture with
  no amount, Prefer: return=representation, and a request id built from the
  attempt id and "capture". A 201 (the capture) or a 200 (the E-1 replay) with
  a readable body is "accepted". Only capture state "completed" means money
  moved. "pending" and unknown states are not completion.
- voidAuthorization sends the E-1 void request once (an empty JSON body, no
  Prefer). On 204 or 200 it reads the authorization once and returns "voided"
  only if the read shows VOIDED. Any other read, or no read, is "unknown"
  with reason void_unconfirmed.
- A 422 whose issue is PREVIOUSLY_CAPTURED or AUTHORIZATION_VOIDED is
  "already_terminal": settled already, to be reconciled by reading state. Any
  other 4xx is "rejected". Timeouts, network errors, 408, 409, 429, 5xx,
  unexpected statuses and unreadable 2xx are "unknown", and for a capture
  this means the money may have moved. Neither write is ever retried.
- The adapter still has no authorize, reauthorize or refund call, and the
  boundary test forbids all three.
- OrderSnapshot gains captures, so a reconciliation read can find the capture
  id after an unknown capture.
- The lifecycle run (smoke --lifecycle, scripts/lifecycle.ts) never attempts
  capture-after-void unless the void was confirmed, because against a still
  CREATED authorization it would really capture. Anything left unsettled is
  voided, and a sandbox id is printed only when that cleanup also fails.
  --create is removed.

### Rationale
Each write keeps the outcome model from D-020, so a caller cannot mistake
"maybe done" for "done" or "failed". Confirming a void with a read follows
D-019. Settling everything the run creates fixes the orphaned authorization
that --create left behind (TD-017).

### Trade-offs
- The lifecycle run moves $1.00 of sandbox money once and is run by the
  developer, so it cannot be part of the automatic tests.
- The replay in the lifecycle run sends a second capture request with the same
  request id on purpose, to evidence what PayPal does. The application never
  does this by itself (D-010).
- A pending capture cannot be voided, so a run that ends with one prints the
  sandbox id and asks for manual handling.

### Verification
25 test files and 827 tests: the exact request shape of each write, every
result class with a count of POST calls, the void-then-confirm paths, the two
E-1 refusals, input checks, the order captures path, nextPaymentAction driving
the writes (including the cases where no request at all may be sent), and the
lifecycle orchestration against a stub. 22 of 22 deliberate mutations were
caught. The developer then ran `smoke --lifecycle` against the sandbox
(2026-11-02) and every step passed, including R1, R2 and R3, with no
authorization left open (docs/evidence/paypal-lifecycle/LIFECYCLE_SMOKE_RESULTS.md).
That run covers the success path only.

### Revisit trigger
The lifecycle run contradicts a fixture shape, or PayPal answers a replay
differently from E-1.

### Follow-up
TD-014 is resolved (R1 to R4 closed), so E-1 is closed. Increment 5 wires the
gate: pre-check, create order, read authorization, final
evaluation, nextPaymentAction, then one write.

## Decision D-022 — The gate: state rebuilt from the audit log, write-ahead events, one use per mandate

Date: 2026-11-02
Status: Accepted (2026-11-02, by the developer: Increment 5a as proposed, with
the recommended option for each of the four questions)
Related increment: Increment 5a
Related findings: D-007, D-008, D-010, D-015, D-018, D-019, D-020, D-021
Related risks: A duplicate capture; acting without a record; a crash that looks like a failure; a mandate spent twice; a tampered stored mandate
Related questions: TD-018, TD-019, TD-020

### Context
The domain decides, and the adapter talks to PayPal, but nothing yet ran them
in the order D-007 requires. Increment 5 is large, so the developer approved
splitting it: 5a is the gate with no HTTP, 5b adds the routes and the end-to-end
run.

### Options considered
1. Split: 5a (gate core) then 5b, or one increment.
2. Mandate reuse: single-use; unlimited; or a cumulative budget (a domain
   change).
3. The revoke-before-settlement demo: authorize and settle as two real steps,
   or a labelled simulation hook inside the payment logic.
4. Unknown outcomes: reconcile that only reads, or also a deliberate re-send of
   the request with the same request id.

### Decision
The recommended option in each case: a 5a/5b split; single use; two real
steps; read-only reconcile.

The gate:
- authorize: check that the stored mandate still matches its hash (D-015), run
  the pre-check, and create the order. settle: read the authorization, check
  the hash again, run the final evaluation, then at most one capture or void
  chosen by nextPaymentAction. run does both.
- All state is the result of applying audit events in order and is rebuilt from
  the log at startup. There is no second store.
- A PayPal write (the order, the capture, the void) is recorded and flushed to
  disk BEFORE it is sent; its result is recorded after. After a restart, a
  request with no result is "unknown" (create_unknown, write_unknown), never
  "failed". An attempt that never reached PayPal is "abandoned".
- If the log cannot be written, or an adapter call throws, the gate stops and
  refuses everything until restart. Nothing is sent when the request event
  cannot be recorded.
- A pre-check block, an integrity failure, a total of nothing, or a refused
  request makes no PayPal call at all. A failed read at settle is recorded and
  leaves the attempt authorized, so settle may be called again; nothing was
  written. A write is never sent twice for one attempt.
- A mandate is used once: a new attempt is refused while another attempt for
  the mandate is in progress, captured or unknown. Blocked, failed, voided and
  abandoned attempts leave it free. The check and the first event share a lock
  per mandate, so two requests cannot both pass.
- A repeated request with the same attempt id returns the existing attempt; the
  same id with a different request is refused.
- reconcile only reads (the authorization, and the order's captures for a
  capture). It concludes "captured" or "voided" only when the evidence matches
  the action the gate intended, "conflict" when the authorization was settled
  the other way, and otherwise leaves the attempt as it was. A failed read
  leaves it unchanged.
- A torn last line of the log is moved to a side file and skipped with a
  warning (D-008); a damaged line anywhere else, or an event that refers to
  something that never existed, refuses startup.

Two small domain changes, found necessary by this design:
- A new violation code, MANDATE_HASH_MISMATCH, with its explanation, so an
  integrity failure is a Decision that nextPaymentAction can act on (a void
  when an authorization already exists). The evaluators never raise it; only
  the gate does.
- Violation's optional fields accept an explicit undefined, to match what Zod
  parses (exactOptionalPropertyTypes). No runtime effect.

### Rationale
One source of truth, rebuilt from a record written first, means a crash can
never turn an unseen outcome into a quiet failure. Every outcome of the payment
path is either settled, or visibly waiting for a person.

### Trade-offs
- An order request with no result cannot be followed up, because there is no
  order id to read (TD-018).
- The log is not tamper-evident beyond the mandate hash check (TD-019).
- Refusals before an attempt exists are not logged (TD-020).
- One process only (TD-003). The locks are in-process mutexes.
- The gate has never run against the real sandbox; its tests use a stub that
  behaves like the E-1 sandbox. 5b adds the end-to-end run.

### Verification
33 test files and 1124 tests: the full transition tables, the zero-call
guarantees, every create and write outcome, a sweep of every failing or
tampered step in turn (a capture needs every earlier step to be clean), a crash
at each point of a real run's log, a log that fails at each critical event,
persistence in a real file with a torn tail, reconcile against every
authorization state, and source-boundary scans. 30 of 31 deliberate mutations
were caught. The survivor removes the fsync of the log, which a test cannot
observe.

### Revisit trigger
A crash or unknown outcome seen in a real run, or the decision to host (TD-007).

### Follow-up
5b: routes, the synthetic catalogue, simulated-agent scenarios, a configured
audit file path, and an end-to-end sandbox run through the API. Decide TD-020.

## Decision D-023 — The HTTP layer, the simulated agent and the end-to-end run

Date: 2026-11-04
Status: Accepted (2026-11-04, by the developer: Increment 5b as proposed, with
the recommended option for each of the four questions)
Related increment: Increment 5b
Related findings: D-006, D-007, D-008, D-010, D-012, D-022
Related risks: A route that decides or calls PayPal itself; a simulation that
looks real; a client that cannot tell a block from a failure; a run that leaves
an authorization open
Related questions: TD-020, TD-007

### Context
The gate (D-022) worked only inside tests. Increment 5b connects it to HTTP,
gives it purchases to evaluate (D-012), and runs the whole path once against the
real sandbox. The developer approved four recommended options: refuse to start
without PayPal credentials; routes that match the gate's own steps; defer TD-020;
a scripted end-to-end run.

### Options considered
1. Startup without PayPal credentials: refuse to start, or start with the payment
   routes answering 503.
2. Route shape: match the gate (authorize with an optional settleNow, plus
   settle and reconcile), or expose only run plus a demo-only two-step endpoint.
3. TD-020 (refusals in the audit log): defer to Increment 8, or add an
   attempt_refused event now.
4. End-to-end check: a scripted run, or a manual curl checklist.

### Decision
The recommended option in each case.

The routes (apps/api/src/routes/) only translate HTTP into gate calls and gate
results into responses. They do not call the adapter, evaluate, read the clock,
touch files or the environment, and a scan test pins that.
- POST /mandates (the posted terms are the confirmation step until AI drafting),
  GET /mandates, GET /mandates/:id, POST /mandates/:id/revoke.
- POST /attempts {attemptId, mandateId, proposal, settleNow?}: authorize, or run
  when settleNow is true. POST /attempts/:id/settle and /reconcile. GET
  /attempts and GET /attempts/:id (with the plain-language explanation and the
  attempt's audit events).
- GET /catalogue and POST /mandates/:id/simulated-proposal {scenario}.
- A block decision is a 200 with the attempt, not an error. Refusals: invalid
  input 400, unknown mandate or attempt 404, a reused attempt id or a mandate in
  use 409, a stopped gate 503. A failed PayPal read at settle or reconcile is 502
  and carries the attempt. Bodies over 64 KB are 413; a body that is not JSON is
  415 or 400.
- Every error is a fixed code. Framework text, which can quote the request, and
  unexpected exceptions are never sent to the client; an unexpected exception is
  logged on the server. If it came from the gate, the gate has already stopped
  itself (D-022) and the next request gets 503.
- The caller chooses the attempt id, so a repeated request returns the same
  attempt (D-022) instead of starting another.

The simulated agent (apps/api/src/simulation/) is a synthetic catalogue of four
fictional products and a pure function that builds one proposal for one
scenario: compliant, over_unit_price, over_quantity, wrong_variant,
unlisted_product, over_total. It decides nothing; the domain evaluator decides.
Everything it returns says simulated: true with a label. A scenario that cannot
be built from the mandate is answered with 422 and a reason; the agent never
builds a different proposal instead. Revoke before settlement is not a scenario:
it is the real sequence authorize, revoke, settle.

Startup loads both configurations, creates the adapter, replays the audit log
and creates the gate. It makes no PayPal call. A missing credential, or an audit
log that cannot be trusted, stops the start. AUDIT_LOG_PATH sets the file
(default data/audit.jsonl under apps/api/, gitignored).

The gate gains one read method, eventsFor(attemptId), backed by the events it has
already applied, so the API never reads the file while the gate may be appending
to it.

The end-to-end run (pnpm --filter @ostensia/api e2e, run by the developer) drives
these routes in memory with the real adapter: a compliant purchase captured, the
same request repeated, a second attempt on the spent mandate refused, a purchase
over the unit-price limit blocked with no PayPal call, a revoke before settlement
that ends voided, the audit record, and a restart that rebuilds the same state.
PayPal calls are counted in the run, so "no call" and "one capture" are measured.
It moves $1.00 of sandbox money once and creates two orders. It captures or
voids everything it creates: an authorization left waiting is settled after its
mandate is revoked, which voids it, and one that still cannot be settled is
reported with its sandbox id. Its report is sanitized like the smoke report.

### Rationale
Keeping decisions in the gate and translation in the routes means the HTTP layer
cannot weaken the payment path. Keeping the simulation on the proposal side, and
labelling it, keeps the demo honest (CLAUDE.md section 7).

### Trade-offs
- TD-020 stays open: a refusal is shown to the caller and not recorded.
- The gate holds every applied event in memory for the life of the process
  (TD-021).
- The API has no authentication (TD-007), and an attempt's response includes the
  sandbox order and authorization ids and the mandate hash.
- The response shapes are a contract for Increment 7.
- The e2e run covers the success path of each scenario only; failure paths
  against PayPal are still tested only against the stub (TD-015).

### Verification
Route tests through the server's in-memory injection for every status mapping,
the 64 KB limit, the labels, the explanations and a log that fails; scenario
tests that run every scenario through the real pre-check; e2e orchestration tests
against the stub, including a step that fails and one that leaves an
authorization open; a scan test for the route sources; and a real node process
started with placeholder credentials, which answered /health, created a mandate,
blocked a purchase, replayed the log after a restart, and refused to start with a
missing credential or a damaged log. The developer then ran the e2e script against the sandbox on 2026-11-05 and
every step passed (docs/evidence/paypal-lifecycle/E2E_RESULTS.md).

### Revisit trigger
The e2e run shows a difference between the stub and PayPal, or hosting is
required (TD-007).

### Follow-up
Increment 6 (AI drafting), whose output
feeds POST /mandates after the user confirms it.

## Decision D-024 — AI mandate drafting: the AI proposes, and code completes and decides

Date: 2026-11-05
Status: Accepted (2026-11-05, by the developer: Increment 6a as proposed, with
the recommended option for each of the five questions)
Related increment: Increment 6a (drafting). Increment 6b (a labelled AI shopping
agent) is separate and needs its own proposal.
Related findings: D-009 (the AI proposes, the user confirms), D-012, D-016,
D-023; the hackathon official rules (pasted by the developer, 2026-11-05)
Related risks: An AI-invented limit; a prompt injected through the person's text;
a draft treated as a confirmed mandate; a provider key reaching the browser or a
log; a draft that cannot work with the catalogue
Related questions: TD-022, TD-023, TD-002

### Context
MVP steps 1 and 2 (a person describes a purchase and AI proposes a structured
mandate) did not exist: a client had to post exact terms. The domain already has
a lenient MandateDraft (null for anything the AI could not read) and a strict
ConfirmedMandate (D-009). The developer approved: Claude with claude-opus-5-5;
the server runs without an AI key; drafts are not recorded in the audit log;
gaps in a draft stay gaps; and a split of Increment 6 into 6a (drafting) and 6b
(an AI agent that proposes carts, to be proposed separately).

The hackathon rules (checked 2026-11-05) allow any AI provider ("an AI tool,
model, or platform of their choice") as long as PayPal integration is central.
They require a working project that judges can run or interact with, through
setup and run instructions in the repository or a hosted demo, and do not
require public hosting. This settles the D-013 follow-up "verify the hackathon
rules" for hosting: local-first stands. It also adds requirements for Increment 8
(a public repository with a detectable open-source licence, a video under three
minutes, and instructions that let a judge run the project with their own
sandbox credentials and AI key).

### Options considered
1. Provider and model: Claude (claude-opus-5-5); Claude with a cheaper model; or
   another provider.
2. Starting without an AI key: start with drafting off, or refuse to start.
3. Recording drafts: do not record (the confirmed mandate and its intentSummary
   are recorded), or add a mandate_drafted audit event.
4. Gaps in a draft: stay missing for a person to fill in, or server-suggested
   defaults.
5. The AI shopping agent: with 6a, split into 6a and 6b, or left out.

### Decision
The recommended option in each case: Claude (claude-opus-5-5); start without an
AI key; do not record drafts; gaps stay gaps; split 6a and 6b.

Drafting only proposes:
- POST /mandates/draft {instruction} (at most 2,000 characters) returns
  {aiGenerated: true, label, draft, completeness, warnings}. It creates no
  mandate, writes no audit event, and makes no PayPal call. A person reviews and
  edits, then confirms through POST /mandates, which is unchanged: the gate
  validates the terms and computes the hash. Everything the route returns is
  labelled AI-generated.
- completeDraft (packages/domain/src/draft.ts, pure) says whether a draft is
  complete (and gives the exact terms) or incomplete. It lists a null field as
  missing by path ("items[0].maxUnitPriceMinor") and reports a present but
  unacceptable value (a date that is not a date, a limit of zero, duplicate
  products) as a problem. It never fills a gap and never applies a default. A
  complete result is validated by the same MandateTermsSchema the gate uses.
- draftWarnings (apps/api/src/ai/) shows deterministic warnings next to a draft:
  a product not in the catalogue, a catalogue price above the unit-price limit, a
  variant the catalogue does not sell, an expiry that is not in the future. They
  never change the draft and never block it.
- The drafter (apps/api/src/ai/drafter.ts) makes one call with the Anthropic SDK:
  structured output from the existing Zod schema (zodOutputFormat with
  beta.messages.parse), effort medium, max_tokens 16000, no tools, no web access,
  no sampling settings, and the server-side refusal fallback (fallbacks:
  "default"). The reply is validated again by our own schema before it is used.
  It returns a value for everything the provider can do: drafted, refused,
  invalid_output (cut off, no output, or not the schema) and unavailable (auth,
  rate_limited, timeout, connection, bad_request, server). An error it does not
  recognise is rethrown, not hidden. The provider's text is never passed on.
- The system prompt is fixed text plus the synthetic catalogue; the date and the
  person's words go only in the user message. The prompt tells the model to leave
  unstated fields null, to treat the description as data and not as instruction,
  and to put anything unclear in notes. This is a mitigation, not the control
  (see below).
- The control is structural. The model cannot call a tool, cannot reach the web,
  cannot create anything, and its output is limited to the draft shape and then
  checked by code. The worst an injected instruction can produce is a draft
  that a person reviews, which the label and the warnings make visible.
- Configuration: ANTHROPIC_API_KEY, optional. With no key the server starts, logs
  that drafting is off, and the draft route answers 503 not_configured. A key
  that is set but malformed, or an ANTHROPIC_BASE_URL other than
  https://api.anthropic.com, stops the start. The SDK client is given the host
  explicitly, so an environment setting cannot redirect a request that carries
  the key. The key stays on the server and is never logged.
- Errors: provider unavailable 503 (with a reason), refused 422, unusable output
  502, a bad request 400. The SDK's own retries of 429 and 5xx stay on, because
  drafting only reads and returns text, unlike a PayPal write (D-010).

Dependency: @anthropic-ai/sdk 1.3.0 in apps/api, pinned exactly (it works with
the repository's Zod 4.6.7 as an optional peer). It is Apache-2.0 licensed, not
MIT, and brings seven transitive packages (standardwebhooks, json-schema-to-ts,
@opentelemetry/api, @babel/runtime, @stablelib/base64, fast-sha256, ts-algebra).
It was chosen over a hand-written fetch client for the typed structured-output
helper, typed errors and retries. 1.3.0 was published on 2026-10-23; the latest
release (1.5.0) was one day old when this was decided, so an older release was
pinned. The licences go into the TD-002 review.

### Rationale
The AI does the one job it is suited to, reading words, and everything that
matters stays in deterministic code: what is complete, what is valid, what is
enforced. A person is always between a draft and a mandate.

### Trade-offs
- Drafts are not recorded (TD-022 notes the cost): the audit shows the confirmed
  mandate and its summary, not the AI's original draft or the person's edits.
- The model's behaviour is not deterministic, and its quality had not been
  observed against the real provider when this was decided (TD-022).
- The draft route spends money and has no rate limit (TD-023, TD-007).
- The summary of the person's intent is the AI's wording until the person edits
  it.

### Verification
Domain tests for completeDraft (every field, every subset of nulls, problems
against gaps, invalid input, determinism). Drafter tests against a fake client for
the request shape (no tools, no sampling, the fixed system prompt, the
instruction only in the user message) and every outcome, including a reply the SDK
rejected and an error it does not recognise. Route tests for every status code,
the limits, the label and that nothing is created. Configuration and boundary
tests. A real node process started with placeholder values: drafting off without
a key; with a placeholder key a real 401 from the provider came back as 503 auth;
a malformed key and a foreign base URL stopped the start; the key appeared in no
log; no audit file was written. The developer's first draft-smoke run
(2026-11-05, docs/evidence/ai-drafting/DRAFT_SMOKE_RESULTS.md) used the real
model on four fictional descriptions: unstated fields stayed null, an instruction
hidden in a description was not obeyed, and amounts and dates were converted
correctly, at about 1.6 cents a draft. It also found that the model sent an empty
allowedVariantIds list to mean "no restriction", which is not a valid term (the
structured-output schema cannot express a minimum length). The prompt now says to
leave the field out, and the code deliberately does not turn an empty list into
"no restriction", because that could loosen a limit. A second run after the fix
(2026-11-05) showed no problems and the variant list left out where there was no
restriction.

### Revisit trigger
The smoke run shows invented values or poor quality; the provider's refusal rate
is a problem; hosting is required (TD-007, TD-023); or the audit needs to show
the AI's draft (TD-022).

### Follow-up
The developer runs `pnpm --filter @ostensia/api draft-smoke`. Increment 6b
(a labelled AI shopping agent) needs its own proposal. Increment 8 must cover the
hackathon's judging-access, repository and video requirements.
Judge access: see D-026.

## Decision D-025 — The AI shopping agent: it proposes a cart, the shop prices it, the gate decides

Date: 2026-11-05
Status: Accepted (2026-11-05, by the developer: Increment 6b as proposed, with
the recommended option for each of the four questions)
Related increment: Increment 6b
Related findings: D-007, D-012, D-022, D-023, D-024; the hackathon judging
criteria ("Technological Implementation" and the "Best Use of PayPal + AI" and
"Best Use of Agentic Commerce" honorable mentions)
Related risks: An AI that states its own prices; an agent treated as an authority;
a simulation that looks like a real merchant; a prompt injected through the task
Related questions: TD-024, TD-025

### Context
The product is a gate for AI purchasing, but until now no AI purchased anything in
the demo: the simulated agent (D-012) is deterministic code that builds six fixed
scenarios. 6b adds an AI agent that turns a task into a cart, so the demo can show
a real AI proposing and the same deterministic gate allowing or blocking it. The
developer chose: a labelled `mode` on each request (informed or uninformed);
propose only, with the client submitting the cart; no audit event for the agent's
reasoning; and a smoke run that evaluates carts with the pre-check only.

### Options considered
1. What the agent sees: the task and the mandate's limits; the task only; or a
   labelled mode that chooses between them.
2. Autonomy: propose only, or a route that also runs the gate.
3. The agent's reasoning: not recorded in the audit log, or a new event.
4. Verification: a pre-check-only smoke run, or also a full sandbox run.

### Decision
The recommended option in each case: a labelled `mode`; propose only; do not
record the reasoning; a pre-check-only smoke run.

- POST /mandates/:id/agent-proposal {mode, task?} returns {aiGenerated: true,
  simulatedShop: true, label, mode, modeNote, proposal | null, declined | null,
  rationale}. With no task, the agent shops for the mandate's intentSummary (at
  most 2,000 characters otherwise). The route creates no attempt, writes no audit
  event and makes no PayPal call. The client sends the proposal to POST /attempts
  like any other proposal, where the gate decides.
- `informed` mode shows the agent the mandate's limits (it shows that even a
  well-behaved agent is checked); `uninformed` withholds them (it shows the gate
  stopping an agent that does not know the buyer's policy). The response says
  which, in words. The uninformed request contains no limit at all (tested).
- The agent (apps/api/src/ai/shopper.ts) makes one call, like the drafter
  (D-024): claude-opus-5-5, effort medium, structured output, no tools, no web
  access, no sampling settings, the refusal fallback, and its reply checked again
  by our own schema. It chooses productId, variantId and quantity from the
  synthetic catalogue, and explains the choice. It never states a price.
- The cart becomes a PurchaseProposal in plain code (cart.ts): every unit price
  and the total come from the catalogue, so an agent cannot misstate an amount. A
  cart that does not fit the shop (an unknown product, a variant of another
  product, an empty cart, a bad quantity) is invalid and is never corrected: the
  route answers 502.
- An agent that buys nothing returns a decline with its reason and no proposal
  (200). A cart that comes with a reason for buying nothing contradicts itself and
  is not used. The other outcomes are as for drafting: refused 422, unusable
  output 502, provider unavailable 503 with a reason, and 503 not_configured when
  there is no key. The provider's error handling is shared with the drafter
  (provider-errors.ts).
- Startup creates one SDK client and gives it to both the drafter and the agent.
  With no ANTHROPIC_API_KEY both routes answer 503 and the deterministic scenarios
  (D-023) still work.
- The structural controls are those of D-024: no tools, no web access, output
  limited to a cart shape that code then checks, and a gate that evaluates every
  proposal deterministically. The agent has no authority: a cart is only a
  proposal.
- `pnpm --filter @ostensia/api agent-smoke` (run by the developer) gives the agent
  six fictional tasks against one in-memory mandate and prints each cart, the
  agent's explanation and the pre-check's decision. It makes no PayPal call and
  creates no attempt. About ten cents at list price.

A finding while building it (TD-024): SDK 1.3.0 sends an enum or const in a
structured-output schema to the API as description text, not as a constraint. The
API therefore does not enforce the product and variant lists (nor the drafter's
currency): our own validation does, and a reply that names something the shop does
not have is returned as invalid_output. This is a reliability cost, not a safety
one, and it corrects the impression in D-024 that the API limits the output to the
draft shape: the API enforces types and required fields, and our code enforces the
rest.

### Rationale
It shows the product's thesis directly (a real AI proposes, the gate decides) at
small cost, because the gate, the pricing and the evaluation already exist. The AI
stays advisory: it cannot set a price, create an attempt or call PayPal.

### Trade-offs
- The agent is not deterministic. An uninformed agent may stay within the limits on
  a given run, so a guaranteed block in the video should use a deterministic
  scenario (D-023) (TD-025).
- The agent's explanation is its own wording and is not verified; it is shown
  labelled. It is not recorded in the audit log, so the audit shows the proposal
  and the gate's decision, not why the agent chose the cart (TD-025).
- The agent draws on the same key as drafting, and the same cost and rate-limit
  concerns apply (TD-023).
- Prices are the catalogue's, so the agent cannot be tested for price mistakes: it
  cannot make one.

### Verification
Tests (47 files, 1419 tests): the cart builder (prices only from the catalogue,
an agent's own price ignored, every invalid cart, no correction); the agent against
a fake client (the request shape with no tools and no sampling, the fixed prompt per
mode, the limits shown to an informed agent and absent from an uninformed request,
every outcome, a reply the SDK rejected, an error it does not recognise); the
prompts; the route (every status code, the labels, the limits on the task, that
nothing is created, and a cart the real gate captures and one it blocks before
PayPal, on the stub adapter); and boundary scans (the agent and the drafter are the
only callers of the provider, neither reaches the gate or PayPal, the model gets no
tools). 32 of 32 deliberate mutations of the new code were caught. A real node
process with placeholder values: no key gave 503 not_configured; a placeholder key
drew a real 401 from the provider, answered 503 auth; the key appeared in no log
and nothing was written to the audit log. The developer's agent-smoke run (2026-11-05,
docs/evidence/ai-drafting/AGENT_SMOKE_RESULTS.md) used the real model on six
fictional tasks, with the pre-check only: the informed agent stayed within the
limits (or declined, naming the limits) in all four informed runs; the uninformed
agent exceeded them in both uninformed runs and the pre-check blocked both; the
instruction hidden in a task was not obeyed; about 1 cent a call. It is one sample
of a non-deterministic model (TD-025).

### Revisit trigger
The smoke run shows an agent that obeys text hidden in a task, misreads a limit
badly, or names things outside the catalogue often (TD-024); or the demo needs the
agent's reasoning in the audit (TD-025).

### Follow-up
The developer runs `pnpm --filter @ostensia/api agent-smoke` and the output goes
under docs/evidence/ai-drafting/. Then Increment 7 (the UI), which calls these
routes, and Increment 8 (demo hardening, with the hackathon's judging-access,
repository and video requirements).

## Decision D-026 — Judge access: local run with the judge's own sandbox credentials; no shared credentials

Date: 2026-11-05
Status: Accepted (2026-11-06, by the developer; the clean-clone verification below is still to be done)
Related increment: Increments 7 and 8
Related findings: D-024 Context (the rules' access requirement, checked 2026-11-05); D-013
(local-first); docs/research/mid-build-validation/06-research-to-implementation-decisions.md §6
(on the research-archive branch, removed from the default branch on 2026-11-07);
EV-01, EV-39, EV-40, EV-41, EV-42
Related risks: A judge cannot run the payment path; credentials leaving the server; scope growth
from hosting or authentication one week before the deadline

### Context
D-024 records what the rules require: a build that judges can run or interact with, through
setup and run instructions in the repository or a hosted demo, and instructions that let a
judge run the project with their own sandbox credentials and AI key. It did not decide how.
The API does not start without PayPal sandbox credentials and a vault id
(apps/api/src/index.ts:21-26); the AI routes are optional (D-024). A vault is created by a
manual Postman flow with a sandbox buyer's approval (Report 00 L3). The rules also allow
entrants to supply "test account credentials, API keys, or sandbox login details", and an
organiser update says judges are not required to run projects.

### Options considered
1. Judges run locally with their own PayPal sandbox app and vault, and optionally their own
   Anthropic key, following the README; the video carries the judging for judges who do not run it.
   - Benefits: intended to satisfy the rules' local-run option ("clear, complete setup and run
     instructions"); no new code, hosting, authentication or shared secrets.
   - Costs/risks: a judge who runs it must create a sandbox app and approve a vault; compliance
     depends on the README being complete and on a successful clean-clone run.
2. Option 1 plus the entrant's sandbox-only credentials in the Devpost testing field.
   - Benefits: less work for a judge.
   - Costs/risks: credentials leave the server and must stay valid and private until
     2026-12-21; conflicts with CLAUDE.md section 8.
3. A hosted demo behind a passcode.
   - Benefits: nothing for a judge to install.
   - Costs/risks: hosting, a public bind, authentication, durable storage and an AI spending cap.
4. A mode in which the API starts without PayPal.
   - Benefits: a judge without credentials sees the UI.
   - Costs/risks: a backend change; risks presenting simulated payments as real.

### Decision
Option 1.
- The README tells a judge how to create a PayPal sandbox app, create a sandbox buyer vault
  with the tracked collection (docs/evidence/paypal-lifecycle/ostensia-e1.postman_collection.json,
  folders 01a and 01b), fill apps/api/.env, optionally add an Anthropic key, and start both apps.
- The entrant does not distribute PayPal or Anthropic credentials, in the repository, in
  Devpost fields or elsewhere.
- No hosting, no authentication, no mode without PayPal. The API is unchanged.
- The frontend has no credentials or settings screen. When AI is not configured it says so, and
  the manual mandate form still works.
- The Devpost testing instructions point to the README and the video.

This approach is intended to satisfy the rules' local-run option. It is not established as
compliant until the verification below passes and the README instructions are complete.

Out of scope: participant eligibility (Official Rules section 3). It is a separate matter from
judge access; neither technical readiness nor judge access is evidence of it. Resolved on
2026-11-06 by the developer's own assessment: the developer states that they meet all the
eligibility criteria in Official Rules section 3. No confirmation from the organiser was sought
or received. The organiser keeps the sole right to determine eligibility (Official Rules
section 6) and verifies a winner's identity and role before paying a prize (section 8).

### Rationale
The simplest option intended to satisfy the rules' local-run option. It keeps credentials on
the server (CLAUDE.md section 8) and adds nothing to build one week before the deadline.

### Trade-offs
A judge who wants to run the payment path must complete a sandbox vault approval. Judges who do
not run it rely on the video and the description.

### Verification
1. Clean-clone run: before submission, the developer follows only the README, from a fresh
   clone with a new apps/api/.env, and completes one capture, one pre-check block and one
   revoke-then-void against the sandbox. Any step the README does not cover is a failure and is
   fixed in the README.
2. No Anthropic key: with ANTHROPIC_API_KEY unset, the API starts, the AI routes answer 503
   not_configured, the UI says AI is off, and a mandate entered manually in the form can be
   confirmed and taken through capture, block and void.
3. No credentials distributed: the repository, the Devpost fields and the video contain no
   PayPal or Anthropic credential.
The results are recorded in docs/BUILD_STATUS.md.

### Revisit trigger
The clean-clone run fails; the rules or the organisers require hosting or working credentials;
or the eligibility review reports that judges could not run the build.

### Follow-up
README and Devpost testing instructions (Increment 8).

## Decision D-027 — The browser reaches the API through a Next.js rewrite (confirms D-006)

Date: 2026-11-05
Status: Accepted (2026-11-06, by the developer; the acceptance criteria below are checked in Increment 7)
Related increment: Increment 7
Related findings: D-006 (docs/DECISIONS.md:320-322); Report 00 L1 and C7; EV-43 (Next.js
rewrites documentation); 06-research-to-implementation-decisions.md §7
Related risks: CORS failures; the API exposed beyond 127.0.0.1; configuration reaching browser
code; a proxy cutting off slow AI calls

### Context
D-006 chose a rewrite so that no CORS setup is needed. apps/web/.env.example instead declares
NEXT_PUBLIC_API_BASE_URL, which Next.js embeds in browser code and which implies direct calls.
Next.js documents rewrites as a URL proxy that can target an external URL; it does not document
a proxy timeout.

### Options considered
1. Next.js rewrite of /api/:path* to the API (same origin for the browser).
   - Benefits: no CORS, no new dependency, no API change; the API stays on 127.0.0.1.
   - Costs/risks: two local processes (accepted in D-006); proxy timeout unknown.
2. Direct browser calls to Fastify with CORS support.
   - Benefits: no proxy.
   - Costs/risks: a new dependency and an API change; contradicts D-006.
3. Next.js route handlers as a backend-for-frontend.
   - Benefits: full control of each call.
   - Costs/risks: more code; D-006 keeps policy and secrets out of the web app.

### Decision
Option 1. next.config rewrites /api/:path* to `${API_ORIGIN}/:path*`. API_ORIGIN is a
server-only variable (example: http://127.0.0.1:4000). apps/web/.env.example replaces
NEXT_PUBLIC_API_BASE_URL with API_ORIGIN. Fastify is unchanged and stays bound to 127.0.0.1.

### Rationale
It is what D-006 decided, and it is the smallest working arrangement.

### Trade-offs
Every API call passes through the Next.js server.

### Verification (acceptance criteria for Increment 7)
1. Every browser request to the API uses a same-origin relative path under /api; no client code
   contains an absolute API URL.
2. Server-only configuration is not exposed to the browser. API_ORIGIN is read only in
   server-side configuration (next.config), and no NEXT_PUBLIC_ variable refers to the API.
   After `next build` with API_ORIGIN set to the value under test, the browser-delivered assets
   (.next/static and the HTML pages) contain neither that origin value nor any other server-only
   configuration value. In the browser's network panel, every API request goes to the page's own
   origin.
3. With both processes running, a request through the rewrite (GET /api/health) returns
   Fastify's response.
4. Slow requests are tested for premature termination: the real draft and agent routes, and a
   deliberately delayed upstream used only in the test, complete through the rewrite. Any limit
   found is measured, documented, and shown to the user as a clear error.
5. With Fastify stopped, the UI shows a clear message that the Ostensia API is unreachable. It
   shows no stack trace, no internal address and no API_ORIGIN value, and it does not retry a
   payment write (POST /attempts, settle).
6. No CORS package is added to apps/api; Fastify sends no CORS headers; no browser code connects
   to Fastify's port directly.

### Revisit trigger
A proxy limit shorter than the AI calls that cannot be handled in the UI, or hosting.

### Follow-up
None beyond Increment 7.

## Decision D-028 — Ostensia's visual identity and the brand guidelines

Date: 2026-11-06
Status: Accepted (2026-11-06, by the developer)
Related increment: Increment 7 onward
Related findings: Brand audit 2026-11-06 (no existing Ostensia brand assets in the
repository); Report 06 §4.2-§4.3; D-024, D-027; EV-01 (third-party trademarks in the video)
Related risks: A generic or inconsistent interface; provenance blurred between AI,
Ostensia, the person and PayPal; claims the product cannot support

### Context
Increment 7 builds the first UI. The repository held no logo, colours or fonts for
Ostensia; the only styling was a spike report generator's defaults. The interface
must make the source of each piece of content clear (AI, deterministic rules, the
person, PayPal Sandbox, the simulated shop).

### Options considered
1. A deliberate identity: quiet, precise financial infrastructure, with provenance
   as the defining principle, specified in a canonical document.
   - Benefits: coherent, reviewable, and it makes the product's honesty visible.
   - Costs/risks: design time before implementation.
2. A framework starter or component library defaults.
   - Benefits: fastest.
   - Costs/risks: generic; no provenance language; new dependencies.

### Decision
Option 1, specified in docs/design/OSTENSIA_BRAND_GUIDELINES.md (version 1.0), the
canonical source of truth for the frontend's visual identity. Within it: the text
wordmark "Ostensia" and no symbol; the light theme and teal palette; IBM Plex Sans
and Mono through next/font, served locally (D2); the provenance system; an explicit
"Use this draft in the form" step (D3); an API availability indicator worded
"Ostensia API available / unreachable" and limited to the Fastify API (D4).
Client-side mandate validation with the domain's runtime MandateTermsSchema (D1) is
approved subject to verification (the runtime dependency graph, the Next.js
workspace compile, the production build and the browser bundle) and will be recorded
with Increment 7a's frontend decision as a deliberate exception to the type-only
import approach. The server-side gate stays authoritative. Contrast adjustments
made before adoption: success-700 #1B7F4B to #1A7C49; new token line-500 #8792A6
for form-control borders.

### Rationale
The judging weighs a complete product experience and a clear demonstration; the
product's credibility rests on showing who decided what.

### Trade-offs
Light theme only; plain CSS without a component library; hand-drawn icons.

### Verification
Contrast computed for every pairing (WCAG 2.2 AA). The Increment 7a walkthrough
checks the guidelines on screen.

### Revisit trigger
A requirement that conflicts with the guidelines, a failed contrast check, or a
decision to add dark mode.

### Follow-up
CLAUDE.md section 14 requires reading the guidelines before frontend work.

## Decision D-029 — The web app: stack, dependencies, and what the browser can see

Date: 2026-11-06
Status: Accepted (developer approval, 2026-11-06, after the developer's own walkthrough).
The plan it follows was approved on 2026-11-06 (Increment 7a as proposed, the recommended
option for A1 to A7, the pinned versions, and the runtime import of MandateTermsSchema
subject to verification). This record adds what the build and the browser runs showed.
Related increment: Increment 7a (scaffold, the D-027 rewrite, the mandate screen)
Related findings: D-006, D-026, D-027, D-028; docs/design/OSTENSIA_BRAND_GUIDELINES.md;
docs/evidence/frontend/MANDATE_WALKTHROUGH.md; Reports 03, 04 and 06 in
docs/research/mid-build-validation/ (on the research-archive branch)
Related risks: A proxy cutting off a slow AI call; a configuration value reaching the
browser; client-side limits drifting from the gate's; a mandate created twice; a
dependency added without need

### Context
Increment 7a builds the first screen. D-027 chose a Next.js rewrite, and D-028 chose the
identity and approved running the domain's MandateTermsSchema in the browser, subject to
verification. A spike in a scratch workspace (2026-11-06) and the build itself established
facts that were not known when those were decided.

### Options considered
1. The proposed arrangement: Next.js 16.4.5 with a rewrite, the narrow runtime domain
   import, plain CSS, next/font, a tested pure `lib/`, and scan tests that enforce the
   boundaries.
   - Benefits: no CORS, no new backend code, the limits are not copied, every rule is
     checked by a test.
   - Costs/risks: about 110 KB (31 KB gzip) of the client bundle is the schema; the proxy
     option is experimental; the first build needs internet for fonts.
2. Direct browser calls with CORS, type-only domain imports, or a component library.
   Rejected in D-027, D-028 and the Increment 7 plan.

### Decision
Option 1.
- Dependencies in apps/web, all pinned exactly and all MIT: next 16.4.5 (3 Nov 2026; its
  release notes list seven moderate advisories, none in features used here), react and
  react-dom 19.3.1, @types/react and @types/react-dom 19.3.0, @types/node 24.19.2 (the
  version apps/api already uses). The registry showed none deprecated and `latest` equal to
  each pin, and `pnpm audit` on the repository lockfile found no known vulnerabilities.
  Next's optional `sharp` (image optimisation) entered the lockfile and is unused. No
  other package was added: no UI, state, data-fetching, CSS, icon or test-rendering library.
- The rewrite: next.config.ts forwards /api/:path* to API_ORIGIN, parsed by api-origin.ts
  (exactly http://127.0.0.1:<port>, a port from 1 to 65535, nothing else; the error
  message never prints the value). `transpilePackages` is not needed: Turbopack compiles a
  TypeScript workspace package on its own, and the build passed without it.
- `experimental.proxyTimeout` is set to 120000 ms. Next.js proxies a rewrite with a 30 s
  timeout and then answers a plain-text 500 (observed: a 40 s upstream was cut at 30.04 s;
  with the option it completed at 40.02 s). 120 s is a placeholder until real AI latency is
  measured (TD-031). The option is experimental, which is why Next.js is pinned.
- The API origin is read when next.config.ts loads. `next build` writes it into
  .next/routes-manifest.json (a server-side file), so it must be set before building;
  `next dev` reads it at startup.
- The runtime import of the domain (D1) is a deliberate exception to the type-only
  approach, limited to four values: MandateTermsSchema, ConfirmedMandateSchema, formatUsd
  and canonicalize. A scan test fails if any other value is imported. Verified: the
  dependency graph is zod and the domain's own files; the build compiles the package; the
  schema adds about 110 KB raw (31 KB gzip) to the client; unrelated domain modules (payment
  actions, PayPal statuses, explanations) are tree-shaken out. The gate stays authoritative.
- Validation is in two stages. Typed text becomes values (money by string arithmetic, local
  time to UTC with a round-trip check), then the domain schema judges the values. Messages
  quote the numbers the schema reports; no limit is copied. The one limit that is copied is
  the API's 2,000-character description length (apps/api/src/routes/draft.ts), because it
  is not exported anywhere the web app may import (TD-033).
- API results have three outcomes: ok, an error the API sent (always JSON), and unreachable.
  A server error that is not JSON is the proxy giving up, and is reported as unreachable.
  Nothing is retried by the client.
- Creating a mandate is not idempotent (each POST makes a new id), so when a confirmation
  does not come back, the page lists the mandates and shows any with exactly the same
  terms and summary, and the person chooses. A timeout is not a failure (CLAUDE.md section 7).
- Fonts: IBM Plex Sans and Mono through next/font/google. The files are downloaded when the
  app is built and served by the app; the browser makes no request to Google. The first
  build or dev start needs internet; a rebuild with an existing .next does not; a clean build
  with no network fails (TD-032).
- Styling: tokens as CSS variables in app/globals.css, component styles as CSS Modules,
  no raw colour outside globals.css. A test compares the tokens, spacing, radii, sizes and
  the approved interface strings with the guidelines document, and recomputes contrast.

### Rationale
It is the smallest arrangement that meets D-026 to D-028 and keeps every rule checkable.
Reading the build and driving the real stack showed what each decision costs.

### Trade-offs
- The browser carries the schema (31 KB gzip) so that the form and the gate agree.
- Every API call passes through the Next.js server, whose proxy timeout is an experimental
  setting.
- No automated component tests (TD-030). Logic lives in `lib/` and is tested; components are
  checked by build, scan tests and a browser walkthrough.
- A confirmation with no clear answer needs a decision from the person.

### Verification
Checks of 2026-11-06 (details in docs/evidence/frontend/MANDATE_WALKTHROUGH.md):
- pnpm test: 56 files, 1686 tests pass (267 new). pnpm typecheck passes. 41 of 41 deliberate
  mutations of the new logic and scan tests were caught.
- D-027 criteria: (1) every browser request is a same-origin /api path (scan test, and the
  network log of a real browser run); (2) the API origin value is in no browser-delivered
  asset and no NEXT_PUBLIC_ variable exists (build scan and test); (3) GET /api/health, the
  catalogue, a draft refusal, a created mandate and a refusal all reached the real Fastify
  API through the rewrite; (4) a 40 s response completed through the rewrite; the developer
  then timed the real draft route once, with a real key, at about 16 to 18 s (one sample,
  not a distribution; 120 s remains a placeholder, TD-031);
  (5) with the API stopped the page says "Ostensia API unreachable" and shows no address,
  port or trace; (6) no CORS package, no CORS header, and no direct connection to Fastify.
- D-026 verification 2 (no Anthropic key): the manual path confirmed a mandate in a headless
  browser against the real API with no key. The developer then repeated it by hand (checklist
  section A) with no problems. Verification 1 (a clean clone) waits for the README.
- The developer's walkthrough (2026-11-06, checklist sections A to F, reported by the
  developer): no problems in A, C, D, E; the design judgement (F) was favourable. In B, a first
  draft on a poor connection ended with the page's "The AI service took too long to answer"
  message (the API's own provider-timeout message, not the proxy's), left the form untouched,
  and a second attempt after the network recovered worked. The developer recalls the failure
  at about 30 s; the API's configured provider timeout is 90 s, and the gap is unexplained
  (the recalled time is approximate).
- A first browser run found four defects, fixed before this record: a quantity input stretched
  beside a two-line label; badges scattered to opposite ends of a header; a money field whose
  real input was 38px with a dead "$" and "USD"; a header 57px instead of 56px.

### Revisit trigger
Real AI latency above 120 s; Next.js changing or removing proxyTimeout; the client bundle
becoming a problem; hosting (D-026); a request to add an automated component test.

### Follow-up
Done: the developer's walkthrough, including one timed real draft. Note the provider-timeout
gap above if it recurs (time it on a clock). Increment 7b (proposals, attempts and audit)
needs its own proposal.

## Decision D-030 — The proposal and result screens: caller-chosen attempt ids, provenance that is true, and no automatic resend

Date: 2026-11-06
Status: Accepted (developer approval, 2026-11-07, after the developer's sandbox walkthrough).
The plan it follows (Increment 7b: the split into 7b and 7c, routes, both actions, the status
wording, the four conventions in guidelines section 12.7, and a first step that updates the
guidelines) was approved on 2026-11-06. This record adds what the build and the browser runs
showed, and four points that were not in the plan (listed under "Points the developer
confirmed").
Related increment: Increment 7b (the audit view is 7c)
Related findings: D-012, D-022, D-025, D-027, D-028, D-029; TD-026, TD-027, TD-029, TD-034;
docs/design/OSTENSIA_BRAND_GUIDELINES.md (version 1.1, section 12);
docs/evidence/frontend/PROPOSAL_RESULT_WALKTHROUGH.md
Related risks: A purchase attempt created twice; a "PayPal Sandbox" label on something that
never reached PayPal; an unknown outcome shown as a failure; a copied list drifting from the
API; the AI agent shown as having approved or paid

### Context
Increment 7b gives the web app steps 2 and 3: choose a cart, have the gate check it, and see
what happened. Unlike a mandate, an attempt is idempotent on the server when the caller picks
its id (apps/api/src/gate/gate.ts, sameRequest), so the page can be built differently from the
mandate screen. The first browser run with an allowed cart also showed that one status
(create_rejected) can mean either "PayPal refused the order" or "no order ever left", which
changes whether a PayPal label is true.

### Options considered
1. Two routes, /mandates/[id] and /attempts/[id], with all state on the server; the browser
   picks the attempt id; the page never resends by itself.
   - Benefits: a reload or a shared link shows the same thing; a lost answer is resolved by a
     read; the PayPal and source labels are decided from records, not from the page's memory.
   - Costs/risks: two more pages to keep in step with the guidelines; the status table is a
     copy of the gate's list (guarded by a test).
2. One single-page state machine that holds the proposal and the result in memory.
   - Benefits: fewer files.
   - Costs/risks: a reload loses the attempt; a lost answer has nowhere to be read back; not
     linkable for the demo. Rejected in the plan.

### Decision
Option 1.
- Routes: /mandates/[id] (step 2) and /attempts/[id] (step 3). A step the person has already
  reached is a link in the step indicator; later steps are not interactive.
- The browser makes the attempt id (crypto.randomUUID) before it sends anything. The same id
  with the same request is the same attempt on the server, so a request whose answer was lost
  can be sent again safely. The page still never does so on its own: "Check status" is a read
  (GET /attempts/:id); "Try again" is offered only after that read says the attempt does not
  exist (404), and sends the identical request with the same id. This is the opposite of the
  mandate screen (D-029), where each POST makes a new mandate and the page must look for a
  match instead.
- Classifying what came back: a 4xx, or 503 gate_faulted, is a refusal and means the request
  did nothing; a 502 read_failed that carries an attempt means the attempt exists and nothing
  was written, so the page opens it; everything else (no answer, a timeout, a plain-text proxy
  500, an answer the page does not understand, any other 5xx) is "not confirmed", never
  "failed".
- The 19 attempt statuses are described in lib/attempt-status.ts and match guidelines 12.5
  word for word (a test compares every row). The page offers only what the status allows
  (settle and revoke while funds are on hold; reconcile for write_unknown, capture_pending and
  write_refused); the gate still decides. Four statuses have no way forward in the API
  (create_unknown, anomaly, write_rejected, conflict): the page says so (TD-034).
- A PayPal Sandbox badge and rule appear only if a PayPal operation took place. That is read
  from the attempt's audit events (GET /attempts/:id returns them): an order_result or
  write_result with the outcome "not_sent" is a request that never left, and a settle read
  that failed before a token (detail "token_...") did not reach PayPal either. Status alone
  is not enough: with placeholder credentials the gate recorded create_rejected after the
  token was refused, with no order sent.
- Where a cart came from (the AI agent or the simulated shop) is remembered in a plain
  variable for as long as the page stays open, and shown as "as labelled when proposed". After
  a reload the page says the audit log does not record it (TD-027). Nothing is written to the
  browser's storage (a test checks).
- The scenario list, the two shop modes and the attempt-status list are copied from the API
  because the web app may not import from it. api-drift.test.ts reads the API's source as text
  and fails if any of them changes there and not here.
- An id in the address is decoded once (lib/route-id.ts) because Next.js hands the page the
  segment still encoded, and the API client encodes again. Found in the browser run: without
  it an id containing ":" (which the API allows) would have been asked for as "%253A".
- The word PayPal may now appear in the web app, but only in the files that show or explain a
  PayPal operation (an allow-list in web-boundaries.test.ts); the mandate-creation files must
  still never mention it.
- No dependency was added, the runtime domain import is still the four values of D-029, and
  nothing in apps/api or packages/domain changed. The guidelines are version 1.1, with section
  12 and its four conventions approved.

### Rationale
It reuses what the API already guarantees (a caller-chosen id is idempotent) instead of
re-creating a defence for a problem this endpoint does not have, and it keeps every label
true by reading it from the records rather than inferring it from the page's own history.

### Trade-offs
- An attempt that has no recovery in the API (TD-034) ends in a page that can only report it.
- The source of a cart is lost on reload (TD-027, accepted for the MVP).
- Three lists are copied (guarded by a test, TD-035), and components still have no automated
  tests (TD-030).
- The page cannot show the real hold, capture, void or reconcile in an automated run, because
  that needs the developer's PayPal Sandbox credentials.

### Verification
Checks of 2026-11-06 (details in docs/evidence/frontend/PROPOSAL_RESULT_WALKTHROUGH.md):
- pnpm test: 64 files, 1825 tests pass (139 new). pnpm typecheck passes. 40 of 40 deliberate
  mutations of the new logic, scan tests and style tests were caught. No dependency changed.
- A headless Chrome run against the real API (placeholder values, no AI key): 78 of 78 checks
  passed, including a blocked cart (decision in plain words, no PayPal panel, nothing more to
  do), "check and settle" in one step, an allowed cart with placeholder credentials (status
  "Order not created", no false success, no PayPal treatment), a reply lost after the attempt
  was created (one POST, no automatic resend, "Check status" found the one attempt), a request
  lost before it arrived (404, then "Try again" with the same id, one attempt), a revoked
  mandate, unknown and hostile ids, four viewport widths, arrow-key radio selection, and a
  console with only the answers the run provoked on purpose.
- One defect found by that run and fixed: the double-encoded route id.
- Not exercised in the automated browser run: any real hold, capture or void; the PayPal
  Sandbox badge and rule; the AI agent's cart; the "mandate in use" notice; Copy on the new
  ids; a human's judgement of the design. These were Part 2 of the evidence file, which the
  developer ran on 2026-11-07 (next bullet).
- The one placeholder-credential run sent one token request carrying a fictional client id and
  secret to PayPal's sandbox token endpoint, which refused it (audit detail "token_rejected").
  No order was created and no real credential was used.
- The developer's sandbox walkthrough (2026-11-07, sections A to I of the evidence file, with
  real PayPal Sandbox credentials and an Anthropic key; reported by the developer): an allowed
  cart reached "Funds on hold" and then "Captured" in two steps and in one step, with order,
  authorization and capture ids shown; revoke then settle ended in "Voided" with the approved
  wording; a second attempt on a held mandate was refused with a link to the attempt; blocked
  carts were blocked at the pre-check; the AI agent's cart took about 3 to 5 s, an uninformed
  cart was blocked, and an agent cart passed the pre-check and the final check and was
  captured; after the API was stopped and restarted, "Check status" showed the state the audit
  log held. The design judgement was favourable, and nothing said the AI approved or paid.
- Not exercised anywhere: "Check PayPal's record" (reconcile), which needs an attempt in
  write_unknown, capture_pending or write_refused, and the notice for a request that went
  nowhere while funds are on hold (a settle whose read of the authorization failed). Both are
  covered by tests of the status table and the client, not by a run.
- One thing the developer noticed: the simulated "Compliant" cart has one item for a mandate
  with two. That is the API's scenario by design (D-012: one unit of the first product that
  fits). The scenario's description was reworded to say so; nothing in apps/api changed.

### Revisit trigger
A real sandbox run that shows a status or label the table does not describe; a change to the
gate's statuses or to what the API returns for an attempt; a request to record a cart's source
in the audit log (TD-027); a component test setup (TD-030).

### Points the developer confirmed
These were not in the approved plan. The developer ticked all four in the walkthrough and
approved D-030 on 2026-11-07.
1. When an attempt reached the order step but no order request left (create_rejected after a
   refused token), the page shows a plain "Payment" panel with "No order was sent to PayPal
   Sandbox." and no PayPal treatment. Guidelines 12.3 say the payment panel is shown only if a
   PayPal call was made; this is a reading of it, and the one sentence is new.
2. Strings and titles that section 12 does not specify: the page title "Purchase result"; panel
   titles "Decision", "Payment", "Next steps", "Cart", "Your mandate" and "Proposed cart"; the
   "Next steps" panel carries no provenance badge; the help line under "Settle this
   authorization"; the two sentences for a request that went nowhere while funds are on hold;
   the text for a reconcile with nothing to check; "Still working. The agent can take a
   while."
3. The two source panels sit side by side from 1024px and stack below it (section 12.6 said
   they stack below 640px).
4. The app has no favicon (the guidelines forbid inventing a logo), so a browser logs a 404 for
   /favicon.ico. Leave it, or approve a blank icon.

### Follow-up
Done: the developer's sandbox walkthrough (Part 2 of the evidence file); TD-026 is resolved by
its agent run. Increment 7c (the audit timeline and the list of attempts) needs its own
proposal.
After acceptance, at the developer's request (2026-11-07): example placeholders were added to
the AI description, the AI agent's task, and the mandate form's summary, total, quantity and
unit price (guidelines version 1.2, sections 6 and 10). They are examples of valid values, in
ink-500, never defaults; the expiry has none. The AI description's placeholder was the
developer's own wording. This was not part of D-030's plan. In the same change, the unit-price
field no longer sits lower than the quantity field beside it when its label wraps (a layout
flaw from 7a): the two fields now share rows (CSS subgrid), checked at 1280, 1024, 768 and 640px
with and without help and error text.

## Decision D-031 — The audit record and the list of attempts: read-only, one wording table, and a PayPal badge only for a request that was sent

Date: 2026-11-07
Status: Accepted (developer approval, 2026-11-07: "Go ahead with the proposal and the recommended
decisions", which approved the plan and the six decisions A1 to A6 below, including the wording
table written into guidelines section 13).
Related increment: Increment 7c
Related findings: D-008, D-028, D-030; TD-027, TD-030, TD-036;
docs/design/OSTENSIA_BRAND_GUIDELINES.md (version 1.3, section 13)
Related risks: A PayPal badge on something that was not sent; a record that hides or reorders
  what the log holds; wording that implies the stored reference proves something.

#### Context
CLAUDE.md section 1, step 7: the person can inspect an explanation and an audit record of the
decision. The result page showed the explanation but not what Ostensia logged, and an attempt
could only be reached by its link. GET /attempts/:id already returns the attempt's events and
GET /attempts returns every attempt, so the API needed no change.

#### Options considered
1. The record as a fourth panel on the result page, and a new /attempts list page (chosen).
   - Benefits: the decision and its record sit together; no API or domain change; reuses the
     provenance panel, status indicator and Copy control.
   - Costs/risks: a long result page.
2. A separate audit page per attempt.
   - Benefits: a shorter result page.
   - Costs/risks: one more route and one more step in the demo.
3. A dashboard with counts and charts.
   - Rejected: guidelines section 11 (no dashboard tiles or decorative charts).

#### Decision
- Decisions A1 to A6 as proposed: the record is on the result page (A1); the reference stored
  with the payment is shown, worded only as "Reference stored with the payment" (A2); the list
  is reached by a text link "All purchase attempts" on the proposal and result pages, and the
  header is unchanged (A3); the gate's detail strings are shown as recorded (A4); no API
  change, the missing revocation event is TD-036 (A5); the wording table is part of guidelines
  section 13 (A6).
- Each event is one entry, in the order the log holds it. An event of a kind the page does not
  know is shown as "Unrecognised event" with its type, never hidden.
- An entry gets the "PayPal Sandbox" treatment only if it reflects a request that was sent
  (the rule 7b uses for the Payment panel). A request recorded before it was sent, and one
  that was not sent, are Ostensia's own entries.
- The list is a read. One record the page cannot read makes the whole list an error, because a
  list with a hole would look complete.
- No new runtime import from the domain package: decision wording is the API's explanation.

#### Rationale
The log is the source of truth (D-008) and the page only describes it. Putting every sentence
in one table that the guidelines test compares word for word keeps the document and the code
from drifting, and a drift test against apps/api/src/gate/events.ts fails if the gate gains an
event type the page does not describe.

#### Trade-offs
- The log does not record when a mandate was revoked for an attempt (TD-036), nor where a cart
  came from (TD-027).
- The API sends one explanation of each decision, so only the latest pre-check and final check
  show it.
- Components still have no automated tests (TD-030): their rendering is checked by the browser
  run only.

#### Verification
pnpm test (68 files, 1958 tests) and pnpm typecheck pass. Thirteen small deliberate changes to
the new code: twelve are caught by the tests; the thirteenth (drawing every entry as PayPal) is
a component change, caught only by the browser run. Browser run against the real API with
placeholder PayPal values (61 of 61 checks): the empty list, a blocked attempt, an attempt that
never reached PayPal, the list at six widths, the error and unreadable-record states. The
entries that follow a real PayPal answer were rendered from SYNTHETIC data served by the
browser, which checks how the page draws them and is not evidence about PayPal. Not verified
by the assistant: a real capture's and a real void's record. The developer's sandbox check
(2026-11-07) covered those and the list: every item passed, as reported by the developer
(not independently observed by the assistant).

#### Revisit trigger
A real sandbox run that shows an entry the table describes wrongly; a new event type in the
gate; a request to record a cart's source or a mandate's revocation time per attempt.

#### Follow-up
TD-036. The developer's sandbox check of a capture's and a void's record.

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
