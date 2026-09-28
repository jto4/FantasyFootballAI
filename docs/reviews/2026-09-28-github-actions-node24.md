# Manual workflow review: Node.js 24 GitHub Actions

- **Date:** 2026-09-28
- **Review type:** Focused workflow review; not a release review
- **Scope:** `ci.yml` and `desktop-packages.yml` action runtime upgrades
- **Result:** No findings in the reviewed diff.

The hosted run `36369900734` reported that the pinned `actions/checkout@v4.2.2` and
`actions/setup-node@v4.4.0` actions were still targeting Node.js 20 and were being forced
onto Node.js 24. The workflows now pin verified upstream commits for checkout v7.0.1 and
setup-node v7.0.0. Their official release notes document the Node.js 24 runtime migration;
the runner compatibility requirement is met by GitHub-hosted runners.

Reviewed trigger scopes, least-privilege workflow permissions, the existing version-tag
guard around release publication, and the pinned action commits. This update does not alter
workflow triggers, secrets, permissions, artifact handling, or release publication behavior.
No automated security scan was run. Hosted CI for the updated workflow is the required
runtime check and is pending when this note was written.

This focused review does not cover the full release diff or produced artifacts. Complete
both `SECURITY.md` release checklists for each release candidate.
