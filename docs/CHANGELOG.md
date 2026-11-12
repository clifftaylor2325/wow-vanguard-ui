# Changelog

What changed for players in each release, newest first. In game, the same notes are the What's new window (`/vg whatsnew`), written in `Core/WhatsNewNotes.lua`; the website's release notes are written from this file's sections. Items marked *(off)* start switched off.

Vanguard is made by one person. Every change runs through a headless copy of the game client before it ships, and what has been checked in the game itself is recorded, step by step, in [smoke-results.json](smoke-results.json) against [SMOKE-TEST.md](SMOKE-TEST.md). If something looks wrong, `/vg feedback` writes the report for you.

## 0.9.6

<!-- SMOKE steps 2.1n, 2.1o, 7.2s, 7.2t, 7.2u, 9.2h, 9.6a, 10.4e, 10.4f, 14.9.5, 14.9.5a, 33.390a, 33.485, 33.486, 33.487, 33.488, 33.489, 33.490, 33.491, 33.492, 33.493, 33.494, 33.495, 33.496, 33.497, 33.498, 33.499, 33.500, 33.501, 33.502, 33.503, 33.504, 33.505, 33.506, 33.507, 33.508, 33.509, 33.510, 33.511, 33.512, 33.513, 33.514, 33.545, 33.546, 33.547, 33.548, 33.549, 33.550, 33.551, 33.552, 33.553, 33.554, 33.555, 33.556, 33.557, 33.558, 33.560, 33.561, 33.562, 33.563, 33.564, 33.565, 33.566, 33.567, 33.568, 33.568a, 33.569, 33.570, 33.571, 33.572, 33.573, 33.574, 33.575, 33.605, 33.606, 33.607, 33.608, 33.615, 33.616, 33.617, 33.625, 33.626, 33.627, 33.628, 33.629, 33.635, 33.636, 33.637, 33.638, 33.639, 33.640, 33.641, 33.642, 33.643, 33.644, 33.645, 33.646, 33.647, 33.648, 33.649, 33.650, 33.651, 33.652, 33.653, 33.654, 33.655, 33.656, 33.657, 33.658, 33.659, 33.660, 33.661, 33.662, 33.663, 33.664, 33.664a, 33.665, 34.16, 34.17, 34.18, 35.1, 35.2, 35.3, 35.4, 35.5, 35.6, 35.7, 35.8, 35.9, 35.10, 35.11, 35.12 -->

Modules that switch off and on without a reload, a bag fix for profession bags, and fixes from a 30-wave bug hunt across frames, auras, options, setup, quests, chat and the auction house. Nothing new in this release has been checked in the game yet.

### Bags and town (0.9.6)

- A profession bag's empty slots get their own section ("Empty: herb bag"), so the combined bag no longer counts them as room for anything when the game says your bags are full.
- Bag section headers refit after a Text size change.
- Train all runs once on a double-click, its summary matches what the trainer actually taught, and Keep stocked reads the list again before each purchase.
- Mail: Take all leaves game master mail, as the game's Open All does, and the Sales filter lists your sales, not auctions you won.
- The one-step junk sale waits for the end of a fight.

### Auction house (0.9.6)

- The Cancel question names the item ("Cancel Strange Dust? It costs 1s 0c.").
- Post waits for the sell card's price check, a per-stack price is for the stack that goes up next, and the sell card's cheapest and price are of the sale's own variant.
- A paid cancel marks the row that is listed when you click Yes, and Recent never rings a price alert.
- Recipes with more than 8 reagents (Retail) draw a row for each one.

### Modules and options (0.9.6)

- Many modules switch off and on at once under `/vg` → Modules, with no reload: chat history, filter, extras, windows and Quiet; data bars, the broker strip and HUD text; Situations, Cooldown keys and Cooldown glow, and more. A switch made in a fight applies when it ends.
- Options search: "changed" no longer dims the pages that hold changes, "reset" no longer lists every page's Reset this page, and Safer colours is found by its translated words.
- Twenty settings that need a reload now carry the grey reload tag, and Keybind mode pressed in a fight no longer closes the options window.
- A frame's position popover left open in unlock mode after its module is switched off no longer raises errors, and the unlock grid redraws after a UI scale or window size change.

### Setup and profiles (0.9.6)

- Undo setup puts the game's UI scale back and says what it really undid, and All set counts the layouts, presets and frames you moved.
- A profile whose settings are damaged no longer raises an error when chosen, and a spec change after Not now on lost settings keeps the newer backup.
- An import's backup no longer overwrites a profile another character still uses for a spec.

### Unit frames, auras and HUD (0.9.6)

