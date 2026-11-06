# Ostensia: Problem and Audience Validation (mid-build validation, report 01)

**Status:** a research artefact. It is not a project decision and changes no
project record.
**Research date:** 2026-11-05 (all sources accessed that day).
**Researcher:** Claude Code (model `claude-opus-5-5`).
**Covers:** Research 1; deliverables 1 and 6; the audience parts of deliverable 8;
priority questions P1, P4 and P5. The final section holds the cross-cutting
conclusions: deliverables 8 to 11, the recommendation and the P1 to P8 table.
**Evidence:** IDs refer to `05-evidence-register.md`.

## Labels used

- **[F] Fact:** stated by a cited external source.
- **[SA] Self-audit:** what Ostensia currently does, from Report 00. It is not
  independent evidence.
- **[I] Interpretation:** the researcher's reading of the evidence.
- **[H] Hypothesis:** a claim that customer research could confirm or refute.
- **[R] Recommendation:** a suggestion for the developer. It is not a decision.
- **[U] Unresolved:** the evidence is insufficient.

Every finding also carries exactly one impact label:
MUST RESOLVE BEFORE INCREMENT 7 · SHOULD INFLUENCE INCREMENT 7 · CAN BE DEFERRED
UNTIL INCREMENT 8 · POST-HACKATHON PRODUCT OPPORTUNITY · NO CHANGE RECOMMENDED.

---

## 1. Methodology

1. I read Report 00 from disk first and checked the baseline facts against it
   (section 2).
2. I ran web searches across official documentation, vendor documentation, trade
   press and published surveys. Where a page could be fetched, I read the page;
   otherwise only the search excerpt is recorded, and the register marks that.
3. I looked for evidence of **problems and behaviour**: incidents, survey answers
   about control, and the controls products actually ship. I did not count growth
   forecasts as evidence of demand.
4. **What was not done:** interviews, customer conversations, pricing tests and
   analysis of usage data. This report is desk research only. It cannot establish
   willingness to pay.

**Limitations of the sources:**
- Most consumer surveys are sponsored by payments or consultancy firms, and they
  use different wording and samples, so their figures are not comparable [EV-28]
  to [EV-31].
- Several product claims are vendors describing their own products.
- No independent SMB or developer survey on this exact question was found
  (register, "not found").

---

## 2. Baseline check against Report 00

Each baseline fact the developer supplied was checked against Report 00.

| Baseline fact supplied | Report 00 | Result |
|---|---|---|
| Deterministic engine and PayPal adapter implemented | §16 item 1 [SA-01] | Consistent |
| Successful sandbox paths exercised | §5.2 [SA-01] | Consistent. **Flag:** these runs are developer-reported, and Report 00 marks them [D] (not observed by the auditor) |
| AI mandate drafting implemented | §3 [SA-03] | Consistent (2 runs x 4 prompts) |
| AI agent carts not sent through the full PayPal lifecycle | §2 item 3 [SA-03] | Consistent |
| Shop and scenarios simulated | §4.3 [SA-04] | Consistent |
| Next.js frontend not implemented | §3 [SA-05] | Consistent |
| Single sandbox vault, no auth or multi-user | §4.3, L2, L3 [SA-04, SA-06, SA-13] | Consistent |
| Single-use, USD-only mandate | A3, A14, L4 [SA-07, SA-08] | Consistent. **Nuance:** the mandate is consumed only by a capture; a blocked or voided attempt frees it |
| Hash is metadata binding, not a signature | §6, A6 [SA-10] | Consistent. Report 00 adds that PayPal receives **no line items** [SA-11] |
| Real failure and reconciliation paths not exercised | §5.3 [SA-02] | Consistent |
| Historical research report missing | C6 [SA-14] | Consistent. `docs/research-summary.md:8-12` still summarises the missing report's thesis [PR-01]. That thesis cannot be checked |

No baseline fact contradicts Report 00.

