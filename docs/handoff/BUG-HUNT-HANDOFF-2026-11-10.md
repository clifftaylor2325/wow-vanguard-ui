# Bug hunt of 2026-11-10: hand-off

Written for the next hunt, so it starts from what this one left instead of finding it again. It lists what was fixed
(by PR), what is still only suspected, what nobody could check without the game, and what the test harness still lets
through. Every open item below was checked against `main` on 2026-11-10 (after #876); grep for the identifier quoted, not the line.

Read with [../research/forever-api-facts.md](../research/forever-api-facts.md): ten questions settled from the game's
UI source during the hunt, and an eleventh the game answered the same evening, each ending with what only the game can answer.

## 1. What ran

Two errors from the game had passed every test: a shown state read back into `SetShown` (#838) and pixel edges sized
while the client held a frame shrunk (#821). Fifteen area hunts read every file of their area in full for those two
classes and their relatives, proved each bug with a failing-first test or a trace, and fixed each in its own commit.

| PR | What |
| --- | --- |
| #852 | Name, values, marks and portrait cut on frames with heal prediction (the Hairline report) |
| #860 | The fifteen area hunts, three look reports and two follow-up passes: about 80 fixes |
| #858 | The harness now fails a test on the secret read-back class; three addon bugs it exposed |
| #861 | The raid bench measures every 50 instructions (it was noise at 1,000); roster cap 1,750 |
| #870 | Ten open items in feature modules (ammo count, edited macros, Cancel names the item, Train all summary) |
| #873 | Parked frames take no clicks, social side windows, raid marks at scale, HUD layouts keep scale, theme reads |
| #875 | An aura row the game holds back in a fight no longer raises (the hunt's own fix was wrong: section 2) |
| #876 | Module lifecycle leftovers: floating chat windows and the Versus deck follow their modules off, a restart retries paused handlers |
| #874 | The hand-started full suite splits by measured time over 12 shards: about 6 minutes |

0.9.5 (tag `v0.9.5`) holds #852, #860 and #861. Everything after is on `main` for 0.9.6.

**The hunt got one wrong, and the game said so within hours.** #860 fixed "forbidden object" errors from nameplate aura rows by walking up the parents with `GetParent` once a region's `IsForbidden` said no. In 0.9.5 that walk raised in an open-world fight: `nameplate: Core/Auras.lua:275: calling 'GetParent' on bad self`. The client also holds aura containers and buttons back while aura information is secret, with `IsForbidden` still false and every other call refused. The hunt's test had let `GetParent` through on such a frame, so it proved the theory instead of the client. #875 asks `CanBeAccessedInContext` (research page, section 11). The lesson for the next hunt: a test that models a client rule nobody has read in the source or seen in the game is a guess with a green tick.

## 2. What the harness catches now, and what it still lets through

Since #858 (`scripts/lib/wow-aspects.lua`, `scripts/lib/lua-secret-ops.mjs`):

- A widget fed a secret through a setter keeps that aspect, and its getter then returns a secret.
- Addon code handing a secret to a setter that refuses one (`SetShown`, `SetPoint`, `SetWidth` and the like) fails the test.
- A truth test, `not`, `==` or `~=` on a secret in addon code raises.
- Since #875, `world.holdAccess(frame)` holds a frame and everything under it back from addon code the way the client holds aura rows (`IsForbidden` false, `CanBeAccessedInContext` false, every other call raises); `world.releaseAccess` lets go.

Still not modelled, so a bug of this kind passes every test:

- A secret as a table key, under `tostring`, or in a C library truth test (`assert(secret)`).
- A test's plain `{ __secret = true }` stand-in under `==` or a truth test (it has no metatable).
- `SetToDefaults`, the only call the docs list that clears an aspect.
- "Has secret values" on a frame: the client makes every getter without an aspect return secrets; the harness only makes anchoring secret.
- Getters that take an argument (`GetPoint(i)`, `GetAttribute`) are not checked for a secret argument.
- `GetTexCoord` and `GetCooldownTimes` have no implementation in the stub.
- The checks fire only on paths a test drives with a secret. A getter no test feeds a secret is still unproven.
- Whether the client holds the addon's own textures on a held button, and how long it holds a row, is the model's guess.
- The test VM implements Lua 5.3; the game runs 5.1. Draft PR #869 carries a real Lua 5.1 engine behind `VG_LUA_ENGINE=wasm` and its verdict.

Treated as raising, unconfirmed: `secret ~= nil`. Concatenating a secret still raises in the harness though the game allows it.

## 3. Suspected, not fixed

No trigger was found for any of these. Harden one only when a report or a test shows it.

**Theme and frames**
- Where #838's secret edge came from is not settled. The client docs say only untainted code calling `SetShown` with a secret makes a shown state secret, and the addon cannot do that. In game: `HasSecretAspect(Enum.SecretAspect.Shown)` on the edges of painted HUD frames and plates.

- A look or accent change made in a fight reports a held aura icon's repaint in `/vg errors` (`repaint`, `re-tint`, `re-font text`, `texel snap`): the theme's walks ask `T.Closed` (IsForbidden only). Reproducible with `world.holdAccess` on a plate's aura rows and `ns.Theme.Refresh()`; each entry is guarded, so the walk goes on. A fix skips a held region and refreshes once after the fight.
- Every other place that touches the client's aura containers in a fight (`Container:SetUnit`, `Refresh`, `E.Init` when the client makes a button) was not read against the access restriction.

**Unit frames**
- `CB.Finish` (`Modules/CastBars.lua`) sets the value on a bar the client's timer (`SetTimerDuration`) may still drive. The finish flash may keep moving or empty out. The docs list no call to clear a timer.
- The low-health vignette (`GA.UpdateVignette`) and the low-health ring are always shown while switched on and hide only through a curve's alpha. That rests on the documented Alpha aspect, not on anything seen.

**Nameplates and raid frames**
- Raid per-tile loops (`RF.UpdateAll`, `RF.EachTile`, the RaidStatus walk and `checkRange`) are guarded as a whole, not per tile. A per-tile guard on the 0.2 s range tick costs OnUpdate work under the bench cap.
- `b:IsShown()` on raid tiles is truth-tested in every raid loop. It raises only if a secure tile's shown state can be secret.
- `paintTarget` stores `f.vgScale` as given; a secret effective scale would be compared later in `ScaleHolds`.
- `upgradeRows` and `NP.CheckScales` (`Modules/Nameplates.lua`) walk plates with no per-plate guard, and `upgradeRows` also walks plates put away on client plates that may be closed.

**Action bars**
- `isOnGCD` at the start of a global cooldown: the repaint is a frame after `ACTIONBAR_UPDATE_COOLDOWN`. If it reads false then, that global cooldown still flashes.
- Per-button loops (`each` in ActionBars, `CooldownGlow.Tick`, `CooldownKeys.Paint`) run unguarded per item.

**Options and setup**
- `stopCapture` loops in `Core/Widgets.lua` are unguarded; a failing frame would leave later ones holding the keyboard in a fight.
- `profileInUse` (`Core/Profiles.lua`) knows other characters' profiles only from the notes written at logout, so a profile another character picked since can be taken as a backup name.
- The `perClass` migration would overwrite an existing per-class entry if a profile somehow held both forms.

**Quests and auction**
- `QL.Details` selects the row's quest in the game's log on refresh (now only when it differs). The game's code treats `SetSelectedQuest` as sending no `QUEST_LOG_UPDATE` back at once; whether one follows on the next frame is not knowable from source.
- Whether `CanCancelAuction` turns false straight after a cancel (the addon's mark covers five seconds regardless).
- Whether a bid-only result ever carries `buyoutAmount` 0 instead of nil (both are treated as no buyout).

**Module lifecycle** (review: findings in the bodies of #837, #865 and #876; L3, L5 and L7 are fixed in #876)
- M6, second half: the game's status bar containers are shown on release whatever the game wants (level cap, no watched faction). `docs/SMOKE-TEST.md` 35.12 is the look in the game it needs first.
- Not tested: main tank and party-pet tiles through a live switch (the harness cannot make secure-header tiles), and each restart setting by what it paints.
- L9: a module started while frames are unlocked gets its handle only at the next unlock, and `ns.Mover` for a key never released orphans the old handle.
- No module declares `rebinds` yet (A4-4), so a profile switch waits for a reload unless every reload-only module is off and the theme's reload settings match.
- `T.FontObjects` has no release; `ns.OnProfileChanged` listeners cannot be removed.

## 4. Needs the game

Nothing fixed on 2026-11-10 has been seen in the game. 0.9.5 shipped without an in-game pass (`docs/smoke-results.json` records the skipped steps; `docs/SMOKE-TEST.md` 33.481 to 33.484 are the release's own).

**Looks**
- Hairline and Tabs: name, values, portrait and status marks show on player, target and party; a big heal on a nearly full bar stops at the bar's edge.
- Shield wall, bars 1 to 3 on: one backing behind the three rows with no seam. Drag bar 2 away: three plates, none overlapping. Should a backing shrink to the buttons over a bar's empty slots?
- Enter combat: the cue round your frame follows the frame's shape. It is a one-pixel outline now: strong enough?
- At full health no red ring and no vignette. Below 30% the ring breathes.
- `/vg errors` stays empty through a look change, an accent change, a pixel-size change and a dungeon.

**Unit frames, plates and raid**
- A hunter's pet frame after a look change: the health number stays left of the mood glyph.
- In a fight with the pet, boss or cast bar frames parked, press Alt-Z twice: no game frame appears.
- After looting a quest item in a fight: no game tracker text over the quest tracker, and clicks on the tracker land.
- Hover a unit frame in an instance: no error.
- Ready check, resurrection and summon marks on raid tiles in an instance fight; the group threat panel with a hostile target.
- Nameplate aura icons after a long session in instances: no dark blocks, no "forbidden object" error, the scale ticker not paused.
- Fight in the open world with your debuffs on a mob (SMOKE 33.390a): no `nameplate: ... GetParent` line, and icon edges stay one pixel after the fight.
- A 25- and a 40-player raid: mark shadows and aura icon edges stay one pixel.
- Retail warlock at level 10: the soul shard row appears at the ding.

**Action bars**
- No flash on the buttons after a global cooldown; one flash when a real cooldown ends.
- Auto Shot shows its ammo count. A macro edited to cast another spell repaints its sweep and tint at once.
- Macro names in a fight and after a reload; Cooldown Manager rings light and go out.
- Red when out of range, switched on without a reload, tints at once.
- Which bar a druid's Prowl and Moonkin, a rogue's Stealth and a warrior's stances page to on Forever.

**Windows, options and setup**
- Open an options dropdown in combat, then click an action bar button: it casts.
- The social window with its ignore list open and another window docked beside it: no overlap, tabs readable.
- Pick The keep, then Standards, on a frame you scaled and faded: it moves and keeps its scale and opacity.
- Retail: the conquest tooltip's panel fits its text; recipe tooltips show each added line once; a recipe with more than 8 reagents draws inside the screen.
- `C_EditMode.SetActiveLayout` from addon code after combat: does the client let an addon switch the layout?
- Every converted module switching off and on without a reload, secure frames included (main tanks, party pets, raid tools), with no taint. Chat windows switched off with floating windows movable; the Versus deck's edge on combo points or class bars.

**Combat tools, chat, town and auction**
- Chain-pull within half a second of a fight ending with the chat recap on. A boss pull: the info strip's DPS and rank stay blank until the restriction ends.
- `/vg meter report party` in a keystone between pulls: one line saying why, nothing sent.
- Faster auto-loot in a master-loot group; whether Forever's servers offer master loot at all.
- Train all: the summary a second later matches what the trainer taught, a refusal included.
- Unlearn a bound spell rank: the click-cast cell turns warning-coloured with the tip.
- The auction Cancel question names the item and a long name fits. Confirm after moving the item. Which vanilla items the server classes as commodities.
- Sell junk with a grey item in an equipment set.

**Rules of the client the harness guesses at**
- Whether `secret ~= nil` raises.
- Whether a plain `SetShown(true)` after a secret keeps the Shown aspect.
- Whether a font string with secret text has secret anchoring.
- Whether plates ever report a hidden `GetEffectiveScale`; whether `GetActionInfo` is secret in combat or a dungeon.

## 5. Choices made for Cliff (each is one commit to undo)

- `/vg profile <name>` matches in any case and asks before making a new profile; `copy` and `delete` ask first.
- A backup never overwrites a profile that is not a recorded backup of that source.
- The roster event's bench cap is 1,750 (it was 1,400, set from a noisy measure; the true count was 1,440 then).
- The social side windows stay inside the room the game reserves, by shrinking our shift.
- A HUD layout moves its frames and keeps each one's scale, opacity and size.
- Reverted: "a displaced question answers No" (`scripts/tests/plates.test.mjs` documents that a replaced question is asked again later).

## 6. Tests and CI

- CI runs no tests by itself (Cliff, 2026-11-10): no pull request, schedule or release starts them. The full suite is hand-started (*full suite*, *Run workflow*) and splits the Lua project over 12 shards planned from measured file times (`scripts/shard-times.json`), with coverage merged and the 100% floor judged once: about 6 minutes.
- A new test file that logs in must be scoped (`node scripts/login-scope-probe.mjs`) or listed in `FULL_FILES` with its reason; a quick test fails otherwise.
- The last full run is linked from the newest merged PR; before any hunt starts, start one on `main` and read it.
- Locally, run test files one at a time. Several Vitest runs at once exhaust an 8 GB machine.
- Read `npm run quality`'s whole output: failures print above the report-only section.
