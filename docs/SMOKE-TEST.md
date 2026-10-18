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
3. The `/vg errors` result: either `No errors caught this session.` in chat, or a copy window (text selected, Ctrl+C works) with a header with the version, interface number and error count, the client line, and each error with `(xN)` and its stack lines.
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
- Expect: after login the window `What's new in Vanguard <version>` shows once, with its title centred, `Click a line to open its setting.` in small grey type under it and a close button at the top right, and its lines under module headings in small grey capitals; a line for something off by default ends in `(off by default)`. The click closes it and opens `/vg` on that line's page with its row marked. After the reload it doesn't come back by itself; `/vg whatsnew` opens it again (so does **What's new** under General → Layout).
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
- Expect: the first line says `Measuring Vanguard's memory for 60 s`; after a minute two lines: `Vanguard's memory over 60 s: A MB to B MB (+N KB, +R KB/s), low L, high H MB.` and `After a garbage collection: A MB at the start, B MB at the end (+N KB); ...` (the game may hitch briefly as it starts and ends). If the line is instead a low-point verdict (`The low point held` or `The low point rose`), note it: the client refused the collection. A clean rise of a few hundred KB once is normal; one that rises on every run is not. Note the two clean figures for the report. In combat `/vg mem` says it can't read, and `/vg perf` says `memory: not read in combat`. Without `/vg perf cpu` set, `/vg perf` starts `CPU 0.xx ms a frame now (... on average, peak ... ms, N % of all addons; N frames over 5 ms)`; note the line. If it says `CPU off` instead, the client has no always-on profiler. Then type `/vg perf slow`: expect `Vanguard's slowest handlers since login...` and up to ten lines such as `1. event PLAYER_LOGIN  longest N ms, ...`; paste them into the report, they say what to make faster.
- If it fails, paste: both result lines of each run, what you did during the minute, and `/vg errors`.

## 2. Options window and wizard

### 2.1 Every options page

- Do: type `/vg`, then click each page in the left list in turn: General, Modules, Unit frames, Raid frames, Healing, Click casting, Talents, Action bars, Nameplates, Quests, Bars and bags, Map, Chat, Game windows, Cooldowns, Combat tools, Town and gear, Situations, Profiles and Feedback (20 pages in all). After each, type `/vg errors`.
- Expect: each page draws its rows with no Lua error popup, and `/vg errors` stays empty. All 19 entries fit in the list without running off the bottom, each with its own icon (the six that replaced Bars, map, chat have a laurel crown, a compass, a raven, a checked shield, a battle axe and a castle), and every icon and label starts at the same spot down the list, and a search for a setting that used to be on Bars, map, chat (say "Craft queue") lights the page that has it now.
- Also expect (switches): on any page, a switch is a pill track in the theme's inset colour with a thin outline and a round knob with a shade under its edge; on is the accent fill with the knob at the right, off the knob at the left, and the knob brightens under the mouse. Try the Accent and Theme settings: the on fill follows the accent. [Needs in game: the pill and knob art at 1x and at a larger UI scale.]
- Also expect (sliders): a slider's track is a pill in the inset colour with a thin outline, its fill runs in a quiet grey (not the accent) to a solid white round thumb with a dark outline and a shade under its lit edge (the thumb stays on top of the fill; the filled part reads as one solid grey bar, with the thin outline round the empty part), and the thumb moves as you drag. Under General → Layout, a size slider that is locked (Its width on a frame whose width matches another's) shows a grey thumb. Then switch the Theme setting: the switch and slider tracks take the new theme's colours with the panels around them. [Needs in game: the pill ends and the slider's outline at 1x and at a larger UI scale.]
- Also expect (Font picker): the Font picker under General lists Fira Sans Condensed and the game's font (and a font from another addon only while you use it); the Bar texture picker still lists the bars other addons share.
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
- Expect: `Step 1 of 4 · Layout` with five choices (Centered: damage and tanking, Centered: healing, Versus deck, Like the game's, Keep my current layout), Keep picked; the frame you dragged stays where it is at the end. Next goes to `Step 2 of 4 · Screen`, with a choice per screen size (1080p, 1440p, 4K, Ultrawide), the one for your screen marked `your screen`, `Pixel-perfect (sharpest)` and `Keep my current sizes` (picked); under them the hint names who sets your UI scale now (`the game's UI Scale slider` or `Vanguard's pixel-perfect scale`), in full and inside the window, and clicking a preset shows a two-line hint that it moves the game's UI Scale slider; Next goes to `Step 3 of 4 · Look` (the accent swatches, the raid frame style and the Calm HUD switch, off); Next goes to `Step 4 of 4 · Move things` with every frame's handle showing; the button then says Done, and Done hides the handles and the wizard and offers `Setup is done. Reload the UI now to apply it?`. No profile backup is mentioned in chat, since nothing changed. Escape and the close button close it too. After `/reload` the wizard does not come back by itself.
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
- Expect: a dialog saying `This character now uses profile Smoke. Reload the UI now to apply it?` with Reload (in the accent) and Later; the close button and Escape mean Later; Reload reloads the UI; afterwards `Profile: Smoke   (all: Default, Smoke)`. [After P0.7: the Reload button is a secure macro button. If the click does nothing, type `/reload` yourself and say that the button was dead.]
- If it fails, paste: whether the button reloaded, and `/vg errors`.

### 4.2 Import garbage

- Do: type `/vg import`, paste `garbage`, click Import. Then export (step 4.3), cut the string in half, and import that.
- Expect: `Import failed: not a Vanguard profile string.` for the garbage, and `Import failed: the string is incomplete (was it cut off when pasting?).` for the cut string; no error popup either time.
- If it fails, paste: the chat lines and `/vg errors`.

### 4.3 Export

- Do: type `/vg export`.
- Expect: a text box titled `Vanguard export (profile Smoke)  Ctrl+C to copy` holding one long string, with a close button at its top right, a thin scroll thumb in its right margin when the string is long, and a plain Close button at the bottom (an import box has Import in the accent and Cancel instead).
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

### 5.2a Shield corners

- Do: look at your player and target frames, at your usual UI scale and at Pixel-perfect. Lose some health and mana. Then `/vg` → General → Look, switch off **Shield corners on unit frames**, and switch it on again, several times. Then `/vg errors`.
- Expect: each frame's four corners are cut at 45 degrees, about eight pixels across, with a sharp one-pixel cut line (not a blurred dark wedge) the same colour and weight as the straight edges, joining them with no gap or overlap. The health and power fills stop inside the cut line (no colour pokes past it), also while a bar is nearly empty or full. Switching it off makes them square at once, on again cuts them at once. No error, and `/vg errors` has no `AddMaskTexture` line (#421 put four masks on a bar and the game allows three).
- If it fails, paste: a close screenshot of one corner (zoomed) and `/vg errors`.

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
- Expect: step 1 has Food & drink, Bandages and Potions sliders; hunters and warlocks get a second step with Ammo or Soul shards; the last step lists your amounts and whether anything is short; Esc, the close button and Done close it; the step caption is small grey type under the title; the amounts take effect at once, and `/vg prep` shows rows against them. No Lua error.
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

### 7.2a Calm HUD

- Do: `/vg` → Unit frames, switch on **Calm HUD**. Stand in town with no target, then hover your player frame, then target a hostile mob, then pull it and kill it. Click your dimmed player frame and right-click it.
- Expect: with no fight and no hostile target your player, pet, target of target and focus frames are faint (about a third); under the mouse the hovered frame is at full strength at once; targeting a living hostile mob or entering combat brings them all up at once and they stay up through the fight; after the fight with no hostile target they go faint again. A friendly target's frame stays faint. Clicking a faint frame still targets, right-clicking opens the menu. Switching Calm HUD off brings every frame back to full at once. No error.
- If it fails, paste: a screenshot and `/vg errors`.

### 7.2b Versus deck

- Do: `/vg` → Unit frames, switch on **Versus deck**. Target a mob, cast something, then switch Calm HUD on and stand out of combat. Then run `/vg setup`, pick **Versus deck**, and click through to Done.
- Expect: one dark panel with cut corners runs from your player frame's left end to your target frame's right end, behind the cast bar, swing timer and cooldown icons between them (all still visible over it); the Vanguard crest sits centred on the panel's top edge; your target's health and power bars fill from the right. With Calm HUD on, the panel dims with the frames. Switching it off removes the panel and the target's bars fill from the left again, at once. In setup, Versus deck turns it on with your role's layout (a healer gets the healing layout and click casting); picking another layout turns it off. No error.
- If it fails, paste: a screenshot of the bottom centre and `/vg errors`.

### 7.2c Cursor ring

- Do: `/vg` → Unit frames, tick **Ring at the cursor: the global cooldown and your cast** (nothing needs a reload). Move the mouse around, then cast an instant spell, then a spell with a long cast time, then a channel, and click and hover things under the ring (a button, a unit frame, a world object). Untick the switch.
- Expect: two thin rings with a faint full circle behind them centred on the mouse pointer at every UI scale, following it without lag; the outer ring sweeps away for the length of the global cooldown after the instant spell; the inner ring fills as the long cast goes and empties for the channel, and clears when the cast ends or is interrupted; the sweeps have no numbers, no edge line and no flash; the ring does not stop clicks or tooltips, also in combat; with the switch off it is gone and the pointer is plain. [Needs in-game check: that the global cooldown shows on the outer ring on WoW Forever, and which way each sweep turns.]
- If it fails, paste: a screenshot with the ring in view, `/vg status` and `/vg errors`.

### 7.2d Interrupt mark

- Do: on a class with an interrupt (Rogue Kick, Warrior Pummel or Shield Bash, Mage Counterspell, Shaman Earth Shock, Priest Silence), target a mob that casts and watch the target cast bar. Cast on a mob that can't be interrupted if you can find one, press your interrupt on a cast, then watch the next cast while the interrupt recovers. Do the same with `/focus`. In `/vg` → Unit frames untick **Interrupt mark beside the target and focus cast bars**.
- Expect: a small diamond to the right of the target's bar and the focus's bar during a cast you can interrupt: filled and bright (accent) while your interrupt is ready, hollow and dim (darkened like a cooldown sweep that clears clockwise) while it recovers, ignoring the global cooldown; no mark on a cast with the gray edge, on your own bar, when you know no interrupt, or when the switch is off (gone from a cast on screen at once); it goes with the bar when the cast ends. [Needs in-game check: the spell IDs per class on WoW Forever, that the global cooldown is left out, and which way the sweep turns.]
- If it fails, paste: a screenshot of the bar during a cast, your class and spec, `/vg status` and `/vg errors`.

### 7.2f Status chip (off until switched on: /vg > Unit frames > Readouts)

- Do: tick **Status chip above your frame** under Unit frames, reload. Out of combat eat some food, then drink, then eat a food that gives Well Fed; wait until each buff ends. Then tick Instance prep's buff checks (`/vg` > Town and gear) and look at the chip with no flask or raid buffs. Start a fight with the chip showing.
- Expect: above the player frame's top-left corner a small panel with the buff's own icon and Eating, Drinking or Well Fed while that buff is on you (Well Fed in the good color), going when the buff does; with the buff checks on and nothing of those, a warning triangle and Missing: and the first missing buff and how many more, in the warning color, matching `/vg prep`'s buff rows. It is gone the moment a fight starts and back after it, and gone while you are dead. If the buff names are wrong for this client (the chip stays hidden while you eat), paste the aura names from `/dump C_UnitAuras.GetAuraDataByIndex("player", 1, "HELPFUL")`. No error.
- If it fails, paste: a screenshot and `/vg errors`.

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
- Expect: a flat panel at the bottom right, just left of the bags and menu bar, clear of the tooltip when you hover a player (move it with `/vg unlock`; turn the game's meter off in its settings to see only this one), "Damage per second", with up to eight bars in class colors, each with a number, a name and a figure, yours in the accent; the figures update during the fight and stay after it; the title switches to "Healing per second" and back. In an instance, if the game hides values, lines may be blank or "No damage yet this fight", never an error popup. [Needs in game: that the two Enum.DamageMeterType keys exist, that a session's combatSources lines carry name, classFilename, amountPerSecond and isLocalPlayer, that SetValue, SetMinMaxValues and SetText accept the hidden values in combat, that AbbreviateNumbers does too, and that the panel is wide and tall enough to read. `/vg errors` must stay empty.]
- If it fails, paste: the `/run` line's output, what the panel shows in combat and `/vg errors`.

### 7.8 Personal resource display

- Do: turn on the game's personal resource display (Options → Combat → Personal Resource Display, or `/console nameplateShowSelf 1`), stand still and look under your character; take a hit and spend some mana, rage or energy. Then turn the Nameplates module off under `/vg` → Modules, reload and look again.
- Expect: the health and power bars under your character are flat bars in the theme's bar texture on thin slate panels, with no grey rounded backdrop behind them; their colours (class or green health, the power's colour) and values are the game's, they fill and empty as the game's did, any numbers on them are in the plates' outlined font, and they sit where Edit Mode puts them. With the module off they are the game's own again. [Needs in game: that `PersonalResourceDisplayFrame` is the display on Forever (its addon is gated to mainline, which Forever matches) and that the client makes no nameplate for "player" there; if it does, Vanguard draws its own plate on it as on any other.]
- If it fails, paste: a screenshot under your character and `/vg errors`.

## 8. Quests

### 8.1 Quest dialog

- Do: under `/vg > Quests` tick Accept quests and Turn in finished quests (they are off by default). Talk to a quest giver who offers three or more quests. Press a number key, Space and Escape in turn. Then talk to a quest giver again without Shift (a quest is accepted for you), and once more holding Shift.
- Expect: Vanguard's dialog at the bottom centre, the NPC's name at the top in the window-title type (there is no close button: Goodbye and Escape end the talk), with numbered lines in difficulty colours, each led by a gold `!` (a quest you can take), a gold `?` (ready to turn in) or a grey `?` (in progress); Goodbye sits alone at the far left of the buttons; the number picks a line, Space or Enter presses the main button (Accept, Continue or Complete; with only Goodbye on the page, that), Escape says goodbye; in combat Enter does nothing; without Shift the ticked automation runs; with Shift held, no automation runs and the dialog stays open for you.
- If it fails, paste: a screenshot and `/vg errors`.

### 8.2 Long quest text

- Do: open a quest with a very long description.
- Expect: the text fits or scrolls inside the panel, with no overflow outside it; when it scrolls, a thin grey thumb shows in the panel's right margin and soft edges fade the text at the top and bottom.
- If it fails, paste: a screenshot and the quest name.

### 8.3 Quest log

- Do: fill the quest log (as many quests as it lets you take; the limit on Forever is not confirmed), then press the quest log key and type `/vg quests`.
- Expect: Vanguard's log, titled `Quest log` with your quest count (`12 quests`) beside the title, with quests under their zones (each zone a small grey capitals header with a chevron, down while open and right while folded: click it to fold the zone), `[12] Title` lines in difficulty colours, the chosen quest marked by an accent bar along its left edge and a faint wash, a thin scroll thumb beside a list or quest text longer than its column, and Track or Untrack, Share and Map along the right, and Abandon (red label) alone at the far left, for the chosen quest. Click Track or Untrack, then Shift-click another quest: the button flips each time and the tracker follows; if the game refuses, chat says `The game didn't track ...` with the count tracked. Hover a reward card (a quest with an item reward): the item's tooltip shows beside it and goes when you leave. [Needs in game: the tooltip must show for both choices and fixed rewards.] If it is off, `/vg quests` says `Vanguard's quest log is off (/vg > Quests).`
- If it fails, paste: a screenshot and `/vg errors`.

### 8.4 Quest tracker overflow

- Do: watch more quests than fit under the info strip, then click the QUESTS header at the top of the tracker, and again.
- Expect: the tracker's header reads `QUESTS` in small grey capitals with the number of quests you watch after it and a chevron before it; clicking it folds the tracker down to that header (the brass line stays under it) and clicking again opens it. A `+N more` line at the bottom of the tracker. Click it: the tracker grows to at most 10 quests, ending in `Show fewer` (with `· +N more` past ten). `/reload`: it is still expanded. Click `Show fewer` to fold it.
- Also expect (Legacy challenges): with a challenge tracked in the game (its Legacy window), a `Legacy challenges` heading sits under the quests with the challenge beneath it, its criteria as `- 2/3 …` lines and `Complete` once done. Right-click the challenge: it leaves the tracker. With none tracked, no heading. A heading never shows alone: when no challenge fits under it, it is left out and the `+N more` line counts the challenges. [Needs in game: how a Forever client tracks a challenge, and that its criteria text reads as above.]
- Also expect (timed quests): take a timed quest (an escort, or one that says "Hurry!") and watch it. Under its title, above its objectives, a gray `Time left 4:32` line counts down once a second; it goes when the quest is done or abandoned, and no countdown shows anywhere else on the screen. [Needs in game: that the Forever client reports the timer to addons (`C_QuestLog.GetQuestTimers`); if the line never shows while the quest is timed, say so.]
- Also expect (recipes): open a profession window and track a recipe (its track checkbox or Shift-click as the game offers). A `Recipes` heading sits after the quests and challenges with the recipe beneath it and a line per reagent, `- 2/4 Linen Cloth`, gray until you have enough, then green; buy or craft a reagent and the count follows. Left-click the recipe: the profession window opens on it. Right-click: it leaves the tracker, and the heading goes with the last one. [Needs in game: that a reagent the client hasn't cached joins the list a moment later.]
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

### 9.2a Sell list, sell all and bulk buy

- Do: `/vg junk` with a shift-clicked cheap item you own, then Merchants and errors → "Offer to sell the items on your sell list"; open a merchant. Then `/vg sell` with a shift-clicked item of which you hold several stacks. Then shift-click an item for sale (a stackable one, with a few bag slots free) and press Stack, then Max.
- Expect: a question listing the item(s) and what they fetch; answering Sell sells them within a few seconds and the Buyback tab holds them; an item in an equipment set is not offered; Stack and Max and a "Max N for <money>" line sit under the quantity window for a merchant's item and not for an item in your bags; Max above one stack asks first; the buys finish with `Bought N × <item> for <money>.` and no error; an item that costs tokens or honor shows no buttons.
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
- Expect: right under the title, an **Add key** button with "No hover keys yet. Add one, press the key, pick the spell." beside it in grey body-size text (wrapped inside the card); the card's title is a small grey capitals header. If `/vg status` says `secure snippets: no`, the line "This client can't compile the secure code hover keys need; mouse bindings still work." sits there instead. Keys you add list under that line.
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
- Expect: the letter window is a flat panel with no parchment behind the text; the text and any headings are light (not gold); Reply, Delete, Cancel and Report Spam are flat buttons; the page behind the text is a flat sunk box; the subject and sender are light, not gold; the attachment and money buttons have a thin border in the item's quality color; open a second letter and the text is still light. Open an auction invoice (a sold or won item): its labels (Item sold, Purchased by, Sale price, Deposit, Auction house cut, Amount received) are light on the dark page, the + and - beside the deposit and the cut are visible, the prices are in the Vanguard font with their coins, and the sum line is one thin line.
- If it fails, paste: a screenshot of the open letter and `/vg errors`.

### 14.2.2 Guild window and its pages

- Do: open the guild window (the Guild or Social menu button, or `J`), then click each page: Chat, Roster, Guild Info, the benefits page, Preferred Play Settings (if your guild window has it), then the maximize/minimize button. On Roster, tick Show Offline Members.
- Expect: every page shows on flat dark panels (list, roster, chat, benefits, info, preferred play settings) with no marble or portrait art and nothing showing through behind the settings page's dropdowns; the stream dropdown is a flat button that keeps its arrow; the maximize and minimize buttons still show their symbol; switching pages keeps the look; the side tabs are still the game's. On Roster, rank names show in full (the Rank header lines up over them), online members' names, zones, ranks and notes are bright (no dark film over the rows), and offline members are a lighter grey you can read at a glance, still unlike online members. The same goes for the community list on the left and the Chat page. The community list rows have no blue plates or gold rings (their avatars and a guild's banner stay), wash lighter under the mouse and the open community has a bright rail on its left; community names are light text (not green) and the Join or Create Community plus is grey; Invite Member and View Log have light labels, not gold; the roster's rows have no brown stripes (the class icons stay), the column headers (Level, Name, Zone, Rank, Note) are flat buttons that still sort, Show Offline Members is a flat check box with a light label, and a profession header bar (if your guild shows professions) is a plain row with its fold sign, icon and name in the light text colour; the Chat page's input is a dark box, the Jump to Unread button, the member-list and community dropdowns, Add to chat, Invite, Guild Log and the Settings, Guild Control and Recruitment buttons at the bottom are flat themed buttons, the calendar button keeps its icon on a small tile, and the guild emblem in the window's top-left corner is still there without its gold ring. On the benefits page, the Perks and Rewards lists have no bronze frames or plates, each perk and reward keeps its icon (and a lock on one you have not earned), a reward's name stays gold, its coins read in the number font, rows wash lighter under the mouse, and the guild reputation bar sits in a flat dark box with its coloured progress still showing. On Guild Info, the page title is light text, Challenges and Message of the Day are small grey capitals, the counts and the Edit links are light, and the Guild Information box shows your guild's information, or "No guild information yet." if it has none. On Guild News (the Guild Info page's news half), the title is light, the Guild News head is small grey capitals, Set filters is a light link, news lines wash lighter under the mouse with their icons kept, and clicking a boss kill (if your guild has one) opens a flat panel whose text sits in a dark box. On Preferred Play Settings, the title and the Locale and Datacenter labels are light, both dropdowns are flat buttons that keep their arrows, and unless you are the guild master the Apply buttons have the disabled look (greyed label, no hover) and do nothing.
- If it fails, paste: a screenshot of the page that looks wrong and `/vg errors`.

