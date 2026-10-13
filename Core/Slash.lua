-- /vg (and /vanguard): unlock/lock, positions, theme, modules, profiles.

local ADDON, ns = ...

local T = ns.Theme
local chat = ns.Chat

local HELP = {
  "A from-scratch UI suite. /vg opens the options window; /vg <command>:",
  "setup                first-run setup again: layout, screen, look, then move things",
  "whatsnew             what's new in this version of Vanguard; click a line to open its setting",
  "unlock | lock        drag handles on every Vanguard frame; click one, then arrow keys nudge (Shift: 10 px)",
  "reset <frame|all>    put a frame (or every frame) back at its default spot",
  "frames               list the movable frames",
  "grid [size|on|off]   the unlock-mode grid; snap on|off   snapping while dragging",
  "texelsnap [on|off]   still borders, fills and lines snap to the pixel grid (a test; off by default)",
  "slug [on|off]        world text (nameplates, floating numbers) drawn with the SLUG font flag, at once (a test; off by default)",
  "framebuffer [on|off] windows drawn through a frame buffer while they open and close (a test; off by default)",
  "nineslice [on|off]   shadows and glows as one nine-slice texture each, after a reload (a test; off by default)",
  "icons [on|off]       menu strip icons drawn at their on-screen size, after a /reload (off by default)",
  "cdmglow [on|off|<percent>]  glow a Cooldown Manager buff icon in its last part, 10 to 60 percent (off by default)",
  "ornaments [on|off]   a brass rule or corner brackets on the options window, setup and quest log (off by default)",
  "variant [default|contrast|vellum|classic|midnight|obsidian|moss|ember]  surfaces and text: Slate and brass, High contrast, Vellum and ink, Classic look, Midnight, Obsidian, Moss, Ash and ember",
  "gradient [on|off]    windows a shade lighter toward the top (off by default)",
  "accent <rrggbb|name> set the accent color (brass, arcane, jade, orchid, copper); accent reset",
  "theme reset          every theme setting back to default",
  "modules              list modules; enable|disable <module> (then /reload)",
  "skins                addons skinned through Vanguard.RegisterSkin; skins <addon> on|off",
  "profile [name]       show profiles, or switch this character to one",
  "profile new|copy|delete <name>, profile reset   manage profiles",
  "export [part ...|pick]   copy the profile as a string, or only some parts of it: layout, situations, global or a module's name; pick opens a panel with a switch for each part",
  "import               paste a string from /vg export: a whole profile becomes a new profile, a partial one merges into yours (backed up first)",
  "preset [name]        presets on offer (Vanguard's healer, damage and tank, and any an addon registers); a name asks to apply it, backed up first",
  "spec [profile|off]   use a profile whenever you're in this specialization",
  "copy                 the recent chat as plain text, ready to copy",
  "situation [record <name>|stop|clear [name]|list]   Situations: record a layout and settings for solo, party, raid, pvp, instance or resting",
  "watch [add|remove <phrase>|list|clear]   Chat watch: phrases that ring a sound and show a toast when said in chat",
  "quests               open or close Vanguard's quest log (the game's quest log key does too)",
  "questdata [questID]  what the client says about a quest (or the quests an open NPC offers and those you track), and whether it flags quests new in WoW Forever",
  "lfg                  open or close the group board: looking-for-more and looking-for-group posts from chat by dungeon, role and level",
  "stock [<item> <n>]   items to keep in your bags; a merchant tops them up (0 removes, clear empties)",
  "craft [add [n]|next|stock|cd|top|done|clear]   the craft queue: queue the recipe on display, open the next one, raise Keep stocked to fit, show cooldowns, rank recipes (off until switched on)",
  "mail [words]|preset [add <name> <character> [words]|remove <name>]|send <name>   search the inbox; presets for sending items to your alts (off until switched on)",
  "rolls [clear]        the group's /roll results this session, newest first; clear forgets them",
  "loot [on|off|add|remove|list|clear|focus|roster]   officer loot tools (off until switched on): a soft-reserve list flagged in the roll tracker, and a group roster",
  "fights               your DPS, length and place in each fight this session, newest first",
  "meter [on|off|dps|hps]   Vanguard's own damage or healing meter: the top lines of the game's damage meter in a Vanguard panel (off until switched on)",
  "recap [say|party|raid|instance|guild]   the last fight's interrupts, dispels, damage taken and deaths from the game's damage meter, in your chat or sent to that channel",
  "vendors [clear]      how many merchants Vanguard remembers (for tooltips and the stock list); clear forgets them",
  "ranks [swap]         spell ranks: bar buttons holding an older rank than you know; swap puts the newest rank there (out of combat). Off until Spell ranks is switched on",
  "trainers [next|clear]   what the trainers you've visited teach: how many services are remembered, what the next levels bring and where, or forget them (Trainer memory off until switched on)",
  "inventory [forget <name>|clear]   your characters remembered here and when their bags were read; forget drops one, clear forgets them all",
  "weights [set <stat> <n>|reset|export|import]   the stat weights gear upgrades use for your class and role; change one, go back to the defaults, or share them",
  "prep [want <kind> <n>] the Instance prep card now: what you're short of (with Dungeon card on: the dungeon's level range, your quests for it and your keys); want sets how many food, bandages, potions, ammo or shards",
  "legacy [probe|plan ...]   Legacy system: probe lists what the client has for it; plan [add <points> <name>|remove <name>|clear] keeps a list of perks for the tree's 16 points (planner off until switched on)",
  "talents [plan|spend|clear|export|import]   Talent planner: the plan's summary; plan mode on or off, spend the planned points, clear the plan, share it as a string",
  "ah [list <name>|add <list> <item>|rename <name>|duplicate|delete|export|import|recent|scan|prices clear]  shopping lists (pick or make one, add an item: a link, an ID or a name; rename, copy, delete, export or import the list in use; recent: the last 20 items searched); scan the auction house (while it's open); forget the prices",
  "way [zone] x y [title]   a waypoint on the map that the game's arrow points to (a zone by name, or #<map id>); way clear removes it",
  "dock                 line up Deadly Boss Mods' bars with the Boss timers spots (move those with unlock); for BigWigs, where to drag its bars",
  "preview [party|10|25|40|off]   the raid frames filled with sample players, to check them without a group (not saved)",
  "binds                this spec's click-casting and hover-key bindings (set them in /vg > Click casting)",
  "keybind              keybind mode: hover an action button and press a key, a side mouse button or the wheel to bind it; Backspace clears, Escape leaves",
  "status               version, profile, modules, skins, work waiting on combat, what the client has",
  "factionart           which of the game's own faction pictures this client has",
  "realm                your realm, ruleset and side as the client gives them, and the key your prices, sales and characters are kept under",
  "frame <name> [deep]  what the client says about a frame now: shown, alpha, scale, size, its rect (or none), anchors and its parents; deep adds its textures and child frames (for a frame that draws empty)",
  "errors [clear]       the errors Vanguard caught this session, with stacks and counts (for a bug report); clear empties the list",
  "report               one block to copy for a bug report: what /vg status and /vg errors say, ready to paste at vanguardui.com/feedback",
  "feedback [bug|feature]   a bug report or feature request written here: the questions vanguardui.com/feedback asks, then one block to paste there (it fills the form)",
  "gaps [add <item>|remove <item>|spell add <spell>|spell remove <spell>|clear]   Cooldown gaps (switch it on under Combat tools): choose items such as a Healthstone or potion, and spells, to show beside trinkets, pet abilities and totems; no verb lists them",
  "perf [cpu|watch]     Vanguard's CPU and memory now; cpu turns the game's CPU profiling on or off (reload); watch prints them every minute",
  "mem                  watches Vanguard's memory for a minute (out of combat), then says how much it grew and whether it kept any; again ends it early",
}

