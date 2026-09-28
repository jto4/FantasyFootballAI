# Focused review: group-chat member-context sharing

Date: 2026-09-27

Scope: manual review of the new independent opt-in for sending reviewed member-profile notes
with SMS and iMessage mention replies. This is a focused change review, not the full release
code or security review.

## Findings and changes

- Group-chat reply generation no longer reuses the report-context opt-in. The reply path checks
  `memoryEnabled` and `includeMemberContextInChatReplies` independently.
- A profile remains omitted when its per-profile AI-context preference excludes it or when its
  saved league scope does not include the selected reply league.
- The context builder includes bounded editable notes and preferences, not original imported
  source text. It caps aggregate context at 32,000 characters and identifies omitted profiles.
- Older persisted settings normalize the new opt-in to `false`. The Settings API rejects
  non-boolean values, and the dashboard exposes the report and chat switches separately.
- Tests cover distinct report/chat opt-ins, the master memory control, state persistence,
  API input validation, and the Settings disclosure.

## Remaining limits

- After an owner opts in, the selected AI provider receives eligible profile notes as part of
  the reply prompt. Provider retention and processing remain governed by that provider.
- Prompt instructions cannot guarantee that a model will follow every member preference or
  topic boundary. Review drafts before sending unless the owner separately enables automatic
  replies.
- This review does not cover the whole release or live Twilio/BlueBubbles behavior. No
  automated security scan was run.
