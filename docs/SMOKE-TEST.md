# Vanguard smoke test (for the owner)

Run this once in the WoW Forever beta after the P0 branch is merged. **Nothing in it has been seen in the game.** Every "Expect" line is what the code intends, read from the source when this was written, not something anyone watched happen. A step that fails is the useful result: it tells us what to fix.

Written against the Forever client build 1.60.1.70170 (the Blizzard UI source the code was checked against). `/vg status` prints the build you are really on.

Things to know before you start:

- The checklist changes your saved settings (a throwaway profile, `/vg reset all`). Use a spare character, or run `/vg export` first and keep the string.
- Steps that need other players (party, raid, main tank, ready check) or an instance are marked "if you can". Do not block the report on them.
- Where an Expect depends on an earlier fix, a bracketed note says which. If that fix did not land, the note says what you will see instead.
- Quote chat lines as they appear; a missing or different line is a finding.

## Report block

For every failed step, paste all of this (steps below say "If it fails, paste:" for anything extra):

1. The step id (for example `3.3`).
2. The whole output of `/vg status`. Today it is five lines: the version, profile and module count; the skinned, painted and waiting-on-combat counts; the client line (`Client WoW Forever`, the build, `auras on the engine` or `auras on the fallback`, `aura values readable` or `hidden right now`, and whether secure snippets work); a `Client has: ... lacks: ...` line; and the `UI scale ... text ... chat ...` line.
3. The whole output of `/vg errors`: either `No errors caught this session.`, or a header with the version, interface number and error count, the client line, and each error with `(xN)` and its stack lines.
4. A screenshot (Print Screen; the files land in the game's Screenshots folder).

Shortcut: `/vg report` puts items 2 and 3 in one box, selected for copying (`### Vanguard report v1 ###` to `### end ###`), with the screen size, the modules turned off and the skins. Press Ctrl+C and paste it whole; it is the same block the feedback form on vanguardui.com reads. `/vg feedback` (or Send feedback under General in `/vg`) goes one further: it asks the form's own questions in game and makes one block, the report inside it, that fills the form when pasted into it.

## 1. Install and first login

### 1.1 Link the addon

- Do: in a clone of the repository run `npm run link:wow -- --wow "<folder that has Interface/AddOns>"`, then `npm run link:wow -- --status`. (Or unzip a release into `Interface/AddOns/` and skip this step.)
- Expect: a message ending `/reload in game.`, and `--status` reporting the link. If a real Vanguard folder is already there, the message is `... is an installed copy. Add --replace to move it aside and link this clone.`
- If it fails, paste: the whole terminal output of both commands.

### 1.2 First login opens the setup wizard

- Do: at character select open AddOns and tick Vanguard, then log in on an account that has never run it (or delete `WTF/Account/<account>/SavedVariables/Vanguard.lua` first).
- Expect: the setup wizard opens by itself with the caption `Step 1 of 4 · Layout`. If you log in during combat it waits and says `Setup opens when combat ends.`
- If it fails, paste: the Report block.

### 1.3 Status

- Do: type `/vg status`.
- Expect: the lines described in the Report block. The client line says `Client WoW Forever` and `auras on the engine`. [After P0.3: `auras on the fallback` means the client refused the aura container and Vanguard fell back; `/vg errors` should say so.] [After P0.6 and P0.11: the `Client has:` line and a `secure snippets: yes` part are present; `secure snippets: no (hover keys off)` means the client could not run secure snippets.]
- If it fails, paste: the whole `/vg status` output and `/vg errors`.

### 1.4 No errors yet

- Do: type `/vg errors`.
- Expect: `No errors caught this session.` Anything else is the first bug report. [After P0.2: each entry shows a count and a stack.]
- If it fails, paste: the whole `/vg errors` output.

## 2. Options window and wizard

### 2.1 Every options page

- Do: type `/vg`, then click each page in the left list in turn: General, Modules, Unit frames, Raid frames, Healing, Click casting, Action bars, Quests, Nameplates, Bars, map, chat, Situations and Profiles (12 pages in all; the order of Quests and Nameplates is whatever the window shows). After each, type `/vg errors`.
- Expect: each page draws its rows with no Lua error popup, and `/vg errors` stays empty.
- If it fails, paste: the page name, a screenshot of it, and `/vg errors`.

### 2.2 The wizard, start to finish

- Do: type `/vg setup`. Click Next three times, then Done.
- Expect: `Step 1 of 4 · Layout` with three choices (Centered: damage and tanking, Centered: healing, Like the game's); Next goes to `Step 2 of 4 · Screen`, with a choice per screen size (1080p, 1440p, 4K, Ultrawide), the one for your screen marked `your screen`, and `Keep my current sizes`; Next goes to `Step 3 of 4 · Look` (the accent swatches and the raid frame style); Next goes to `Step 4 of 4 · Move things` with every frame's handle showing; the button then says Done, and Done hides the handles and the wizard. Escape and the close button do the same. After `/reload` the wizard does not come back by itself.
- If it fails, paste: the step id, the caption you saw, and `/vg errors`.

### 2.3 The healing layout

- Do: type `/vg setup`, pick Centered: healing, click Next once, then close the wizard. Open `/vg` and look at Click casting.
- Expect: the raid frames sit centred above the cast bar, growing upward; click casting is on. If Raid frames or Click casting were off before, closing the wizard offers a reload (`Setup turned on a module that was off.`).
- If it fails, paste: a screenshot and `/vg errors`.

## 3. Unlock, dragging and Edit Mode

### 3.1 Unlock

- Do: type `/vg unlock`, then `/vg frames`.
- Expect: the chat line `Unlocked: drag the handles. /vg lock when done.`, labelled handles on the Vanguard frames, and `/vg frames` listing keys such as `minimap`, `infostrip`, `menustrip`, `bagstrip`, `raid` and `questtracker`.
- If it fails, paste: the chat output and a screenshot.

### 3.2 Drag two frames and keep them

- Do: drag the Minimap and Info strip handles somewhere new, type `/vg lock`, then `/reload`.
- Expect: `Locked.` and, after the reload, both frames where you left them.
- If it fails, paste: which frame moved back and `/vg errors`.

### 3.3 Combat while unlocked

- Do: type `/vg unlock`, then start a fight with a mob. During the fight type `/vg unlock` again, and after it ends once more, then type `/vg lock` so the frames are locked again.
- Expect: `Locked for combat. /vg unlock again afterwards.` and the handles gone when the fight starts; during the fight `/vg unlock` prints `In combat. Try again once combat ends.`; after the fight `/vg unlock` works again.
- If it fails, paste: the chat lines and `/vg errors`.

### 3.4 Edit Mode

- Do: make sure the frames are locked (`/vg lock`), press Escape, click Edit Mode, look, close Edit Mode. (If `/vg unlock` had the handles up already, closing Edit Mode leaves them up; that is intended.)
- Expect: Vanguard's labelled handles appear too, with a note under the Edit Mode window reading `The labeled handles are Vanguard's frames: drag them here too (right-click one for more).` On closing, the handles hide and the Blizzard frames Vanguard pins (minimap, strips, tracker) return to their Vanguard spots.
- If it fails, paste: a screenshot while Edit Mode is open and `/vg errors`.

### 3.5 Reset

- Do: type `/vg reset all`.
- Expect: `Reset N frame(s).` with N above zero, and the frames back at their default spots.
- If it fails, paste: the chat line.

## 4. Profiles and import

### 4.1 Switch profile

- Do: type `/vg profile Smoke`, click Reload in the dialog, then after the reload type `/vg profile`.
- Expect: a dialog saying `This character now uses profile Smoke. Reload the UI now to apply it?` with Reload and Later; Reload reloads the UI; afterwards `Profile: Smoke   (all: Default, Smoke)`. [After P0.7: the Reload button is a secure macro button. If the click does nothing, type `/reload` yourself and say that the button was dead.]
- If it fails, paste: whether the button reloaded, and `/vg errors`.

### 4.2 Import garbage

- Do: type `/vg import`, paste `garbage`, click Import. Then export (step 4.3), cut the string in half, and import that.
- Expect: `Import failed: not a Vanguard profile string.` for the garbage, and `Import failed: the string is incomplete (was it cut off when pasting?).` for the cut string; no error popup either time.
- If it fails, paste: the chat lines and `/vg errors`.

### 4.3 Export

- Do: type `/vg export`.
- Expect: a text box titled `Vanguard export (profile Smoke)  Ctrl+C to copy` holding one long string.
- If it fails, paste: a screenshot.

## 5. Pixel borders

### 5.1 Border width at 1440p

- Do: set the game to 2560x1440 and UI scale 1.0 (the game's UI Scale setting, usually under Options, System, Advanced; confirm the path in your client). Take a screenshot of the player frame's edge and zoom in. Type `/vg status`.
- Expect: the border exactly 1 screen pixel wide, and `UI scale 1.00` in the status text line. [After P0.4. Before it the border is 2 px at 1440p, because the old size was one UI unit rounded to whole pixels.]
- If it fails, paste: the zoomed crop, your resolution, and the `UI scale` line.

## 6. Party and raid

### 6.1 Party frames (if you can)

- Do: join a party.
- Expect: party frames just above the player frame, growing upward, and the game's own party frames gone.
- If it fails, paste: a screenshot and `/vg errors`.

### 6.2 Raid frames (if you can)

- Do: as leader or assistant, press the Raid button on the raid tools bar (top left) to convert to a raid, then press Ready on the same bar.
- Expect: raid frames in groups, 100x48 tiles at 10 members or fewer and smaller above that; the ready check starts.
- If it fails, paste: a screenshot and `/vg errors`. In an instance during combat `/vg status` should say `aura values hidden right now` while the bars still fill; paste that line if the bars do not fill.

### 6.3 Main tank tiles (if you can)

- Do: in a raid, mark a main tank.
- Expect: a small tile for that player at the top left, beside the raid tools, with health in their class colour.
- If it fails, paste: a screenshot and `/vg errors`.

## 7. Combat visuals: auras, cast bars, nameplates

### 7.1 Target and focus auras

- Do: target a mob that has a buff, put a damage-over-time debuff on it, then type `/focus` with it targeted.
- Expect: debuffs under the target and focus frames, buffs above them, wrapping at the frame width, with timers off by default.
- If it fails, paste: a screenshot, `/vg status` and `/vg errors`. [After P0.3 and P0.12: a rejected aura filter word is listed in `/vg errors`.]

### 7.2 Cast bars

- Do: cast a spell with a long cast time, and have a mob cast at you.
- Expect: your cast bar between the player and target frames with a spark and the seconds left, and a latency segment at the end of your own cast; a gray edge on a cast that cannot be interrupted.
- If it fails, paste: a screenshot during a cast and `/vg errors`.

### 7.3 Nameplates in a pull

- Do: pull three or more mobs.
- Expect: plates coloured by reaction and threat with the level shown, your debuffs on them, and your target's plate with an accent border and diamond. A plate first drawn during the fight uses Vanguard's own icons and switches to the client's after the fight.
- If it fails, paste: a screenshot taken during the pull and `/vg errors`.

## 8. Quests

### 8.1 Quest dialog

- Do: under `/vg > Quests` tick Accept quests and Turn in finished quests (they are off by default). Talk to a quest giver who offers three or more quests. Press a number key, Space and Escape in turn. Then talk to a quest giver again without Shift (a quest is accepted for you), and once more holding Shift.
- Expect: Vanguard's dialog at the bottom centre with numbered lines in difficulty colours; the number picks a line, Space presses the main button (Accept, Continue or Complete), Escape says goodbye; without Shift the ticked automation runs; with Shift held, no automation runs and the dialog stays open for you.
- If it fails, paste: a screenshot and `/vg errors`.

### 8.2 Long quest text

- Do: open a quest with a very long description.
- Expect: the text fits or scrolls inside the panel, with no overflow outside it.
- If it fails, paste: a screenshot and the quest name.

### 8.3 Quest log

- Do: fill the quest log (as many quests as it lets you take; the limit on Forever is not confirmed), then press the quest log key and type `/vg quests`.
- Expect: Vanguard's log with quests under their zones (click a zone to fold it), `[12] Title` lines in difficulty colours, and Track or Untrack, Share, Abandon and Map for the chosen quest. If it is off, `/vg quests` says `Vanguard's quest log is off (/vg > Quests).`
- If it fails, paste: a screenshot and `/vg errors`.

### 8.4 Quest tracker overflow

- Do: watch more quests than fit under the info strip.
- Expect: a `+N more` line at the bottom of the tracker.
- If it fails, paste: a screenshot.

## 9. Bags, merchant, trainer

### 9.1 Bag search

- Do: open your bags and type in the search box.
- Expect: the combined bag in the Vanguard look; items that do not match dim as the game dims them; the search box is themed; a Sort button is present if this client can sort bags.
- If it fails, paste: a screenshot and `/vg errors`.

### 9.2 Merchant repair and sell

- Do: with damaged gear and gray items, open a merchant who repairs.
- Expect: `Repaired for <money>.` (or `Not enough gold to repair (<money>).`) and `Selling N junk item(s).` in chat; the gray items vanish over a few seconds.
- If it fails, paste: the chat lines and `/vg errors`.

### 9.3 Trainer: Train all

- Do: at a class trainer with skills you can afford, click Train all. Try it again in combat if you can.
- Expect: a button reading `Train all (N) · <money>` on the trainer window; clicking it prints `Trained N skill(s) for <money>.`; in combat it does nothing.
- If it fails, paste: a screenshot of the trainer window and `/vg errors`.

## 10. Click casting

### 10.1 Make a binding

- Do: type `/vg`, open Click casting, click Set key and press Shift+Q (a hover key) or Shift and left-click, set Action to Spell, type a spell name, and click Add binding. Then type `/vg binds`.
- Expect: the key text `Shift + Q (hover)` or `Shift + Left click` in the editor and a row in the list below; `/vg binds` prints `Click casting (this spec):` and then `  Shift + Q (hover)  ->  <spell>`.
- If it fails, paste: the `/vg binds` output and `/vg errors`.

### 10.2 Use it

- Do: out of combat, hover a party or raid tile (or your own frame) and press the key or click.
- Expect: the spell is cast on that unit. [After P0.11: if `/vg status` says `secure snippets: no`, hover keys are off on purpose and only mouse bindings work; paste that status line.]
- If it fails, paste: `/vg binds`, `/vg status` and `/vg errors`.

### 10.3 Bar 1 pages with stances and forms

- Do: on a warrior, druid or rogue, change stance, form or stealth out of combat, then again in a fight; also press Shift+2 and Shift+1.
- Expect: bar 1's icons change with each stance, form or stealth and with Shift+number, in and out of combat, and the button casts what it shows. This holds whether `/vg status` says `secure snippets: yes` or `no` (with `no`, bar 1 pages through the game's own page attribute).
- If it fails, paste: your class, what you changed, what the bar showed, `/vg status` and `/vg errors`.

## 11. AFK

### 11.1 AFK card

- Do: standing still out of combat, type `/afk`. Move. Type `/afk` again, then click or press a key.
- Expect: the screen dims to a card with your name in your class colour, level and class, the zone, time away, the clock and an XP bar; moving removes it; a click or key removes it until you are next away; it never shows in combat.
- If it fails, paste: a screenshot and `/vg errors`.

## 12. Game menu

### 12.1 The Vanguard button

- Do: press Escape, look at the menu, click the Vanguard button.
- Expect: the Vanguard button first, above Options, with a gap under it; clicking it closes the menu and opens the options window. [After P0.9. If P0.9 did not land, the button is last, under Return to Game, as in your first screenshot.]
- If it fails, paste: a screenshot of the menu and `/vg errors`.

### 12.2 The game's own buttons still work

- Do: from the game menu click Edit Mode, Options, Macros and AddOns in turn, out of combat and then in combat.
- Expect: each opens, and no `Interface action failed because of an AddOn` message appears.
- If it fails, paste: that message text, which button and whether you were in combat, and `/vg errors`.

## 13. Menu and bag strips

### 13.1 Placement

- Do: look at the bottom-right corner at UI scale 1.
- Expect: the bag strip left of the menu strip with a gap and no overlap; the menu strip shows on mouseover (the default) or always if you set Game menu buttons under Bars, map, chat; no brass box inside either strip. [After P0.14. Before it, the overlap and the box from your first screenshot are expected.]
- If it fails, paste: a screenshot of the corner.

### 13.2 Every button works

- Do: click every micro button the Forever menu has (Character, Spellbook, Talents, Achievements, Quest log, Guild or Social, group finder, Collections, Adventure guide, Shop, Game menu) and every bag button, including the key ring button if there is one.
- Expect: each opens its window or bag. [The key ring button is skinned only after P0.14.]
- If it fails, paste: which button, a screenshot and `/vg errors`.

### 13.3 Move the strips

- Do: type `/vg unlock`, drag the Bags and Game menu handles apart, type `/vg lock`, then `/reload`.
- Expect: both strips stay where you put them.
- If it fails, paste: a screenshot after the reload.

## 14. Game windows, by area

Each stream of `docs/handoff/RESKIN-PLAN.md` adds its steps here as `###` subsections with fixed numbers, so parallel streams never collide: 14.2 mail, guild, channels, friends (S1); 14.3 stable, trainer, bags, loot and item dialogs (S2); 14.4 game options, Edit Mode, keybinding and help (S3); 14.5 world map, group finder, calendar and Legacy (S4); 14.6 menus and tooltips (S5); 14.7 the game's swing timer, aura frames, crafting cast bar, possess bar and zone text (S6); 14.8 tabs and the inside of the character pane (S7); 14.9 battleground windows (S8). For every window: it has the flat panel with the theme's close button and title, its buttons and tabs still work, and `/vg errors` stays empty.

### 14.1 Switches

- Do: under `/vg` → Bars, map, chat → Game windows, untick one group (say "World map, group finder, calendar and Legacy windows"), reload, open the world map.
- Expect: the map is the game's own again; the other groups' windows keep the Vanguard look.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.2.1 Open a letter

- Do: at a mailbox, open a letter that has text and, if you can, one with an attachment or money (an auction invoice works).
- Expect: the letter window is a flat panel with no parchment behind the text; the text is light and any headings gold; Reply, Delete, Cancel and Report Spam are flat buttons; the attachment and money buttons have a thin border in the item's quality color; open a second letter and the text is still light.
- If it fails, paste: a screenshot of the open letter and `/vg errors`.

### 14.2.2 Guild window and its pages

- Do: open the guild window (the Guild or Social menu button, or `J`), then click each page: Chat, Roster, Guild Info, the benefits page, then the maximize/minimize button.
- Expect: every page shows on flat dark panels (list, roster, chat, benefits, info) with no marble or portrait art; the stream dropdown is a flat button; the maximize and minimize buttons still show their symbol; switching pages keeps the look; the side tabs are still the game's.
- If it fails, paste: a screenshot of the page that looks wrong and `/vg errors`.

### 14.2.3 Guild dialogs

- Do: from the guild window open the guild log, the news filters, the settings dialog (as a guild leader) and the invite manager; have someone invite you to a guild if you can.
- Expect: each is a flat panel; text buttons (Close, Accept, Cancel) keep their words and are not covered by an X; the settings dialog's name boxes are dark input boxes.
- If it fails, paste: a screenshot of the dialog and `/vg errors`.

### 14.2.4 Channels window and a channel dialog

- Do: type `/join test`, then open the channels window (the chat channels button, or `O`) and click Create Channel.
- Expect: the channels window and the create-channel dialog are flat panels with themed buttons and input boxes, and you are in the channel.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.2.5 Invite a friend

- Do: open the friends list, click Add Friend, type a character name; then, if you can, send a Battle.net battletag request and open Friends of Friends.
- Expect: the add-friend window is a flat panel; its name box and buttons are themed and still work; the Battle.net invite and Friends of Friends windows are flat panels.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.2.6 Guild registrar and petition

- Do: visit a guild registrar and read the greeting, click to buy a charter; open a charter you hold or are asked to sign, and open the tabard designer from the tabard vendor.
- Expect: the registrar, petition and tabard windows are flat panels with no parchment; the registrar text, charter names and signatures are light, the headings gold; the tabard model and its colour choices look as the game draws them.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.2.7 Role check popup

- Do: in a group, as leader, start a role check (the raid tools, or the group menu's Initiate Role Poll); also queue for a dungeon and let an invite popup show if you can.
- Expect: the role poll popup is a flat panel with themed Accept and close buttons; the role buttons still show their icons and still check when clicked; the dungeon invite popup looks the same.
- If it fails, paste: a screenshot and `/vg errors`. [Needs the game: tagged VERIFY IN GAME.]

### 14.2.8 Raid tab

- Do: in a party, open the raid tab (the friends window's Raid tab), then convert to a raid and look again.
- Expect: the eight group boxes are flat panels, the member buttons are flat and keep each name's class colour, Raid Info and Convert to Raid are themed buttons; nothing changes while you are in combat and it catches up after.
- If it fails, paste: a screenshot of the tab and `/vg errors`.
### 14.3.1 Stable (a hunter)

- Do: with a hunter, talk to a stable master.
- Expect: the stable window is a flat dark panel; the pet model sits on a dark box without the game's frame; the pet experience bar is a flat bar; the Purchase button and the pet slot captions are in the Vanguard font; clicking a stabled pet and Purchase still work.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.3.2 Trainer

- Do: talk to your class trainer; open the filter; click a skill; collapse and expand a category if the list has them; click Train.
- Expect: flat panel, no parchment behind the list, each row has no plate but keeps its icon, name, requirements and cost; the selected row shows the game's highlight; the filter button works (note whether its arrow is visible); Train works and Vanguard's Train all sits beside it.
- If it fails, paste: a screenshot with a row selected, and `/vg errors`.

### 14.3.3 Shift-click a stack

- Do: shift-click a stack of items in a bag, then use the arrows, type a number and press Okay; open the side dress-up window by control-clicking an item at a merchant or the auction house.
- Expect: the stack split window is a small flat panel with the amount in the Vanguard font and visible arrows; Okay and Cancel are Vanguard buttons and work; the dress-up window is flat with a Reset button.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.3.4 Coins from the money frame

- Do: click your gold in the backpack's money line (a plain click picks coins up and opens the amount window).
- Expect: the coin amount window is a flat panel; its coin icon and arrows are visible; Okay and Cancel work.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.3.5 Separate bags

- Do: in the game's options turn Combined bags off (or Vanguard's setting under Bags), `/reload`, and open each bag with its bag button.
- Expect: every bag window is a flat panel and each item slot is a square with a thin border in the item's quality color; the bag still sorts, searches and holds items as before.
- If it fails, paste: a screenshot of two open bags and `/vg errors`.

### 14.3.6 Master loot (in a group)

- Do: in a group set to master looter, kill something and right-click an item to assign it (the player list), then close it.
- Expect: the candidate list is a flat panel with flat player buttons in class colors; selecting a name assigns the item; the loot history window (the group loot history button, if your client has it) is flat with a working close button.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.3.7 Macros and icon pickers

- Do: type `/macro`, click Change Name/Icon; open the equipment manager and make a new set (its icon picker); open the guild bank's tab icon picker if you have one.
- Expect: the macro window and each icon picker are flat panels; the name box is a dark input box; the icon grid, the selected icon and Okay and Cancel work.
- If it fails, paste: a screenshot of the picker and `/vg errors`.

### 14.3.8 Stopwatch

- Do: type `/stopwatch`; press play, pause and reset; close it.
- Expect: a small flat panel with a title, the time digits and visible play and reset pictures; the three buttons work.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.3.9 Small dialogs

- Do: die and look at the return-to-graveyard button; open the addon list (`/addons` or the game menu) and change an addon that is out of date, if one is; trigger a message box (for example `/run BasicMessageDialog.Text:SetText("test") BasicMessageDialog:Show()`).
- Expect: the graveyard button is a flat button with its icon and text (nothing changes while you are in combat); the addon confirmation and the message box are flat panels with flat buttons, not full-screen dimmers of a different shade.
- If it fails, paste: a screenshot and `/vg errors`.
### 14.4.1 Game options

- Do: press Escape, click Options. Look at the window, click through Game and AddOns, type in the search box, change a setting, click Apply, then Close.
- Expect: a flat slate panel with the theme's close button; the Game and AddOns tabs with an accent line under the one you are on; the category list and the settings list on darker panels; flat Apply and Close buttons and search box. Every settings page still draws and works, and the title is still readable.
- If it fails, paste: a screenshot of the window and `/vg errors`.

### 14.4.2 Edit Mode

- Do: press Escape, click Edit Mode. Look, click a Blizzard frame (say the chat window) so its settings dialog opens, change a setting, click Revert on the dialog, click Save in the main window, then close Edit Mode.
- Expect: Edit Mode's window and its settings dialog on flat panels with the theme's buttons and title; Vanguard's note (`The labeled handles are Vanguard's frames...`) still sits under the main window; the settings dialog still resizes to its settings; Save works and nothing reports a blocked action (`/vg errors` empty, no "Interface action failed because of an AddOn" popup). Open the layout menu and pick New layout, Import layout and close without saving: their dialogs match.
- If it fails, paste: a screenshot while Edit Mode is open and `/vg errors`.

### 14.4.3 Addon list and chat settings

- Do: press Escape, click AddOns (or open the AddOns tab from the game menu), type in its search box, then close it. Right-click a chat tab and choose Settings, click through two categories, then Okay.
- Expect: both windows on flat panels with themed buttons and search box; the addon rows keep the game's look; in the chat settings the category list and the settings area sit on darker boxes, and every check box and color swatch still works.
- If it fails, paste: a screenshot of each window and `/vg errors`.

### 14.4.4 Keybinding, Cooldown Manager settings and click bindings

- Do: press Escape, click Options, Keybindings, then Quick Keybind Mode; press Escape to leave it. Open the Cooldown Manager settings from the game's Options (Gameplay Enhancements). Open the click-casting page in Vanguard's options and click its button that opens the game's click binding window (or open it from the spellbook).
- Expect: the quick keybind banner on a flat panel with its three buttons themed (the text stays white); the Cooldown Manager settings window and the click binding window on flat panels with themed buttons, search box and list background; the keybind mode still binds keys.
- If it fails, paste: a screenshot of the window and `/vg errors`.

### 14.4.5 Help, report and colour picker

- Do: press Escape, click Support (or the help button), look, close it. Open a color swatch (Chat Settings, any color swatch), drag in the wheel, then click Cancel. Right-click a player in a group and open Report if you can.
- Expect: the help window, the report window and the color picker on flat panels with themed buttons; the color wheel, the value and alpha bars and the swatches look exactly as the game draws them, and picking a color still works. If you have an open support ticket, its small status box keeps its icon.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.4.6 Death recap and the combat log bar

- Do: on a test character, die to a mob and click the Death Recap button on the release popup. Then open the Combat tab of your chat and click two of its filter buttons.
- Expect: the death recap on a flat panel with a themed Close button and title and the damage rows as the game draws them; the combat log's filter bar on a darker strip with flat filter buttons, still switching filters when clicked.
- If it fails, paste: a screenshot and `/vg errors`.
### 14.5 World map, group finder, Legacy and calendar

- Do: press `M` for the world map, then use its minimise and maximise button, click a few zones, open the quest panel on its side and click a quest; hover the group finder eye by the minimap, then click it to open the group finder; open the Legacy window from its button on the menu bar; type `/calendar`, open a day with an event and the "Create event" dialog.
- Expect: each window has Vanguard's flat dark panel, close button and buttons and no game border; the map itself stays fully visible with no dark box over it (also after minimising and maximising), the coordinate line still shows along its bottom, the nav bar's crumbs follow you into each zone, the calendar's days are dark tiles with event icons still showing, and the Legacy talent nodes and side tabs are untouched.
- If it fails, paste: a screenshot of the window, which of these steps broke, and `/vg errors`.
### 14.6 Menus and tooltips

- Do: (1) in a party, right-click a party member's frame and use Whisper, then right-click it again for Set Focus (once out of combat, once in combat), then right-click yourself for Leave Party; (2) click the minimap's tracking button; (3) right-click a chat tab; (4) at the auction house, open a dropdown (the category or sort filter); (5) open the guild window's Preferred Play Settings and its language dropdown, if your guild window has it (the game's last old-style dropdown); (6) type `/w ` and the first letters of a friend's name in chat; (7) click an item link in chat and hold Shift over the tooltip that opens, to compare it with what you wear.
- Expect: every menu and dropdown in (1)–(5) is a flat dark panel with a soft shadow and a thin border (no parchment or grey art behind it), its rows, checkmarks and hover highlight as the game draws them; every action in (1) does what it says, in and out of combat (an entry the game itself greys out in combat may stay grey), and no `Interface action failed because of an AddOn` message appears; the name suggestion box in (6) and the comparison tooltips in (7) are flat Vanguard tooltip panels. With "Right-click menus, dropdowns and more tooltips" unticked and a reload, all of them are the game's own again.
- If it fails, paste: the step number, a screenshot of the menu or tooltip, the exact message text if one appeared, and `/vg errors`.

### 14.7.1 The game's swing timer

- Do: type `/console showSwingTimer 1` and reload. On a warrior or rogue (Vanguard's swing timer on), auto-attack a mob. Then set **Swing timer (reload)** under `/vg` → Unit frames → Combat timers to Never, reload, and auto-attack again, stepping in and out of melee range.
- Expect: the first time only Vanguard's swing rows show, the game's bars nowhere (and no Edit Mode handle for them). With Vanguard's off, the game's bars show where Edit Mode puts them as thin flat bars in the theme's bar texture (main hand in the accent color), the hand's name and the seconds in the theme font, with no gold frame and no dark band behind the name; out of range their text turns red as the game's does and the gold frame still doesn't come back.
- If it fails, paste: a screenshot of each case and `/vg errors`.

### 14.7.2 Mind control: the possess bar

- Do: as a priest, cast Mind Control on an enemy, then click the possess bar's buttons (the controlled unit's attack, and the cancel button).
- Expect: the possess bar's two buttons look like Vanguard's pet buttons (art gone, icon cropped, a thin themed border); both work, nothing says an action was blocked, and the restyle is still there the next time you mind-control.
- If it fails, paste: a screenshot while controlling and `/vg errors`.

### 14.7.3 Crafting: the cast bar over the professions window

- Do: open a profession (First Aid, say) and craft several of something with a cast time.
- Expect: the cast bar over the professions window is a flat bar in the theme's bar texture in the cast color, green when each craft finishes, with no gold frame or end-of-cast glow; it shows again for each craft and goes away as the game's does; Vanguard's own cast bar works as before.
- If it fails, paste: a screenshot during a craft and `/vg errors`.

### 14.7.4 Zone text and the error line

- Do: ride into a new zone and a new subzone; then cast a spell at a target out of range; then change Text size under `/vg` → General and enter another subzone.
- Expect: the zone and subzone names in the middle of the screen and the red error line at the top are in Vanguard's font, with a soft shadow, and easy to read over the world; after the Text size change they are drawn at the new size.
- If it fails, paste: a screenshot of the zone name and of the error line, and `/vg errors`.

### 14.7.5 Defensives others cast on you

- Do: have another player cast a defensive spell on you (a paladin's Blessing of Protection or Blessing of Sacrifice, say).
- Expect: it shows in Vanguard's buff row only; the game's external defensives frame (an extra icon near the buffs) never shows.
- If it fails, paste: a screenshot and `/vg errors`.
### 14.8.1 Character pane side tabs

- Do: press C, then click each side tab in turn (Character, Reputation, Skills, Honor, Currency, Statistics).
- Expect: each tab is a flat dark tile with its icon still showing (none blank), a thin accent line on the selected tab only that moves with every click, and a faint wash under the mouse. [Needs in game: the tab art is faded by T.Tab, including its icon mask; if an icon is missing, paste a screenshot.]
- If it fails, paste: a screenshot of the pane with the tabs, the tab that is wrong and `/vg errors`.

### 14.8.2 Tabs on the other windows

- Do: open the friends window (O) and click each tab; at a mailbox click Inbox and Send Mail; at a merchant click Merchant and Buyback; inspect another player and click each tab; open the spellbook (P) and click its tabs and its category tabs; open the guild window and click its side tabs; open the group finder and the Legacy window and click their tabs.
- Expect: every tab is a flat dark tile with its text, the accent line is on the selected tab only and follows every click, tabs that the game shows later (a new profession, talents after learning them) look the same, and every tab still switches its page.
- If it fails, paste: which window and tab, a screenshot and `/vg errors`.

### 14.8.3 Inside the character pane

- Do: on the Reputation tab look at the list and click a header; on Skills look at a skill and click it; on Currency click a header; on the Character tab scroll the stats; hover a gear slot's flyout arrow (the equipment flyout) and look at the Honor tab.
- Expect: reputation and skill bars sit in a flat dark box with the game's colored fill unchanged, headers are flat buttons that keep their plus/minus icon and still open and close, the stat category titles sit in flat boxes, the flyout is a flat panel with item borders in quality colors, the honor tab's ring and badge show (only its decoration is dimmed), and each gear slot still shows its durability percent.
- If it fails, paste: a screenshot of the tab that is wrong and `/vg errors`.

### 14.8.4 Scroll bars

- Do: on the Reputation tab drag the scroll bar's thumb, click its arrows and mouse over the thumb; then scroll the friends list and the quest or mail list if they have bars.
- Expect: a flat track, a raised thumb that takes the accent edge under the mouse, flat arrows with the theme's arrow, and the list scrolls as before. [Windows whose scroll bars are not the game's newer ones keep their own.]
- If it fails, paste: a screenshot of the bar and `/vg errors`.

### 14.8.5 Switch

- Do: under `/vg` → Bars, map, chat → Game windows untick "Tab buttons and the inside of the character pane", `/reload`, open the character pane and the friends window.
- Expect: the tabs, the pane's lists and the scroll bars are the game's own again; the windows keep their Vanguard panels.
- If it fails, paste: a screenshot and `/vg errors`.

## When you are done

Paste into the first message of the next Claude session: the `/vg report` block (or the output of `/vg status` and `/vg errors`), the list of failed step ids, your screen resolution and UI scale, and the client build from the status line. Failures become tasks in `docs/handoff/WORKPLAN.md` before the performance phase starts.
