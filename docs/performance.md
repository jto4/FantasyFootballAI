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

Health and full-state results are consistent with previous API samples. Synthetic report
timing includes local CLI startup but no model inference. The built dashboard assets are
about 6.3 KiB larger than the earlier 409.4 KiB sample with the saved voice controls. The
benchmark shut down its temporary API and removed its synthetic data. It excludes model
inference, live provider sync, browser paint, long-running scheduler use, and lower-powered
hardware; this one-host result is not a release performance guarantee.