### 14.2.3 Guild dialogs

- Do: from the guild window open the guild log, the news filters (Guild News, Set filters), the settings dialog (as a guild leader), the invite manager (the community's invite button), the notification settings (a community's channel menu), a channel's edit dialog and a member's detail pop-up (click a roster name); have someone invite you to a guild if you can, and open a community invitation if you have one.
- Expect: each is a flat panel; text buttons (Close, Accept, Cancel) keep their words and are not covered by an X, and the log's and the text editor's X is the close cross in the corner; the log's and text editor's text sits in a sunk box under a light title; the news filters open as a flat flyout tabbed onto the guild window's right edge (not at the top right of the screen), their seven boxes are flat check boxes, and the flyout closes when the guild window does; the guild invite keeps the guild's tabard and its Join and Decline buttons and guild name are themed; the settings dialog's name boxes, message and description areas and item level box are dark input boxes, its five options are flat check boxes, its three dropdowns flat buttons with their arrows, its labels light and the community's avatar still shows; the avatar picker and the notification settings have no nine-slice frame, only flat Okay and Cancel buttons, and the notification settings' None, All and quick join controls and each channel's hide and show choices are themed (the choices round rings with a dot on the chosen one, a thin line under each heading); the invite manager's list has no marble or bronze corners, flat column headers and rows with no stripe whose copy and revoke buttons still work (the red cross stays); the channel edit dialog's boxes, type check and description area are themed; the member pop-up has no dark frame, its labels and name are light, its two note boxes are sunk, and Remove, Group Invite and the rank dropdown are flat; a community invitation page has no wide backdrop, its text is light, its avatar stays and Accept and Decline are flat buttons; if your guild or community has had its name reported, the overlay over the window is a flat opaque panel with the close cross, a flat button and a dark name box (its red warning stays red) and the small alert button above it has no glowing frame.
- If it fails, paste: a screenshot of the dialog and `/vg errors`.

### 14.2.4 Channels window and a channel dialog

- Do: type `/join test`, then open the channels window (the chat channels button, or `O`), click a channel, hover the others, and click Create Channel.
- Expect: the channels window and the create-channel dialog are flat panels with themed buttons and input boxes, and you are in the channel; in the channels window Add and Settings are flat buttons, the channel list and the roster sit on sunk boxes without the marble, the channel rows and category headers have no plate (a header keeps its plus or minus sign), wash lighter under the mouse and the open channel is lit with the accent rail (and the rail moves when you pick another channel, even right after the game redraws the list), the roster's names wash lighter under the mouse with their rank icons and mute buttons kept, and its heading and member count are light text, not gold; the create-channel dialog's title, Channel Name and Password labels are light text (not gold) and its voice chat option, when shown, is a flat check box.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.2.5 Invite a friend