---

## 3. The problem being tested

**[SA]** Ostensia currently does five things [SA-01, SA-03, SA-09]:
1. It turns a natural-language intention into a structured mandate with AI.
2. A person confirms the mandate.
3. Deterministic code checks a proposed cart against it.
4. A compliant purchase is authorized and captured through PayPal.
5. A non-compliant purchase is blocked before PayPal is called, or voided after
   authorization if it becomes non-compliant.

**[H] Problem statement under test:** when software, and especially an AI agent,
buys on someone's behalf, the person or organisation needs the purchase held to
what they actually authorized. That means the right item, quantity and price,
within the budget and before the deadline. They also need an explanation when a
purchase is refused.

---

## 4. Findings by audience

### 4.1 Individual consumers delegating purchases to AI agents

**The purchasing problem.**
- [F] 60% of 1,000 US adults worry AI could spend more than they intended, and 58%
  worry it would buy the wrong item, size, colour or brand [EV-28].
- [F] A documented real case: OpenAI's Operator, asked to *find* cheap eggs,
  bought a dozen for $31.43 on a saved card without confirmation. OpenAI said it
  "fell short of its safeguards" [EV-32].
- [F] In a Microsoft and ASU simulation, prompt injection and persuasion redirected
  shopping agents' payments to manipulative sellers [EV-33].

**Consequences of mistakes.** These are small sums today [EV-32]. [F] Forbes
reports, citing S&P Global data, that more than 2 in 5 consumers would stop using
agents after one mistake [EV-30], which is low confidence. [I] For consumers the
cost of a mistake is mainly lost trust and the effort of a refund, not large
financial loss.

**Existing workarounds.**
- [F] Per-purchase approval is the dominant pattern. Stripe Link for agents makes
  the user approve each spend request [EV-23], and 70% of consumers want to review
  or override before purchase [EV-28].
- [I] The simplest substitute for a mandate is "ask me before you pay".

**Frequency and severity.** [U] There are no frequency data, and the incident
evidence is anecdotal (one high-profile case).

**Who experiences the problem, and who pays.** [I] The consumer experiences it.
There is no evidence that consumers would pay a separate party to solve it.
Controls arrive bundled in wallets and networks: Visa Intelligent Commerce mandates
[EV-18] and Stripe Link [EV-23].

**Demand for restrictions and approval.**
- [F] 70% want to review or override [EV-28].
- [F] 32% would let an agent decide within limits such as budget and brand, but
  would still approve before payment. Only 9% would let it complete purchases
  without final approval [EV-29].
- [F] Only 15% prefer delegated purchasing within categories or a monthly limit
  [EV-30] (low confidence).
- **Contradiction preserved:** one survey reports 69% "open" to purchases without
  approving each one [EV-31]. It is an outlier, from a single source, with
  unverified wording.

**Barriers and willingness-to-pay signals.** [F] 69% do not trust AI to process
payments securely, and 84% have never uploaded payment details to an AI tool
[EV-28]. [U] No willingness-to-pay signal was found.

**Assessment.** [I] The *concern* is well evidenced. The *behaviour*, autonomous
purchasing within pre-set rules, is a minority preference today (9% to 15%). The
gap that does exist (the wrong variant, too many items, over budget) is exactly
what Ostensia's item-level checks address.

### 4.2 SMBs delegating purchasing to employees or automated systems

**The purchasing problem.** [I] Controlling who may spend how much, where and on
what is an old and well-understood problem, served for human spend by corporate
cards and procurement tools.

**Existing solutions.**
- [F] Corporate card platforms already offer per-card merchant restrictions,
  spending limits and category blocks [EV-38].
- [F] Ramp now extends these to agents with "Agent Cards" (early access):
  - per-transaction, daily, monthly and per-project caps;
  - vendor or category locks;
  - approval routing for out-of-policy requests;
  - single-use tokens [EV-24].
