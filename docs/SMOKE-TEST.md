# Vanguard smoke test (for the owner)

Run this once in the WoW Forever beta after the P0 branch is merged. **Nothing in it has been seen in the game.** Every "Expect" line is what the code intends, read from the source when this was written, not something anyone watched happen. A step that fails is the useful result: it tells us what to fix.

Written against the Forever client build 1.60.1.70170 (the Blizzard UI source the code was checked against). `/vg status` prints the build you are really on.

Things to know before you start:

- The checklist changes your saved settings (a throwaway profile, `/vg reset all`). Use a spare character, or run `/vg export` first and keep the string.
- Steps that need other players (party, raid, main tank, ready check) or an instance are marked "if you can". Do not block the report on them.
- Where an Expect depends on an earlier fix, a bracketed note says which. If that fix did not land, the note says what you will see instead.
- Quote chat lines as they appear; a missing or different line is a finding.

## Run this before the beta closes (one page, about ten minutes)

One command asks the client every open question the research left and writes the answers down. Nothing in it changes a setting or the game, and nothing in it has been seen in the game yet. Do it before anything else in this file: after the beta closes there is no Forever client until launch.

1. Get ready, out of combat: stand in a town, have a quest in your log and super-track it (click its tracker), and target a mob or a critter (a training dummy is fine).
2. Type `/vg probe`. A copy box opens; press Ctrl+C and paste it whole. Chat says `Probe done: N present, N missing, N errors`. If the box is empty or a Lua error shows, paste `/vg errors` too. `/vg probe chat` also prints every line to chat.
3. Round trip, in two goes. Type `/reload`, then `/vg probe` again: the `earlier run:` line under SavedVariables says `from an earlier session` with `#1`. Then quit the game to the desktop (not just the character screen), start it, and run `/vg probe` once more: the same line says `#2` or higher. If it says `none saved`, SavedVariables did not survive; say which of the two goes failed.
4. In a fight: type `/vg probe fight`, pull any mob, and let it finish (a boss pull or a dungeon is best; if you can, do one in the open world, one in a dungeon and one in a battleground). Chat says `Probe: the fight report is ready`. Type `/vg probe last` and paste the box: it holds the last out-of-combat report and the fight reads taken as the fight starts and three seconds in.
5. In an instance if you can: stand at the entrance, out of combat, and run `/vg probe` once more, so the restriction states and `C_Secrets` lines are on record for a dungeon.
6. If you have a minute: set a map waypoint (`/way`) or super-track a quest on another zone's map and run `/vg probe` again, so the navigation lines show a distance and a next waypoint.

**Probe rows for the polish batch (session 0, about 15 minutes).**

These rows answer what the quest windows, raid marks, group frames and bars wait on. They are the report's "Quest and map reads", "Party, marks and bosses" and "Bars and strips" sections. [Needs in game: everything these rows print.]

1. In town: open the quest log and click a quest in it, talk to a flight master so the flight map opens, and close it. Untick the game's "Show numbers for cooldowns" box in its options, use a spell with a cooldown, and watch a faction on the reputation bar. Type `/vg probe` and paste the box. Expect: under Quest and map reads, `asked about: done quest <id>, selected quest <id>`, the two completed flags, the money, group size, failed and repeatable lines, and `last flight map: system number <n>, TaxiFrame shown` (or FlightMapFrame); under Bars and strips, the three `GetCVarDefault` lines, two `GetQuestLogRewardXP` lines (compare each number with the quest log's reward), the `bar button cooldown:` line, and `watched faction:` with its thresholds. Say whether Vanguard's bar buttons showed the countdown numbers with the box unticked.
2. In a dungeon with a party, out of combat: put a raid mark on a mob, target it, and type `/vg probe`. Expect under Party, marks and bosses: `in combat: false`, `UnitHealth(party1)` and `UnitHealthMissing(party1)` as a number or `hidden (<type>)`, and `GetRaidTargetIndex(target)` as a number or hidden.
3. Mid-pull, on trash: type `/vg probe`. Chat says `Probe: party, mark and boss reads taken in this fight.` Do it again just after pulling a boss.
4. After the fights: type `/vg probe last` and paste the box. Expect the report, then one `== In a fight (/vg probe), <time>` block per fight run, each with `in combat: true` and the same rows; after the boss pull `UnitExists(boss1)` reads true or false.
5. If you can, in a battleground: type `/vg probe` once inside. Expect `UnitHealth(raid2)` as a number, hidden, or an error line (an error is a raid-frames bug to report).

After the first run (2026-10-19, results in the project's `research/probe/probe-2026-10-19.md`), these are still open, in this order: step 3 (the round trip), step 4 (a fight with a mob targeted, for threat), step 5 (a dungeon), step 6 with a quest in another zone, and one run with a profession window open (the craft queue's recipe list was empty with it closed).

What each part of the report answers (read the section title in the box):

| Section | Question |
| --- | --- |
| SavedVariables round trip | Do saved settings survive a reload and a full exit on this build? |
| New-quest flag | Does the client flag quests new in Forever (the New mark and pins depend on it)? |
| Threat secrecy | Are threat values hidden, in the open world and in a pull (issue #215)? |
| Group listing | Does `C_LFGList` exist and answer, and is the group finder or raid list switched on? |
| Secure paging | Do secure snippets and a bar-paging state driver work on this build? |
| Realm and name format | What do the realm, ruleset and `Name-Realm` forms look like (`/vg realm`'s key)? |
| Game rules and seasons | What do `C_GameRules` and `C_Seasons` say? |
| Colour-blind mode CVars | Do the `colorblindMode` and `colorblindSimulator` CVars exist on Forever, and what do they read with the game's colour-blind mode off and on? (Safer colours follows `colorblindMode`; run once with the mode on, in the game's accessibility options.) |
| C_Secrets predicates | Which of the 27 predicates exist, and what they say out of combat and in the fight |
| Restrictions and lockdown | The six add-on restriction states and the chat lockdown flags |
| Navigation | Does `C_Navigation` give a distance and a next waypoint for the quest arrow? |
| Undocumented on Forever | The roll tracker's old `C_LootHistory` reads (now replaced by the documented encounter calls), the craft queue's recipe and cooldown reads, and three new widget methods |

The report is also saved in `WTF\Account\<account>\SavedVariables\Vanguard.lua` under `probe`, so it can be read from the file if the chat is lost.

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
2. The whole output of `/vg status`. Today it is six lines: the version, profile and module count; the skinned, painted and waiting-on-combat counts; the client line (`Client WoW Forever`, the build, `auras on the engine` or `auras on the fallback`, `aura values readable` or `hidden right now`, and whether secure snippets work); a `Client has: ... lacks: ...` line; a `Game restrictions: none` (or the kinds that are on) line; and the `UI scale ... text ... chat ...` line.
3. The `/vg errors` result: either `No errors caught this session.` in chat, or a copy window (text selected, Ctrl+C works) with a header with the version, interface number and error count, the client line, and each error with `(xN)` and its stack lines.
4. A screenshot (Print Screen; the files land in the game's Screenshots folder).

Shortcut: `/vg report` puts items 2 and 3 in one box, selected for copying (`### Vanguard report v1 ###` to `### end ###`), with the screen size, the modules turned off and the skins. Press Ctrl+C and paste it whole; it is the same block the feedback form on vanguardui.com reads. `/vg feedback` (or Report a bug on the Feedback page in `/vg`, the last page in the list) goes one further: it asks the form's own questions in game and makes one block, the report inside it, that fills the form when pasted into it.

## 1. Install and first login

### 1.1 Link the addon

- Do: in a clone of the repository run `npm run link:wow -- --wow "<folder that has Interface/AddOns>"`, then `npm run link:wow -- --status`. (Or unzip a release into `Interface/AddOns/` and skip this step.)
- Expect: a message ending `/reload in game.`, and `--status` reporting the link. If a real Vanguard folder is already there, the message is `... is an installed copy. Add --replace to move it aside and link this clone.`
- If it fails, paste: the whole terminal output of both commands.

### 1.1a Slash commands in any capitalisation

- Do: type `/vg` with nothing after it, then `/vg disable actionbars` (then `/vg enable actionbars`), then `/vg skins SomeAddon maybe`.
- Expect: `/vg` opens (or closes) the options window; the module is found whatever the case and the chat line names it as it is spelled in `/vg modules`; the skins line answers with its usage and changes nothing. [Needs in-game check: the bare `/vg` still opens the window now that it runs under the error guard.]
- If it fails, paste: `/vg errors`.

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
- Do also: in a dungeon, a battleground and in the open world, type `/vg status` and read the `Game restrictions:` line. [Needs in game: that it is `none` in the open world and names Chat, Encounter or ChallengeMode only where the game restricts add-ons, and that chat watch and the group board go quiet then without errors. Compare with `/vg probe`, section Restrictions and lockdown.]
- If it fails, paste: the whole `/vg status` output and `/vg errors`.

### 1.4 No errors yet

- Do: type `/vg errors`.
- Expect: `No errors caught this session.` Anything else is the first bug report. [After P0.2: each entry shows a count and a stack.]
- If it fails, paste: the whole `/vg errors` output.

### 1.5 Memory over a minute

- Do: stand still in a city out of combat, type `/vg mem`, and wait a minute without opening windows. Then repeat it once.
- Expect: first `Saved data (estimate): account file X of a 16.0 MB budget; largest: ...` and `This character's file: ...` (note both, and the real size of `WTF\Account\<name>\SavedVariables\Vanguard.lua` on disk, so the estimate can be checked); then the line `Measuring Vanguard's memory for 60 s`; after a minute two lines: `Vanguard's memory over 60 s: A MB to B MB (+N KB, +R KB/s), low L, high H MB.` and `After a garbage collection: A MB at the start, B MB at the end (+N KB); ...` (the game may hitch briefly as it starts and ends). If the line is instead a low-point verdict (`The low point held` or `The low point rose`), note it: the client refused the collection. A clean rise of a few hundred KB once is normal; one that rises on every run is not. Note the two clean figures for the report. In combat `/vg mem` says it can't read, and `/vg perf` says `memory: not read in combat`. Without `/vg perf cpu` set, `/vg perf` starts `CPU 0.xx ms a frame now (... on average, peak ... ms, N % of all addons; N frames over 5 ms)`; note the line. If it says `CPU off` instead, the client has no always-on profiler. Then type `/vg perf slow`: expect `Vanguard's slowest handlers since login...` and up to ten lines such as `1. event PLAYER_LOGIN  longest N ms, ...`; paste them into the report, they say what to make faster.
- If it fails, paste: both result lines of each run, what you did during the minute, and `/vg errors`.

## 2. Options window and wizard

### 1.5a Frame rate check

- Do: out of combat, where you usually play, type `/vg graphics` and wait five seconds. Open Options → Graphics and note which Graphics Quality is marked Recommended. Then do it once in a city. Then start it and pull a mob before it ends.
- Expect: `Checking this computer and your frame rate for 5 s: ...`, then four lines: `Frame rate: N fps on average over 5 s.`, `Graphics card: <your card> (dedicated)` (or `(built-in, low power)` on a laptop chip) `. Graphics Quality Q of 10 (the game recommends R for this computer), render scale S%.` (Q is the number on Options → Graphics → Graphics Quality; R is the one the game marks Recommended there), a suggestion (`Suggested: lower Graphics Quality to ...`, `Suggested: Graphics Quality ... this computer has room for it.` or `Your Graphics Quality suits this computer and screen.`) and `Screen W x H: setup suggests the 1440p sizes (UI scale 70%); ...` for your screen; on a 4K screen under 30 fps a fifth line suggests Render Scale 80%. A last line names `/vg graphics apply` and `/vg graphics undo`. Nothing in the game's settings changes. In combat the readings stop, so a check ended in a fight reports only the seconds before it.
- If it fails, paste: the lines it printed, your screen size and what the Graphics Quality slider shows.
### 1.5b Apply and undo the graphics suggestion

- Do: after 1.5a, note Options → Graphics (Graphics Quality, Shadow Quality, View Distance, Render Scale) and the UI Scale. Type `/vg graphics apply`, then open Options → Graphics again. Play a minute. Then type `/vg graphics undo` and open Options → Graphics once more. Try `/vg graphics apply` in combat too.
- Expect: apply prints `Set Graphics Quality N, ... your screen's sizes.` (with Render Scale 80% after the 4K tip), and the setup profile backup line when it changed Vanguard's sizes. Options → Graphics shows the new Graphics Quality and its detail settings match what moving the slider to N gives; the UI is resized for your screen. No error, no "blocked" message, no taint warning. Undo puts every one of those settings and the UI Scale back. In combat apply says it waits for the end of the fight and changes nothing.
- If it fails, paste: the lines apply and undo printed, which setting did not change or did not come back, and the `/vg errors` report.

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

### 2.1e Situations: Your situations

- Do: on the Situations page, record an override for Party (Record for: Party, move one frame, Stop recording and save) and one for the situation you're in. Look at **Your situations**, then click **Clear Party**, then clear the other one.
- Expect: the card lists each situation with what its override changes, "(now)" on the one you're in; Clear Party removes that row and says `Cleared the overrides for Party.`; with both gone the card reads "No overrides yet. Pick Record for to make one." While frames are unlocked the Clear buttons are greyed. [Needs in game.]
- If it fails, paste: a screenshot of the page and `/vg errors`.

### 2.1b Windows are opaque

- Do: stand where the world behind is bright (snow, sky, a lit city). Type `/vg` and open Situations and Talents (short pages); then open a merchant, your character pane and the quest log (L).
- Expect: no world shows through any of these windows, including the empty space under a short options page. Tooltips and menus may still be very slightly see-through (that is the theme's panel opacity, not a window).
- If it fails, paste: a screenshot of the window over the bright ground and `/vg errors`.

### 2.1f The options window's height, search and changed dots

- Do: type `/vg`. Note how tall the window is. Change Text size, then point at the small accent reset arrow by its caption. Type "move frames", then "square", then "a" in the search box. On the Modules page, find Vanguard meter. Then run `/vg setup`, change the UI scale on its Screen step, and open `/vg` again.
- Expect: the window is about three quarters of your screen tall (at least as tall as before). The dot's tooltip has a second line, "Default: 100%" or the like. "move frames" lists Move frames, and clicking that line only marks the button (frames do not unlock). "square" lists Corners. "a" lists eight and ends with "N more: type more words". Vanguard meter says "On, but its own switch is off (Combat tools)" beside its name until you switch the meter on under Combat tools. After the UI scale change the window is still tall and fits the screen.
- If it fails, paste: a screenshot of the window, your screen resolution and UI scale, and `/vg errors`.

### 2.1f2 The options list's long page names and Text size changes

- Do: in a non-English client (Italian, Spanish, Portuguese or Russian) type `/vg` and look at the list of pages on the left, changing a setting on a page with a long name (Combat tools, Town and gear) so its dot shows. Then open Modules, Unit frames and Combat tools, set Text size to 130% under General, and open those pages again.
- Expect: each page name ends before the page's dot and the list's edge (a name too long is cut short), never over them. After the Text size change, each page you reopen is laid out for the new size: a module's description sits wholly inside its row, a "reload" tag sits after its caption without touching it, and a switch with a wrapped caption has the switch centred on the caption. [Needs in-game check: how far a real translation runs depends on the font's real widths.]
- If it fails, paste: a screenshot of the list and the page, the client language, and `/vg errors`.

### 2.1g The addons button's tooltip and the AddOns list heading

- Do: point at the addons button by the minimap without clicking. Then open the game's AddOns list from the character select screen or the game menu.
- Expect: the tooltip reads "Vanguard" and the version, then "Left-click: options · Right-click: move frames (out of combat)", and a red line with the count when errors were caught this session; it goes when the mouse leaves. In the AddOns list Vanguard sits under a "UI Overhaul" heading. If the client shows no headings there, nothing else changes (note it, and the line is dropped after launch).
- If it fails, paste: a screenshot of the tooltip or the AddOns list, and `/vg errors`.

### 2.1c Options and questions let go of the mouse and keyboard when they close

- Do: `/vg`, press and hold the mouse on any slider's track, and while holding press Escape; open the window again and move the mouse over the track without clicking. Then click a key button (Click casting, or a bar button's key), and while it says "Press a key..." close the window with Escape; reopen it and press a movement key. Finally start a fight, and during it open a question (`/vg` > Profiles > Reset profile; answer No afterwards) and try to move and use your action bar keys; end the fight.
- Expect: the slider does not follow the mouse or change its value after the window closes; the key button shows its normal caption again and the movement key moves you instead of binding; during the fight the question shows but your movement and action bar keys still work, and after the fight, with a question up, Enter presses its confirm button again. `/vg errors` is empty. [Needs in-game check: whether the client delivers the mouse-up to a slider hidden mid-drag, and that a question opened in combat passes keys on.]
- If it fails, paste: which control, what it did, and `/vg errors`.

### 2.1d Escape closes Vanguard's panels

- Do: with the meter on, click a meter line so its spell panel opens, then press Escape. Type `/vg prep`, press Escape. Open `/vg`, press Escape. Open the quest log (L) and the group board, press Escape once. Start a fight, click a meter line, press Escape, then press Escape again and use a movement key and an action bar key; end the fight. Finally open a mailbox and the Find mail panel, press Escape.
- Expect: each press closes the panel that is open (the spell panel, the Instance prep card, the options window; one press closes the quest log and the group board together, like the game's windows). In the fight the first Escape closes the spell panel, the second does what Escape does with nothing open (the game's own), and movement and the action bar keep working. The bars, unit frames, meter, trackers and strips stay up. The mailbox and its Find mail panel close together. `/vg errors` is empty. [Needs in-game check: all of it.]
- If it fails, paste: which panel stayed open (or what key stopped working) and `/vg errors`.

### 2.2 The wizard, start to finish

- Do: drag a frame with `/vg unlock`, then open `/vg` → General → **Run setup**. Click Next three times, then Done.
- Expect: `Step 1 of 4 · Layout` with six choices (Centered: damage, Centered: tanking, Centered: healing, Versus deck, Like the game's, Keep my current layout), Keep picked; the choices rest flat on the panel, each lifts only under the mouse, and the picked one alone carries the thin accent rail on its left over a lighter fill (its text stays the plain colour), the same on the Profile and Screen steps [Needs in game]; the frame you dragged stays where it is at the end. Next goes to `Step 2 of 4 · Screen`, with a choice per screen size (1080p, 1440p, 4K, Ultrawide), the one for your screen marked `your screen`, `Pixel-perfect (sharpest)` and `Keep my current sizes` (picked); under them the hint names who sets your UI scale now (`the game's UI Scale slider` or `Vanguard's pixel-perfect scale`), in full and inside the window, and clicking a preset shows a two-line hint that it moves the game's UI Scale slider; Next goes to `Step 3 of 4 · Look` (the accent swatches, the raid frame style and the Calm HUD switch, off); Next goes to `Step 4 of 4 · Move things` with every frame's handle showing; the button then says Done, and Done hides the handles and the wizard and offers `Setup is done. Reload the UI now to apply it?`. No profile backup is mentioned in chat, since nothing changed. Escape and the close button close it too. After `/reload` the wizard does not come back by itself.
- Also on the Look step: under Calm HUD, switches **Larger text (115%)** and **Colour vision: Safer colours**, both off and inside the window. Larger text makes the wizard's own text bigger at once and Off puts it back; Safer colours moves hostile and friendly bars apart after the reload. Each first change says where the backup profile went.
- If it fails, paste: the step id, the caption you saw, and `/vg errors`.

### 2.2a The role layouts look different

- Do: target a mob or another player and keep it targeted. Run `/vg setup`, pick **Centered: damage**, click through to Done and look at the target frame; then the same with **Centered: tanking** and **Centered: healing**. For Healing, also type `/vg preview party`, look, then `/vg preview off`.
- Expect: Damage: the target frame is a little taller than your player frame. Tanking: it is taller still, and nothing above it (its buffs, the target cast bar) overlaps. Healing: your frame and your target's are the same height and a little smaller than before, and the party preview's tiles are larger than with Damage.
- If it fails, paste: a screenshot of the bottom centre for each and `/vg errors`.

### 2.3 The healing layout

- Do: type `/vg setup`, pick Centered: healing, click Next once, then close the wizard. Open `/vg` and look at Click casting.
- Expect: chat says `Profile <name> as it was before setup is saved as profile <name> backup.`, and `/vg` → Profiles lists that backup. The raid frames sit centred above the cast bar, growing upward; click casting is on. Under Raid frames, Sort by role, Power bar, Show your HoTs and Incoming heals are ticked and Debuff icons is 3; under Nameplates, Threat colors is off and Your debuffs shown is 2. Picking Centered: damage and tanking instead unticks Sort by role, Power bar, Show your HoTs and Incoming heals, sets Debuff icons to 2, and turns threat colours on with 6 debuffs. Closing the wizard offers a reload (`Setup turned on a module that was off.` if Raid frames or Click casting were off before, else `The layout's raid frame, raid aura and nameplate settings show after a reload.`).
- If it fails, paste: a screenshot and `/vg errors`.

## 3. Unlock, dragging and Edit Mode

### 3.1 Unlock

- Do: type `/vg unlock`, then `/vg frames`.
- Expect: the chat line `Unlocked: drag the handles. /vg lock when done.`, labelled handles on the Vanguard frames, and `/vg frames` listing keys such as `minimap`, `infostrip`, `menustrip`, `bagstrip`, `raid` and `questtracker`.
- If it fails, paste: the chat output and a screenshot.

### 3.1b A selected handle's numbers

- Do: type `/vg unlock`, then click the XP bar's handle (a thin one), a taller handle (the minimap's), and the vehicle exit's handle if it shows.
- Expect: the selected thin handle shows its name and point and offsets on one line, inside itself; the taller one shows them on two lines; the vehicle exit's (40 wide) shows its name only. Nothing spills out of a handle. [Needs in-game check: the text's size against the handle.]
- If it fails, paste: a screenshot of each handle.

### 3.2 Drag two frames and keep them

- Do: drag the Minimap and Info strip handles somewhere new, type `/vg lock`, then `/reload`.
- Expect: `Locked.` and, after the reload, both frames where you left them.
- If it fails, paste: which frame moved back and `/vg errors`.

### 3.2a A window closed while you drag it

- Do: out of combat, open the merchant (or your character pane), start dragging it by its title bar, and without letting go press Escape (or walk out of range). Let go, open it again, drag it somewhere else, then close it and open it again.
- Expect: the window is gone while you drag, nothing sticks to the mouse, and the next time it opens it is where it was let go; after the second drag it comes back at the new spot every time, also after another window opens and shuffles the panels. `/vg errors` is empty. [Needs in-game check: whether the client sends the drag's end to a drag area that is hidden mid-drag; Vanguard now ends the drag itself when the window hides.]
- If it fails, paste: which window, where it came back, and `/vg errors`.

### 3.2c A dragged window at the screen's edge

- Do: out of combat, open the merchant (or the mailbox, with its Inbox and Send Mail tabs under it) and drag it by its title bar as far down and to the left as it goes. Then open the combined bag and drag it to each edge too.
- Expect: the window stops about 12 units short of the left, right and top edges, so its panel border shows whole, and about 44 units short of the bottom edge, so the page tabs under it stay in view; the combined bag still opens at its spot and nothing in `/vg errors`. [Needs in-game check: that the sign of the clamp insets keeps the window inside, and that no listed window (the combined bag especially) sets insets of its own that this replaces.]
- If it fails, paste: which window, which edge, and where its edge ended.

### 3.2b Move frames from the options, and back

- Do: `/vg` → General → **Move frames**. Read the bar at the top, move a frame, click **Save and lock**. Again **Move frames**, then **Exit without saving**. Again **Move frames**, then `/vg lock`.
- Expect: the bar's note reads in full ("Drag to move · right-click for anchor, scale, opacity · arrows nudge (Shift ×10)") with nothing over the buttons at your resolution (on a 4:3 or 5:4 screen, or at 130% text, the note wraps onto a second line and the bar stays on screen); Save and lock and Exit without saving each lock and open `/vg` again on General; `/vg lock` just locks. [Needs in game: the bar's width at your resolution.]
- If it fails, paste: a screenshot of the bar and `/vg errors`.

### 3.3 Combat while unlocked

- Do: type `/vg unlock`, then start a fight with a mob. During the fight type `/vg unlock` again, and after it ends once more, then type `/vg lock` so the frames are locked again.
- Expect: `Locked for combat. /vg unlock again afterwards.` and the handles gone when the fight starts; during the fight `/vg unlock` prints `In combat. Try again once combat ends.`; after the fight `/vg unlock` works again.
- If it fails, paste: the chat lines and `/vg errors`.

### 3.4 Edit Mode

