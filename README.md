# ForeverUI

A from-scratch UI suite for WoW Forever (the 12.1 engine with vanilla content; the TOC declares Interface 16001 for Forever and 120007).
Written from scratch. It contains no code, art or fonts from other UI addons.

## What's in it

- **Look and layout**: the Slate & Brass theme: flat slate panels (floating windows get a soft shadow; frames on the HUD stay flat unless you turn on Soft shadows under frames), a brass accent (or arcane, fel, void, ember), bundled Fira Sans Condensed, pixel-perfect borders, smooth bars (Forever, Soft or Flat bar texture), soft sparks on cast and power bars, quiet fades and interface sounds (Reduce motion and Interface sounds switches turn them off). Every frame can be moved in unlock mode (`/fui unlock`), with a grid, snapping and arrow-key nudging; right-click a frame's handle to set its anchor and exact offsets. The game's Edit Mode shows ForeverUI's handles too, with a note under its window, so you can move everything in one place (a switch under General turns that off). Profiles can be exported and imported, and can switch with your spec (on clients that have specializations).
- **Centered layout**: everything near the action is anchored to the bottom center of the screen, so the layout keeps its shape at any UI scale. Player and target sit either side of your character with your cast bar and swing timer between them, the pet and target of target outside them, the focus above the player, and three bars of 36 px buttons under them over thin XP and reputation bars. Party and raid frames grow up from just above your player frame, centered on it (Setup's healing layout centers them above the middle of your frames), and a raid of more than 10 is drawn smaller (80%, or 72% above 25) so all 40 fit. Chat keeps a bottom-left spot under the frames (switch it off under Bars, map, chat). A test checks that nothing overlaps or leaves the screen, solo to 40-man, at UI scale 1.0 and pixel-perfect. Frames you moved keep their spot; `/fui reset all` puts everything back.
- **Unit frames**: player, target, target of target, focus and party frames, and boss frames (up to five, in a column from the top-left corner, each shown while its boss is in the fight; the game's own boss frames are hidden). On WoW Forever they show levels (colored by difficulty) and health as a percent, and a diamond marks elite, rare and boss targets. Combo points for rogues and druids above the player frame. Under it, shamans get their totems (icon and time left; right-click one to destroy it) and druids their mana while bear or cat form shows rage or energy: the game keeps both inside its own player frame, which ForeverUI replaces.
- **Combat timers**: a swing timer with a row per hand (main hand, off hand, and ranged for a hunter's Auto Shot), from WoW Forever's own swing events. It is on for warriors, rogues and hunters, and can be set to always or never. On your power bar, a spark counts down the five-second rule after each mana spell, or crosses the bar with every two-second energy tick.
- **Readouts**: your threat on your target as a percent above the target frame (in the threat colors once you have aggro), and a dot on the pet frame for a hunter pet's happiness: green happy, orange content, red unhappy. Each shows only where the client answers.
  - Target and focus auras: debuffs under the frame (a crowd-control slot, then yours soonest-first, then others' dimmed if you turn "Only your debuffs" off), the target's buffs above it, each row wrapping at the frame's width. Timer numbers are off by default (the dark sweep shows time left) and can be turned on.
  - Cast bars for you, your target and your focus, with a spark, the seconds left, your latency at the end of your own cast, and a gray edge on a cast you can't interrupt.
- **Your buffs and debuffs** replace the game's buff frame: buffs in rows left of the minimap with timers, your debuffs on a new row under them (edged in their type's color); right-click a buff to cancel it. Weapon enchants (poisons, stones, oils, and a shaman's imbues on WoW Forever, which the game's own enchant cells miss) sit in front of the buffs. Move them with `/fui unlock`.
- **Raid frames** (VuhDo-style):
  - Laid out in zones that never overlap: name at the top, status (missing health, Dead, Offline) under it, the missing-buff mark in the top-right corner, debuffs bottom left, your HoTs bottom right, the power bar along the bottom, and the ready check and resurrection big in the center. Default tile 100 x 48, drawn smaller in bigger raids.
  - Readable at a glance: class colors softened into the panel color by default (or dark bars with class-colored names, or bright class colors), outlined names that end in "..." when too long, and a dark bar on the dead and offline. In instanced combat, where the game keeps health secret from addons, the bars still fill and the missing-health text hides.
  - Auras: the first debuff you can dispel, then up to two others (boss debuffs included); your HoTs, lit while they're in their refresh window; no timer numbers on these small icons. A debuff you can dispel washes the tile in its type's color from the bottom and colors its edge.
  - Healing: click casting and hover keybindings, incoming heals and shields, aggro strip, missing-buff marker (hidden while the game hides auras, so it never cries wolf), an accent edge on your target, a faint wash under the mouse.
  - Status: range fade, raid target icons, ready check (a check, cross or three dots in the theme colors), resurrection marker, and a gold crown for the leader and a small diamond for assistants. While the ready check or resurrection mark shows in the middle, the missing-health text steps aside.
  - Roles: a small shield for tanks and a cross for healers before the name; damage dealers get no mark. The raid's main tank gets the shield in your accent color, and the main assist in gray.
  - Groups as columns (the default) or rows: rows lay each group out side by side in one line, so a big healing raid is wide and short.
- **Raid tools**: for the group's leader and assistants, a small bar at the top left with a ready check, a 10-second pull timer (right-click cancels it), a role check and Raid (turns your party into a raid), the eight raid target icons (click to mark your target; the last button clears it) and the eight world markers (click to place or remove one; right-click clears it; the last button clears them all). It shows and hides out of combat.
- **Action bars**: range and power tint, plus restyled pet, stance and extra action buttons and a vehicle exit button.
  - The bottom bars stack with bar 1 on top; turning on another bottom bar adds it underneath. Each row takes its bar's real height, so a bar with bigger buttons or more rows pushes the ones above it up, right away when you change it. A position you've dragged is kept; `/fui reset all` puts the bars back in this order.
  - Empty slots stay hidden until you drag a spell or item, so a new character sees no empty squares.
  - Each bar has its own number of buttons, buttons per row, button size, and visibility: Always, On mouseover (seen only while the mouse is over it), In combat, or Hidden. While you drag a spell or item, On mouseover and In combat bars show too (In combat bars only when the drag starts out of combat).
  - Hidden bars keep their keys: the bar isn't drawn, but a bound key still casts, like a keybind-only bar. A Hidden bottom bar keeps its row in the stack (leaving a gap), because bars can't be re-stacked during combat.
  - The right-edge bars (4 and 5) start off; turned on, they show on mouseover. Profiles that already had them on keep them on Always.
- **Nameplates**: class/reaction/threat colors, the level (colored by how hard the unit is for you), your debuffs (soonest to expire first, with timers) and your crowd control, casts, raid icon, an accent border and diamond on your target, and a gold "!" by the name of units your quests need (only when the game says so plainly; a switch turns it off). A plate first drawn during a fight uses ForeverUI's own icons (the client's aura containers can't be made in combat) and switches to the client's when the fight ends.
- **Text size**: one slider (/fui > General, 70% to 130%) sizes all of ForeverUI's text, chat and tooltips included, and applies at once. Chat has its own Small, Medium or Large on top (or keeps the game's own chat size if you prefer). `/fui status` shows your UI scale and how many pixels tall chat text draws on your screen.
- **The game's extras, tidied**: the game's own XP bar is hidden while ForeverUI's shows (no more double XP bar), and so are the durability figure, clock and calendar button while the info strip shows them (`/calendar` still opens the calendar). Tracking, mail, dungeon difficulty, the addon compartment and the group finder eye move onto the square minimap's corners, and the expansion button (nothing to show in vanilla content) is put away. The micro menu sits in a small strip in the bottom-right corner that shows on mouseover (or always), drawn as ForeverUI line icons on flat panels with a little space between them (they still work and flash as the game's do); the bag buttons have their own strip just left of it, always shown, in the same look, and the quest tracker sits under the info strip, with flat headers, a brass line under each, the theme's collapse arrows and the theme font (quest colors stay the game's). Both strips size themselves to their buttons, with a margin all round. They stay put when the game lays out its own frames again. Each has a switch under Bars, map, chat.
- **Game windows**: character, merchant, mail, quest, gossip, trade, loot and roll windows, the game menu, the ready check, popups, the spellbook and the breath and fatigue bars get a flat ForeverUI panel, close button, title and buttons (the mail's Open All too). Friends, the dressing room, the flight map, books and letters (their pages in light text on the dark panel), and the windows that load later (auction house, professions, inspect, guild bank, collections, achievements, dungeon journal) get the same look. Loss of control (stunned, feared...) shows on a flat panel a little above your character, and the talking head on one at the top center (or hidden; your choice under Bars, map, chat). The character pane shows each worn item's durability on its slot, colored like the info strip's. Their own layout and buttons stay as the game has them. Switches under Bars, map, chat.
- **The game's tools**: the game's Cooldown Manager (turn it on under the game's Options, Gameplay Enhancements; ForeverUI says so once if it's off) gets square icons in thin borders with the theme font, and its rows sit between the player and target frames, above the swing timer. The game's damage meter gets a flat panel with theme bars and text, above the menu strip in the bottom-right corner (the tooltip corner moves just above it). Move them with `/fui unlock`; while Edit Mode is open, ForeverUI stands aside and puts them back when it closes. One switch leaves placing them to Edit Mode. Switches under Bars, map, chat.
- **Everything else**: XP and reputation bars, square minimap (brass diamonds on its corners, in your accent), chat skin, combined bag (with a Sort button where the game can sort bags, item slots bordered in each item's quality color, and the game's search box in the theme) and the bank in the same look, and themed tooltips with class colors and a Target line.
- **Strip under the minimap**: durability (orange at 25% or less, red at 10% or less), free bag slots, fps and latency, gold, ammo for hunters, warriors and rogues, and the time. While you level, a third row adds your XP per hour this session, the time to your next level at that pace, and your gold per hour (red while you're spending); they wait a minute for the numbers to settle, and the XP ones hide at the level cap. A fourth row can show your DPS in the last fight, from the game's damage meter (off until you turn it on; it updates when a fight ends, and stays hidden where the game keeps it secret). Each part can be turned off; one the game can't answer stays hidden. The quest tracker sits just under the strip with room for all four rows.
- **At a merchant**: repairs with your own gold and sells your gray items (tried again a few times, since the server limits how fast items sell). The error line drops what the action bar already shows (ability not ready, not enough rage or energy, no target); errors you can act on stay. Each can be turned off. Item tooltips show what the stack sells for (unless the game already shows a price) and how many you have, bags and bank, with an optional item ID line.
- **Chat extras**: web addresses in chat become links in your accent color; click one and it opens selected, ready to copy. A small **Copy** button over the chat (or `/fui copy`) opens the recent chat as plain text to copy. Chat the game hides from addons (in instances) is left untouched and out of the copy.
- **Minimap drawer**: other addons' round minimap buttons are gathered into a drawer beside the map; the small "..." button on the map's left edge opens it (it only shows once there's a button to gather).
- **Auto-accept** (each off until you switch it on, under Bars, map, chat): accept summons (out of combat), accept resurrections, decline duel requests. Each says in chat what it did.
- **Faction look** (on by default; General → Look → Faction look): an Alliance character gets the crossed swords in gold and Cinzel for window titles and headings; a Horde character gets the crossed axes in red and Metamorphous. The crest sits beside the options window's title, on the setup wizard, on the AFK card and faintly behind the quest dialog's header. Numbers and body text stay in Fira Sans, the HUD and your accent color are unchanged, and neutral characters (and Korean and Chinese clients, which use the game's font) keep the usual look. `/fui factionart` lists which of the game's own faction pictures your client has.
- **AFK screen**: while you're away (`/afk`, or the game marks you idle), the screen dims to a card with your name in your class color, level and class, the zone, how long you've been away, the time and your XP bar. Moving or a fight brings everything back; a click or a key puts it away until you're next away. It only shows out of combat and never hides the game's own frames. Turn it off under Modules.
- **Main tank frames**: in a raid, the players marked main tank or main assist get small tiles at the top left (beside the raid tools), with health in their class color and what each is targeting written beside it. Click one to target them. Move them with `/fui unlock`; turn them off under Modules.
- **Party pets and targets** (off until you turn it on under Unit frames): a small tile for each party member's pet and target, one row per member, above the party frames. They show only in a party, each while its unit exists.
- **Quest dialog**: talking to a quest giver opens ForeverUI's own dialog at the bottom center instead of the game's quest and gossip windows: the NPC's portrait and name, the text, numbered lines for quests (in their difficulty colors; gold when ready to turn in) and gossip options, reward cards with quality borders, and the money and XP you'll get. Press a number to pick a line or a reward, Space for the main button (Accept, Continue, Complete), Escape to say goodbye. Movable with `/fui unlock`; switch it off under `/fui` → Quests to get the game's windows back.
- **Quest tracker**: ForeverUI's own, in the tracker's spot under the info strip: each quest you watch as "[12] Title" in its difficulty color, its objectives (gray, then green when done) or "Ready to turn in", and its usable quest item as a button beside it. Left-click a quest to open it, right-click to stop watching it; collapse it with the arrow; order it as the game does or nearest first (`/fui` → Quests). Quests that don't fit are counted ("+3 more"). The game's tracker is hidden while it shows; switch it off to get the game's back (in ForeverUI's look).
- **Quest log**: the game's quest log key (and `/fui quests`) opens ForeverUI's own: your quests under their zones (click a zone to fold it), "[12] Title" in its difficulty color with a check when ready to turn in; the chosen quest's text, objectives and reward cards, and Track/Untrack, Share (in a group), Abandon (through the game's own confirmation) and Map. Clicking a quest in the tracker opens it here. Switch it off under `/fui` → Quests to keep the game's.
- **Quest automation** (each off until you switch it on, under `/fui` → Quests; hold Shift while talking to skip it): accept quests, turn in finished ones (it never chooses among rewards for you, unless you also switch on "take the one that sells for most"), and skip the chatter when an NPC has just one quest for you. Each says in chat what it did.
- **Errands**: a **Train all** button on the trainer's window learns everything you can afford, one at a time, and says what it cost. **Keep stocked**: `/fui stock <shift-click an item> 20` keeps 20 in your bags; a merchant who sells it tops you up, a stack at a time, while you can pay (`/fui stock` lists them, `0` removes one, `clear` empties the list). The **flight timer** saves each flight's time by route, and the next flight on that route shows a bar (movable) counting down to landing. Buying and training stop in combat. Each has a switch under Bars, map, chat.
- **Options**: `/fui`, the addons button, or the **ForeverUI** button at the top of the game menu (Escape). Turn any module off under Modules to keep the default one. Most changes apply at once; the rest show a Reload now button. WoW Forever lets an addon reload only from a click on a secure button, so that's what ForeverUI's Reload buttons are; one built during a fight becomes one when the fight ends, and until then it asks you to type `/reload`.
- **First-run setup**: the first time you log in on an account, a three-step wizard asks for a layout (Damage and tanking, Healing, or Like the game's), an accent and raid frame style, then unlocks your frames so you can move them (the same unlock mode as `/fui unlock`, or **Move frames** under General in `/fui`; `/fui lock` or Done locks them again). With the defaults it takes three clicks: Next, Next, Done. It waits until you're out of combat. Done, the close button and Escape all end it, and it doesn't come back on its own; `/fui setup` reopens it. Damage and tanking is ForeverUI's defaults (picking it puts back anything another layout moved); Like the game's puts your player and target frames along the top left as the game has them (the pet under the player, the target of target and focus beside the target), the party and raid down the left side, the boss frames on the right under your buffs, and the raid tools and main tanks near the top center; Healing puts the raid frames centered just above your cast bar, growing upward, and turns click casting on. With Healing, a party and raids of up to 2 groups fit between the player and target frames; raids of more than 2 groups overlap them, so drag the raid frames where you want them with `/fui unlock` (or **Move frames** under General in `/fui`).

Every client call is checked before use, and values the client hides from
addons go to the bars unread. Auras use the client's own aura containers where
it has them (12.1 and WoW Forever), so icons, stacks, timers and debuff colors
keep working while it hides aura values in instanced combat; if the client
refuses one of those containers, ForeverUI switches to its own icons for the
rest of the session (it says so in `/fui errors`); on those icons, an aura
filter word the client doesn't know (say crowd control) is dropped for the
session, so that slot shows the nearest match (the first debuff), and it is
listed in `/fui errors`; `/fui status` shows which
aura backend is in use and which optional client calls were found. If the client can't compile secure snippets (a WoW Forever beta bug), ForeverUI says so at login and in `/fui status` and turns hover keys off; mouse click-casting still works, and bar paging and the raid frames may not until the game fixes it. None of this has been checked in game yet:
please report what breaks.

## Install

Download `ForeverUI-<version>.zip` from the [latest release](https://github.com/clifftaylor2325/wow-forever-ui/releases/latest) and unzip the `ForeverUI` folder into `World of Warcraft/_retail_/Interface/AddOns/` (your Forever client's AddOns folder).

## Commands

```
/fui               the options window (also: left-click the addons button by the minimap)
/fui setup         the first-run setup again: layout, look, then move things
/fui unlock | lock drag handles on every ForeverUI frame (also: right-click the addons button)
/fui reset <frame|all>
/fui accent <rrggbb|brass|arcane|fel|void|ember> | reset      /fui theme reset
/fui modules       the list of modules; /fui enable|disable <module>, then /reload
/fui skins         addons skinned through the API; skins <addon> on|off
/fui profile [name]              switch (or create); profile new|copy|delete <name>, profile reset
/fui export [module] | import    profile strings (whole profile or one module's settings)
/fui spec [profile|off]          use a profile whenever you're in this specialization
/fui binds                       this spec's click-casting and hover-key bindings
/fui status
/fui errors [clear]              what ForeverUI caught going wrong this session: the version, client and aura backend, then each distinct error once with how often it happened and its stack (paste it in a bug report; clear empties the list). An error is printed to chat the first time it happens and handed to the game's error popup or your error addon every time; an error in one module, skin, event handler or after-combat update is kept here and doesn't stop the others
```

## Skin API (for other addons)

```
## OptionalDeps: ForeverUI
```
```lua
if ForeverUI and ForeverUI.RegisterSkin then
  ForeverUI.RegisterSkin("MyAddon", function(S)
    S.Panel(MyFrame, { shadow = true }) -- flat panel, 1px border, sheen; shadow for floating windows
    S.Button(MyFrame.OkButton)
    S.EditBox(MyFrame.Input)
    S.CloseButton(MyFrame.Close)
    S.Text(MyFrame.Title, "title")  -- text roles: title, heading, name, cell, label, number, small, tiny, world
    S.Color(MyFrame.Hint, "text2")  -- theme colors by name: text, text2, muted, accent, good, bad...
    S.Tint(MyFrame.Glow, "accent")
  end)
end
```

The callback runs once at login, or immediately if the addon registers after login. Errors in it are reported and don't break anything else. Painted frames follow `/fui accent` changes live, and their borders stay one screen pixel at any UI scale (`S.Pixel(frame)` gives that size). `S.RGB(name)` returns any theme color; the names are in `Core/Theme.lua`. `S.apiVersion` is 1; the API only grows.

## Development

```bash
npm install
npm test          # JS and Lua harness tests under Vitest, once (vitest run, no watch), then a per-category Lua harness summary
npm run verify    # npm test (real addon Lua under a strict TEST-ONLY WoW stub, and the JS tests), then the code-quality scan; CI runs this
                  # (functions of 10 lines or fewer, all documented; colors only from Core/Theme.lua)
npm run coverage  # line coverage of the addon Lua; fails below scripts/lua-coverage-floor.json
npm run lint      # luacheck
npm run media     # regenerate Media/Textures and Media/Icons from scripts/lib/media-sources.mjs
npm run package   # dist/ForeverUI-<version>.zip from committed files
npm run preview   # preview/*.png: the default layout and the options window (needs Playwright)
```

**Play from your clone:** `npm run link:wow -- --wow "<Forever folder that has Interface/AddOns>"` links `Interface/AddOns/ForeverUI` to this clone (a directory junction on Windows, no admin needed), so an edit plus `/reload` shows in game. The folder is remembered in `~/.wow-forever/config.json`, so after the first time it's just `npm run link:wow`. An installed copy is only moved aside with `--replace` (it becomes `ForeverUI.backup-<date>`). `--status` shows what's there; `--unlink` removes the link and never deletes a real folder.

**VS Code:** open the folder and accept the recommended extensions: **Lua** (sumneko) and **WoW API** (Ketho), which add Lua 5.1 checking plus autocomplete and docs for the game API. `.vscode/tasks.json` has verify, luacheck (problems show in the editor), coverage, package, preview and link:wow under *Run Task*.

**Windows tools:** `npm run verify` needs only Node. For `npm run lint`, put `luacheck.exe` from the [luacheck releases](https://github.com/lunarmodules/luacheck/releases) on your PATH. CI also runs a Lua 5.1 syntax check (`luac5.1 -p`); you don't need it locally.

**Release:** bump `## Version` in `ForeverUI.toc` and merge, then run the `release` workflow from the Actions tab on `main` (it tags `v<version>`), or push a matching tag. It re-runs the checks and publishes a GitHub release with the zip.

**Art and fonts:** every texture and icon under `Media/` is drawn by code in `scripts/lib/media-sources.mjs` (plain math, no image editor), and `npm run verify` fails if a committed file doesn't match its source. The fonts are made from upstream Fira Sans Condensed by `scripts/fonts/make-fonts.py` (see that file).

**Code quality:** every function has a comment on the line above it and at most 10 lines of body code; `npm run verify` and CI enforce it.

## License

MIT, except the fonts: `Media/Fonts/FiraSansCondensed-*.ttf` are Fira Sans Condensed (Copyright 2012-2015 The Mozilla Foundation and Telefonica S.A.) under the SIL Open Font License 1.1, in `Media/Fonts/OFL.txt`. ForeverUI ships them trimmed to Latin, Greek and Cyrillic, with the digits pointing at the font's tabular figures.

## Credits

- Fira Sans Condensed, Cinzel and Metamorphous: SIL Open Font License 1.1 (licenses in `Media/Fonts`).
- Faction crests "Crossed swords" and "Crossed axes" by Lorc, from game-icons.net, CC BY 3.0 (`Media/Art/CREDITS.txt`; all sources in `art/CREDITS.md`).
