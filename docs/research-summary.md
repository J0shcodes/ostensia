# Ostensia Research Summary

Last updated: 2026-10-29
Purpose: Current build context for Claude Code.

## 1. Product thesis and status

The original desk-research report selected Ostensia, then described
as "Intent-to-Representment." Its primary thesis was that an AI purchase
should carry a durable record of what the human authorized, so that
a merchant or developer can use that intent to make fair purchasing
and post-purchase decisions.

The report's original plan depended on a full PayPal dispute-resolution
workflow. The October 28, 2026 spike did not prove that workflow.

Current decision for the hackathon:
Prioritize the pre-capture purchasing-policy gate as the working
end-to-end product. Keep dispute resolution outside the critical path.
Any dispute simulation must be labelled as a simulation.

This is a scope decision based on implementation evidence. It does not
prove that the original post-purchase business thesis is invalid.

## 2. Current MVP flow

1. User describes a purchase in natural language.
2. AI proposes a structured mandate.
3. User reviews and confirms the mandate.
4. Server-side deterministic code evaluates the proposed purchase
   against the confirmed mandate.
5. A compliant purchase proceeds through the tested PayPal sandbox flow.
6. A non-compliant purchase is blocked from capture; its authorization
   is voided only when the actual payment state permits it.
7. The application displays a decision explanation and audit record.

AI may interpret intent and explain outcomes. It must not decide
whether a hard price, currency, quantity, product-variant or expiry
constraint is satisfied.

A mandate hash can bind or reference mandate data. The hash does not
enforce the purchasing policy.

## 3. Market and differentiation status

The historical research proposed merchant-side evidence for AI-agent
purchases as the primary differentiation hypothesis. It also explored
consumer purchasing controls and developer infrastructure.

The initial target segment and willingness to pay remain hypotheses.
Desk research is not customer validation.

Do not claim Ostensia is unique, market-validated, production-ready
or attractive to a specific acquirer without supporting evidence.

Revisit the relationship between pre-purchase policy enforcement and
post-purchase dispute evidence after the hackathon. Do not build both
as full products in the MVP.

Mid-build validation (2026-11-05, docs/research/mid-build-validation/):
- Working audience hypothesis: developers and platforms building AI shopping
  agents that pay through PayPal, with the consumer as the demonstrated end user.
  It rests on product fit, not on willingness-to-pay or developer-demand evidence.
- In the PayPal flow Ostensia acts as the merchant: it charges a buyer's saved
  PayPal wallet that was approved once for this merchant. It does not let an agent
  pay other merchants with that wallet.
- The mandate hash in custom_id is application-level traceability, not proof of
  the buyer's identity, consent or authorization.
- Other initiatives address authorization at the basket level, at different
  stages of maturity. AP2 is an open protocol at a pre-release version (v0.2),
  being moved to the FIDO Alliance; its checkout mandates bind a specific cart.
  Mastercard Verifiable Intent is a specification Mastercard announced and
  open-sourced in March 2026; its integration into Agent Pay was described as
  coming (seen only in excerpts). Neither was tested here, and how widely either
  is deployed was not established.
- What Ostensia currently implements is a deterministic check of a cart's items
  against a person-confirmed mandate before the PayPal capture, in its own sandbox
  merchant flow. Whether that is distinctive in the market is a hypothesis, not a
  finding.

## 4. Existing integration evidence

The October 28 spike supports the tested vault, authorization,
custom_id round-trip, capture, void and tracking flows.

The dispute-creation API path and desired seller dispute actions remain
unresolved. See docs/spike-findings.md for exact evidence and caveats.

Do not re-run the entire exploratory spike by default. Investigate
only questions that block an approved implementation increment.

## 5. Technical direction

Preferred starting point:
- Next.js App Router and TypeScript for the frontend.
- Node.js 24 LTS and TypeScript for the backend runtime.
- One Fastify API process for the MVP.
- A separate pure TypeScript domain module for mandate validation
  and deterministic policy evaluation.
- A PayPal adapter for provider-specific operations.
- A small audit/persistence module, with the database choice confirmed
  during plan-first architecture review.
- One AI provider integration with validated structured output.

This is a proposed minimal direction, not permission to scaffold
the complete architecture without review.

Do not split Gate, Resolver and Harness into separate services now.
Do not add AG Studio, multiple payment providers, an agent framework,
a database/ORM or other infrastructure without a clear MVP reason
and explicit approval.

## 6. Hard constraints

- Read docs/spike-findings.md before planning PayPal integration.
- Do not represent simulated dispute operations as real PayPal actions.
- Never capture when policy evaluation is invalid or unknown.
- Inspect actual PayPal order/authorization state before deciding
  which payment operation is permitted.
- Handle duplicate requests and ambiguous timeouts deliberately.
- Keep PayPal secrets on the server.
- Do not include real Postman environment values or raw test identifiers
  in committed examples.
- Follow the comprehension-first workflow in CLAUDE.md.

## 7. Hackathon requirements

Official rules:
https://paypalaihackathon.devpost.com/rules

Official overview:
https://paypalaihackathon.devpost.com/

Deadline: November 12, 2026, 12:00 p.m. Pacific Standard Time
(20:00 UTC; 21:00 Nigeria time).

The project must meaningfully use PayPal and AI and provide a working
demonstration. Submission requirements include a public repository
with an open-source license and a public YouTube demo under three minutes.
Verify all requirements against the current official rules before submission.

Re-checked 2026-11-05: judge access is decided in D-026, accepted 2026-11-06 (a
local run with the judge's own sandbox credentials; no credentials distributed),
pending its clean-clone verification. Organiser updates say judges are not required to
run projects, test credentials must stay active until 2026-12-21, and
submissions are locked after the deadline.

Participant eligibility (Official Rules section 3) is a separate matter from
judge access and technical readiness. Resolved 2026-11-06 by the developer's own
assessment that they meet all the criteria; no organiser confirmation was sought
or received. The organiser keeps the sole right to determine eligibility
(section 6) and verifies a winner before paying a prize (section 8).

## 8. Source precedence

This summary and docs/spike-findings.md are the concise current build
context. They do not replace actual test results or official API contracts.

The historical report at
docs/research/archive/PayPal-AI-Hackathon-Research-2026-10-02.md
is background, not an implementation specification.
That file is not in the repository (Report 00, C6). Its contents cannot be
checked.

If a historical claim, an assumption or this summary conflicts with
reproducible test evidence or current official documentation, stop and
report the discrepancy before changing the implementation.