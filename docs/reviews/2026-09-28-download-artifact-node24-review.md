# Download artifact Node 24 update review — 2026-09-28

## Scope

Manual review of the `actions/download-artifact` pin in the desktop package release
workflow. This is a focused dependency and workflow review, not an automated security scan.

## Findings and changes

- The release workflow used `actions/download-artifact` v4.3.0, which predates the
  repository's Node.js 24 artifact action updates.
- The workflow now pins v8.0.1 to full commit SHA
  (`3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c`). The upstream release action metadata declares
  `runs.using: node24`; its artifact name input and download path behavior used by the release
  workflow remain unchanged.
- The action requires GitHub Actions runners with Node.js 24 support. This workflow uses
  GitHub-hosted runners. Hosted execution of the release assembly workflow remains pending.

## Result

No additional workflow changes were identified in this scoped review. Re-review when the
artifact flow or action version changes.
