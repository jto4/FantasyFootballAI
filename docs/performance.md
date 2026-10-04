# Performance checks

Run `npm run perf:smoke` on a clean checkout to build the app and benchmark its local
production API and dashboard assets. The script starts the compiled API with an isolated
temporary SQLite database, seeds representative synthetic league and report data, samples
health and full-state API latency, downloads the built dashboard shell and assets, records
the API process working set, and stops the process and removes the temporary data.

The CI matrix also runs the already-built benchmark on macOS, Windows, and Linux, plus the
minimum supported Node.js 22.13 runtime on macOS. Each run writes the same JSON measurements
to a downloadable, run-scoped artifact so maintainers can compare OS and runtime samples
without treating noisy hosted-runner timings as fixed performance thresholds.

## Baseline recorded on 2026-09-27

Local macOS ARM, Node.js 25.9.0; synthetic fixture of 8 leagues, 96 teams, 80 member
profiles, and 300 saved reports:

| Measurement                                      |           Result |
| ------------------------------------------------ | ---------------: |
| Cold API startup to healthy                      |           186 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.27 / 1.86 ms |
| Full local state p50 / p95 (30 samples)          |   1.81 / 2.49 ms |
| Full state response                              |        465.1 KiB |
| Synthetic report pipeline p50 / p95 (10 samples) | 52.55 / 61.10 ms |
| Dashboard shell and built assets                 |             3 ms |
| Dashboard JavaScript and CSS assets              |        405.1 KiB |
| API process working set                          |          118 MiB |

The report measurement generates ten power-ranking reports against a temporary local CLI
that returns fixed text. It includes prompt preparation, local CLI startup, and SQLite save
time, but excludes model inference. These are one-machine smoke measurements, not release
performance guarantees. Repeat on supported OSes and representative lower-powered hardware,
compare with the same fixture, and investigate regressions instead of treating these values
as universal thresholds. Synthetic local data avoids provider costs and secrets. The
benchmark does not measure live league refresh duration, real-provider inference latency,
browser paint/interaction responsiveness, or long-running scheduler resource use; those
require a configured provider account and a separate recorded manual exercise before release.

## Repeat sample recorded on 2026-09-27

A fresh macOS ARM run under Node.js 25.9.0 with the same synthetic fixture completed after
the cross-platform packaging work:

| Measurement                                      |           Result |
| ------------------------------------------------ | ---------------: |
| Cold API startup to healthy                      |           187 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.28 / 0.61 ms |
| Full local state p50 / p95 (30 samples)          |   1.86 / 2.69 ms |
| Full state response                              |        465.1 KiB |
| Synthetic report pipeline p50 / p95 (10 samples) | 50.10 / 59.40 ms |
| Dashboard shell and built assets                 |             3 ms |
| Dashboard JavaScript and CSS assets              |        407.5 KiB |
| API process working set                          |        117.8 MiB |

The synthetic measurements remain consistent with the prior sample. Small timing and asset
size changes are expected across builds and host load; both reports are retained as
observations rather than universal thresholds.

## Minimum-runtime sample recorded on 2026-09-27

The same macOS ARM fixture was also run with the documented minimum Node.js 22.13.0 after
installing the native SQLite dependency for that runtime:

| Measurement                                      |           Result |
| ------------------------------------------------ | ---------------: |
| Cold API startup to healthy                      |           175 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.29 / 1.82 ms |
| Full local state p50 / p95 (30 samples)          |   1.97 / 3.35 ms |
| Full state response                              |        465.1 KiB |
| Synthetic report pipeline p50 / p95 (10 samples) | 39.51 / 48.10 ms |
| Dashboard shell and built assets                 |             3 ms |
| Dashboard JavaScript and CSS assets              |        405.1 KiB |
| API process working set                          |        113.5 MiB |

The benchmark used a synthetic fixture and a local CLI stub. It measures application
overhead, not provider/model latency or real browser interaction, and should be compared only
with runs using the same fixture and environment.

## Repeat sample recorded on 2026-09-28

A fresh macOS ARM run under Node.js 25.9.0 with the same synthetic fixture completed after
verifying the native LaunchAgent lifecycle:

