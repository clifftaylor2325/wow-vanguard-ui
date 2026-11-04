# Twenty bug hunts: the test plan (written 2026-11-04)

Twenty hunts of ten waves each, run after the launch-week fixes (#733 to #743) and the retail build (its plan is in the project files under `research/retail-support/`: the research report and the week-one and week-two briefs). Hunters are Sonnet 5.5; every wave's findings go through an Opus 5.5 adversarial review before anything is fixed. Fixes land in four block PRs, not twenty. Nobody can run the game, so every kept finding that needs the game becomes a step in `docs/SMOKE-TEST.md` for Cliff.

Read with `CLAUDE.md` (the rules), `docs/features/` (the spec), `scripts/tests/README.md` (the harness) and the hunt reports in the project files (`review/stability-hunt-*.md`, `review/ui-hunt-*.md`). This page is the brief every hunt thread points to; a thread's own brief adds only its hunt id, its block branch and the commit it hunts.

## 1. Why these twenty

Hunts 1 to 14 (#692 to #710, 2026-10-27 to 10-29) ran about 120 waves over the addon as it stood on 10-29. Their returns tell us where to look now:

- **Lens hunts on stable code ran dry.** By hunts 9 to 11 the hazard lenses (re-entrancy, pools, throttles, event payloads, hooks, secure templates, time gaps) found three to nine small bugs per hunt, with three to four empty waves each. Running those lenses again over the same code is the lowest-yield thing we could do.
- **Look hunts against Blizzard's source stayed productive.** Hunt 13 (skinned windows) fixed 31, hunt 14 (HUD pieces) fixed 28, and Cliff found two more in minutes on retail the same morning. Reading our skins against the game's XML and Lua, on both clients, keeps paying.
- **Wrong-action and per-locale hunts paid too.** Hunt 6 (irreversible money and item calls, auto accept, parsed game text) kept 21.
- **New code has never been hunted.** Since hunt 14's base (`4d86d2c`) about 40 PRs merged: the whole keybind and click-cast build (eleven new or rewritten files, `Modules/Keybinds*`, `KeysView*`, `ClickCast*`), the Calm HUD for the whole HUD (#714, #719), the art milestones (ornaments, painted crest, banner, panel texture, AFK scenes, #722, #730 to #743), the launch-day fixes, and now the retail build (retail class resources, `RetailWindows`, retail quest blocks, warband bank, per-client data tables, housing, Mythic+, vault, delves, professions). None of it has had a single wave.
- **Some old code was never fixed by any hunt.** Of the 196 files under `Core/` and `Modules/`, 97 were untouched by every hunt fix from #692 to #710. Among them: `UnitFrames.lua`, `FrameAuras.lua`, `RaidAuras.lua`, `RaidStatus.lua`, `ClassBars.lua`, `PowerTicks.lua`, `SwingTimer.lua`, `Merchant.lua`, `Inventory.lua`, `VendorMemory.lua`, `InstancePrep*.lua`, `Upgrade*.lua`, `TalentPlanner.lua`, `QuestGuide*.lua`, `Quest*View.lua`, `QuestHistory.lua`, `MinimapButtons.lua`, `ChatBubbles.lua`, `ChatHistory.lua`, `MeterDetail.lua`, `Fight*.lua`, every `Core/Options<page>.lua`, `Core/AuraEngine.lua`, `Core/Layout.lua`, `Core/Grid.lua`, `Core/Controls.lua`, `Core/Perf.lua`, `Core/Ticker.lua`. Some of those are clean; some were only ever skimmed. The adversarial review of 10-18 already noted `Core/Options*.lua`, `Layout`, `Grid` and the movers as never read in full.
- **Retail is a second client now.** Every per-client assumption (geometry, frame names, enums, class count, secret values in Mythic+ and raids) is a fresh bug class, and the client gate itself (modules absent on one client) can break callers that assume a module exists.
- **Two things were never a lens:** the spec against the code (`docs/features/`, `COMMANDS.md`, `API.md`), and the harness against the game (where our headless client is more forgiving than the real one, bugs pass every test).

So the twenty split four ways: five on the Forever code that is new or never fixed, six on the retail build, five cross-cutting on both clients (the gate, a fresh safety census, options and saved data, spec drift, harness fidelity), and four second passes (two look passes, one wrong-action census, one regression hunt over everything the first sixteen changed).

## 2. When it starts

The retail plan's gates: G1 rails merged and the Forever snapshot re-recorded on `main`; G2 retail beta (parity); G3 retail systems; G4 retail release. The hunts start after G4, as Cliff asked ("after all that work is done"). Two early starts are allowed if a hunt thread is free: H1 (keys and click casting) and H2 (Calm HUD and the art) touch no file a retail build thread owns, so they can run after G1. Nothing else starts before G4, because a hunt fix in a file a build thread owns costs more in conflicts than it saves.

Before block 1 starts, the block owner checks the launch-day smoke results that have come back (SMOKE 33.147 to 33.172 and later): a step Cliff failed becomes an input to the hunt that owns that area, and a step he passed closes the matching "plausible" items.

## 3. The shape of one hunt

The shape hunts 4 to 9 used, with the fix review added.

1. **Hunt thread.** One thread per hunt, Sonnet 5.5 at medium effort: it writes the wave briefs from this page, runs the agents, triages, writes the fix brief, cherry-picks fixes onto the block branch and writes the report. (The thread does not hunt itself.)
2. **Base.** A read-only clone of the **block branch tip** (not `main`), so each hunt sees the fixes the block's earlier hunts already landed. The hunt names the commit in every finding.
3. **Ten hunter waves, Sonnet 5.5.** One agent per wave, three at a time on a four-core box (five if no wave runs harness probes). Each wave gets this page's one-line lens expanded to a brief: files, the Blizzard source paths for both clients, the method, the don't-re-report list, the evidence standard and the `hunt.json` schema (section 7). A wave that finds nothing says what it read and ruled out; that is a good result.
4. **Ten review waves, Opus 5.5.** One reviewer per hunter wave, started as soon as that wave's `hunt.json` lands (section 4).
5. **Triage.** The thread merges hunter and reviewer output into the ledger (section 5), orders by severity, and writes the fix brief: one entry per kept finding with the agreed fix, the SMOKE step it needs, and whether it is a layout choice.
6. **Fixers, Sonnet 5.5.** Two to four, each in its own plain clone (never a linked worktree), one commit per finding, subject `H<n>-<id> <area>: <change>`, body: what changed, what was verified, the SMOKE step added. A fix that changes behaviour updates the sentence on its feature page in the same commit. A fix on a secure or protected path, or in the harness rules, goes to an Opus 5.5 fixer (CLAUDE.md, "Model by task").
7. **Fix review, Opus 5.5.** One reviewer over the hunt's fix commits as a whole (section 4, second gate). Corrections are more commits.
8. **Land.** The thread cherry-picks onto the block branch, runs `node scripts/agent-check.mjs` on every touched file and `npm run test:quick`, fetches and rebases, pushes with `git push -u origin <block branch>`. No coverage run per hunt: coverage runs once per block.
9. **Report.** `review/hunts-2026-11/H<n>.md` in the project files: counts, kept and rejected ids with one line each, held items, SMOKE ids, what each empty wave ruled out. The thread ticks its hunt in section 6 of this page in a commit on the block branch.

Container setup, every hunt (the box starts bare): `apt-get update && apt-get install -y lua5.1 liblua5.1-0-dev luarocks && luarocks install luacheck 1.2.0`, `pip install typos`, `npm install`, and a sparse read-only checkout of Blizzard's UI source on both branches (`Gethe/wow-ui-source`, `live` and `forever`, `Interface/AddOns` only) at `/home/user/wus/{live,forever}`. Agents save fetched files only in their scratch folder, never in a repo root (a stray `.lua` in the root fails the pkgmeta and quality tests). Repo-local git identity in every clone: `clifftaylor2325 <cliff.taylor2325@yahoo.com>`.

Severity: **P1** a Lua error on login or in combat, a protected call in combat, taint of a protected path, a secret value compared or used in arithmetic, a wrong irreversible action (money, items, mail, bids, rolls, accepts, bindings), or something on screen all the time broken or unreadable. **P2** the same in a less common state (vehicle, pet battle, Edit Mode, group or raid, a hover, one locale). **P3** a cosmetic edge. Fix order within a hunt is P1, P2, P3. A hunt that keeps more than 30 fixable findings fixes the P1s and P2s, then the P3s in reviewer-confidence order, and leaves the rest in the ledger as `deferred` for H20.

Each wave ends with a one-paragraph summary in its `hunt.json`; the hunt thread's report has the counts. Nobody claims in-game behaviour: a finding the harness cannot show is `inGameOnly` and ships with a runtime guard and a SMOKE step.

## 4. The adversarial review gate (Opus 5.5)

Nothing a hunter reports is fixed on the hunter's word. Two gates:

**Gate one, per hunter wave.** The reviewer gets the wave's brief, its `hunt.json`, the hunted commit, the Blizzard source on both clients and the ledger. For each finding it must:

1. **Try to disprove it** against the code at the hunted commit: the guard the hunter missed, the hook that already covers it, the comment that explains it, the test that already pins it. Blizzard facts are checked in the checked-out source, never from memory (hunts 2, 5 and 6 each had a reviewer or the code-review skill state a wrong "fact" from classic-era memory; the key ring is bag `-1` on Forever, `C_Trainer.GetTrainerType` exists, the sell-price label is `SELL_PRICE`).
2. **Check the ledger and the earlier reports** for the same behaviour under other words; a duplicate is rejected with the earlier id.
3. **Rate it:** `confirmed` (the reviewer reproduced the chain or a harness probe shows it), `plausible` (the chain holds on paper, only the game can show it), or `rejected` (with the disproof). A `plausible` P1 or P2 is still fixed, with a runtime guard and a SMOKE step; a `plausible` P3 is not fixed and stays in the ledger for Cliff's smoke results.
4. **Check the proposed fix:** CLAUDE.md compliant (ten-line functions with a comment above, player text through `L[...]`, colours and font sizes only in `Core/Theme.lua` with no new top-level local there, Lua 5.1, new globals in `.luacheckrc`); safe (`ns.OutOfCombat` or `ns.AfterCombat` around protected work, `ns.IsSecret` and `ns.PlainNumber` on anything that may be secret, `ns.FrameState` and `HookScript` on game frames, never a field or `SetScript` on them); client-correct (a retail fix in a `Retail*` file or a per-client table, no `if retail` in a secure handler, Forever behaviour unchanged). The reviewer rewrites a fix that fails any of these.
5. **Add its own findings** found while disproving, as `<wave id>-R<k>`, held to the same evidence standard.
6. **Mark layout choices.** A fix a player would notice as a choice (moving a title, a new colour meaning, a default that changes) is `decide: true` with options and the reviewer's pick.

Output: `review.json` (section 7) and a one-paragraph verdict. The hunt thread may not promote a `rejected` finding; it may demote a `confirmed` one with a reason recorded in the ledger.

**Gate two, per hunt, over the fix commits.** One reviewer reads the hunt's fix commits as a diff against the block branch: does each commit fix what its finding says, nothing more; does it keep the rules above; does it add a test that executes every new line (the floor is 100%); does the SMOKE step have exactly one Do, one Expect and one paste line; does a Forever test's expected result change (that is a red flag unless the finding is a Forever bug and the commit body says so); does the Forever snapshot change (a retail hunt may never change it). Corrections go back to the fixer as more commits. In hunt 4 reviewers corrected four fixes, and the code-review skill found three to six real follow-ups per hunt: this gate is where those were caught.

**Gate three, per block.** The block owner runs the `code-review` skill once over the whole block diff before the PR is marked ready (the `ready-pr` skill says how), verifies each of its claims against the Forever source before acting, and fixes what survives.

## 5. Dedup, merging and the block PRs

**Why four PRs.** Cliff's rule (2026-11-04): conserve CI minutes by opening as few PRs as the work allows. CI runs the quick check when a PR is marked ready and on every later push; drafts skip it. So each block is one draft PR, fed by its hunts, brought up to `main` once, gated locally once, marked ready once, merged on the local gate under Cliff's standing merge authority. Twenty hunts cost four quick-check runs. A block owner may split a block PR only for a reason it writes in the PR body (for instance a harness-rule change that needs the `full-tests` label on its own).

**Branches.** `work/hunts-block-1` to `work/hunts-block-4`, each from `origin/main` when its block starts. Hunt threads push to the block branch, never to `main`, never from a linked worktree. One block at a time; block n+1 branches after block n merges, so every hunt sees every earlier fix.

**The block owner** is one thread per block (Opus 5.5, medium): opens the draft PR with the attribution block the project requires and no co-author or session lines, keeps the ledger, allocates SMOKE id ranges, resolves conflicts between hunts, runs gate three, brings `main` in once right before the PR is ready, runs `npm run quality` and `CI=1 VITEST_MAX_WORKERS=3 npm run coverage` once on the final tree with nobody editing (a Lua edit during the run shifts coverage lines and fails the floor), marks the PR ready, merges, and posts one summary. It also sends Cliff one decision card per block for the held layout choices (never one per hunt), and builds the recommended pick meanwhile unless the choice is one a player cannot undo.

**The ledger.** `review/hunts-2026-11/ledger.json` in the project files, one entry per finding across all twenty hunts: `id`, `hunt`, `title`, `file`, `clients`, `severity`, `status` (`kept`, `rejected`, `held`, `deferred`, `fixed`, `superseded`), `reviewer`, `fixCommit`, `smoke`, `note`. The dedup key is the behaviour and the file, not the wording. Rules:

- Hunters grep the ledger and every earlier report before reporting; reviewers reject a duplicate with the earlier id. Held items stay held: the standing list is P6-1, P6-8, P5-2 and the Classic group threat at 1365 (UI hunts), X6-1, X8-1, Y9-1, Z7-R1, S3-3, S7-7, S1-4, E3-7 (stability hunts), the thirteenth hunt's K1-6, K1-7, K2-7, K2-10, K3-3, K3-4, K3-8, K4-5, K6-5, K6-8, K6-9, and the fourteenth's M1-1, M1-2, M1-7, M1-8, M3-2, M4-2, M4-5, M5-6, M6-3. A hunt may re-raise a held item only with new evidence (for instance a retail build change that settles K3-3 or K3-8).
- Two hunts in one block finding the same bug: the first id in the ledger wins, the second is `superseded`, and only one fix is written.
- Anything a deliberate comment in the code explains is out, unless the reason has become wrong (say why).

**Fix commits.** One finding, one commit, on the block branch via cherry-pick from the fixer's clone. Rebase before push. A fix touches the smallest surface that fixes the root cause: no drive-by cleanups (the second pass hunts will read every commit). Behaviour change updates its `docs/features/` sentence; a `/vg` command change updates `docs/COMMANDS.md`; a fade or sound updates `docs/THEME.md`.

**SMOKE steps.** The checklist continues in section 33 of `docs/SMOKE-TEST.md`. The block owner reserves 60 ids per block (block 1: 33.173 to 33.232; block 2: 33.233 to 33.292; block 3: 33.293 to 33.352; block 4: 33.353 to 33.412) and gives each hunt a sub-range of six, so parallel hunts never collide. Before the PR is marked ready the owner compacts unused ids so the numbering has no gaps, and `core.test.mjs` (one Do, one Expect, one paste line per step; every `/vg` word real) passes. A step says which client it is for.

**Within a block, hunts run two or three at a time** (each hunt thread has its own container, so the limit is usage and merge traffic, not CPU). A hunt pushes small commits often and rebases before each push; two hunts on one line is the block owner's call at cherry-pick time. Block 3's five hunts are lens hunts over the same files, so there the rule is: the hunt whose lens found it owns the fix, and a hunter that trips over a finding outside its lens files it to the ledger for that hunt rather than fixing it.

**Theme locals.** `Core/Theme.lua` has two top-level locals left before Lua's limit, and the scanner fails any `Core/` or `Modules/` file above 185. Fixes add tokens to existing `T` tables and never a new top-level local. The block owner checks the scanner's count in the quality run.

**Snapshot.** The Forever snapshot test is the arbiter: a block PR that re-records it says in its body which finding moved which frame and why. A retail-track hunt (block 2, H18) may not change it at all.

## 6. The twenty hunts

Each hunt lists its client, its files (a file belongs to one hunt per block), its ten waves and its SMOKE range. "Forever" means the harness's Forever client (`FOREVER_CLIENT`) and the `forever` branch of Blizzard's source; "retail" means `RETAIL_CLIENT` (interface 120105) and the `live` branch; "both" means every wave runs its reading on both. Names of retail files that the build has not written yet (`Retail*.lua`, `scripts/lib/wow-retail-<area>.lua`) are the briefs' names; a hunt reads `main` for the real ones.

### Block 1: Forever, the code no hunt reached (`work/hunts-block-1`)

- [x] **H1 Keys and click casting** (Forever; SMOKE 33.173 to 33.178). Files: `Modules/KeybindsApply.lua`, `KeybindsData.lua`, `KeybindsLayouts.lua`, `KeybindsLearn.lua`, `KeybindsWizard.lua`, `KeysView.lua`, `KeysViewCard.lua`, `ActionBarKeybinds.lua`, `ClickCast.lua`, `ClickCastGame.lua`, `ClickCastOptions.lua`, `ClickCastPresetRows.lua`, `ClickCastPresets.lua`, `ClickCastSpells.lua`, `CooldownKeys.lua`, `Coexist.lua`, `scripts/lib/wow-keybinds.lua`.
  1. The apply engine against the game's binding API: `SetBinding*`, `SaveBindings`, per-character sets, what happens in combat and at the fight's end, a `/reload` mid-apply.
  2. Learning: a new spell on an empty button, a spell that takes a key (chat line), a rank replacing a rank, a talent-granted spell, the game's own auto-placement setting, the "never ask again" flag.
  3. The wizard: every step's controls, text fit at every language a third longer, Escape and Tab, a second character, the reload offer.
  4. Preset and layout data: every class's table, spell ids resolved by name in a probe, keys that collide, modifiers on non-US keyboards.
  5. Click-cast secure snippets: hover-key binding on wrapped tiles versus `owner` (the hunt-11 launch-day watch), state drivers, `SetAttribute` only out of combat, snippets on Blizzard frames.
  6. Click casting per talent group: switching, saved sets, migrations from 0.7.x saves, a profile switch mid-fight.
  7. `ClickCastGame` and `Coexist`: game-click warnings, other bar addons loaded (the names the code knows), the wizard naming them.
  8. `KeysView` and its card: the four look-bug shapes (section 1 of hunt 14's brief) against Vanguard's own theme roles.
  9. The Your keys options page and tab: every row to its db key to its consumer, Reset this page, module switch at runtime.
  10. Error census over the seventeen files: nil returns from the binding and spell API, secret values (`C_Spell` in combat), `table.sort` comparators, string patterns fed player text.
- [x] **H2 Calm HUD, scenes and the art** (Forever; SMOKE 33.179 to 33.184). Files: `Core/Visibility.lua`, `Banner.lua`, `Chrome.lua`, `PanelTexture.lua`, `FactionArt.lua`, `Graphics.lua`, `Widgets.lua`, `UnlockBar.lua`, `Movers.lua`, `MoverLinks.lua`, `MoverPopover.lua`, `Layout.lua`, `Grid.lua`, `Setup.lua` (the banner and screen steps), `WhatsNew.lua`, `Modules/AfkScreen.lua`, `Quiet.lua`, `Situations.lua`, `SituationsBanner.lua`, `PlayerAuras.lua`, `CooldownGlow.lua`, `CooldownGaps.lua`, `SpecialBars.lua`, `BossDocks.lua`, `MenuStrip.lua`, `DataBars.lua`, `ActionBars.lua`, `ActionBarLayout.lua`, `GameAlerts.lua`.
  1. Forbidden handler census: every `HookScript` and `SetScript` on a frame the game made, against the handlers the client forbids (#719's class), on both the Calm HUD and the hover paths.
  2. Calm states crossed with player states: vehicle, pet battle, taxi, ghost, cinematic, AFK, loading screen, Edit Mode, combat start and end; what comes back to full strength and what stays dim.
  3. Fades and sounds: nothing longer than 0.15 s in combat, Reduce motion and Interface sounds respected, every fade and sound listed in `docs/THEME.md`.
  4. The AFK scenes: screen sizes and aspect ratios, the fit and squeeze modes, chat and alerts while a scene shows, leaving AFK during a fight.
  5. Ornaments, panel texture and the painted crest at 1080p and 1440p pixel-perfect, the three looks (default, Classic, Vellum) and every UI scale: seams, blur, corner brackets over text.
  6. Banner and What's new: the welcome banner's sky, `/vg setup` and `/vg whatsnew`, text fit of the notes in every language, the reload offer.
  7. The HUD lift (#735) and the Cooldown Manager fit (#734): every screen height, the 768-tall layout, a row that holds 10 or more icons, Edit Mode open while a row resizes.
  8. Movers, links and the popover: unlock in combat, a link to a hidden frame, a saved position off-screen, the grid at odd scales.
  9. Situations and the banner: dungeon, raid, battleground, resting and travel transitions, the banner over other HUD pieces, Quiet's rules.
  10. Game alerts, special bars, boss docks and data bars re-shown by the game (hunt 14's shapes) in the states wave 2 lists.
- [x] **H3 Unit, party and raid frames, and auras** (Forever; SMOKE 33.185 to 33.190). Files: `Modules/UnitFrames.lua`, `UnitExtras.lua`, `PartyExtras.lua`, `FrameAuras.lua`, `RaidFrames.lua`, `RaidAuras.lua`, `RaidStatus.lua`, `RaidHealing.lua`, `RaidPreview.lua`, `RaidTools.lua`, `MainTanks.lua`, `GroupThreat.lua`, `ClassBars.lua`, `ComboPoints.lua`, `PowerTicks.lua`, `SwingTimer.lua`, `CastBars.lua`, `Nameplates.lua`, `Tooltips.lua` (unit lines), `Core/AuraEngine.lua`, `AuraLegacy.lua`, `Auras.lua`, `Inspect.lua`.
  1. Unit token changes: target of target, focus, pet, vehicle swap, mind control, a unit that leaves range or phase, dead and ghost, offline, a name that changes (realm suffix).
  2. The aura engine: secret aura data in combat (`C_UnitAuras`), update ordering between full and incremental updates, the legacy path, filters per frame kind.
  3. Class bars, combo points, power ticks and the swing timer per class at levels 1, 10, 20, 40, 60: power types that appear mid-session, a druid shapeshifting, a shaman's totems.
  4. Raid frames at 5, 10, 20, 40: roster churn, sorting, groups joining mid-fight, pets column, the Healing layout, click-cast tiles.
  5. Blizzard frames Vanguard hides or moves (Compact raid frames, party frames, boss frames, the player and target frames) re-shown by the game: Edit Mode, group join, spec change, `UIParent_ManageFramePositions`.
  6. Nameplates: scale and distance (#742's class, border repaint), the dark box, target glow, debuff rows, friendly plates in cities, plates in a vehicle.
  7. Cast bars: interrupt and channel colours the game resets, latency, a cast that fails, spell queue, a cast bar for a unit that changes.
  8. Raid status, main tanks, threat and the raid tools: officer rights, `HasRestrictions`, 40-player CPU (hunt 4's lens), a leader change mid-fight.
  9. Tooltips on units: secret health, levels, PvP flags, guild text, the tooltip health bar's colour.
  10. Inspect and raid preview: inspects that never answer, a target that leaves, item levels and crests at the raid door.
- [x] **H4 Quests, map, minimap and strips** (Forever; SMOKE 33.191 to 33.196). Files: `Modules/Quest*.lua` (all thirteen), `Waypoints.lua`, `GuideData.lua`, `AutoAccept.lua`, `WindowsMap.lua`, `Minimap.lua`, `MinimapButtons.lua`, `BrokerStrip.lua`, `InfoStrip.lua`, `GroupBoard.lua`, `GroupBoardView.lua`, `DungeonCard.lua`.
  1. Quest log data late or absent: a quest that arrives after login, a log that is still loading, a quest removed while its row is open, 25 quests.
  2. Auto accept and turn in: every automatic decision and its switch, a quest with a choice reward, an escort, a daily, a quest the player cannot take.
  3. The guide and its data: client data only (no server lookups), a step for a quest the player abandoned, a level the guide skips, data per faction and race.
  4. Waypoints and the arrow: continent and instance changes, a waypoint on another map, distance math at the map's edge, super tracking from the game.
  5. The quest tracker and its view: text fit for long names in every language, progress bars the game recolours, a quest with many objectives, collapse state saved.
  6. The quest dialog and its parts: gossip options, reward comparisons, secret values in reward prices, a vendor window that is also a quest giver.
  7. The map window: pins across zones, the game's own pins, zoom, the Forever map skin's text, a map opened in combat.
  8. The minimap and its buttons: other addons' buttons gathered, the tracking menu, coordinates blank on first read (hunt 10's class), zone text in every language.
  9. The strips: broker plugins, the info strip's fields with secret or nil data, money and durability, clock skew.
  10. The group board and dungeon card (Forever only): the board under the mouse, a listing that vanishes, roles, the card's data per dungeon.
- [x] **H5 Town, gear, chat and combat records** (Forever; SMOKE 33.197 to 33.202). Files: `Modules/Merchant.lua`, `MerchantBulk.lua`, `VendorMemory.lua`, `Inventory.lua`, `Bags.lua`, `BagCategories.lua`, `BagSearch.lua`, `BagSections.lua`, `BagTools.lua`, `MailTools.lua`, `PetStable.lua`, `Legacy.lua`, `SpellRanks.lua`, `TalentPlanner.lua`, `Upgrades.lua`, `UpgradeWeights.lua`, `UpgradeWizard.lua`, `InstancePrep.lua`, `InstancePrepBuffs.lua`, `InstancePrepWizard.lua`, `Errands.lua`, `ErrandsBoats.lua`, `ErrandsStock.lua`, `CharacterExtras.lua`, `GameTools.lua`, `Chat.lua`, `ChatBubbles.lua`, `ChatExtras.lua`, `ChatFilter.lua`, `ChatHistory.lua`, `ChatWatch.lua`, `ChatWindows.lua`, `Rolls.lua`, `OfficerLoot.lua`, `OfficerRoster.lua`, `Meter.lua`, `MeterDetail.lua`, `FightHistory.lua`, `FightRecap.lua`, `CraftQueue.lua`, `AuctionRestock.lua`, `AuctionAPI.lua`, `AuctionCrafting.lua`, `AuctionDeals.lua`, `AuctionUpgrades.lua`.
  1. Merchant, bulk buy and vendor memory: the vendor closing mid-action, junk sell retries, a bulk buy across bag families, prices that are secret or nil.
  2. The bags family: sections and categories with the key ring (bag `-1` on Forever), search across bank and bags, a bag swapped mid-sort, empty and full.
  3. Mail and the pet stable: COD, a mailbox that closes, the clock skew records (hunt 6's K7-2), stable slots and happiness.
  4. Legacy, spell ranks and the talent planner: a rank learned mid-fight, a planner over a respec, a talent the client no longer has.
  5. Upgrades, weights and the wizard: a weight set per spec, items with secret stats, the wizard's steps, a comparison against an empty slot.
  6. Instance prep and errands: the prep card at the door, buffs per class, boats and stock lists, a timer across a loading screen.
  7. Chat core, windows and history: tab groups, a window the player renamed, history across `/reload`, a whisper during a cinematic.
  8. Chat filter, watch, extras and bubbles: patterns fed player text in every locale, a watch phrase with brackets, a bubble for a hidden unit.
  9. Rolls, officer loot and roster: a roll round repeated, a loot history item that never arrives, officer rights lost mid-session.
  10. Meter, detail, fight history and recap, craft queue and the auction files new since hunt 5: a fight that never ends, a pet's damage, a queue item whose recipe is gone, deals and upgrades with secret prices.

### Block 2: the retail build (`work/hunts-block-2`)

Every wave reads Blizzard's `live` branch for the frame and API facts and the retail docs in `Blizzard_APIDocumentationGenerated`. A finding says whether it affects retail only or both. A fix goes in the `Retail*` file or the per-client table; the Forever half of a table and every Forever test stay byte-for-byte.

- [ ] **H6 Class resources and casting on retail** (retail; SMOKE 33.233 to 33.238). Files: `Modules/ClassBars.lua`, `ComboPoints.lua`, `CastBars.lua`, `UnitFrames.lua` (hiding the game's class bars), `Core/Theme.lua` (tokens), `scripts/lib/wow-retail-classes.lua`.
  1. The class and spec to bar-kind table against the game's own power bars in `Blizzard_UnitFrame` on `live`: every class, every spec, Devourer as Demon Hunter spec 3.
  2. Runes: order, cooldown reads, `RUNE_POWER_UPDATE`, a rune mid-recharge at login.
  3. Holy power, chi, arcane charges, soul shards (fractional for Destruction), insanity, maelstrom, essence with its recharge timer, stagger: maximums that change with talents.
  4. Secret values in combat: `UnitPower` and friends under secrecy, `ns.PlainNumber`, no comparison on a raw value, a bar that must not read its own text.
  5. Spec change, talent change, level up and Edit Mode: bars that appear or vanish, the game's bar re-shown with the player frame.
  6. Charged combo points and seven points: drawing, Forever path unchanged, a rogue in a vehicle.
  7. Empowered casts: stages, `GetUnitEmpowerStageDuration`, a cancelled empower, a stage mark on a bar that changed width.
  8. Class colours for 13 classes everywhere a colour is keyed by class (raid frames, nameplates, chat, tooltips, meter).
  9. Pet battle, vehicle, dragonriding and skyriding: bars hidden and restored, vigor.
  10. Harness: `wow-retail-classes.lua` against the live docs; a stub that is kinder than the game is a finding here.
- [ ] **H7 The retail game windows** (retail; SMOKE 33.239 to 33.244). Files: `Modules/RetailWindows.lua`, `Windows.lua`, `WindowsTabs.lua`, `WindowsSocial.lua`, `WindowsMap.lua`, `WindowsPvP.lua`, `WindowsMove.lua`, `WindowsTown.lua`, `WindowsSystem.lua`, `WindowsMenus.lua`, `Core/Skin.lua`, `GameAlerts.lua`, `scripts/lib/wow-retail-windows.lua`.
  1. The mainline character pane and paper doll: the four look-bug shapes (dark text, orphan anchors, re-shown art, raw bars) against `live`.
  2. `PVEFrame`: dungeon finder, premade groups, raid finder tabs; selection callbacks and ScrollBox initializers that recolour.
  3. `PVPUIFrame` and the honor and conquest bars.
  4. The Adventure Guide (load on demand): `ADDON_LOADED` ordering, skinning a frame that taints the encounter journal, the forbidden `Blizzard_EncounterTimeline` and `Blizzard_EncounterWarnings` skipped.
  5. Friends and Communities differences from Forever: tabs, the chat panel inside Communities, the quick join.
  6. Per-client frame-name tables: a key that only one client has, `GW.Part` returning nil silently, the Forever table byte-identical.
  7. `WindowsMove` with the new frames: saved positions, a frame the game re-anchors on show, Escape and window stacking.
  8. Options rows through `ns.RetailRows`: the game-windows page on retail versus Forever, a switch for a frame that is not loaded yet.
  9. Shared skins (`Windows.lua`) on retail geometry: tab buttons (#733's class), nine-slice layouts, the bag bar and micro menu sizes (#705's class).
  10. Harness: `wow-retail-windows.lua` children versus the live XML; a skin whose test passes on a frame the game builds differently.
- [ ] **H8 Retail quest content and the tracker** (retail; SMOKE 33.245 to 33.250). Files: `Modules/QuestTracker.lua`, `QuestTrackerView.lua`, `QuestLog.lua`, `QuestLogView.lua`, `QuestDialog.lua`, `QuestDialogParts.lua`, `QuestDialogView.lua`, `QuestMinimap.lua`, `QuestArrow.lua`, `Waypoints.lua`, `WindowsMap.lua`, `scripts/lib/wow-retail-quests.lua`.
  1. World quests: `C_TaskQuest`, a quest that expires while tracked, zone changes, the pin.
  2. Bonus objectives and scenarios: the generic scenario block, a stage change mid-fight, criteria with secret progress.
  3. Campaigns and monthly activities: chapters, a completed campaign, the Traveler's Log.
  4. Quest timers: the Forever branch unchanged, the retail call's name verified in the live docs, a timer across a loading screen.
  5. Classifications and reward lines: calling, important, meta, recurring; reward currencies and warband items; secret prices.
  6. Block builders: re-entrancy and pools (hunt 10's lenses) now that blocks are many, collapse state per block kind.
  7. The map and minimap pins on retail maps: continents, multi-level zone maps, flying over a pin.
  8. The quest log and dialog on retail: 35 quests, the game's own tracker hidden and re-shown by Edit Mode.
  9. Text fit: retail quest names and objectives in every language, a third longer.
  10. Harness: `wow-retail-quests.lua` against the live docs.
- [ ] **H9 Retail bank, bags and private auras** (retail; SMOKE 33.251 to 33.256). Files: `Modules/Bags.lua`, `BagCategories.lua`, `BagSearch.lua`, `BagSections.lua`, `BagTools.lua`, `Inventory.lua`, `RaidAuras.lua`, `FrameAuras.lua`, `RaidFrames.lua` (anchors), `UnitFrames.lua` (anchors), `scripts/lib/wow-retail-bank.lua`.
  1. Warband bank tabs: `Enum.BankType`, `C_Bank`, a tab the account has not bought, deposit and withdraw in combat.
  2. The reagent bag as a section and the retail bag families; retail bag button geometry.
  3. Search across bank types, a search while a tab loads, account-wide counts in `Inventory` (only if it shipped).
  4. Private aura anchors: one per raid tile and on the target frame, duplicates after a roster change, an anchor on a recycled tile.
  5. The game's bag frames hidden and re-shown (combined bags, Edit Mode bag bar).
  6. Secret item counts and prices in bank views; sorting with secret values.
  7. Bank windows opened from a distance (the warband bank is remote), closing while a sort runs.
  8. Forever path untouched: the Forever bag and bank tests and the key ring unchanged.
  9. Text fit of bank tab names and item counts.
  10. Harness: `wow-retail-bank.lua` against the live docs.
- [ ] **H10 Per-client data tables and shipping** (retail; SMOKE 33.257 to 33.262). Files: `Modules/RaidHealing.lua`, `ClickCastSpells.lua`, `InstancePrepBuffs.lua`, `RaidPreview.lua`, `Upgrades.lua`, `UpgradeWeights.lua`, `DataBars.lua`, `scripts/lib/media-sources.mjs` (crests), `scripts/lib/wow-retail-data.lua`, `Vanguard.toc`, `Core/WhatsNewNotes.lua`, `Locales/`.
  1. Every spell and item id in the retail halves resolved by name in a probe against the live docs and spell data; an id typed from memory is the expected bug.
  2. Dispels and raid-healing spells for the healing specs of 13 classes; a spec with no dispel.
  3. Raid buffs as of 12.1.5 and the prep card at the door.
  4. Thirteen crests: media entries, `node scripts/build-media.mjs --check`, the preview at every scale.
  5. Stat weights: crit, haste, mastery, versatility, primary, item level; `/vg weights` text fit.
  6. Honor and renown lines on the data bars: a faction with no renown, secret values.
  7. The TOC: interface line, every per-file tag paired (allow with exclude), `X-Flavor` and notes, `check-toc`.
  8. Listings and notes: `WhatsNewNotes` per client, the i18n import run once, placeholders per locale.
  9. Forever halves byte-identical: a probe that dumps each table on `FOREVER_CLIENT` and diffs it against 0.8.0.
  10. Harness: `wow-retail-data.lua` against the live docs.
- [ ] **H11 Housing, Mythic+, vault, delves, professions and the landing page** (retail; SMOKE 33.263 to 33.268). Files: `Modules/RetailHousing.lua` and the other `Retail*.lua` systems files the build wrote, `Situations.lua`, `DungeonCard.lua`, `InstancePrep.lua`, `MenuStrip.lua` (the House button), `Tooltips.lua` (decor), their `scripts/lib/wow-retail-*.lua`.
  1. The housing dashboard, finder, catalog and editor: load on demand, skins that fall back to the game's window, moved and reloaded.
  2. Decor tooltips and the House micro button.
  3. Mythic+: the keystone, affixes and timers under secrecy, the dungeon card's data, a run that fails, a death counter.
  4. The vault and the landing page: weekly reset, rewards with secret values, a page opened in combat.
  5. Delves: the companion, tiers, the picker and toast.
  6. Professions: the retail profession window, concentration, orders; the Forever profession skin untouched.
  7. Situations on retail: the new states (M+, delve, follower dungeon) crossed with the Calm HUD.
  8. Forbidden frames and taint: every hook into these systems against the live source's `forbidden` flags and `secureexecuterange` paths.
  9. Text fit for every new string in every language.
  10. Harness: the systems stubs against the live docs.

### Block 3: both clients, cross-cutting (`work/hunts-block-3`)

- [ ] **H12 The client gate** (both; SMOKE 33.293 to 33.298). Files: `Core/Modules.lua`, `Combat.lua` (`ns.IsForever`), `Client.lua`, `Core/Options*.lua` (`ns.RetailRows`), `Vanguard.toc`, `Modules/Probe.lua`, `scripts/lib/forever-only-api.json`, `scripts/lib/toc.mjs`, every `ns.GetModule` and `ns.ClientData` caller.
  1. Every caller of a Forever-only module on retail: `ns.GetModule` nil, options rows, slash words, settings, saved data for a module that is not there.
  2. Every `clients` field against its TOC tag; the Forever module list byte-for-byte 0.8.0's.
  3. The 12 Forever-only functions and 4 events: every call guarded, the harness's retail client has them nil and no test papers over it.
  4. `ns.ClientData` tables: the Forever half unchanged, a key present in one half only, a table read before login.
  5. `ns.IsForever` paths: the `WOW_PROJECT_CAMELOT` read, the `C_GameRules` fallback (hunt 4's Y9-1), a client whose interface is neither.
  6. Secure handlers: no `if retail` inside, no per-client branch in a snippet, a state driver with a condition one client lacks.
  7. Profile export strings crossing clients: a Forever profile imported on retail and back, settings of absent modules kept or dropped.
  8. The probe's client block against reality (Cliff's pastes from both clients).
  9. Forbidden frames on retail: every frame Vanguard touches against the forbidden list.
  10. Packaging: the zip loads on both clients (TOC walk), the packager's game-type mapping, a file only one client needs listed once.
- [ ] **H13 Safety census: secrets, taint and combat lockdown** (both; SMOKE 33.299 to 33.304). Files: everything under `Core/` and `Modules/` changed since hunt 3's census (`bfeadf4`), the retail build included; `scripts/lib/wow-taint.lua` as the oracle.
  1. Secret values: every read of a value the API docs flag as possibly secret, arithmetic and comparisons on it, concatenation into text, `ns.IsSecret` and `ns.PlainNumber` at the input.
  2. Secret aura data on both clients and in Mythic+ and raids on retail.
  3. Protected calls: every `SetPoint`, `Show`, `Hide`, `SetAttribute`, `SetParent`, `RegisterUnitWatch` and friends on a secure frame reachable in combat; `ns.OutOfCombat` around it.
  4. `PLAYER_REGEN_DISABLED` handlers defer with `ns.AfterCombat`; everything else waits with `ns.OutOfCombat`.
  5. Taint: fields stored on game frames, `SetScript` on game frames, `HookScript` on forbidden handlers, writing a global the game reads, `ignoreInLayout` and Edit Mode paths (X6-1's class).
  6. Secure templates, state drivers and snippets: `SecureHandlerWrapScript` targets, `RegisterStateDriver` in combat, snippet variables from insecure code.
  7. The harness oracle: every rule in `wow-taint.lua` against a case list; a path the oracle misses is a finding for H16, a path it flags that the code takes is a finding here.
  8. Load-on-demand and reload in combat: addons that load mid-fight, `ADDON_LOADED` hooks that call protected functions.
  9. Edit Mode on both clients: layout switch, `UpdateSystem`, `ApplySystemAnchor`, Vanguard's anchors on game frames.
  10. Diagnostics: `/vg errors`, the error badge, what a taint report would show and whether the code names the path.
- [ ] **H14 Options, profiles, setup and saved data** (both; SMOKE 33.305 to 33.310). Files: `Core/Options.lua`, `OptionsWindow.lua`, every `Options<page>.lua`, `OptionsSearch.lua`, `OptionsPreview.lua`, `Profiles.lua`, `ProfileExport.lua`, `ProfileStrings.lua`, `PresetStrings.lua`, `Serialize.lua`, `DB.lua`, `SettingsGuard.lua`, `Setup.lua`, `Home.lua`, `WhatsNew.lua`, `Slash.lua`, `Feedback.lua`, `ErrorBadge.lua`, `Perf.lua`, `Ticker.lua`, `Locale.lua`, `SharedMedia.lua`, `Masque.lua`, `Integration.lua`.
  1. Every row to its db key to its consumer: a row with no consumer, a consumer with no row, a default that differs between the two, per client.
  2. Reset this page, Reset all and module switches at runtime on every page, both clients.
  3. Migrations: saves from 0.4.0 to 0.8.x plus the keybind, click-cast, Calm HUD and retail saves; a save from the other client.
  4. Profiles: spec profiles keyed on talent groups (Forever) versus specs (retail), a staged switch (Z7-R1's class), the backup.
  5. Export and preset strings: round trip, truncation, a string from a newer version, a string with every language's characters.
  6. Setup: every step on both clients, the screen step at every resolution, the keys step, a second run.
  7. The options window: search index, text fit at every language, Tab and Escape, greyed rows, the changed-from-default mark, pages at 1280x720.
  8. Slash: every word in `docs/COMMANDS.md` real and documented, words for absent modules, `/vg` in combat.
  9. Settings guard, performance counters and the ticker: a guard that fires in combat, a timer that survives a reload, perf numbers that are secret.
  10. Integrations: shared media, Masque, the hooks in `docs/API.md`, another addon registering before Vanguard loads.
- [ ] **H15 Spec drift: the docs against the code** (both; SMOKE 33.311 to 33.316). Files: `README.md`, `docs/features/*.md` (twelve pages), `docs/COMMANDS.md`, `docs/API.md`, `docs/GETTING-STARTED.md`, `docs/SMOKE-TEST.md`, `docs/THEME.md`, `Locales/`, against `Core/` and `Modules/`. The site generates its facts from these, so a wrong sentence here is a wrong page there. A finding is either a behaviour bug (the code is wrong) or a spec bug (the page is wrong); the reviewer says which.
  1. `look-and-layout.md` and `docs/THEME.md`: every fade, sound, colour role and spacing claim.
  2. `unit-frames.md` and `raid-frames.md`.
  3. `action-bars.md` (keys, click casting, cooldowns included).
  4. `game-windows.md` and `combat-tools.md`.
  5. `chat.md` and `map-and-minimap.md`.
  6. `quests.md` and `town-and-gear.md`.
  7. `auction-house.md` and `options-and-setup.md`.
  8. `COMMANDS.md` and `API.md`: every word, argument and hook exists and does what the page says, on the client the page names.
  9. `GETTING-STARTED.md` and `SMOKE-TEST.md`: steps that no longer match the UI (a renamed page, a moved control), the "needs in-game check" items still open.
  10. `Locales/`: placeholders against `L[...]` strings, strings the import dropped, the `unwrapped-text` baseline, per-client strings.
- [ ] **H16 Harness fidelity and test strength** (both; SMOKE 33.317 to 33.322). Files: `scripts/lib/lua-harness.mjs`, `wow-stub.lua`, `wow-world.lua`, `wow-widget-api.lua`, `wow-taint.lua`, `wow-inspect.lua`, the secret helpers, `wow-retail-*.lua`, `wow-keybinds.lua`, the snapshot test, `scripts/lib/code-quality.mjs`, `scripts/tests/*.test.mjs`. Fixes here change the harness rules, so the fixer is Opus 5.5 and the block PR gets the `full-tests` label.
  1. Widget methods whose stub semantics differ from the client: `SetPoint` with missing arguments, `GetPoint` return shapes, `IsShown` versus `IsVisible`, `SetShown(nil)`, `HookScript` order, `GetText` on an unset string.
  2. Methods in `wow-widget-api.lua` that the 12.1 client lacks, and methods the code calls that the list lacks (nil in tests on purpose, but a path that only runs in game then has no test).
  3. The taint oracle's blind spots (H13 wave 7's hand-offs): `SetScript` variants, `SetAttribute` in combat, fields on game frames through a helper.
  4. The secret helpers: API returns the docs flag as secret that the harness hands back plain.
  5. Timers and events: `advance` step pitfalls (0.25 s default), `ns.Soon` flushing, event payload shapes versus the docs on both clients.
  6. Tests that assert nothing or little: `toBeTruthy` on a condition, a test that passes with the module disabled, lines covered by exactly one test.
  7. The snapshot's blind spots: states it never records (combat, group, vehicle, Edit Mode), fields it rounds away.
  8. Retail stubs versus the live docs: every function the stubs define, with its return shape and secrecy flag.
  9. Code-quality scanner gaps: a rule the docs state that the scanner does not check, and the reverse.
  10. Login-scope and coverage mapping: scoped files that need a regenerate, the coverage line shift under edits, the floor file.

### Block 4: second passes (`work/hunts-block-4`)

- [ ] **H17 Look pass, Forever** (Forever; SMOKE 33.353 to 33.358). Files: everything under `Core/` and `Modules/` changed since `4d86d2c`, plus Vanguard's own windows (the options window, keys view, cards, dialogs, auction tabs, group board, the home window). The four look-bug shapes plus text fit, at 1080p and 1440p pixel-perfect, the three looks, ten languages a third longer. `npm run preview` renders are evidence.
  1. The options window and every page.
  2. Keys view, click-cast options and the wizards.
  3. Dialogs, popups, the game menu and the reload offers.
  4. The auction tabs and shop.
  5. The group board, instance prep, errands and town cards.
  6. HUD pieces changed since hunt 14 (the lift, the Cooldown Manager rows, Calm HUD hover, ornaments).
  7. Skinned game windows changed since hunt 13.
  8. Chat windows, tabs and bubbles.
  9. Tooltips and the strips.
  10. Classic look and Vellum: every piece above in the two other looks.
- [ ] **H18 Look pass, retail** (retail; SMOKE 33.359 to 33.364). Files: the retail build and every shared HUD piece on retail geometry. Hunt 14's waves run again on retail with the new code: 30-unit bag buttons, the micro menu, Edit Mode's systems, 13 class colours, retail fonts and atlases.
  1. Action bars and buttons (override, extra, possess, vehicle bars).
  2. Micro menu, bag bar, XP and reputation bars, alerts.
  3. Blizzard unit, party, raid and boss frames; cast bars; buffs.
  4. The tracker, minimap and its buttons.
  5. Tooltips, chat chrome, Edit Mode.
  6. The retail windows (H7's) after H7's fixes.
  7. Class resource bars and the private aura anchors.
  8. Housing, Mythic+, vault, delves and professions windows after H11's fixes.
  9. Vanguard's own windows at retail's default scale and fonts.
  10. Retail at 1080p with the game's UI scale, and at 1440p pixel-perfect.
- [ ] **H19 Wrong actions and money** (both; SMOKE 33.365 to 33.370). A re-census of hunt 6's lenses over the code changed since its base (`c53043a`) and the retail build.
  1. Every irreversible money and item call: buy, sell, bid, buyout, mail, COD, destroy, delete, disenchant, repair, transmog, warband transfer.
  2. Every auto accept, decline, roll, release, resurrect, summon, group invite and leave.
  3. Bindings: every `SetBinding` and click-cast change that the player did not click for in that moment.
  4. Gold, prices and counts parsed from game text per locale; the decimal comma; retail currencies and the warband bank's gold.
  5. Identity keys: name-realm, item by name, link or id, spell by rank or id, per client.
  6. Clocks, dates and timers: server time, clock skew, daylight saving, weekly reset per region.
  7. Capacity limits full and empty: bags, bank tabs, mail, auctions, friends, ignore list, tracker.
  8. Account and realm restrictions: trial, self-found, hardcore, guildless, a dead hardcore character.
  9. Confirmations: every dialog that stands in for a game confirmation, and every game confirmation Vanguard answers.
  10. Logout, disconnect and the save moment: an action half done at logout, saved data written in combat.
- [ ] **H20 Regressions and the plausible list** (both; SMOKE 33.371 to 33.376). Files: every fix commit of blocks 1 to 3 and the launch week (#711 to #747), and the ledger's `plausible` and `deferred` entries.
  1. Every block 1 fix commit read for side effects on the sibling paths it did not change.
  2. Every block 2 fix commit, with the Forever snapshot and tests as the oracle.
  3. Every block 3 fix commit, with a probe per harness change.
  4. The launch-day fixes generalised: the Cooldown Manager fit, the hover taint, the border repaint on rescale, the tab anchors; every sibling of each.
  5. Keybind and click-cast fixes against the SMOKE results Cliff has posted since block 1.
  6. The `plausible` entries: each re-checked against Cliff's smoke pastes; closed, confirmed or sent back to its area.
  7. The `deferred` P3 list: fixed in confidence order, or closed with a reason.
  8. Scenario fuzz on both clients: the harness scenarios under random event order and timing.
  9. Memory and long sessions on both clients: the saved-data budget, pools, the options widget leak (X8-1).
  10. The hunt ledger itself: every `held` item re-listed for Cliff on one card with a recommendation.

## 7. Schemas

Hunter output, `<scratch>/<hunt>/<wave>/hunt.json`:

```json
{ "summary": "what was read, compared and ruled out",
  "findings": [ { "id": "H7-3-1", "title": "one sentence Cliff would understand", "severity": "P1|P2|P3",
    "category": "lua-error|taint|secret|combat-lockdown|wrong-action|dark-text|orphan-anchor|reshown|raw-bar|client-geometry|dead-skin|spec-drift|harness|other",
    "clients": "retail|forever|both", "file": "Modules/X.lua", "line": 123,
    "blizzard": "Blizzard_X/Mainline/X.xml:45 (live), ... (forever)", "trigger": "what the player does",
    "evidence": "the chain, or probe path and output", "inGameOnly": true,
    "fix": "proposed fix", "decide": false, "options": "" } ] }
```

Ids are `H<hunt>-<wave>-<n>`; a reviewer's own findings are `H<hunt>-<wave>-R<k>`. Reviewer output, `<scratch>/<hunt>/<wave>-review/review.json`:

```json
{ "verdict": "one paragraph",
  "reviews": [ { "id": "H7-3-1", "status": "confirmed|plausible|rejected", "duplicateOf": "", "evidence": "what was checked",
    "fixOk": true, "fixNote": "rewrite if not ok", "decide": false, "pick": "" } ],
  "findings": [ ] }
```

The ledger entry (section 5) is the union of the two plus `fixCommit`, `smoke` and the final `status`. Every file is checked with `node -e "JSON.parse(require('fs').readFileSync(process.argv[1]))" <file>` before it is handed back.

## 8. Usage and cost

Twenty hunts with reviews is the largest run this project has done. Each hunt is ten Sonnet hunters, ten Opus reviewers, two to four Sonnet fixers and one Opus fix reviewer. Earlier hunts of this shape took three to five hours of wall time each and ran about two per day. Expect a block to take two to three days with two or three hunts running at once, and the twenty to take two weeks, usage allowing.

**Order within a block is by expected yield**, so that if usage runs out mid-block the best hunts have run: block 1 is H1, H2, H3, H4, H5; block 2 is H6, H7, H11, H10, H8, H9; block 3 is H12, H13, H16, H14, H15; block 4 is H18, H17, H19, H20.

**The usage-cap rule** (Cliff, 2026-10-29: "if we get close to usage, cancel reviews"). When the app shows weekly usage at 85% or more, or Cliff says so:

1. The block owner tells every running hunt thread. Reviews already running finish; no new review wave or fix review starts.
2. Hunt threads triage hunter findings themselves (the lean shape of hunts 10 to 14), mark each ledger entry `reviewer: none`, and fix only `P1` and `P2` findings whose chain they verified in the code themselves; every unreviewed fix ships with a runtime guard and a SMOKE step.
3. Hunts drop to one at a time; no new hunt starts until the block owner says usage has room again.
4. Gate three (the `code-review` skill on the block diff) stays, because it is one run per block; the local gate (`npm run quality`, `npm run coverage`) always stays.
5. At the cap: hunts stop; finished hunts' fixes still land in the block PR, which merges on the local gate.

When usage has room again, reviews resume for new waves; findings fixed unreviewed are listed in the block PR under "Unreviewed fixes" and H20 wave 6 rechecks them.

**Models:** hunter waves Sonnet 5.5 medium; review waves and fix reviews Opus 5.5 medium; fixers Sonnet 5.5 medium, Opus 5.5 for secure paths and harness rules; hunt threads Sonnet 5.5 medium; block owners Opus 5.5 medium. Raise effort for nothing; sharpen the brief instead.

## 9. What Cliff does

- Reads one summary per block and one decision card per block (the held layout choices and `decide` picks).
- Runs the block's SMOKE steps (six per hunt at most) on the client each step names, and pastes `/vg errors` and the step ids that failed. His results feed the next block's hunts and H20.
- Types "merge" in a block owner's thread if a permission check refuses the merge under his standing authority.
- Decides whether the site gets a hunt of its own; this plan gives it none (hunt 7 covered it, and H15 catches the addon facts it generates from).
