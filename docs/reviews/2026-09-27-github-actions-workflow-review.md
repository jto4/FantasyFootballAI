# GitHub Actions workflow review — 2026-09-27

## Scope

Manual review of `.github/workflows/ci.yml`, `.github/workflows/desktop-packages.yml`, and
the new `.github/dependabot.yml`. This is a focused workflow code review, not an automated
security scan or a release approval.

## Findings and changes

- CI uses `pull_request` and `push` with repository-wide `contents: read`; it does not use
  `pull_request_target` or expose a write token to build and test jobs.
- The desktop release workflow grants `contents: write` only to the draft-release job.
  Platform package jobs upload artifacts with the standard artifact service and retain the
  repository's read-only token permission.
- External GitHub Actions were referenced by mutable major-version tags. The workflows now
  pin checkout, setup-node, upload-artifact, and download-artifact to reviewed full commit
  SHAs, with release tags in comments for maintainability. Dependabot version updates are
  configured for npm workspaces weekly and GitHub Actions monthly so proposed updates can be
  reviewed and pinned deliberately.
- Release artifact paths and the tag name flow through GitHub expressions or environment
  variables; untrusted pull request text is not interpolated into a shell command.

## Remaining operational checks

- GitHub-hosted workflow execution cannot be verified from this local checkout. Confirm the
  workflows on the public repository after publication.
- Protect the default branch and release tags in repository settings; those settings are not
  represented in this checkout.
- Review Dependabot update pull requests before merging. This configuration requests version
  updates; it does not enable vulnerability scanning.

## Result

No additional workflow changes were identified in this scoped manual review. Re-review the
workflow files when their triggers, permissions, artifact flow, or release behavior changes.
