# Ostensia: Competitor and Substitute Analysis (mid-build validation, report 02)

**Status:** a research artefact. It is not a project decision.
**Research date:** 2026-11-05 (all sources accessed that day).
**Researcher:** Claude Code (model `claude-opus-5-5`).
**Covers:** Research 2; deliverable 2; the differentiation hypothesis (deliverable 7);
priority questions P2 and P7.
**Labels:** as in report 01. [F] fact, [SA] self-audit, [I] interpretation,
[H] hypothesis, [R] recommendation, [U] unresolved. Evidence IDs refer to
`05-evidence-register.md`.

---

## 1. Methodology

- I looked for products and protocols in five areas: agentic commerce, payment
  controls and virtual cards, procurement, agent authorization standards, and
  agent security.
- I preferred official documentation. Where only a vendor blog or aggregator was
  available, the register marks it. Hands-on testing of any competitor was **not**
  possible.
- Each product is described by what its documentation says it does today, kept
  separate from what it says is planned.
- **Limitation:** several pages were seen only as search excerpts (Stripe Issuing
  for agents, Skyfire, Mastercard). No pricing was verifiable for any agent-control
  product.

---

## 2. What PayPal already provides (P2)

| PayPal capability | What it does | Buyer-side purchasing controls? | Evidence |
|---|---|---|---|
| **Agent Ready** | Lets PayPal and Braintree merchants accept payments from AI assistants: ACP for ChatGPT (delegated tokens via Braintree); UCP for Google AI Mode and Gemini (Braintree, or Orders v2). Fraud detection, buyer protection and disputes are included | **None described** | [F] EV-04, EV-05 |
| **Store Sync** | Puts merchant catalogues on AI channels and routes orders to fulfilment | None | [F] EV-04 |
| **MCP server and Agent Toolkit** | Lets agents call PayPal APIs | Not verified; the tool list was not read | [F] EV-06 (medium) |
| **Vault (save PayPal)** | One-time buyer approval; the merchant later charges `vault_id` without the buyer present; the merchant builds the consent mechanism | None beyond merchant-side consent | [F] EV-09 |
| **Orders and Payments (authorize, capture, void)** | Authorization holds funds; 3-day honor period; 29-day validity; reauthorization | No policy logic; that is the caller's job | [F] EV-07 |
| **Buyer automatic-payment management** | The buyer can cancel a merchant's automatic payments in PayPal settings | Revocation only, not limits | [F] EV-14 (medium-low; not confirmed for Orders v2 vaults) |

**[SA]** Ostensia uses the last two rows: a vaulted `vault_id` order with intent
AUTHORIZE, then capture or void [SA-01]. It sends no line items [SA-11].

**Verdict on P2: complements.**
- [I] The PayPal surfaces reviewed help a *merchant* accept agent-initiated payments
  and protect the *buyer* after the fact (buyer protection, disputes) [EV-04]. None
  describes a buyer-defined, pre-capture check of an agent's cart against limits
  [EV-04, EV-05].
- [I] Ostensia adds that check above PayPal's payment primitives.
- [U] Confidence is medium. The conclusion rests on what the documentation does not
  say, and PayPal may run internal risk rules that are not public. Agent Ready's
  "fraud detection" is a merchant and risk control, not a buyer mandate [EV-04].
- [I] Outside PayPal, the same need is increasingly met *at the credential level*
  by networks and issuers (section 3). On PayPal rails specifically, Ostensia fills
  a gap. In agentic commerce generally, it partly duplicates other providers.

---

## 3. Landscape (P7)

### 3.1 Categories

| Category | Members | Relation to Ostensia |
|---|---|---|
| **Direct, or nearest to direct:** deterministic spending policy plus payment enforcement for agents | Ramp Agent Cards [EV-24]; Stripe Issuing for agents [EV-22]; Visa Intelligent Commerce mandates [EV-18]; Payman [EV-26]; Skyfire limits [EV-25]; agent-wallet policy engines such as Privy [EV-27] | Same job (stop an agent exceeding limits), done at the **credential or issuer** level with amount, merchant, category and time limits |
| **Authorization-evidence standards** | AP2 open and closed mandates [EV-15, EV-17]; Mastercard Verifiable Intent [EV-20] | Same concept as a "mandate", as **signed, verifiable credentials**; no evaluation engine prescribed |
| **Agentic checkout protocols and merchant acceptance** | OpenAI and Stripe ACP with SPTs [EV-21]; Google UCP [EV-35]; PayPal Agent Ready [EV-05] | Adjacent: they move the payment; limits only through token scope |
| **Agent identity** | Visa Trusted Agent Protocol [EV-19]; Skyfire KYAPay [EV-25] | Adjacent: who the agent is, not what it may buy |
| **Substitutes** | Per-purchase human approval (Stripe Link for agents [EV-23]; consumer preference [EV-28]); corporate card controls for human spend [EV-38]; procurement approval workflows | Simpler ways to avoid unwanted purchases |
| **Agent security guidance** | OWASP LLM01 and LLM06 [EV-36]; Microsoft's "supervised autonomy" [EV-33] | Supports deterministic controls outside the model |

