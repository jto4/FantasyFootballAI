# macOS release package verification review

## Scope

Reviewed the version-tag path that signs and notarizes macOS packages. Added an explicit
pre-upload verification step that mounts the produced DMG, verifies the app's deep code
signature, requires a Developer ID Application identity for the configured Apple team,
validates the stapled notarization ticket, and asks Gatekeeper to assess the app. Verification
uses argument-array process calls and always detaches the disk image and removes its temporary
mount directory. Unsigned manual packages do not enter this step.

## Findings

- No correctness issue found in the reviewed change.
- A local unsigned Apple Silicon DMG confirmed that the app bundle is at the DMG root, matching
  the verifier's expected layout. The unsigned app correctly cannot pass the release verifier.
- No automated security scans were run, per repository policy.

## Validation

- Four deterministic tests cover successful verification, wrong-team rejection with cleanup,
  notarization failure blocking Gatekeeper and upload, and runner/artifact preconditions.
- The current local DMG was mounted read-only; it contained `Sunday Sidekick.app` at its root.
- The app bundle was copied from that read-only mount into a temporary Applications folder and
  launched in headless mode with an isolated data directory. The packaged API returned healthy
  status, then shut down cleanly; the temporary install and data folder were removed.
- The rebuilt unsigned DMG passed `hdiutil verify` (SHA-256
  `14e3bee0a36a1e78e4da84cfd0eaa15663edf75030f56ddd258fc6c2e2b5ac81`); the paired updater ZIP
  SHA-256 is `c313baf1a4629618ecb1efb387eae0184bcf522a2dc56dfdff3ddf438cac1aa7`.
- A fresh package build after hero-image optimization and Yahoo OAuth route extraction passed
  its GUI/API, MCP, and headless API smokes. Inspection confirmed the WebP asset and Yahoo OAuth
  router are present in the packaged `app.asar`.
- The final optimized DMG was mounted read-only, copied into a temporary Applications folder,
  and passed the packaged API health and clean-shutdown smoke from that copied bundle. The
  temporary app and data directory were removed afterward.
- A credentialed hosted run is still required to exercise Apple signing, notarization, stapling,
  and Gatekeeper acceptance end to end.
- This copy-install smoke does not verify GUI onboarding or a version upgrade; interactive
  installation, upgrade, and tray/sign-in behavior remain open.