- Do: make sure the frames are locked (`/vg lock`), press Escape, click Edit Mode, look, close Edit Mode. (If `/vg unlock` had the handles up already, closing Edit Mode leaves them up; that is intended.)
- Expect: Vanguard's labelled handles appear too, with a note under the Edit Mode window reading `The labeled handles are Vanguard's frames: drag them here too (right-click one for more).` Edit Mode's window and its settings dialog stay on top of every handle (the quest dialog's too: try the layout dropdown over it): drag the window over a handle and it covers the handle, never the other way round. On closing, the handles hide and the Blizzard frames Vanguard pins (minimap, strips, tracker) return to their Vanguard spots. With Text size at 130% (`/vg` → General) the note under the window still shows both lines of its text. [Needs in-game check: the note's height against the client's line height.]
- If it fails, paste: a screenshot while Edit Mode is open and `/vg errors`.

### 3.5 Reset

- Do: type `/vg reset all`.
- Expect: `Reset N frame(s).` with N above zero, and the frames back at their default spots. Then `/vg unlock` and look: handles of frames that can show together don't overlap at the defaults (known exceptions: the quest log and quest dialog windows, the raid frames' full footprint, the two thin data bars, and the Instance prep card once it has shown a list, since its handle keeps that height). Action bars 1, 2 and 3 touch with no gap between the rows, and still touch after you scale one of them down from its handle (right-click it): the bars above it come down onto it; the quest arrow, flight timer, chat alert and the big boss timers stack down the top centre; the talking head sits at the top left under the raid tools and main tanks; group threat under the boss frames; the boat timer on the flight timer's spot (they never show together); at the bottom right the fight history, damage meter and tooltip stack clear of each other under the quest tracker; loss of control under the Instance prep card above your character.
- If it fails, paste: the chat line.

### 3.6 Anchor the cast bar under the player frame

- Do: type `/vg unlock`, right-click the Player cast bar handle, set **Anchor to** to Player and **Side** to Bottom, type `-4` in Y offset and press Enter, click **Save and lock** on the bar at the top. Change spec (if your character has one), `/reload`, then turn Unit frames off under `/vg` → Modules, `/reload`, turn them on again and `/reload`.
- Expect: the popover title reads `Player cast bar  ·  Below Player`, the cast bar sits 4 px under the player frame's bottom edge and stays there after the spec change and the reload; with Unit frames off it stays where it was (on screen), and with them on again it is under the player frame. No error.
- If it fails, paste: a screenshot of each step that went wrong and `/vg errors`.

### 3.6b The anchored cast bar after a UI scale change

- Do: with the cast bar still anchored to the player frame (3.6), change the game's UI scale slider (or turn **Pixel-perfect** on under `/vg` → General).
- Expect: the cast bar stays against the player frame's bottom edge (it used to stay at its old screen spot). [Needs in-game check: the client moving the player frame when the canvas changes.]
- If it fails, paste: a screenshot of the cast bar and the player frame, and `/vg errors`.

### 3.6c The popover's refusal line at a large text size

- Do: at 130% text, `/vg unlock`, right-click the Player frame's handle and set its **Anchor to** to the Player cast bar (still anchored to the player frame, so the popover refuses the circle).
- Expect: the red line saying it would go round in a circle sits clear of the Reset and Done buttons, the popover having grown taller to hold it. [Needs in-game check: the line's height against the client's font.]
- If it fails, paste: a screenshot of the popover.

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

### 4.2a A position that is not a sane number

- Do: type `/run VanguardDB.profiles.Default.positions.uf_player.x = math.huge`, then `/reload`. (A profile string holding `1e999` is refused on import with an "Import failed" line.)
- Expect: the player frame loads at most 5000 units from its anchor, with no error popup and nothing in `/vg errors`; `/vg reset` puts it back.
- If it fails, paste: `/vg errors`.

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

### 4.8a Sure? doesn't wait for later

- Do: `/vg` → Profiles, click **Delete** once on a spare profile's row (it says `Sure?`), close the window, open it again on Profiles.
- Expect: the button reads `Delete` again; one click only asks `Sure?` again and deletes nothing, and a second click deletes the profile.
- If it fails, paste: a screenshot of the row and `/vg errors`.

## 5. Pixel borders

### 5.1 Border width at 1440p

- Do: set the game to 2560x1440 and UI scale 1.0 (the game's UI Scale setting, usually under Options, System, Advanced; confirm the path in your client). Take a screenshot of the player frame's edge and zoom in. Type `/vg status`.
- Expect: the border exactly 1 screen pixel wide, and `UI scale 1.00` in the status text line. [After P0.4. Before it the border is 2 px at 1440p, because the old size was one UI unit rounded to whole pixels.]
- If it fails, paste: the zoomed crop, your resolution, and the `UI scale` line.

### 5.2 Pixel-perfect preset

- Do: `/vg setup`, Next, pick **Pixel-perfect (sharpest)**, then finish. Screenshot the action bars, the player frame and the `/vg` window's close button, and zoom in. Then drag a frame's scale slider in unlock mode to 150% and screenshot it again.
- Expect: the hint under the choices starts `Sharpest: every line on whole screen pixels.` Every border, button edge and gap between action buttons is a whole number of screen pixels, with no blurred or doubled line; the close button's cross sits centred on its button with no tile behind it at rest; under the mouse a grey tile with round corners and a thin light line appears behind it and the cross turns vermilion (maximize and minimize get the same grey tile, their glyph brighter); held down, the tile goes darker and the glyph drops one pixel. On a 4K screen each UI unit is two pixels. After the scale change, borders are still sharp.
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
- Expect: on the calendar the Filters button ends a small gap left of the close button, level with it, not touching it. The character pane's arrow (beside its close button) and the group finder's gear have no tile at rest and light up under the mouse with the same round-cornered grey tile as the close button, their icons inside it.
- If it fails, paste: a zoomed screenshot of the window's top-right corner and `/vg errors`.

### 5.4 Safer colours and state glyphs

- Do: target a hostile mob, then a neutral one, then a friendly NPC. Tick Safer colours under `/vg` → General → Look and reload, then target the same three. On a hunter, look at the pet frame's top-right corner.
- Expect: before, red, yellow and green health bars; after, vermilion, yellow and blue. The pet's mood is a check (happy), a triangle (content) or a cross (unhappy), in green, amber or red.

- If it fails, paste: screenshots and `/vg errors`.

### 5.4a Safer colours and the colour-blind filters

- Do: turn on the game's own colour-blind mode (Options → Accessibility) and reload with Safer colours unticked; target a hostile, a neutral and a friendly unit; in a group look at debuffs of each type; then pick Protanopia, Deuteranopia and Tritanopia in the game's filter list and look again; finally untick "Follow the game's colour-blind mode" and reload. If the game has no such switch, or nothing follows it, note what Accessibility offers: the CVar name `colorblindMode` is unchecked on Forever.
- Expect: with the game's mode on, the bars are vermilion, yellow and blue and the Magic, Curse, Disease and Poison borders are blue, pink, amber and mint; under each filter the three bars and the four types can still be told apart; with the follow switch off the bars are red, yellow and green again.
- If it fails, paste: screenshots under each filter and `/vg errors`.

## 6. Party and raid

### 6.1 Party frames (if you can)

- Do: join a party. Then, under Raid frames, untick "Use them for your party too", `/reload`, and with the party look again; as leader, convert to a raid (the Raid button on the raid tools bar).
- Expect: party frames just above the player frame, growing upward, and the game's own party frames gone. With the switch off, Vanguard's separate party frames show in the party and hide once it is a raid, leaving only the raid frames (no tiles on top of each other); `/vg unlock` still shows the party frames' handle.
- If it fails, paste: a screenshot and `/vg errors`.

### 6.2 Raid frames (if you can)

- Do: as leader or assistant, press the Raid button on the raid tools bar (top left) to convert to a raid, then press Ready on the same bar. With the game's "Cast action keybinds on key down" setting on, click a world marker button on that bar, then right-click it.
- Expect: raid frames in groups, 100x48 tiles at 10 members or fewer and smaller above that; the ready check starts. The world marker is placed on the click and removed on the right-click. A debuff you can dispel shows its type's letter (M, C, D or P) and a small mark beside it (diamond, circle, square or triangle) in the icon's top-left corner, 12 units wide at the least, in combat in an instance too. With a Priest in the group, the Priest's bar is a light gray (not white) and its white name reads clearly on it, full health or hurt.
- If it fails, paste: a screenshot and `/vg errors`. In an instance during combat `/vg status` should say `aura values hidden right now` while the bars still fill; paste that line if the bars do not fill.

### 6.2a Raid indicators (if you can)

- Do: in a group, open `/vg` → Raid frames, set Right edge, top to "Your buffs" and Right edge, second to "Crowd control", reload, then buff a member and let a mob crowd-control another.
- Expect: a small icon of the buff on the right edge of that member's tile, under the missing-buff mark, and the crowd control's icon below it (or beside it on a short tile). Empty slots show nothing, and offline or dead members show none. Nothing errors in combat.
- If it fails, paste: a screenshot and `/vg errors`. A filter word the game rejects is reported once in `/vg errors` as `aura filter ...`.

### 6.2b Raid tiles in a fight: missing health, the tooltip, summons

- Do: open `/vg` → Raid frames and read the indicator captions and **Mark players being resurrected or summoned**. In a party, let a member lose some health, out of combat and then in a dungeon fight; let them heal to full. Point at a tile out of combat, then pull with the pointer on it. With a warlock, summon a member who is away, and have them accept once and decline once. Then turn **Incoming heals** off under Healing while a heal is on its way to a shielded member.
- Expect: the captions read "Right edge, top (reload)", "Right edge, second (reload)" and "Right edge, third (reload)" with a note above them, and the choices start with a capital. The missing health reads like "-1234" both out of and in combat, and is blank at full health. The tooltip shows the player out of combat and goes on the pull; in the fight none shows. The summon icon shows on the tile while the summon is pending and changes when they accept or decline. The shield starts at the health edge once the heal bar is off. `/vg errors` stays empty. [Needs in-game check: all of it.]
- If it fails, paste: a screenshot of the tile, `/vg errors`, and whether you were in an instance.

### 6.3 Main tank tiles (if you can)

- Do: in a raid, mark a main tank.
- Expect: a small tile for that player at the top left, beside the raid tools, with health in their class colour.
- If it fails, paste: a screenshot and `/vg errors`.

### 6.4 Preview the party and raid frames alone

- Do: on a profile whose frames you haven't moved (for example a new one from `/vg` → Profiles), out of a group and out of combat, type `/vg preview party`, then `/vg preview 25` and `/vg preview 40`. Open `/vg` → Raid frames, change Width, Height, Style, Sort by role and Groups as, then pick Off under Preview. Turn it on again and attack a training dummy.
- Expect: five sample tiles in a column just above your player frame, centered on it (one Dead, one Offline, a shield and a cross before the tanks' and healers' names), then 10 the same, with two groups side by side; 25 and 40 drawn smaller, at the left of your character with their groups stacked as rows (five across, one group above the next), clear of your pet, focus and player frames and, on a 1366 x 768 screen at UI scale 1, of the roll tracker at the left edge (roll a few times to see it); **Stack big raids at the left** off puts them back over your player frame in columns; each settings change shows on the preview at once. Off hides it, and combat hides it with a chat line. Your real frames don't change until a reload.
- If it fails, paste: a screenshot, `/vg errors` and `/vg frame Vanguard_RaidPreview`.

### 6.5 Raid readiness on the ready-check card (batch 2)

- Do: `/vg` → Town and gear → Instance prep, switch on "Buff checks on the card" (and "World buffs among them"). Out of combat, without a flask, food buff, weapon oil or poison, or your class's raid buffs, type `/vg prep`. Then get each one and type `/vg prep` again; then start a ready check in a group, type `/vg prep buffs` (with a flask, a food buff and a raid buff on, and one unrelated buff), and finally type `/vg errors`.
- Expect: the card lists Flask, Food buff, Fortitude, Mark of the Wild, Arcane Intellect, a weapon row and (with a weapon in the off hand) an off-hand row, each "missing" in red; each row goes when you have the buff. World buffs shows only while you have none. In an instance during combat no buff row appears; `/vg status` saying `aura values hidden right now` also means none. `/vg prep buffs` prints each of your buffs as `name -> Flask` (or Food buff, Fortitude, ...) or `-> no check`, then the names each check looks for, as your client names them; note any buff that should count and says `no check`, and any check whose list looks wrong: those are spell ids to fix. No Lua error.
- If it fails, paste: a screenshot, `/vg errors`, the `/vg prep buffs` lines, and the names of the buffs you have (the spell ids in the code are from the classic database and unchecked on Forever).
### 6.5b Wanted amounts window

- Do: `/vg` → Town and gear → Instance prep → **Set wanted amounts...** (or `/vg prep setup`), out of combat. On step 1 drag the food slider, click **Use suggested**, then Next through to Done. Try `/vg prep want potions 7` afterwards, and `/vg prep`.
- Expect: step 1 has Food & drink, Bandages and Potions sliders; hunters and warlocks get a second step with Ammo or Soul shards; the last step lists your amounts and whether anything is short; Esc, the close button and Done close it; the step caption is small grey type under the title; the amounts take effect at once, and `/vg prep` shows rows against them. No Lua error.
- If it fails, paste: a screenshot and `/vg errors`.

### 6.5c The door card once per visit, a /reload inside included

- Do: with something short (no bandages, say), walk into a dungeon and let the card fade. Type `/reload` inside. Then leave and walk back in.
- Expect: the card shows at the first entry, not after the `/reload`, and again after you leave and walk back in. [Needs in game: that PLAYER_ENTERING_WORLD on Forever reports a `/reload` as one (its second argument true).]
- If it fails, paste: whether it showed after the reload and `/vg errors`.

### 6.6 Group threat panel (batch 2)

- Do: `/vg` → Unit frames, switch on "Group threat panel" and `/reload`. In a party with a tank, target a hostile mob out of combat, then pull it. In the open world, then a dungeon, then on a boss, watch the panel; at the same moment type `/run print(C_Secrets.ShouldUnitThreatValuesBeSecret("player", "target"))` and `/vg errors` (this is the threat test of issue #223).
- Expect: the panel lists the group by threat on your target, highest first, with the tank at the top; it hides when you drop the target or leave the group. If the game prints `true` (threat hidden), the panel must be hidden during the fight, and there must be no Lua error either way. `/vg unlock` lets you move it.
- If it fails, paste: a screenshot, the printed line, which place you were in (world, dungeon, boss), and `/vg errors`.

## 7. Combat visuals: auras, cast bars, nameplates

### 7.1 Target and focus auras

- Do: target a mob that has a buff, put a damage-over-time debuff on it, then type `/focus` with it targeted.
- Expect: debuffs under the target and focus frames, buffs above them, wrapping at the frame width, with timers off by default.
- If it fails, paste: a screenshot, `/vg status` and `/vg errors`. [After P0.3 and P0.12: a rejected aura filter word is listed in `/vg errors`.]

### 7.1a Weapon enchant sweeps when one runs out

- Do: as a rogue or shaman, put a poison or imbue (or a sharpening stone or oil) on both weapons, the main hand's a few minutes before the off hand's. Watch the two enchant cells left of your buffs as the main hand's runs out.
- Expect: when the main hand's enchant ends, the off hand's cell moves into the first place and its dark sweep keeps the share of time it showed before (it does not jump back to full). Putting an enchant on again starts its sweep full. `/vg errors` stays empty.
- If it fails, paste: a screenshot before and after the main hand's enchant ends.

### 7.2 Cast bars

- Do: cast a spell with a long cast time, and have a mob cast at you.
- Expect: your cast bar between the player and target frames with a spark and the seconds left, and a latency segment at the end of your own cast; a gray edge on a cast that cannot be interrupted. Then in `/vg` → Action bars set bar 1 to 6 buttons per row (or turn on bar 6) and cast again: the cast bar now sits just above the taller bar stack, fully visible, never under the buttons.
- If it fails, paste: a screenshot during a cast and `/vg errors`.

### 7.2a Calm HUD

- Do: `/vg` → Unit frames, switch on **Calm HUD**. Stand in town with no target, then hover your player frame, then target a hostile mob, then pull it and kill it. Click your dimmed player frame and right-click it.
- Expect: with no fight and no hostile target your player, pet, target of target and focus frames are faint (about a third); under the mouse the hovered frame is at full strength at once; targeting a living hostile mob or entering combat brings them all up at once and they stay up through the fight; after the fight with no hostile target they go faint again. A friendly target's frame stays faint. Clicking a faint frame still targets, right-clicking opens the menu. Switching Calm HUD off brings every frame back to full at once. No error.
- If it fails, paste: a screenshot and `/vg errors`.

### 7.2b Versus deck

- Do: `/vg` → Unit frames, switch on **Versus deck**. Target a mob, cast something, then switch Calm HUD on and stand out of combat. Then run `/vg setup`, pick **Versus deck**, and click through to Done.
- Expect: one dark panel with rounded corners and an accent-coloured border runs from your player frame's left end to your target frame's right end, behind the cast bar, swing timer and cooldown icons between them (all still visible over it); the Vanguard crest sits centred on the panel's top edge; your target's health and power bars fill from the right. The player and target frames have rounded corners too, with no bar colour showing past the curve (no cut corners anywhere on the deck); switching the deck off gives them their cut shield corners back. With Calm HUD on, the panel dims with the frames. Switching it off removes the panel and the target's bars fill from the left again, at once. In setup, Versus deck turns it on with your role's layout (a healer gets the healing layout and click casting); picking another layout turns it off. No error.
- If it fails, paste: a screenshot of the bottom centre and `/vg errors`.

### 7.2b1 Pet cast bar

- Do: as a warlock with the Imp out (or any pet that casts), let it cast Firebolt at a mob. Dismiss the pet and summon another. Then `/vg unlock` and look for the pet cast bar's handle.
- Expect: a small cast bar just left of the pet frame (between the combo points' spot and the focus's debuffs) fills with each of the pet's casts, with the spell's name and icon and no interrupt diamond, and goes when the cast ends or the pet goes; in unlock mode it has its own handle, "Pet cast bar". No error.
- If it fails, paste: a screenshot during a pet cast and `/vg errors`.

### 7.2c Cursor ring

- Do: `/vg` → Unit frames, tick **Ring at the cursor: the global cooldown and your cast** (nothing needs a reload). Move the mouse around, then cast an instant spell, then a spell with a long cast time, then a channel, and click and hover things under the ring (a button, a unit frame, a world object). Untick the switch.
- Expect: two thin rings with a faint full circle behind them centred on the mouse pointer at every UI scale, following it without lag; the outer ring sweeps away for the length of the global cooldown after the instant spell; the inner ring fills as the long cast goes and empties for the channel, and clears when the cast ends or is interrupted; the sweeps have no numbers, no edge line and no flash; the ring does not stop clicks or tooltips, also in combat; with the switch off it is gone and the pointer is plain. [Needs in-game check: that the global cooldown shows on the outer ring on WoW Forever, and which way each sweep turns.]
- If it fails, paste: a screenshot with the ring in view, `/vg status` and `/vg errors`.

### 7.2d Interrupt mark

- Do: on a class with an interrupt (Rogue Kick, Warrior Pummel or Shield Bash, Mage Counterspell, Shaman Earth Shock, Priest Silence), target a mob that casts and watch the target cast bar. Cast on a mob that can't be interrupted if you can find one, press your interrupt on a cast, then watch the next cast while the interrupt recovers. Do the same with `/focus`. In `/vg` → Unit frames untick **Interrupt mark beside the target and focus cast bars**.
- Expect: a small diamond to the right of the target's bar and the focus's bar during a cast you can interrupt: filled and bright (accent) while your interrupt is ready, hollow and dim (darkened like a cooldown sweep that clears clockwise) while it recovers, ignoring the global cooldown; no mark on a cast with the gray edge, on your own bar, when you know no interrupt, or when the switch is off (gone from a cast on screen at once); it goes with the bar when the cast ends. [Needs in-game check: the spell IDs per class on WoW Forever, that the global cooldown is left out, and which way the sweep turns.]
- If it fails, paste: a screenshot of the bar during a cast, your class and spec, `/vg status` and `/vg errors`.

### 7.2e Low-health vignette

- Do: `/vg` → Combat tools, switch on **Low health: a soft tint round the screen edge**. At full health look at the screen edge, then let a mob (or a fall) take you under half health, then under a fifth, then heal up. Also try it with Reduce motion on, and die once.
- Expect: at full health nothing shows; under half health a soft vermilion tint appears round the edge and grows stronger as health drops, with no pulse and no flicker, in a fight too (including an instance fight, where health is hidden); healing clears it; while dead or a ghost it is gone; it never blocks a click. Switching it off clears it at once. No error.
- If it fails, paste: a screenshot and `/vg errors`.

### 7.2f Status chip (off until switched on: /vg > Unit frames > Readouts)

- Do: tick **Status chip beside your frame** under Unit frames, reload. Out of combat eat some food, then drink, then eat a food that gives Well Fed; wait until each buff ends. Then tick Instance prep's buff checks (`/vg` > Town and gear) and look at the chip with no flask or raid buffs. Start a fight with the chip showing.
- Expect: left of the player frame, level with it (in the Like the game's layout, or on a screen with no room left of the frame, just above the frame's left end instead, clear of its level and name), a small panel with the buff's own icon and Eating, Drinking or Well Fed while that buff is on you (Well Fed in the good color), going when the buff does; with the buff checks on and nothing of those, a warning triangle and Missing: and the first missing buff and how many more, in the warning color, matching `/vg prep`'s buff rows. It is gone the moment a fight starts and back after it, and gone while you are dead. If the buff names are wrong for this client (the chip stays hidden while you eat), paste the aura names from `/dump C_UnitAuras.GetAuraDataByIndex("player", 1, "HELPFUL")`. No error.
- If it fails, paste: a screenshot and `/vg errors`.

### 7.2g Energy spark stops when no tick comes

- Do: on a rogue or a cat-form druid with the spark on (`/vg` > Unit frames), stand still at full energy for ten seconds, then spend some energy and watch the spark.
- Expect: at full energy the spark is gone after about six seconds and stays gone (no spark crossing a bar that is not regenerating); after you spend energy the next tick starts it again and it crosses the power bar every two seconds. [Needs in-game check: that energy ticks keep it going, and whether abilities that give energy nudge its timing (not changed here).]
- If it fails, paste: the class, form and what the spark did.

### 7.2h Right-click destroys a totem

- Do: on a shaman with Vanguard's unit frames on, type `/dump GetCVar("ActionButtonUseKeyDown")` (it should print 1, the game's "Cast action keybinds on key down"). Drop two totems, then right-click one of the cells under the player frame. Do it once more in a fight.
- Expect: the totem you right-clicked is destroyed on the release of the button and its cell clears; the other stays. A left-click does nothing. No error, in combat too. [Needs in-game check: the key-down phase rule was read from the game's SecureTemplates.lua and modelled in the harness, not watched in game.]
- If it fails, paste: what the CVar printed, what happened to the totem and `/vg errors`.

### 7.2i Unit frames act like the game's: tooltips, tapped grey, Ghost, raid marks, quiet threat

- Do: hover your player, target, target of target, focus and pet frames (a hunter's pet too), then hover the target and a boss frame during a dungeon boss fight. Target a mob another player has tagged. Die, release, and look at your frame (or a released party member's). Put a raid mark on your target (and on a party member). Fight a mob solo with no pet, then with a pet or in a group.
- Expect: each frame shows its unit's tooltip where your tooltips usually sit, and it goes when the mouse leaves; a hunter's pet tooltip adds a line like "Happy: 125% damage" in the mood's colour; in a fight too, unless **Hide unit tooltips in combat** (Tooltips) is on, and `/vg errors` stays empty. The tagged mob's health bar is grey, as on the game's frames and Vanguard's plates. A released player reads Ghost (red on raid tiles too), a feigning hunter in your group does not read Dead. The mark sits centred on the top edge of every frame whose unit carries it, comes and goes at once, and **Raid target icons** (Raid frames page) turns them off. Solo with no pet the threat number above the target frame stays away; with a pet or in a group it shows.
- If it fails, paste: a screenshot of the frame, `/vg errors`, and `/run local i=GetRaidTargetIndex("target") print(type(i), issecretvalue(i))` on a marked mob.

### 7.2j Swing timer dims out of reach, and auto for every class that swings

- Do: on a warrior or rogue with Vanguard's swing timer on, auto-attack a mob, then step out of melee range and back in, swap weapons out of range, and target nothing. Then on a paladin, shaman or druid (Swing timer left on auto), stand idle, then auto-attack a mob.
- Expect: while the target is out of melee range the swinging rows dim (to about 40%) and come back at full strength when you step in, also right after the weapon swap; with no target they are never dim. The paladin, shaman or druid sees no rows at rest and the rows while swinging. `/vg errors` stays empty.
- If it fails, paste: a screenshot in and out of range, your class, and `/vg errors`.

### 7.3 Nameplates in a pull

- Do: pull three or more mobs.
- Expect: plates coloured by reaction and threat with the level shown, your debuffs on them, and your target's plate with an accent border and diamond. A plate first drawn during the fight uses Vanguard's own icons and switches to the client's after the fight.
- If it fails, paste: a screenshot taken during the pull and `/vg errors`.

### 7.3a Quest marks on nameplates

- Do: take a quest that wants kills or items from mobs (for example "Kill 8 Wolves"), stand where those mobs are with enemy nameplates on, and look at their plates. Kill one, finish the quest's count, then abandon the quest. Target one of the mobs and type `/vg guide probe`.
- Expect: a small gold `!` right of the name on the plates of mobs the quest needs, and none on other mobs; it follows the count (within a moment of a kill's progress) and goes when the quest is done or abandoned. The probe's `C_TooltipInfo.GetUnit` line reads `present, tooltip data, N lines` with a target, `not called (no target)` without. Under `/vg` → Nameplates, "A gold ! by units your quests need" off hides the marks at once. [Needs in game: whether Forever returns quest title and objective lines in the unit's tooltip data (`C_TooltipInfo.GetUnit`) on nameplate units, in and out of combat, and whether a finished objective still carries its line (the mark would stay until the quest is handed in); the game's own `C_QuestLog.UnitIsRelatedToActiveQuest` answer is used first when it says yes.]
- If it fails, paste: a screenshot with the mob's plate and its tooltip, the probe line, and `/vg errors`.

### 7.3b Your debuffs on a plate drawn mid-fight

- Do: in a dungeon, pull a big pack so that more than 40 plates have been drawn (or come back to a pull after a long run), and put your damage-over-time debuff on a mob whose plate appeared during the fight and that already carries another player's or the mob's own debuffs.
- Expect: your debuff shows on that plate (Vanguard's own icons) even when the game hides the debuffs before it, and `/vg errors` stays empty. [Needs in game: whether the client refuses a hidden aura's read one aura at a time (then later auras still show) or for the whole unit (then the plate shows none until the fight ends, as before).]
- If it fails, paste: a screenshot of the plate and `/vg errors`.

### 7.4 Nameplates in a crowd

- Do: in a capital city with friendly player plates on, stand where several players' plates overlap. Click the bar or name of four or five plates in turn, and move the mouse slowly across them. Then turn on the game's option to show only names on friendly players' plates and click one again. Find a player with a defensive cooldown up, or buff a friend yourself.
- Expect: each click targets the player whose bar or name you clicked (not a neighbour), and the name-only option doesn't stop the click. The plate under the mouse has a faint white wash that goes when the mouse leaves. A player's buffs show right of the bar, past the target diamond: their defensives, and on friends the buffs you cast. Mobs show none.
- If it fails, paste: a screenshot with the mouse over the plate you clicked, the name of who got targeted, and `/vg errors`.

### 7.5 Enemy nameplates (#377)

- Do: log in on a character, stand near a hostile creature and look for its plate. Type `/vg plates`. Open `/vg` > Nameplates, untick Enemy nameplates, then tick it again; do the same with Friendly players' and Friendly NPCs' nameplates. Press V, `/reload`, and check that the plates stay as V left them.
- Expect: hostile creatures in range have a Vanguard plate at the first login without pressing anything. `/vg plates` gives plates drawn, how many are attackable, and Enemy on. Each switch hides and shows that kind of plate, and the Enemy switch follows V. After the reload Vanguard does not turn enemy plates back on. [Needs in game: that nameplateShowEnemies, nameplateShowFriendlyPlayers and nameplateShowFriendlyNPCs are the Forever 16001 CVar names (nameplateShowFriends is not: GetCVar gives nil) and that the client keeps them after a reload.]
- If it fails, paste: the `/vg plates` line, a screenshot, and `/vg errors`.

### 7.5a Health numbers on enemy plates

- Do: stand near hostile mobs and a friendly NPC with plates on. Open the game's options → Nameplates → Info display and tick Current health percent; look at the plates. Tick Current health value too, then untick the percent. Open `/vg` → Nameplates and untick "Health value on enemy plates". Tick "Health percent on enemy plates" during a fight and watch the plates when it ends. Set Height to 8 on the same page and `/reload`.
- Expect: each box shows its number at the right end of every enemy plate's bar, small and outlined (the value left of the percent when both are on), following the mob's health as you hit it; the friendly NPC's plate shows none. Vanguard's two rows tick and untick with the game's boxes, and the game's boxes follow Vanguard's rows; a row ticked in a fight takes effect when it ends. At height 8 no numbers show. [Needs in game: that the percent reads right on a mob whose health the client hides (it formats the hidden number, which the harness can't), that `CVAR_UPDATE` fires when the game's box changes so the plates follow at once, and how the numbers fit a 10-high bar.]
- If it fails, paste: a screenshot of a plate and `/vg errors`.

### 7.6 Fight recap

- Do: under Combat tools tick "Recap in chat after each fight". Fight a mob for a few seconds (in a group, interrupt or dispel something if you can). Type `/vg recap`, then `/vg recap party` in a group. In the fight's first seconds type `/vg recap`. Then type `/run for _, k in ipairs({"Interrupts","Dispels","DamageTaken","Deaths","AvoidableDamageTaken"}) do print(k, Enum.DamageMeterType[k]) end` and paste what it prints.
- Expect: half a second after the fight a chat line "Fight recap: Interrupts 1  ·  Dispels 0 ..." with only the parts the meter had; the same for `/vg recap`; `/vg recap party` sends that one line to party chat; during the fight `/vg recap` says the meter is hidden until the fight is over. [Needs in game: that those Enum.DamageMeterType keys exist, that a session of each has combatSources with isLocalPlayer and totalAmount, that Deaths lists one line per member who died, and that SendChatMessage to party works from a slash command.]
- If it fails, paste: the `/run` line's output, the recap line and `/vg errors`.

### 7.6a Chain pull (fight history and recap)

- Do: with Fight history and the recap on, kill a mob and pull the next one at once (within half a second: a ranged pull or an add already on its way). After the second fight, hover the fight history strip and type `/vg fights`.
- Expect: both fights are listed, the first with its own length and DPS; a recap line for the first fight appears as the second begins. [Needs in game: that the game's meter has finished the first fight's figures when the next pull starts; if its DPS or length looks short, say so.]
- If it fails, paste: `/vg fights` and `/vg errors`.

### 7.6b The game's damage meter lines stay flat

- Do: with the game's damage meter shown (its own setting) and "Damage meter in the Vanguard look" on under Combat tools, fight two or three mobs one after another, then look at the meter's lines, and scroll its list if it has more lines than fit.
- Expect: every line is a flat theme bar over a dark inset after each fight, with no gradient or shaded background behind it, including lines that appear only after the first fight. [Needs in game: that the game's own background art never comes back on a line.]
- Also expect (header and breakdown): the meter's minimise button is a small Vanguard control showing two arrows pointing in; click it and the meter folds and the arrows point out (expand), then click it again. Log out with the meter folded and back in: it shows expand. The cog sits on a flat plate, the segment drop-down (Current) is flat, and the meter type keeps its text with a theme arrow. In a fight, click a line: the breakdown opens as a flat panel with flat lines, a thin scroll bar and the Vanguard cross, with no error. [Needs in game: that every click (minimise, cog, drop-downs, close) still works, and that nothing errors in combat.]
- If it fails, paste: a screenshot of the meter after the fight in which the shading came back, and `/vg errors`.

### 7.7 Vanguard meter (off until switched on: /vg > Combat tools > Vanguard meter)

- Do: type `/vg meter on` and fight a mob for a few seconds (in a group if you can); click the panel's title; type `/vg meter hps`, then `/vg meter dps`. Then type `/run for _, k in ipairs({"Dps","Hps"}) do print(k, Enum.DamageMeterType[k]) end` and paste what it prints.
- Expect: a flat panel at the bottom right, just left of the bags and menu bar, clear of the tooltip when you hover a player (move it with `/vg unlock`; turn the game's meter off in its settings to see only this one), "Damage per second", with up to eight bars in class colors, each with a number, a name and a figure, yours in the accent; the figures update during the fight and stay after it; the title switches to "Healing per second" and back. In an instance, if the game hides values, lines may be blank or "No damage yet this fight", never an error popup. [Needs in game: that the two Enum.DamageMeterType keys exist, that a session's combatSources lines carry name, classFilename, amountPerSecond and isLocalPlayer, that SetValue, SetMinMaxValues and SetText accept the hidden values in combat, that AbbreviateNumbers does too, and that the panel is wide and tall enough to read. `/vg errors` must stay empty.]
- If it fails, paste: the `/run` line's output, what the panel shows in combat and `/vg errors`.

### 7.7a Meter kinds, segments, spell panel and report

- Do: with the meter on after a fight with a group (or alone): click the meter's title several times, then right-click it; click your own line; click it again; click another line; click the spell panel's title; click the Report and Reset buttons on the meter's title row; after a fight look at the percentages on the lines and in the spell panel; under General → Layout pick the Vanguard meter frame and drag Its width wider and narrower. On the Deaths view click a line: the chat should get "Death recap:" with a link that opens the game's recap. Out of combat type `/vg meter report`, `/vg meter report party 3`, `/vg meter overall`, `/vg meter interrupts`, `/vg meter reset`. Paste the output of `/run for _, k in pairs(Enum.DamageMeterType) do print(k) end` and of `/run for _, k in pairs(Enum.DamageMeterSessionType) do print(k) end`.
- Expect: each left click moves the title through Damage per second, Healing per second, Damage done, Healing done, Damage taken, Interrupts, Dispels, Deaths and round; a right click through this fight, Overall ("... · Overall") and Previous fight; a click on a line opens a panel left of the meter (right of it once you move the meter to the screen's left edge) titled with the player's name and listing their spells (name, bar, total), top first; clicking the same line again or the panel's title closes it; the report prints one line "Damage per second: 1. Name 12.3K  2. ..." (and to the party with a channel); `reset` says the game's meter was reset and the lists empty. [Needs in game: that every kind and segment key exists in the enums, that GetCombatSessionSourceFromType takes a line's sourceGUID and returns combatSpells (spellID, totalAmount) already sorted, that C_Spell.GetSpellName takes a spell ID, that Overall and Expired mean "all fights" and "the previous fight", what the total of Interrupts, Dispels and Deaths lines means, and that the panel's spell list is empty rather than an error in combat. `/vg errors` must stay empty.]
- If it fails, paste: the two `/run` outputs, the title after each click, `/vg errors`.

### 7.8 Personal resource display

- Do: turn on the game's personal resource display (Options → Combat → Personal Resource Display, or `/console nameplateShowSelf 1`), stand still and look under your character; take a hit and spend some mana, rage or energy. Then turn the Nameplates module off under `/vg` → Modules, reload and look again.
- Expect: the health and power bars under your character are flat bars in the theme's bar texture on thin slate panels, with no grey rounded backdrop behind them; their colours (class or green health, the power's colour) and values are the game's, they fill and empty as the game's did, any numbers on them are in the plates' outlined font, and they sit where Edit Mode puts them. With the module off they are the game's own again. [Needs in game: that `PersonalResourceDisplayFrame` is the display on Forever (its addon is gated to mainline, which Forever matches) and that the client makes no nameplate for "player" there; if it does, Vanguard draws its own plate on it as on any other.]
- If it fails, paste: a screenshot under your character and `/vg errors`.

## 8. Quests

### 8.1 Quest dialog

- Do: under `/vg > Quests` tick Accept quests and Turn in finished quests (they are off by default). Talk to a quest giver who offers three or more quests. Press a number key, Space and Escape in turn. Then talk to a quest giver again without Shift (a quest is accepted for you), and once more holding Shift.
- Expect: Vanguard's dialog at the bottom centre, the NPC's name at the top in the window-title type (there is no close button: Goodbye and Escape end the talk), with numbered lines in difficulty colours, each led by a gold `!` (a quest you can take), a gold `?` (ready to turn in) or a grey `?` (in progress); Goodbye sits alone at the far left of the buttons; the number picks a line, Space or Enter presses the main button (Accept, Continue or Complete; with only Goodbye on the page, that), Escape says goodbye; in combat number keys, Space and Enter go to the game (Escape still says goodbye); without Shift the ticked automation runs; with Shift held, no automation runs and the dialog stays open for you.
- Also expect (a fight with the dialog open): talk to a quest giver, pull a mob that reaches you (or get hit) with the dialog still open, and finish the fight without closing it. During the fight Space moves or jumps as usual; once the fight ends, Space and the number keys work in the dialog again without you clicking anything or turning a page. [Needs in game: that the keys come back on PLAYER_REGEN_ENABLED, and that Escape closes the dialog during the fight.]
- Also expect (a flight master): talk to a flight master with no quests for you. The flight map opens at once, with no Vanguard dialog in between, as with the game's own windows. An NPC with several options, or a quest as well, still opens the dialog. [Needs in game: which NPCs the client flags `selectOptionWhenOnlyOption` on Forever, and that `C_GossipInfo.SelectOptionByIndex` opens the flight map from an addon.]
- Also expect (reward captions): open a quest that offers a choice of rewards and also gives something anyway, then hand it in, and open the same quest in the quest log. Before you take it, the choices sit under `You will be able to choose one of these rewards:` and the rest on its own row under `You will also receive:`; on the hand-in page the first caption reads `Choose one of these rewards:`; a quest with one reward item reads `You will receive:`; a quest that needs items handed in shows them under `Required items:`. The quest log shows the same captions as the first page. Of two or more choices, the one that sells for most has a small gold crown in its top-right corner (hover each to compare the sell prices); two choices at the same price show no crown; the upgrade arrow, when there is one, stays at the icon's top-left. [Needs in game: the client's wording of each caption, and that no caption overlaps a card.]
- Also expect (needs and failed): take a quest that suggests a group (an elite quest). The dialog shows `Suggested Players [n]` in grey under the objectives, and the quest log shows the same line under the objective rows. A quest that costs money to hand in shows `Required Money:` with the cost on that line in the log, red while you carry less. A failed quest (let a timed or escort quest run out) shows a red `Failed` where its objectives were. [Needs in game: the wording, and that C_QuestLog.GetRequiredMoney and GetSuggestedGroupSize answer on Forever.]
- Also expect (a quest that costs money to hand in, if you find one): with Turn in finished quests ticked, talk to its NPC. The dialog stays open for you (automation leaves it alone), the hand-in page reads `Costs 5g 0s 0c` (the quest's price) at the bottom left, and Complete asks `Completing <title> costs ... Complete it?`: No ends the talk and keeps your gold, Complete takes the reward and the money. [Needs in game: which Forever quests cost money, and `/dump GetQuestMoneyToGet()` on the hand-in and reward pages of one.]
- If it fails, paste: a screenshot and `/vg errors`.

### 8.2 Long quest text

- Do: open a quest with a very long description.
- Expect: the text fits or scrolls inside the panel, with no overflow outside it; when it scrolls, a thin grey thumb shows in the panel's right margin and soft edges fade the text at the top and bottom.
- If it fails, paste: a screenshot and the quest name.

### 8.3 Quest log

- Do: fill the quest log (as many quests as it lets you take; the limit on Forever is not confirmed), then press the quest log key and type `/vg quests`.
- Expect: Vanguard's log, titled `Quest log` with your quest count (`12 quests`) beside the title, with quests under their zones (each zone a small grey capitals header with a chevron, down while open and right while folded: click it to fold the zone), `[12] Title` lines in difficulty colours, the chosen quest marked by an accent bar along its left edge and a faint wash, a thin scroll thumb beside a list or quest text longer than its column, and Track or Untrack, Share and Map along the right, and Abandon (red label) alone at the far left, for the chosen quest. Click Track or Untrack, then Shift-click another quest: the button flips each time and the tracker follows; if the game refuses, chat says `The game didn't track ...` with the count tracked. Hover a reward card (a quest with an item reward): the item's tooltip shows beside it and goes when you leave. [Needs in game: the tooltip must show for both choices and fixed rewards.] Ctrl-click two quests: both look chosen and the red button reads `Abandon 2`; Ctrl-click one again to unmark it. Click Abandon: a question names the marked quests; No leaves them, Abandon removes them from the log. Abandon a quest that gave you a quest item (a sack or a letter you carry): the game's confirmation names that item. [Needs in game: that C_QuestLog.AbandonQuest exists and works after SetAbandonQuest, several in a row, and that `C_QuestLog.GetAbandonQuestItems` lists a vanilla quest's items on Forever.] If it is off, `/vg quests` says `Vanguard's quest log is off (/vg > Quests).`
- Also (objective rows): choose a quest with a counted objective (kill or collect) and one without a count (explore, talk to). Expect an `Objectives` header and one 28 px row each: a count at the right edge (`3/8`) with a thin accent bar under the row while it is open; a plain objective with no count and no bar; a done one with a check mark and muted text. Kill one more and the count and bar follow. [Needs in game: that objective text ends or starts with `x/y` on Forever; if it reads another way the row shows the whole text and no count.]
- If it fails, paste: a screenshot and `/vg errors`.

### 8.3b Quest log on a narrow window

- Do: with the game in a windowed or 4:3 resolution under 1040 units wide (for instance 1024x768 at UI scale 1), open the quest log with `/vg quests` without having moved it.
- Expect: the whole window is on the screen, its quest list column included (nothing cut at the left edge). [Needs in-game check: that the client moves the clamped, centre-anchored window fully on screen.]
- If it fails, paste: a screenshot and `/vg frame Vanguard_QuestLog`.

### 8.3a Quest history

