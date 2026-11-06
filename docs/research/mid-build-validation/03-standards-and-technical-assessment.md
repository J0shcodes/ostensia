# Ostensia: Standards, Security and Technical Assessment (mid-build validation, report 03)

**Status:** a research artefact. It is not a project decision.
**Research date:** 2026-11-05 (all sources accessed that day).
**Researcher:** Claude Code (model `claude-opus-5-5`).
**Covers:** Research 3; deliverable 3; the technical parts of deliverable 9;
priority questions P3 and P6.
**Labels:** [F] fact, [SA] self-audit, [I] interpretation, [H] hypothesis,
[R] recommendation, [U] unresolved. For P3, each item is also tagged
**DOC** (documented requirement), **OBS** (developer observation, sandbox) or
**ASM** (assumption). Evidence IDs refer to `05-evidence-register.md`.

---

## 1. Methodology

- I read current official PayPal developer pages where they were reachable [EV-07
  to EV-10, EV-12], plus the AP2 site and repository, the Visa Intelligent Commerce
  documentation, and OWASP via a secondary summary.
- I compared each implementation assumption recorded in Report 00 (A1 to A14,
  section 6) with what the documentation says.
- **Limitations:**
  - The official Orders v2 reference for `custom_id` was not opened (a schema mirror
    was used [EV-13]).
  - No official page was found on whether `stored_credential` applies to PayPal-wallet
    vault payments.
  - The production vetting claim exists only as an unattributed excerpt [EV-11].
  - No sandbox or production call was made in this research.

---

## 2. Standards landscape: classification

| Item | Classification | Status | Relevance |
|---|---|---|---|
| PayPal Orders v2, Payments, Vault | Vendor-specific implementation (production APIs) | Live [EV-07, EV-09] | The rails Ostensia uses |
| PayPal `PayPal-Request-Id` idempotency | Vendor-specific | Live [EV-12] | Duplicate safety |
| Card-on-file / MIT indicators (`stored_credential`) | Vendor implementation of card-network rules | Live for cards [EV-08] | See P3 |
| Visa Intelligent Commerce (instructions, mandates, passkeys) | Vendor-specific (network) | Documented APIs [EV-18] | Credential-level mandate model |
| Mastercard Agent Pay, Verifiable Intent | Vendor-specific; spec open-sourced | Announced 2026; integration "in coming months" [EV-20] | Verifiable authorization record |
| AP2 | **Emerging proposal**, moving to the FIDO Alliance | v0.2, pre-release; samples; no package yet [EV-15 to EV-17] | Mandates as signed credentials |
| ACP (OpenAI and Stripe), SPT | Vendor-led protocol | Live via Stripe; Instant Checkout withdrawn [EV-21, EV-34] | Token scoping |
| UCP (Google) | Vendor-led protocol | Launched January 2026 [EV-35] | Commerce orchestration; AP2 recommended |
| OWASP Top 10 for LLM Applications | Community security guidance | 2025 edition [EV-36] | Prompt injection, excessive agency |
| FIDO2 / passkeys | **Established standard** | Used in VIC consumer authentication [EV-18] | Possible future signer for mandates |

**[I] Is the purchasing mandate a meaningful missing layer?**
- It is **not missing as a concept**. AP2, Visa and Mastercard all now define a
  mandate-like object [EV-15, EV-18, EV-20].
- What is **thin** in the documented infrastructure is a standard *evaluator*: code
  that checks a concrete cart's items against the constraints and explains the
  result. AP2 specifies the credentials, not the evaluation [EV-15]. Visa evaluates
  amount, merchant and time at credential retrieval [EV-18].
- Ostensia's built component sits in that gap [SA-01].

**[R]** Do not adopt AP2 now. It is pre-release, has no published package, and its
field list was unverifiable [EV-15, EV-16]. Note it as the likely interoperability
target after the hackathon.

---

## 3. P3: Is the payment model credible outside the sandbox?

**[SA] The current model:**
- One merchant app holds a vaulted PayPal wallet (`vault_id`), created once through
  a manual buyer approval [SA-13].
- Each purchase creates an order with intent AUTHORIZE and the `vault_id`, with no
  separate authorize call. Capture or void follows [SA-01].
- `stored_credential` is not sent [SA-12].
- Only the total, `custom_id` and `invoice_id` are sent [SA-11].

