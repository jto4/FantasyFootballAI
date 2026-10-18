# Market Signals and player props — October 15, 2026

Implemented on `codex/saved-codex-connection` over main `fdaf98b`, preserving the
preceding uncommitted app-wide Codex connection work. Reviewer: Codex. This is a
local source/build verification, not a published or signed release.

## Behavior and separation

Advice now has a separate Market signals tab with source-backed price, hourly
large executed trade cash and dated headline-count charts. Sources/methodology and
numeric tables expand on demand. Default white and black dark mode use existing
semantic tokens; narrow cards stack. The view is lazy-loaded and has no chart
library dependency.

A dedicated private SQLite ledger freezes the first eligible pregame game/provider
snapshot. Exact half-point total, kickoff, two-sided sportsbook quote, complete
pagination and fresh timestamps are required. The fixed external-price-v1 policy
compares latest Over price with sportsbook no-vig Over probability; flow/news are
saved covariates only. Client-submitted probabilities/outcomes are rejected.
Matched independent final scores settle once. Export includes all records;
provider/season Brier summaries describe manually selected cohorts, not profit or
proof of superiority. Ledger limits: 500 records, separate from app backups,
manual capture/result checks and no automated promotion/background collection.

The existing manually entered player-prop analysis now has a visible shortcut,
passing attempts/completions and recent stat charts/counts. A real catalog omission
for Bo Nix exposed missing GSIS IDs. Unique name/position/current-season team joins
can recover absent IDs; explicit IDs and ambiguity remain authoritative. Game
formulas/production probability dispatch are unchanged. Prop prices remain manual;
there is no verified live two-sided prop quote feed and no wager placement.

## Real data

Opt-in capture: `node scripts/capture-market-signals.mjs /tmp/sidekick-market-live`
after building shared packages. Only public provider data is read. No owner profile,
credentials, AI inference, sends or bets. Captures/raw evidence are outside Git.

- Actual 2026 Week 6 SEA at DEN, ESPN event 401872995, kickoff
  `2026-10-16T00:15:00Z`, exact total 40.5.
- Kalshi contract `KXNFLTOTAL-26OCT15SEADEN-41`: 24 verified hourly price points,
  23 observed hourly trade buckets, complete paginated 24-hour tape. Eight bounded
  provider response metadata/hash receipts retained privately.
- Genuine pregame freeze at `2026-10-15T23:47:57.845Z`, saved separately in the
  disposable `/tmp/sidekick-market-live/prospective.sqlite`; candidate Over price
  0.505 versus sportsbook no-vig probability approximately 0.50433. Outcome is
  pending; no accuracy result or model edge is established.
- Two actual relevant ESPN headlines. The first attempt found none because generic
  media matching requires additional football context around nicknames; the research
  view now explicitly treats the configured NFL feeds as football context. Production
  advice matching retains its default. Retrieval after the market cutoff no longer
  falsely marks the new feed stale; post-cutoff publications remain excluded.
- Bo Nix: 12 completed passing-yard games, mean 228.9, Over 5 / Under 7 / Push 0
  at an explicitly entered 225.5 scenario. Missing/cross-player/duplicate rows do
  not become zero. Independent arithmetic checks confirm the displayed counts/mean.
- Polymarket Gamma returned HTTP 200 with an empty event list for this exact game;
  no replacement contract, neighboring line or fabricated chart was used.
- Independent public final parsing verified BUF at LA (2026 Week 5), 37–34,
  total 71. This checks real final-source identity/parsing, not settlement of the
  still-upcoming prospective game.

Official references: [Kalshi public trades](https://docs.kalshi.com/api-reference/market/get-trades),
[Polymarket Data API](https://data-api.polymarket.com/v2/docs),
[nflverse public data](https://github.com/nflverse/nflverse-data).
Large trade execution is not trader identity, skill, wallet wealth or a position.
News volume is a coverage proxy, not a sentiment poll or social-media sample.

## Verification and review

- Source suite: 1,043 passing tests, two platform skips (341 API, 87 dashboard,
  272 core, 232 integration, 111 repository script/integration passes).
- Typecheck, lint, build, formatting and diff checks: final results recorded at closeout.
- Browser: production routers/private SQLite with public captures replayed at the
  captured time; all six existing advice workflows plus signal isolation, immutable
  freezing/reload, missing provider, sources, prop arithmetic, desktop/mobile and
  white/black screenshots. Replayed records are explicitly test evidence, not new
  genuine prospective observations.
- An initial real-data browser replay exceeded the 24-hour boundary by a few seconds
  after moving its clock; the fixture window was corrected without weakening
  production temporal validation. Initial screenshots exposed unstyled filters;
  the controls now use matching form styles and touch targets. Story-count axes
  use integers, cash axes compact USD, and underlying exact values remain inspectable.
- Manual code review: typed adapter boundary, package layering, error/loading states,
  timestamp/line/game identity, bounds, duplicate handling, retention/export limits,
  expensive reads, shutdown handle and default model separation reviewed.
- Manual security review: input→parser→storage→rendering and outbound fixed URLs
  traced; existing loopback/host/origin/CSP middleware retained. Remote reads are
  bounded, redirect-rejecting and time-limited; capture adds a 90-second abort and
  single-flight guard. React escapes labels; external links require HTTPS and no
  embedded credentials. Server-owned captures only; no raw wallets in snapshots,
  credential access, new AI access, shell interpolation, trading or delivery path.
  Separate database is mode 0600 in the existing private data directory. No new
  dependencies, native privileges, or automated security scans.

Remaining limits: current market coverage is full-game half-point totals only;
public perception uses a bounded configured NFL-feed sample, not online sentiment
measurement. Prospective statistical usefulness, licensed live prop quotes,
other-platform interactive packaging and signed distribution remain unverified.

## Final closeout

Typecheck, lint, build, full formatting check and `git diff --check` passed. All
70 distinct affected desktop/mobile browser cases passed, including all six advice
workflows, saved Codex behavior and live-price provenance. The final real-data and
research-isolation cases passed again in both viewports after the last identity
validation change (4/4). The final focused core checks passed (6/6).

The rebuilt macOS ARM DMG and ZIP passed API/dashboard, MCP and headless lifecycle
smokes. `scripts/verify-market-desktop.mjs` then launched the exact packaged
application with a disposable verification profile/mock credentials, captured
actual current public signals, froze an eligible prospective test record, opened
the player-prop entry and confirmed an empty production prediction ledger. No
renderer errors or dialogs occurred. Its first attempt checked a lazy-loaded panel
before it rendered; the harness now waits for visibility. Ordinary protections
were retained and no owner vault or data was used for automated tests.

- Packaged UI evidence: `/tmp/sidekick-market-package-final/verification.json` and
  `packaged-market-signals.png`.
- Current DMG: `apps/desktop/out/make/Sunday Sidekick-0.1.0-arm64.dmg`.
- SHA-256: `fab6fd03db659f2a1d02f6deafc48be3cf0e576a33ae182da97f06fbf877a781`.
- Previous package preserved at `/tmp/sidekick-before-market-signals-20261015/out`.
- The current unsigned app was reopened in the normal owner profile; saved
  `codex-cli` / `gpt-6.1-sol` configuration was verified unchanged, and the native
  UI was navigated to Market Signals with a fresh public-data capture. No owner
  prospective record was created by the test.

No signing/notarization, published upgrade, Windows/Linux/Intel interactive
verification or demonstrated prospective predictive advantage is claimed.