- Do: turn in a quest on one character, then log in on another character on the same account and talk to a quest giver offering that quest (or open it in the quest log if you have it). Type `/vg quests history` and `/vg quests history 3`. Under `/vg` → Quests, switch off "Remember which character finished each quest" and turn in another quest.
- Expect: in Vanguard's quest dialog on the quest's details page, a muted line under the text and objectives, `Done on Name-Realm · today` (then `yesterday`, `3 days ago`; a quest turned in during the evening still says `today` until your computer's midnight, even past midnight UTC); the same line under the objectives in the quest log. For a repeatable quest turned in on the same character, `Done on this character`. `/vg quests history` prints `Latest N quest turn-in(s), of M remembered:` and a line per quest, `Title · Name-Realm · today`, newest first, at most the number you gave (25 at most). Switched off, the lines are gone, nothing new is remembered and the command says `Quest history is off (/vg > Quests).` [Needs in game: that `QUEST_TURNED_IN` fires on Forever with the quest's id first, that a quest's title is still known to `C_QuestLog.GetTitleForQuestID` after it is turned in (else the list reads `Quest 12345`), and how the muted line reads under a long quest text.]
- Also expect (quests done before Vanguard, and the button): on a character that finished a quest before Vanguard was installed, if the game offers it again (a repeatable one, say), its details read `Done on this character`; say if you never see a quest the game offers again. Under `/vg` → Quests → Quest history, press `List latest turn-ins`: chat prints the same list as `/vg quests history`; switch history off and the button greys. [Needs in game: that `C_QuestLog.IsQuestFlaggedCompleted` is true there, and whether a repeatable quest stays flagged after its reset.]
- If it fails, paste: a screenshot and `/vg errors`.

### 8.4 Quest tracker overflow

- Do: watch more quests than fit under the info strip, then click the QUESTS header at the top of the tracker, and again.
- Expect: the tracker's header reads `QUESTS` in small grey capitals with the number of quests you watch after it and a chevron before it; clicking it folds the tracker down to that header (the brass line stays under it) and clicking again opens it. A `+N more` line at the bottom of the tracker. Click it: the tracker grows to at most 10 quests, ending in `Show fewer` (with `· +N more` past ten). `/reload`: it is still expanded. Click `Show fewer` to fold it.
- Also expect (Legacy challenges): with a challenge tracked in the game (its Legacy window), a `Legacy challenges` heading sits under the quests with the challenge beneath it, its criteria as rows (`…` at the left, `2/3` at the right edge) and `Complete` once done. Right-click the challenge: it leaves the tracker. With none tracked, no heading. A heading never shows alone: when no challenge fits under it, it is left out and the `+N more` line counts the challenges. [Needs in game: how a Forever client tracks a challenge, and that its criteria text reads as above.]
- Also expect (timed quests): take a timed quest (an escort, or one that says "Hurry!") and watch it. Under its title, above its objectives, a gray `Time left 4:32` line counts down once a second; it goes when the quest is done or abandoned, and no countdown shows anywhere else on the screen. [Needs in game: that the Forever client reports the timer to addons (`C_QuestLog.GetQuestTimers`); if the line never shows while the quest is timed, say so.]
- Also expect (tooltips and failed quests): hover a quest title in the tracker. It lights with a faint wash and a tooltip shows its title, its objectives in full and a muted line `Click: open · Shift-click: point the arrow · Right-click: stop watching`; a challenge's says `Right-click: stop tracking`, and the `Legacy challenges` heading shows nothing. In a fight, no tooltip. Let a timed quest run out (or fail an escort): its block reads `Failed` in red in place of its objectives. [Needs in game: that `C_QuestLog.IsFailed` is true for a failed quest on Forever.]
- Also expect (recipes): open a profession window and track a recipe (its track checkbox or Shift-click as the game offers). A `Recipes` heading sits after the quests and challenges with the recipe beneath it and a row per reagent, `Linen Cloth` with `2/4` at the right edge, gray until you have enough, then muted gray with a check; buy or craft a reagent and the count follows. Left-click the recipe: the profession window opens on it. Right-click: it leaves the tracker, and the heading goes with the last one. [Needs in game: that a reagent the client hasn't cached joins the list a moment later.]
- Also expect (objective rows and the followed quest): each objective in the tracker is a row: its name at the left (no `- ` before it) and its count such as `3/8` at the right edge, lined up down the tracker. Finish one: it turns muted gray with a small check before its name, rather than turning green. The quest the arrow names has a thin brass line down its left edge; walk until the arrow moves on to another quest and the line moves with it within a second or so; Shift-click another and the line goes to it at once, with its step line. A quest item button beside a quest still sits just left of its block and works in and out of combat, and the line does not cover it. [Needs in game: that long objective names cut short before the count rather than run under it, and that the line reads as one quest's mark, not a divider.]
- If it fails, paste: a screenshot.

### 8.4a Quest arrow

- Do: watch two or three quests with unfinished objectives in the zone you are in, stand still, and turn your character slowly round. Then walk toward the quest the arrow names, finish one quest's objectives, and Shift-click a different quest in the tracker. Type `/vg unlock`, drag the arrow, `/vg lock`.
- Expect: a small panel at the top centre with an accent arrow, the quest's title and `230 yd` under it. The arrow points at the quest's area on the ground and turns as you turn (up means straight ahead). The distance falls as you walk. When a quest is ready to turn in, the arrow moves to its turn-in unless another objective is much nearer, and chat says `Arrow: <title>.` when it moves on from a finished quest. A Shift-clicked quest holds the arrow until it leaves the log. Watch a quest in another zone and stand where the game's own pin points you toward it: the arrow points the same way (the zone exit or a boat), or, if the client gives no next waypoint, reads `yd, no direction` with a faint arrow; `/vg guide probe` lines `GetNextWaypointForMap` say which the client has. The panel moves with the other handles. [Needs in game: that the arrow points the right way (the sign of the turn), that distances match the game's own pin, and how it reads in an instance.]
- Also expect (arrival, turn-in and the Pin button): walk right up to an objective's area: under about 15 yards the distance reads `Here` in green and the arrow goes faint (report the yards if it comes too early or late; on a flight it keeps the distance). Finish a quest: the arrow turns gold and reads `Turn in · 230 yd`. Shift-click a quest in the tracker: a small pin tile shows at the panel's right edge; hover it (`Pinned (Shift-click in the tracker)`, `Click: follow the nearest quest.`) and click it: chat says `Arrow: nearest quest.`, the arrow goes back to the nearest quest and the tile goes. Set a `/way 50 50` first, then pin and un-pin: the waypoint stays. Clicking or turning the camera over the rest of the panel works as if it weren't there. [Needs in game: that `C_SuperTrack.SetSuperTrackedQuestID(0)` lets the game's own marker go, and the right "Here" distance.]
- If it fails, paste: a screenshot with the arrow and the quest on the map, and `/vg errors`.

### 8.4b Questing conveniences

- Do: with a quest or two in the log that give XP and a level below the cap, look at the foot of the tracker and open the quest log. Under `/vg > Quests` switch off the line under the quests, then each quest's XP in the quest log list, then tick them again. Accept a new quest from an NPC with Watch a quest when you accept it on, and again with it off. Then tick Accept quests a party member shares with you, have a party member share a quest (their Share button), and repeat it holding Shift.
- Expect: a muted `Quests: 62% of the XP to level` line under the last quest (above `+N more` when that shows), which follows the quests you take and abandon and is gone at the level cap or when no quest gives XP; each quest line in the quest log shows `1,250 XP` in muted type at its right edge with the title cut short, not overlapped; the switches take effect at once. A newly accepted quest appears in the tracker without you watching it (off: it does not, unless the game's own auto-watch does). A shared quest is accepted for you with `Accepted: <title> (shared by <name>)` in chat and no dialog; with Shift held, or the switch off, the dialog opens as usual. With Turn in and the best-seller switch on, handing in a quest with a choice of rewards says `Turned in: <title> (took <item>: sells for most)`. With Accept quests on and a full quest log, an offered quest is not reported as `Accepted`; with no quests at all the quest log list reads `No quests yet. Quest givers show a ! over their heads.` [Needs in game: that the XP numbers match the quest dialog's, that QUEST_ACCEPTED arrives with the quest id in the log, that the game refuses a watch past its limit quietly, and that the quest dialog's `npc` unit is the sharing player for a shared quest.]
- If it fails, paste: a screenshot and `/vg errors`.

### 8.4d Quest spots on the minimap

- Do: with quests in your log in the zone you are in, look at the minimap, walk toward one quest's area and away from another, then turn on the game's Rotate Minimap option and turn round.
- Expect: a small dot in your accent on the minimap over each quest's area (the same spots as the world map's quest blobs), a gold `?` for a quest ready to turn in, drawn over any dot it overlaps; Shift-click a quest in the tracker and its mark grows a size; a quest farther than the minimap shows sits faint on its edge in its direction and slides in as you approach. With Rotate Minimap on, the marks turn with the map. `/vg guide probe` shows `C_Minimap.GetViewRadius: present`. [Needs in game: that the marks sit on the right spots at every zoom, and that the dot reads clearly on busy ground (grass, snow, desert, a city) on both the square and the round minimap.]
- If it fails, paste: a screenshot of the minimap and the world map, and `/vg errors`.

### 8.5 Levelling helpers

- Do: watch a quest worth XP, hover the XP bar, kill a few mobs that give XP, turn in nothing yet, then let your food fall under the wanted count (`/vg prep want food 20`) by using or selling some.
- Expect: the quest's XP under its objectives in the tracker; the XP bar's tooltip lists what is left, how far through, rested, `Kills to level` (after your first kill, and not changed by a quest turn-in) and `XP in finished quests` (only quests ready to turn in); one `Running low: Food & drink n / 20.` line in chat when food drops under the count, nothing further until it has been back at 20 and drops again, and nothing during a fight (it appears after).
- If it fails, paste: a screenshot, the chat line and `/vg errors`. Say which came first in chat: the XP message for a kill or the XP bar moving.

### 8.5a XP and reputation numbers side by side

- Do: while levelling, watch a faction (Escape → Reputation → Show as experience bar). In `/vg` → Bars and bags set Numbers to "always" (it needs a reload). Look at the two bars at the bottom, then set Text size under General to 130% and look again.
- Expect: the XP numbers at the left end of the XP bar and the reputation numbers at the right end of the bar above it, both readable, not on top of each other, at both text sizes. [Needs in-game check: how far apart the two lines sit at 100% depends on the font's real line height.]
- If it fails, paste: a screenshot of the two bars.

### 8.5b Reputation bar tooltip and click

- Do: watch a faction and hover the reputation bar; click it; close the character window, start a fight (a training dummy) and click the bar again. If a character has a faction at Exalted, watch that one.
- Expect: the bar's numbers start with the standing (for example "Darnassus  Friendly  1.2K / 6.0K (20%)"); the tooltip shows the faction, Standing, "To Honored" with what is left, how far through and "Click: the reputation list"; the click opens the character window on its Reputation tab; in the fight nothing opens and chat says to try after it. An Exalted faction shows a full bar reading "Name  Exalted" with no numbers, and its tooltip only the standing.
- If it fails, paste: a screenshot of the tooltip, `/vg probe`'s `watched faction:` line and `/vg errors`.

### 8.5c Reputation bar at the level cap

- Do: on a character at the level cap (or with the XP bar turned off under Modules → XP and reputation), watch a faction and look at the bottom of the screen. If you can, ding the cap with a faction watched.
- Expect: the reputation bar sits just above the screen's bottom edge, in the XP bar's spot, with no empty gap under it; at the ding it moves down (after the fight, if you ding in one). A reputation bar you dragged in `/vg unlock` stays where you put it.
- If it fails, paste: a screenshot of the bottom of the screen.

### 8.6 Quiet the game

- Do: `/vg` → Game windows → "Quiet the game". Switch on "Hide the red error line (full bags and quest log still show)", then press a key that fails (jump into a wall of mobs' "Not enough mana", or use an ability on cooldown). Switch on "Hide the zone names that fade in", then walk into a new zone and subzone. Pick a "Furthest the camera zooms out" value and scroll out. Have a stranger (or an alt) invite you to a group and to a guild with "Decline group invites..." and "Decline guild invites" on, then once from a friend. Die in a battleground with "Release at once..." on, then once more with a soulstone on you (or as a shaman with Reincarnation ready).
- Expect: no red error text; no zone or subzone name fades in (switching either off brings it back without a reload); the camera zooms out further than the game's default; a declined invite closes its prompt (the guild invite window too: it does not stay up with its Join button) and says `Declined a ... from <name>.` in chat, a friend's or guildmate's group invite still shows; you release at once in a battleground and not in an arena or a dungeon; with a soulstone or Reincarnation ready the game's death dialog stays and offers it. [Needs in game: that `C_DeathInfo.GetSelfResurrectOptions` lists the soulstone with `canUse` true at PLAYER_DEAD.]
- If it fails, paste: which switch, what you did, and `/vg errors`.

### 8.6a The error line keeps quest progress

- Do: with "Hide the red error line (full bags and quest log still show)" on, kill a mob for a quest objective (or loot a quest item) and, while its yellow progress line is still up, cast at a target out of range. Then try to open the keyring (a red line the game adds outside the error event). Then, with full bags, loot an item; and cast out of range again while "Inventory is full" is still up. If you can, also try a 26th quest with a full log, and loot a corpse a party member just emptied.
- Expect: the yellow progress line (`<mob> slain: 3/10`) stays on screen for its usual time, the out-of-range and keyring red lines never show, and the error voice and sound play as they do without Vanguard. "Inventory is full" (and "Your quest log is full", "Already looted", "You can't carry any more of those") stays, also when an out-of-range error comes after it (then it may stay up to twice its usual time, never on and on). With the switch off, every line shows. [Needs in game: that those four come through the error event with their message type, not added outside it; if "Inventory is full" is hidden, say so.]
- If it fails, paste: a screenshot of the top of the screen and `/vg errors`.

### 8.6b Camera zoom back to the game's setting

- Do: with "Furthest the camera zooms out" on "The game's setting", scroll the camera all the way out and note how far it goes. Pick "2.6 x (furthest)" and scroll out, then pick "The game's setting" again and scroll out. Try picking "The game's setting" during a fight too.
- Expect: 2.6 x zooms out further; back on "The game's setting" the camera stops where it did at first (in a fight, only once the fight ends), and it stays that way after `/reload`.
- If it fails, paste: `/dump GetCVar("cameraDistanceMaxZoomFactor")` before and after, and `/vg errors`.

### 8.6c A summon in a fight, and repeated declines

- Do: on Game windows, "Auto-accept", switch on "Accept summons (one offered in a fight is taken when it ends)" and "Decline duels", and under "Quiet the game", "Decline group invites from people who aren't friends or guildmates". Have a warlock summon you while you are fighting a mob, and finish the fight before the summon runs out. Then have someone who is not a friend or guildmate invite you to a group three times in a row, and ask you to duel three times.
- Expect: the summon prompt stays up during the fight; when the fight ends you are taken to the summoner and one chat line says from whom and to where. If you die in the fight, or the summon runs out first, you are not moved. [Needs in game: that the game lets you teleport the moment the fight ends; if the prompt stays up instead, say so.] Each invite and each duel is declined, but chat says "Declined a group invite from <name>." and "Declined a duel from <name>." once each, not three times; after 5 minutes a new one says it again.
- If it fails, paste: the chat lines and `/vg errors`.

## 9. Bags, merchant, trainer

### 9.1 Bag search

- Do: open your bags and type in the search box.
- Expect: the combined bag in the Vanguard look; items that do not match dim as the game dims them; the search box is themed; a Sort button is present if this client can sort bags.
- If it fails, paste: a screenshot and `/vg errors`.

### 9.1a Bag groups (buttons on the search row)

- Do: open your bags. Click **Groups** → New group..., type `Potions`, Create. Pick a potion up (it stays on the cursor), click **Groups** → Put held item in Potions. Make a second group and file another item. Then **Groups** → Make <group> first, Delete <group>. Click **Filter** → Epic or better, then Group: Potions, then Show everything.
- Expect: Filter and Groups sit between the search box and Sort, each button as wide as its label and the whole word showing (not "Fil..."), the box narrower, nothing overlapping at the window's edges. A POTIONS header over the potion, above Quest items; Make first reorders; Delete drops the header and the item falls back to its built-in section; Filter lights the matching items and dims the rest and Show everything clears it. The bag lays out again each time without a reload. The menus are readable (not cut off) and `/vg bag` lists the same groups.
- If it fails, paste: a screenshot, the output of `/vg bag` and `/vg errors`.

### 9.1b Bag search words and bank deposit

- Do: with bags open, type `ilvl>20`, then `q:epic`, `type:armor bind:boe`, `cat:<a group of yours>` in the bag's search box, then clear it. At the bank, click **Groups** → Send <group> to the bank; then once in a fight.
- Expect: items that match every word stay lit and the rest dim as with a normal search; a plain word still works the game's way; clearing the box lights everything again. Send moves that group's stacks to the bank and says how many; in a fight, or with no bank open, it says to open the bank and moves nothing.
- If it fails, paste: a screenshot, `/vg probe` (the SetItemSearch and UpdateSearchResults lines) and `/vg errors`.

### 9.1c Bank search words, the Junk value, taking an item out of a group

- Do: at the bank, with a green or better item in the bank, type `ilvl>20`, then `q:epic` (or `q:unc`) in the bank's search box (or the bag's: the game copies the text). Move an item in the bank and turn a bank page. Do the same in your bags. Then look at the bag's Junk header with gray items in your bags, and open a merchant. Then file an item in one of your groups, pick it up, and click **Groups** → Take held item out of its group.
- Expect: only matching items stay bright in the bank and the bags, and the match holds after the move and the page turn (the bank never goes all grey). The Junk header reads "JUNK · 12s 40c" (or similar), the same amount the merchant pays for your gray items (a Junk section only two slots wide may leave it off rather than run into the next header: note which). The taken-out item goes back to its normal section, its group's header goes if the group is now empty, and chat says it is in no category; with an item that is in no group held, chat says so and the item stays in hand.
- If it fails, paste: a screenshot, the search text, the Junk header and the merchant's line, and `/vg errors`.

### 9.2 Merchant repair and sell

- Do: with damaged gear and gray items, open a merchant who repairs.
- Expect: `Repaired for <money>.` (or `Not enough gold to repair (<money>).`) and `Selling N junk item(s).` in chat; the gray items vanish over a few seconds.
- If it fails, paste: the chat lines and `/vg errors`.

### 9.2g The error switch under Quiet the game

- Do: /vg > Game windows > Quiet the game; find "Hide errors the action bar already shows (reload)"; then Town and gear > Merchants.
- Expect: the switch is on under Quiet the game, beside "Hide the red error line", and no longer on the Merchants card; with it on (after a reload) casting before a cooldown ends shows no red line, and switched off (and reloaded) it does.
- If it fails, paste: a screenshot of both cards.

### 9.2a Sell list, sell all and bulk buy

- Do: `/vg junk` with a shift-clicked cheap item you own, then Town and gear → Merchants → "Offer to sell the items on your sell list"; open a merchant. Then `/vg sell` with a shift-clicked item of which you hold several stacks. Then shift-click an item for sale (a stackable one, with a few bag slots free) and press Stack, then Max.
- Expect: a question listing the item(s) and what they fetch; answering Sell sells them within a few seconds and the Buyback tab holds them; pressing Enter while the question is up does not answer it (click Sell); an item in an equipment set is not offered; Stack and Max and a "Max N for <money>" line sit under the quantity window for a merchant's item and not for an item in your bags; Max above one stack asks first; the buys finish with `Bought N × <item> for <money>.` and no error; an item that costs tokens or honor shows no buttons.
- If it fails, paste: the chat lines and `/vg errors`.

### 9.2b Junk stops with the merchant; keep stocked buys for gold only

- Do: with gray items that equip (grey armour or a weapon), click "Sell junk" or open a merchant and at once walk away (or close the window). Then `/vg stock <item a merchant sells for honor or tokens> 5` and open that merchant; then `/vg stock <an item for gold> 1000` with bags full and open a merchant who sells it; last, empty some bag room, open that merchant and at once right-click a different merchant standing next to it.
- Expect: once the merchant window is gone no gray item is equipped or used; nothing is bought for an item that costs honor, badges or other items; with full bags the run stops after one try with `Stopped buying <item>: the last purchase did not arrive in full ...` and no `Bought` line for what did not arrive; switching merchants mid-run ends the run with a `Bought` line for what arrived and buys nothing from the second merchant that is not on your list. [Needs in game: that a right-click on a bag item with no merchant open equips or uses it; that GetMerchantItemCostInfo (or the item table's hasExtendedCost) is set for such items; and that C_Item.GetItemCount shows a purchase within the 0.2 s wait. If a run stops early on a slow server, say so.]
- If it fails, paste: the chat lines and `/vg errors`.

### 9.2b Item tooltip lines with Tooltips off

- Do: turn the Tooltips module off under `/vg` > Modules (and reload if asked); keep Vendor memory and Auction helper on; hover an item you saw at a merchant, or one with an auction price from a scan.
- Expect: the item tooltip still shows the "Sold by ..." line and the "AH: ..." line (and "Upgrade +N% (estimate)" where it applies), in the game's own tooltip; there is no "Sells for ..." or "You have ..." line from Vanguard, and no unit-tooltip changes. Turn Tooltips back on: those two lines come back, with no line shown twice. [Needs in-game check: the lines on the client's tooltip, with the module off.]
- If it fails, paste: which line is missing or doubled, and `/vg errors`.

### 9.2d A Buy question left open past its merchant

- Do: at a merchant selling a cheap stackable item, open its quantity window (Shift-click it) and click Max so it asks "Buy N × <item> for <money>?". Leave the question up, walk away until the merchant window closes, then click Buy. Then stand between two merchants, ask for Max of several stacks at the first, answer Buy, and at once right-click the second merchant.
- Expect: nothing is bought, and chat says `Nothing bought: the merchant closed or changed what it sells.` Asking again at the merchant and answering Buy at once still buys as before. Between two merchants, buying stops when the first merchant's window closes (the `Bought` line counts only what came from it); nothing is bought from the second merchant.
- If it fails, paste: the chat lines and `/vg errors`.

### 9.2c Character sheet extras

- Do: open the character pane with gear worn. Then `/vg` → Game windows → Character sheet extras: tick "Mark worn pieces missing an enchant", and look at a chest, legs, boots, bracers, gloves, cloak or weapon of green quality or better without an enchant. Press "Show my gear summary in chat" (or run `/vg gear`).
- Expect: each worn slot shows its item level along the top edge (durability stays along the bottom); an unenchanted piece of those slots shows a `!` in the top-right corner, and not a held off-hand item (a shield does get one; see 9.2f); unticking a switch removes its labels at once; `/vg gear` prints the average item level, a melee damage-per-second line (with the swing time) and the pieces missing an enchant.
- If it fails, paste: a screenshot of the character pane, the `/vg gear` lines and `/vg errors`.

### 9.2e Keep stocked is each character's own

- Do: on a character whose stock list you set before this update, type `/vg stock`. Log in a second character that uses the same profile and type `/vg stock`; on it, `/vg stock <an item a merchant sells> 5`, then visit that merchant. Log back in on the first character, type `/vg stock`, and visit the same merchant.
- Expect: the first character to log in after the update lists the old list; the second starts with `Your stock list is empty. ...` and buys only its own 5; back on the first, its list is unchanged and the merchant buys nothing for the second character's item. A profile export (`/vg` → Profiles) carries no stock list. [Needs in game: that the list survives a logout on each character (it lives in the character's saved file).]
- Also expect (the window): `/vg` → Town and gear → Errands → **Edit list...** opens "Keep stocked" with one row per item (icon, name, where to buy it, the amount, Remove). Drag a bag item onto the + slot: it joins the list with one stack (Arrows 200, Water 20). Type a new amount, click away and type `/vg stock`: it lists the new amount. Clear an amount and click away: the row goes. Clear list asks first, then empties the window. [Needs in game: that a drag onto the slot is received (OnReceiveDrag), that GetItemIconByID and the stack size answer on Forever, and that typing in a box never moves your character.]
- If it fails, paste: both characters' `/vg stock` output and `/vg errors`.

### 9.2f Missing-enchant mark on a shield

- Do: with "Mark worn pieces missing an enchant" ticked, wear a green-or-better shield with no enchant and open the character pane; run `/vg gear`. Then wear an enchanted shield, then a held off-hand item (an orb, a tome or a lantern) of green or better.
- Expect: the unenchanted shield's off-hand slot shows the `!` and `/vg gear` lists `Off hand` among the pieces missing an enchant; the enchanted shield and the held item show no `!` and are not listed.
- If it fails, paste: a screenshot of the character pane, the shield's link in chat (shift-click it) and the `/vg gear` lines.

### 9.3 Trainer: Train all

- Do: at a class trainer with skills to learn, hover Train all before clicking it, then click it. Try it again in combat if you can. If you can, visit one with more skills than you can pay for, and one with none you can afford.
- Expect: a button reading `Train all (N)` on the trainer window, clear of your money line, where N is how many your gold covers; its tooltip reads `M skill(s) for <money>` and, when you can't pay for all, `; you can afford N (<money>)`; clicking it learns N and prints `Trained N skill(s) for <money>.` with the tooltip's figure; greyed out, its tooltip still shows and reads `Not enough gold for any: the cheapest is <money>.`; in combat it does nothing. [Needs in game: that the count and cost match what the click buys.]
- If it fails, paste: a screenshot of the trainer window and `/vg errors`.

### 9.4 Lists and Posting tabs at the auction house

- Do: talk to an auctioneer; click the Lists tab, then Posting, then the game's Buy; on Lists click a list in the Lists pane, then a row of it (its listings), then Back; click Scan the auction house, then the pane's Deals and Upgrades entries; on Posting drop an item on the sell slot, click Your history and Up now on the card at the top right, then click the same item in a bag.
- Expect: two tabs, Lists and Posting, after the game's Buy, Sell and Auctions, in the same look as the game's; the window's title says Lists or Posting while one is open. Lists: the Lists pane on the left (your lists with their counts, Recent, Deals, Upgrades; six buttons under them; the scan button at the bottom), the list picked on the right as a table with headings (Item, Unit price, Up, Max) under a toolbar (+ Add, Search list, Restock), about twenty rows; a row's listings replace the table with Back and the item above sortable columns; after the scan, Deals shows its rows (Unit price, Under by, Judged against) and Upgrades its rows (Slot, Gain, Unit price) with the counts beside the entries, or a line saying none were found. Posting: the Sell card on the left with one field a row, Up now at the top right (the item's listings, yours flagged; Your history in its place on the toggle), Your auctions at the bottom right with Check undercuts and Cancel next undercut on its heading line; every card inside the window. A listing, deal or upgrade clicked switches to the game's Buy page with the item in its list, and Lists brings back the view where it was; the sell slot takes the dropped item; a bag click with Posting open keeps the window on Posting with the item on the Sell card (from the game's own tabs it shows the game's Sell page, and the item is on the Posting card too). If you know Enchanting, a green or better weapon or armour tooltip shows a "Disenchant: ~" line once its materials are priced (it follows Enchanting from your skills where the game has no profession list).
- If it fails, paste: a screenshot of each tab and `/vg errors`.

### 9.4a Typing a price on the Posting tab

- Do: on the Posting tab drop an item on the Sell card. In the Price box type `1e5`, then `0x10`, then `99999999`, then `1g 50s`; switch the button beside it to per stack and type `55c` with a stack size of 10.
- Expect: the first three are not taken as prices (the box goes back to the suggestion; nothing posts at 100,000 gold or 16 gold); `1g 50s` is the price. With per stack on, `55c` for a stack of 10 shows `60c` in the box (6c a unit, rounded up) and the stack posts at 60c, never under the 55c typed. [Needs in-game check: what the client does with a posted price near the highest it takes.]
- If it fails, paste: a screenshot of the Sell card and `/vg errors`.

### 9.4b The scan countdown, a refused scan, and deals kept through the mailbox

- Do: on the Lists tab, Scan the auction house and let it finish; close the auction house and open it again. Within 15 minutes, open the auction house on a second character (or, with another auction addon, run its full scan first) and look at the Scan button; if it can be pressed, press it and wait two minutes. Back on the first character, after a scan with deals found, walk to the mailbox, then come back and open Deals and Upgrades.
- Expect: the Scan button is greyed and reads "Next scan in N min", counting down, with "Scanned N min ago · N items" under it. On the second character the button is greyed too (the 15 minutes are the account's); if the game refused a scan, after about 90 seconds chat says another character or auction addon may have scanned, the button counts down 15 minutes from the try, and nothing is stuck at "scanning 0 of 0" (the line under the button is never in the warning colour while a scan runs). Note how long a full scan took. The deals and upgrades are still listed, the heading reading "N found, the oldest N min ago" and each tooltip "Found N min ago."
- If it fails, paste: a screenshot of the Lists tab, the chat lines and `/vg errors`.

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
- Expect: about three seconds after you board, a bar at the top centre (the flight timer's spot) says "Timing this ride"; stepping off hides it and saves the time under "where you boarded > where you got off". The second ride from that dock counts down from the saved time, with the place you landed last time. [Needs in game: that the client gives no map position for you on a boat or zeppelin (the code takes that as being aboard), that the sub-zone names at the docks differ from each other, and that the position comes back as soon as you step off.]
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

### 10.1b Import is checked first, and the test tile lets Escape through

- Do: with a few bindings set, `/vg` > Click casting > Export, copy the string. Click Import and paste "VG1:clickcast:" followed by junk, then paste a string from another character, then the string you exported. Then hover the sample tile, press a number key that is on your action bar, press Shift alone, then Escape.
- Expect: the junk is refused in chat ("Can't import: ...") and your bindings stay; the other character's string replaces them in one go, with no stall; the exported string brings your own back. On the tile, the number key shows "<key> -> ..." and does not trigger the action bar button; Escape closes the options window. [Needs in-game check: that the number key is kept from the game while the pointer is on the tile, and that Escape still closes the window.]
- If it fails, paste: the chat lines, what the key did, and `/vg errors`.

### 10.1c A fight closes the spell picker

- Do: `/vg` > Click casting, click a grid cell to open the spell picker, leave it open and start a fight (attack a training dummy). Press a movement key and an action bar key.
- Expect: the picker closes as the fight starts, and you move and cast as usual without pressing Escape. [Needs in game: that no key is swallowed while the options window stays open in the fight.]
- If it fails, paste: whether the picker stayed open, what the keys did, and `/vg errors`.

### 10.1d A Target or Unit menu binding the game won't run says so

- Do: with "Use the game's click bindings" off (the switch exists only where the game has click bindings of its own), `/vg` > Click casting, click your class's healing layout, then add Unit menu to a hover key (Add key, Shift+Q, Unit menu). Hover the Middle / Plain cell. Type `/vg binds`. Then middle-click a party or raid tile and hover a tile and press Shift+Q.
- Expect: the Middle / Plain cell's "Unit menu" is in the warning colour and its tooltip says "Does nothing: the game runs it only on a click its own Click Casting window binds."; the Shift + Q row says "does nothing: the game won't run it from a key"; `/vg binds` adds "(does nothing: ...)" with the same reasons to those two lines, and not to Left click (Target) or Right click. Middle click and Shift+Q open no menu (the warning is right). [Needs in game: that the game's default profile binds only plain Left and Right, and that a Target or Unit menu click it covers still works.]
- If it fails, paste: the `/vg binds` output, what the clicks did, and `/vg errors`.

### 10.1e Each talent group keeps its own click bindings

- Do: on WoW Forever with dual spec, `/vg` > Click casting on your Primary talents and bind a spell to Ctrl + Right click; look at the line over the grid. Switch to your Secondary talents (out of combat), look at the grid, bind a different spell to Ctrl + Right click, and click a raid or party tile with Ctrl held. Switch back to Primary and click a tile again. Then, still on Primary, open **Copy to...** under Share and pick the other group; `/vg binds` on each group.
- Expect: the line reads "Bindings for Primary talents on this character..." (and "Secondary talents" on the other group); the Secondary grid starts with its own list (empty, or a copy of what you had before this version on a character that used click casting first), and each group casts its own spell; **Copy to...** offers only the other talent group ("Copy to Secondary talents"), chat says "Click-casting bindings copied to Secondary talents.", and `/vg binds` then lists the same bindings on both. [Needs in game: that `/vg spec`'s talent group is what the client reports on each swap, and that a character that had bindings before shows them on both groups the first time.]
- If it fails, paste: `/vg binds` on each group, `/vg spec` and `/vg errors`.

### 10.2 Use it

- Do: out of combat, hover a party or raid tile (or your own frame) and press the key or click.
- Expect: the spell is cast on that unit. [After P0.11: if `/vg status` says `secure snippets: no`, hover keys are off on purpose and only mouse bindings work; paste that status line.]
- If it fails, paste: `/vg binds`, `/vg status` and `/vg errors`.

### 10.3 Bar 1 pages with stances and forms

- Do: on a warrior, druid or rogue, change stance, form or stealth out of combat, then again in a fight; also press Shift+2 and Shift+1.
- Expect: bar 1's icons change with each stance, form or stealth and with Shift+number, in and out of combat, and the button casts what it shows. This holds whether `/vg status` says `secure snippets: yes` or `no` (with `no`, bar 1 pages through the game's own page attribute).
- If it fails, paste: your class, what you changed, what the bar showed, `/vg status` and `/vg errors`.

### 10.3a The range tint after a page change

- Do: with a ranged attack or spell on bar 1 button 1 on both pages, stand out of its range of a target so the icon is red, then change stance, form or stealth (or press Shift+2) so bar 1 shows another page, walk into range on the new page's spell, and change back.
- Expect: each page's icon is red only while its own action is out of range, right after the page changes; coming back does not keep the other page's red. `/vg errors` stays empty. [Needs in game: that IsActionInRange answers for the new page's slot at once, in combat too.]
- If it fails, paste: your class, the spells, what the icon showed, and `/vg errors`.

### 10.3b Red when out of range, switched

- Do: stand out of range of a target so a bar icon is red, then untick `/vg` → Action bars → **Red when out of range**, and tick it again, without moving.
- Expect: the icon loses its red the moment you untick and turns red again the moment you tick; nothing waits for a reload or a step. No error.
- If it fails, paste: what the icon showed and `/vg errors`.

### 10.4 Keybind mode on the action bars

- Do: out of combat, type `/vg keybind`. Hover an empty slot on bar 1 and press Shift+Q; then, still over it, press mouse button 4, roll the wheel down, and press Backspace. Hover a button that has a key and press W. Hover a button and left-click it. Press Escape.
- Expect: a banner at the top, and a tooltip over each button naming it and its keys. Shift+Q, the side button and the wheel each bind in turn (the hotkey text shows SQ, M4, WD) and chat says so; Backspace clears the key and chat says what it was; W binds and chat says it was taken from Move Forward; the left click binds and casts nothing. Escape closes the banner and the tooltip; the keys still work and survive `/reload`.
- If it fails, paste: what you pressed, what chat said, the key's hotkey text, and `/vg errors`.

### 10.4a Short key names on the buttons

- Do: in the game's Key Bindings (Escape → Options → Keybindings → Action Bars), bind Backspace, Shift+Backspace, Numpad + and Numpad 1 to four bar 1 buttons, and (on a Mac) Command+4 to another and mouse button 4 to one more. Close the window and look at the buttons.
- Expect: the hotkey texts read Bs, SBs, N+, N1, Cmd4 and M4, each one different, none cut to a half word. No error.
- If it fails, paste: a screenshot of the bar and the keys you bound.

### 10.4b Long keys stay on one line

- Do: bind Page Up, Insert, Caps Lock and Shift+Ctrl+Alt+Delete to four bar 1 buttons in the game's Key Bindings, then look at the buttons at your smallest button size.
- Expect: the hotkey texts read PU, Ins, Cap and ACSDel (or as much as fits), on one line in the button's top right corner, never wrapping onto a second line or running past the button's edge.
- If it fails, paste: a screenshot of the bar.

### 10.4c Equipped items are ringed

- Do: put a weapon or trinket you are wearing on a bar 1 button (drag it from the character window), and another you are not wearing on the next one. Swap the two in the character window.
- Expect: a thin green ring inside the edge of the worn item's button only; after the swap the ring moves to the other one. With Masque skinning the bars, Vanguard draws no ring.
- If it fails, paste: a screenshot of the two buttons and `/vg errors`.

### 10.4d Keybind banner says what happened

- Do: type `/vg keybind`. Hover an empty bar 1 button and press Shift+Q, then press W over it (W moves you forward), then press Backspace twice. Click the banner's **Done** button.
- Expect: the banner's second line reads "Nothing bound yet." at first, then each result as chat gets it ("SHIFT-Q bound to …", then in the warning colour "W bound to …, taken from Move Forward.", then "… unbound (was W)." and "… has no key."). Done closes the banner like Escape, and W stays bound to the button.
- If it fails, paste: a screenshot of the banner and `/vg errors`.

## 11. AFK

### 11.1 AFK card

- Do: standing still out of combat, type `/afk`. Move. Type `/afk` again, then click or press a key.
- Expect: the screen dims to a card with your name in your class colour, level and class, the zone, time away, the clock and an XP bar, and under the card your faction's passage (Varian's letter for Alliance, the Blood Oath for Horde; in Cinzel or Metamorphous with the faction look on Crest and heading font, otherwise in Fira Sans) in the crest colour; moving removes it; a click or key removes it until you are next away; it never shows in combat.
- If it fails, paste: a screenshot and `/vg errors`.

### 11.1a AFK card gives way to what needs you

- Do: in a group, type `/afk` and have someone start a ready check; type `/afk` twice again and have someone invite you to a group (or trade you). Then `/afk` while casting Hearthstone, and `/afk` inside a dungeon.
- Expect: the ready check and the invite each put the card away at once, and your first click lands on the prompt's button. While you cast, the card doesn't show; about 30 seconds later, if you're still away, it does. Inside the dungeon it never shows. [Needs in game.]
- If it fails, paste: which prompt, a screenshot and `/vg errors`.

### 11.1b Errors window buttons

- Do: with an error caught (or after `/vg errors` shows at least one), open `/vg errors`; click **Report a bug**. Open `/vg errors` again and click **Clear**.
- Expect: Report a bug closes the errors window and opens the feedback form on Bug with the report attached; Clear closes the window, chat says "Errors cleared.", the addons button's count goes, and `/vg errors` then says none were caught. Other copy windows (export, report) show Close only. [Needs in game.]
- If it fails, paste: a screenshot of the window and `/vg errors`.

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

### 13.2a Bags nearly full

- Do: fill your normal bags until 4 slots are free, then until none are; hover a bag (not the backpack) on the bag bar. A warlock or hunter: fill a soul bag or quiver too.
- Expect: the backpack's count and the info strip's "free" turn amber at 4 and red at 0, together; a soul bag's or quiver's slots don't count towards either. The bag's tooltip ends with a line such as "9 of 16 free" for that bag alone.
- If it fails, paste: a screenshot of the bag bar and strip, and `/vg errors`.

### 13.2b Strips at Text size 130 %

- Do: in the game's clock window untick 24-hour mode; under `/vg` → General set Text size to 130 %; with an addon that shares broker feeds, pick two feeds under Map → Data from other addons. Then set Text size back to 100 %.
- Expect: at 130 % the info strip is wider and its rows taller; no block's text runs into its neighbour (the 12-hour time, the date and the calendar button share their row), and nothing spills past the strip's edge. The broker strip is taller, its icons larger, each slot as wide as its text; a feed's tooltip opens below the strip at the top of the screen (move the strip near the bottom with `/vg unlock`: it opens above). The quest tracker starts just under the info strip's last row, clear of it. Back at 100 % both strips return to their usual size (a broker slot widened at 130 % narrows again) and the tracker moves back up.
- If it fails, paste: a screenshot of both strips at 130 %, and `/vg errors`.

### 13.2c Session rates through a reload

- Do: while levelling, kill a few mobs until the strip shows XP per hour; note it, type `/reload`; then log out to the character list and back in.
- Expect: after the reload the XP per hour, time to level and gold per hour show again at once, near the same figures; after logging back in they start again (hidden for the first minute).
- If it fails, paste: the figures before and after, and `/vg errors`.

### 13.2d Info strip tooltips

- Do: with some gear worn down, a soul bag or quiver if you have one, and some gold earned and spent since logging in, hover each number on the info strip under the minimap. Hover fps and latency once in a fight too.
- Expect: durability lists each item under 100 % (for example "Chest 23%"), most worn first; the free count lists each bag's slots used of its total, a soul bag or quiver named; gold shows earned and spent this session; fps and latency shows home and world latency and Vanguard's memory (in a fight, no memory line); the XP and gold rates and time to level show the session's length, XP gained and gold; your DPS (if switched on) shows the last fight's length. Each tooltip goes when the mouse leaves.
- If it fails, paste: a screenshot of the tooltip, and `/vg errors`.

### 13.2e Info strip clicks

- Do: out of a fight, click the info strip's durability, then its free count, then its gold. Right-click the XP per hour. Then open your bags from the strip's free count, start a fight (a training dummy) and drink a potion or use a bag item in it. In the fight, click the free count once more.
- Expect: durability opens the character window; the free count and gold each open (and, clicked again, close) your bags; the right-click hides the rates and they come back about a minute later counting from then. Using the item in the fight works, with no "Interface action failed because of an AddOn" line and no blocked-action error. The click in the fight opens nothing and chat says `The bag window doesn't open from Vanguard in a fight. Try again after it.`; the free count's tooltip then ends with "(after the fight)". If the item use shows a blocked message, the bag clicks are to be dropped: say so.
- If it fails, paste: a screenshot, and `/vg errors`.

### 13.3 Move the strips

- Do: type `/vg unlock`, drag the Bags and Game menu handles apart, type `/vg lock`, then `/reload`.
- Expect: both strips stay where you put them.
- If it fails, paste: a screenshot after the reload.

### 13.4 Minimap drawer and zone hints

- Do: hover the minimap's zone name. Then, with an addon that has a minimap button (LibDBIcon kind), log in; then turn on another addon's minimap button from its own settings (or load one on demand) without reloading, once out of a fight and once in one.
- Expect: the zone tooltip ends with "Click: world map" and "Wheel: zoom" in the muted colour. The new button goes into the drawer at once (in a fight, as soon as it ends), not onto the map.
- If it fails, paste: the addon's name, a screenshot of the minimap, and `/vg errors`.

### 13.5 Minimap drawer: order, count, Escape and side

- Do: with three or more addon buttons, hover the "..." toggle, open the drawer, press Escape; drag the minimap (`/vg unlock`) to the screen's left edge and to the bottom, and open the drawer at each; right-click a drawer button that has a menu.
- Expect: the toggle's tooltip reads "Addon buttons (N)"; the buttons sit in name order; Escape closes the drawer; at the left edge it opens right of the map, near the bottom it stays on screen; a button's right-click menu stays open.
- If it fails, paste: the addon's name, a screenshot of the minimap, and `/vg errors`.

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

### 14.2.2a Community avatars after the list redraws

- Do: open the guild window with at least one community besides your guild, so the list holds the community rows and Join or Create a Community. Click each row, then close and reopen the window, join or leave a community if you can, and look at every row's icon.
- Expect: the Join or Create a Community plus is grey; every community's avatar keeps its own colours (never greyed or tinted toward the text colour), however often the list redraws. `/vg errors` is empty.
- If it fails, paste: a screenshot of the list and `/vg errors`.

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
- Expect: the window is a flat panel with the theme's close button and title; the Battle.net bar's blue band is gone (the status dropdown and menu button are flat, the dropdown keeps its arrow and the menu button its icon); the status dropdown shows your status in words after its dot (Available, Away, Busy or Appear Offline), changes when you pick another, and the battletag beside it is not covered; the side tabs are flat with their icons, the selected one raised, the others greyed; the search box is a dark input box with its magnifier, Filter and Add New Friend are themed buttons, the list scrolls; the ignore list and broadcast windows beside it are flat panels with themed buttons. Also on each tab: the list sits on a sunk dark box and its cards (friends, recent allies, quick join, requests, recruits) have no blue plates, wash lighter under the mouse and light with the accent rail when you click one (the presence dot, game icon, class or role icon stay); on the friends and recent allies tabs each card's presence dot sits left of the names, centred on them top to bottom, not above the first name, and the names start just past it without touching it, also after you change the game's text size; the little square invite-to-group and summon buttons on a card sit on grey tiles with their icon; Accept on a friend request is a flat button; quick join group names are light text, not gold; on the recruit tab the reward card above the list is a flat panel (its watermark stays) with the claim button flat and its month count and next reward name light; on the raid tab (in a raid) the All assist box is Vanguard's check box with its raid assist icon, the not-in-raid text is light, the eight group cards are sunk boxes and each member button is flat (they catch up after a fight); the Battle.net unavailable notice has a light heading, the saved instances window beside the raid tab has its list in a sunk box with light instance names, and the ignore list's names are light.
- If it fails, paste: a screenshot and `/vg errors`.

### 14.2.9a Side windows clear of the side tabs

- Do: open the friends list (O), open the Battle.net menu (the button right of your battletag) and choose Ignore list, then Edit broadcast; in a raid, open the raid tab and click Raid Info.
- Expect: each side window opens to the right of the side tabs with a small gap between them, as without Vanguard; no tab is covered by the ignore list's panel or edge, and no side window's edge runs under a tab. With the tabs switch off (Game windows), the tabs sit at the window's edge and the side windows still clear them. Open the friends list in a fight for the first time after a reload: the side windows may sit under the tabs until the fight ends.
- If it fails, paste: a screenshot with the ignore list open and `/vg frame SocialUIFrame.IgnoreListFrame`.

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
- Expect: a flat slate panel with the theme's close button; the Game and AddOns tabs with the one you are on raised (lighter than the other) and each label centred in its tab; the category list and the settings list on darker panels with the theme's thin scroll bars (scroll both); the group names in the category list small grey capitals and the entry you are on marked with the accent rail while the one under the mouse gets a light wash (no brass plates); a thin line under the page title; flat Defaults, Apply and Close buttons and search box; on a page with check boxes, sliders, dropdowns and buttons (Graphics, Sound) the check boxes are Vanguard's, the sliders a dark track with a round knob and small arrows, the dropdowns and the buttons flat (scroll a long page: rows that come into view are dressed too); on Graphics, the Graphics Quality box starts at the left edge of its title, its top edge runs along the bottom of the Base and Raid and Battleground tabs, which sit on its top-right corner with their labels centred, and nothing in the box is dimmed. Every settings page still draws and works, the sliders still move the value, and the title is still readable.
- If it fails, paste: a screenshot of the window and `/vg errors`.

### 14.4.2 Edit Mode

- Do: press Escape, click Edit Mode. Look, click a Blizzard frame (say the chat window) so its settings dialog opens, change a setting, click Revert on the dialog, click Save in the main window, then close Edit Mode.
- Expect: Edit Mode's window and its settings dialog on flat panels with the theme's buttons and title, the Layout dropdown a flat button that keeps its arrow, the Show Grid, Snap and Advanced options switches and every box in the options list Vanguard's check boxes, the grid spacing slider a dark track with a round knob and small arrows (and still moving the grid), the list of options on a darker well with the theme's scroll bar and no gold ring, its Frames, Combat and Misc headings small grey capitals, and a thin line over the expander (click Advanced options to see both); in the settings dialog the check boxes, dropdowns and sliders are the theme's (change a setting that has each: a checkbox, a dropdown, a slider such as Opacity or Icon Size; they must keep working and the dialog must still resize to fit), and the line between Revert and any extra buttons is one thin line. Vanguard's note (`The labeled handles are Vanguard's frames...`) still sits under the main window; the settings dialog still resizes to its settings; Save works and nothing reports a blocked action (`/vg errors` empty, no "Interface action failed because of an AddOn" popup). Open the layout menu and pick New layout, Import layout and close without saving: their dialogs match, with the Character specific box a Vanguard check box, the labels light (not gold), and in Import layout the paste box on a dark inset with the theme's scroll bar once you paste enough text to scroll.
- If it fails, paste: a screenshot while Edit Mode is open and `/vg errors`.

### 14.4.3 Addon list and chat settings

- Do: press Escape, click AddOns (or open the AddOns tab from the game menu), type in its search box, then close it. Right-click a chat tab and choose Settings, click through two categories, then Okay.
- Expect: both windows on flat panels with themed buttons and search box; the addon list has the theme's scroll bar and a flat character dropdown that keeps its arrow, and its Performance heading is small grey capitals over a thin line; each addon row's box and the Load out of date box are Vanguard's 16 px check boxes with a check mark (rows that scroll into view too; Enable All and Disable All move the marks; a greyed row's box and label are grey, not faded); in the chat settings the category list and the settings area sit on darker boxes, every box on a page (Chat, Channels, Other, Combat) sits on a darker panel with no gold border and its heading (and the Color heading) in small grey capitals, every check box is Vanguard's (those in a category you open later too; a tab or category entry must not have turned into a box) and still works, no gold ring is left round a row, and the color swatches stay. Open Combat, then Colors: Color entire line by source or by target are round radios with a dot in the one chosen (clicking moves the dot). In Combat, the filter list has the theme's scroll bar, Add Filter, Copy Filter and Delete are flat buttons, the two move arrows are flat buttons with an up and a down arrow, and the filter name box is a dark edit box. The tabs along the top (one for each chat window) are flat with the current window's raised, and clicking one moves that.
- If it fails, paste: a screenshot of each window and `/vg errors`.

### 14.4.3a Addon rows that come into view later

- Do: with enough addons installed that the addon list scrolls, open it, scroll to the bottom and back, and collapse and expand a category (if your list groups addons into categories).
- Expect: every addon row's box is Vanguard's 16 px check box with its check mark, also on the rows that came into view as you scrolled or expanded; none shows the game's gold box. `/vg errors` is empty.
- If it fails, paste: a screenshot of a row with the game's box and `/vg errors`.

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
- Expect: the minimap's zone tooltip names the zone, its subzone and whose territory it is, the first click opens the world map and the second closes it; each window has Vanguard's flat dark panel, close button and buttons and no game border; the map itself stays fully visible with no dark box over it (also after minimising and maximising), the coordinate line still shows along its bottom, the nav bar's crumbs follow you into each zone, the calendar's days are dark tiles with event icons still showing, its filter button and class buttons are flat tiles with the class icons still showing (a button this client lacks is simply absent), and the Legacy talent nodes and side tabs are untouched. The info strip reads in two columns with nothing running together (durability beside free bag slots, gold on its own row, fps beside ammo); its fourth row reads the time and then the day and date beside it (for example "21:04  Tue 13 Oct"; the date moves to the left edge with the clock switched off) with a flat calendar button at its right end; the button's tooltip says Calendar, it lights in your accent under the mouse, and a click opens (and, clicked again, closes) the calendar. With a calendar event a few minutes ahead (create one with a reminder), its reminder line comes up in chat in the system colour when it is due, though the game's calendar button is put away. Have a guildmate invite you to a calendar event: the strip's calendar button shows a small "1" in its corner and its tooltip says "1 invite waiting"; accept or decline it and the count goes. In a fight (hit a training dummy), click the zone name and the calendar button: chat says `The world map doesn't open from Vanguard in a fight. Try again after it.` (and the same for the calendar), nothing opens, and no "Interface action failed because of an AddOn" line or blocked-action error shows; click the quest log's Map button and a quest title in the tracker with Vanguard's quest log off, and the Click casting page's "Open the game's click bindings" button, for the same line and no error.
- Also expect (calendar today and holidays): today's day has a thin accent outline exactly on its cell, not spilling into the next row or out of the grid, and it stays on today after you change month and come back. During a holiday (Hallow's End, say) the day cells show no bat or other holiday border art, only the event icons. A holiday's popup (click "Call to Arms" or a holiday) is a flat panel with no ornate border or picture behind its text, and Vanguard's close button.
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

### 14.5.2a Info strip ammo follows your ranged weapon

- Do: on a hunter, warrior or rogue, equip a bow or gun (ammo in the quiver slot), then a thrown weapon or none; watch the strip's ammo figure. Run `/vg errors`.
- Expect: "ammo N" shows while the weapon needs ammo (red at 0) and is gone when it doesn't (Forever's `C_PaperDollInfo.AmmoNeeded`, unobserved so far); any class whose ranged weapon needs ammo gets it.
- If it fails, paste: what you had equipped, the strip's corner and `/vg errors`.

### 14.5.3 World map, quest panel and queue status insides

- Do: with Vanguard's quest log switched off (under `/vg` → Quests), press `M` for the world map and look at the nav bar above it, the dropdown at the map's top left (floors, in a dungeon or a multi-floor zone), the two small buttons at its top right (tracking filter and tracking pin) and the arrows of the quest panel's toggle; open the quest panel, look at the search box, the gear above it and the quest count box, hover and click quest rows, tick a quest's track box, and look at the lines between quest groups; open a quest's details (also with Vanguard's quest log on: its Map button) and look at the flat background, the Rewards heading, the reward and XP tiles, and the Abandon (red label), Share, Track and Back buttons; open a quest in the pop-out window (right-click its row, or the quest log's pop-out) and look at its text area and Show Map button; open the battlefield map's tab (in a battleground); queue for something and hover the group finder eye to open the queue panel.
- Expect: the crumb labels are light, not gold, and each crumb's small dropdown arrow is still there on a flat button; the floor dropdown is a flat button with its arrow; the tracking filter and pin light the control tile under the mouse, the pin without its gold ring and brown disc; the quest toggle's arrows sit on flat buttons that light under the mouse. The search box is flat and dark with its magnifier, the gear keeps its icon and lights the control tile under the mouse, the count box is flat; a quest row shows a soft white wash under the mouse and no yellow glow, its track box is a flat square with a brass tick while tracked (the tick follows the game's own tracking), its quest-type, storyline and task pictures stay; the rules between groups are one thin line. The Rewards heading is light. The pop-out's text sits on a dark inset and Show Map keeps its map picture with a light label. The battlefield map's tab label is light. The queue panel's lines between entries are one thin line. [Needs in game: where exactly the one-pixel group rule and the queue rule sit against the game's ornate divider space; whether the floor dropdown is among the map's direct children as found; the tracking pin's look without its ring.]
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

- Do: look at the buttons beside the main chat window (stacked down from its tab bar's top: the chat menu, then Quick Join, the voice channel, deafen and mute buttons, and text to speech, each only when this client shows it); scroll the chat up a few lines; hover each button; click the chat menu. Drag a second window out of the dock and look at its minimize box.
- Expect: every one of those buttons sits on a small flat slate tile instead of the game's round art, the stack starting level with the tab bar's top, a tile's width apart, with no gap where a hidden button would be (no voice chat: text to speech follows Quick Join); the chat menu, minimize box and Quick Join show a quiet glyph that turns white on an accent tile under the mouse; the voice and text-to-speech buttons keep their own icon on the tile; scrolled up, a down-arrow glyph on a tile appears at the window's bottom-right, a thin accent-coloured edge round the tile while the game flashes it for a new line below (gone once you are back at the bottom), and a click on it returns to the newest line; the chat menu still opens and the floating window's minimize box still collapses it. [Needs in game: that the stack holds after a Quick Join toast and after the chat menu's Move buttons to the right, which mirrors it to the panel's right edge.]
- If it fails, paste: a screenshot of the chat column and `/vg errors`.

### 14.7.6a Chat typing box channel name

- Do: press Enter to type in chat, then switch channel with `/g` (or `/1` for a numbered channel), and set Chat text size to Small and Large in turn.
- Expect: the channel name before your text (`Guild:`, `1. General:`) is in the same face as the text you type, in the channel's colour; your text still starts clear of it. [Needs in-game check: the header's size against the typed text (both use the chat role's size, not the Chat text size), and that no overlap appears with a long channel name.]
- If it fails, paste: a screenshot of the box and `/vg errors`.

### 14.7.7 Chat bubbles

- Do: with chat bubbles on in the game's options (Options → Interface → Social → Chat Bubbles), say something in /say out in the world, then have a party or raid member or an NPC speak near you; then enter a dungeon and say something there. Afterwards tick Text-only bubbles (reload) under `/vg` → Chat, reload, and say something in the world again.
- Expect: in the world, each speech bubble is a flat, slightly see-through slate panel with no sheen line and no soft shadow (the same flat material as the chat window) instead of the game's rounded white bubble, its text in Vanguard's font, light on the dark panel, and the bubble's tail (the pointer toward the speaker) is gone with the rest of the game's art; with Text-only bubbles on, no panel at all: the text alone floats over the speaker; the bubble appears and goes as before; inside the dungeon the bubbles keep the game's own look (the engine does not let addons touch them there) and `/vg errors` stays empty.
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
- Expect: every tab is a flat dark tile with its text, the selected tab is the only raised one and follows every click, the spellbook's category tabs (the row of icons at its top) are squares whose icons fill them right up to a thin border with no rounded corners, gaps or overhang, the unselected ones greyed, tabs that the game shows later (a new profession, talents after learning them) look the same, and every tab still switches its page.
- If it fails, paste: which window and tab, a screenshot and `/vg errors`.

### 14.8.3 Inside the character pane

- Do: on the Reputation tab look at the list and click a header; on Skills look at a skill and click it; on Currency click a header; on the Character tab scroll the stats; hover a gear slot's flyout arrow (the equipment flyout) and look at the Honor tab.
- Expect: the reputation, skills and currency lists have a thin one-pixel line above and below them (no game ornament); reputation and skill bars sit in a flat dark box with the game's colored fill unchanged, headers are flat buttons with a thin chevron instead of the gold plus/minus (pointing right while folded, down while open) and still open and close, the stat category titles sit in flat boxes, the flyout is a flat panel with item borders in quality colors and thin theme arrows for its page buttons, the honor tab's ring and badge show (only its decoration is dimmed), and each gear slot still shows its durability percent.
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

- Do: press C and click the arrow in the title row to hide the stats half, then click it again. Open Reputation and Skills. Open Currency on a new character that has no currencies, then on one that has some.
- Expect: no wooden or stone backdrop shows behind any tab, and each list sits on a flat dark inset panel. The arrow sits in the title row just left of the close button, level with the title and not over the close button, with a thin chevron like the close button's cross and the same grey tile under the mouse (no gold or blue page-arrow art), pointing left while the stats half shows and right while it is hidden, lighting up under the mouse; it still hides and shows the stats half. The empty currency list says "You have no currencies yet." in grey in its middle; the line is gone when the list has currencies.
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
- Expect: each pane's title is small text in the text colour, not gold, and its gold rule is gone; the list rows lose their wooden or stone plate and their labels read in the text colour (a row the game colours, such as a reputation standing, keeps its colour); each row's icon sits on a flat square slot; the check boxes are Vanguard's, the standing bar is a flat bar and the pane's buttons are flat; a row under the mouse shows the faint theme wash and the reputation you clicked the one selected look (the accent rail), with no rounded grey highlight; a faction you are at war with keeps a red band, square-edged; the stat boxes sit on flat inset panels with a flat title box and no wooden art, and the honor texts read in the text colour. Scrolling a long list or folding a header never leaves a row with the game's plate. [Needs in game: the names of the side-pane and stat-box parts on Forever.]
- If it fails, paste: which pane, a screenshot with a row or two on screen and `/vg errors`.

### 14.8.11 The paper doll's lists, buttons and slots, and the appearances page

- Do: open the character pane (C) on the Character tab. Click the Titles and Equipment Manager buttons under the model, hover and pick a title and a set, then click Equip, Save and New set. Look at each gear slot (the ammo slot too, as a hunter), and at your level line over the model (a hunter with a pet: the pet's page too). Click a gear slot with several items to open the flyout and its page arrows. Then open the collections window (Shift+P), go to Appearances, use the search box, the filter and class dropdowns (and the weapon dropdown on a weapon slot), turn the pages, and open the Sets tab, pick a set and its variant dropdown.
- Expect: the titles and sets lists sit on flat dark inset panels with no bronze edge, stripe or card plate; titles and set names read in the same light text as the rest of the window; hover washes a row and the picked title or set shows the one selected look (a thin accent rail and a faint fill) instead of the game's own highlight or card art, and it moves when you pick another or scroll the list; a set with items missing keeps its red name; Equip, Save and New set are flat buttons with the plus beside New set; the pet's experience bar is a flat box with its green fill; the level line is small light text; the gear slots show a flat square with the item's quality border and no bronze frame. The appearances search box and dropdowns are flat with their arrow and magnifier, the page arrows (there and on the flyout) are flat buttons with their arrow pictures, and the sets list has no row plate (the set's name keeps its gold, green or grey), its picked set shows the same accent rail and its progress line stays, nor the plate behind the set's icons. Everything still works as before. [Needs in game: the real names of all these parts on Forever; whether a recycled title, set or sets-list row ever shows a stale rail, plate or name colour after scrolling, picking another row or after you gain or lose an item; whether the sets list's rail follows a variant pick.]
- If it fails, paste: a screenshot of the character pane with each list open, one of the appearances page and Sets tab, and `/vg errors`.

### 14.8.12 Statistics and the group headers inside lists

- Do: press C and click the Statistics tab (the last side tab). Fold and open Character, Player vs. Player and Combat, then open and fold Wealth and Battlegrounds; hover a few lines. Then click the Reputation tab and fold and open a group with its own standing (a sub-header such as Steamwheedle Cartel's members, where the client has one).
- Expect: the Statistics list sits on the same flat inset panel as Reputation, with thin one-pixel lines above and below. Character, Player vs. Player and Combat are flat dark buttons with light text (no brown and gold bar) and a thin chevron on the right instead of the gold minus, pointing down while open and right while folded. Wealth, Consumables, Battlegrounds and the other smaller groups have a thin chevron on the left instead of the red plus and minus squares, turning with each click. A line under the mouse gets the faint square theme wash, not a rounded grey highlight. Folding and opening still work. [Needs in game: the statistics list's frame names on Forever (StatisticsFrame from Blizzard_Statistics), and that the chevron follows a fold done by clicking the group's name as well as its button.]
- If it fails, paste: a screenshot of the Statistics tab with one group open and `/vg errors`.

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

### 14.10a A drag still held as a fight starts

- Do: open the collections window (Shift+P), start dragging it by its title bar and keep the mouse button down while a mob attacks you (or you attack a training dummy). Let go during the fight, then leave combat and open the window again. Repeat with the calendar, dragged by the empty strip along its top edge.
- Expect: as the fight starts the window stops following the mouse and stays where it was; nothing sticks to the mouse after you let go; it opens at that spot after the fight. No "Interface action failed because of an AddOn" message, and `/vg errors` is empty. [Needs in-game check: the harness models StartMoving and StopMovingOrSizing as protected on a window that holds secure buttons, from Forever's API docs.]
- If it fails, paste: the window's name, where it ended up, and `/vg errors`.

### 14.10b Reset moved windows, and five more windows to drag

- Do: open the character pane and the mailbox, open a letter, and drag the pane and the letter away. `/vg` → Game windows → **Reset window positions** with both still open. Drag them away again, start a fight, click Reset, and leave combat. Then open the clock (the strip's time, or the minimap clock), chat channels (`/chatconfig` → Channels, or the social window's Chat Channels), Options → Game settings (Escape → Options), chat settings (right-click a chat tab → Settings) and guild control (guild window → Guild Control, if you can), and drag each.
- Expect: Reset puts the open character pane where the game opens it and the letter back beside the mailbox at once, with no `/reload`. In the fight the chat says "Moved windows go back once the fight ends." and nothing moves; after the fight both go back, with no `/vg errors`. The clock and chat channels drag by their title bar; game settings, chat settings and guild control drag by an empty spot along their top edge, and every button, tab and box in all five still takes its click. After a Reset, open and close the collections window and the spellbook in a fight: no "blocked" message. [Needs in game: the letter's spot after Reset, that no button in the five new windows lost its click, and that Reset's call to the game's window layout leaves no blocked action later.]
- If it fails, paste: which window, a screenshot after Reset, and `/vg errors`.

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

### 14.14.4a A popup's height

- Do: open a few popups of different sizes (delete an item from your bags, leave a group, abandon a quest, one with a text box such as renaming a guild rank).
- Expect: the space under a popup's buttons is about the same as the space above its text; there is no empty band of panel under the buttons. Popups that the game gives a fixed height are unchanged.
- If it fails, paste: a screenshot of the popup and `/vg frame StaticPopup1`.

### 14.14.4b Danger popups

- Do: delete a grey item from your bags (drag it out and confirm), then delete a green or better one (the popup that asks you to type DELETE): look at the confirm button before typing, after typing DELETE, and with the mouse on and off it. Then abandon a quest, and open an ordinary popup (leave a group, or `/camp`) right after.
- Expect: on each delete and abandon popup the confirm button's label (Yes, Okay, Accept) is red, the danger colour of Vanguard's own Abandon button, and stays red under the mouse and after you type DELETE (before typing it is the game's grey disabled label); the leave-group or camp popup that follows on the same spot has the game's gold label again, gold under the mouse too. [Needs in game: that the game's hover and enable changes run before the hooks that paint the red back, so it never flashes gold; if it flashes, say so.]
- If it fails, paste: a screenshot of the popup and `/vg errors`.

### 14.14.5 Roll windows, dressing room, books and the game menu header

- Do: roll on an item in a group (or loot with a friend), and look at the roll window. Open the dressing room (Ctrl-click an item), open the outfit dropdown and the details toggle. Read a book or a letter and turn a page; read a timed book if you know one. Press Escape and look at the top of the game menu.
- Expect: the roll window has Need, Greed, Pass (and Transmog when offered) on the same small tiles as the window controls elsewhere, with their dice and coin icons; its countdown is a flat bar on a dark track that runs down; the item icon is a square with a thin border and no game ring, the item name keeps its colour. The dressing room's model sits on a flat darker panel; Close, Reset and Link are themed buttons, the outfit dropdown keeps its arrow, and the side panels that open beside it are flat. The book's page area is a flat darker panel with the page arrows as flat tiles and the page count small; a timed book's bar is flat. The game menu has no gold plate behind its title; its title is still readable and inside the panel.
- If it fails, paste: a screenshot of the window and `/vg errors`.

### 14.14.6 Time manager

- Do: click the clock on the minimap (or the info strip's clock) to open the time manager. Tick and untick Alarm enabled, 24-hour mode and Local time; open the hour, minute and AM/PM dropdowns; click in the alarm message box and type; tick the stopwatch switch to open the stopwatch.
- Expect: the three check boxes are flat squares with an accent tick; the dropdowns are flat buttons that keep their arrows; the message box is a flat dark box; the captions (Alarm time, Alarm message, Show stopwatch) and the window's title are light, not gold; the stopwatch switch keeps its clock icon on a small tile; the globe at the window's top left still shows; the stopwatch's title is light text. With the info strip's time on (the default, which puts the minimap clock away), a click on the strip's time opens and closes the clock window; set an alarm a minute ahead, and a click on the time while it rings turns it off. Untick 24-hour mode: within a second the strip's time reads as the game's clock does (for example "9:04 PM"); tick Local time on and off and it follows. Hover the strip's time: its tooltip lists Realm time and Local time, and "Click: the game's clock and alarm".
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
- Expect: no bronze header plate, wooden frame or parchment, and the title and points ("Achievement Points 1,234" and the small shield) on one line inside the window's top edge, level with the close button, not above the window: the category list, the achievements, the statistics, the summary and the comparison each sit on a flat dark panel with no gold border; an achievement card has no parchment or border (its icon, shield and the +/- mark stay) and its description is light even when completed (if completed descriptions or criteria text are black, paste a screenshot); the category you pick shows the selected look; Track is a flat check box; Back, the filter and the search box are flat; the search preview is a small dark panel; the summary's two headings are small grey capitals over flat bars filled in a dim accent (a darker brass by default, not bright green), each bar's name and count in light text centred on the bar, not riding its top edge; the full results are a framed panel with a themed title and a close button.
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
- Expect: the next pick is bought and applied (the game's Apply Changes is not needed), chat says what was spent, and the window repaints; the export box shows a VG1:talents string, clear asks first (No, and a Clear button with a red label; the question names the planned points and says it can't be undone) and Clear empties the plan, import brings it back with its point count in chat. At the level-up (a second later, out of combat) chat says how many points wait and the next pick; with "Spend planned points by itself" ticked under `/vg` → Talents it buys them instead.
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

### 14.9.2a A price changed after the game asks to confirm

- Do: on Posting, drop an item the game asks you to confirm (a price far from what it usually sells for), click Post so it reads Confirm, then type a different price in Price (or click a listing on Up now, or pick another auction length) before clicking again.
- Expect: as soon as you change the price or length, Confirm reads Post again and the guide says "Click Post to list stack 1 of 1."; the next click says "Post: sending stack 1 of 1 (... at <the new price> each, ...)" and the item goes up at the new price (the game may ask to confirm again). It never lists at the price you had before the change. [Needs in-game check: that the game takes a second Post after a confirm it was never sent.]
- If it fails, paste: every chat line starting "Post:", the auction's price on the game's Auctions tab, and `/vg errors`.

### 15.6 Legacy probe and perk plan (planner off until switched on)

- Do: type `/vg legacy probe` before opening the Legacy window, open it (the Legacy button on the menu bar), click each of its three tabs, and type `/vg legacy probe` again. Under Town and gear tick "Legacy perk planner", then type `/vg legacy plan add 3 Test perk`, `/vg legacy plan add 14 Other perk`, `/vg legacy plan`, `/vg legacy plan remove test perk`, `/vg legacy plan clear`. Paste the second probe's whole output.
- Expect: the first probe says LegacySystemFrame is not loaded; the second lists TreePage, ChallengesPage and RewardTrackPage with their keys, a "perk panel" line with ids and a node count (or "not found on TreePage"), and the globals with Legacy in the name. The plan lines say "Planned.", then that 17 points is over the tree's 16, then list "3  Test perk" and "3 of 16 points planned.", then "Perk dropped." and "Legacy plan cleared." [Needs in game: everything the probe prints; it is the data source the challenge tracker waits on.]
- If it fails, paste: the probe's output and `/vg errors`.

### 15.6a Chat filter (off until switched on)

- Do: `/vg filter on`, then wait for (or say in a test channel) a Trade line that sells gold with a web address, one that sells a boost, a guild recruiting line, and the same line twice in a minute. Type `/vg filter add test word` and say a line holding it. Open the Filtered tab, click the web address in the gold line, then click a sender's name. Type `/vg filter hide`, then `/vg filter tab`, then `/vg errors`. Walk into a dungeon and read Trade.
- Expect: a Filtered chat tab appears, and the caught lines are in it, each starting with why ("Gold selling", "Boosting", "Recruiting", "Your word", "Repeat"), none in the main chat; the tab's name counts them, "Filtered (4)". The web address is an accent link that opens the copy box, as it does in the main chat. Clicking a sender's name says their lines show in chat again, and their next line stays in the main chat. With hide, caught lines show nowhere. Normal Trade lines, your own lines, whispers and guild chat are never caught. `/vg errors` is empty; in the dungeon nothing errors and chat passes through. The tab looks like the other chat tabs on both rounded and square corners, and is still there, with its count starting over, after `/reload`. [Needs in game: that the client lets an addon open a chat window (`FCF_OpenNewWindow`) and name it, that a click on the sender's link reaches Vanguard, that the game hands the chat filter the line with the web-address link already in it, and that the tab text keeps the count.]
- If it fails, paste: `/vg errors`, one line it caught or missed, and what the Filtered tab shows.

### 15.6b Chat history (off until switched on)

- Do: `/vg history on`, say a few lines in /say and have a group or guild line arrive, let someone whisper you (or whisper an alt), then type `/reload`. Type `/vg history`, then `/vg history whispers`, whisper again, `/reload`. Then `/vg history clear`, click No, `/vg history clear` again, click Clear, and `/reload`. Last, with it on, log out and in; open `/vg` → Chat and set Lines kept to 100.
- Expect: after the reload each window shows a grey dash rule reading `—— Chat from your last session (N lines, until ...) ——`, its earlier lines in the colours they had (say white, guild green, party blue), then a grey `—— End of the earlier chat ——` rule (the dashes join into a line in the addon's font; the game's font shows them as dashes); your whisper is not among them the first time, and is the second time; a tab you had set up for another channel gets its own lines back, not the main window's. `/vg history` says it is on and how many lines are saved in how many windows. Clear asks first (No, and a Clear button with a red label; the question names the saved lines and windows and says it can't be undone), and No keeps everything. After Clear and a reload nothing comes back and chat says `Saved chat history cleared.` `/vg errors` is empty. In a dungeon or raid boss fight, chat the game hides is not kept. [Needs in game: that a hook on each ChatFrame's AddMessage sees the finished line and its colour, that whispers carry `:WHISPER:` in their player link (the other way the addon tells), that `date` and `time` work as in the client, and that AddMessage keeps the colours.]
- If it fails, paste: `/vg errors`, `/vg history`, a screenshot of the restored chat and which window it was in.

### 15.6c Chat windows

- Do: open `/vg` → Chat. Drag the Width and Height sliders under Chat windows for the General tab, then `/reload`. With General selected, tick Lock chat windows, click another docked tab (Combat Log) and try to drag it out, untick it. Pull a tab out into its own window, tick Move floating windows with /vg unlock, `/reload`, then `/vg unlock` and drag its handle.
- Expect: the window resizes live and keeps its size after the reload; locked windows do not drag, the docked tab that was hidden when you ticked it too; the floating window has a `Chat: <name>` handle and stays where you put it, also after a layout change. `/vg errors` is empty. [Needs in game: that FCF_SetLocked and FCF_SavePositionAndDimensions exist and keep the size, that GetChatWindowInfo returns locked and docked as 8th and 9th values, and that a docked tab is not offered as a handle.]
- If it fails, paste: `/vg errors` and what the window did.

### 15.6d Chat while the game hides it (instanced fights)

- Do: with Chat extras links on (the default) and the Chat filter on, join a group in an encounter, a Mythic+ key or a rated battleground and let party or raid chat run during the fight. Type `/vg errors` after it.
- Expect: every group chat line appears in its window for the whole fight, and no error popup appears. Lines the game hides from addons show as the game gives them (no link on a web address in them, not shortened, not in the Filtered tab). `/vg errors` has no `chat filter` or `chat filter links` line. [Needs in game: whether comparing a hidden chat line raised before this change; the early return makes the question moot, but the fight is the proof.]
- If it fails, paste: `/vg errors` and which chat event went quiet.

### 15.6e Chat tabs

- Do: `/vg` → Chat → Chat tabs. Click New chat tab, type `Loot`, Make. With Loot picked, tick Show Loot and untick Show Say; loot something and say something. Click Rename this tab, type `Drops`. Pick General, try Close this tab. Click General in the chat so Drops is hidden, reopen the page and pick Drops from the Tab choice, then Close this tab. Do the same in combat, making two new tabs in the one fight, then closing both in another.
- Expect: a new tab appears and is picked; it shows loot and not say; the rename shows on the tab; closing General does nothing and says so in chat; Drops is in the Tab choice while General's tab is the one shown, and closes; in combat a new tab or close waits until the fight ends, both tabs made in one fight appear, and both closed in one fight close. `/vg errors` is empty. [Needs in game: FCF_OpenNewWindow, FCF_SetWindowName, FCF_Close, ChatFrame_AddMessageGroup / RemoveMessageGroup / ContainsMessageGroup behave as used, and the group names (SAY, YELL, GUILD, PARTY, RAID, WHISPER, LOOT, SYSTEM) match.]
- If it fails, paste: `/vg errors` and what the tab did.

### 15.6f Chat search

- Do: say a few lines with the same word in /say and have a link or two appear in chat. Click Find in the chat's tab bar (left of Copy), type the word in the field at the top of the box, press Enter; type another word in the same field and click Find; search for a word said only in another docked tab (Loot or Trade) while General is the tab shown. Then `/vg` → Chat → Find in chat and search for a word that was only in the chat before your last `/reload` (with Chat history on). On the same page untick Find button in the chat's tab bar, look at the tab bar, tick it again; under Chat extras do the same with Copy button in the chat's tab bar. Then drag the find box aside and click Copy; drag the copy box and click Find.
- Expect: the find box opens titled Find in chat with the word field at its top and a Find button at the field's right end; after Enter the title says `Chat: N lines with "word"` and the matching lines list under the field as plain text (links show as their words) with every match in your accent colour; the second word searches again in the same box, a line from a docked tab you are not looking at is found too, and Close or Escape shuts it. An empty search says `Type something to find.` in chat and leaves the last lines. Each button goes from the tab bar as its switch is unticked and comes back when ticked, with no reload. `/vg errors` is empty. [Needs in game: that the Find button sits clear of Copy in the tab row, that GetNumMessages/GetMessageInfo return every line the window holds, that the edit box under the field draws the accent colour codes as colour (Ctrl+C from it carries the codes), and that hiding Copy leaves Find and the tab dock where they are (they anchor to it) rather than a gap worth closing.] Only one box shows at a time: each click closes the other and opens in its spot, with one title and one Close. [Needs in game: that a dragged box hands its spot over.]
- If it fails, paste: `/vg errors` and a screenshot of the tab row.

### 15.6g Chat tab look and frame

- Do: look at the chat window's frame; then with two chat tabs, click between them; have a friend whisper or say something into the tab you are not looking at, then `/vg accent` another colour. Press Enter, type `/g ` then `/s `, then Escape. Open the chat menu (the top side button), make a New window and dock it; set the game's whispers to open in a new tab and have someone whisper you. Click the Combat Log tab, then drag it out of the dock and back in; then `/reload`.
- Expect: one rounded panel round the text, the scroll bar and the tab bar on its top band, with a one-pixel rule under the bar: the tabs are 20 tall, rounded and centred in the bar, their names centred, drawn over the panel at full strength with the mouse away (no fade, not dimmed under it, none sitting above the bar), and the Find (magnifier) and Copy (two sheets) tiles sit at the bar's right end, 20 x 20 like the side buttons' tiles and 48 units wide together, not over any tab, each naming itself under the mouse and turning white on a lit tile. The new window's tab joins the row at the same height and look, so does the whisper's tab (its window has the same panel, font and edit box), and after the reload every tab is still in the row. The Combat Log shows the same panel, bar and rule as General with its tab in the same row, and its filter buttons sit in a darker band under the rule, two units in from the panel's edges, with no box of its own; pulled out of the dock, the band sits under the log's own bar, and back in the dock it lines up again. The shown tab is raised with a thin lighter line along its top edge; the other is just its name on the bar (no box or border of its own) with a soft hover; a tab with new lines flashes in the accent colour (at the game's own pace), and the flash follows the accent. The typing box sits a small gap under the panel, as tall as the tab bar and as wide as the panel, faint until Enter brings it to full in a blink, with a thin rail down its left edge that turns guild green on `/g ` and say white on `/s `, the "Guild:" header in the same colour, and Escape drops it back to faint at once. [Needs in game: that the game does not move the typing box back to its own spot (ChatFrameUtil re-anchoring on a window resize), that its focus art does not show a second border round the panel's, that the glow tint holds while the game animates it, that the docked tabs sit centred in the bar with their names centred and spare tabs go to the game's overflow menu rather than under Find and Copy, that a window dragged out of the dock gets its tab on its own bar, that the whisper window is ChatFrame11 or later and listed in CHAT_FRAMES when FCF_OpenTemporaryWindow returns, that the panel's arcs meet the rule and the border cleanly at every UI scale, that the Combat Log's dock update (which the panel follows) runs as the log loads and when it docks or undocks, that its filter arrow button (28 tall on the 24 band) sits well in the band, and that the band's right end over the scroll column clears the scroll bar.]
- If it fails, paste: `/vg errors` and a screenshot of the tab row.

### 15.6h Chat extras: short channel names and the wheel

- Do: with a fresh profile (or Reset this page on Chat), have lines arrive in Trade, General and guild chat, and click a short channel tag. Untick Short channel names under Chat extras and let another line arrive. With forty or more lines in the window, roll the wheel up one tick, then with Ctrl held, then down the same way.
- Expect: `[2. Trade - City]` shows as `[2]`, `[1. General - Elwynn Forest]` as `[1]` and `[Guild]` as `[G]`, each in the channel's own colour with the rest of the line untouched; clicking the short tag still opens the channel. Unticked, the next line shows the game's full channel name. One plain tick moves four lines (count them against a fixed line), Ctrl goes to the oldest line, and each the other way down (to the newest). `/vg errors` is empty. [Needs in game: that the window's TransformMessages rewrites the line the AddMessage hook just saw, on the Forever client too; that the game's wheel handler moves three lines a tick (ScrollUtil's), so a plain tick is four lines and not more.]
- If it fails, paste: `/vg errors` and one line as it shows, or how many lines a tick moved.

### 15.6i Chat extras: Copy on another tab, and bare and guild links

- Do: with a second docked tab (Trade, say) that has lines, click it and press the Copy tile, then Ctrl+C and paste into the chat box. Have a guild message of the day that holds an address ("discord.gg/abc") and `/reload`. Say "join discord.gg/abc, and see [an item link]" with a real item link, and "lvl 1.5 e.g. test".
- Expect: the copy box is titled "Copy Trade (Ctrl+C)", holds that tab's lines (not General's), and opens scrolled to the newest line with all of it selected, so the paste holds every line. The guild message of the day shows "discord.gg/abc" as an accent link; in the said line "discord.gg/abc" is a link with the comma after it plain, the item link still shows its tooltip on click, and "1.5" and "e.g." stay plain. Clicking either address opens it in the copy box. `/vg errors` is empty. [Needs in game: that SetCursorPosition then HighlightText keeps the whole text selected and the box scrolled to the end on the Forever client; that the game adds the message of the day through the window's AddMessage with GUILD_MOTD_TEMPLATE's text.]
- If it fails, paste: `/vg errors` and a screenshot of the copy box or the line.

### 15.6j Chat page order and the Chat filter card

- Do: open `/vg` → Chat and scroll the page. Switch the Chat filter on and stand in a capital city until some Trade spam is caught; open the Filtered tab and click one sender's name; open the Chat page again and press **Filter them again**. Set Caught lines to Are hidden and look at the card.
- Expect: the cards run Chat, Chat tabs, Chat extras (Copy, Find in chat and the Find switch together), Chat watch, Chat filter, Chat history, Chat windows, then Group board, each looking as before. With no phrases or words, Chat watch and Chat filter say so. The filter card reads "Caught this session: N (Gold selling …, Repeat …)"; after the click it lists "Let through: Name", and Filter them again says "Every sender is filtered again." in chat and that sender's next spam goes to the tab. Hidden: the card says the Filtered tab is where lines can be seen and let through. A guild post such as "pays gold for herbs, discord.gg/xyz" is not caught. The Filtered tab (made fresh: close it first if you have one) holds only caught lines, never live Trade or Say. `/vg errors` is empty. [Needs in game: that FCF_OpenNewWindow's second argument leaves the new tab with no message groups or channels on Forever, now that Vanguard no longer removes them itself.]
- If it fails, paste: `/vg errors` and a screenshot of the Chat filter card.

### 15.6k Officer and Emotes on a chat tab

- Do: on a tab other than General, tick Show Officer and Show Emotes under Chat → Chat tabs (have an officer line and a `/wave` arrive). Then, with no reload, enter a dungeon and pull a few packs while chat lines arrive.
- Expect: officer lines and emotes show on that tab; untick them and they stop. No Lua error from the game's chat code in the dungeon, and `/vg errors` is empty. [Needs in game: that adding the OFFICER and EMOTE message groups from Vanguard's rows taints nothing the game reads in an instance, as the eight existing rows don't.]
- If it fails, paste: `/vg errors` and any Lua error text.

### 15.6l Chat watch: all the words, marked, and held in a fight

- Do: under Chat → Chat watch, add the phrase "lfm brd". Wait for (or have a friend say in a watched channel) "LFM tank for BRD", then a long line that ends with BRD and LFM. Then start a fight with a mob and, during it, have the line said again; finish the fight.
- Expect: both lines ring and toast (the words in any order). On the toast the line is plain text with LFM and BRD in the accent colour; the long one starts at "…" a few words before the first of them. During the fight no sound and no toast (the chat line still shows); when it ends, one sound and one toast for the newest line. Adding a phrase with a | in it says it can't. [Needs in game: that the word-start match (Lua's %f frontier) behaves the same in the client.]
- If it fails, paste: a screenshot of the toast and `/vg errors`.

## 16. Realm and ruleset

### 16.0 Data from the beta

- Do: after launch, log in and read the chat line "Still saved from the beta: ..."; then open /vg > Town and gear, go to the bottom "Data from the beta" card and press "Clear data from before launch...", answer No, then press it again and answer Yes. `/vg launch` lists what is left.
- Expect: the line appears once per account (not on later logins) and only when prices, sales or characters stamped before 4 November 2026 15:00 PST are saved. The button is greyed before launch. No clears first; Yes removes only the beta-era prices, sales and characters (what you saw after launch stays) and the Deals list no longer compares against beta prices. [Needs in game: that the beta and live game share the saved file at all, and which of them wrote the old entries.]
- If it fails, paste: `/vg launch` and `/vg errors`.

### 16.1 Realm, ruleset and names

- Do: type `/vg realm` on two characters, in two rulesets if you have them (one Hardcore, if you can), and again after switching the Classic or Modern experience preset if the game lets you (a chat line says when that moves the data key). [Needs in game: that the preset call answers, and whether switching it changes any other line.] On one of them, have a friend on another realm or ruleset say a Chat watch phrase in a channel.
- Expect: five lines: `Realm: <name> (as in names: <name without spaces>)`, `Ruleset: ...` (a season or `hardcore` where the game names one, else `none named by the client`), `Rules: preset Classic or Modern · self-found ... · game mode N` (what the game's `C_GameRules` says; the preset does not join the data key until you have pasted this on the beta and launch builds), `Side: ... Data key: ...`, and `Your name in chat: ...`. The toast shows your friend's name with their realm, and a click whispers them. Characters and auction prices from before still show on tooltips.
- If it fails, paste: all five lines from both characters, and how your friend's name appeared in chat.

## 17. Situations

### 17.1 The editing banner and settings an override can't hold

- Do: type `/vg situation record raid`, then `/vg` and `/vg unlock`. Look above the options window and at the top center of the screen. On the Nameplates page point at "Cast bar", then at "Threat colors while you have aggro". Click **Stop and save** on either banner. Then record again, `/vg unlock`, and pull a mob (or `/vg lock`).
- Expect: while recording, a strip with an accent border sits along the top edge of the options window and another at the top center of the screen (while the frames are unlocked), each reading "Editing as: Raid · changes apply only in Raid" with a **Stop and save** button. "Cast bar" is dimmed and its tooltip says "Not recorded for Raid: this setting changes your base profile."; "Threat colors while you have aggro" is not dimmed and has no tooltip. Stop and save ends the recording: chat says what was kept ("Raid: ... saved."), both strips go, and your own layout is back. Entering combat (or locking) removes the screen strip. The Situations page lists what an override can hold, under "What an override holds". [Needs in game: that the strips sit clear of the window's header and the handles, and that the tooltip shows.]
- If it fails, paste: a screenshot of the window and of the screen top, and `/vg errors`.

## 18. Other addons, quest guidance and the group board

### 18.1 Other addons

- Do: install one bag addon you use (Bagnon, AdiBags, ArkInventory, BetterBags or Baganator; or ElvUI or Tukui, which ask about the action bars, or Auctionator or TradeSkillMaster, which ask about the Auction helper) beside Vanguard and log in. Open `/vg` → Modules. Click **Keep both**, `/reload`, and open Modules again. Then type `/dump C_AddOns.GetAddOnInfo("<the addon>")` and note the folder name it prints.
- Expect: one chat line at login, `<addon> also does bags. Choose which one does under /vg > Modules (nothing changes until you do).`; an **Other addons** card at the top of the Modules page with **Turn off Bags** and **Keep both**; after Keep both, no card and no chat line. The folder name matches the one Vanguard looks for (`Modules/Coexist.lua`, `CX.OVERLAPS`); a different name is a finding.
- Also, if EllesmereUI is on Forever: run `/dump C_AddOns.GetNumAddOns()` and list its folders (`/dump C_AddOns.GetAddOnInfo(i)` for each) and paste the ones starting with Ellesmere. Vanguard looks for `EllesmereUIUnitFrames`, `EllesmereUIActionBars`, `EllesmereUINameplates` and `EllesmereUIRaidFrames` (retail names, unconfirmed on Forever); a different name is a finding.
- If it fails, paste: the folder name, a screenshot of the Modules page and `/vg errors`.

### 18.1a Other addons you pair with Vanguard

- Do: install one Forever add-on people pair with Vanguard (Platynator or BlizzMove is enough; Aurora or Forevermore Classic UI if you have a window skinner) and log in. Open `/vg` → Modules, click **Turn off …** on its row, take the reload, then open Modules again and click **Turn … back on**.
- Expect: the card's button names what it turns off (**Turn off Nameplates** for Platynator; **Turn off Vanguard's window moving** for BlizzMove, **Turn off Vanguard's window looks** for a skinner); the reload comes up; after it the card still shows the addon with **Turn … back on**, and that button puts it back (with another reload). With a window skinner, after the reload only one skin shows on the character window, popups and menus, and the windows still drag and show durability. With BlizzMove, only BlizzMove moves windows (no snap-back). `/dump C_AddOns.IsAddOnLoaded("<folder>")` prints true for the folder name Vanguard looks for; false is a finding. [Needs in game.]
- If it fails, paste: the addon's folder name, a screenshot of the Modules page before and after the reload, and `/vg errors`.

### 18.2 Group board

- Do: in a capital city, type `/vg lfg` and leave it open for a few minutes while people post in Trade and LookingForGroup. Hover a row, then click one. Do not press Enter unless you want to send it. Then click the filter button twice and switch **Only dungeons for my level** off and on. Finally post `LFM SFK need heals` yourself in a channel.
- Expect: the board has a title with its count, a close button at the top right, and Escape closes it; rows appear as people post, newest first, each with a faint wash under the mouse and LFM or LFG, a dungeon and its range (or "Any dungeon"), the roles named, the sender's name without its realm or ruleset part and the age; the tooltip shows the whole line and the full name. The click opens the chat box with `/w <full name> Hi! ...` filled in and sends nothing. Your own post does not appear. The whisper reaches the player when you send it (a two-part name that fails is a finding). Inside a dungeon nothing new appears and `/vg errors` stays empty.
- If it fails, paste: a screenshot of the board and the chat box, the line that was misread, and `/vg errors`.
- Do also: on a healer whose role was never picked, open `/vg` → Chat → Group board and read **Your role, for the whisper** (it should read **Automatic**); then on the board click the filter button until it reads **Needs my role**, and click an LFM row with the healer role assigned in a group and with none. Every post should be listed, the LFM posts asking for heals (or naming no role) first, newest first, and the rest below them in grey; the whisper should say `(Healer)` with the healer role and `(DPS)` with none, and `/vg errors` stay empty. [Needs in-game check: all of it.]

### 18.3 Quest guidance

- Do: talk to a quest giver with a quest you don't have, then type `/vg questdata`. Type `/vg questdata <id>` for one quest you know is new in WoW Forever and one you know is from 2004. Open the world map on a zone with quests you haven't taken; hover a "!" pin and click it. Shift-click a quest in Vanguard's tracker. Under `/vg` → Quests → Finding your way set Shift-click points to "A map waypoint" and Shift-click again.
- Expect: the first chat line says `New-quest flag: none on this client (...)` or names one; the lines for the two quests differ in some field (that field is the flag to use; a New mark on the new quest means Vanguard found it). Pins sit on quest givers, or Vanguard draws none because the game's own map shows its quest offers there (either is fine; two "!" on one spot is a finding). The click puts a waypoint there and the game's arrow points at it. Shift-click says `Arrow: <quest>.` and the game's arrow follows the quest; with the waypoint setting the arrow points at its next waypoint or objective area. When the game gives a next step, the tracker shows it in the accent above the objectives.
- Also expect (the Quests page): `/vg` → Quests shows its cards in this order: Quest windows, Quest tracker, Finding your way (the arrow, Shift-click points, the step line, quest-start pins, the New mark and quest spots on the minimap, under one note), Quest history, Automation; Shift-click points offers "The game's quest marker" and "A map waypoint".
- Also expect (pin tooltips): hover a quest-start pin: under its name, `Level 24` in the quest's difficulty colour, and `Repeatable` for a quest that repeats. [Needs in game: that `C_QuestLog.GetQuestDifficultyLevel` and `IsRepeatableQuest` answer for a quest you haven't taken.]
- Also expect (pin size): open the world map windowed, then maximized, then scroll-zoom into a zone: the quest-start `!` pins stay the same small size and stay on their spots at every zoom, and a pin's tooltip and click still work. [Needs in game: that the canvas's scale is what `GetCanvasScale` reports and that the pin's offset keeps its spot (if a pin drifts when zoomed, the offset scaling is wrong).]
- If it fails, paste: the whole `/vg questdata` output for both quests, a screenshot of the map and the tracker, and `/vg errors`.

### 18.4 /way and the floating waypoint pin

- Do: type `/way 45 61`, then open the world map and supertrack a quest (click its pin or its entry in the quest panel), then `/way clear`. In a group, let the game track a party member (the group finder's "track" on their frame, where offered); on a corpse run, look at the pin while you are a ghost. Then untick **Vanguard's pin and font on the game's floating waypoint pin** under `/vg` → Map, `/reload`, and `/way 45 61` again.
- Expect: the floating marker in the world is Vanguard's teardrop pin in your accent colour, the distance under it (`12 yds`) in the theme's outlined font, and it still fades as you look away from it and when you reach the spot; a supertracked quest shows the same pin. A party member's portrait and the ghost's tombstone are the game's own, untinted. With the switch off, the game's own pin art and gold text come back. [Needs in game: the pin's size against the game's, its look after `/way` and on a supertracked quest, and that the game's `SuperTrackedFrame` is present on Forever.]
- If it fails, paste: a screenshot of the pin, which step broke, and `/vg errors`.

### 18.4a Ctrl-click waypoint, Clear button and recent waypoints

- Do: open the world map, hold Ctrl and click a spot; then click another spot, then press **Clear waypoint** on the map's bottom edge. Open `/vg` → Map → Waypoints and Recent waypoints; press a "Go to ..." button. Type `/way recent` and `/way recent 2`. Untick "Point the arrow at a waypoint you Ctrl-click on the map" and Ctrl-click again.
- Expect: with the switch on, the floating pin and its distance appear at once after each Ctrl-click; the Clear waypoint button shows only while a waypoint exists and removes it and the pin; the Map page lists up to eight spots, newest first, and each button puts that spot back with the pin; `/way recent` prints the same list; with the switch off the click only drops the map pin and the arrow stays off. [Needs in game: that the event is `USER_WAYPOINT_UPDATED`, that `C_Map.GetUserWaypoint` returns the position on Forever, and the Clear button's place on the map.]
- Also expect (titles): type `/way 42 65 Inn`, then open `/vg` → Map → Waypoints: the first button reads `Go to Inn · <zone> 42.0, 65.0` and `/way recent` prints `1. Inn · <zone> 42.0, 65.0`; Ctrl-click the same spot on the map and the title stays. The card says `Shift-click the pin on the map to share it.`: Shift-click the map pin with chat open and the game puts a link in chat.
- If it fails, paste: which step broke and `/vg errors`.

### 18.4b With OpenMap installed

- Do: install OpenMap from CurseForge, `/reload`, and open the world map. Zoom out to the continent and back in. Ctrl-click a spot. Open `/vg` → Map. Then turn OpenMap off in the AddOns list, `/reload`, and open the map again.
- Expect: with OpenMap on, the map's frame still has Vanguard's look; the line along the bottom shows only "You x, y" (no Cursor part); Vanguard's gold "!" quest-start pins don't show; Ctrl-click still drops a waypoint and the Clear waypoint button still works; the Map page ends with an OpenMap card that credits its author ("OpenMap is by jiforever …") and says OpenMap is drawing the map. With OpenMap off, the Cursor part and the pins come back, and the card keeps only the credit line. [Needs in game: that OpenMap's folder name is `OpenMap`, that Vanguard's frame skin and Clear waypoint button sit well beside OpenMap's own controls, whether OpenMap's login warning about other map addons names Vanguard, what OpenMap does on a Ctrl-click, and that `/dump C_AddOns.GetAddOnMetadata("OpenMap", "Author")` names the author the card credits.]
- If it fails, paste: a screenshot of the map, which step broke, and `/vg errors`.

### 18.5 Levelling guide probe (LG-0)

- Do: with at least one quest in your log, stand in a town and type `/vg guide probe`. Type it again in combat, and once inside a dungeon if you can. Turn in one quest, then type it again.
- Expect: a line per read: `present, <number or flag>`, `present, hidden` for a value the client hides, `present, not called (no quest)` with an empty log, or `missing`; a table reads `table of N` and a map position `position plain`. After the turn-in the `QUEST_TURNED_IN` line says `first arguments number, number` (or names the type it is); `QUEST_ACCEPTED` the same after you accept one. Nothing else on screen changes.
- If it fails, paste: the whole `/vg guide probe` output from each place, which lines say `hidden` or `missing`, and `/vg errors`.

## 19. Roll tracker

### 19.0a Pet stable

- Do: on a hunter with a pet out and one stabled, open `/vg` → Town and gear → Pet stable and click List my pets in chat (or type `/vg pets`); then talk to a stable master. Run `/vg errors`.
- Expect: `/vg pets` prints "Your pets:" and a line per pet, such as "Rex, level 12 Cat · Loyal · happy · 35% to next level (out)", the pet that is out first; at the stable master one chat line says "Stable: 2 pets (/vg pets lists them)." and the next slot's price (unobserved: the field meanings come from the API docs). On a character with no pets, `/vg pets` says there are none. Turn the line off under Town and gear → Pet stable.
- If it fails, paste: the `/vg pets` output, the stable master's window and `/vg errors`.

### 19.1 /roll results

- Do: in a group (or alone), type `/roll`, then `/roll 1-6`. Ask a group member to `/roll` too. Wait 35 seconds. Type `/vg rolls`, then `/vg rolls clear`.
- Expect: a small panel appears at the left of the screen headed "Rolls 1-100" with each roll, highest first and the top one in your accent color; `/roll 1-6` starts a new round headed "Rolls 1-6" with its figures; 30 seconds after the last roll the panel goes. `/vg rolls` lists the session's rolls, newest first; clear says "Rolls forgotten." Move the panel with `/vg unlock`. [Needs in game: that the game's roll line (RANDOM_ROLL_RESULT) reaches the addon as a plain, readable system message in your language, also inside an instance.]
- If it fails, paste: the roll line as it shows in chat, and `/vg errors`.

### 19.2 Loot rolls (only where the client keeps a loot history for the drop)

- Do: type `/run print(C_LootHistory ~= nil, C_LootHistory and C_LootHistory.GetAllEncounterInfos ~= nil, C_LootHistory and C_LootHistory.GetSortedDropsForEncounter ~= nil)` and paste what it prints. If it prints `true true true`, roll on an item in a group (Need, Greed or Pass) in a dungeon (check a player from another realm shows as Name-Realm and one from yours as Name) and also from a world drop, and watch the panel.
- Expect: nothing happens on a client without it (no error). With it, under the roll lines the panel shows the item, "rolling" until it has a winner or everyone passed, and each member's choice and roll, the winner in your accent color. [Needs in game: that the history holds a drop for a vanilla dungeon and for a world group roll (the Forever docs list C_LootHistory's encounter calls only; if a world roll leaves it empty, the loot half of the panel stays empty by design), what "winner" and "allPassed" look like while the roll runs, and the order of the drops.]
- If it fails, paste: the `/run` line's output and `/vg errors`.

## 20. Craft queue

### 20.1 Queue, next and stock (off until switched on: /vg > Town and gear > Craft queue)

- Do: switch the craft queue on. Open a profession, pick a recipe, type `/vg craft add 3`, then `/vg craft`, `/vg craft next`, `/vg craft stock`. Make one craft.
- Expect: chat says "Queued: 3 x <recipe>"; `/vg craft` lists the queue and what reagents you are short of; `next` opens that recipe with 3 typed in the panel's Crafts box and tells you to press Create (nothing is crafted for you); `stock` raises Keep stocked and makes the Restock list (nothing is bought); the queue count drops by one after the craft. With the switch off, `/vg craft` says the queue is off. [Needs in game: that C_TradeSkillUI.OpenRecipe exists, that your own UNIT_SPELLCAST_SUCCEEDED spell ID is the recipe ID so a craft comes off the queue, and that the queue survives /reload.]
- If it fails, paste: `/vg errors` and what `/run print(C_TradeSkillUI.OpenRecipe ~= nil)` prints.

### 20.2 Cooldowns and ranking

- Do: with the queue on, open a profession that has a cooldown (a transmute, say), then `/vg craft cd`. Visit the auction house, open a profession again and type `/vg craft top`.
- Expect: `cd` lists the cooldown with its time left, for each character that noted one; `top` lists up to five recipes that pay best, per craft and per hour at the pace set under Craft queue. [Needs in game: whether C_TradeSkillUI.GetAllRecipeIDs and GetRecipeCooldown exist on Forever (the docs list neither). If not, `cd` only knows the recipe you selected, queued or already noted, with the time from C_Spell.GetSpellCooldown on the recipe's spell; select a transmute (or any recipe with a cooldown) in its profession window, then `/vg craft cd`. Also: that a recipe's spell cooldown is what the profession window shows, and that reading a few hundred recipes causes no stutter.]
- If it fails, paste: `/vg errors` what `/run print(C_TradeSkillUI.GetAllRecipeIDs ~= nil, C_TradeSkillUI.GetRecipeCooldown ~= nil)` prints, and `/run print(C_Spell.GetSpellCooldown(<a recipe's spell ID>))`.

## 21. Presets (batch 2)

### 21.1 Apply a built-in preset

- Do: type `/vg preset`, then `/vg preset Healer` and click Apply. Open `/vg` → Profiles and find the Presets rows.
- Expect: the first command lists Healer, Damage and Tank; the second asks `Apply preset Healer? Your profile is backed up first.`; after Apply chat says `Profile <name> as it was before this import is saved as profile <name> backup.` and a reload is offered. Frames you had moved stay where they were. No error popup.
- If it fails, paste: the chat lines and `/vg errors`.

### 21.2 In combat

- Do: pull a mob, then type `/vg preset Tank` and answer Apply.
- Expect: chat says `Presets can't be applied in combat: try again after the fight.` and nothing changes, after the fight too.
- If it fails, paste: the chat lines and `/vg errors`.

### 21.3 Another addon

- Do: `/run Vanguard.RegisterPreset("Mine", "VG1:parts:x", "test") Vanguard.OpenOptions("profiles", "Apply Healer")`, then click Apply Mine.
- Expect: the options window opens on Profiles at the preset rows, which now list Mine; applying it says `Import failed: ...` (the string is not real) and nothing changes.
- If it fails, paste: what you saw and `/vg errors`.

## 22. Spell ranks

### 22.1 Bar notice and swap

- Do: in `/vg` open Town and gear and switch on "Notice older spell ranks on bar buttons (/vg ranks)". On a character with a ranked spell, put an old rank of it on a bar (drag it from the spellbook, or keep one on a bar after learning the next rank), and another on Vanguard's bar 2 (and on bar 6 if it is on). Type `/reload`, then `/vg ranks`, then `/vg ranks swap`. Try `/vg ranks swap` in combat.
- Expect: after the reload (or after learning a rank), chat says "N button(s) on your bars hold an older spell rank." once. `/vg ranks` lists "Bar B button N: Spell Rank 2 -> Rank 4" for each, with B the Vanguard bar the button is on (the one on bar 2 says Bar 2, the one on bar 6 is listed too), and changes nothing. `/vg ranks swap` puts the newest rank on each, says "Put the newest rank on N button(s).", and leaves your cursor empty. In combat it says "Bars can't change in combat." [Needs in game: that C_Spell.PickupSpell with PlaceAction swaps a spell on a bar out of combat, that GetActionInfo gives the spell ID of the rank on the button, and that SPELLS_CHANGED fires when a rank is learned.]
- If it fails, paste: the `/vg ranks` output and `/vg errors`.

### 22.2 Trainer memory

- Do: switch on "Remember what trainers teach (/vg trainers)". Open your class trainer, close it, then type `/vg trainers`, `/vg trainers next`. Level up, if you can, and read chat.
- Expect: `/vg trainers` says how many services are remembered; `/vg trainers next` lists "Level N: Spell Rank R (Trainer, Zone, Subzone)" for the next five levels, lowest first (or says nothing is remembered). A level-up prints the same list under "Trainers you've visited teach, from this level:". `/vg trainers clear` says "Forgot every trainer." [Needs in game: that GetTrainerServiceLevelReq exists on Forever, where the rank text ("Rank 3") sits among GetTrainerServiceInfo's returns, and that TRAINER_SHOW and TRAINER_UPDATE fire.]
- If it fails, paste: `/run print(GetTrainerServiceLevelReq, GetNumTrainerServices())` with the trainer open, and `/vg errors`.

## 23. Mail tools

### 23.1 Search and Take (off until switched on: /vg > Town and gear > Mail tools)

- Do: switch the mail tools on, open a mailbox with a few mails. Type part of a sender or subject in the panel's search box, click the filter button through its four values, click Take on a mail with money and on one with an item. Type `/vg mail <words>`.
- Expect: a panel right of the mail window, headed `Find mail` (no X: it follows the mail window), lists the matching mails (sender: subject, with money and item count); the filter button reads All, Money, Items, Sales; Take takes the money and the first item, one per click; a pay-on-delivery mail's row says `pay <amount> on delivery` and has no Take button; the panel goes when the window closes; chat lists the same matches. With the switch off, `/vg mail` says so. [Needs in game: that TakeInboxMoney and TakeInboxItem(mail, 1) work from a click, that GetInboxInvoiceInfo marks sales, and the panel's place beside the window.]
- If it fails, paste: `/vg errors` and a screenshot of the mailbox.

### 23.2 Send-to-alt presets

- Do: click **+ Add** on the panel, type `Smith <an alt> iron` and click Add (or `/vg mail preset add Smith <an alt> iron`). Point at the Smith button. Open the Send Mail tab, click the Smith button (or `/vg mail send Smith`). Click Smith a second time. Make a preset with no words (`/vg mail preset add All <an alt>`), keep your Hearthstone in your bags and click All. Then right-click the Smith button and confirm.
- Expect: the box closes and a Smith button appears with + Add after it; its tooltip says `Sends items named iron to <alt>.` and `Right-click to remove.` The alt's name is in the To box and bag items whose name holds "iron" are attached (12 at most) and chat's count matches the attachments; the second click attaches nothing more and says 0; All passes over the Hearthstone and other soulbound items (the Hearthstone is not cast); nothing is sent until you press Send. In combat or with the tab closed, chat says to open the tab. The right-click asks `Remove the preset Smith?`, and confirming removes the button. [Needs in game: that C_Container.UseContainerItem attaches to the open Send Mail tab, and that the panel (anchored to the Mail window) shows on the Send Mail tab too.]
- If it fails, paste: `/vg errors` and what chat said.

### 23.3 Take all and Return all

- Do: with the mail tools on, open a mailbox holding a few mails with money and items (one from another player, one auction sale, ideally one pay-on-delivery). Click Take all; later, with other mail, click Return all and answer the question.
- Expect: with more than eight mails matching, a small `+N more` sits right of Return all, inside the panel and not cut off; the money and items of every matching mail (those past the rows too) come in about three a second, with a chat line `Take all: N of N done.`; pay-on-delivery mail is left; Return all asks `Return N mail(s) to their senders?` and sends back only mail from players (the sale stays); closing the mailbox mid-run stops it with a count. [Needs in game: that ReturnInboxItem takes the inbox index; 23.3b checks the takes.]
- If it fails, paste: the chat lines and `/vg errors`.

### 23.3a Pay-on-delivery mail stays untaken

- Do: with the mail tools on, open a mailbox holding a pay-on-delivery mail (cash on delivery) and a free one, and look at their rows; click Take all.
- Expect: the pay-on-delivery row reads `pay <amount> on delivery` and has no Take button; Take all leaves it; the free mail comes in. [Needs in game: that GetInboxHeaderInfo's sixth return is the amount due, and that a mail whose place shifts mid-run is skipped rather than taken.]
- If it fails, paste: a screenshot of the rows and `/vg errors`.

### 23.3b Take all empties mails with several items

- Do: with the mail tools on, open a mailbox holding a mail with money and three or more items (send one to an alt) and another with two items. Click Take all and watch the inbox.
- Expect: every coin and every item of both mails comes in (the last mail first), the emptied mails leave the inbox (a letter with text may stay, empty), and chat says `Take all: N of N done.` with both numbers equal; nothing is left in either mail. [Needs in-game check: that HasInboxItem names the slots still holding an item after a take, and that C_Mail.IsCommandPending is true until the server has answered.]
- If it fails, paste: the chat line, what is left in each mail, and `/vg errors`.

### 23.3c More than eight mails, and the days left

- Do: with more than eight mails in the inbox (or more than the game shows at once), open the mailbox with Mail tools on; scroll the mouse wheel over the panel's rows; type a word in the search box.
- Expect: the heading reads "1-8 of N" beside "Find mail" (with "more on the server" when the game holds some back); the wheel over the rows moves through the rest a row at a time and stops at the ends (over the buttons and search box it does nothing); each row ends with its days or hours left, in the warning colour in the last 3 days, when a mail that would be deleted (not returned) says "deleted in 2d" (or however many days); typing goes back to the top, and so does closing and opening the mailbox.
- [Needs in game: that InboxItemCanDelete is true for mail deleted at expiry (an auction house sale, a system mail) and false for a letter with items that goes back; that the count beside the title doesn't run into it; that the days label leaves the subject readable.]
- If it fails, paste: a screenshot of the panel and `/vg errors`.

### 23.4 Alt overview

- Do: log in on two characters of the same realm and side, type `/played` on one, then on either type `/vg alts` and `/vg alts <the other's name>`. On the first, open the bank, right-click a stack from a bank tab into your bags and press Escape at once; log on the second and point at that item.
- Expect: one line per character with its level, money, rested XP percent when it has some, and time played once `/played` was typed there; an `All together:` money line; the second command lists the other character's bags and bank, biggest stacks first, at most fifteen; the item taken from the bank counts in the first character's bags only, not in its bank too. Open `/vg`, Game windows, scroll to the foot: "Your characters" shows the same lines. [Needs in game: that TIME_PLAYED_MSG fires after /played and GetXPExhaustion answers.]
- If it fails, paste: the chat lines and `/vg errors`.

## 24. Dungeon card

### 24.1 The dungeon card on the Instance prep checklist

- Do: in `/vg` open Town and gear and switch on "Dungeon card: level range, your dungeon quests and keys on the checklist". With a quest for a dungeon in your log, walk into that dungeon (a character that carries nothing short, if you can). Then leave and type `/vg prep`.
- Expect: at the door the checklist shows even though nothing is short, with a heading "Dungeon name · levels A-B · 5-player Normal", "Last run: N days ago" (once you have been there before; "today" within a day), "Your quests here" and your quests for this dungeon as "[level] Title" (done ones with "· done"), and "Keys: ..." when you carry a key. Outside, `/vg prep` shows "Dungeon quests in your log" (your dungeon and raid quests) and any keys. With the switch off none of these lines show. [Needs in game: that GetInstanceInfo gives the name, size and difficulty, that C_Map.GetMapLevels answers for a dungeon map, that C_QuestLog.GetQuestsOnMap lists your quests inside a dungeon, that C_QuestLog.GetQuestTagInfo tags dungeon quests with Enum.QuestTag Dungeon, Raid or Group, and that keys are item class 13.]
- If it fails, paste: what the card shows, `/run print(C_Map.GetMapLevels(C_Map.GetBestMapForUnit("player")))` and `/vg errors`.

### 24.1a A finished dungeon quest reads "done"

- Do: with the dungeon card on, finish every objective of a quest for a dungeon (do not hand it in yet), then type `/vg prep` inside or near that dungeon.
- Expect: its line reads "[level] Title · done", the same quest the game's quest log shows as ready to turn in; an unfinished quest has no "· done". [Needs in game: that C_QuestLog.IsComplete or C_QuestLog.ReadyForTurnIn answers true for a finished dungeon quest on Forever.]
- If it fails, paste: what the card shows, `/run print(C_QuestLog.IsComplete(<questID>), C_QuestLog.ReadyForTurnIn(<questID>))` (the quest ID from Wowhead) and `/vg errors`.

## 25. Theme experiments (#239)

### 25.1 SLUG text and frame buffers

- Do: look at a nameplate and a floating combat number, then type `/vg slug` and look again at 1080p; type `/vg slug` to switch it back. Then type `/vg framebuffer`, open and close the options window and the bags several times, and compare with `/vg framebuffer` off. Note your frame rate.
- Expect: with SLUG on, world text scales smoothly and stays readable (or the flag does nothing, which is fine); panel text never changes. With frame buffers on, inner borders and panels no longer ghost through a window mid-fade, and nothing else changes; the frame rate does not drop while a window is idle. `/vg errors` stays empty either way. [Needs in game: that the Forever 16001 client takes the SLUG flag in SetFont and has Frame:SetIsFrameBuffer; the radial progress and SVG texture calls of #239 are not wired up until their signatures are confirmed on the client: run `/run print(CreateFrame("StatusBar").SetRadialProgressBar, UIParent:CreateTexture().SetSVG, UIParent.CreateVectorGraphics)` and paste what it prints.]
- If it fails, paste: screenshots with the setting on and off, the print above, and `/vg errors`.
## 26. Theme variants (#237)

### 26.1 High contrast, Vellum and ink, Classic look and the four dark looks

- Do: open `/vg` → General → Look and set **Theme variant** to High contrast; open the options window, bags, the quest log, a unit frame and a tooltip; click into an input box. Then set it to Vellum and ink, then Classic look, then Midnight, Obsidian, Moss and Ash and ember, and look again each time. Then back to Slate and brass.
- Expect: High contrast shows opaque near-black windows, white text, no light line under window tops, brighter green, orange and red states, blue/yellow/vermilion reactions, and a 2-pixel accent edge on inputs and accent-bordered frames. Vellum and ink shows warm dark windows with cream text and your accent unchanged. Classic look shows dark leather windows with a bronze border, gold-cream text and the brass rule and corner brackets without `/vg ornaments`. Midnight is navy-black with ice-blue text, Obsidian neutral charcoal with a grey border, Moss dark green with sage text, Ash and ember smoky grey with a rust border. On every look, the dark text on a selected (accent-filled) choice segment is crisp with no shadow behind it, and every segment is wide enough for its label. Everything repaints without a reload; text stays readable on every window; `/vg errors` stays empty. [Needs in game: that windows the game draws (not Vanguard's) look right; a saved panel colour is overridden while a variant is on.]
- Also: picking High contrast (or going back from it, or Reset theme) shows the reload notice, and `/vg variant contrast` offers a reload, because Safer colours turns on or off with it; after the reload the debuff type colours on aura icons and the raid tile wash match the variant. Vellum, Classic and the rest show no notice.
- If it fails, paste: a screenshot of the window that looks wrong with the variant name, and `/vg errors`.

### 26.1a Round minimap

- Do: open `/vg` → Map → Minimap and waypoints and set **Minimap shape (reload)** to Round, then `/reload`. Look at the minimap: the zone name, the coordinates, the tracking, mail, difficulty, group finder and addon buttons, zoom with the wheel, click the zone name, drag it with `/vg unlock`. Then set Square and Follow the theme with Theme variant on Classic look, `/reload` each time.
- Expect: Round shows the map as a disc with an outline on its edge, the zone name on a strip above the disc, the whole width of the map (a long name like Redridge Mountains shows whole), the bottom band cut to the disc, no corner diamonds, and the game's buttons wholly inside the outline at the corners' angles, not cut off or over the coordinates; quest marks for spots past the edge sit faint just inside the outline, never outside the disc; other addons' minimap icons sit round the rim. Square is the old square map. Follow the theme is round only on Classic look. On the square map, `/dump Minimap:GetMaskTexture()` after login, then Edit Mode → Minimap → tick and untick Rotate Minimap: the map stays square (on Round it stays Vanguard's disc). No `/vg errors`. [Needs in game: that the disc mask, the outline and the rim buttons line up at 1080p and 1440p.]
- If it fails, paste: a screenshot of the minimap with its setting and variant, and `/vg errors`.

### 26.1b Bar backing

- Do: open `/vg` → Action bars and set **Theme variant** (General → Look) to Classic look, then look at the action bars; set **Bar backing** to Never, then Always, then Follow the theme with Slate and brass. Drag a spell onto an empty slot, and enter combat.
- Expect: Classic look (Follow the theme) puts a flat panel with a bronze edge a few pixels outside each bar, under the buttons, at once; Never removes it, Always shows it on any theme; the backing fades and hides with its bar (mouseover bars, hidden bars) and never takes a click away from a button. No `/vg errors`. [Needs in game: the backing's size and level against the buttons on every bar, including in combat.]
- If it fails, paste: a screenshot of the bars with the setting and variant, and `/vg errors`.

### 26.2 Rounded corners

- Do: open `/vg` → General → Look and set **Corners** to Rounded (or `/vg corners rounded`); open the options window, bags, the quest log, a unit frame, a tooltip and a few buttons; hover a button; try it on Slate and brass, High contrast and Midnight; then set it back to Square.
- Expect: every window, frame, tooltip and button shows a four-pixel rounded corner whose arc is as thin as the border, with no square fill poking out past the arc and no gap where the arc meets the edge; the light line under a window's top stops short of the corners; status bars, action and bag slots and tabs stay square; High contrast's two-pixel accent ring rounds at twice the radius. Square puts every corner back without a reload; `/vg errors` stays empty. [Needs in game: how crisp the arc is at 1440p and 4K, with and without Pixel-perfect scale; whether a game window Vanguard skins shows its own square corners under the arc.]
- If it fails, paste: a screenshot of the corner that looks wrong with the UI scale, and `/vg errors`.

### 26.3 Panel texture

- Do: open `/vg` → General → Look and step **Panel texture** through Fine grain, Carved stone, Dark leather, Rock, Marble and Dialog; each time look at the options window, open your bags, a tooltip and the quest log. Try Carved stone and Rock on Midnight and Classic look, then with **Corners** on Rounded. Set **Theme variant** to High contrast, then back. Then set it back to Flat.
- Expect: each pick changes every open window at once, with no reload; the unit frames, action bars and other HUD frames stay flat. Fine grain, Carved stone and Dark leather are a faint texture on the usual panel colour; Rock, Marble and Dialog show the game's own background faintly through it. All text stays easy to read, muted and greyed-out text included. No seam shows where the texture repeats. With Rounded corners the texture stops just inside the arcs, with no square corner poking out. High contrast shows flat windows. Flat puts everything back; `/vg errors` stays empty. [Needs in game: that Rock, Marble and Dialog exist on Forever (an empty list entry or a plain window means one is missing); whether the faintness (0.25, 0.3, 0.5 for the game's, the art itself for Vanguard's) reads well at 1080p and 1440p; the size the texture repeats at.]
- If it fails, paste: a screenshot of the window with the pick and variant named, and `/vg errors`.

## 27. Window ornaments (#238)

### 27.1 Rule and corner brackets

- Do: type `/vg ornaments`, open `/vg`, the quest log (`L`) and `/vg setup`. Change the accent. Then `/vg ornaments` again.
- Expect: the options window gets a thin dim-brass rule under its header with a small diamond in the middle; the quest log and the setup wizard get four chamfered corner brackets just inside their corners; all in the accent's darker shade, none on unit frames or other HUD frames; switching off removes them at once. Screenshots at 1080p and 1440p. [Needs in game: that the brackets sit cleanly on the 1 px border at both resolutions.]
- If it fails, paste: screenshots and `/vg errors`.

## 28. Cooldown Manager refresh glow

### 28.1 The glow on a buff

- Do: turn on the game's Cooldown Manager and track a heal-over-time buff on yourself in its buff row. Type `/vg cdmglow on`, cast the buff on yourself, wait until under 30 percent is left, out of combat; then do the same in combat. Type `/vg cdmglow 50`, then `/vg cdmglow off`.
- Expect: the buff's icon gets an accent glow ring once under the share is left, and loses it when the buff is renewed or ends. In combat the glow still follows the time left, or stays off with no error; `/vg errors` never shows "GetAuraDataByAuraInstanceID(): Auras cannot be accessed when secret" (0.7.0 did, 91 times in one session). `/vg cdmglow 50` says "under 50 percent left"; off puts the glows out. [Needs in game: whether the client hands the aura's duration object to a curve (C_CurveUtil.CreateCurve, EvaluateRemainingPercent) and whether SetAlpha takes the result in combat; the Cooldown Manager item fields auraInstanceID and auraDataUnit, and whether auraInstanceID is hidden in combat (then the glow stays off in combat).]
- If it fails, paste: `/vg errors`, and what `/run print(C_CurveUtil and C_CurveUtil.CreateCurve ~= nil)` prints.

### 28.1a The command with the module switched off

- Do: switch the Cooldown glow module off in `/vg`, then type `/vg cdmglow on`.
- Expect: chat says "Cooldown glow is off: turn the module on in the options first." and `/vg errors` stays empty.
- If it fails, paste: `/vg errors`.

### 28.1b The glow in a dungeon fight

- Do: with `/vg cdmglow on` and a heal-over-time buff tracked in the manager's buff row, enter a dungeon, pull a pack and cast the buff on yourself; let it run under 30 percent left while still fighting.
- Expect: the glow ring lights under the share in the fight too (where the game hides the aura's times from addons, the game's own curve answers), and goes out when the buff is renewed or ends. `/vg errors` stays empty. [Needs in game: that `/run local d = C_UnitAuras.GetAuraDuration("player", <id>) print(type(d))` prints `userdata`, and that the ring lights in instanced combat.]
- If it fails, paste: `/vg errors`.

### 28.2 Key text on the manager's icons

- Do: with the game's Cooldown Manager on and Vanguard's action bars on, put a spell that is in the manager's essential row on a Vanguard bar button with a key (say Shift-3). Type `/vg cdmkeys on`. Then move the spell to another button, change its key, and take it off the bars. Repeat once with the spell inside a macro.
- Expect: the spell's icon shows "S3" in its top-right corner, over the cooldown sweep and clear of the charge count; it follows the move and the new key and goes blank once the spell is off the bars. A spell on no Vanguard bar shows nothing. `/vg cdmkeys off` clears the labels. In combat, nothing breaks and the labels stay put.
- If it fails, paste: `/vg errors`, and what `/run local i=EssentialCooldownViewer:GetItemFrames()[1] print(i and i.GetSpellID and i:GetSpellID())` prints.

### 28.2a Key text after a stance, form or page change

- Do: with `/vg cdmkeys on`, put a spell from the manager's essential row on a bar 1 button with a key, and a different spell from the manager on the same button of another page (a warrior's other stance, a druid's form, a rogue's stealth bar, or Shift+2's page). Change stance, form or page, out of combat and then in combat, and back.
- Expect: the label moves to whichever spell bar 1's button holds on the page now showing, within a frame of the change, and back when you return. `/vg errors` stays empty.
- If it fails, paste: `/vg errors`, and which page and button you used.

## 29. Cooldown gaps

### 29.0 The Cooldowns page and its wizard

- Do: type `/vg cooldowns`. Hover each switch. Click **Set up cooldowns**, go through the three steps with Next and Back, ticking nothing, then Done. Type `/vg cooldowns setup`, tick **Show the game's manager** in the first step and untick it again. Start a fight with the window open, then type `/vg cooldowns setup` in the fight.
- Expect: the page has three cards (the game's manager, Gaps row, Buff glow), a tooltip on each switch and the slider, and Combat tools has a one-line note pointing here. The wizard shows Step 1 of 3 to Step 3 of 3, Back stops at the first step, Done closes it, and clicking through changes no setting. In a fight the window waits and opens when it ends. `/vg errors` stays empty. [Needs in game: how the wizard and the page look and read; whether the manager's switch behaves in the wizard as it does on the page.]
- If it fails, paste: `/vg status` and `/vg errors`.

### 29.1 The gap row

- Do: under `/vg` > Cooldowns tick **Gaps row**, reload. Wear an on-use trinket, type `/vg gaps add Healthstone` (or an item ID) with one in your bags, use the trinket and the item. With a pet out, use one of its abilities. As a shaman with the class bars off, drop a totem. Then repeat inside an instance in combat.
- Expect: a row of square icons in thin borders appears above the game's Cooldown Manager, each with a sweep and numbers in the theme font while its cooldown runs; `/vg unlock` lets you move it. Where the client hides cooldown values in combat, that icon is simply missing or sweeps from the client's own timer; never a wrong number. `/vg gaps` lists the chosen items, `/vg gaps remove <item>` takes one off. The row is never clickable and `/vg errors` stays empty. [Needs in game: whether the client has C_Item.GetItemCooldown (or C_Container.GetItemCooldown), C_Item.GetItemSpell, C_Spell.GetSpellCooldownDuration and GetPetActionInfo, and what each returns in instanced combat.]
- If it fails, paste: `/vg gaps`, `/vg status` and `/vg errors`.

### 29.1a Choosing the gap row's items and spells in the window

- Do: with **Gaps row** on (and reloaded), open `/vg` > Cooldowns. Drag an on-use trinket from your bags onto the "Drag here, or type" row under the Gaps card, then drag a spell from your spellbook onto it. Type `Healthstone` in its box and press **Add item**; type a spell's name and press **Add spell**. Press × on one of the rows.
- Expect: before anything is chosen the card reads "Nothing chosen yet. Drag an item or spell here, or type its name." Each drop or Add puts a row with the item's or spell's icon and name on the card at once (and a chat line), the dragged thing leaves the cursor, and the gap row shows it (an item only while you carry it). × takes its row off the card and the icon off the gap row. With Gaps row off the card says to tick it and reload. [Needs in game: that a spell dragged from the spellbook gives its spell ID as GetCursorInfo's fourth value on Forever, and that a drop with a click (picking up, then clicking the row) works like a drag.]
- If it fails, paste: `/vg gaps`, a screenshot of the card and `/vg errors`.

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
- Expect: `Safer colours (reload)`, `Font`, `Text size`, `Faction look`, `Theme variant`, `Corners`, `Window ornaments` and `Pixel-perfect scale`, each a noun with nothing after it. Two small grey notes sit under their rows: `Friendly blue, neutral yellow, hostile vermilion, and colours for Magic, Curse, Disease and Poison that stay apart.` under Safer colours and `A brass rule or corners on large windows.` under Window ornaments. In `/vg whatsnew`, a line about Corners or Theme variant still opens General on its row.
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
- Expect: in the world, bubbles are flat slate panels (no sheen, no shadow) with their text on them, or the text alone with Text-only bubbles on. Inside an instance the game's own bubbles show, and `/vg errors` is empty.
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

- Do: with a fresh profile, look at the main chat window over a bright area (snow, desert) and over a dark one. Open `/vg` → Chat and cycle Chat background strength through Light, Medium and Dark, then untick Chat background. Look at the tabs and the Copy button. Under Chat, cycle Chat text fades to After 10 seconds, say something and wait; then Never.
- Expect: the window is 188 tall and 416 wide on a 1080p screen at setup's 80 % scale (524 wide at 1920 units; 372 x 132 on a small screen), starting 40 units in and 32 up from the screen's left edge so the side buttons' column fits between the edge and the panel, its panel ending a little short of the player frame's left edge, and the pet frame now sits over the player frame's right end (a profile that already sized chat keeps its size, except one still at 0.7.0's 500 x 154 or 420 x 154 or the small 372 x 144, which is set to the new first size once). One crisp rounded panel with a dark fill sits behind the text, the scroll bar and the tab bar (no soft fade at its edges), the text reads over bright ground at Medium (each line has a thin dark shadow down and to the right, and a little more air between lines than the game's chat), the strength follows the setting at once, and unticking Chat background (reload) swaps the panel for a soft dark band with no border: clear at the window's left edge, solid behind the lines, thinning out across the right quarter or so, with the tab bar, its rule and the Find and Copy tiles still there. With Soft shadows under frames ticked (General → Look; reload), a small soft shadow sits evenly round the panel, no wider than an action button's. Tab names show in full (General, not Gene…) the Copy tile sits at the right end of the tab bar with the Find tile left of it, and the scroll bar on the right is a slim thumb inside the panel with no boxed arrows (the scroll-to-bottom glyph still shows when scrolled up). Tab names are readable. Cycle Chat window size through Larger and Largest: the window resizes at once. On a 4K screen, switching Pixel-perfect scale on (General → Look, no setup) keeps the UI and chat about 1080p's size, not half of it. At After 10 seconds your line fades out about ten seconds after it arrived, over about half a second; at Never it stays; by default (After 60 seconds) lines go after a minute. [Needs in game: that Never really stops the client's own line fade, and that the game does not put its own fade time back on a window after a font size change.]
- If it fails, paste: a screenshot over bright ground and `/vg errors`.

### 33.40 Options window: reload tags, search list, page reset, Modules groups

- Do: open `/vg` → General. Look at Color assist and Pixel-perfect scale, and point at Color assist. Type "colour blind" in the search box, then "font size", then "changed". Click a result. Open Chat, untick "Copy button in the chat's tab bar", press Reset this page and answer Reset. Open Modules and cycle Show through On and Off. At Text size 70 % and 130 % (General), check the search list and the tags.
- Expect: Color assist has a small grey "reload" tag after its caption and no "(reload)" in the caption; Pixel-perfect scale has none; pointing at Color assist says "Takes effect after /reload." The search list opens under the box, right-aligned with it, over the page: "colour blind" lists Color assist (General), "font size" lists Text size, "changed" lists what you changed; a click opens that page with the row marked and the list closes; a search with no match says "No setting matches." Reset this page is greyed until something on the page differs from its default, asks, and puts the box back. Modules shows a tab for each name in the list on the left, with Show above them; Show: Off lists only the modules you turned off. No caption or tag overlaps a switch, slider or dropdown at either text size.
- If it fails, paste: a screenshot of the row, the list or the page and `/vg errors`.

### 33.41 Tagged mob marks

- Do: stand near an untouched hostile mob and target it. Pull it (or hit it with a ranged attack). Then target a mob another player is fighting that you have not touched, and, if you can, join that player's group while it fights (then leave). Target an enemy player's pet in a fight if you can (a duel partner's pet or demon). Open `/vg` → Nameplates and untick "Tag marks", then `/vg` → Unit frames and untick "Tag mark on your target".
- Expect: no mark on the untouched mob, and its bar in its usual colour; a small green check left of the level on its nameplate and next to the classification diamond on the target frame once it is fighting you (within a moment of the first hit), its bar in its usual (threat) colour; a small grey X in the same places on the other player's mob, and its nameplate bar grey; when you join that player's group the X turns into the check (and the bar loses its grey) on the plate and the target frame together, and back when you leave; no mark on a player's pet or demon. Both switches take the marks off at once, and the grey bar goes back to its usual colour. [Needs in game: whether `UnitIsTapDenied` answers true for a mob another group tagged, whether `UNIT_FLAGS` or `UNIT_FACTION` fires when it changes so the marks follow within a moment (`/etrace` filtered to both and UNIT_THREAT_LIST_UPDATE), and what a mob that only fights your pet shows.]
- If it fails, paste: a screenshot of the target frame and plate, and `/vg errors`.

### 33.42 Chat tabs always visible and the stacked side buttons

- Do: with two chat tabs, move the mouse away from the chat and wait a few seconds; then untick `/vg` → Chat → Keep chat tabs visible, wait again, and tick it back. Tick Hide the tab bar until the mouse is over the chat (under Chat), move the mouse away for five seconds, bring it back over the chat, then away again while a friend says something into the other tab; untick it. Look at the column of buttons beside the chat, with voice chat on and off (Options → Voice), and when a Quick Join toast shows.
- Expect: both tabs stay at full strength with the mouse away; with Hide the tab bar ticked, the bar's rule and the Find and Copy tiles fade away about four seconds after the mouse leaves the chat and the tabs go with them (the tabs at the game's own pace), all back the moment the mouse is over the chat again, and the bar stays while the other tab flashes; unticked, the bar is back at once and stays; unticked, the tab you are not reading dims after a moment but stays readable (about 60 %, not the game's near-invisible 20 %), comes to full under the mouse, and the ticked switch brings it back at once; the side buttons stack down from the tab bar's top (chat menu, Quick Join, voice channel, deafen, mute, text to speech, each only when the client shows it), a tile's width apart, and close up when the voice buttons go; a Quick Join toast leaves the stack where it was. `/vg errors` is empty.
- If it fails, paste: a screenshot of the chat's left column and tab bar, and `/vg errors`.

### 33.43 Dropdown menus near the bottom, the French key prompt, the options search hint

- Do: on a small screen (1024x768 or a window about 835 units tall), open `/vg` → General and click the Panel texture dropdown near the bottom of the page, then one higher up the page; click the first one again. Set the game to French (frFR), open `/vg` → Click casting, click Add key. Still in French, set General → Text size to 115 % and then 130 % and look at the search box in the options header.
- Expect: the low dropdown's menu opens above it (its bottom edge on the dropdown's top), scrolls as before, never covers the dropdown's own value, and a second click on the dropdown closes it; the higher one opens below as before. The Add key button reads "Touche, clic ou molette…" in full while it waits. The search box shows "Rechercher dans les réglages" cut short with an ellipsis if it does not fit, never past the box's right edge or over the profile picker.
- If it fails, paste: a screenshot of the menu, the button or the header and `/vg errors`.

### 33.44 Trade windows in a long language, and the Instance prep card at the top

- Do: set the game's language to German, Russian or French (or run a client in one). Open your combined bag; open the auction house on the Posting tab with an item dropped on the sell card, then the Lists tab (after a scan, so the button counts down); open a mailbox with Mail tools on. Then, at the largest UI scale, add a dozen Keep-stocked items you lack (`/vg stock <itemID> 10`) and type `/vg prep`.
- Expect: the bag's Sort button, the sell card's Post, Stop, Skip and Max buttons, the Restock button on the Lists toolbar, the scan button's countdown and each mail row's Take button show their whole label (the search box beside Sort is a little narrower; the guide's four steps follow one another with a gap, none over the next). The Instance prep card's title and close button stay on the screen however long the list grows: the card slides down from the top edge instead. [Needs in-game check: all of it, and whether the clamp moves the card down.] The + Add button in the mail panel's bottom row is checked in 33.58.
- If it fails, paste: a screenshot of the button or card, the game's language, and `/vg errors`.

### 33.45 HUD spacing: swing timer, hunter pet, bar 5, rolls, meter title

- Do: as a warrior, rogue or hunter, switch on a 4th stacked action bar (bar 6) under `/vg` → Action bars, swing at a mob, and look at the swing rows against your cast bar and bar 1. As a hunter with a pet and the pet's happiness glyph on, look at the pet frame's health text. Turn on bars 4 and 5 at button size 46 or 48. Make the Vanguard meter 200 wide (`/vg unlock`, right-click its handle, or General → Layout) and make a roll in a group (`/roll 1000`) so the roll tracker shows. If you play in German or French, open `/vg lfg`, `/vg keybind` and look at a vehicle exit button; with Numbers set to always on the XP and reputation bars, raise Text size to 130% and watch a long faction name.
- Expect: the swing rows sit just over the cast bar, above bar 1, with the 4th bar on; the pet's health text ends left of the mood glyph; bar 5 is a column clear of bar 4; the meter title ends in "..." before Report and Reset; a roll's name ends in "..." before its figures and never draws over them; the group board's hint wraps inside the window; the keybind banner shows its whole last sentence; the vehicle exit label stays inside its button; the XP text stays in the bar's left half and the reputation text in its right half; and, on a German client, say whether "Fehlgeschlagen" is cut on a failed pet cast (no change was made for it: it needs this look first).
- If it fails, paste: a screenshot of the part and `/vg errors`.

### 33.46 Discord and X links on the Feedback page

- Do: open `/vg` → Feedback and scroll to the Community card. Click Copy Discord invite, press Ctrl+C, close the box and paste into a browser's address bar; then do the same with Copy X link. Look at the card once more in German or Russian.
- Expect: the card's line names @WowVanguardUI on X; each button opens the copy box with its address selected (`https://discord.gg/8ChnJfyww`, then `https://x.com/WowVanguardUI`), the box's title says to press Ctrl+C and paste into the browser, and the pasted invite opens the Vanguard server; in the long language both button labels fit. `/vg errors` is empty.
- If it fails, paste: a screenshot of the card or the box, and `/vg errors`.

### 33.47 Narrow screens: adapted default spots and setup's Fit

- Do: on a 4:3 or 5:4 screen, or a 1024x768 window, with the game's UI scale at 100 % and a fresh profile, look at the frames around your character with a target that has a target, at your buffs with a dozen of them on, at Boss timers and the talking head in `/vg unlock`, and (in a party, Party pets and targets on under Unit frames) at the party pets column with the UI scale at 115 %. Then run `/vg setup` and go to the Screen step. On a 16:9 screen at 100 % or below, look at the same frames.
- Expect: on the narrow screen the target of target sits just above the target's cast bar at the target's inner end, on the screen and clear of the tooltip corner; your buffs wrap in fewer columns (five on a 1024-wide canvas) and leave the main tanks' spot clear; the Boss timers handle sits left of the quest tracker; the talking head's handle is clear of the minimap; at 115 % the party pets column sits right of the party column with its top on the screen. The Screen step shows "Fit my screen: UI scale N%  ·  suggested" just above Keep (90 % on 16:10, 75 % on 4:3, 70 % on 5:4); picking it and finishing sets the game's UI Scale slider there and changes no button, tile or text size. On the 16:9 screen every frame is where it was before and there is no Fit choice. [Needs in game: all of it, the spots at the real UI scale.]
- If it fails, paste: a screenshot of the HUD and the Screen step, your resolution and UI scale, and `/vg errors`.

### 33.48 Frames kept on the screen, and chat dragged to an edge

- Do: `/vg unlock`, drag your player frame against the right edge and lock; set the game's UI scale from 65 % to 115 % (or load a profile saved on an ultrawide screen on a narrower one). Then `/vg unlock` and drag the chat handle hard against the left edge, then the top-right corner, and lock.
- Expect: the player frame stays wholly on the screen after the scale change, and in unlock mode its handle sits over it. The chat handle stops short of each edge: with the chat on the left edge its column of side buttons is still on the screen; in the top-right corner the tab bar and its Copy and Find tiles are under the screen's top, the scroll column inside the right edge, and the edit box (press Enter) on the screen. [Needs in game: whether the client's clamp keeps protected frames on the screen, and that SetClampRectInsets grows the chat handle's clamp in the direction used (negative left and bottom, positive right and top).]
- If it fails, paste: a screenshot with the handles showing, `/vg frame ChatFrame1` and `/vg errors`.

### 33.49 Raid mark on the short frames

- Do: in a group, mark your target's target and your pet (or a boss) with a raid target icon (Raid target icons on, under Raid frames), with long names on them.
- Expect: on the target of target, pet and boss frames the mark sits a little higher than on the player and target frames, its bottom just over the top of the name, which stays readable; on the target, player and focus frames it is centred on the top edge as before. [Needs in game: the name's real height against the lifted mark.]
- If it fails, paste: a screenshot of the frames and `/vg errors`.

### 33.50 Raid grid on a narrow screen, and the status on a big grid

- Do: in a raid of 25 or 40 (or `/vg preview 40`) with the raid frames at their default spot (`/vg reset raid` first), on a 5:4 or 4:3 screen, or at a UI scale that makes the UI narrower than 1296 units (the game's Options -> Graphics -> UI Scale, about 110% on a 1080p screen). Have a roll going (`/roll 1000` in a group) so the roll tracker shows at the left edge. Then look at a tile whose player is offline or dead, and at one with a big missing-health figure.
- Expect: the grid starts right of the roll tracker (its left edge 148 units in from the screen's edge) and ends on the screen; on a screen 1296 units wide or more it is where it always was, left of the middle. The tile's status (Offline, Dead, Ghost or the missing health, such as -12000) sits at the right of the name row on one line; it is not cut on English text, and a longer translation ends in "..." rather than wrapping down into the buff icons. [Needs in-game check: all of it, and how "Offline" at 40 players looks against the name.]
- If it fails, paste: a screenshot of the grid and `/vg frame raid deep`.

### 33.51 Vanguard meter on a narrow screen

- Do: on a screen narrower than about 1840 UI units (1920 x 1080 at the game's UI scale 100% is 1366 units wide; a 4:3 monitor is narrower), switch the meter on (`/vg meter on`) with the Action bars on and the game's own meter off, then fight a target dummy or look at the empty panel.
- Expect: the panel sits at the bottom right, 16 in from the right edge and above the bags and menu bar, where the game's own meter sits; it does not cover bars 1 to 3. On a wider screen (a 2560 x 1440 monitor at 100%) it sits where it always did, left of the bags and menu bar. [Needs in-game check: the panel's top against the tooltip corner and the quest tracker on a 1365-wide screen.]
- If it fails, paste: a screenshot of the corner and `/vg frame Vanguard_Meter`.

### 33.52 Officer roster in a 40-player raid on a short screen

- Do: with Officer loot tools on (`/vg loot on`), in a raid of 40 on a screen 768 units tall or less (1920 x 1080 at the game's UI scale 100% is 768 tall), open the roster (`/vg loot roster`).
- Expect: the panel ends above the bottom edge of the screen and its last line reads "+3 more" (or the number of members it had no room for); on a taller screen every member is listed with no count line. [Needs in-game check: the count at your screen's height, and the panel against the roll tracker at the left edge, which it still overlaps.]
- If it fails, paste: a screenshot and `/vg frame Vanguard_OfficerRoster`.

### 33.53 Group threat panel on a narrow screen

- Do: switch Group threat on (`/vg` -> Unit frames, then reload), join a group (or a raid of 25 or 40 and a hostile target), on a screen narrower than 1365 UI units (a 4:3 or 5:4 monitor, or a UI scale above about 1.07 on 1080p).
- Expect: the panel sits at the right, left of the minimap and under your buffs, clear of the raid grid; on a wider screen it is at the top left, as before. [Needs in-game check: the panel against the quest tracker and your buffs, and, on a 1365-wide screen with the "Like the game's" layout, whether it still covers the party tiles (it does not move there).]
- If it fails, paste: a screenshot and `/vg frame Vanguard_GroupThreat`.

### 33.54 A full sectioned bag on a short screen, and the crafting cost panel on a narrow one

- Do: raise the game's UI scale to 115% (or use a 4:3 monitor) so the screen is about 668 UI units tall, carry a nearly full set of large bags (16 + 4 x 18 slots) with Combined bag in sections on and Drag game windows by their title bar off, and open the bag. Then open a profession window with the Auction helper on and pick a recipe on a screen narrower than about 1020 UI units (5:4 or 4:3, or UI scale above 1.07).
- Expect: the bag's title, search box, Sort and close button are all on the screen, the bag sitting lower than usual if it must. The Crafting cost panel is left of the profession window (its right edge against the window's left edge) when there is no room at the right; on a wide screen it is still at the right, past the side tabs. [Needs in-game check: both, and whether the game already kept the bag on the screen before the clamp; the real profession window's width decides where the panel flips.]
- If it fails, paste: a screenshot, `/vg frame ContainerFrameCombinedBags`, `/vg frame Vanguard_CraftingPanel`.

### 33.55 Options: the own-switch note, wide choices and capital headings

- Do: set the game to Russian, French, Spanish or Portuguese (or run a client in one). Open `/vg` → Modules, switch on a module that has a switch of its own inside (the meter, mail tools, chat history) and leave that inner switch off, then point at the module's row. Open `/vg` → Chat and General → Tools and look at the choices with long values ("Class-colored names" in French, "Vanguard look" in Spanish). In German or Russian, open the bags with section headers on.
- Expect: the note beside the module's name ("On, but its own switch is off (...)") stays on one line and ends a gap short of the module's switch, shrinking a little or ending in "..." when the name is long; pointing at the row shows the note in full as the tooltip's second line. A choice row's dropdown is wider than 200 when its longest choice needs it, its caption still on one line beside it, and shows its whole value. The bag headers are capitals throughout (German "QUESTGEGENSTÄNDE", Russian "ПРЕДМЕТЫ ДЛЯ ЗАДАНИЙ"), not capitals with a lower case letter inside or lower case. [Needs in-game check: the real client's ellipsis on the note, the dropdown widths and the Cyrillic capitals in the theme font.]
- If it fails, paste: a screenshot of the row or header, the game's language, and `/vg errors`.

### 33.56 Quest log tooltip, a tall quest in the compact tracker, and the arrow's Pin button

- Do: open the quest log (`L`) and point at a quest with a long title in the list, then start a fight and point at another. Watch a quest with nine or more objective lines (a Legacy challenge, or a recipe with many reagents) with the tracker not expanded. Shift-click a quest in the tracker so the arrow is held (Pin showing), in Italian or French if you can.
- Expect: pointing at a list line shows a tooltip with the whole title (none in a fight). The tall quest shows in the tracker with as many lines as fit its room instead of only "+1 more"; its tooltip has every line. With the arrow held, the Pin button sits in the panel's top right, the quest title stops short of it, and the distance line below keeps the full width ("Consegna · 1240 m, nessuna direzione" with no "..."), the pin tile clear of it. [Needs in-game check: the tall quest's cut, the pin tile's corner and the distance line's width.]
- If it fails, paste: a screenshot of the log, tracker or arrow, and `/vg errors`.

### 33.57 Status chip beside the player frame

- Do: tick the status chip under `/vg` → Unit frames (reload), switch on Instance prep's buff checks, have a pet out (or a hunter, warlock or druid) and be missing several buffs so the chip reads "Missing: ... +3"; try it at 1920x1080 and on a narrow window about 1024 wide.
- Expect: the chip sits just left of the player frame, level with it, clear of the pet frame, its cast bar and the combo points above the frame; it stays on the screen on a narrow window (it may then overlap the player frame's left end). [Needs in-game check: where it sits against the chat frame's default spot, and the narrow window.]
- If it fails, paste: a screenshot with `/vg frame Vanguard_StatusChip deep` and `/vg errors`.

### 33.58 Auction toolbars and lists in a long language, and the mail panel's + Add

- Do: set the game's language to German, Russian or Portuguese. Open the auction house on the Posting tab and look at the Your auctions toolbar (after Check undercuts, so its heading reads like "Your auctions 12 · 3 undercut"); open the Lists tab and look at the pane's buttons, then right-click a list item → Filters... and look at the Quality row. Open a mailbox with Mail tools on and look at + Add with no, one, two and three presets.
- Expect: Check undercuts and Cancel next undercut are each as wide as their labels, never cut; the count in the heading ("12 · 3 undercut") takes the room they leave, shrinking and ending in "..." in a long language, never over a button; the Lists pane's six buttons are two to a row in three rows and show Umbenennen, Переименовать and Копировать whole; the pane lists two fewer entries than before; the filter dialog is a little wider and "Quality" is one line beside its dropdown; + Add shows its whole label in every place along the mail panel's bottom (the preset buttons are a little narrower) and stays inside the panel. [Needs in-game check: all of it.]
- If it fails, paste: a screenshot of the toolbar, pane, dialog or panel, the game's language, and `/vg errors`.

### 33.59 A held primary button darkens

- Do: find a primary (brass) button (the options footer's Reload now once a change waits for a reload, or a question's Yes), put the mouse on it and hold the left button down without letting go; then move off and let go.
- Expect: while held, the brass button darkens by a visible shade (not only a label that sinks a pixel), and it goes back to normal on release. [Needs in-game check: the client decides the draw order of textures on one layer; the press shade now has a layer of its own above the fill and the hover.]
- If it fails, paste: a screenshot of the held button and `/vg errors`.

### 33.60 The character pane's side tabs when dragged to the right edge

- Do: open the character pane (`C`), drag it by its title bar as far right as it goes, and look at the column of mode tabs (Character, Reputation, Skills) at its right side; then drag it to the other edges. Try the inspect window, a Communities, Professions or Guild bank window the same way.
- Expect: the pane stops with its whole tab column on the screen (the panel border and the tabs under it too); dragged back, nothing is lost. [Needs in-game check: whether the real client clamps by these insets, and how far the other windows' side tabs reach; only the character pane is covered so far, the others wait for their widths.]
- If it fails, paste: a screenshot with the pane at the edge, `/vg frame CharacterFrame deep`, and `/vg errors`.

### 33.61 Options: the own-switch note sits on the module name's line

- Do: open `/vg` → Modules, switch on a module that has a switch of its own inside (Party pets and targets, Group threat, Chat history) and leave that inner switch off, in any language, and look at where the note sits in the row.
- Expect: the note ("On, but its own switch is off (...)") is on the same line as the module's name, just after the name (or its "Reload to apply" tag), and the description stays free under it, never covered. [Needs in-game check: which of its two anchors the real client honours; the harness always follows the left one.]
- If it fails, paste: a screenshot of the row, the game's language, and `/vg errors`.

### 33.62 Cooldown numbers on the smallest action bar buttons

- Do: set the action bar button size to 24 (`/vg` → Action bars), put a spell with a long cooldown (over 10 minutes) on bar 1, use it, and look at the number on the button; then set the button size to 36 and look again.
- Expect: at 24 the number is the small bold size and stays inside the icon, even as "10m"; at 36 it is the larger size as before. [Needs in-game check: the client draws the number itself.]
- If it fails, paste: a screenshot of the button at 24, the game's "Show numbers for cooldowns" setting, and `/vg errors`.

### 33.63 Pet, stance and extra button texts in the theme font

- Do: on a class with a pet bar or stances (hunter, warlock, druid, warrior), bind a key to a pet or stance button and look at its key name and, with an auto-cast or stacking ability, its count; compare with bar 1's key names. Then change into another form or call and dismiss the pet.
- Expect: the key names and counts on the pet and stance buttons use the same small font and colours as the action bar buttons and keep them after the pet or the form changes. [Needs in-game check: the game may put its own font back when the bar updates; if so say which bar.]
- If it fails, paste: a screenshot of the pet or stance bar next to bar 1, and `/vg errors`.

### 33.64 Minimap button drawer ring

- Do: with two or three addons that add a minimap button (the kind a LibDBIcon addon makes), look at the drawer opened from the "..." button on the map's edge, before and after this change if you can.
- Expect: each button sits in its own cell with its round ring centred on its icon and not hanging into the next cell; four buttons to a row. [Needs in-game check: the harness has no LibDBIcon.]
- If it fails, paste: a screenshot of the open drawer and the names of the addons whose buttons are in it.

### 33.65 Unlock handles of scaled frames

- Do: `/vg unlock`, right-click the XP bar's handle and set its Scale to 50%, then the player frame's to 200%; read their labels and drag each handle to a new spot and drop it; then `/vg lock`.
- Expect: every handle label is the same size as the others' whatever the frame's Scale; the 50% bar's handle is at least 40 wide and 14 tall, easy to grab, and sits over the bar; each frame lands where its handle was dropped. [Needs in-game check: the drag maths changed.]
- If it fails, paste: `/vg frame Vanguard_xpbar deep` and `/vg frame Vanguard_player deep` before and after the drag, and `/vg errors`.

### 33.66 The position popover keeps off its own handle

- Do: `/vg unlock`, right-click the handles of the minimap, the info strip and the quest tracker (the frames at the right edge), then of the chat window and a frame in the middle of the screen.
- Expect: for a frame near the right edge the popover opens to the left of its handle, not over it, and its handle stays visible while you type in X and Y; for a frame with room on its right it opens to the right as before. [Needs in-game check: the client keeps the popover on screen.]
- If it fails, paste: a screenshot with the popover open and the frame's name.

### 33.67 Default spots after a UI scale change

- Do: leave every frame at its default spot, then in the game's Video settings (or `/vg setup`'s screen step with Fit) change the UI Scale so the screen turns narrower (for example from 1920x1080 to a 1229 wide canvas), without reloading; look at the target of target, the Vanguard meter (if on) and the group threat panel (if on), then do `/reload` and compare.
- Expect: those frames move to the narrower screen's default spots at once, where they sit after the reload (your buffs keep their row length until the reload); a frame you dragged does not move to a default. [Needs in-game check: the client's own scale events.]
- If it fails, paste: `/vg frame Vanguard_targettarget` before and after the change and after the reload, and `/vg errors`.

### 33.68 Raid tile edges after the grid changes size

- Do: with Raid frames on (or `/vg preview 25`), step the group or the preview from 25 to 40 players at the same spot, at a UI scale other than 1 (and at 1), and look at the edges of a tile with a zoomed screenshot.
- Expect: the tile's one-pixel border and the one-pixel inset of the health bar inside it stay one sharp line each, the same thickness at 25 and at 40 players; none is blurred, doubled or missing. [Needs in-game check: whether a fractional edge blurs or drops a line is for the real client.]
- If it fails, paste: a zoomed screenshot, the group size, the UI scale, and `/vg errors`.

### 33.69 Incoming heals over the mana strip

- Do: in a raid with power bars on the raid tiles, have a healer cast on a member who has a mana bar (and, if you can, a shield on them), and look at that tile's bottom edge while the heal is incoming.
- Expect: the thin power strip along the bottom of the tile keeps its own colour for its whole width; the heal and shield tints end above it and never cover or tint it. [Needs in-game check: draw order between sibling frames is the client's.]
- If it fails, paste: a zoomed screenshot of the tile and `/vg errors`.

### 33.70 Chat handles at the screen's edges

- Do: `/vg unlock`, drag the chat handle against the bottom edge, then into the bottom-right corner and `/reload`. Turn on Chat → Move floating windows with /vg unlock (reload), pull the Combat Log (or a Loot window) out of the dock, and drag its handle to the top-left corner.
- Expect: at the bottom edge the handle stops with the edit box's bottom on the screen's edge (press Enter to see it); parked at the right, the side buttons the game moves to the right of the window stay in view after the reload; a floating window's tab bar (and the Combat Log's filter strip above it) and its minimize tile stay on the screen at the top and left edges. [Needs in-game check: that the handle stops there, in the direction the insets use (negative left and bottom, positive right and top).]
- If it fails, paste: a screenshot with the handle at the edge, and `/vg errors`.

### 33.71 Chat tabs: label font, and the dock's overflow arrow and list

- Do: set Text size to 130% (then back to 100%) and look at the chat's tab names against the chat lines; hover and click each tab. Then dock enough tabs (Combat Log, Trade, LFG, Loot, a whisper) that the bar cannot hold them all, look at the arrow at the bar's right end, and click it.
- Expect: the tab names are in the same face as the chat lines and grow with Text size, and stay that way after a hover or a click. The overflow arrow is the theme's small down-arrow tile at the dock's right end, level with the tabs (not the game's gold arrow), and its list is a themed box with the theme's font on its rows. [Needs in-game check: whether a tab's label drops back to the game's face when the button repaints; the glyph's fit on the 16-unit arrow; the list's rows and highlight, and that its rows are the buttons the code finds.]
- If it fails, paste: a screenshot of the bar at 100% and 130% Text size and of the open overflow list, and `/vg errors`.

### 33.72 Chat Copy and Find tiles on every docked tab

- Do: with General docked, click the Combat Log tab, then Trade (or a whisper tab), then General again. Hover the tiles at the bar's right end and click Copy on a tab other than General.
- Expect: Copy and Find stay in the bar's right end on every tab, the tabs end before them, and the Copy window is titled with the shown tab's name ("Copy Trade (Ctrl+C)"). [Needs in-game check: that the tiles show on the other tabs' bars and are not drawn under them.]
- If it fails, paste: a screenshot of the bar on the Combat Log tab, and `/vg errors`.

### 33.73 Expanded quest tracker over the bags and menu strip

- Do: watch seven or more quests (two or more objectives each), click the tracker's "+N more" to expand it, with the menu strip (bags and micro menu) shown, at 1365x768 and at 1920x1080; also on a window about 835 wide.
- Expect: the last quest and the "Show fewer" button end above the menu strip's top (and above action bars 1 to 3 on the narrow window), none drawn under the bags or the micro buttons, and clicking "Show fewer" works; hide the strip (Menu strip off) and the list runs lower again. [Needs in-game check: the real micro menu's width and that no menu button covers the "Show fewer" line.]
- If it fails, paste: a screenshot of the tracker and strip, and `/vg errors`.

### 33.74 Quest arrow: title over the distance at larger Text sizes

- Do: with the quest arrow showing, look at it at Text size 100%, 125% and 150%, pinned (Shift-click a quest in the tracker) and free.
- Expect: the quest title stands on the panel's middle line and the distance line hangs under it, with a clear gap at every size and both inside the panel; pinned, the title still stops short of the Pin button. [Needs in-game check: whether the two lines were already drawn over each other at 100% before this change, and how they sit now.]
- If it fails, paste: a screenshot of the arrow at 100% and 150%, and `/vg errors`.

### 33.75 Quest-start map pins' edge at each zoom

- Do: with quest-start pins showing (Quest guidance on), open the world map windowed, then maximized, then zoom in and out on a zone with several pins.
- Expect: each pin's gold "!" sits on a small square whose edge stays one crisp pixel at every zoom, the same size throughout. [Needs in-game check: the client's real canvas scales and how the edge looks at them.]
- If it fails, paste: a screenshot of the pins zoomed in and out, and `/vg errors`.

### 33.76 Scroll lists' soft edges over a panel texture

- Do: General → Look → Panel texture "Carved stone" (then "Fine grain"); open the options window on a long page and scroll it a little down, then look at the strip under the header and over the bottom edge; do the same in What's new and the quest log.
- Expect: the fade at each scrolled end blends into the window; no plainer, darker, untextured band about 24 units tall stands out from the textured panel beside it. [Needs in-game check: the harness can't composite alpha. If the band shows clearly, turn the soft edges off while a texture is drawn (B1-9 option a).]
- If it fails, paste: a screenshot of the options window scrolled, with the texture name, and `/vg errors`.

### 33.77 Meter on: target of target, tooltip corner and quest tracker at 1365 to 1833 wide

- Do: turn the Vanguard meter on (`/vg meter on`) at 1365x768, then at 1920x1080 at UI scale 1 (1440 wide or 1600 wide if you have it), with a target and a target of target, a quest tracker with a few quests, and a unit tooltip showing in its corner; turn the meter off and on again.
- Expect: under 1838 wide target of target sits over the target's cast bar and the meter (bottom right, above the bags and menu bar) does not cover it; with the meter off target of target goes back to its spot outside the target at 1600 and wider. [Needs in-game check: the meter still meets the tooltip corner and the foot of the quest tracker at 1365 (the harness measured only target of target); say which draws on top.]
- If it fails, paste: a screenshot at 1365x768 with the meter on, and `/vg errors`.

### 33.78 Shaman totems above the player frame, chat tiles clickable

- Do: on a shaman with Class bars on, at 1365x768 (or 1440x900) with the default chat, drop a totem or two, then click the chat's Find and Copy tiles at the right end of its tab bar, and right-click a totem to destroy it.
- Expect: the totem row stands just above the player frame, over its left half, clear of the chat's tab bar and the Find and Copy tiles; both tiles open on a click and the right-click still destroys a totem; the cast bar, raid mark and pet frame are not covered by the row. [Needs in-game check: that nothing of the real client (the player's raid mark, the lifted cast bar) meets the row, and the Versus deck's top border.]
- If it fails, paste: a screenshot of the player frame and chat with totems down, and `/vg errors`.

### 33.79 Aura icons: timer at the bottom, stack count top right, smaller type badge

- Do: get a Magic, Curse, Disease or Poison debuff on yourself with timers on (the default for your own debuffs) and look at its icon; then look at a stacking debuff (Sunder Armor x5) on an enemy nameplate target at Text size 100% and 130%; also a buff with a timer on your player frame's row.
- Expect: the timer digits sit on the icon's bottom edge, the stack count in its top right corner, and the small type letter in the top left corner is unhidden by either; on the 18-unit nameplate icons the count and the timer may still touch at 115% and up. [Needs in-game check: how much of the letter glyph and the digits is readable, and that the fallback icons' countdown numbers (made while in combat) also sit on the bottom edge.]
- If it fails, paste: a screenshot of the icons at Text size 100% and 130%, and `/vg errors`.

### 33.80 Round minimap: info strip and quest tracker under its band

- Do: pick the Classic look (General → Look → Theme variant), reload, and look at the minimap's top right corner on 1365x768 and 1920x1080; then set Minimap shape to Square and reload again.
- Expect: with the round map, the info strip starts below the map's bottom band (the coordinates text sits clear of the durability row) and the quest tracker follows under the strip; with the square map the strip sits right under the map as before. [Needs in-game check: the real round map's bottom band against the strip's first row.]
- If it fails, paste: a screenshot of the minimap and strip, and `/vg errors`.

### 33.81 Loss of control against the talking head on a 768-tall screen

- Do: at 1365x768, get stunned or feared (a duel, a mob) while a talking head line plays (a quest giver's or an event's), and look at where the two panels meet; with `/vg unlock` note which of the loss-of-control and talking head handles is on top.
- Expect: the loss-of-control panel (a little above your character) and the talking head (top left) touch by about 22 units and neither one's text is cut off. Which one draws on top is the thing to report: if the talking head covers the loss-of-control text, raise Loss of control's strata in `Modules/GameAlerts.lua`; if loss of control is already on top, leave it as it is. [Needs in-game check: the draw order of the two game frames, which the harness does not have.]
- If it fails, paste: a screenshot of both panels, which one was on top, and `/vg errors`.

### 33.82 Chat spot: the typing box on screen, a narrower chat on small screens

- Do: with a fresh profile (or `/vg reset chat`), press Enter in the main chat and type a few letters; then `/vg unlock` and drag the chat to the bottom-left corner and the bottom-right corner. On a small screen (1280x800 at the game's UI scale, 1024x768) log in on a new character and look at the chat beside action bar 1.
- Expect: the typing box sits fully on the screen with its text whole, its bottom on the screen's edge; the chat's handle stays on its window at the default spot and stops with the box's bottom on the edge when dragged down; with the chat parked right, the side buttons stay in view after `/reload`. On the small screen the chat is 296 wide at 1229 units and about 320 at 1280, clear of action bar 1; a 1024 wide screen still meets the bars (setup's Fit my screen is the answer). The tab bar is at most as high as before and the pet bar is clear of the panel. [Needs in-game check: the client's clamp of the handle, and that the box is not cut at the bottom.]
- If it fails, paste: `/vg frame ChatFrame1` and a screenshot of the bottom-left corner.

### 33.83 Raid tiles: names, Scale and Opacity

- Do: in a 25 or 40 player raid (or `/vg preview 25` and `/vg preview 40`) look at the tile names and the status text ("Dead", "Offline", missing health). Then `/vg unlock`, select the raid frames' handle and set Scale to 150% and Opacity to 50%; then apply the Healing layout in setup (raid frames 115%).
- Expect: names keep seven or eight letters (a name like Aldren or Brielle is whole), and a long status such as "Offline" ends in "..."; the tiles follow the handle's Scale and Opacity (a party and a 25 grid grow, a raid of 26 to 40 keeps its compact size unless the Scale is below 100%), and the Healing layout's party and 25 grid look larger than before. With the Healing layout and party pets on, the party grid reaches the pets column (move either with unlock). [Needs in-game check: the real font's widths.]
- If it fails, paste: a screenshot of the tiles and `/vg frame Vanguard_Raid`.

### 33.84 Raid target icon on the tile's top edge

- Do: mark a party member with the skull, then a raid member, on a party or 10-man tile at Text size 100%; also mark the group leader.
- Expect: the mark is 10 wide, centered on the tile's top edge like the leader crown and clear of the name, and does not clash with the crown on a marked leader. [Needs in-game check: that the mark reads at 10 units.]
- If it fails, paste: a screenshot of a marked tile.

### 33.85 Meter spell panel beside the meter, over no action bar

- Do: with the meter on, click a meter line at the default spot on a wide screen (1920x1080) and again at 1365x768; then drag the meter to the left edge of the screen and click a line.
- Expect: on the wide screen the panel opens on the meter's right, on the screen and over no action bar; at 1365 wide it opens on the meter's left with its bottom a gap above bar 1; a meter at the left edge opens it on its right. Under 1110 wide the meter itself still meets the right end of bar 1 (setup's Fit my screen is the answer).
- If it fails, paste: a screenshot of the panel and the bars.

### 33.86 Quest dialog with many reward cards

- Do: talk to a quest giver whose quest has a long text and six reward choices (a class or dungeon quest), at 1920x1080 and at a smaller canvas.
- Expect: the dialog is taller than for a quest without cards, grows upward, and the quest text keeps a readable window (more than three lines); on a short screen it stops short of the screen's top and the text scrolls.
- If it fails, paste: a screenshot of the dialog.

### 33.87 Untrack in Portuguese and Russian

- Do: set the game to Portuguese (Brazil) and then Russian, open the quest log (L), select a watched quest.
- Expect: the button reads "Não rastrear" and "Не следить" whole, with nothing cut at the default Text size.
- If it fails, paste: a screenshot of the quest log's buttons.

### 33.88 Posting guide steps wrap at larger Text sizes

- Do: open the auction house on the Posting tab with an item on the Sell card, in German (or French or Russian), and set Text size to 100%, then 115%, 130% and 150% with the card open.
- Expect: at 100% the four steps (1 Item, 2 Preis, 3 Post, 4 Eingestellt) stand in one row; at the larger sizes the step that no longer fits starts a second row at the card's left, nothing runs past the card's right edge, and the line saying what to do next sits under the last row, clear of Your auctions. [Needs in-game check: the real font widths decide at which size each language wraps.]
- If it fails, paste: a screenshot of the Sell card at 130%, and `/vg errors`.

### 33.89 Instance prep card: Buy list in a long language

- Do: set the game's language to Russian, then Spanish or French; carry less than the card asks of a reagent your class needs (with the Auction helper on) and type `/vg prep`.
- Expect: Buy list shows its whole word beside the X, as wide as it needs; the title "Instance prep" in its translation ends before the button, with "..." where it does not fit, and never runs under it. [Needs in-game check: the real font widths of the title and the label.]
- If it fails, paste: a screenshot of the card, and `/vg errors`.

### 33.90 Merchant quantity window: the panel under Stack, Max and the cost line

- Do: at a vendor that sells stackable goods (a reagent or food vendor), with Town and gear, Merchants, "Stack and Max buttons on a merchant item's quantity window" on, shift-click an item in the middle of the list, then one at the top and one at the bottom; also try it with the item on the second column.
- Expect: the game's quantity window opens with a dark panel hung from its bottom left holding Stack, Max and the "Max N for <money>" line, all inside the panel and nothing drawn bare over the merchant's rows; the panel covers the clicked row and the one below it (so you cannot click through to them) and closes with the window; shift-clicking an item in your bags shows no panel. [Needs in-game check: where the game puts the window (its bottom left on the clicked item), how much of the list the panel covers, and whether the panel is wide enough for the real window.]
- If it fails, paste: a screenshot with the window open on the middle row, and `/vg errors`.

### 33.91 Options pages in tabs

- Do: open `/vg` → Chat. Click each tab along the top, then press Left and Right a few times. Change "Copy button in the chat's tab bar" on Chat extras, go to General and back to Chat, then close `/vg` and open it again. Open Action bars and Modules (click a few Modules tabs, then set Show to Off). Search "keep chat history" and press Enter. At Text size 130 % and in German or Russian, look at the Action bars and Town and gear tabs.
- Expect: each page shows its name with Reset this page at the right, a row of tabs under it and one card at a time; the clicked tab is raised onto its card and plays the page sound; Left and Right walk the tabs and wrap; Chat extras wears the small accent dot after the change and Chat reopens on the tab shown last; Action bars' ten tabs run onto a second line with nothing cut; on Modules the note and Show stay above the tabs on every tab; the search opens Chat on the Chat history tab with the row marked; no tab name runs past its tab or the window, and the card under the tabs scrolls when it is taller than the window. [Needs in-game check: the real font widths decide where the tabs wrap and whether a long name is cut.]
- If it fails, paste: a screenshot of the page, and `/vg errors`.

### 33.92 Buffs after a /reload during a fight

- Do: with Vanguard's buffs on, start a fight with a training dummy or any mob (get into combat and stay there), type `/reload`, and watch the top right of the screen until you are in the world again. Stay in the fight for a while, look at the buffs and debuffs, then end the fight.
- Expect: for the rest of the fight the game's own buff and debuff frames are still up, and nothing of Vanguard's buff block shows; after the fight ends Vanguard's buffs and debuffs replace them in one step, with none of the game's frames left behind. [Needs in-game check: whether the client reloads you with the combat lockdown on, and whether the game's buff frames come back on their own after the reload.]
- If it fails, paste: a screenshot during the fight and one after it, and `/vg errors`.

### 33.93 Vehicle, possess, override and temporary shapeshift bars on action bar 1

- Do: `/dump C_ActionBar.GetVehicleBarIndex()`, `/dump C_ActionBar.GetOverrideBarIndex()` and `/dump C_ActionBar.GetTempShapeshiftBarIndex()`. As a priest cast Mind Control on a mob, then get into a quest vehicle or get a quest's override bar, then take a quest's temporary shapeshift (a transform that swaps your bar), with action bars 6 and 7 turned on and holding spells.
- Expect: the dumps print 16, 18 and 17; in each state action bar 1 shows and casts the abilities the game gives, not the spells of bar 6 or 7, and your own bar 1 comes back when the state ends; Mind Control (possess) shows the possess abilities on bar 1. [Needs in-game check: the real page numbers, and which page the possess state uses.]
- If it fails, paste: the three dumps, a screenshot of bar 1 in the state, and `/vg errors`.

### 33.94 Click-casting page open during a fight

- Do: open `/vg` → Click casting and leave it open, start a fight, then move the pointer onto the test tile and press a movement key and an action keybind; also click a grid cell or capture a hover key during the fight to open the spell picker and press the same keys.
- Expect: movement and your keybinds keep working while the pointer is on the test tile and while the spell picker is open; the tile and the picker still take clicks; out of the fight the tile and the picker read keys again. [Needs in-game check: that the game gets the keys the tile and the picker would otherwise swallow.]
- If it fails, paste: which control held the keys, and `/vg errors`.

### 33.95 Popups after a Bind-on-Pickup roll, then deleting an item

- Do: type `/console taintLog 2` and `/reload`. In a group, roll Need or Greed on a Bind-on-Pickup item and confirm the popup that asks. Later in the same session, drag a bag item you don't want out of your bags, click Yes (type DELETE if asked), then open a few other popups (abandon a quest and cancel, try to log out and cancel).
- Expect: the item is deleted with no "Interface action failed because of an AddOn" and nothing about Vanguard in the taint log; every popup has the flat Vanguard panel and shadow a little past its edges, its close button in the panel's corner, and is no taller than its text and buttons need (no empty band at the bottom); the panel shows and hides with its popup and never stays on screen after one closes. [Needs in-game check: the harness cannot follow taint carried by a value the game reads, nor draw order between the popup and its panel.]
- If it fails, paste: `/vg errors`, a screenshot of the popup, and the lines naming Vanguard in Logs/taint.log.

### 33.96 Edit Mode after a bar setting change, then a fight with shapeshift

- Do: type `/console taintLog 2` and `/reload`. Open Edit Mode, look at the window and its options list, click an action bar or the stance bar and change a setting in its settings dialog (rows, icon padding or orientation), save and close Edit Mode. Then, as a druid, warrior or other class with a stance bar, fight and change form or stance a few times.
- Expect: Edit Mode's window, its options list and the settings dialog keep the flat Vanguard panel, the line over the expander and the line between Revert and the extra buttons; Vanguard's note sits under the window as before; no window is taller than before; the fight shows no blocked action and nothing about Vanguard in the taint log. [Needs in-game check: the harness cannot follow taint carried by a value the game reads, nor the Edit Mode window's real draw order.]
- If it fails, paste: `/vg errors`, a screenshot of Edit Mode, and the lines naming Vanguard in Logs/taint.log.

### 33.97 Turn in a quest with no reward choice

- Do: take a quest that offers no choice of rewards (most low-level quests) and finish it. Turn it in once with Vanguard's quest dialog (press Complete or Space on the reward page), then switch on Turn in finished quests under `/vg` → Quests, finish a second such quest and talk to its giver. Run `/vg errors` after each.
- Expect: both quests are handed in and the reward is taken; no error line mentions GetQuestReward. [Needs in-game check: the client's argument check for the legacy GetQuestReward decides whether the number 0 is accepted; the harness accepts anything.]
- If it fails, paste: `/vg errors` and the quest's name.

### 33.98 Auction house: Search list on a slow realm, and fights at the house

- Do: at the auction house on a busy realm, open Lists and press Search list on a list of five or more items, and watch the rows. Then start a full scan and walk into a fight (a pet or a damage-over-time effect keeps you in combat) before the scan finishes. Then, in combat, open the auction house. Last, with Search results showing, hover a listing, press Up and Down, then enter a fight with the mouse still over the table and press your action bar keys.
- Expect: a row never says "none up" for an item the answer was not about (a slow item stays blank until its own answer or the 2 second give-up); the scan finishes and stores prices though a fight began; the house opened in combat still gets the Lists and Posting tabs; in the fight the action bar keys work again at once. [Needs in-game check: how late a real realm answers, whether the client keeps the auction house open in combat, and how it routes keys after the table gave up the keyboard.]
- If it fails, paste: the row that was wrong with its list, and `/vg errors`.

### 33.99 Raid tools as leader: Ready, Pull and Raid

- Do: lead a party (a second character or a friend), so the raid tools bar shows. Click Ready. Click Pull with the left button, then right-click Pull during the countdown. Click Raid. Run `/vg errors`.
- Expect: Ready starts the game's ready check; Pull starts a 10 second countdown and the right-click cancels it; Raid turns the party into a raid; no "reserved for the Blizzard UI" message names Vanguard and `/vg errors` is empty. [Needs in-game check: whether a click from addon code may call C_PartyInfo.ConvertToRaid (Raid still does), and that the macro buttons start /readycheck and /countdown on Forever.]
- If it fails, paste: the game's message word for word (which button), and `/vg errors`.

### 33.100 Separate bag windows keep the game's Sort button, and the bank's slots take the Vanguard look

- Do: turn off `/vg` → Bars and bags → Combined bag and reload (or pick separate bags in the game's own bag menu). Open the backpack. Then turn the combined bag back on, reload, and open the bag. Visit a banker, open the bank and turn to a second tab if you have one. Run `/vg errors`.
- Expect: the backpack window of separate bags shows the game's own sort button in its top-right corner, and it sorts; the combined bag shows Vanguard's Sort beside the search box and not the game's; every bank slot is a square slot with a thin border in its item's quality color (no round game art), on each tab; `/vg errors` is empty. [Needs in-game check: the backpack's sort button is the game's and stays shown through a search and a bag change, and the bank's slots are skinned on every tab.]
- If it fails, paste: which bag mode, whether a sort button shows on the backpack, what the bank's slots look like, and `/vg errors`.

### 33.101 Bulk buy at a merchant on Forever

- Do: at any merchant that sells a stackable item for gold (water, food), shift-click the item so the game's quantity window opens. Click Stack. Run `/vg errors`.
- Expect: a small panel under the quantity window holds Stack and Max and a line saying what Max costs; Stack buys one merchant stack of the item; `/vg errors` is empty. [Needs in-game check: the Forever client's C_MerchantFrame.GetItemInfo gives the price, pack size and stock the panel needs, now that the old GetMerchantItemInfo is gone.]
- If it fails, paste: the item, whether the panel showed and what its line read, and `/vg errors`.

### 33.102 Click-cast Add key into a fight

- Do: open `/vg` → Click casting → Keys while hovering a frame and click Add key, so it reads "Press a key, click or scroll...". Before pressing anything, get pulled into a fight (pull a mob with a second character, or stand where one aggroes). Press 1 (an ability on your bar). After the fight, click Add key in the fight's place again, in a fight. Run `/vg errors`.
- Expect: as the fight starts, Add key reads "Add key" again; pressing 1 fires the ability on your bar and no spell picker opens; clicking Add key during a fight changes nothing; `/vg errors` is empty. [Needs in-game check: the button's keyboard is released as the fight starts, before the client's lockdown, so the first key of the fight reaches the game's binding.]
- If it fails, paste: what Add key read when the fight started, whether 1 fired or a spell picker opened, and `/vg errors`.

### 33.103 Retail login with no Vanguard error

- Do: on a Retail 12.x client (not Forever), log in with Vanguard on, then `/reload`. Look at the chat and the error badge. Run `/vg errors`.
- Expect: no "event GAME_RULES_CHANGED: not on this client" line in chat, the error badge stays off and `/vg errors` is empty; on Forever `/vg realm` still names the ruleset. [Needs in-game check: that Retail's C_EventUtils.IsEventValid is the only thing that reported the event, and that nothing else Forever-only is registered at a Retail login.]
- If it fails, paste: the chat lines Vanguard printed at login and `/vg errors`.

### 33.104 Tooltip on a friendly nameplate buff in a dungeon

- Do: on Forever, in a dungeon with a party member, turn on friendly nameplates and their buffs in the game's nameplate settings, with Vanguard's tooltip anchor at its default (the corner). Mouse over a buff icon on the party member's nameplate, then over your own player frame. Run `/vg errors`.
- Expect: the buff's tooltip opens where the game puts it (beside the icon, not in Vanguard's corner), the error badge stays off and `/vg errors` is empty; over the player frame the tooltip is in the corner as usual. [Needs in-game check: that the client restricts the tooltip's anchoring or forbids its owner there, so the hook leaves the tooltip alone, and that no "forbidden object" error reaches `/vg errors`.]
- If it fails, paste: `/vg errors` and where the buff's tooltip opened.
### 33.105 Raid target icons on the raid tools bar

- Do: lead a party (a second character or a friend), so the raid tools bar shows. Target a mob or your party member. On the bar's second row, click the skull, then click the skull again, then another icon, then the last button on the row. Do the same once during a fight. Run `/vg errors`.
- Expect: the skull lands on your target and stays when clicked again, the other icon replaces it, the last button clears it, in the fight too; no "reserved for the Blizzard UI" message names Vanguard and `/vg errors` is empty. [Needs in-game check: that the game's secure raidtarget action sets and clears a mark from Vanguard's buttons on Forever, since SetRaidTarget is reserved for secure code there.]
- If it fails, paste: which button did nothing or what the game's message said word for word, and `/vg errors`.
### 33.106 Talking head and loss of control on their spots, then Edit Mode

- Do: with Loss of control on and Talking head set to "move" (the defaults), type `/console taintLog 1` and `/reload`. Trigger a talking head (a quest or story line that plays one) and a loss of control (a stun or fear from a mob). Open Edit Mode (Escape, Edit Mode), move any game frame, click Save and close it. Run `/vg errors`, then `/console taintLog 0` and open `Logs/taint.log` in the game folder.
- Expect: both alerts show on their Vanguard spots (the talking head at the top left, the loss of control band just above the screen's centre), before Edit Mode and again after it closes; no "Interface action failed because of an AddOn" message names Vanguard while Edit Mode is open or in the next fight; `/vg errors` is empty; the taint log has no line naming Vanguard and `editModeSystemAnchorDirty`. [Needs in-game check: that the client's SetPointBase exists on the two frames once loaded, so Vanguard's placing never runs Edit Mode's SetPoint override, and that the taint log stays clear of it.]
- If it fails, paste: the game's message word for word, the taint log lines naming Vanguard, and `/vg errors`.
### 33.107 Craft cooldowns noted on opening a profession

- Do: turn on `/vg` → Town and gear → Craft queue. On a character with a profession recipe on a cooldown (a transmute, a cloth speciality, a daily craft), open that profession window, then type `/vg craft cd`. Run `/vg errors`.
- Expect: `/vg craft cd` lists the recipe with the time left (such as "2h 5m"), not "No profession cooldowns noted yet"; `/vg errors` is empty, with no "Usage: C_TradeSkillUI.GetRecipeSchematic" line. [Needs in-game check: that the Forever client reads the cooldown through GetRecipeSchematic with its isRecraft argument and names the recipe.]
- If it fails, paste: the `/vg craft cd` line and `/vg errors`.

### 33.108 Unlock with the Chat mover on, and whether the client hides the chat window's size

- Do: with Chat on (its Chat frame is a mover by default), type `/vg unlock` right after login, then `/run print(issecretvalue(ChatFrame1:GetWidth()), issecretvalue(ChatFrame1:GetScale()))` and press Escape. Do the same after a fight ends, and again inside a dungeon. Run `/vg errors`.
- Expect: each time, every frame's handle shows (the Chat handle over the chat window) and the Exit bar is there; the printed line says what the client answers (note it, true or false, for each place); `/vg errors` is empty. [Needs in-game check: whether the 12.1 client ever hides the chat window's width, height or scale from addons; the guards that keep unlock mode and a frame anchored to Chat working only matter if it does.]
- If it fails, paste: which handles showed, the printed line and where you were, and `/vg errors`.

### 33.109 German client: the guild message of the day links its address

- Do: on a German client in a guild whose message of the day holds a web address (set one with `/gmotd Raid um 8, discord.gg/abc` if you can), log in or `/reload`.
- Expect: the "Gildennachricht des Tages" line shows the address as an accent link, its closing quote outside the link; clicking it opens the copy box. [Needs in-game check: the German template's `%1$s` and the quotes.]
- If it fails, paste: the line as shown and `/vg errors`.

### 33.110 Russian or Chinese client: chat watch, chat filter and click casting

- Do: on a Russian (or Chinese) client, `/vg watch add` a 24-letter Cyrillic phrase, `/vg filter add Продам`, then have a friend say "ПРОДАМ" in a channel; open `/vg` → Click casting.
- Expect: the phrase is added (not refused as too long); the line in capitals is caught by the filter; a binding without a spell icon (Target, Unit menu) shows its whole first letter, not a broken glyph.
- If it fails, paste: the chat lines and a screenshot of the click-cast grid.

### 33.111 A fight with a screen or key change, then the end of the fight

- Do: with Pixel-perfect scale on, start a fight and in it change the game's UI scale slider a few times, or rebind a key twice; end the fight.
- Expect: no long hitch when the fight ends (one repaint, not one per change); bars and keys are right afterwards; `/vg errors` is empty.
- If it fails, paste: how long the hitch was and `/vg errors`.

### 33.112 Boss fight with Vanguard's quest tracker and the game's boss frames

- Do: with Vanguard's quest tracker on and Vanguard's boss frames off (so the game's are used), fight a boss while a quest objective updates (kill a quest mob in the fight, or loot a quest item).
- Expect: no "Interface action failed because of an AddOn" and no blocked action in `/vg errors`; the game's tracker stays hidden and Vanguard's updates. [Needs in-game check: the game's tracker parked under a hidden frame in a boss fight.]
- If it fails, paste: the blocked-action line and `/vg errors`.

### 33.113 AFK screen after a ready check, and a closed Filtered tab

- Do: while at the keyboard, accept a ready check (or any popup), then `/afk`. Then, with the chat filter on, close the Filtered tab (right-click it → Close Window) and wait for a caught line; `/reload` and wait for another.
- Expect: the AFK screen shows after `/afk`. The Filtered tab comes back with the caught line, once (no second Filtered tab), and still after the reload.
- If it fails, paste: whether the AFK screen showed, how many Filtered tabs there are, and `/vg errors`.

### 33.114 `/vg frame` on a forbidden frame, and the Edit Mode layout switch on a profile load (launch-day checks)

- Do: in a dungeon with a friendly nameplate shown, `/vg frame NamePlate1 deep`. Then, with a profile that remembers another Edit Mode layout, load it on a character that used a different profile last time; after the chat line "Edit Mode layout …, from profile …" run `/dump issecurevariable(EditModeManagerFrame, "layoutApplyInProgress")`, then start any fight. Also tick the health-percent row under `/vg` → Nameplates and run `/dump issecurevariable(CVarCallbackRegistry.cvarValueCache, "nameplateInfoDisplay")`.
- Expect: `/vg frame` prints lines with no Lua error. Both dumps print true (the game's own state is not tainted), and no "Interface action failed because of an AddOn" shows at the start of the fight. [Needs in-game check: if either dump prints false and "Vanguard", say so in the project: the third stability hunt has a fix ready for the layout switch (offer a reload after it), and the nameplate setting would need a decision.]
- If it fails, paste: both dump lines, any blocked-action line, and `/vg errors`.

### 33.115 A raid of 11 or more: roster changes, the open Officer roster, Group threat and buff refreshes

- Do: in a raid of 11 or more (any raid scale; the Healing layout's 115% too), `/vg perf slow` and have members join, leave and move groups out of combat. Then open the Officer roster (`/vg loot roster`), pull a pack of mobs, and switch Group threat on for a boss fight. In a long fight, watch the raid frames' missing-buff marks as buffs are refreshed and fall off.
- Expect: no hitch on a roster change, and `/vg perf slow` shows no pixel-size work per change. The roster redraws when the group changes, not with every mob. Group threat follows threat about four times a second and switches at once with your target. A buff falling off still shows its mark. [Needs in-game check: the client stores a frame's scale as a float32; the fix compares scales with a tolerance.]
- If it fails, paste: the `/vg perf slow` lines and `/vg errors`.

### 33.116 Action buttons' usable tint, and the cooldown gaps row's manager cooldowns

- Do: run out of mana or rage with a spell on bar 1, then get it back; stand out of range of a target. With the Gaps row and "Add the manager's cooldowns" on, open the game's Cooldown Manager and compare its rows with the gaps row.
- Expect: the icon dims (blue for power) and comes back exactly when the game's own buttons would; range red still works. The gaps row shows no cooldown the manager hides until you add it.
- If it fails, paste: which button stayed the wrong colour, or which cooldown showed, and `/vg errors`.

### 33.117 BigWigs, Clique and SexyMap alongside Vanguard

- Do: with BigWigs only (no DBM), outside an instance, `/vg dock` and open the Combat tools page. With Clique loaded, look at its row on the Modules page's Other addons card. With SexyMap and Vanguard's Minimap off, look at a LibDBIcon minimap button and a Questie or TomTom minimap pin.
- Expect: `/vg dock` says where to drag BigWigs' bars, and the Boss mods row is there. Clique's row says its bindings don't reach Vanguard's frames. The buttons and pins sit on SexyMap's (or the game's round) map edge.
- If it fails, paste: the chat lines, a screenshot of the minimap, and `/vg errors`.

### 33.118 German, French or Russian client: bag filters, searches in small letters, prices and /way

- Do: on a non-English client, the bag Filter menu's Armor and Weapons; a bag, mail, click-cast spell and options search typed all in small letters for a name starting with a capital (Russian "о", German "ä"); a sell price typed "2,5" and (German) "1.500"; `/way 45,2 61,8`.
- Expect: the filters light armour and weapons; each search finds the name; the price reads 2.5 gold and 1500 gold; the waypoint goes to 45.2, 61.8.
- If it fails, paste: which one, what you typed, and `/vg errors`.

### 33.119 Second character's setup, and the auction scan after a clock change

- Do: on a new character of a set-up account, pick Share profile, then a layout, Next, and Back. At the auction house, if your computer's clock was ever wrong during a scan, look at the scan button.
- Expect: Back stops at the layout step once the layout is applied. The scan button waits at most 15 minutes.
- If it fails, paste: which step Back reached, the scan button's countdown, and `/vg errors`.

### 33.120 Auction house: scan countdown after a clock change, many deals, German prices, price alerts

- Do: at the auction house, if your computer's clock was ever ahead during a scan, open the house after putting the clock right and watch the scan button for a few minutes. After a scan that found many Deals and Upgrades, browse or search a few item lists whose names have not loaded yet, and look at the Lists pane's Deals and Upgrades counts and whether the window stutters. On a German client, type 0.125 in the Sell card's Price box, then 1.500. With a few shopping-list items that have a name (not an ID) and "Alert at or under the max price" on, scan the house.
- Expect: the button's "Next scan in" minutes count down from the moment you opened the house and never stay at 15. The Deals and Upgrades counts match the rows each list shows, and names fill in without stutter. 0.125 reads 12s 50c and 1.500 reads 1500g. The scan ends without a long freeze, and the alerts ring once, on one toast.
- If it fails, paste: the scan button's countdown at two moments, the count against the rows, what you typed and what the box showed, and `/vg errors`.

### 33.121 Pet trainer, slow shops, a specialty bag and the key ring

- Do: as a hunter with a pet, open a pet trainer; as a character with a profession slot free, open a profession trainer and click Train all. Put an item a merchant sells on your Keep stocked list for far more than one buy (for example 100 of an item that comes 20 a click) and open that merchant, ideally on a slow connection. With the general bags full and an empty quiver, ammo pouch or soul bag, shift-click water or food at a merchant, then arrows or shards if it sells them. With the Dungeon card on, carry a key on the key ring (Scarlet Key, Shadowforge Key or similar) and run `/vg prep`.
- Expect: at the pet trainer, Train all is greyed out with "Nothing to learn here right now." in its tooltip, and the game's own Train button still works; at the profession trainer, Train all learns the other skills but not a profession you have not learned yet, and the game's own Train button asks before taking that one up. Keep stocked buys a stack, waits for it to show in your bags (up to about 3 seconds), then buys the next, until you carry the amount; chat gives "Bought ..." and no "Stopped buying" unless the bags really are full. For food or water the quantity window's line reads "Can't afford one" and Max does nothing, since the specialty bag's slots are not counted; for arrows (quiver) or shards (soul bag) Max counts that bag's free slots. The card's "Keys:" line names the key; if it does not, run `/dump C_Container.GetContainerNumSlots(-1)` and `/dump GetKeyRingSize()` and paste both.
- If it fails, paste: which part, the chat lines and labels you saw, and `/vg errors`.

### 33.122 Combo points after a target switch, Exit on a flight, and a quest's choice of a stack

- Do: as a rogue (or a feral druid) with Combo points on, build points on one target, switch to another and hit it; the pips should follow. Take a flight path with action bars on, click Vanguard's Exit button part way, then fly the same route again to its end and again after that. Hand in a quest that offers a stack (10 bandages, say) against a single piece of gear that sells for more than one bandage but less than the stack, with "take the one that sells for most" on.
- Expect: the pips light for the new target at once, without waiting for an energy tick. Exit lands you at the next flight point; the flight bar of the route flown to its end counts down its full time, not the shortened one from the early landing. The crown and the automatic hand-in both go to the stack.
- If it fails, paste: what you clicked, the route, the bar's time, the two prices from the tooltips, and `/vg errors`.

### 33.123 Selling a random-suffix item, Keep stocked, the quantity window and undercuts

- Do: carry two random-suffix items of one kind ("of the Bear" and "of the Owl"), open a merchant and type `/vg sell ` then shift-click the Bear one; answer Sell. At a merchant with a limited-stock stackable item, open its quantity window (shift-click), let the item sell out or buy the last ones elsewhere, then click Stack. Put a random-suffix item up at the auction house when the same item with another suffix is up cheaper, then click Check undercuts. On a vendor item, hover it in your bags. With an "Auction successful" mail in your inbox, open the mailbox, close it, set your computer's clock five minutes off, and open the mailbox again.
- Expect: only the Bear item is sold (the question names one); Stack buys nothing and chat says "Nothing bought: the merchant closed or changed what it sells."; your auction is not marked undercut by the other suffix (it is when the same suffix is up cheaper); the item's tooltip shows one sell price line, not the game's and Vanguard's "Sells for" both; the sale shows once in Your history on the Up now card, not twice.
- If it fails, paste: which part, the item links, what was sold, bought or marked, and `/vg errors`.

### 33.124 Click casting ranks and Clear all, a resurrection while dead, a PvP quest, French objectives

- Do: as a healer, drag a lower rank of a heal (Heal Rank 2) from the spellbook onto a Click casting cell, then click a party member with it; click Clear all on the Click casting page and answer No, then again and answer Clear. With "accept resurrections" on, die, release, and have someone resurrect you while the game's popup still counts down. Take a quest that warns about PvP if one exists, from Vanguard's quest window. On a French client, look at a kill objective in the tracker and the quest log.
- Expect: the cast is Rank 2 (the combat log or the mana cost shows it); No keeps the bindings and Clear empties them; the resurrection is not taken until the countdown ends (the game's popup stays up until then); the quest shows the game's own PvP warning and waits for your answer before it is taken; the French objective shows its count at the right with a progress bar.
- If it fails, paste: the spell and rank cast, `/dump GetCursorInfo()` while dragging the rank, what the popup and chat said, the objective's text, and `/vg errors`.

### 33.125 Two rolls in a row, the group board under the mouse, AH + after a reload, a crafting count

- Do: in a group, have three players /roll for one item, then within 30 seconds /roll again for a second item. With the group board open on a busy channel, rest the mouse on a row for a minute, then click it. With "Your auction sales this session" on and a sale today, /reload. Type 1e999 in the Crafts box beside Add reagents and click it. Make a mail preset with the words "iron bar" and send it with Iron Bar and Iron Ore in your bags.
- Expect: the roll panel starts a new list for the second item, its top roll lit; the board's rows don't move while the mouse is on them, the click whispers the player its tooltip names, and new posts appear once the mouse leaves; "AH +" still shows the sale after the reload; chat says "Keep stocked for 999 x ..." and the Keep stocked counts are 999 crafts' worth; the preset attaches the Iron Bar, not the Iron Ore.
- If it fails, paste: the roll lines and the panel, who the whisper went to, the strip before and after the reload, the chat lines, what the preset attached, and `/vg errors`.

### 33.126 A full auction scan on two realms, a window drag, an old mail preset

- Do: run a full auction scan and note the number in chat's "prices for N items" line; log a character on another realm (or the other faction), scan there too, then log out and back in and wait 20 seconds before typing `/vg mem`. With the game windowed, drag its edge for a few seconds. Make a mail preset with the words "ore bar herb" (no commas, as 0.7.4 presets were) and send it at the Send Mail tab with ore and bars in your bags.
- Expect: no chat line about dropping a price home, and `/vg mem` gives a size of a 16.0 MB budget; the drag doesn't stutter more than the game does without Vanguard; the preset attaches nothing and chat says it found nothing holding every word of "ore bar herb", with commas separating alternatives.
- If it fails, paste: the "prices for N items" number from each scan, the `/vg mem` lines, how long the stutter lasted, the mail chat line, and `/vg errors`.

### 33.127 The realm's clock at login, for the auction price prune

- Do: with the Auction helper on and prices from a scan, type `/run print(GetServerTime())` right after the loading screen on a fresh login (before opening anything), and compare it with `/run print(time())`.
- Expect: the first prints a number within a minute or two of the second, so the login prune of old prices can tell a computer clock far off the realm's from a right one; `/vg ah` still counts the same priced items as before the login.
- If it fails, paste: both printed numbers, `/vg ah`, and `/vg errors`.

### 33.128 /vg frame on a frame the game keeps secret in a fight

- Do: start a fight in a dungeon, then type `/vg frame PlayerFrame deep` and `/vg frame Vanguard_Minimap deep`, and after the fight `/vg errors`.
- Expect: each command prints its full report, with `?` where the game hides a value (a position, size, text or anchor), and `/vg errors` shows no `slash frame` line.
- If it fails, paste: the `/vg frame` output, `/vg errors` and the client build.

### 33.129 The chat filter and the Filtered tab's selection, and the Combat Log's Close

- Do: with the chat filter off and Caught lines on the Filtered tab, tick the chat filter on in `/vg` > Chat while General is the selected chat tab. Then close the Filtered tab with its right-click menu, enter a fight, let a gold-selling line show in Trade (or have a friend send one), and wait for the fight to end. Last, in `/vg` > Chat > Chat tabs pick Combat Log in the Tab choice and press Close this tab, then try the same on a tab you made with New chat tab.
- Expect: General stays the selected tab (shown, with its chat box) when the Filtered tab appears, both on ticking the filter and after the fight; Filtered is one click away and holds the caught line. Close this tab on the Combat Log closes nothing and chat says "The game's own chat tabs can't be closed."; your own tab still closes.
- If it fails, paste: which tab was selected before and after each step, whether the chat box was still on screen, the chat line, `/dump IsBuiltinChatWindow(ChatFrame2)`, and `/vg errors`.

### 33.130 A key the game refuses in keybind mode, and Cmd on a Mac

- Do: bind Bar 1 button 1 to a key in `/vg keybind`, then hover it and press a key the game gives no name or won't bind (a media or other unusual key); note whether chat says "<key> can't be bound." and what the button's keys are in its tooltip. On a Mac, hover a button, hold Cmd and press 1, then hold Cmd and Shift and press 2, and look at the game's own Key Bindings list.
- Expect: the refused key leaves the button's earlier key in place (tooltip "Keys: ..." unchanged, nothing lost) and chat and the banner say the key can't be bound; a key named UNKNOWN does nothing at all. On a Mac the buttons show and bind Cmd-1 and Shift-Cmd-2 (the game lists them as META-1 and SHIFT-META-2), and plain 1 keeps its old owner.
- If it fails, paste: the key you pressed, the banner and chat lines, the button's tooltip before and after, the game's Key Bindings entry, and `/vg errors`.

### 33.131 Whether enemy nameplates are set once per account or per character

- Do: on a brand-new character (never logged in with Vanguard), log in, then type `/dump C_CVar.GetCVarInfo("nameplateShowEnemies")` and `/dump GetCVar("nameplateShowEnemies")`. Press V to turn enemy nameplates off, log out, log in a second new character and type the same two lines again.
- Expect: nothing is decided by this step; it records the third value of the first line (true when the game stores the setting once for the whole account, false when each character has its own) and whether the second new character's `GetCVar` came back as 1 although you turned them off on the first (Vanguard turns enemy nameplates on once at a character's first login).
- If it fails, paste: both new characters' output of both lines, in order, and `/vg errors`.

### 33.132 Setup open while the UI is hidden or an intro cinematic plays

- Do: create a new character on an account that has finished setup (or run `/vg setup`), and while the wizard is open watch the intro cinematic start and end; then on the Move step press Alt-Z, press Alt-Z again, and keep using the wizard (Next, then Done).
- Expect: the wizard is still open on the same step after the cinematic and after Alt-Z; frames stay unlocked on the Move step; chat never says "Setup opens again at your next login"; Done and the close button still end setup as before.
- If it fails, paste: the step the wizard was on before and after, whether the frames were still unlocked, the chat lines, and `/vg errors`.

### 33.133 Options and errors windows through Alt-Z twice

- Do: open `/vg`, press Alt-Z, then Alt-Z again, then press Up, Down, Tab and Enter in the options window; then with an error logged open `/vg errors`, press Alt-Z twice and look at the buttons.
- Expect: the arrow keys, Tab and Enter still walk the pages and settings without reopening the window, and the errors window still shows Clear beside Close (closing and reopening it behaves as before).
- If it fails, paste: which keys stopped working, whether Clear was missing, and `/vg errors`.

### 33.134 Minimap coordinates where the client hides your position

- Do: turn on the minimap coordinates and the quest arrow with a quest tracked, then walk into an instance and fight a few pulls; run `/vg probe` and note any C_Map.GetPlayerMapPosition line.
- Expect: the coordinates show numbers outside and go blank (not an error) wherever the client hides your position, the arrow keeps pointing or dims, and `/vg errors` lists nothing about "secret value" in the minimap coords ticker.
- If it fails, paste: the `/vg probe` map position line, `/vg errors`, and where you were standing.

### 33.135 Spec profiles follow the talent group on WoW Forever

- Do: on WoW Forever with dual spec unlocked, run `/dump C_SpecializationInfo.GetActiveSpecGroup(), GetNumSpecGroups()` in each talent group; in the Secondary group make a profile and open `/vg` > Profiles > Specialization, press "Use this profile for this spec", then swap to the Primary group in the talents window, and back, reloading when asked.
- Expect: the dump shows 1 in the Primary group and 2 in the Secondary with a second group of 2; the Profiles page says "Secondary talents use <profile>."; swapping to Primary offers the reload for the character's profile ("Your specialization uses profile ..."), and back offers the other profile; after each reload that profile is in use.
- If it fails, paste: the `/dump` lines in each group, the Specialization text on the Profiles page, the reload question, `/vg spec`, and `/vg errors`.

### 33.136 A duel to the death is declined on a Hardcore realm

- Do: on a WoW Forever Hardcore realm, turn on `/vg` > Game windows > Auto-accept > Decline duel requests, and have another player send you a duel to the death.
- Expect: the game's duel prompt closes at once and chat says "Declined a duel from <name>."; with the switch off the prompt stays up as usual.
- If it fails, paste: whether the realm is Hardcore, whether the prompt stayed up, any chat line, and `/vg errors`.

### 33.137 A theme font path the client can't load falls back to Fira

- Do: run `/run VanguardDB.profiles.Default.theme.font = [[Interface\AddOns\Gone\f.ttf]]` (the font path of a file that does not exist; use your profile's name in place of Default), then `/reload`; also try `/vg import` of a string whose theme font is that path.
- Expect: the windows and text show in Fira Sans Condensed with no "Font not set" error; the import names "Font not found: Interface\AddOns\Gone\f.ttf" and the game's own tooltip, error and zone text still show.
- If it fails, paste: `/vg errors`, the import lines in chat, and what `/dump (UIParent:CreateFontString():SetFont([[Interface\AddOns\Gone\f.ttf]], 12, ""))` prints.

### 33.138 Damage meter lines wear the theme on Forever

- Do: with GameTools and its Damage meter switch on, open the game's damage meter on WoW Forever, fight a dummy, then start a new fight so the list redraws, and open a player's breakdown.
- Expect: the player bars and your own line at the bottom show the theme's bar, font and cropped icon with the game's gold shading faded, and stay themed after the list redraws; the breakdown's lines match.
- If it fails, paste: a screenshot of the meter, `/vg status` and `/vg errors`.

### 33.139 A handle hidden in the middle of a drag stops following the cursor

- Do: run `/vg unlock`, hold the left button on a handle, and without letting go press Alt-Z (then repeat with a mob pull starting, and with Escape in setup's last step); release, show the UI, run `/vg unlock` again and move the mouse over the screen.
- Expect: the handle stays where it was and does not jump to the cursor; the same for the options window when you close it by Escape while dragging its title.
- If it fails, paste: which way you hid it, where the handle went, and `/vg errors`.

### 33.140 Minimap coordinates fill in after a loading screen while you stand still

- Do: with the minimap coordinates on, take a portal or hearth, and stand still once the loading screen ends; also `/reload` while standing still.
- Expect: the coordinates show numbers within a second of the screen coming back, without taking a step.
- If it fails, paste: where you were, how long the coordinates stayed blank, and `/vg errors`.

### 33.141 A browsed item the game hadn't loaded is priced once it loads

- Do: right after logging in, open the auction house and browse a trade goods category you haven't looked at this session; wait a few seconds, close the auction house, and hover one of the listed commodities in your bags or a vendor.
- Expect: its tooltip shows the "AH" price from that browse, including items whose names filled in a moment after the list appeared.
- If it fails, paste: the item, its tooltip lines, and `/vg errors`.

### 33.142 Cooldown Manager key text follows a swap that keeps the icon count

- Do: with the Cooldown Manager on and Cooldown Manager keys on, open the game's Cooldown Manager settings and swap two tracked spells in one row (or replace one with another), keeping the number of icons the same.
- Expect: each icon's key text changes with its spell straight away, with no reload or bar change needed.
- If it fails, paste: the two spells, their keys before and after, and `/vg errors`.

### 33.143 Escape on a dialog closes only that dialog

- Do: on a new character, open setup, pick a layout and press Escape; then open `/vg`, click Reset this page (or delete a profile) and press Escape at the question; then answer an export question after setup with Escape.
- Expect: each Escape closes only the dialog in front: the options window stays open behind the question, and the reload offer (or What's New) that follows setup or a No stays on screen instead of flashing away.
- If it fails, paste: which dialog, what was left open or closed, and `/vg errors`.

### 33.144 Late auction prices still fill in, without a stall

- Do: right after logging in, open the auction house and browse a big trade goods category you haven't looked at this session; watch the frame rate while the names fill in, then hover a listed commodity in your bags.
- Expect: no stutter while the names load, and the tooltip's "AH" price is there within a second of the names.
- If it fails, paste: the category, how long the stutter lasted, and `/vg errors`.

### 33.145 Chat tab switches work, and phrases in brackets ring

- Do: under Chat → Chat tabs, tick and untick Show Officer (or another group) on a tab; then add the chat watch phrase `[Linen Cloth]` and have someone link Linen Cloth in a watched channel.
- Expect: the tab shows and stops showing that group, and the switch reads what the tab does; the bracketed phrase rings and shows the toast.
- If it fails, paste: the group, the tab, the phrase and the line, and `/vg errors`.

### 33.146 XP lock, a blank faction and leaving a group (and Korean rolls)

- Do: below the level cap, turn XP gain off and on at the XP-lock NPC if Forever has one; stop watching any faction; as a healer or tank in a group, leave it and hover gear in your bags; on a Korean client, `/roll` in a group.
- Expect: the XP bar hides as XP is locked and comes back when unlocked; no blank reputation bar; after leaving, the upgrade lines use the damage weights (`/vg weights` says role damage); the roll shows in the roll tracker.
- If it fails, paste: which part, what showed, and `/vg errors`.

### 33.147 The bag bar on retail, and the changed-setting mark

- Do: on a retail client, look at the bag bar's top row with bags in some slots; then open `/vg`, change a switch and look left of its caption, at the page list and at the tab.
- Expect: the backpack and every bag sit on slots of one size, the backpack shows a backpack icon with only Vanguard's free count in its corner, and the game's fold arrow sits between it and the bags; the changed switch has a small accent reset arrow left of its caption (click it: the default comes back and the arrow goes), and its page and tab each show a small round dot.
- If it fails, paste: a screenshot of the bar or the row, and `/vg errors`.

### 33.148 Quests in other zones, and tooltips hidden in a fight

- Do: with quests in two zones, zone into one of them and open Vanguard's quest log (L); then switch on Hide unit tooltips in combat (Game windows → Tooltips) and mouse over a mob during a fight.
- Expect: the other zone's quests are listed under their header and counted, and the XP bar's quest lines include them; in the fight no unit tooltip shows, and out of it they show with the class border.
- If it fails, paste: the zones and quests missing, or what the tooltip did, and `/vg errors`.

### 33.149 Keybind mode's Screenshot key, and dragging a bar spell to a macro icon

- Do: in keybind mode, point at a bar button and press Print Screen; then open the macro window, start a new macro and drag a spell from a Vanguard bar onto the icon picker.
- Expect: a screenshot is taken and the button keeps its keys; the spell's icon is picked and the spell stays on the bar.
- If it fails, paste: what was bound or removed, and `/vg errors`.

### 33.150 The spellbook's level lines, and its plates under the mouse

- Do: on a low-level character, open the spellbook (P) on a page with spells you haven't learned yet, and move the mouse over a few spells.
- Expect: each "Level N" line under an unlearned spell reads in light grey on the dark page, lined up under the spell's name; no grey smudge shows behind a spell under the mouse.
- If it fails, paste: a screenshot of the page, and `/vg errors`.

### 33.151 Quest text and reward tiles on the dark panel

- Do: with Vanguard's own quest dialog switched off, talk to an NPC who offers a quest with item rewards, read its details and rewards pages, then open a quest you are on in the map's quest log (M) and look at its details.
- Expect: every line reads light on the dark panel: the objectives ("0/8 Boars slain", a finished one in muted grey), the Rewards heading, "You will receive" and "Choose one of these rewards", and any timer, group size or required money line; each reward tile is a square with a thin border and no gold name plate, in the quest window and in the map's details.
- If it fails, paste: a screenshot of the page, and `/vg errors`.

### 33.152 Spellbook pages, achievements and collections bars

- Do: open the spellbook (P) and turn a few pages; open the achievements window (Y), scroll a category, open a completed achievement with criteria, hover the summary's category bars and run a search; open the collections window's toy box and heirlooms.
- Expect: every page you turn to is dressed like the first (no parchment plates, light names), and a spell's flyout arrow, glyph mark or "not on your bars" glow still shows; achievement cards keep no bronze title bar or wave strips as you scroll, completed criteria read light (open ones stay grey, done ones green), the statistics rows have no stripes, the summary bars show no gold caps under the mouse, and every progress bar there and in the collections is a dim accent fill, not bright green.
- If it fails, paste: a screenshot, and `/vg errors`.

### 33.153 The character sheet and inspect window on retail

- Do: on a retail client, open the character sheet (C), its reputation tab, its titles and equipment sets lists (scroll them), and close and reopen it; inspect a player with no guild.
- Expect: no bronze plate behind any gear slot, no bronze corner pieces at the ends of the stats/titles/sets tab strip, no dark box over the model after reopening, and no faint stripe on every other title or set row; each reputation bar is a flat bar in a flat inset box, in its standing colour, with its text readable; in the inspect window the Talents button is themed and the greyed Guild tab sits inset, not raised like the open tab.
- If it fails, paste: a screenshot, and `/vg errors`.

### 33.154 Small windows on retail: ready check, rolls, mail, map and professions

- Do: on a retail client, be in a group for a ready check and a loot roll; open a mailbox with more than seven letters (and a crafting order mail, if you have one); open the world map; open a profession.
- Expect: the ready check's Ready and Not Ready are themed buttons; the roll window's Need, Greed, Pass and Transmog buttons sit on control tiles; the inbox page arrows are flat tiles; a crafting order mail's text reads light; the map's tracking filter and pin buttons carry Vanguard's icons with no gold ring or disc; the profession window's maximize and minimize buttons are Vanguard's glyphs.
- If it fails, paste: a screenshot, and `/vg errors`.

### 33.155 Menu icons, quick join cards and the talking head

- Do: with Vanguard's line icons on, hover and leave a few menu buttons, click one, and loot an item into a bag; open Social's Quick Join with a group listed and hover a card; trigger a talking head line.
- Expect: only Vanguard's line icons and bag slots show, before and after the hover, the click and the bag change, with no game icon or highlight showing under them; a quick join card shows no gold glow under the mouse and every queue line reads light; the talking head's name and text are in the theme fonts and still fade in.
- If it fails, paste: a screenshot, and `/vg errors`.

### 33.156 Action bars: pet battles, charges, macros (retail)

- Do: on a retail client, put a spell with charges (Fire Blast, Roll) and a `#showtooltip` macro for a spell that procs on a bar; fight until it procs; turn on Cooldowns' key labels and put that macro on a bar; start a pet battle and press 1 to 3, then finish it.
- Expect: the charged spell shows its charge count; the macro button glows when the spell procs and the Cooldown Manager icon for that spell shows the macro's key; in the pet battle Vanguard's bars are hidden and keys 1 to 3 use the pet's abilities; after it the bars and keys are back.
- If it fails, paste: `/dump GetActionInfo(<slot>)` for the macro button, which step failed, and `/vg errors`.

### 33.157 Cast bars, combo points and weapon enchants (retail)

- Do: on a retail client, as a shaman target a caster; as a rogue build past five combo points with a talent that allows it; apply a weapon oil or poison; start a profession craft and move to interrupt it; target an enemy casting something you can't interrupt.
- Expect: the shaman's interrupt diamond follows Wind Shear; the combo row shows six or seven pips; the weapon enchant shows in front of your buffs with its time; the interrupted craft's bar turns red, not green; the uninterruptible cast is grey.
- If it fails, paste: a screenshot, and `/vg errors`.

### 33.158 The bag and menu bar's slots

- Do: on retail, queue for a dungeon so the queue eye shows, then leave the queue; on Forever (Nov 4+), open and close bags, rearrange them, enter Edit Mode and drag the bag padding slider, then leave.
- Expect: on retail the menu row has exactly one slot per menu button, eye or not, and the bar is no wider than its buttons; on Forever the key ring slot stays a full square, no brass dividers show between bag slots, and the bags stay one slot and a gap apart after the padding change.
- If it fails, paste: a screenshot of the bar, and `/vg errors`.

### 33.159 The talking head and the game's quest tracker

- Do: trigger a Horde, an Alliance or a neutral talking head line (a faction quest NPC); then switch Vanguard's quest tracker off, reload, track a first quest and travel to a new zone so a tracker section appears.
- Expect: the talking head's name and text read light on the dark panel for every line; the game's tracker headers stay flat with no gold band or shine flashing back when a section appears.
- If it fails, paste: a screenshot, and `/vg errors`.

### 33.160 Minimap and Vanguard's tracker

- Do: turn on the game's own minimap coordinates in its Settings (Interface), where the client has them; on retail visit a place that uses the hybrid minimap (if you know one); with the tracker's order set to Like the game's, watch quests in two zones and travel between them; on retail accept a world or bounty quest.
- Expect: no second coordinates line under the minimap; the hybrid map shows over the panel with the markers on top; the watch list re-sorts on the new zone; the world or bounty quest is not added to the tracker.
- If it fails, paste: a screenshot, and `/vg errors`.

### 33.161 Tooltips and chat tabs

- Do: click an item link in chat; shift-hover a piece of gear so the comparison tooltips show; on retail click a battle pet link; hover a quest reward or a tooltip with styled edges; have someone whisper you while another chat tab is selected, then switch tabs.
- Expect: the Links window has the theme's close cross and its title still clears it; the "Currently Equipped" label is on a flat panel with light text; the battle pet tooltips are themed; no decorative edge art draws over a tooltip; the tab's new-message glow stays in your accent colour.
- If it fails, paste: a screenshot, and `/vg errors`.

### 33.162 Inspect, greyed tabs, quest money and achievement bars

- Do: on retail inspect a player with no guild; with Vanguard's quest dialog off, turn in a quest that asks for money; open an achievement with a counted criterion ("700/1000"); then change the accent colour under General with Achievements and Collections open.
- Expect: no bronze plates behind the inspect gear slots, and the greyed Guild tab's label is greyer than the others; the turn-in page's required money line reads light; the achievement's progress bar is a flat dim-accent bar with no bronze border; the achievement and collections bars take the new accent at once, without a reload, while class-coloured unit frames and cast bars keep their colours.
- If it fails, paste: a screenshot, and `/vg errors`.

Not built yet: the offer to turn off the game's tutorials in setup (decision 14a, batch 3's R3.6). It waits for a level-1 check in game. Its step will go here, after 33.38, when it lands.

## When you are done

Paste into the first message of the next Claude session: the `/vg report` block (or the output of `/vg status` and `/vg errors`), the list of failed step ids, your screen resolution and UI scale, and the client build from the status line. Failures become tasks in `docs/handoff/WORKPLAN.md` before the performance phase starts.