- [F] Stripe Issuing for agents offers per-agent spend limits, merchant-category
  controls, custom authorization rules and single-task cards [EV-22].

**Consequences, frequency and severity.** [U] No independent data on agent spending
mistakes in SMBs was found. Ramp reports none [EV-24].

**Who pays.** [I] The finance function. It already pays for spend-management
platforms (no pricing verified).

**Demand evidence.**
- [F] Financial-services respondents: 33% allow "conditional autonomy" under
  guardrails [EV-37] (draft, low-medium confidence).
- [I] The strongest demand signal is that established vendors are shipping agent
  controls, which is evidence of the vendors' expectations, not of customer pain.

**Barriers.** [I] SMB spending runs on cards and invoices from many suppliers.
Ostensia's model has one merchant (the PayPal app owner) charging one saved PayPal
wallet [SA-04, SA-13]. It is not a spend-management system that sits across
suppliers.

**Assessment.**
- [I] Incumbents serve this audience for merchant, category and amount controls.
- [I] Ostensia's item-level checks (product, variant, quantity) are something card
  controls cannot see, because a card authorization carries a merchant and an
  amount, not a basket.
- [H] Whether SMBs need basket-level control for agent purchases is untested.

### 4.3 Developers and platforms building AI shopping or purchasing agents

**The purchasing problem.**
- [I] A platform that lets an agent buy must turn a user's stated limits into
  something the agent cannot exceed.
- [F] Prompting alone is not reliable. Agents can be manipulated by content they
  read [EV-33], and OWASP lists indirect prompt injection and excessive agency as
  top risks [EV-36].
- [SA] Ostensia's own smoke run shows this split: an agent that did not know the
  limits proposed over-limit carts, and the deterministic pre-check blocked them
  [SA-20]. That is one sample.

**Existing infrastructure.**
- [F] Credential-level scoping already exists:
  - Visa mandates: amount threshold, cumulative total, merchant and expiry [EV-18].
  - Stripe Shared Payment Tokens: business, amount and time [EV-21].
  - Stripe Issuing for agents: merchant category and limits [EV-22].
  - AP2 open mandates: budgets and constraints, as signed credentials [EV-15].
- [F] None of the PayPal agent pages reviewed describes buyer-side limits [EV-04,
  EV-05].

**Consequences.** [I] The platform carries the reputational and support cost when
its agent overspends [EV-32].

**Who pays.** [I] The platform or developer. That makes it a B2B buyer able to adopt
an API or library. [U] No pricing or willingness-to-pay evidence was found.

**Demand evidence.** [U] No survey of developers on this question was found.
[I] Indirect signals are:
- card networks and Stripe building mandate and limit primitives [EV-18, EV-21, EV-22];
- an emerging standard with "open" constraint mandates [EV-15, EV-17];
- several start-ups offering agent spending policies [EV-25, EV-26, EV-27].
These show that the *category* is real. They also show it is crowded.

**Barriers.**
- [I] Developers will expect the controls inside the payment credential (network
  or issuer enforced), not only in an application layer.
- [I] Ostensia's enforcement lives in the application that holds the PayPal
  merchant credentials [SA-01, SA-11].

**Assessment.**
- [I] This audience has the clearest technical need. It can integrate a
  deterministic check, and it maps directly onto what Ostensia already built: an
  API between an agent's proposed cart and payment capture.
- [I] It is also where competition from infrastructure providers is strongest
  (report 02).

### 4.4 Ranking and recommended beachhead (deliverable 6)