| # | Topic | Finding | Tag | Evidence |
|---|---|---|---|---|
| 3.1 | Charging a saved PayPal wallet without the buyer present | Documented: after a one-time approval, a merchant can "charge a customer's saved PayPal account without requiring the customer to approve each payment" with `payment_source.paypal.vault_id` | **DOC** | EV-09 |
| 3.2 | Buyer consent | The merchant must "build a way to collect customer consent". PayPal shows its own approval once. The page gives no consent wording and no requirement beyond that | **DOC** (that it is required); content of the consent **[U]** | EV-09 |
| 3.3 | Ostensia's role | In this model **Ostensia is the merchant**: the vault is scoped to the app that saved it (example `usage_type: MERCHANT`). It is not a wallet an agent can spend at other merchants | **DOC** (`usage_type` in the example) + **[I]** | EV-09; SA-04 |
| 3.4 | Merchant-initiated indicators (`stored_credential`) | Documented for **card** payment sources (MERCHANT = "the merchant has established consent to charge the buyer"). Not documented for PayPal-wallet `vault_id`. Not sending it for a PayPal-wallet source is therefore **not contradicted**, but also not confirmed | **DOC** (cards only); for wallets **[U]** | EV-08; SA-12 |
| 3.5 | Risk data | RDA is required for **customer-initiated** transactions using PayPal or Venmo tokens, or they are "likely to be declined". Ostensia's purchases are merchant-initiated from the buyer's perspective, so whether RDA applies is **[U]** | **DOC** (for CIT) | EV-10 |
| 3.6 | Production enablement | Live vaulting requires enabling "Save payment methods" and the "PayPal and Venmo" toggle in the Live dashboard. Supported countries include the US | **DOC** | EV-10 |
| 3.7 | Production eligibility and vetting | "To go live, you'll need to be vetted to save PayPal Wallets", with eligibility statuses | **[U]**: the excerpt's source page is unidentified | EV-11 |
| 3.8 | Authorization hold | "An authorization places a hold on the funds and is valid for 29 days" | **DOC** | EV-07 |
| 3.9 | Honor period | Capture "within the 3-day honor period"; capture is "subject to risk and money availability". Reauthorization is possible after the honor period, with a new ID | **DOC** | EV-07 |
| 3.10 | 29-day expiry in the sandbox | Observed: authorization expiry 29 days after creation | **OBS** | SA-18 |
| 3.11 | Void releases the buyer's hold | A void endpoint exists. That a void releases the buyer's held funds, and how quickly, is **not documented** on the pages found | **OBS** (VOIDED status) + **ASM** (release) | EV-07; SA-01 |
| 3.12 | Capture after authorization through `vault_id` (no separate authorize) | Observed in the sandbox (order COMPLETED with one CREATED authorization) | **OBS** | SA-01 |
| 3.13 | Buyer revocation | Buyers can cancel automatic payments to a merchant in PayPal settings. Whether an Orders v2 vault appears there is unconfirmed | **DOC** (help page excerpt) + **[U]** | EV-14 |
| 3.14 | Sandbox equals production | No evidence either way. Risk decisions, funding and declines in production are unobserved | **ASM** | SA-02 |
| 3.15 | Failure and ambiguous outcomes | Not exercised on the real sandbox | **[U]** | SA-02 |

**Answer to P3:**
- **[I] Credible as a merchant-side model.** A merchant or platform that is the
  merchant of record charges a buyer's saved PayPal wallet under a confirmed
  mandate, holds the funds by authorization, and captures or voids after a
  deterministic check. Each step is documented [EV-07, EV-09] and was observed in
  the sandbox [SA-01].
- **[I] Not credible as described if the claim is "an AI agent paying any
  merchant".** The vault is tied to the merchant [EV-09].
- **[I] Production would need:**
  - live vaulting enablement [EV-10];
  - a consent experience the merchant designs [EV-09];
  - probably vetting [EV-11, unverified];
  - capture within 3 days, or a reauthorization strategy [EV-07];
  - observation of real failure paths [SA-02].

**[R]** In the demo and README, say that the demo app plays the merchant (or the
platform acting as merchant of record), and that in production the buyer would
consent once in PayPal.

---

## 4. Authorization, capture and agent decisions

- [F] Authorize-then-capture gives a window: the funds are held [EV-07] while a
  decision is made.
- [SA] Ostensia uses that window for a final evaluation against the mandate and
  the actual authorization state, before capture or void [SA-01].
