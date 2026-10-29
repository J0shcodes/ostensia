# Ostensia Decision Log

Entries D-001 to D-005 are the repository bootstrap decisions, made on
2026-10-29 before any application code existed. Use the template at the
end of this file for later entries.

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
The rename was staged, not committed, at the time of writing.

### Revisit trigger
None expected.

### Follow-up
Commit after the developer authorizes it. The "Countersign" naming left
in the spike artifacts is a separate cleanup (see D-003).

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
