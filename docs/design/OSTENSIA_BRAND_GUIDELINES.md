# Ostensia Brand Guidelines

Status: Approved (2026-11-06, by the developer). Section 12 (proposal and result screens,
Increment 7b) and its four proposed conventions (12.7) were approved by the developer on
2026-11-06.
Version: 1.2 (1.1 added section 12; 1.2 added field placeholders, approved by the developer on
2026-11-07)
Scope: the visual identity and interface language of the Ostensia frontend (apps/web).
Decision record: D-028 (docs/DECISIONS.md)
Required reading: CLAUDE.md section 14 requires reading this document before making or
modifying frontend UI.

This document is the canonical source of truth for Ostensia's frontend visual
identity. Read it before making or modifying frontend UI. Do not introduce a new
colour, font, visual language or component convention without the developer's
approval. If an implementation requirement conflicts with this document, stop and
explain the conflict; do not change the specification silently.

## 1. Brand direction and positioning

**Direction: quiet, precise financial infrastructure.** Ostensia should look like
a well-made payments console: a light, paper-like surface, ink-coloured text,
generous whitespace, one restrained brand colour and exact typography.

**Defining principle: provenance.** Every panel shows where its content came from:
the AI, Ostensia's deterministic rules, the person, PayPal Sandbox, or the simulated
shop (section 7). The product's purpose is to show what a person authorised and
why a cart passed or failed, so the interface makes origin visible at every step.

