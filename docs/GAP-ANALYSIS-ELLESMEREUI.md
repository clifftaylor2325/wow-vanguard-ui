# ForeverUI vs. EllesmereUI: feature gap analysis

Date: 2026-10-03. ForeverUI v0.3.0 at `3c57bff`; EllesmereUI v9.3.5 from the public
source at `github.com/EllesmereGaming/EllesmereUI` (commit `2e84b0b`), plus its
CurseForge changelogs 9.2.1–9.3.4 and the author's WoW Forever announcement.

**License note.** EllesmereUI's `license.txt` is "all rights reserved" (third-party
libraries excepted). This document compares *features*; it must not be used as a source
of code, art or text, which also keeps the README's "written from scratch" promise intact.

**Scale.** EllesmereUI is ~567k lines of Lua (140k of it options UI, 52k locales) across
20 child addons; ForeverUI is ~17.8k lines. Parity on everything is not the goal. The
question is which gaps a Forever player feels, and which are cheap.

**What loads on Forever.** Every EllesmereUI module loads on Forever except Friends and
Mythic+ Timer (`AllowLoadGameType: standard`); Forever Essentials is Forever-only
(`AllowLoadGameType: camelot`). On Forever it also drops: bonus-roll block, AH
current-expansion filter, keystone insert, LFG quick-signup and signup note, Talking
Head hiding (none of those systems exist there). It ships 11 languages.

---

## 1. Where ForeverUI is ahead

These are real differentiators; keep them and say so in the README/CurseForge text.

| Area | ForeverUI | EllesmereUI |
| --- | --- | --- |
| Quest dialog | Own keyboard-driven dialog (number keys, Space, Escape), reward cards, money/XP | Blizzard's windows, skinned |
| Quest log | Own log grouped by zone, Track/Share/Abandon/Map | Blizzard's, skinned |
| Quest tracker | Own tracker, nearest-first order, quest item buttons, "+N more" | Blizzard's `ObjectiveTrackerFrame`, skinned + visibility + auto-accept/turn-in |
| Leveling readouts | XP/hour, time to next level, gold/hour on the info strip | Gold session/character tracking only |
| Merchant | Keep-stocked list (`/fui stock`), repair, junk sell | Repair (incl. guild funds), junk sell |
| Main tank frames | Tiles with each tank's target | "Show Tanks in Extra Group" on raid frames (no target text) |
| Party pets/targets | Own tiles | Party pets on raid frames; party targets toggle |
| Faction look | Alliance/Horde title fonts + crests across the UI | Faction *indicator icon* on frames/nameplates (see gaps) |
| AFK screen | Yes | No |
| Theme | One coherent Slate & Brass look, accent presets | Four looks (EllesmereUI / Blizzard / Classic / WoW Forever) per module |
| Engineering | MIT, zero libraries, headless test client, 100 % Lua coverage floor | All rights reserved; LibStub/LSM/LibDeflate/LDB; no public tests |
| Skin API | `ForeverUI.RegisterSkin` for other addons | "Skin Third-Party Addons" toggle (EUI skins them itself) |

