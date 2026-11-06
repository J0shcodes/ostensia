# Ostensia: Hackathon Requirements Assessment (mid-build validation, report 04)

**Status:** a research artefact. It is not a project decision.
**Research date:** 2026-11-05 (all sources accessed that day).
**Researcher:** Claude Code (model `claude-opus-5-5`).
**Covers:** Research 4; deliverable 4; priority question P8.
**Labels:** [F] fact, [SA] self-audit, [I] interpretation, [H] hypothesis,
[R] recommendation, [U] unresolved. Evidence IDs refer to `05-evidence-register.md`.

---

## 1. Methodology and source note

- The official rules [EV-01] and the overview [EV-02] were read **in full**.
  - `WebFetch` returned HTTP 403, as it had earlier in the project (Report 00 §1.4).
  - Both pages were therefore downloaded with `curl` to a scratch directory outside
    the repository and converted to text.
  - **Nothing was written to the repository.**
- The pages carry no "last updated" date. The rules say they "are subject to change
  at any time" [EV-01], so they should be re-checked before submission.
- Secondary summaries [EV-03] are recorded only where they contradict the rules.

---

## 2. Requirements (from the official rules unless marked)

### 2.1 Dates

| Item | Official | Notes |
|---|---|---|
| Submission deadline | **Thursday 2026-11-12, 12:00 pm Pacific Time** [EV-01] | The overview banner says "12:00pm PST" [EV-02]. That matches `docs/research-summary.md` (20:00 UTC) [PR-02]. **Contradiction:** one secondary source says 2:00 pm PT [EV-03]; the rules prevail |
| Judging | 2026-12-01 to 2026-12-15 [EV-01] | A secondary source says from 13 November [EV-03] |
| Winners | around 2026-12-21 [EV-01] | |

### 2.2 PayPal usage (mandatory)

- [F] "Build or update an application that integrates the PayPal developer platform
  (using the free sandbox environment) along with an AI tool, model, or platform"
  [EV-01].
- [F] "Meaningfully integrate at least one PayPal technology, API, SDK, product, or
  developer capability" [EV-02].
- [F] "Any AI tool works, as long as PayPal integration is central to the project"
  [EV-01].
- [F] Stage One is a pass/fail check that the project "reasonably applies the
  required APIs/SDKs" [EV-01].
- [SA] Ostensia uses PayPal Orders v2 (intent AUTHORIZE with a vault), capture,
  void, and a vault payment-token read. These are central to the flow [SA-01].
- [I] Ostensia meets this requirement.

### 2.3 AI usage (mandatory)

- [F] "Meaningfully incorporate AI into the experience or functionality" [EV-02].
- [F] "The only fundamental requirement: your project must meaningfully use both
  PayPal and AI" [EV-02].
- [F] The submission must "identify which tools (model or AI service) were used and
  explain how the tools were used" [EV-02].
- [SA] Ostensia has AI mandate drafting and an AI shopping agent, both advisory
  [SA-03].
- [I] Meets the requirement. The submission text must name the model and say how it
  is used.

### 2.4 Functional demo and testing access

- [F] "Your project does not need to be publicly hosted or deployed — but judges
  must be able to actually run or interact with a working build." This is satisfied
  by "clear, complete setup and run instructions in your code repository ... OR a
  hosted demo URL". "A design mockup, static prototype, or non-functional demo does
  not meet this requirement" [EV-01].
- [F] "Access can be provided ... by including complete setup and run instructions
  ... along with any test account credentials, API keys, or sandbox login details
  necessary to run and test the Project. If your submission requires special access,
  please include clear instructions for obtaining access within your repository's
  README or project description" [EV-01].
- [F] The project must be available "free of charge and without any restriction"
  for testing until judging ends [EV-01].
- [F] "Judges are not required to test the Project and may choose to judge based
  solely on the text description, images, and video" [EV-01].
- [F] Functionality: "capable of being successfully installed and running
  consistently ... and must function as depicted in the video" [EV-01].

### 2.5 Repository and licence

- [F] The repository must be public on GitHub, GitLab or Bitbucket.
- [F] It must "contain all necessary source code, assets, and instructions".
- [F] It must be "public and open source by including an open source license file",
  detectable "at the top of the repository page (in the About section)" [EV-01].
- [SA] The repository is currently private, the README says it is not runnable, and
  the "Countersign" name remains in tracked evidence [SA-15]. Report 00 §11.1
  (items 1 and 7) records these. An MIT licence decision exists in the
  project records (`docs/BUILD_STATUS.md:18`; not re-verified here).

### 2.6 Demo video

- [F] "Less than three (3) minutes. Judges are not required to watch beyond three
  minutes."
- [F] "Footage that shows the Project functioning on the device for which it was
  built."
