# Proposal and result screens walkthrough (Increment 7b)

Date: 2026-11-06
Build: `feat/frontend`, Next.js 16.4.5, React 19.3.1 (D-029, D-030). The checks below used the
production build (`next build`, `next start`).

This file has two parts. Part 1 records what the assistant checked, with what, and what that
cannot show. Part 2 is the checklist the developer works through with real PayPal Sandbox
credentials and an Anthropic key, and fills in. The developer completed Part 2 on 2026-11-07; the summary below and the ticked checklist
hold the results.

## Part 1: automated checks run by the assistant (2026-11-06)

### How
- The real Ostensia API ran as a node process on a test port, started directly (not through the
  package script) so the developer's `apps/api/.env` was never loaded. It used placeholder
  PayPal values, no Anthropic key, and an audit file outside the repository.
- A small forwarder in front of it, in a scratch folder, could lose one reply after the API had
  acted on a request, or drop one request before it reached the API. These are the two ways an
  answer fails to come back.
- The Next.js production server forwarded `/api` to the forwarder through the rewrite.
- Headless Chrome was driven over the DevTools Protocol by a script in a scratch folder (not
  part of the repository). It read the real DOM, network requests, focus and computed styles,
  and took screenshots.

### Placeholder credentials and PayPal
The one allowed cart in the run (scenario S7) passed the pre-check, so the gate asked for a
PayPal token. The audit log recorded `order_result` with the outcome `not_sent` and the detail
`token_rejected`: **one token request carrying a fictional client id and secret reached
PayPal's sandbox token endpoint and was refused.** No order was created. No real credential was
involved. The cart the gate blocked at the pre-check never reached PayPal.

### Result: 78 of 78 browser checks passed (third run)
Two earlier runs found problems: 6 failures in the first, 3 in the second. One was a real
defect (the route id was encoded twice, see D-030) and is fixed; the others were mistakes in the
script (a wait that returned before the new cart was drawn, a padding sum that forgot the
border, a test id Next.js turns into its own 404, console entries for answers the run provoked
on purpose).

| Scenario | What was checked |
|---|---|
| S1 mandate screen to proposal | "Continue to proposal" is a real link to this mandate's page, drawn as the 40px primary button; the old "not available yet" line is gone; the word PayPal is not on the mandate screen; following the link does not reload the page |
| S2 proposal page | Approved title and introduction; step indicator (Proposal current, Mandate a link, Result not); mandate summary with "Confirmed by you"; simulated shop dotted, AI panel dashed, each with its badge; six scenarios and two modes as radios with defaults; no cart and no PayPal claim before anything is sent |
| S3 AI agent off | The approved notice; the button disabled afterwards; the simulated shop still works |
| S4 simulated scenarios | A scenario the mandate cannot produce is explained in the API's words, with no cart; a built cart is dotted with name, variant, quantity times price and the total; the source label; the approved help texts; building another replaces the first |
| S5 blocked cart | One POST with a fresh id, the mandate, the cart and `settleNow: false`; focus on the heading; step links; solid Decision panel with "Pre-check: blocked" and the domain's sentence in plain words; "Blocked by Ostensia" with "Nothing was sent to PayPal." once; no Payment panel and no PayPal Sandbox badge; nothing to do; the cart "as labelled when proposed"; the API holds one attempt with no PayPal ids; after a reload the attempt is still there and the page says the audit log does not record the source |
| S6 check and settle | One POST with `settleNow: true`; blocked at the pre-check with the variant named |
| S7 allowed cart, placeholder credentials | "Pre-check: allowed" with the domain's sentence; status "Order not created", with no "Funds on hold" or "Captured"; a plain Payment panel (1px border, no PayPal badge) saying no order was sent; nothing to settle or revoke |
| S8 reply lost, attempt created | The approved "could not confirm" notice; no claim of failure; the attempt exists and the browser sent exactly one POST; both actions held with the reason; "Check status" opened the one attempt the browser had named |
| S9 request lost, nothing created | Same notice; nothing created; "Check status" says no such attempt exists and nothing was sent; only then "Try again", which carried the same id; exactly one attempt exists |
| S10 revoked mandate | The warning; both sources disabled, each with the reason |
| S11 unknown ids | Unknown mandate and attempt say so and link back; an id with markup characters is sent encoded and never run; an encoded slash cannot reach another API route; an id with a colon is asked for as that id, encoded once |
| S12 keyboard | Arrow keys move between scenarios; focus ring 2px with a 2px offset |
| S13 responsive (1280, 768, 375, 320) | No horizontal scrolling on either page; no button under 40px; cart lines stack at 375 and 320 and the primary button fills its card |
| S14 whole run | Every request went to the app's own origin; none to the forwarder, the API or Google; the console held only the answers the run provoked on purpose (the AI-off 503, a 422 for a scenario that cannot be built, 404s for unknown ids and a missing attempt, the proxy's 500 for the two dropped replies) and the missing favicon |

