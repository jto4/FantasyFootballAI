# Upload artifact Node 24 update review — 2026-09-28

## Scope

Manual review of the `actions/upload-artifact` pin update in the CI and desktop package
workflows. This is a focused dependency and workflow review, not an automated security scan.

## Findings and changes

- GitHub-hosted workflow logs reported the previous v4.6.2 pin running on the deprecated
  Node.js 20 action runtime.
- The workflows now pin v6.0.0 to its full commit SHA
  (`b7c566a772e6b6bfb58ed0dc250532a479d7789f`). The upstream release declares `node24`,
  and its upload inputs used here are unchanged.
- The v6.0.0 release requires Actions Runner 2.327.1 or newer; these workflows use
  GitHub-hosted runners. Verify all three artifact-upload paths in hosted CI after the update.

## Result

No additional workflow changes were identified in this scoped review. Re-review when the
artifact flow or action version changes.