- [F] Public on YouTube.
- [F] No third-party trademarks or copyrighted music without permission [EV-01].

### 2.7 Other rules relevant to Ostensia

- [F] **New and existing projects.** An existing project must be "significantly
  updated" during the period, and the entrant should explain how [EV-01].
  - [SA] The spike is dated 2026-10-28 and the implementation followed; all are
    after 2026-10-01 (Report 00).
  - [I] Low risk, but the submission could state the timeline.
- [F] **Third-party integrations** must respect their terms [EV-01]. [SA] The
  Anthropic SDK is Apache-2.0 (Report 00 §11.1).
- [F] **Judging methods** "may utilize expert panels, peer review, automated
  AI-driven analysis" [EV-01]. [I] README and description clarity matters to
  machine readers as well as humans.
- [F] **Prize categories** include "Best Use of PayPal + AI" and "Best Use of Agentic
  Commerce" ($5,000 each). A project can win at most one grand prize or honourable
  mention, plus one sponsor prize [EV-01, EV-02].
- [F] **Judges** include PayPal developer advocates, engineers, an engineering
  manager and a senior product manager [EV-02]. [I] Inaccurate PayPal claims (for
  example about what the hash or PayPal enforces) are likely to be noticed.

---

## 3. Judging criteria (official wording) and Ostensia's position

All five criteria are equally weighted [EV-01]. Ties are broken by criterion order,
starting with Technological Implementation [EV-01].

| Criterion | Official question [EV-01, EV-02] | Ostensia today [SA] | Gap |
|---|---|---|---|
| **Technological Implementation** | "How thoroughly and skillfully does the project use PayPal Developer Platform and AI tool(s)? ... a working, non-trivial implementation?" | A real sandbox lifecycle (authorize, capture, void), a deterministic gate, an audit log, two AI features [SA-01, SA-03] | Judges must be able to see it working (2.4) |
| **Design** | "Does the project deliver a complete, coherent product experience — not just a technical proof of concept?" | **No frontend** [SA-05] | **Largest gap** |
| **Potential Impact** | "A credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem based on what's demonstrated?" | Audience not yet stated (report 01) | Needs a named audience and problem (report 01, F1-2) |
| **Innovation/Idea** | "How creative and novel ... does the project differ from existing concepts?" | Item-level, explained pre-capture check (report 02) | The pitch must address AP2, Visa and Stripe (report 02 §4) |
| **Presentation** | "Does the video clearly demonstrate the project working end-to-end? Does the pitch communicate what problem is solved, who it's for, and why it matters?" | No video yet | Under 3 minutes, end to end |

---

## 4. P8: Can judges evaluate the single-vault, local-first, no-auth architecture?

### 4.1 Compatibility with the rules

| Architecture fact [SA] | Rule [EV-01] | Assessment |
|---|---|---|
| Local only; the API listens on 127.0.0.1; no hosting (Report 00 L15) | Hosting is not required, if setup and run instructions are complete | **Compatible**, provided the README makes it runnable [SA-15] |
| The payment path needs a PayPal sandbox app (client id and secret) and a vault created by a manual Postman flow plus buyer approval [SA-13] | Instructions must include the credentials, or "clear instructions for obtaining access" | **Compatible only if** (a) the entrant supplies sandbox credentials and a working vault id, or (b) the README gives a reproducible vault-setup path. Neither exists today |
| AI features need an Anthropic API key [SA-03] | Provide the keys, or instructions to obtain them | Same choice as above. Judges may not want to use their own paid key |
| No authentication; single user [SA-06] | The project must be testable "without any restriction" | **Compatible locally.** A hosted version would expose the developer's sandbox and AI key to anyone with the URL (Report 00 L9) |
| Simulated shop and scenarios, labelled [SA-04] | A non-functional demo does not qualify; simulation of the *shop* is not prohibited | **Compatible**, if the PayPal path is real and the labels are clear |

### 4.2 Conflict with the project's own security rules

- [F] The rules invite "test account credentials, API keys, or sandbox login details"
  in the testing instructions [EV-01].
- [SA] The project's instructions forbid committing credentials and require secrets
  to stay on the server (CLAUDE.md §8).
- [I] These can be reconciled. The rules allow credentials in the *testing
  instructions* (a Devpost form field), not necessarily in the repository. The rules
  also allow "instructions for obtaining access".
- **[U] This is a decision for the developer**, not for research. The options are:
  1. Sandbox-only credentials in the private Devpost testing-instructions field.
  2. README instructions for judges to create their own sandbox app and vault.
  3. A hosted demo with a passcode.
  4. Video-led judging plus option 2.

  Options 1 and 3 mean revoking or rotating the credentials after judging.

### 4.3 What a deterministic scenario can show, and what needs real PayPal

