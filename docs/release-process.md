# Release process

Version tags (`v*`) run the desktop packaging matrix and assemble a draft GitHub Release. The
tag must exactly match the root `package.json` version so installers and the update feed advertise
the same version.
The packaging workflow accepts only tag commits reachable from `main`.
Maintainers must review the draft, checksums, release notes, and support claims before
publishing it. New drafts start with GitHub-generated notes for the tag's commit range; edit
them to describe user-visible changes and known limitations, and confirm no unreleased work or
unsupported platform claim is included. Do not publish until the platform installation checks in
[`support-matrix.md`](support-matrix.md) are complete.

## macOS signing and notarization

The macOS package jobs sign and notarize version-tag builds when the following repository
Actions secrets are configured. A version-tag run fails before packaging if any are missing;
manual package smoke runs remain unsigned and do not publish releases.

- `MACOS_CERTIFICATE_P12_BASE64`: base64-encoded Apple Developer ID Application certificate
  exported as a password-protected `.p12` file. On macOS, encode it with
  `base64 -i DeveloperID.p12 | pbcopy` and paste the clipboard value into the secret. Do not
  commit the certificate or write it into the repository.
- `MACOS_CERTIFICATE_PASSWORD`: password used when exporting the `.p12` certificate.
- `APPLE_ID`: Apple Developer account email.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for notarization, not the account
  password.
- `APPLE_TEAM_ID`: Apple Developer Team ID.

The workflow imports the certificate into an ephemeral runner keychain, signs the app with
Electron Forge, and submits it to Apple's notary service. The credentials are read from Actions
secrets and passed to the packaging process through the runner environment. Keep access to
release-tag creation and repository secrets limited to trusted maintainers. Remove or rotate
the secrets if the certificate or app-specific password is exposed. Review Apple notarization
results and test Gatekeeper installation on a clean Mac before publishing. Before a tagged
macOS artifact is uploaded, the workflow mounts its DMG and verifies the app signature, expected
Developer Team ID, stapled notarization ticket, and Gatekeeper assessment. The check fails the
package job if the DMG is missing or ambiguous, the app is unsigned or signed by another team, or
notarization validation fails.

Local maintainers may opt in by setting `SIDEKICK_MACOS_SIGNING=1`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` after installing their Developer ID
Application certificate in the macOS keychain. Ordinary local package builds do not enable
signing or notarization.

## Windows code signing

Version-tag Windows package jobs require these repository Actions secrets and fail before
packaging if either is missing:

- `WINDOWS_CERTIFICATE_PFX_BASE64`: base64-encoded password-protected code-signing `.pfx`.
- `WINDOWS_CERTIFICATE_PASSWORD`: the PFX password.

The workflow writes the PFX to the ephemeral Windows runner temp directory, enables the
Squirrel maker's certificate signing options for that job, and removes the PFX after the
package step, including on failure. Before artifact upload, PowerShell checks that exactly
one Squirrel setup executable has a valid Authenticode signature, that the signer matches
the configured PFX, and that the certificate has the code-signing extended key usage. The
PFX password is injected only into the packaging and verification steps through the Actions
secret environment and is not written to repository files or the job-wide environment file.
Manual workflow-dispatch builds and ordinary local builds remain unsigned. Restrict tag
creation and secret access to trusted maintainers; rotate the certificate and password if
exposed. A credentialed hosted signing run and clean-machine Windows install check remain
required before claiming verified signed Windows releases.

Signing establishes the verified publisher and integrity of the installer; it does not
guarantee that Microsoft Defender SmartScreen will have enough reputation to suppress a
first-download warning. Microsoft's current guidance says signed downloads can still be
flagged as unrecognized until publisher or file reputation accumulates. Do not tell users to
bypass operating-system warnings. For non-Store public distribution, Microsoft currently
recommends [Artifact Signing](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
or another trusted signing provider. This PFX workflow is usable only when the maintainer's
chosen certificate provider can securely provide a PFX suitable for the ephemeral runner;
providers that require non-exportable HSM keys need their own CI signing integration.

## Draft release review

Before publishing a generated draft, verify both Mac architectures, Windows, Debian/Ubuntu,
and Fedora/RHEL package assets, plus architecture-specific macOS ZIP and Windows Squirrel
update assets; validate `SHA256SUMS` and `UPDATE-SHA256SUMS`; confirm the tagged macOS
package jobs passed their macOS signature, notarization-ticket, and Gatekeeper checks and the
Windows Authenticode verification; follow the
installation and upgrade guide on clean supported machines;
review the current support matrix; and complete the code and manual security review checklists.
Do not run automated security scans; this project explicitly excludes them.
