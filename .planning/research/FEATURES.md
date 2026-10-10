# Feature Research

**Domain:** Levelling and group-play helpers, plus UI polish expectations, for a WoW UI suite on WoW: Forever (vanilla content, 12.1 engine)
**Researched:** 2026-10-09
**Confidence:** MEDIUM (addon landscape from CurseForge listings and the Blizzard policy page; Forever-specific API availability is unverified and nobody on the project can run the client; UI polish section is from experience, not sourced)

## Read this first: what Vanguard already has

The brief says levelling helpers are wanted, but a code read shows much of the obvious list is already built. Do not re-plan these.

| Wanted feature | Already in repo | Gap that is left |
|----------------|-----------------|------------------|
| XP/hour, time to level, gold/hour | `Modules/InfoStrip.lua` (`xprate`, `leveltime`, `goldrate`; 60 s settle; `IS.CountXP`) | Kills to level, per-level history, tooltip detail |
| XP bar with rested overlay | `Modules/DataBars.lua` (`DB.XP`, `PLAYER_XP_UPDATE`, `UPDATE_EXHAUSTION`) | Tooltip with rested detail and XP waiting in the log |
| Quest XP value | `Modules/QuestLog.lua` (money and XP line, `GetQuestLogRewardXP`), `Modules/QuestDialog.lua` (`GetRewardXP`) | Not shown in the tracker; no "% of level" or total waiting |
| Supply reminders | `Modules/InstancePrep.lua` (ammo, shards, reagents, food, bandages, potions, durability; at dungeon door, ready check, `/vg prep`; `want` thresholds; Buy list to Auction restock) | Nothing for the open world while levelling (low ammo, low food, at a rest area or vendor) |
| Share a quest to the party | `QuestLog.Share` button (`IsPushableQuest` and `IsInGroup`) | No auto-share, no "who has it" |
| Quest automation (accept, turn in, best reward, skip gossip) | `Modules/QuestAuto.lua`, off by default, Shift skips | Done; sets the precedent for how opt-in automation is handled |
| Group loot roll frames and loot history frame skinned | `Modules/Windows.lua` (`GroupLootFrame1-4`), `WindowsTown.lua` (`GroupLootHistoryFrame`) | No tracking, no upgrade hint on the roll, no `/roll` tracker |
| Addon-to-addon messaging | none (no `CHAT_MSG_ADDON`, no prefix registration) | A comms layer must be built for any live party quest progress |

So the real new-build list is small: a group comms layer plus party quest progress, a roll tracker, and a handful of levelling add-ons to existing modules.

## Feature Landscape

### Table Stakes (Users Expect These)

For a levelling and grouping addon in the vanilla/Classic ecosystem, these are the things players assume. Most are already met (see above); the unmet ones are marked NEW.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| XP/hour and time-to-level ETA (EXISTS) | Every Classic XP addon (GrindCompanion, XPChronicle, XPLedger, EraEXP, XP Bar Tooltip) leads with it | LOW | Done. Keep the 60 s settle; early numbers jump |
| XP bar tooltip with numbers: current/max, percent, rested (NEW, partial) | XP Bar Tooltip exists only to add this to the bar | LOW | Hook the existing `DB.XP()` table; add percent and rested-as-percent-of-level. Values the client hides show nothing (existing rule) |
| Quest reward XP visible before turning in (EXISTS in log and dialog) | Players pick quests by XP value | LOW | Add to the tracker row (NEW, LOW); same `ns.PlainNumber` guard |
| Supply low warning that is edge-triggered and not nagging (NEW) | Prepped, Blocky Buffet, Reagent Counter all do it; Blocky Buffet's repeating chat warning is a known annoyance | LOW | Reuse `InstancePrep` counts and `want` table; fire once when a count crosses the threshold downward, and when resting or opening a vendor. Never check in combat |
| Group loot roll shows who rolled what and who won (NEW) | Blizzard's own history frame is the only record; Better Loot Rolls and RollFlow exist to fix that | MEDIUM | Event source is `START_LOOT_ROLL` plus `C_LootHistory` (Better Loot Rolls reads it) or `CHAT_MSG_LOOT`; check what Forever exposes. Bounded list (Better Loot Rolls keeps 20, configurable 5-100) |
| Roll buttons never lag or break in a fight (NEW constraint) | Vanilla dungeon rolls happen mid-pull | LOW | Roll frames are already skinned; any added element must not touch the buttons or anchor protected frames in combat |
| Know which party members are on a quest (NEW) | Every party-quest addon starts here | LOW | `C_QuestLog.IsUnitOnQuest(unit, questID)` works without the other player running anything. Added in 9.0.1 as the namespaced form of a 1.3.0 API; confirm on 12.1 |
| Share a quest with one click (EXISTS) | Standard | LOW | Done |

