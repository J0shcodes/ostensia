# Ostensia: Research-to-Implementation Decisions (mid-build validation, report 06)

**Status:** a research artefact. It is **not** an approved project decision and
changes no project record. Proposed record changes are listed separately for the
developer's approval and have not been applied.
**Review date:** 2026-11-05. Official hackathon pages were re-checked at
21:36 UTC that day.
**Reviewer:** Claude Code (model `claude-opus-5-5`). It is the same assistant that
wrote Reports 00 to 05 and most of the code. This is a self-review: read it with
that bias in mind.
**Branch and commit reviewed:** `feat/ai-drafting` at `9c4293b`. That is the commit
audited in Report 00; no code has changed since.

## Labels

- **[F] Fact:** stated by a cited external source, or verified in this review in
  code or the official pages.
- **[SA] Self-audit:** from Report 00, or from register entries SA-nn and PR-nn.
  Not independent evidence.
- **[I] Interpretation**, **[H] Hypothesis**, **[R] Recommendation**,
  **[U] Unresolved.**

Every finding carries exactly one impact label:
MUST RESOLVE BEFORE INCREMENT 7 · SHOULD INFLUENCE INCREMENT 7 · CAN BE DEFERRED
UNTIL INCREMENT 8 · POST-HACKATHON PRODUCT OPPORTUNITY · NO CHANGE RECOMMENDED.

Evidence IDs (EV-, SA-, PR-) refer to
`docs/research/mid-build-validation/05-evidence-register.md`. **G-nn** IDs are gaps
found in this review: sources that are not in the register. They are listed in §9
and the register is not edited.

---

## 1. Methodology

1. **Confirmed the inputs exist and are complete.** All six reports exist under
   `docs/research/mid-build-validation/`:
   - `00-implementation-baseline.md`: 590 lines, unchanged since its audit.
   - `01-problem-and-audience-validation.md`: 453 lines.
   - `02-competitor-and-substitute-analysis.md`: 204 lines.
   - `03-standards-and-technical-assessment.md`: 273 lines.
   - `04-hackathon-requirements.md`: 235 lines.
   - `05-evidence-register.md`: 118 lines.

   Reports 01 to 05 were read in full from disk for this review. Report 00 was read
   in full earlier in the same session, and its size and timestamp are unchanged.
   None is truncated. Each ends with its conclusions or appendix.
2. **Re-checked the official hackathon sources directly.**
   - Rules: https://paypalaihackathon.devpost.com/rules
   - Overview: https://paypalaihackathon.devpost.com/
   - FAQs: https://paypalaihackathon.devpost.com/details/faqs
   - Updates: https://paypalaihackathon.devpost.com/updates and three update posts.

   They were downloaded with `curl` to a scratch directory outside the repository,
   because WebFetch returns 403. The rules body is **textually identical** to the
   copy used for Report 04. The overview is unchanged apart from counters. The
   update posts add new official guidance (G-01 to G-03).
3. **Read the project records** that the findings touch:
   - D-006 (`docs/DECISIONS.md:304-344`)
   - D-013 (`docs/DECISIONS.md:662-704`)
   - D-024 (`docs/DECISIONS.md:1548-1556`)
   - `apps/web/.env.example`
   - `apps/api/src/config.ts`
   - `apps/api/src/index.ts:15-35`
4. **Read the Next.js `rewrites` documentation** (G-04), because issue 9 depends on
   it.
5. For each significant finding in Reports 01 to 04, recorded its evidence, the
   feature it touches, its effect, the cost of changing now, and its impact label
   (§3). Where this review disagrees with a report's label, §8 says so.

**Not done:** no code was run, no PayPal or Anthropic call was made, and no
repository file other than this one was written.

---

## 2. Executive assessment (deliverable B1)

1. **[F/SA] The backend does what the hackathon needs.** It runs:
   - a person-confirmed mandate;
   - a deterministic item-level evaluation;
   - a real PayPal sandbox authorization followed by capture;
   - a pre-check block with no PayPal call;
   - a revoke-then-void.

   Evidence: [SA-01]; `docs/evidence/paypal-lifecycle/E2E_RESULTS.md`. These are
   success paths only, and the runs are developer-reported.
2. **[I] The research does not invalidate the problem, the architecture or the
   payment model.**
   - It **narrows the claims**. The audience is a hypothesis. Ostensia is the
     merchant in its PayPal flow. The hash is traceability, not proof. Basket-level
     authorization *standards* already exist; Ostensia's distinct element is
     deterministic *evaluation* of the cart's items. [EV-09, EV-13, EV-15, EV-20; SA-10]
   - It **shows that the hackathon outcome now depends mostly on things that are not
     backend code**: a coherent frontend, a video that carries the judging, an
     accurate README, and a decided access path. [EV-01; G-01, G-02]
3. **[F] Time is the dominant constraint.**
   - Submissions close **2026-11-12 12:00 PT**, seven days after this review [EV-01].
   - After the deadline, "submissions are locked. Don't edit your repo, video, or
     linked materials until after the winner announcement" [G-01].
   - Increments 7 and 8 must both finish before the deadline.
4. **[R] Verdict.** Proceed to Increment 7 **without changing the core backend
   architecture**, once two decisions are recorded:
   - the judge-access model (§6);
   - the browser-to-API route (§7), which confirms the existing D-006.

   Neither decision needs a backend code change.

---

## 3. Decision matrix (deliverable A)

"Required before Increment 7?" is **Yes** only for the MUST RESOLVE label.

