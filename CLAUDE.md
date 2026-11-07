# Ostensia — Project Instructions

## 1. Product context

Ostensia is a proposed purchasing authorization and policy-enforcement
layer for AI-assisted and autonomous purchasing.

For the PayPal AI Hackathon, the minimum demonstration should show:

1. A user describes a purchasing intention.
2. AI converts it into a proposed structured mandate.
3. The user reviews and confirms the mandate.
4. The application evaluates a proposed purchase against the mandate.
5. A compliant purchase can proceed through the tested PayPal sandbox flow.
6. A non-compliant purchase cannot be captured and, where the payment state permits, the authorization is voided.
7. The user can inspect an explanation and audit record of the decision.

The longer-term venture thesis is separate from the hackathon MVP.
Do not implement the entire future platform now.

## 2. Repository bootstrap state

The project may initially contain only project instructions, documentation
and sanitized spike evidence. Missing application folders, routes, tests
and package manifests are expected until the bootstrap plan is approved.

Do not report those missing files as broken functionality. First audit
the current files and Git state, then propose the application scaffold
without writing code.

Use Node.js 24 LTS as the proposed runtime baseline, subject to verifying
dependency compatibility. The historical research report's Node.js 20
recommendation is outdated; do not create a Node.js 20 project.

Start with one Fastify API process. Do not create separate Gate, Resolver
and Harness services unless a later approved decision establishes a need.

## 3. Developer context

The developer has experience with JavaScript, TypeScript, React,
Next.js and API integrations.

The developer wants to understand the architecture and code, not merely
receive a completed application.

Use existing project conventions when they are reasonable. Do not
assume that a particular framework, database or architecture must be
introduced before inspecting the repository.

## 4. Source-of-truth project context

Before proposing architecture, implementing an increment, debugging a
payment flow, or changing scope, read:

- docs/research-summary.md
- docs/spike-findings.md
- docs/BUILD_STATUS.md
- docs/DECISIONS.md, when making or revisiting a decision

Use docs/research-summary.md and docs/spike-findings.md as the concise
current build context. The full historical report is background only;
do not treat its original architecture or proposed feature list as
an approved implementation specification.

If current code or reproducible API evidence contradicts a summary,
stop and report the discrepancy. Do not silently reconcile conflicting
claims or invent a root cause.

Before using the historical research archive for a task, explain which
specific question it is expected to answer.

## 5. Mandatory working protocol

For every significant increment:

1. Inspect relevant existing code and tests.
2. Explain the problem and propose a small implementation plan.
3. Identify affected files, interfaces, data models and dependencies.
4. Explain alternatives and trade-offs.
5. STOP and wait for explicit approval.
6. Implement only the approved increment.
7. Run the agreed tests and inspect the changes.
8. Explain what changed, why it works and what remains uncertain.
9. Walk through the important code.
10. Ask the developer 2–3 comprehension questions.
11. STOP until the developer confirms understanding and verification.
12. Prepare a commit summary. Do not commit until explicitly authorized.

A response to one stage is not permission to skip subsequent stages.

These steps apply regardless of which model is in use (see section 13).

## 6. No autonomous full build

Never implement multiple unapproved increments in one run.

Never silently:
- Change frameworks or application architecture.
- Introduce a database or external service.
- Add dependencies.
- Rewrite existing modules.
- Move or delete substantial files.
- Change payment behavior.
- Replace real provider operations with simulated behavior.
- Alter security boundaries.
- Claim an untested operation works.
- Add unrelated features.

When a decision is ambiguous, explain the options and ask.

## 7. PayPal and payment safety

- Treat the October 28, 2026 spike report as sandbox evidence only.
- The spike supports only the tested vault, authorization, custom_id round-trip, capture, void and shipment-tracking paths.
- Preserve the distinction between authorization, capture and void.
- An order created using a previously approved vault_id was already authorized. Do not issue a second authorize operation blindly; inspect the actual order and authorization state.
- Enforce purchasing rules in deterministic server-side code.
- Never rely on an LLM response or mandate hash alone to enforce rules.
- The mandate hash in custom_id is metadata binding, not the policy engine.
- Never capture when the policy result is missing, invalid or unknown.
- Validate amounts, currencies, products, variants, quantities and expiry wherever applicable to the chosen mandate schema.
- Use actual provider responses to determine payment state.
- Do not assume a timeout means an operation failed.
- Handle duplicate requests safely.
- Never fabricate PayPal responses or transaction identifiers.
- The MVP's central path is mandate confirmation, deterministic purchase evaluation, compliant capture, non-compliant capture blocking and permitted void handling.
- Keep the dispute resolver and all unresolved dispute operations outside that critical path.
- Dispute creation and desired dispute-write operations remain unresolved.
- Webhook simulation and signature verification were not established by the spike. Do not claim them as working.
- Do not infer that the buyer transaction is ineligible from MISSING_OR_INVALID_REQUEST_BODY. The root cause of the dispute creation failure remains unconfirmed.
- Label simulations explicitly, including a simulated dispute resolver, in the UI and the demo.

