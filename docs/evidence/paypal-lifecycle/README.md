# PayPal lifecycle evidence (E-1)

Sanitized observations from the sandbox authorization lifecycle run, used to validate the PayPal adapter behaviour for Increment 3.

Contains only placeholders for IDs. Credentials, tokens, vault IDs, raw API responses, payer data and the Postman environment are never committed.

Files:

- `E1_RESULTS.md`: the observed results, with a dated addendum of details the developer supplied afterwards.
- `ostensia-e1.postman_collection.json`: the requests used for the run (the E1-C and E1-V folders, plus the vault setup and earlier spike folders). It holds variable names only, no values. A pattern scan on 2026-11-02 found no tokens, JWTs, emails, client ids or secret values. That scan is not a manual review (TD-002).