| Rank | Audience | Strength of problem evidence | Fit with what Ostensia already does | Main weakness |
|---|---|---|---|---|
| 1 | **Developers and platforms building PayPal-paid shopping agents** | Medium: manipulation [EV-33], the incident [EV-32], OWASP [EV-36], and vendors building primitives | High: an API that checks an agent's cart at item level before capture [SA-01, SA-03] | No developer demand data; credential-level controls exist elsewhere |
| 2 | Individual consumers (as end users of rank 1) | Medium for the concern [EV-28, EV-29]; low for delegated autonomy | Medium: the UI story (describe, confirm, see the block) is consumer-facing | Consumers prefer per-purchase approval; no willingness to pay |
| 3 | SMBs | Low (no independent data) | Low: one merchant, one wallet; no supplier spread | Well served by Ramp, Stripe and Brex [EV-22, EV-24, EV-38] |

**[R] Strongest initial beachhead:** developers and platforms that build AI
shopping agents on PayPal. The demo should show the *consumer's* experience,
because judges must see a real person's problem. It should describe Ostensia as
the *control layer such a platform would run*.

**[H]** This narrows the audience without changing the code. It is a hypothesis
until someone building an agent confirms the need.

---

## 5. P4: Is the single-use mandate model appropriate?

**[SA]** A mandate is consumed by one capture. Blocked or voided attempts free it
[SA-07].

**Evidence on how delegated-spending products are structured:**
- **Single-use and task-scoped:** Stripe single-task cards "invalidated after use"
  [EV-22]; Ramp single-use tokens [EV-24]; Visa single-use cryptograms within an
  instruction [EV-18]; AP2 "closed" mandates authorizing one specific checkout
  [EV-15].
- **Reusable with budgets:**
  - Visa mandates sum transactions across an instruction, and recurring
    frequencies are supported [EV-18].
  - Ramp offers daily, monthly and per-project caps [EV-24].
  - Stripe Issuing offers monthly limits [EV-22].
  - AP2 "open" mandates carry budgets for autonomous execution [EV-15].
  - Skyfire has period limits, not yet public [EV-25].
- **Time-bound:** every system reviewed has expiry (effectiveUntilTime [EV-18];
  SPT time limits [EV-21]). Ostensia already has expiry [SA-09].
- **What users want:** most consumers want approval per purchase [EV-28, EV-29];
  only 15% prefer category or monthly-limit delegation [EV-30] (low confidence).

**Answer:**
- [I] The market has both patterns. Single-use, task-scoped authorization is the
  common building block. Reusable budgets are layered on top, mainly for business
  and recurring use.
- [I] Ostensia's single-use mandate corresponds to a "closed" or task-scoped
  authorization with item-level detail, which matches the human-in-the-loop
  preference the consumer evidence shows.
- [R] No change for the hackathon. Reusable budgets and cumulative limits are a
  documented, evidence-backed extension for later.

---

## 6. P5: Are the mandate constraints sufficient?

**[SA] Current fields:** product identity, allowed variants, maximum quantity,
maximum unit price, maximum total, currency (USD) and expiry [SA-08, SA-09].

| Constraint | Who offers it | User evidence | Classification |
|---|---|---|---|
| Amount cap (total) | Everyone [EV-18, EV-21, EV-22, EV-24] | Overspending worry, 60% [EV-28] | **Has it**: essential |
| Expiry or time window | Visa, Stripe [EV-18, EV-21] | n/a | **Has it**: essential |
| Product, variant and quantity | AP2 closed checkout mandates carry the cart [EV-15]; card controls do not see items | 58% fear the wrong item, size, colour or brand [EV-28]; the Operator case is an unrequested item [EV-32] | **Has it**: Ostensia's most differentiated constraint |
| Unit price cap | Not seen in the card controls reviewed | Indirect | **Has it**: useful |
| Merchant identity or allowlist | Visa preferred merchant [EV-18]; SPT business scope [EV-21]; Ramp vendor lock [EV-24] | Not directly surveyed | **Missing.** Not needed for a one-shop demo [SA-04]; **essential** in any multi-merchant product |
| Category (MCC) | Stripe Issuing, Ramp [EV-22, EV-24] | Indirect [EV-30] | Useful future extension |
| Cumulative daily or monthly budget | Visa, Ramp, Stripe [EV-18, EV-22, EV-24] | 15% [EV-30] | Future extension (ties to P4) |
| Approval threshold (ask a human above X) | Ramp, Payman [EV-24, EV-26] | 70% want review or override [EV-28] | Future extension; the strongest user-backed one |
| Brand preference | Accenture's wording "budget and brand" [EV-29] | 58% (the brand fear) [EV-28] | Partly covered by product and variant allowlists |
| Delivery address, returns or refundability | Mentioned in AP2 discussions (not verified) | None found | Unnecessary complexity now |
| Multi-currency | n/a | None for the demo | Unnecessary now (deliberate MVP limit) |

