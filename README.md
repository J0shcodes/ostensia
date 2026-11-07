# Ostensia

Ostensia is a purchasing-authorization layer for AI-assisted purchasing. A person states what
an AI agent may buy; Ostensia turns that into a confirmed **mandate**; and before any money is
captured, deterministic server-side code checks the agent's proposed cart against the mandate.
A compliant cart can be captured through PayPal Sandbox. A cart that breaks the mandate cannot
be captured, and a payment already on hold is voided. Every step is written to an audit log
that the person can read.

Built for the PayPal AI Hackathon. **This is a sandbox demo: no real money moves, the shop is
simulated, and it is not a production system.**

## What is real and what is simulated

| Part | Status |
|---|---|
| PayPal authorization, capture and void | **Real PayPal Sandbox API calls**, using the sandbox buyer's saved (vaulted) payment method. |
| The mandate check and the final check | Real, deterministic code in `packages/domain`. No AI decides anything. |
| The audit log | Real: an append-only file the API replays on start. |
| The shop and its catalogue | **Simulated.** Ostensia acts as the merchant. Every screen that shows it is labelled. |
| AI mandate drafting and the AI shopping agent | Real calls to Anthropic's API, **optional**. They only propose; the AI never approves a purchase. |
| Disputes, webhooks | Not part of this demo. They were not demonstrated end to end, and nothing in the app claims otherwise. |

## How it works

```
 person ──► web app (Next.js, :3000) ──/api──► Ostensia API (Fastify, :4000) ──► PayPal Sandbox
                                                   │  ├─ deterministic policy checks
                                                   │  └─ audit log (data/audit.jsonl)
                                                   └──► Anthropic API (optional: drafting, shopping agent)
```

1. **Describe and confirm a mandate.** Type what you want in words (an AI drafts terms, if you
   configured a key) or fill in the form yourself. You review and confirm the terms.
2. **Propose a cart.** Build one from the simulated shop (six scenarios, including over-limit
   ones) or ask the AI shopping agent.
3. **Check and authorize.** Ostensia checks the cart against the mandate. If it passes, PayPal
   Sandbox puts the funds on hold. If not, nothing is sent to PayPal.
4. **Settle.** Ostensia reads the authorization from PayPal, checks again, and captures or
   voids. Revoking the mandate before settling makes the final check block the cart, and the
   authorization is voided.
5. **Inspect.** The result page shows the decision, the payment and an audit record of every
   logged step. `/attempts` lists all purchase attempts.

The browser only ever talks to the web app's own origin; the web app forwards `/api` to the
API on the server. No credential reaches the browser.

## Requirements

- Node.js 24 or later and pnpm 10 (`corepack enable` installs the pinned version).
- To run a real payment: a PayPal **Sandbox** business app and a sandbox buyer (see below).
- Optional: an Anthropic API key, for AI drafting and the AI shopping agent.

## Install and test

```sh
pnpm install
pnpm test        # no network, no credentials: PayPal and Anthropic are replaced by fakes
pnpm typecheck
```

## Run it

You need your own PayPal Sandbox credentials. **Nothing is shared or committed**; the API
reads them from `apps/api/.env`, which is git-ignored.

### 1. Create the PayPal Sandbox pieces

1. In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), switch to
   **Sandbox**. You need a sandbox **Business** account (the merchant) and a sandbox
   **Personal** account (the buyer). The dashboard creates default ones.
2. Create a Sandbox REST app for the business account and note its **client ID** and
   **client secret**. The app must be able to save payment methods (vaulting).
3. Create the buyer's saved payment method (the **vault id**) with the tracked Postman
   collection, which keeps variable names only and no values:
   - In Postman, import `docs/evidence/paypal-lifecycle/ostensia-e1.postman_collection.json`
     and `docs/evidence/spike/ostensia-spike.postman_environment.json` (all values empty).
   - In the environment, set `merchant_client_id` and `merchant_client_secret` from your app.
     Leave `base_url` as `https://api-m.sandbox.paypal.com`. Keep your values private.
   - Run **00 Auth → 00.1 Merchant access token**.
   - Run **01a Vault setup → 01a.1 Create setup token**. Open the `approve_url` it prints in
     the Postman console, log in as the sandbox **buyer**, and approve. If no approve link is
     returned, the app does not have vaulting enabled.
   - Run **01b Vault finalize → 01b.1** (the setup token must be `APPROVED`), then **01b.2
     Create payment token**. Its `id` is your **vault id**.

