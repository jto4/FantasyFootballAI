# Weekly decisions, evidence readiness and prospective evaluation — October 13, 2026

Implemented the six accepted recommendations in the existing Sunday Sidekick source.
Reviewed by Codex on macOS ARM with Node 22.23.3. This working tree is based on
`890ffcb8599dc5598dd7cfc7d9082bbb64ed2938` and includes earlier owner work; no commit,
release, owner-service restart or public deployment was made.

## Product changes

1. **Weekly Home.** A selected-team dashboard precedes report creation. It shows
   verified/unknown roster freshness, recorded starter coverage, saved availability
   flags, lineup/waiver/trade actions and up to five current-week saved decisions.
   Unknown health and absent waiver deadlines remain explicit. The existing draft,
   delivery and schedule review queues remain available below it. Home reads saved
   data; it does not start AI analysis or silently fetch private chat history.
2. **Advice results.** A decision summary leads with the recommendation, conditional
   quantified change, alternative and reasons to reconsider. Selected-lineup change
   uses the actual selected estimate against recorded starters when available.
   Negative proposed waiver gains remain visible. Missing baselines do not become
   invented gains. Evidence-confidence labels lead; the numerical quality score is
   inside its explanation and never labelled a success probability. Detailed
   calculations, source attribution and original forecast warnings remain available.
3. **Data readiness.** A bounded POST checks roster age, considered-player estimate
   coverage, public-source retrieval timestamps and uniquely matched dated injury
   coverage without model setup/generation or ledger writes. Analyze repeats this
   check and withholds generation for invalid teams or games that cease to be
   upcoming. Cancellation works during preflight. Readiness is also frozen in new
   saved results; old results remain readable. Injury update dates are separate
   from download time. The check timestamp is taken after retrieval.
4. **Prospective betting research.** Betting has a separate research entry. New
   eligible forecasts fingerprint the installed numerical core and advice
   orchestration, fixing method, same-quote no-vig comparator, earliest target
   selection and eight-week uncertainty policy. Different code cohorts, seasons
   and markets remain separate. Only fresh verified quotes with a matching
   recomputed baseline enter the comparison. Manual prices, old unversioned
   records, AI judgments and props are excluded. Calibration bins accompany paired
   Brier differences and approximate weekly-cluster intervals. No candidate is
   automatically promoted; sentiment/whale corrections remain research-only.
5. **Fantasy outcome journal.** New records retain workflow identity and, when
   supported, a frozen hypothetical decision comparison with roster ownership,
   source date, chosen players and baseline. Legal recorded starters are required
   for a full-lineup baseline; single-spot comparisons use their highest supplied
   estimate. Trades compare complete before/after lineups; waivers require an
   explicit drop. Every needed player must have a pre-kickoff record. Final result
   checks reuse the existing verified outcomes and scoring snapshots. Missing
   appearances stay unresolved, never zero. Projection errors are separated by
   workflow, method, league/scoring, position, season and game horizon. Draft and
   unsupported decisions contribute projection accuracy without claiming draft-time
   skill or an executed transaction.
6. **Everyday setup and native verification.** Guided setup asks for a team before
   AI setup; messaging stays optional. Browser choices use bounded device storage;
   desktop choices use validated private preferences so changing localhost ports
   does not lose them. Writes are atomic, serialized and awaited at shutdown.
   imsg setup distinguishes version checks, explicit saved-chat read verification,
   and recorded local acceptance. Read verification discards contents, imports
   nothing, calls no AI and sends nothing; target/configuration changes are checked
   across waits. Sending retains the existing report review and final confirmation.

The underlying probability models, allocation/projection calculations, advice
prompts and grading rubric are preserved. All 51 sealed v18 numerical source hashes
remain unchanged. This change does not establish a sportsbook edge or improved
NFL forecasting accuracy.

## Native isolation and research

Correction from the subsequent installer rebuild: the initial desktop utility
process environment omitted the verification root, so the empty credential listing
in this review did not prove API-child credential isolation. The
[latest installer review](2026-10-13-latest-installer.md) records root propagation,
confined legacy migration and an independent disposable-credential probe against
the packaged API. The initial preference/database checks remain dated evidence;
the stronger credential-boundary check supersedes that earlier claim.

Ordinary review found that the earlier GUI verification utility could share
owner preferences and the OS credential service even with a separate SQLite path.
An explicit `SIDEKICK_VERIFICATION_ROOT` now sets preferences and Chromium paths
synchronously before Electron readiness/the instance lock, confines test data to
that root, and selects a distinct hashed credential namespace. The normal profile
and `SundaySidekick` credential identity are unchanged. Verification disables native
updates, uses no owner connections and removes its private profile afterward.
Packaged GUI/MCP/headless checks use this scope rather than overwriting HOME.

