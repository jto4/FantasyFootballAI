# Linux RPM release package review — 2026-09-28

## Scope

Manual review of Electron Forge RPM packaging, Linux runner prerequisites, and Linux release
asset validation. This is a focused workflow/code review, not an automated security scan or a
release-candidate approval.

## Findings and changes

- The previous Linux release included a Debian `.deb` only, leaving Fedora/RHEL users without
  a native package.
- Added Electron Forge's official `@electron-forge/maker-rpm` alongside the existing Debian
  maker. The Linux package job installs `rpm`, the documented tool required by that maker.
- Release assembly now requires both `.deb` and `.rpm` files in the single Linux artifact;
  the Linux ZIP contains both. The installation guide directs users by distribution.
- The release fixture covers both package files and confirms a missing RPM is rejected before
  release output is published.

## Verification and limits

- `npm run test:release` and `bash -n scripts/assemble-release-assets.sh` pass locally.
- The current host is macOS, so Linux RPM creation was not run here. Hosted Linux packaging
  verification remains pending. Debian interactive install, RPM interactive install, and
  other Linux distributions remain separate support checks.