- Level colours repaint at a level-up, and a unit that goes offline or dies loses its power text at once.
- Under Standards the focus target stands as a small banner beside the focus, and under Tabs the party and boss stacks spread by the tab's height.
- Heal and shield bars are cut to the health fill's shape.
- Picking a HUD layout moves its frames and keeps each one's scale, opacity and size.
- Raid aura icons follow a new tile size, and your buffs', your target's and the raid tiles' icons follow a scale change.
- Nameplates: an aura row the game holds back in a fight no longer raises an error, and a plate whose unit keeps failing is paused alone.
- A raid tile that fails no longer stops the others from painting.
- Game frames Vanguard hides take no clicks when the game puts them back in a fight.

### Action bars, keys and click casting (0.9.6)

- A hunter's Auto Shot shows the ammo count on WoW Forever, and an edited macro repaints its cooldown and tint at once.
- Saved bar sizes, spacing and button counts outside the sliders' limits are dropped at login.
- Key setup: a lower rank on a key's own button gives way to the top rank, and an unticked change stays unticked after a fight.
- Click casting: a spell rank you no longer have is marked, Import skips a key the frames can't bind, and the hover-key list scrolls.

### Quests, map and chat (0.9.6)

- With the quest dialog handed back, the game's own quest and gossip windows keep their own look, and abandoning several marked quests waits for the end of a fight.
- A Shift-click waypoint no longer loses to the quest the game tracks by itself, and Toggle Minimap in a fight no longer gets Vanguard blocked.
- Chat: a window dragged back into the dock stays docked, New chat tab no longer taints channel handling, and Close this tab gives the window's lists back as the game does.
- Chat watch finds words next to guillemets, a no-break space or a dash, and a new tab no longer takes a closed Filtered tab's number and its spam.
- A meter report to a channel is split under 255 bytes, and on WoW Forever declining strangers' group invites works again.
- The social window's side panels no longer overlap a window docked beside it.

## 0.9.5

<!-- SMOKE steps 1.3a, 2.1i, 2.1j, 2.1k, 2.1l, 2.1m, 6.2c, 7.1b, 7.2l, 7.2m, 7.2n, 7.2o, 7.2p, 7.2q, 7.2r, 7.5b, 7.5c, 7.5d, 8.3c, 8.4e, 8.4f, 8.6d, 8.6e, 8.6f, 8.6g, 10.3c, 10.3d, 10.4d, 10.9b, 12.1a, 18.2a, 20.3, 30.3, 33.217a, 33.471, 33.472, 33.473, 33.474, 33.475, 33.476, 33.477, 33.478, 33.479, 33.480, 33.481, 33.482, 33.483, 33.484 -->

The Shield look and its siblings, deeper unit frames, nameplate, aura and action bar settings that apply at once, a keystone and two layouts, and fixes across profiles, chat, quests and the auction house.

### HUD looks and layouts (0.9.5)

- Your frames point away from you as shields, bars filling toward you. HUD look: Plain keeps flat frames.
- Three more looks: Hairline (bare frames, a name row over thin bars), Rimmed (rounded and rimmed) and Tabs (names on tabs).
- Two layouts under General, Where the frames stand: The keep (a wall at the foot of the screen, on screens about 1100 units wide or wider) and Standards (tall banners either side of your character). Setup's layout step offers both. Picking a layout puts the frames it places at its spots.
- The keystone: the crest on a rail between your frame and your target's, swords in a fight.
- A ring round the keystone can sweep with the global cooldown. *(off)*
- A thin line runs inside your frame's rim and your target's, brighter in a fight.
- Under Shield the cast bars and action bar backing get cut corners, and action bars that touch share one backing.
- Setup's Comfort step offers Shield HUD look, recommended.

### Unit frames (0.9.5)

- Width and height sliders for the player, target, target of target, focus, pet and party frames, applied without a reload.
- Health as gains Both and Missing, and Show power as adds a small power line. Where the game hides a number, Both shows the percent alone and Missing the amount without its minus sign.
- Incoming heal and shield bars on your frame, your target's and the party's, and a row of status marks (leader, tank or healer, resting, PvP).
- Portraits for you, your target and your focus under Hairline, Rimmed and Tabs, as a 2D portrait or a class icon.
- A focus target frame stands beside your focus while it has a target.
- The pet's health text keeps clear of its mood glyph, and a warlock's soul shards show at the level-up to 10 without a reload.

### Nameplates and target auras (0.9.5)

