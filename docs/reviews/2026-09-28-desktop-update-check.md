# Manual review: desktop update check

- **Date:** 2026-09-28
- **Review type:** Focused code and security review; not a release review
- **Scope:** `apps/desktop/update-check.mjs`, desktop IPC/preload, Settings UI, and package staging
- **Result:** No findings in the reviewed diff.

The update check runs only after an owner presses the Settings button. It sends a bounded
unauthenticated GET to the fixed public GitHub latest-release endpoint; no league data,
member profiles, credentials, or machine identifiers are included. The request rejects
redirects, times out after five seconds, and reads no more than 64 KiB of response metadata.
Release tags must parse as safe three-part numeric versions, and prereleases or malformed
responses are not offered as updates. The browser action opens a fixed repository release
URL; renderer-provided URLs are never passed to Electron's shell API.

The download and installation remain manual. The feature does not modify app files or restart
the app. The packaged macOS smoke passed after including the helper in the isolated staging
app; the latest-release check returned the expected `unreleased` state because the repository
currently has no published stable release. No automated security scan was run.

This focused review does not cover a release diff or the signatures/artifacts of a future
published release. Complete both `SECURITY.md` release checklists for each release candidate.