| Research finding | Evidence and confidence | Existing implementation affected | Recommendation | Required before Increment 7? | Proposed action | Post-hackathon relevance |
|---|---|---|---|---|---|---|
| **1. Judge-access model undecided.** The payment path needs PayPal sandbox credentials and a vault that only a manual Postman flow creates. D-024 already expects judges to use "their own sandbox credentials and AI key" | EV-01 (High); G-01, G-02 (High, official); SA-13, SA-15; `docs/DECISIONS.md:1553-1556` | `apps/api/src/index.ts:21-26` (the API refuses to start without PayPal config); D-013 local-first; README | **MUST RESOLVE BEFORE INCREMENT 7.** Adopt "run locally with your own sandbox credentials; video-led" (§6). Validates D-013 and D-024 | Yes | Record one decision (proposed D-026). No code change | Low. Hosting and auth return only if Ostensia becomes a service |
| **2. Browser-to-API route undecided.** D-006 says rewrite, no CORS; `apps/web/.env.example` declares a browser-visible `NEXT_PUBLIC_API_BASE_URL` | SA-16 (High); G-04 (High: Next.js docs, "Rewrites act as a URL proxy") | D-006 (`docs/DECISIONS.md:320-322`); `apps/web/.env.example:1-2`; API bound to `127.0.0.1` (`config.ts:6`) | **MUST RESOLVE BEFORE INCREMENT 7.** Confirm D-006: Next.js rewrite of `/api/*` to the local API. Validates D-006; invalidates the `.env.example` line | Yes | Record a decision (proposed D-027). In Increment 7, replace the `NEXT_PUBLIC_` variable with a server-only one | None |
| **3. Recommended audience is a hypothesis.** Report 01: "developers and platforms that build AI shopping agents on PayPal", with the consumer as the demonstrated end user | EV-28, EV-29, EV-32, EV-33, EV-36 (Medium for the problem); **no developer-demand or willingness-to-pay evidence** (register "not found") | `docs/research-summary.md:44-58` (PR-01); no code | **SHOULD INFLUENCE INCREMENT 7.** Use it as the stated audience, always worded as a hypothesis | No | Use hypothesis wording in UI copy, README and video. No code change | High: interviews with agent builders |
| **4. Consumer concern is common; autonomous delegation is a minority preference** | EV-28 (Medium), EV-29 (Medium), EV-30 (Low), EV-31 (Low, conflicting) | Demo narrative; mandate confirmation step | **SHOULD INFLUENCE INCREMENT 7.** Show a person confirming limits and seeing a wrong-item block. Do not claim people want fully autonomous agents | No | Copy and demo script only | Medium: approval thresholds |
| **5. Ostensia's PayPal integration is a merchant-side flow.** The vault is scoped to the merchant app that saved it | EV-09 (High), EV-07 (High); SA-04, SA-13 | `apps/api/src/paypal/adapter.ts:408-422` (order with `vault_id`); `paypal-config.ts` (single vault) | **SHOULD INFLUENCE INCREMENT 7.** Validates the adapter. Challenges any "the agent pays any merchant" framing | No | UI and README say the demo store is the merchant and the buyer consented once in PayPal | Medium: consent UX and production enablement |
| **6. Ostensia complements PayPal.** No PayPal page reviewed describes buyer-side mandates | EV-04 (High), EV-05 (High), EV-06 (Medium); based on what the documentation does not say | Positioning only | **SHOULD INFLUENCE INCREMENT 7** | No | Pitch: "a policy check in front of PayPal capture", not a PayPal alternative | Medium: re-check PayPal Agent Ready |
| **7. Credential-level limits (amount, merchant, time) are widely offered elsewhere** | EV-18 (High), EV-21 (High), EV-22 (Medium), EV-24 (Medium) | Mandate total and expiry fields (`packages/domain/src/mandate.ts`) | **SHOULD INFLUENCE INCREMENT 7.** Do not claim novelty for these fields | No | Pitch acknowledges Visa, Stripe, Ramp and AP2 | High |
| **8. Basket-level authorization standards exist (AP2 closed checkout mandates; Verifiable Intent basket approval). Ostensia's distinct element is deterministic evaluation of the cart's items inside its own PayPal merchant flow** | EV-15 (Medium-High), EV-20 (Medium), EV-18 (High); the "evaluator is thin" interpretation is Low-Medium (AP2 specification not readable) | `packages/domain/src/evaluate.ts`; scenarios (`apps/api/src/simulation/scenarios.ts`) | **SHOULD INFLUENCE INCREMENT 7.** Validates the domain evaluator as the centrepiece | No | Make an item-level block (wrong variant or over-quantity) the featured block | High: AP2 alignment |
| **9. The hash in `custom_id` is application-level traceability, not proof of buyer identity, consent or independent authorization** | EV-13 (Medium, schema mirror); SA-10, SA-11 (High) | `apps/api/src/mandate-hash.ts:9-12`; `evaluate.ts:83` | **SHOULD INFLUENCE INCREMENT 7.** Validates the code comments. Challenges any UI claim of "proof" | No | Label it in the UI as "mandate reference recorded on the PayPal order (traceability)" | Medium: signed mandates |
| **10. Holds, captures and voids must be worded precisely.** An authorization holds funds for up to 29 days. Capture completes the payment. Release of the hold after a void is **not documented** | EV-07 (High); SA-18 (Medium); register "not found" (void release) | Domain status mapping (`packages/domain/src/paypal-status.ts`); UI text | **SHOULD INFLUENCE INCREMENT 7** | No | Status copy as in §5. Never "funds released immediately" | Low |
| **11. AI proposals, deterministic scenarios and real PayPal transactions must stay distinguishable.** The AI origin of a proposal is not recorded in the audit log | SA-03, SA-04 (High); Report 00 L7; TD-025 | `routes/agent.ts`, `routes/simulation.ts` (responses are labelled); audit log has no source field | **SHOULD INFLUENCE INCREMENT 7.** UI keeps the label it receives and does not imply the audit log records the source | No | UI-only labels. No backend change | Medium: record proposal provenance |
| **12. No AI-agent cart has been through PayPal** | SA-03 (High); `apps/api/scripts/e2e-run.ts:100` | `routes/agent.ts` → `POST /attempts` (same gate path, never exercised with an agent cart) | **CAN BE DEFERRED UNTIL INCREMENT 8.** Do not present it as established | No | Increment 8: either one recorded sandbox run of an agent cart, or the video stops the agent at the pre-check | Low |
| **13. AI outcomes vary between runs** | SA-17, SA-20 (Low, n=1); TD-025 | Demo script | **CAN BE DEFERRED UNTIL INCREMENT 8** | No | Deterministic scenarios carry the block and the void. The AI agent is a labelled extra | Low |
| **14. "Design" scores a complete, coherent product; there is no frontend** | EV-01, EV-02 (High); SA-05 | `apps/web/` (only `.env.example`) | **SHOULD INFLUENCE INCREMENT 7** (it is the increment's purpose) | No | Minimum scope in §4.3 | n/a |
| **15. Judges are not required to run the project; the video carries much of the weight** | EV-01 (High); G-02 (High: "Judges aren't required to run your project, so your video carries a lot of weight") | Increment 7 screens; Increment 8 video | **SHOULD INFLUENCE INCREMENT 7.** One linear, filmable flow | No | Design the UI around the §5 narrative | n/a |
| **16. Submissions lock at the deadline; test credentials must stay active until 2026-12-21** | G-01 (High, official update, about 2026-11-05) | Increment 8 schedule; sandbox app and vault | **CAN BE DEFERRED UNTIL INCREMENT 8** | No | Finish README and video before 2026-11-12 12:00 PT. Keep the sandbox app active until 2026-12-21. No repository edits during judging | n/a |
| **17. Public repository, visible licence, accurate README, and tool identification** | EV-01, EV-02 (High); G-01; SA-15 | `README.md:6-9,31-35` (stale); repository private | **CAN BE DEFERRED UNTIL INCREMENT 8** (must be done before the deadline) | No | README rewrite and publication review in Increment 8 | n/a |
| **18. Real failure paths and reconcile are untested** | SA-02 (High) | `POST /attempts/:id/reconcile` (stub-tested only) | **SHOULD INFLUENCE INCREMENT 7.** Exclude reconcile and failure states from the demo UI | No | No reconcile button in the demo UI | Medium |
| **19. Single-use mandate fits task-scoped authorization patterns** | EV-15, EV-18, EV-22, EV-24 (Medium); SA-07 | `apps/api/src/gate/state.ts:62`; D-022 | **NO CHANGE RECOMMENDED.** Validates | No | None. The UI makes a new mandate per run (L4) | Medium: reusable budgets |
| **20. Current mandate constraints are enough for a one-shop demo** | EV-28, EV-32 (Medium); SA-09 | `packages/domain/src/mandate.ts` | **NO CHANGE RECOMMENDED.** Validates | No | None | High: merchant constraint, approval threshold |
| **21. Prompt-injection posture (model proposes; code prices; gate decides)** | EV-33, EV-36 (Medium); SA-19; SA-20 (Low) | `apps/api/src/ai/cart.ts:26`; gate pre-check | **NO CHANGE RECOMMENDED.** Validates | No | None. Do not claim the model resists injection | Medium: untrusted catalogue text |
| **22. Idempotency and the "unknown, never failed" outcome match PayPal's documentation** | EV-12 (High); SA-01 | `apps/api/src/paypal/request-id.ts`; `gate/state.ts:234` | **NO CHANGE RECOMMENDED** | No | None | Low |
| **23. PayPal and AI use are "meaningful"** | EV-01, EV-02 (High); SA-01, SA-03 | Whole build | **NO CHANGE RECOMMENDED** | No | Name both in the description, "Built With" and the video (G-03) | n/a |
| **24. `stored_credential` for wallet vaults, production vetting, consent UX** | EV-08 (High, cards only), EV-10 (Medium-High), EV-11 (Low) | `adapter.ts:408-422` | **POST-HACKATHON PRODUCT OPPORTUNITY** | No | None now | High |
| **25. Enforcement is in the application, not the payment credential** | EV-18, EV-22 (High/Medium); SA-01, SA-11 | Architecture (D-006) | **POST-HACKATHON PRODUCT OPPORTUNITY** | No | None now | High |
| **26. Verifiable mandates (AP2, Verifiable Intent)** | EV-15, EV-16, EV-17, EV-20 (Medium) | `mandate-hash.ts` | **POST-HACKATHON PRODUCT OPPORTUNITY.** AP2 is pre-release | No | None now | High |
| **27. Reusable budgets, cumulative limits, merchant, category and approval-threshold constraints** | EV-18, EV-22, EV-24, EV-26, EV-28 (Medium) | Domain schema | **POST-HACKATHON PRODUCT OPPORTUNITY** | No | None now | High |
| **28. No willingness-to-pay evidence for any audience; SMB is served by incumbents** | Register "not found"; EV-22, EV-24, EV-38 | None | **POST-HACKATHON PRODUCT OPPORTUNITY** | No | None now | High |
| **29. Vault lifetime unknown; a stale vault would break recording** | Report 03 §9 item 6; TD-009 | `PAYPAL_VAULT_ID` | **CAN BE DEFERRED UNTIL INCREMENT 8** | No | Check the vault on recording day | Low |
| **30. Intermittent test failure (5 of 1,419 in one of five runs)** | SA-21 (High occurrence; cause unknown) | Test suite | **CAN BE DEFERRED UNTIL INCREMENT 8** | No | Investigate before publishing | Low |
| **31. Origin research report missing; thesis drift** | SA-14, PR-01 (High) | `docs/research-summary.md` | **NO CHANGE RECOMMENDED** (to the build) | No | Note it in research-summary (proposed record change) | Medium: revisit the merchant-evidence thesis |

---

## 4. Audience, positioning and scope

### 4.1 Best-supported initial audience and use case (deliverable B2)

- **[H] Audience.** Report 01's exact wording is:
  - §4.4 [R]: "developers and platforms that build AI shopping agents on PayPal";
  - §10.2: "Developers and platforms building AI shopping agents that pay through
    PayPal";
  - F1-2: "developers and platforms building PayPal-paid shopping agents".

  The task framing ("PayPal-powered AI shopping experiences") is broader. This
  review uses the report's narrower wording.
- **[H] It is a hypothesis.** It rests on **product fit** (the built API sits between
  an agent's cart and payment capture [SA-01, SA-03]) and on indirect signals
  [EV-15, EV-18, EV-21, EV-22, EV-33, EV-36]. It does **not** rest on validated
  willingness to pay or independent developer-demand evidence; none was found.
- **[H] Use case.** A platform lets a person delegate a specific purchase to an AI
  agent. The person confirms item-level limits once. Ostensia checks every proposed
  cart against those limits before any PayPal capture, and explains any refusal.
- **[I] The demo shows the consumer's side** because the judging asks for "a real
  problem for a real audience" [EV-01], and the consumer concern is the
  best-evidenced part [EV-28].

### 4.2 Recommended positioning and differentiation hypothesis (deliverable B3)

**[R] Positioning statement** (for the README, the description and the video):

> Ostensia is a purchase-policy check for AI shopping agents that pay through
> PayPal. A person confirms what the agent may buy: which products and variants,
> how many, and at what price, until when. Before any payment is captured,
> Ostensia's deterministic rules check the agent's actual cart against those
> limits. A compliant cart is authorized and captured through PayPal. A
> non-compliant cart is refused before PayPal is called, or its authorization is
> voided. Every decision is explained and recorded.
> *In this demo, the Ostensia app is the merchant. The buyer approved saving their
> PayPal account once, in the PayPal sandbox. The shop is simulated.*

**[H] Differentiation hypothesis:**
- Inside its own PayPal merchant payment flow, Ostensia evaluates the cart's
  **items** deterministically (product, variant, quantity, unit price, total,
  expiry) against limits a person confirmed. It authorizes first and captures only
  after the evaluation passes.
- This is **not** a claim that agentic commerce lacks basket-level authorization.
  AP2 checkout mandates bind a specific cart [EV-15]. Mastercard Verifiable Intent
  records basket approval [EV-20]. Visa, Stripe and Ramp enforce amount, merchant,
  category and time limits on the payment credential [EV-18, EV-21, EV-22, EV-24].
- Ostensia's claim is narrower. It is a working, explainable item-level check placed
  before a PayPal capture, where no PayPal-documented buyer-side mandate was found
  [EV-05].

**[R] Must not be said:**
- "The agent can pay any merchant with the buyer's PayPal wallet."
- "PayPal enforces the mandate."
- "The hash proves the buyer authorized this."
- "Funds are released immediately on void."
- "No one else does basket-level authorization."
- "The AI agent completes PayPal purchases", unless finding 12 has been closed by a
  recorded run.

### 4.3 Minimum frontend scope, Increment 7 (deliverable B5)

**[R]** The smallest frontend that gives judges a "complete, coherent product
experience" [EV-01] and a filmable flow [G-02]:

1. **Mandate screen.**
   - A free-text box with "Draft with AI" (labelled *AI-generated draft*).
   - It shows `missing` fields and warnings.
   - An editable form for every term, which is also the full manual path when AI
     answers 503 `not_configured` (`routes/draft.ts:24`).
   - A "Confirm mandate" button.
2. **Proposal panel.**
   - The synthetic catalogue (labelled *Simulated shop*).
   - A scenario picker (labelled *Deterministic scenario*).
   - An "Ask the AI agent" option with informed or uninformed mode (labelled
     *AI-generated proposal*; disabled with an explanation when not configured).
   - Each line shows its catalogue price.
3. **Attempt result.**
   - The decision (allowed or blocked).
   - The plain-language explanation, with **repeated violations grouped** (Report
     00 L8).
   - PayPal state worded as in §5, and a *PayPal Sandbox* badge only on steps that
     called PayPal.
   - "Settle" and "Revoke mandate" actions.
4. **History and audit view.**
   - The attempts list and the attempt detail with audit events.
   - The mandate reference labelled as traceability (finding 9).
5. **Cross-cutting.**
   - Client-generated unique attempt ids (`crypto.randomUUID`; Report 00 L5).
   - Money formatted from minor units (L13).
   - Loading states (L12; latency unmeasured).
   - A persistent banner: "Sandbox demo. Simulated shop. Ostensia acts as the
     merchant."
   - A new mandate per run (single use, L4).

**Explicitly not in Increment 7:** authentication, user accounts, a credentials or
settings screen, hosting, a reconcile button, failure-state demonstrations, mandate
editing after confirmation, and any new backend route or field.

### 4.4 In scope and excluded from the current demo (deliverable B6)

| Keep in scope | Exclude from the current demo |
|---|---|
| AI drafting with human confirmation (labelled) | Disputes and the resolver (unresolved; CLAUDE.md §7) |
| Deterministic scenarios for allow, block and void | Webhooks, shipment tracking, refunds, reauthorization |
| Real sandbox authorize, capture and void | Reconcile and real failure-path demonstrations (stub-tested only [SA-02]) |
| AI shopping agent up to the pre-check (labelled) | The AI agent's cart shown captured, unless recorded first (finding 12) |
| Explanation and audit view | Claims of verifiable authorization or production readiness |
| Revoke, then void | Multi-user, accounts, multiple merchants, reusable budgets, AP2 |

---

## 5. Demo narrative (deliverable B4)

Target length: under 3 minutes [EV-01]. "Open with the problem and who it's for,
then show PayPal and AI working end to end. Cut loading screens and setup steps"
[G-02].

Each step is classed:
- **AI** = AI-generated proposal.
- **SCN** = deterministic scenario.
- **CODE** = deterministic Ostensia code, no PayPal call.
- **PP** = real PayPal Sandbox transaction.

| # | Step | Class | Precise wording |
|---|---|---|---|
| 0 | Title card: the problem (agents buy the wrong thing or more than intended [EV-28, EV-32]) and who it's for. **[H]** "For teams building AI shopping agents on PayPal" | n/a | State the audience as the intended user, not as validated demand |
| 1 | The person types an intention, for example "two sticker packs, matte only, under $5 total, this week". "Draft with AI" returns a draft with gaps and warnings | **AI** | "AI-generated draft. Nothing is created until you confirm." |
| 2 | The person fills the gaps and confirms. The mandate is created and its reference computed | **CODE** | "Mandate confirmed. A reference to it will be attached to the PayPal order for traceability." |
| 3 | Pick the scenario "compliant cart" and submit with settle | **SCN** → **CODE** (pre-check allows) → **PP** | First: "PayPal authorized the payment: the buyer's funds are **on hold**; no money has moved." Then, after the final check: "Payment **captured** in the PayPal Sandbox." Show the PayPal status, not invented figures |
| 4 | New mandate (single use). Scenario "wrong variant" or "over quantity" | **SCN** → **CODE** | "Blocked before PayPal was called. No order, no hold." Show the grouped reasons |
| 5 | New mandate. Compliant scenario authorized without settling, then "Revoke mandate", then "Settle" | **SCN** → **PP** (authorization) → **CODE** (final evaluation blocks) → **PP** (void) | "Authorization **voided** in the PayPal Sandbox; PayPal reports it as VOIDED, and nothing was captured. When the hold disappears from the buyer's available balance is up to PayPal and is not shown here." |
| 6 | New mandate. "Ask the AI agent" (uninformed mode): the agent proposes a cart and the pre-check evaluates it | **AI** → **CODE** | "AI-generated proposal. The agent is not trusted: the same deterministic rules decide." If the take is not blocked, re-record or omit; do not stage it [SA-17]. **Stop at the pre-check** unless an agent-cart sandbox run has been recorded (finding 12) |
| 7 | History and audit: the events for steps 3 to 6, with the explanation and the mandate reference | **CODE** (reads the app's own log) | "Ostensia's own audit record. The PayPal order carries only the total and the mandate reference, not the items." |
| 8 | Close: the positioning line (§4.2), with an honest one-liner on the landscape (finding 8) | n/a | "Card networks and AP2 cover limits and authorization records; Ostensia adds an item-level check before the PayPal capture." |

---

## 6. Judge-access architecture (deliverable B7; issue 8)

**[R] Recommended model.** Run locally from the README with the judge's own PayPal
sandbox app and vault, and an optional Anthropic key. Judging is video-led. No
hosting, no authentication and no credentials shared by the entrant.

**What it requires (Increment 8, documentation only):**
- README steps:
  - prerequisites (Node 24, pnpm);
  - create a free PayPal sandbox app;
  - create a vaulted sandbox buyer with the tracked Postman collection
    (`docs/evidence/paypal-lifecycle/ostensia-e1.postman_collection.json`, folders
    `01a` and `01b`; Report 00 L3);
  - fill in `apps/api/.env`;
  - optionally add an Anthropic key;
  - start the API and the web app.
- The README says plainly:
  - without PayPal credentials the API does not start (`apps/api/src/index.ts:21-26`);
  - without an Anthropic key the deterministic flow works and the AI buttons explain
    they are off (D-024).
- The Devpost testing-instructions field points to the README and the video.

**Why this model:**
1. **[F] It satisfies the rules.** "Your project does not need to be publicly hosted
   or deployed"; access can be "clear, complete setup and run instructions"; "If
   your submission requires special access, please include clear instructions for
   obtaining access within your repository's README" [EV-01].
2. **[F] It matches the official guidance.**
   - "Judges aren't required to run your project, so your video carries a lot of
     weight" [G-02].
   - "Hide your API keys. Use environment variables, never commit secrets" [G-03].
3. **[SA] It matches decisions already recorded.** D-013 (local-first) and D-024,
   which already records the requirement for "instructions that let a judge run the
   project with their own sandbox credentials and AI key"
   (`docs/DECISIONS.md:1553-1556`).
4. **[I] It adds nothing to the build.** No new code, infrastructure, authentication
   or secret handling. It respects CLAUDE.md §8.

**Alternatives considered:**

| Option | Why not chosen |
|---|---|
| **A2.** Entrant's sandbox-only PayPal credentials and vault id in the private Devpost testing field (rules allow it [EV-01]; organisers ask entrants to keep "test credentials" active [G-01]) | **[I]** Simpler for judges, but it means sending secrets to an external service, keeping them valid and private until 2026-12-21 [G-01], and revoking them afterwards. Sandbox credentials move no real money, but CLAUDE.md §8 treats credentials as server-only. **Acceptable as an optional supplement if the developer chooses it**; never in the repository. Never share an Anthropic key (it spends real money) |
| **A3.** Hosted demo behind a passcode | Adds hosting, a public bind instead of 127.0.0.1 (`config.ts:6`), a passcode or authentication, durable storage, and a spending cap for the AI key (Report 00 L2, L9, L11, L15). Unnecessary infrastructure one week from the deadline. D-013's revisit trigger (rules require hosting) has **not** fired [EV-01] |
| **A4.** A "no PayPal" mode so the API starts without credentials | Requires a backend change and risks presenting simulated payments as real (CLAUDE.md §6, §7). Not needed, because judges may judge from the video [G-02] |
| **A5.** Video only, no run instructions | Fails the rules: judges "must be able to actually run or interact with a working build" [EV-01] |

**[U] Residual risk.** A judge who tries to run the project must complete a manual
vault approval in the sandbox. That is friction, not non-compliance. **[I]** It is
mitigated by a clear README and a strong video.

---

## 7. Frontend/API integration (deliverable B8; issue 9)

**[R] Decision: use a Next.js rewrite (same-origin proxy), as already decided in
D-006.** The browser calls relative paths such as `/api/mandates`. `next.config`
rewrites `/api/:path*` to the local API, for example `http://127.0.0.1:4000/:path*`.

**Evidence:**
- [F] Next.js documents that "Rewrites act as a URL proxy and mask the destination
  path", and that "Rewrites allow you to rewrite to an external URL" (G-04, last
  updated 2026-09-28).
- [SA] D-006 chose this so that "no CORS setup is needed"
  (`docs/DECISIONS.md:320-322`).

**Consequences:**
- **CORS:** the browser only talks to its own origin, so no CORS support is needed.
  No `@fastify/cors` dependency and no API change.
- **Credentials:** the API has no authentication and the browser holds no secrets.
  PayPal and Anthropic secrets stay in `apps/api/.env` (D-006; CLAUDE.md §8).
- **Network exposure:** the API stays bound to `127.0.0.1` (`config.ts:6`). Only the
  Next.js server reaches it.
- **Configuration:**
  - `apps/web/.env.example` currently declares
    `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`. A `NEXT_PUBLIC_` variable is
    embedded in browser code and implies direct calls, which contradicts D-006
    (Report 00 C7).
  - [R] In Increment 7, replace it with a server-only variable (for example
    `API_ORIGIN=http://127.0.0.1:4000`) read in `next.config`. This is a file inside
    `apps/web/`, so it belongs to Increment 7 and is not a backend change.
- **[U] To verify in the Increment 7 proposal (not answered by G-04):**
  - whether the Next.js dev and production servers apply a timeout to proxied
    requests (AI calls are unmeasured [SA-17]);
  - how a rewrite behaves when the API is down (the UI must show a clear error).
- **Rejected alternatives:**
  - *Direct browser calls with CORS:* adds a dependency and an API change, and
    contradicts D-006.
  - *Next.js route handlers as a backend-for-frontend:* more code for no benefit;
    D-006 rejects policy or secrets in the web app.

---

## 8. Reconciling the reports: contradictions and label changes (preserved)

| # | Report statement | Conflicting evidence | Resolution in this review |
|---|---|---|---|
| X1 | Report 00 §11.1 and Report 04 F4-1 treat judge access as **undecided** | D-024 (`docs/DECISIONS.md:1553-1556`) already records "instructions that let a judge run the project with their own sandbox credentials and AI key" as an Increment 8 requirement. Reports 00 and 04 did not cite it | The recommended model (§6) **matches D-024**. A new decision is still needed for vault setup and the credential-sharing question |
| X2 | Report 04 F4-6 labels the README **CAN BE DEFERRED UNTIL INCREMENT 8**. Report 00 §11.1 ranks it **blocking/high** | G-01: submissions lock at the deadline | Both hold if Increment 8 finishes before 2026-11-12 12:00 PT. **The label stays; the deadline is hard** |
| X3 | Report 04 §4.2 presents sharing credentials in the Devpost field as an equal option | G-03 says "Hide your API keys... never commit secrets"; G-01 asks to keep "test credentials ... active" | Both are official. The rules permit sharing outside the repository. This review recommends not sharing by default (§6) |
| X4 | Report 01 §10.2 labels the audience **[R]** without **[H]**, and the P1 row reads as a conclusion | Report 01 §4.4 labels it [H]; no developer-demand evidence exists | **Treat it as [H] everywhere** (issue 1). Report 01 is not edited; this is recorded here |
| X5 | Report 03 F3-11: "a standard item-level evaluator is what is thin" (SHOULD INFLUENCE) | It rests on the AP2 site summary; the AP2 specification returned 404 [EV-15, register "not found"] | Keep the label but **lower confidence to Low-Medium**. Do not claim the industry lacks basket-level standards (issue 3) |
| X6 | Report 01 §10.5 risk 1: "Judges cannot run the payment path" | G-02: judges are not required to run it; EV-01 allows instructions | The risk is real for judges who *try*, but the submission is not ineligible. Mitigated by §6 |
| X7 | Task framing of the audience ("PayPal-powered AI shopping experiences") | Report 01 wording is narrower ("AI shopping agents that pay through PayPal") | This review uses the report's wording (§4.1) |
| X8 | The overview says "$67,500 in cash" and "$69,750 in total prizes" [EV-02] | G-03 repeats $69,750 | The difference is presumably the Render credits. Not material |
| X9 | Report 00 L1 and Report 04 do not mention the D-024 behaviour that the API runs without an AI key | `apps/api/src/index.ts:25-26`; `routes/draft.ts:24`, `routes/agent.ts:30` | Consistent with the code. The frontend must handle 503 `not_configured` (§4.3) |

---

## 9. Evidence gaps found in this review (not added to the register)

| ID | Source or claim | URL | Date | Type | Read |
|---|---|---|---|---|---|
| G-01 | "Keep your demo, test credentials, and any trials or credits active until winners are announced on Dec 21." "After the deadline, submissions are locked. Don't edit your repo, video, or linked materials until after the winner announcement." Checklist: hosted URL or run instructions; public repo "with a README and open source license" | https://paypalaihackathon.devpost.com/updates/47307-submission-checklist-it-s-go-time | Posted "about 5 hours" before 2026-11-05 21:36 UTC | Official organiser update | In full (curl) |
| G-02 | "Stage Two: judges score eligible projects 1 to 5 ... Judges aren't required to run your project, so your video carries a lot of weight." "Open with the problem and who it's for ... Cut loading screens and setup steps. An AI voiceover is fine." Stage One checks "a working build, a public repo with an open source license, a public video under 3 minutes, and meaningful use of PayPal and AI" | https://paypalaihackathon.devpost.com/updates/47306-lights-camera-paypal-video-tips-and-how-judging-works | About 2026-11-02 ("10 days to go") | Official organiser update | In full (curl) |
| G-03 | "Submit by Thursday, Nov 5 and our review team will check your project for eligibility early." "Make PayPal and AI impossible to miss. Name both in your description, 'Built With' section, and video." "Hide your API keys. Use environment variables, never commit secrets." | https://paypalaihackathon.devpost.com/updates/47305-two-weeks-to-go-get-your-project-checked-early | About 2026-10-29 ("Two weeks to go") | Official organiser update | In full (curl) |
| G-04 | Next.js: "Rewrites act as a URL proxy and mask the destination path"; rewriting to an external URL is supported. Proxy timeouts are not described | https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites | Last updated 2026-09-28 | Official framework documentation | In full |
| G-05 | Official FAQs: PayPal sandbox sign-up "options vary by country"; eligibility is in rules §3 | https://paypalaihackathon.devpost.com/details/faqs | Undated | Official | In full (curl) |
| G-06 | The official rules and overview were **re-verified** on 2026-11-05 21:36 UTC: the rules body is identical to the Report 04 copy | https://paypalaihackathon.devpost.com/rules ; https://paypalaihackathon.devpost.com/ | Pages undated | Official | In full (curl) |
| G-07 | Project record: D-024 already states the judge-access requirement | `docs/DECISIONS.md:1548-1556` | 2026-11-05 | Project record | In full |

---

## 10. Hackathon requirements re-check (issue 10)

Source: the official rules and overview, re-verified 2026-11-05 [EV-01, EV-02, G-06],
plus the official updates [G-01 to G-03].

| Requirement | Official text (abridged) | Ostensia status | Owner |
|---|---|---|---|
| Eligibility | Age of majority; excludes Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea and OFAC-sanctioned places; excludes sponsor and judge affiliates [EV-01 §3] | **[U]** Not assessed; a personal matter for the developer | Developer |
| Dates | Submissions close 2026-11-12 12:00 PT; judging 2026-12-01 to 12-15; winners about 2026-12-21 [EV-01 §1] | 7 days left | Increments 7 and 8 |
| PayPal and AI | "Meaningfully use both PayPal and AI"; name tools [EV-02]; make both "impossible to miss" [G-03] | Met [SA-01, SA-03] | Description and video |
| Functional demo | Run instructions OR hosted URL; no mockups [EV-01 §4] | Not yet: stale README [SA-15] | Increment 8 |
| Repository and licence | Public, all source and instructions, open-source licence visible in About [EV-01 §4] | Private; MIT decided (`docs/BUILD_STATUS.md:18`); publication review open (TD-001, TD-002) | Increment 8 |
| Testing access | Instructions plus credentials, or "instructions for obtaining access"; free and unrestricted until judging ends [EV-01 §4]; keep credentials active until 2026-12-21 [G-01] | Model in §6 | Increment 8 |
| Video | Under 3 minutes, public on YouTube, shows it functioning, no unlicensed third-party material [EV-01 §4] | Not made | Increment 8 |
| Lock | No edits to repo or video after the deadline until the announcement [G-01] | Plan to finish before 2026-11-12 | Increment 8 |
| Early check | Submissions by 2026-11-05 get an early eligibility check [G-03] | **[U]** Today; developer's choice whether to submit a draft | Developer |

---

## 11. Changes to Increment 8, demo hardening (deliverable B9)

**[R]** Add or confirm the following, all to be done **before 2026-11-12 12:00 PT**
[G-01]:
1. A README for the §6 access model. It should include:
   - run steps and the vault-setup path;
   - what is simulated, AI-generated or real;
   - the positioning (§4.2) and the limitations (§12).
2. Publication readiness:
   - make the repository public;
   - make the licence visible in the About section;
   - resolve the "Countersign" occurrences and the sanitization review (TD-001,
     TD-002; Report 00 §11.1).
3. Finding 12: either one recorded sandbox run of an AI-agent cart through
   authorize and capture (with evidence written up like `E2E_RESULTS.md`), or keep
   the video stopping at the pre-check.
4. Investigate the intermittent test failure before the repository is published
   (finding 30).
5. On recording day, check that the vault id still works (finding 29).
6. Record the video to the §5 narrative, with no loading screens [G-02].
7. Write the Devpost description: problem, audience **as a hypothesis**, PayPal APIs
   used, AI model used and how, and what is simulated [EV-02, G-03].
8. After submission, keep the sandbox app active until 2026-12-21 and make no
   repository edits until then [G-01].
9. Re-read the rules on the submission day; they "are subject to change" [EV-01].

---

## 12. Essential documentation changes (deliverable B10; proposals only)

None of these is applied. Each needs the developer's approval.
1. **`README.md`**: a full rewrite for Increment 8 (§11 item 1). It must include a
   **limitations disclosure**:
   - sandbox only;
   - simulated shop;
   - one configured buyer vault;
   - Ostensia acts as the merchant;
   - no authentication;
   - failure and reconcile paths not exercised against the real sandbox;
   - AI outcomes vary;
   - the hash is traceability, not proof;
   - void release timing is controlled by PayPal.
2. **A demo script file** containing the §5 narrative with the step classes.
3. **`docs/DECISIONS.md`**: D-026 (judge access) and D-027 (browser-to-API rewrite).
   Exact text is proposed separately.
4. **`docs/TECH_DEBT.md`**: new items, with exact text proposed separately:
   - the AI-agent cart never run through PayPal;
   - proposal source not recorded;
   - `stored_credential` and production vaulting unconfirmed;
   - void hold-release undocumented.
5. **`docs/research-summary.md` §3**: record the audience hypothesis, the "merchant-side
   flow" framing, and that the cited archive report is absent.
6. **`docs/BUILD_STATUS.md`**: the drift fixes listed in Report 00 Appendix C, plus
   the two pre-Increment-7 decisions.
7. **The official rules text**: store it with its URL and retrieval date (proposed in
   Report 00 Appendix C, still open).
8. **`apps/web/.env.example`**: replace `NEXT_PUBLIC_API_BASE_URL` with a server-only
   variable. This belongs to Increment 7 and is listed here for completeness.

---

## 13. Deferred items and post-hackathon backlog (deliverable B11)

**Deferred to Increment 8:** findings 12, 13, 16, 17, 29 and 30.

**Post-hackathon research backlog:**
1. Interview 5 to 10 teams building AI shopping agents about item-level mistakes,
   and whether they would integrate a pre-capture check. This tests the [H]
   audience (finding 3).
2. Look for willingness-to-pay signals and pricing benchmarks; none were found
   (finding 28).
3. Ask PayPal directly about:
   - `stored_credential` for wallet vaults;
   - production vetting;
   - consent requirements;
   - void hold-release timing;
   - whether buyers see Orders v2 vaults under automatic payments (EV-08, EV-11,
     EV-14).
4. Read the AP2 v0.2 specification and the Verifiable Intent specification once
   they are reachable (finding 26).
5. Revisit the merchant-side dispute-evidence thesis (PR-01).

**Post-hackathon product backlog (only with evidence of need):**
1. A merchant constraint and an approval threshold (findings 20 and 27).
2. Reusable mandates with cumulative and recurring budgets (finding 27).
3. Recording proposal provenance in the audit log (finding 11; TD-025).
4. Real sandbox failure-path observations and a real reconcile run (finding 18).
5. Signed mandates, or mapping to AP2 open and closed mandates (finding 26).
6. Line items on the PayPal order, so the PayPal record can corroborate the cart
   (SA-11).
7. Testing indirect prompt injection through untrusted catalogue text (finding 21).
8. Authentication, multi-user support and hosting, if Ostensia becomes a service
   (finding 1).

---

## 14. Go/no-go (deliverable B12) and final decision

**Question:** can Ostensia proceed to Increment 7 without changing its core backend
architecture?

**[R] Answer: Yes. GO, on two conditions that need records, not code:**
1. The developer records the **judge-access model** (proposed D-026: run locally
   with the judge's own sandbox credentials; video-led; no hosting, authentication
   or shared secrets by default).
2. The developer records the **browser-to-API route** (proposed D-027: confirm the
   D-006 Next.js rewrite; replace `NEXT_PUBLIC_API_BASE_URL` with a server-only
   variable as part of Increment 7).

**Evidence:**
- **No finding requires a backend change before Increment 7.** All 31 findings
  in §3 are labelled. The two MUST RESOLVE items are decisions. The SHOULD INFLUENCE
  items are UI copy, labels and scope. Everything else is Increment 8 or
  post-hackathon.
- **The architecture already supports the frontend:**
  - every endpoint the UI needs exists (Report 00 §4.1);
  - the API runs without an AI key (`apps/api/src/index.ts:25-26`);
  - simulated and AI responses are already labelled (Report 00 §10);
  - the rewrite needs no CORS (D-006; G-04).
- **The research validates the backend's central choices:**
  - deterministic evaluation outside the model [EV-33, EV-36];
  - authorize then capture or void [EV-07];
  - idempotent writes [EV-12];
  - the single-use, item-level mandate [EV-15, EV-18, EV-22].
- **The research challenges claims, not code:**
  - the merchant-side flow [EV-09];
  - the hash as traceability [EV-13];
  - the audience as a hypothesis;
  - the basket-level standards already existing [EV-15, EV-20].

**Smallest changes proposed:** none to backend code. Two decision records. One
`apps/web` configuration change inside Increment 7. Increment 8 additions in §11.

**What would change this answer:**
- the developer choosing a hosted demo (A3), which brings hosting, authentication
  and a public bind into scope;
- the rules changing to require hosting (D-013's revisit trigger);
- the Next.js proxy timeout proving too short for the AI calls. That would need a
  small, separately approved adjustment, still not an architecture change.

---

## 15. Limitations of this review

- **Self-review:** the reviewer wrote Reports 00 to 05 and most of the code.
- **Inputs:** all market and competitor evidence is desk research. Its confidence is
  inherited from the register, and no new market research was done.
- **Official pages:** these were re-verified by downloading HTML, because automated
  fetching is blocked. The update posts show relative dates only, and their absolute
  dates are inferred.
- **Not verified:** Next.js proxy timeouts, how judges actually behave, and any PayPal
  behaviour not already in the register.
- **Eligibility:** whether the developer is personally eligible was not assessed.

## 16. Conclusions

1. **[I] Keep the direction.** The backend architecture and the payment model stand.
2. **[R] Before Increment 7**, record two decisions: judge access (local run with
   the judge's own sandbox credentials; video-led) and the browser-to-API route
   (the D-006 rewrite).
3. **[R] In Increment 7**, build one linear, labelled, filmable flow that keeps
   three kinds of step visibly apart: AI proposals, deterministic scenarios and
   real PayPal Sandbox transactions. Use precise hold, capture and void wording.
4. **[R] In Increment 8**, make the repository runnable, public and honest, and
   record the video. All of it must be done before 2026-11-12 12:00 PT, after which
   the submission is locked.
5. **[H] The audience and the differentiation remain hypotheses.** They should be
   tested with agent builders after the hackathon.