-- Prints each line.
local function printLines(lines)
  for _, line in ipairs(lines) do
    chat(line)
  end
end

-- "on" / "off" in green / gray.
local function onOff(on)
  return on and T.Paint("on", "good") or T.Paint("off", "muted")
end

-- /vg unlock
local function unlockCommand()
  if ns.Unlock() then
    chat("Unlocked: drag the handles. /vg lock when done.")
  else
    chat("In combat. Try again once combat ends.")
  end
end

-- /vg lock
local function lockCommand()
  ns.Lock()
  chat("Locked.")
end

-- /vg reset <frame|all>
local function resetCommand(rest)
  local key = rest ~= "" and rest or "all"
  local n = ns.ResetMovers(key)
  chat(n > 0 and string.format("Reset %d frame(s).", n) or ("No frame called " .. key .. ". /vg frames lists them."))
end

-- /vg frames
local function framesCommand()
  local list = ns.MoverList()
  chat(#list == 0 and "No movable frames yet (enable a module)." or "Movable frames:")
  for _, m in ipairs(list) do
    chat(string.format("  %s  (%s)", m.key, m.label))
  end
end

-- /vg frame <name> [deep]
local function frameCommand(rest)
  local name, deep = rest:match("^(%S+)%s*(%S*)$")
  if not name then return chat("Usage: /vg frame <name> [deep]   (a global frame name; dots follow keys: MinimapCluster.Tracking; #3 is the third child frame)") end
  printLines(ns.Inspect.Lines(name, deep:lower() == "deep"))
end

-- /vg accent reset
local function resetAccent()
  T.ResetAccent()
  chat("Accent back to default.")
end

-- /vg accent <rrggbb> | reset
local function accentCommand(rest)
  if rest == "reset" then
    return resetAccent()
  end
  local r, g, b = T.ParseColor(rest:lower())
  if not r then
    return chat("Usage: /vg accent rrggbb | brass | arcane | jade | orchid | copper")
  end
  T.SetAccent(r, g, b)
  chat("Accent set to " .. rest:lower() .. ".")
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
    return chat("Usage: /vg grid [8-256 | on | off]")
  end
  refreshGrid()
  chat(o.grid and string.format("Grid on, every %d px.", o.gridSize) or "Grid off.")
end

-- /vg snap on|off
local function snapCommand(rest)
  local o = ns.MoverOptions()
  o.snap = rest == "on" or (rest == "" and not o.snap)
  chat(o.snap and "Snapping on." or "Snapping off.")
end

-- /vg texelsnap [on|off]: pixel-grid snapping for still textures, for the A/B test (#226).
local function texelSnapCommand(rest)
  local on = rest == "on" or (rest == "" and not T.Settings().texelSnap)
  T.SetTexelSnap(on)
  chat(on and "Texel snapping on: borders, fills, dividers and sheens snap to the pixel grid." or "Texel snapping off.")
end

-- /vg nineslice [on|off]: shadows and glows as one nine-slice texture each, after a reload (#236).
local function nineSliceCommand(rest)
  local s = T.Settings()
  s.sliceRings = rest == "on" or (rest == "" and not s.sliceRings)
  chat((s.sliceRings and "Nine-slice shadows on" or "Nine-slice shadows off") .. " after a /reload.")
end

-- /vg cdmglow [on|off|<percent>]: the Cooldown Manager refresh-window glow (#252), at once.
local function cdmGlowCommand(rest)
  local CG = ns.GetModule("CooldownGlow")
  local percent = tonumber(rest)
  if percent then CG.settings.percent = math.min(60, math.max(10, math.floor(percent))) end
  CG.settings.glow = percent ~= nil or rest == "on" or (rest == "" and not CG.settings.glow)
  CG.Apply()
  chat(CG.settings.glow and ("Cooldown Manager glow on: under " .. CG.settings.percent .. " percent left.") or "Cooldown Manager glow off.")
end

-- /vg gradient [on|off]: floating windows' fills a shade lighter toward the top, at once (#259).
local function gradientCommand(rest)
  local s = T.Settings()
  s.panelGradient = rest == "on" or (rest == "" and not s.panelGradient)
  T.Refresh()
  chat(s.panelGradient and "Panel gradient on: windows run a shade lighter toward the top." or "Panel gradient off.")
end

-- /vg ornaments [on|off]: window ornaments, repainted at once (#238).
local function ornamentsCommand(rest)
  local s = T.Settings()
  s.ornaments = rest == "on" or (rest == "" and not s.ornaments)
  T.Refresh()
  chat(s.ornaments and "Window ornaments on." or "Window ornaments off.")
end

-- /vg icons [on|off]: line and menu icons baked at their on-screen size (#232), after a /reload.
local function iconsCommand(rest)
  local s = T.Settings()
  if rest ~= "" and rest ~= "on" and rest ~= "off" then return chat("Usage: /vg icons [on|off]") end
  s.sizedIcons = rest == "on" or (rest == "" and not s.sizedIcons)
  chat(s.sizedIcons and "Sized icons on after a /reload." or "Sized icons off after a /reload.")
end

-- /vg variant [name]: a theme variant (#237), repainted at once.
local function variantCommand(rest)
  if rest == "" then rest = T.Settings().variant end
  if rest ~= "default" and not T.VARIANTS[rest] then return chat("Usage: /vg variant default|contrast|vellum|classic|midnight|obsidian|moss|ember") end
  T.Settings().variant = rest
  T.Refresh()
  chat("Theme variant: " .. (T.VARIANTS[rest] and T.VARIANTS[rest].label or "Slate and brass") .. ".")
end

-- /vg slug [on|off]: the SLUG font flag on world text, repainted at once (#239).
local function slugCommand(rest)
  local s = T.Settings()
  s.slugText = rest == "on" or (rest == "" and not s.slugText)
  T.RefreshText()
  chat(s.slugText and "SLUG text on for world text." or "SLUG text off.")
end

-- /vg framebuffer [on|off]: windows go through a frame buffer while they fade (#239).
local function frameBufferCommand(rest)
  local s = T.Settings()
  s.frameBuffer = rest == "on" or (rest == "" and not s.frameBuffer)
  chat(s.frameBuffer and "Frame buffers on while windows open and close." or "Frame buffers off.")
end

-- /vg theme reset
local function themeCommand(rest)
  if rest ~= "reset" then
    return chat("Usage: /vg theme reset")
  end
  T.Reset()
  chat("Theme back to defaults.")
end

-- /vg modules
local function modulesCommand()
  local names = ns.ModuleNames()
  chat(#names == 0 and "No modules yet." or "Modules (enable|disable <module>, then /reload):")
  for _, name in ipairs(names) do
    chat(string.format("  %s  %s", name, onOff(ns.ModuleEnabled(name))))
  end
end

-- /vg enable|disable <module>
local function setModule(on)
  return function(rest)
    if not ns.GetModule(rest) then
      return chat("No module called " .. rest .. ". /vg modules lists them.")
    end
    ns.SetModuleEnabled(rest, on)
    chat(string.format("%s %s. /reload to apply.", rest, on and "enabled" or "disabled"))
  end
end

-- One line per registered skin.
local function listSkins()
  local list = ns.SkinList()
  chat(#list == 0 and "No addon has registered a skin." or "Skinned addons:")
  for _, s in ipairs(list) do
    chat(string.format("  %s  %s%s", s.name, onOff(s.enabled), s.error and ("  error: " .. s.error) or ""))
  end
end

-- /vg skins [<addon> on|off]
local function skinsCommand(rest)
  local name, state = rest:match("^(%S+)%s+(%S+)$")
  if not name then
    return listSkins()
  end
  ns.Settings("skins")[name] = state == "on"
  chat(string.format("Skin for %s %s. /reload to apply.", name, state == "on" and "on" or "off"))
end

-- /vg profile <name>: stage the switch, creating the profile if new, and offer the reload that applies it.
local function useProfile(name)
  if not ns.ValidProfileName(name) then
    return chat("Profile names are 1-32 letters, digits, spaces, - or _.")
  end
  ns.UseProfile(name)
  if not ns.PendingProfileName() then return chat("This character already uses profile " .. name .. ".") end
  ns.OfferReload("This character will use profile " .. name .. " after the reload.")
end

-- profile subcommands: new, copy, delete, reset.
local PROFILE_ACTIONS = {
  -- /vg profile new <name>
  new = function(name) chat(ns.NewProfile(name) and ("Created profile " .. name .. ".") or "That name is taken or not allowed.") end,
  -- /vg profile copy <from>
  copy = function(name)
    local into = ns.CopyProfile(name)
    if not into then return chat("No other profile called " .. name .. ".") end
    ns.OfferReload("Copied " .. name .. " into " .. into .. ".")
  end,
  -- /vg profile delete <name>
  delete = function(name) chat(ns.DeleteProfile(name) and ("Deleted profile " .. name .. ".") or "Can't delete that one (missing, or in use).") end,
  -- /vg profile reset
  reset = function() ns.ResetProfile(); ns.OfferReload("Profile " .. ns.ProfileName() .. " is back to defaults.") end,
}

-- /vg profile [new|copy|delete <name> | reset | <name>]
local function profileCommand(rest)
  if rest == "" then
    local later = ns.PendingProfileName() and ("; " .. ns.PendingProfileName() .. " after a reload") or ""
    return chat("Profile: " .. ns.ProfileName() .. later .. "   (all: " .. table.concat(ns.ProfileNames(), ", ") .. ")")
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
  if not text then return chat("Nothing to export: " .. err .. ".") end
  ns.ShowText("Vanguard export (" .. (rest ~= "" and rest or "profile " .. ns.ProfileName()) .. ")  Ctrl+C to copy", text)
end

-- The import box's progress while a large string is read: "Importing… 40%" in its title.
local function importProgress(percent)
  ns.TextProgress("Importing… " .. percent .. "%")
end

-- The end of /vg import: why it failed (the box stays, to try again), or the notes (fonts and
-- textures this client lacks, the backup), the UI scale question for a whole profile that
-- carries one, then the reload (when nothing needs one, what happened is said in chat at once).
local function imported(done, detail)
  if not done then
    ns.TextProgress(nil)
    return chat("Import failed: " .. detail .. ".")
  end
  ns.HideText()
  printLines(detail.notes)
  if not detail.reload then chat(done) end
  ns.OfferDisplay(detail.display, function() if detail.reload then ns.OfferReload(done) end end)
end

-- /vg import: a box to paste into. A large string is read a frame's work at a time, with
-- its progress in the box's title (Core/ProfileStrings.lua's ns.StartImport).
local function importCommand()
  ns.AskText("Paste a Vanguard string, then Import", function(text)
    if not ns.StartImport(text, importProgress, imported) then chat("Import failed: an import is still running.") end
  end)
end

ns.ImportDialog = importCommand
ns.ImportDone = imported

-- /vg preset [name]: the presets on offer (Core/Integration.lua), or ask to apply one.
local function presetCommand(rest)
  local preset = ns.FindPreset(rest)
  if preset then return ns.AskPreset(preset) end
  chat(rest == "" and "Presets (/vg preset <name> applies one):" or ("No preset called " .. rest .. ". Presets:"))
  for _, p in ipairs(Vanguard.GetPresets()) do chat("  " .. p.name .. (p.info ~= "" and ("  -  " .. p.info) or "")) end
end

-- /vg binds: this spec's click-casting bindings, one per line.
local function bindsCommand()
  local CC = ns.GetModule("ClickCast")
  local list = CC and CC.Bindings() or {}
  if CC and CC.UsesGame() then chat("The game's click bindings are in use; Vanguard's below rest until you switch back.") end
  chat(#list == 0 and "No click-casting bindings for this spec. /vg > Click casting to add some." or "Click casting (this spec):")
  for _, b in ipairs(list) do
    chat("  " .. CC.KeyText(b.key) .. "  ->  " .. CC.ActionText(b))
  end
end

-- /vg spec [profile|off]
local function specCommand(rest)
  if not ns.HasSpecs() then return chat("This client has no specializations, so profiles don't switch by spec.") end
  local spec = ns.SpecIndex()
  if not spec then return chat("No specialization on this character yet.") end
  if rest == "" then
    return chat(string.format("Spec %d uses %s.", spec, ns.SpecProfile(spec) or "the character's profile (no spec profile set)"))
  end
  if rest ~= "off" and not VanguardDB.profiles[rest] then return chat("No profile called " .. rest .. ". /vg profile new " .. rest .. " first.") end
  ns.SetSpecProfile(rest ~= "off" and rest or nil, spec)
  chat(rest == "off" and "This spec no longer switches profiles." or ("Spec " .. spec .. " now uses profile " .. rest .. "."))
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
  local size = (CH.settings and frame) and CH.TextSize(frame) or T.ScaledSize(T.ROLES.chat[1])
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

-- /vg status
local function statusCommand()
  chat(string.format("Vanguard %s  ·  profile %s  ·  %d/%d modules on", version(), ns.ProfileName(), modulesOn(), #ns.ModuleNames()))
  chat(string.format("%d skinned addon(s)  ·  %d painted frame(s)  ·  %d change(s) waiting on combat", #ns.SkinList(), T.PaintedCount(), ns.QueuedCount()))
  chat(clientLine())
  chat(ns.Client.Line())
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

-- One caught error: its text and count, then each line of its stack, indented.
local function printError(e)
  chat(string.format("%s  (x%d)", e.text, e.count))
  for line in e.stack:gmatch("[^\n]+") do chat("    " .. line) end
end

-- /vg errors [clear]: the errors Vanguard caught this session, newest last, with
-- the version, client and aura backend a bug report needs; clear empties the list.
local function errorsCommand(rest)
  if rest == "clear" then ns.ClearErrors() return chat("Cleared.") end
  if #ns.errors == 0 then return chat("No errors caught this session.") end
  chat(string.format("Vanguard %s  ·  interface %s  ·  %d error(s) caught this session (%d in all), newest last:", version(), interfaceText(), #ns.errors, occurrences()))
  chat(clientLine())
  for _, e in ipairs(ns.errors) do printError(e) end
end

-- /vg report ----------------------------------------------------------------------------

-- The most a report holds, in characters, so it fits the feedback form's report box.
local REPORT_MAX = 8000
-- The most stack lines a report keeps for one error.
local REPORT_STACK = 8

-- Text without the game's color codes (|cAARRGGBB and |r), which a pasted report can't use.
local function plain(text)
  return (tostring(text):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))
end

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
    clientLine(), ns.Client.Line(), textLine(), screenLine(), "Modules off: " .. modulesOff(), "Skins: " .. skinsText(),
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
  ns.ShowText("Vanguard report: Ctrl+C, then paste at vanguardui.com/feedback", ns.ReportText())
end

-- /vg feedback [bug|feature]: the feedback form (Core/Feedback.lua), on that kind when one is given.
local function feedbackCommand(rest)
  ns.Feedback.Open(rest)
end

-- /vg stock: the Errands module's stock list, which exists only while that module is on.
local function stockCommand(rest)
  local ER = ns.GetModule("Errands")
  if not ER.settings then return chat("Vanguard's Errands are off (/vg > Modules).") end
  ER.StockCommand(rest)
end

local COMMANDS = {
  -- /vg help
  help = function() printLines(HELP) end,
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
  gradient = gradientCommand,
  ornaments = ornamentsCommand,
  icons = iconsCommand,
  variant = variantCommand,
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
  quests = function() local QL = ns.GetModule("QuestLog") if QL.frame then QL.Toggle() else ns.Chat("Vanguard's quest log is off (/vg > Quests).") end end,
  stock = stockCommand,
  craft = function(rest) ns.GetModule("CraftQueue").Command(rest) end,
  mail = function(rest) ns.GetModule("MailTools").Command(rest) end,
  rolls = function(rest) ns.GetModule("Rolls").Command(rest) end,
  loot = function(rest) ns.GetModule("OfficerLoot").Command(rest) end,
  fights = function() ns.GetModule("FightHistory").Command() end,
  recap = function(rest) ns.GetModule("FightHistory").RecapCommand(rest) end,
  meter = function(rest) ns.GetModule("Meter").Command(rest) end,
  vendors = function(rest) ns.GetModule("VendorMemory").Command(rest) end,
  ranks = function(rest) ns.GetModule("SpellRanks").RanksCommand(rest) end,
  trainers = function(rest) ns.GetModule("SpellRanks").TrainersCommand(rest) end,
  inventory = function(rest) ns.GetModule("Inventory").Command(rest) end,
  weights = function(rest) ns.GetModule("Upgrades").Command(rest) end,
  prep = function(rest) ns.GetModule("InstancePrep").Command(rest) end,
  talents = function(rest) ns.GetModule("TalentPlanner").Command(rest) end,
  legacy = function(rest) ns.GetModule("Legacy").Command(rest) end,
  watch = function(rest) ns.GetModule("ChatWatch").Command(rest) end,
  gaps = function(rest) ns.GetModule("CooldownGaps").Command(rest) end,
  lfg = function() ns.GetModule("GroupBoard").Toggle() end,
  questdata = function(rest) ns.QuestGuide.Command(rest) end,
  situation = function(rest) ns.GetModule("Situations").Command(rest) end,
  ah = function(rest) ns.GetModule("AuctionHelper").Command(rest) end,
  way = function(rest) ns.GetModule("Waypoints").Command(rest) end,
  dock = function() ns.GetModule("BossDocks").Command() end,
  factionart = function() ns.FactionArt.Report() end,
  realm = function() ns.Home.Report() end,
  frame = frameCommand,
  status = statusCommand,
  errors = errorsCommand,
  report = reportCommand,
  feedback = feedbackCommand,
  perf = function(rest) ns.Perf.Command(rest) end,
  mem = function() ns.Perf.MemCommand() end,
}

-- /vg entry point: no arguments opens the options window. A command runs under
-- ns.Try, so an error in it is kept for /vg errors like any other caught error.
local function handleSlash(msg)
  local cmd, rest = (msg or ""):match("^%s*(%S*)%s*(.-)%s*$")
  if cmd == "" then
    return ns.Options.Toggle()
  end
  local handler = COMMANDS[cmd:lower()] or function() chat("Unknown command. /vg help") end
  ns.Try("slash " .. cmd:lower(), handler, rest)
end

SLASH_VANGUARD1 = "/vg"
SLASH_VANGUARD2 = "/vanguard"
SlashCmdList["VANGUARD"] = handleSlash