### 2. Configure the API

```sh
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

```
PAYPAL_CLIENT_ID=<your sandbox app's client id>
PAYPAL_CLIENT_SECRET=<your sandbox app's client secret>
PAYPAL_VAULT_ID=<the payment-token id from step 01b.2>
ANTHROPIC_API_KEY=<optional>
```

`PAYPAL_VAULT_ID` is the **payment token** id from 01b.2, not the setup-token id from 01a.1.
The API refuses to start without the three PayPal values. Leave `ANTHROPIC_API_KEY` empty to run
without AI: the AI features answer "off" and you can still fill in the mandate form yourself
and use the simulated shop.

### 3. Start both apps

In two terminals, API first:

```sh
pnpm --filter @ostensia/api start      # http://127.0.0.1:4000
pnpm --filter @ostensia/web dev        # http://127.0.0.1:3000
```

Open http://127.0.0.1:3000. The header says "Ostensia API available" when the API is
reachable. If you change the API's port, set `API_ORIGIN` for the web app (see
`apps/web/.env.example`); it must be set before `next build`.

### 4. Try it

1. Create a mandate, for example: maximum total $5.00, up to 2 sticker packs, matte variant,
   at most $1.50 each, with an expiry in the future. Confirm it.
2. **Continue to proposal**, build the **Compliant** simulated cart, and choose **Check cart and
   settle**. Result: *Captured*. Sandbox money of the cart's total moves once.
3. Build an over-limit cart (for example **Over quantity**) and choose **Check cart and
   authorize**. Result: *Blocked by Ostensia*, and *Nothing was sent to PayPal*.
4. Build a compliant cart, **Check cart and authorize** (funds on hold), **Revoke mandate**,
   then **Settle this authorization**. Result: the final check blocks it and the authorization
   is *Voided*.
5. On each result page read the **Audit record**, and open **All purchase attempts**.

Use a fresh mandate for each run: a mandate can be used by only one live attempt at a time.

## Repository layout

| Path | What it is |
|---|---|
| `packages/domain` | Mandate schema, canonical hash, the pre-check and final evaluators, PayPal status mappings. Pure functions. |
| `apps/api` | Fastify API: the PayPal adapter, the gate (state machine and audit log), the routes, optional AI. |
| `apps/web` | Next.js app: mandate, proposal, result and attempts screens. |
| `docs/` | Decisions, tech debt, build status, design guidelines, evidence. |

Useful documents: `docs/DECISIONS.md` (why things are the way they are), `docs/TECH_DEBT.md`
(known limits), `docs/design/OSTENSIA_BRAND_GUIDELINES.md` (interface language and the
provenance labels), `docs/evidence/` (sanitized sandbox results and walkthroughs).

## Known limits

- **Sandbox only.** The PayPal host is fixed in code to PayPal Sandbox.
- **Simulated shop.** The catalogue and scenarios are synthetic. Ostensia acts as the merchant.
- **Single local process.** State is rebuilt from the audit log file; there is no database, no
  user accounts and no authentication. The API listens on 127.0.0.1 only.
- **The audit log does not record where a cart came from** (TD-027), nor when a mandate was
  revoked per attempt (TD-036).
- **Four attempt states have no way forward in the API** (TD-034): an unknown order outcome,
  an order without exactly one authorization, a PayPal-rejected write, and a record mismatch.
  The page says so; it does not retry anything.
- **A timeout is not treated as a failure.** When a reply does not come back, nothing is sent
  again unless you choose, and a request is idempotent by attempt id.
- **The AI agent is a non-deterministic model.** Its carts are checked by the same code as any
  other cart; the smoke runs are a sample, not a guarantee (TD-025).
- Components have no automated tests (TD-030); the logic they use does.

## Security

PayPal and Anthropic credentials stay on the server, in `apps/api/.env` (git-ignored). Do not
commit them, paste them into screenshots or put them in `NEXT_PUBLIC_` variables.

## Licence

MIT. See `LICENSE`.
