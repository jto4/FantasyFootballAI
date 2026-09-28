# Manual review: macOS signing workflow

Date: 2026-09-28

## Scope

Reviewed `.github/workflows/desktop-packages.yml`, `apps/desktop/forge.config.cjs`, and
`docs/release-process.md` for the newly added macOS Developer ID signing and notarization
path. This is a manual code review; no automated security scan was run.

## Findings and changes

- Version-tag jobs execute tagged repository build code while signing credentials are present.
  Added a workflow guard requiring each `v*` tag commit to be reachable from `main`. Release-tag
  creation should remain limited to trusted maintainers and protected by repository rules.
- Tag builds fail if the certificate or any Apple notarization credential is missing, preventing
  an unsigned artifact from being silently assembled as a release candidate. Manual packaging
  smoke runs receive no signing secrets and remain unsigned.
- The certificate is decoded to the runner's temporary directory, imported into a temporary
  keychain, and the temporary `.p12` file is removed. The hosted runner is ephemeral; keychain
  destruction is therefore delegated to runner teardown.
- Apple credentials are sourced from GitHub Actions secrets and exported only to subsequent
  steps in that job through `GITHUB_ENV`. They are not written to the repository or release
  artifacts. Reviewers should preserve log masking and avoid adding shell tracing to these steps.
- Package jobs have read-only repository permissions. Only the separate draft-assembly job has
  `contents: write`; it runs after the packaging matrix succeeds.

## Remaining validation

No credentialed hosted build has exercised certificate import, signing, or notarization. A
maintainer must configure the documented secrets, run a version-tag workflow against a commit
on `main`, inspect Apple's notarization result, and verify Gatekeeper installation before
publishing. The repository owner should also enforce trusted tag creation in repository rules.
