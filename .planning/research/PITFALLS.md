# Pitfalls Research

**Domain:** Shipping and maintaining a large WoW addon UI suite (Lua 5.1, WoW Forever on the 12.1 engine) against a fixed launch date (2026-11-04 15:00 PST)
**Researched:** 2026-10-09
**Confidence:** MEDIUM overall. Repo-observed findings are HIGH. Secret-value and taint rules come from the Warcraft Wiki's 12.0 notes, which are alpha/beta-era text, and from addon-author reports, so they are MEDIUM. Forever-specific client behaviour is LOW because it is unobserved.

This file builds on `.planning/codebase/CONCERNS.md` and does not repeat it. Where CONCERNS already names a risk (secure frames, red suite, large files), this file adds the failure mechanism, the warning signs and the phase that should own it.

**Confidence tags used below:** `[repo]` observed in this repo on 2026-10-09 (HIGH). `[wiki]` Warcraft Wiki 12.0 notes (MEDIUM). `[community]` addon-author reports (LOW to MEDIUM). `[inferred]` reasoning from the above (say so, check it).

**Phase labels** are suggestions that follow the author's priority order (code and CI, then auction, then polish, then features). The roadmap may rename them.

| Label | Meaning |
|-------|---------|
| P1 Baseline | Re-baseline the suite, make errors fail tests, restore `npm run coverage` |
| P2 CI budget | Full suite fast and cheap per PR |
| P3 Auction | Posting bug, end to end |
| P4 Review | Technical review of `Core/` and `Modules/` |
| P5 Polish | Depth, motion, typography, PvP reskin, visual issues |
| P6 Features | Levelling and group helpers |
| P7 Freeze | Release candidate, in-game smoke test, launch-day hotfix path |

---

## Critical Pitfalls

### Pitfall 1: Making the red tests green by bending the stub

**What goes wrong:**
Issue #169 items 5 to 7 offer two fixes for each case: change the test, or change the harness rule ("Either an empty font string should keep its rect ... or the test should read the line's right edge", "or the rule should accept a pinned button"). Taking the cheap fix teaches the stub to accept a layout the real client would not give, or removes a check that guarded something real. The suite goes green and the author is told the UI is fine. The first real look is launch day.

**Why it happens:**
The suite has to be green soon and nobody can run the game. The stub (`scripts/lib/wow-layout.lua`'s `laidOut` rule, `wow-widget-api.lua`) is the only oracle, so it is easy to treat it as the truth. CLAUDE.md already says unlisted widget methods are nil on purpose, but nothing says the same for layout rules.

**How to avoid:**
- For each of the seven cases, decide which side is wrong against evidence from Blizzard's UI source or the API docs, and write the evidence in the commit body. If the evidence is not available, fix the test fixture (give the nameplate fixture a size, anchor the header's buttons) and leave the stub rule strict.
- Never loosen a harness rule and a test in the same commit.
- Put every fix that rests on an assumption about client behaviour on the "needs in-game check" list.
- First re-baseline: on 2026-10-09 at `47f1e94` the whole `lua` project passed locally (58 files, 751 tests, 0 failed) `[repo]`, while #169 and the project notes say seven cases are red. Run `npm test` on a clean `main` and on the CI runner before touching anything; some of the seven may already be fixed or may fail only under CI load.

**Warning signs:**
A diff that edits `scripts/lib/wow-layout.lua` or `wow-widget-api.lua` together with a test. A test whose assertion was weakened (`toBeGreaterThan(0)` replacing an exact rect). Commit messages that say "make tests pass".

**Phase to address:** P1 Baseline.

---

### Pitfall 2: Swallowed errors keep tests green and hide the root cause of later failures

**What goes wrong:**
`ns.On`/`ns.OnUnit` handlers, `ns.Soon`, the after-combat queue and module builds all run under `ns.Try` (`Core/Events.lua`, `Core/Combat.lua`), which reports and carries on. That is the right design for players, because one broken module cannot take the rest down. It also means a test that does not look at `ns.errors` passes while the addon throws. Only `scripts/tests/smoke.test.mjs` asserts `#ns.errors == 0` `[repo]`; the other area tests mention errors for their own purposes, not as a global guard. A hidden error in one step of a chain then leaves the later steps unrun, which is how "Post does nothing after an earlier red Lua error" happens.

Entry points that bypass `ns.Try` `[repo]`:

| Entry point | Sites in `Core/` and `Modules/` | Wrapped in `ns.Try` |
|-------------|--------------------------------|---------------------|
| `hooksecurefunc` | 81 | 0 |
| `OnClick` scripts | about 57 | not counted, none seen |
| `C_Timer.After` / `NewTicker` | 21 | only via `ns.Soon` |

An error in one of these goes to the game's handler only. It does not reach `/vg errors`, so the author's report block can say "No errors" while the feature is dead.

**Why it happens:**
Isolation was designed for events. Hooks, clicks and timers were added later one at a time and each author trusted the game's handler.

**How to avoid:**
- Add a global `afterEach` in `scripts/tests/setup.mjs` that fails any test leaving entries in `ns.errors`, with an allow-list for the cases that test error handling on purpose (`report`, `core`). Expect this to surface a batch of hidden failures; budget for it in P1 and triage them as a list, not as surprises.
- Route `hooksecurefunc` bodies and `OnClick` handlers on the money paths (auction Post, Buy, Cancel, setup wizard, click-casting edits) through `ns.Try`. Do not wrap all 81 hooks blindly: do the auction and window-skin hooks first.
- A handler that returns early must say why (a chat line or a disabled-state tooltip). See Pitfall 3.
- Each step of a multi-step repaint should be isolated from the next, or ordered so that the state the player acts on (button enabled, stack advanced) is set before decorative work.