**Positioning in the interface.** Ostensia is a purchase-policy check for AI
shopping agents that pay through PayPal. A person confirms what an agent may buy;
Ostensia's deterministic rules check each proposed cart against those terms before
any payment is captured. The audience ("developers and platforms building AI
shopping agents that pay through PayPal") is a hypothesis, not validated demand
(docs/research-summary.md, section 3).

Tone: plain, precise, calm. Short sentences. No hype, no exclamation marks.

## 2. Wordmark and logo policy

- Ostensia has no logo or symbol. Do not invent one.
- The wordmark is the text "Ostensia": IBM Plex Sans, weight 600, letter-spacing
  -0.01em, colour ink-900 on light surfaces. Header size 20px; minimum 16px.
- Do not use Countersign branding, any former project name, or another project's
  assets.
- Do not use PayPal's or Anthropic's logos or brand marks anywhere in the UI or the
  demo video. Refer to them in plain text ("PayPal Sandbox", "Claude"). The hackathon
  rules bar third-party trademarks in the video without permission.

## 3. Colour

Light theme only. Values are CSS custom properties in apps/web/app/globals.css.
Colour is never the only signal: every state also has an icon and text.

### Neutrals
| Token | HEX | Use |
|---|---|---|
| ink-900 | #0F1B2D | Primary text, wordmark |
| ink-700 | #33415C | Secondary text; help text inside tinted panels |
| ink-500 | #5B6B85 | Help text and captions on white, surface-100, brand-50, ai-50 |
| line-500 | #8792A6 | Borders of form controls (inputs, selects, checkboxes) |
| line-300 | #D5DCE6 | Card borders |
| line-200 | #E6EBF2 | Dividers |
| surface-100 | #F5F7FA | Page background, disclosure bar |
| surface-0 | #FFFFFF | Cards, form controls |

### Brand
| Token | HEX | Use |
|---|---|---|
| brand-600 | #0F5C63 | Primary buttons, links, focus ring, "Checked by Ostensia" |
| brand-700 | #0A4A50 | Primary button hover and active |
| brand-50 | #E7F2F2 | Ostensia-checked and user-confirmed panels |

### Provenance
| Token | HEX | Use |
|---|---|---|
| ai-600 | #5B4BA6 | AI-generated badges and dashed borders |
| ai-50 | #F3F1FB | AI draft panel background |
| paypal-op-600 | #2E4A6B | "PayPal Sandbox" operation badges and rules |
| sim-600 | #6B6F76 | "Simulated" badges and dotted borders |

### Status
| Token | HEX | Use |
|---|---|---|
| success-700 / success-50 | #1A7C49 / #E8F5EE | Allowed, captured |
| danger-700 / danger-50 | #B42318 / #FDECEA | Blocked, errors |
| warning-700 / warning-50 | #8A5A00 / #FFF4E0 | Warnings |
| hold-700 / hold-50 | #1F5FAD / #EAF2FC | Funds on hold (authorized, not captured) |

PayPal brand blue is not used. Ostensia's colours stay distinct from PayPal's.

### Verified contrast (WCAG 2.2 AA, computed 2026-11-06)
- Text, 4.5:1 minimum: every text token passes on white, surface-100 and its own
  tint. Lowest: ink-500 on brand-50 4.73; success-700 on success-50 4.65
  (success-700 was darkened from #1B7F4B, which measured 4.48, to pass).
- Non-text, 3:1 minimum: line-500 on white 3.14; brand-600, ai-600, sim-600,
  danger-700 and paypal-op-600 all pass on white. line-300 (1.38) and line-200
  (1.20) are decorative only and must not be the sole boundary of a control.
- Form controls sit on surface-0 (white). line-500 on surface-100 is 2.92, below 3:1.
- Recheck any new pairing before use.

## 4. Typography and font sourcing

- Interface: IBM Plex Sans. Ids, the mandate hash and machine timestamps: IBM Plex
  Mono. Both under the SIL Open Font License 1.1.
- Loaded with next/font (part of Next.js), downloaded at build time and served by
  the app; the browser makes no font requests to third parties.
- Fallbacks: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; and
  ui-monospace, "Cascadia Mono", Menlo, monospace.
- Scale (px): 12 badges; 13 disclosure and captions; 14 labels and secondary text;
  16 body; 20 section titles; 28 page title.
- Line height 1.5 for body and 1.25 for headings. Weights 400, 500 and 600 only.
- Money: tabular figures (font-variant-numeric: tabular-nums), always written
  "$12.34 USD".
- Long ids and hashes: mono, shortened in the middle (3f9a…c21) with a Copy
  control; the full value is available to assistive technology.

## 5. Spacing, borders, radii, shadows and layout

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48. No other values.
- Radius: controls 6px; cards 8px; badges 4px.
- Borders: 1px. Cards line-300; form controls line-500; dividers line-200.
- Shadow: one, on cards only: 0 1px 2px rgba(15, 27, 45, 0.06).
- Focus: 2px brand-600 outline with 2px offset on every interactive element,
  using :focus-visible.
- Page: background surface-100; content max width 1080px, centred, 24px side
  padding (16px below 640px).
- Header: 56px, white, bottom border line-200; wordmark on the left, the Ostensia
  API availability indicator on the right.
- Disclosure bar: directly below the header on every page, full width, surface-100,
  13px ink-700 text: "Sandbox demo · simulated shop · Ostensia acts as the merchant."
- Motion: fades and transitions of 150ms at most; none when the user prefers
  reduced motion. No decorative animation.

## 6. Components

- **Buttons**, 40px tall, 6px radius, 14/600 text:
  - Primary: brand-600 fill, white text; hover brand-700.
  - Secondary: white, 1px line-500 border, ink-900 text.
  - Text button: brand-600 text, no box, underline on hover.
  - Destructive (later increments): white, danger-700 border and text.
  - Loading: the label becomes the action in progress ("Drafting…", "Confirming…"),
    aria-busy is set and the button cannot be pressed again.
  - Disabled: 45% opacity, with the reason shown next to it in text.
- **Fields:**
  - Label above (14/500, ink-900); help text below (13, ink-500).
  - Control 40px tall, white, 1px line-500, 6px radius.
  - Error: danger-700 border plus a message with an icon below, linked with
    aria-describedby; aria-invalid set.
  - Money fields: "$" prefix, "USD" suffix, inputmode="decimal".
  - Required fields are marked "Required" in text, not by an asterisk alone.
  - Placeholders: where a field takes free text or a number, an example of a valid value
    (the strings are in section 10), in ink-500 at full opacity (4.5:1 on white). It shows
    only while the field is empty, is never a default, and never replaces the label or the
    help text. The expiry has none, because a date-time control cannot show one.
- **Cards:** white, 1px line-300, 8px radius, 24px padding, the card shadow.
  The header row holds a title (20/600) and, where content has a source, a
  provenance badge on the right.
- **Badges:** 12/600, sentence case, 4px radius, 2px 8px padding, icon plus text,
  colours from section 7.
- **Status indicator:** icon, short label (14/600) and one line of explanation
  (14/400). Colour from the status tokens; never colour alone.
- **Callouts** (warnings, notices): tinted background of the relevant status, 1px
  border in its 700 colour at 30% opacity, icon, text in ink-900.
- **Icons:** a small hand-drawn inline SVG set (check, cross, clock, alert, info,
  copy), 16px, 1.5px stroke, currentColor. No icon library, no emoji, no AI sparkle
  icons.

## 7. The provenance system

Every element that shows content from a specific source carries its badge and
panel treatment. The border style (dashed, solid, dotted) carries the meaning as
well as colour.

| Source | Badge text | Treatment | Meaning |
|---|---|---|---|
| AI | "AI-generated draft" / "AI-generated proposal" | Dashed 1px ai-600 border on ai-50; badge ai-600 | A suggestion from the model. Not confirmed, not checked, never authoritative. |
| Ostensia rules | "Checked by Ostensia" | Solid 1px brand-600 border on brand-50; badge brand-600 | Produced by deterministic Ostensia code (validation, completeness check, warnings, decisions). |
| The person | "Confirmed by you" | Solid brand-600 border on brand-50, check icon | An action the person took. |
| PayPal Sandbox | "PayPal Sandbox" | 3px solid paypal-op-600 left rule; real ids in mono | A real PayPal Sandbox API operation. Used only where PayPal was called. |
| Simulated | "Simulated shop" | Dotted 1px sim-600 border; badge sim-600 | Synthetic catalogue and scenarios; not a real merchant. |

Rules:
- Content from different sources is never merged into one panel. Where one
  response holds both (an AI draft with Ostensia's completeness check), the
  Ostensia part is a separate, solid sub-panel inside the dashed AI panel.
- A PayPal Sandbox badge appears only on steps that made a PayPal call.
- The UI keeps the source label it received from the API. It never implies that
  the audit log records a proposal's source (TD-027).

## 8. Mandate screen

Order, top to bottom:
1. Header (wordmark; "Ostensia API available" or "Ostensia API unreachable").
2. Disclosure bar.
3. Title "Create a purchase mandate" and the line: "Set exactly what an AI
   shopping agent may buy. Ostensia checks every cart against these terms before
   any payment is captured."
4. Step indicator: 1 Mandate (current), 2 Proposal, 3 Result. Later steps are
   shown as upcoming and are not interactive until they exist.
5. At 1024px and wider, two columns: "Describe it (optional)" (5 of 12 columns) and
   "Mandate terms" (7 of 12). Below 1024px the columns stack, describe first.

**Describe it (optional):**
- A text area (2,000 characters, with a counter), the line "AI suggests terms;
  you review and confirm them. AI never approves a purchase.", and a secondary
  button "Draft with AI".
- On success, a dashed AI panel shows what the AI read (summary and notes), with
  a solid "Completeness check · Checked by Ostensia" sub-panel listing missing
  fields, problems and warnings, and the button "Use this draft in the form".
- The draft never fills the form until the person presses that button. Copied
  fields show a "from AI draft" marker until edited. Fields the AI left empty
  stay empty.
- 503 not_configured: a neutral notice, "AI drafting is off because no Anthropic
  key is configured. You can fill in the terms yourself.", and the button is
  disabled with that reason. Other failures (refused, invalid output, unavailable)
  each get a plain message, and the form is untouched.

**Mandate terms:**
- What this is for (intent summary, up to 500 characters, required).
- Currency: shown read-only as "USD (the only currency supported)" and sent
  explicitly.
- Maximum total (money field, required).
- Expires: no default. The person chooses a local date and time; below it the
  exact value sent is shown: "Sent as 2026-11-20T20:00:00.000Z (UTC)". An expiry in
  the past shows a warning that any purchase would be blocked as expired. The date
  in this example is illustrative and is never a default.
- Items (one or more): product (picker from the simulated catalogue with the
  "Simulated shop" badge; a drafted product not in the catalogue is kept and
  flagged, never dropped); variants ("Any" omits the restriction; "Only" requires
  at least one ticked; an empty list is never sent); maximum quantity; maximum
  unit price; remove item. "Add item" moves focus to the new product field.
- A summary in plain words ("You are authorising: up to $5.00 USD until …, for
  …") above the primary button "Confirm mandate".

**Validation:**
- Client-side validation uses the domain's own MandateTermsSchema for field-level
  messages, so the limits are not copied (approved subject to verification; see
  D-028). The gate on the server stays authoritative; client-side validation is for
  usability and never replaces it.
- A refusal from the API shows an error summary that names the refusal code in
  plain words, receives focus and is announced.

**Confirmed:** a card titled "Mandate confirmed" with the badges "Confirmed by you"
and "Checked by Ostensia", the mandate id, the status, and the reference (SHA-256,
shortened, with a Copy control), followed by the wording in section 10. The card
makes no PayPal claim: confirming a mandate makes no PayPal call and creates no
order.

## 9. Responsive and accessibility requirements

- Breakpoints: 640px and 1024px. No horizontal scrolling at 320px wide.
- Below 640px buttons are full width; touch targets at least 40px.
- WCAG 2.2 AA: contrast as in section 3; every control has a visible label;
  errors are announced and linked; status changes use aria-live="polite".
- Keyboard: logical tab order; everything reachable and operable; visible focus;
  Enter in a text area adds a line and never submits.
- Respect prefers-reduced-motion.
- Language: lang="en" on the document.

## 10. Interface language

Approved disclosures and strings:
- Persistent: "Sandbox demo · simulated shop · Ostensia acts as the merchant."
- AI drafting: "AI suggests terms; you review and confirm them. AI never approves a
  purchase."
- AI off: "AI drafting is off because no Anthropic key is configured. You can fill
  in the terms yourself."
- API status: "Ostensia API available" / "Ostensia API unreachable". It represents
  only the availability of the Fastify API (GET /health). It says nothing about
  PayPal or Anthropic connectivity.
- Mandate confirmed: "Ostensia stores this reference with the mandate so that later
  records can be traced back to these exact terms. It is application-level
  traceability. It is not proof of who approved the mandate, of their consent, or
  of any authorization." Do not say or imply that the reference has been attached
  to a PayPal order.
- Field placeholders (examples of valid values, added 2026-11-07 at the developer's
  request; text fields begin "Example:", number fields "e.g."):
  - AI description: "Example: Buy up to two matte sticker packs, with a maximum total of
    $5."
  - AI agent task: "Example: A small gift for a colleague, under $20."
  - What this is for: "Example: Two matte sticker packs for my laptop."
  - Maximum total: "e.g. 5.00"
  - Maximum quantity: "e.g. 2"
  - Maximum unit price: "e.g. 1.50"
- Holds, captures and voids (later increments): "PayPal authorized the payment: the
  buyer's funds are on hold; no money has moved." / "Payment captured in PayPal
  Sandbox." / "Authorization voided in PayPal Sandbox; nothing was captured. When
  the hold leaves the buyer's balance is up to PayPal."

Prohibited or unsupported claims (never in the UI, README or video):
- That the AI approves, authorises or completes a purchase.
- That the AI agent has completed a PayPal transaction (not recorded; TD-026).
- That an agent can pay any merchant with the buyer's PayPal wallet.
- That PayPal enforces the mandate.
- That the mandate hash proves identity, consent or authorization.
- That a mandate reference is already attached to a PayPal order, before a purchase
  attempt has created one.
- That held funds are released immediately on void.
- That no one else does basket-level authorization, or that Ostensia is unique.
- That the product is production-ready or uses real money.
- That the simulated shop is a real merchant.
- That the API status indicator reflects PayPal or Anthropic availability.

## 11. Non-goals and implementation constraints

Non-goals: dark mode (not in version 1.0); gradients; glass or blur effects;
neon or crypto styling; decorative charts; dashboard tiles; illustrations;
chatbot-style chat bubbles; AI sparkle icons; third-party logos.

Constraints:
- Tokens live only as CSS custom properties in apps/web/app/globals.css;
  component styles use CSS Modules and reference tokens, never raw HEX values.
- Plain CSS: no Tailwind, no component or icon library.
- Fonts only through next/font as in section 4.
- Any new token, colour pairing or component convention needs the developer's
  approval and an update to this document first.

## 12. Proposal and result screens (Increment 7b)

Scope: steps 2 and 3 of the step indicator. The audit timeline and the list of all
attempts are a later increment (7c) and are not specified here. Sections 1 to 11 still
apply; this section adds screens and states, and the few new conventions listed
at the end for approval. No new colour, font, icon or spacing value is introduced.

### 12.1 Pages and navigation
- `/` is the mandate screen. The "Mandate confirmed" card gains a primary button
  "Continue to proposal" that opens `/mandates/{id}`.
- `/mandates/{id}` is step 2, Proposal. `/attempts/{id}` is step 3, Result.
- The step indicator follows the page. A step the person has already reached is a link;
  later steps stay non-interactive. Step 1 links to `/`.
- Every page keeps the header, the disclosure bar and the layout of section 5. A page for
  an id the API does not know shows a plain "not found" message and a link back to `/`.

### 12.2 Step 2: Proposal
Order, top to bottom:
1. Title "Propose a purchase" and the line: "Choose a cart for an AI shopping agent to
   propose, or build one from the simulated shop. Ostensia checks it against your mandate
   before anything is authorised."
2. **Mandate summary** (solid brand panel, badge "Confirmed by you"): the plain-words
   summary of section 8, the id and the status. A revoked mandate shows the status
   "Revoked" in a warning callout and disables both sources below, with the reason beside
   the buttons.
3. **Simulated shop** (dotted sim panel, badge "Simulated shop"): a radio group of the
   six scenarios, each with a one-line description: compliant, over unit price, over
   quantity, wrong variant, unlisted product, over total. Secondary button
   "Build simulated cart". A scenario the API cannot build from this mandate shows the
   API's reason beside the group and is not an error state.
4. **AI shopping agent** (dashed AI panel, badge "AI-generated proposal"): radio choice
   "Show the agent the mandate's limits" / "Do not show the agent the limits", an optional
   task text area (2,000 characters, with a counter), the line "The AI proposes a cart. It
   never approves a purchase.", and the secondary button "Ask the AI agent for a cart". The
   API's note on the mode is shown after the answer. A decline is shown as a result with
   the agent's reason, not as an error. With no key: a neutral notice "The AI agent is off
   because no Anthropic key is configured. You can use the simulated shop instead." and the
   button is disabled with that reason.
5. **The cart** (appears after a cart is built; it keeps the panel treatment of its
   source, so a simulated cart is dotted and an AI cart is dashed):
   - one row per line: product name and variant, quantity times unit price, line total;
   - below 640px each row stacks (name, then quantity and price, then the line total); the
     page never scrolls horizontally;
   - a total row "Total $12.34 USD". Money uses tabular figures and the "$12.34 USD" form;
   - no Ostensia verdict is shown here, because the gate has not run.
   Building another cart replaces this one.
6. **Actions** under the cart:
   - Primary "Check cart and authorize": Ostensia checks the cart; if it passes, PayPal
     Sandbox holds the funds. Nothing is captured until the person settles. Help text:
     "Ostensia checks the cart. If it passes, PayPal Sandbox puts the funds on hold. Nothing
     is captured until you settle."
   - Secondary "Check cart and settle": the same check, then settles at once. Help text:
     "The same check, then Ostensia captures or voids straight away."
   - Both are disabled while a request is running (label "Checking…").

### 12.3 Step 3: Result
Three panels, never merged (section 7). Order:
1. **Decision** (solid brand panel, badge "Checked by Ostensia"): a status indicator
   (12.5) and, in plain words from the API, why the cart was allowed or blocked, once for
   the pre-check and, if it ran, once for the final check after settling. Each violation is
   one sentence in a list. Wording is the API's explanation and is not rewritten.
2. **Payment** (white panel with a 3px paypal-op-600 left rule, badge "PayPal Sandbox"):
   shown **only if a PayPal call was made**; for a pre-check block it is replaced by one
   line, "Nothing was sent to PayPal." Contains the order id, authorization id and capture
   id where they exist, in mono, shortened with a Copy control, and the status wording of
   section 10.
3. **Next steps**: the actions that status allows (12.5), or one line saying nothing more
   can be done here.

Beneath the panels, the cart as in 12.2 with the caption "As proposed" and, only if this
browser session saw the cart's source, its source label with the caption "as labelled when
proposed". After a page reload the source is not shown, and the page says: "Ostensia's
audit log does not record where a cart came from." (TD-027).

### 12.4 When a reply does not come back
The page keeps the attempt id it generated before sending. If the reply is lost, cut off
by the proxy, or the API is unreachable, it shows a warning callout: "Ostensia could not
confirm what happened. The request may have reached PayPal Sandbox. Nothing will be sent
again unless you choose." with two buttons:
- "Check status" reads the attempt (a read only). A found attempt is shown; a missing one
  (404) is reported as "No attempt with this id exists. Nothing was sent."
- "Try again" is offered only after a 404, and sends the identical request with the same
  attempt id.
Nothing is retried automatically. A refusal "mandate_in_use" names the attempt that holds
the mandate and links to it.

### 12.5 Attempt statuses
Each status has an icon from the existing set, a short label (14/600), one line of
explanation (14/400) and the tone's tokens. Tones: danger = blocked or failed; warning =
needs attention or outcome unknown; hold = funds on hold; success = captured; neutral =
ink-700 on white with the info icon; progress = clock icon, neutral. Colour is never the
only signal.

| Status | Label | Tone | Line |
|---|---|---|---|
| blocked_precheck | Blocked by Ostensia | danger | The cart breaks the mandate's terms. Nothing was sent to PayPal. |
| integrity_failed | Blocked: mandate changed | danger | The stored mandate no longer matches its reference. Nothing was sent to PayPal. |
| abandoned | Stopped before PayPal | warning | The API restarted before this reached PayPal. Nothing was sent. |
| create_rejected | Order not created | danger | PayPal Sandbox did not create the order, or it could not be sent. Nothing is on hold. |
| create_unknown | Order outcome unknown | warning | Ostensia did not get PayPal's answer. The order may exist. Nothing will be sent again. |
| anomaly | Needs a person | warning | PayPal Sandbox created an order but did not return exactly one authorization. Nothing was captured. |
| authorized | Funds on hold | hold | PayPal authorized the payment: the buyer's funds are on hold; no money has moved. |
| captured | Captured | success | Payment captured in PayPal Sandbox. |
| capture_pending | Capture pending | hold | PayPal Sandbox accepted the capture but has not completed it. |
| voided | Voided | neutral | Authorization voided in PayPal Sandbox; nothing was captured. When the hold leaves the buyer's balance is up to PayPal. |
| write_refused | Already settled | warning | PayPal Sandbox reports this authorization as already settled. |
| write_rejected | PayPal rejected the request | danger | Nothing was captured or voided. |
| write_unknown | Outcome unknown | warning | Ostensia did not get PayPal's answer and will not send it again. Check PayPal's record. |
| no_action | Nothing sent | neutral | The authorization was no longer open when Ostensia checked it, so nothing was sent. |
| conflict | Needs a person | danger | PayPal's record does not match what Ostensia asked for. |
| started, prechecked, creating, writing | In progress | progress | Ostensia is working on this. |

Actions by status:
- authorized: "Settle this authorization" (primary), "Revoke mandate" (destructive).
- write_unknown, capture_pending, write_refused: "Check PayPal's record" (secondary; it
  only reads). Its outcome is reported as: captured ("PayPal's record shows the payment was
  captured."), voided ("PayPal's record shows the authorization was voided."), conflict
  ("PayPal's record does not match what Ostensia asked for. A person needs to look at it."),
  unchanged ("PayPal's record does not settle it yet. Check again later.").
- create_unknown, anomaly, write_rejected, conflict: no action; the page says so (the API
  offers no way forward for these, TD-034).
- Every other status: no action.
"Revoke mandate" shows a confirmation first: "Revoke this mandate? This cannot be undone.
Any further purchase will be blocked. A payment already on hold is voided only when you
settle it." with "Revoke mandate" and "Keep mandate". After it, the page reads the attempt
again.

### 12.6 Accessibility and responsive
- After a request completes, focus moves to the result heading; status changes use
  aria-live="polite" as in section 9.
- Radio groups use fieldset and legend; the cart is a list, not a div grid; every Copy
  control has a name that says what it copies.
- Breakpoints as in section 9. Below 640px the source panels stack and every button is
  full width. Touch targets are at least 40px.

### 12.7 New conventions (approved 2026-11-06)
1. The destructive button (section 6 already defines it, "later increments") is used for
   "Revoke mandate", with hover as danger-50 background (danger-700 on danger-50 is within
   the verified pairings).
2. Neutral status indicator: ink-700 on white with the info icon, used for "Voided" and
   "Nothing sent". There is no neutral status token, so none is added.
3. The inline revoke confirmation in 12.5.
4. The cart list in 12.2, including its stacked layout below 640px.

### 12.8 New approved strings
Titles and lines in 12.2 to 12.5, the button labels "Continue to proposal", "Build
simulated cart", "Ask the AI agent for a cart", "Check cart and authorize", "Check cart and
settle", "Settle this authorization", "Revoke mandate", "Keep mandate", "Check PayPal's
record", "Check status", "Try again", and their running labels ("Building…", "Asking…",
"Checking…", "Settling…", "Revoking…", "Checking status…"). The strings in section 10
are unchanged. Prohibited claims in section 10 apply to every new string; in particular the
interface never says that the AI approved or paid, and never says that PayPal enforced the
mandate.