- Plate width, height, aura counts and icon size are sliders, applied without a reload.
- Name text size and Health text size set the plate's texts, with no reload.
- Target plate size draws your target's plate larger, around its centre.
- A unit you can't attack can show just its name on its plate. *(off)*
- Target and focus auras get sliders for icon size and counts, all applied without a reload.
- Target's buffs shows All, Important or Yours.
- Aura icons on nameplates get a one-pixel edge, not dark blocks, on plates the game hands over shrunk.
- On WoW Forever an aura icon the game has closed to addons is left alone, so no "aura icon pixels" line in chat.
- `/vg errors` keeps a quiet entry if the game still refuses an aura icon.

### Action bars and motion (0.9.5)

- Macro names, Key text and Button spacing apply without a reload; spacing waits for the end of a fight.
- Auto-attack and Auto Shot buttons flash while the attack runs.
- Your keys shows the function row and a number pad, and a layout choice (Automatic, QWERTZ, AZERTY).
- State cues, one switch under General, Motion and sound: a brass pulse round your frame at the pull, a breathing ring on a proc button, a flash when a cooldown ends (none at the end of the global cooldown), and a vermilion ring at low health. The pulse and the ring are one-pixel outlines that follow your frame's shape. The cues follow Reduce motion.

### Tooltips (0.9.5)

- A player's tooltip adds their guild and rank, their realm if another, and their role.
- Your own tooltip shows your equipped item level.
- One switch adds Item ID and Spell ID to tooltips. *(off)*
- A profile that had Item IDs on keeps it on.
- Units in the world, units on frames and other tooltips each get a position.
- A tooltip position you had saved applies to all three kinds until you change one.

### Look (0.9.5)

- Window and page titles are a size larger, a step above card headings.
- The options header shows the painted crest and the Vanguard wordmark; your faction's crest moves to the footer.
- A class-colour swatch beside the accent presets sets the accent to your class colour.
- Each character on a shared profile gets its own class colour at login.
- The game's own text, in windows Vanguard does not skin, takes the theme font's face.
- The Modules page says so when its Show choice leaves nothing to list, with a Show all modules button.
- A page's card fades in when you change pages.
- Most texts that were still English now have translations in the ten other languages, as machine drafts.

### Quests (0.9.5)

- Use the game's quest windows for now hands the quest and gossip windows back to the game at once (for the session, not saved), and Hold a key to open the game's windows hands one talk to it.
- Zones folded in the game's quest log stay folded unless Vanguard needs them.
- Pick the reward that sells for most leaves the choice to you when a reward is a gear upgrade.
- The quest arrow and minimap spots hold their place in a fight, and are right again within a second of its end.
- The game's quest tracker text stays hidden when the game brings its tracker back in a fight.
- Abandon acts on the quest its row shows.

### Chat, group board and town (0.9.5)

