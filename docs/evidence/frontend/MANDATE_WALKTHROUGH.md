# Mandate screen walkthrough (Increment 7a)

Date: 2026-11-06
Build: `feat/frontend`, Next.js 16.4.5, React 19.3.1 (D-029). The checks below used the
production build (`next build`, `next start`).

This file has two parts. Part 1 records what the assistant checked, with what, and
what that cannot show. Part 2 is the checklist the developer works through in a real
browser, with an Anthropic key, and fills in. Nothing in Part 2 has been done yet.

## Part 1: automated checks run by the assistant (2026-11-06)

### How
- The real Ostensia API ran as a node process on a test port, started directly (not
  through the package script) so the developer's `apps/api/.env` was never loaded. It
  used placeholder PayPal values, no Anthropic key, and an audit file outside the
  repository. Nothing was sent to PayPal or to any AI provider.
- A small forwarder in front of it, in a scratch folder, could (a) answer after a
  delay, and (b) drop one reply after the API had created a mandate, or drop one
  request before it reached the API. These are the two ways a confirmation can fail to
  come back.
- The Next.js production server forwarded `/api` to the forwarder through the rewrite.
- Headless Chrome was driven over the DevTools Protocol by a script in a scratch folder
  (not part of the repository). It read the real DOM, network requests, focus and
  computed styles, and took screenshots.

### Result: 96 of 96 browser checks passed (second full run)
A first run found nine failures. Four were real defects, now fixed; five were mistakes
in the script. All are listed in D-029.

| Scenario | What was checked |
|---|---|
| First load (1280px) | Language, wordmark, exact disclosure, introduction; "Ostensia API available"; three steps with the first current; "Draft with AI" disabled with a reason; no default expiry; read-only USD; catalogue loaded with prices; every network request goes to the app's own origin under `/api`; no request to Google or to ports 4000, 4150 or 4160; IBM Plex Sans served by the app; computed colours, sizes, radius, 56px header and 1080px width match the guidelines |
| Empty submit | Six problems listed in form order; summary takes focus; summary links move focus to fields; each field has an error with an icon and words and `aria-invalid`; nothing sent |
| AI off (no key) | The API answered 503; the approved notice appears as a neutral status; the button is disabled afterwards; the form is untouched |
| Manual path, no AI | The UTC value is shown under the expiry; the plain-words summary appears; the catalogue price is shown; "Simulated shop" badge; confirmation succeeds; the browser POSTed exactly the confirmed terms to same-origin `/api/mandates`; the API answered 201 and holds the same terms; the approved reference wording is shown; the word "PayPal" appears nowhere on the page; focus moves to the result |
| Items and keyboard | Add item (focus moves to the new product), Remove (focus returns to Add item), a single item cannot be removed; tab order follows reading order; the disabled draft button is skipped; focus outline is 2px brand-600 with 2px offset |
| Reply lost, mandate created | The page says it could not confirm and that it is not known to have failed; it finds the existing mandate and offers "Use this mandate" or "Create a new one anyway"; Confirm is held; **exactly one POST was sent and exactly one mandate was created (no automatic retry)** |
| Request lost, nothing created | The page reports that no such mandate exists; nothing was created; "Try again" creates exactly one |
| API unreachable | Status reads "Ostensia API unreachable"; the catalogue failure is explained with a retry; no address, port, stack trace or `API_ORIGIN` is shown; drafting says nothing was created; the status recovers when the API returns |
| Responsive (1280, 768, 375, 320px) | No horizontal scrolling; describe and terms side by side from 1024px and stacked below; every button and field target at least 40px; primary button full width of its card below 640px |
| Motion and console | Transitions are off under reduced motion; no console errors, warnings or hydration problems |

Other checks, from the same session:
- `pnpm test`: 56 files, 1,686 tests pass (267 are new, in `apps/web`). 41 of 41
  deliberate mutations of the new logic and scan tests were caught.
- `pnpm typecheck` passes for the domain, the API and the web app.
- `pnpm audit` on the repository lockfile: no known vulnerabilities.
- Build output: the API origin value appears in no browser-delivered asset (only in the
  server-side `routes-manifest.json`); the client JavaScript is 737,441 bytes
  (216,743 gzip), of which the schema import accounts for about 110 KB (31 KB gzip);
  the fonts are 11 files served by the app, with no request to Google.
- D-027: a 40 second upstream answer completed through the rewrite (40.02 s); Next.js's
  default would have cut it at 30 s.

### What this cannot show
- It is one browser (Chrome, headless) on one machine, in one time zone. It is not a
  human using the page, and it says nothing about how the page feels.
