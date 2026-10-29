# Sanitized PayPal Spike Evidence

This directory contains reference material from the Ostensia PayPal sandbox spike, not production application code.

The original Postman environment, unredacted runner reports and raw
spreadsheet remain outside the public repository.

Before adding any artifact here:
- Remove actual client secrets, access/refresh tokens and JWT assertions.
- Replace buyer/merchant emails and real test identifiers where not needed.
- Remove credentials from Authorization headers and scripts.
- Check request bodies, examples and embedded report text.
- Inspect the staged diff before committing.

The authoritative summary of results is docs/spike-findings.md.

Do not load raw evidence by default or treat Postman scripts as production
implementation. Port only reviewed assertions and test cases into the
application's actual test suite.