| Measurement                                      |           Result |
| ------------------------------------------------ | ---------------: |
| Cold API startup to healthy                      |           185 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.27 / 0.65 ms |
| Full local state p50 / p95 (30 samples)          |   1.76 / 2.45 ms |
| Full state response                              |        465.1 KiB |
| Synthetic report pipeline p50 / p95 (10 samples) | 50.32 / 59.44 ms |
| Dashboard shell and built assets                 |             3 ms |
| Dashboard JavaScript and CSS assets              |        409.4 KiB |
| API process working set                          |        118.3 MiB |

This remains consistent with the prior macOS samples for API and report latency. Asset size
varies with the build output and is retained for comparison; these single-host synthetic
measurements are not universal performance thresholds.

## Additional repeat sample recorded on 2026-09-28

The current tree was rebuilt and measured on macOS ARM under Node.js 25.9.0 with the same
synthetic fixture:

| Measurement                                      |           Result |
| ------------------------------------------------ | ---------------: |
| Cold API startup to healthy                      |           186 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.29 / 0.67 ms |
| Full local state p50 / p95 (30 samples)          |   1.78 / 2.69 ms |
| Full state response                              |        465.1 KiB |
| Synthetic report pipeline p50 / p95 (10 samples) | 50.21 / 55.79 ms |
| Dashboard shell and built assets                 |             3 ms |
| Dashboard JavaScript and CSS assets              |        409.4 KiB |
| API process working set                          |        117.6 MiB |

The benchmark shut down its temporary API and removed its data directory after completion.
No listener remained on the standard development or production ports. As with prior samples,
the synthetic CLI excludes model inference and this single-machine result does not represent
lower-powered systems.

## Cross-platform CI samples recorded on 2026-09-28

Hosted run `36376672913` uploaded one JSON artifact per supported OS and one for the minimum
Node.js 22.13.0 runtime. Each used the same 8-league synthetic fixture. Hosted-runner
contention and VM hardware differ, so these values are reference points, not release gates.

| Runner and runtime           | Startup | Health p95 | Full state p95 | Synthetic report p95 | API working set |
| ---------------------------- | ------: | ---------: | -------------: | -------------------: | --------------: |
| Ubuntu x64, Node.js 22.23.2  |  251 ms |    4.61 ms |       11.62 ms |             63.96 ms |       104.1 MiB |
| Windows x64, Node.js 22.23.2 |  390 ms |    9.06 ms |       24.47 ms |            128.36 ms |        78.6 MiB |
| macOS ARM, Node.js 22.23.2   |  315 ms |    3.27 ms |        9.87 ms |            160.18 ms |       113.0 MiB |
| macOS ARM, Node.js 22.13.0   |  235 ms |    2.66 ms |        5.07 ms |            103.18 ms |       112.3 MiB |

All runners reported a 465.0–465.1 KiB state response and 409.4 KiB of JavaScript and CSS
assets. The ten-report p95 spread, especially on macOS ARM, shows why hosted measurements
should guide investigation rather than trigger timing thresholds. Download the named JSON
artifacts from the workflow run to inspect medians and the full benchmark metadata.

## Current-tree repeat sample recorded on 2026-09-28 06:02 UTC

The current tree was rebuilt and measured on macOS ARM under Node.js 25.9.0
with the same synthetic fixture after the Resend and group-chat memory-consent race fixes:

| Measurement                                      |           Result |
| ------------------------------------------------ | ---------------: |
| Cold API startup to healthy                      |           184 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.27 / 0.66 ms |
| Full local state p50 / p95 (30 samples)          |   1.81 / 2.79 ms |
| Full state response                              |        465.2 KiB |
| Synthetic report pipeline p50 / p95 (10 samples) | 51.19 / 60.51 ms |
| Dashboard shell and built assets                 |             3 ms |
| Dashboard JavaScript and CSS assets              |        415.7 KiB |
| API process working set                          |        118.8 MiB |

## Consent-guard follow-up sample recorded on 2026-09-28 06:09 UTC

Same host, runtime, synthetic fixture, and sample counts as the preceding current-tree run.