**Answer:**
- [I] For the hackathon's single simulated shop, the existing fields are
  sufficient, and no essential constraint is missing.
- [I] Item-level fields are where Ostensia differs from credential-level controls.
- [I] The first essential addition for any real product is a **merchant
  constraint**. The best user-backed extension is an **approval threshold**.

---

## 7. Weaknesses in the product thesis (audience-related, deliverable 8)

1. **[I] Low appetite for autonomy.** Consumer appetite for autonomous purchasing
   is low: 9% to 15% [EV-29, EV-30]. A product built on pre-set mandates serves a
   minority behaviour today, although the concern behind it is common [EV-28].
2. **[I] "Ask me first" competes directly.** Per-purchase approval is a simpler
   substitute [EV-23, EV-28]. Ostensia's answer is that a confirmed mandate plus a
   deterministic check prevents the *wrong* purchase reaching the approval screen
   or capture. That has to be shown, not assumed.
3. **[I] No identified paying buyer.** Consumers do not pay for controls (they come
   bundled), SMBs are served by incumbents, and developer willingness to pay is
   unknown.
4. **[U] The thesis has drifted.** The original thesis (merchant-side evidence
   [PR-01]) and its research report are missing [SA-14]. The current build is a
   different, pre-capture control proposition.
5. **[I] The market signal is mixed.** OpenAI withdrew Instant Checkout in March
   2026, reportedly over low conversion [EV-34] (medium-low confidence). Agentic
   checkout volume may be smaller near term than forecasts suggest.

---

## 8. Findings and impact labels (this report)

| # | Finding | Impact label | Evidence |
|---|---|---|---|
| F1-1 | The concern about overspending, wrong items and loss of control is common and evidenced; autonomous delegation is a minority preference | SHOULD INFLUENCE INCREMENT 7 | EV-28, EV-29, EV-30, EV-31, EV-32 |
| F1-2 | The strongest beachhead is developers and platforms building PayPal-paid shopping agents, with the consumer as the demonstrated end user | SHOULD INFLUENCE INCREMENT 7 | EV-15, EV-18, EV-21, EV-22, EV-33, EV-36; SA-01, SA-03 |
| F1-3 | SMB agent purchasing is served by incumbents for merchant, category and amount controls; Ostensia does not fit the multi-supplier model | POST-HACKATHON PRODUCT OPPORTUNITY | EV-22, EV-24, EV-38; SA-04 |
| F1-4 | The single-use mandate matches task-scoped or "closed" authorization patterns; keep it | NO CHANGE RECOMMENDED | EV-15, EV-18, EV-22, EV-24; SA-07 |
| F1-5 | Reusable mandates with cumulative budgets and recurrence are a common, evidence-backed extension | POST-HACKATHON PRODUCT OPPORTUNITY | EV-18, EV-22, EV-24, EV-25 |
| F1-6 | The current constraints suffice for the demo; item-level constraints are the differentiator | NO CHANGE RECOMMENDED | EV-28, EV-32; SA-09 |
| F1-7 | A merchant constraint and an approval threshold are the first additions for a real product | POST-HACKATHON PRODUCT OPPORTUNITY | EV-18, EV-21, EV-24, EV-26, EV-28 |
| F1-8 | No willingness-to-pay evidence exists for any audience | POST-HACKATHON PRODUCT OPPORTUNITY | Register, "not found" |
| F1-9 | The origin thesis is unverifiable because the report is missing | NO CHANGE RECOMMENDED (for the build; record-keeping only) | SA-14, PR-01 |