Other checks, from the same session:
- `pnpm test`: 64 files, 1,825 tests pass (139 new). `pnpm typecheck` passes for the domain, the
  API and the web app. No dependency was added.
- 40 of 40 deliberate mutations of the new logic, scan tests and style tests were caught.
- Screenshots were read by eye (proposal page, blocked result, rejected result, 375px).

### What this cannot show
- **No real PayPal operation.** A real hold, capture, void and reconcile need the developer's
  sandbox credentials. The statuses "Funds on hold", "Captured", "Capture pending", "Voided",
  "Already settled" and "Outcome unknown", the Settle, Revoke and Check PayPal's record
  buttons, and the PayPal Sandbox badge and 3px rule have **not been seen in a browser**. They
  are covered by tests of the status table and by scan tests of the styles, not by a run.
- The AI agent's success path (the dashed cart, its reasoning, a decline) was not run: there was
  no Anthropic key.
- The "mandate in use" notice, the unsent-request notice and the revoke confirmation were not
  exercised: each needs a held authorization.
- Copy on the new ids was not exercised in a normal browser (it needs ids to copy).
- It is one browser (Chrome, headless) on one machine, and not a human using the page.
- The browser script is in a scratch folder, so it cannot be repeated from a clone (TD-030).

## Part 2 results (reported by the developer, 2026-11-07)

These are the developer's own reports; the assistant did not observe them. The ids are
PayPal Sandbox test ids. No secret is recorded here.
- A, B: an allowed cart reached "Funds on hold" and then "Captured" in two steps, and in one
  step with "Check cart and settle"; order, authorization and capture ids were shown.
- C: revoke then settle ended in "Voided" with the approved wording.
- D, E: a second attempt on a held mandate was refused with a link to the attempt; blocked carts
  were blocked at the pre-check.
- F: the AI agent took about 3 to 5 s; an uninformed cart was blocked by the gate; an agent cart
  passed the pre-check and the final check and was captured, with order, authorization and
  capture ids. This is the first recorded run for TD-026, which is now resolved. Nothing on the
  page said the AI approved or paid.
- G: after stopping and restarting the API, "Check status" showed "Checked. This is the state
  Ostensia holds now."
- H: it reads as quiet, precise financial infrastructure, and the source of each piece of
  content is clear. One surprise: for a mandate with two items, the simulated "Compliant" cart
  has only the first item, while the AI agent's cart has both. That is the API's scenario by
  design (D-012: one unit of the first product that fits), and the scenario's description was
  reworded to say so.
- I: the four points D-030 asked about were confirmed, and D-030 is Accepted.
- Not covered by either part: "Check PayPal's record" (reconcile) and the notice for a request
  that went nowhere while funds are on hold. Both need a failed or unclear settle, and are
  covered only by tests.

## Part 2: the developer's checklist

Run `pnpm --filter @ostensia/api start` (with your own `apps/api/.env`, including the PayPal
Sandbox values and `ANTHROPIC_API_KEY`) and `pnpm --filter @ostensia/web dev`, then open
http://127.0.0.1:3000. Create a mandate by hand first (the same values as in the mandate
walkthrough work). Do not record or screenshot anything that shows a secret. Record each result.

