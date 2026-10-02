-- /fui (and /foreverui): unlock/lock, positions, theme, modules, profiles.

local ADDON, ns = ...

local T = ns.Theme
local chat = ns.Chat

local HELP = {
  "A from-scratch UI suite. /fui opens the options window; /fui <command>:",
  "setup                first-run setup again: layout, look, then move things",
  "unlock | lock        drag handles on every ForeverUI frame; click one, then arrow keys nudge (Shift: 10 px)",
  "reset <frame|all>    put a frame (or every frame) back at its default spot",
  "frames               list the movable frames",
  "grid [size|on|off]   the unlock-mode grid; snap on|off   snapping while dragging",
  "accent <rrggbb|name> set the accent color (brass, arcane, fel, void, ember); accent reset",
  "theme reset          every theme setting back to default",
  "modules              list modules; enable|disable <module> (then /reload)",
  "skins                addons skinned through ForeverUI.RegisterSkin; skins <addon> on|off",
  "profile [name]       show profiles, or switch this character to one",
  "profile new|copy|delete <name>, profile reset   manage profiles",
  "export [module]      copy the profile (or one module's settings) as a string",
  "import               paste a string from /fui export",
  "spec [profile|off]   use a profile whenever you're in this specialization",
  "binds                this spec's click-casting and hover-key bindings (set them in /fui > Click casting)",
  "status               version, profile, modules, skins, work waiting on combat",
  "errors               the errors ForeverUI caught this session (for a bug report)",
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

-- /fui unlock
local function unlockCommand()
  if ns.Unlock() then
    chat("Unlocked: drag the handles. /fui lock when done.")
  else
    chat("Not in combat. Try again once combat ends.")
  end
end

-- /fui lock
local function lockCommand()
  ns.Lock()
  chat("Locked.")
end

-- /fui reset <frame|all>
local function resetCommand(rest)
  local key = rest ~= "" and rest or "all"
  local n = ns.ResetMovers(key)
  chat(n > 0 and string.format("Reset %d frame(s).", n) or ("No frame called " .. key .. ". /fui frames lists them."))
end

-- /fui frames
local function framesCommand()
  local list = ns.MoverList()
  chat(#list == 0 and "No movable frames yet (enable a module)." or "Movable frames:")
  for _, m in ipairs(list) do
    chat(string.format("  %s  (%s)", m.key, m.label))
  end
end

-- /fui accent reset
local function resetAccent()
  T.Settings().accent = nil
  T.Refresh()
  chat("Accent back to default.")
end

-- /fui accent <rrggbb> | reset
local function accentCommand(rest)
  if rest == "reset" then
    return resetAccent()
  end
  local r, g, b = T.ParseColor(rest:lower())
  if not r then
    return chat("Usage: /fui accent rrggbb | brass | arcane | fel | void | ember")
  end
  T.SetAccent(r, g, b)
  chat("Accent set to " .. rest:lower() .. ".")
end

-- Re-shows the grid with the current options while unlocked.
local function refreshGrid()
  local o = ns.MoverOptions()
  if ns.Unlocked() and o.grid then ns.ShowGrid(o.gridSize) else ns.HideGrid() end
end

-- /fui grid [size|on|off]
local function gridCommand(rest)
  local o, size = ns.MoverOptions(), tonumber(rest)
  if size and size >= 8 and size <= 256 then
    o.grid, o.gridSize = true, math.floor(size)
  elseif rest == "on" or rest == "off" or rest == "" then
    o.grid = rest == "on" or (rest == "" and not o.grid)
  else
    return chat("Usage: /fui grid [8-256 | on | off]")
  end
  refreshGrid()
  chat(o.grid and string.format("Grid on, every %d px.", o.gridSize) or "Grid off.")
end

-- /fui snap on|off
local function snapCommand(rest)
  local o = ns.MoverOptions()
  o.snap = rest == "on" or (rest == "" and not o.snap)
  chat(o.snap and "Snapping on." or "Snapping off.")
end

-- /fui theme reset
local function themeCommand(rest)
  if rest ~= "reset" then
    return chat("Usage: /fui theme reset")
  end
  T.Reset()
  chat("Theme back to defaults.")
end

-- /fui modules
local function modulesCommand()
  local names = ns.ModuleNames()
  chat(#names == 0 and "No modules yet." or "Modules (enable|disable <module>, then /reload):")
  for _, name in ipairs(names) do
    chat(string.format("  %s  %s", name, onOff(ns.ModuleEnabled(name))))
  end
end

-- /fui enable|disable <module>
local function setModule(on)
  return function(rest)
    if not ns.GetModule(rest) then
      return chat("No module called " .. rest .. ". /fui modules lists them.")
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

-- /fui skins [<addon> on|off]
local function skinsCommand(rest)
  local name, state = rest:match("^(%S+)%s+(%S+)$")
  if not name then
    return listSkins()
  end
  ns.Settings("skins")[name] = state == "on"
  chat(string.format("Skin for %s %s. /reload to apply.", name, state == "on" and "on" or "off"))
end

-- /fui profile <name>: switch, creating it if new, and offer the reload.
local function useProfile(name)
  if not ns.ValidProfileName(name) then
    return chat("Profile names are 1-32 letters, digits, spaces, - or _.")
  end
  ns.UseProfile(name)
  ns.OfferReload("This character now uses profile " .. name .. ".")
end

-- profile subcommands: new, copy, delete, reset.
local PROFILE_ACTIONS = {
  -- /fui profile new <name>
  new = function(name) chat(ns.NewProfile(name) and ("Created profile " .. name .. ".") or "That name is taken or not allowed.") end,
  -- /fui profile copy <from>
  copy = function(name)
    if not ns.CopyProfile(name) then return chat("No other profile called " .. name .. ".") end
    ns.OfferReload("Copied " .. name .. " into " .. ns.ProfileName() .. ".")
  end,
  -- /fui profile delete <name>
  delete = function(name) chat(ns.DeleteProfile(name) and ("Deleted profile " .. name .. ".") or "Can't delete that one (missing, or in use).") end,
  -- /fui profile reset
  reset = function() ns.ResetProfile(); ns.OfferReload("Profile " .. ns.ProfileName() .. " is back to defaults.") end,
}

-- /fui profile [new|copy|delete <name> | reset | <name>]
local function profileCommand(rest)
  if rest == "" then
    return chat("Profile: " .. ns.ProfileName() .. "   (all: " .. table.concat(ns.ProfileNames(), ", ") .. ")")
  end
  local action, name = rest:match("^(%S+)%s*(.-)$")
  local handler = PROFILE_ACTIONS[action:lower()]
  if handler then return handler(name) end
  useProfile(rest)
end

-- /fui export [module]
local function exportCommand(rest)
  local text, err = ns.ExportProfile(rest ~= "" and rest or nil)
  if not text then return chat("Nothing to export: " .. err .. ".") end
  ns.ShowText("ForeverUI export (" .. (rest ~= "" and rest or "profile " .. ns.ProfileName()) .. ")  Ctrl+C to copy", text)
end

-- /fui import: a box to paste into.
local function importCommand()
  ns.AskText("Paste a ForeverUI string, then Import", function(text)
    local done, err = ns.ImportProfile(text)
    if not done then return chat("Import failed: " .. err .. ".") end
    ns.HideText()
    ns.OfferReload(done)
  end)
end

ns.ImportDialog = importCommand

-- /fui binds: this spec's click-casting bindings, one per line.
local function bindsCommand()
  local CC = ns.GetModule("ClickCast")
  local list = CC and CC.Bindings() or {}
  chat(#list == 0 and "No click-casting bindings for this spec. /fui > Click casting to add some." or "Click casting (this spec):")
  for _, b in ipairs(list) do
    chat("  " .. CC.KeyText(b.key) .. "  ->  " .. CC.ActionText(b))
  end
end

-- /fui spec [profile|off]
local function specCommand(rest)
  if not ns.HasSpecs() then return chat("This client has no specializations, so profiles don't switch by spec.") end
  local spec = ns.SpecIndex()
  if not spec then return chat("No specialization on this character yet.") end
  if rest == "" then
    return chat(string.format("Spec %d uses %s.", spec, ns.SpecProfile(spec) or "the character's profile (no spec profile set)"))
  end
  if rest ~= "off" and not ForeverUIDB.profiles[rest] then return chat("No profile called " .. rest .. ". /fui profile new " .. rest .. " first.") end
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

-- The client line: which game and build, which aura backend, and whether aura values are hidden right now.
local function clientLine()
  local client = ns.IsForever() and "WoW Forever" or "Retail"
  local hidden = ns.AurasSecret() and "hidden right now" or "readable"
  return string.format("Client %s%s  ·  auras on the %s  ·  aura values %s", client, buildText(), ns.Auras.BackendName(), hidden)
end

-- The text line: UI scale, Text size, and how tall chat text draws on this screen.
local function textLine()
  local CH, frame = ns.GetModule("Chat"), _G.ChatFrame1
  local size = (CH.settings and frame) and CH.TextSize(frame) or T.ScaledSize(T.ROLES.chat[1])
  local percent = math.floor((T.Settings().textScale or 1) * 100 + 0.5)
  return string.format("UI scale %.2f  ·  text %d%%  ·  chat %d (about %d px on this screen)",
    UIParent:GetScale(), percent, size, math.floor(size * T.PixelsPerUnit() + 0.5))
end

-- /fui status
local function statusCommand()
  local enabled = 0
  for _, name in ipairs(ns.ModuleNames()) do
    enabled = enabled + (ns.ModuleEnabled(name) and 1 or 0)
  end
  chat(string.format("ForeverUI %s  ·  profile %s  ·  %d/%d modules on", version(), ns.ProfileName(), enabled, #ns.ModuleNames()))
  chat(string.format("%d skinned addon(s)  ·  %d painted frame(s)  ·  %d change(s) waiting on combat", #ns.SkinList(), T.PaintedCount(), ns.QueuedCount()))
  chat(clientLine())
  chat(textLine())
end

-- /fui errors: the errors ForeverUI caught this session, newest last.
local function errorsCommand()
  if #ns.errors == 0 then return chat("No errors caught this session.") end
  chat(string.format("%d error(s) caught this session, newest last:", #ns.errors))
  for _, line in ipairs(ns.errors) do chat(line) end
end

local COMMANDS = {
  -- /fui help
  help = function() printLines(HELP) end,
  -- /fui options (also /fui with nothing after it)
  options = function() ns.Options.Toggle() end,
  config = function() ns.Options.Toggle() end,
  -- /fui setup: the first-run wizard again (after combat, if in it)
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
  status = statusCommand,
  errors = errorsCommand,
}

-- /fui entry point: no arguments opens the options window.
local function handleSlash(msg)
  local cmd, rest = (msg or ""):match("^%s*(%S*)%s*(.-)%s*$")
  if cmd == "" then
    return ns.Options.Toggle()
  end
  local handler = COMMANDS[cmd:lower()] or function() chat("Unknown command. /fui help") end
  handler(rest)
end

SLASH_FOREVERUI1 = "/fui"
SLASH_FOREVERUI2 = "/foreverui"
SlashCmdList["FOREVERUI"] = handleSlash
