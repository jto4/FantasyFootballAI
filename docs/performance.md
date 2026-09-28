# Performance checks

Run `npm run perf:smoke` on a clean checkout to build the app and benchmark its local
production API and dashboard assets. The script starts the compiled API with an isolated
temporary SQLite database, seeds representative synthetic league and report data, samples
health and full-state API latency, downloads the built dashboard shell and assets, records
the API process working set, and stops the process and removes the temporary data.

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
| Dashboard shell and built assets                 |             4 ms |
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
| Dashboard shell and built assets                 |             4 ms |
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