| Metric                                           |            Value |
| ------------------------------------------------ | ---------------: |
| API startup                                      |           184 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.31 / 0.74 ms |
| Full-state endpoint p50 / p95 (30 samples)       |   1.78 / 2.59 ms |
| Synthetic report pipeline p50 / p95 (10 samples) | 53.01 / 58.98 ms |
| State payload                                    |        465.2 KiB |
| Dashboard shell and assets                       |             3 ms |
| Dashboard assets                                 |        415.7 KiB |
| API process working set                          |          119 MiB |

Health and full-state results are consistent with previous API samples. Synthetic report
timing includes local CLI startup but no model inference. The built dashboard assets are
about 6.3 KiB larger than the earlier 409.4 KiB sample with the saved voice controls. The
benchmark shut down its temporary API and removed its synthetic data. It excludes model
inference, live provider sync, browser paint, long-running scheduler use, and lower-powered
hardware; this one-host result is not a release performance guarantee.

## Current-tree repeat sample recorded on 2026-09-28 06:49 UTC

Same macOS ARM host, Node.js 25.9.0, synthetic fixture, and sample counts as the 06:09 run.

| Metric                                           |            Value |
| ------------------------------------------------ | ---------------: |
| API startup                                      |           185 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.26 / 0.55 ms |
| Full-state endpoint p50 / p95 (30 samples)       |   1.78 / 2.64 ms |
| Synthetic report pipeline p50 / p95 (10 samples) | 50.43 / 58.66 ms |
| State payload                                    |        465.2 KiB |
| Dashboard shell and assets                       |             3 ms |
| Dashboard assets                                 |        415.7 KiB |
| API process working set                          |        117.7 MiB |

These results remain close to the previous same-host sample. The synthetic report path uses a
local CLI and excludes model inference; the benchmark also excludes live provider sync, browser
paint, long-running scheduler use, and lower-powered hardware. It stopped its temporary API and
removed synthetic data after completion.

## Current-tree repeat sample recorded on 2026-09-28 07:30 UTC

Same macOS ARM host, Node.js 25.9.0, synthetic fixture, and sample counts as the 06:49 run,
measured after extracting backup routes and full settings-payload validation from API startup.

| Metric                                           |            Value |
| ------------------------------------------------ | ---------------: |
| API startup                                      |           183 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.29 / 0.62 ms |
| Full-state endpoint p50 / p95 (30 samples)       |   1.85 / 2.45 ms |
| Synthetic report pipeline p50 / p95 (10 samples) | 49.77 / 57.28 ms |
| State payload                                    |        465.2 KiB |
| Dashboard shell and assets                       |             3 ms |
| Dashboard assets                                 |        422.6 KiB |
| API process working set                          |        117.8 MiB |

The dashboard asset size changed with the current build; API latency and startup remain close
to the previous same-host sample. This synthetic smoke excludes provider/model latency, browser
paint, and lower-powered hardware, and it stopped its temporary API and removed its fixture.

## Current-tree repeat sample recorded on 2026-09-28 07:51 UTC

Same macOS ARM host, Node.js 25.9.0, synthetic fixture, and sample counts as the 07:30 run,
measured after extracting the news and conversation-import API routes and updating ESPN handling
for unknown lineup slots.

| Metric                                           |            Value |
| ------------------------------------------------ | ---------------: |
| API startup                                      |           183 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.27 / 0.72 ms |
| Full-state endpoint p50 / p95 (30 samples)       |   1.78 / 2.52 ms |
| Synthetic report pipeline p50 / p95 (10 samples) | 50.47 / 57.40 ms |
| State payload                                    |        465.2 KiB |
| Dashboard shell and assets                       |             3 ms |
| Dashboard assets                                 |        422.6 KiB |
| API process working set                          |        117.2 MiB |

These are synthetic, single-host measurements. They do not include provider sync or model
inference, and are not release performance guarantees.

## Current-tree imported-history stress sample recorded on 2026-09-28 09:01 UTC

Same macOS ARM host and Node.js 25.9.0, with the smoke fixture expanded to 80 member profiles
containing 4.53 MiB of imported conversation text. The store now avoids serializing and writing
unchanged memory rows during unrelated updates. Two consecutive runs after that change measured
396.0 MiB and 431.6 MiB API working sets; the spread shows this short synthetic run is noisy for
RSS and should not be treated as a stable memory baseline.

