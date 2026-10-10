# Phase 1: Green baseline - Research

**Researched:** 2026-10-09
**Domain:** Test-suite baseline for a Lua 5.1 WoW addon run in a Node/fengari headless client (Vitest); recording the outcome of GitHub issue #169
**Confidence:** HIGH for everything observed in this repo this session; LOW for one client-behaviour question (an empty font string's rect), marked where it appears.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Stub layout rule (cases #169-5, #169-6, #169-7)**
- **D-01:** Keep the stricter "laid out" rule in `scripts/lib/wow-layout.lua`. Fix the three test fixtures so they have a size or anchor, as the client would lay them out: the chat watch toast price line, the nameplate fixture (`__plates.nameplate1`), and the raid unit buttons under the stub's header emulation. No test is loosened to pass.

**Auction tab behaviour (cases #169-1 to #169-4)**
- **D-02:** Max-price filter (`auction.test.mjs:799`): the code is wrong. Listings above the list entry's `maxPrice` must be hidden. Fix the filter in the auction view and keep the test expectation.
- **D-03:** Sell-card history (`auctionledger.test.mjs:192`): listings are shown by default and history sits behind the toggle, as the test expects. Fix the sell card so it does this.

**Green bar and closing #169**
- **D-04:** Phase 1 is done when clean `main` passes the full suite locally and `npm run coverage` passes the 100% floor. No hosted-runner run is required in this phase; that confirmation moves to Phase 3.
- **D-05:** Issue #169 closes when every one of the seven cases has a recorded outcome (fixed with the cause named, or shown not to reproduce on clean main) and D-04 passes.

### Claude's Discretion
- Case #169-3 (keyboard focus): when a text box has focus, keys go to the box and not to the view. This is standard game behaviour, so the fix follows it without a question.
- Case #169-5 (chat watch empty price): the fixture fix in D-01 is preferred. Claude picks the smallest change that gives the empty font string a rect the way the client does.
- Every harness or stub change cites the 12.1 Blizzard source in its commit body (success criterion 3 in the roadmap).

### Deferred Ideas (OUT OF SCOPE)
- Hosted-runner confirmation of the green suite: moved to Phase 3 (CI measurement), per D-04.
- Splitting `Modules/AuctionHelper.lua` and `AuctionSell.lua`: Phase 5, after the Post fix.
- Dead-code removal and `ns.Every`: Phase 4.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CI-01 | The full test suite is green on main, and each of the seven cases in #169 is resolved with evidence (fixed, or documented as not reproducing) | All seven are already green on main `b032e6f`. Per-case root cause, fixing commit and file:line are in "The seven cases". Green was reproduced three times (two checkouts, two vitest versions). |
| CI-02 | `npm run coverage` reports again and the 100% line-coverage floor holds | `npm run coverage` printed its report at `b032e6f`: `total 19050/19050 100.00%`. The exit-early rule and what must hold are in "How `npm run coverage` decides". |
</phase_requirements>

## Summary

**The seven cases in #169 are not red on current `main`.** At `b032e6f` (the merge of PR #205, which is `main`), `npm test` reports 66 files and 873 tests passed, `npm run verify` passes, `npm run coverage` prints its report and holds 100.00% (19050/19050 lines), and `npm run lint` shows 0 errors. [VERIFIED: ran this session, outputs quoted under "Reproduction record"] The five files named in #169 pass: `Tests 120 passed (120)`. The seven failures do reproduce at the commit the issue was filed against (`eff5158`): `7 failed | 107 passed (114)`. So the state moved between 2026-10-07 and now, and #169 was never closed. The project note "three Lua-harness tests fail on main as of 2026-10-07" is stale.

**The planner's work in this phase is therefore evidence and record-keeping, not fixes.** Three tasks are enough: (1) re-baseline on a clean `npm ci` checkout and write down the SHA and counts; (2) post a per-case outcome table on #169 and close it (D-05); (3) optional small hardening listed under "Optional hardening". No `Modules/` change and no `scripts/lib/` change is needed to reach the green bar.

**Two locked decisions rest on a premise the evidence does not support.** D-02 and D-03 (and the "code" half of the Claude's-discretion note on case 3) say the addon code is wrong. It is not. I proved this by running a tests-only commit: `0cf01dc` ("Tests: the seven cases red since the auction tabs merge (#169)", on the unmerged local branch `claude/auction-tabs-leftovers`) changes no `Modules/Auction*` file relative to `eff5158`, and with its test-side fixes all ten `auction*` test files pass (102 tests). The auction code already hides listings above `maxPrice` (`Modules/AuctionShop.lua:406`, `:493`), already ignores keys while a box has focus (`Modules/AuctionTable.lua:251`), and the sell/history behaviour D-03 wants is what `main` does. The four auction "failures" were stale test setups that the auction work itself fixed on `main` (`84a7b0a`). D-05 explicitly allows "shown not to reproduce on clean main", so the decisions' intent (listings above max hidden, keys go to the box, listings by default and history behind a toggle) is met and the outcome is recorded as "not a code bug; test setup was stale; fixed in `84a7b0a`". The planner must not invent a code change to satisfy D-02/D-03 wording. **Flag this to the user in the plan** so it is a conscious reading of D-02/D-03, not a silent deviation.

**Primary recommendation:** Plan Phase 1 as "prove and record": a clean-checkout verify+coverage run (with SHA and counts), one comment on #169 with the seven-row outcome table (cause, fixing commit, file:line), close the issue, and make no Modules or stub change. Treat `claude/auction-tabs-leftovers` as stale: its `0cf01dc` loosens `scripts/lib/wow-layout.lua` (an empty font string "keeps its place"), which D-01 and roadmap success criterion 3 forbid, and it must not be merged.

## Project Constraints (from CLAUDE.md)

Directives that bear on this phase [VERIFIED: read `./CLAUDE.md` this session]:
- Before saying a change is done, `npm run verify` and `npm run coverage` must both pass. Every new line of addon Lua needs a test that executes it.
- Functions: a comment on the line above, body at most 10 lines (applies to test files too). Checked by `scripts/lib/code-quality.mjs` via `npm run quality`.
- Colours and font sizes only in `Core/Theme.lua`.
- Widget methods: add one to `scripts/lib/wow-widget-api.lua` only after confirming it exists in the 12.1 client. Unlisted methods are nil in tests on purpose.
- Lua 5.1 only. Do not edit `Libs/`; `Media/` is generated.
- Work on a branch named after the phase (for example `work/p1-green-baseline`), never commit to `main`. One task is one commit with subject `<task id> <area>: <change>` and a body saying what changed and what was verified. Open one PR per phase with tasks, tests added, skipped items and a "needs in-game check" list.
- You cannot run the game. Never claim in-game behaviour that was not observed.
- Plans in `docs/handoff/` use old repo names and drifted line numbers; grep for identifiers.
- Do not add a doc file unless the user asks.

## Architectural Responsibility Map

This phase has no UI tiers. The relevant tiers are the layers of the test harness.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Behaviour under test (auction filter, key handling, card layout) | Addon Lua (`Modules/`) | — | Already correct on main; no change needed |
| What a rect is, and when the client gives none | Stub layout (`scripts/lib/wow-layout.lua`) | In-game observation (`/vg frame`) | The rule was added from an in-game observation (commit `43734b3`); keep it strict (D-01) |
| Size and anchor of things the client creates (nameplates, group-header tiles) | Test fixtures (`scripts/tests/helpers.mjs`) | Blizzard source | The client sizes and anchors these; fixtures must do the same |
| Pass/fail and counts | Vitest (`vitest.config.mjs`, two projects `quick` and `lua`) | `scripts/lib/lua-summary-reporter.mjs` | `npm test` runs both |
| Coverage report and 100% floor | `scripts/coverage-lua.mjs` + `scripts/lib/lua-coverage.mjs` | `scripts/tests/setup.mjs` (dumps hits) | Separate process wrapper around `vitest run` |
| Recording outcomes | GitHub issue #169 | Commit bodies | D-05 |

## Standard Stack

No new package is installed in this phase.

### Core (already in the repo)
| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| Node | v24.14.0 | Runs Vitest and the scripts | [VERIFIED: `node --version`] |
| npm | 11.9.0 | `npm ci` / `npm test` | [VERIFIED: `npm --version`] |
| vitest | lock file says 5.0.3; the local `node_modules` had 5.0.2 | Test runner | [VERIFIED: `package-lock.json:1335-1336` reads `"node_modules/vitest": {` / `"version": "5.0.3",`; `npm ls` reported `vitest@5.0.2 invalid: "5.0.3" from the root project`; after `npm ci`, `npx vitest --version` printed `vitest/5.0.3 win32-x64 node-v24.14.0`]. Both versions give a green suite. |
| fengari | 0.1.5 | Lua 5.1 VM in Node | [VERIFIED: `npm ls fengari`] |
| luacheck | 1.2.0 at `/c/tools/lua/luacheck` | `npm run lint` (not part of `verify`) | [VERIFIED: `luacheck --version`]. Result: `Total: 742 warnings / 0 errors in 366 files` |
| gh | authenticated | Read and comment on #169 | [VERIFIED: `gh issue view 169` worked] |

**Installation:** `npm ci` (not `npm install`) so Vitest matches the lock file. Roadmap notes about pinning fengari/luacheck and `.nvmrc` belong to Phase 3 (no `.nvmrc` exists today: [VERIFIED: `ls .nvmrc` failed]).

## Package Legitimacy Audit

No external packages are added or changed in this phase, so the gate has nothing to check. Packages already in `package.json` (`@resvg/resvg-js` 2.6.2, `acorn`, `fengari`, `vitest`) are untouched.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## The seven cases (Question 1)

Baseline used by the issue: `eff5158` (2026-10-07 07:35, merge of #167). Current main: `b032e6f`. Reproduction at `eff5158` in a scratch worktree: [VERIFIED: ran this session]

```
 Test Files  5 failed (5)
      Tests  7 failed | 107 passed (114)
```

Reproduction at `b032e6f`: `Test Files  5 passed (5)` / `Tests  120 passed (120)`.

Case names below are as they appear in the test files on `main` (line numbers are `main`'s; the issue's line numbers are `eff5158`'s).

| # | Case (issue line) | Root cause | Code bug? | Resolved by | Where the fix is on `main` |
|---|-------------------|-----------|-----------|-------------|---------------------------|
| 1 | `auction.test.mjs:257` "two tabs join the window after the game's three" (`attempt to compare number with nil` on `c.length:GetBottom() > c.post:GetTop()`) | The test read the Selling page's sell and owned cards while the Shopping page was selected. A page that has not been shown has no layout, so `GetBottom()` was nil. [CITED: commit `0cf01dc` message: "the sell and owned cards are checked once the Selling tab shows (a page never shown has no layout)"]. The mechanism inside the addon is not traced (see Assumptions A5). | No. | `84a7b0a` "Auction house: the Selling tab laid out for its room" rewrote the layout and the case. | `scripts/tests/auction.test.mjs:250` (the case); the Selling checks run after `pickTab(addon, 5);` at `:280`. |
| 2 | `auction.test.mjs:799` "...leaves out what's over the max price" (9g 90s listing shown with `maxPrice` 50000) | The test replaced the saved list entry directly (`lists[...][1] = { term = 9999, maxPrice = 50000 }`) without the repaint that the filter dialog's Save does. The Shopping page had painted its rows at set-up with the old entry (a bare term, no filter), so clicking the row opened a view with `maxPrice = nil`. The filter itself is correct. | **No.** `listing()` drops rows above the view's `maxPrice` and `AH.OpenListings` takes `maxPrice` from the clicked entry. | `84a7b0a` (its message: "the view's max-price entry is repainted before the click") | `scripts/tests/auction.test.mjs:852`: `` addon.eval(`VanguardDB.ah.lists['TEST-ONLY Gear'][1] = { term = 9999, maxPrice = 50000 } ${HELPER}.PaintShop()`); `` Case is at `:844`. Addon side, unchanged: `Modules/AuctionShop.lua:493` `if row and not (v.maxPrice and row.price > v.maxPrice) then return row end`; `:550` `AH.view = { key = key, rows = {}, sort = "price", reverse = false, maxPrice = f and f.maxPrice }`; `AH.SaveFilters` (`:855`) ends with `AH.PaintShop()`. |
| 3 | `auction.test.mjs:867` "keys: ... while a box has the typing, keys go on" | The test's focus stub returned `ns.GetModule('AuctionHelper').frame`. `AH.frame` went away with the tabs, so the stub returned nil, which the addon reads as "nothing has the typing". The addon already follows the standard behaviour. | **No.** `Modules/AuctionTable.lua:251`: `local typing = type(GetCurrentKeyBoardFocus) == "function" and GetCurrentKeyBoardFocus() ~= nil` and `local used = not typing and t:IsShown() and useKey(t, key)`. The same check existed at `eff5158` in `AuctionShop.lua:597`. | `84a7b0a` ("a typing focus names a frame that exists") | `scripts/tests/auction.test.mjs:921`: `addon.eval("GetCurrentKeyBoardFocus = function() return AuctionHouseFrame end");` Case is at `:897`. |
| 4 | `auctionledger.test.mjs:192` "Your history on the sell card" (`c.list:IsVisible()` false) | The test never picked the Selling tab, so the page holding the sell card was hidden and `IsVisible()` was false. The listings were never missing. [CITED: `0cf01dc`: "the ledger test picks the Selling tab, where the sell card lives now"] | **No.** | `84a7b0a` moved the listings to an "Up now" card and rewrote the case. | `scripts/tests/auctionledger.test.mjs:198`: `expect([history(addon), historyLine(addon)], "listings by default; the toggle offers the history; no line on the sell card").toEqual([[false, "Your history", "", true, []], ""]);` Case title now "Your history on the Up now card". So D-03's behaviour (listings shown by default, history behind the toggle) holds and is asserted. |
| 5 | `chatwatch.test.mjs:201` "a line linking an item with an auction price" (`rect` undefined reading `rect.left`) | An item with no price leaves `Vanguard_ChatWatchToast.price` an empty font string, 0 wide, so it has no rect under the `laidOut` rule. The test read `price.rect.left` unconditionally. | No. `Modules/ChatWatch.lua:129-131` anchors the line to the price only when there is a price: `if price then f.line:SetPoint("RIGHT", f.price, "LEFT", -6, 0) else f.line:SetPoint("RIGHT", -8, 0) end`. | `e0f34d8` "Tests: the four full-suite failures that stopped the v0.5.0 release" (test-side) | `scripts/tests/chatwatch.test.mjs:191`: `priceLeft: price.rect?.left, priceRight: price.rect?.right`. See "Case 5 is the one judgment call". |
| 6 | `plates.test.mjs:172` "the cast icon is as tall as its bar" (`rect` undefined reading `width`) | The fixture nameplate `__plates.nameplate1` was a Frame with no size and no point, so it was not laid out and nothing hung on it had a rect. | No. | `e0f34d8` (fixture) | `scripts/tests/helpers.mjs:287-288` inside `PLATE_ENV` (opens `:275`): `p:SetSize(110, 45)` / `p:SetPoint("CENTER")`. The case is at `plates.test.mjs:153`, its assertion at `:172`. |
| 7 | `raid.test.mjs:95` "a class-colored top line ... along the top of the health bar" (`rect` undefined reading `top`) | `Vanguard_RaidUnitButton1` had no points and a 0 x 0 size in the stub, because the stub has no secure group header (`scripts/tests/helpers.mjs` comment: "The stub has no secure header, so tests create buttons the way the header would and call its setup"). | No. | `e0f34d8` (fixture) | `scripts/tests/helpers.mjs:208-218`, function `__spawn` in `RAID_ENV` (opens `:198`): sizes the tile from the header's `vg-width`/`vg-height`, anchors `TOPLEFT` on `Vanguard_Raid` at `-(i - 1) * h`, and grows the header with `Vanguard_Raid:SetSize(w, math.max(Vanguard_Raid:GetHeight(), i * h))`. The case is at `raid.test.mjs:86`, its assertion at `:95`. |

Note on the issue's wording for #7: it asks that "the stub's header emulation should anchor the buttons". There is no header emulation in the stub (`grep` for `SecureGroupHeader`/`initialConfigFunction` in `scripts/lib` finds only the template name in `wow-widget-api.lua:222`). The emulation is the `__spawn` helper in `helpers.mjs`, and that is where it was fixed.

### Case 5 is the one judgment call

D-01 and the discretion note say to give the empty font string "a rect the way the client does" by changing the fixture. That cannot be done in a fixture: the price is a font string the addon itself creates (`Modules/ChatWatch.lua:174-175`), and the stub gives a rect only when width and height are both above zero (`wow-layout.lua`, quoted below). The only ways to give it a rect are an addon change (a fixed width or height) or a stub change (rule loosened, which D-01 forbids). What `main` does instead is leave the stub alone and read the price's edges only when it has a rect.

Why this is not a loosened test: in the case with a price, `priceLeft`, `priceRight` and `lineRight` are all still asserted strictly (`chatwatch.test.mjs:200`: `expect([look.priceRight, look.lineRight], "the price at the toast's edge, the line ending 6 px before it").toEqual([look.toastRight - 8, look.priceLeft - 6]);`). In the case without a price, only `plain.text` and `plain.lineRight` are asserted (`:203`) and the price edges are not. So no assertion that guarded something was dropped.

**Recommendation:** keep `main`'s version, record the outcome as "fixed in `e0f34d8`, test reads an empty price's edges only when it has a rect; no stub change". State plainly in the #169 comment and the needs-in-game-check list that whether the real client gives an anchored empty font string a rect is **unverified (LOW)**. Two commits in this repo disagree about it: `e0f34d8` says an empty price "has no rect (as in the client)"; `0cf01dc` says a font string with no text "keeps its place, as in the client". Neither cites a source. The addon does not depend on the answer (the line anchors to the price only when there is one), so the in-game check is low-stakes.

## The stub's laid-out rule (Question 2)

### The rule as it stands (unchanged since `43734b3`)

`scripts/lib/wow-layout.lua:184-193`: [VERIFIED: read this session]

```lua
local function laidOut(w, depth)
  if w == UIParent then return true end
  if next(w.__points) == nil and scrollOwner(w) == nil then return false end
  local r = rectOf(w)
  if r.width <= 0 or r.height <= 0 then return false end
  for _, p in pairs(w.__points) do
    if type(p.rel) == "table" and p.rel ~= UIParent and (depth or 0) < 64 and not laidOut(p.rel, (depth or 0) + 1) then return false end
  end
  return true
end
```

`GetLeft`, `GetBottom`, `GetScaledRect` return nil and `IsRectValid()` (`:263`) returns `laidOut(self)`; `scripts/lib/wow-inspect.lua:14` returns `rect = nil` for a widget that is not valid. `wow-layout.lua` is byte-identical between `eff5158` and `main` (not in `git diff eff5158 main --stat`), so the rule did not change while the cases went green: every fix was in tests or fixtures. [VERIFIED: `git diff eff5158 main --stat -- scripts/lib` lists `lua-coverage.mjs`, `lua-harness.mjs`, `lua-summary-reporter.mjs`, `media-*.mjs`, `wow-stub.lua`, `wow-world.lua`; `wow-layout.lua` is absent.]

### Where the rule comes from (client behaviour)

- The rule was added in `43734b3` after an in-game observation. Its message: "`/vg frame` in game showed both bars and every button shown, visible and at full alpha, yet the backpack's icon reported its file's natural size (256 x 256) though anchored to its slot: the whole chain had no rect. Each bar hangs on a row anchor, a 0 x 0 frame; the client gives a zero-sized frame no rect and draws nothing anchored to one." The test `more.test.mjs:2235` repeats it: "(seen in game)". [CITED: commit `43734b3`; HIGH for "a 0 x 0 anchor frame leaves everything hung on it without a rect", because the author observed it in game.]
- The 12.1 API documentation lists `GetRect` and `GetCenter` as `MayReturnNothing = true` and has an `IsRectValid` function on script regions. [CITED: `Interface/AddOns/Blizzard_APIDocumentationGenerated/SimpleScriptRegionAPIDocumentation.lua:193-195` (`Name = "GetRect",` / `Type = "Function",` / `MayReturnNothing = true,`) and `:555` (`Name = "IsRectValid",`), wow-ui-source branch `forever`.] The docs do not say under which conditions the rect is missing, so they support "a rect can be absent" and do not independently confirm the zero-size rule.

### Every place a fixture is (or would be) changed to satisfy the rule

| Fixture | Where | State on `main` | Client behaviour and source | Confidence |
|---------|-------|-----------------|-----------------------------|-----------|
| Nameplate base frame size | `helpers.mjs:287` `p:SetSize(110, 45)` | Done | Lua-driven nameplates have their size set explicitly: `Blizzard_NamePlates.lua:634-640`: "`-- C++ needs to know the size of the nameplates...`" / `C_NamePlate.SetNamePlateSize(namePlateWidth, namePlateHeight);` / "`-- Lua nameplates are not affected by the C_NamePlate size functions and need to have their size explicitly set.`" / `frame:SetSize(namePlateWidth, namePlateHeight);` [CITED: wow-ui-source `forever`, `Interface/AddOns/Blizzard_NamePlates/Blizzard_NamePlates.lua`]. The size is therefore always given. | HIGH that a plate has a size; the 110 x 45 values are made up (the fixture's own) |
| Nameplate position | `helpers.mjs:288` `p:SetPoint("CENTER")` | Done | Positioning of plates is done by the engine (C++), not by Lua points; the Lua source above only shows size. | LOW (not in Lua source) |
| Nameplate `UnitFrame` fills the plate | `helpers.mjs:~289` `p.UnitFrame = CreateFrame("Frame", nil, p)` has no size or point | Not done. Harmless today (Vanguard anchors to the plate itself; `Modules/Nameplates.lua:323` reads `plate.UnitFrame` only to deal with Blizzard's frame) | `Blizzard_NamePlateBase.lua:17-22`: `function NamePlateBaseMixin:AcquireUnitFrame()` ... `self.UnitFrame:SetParent(self);` / `self.UnitFrame:SetAllPoints(self);` [CITED: wow-ui-source `forever`]. `0cf01dc` also did `p.UnitFrame:SetAllPoints(p)`. Adding it is faithful and optional. | HIGH |
| The extra plates `morePlates` | `plates.test.mjs:27-31` creates unsized, unanchored plates | Not done; none of those tests read a rect | Same as above | n/a. Leave until a test reads a rect off one (would be a one-line `SetSize`/`SetPoint`). |
| Raid tile size | `helpers.mjs:~212` `b:SetSize(w, h)` from `Vanguard_Raid:GetAttribute("vg-width")`, `"vg-height"` | Done | Our own snippet sizes the tile: `Modules/RaidFrames.lua:41-42`: `self:SetWidth(header:GetAttribute("vg-width"))` / `self:SetHeight(header:GetAttribute("vg-height"))`, run by the header through `initialConfigFunction` (`SecureGroupHeaders.lua:115`: `local configCode = header:GetAttribute("initialConfigFunction") or defaultConfigFunction;`) [CITED] | HIGH |
| Raid tile position | `helpers.mjs:~213` `b:SetPoint("TOPLEFT", Vanguard_Raid, "TOPLEFT", 0, -(i - 1) * h)` | Done | The header anchors the first child to itself and each later child to the previous one: `SecureGroupHeaders.lua:202` `unitButton:SetPoint(point, currentAnchor, point, 0, 0);` and `:211` `unitButton:SetPoint(point, currentAnchor, relativePoint, xMultiplier * xOffset, yMultiplier * yOffset);` with `currentAnchor = unitButton;` after each. [CITED: `Interface/AddOns/Blizzard_RestrictedAddOnEnvironment/SecureGroupHeaders.lua`, `forever`]. The fixture anchors every tile to the header at a cumulative offset, which gives the same rects with a different chain. | HIGH for "children are anchored"; the fixture's chain shape differs |
| Raid header grows to fit | `helpers.mjs:~214` `Vanguard_Raid:SetSize(w, math.max(Vanguard_Raid:GetHeight(), i * h))` | Done | `SecureGroupHeaders.lua:251-252`: `self:SetWidth(width);` / `self:SetHeight(height);` (and `:256-257` a minimum of 0.1 when empty). [CITED] | HIGH |
| Raid surplus tiles | n/a | The fixture spawns tile 1 and 3 and no tile 2 (`raid.test.mjs:88`), so there is a gap | `SecureGroupHeaders.lua:234`: `unitButton:ClearAllPoints();` for hidden surplus children (they have no rect) | LOW impact |
| Chat watch toast price (empty font string) | not a fixture; test reads `price.rect?.left` | See "Case 5 is the one judgment call" | Not documented in Lua source or API docs | **LOW** |
| Menu strip row anchors | `more.test.mjs:2235-2243` | Already done in `43734b3`; addon code was fixed (`MS.FitStrip` sizes each anchor) | In-game observation above | HIGH (observed) |

Mark for the PR's "needs in-game check": (a) an empty anchored font string's rect (chat watch toast with an unpriced item), (b) plate position is engine-driven, so the fixture's `CENTER` is only an approximation. Nothing else here needs the game.

### What not to do

- Do not edit `wow-layout.lua` in this phase. It needs no change, and criterion 3 forbids loosening a harness rule in the same commit as a test change.
- If a Blizzard-source citation is wanted in a commit body for a fixture change, use the line ranges above (they are on `forever` HEAD `2ced784`, dated 2026-10-09). [VERIFIED: `gh api repos/Gethe/wow-ui-source/branches/forever`]. The branch name `forever` is taken to mean the Forever client's UI source; that is an inference (A3).

## How `npm run coverage` decides (Question 3)

`package.json`: `"coverage": "node scripts/coverage-lua.mjs"`. [VERIFIED: read `package.json` and `scripts/coverage-lua.mjs` this session]

Flow in `scripts/coverage-lua.mjs`:

1. `:19-20` empties and recreates `coverage/lua-hits` (so stale hits never count).
2. `:21-25` runs `node node_modules/vitest/vitest.mjs run` (the whole suite, both projects) with `LUA_COVERAGE=1` and `LUA_COVERAGE_HITS=<dir>`. With `LUA_COVERAGE` set, `scripts/lib/lua-harness.mjs:207` installs the line hook on every Lua state.
3. **The early exit:** `:26` `if ((run.status ?? 1) !== 0) process.exit(run.status ?? 1);`. If any test fails or Vitest itself fails, the script exits with Vitest's status **before** it reads the hits or prints anything. That is the "exits before reporting while any test is red" behaviour. It is a deliberate rule, stated in the file header ("A failing test fails the run before any hits are read"), not a bug.
4. Each test file writes its own hits file at the end: `scripts/tests/setup.mjs` runs `afterAll(() => { const dir = process.env.LUA_COVERAGE_HITS; if (dir) dumpHits(path.join(dir, \`${path.basename(...)}-${process.pid}.json\`)); })`. `setupFiles` is global in `vitest.config.mjs:21`, so both projects dump. Observed: 66 test files, 66 hits files.
5. `:27-32` `loadHits(hits)`: a missing or empty hits directory is an error and exits 1 (`lua-coverage.mjs:119` `if (files.length === 0 || !fs.existsSync(files[0])) throw new Error(...)`).
6. `:35` counts only the addon's own Lua: every `.lua` in the TOC except `Libs/`.
7. `:37` reads the floor: `scripts/lua-coverage-floor.json` is `{ "lines": 100 }`. `:38` writes `coverage/lua-coverage.json`, `:39` prints `Lua line coverage (floor 100%)` and the table (only files below 100% get a row, then the `total` line).
8. `:41-44` `if (report.pct + 1e-9 < floor) { console.error(...below the floor...); process.exit(1); }`.

**What must be true to print and pass:** (a) the whole suite is green (exit 0), (b) every test file reaches its `afterAll` so the hits exist, (c) the covered executable lines equal the total, with the 1e-9 slack only absorbing floating-point error. Observed result at `b032e6f`: [VERIFIED: ran `npm run coverage` this session, 5 min 32 s]

```
Lua line coverage (floor 100%)
  total                        19050/19050 100.00%
```

(No per-file rows, so every file is at 100%.) Executable lines come from the compiled functions (`lua-coverage.mjs:36-45` skips each function's implicit final `return` and the `return` after a tail call). Adding Lua lines changes the total; any new line needs a test (CLAUDE.md).

**Fallback when a test is red** (matches the project note): the hits are still written by `afterAll`, so this prints the same report without the wrapper. [VERIFIED: ran it against the hits from the green run and got the same total line]

```sh
node -e "import('./scripts/lib/lua-coverage.mjs').then(async m=>{const h=await import('./scripts/lib/lua-harness.mjs'); m.loadHits('coverage/lua-hits'); const files=h.tocFiles().filter(f=>f.endsWith('.lua')&&!f.startsWith('Libs/')); console.log(m.formatReport(m.coverageReport(h.root,files)))})"
```

Do not use it as the pass criterion; the criterion is `npm run coverage` exiting 0.

## Reproduction record (Question 4)

All run this session on Windows 11, Node v24.14.0, 16 cores (`nproc`), repository at `b032e6f` plus the `.planning` commits. [VERIFIED]

| Run | Where | Result |
|-----|-------|--------|
| Five #169 files at `eff5158` | scratch worktree | `Test Files 5 failed (5)`, `Tests 7 failed \| 107 passed (114)`; failures: `auction 69/72`, `auctionledger 9/10`, `chatwatch 10/11`, `plates 8/9`, `raid 11/12` (the seven cases exactly as in #169) |
| Five #169 files at `b032e6f` | repo, vitest 5.0.2 | `Test Files 5 passed (5)`, `Tests 120 passed (120)`, 69 s |
| `npm test` at `b032e6f` | repo, vitest 5.0.2 | `Test Files 66 passed (66)`, `Tests 873 passed (873)`, `Duration 293.42s` |
| `npm run coverage` at `b032e6f` | repo | report printed, `total 19050/19050 100.00%`, 5 min 32 s |
| `npm run quality` | repo | `OK  every function is documented and at most 10 lines; colors and text sizes come from the theme` |
| `node scripts/build-media.mjs --check` | repo | `OK  68 media files match their sources` |
| `npm run lint` | repo | `Total: 742 warnings / 0 errors in 366 files` (warnings pre-existing; `lint` is not in `verify`) |
| `npm ci && npm run verify` at `b032e6f` | clean scratch worktree, vitest 5.0.3 from the lock | `Test Files 66 passed (66)`, `Tests 873 passed (873)`, `Duration 324.41s`, quality `OK`, exit 0 |
| Auction group at `0cf01dc` | scratch worktree | `auction*` 10 files, `Tests 102 passed (102)`; `git diff eff5158 0cf01dc --stat -- 'Modules/Auction*'` is empty (proves cases 1-4 were test-side) |

The hosted runner cannot be used now: the last PR run (`37881633351`, PR #205) failed in 3 s with "The job was not started because recent account payments have failed or your spending limit needs to be increased." [VERIFIED: `gh run view 37881633351`]. That matches D-04 (no hosted run in this phase). For context: a `release` run on `main` at `530c226` (the merge of #184), run `37689125179`, succeeded after 9 min 19 s, so a hosted full-suite pass existed on 2026-10-07 after the three layout cases were fixed. [CITED: `gh run list --branch main`; I did not read whether its Suite job includes coverage (A4).]

### Commands to use

```sh
# 0. Clean install, same as CI
npm ci

# 1. The seven cases (≈70 s). Pass = "Tests  120 passed (120)" and no "failed"
npx vitest run scripts/tests/auction.test.mjs scripts/tests/auctionledger.test.mjs scripts/tests/chatwatch.test.mjs scripts/tests/plates.test.mjs scripts/tests/raid.test.mjs

# 2. Whole suite (≈5 min on 16 cores). Pass = exit 0, "66 passed (66)" and "873 passed (873)" or higher counts, 0 failed
npm test

# 3. Suite + code-quality scan. Pass = exit 0 and the "OK  every function is documented..." line
npm run verify

# 4. Coverage (≈5.5 min). Pass = exit 0 and "total ... 100.00%"
npm run coverage; echo "exit=$?"
```

Run `npm run coverage` last: it runs the whole suite again, so a green coverage run also covers criterion 1. The Lua area summary printed at the end of Vitest (`Lua harness by area`, one `n/n passed` line per area) is the quickest way to spot a red area.

To reproduce the **original** failure for the record: check out `eff5158` in a separate worktree (give it its own `npm ci`; do not share `node_modules` with a junction when removing the worktree afterwards) and run command 1.

## Architecture Patterns

### Recommended shape of the phase's work

```
Phase 1 plans
├── 01-01  Re-baseline on a clean checkout: git clone/worktree at main SHA, npm ci,
│          npm run verify, npm run coverage; write SHA, counts, durations into the
│          phase summary. Also run the five-file command.
├── 01-02  Record outcomes: one comment on #169 with the seven-row table (cause,
│          fixing commit, file:line, "not a code bug"), then close #169 (D-05).
│          (Closing an issue is an outward action: gate it on the user.)
└── 01-03  Optional hardening (see below). Skip if time is short.
```

Branch per CLAUDE.md: `work/p1-green-baseline`, one commit per task, subject `<task id> <area>: <change>`, body says what changed and what was verified, ends with the attribution line from the session. Phase 1 likely produces few or no code commits, so the PR may be docs/.planning only; if there is nothing to merge, record the evidence in the phase summary and on #169 instead of opening an empty PR.

### Pattern: outcome comment on #169

```markdown
Re-baselined on main b032e6f (clean `npm ci`): `npm run verify` and `npm run coverage` pass
(66 files, 873 tests, 0 failed; Lua line coverage 19050/19050 = 100.00%).

| # | Case | Cause | Fixed in |
|---|------|-------|----------|
| 1 | auction.test.mjs "two tabs join the window" | Test read the Selling cards before the Selling tab had shown | 84a7b0a (tests rewritten with the new layout) |
| 2 | auction.test.mjs "...over the max price" | Test replaced the saved entry without the repaint the filter dialog does; the filter is correct (AuctionShop.lua:493) | 84a7b0a, auction.test.mjs:852 |
| 3 | auction.test.mjs "keys: ... keys go on" | Focus stub named `AH.frame`, gone with the tabs; AuctionTable.lua:251 already handles typing | 84a7b0a, auction.test.mjs:921 |
| 4 | auctionledger.test.mjs "Your history" | Test never picked the Selling tab; page hidden | 84a7b0a, auctionledger.test.mjs:198 |
| 5 | chatwatch.test.mjs price line | Empty price font string is 0 wide, no rect; test now reads its edges only when it has one | e0f34d8, chatwatch.test.mjs:191 |
| 6 | plates.test.mjs cast icon | Fixture plate had no size or point; client sizes plates (Blizzard_NamePlates.lua:634-640) | e0f34d8, helpers.mjs:287-288 |
| 7 | raid.test.mjs top line | Stub has no secure header; fixture now sizes, anchors and grows the header as SecureGroupHeaders.lua:115,202-211,251-252 do | e0f34d8, helpers.mjs:208-218 |

No stub or addon change was needed. Unverified in game: whether the client gives an anchored empty font string a rect (case 5).
```

(Fill in the real SHA, counts and the commit hashes at execution time; the SHAs above were read this session.)

### Optional hardening (planner decides; none is needed for the green bar)

1. **A regression test through the real dialog** for D-02's intent: type a max price in `Vanguard_AuctionFilters`, click Save, open the entry, and assert the above-max listing is not in the view. This proves the real path (`AH.SaveFilters` then `AH.PaintShop`) and not just the direct-assignment shortcut the test uses now. Pattern exists at `auction.test.mjs:587-596` (`openFilters`, `addon.type("Vanguard_AuctionFilters.price", ...)`, `addon.click("Vanguard_AuctionFilters.save")`). This adds test lines only; Lua coverage stays at 100%. Test-only commit, so it does not touch the harness.
2. **`p.UnitFrame:SetAllPoints(p)`** in `PLATE_ENV` (cite `Blizzard_NamePlateBase.lua:17-22`). Fixture-only commit.
3. Leave `claude/auction-tabs-leftovers` alone and tell the user it is stale and holds the stub-loosening change. Deleting the branch is the author's call.
4. After the phase, refresh the project memory notes that now mislead: `preexisting-test-failures.md` (the three failures it lists are fixed) and the red-suite part of `coverage-script-needs-green-suite.md` (the early-exit rule is still true; the suite is green).

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Giving test frames the geometry the client gives | A looser `laidOut` or a stub default size | Fixture `SetSize`/`SetPoint` as in `helpers.mjs` | Loosening the stub teaches it layouts the client does not give (PITFALLS Pitfall 1) |
| Coverage when a test is red | A second coverage tool | The one-line `node -e` fallback above, or fix the red test | The project already has the report code |
| Proving a case "does not reproduce" | A claim in prose | The commands in "Reproduction record" with SHAs and counts, plus `git diff <old> <new> -- <paths>` | D-05 wants evidence |
| Reproducing the old failure | A hand-edited tree | A scratch `git worktree` at `eff5158` with its own `npm ci` | Keeps the working tree clean |

## Common Pitfalls

### Pitfall 1: Changing code to satisfy D-02/D-03 when the code is right
**What goes wrong:** An executor reads "the code is wrong" and edits `AuctionShop.lua` or the sell card, risking a regression in code that passes and is fully covered.
**Why it happens:** The issue and CONTEXT were written from the failure text at `eff5158`, before anyone traced the cause.
**How to avoid:** Run the five-file command first. If green, the task is evidence, not a fix. Show the user the finding (this document) before the plan locks.
**Warning signs:** A diff in `Modules/Auction*.lua` in a phase whose tests were already green.

### Pitfall 2: Bending the stub (PITFALLS Pitfall 1)
**What goes wrong:** Case 5 invites "make an empty font string keep its rect" in `wow-layout.lua`, the very change `0cf01dc` made.
**How to avoid:** No `scripts/lib/wow-layout.lua` or `wow-widget-api.lua` edit in this phase. Check with `git diff --stat main..HEAD -- scripts/lib` and with `git log --name-only` that no commit touches both `scripts/lib/wow-*.lua` and a `scripts/tests/*.test.mjs`.
**Warning signs:** A commit message that says "make tests pass".

### Pitfall 3: Merging the stale branch
**What goes wrong:** `claude/auction-tabs-leftovers` (local, no PR: [VERIFIED: `gh pr list --head` returned nothing]) is three commits ahead of `main` (`git log --oneline main..claude/auction-tabs-leftovers`): `edf17e5` (a split of the big test files by area; `main` has no `scripts/tests/auction-*.test.mjs`, so that split is not on `main`), `0cf01dc` (edits `wow-layout.lua`, loosening it, and tests together) and `bd782de` (an unrelated Healing change). The tests-only proof in this document runs on that branch's split layout, which is why it uses `scripts/tests/auction*` there and the single `auction.test.mjs` on `main`.
**How to avoid:** Do not merge or cherry-pick it. Everything it fixed is fixed on `main` another way.

### Pitfall 4: Trusting a stale local `node_modules`
**What goes wrong:** The local install had vitest 5.0.2 while the lock says 5.0.3. Results happen to match, but "clean checkout" evidence should come from `npm ci`.
**How to avoid:** `npm ci` before the recorded run.

### Pitfall 5: A green suite is not an error-free suite
**What goes wrong:** Only `smoke.test.mjs` asserts `#ns.errors == 0` today (PITFALLS Pitfall 2). Phase 1's "green" says nothing about swallowed errors; Phase 2 will add the global guard and may turn some of the 873 red.
**How to avoid:** Say so in the phase summary so a Phase 2 red wave is not read as a Phase 1 regression.

### Pitfall 6: Sharing `node_modules` with a junction, then deleting the worktree
**What goes wrong:** Removing a worktree whose `node_modules` is a junction can follow the link and delete the real folder. I removed the junction first (`cmd /c rmdir <junction>`) and then the worktree; confirm `node_modules` still has its entries afterwards.
**How to avoid:** Give each worktree its own `npm ci` (the project note says the same).

### Pitfall 7: Wall-clock and hosted limits
**What goes wrong:** The suite takes 5-5.5 min on 16 cores; coverage adds instrumentation. On a 2-core hosted runner this is much longer (the 2026-10-07 `full suite` run on `main` was cancelled after 31 min: [CITED: `gh run list --branch main`, run `37615152897`]). That is Phase 3's problem, not this phase's, but do not set a short timeout when recording the local run.

## Code Examples

### The key handler that already ignores keys while a box has the typing
```lua
-- Source: Modules/AuctionTable.lua:249-254 (read this session)
local function onKey(t, key)
  local typing = type(GetCurrentKeyBoardFocus) == "function" and GetCurrentKeyBoardFocus() ~= nil
  local used = not typing and t:IsShown() and useKey(t, key)
  if not ns.InCombat() and ns.Client.Has("keyPropagate") then t:SetPropagateKeyboardInput(not used) end
end
```

### The view filter that already drops listings above the max
```lua
-- Source: Modules/AuctionShop.lua:489-494 (read this session)
local function listing(v, i)
  local api = C_AuctionHouse
  local r = v.commodity and api.GetCommoditySearchResultInfo(v.key.itemID, i) or api.GetItemSearchResultInfo(v.key, i)
  local row = r and (v.commodity and commodityListing(r) or itemListing(r))
  if row and not (v.maxPrice and row.price > v.maxPrice) then return row end
end
```

### The raid fixture that stands in for the secure header
```lua
-- Source: scripts/tests/helpers.mjs:208-218 (read this session)
function __spawn(i, unit)
  local b = CreateFrame("Button", "Vanguard_RaidUnitButton" .. i, Vanguard_Raid, "SecureUnitButtonTemplate")
  local w, h = Vanguard_Raid:GetAttribute("vg-width"), Vanguard_Raid:GetAttribute("vg-height")
  b:SetSize(w, h)
  b:SetPoint("TOPLEFT", Vanguard_Raid, "TOPLEFT", 0, -(i - 1) * h)
  Vanguard_Raid:SetSize(w, math.max(Vanguard_Raid:GetHeight(), i * h))
  Vanguard_Raid.initialConfigFunction(Vanguard_Raid, b:GetName())
  b:SetAttribute("unit", unit)
  return b
end
```

## State of the Art

| Old state | Current state | Changed | Impact |
|-----------|---------------|---------|--------|
| Seven red cases (#169), 3 layout-rule cases fixed by test/fixture edits on branch `claude/auction-tabs-leftovers` (never merged) | All seven green on `main` via `84a7b0a` (auction) and `e0f34d8` (layout rule) | 2026-10-07 11:09 and 16:57 | #169 is stale; its text and the project notes still say red |
| Auction sell card holds the listings and history | "Up now" card holds listings (table) with the history toggle; the sell card shows a one-line history | `84a7b0a` | D-03's behaviour holds in the new layout |
| Local vitest 5.0.2 | Lock file 5.0.3 | probably the Dependabot npm update merged as #173 (not checked) | `npm ci` gives 5.0.3; both green |

**Deprecated/outdated:** the issue's line numbers (shifted); the project notes `preexisting-test-failures.md` (three tests "fail on main as of 2026-10-07").

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | In the real client an anchored, empty font string either has no rect or keeps one; neither is verified. The repo's two commits disagree (`e0f34d8` vs `0cf01dc`). | Case 5 | Low: the addon does not depend on it (anchors to the price only when set). Put on the in-game check list. |
| A2 | Nameplate position is set by the engine, not Lua points, so the fixture's `SetPoint("CENTER")` approximates it. | Laid-out table | Low: only matters if a future test measures a plate's screen position |
| A3 | The `forever` branch of `Gethe/wow-ui-source` is the Forever client's 12.1 UI source. The branch exists and was last updated 2026-10-09; its content matches what the repo's code expects (for example `SecureGroupHeaders.lua`). | Laid-out table, Sources | Low: citations in commit bodies would name the wrong branch |
| A4 | The 2026-10-07 `release` run's Suite job (run `37689125179`, `main` at `530c226`) included the coverage floor. I saw only its success status. | Reproduction record | None for the phase (hosted proof is Phase 3) |
| A5 | The addon-side mechanism for "a page never shown has no layout" (case 1) was not traced. The cause is established by the tests-only commit passing; why the page has no rect before first show is from the commit message. | Case 1 | None: that code was rewritten in `84a7b0a` and passes |
| A6 | Reading D-02/D-03 as satisfied by "behaviour holds on main, test setups were stale" is acceptable to the user. | Summary | Medium: the user may have intended a code change; confirm in the plan |

## Open Questions

1. **Does the user accept recording cases 1-4 as "not a code bug" despite D-02/D-03?**
   - What we know: the code already does what D-02/D-03 want; a tests-only commit with no `Modules/Auction*` change makes them pass; the cases were fixed on `main` in `84a7b0a`.
   - What's unclear: whether the user wants extra protection (the optional dialog-path test).
   - Recommendation: record as not-a-code-bug, add the optional regression test, and state the reading in the plan so the user can object before execution.
2. **Close #169 now or after Phase 3's hosted run?**
   - D-05 says close when each case has an outcome and D-04 passes; D-04 is local. Recommendation: close with the local evidence, and note on the issue that hosted confirmation comes in Phase 3 (the hosted runner is currently blocked by billing).
3. **Delete the stale local branch `claude/auction-tabs-leftovers`?** Author's call; it holds `bd782de` (a Healing change, and the `edf17e5` test-file split, neither on `main`: `git log main..claude/auction-tabs-leftovers` lists them). Worth asking whether either is wanted before the branch goes.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Everything | yes | v24.14.0 | — |
| npm | `npm ci`, scripts | yes | 11.9.0 | — |
| Vitest, fengari | Tests | yes (after `npm ci`) | 5.0.3 / 0.1.5 | — |
| luacheck | `npm run lint` (optional) | yes | 1.2.0 | skip lint |
| gh CLI (authenticated) | Comment on and close #169, read Blizzard source | yes | — | edit the issue in the browser |
| Hosted GitHub runner | Not needed (D-04) | no (billing) | — | local run |
| Playwright | `npm run preview` only | not needed | — | — |
| WoW client | In-game checks | no | — | Needs-in-game-check list |

**Missing dependencies with no fallback:** none.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` (read this session), so this section applies.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 (lock file), two projects: `quick` (JS tests + `smoke.test.mjs`) and `lua` (harness area tests + `lua-engine.test.mjs`) |
| Config file | `vitest.config.mjs` (setup file `scripts/tests/setup.mjs`) |
| Quick run command | `npm run test:quick` (≈10 s) |
| Full suite command | `npm test` (≈5 min on 16 cores) |

### Phase Requirements → Test Map

| Criterion / Req | Behaviour | Test type | Automated command | Expected output | File exists? |
|-----------------|-----------|-----------|-------------------|-----------------|--------------|
| SC1 / CI-01 | Full suite reports zero failed cases on a clean checkout of main | full suite | `npm ci && npm test; echo "exit=$?"` | `Test Files  66 passed (66)`, `Tests  873 passed (873)` (counts may rise), `exit=0`, every `Lua harness by area` line `n/n passed` | yes |
| SC1 / CI-01 | Same plus code-quality | verify | `npm run verify; echo "exit=$?"` | above plus `OK  every function is documented and at most 10 lines; colors and text sizes come from the theme`, `exit=0` | yes |
| SC2 / CI-01 | The seven cases pass | targeted | `npx vitest run scripts/tests/auction.test.mjs scripts/tests/auctionledger.test.mjs scripts/tests/chatwatch.test.mjs scripts/tests/plates.test.mjs scripts/tests/raid.test.mjs` | `Tests  120 passed (120)`; areas `auction 74/74`, `auctionledger 10/10`, `chatwatch 11/11`, `plates 13/13`, `raid 12/12` | yes |
| SC2 / CI-01 | Each case has a recorded outcome on #169 | manual-by-command | `gh issue view 169 --comments` | a comment with seven rows (cause plus commit plus file:line) and the issue state `CLOSED` | created in plan 01-02 (manual: needs the user's go-ahead to post and close) |
| SC2 / CI-01 | The auction cases were not code bugs | evidence | `git diff --stat eff5158 0cf01dc -- 'Modules/Auction*'` | empty output | yes |
| SC3 | No harness/stub change was made, or each cites Blizzard source, and no commit changes a harness rule and a test together | git audit | `git diff --stat main..HEAD -- scripts/lib` (expect empty); `git log --name-only --format=%h main..HEAD` and check no commit lists both `scripts/lib/wow-*.lua` and `scripts/tests/*.test.mjs`; for any `scripts/lib` change, `git log -1 --format=%B <sha> \| grep -E "wow-ui-source\|Blizzard_"` | empty diff (criterion met vacuously) or a citing body | yes |
| SC4 / CI-02 | Coverage prints its report and holds the floor | coverage | `npm run coverage; echo "exit=$?"` | final lines `Lua line coverage (floor 100%)` and `total  19050/19050 100.00%` (numbers move if Lua lines change; pct must be 100.00%), `exit=0` | yes |
| SC4 / CI-02 | Floor file unchanged | file check | `cat scripts/lua-coverage-floor.json` | `{ "lines": 100 }` | yes |
| Optional hardening | A max price saved in the dialog hides dearer listings in the view | harness case | `npx vitest run scripts/tests/auction.test.mjs -t "max price"` | passes; fails if `Modules/AuctionShop.lua:493` is reverted | no (Wave 0 if the task is taken) |

### Sampling Rate
- **Per task commit:** the five-file command (≈70 s), plus `npm run quality` if any `.mjs` test file changed.
- **Per wave merge:** `npm test` (≈5 min).
- **Phase gate:** `npm ci`, then `npm run verify`, then `npm run coverage` (≈11 min together; coverage re-runs the suite, so it can serve as the SC1 evidence if its exit code is 0), all green before `/gsd-verify-work`.
- Run the suite twice before declaring done (Phase 2 owns flakiness, but a Phase 1 pass that is flaky is not a baseline). Three green runs already exist from this session.

### Wave 0 Gaps
None for the core path: existing infrastructure covers every criterion. Only the optional dialog-path regression test (hardening item 1) would add a case, in `scripts/tests/auction.test.mjs`.

## Security Domain

`security_enforcement` is true and `security_asvs_level` is 1 in config. This phase changes no runtime addon code by default (tests, docs and an issue comment).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | `gh` uses the author's existing login; closing an issue needs the user's go-ahead |
| V5 Input Validation | no | No new input paths |
| V6 Cryptography | no | — |
| V14 Configuration / supply chain | minimal | `npm ci` from the lock file; no new dependencies (see Package Legitimacy Audit) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Untrusted downloaded content | Tampering | Blizzard source was fetched with `gh api` into a scratch folder and only read, not executed |
| Accidental data loss when removing a worktree that links `node_modules` | Tampering/DoS | Remove the junction first; give worktrees their own `npm ci` |
| Posting to a public issue | Information disclosure | The #169 comment contains only repo facts; the repo is going private (project note), still avoid pasting local paths or the user's email |

## Sources

### Primary (HIGH confidence)
- This repository at `b032e6f`, read and run this session: `CLAUDE.md`, `package.json`, `vitest.config.mjs`, `scripts/coverage-lua.mjs`, `scripts/lib/lua-coverage.mjs`, `scripts/lib/wow-layout.lua`, `scripts/tests/setup.mjs`, `scripts/tests/helpers.mjs`, `scripts/tests/{auction,auctionledger,chatwatch,plates,raid,more}.test.mjs`, `Modules/{AuctionShop,AuctionTable,ChatWatch,RaidFrames}.lua`, `.planning/config.json`.
- Git history: commits `43734b3`, `84a7b0a`, `0cf01dc`, `e0f34d8`, `bd782de`; `git diff eff5158 main`.
- GitHub issue #169; run `37881633351` (billing failure); run `37689125179` (release, success).
- wow-ui-source branch `forever` (HEAD `2ced784`, 2026-10-09): `Interface/AddOns/Blizzard_NamePlates/Blizzard_NamePlates.lua:634-640`, `Blizzard_NamePlateBase.lua:17-22`, `Interface/AddOns/Blizzard_RestrictedAddOnEnvironment/SecureGroupHeaders.lua:115, 202-211, 234, 251-257`, `Interface/AddOns/Blizzard_APIDocumentationGenerated/SimpleScriptRegionAPIDocumentation.lua:193-195, 555`.

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` (Pitfalls 1 and 2) and `.planning/codebase/TESTING.md`: read as context; their "751/751" and "three red tests" figures are superseded by the runs above.

### Tertiary (LOW confidence)
- None used as authority. The empty-font-string rect question has no source (A1).

## Metadata

**Confidence breakdown:**
- Seven-case root causes: HIGH. Reproduced red at `eff5158`, green at `b032e6f`, and the tests-only commit `0cf01dc` shows cases 1-4 need no Modules change.
- Coverage behaviour: HIGH. Read the script and ran it.
- Client behaviour of the laid-out rule: HIGH for the 0 x 0 anchor frame (author's in-game observation), HIGH for plate size and group-header anchoring (Blizzard source), LOW for an empty font string and for plate position.
- Pitfalls: HIGH.

**Research date:** 2026-10-09
**Valid until:** until the next commit to `main` that touches `scripts/` or auction/raid/nameplate/chat-watch modules; re-run the five-file command before executing the plan. Blizzard `forever` line numbers drift with each client build.