| Demonstration element | A deterministic scenario is sufficient | Needs a real PayPal sandbox interaction |
|---|---|---|
| Natural language to a draft mandate; the person fills gaps and confirms | n/a (AI; labelled) [SA-03] | No |
| An over-limit cart is blocked before any PayPal call | **Yes:** scenarios are deterministic [SA-04]; no PayPal call by design [SA-01] | No (absence of a call is the point) |
| A compliant cart is authorized and captured | No: the claim is about PayPal | **Yes** [SA-01] |
| The mandate is revoked after authorization, then voided | Trigger deterministic | **Yes** (void) [SA-01] |
| The AI agent proposes a cart | AI; outcome varies [SA-17] | Only if shown going to capture; **untested** [SA-03] |
| Explanation and audit record | Yes (from the gate's own log) | Shows real PayPal ids only if run for real |
| Failure or ambiguous outcomes (timeouts, pending) | Stub only [SA-02] | Never observed; **do not show as real** |

**Answer to P8:**
- [I] The architecture can satisfy the rules **if** the judge-access path is decided
  and documented, the README is made accurate, and the frontend gives a coherent
  experience.
- [I] Because judges may score from the video alone [EV-01], the video is the
  primary channel.
- [I] The block can come from a deterministic scenario. The capture and void should
  be real sandbox runs.
- [I] The access decision changes what the frontend needs: a configuration or
  "bring your own credentials" screen, a hosted passcode gate, or neither. That is
  why it is **MUST RESOLVE BEFORE INCREMENT 7**.

---

## 5. Risks to the submission

1. **[SA] No frontend** against the Design criterion [SA-05].
2. **[SA] Judges cannot run the payment path today** [SA-13, SA-15].
3. **[SA] The repository is private, and the README is stale** [SA-15].
4. **[SA] Flaky tests** if judges run them [SA-21].
5. **[I] Time.** The deadline is one week from the research date (2026-11-12 12:00 PT).
6. **[I] Overclaiming** to PayPal judges (report 03 §8).
7. **[F] Rules can change** [EV-01]; re-read them before submitting.

---

## 6. Findings and impact labels (this report)

| # | Finding | Impact label | Evidence |
|---|---|---|---|
| F4-1 | The judge-access model (credentials in testing instructions, judges' own sandbox, hosted with passcode, or video-led) must be decided; it shapes the frontend | MUST RESOLVE BEFORE INCREMENT 7 | EV-01; SA-13, SA-15, SA-06 |
| F4-2 | The rules' invitation to share credentials conflicts with the project's secrets rule unless the credentials stay out of the repository and are sandbox-only and revocable | MUST RESOLVE BEFORE INCREMENT 7 | EV-01; CLAUDE.md §8 |
| F4-3 | "Design" requires a complete, coherent product experience; the frontend is the largest scoring gap | SHOULD INFLUENCE INCREMENT 7 | EV-01; SA-05 |
| F4-4 | Judges may judge on the video and text alone; the video must show the end-to-end flow in under 3 minutes | SHOULD INFLUENCE INCREMENT 7 | EV-01 |
| F4-5 | Use deterministic scenarios for the block; real sandbox runs for capture and void; do not show the agent cart captured until it has been run for real | CAN BE DEFERRED UNTIL INCREMENT 8 | SA-03, SA-04, SA-17 |
| F4-6 | Public repository, visible open-source licence, accurate README with run instructions, and tool identification are mandatory | CAN BE DEFERRED UNTIL INCREMENT 8 | EV-01, EV-02; SA-15 |
| F4-7 | PayPal and AI usage both meet the "meaningful" requirement | NO CHANGE RECOMMENDED | EV-01, EV-02; SA-01, SA-03 |
| F4-8 | The deadline is 12:00 pm PT (not 2 pm); re-check the rules before submitting | CAN BE DEFERRED UNTIL INCREMENT 8 | EV-01, EV-03; PR-02 |
| F4-9 | The intermittent test failure is a risk if judges run the suite | CAN BE DEFERRED UNTIL INCREMENT 8 | SA-21 |

---

## 7. Limitations

- The rules were retrieved by `curl` because automated fetching was blocked. The
  converted text was read in full, but the page carries no version date.
- The Devpost FAQ and Updates pages were not read and may hold clarifications.
- What judges will *actually* do (run the build or watch the video) cannot be known.
  The rules allow either [EV-01].

## 8. Conclusion

- [I] Ostensia satisfies the substantive requirements: meaningful PayPal and AI use,
  and a real working payment path.
- [I] The judge-facing parts that the rules require do not exist yet: a runnable
  public repository with an accurate README, an access path, a frontend and a video.
- [R] Decide the access model first. It is the one requirement-driven question that
  changes what Increment 7 has to build.
