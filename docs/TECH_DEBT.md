# Ostensia Technical Debt and Deferred Work

## Item TD-001 — "Countersign" naming and broken spike-runner paths

Date identified: 2026-10-29
Related increment: Increment 8
Why it was deferred: The spike artifacts are reference material, not
application code.
Current limitation: The collection, runner and environment name still say
"Countersign". run-spike.js loads countersign-spike.* files, which do not
exist (the files are named ostensia-spike.*), and mentions a SPIKE_README.md
that does not exist.
Impact if left unresolved: The runner fails as committed, and the old
project name appears in the public repository.
Required evidence or dependency: None.
Estimated future size: S
Proposed resolution: Rename the references and fix the paths.
Review trigger: Before publication.
Status: Open

## Item TD-002 — Sanitization, provenance and dependency license review

Date identified: 2026-10-29
Related increment: Increment 8
Why it was deferred: The repository is not yet public, and no dependencies
exist.
Current limitation: A regex scan found no tokens, JWTs or emails in the
spike collection. A manual review of the 56 KB file has not happened. The
provenance of the spike collection and runner is unchecked, and no
dependency licenses have been reviewed (D-003).
Impact if left unresolved: A credential or unlicensed content could be
published.
Required evidence or dependency: A manual review, following the checklist in
docs/evidence/spike/README.md.
Estimated future size: M
Proposed resolution: Complete the manual review and a dependency license
check.
Review trigger: Before the repository is made public.
Status: Open

## Item TD-003 — Locks and state are valid only within one process

Date identified: 2026-10-30
Related increment: Increment 5
Why it was deferred: D-006 and D-008 choose one Fastify process with
in-memory state and a JSONL audit log.
Current limitation: Per-attempt locks and versioned updates do not protect
against two API processes.
Impact if left unresolved: Duplicate captures are possible if more than
one instance runs.
Required evidence or dependency: A decision to host with multiple
instances.
Estimated future size: M
Proposed resolution: A shared store with transactions.
Review trigger: Multi-instance hosting.
Status: Accepted for MVP

## Item TD-004 — stored_credential is not sent with vault orders

Date identified: 2026-10-30
Related increment: Increment 3
Why it was deferred: The spike did not send it, and the developer decided
not to add an untested request shape (D-010).
Current limitation: PayPal's documentation recommends stored_credential
(payment_initiator, usage, usage_pattern) for merchant-initiated payments
with a vaulted token.
Impact if left unresolved: PayPal might reject or risk-score these orders
differently outside the tested sandbox path.
Required evidence or dependency: An independent sandbox test with
stored_credential.
Estimated future size: S
Proposed resolution: Test it separately, then decide.
Review trigger: E-1 rejection, or any move towards production.
Status: Accepted for MVP

## Item TD-005 — Authorization and capture status lists not confirmed against the schema

Date identified: 2026-10-30
Related increment: Increment 4
Why it was deferred: The Payments v2 schema page was only partly readable
during planning.
Current limitation: Only CREATED, CAPTURED, PARTIALLY_CAPTURED, VOIDED,
DENIED, PENDING and EXPIRED are expected for authorizations, and only
COMPLETED and PENDING were observed for captures in the spike tests. The
mapping treats everything else as "unknown".
Impact if left unresolved: A valid status could be treated as "unknown"
and block a legitimate action.
Required evidence or dependency: E-1 results and the Payments v2 schema.
Estimated future size: S
Proposed resolution: Confirm the lists and update the mappings and tests.
Review trigger: Increment 4.
Status: Open

## Item TD-006 — Runner check #2 label overstates what step 02.1 proves

Date identified: 2026-10-30
Related increment: Increment 8
Why it was deferred: It is a label in reference material.
Current limitation: The runner groups 02.1 and 02.2 as "Authorize with
vault_id, no buyer redirect". Step 02.1 alone asserts only that the order
status is APPROVED or COMPLETED.
Impact if left unresolved: The evidence may be over-read.
Required evidence or dependency: None.
Estimated future size: S
Proposed resolution: Correct the label together with TD-001.
Review trigger: Alongside TD-001.
Status: Open

## Item TD-007 — No authentication

Date identified: 2026-10-30
Related increment: Increment 8
Why it was deferred: The MVP is a local demo (D-013).
Current limitation: The API has no user authentication.
Impact if left unresolved: Anyone who can reach the API could create
mandates and purchase attempts.
Required evidence or dependency: The hackathon's hosting requirement.
Estimated future size: M
Proposed resolution: At least a demo passcode if the demo is hosted.
Review trigger: Hosting becomes required.
Status: Accepted for MVP

## Item TD-008 — USD only

Date identified: 2026-10-30
Related increment: Increment 2
Why it was deferred: One currency keeps the money rules simple.
Current limitation: Mandates, proposals and orders support USD only.
Impact if left unresolved: No other currencies.
Required evidence or dependency: Per-currency minor-unit rules.
Estimated future size: M
Proposed resolution: Add a currency table and tests.
Review trigger: After the MVP.
Status: Accepted for MVP

## Item TD-009 — Vault onboarding is a manual prerequisite

Date identified: 2026-10-30
Related increment: Increment 3
Why it was deferred: The spike showed that first-time vault setup needs
manual buyer approval.
Current limitation: The vault_id comes from the environment, created through
the Postman vault flows. It is unknown whether the spike's vault_id is still
valid.
Impact if left unresolved: A lapsed approval blocks the demo until the
manual flow is repeated.
Required evidence or dependency: E-1 confirms whether the vault_id is still
valid.
Estimated future size: M
Proposed resolution: An in-app vault onboarding flow.
Review trigger: After the MVP.
Status: Accepted for MVP

## Item TD-010 — No webhooks; reconciliation by reading state

Date identified: 2026-10-30
Related increment: Increment 5
Why it was deferred: The spike did not establish webhook simulation or
signature verification.
Current limitation: Payment state is updated only by synchronous responses
and explicit reconcile reads.
Impact if left unresolved: State changes made at PayPal are not seen until
the next read.
Required evidence or dependency: Webhook reception and signature
verification proven in the sandbox.
Estimated future size: M
Proposed resolution: Add verified webhooks after the spike gaps are closed.
Review trigger: After webhook verification is proven.
Status: Accepted for MVP

## Item TD-011 — Leftover ignored node_modules folders

Date identified: 2026-10-30
Related increment: Increment 1
Why it was deferred: Deleting files needs the developer's permission.
Current limitation: Ignored node_modules folders remain at the root, in
apps/api and in packages/domain from the removed scaffold, and packages/
holds only ignored files.
Impact if left unresolved: A stale install could mask a missing dependency.
Required evidence or dependency: The developer's permission to delete them.
Estimated future size: S
Proposed resolution: Delete them before the first install in Increment 1.
Review trigger: Increment 1 proposal.
Status: Open

## Template for later entries

## Item TD-NNN — [Title]

Date identified:
Related increment:
Why it was deferred:
Current limitation:
Impact if left unresolved:
Required evidence or dependency:
Estimated future size: S / M / L
Proposed resolution:
Review trigger:
Status: Open / Accepted for MVP / Resolved
