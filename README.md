# Vanguard

<p align="center"><img src="art/brand/vanguard-crest.svg" width="180" alt="Vanguard's crest: two swords crossed behind a brass shield that bears a V"></p>

> **Formerly ForeverUI.** Renamed in 0.4.0 because another, unrelated addon called ForeverUI is published on CurseForge and Wago, and two addons with the same folder name overwrite each other. The slash commands are now `/vg` and `/vanguard`. Settings don't carry over by themselves (the saved-settings file is named after the addon): before updating, type `/fui export` in game and keep the string; after updating, `/vg import` it (old ForeverUI strings import fine). Then delete the old `Interface/AddOns/ForeverUI` folder.
>
> **Not yet checked in the game.** Most of what follows is written from the code and the headless test harness; [docs/CHANGELOG.md](docs/CHANGELOG.md) and [docs/SMOKE-TEST.md](docs/SMOKE-TEST.md) say what has been seen working in the client.

A from-scratch UI suite for WoW Forever (the 12.1 engine with vanilla content; the TOC declares Interface 16001 for Forever, 120105 for the 12.1.5 client and 120007).
Written from scratch. It contains no code, art or fonts from other UI addons. It bundles three small shared libraries, unmodified, in `Libs/`: LibStub, CallbackHandler-1.0 and LibSharedMedia-3.0, which addons use to share fonts and bar textures (see Credits).

## Install

Download `Vanguard-<version>.zip` from the [latest release](https://github.com/clifftaylor2325/wow-vanguard-ui/releases/latest) and unzip the `Vanguard` folder into `World of Warcraft/_retail_/Interface/AddOns/` (your Forever client's AddOns folder).

## First steps

The first time you log in, a short setup wizard asks for a layout, sizes for your screen and a look; `/vg setup` runs it again. After that, `/vg` (or the addons button by the minimap) opens the options window, where every part has its switches, and `/vg help` lists every command. [Getting started](docs/GETTING-STARTED.md) is the short guide for players.

## What's in it

One page per area, each with everything that part of Vanguard does:

- [Look and theme](docs/features/look-and-layout.md): the theme, the centered layout, text size, theme variants, corners, shield corners, the faction look and the AFK screen.
- [Unit frames and nameplates](docs/features/unit-frames.md): unit frames, combat timers, readouts, auras and cast bars, your buffs, nameplates, main tank frames, party pets and group threat.
- [Raid frames and click casting](docs/features/raid-frames.md): raid frames built for healers, click casting and the raid tools.
- [Action bars and cooldowns](docs/features/action-bars.md): action bars, and Vanguard's additions to the game's Cooldown Manager.
- [Game windows and extras](docs/features/game-windows.md): the game's own windows in Vanguard's look, the game's extras tidied away, the game's tools, Quiet the game and Auto-accept.
- [Combat tools](docs/features/combat-tools.md): boss mod docks, fight history, Vanguard's meter, the roll tracker and the officer loot tools.
- [Chat](docs/features/chat.md): the chat window and its extras: watch, filter, history, windows, tabs, search, bubbles and the group board.
- [Map, minimap, bags and more](docs/features/map-and-minimap.md): XP and reputation bars, the square minimap, bags and the rest of the everyday HUD, the strip under the minimap, the broker strip, the minimap drawer and waypoints.
- [Quests](docs/features/quests.md): the quest dialog, tracker, log, history, guidance, arrow, minimap spots and automation.
- [Town and gear](docs/features/town-and-gear.md): crafting, mail, pets, the character sheet, other characters' items, gear upgrades, merchants, spell ranks, errands, instance prep, the talent planner and Legacy.
- [Auction house](docs/features/auction-house.md): the auction helper, deals, upgrades, price alerts, disenchant values, the sales ledger, crafting costs and prices for other addons.
- [Options and setup](docs/features/options-and-setup.md): the options window, other addons, the first-run setup, the settings guard, What's new, situations and presets for other addons.

The commands are in [docs/COMMANDS.md](docs/COMMANDS.md), and other addons can use [Vanguard's API](docs/API.md).

## What the client hides

Every client call is checked before use, and values the client hides from addons go to the bars unread. Auras use the client's own aura containers where it has them (12.1 and WoW Forever), so icons, stacks, timers and debuff colors keep working while it hides aura values in instanced combat; if the client refuses one of those containers, Vanguard switches to its own icons for the rest of the session (it says so in `/vg errors`); on those icons, an aura filter word the client doesn't know (say crowd control) is dropped for the session, and it is listed in `/vg errors`; `/vg status` shows which aura backend is in use, which optional client calls were found and which add-on restrictions the game has on (Combat, Encounter, ChallengeMode, PvPMatch, Map, Chat; chat watch, the chat filter, web links in chat, the group board and the quest arrow and minimap marks skip their work while theirs is on). If the client can't compile secure snippets (a WoW Forever beta bug), Vanguard says so at login and in `/vg status` and turns hover keys off; mouse click-casting still works, bar 1 still pages with stances, forms and Shift+number (through the game's own page attribute rather than a snippet), and the raid and main tank tiles are set up without one. None of this has been checked in game yet: please report what breaks.

## More docs

- [docs/README.md](docs/README.md): every doc, by who it is for.
- [docs/CHANGELOG.md](docs/CHANGELOG.md): what changed in each release.
- [docs/SMOKE-TEST.md](docs/SMOKE-TEST.md): the in-game checklist for testers.
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): building, testing and releasing from a clone.