### 3.2 Comparison matrix

Key: **Y** = documented; **P** = partial or planned; **N** = not documented;
**?** = unknown. "Doc" gives the evidence ID. Ostensia's column comes from
self-audit only.

| Capability | Ostensia [SA] | Visa VIC mandates | Stripe SPT / Issuing for agents / Link | Ramp Agent Cards | AP2 | Mastercard Verifiable Intent | PayPal Agent Ready | Payman / Skyfire / Privy |
|---|---|---|---|---|---|---|---|---|
| Natural-language instructions converted to constraints | **Y** (AI draft, human confirms) [SA-03] | N | N | N | P: the open mandate captures "goals" [EV-15] | ? | N | N |
| Structured purchasing constraints | **Y**: product, variant, quantity, unit price, total, expiry [SA-09] | Y: amount, cumulative, merchant, time [EV-18] | Y: business, amount, time; MCC, limits [EV-21, EV-22] | Y: amounts, periods, vendors, categories [EV-24] | Y: open mandates (budget, constraints) [EV-15] | P: records what was authorized [EV-20] | N [EV-05] | Y: amounts, periods, allowlists [EV-25 to EV-27] |
| **Item-level (SKU, variant, quantity) checks** | **Y** [SA-09] | N (merchant and amount) [EV-18] | N (card or MCC level) [EV-22] | N (vendor or category) [EV-24] | P: the closed mandate binds a specific cart [EV-15] | P: basket approval in supervised mode [EV-20] | N | N (wallets: recipients, amounts) |
| Deterministic policy evaluation | **Y** (domain code) [SA-01] | Y: at credential retrieval [EV-18] | Y: issuer authorization rules [EV-22] | Y: real-time policy check [EV-24] | ? (no engine prescribed) | N | N | Y (vendor claims) |
| Payment execution and enforcement | Y: authorize, then capture or void, on the PayPal sandbox [SA-01]; enforced **in the application** | Y (network credential) | Y (issuer or token) | Y (issuer) | P: depends on the implementer | P: via Agent Pay | Y (merchant acceptance) | Y (wallet or ACH) |
| Human approval and override | P: human confirms the mandate; revoke before settlement [SA-01]; no per-purchase approval step | P: consumer authentication [EV-18] | Y: Link approves each spend [EV-23] | Y: approval routing [EV-24] | Y: human-present flows [EV-15] | Y: supervised mode [EV-20] | ? | Y: approval thresholds [EV-26] |
| Auditability and explanations | Y: append-only audit log; plain-language block reasons [SA-01] | P: transaction data | P: dashboard and webhooks [EV-21] | P: dashboard [EV-24] | Y: chained mandates as audit trail [EV-15] | Y: "tamper-resistant record" [EV-20] | P: disputes and buyer protection [EV-04] | P: logs |
| Third-party verifiable authorization record | **N** (unsigned hash in `custom_id`) [SA-10] | P: agent signatures, passkeys [EV-18] | ? | ? | **Y** (Verifiable Digital Credentials) [EV-15] | **Y** [EV-20] | N | P: Privy "cryptographic" [EV-27] |
| Developer integration | P: local HTTP API, no SDK, no auth [SA-06] | Y (APIs, mTLS) | Y | P (early access) | P: samples, no package yet [EV-16] | P: open-source spec [EV-20] | Y | Y |
| Target customers | Hypothesis: agent builders (report 01) | Agent platforms, issuers | Businesses and AI platforms | Ramp business customers | Agent, merchant and payment ecosystem | Ecosystem | PayPal and Braintree merchants | Developers |
| Pricing (verifiable) | n/a | **Not found** | **Not found** for agent products | **Not found** | Open | Open | **Not found** | **Not found** |

### 3.3 What Ostensia offers that the others do not (from documentation reviewed)

1. **[I] Item-level policy before capture.** It checks product, variant, quantity
   and unit price in a deterministic check. Card and issuer controls see merchant,
   category and amount, not the basket [EV-18, EV-22, EV-24]. AP2's closed mandate
   *binds* a cart, but no evaluation engine is specified [EV-15].
2. **[I] Natural language to a confirmed, structured mandate**, with gaps and
   warnings shown before confirmation [SA-03]. No competitor reviewed documents
   this step.
3. **[I] Authorize, then decide, then capture or void**, using the actual
   authorization state, plus a plain-language explanation and an append-only audit
   log [SA-01].
4. **[I] On PayPal rails specifically**, where no buyer-side mandate was found
   [EV-05].

### 3.4 What alternatives already do better

1. **[F/I] Enforcement in the credential.**
   - Visa refuses to issue a credential outside the mandate [EV-18].
   - Issuers decline out-of-policy authorizations [EV-22, EV-24].
   - Ostensia's limits hold only if every purchase goes through Ostensia's
     application, because it holds the merchant credentials [SA-01, SA-11].
2. **[F] Verifiable evidence.** AP2 and Verifiable Intent produce signed
   credentials that the merchant and network can verify [EV-15, EV-20]. Ostensia's
   hash cannot be verified independently [SA-10].
