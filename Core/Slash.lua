-- /vg (and /vanguard): unlock/lock, positions, theme, modules, profiles.

local ADDON, ns = ...

local T = ns.Theme
local chat = ns.Chat

local HELP = {
  "A from-scratch UI suite. /vg opens the options window; /vg <command>:",
  "setup                first-run setup again: layout, screen, look, then move things",
  "unlock | lock        drag handles on every Vanguard frame; click one, then arrow keys nudge (Shift: 10 px)",
  "reset <frame|all>    put a frame (or every frame) back at its default spot",
  "frames               list the movable frames",
  "grid [size|on|off]   the unlock-mode grid; snap on|off   snapping while dragging",
  "accent <rrggbb|name> set the accent color (brass, arcane, fel, void, ember); accent reset",
  "theme reset          every theme setting back to default",
  "modules              list modules; enable|disable <module> (then /reload)",
  "skins                addons skinned through Vanguard.RegisterSkin; skins <addon> on|off",
  "profile [name]       show profiles, or switch this character to one",
  "profile new|copy|delete <name>, profile reset   manage profiles",
  "export [module]      copy the profile (or one module's settings) as a string",
  "import               paste a string from /vg export",
  "spec [profile|off]   use a profile whenever you're in this specialization",
  "copy                 the recent chat as plain text, ready to copy",
  "situation [record <name>|stop|clear [name]|list]   Situations: record a layout and settings for solo, party, raid, pvp, instance or resting",
  "watch [add|remove <phrase>|list|clear]   Chat watch: phrases that ring a sound and show a toast when said in chat",
  "quests               open or close Vanguard's quest log (the game's quest log key does too)",
  "stock [<item> <n>]   items to keep in your bags; a merchant tops them up (0 removes, clear empties)",
  "fights               your DPS, length and place in each fight this session, newest first",
  "vendors [clear]      how many merchants Vanguard remembers (for tooltips and the stock list); clear forgets them",
  "weights [set <stat> <n>|reset|export|import]   the stat weights gear upgrades use for your class and role; change one, go back to the defaults, or share them",
  "prep [want <kind> <n>] the Instance prep card now: what you're short of; want sets how many food, bandages, potions, ammo or shards",
  "ah [list <name>|add <list> <item>|rename <name>|duplicate|delete|export|import|recent|scan|prices clear]  shopping lists (pick or make one, add an item: a link, an ID or a name; rename, copy, delete, export or import the list in use; recent: the last 20 items searched); scan the auction house (while it's open); forget the prices",
  "binds                this spec's click-casting and hover-key bindings (set them in /vg > Click casting)",
  "keybind              keybind mode: hover an action button and press a key to bind it; Escape leaves",
  "status               version, profile, modules, skins, work waiting on combat, what the client has",
  "factionart           which of the game's own faction pictures this client has",
  "errors [clear]       the errors Vanguard caught this session, with stacks and counts (for a bug report); clear empties the list",
  "perf [cpu|watch]     Vanguard's CPU and memory now; cpu turns the game's CPU profiling on or off (reload); watch prints them every minute",
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
    chat("Not in combat. Try again once combat ends.")
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
    return chat("Usage: /vg accent rrggbb | brass | arcane | fel | void | ember")
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
    if not ns.CopyProfile(name) then return chat("No other profile called " .. name .. ".") end
    ns.OfferReload("Copied " .. name .. " into " .. ns.ProfileName() .. ".")
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

-- /vg export [module]
local function exportCommand(rest)
  local text, err = ns.ExportProfile(rest ~= "" and rest or nil)
  if not text then return chat("Nothing to export: " .. err .. ".") end
  ns.ShowText("Vanguard export (" .. (rest ~= "" and rest or "profile " .. ns.ProfileName()) .. ")  Ctrl+C to copy", text)
end

-- /vg import: a box to paste into. A whole profile that carries its UI scale asks
-- whether to use it first; then the reload is offered.
local function importCommand()
  ns.AskText("Paste a Vanguard string, then Import", function(text)
    local done, detail = ns.ImportProfile(text)
    if not done then return chat("Import failed: " .. detail .. ".") end
    ns.HideText()
    ns.OfferDisplay(detail, function() ns.OfferReload(done) end)
  end)
end

ns.ImportDialog = importCommand

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

-- The addon version from the TOC.
local function version()
  local get = (C_AddOns and C_AddOns.GetAddOnMetadata) or GetAddOnMetadata
  local ok, v = pcall(get, ADDON, "Version")
  return ok and v or "?"
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

-- /vg status
local function statusCommand()
  local enabled = 0
  for _, name in ipairs(ns.ModuleNames()) do
    enabled = enabled + (ns.ModuleEnabled(name) and 1 or 0)
  end
  chat(string.format("Vanguard %s  ·  profile %s  ·  %d/%d modules on", version(), ns.ProfileName(), enabled, #ns.ModuleNames()))
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

-- /vg stock: the Errands module's stock list, which exists only while that module is on.
local function stockCommand(rest)
  local ER = ns.GetModule("Errands")
  if not ER.settings then return chat("Vanguard's Errands are off (/vg > Modules).") end
  ER.StockCommand(rest)
end

local COMMANDS = {
  -- /vg help
  help = function() printLines(HELP) end,
  -- /vg options (also /vg with nothing after it)
  options = function() ns.Options.Toggle() end,
  config = function() ns.Options.Toggle() end,
  -- /vg setup: the first-run wizard again (after combat, if in it)
  setup = function() ns.Setup.Open() end,
  unlock = unlockCommand,
  move = unlockCommand,
  lock = lockCommand,
  reset = resetCommand,
  frames = framesCommand,
  accent = accentCommand,
  grid = gridCommand,
  snap = snapCommand,
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
  keybind = function() ns.GetModule("ActionBars").ToggleKeybindMode() end,
  copy = function() ns.GetModule("ChatExtras").ShowCopy() end,
  quests = function() local QL = ns.GetModule("QuestLog") if QL.frame then QL.Toggle() else ns.Chat("Vanguard's quest log is off (/vg > Quests).") end end,
  stock = stockCommand,
  fights = function() ns.GetModule("FightHistory").Command() end,
  vendors = function(rest) ns.GetModule("VendorMemory").Command(rest) end,
  weights = function(rest) ns.GetModule("Upgrades").Command(rest) end,
  prep = function(rest) ns.GetModule("InstancePrep").Command(rest) end,
  watch = function(rest) ns.GetModule("ChatWatch").Command(rest) end,
  situation = function(rest) ns.GetModule("Situations").Command(rest) end,
  ah = function(rest) ns.GetModule("AuctionHelper").Command(rest) end,
  factionart = function() ns.FactionArt.Report() end,
  status = statusCommand,
  errors = errorsCommand,
  perf = function(rest) ns.Perf.Command(rest) end,
}

-- /vg entry point: no arguments opens the options window.
local function handleSlash(msg)
  local cmd, rest = (msg or ""):match("^%s*(%S*)%s*(.-)%s*$")
  if cmd == "" then
    return ns.Options.Toggle()
  end
  local handler = COMMANDS[cmd:lower()] or function() chat("Unknown command. /vg help") end
  handler(rest)
end

SLASH_VANGUARD1 = "/vg"
SLASH_VANGUARD2 = "/vanguard"
SlashCmdList["VANGUARD"] = handleSlash
