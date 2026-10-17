# Vanguard smoke test (for the owner)

Run this once in the WoW Forever beta after the P0 branch is merged. **Nothing in it has been seen in the game.** Every "Expect" line is what the code intends, read from the source when this was written, not something anyone watched happen. A step that fails is the useful result: it tells us what to fix.

Written against the Forever client build 1.60.1.70170 (the Blizzard UI source the code was checked against). `/vg status` prints the build you are really on.

Things to know before you start:

- The checklist changes your saved settings (a throwaway profile, `/vg reset all`). Use a spare character, or run `/vg export` first and keep the string.
- Steps that need other players (party, raid, main tank, ready check) or an instance are marked "if you can". Do not block the report on them.
- Where an Expect depends on an earlier fix, a bracketed note says which. If that fix did not land, the note says what you will see instead.
- Quote chat lines as they appear; a missing or different line is a finding.

## Run order by crash risk

If the beta closes before you finish, do these first and stop after any step that throws a Lua error (paste the report block):

1. 1.1 to 1.4: install, first login, `/vg status` (also read the real Interface build from it and put it in `Vanguard.toc` before packaging), `/vg errors`.
2. 7 and 3.3: combat with auras, cast bars, nameplates and unlocked frames.
3. 9.4 and 14.9.2: open the auction house, then Post from the Posting tab. Run `/vg errors` right after.
4. 14: each skinned game window, opened once in combat and once out of it.
5. Everything else, in section order.

## Report block

For every failed step, paste all of this (steps below say "If it fails, paste:" for anything extra):

