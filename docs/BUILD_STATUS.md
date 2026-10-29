# BUILD_STATUS

Maintain a compact status note that identifies the current increment, what has passed, what is broken, the next approved task and the next comprehension gate. This is the file you should review at the beginning of every new Claude Code session.

## Status

- **Current increment:**
- **Passed:**
- **Broken:**
- **Next approved task:**
- **Next comprehension gate:**

## C7. Guardrails for Git, tests, dependencies and secrets

Use these rules for the entire build.

### Git and branching

Keep a stable `main` branch and work on one feature branch for the MVP, or use a simple branch-per-increment strategy if you are comfortable with it. Commit after each completed and verified increment, for example `feat/mandate-review` or `test/policy-engine`. Don't let Claude amend previous commits, reset branches or push code without approval.

### Tests

Require a test for every deterministic policy rule and a reproducible test of each core payment path. Test the expected negative path just as seriously as the positive path. For sandbox operations, use the smallest reliable integration test set and record the real request/result evidence with secrets removed.

### Dependencies

Claude must explain any proposed package in terms of need, alternatives, version compatibility, bundle/runtime impact and maintenance cost before adding it. If a feature can reasonably be implemented with the existing stack, don't add another library just because it is convenient.

### Secrets

Keep secrets out of browser-accessible code, public files, commits and logs. Use a `.env.example` with variable names but no real values. Rotate exposed credentials if they are accidentally committed or recorded.

### Ask before

Any framework or architecture change, new service, new database, payment behavior change, sensitive configuration change, destructive migration, file deletion, new external API, deployment, Git push, commit, licensing change or substantial scope expansion.

## C8. Recovery prompts

You need three different recovery workflows because a broken feature, a gap in understanding and an out-of-scope change are different problems.