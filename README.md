# Ostensia

Ostensia is a work-in-progress project exploring purchasing-policy
enforcement for AI-assisted purchases.

## Current status

The repository is being established from the existing PayPal sandbox
spike. The application scaffold and end-to-end flow are not yet complete.

## Current hackathon scope

The initial MVP aims to:
1. Convert natural-language purchasing intent into a proposed mandate.
2. Allow the user to review and confirm the mandate.
3. Evaluate purchase compliance using deterministic server-side rules.
4. Gate the tested PayPal sandbox payment flow.
5. Record and explain the decision.

PayPal dispute automation is not yet demonstrated end-to-end and is
not a dependency of the initial MVP.

## Project context

- `CLAUDE.md`: implementation and comprehension-first rules.
- `docs/research-summary.md`: current product and research context.
- `docs/spike-findings.md`: existing PayPal sandbox test evidence.
- `docs/DECISIONS.md`: accepted technical and product decisions.
- `docs/TECH_DEBT.md`: known limitations and deferred work.

## Development instructions

Setup, run and test instructions will be added after the application
scaffold is approved and implemented. Do not treat the current repository
as a runnable application yet.