1. The step id (for example `3.3`).
2. The whole output of `/vg status`. Today it is five lines: the version, profile and module count; the skinned, painted and waiting-on-combat counts; the client line (`Client WoW Forever`, the build, `auras on the engine` or `auras on the fallback`, `aura values readable` or `hidden right now`, and whether secure snippets work); a `Client has: ... lacks: ...` line; and the `UI scale ... text ... chat ...` line.
3. The whole output of `/vg errors`: either `No errors caught this session.`, or a header with the version, interface number and error count, the client line, and each error with `(xN)` and its stack lines.
4. A screenshot (Print Screen; the files land in the game's Screenshots folder).

Shortcut: `/vg report` puts items 2 and 3 in one box, selected for copying (`### Vanguard report v1 ###` to `### end ###`), with the screen size, the modules turned off and the skins. Press Ctrl+C and paste it whole; it is the same block the feedback form on vanguardui.com reads. `/vg feedback` (or Report a bug on the Feedback page in `/vg`, the last page in the list) goes one further: it asks the form's own questions in game and makes one block, the report inside it, that fills the form when pasted into it.

## 1. Install and first login

### 1.1 Link the addon

- Do: in a clone of the repository run `npm run link:wow -- --wow "<folder that has Interface/AddOns>"`, then `npm run link:wow -- --status`. (Or unzip a release into `Interface/AddOns/` and skip this step.)
- Expect: a message ending `/reload in game.`, and `--status` reporting the link. If a real Vanguard folder is already there, the message is `... is an installed copy. Add --replace to move it aside and link this clone.`
- If it fails, paste: the whole terminal output of both commands.

### 1.2 First login opens the setup wizard

- Do: at character select open AddOns and tick Vanguard, then log in on an account that has never run it (or delete both `WTF/Account/<account>/SavedVariables/Vanguard.lua` and the character's `WTF/Account/<account>/<realm>/<character>/SavedVariables/Vanguard.lua` first; deleting only the account's file is the settings-loss check in 4.7).
- Expect: the setup wizard opens by itself with the caption `Step 1 of 4 · Layout` and Keep my current layout picked; the layout for your role says `your role`. If you log in during combat it waits and says `Setup opens when combat ends.`
- If it fails, paste: the Report block.

### 1.2a Closing early, Skip, and a new character

- Do: on that first login, close the wizard with the X, then `/reload`. Then click **Skip setup** and `/reload` again. Then `/vg setup` and click through to Done. Then log in on a character that has never run Vanguard, pick **A profile of its own**, Next, pick Centered: healing, Next, and finish. Log back to the first character.
- Expect: after the first reload the wizard is back (chat said `Setup opens again at your next login.`); after Skip it stays away and asks nothing. Finishing the rerun asks nothing either. The new character's wizard reads `Step 1 of 5 · Profile`; with a profile of its own, `/vg` → Profiles says `This character uses <its name>.` with no reload, and the first character's frames haven't moved.
- If it fails, paste: the caption you saw, the Profiles page text and `/vg errors`.

### 1.2b What's new after an update

- Do: on an account that has finished setup, install a build whose `## Version` has notes in `Core/WhatsNewNotes.lua` over an older one, and log in. Click the first line with a setting. Then `/reload`, and type `/vg whatsnew`.
- Expect: after login the window `What's new in Vanguard <version>` shows once, its lines under module headings; a line for something off by default ends in `(off by default)`. The click closes it and opens `/vg` on that line's page with its row marked. After the reload it doesn't come back by itself; `/vg whatsnew` opens it again (so does **What's new** under General → Layout).
- If it fails, paste: the version from `/vg status`, a screenshot of the window, and `/vg errors`.

### 1.3 Status

- Do: type `/vg status`.
- Expect: the lines described in the Report block. The client line says `Client WoW Forever` and `auras on the engine`. [After P0.3: `auras on the fallback` means the client refused the aura container and Vanguard fell back; `/vg errors` should say so.] [After P0.6 and P0.11: the `Client has:` line and a `secure snippets: yes` part are present; `secure snippets: no (hover keys off)` means the client could not run secure snippets.]
- If it fails, paste: the whole `/vg status` output and `/vg errors`.

### 1.4 No errors yet

- Do: type `/vg errors`.
- Expect: `No errors caught this session.` Anything else is the first bug report. [After P0.2: each entry shows a count and a stack.]
- If it fails, paste: the whole `/vg errors` output.

### 1.5 Memory over a minute

- Do: stand still in a city out of combat, type `/vg mem`, and wait a minute without opening windows. Then repeat it once.
- Expect: the first line says `Measuring Vanguard's memory for 60 s`; after a minute two lines: `Vanguard's memory over 60 s: A MB to B MB (+N KB, +R KB/s), low L, high H MB.` and a verdict (`The low point held: ...garbage the game collects` or `The low point rose N KB: Vanguard is keeping memory`). Growth of a few hundred KB that falls back is normal; a low point that rises on every run is not. In combat `/vg mem` says it can't read, and `/vg perf` says `memory: not read in combat`.
- If it fails, paste: both result lines of each run, what you did during the minute, and `/vg errors`.

## 2. Options window and wizard

### 2.1 Every options page

- Do: type `/vg`, then click each page in the left list in turn: General, Modules, Unit frames, Raid frames, Healing, Click casting, Talents, Action bars, Nameplates, Quests, Bars and bags, Map, Chat, Game windows, Combat tools, Town and gear, Situations, Profiles and Feedback (19 pages in all). After each, type `/vg errors`.
- Expect: each page draws its rows with no Lua error popup, and `/vg errors` stays empty. All 19 entries fit in the list without running off the bottom, each with its own icon (the six that replaced Bars, map, chat have a laurel crown, a compass, a raven, a checked shield, a battle axe and a castle), and every icon and label starts at the same spot down the list, and a search for a setting that used to be on Bars, map, chat (say "Craft queue") lights the page that has it now.
- If it fails, paste: the page name, a screenshot of it, and `/vg errors`.

### 2.1a Situations: Stop recording only while recording

- Do: type `/vg`, open Situations with Record for at Off, and look at **Stop recording and save**; click it. Then set Record for to Solo and look again; click Stop recording and save.
- Expect: with Record for at Off the button is greyed out and a click does nothing (no chat line). While recording it is bright and a click saves (`Solo: ... saved.` in chat), Record for goes back to Off and the button greys out again.
- If it fails, paste: a screenshot of the page, the chat lines and `/vg errors`.

### 2.1b Windows are opaque

- Do: stand where the world behind is bright (snow, sky, a lit city). Type `/vg` and open Situations and Talents (short pages); then open a merchant, your character pane and the quest log (L).
- Expect: no world shows through any of these windows, including the empty space under a short options page. Tooltips and menus may still be very slightly see-through (that is the theme's panel opacity, not a window).
- If it fails, paste: a screenshot of the window over the bright ground and `/vg errors`.

### 2.2 The wizard, start to finish

- Do: drag a frame with `/vg unlock`, then open `/vg` → General → **Run setup**. Click Next three times, then Done.
- Expect: `Step 1 of 4 · Layout` with four choices (Centered: damage and tanking, Centered: healing, Like the game's, Keep my current layout), Keep picked; the frame you dragged stays where it is at the end. Next goes to `Step 2 of 4 · Screen`, with a choice per screen size (1080p, 1440p, 4K, Ultrawide), the one for your screen marked `your screen`, `Pixel-perfect (sharpest)` and `Keep my current sizes` (picked); under them the hint names who sets your UI scale now (`the game's UI Scale slider` or `Vanguard's pixel-perfect scale`), in full and inside the window, and clicking a preset shows a two-line hint that it moves the game's UI Scale slider; Next goes to `Step 3 of 4 · Look` (the accent swatches and the raid frame style); Next goes to `Step 4 of 4 · Move things` with every frame's handle showing; the button then says Done, and Done hides the handles and the wizard and offers `Setup is done. Reload the UI now to apply it?`. No profile backup is mentioned in chat, since nothing changed. Escape and the close button close it too. After `/reload` the wizard does not come back by itself.
- If it fails, paste: the step id, the caption you saw, and `/vg errors`.

### 2.3 The healing layout

- Do: type `/vg setup`, pick Centered: healing, click Next once, then close the wizard. Open `/vg` and look at Click casting.
- Expect: chat says `Profile <name> as it was before setup is saved as profile <name> backup.`, and `/vg` → Profiles lists that backup. The raid frames sit centred above the cast bar, growing upward; click casting is on. Under Raid frames, Sort by role, Power bar, Show your HoTs and Incoming heals are ticked and Debuff icons is 3; under Nameplates, Threat colors is off and Your debuffs shown is 2. Picking Centered: damage and tanking instead unticks Sort by role, Power bar, Show your HoTs and Incoming heals, sets Debuff icons to 2, and turns threat colours on with 6 debuffs. Closing the wizard offers a reload (`Setup turned on a module that was off.` if Raid frames or Click casting were off before, else `The layout's raid frame, raid aura and nameplate settings show after a reload.`).
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

### 3.6 Anchor the cast bar under the player frame

- Do: type `/vg unlock`, right-click the Player cast bar handle, set **Anchor to** to Player and **Side** to Bottom, type `-4` in Y offset and press Enter, click **Save and lock** on the bar at the top. Change spec (if your character has one), `/reload`, then turn Unit frames off under `/vg` → Modules, `/reload`, turn them on again and `/reload`.
- Expect: the popover title reads `Player cast bar  ·  Below Player`, the cast bar sits 4 px under the player frame's bottom edge and stays there after the spec change and the reload; with Unit frames off it stays where it was (on screen), and with them on again it is under the player frame. No error.
- If it fails, paste: a screenshot of each step that went wrong and `/vg errors`.

### 3.7 Exit without saving

- Do: type `/vg unlock`, drag two frames somewhere new, then click **Exit without saving** on the bar at the top of the screen.
- Expect: the chat line `Every frame is back where it was when you unlocked.`, both frames back where they were, and the handles and the bar gone.
- If it fails, paste: which frame stayed moved and `/vg errors`.

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

### 4.4 Export only the layout

- Do: type `/vg export pick`, click None, switch on Layout (positions and movers) and click Export; copy the string. On another character (or after `/vg profile new Other` and a reload), move one frame with `/vg unlock`, change the accent with `/vg accent fel`, then `/vg import` the string and reload.
- Expect: the panel lists Layout, Situations overrides, Global settings and your modules, all on at first; the box is titled `Vanguard export (layout)  Ctrl+C to copy` and its string starts `VG1:parts:`. The import says `Imported layout settings into profile <name>.` and `Profile <name> as it was before this import is saved as profile <name> backup.`; after the reload the frames sit where the string put them and the fel accent is still there.
- If it fails, paste: the chat lines, a screenshot after the reload, and `/vg errors`.

### 4.5 Import a large string

- Do: on a profile with many modules set up, type `/vg export`, copy the string, then `/vg import`, paste it and click Import.
- Expect: no freeze; for a large string the box's title counts up (`Importing… 40%`) before it closes. Your own unchanged export says `This string matches profile <name>, which this character already uses: nothing new to import.` and makes no `Imported` profile.
- If it fails, paste: how long the game froze, the chat lines and `/vg errors`.

### 4.6 Import a font this client lacks

- Do: with another addon's font picked under General → Font, `/vg export` the profile; disable that addon (or use a client without it), reload, and `/vg import` the string.
- Expect: chat names it: `Font not found: <name> (no addon here shares it). Vanguard uses its default font instead.`, and the text is drawn in Fira Sans Condensed.
- If it fails, paste: the chat lines and a screenshot of some text.

### 4.7 Lost settings come back

- Do: change the accent (`/vg accent fel`), then log out to character select and quit the game. Rename `WTF/Account/<account>/SavedVariables/Vanguard.lua` to `Vanguard.lua.bak` (keep the character's own file), start the game and log in on the same character. Click Restore, then Reload. Afterwards quit, put the `.bak` file back under its own name if you want the old file, and also try once with the character's file renamed instead of the account's.
- Expect: chat says `Vanguard's saved settings didn't load this session (the account file came back blank). This character kept a backup.`, a question asks `Vanguard's saved settings didn't load. Restore profile <name> from this character's backup?`, the setup wizard stays shut, and `/vg` → General starts with the notice. After Restore and the reload the fel accent is back and nothing is asked again. With only the character's file renamed, chat says `This character's saved Vanguard settings didn't load; it uses profile <name> again.` and setup stays shut.
- If it fails, paste: the chat lines, whether the question showed, and `/vg errors`.

### 4.8 Reset asks first and keeps a copy

- Do: `/vg accent fel`, then `/vg` → Profiles. Hover **Delete** and **Copy here** on another profile's row (make one with `/vg profile new Spare` if there is none). Click **Reset profile**, then No; click it again, then Reset.
- Expect: the tooltips say what each loses (`Deletes profile Spare for every character on this account. It can't be undone.`, `Replaces every setting in profile <yours> with profile Spare's. It can't be undone.`). Reset asks `Reset this profile? Every setting in profile <yours> goes back to Vanguard's defaults, for every character that uses it. A copy is kept as profile <yours> backup.`; No changes nothing; Reset says `Profile <yours> as it was is saved as profile <yours> backup.` and the list shows that backup. After the reload the accent is brass again, and **Copy here** on the backup brings fel back.
- If it fails, paste: the question's text, the chat lines and `/vg errors`.

## 5. Pixel borders

### 5.1 Border width at 1440p

- Do: set the game to 2560x1440 and UI scale 1.0 (the game's UI Scale setting, usually under Options, System, Advanced; confirm the path in your client). Take a screenshot of the player frame's edge and zoom in. Type `/vg status`.
- Expect: the border exactly 1 screen pixel wide, and `UI scale 1.00` in the status text line. [After P0.4. Before it the border is 2 px at 1440p, because the old size was one UI unit rounded to whole pixels.]
- If it fails, paste: the zoomed crop, your resolution, and the `UI scale` line.

### 5.2 Pixel-perfect preset

- Do: `/vg setup`, Next, pick **Pixel-perfect (sharpest)**, then finish. Screenshot the action bars, the player frame and the `/vg` window's close button, and zoom in. Then drag a frame's scale slider in unlock mode to 150% and screenshot it again.
- Expect: the hint under the choices starts `Sharpest: every line on whole screen pixels.` Every border, button edge and gap between action buttons is a whole number of screen pixels, with no blurred or doubled line; the close button's cross sits centred on its faint slate tile (the tile turns red under the mouse; maximize and minimize turn accent). On a 4K screen each UI unit is two pixels. After the scale change, borders are still sharp.
- If it fails, paste: the zoomed crops, your resolution, `/vg status` and `/vg errors`.

### 5.3 Hover, press, focus and window motion

- Do: open `/vg` and move the mouse slowly over a few buttons (Run setup, Move frames); hold the mouse button down on one, then let go away from it. Press Tab a few times. Close `/vg` and open it again. Then start a fight (a training dummy) and open `/vg` during it.
- Expect: a button eases to a lighter fill with a thin light line along its top as the mouse comes over, and eases back as it leaves; a disabled button shows no hover and its label is grey. Held down, a button goes a shade darker and its label sits a pixel lower; it comes back when you let go. Tab puts a thin accent ring, with a dark gap, around the marked row and moves it to the next. The window rises a few pixels into place as it fades in and ends sharp, not blurred; it closes quickly. In combat it opens at once. With Reduce motion on, all of it is instant.
- If it fails, paste: a short video or two screenshots, and `/vg errors`.

### 5.3a Control rows: calendar Filters, pane arrow, finder gear

- Do: open the calendar (click the info strip's calendar button), the character pane (C) and the group finder. Look at each window's top-right corner.
- Expect: on the calendar the Filters button ends a small gap left of the close button's tile, level with it, not touching it. The character pane's arrow (beside its close button) and the group finder's gear sit on the same faint slate tile as the close button, their icons inside it.
- If it fails, paste: a zoomed screenshot of the window's top-right corner and `/vg errors`.

### 5.4 Color assist and state glyphs

- Do: target a hostile mob, then a neutral one, then a friendly NPC. Tick Color assist under `/vg` → General → Look and reload, then target the same three. On a hunter, look at the pet frame's top-right corner.
- Expect: before, red, yellow and green health bars; after, vermilion, yellow and blue. The pet's mood is a check (happy), a triangle (content) or a cross (unhappy), in green, amber or red.
- If it fails, paste: screenshots and `/vg errors`.

## 6. Party and raid

### 6.1 Party frames (if you can)

- Do: join a party.
- Expect: party frames just above the player frame, growing upward, and the game's own party frames gone.
- If it fails, paste: a screenshot and `/vg errors`.

### 6.2 Raid frames (if you can)

- Do: as leader or assistant, press the Raid button on the raid tools bar (top left) to convert to a raid, then press Ready on the same bar.
- Expect: raid frames in groups, 100x48 tiles at 10 members or fewer and smaller above that; the ready check starts. A debuff you can dispel shows its type's letter (M, C, D or P) in the icon's top-left corner, in combat in an instance too.
- If it fails, paste: a screenshot and `/vg errors`. In an instance during combat `/vg status` should say `aura values hidden right now` while the bars still fill; paste that line if the bars do not fill.

### 6.3 Main tank tiles (if you can)

- Do: in a raid, mark a main tank.
- Expect: a small tile for that player at the top left, beside the raid tools, with health in their class colour.
- If it fails, paste: a screenshot and `/vg errors`.

### 6.4 Preview the party and raid frames alone

- Do: on a profile whose frames you haven't moved (for example a new one from `/vg` → Profiles), out of a group and out of combat, type `/vg preview party`, then `/vg preview 25` and `/vg preview 40`. Open `/vg` → Raid frames, change Width, Height, Style, Sort by role and Groups as, then pick Off under Preview. Turn it on again and attack a training dummy.
- Expect: five sample tiles in a column just above your player frame, centered on it (one Dead, one Offline, a shield and a cross before the tanks' and healers' names), then 10 the same, with two groups side by side; 25 and 40 drawn smaller, at the left of your character with their groups stacked as rows (five across, one group above the next), clear of your pet, focus and player frames; **Stack big raids at the left** off puts them back over your player frame in columns; each settings change shows on the preview at once. Off hides it, and combat hides it with a chat line. Your real frames don't change until a reload.
- If it fails, paste: a screenshot, `/vg errors` and `/vg frame Vanguard_RaidPreview`.

### 6.5 Raid readiness on the ready-check card (batch 2)

- Do: `/vg` → Town and gear → Instance prep, switch on "Buff checks on the card" (and "World buffs among them"). Out of combat, without a flask, food buff, weapon oil or poison, or your class's raid buffs, type `/vg prep`. Then get each one and type `/vg prep` again; then start a ready check in a group, and finally type `/vg errors`.
- Expect: the card lists Flask, Food buff, Fortitude, Mark of the Wild, Arcane Intellect, a weapon row and (with a weapon in the off hand) an off-hand row, each "missing" in red; each row goes when you have the buff. World buffs shows only while you have none. In an instance during combat no buff row appears; `/vg status` saying `aura values hidden right now` also means none. No Lua error.
- If it fails, paste: a screenshot, `/vg errors`, and the names of the buffs you have (the names in the code are from the classic game and unchecked on Forever).
### 6.5b Wanted amounts window

- Do: `/vg` → Town and gear → Instance prep → **Set wanted amounts...** (or `/vg prep setup`), out of combat. On step 1 drag the food slider, click **Use suggested**, then Next through to Done. Try `/vg prep want potions 7` afterwards, and `/vg prep`.
- Expect: step 1 has Food & drink, Bandages and Potions sliders; hunters and warlocks get a second step with Ammo or Soul shards; the last step lists your amounts and whether anything is short; Esc and the close button close it; the amounts take effect at once, and `/vg prep` shows rows against them. No Lua error.
- If it fails, paste: a screenshot and `/vg errors`.

### 6.6 Group threat panel (batch 2)

- Do: `/vg` → Unit frames, switch on "Group threat panel" and `/reload`. In a party with a tank, target a hostile mob out of combat, then pull it. In the open world, then a dungeon, then on a boss, watch the panel; at the same moment type `/run print(C_Secrets.ShouldUnitThreatValuesBeSecret())` and `/vg errors` (this is the threat test of issue #223).
- Expect: the panel lists the group by threat on your target, highest first, with the tank at the top; it hides when you drop the target or leave the group. If the game prints `true` (threat hidden), the panel must be hidden during the fight, and there must be no Lua error either way. `/vg unlock` lets you move it.
- If it fails, paste: a screenshot, the printed line, which place you were in (world, dungeon, boss), and `/vg errors`.

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

### 7.4 Nameplates in a crowd

- Do: in a capital city with friendly player plates on, stand where several players' plates overlap. Click the bar or name of four or five plates in turn, and move the mouse slowly across them. Then turn on the game's option to show only names on friendly players' plates and click one again. Find a player with a defensive cooldown up, or buff a friend yourself.
- Expect: each click targets the player whose bar or name you clicked (not a neighbour), and the name-only option doesn't stop the click. The plate under the mouse has a faint white wash that goes when the mouse leaves. A player's buffs show right of the bar, past the target diamond: their defensives, and on friends the buffs you cast. Mobs show none.
- If it fails, paste: a screenshot with the mouse over the plate you clicked, the name of who got targeted, and `/vg errors`.

### 7.5 Enemy nameplates (#377)

- Do: log in on a character, stand near a hostile creature and look for its plate. Type `/vg plates`. Open `/vg` > Nameplates, untick Enemy nameplates, then tick it again; do the same with Friendly players' and Friendly NPCs' nameplates. Press V, `/reload`, and check that the plates stay as V left them.
- Expect: hostile creatures in range have a Vanguard plate at the first login without pressing anything. `/vg plates` gives plates drawn, how many are attackable, and Enemy on. Each switch hides and shows that kind of plate, and the Enemy switch follows V. After the reload Vanguard does not turn enemy plates back on. [Needs in game: that nameplateShowEnemies, nameplateShowFriendlyPlayers and nameplateShowFriendlyNPCs are the Forever 16001 CVar names (nameplateShowFriends is not: GetCVar gives nil) and that the client keeps them after a reload.]
- If it fails, paste: the `/vg plates` line, a screenshot, and `/vg errors`.

### 7.6 Fight recap

- Do: under Combat tools tick "Recap in chat after each fight". Fight a mob for a few seconds (in a group, interrupt or dispel something if you can). Type `/vg recap`, then `/vg recap party` in a group. In the fight's first seconds type `/vg recap`. Then type `/run for _, k in ipairs({"Interrupts","Dispels","DamageTaken","Deaths","AvoidableDamageTaken"}) do print(k, Enum.DamageMeterType[k]) end` and paste what it prints.
- Expect: half a second after the fight a chat line "Fight recap: Interrupts 1  ·  Dispels 0 ..." with only the parts the meter had; the same for `/vg recap`; `/vg recap party` sends that one line to party chat; during the fight `/vg recap` says the meter is hidden until the fight is over. [Needs in game: that those Enum.DamageMeterType keys exist, that a session of each has combatSources with isLocalPlayer and totalAmount, that Deaths lists one line per member who died, and that SendChatMessage to party works from a slash command.]
- If it fails, paste: the `/run` line's output, the recap line and `/vg errors`.

### 7.7 Vanguard meter (off until switched on: /vg > Combat tools > Vanguard meter)

- Do: type `/vg meter on` and fight a mob for a few seconds (in a group if you can); click the panel's title; type `/vg meter hps`, then `/vg meter dps`. Then type `/run for _, k in ipairs({"Dps","Hps"}) do print(k, Enum.DamageMeterType[k]) end` and paste what it prints.
- Expect: a flat panel at the bottom right, just left of the bags and menu bar, clear of the tooltip when you hover a player (move it with `/vg unlock`; turn the game's meter off in its settings to see only this one), "Damage per second", with up to eight bars in class colors, each with a number, a name and a figure, yours in the accent; the figures update during the fight and stay after it; the title switches to "Healing per second" and back. In an instance, if the game hides values, lines may be blank or "Nothing to show", never an error popup. [Needs in game: that the two Enum.DamageMeterType keys exist, that a session's combatSources lines carry name, classFilename, amountPerSecond and isLocalPlayer, that SetValue, SetMinMaxValues and SetText accept the hidden values in combat, that AbbreviateNumbers does too, and that the panel is wide and tall enough to read. `/vg errors` must stay empty.]
- If it fails, paste: the `/run` line's output, what the panel shows in combat and `/vg errors`.

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
- Expect: Vanguard's log with quests under their zones (click a zone to fold it), `[12] Title` lines in difficulty colours, and Track or Untrack, Share, Abandon and Map for the chosen quest. Click Track or Untrack, then Shift-click another quest: the button flips each time and the tracker follows; if the game refuses, chat says `The game didn't track ...` with the count tracked. Hover a reward card (a quest with an item reward): the item's tooltip shows beside it and goes when you leave. [Needs in game: the tooltip must show for both choices and fixed rewards.] If it is off, `/vg quests` says `Vanguard's quest log is off (/vg > Quests).`
- If it fails, paste: a screenshot and `/vg errors`.

### 8.4 Quest tracker overflow

- Do: watch more quests than fit under the info strip.
- Expect: a `+N more` line at the bottom of the tracker. Click it: the tracker grows to at most 10 quests, ending in `Show fewer` (with `· +N more` past ten). `/reload`: it is still expanded. Click `Show fewer` to fold it.
- Also expect (Legacy challenges): with a challenge tracked in the game (its Legacy window), a `Legacy challenges` heading sits under the quests with the challenge beneath it, its criteria as `- 2/3 …` lines and `Complete` once done. Right-click the challenge: it leaves the tracker. With none tracked, no heading. A heading never shows alone: when no challenge fits under it, it is left out and the `+N more` line counts the challenges. [Needs in game: how a Forever client tracks a challenge, and that its criteria text reads as above.]
- If it fails, paste: a screenshot.

### 8.5 Levelling helpers

- Do: watch a quest worth XP, hover the XP bar, kill a few mobs that give XP, turn in nothing yet, then let your food fall under the wanted count (`/vg prep want food 20`) by using or selling some.
- Expect: the quest's XP under its objectives in the tracker; the XP bar's tooltip lists what is left, how far through, rested, `Kills to level` (after your first kill, and not changed by a quest turn-in) and `XP in finished quests` (only quests ready to turn in); one `Running low: Food & drink n / 20.` line in chat when food drops under the count, nothing further until it has been back at 20 and drops again, and nothing during a fight (it appears after).
- If it fails, paste: a screenshot, the chat line and `/vg errors`. Say which came first in chat: the XP message for a kill or the XP bar moving.

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
- Expect: a button reading `Train all (N)` on the trainer window, clear of your money line; clicking it prints `Trained N skill(s) for <money>.`; in combat it does nothing.
- If it fails, paste: a screenshot of the trainer window and `/vg errors`.

### 9.4 Lists and Posting tabs at the auction house

- Do: talk to an auctioneer; click the Lists tab, then Posting, then the game's Buy; on Lists click a list in the Lists pane, then a row of it (its listings), then Back; click Scan the auction house, then the pane's Deals and Upgrades entries; on Posting drop an item on the sell slot, click Your history and Up now on the card at the top right, then click the same item in a bag.
- Expect: two tabs, Lists and Posting, after the game's Buy, Sell and Auctions, in the same look as the game's; the window's title says Lists or Posting while one is open. Lists: the Lists pane on the left (your lists with their counts, Recent, Deals, Upgrades; six buttons under them; the scan button at the bottom), the list picked on the right as a table with headings (Item, Unit price, Up, Max) under a toolbar (+ Add, Search list, Restock), about twenty rows; a row's listings replace the table with Back and the item above sortable columns; after the scan, Deals shows its rows (Unit price, Under by, Judged against) and Upgrades its rows (Slot, Gain, Unit price) with the counts beside the entries, or a line saying none were found. Posting: the Sell card on the left with one field a row, Up now at the top right (the item's listings, yours flagged; Your history in its place on the toggle), Your auctions at the bottom right with Check undercuts and Cancel next undercut on its heading line; every card inside the window. A listing, deal or upgrade clicked switches to the game's Buy page with the item in its list, and Lists brings back the view where it was; the sell slot takes the dropped item; a bag click with Posting open keeps the window on Posting with the item on the Sell card (from the game's own tabs it shows the game's Sell page, and the item is on the Posting card too).
- If it fails, paste: a screenshot of each tab and `/vg errors`.

### 9.5 Sort clear of the backpack icon

- Do: without a gamepad, open your bags (combined bag on) and look at the top row. Click Sort, including on its right half. Close and open the bags, then `/reload` and open them again.
- Expect: the search box, then the whole word `Sort` on its button ending just inside the window's right edge; no backpack icon in the top-right corner (the backpack stays on the bag bar by the menu). Every click on Sort sorts your bags.
- If it fails, paste: a screenshot of the bag's top row, and with the icon still there, a screenshot of `/fstack` while hovering it; and `/vg errors`.

### 9.6 Items drag out of the bag under the quest tracker

- Do: with some quests watched, open your bags so the window covers the quest tracker on the right. Click and drag items from every part of the window, including the slots under where the tracker sits: onto an action bar, into another slot, and out onto the ground.
- Expect: the bag window draws over the tracker (no quest text shows through it), and every item picks up and drops. Quest item buttons beside the tracker are also under the window.
- If it fails, paste: a screenshot of `/fstack` while hovering a slot that won't drag, and `/vg errors`.

### 9.6 Boat and zeppelin timer (off until switched on)

- Do: under Town and gear tick "Boat and zeppelin timer (reload)" and `/reload`. Board a boat or zeppelin and ride it to the other dock. Board the same one from the same dock again. Afterwards type `/run print(C_Map.GetPlayerMapPosition(C_Map.GetBestMapForUnit("player"), "player"))` once while standing on a boat and paste what it prints.
- Expect: about three seconds after you board, a bar above the cluster says "Timing this ride"; stepping off hides it and saves the time under "where you boarded > where you got off". The second ride from that dock counts down from the saved time, with the place you landed last time. [Needs in game: that the client gives no map position for you on a boat or zeppelin (the code takes that as being aboard), that the sub-zone names at the docks differ from each other, and that the position comes back as soon as you step off.]
- If it fails, paste: the `/run` line's output, the dock names, and `/vg errors`.

## 10. Click casting

### 10.1 Make a binding

- Do: type `/vg`, open Click casting, click Set key and press Shift+Q (a hover key) or Shift and left-click, set Action to Spell, type a spell name, and click Add binding. Then type `/vg binds`.
- Expect: the key text `Shift + Q (hover)` or `Shift + Left click` in the editor and a row in the list below; `/vg binds` prints `Click casting (this spec):` and then `  Shift + Q (hover)  ->  <spell>`.
- If it fails, paste: the `/vg binds` output and `/vg errors`.

### 10.1a Hover keys card on a fresh character

- Do: on a character with no hover keys, type `/vg` and open Click casting. Scroll just far enough to see the "KEYS WHILE HOVERING A FRAME" card's title.
- Expect: right under the title, an **Add key** button with "No hover keys yet. Add one, press the key, pick the spell." beside it (wrapped inside the card). If `/vg status` says `secure snippets: no`, the line "This client can't compile the secure code hover keys need; mouse bindings still work." sits there instead. Keys you add list under that line.
- If it fails, paste: a screenshot of the card, `/vg status` and `/vg errors`.

### 10.2 Use it

- Do: out of combat, hover a party or raid tile (or your own frame) and press the key or click.
- Expect: the spell is cast on that unit. [After P0.11: if `/vg status` says `secure snippets: no`, hover keys are off on purpose and only mouse bindings work; paste that status line.]
- If it fails, paste: `/vg binds`, `/vg status` and `/vg errors`.

### 10.3 Bar 1 pages with stances and forms

- Do: on a warrior, druid or rogue, change stance, form or stealth out of combat, then again in a fight; also press Shift+2 and Shift+1.
- Expect: bar 1's icons change with each stance, form or stealth and with Shift+number, in and out of combat, and the button casts what it shows. This holds whether `/vg status` says `secure snippets: yes` or `no` (with `no`, bar 1 pages through the game's own page attribute).
- If it fails, paste: your class, what you changed, what the bar showed, `/vg status` and `/vg errors`.

### 10.4 Keybind mode on the action bars

- Do: out of combat, type `/vg keybind`. Hover an empty slot on bar 1 and press Shift+Q; then, still over it, press mouse button 4, roll the wheel down, and press Backspace. Hover a button that has a key and press W. Hover a button and left-click it. Press Escape.
- Expect: a banner at the top, and a tooltip over each button naming it and its keys. Shift+Q, the side button and the wheel each bind in turn (the hotkey text shows SQ, M4, WD) and chat says so; Backspace clears the key and chat says what it was; W binds and chat says it was taken from Move Forward; the left click binds and casts nothing. Escape closes the banner and the tooltip; the keys still work and survive `/reload`.
- If it fails, paste: what you pressed, what chat said, the key's hotkey text, and `/vg errors`.

## 11. AFK

### 11.1 AFK card

- Do: standing still out of combat, type `/afk`. Move. Type `/afk` again, then click or press a key.
- Expect: the screen dims to a card with your name in your class colour, level and class, the zone, time away, the clock and an XP bar, and under the card your faction's passage (Varian's letter for Alliance, the Blood Oath for Horde; in Cinzel or Metamorphous with the faction look on Crest and heading font, otherwise in Fira Sans) in the crest colour; moving removes it; a click or key removes it until you are next away; it never shows in combat.
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
- Expect: one bar with the bag buttons over the menu buttons on dark framed slots (the menu row's taller, each game icon filling its slot, sharp and whole (not a blurred piece of it), with no grey plate around it, the same size when a window it opens is open, nothing crossing the divider; no accent edge on a slot until the mouse is over it), an accent line between the rows, no brass box; it is always shown by default (Bags and game menu under Bars and bags changes that). [Before the row anchors were given a size, the bar drew its panel and divider with nothing in it: the client gives a zero-sized frame no rect, and draws nothing anchored to one.]
- If it fails, paste: a screenshot of the corner, and the output of `/vg frame Vanguard_MenuStrip deep`, `/vg frame BagsBar deep` and `/vg frame MicroMenu deep` (`/vg copy` gives the chat as text).

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

- Do: under `/vg` → Game windows, untick one group (say "World map, group finder, calendar and Legacy windows"), reload, open the world map.
- Expect: the map is the game's own again; the other groups' windows keep the Vanguard look.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.2.1 Open a letter

- Do: at a mailbox, open a letter that has text and, if you can, one with an attachment or money (an auction invoice works).
- Expect: the letter window is a flat panel with no parchment behind the text; the text is light and any headings gold; Reply, Delete, Cancel and Report Spam are flat buttons; the attachment and money buttons have a thin border in the item's quality color; open a second letter and the text is still light.
- If it fails, paste: a screenshot of the open letter and `/vg errors`.

### 14.2.2 Guild window and its pages

- Do: open the guild window (the Guild or Social menu button, or `J`), then click each page: Chat, Roster, Guild Info, the benefits page, Preferred Play Settings (if your guild window has it), then the maximize/minimize button. On Roster, tick Show Offline Members.
- Expect: every page shows on flat dark panels (list, roster, chat, benefits, info, preferred play settings) with no marble or portrait art and nothing showing through behind the settings page's dropdowns; the stream dropdown is a flat button; the maximize and minimize buttons still show their symbol; switching pages keeps the look; the side tabs are still the game's. On Roster, rank names show in full (the Rank header lines up over them), online members' names, zones, ranks and notes are bright (no dark film over the rows), and offline members are a lighter grey you can read at a glance, still unlike online members. The same goes for the community list on the left and the Chat page. On Guild Info, the Guild Information box shows your guild's information, or "No guild information yet." if it has none. On Preferred Play Settings, unless you are the guild master the Apply buttons have the disabled look (greyed label, no hover) and do nothing.
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

### 14.2.9 Social window (Forever's friends list)

- Do: open the friends list (O); click each side tab (friends, recent allies, quick join, requests, raid); type in the search box and open Filter; open the Battle.net menu (the button right of your battletag) and choose Ignore list and Edit broadcast.
- Expect: the window is a flat panel with the theme's close button and title; the Battle.net bar's blue band is gone (the status dropdown and menu button are flat, the menu button keeps its icon); the side tabs are flat with their icons, the selected one marked on its outer edge, the others greyed; the search box is a dark input box with its magnifier, Filter and Add New Friend are themed buttons, the list scrolls; the ignore list and broadcast windows beside it are flat panels with themed buttons.
- If it fails, paste: a screenshot and `/vg errors`.

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

### 14.3.10 Loot window rows

- Do: with auto-loot off, kill something that drops several items (one of them a stack, one green if you can) and open the loot window; hover a row, take one item, then loot something else.
- Expect: the loot window is a flat panel and its rows have no item card behind them: each row is a square slot with a thin border in the item's quality colour (none for white items), the stack count on it, the item's name and its rarity word in the Vanguard font in the game's quality colours; the row still lights up under the mouse and a quest item keeps its mark; clicking a row still loots it; the next corpse's rows look the same.
- If it fails, paste: a screenshot of the open loot window and `/vg errors`.

### 14.3.11 Merchant rows, buttons and money

- Do: with damaged gear, open a merchant who repairs and sells more than ten items (a general goods vendor); turn the page with the arrows and the mouse wheel; open the Buyback tab after selling something; hover and click the repair, repair-all and sell-junk buttons; open the filter dropdown.
- Expect: no dark-red plates behind the item names and no round slot art: each item is a square slot with a thin border in its quality colour, its name and price in the Vanguard font (a price you can't pay still red, the icon still greyed), the buyback slot and the Buyback tab's rows the same; the repair buttons and the sell-junk button are flat tiles that keep their icons (greyed when there is nothing to repair or sell), the page arrows keep their arrows with Prev and Next in the Vanguard font, the page count too; the gold bar at the bottom right is a dark box with your money in the Vanguard font beside its coins; every button still does what it did, and the second page looks like the first.
- If it fails, paste: a screenshot of the merchant window and `/vg errors`.

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

- Do: hover the zone name on the minimap's top band, click it, then click it again; press `M` for the world map, then use its minimise and maximise button, click a few zones, open the quest panel on its side and click a quest; hover the group finder eye by the minimap, then click it to open the group finder; open the Legacy window from its button on the menu bar; type `/calendar`, open a day with an event and the "Create event" dialog. Look at the info strip under the minimap, then click the small calendar button at the right end of its date row.
- Expect: the minimap's zone tooltip names the zone, its subzone and whose territory it is, the first click opens the world map and the second closes it; each window has Vanguard's flat dark panel, close button and buttons and no game border; the map itself stays fully visible with no dark box over it (also after minimising and maximising), the coordinate line still shows along its bottom, the nav bar's crumbs follow you into each zone, the calendar's days are dark tiles with event icons still showing, its filter button and class buttons are flat tiles with the class icons still showing (a button this client lacks is simply absent), and the Legacy talent nodes and side tabs are untouched. The info strip reads in two columns with nothing running together (durability beside free bag slots, gold on its own row, fps beside ammo); its fourth row reads the time and then the day and date beside it (for example "21:04  Tue 13 Oct"; the date moves to the left edge with the clock switched off) with a flat calendar button at its right end; the button's tooltip says Calendar, it lights in your accent under the mouse, and a click opens (and, clicked again, closes) the calendar.
- Also expect (calendar dialogs): open a day's event (or the "Create event" dialog): its description box and invite list are dark inset panels, and the thin gold rule under the header is gone. The event's icon stays. [Needs in game: the description box's own text field keeps its look.]
- If it fails, paste: a screenshot of the window, which of these steps broke, and `/vg errors`.

### 14.5.1 Group finder search page and Legacy challenges

- Do: open the group finder and go to its search page (the who list, with the player search box); look at it before searching, search for a name nobody has, then for a name that is online; go to the browse page and look at its top right corner. Then open the Legacy window's Challenges page and look at the right-hand pane before picking a category, after picking one, and on a category with no challenges.
- Expect: the search page has the flat panel like the listing and browse pages, with no brass border, and its list sits on a flat inset panel. While the list is empty, a grey line in its middle says the game's "No groups found" line (the game's own words, so it says groups on a player search). The line also shows before the first search, and it goes away when the list has names. The settings gear sits in the title row just left of the close button, not on it. The Legacy challenge pane says "Select a category to view its challenges." until you pick one. On a category with nothing in it, it says the game's line, or "No challenges to show here.". No world or game art shows through any Legacy page.
- If it fails, paste: a screenshot of the page that is wrong, the step that broke, and `/vg errors`.

### 14.5.2 The game's durability figure stays away

- Do: with damaged gear, under `/vg` → Map untick the info strip's Durability block and `/reload`; then switch the whole Info strip module off and `/reload` again (switch both back after).
- Expect: with the block off, the strip has no durability line and the game's armoured-man figure still does not appear beside the minimap (the character pane's gear slots still show each item's percent); with the module off, the game's armoured man is back in its own spot.
- If it fails, paste: a screenshot of the minimap's corner and `/vg errors`.

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
- Also expect: on the Character tab, each gear slot (shirt, tabard and ammo too) is a flat square around its icon with no bronze frame, its border in the item's quality color when it has one; the model stands on a flat panel under a plain strip with the level and race text, and the model still turns when you drag it. [VERIFY IN GAME]
- If it fails, paste: a screenshot of the tab that is wrong and `/vg errors`.

### 14.8.4 Scroll bars

- Do: on the Reputation tab drag the scroll bar's thumb, click its arrows and mouse over the thumb; then scroll the friends list and the quest or mail list if they have bars.
- Expect: a flat track, a raised thumb that takes the accent edge under the mouse, flat arrows with the theme's arrow, and the list scrolls as before. [Windows whose scroll bars are not the game's newer ones keep their own.]
- If it fails, paste: a screenshot of the bar and `/vg errors`.

### 14.8.5 Switch

- Do: under `/vg` → Game windows untick "Tab buttons and the inside of the character pane", `/reload`, open the character pane and the friends window.
- Expect: the tabs, the pane's lists and the scroll bars are the game's own again; the windows keep their Vanguard panels.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.8.6 The small square tabs on the Character tab

- Do: press C on a character that knows one title or none, and look at the small square tabs at the top of the stats half (stats, equipment manager, titles). Then do the same on a character with two or more titles and click the third tab.
- Expect: with one title or none, the third tab (Titles) is dimmed and grey and does nothing. The game itself disables it, and Vanguard leaves these tabs as the game draws them. With two or more titles it shows its icon and opens the title list.
- If it fails, paste: a screenshot of the tabs, how many titles the character knows, and `/vg errors`.

### 14.8.7 Character pane backdrops, currency and the arrow

- Do: press C and click the gold arrow in the title row to hide the stats half, then click it again. Open Reputation and Skills. Open Currency on a new character that has no currencies, then on one that has some.
- Expect: no wooden or stone backdrop shows behind any tab, and each list sits on a flat dark inset panel. The arrow sits in the title row just left of the close button, level with the title and not over the close button, with the stats half shown and hidden; it still hides and shows the stats half. The empty currency list says "You have no currencies yet." in grey in its middle; the line is gone when the list has currencies.
- If it fails, paste: a screenshot with the stats half shown, one with it hidden, one of the Currency tab, and `/vg errors`.

### 14.8.8 Appearances

- Do: open the collections window (Shift+P) on the Appearances tab. Click a slot where you have nothing collected (a tabard on a new character, say), then a slot that has appearances, then open the Sets tab.
- Expect: no leather backdrop. The item grid, and the sets tab's list and preview, sit on flat dark inset panels with the models still showing. The empty slot says "No appearances to show for this slot." in grey; the line is gone on a slot that has appearances.
- If it fails, paste: a screenshot of the empty slot, one of the Sets tab, and `/vg errors`.

### 14.9.1 Battleground queue dialogs

- Do: queue for a battleground (alone, then in a group if you can) and wait for it to pop; on the role check pick a role and accept; if you can, get a war game or arena invite.
- Expect: the role check, the group's ready popup, the "enter battle" dialog and the invite are flat panels with a soft shadow and no gold dialog border; Accept, Decline, Enter Battle and Leave Queue are flat buttons that still work; the battleground's picture on the enter dialog, the invite's icon and ring and the role icons still show; the close (or hide) button is the theme's. Enter Battle takes you in with no "Interface action failed because of an AddOn". [Needs in game: none of these was seen in the game.]
- If it fails, paste: a screenshot of the dialog and `/vg errors`.

### 14.9.2 Scoreboard and match results

- Do: in a battleground press H (or open the scoreboard), click its tabs (All, Alliance, Horde), scroll the table, then finish the match and look at the results window; click Leave (or Queue again).
- Expect: both windows are a flat panel with the theme's close button, the table on a darker inset with the rows, column headings and team colour unchanged, a flat scroll bar, flat tabs, and flat Queue again and Leave buttons that work; the reward band under the table has no backdrop art but its burst of light still plays when rewards come in. [Needs in game: the faction border the game lays on at the start of a match must stay faded.]
- If it fails, paste: a screenshot of each window and `/vg errors`.

### 14.9.3 Objectives and the countdown

- Do: enter a battleground with flags or bases (Warsong Gulch, Arathi Basin) before it starts; watch the countdown, then take or watch a flag being taken; look at the scores at the top of the screen and anything under the minimap.
- Expect: the countdown bar uses the theme's bar texture on a flat panel with its time in the theme font, and the big numbers are the game's; the scores at the top (and capture bars under the minimap) sit on one flat panel that disappears when they go; the panel never stays behind as an empty square; the objective banner's text is in the theme font at its usual size. [Needs in game: the panel's place and size around the widgets.]
- If it fails, paste: a screenshot of the top of the screen and `/vg errors`.

### 14.9.4 Honor tab and switch

- Do: press C, open the Honor tab and its rank details; then under `/vg` → Game windows untick "Battleground windows", `/reload`, queue again and open the scoreboard.
- Expect: the rank details have no divider line and a flat scroll bar if the text scrolls; with the switch off every window above is the game's own again and the scores at the top have no panel.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.10 Moving game windows

- Do: open the character pane (C), drag it by its title bar to the middle of the screen and close it; open it again, then open the spellbook (P) beside it and close that. Open your bags (B) and drag the combined bag by its top edge; close and reopen them. Drag the game menu (Escape) by its header, the guild window, the group finder, the Legacy window and the auction house by their title bars. `/reload` and open the character pane and the bags again. Then start a fight, open the character pane, and leave combat. Then open the calendar and drag it by the empty strip along its top edge (not on the month arrows), and drag the friends window the same way; close and reopen both. Last, `/vg` → Game windows → Reset window positions, and open the character pane.
- Expect: each window follows the mouse and stays where it is dropped; it opens there again, after opening another window beside it and after the reload too; the close and minimize buttons, the calendar's month arrows and the bag's portrait button still work (the drag area stops short of them, and the top-edge drag only starts on an empty spot). In the fight the pane may open where the game puts it and jumps to your spot when combat ends, never moving while you fight. `/vg` itself can be dragged by its header and reopens there. After Reset window positions the options window is in the middle and the character pane opens where the game puts it. [Needs in game: the drag itself, by the title bar and by the top edge; which windows have mouse enabled on their own frame (a window that doesn't can only be dragged by its title bar); that no window jumps back while you hold it; whether the game refuses any of them.]
- If it fails, paste: the window's name, a screenshot after the drop and after reopening, and `/vg errors`.

## 15. Talent planner

### 15.1 Bar and plan mode

- Do: open the talents window (N). Look along its foot, left side. Tick **Plan**, then left-click an unbought talent twice and right-click it once; hover it.
- Expect: a bar with Plan, Spend planned (greyed with no points to spend) and a summary line ("7 planned, 7 bought, 0 to buy": what is bought counts as planned). In plan mode the clicks buy nothing: the talent shows a badge "1" in your accent at its top right after the clicks, the summary says "8 planned", and the tooltip shows the talent with "Planned: 1 of 5 (0 bought)" and the click hint. [Needs in game: that the planner finds the window's talent buttons; if no badge shows, paste `/vg talents` and a screenshot.]
- If it fails, paste: a screenshot of the window's foot and of the talent, `/vg talents` and `/vg errors`.

### 15.2 Order, ring and unreachable ranks

- Do: in plan mode, plan a talent in a lower row of a tree without planning the row above it (fewer points planned in that tree than its row needs), and plan one in the top row.
- Expect: the top-row talent wears an accent ring (the next pick); the lower talent's badge is red and the summary says "1 unreachable". Plan the rows above it until the points reach: the badge turns to the accent and the count goes.
- If it fails, paste: a screenshot and `/vg talents`.

### 15.3 Spend, level-up and sharing

- Do: with a point to spend and a plan, click **Spend planned** (or `/vg talents spend`); then `/vg talents export`, `/vg talents clear`, `/vg talents import` and paste the string. Gain a level with a plan set.
- Expect: the next pick is bought and applied (the game's Apply Changes is not needed), chat says what was spent, and the window repaints; the export box shows a VG1:talents string, clear empties the plan, import brings it back with its point count in chat. At the level-up (a second later, out of combat) chat says how many points wait and the next pick; with "Spend planned points by itself" ticked under `/vg` → Talents it buys them instead.
- If it fails, paste: chat and `/vg errors`.

### 15.4 Switch

- Do: under `/vg` → Modules switch Talent planner off, `/reload`, open the talents window.
- Expect: no bar, no badges; the window is the game's (with Vanguard's panel). `/vg talents` says the planner is off.
- If it fails, paste: a screenshot and `/vg errors`.

### 15.5 A long summary stays clear of Apply Changes

- Do: tick **Plan** and plan many talents, including one in a lower row whose row above is not planned, so the summary names the next pick and an unreachable rank. Look along the window's foot, then hover the summary.
- Expect: the summary ends before the game's Apply Changes button (at most two lines, the rest cut short) and never runs over it or the buttons beside it; hovering it shows a "Talent plan" tooltip with the whole summary.
- If it fails, paste: a screenshot of the window's foot and `/vg talents`.

### 14.9.2 Post from the Posting tab

- Do: on Posting, click a stack of cloth (a commodity) in a bag (the window stays on Posting), set Stack to 5 and Quantity to 10, and click Post twice, the second time as soon as Post lights again; then drop a piece of gear on the sell slot, type a bid under its price and click Post.
- Expect: the guide under Post lights 1 Item, then 2 Price ("Checking what it sells for..."), then 3 Post ("Click Post to list stack 1 of 2."). Each click says "Post: sending stack 1 of 2 (5 at ... each, ...)" in chat and puts one stack up (the game's "Auction created" line in chat); the guide says "Stack 1 sent: waiting for the auction house..." until the game is ready, then "Click Post to list stack 2 of 2." with Post lit; after the second the card empties, the count keeps "posted 2 of 2" and the guide says "Finished: ...". The gear goes up with its bid and price (both in whole silver if the game takes no copper). If the game asks to confirm a price, Post reads Confirm and the next click lists it. Post never stays lit without posting: when it is off the guide says why. `/vg errors` stays empty.
- If it fails, paste: a screenshot of the Posting tab, every chat line starting "Post:" (none at all after a click means the click never reached Post), and `/vg errors`.

### 15.6 Legacy probe and perk plan (planner off until switched on)

- Do: type `/vg legacy probe` before opening the Legacy window, open it (the Legacy button on the menu bar), click each of its three tabs, and type `/vg legacy probe` again. Under Town and gear tick "Legacy perk planner", then type `/vg legacy plan add 3 Test perk`, `/vg legacy plan add 14 Other perk`, `/vg legacy plan`, `/vg legacy plan remove test perk`, `/vg legacy plan clear`. Paste the second probe's whole output.
- Expect: the first probe says LegacySystemFrame is not loaded; the second lists TreePage, ChallengesPage and RewardTrackPage with their keys, a "perk panel" line with ids and a node count (or "not found on TreePage"), and the globals with Legacy in the name. The plan lines say "Planned.", then that 17 points is over the tree's 16, then list "3  Test perk" and "3 of 16 points planned.", then "Perk dropped." and "Legacy plan cleared." [Needs in game: everything the probe prints; it is the data source the challenge tracker waits on.]
- If it fails, paste: the probe's output and `/vg errors`.

## 16. Realm and ruleset

### 16.1 Realm, ruleset and names

- Do: type `/vg realm` on two characters, in two rulesets if you have them (one Hardcore, if you can). On one of them, have a friend on another realm or ruleset say a Chat watch phrase in a channel.
- Expect: four lines: `Realm: <name> (as in names: <name without spaces>)`, `Ruleset: ...` (a season or `hardcore` where the game names one, else `none named by the client`), `Side: ... Data key: ...`, and `Your name in chat: ...`. The toast shows your friend's name with their realm, and a click whispers them. Characters and auction prices from before still show on tooltips.
- If it fails, paste: all four lines from both characters, and how your friend's name appeared in chat.

## 17. Situations

### 17.1 The editing banner and settings an override can't hold

- Do: type `/vg situation record raid`, then `/vg` and `/vg unlock`. Look above the options window and at the top center of the screen. On the Nameplates page point at "Cast bar", then at "Threat colors while you have aggro". Click **Stop and save** on either banner. Then record again, `/vg unlock`, and pull a mob (or `/vg lock`).
- Expect: while recording, a strip with an accent border sits along the top edge of the options window and another at the top center of the screen (while the frames are unlocked), each reading "Editing as: Raid · changes apply only in Raid" with a **Stop and save** button. "Cast bar" is dimmed and its tooltip says "Not recorded for Raid: this setting changes your base profile."; "Threat colors while you have aggro" is not dimmed and has no tooltip. Stop and save ends the recording: chat says what was kept ("Raid: ... saved."), both strips go, and your own layout is back. Entering combat (or locking) removes the screen strip. The Situations page lists what an override can hold, under "What an override holds". [Needs in game: that the strips sit clear of the window's header and the handles, and that the tooltip shows.]
- If it fails, paste: a screenshot of the window and of the screen top, and `/vg errors`.

## 18. Other addons, quest guidance and the group board

### 18.1 Other addons

- Do: install one bag addon you use (Bagnon, AdiBags, ArkInventory, BetterBags or Baganator) beside Vanguard and log in. Open `/vg` → Modules. Click **Keep both**, `/reload`, and open Modules again. Then type `/dump C_AddOns.GetAddOnInfo("<the addon>")` and note the folder name it prints.
- Expect: one chat line at login, `<addon> also does bags. Choose which one does under /vg > Modules (nothing changes until you do).`; an **Other addons** card at the top of the Modules page with **Turn off Bags** and **Keep both**; after Keep both, no card and no chat line. The folder name matches the one Vanguard looks for (`Modules/Coexist.lua`, `CX.OVERLAPS`); a different name is a finding.
- If it fails, paste: the folder name, a screenshot of the Modules page and `/vg errors`.

### 18.2 Group board

- Do: in a capital city, type `/vg lfg` and leave it open for a few minutes while people post in Trade and LookingForGroup. Hover a row, then click one. Do not press Enter unless you want to send it. Then click the filter button twice and switch **Only dungeons for my level** off and on. Finally post `LFM SFK need heals` yourself in a channel.
- Expect: rows appear as people post, newest first, each with LFM or LFG, a dungeon and its range (or "Any dungeon"), the roles named, the sender's name without its realm or ruleset part and the age; the tooltip shows the whole line and the full name. The click opens the chat box with `/w <full name> Hi! ...` filled in and sends nothing. Your own post does not appear. The whisper reaches the player when you send it (a two-part name that fails is a finding). Inside a dungeon nothing new appears and `/vg errors` stays empty.
- If it fails, paste: a screenshot of the board and the chat box, the line that was misread, and `/vg errors`.

### 18.3 Quest guidance

- Do: talk to a quest giver with a quest you don't have, then type `/vg questdata`. Type `/vg questdata <id>` for one quest you know is new in WoW Forever and one you know is from 2004. Open the world map on a zone with quests you haven't taken; hover a "!" pin and click it. Shift-click a quest in Vanguard's tracker. Under `/vg` → Quests → Quest guidance set The arrow to "A map waypoint on the next step" and Shift-click again.
- Expect: the first chat line says `New-quest flag: none on this client (...)` or names one; the lines for the two quests differ in some field (that field is the flag to use; a New mark on the new quest means Vanguard found it). Pins sit on quest givers, or Vanguard draws none because the game's own map shows its quest offers there (either is fine; two "!" on one spot is a finding). The click puts a waypoint there and the game's arrow points at it. Shift-click says `Arrow: <quest>.` and the game's arrow follows the quest; with the waypoint setting the arrow points at its next waypoint or objective area. When the game gives a next step, the tracker shows it in the accent above the objectives.
- If it fails, paste: the whole `/vg questdata` output for both quests, a screenshot of the map and the tracker, and `/vg errors`.

## 19. Roll tracker

### 19.1 /roll results

- Do: in a group (or alone), type `/roll`, then `/roll 1-6`. Ask a group member to `/roll` too. Wait 35 seconds. Type `/vg rolls`, then `/vg rolls clear`.
- Expect: a small panel appears at the left of the screen headed "Rolls 1-100" with each roll, highest first and the top one in your accent color; `/roll 1-6` starts a new round headed "Rolls 1-6" with its figures; 30 seconds after the last roll the panel goes. `/vg rolls` lists the session's rolls, newest first; clear says "Rolls forgotten." Move the panel with `/vg unlock`. [Needs in game: that the game's roll line (RANDOM_ROLL_RESULT) reaches the addon as a plain, readable system message in your language, also inside an instance.]
- If it fails, paste: the roll line as it shows in chat, and `/vg errors`.

### 19.2 Loot rolls (only where the client has the loot history)

- Do: type `/run print(C_LootHistory ~= nil, C_LootHistory and C_LootHistory.GetNumItems ~= nil)` and paste what it prints. If it prints `true true`, roll on an item in a group (Need, Greed or Pass) and watch the panel.
- Expect: nothing happens on a client without it (no error). With it, under the roll lines the panel shows the item, "rolling" until it is done, and each member's choice and roll, the winner in your accent color. [Needs in game: whether Forever has C_LootHistory with GetNumItems, GetItem and GetPlayerInfo and the LOOT_HISTORY_* events, and the order of the values GetItem and GetPlayerInfo return.]
- If it fails, paste: the `/run` line's output and `/vg errors`.

## 20. Craft queue

### 20.1 Queue, next and stock (off until switched on: /vg > Town and gear > Craft queue)

- Do: switch the craft queue on. Open a profession, pick a recipe, type `/vg craft add 3`, then `/vg craft`, `/vg craft next`, `/vg craft stock`. Make one craft.
- Expect: chat says "Queued: 3 x <recipe>"; `/vg craft` lists the queue and what reagents you are short of; `next` opens that recipe with 3 typed in the panel's Crafts box and tells you to press Create (nothing is crafted for you); `stock` raises Keep stocked and makes the Restock list (nothing is bought); the queue count drops by one after the craft. With the switch off, `/vg craft` says the queue is off. [Needs in game: that C_TradeSkillUI.OpenRecipe exists, that your own UNIT_SPELLCAST_SUCCEEDED spell ID is the recipe ID so a craft comes off the queue, and that the queue survives /reload.]
- If it fails, paste: `/vg errors` and what `/run print(C_TradeSkillUI.OpenRecipe ~= nil)` prints.

### 20.2 Cooldowns and ranking

- Do: with the queue on, open a profession that has a cooldown (a transmute, say), then `/vg craft cd`. Visit the auction house, open a profession again and type `/vg craft top`.
- Expect: `cd` lists the cooldown with its time left, for each character that noted one; `top` lists up to five recipes that pay best, per craft and per hour at the pace set under Craft queue. [Needs in game: that C_TradeSkillUI.GetAllRecipeIDs and GetRecipeCooldown exist and give the open profession's recipes and seconds left, and that reading a few hundred recipes causes no stutter.]
- If it fails, paste: `/vg errors` and what `/run print(C_TradeSkillUI.GetAllRecipeIDs ~= nil, C_TradeSkillUI.GetRecipeCooldown ~= nil)` prints.

## 21. Presets (batch 2)

### 21.1 Apply a built-in preset

- Do: type `/vg preset`, then `/vg preset Healer` and click Apply. Open `/vg` → Profiles and find the Presets rows.
- Expect: the first command lists Healer, Damage and Tank; the second asks `Apply preset Healer? Your profile is backed up first.`; after Apply chat says `Profile <name> as it was before this import is saved as profile <name> backup.` and a reload is offered. Frames you had moved stay where they were. No error popup.
- If it fails, paste: the chat lines and `/vg errors`.

### 21.2 In combat

- Do: pull a mob, then type `/vg preset Tank` and answer Apply.
- Expect: chat says `Applying a preset waits until combat ends.` and nothing changes.
- If it fails, paste: the chat lines and `/vg errors`.

### 21.3 Another addon

- Do: `/run Vanguard.RegisterPreset("Mine", "VG1:parts:x", "test") Vanguard.OpenOptions("profiles", "Apply Healer")`, then click Apply Mine.
- Expect: the options window opens on Profiles at the preset rows, which now list Mine; applying it says `Import failed: ...` (the string is not real) and nothing changes.
- If it fails, paste: what you saw and `/vg errors`.

## 22. Spell ranks

### 22.1 Bar notice and swap

- Do: in `/vg` open Town and gear and switch on "Notice older spell ranks on bar buttons (/vg ranks)". On a character with a ranked spell, put an old rank of it on a bar (drag it from the spellbook, or keep one on a bar after learning the next rank). Type `/reload`, then `/vg ranks`, then `/vg ranks swap`. Try `/vg ranks swap` in combat.
- Expect: after the reload (or after learning a rank), chat says "N button(s) on your bars hold an older spell rank." once. `/vg ranks` lists "Bar B button N: Spell Rank 2 -> Rank 4" and changes nothing. `/vg ranks swap` puts the newest rank on each, says "Put the newest rank on N button(s).", and leaves your cursor empty. In combat it says "Bars can't change in combat." [Needs in game: that C_Spell.PickupSpell with PlaceAction swaps a spell on a bar out of combat, that GetActionInfo gives the spell ID of the rank on the button, and that SPELLS_CHANGED fires when a rank is learned.]
- If it fails, paste: the `/vg ranks` output and `/vg errors`.

### 22.2 Trainer memory

- Do: switch on "Remember what trainers teach (/vg trainers)". Open your class trainer, close it, then type `/vg trainers`, `/vg trainers next`. Level up, if you can, and read chat.
- Expect: `/vg trainers` says how many services are remembered; `/vg trainers next` lists "Level N: Spell Rank R (Trainer, Zone, Subzone)" for the next five levels, lowest first (or says nothing is remembered). A level-up prints the same list under "Trainers you've visited teach, from this level:". `/vg trainers clear` says "Forgot every trainer." [Needs in game: that GetTrainerServiceLevelReq exists on Forever, where the rank text ("Rank 3") sits among GetTrainerServiceInfo's returns, and that TRAINER_SHOW and TRAINER_UPDATE fire.]
- If it fails, paste: `/run print(GetTrainerServiceLevelReq, GetNumTrainerServices())` with the trainer open, and `/vg errors`.

## 23. Mail tools

### 23.1 Search and Take (off until switched on: /vg > Town and gear > Mail tools)

- Do: switch the mail tools on, open a mailbox with a few mails. Type part of a sender or subject in the panel's search box, click the filter button through its four values, click Take on a mail with money and on one with an item. Type `/vg mail <words>`.
- Expect: a panel right of the mail window lists the matching mails (sender: subject, with money and item count); the filter button reads All, Money, Items, Sales; Take takes the money and the first item, one per click; the panel goes when the window closes; chat lists the same matches. With the switch off, `/vg mail` says so. [Needs in game: that TakeInboxMoney and TakeInboxItem(mail, 1) work from a click, that GetInboxInvoiceInfo marks sales, and the panel's place beside the window.]
- If it fails, paste: `/vg errors` and a screenshot of the mailbox.

### 23.2 Send-to-alt presets

- Do: `/vg mail preset add Smith <an alt> iron`, open the Send Mail tab, click the Smith button on the panel (or `/vg mail send Smith`).
- Expect: the alt's name is in the To box and bag items whose name holds "iron" are attached (12 at most); nothing is sent until you press Send. In combat or with the tab closed, chat says to open the tab. [Needs in game: that C_Container.UseContainerItem attaches to the open Send Mail tab, and that the panel (anchored to the Mail window) shows on the Send Mail tab too.]
- If it fails, paste: `/vg errors` and what chat said.

## 24. Dungeon card

### 24.1 The dungeon card on the Instance prep checklist

- Do: in `/vg` open Town and gear and switch on "Dungeon card: level range, your dungeon quests and keys on the checklist". With a quest for a dungeon in your log, walk into that dungeon (a character that carries nothing short, if you can). Then leave and type `/vg prep`.
- Expect: at the door the checklist shows even though nothing is short, with a heading "Dungeon name · levels A-B · 5-player Normal", "Your quests here" and your quests for this dungeon as "[level] Title" (done ones with "· done"), and "Keys: ..." when you carry a key. Outside, `/vg prep` shows "Dungeon quests in your log" (your dungeon and raid quests) and any keys. With the switch off none of these lines show. [Needs in game: that GetInstanceInfo gives the name, size and difficulty, that C_Map.GetMapLevels answers for a dungeon map, that C_QuestLog.GetQuestsOnMap lists your quests inside a dungeon, that C_QuestLog.GetQuestTagInfo tags dungeon quests with Enum.QuestTag Dungeon, Raid or Group, and that keys are item class 13.]
- If it fails, paste: what the card shows, `/run print(C_Map.GetMapLevels(C_Map.GetBestMapForUnit("player")))` and `/vg errors`.

## 25. Theme experiments (#239)

### 25.1 SLUG text and frame buffers

- Do: look at a nameplate and a floating combat number, then type `/vg slug` and look again at 1080p; type `/vg slug` to switch it back. Then type `/vg framebuffer`, open and close the options window and the bags several times, and compare with `/vg framebuffer` off. Note your frame rate.
- Expect: with SLUG on, world text scales smoothly and stays readable (or the flag does nothing, which is fine); panel text never changes. With frame buffers on, inner borders and panels no longer ghost through a window mid-fade, and nothing else changes; the frame rate does not drop while a window is idle. `/vg errors` stays empty either way. [Needs in game: that the Forever 16001 client takes the SLUG flag in SetFont and has Frame:SetIsFrameBuffer; the radial progress and SVG texture calls of #239 are not wired up until their signatures are confirmed on the client: run `/run print(CreateFrame("StatusBar").SetRadialProgressBar, UIParent:CreateTexture().SetSVG, UIParent.CreateVectorGraphics)` and paste what it prints.]
- If it fails, paste: screenshots with the setting on and off, the print above, and `/vg errors`.
## 26. Theme variants (#237)

### 26.1 High contrast, Vellum and ink, Classic look and the four dark looks

- Do: open `/vg` → General → Look and set **Theme variant** to High contrast; open the options window, bags, the quest log, a unit frame and a tooltip; click into an input box. Then set it to Vellum and ink, then Classic look, then Midnight, Obsidian, Moss and Ash and ember, and look again each time. Then back to Slate and brass.
- Expect: High contrast shows opaque near-black windows, white text, no light line under window tops, brighter green, orange and red states, blue/yellow/vermilion reactions, and a 2-pixel accent edge on inputs and accent-bordered frames. Vellum and ink shows warm dark windows with cream text and your accent unchanged. Classic look shows dark leather windows with a bronze border, gold-cream text and the brass rule and corner brackets without `/vg ornaments`. Midnight is navy-black with ice-blue text, Obsidian neutral charcoal with a grey border, Moss dark green with sage text, Ash and ember smoky grey with a rust border. On every look, the dark text on a selected (accent-filled) choice segment is crisp with no shadow behind it, and every segment is wide enough for its label. Everything repaints without a reload; text stays readable on every window; `/vg errors` stays empty. [Needs in game: that windows the game draws (not Vanguard's) look right; a saved panel colour is overridden while a variant is on.]
- If it fails, paste: a screenshot of the window that looks wrong with the variant name, and `/vg errors`.

### 26.2 Rounded corners

- Do: open `/vg` → General → Look and set **Corners** to Rounded (or `/vg corners rounded`); open the options window, bags, the quest log, a unit frame, a tooltip and a few buttons; hover a button; try it on Slate and brass, High contrast and Midnight; then set it back to Square.
- Expect: every window, frame, tooltip and button shows a four-pixel rounded corner whose arc is as thin as the border, with no square fill poking out past the arc and no gap where the arc meets the edge; the light line under a window's top stops short of the corners; status bars, action and bag slots and tabs stay square; High contrast's two-pixel accent ring rounds at twice the radius. Square puts every corner back without a reload; `/vg errors` stays empty. [Needs in game: how crisp the arc is at 1440p and 4K, with and without Pixel-perfect scale; whether a game window Vanguard skins shows its own square corners under the arc.]
- If it fails, paste: a screenshot of the corner that looks wrong with the UI scale, and `/vg errors`.

## 27. Window ornaments (#238)

### 27.1 Rule and corner brackets

- Do: type `/vg ornaments`, open `/vg`, the quest log (`L`) and `/vg setup`. Change the accent. Then `/vg ornaments` again.
- Expect: the options window gets a thin dim-brass rule under its header with a small diamond in the middle; the quest log and the setup wizard get four chamfered corner brackets just inside their corners; all in the accent's darker shade, none on unit frames or other HUD frames; switching off removes them at once. Screenshots at 1080p and 1440p. [Needs in game: that the brackets sit cleanly on the 1 px border at both resolutions.]
- If it fails, paste: screenshots and `/vg errors`.

## 28. Cooldown Manager refresh glow

### 28.1 The glow on a buff

- Do: turn on the game's Cooldown Manager and track a heal-over-time buff on yourself in its buff row. Type `/vg cdmglow on`, cast the buff on yourself, wait until under 30 percent is left, out of combat; then do the same in combat. Type `/vg cdmglow 50`, then `/vg cdmglow off`.
- Expect: the buff's icon gets an accent glow ring once under the share is left, and loses it when the buff is renewed or ends. In combat the glow still follows the time left, or stays off with no error. `/vg cdmglow 50` says "under 50 percent left"; off puts the glows out. [Needs in game: whether the client hands the aura's duration object to a curve (C_CurveUtil.CreateCurve, EvaluateRemainingPercent) and whether SetAlpha takes the result in combat; the Cooldown Manager item fields auraInstanceID and auraDataUnit.]
- If it fails, paste: `/vg errors`, and what `/run print(C_CurveUtil and C_CurveUtil.CreateCurve ~= nil)` prints.

## 29. Cooldown gaps

### 29.1 The gap row

- Do: under `/vg` > Combat tools tick **Cooldown gaps**, reload. Wear an on-use trinket, type `/vg gaps add Healthstone` (or an item ID) with one in your bags, use the trinket and the item. With a pet out, use one of its abilities. As a shaman with the class bars off, drop a totem. Then repeat inside an instance in combat.
- Expect: a row of square icons in thin borders appears above the game's Cooldown Manager, each with a sweep and numbers in the theme font while its cooldown runs; `/vg unlock` lets you move it. Where the client hides cooldown values in combat, that icon is simply missing or sweeps from the client's own timer; never a wrong number. `/vg gaps` lists the chosen items, `/vg gaps remove <item>` takes one off. The row is never clickable and `/vg errors` stays empty. [Needs in game: whether the client has C_Item.GetItemCooldown (or C_Container.GetItemCooldown), C_Item.GetItemSpell, C_Spell.GetSpellCooldownDuration and GetPetActionInfo, and what each returns in instanced combat.]
- If it fails, paste: `/vg gaps`, `/vg status` and `/vg errors`.

### 29.2 Spells in the gap row (the Vanguard cooldown row)

- Do: with the row on, type `/vg gaps spell add <a spell of yours>`, then tick "Cooldown gaps row also draws the Cooldown Manager's essential and utility cooldowns", reload, and turn the game's Cooldown Manager on (Options > Gameplay Enhancements). Use some of those spells, in and out of combat, and in an instance.
- Expect: an icon for the chosen spell and for each spell in the manager's essential and utility rows, in the manager's order, each sweeping while its cooldown runs and plain when it is ready; the manager itself is unchanged. Spells you have not learned are left out. Inside an instance in combat the sweeps still run; an icon with nothing readable is left out, never guessed; `/vg errors` stays empty and nothing taints. [Needs in game: that Enum.CooldownViewerCategory, C_CooldownViewer.GetCooldownViewerCategorySet and GetCooldownViewerCooldownInfo exist and are readable from addon code, that C_Spell.GetSpellCooldownDuration returns nothing (not a zero-length object) for a ready spell, that its ignoreGCD argument leaves the global cooldown out, and that a ready spell still shows in instanced combat (an icon missing there means the call gives nothing for a ready spell while its numbers are hidden).]
- If it fails, paste: `/vg gaps`, `/run print(C_CooldownViewer and C_CooldownViewer.GetCooldownViewerCategorySet and #C_CooldownViewer.GetCooldownViewerCategorySet(Enum.CooldownViewerCategory.Essential))` and `/vg errors`.

## 30. Officer loot tools

### 30.1 Soft reserves next to the roll tracker

- Do: in a group, type `/vg loot on`, then `/vg loot add <a group member> <an item name>` and `/vg loot list`. Shift-click an item into `/vg loot add <member> ` to add one by link. Have that member `/roll`; if the client has the loot history, roll for that item as a group. Type `/vg loot focus <item name>`, then `/vg loot focus`. Reload and type `/vg loot list`.
- Expect: the list prints by item. The member's roll line in the roll tracker ends "[SR]" while the item is the one being rolled for (or the focus item); a loot item the history lists has a "Reserved:" line. The list is still there after the reload. [Needs in game: that a link shift-clicked into a slash command reaches the addon as the full link, and the loot history items' links, in a Forever client.]
- If it fails, paste: the `/vg loot list` output, the roll tracker's lines and `/vg errors`.

### 30.2 Sharing by hand

- Do: under `/vg` → Combat tools → Officer loot tools, click **Put the list in the chat box for the party**, read the line, press Enter; then the raid button; with a long list click again for the next part. Click **Print the reserve list to my chat**.
- Expect: the chat box opens with `/p Soft reserves: ...` (or `/raid`) typed in and nothing is sent until you press Enter; the print shows to you alone. [Needs in game: that the client's ChatFrameUtil.OpenChat opens the chat box with text, and that a line this long is accepted. Without it the part prints to your chat instead.]
- If it fails, paste: what the chat box showed and `/vg errors`.

### 30.3 Roster

- Do: type `/vg loot roster` in a party or raid, ask a member to go offline or die, change a role in the game's group tools, then `/vg unlock` and drag the panel.
- Expect: a small panel lists the group, tanks then healers then damage, names in class colors, with "Lead" or "Asst", "Offline" or "Dead"; it redraws when those change, and keeps its place. [Needs in game: that UNIT_FLAGS or the other listed events fire for another member's death, and that roles and leader marks read plainly in a Forever client.]
- If it fails, paste: a screenshot and `/vg errors`.

## 31. Sized icons (#232)

### 31.1 Menu strip icons at their own size

- Do: look closely at the menu strip's icons at 1080p and 1440p. Type `/vg icons`, then `/reload`, and look again; at 1440p also try a UI scale of 0.8 and 1.0. Then `/vg icons` and `/reload` to switch back.
- Expect: with sized icons on, strokes look even and sharp (no soft or doubled lines) and the icons are not smaller or clipped; with it off they look as before. `/vg errors` stays empty. Screenshots on and off. [Needs in game: that the client loads the 20 and 24 px files (not powers of two) cleanly; that the menu strip's glyph is about 20 px as assumed; if it is another size, say so and the size list changes.]
- If it fails, paste: screenshots, your resolution and UI scale, and `/vg errors`.

### 31.2 Stat weights wizard

- Do: `/vg`, Town and gear, Gear upgrades, click Set up stat weights (or type `/vg weights wizard`). Scroll the list, drag a slider, type 4.25 in a box beside one and press Enter, click Defaults, drag one again, then Save. Open it again, drag a slider and click Cancel. Then `/vg weights`.
- Expect: a dialog above everything with a line naming the kind and role, and a scrolling list with a slider and a number box for each of 21 stats (the ones your class and role value first); the box follows its slider, and a typed number sticks (past 3 the slider sits at its end); Defaults puts them back. Save closes it and prints a line in chat; `/vg weights` shows the weight you moved. Cancel closes it and changes nothing.
- If it fails, paste: screenshots, your resolution and UI scale, and `/vg errors`.

## When you are done

Paste into the first message of the next Claude session: the `/vg report` block (or the output of `/vg status` and `/vg errors`), the list of failed step ids, your screen resolution and UI scale, and the client build from the status line. Failures become tasks in `docs/handoff/WORKPLAN.md` before the performance phase starts.
