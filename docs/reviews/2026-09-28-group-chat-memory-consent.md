# Group chat sync memory-consent review

Date: 2026-09-28

Scope: the iMessage and Twilio Conversations history-sync paths, their AI analysis and
mention-reply stages, and the post-provider settings guard. This was a focused manual code
and privacy review; no automated security scan was run.

## Review notes

- Both sync paths take an initial settings snapshot before retrieving remote history. The
  prior implementation kept using that snapshot after the provider request, which could
  allow a conversation that had been disabled or reconfigured during the wait to proceed to
  AI analysis.
- Both paths now reload settings after history retrieval and before each AI stage. They stop
  when member memory is off, the configured chat target changed, or an automatic poll was
  disabled while the provider request was in flight.
- Member conversation analysis checks the current memory and analysis opt-in before each
  participant-specific AI call. Mention-reply generation receives a fresh state snapshot
  after history retrieval; iMessage also refreshes once more after member analysis.
- Mention-reply generation now performs a synchronous last-moment check immediately before
  each model call, after asynchronous provider construction. It re-reads the destination,
  background polling and reply toggles, selected league, and the exact member-context text
  that would be sent. A mismatch aborts before calling the model.
- The final SQLite update still checks memory, target, polling, and reply controls before it
  stores imported text, advances cursors, or saves drafts. This prevents an in-flight request
  from persisting after an owner disables its settings.
- A shared pure guard is covered for enabled manual sync, memory opt-out, target changes, and
  disabled background polling. A second shared guard now covers the final pre-generation
  check for reply opt-out, target and background-poll changes, selected-league changes, and
  changes to member-context sharing; both iMessage and Twilio use this same implementation.

## Validation

- `npm run typecheck --workspace @sidekick/api`
- `npm run test --workspace @sidekick/api -- src/chat-reply-consent.test.ts src/chat-replies.test.ts`
- Full `npm test`, `npm run typecheck`, `npm run lint`, and `npm run format:check`
- Full project tests, lint, format check, production build, and packaged smoke checks are
  recorded separately in `docs/tasks.md`.

Live BlueBubbles and Twilio account behavior remains unverified. No unresolved finding was
identified within the reviewed settings-refresh path.
