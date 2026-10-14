# Recent totals feedback and seasonal adaptation — October 13, 2026

Shorter feedback with a correction cap turns the reused late-2025 totals loss
into a small sportsbook point win. It also improves the combined audit and full
890-game comparison, while retaining a smaller 2026 point win. Full 2023 and
2024 still lose. This is research evidence, **not a consistent or prospective
edge**, and no production model is promoted. Moneyline and spreads are unchanged.

## Why the previous model loses late 2025

[Exact parent reproduction and feedback diagnosis](../research/2026-10-13-v17-feedback-diagnosis.json)
verify every v16 raw/final probability before attributing changes.

The source forecasts favor Over on **150/151** late-2025 games. Their raw
alignment gain is 0.00066217, smaller than correction variance cost 0.00096940:
the ungated model already loses book by 0.00030723 Brier. Feedback cannot turn
these into an Under forecast; it can only move between the raw model and book.

V16 feedback worsens that loss to **0.00057831**. It trusts the raw model with
weight 0.769 before Week 11, retains 0.308 in Week 12 after the first bad week,
then falls to zero in Weeks 13–15. The raw model wins Weeks 14–15, but the final
forecasts miss that recovery. Trust subsequently rises to 0.574 before another
losing Week 17. Weeks 11, 12 and 17 account for 227.6% of net excess loss; gains
in other weeks partially offset them.

Fitting and feedback shared the same eight-week current-season decay and
three-season carryover with a 26-week prior decay. Before Week 11, feedback has
115.6 effective prior-season games against 92.4 current-season games. That old
mass slows adaptation, but is not the sole cause: its smaller slope actually
dampens trust in Weeks 11 and 17. The diagnosis supports shorter, independently
controlled feedback **and** a variance cap, rather than blaming every loss on
old history or claiming the underlying predictor is already sound.

## Fixed source, new feedback

Football features, continuous residual fitting, all raw source probabilities,
penalty 100 and the choice to exclude flow stay fixed at the frozen v16 primary.
The new core adapter consumes forecasts fitted at their own earlier origins.
Only the book-mixture weight changes:

```text
d = raw probability - book probability
trust = clip(sum(w*d*(outcome-book)) / (sum(w*d*d) + 0.02), 0, cap)
final probability = book + trust*d
```

Feedback uses at most six completed current-season weeks, with a separate two-
or four-week half-life. It needs 24 nonzero raw forecasts, two distinct weeks
and twelve effective games. Same/future-week outcomes and observations less
than 48 hours old are excluded. Zero trust still observes later raw forecasts,
so recovery does not depend on selectively observing only active forecasts.

Eight variants were declared: half-lives 2/4, caps 0.5/1, and season reset versus
a limited seed. Seed controls use only the preceding season's Weeks 15–18,
with at most sixteen equivalent games, fading to zero by Week 5. Sparse seeds
are never amplified. The selected rule resets feedback fully at the season
boundary; the underlying football learner retains its original training history.

[Settings](../research/2026-10-13-v17-frozen-settings.json) seal source, data,
parent and diagnosis hashes before this audit. Selection uses the same 390
development games from 2024 and 2025 Weeks 1–8 only. It chooses **two-week
half-life, cap 0.5, season reset**. Development Brier improves from v16's
0.25039279 to 0.25010880, still above book 0.24999099. Development and audit
have both been inspected in earlier research rounds; they are not untouched.

## Paired retest

[Full audit](../research/2026-10-13-v17-audit.json), lower Brier is better:

| Sample                | Games | Sportsbook |    V16 primary | New frozen primary |
| --------------------- | ----: | ---------: | -------------: | -----------------: |
| Late 2025, Weeks 9–18 |   151 | 0.25036106 |     0.25093937 |     **0.25024812** |
| 2026, Weeks 1–5       |    79 | 0.25026877 | **0.24869777** |         0.24911242 |
| Combined audit        |   230 | 0.25032936 |     0.25016943 |     **0.24985803** |
| All 2023–2026         |   890 | 0.25010217 |     0.25026758 |     **0.25007216** |

The new primary improves late 2025 versus v16 by **0.00069125** and versus book
by **0.00011294**. It gives back **0.00041465** of v16's 2026 gain while still
beating book there by **0.00115635**. Combined book gain is 0.00047133; full
sample book gain is only 0.00003000. Log loss also improves against book in
these aggregate comparisons.