3. **[F] Reusable budgets, recurring use, merchant and category locks**
   [EV-18, EV-22, EV-24].
4. **[F] Scale, distribution and dispute handling** [EV-04, EV-05].

### 3.5 Where Ostensia risks being redundant

- **[I]** Amount, expiry and merchant limits: already standard in networks and
  issuers.
- **[I]** "A record of what the user authorized": AP2 and Verifiable Intent are
  becoming the standard form for this, under FIDO governance [EV-17]. A proprietary
  hash in `custom_id` would not compete with them.
- **[I]** Consumer per-purchase approval: Stripe Link [EV-23].

---

## 4. Differentiation hypothesis (deliverable 7)

**[H] Hypothesis.** For teams building AI shopping agents that pay through PayPal,
Ostensia is the deterministic, explainable check that sits between the agent's
proposed cart and the PayPal capture. It enforces the item-level terms a person
confirmed (product, variant, quantity, unit price, total, expiry), which
credential-level controls cannot see. It uses authorize then capture or void, so
nothing settles until the cart, the mandate and the actual payment state agree.

**What would make it credible (evidence required):**
- Agent builders confirm that item-level mistakes (wrong variant, extra quantity)
  matter enough to integrate a check. **[U] not yet evidenced.**
- PayPal does not provide the same check. **[F] not documented today** [EV-05].

**What would refute it:**
- Networks or issuers adding SKU-level data to authorization.
- AP2 or UCP implementations shipping a standard cart-against-mandate evaluator.
- PayPal adding buyer mandates to Agent Ready.

**[R] Implication for the pitch:** say plainly that Visa, Stripe, Ramp and AP2
provide credential-level limits and verifiable authorization. Then show the
item-level block (for example, the wrong variant or an over-quantity cart) that
those limits would allow through. The Innovation criterion asks whether "the
project differ[s] from existing concepts" [EV-01].

---

## 5. Contradictory evidence and unresolved points

- **Stripe Issuing for agents availability:** one source says private preview,
  another says available [EV-22].
- **Ramp Agent Cards** is "early access", with no adoption figures [EV-24].
  **Skyfire** limits are "not yet publicly available" [EV-25]. Several "competitors"
  are therefore not generally available.
- **AP2 terminology changed.** Earlier materials use Intent, Cart and Payment
  mandates; the current site uses Checkout and Payment mandates, each with open
  and closed stages [EV-15]. The v0.2 field list was not verified (spec URL 404).
- **Crossmint's controls** are described inconsistently in secondary sources, as
  cryptographic or as billing policy (search excerpt only; not registered as
  evidence).
- **PayPal's internal risk controls** for agent transactions are not public [U].
- **No pricing** was verifiable for any agent-control product [U].

---

## 6. Findings and impact labels (this report)

| # | Finding | Impact label | Evidence |
|---|---|---|---|
| F2-1 | PayPal's documented agentic offerings help merchants accept agent payments; none describes buyer-side mandates; Ostensia **complements** PayPal | SHOULD INFLUENCE INCREMENT 7 | EV-04, EV-05, EV-06, EV-09 |
| F2-2 | Credential-level limits (amount, merchant, time, category) are widely offered elsewhere; Ostensia is redundant on those dimensions | SHOULD INFLUENCE INCREMENT 7 | EV-18, EV-21, EV-22, EV-24, EV-25 to EV-27 |
| F2-3 | Item-level, explained, pre-capture evaluation on PayPal rails is the distinct element found | SHOULD INFLUENCE INCREMENT 7 | EV-05, EV-18, EV-22, EV-24; SA-01, SA-09 |
| F2-4 | AP2 and Verifiable Intent are becoming the standard form for verifiable authorization records; Ostensia's hash does not compete with them | SHOULD INFLUENCE INCREMENT 7 | EV-15, EV-17, EV-20; SA-10 |
| F2-5 | Enforcement in the application, not the credential, is a structural weakness against issuer and network controls | POST-HACKATHON PRODUCT OPPORTUNITY | EV-18, EV-22; SA-01, SA-11 |
| F2-6 | Expressing Ostensia mandates as, or alongside, AP2 open and closed mandates is a possible later direction; AP2 is pre-release | POST-HACKATHON PRODUCT OPPORTUNITY | EV-15, EV-16, EV-17 |
| F2-7 | No change to the architecture is justified by the competitive landscape | NO CHANGE RECOMMENDED | All of the above |

---

## 7. Limitations

- No hands-on testing of any product, and no verified pricing.
- Three key sources were seen only as excerpts (EV-20, EV-22, EV-25).
- The landscape changes quickly. Several items are dated 2026 and are early-access.
- The PayPal conclusion is based on what public documentation does not say.

## 8. Conclusion

- [I] Ostensia is not unique in "limiting what an agent can spend". It is distinct,
  on the evidence reviewed, in checking the *cart's items* against a person-confirmed
  mandate before a PayPal capture, and in explaining the decision.
- [R] Present it as complementing PayPal and honestly positioned next to Visa,
  Stripe, Ramp and AP2. No architectural change is indicated.