- [I] This is sound for the policy story. The decision is made after the payment
  state is known, and nothing settles without a valid allow.
- [I] One documented constraint matters. Capture is honoured within 3 days [EV-07].
  The demo settles immediately (`settleNow`), which is fine. An abandoned attempt
  holds funds for up to 29 days unless voided [SA-18].

---

## 5. Idempotency, ambiguous outcomes and reconciliation

- [F] `PayPal-Request-Id` gives idempotency on POST. Reuse returns the earlier
  request's status. Concurrent duplicates may fail the second request. Retention is
  not stated generally [EV-12].
- [SA] Ostensia uses a deterministic request id per attempt and operation, does not
  retry writes automatically, records each write before sending it, and marks a
  write with no result as `unknown`, never `failed` [SA-01].
- [I] This is consistent with the documented behaviour.
- [U] Two gaps remain:
  1. **The key retention window.** A reconcile long after a crash may not be able to
     rely on replay. The design already reads state rather than replaying, per
     Report 00.
  2. **Reconcile has never run against real PayPal** [SA-02].

---

## 6. Prompt injection, structured output and runtime validation

- [F] OWASP 2025 ranks prompt injection first, including indirect injection through
  content the model reads, and lists excessive agency as LLM06 [EV-36].
- [F] In Microsoft's simulation, injected or persuasive content redirected agents'
  payments [EV-33].
- [F] A real agent made an unrequested purchase [EV-32].
- [SA] Ostensia's defences:
  - The agent has no tools.
  - Prices come from the catalogue in code, not from the model.
  - Every cart passes the deterministic gate [SA-03].
  - Structured output is not trusted for enums, so the project's own schema
    validation is the guarantee [SA-19].
  - In one run, an instruction hidden in a task was not obeyed, and the over-limit
    carts were blocked [SA-20] (one sample).
- [I] The design matches the guidance: the model can only *propose*, and
  enforcement is outside it. Product descriptions in the simulated catalogue are
  authored by the project, so indirect injection through untrusted catalogue text
  was **not tested** [U].
- [R] Say "the model can be fooled; the gate cannot be talked to", and do not claim
  the model resists injection on the strength of one sample.

---

## 7. Human confirmation and revocation

- [SA] A person confirms the mandate. Revoking it before settlement leads to a void
  [SA-01].
- [F] Comparable systems use human approval per purchase (Stripe Link [EV-23]),
  consumer authentication by passkey (Visa [EV-18]) and supervised-mode confirmation
  (Verifiable Intent [EV-20]).
- [I] Ostensia's confirmation is an application action with no authentication
  [SA-06]. It shows the user's intent inside the demo but proves nothing to a third
  party (see P6).

---

## 8. P6: What the `custom_id` hash does and does not prove

**What it is.**
- [SA] A SHA-256 hash of the canonical mandate is sent as `custom_id`, read back
  from PayPal, and compared at final evaluation [SA-10].
- [F] `custom_id` is a caller-provided external ID for reconciliation. It "appears
  in transaction and settlement reports but is not visible to the payer" [EV-13]
  (medium confidence; schema mirror).

**What it does:**
1. **Traceability.** It links a PayPal transaction to one specific mandate version
   in the application's records, and that link shows up in the merchant's PayPal
   reports [EV-13].
2. **Integrity check inside the application.** If the stored mandate changes, the
   hash no longer matches what PayPal echoes, and the gate refuses [SA-10].
3. **Recomputability.** Anyone given the exact canonical mandate JSON and the
   canonicalisation rule can recompute the hash and compare it with the value in
   the merchant's PayPal records.

**What it does not prove:**
1. **Who authorized.** It carries no signature and no key; the application operator
   can create any mandate and its hash.
2. **That the buyer saw or agreed to the terms.** The payer cannot see `custom_id`
   [EV-13], and there is no authentication [SA-06].
3. **That the purchased items matched the mandate.** PayPal receives no line items
   [SA-11], so the PayPal record cannot corroborate the cart.
4. **When the mandate was created**, beyond the PayPal transaction's own timestamp.
   There is no trusted timestamp of the mandate itself.
5. **Enforcement.** PayPal neither reads nor checks it [SA-10].

**Who could independently verify it?**
- [I] Only someone with access to the merchant's PayPal records **and** the mandate
  document, for example the merchant's auditor. They could confirm that the two
  match, not that the buyer authorized the mandate.
