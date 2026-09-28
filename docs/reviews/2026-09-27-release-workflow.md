# Manual code review: desktop release workflow

- **Reviewer:** Codex
- **Date:** 2026-09-27
- **Review type:** Focused source review; not a release-candidate review
- **Automated security scans:** Not run, per repository policy

## Scope and finding

Reviewed `.github/workflows/ci.yml`, `.github/workflows/desktop-packages.yml`, and
`scripts/assemble-release-assets.sh`. The draft-release job previously copied the setup
guide without checking out the tagged source. Added a checkout step so the guide and
license are available in that job. Extracted archive assembly into the shared script,
which rejects an unexpected platform set, a missing native installer, an unsafe version
tag, or a non-empty output directory before preparing release assets.

## Verification

- `bash -n scripts/assemble-release-assets.sh` passed.
- `npm run test:release` supplies one sample `.dmg`, `.exe`, and `.deb`; it produces three
  ZIP archives containing `INSTALL.md` and `LICENSE`, matching standalone assets, and a
  SHA-256 manifest that validates with `shasum` or `sha256sum`. It also confirms a missing
  Windows installer is rejected without leaving partial release assets.
- `npm run format:check` passed.

## Limits and follow-up

The GitHub Actions workflow has not run on a hosted runner, and no release was created.
The source checkout has no Git metadata for identifying a release commit. This review
does not verify signing, end-user installation, native Windows/Linux behavior, or the
release-candidate checklist. Complete the full `SECURITY.md` review for each candidate;
this note does not replace it.
