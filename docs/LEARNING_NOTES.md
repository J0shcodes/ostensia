# Ostensia Learning Notes

The "Explain it to a judge" and "Questions I still cannot answer" fields
are for the developer to write in their own words.

## Topic: Authorization, capture and void

### Plain-language explanation
An authorization places a hold on the buyer's funds. A capture moves the
money to the merchant. A void releases the hold without moving money. PayPal
documents a 3-day honor period for capturing, and an authorization stays
valid for up to 29 days. Capture and void are only possible while the
authorization status is CREATED. After a full capture, a void is refused
with 422 PREVIOUSLY_CAPTURED.

### Where it appears in Ostensia
Planned: the payment-action rules in packages/domain (Increment 2) and the
PayPal adapter's capture and void methods (Increment 4).

### Why this design was selected
Keeping the three operations distinct means the code never treats "money
held" as "money taken".

### Alternative
Charging immediately (intent CAPTURE). It was not selected because the
spike evidenced the authorize, capture and void paths, and the gate needs
a point between holding and taking the money.

### Failure case
A capture that times out. The outcome is unknown, so the application reads
the authorization state instead of assuming failure.

### Evidence
Not yet, see Increments 2 and 4. Spike evidence: steps 02.4 (capture) and
03.3 and 03.4 (void, status VOIDED).

### Explain it to a judge
(To be written by the developer.)

### Questions I still cannot answer
- (To be written by the developer.)

## Topic: A hash binds a mandate but does not enforce it

### Plain-language explanation
The mandate hash is a fingerprint of the confirmed mandate. PayPal stores
it in custom_id and returns it unchanged, but PayPal never reads it or
refuses a payment because of it. It is also not a signature, because anyone
who can create an order can put any string there.

### Where it appears in Ostensia
Planned: canonical hashing in packages/domain (Increment 2). The spike
showed the round-trip in step 02.3.

### Why this design was selected
The hash lets the audit show which exact mandate a payment claimed to
follow, and lets us detect a mismatch by recomputing it. Whether the
purchase obeyed the mandate is decided only by deterministic evaluation.

### Alternative
Relying on the hash as the control. It was not selected because the hash
only proves a claim, not compliance.

### Failure case
A payment carries a hash that does not match the confirmed mandate. The
final evaluation treats this as a violation and blocks capture.

### Evidence
Not yet, see Increment 2.

### Explain it to a judge
(To be written by the developer.)

### Questions I still cannot answer
- (To be written by the developer.)

## Topic: Fail-closed evaluation

### Plain-language explanation
The evaluator returns "allow" only when every rule passes. Invalid input,
a missing value, an unknown payment status or a missing current time all
produce "block" (or no action), never "allow".

### Where it appears in Ostensia
Planned: the evaluator and the payment-action rules in packages/domain
(Increment 2).

### Why this design was selected
CLAUDE.md forbids capturing when the policy result is missing, invalid or
unknown. Failing closed makes every unexpected condition safe by default.

### Alternative
Failing open, or throwing and letting the caller decide. It was not
selected because a forgotten catch block could then lead to a capture.

### Failure case
PayPal returns a status string that nothing maps. It becomes "unknown" and
no write is performed.

### Evidence
Not yet, see Increment 2.

### Explain it to a judge
(To be written by the developer.)

### Questions I still cannot answer
- (To be written by the developer.)

## Topic: Vault order versus buyer-approved order

### Plain-language explanation
In the standard flow, the buyer approves the order, the order becomes
APPROVED, and the merchant calls the authorize endpoint. In the spike, an
order created with a previously approved vault_id already had an
authorization, and a later authorize call returned 422
ORDER_ALREADY_AUTHORIZED.

### Where it appears in Ostensia
Planned: the PayPal adapter (Increment 3). It has no authorize method.

### Why this design was selected
Calling authorize on an already-authorized order fails, and a blind second
call is exactly what CLAUDE.md forbids. The adapter inspects the order and
authorization instead.