### Differentiators (Competitive Advantage)

Aligned with the Core Value (loads clean, everything works): choose features that are small, event-driven, and testable headless. Differentiation here is "built into the suite you already run, one look", not novelty.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Live party quest progress under each tracker objective ("Ann 3/8, Bo 5/8") | The most-requested group feature; Questie, Bleakfiber's Quest Tracker and Party Passport HC all have it. Natively the client shows nothing | HIGH | Needs the comms layer (below) and every member running Vanguard. Fine for the author plus two friends; other players will see nothing, so degrade quietly. Do not try to speak Questie's protocol |
| Group comms layer in Core (prefix, version handshake, throttled queue, group gating) | Enables the above and later features | HIGH | See pitfalls below: 255-char limit, 16-char prefix, per-prefix throttle since 10.2.7, 12.0.0 `AddOnMessageLockdown` result. `Libs/` has no ChatThrottleLib; either write a tiny queue or add the library with a CREDITS note |
| Roll history plus "is this an upgrade for me?" on the roll frame | Reuses existing `Upgrades`/`UpgradeWeights` (gear upgrade hints). No mainstream roll addon ties the two together | MEDIUM | Show a small badge on the roll frame and in the history row. Information only; the player still clicks |
| `/roll` tracker (collect "X rolls N (1-100)", highlight highest, expire after N seconds) | Vanilla dungeons settle MS/OS and master-loot ties with `/roll`; a standalone tracker addon exists for exactly this | LOW | Parse via the localised `RANDOM_ROLL_RESULT` global string, not a hard-coded English pattern. Guard `ns.IsSecret` on every message |
| Kills to level / XP per kill | Grinders want "~41 more of these"; GrindCompanion tracks per-mob stats | LOW | Compute from the `PLAYER_XP_UPDATE` delta already counted in `IS.CountXP`; no chat parsing, so no secret-string risk |
| XP waiting in the quest log (sum of completed quests, as % of level) | Answers "should I turn in now or keep grinding" | LOW | Iterate the log, `GetQuestLogRewardXP` per completed quest, `ns.PlainNumber`. Show on the XP bar tooltip and tracker header |
| Per-level history (time at level, XP/hr, gold gained) | XPLedger keeps leveling history per character; players like a record | MEDIUM | New per-character SavedVariables table through `Core/DB`. Needs `/played` or own session clock; XP Bar Tooltip uses `/played` |
| Rested XP detail (rested until, inn/city status) | Rested XP drives vanilla levelling choices | LOW | `GetXPExhaustion`, `IsResting` already in use in `Situations`. Avoid a "time to full rested" figure unless the formula is verified for Forever |
| Level-up toast: summary of the level plus nudges (unspent talents, visit trainer) | Cheap "something happened" feedback; doubles as UI-polish feedback work | LOW | `PLAYER_LEVEL_UP`. Trainer nudge is a simple message; the client gives no trainable-spell data away from the trainer. Talent nudge depends on `TalentPlanner` |
| One-click vendor restock button (user presses it) | RestockReady does this; existing `want` table already knows the targets | MEDIUM | `BuyMerchantItem` is not protected, but keep it as a visible button press, not an automatic buy on window open (see anti-features) |
| Roll-history panel in the Vanguard look (replace Blizzard's `GroupLootHistoryFrame` skin with something readable) | The default history is hard to scan | MEDIUM | Depends on roll tracker data model |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-Need or auto-roll on loot | "I'm tired of clicking" (aSmoothLootHelper does Need/Greed/Pass for you) | Not a clear Blizzard violation (roll calls are not protected), but it takes a decision for the player, and an auto-Need is the fastest way to be called a ninja in a three-person group. The policy lets Blizzard disable functionality at its sole discretion. Direct risk to the author's friends | Show information (upgrade badge, who can use it, timer). If anyone insists on automation, opt-in "auto-pass items I cannot equip" only, off by default, announces what it did, Shift to skip (the `QuestAuto` pattern). Never Need. Cut for launch |
| Auto-buy when a vendor window opens | "Restock for free" | Silent spending; mistakes cost gold; blurs into automation | Restock button the player presses; prompt, not purchase |
| Auto-announce every quest objective in party chat | Enhanced Quest Tracker does optional party announcements | Chat spam; addon-initiated chat is exactly what 12.0 locks down during encounters (`C_ChatInfo.InChatMessagingLockdown`), so it breaks unpredictably | Show progress in the tracker via addon messages (invisible to chat) |
| Auto-share every accepted quest | Convenience | Shares to people who do not want it; quests that cannot be pushed are skipped anyway | Opt-in toggle, off by default, using the same pattern as `QuestAuto` |
| Step-by-step levelling route guides (RestedXP/Zygor style) | The most popular levelling tools | Huge content database for a client whose content set is not yet public; paid guides conflict with the policy's free-distribution rule; the author cannot play-test them; Questie already fills map and quest-db territory | Defer entirely. Cooperate with Questie (the `withQuestie` setting exists) |
| Own quest database / map pins | "Questie but in Vanguard" | Same data problem; duplicates a maintained addon; blows the 26-day schedule | Keep waypoints and native APIs only |
| Rotation / next-spell helpers, auto-targeting, bots, auto-walk or grind bots | Request appears in "levelling helper" threads | Automating gameplay is against the Terms of Use; the 12.0 Secret Values system exists specifically to stop addons computing combat logic from combat data | Not built. Ever |
| Reading or comparing combat values that may be secret (e.g. kill-by-kill damage parsing from the combat log for XP) | Per-mob stats | Secret Values raise Lua errors on compare/arithmetic, breaking the "zero Lua errors" goal | Derive from plain deltas (`PLAYER_XP_UPDATE`) and `ns.PlainNumber` |
| In-game donation prompts, ads, upsells | Monetisation | Banned by the UI Add-On Development Policy rules 4 and 5; the addon is free anyway | None |
| Network/telemetry upload of player data | "Anonymous stats" | No external network from addons; unnecessary risk | Keep everything local |
| Interop with Questie's wire protocol | "Show Questie users' progress" | Undocumented, version-fragile, needs every member on matching versions | Own versioned protocol for Vanguard users only |
| Loot council / DKP / raid loot distribution | Looks like "group play" | Raid feature, already out of scope for launch | Defer past launch |

## Feature Dependencies

```
Core group comms layer (prefix, handshake, throttled queue, group gate)
    └──requires──> ns.IsSecret / ns.PlainNumber guards on every incoming payload
    └──required by──> Live party quest progress (tracker rows)
                          └──requires──> QuestTracker row layout (EXISTS)
                          └──enhanced by──> C_QuestLog.IsUnitOnQuest (no comms; works alone)

Roll tracker data model (START_LOOT_ROLL + roll results)
    └──required by──> Roll history panel
    └──enhanced by──> Upgrade badge (Upgrades / UpgradeWeights EXISTS)
    └──independent of──> comms (every client sees roll results itself)

/roll tracker ──independent of──> roll tracker (different event source, CHAT_MSG_SYSTEM)

XP delta tracking (IS.CountXP EXISTS)
    └──required by──> Kills to level
    └──required by──> Per-level history ──requires──> per-character DB table
XP waiting in log ──enhances──> XP bar tooltip, tracker header

Supply warnings (edge-triggered) ──requires──> InstancePrep counts + want (EXISTS)
    └──enhanced by──> Restock button ──requires──> merchant frame hook (Errands EXISTS)

Level-up toast ──enhanced by──> TalentPlanner (unspent point count)
All new motion/feedback ──requires──> Core/Theme tokens + docs/THEME.md entry
Auto-roll ──conflicts──> "information only" principle for roll features
```

### Dependency Notes

- **Live party quest progress requires the comms layer:** the client exposes whether a member is on a quest, never their objective counts. The layer is the single largest new item and must exist before anything else that talks to other players.
- **Comms must tolerate lockdown:** since 12.0.0 `SendAddonMessage` can return `AddOnMessageLockdown`. Queue and retry after the encounter; quest sync is never urgent. No source states exactly which contexts are locked, so this is an in-game check.
- **Roll tracker does not need comms:** everyone in the group receives the same roll events, so it works with non-Vanguard players. This makes it the safer group feature to ship first.
- **Per-level history requires persistent storage:** everything else is session-only, so history is the only item that changes the SavedVariables schema (migration and profile-export implications).
- **Upgrade badge enhances the roll tracker only if upgrade data is available for the item at roll time:** item info can be uncached; handle the late-arriving case (`GET_ITEM_INFO_RECEIVED`) and show nothing rather than wrong.

## MVP Definition

Order follows the author's ranking: features are cut first if time runs short, so the list is cut-line ordered.

### Launch With (v1)

Small, event-driven, testable in the headless harness, and mostly extending existing modules.

- [ ] Quest XP on the tracker row, plus "XP waiting in the log" on the XP bar tooltip and tracker header (LOW) — shortest path to the "quest XP values" ask
- [ ] XP bar tooltip: percent, rested detail, kills to level (LOW) — closes the levelling-helper ask using `IS.CountXP`
- [ ] Edge-triggered low-supply warning while levelling, with Restock button as a stretch (LOW, button MEDIUM) — closes "supply reminders" by reusing `InstancePrep`
- [ ] Roll tracker with bounded history in Vanguard's look (MEDIUM) — group helper that needs no comms and works with any group
- [ ] `/roll` tracker (LOW) — cheap and genuinely used in vanilla dungeons
- [ ] "Who has this quest" via `C_QuestLog.IsUnitOnQuest` in the quest log and tracker (LOW) — party quest awareness with no comms

### Add After Validation (v1.x)

- [ ] Group comms layer and live party quest progress (HIGH) — build only once the three players confirm they want the objective counts; needs an in-game check for lockdown behaviour
- [ ] Upgrade badge on roll frame and history (MEDIUM) — after the roll tracker is stable
- [ ] Per-level history (MEDIUM) — after launch week, once the DB schema is settled
- [ ] Level-up toast with nudges (LOW) — doubles as polish work if time permits

### Future Consideration (v2+)

- [ ] Opt-in auto-pass of unusable items — only if the group asks; never Need
- [ ] Levelling route guides — separate project; content and licensing problem
- [ ] Loot council, DKP

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Quest XP on tracker, XP waiting in log | HIGH | LOW | P1 |
| XP bar tooltip, kills to level | MEDIUM | LOW | P1 |
| Edge-triggered supply warning | MEDIUM | LOW | P1 |
| Roll tracker and history panel | HIGH | MEDIUM | P1 |
| `/roll` tracker | MEDIUM | LOW | P1 |
| Who has this quest (`IsUnitOnQuest`) | MEDIUM | LOW | P1 |
| Live party quest progress + comms layer | HIGH | HIGH | P2 |
| Upgrade badge on rolls | MEDIUM | MEDIUM | P2 |
| Vendor restock button | MEDIUM | MEDIUM | P2 |
| Per-level history | LOW | MEDIUM | P3 |
| Level-up toast | LOW | LOW | P3 |
| Opt-in auto-pass | LOW | LOW | P3 (and risky) |

**Priority key:**
- P1: Must have if the feature work is done at all
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## UI Polish Expectations (mainstream addon baseline)

This section is from experience of ElvUI, Details!, Bartender, Plater and similar; none of it was sourced from the web in this pass (MEDIUM/LOW). Project rules constrain implementation: colours and sizes only in `Core/Theme.lua`, fades at most 0.15 s in combat, Reduce motion honoured, every fade and sound listed in `docs/THEME.md`, and no `SetTexCoord` crops on atlas art (relative texcoords on Forever; size and anchor instead).

### Table stakes

| Expectation | Why | Complexity | Notes |
|-------------|-----|------------|-------|
| Hover state on every clickable thing (buttons, tabs, list rows, icons) | Missing hover makes a UI feel dead; the single biggest "flat grey box" cause | LOW | One shared highlight token (brass edge or tint), applied in widget constructors, not per module |
| Pressed and disabled states distinct from normal | Standard in any skinned UI | LOW | Same place as above |
| Keyboard focus ring on edit boxes and dropdowns | Options window use | LOW | Theme token |
| Panel depth: 1 px border, inner highlight or bevel, soft drop shadow or edge glow | The brief asks for it directly; flat panels read as unfinished | MEDIUM | Reusable backdrop helper in Theme so 80+ modules do not each hand-draw. Pixel-snap borders for the UI scale |
| Text legible on busy backgrounds (outline or `SetShadowOffset` on HUD text) | World-overlaid text without contrast is unreadable | LOW | Per-font-object choice in Theme |
| One type scale and one spacing grid | "Deliberate not generic" | MEDIUM | Tokens for 4-5 text sizes and a 4 px spacing step; existing text-size scaling must keep working |
| Item icons with quality-colour borders | Universal in bag and loot UIs | LOW | Likely partly present; check roll frames and history rows |
| Subtle feedback on events (item gained, quest complete, level up) | Brief calls it out | LOW-MEDIUM | Short fade or pulse; respects Reduce motion and sound switch |

### Differentiators

| Feature | Value | Complexity | Notes |
|---------|-------|------------|-------|
| Window open/close fade of 0.1-0.15 s | Feels polished; the cap is already the in-combat limit | LOW | Shared helper so nothing exceeds 0.15 s when `InCombatLockdown` |
| Consistent empty states and tooltips in the same voice | Rare in addons | LOW | Needs a pass over modules |
| Fully styled PvP windows (RESKIN S8) | Consistency: players notice the one window that is still default | MEDIUM | Already planned |

### Anti-features (polish)

| Anti-feature | Why avoid | Instead |
|--------------|-----------|---------|
| Per-frame `OnUpdate` animation | The review goal is fewer per-frame costs | `AnimationGroup` or timer-driven, one shared ticker |
| Sound on every hover | Annoying; also needs a `docs/THEME.md` entry each | Sound on meaningful events only |
| Heavy glow or blur textures | Blur on atlas art (relative texcoords) | Edge textures sized to the frame |
| Motion that ignores Reduce motion | Accessibility, project rule | Single check in the animation helper |

## Competitor Feature Analysis

| Feature | Competitor | How they do it | Our approach |
|---------|------------|----------------|--------------|
| XP rate, ETA | GrindCompanion, XPChronicle, XPLedger, EraEXP | Stand-alone panels with graphs and history | Keep the info-strip numbers; add kills to level and tooltip; history later |
| Supply warnings | Prepped, Blocky Buffet, Reagent Counter, RestockReady | Chat warning, flashing icon, or auto-buy | Edge-triggered card or toast; button not auto-buy |
| Party quest progress | Questie (QuestieComms), Bleakfiber's Quest Tracker, Party Passport HC | Addon messages; Questie needs everyone on the same version | Own comms for Vanguard users plus `IsUnitOnQuest` fallback |
| Roll history | Better Loot Rolls (observer, C_LootHistory), RollFlow (window replacement), RolyPoly (personal stats) | Observer or replacement | Observer plus Vanguard skin; upgrade badge as the unique part |
| Auto rolling | aSmoothLootHelper | Automates Need/Greed/Pass | Do not build for launch |
| Roll `/roll` results | standalone roll-tracker addons | Chat-parse | Same, localised patterns |

## Rules the features must respect

- **Blizzard UI Add-On Development Policy (2009, still the cited text):** free distribution, no ads or in-game donation requests, code not hidden, must not negatively affect realms or other players, Blizzard may disable functionality at its discretion. It has no explicit automation clause; automation limits come from the Terms of Use and from the 12.0 API restrictions. Treat "don't make gameplay decisions for the player" as the working rule.
- **12.0 Secret Values:** compare, arithmetic or formatting on a secret raises a Lua error. Every new value from events (XP, chat, addon payloads, item counts) goes through `ns.IsSecret` or `ns.PlainNumber`.
- **Addon messaging:** 255-character message, 16-character prefix, per-prefix throttle since 10.2.7, and 12.0.0 `AddOnMessageLockdown` enqueue result.
- **Nothing protected in combat** (`ns.OutOfCombat`): roll-frame add-ons and tracker rows must not change secure frames in a fight.

## Gaps and in-game checks needed

- Does Forever expose `C_LootHistory` and `START_LOOT_ROLL` with the retail shape, and does the roll frame have a Disenchant button? (Better Loot Rolls lists Disenchant for TBC; vanilla content may not.) MEDIUM-LOW until observed.
- Is `C_QuestLog.IsUnitOnQuest` present on the 12.1 client, and does it work for party members out of range? Needs an in-game check.
- Which addon-message chat types and contexts are locked during encounters; no source states this. Needs an in-game check.
- Does the quest XP the client returns already include level-based reduction? Verify with a low-level-quest turn-in.
- Does Questie ship for Forever at launch? XPLedger lists Forever support; Questie was not checked.
- Everything visual in the polish section goes on the needs-in-game-check list.

## Sources

- [GrindCompanion](https://www.curseforge.com/wow/addons/grindcompanion), [XPChronicle](https://www.curseforge.com/wow/addons/xpchronicle), [XPLedger](https://www.curseforge.com/wow/addons/xpledger) (lists WoW: Forever support), [EraEXP](https://www.curseforge.com/wow/addons/eraexp), [XP Bar Tooltip](https://www.curseforge.com/wow/addons/xp-bar-tooltip) — XP rate and ETA features (MEDIUM; listing pages)
- [Prepped](https://www.curseforge.com/wow/addons/prepped), [Blocky Buffet](https://www.curseforge.com/wow/addons/blocky-buffet), [Reagent Counter](https://www.curseforge.com/wow/addons/reagentcounter), [RestockReady](https://www.curseforge.com/wow/addons/restockready) — supply reminders (MEDIUM)
- [Better Loot Rolls](https://www.curseforge.com/wow/addons/better-loot-rolls), [RollFlow](https://www.curseforge.com/wow/addons/rollflow), [RolyPoly](https://www.curseforge.com/wow/addons/rolypoly), [aSmoothLootHelper](https://www.curseforge.com/wow/addons/asmoothloothelper) — loot roll tracking and automation (MEDIUM)
- [Questie](https://www.curseforge.com/wow/addons/questie), [Bleakfiber's Quest Tracker - Classic](https://www.curseforge.com/wow/addons/bleakfibers-quest-tracker-classic), [BetterQuestLog](https://www.curseforge.com/wow/addons/betterquestlog), [Enhanced Quest Tracker](https://www.curseforge.com/wow/addons/enhancedquesttracker), [Party Passport HC](https://www.curseforge.com/wow/addons/party-passport-hc) — party quest progress (MEDIUM)
- [UI Add-On Development Policy](https://us.forums.blizzard.com/en/wow/t/ui-add-on-development-policy/24534) — monetisation, visibility, realm impact, discretion; no automation clause (HIGH for what it says, dated 2009)
- [Patch 12.0.0 Planned API changes](https://warcraft.wiki.gg/wiki/Patch_12.0.0/Planned_API_changes) and [Icy Veins coverage](https://www.icy-veins.com/wow/news/blizzard-relaxing-more-addon-limitations-in-midnight/) — Secret Values (MEDIUM)
- [C_ChatInfo.SendAddonMessage](https://warcraft.wiki.gg/wiki/API:C_ChatInfo.SendAddonMessage) — limits and the 12.0.0 lockdown result code (MEDIUM; wiki under maintenance)
- [C_QuestLog.IsUnitOnQuest](https://warcraft.wiki.gg/wiki/API:C_QuestLog.IsUnitOnQuest) — who-has-the-quest API history (MEDIUM)
- Local code read: `Modules/InfoStrip.lua`, `InstancePrep.lua`, `DataBars.lua`, `QuestLog.lua`, `QuestAuto.lua`, `QuestTracker.lua`, `AutoAccept.lua`, `Windows.lua`, `WindowsTown.lua` (HIGH)
- UI polish section: author experience of mainstream addons, not sourced (LOW-MEDIUM)

---
*Feature research for: levelling and group-play helpers on a WoW: Forever UI suite*
*Researched: 2026-10-09*