The fixed-code fingerprint uses the native ESM import resolver; a production-process
regression verifies it rather than relying on Vitest's substituted import metadata.
Fingerprint failure excludes the record instead of reconstructing an earlier
protocol after outcomes. The scope deliberately fingerprints the full installed
core plus orchestration, so harmless core edits can conservatively split cohorts.

[Electron's app documentation](https://www.electronjs.org/docs/latest/api/app)
explains preference paths and initialization timing. The
[calibration guidance](https://scikit-learn.org/stable/modules/calibration.html)
separates calibration from overall probability loss; both are displayed. The
[nflverse update schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
shows why source retrieval, report publication and underlying stat corrections
must remain distinct.

## Verification

Final verification completed October 13, 2026 local time (October 14 UTC):

- `npm test`: **901 workspace tests passed** (327 API, 87 dashboard, 256 core,
  231 integrations), plus all root script suites; two expected platform skips.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run format:check`
  and `git diff --check`: passed. Existing dashboard chunk-size warning remains.
- Full Playwright suite: **222 desktop/mobile journeys passed**. After the final
  saved-result layout change, **62 affected advice journeys passed** again.
- Manual in-app Chromium QA at 1265 × 712 and 390 × 844: selected team,
  no-AI readiness, generated/saved/reloaded result, Home saved-decision queue,
  outcome journal and white/black appearance verified using an isolated fictional
  league. No horizontal document overflow on the phone; no console errors/warnings.
- Unsigned macOS ARM installer build: API/dashboard, MCP handshake/tool discovery
  and headless health/clean shutdown smoke checks passed.
- Packaged Electron 44.4.5 GUI: launch, Home, storage/backup status, diagnostics,
  installed-code fingerprint, Stop and flushed shutdown passed. Preferences,
  Chromium data, SQLite and OS credential namespace were isolated. Native team
  preference survived restart with renderer storage cleared. Test profile cleaned.
- DMG checksum verification and ZIP archive integrity passed. All **51 sealed v18
  source hashes** and nine production numerical modules match their original
  sources. The native GUI evidence matches the final ASAR hash below.

| Final artifact   | SHA-256                                                            |
| ---------------- | ------------------------------------------------------------------ |
| macOS ARM DMG    | `967a24fc42bde4bdc55b38997f63cebda9bf27c3789bab76e66e2eae17650690` |
| macOS ARM ZIP    | `46a849e52948325a26d3e9e6c57a7a523c34e9225d8b868ba912b712c9c171ee` |
| Application ASAR | `b975d426a6b53ecb797653440eed374e2f8c399ec6b7cb813fac64dea2be2aed` |

Local evidence is in `/tmp/sidekick-weekly-native/native-runtime.json`, with browser
screenshots under `/tmp/sidekick-weekly-qa/` and command logs under
`/tmp/sidekick-weekly-*.log`. These temporary files are not a durable public release.
Built artifacts are in `apps/desktop/out/make/`. No new live AI quality benchmark or
historical/prospective sportsbook claim is made; controlled workflow regressions
exercise all six advice types while preserving the numerical models.

The browser flow under test is Home → select team → lineup/waiver advice →
readiness → reviewed saved result → reload → Home saved-decision queue, plus
optional local messaging setup and the outcome journal. Controlled public
football/AI/native-chat fixtures run through real production routers and temporary
SQLite. No owner league, chat history, recipient or saved credential is used.

## Ordinary manual code and security review

Reviewed the scoped diff, typed interfaces, compatible saved-result/record
validation, mixed-scoring/horizon separation, duplicate handling, pre-kickoff
capture, bounded reads and ledger capacity against SECURITY.md. New API routes
reuse the existing loopback/host/origin/CSP protections. Readiness does not use
configured AI, and message read probes do not persist or echo message contents.
Existing consent, immutable delivery envelopes, uncertainty and review-before-send
controls remain intact. New desktop preference IPC checks the trusted dashboard
origin and validates bounded IDs; normal credential paths remain in the OS vault.
Native test profiles, owned subprocess lifecycle and cleanup are explicit. No
new dependency or automated security scan is involved.

Limits: the journal inherits the bounded 2,000-record/8 MB ledger and retains
unknown or unsupported comparisons rather than fabricating outcomes. Approximate
intervals and small calibration buckets do not establish reliability across seasons.
No actual wager, owner message send or live native chat read was performed. Signing,
notarization, a real published upgrade cycle and current Windows/Linux/Intel Mac
interactive verification remain release gates. Source/runtime correctness and
fictional decision tests do not substitute for prospective NFL outcomes or a
representative user study.
