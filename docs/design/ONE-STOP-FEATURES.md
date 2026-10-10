# Research: features that make Vanguard the one-stop addon for WoW Forever

Written 2026-10-10 against commit `b032e6f` (v0.5.0), from public information listed at the end. Nothing here has been
verified in a Forever client. The feature numbers (1 to 17) are the ones the GitHub issues use.

Vanguard should define "one-stop shop" as the complete **non-combat Forever journey** (levelling, professions,
economy, group-forming, raid prep) in one coherent UI that skins the game's combat tools and coexists with the
standalone addons players already run. It should not try to replace standalone damage meters, boss mods or aura-trigger
frameworks. Forever shares Mainline's UI architecture and the Midnight addon restrictions, so features that compute on
live combat data are display-only at best. Established UI suites already cover the broad HUD; Vanguard's lane is where
players are underserved: auction and economy tooling, vendor and cross-character memory, quest and levelling aids, and
group-forming in a game with no Dungeon Finder. The five do-first items are a **settings-loss guard**, a
**ruleset-safe data-key audit**, **client-data quest guidance with a "new Forever quest" mark**, a **coexistence
manager** and a **chat-based LFG board**.

Evidence is thin: no direct player statements were reachable, so demand is inferred from what addon authors build,
download counts and issue titles. Counts below are lifetime totals from roughly four weeks of beta.

## Why breadth outside combat beats parity inside it

- **The restrictions are fixed.** Blizzard says Forever uses the Midnight rules and does not want addons to have "too
  much power and control". Tainted code can store and format secret values but not compare or compute on them.
- **The HUD is already well served** by established suites with Forever builds.
- **No suite bundles the Forever-native reference tools** (dungeon reference, talent planning, levelling, quest data);
  guides still recommend several separate specialist addons beside a UI suite. That this leaves a gap is an inference
  from feature lists, not a measured finding. Guides also tell players to pick one main UI suite and one bag addon, so a
  suite must behave well next to what players run.
- **Where players pull:** the biggest Forever-only addons are a classic-look UI skin (about 87K downloads, a listing
  that also covers Retail), a levelling guide (about 49K), two quest-marking addons (about 33K and 29K) and a trainer
  helper (about 26K). Economy addons sit in the tens to low thousands, which suggests an unmet but unproven need.
- **A possible moat for healers:** the healing-grid and click-casting addons players know had no confirmed Forever
  build, and some were reported broken on an early beta build. If Vanguard's raid frames and click casting work on a
  real client, that matters, subject to the secure-snippet bug noted below.

The ranking weighs five factors: number of independent sources, Vanguard's gap, effort, restriction risk and data risk.
It is judgement, not measurement. Effort: S under a week, M one to three weeks, L longer (solo developer, estimated).
"Check" means in-game verification is required. The earlier design lessons in `docs/design/UX-LESSONS.md` (relationship
movers, hardened profile strings, harness secret modes, first-run window) still stand and are not repeated.

## Tier 1: do first (before and just after the Nov 4 launch)

| # | Feature | Evidence | Have → gap | Effort / tech risk | Data / licence | Check |
|---|---|---|---|---|---|---|
| 1 | **Settings-loss guard.** Detect a blank DB at login, say so, offer one-click restore from an export string, prompt to export after setup. | 6 independent reports: a Blizzard forum thread, two workaround addons, a guide and two addon pages' comments. | Export/import exist; README admits memory is lost between sessions. No detection. | S / low. Whether an addon can stop the logout overwrite is unverified. | None | Yes, first |
| 2 | **Ruleset-safe data keys.** Audit realm+faction keys (prices, sales ledger, characters, vendor memory); add the ruleset where the client exposes one; handle two-part names. | Rulesets replace realms, no cross-ruleset play; names are two-part; auction house scope unconfirmed. | Keyed by realm and faction → may merge or split data. | S–M / low | None | Yes |
| 3 | **Quest guidance from client data.** "New Forever quest" mark in dialog, log, tracker; quest-start pins on the map; arrow to the next waypoint of a tracked quest. | 7 sources on quest and levelling demand; quest-marking addons at about 33K and 29K downloads; a [NEW]-tag addon; the same icon requested in a popular quest addon's tracker. | Dialog, log, tracker, `/way` exist → no new-quest flag, no pins. | M / low: `GetQuestsOnMap` and `GetNextWaypoint` are listed for Forever 1.60.1. | **High for the new-quest list.** Community quest databases are GPL-licensed; don't use them. | Yes |
| 4 | **Coexistence manager.** At login, detect popular quest, waypoint, bag, nameplate, meter, action bar and levelling addons; offer (never force) to switch off the overlapping Vanguard module. | 4 conflict signals between UI skins, action bar, bag and levelling addons in beta issue trackers; guides' "pick one" advice. | Defers to Questie's tracker, another addon's `/way`, Masque → no general detector. | S–M / low | None | Yes (folder names) |
| 5 | **Chat-based LFG board.** Parse LFM/LFG lines into a list by dungeon, role and level; a click opens a whisper template. No auto-send. | No Dungeon Finder; manual chat and LFG. Chat tools draw the most addon traffic (about 40K and 83K downloads for two chat addons); the known LFG parsers list other game flavours only. | Chat watch alerts on phrases → no structured list. | M / low-moderate: chat is hidden from addons in instances, fine in cities. | None | Yes (events, two-part names) |

