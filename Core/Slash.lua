-- /fui (and /foreverui): unlock/lock, positions, theme, modules, profiles.

local ADDON, ns = ...

local T = ns.Theme
local chat = ns.Chat

local HELP = {
  "A from-scratch UI suite. /fui <command>:",
  "unlock | lock        show / hide drag handles for every ForeverUI frame",
  "reset <frame|all>    put a frame (or every frame) back at its default spot",
  "frames               list the movable frames",
  "accent <rrggbb>      set the accent color; accent reset for the default",
  "theme reset          every theme setting back to default",
  "modules              list modules; enable|disable <module> (then /reload)",
  "skins                addons skinned through ForeverUI.RegisterSkin; skins <addon> on|off",
  "profile [name]       show profiles, or switch this character to one (then /reload)",
  "status               version, profile, modules, skins, work waiting on combat",
}

-- Prints each line.
local function printLines(lines)
  for _, line in ipairs(lines) do
    chat(line)
  end
end

-- "on" / "off" in green / gray.
local function onOff(on)
  return on and "|cff6fd67aon|r" or "|cff888888off|r"
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
  local r, g, b = T.ParseHex(rest)
  if not r then
    return chat("Usage: /fui accent rrggbb   (e.g. 3d9eff)")
  end
  T.SetAccent(r, g, b)
  chat("Accent set to #" .. rest:gsub("^#", ""):lower() .. ".")
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

-- /fui profile [name]
local function profileCommand(rest)
  if rest == "" then
    return chat("Profile: " .. ns.ProfileName() .. "   (all: " .. table.concat(ns.ProfileNames(), ", ") .. ")")
  end
  ns.UseProfile(rest)
  chat("This character now uses profile " .. rest .. ". /reload to apply.")
end

-- The addon version from the TOC.
local function version()
  local get = (C_AddOns and C_AddOns.GetAddOnMetadata) or GetAddOnMetadata
  local ok, v = pcall(get, ADDON, "Version")
  return ok and v or "?"
end

-- /fui status
local function statusCommand()
  local enabled = 0
  for _, name in ipairs(ns.ModuleNames()) do
    enabled = enabled + (ns.ModuleEnabled(name) and 1 or 0)
  end
  chat(string.format("ForeverUI %s  ·  profile %s  ·  %d/%d modules on", version(), ns.ProfileName(), enabled, #ns.ModuleNames()))
  chat(string.format("%d skinned addon(s)  ·  %d painted frame(s)  ·  %d change(s) waiting on combat", #ns.SkinList(), T.PaintedCount(), ns.QueuedCount()))
end

local COMMANDS = {
  -- /fui help
  help = function() printLines(HELP) end,
  unlock = unlockCommand,
  move = unlockCommand,
  lock = lockCommand,
  reset = resetCommand,
  frames = framesCommand,
  accent = accentCommand,
  theme = themeCommand,
  modules = modulesCommand,
  enable = setModule(true),
  disable = setModule(false),
  skins = skinsCommand,
  profile = profileCommand,
  status = statusCommand,
}

-- /fui entry point: no arguments toggles unlock.
local function handleSlash(msg)
  local cmd, rest = (msg or ""):match("^%s*(%S*)%s*(.-)%s*$")
  if cmd == "" then
    return (ns.Unlocked() and lockCommand or unlockCommand)()
  end
  local handler = COMMANDS[cmd:lower()] or function() chat("Unknown command. /fui help") end
  handler(rest)
end

SLASH_FOREVERUI1 = "/fui"
SLASH_FOREVERUI2 = "/foreverui"
SlashCmdList["FOREVERUI"] = handleSlash
