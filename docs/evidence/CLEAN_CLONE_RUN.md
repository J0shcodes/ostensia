# Clean-clone run and publication review (Increment 8, D-026 verification)

Date started: 2026-11-07. Branch: demo-hardening (from main at bfd3e93).

Purpose: show that someone who has only the repository and the README can run Ostensia
(D-026, verification items 1 to 3), and record what was checked before the repository is made
public.

## Part 1: checked by the assistant (placeholder values, no PayPal, no AI key)

A fresh `git clone` of the local repository at bfd3e93 into a scratch folder, then only the
README's commands. The PayPal values were placeholders, so nothing reached a real PayPal account.

| Step | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Passed (123 packages, about 19 s). |
| `pnpm test` | 68 files, 1958 tests passed, with no network or credentials. |
| `pnpm typecheck` | Passed. |
| `pnpm --filter @ostensia/api start` with no `.env` | Stops with "PAYPAL_CLIENT_ID is required." and exit code 1, as the README says. |
| `cp apps/api/.env.example apps/api/.env` and placeholders, then start the API | Starts on http://127.0.0.1:4000. It logs that the AI features are off. |
| `pnpm --filter @ostensia/web dev` | Starts on http://127.0.0.1:3000. `/api/health` through the web app returns `ok`; `/`, `/attempts` answer 200. |
| `POST /mandates/draft` with no Anthropic key | Answers `drafting_unavailable` / `not_configured` (D-026 verification 2: AI off). |
| A mandate entered by hand, the "Over quantity" simulated cart, `POST /attempts` | Status `blocked_precheck`, with the explanation "The total quantity of product sticker-pack is 3, above the limit of 2." The audit file `apps/api/data/audit.jsonl` was created. |

Not checked by the assistant, because they need real PayPal Sandbox values: creating the app and
the vault (README steps 1 and 2), a capture, and a revoke-then-void. Those are Part 2.

## Part 2: the developer's run (8b), from a fresh clone, README only

Do this in a new folder, with a new `apps/api/.env`, and follow only the README. If a step is
missing, unclear or wrong, that is a README defect: note it here and I fix it.

- [ ] Clone the repository (the public URL, once it is public) into a new folder.
- [ ] `pnpm install`, `pnpm test`, `pnpm typecheck` pass.
- [ ] README "Create the PayPal Sandbox pieces" works as written (note any step that does not,
      for example a dashboard label that differs, or the vaulting setting).
- [ ] The Postman steps 00.1, 01a.1, the manual approval, 01b.1 and 01b.2 give a vault id.
- [ ] `apps/api/.env` filled as the README says, the API starts, the web app shows
      "Ostensia API available".
- [ ] One **capture** (README "Try it", step 2), one **pre-check block** (step 3) and one
      **revoke-then-void** (step 4) all behave as the README says.
- [ ] Run once with `ANTHROPIC_API_KEY` empty: the UI says AI is off and the manual form still
      works through a capture and a block (D-026 verification 2).
- [ ] No credential appears in the repository, the README, screenshots or the video
      (D-026 verification 3).

Result: (to be completed by the developer)

Steps the README got wrong or left out: (to be completed)

## Publication review

Scope: every tracked file (246 at bfd3e93) and the Git history (46 commits), before the
repository is made public. Method: pattern searches (not a manual read of every line) plus a
manual look at the files most likely to hold something private.

| Check | Finding |
|---|---|
| Tracked environment files | Only the two `.env.example` files. `.env` is ignored and was never committed (the history holds no `.env` file). |
| Secret patterns (Anthropic keys, client secrets, bearer tokens, JWTs, private keys) in files and in the whole history | None found. |
| Email addresses in files and added lines of history | None (apart from the `noreply` attribution lines). |
| PayPal-style ids in the documents | None; the evidence uses shortened or placeholder ids. |
| Local paths, usernames | None in tracked files. |
| `docs/evidence/spike/ostensia-spike.postman_environment.json` | Tracked although `.gitignore` has a pattern for Postman environments. I read every value: all are empty, defaults or example URLs, so it works as a template. |
| The two Postman collections | Variable names and requests only; no values. |
| `docs/research/` | Competitor and market research. On 2026-11-07, with the developer's approval, it was removed from the default branch and kept unchanged on the `research-archive` branch. It is still public through that branch and the Git history; the move only keeps the default branch focused. The four path references in the records were updated. |
| Commit author | History carries the developer's Git name and email address. The repository was made public on 2026-11-07 (by the developer), so that address is already visible; hiding it would need a new repository or a history rewrite, which was not chosen. |
| Licence | MIT, "Copyright (c) 2026 J0shcodes", at the root and in the package manifests. |

Limits of this review: pattern searches miss a secret in an unusual format; they do not replace
the developer's own look at the files. Nothing was changed because of this review.
