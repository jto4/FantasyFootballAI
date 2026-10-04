# Windows signing workflow review

## Scope

Reviewed the Windows release-tag code-signing path in the desktop package workflow,
Electron Forge configuration, and installer signature verifier. No automated security
scan was run.

## Findings and controls

- Local packaging and `workflow_dispatch` remain unsigned. The maker receives PFX settings
  only when `SIDEKICK_WINDOWS_SIGNING=1` is explicitly set by a version-tag workflow job.
- The workflow fails before packaging if the base64 PFX or password secret is missing.
- The PFX is decoded under the ephemeral runner temp directory and removed by an
  `always()` cleanup step after package verification/upload steps, including failed builds.
- The password is passed only to the packaging and verification step environments; it is not
  written to the repository or the job-wide `GITHUB_ENV` file.
- Before artifact upload, the verifier requires exactly one Squirrel setup executable,
  a valid Authenticode signature, a signer thumbprint matching the configured PFX, and
  the code-signing EKU.
- Tag commits remain constrained to commits reachable from `main`; release-tag creation
  and signing secret access should remain limited to trusted maintainers.

## Validation and remaining checks

Forge configuration tests cover unsigned defaults and the explicit Windows signing opt-in.
The PowerShell verifier cannot be executed on this macOS development host. A credentialed
Windows hosted run and a clean Windows install/signature check remain required before
claiming the release path is verified end to end.