---

## 9. Limitations

- Desk research only: no interviews, no usage data, no pricing evidence.
- The surveys are mostly sponsored and not comparable. One key figure (15%,
  [EV-30]) comes from a search excerpt of a page that returned 403.
- The incident evidence is a single high-profile case [EV-32] and a simulation
  [EV-33].
- Vendor product pages describe intended capability. Availability is often "early
  access" or "planned" [EV-22, EV-23, EV-24, EV-25].

---

## 10. Cross-cutting conclusions (consolidated from reports 01 to 04)

### 10.1 P1 to P8 answer table

| Q | One-line answer | Confidence | Impact label |
|---|---|---|---|
| **P1** Important problem? | Yes as a *concern*: overspending and wrong items are common worries, with a real incident and manipulation evidence. Willingness to pay is unproven, and autonomous delegation is a minority preference. Best framed for agent builders, with consumers as end users. | Medium | SHOULD INFLUENCE INCREMENT 7 |
| **P2** What does PayPal provide? | Merchant acceptance on AI surfaces (Agent Ready via ACP and UCP), catalogue sync, an MCP server and agent toolkit, vaulting, and authorize, capture and void. The pages reviewed describe no buyer-side mandate or spending policy. Verdict: Ostensia **complements** PayPal; it is not a duplicate. | Medium (based on what the documentation does not say) | SHOULD INFLUENCE INCREMENT 7 |
| **P3** Payment model credible outside the sandbox? | Partly. Charging a saved PayPal wallet without the buyer present is documented, as are the 3-day honor period and the 29-day hold. Production needs live vaulting enablement, a merchant-built consent flow and probably vetting. `stored_credential` is documented for cards only. Ostensia acts as the **merchant**, so the model fits "a merchant or platform charging a saved wallet under a mandate", not an agent paying arbitrary merchants. | Medium | SHOULD INFLUENCE INCREMENT 7 |
| **P4** Single-use mandate appropriate? | Yes for the hackathon: it matches task-scoped or "closed" authorizations. Reusable budgets are a later, evidence-backed extension. | Medium | NO CHANGE RECOMMENDED |
| **P5** Constraints sufficient? | Yes for a one-shop demo. Item-level fields are the differentiator. A merchant constraint and an approval threshold come first for a real product. | Medium | NO CHANGE RECOMMENDED |
| **P6** Does the hash have value? | Application-level traceability only. Anyone holding the mandate JSON can recompute it. It proves nothing about who authorized, is unsigned, is invisible to the payer, and PayPal gets no line items. It is not comparable to AP2 or Verifiable Intent signed credentials. | High | SHOULD INFLUENCE INCREMENT 7 |
| **P7** Competitive landscape? | Crowded at the credential level: Visa mandates, Stripe SPT and Issuing for agents, Ramp Agent Cards, AP2, Mastercard Verifiable Intent, and wallet start-ups. Ostensia's distinct element is a deterministic, explained, **item-level** cart check between agent and capture on PayPal rails, with authorize then capture or void. Redundancy risk is high for amount, merchant and time limits. | Medium | SHOULD INFLUENCE INCREMENT 7 |
| **P8** What does the hackathon need? | A working build judges can run (instructions) or use (hosted), sandbox credentials or instructions to obtain them, a public licensed repository, and a video under 3 minutes showing the flow end to end. Judges may judge on video alone. The single-vault local architecture meets the rules only with a decided judge-access path; that decision shapes the frontend. | High (rules read in full) | MUST RESOLVE BEFORE INCREMENT 7 |

