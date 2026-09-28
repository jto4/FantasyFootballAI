# Future-dated news item review

Date: 2026-09-28

## Scope

Reviewed the RSS publication-time normalization and filtering in `packages/integrations/src/news.ts` after a live ESPN entry had a publication timestamp 48 minutes ahead of the request check time.

## Manual review

- News items dated more than five minutes beyond the local retrieval clock are omitted.
- The five-minute allowance preserves minor publisher clock skew while excluding materially scheduled/future items.
- If a feed has no remaining usable headlines, it follows the existing feed-failure path so partial-feed reporting or cached-news fallback remains available.
- Titles and source URLs continue through their existing size and HTTPS validation before entering reports.

## Validation

- `packages/integrations/src/news.test.ts` covers past/current items, tolerated five-minute skew, exclusion of later items, and a future-only feed.
- `npm run news:smoke` passed at 12:02 UTC on 2026-09-28: ESPN returned six accepted headlines; PFF, FOX Sports, CBS Sports, and Pro Football Talk returned ten each.
- The rebuilt Apple Silicon package passed dashboard/API, MCP, and headless health/clean-shutdown smoke checks; `hdiutil verify` confirmed the current DMG.
- `npm test`, typecheck, lint, formatting, build, and `git diff --check` pass on the local macOS ARM workspace.
- No automated security scan was run; repository guidance excludes those scans.

No actionable issue was found in this scoped parser change. Feed timestamp accuracy still depends on publisher metadata.