- Do: open the friends list, click Add Friend, type a character name; then, if you can, send a Battle.net battletag request and open Friends of Friends.
- Expect: the add-friend window is a flat panel; its name box and buttons (and the Okay button on its info page) are themed and still work, and its titles (Add a friend, Battle Tag, Character friend and the info page's two) are light text rather than gold; the Battle.net invite window is a flat panel with the invitee's name in light text; Friends of Friends is a flat panel whose list sits in a sunk box.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.2.6 Guild registrar and petition

- Do: visit a guild registrar and read the greeting, click to buy a charter; open a charter you hold or are asked to sign, and open the tabard designer from the tabard vendor.
- Expect: the registrar, petition and tabard windows are flat panels with no parchment; the registrar text, "Available services", the cost label, charter names, signatures and headings and the tabard vendor's name are light (not gold or black); the registrar's options (Purchase a guild charter, Register) are readable rows that wash lighter under the mouse and keep their little quest icon; the charter's price is in the Vanguard font; on the tabard window the five pickers (emblem, colours, border, background) are flat sunk boxes with a small arrow each side that still page through the choices, the cost box and the money strip at the bottom are flat sunk boxes with the price in the Vanguard font, and the tabard model and its rotate buttons look as the game draws them.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.2.7 Role check popup

- Do: in a group, as leader, start a role check (the raid tools, or the group menu's Initiate Role Poll); also queue for a dungeon and let an invite popup show if you can.
- Expect: the role poll popup is a flat panel with themed Accept and close buttons; the role buttons still show their icons and still check when clicked, and the little round button under each icon is a dark ring with a brass dot on the chosen role (one role at a time); the dungeon invite popup looks the same, except that the small box under each role icon is Vanguard's check box (several roles can be ticked).
- If it fails, paste: a screenshot and `/vg errors`. [Needs the game: tagged VERIFY IN GAME.]

### 14.2.8 Raid tab

- Do: in a party, open the raid tab (the friends window's Raid tab), then convert to a raid and look again.
- Expect: the eight group boxes are flat panels with their "Group n" captions in light text (not gold), the member buttons are flat and keep each name's class colour, the class count buttons along the tab's edge are small raised tiles that keep their class icon and count, Raid Info and Convert to Raid are themed buttons, the All assist box is Vanguard's check box (grey, with its label, when you are not the leader or an assistant); nothing changes while you are in combat and it catches up after. Click Raid Info (a pop-out listing saved instances): it is a flat panel with the close cross in its corner, flat column headers, a sunk list with the instance names in light text, and flat Extend and Close buttons.
- If it fails, paste: a screenshot of the tab and `/vg errors`.

### 14.2.9 Social window (Forever's friends list)

- Do: open the friends list (O); click each side tab (friends, recent allies, quick join, requests, raid); type in the search box and open Filter; open the Battle.net menu (the button right of your battletag) and choose Ignore list and Edit broadcast.
- Expect: the window is a flat panel with the theme's close button and title; the Battle.net bar's blue band is gone (the status dropdown and menu button are flat, the dropdown keeps its arrow and the menu button its icon); the side tabs are flat with their icons, the selected one raised, the others greyed; the search box is a dark input box with its magnifier, Filter and Add New Friend are themed buttons, the list scrolls; the ignore list and broadcast windows beside it are flat panels with themed buttons. Also on each tab: the list sits on a sunk dark box and its cards (friends, recent allies, quick join, requests, recruits) have no blue plates, wash lighter under the mouse and light with the accent rail when you click one (the presence dot, game icon, class or role icon stay); the little square invite-to-group and summon buttons on a card sit on grey tiles with their icon; Accept on a friend request is a flat button; quick join group names are light text, not gold; on the recruit tab the reward card above the list is a flat panel (its watermark stays) with the claim button flat and its month count and next reward name light; on the raid tab (in a raid) the All assist box is Vanguard's check box with its raid assist icon, the not-in-raid text is light, the eight group cards are sunk boxes and each member button is flat (they catch up after a fight); the Battle.net unavailable notice has a light heading, the saved instances window beside the raid tab has its list in a sunk box with light instance names, and the ignore list's names are light.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.2.10 Battle.net and time-played toasts

- Do: have a Battle.net friend log in or out (or send you an invite) so the toast slides in at the bottom-left, and if you can, a second friend right after, while the first toast is still up; hover it; then stay logged in long enough for the time-played alert, or `/played` where it is shown as a toast.
- Expect: the toast is a flat, slightly see-through slate panel with a soft shadow instead of the game's framed box; the friend's name keeps its Battle.net blue, the grey detail line under it (and the grey single line of an invite toast) is in the theme's lighter secondary text, the Battle.net icon on the left is still there and the game's glow still flares as the toast arrives; the X in its top-right corner is the theme's cross on a red tile under the mouse and closes the toast; hovering the toast shows its tooltip as a flat panel; the time-played toast is the same panel with its one line of text.
- If it fails, paste: a screenshot of the toast and `/vg errors`.

### 14.2.11 Guild rename window

- Do: if your guild has been flagged for a name change, talk to the guild registrar or open the rename window the game offers (the guild master's Rename option); otherwise skip.
- Expect: the rename window is a flat panel; its two options (rename, refund) are plain rows that wash lighter under the mouse and keep their little icon; the descriptions and the cost label are light text (not black); the new-name box is a dark input box; the cost and your money are in the Vanguard number font; the button at the bottom is a themed button and still works.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.2.12 Guild control window

- Do: as a guild master (an officer sees only the Discord page), open the guild control window (the Guild Control button in the guild window, or `/script GuildControlUI_Show()`). On Guild Ranks add a rank, rename it, move it up and down and delete it; on Rank Permissions pick a rank in the dropdown and tick a few boxes and the gold-per-day box; on Bank Tab Permissions tick View and Deposit on a tab and type a withdrawal number; if the Discord page is offered, open it. Close it.
- Expect: the window is a flat dark panel with a Vanguard close button and a title in the same size and light text as the other windows, with one thin line under the header (no rock texture, no carved bar) and the page dropdown a flat button with its arrow. The rank rows have a dark name box, a light "Rank n:" caption, flat up and down arrows that grey out when a rank cannot move, and a flat delete button with its cross; New rank is a flat button; a new rank's row is dressed the moment it appears. The permission boxes are Vanguard check boxes (a greyed Authenticator box with its label grey), the gold-per-day box is a dark edit box, the officer list is light text and the Bank heading small grey capitals. The bank tab list sits in a dark inset with each tab's name light, its two check boxes, its withdraw box and, on the tab you can still buy, the price in the Vanguard font and a flat Purchase button. Every change still saves as before.
- If it fails, paste: a screenshot of the page that looks wrong, and `/vg errors`.

### 14.2.13 Voice chat prompts

- Do: with voice chat enabled in the game's options, join a party (or a raid) so the game offers to join its voice channel; then click Join.
- Expect: the offer is the same flat slate panel as a Battle.net toast, its icon and text kept (the text light), its Join button a Vanguard button and its X the theme's cross; after you join, the short note that voice is on has the same panel, its second line keeping the game's colour on the channel's name; nothing else about voice chat changes.
- If it fails, paste: a screenshot of the prompt and `/vg errors`. If you never get a prompt (voice chat off), mark this step skipped.

### 14.3.1 Stable (a hunter)

- Do: with a hunter, talk to a stable master.
- Expect: the stable window is a flat dark panel; the pet model sits on a dark box without the game's frame and the pet's shadow still shows under it; the strip along the bottom (slots, Purchase, money) is a darker box; the three pet slots are flat tiles with no wooden rims, each keeps the pet's icon (a locked slot its lock), the current pet's glow and the mark on the pet shown, and a thin accent edge lights up on a slot while the mouse is over it; the zoom, rotate and reset buttons over the model are flat with their pictures; the two rules across the window are single thin lines, not the carved ones; the pet experience bar is a flat bar on a dark track with its numbers in the Vanguard font; the pet's level line, the slot captions and the Costs label are in the light text colour, not gold; your money at the bottom sits in a dark box with its coins, and the slot's price beside Costs is in the Vanguard font; the Purchase button is a Vanguard button; clicking a stabled pet and Purchase still work.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.3.2 Trainer

- Do: talk to your class trainer; open the filter; click a skill; collapse and expand a category if the list has them; click Train.
- Expect: flat panel, no parchment behind the list and a dark box under the Train button; each skill row has no plate or hover strip but keeps its icon (a lock or the grey shade over a skill you cannot learn stays), with its name, requirements and cost in the Vanguard font; the row you click shows the one selected look (a thin accent rail and tint along its left edge), which moves when you click another skill, and rows wash lightly under the mouse; a category heading (if the list has them) is small grey capitals with no plate and stays that way when the mouse is over it; the scroll bar is a thin line; your money at the bottom is in the Vanguard font; a profession trainer's rank bar is a flat bar on a dark track in the accent colour with its numbers in the Vanguard font (a hunter's pet trainer shows training points in the light text colour); the filter button works (note whether its arrow is visible); Train works and Vanguard's Train all sits beside it. The skill names keep the colour the game gives them (not changed on purpose).
- If it fails, paste: a screenshot with a row selected and one with the mouse over a category heading, and `/vg errors`.

### 14.3.3 Shift-click a stack

- Do: shift-click a stack of items in a bag, then use the arrows, type a number and press Okay; open the side dress-up window by control-clicking an item at a merchant or the auction house.
- Expect: the stack split window is a small flat panel with the amount in the Vanguard font and visible arrows, a thin border round the amount between the arrows and the "x / y" count line under it in the light text colour (not gold); Okay and Cancel are Vanguard buttons and work; the dress-up window is flat with a Reset button and its model on a dark box without the game's frame, the zoom and rotate buttons still over it.
- If it fails, paste: a screenshot (note whether the amount is readable inside its border) and `/vg errors`.

### 14.3.4 Coins from the money frame

- Do: click your gold in the backpack's money line (a plain click picks coins up and opens the amount window).
- Expect: the coin amount window is a flat panel; its coin icon and arrows are visible; the typed figure and the letter beside it are in the Vanguard font with a thin border round the figure; Okay and Cancel work. Your money at the bottom of the backpack (or of the combined bag) sits in a flat dark box, not the gold-edged one, with its figures in the Vanguard font and its coins.
- If it fails, paste: a screenshot of the window and of the bag's foot, and `/vg errors`.

### 14.3.5 Separate bags

- Do: in the game's options turn Combined bags off (or Vanguard's setting under Bags), `/reload`, and open each bag with its bag button.
- Expect: every bag window is a flat panel and each item slot is a square with a thin border in the item's quality color; the bag still sorts, searches and holds items as before.
- If it fails, paste: a screenshot of two open bags and `/vg errors`.

### 14.3.6 Master loot (in a group)

- Do: in a group set to master looter, kill something and right-click an item to assign it (the player list), then close it.
- Expect: the candidate list is a flat panel with flat player buttons in class colors; selecting a name assigns the item; the loot history window (the group loot history button, if your client has it) is flat with a working close button, the encounter picker a flat button with its arrow, the countdown under it a flat bar on a dark track with its fill showing, a thin scroll bar, and each roll card without its parchment plate: the item is a square with a thin border in its quality colour, the item's name keeps its quality colour, the winner or current leader line is in the light text colour (the winner's name in the class colour), and the "Passed" heading is in the light text colour, not gold; the "no loot" message is light too; hover and click on a card still show the tooltip.
- If it fails, paste: a screenshot of the history window with several rolls (blur names), and `/vg errors`.

### 14.3.7 Macros and icon pickers

- Do: type `/macro`, click Change Name/Icon; open the equipment manager and make a new set (its icon picker); open the guild bank's tab icon picker if you have one.
- Expect: the macro window and each icon picker are flat panels; the name box is a dark input box; the macro window's "Create macros" heading and the selected macro's name are light, not gold; the selected macro and every macro in the grid are flat tiles without the old slot art (each keeps its picture, and a thin accent edge shows under the mouse, the game's own selected mark still shows on the one you picked); the macro text sits on a dark flat box in the Vanguard font; both scroll bars are thin lines; in a picker the "Current icon" heading is light, the selected icon and every icon in the grid are the same flat tiles, the icon type dropdown is a flat button with its arrow; picking icons, Okay and Cancel work.
- If it fails, paste: a screenshot of the macro window and a picker (hover one tile), and `/vg errors`.

### 14.3.8 Stopwatch

- Do: type `/stopwatch`; press play, pause and reset; close it.
- Expect: a small flat panel with a title, the time digits and visible play and reset pictures; the three buttons work.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.3.9 Small dialogs

- Do: die and look at the return-to-graveyard button; open the addon list (`/addons` or the game menu) and change an addon that is out of date, if one is; trigger a message box (for example `/run BasicMessageDialog.Text:SetText("test") BasicMessageDialog:Show()`).
- Expect: the graveyard button is a flat button with its icon and its text in the light text colour, not gold (nothing changes while you are in combat); the addon confirmation and the message box are flat panels with flat buttons, the addon confirmation's message in the light text colour, not full-screen dimmers of a different shade.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.3.10 Loot window rows

- Do: with auto-loot off, kill something that drops several items (one of them a stack, one green if you can) and open the loot window; hover a row, take one item, then loot something else.
- Expect: the loot window is a flat panel and its rows have no item card behind them: each row is a square slot with a thin border in the item's quality colour (none for white items), the stack count on it, the item's name and its rarity word in the Vanguard font in the game's quality colours; the row still lights up under the mouse and a quest item keeps its mark; clicking a row still loots it; the next corpse's rows look the same.
- If it fails, paste: a screenshot of the open loot window and `/vg errors`.

### 14.3.11 Merchant rows, buttons and money

- Do: with damaged gear, open a merchant who repairs and sells more than ten items (a general goods vendor); turn the page with the arrows and the mouse wheel; open the Buyback tab after selling something; hover and click the repair, repair-all and sell-junk buttons; open the filter dropdown.
- Expect: no dark-red plates behind the item names and no round slot art: each item is a square slot with a thin border in its quality colour, its name and price in the Vanguard font (a price you can't pay still red, the icon still greyed), the buyback slot and the Buyback tab's rows the same; the repair buttons and the sell-junk button are flat tiles that keep their icons (greyed when there is nothing to repair or sell), the page arrows keep their arrows with Prev and Next in the Vanguard font and the light text colour (not gold), the page count too; the gold bar at the bottom right is a dark box with your money in the Vanguard font beside its coins; every button still does what it did, and the second page looks like the first.
- If it fails, paste: a screenshot of the merchant window and `/vg errors`.

### 14.3.12 Currency transfer

- Do: with a warband currency you can move between characters, open the currency tab, click a currency's transfer action, open the source dropdown, type an amount and press Max.
- Expect: the transfer window is a flat panel; the source dropdown is a flat button with its arrow; the amount box is a dark edit box; Max, Confirm and Cancel are Vanguard buttons; a thin one-pixel line (no game ornament) runs above the transaction; the four captions (source, amount, and the two balance lines) are light, not gold; the transfer works as before.
- If it fails, paste: a screenshot of the window and `/vg errors`.

### 14.3.13 Auction house multi-stack sale progress

- Do: at the auction house, post a sale of several stacks at once (a quantity of more than one stack on the Sell tab), and watch the bar that appears at the bottom of the screen; click its cross on a second sale to cancel.
- Expect: the bar is on a flat panel with no brass end caps or parchment; its track is flat with the theme's bar fill, the item's icon beside it is square-cropped, the "Creating 1/5" text is light, and the cancel cross sits on a grey tile with its picture; it fades out when the sale finishes, and cancelling still stops the sale.
- If it fails, paste: a screenshot of the bar and `/vg errors`.

### 14.4.1 Game options

- Do: press Escape, click Options. Look at the window, click through Game and AddOns, type in the search box, change a setting, click Apply, then Close.
- Expect: a flat slate panel with the theme's close button; the Game and AddOns tabs with the one you are on raised (lighter than the other); the category list and the settings list on darker panels with the theme's thin scroll bars (scroll both); the group names in the category list small grey capitals and the entry you are on marked with the accent rail while the one under the mouse gets a light wash (no brass plates); a thin line under the page title; flat Defaults, Apply and Close buttons and search box; on a page with check boxes, sliders, dropdowns and buttons (Graphics, Sound) the check boxes are Vanguard's, the sliders a dark track with a round knob and small arrows, the dropdowns and the buttons flat (scroll a long page: rows that come into view are dressed too). Every settings page still draws and works, the sliders still move the value, and the title is still readable.
- If it fails, paste: a screenshot of the window and `/vg errors`.

### 14.4.2 Edit Mode

- Do: press Escape, click Edit Mode. Look, click a Blizzard frame (say the chat window) so its settings dialog opens, change a setting, click Revert on the dialog, click Save in the main window, then close Edit Mode.
- Expect: Edit Mode's window and its settings dialog on flat panels with the theme's buttons and title, the Layout dropdown a flat button that keeps its arrow, the Show Grid, Snap and Advanced options switches and every box in the options list Vanguard's check boxes, the grid spacing slider a dark track with a round knob and small arrows (and still moving the grid), the list of options on a darker well with the theme's scroll bar and no gold ring, its Frames, Combat and Misc headings small grey capitals, and a thin line over the expander (click Advanced options to see both); in the settings dialog the check boxes, dropdowns and sliders are the theme's (change a setting that has each: a checkbox, a dropdown, a slider such as Opacity or Icon Size; they must keep working and the dialog must still resize to fit), and the line between Revert and any extra buttons is one thin line. Vanguard's note (`The labeled handles are Vanguard's frames...`) still sits under the main window; the settings dialog still resizes to its settings; Save works and nothing reports a blocked action (`/vg errors` empty, no "Interface action failed because of an AddOn" popup). Open the layout menu and pick New layout, Import layout and close without saving: their dialogs match, with the Character specific box a Vanguard check box, the labels light (not gold), and in Import layout the paste box on a dark inset with the theme's scroll bar once you paste enough text to scroll.
- If it fails, paste: a screenshot while Edit Mode is open and `/vg errors`.

### 14.4.3 Addon list and chat settings

- Do: press Escape, click AddOns (or open the AddOns tab from the game menu), type in its search box, then close it. Right-click a chat tab and choose Settings, click through two categories, then Okay.
- Expect: both windows on flat panels with themed buttons and search box; the addon list has the theme's scroll bar and a flat character dropdown that keeps its arrow, and its Performance heading is small grey capitals over a thin line; each addon row's box and the Load out of date box are Vanguard's 16 px check boxes with a check mark (rows that scroll into view too; Enable All and Disable All move the marks; a greyed row's box and label are grey, not faded); in the chat settings the category list and the settings area sit on darker boxes, every box on a page (Chat, Channels, Other, Combat) sits on a darker panel with no gold border and its heading (and the Color heading) in small grey capitals, every check box is Vanguard's (those in a category you open later too; a tab or category entry must not have turned into a box) and still works, no gold ring is left round a row, and the color swatches stay. Open Combat, then Colors: Color entire line by source or by target are round radios with a dot in the one chosen (clicking moves the dot). In Combat, the filter list has the theme's scroll bar, Add Filter, Copy Filter and Delete are flat buttons, the two move arrows are flat buttons with an up and a down arrow, and the filter name box is a dark edit box. The tabs along the top (one for each chat window) are flat with the current window's raised, and clicking one moves that.
- If it fails, paste: a screenshot of each window and `/vg errors`.

### 14.4.4 Keybinding, Cooldown Manager settings and click bindings

- Do: press Escape, click Options, Keybindings, then Quick Keybind Mode; press Escape to leave it. Open the Cooldown Manager settings from the game's Options (Gameplay Enhancements). In that window add or edit an alert on a cooldown (a sound alert) and on a group buff (a visual alert) to open the two alert dialogs. Open the click-casting page in Vanguard's options and click its button that opens the game's click binding window (or open it from the spellbook).
- Expect: the quick keybind banner on a flat panel with its three buttons themed and its character-specific box a Vanguard check box (the text stays white); the Cooldown Manager settings window and the click binding window on flat panels with themed buttons, search box (magnifier kept) and list background; in the Cooldown Manager window the scroll bar, the layout dropdown, the gear button on a grey tile, the Revert changes button and each category's header bar are the theme's; the two alert dialogs have a flat panel, no dark border, a theme close button, title and Add button, the cooldown's name in light text, small grey capital heads over their dropdowns (themed) and the spell icon as drawn; in the click binding window the scroll bar, the mouseover cast check box and key dropdown (its label light) are the theme's, each binding row has no brass plate and lights a little under the mouse with the red delete cross on a grey tile, and the tutorial card on first open is a flat panel with its picture; the keybind mode still binds keys, and nothing reports a blocked action (open the banner both out of and just after combat).
- If it fails, paste: a screenshot of the window and `/vg errors`.

### 14.4.5 Help, report and colour picker

- Do: press Escape, click Support (or the help button), look, close it. Open a color swatch (Chat Settings, any color swatch), drag in the wheel, then click Cancel. Right-click a player in a group and open Report if you can.
- Expect: the help window, the report window and the color picker on flat panels with themed buttons; the help page sits in a dark frame with no bronze ring; the report window's reason dropdown is a flat button with its arrow, its labels light (not gold), the comment box dark with the theme's scroll bar, and each reason under it is a plain row that lights a little under the mouse and shows the accent rail when ticked (ticking and unticking still works); the # beside the color picker's hex box is grey; open a window's opacity slider (a nameplate or raid frame color with transparency) and the vertical slider is a dark track with a round knob, its OPACITY label light; the color wheel, the value and alpha bars and the swatches look exactly as the game draws them, and picking a color still works. If you have an open support ticket, its small status box keeps its icon.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.4.6 Death recap and the combat log bar

- Do: on a test character, die to a mob and click the Death Recap button on the release popup. Then open the Combat tab of your chat and click two of its filter buttons.
- Expect: the death recap on a flat panel with a themed Close button and title, the damage rows on a darker inset with the theme's scroll bar (as the game draws them), a thin line under the title; the combat log's filter bar on a darker strip with flat filter buttons and a flat arrow button on the right, still switching filters and opening the filter menu when clicked (the green progress bar that shows while a filter applies is the accent color).
- If it fails, paste: a screenshot and `/vg errors`.

### 14.4.7 Movement pad

- Do: in the game's Options, Controls, tick "Enable Movement Pad"; click its forward arrow, then click it again; hold the pad's jump button; click the small gear on the pad; drag the pad by its edge (unlock it from the gear if it is locked).
- Expect: the pad is a dark panel with no tooltip border; its seven buttons are flat with their arrows and jump picture showing, lighting under the mouse; a direction the game has on (forward after the first click) shows the accent selected look until you click it off, instead of the game's glow; the gear is on a grey tile; moving, jumping and locking work as before.
- If it fails, paste: a screenshot of the pad and `/vg errors`. If you cannot enable the pad in this client, mark this step skipped.

### 14.4.8 Lua error window

- Do: turn on "Display Lua Errors" in the game's Options (Gameplay, Game Options), then cause an error (for example `/run error("test")`) and click the arrows, Reload and Close buttons.
- Expect: the error window is a flat panel with a theme title, a theme close cross, flat Reload and Close buttons, flat previous and next arrows with the "1 / 2" count in light text and a themed scroll bar; the error text itself keeps the game's colours; the window stays in the middle of the screen and still pages, scrolls and closes.
- If it fails, paste: a screenshot of the window and `/vg errors`.

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

### 14.5.3 World map, quest panel and queue status insides

- Do: with Vanguard's quest log switched off (under `/vg` → Quests), press `M` for the world map and look at the nav bar above it, the dropdown at the map's top left (floors, in a dungeon or a multi-floor zone), the two small buttons at its top right (tracking filter and tracking pin) and the arrows of the quest panel's toggle; open the quest panel, look at the search box, the gear above it and the quest count box, hover and click quest rows, tick a quest's track box, and look at the lines between quest groups; open a quest's details (also with Vanguard's quest log on: its Map button) and look at the flat background, the Rewards heading, the reward and XP tiles, and the Abandon (red label), Share, Track and Back buttons; open a quest in the pop-out window (right-click its row, or the quest log's pop-out) and look at its text area and Show Map button; open the battlefield map's tab (in a battleground); queue for something and hover the group finder eye to open the queue panel.
- Expect: the crumb labels are light, not gold, and each crumb's small dropdown arrow is still there on a flat button; the floor dropdown is a flat button with its arrow; the tracking filter and pin sit on the faint control tile, the pin without its gold ring and brown disc; the quest toggle's arrows sit on flat buttons that light under the mouse. The search box is flat and dark with its magnifier, the gear sits on the control tile with its icon, the count box is flat; a quest row shows a soft white wash under the mouse and no yellow glow, its track box is a flat square with a brass tick while tracked (the tick follows the game's own tracking), its quest-type, storyline and task pictures stay; the rules between groups are one thin line. The Rewards heading is light. The pop-out's text sits on a dark inset and Show Map keeps its map picture with a light label. The battlefield map's tab label is light. The queue panel's lines between entries are one thin line. [Needs in game: where exactly the one-pixel group rule and the queue rule sit against the game's ornate divider space; whether the floor dropdown is among the map's direct children as found; the tracking pin's look without its ring.]
- If it fails, paste: a screenshot of the part, the step that broke, and `/vg errors`.

### 14.5.4 Group finder pages

- Do: open the group finder and look at the listing page (alone, then in a group), then pick a category and look at the activity list; tick a role and some activities; open the play style and voice chat dropdowns; go to the browse page, pick a category and activity, use the refresh button, hover and click a few groups; go to the search page, search for a name and hover and click a result.
- Expect: the listing's role buttons are small tiles with their role icons and a flat check box each (ticking one fills it with a brass tick); the roles strip is separated from the list by one thin line; the category buttons are flat tiles with their pictures and a light name (no gold, no stone frame); the activity rows have flat check boxes and keep their plus and minus marks; the dropdowns on all three pages are flat buttons with their arrows. On the browse and search pages the rows have no plate or yellow, blue or brown glow: a soft white wash under the mouse and a brass edge on the selected one; the leader, class and newcomer marks and the plus and minus on group headers stay; the refresh, search, remove-from-list and invite buttons are flat with their pictures; the search page's filter label and total line are not gold. [Needs in game: the role tile's size against its 80-pixel plate; that the selected row's edge follows a click; the category tile's look behind its picture.]
- If it fails, paste: a screenshot of the page, the step that broke, and `/vg errors`.

### 14.5.5 Legacy window and calendar

- Do: open the Legacy window (Adventure, Professions and Progression trees); click each tree card and look at the Apply, Reset and Undo buttons and the tree search box; go to the challenges page, type in its search box, open the filter, click a category (and a parent category to fold and unfold it), then click a challenge to open it and tick its Track box; go to the reward page and look at the bar and the cards. Open the calendar with `/calendar`, click the month arrows, click a day, open a holiday or raid event, an ordinary event and the new-event window (try each dropdown and the lock and auto-approve boxes), the mass invite window, the event picker and the picture picker; hover and click invites in an event's invite list and the rows in the pickers.
- Expect: on the tree page each tree card is a small raised tile with its round icon and ring, and the tree you picked shows the selected look (a bright rail on its left and a lighter fill) that moves when you pick another, and a card washes lighter under the mouse; the points badge is a flat strip; Apply, Reset and Undo are flat with their pictures; the search box is flat with its magnifier; the line between the list and the page is one thin line, not gold. On the challenges page the filter and search box are flat, the category rows have no yellow bar, show a soft wash under the mouse and the selected look on the one picked, and their plus and minus are the light text colour (and the unseen-challenges dot stays); each challenge is a flat card (no parchment, ribbon or glow) with the selected look (the bright rail and lighter fill) while it is open, its objective rows and progress bars are flat tracks with the fill showing, and the Track box is a flat check box. The reward page's bar is a flat track and each reward card a raised tile with its icon and earned tick. In the calendar the month arrows and class buttons are flat buttons with their pictures, the weekday names, the year and the filter label are light (not gold or pale yellow), the day grid is unchanged from before; the holiday and raid text sits on a dark panel; an event's name is light and its lines under it grey; the new-event dropdowns are flat buttons with arrows; the lock and auto-approve boxes are flat check boxes; the invite list's Name, Class and Status headings are small grey text and keep their sort arrow; invite rows and picker rows show a soft wash under the mouse and the selected look on the picked one; the line under an event's buttons is one thin line. [Needs in game: that the reward cards' level number still reads where the game's diamond was; that the sort headings stay grey when you hover them; that a picked invite or picture stays lit after you click away and back; that a category row's text colour looks right on the selected row.]
- If it fails, paste: a screenshot of the window, the step that broke, and `/vg errors`.

### 14.6 Menus and tooltips

- Do: (1) in a party, right-click a party member's frame and use Whisper, then right-click it again for Set Focus (once out of combat, once in combat), then right-click yourself for Leave Party; (2) click the minimap's tracking button; (3) right-click a chat tab; (4) at the auction house, open a dropdown (the category or sort filter); (5) open the guild window's Preferred Play Settings and its language dropdown, if your guild window has it (the game's last old-style dropdown); (6) type `/w ` and the first letters of a friend's name in chat; (7) click an item link in chat and hold Shift over the tooltip that opens, to compare it with what you wear.
- Expect: every menu and dropdown in (1)–(5) is a flat dark panel with a soft shadow and a thin border (no parchment or grey art behind it), its rows and hover highlight as the game draws them (the highlight is not tinted); in an old-style dropdown (5) a heading row, if there is one, is in the light text colour, not gold, a ticked row's tick is in the accent colour and an unticked row's empty box a quiet grey, a row with a coloured icon of its own keeps its colours; a menu long enough to scroll (the minimap tracking menu, or (4)'s filter on a small screen) shows a thin scroll bar, not the game's track and arrows; every action in (1) does what it says, in and out of combat (an entry the game itself greys out in combat may stay grey), and no `Interface action failed because of an AddOn` message appears; the name suggestion box in (6) and the comparison tooltips in (7) are flat Vanguard tooltip panels. With "Right-click menus, dropdowns and more tooltips" unticked and a reload, all of them are the game's own again.
- If it fails, paste: the step number, a screenshot of the menu or tooltip (the scroll bar and a ticked dropdown row in particular), the exact message text if one appeared, and `/vg errors`.

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

### 14.7.6 Chat side buttons

- Do: look at the buttons beside the main chat window (the chat menu at the bottom of its column, the minimize box at the top, the voice channel, deafen and mute buttons, and text to speech and Quick Join if this client shows them); scroll the chat up a few lines; hover each button; click the chat menu, then the minimize box.
- Expect: every one of those buttons sits on a small flat slate tile instead of the game's round art; the chat menu, minimize box and Quick Join show a quiet glyph that turns white on an accent tile under the mouse; the voice and text-to-speech buttons keep their own icon on the tile; scrolled up, a down-arrow glyph on a tile appears at the window's bottom-right and a click on it returns to the newest line; the chat menu still opens and the minimize box still collapses the window.
- If it fails, paste: a screenshot of the chat column and `/vg errors`.

### 14.7.7 Chat bubbles

- Do: with chat bubbles on in the game's options (Options → Interface → Social → Chat Bubbles), say something in /say out in the world, then have a party or raid member or an NPC speak near you; then enter a dungeon and say something there.
- Expect: in the world, each speech bubble is a flat, slightly see-through slate panel with a soft shadow instead of the game's rounded white bubble, its text in Vanguard's font, light on the dark panel; the bubble appears and goes as before; inside the dungeon the bubbles keep the game's own look (the engine does not let addons touch them there) and `/vg errors` stays empty.
- If it fails, paste: a screenshot of a bubble and `/vg errors`.

### 14.7.8 Combat text and floating damage numbers

- Do: turn on the game's scrolling combat text (Options → Combat → Show Combat Text, or `/console enableFloatingCombatText 1`), fight a mob and take a hit, watching the text over your character and the damage numbers over the mob. Then set Font under `/vg` → General to the game's font, reload and fight again.
- Expect: the text over your character (damage taken, heals, energy gains) is in Vanguard's font at the game's own sizes and colours, with a critical hit (the number that grows and shrinks) as sharp as the rest, and the damage numbers over the mob are in Vanguard's font too. After the reload with the game's font chosen, both are the game's own. [Needs in game: that the engine reads `DAMAGE_TEXT_FONT` after Vanguard's ADDON_LOADED, so the numbers over the mob change (if they stay the game's, the path must be set when the file loads instead), and that `enableFloatingCombatText` is the switch's CVar on Forever.]
- If it fails, paste: a screenshot of each kind of number and `/vg errors`.

### 14.7.9 Raid warning, screenshot and frame rate text

- Do: in a group, have a leader or assistant send a raid warning (`/rw Pull in 5`), or type it yourself as the leader; press Print Screen; press Ctrl+R to show the frame rate and press it again to hide it. On a Hardcore realm, wait for a death notice if one comes.
- Expect: the raid warning line at the top center is in Vanguard's font (bold), the same size and colour as before and still growing and fading as the game does it; the line that says a screenshot was taken in the middle of the screen is in Vanguard's font and still gold; the frame rate readout in the bottom-right corner (FPS and the number) is in Vanguard's font at the game's size. A Hardcore death notice is red in the title font. Changing the font or Text size in the options window changes all three at once.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.8.1 Character pane side tabs

- Do: press C, then click each side tab in turn (Character, Reputation, Skills, Honor, Currency, Statistics).
- Expect: each tab is a flat dark tile with its icon still showing (none blank), the selected tab raised (lighter) and the others sunk, the raised one moving with every click, and a faint wash under the mouse. [Needs in game: the tab art is faded by T.Tab, including its icon mask; if an icon is missing, paste a screenshot.]
- If it fails, paste: a screenshot of the pane with the tabs, the tab that is wrong and `/vg errors`.

### 14.8.2 Tabs on the other windows

- Do: open the friends window (O) and click each tab; at a mailbox click Inbox and Send Mail; at a merchant click Merchant and Buyback; inspect another player and click each tab; open the spellbook (P) and click its tabs and its category tabs; open the guild window and click its side tabs; open the group finder and the Legacy window and click their tabs.
- Expect: every tab is a flat dark tile with its text, the selected tab is the only raised one and follows every click, tabs that the game shows later (a new profession, talents after learning them) look the same, and every tab still switches its page.
- If it fails, paste: which window and tab, a screenshot and `/vg errors`.

### 14.8.3 Inside the character pane

- Do: on the Reputation tab look at the list and click a header; on Skills look at a skill and click it; on Currency click a header; on the Character tab scroll the stats; hover a gear slot's flyout arrow (the equipment flyout) and look at the Honor tab.
- Expect: the reputation, skills and currency lists have a thin one-pixel line above and below them (no game ornament); reputation and skill bars sit in a flat dark box with the game's colored fill unchanged, headers are flat buttons that keep their plus/minus icon and still open and close, the stat category titles sit in flat boxes, the flyout is a flat panel with item borders in quality colors and thin theme arrows for its page buttons, the honor tab's ring and badge show (only its decoration is dimmed), and each gear slot still shows its durability percent.
- Also expect: on the Character tab, each gear slot (shirt, tabard and ammo too) is a flat square around its icon with no bronze frame, its border in the item's quality color when it has one; the model stands on a flat panel under a plain strip with the level and race text, and the model still turns when you drag it. [VERIFY IN GAME]
- If it fails, paste: a screenshot of the tab that is wrong and `/vg errors`.

### 14.8.4 Scroll bars

- Do: on the Reputation tab drag the scroll bar's thumb, try to click where its arrows were and mouse over the thumb; then scroll the friends list and the quest or mail list if they have bars.
- Expect: no track and no arrows: one thin grey line (4 units wide) runs down the middle of the thumb, half bright at rest and full bright while the mouse is over the thumb or you drag it; where an arrow was there is nothing to click, and the list scrolls as before. [Windows whose scroll bars are not the game's newer ones keep their own. Needs in game: that the line sits in the middle of the thumb and that the faded arrows take no clicks.]
- If it fails, paste: a screenshot of the bar and `/vg errors`.

### 14.8.5 Switch

- Do: under `/vg` → Game windows untick "Tab buttons and the inside of the character pane", `/reload`, open the character pane and the friends window.
- Expect: the tabs, the pane's lists and the scroll bars are the game's own again; the windows keep their Vanguard panels.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.8.6 The small square tabs on the Character tab

- Do: press C on a character that knows one title or none, and look at the small square tabs at the top of the stats half (stats, equipment manager, titles). Then do the same on a character with two or more titles and click the third tab.
- Expect: with one title or none, the third tab (Titles) is dimmed and grey and does nothing. The game itself disables it. The tabs are flat dark tiles with their icons, the selected one raised and the others' icons greyed, with no bronze plate behind them. With two or more titles it shows its icon and opens the title list. [Needs in game: that the unkeyed plate behind each icon is faded and the checked texture's glow with it.]
- If it fails, paste: a screenshot of the tabs, how many titles the character knows, and `/vg errors`.

### 14.8.7 Character pane backdrops, currency and the arrow

- Do: press C and click the gold arrow in the title row to hide the stats half, then click it again. Open Reputation and Skills. Open Currency on a new character that has no currencies, then on one that has some.
- Expect: no wooden or stone backdrop shows behind any tab, and each list sits on a flat dark inset panel. The arrow sits in the title row just left of the close button, level with the title and not over the close button, with the stats half shown and hidden; it still hides and shows the stats half. The empty currency list says "You have no currencies yet." in grey in its middle; the line is gone when the list has currencies.
- If it fails, paste: a screenshot with the stats half shown, one with it hidden, one of the Currency tab, and `/vg errors`.

### 14.8.8 Appearances

- Do: open the collections window (Shift+P) on the Appearances tab. Click a slot where you have nothing collected (a tabard on a new character, say), then a slot that has appearances, then open the Sets tab.
- Expect: no leather backdrop. The item grid, and the sets tab's list and preview, sit on flat dark inset panels with the models still showing. The empty slot says "No appearances to show for this slot." in grey; the line is gone on a slot that has appearances.
- If it fails, paste: a screenshot of the empty slot, one of the Sets tab, and `/vg errors`.

### 14.8.9 Side tabs on the professions, collections, guild bank and inspect windows

- Do: open the professions window and click its tabs, then the collections window (Shift+P) and click each of its tabs, then the guild bank and click its tabs (as a guild member with tabs), then inspect a player and click Character, PvP and Guild, then open the cooldown settings window and click its three tabs, then open the Appearances page and click Items and Sets.
- Expect: each side tab is a flat dark tile with its icon still showing, the selected one raised (lighter) and the others' icons greyed, a faint wash under the mouse, and it sits against the window's panel edge with no gap and no overlap; the guild bank's tabs keep their item icon (and the search's dark film while you search) and lose their bronze plate; Items and Sets are flat tabs with the one you are on raised. Every tab still switches its page. [Needs in game: the names the collections tabs have on Forever; whether the guild bank tabs line up with the panel's edge.]
- If it fails, paste: which window and tab, a screenshot and `/vg errors`.

### 14.8.10 The character pane's side panes and stat boxes

- Do: open the character pane (C) and click the Reputation, Skills, Currency and Honor tabs in turn; expand and fold a header on each list, tick "Show as experience bar" or "Inactive" on a reputation, and hover a row. Then show the stats half and look at the stat boxes (and the item level line).
- Expect: each pane's title is small text in the text colour, not gold, and its gold rule is gone; the list rows lose their wooden or stone plate and their labels read in the text colour (a row the game colours, such as a reputation standing, keeps its colour); each row's icon sits on a flat square slot; the check boxes are Vanguard's, the standing bar is a flat bar and the pane's buttons are flat; the game's own row highlight under the mouse is unchanged; the stat boxes sit on flat inset panels with a flat title box and no wooden art, and the honor texts read in the text colour. Scrolling a long list or folding a header never leaves a row with the game's plate. [Needs in game: the names of the side-pane and stat-box parts on Forever.]
- If it fails, paste: which pane, a screenshot with a row or two on screen and `/vg errors`.

### 14.8.11 The paper doll's lists, buttons and slots, and the appearances page

- Do: open the character pane (C) on the Character tab. Click the Titles and Equipment Manager buttons under the model, hover and pick a title and a set, then click Equip, Save and New set. Look at each gear slot (the ammo slot too, as a hunter), and at your level line over the model (a hunter with a pet: the pet's page too). Click a gear slot with several items to open the flyout and its page arrows. Then open the collections window (Shift+P), go to Appearances, use the search box, the filter and class dropdowns (and the weapon dropdown on a weapon slot), turn the pages, and open the Sets tab, pick a set and its variant dropdown.
- Expect: the titles and sets lists sit on flat dark inset panels with no bronze edge, stripe or card plate; titles and set names read in the same light text as the rest of the window; hover washes a row and the picked title or set shows the one selected look (a thin accent rail and a faint fill) instead of the game's own highlight or card art, and it moves when you pick another or scroll the list; a set with items missing keeps its red name; Equip, Save and New set are flat buttons with the plus beside New set; the pet's experience bar is a flat box with its green fill; the level line is small light text; the gear slots show a flat square with the item's quality border and no bronze frame. The appearances search box and dropdowns are flat with their arrow and magnifier, the page arrows (there and on the flyout) are flat buttons with their arrow pictures, and the sets list has no row plate (the set's name keeps its gold, green or grey), its picked set shows the same accent rail and its progress line stays, nor the plate behind the set's icons. Everything still works as before. [Needs in game: the real names of all these parts on Forever; whether a recycled title, set or sets-list row ever shows a stale rail, plate or name colour after scrolling, picking another row or after you gain or lose an item; whether the sets list's rail follows a variant pick.]
- If it fails, paste: a screenshot of the character pane with each list open, one of the appearances page and Sets tab, and `/vg errors`.

### 14.9.1 Battleground queue dialogs

- Do: queue for a battleground (alone, then in a group if you can) and wait for it to pop; on the role check pick a role and accept; if you can, get a war game or arena invite.
- Expect: the role check, the group's ready popup, the "enter battle" dialog and the invite are flat panels with a soft shadow and no gold dialog border; Accept, Decline, Enter Battle and Leave Queue are flat buttons that still work; the battleground's picture on the enter dialog, the invite's icon and ring and the role icons still show; the close (or hide) button is the theme's, and on the enter dialog, the ready popup and the invite it carries the minimize glyph (a dash) on a grey tile that turns lighter, not red, under the mouse; the enter dialog has no painted rule under the battleground's name, and its name, the status line and your role's name are in the light text colour, not gold; the role check's three role boxes are flat check boxes with the accent tick, the role icons still show. Clicking the hide button hides the dialog and you stay in the queue. Enter Battle takes you in with no "Interface action failed because of an AddOn". [Needs in game: none of these was seen in the game.]
- If it fails, paste: a screenshot of the dialog and `/vg errors`.

### 14.9.2 Scoreboard and match results

- Do: in a battleground press H (or open the scoreboard), click its tabs (All, Alliance, Horde), scroll the table, then finish the match and look at the results window; click Leave (or Queue again).
- Expect: both windows are a flat panel with the theme's close button, the table on a darker inset with the rows, column headings and team colour unchanged, a flat scroll bar, flat tabs, and flat Queue again and Leave buttons that work; the reward band under the table has no backdrop art but its burst of light still plays when rewards come in; the faction banner the game hangs over the top edge in a faction match is gone; the title (Victory or Defeat) is in the theme's heading font in the light text colour at its big size, the Rewards and Progress headings and the matchmaking line under the table (Matchmaking rating, in both windows) are light, not gold; each reward item is a square tile without its round shadow and spec ring that keeps its picture and quality ring, with a thin accent edge under the mouse. [Needs in game: the faction border the game lays on at the start of a match must stay faded.]
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

### 14.11 Breath and fatigue bars

- Do: swim under water until the breath bar shows and stay down a few seconds; surface. Then swim out to sea until the fatigue bar shows, and swim back.
- Expect: each bar at the top center is a flat bar in the theme's bar texture on a slate panel that hugs it, with no gold frame and no dark band behind its label; it runs down as the game's does and goes when you surface (or turn back). The second time it shows, it looks the same.
- If it fails, paste: a screenshot while the bar shows and `/vg errors`.

### 14.12 Window titles

- Do: open the character pane (C), the game menu (Escape), the world map (M), the group finder, the calendar, the game's Options and a small dialog (the report-cheating one, or a guild dialog).
- Expect: every window's and dialog's title is the same size and light text colour (not gold), still where the game centres it; the game menu's title sits inside its panel.
- If it fails, paste: a screenshot of the window whose title differs and `/vg errors`.

### 14.13 Window insets

- Do: open the merchant, the class trainer, the macro window and the addon list (Escape → AddOns).
- Expect: the list or content area of each is a darker flat panel with the thin edge, set into the window's panel; no bronze frame or dark tile of the game's around it.
- If it fails, paste: a screenshot of the window and `/vg errors`.

### 14.14.1 Trade window

- Do: start a trade with another player (or a friend's alt). Put an item in a slot on each side, type a gold amount in your offer, and look at the Trade button when the other player has something in a slot.
- Expect: the item columns and the two money lines sit on darker flat panels; each item slot is a square with a thin border in the item's quality colour and no gold or bronze slot plate or name plate (an enchant slot keeps its icon); your gold, silver and copper boxes are flat dark boxes that keep their coin pictures; the other player's money has no gold-edged plate; the two names over the columns are light text, not gold; the Trade button keeps its warning icon when the game shows it. Trade and Cancel still work. [Needs in game: all of it.]
- If it fails, paste: a screenshot of the window and `/vg errors`.

### 14.14.2 Mail window

- Do: open a mailbox with some mail in it (some read, some with items, one cash on delivery if you have one). Look at the inbox, hover a row, then click the Send Mail tab, type a name and a subject, write a line in the letter, drag an item onto an attachment slot, and click Send money and C.O.D. in turn.
- Expect: the inbox has no parchment and the rows have no brown plates; each row's item is a square with a thin border in the item's quality colour (read mail's border greyed); the sender and subject are in the theme font with the game's colours; the Previous and Next arrows are flat tiles with the theme's arrow and a light caption. On the Send Mail tab the letter sits on a darker flat panel and your text is light, not dark brown; To and Subject are flat dark boxes with light labels; the amount boxes are flat with their coins; the two choices are round radios that fill with the accent when picked; the money well at the bottom left is a flat panel; the two bronze bars are thin lines; the attachment slots are squares that show the item's picture. Cancel and Send are themed buttons. [Needs in game: all of it, most of all that the letter text is readable.]
- If it fails, paste: a screenshot of each tab and `/vg errors`.

### 14.14.3 Quest and gossip windows

- Do: switch off the quest dialog (`/vg` → Quests → the quest dialog switch). Talk to a quest giver with a quest to accept, then one with a quest to turn in that needs an item and some money, and to someone who has only gossip lines (an innkeeper). Look at each page.
- Expect: no brown parchment behind the text on any page; the text sits on the window's darker flat panel and stays readable (light text, light headings); on the turn-in page each required item is a square with a thin quality-coloured border and no gold name plate, the required money is in the theme font; Accept, Decline, Complete Quest, Continue, Cancel and Goodbye are themed buttons; the gossip window's list sits on the flat panel and its Goodbye button is a themed button. With the dialog switched on, the game's own windows are not used.
- If it fails, paste: a screenshot of the page and `/vg errors`.

### 14.14.4 Popups, ready check, loot close button and breath caption

- Do: open a popup with a text box (rename a guild rank or the delete-an-item confirmation that asks you to type), one with a dropdown or money boxes if you can find one (inviting to a guild bank tab, a group-finder role check), and look at the warning icon on a popup that has one (leave a group while queued). In a group, start a ready check (or have a friend do it). Open a loot window on a corpse and look at its top corner. Swim under water and look at the breath bar's caption.
- Expect: a popup is a flat slate panel with no dark game tile or ornate border behind it; its warning icon and a progress bar's fill still show; the text box and money boxes are flat dark boxes; buttons are the theme's. The ready check is a flat panel with a light title and prompt, themed Ready and Not Ready buttons, the caller's portrait still showing and no game border. The loot window's close button is the same square as other windows' (red under the mouse). The breath bar's caption is small, light, outlined text on the bar. [Needs in game: whether a popup keeps any game border or corner art; if it does, paste a screenshot.]
- If it fails, paste: a screenshot of the popup or ready check and `/vg errors`.

### 14.14.5 Roll windows, dressing room, books and the game menu header

- Do: roll on an item in a group (or loot with a friend), and look at the roll window. Open the dressing room (Ctrl-click an item), open the outfit dropdown and the details toggle. Read a book or a letter and turn a page; read a timed book if you know one. Press Escape and look at the top of the game menu.
- Expect: the roll window has Need, Greed, Pass (and Transmog when offered) on the same small tiles as the window controls elsewhere, with their dice and coin icons; its countdown is a flat bar on a dark track that runs down; the item icon is a square with a thin border and no game ring, the item name keeps its colour. The dressing room's model sits on a flat darker panel; Close, Reset and Link are themed buttons, the outfit dropdown keeps its arrow, and the side panels that open beside it are flat. The book's page area is a flat darker panel with the page arrows as flat tiles and the page count small; a timed book's bar is flat. The game menu has no gold plate behind its title; its title is still readable and inside the panel.
- If it fails, paste: a screenshot of the window and `/vg errors`.

### 14.14.6 Time manager

- Do: click the clock on the minimap (or the info strip's clock) to open the time manager. Tick and untick Alarm enabled, 24-hour mode and Local time; open the hour, minute and AM/PM dropdowns; click in the alarm message box and type; tick the stopwatch switch to open the stopwatch.
- Expect: the three check boxes are flat squares with an accent tick; the dropdowns are flat buttons that keep their arrows; the message box is a flat dark box; the captions (Alarm time, Alarm message, Show stopwatch) and the window's title are light, not gold; the stopwatch switch keeps its clock icon on a small tile; the globe at the window's top left still shows; the stopwatch's title is light text.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.14.7 Spellbook and talents

- Do: press P to open the spellbook; turn a page; type in the search box; open the settings button (top right) and the category tabs. Open the Talents tab, move the mouse over the search box, the options and loadout dropdowns, Apply, reset and undo; spend a point if you can, then apply it; watch the tree for a few seconds. Open the Specialization tab and a hero talent choice.
- Expect: the spellbook has no parchment, top bar or bookmark: the pages are a flat dark panel; the page arrows are flat tiles with the theme's arrows and the page count is small grey text; the search box is a flat dark box with its magnifier; the settings button is a flat button with its picture. Spell names and headings are readable (if they are dark on the dark pages, paste a screenshot). The talent tree has no painted backdrop, bronze frame or gold dividers but still shows the clouds and, when you apply, the burst; its buttons and dropdowns are flat with their arrows; the points count has no bronze plate. Specialization cards and hero talents look as the game draws them.
- If it fails, paste: a screenshot of the spellbook and of the talents, and `/vg errors`.

### 14.14.8 Professions and the linked recipe

- Do: open a profession (K, or the profession button); use the filter and the search box; click a recipe, then another; scroll the list; look at the skill bar, the quantity box, the Create and Create All buttons, the link button and the gear slots; tick Track recipe; open a recipe with reagents and an optional or finishing slot. Link a recipe in chat to yourself and click it to open the inspect window.
- Expect: the recipe list and the recipe form are flat dark panels with no bronze frame or parchment; the filter is a flat button with its arrow, the search box a flat dark box with its magnifier; the recipe you click shows the selected look (a rail and fill, not the gold bar) and the one you leave loses it, and hovering a row washes it; the skill bar is a thin bar in a dark box with the game's fill; the quantity box and buttons are flat; the link button keeps its picture; the gear slots and each reagent slot are squares with a thin border in the item's quality colour; Track recipe has a flat check box with a small label; the gold notes (what it makes, the first-craft bonus, "not learned") read in the light text colour. The inspect window shows the same form. Category headers stay as the game draws them.
- If it fails, paste: a screenshot of the window with a recipe selected, and `/vg errors`.

### 14.14.9 Inspect window and flight map

- Do: inspect another player (right-click their portrait, Inspect) while in range; look at the model, the gear slots, the View in Dressing Room button and the lines over the model; click the Guild and PvP tabs. Then talk to a flight master and open the flight map.
- Expect: the model sits on a flat dark panel with no bronze corners or painted backdrop; the gear slots are squares with a thin border in the item's quality colour and no bronze slot frames; the View button is flat; the level line is light text and the title and guild lines (when shown) small grey text. The flight map has no bronze frame, portrait or dark underlay: a thin edge round the map, a themed title and a close button at the top right that works. [Needs in game: the close button's place on the flight map, and that the map stays fully visible.]
- If it fails, paste: a screenshot of the inspect window and of the flight map, and `/vg errors`.

### 14.14.10 Guild bank

- Do: open the guild bank at its vault; look at the slots, the money line at the foot, the tab name over the grid; type in the item search box; open the Log, Money Log and Tab Info tabs (the last one as an officer if you can); if a tab can be bought, look at the purchase line.
- Expect: no red marble, slot-grid art or gold-edged plate: the columns are flat dark panels with square item slots and a thin border in each item's quality colour; the money lines and the withdrawal limit are in the theme font and the plate behind them is flat; Deposit and Withdraw are flat buttons; the search box is a flat dark box with its magnifier and dims tabs that do not match; the log and the tab info text sit on flat dark panels; the tab name is light heading text and the limit and cost labels small grey text. The guild emblem beside the portrait looks as the game draws it.
- If it fails, paste: a screenshot of the bank on the first tab and on the Log tab, and `/vg errors`.

### 14.14.11 Collections journals

- Do: open the collections window (Shift+P) and visit each tab the window shows (mounts, pets, toys, heirlooms, appearances); type in each search box, open each filter dropdown, turn the pages of the toy box, heirlooms and appearances; select a mount or pet and look at the Mount or Summon button.
- Expect: no bronze frames round the lists and displays and no leather backdrop behind the toy and heirloom icons: they sit on flat dark panels; the "collected" count plates and bars are flat (the bar's fill keeps its green); search boxes and dropdowns are flat with their magnifier and arrows; Mount and Summon are flat buttons; the page arrows are flat tiles with the theme's arrows and the page count is small grey text. The mount and pet list rows look as the game draws them. [Needs in game: which of these tabs Forever shows.]
- If it fails, paste: a screenshot of each tab that looks wrong, and `/vg errors`.

### 14.14.12 Achievements

- Do: open the achievements window (Y). [Needs in game: Forever may open the Legacy window instead; if so, this step only checks that nothing broke, and the window below never shows.] If it opens: click through the categories, the Guild and Statistics tabs, open an achievement card and tick Track, use the search box (a preview list drops down), press Enter for the full results, and compare with a player if you can.
- Expect: no bronze header plate, wooden frame or parchment: the category list, the achievements, the statistics, the summary and the comparison each sit on a flat dark panel with no gold border; an achievement card has no parchment or border (its icon, shield and the +/- mark stay) and its description is light even when completed (if completed descriptions or criteria text are black, paste a screenshot); the category you pick shows the selected look; Track is a flat check box; Back, the filter and the search box are flat; the search preview is a small dark panel; the summary's two headings are small grey capitals over flat bars; the full results are a framed panel with a themed title and a close button.
- If it fails, paste: a screenshot of the tab that looks wrong, and `/vg errors`.

### 14.14.13 Auction house, the game's own pages

- Do: open the auction house with Vanguard's Auction Helper page on, and again after turning it off (Auction helper, "Lists and Posting tabs on the auction house") and reloading. On the game's Buy tab, search for something (type in the box, click Search, open the filter dropdown, click the favourites star), pick a category and a sub-category, click a result and click Back; on Sell, drop an item in and look at the form (quantity, price, duration, the buyout check box); on Auctions, click the Auctions and Bids sub tabs and pick a line; start a purchase so the confirm dialog shows.
- Expect: no bronze frames or dark tiles: the money line at the foot, the categories, the result lists, the sell form and the item headers sit on flat dark panels; the search box, Search, filter, favourites, column header, Post, Buy, Bid, Buyout, Back, Cancel and Max buttons are flat (the sort arrow, the star and the red clear cross keep their pictures); the price and bid boxes are dark edit boxes with their gold, silver and copper coins; the duration is a flat dropdown; the buyout check box is Vanguard's; the Auctions and Bids tabs are flat tabs, the one you are on raised; a category or result line you pick shows the accent rail and light fill (the same look as every other list) and a hover gives a light wash; no gold category names (they are light, and stay light after the mouse leaves); "Create Auction" is a small grey capital; the money figures are in the theme font; the confirm dialog is a flat panel with a shadow and three flat buttons. With the Helper page on, its Lists and Posting tabs look and work as before. Check the Sell and Auctions tabs in particular (Cliff's 2026-10-18 screenshots showed them in the game's art): no parchment, no gold labels, no red Max button. The Filter label has room under it, the money figures at the foot have room on every side, and the bottom tab labels (Buy, Sell, Auctions, Lists, Posting) are light, not gold, on every tab.
- If it fails, paste: a screenshot of the page that looks wrong, which tab it was on, and `/vg errors` (a part that fails is now named there as "auction house" and its path).

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

### 15.6a Chat filter (off until switched on)

- Do: `/vg filter on`, then wait for (or say in a test channel) a Trade line that sells gold with a web address, one that sells a boost, a guild recruiting line, and the same line twice in a minute. Type `/vg filter add test word` and say a line holding it. Open the Filtered tab and click a sender's name in it. Type `/vg filter hide`, then `/vg filter tab`, then `/vg errors`. Walk into a dungeon and read Trade.
- Expect: a Filtered chat tab appears, and the caught lines are in it, each starting with why ("Gold selling", "Boosting", "Recruiting", "Your word", "Repeat"), none in the main chat; the tab's name counts them, "Filtered (4)". Clicking a sender's name says their lines show in chat again, and their next line stays in the main chat. With hide, caught lines show nowhere. Normal Trade lines, your own lines, whispers and guild chat are never caught. `/vg errors` is empty; in the dungeon nothing errors and chat passes through. The tab looks like the other chat tabs on both rounded and square corners, and is still there, with its count starting over, after `/reload`. [Needs in game: that the client lets an addon open a chat window (`FCF_OpenNewWindow`) and name it, that a click on the sender's link reaches Vanguard, and that the tab text keeps the count.]
- If it fails, paste: `/vg errors`, one line it caught or missed, and what the Filtered tab shows.

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
- Expect: the board has a title with its count, a close button at the top right, and Escape closes it; rows appear as people post, newest first, each with a faint wash under the mouse and LFM or LFG, a dungeon and its range (or "Any dungeon"), the roles named, the sender's name without its realm or ruleset part and the age; the tooltip shows the whole line and the full name. The click opens the chat box with `/w <full name> Hi! ...` filled in and sends nothing. Your own post does not appear. The whisper reaches the player when you send it (a two-part name that fails is a finding). Inside a dungeon nothing new appears and `/vg errors` stays empty.
- If it fails, paste: a screenshot of the board and the chat box, the line that was misread, and `/vg errors`.

### 18.3 Quest guidance

- Do: talk to a quest giver with a quest you don't have, then type `/vg questdata`. Type `/vg questdata <id>` for one quest you know is new in WoW Forever and one you know is from 2004. Open the world map on a zone with quests you haven't taken; hover a "!" pin and click it. Shift-click a quest in Vanguard's tracker. Under `/vg` → Quests → Quest guidance set The arrow to "A map waypoint on the next step" and Shift-click again.
- Expect: the first chat line says `New-quest flag: none on this client (...)` or names one; the lines for the two quests differ in some field (that field is the flag to use; a New mark on the new quest means Vanguard found it). Pins sit on quest givers, or Vanguard draws none because the game's own map shows its quest offers there (either is fine; two "!" on one spot is a finding). The click puts a waypoint there and the game's arrow points at it. Shift-click says `Arrow: <quest>.` and the game's arrow follows the quest; with the waypoint setting the arrow points at its next waypoint or objective area. When the game gives a next step, the tracker shows it in the accent above the objectives.
- If it fails, paste: the whole `/vg questdata` output for both quests, a screenshot of the map and the tracker, and `/vg errors`.

### 18.4 /way and the floating waypoint pin

- Do: type `/way 45 61`, then open the world map and supertrack a quest (click its pin or its entry in the quest panel), then `/way clear`. In a group, let the game track a party member (the group finder's "track" on their frame, where offered); on a corpse run, look at the pin while you are a ghost. Then untick **Vanguard's pin and font on the game's floating waypoint pin** under `/vg` → Map, `/reload`, and `/way 45 61` again.
- Expect: the floating marker in the world is Vanguard's teardrop pin in your accent colour, the distance under it (`12 yds`) in the theme's outlined font, and it still fades as you look away from it and when you reach the spot; a supertracked quest shows the same pin. A party member's portrait and the ghost's tombstone are the game's own, untinted. With the switch off, the game's own pin art and gold text come back. [Needs in game: the pin's size against the game's, its look after `/way` and on a supertracked quest, and that the game's `SuperTrackedFrame` is present on Forever.]
- If it fails, paste: a screenshot of the pin, which step broke, and `/vg errors`.

### 18.5 Levelling guide probe (LG-0)

- Do: with at least one quest in your log, stand in a town and type `/vg guide probe`. Type it again in combat, and once inside a dungeon if you can. Turn in one quest, then type it again.
- Expect: a line per read: `present, <number or flag>`, `present, hidden` for a value the client hides, `present, not called (no quest)` with an empty log, or `missing`; a table reads `table of N` and a map position `position plain`. After the turn-in the `QUEST_TURNED_IN` line says `first arguments number, number` (or names the type it is); `QUEST_ACCEPTED` the same after you accept one. Nothing else on screen changes.
- If it fails, paste: the whole `/vg guide probe` output from each place, which lines say `hidden` or `missing`, and `/vg errors`.

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
- Expect: a panel right of the mail window, headed `Find mail` (no X: it follows the mail window), lists the matching mails (sender: subject, with money and item count); the filter button reads All, Money, Items, Sales; Take takes the money and the first item, one per click; the panel goes when the window closes; chat lists the same matches. With the switch off, `/vg mail` says so. [Needs in game: that TakeInboxMoney and TakeInboxItem(mail, 1) work from a click, that GetInboxInvoiceInfo marks sales, and the panel's place beside the window.]
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

### 29.0 The Cooldowns page and its wizard

- Do: type `/vg cooldowns`. Hover each switch. Click **Set up cooldowns**, go through the three steps with Next and Back, ticking nothing, then Done. Type `/vg cooldowns setup`, tick **Show the game's manager** in the first step and untick it again. Start a fight with the window open, then type `/vg cooldowns setup` in the fight.
- Expect: the page has three cards (the game's manager, Gaps row, Buff glow), a tooltip on each switch and the slider, and Combat tools has a one-line note pointing here. The wizard shows Step 1 of 3 to Step 3 of 3, Back stops at the first step, Done closes it, and clicking through changes no setting. In a fight the window waits and opens when it ends. `/vg errors` stays empty. [Needs in game: how the wizard and the page look and read; whether the manager's switch behaves in the wizard as it does on the page.]
- If it fails, paste: `/vg status` and `/vg errors`.

### 29.1 The gap row

- Do: under `/vg` > Cooldowns tick **Gaps row**, reload. Wear an on-use trinket, type `/vg gaps add Healthstone` (or an item ID) with one in your bags, use the trinket and the item. With a pet out, use one of its abilities. As a shaman with the class bars off, drop a totem. Then repeat inside an instance in combat.
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
- Expect: a dialog above everything with a close button at its top right, a line in small grey type naming the kind and role, and a scrolling list with a thin thumb in the dialog's right margin, a slider and a number box (a small gap right of the slider) for each of 21 stats (the ones your class and role value first); the box follows its slider, and a typed number sticks (past 3 the slider sits at its end); Defaults puts them back. Save closes it and prints a line in chat; `/vg weights` shows the weight you moved. Cancel closes it and changes nothing.
- If it fails, paste: screenshots, your resolution and UI scale, and `/vg errors`.

## 32. One look across windows

These steps check what the UI consistency pass changed (docs/THEME.md, Window chrome). Like the rest of this file, each Expect is what the code intends; nobody has seen it in the game.

### 32.1 Window titles, the X and Escape

- Do: open each of these and look along its top edge: `/vg` (the options window), `/vg setup`, `/vg whatsnew`, `/vg quests`, `/vg lfg`, `/vg export pick`, `/vg weights wizard`, `/vg prep setup` and `/vg feedback`; then `/vg unlock` and right-click a frame's handle. For each, click the X, open it again and press Escape.
- Expect: every title is the same bold type in the normal text colour (not gold, not the accent). It sits at the top left in the options window (right of the Vanguard shield, with your faction crest just right of it while Faction look is on), the quest log, the group board and the dialogs; it is centred in setup and What's new, with a small grey line under it (`Step 1 of 4 · Layout`, `Click a line to open its setting.`). The quest log shows its quest count in small grey type beside the title (`12 quests`). The unlock popover's title is a smaller line, `<frame>  ·  <where it is anchored>`, that ends short of its X. Each of these windows has the same X in its top-right corner; the X closes it, and so does Escape. [Needs in game: that every title sits on its X's line at 1080p and 1440p, and that Escape closes the popover while frames are unlocked.]
- If it fails, paste: a screenshot of each window's top edge and `/vg errors`.

### 32.2 Card titles

- Do: at the auction house open the Posting tab and the Lists tab; type `/vg prep` (the Instance prep card) and `/vg meter on`; at a mailbox with the mail tools on, look at the panel beside the mail window; with a profession window open and the Auction helper on, look at the panel to its right.
- Expect: each card's title is one line of the same smaller bold type in the normal text colour, 8 units in and 8 down from the card's top-left corner: `Sell`, `Up now`, `Your auctions`, `Lists`, `Shopping` and `Scan` on the auction cards, `Instance prep`, `Find mail` (no X: the panel follows the mail window) and `Crafting cost`. Instance prep has an X in its top-right corner with its Buy list button level with it, just left of it. The meter's heading (`Damage per second` or `Healing per second`) is such a title too, and a click anywhere along it still switches the meter.
- If it fails, paste: a screenshot of the card and `/vg errors`.

### 32.3 A long dialog title stays clear of the X

- Do: type `/vg report` (a text box titled `Vanguard report: Ctrl+C, then paste at vanguardui.com/feedback`), close it, then type `/vg profile Smoke` (a reload dialog) and `/vg export` (a short title).
- Expect: no title runs under the X. If the report box's title needs a second line it takes one (two at most), hung from the top so the first line stays level with the X and the second sits under it, never above the X or against the panel's top edge, and the text area starts below it; the reload dialog's sentence wraps the same way, short of the X, and the dialog grows tall enough for it with its buttons under it. The `Vanguard export (profile Smoke)  Ctrl+C to copy` title is one line and leaves the text area where it was.
- If it fails, paste: a screenshot of each dialog and `/vg errors`.

### 32.4 Question dialogs: the X and Escape answer No

- Do: open `/vg` → Profiles and click **Reset profile**; when the question shows, press Escape. Do it again and click the X. Do it a third time and click No. Then, on a character that has never finished setup, click through `/vg setup` to Done and, when it asks `Keep a copy of these settings outside the game?`, click the X.
- Expect: the question reads `Reset this profile? Every setting in profile <name> goes back to Vanguard's defaults, for every character that uses it. A copy is kept as profile <name> backup.` with Reset and No, both plain (neither in the accent). Escape, the X and No close it the same way: nothing is reset and chat says nothing about a reset. After the setup question's X, the reload offer (`Setup is done. Reload the UI now to apply it?`) comes up as it does after No. On a reload dialog, the X and Escape close it like Later, without reloading. [Needs in game: that Escape closes a dialog opened over the options window.]
- If it fails, paste: which of Escape, the X or No did something different, and `/vg errors`.

### 32.5 The accent button in the Core dialogs

- Do: type `/vg import` (an empty import box), `/vg export` (the string box), `/vg export pick`, `/vg profile Smoke`, `/vg feedback` and `/vg weights wizard`, and open the question from 32.4.
- Expect: the one button that does what the dialog is for is filled in the accent with dark text at the bottom right: Import, Export, Reload, Make report, Save. The buttons beside them are plain slate: Cancel (next to Import, Export, Save and Make report), Later, Defaults and, in a question, both the confirming button (Reset) and No. The string box from `/vg export` has only a plain Close. Buttons are 26 tall and 120 wide, except All and None in the export-pick dialog, which are 60 wide. [Needs in game: how the accent button reads at 1080p and 1440p.]
- If it fails, paste: a screenshot of the dialog and `/vg errors`.

### 32.6 The scroll thumb

- Do: type `/vg export` on a profile with many modules, scroll it with the wheel, then drag the thumb; paste a short string into `/vg import`, then a long one. Open `/vg export pick` and `/vg weights wizard`, and in `/vg feedback bug` type enough lines into one answer to overflow it. Open `/vg quests` with many quests, and talk to a quest giver whose text is long.
- Expect: where a text or list is taller than its box, one thin grey line (4 units wide, half bright) shows in the dialog's right margin, 12 units right of the text; it goes full bright under the mouse and while you drag it, and moves as you scroll or type. The text fades softly at the top once scrolled and at the bottom while there is more; the wheel moves it 40 units a step. There are no arrows and no game scroll bar. Where everything fits (a short import box, an export list with few modules) there is no thumb. The quest log's list and its details scroll the same way, and so does the quest dialog's body. In the feedback form each text area has its own thumb, shown only when that answer overflows.
- If it fails, paste: a screenshot of the window and `/vg errors`.

### 32.7 Section headers

- Do: open `/vg` → General; open the bags with items of several kinds (combined bag on); open `/vg whatsnew`, `/vg quests` and `/vg` → Click casting, and click a grid cell to open the spell picker.
- Expect: the same small grey capitals line heads each: the options cards (`LOOK`, and so on); the bag's sections (`QUEST ITEMS`, `EQUIPMENT`, `CONSUMABLES`, `TRADE GOODS`, `OTHER`, `JUNK`, `EMPTY`), no longer in the accent; What's new's module groups; the click-cast grid's columns (`PLAIN`, `SHIFT`, `CTRL`, `ALT`), centred over each column; and the picker's groups (`HEALS`, `PROTECT & CLEANSE`, `BUFFS`, `OTHER`). The quest log's zone names are such headers too, each with a chevron before it (down while open, right while folded); clicking one folds or opens its quests. The quest tracker's header reads `QUESTS` with the number of quests you watch after it and a chevron; clicking it folds the tracker to that header (a brass line stays under it) and clicking again opens it. A bag header takes no clicks.
- If it fails, paste: a screenshot of the window and `/vg errors`.

### 32.8 The chosen row

- Do: open `/vg` and click three pages in the list on the left; open `/vg quests` and click two quests; at the auction house click a list in the Lists pane, click a row of it and press Down with the mouse over the listings. Then type `/vg accent jade`.
- Expect: the chosen row in each (the page in the options list, the quest in the log, the list in the pane, the listing under Up and Down) has a thin bar in the accent along its left edge and a faint accent wash behind it, the same in all of them; a row under the mouse gets only a faint grey wash. After `/vg accent jade` the bar and the wash are jade at once, without a reload. The options list holds all 19 pages, each 25 tall. [Needs in game: that the 2-pixel bar stays crisp at 1080p and 1440p.]
- If it fails, paste: a screenshot of the row and `/vg errors`.

### 32.9 The options preview

- Do: open `/vg` → General and look at the sample at the top; change the accent and the Bar texture.
- Expect: the sample unit frame shows your character's own name (`You` if the game hides it) where `<name>` used to be, with `72%` on its right; the sample action button shows Vanguard's crest, a shield with crossed swords, instead of the game's question mark, with `1` and `5` in its corners. The bars and the button's glow follow the accent and the texture as you change them.
- If it fails, paste: a screenshot of the sample and `/vg errors`.

### 32.10 General captions

- Do: open `/vg` → General and read the captions under Look.
- Expect: `Color assist (reload)`, `Font`, `Text size`, `Faction look`, `Theme variant`, `Corners`, `Window ornaments` and `Pixel-perfect scale`, each a noun with nothing after it. Two small grey notes sit under their rows: `Friendly blue, neutral yellow, hostile vermilion.` under Color assist and `A brass rule or corners on large windows.` under Window ornaments. In `/vg whatsnew`, a line about Corners or Theme variant still opens General on its row.
- If it fails, paste: a screenshot of the Look card and `/vg errors`.

### 32.11 Quest line marks

- Do: talk to a quest giver who offers a quest, then to one who has a quest of yours in progress and one that is ready to turn in; open `/vg quests` with a quest ready to turn in.
- Expect: in the dialog each quest line has Vanguard's own thin mark before its number: a gold `!` for a quest you can take, a gold `?` for one ready to turn in, a grey `?` for one in progress. They are not the game's round gossip icons; a gossip line keeps whatever icon the game gives it. In the log a quest ready to turn in shows the check mark. On the world map the quest-start pins show the same `!`.
- If it fails, paste: a screenshot of the dialog and `/vg errors`.

### 32.12 Faction look and the fonts

- Do: on an Alliance or Horde character set `/vg` → General → Look → Faction look to Crest and heading font. Look at the minimap's zone name along its top edge, at the options window's title and a card title, and at a quest giver's name in the quest dialog. Then set it back to Crest only.
- Expect: with Crest and heading font, window titles, card titles and the quest dialog's NPC name are in the faction's font (Cinzel for Alliance, Metamorphous for Horde), while the minimap's zone name stays bold Fira Sans Condensed at the same size as a card title. With Crest only every one of them is Fira Sans Condensed. A neutral character and a Russian client see Fira Sans throughout.
- If it fails, paste: a screenshot of the minimap's top edge and of the window title, and your faction.

### 32.13 Rounded corners on an accent button and a segment

- Do: type `/vg corners rounded`. Open `/vg` → Profiles and look at **Create**; type `/vg unlock`, right-click a handle and look at the popover's **Done**; in General look at the Corners row (the chosen segment); hover a plain button and hold the mouse down on it. Then `/vg corners square`.
- Expect: the accent fill of Create and of Done, and the accent fill of the chosen segment (Rounded), end in the same four-pixel arcs as their borders, with no square corner of accent outside the arc; the lighter hover fill and the darker pressed fill of a plain button do the same. Square puts the corners back at once. [Needs in game: whether the arcs read on a 20 to 26 unit button at 1080p and 1440p.]
- If it fails, paste: a zoomed screenshot of the button's corner with the UI scale, and `/vg errors`.

### 32.14 Auction filters dialog

- Do: at the auction house open the Lists tab, right-click a row of a list and choose **Filters...**; press Escape; open it again and click the X; open it once more, set a level range and click Save.
- Expect: a dialog over the auction house titled `Filters: <item>` on one line that ends short of the X, with the X at its top right, Save in the accent and Cancel plain at the bottom right. Its fields (exact name only, a level range, a quality, a max price and the alert switch) sit in rows 28 apart. Escape, the X and Cancel close it without saving; Save saves and closes. [Needs in game: that it opens over the auction house window.]
- If it fails, paste: a screenshot of the dialog and `/vg errors`.

### 32.15 Feedback form

- Do: type `/vg feedback bug`, leave the summary empty and click Make report.
- Expect: the form is titled `Send feedback` with an X at its top right, and Escape closes it. Under the bug fields a small grey note, `Your /vg report (version, client and the errors caught this session) goes in the block with your answers.`, wraps inside the form. Make report with an empty summary puts `The short summary is required.` in the warning colour just above the Make report and Cancel buttons, not over them.
- If it fails, paste: a screenshot of the form and `/vg errors`.

## 33. In-game checklist: the UI coherence pass

This is one session's worth of checks for everything merged from #395 to #415 (the UI coherence plan, phases 8.1 to 8.10, and the reskin coverage batches 1 to 3). **Nothing here has been seen in the game.** Each Expect is what the code intends. Section 32 already covers the Vanguard windows' titles, Escape, scroll thumbs, section headers, quest marks, the faction look and the feedback form, so those steps are not repeated here.

The order is the order to play in: looks you can check quickly first, then the game's own windows Vanguard now skins, then the controls that take keys, and last the steps that need a fight. Steps tagged **[Combat]** need a fight (a dummy or a mob you can start one with) and go at the end.

### 33.1 Sliders: grey fill, white thumb, a locked slider

- Do: `/vg`, General, then drag a size slider. Under Layout, lock a frame's width to match another's, and look at its size slider.
- Expect: the filled part is a quiet grey bar up to a solid white thumb with a dark outline. The empty track has a one-pixel outline at 1x and at a larger UI scale. The locked slider has a grey thumb and a muted caption.
- If it fails, paste: a screenshot of the sliders and `/vg errors`.

### 33.2 Switches: knob glide and tracks after a Theme change

- Do: `/vg`, toggle a switch. Turn Reduce motion on and toggle it again. Then change the Theme and look at the switch and slider tracks.
- Expect: the knob glides in about a tenth of a second, and jumps when Reduce motion is on. After a Theme change, the switch and slider tracks take the new colours with the panels.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.3 Check boxes: AddOns list, chat settings, raid All assist

- Do: open the game menu, Options, AddOns, and scroll the list; press Enable All and Disable All. Open the chat window's settings, the Combat and Text-to-speech categories, and Message Types. If you lead or assist a raid, toggle All assist on the Raid tab of the social window.
- Expect: each check is a 16 px dark box with the check glyph in the accent when it is on. Hover shows a border, a held press shows a shade, and a disabled box shows its mark and label in the disabled colour with no border stuck. Enable All and Disable All update the marks. The All assist label is grey when you are neither leader nor assistant.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.4 Radios, dividers, arrow buttons, the quest track box

- Do: open the mail window's send page and choose Send Money, then COD. In the chat settings, move a line up and down. Look at a divider row on the options window. Open the quest log and tick a quest's track box.
- Expect: the radio is a round dark ring with a brass dot, centred, and choosing one clears the other. Dividers are one pixel. The arrow buttons point the right way and grey out when disabled. The track box shows a check when the quest is tracked.
- If it fails, paste: a screenshot of each and `/vg errors`.

### 33.5 Scroll bars: the game's old-style bar

- Do: `/vg lfg`, or the game's Group Finder, and open a listing with a comment box. Drag its scroll bar. Then drag a scroll bar on a game settings page.
- Expect: the old bar's thumb has one thin line that follows the thumb and brightens while you drag it. Its up and down arrows are gone, and the faded arrows take no clicks.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.6 Selected rows in the game's lists

- Do: click rows in the Titles list, the Equipment Manager, the collections Sets list, the group finder's Browse list and a community list in the social window. Click a trainer skill and watch the list.
- Expect: the picked row has a 2 px accent rail on its left edge over a lighter fill. The rail moves with each pick, and recycled rows carry no stale rail. The game's own selection is what the rail follows.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.7 Chat side buttons and Quick Join

- Do: hover the chat window's side buttons. Scroll up, then click the scroll-to-bottom glyph. Open the chat menu and minimize the chat. When Quick Join's toast appears, look at it.
- Expect: the side buttons are tiles with their glyphs, and the scroll-to-bottom glyph shows. The chat menu and minimize still work. Quick Join's queue art is hidden.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.8 Chat bubbles

- Do: in the open world, say something near another character or a mob. Then enter an instance and say something there.
- Expect: in the world, bubbles are flat slate panels with their text on them. Inside an instance the game's own bubbles show, and `/vg errors` is empty.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.9 Toasts: Battle.net, time played, voice prompts

- Do: wait for a friend to come online, or use `/played` for the time-played toast. If voice is on, look at a voice chat prompt. Skip the voice part if voice is unavailable.
- Expect: the Battle.net online line sits in secondary text after the toast's own animation. The time-played toast is themed. Voice prompts take the toast look, with a themed Join button.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.10 Fonts: raid warning, screenshot line, frame rate, floating damage

- Do: take a screenshot and look at the line it prints. Turn on the frame rate readout in the video settings. Turn on floating combat text and hit a target dummy. If you can, see a raid warning in a raid.
- Expect: the raid warning, the screenshot line and the frame rate text use the theme font at the game's size, and the raid warning follows a Theme change. Floating damage numbers use the theme font at the game's size. If the numbers over a mob keep the game's font, that is the open check (the font is set when the addon loads).
- If it fails, paste: a screenshot and `/vg errors`.

### 33.11 Breath and fatigue bars

- Do: swim underwater until the breath bar shows.
- Expect: the bar sits in the timers group with its caption in the theme. This path has never been seen in game, so the first look decides it.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.12 Durability figure with the info strip

- Do: turn the info strip on, then look at the durability figure on the character sheet or the bottom of the screen. Turn the strip off and look again.
- Expect: the game's durability figure is hidden while the info strip is on, and returns when it is off.
- If it fails, paste: a screenshot of the strip and `/vg errors`.

### 33.13 Personal resource display

- Do: with Edit Mode's personal resource display shown, look at it for your class's power bars (a Rogue's combo points or a Mage's mana, for example).
- Expect: flat bars on slate panels where Edit Mode puts them, with no visible seam between the health and power panels.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.14 Quest tracker: countdown and recipes

- Do: track a timed quest and a profession recipe, and watch the tracker.
- Expect: the timed quest shows a `Time left` countdown that ticks. Tracked recipes appear under a Recipes section with their reagent lines, and a reagent the client has not cached joins a moment later. Untimed quests show no countdown. Whether Forever reports quest timers and recipe tracking is the open check.
- If it fails, paste: a screenshot of the tracker and `/vg errors`.

### 33.15 Waypoints and the floating pin

- Do: `/way` to a spot on the map. If you can, track a party member with no nearest token.
- Expect: the pin is a teardrop in the accent colour with the distance text. If it looks stretched, paste a screenshot, since the icon is 32 by 32 and drawn at the atlas size. The party member's pin is the game's gold atlas, tinted.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.16 Loot window, merchant rows, buyback, money

- Do: loot a corpse with several items and scroll the list. Open a merchant and buy an item, buy one back, use the repair tiles and the page arrows.
- Expect: loot rows show the item look on every row as the list scrolls. Merchant rows, buyback, the repair tiles, the page arrows and the coin lines all look right after paging and after a buy.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.17 Auction house: multi-stack sale and its own pages

- Do: on the Sell tab, start a multi-stack sale and watch its progress bar. Then look at the Buy search, the Sell page, the Auctions and Bids sub-tabs, and a purchase confirmation. Do this once with Vanguard's Auction Helper page on and once off.
- Expect: the progress bar is flat, with its icon and cancel cross kept. The Buy search bar is flat, with the star and sort arrows kept. The picked category and result line use the selected look with no gold row art. Category names stay light after the mouse leaves (the least sure of these). The Sell coin boxes, duration dropdown, buyout check and grey Create Auction heading look right, and the confirmation is flat with three buttons. With the helper on, its Lists and Posting tabs are unchanged.
- If it fails, paste: a screenshot of each page and `/vg errors`.

### 33.18 Game windows: titles and insets

- Do: open the trade window, the mail window, the spellbook, the talents, the professions window, the collections journal and, if it opens on Forever, the achievements window.
- Expect: each window's title is centred where the game puts it, in the heading role and light text. Every window's inset is a sunk panel with no seams.
- If it fails, paste: a screenshot of each window and `/vg errors`.

### 33.19 Trade, mail, quests, gossip, popups, roll, time manager

- Do: trade with another player. Open the mail inbox and send page. Accept a quest and open gossip. Open a ready check or another popup. Roll on loot if you can. Open the time manager and its stopwatch. In the stack split, type an amount and click coins.
- Expect: the trade, mail and quest panels look flat with light text and no gold border. The stack split and coin pickup amount sit in a thin-bordered box between visible arrows, and still take input. Roll windows, popups and the time manager are themed.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.20 Spellbook, talents, professions, inspect, flight map, guild bank

- Do: open the spellbook and read a page. Open the talents, the professions window and a linked recipe. Inspect another player. Open the flight map. Open the guild bank.
- Expect: each is themed with flat panels and light text. The spellbook text is readable (watch for a font colour that is too dark). The professions list follows the game's selection. The inspect window and the flight map have themed borders.
- If it fails, paste: a screenshot of each and `/vg errors`.

### 33.21 Town: stable, class trainer, small windows

- Do: visit a pet stable, then a class trainer's skills list and its categories. Open the macro window and an icon picker. Open the loot history and the master loot candidates. Open the currency transfer window.
- Expect: the stable has a flat panel with its pet model on a dark box. The trainer's skill rows have no plate, their icons are kept, and the selected skill's rail follows clicks (if the list does not redraw, it follows only when a row is acquired). The macro window and icon pickers are flat with a dark name box. The currency transfer has one thin line above the transaction.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.22 Menus, role check, ready popup, match results

- Do: open a dropdown from a unit frame or the game menu header. If you can, trigger a role check in a group, a ready check, a battleground enter dialog, and look at match results after a match.
- Expect: menus and dropdowns are flat panels with a soft shadow and no gold border. The role check, ready popup, enter-battle dialog and match results are flat, with rows and team colours unchanged.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.23 Social: guild window, guild control, open letter

- Do: open the guild window and look at the roster, Guild Info, News, the benefits page and the Preferred Play dropdowns. Open the community list. Open the guild control window (ranks, permissions, bank tabs, Discord) if you have the rights, and switch its tabs. Open the guild log, the settings, the news filters and the invite manager. Open an open letter from the mail or an auction invoice.
- Expect: roster rows, the community list's selection rail and the benefits page are themed. The guild control window keeps its skin when you switch tabs. The open letter and auction invoice have light text in a sunk box.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.24 Social: channels, friends, registrar, charter, raid tab, cards

- Do: open the channels window and its open channel, then rename a channel and create one. Open add friend and the Battle.net invite. Open the guild registrar, charter and tabard pickers. Open a role poll and the dungeon invite check boxes. Open the raid tab, including Raid Info. Select a social card, and look at the recruit reward card and Accept. Rename the guild.
- Expect: the open channel is lit and its rail follows clicks after the game redraws. The create-channel title and labels are light. The registrar, charter and tabard pickers are themed. The raid tab's class buttons are raised panels. The single-line invite toast text is readable. The guild rename window is themed.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.25 Map: world map, quest panel, group finder, Legacy

- Do: open the world map and use its floor dropdown, tracking filter and pin tile. Open the quest panel and the queue status. Browse the group finder's listing and search pages. Open the Legacy window, pick a tree card and open a challenge, and look at its calendar and dialogs.
- Expect: the map's dropdown and filters are themed, and the quest row's track tick follows the game's check. Browse and who rows keep the rail after a click. The picked tree card and open challenge use the selected look (rail and fill), and the rail moves with the pick. The objective and points bars show their fill, and the calendar's month arrows and class buttons show the pushed glyph.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.26 Character pane: lists, flyout arrows, sets

- Do: open the character pane's reputation, skills and currency lists. Hover an equipment slot to open its flyout and use its page arrows. Open the Titles list and the Equipment Manager.
- Expect: the list rules are one-pixel dividers above and below. The flyout's page arrows point the right way and still page. Picked rows use the selected look, and the gear tick, icons, spec icon and lost-set red all stay.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.27 Options, Edit Mode, chat settings in the game

- Do: open the game's options window and a few pages, including the nav and the Performance head. Open Edit Mode, change the layout and size, use the grid slider and the layout dropdown, and open the system settings dialog and the import/save dialog. Open the addon list's bar and dropdowns.
- Expect: section headings are small grey capitals. The setting rows' checks, sliders and dropdowns are themed and work. Edit Mode keeps its layout with the new checks and panel. The system settings dialog resizes and stays themed across systems.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.28 Cooldown Manager, keybinding, click binding, help, report, colour picker

- Do: open the Cooldown Manager settings and refresh its layout. Use its search, a bar and its dropdowns, then Undo. Open the keybinding window and the click binding window (hover, delete, marks, the tutorial card). Open the help window and the report window (its minor-category rows and comment box). Open the colour picker and use its Hash field and opacity slider.
- Expect: the Cooldown Manager's headers stay grey after a layout refresh, and its dropdowns and Undo are themed. The keybinding and click binding windows are flat. The help window has its inset. The report's minor-category rows follow the select state. The colour picker's Hash field and opacity slider are themed.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.29 Combat log, death recap, Cooldown alerts, movement pad, Lua error window

- Do: open the combat log and use its filter arrow and progress bar. Open the death recap (or wait for a death). Trigger a Cooldown Manager sound alert and a group buff visual alert. Click the movement pad's arrows. Run `/run error("test")` to open the Lua error window, then page and scroll it, and close it.
- Expect: the death recap box, its divider and its Unavailable line are themed. The combat log's filter arrow and progress bar are themed. The alert dialogs are themed. A clicked movement direction lights and unlights, and dragging and locking still work. The Lua error window pages, scrolls and closes.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.30 Vanguard buttons and far-left actions

- Do: in `/vg`, press Create, Save and Reload now, and hover and press one. Look at Delete and Copy here on a profile. Abandon a quest from the quest log and say Goodbye in a quest dialog. Open a question such as Delete profile or Clear recent. Change the Text size to 130% and look at a dropdown's caption.
- Expect: primary buttons hover to a lighter accent and press a shade darker. Delete and Copy keep a plain look with a red label. Abandon and Goodbye sit alone at the far left. A question's Yes is the primary, and a destructive question shows a danger button. A long caption wraps left of its column.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.31 Keys: Tab focus, Enter, sliders, menus, search

- Do: run `/vg setup`, then Tab through the wizard to Skip setup, Back and Next, and press Enter on Next. Open a question such as Delete profile, press Tab and Space. Open the Font menu and press Escape, then open it again and click outside it. In `/vg`, Tab to a slider and press Left and Right. In the options search, type `vermilion` and press Enter, and clear the box with its glyph. Type in an edit box.
- Expect: the focus ring moves through the choices, Skip, Back and Next. Space presses a focused button, and Enter on Next advances. On a danger question Enter does nothing unless a button has focus. Escape closes the Font menu and leaves the options window open, and a click outside closes it. Left and Right step a focused slider. The search jumps to the Color assist note without an error, and its clear glyph empties the box. An edit box border turns accent while you type. A menu with more than 16 rows (Bar texture with shared textures) shows a thumb.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.32 Spacing in the Vanguard windows

- Do: compare What's new, the quest log's text and rewards, the quest dialog, an export dialog with text, the options nav groups, the unlock popover's footer, the minimap button drawer and the raid tools bar. Look for even edges.
- Expect: the gaps sit on the same scale everywhere. The unlock popover's Done and Reset sit 4 px further in than before. Nothing else shifts.
- If it fails, paste: a screenshot of the window that looks wrong.

### 33.33 Group board, Mail tools, dropdowns over dialogs

- Do: open the group board and read its note and hint. Open Mail tools' card. Look at group threat, rolls and the officer roster with a 12-letter name. Open the feedback form's Part of Vanguard dropdown, and the auction filters' Quality dropdown.
- Expect: the group board's note and hint do not overlap, and the hint fits one line. Mail tools' rows, Take button and preset hint fit the 270-wide card. A long name next to its figure still reads. Both dropdowns open over their dialog, not behind it.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.34 [Combat] Menus and the keyboard focus

- Do: open a dropdown menu, then start a fight. Separately, open the setup wizard or a question dialog, Tab to a button, start a fight, end it, and press Tab again.
- Expect: the menu closes when the fight starts, and the first click after it is not swallowed. The window gives up the keyboard in combat and takes it back after the fight.
- If it fails, paste: `/vg errors`, and the combat log if it shows an error.

### 33.35 [Combat] Enter and movement with a question open

- Do: open a question dialog, then start a fight with it open. Press Enter, then hold the movement keys.
- Expect: Enter does nothing in combat, and the movement keys still work with the question open.
- If it fails, paste: `/vg errors`.

### 33.36 [Combat] Switch knobs and slider thumbs

- Do: in combat, toggle a switch. Drag a slider in combat, then drag one out of combat.
- Expect: in combat the knob moves at once with no glide, and dragging has no lag.
- If it fails, paste: a screenshot and `/vg errors`.

### 33.37 [Combat] Edit Mode, quick keybinding, Raid tab

- Do: open Edit Mode and the quick keybind window out of combat, then close them. Open the Raid tab in a group, start a fight with it open, end the fight, and use the member buttons. If the game lets you open Edit Mode in a fight, do that too.
- Expect: no taint error. The layouts and checks look as in 33.27 and 33.28. The member buttons work after the fight.
- If it fails, paste: `/vg errors` and the exact error line.

### 33.38 [Combat] Accent change with a hidden dispel debuff badge

- Do: with a debuff badge coloured from a hidden dispel type on screen, change the accent colour.
- Expect: no error in `/vg errors`. This is the probe that issue #284 still needs.
- If it fails, paste: `/vg errors`.

### 33.39 Chat size and background

- Do: with a fresh profile, look at the main chat window over a bright area (snow, desert) and over a dark one. Open `/vg` → Chat and cycle Chat background strength through Light, Medium and Dark, then untick Chat background. Look at the tabs and the Copy button.
- Expect: the window is about 500 wide and 154 tall (420 wide on a small screen) (a profile that already sized chat keeps its size). A soft dark patch sits behind the text and the tab row with edges that fade out (no hard border), the text reads over bright ground at Medium, and the strength follows the setting at once. Tab names show in full (General, not Gene…) the Copy button sits at the right end of the tab row, and the scroll bar on the right is a slim thumb on the backdrop with no boxed arrows (the scroll-to-bottom glyph still shows when scrolled up). Tab names are readable. Cycle Chat window size through Larger and Largest: the window resizes at once. On a 4K screen, switching Pixel-perfect scale on (General → Look, no setup) keeps the UI and chat about 1080p's size, not half of it.
- If it fails, paste: a screenshot over bright ground and `/vg errors`.

Not built yet: the offer to turn off the game's tutorials in setup (decision 14a, batch 3's R3.6). It waits for a level-1 check in game. Its step will go here, after 33.38, when it lands.

## When you are done

Paste into the first message of the next Claude session: the `/vg report` block (or the output of `/vg status` and `/vg errors`), the list of failed step ids, your screen resolution and UI scale, and the client build from the status line. Failures become tasks in `docs/handoff/WORKPLAN.md` before the performance phase starts.