Rough parity already (no action needed): swing timer (EUI adds queued-attack highlight
and a range check), five-second-rule spark + 2 s energy ticks, druid mana while
shapeshifted, combo points on target, pet happiness + pet power bar, totems (EUI uses
Blizzard's "Call Totem Bar", off by default; FUI has its own), weapon enchants incl.
shaman imbues, boss frames, raid tools (ready check, pull timer, role check, convert to
raid, raid/world markers; EUI adds Disband), auto repair/junk sell, Train All, hidden
empty action slots, square minimap + coordinates + button collector, chat URL links +
copy, Edit Mode coexistence, per-spec profile switch, profile import/export strings,
Cooldown Manager and damage-meter skinning, levels on frames (difficulty colored),
health as % on Forever, numbers under 10k shown in full.

---

## 2. Gaps that matter on Forever (ranked)

Priority = value to a Forever player × how cheap it is in ForeverUI's codebase.
Sizes use the WORKPLAN scale (S/M/L).

### P-A. Vanilla essentials EllesmereUI has and ForeverUI doesn't

1. **Group threat meter window** — *High, M.* EUI's Forever Essentials draws one bar per
   group member (and pets) for your target or focus, sorted, with a pull-aggro line,
   a warning sound at N %, class colors, lock/grip/snap, and the same data as a "Threat"
   window type in its damage meters. Data source: `UnitDetailedThreatSituation` over
   prebuilt `raidN`/`partyN`/`pet` tokens; EUI's comment says Forever answers it
   readable (`C_Secrets.ShouldUnitThreatValuesBeSecret` is false there), with a secret
   value skipping that unit. FUI has only the % readout above the target and the raid
   aggro strip. **Action:** verify the readability claim in game once, then build it;
   the WORKPLAN's "Deliberately not planned: threat maths beyond UnitThreatSituation"
   should be revisited, because a meter needs no maths beyond the API's own numbers.

2. **Flight timer that works on the first flight** — *High, S–M.* EUI ships the flown
   length of every route (~300 entries generated from the client's TaxiPath data) and
   computes ETA = length ÷ speed, correcting the speed from every normal landing; it
   also scrolls intermediate stops past a "you" marker and offers an early-exit button.
   FUI's timer only knows a route after you have flown it once, so every first flight
   shows nothing. **Action:** ship a route-length table (generate it from the Forever
   client's data the way EUI's `.tools` script does, or fall back to node-to-node
   distance from `C_TaxiMap` positions when a route is unknown), keep the learned
   times as the correction.

3. **Loot feed** — *Medium, S–M.* Rows for items, money, reputation, currencies and
   skill-ups, merging repeats, fading; matched against the client's localized format
   strings so it works in every language. FUI has nothing like it.

4. **Faction/PvP indicator on frames and nameplates** — *Medium on PvP realms, S.*
   EUI: per-frame mode (off/always/opposite), icon style, size, position, "players
   only", and a PvP-flag mode (dim unflagged / flagged only / ignore). FUI has none.

5. **Character sheet item stats / weapon DPS** — *Medium, M.* EUI's Forever stats
   catalog replaces its retail "secondary stats" block with the character pane's vanilla
   stats (attack power, crit, spell power, weapon DPS...), reorderable and shown on the
   sheet. FUI only adds durability per slot. Vanilla players look at these constantly.

6. **Nameplate extras** — *Medium, S each.* Sunder Armor stack count (Forever-only in
   EUI), threat % text on plates, target-of-target name/class, first/last/both name
   format (surnames are a Forever thing), friendly player/NPC plate options, stacking
   plates. FUI already has threat colors, level, debuffs, CC, cast bar, target border,
   quest "!" — so these are additions, not a rewrite.

7. **Unit-frame heal prediction and spell-cost prediction** — *Medium, S.* EUI draws
   incoming heals/absorbs on player/target/party frames and, Forever-only, the mana a
   cast will spend as a lighter segment on the mana bar (both secret-safe through
   SetMinMaxValues/SetValue). FUI has heal prediction on raid tiles only and no cost
   prediction (PowerTicks already detects mana spells for the 5SR, so the hook exists).

8. **Raid-frame missing-buff presets** — *Low–medium, S.* EUI ships vanilla presets
   (Fortitude, Mark of the Wild, Spirit, Thorns, Paladin Blessings) and a "castable
   buffs only" choice, on by default on Forever. FUI's `buffWatch` takes a free-text
   list. A preset picker is a small options change on top of what exists.

9. **Auto combat logging in raids** — *Low, S.* EUI starts `LoggingCombat` in all
   raids on Forever (Warcraft Logs uploads). One toggle + zone check.

10. **Cast-bar channel ticks** — *Low, S.* Tick marks for channels (Drain Soul, Mind
    Flay, Arcane Missiles) and total-duration text. FUI's bars have spark/time/latency.

### P-B. Platform table stakes (players compare these first)

1. **Per-element scale and opacity** — *High, M.* Every EUI module has Frame Scale,
   Bar/Frame Opacity and usually "Fade out of combat / Out of Combat Alpha". FUI movers
   store only anchor + offsets. Already WORKPLAN P3.2; keep it near the top.

2. **Visibility conditions beyond the four states** — *High, M.* EUI: show-when
   dropdowns (always / mouseover / combat / instances / group), plus a Conditional
   Overrides engine (Dungeon / Raid / Arena / BG / Solo / Keybind) and, on retail, spec
   overrides. On Forever there is one spec per class, so spec overrides matter little;
   the *solo vs group vs raid* conditions matter a lot. WORKPLAN P3.3.

3. **Action bars** — *Medium–high, M total.* EUI: 10 bars; modifier paging (Shift /
   Ctrl / Alt → bar) and friendly/hostile-target paging; keybind/macro/charges/cooldown
   text size and hide toggles; click-through; vertical orientation and icon order; out-
   of-range coloring and desaturate-on-cooldown; proc-glow styles; bar backgrounds and
   gryphon end caps; relies on Blizzard's Quick Keybind mode for binding. FUI: 8 bars,
   per-bar buttons/rows/size, 4 visibility states, range/power tint, hotkey text always
   on, no button tooltips yet (WORKPLAN P2.3), no Quick Keybind support (0 references;
   FUI's own buttons won't take part in Blizzard's bind mode, so P3.4 stays relevant).
   Cheapest wins: modifier paging, tooltips (P2.3), text size/hide, click-through.

4. **Chat** — *Medium, M.* EUI: timestamps (6 formats), shortened channel names,
   class-colored names, whisper sound, session history across reloads, idle fade, tab
   styling, edit box on top, sidebar. FUI: skin, text size, URL links, copy. WORKPLAN
   P3.8 covers the first three; add history and whisper sound.

5. **Installer / first run** — *Medium, M.* EUI: style choice (EllesmereUI / Blizzard /
   Classic / WoW Forever looks), presets, "First install keeps your layout" on Forever
   (Blizzard frame positions preserved), tutorial tips, patch-notes and what's-new
   pages, video guides. FUI: 3-step wizard (layout, look, move). WORKPLAN P3.1
   (resolution/UI-scale step) is the right next step; a "keep the game's layout"
   preset already exists as "Like the game's".

6. **Fonts and textures** — *Medium, M.* EUI bundles LibSharedMedia, ~25 fonts, per-
   element font/size/outline, many bar textures, texture choice per bar. FUI: Fira or
   the game font, 3 generated textures, one text-scale slider. WORKPLAN P3.5 [DECIDE].

7. **Bags** — *Medium, L.* EUI replaces the bag: categories with a sidebar, list view,
   item level, BoE text, set names, merge duplicates, pinned/recent, junk desaturate,
   stack splitter, gold history, currencies, bank with tabs. FUI skins Blizzard's
   combined bag (sort, search, quality borders) and the bank. WORKPLAN P3.13 (later) is
   reasonable; on Forever the retail-driven features (ilvl tracks, warbound) don't apply.

8. **Options UX and localization** — *Medium, M–L.* EUI: live previews (unit frame,
   nameplate, action bar, CDM), apply-to-all, "less common settings" folding, 11
   languages. FUI: search, sample bar, English only. Forever is global; localization is
   the larger gap, and FUI's strings are not yet behind an `L[]` table.

9. **Raid frames depth** — *Medium, M.* EUI adds aura filter editors (presets + custom
   spell IDs, blacklists), portraits, class sort order / FrameSort support, per-raid-size
   frame sizes, pets in raid, healer mana display, status text options, level text.
   FUI's healing essentials (dispel, HoTs, click/hover cast, incoming heals, aggro,
   missing buff, range, roles) are present; a spell-ID whitelist/blacklist and a test
   mode (FUI has none; EUI previews) are the first two to add.

10. **Unit frames depth** — *Medium, M.* EUI: text-tag dropdowns per slot, portraits
    (2D/3D/class/dragon), elite/leader/combat/class icons, purgeable-buff glow, aura
    blacklist/whitelist, out-of-combat fade, "Frame Source: Blizzard" per frame, Apply
    All Settings To. FUI's layout is fixed by design; the cheap additions are an aura
    blacklist, purgeable-buff highlight (Purge / Dispel Magic targets), and OOC fade.

### P-C. EllesmereUI features that are large, retail-shaped or off-brand — skip or defer

- Cooldown Manager suite (36k lines: icon/bar/buff-bar tracking, glows, sounds,
  keybind labels, rotation assist, spell picker). On Forever it works only where
  Blizzard ships CDM data and EUI maps Forever's single spec onto retail keys. FUI's
  "skin more, replace less" (WORKPLAN P3.11) is the right call.
- Quickdraw (radial/grid action menus on a keybind for spells, mounts, items, markers).
  Genuinely novel; 9.7k lines; not table stakes.
- GCD bar, cursor circle/GCD ring, movement alerts with TTS, battle-res/Bloodlust
  tracker, self combat text, Shifter (move Blizzard windows), Party Mode (UI spins on
  boss kills), Gamepad page, Dragonriding HUD, Mythic+ tools, Friends list, Upgrade
  calculator — retail-centric or novelty.
- Per-module "Blizzard style" and a "WoW Forever style" (gryphons, bronze kit). FUI's
  identity is one strong theme plus the faction look; don't chase four looks.
- DataBars as a free-form datatext system (bars + blocks + click actions + plugins).
  FUI's fixed info strip is simpler; its leveling blocks are the differentiator. Add
  only placement/visibility options, not a block system.

### P-D. Cheap QoL toggles worth lifting (all S)

Auto-fill the DELETE confirmation; announce instance reset; announce group deaths;
skip cinematics; low-durability warning; hide tutorial pop-ups; combat enter/leave
text; target distance (range) text; spell ID on tooltips; "Suppress Lua errors" (FUI's
`/fui errors` already catches its own — this is about other addons' popups). (EUI's
auto-accept of guild/friend invites lives in its Friends module, which is retail-only.)

---

## 3. Module matrix

| Area | ForeverUI v0.3.0 | EllesmereUI 9.3.5 on Forever | Gap |
| --- | --- | --- | --- |
| Unlock / move mode | Grid, snap, nudge, anchor + offsets, Edit Mode handles | Snap to element/screen/grid, grid dim/bright, "Anchor To", scale, screen-edge anchors | Scale/alpha per element; anchor-to-element |
| Profiles | Per-spec switch, export/import whole or per module | Export/import per addon or full account, spec overrides, conditional overrides, sync mirror groups, presets | Conditional overrides; sync groups |
| Installer | 3-step wizard | Style choice, keep-layout on Forever, presets, tutorials, what's-new | Resolution/scale step; keep-layout |
| Unit frames | Fixed layout, %/value, levels, elite diamond, boss frames, class bars | Text tags, portraits, indicators (elite/faction/leader/combat/class), aura filters, purge glow, heal + cost prediction, Blizzard frame source | Heal/cost prediction, faction icon, aura filters, OOC fade |
| Cast bars | Player/target/focus, spark, time, latency, non-interruptible | + icon, channel ticks, total duration, latency overlay, kick-ready hint | Ticks, total time |
| Resource bars | Combo points, totems, druid mana, 5SR/energy spark, swing timer (3 rows) | Same + GCD bar, thresholds, spender coloring, queued-attack highlight, range check, Blizzard class art | GCD bar; swing extras |
| Raid frames | VuhDo-style zones, dispel/HoTs, click/hover cast, heals/absorbs, aggro, missing buff, range, roles, main tanks, pets/targets | Debuff/Buff managers with filter editors, HoverCast, portraits, class sort/FrameSort, raid-size sizes, healer mana, pets, extra tank group, missing-buff presets | Filter editor, test mode, presets |
| Nameplates | Colors, level, debuffs, CC, cast, target border, quest "!" | + threat %, Sunder stacks, ToT text, name formats, friendly plate options, stacking, execute glow, class resource | Threat %, Sunder, ToT, name format |
| Action bars | 8 bars, per-bar layout, 4 visibility states, range/power tint, hidden empties | 10 bars, modifier/target paging, text options, click-through, orientation, glows, end caps, Quick Keybind | Paging, tooltips, text options, keybind mode |
| Bags | Skinned combined bag + bank, sort, search | Full replacement with categories, list view, ilvl, gold history, currencies | Replacement (deferred) |
| Minimap | Square, coords, button drawer, corner icons | Shapes, rotate, zoom reset, grouped/free buttons, clock/zone/coords/FPS styles, difficulty text | Polish |
| Chat | Skin, text size, URLs, copy | + timestamps, short channels, class colors, whisper sound, history, idle fade, tabs/sidebar | Timestamps, short channels, class colors, history |
| Datatexts | Info strip: durability, bags, fps/ms, gold, ammo, clock, XP/hr, time-to-level, gold/hr, DPS | Configurable bars/blocks: gold, bags, durability, time, latency, friends/guild, menu, spec, currency... | Placement/visibility only; FUI's leveling blocks are unique |
| Quests | Own dialog, log, tracker; auto accept/turn-in/skip gossip | Skinned Blizzard tracker; auto accept/turn-in | FUI ahead |
| Game windows | ~30 windows + popups + timers, durability on slots | ~50 window skins (many retail-only), incl. Forever LFG, Progress Legacy, character-sheet stats | Forever LFG + Legacy windows; stats |
| Tooltips | Class color, target line, sell price, item count, item ID, anchor | + spell ID, health strip, titles/ilvl/mount/guild rank extras | Spell ID |
| Forever essentials | Swing timer, 5SR, happiness, ammo, enchants, flight timer (learned), keep-stocked, Train all | Threat meter, flight timer (shipped routes), loot feed, stats, auto logging | Threat meter, route data, loot feed |
| Cooldown Manager | Skin + place Blizzard's | Full tracking suite | Deliberate non-goal |
| Damage meter | Skin + last-fight DPS | Windows, breakdown, spell/icon history, Threat type | Deliberate non-goal |
| Localization | None | 11 languages | L[] table first |
| Performance tooling | `/fui errors`; `/fui perf` planned (P1.14) | Claims "borderline obsessive" CPU work; no public numbers | Publish numbers after P1 |

---

## 4. Suggested changes to WORKPLAN §5 (P3)

Keep P3.1 (resolution step), P3.2 (scale/alpha), P3.3 (visibility), P3.4 (keybind
mode), P3.8 (chat). Add, in roughly this order after P3.3:

- **P3.15 Threat meter window** (Forever Essentials parity; verify threat readability
  in game first). Size M.
- **P3.16 Flight route table** so the timer works on first flight. Size S–M.
- **P3.17 Loot feed.** Size M.
- **P3.18 Faction/PvP indicator** on unit frames and nameplates. Size S.
- **P3.19 Nameplate extras**: threat %, Sunder Armor stacks, target-of-target, name
  format. Size S each.
- **P3.20 Heal prediction on unit frames; spell-cost prediction on the mana bar.** Size S.
- **P3.21 Character-sheet vanilla stats + weapon DPS.** Size M.
- **P3.22 Raid-frame missing-buff presets; aura spell-ID allow/deny lists; test mode.** Size S/M.
- **P3.23 QoL toggles** from §2 P-D. Size S.
- **P3.24 `L[]` string table** (no translations yet; just make them possible). Size M.

Amend the "Deliberately not planned" line: a threat *meter* is feasible on Forever by
EUI's account; what stays out is threat *prediction* (TPS maths, pull estimates from
damage), which the secret rules do make unreliable.

---

## 5. Coverage and confidence

- ForeverUI: README (the spec) checked against code by module (`docs/handoff` plus a
  full pass over `Core/Options.lua`, `Core/Setup.lua`, `Core/Slash.lua` and every
  module's `defaults`). Two README mismatches found on the way: the bag strip has no
  switch (README says each strip has one), and "Pixel-perfect scale" defaults off.
- EllesmereUI: every options file's rows and section headers (~1,500 settings), every
  `IS_FOREVER` gate in the modules, the Forever Essentials sources, module TOCs, and
  the 9.2.1–9.3.4 changelogs. Module internals were not read end to end, so a feature
  that exists only in code with no option row could be missing from §3; the Forever-
  specific claims (threat readability, route data, chat format matching) come from
  EUI's own source comments and are quoted as its claims, not verified in game.