### Alternative
Calling authorize anyway and ignoring the 422. It was not selected because
it hides the real state.

### Failure case
The order has status APPROVED but no authorization. The attempt is marked
as an anomaly, and no write is performed.

### Evidence
Not yet, see Increment 3. Spike evidence: steps 02.2 and 02.3.

### Explain it to a judge
(To be written by the developer.)

### Questions I still cannot answer
- (To be written by the developer.)

## Topic: A 2xx response on create is not proof of authorization

### Plain-language explanation
The spike's create-order test accepted both APPROVED and COMPLETED as the
order status. The proof that an authorization existed came from finding it
on the order (step 02.3) and from the 422 on the later authorize call, not
from the 2xx response on create.

### Where it appears in Ostensia
Planned: the PayPal adapter and the gate (Increments 3 and 5).

### Why this design was selected
The code reads the authorization's own status before any capture or void,
and treats an order with no authorization as an anomaly.

### Alternative
Trusting the HTTP status code. It was not selected because the evidence
does not support it.

### Failure case
Create returns 201, but the response has no authorizations. The adapter
re-reads the order once. If there is still none, the outcome is unknown and
no write is performed.

### Evidence
Not yet, see Increment 3. E-1 will record the actual status values.

### Explain it to a judge
(To be written by the developer.)

### Questions I still cannot answer
- (To be written by the developer.)

## Topic: Idempotency and ambiguous timeouts

### Plain-language explanation
A timeout does not tell us whether PayPal performed the operation. Request
ids are deterministic per attempt and operation, so a repeated request
carries the same PayPal-Request-Id. Writes are never retried automatically.
The next step after a timeout is to read the current state.

### Where it appears in Ostensia
Planned: the PayPal adapter and the gate (Increments 3 to 5).

### Why this design was selected
It prevents a duplicate capture, which cannot be undone.

### Alternative
Retrying automatically with backoff. It was not selected because, until E-1
tests the replay behaviour, we cannot rely on PayPal returning the original
result.

### Failure case
A capture times out and the capture actually succeeded. Reconciling finds
the authorization already CAPTURED and records it, with no second capture.

### Evidence
Not yet, see Increments 4 and 5. PayPal's documentation shows a repeated
capture request id returning the existing result. We have not tested it.

### Explain it to a judge
(To be written by the developer.)

### Questions I still cannot answer
- (To be written by the developer.)

## Topic: Node type stripping and the workspace link

### Plain-language explanation
Node 24 can run a .ts file directly by deleting the type annotations
before running it. It does no type checking. TypeScript (tsc --noEmit) is
a separate step that checks types and produces no output. pnpm links
packages/domain into apps/api, and the domain package's exports field
points at its .ts source, so the API imports it with no build step.

### Where it appears in Ostensia
package.json and tsconfig.base.json at the root, packages/domain/package.json
(exports), apps/api/src/server.ts (the import of DOMAIN_NAME) and the
start script in apps/api/package.json.

### Why this design was selected
It needs no tsx and no compile step, so there is less to understand and
less to break. The tsconfig flags make TypeScript reject syntax that
Node cannot strip, so a type check that passes means the files use only
syntax Node can strip. It does not prove they run correctly.

### Alternative
tsx, or compiling the domain package to JavaScript. Neither was selected
because they add a dependency or a build step with no benefit yet.

### Failure case
Using syntax that needs real compilation, such as an enum. tsc fails
because of erasableSyntaxOnly, before Node ever runs it.

### Evidence
Increment 1: node ran apps/api/src/index.ts with the pnpm start flags and
GET /health returned the domain package's name (see D-014).

### Explain it to a judge
(To be written by the developer.)

### Questions I still cannot answer
- (To be written by the developer.)

## Topic: Canonical JSON and the mandate hash