- The chat filter's word lists and the group board's phrases come per language. A language with no filter lists shows no Gold selling, Boosting or Recruiting switch, with a note; your own words and the repeat rule work in every language.
- The Filtered chat tab is found by its window number, so renaming it no longer makes a second one.
- An empty saved keyword no longer makes the chat filter catch every line, and a damaged entry in a saved list no longer stops Chat watch or the waypoint list.
- The group board scrolls, so every post is reachable.
- The craft queue gets a panel beside the profession window, with a row per queued recipe.
- The talent plan can be put in an order (Order... on the planner's bar), and Spend planned buys in it. It counts only purchases the game confirmed.
- Return all never tries a mail the game deletes instead of returning, Keep stocked never asks for more than one purchase allows, and Train all does nothing at a pet trainer.
- Selling junk skips locked items and items in an equipment set, and a remembered bank is no longer replaced by an empty answer.
- At the auction house, Confirm posts only the item the sale was set up for, a buyout of 0 is no buyout, and a second click on Cancel doesn't repeat it.

### Setup, profiles and group play (0.9.5)

- `/vg profile <name>` matches the name in any case and asks before making a new profile; `/vg profile copy` and `delete` ask first, as the Profiles page does.
- Undo setup restores the profile it backed up, and a backup never overwrites a profile it did not make.
- On a first run, setup no longer ticks Filter chat or Key setup at your next login for you.
- Key setup opens by itself at your next login only if you ticked it.
- A stranger you whispered in the last ten minutes may invite you.
- Gear upgrades give no upgrade line or arrow to an off-hand item while you wear a two-hander alone, and an arrow for an item the game has not told Vanguard about yet appears when its data arrives.
- Merchant helpers off no longer drops the HUD text font, now its own module.

### Moved and retired (0.9.5)

- Pet stable and the Legacy helper are gone, with `/vg pets` and `/vg legacy`; the Legacy probe is `/vg probe legacy`. The two boss timer spots are movers under `/vg unlock` and `/vg dock` is gone. The officer roster is on the Raid frames page (Show or hide the roster) and works with the officer loot tools off. A profile's settings for the retired modules are dropped at load.

### Speed and safety (0.9.5)

- Raid tiles listen for heals, shields, threat and aura changes of their own member only, and their width and height are sliders that resize the tiles without a reload.
- The minimap's coordinates switch applies at once.
- Combo points ignore other powers' ticks, and the cooldown gaps row redraws once a frame.
- In a fight the game menu's Vanguard button and the quest log button leave the game's window to close after the fight.
- Your buff row is no longer moved in a fight when a weapon enchant comes or goes; it settles when the fight ends.
- The character pane's item levels read the item's detailed level, as its tooltip does.
- A character's saved-settings stamp no longer moves without its account note, which could bring a needless restore offer.
- Game windows, the fight recap, the damage meter and the minimap read values the game hides from addons more carefully, and one frame, nameplate, chat window or options row that fails no longer leaves the rest unpainted or the options window quiet.
- A dropdown opened in a fight puts no click catcher over the screen, and Exit without saving always locks the frames.
- A chat report under the game's chat restriction says why it could not be sent.
- `/vg status` ends with a count of game windows dressed, left as the game's, replaced, off or not made yet.
- `/vg status windows` names each window under its state.

## 0.9.4

<!-- SMOKE steps 33.390 to 33.470 -->

A guided setup, one Quiet the game area, a quicker login, and fixes across saved settings, chat, mail, the auction house and group play.

### Setup and options (0.9.4)

- Setup walks you through Vanguard's recommended settings. After Layout, Screen and Look come four guided steps, **Comfort**, **Game settings**, **Helpers** and **Combat**, with the rows Vanguard recommends for your role marked; then Move things and **All set**, which lists what the run changed and has **Undo setup** to put your settings and the game's back. A first run starts Vanguard's own rows on the recommended value. A run again (`/vg setup`, or Run setup on the General page) starts every row on what you have now, with **Use recommended** on each step, so Next through to Done changes nothing.
- Every setup step sits under a painting: the dusk banner, then your faction's scene, then the camp at night.
- Setup's Done offers no reload when you kept everything, and its screen and layout steps follow the screen and group role you have now each time setup opens.
- Long setting names are short. The old sentence is the row's tip, and options search still finds a row by it.
- A card you fold open or closed stays that way for that character, also after a reload.
- Buttons for what used to be typed: List this session's fights and Recap the last fight in chat (Combat tools), List my sell list in chat and Forget every merchant, which asks first (Town and gear), List the craft queue in chat, Put the newest ranks on my bars, What trainers teach next and List the perk plan in chat. The Chat and Situations pages get Move frames.
- A setting that is the game's own says so in its name (the camera zoom, enemy nameplates, timestamps, class colours), and Include yourself is labelled as applying in a party.

### Quiet the game (0.9.4)

- Declining duels, guild invites, group invites from strangers and Battle.net friend requests, and releasing at once in battlegrounds, move from Auto-accept to **Quiet the game** (Game windows). Hiding the errors the action bar already shows moves there from Merchant helpers. Auto-accept now only accepts.
- The choices you had carry over at login, and an older profile string carries them over as it is imported.

### Speed (0.9.4)

- Logging in is quicker: the aura icons for raid tiles and the nameplate frames are made when they are first needed, a few a frame, instead of all at login. A fight pauses the rest, and a player who lands on a tile in a fight gets its icons when the fight ends.
- Raid frames, nameplates, the group threat panel, the cooldown glow and the meter do less work in a fight.
- Saved auction prices stop growing: past 12000 items across realms and factions, the realm and faction with the oldest prices is forgotten first, never the one you are on.
- `/vg perf` also shows the time in boss fights and how many frames ran long. `/vg perf slow` times handlers through login, then only once you ask.

### Safety (0.9.4)

- The notice that your saved settings didn't load no longer comes back at every login when nothing was lost (a realm name spelled two ways made a character look older than it was). When a real one shows and what loaded is right, **Keep these settings** answers it, and chat mentions it only at the first login that finds it.
- On WoW Forever, nameplates no longer raise an "aura icon pixels" error out in the world.
- A part of Vanguard that fails ten times in a session is paused instead of repeating the error. `/vg errors` lists paused parts first and the Feedback page gets **Resume paused parts**; `/vg errors resume` and a reload run them again.
- `/vg errors` also lists the actions the game blocked Vanguard from taking.
- A game window a patch has reshaped keeps the game's own look instead of raising errors; `/vg errors` and `/vg report` name it once under Left off, and every other window is still skinned.
- The questions asked before gold, items, mail or an auction leave you (selling, a costly Stack buy, Return all, cancelling an auction) behave alike: none is asked in a fight, Enter alone never answers one, a Yes given after a fight began moves nothing, and what the question named is read again before anything moves. A buy also checks that the merchant still sells the item at the same price.
- Dragging an action off a bar button or dropping one onto it does nothing in a fight, and neither does placing a newly learned spell; both work again once the fight ends.
- When the game's enemy nameplates are off, Vanguard asks once per character whether to turn them on, and changes them only on a yes.
- Raid tiles and the menu strip finish their set-up after a fight when a fight got in the way, and aura icons are read afresh at a boss pull, a Mythic+ start and a PvP match start.

### Profiles and saved settings (0.9.4)

- After restoring lost settings and choosing Later on the reload, logout backs up the profile the next login loads, and the backup is taken after the modules' own logout work.
- After lost settings, only a newer copy of your key setup replaces the account's record, so one character's older copy no longer overwrites another's, also across a reload.
- A saved bar size, button count or row count that isn't a number of 1 or more is dropped at load instead of breaking every login.
- A profile brought over from Retail no longer makes WoW Forever's gear upgrades weigh item level.
- The Profiles page marks the profile the reload really loads when a talent group's own profile wins over your pick, follows Stop spec switching, and `/vg spec` for the current talents offers the reload.
- `/vg graphics undo` keeps its record with this computer, so a profile import or switch no longer loses it, and still finds a record an older Vanguard kept in a profile. Graphics apply sets outline mode only where your graphics card supports it on WoW Forever.
- Importing a talent plan asks before it replaces a plan that has points.
- A leftover Keep stocked list from 0.7.1 stays out of exports, imports and copies.

### Chat, quests and mail (0.9.4)

- Close this tab on a tab that shows a channel points you to the tab's own menu (Close Chat Window), which gives the channel back to the main window, also when the channel was added while the close waited for a fight to end.
- Restored chat: a restored Discord guild line can't be reported with Report Chat, a line printed while the game was still loading stays out of the restored block, and Find in chat lists a restored line once.
- The quest dialog's PvP and cost question goes away when the quest closes.
- A quest held on the arrow with Shift-click stays held through a reload, and chat prints no "Arrow:" line while the arrow is switched off.
- Mail's Take all stops with "your bags are full" at the first item that has no free bag slot, counting only general bags, so a quiver or a soul bag with room no longer keeps it trying every mail.

### Auction house, merchants and gear (0.9.4)

- Clicking a price alert toast shows the Buy page from any tab.
- The merchant's Stack and Max line names the limit that stops a buy (gold, stock or bag room), and a press says it in chat.
- The craft queue and the profession cooldowns work with the Auction helper off.
- A ledger sale stamped while the computer's clock ran ahead stops counting as this session's, and a bid win's mail joins only a sale it was read after.
- A shopping entry whose Deals or Upgrades switch is off on this profile gives way to your shopping lists.
- Gear upgrades compare a one-hand weapon with the weaker hand while you wear a weapon in each, and a WoW Forever shaman in the tank role weighs tank stats.
- Trainer memory is kept per faction, so a Horde alt's visit no longer fills an Alliance character's level-up lines.
- Two bag groups whose names differ only in capitals show as one section.

### Frames, bars and windows (0.9.4)

- A big raid's rows and the preview stay on the screen when the raid frames sit near the top.
- The Versus deck grows to wrap the rows your class adds to the player frame (combo points, totems, a druid's mana bar, the status chip), and the status chip sits clear of the totem and combo-point rows.
- The interrupt mark follows the interrupt you can use in your stance.
- Click casting's "Also on your unit frames" leaves the boss frames out, so a click there still targets the boss.
- A WoW Forever paladin's buff watch counts Blessing of Sanctuary.
- The meter's Deaths report says when each death happened, not an amount, and the Fights page says that a reload also forgets the fights.
- The info strip's Clock switch applies at the next reload, since the game puts its own minimap clock away only at login.
- WoW Forever's battleground scoreboard gets the themed close button and map name, an Enchanting recipe's item slot is themed, and the character pane's durability label rounds as the info strip does.

## 0.9.3

<!-- SMOKE steps 33.344 to 33.389 -->

Fixes across the bars, the game's windows, quests, chat and profiles. Nothing new to set up.

### Theme and nameplates (0.9.3)

- Changing the accent colour, the font or the UI scale after a dungeon no longer errors on plate icons the game has closed, and the change goes through to the end.
- Pixel-perfect's multiple follows the screen, so a pick made on a 4K screen no longer makes the UI twice as big at 1080p; a fixed multiple saved by setup in 0.9.0 to 0.9.2 goes back to following the screen.
- Debuff type badges show one letter again on WoW Forever (a typed debuff could show all four).

### Bars, keys and click casting (0.9.3)

- A flyout dragged onto a bar in a fight no longer raises an error, and a character with no forms or stances no longer gets empty stance boxes.
- A WoW Forever flyout on a Vanguard bar shows each spell once, at its highest known rank.
- New spells wait to be placed while key setup isn't offered (a bar addon or a gamepad is on), and six talent-only spells no longer show as trainer spells.
- Your keys and key setup read slot icons and macro names the current way, so they no longer error when the game's older fallbacks are off.
- Click casting's remap note names the click that actually runs (Shift + Left, not plain Left), or says the click targets when no binding of yours runs on it.
- Click-casting macros follow one 255-character limit in the Macro dialog, Import and Undo, so a starter layout's Undo no longer loses your old bindings.

### Windows, bags and town (0.9.3)

- A post from Vanguard's auction panel closes the game's own confirm box, so its Accept can't confirm an older post from the game's Sell tab. Auction prices use the client's coin letters, typed prices read them, a sold commodity goes into the ledger at its full price, and an auction whose item info comes late is still marked undercut. An item won on a bid under its buyout counts as one sale, at the bid.
- The sell list and the craft queue are each character's own and stay through a profile switch (moved off the profile once).
- Bag and bank search boxes have room for a group's search, the key ring button lights or dims with a search, a slot's quality border goes when the item leaves, and the combined-bag choice is kept for the whole computer.
- Faster auto-loot leaves master loot to the game's loot window, and `/vg graphics apply` also sets PBR water and lighting where the game's slider does.
- A Send-to-alt mail preset can no longer swap the alt for another player from an open name suggestion.
- Auction, group board and click-casting spell picker rows keep the hover wash; group board rows show each dungeon in its difficulty colour, with dungeon names translated.
- A dialog opened over the reload offer sits on top and takes its own clicks, also after a fight. The Map page's Go to buttons follow new waypoints.
- Toasts no longer stack on a moved talking head, and stay above one still in the game's own spot.

### Quests and chat (0.9.3)

- Gossip options are picked the way the game's own window picks them, a long objective in the quest log shows in full on hover, and quest item buttons in the tracker work in a fight.
- On Retail, the quest tracker counts every quality rank and the reagent and warband banks for a tracked recipe, shows a recraft as one, gives a scenario stage's spells rows and cast buttons, and follows the game's super-tracked quest at once.
- Show Party, Raid and Whispers switch every chat group they stand for (leader lines, raid warnings, Battle.net whispers), and a whisper shown only in a pop-out window no longer costs the next chat line.
- Close this tab gives the tab's chat types and channels back to the main window, as the game's own tab menu does, so Trade can't stop showing anywhere.
- Restored chat lines can't be reported with Report Chat, and turning Keep whispers off says the saved whispers stay until they age out or are cleared.

### Talents, profiles and layout (0.9.3)

- Spend planned refuses while the talents window has picks you haven't applied, and a refused apply rolls back what it bought, so a retry can work.
- A profile another character already restored from a newer backup is offered to you (**Use the restored profile**) instead of being overwritten by an older backup.
- A partial import goes into the profile used after the reload, an imported UI scale saved as text works, and the Profiles page follows a switch made from outside it.
- On Retail, a spec change no longer saves the new spec's Edit Mode layout into the old spec's profile, and private aura spots no longer sit under a full buff row.
- Unlock and Edit Mode work together: a lock ends Edit Mode's hold, `/vg unlock` inside Edit Mode keeps the moves made before it, and the unlock bar and Edit Mode's note fit again when Text size changes.
- Options search finds its row again after a Text size or Font change, and the options window's page names fit the menu in every language.

## 0.9.2

<!-- SMOKE step 33.342 -->

A hotfix for 0.9.1.

### Nameplates (0.9.2)

- Nameplates no longer fill the error list with an "aura icon pixels" error, about four times a second, in a dungeon or anywhere the game keeps some plates for itself (friendly plates in an instance). Vanguard leaves the aura icons on those plates alone, and an icon it can't place is reported once.

## 0.9.1

<!-- SMOKE steps 33.317 to 33.335 -->

### Gear upgrades (0.9.1)

- Gear upgrades weigh stats per class. On WoW Forever a druid picks Feral or Balance and a shaman Elemental or Enhancement under Damage style (Town and gear, Gear upgrades), and crit, hit and haste are weighed per point of rating, as Forever's items carry them.
- Changed weights stay with their class, so a mage and a warlock sharing a profile no longer change each other's.
- Caps on hit, expertise and defense: past its cap a stat counts for nothing, with a default cap for each kind of character.
- Import stat weights takes a Vanguard or guide site weights string, skips what Vanguard doesn't weigh, and says when a string is for another class.

### Keys and click casting (0.9.1)

- Stance and pet buttons stay on their spots in a fight, and keybind mode binds them too.
- Click casting works on the main tank and party pet tiles, and Import asks before it replaces the bindings you have; imported spell and macro text can't paint colours or links.

### Raid frames and nameplates (0.9.1)

- A thin bright line marks a shield that runs past a full health bar.
- Your focus's nameplate gets a quieter border and diamond, and plate auras include the ones the game flags for nameplates only.
- Raid tiles: a player who died and then went offline reads Offline, ready check answers follow the player, players the client can't see get no missing-buff mark, a dead or offline tile drops the dispel wash, and a main tank who is also main assist always gets the shield.
- Nameplates no longer draw dark squares around debuff icons on a plate the game hands over shrunk.

### Look (0.9.1)

- Colours and the theme agree across every module: cast bar times are white like the other numbers over bars, combo point pips use the bar texture, Dead, Ghost and Offline are coloured as on the raid tiles, Safer colours also cover the reputation bar and the minimap's zone name, hand-set text colours survive a look, accent or text size change, and the keystone window gets the corner brackets the other windows have.

### Fixes (0.9.1)

- Retail's right-click menus wear the theme, Quiet stops hiding red errors and zone names once it is switched off, mail tools say when the Send Mail tab is full, auction alerts check again when the item's name arrives, and a profile string for one module imports correctly.
- The new text is translated in all ten languages (machine-drafted; report a wrong line with /vg feedback).

## 0.9.0

### Retail (0.9.0)

- Vanguard now supports Retail 12.1.5 as well as WoW Forever, from the same download. The parts made for WoW Forever's own rules (key setup, the talent planner, spell ranks, the swing timer, power bar sparks, readouts, the pet stable, the group board and the Legacy window) stay off on Retail, and their pages, switches and commands don't show there.
- Class bars on Retail: holy power, soul shards (by tenths for Destruction), Windwalker chi, Arcane charges, Evoker essence and death knight runes above the player frame; a Brewmaster's stagger, a Devourer demon hunter's soul fragments and an Augmentation Evoker's Ebon Might as thin bars under it; and mana under the frame for Shadow priests, Elemental shamans and Balance druids.
- Combo points light a charged point in its own colour, and the cast bar shows an Evoker's empowered casts with a mark at each stage.
- The quest tracker on Retail groups campaign quests by chapter and adds blocks for scenarios and delves (with the delve tier, affixes and the reward chest), world quests, bonus objectives, the Traveler's Log, Endeavors, tracked collections and achievements, in the game's own order.
- A Mythic+ block in the tracker while a key runs: the timer against the dungeon's limit, deaths and the time they cost, the affixes, bosses and enemy forces. The dungeon card at the door shows your keystone, the affixes and the Mythic+ timer.
- Situations gains Mythic+ and Delve on Retail, so a layout can change inside a key or a delve.
- Retail's game windows in the Vanguard look, each falling back to the game's own if a part is drawn another way: the group finder, PvP and Adventure Guide, the Mythic+ tab and keystone window, the character pane, the Who list, the warband bank, the Great Vault, the expansion page, transmog, the Trading Post, the housing windows, the delve companion and difficulty picker, and the profession specialisation and crafting order pages.
- An optional Great Vault line on the info strip (off until you turn it on under Game windows) shows slots unlocked this week and when a reward waits.
- Private aura icons on the raid tiles and beside the target frame, and Retail's spells for click casting, raid buffs, the prep card and upgrade weights (mastery, versatility and item level).

### Look (0.9.0)

- The painted shield is Vanguard's icon, and setup's first step and What's new open under a painted welcome banner with Vanguard's crest and name.
- Two painted panel textures, Bedded slate and Vellum, join the Panel texture choice (General, Look); the three older ones are fainter.
- Window ornaments are larger and show in full on every Vanguard window and every game window it skins, and the round minimap gets an ornate ring with them; High contrast shows none.
- The AFK screen shows a painted scene for your faction behind the AFK card; the AFK scene switch (General, Look) turns it off.
- Muted text in Vellum and ink and in Classic look is a few shades brighter, so it reads over a bright world.

### Layout (0.9.0)

- An in-combat mark: crossed swords and a red edge on your frame, and a red edge on your target's while it fights (on by default; the switch is on the Unit frames page).
- The XP bar's numbers sit in the middle of the bar, and game window buttons' labels use the theme's text colours.
- On tall screens the bars and HUD rise as one block to sit under your character, and the Cooldown Manager's main row gets a line of its own.
- A Cooldown Manager row wider than its spot shrinks to fit it.
- A Loot / Trade chat tab sits level in the tab bar and shows its whole name.
- The Raid frames page's cards open on their main settings, with a More settings line under them that shows the rest; a search hit or a What's new link opens it.

### Fixes (0.9.0)

- Keys and click casting: key setup places a ranked spell's top rank, and a change you untick stays yours.
- Action bars: a flyout (such as a mage's portals) opens Vanguard's own list, which closes with its bar.
- Frames and raid: game frames Vanguard hides stay hidden, ready check and resurrection marks clear at the right time, and the raid preview follows Scale and Reset.
- Quests and map: finished auto-complete quests complete from the tracker (Click to complete), the arrow points at the quest you track on the game's map, and the quest dialog keeps its scroll and passes modifier keys to the game.
- Town and gear: junk sales, mail presets, the auction Sell card and bank deposits include the reagent bag; selling more than 12 stacks warns that buyback keeps only the last 12; prices written as "1,500g" are understood; refundable stacks stay in your bags.
- Retail: class weights follow your spec's main stat, raid buff rows only show when someone in the group gives that buff, ranged weapons compare properly, Forever-only prep rows and strip blocks stay off, and more of the character pane, group finder, PvP, housing and profession windows wear the theme.
- Options, profiles and setup: Reset this page covers every row, a profile you pick by hand stays picked at login, Start over keeps your backup, and a profile from the other client brings this client's defaults.
- Chat: closing a tab drops its saved history, and a new tab says when every tab is in use.
- Town and gear: the merchant's Stack button asks first for a pack the game would ask about (150g or more and not refundable), and Stack and Max only report what they really bought; Cancel on Your auctions asks first when cancelling costs gold or the cost can't be read; Relist keeps an expired auction if the sell card refuses it; a mail preset counts the items already in the mail towards its 12; sending a bag group to a full bank says how many stacks stayed; the sales ledger survives a login with the computer clock set far ahead.
- Bags and bank: bank side tabs and bag bar buttons light up when they hold a search match, and locked backpack slots sort last under Empty. On Retail the game's slot art is faded, and the ilvl and q search words read the item's own level and quality.
- Quests and map: the quest dialog sorts reward spells into Teaches, Unlocks and Grants and leaves out spells you know; the arrow stays bright and says "No distance" when the game gives only a direction; quest-start pins leave out quests already in your log; a timed scenario step shows its countdown; abandoning checks each quest is still in the log and can be abandoned; a reward's upgrade arrow waits for the item's stats; the tracker re-sorts for the area you walk into.
- HUD and frames: Vanguard's nameplates show the soft-target icon, and a friendly NPC the game marks with a widget keeps the game's plate; with the Calm HUD on, action bars come back in a vehicle and hovering any buff row brings it back; empty totem slots no longer catch clicks; a warlock's soul shards show from level 10; keybind mode keeps every button shown after you drag a spell; the game's event link button shows at the minimap's top-left corner while there is an event; minimap buttons an addon hid stay out of the drawer; the meter's Deaths view shows when each death happened.
- Chat and feedback: a web address at the start of a message, or with a subdomain, becomes a link; chat watch matches whole words in every alphabet; /vg feedback feature opens on the right kind.
- Retail: the Delve layout ends when you leave the delve, the battleground banner uses the theme font, the tracker's XP footer counts only quests you've taken, and the premade group pages, delve companion window, decor categories and Equipment Manager list wear the theme in full.
- Nameplates no longer draw a dark box when the game hands a plate over at a tiny scale.
- The Calm HUD's hover no longer reports an error on your buff buttons.
- The new text is translated in all ten languages (machine-drafted; report a wrong line with /vg feedback).

## 0.8.0

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

- Fixed on the game's own windows and HUD pieces: text left in the game's parchment colours, art the game shows again on hover, raw bar colours, the spellbook and achievements windows, and the Calm HUD on frames the game keeps from add-ons.

## 0.7.5

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

- Stability fixes across combat, frames, chat, quests, bags, the auction house, mail, profiles and options.

## 0.7.4

### Credits (0.7.4)

- The Map page's OpenMap card credits OpenMap's author, jiforever (jigrobbulus on CurseForge), and the README's credits list OpenMap.

### Action buttons (0.7.4)

- Long key names are short on the buttons (Caps Lock Cap, Page Up PU, Insert Ins, Delete Del) and stay on one line.
- A button holding an item you wear gets a thin green ring, and the keybind banner repeats your last bind and has a Done button.

## 0.7.3

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
- When another addon (an all-in-one suite's unit frame, action bar, nameplate and raid frame parts) does a job a Vanguard module does, chat says so once.
- Chat filters skip hidden text, saved-click-cast Import checks the whole string first, and a Quiet module can silence invite declines, battleground release, error and zone text and camera zoom.
- Vanguard asks about leading all-in-one suites and auction addons when they do the same job.
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
