# Provider route refactor review

Date: 2026-09-28

## Scope

Reviewed the extraction of OS credential listing, saving and deletion, Twilio and Resend setup checks, AI runtime validation, and API model discovery from `apps/api/src/index.ts` into `apps/api/src/provider-routes.ts`.

## Manual review

- Provider secrets remain in the OS credential store; status responses expose configured state only.
- Provider and CLI exception details are not returned to the dashboard.
- Twilio setup validation performs a credential check without sending a message.
- Resend setup email still requires the explicit `SEND_TEST` confirmation and a validated recipient.
- Deleting a BlueBubbles credential also removes its separately stored webhook bearer token.
- API model discovery is unavailable to CLI runtimes and reads the API key only at request time.
- A missing credential value returns a bounded validation response rather than reaching the credential backend.

## Validation

- `apps/api/src/provider-routes.test.ts`: route behavior and error-handling tests pass.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check` pass on the local macOS ARM workspace.
- No automated security scan was run; repository guidance excludes those scans.

No actionable issue was found in this scoped route refactor. Live provider-account verification remains a separate release gate.