## License

Copyright (c) 2026 Cliff Hearthvale. All rights reserved. You may download Vanguard and use it in your own game client; copying, modifying, redistributing or selling it, in whole or in part, needs the copyright holder's written permission. See `LICENSE`. Releases up to and including v0.4.0 were published under the MIT License, and copies of those releases stay available under its terms.

Third-party files keep their own licenses. The fonts: `Media/Fonts/FiraSansCondensed-*.ttf` are Fira Sans Condensed (Copyright 2012-2015 The Mozilla Foundation and Telefonica S.A.) under the SIL Open Font License 1.1, in `Media/Fonts/OFL.txt`; Vanguard ships them trimmed to Latin, Greek and Cyrillic, with the digits pointing at the font's tabular figures. The libraries in `Libs/` keep their own licenses (below); Vanguard's code only calls them, and LibSharedMedia-3.0 ships unmodified with its license text beside it, as the LGPL allows. The faction crests and the options nav and minimap icons are CC BY 3.0 (below).

## Credits

- Fira Sans Condensed, Cinzel and Metamorphous: SIL Open Font License 1.1 (licenses in `Media/Fonts`).
- LibSharedMedia-3.0 by Elkano, revision 151 (minor 8020003), from the WowAce project https://www.wowace.com/projects/libsharedmedia-3-0: GNU LGPL 2.1 (`Libs/LibSharedMedia-3.0/LICENSE.txt`).
- CallbackHandler-1.0 (minor 8) and LibStub (minor 2) from Ace3, https://github.com/WoWUIDev/Ace3 (the Ace3 project's own repository): CallbackHandler-1.0 under the Ace3 BSD-style license (`Libs/CallbackHandler-1.0/LICENSE.txt`); LibStub is public domain (stated in `Libs/LibStub/LibStub.lua`).
- Faction crests "Crossed swords" and "Crossed axes" by Lorc, from game-icons.net, CC BY 3.0 (`Media/Art/CREDITS.txt`; all sources in `art/CREDITS.md`).
- Options nav and minimap icons by Lorc, Delapouite and Sbed, from game-icons.net, CC BY 3.0 (`Media/Icons/CREDITS.txt`; all sources in `art/CREDITS.md`).
- OpenMap by jiforever (CurseForge project owner jigrobbulus), https://www.curseforge.com/wow/addons/openmap: an optional companion addon. Vanguard works alongside it when it is installed and holds none of its code, data or art.