Items 1 and 2 are hygiene, but they decide whether launch week is "it just works" or "it ate my settings". Item 3 is the
best-evidenced feature: the only open question is where the new-quest list comes from. The clean options are a flag the
client exposes, a list extracted from your own install with a CREDITS note (Blizzard's terms were not researched), or
opt-in crowdsourced observation. Item 5 keeps a human click on every whisper because the restrictions reportedly
target communication automation.

## Tier 2: next (November to the Dec 9 raids)

| # | Feature | Evidence | Have → gap | Effort / tech risk | Data / licence | Check |
|---|---|---|---|---|---|---|
| 6 | **Spell progression.** Rank-aware bars (notice an old rank, swap out of combat) plus "trainer memory": what each trainer teaches and at what level, like Vendor memory. | 4 projects around spell ranks and trainers (one trainer helper at about 26K); Blizzard rebalanced ranks Oct 8; the game's Cooldown Manager lists each rank separately. | Click-cast rank picker, Train all → no bar notice, no preview. | S–M / low (bar edits out of combat only). | Memory from the client: none. Don't ship community downrank numbers; they are derived and still moving. | Yes |
| 7 | **Dungeon card.** Grow Instance prep into a per-dungeon card: level range, dungeon quests from your own log, keys. Full loot and quest database stays out. | 6 listings (3 guides, 3 addons). | Supply check only → no content reference. | M / low | **High for a full database:** community databases are GPL and include material with unclear copyright; loot info is hidden until discovered. | Yes |
| 8 | **Crafting queue and cooldowns.** Persistent queue, profession cooldown tracker, gold-per-hour ranking from existing costs and disenchant data. | A few small profession and economy addons (73 to 2,344 downloads); 600+ new recipes. | Crafting costs, Restock, Keep stocked → no queue or cooldowns. | M / low; profession APIs on Forever unchecked. | None | Yes |
| 9 | **Raid readiness.** Flasks, food, weapon enchants, raid-buff coverage and world-buff reminders on the ready-check card. | Thin: officer tools are all "untested" in beta guides; first raids Dec 9; no raid testing in beta. | Instance prep covers ammo, reagents, food, durability → no buff checks. | M / low out of combat; in-combat aura reads reportedly throw. | Hand-written lists | Yes, after Dec 9 |
| 10 | **Group threat view.** Party list or tank view, only if values are readable. | 4 sources plus several listings by title; two Forever threat meters (about 16K and 14K) and a suite's threat window exist. | Own-target threat % → no group view. | M / **high until tested.** | None | **Gate** |

Item 6 is the cheapest Forever-native differentiator; since auto-uprank already exists elsewhere, lead with trainer
memory. Item 10 is the one combat-adjacent bet: build nothing until the threat test below is done.

## Tier 3: later or conditional

| # | Feature | Evidence | Have → gap | Effort / tech risk | Data / licence | Check |
|---|---|---|---|---|---|---|
| 11 | **Legacy tracker and 16-point planner** (65 challenges). | System confirmed by Blizzard; only web tools exist. No addon-demand evidence. | Legacy window reskinned only. | M–L / unknown: data source not found. | Write the list by hand | Yes |
| 12 | **Post-fight recap** from the game's damage meter: interrupts, dispels, deaths, damage taken; chat report out of combat. | Meter demand across 6 sources, but the game's meter and standalone meters cover most of it. | Fight-history sparkline → no recap. | S–M / medium: values secret in combat. | None | Yes |
| 13 | **Classic-look theme variant** alongside Slate & Brass. | Blizzard leaves a classic UI to addons; a classic-look skin is the most-downloaded Forever-only UI addon. | "Like the game's" layout only. | L / low | Own art only; never Blizzard assets | Yes |
| 14 | **Mail tools:** search and filter the inbox, send-to-alt presets. | 1 project. | Mail reskin and ledger parsing. | M / low | None | Yes |
| 15 | **Boat and zeppelin timers**, learned like flight times. | 1 small project (67 downloads). | Flight timer exists. | S / low | Crowd-learned | Yes |
| 16 | **Cooldown Manager gap-filler:** items, pets, Healthstone, totems. | The game's list is incomplete, per one guide. | Reskin only. | L / high: one addon's "instant mode" already taints. | None | Yes |
| 17 | **Officer and loot tools:** roll tracker, roster, soft-reserve. | Untested category; guild bank unconfirmed. | Loot windows reskinned. | L / medium: addon messages restricted in instances. | None | After Dec 9 |

## What the game and established addons already cover

Don't propose these. **The game:** Edit Mode, click casting, a Personal Resource Display, combined bags, a damage meter
and a Cooldown Manager (the manager off by default and still adding classes, per a guide). **Established suites' Forever
additions:** threat window, flight timer, heal and spell-cost prediction, faction indicators, level-difficulty colours,
dispel-type borders, character-sheet stats, pet power bar and happiness, a five-second-rule spark and auto-uprank.
**Vanguard already has** pet happiness, the five-second spark, threat %, flight timer, swing timer, XP/hour, talent
planner, the auction suite and the quest UI, so none of those belong on the list.

**Standalone specialists players already run** (quest maps and waypoints, map notes, levelling routes, bags, auction,
nameplates, meters, boss mods) mostly have Forever builds. Vanguard should interoperate with them, as its
Auctionator-compatible API and list import, Questie coexistence, `/way` hand-off, boss-mod docks and Masque support
already do, not out-feature them. Item 3 uses only client data and leaves Questie's pins and tracker alone when Questie
is loaded, as Vanguard's tracker already does.

## Blocked or risky features and the clean alternative

| Feature | Why it is blocked or risky | Clean alternative |
|---|---|---|
| Combat-log parsing (meters, hazard alerts) | Registering combat-log events errors since 12.0.0; `CombatLogGetCurrentEventInfo` reportedly absent on Forever. | Skin and read the game's damage meter; recap out of combat (item 12). |
| Aura-trigger frameworks, rotation helpers | Not available on Forever; combat triggers reportedly never fire. | Display-only trackers that pass duration objects to the game's widgets; out-of-combat checks; reskin the game's manager. |
| Threat | Sources conflict (see below). | Own-target % today; group view only after the test. |
| Automatic AH posting, buying, cancelling | Blizzard's limits: addons prepare each action for one click. | Keep Vanguard's rule: it never posts, buys or cancels. |
| Community quest and loot databases | GPLv3, and some include material with unclear copyright. | Client APIs, trainer- and vendor-style memory, your own extracts with credits, opt-in observation, original content. |
| Live interrupt tracker, instance assignment sync | Interrupt restriction predicted but unconfirmed; addon messages restricted in instances. | A personal "your kick is ready" icon; the meter's interrupts after the fact. |

Also defer: Hardcore tooling (Blizzard says winter, not launch), accessibility modes (no evidence either way), and a
load-on-demand module split (nothing shows Vanguard's users want it; modules already toggle). Stay free: Blizzard's
addon development policy requires addons to be free and bars in-game ads.

## Open questions and the in-game test that resolves each

| Question | Conflict in the research | Test |
|---|---|---|
| Are SavedVariables fixed? | One workaround author says 1.60.1 loads settings again; another addon reported a vanished window after the October update; Blizzard has not replied. | Change a Vanguard setting, exit the game (not `/reload`), relog; repeat for per-character data, and again on the launch build. |
| Does Forever's group finder list premade groups? | One source: the LFG window only organizes; another: you post and browse listings by role; a suite dropped retail features because the finder "has no premade group list". | Post a listing on one character and search from another; dump `C_LFGList` activities and results. Decides whether item 5 is chat-only or a hybrid. |
| Can threat work in combat? | A developer kit and one guide say threat is hidden; a Forever threat meter ships using `UnitDetailedThreatSituation`; the wiki tags that call secret-when-restricted with no combat rule stated. | In open world, a dungeon and a boss pull, print `C_Secrets.ShouldUnitThreatValuesBeSecret()` and test `issecretvalue` on the returned values, with a tank in the party. |
| What does ruleset do to data keys? | Realm and faction keying assumes realms; Forever has none; AH scope unconfirmed. | Print realm APIs on characters in two rulesets; compare AH data and name formats; check whisper toasts with two-part names. |
| Which build, and when? | Launch is Nov 4 at 3 pm PST, but one outlet's metadata says Nov 5; beta ends Oct 21 or 22; the "Camelot" TOC naming is expected to change. | Confirm against Blizzard's own post, then run `docs/SMOKE-TEST.md` on the last beta build, the launch build and before Dec 9. |
| Do the secure-snippet and aura reads work? | One tester reports missing `loadstring_untainted` on build 69893 (`WrapScript` throws); Vanguard falls back, but unverified. | Run click casting, hover keys and bar paging on the current build; `/vg status`. |
| Does the client expose a new-quest flag, Legacy data or trainer lists? | No source says. | Dump quest and Legacy frame data sources; open a trainer and read what it lists. |

## Conclusion

The research changes the question from "what features are missing" to "what can be trusted at launch". The two
cheapest items, a settings guard and a data-key audit, protect what Vanguard already has, and the most defensible new
work is quest, spell and group tooling built on data the client gives you, where players are served by one-author
addons and the restrictions do not bite. Combat features should wait for the threat and snippet tests. The weakest
link is evidence, not engineering: a short alpha with 10 to 20 Forever players, and the first week of launch, would rank
this list better than more desk research.

## Sources

Blizzard and the game: [Blizzard forum, settings wiped](https://us.forums.blizzard.com/en/wow/t/2353992),
[spell rank adjustments](https://us.forums.blizzard.com/en/wow/t/we-have-adjusted-spell-ranks/2376654),
[addon development policy](https://us.forums.blizzard.com/en/wow/t/ui-add-on-development-policy/24534),
[Legacy news](https://news.blizzard.com/en-us/article/24307383/).
Warcraft Wiki: [Secret Values](https://warcraft.wiki.gg/wiki/Secret_Values),
[12.0.0 API changes](https://warcraft.wiki.gg/wiki/Patch_12.0.0/API_changes),
[GetQuestsOnMap](https://warcraft.wiki.gg/wiki/API_C_QuestLog.GetQuestsOnMap),
[GetNextWaypoint](https://warcraft.wiki.gg/wiki/API_C_QuestLog.GetNextWaypoint),
[C_DamageMeter](https://warcraft.wiki.gg/wiki/API_C_DamageMeter.GetCombatSessionFromType),
[UnitDetailedThreatSituation](https://warcraft.wiki.gg/wiki/API_UnitDetailedThreatSituation).
Press about Forever's systems: [Icy Veins, Blizzard on addons](https://www.icy-veins.com/wow-forever/news/addons-in-wow-forever-blizzard-devs-just-addressed-the-big-question/),
[Icy Veins, rulesets](https://www.icy-veins.com/wow-forever/news/rulesets-replace-realms-in-wow-forever-heres-how-it-works/),
[Icy Veins, Legacy](https://www.icy-veins.com/wow-forever/news/everything-on-the-wow-forever-legacy-system-account-wide-progression/),
[Warcraft Tavern, no group finder](https://www.warcrafttavern.com/forever/news/no-group-finder-or-summoning-stones-in-wow-forever/),
[Warcraft Tavern, classic UI left to addons](https://www.warcrafttavern.com/forever/news/classic-ui-options-will-be-left-to-addons-in-wow-forever/),
[Warcraft Tavern, beta](https://www.warcrafttavern.com/forever/guides/beta/),
[MassivelyOP](https://massivelyop.com/2026/09/15/wow-forever-discusses-classes-addons-party-forming-pvp-progression-and-how-it-effectively-negates-wow-2/),
[PC Games Hardware, Hardcore](https://www.pcgameshardware.de/WoW-Forever-Spiel-78891/News/Forever-mit-Hardcore-Modus-1553823/),
[Gamewave](https://gamewave.fr/world-of-warcraft-forever/wow-forever-les-restrictions-d-addons-de-midnight-seront-aussi-appliquees/),
[Kami Labs, addon restrictions](https://kami-labs.fr/en/wow-classic/wow-forever-addons-restreints-comme-sur-midnight/),
[TimeSaver, LFG](https://timesaver.gg/blog/wow-forever-lfg-tool-dungeon-finder),
[AccountShark, economy](https://accountshark.net/blog/wow-forever-economy-launch-professions-gold),
[Guild Order, recruiting without a realm list](https://guildorder.com/games/wow_forever/wiki/recruiting-without-a-realm-list),
[Mobalytics, UI settings](https://mobalytics.gg/wow-forever/guides/ui-settings-guide),
[built-in UI guide](https://wofwforever.com/en/guides/wow-forever-built-in-ui-setup/),
[developer guide](https://wowforeverguides.com/addons/developers),
[downranking data](https://foreverchanges.pro/downranking).
Local: Vanguard `README.md` and `docs/design/UX-LESSONS.md`.