[Timing/decomposition](../research/2026-10-13-v17-result-diagnostics.json) shows
that **84.9%** of the late-2025 improvement over v16 comes from Weeks 11–12:
the cap reduces Week 11 trust from 0.769 to 0.5, and the shorter memory sets
Week 12 trust to zero. Week 16 resumes at 0.5 instead of 0.319. Weeks 14–15
still return book, so this does not demonstrate earlier recovery in that actual
stretch. At fixed cap 0.5, two-week decay beats four-week decay on late 2025 by
0.00021735; at fixed two-week decay, cap 0.5 beats full trust by 0.00044978.
Both recent weighting and bounded correction size contribute.

Current-season reset returns book on 32 games in 2026 Weeks 1–2 and changes all
47 later eligible games. Late 2025 changes 91 games and returns book on sixty.
Across 890 games, 370 change, including 333 changes of at least 0.001 probability;
520 return book exactly. All cases remain in the matched comparison. Returning
book is a tie, not an incremental forecast win. Football coverage remains the
same 879/890; there is no new data acquisition or relaxed eligibility.

| Full season | Sportsbook Brier | New primary Brier |
| ----------- | ---------------: | ----------------: |
| 2023        |   **0.25006923** |        0.25020165 |
| 2024        |   **0.24977945** |        0.24989262 |
| 2025        |       0.25040564 |    **0.25039994** |
| 2026 W1–5   |       0.25026877 |    **0.24911242** |

For transparency, every frozen alternative is retained, with no audit-based
replacement of the development winner:

| Half-life / cap / season rule |  Late 2025 |  2026 W1–5 |    All 890 |
| ----------------------------- | ---------: | ---------: | ---------: |
| 2 / 0.5 / reset — primary     | 0.25024812 | 0.24911242 | 0.25007216 |
| 2 / 0.5 / seed                | 0.25024812 | 0.24867756 | 0.25008933 |
| 2 / 1 / reset                 | 0.25069789 | 0.24866348 | 0.25034784 |
| 2 / 1 / seed                  | 0.25069789 | 0.24841164 | 0.25047537 |
| 4 / 0.5 / reset               | 0.25046547 | 0.24906392 | 0.25012657 |
| 4 / 0.5 / seed                | 0.25046547 | 0.24867756 | 0.25018541 |
| 4 / 1 / reset                 | 0.25067955 | 0.24844695 | 0.25033123 |
| 4 / 1 / seed                  | 0.25067955 | 0.24817394 | 0.25049424 |

Nominal 95% week-clustered book-improvement intervals include zero for late
2025 [-0.00123293, 0.00145881], combined audit [-0.00050446, 0.00144712] and all
890 [-0.00035638, 0.00041639]. The five-week 2026 nominal interval barely clears
zero [0.00001195, 0.00230075], but the inherited more conservative interval
[-0.00051663, 0.00282934] spans zero. Neither accounts for all previous research
rounds. These are descriptive reused-sample estimates, not independent evidence
that the model consistently beats sportsbook forecasts or produces betting profit.

The original historical limitations remain: revised PBP cannot certify
contemporaneous publication, and archived sportsbook quotes lack observation
timestamps. No executable ROI claim, future outcome tuning or issued-forecast
rewrite is made.

## Verification and reproduction

All eight candidates preserve **893 moneyline and 870 spread** probabilities
exactly: maximum production difference is zero. Each candidate also preserves
all 890 raw totals probabilities exactly. Existing live dispatch and issued
v6/v11 numeric records remain unchanged.

857 workspace tests plus root suites pass with supported Node 22. Typecheck,
lint, format, build and diff whitespace checks pass; the existing 536.29 kB
dashboard chunk warning remains. Six new tests cover seasonal reset and seed
budget/fade, recent deterioration/recovery while trust is zero, window expiry,
current/future-label and forecast invariance, 48-hour/evidence gates, identity
validation, caps and non-total dispatch. Scoped ordinary manual code/security
review checks the source/parent hashes, frozen raw forecasts, bounded artifact
reads, temporal guards, fallback counting and predeclared selection. No automated
security scans, network acquisition, credential/configuration changes, wager,
owner Advice journal write or AI call is performed.

[Verification record](../research/model-v17-verification.json) records exact
fresh-input reconstruction and replay. Decompress shared v11 contexts, original
v12 r2 signals and corrected v15 signals into a fresh directory. The retained
v16 PBP fields reconstruct the same normalized input offline. Build dependencies
under Node 22 and run:

```sh
node scripts/replay-drive-signals.mjs /path/to/drive-stats.json
node scripts/audit-recent-total-feedback.mjs /path/to/games.json /path/to/original-signals.json /path/to/corrected-signals.json /path/to/drive-stats.json docs/research/2026-10-13-v17-frozen-settings.json
```

All eight candidate audits reproduce every row, probability and metric; only
`scoredAt` differs. The diagnosis and development CLIs are separate from replay.
New evidence is formatted before sealing, preserving the original v16 byte
format and all parent hashes.
