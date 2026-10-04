# Member memory route refactor review

Date: 2026-09-28

## Scope

Reviewed moving member-profile update, delete, export, and source-view endpoints from `apps/api/src/index.ts` into `apps/api/src/member-memory-routes.ts`.

## Manual review

- Profile edits validate each owner-editable field and league scope before writing state.
- Edit responses omit imported source text and private author identifiers.
- Profile export retains owner-managed profile/source data while omitting private source-author identifiers.
- Source text is returned only from the explicit profile source endpoint; missing profiles return 404.
- Deleting a profile set clears the legacy BlueBubbles sync cursor as before.
- Missing fields and invalid league scopes return a bounded 400 response without mutating profiles.

## Validation

- `apps/api/src/member-memory-routes.test.ts`: profile update, validation, export, source, and deletion cases pass.
- Full test, typecheck, lint, formatting, production build, and diff checks pass for this change on the local macOS ARM workspace.
- No automated security scan was run; repository guidance excludes those scans.

No actionable issue was found in this scoped route refactor.