### Plain-language explanation
JSON can describe the same data in many ways: keys in any order, extra
spaces. A hash of the text would change each time. Canonical JSON picks one
way to write it (keys sorted, no spaces, only whole numbers), so the same
mandate always gives the same text and therefore the same SHA-256.

### Where it appears in Ostensia
packages/domain/src/canonical.ts (canonicalize, canonicalMandateBinding)
and apps/api/src/mandate-hash.ts (hashMandate).

### Why this design was selected
The domain package produces the text and stays pure. Only the API touches
node:crypto (D-015). The hash covers what the user confirmed and what is
enforced (id, version, terms), so revoking a mandate does not change it.

### Alternative
Hashing JSON.stringify output directly. It was not selected because the
result depends on key order.

### Failure case
A mandate containing undefined, a fraction or a Date. canonicalize throws,
so no hash is produced for something that cannot be written exactly.

### Evidence
canonical.test.ts (golden string, key order, rejected values) and
mandate-hash.test.ts (the golden hash was computed with sha256sum).

### Explain it to a judge
(To be written by the developer.)

### Questions I still cannot answer
- (To be written by the developer.)

## Topic: Why quantity is summed per product

### Plain-language explanation
A mandate says "at most 2 jackets". If each cart line were checked alone, a
cart with three lines of one jacket each would pass every line check and
still buy three. The evaluator adds up the quantity of each product across
all lines before comparing with the limit. The total price works the same
way: it is computed from unit prices and quantities, and the declared total
is only compared with it.

### Where it appears in Ostensia
packages/domain/src/evaluate.ts (quantityByProduct, computeTotal).

### Why this design was selected
Each rule closes a specific bypass (D-017). The caller never decides the
total.

### Alternative
Checking each line alone and trusting the declared total. Neither was
selected because both are easy to get around.

### Failure case
A cart that splits one product over lines, or declares a low total. The
evaluator blocks with QUANTITY_EXCEEDED or TOTAL_MISMATCH.

### Evidence
evaluate.test.ts ("sums quantity per product..." and the total tests).
Mutating the sum into a per-line check made 3 tests fail.

### Explain it to a judge
(To be written by the developer.)

### Questions I still cannot answer
- (To be written by the developer.)

## Topic: How we know the tests are meaningful

### Plain-language explanation
Passing tests only show that the code agrees with the tests. Two extra
checks show that the tests can actually fail. A differential test compares
the evaluator with a second, simpler implementation (using BigInt) on 2000
seeded random cases. A mutation check deliberately breaks one rule at a
time and confirms that some test fails.

### Where it appears in Ostensia
packages/domain/src/evaluate-differential.test.ts, and the mutation run
recorded in BUILD_STATUS (16 of 16 caught).

### Why this design was selected
The safety claim is "never capture unless the result is allow", so the
rules need tests that notice when a rule is weakened.

### Alternative
Only example-based tests. They were not selected because they can all pass
while a boundary such as > versus >= is wrong.

### Failure case
A mutation that no test catches. It would show a rule with no real test.

### Evidence
The mutation run changed a rule in evaluate.ts, money.ts or canonical.ts 16
times, and each change made at least one test fail. One change (removing the
range check in mulMinor) was caught only by the money tests, because the
addition step also catches the overflow.

### Explain it to a judge
(To be written by the developer.)

### Questions I still cannot answer
- (To be written by the developer.)

## Template for later entries

## Topic: [Concept]

### Plain-language explanation
Explain the concept as if teaching another developer.

### Where it appears in Ostensia
Files, functions, interfaces and request flow.

### Why this design was selected
What problem does it solve?

### Alternative
What is another reasonable approach, and why wasn't it selected?

### Failure case
What could go wrong, and how does the application respond?

### Evidence
Test or code path that demonstrates this behavior.

### Explain it to a judge
A concise explanation in my own words.

### Questions I still cannot answer
- [Question 1]
- [Question 2]