### 10.2 Strongest initial audience (deliverable 6)

**[R]** Developers and platforms building AI shopping agents that pay through
PayPal. The demo shows the consumer's experience of that platform (section 4.4).

### 10.3 Credible differentiation hypothesis (deliverable 7; detail in report 02)

**[H]** "Ostensia is a deterministic, explainable purchase-policy check that sits
between an AI agent's proposed cart and the PayPal capture. It enforces item-level
limits (product, variant, quantity, unit price) that credential-level controls
cannot see. It uses authorize then capture or void, so the decision can include
the actual payment state."

### 10.4 Major weaknesses in the product thesis (deliverable 8)

1. Low consumer appetite for autonomous purchasing; "ask me first" is a simpler
   substitute (01 §7).
2. No paying buyer is identified (01 §7).
3. Credential-level controls from Visa, Stripe, Ramp and AP2 overlap the amount,
   merchant and time constraints (02).
4. Enforcement lives in the application holding the merchant credentials. It is
   not in the payment credential, and no third party can verify it (02, 03).
5. The mandate hash offers no independent proof (03).
6. The origin research is missing, and the original evidence thesis has drifted
   (01 §7).

### 10.5 Risks that could invalidate the current demo (deliverable 9)

1. **Judges cannot run the payment path.** A manual vault, credentials and no
   README exist today, and the rules require runnable access or a hosted URL
   [EV-01; SA-13, SA-15] (04).
2. **No frontend.** The "Design" criterion asks for a complete product experience
   [EV-01; SA-05] (04).
3. **The AI agent's cart has never gone through PayPal.** A video that shows it
   reaching capture would show an untested path [SA-03] (03, 04).
4. **Non-deterministic AI outcomes** in a recorded demo [SA-17] (03).
5. **Overclaiming the hash or "PayPal enforcement"**, which judges from PayPal will
   notice [SA-10, SA-11; EV-05] (03).
6. **"Innovation" scoring** if the pitch ignores AP2, Visa and Stripe controls
   [EV-01, EV-15, EV-18] (02).
7. **Intermittent test failure** if judges run the suite [SA-21] (04).

### 10.6 Findings deferrable until after the hackathon (deliverable 10)

- Reusable mandates and cumulative budgets (F1-5).
- Merchant, category and approval-threshold constraints (F1-7).
- SMB positioning (F1-3).
- Willingness-to-pay research (F1-8).
- Signed or verifiable mandates aligned with AP2 or Verifiable Intent (03).
- Production vetting, consent UX and `stored_credential` confirmation (03).
- Real failure-path observations beyond what the demo needs (03).
- The merchant-side dispute-evidence thesis (PR-01).

### 10.7 Recommendation

**[R] Make limited adjustments.** Keep the current product direction and
architecture. The adjustments are mostly about narrative and access, not code:

1. **Narrow the stated audience and use case** to "the control layer a PayPal-paying
   AI shopping agent platform runs", demonstrated through a consumer's flow
   (F1-2). The evidence supports the problem as a concern and does not support a
   broader claim.
2. **Position Ostensia as complementing PayPal** and, honestly, as overlapping
   credential-level controls elsewhere. Lead with item-level, explained, pre-capture
   checks (P2, P7).
3. **Decide judge access before Increment 7**, because it determines what the
   frontend must do (P8).
4. **Describe the hash as traceability, not proof** (P6).

**Grounds:** the evidence does not invalidate the problem [EV-28, EV-32, EV-33]. It
does show strong infrastructure competition [EV-18, EV-21, EV-22, EV-24, EV-15] and
low autonomy demand [EV-29, EV-30]. Neither finding requires discarding the
implemented gate. Both change how it is framed and to whom.

Not recommended: reconsidering a fundamental assumption, or adopting AP2 or another
protocol now. The evidence does not show that either would improve the hackathon
outcome, and AP2 is pre-release [EV-15, EV-16].
