-- /vg (and /vanguard): unlock/lock, positions, theme, modules, profiles.

local ADDON, ns = ...
local L = ns.L

local T = ns.Theme
local chat = ns.Chat

-- The line /vg help starts with.
local HELP_INTRO = L["A from-scratch UI suite. /vg opens the options window; /vg <command>:"]

-- /vg help: each command as it is typed (never translated) and what it does.
local HELP = {
  { "setup", L["first-run setup again: layout, screen, look, then move things"] },
  { "whatsnew", L["what's new in this version of Vanguard; click a line to open its setting"] },
  { "unlock | lock", L["drag handles on every Vanguard frame; click one, then arrow keys nudge (Shift: 10 px)"] },
  { "reset <frame|all>", L["put a frame (or every frame) back at its default spot"] },
  { "frames", L["list the movable frames"] },
  { "grid [size|on|off]", L["the unlock-mode grid; snap on|off   snapping while dragging"] },
  { "texelsnap [on|off]", L["still borders, fills and lines snap to the pixel grid (a test; off by default)"] },
  { "slug [on|off]", L["world text (nameplates, floating numbers) drawn with the SLUG font flag, at once (a test; off by default)"] },
  { "framebuffer [on|off]", L["windows drawn through a frame buffer while they open and close (a test; off by default)"] },
  { "nineslice [on|off]", L["shadows and glows as one nine-slice texture each, after a reload (a test; off by default)"] },
  { "icons [on|off]", L["menu strip icons drawn at their on-screen size, after a /reload (off by default)"] },
  { "cooldowns [setup]", L["the Cooldowns page (the game's Cooldown Manager, the gaps row, the buff glow); setup opens the step-by-step wizard"] },
  { "cdmkeys [on|off]", L["show the key for each Cooldown Manager spell on its icon (off by default)"] },
  { "cdmglow [on|off|<percent>]", L["glow a Cooldown Manager buff icon in its last part, 10 to 60 percent (off by default)"] },
  { "ornaments [on|off]", L["a brass rule or corner brackets on the options window, setup and quest log (off by default)"] },
  { "variant [default|contrast|vellum|classic|midnight|obsidian|moss|ember]", L["surfaces and text: Slate and brass, High contrast, Vellum and ink, Classic look, Midnight, Obsidian, Moss, Ash and ember"] },
  { "corners [square|rounded]", L["panel corners: square (default) or rounded, on every theme"] },
  { "gradient [on|off]", L["windows a shade lighter toward the top (off by default)"] },
  { "accent <rrggbb|name>", L["set the accent color (brass, arcane, jade, orchid, copper); accent reset"] },
  { "theme reset", L["every theme setting back to default"] },
  { "modules", L["list modules; enable|disable <module> (then /reload)"] },
  { "skins", L["addons skinned through Vanguard.RegisterSkin; skins <addon> on|off"] },
  { "profile [name]", L["show profiles, or switch this character to one"] },
  { "profile new|copy|delete <name>, profile reset", L["manage profiles"] },
  { "export [part ...|pick]", L["copy the profile as a string, or only some parts of it: layout, situations, global or a module's name; pick opens a panel with a switch for each part"] },
  { "import", L["paste a string from /vg export: a whole profile becomes a new profile, a partial one merges into yours (backed up first)"] },
  { "preset [name]", L["presets on offer (Vanguard's healer, damage and tank, and any an addon registers); a name asks to apply it, backed up first"] },
  { "spec [profile|off]", L["use a profile whenever you're in this specialization"] },
  { "copy", L["the recent chat of the shown tab as plain text, ready to copy"] },
  { "situation [record <name>|stop|clear [name]|list]", L["Situations: record a layout and settings for solo, party, raid, pvp, instance or resting"] },
  { "watch [add|remove <phrase>|list|clear]", L["Chat watch: phrases that ring a sound and show a toast when said in chat"] },
  { "filter [on|off|tab|hide|add|remove <word>|clear]", L["Chat filter: gold selling, boosting, recruiting and repeat lines go to a Filtered tab (or are hidden)"] },
  { "history [on|off|whispers|nowhispers|clear]", L["Chat history: your chat comes back after a reload or the next login (off until switched on)"] },
  { "quests [history [n]]", L["open or close Vanguard's quest log (the game's quest log key does too); history lists the latest quests any of your characters turned in"] },
  { "probe [chat|fight|last]", L["one run out of combat asks the client the open questions (saved quest flag, threat secrecy, group listing, secure paging, realm format, secret predicates, restrictions, navigation, quest and map reads, party health and marks, bar defaults) and opens a copy box; in a fight it takes only the party, mark and boss reads; fight takes the secrecy reads in the next fight; last reopens the saved report"] },
  { "guide probe", L["what this client returns for the reads a levelling guide would use (chat only; changes nothing)"] },
  { "questdata [questID]", L["what the client says about a quest (or the quests an open NPC offers and those you track), and whether it flags quests new in WoW Forever"] },
  { "lfg [probe]", L["open or close the group board: looking-for-more and looking-for-group posts from chat by dungeon, role and level; probe says what chat it has heard"] },
  { "plates [enemies on|off]", L["how many nameplates Vanguard drew and the game's enemy plate setting; enemies on|off sets it (out of combat)"] },
  { "stock [<item> <n>]", L["items to keep in your bags; a merchant tops them up (0 removes, clear empties)"] },
  { "junk [<item> | remove <item> | clear]", L["your sell list: items a merchant offers to buy from you with your grays (off until switched on under Town and gear, Merchants)"] },
  { "bag [add <name> <item>|remove <item>|delete <name>|top <name>|deposit <name>]", L["your own bag categories: a name and its items, shown under their own header above the built-in sections (first in the list wins)"] },
  { "sell <item>", L["at a merchant: sell every stack of an item in your bags, after a question"] },
  { "craft [add [n]|next|stock|cd|top|done|clear]", L["the craft queue: queue the recipe on display, open the next one, raise Keep stocked to fit, show cooldowns, rank recipes (off until switched on)"] },
  { "mail [words]|preset [add <name> <character> [words]|remove <name>]|send <name>|takeall|returnall", L["search the inbox; presets for sending items to your alts; take everything listed or return it (off until switched on)"] },
  { "pets", L["your pets, out and stabled, with level, loyalty, happiness and progress to the next level"] },
  { "rolls [clear]", L["the group's /roll results this session, newest first; clear forgets them"] },
  { "loot [on|off|add|remove|list|clear|focus|roster]", L["officer loot tools (off until switched on): a soft-reserve list flagged in the roll tracker, and a group roster"] },
  { "fights", L["your DPS, length and place in each fight this session, newest first"] },
  { "meter [on|off|<kind>|<segment>|reset|report [channel] [lines]]", L["Vanguard's own meter: the top lines of the game's damage meter in a Vanguard panel (off until switched on); kinds dps hps damage healing taken interrupts dispels deaths, segments this overall previous"] },
  { "recap [say|party|raid|instance|guild]", L["the last fight's interrupts, dispels, damage taken and deaths from the game's damage meter, in your chat or sent to that channel"] },
  { "vendors [clear]", L["how many merchants Vanguard remembers (for tooltips and the stock list); clear forgets them"] },
  { "ranks [swap]", L["spell ranks: bar buttons holding an older rank than you know; swap puts the newest rank there (out of combat). Off until Spell ranks is switched on"] },
  { "trainers [next|clear]", L["what the trainers you've visited teach: how many services are remembered, what the next levels bring and where, or forget them (Trainer memory off until switched on)"] },
  { "gear", L["your gear in chat: average item level, melee damage per second and the worn pieces missing an enchant (the character pane also shows item levels; see Game windows)"] },
  { "alts [<name>]", L["every character's level, money, rested XP and time played; with a name, that character's bags and bank"] },
  { "inventory [forget <name>|clear]", L["your characters remembered here and when their bags were read; forget drops one, clear forgets them all"] },
  { "weights [wizard|set <stat> <n>|reset|export|import]", L["the stat weights gear upgrades use for your class and role; the wizard walks you through them, or change one, go back to the defaults, or share them"] },
  { "prep [want <kind> <n>|setup|buffs]", L["the Instance prep card now: what you're short of (with Dungeon card on: the dungeon's level range, your quests for it and your keys); want sets how many food, bandages, potions, ammo or shards; setup opens the wanted-amounts window; buffs lists your buffs and which buff check each counts for"] },
  { "legacy [probe|plan ...]", L["Legacy system: probe lists what the client has for it; plan [add <points> <name>|remove <name>|clear] keeps a list of perks for the tree's 16 points (planner off until switched on)"] },
  { "talents [plan|spend|clear|export|import]", L["Talent planner: the plan's summary; plan mode on or off, spend the planned points, clear the plan, share it as a string"] },
  { "ah [list <name>|add <list> <item>|rename <name>|duplicate|delete|export|import|recent|restock|scan|prices clear]", L["shopping lists (pick or make one, add an item: a link, an ID or a name; rename, copy, delete, export or import the list in use; recent: the last 20 items searched; restock: the list of what you're short of); scan the auction house (while it's open); forget the prices"] },
  { "way [zone] x y [title]", L["a waypoint on the map that the game's arrow points to (a zone by name, or #<map id>); way clear removes it; way recent lists the last eight and way recent <n> goes back to one"] },
  { "dock", L["line up Deadly Boss Mods' bars with the Boss timers spots (move those with unlock); for BigWigs, where to drag its bars"] },
  { "preview [party|10|25|40|off]", L["the raid frames filled with sample players, to check them without a group (not saved)"] },
  { "binds", L["this spec's click-casting and hover-key bindings (set them in /vg > Click casting)"] },
  { "keybind", L["keybind mode: hover an action button and press a key, a side mouse button or the wheel to bind it; Backspace clears, Escape leaves"] },
  { "status", L["version, profile, modules, skins, work waiting on combat, what the client has, game restrictions"] },
  { "factionart", L["which of the game's own faction pictures this client has"] },
  { "launch", L["prices, sales and characters saved from before launch (the beta); launch clear removes them once the game has launched"] },
  { "realm", L["your realm, ruleset, game rules (preset, self-found, game mode) and side as the client gives them, and the key your prices, sales and characters are kept under"] },
  { "frame <name> [deep]", L["what the client says about a frame now: shown, alpha, scale, size, its rect (or none), anchors and its parents; deep adds its textures and child frames (for a frame that draws empty)"] },
  { "errors [clear]", L["opens the errors Vanguard caught this session, with stacks and counts, in the copy window (for a bug report); clear empties the list"] },
  { "report", L["one block to copy for a bug report: what /vg status and /vg errors say, ready to paste at vanguardui.com/feedback"] },
  { "feedback [bug|feature]", L["a bug report or feature request written here: the questions vanguardui.com/feedback asks, then one block to paste there (it fills the form)"] },
  { "gaps [add <item>|remove <item>|spell add <spell>|spell remove <spell>|clear]", L["Cooldown gaps (switch it on under Cooldowns): choose items such as a Healthstone or potion, and spells, to show beside trinkets, pet abilities and totems; no verb lists them"] },
  { "perf [cpu|watch|slow]", L["Vanguard's CPU (ms a frame) and memory now; cpu turns the game's script profiling on or off (reload) for the busiest functions; watch prints them every minute; slow lists the slowest handlers (slow reset starts over)"] },
  { "mem", L["prints the size of the saved files, then watches Vanguard's memory for a minute (out of combat), then says how much it grew and whether it kept any; again ends it early"] },
  { "graphics", L["checks this computer (the graphics card the game sees and the Graphics Quality the game recommends for it), your screen and your frame rate for 5 s (out of combat), then suggests a Graphics Quality and the sizes for your screen; again ends it early"] },
  { "graphics apply", L["sets what the check suggested (Graphics Quality as the game's slider does, render scale, your screen's sizes), out of combat"] },
  { "graphics undo", L["puts your graphics settings and UI scale back as they were before apply"] },
}

