# Intel Mac release package review — 2026-09-28

## Scope

Manual review of the desktop package runner matrix and release asset assembly changes for
Intel Macs. This is a focused workflow/code review, not an automated security scan or a
release-candidate approval.

## Findings and changes

- The previous matrix used `macos-latest`, which currently supplies Apple Silicon only.
- The release workflow now adds GitHub's `macos-15-intel` x64 runner and keeps the existing
  Apple Silicon runner. Artifact names carry `runner.arch`; the assembler requires Linux,
  Windows, macOS ARM64, and macOS X64 packages exactly once.
- Each OS/architecture package is archived independently, with the installation guide and
  MIT license. The checksum manifest covers every archive. The guide directs Mac owners to
  choose the ZIP matching their processor.
- The release archive test fixture now includes both Mac architectures and verifies that an
  incomplete architecture set is rejected without producing partial output.

## Verification and limits

- `npm run test:release` passed locally, including archive contents, standalone assets,
  checksum validation, invalid installer rejection, and missing-architecture rejection.
- Hosted Intel Mac package creation has not yet run; validate it in the next release workflow
  dispatch or tagged build. Signing, notarization, and interactive Intel Mac installation
  remain separate release gates.
