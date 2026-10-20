# Commands

Every `/vg` command (`/vanguard` works too), grouped by what it does. `/vg help` prints the same list in game. The full wording of each command is in [Every command, word for word](#every-command-word-for-word) at the end of this page, which is the reference the tables are checked against.

## Options and setup

| Command | What it does |
| --- | --- |
| `/vg` | The options window (also `/vg options`, `/vg config`, the addons button by the minimap) |
| `/vg setup` | The first-run setup again |
| `/vg whatsnew` | What changed in this version |
| `/vg modules`, `/vg enable <module>`, `/vg disable <module>` | List the parts; switch one, then `/reload` |
| `/vg skins` | Addons skinned through the API; `skins <addon> on\|off` |
| `/vg status` | Version, profile, modules, skins, work waiting on combat, game restrictions |

## Layout

| Command | What it does |
| --- | --- |
| `/vg unlock`, `/vg lock`, `/vg move` | Drag handles on every Vanguard frame |
| `/vg reset <frame\|all>`, `/vg frames` | Put a frame back; list the frames you can move |
| `/vg grid`, `/vg snap` | The unlock-mode grid and snapping |
| `/vg dock` | Line up Deadly Boss Mods' bars with the Boss timers spots |
| `/vg preview [party\|10\|25\|40\|off]` | Raid frames with sample players |

## Look

| Command | What it does |
| --- | --- |
| `/vg variant [name]` | Theme variant: default, contrast, vellum, classic, midnight, obsidian, moss, ember |
| `/vg corners [square\|rounded]` | Panel corners |
| `/vg accent <colour>`, `/vg theme reset` | The accent colour |
| `/vg ornaments`, `/vg gradient`, `/vg icons` | Window ornaments, panel gradient, sharper menu icons (off by default) |
| `/vg texelsnap`, `/vg nineslice`, `/vg slug`, `/vg framebuffer` | Side-by-side tests (off by default) |

## Profiles

| Command | What it does |
| --- | --- |
| `/vg profile [name]` | Switch, or `new`, `copy`, `delete`, `reset` |
| `/vg preset [name]` | Healer, Damage, Tank and any an addon offers |
| `/vg export`, `/vg import` | Profile strings, whole or in parts |
| `/vg spec [profile\|off]` | Use a profile in this specialization |

## Combat and groups

| Command | What it does |
| --- | --- |
| `/vg binds`, `/vg keybind` | Click-casting and hover keys; keybind mode |
| `/vg cooldowns [setup]`, `/vg cdmglow [on\|off\|<percent>]`, `/vg gaps ...` | The Cooldowns page and its setup wizard; the Cooldown Manager buff glow (off by default); the Cooldown gaps row |
| `/vg cdmkeys [on\|off]` | The key for each Cooldown Manager spell on its icon (off by default) |
| `/vg meter [on\|off\|dps\|hps]`, `/vg fights`, `/vg recap` | Vanguard's meter, DPS per fight, last fight's recap |
| `/vg rolls`, `/vg loot` | Roll results; officer soft-reserve list and roster |
| `/vg lfg [probe]` | The group board |
| `/vg plates [enemies on\|off]` | Nameplates drawn and the game's plate settings |
| `/vg situation ...`, `/vg watch ...` | Situation overrides; Chat watch phrases |
| `/vg filter [on\|off\|tab\|hide\|add\|remove <word>\|clear]` | Chat filter: spam to a Filtered tab |
| `/vg history [on\|off\|whispers\|nowhispers\|clear]` | Chat history: your chat comes back after a reload or login |

## Town, quests and gear

| Command | What it does |
| --- | --- |
| `/vg quests`, `/vg way`, `/vg questdata` | Quest log, waypoints, what the client says about a quest |
| `/vg quests history [n]` | The latest quests any of your characters turned in, and who did each |
| `/vg guide probe` | What this client returns for the reads a levelling guide would use (chat only) |
| `/vg probe [chat\|fight\|last]` | One out-of-combat run that asks the client the open questions and opens the answers in a copy box (saved in SavedVariables); `fight` takes the secrecy reads in the next fight; `last` reopens the saved report |
| `/vg ah ...` | Auction prices, shopping lists, scans |
| `/vg weights [wizard\|...]` | Stat weights for gear upgrades |
| `/vg craft ...`, `/vg mail ...` | Craft queue; mail tools (off until switched on) |
| `/vg prep [want <kind> <n>\|setup\|buffs]` | The Instance prep card, wanted amounts, and your buffs against the buff checks |
| `/vg pets` | Your pets, out and stabled, with level, loyalty and happiness |
| `/vg bag [add\|remove\|delete\|top\|deposit ...]` | Your own bag categories: a name and its items |
| `/vg gear` | Average item level, melee damage per second, pieces missing an enchant |
| `/vg alts`, `/vg stock`, `/vg inventory`, `/vg vendors` | Alt overview, items to keep, characters remembered, merchants remembered |
| `/vg junk`, `/vg sell` | Your sell list; sell every stack of one item at a merchant |
| `/vg ranks`, `/vg trainers`, `/vg legacy` | Spell ranks, what trainers teach, the Legacy system |
| `/vg copy` | The recent chat as plain text |
| `/vg talents [plan\|spend\|clear\|export\|import]` | The talent planner on the game's talents window |

## Help and diagnostics

| Command | What it does |
| --- | --- |
| `/vg help` | Every command with a line on what it does |
| `/vg errors [clear]` | What Vanguard caught going wrong this session |
| `/vg report`, `/vg feedback [bug\|feature]` | A block to paste at vanguardui.com/feedback |
| `/vg perf [cpu\|watch\|slow]`, `/vg mem` | CPU time and memory |
| `/vg graphics` | Checks your computer, screen and frame rate, then suggests a Graphics Quality and the sizes for your screen |
| `/vg graphics apply` | Sets what the check suggested: Graphics Quality, render scale on a slow 4K screen, and the sizes for your screen |
| `/vg graphics undo` | Puts your graphics settings and UI scale back as they were before apply |
| `/vg launch [clear]` | Prices, sales and characters saved from before launch (the beta); clear removes them after launch |
| `/vg frame <name> [deep]`, `/vg realm`, `/vg factionart` | What the client says about a frame, your realm, the faction pictures |

## Every command, word for word

```
/vg               the options window (also: left-click the addons button by the minimap; /vanguard, /vg options and /vg config do the same)
/vg help          every command with a line on what it does
/vg setup         the first-run setup again: layout, screen, look, then move things
/vg whatsnew      what's new in this version, grouped by module; click a line to open its setting
/vg unlock | lock drag handles on every Vanguard frame (also: right-click the addons button); /vg move is unlock
/vg reset <frame|all>
/vg frames        the frames you can move
/vg grid [size|on|off]          the unlock-mode grid; /vg snap on|off   snapping while dragging
/vg texelsnap [on|off]          still borders, fills, dividers and sheens snap to the screen's pixel grid; bars, sparks and icons never do (a side-by-side test, off by default)
/vg nineslice [on|off]          shadows and glows drawn as one texture each, after a /reload (a side-by-side test, off by default)
/vg icons [on|off]              the menu strip icons drawn at the pixel size they show at (16, 20, 24 or 32), after a /reload (off by default)
/vg ornaments [on|off]          a brass rule under the options window's header and corner brackets on setup and the quest log, in the accent's dim shade (off by default; also General → Look → Window ornaments)
/vg cooldowns [setup]           the Cooldowns page (the game's Cooldown Manager, the gaps row, the buff glow); setup opens the step-by-step wizard, which in a fight waits for it to end
/vg cdmkeys [on|off]            the key you press for each Cooldown Manager spell on its icon, read from Vanguard's action bars (off by default; also Cooldowns → Key text on the manager's icons)
/vg cdmglow [on|off|<percent>]  glow a Cooldown Manager buff icon in its last part, 10 to 60 percent of it (off by default; also Cooldowns → Glow a buff near its end)
/vg gaps [add <item>|remove <item>|spell add <spell>|spell remove <spell>|clear]   the Cooldown gaps row's chosen items (a Healthstone or a potion, say) and spells, shown beside trinkets, pet abilities and totems; no verb lists them (switch the row on under Cooldowns)
/vg variant [default|contrast|vellum|classic|midnight|obsidian|moss|ember]   theme variant: Slate and brass, High contrast (opaque panels, white text, 2 px accent focus ring, Safer colours on), Vellum and ink (warm dark, cream text), Classic look, Midnight, Obsidian, Moss or Ash and ember; also General → Look → Theme variant
/vg corners [square|rounded]     panel corners on every theme: square (default) or rounded (4 px arcs on panels, frames, tooltips and buttons); also General → Look → Corners
/vg slug [on|off]               world text (nameplates, floating numbers) drawn with the SLUG font flag, at once (a side-by-side test, off by default)
/vg framebuffer [on|off]        windows drawn through a frame buffer while they open and close, so inner borders don't ghost (a side-by-side test, off by default)
/vg gradient [on|off]           windows' fills a shade lighter toward the top (off by default)
/vg accent <rrggbb|brass|arcane|jade|orchid|copper> | reset      /vg theme reset
/vg modules       the list of modules; /vg enable|disable <module>, then /reload
/vg skins         addons skinned through the API; skins <addon> on|off
/vg preset [name]               presets on offer (healer, damage, tank, and any an addon registers); a name asks to apply it
/vg profile [name]              switch (or create); profile new|copy|delete <name>, profile reset (asks and backs up first)
/vg export [part ...|pick] | import   profile strings: the whole profile, or only some parts (layout, situations, global, a module's name); pick opens a switch for each part
/vg spec [profile|off]          use a profile whenever you're in this specialization
/vg binds                       this spec's click-casting and hover-key bindings
/vg preview [party|10|25|40|off]   the raid frames filled with sample players, to check them without a group (not saved; joining a group or combat ends it)
/vg keybind                     keybind mode: hover an action button and press a key, a side mouse button or the wheel to bind it; Backspace clears, Escape leaves
/vg copy                        the recent chat as plain text, ready to copy
/vg quests [history [n]]        open or close Vanguard's quest log; history lists the latest quests any of your characters turned in
/vg lfg [probe]                 open or close the group board: looking-for-more and looking-for-group posts from chat; `probe` says what chat it has heard and which channels you are in
/vg questdata [questID]         what the client says about a quest (or the quests an open NPC offers and those you track), and whether it flags quests new in WoW Forever
/vg guide probe                 what this client returns for the quest, map, taxi and unit reads a levelling guide would use, and for the unit tooltip data of your target (its line count only) (chat only; nothing changes)
/vg probe [chat|fight|last]    one run out of combat asks the client the open questions (SavedVariables round trip, new-quest flag, threat secrecy, group listing, secure paging, realm and name format, C_Secrets predicates, restriction states, navigation, reads Forever's API docs lack) and opens the report in a copy box; chat prints it too; fight takes the secrecy reads in the next fight; last reopens the saved report
/vg junk [<item>|remove <item>|clear]   your sell list: items a merchant offers to buy from you with your grays (off until switched on); the question sells only the stacks it lists, and Enter alone never answers it
/vg bag [add <name> <item>|remove <item>|delete <name>|top <name>|deposit <name>]   your bag categories: a name and its items, each under its own header in the combined bag, above the built-in sections; deposit sends one to the open bank
/vg sell <item>                 at a merchant: sell every stack of an item in your bags, after a question
/vg stock [<item> <n>]          items to keep in your bags; a merchant tops them up (0 removes, clear empties)
/vg gear                        your gear in chat: average item level, melee damage per second and the worn pieces missing an enchant
/vg alts [<name>]                every character's level, money, rested XP and time played; with a name, that character's bags and bank
/vg inventory [forget <name>|clear]   your characters remembered here and when their bags were read
/vg weights [wizard|set <stat> <n>|reset|export|import]   the stat weights gear upgrades use for your class and role
/vg talents [plan|spend|clear|export|import]   the Talent planner: the plan's summary; plan mode on or off, spend the planned points, clear the plan, share it as a string
/vg legacy [probe|plan ...]     the Legacy system: probe lists what the client has for it; plan [add <points> <name>|remove <name>|clear] keeps a list of perks for the tree's 16 points (planner off until switched on)
/vg way [zone] x y [title]      a waypoint the game's arrow points to; /vg way clear removes it; /vg way recent [n] lists the last eight or goes back to one
/vg dock                        line up Deadly Boss Mods' bars with the Boss timers spots; for BigWigs, where to drag its bars
/vg factionart                  which of the game's own faction pictures this client has
/vg launch [clear]               prices, sales and characters saved from before launch (4 November 2026, the beta); clear removes them once the game has launched (the same button is under /vg > Town and gear)
/vg realm                       your realm, ruleset, the Classic or Modern preset and side as the client gives them, how it writes your name, and the key your prices, sales and characters are kept under
/vg frame <name> [deep]         (a name may end in #n parts, the nth child frame of the one before: QuestScrollFrame.Contents.#3) what the client says about a frame now (shown, alpha, scale, size, where its rect is or that it has none, anchors, its parents); deep adds its textures and child frames, for a frame that draws empty: paste it with a bug report
/vg plates [enemies on|off]   how many nameplates Vanguard drew and the game's enemy plate setting; enemies on|off sets it (out of combat)
/vg craft [add [n]|next|stock|cd|top|done|clear]   the craft queue, profession cooldowns and best recipes (off until switched on)
/vg mail [words]|preset ...|send <name>|takeall|returnall   search the inbox; presets for sending items to your alts; take everything shown or return it (off until switched on)
/vg pets                        your pets, out and stabled, with level, loyalty, happiness and progress to the next level
/vg rolls [clear]                the group's /roll results this session, newest first; clear forgets them
/vg loot [on|off|add|remove|list|clear|focus|roster]   officer loot tools (off until switched on): a soft-reserve list flagged in the roll tracker, and a group roster
/vg meter [on|off|<kind>|<segment>|reset|report [channel] [lines]]   Vanguard's own meter (off until switched on): kinds dps hps damage healing taken interrupts dispels deaths; segments this overall previous; reset clears the game's meter; report prints the top lines or sends them to say, party, raid, instance or guild
/vg fights                      your DPS, length and place in each fight this session, newest first
/vg recap [say|party|raid|instance|guild]   the last fight's interrupts, dispels, damage taken and deaths from the game's damage meter, in your chat or sent to that channel
/vg ranks [swap]                bar buttons holding an older spell rank; swap puts the newest rank there (out of combat)
/vg trainers [next|clear]       what the trainers you've visited teach: how many services, the next levels and where, or forget them
/vg vendors [clear]             how many merchants Vanguard remembers (for tooltips and the stock list); clear forgets them
/vg prep [want <kind> <n>|setup|buffs]   the Instance prep card now; want sets how many food, bandages, potions, ammo or shards to carry; setup opens the wanted-amounts window; buffs lists your buffs and the buff check each counts for
/vg watch [add|remove <phrase>|list|clear]   Chat watch's phrases: add one, remove one, list them, or clear them all
/vg filter [on|off|tab|hide|add|remove <word>|clear]   Chat filter: switch it on or off, send caught lines to the Filtered tab or hide them, add or remove a word of your own, or show its state
/vg history [on|off|whispers|nowhispers|clear]   Chat history: your chat comes back after a reload or the next login, or show what is saved
/vg situation [record <name>|stop|clear [name]|list]   Situations: record an override for solo, party, raid, pvp, instance or resting, stop and save it, clear one (the active one without a name), or list them
/vg ah [list <name>|add <list> <item>|rename <name>|duplicate|delete|export|import|recent|restock|scan|prices clear]   auction prices from your scans: how many and when; pick or make a shopping list and say what's on it; add an item (a link, an ID or a name) to a list; rename, copy, delete (after asking), export or import the list in use; show the Recent list; make the Restock list of what you're short of (searched at the auction house); scan the auction house (while it's open); forget the prices
/vg status                      version, profile, modules, skins, work waiting on combat, what the client has, game restrictions
/vg report                      one block to copy for a bug report (what /vg status and /vg errors say), ready to paste at vanguardui.com/feedback
/vg feedback [bug|feature]      a bug report or feature request written in game: the questions vanguardui.com/feedback asks (with the same limits), then one block to copy; pasted into the site's form, it fills the fields (a bug's block carries /vg report). Also Report a bug and Request a feature on the Feedback page in /vg, the last page in the list, which has a Copy a report button for the plain /vg report too
/vg errors [clear]              what Vanguard caught going wrong this session, opened in the copy window with the text selected (Ctrl+C) and a one-line note in chat: the version, client and aura backend, then each distinct error once with how often it happened and its stack (paste it in a bug report; clear empties the list; with none caught, chat says so). An error is printed to chat the first time it happens and handed to the game's error popup or your error addon every time; an error in one module, skin, event handler, after-combat update, hook on a game function, button click or timer is kept here and doesn't stop the others
/vg perf [cpu|watch|slow]       what Vanguard costs: its CPU time and memory now, and its ten busiest functions; on a client with the game's always-on addon profiler (WoW Forever and Retail) the CPU part is ms a frame now, on average and at the peak, its share of all addons and the frames over 5 ms, with no profiling to turn on; otherwise it is the script profiler's total (in all, and since the last report), and the busiest functions always need it; cpu turns the game's script profiling on or off (after a reload; it slows every addon a little, so turn it off when done); watch prints the line every minute until asked again; slow lists Vanguard's slowest handlers since login (each event, hook, click, timer and module start-up it runs, timed by the game's fine clock): each one's longest call, how many calls took over 5 ms and its time in all, slowest first; slow reset starts the count over
/vg mem                         first prints how large Vanguard's saved files are (an estimate: the account file against its 6 MB budget, the three largest keys, this character's file), then watches Vanguard's memory for a minute (a reading every 5 s, none in combat), then says how far it moved and how much Vanguard kept: a garbage collection before the first reading and after the last (out of combat; a short hitch) gives live memory at the start and the end, or, where the client refuses one, whether the low point rose (memory kept) or held (garbage the game collects); run again to end it early
/vg graphics                    checks this computer (the graphics card the game sees and the Graphics Quality the game recommends for it), your screen and your frame rate for 5 s (out of combat), then suggests a Graphics Quality and the sizes for your screen; again ends it early. It starts from the game's own recommendation, two steps under the one in use below 30 fps, one above it from 60 fps, at most 5 on a built-in (low-power) graphics chip, and on a slow 4K screen it suggests Render Scale 80%. It ends with a line naming the next two commands
/vg graphics apply              sets what the last check suggested, out of combat: every detail setting from the game's own table for that Graphics Quality and then Graphics Quality itself (as the Options slider does, so custom detail settings are replaced), Render Scale 80% when the 4K tip showed, and setup's sizes for your screen (UI scale, buttons, raid tiles, text; setup saves your profile first)
/vg graphics undo               puts back the graphics settings and UI scale (Vanguard's pixel-perfect scale too) as they were before the first apply on this computer (a profile string never carries them)
```

To measure Vanguard's CPU cost yourself: play a while (a raid pull is the hard case), then `/vg perf`; for the busiest functions too, `/vg perf cpu`, reload, play, then `/vg perf`; `/vg perf cpu` again (and a reload) turns profiling off. To measure memory: stand still out of combat, `/vg mem`, and read the two lines it prints after a minute; the second gives live memory at the start and the end, after a garbage collection each (the game's own figure also counts garbage not yet freed), so a rise there is memory Vanguard keeps.
