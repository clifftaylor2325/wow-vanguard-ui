---
phase: "2"
slug: "errors-fail-tests"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-10"
---

# Phase 2 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail. Verified by the security auditor against the tip of `work/gsd-planning` with all 13 plans merged. The real-client behaviour listed at the end cannot be seen from code and is on the author's in-game list.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| addon callbacks to `ns.Try` | `ns.Guard` wraps hook, click and timer callbacks so a failure is recorded, not raised | error text, call labels |
| error text to chat, `/vg errors` and the test failure message | A caught error is shown to the player and to the test run | error strings (never secret values: `errorText` names a hidden one) |
| click handlers to restricted game calls | Post, Buy and Cancel need a hardware event inside the click's call stack | auction calls |
| test harness to the addon | The guard reads `ns.errors` of every created addon | error entries |
| CI workflow files to the hosted runner | The weekly shuffled run takes a seed and prints it | workflow inputs |
| local test folders to the machine | `link-wow` tests create and remove their own temp folders | temp files |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation (evidence) | Status |
|-----------|----------|-----------|----------|-------------|----------------------|--------|
| T-02-01 | Information disclosure | error text through `ns.Guard` | medium | mitigate | `ns.Guard` calls only `ns.Try`; text comes from `errorText()`, which returns "(a hidden error message)" for a secret (`Core/Events.lua:59-62`); the failure message prints text, count and stack only; hidden-value test `core.test.mjs:659-671` | closed |
| T-02-02 | Tampering | `SetPostItem` post-hook | medium | mitigate | `Modules/AuctionSell.lua:654` is a post-hook with no timer; `errorrail.test.mjs` asserts the game's own `SetPostItem` still ran | closed |
| T-02-03 | Repudiation | `expectErrors` markers | high | mitigate | `expectErrors` refuses unanchored, empty, wildcard, class, group and alternation matchers and the g/m/y flags; `judge` fails on stray entries and on unused markers; refuse/accept tables in `error-guard.test.mjs` | closed |
| T-02-04 | Denial of service | `ns.Guard` on a non-function | low | mitigate | `Core/Events.lua:163` returns non-functions unchanged; test asserts nil and a table come back unchanged | closed |
| T-02-05 | Denial of service | registry growth | medium | mitigate | global `afterEach` drains the registry after every test (`scripts/tests/setup.mjs:28-30`); memory cap in `vitest.config.mjs:42` | closed |
| T-02-06 | Tampering | workflow shuffle input | medium | mitigate | `lua-suite.yml:53-61` uses `if: inputs.shuffle` and a date-based seed; no `${{ }}` inside any `run:` text; `workflows.test.mjs` asserts it (observation 1) | closed |
| T-02-07 | Elevation of privilege | workflow permissions | low | mitigate | `permissions: contents: read` kept; no permission line changed in the phase diff | closed |
| T-02-08 | Tampering | `link-wow` temp folders | medium | mitigate | each case uses its own `mkdtempSync` temp folder with TEST-ONLY names, HOME and USERPROFILE set to it, removed in `afterAll` | closed |
| T-02-09 | Repudiation | fixture and stub changes | high | mitigate | the only `wow-world.lua` change is the 8-line `debugstack` stub in its own commit; fixture changes only extend `Enum` and accept both `hooksecurefunc` forms; no harness rule loosened | closed |
| T-02-10 | Repudiation | markers in `core.test.mjs` | high | mitigate | all 68 `expectErrors` calls in the phase are exact strings or fully anchored patterns varying only in digit runs; each commit body lists its markers | closed |
| T-02-11 | Repudiation | aura-container fallback notice (D-06) | low | accept | user decision D-06; `Core/AuraEngine.lua:57` still reports through `ns.Try`; `AURA_FALLBACK` is the anchored marker | closed (accepted) |
| T-02-12 | Tampering | `ChatExtras` addon fix | low | mitigate | diff shows only additive `type(...)` checks; behaviour unchanged where the calls exist | closed |
| T-02-13 | Repudiation | `UNITS_ENV` and the AFK fixture | medium | mitigate | `UNITS_ENV` unchanged; the AFK case's local fixture change is declared in its commit | closed |
| T-02-14 | Repudiation | switch-on of the guard | high | mitigate | unconditional `afterEach`; no `VG_ERROR_GUARD`, no test file named, no test name read; both vitest projects share the setup file | closed |
| T-02-15 | Tampering | negative control edit | medium | mitigate | `Modules/AuctionSell.lua` diff holds only the two intended `ns.Guard` lines; no `TEST-ONLY control` string in `Core`, `Modules` or `scripts` | closed |
| T-02-16 | Elevation of privilege | auction and shared click factories | high | mitigate | `ns.Guard` and `ns.Try` contain no `C_Timer`, so the click's call stack is kept; `PostItem`/`PostCommodity` and `CancelAuction` are reached only from click handlers; the `C_Timer` calls in auction files do not call restricted APIs; no buy API is called in `Core` or `Modules`; tests assert hardware-event posting and "a timer posts nothing" | closed |
| T-02-17 | Tampering | click labels | low | accept | labels from `W.ClickLabel(text)`, built once, used only for the error label (observation 3) | closed (accepted) |
| T-02-18 | Denial of service | per-slot bag hooks | low | accept | cost is one closure and one `xpcall` per firing; `/vg perf` check on the in-game list | closed (accepted) |
| T-02-19 | Elevation of privilege | errands, merchant, inventory | medium | mitigate | callbacks wrapped in place; Train all stays in its click, restock and junk-sell stay in their timers | closed |
| T-02-20 | Elevation of privilege | Reload dialog | medium | mitigate | only the plain button's `OnClick` is wrapped; the `SecureActionButtonTemplate` overlay and its `ns.OutOfCombat` build are unchanged | closed |
| T-02-21 | Denial of service | failing `AddMessage` hook re-entering chat | medium | mitigate | `printed[text]` is set before `ns.Chat`, and a `forwarding` flag blocks re-entry; test "chat hears about it once" (observations 5 and 6) | closed |
| T-02-22 | Elevation of privilege | raid tools, quest dialog, talent clicks | medium | mitigate | handlers wrapped in place with no timer | closed |
| T-02-23 | Repudiation | code-quality rule exception | medium | mitigate | exception limited to `Core/Combat.lua`'s `runSoon` timer; token-based, so next-line callbacks are read; self-tests; `check-code-quality.mjs` exits 0 | closed |
| T-02-24 | Repudiation | `debugstack` stub | medium | mitigate | commented stub citing `Blizzard_ScriptErrors.lua`; the test that assumed no stack was changed in its own earlier commit; a new assertion was added | closed |
| T-02-25 | Information disclosure | stack text in the test failure message | low | accept | stack appears in the test failure message only; in game `errorText()` still guards the message | closed (accepted) |
| T-02-26 | Repudiation | markers in auras, plates, report tests | high | mitigate | exact strings or anchored digit-run patterns, enforced by `expectErrors` | closed |
| T-02-27 | Repudiation | markers in more, tooltip, lua-engine tests | high | mitigate | same | closed |
| T-02-28 | Repudiation | markers in five test files | high | mitigate | exact strings | closed |
| T-02-29 | Information disclosure | auction error text | medium | mitigate | labels are literals or `W.ClickLabel`; text through `errorText()` | closed |
| T-02-30 | Information disclosure | bags, errands, merchant, inventory error text | medium | mitigate | same control as T-02-01; labels are literals | closed |
| T-02-31 | Denial of service | hot hooks in Movers and Theme | medium | accept | no table built per firing; a repeat failure is printed once and counted (observation 5); `/vg perf` check on the in-game list | closed (accepted) |
| T-02-32 | Information disclosure | Core error text | medium | mitigate | same control as T-02-01 | closed |
| T-02-33 | Denial of service | hot hooks in ChatExtras, GameAlerts, DataBars | medium | accept | one `xpcall` per firing; `/vg perf` check on the in-game list | closed (accepted) |
| T-02-34 | Information disclosure | chat-line values in error text | medium | mitigate | the wrapper never reads its arguments; `shortenAdded` checks `ns.IsSecret(text)`; dynamic labels come from addon-chosen method names, not hook arguments | closed |
| T-02-35 | Elevation of privilege | secure template buttons | high | mitigate | every `SecureActionButtonTemplate` frame was checked: none has a guarded `OnClick`; the guarded raid-tools and quest-tracker clicks are on plain buttons | closed |
| T-02-36 | Information disclosure | plan-12 error text | medium | mitigate | same control as T-02-01; labels are literals | closed |
| T-02-SC (x13) | Tampering | package installs (one row per plan) | low | accept | `package.json` and the lock file are unchanged since the phase began; no YAML parser added | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-11 | Aura-container fallback notice stays in the error list for now; a separate notice channel is a later change (D-06). | the author | 2026-10-10 |
| AR-02-02 | T-02-17 | Click labels are built once; one caption is a localized class name, which is not secret. | plan author (low severity) | 2026-10-10 |
| AR-02-03 | T-02-18 | Cost of per-slot bag hooks is one closure and one `xpcall`; to be checked with `/vg perf`. | plan author (low severity) | 2026-10-10 |
| AR-02-04 | T-02-25 | Stack text appears only in the test failure message. | plan author (low severity) | 2026-10-10 |
| AR-02-05 | T-02-31 | Hot hooks in Movers and Theme cost one `xpcall` per firing; `/vg perf` check. | plan author (medium, below block threshold) | 2026-10-10 |
| AR-02-06 | T-02-33 | Hot chat and data-bar hooks cost one `xpcall` per firing; `/vg perf` check. | plan author (medium, below block threshold) | 2026-10-10 |
| AR-02-07 | T-02-SC | No package was added in any plan. | plan author (low severity) | 2026-10-10 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-10 | 36 (plus 13 T-02-SC rows) | 36 (plus 13) | 0 | gsd-security-auditor (ASVS level 1, block_on high) |

