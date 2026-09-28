# Yahoo OAuth route refactor review

## Scope

Moved Yahoo OAuth status, client credential management, authorization start, and code
completion handlers from the API entry point into `apps/api/src/yahoo-oauth-routes.ts`.
The router owns its single-use, ten-minute authorization state and accepts injected
credential and OAuth-client operations for focused route tests.

## Findings

- No correctness issue found in the refactor.
- Credential-store errors are returned as sanitized `503` responses on the status, client,
  and authorization-start routes instead of implying that credentials are absent.
- Authorization codes still require the current unexpired state and are consumed before
  exchange; a replay or mismatched state cannot reach token exchange.
- The status response reports configuration state and never returns credentials or tokens.
- Live Yahoo application approval and account exchange remain owner-managed and unverified.
- No automated security scans were run, per repository policy.

## Validation

- API typecheck passed.
- API workspace tests passed: 42 files, 213 tests.
- Route tests cover status privacy, input trimming/validation, one-time exchange, state mismatch,
  replay, and credential-store outage sanitization.
- Formatting and `git diff --check` passed.
