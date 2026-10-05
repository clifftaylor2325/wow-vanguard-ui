# Vanguard plan: rebrand ForeverUI, then add seven features (handoff)

Repos: `clifftaylor2325/wow-vanguard-ui` (the addon) and `clifftaylor2325/wow-vanguard-ui-site` (the player website); renamed from `wow-forever-ui` and `wow-forever-ui-site` after the plan was carried out (GitHub redirects the old names).
Written on 2026-10-05 against addon commit `ea4fa52` (v0.3.0, after PR #109). If a `file:line` below has moved, grep for the identifier quoted next to it.
This file is written so that a model with less context can carry it out. Section 0 of `docs/handoff/WORKPLAN.md` ("How to work") applies here too, word for word, except where section 0 below overrides it.

---

## 0. Why, and how this plan runs

**Why rename.** Another addon called ForeverUI (by Solindius) has been live on CurseForge (`curseforge.com/wow/addons/foreverui`, about 11K downloads) and Wago (`addons.wago.io/addons/foreverui`) since September and updates almost daily. Ours is not published yet. Two addons with the same folder name overwrite each other on install, and players would confuse the two. "Vanguard" is free on both: `curseforge.com/wow/addons/vanguard` and `addons.wago.io/addons/vanguard` returned 404 on 2026-10-05 (checked against the ForeverUI pages, which loaded). Renaming now costs a find-and-replace; after the Nov 4, 2026 launch it would cost players their settings.

**Why these features.** They are the gaps left after comparing ForeverUI against the 20 most-downloaded WoW addons on CurseForge (all-time downloads, September–October 2026), with everything ForeverUI already ships struck out. Ranked by impact:

| # | Feature | Comes from | Why it matters on Forever |
|---|---|---|---|
| F1 | Gear upgrade indicator | Pawn (129M) | Pawn has no Forever build, and Forever rewrote the stats on thousands of items, so players can't trust what they remember. |
| F2 | Alt and bank inventory in tooltips | Bagnon (168M), Baganator (38M) | Tooltips already count this character's bags and bank; other characters are the missing half. |
| F3 | `/way` waypoints and world map coordinates | TomTom (90M), HandyNotes (61M) | Guides and Forever map sites hand out `/way` lines; coordinates only show on the minimap today. |
| F4 | Questie coexistence | Questie (208M, has a Forever build) | The most-used addon that ships for Forever; Vanguard replaces the quest tracker and quest log Questie works with. |
| F5 | Docking spots for boss timers and warnings | DBM (635M), BigWigs (207M) | Both ship for Forever; their bars should sit in a known place in the Centered layout. |
| F6 | LibDataBroker readouts on the info strip | Titan Panel, ElvUI datatexts | The minimap drawer gathers other addons' buttons but can't show their text feeds. |
| F7 | Faster auto-loot | Leatrix Plus (72M) | The one common Leatrix toggle Vanguard doesn't have. |

Deliberately not planned (blocked by Forever's secret-value rules, retail-only, or a separate product): boss timers, hazard alarms, threat meters, WeakAuras-style triggers, Mythic+ tools, world quests, collection databases.

### Order and branches (overrides WORKPLAN section 0 items 1 and 2)

1. **Phase R (addon rebrand) goes first and alone.** It touches almost every file, so any branch started before it merges will conflict everywhere. Branch `work/r-rebrand`, one PR. Do not start S or F until R is merged into `main`.
2. **Phase S (site rebrand)** runs in the site repo after R is merged. Branch `work/s-rebrand` there, one PR.
3. **Phase F (features)**: after R is merged, each feature F1–F7 is independent and gets its own branch (`work/f1-upgrades`, `work/f2-inventory`, `work/f3-waypoints`, `work/f4-questie`, `work/f5-docks`, `work/f6-broker`, `work/f7-loot`) and its own PR, so several sessions can run at once. Files more than one feature touches: `README.md`, `Vanguard.toc`, `Core/Options.lua`, `Modules/Tooltips.lua` (F1, F2), `.luacheckrc`, `scripts/lib/wow-widget-api.lua`, `scripts/lua-coverage-floor.json`. Keep edits to those small and appended at the end of their lists, and `git fetch origin main && git rebase origin/main` before opening each PR.
4. **One task = one commit**, subject `<task id> <area>: <change>`, e.g. `R2 Core: rename globals to Vanguard`. Tick the task's checkbox in this file in the same commit.
5. Everything in WORKPLAN section 0 items 3–9 still holds: README is the spec, `npm run verify` and `npm run coverage` (100 % floor) must pass after every task, the 10-line function rule, comments above functions, no colour literals outside `Core/Theme.lua`, nothing protected in combat, never read a secret value, `[VERIFY IN GAME]` tasks get listed in the PR under "needs in-game check", and you never claim in-game behaviour you didn't see.

### Decisions already made (the owner can change any of these before R starts; otherwise use them)

- **Name:** `Vanguard`. Addon folder `Vanguard`, TOC `Vanguard.toc`, `## Title: Vanguard`.
- **Lua globals:** `Vanguard` (public table: skin API and `Vanguard.API.v1`), `VanguardDB`, `VanguardCharDB`, frame names `Vanguard_*`, `Vanguard_OnAddonCompartmentClick`.
- **Slash commands:** `/vg` and `/vanguard`. `/fui` and `/foreverui` are dropped, because the other ForeverUI may use them.
- **Profile strings:** new prefix `VG1:`; `FUI1:` strings still import (they are how the owner carries settings across the rename).
- **Bar texture:** the built-in "Forever" style becomes "Vanguard" (value `"vanguard"`), with a DB upgrade that maps `"forever"`.
- **LibSharedMedia names:** `Vanguard Fira Sans`, `Vanguard Fira Sans SemiBold`, `Vanguard`, `Vanguard Soft`, `Vanguard Flat`.
- **Version:** the rename ships as `0.4.0`.

### Hard rule for the rename: rename the brand, never the game

"Forever" appears hundreds of times meaning **the game** (WoW Forever): `ns.IsForever`, `## X-Flavor: forever`, `16001`, "Written for WoW Forever", the Forever client notes. Those stay. Rename only the addon's name: the token `ForeverUI` (any case, including `FOREVERUI` and `foreverui`), the abbreviation `fui`/`FUI` where it means the addon (slash commands, `FUI1`, `fui-*` file names), and the bar-texture style named "Forever". When unsure, read the sentence: if it would still be true with a different addon, it's about the game.

---

## 1. Owner actions (not code; the owner does these)

- [ ] **O1 Before installing the renamed build:** run `/fui export` in game and save the string somewhere. The saved-settings file name follows the addon folder (`WTF/Account/<acct>/SavedVariables/ForeverUI.lua` becomes `Vanguard.lua`), so the old settings won't load by themselves. After installing, `/vg import` the string. (Alternative: copy `ForeverUI.lua` to `Vanguard.lua` and replace `ForeverUIDB` with `VanguardDB` inside it, and the same for the per-character file in `WTF/Account/<acct>/<realm>/<char>/SavedVariables/`.)
- [ ] **O2 Delete the old folder** `Interface/AddOns/ForeverUI` (or re-run `npm run link:wow`, which R5 points at the new name), so the old and new builds don't both load.
- [ ] **O3 Rename the GitHub repos** (optional; GitHub redirects old URLs): e.g. `wow-forever-ui` → `vanguard` and `wow-forever-ui-site` → `vanguard-site`. If you do, update local remotes (`C:\Workspace\wow-forever-ui`) with `git remote set-url origin <new url>`, and tell the S phase so it updates `site.config.json`.
- [ ] **O4 Cloudflare Pages:** create a new Pages project for the site (`vanguard` is probably taken; e.g. `vanguard-ui` → `vanguard-ui.pages.dev`), and move the feedback Function's secrets (`TURNSTILE_SECRET`, `TURNSTILE_SITEKEY`, the GitHub token) to it. Tell the S phase the new project name and host.
- [ ] **O5 Claim the listings** when ready to publish: CurseForge project with slug `vanguard`, Wago project `vanguard`. If you buy a domain, avoid "wow", "warcraft" and "blizzard" in it (Blizzard trademarks).

---

## 2. Phase R — rebrand the addon (branch `work/r-rebrand`)

Scope measured at `ea4fa52`: the name appears in about 1,600 places across 144 files: `Core/` (24 files), `Modules/` (47), `scripts/` (57, mostly tests), `docs/` (7), `.github/` (2), `README.md`, `ForeverUI.toc`, `.luacheckrc`, `.vscode/settings.json`, `package.json`, `Media/`, `art/`. There are 12 hard-coded `Interface\AddOns\ForeverUI\...` paths and 202 mentions of `/fui`.

- [x] **R1 Inventory.** Before changing anything, run `git grep -n -i -E "foreverui|\bfui\b|fui1|\"forever\"|'forever'|Forever\"\s*}"` into a scratch file outside the repo (not committed) and sort the hits into "brand" (rename) and "game" (keep). Commit nothing for R1 except ticking the box; put the counts in the commit body.
- [x] **R2 TOC, folder name and packaging.** `git mv ForeverUI.toc Vanguard.toc`; set `## Title: Vanguard`, `## Notes: A from-scratch UI suite for WoW Forever: ...` (keep the game name), `## SavedVariables: VanguardDB`, `## SavedVariablesPerCharacter: VanguardCharDB`, `## IconTexture: Interface\AddOns\Vanguard\Media\Textures\Icon`, `## AddonCompartmentFunc: Vanguard_OnAddonCompartmentClick`, `## X-Website` (keep the current repo URL unless the owner did O3), `## Version: 0.4.0`. Then: `scripts/package.mjs` (`const ADDON = "Vanguard"`, zip `dist/Vanguard-<version>.zip`), `scripts/lib/link-wow.mjs` (folder name and backup name), `.github/workflows/verify.yml` and `release.yml` (`ForeverUI.toc` → `Vanguard.toc`), `package.json` (`name`, `description`), and every `Interface\AddOns\ForeverUI` path (12; `git grep -n "AddOns.ForeverUI"`). Run `npm run package` and check the zip holds a `Vanguard/` folder.
- [x] **R3 Lua globals and saved variables.** `ForeverUIDB` → `VanguardDB`, `ForeverUICharDB` → `VanguardCharDB` (`Core/DB.lua`, `Modules/VendorMemory.lua`, every other hit), the public table `ForeverUI` → `Vanguard` (`Core/Skin.lua:56`, `Modules/AuctionAPI.lua`, `docs/API.md`), every `ForeverUI_*` global name → `Vanguard_*` (50 distinct names, 62 uses in `Core/` and `Modules/`; `git grep -n "ForeverUI_"`), and the matching entries in `.luacheckrc` (globals list, lines 12–23) and `.vscode/settings.json`. In `Core/Skin.lua`'s header example, `## OptionalDeps: ForeverUI` → `Vanguard`. The skin API's `apiVersion` stays 1; nothing outside this repo uses it yet, so no `ForeverUI` alias is kept.
- [x] **R4 Slash commands and every user-facing string.** `Core/Slash.lua:403-404`: `SLASH_VANGUARD1 = "/vg"`, `SLASH_VANGUARD2 = "/vanguard"`, `SlashCmdList.VANGUARD` (drop `/fui`, `/foreverui`). Then every string a player sees: chat prefix (`ns.Chat`), the help text in `Core/Slash.lua:9-40`, option labels and descriptions in `Core/Options.lua`, `Core/OptionsWindow.lua`, `Core/Setup.lua`, `Core/GameMenu.lua` (the game-menu button), `Core/ErrorBadge.lua`, popups in `Core/Dialog.lua`, `Core/MoverPopover.lua`, the Edit Mode note in `Core/Movers.lua`, and module comments. `/fui <cmd>` in any string → `/vg <cmd>`. The `/fui report` block header in `Core/Slash.lua` becomes `### Vanguard report v1 ###` (the site parses it; S3 keeps the old header working there). Update the tests that assert these strings.
- [x] **R5 Profile strings and shared media.** `Core/Serialize.lua`: export writes `VG1:<scope>:<checksum>:<body>`; import accepts `VG1` **and** `FUI1` (same body format; one pattern with an alternation, or try both), and the error text says "a Vanguard string". `Core/SharedMedia.lua:12-15`: the LSM names listed in section 0. `Core/Options.lua:145` `BAR_TEXTURES`: `{ "vanguard", "Vanguard" }`; `Core/Theme.lua:110` default `barTexture = "vanguard"` and `:402` the built-in check. Map `barTexture == "forever"` to `"vanguard"` (done with `ns.Migrate("theme", ...)` in `Core/Theme.lua` rather than `ns.UpgradeDB`: it runs on every theme table when first read, so it covers saved profiles and imported `FUI1` strings alike). A picked LSM name `ForeverUI Forever`/`ForeverUI Soft`/`ForeverUI Flat`/`ForeverUI Fira Sans*` in a profile maps to the new names in the same upgrade. Tests: a `FUI1` string with `barTexture = "forever"` imports as `"vanguard"`; a `VG1` export round-trips; an unknown prefix is refused.
- [x] **R6 Docs and art.** `README.md` (title, every "ForeverUI", every `/fui`; add a short "Formerly ForeverUI" line near the top saying why and how to carry settings across, from O1), `docs/API.md`, `docs/THEME.md`, `docs/SMOKE-TEST.md`, `docs/handoff/*.md` (WORKPLAN, PROMPT, AUCTION-PLAN, CLICKCAST-FINISH: rename the addon, leave history like commit ids alone), `art/CREDITS.md`, `Media/Art/CREDITS.txt`, `scripts/tests/README.md`. Rename test fixture files whose names contain `fui`/`foreverui` with `git mv`. Leave the theme name "Slate & Brass" as it is.
- [x] **R7 Sweep and verify.** `git grep -n -i "foreverui"` must return only the "Formerly ForeverUI" line, the `FUI1` import compatibility code and its tests, the UpgradeDB mapping and its tests, and this plan. `git grep -n -w -i "fui"` the same. Then `npm run verify`, `npm run coverage`, `npm run lint`, `node scripts/build-media.mjs --check`, `npm run package`, `npm run preview` (look at the PNGs: the options window title and game-menu button say Vanguard). PR description: list O1 and O2 for the owner, and under "needs in-game check": the addon loads from `Interface/AddOns/Vanguard`, `/vg` opens options, the compartment button works, an old `FUI1` string imports.

---

## 3. Phase S — rebrand the site (repo `wow-forever-ui-site`, branch `work/s-rebrand`, after R is merged)

The site is generated from the addon's source (`scripts/fetch.mjs` clones the addon at `site.config.json` `sourceRef`; `scripts/lib/extract.mjs` reads `Core/Slash.lua`, the TOC and more). It deploys to Cloudflare Pages project `foreverui` (`foreverui.pages.dev`) and has a feedback Function that parses pasted `/fui report` output (`src/feedback/report.js`).

- [x] **S1 Point at the renamed addon.** `site.config.json`: `sourceRef` → the merge commit of the R PR; `addonRepo` → the new repo name if O3 happened; `siteUrl` → the host from O4. `scripts/lib/extract.mjs:395` reads `Vanguard.toc` (fall back to `ForeverUI.toc` only if you need to build an older ref; otherwise just switch). Fix every extractor that matched `ForeverUI`, `SLASH_FOREVERUI`, `/fui` or `ForeverUIDB`.
- [x] **S2 Brand.** Every page and asset: name, `<title>`, meta and Open Graph tags, the hero, header and footer, the "Coming soon on CurseForge" link (→ `curseforge.com/wow/addons/vanguard`), the `README.md`, `CONTRIBUTING.md`, `package.json`, and the `npm run deploy` project name (from O4). Commands pages now list `/vg`. Add one line on Install & Update and the FAQ: "Vanguard was called ForeverUI before 0.4.0; here's how to keep your settings" (O1's steps, in player words).
- [x] **S3 Feedback parser.** `src/feedback/report.js`: accept both `### Vanguard report v1 ###` and `### ForeverUI report v1 ###`, both `Vanguard:` and `ForeverUI:` chat prefixes, and both `Vanguard <version>` and `ForeverUI <version>` lines (`report.js:9`, `:13-19`, `:67`). Keep the old fixtures in `test/fixtures/` and add `vg-*` copies with the new strings; both must pass. Update `test/feedback.test.mjs:454-457` for the new host.
- [x] **S4 Verify.** `npm run check` (build + test), `npm run shots` if Chrome is available (390 px and 360 px, no horizontal scroll), and `git grep -n -i "foreverui"` returns only the "formerly" lines and the S3 compatibility code and fixtures. Deploying is the owner's step (the PR says so).

---

## 4. Phase F — features (after R is merged; one branch and PR per feature)

Every feature is a module made with `ns.Module(name, { defaults = ... })`, with its switch in the options window (`Core/Options.lua`, the right page), README text, and stub tests in a new `scripts/tests/<area>.test.mjs` file. Item and map data are not secret, but follow the secret rules anyway for anything read from a unit.

### F1 Gear upgrade indicator (`work/f1-upgrades`) — size L

- [x] **F1.1 Score.** New `Modules/Upgrades.lua`. `UP.Score(link, weights)` = sum of `weights[stat] * value` over `C_Item.GetItemStats(link)` (keys are the client's stat tokens, e.g. `ITEM_MOD_STRENGTH_SHORT`; confirm the token list in `Gethe/wow-ui-source` branch `forever` before relying on it). Cache by link. Items with no stats score 0 and never show as upgrades.
- [x] **F1.2 Compare.** `UP.Compare(link)`: the slot from `C_Item.GetItemInfoInstant(link)` (equip location) → inventory slot(s) via a small `EQUIP_SLOTS` table; for paired slots (rings, trinkets, one-handers when dual wielding) compare against the weaker equipped item; an empty slot is always an upgrade. Return the percentage change. Skip items the player can't use (`C_Item.IsEquippableItem`, plus `C_PlayerInfo.CanUseItem` if the client has it; check). **[VERIFY IN GAME]** that armour-type and weapon-skill limits are respected; never read tooltip text to find red lines (it's hidden from addons).
- [x] **F1.3 Weights. [DECIDE]** New `Modules/UpgradeWeights.lua`: default weights per class and role (tank, healer, damage), for the vanilla stats Forever uses. The owner approves the defaults table before F1 merges (put it in the PR for review). Role setting: Auto (from `UnitGroupRolesAssigned`, as `Modules/RaidFrames.lua:81` does; damage when none), Tank, Healer, Damage. Weights are editable per character in options, and `/vg weights export|import` shares them as a `VG1:weights:...` string (reuse `Core/Serialize.lua`; no Pawn code or format).
- [x] **F1.4 Show it.** Tooltip line through `ns.GetModule("Tooltips").AddItemLines(fn)` (see `Modules/AuctionPrices.lua:399`): "Upgrade +12%" in the theme's good colour or "−5%" in its bad colour, with "vs <equipped item name>". A small up-arrow on bag item buttons in the combined bag (`Modules/Bags.lua`, `Modules/BagSections.lua`; use a theme icon, `T.Icon`), and on the best quest reward choice in `Modules/QuestDialog.lua`. Each has its own switch; tooltip line on by default, arrows on by default.
- [x] **F1.5 Tests and README.** Score maths, paired slots, empty slot, unusable item, cache invalidation on `PLAYER_EQUIPMENT_CHANGED`, the weights string round trip.

### F2 Alt and bank inventory in tooltips (`work/f2-inventory`) — size M

- [x] **F2.1 Store.** New `Modules/Inventory.lua`. Account-wide store `VanguardDB.inventory[realm][faction][name] = { class = token, bags = { [itemID] = count }, bank = { ... }, updated = time() }` (pattern: `Modules/VendorMemory.lua:33-36`). Scan bags 0–4 (and the key ring if the client has one) on `BAG_UPDATE_DELAYED`, coalesced to one scan per 0.5 s with `C_Timer.After`; scan the bank on `BANKFRAME_OPENED` and on `PLAYERBANKSLOTS_CHANGED`/`BAG_UPDATE_DELAYED` while it's open (the bank can only be read while open; keep the last scan otherwise). Use `C_Container.GetContainerNumSlots` / `GetContainerItemInfo(bag, slot)` (`.itemID`, `.stackCount`).
- [x] **F2.2 Tooltip.** `Modules/Tooltips.lua` already adds "how many you have (bags and bank)" for this character; add the other characters on the same realm and faction under it: one line each, the name in its class colour (theme tokens, no literals), "5 (bank 3)", at most 6 names then "+N more", and a total. Respect the existing switch, plus a new "Other characters" switch (on).
- [x] **F2.3 Commands.** `/vg inventory` (characters stored and when each was scanned), `/vg inventory forget <name>`, `/vg inventory clear`. README note: until Blizzard fixes the Forever beta's saved-variables bug, other characters may not be remembered between sessions.
- [x] **F2.4 Tests.** Scan coalescing, bank kept when closed, tooltip lines with 0, 1 and 8 alts, forget/clear.

### F3 `/way` waypoints and world map coordinates (`work/f3-waypoints`) — size M

- [x] **F3.1 Check the client.** In `Gethe/wow-ui-source` branch `forever`, confirm `C_Map.SetUserWaypoint`, `C_Map.CanSetUserWaypointOnMap`, `UiMapPoint.CreateFromCoordinates` and `C_SuperTrack.SetSuperTrackedUserWaypoint` exist for Forever (the `SuperTrackedFrame` arrow). Record the result in the commit body. If they're missing, stop F3 and tell the owner (a self-drawn arrow is a separate, larger task).
- [x] **F3.2 Command.** New `Modules/Waypoints.lua`. `/way [zone] x y [title]` and `/vg way ...`: `x y` accept `45.2 61.8`, `45.2, 61.8` and `45,61`; zone is a name (case-insensitive, matched against `C_Map.GetMapInfo(...).name` for the zone maps under the continents, `C_Map.GetMapChildrenInfo`) or `#<mapID>`; no zone means the player's map (`C_Map.GetBestMapForUnit("player")`, as `Modules/Minimap.lua:137`). Set the waypoint and super-track it; `/way clear` removes it. Register `/way` at `PLAYER_LOGIN` only if no other addon owns it (`hash_SlashCmdList["/WAY"]` is nil and `C_AddOns.IsAddOnLoaded("TomTom")` is false); `/vg way` always works.
- [x] **F3.3 World map coordinates.** A small line on `WorldMapFrame`: the player's coordinates and the cursor's (`WorldMapFrame.ScrollContainer:GetNormalizedCursorPosition()`), updated at most every 0.1 s and only while the map is shown. Switch: on.
- [x] **F3.4 Tests.** Coordinate parsing (all formats, out-of-range refused), zone matching, TomTom present → `/way` not registered, map hidden → no updates. **[VERIFY IN GAME]** the arrow shows and clears.

### F4 Questie coexistence (`work/f4-questie`) — size S, mostly in-game checking

- [x] **F4.1 Read, don't copy.** Questie is GPLv3; read its source to learn which frames and hooks it uses for the quest tracker, quest log and map, but copy no code. Note the frame names in the commit body.
- [x] **F4.2 Who owns the tracker.** New setting under the quest tracker options: "With Questie: use Vanguard's tracker / use Questie's" (default: Questie's when Questie is loaded). Questie's choice → `Modules/QuestTracker.lua` leaves the game's tracker alone (no `Suppress("ObjectiveTrackerFrame")`, line 128) and doesn't build its own; and if Questie's tracker frame exists, skin it with the theme panel (the same primitives `Core/Skin.lua` hands out). Same for the quest log if Questie adds to the game's quest log.
- [x] **F4.3 Tests and in-game check.** Stub tests for both settings with and without Questie loaded. **[VERIFY IN GAME]** with Questie's Forever build installed: no doubled trackers, Questie's map icons show, no errors in `/vg errors`.

### F5 Docking spots for boss timers and warnings (`work/f5-docks`) — size S

- [x] **F5.1 Anchors.** Two movers (`ns.Mover`) in the Centered layout: "Boss timers" (`Vanguard_BossBarsAnchor`, above the right side of the action bars) and "Boss warnings" (`Vanguard_BossWarningsAnchor`, upper middle of the screen). They're empty frames with a label shown only in unlock mode.
- [x] **F5.2 Hand-off.** When DBM or BigWigs is loaded, a "Line up DBM/BigWigs bars with Vanguard" button (options, and `/vg dock`) moves their bars to the anchors once, using only their public settings APIs; check each addon's current source for the supported way to set bar positions, and if none exists, show the anchor's exact coordinates in a popup instead. Never move their frames every frame or hook their code.
- [x] **F5.3 Tests.** Anchors exist and save with the profile; the button is hidden when neither addon is loaded. **[VERIFY IN GAME]** with DBM and BigWigs Forever builds.

### F6 LibDataBroker readouts on the info strip (`work/f6-broker`) — size M

- [x] **F6.1 [DECIDE] Bundle LibDataBroker-1.1.** It's a tiny public-domain library like the ones in `Libs/`; the owner approves bundling it unmodified (same as LibSharedMedia in WORKPLAN P3.5). Add it to `Libs/`, the TOC, the README credits.
- [x] **F6.2 Host feeds.** `Modules/InfoStrip.lua` gets an optional fifth row of broker feeds: options list every data source registered with LibDataBroker (type `data source`) with a checkbox each; a chosen feed shows its icon and `text`, updates on the library's attribute-changed callback, shows its `OnTooltipShow`/`OnEnter` tooltip on hover and passes `OnClick`. Launchers (type `launcher`) stay in the minimap drawer.
- [x] **F6.3 Tests.** A fake feed appears, updates, and disappears when unchecked; nothing breaks without the library.

### F7 Faster auto-loot (`work/f7-loot`) — size S

- [x] **F7.1 Loot.** In `Modules/AutoAccept.lua` or a new `Modules/Loot.lua`: on `LOOT_READY`, if the game's auto-loot setting (or its modifier key) applies, take every slot at once with `LootSlot(i)` for `i = GetNumLootItems(), 1, -1`, skipping slots that need a roll or a bind-on-pickup confirmation (leave those to the game's popups). Off by default. Check the event and functions exist in the `forever` UI source first.
- [x] **F7.2 Tests.** Slots taken in reverse order, nothing taken with auto-loot off, the loot window still opens for skipped slots. **[VERIFY IN GAME]**.

---

## 5. Prompt to paste into the implementing session

Open a Claude Code session in a clone of `clifftaylor2325/wow-forever-ui` (and for phase S, `wow-forever-ui-site` too). Replace `<PHASE>` with `R`, `S`, or one feature id such as `F2`.

```text
You are working on Vanguard (renamed from ForeverUI), a World of Warcraft addon for WoW Forever written in Lua 5.1 with a Node/Vitest test harness. Your instructions are in docs/handoff/VANGUARD-PLAN.md. Read that file in full, then section 0 of docs/handoff/WORKPLAN.md, then README.md, before doing anything else.

Carry out <PHASE> of VANGUARD-PLAN.md, task by task, in order, on the branch the plan names for it:
- Phase F starts only after phase R is merged into main; check `git log origin/main` for the R merge first and stop if it isn't there.
- One task = one commit, subject "<task id> <area>: <change>", ticking the task's checkbox in VANGUARD-PLAN.md in the same commit.
- After each task, `npm run verify` and `npm run coverage` (100 % floor) must pass; run `npm run lint` if luacheck is installed.
- Obey the repository rules (a comment above every function, at most 10 code lines per function body, no colour or font-size literals outside Core/Theme.lua, new globals in .luacheckrc, new widget methods in scripts/lib/wow-widget-api.lua only after confirming them in the 12.1/forever client source) and the game rules (nothing protected in combat, never read a secret value, C_Item/C_Spell/C_Map APIs, detect the game with ns.IsForever).
- During the rename, rename the addon's name only, never the game's ("Forever", ns.IsForever, X-Flavor: forever stay).
- For [VERIFY IN GAME] tasks, implement and test under the stub and list them in the PR under "needs in-game check". Never claim in-game behaviour you didn't see.
- Stop and ask me only for [DECIDE] tasks when the decision changes the implementation.

When the phase is done, rebase on origin/main, open one pull request with: the tasks done (one line each), tests added, decisions you made, owner actions from section 1 that apply, and the "needs in-game check" list.
```
