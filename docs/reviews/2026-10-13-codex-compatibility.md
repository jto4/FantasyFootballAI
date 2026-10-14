# Codex CLI compatibility and model-quality verification — October 13, 2026

Reviewed by Codex on macOS ARM with Node 22.23.3 against the existing working tree.
The installed `codex-cli 0.162.0-alpha.17.2` previously failed the adapter's exact
version check before inference. This change adds that exact build on macOS after
capturing and correcting its model-visible isolation behavior. The previously
verified `0.162.0-alpha.2` path remains intact; adjacent and future builds stay blocked.

## Research and compatibility fix

The official [command reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
documents ignored user configuration, ignored rules, ephemeral execution, the
read-only sandbox and JSONL output. The official
[non-interactive guide](https://learn.chatgpt.com/docs/non-interactive-mode)
explains JSON events and reuse of native authentication. The
[configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
documents the owned instruction/catalog files and agent configuration. Native
`exec --help`, feature inspection and public model-catalog metadata supply the
prerelease-specific details; documentation alone does not establish isolation.

Request capture exposed three distinct issues:

1. This CLI reads global `AGENTS.md` even when user configuration is ignored and
   project documentation has a zero-byte budget. Empty developer/instructions
   overrides did not remove it. The new macOS launch uses `sandbox-exec` to deny
   reads of canonical global `AGENTS.md` and `AGENTS.override.md` paths, including
   symlink targets. Native login stays in its original location. Only an exact
   expected permission-denial notice before the turn is tolerated; unrelated
   paths, errors and notices after turn start still reject the response.
2. A skills-instruction section survived skill discovery/enablement controls.
   Explicitly disable its instruction rendering, orchestrator skills/MCP,
   native agents and request-user-input tools. Standalone execution and disabled
   daemon startup are additional controls. Disabling the daemon alone did not
   remove the tool schemas and is not the demonstrated fix.
3. The selected model's native catalog declares Code Mode and v2 agents, overriding
   feature disables. It emits tool schemas in `input.additional_tools`, even when
   top-level `tools` is absent. Use an owned pinned catalog with standard tool
   mode, no patch/experimental tools or Node runtime, while retaining the same
   GPT-6.1-Sol model and high reasoning. The supplied instruction file still
   replaces the catalog's fallback instructions. Capture checks both tool surfaces.

The provider and verification script share argument/launch builders. No broad
version regex, native-login copy, new API key, provider fallback or football-model
change is involved. Missing sandbox/isolation prerequisites fail closed. New-build
support on Windows/Linux and rebuilt installers remain unverified.

## Isolation evidence

`scripts/verify-codex-isolation.mjs` is an opt-in loopback request-capture check,
not a security scanner or a remote model call. Its default uses an owned fixture
home containing user/project/skill canaries, deliberately invalid user rules and
a fixture MCP launch marker. `--existing-home` verifies request composition against
the original native home without writing fixture files there. Native authentication
is unnecessary for the local receiver; authorization headers are absent. Bodies,
headers, native account information and reasoning are never printed or persisted.
Only sanitized booleans, public protocol shape and hashes are retained.

Both captures verify zero tool declarations, exactly two input messages containing
only the supplied system instructions and fictional prompt, no canaries/skills,
and the selected model/high reasoning. The fixture confirms global-read denial,
no MCP launch, no session directory and no generated workspace files. Owned
instructions/catalog and fixture directories are removed in `finally` paths.
A subsequent production-adapter signed-in fixed probe passes with 29 input tokens
and 9 output tokens; probes measure availability, not football decision quality.

Reproduce after building integrations:

```sh
node scripts/verify-codex-isolation.mjs /absolute/path/to/codex
node scripts/verify-codex-isolation.mjs /absolute/path/to/codex --existing-home
npm run advice:evaluate -- --connection codex-cli
```

The sanitized [capture record](../research/2026-10-13-codex-isolation.json)
includes both proofs, native executable and adapter hashes, and the fixed probe.
The full live [quality record](../research/2026-10-13-codex-advice-quality.json)
passes **23 of 23** cases with **46 validated model calls**, no analysis/review
validation failures and no grading failures. Each call uses GPT-6.1-Sol with high
reasoning through the production adapter/service. The unchanged grader checks the
raw reviewed answer as well as the saved assessment; policy correction cannot hide
a wrong model recommendation. No prompts or rubric were changed for this run.

| Workflow         | Cases passed | Actual model calls |
| ---------------- | -----------: | -----------------: |
| Lineup/start-sit |          7/7 |                 14 |
| Draft planning   |          4/4 |                  8 |
| Draft review     |          2/2 |                  4 |
| Trades           |          3/3 |                  6 |
| Waivers          |          6/6 |                 12 |
| Betting          |          1/1 |                  2 |

Both new waiver-drop cases pass: Hold for the 57-to-55 lineup loss and Lean for
the 57-to-65 upgrade, with complete before/drop/after/gain support. The run also
covers rookies, kickers/defenses, injury/context, missing evidence, conflicting and
stale media, harmful/beneficial trades and automatic draft/trade forecasts.
Betting correctly abstains on unqualified evidence. This is one full controlled
sweep, not proof of consistent future reliability or betting performance.

Source checks pass: `npm test` runs 875 workspace tests (314 API, 84 dashboard,
252 core, 225 integrations) plus root/service/integration suites, including 19
controlled evaluator regressions and all 23 fixed cases. The two opt-in native
platform checks remain expected skips. All eight adapter tests pass, including
new-build OS read denial, adjacent-version rejection, exact startup-notice handling
and cancellation/deadline cleanup for both native protocols. Typecheck, lint,
formatting, build and diff whitespace checks pass. Vite retains its existing
large-main-chunk advisory. All 51 v18 sealed football-model source hashes are
unchanged; moneyline/spread/totals forecast methods and advice grading are unchanged.

## Ordinary manual code and security review

Read the changed adapter, native event parser, argument/catalog ownership,
canonical paths, inherited environment, subprocess lifecycle and bounded capture
receiver against the scoped `SECURITY.md` checklists. The OS wrapper adds a global
instruction-read restriction; its `allow default` policy permits native login and
networking and is not a complete host sandbox. The CLI read-only sandbox plus absent
model tools constrain advice execution. Malicious local administrators/processes
remain outside the repository's threat model; native CLI/provider trust remains
an external dependency.

The native subprocess uses no shell, keeps credentials in native storage, scrubs
inherited API/desktop/session routes, bounds stdout and time, discards stderr and
retains only validated final text/safe usage. Version and isolation are checked on
each generation. Cancellation/deadline tests cover both versions and cleanup of
owned files. Fixtures cover symlinked instructions, exact startup notices, rejection
of unexpected tool events and adjacent versions. Capture binds only to loopback,
bounds request bytes and uses a deliberate local 400 response rather than model
inference. No dependencies, outbound messages, owner database/settings, wagers,
release, installer or service restart are involved. No automated security scan ran.

Decision-process evaluation cannot prove NFL prediction accuracy, calibrated
confidence, betting returns or a consistent sportsbook edge. Independent forward
validation remains required before promoting football probability models.
