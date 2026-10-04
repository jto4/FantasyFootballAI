# Manual review: untrusted AI prompt data

Date: 2026-09-28

## Scope

Reviewed imported conversation analysis, live group-chat member analysis and replies, and report
generation for prompt construction from provider-controlled or imported values. No automated
security scan was run.

## Changes

- Added `apps/api/src/prompt-data.ts` to JSON-encode source values inside named data blocks,
  escape `<`, `>`, and `&` so message content cannot forge or close the enclosing XML-like block,
  and enforce a 96 KB encoded-data limit for each block.
- Applied the helper to conversation imports, BlueBubbles and Twilio member-analysis prompts,
  group-chat reply prompts, and report evidence containing league snapshots, member notes, news,
  injury data, and owner-imported projection citation sources.
- Kept explicit system instructions that source fields are evidence, not directions. The model
  may still misunderstand hostile text; data boundaries reduce ambiguity but cannot guarantee
  model compliance.
- Added adversarial-input tests for delimiter and instruction-like text in imported messages,
  member notes, and chat prompts, plus a bound test for oversized prompt data.

## Validation

The full `npm test` suite passed after this change. The API workspace passed all 202 tests across
41 test files, including the hostile-import, hostile-chat, and prompt-data-bound cases; the
service integration suite passed all 10 API-process tests. Typecheck, lint, and formatting also
passed. This review checks prompt handling only; it does not certify model behavior or replace
owner review of generated drafts.
