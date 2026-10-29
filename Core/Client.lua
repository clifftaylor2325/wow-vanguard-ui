-- What this client has. The addon leans on a few newer or optional calls (the
-- aura container, eased bars, cooldown objects and numbers, keyboard
-- propagation, the damage meter and the like); each is asked once per session,
-- at ADDON_LOADED or on the first ns.Client.Has(key), and kept in ns.Client.has.
-- Modules ask Has(key) before a cosmetic call, so a client without it still builds
-- every module, and /vg status lists what was found. Read it inside functions
-- only: files before this one in the TOC load first.

local ADDON, ns = ...
local L = ns.L

local C = { has = {} }
ns.Client = C

-- The keys, in the order /vg status prints them.
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

-- Calls a client function by its global name; nil when this client doesn't have it.
---@param name string
---@return any
function C.Call(name, ...)
  local fn = _G[name]
  if type(fn) ~= "function" then return nil end
  return fn(...)
end

-- Names of the keys whose answer is `want` (a still-waiting key counts as lacking, marked with "?").
local function names(want)
  local out = {}
  for _, k in ipairs(C.KEYS) do
    if (C.has[k] == true) == want then out[#out + 1] = k .. ((C.has[k] == nil) and "?" or "") end
  end
  return #out > 0 and table.concat(out, ", ") or "none"
end

-- The /vg status line: what the client has and what it lacks.
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
local PROBE_SNIPPET = "self:SetAttribute('vgprobe', 'ok')"

-- Makes the probe frame, runs the snippet on it; true only when the attribute came back.
local function runSnippetProbe()
  local f = CreateFrame("Frame", "Vanguard_SnippetProbe", UIParent, "SecureHandlerAttributeTemplate")
  SecureHandlerExecute(f, PROBE_SNIPPET)
  return f:GetAttribute("vgprobe") == "ok"
end

-- Whether this client compiles secure snippets, and the error text when the probe threw: a missing API, an error or a write that never lands all count as no.
-- Plain pcall, not ns.Try: a failing probe is one chat line (the warning below, with the error in it), not a second report.
local function snippetsWork()
  if type(SecureHandlerExecute) ~= "function" then return false end
  local ok, worked = pcall(runSnippetProbe)
  if not ok then return false, tostring(worked) end
  return worked == true
end

-- The one chat line when snippets are off, with the probe's error when it threw.
local function warnNoSnippets(err)
  ns.Chat(L["This client can't run secure snippets: hover keys are off; bar 1 pages and the raid frames are set up without them."] .. (err and ("  (probe: " .. err .. ")") or ""))
end

-- Functions waiting for the probe's answer (C.WhenSnippetsKnown).
local snippetWaiters = {}

-- Hands the probe's answer to every waiting function, each under ns.Try.
local function tellSnippetWaiters(worked)
  local waiting = snippetWaiters
  snippetWaiters = {}
  for _, fn in ipairs(waiting) do ns.Try("secure snippet fallback", fn, worked) end
end

-- Probes once, out of combat (nil until then); says so in chat, once, when snippets are off.
function C.ProbeSnippets()
  local has = C.has
  if has.secureSnippets ~= nil or ns.InCombat() then return has.secureSnippets end
  local worked, err = snippetsWork()
  has.secureSnippets = worked
  if not worked then warnNoSnippets(err) end
  tellSnippetWaiters(worked)
  return has.secureSnippets
end

-- Calls fn(worked) once the probe has answered and out of combat (so fn may
-- change secure frames): at once when both hold, else when they do.
function C.WhenSnippetsKnown(fn)
  if C.ProbeSnippets() == nil then
    snippetWaiters[#snippetWaiters + 1] = fn
    return
  end
  ns.OutOfCombat(function() fn(C.has.secureSnippets) end)
end

-- At login, out of combat (queued if the login is in a fight), before any module's own login work.
ns.On("PLAYER_LOGIN", function() ns.OutOfCombat(C.ProbeSnippets, "snippetprobe") end)

-- Client globals and items -----------------------------------------------------------------

-- An item's name when the client has it cached, else "item 123".
---@param id number
---@return string
function ns.ItemName(id)
  local info = C_Item and C_Item.GetItemInfo
  local name = type(info) == "function" and info(id)
  if type(name) == "string" then return name end
  return "item " .. id
end

-- The client's "does the player know this spell" call: C_SpellBook.IsSpellKnown, else the older
-- IsPlayerSpell (on Forever only loaded with the game's deprecation fallbacks), else nil.
---@return function|nil
function ns.SpellKnownCall()
  local fn = C_SpellBook and C_SpellBook.IsSpellKnown
  if type(fn) == "function" then return fn end
  if type(IsPlayerSpell) == "function" then return IsPlayerSpell end
  return nil
end

-- What the cursor holds, as the first value GetCursorInfo gives ("spell", "item"...), nil for nothing, or "hidden"
-- when the client hides it.
local function cursorKind()
  local kind = C.Call("GetCursorInfo")
  if ns.IsSecret(kind) then return "hidden" end
  return kind
end

-- Picks a spell up onto the cursor from the spellbook (C_Spell, else the old global); whether the cursor holds a spell now.
local function pickupSpell(spellID)
  local api = type(C_Spell) == "table" and C_Spell.PickupSpell
  if type(api) == "function" then api(spellID) else C.Call("PickupSpell", spellID) end
  return cursorKind() == "spell"
end

-- Puts a spell on an action slot from the spellbook and leaves the cursor empty. PlaceAction swaps, so what the slot
-- held comes up on the cursor and is dropped: call it only over an empty slot or a spell the player can pick up again
-- from the spellbook. Refuses when the cursor already holds something. Out of combat only (the client refuses both
-- calls in a fight). True when the spell was picked up and placed.
---@param slot number
---@param spellID number
---@return boolean
function ns.PlaceSpell(slot, spellID)
  if cursorKind() ~= nil then return false end
  local ok = pickupSpell(spellID)
  if ok then C.Call("PlaceAction", slot) end
  C.Call("ClearCursor")
  return ok
end

-- Group headers without snippets ------------------------------------------------------------
-- The raid and main tank headers configure each button they make through an
-- init snippet. Without snippets the header copies the clicks itself
-- (_initialAttribute, plain secure code), and the size and the rest of the
-- setup come from the module, out of combat; every button is made out of combat
-- anyway (the modules precreate them).

-- The clicks every unit button gets, as the init snippets set them.
C.HEADER_CLICKS = { ["*type1"] = "target", ["*type2"] = "togglemenu" }

-- Turns a header's init snippet off and has the header copy the clicks onto each new button.
function C.HeaderWithoutSnippets(header)
  header.vgNoSnippets = true
  header:SetAttribute("initialConfigFunction", nil)
  header:SetAttribute("_initialAttributeNames", "*type1,*type2")
  for name, value in pairs(C.HEADER_CLICKS) do header:SetAttribute("_initialAttribute-" .. name, value) end
end

-- One button of a header without snippets: its size and clicks, then setup(button). Once.
local function setupHeaderButton(header, b, setup)
  b.vgHeaderSetup = true
  b:SetSize(header:GetAttribute("vg-width"), header:GetAttribute("vg-height"))
  for name, value in pairs(C.HEADER_CLICKS) do b:SetAttribute(name, value) end
  setup(b)
end

-- Sets up every unit button a header without snippets has made and not set up
-- yet (its children named <header>UnitButtonN); out of combat only.
function C.SetupHeaderButtons(header, setup)
  if not header or not header.vgNoSnippets or ns.InCombat() then return end
  local prefix = "^" .. header:GetName() .. "UnitButton"
  for _, b in ipairs({ header:GetChildren() }) do
    if not b.vgHeaderSetup and (b:GetName() or ""):find(prefix) then setupHeaderButton(header, b, setup) end
  end
end
