# Resend inbox import code and privacy review

Date: 2026-09-28

Scope: the owner-triggered Resend inbox list and import routes, the fixed-origin Resend
received-email adapter, and the associated API tests. This was a manual review of the
changed code; no automated security scan was run.

## Review notes

- Inbox listing retrieves bounded headers only. Message bodies are fetched only after an
  explicit dashboard action.
- Provider requests use the fixed Resend API origin, reject redirects, and apply request
  timeouts and response-size limits. Returned email identifiers and sender metadata are
  validated before use.
- Imported content is stored locally by sender and provider message ID. Quoted history is
  removed before source text is persisted or sent to the configured AI provider. AI analysis
  requires the separate import-analysis opt-in.
- Inbound sender addresses never populate outbound recipient settings, and these routes do
  not send email or reply to a received message.
- The review found that member memory could be disabled while the Resend body request was in
  flight, yet the prior settings snapshot could still authorize AI analysis. The importer now
  re-reads memory settings after retrieval and refuses the import before AI access if memory
  has been disabled. A regression test covers this timing.
- Credential-store, authentication, and provider errors are returned as generic actionable
  messages without exposing keys or native backend details.

## Validation

- `npm run typecheck --workspace @sidekick/api`
- `npm test --workspace @sidekick/api -- --run src/received-email-routes.test.ts`
- Full `npm test`, lint, format check, production build, and packaged macOS API/dashboard/MCP
  smoke checks are run separately and recorded in `docs/tasks.md`.

No unresolved finding was identified within this review's scope. Live Resend account behavior
and provider-side inbox configuration remain owner verification items.