| Metric                                           |            Value |
| ------------------------------------------------ | ---------------: |
| API startup                                      |           183 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.28 / 0.63 ms |
| Full-state endpoint p50 / p95 (30 samples)       |   1.79 / 2.31 ms |
| Synthetic report pipeline p50 / p95 (10 samples) | 53.14 / 59.11 ms |
| State payload                                    |        465.2 KiB |
| Dashboard assets                                 |        424.5 KiB |
| API process working set                          |          396 MiB |

The previous 4.53 MiB-source run before skipping unchanged memory writes measured 441.7 MiB.
The API state response stayed below 2.6 ms p95 across these stress runs. The elevated and
variable working set with retained histories remains an item for longer-running and
cross-platform profiling; this synthetic smoke is not a release performance guarantee.

## Current-tree imported-history regression sample recorded on 2026-09-28 09:05 UTC

Same macOS ARM host, Node.js 25.9.0, and 80-profile/4.53 MiB fixture, after avoiding full
state clones on store updates and reading delivery settings through a settings-only snapshot.
The API working set stayed between 129.5 and 131.1 MiB from the first through the tenth
synthetic report save, instead of growing by about 16 MiB per report in the preceding run.

| Metric                                           |            Value |
| ------------------------------------------------ | ---------------: |
| API startup                                      |           184 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.28 / 1.62 ms |
| Full-state endpoint p50 / p95 (30 samples)       |   1.81 / 2.43 ms |
| Synthetic report pipeline p50 / p95 (10 samples) | 48.77 / 54.55 ms |
| State payload                                    |        465.2 KiB |
| Dashboard assets                                 |        424.5 KiB |
| API process working set                          |        130.4 MiB |

This single synthetic run indicates the per-report growth was removed; repeat and
cross-platform profiling remain necessary before treating this as a stable baseline. A second
run on the same host measured 127.0 MiB final RSS, with 126.3–129.1 MiB across the report-save
checkpoints; it measured 0.69 ms p95 health, 3.10 ms p95 state, and 57.93 ms p95 synthetic
report generation. The two consecutive runs show no per-report memory growth.

## Current-tree repeat sample recorded on 2026-09-28 09:23 UTC

The current production build was measured on the same macOS ARM host under Node.js 25.9.0
with the 80-profile/4.53 MiB imported-history fixture and 300 saved reports:

| Metric                                           |            Value |
| ------------------------------------------------ | ---------------: |
| API startup                                      |           186 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.29 / 0.64 ms |
| Full-state endpoint p50 / p95 (30 samples)       |   1.79 / 2.21 ms |
| Synthetic report pipeline p50 / p95 (10 samples) | 48.22 / 55.73 ms |
| State payload                                    |        465.2 KiB |
| Dashboard assets                                 |        426.2 KiB |
| API process working set                          |        126.2 MiB |

RSS checkpoints were 103.1 MiB after startup, 126.9 MiB after state reads, 127.2 MiB after
report 1, 125.6 MiB after report 5, and 126.2 MiB after report 10. This run is consistent
with the recent result that report saves do not cause continued memory growth. It remains
a synthetic single-host measurement without live sync, model inference, or browser paint.

## Current-tree repeat sample recorded on 2026-09-28 11:04 UTC

The latest local macOS ARM build was measured with Node.js 25.9.0 using the same
80-profile/4.53 MiB imported-history fixture, 300 saved reports, and 30 latency samples:

| Metric                                           |            Value |
| ------------------------------------------------ | ---------------: |
| API startup                                      |           183 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.29 / 1.76 ms |
| Full-state endpoint p50 / p95 (30 samples)       |   1.81 / 2.37 ms |
| Synthetic report pipeline p50 / p95 (10 samples) | 51.72 / 79.26 ms |
| State payload                                    |        465.2 KiB |
| Dashboard shell and assets                       |             4 ms |
| Dashboard assets                                 |        429.2 KiB |
| API process working set                          |        127.6 MiB |

Working-set checkpoints were 103.1 MiB after startup, 126.9 MiB after state reads, and
127.7, 126.8, and 127.5 MiB after reports 1, 5, and 10. This run shows no per-report
growth, with latency and RSS in line with recent same-host samples. It is still a synthetic
smoke and does not measure provider sync, real model inference, browser paint, or lower-powered
hardware.