**Warning signs:**
`/vg errors` empty while a feature does nothing. A test that clicks a button and asserts nothing about `ns.errors`. Count of area test files that never read `ns.errors` (by a grep for "errors", only about 20 of the 58 test files mention it at all).

**Phase to address:** P1 Baseline (global assertion), P3 Auction (money paths), P4 Review (hook and click wrapping).

---

### Pitfall 3: The auction Post button that silently does nothing

**What goes wrong:**
`AH.Post` in `Modules/AuctionSell.lua` has three silent exits: `if not price then return end` (no sale, no price, no item location, vendor floor, or the game's message throttle not ready), a `confirm` branch that prints one line, and a normal path that advances the stack. The button's enabled state comes from `enable(c.post, AH.PostPrice(s) ~= nil)` in the card paint. If an earlier error stops the paint or the throttle-ready handler, `PostPrice` keeps returning nil or the button keeps looking dead, and a click returns without a word. The player sees "nothing happens", and the true error was thrown earlier, somewhere else.

Specific traps `[inferred]` from the code and the harness:
- The harness answers `IsThrottledMessageSystemReady` with `world.ah.ready ~= false`, so the throttle is always ready unless a test turns it off `[repo]`. After a real `PostItem` the client is throttled until its ready event arrives. A test that never sets `ready = false` and then fires the ready event has not driven the real sequence.
- `PostItem` and `PostCommodity` need a hardware event. Calling them through `ns.Soon`, `C_Timer.After` or a coroutine would lose it. The file says Post runs only in the click; keep it that way when wrapping in `ns.Try` (synchronous `xpcall` keeps the call stack and is fine, a deferred call is not). This restriction is described in the file and the harness comments; the exact taint rules on Forever are not observed.
- `hooksecurefunc(AuctionHouseFrame, "SetPostItem", ...)` is the only way an item reaches `AH.TakeItem`. If `TakeItem` throws, `AH.sell` is never set and `Post` has nothing to post.
- Whether a throwing post-hook aborts the Blizzard function that triggered it is not established here. Test it in game rather than assuming.

**Why it happens:**
Defensive early returns were written to avoid bad posts (good) but give no feedback (bad). The one root-cause error was never captured because no test asserts "no errors" along the path.

**How to avoid:**
- Reproduce first: write the harness scenario that drives bag click, `SetPostItem`, price check, form fill, click Post, `PostItem` call, throttle drop, throttle-ready event, next stack, with `ns.errors` asserted empty after every step. Find the red error before changing anything else.
- Assert the Blizzard call arguments (`loc`, duration, quantity, bid, buyout) so a wrong price unit (copper versus `SupportsCopperValues`) shows up.
- Give each silent exit a visible reason: a disabled-state tooltip or a status line ("waiting for the game", "price is under vendor", "no item selected").
- Re-test both paths (commodity and item) and the `confirm == true` path.
- Treat the in-game check as required: mark "Post one stack, then a second, on a commodity and on a gear item" on the needs-in-game-check list.

**Warning signs:**
Click, no chat output, no `/vg errors` entry. Post enabled in the preview but not in play. A test that calls `AH.Post()` directly instead of clicking the button.

**Phase to address:** P3 Auction. Schedule it before the large P4 refactors so the fix is not re-broken by file splits in `AuctionShop.lua` and `AuctionSell.lua`.

---

### Pitfall 4: Reading secret values (combat, instances, chat) on a client where the check is only half right

**What goes wrong:**
Midnight-style restrictions make combat-time unit, aura and cooldown values, and some chat, creature and event payloads, opaque to addon code. Per the 12.0 notes `[wiki]`: arithmetic on a secret errors; ordering comparison errors; `if x then` works as a nil test; `string.format` and concatenation of a secret give a secret string; secrets are rejected as `SetTexture` strings and `tonumber` input; secrets saved to SavedVariables are replaced by nil. Addon authors report that `tostring` and `..` propagate the secret flag, that a secret cannot be a table key `[community]`, and that routing a secret into a shared frame such as `GameTooltip` is what spreads the problem `[community]`. They also report that `pcall` around the comparison catches the error but leaves the tainted state, so it is not a safe guard `[community]`. Forever "uses the same API restrictions introduced with Midnight" `[community]`.

Vanguard's wrappers are sound for the direct read (`ns.IsSecret`, `ns.PlainNumber`, 76 files). The remaining risks:
1. **Derived values.** A guarded `hp` and an unguarded `hp / maxhp`, `max(...)`, `string.format("%d", hp)`, or `t[name]` where `name` came from a hidden event.
2. **Fail-open fallback.** `ns.IsSecret` returns false when `issecretvalue` does not exist (`never`). If Forever exposes the check under another name, or loads it after `ADDON_LOADED`, every guard silently passes in combat. `resolveSecret` re-checks on each `ADDON_LOADED`, which helps but is not proof.
3. **Chat and event payloads.** `ChatWatch`, chat extras, and any handler reading `CHAT_MSG_*` or combat events must treat arguments as possibly hidden during encounters. Vanilla raids have encounters.
4. **Harness blind spot.** The test secret is a table `{ __secret = true }` `[repo]`. In the real client the value keeps its type, so a check such as `type(v) ~= "number"` rejects the table in tests but may accept a real secret number. Only `ns.IsSecret` first is safe, and only fixtures that install a secret exercise it (`UNITS_ENV`, `ACTIONS_ENV`).
5. **Tooltip and shared-frame writes.** Passing hidden numbers into Blizzard frames from addon code.

**Why it happens:**
Guards are added at the first read site and forgotten at the second. Everything passes out of combat, and the harness only has secrets where a fixture adds one.

**How to avoid:**
- Add a secret-sweep test per module: install a secret for every unit, aura, cooldown and chat field the module reads, run its update, and assert no error. Do this as a table-driven helper so each module costs a line, not a test.
- Make a secret in the harness behave like the client: a userdata or a proxy whose `type()` reports the real type, if the harness allows; otherwise document the gap.
- Do not use `pcall` as the secret guard anywhere new. Grep for `pcall(` near comparisons during P4.
- Keep Forever-only checks on `ns.IsForever` and `ns.AurasSecret()`.
- In-game: the 12.0 notes list test CVars (`secretAurasForced`, `secretCooldownsForced`) that simulate restricted states without a real pull `[wiki]`. Check they exist on Forever (type them in the console) and, if so, add them to `docs/SMOKE-TEST.md` as a combat-free way to exercise the guards.

**Warning signs:**
Errors that say "attempt to compare ... (a secret value)" or "secret values are only allowed during untainted execution" `[community]`. A raid-frame or nameplate bug that appears only in a fight. A new `UnitHealth`, `C_UnitAuras` or `C_Spell` read with no `ns.IsSecret` or `ns.PlainNumber` within a few lines.

**Phase to address:** P1 Baseline (sweep helper), P4 Review (audit derived values and `pcall` use), P6 Features (every new read: XP is plain, but loot rolls, party quests and any chat parsing are not).

---

### Pitfall 5: Protected frames and taint in combat, made worse by reskinning Blizzard windows

**What goes wrong:**
Combat lockdown blocks showing, hiding, moving, resizing or re-attributing protected frames, and `EnableMouse` on a protected frame in combat is reported as blocked on Midnight `[community]` (an ADDON_ACTION_BLOCKED report on a UI addon). CONCERNS records the shape of this: 76 guard sites against 72 sites of `SetAttribute`, `UIPanelWindows` or `UIDropDownMenu_` use `[repo]`. The harness stubs the secure API, so lockdown behaviour has no test `[repo]`.

Pitfalls beyond the basics, for a suite that skins about a dozen Blizzard windows:
- **Taint spread.** Writing your own fields onto Blizzard frame tables or replacing their methods taints the values secure code later reads (menus, UI panel positioning, `ShowUIPanel`). Prefer `hooksecurefunc` and a Vanguard-owned table keyed by frame.
- **`ns.OutOfCombat` closures run late.** The queue keeps the last function per key and runs it at `PLAYER_REGEN_ENABLED`, so a closure that captured a value before the fight runs on stale state. Pass the key and re-read state inside the closure.
- **Combat at login or reload.** Setup wizard, movers, unlock and options all assume out-of-combat. `/reload` and login in combat are normal on launch day (dungeon queues, world PvP). The wizard says "Setup opens when combat ends"; check every other first-run path does.
- **Creating secure frames in combat.** `CreateFrame` with a secure template cannot happen in combat. Anything lazily created on first use (a raid tile when a player joins mid-fight, a nameplate, a click-cast button) needs a pool built in advance or a deferred build.
- **Frames Vanguard hides that the game reshows.** Hiding a Blizzard frame by `Hide()` fights the game's own `Show`. The usual fix is to reparent to a hidden frame or hook `Show`, both done out of combat.

**Why it happens:**
Every reskin is tested in a headless client where nothing is protected. The first failure in play is a red popup mid-fight.

**How to avoid:**
- Make the harness model lockdown: a `InCombatLockdown()` true state in which `SetAttribute`, `Show`, `Hide`, `SetPoint`, `ClearAllPoints`, `EnableMouse` on registered-secure frames raise the client's error. Then run the existing scenarios in combat with `ns.errors` asserted empty. This turns the largest untested class of launch-day error into a test.
- Add a checklist grep to P4: every `SetAttribute`, `RegisterForClicks`, `Show/Hide/SetPoint` on a secure frame is inside `ns.OutOfCombat` or only reached from an out-of-combat path.
- Test login with `InCombatLockdown() == true` and `PLAYER_REGEN_ENABLED` firing later.
- Smoke-test steps to add: enter combat with a target dummy, then open each skinned window, open bags, open the options window, drag a mover.

**Warning signs:**
`ADDON_ACTION_BLOCKED` or `ADDON_ACTION_FORBIDDEN` naming Vanguard; a Blizzard menu action ("Set Focus", dropdown "Inspect") that stops working after Vanguard loads; frames that stay in the wrong place until combat ends.

**Phase to address:** P1 Baseline (lockdown in the harness), P4 Review (audit), P5 Polish (reskinned PvP windows), P7 Freeze (in-combat smoke steps).

---

### Pitfall 6: A "full suite under 5 minutes on every PR" target that the numbers do not support

**What goes wrong:**
Measured on this machine `[repo]` (16 logical cores, other agent runs sharing the CPU, so the times are an upper bound): the `lua` project ran 58 files and 751 tests in 288 s wall time. The sum of per-file wall times was about 3,000 s. The slowest files were `more.test.mjs` (286 s alone, 108 cases), `auction.test.mjs` (202 s), `core.test.mjs` (167 s) and `plates.test.mjs` (135 s). Single cases took 10 to 21 s. Three facts follow:
1. The critical path is one file. `more.test.mjs` is as long as the whole 5-minute budget, and Vitest cannot split a file across workers.
2. On a 2-vCPU private-repo runner the same work is 8 times fewer cores. Public repositories get 4-vCPU standard Linux runners; private ones get 2 `[inferred]` from GitHub's runner documentation (verify on the current runners page). `vitest.config.mjs` already notes the two-core effect and sets a 120 s timeout in CI because the first full run timed out cases at 30 s `[repo]`.
3. Sharding into parallel jobs shortens the wall time but not the billed time. Billed minutes are the sum of job minutes, and each job bills by the started minute (the repo's own `verify.yml` says so). Free private repos get 2,000 Linux minutes a month `[docs.github.com]`.

A related trap: the "flaky" tests the project wants removed are mostly load-induced timeouts, not nondeterminism. `scripts/lib` has no `Math.random`, `Date.now` or `setTimeout` `[repo]`, and the world has its own clock. Raising timeouts hides slowness; lowering them exposes it.

**Why it happens:**
Each test builds the whole addon (`loggedIn()`), which is the expensive part, and 100%-coverage pressure produced many cases that each reload it. The target was set without a measurement on the CI hardware.

**How to avoid:**
- Measure on the actual runner before promising anything: run the `lua` project once in the hosted job and record per-file times from the JUnit file (`coverage/junit.xml` is already uploaded).
- Attack cost per case, not worker count: share one logged-in addon per file where tests do not mutate state, or snapshot a post-login state; split `more.test.mjs` (108 cases) and `auction.test.mjs` so no file exceeds about 60 s.
- Choose the per-PR gate by changed paths: `Modules/Auction*` runs the auction area plus the smoke test; `Core/*` runs everything. Run everything on `main` merges and the weekly cron. Keep a hard rule that anything touching `Core/` runs the full set.
- Decide whether "every PR" means every push. `synchronize` runs on every push; cancelled runs still bill the time they ran. Prefer running the full suite on `ready_for_review` plus a label, and the quick gate on pushes.
- Put a minutes budget in the plan: (average run minutes) x (pushes per day) x 26 days against 2,000, with the preview and release jobs counted. The release job is about 9 minutes and the preview installs Playwright and Chromium.
- Keep `npm run verify` as the pre-push local gate so CI is the confirmation, not the first run.

**Warning signs:**
One file at the top of the Vitest summary with more than half the total. Timeouts that vanish on re-run. A run that finishes in 6 minutes locally and 25 on CI. Minutes used past 50% of the allowance before mid-month (Settings, Billing).

**Phase to address:** P2 CI budget. Re-baseline in P1 first so the red/green state is trusted before timing is tuned.

---

### Pitfall 7: Hitting the Actions allowance, or the gate failing to run, at the worst time

**What goes wrong:**
With a default $0 spending limit the included minutes are a hard stop `[docs.github.com]`. When the minutes run out, required checks (the "Quick checks" ruleset job) cannot run, so no PR can merge, including a launch-week hotfix. The repos going private makes this live: the weekly full run, the release workflow (about 9 min) and label-triggered runs all spend from the same pool.

**How to avoid:**
- Check the allowance on a fixed date each week; write the number in the PR for the phase.
- Know the break-glass: repository admins can bypass a ruleset, or the author can run `npm run verify && npm run coverage` locally and merge. Decide which before it is needed.
- Disable the UI preview job on pull requests; keep it manual (`workflow_dispatch`).
- Delete or shorten artifact retention (500 MB storage on the Free plan; preview PNGs and coverage files add up).
- Use `concurrency` with `cancel-in-progress` (already set) and avoid re-running whole workflows for a flaky job.

**Warning signs:**
Minutes above the pace line for the day of the month. A queued job that never starts. "Quick checks" shown as expected but absent.

**Phase to address:** P2 CI budget, P7 Freeze.

---

### Pitfall 8: Zero in-game observation, and a closing window to get some

**What goes wrong:**
Nothing in `docs/SMOKE-TEST.md` has been seen in the game `[repo]`, five merged fixes (#186, #188, #197, #199, #202) wait on an in-game check `[repo]`, and eleven visual issues are open. Reports say the Forever beta's last full day is 2026-10-21 `[community]`, one source, so verify the date. After that the first real look at Vanguard on Forever is the launch. Time between now and then is about twelve days.

Work that "passes in the harness" can be wrong in ways the harness cannot show: clipped text and overlaps (the open issues are all of this kind), secure-frame behaviour, atlas texture blur, sound, Forever API differences.

**How to avoid:**
- Ask the author for a single smoke-test session in the beta as early as possible, even a partial one: sections 1 (login, status, errors), the setup wizard, one auction post, one combat entry with each skinned window open. The report block (`/vg report`) is built for this.
- Order work so the riskiest, least verifiable changes land first, while feedback is still possible. Defer large refactors (P4) that cannot be seen to work until the late window, or do them only where tests are strong.
- Keep a single running "needs in-game check" file, ordered by crash risk (errors at login, in combat, on Post) before looks (spacing, colour).
- Cut anything that is only checkable in game and is not on the launch-day path.

**Warning signs:**
A growing needs-check list with no session booked. A polish PR that adds new windows after the beta closes.

**Phase to address:** All phases. P1 sets up the list and the first session; P7 requires a full pass.

---

### Pitfall 9: Large refactors in the last weeks, with a 10-line function cap and no way to see the result

**What goes wrong:**
The "technical review" can touch 33 Core and 81 Module files. The repo rules (every function at most 10 lines, each with a comment) push any file touch toward splits, and splits near launch are where behaviour changes: upvalue ordering (a local function defined below its first use is nil in Lua 5.1), a shared `local` moving to another file, a `ns` field set in a different load order than `Vanguard.toc` gives. Lua 5.1 reports these at runtime, as `attempt to call a nil value`, and `luacheck` only warns about some of them. The 100% coverage floor means a refactor that leaves a branch unreachable also fails CI, so people write execute-only tests to satisfy it.

**How to avoid:**
- Time-box P4: review and delete dead code (low risk), fix per-frame work and event fan-out (medium), and leave file splits for files that already have a bug in them (auction, setup).
- A refactor commit changes structure only, with the test count and coverage unchanged and no assertion edited.
- Keep `Vanguard.toc` order stable; add a load-order test (the smoke test covers login, which is a start) and the Lua 5.1 syntax step already in `verify.yml`.
- Do not count execute-only coverage as verified: every new test must assert an observable (a frame state, a call argument, a chat line).
- Freeze structural change at a fixed date (suggest 2026-10-28) and only fix bugs after.

**Warning signs:**
A PR that moves more than 300 lines without changing a test. Diffs with many new tiny functions and one-line comments. Coverage steady while assertions per test fall.

**Phase to address:** P4 Review, P7 Freeze.

---

### Pitfall 10: Launch-day client drift and an untested release path

**What goes wrong:**
- **Interface number bump.** The TOC declares `16001` and `120007`. If the live Forever client reports a different interface number, the addon shows "out of date" and stays off unless the player enables out-of-date addons. `ns.IsForever` accepts 16000 to 19999 and so survives a bump; the TOC does not `[repo]`.
- **Widget API drift.** The widget allowlist was checked against build 1.60.1.70170 `[repo]`. Launch builds can add or remove methods. A removed method is an error in game and a pass in the harness.
- **Old beta addons.** Reports say Forever loads addons and keybinds from earlier betas and logs errors until old addons are disabled `[community]`; a source's own commenters dispute this. Expect error reports from a polluted `AddOns` folder and have `/vg report` show the loaded addons.
- **Release pipeline.** CurseForge and Wago must accept the game version for Forever; the release workflow (9 min) has not been proven against a listing that targets it (a manual task in VANGUARD-PLAN O1 to O5). A broken packaged zip is found only after upload `[inferred]`.
- **Hotfix path.** A launch-day fix must go through branch, PR, quick gate, merge, release in less time than players will wait. With a 100% coverage floor and a 9-minute release, the path is long unless rehearsed.

**How to avoid:**
- Put the interface numbers in one place and add all plausible values (comma-separated) before release if the client's number is not known; check `/vg status` in the beta for the real one.
- Build the zip with `npm run package` and `scripts/check-zip.mjs` on every release candidate, and have the author install it by unzipping into a clean `AddOns` folder, not through `link:wow`.
- Rehearse one hotfix release before 2026-11-02, with a patch version bump, a tag and an upload.
- Add a safe mode: a `/vg` command that disables modules one by one, so a launch-day crash in one module can be isolated by a friend in minutes (`ns.Modules` enabling already exists; confirm there is a visible toggle path that works when a module's own options page is the thing erroring).
- Set a code freeze on 2026-11-01. After that, only fixes for errors in `/vg errors` reports.

**Warning signs:**
`/vg status` build string differs from 1.60.1.70170. A "game version not found" at upload. First report is "addon out of date".

**Phase to address:** P7 Freeze.

---

## Moderate Pitfalls

### Pitfall 11: Tests that run on Lua 5.3 and let 5.3-only code through

**What goes wrong:**
The harness is fengari (Lua 5.3) with 5.1 shims (`unpack`, `loadstring`, `table.getn`, whole-number printing, `%d` truncation) `[repo]`. The shim adds 5.1 names but does not remove 5.3 ones: `table.unpack`, `math.type`, `utf8`, `string.pack`, `table.move` still exist in the test VM, so code using them passes tests and breaks in game with "attempt to call a nil value". Behaviours that differ and that the shims do not cover: `ipairs` honouring `__index` (5.3 yes, 5.1 no); the length of tables with holes; integer versus float subtype (`math.floor` returns an integer in 5.3); `string.format("%d", x)` with a non-integer float errors in 5.3 (shimmed); `#arg`/`select('#')` on nil tails; `table.sort` with an inconsistent comparator.

**How to avoid:**
Run addon code in an environment where the 5.3-only names are nil (`table.unpack = nil`, `math.type = nil`, `utf8 = nil`, and so on after the stub finishes loading). `luacheck` with `std = "lua51"` already catches static uses and CI runs it (`npm run lint` locally only if installed, so do not rely on a local pass) and `luac5.1 -p` checks syntax. Add a unit test that fails if the addon environment exposes a 5.3-only global.

**Warning signs:**
New code using `table.unpack`, `utf8.`, `math.type`, integer division in a diff; luacheck skipped locally.

**Phase to address:** P1 Baseline.

---

### Pitfall 12: Per-frame and timer work that is invisible in tests but heavy in a 40-player raid or at the auction house

**What goes wrong:**
49 `C_Timer`/`OnUpdate` sites `[repo]`, raid frames that re-lay out on every roster event `[repo]`, per-unit event fan-out, and auction scans (price checks are limited to 60 a minute by the module's own rule) are fine on a test bench. Vanilla launch week means crowded cities, many nameplates, 20 to 40 player raids and long auction sessions. Symptoms are low FPS, garbage-collection spikes and addon memory growth that players blame on the UI.

**How to avoid:**
Use `ns.OnUnit` (one `RegisterUnitEvent` per subscription) instead of the shared frame for unit events; stop `OnUpdate` handlers when their frame is hidden or module disabled; throttle to 0.1 s or more unless the value is visual; update changed tiles only. In P4, measure with the existing `Core/Perf.lua` counters and record the top five by call count in the PR. Add a harness test that a hidden or disabled module registers no events and no tickers.

**Warning signs:**
`/vg` performance output dominated by one module; memory that grows with every roster change; handlers that run with the module off.

**Phase to address:** P4 Review.

---

### Pitfall 13: SavedVariables migration and import on live data

**What goes wrong:**
Players upgrading from 0.4 or 0.5 (and the author's existing profiles) carry old data. DB upgrade steps stamp the version only when the step succeeds `[repo]`, which is correct, but each new default or renamed key from the polish and feature phases adds a path nobody replays. Profile import decodes pasted text and writes it without a shape check `[repo CONCERNS]`. Secret values written to SavedVariables become nil `[wiki]`, so any cache of unit-derived values loses entries silently.

**How to avoid:**
Keep a fixture of the oldest supported SavedVariables and the newest, load each in the harness, and assert `ns.errors` is empty and the key defaults exist. Validate decoded import tables by type and range before use. Do not rename saved keys during polish; add new keys with defaults.

**Phase to address:** P4 Review (fixtures), P5 Polish and P6 Features (every new setting adds a fixture line).

---

### Pitfall 14: Polish work that fights the client's texture and motion rules

**What goes wrong:**
Depth (shadows, borders, texture) is the main polish goal. On Forever, atlas texcoords are atlas-relative, so cropping atlas art with `SetTexCoord` blurs it (project memory and CONCERNS). Shadows built from stretched textures also get the 9-slice and pixel-snapping wrong when the UI scale is not 1. Hover and feedback motion must respect the 0.15 s in-combat limit and the Reduce motion switch; every fade and sound has to be listed in `docs/THEME.md`. Colours and font sizes may only live in `Core/Theme.lua`, and `code-quality.mjs` enforces the function-size rule only, not the visual result.

**How to avoid:**
Size and anchor atlas art instead of cropping. Generate shadow and border textures through `scripts/lib/media-sources.mjs` and `npm run media` (the check `node scripts/build-media.mjs --check` must pass). Put every new transition through one helper that reads Reduce motion and combat state, so there is one place to test. Add a THEME.md line in the same commit. Test at UI scales other than 1 and at 4K and 1366 widths in the preview.

**Warning signs:**
New `SetTexCoord` on file textures, new literal colours outside Theme, a transition without a `docs/THEME.md` row.

**Phase to address:** P5 Polish.

---

### Pitfall 15: Feature scope that adds new secret, comms and event surfaces

**What goes wrong:**
Levelling helpers (XP per hour, quest XP, supply reminders) are mostly plain-number reads and are low risk. Group helpers are not: party quest progress needs other players' quest state or addon messages, and loot-roll tracking reads roll events and item links. In 12.0, addon messaging and chat reads are blocked in instances during keystone runs, PvP matches and encounters `[wiki]`; how Forever applies that to vanilla dungeons is unobserved. A feature that needs messaging between three friends may work in the open world and fail in a dungeon. Each new feature also needs new globals in `.luacheckrc`, tests that hit 100% of its lines, and THEME.md entries.

**How to avoid:**
Pick the one feature per group that uses only local, plain data (XP/hour and time to level; roll tracking from the loot frame's own events). Treat anything that needs addon messaging as out for launch. Define cut-off: features that are not merged with a green full suite by 2026-10-28 are cut, per the project's own "cut first" rule. Never let a feature branch hold a launch-blocking fix.

**Phase to address:** P6 Features.

---

### Pitfall 16: Events that do not exist on Forever

**What goes wrong:**
`ns.On` skips events the client lacks and reports "not on this client" once `[repo]`. A feature built around a missing event then loads, shows nothing, and the only trace is one chat line at login among many. For `ns.OnUnit`, a client without `RegisterUnitEvent` falls back to plain events and filters in Lua, which is a different performance profile.

**How to avoid:**
At the end of P4, list every "not on this client" report from the beta's `/vg errors` and make each either an intended fallback (documented) or a removed feature. Show missing-event modules in `/vg status`.

**Phase to address:** P4 Review, P7 Freeze.

---

## Minor Pitfalls

### Pitfall 17: Agent-process traps for the people doing this work

- **Backslash escapes in the Bash tool** are rewritten (project memory). Generate Lua or JS with `\n` through `Write`, not through a shell heredoc. Prevention: use `Write`.
- **Worktrees need their own `npm ci`**, and `npm run coverage` exits before reporting while any test is red (project memory). Prevention: compute coverage from `coverage/lua-hits` when red, and fix red first.
- **Plans in `docs/handoff/`** use the old repo name and drifted line numbers (CLAUDE.md). Prevention: grep for the quoted identifier.
- **"ForeverUI" or `/fui` in new text** is a CI-visible mistake only in some paths. Prevention: grep the diff before commit.
- **Version bump outside a release** breaks the packaging check. Prevention: bump only in the release commit.

**Phase to address:** every phase (PR template checklist).

### Pitfall 18: Package contents

A new top-level file or folder that players do not need must be in the `.pkgmeta` `ignore` list or `scripts/pkgmeta.test.mjs` fails; a file the game loads must be in `Vanguard.toc`. `.planning/` is a new top-level folder: confirm it is ignored before the first release candidate, or the zip check fails.

**Phase to address:** P7 Freeze (check), and any phase adding files.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Loosen a harness layout rule to pass a test | Green suite today | Real overlaps and clipping stop being caught (the open issue list is all of this kind) | Never without Blizzard-source evidence in the commit body |
| Raise the CI test timeout | Removes timeouts | Hides slow cases; the suite never fits the minute budget | Only as a temporary measure with a tracking issue |
| Execute-only test to hold the 100% floor | Floor holds | Coverage number stops meaning anything | Never; assert a frame, a call argument or a chat line |
| Early `return` with no message in a click handler | Avoids a bad action | Silent failure that looks like a bug (the Post button) | Never on a button the player clicks |
| `pcall` around a comparison to dodge a secret value | One line | Leaves the taint, spreads to shared frames `[community]` | Never; use `ns.IsSecret` first |
| Wrap everything in `ns.Try` | No popups | Errors only in `/vg errors`; tests pass over them | Yes for players, if a test-time assertion fails on any caught error |
| Split a 1,000-line file near launch to meet the 10-line cap | Rules satisfied | Load-order and upvalue bugs seen only in game | Only for files with a known bug, before the freeze |
| Run the full suite on every push | Early signal | Spends the monthly allowance | Only if the measured run is a few minutes |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `C_AuctionHouse` (Post/Commodity) | Call from a timer or deferred function; ignore the throttle-ready event; assume one flow for items and commodities | Call in the click only; model the throttle in the harness; test both paths and the `confirm` branch |
| Blizzard window skinning | Assign fields or replace methods on Blizzard frame tables | `hooksecurefunc` plus a Vanguard-owned table keyed by frame; defer protected changes out of combat |
| `issecretvalue` / `C_Secrets` | Treat a missing function as "nothing is secret" | Log it in `/vg status`; test the fallback; check `ns.AurasSecret()` as well |
| GitHub Actions on a private repo | Plan for public-repo runner speed and unlimited minutes | Measure on 2 vCPU; budget minutes; keep a break-glass merge path |
| CurseForge / Wago | Find out the game version is unsupported at upload | Check the Forever game-version entry before release candidate; rehearse an upload |
| `.pkgmeta` / TOC | Add a top-level folder without ignoring it | Run `node scripts/package.mjs && node scripts/check-zip.mjs` on every PR (already in `verify.yml`) |
| Masque and other addon APIs (`Vanguard.API.v1`) | Change a function signature near launch | Freeze the API surface; changes need a version bump and a note in `docs/API.md` |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full re-layout of raid tiles on each roster event | Hitching when people join or leave | Update changed tiles only | 20 to 40 player raids |
| Shared-frame unit events (`UNIT_HEALTH`, `UNIT_AURA`) to every handler | CPU use scales with group size and nameplates | `ns.OnUnit` per subscription | Raids, crowded towns with many plates |
| `OnUpdate` that never stops | Cost with the module off or the frame hidden | Stop on hide and on disable; throttle | Every session, grows with module count |
| Auction scans without queue discipline | Disconnects or throttled messages | One request in flight, 60 a minute (module rule); never from a loop | Scanning a full category |
| Each test builds the whole addon | Suite time, CI minutes | Share a logged-in state per file; split the large files | Already: about 50 worker-minutes |
| Large SavedVariables export strings | Slow login, big file | Compact exports, prune unused keys | Many profiles |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `loadstring` or `load` on imported profile text | Arbitrary code from a pasted string | Never; use the serializer and validate shape (CONCERNS) |
| `/vg report` includes more than counts and client facts | Leaks personal data when pasted in a public issue | Review the block once more at freeze; no account names or export strings |
| Secret values passed to chat, print or `tostring` | Taint, or hidden data revealed in a way Blizzard blocks | Never format a value that `ns.IsSecret` flags; use display sinks |
| Third-party code or art without a CREDITS note | Licence breach on a public listing | Credit file entry in the same commit (CLAUDE.md) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Empty panel with no message (#190, #195, #200) | Player cannot tell empty from broken | A one-line empty state on every list |
| Disabled-looking buttons that act, or enabled-looking ones that do not (#196, #197) | Mistrust of the UI | Disabled state from the same function that gates the action |
| Dead button (Post) | Looks like an addon failure, support load | Reason text; see Pitfall 3 |
| Text clipped at larger text scale or other locales | Unreadable tabs and labels (#188, #198) | Size from measured text width (`GetStringWidth`) plus padding; test at the largest text scale |
| First-run wizard drawn under or over other UI (#186) | Players skip setup, then fight defaults | Layer above movers; test with combat and with another addon's frames open |
| Error popups on launch day | Players blame Vanguard | Errors forwarded once and counted; `/vg report` gives a paste block |

## "Looks Done But Isn't" Checklist

- [ ] **Green suite:** often means "green on this machine" -- verify on the hosted runner, with `npm run coverage` actually reporting (it exits early while any test is red).
- [ ] **Bug fix with a test:** often asserts the new behaviour but not `ns.errors` -- verify the test fails on the pre-fix code and asserts zero caught errors.
- [ ] **Auction Post:** often tested through `AH.Post()` directly -- verify the test clicks the button, includes the throttle drop and ready event, and checks the `PostItem` or `PostCommodity` arguments, for both paths.
- [ ] **Combat-safe:** often means "guarded in the main path" -- verify with the harness in lockdown and with login in combat.
- [ ] **Secret-safe:** often covers the first read -- verify derived values, table keys, string formatting, tooltip writes.
- [ ] **Lua 5.1 clean:** often means luacheck passes -- verify CI ran it (local runs skip it when not installed) and no 5.3-only global is visible in the test VM.
- [ ] **Reskinned window:** often tested closed -- verify open, in combat, and with another addon loaded; atlas art sized, not cropped.
- [ ] **Fade or sound added:** often missing the `docs/THEME.md` row and the Reduce motion/Interface sounds check.
- [ ] **New file:** often missing from `Vanguard.toc` or `.pkgmeta` ignore -- verify with `node scripts/package.mjs && node scripts/check-zip.mjs`.
- [ ] **Issue closed:** often "fixed in code" only -- the five merged fixes stay open until the author confirms in game.
- [ ] **Release:** often untested on a clean `AddOns` folder -- verify by unzipping the real artifact.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Stub bent to pass (1) | MEDIUM | Revert the stub change, restore the strict rule, fix fixtures, re-run; list any case found to be a real bug |
| Hidden errors surfaced by the global assertion (2) | MEDIUM | Triage the list by player impact; fix login and combat errors first; allow-list the rest with issue numbers and an expiry |
| Post still dead after the fix (3) | MEDIUM | Ship with the visible reason text so the report shows which exit fired; have the author paste `/vg errors` and `/vg report` |
| Secret-value error in combat on launch day (4) | LOW to MEDIUM | Hotfix the one read with `ns.IsSecret` and a test; a module-off command for the interim |
| Blocked action in combat (5) | MEDIUM | Queue through `ns.OutOfCombat`; for a skin that taints, disable that skin via the module switch and ship |
| Suite too slow for the budget (6) | MEDIUM | Gate by changed paths; move the full run to merge and nightly-weekly; keep local `verify` as the main gate |
| Minutes exhausted (7) | LOW | Admin bypass of the ruleset for the hotfix, run the suite locally, paste the result in the PR |
| Interface mismatch at launch (10) | LOW | Add the new number to the TOC, bump the patch version, release; tell friends to enable out-of-date addons meanwhile |
| Refactor regression (9) | HIGH | `git revert` the commit (one task per commit makes this safe), re-land smaller; this is why the freeze exists |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Bending the stub | P1 Baseline | Each of the seven cases has a commit body naming the evidence; no stub rule loosened without it |
| 2 Swallowed errors | P1 Baseline, P3 Auction, P4 Review | Global `afterEach` zero-error assertion in place; money-path hooks and clicks under `ns.Try` |
| 3 Silent Post | P3 Auction | End-to-end click test with throttle and ready event; each silent exit has a visible reason; author posts in game |
| 4 Secret values | P1, P4, P6 | Sweep helper covers every module that reads a unit, aura, cooldown or chat payload; no new `pcall` guards |
| 5 Protected frames and taint | P1, P4, P5, P7 | Harness lockdown mode; login-in-combat test; in-combat smoke steps pass |
| 6 Suite time | P2 CI budget | Hosted run time on 2 vCPU, per-file times from JUnit, no file over about 60 s |
| 7 Minutes exhausted | P2, P7 | Weekly allowance check in each phase PR; break-glass path agreed |
| 8 No in-game check | All; P7 required | Needs-check list shrinks; a full smoke pass recorded with `/vg report` blocks |
| 9 Late refactors | P4, P7 | Structure-only commits keep test and coverage counts; freeze date observed |
| 10 Launch drift and release path | P7 Freeze | Clean-folder install of the release zip; rehearsed hotfix release; `/vg status` build recorded |
| 11 Lua 5.3 leakage | P1 Baseline | Test fails if a 5.3-only global is visible to addon code; luacheck ran in CI |
| 12 Per-frame work | P4 Review | Perf counters recorded; disabled-module test passes |
| 13 SavedVariables | P4, P5, P6 | Old and new fixtures load without errors |
| 14 Texture and motion rules | P5 Polish | `build-media --check` passes; THEME.md row per fade or sound |
| 15 Feature scope | P6 Features | Features limited to local plain data; cut date applied |
| 16 Missing events | P4, P7 | "not on this client" list reviewed against beta output |
| 17 Process traps | All | PR checklist |
| 18 Package contents | P7 | `scripts/check-zip.mjs` passes with `.planning/` ignored |

## Roadmap Implications

- **Put "errors fail tests", lockdown mode and the secret sweep helper in the first phase.** They are cheap harness changes that turn the biggest unobservable risks (Pitfalls 2, 4, 5) into observable ones, and they will probably reveal more red than #169 lists.
- **Do the auction root-cause before the file splits and before polish.** The root-cause error is probably small. A large refactor of `AuctionShop.lua`/`AuctionSell.lua` first would bury it.
- **Measure CI on the real runner before designing the CI fix.** Cost per case, not worker count, is the lever, and the target may need a path-gated design.
- **Book an in-game session during the beta window** (reported to end 2026-10-21) and again on a release candidate after 2026-11-01.
- **Research flags for later phases:** P3 Auction (the root cause is not yet known; needs reproduction, not more research), P5 PvP reskin (Blizzard PvP frame structure on Forever), P6 group helpers (addon messaging and chat restrictions in vanilla instances on Forever), P7 (CurseForge and Wago game-version support for Forever).
- **Standard patterns, unlikely to need research:** dead-code removal, theme token cleanup, empty-state messages, tab-width fixes.

## Sources

- Repo, observed 2026-10-09 at `47f1e94`: `Core/Events.lua`, `Core/Combat.lua`, `Modules/AuctionSell.lua`, `scripts/lib/wow-stub.lua`, `scripts/lib/wow-world.lua`, `scripts/tests/helpers.mjs`, `scripts/tests/setup.mjs`, `scripts/tests/smoke.test.mjs`, `scripts/coverage-lua.mjs`, `vitest.config.mjs`, `.github/workflows/verify.yml`, `full-suite.yml`, `lua-suite.yml`, `.luacheckrc`, `docs/SMOKE-TEST.md`, and issue #169 (via `gh issue view 169`). Local timing from `npx vitest run --project lua` (HIGH for the counts, MEDIUM for the durations because the machine was shared).
- [Patch 12.0.0 planned API changes, Warcraft Wiki](https://warcraft.wiki.gg/wiki/Patch_12.0.0/Planned_API_changes) (MEDIUM; alpha/beta-era text, the page says behaviour may change; only the first part of a long page was read)
- [Recount - Revived file notes, CurseForge](https://www.curseforge.com/wow/addons/recount-revived/files/8225229) and the CombatAnalytics and EllesmereUI file pages found in the same search (LOW to MEDIUM; addon author reports on secret arithmetic, `pcall`, protected `EnableMouse`)
- [WoW Forever loads your retail addons and keybinds, Warcraft Tavern](https://www.warcrafttavern.com/forever/news/wow-forever-loads-your-retail-addons-keybinds/) (LOW; disputed in the comments)
- Search result summaries on Forever's addon policy and launch date from Icy Veins, Final Boss and Guild Order (LOW; the Icy Veins page returned HTTP 403 and was not read; the beta end date of 2026-10-21 is from search text only)
- [How use of GitHub Actions is measured, GitHub Docs](https://docs.github.com/en/billing/concepts/product-billing/github-actions) (HIGH for the 2,000 included minutes and the $0 default spending limit; the 2-vCPU private-runner point and per-job rounding were not confirmed there, so check them on GitHub's runners page)
- Project memory notes: repos going private and CI budget; pre-existing test failures; atlas texcoords; coverage script needs a green suite; Bash backslash rewriting.

---
*Pitfalls research for: WoW addon UI suite near launch (Vanguard, WoW Forever)*
*Researched: 2026-10-09*