### A. A compliant purchase in two steps
- [ x ] Continue to the proposal, build "Compliant", press "Check cart and authorize". The result
  says "Funds on hold" with the approved sentence, and the decision says "Pre-check: allowed".
  Result: order id: 6UP6…730D, authorization id: 3940…1735 (shortened here; PayPal Sandbox ids)
- [ x ] The Payment panel has the "PayPal Sandbox" badge and a thick left rule, the order id and
  the authorization id in the monospace face (shortened, with Copy), and no capture id yet.
- [ x ] Press "Settle this authorization". The status becomes "Captured", the wording is "Payment
  captured in PayPal Sandbox.", a capture id appears, and the decision shows "Final check:
  allowed". Nothing more can be done. Result: capture id: 8DP2…0452 (shortened here)
- [ x ] Copy works on an id (or says it could not).

### B. A compliant purchase in one step
- [ x ] With a new mandate, "Check cart and settle" goes straight to "Captured". Result: An order id, authorization and capture id was generated

### C. The void: revoke, then settle
- [ x ] With a new mandate, authorize a compliant cart. Press "Revoke mandate": a confirmation
  appears with the approved warning and two buttons. Press "Keep mandate": nothing changes.
- [ x ] Press "Revoke mandate" again and confirm. The notice says that settling now will block the
  cart and void the authorization. The mandate is shown as revoked.
- [ x ] Press "Settle this authorization". The status is "Voided" with the approved wording, the
  final check says it was blocked because the mandate has been revoked, and nothing was
  captured. The page never says the funds were released immediately. Result: Showed a voided message: "Authorization voided in PayPal Sandbox; nothing was captured. When the hold leaves the buyer's balance is up to PayPal."

### D. One live attempt per mandate
- [ x ] Authorize a compliant cart (funds on hold), then go back to that mandate's proposal and
  try to authorize again. The page says the mandate is in use and links to the attempt.

### E. Blocked carts through the real gate
- [ x ] Build "Over quantity" and "Wrong variant" and authorize each on a fresh mandate. Each is
  blocked at the pre-check with the reason in plain words, and no PayPal order is created.

### F. The AI shopping agent (needs the Anthropic key)
- [ x ] Ask the agent in "informed" mode. The dashed "AI-generated proposal" panel shows its
  reasoning and the mode note; the cart is dashed with the same badge. How long did it take?
  3-5 seconds (TD-031: the agent route shares the 120 s proxy limit)
- [ x ] Ask in "uninformed" mode with a task that invites overspending. If the cart breaks the
  mandate, authorizing it is blocked by the gate. Result: got a blocked by Ostensia message: "The cart breaks the mandate's terms. Nothing was sent to PayPal."
- [ x ] If the agent declines, it is shown as an answer, not an error.
- [ x ] Run an agent cart through authorization and capture (TD-026). Result: pre-check and final check allowed. Order id, authorization id and capture id also generated
- [ x ] Nowhere does the page say that the AI approved, authorized or paid.

### G. A request that does not come back
- [ x ] Authorize a compliant cart. Stop the API, press "Settle this authorization": the page says
  it could not confirm, and does not resend. Restart the API (the audit log is kept) and press
  "Check status": it shows the real state. Result: This is was is shown when I click the check status button after restarting the server: "Checked. This is the state Ostensia holds now."

### H. Layout, keyboard and judgement
- [ x ] At 375px nothing overflows or overlaps on either page. Tab reaches every control in a
  sensible order with a visible focus ring. Zooming to 200% stays usable.
- [ x ] Does it read as "quiet, precise financial infrastructure"? Yeah, it does
- [ x ] Is it always clear what came from the AI, from Ostensia's checks, from you, from the
  simulated shop and from PayPal Sandbox? Yeah
- [ x ] Anything that surprised you or read badly? When I build a simulated cart for a mandate that has two items, I get only one (the first item) in the cart, but when I use the AI shopping agent for the same mandate, I get the two items in the cart.

### I. Points D-030 asks you to confirm
- [ x ] The plain Payment panel (no PayPal treatment) when no order left.
- [ x ] The strings and titles that section 12 does not specify.
- [ x ] The two source panels side by side from 1024px.
- [ x ] No favicon (a browser logs a 404 for it).