-- Prints each line.
local function printLines(lines)
  for _, line in ipairs(lines) do
    chat(line)
  end
end

-- /vg help: the intro, then each command and what it does, the commands in one column.
local function helpCommand()
  chat(HELP_INTRO)
  for _, entry in ipairs(HELP) do chat(ns.Literal(string.format("%-20s %s", entry[1], entry[2]))) end
end

-- "on" / "off" in green / gray.
local function onOff(on)
  return on and T.Paint(L["on"], "good") or T.Paint(L["off"], "muted")
end

-- /vg unlock
local function unlockCommand()
  if ns.Unlock() then
    chat(L["Unlocked: drag the handles. /vg lock when done."])
  else
    chat(L["In combat. Try again once combat ends."])
  end
end

-- /vg lock
local function lockCommand()
  ns.Lock()
  chat(L["Locked."])
end

-- /vg reset <frame|all>
local function resetCommand(rest)
  local key = rest ~= "" and rest or "all"
  local n = ns.ResetMovers(key)
  chat(n > 0 and ns.Format(L["Reset {count} frame(s)."], { count = n }) or ns.Format(L["No frame called {name}. /vg frames lists them."], { name = key }))
end

-- /vg frames
local function framesCommand()
  local list = ns.MoverList()
  chat(#list == 0 and L["No movable frames yet (enable a module)."] or L["Movable frames:"])
  for _, m in ipairs(list) do
    chat(string.format("  %s  (%s)", m.key, m.label))
  end
end

-- /vg frame <name> [deep]
local function frameCommand(rest)
  local name, deep = rest:match("^(%S+)%s*(%S*)$")
  if not name then return chat(L["Usage: /vg frame <name> [deep]   (a global frame name; dots follow keys: MinimapCluster.Tracking; #3 is the third child frame)"]) end
  printLines(ns.Inspect.Lines(name, deep:lower() == "deep"))
end

-- /vg accent reset
local function resetAccent()
  T.ResetAccent()
  chat(L["Accent back to default."])
end

-- /vg accent <rrggbb> | reset
local function accentCommand(rest)
  if rest == "reset" then
    return resetAccent()
  end
  local r, g, b = T.ParseColor(rest:lower())
  if not r then
    return chat(L["Usage: /vg accent rrggbb | brass | arcane | jade | orchid | copper"])
  end
  T.SetAccent(r, g, b)
  chat(ns.Format(L["Accent set to {accent}."], { accent = rest:lower() }))
end

-- Re-shows the grid with the current options while unlocked.
local function refreshGrid()
  local o = ns.MoverOptions()
  if ns.Unlocked() and o.grid then ns.ShowGrid(o.gridSize) else ns.HideGrid() end
end

-- /vg grid [size|on|off]
local function gridCommand(rest)
  local o, size = ns.MoverOptions(), tonumber(rest)
  if size and size >= 8 and size <= 256 then
    o.grid, o.gridSize = true, math.floor(size)
  elseif rest == "on" or rest == "off" or rest == "" then
    o.grid = rest == "on" or (rest == "" and not o.grid)
  else
    return chat(L["Usage: /vg grid [8-256 | on | off]"])
  end
  refreshGrid()
  chat(o.grid and ns.Format(L["Grid on, every {size} px."], { size = o.gridSize }) or L["Grid off."])
end

-- A switch command's word as the switch's new state: on, off (in any case), or nothing for the other of
-- current; nil for any other word, so the command prints its usage instead of guessing.
local function toggleWord(rest, current)
  local word = rest:lower()
  if word == "" then return not current end
  if word == "on" or word == "off" then return word == "on" end
  return nil
end

-- A switch command's handler: its word (on, off, or nothing for the other of the current state) is read through
-- toggleWord, written with spec.write, then spec.after (a refresh) runs and chat says spec.onText or spec.offText.
-- Any other word prints spec.usage.
local function switchCommand(spec)
  return function(rest)
    local on = toggleWord(rest, spec.read())
    if on == nil then return chat(ns.Literal(spec.usage)) end
    spec.write(on)
    if spec.after then spec.after() end
    chat(on and spec.onText or spec.offText)
  end
end

-- /vg snap on|off
local snapCommand = switchCommand({
  usage = L["Usage: /vg snap [on|off]"],
  read = function() return ns.MoverOptions().snap end,
  write = function(on) ns.MoverOptions().snap = on end,
  onText = L["Snapping on."], offText = L["Snapping off."],
})

-- /vg texelsnap [on|off]: pixel-grid snapping for still textures, for the A/B test (#226).
local texelSnapCommand = switchCommand({
  usage = L["Usage: /vg texelsnap [on|off]"],
  read = function() return T.Settings().texelSnap end,
  write = function(on) T.SetTexelSnap(on) end,
  onText = L["Texel snapping on: borders, fills, dividers and sheens snap to the pixel grid."], offText = L["Texel snapping off."],
})

-- /vg nineslice [on|off]: shadows and glows as one nine-slice texture each, after a reload (#236).
local nineSliceCommand = switchCommand({
  usage = L["Usage: /vg nineslice [on|off]"],
  read = function() return T.Settings().sliceRings end,
  write = function(on) T.Settings().sliceRings = on end,
  onText = L["Nine-slice shadows on after a /reload."], offText = L["Nine-slice shadows off after a /reload."],
})

-- /vg cdmglow [on|off|<percent>]: the Cooldown Manager refresh-window glow (#252), at once.
local function cdmGlowCommand(rest)
  local CG = ns.GetModule("CooldownGlow")
  if not CG.settings then return chat(L["Cooldown glow is off: turn the module on in the options first."]) end
  local percent = tonumber(rest)
  if percent then CG.SetPercent(percent) end
  local on = percent ~= nil or toggleWord(rest, CG.settings.glow)
  if on == nil then return chat(ns.Literal(L["Usage: /vg cdmglow [on|off|<percent>]"])) end
  CG.SetGlow(on)
  chat(CG.settings.glow and ns.Format(L["Cooldown Manager glow on: under {percent} percent left."], { percent = CG.settings.percent }) or L["Cooldown Manager glow off."])
end

-- /vg cdmkeys [on|off]: key text on the Cooldown Manager's icons, at once.
local cdmKeysSwitch = switchCommand({
  usage = L["Usage: /vg cdmkeys [on|off]"],
  read = function() return ns.GetModule("CooldownKeys").settings.keys end,
  write = function(on) ns.GetModule("CooldownKeys").SetKeys(on) end,
  onText = L["Cooldown Manager keys on."], offText = L["Cooldown Manager keys off."],
})

-- /vg cdmkeys: the module must be on first (its settings exist only then).
local function cdmKeysCommand(rest)
  if not ns.GetModule("CooldownKeys").settings then return chat(L["The Cooldown Manager keys module is off. Turn it on under /vg > Modules, then /reload."]) end
  return cdmKeysSwitch(rest)
end

-- /vg cooldowns [setup]: the Cooldowns options page, or its setup wizard.
local function cooldownsCommand(rest)
  if rest == "setup" then return ns.Options.CooldownWizard.Open() end
  ns.Options.Show("cooldowns")
end

-- /vg gradient [on|off]: floating windows' fills a shade lighter toward the top, at once (#259).
local gradientCommand = switchCommand({
  usage = L["Usage: /vg gradient [on|off]"],
  read = function() return T.Settings().panelGradient end,
  write = function(on) T.Settings().panelGradient = on end,
  after = function() T.Refresh() end,
  onText = L["Panel gradient on: windows run a shade lighter toward the top."], offText = L["Panel gradient off."],
})

-- /vg ornaments [on|off]: window ornaments, repainted at once (#238).
local ornamentsCommand = switchCommand({
  usage = L["Usage: /vg ornaments [on|off]"],
  read = function() return T.Settings().ornaments end,
  write = function(on) T.Settings().ornaments = on end,
  after = function() T.Refresh() end,
  onText = L["Window ornaments on."], offText = L["Window ornaments off."],
})

-- /vg icons [on|off]: line and menu icons baked at their on-screen size (#232), after a /reload.
local iconsCommand = switchCommand({
  usage = L["Usage: /vg icons [on|off]"],
  read = function() return T.Settings().sizedIcons end,
  write = function(on) T.Settings().sizedIcons = on end,
  onText = L["Sized icons on after a /reload."], offText = L["Sized icons off after a /reload."],
})

-- /vg variant [name]: a theme variant (#237), repainted at once.
local function variantCommand(rest)
  if rest == "" then rest = T.Settings().variant end
  if rest ~= "default" and not T.VARIANTS[rest] then return chat(ns.Literal(L["Usage: /vg variant default|contrast|vellum|classic|midnight|obsidian|moss|ember"])) end
  local assistBefore = T.ColorAssist()
  T.Settings().variant = rest
  T.Refresh()
  chat(ns.Format(L["Theme variant: {variant}."], { variant = T.VARIANTS[rest] and T.VARIANTS[rest].label or L["Slate and brass"] }))
  if T.ColorAssist() ~= assistBefore then ns.OfferReload(L["Safer colours changed with this look; the debuff type colours on aura icons follow after a reload."]) end
end

-- /vg corners [square|rounded]: panel corners on every theme, repainted at once (no argument shows the current one).
local function cornersCommand(rest)
  if rest == "" then rest = T.Settings().corners end
  if rest ~= "square" and rest ~= "rounded" then return chat(ns.Literal(L["Usage: /vg corners square|rounded"])) end
  T.Settings().corners = rest
  T.Refresh()
  chat(ns.Format(L["Corners: {corners}."], { corners = rest }))
end

-- /vg slug [on|off]: the SLUG font flag on world text, repainted at once (#239).
local slugCommand = switchCommand({
  usage = L["Usage: /vg slug [on|off]"],
  read = function() return T.Settings().slugText end,
  write = function(on) T.Settings().slugText = on end,
  after = function() T.RefreshText() end,
  onText = L["SLUG text on for world text."], offText = L["SLUG text off."],
})

-- /vg framebuffer [on|off]: windows go through a frame buffer while they fade (#239).
local frameBufferCommand = switchCommand({
  usage = L["Usage: /vg framebuffer [on|off]"],
  read = function() return T.Settings().frameBuffer end,
  write = function(on) T.Settings().frameBuffer = on end,
  onText = L["Frame buffers on while windows open and close."], offText = L["Frame buffers off."],
})

-- /vg theme reset
local function themeCommand(rest)
  if rest ~= "reset" then
    return chat(L["Usage: /vg theme reset"])
  end
  chat(ns.Options.ResetTheme() and L["Theme back to defaults (reload to apply)."] or L["Theme back to defaults."])
end

-- /vg modules
local function modulesCommand()
  local names = ns.ModuleNames()
  chat(#names == 0 and L["No modules yet."] or ns.Literal(L["Modules (enable|disable <module>, then /reload):"]))
  for _, name in ipairs(names) do
    chat(string.format("  %s  %s", name, onOff(ns.ModuleEnabled(name))))
  end
end

-- The registered name that matches text, ignoring case, from a list of names (nil when none does).
local function matchName(names, text)
  for _, name in ipairs(names) do
    if name:lower() == text:lower() then return name end
  end
end

-- /vg enable|disable <module>: the module's name may be typed in any case; with no name, the usage line.
local function setModule(on)
  return function(rest)
    if rest == "" then return chat(ns.Format(L["Usage: /vg {command} <module>. /vg modules lists them."], { command = on and "enable" or "disable" })) end
    local name = matchName(ns.ModuleNames(), rest)
    if not name then
      return chat(ns.Format(L["No module called {name}. /vg modules lists them."], { name = rest }))
    end
    ns.SetModuleEnabled(name, on)
    chat(ns.Format(on and L["{module} enabled. /reload to apply."] or L["{module} disabled. /reload to apply."], { module = name }))
  end
end

-- One line per registered skin.
local function listSkins()
  local list = ns.SkinList()
  chat(#list == 0 and L["No addon has registered a skin."] or L["Skinned addons:"])
  for _, s in ipairs(list) do
    chat(string.format("  %s  %s%s", s.name, onOff(s.enabled), s.error and ("  " .. ns.Format(L["error: {error}"], { error = s.error })) or ""))
  end
end

-- The names of the registered skins.
local function skinNames()
  local names = {}
  for i, s in ipairs(ns.SkinList()) do names[i] = s.name end
  return names
end

-- /vg skins [<addon> on|off]: only a registered skin, and only on or off, changes anything.
local function skinsCommand(rest)
  local typed, state = rest:match("^(.-)%s+(%S+)$")
  if not typed then
    return listSkins()
  end
  local name, on = matchName(skinNames(), typed), state:lower()
  if not name then return chat(ns.Format(L["No skin called {name}. /vg skins lists them."], { name = typed })) end
  if on ~= "on" and on ~= "off" then return chat(ns.Literal(ns.Format(L["Usage: /vg skins {addon} on|off"], { addon = name }))) end
  ns.Settings("skins")[name] = on == "on"
  chat(ns.Format(on == "on" and L["Skin for {addon} on. /reload to apply."] or L["Skin for {addon} off. /reload to apply."], { addon = name }))
end

-- /vg profile <name>: stage the switch, creating the profile if new, and offer the reload that applies it.
local function useProfile(name)
  if not ns.ValidProfileName(name) then
    return chat(L["Profile names are 1-32 letters, digits, spaces, - or _."])
  end
  ns.UseProfile(name)
  if not ns.PendingProfileName() then return chat(ns.Format(L["This character already uses profile {profile}."], { profile = name })) end
  ns.OfferReload(ns.Format(L["This character will use profile {profile} after the reload."], { profile = name }))
end

-- profile subcommands: new, copy, delete, reset.
local PROFILE_ACTIONS = {
  -- /vg profile new <name>
  new = function(name) chat(ns.NewProfile(name) and ns.Format(L["Created profile {profile}."], { profile = name }) or L["That name is taken or not allowed."]) end,
  -- /vg profile copy <from>
  copy = function(name)
    local into = ns.CopyProfile(name)
    if not into then return chat(ns.Format(L["No other profile called {profile}."], { profile = name })) end
    ns.Options.ProfileCopied(into)
    ns.OfferReload(ns.Format(L["Copied {from} into {profile}."], { from = name, profile = into }))
  end,
  -- /vg profile delete <name>
  delete = function(name) chat(ns.DeleteProfile(name) and ns.Format(L["Deleted profile {profile}."], { profile = name }) or L["Can't delete that one (missing, or in use)."]) end,
  -- /vg profile reset: asks and backs up first, as the Profiles page's Reset profile does
  reset = function() ns.Options.AskResetProfile() end,
}

-- /vg profile [new|copy|delete <name> | reset | <name>]
local function profileCommand(rest)
  if rest == "" then
    local text = ns.PendingProfileName() and L["Profile: {profile}; {next} after a reload   (all: {all})"] or L["Profile: {profile}   (all: {all})"]
    return chat(ns.Format(text, { profile = ns.ProfileName(), next = ns.PendingProfileName(), all = table.concat(ns.ProfileNames(), ", ") }))
  end
  local action, name = rest:match("^(%S+)%s*(.-)$")
  local handler = PROFILE_ACTIONS[action:lower()]
  if handler then return handler(name) end
  useProfile(rest)
end

-- The words of a command's rest, in order.
local function words(rest)
  local list = {}
  for word in rest:gmatch("%S+") do list[#list + 1] = word end
  return list
end

-- /vg export [part ...|pick]: the whole profile, the parts named (layout, situations,
-- global, a module), or pick: the panel with a switch for each part.
local function exportCommand(rest)
  if rest:lower() == "pick" then return ns.ExportDialog() end
  local text, err = ns.ExportProfile(rest ~= "" and words(rest) or nil)
  if not text then return chat(ns.Format(L["Nothing to export: {reason}."], { reason = err })) end
  ns.ShowText(ns.ExportTitle(rest ~= "" and rest or nil), text)
end

-- The import box's progress while a large string is read: "Importing… 40%" in its title.
local function importProgress(percent)
  ns.TextProgress(ns.Format(L["Importing… {percent}%"], { percent = percent }))
end

-- The end of /vg import: why it failed (the box stays, to try again), or the notes (fonts and
-- textures this client lacks, the backup), the UI scale question for a whole profile that
-- carries one, then the reload (when nothing needs one, what happened is said in chat at once).
local function imported(done, detail)
  if not done then
    ns.TextProgress(nil)
    return chat(ns.Format(L["Import failed: {reason}."], { reason = detail }))
  end
  ns.HideText()
  printLines(detail.notes)
  if not detail.reload then chat(done) end
  ns.OfferDisplay(detail.display, function() if detail.reload then ns.OfferReload(done) end end)
end

-- /vg import: a box to paste into. A large string is read a frame's work at a time, with
-- its progress in the box's title (Core/ProfileStrings.lua's ns.StartImport).
local function importCommand()
  ns.AskText(L["Paste a Vanguard string, then Import"], function(text)
    if not ns.StartImport(text, importProgress, imported) then chat(L["Import failed: an import is still running."]) end
  end)
end

ns.ImportDialog = importCommand
ns.ImportDone = imported

-- /vg preset [name]: the presets on offer (Core/Integration.lua), or ask to apply one.
local function presetCommand(rest)
  local preset = ns.FindPreset(rest)
  if preset then return ns.AskPreset(preset) end
  chat(rest == "" and L["Presets (/vg preset <name> applies one):"] or ns.Format(L["No preset called {name}. Presets:"], { name = rest }))
  for _, p in ipairs(Vanguard.GetPresets()) do chat("  " .. p.name .. (p.info ~= "" and ("  -  " .. p.info) or "")) end
end

-- One /vg binds line: the key, what it does, and (in the warning colour) why it does nothing when the game won't run it.
local function bindLine(CC, b)
  local why = CC.WontRun(b)
  local note = why and ("  " .. T.Paint(ns.Format(L["(does nothing: {why})"], { why = why }), "warn")) or ""
  return "  " .. CC.KeyText(b.key) .. "  ->  " .. CC.ActionText(b) .. note
end

-- /vg binds: this spec's click-casting bindings, one per line.
local function bindsCommand()
  local CC = ns.GetModule("ClickCast")
  local list = CC and CC.Bindings() or {}
  if CC and CC.UsesGame() then chat(L["The game's click bindings are in use; Vanguard's below rest until you switch back."]) end
  chat(#list == 0 and L["No click-casting bindings for this spec. /vg > Click casting to add some."] or L["Click casting (this spec):"])
  for _, b in ipairs(list) do chat(bindLine(CC, b)) end
end

-- /vg spec [profile|off]
local function specCommand(rest)
  if not ns.HasSpecs() then return chat(L["This client has no specializations, so profiles don't switch by spec."]) end
  local spec = ns.SpecIndex()
  if not spec then return chat(L["No specialization on this character yet."]) end
  if rest == "" then
    return chat(ns.Format(L["Spec {spec} uses {profile}."], { spec = spec, profile = ns.SpecProfile(spec) or L["the character's profile (no spec profile set)"] }))
  end
  if rest ~= "off" and not VanguardDB.profiles[rest] then return chat(ns.Format(L["No profile called {profile}. /vg profile new {profile} first."], { profile = rest })) end
  ns.SetSpecProfile(rest ~= "off" and rest or nil, spec)
  chat(rest == "off" and L["This spec no longer switches profiles."] or ns.Format(L["Spec {spec} now uses profile {profile}."], { spec = spec, profile = rest }))
end

-- The addon version from the TOC (Core/WhatsNew.lua reads it).
local function version()
  return ns.AddonVersion()
end

-- The first WoW Forever beta build that loads addon settings and runs secure
-- frames (raid frames, click casting, bar paging); older ones break both.
local FIXED_BUILD = 70009

-- "  ·  build 1.60.1 (70009)", with a warning on an older WoW Forever build; "" when the client can't say.
local function buildText()
  if type(GetBuildInfo) ~= "function" then return "" end
  local release, build = GetBuildInfo()
  local text = string.format("  ·  build %s (%s)", tostring(release), tostring(build))
  local old = ns.IsForever() and (tonumber(build) or FIXED_BUILD) < FIXED_BUILD
  return old and (text .. "  ·  update the game: this build loses settings at every launch") or text
end

-- The secure snippet part of the client line: what the probe found, or nothing before it ran.
local function snippetText()
  local has = ns.Client and ns.Client.has or {}
  if has.secureSnippets == false then return "  ·  secure snippets: no (hover keys off)" end
  return has.secureSnippets and "  ·  secure snippets: yes" or ""
end

-- The client line: which game and build, which aura backend, and whether aura values are hidden right now.
local function clientLine()
  local client = ns.IsForever() and "WoW Forever" or "Retail"
  local hidden = ns.AurasSecret() and "hidden right now" or "readable"
  return string.format("Client %s%s  ·  auras on the %s  ·  aura values %s", client, buildText(), ns.Auras.BackendName(), hidden) .. snippetText()
end

-- The text line: UI scale, Text size, and how tall chat text draws on this screen.
local function textLine()
  local CH, frame = ns.GetModule("Chat"), _G.ChatFrame1
  local size = (CH.settings and frame) and CH.TextSize(frame) or T.ScaledSize(T.ROLES.chat.size)
  local percent = math.floor((T.Settings().textScale or 1) * 100 + 0.5)
  return string.format("UI scale %.2f  ·  text %d%%  ·  chat %d (about %d px on this screen)",
    UIParent:GetScale(), percent, size, math.floor(size * T.PixelsPerUnit() + 0.5))
end

-- How many modules are on.
local function modulesOn()
  local enabled = 0
  for _, name in ipairs(ns.ModuleNames()) do
    enabled = enabled + (ns.ModuleEnabled(name) and 1 or 0)
  end
  return enabled
end

-- The restrictions line: the add-on restrictions the client has on right now, or "none".
local function restrictionLine()
  local active = ns.ActiveRestrictions()
  return "Game restrictions: " .. (#active > 0 and table.concat(active, ", ") or "none")
end

-- /vg status
local function statusCommand()
  chat(string.format("Vanguard %s  ·  profile %s  ·  %d/%d modules on", version(), ns.ProfileName(), modulesOn(), #ns.ModuleNames()))
  chat(string.format("%d skinned addon(s)  ·  %d painted frame(s)  ·  %d change(s) waiting on combat", #ns.SkinList(), T.PaintedCount(), ns.QueuedCount()))
  chat(clientLine())
  chat(ns.Client.Line())
  chat(restrictionLine())
  chat(textLine())
end

-- "16001": the client's interface version, or "?" when it can't say.
local function interfaceText()
  local iface = type(GetBuildInfo) == "function" and select(4, GetBuildInfo())
  return tostring(iface or "?")
end

-- How many times the caught errors happened, in all.
local function occurrences()
  local n = 0
  for _, e in ipairs(ns.errors) do n = n + e.count end
  return n
end

-- Text without the game's color codes (|cAARRGGBB and |r), which a pasted report can't use.
local function plain(text)
  return (tostring(text):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))
end

-- One caught error: its text and count, then each line of its stack, indented.
local function errorBlock(e)
  local out = { string.format("%s  (x%d)", e.text, e.count) }
  for line in tostring(e.stack):gmatch("[^\n]+") do out[#out + 1] = "    " .. line end
  return table.concat(out, "\n")
end

-- The /vg errors text: the version line, the client line, then each caught error with its stack.
local function errorsText()
  local lines = { string.format("Vanguard %s  ·  interface %s  ·  %d error(s) caught this session (%d in all), newest last:", version(), interfaceText(), #ns.errors, occurrences()), clientLine() }
  for _, e in ipairs(ns.errors) do lines[#lines + 1] = errorBlock(e) end
  return plain(table.concat(lines, "\n"))
end

-- /vg errors [clear]: the errors Vanguard caught this session, newest last, in the
-- copy window with the version, client and aura backend a bug report needs; clear empties the list.
local function errorsCommand(rest)
  if rest == "clear" then ns.ClearErrors() return chat(L["Cleared."]) end
  if #ns.errors == 0 then return chat(L["No errors caught this session."]) end
  chat(ns.Format(L["{count} error(s), opened in the copy window."], { count = #ns.errors }))
  ns.ShowErrors(L["Vanguard errors: Ctrl+C to copy"], errorsText())
end

-- /vg report ----------------------------------------------------------------------------

-- The most a report holds, in characters, so it fits the feedback form's report box.
local REPORT_MAX = 8000
-- The most stack lines a report keeps for one error.
local REPORT_STACK = 8

-- The modules turned off, by name ("none" when every one is on).
local function modulesOff()
  local off = {}
  for _, name in ipairs(ns.ModuleNames()) do
    if not ns.ModuleEnabled(name) then off[#off + 1] = name end
  end
  return #off > 0 and table.concat(off, ", ") or "none"
end

-- The skinned addons, each marked "(off)" or "(failed)" where it is ("none" when there are none).
local function skinsText()
  local out = {}
  for _, skin in ipairs(ns.SkinList()) do
    out[#out + 1] = skin.name .. (not skin.enabled and " (off)" or skin.error and " (failed)" or "")
  end
  return #out > 0 and table.concat(out, ", ") or "none"
end

-- "Screen 1920x1080", or "Screen size unknown" when the client can't say.
local function screenLine()
  local d = ns.DisplayBlock()
  return d.width > 0 and string.format("Screen %dx%d", d.width, d.height) or "Screen size unknown"
end

-- The report's lines before the errors: the same facts /vg status and /vg errors print.
local function reportHead()
  return { "### Vanguard report v1 ###",
    string.format("Vanguard %s  ·  interface %s  ·  profile %s  ·  %d/%d modules on", version(), interfaceText(), ns.ProfileName(), modulesOn(), #ns.ModuleNames()),
    clientLine(), ns.Client.Line(), restrictionLine(), textLine(), screenLine(), "Modules off: " .. modulesOff(), "Skins: " .. skinsText(),
    string.format("Errors: %d (%d in all)", #ns.errors, occurrences()) }
end

-- One caught error for the report: "[i] text  (xN)", then (when `stack`) up to REPORT_STACK stack lines, indented.
local function errorLines(i, e, stack)
  local out = { string.format("[%d] %s  (x%d)", i, e.text, e.count) }
  for line in (stack and tostring(e.stack) or ""):gmatch("[^\n]+") do
    if #out <= REPORT_STACK then out[#out + 1] = "    " .. line end
  end
  return out
end

-- The report with the caught errors from `first` on (newest last), each with its stack when `stacks`.
local function reportText(first, stacks)
  local lines = reportHead()
  for i = first, #ns.errors do
    for _, line in ipairs(errorLines(i, ns.errors[i], stacks)) do lines[#lines + 1] = line end
  end
  lines[#lines + 1] = "### end ###"
  return plain(table.concat(lines, "\n"))
end

-- The whole /vg report text, at most REPORT_MAX characters: the stacks go first, then the oldest errors.
function ns.ReportText()
  local text = reportText(1, true)
  for first = 1, #ns.errors do
    if #text <= REPORT_MAX then return text end
    text = reportText(first, false)
  end
  return text
end

-- /vg report: one block, selected for copying, to paste into the feedback form on vanguardui.com.
local function reportCommand()
  ns.ShowText(L["Vanguard report: Ctrl+C, then paste at vanguardui.com/feedback"], ns.ReportText())
end

-- /vg feedback [bug|feature]: the feedback form (Core/Feedback.lua), on that kind when one is given.
local function feedbackCommand(rest)
  ns.Feedback.Open(rest)
end

-- /vg stock: the Errands module's stock list, which exists only while that module is on.
local function stockCommand(rest)
  local ER = ns.GetModule("Errands")
  if not ER.settings then return chat(L["Vanguard's Errands are off (/vg > Modules)."]) end
  ER.StockCommand(rest)
end

-- /vg junk and /vg sell: the Merchant module's sell list and sell-all, which exist only while it is on.
local function merchantCommand(method)
  return function(rest)
    local MC = ns.GetModule("Merchant")
    if not MC.settings then return chat(L["Vanguard's Merchant helpers are off (/vg > Modules)."]) end
    MC[method](rest)
  end
end

-- /vg quests [history [n]]: the quest log, or the latest turn-ins of all your characters (Modules/QuestHistory.lua).
local function questsCommand(rest)
  if rest:lower():match("^history") then return ns.GetModule("QuestHistory").Command(rest) end
  local QL = ns.GetModule("QuestLog")
  if QL.frame then QL.Toggle() else chat(L["Vanguard's quest log is off (/vg > Quests)."]) end
end

local COMMANDS = {
  -- /vg help
  help = helpCommand,
  -- /vg preset [name]
  preset = presetCommand,
  -- /vg options (also /vg with nothing after it)
  options = function() ns.Options.Toggle() end,
  config = function() ns.Options.Toggle() end,
  -- /vg setup: the first-run wizard again (after combat, if in it)
  setup = function() ns.Setup.Open() end,
  -- /vg whatsnew: the release notes for this version again
  whatsnew = function() ns.WhatsNew.Open() end,
  unlock = unlockCommand,
  move = unlockCommand,
  lock = lockCommand,
  reset = resetCommand,
  frames = framesCommand,
  accent = accentCommand,
  grid = gridCommand,
  snap = snapCommand,
  texelsnap = texelSnapCommand,
  nineslice = nineSliceCommand,
  cdmglow = cdmGlowCommand,
  cdmkeys = cdmKeysCommand,
  gradient = gradientCommand,
  ornaments = ornamentsCommand,
  icons = iconsCommand,
  variant = variantCommand,
  corners = cornersCommand,
  slug = slugCommand,
  framebuffer = frameBufferCommand,
  theme = themeCommand,
  modules = modulesCommand,
  enable = setModule(true),
  disable = setModule(false),
  skins = skinsCommand,
  profile = profileCommand,
  export = exportCommand,
  import = importCommand,
  spec = specCommand,
  binds = bindsCommand,
  preview = function(rest) ns.RaidPreview.Command(rest) end,
  keybind = function() ns.GetModule("ActionBars").ToggleKeybindMode() end,
  copy = function() ns.GetModule("ChatExtras").ShowCopy() end,
  quests = questsCommand,
  plates = function(rest) ns.GetModule("Nameplates").Command(rest) end,
  stock = stockCommand,
  bag = function(rest) ns.GetModule("Bags").Command(rest) end,
  junk = merchantCommand("JunkCommand"),
  sell = merchantCommand("SellCommand"),
  craft = function(rest) ns.GetModule("CraftQueue").Command(rest) end,
  mail = function(rest) ns.GetModule("MailTools").Command(rest) end,
  pets = function() ns.GetModule("PetStable").Command() end,
  rolls = function(rest) ns.GetModule("Rolls").Command(rest) end,
  loot = function(rest) ns.GetModule("OfficerLoot").Command(rest) end,
  fights = function() ns.GetModule("FightHistory").Command() end,
  recap = function(rest) ns.GetModule("FightHistory").RecapCommand(rest) end,
  meter = function(rest) ns.GetModule("Meter").Command(rest) end,
  vendors = function(rest) ns.GetModule("VendorMemory").Command(rest) end,
  ranks = function(rest) ns.GetModule("SpellRanks").RanksCommand(rest) end,
  trainers = function(rest) ns.GetModule("SpellRanks").TrainersCommand(rest) end,
  inventory = function(rest) ns.GetModule("Inventory").Command(rest) end,
  gear = function() ns.GetModule("CharacterExtras").Command() end,
  alts = function(rest) ns.GetModule("Inventory").AltsCommand(rest) end,
  weights = function(rest) ns.GetModule("Upgrades").Command(rest) end,
  prep = function(rest) ns.GetModule("InstancePrep").Command(rest) end,
  talents = function(rest) ns.GetModule("TalentPlanner").Command(rest) end,
  legacy = function(rest) ns.GetModule("Legacy").Command(rest) end,
  watch = function(rest) ns.GetModule("ChatWatch").Command(rest) end,
  filter = function(rest) ns.GetModule("ChatFilter").Command(rest) end,
  history = function(rest) ns.GetModule("ChatHistory").Command(rest) end,
  gaps = function(rest) ns.GetModule("CooldownGaps").Command(rest) end,
  cooldowns = cooldownsCommand,
  lfg = function(rest) ns.GetModule("GroupBoard").Command(rest) end,
  questdata = function(rest) ns.QuestGuide.Command(rest) end,
  guide = function(rest) ns.GuideData.Command(rest) end,
  probe = function(rest) ns.Probe.Command(rest) end,
  situation = function(rest) ns.GetModule("Situations").Command(rest) end,
  ah = function(rest) ns.GetModule("AuctionHelper").Command(rest) end,
  way = function(rest) ns.GetModule("Waypoints").Command(rest) end,
  dock = function() ns.GetModule("BossDocks").Command() end,
  factionart = function() ns.FactionArt.Report() end,
  realm = function() ns.Home.Report() end,
  launch = function(rest) ns.Home.Launch(rest) end,
  frame = frameCommand,
  status = statusCommand,
  errors = errorsCommand,
  report = reportCommand,
  feedback = feedbackCommand,
  perf = function(rest) ns.Perf.Command(rest) end,
  mem = function() ns.Perf.MemCommand() end,
  graphics = function(rest) ns.Graphics.Command(rest) end,
}

-- /vg entry point: no arguments opens the options window. A command runs under
-- ns.Try, so an error in it is kept for /vg errors like any other caught error.
local function handleSlash(msg)
  local cmd, rest = (msg or ""):match("^%s*(%S*)%s*(.-)%s*$")
  if cmd == "" then
    return ns.Try("slash options", ns.Options.Toggle)
  end
  local handler = COMMANDS[cmd:lower()] or function() chat(L["Unknown command. /vg help"]) end
  ns.Try("slash " .. cmd:lower(), handler, rest)
end

SLASH_VANGUARD1 = "/vg"
SLASH_VANGUARD2 = "/vanguard"
SlashCmdList["VANGUARD"] = handleSlash