## 8. Security and secrets

- Keep PayPal client secrets and other credentials on the server.
- Use environment variables and provide a safe .env.example.
- Never commit .env files, access tokens, private keys or real credentials.
- Never expose secrets in logs, browser code, screenshots or demo recordings.
- Use sandbox accounts and test data for the hackathon.
- Do not weaken security to make the demo work.

## 9. Code and dependency rules

- Prefer the simplest solution that fits the current codebase.
- Reuse existing dependencies and patterns when appropriate.
- Explain why any new dependency is necessary before adding it.
- Use clear names, small modules and explicit types where appropriate.
- Add automated tests for policy rules and important payment-state logic.
- Do not hide errors behind broad catch blocks or false success messages.
- Do not suppress TypeScript, lint or test errors without explanation.
- Keep changes small enough that the developer can review them.

## 10. Artifact and commit safety

### Spike artifact hygiene

Raw Postman environment files, unredacted runner reports and raw spike
exports must remain outside the public repository.

Before adding a spike-derived file:
- Inspect its request headers, scripts, body data and embedded reports.
- Remove client secrets, access/refresh tokens, bearer tokens and JWT assertions.
- Replace real sandbox emails and unnecessary transaction identifiers.
- Confirm that only sanitized references are being staged.

### Git rules
Never rely on .gitignore alone. It does not untrack an already-tracked file.

Before every commit, inspect git status, the staged file list and the
staged diff. Stage named files rather than using git add ..

If a real credential was exposed, stop and rotate/revoke it before
continuing. Removing it from the current file does not remove it from
Git history.

- Inspect git status before making changes.
- Preserve unrelated user changes.
- Work on an explicitly agreed feature branch when appropriate.
- Never use destructive Git operations without permission.
- Never force-push, reset, rebase, amend or discard changes without permission.
- Never push or deploy without explicit approval.
- Show the changed-file list and diff summary before committing.
- Commit only after tests pass or the failure is explicitly understood and accepted by the developer.

## 11. Required project records

Maintain these files:

- docs/DECISIONS.md
- docs/LEARNING_NOTES.md
- docs/TECH_DEBT.md
- docs/BUILD_STATUS.md

Update the relevant files after every completed increment.

Do not invent evidence, test results, sources or user research.

## 12. Definition of done for an increment

An increment is complete only when:

- Its acceptance criteria are met.
- The agreed tests have been run.
- The changed code has been reviewed.
- The developer understands the important implementation decisions.
- Known limitations and unresolved issues are documented.
- Decision and learning notes have been updated.
- The developer explicitly approves the proposed commit.

Do not proceed to another increment until the developer confirms.

## 13. Model usage and review policy

### Default model

Use Claude Sonnet 5.5 as the default implementation model for
Increment 7a and Increment 7b.

### When to use Claude Opus 5.5

Use Claude Opus 5.5 selectively for:
- Complex architectural decisions.
- Difficult debugging that Sonnet cannot resolve cleanly.
- Cross-package and Next.js build integration issues.
- Review of transaction-state handling and payment-related behaviour.
- Read-only reviews of completed increments.

Opus reviews must not automatically modify the repository.

### Requesting an Opus review

When requesting an Opus review:
1. Provide the approved implementation specification.
2. Provide the relevant brand guidelines and decision records.
3. Ask it to inspect the actual implementation and tests.
4. Require specific findings with file paths and line references.
5. Ask it to distinguish confirmed defects from potential risks.
6. Require proposed corrections rather than allowing it to implement them.
7. Review and approve any correction before implementation.

### Switching models

Do not switch models simply because a task is long.
Switch when the task's complexity, unresolved issues or risk
justifies the additional reasoning capability.

### Approval gates

Maintain the existing approval gates regardless of model.

## 14. Frontend visual identity

Before making or modifying any frontend UI (apps/web), read
docs/design/OSTENSIA_BRAND_GUIDELINES.md. It is the canonical source of truth
for Ostensia's visual identity, interface language and provenance system.

- Do not introduce a new colour, font, typography rule, visual language or
  component convention without the developer's approval.
- Do not substitute or adjust approved tokens. If a requirement conflicts with
  the guidelines, or a contrast check fails, stop and explain the conflict
  instead of changing the specification.
- Every Increment 7 and later frontend plan must reference the guidelines.
