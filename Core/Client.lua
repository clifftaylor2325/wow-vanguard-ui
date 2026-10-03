-- What this client has. The addon leans on a few newer or optional calls (the
-- aura container, eased bars, cooldown objects and numbers, keyboard
-- propagation, the damage meter and the like); each is asked once per session,
-- at ADDON_LOADED or on the first ns.Client.Has(key), and kept in ns.Client.has.
-- Modules ask Has(key) before a cosmetic call, so a client without it still builds
-- every module, and /fui status lists what was found. Read it inside functions
-- only: files before this one in the TOC load first.

local ADDON, ns = ...

local C = { has = {} }
ns.Client = C

-- The keys, in the order /fui status prints them.
C.KEYS = {
  "auraContainer", "pixelUtil", "eventValid", "barEase", "cooldownObject", "cooldownMin",
  "countdownText", "keyPropagate", "damageMeter", "cooldownViewer", "swingTimer", "meterEnums",
}

-- A hidden frame of this type, or nil when the client can't make one.
local function probeFrame(kind, template)
  local ok, f = pcall(CreateFrame, kind, nil, UIParent, template)
  if not ok then return nil end
  f:Hide()
  return f
end

-- Whether the frame has this method as a function.
local function hasMethod(f, name)
  return f ~= nil and type(f[name]) == "function"
end

-- Whether the global `name` is a table with a function called `fn`.
local function hasFunction(name, fn)
  local t = _G[name]
  return type(t) == "table" and type(t[fn]) == "function"
end

-- Whether the client's damage meter enums have the two values the info strip asks with.
local function meterEnums()
  local e = _G.Enum
  if type(e) ~= "table" then return false end
  return type(e.DamageMeterSessionType) == "table" and e.DamageMeterSessionType.Current ~= nil
    and type(e.DamageMeterType) == "table" and e.DamageMeterType.Dps ~= nil
end

-- Whether the client's enum for eased status bars (Theme.SetBarValue) exists.
local function barEase()
  local e = _G.Enum
  return type(e) == "table" and type(e.StatusBarInterpolation) == "table" and e.StatusBarInterpolation.ExponentialEaseOut ~= nil
end

-- The flags that are a global's presence.
local function fromGlobals(has)
  has.pixelUtil = hasFunction("PixelUtil", "GetNearestPixelSize")
  has.eventValid = hasFunction("C_EventUtils", "IsEventValid")
  has.damageMeter = hasFunction("C_DamageMeter", "GetCombatSessionFromType")
  has.cooldownViewer = hasFunction("C_CooldownViewer", "IsCooldownViewerAvailable")
  has.swingTimer = type(_G.C_SwingTimer) == "table" and type(_G.Enum) == "table" and type(_G.Enum.PlayerSwingType) == "table"
  has.barEase, has.meterEnums = barEase(), meterEnums()
end

-- The flags that are a widget method, each from one hidden frame (plain frames
-- can be made in combat).
local function fromWidgets(has)
  local cd = probeFrame("Cooldown")
  has.cooldownObject = hasMethod(cd, "SetCooldownFromDurationObject")
  has.cooldownMin = hasMethod(cd, "SetMinimumCountdownDuration")
  has.countdownText = hasMethod(cd, "GetCountdownFontString")
  has.keyPropagate = hasMethod(probeFrame("Frame"), "SetPropagateKeyboardInput")
end

-- Asks the client, once per session. The aura container is not asked here: the
-- engine's own probe (Core/AuraEngine.lua) records its answer, and it can be made
-- out of combat only, so the flag stays unknown (nil) until then.
function C.Probe()
  if C.probed then return C.has end
  C.probed = true
  fromGlobals(C.has)
  fromWidgets(C.has)
  return C.has
end

-- Whether the client has this (a key of C.KEYS); asking first probes (the aura
-- container, out of combat, through the engine).
function C.Has(key)
  C.Probe()
  if key == "auraContainer" then ns.AuraEngine.Available() end
  return C.has[key] == true
end

-- Names of the keys whose answer is `want` (a still-waiting key counts as lacking, marked with "?").
local function names(want)
  local out = {}
  for _, k in ipairs(C.KEYS) do
    if (C.has[k] == true) == want then out[#out + 1] = k .. ((C.has[k] == nil) and "?" or "") end
  end
  return #out > 0 and table.concat(out, ", ") or "none"
end

-- The /fui status line: what the client has and what it lacks.
function C.Line()
  C.Probe()
  return string.format("Client has: %s  ·  lacks: %s", names(true), names(false))
end

-- Probes once the addon's own files are loaded.
ns.On("ADDON_LOADED", function(_, name)
  if name == ADDON then C.Probe() end
end)

-- Secure snippets -------------------------------------------------------------------------
-- WoW Forever's beta once failed to compile the restricted environment's
-- snippets. The probe runs one line through SecureHandlerExecute, out of combat,
-- once; has.secureSnippets is true or false after that, and nil until then.

-- The one-line write the restricted environment must compile (self is the frame).
local PROBE_SNIPPET = "self:SetAttribute('fuiprobe', 'ok')"

-- Makes the probe frame, runs the snippet on it; true only when the attribute came back.
local function runSnippetProbe()
  local f = CreateFrame("Frame", "ForeverUI_SnippetProbe", UIParent, "SecureHandlerAttributeTemplate")
  SecureHandlerExecute(f, PROBE_SNIPPET)
  return f:GetAttribute("fuiprobe") == "ok"
end

-- Whether this client compiles secure snippets: a missing API, an error or a write that never lands all count as no.
local function snippetsWork()
  if type(SecureHandlerExecute) ~= "function" then return false end
  local ok, worked = ns.Try("secure snippet probe", runSnippetProbe)
  return ok and worked == true
end

-- The one chat line when snippets are off.
local function warnNoSnippets()
  ns.Chat("This client can't run secure snippets: hover keys are off; bar paging, bar visibility and the raid frames may not work until the game fixes it.")
end

-- Probes once, out of combat (nil until then); says so in chat, once, when snippets are off.
function C.ProbeSnippets()
  local has = C.has
  if has.secureSnippets ~= nil or ns.InCombat() then return has.secureSnippets end
  has.secureSnippets = snippetsWork()
  if not has.secureSnippets then warnNoSnippets() end
  return has.secureSnippets
end

-- At login, out of combat (queued if the login is in a fight), before any module's own login work.
ns.On("PLAYER_LOGIN", function() ns.OutOfCombat(C.ProbeSnippets, "snippetprobe") end)