- [I] No external party verifies anything today.
- [F] By contrast, AP2 and Verifiable Intent use signed credentials that the
  merchant and network can verify [EV-15, EV-20].

**Answer:** [I] The hash provides application-level traceability and tamper
detection. It is not cryptographic proof of authorization.
[R] Describe it that way in the UI, the README and the video.

---

## 9. Technical risks that could invalidate the demo (deliverable 9, technical part)

1. **An untested path appears in the video.** The AI agent's cart has never gone
   through PayPal [SA-03]. Showing it captured would show an untested path unless
   it is run once before recording.
2. **Non-deterministic AI** produces a different cart or explanation on camera
   [SA-17]. Deterministic scenarios exist for the block and void [SA-04].
3. **Overclaiming.** "PayPal enforces the mandate" or "the hash proves
   authorization" would be false [SA-10, SA-11; EV-13].
4. **Sandbox-specific behaviour presented as production** (P3).
5. **Unmeasured latency** of AI and PayPal calls in a live demo [SA-17].
6. **A stale vault.** The vault's lifetime is unknown (Report 00, TD-009). A
   failure on recording day would block the payment path.

---

## 10. Findings and impact labels (this report)

| # | Finding | Impact label | Evidence |
|---|---|---|---|
| F3-1 | Vault-charge without the buyer present, the 29-day hold and the 3-day honor period are documented; the model is credible **as a merchant-side flow** | SHOULD INFLUENCE INCREMENT 7 | EV-07, EV-09; SA-01, SA-18 |
| F3-2 | Ostensia acts as the merchant; the demo must not imply that an agent can pay arbitrary merchants with this vault | SHOULD INFLUENCE INCREMENT 7 | EV-09; SA-04 |
| F3-3 | `stored_credential` is documented for cards only; omission for PayPal-wallet vault payments is unconfirmed either way | POST-HACKATHON PRODUCT OPPORTUNITY | EV-08; SA-12 |
| F3-4 | Production needs live vaulting enablement, a merchant consent UX and probably vetting (unverified); real failure paths are unobserved | POST-HACKATHON PRODUCT OPPORTUNITY | EV-09, EV-10, EV-11; SA-02 |
| F3-5 | Release of the hold on void is not documented on the pages found | CAN BE DEFERRED UNTIL INCREMENT 8 | EV-07 |
| F3-6 | Idempotency and `unknown`-not-`failed` handling are consistent with the PayPal documentation; key retention is not stated generally | NO CHANGE RECOMMENDED | EV-12; SA-01 |
| F3-7 | Prompt-injection posture (model proposes, deterministic gate decides, prices from code) matches OWASP and research guidance; injection through untrusted catalogue text is untested | NO CHANGE RECOMMENDED | EV-33, EV-36; SA-03, SA-19, SA-20 |
| F3-8 | The hash is traceability, not proof; UI and README wording must say so | SHOULD INFLUENCE INCREMENT 7 | EV-13; SA-10, SA-11 |
| F3-9 | AP2 and Verifiable Intent are the emerging verifiable-mandate formats; adoption now is not justified (pre-release) | POST-HACKATHON PRODUCT OPPORTUNITY | EV-15, EV-16, EV-17, EV-20 |
| F3-10 | Run an AI-agent cart through the real sandbox once before showing it captured in the video | CAN BE DEFERRED UNTIL INCREMENT 8 | SA-03 |
| F3-11 | The mandate as a concept is not missing from the infrastructure; a standard item-level evaluator is what is thin | SHOULD INFLUENCE INCREMENT 7 | EV-15, EV-18 |

---

## 11. Limitations

- No live API calls were made. Every PayPal behaviour statement comes from
  documentation or from the developer's earlier sandbox runs.
- Key PayPal facts rest on a schema mirror (EV-13) and an unattributed excerpt
  (EV-11).
- The AP2 specification text was unreachable (404). The site summary was used.
- OWASP was read through a secondary summary, and the 2026 edition was not checked.

## 12. Conclusion

- [I] The implementation's technical assumptions hold up against current
  documentation for what it claims: a merchant-side, sandbox, pre-capture policy
  gate.
- [I] The two corrections are to the *framing*: Ostensia is the merchant, and the
  hash is traceability. Neither needs code changes.
- [I] Production readiness and verifiable mandates are post-hackathon questions.