## Local browser interaction smoke recorded on 2026-09-28

Playwright opened the built dashboard in Chromium against a fresh temporary local database.
The initial navigation reached `DOMContentLoaded` in 28.6 ms, and a click from League desk to
Leagues reached the second animation frame in 30.1 ms. These are single-run loopback timings,
not user-perceived latency guarantees; there was no connected league and the browser ran on the
same machine as the API.

The browser resource timing also exposed the locally served hero artwork as a 1,498,470-byte
PNG transfer. The dashboard now serves a 27,928-byte WebP derived from the same 1774 × 887
source, reducing the image transfer by about 98.1%. After the change, the browser loaded the
hero artwork in 1.2 ms with 28,228 transferred bytes, reached `DOMContentLoaded` in 28.6 ms,
and the Leagues click again reached the second animation frame in 30.1 ms. The source PNG is
kept outside the public asset directory; lower-bandwidth network behavior and broader browser
samples remain to be measured.

## Current-tree repeat sample recorded on 2026-09-28 12:06 UTC

The current build was measured on macOS ARM under Node.js 25.9.0 with the same 8-league,
80-profile/4.53 MiB source-text, 300-report fixture:

| Metric                                           |            Value |
| ------------------------------------------------ | ---------------: |
| API startup                                      |           184 ms |
| Health endpoint p50 / p95 (30 samples)           |   0.29 / 0.64 ms |
| Full-state endpoint p50 / p95 (30 samples)       |   1.86 / 2.75 ms |
| Synthetic report pipeline p50 / p95 (10 samples) | 51.09 / 60.64 ms |
| State payload                                    |        465.2 KiB |
| Dashboard shell and assets                       |             3 ms |
| Dashboard assets                                 |        429.2 KiB |
| API process working set                          |        130.2 MiB |

RSS checkpoints were 103.1 MiB after startup, 126.4 MiB after state reads, and 126.8, 128.9,
and 130.1 MiB after reports 1, 5, and 10. This sample shows no large per-report growth and
is consistent with recent same-host measurements. It remains a synthetic smoke without live
provider sync, model inference, browser paint, or lower-powered hardware.

## Workflow slice measured on 2026-10-02

Local macOS ARM, pinned Node 22.23.3, `npm run perf:smoke`; same synthetic fixture
(80 profiles / 4.53 MiB source history, 300 reports). API startup: 176 ms. Full-state
latency p50/p95: 3.39/8.89 ms; synthetic generation p50/p95: 33.51/49.76 ms; final
working set: 127.9 MiB. Dashboard shell/assets: 447.3 KiB, fetched in 4 ms locally.
This sample includes the Reports/Settings/next-action changes, excludes real model inference,
provider sync and browser paint timing, and does not replace lower-powered or native-platform
release measurements.

## Workflow reliability measured on 2026-10-02

Local macOS ARM, Node 22.23.3, `npm run perf:smoke`; the synthetic fixture contains
8 leagues, 96 teams, 80 profiles / 4.53 MiB source history, and 300 saved reports.

| Metric                                           |            Value |
| ------------------------------------------------ | ---------------: |
| API startup                                      |           172 ms |
| Full-state endpoint p50 / p95 (30 samples)       |   2.04 / 3.44 ms |
| Dashboard summary p50 / p95 (30 samples)         |   2.00 / 2.55 ms |
| Full-state payload                               |        465.3 KiB |
| Dashboard summary payload                        |        160.9 KiB |
| Synthetic report pipeline p50 / p95 (10 samples) | 40.19 / 45.02 ms |
| Dashboard assets                                 |        461.7 KiB |
| API process working set                          |        126.8 MiB |

The summary used for live dashboard polling is about 65% smaller than full state and omits
report bodies. Dashboard shell/assets fetched in 4 ms locally. RSS checkpoints were 103.4 MiB
after startup, 122.3 MiB after state reads, and 123.8, 126.4, and 126.7 MiB after reports
1, 5, and 10. These are single-host synthetic measurements; they exclude live provider sync,
real model inference, browser paint, slower hardware, and native-platform release validation.
