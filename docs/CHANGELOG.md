# Changelog

What changed for players in each release, newest first. In game, the same notes are the What's new window (`/vg whatsnew`), written in `Core/WhatsNewNotes.lua`; the website's release notes are written from this file's sections. Items marked *(off)* start switched off.

Nothing here has been checked in the game by the people who wrote it down: see the batch checklist (issue #284) and [SMOKE-TEST.md](SMOKE-TEST.md).

## 0.8.0

Nothing in this release has been checked in the game; see the batch checklist (issue #284).

### Keys (0.8.0)

- A Your keys tab on the Action bars page draws your keyboard and mouse and shows what every key does, with the Shift, Ctrl and Alt keys on their own tabs.
- On WoW Forever, Set up keys (on the Your keys tab) suggests keys for your class and role, shows every change on the keyboard and lists it with a tick box before anything moves, and can put your old keys back.
- Place new spells as I learn them puts each spell you learn, and each spell that replaces an old one, on its key for you.

### Click casting (0.8.0)

- On WoW Forever, the Click casting page has starter layouts for every class, with two healer layouts for priests, druids, paladins and shamans, and an Undo.
- Click casting keeps a list for each talent group on WoW Forever.
- A binding the game's own click settings won't run is marked on the grid, and an older list with the unit menu on Middle click gets a notice with Swap them.

### Calm HUD (0.8.0)

- Calm HUD quiets the whole HUD out of combat, not only the unit frames: on the General page's Calm HUD card each part dims, hides until the mouse is over it, or is left as it is.

### Fixes (0.8.0)

- Fixes from two hunts on the game's own windows and HUD pieces: text left in the game's parchment colours, art the game shows again on hover, raw bar colours, the spellbook and achievements windows, and the Calm HUD on frames the game keeps from add-ons.

## 0.7.5

Nothing in this release has been checked in the game; see the batch checklist (issue #284).

### Language (0.7.5)

- Vanguard's own text shows in your client's language: German, French, Spanish, Italian, Brazilian Portuguese, Russian, Korean and Chinese. The translations are machine-drafted, so report a wrong line with /vg feedback. Commands and these notes stay English.

### Options and look (0.7.5)

- Options pages show their cards as tabs, so the long pages fit one screen; Reset this page sits beside the page title.
- Every module switch says Reload to apply, and searching for reload finds them.
- A Panel texture choice (General, Look) draws a texture over every floating window; Flat is the default.
- The Feedback page has a Community card with Vanguard's Discord and X links to copy.
- Clearing loot reserves, a talent plan or saved chat asks first.

### Fit and layout (0.7.5)

- Text fits its buttons, menus and windows at any text size and in longer translations.
- On narrow or short screens, default frame spots move just enough to stay on screen and clear of each other; wider screens are unchanged.

### Fixes (0.7.5)

- Fixes from two bug hunts, a clean-code review and twelve stability hunts across combat, frames, chat, quests, bags, the auction house, mail, profiles and options.

## 0.7.4

Nothing in this release has been checked in the game; see the batch checklist (issue #284).

### Credits (0.7.4)

- The Map page's OpenMap card credits OpenMap's author, jiforever (jigrobbulus on CurseForge), and the README's credits list OpenMap.

### Action buttons (0.7.4)

- Long key names are short on the buttons (Caps Lock Cap, Page Up PU, Insert Ins, Delete Del) and stay on one line.
- A button holding an item you wear gets a thin green ring, and the keybind banner repeats your last bind and has a Done button.

## 0.7.3

Nothing in this release has been checked in the game; see the batch checklist (issue #284).

### Options and windows

- The Options window is taller, its changed dot names the default, the Modules page explains modules with their own switch, and search finds more.
- The Other addons card lists Forever add-ons and keeps answers you can change later; the addons button explains itself.
- The unlock bar explains itself and leads back to the options, and Situations gets a Your situations card.
- Reset puts moved windows back, and five more game windows can be dragged.
- The errors window has Report a bug and Clear buttons, and the AFK screen steps aside when something needs you.
- A destroy popup shows its confirm button in the danger colour.

### Unit frames, bars and plates

- Unit frames show tooltips on hover, grey for tapped mobs, a Ghost label, raid marks and quieter threat.
- The pet has a cast bar, and nameplates can show health numbers.
- The swing timer dims when you are out of reach and turns on by itself for every class that swings.
- Buff settings live on the Unit frames page, and the Cooldowns page lists gaps.

### Group and raid

- Raid tiles in a fight show missing health, summons, tooltips and indicator names.
- Your role is guarded in a group, with an Automatic whisper role and a Needs my role line.
- The damage meter's header controls and breakdown take the Vanguard look, and the game's meter lines stay flat when reused.

### Questing (0.7.3)

- Tracker objectives are rows, muted when done, with an accent line on the followed quest; the tracker tooltip shows a Failed line.
- The arrow says Here and Turn in and has a Pin button; quest-start pins and /way titles read better, and history follows the game's own flag.
- Quest windows show reward captions and the best-reward crown, a needs line, an empty-log message and an honest Accepted.
- On the minimap, objectives are an accent dot under the quest mark, and the followed quest's mark is larger.

### Minimap and info strips

- The minimap drawer takes late buttons, sorts them, closes on Escape and opens on the side with room.
- Info strips fit their text, follow Text size, explain their numbers on hover, open their window on click and keep rates through a reload.
- The clock follows the game's clock, the strip counts calendar invites, and the reputation bar names its standing and takes the XP bar's spot at the cap.

### Chat (0.7.3)

- Channel tags are numbered, Copy works on the shown tab, and bare and guild links are clickable.
- The chat filter card says what it caught, and watch words match in any order and are marked.
- A summon that comes in a fight is taken when it ends, declines give one line per sender, and Hide the red error line keeps the four errors you must act on.

### Bags and town (0.7.3)

- Bank search finds more words, bags show the Junk value, and an item can leave its group.
- Mail scrolls with days left on every letter, the auction scan counts down, and deals survive a trip to the mailbox.
- The Keep stocked window, the Train all count and the travel bar spot are clearer.

### Fixes (0.7.3)

- About 170 bug fixes from two sweeps across combat, group, quests, map, chat, bags, merchant, mail, auction and setup.

## 0.7.2

Nothing in this release has been checked in the game; see the batch checklist (issue #284).

### Window look (0.7.2)

- Window buttons (close, minimize, maximize, back) show only their mark at rest; under the mouse a grey rounded tile appears and the close cross turns vermilion.
- The world map's breadcrumbs and their arrows are one control, the inbox Prev and Next captions sit clear of their arrows, and the Spellbook's category icons fill their tiles.
- The character pane's tabs, fold chevrons and rows take the theme, reputation rows read their state once the game has filled them, and the Settings window's Graphics box sits under its tabs with centred tab labels.
- The social window shows status in words with the presence dot centred on the name.

### Chat panel (0.7.2)

- Chat tabs sit over the panel in the tab bar, after the game's own dock layout.
- Chat polish: the frame, tabs, edit box, text fade, find box and bubbles; the edit box sits under the panel with a rail in the channel's colour.
- The Combat Log's filter strip sits in a band under the bar, and the copy box and the find box never stack.

### HUD and Edit Mode (0.7.2)

- A grey X and a grey nameplate bar mark mobs another player has tagged; mobs you tagged keep the green check.
- Scaled action bars touch in the bottom stack, and in Edit Mode the handles keep a dialog's layer and bars stack on whole pixels.

### Map and minimap (0.7.2)

- On a round minimap, quest marks, the zone name and the rim buttons stay on the map.
- With OpenMap loaded, Vanguard's map extras step aside: no cursor spot on the coordinates line and no quest-start pins. The Map page says so.

### Fixes and safety (0.7.2)

- A window drag held as a fight starts ends before the lockdown, popups keep their own layout, Forever's addon list is dressed, and the social side windows are fixed.
- Profiles: a backup never overwrites another character's profile, swapping back to a spec with no profile undoes the staged switch, and a settings restore reads its backup the way an import does.
- Hiding the red error line keeps the yellow info lines, and an options search hit marks its row when the window opens again.

## 0.7.1

Nothing in this release has been checked in the game; see the batch checklist (issue #284).

### Chat panel

- The chat window is one rounded panel with a tab bar, tabs you can always see and its side buttons stacked.

### HUD and Edit Mode

- Your cast bar moves up with the action bars instead of sitting under them.
- The Versus deck rounds its corners instead of cutting them.
- A green check marks mobs you have tagged, on nameplates and unit frames.
- In Edit Mode the window sits over the handles, bars line up with no gap and the default spots are tidier.

### Quest arrow

- The quest arrow sits centred at the top of the screen by default.

### Window skins

- More of the game's art is in the Vanguard look: the world map and its quest panel, the Settings window's Graphics section and its language and microphone rows, and the arrows on dropdowns and steppers.
- The calendar's today marker fits its cell, the guild list shows the selected guild's banner, Legacy keeps its challenge icons, and the professions skill bar stays inside its box.
- The group finder's search box no longer overlaps its button, and the setup wizard's choices rest flat with the picked one on the selected rail.

### Mail and bags

- The Find mail panel closes with the mailbox, and you can add and remove presets from it.
- The bags' Filter and Groups buttons fit their labels.

### Fixes and safety

- Escape closes the meter's spell panel and the Instance prep card.
- The Cooldown Manager glow never reads an aura the game hides.
- Your own name counts as you when it carries a realm other than the realm's name, in chat watch, the chat filter and the roll tracker.
- /vg probe never makes a call the game restricts.

## 0.7.0

Nothing in this release has been checked in the game; see the batch checklist (issue #284).

### Questing

- An on-screen arrow points to the nearest quest objective, and on to a quest on another map.
- Quest spots show on the minimap, quest mobs get a mark on their nameplate, and the quest log shows XP to your next level.
- Quests can be tracked automatically, shared quests can be accepted from your group (off by default), and quest history is kept for your whole account.
- In the quest log, Ctrl-click marks quests and Abandon takes all the marked ones.
- The map click can turn the arrow on, with a recent list and a Clear button; the quest log shows objectives as rows with a count and progress bar.

### Chat

- Chat windows keep their lines across reloads and logins.
- Gold selling, boosting, recruiting and repeated lines go to a Filtered tab instead of your chat.
- A choice of chat window size, a bigger default window, a softer backdrop and readable tabs.
- Chat has a Find button and Find in chat over the open windows and saved history, and the Chat page lets you pick, make, rename and close tabs and choose what each shows, plus window size, lock and floating windows.
- Chat tabs wear the theme's tab look and the alert glow takes the accent colour.

### Bags and town

- You can make your own categories in the combined bag.
- The merchant window has a sell list, Sell all of one item, and Stack and Max buying; mail has Take all and Return all.
- /vg alts shows an overview of your characters, also on the Game windows page.
- The auction house tabs and panels are in the Vanguard look, and a failing part no longer stops the rest.
- Bags get search words, deposit to the bank, and Filter and Groups buttons on the search row.
- The merchant sell list is safer (junk, stock), the mail Take button never takes pay-on-delivery mail, and mail runs re-check the whole mail.

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
- The character sheet shows item level and missing-enchant marks, and /vg gear lists them; /vg pets and the stable master line read the game's pet stable.
- The game rules show in /vg realm, with a note when a rules change moves your saved-data key; the TOC lists the 12.1.5 build and beta data can be cleared on request.

### Look and windows

- Many more game windows are in the Vanguard look: the spellbook, guild, social, map, group finder, Legacy, calendar, Edit Mode, keybindings and the Lua error window.
- One selected look and one press state for rows, tabs, sliders, scroll bars and buttons across the options and game windows; buttons light only while the mouse is over them.
- The game's remaining arrow art is skinned, and /vg errors opens a copy window.
- A Classic look: a flat panel under each action bar and a round minimap option.
- The options window reads better and scales: reload tags, a searchable settings list, a page reset and grouped Modules; the setup has Larger text and readability switches.
- Safer colours keep dispel types apart (on with the game's colour-blind mode), and dispel badges show a corner mark per type.

### Safety and tools

- Saved data is size-checked: Vanguard trims the oldest price data if the game says the file is too large.
- /vg perf reads the game's addon profiler, and /vg perf slow names Vanguard's slowest handlers; /vg mem reads memory after a garbage collection.
- /vg probe runs a batch of checks and /vg prep buffs checks the buff names, for reporting back what Forever does.
- When another addon (EllesmereUI's unit frame, action bar, nameplate and raid frame addons) does a job a Vanguard module does, chat says so once.
- Chat filters skip hidden text, saved-click-cast Import checks the whole string first, and a Quiet module can silence invite declines, battleground release, error and zone text and camera zoom.
- Vanguard asks about ElvUI, Tukui, Auctionator and TradeSkillMaster when they do the same job.
- The Vanguard meter gains each line's share of the total, kinds and segments, a spell panel, a chat report, a death recap link on the Deaths view, Report and Reset buttons and a width setting.
- Slash and auction input is parsed more strictly, a stuck window drag ends cleanly, and a Forever build is recognised through the game's ruleset call.

## 0.6.0

### New features

- **Safer colours** (General → Look; was Color assist): besides the blue, yellow and vermilion reactions, the four dispel types (Magic, Curse, Disease, Poison) get colours that stay apart under red-green and blue-yellow colour blindness. It also comes on by itself while the game's own colour-blind mode is on (switch off with Follow the game's colour-blind mode).
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
