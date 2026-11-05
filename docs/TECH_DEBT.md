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
docs/evidence/spike/README.md. This now includes
docs/evidence/paypal-lifecycle/ostensia-e1.postman_collection.json, which had
only a pattern scan on 2026-11-02 (no matches).
Estimated future size: M
Proposed resolution: Complete the manual review and a dependency license
check. Since Increment 6a this includes @anthropic-ai/sdk (Apache-2.0, not MIT)
and its seven transitive packages (D-024).
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
differently outside the tested sandbox path. E-1 (2026-11-02) sent the same
shape without stored_credential and got 201 with an authorization twice, so
no rejection was seen in the sandbox.
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
mapping treats everything else as "unknown". Increment 2b implements exactly
these lists in packages/domain/src/paypal-status.ts (D-018), plus order
statuses APPROVED and COMPLETED.
E-1 (2026-11-02) observed: authorization CREATED and VOIDED, capture
COMPLETED, order COMPLETED. Authorization CAPTURED was reported by the
developer afterwards and then read through the adapter in the Increment 4
lifecycle run (2026-11-02). Still unobserved: authorization PARTIALLY_CAPTURED,
PENDING, DENIED and EXPIRED; capture PENDING; order APPROVED.
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
Status: Accepted for MVP. Since Increment 5b the API has routes, and an
attempt's response includes the sandbox order and authorization ids and the
mandate hash. The server listens on 127.0.0.1 only (config.ts).

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
valid (E-1 did not test it). E-1's first vault check returned 404
RESOURCE_NOT_FOUND because, per the developer, the setup-token id was used
where the vault id (payment token) belongs; a vault created by re-running the
setup then worked for both E-1 orders.
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
Status: Resolved (2026-10-30, Increment 1: the three folders were deleted
with the developer's permission before the install)

## Item TD-012 — Input bounds and the id character set are arbitrary MVP limits

Date identified: 2026-10-31
Related increment: Increment 2a
Why it was deferred: Real catalogue data does not exist yet (D-012).
Current limitation: Quantity is capped at 1,000,000, a mandate has at most
50 items, a purchase at most 100 lines, and ids must match
^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$.
Impact if left unresolved: A legitimate id or order size could be rejected
as invalid.
Required evidence or dependency: The synthetic catalogue (Increment 5 or 7)
or real catalogue data.
Estimated future size: S
Proposed resolution: Adjust the limits to match the catalogue.
Review trigger: A catalogue id or order size is rejected.
Status: Accepted for MVP. The Increment 5b synthetic catalogue and its
scenarios all fit these limits; nothing was rejected.

## Item TD-013 — Evaluator behaviour with hostile input objects is untested

Date identified: 2026-10-31
Related increment: Increment 2a
Why it was deferred: Inputs are expected to come from parsed JSON.
Current limitation: Garbage values, circular objects and unknown keys are
tested. Objects whose property getters throw, and proxies, were not tested
and may make validation throw instead of returning a block decision.
Impact if left unresolved: An exception instead of a block. The gate treats
an exception as no capture, so this is a robustness gap, not a way to
capture.
Required evidence or dependency: A test with throwing getters, and a
decision on whether the evaluator must be total.
Estimated future size: S
Proposed resolution: Test it, and either document or handle it.
Review trigger: Increment 5 (gate), when input handling is wired up.
Status: Open

## Item TD-014 — E-1 residuals

Date identified: 2026-11-02
Related increment: Increments 3 and 4
Why it was deferred: None of them blocks the adapter proposal (D-019).
Current limitation:
- R1 (closed 2026-11-02): the value of custom_id on GET authorization was not
  shared in E-1. The adapter smoke run then showed that it equals the hash
  that was sent (docs/evidence/paypal-lifecycle/ADAPTER_SMOKE_RESULTS.md).
- R2 (closed 2026-11-02): the order COMPLETED and authorization CAPTURED
  statuses after capture were developer-reported in E-1. The Increment 4
  lifecycle run read CAPTURED through the adapter (PASS, D-021).
- R3 (closed 2026-11-02): request E1-C.6 in the E-1 collection counts captures
  at purchase_units[].payments.captures on GET order. The lifecycle run read
  exactly one COMPLETED capture from that path after the replay (PASS).
- R4 (closed as not needed, 2026-11-02, D-021): whether the earlier spike
  vault_id is still valid was not tested. The application uses the configured
  vault id, and checkVault reports a bad one.
Impact if left unresolved: The adapter could reconcile a capture on an
unconfirmed status or read the capture list from the wrong place.
Required evidence or dependency: The developer's `smoke --lifecycle` run,
recorded under docs/evidence/paypal-lifecycle/LIFECYCLE_SMOKE_RESULTS.md
(done 2026-11-02).
Estimated future size: S
Proposed resolution: Done: the run passed and is recorded.
Review trigger: None.
Status: Resolved (2026-11-02). R1 to R4 are closed.

## Item TD-015 — The adapter has only been tested against a fake PayPal

Date identified: 2026-11-02
Related increment: Increment 3
Why it was deferred: Real sandbox calls need the developer's credentials and
a manual run (D-011).
Current limitation: apps/api/src/paypal/ is tested with a fake fetch whose
responses follow the shapes E-1 recorded, with synthetic values. It has not
yet made a real call. The fake can drift from real PayPal behaviour.
Impact if left unresolved: A real response could differ from a fixture
(for example in field names or status codes) and surface only in Increment 4
or 5.
Required evidence or dependency: The developer's smoke run
(`pnpm --filter @ostensia/api smoke`, then with `--lifecycle`; the Increment 3
`--create` option was replaced by `--lifecycle` in Increment 4).
Estimated future size: S
Proposed resolution: Run the smoke script, record the sanitized output under
docs/evidence/paypal-lifecycle/, and correct any fixture that differs.
Review trigger: After the lifecycle run.
Status: Partly resolved (2026-11-02). The Increment 3 smoke run exercised
checkVault, createVaultOrder, getAuthorization and getOrder once against the
sandbox, and the Increment 4 lifecycle run exercised captureAuthorization,
voidAuthorization, the replay and the order captures path, all on the success
path only. Every fixture field they touched matched. Failure paths, token
expiry, a pending capture, the cleanup path and the anomaly paths are still
tested only against the fake.
Update (2026-11-05): the Increment 5b end-to-end run drove the gate and the
routes against the sandbox and every step passed
(docs/evidence/paypal-lifecycle/E2E_RESULTS.md). It was again the success paths
only; the failure paths above are still tested only against the fake.

## Item TD-017 — The sandbox lifecycle run is not repeatable without credentials

Date identified: 2026-11-02
Related increment: Increment 4
Why it was deferred: It needs the developer's sandbox credentials and moves
sandbox money (one $1.00 capture), so it cannot run in the automatic tests
(D-011).
Current limitation: apps/api/scripts/lifecycle.ts is tested against a stub
adapter, not against PayPal. The Increment 3 `--create` run left one
authorization open whose id was never recorded; nothing can void it, and it
expires on its own about 29 days after 2026-11-02.
Impact if left unresolved: The lifecycle orchestration could be wrong in a way
only the real sandbox shows. The leftover authorization holds a sandbox
$1.00 until it expires.
Required evidence or dependency: One `smoke --lifecycle` run (done
2026-11-02: every step passed and no authorization was left open, see
docs/evidence/paypal-lifecycle/LIFECYCLE_SMOKE_RESULTS.md).
Estimated future size: S
Proposed resolution: Done for the new run. `--lifecycle` voids or captures
everything it creates and prints a sandbox id only when its own cleanup
fails, so it cannot leave another orphan. The cleanup path itself has only
run against a stub.
Review trigger: None for the run. The leftover Increment 3 authorization
simply expires.
Status: Partly resolved (2026-11-02). The lifecycle run is recorded. The
orphaned Increment 3 authorization cannot be voided and is accepted until it
expires.

## Item TD-016 — No token refresh-and-retry, and no read retries

Date identified: 2026-11-02
Related increment: Increment 3
Why it was deferred: Retrying hides the outcome the caller must see, and D-010
forbids automatic write retries. Reads were left alone for the same
simplicity.
Current limitation: A 401 clears the cached token and returns "rejected". The
failed call is not repeated, so one call is lost when a token expires early.
Reads are not retried after a timeout.
Impact if left unresolved: Occasional extra failures that the caller must
handle by calling again.
Required evidence or dependency: Observed token lifetimes (E-1 saw none) and
how the gate wants to treat a failed read.
Estimated future size: S
Proposed resolution: Decide in Increment 5 whether the gate retries reads,
and keep writes unretried.
Review trigger: Increment 5.
Status: Accepted for MVP. Decided in Increment 5a (D-022): the gate never
retries a read by itself. A failed read at settle is recorded as
settle_read_failed, the attempt stays authorized, and the caller may settle
again, because nothing was written. Reconcile only reads, and a failed read
leaves the attempt as it was. Writes are still never retried.

## Item TD-018 — An order request with no result cannot be followed up

Date identified: 2026-11-02
Related increment: Increment 5a
Why it was deferred: Finding the order again needs either its id or a deliberate
re-send of the create request, and D-010 forbids automatic write retries.
Current limitation: If the process dies, or PayPal does not answer, between
"order requested" and "order result", the attempt becomes create_unknown with
no order id. Reconcile has nothing to read, so it reports "not applicable". The
authorization, if PayPal made one, expires by itself after about 29 days. The
mandate stays in use (single-use rule), so it cannot be used again.
Impact if left unresolved: A mandate can be stuck, and funds can be held until
the authorization expires.
Required evidence or dependency: A decision on whether a deliberate re-send of
the create request with the same PayPal-Request-Id is acceptable. E-1 showed a
capture replay returns the original result; it did not test a create replay.
Estimated future size: S
Proposed resolution: Test a create replay in the sandbox, then decide. Until
then a person creates a new mandate.
Review trigger: Increment 8 (demo hardening), or any unknown create seen in a run.
Status: Accepted for MVP

## Item TD-019 — The audit log is not tamper-evident

Date identified: 2026-11-02
Related increment: Increment 5a
Why it was deferred: Signing or chaining the log is beyond the MVP, and the log
is a local file (D-008, D-013).
Current limitation: Anyone who can edit data/audit.jsonl can rewrite history.
The gate does catch one kind of edit: a mandate whose terms were changed but
not its hash fails the integrity check (D-015), and that is tested. An edit to
an attempt, a decision or a status is not detected, and a mandate edited
together with its hash is not detected.
Impact if left unresolved: The log is evidence only if the file is trusted.
Required evidence or dependency: A decision to chain event hashes or to sign
the log.
Estimated future size: M
Proposed resolution: A hash chain over the events, verified at startup.
Review trigger: Hosting becomes required (TD-007), or the log is shown as
evidence to a third party.
Status: Accepted for MVP

## Item TD-020 — Refused requests are not written to the audit log

Date identified: 2026-11-02
Related increment: Increment 5a
Why it was deferred: A refusal creates no attempt, and the log is rebuilt into
attempts and mandates, so logging a refusal needs its own event type and a
decision on what a refusal should keep.
Current limitation: A request that the gate refuses before an attempt exists
(invalid proposal, unknown mandate, mandate in use, reused attempt id) returns a
reason to the caller and leaves no record.
Impact if left unresolved: The audit shows what the gate did, not what it was
asked and refused.
Required evidence or dependency: The API layer (Increment 5b) and what the demo
needs to show.
Estimated future size: S
Proposed resolution: Add an attempt_refused event in 5b, ignored by the state
rebuild.
Review trigger: Increment 8 (demo hardening).
Status: Accepted for MVP. Deferred in Increment 5b (D-023): the HTTP response
already shows the refusal to the caller, and the demo does not need it logged.

## Item TD-021 — The gate keeps every applied event in memory

Date identified: 2026-11-04
Related increment: Increment 5b
Why it was deferred: The API shows an attempt's audit events (eventsFor), and
re-reading the file on each request could race with the torn-tail repair and
with appends. Keeping the events already applied is simpler (D-023).
Current limitation: The list grows with every event for the life of the process
and is rebuilt from the whole file at startup.
Impact if left unresolved: Memory use grows with use. For a local demo with a
few attempts it is negligible.
Required evidence or dependency: A long-running or hosted deployment (TD-007).
Estimated future size: S
Proposed resolution: Index the events by attempt and mandate, or read them from
the file on demand under the same lock as the append.
Review trigger: Hosting becomes required, or the log passes a few thousand events.
Status: Accepted for MVP

## Item TD-022 — Draft quality and the original draft are not verified or recorded

Date identified: 2026-11-05
Related increment: Increment 6a
Why it was deferred: Running the model costs money and needs the developer's key
(a manual run, D-011), and recording drafts is a gate change (D-024, option 3).
Current limitation: The drafter is tested against a fake client, not the real
model. Whether the model leaves unstated fields null, resists an instruction
hidden in the text, and converts dates and amounts correctly has not been
observed until the developer's draft-smoke run, and a model is not deterministic,
so one good run proves little. The AI's original draft and the person's edits are
not written to the audit log; only the confirmed mandate and its intentSummary
are.
Impact if left unresolved: A draft can contain a wrong value that a hurried person
confirms, and the audit cannot show what the AI proposed.
Required evidence or dependency: The draft-smoke run, and a decision to add a
mandate_drafted event if the audit must show the draft.
Update (2026-11-05): the developer's first draft-smoke run is recorded in
docs/evidence/ai-drafting/DRAFT_SMOKE_RESULTS.md. The model left unstated fields
null, did not obey text hidden in a description, and converted amounts and dates
correctly. It also sent an empty allowedVariantIds list (not a valid term) in two
samples, which the first run's checks did not catch; the prompt and the script
were fixed and the second run (2026-11-05) showed no such problem. This is still
a sample of a non-deterministic model: two runs of four descriptions.
Estimated future size: S
Proposed resolution: Run the smoke script and read the drafts, and keep the
person-in-the-loop review prominent in the UI (Increment 7). Add the audit event
if a judge or user needs the draft in the record.
Review trigger: The smoke run shows a wrong or invented value.
Status: Open

## Item TD-023 — The draft route spends money and has no rate limit

Date identified: 2026-11-05
Related increment: Increment 6a
Why it was deferred: The MVP is a local demo (D-013), and the server listens on
127.0.0.1 only.
Current limitation: Each call to POST /mandates/draft (and, since Increment 6b,
POST /mandates/:id/agent-proposal) sends a request to the AI
provider with the developer's key (a few cents at list price). The only bounds
are the 2,000-character limit and the 64 KB body limit. There is no rate limit
and no daily cap.
Impact if left unresolved: If the API is ever reachable by others (a hosted demo,
TD-007), anyone who can reach it can spend the key.
Required evidence or dependency: A decision to host the demo.
Estimated future size: S
Proposed resolution: A per-process request cap or a demo passcode, together with
TD-007, and a spend limit on the provider key.
Review trigger: Hosting becomes required.
Status: Accepted for MVP

## Item TD-024 — The SDK sends enum and const constraints as description text

Date identified: 2026-11-05
Related increment: Increment 6b (also affects 6a)
Why it was deferred: It was found while testing the agent's schema. Working around
it means building the output format by hand instead of using the SDK's Zod helper.
Current limitation: With @anthropic-ai/sdk 1.3.0, the Zod helper (zodOutputFormat)
keeps only a few JSON Schema keywords (type, properties, required, items, anyOf,
and some formats) and puts everything else into the description text, including
`enum` and `const`. The product and variant lists of the shopping agent, and the
drafter's `currency: "USD"`, reach the model as a hint, not as a constraint the API
enforces. (Minimum and maximum lengths and values were already known to be
removed, D-024.)
Impact if left unresolved: The model can name a product, variant or currency that
the shop does not have. Our own validation rejects it (invalid_output, a 502), so
nothing wrong is used, but the request fails instead of being constrained to a
valid answer. The two smoke runs of the drafter and the first agent runs showed no
such reply.
Required evidence or dependency: A newer SDK that keeps enum, or building the
output format by hand (z.toJSONSchema, without the SDK's transform).
Estimated future size: S
Proposed resolution: Check whether a newer SDK release keeps enum and const; if
not, send the schema without the SDK's transform and parse the reply with our own
schema (the code already does the second step).
Review trigger: A smoke run or a demo shows an invalid_output for an out-of-catalogue
id.
Status: Accepted for MVP

## Item TD-025 — The AI agent's outcomes are not guaranteed, and its reasoning is not recorded

Date identified: 2026-11-05
Related increment: Increment 6b
Why it was deferred: A model is not deterministic, and recording the reasoning is a
gate change (D-025, option 3).
Current limitation: Whether an uninformed agent exceeds the limits, or an informed
agent stays within them, varies by run. Its explanation is its own wording and is
unverified. Neither the explanation nor the cart's origin is written to the audit
log; the audit shows the attempt, its proposal and the gate's decision.
Update (2026-11-05): the developer's first agent-smoke run
(docs/evidence/ai-drafting/AGENT_SMOKE_RESULTS.md) showed an informed agent within
the limits in all four runs and an uninformed agent over the limits in both runs,
blocked by the pre-check. That is one sample; the point stands.
Impact if left unresolved: A demo that depends on the AI agent being blocked can
fail to show a block, and the audit cannot show which proposals came from the AI.
Required evidence or dependency: The developer's agent-smoke run, and a decision to
add an audit event if the audit must show an AI-originated proposal.
Estimated future size: S
Proposed resolution: For a guaranteed block in the video, use a deterministic
scenario (D-023). Label every AI proposal in the UI (Increment 7). Add an event
that marks a proposal as AI-originated if a judge needs it in the record.
Review trigger: The smoke run, or the video script.
Status: Accepted for MVP

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