---

## Non-blocking observations (from the audit)

1. The workflow assertion in `workflows.test.mjs` forbids only `${{ inputs.` inside `run:` blocks, narrower than the plan's "no `${{ }}`". Current files comply. Widening the check to `${{` would close it.
2. `namesOneError` refuses the g, m and y flags but not i, s, u, d or v. A case-insensitive anchored pattern still names one error text, so no class-of-errors hole exists.
3. `Modules/ClickCastOptions.lua:627` uses a localized class name in a click caption, which the plan said would not happen. Not secret; built once.
4. `Core/Events.lua` loads before `Core/Combat.lua`, so `ns.IsSecret` is nil while those two files load. No secret value can exist then, and the check resolves at call time afterwards.
5. A hot hook that fails on every firing (SetPoint, SetAlpha, AddMessage) calls the game's error handler each time; chat is de-duplicated, the handler is not. Fits AR-02-05 and AR-02-06; look for it in the `/vg perf` check.
6. No test drives a failing `AddMessage` hook back through `ns.Chat` (re-entry is prevented by construction).
7. `isSoonTimer` accepts any `C_Timer.After` in `Core/Combat.lua` whose callback contains `runSoon`; the self-test covers the intended and a different bare timer.
8. Rule 4 does not cover `HookScript` or non-`OnClick` `SetScript` callbacks (`OnEnter`, `OnUpdate`, `OnEvent`). That matches the plans' declared scope; it is the recorded follow-up.

---

## Not verifiable from code (author's in-game checks)

- The hardware event survives `xpcall` in the real client for `PostItem`, `PostCommodity` and `CancelAuction` (assumption A1).
- Whether a throwing `SetPostItem` post-hook changes Blizzard's behaviour (Phase 5 list).
- That `debugstack` exists on the Forever client (research A3).
- D-06: whether Forever shows the error badge at login.
- `/vg perf` cost of the hot guarded hooks.
- The Reload overlay and the raid-tools world markers in combat.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-10
