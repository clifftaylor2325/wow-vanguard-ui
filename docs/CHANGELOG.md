# Changelog

What changed for players in each release, newest first. In game, the same notes are the What's new window (`/vg whatsnew`), written in `Core/WhatsNewNotes.lua`; the website's release notes are written from this file's sections. Items marked *(off)* start switched off.

Nothing here has been checked in the game by the people who wrote it down: see the batch checklist (issue #284) and [SMOKE-TEST.md](SMOKE-TEST.md).

## 0.7.0

Nothing in this release has been checked in the game; see the batch checklist (issue #284).

### Questing

- An on-screen arrow points to the nearest quest objective, and on to a quest on another map.
- Quest spots show on the minimap, quest mobs get a mark on their nameplate, and the quest log shows XP to your next level.
- Quests can be tracked automatically, shared quests can be accepted from your group (off by default), and quest history is kept for your whole account.
- In the quest log, Ctrl-click marks quests and Abandon takes all the marked ones.

### Chat

- Chat windows keep their lines across reloads and logins.
- Gold selling, boosting, recruiting and repeated lines go to a Filtered tab instead of your chat.
- A choice of chat window size, a bigger default window, a softer backdrop and readable tabs.

### Bags and town

- You can make your own categories in the combined bag.
- The merchant window has a sell list, Sell all of one item, and Stack and Max buying; mail has Take all and Return all.
- /vg alts shows an overview of your characters, also on the Game windows page.
- The auction house tabs and panels are in the Vanguard look, and a failing part no longer stops the rest.

### Unit frames and HUD

- A Versus deck joins the player and target frames, with shield corners on unit frames and cast bars.
- Calm HUD dims your frames out of combat, and a low-health screen-edge vignette warns you in a fight.
- A cursor ring and an interrupt-ready mark on cast bars; an eating, drinking and missing-buff chip on your frame.
- /vg graphics checks your computer, screen and frame rate and suggests settings; /vg graphics apply sets them and undo puts them back.
- Raid frames show three indicator icons from the game's aura filters.

### Cooldown Manager

- The Cooldowns page has the Cooldown Manager's settings and a setup wizard, and key text shows on its icons.

### Rolls, gear and info

- The roll tracker reads the loot list from Forever's encounter loot history.
- The info strip shows ammo when the game says your ranged weapon needs it.

### Look and windows

- Many more game windows are in the Vanguard look: the spellbook, guild, social, map, group finder, Legacy, calendar, Edit Mode, keybindings and the Lua error window.
- One selected look and one press state for rows, tabs, sliders, scroll bars and buttons across the options and game windows; buttons light only while the mouse is over them.
- The game's remaining arrow art is skinned, and /vg errors opens a copy window.

### Safety and tools

- Saved data is size-checked: Vanguard trims the oldest price data if the game says the file is too large.
- /vg perf reads the game's addon profiler, and /vg perf slow names Vanguard's slowest handlers; /vg mem reads memory after a garbage collection.
- /vg probe runs a batch of checks and /vg prep buffs checks the buff names, for reporting back what Forever does.
- When another addon (EllesmereUI's unit frame, action bar, nameplate and raid frame addons) does a job a Vanguard module does, chat says so once.

## 0.6.0

### New features

- **Cooldown gaps** *(off)*: a row for on-use trinkets, items, spells you choose, your pet's abilities and totems (`/vg gaps add`, `/vg gaps spell add`), and the Cooldown Manager's cooldowns in the Vanguard look.
- **Vanguard meter** *(off)*: a damage and healing meter in the Vanguard look (`/vg meter`), per second, in combat too. `/vg fights` lists your DPS per fight, and `/vg recap` summarises the last fight (interrupts, dispels, damage taken, deaths).
- **Raid indicators**: up to three small icons down each raid tile's right edge for an external defensive, big defensive, important buff, one of your buffs, crowd control or a debuff you can dispel (Indicator 1 to 3 under Raid frames, after a reload).
- **Roll tracker**: the group's `/roll` results and loot rolls in one list (`/vg rolls`).
- **Levelling helpers**: the XP a quest gives on the tracker, an XP bar tooltip and a warning when supplies run low.
- **Group board**: looking-for-group posts from chat by dungeon, role and level (`/vg lfg`).
- **Group threat** *(off)*: who in your group has the most threat on your target; it hides while the game hides threat values.
- **Officer loot tools** *(off)*: a soft-reserve list and a group roster (`/vg loot`).
- **Other addons**: when another addon does a job a Vanguard module also does, chat says so once and the Modules page lets you pick one.
- **Legacy system**: `/vg legacy probe` and a perk planner *(off)* within the tree's 16 points.

### Auctions, town and gear

- The auction house tabs are **Lists** and **Posting**. Posting has a step guide, names the game's answer when a post fails, asks for a second click when the game wants confirmation, and a bag click keeps you on Posting. Lists has Deals, Upgrades and Recent, with duplicates removed.
- **Stat weights wizard** (`/vg weights wizard`): a slider and an exact-value box for every stat; gear and auction upgrades are judged by them.
- **Craft queue** *(off)* (`/vg craft`): queue recipes, see profession cooldowns across characters, rank the recipes that pay best.
- **Mail tools** *(off)* (`/vg mail`): search and filter the inbox; presets fill Send Mail for your alts.
- **Instance prep**: buff checks *(off)* and a dungeon card *(off)* on the checklist; **wanted amounts** window (`/vg prep setup`).
- **Spell ranks** *(off)*: chat says when a bar holds an older rank (`/vg ranks`); trainers you visit are remembered (`/vg trainers next`).
- **Trainer**: a Train all button learns everything you can afford in one click.
- **Boat and zeppelin timer** *(off)*, learned from your own rides.

### Quests and map

- Quest-start pins on the world map and Shift-click a quest to point the arrow at it.
- Quest tracker: click +N more to show up to 10 watched quests, and the choice is remembered; it starts below the info strip and sits under the game's windows.
- Quest history: the quest dialog and quest log say which of your characters last turned a quest in ("Done on Thrall-Forever · 3 days ago"), and `/vg quests history [n]` lists the latest turn-ins.
- Nameplates: the quest "!" now also shows when the unit's tooltip data lists one of your quests, using Vanguard's own mark, and repaints once a frame as your quests change.
- Quest log: Track and Untrack update at once, Shift-click tracks, reward cards show the item tooltip.
- World map: quest zone headers use a gold chevron.

### Raid and groups

- Raid, party and party extras default to the left of your character; a raid of 25 or 40 stacks its groups as rows at the left, where healers keep it; a party or a raid of 10 stays over your player frame.
- Raid frames pin to their spot's side after a reset, a drag or a nudge, and refit after combat.
- Role presets (Healer, Damage, Tank) set the raid frame, raid aura and nameplate settings, and any addon can offer more (`/vg preset`).
- Nameplates: the Nameplates page has the game's Enemy and Friendly switches (enemy plates on by default); Vanguard dresses both alike, and `/vg plates` says what it drew.

### Look and themes

- **Eight looks**: Slate and brass (default), High contrast, Vellum and ink, Classic look, Midnight, Obsidian, Moss and Ash and ember, each square or rounded (`/vg variant`, `/vg corners`).
- Buttons, switches and sliders have hover, press, disabled and keyboard focus looks; panels have depth; accent colours jade, orchid and copper join brass and arcane; a Color assist switch makes states readable without red versus green.
- Window ornaments *(off)*, a gradient *(off)*, sharper menu icons *(off)*, and two side-by-side tests *(off)*: `/vg slug` and `/vg framebuffer`.
- Vanguard's crest is the addon's icon and the options window's header.
- **Look**: Vanguard's windows now share one title, close button and Escape (a question's X and Escape mean No), one thin scroll thumb with no arrows (the game's own scroll bars too), small grey capitals for section headings (the bags' lost their accent), one accent bar for the chosen row, Vanguard's own ! and ? marks on quest lines, accent buttons and segments that follow rounded corners, and one set of paddings, heights and window opacities. General's captions are nouns, the options preview shows your own name and Vanguard's crest, and the minimap's zone name keeps its font with Faction look on.
- Disabled and hint text is a little brighter, so it stays readable on every look, even over a bright world.

### Windows and options

- Every game window gets the flat Vanguard panel, including the spellbook, PvP and the calendar; windows drag by an empty spot on the top edge; window buttons sit on a faint tile.
- The info strip shows day, date, time and a calendar button.
- The options are split into pages (Game windows, Combat tools, Town and gear, and more); Escape closes the window; switches and sliders are larger and wrap long captions.
- Profiles: export or import in parts, restore settings the game lost, and anchor one frame to another when you move frames; Exit without saving puts everything back.

### Fixes

- Menu bar buttons take clicks while the game's new indicator shows above them.
- Bags: Sort is no longer under the backpack icon, and items drag again.
- Guild panes, calendar filters, the spellbook title and the map's buttons sit where they should.
- Click-casting spell and key pickers open above their click catcher.
- An error in a hook, a button click or a timer is kept in `/vg errors` and doesn't stop the others.

### Memory

- The auction price history keeps 7 days per item instead of 30, a scan keeps the cheapest gear link per item, and old chat alerts are swept.
- No strings are built for every chat line, and `/vg mem` watches Vanguard's memory for a minute and says whether the low point rose.