- It did not run an AI draft. There was no Anthropic key, so the draft-success path
  (the AI panel, the completeness check, "Use this draft in the form", "from AI draft"
  marks, adjustments) was **not exercised in a browser**. It is covered only by unit
  tests of `draftToForm`, the API client and the messages.
- Copying the reference failed in headless Chrome (no clipboard permission) and the
  page showed its fallback message. Whether "Copy" works in a normal browser is not
  verified.
- The slow-response test used a stand-in upstream, not the real draft route.
- Contrast was computed and tested, and the screenshots were read by eye, but a person
  has not judged the visual design.
- The clean-clone run from the README (D-026, verification 1) has not been done: there
  is no README for it yet (Increment 8).

## Part 2 results (reported by the developer, 2026-11-06)

The developer ran sections A to F in a real browser and reported the following. These are the
developer's own reports; the assistant did not observe them. The developer ticked A to E below;
the two section F boxes are still for the developer to tick and fill in.
- A, C, D, E: no problems.
- B: the developer told the assistant the successful second attempt took about 16 to 18 s,
  while the checklist line below says "about 5-10 seconds". The two figures differ and the
  developer has not said which is right; both are well under the proxy's 120 s, and this is
  one sample.
  A first attempt on a poor connection ended with "The AI service took too long to answer",
  the form was left untouched, and drafting worked once the network recovered. The developer
  recalls this at about 30 s and does not remember the exact time. The API's provider timeout is
  90 s, so the recalled time is unexplained; if it recurs, time it on a clock.
- F: the design judgement was favourable ("all good"); no free-text notes were given.

## Part 2: the developer's checklist

Run `pnpm --filter @ostensia/api start` (with your own `apps/api/.env`) and
`pnpm --filter @ostensia/web dev`, then open http://127.0.0.1:3000. Record each result.

### A. With no Anthropic key (D-026, verification 2)
Start the API with `ANTHROPIC_API_KEY` unset.
- [ x ] The page loads; the header says "Ostensia API available".
- [ x ] Complete the form by hand and confirm a mandate. Result: Mandate id: 720ff206-c55d-426a-9a17-7e8a1cd3c5fc, Mandate hash: 67c9cec71d59df76ec46598bab1aa7b00c7595ef2457af8f3bf0f35a51ae2923
- [ x ] Press "Draft with AI": the notice appears, the button is disabled, the form still works.

### B. With your Anthropic key (the part not yet exercised)
- [ x ] Describe a purchase and press "Draft with AI". How long did it take? about 5-10 seconds
  (D-027 criterion 4: the proxy allows 120 s; this is the real draft route.)
- [ x ] The dashed AI panel shows what the AI read, with the solid "Completeness check" inside it.
- [ x ] "Use this draft in the form" fills the form; filled fields are marked "from AI draft"; nothing filled before you pressed it.
- [ x ] A field you edit loses its mark. A field the AI left empty stays empty.
- [ x ] Try a description with a product that is not in the catalogue: it is kept and flagged, not dropped.
- [ x ] Try an expiry with seconds, or none: the adjustment note appears, or the field stays empty.

### C. Form editing and validation
- [ x ] Empty submit: the summary takes focus and lists the problems.
- [ x ] Try 1.505, -1, 1e3 and "abc" as an amount, and 0 or 1.5 as a quantity: each gives a clear message.
- [ x ] An expiry in the past shows the warning but is not blocked.
- [ x ] Two items with the same product show "Each product can appear only once."
- [ x ] The UTC value under the expiry matches your local time converted.

### D. Confirmation and errors
- [ x ] A confirmed mandate shows its id, status, local time and reference; Copy works (or the fallback shows).
- [ x ] The reference wording does not mention PayPal.
- [ x ] Stop the API, then confirm: the page says it could not confirm, and does not retry by itself.
- [ x ] Restart the API and press the offered button: the result matches what the page said.

### E. Responsive layout and keyboard (use a real browser, resize it, and try a phone)
- [ x ] At 320, 375, 768 and 1280 px nothing overflows and nothing overlaps.
- [ x ] Reach every control with Tab alone, in a sensible order, with a visible focus ring.
- [ x ] Radios and checkboxes work with the keyboard (arrow keys, space).
- [ x ] Zooming to 200% keeps the page usable.

### F. Judgement
- [ ] Does it look like "quiet, precise financial infrastructure"? Anything that feels generic, crowded or unclear? ______
- [ ] Is it always clear what came from the AI, from Ostensia's checks, from you, and from the simulated shop? ______
