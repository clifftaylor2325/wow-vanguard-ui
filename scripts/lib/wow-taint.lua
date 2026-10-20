-- Taint, combat lockdown and secret geometry for the TEST-ONLY client: what the
-- real client does to insecure (addon) code that a line-coverage run can't see.
-- Loads after wow-world.lua and before the addon. Never shipped in game.
--
-- Ownership: every widget is the game's or the addon's. A widget the addon's
-- files (Core/, Modules/, Libs/) make, or one made on the addon's frame (a
-- group header's buttons), is the addon's; everything else is the game's: what the client made before the addon loaded, what the world makes
-- (the auction house, the profession window...), and what test code makes to
-- stand in for the game's frames.
--
-- Four rules, always on:
--  * Field writes: addon code that stores a new field on a game widget plants
--    taint in game (frame.vgSkinned = true). Keep such state in a weak-keyed
--    side table instead. Replacing a game widget's script (SetScript) is
--    recorded the same way: hook it with HookScript.
--  * Combat lockdown: while in combat (world.combat(true)), addon code that
--    calls a protected method (Show, Hide, SetPoint, SetSize, SetAttribute...)
--    on a protected frame is blocked as the client blocks it: nothing happens
--    and ADDON_ACTION_BLOCKED fires. A frame is protected when it is made from
--    a Secure template, is one of the game's protected frames, is marked with
--    __wfgStub.protect(frame), or holds a protected frame.
--    ShowUIPanel and HideUIPanel refuse any run with addon code in it, in combat.
--  * Secret arguments: addon code that passes a secret to an aura call the
--    client only lets secure code give one to, or asks for a hidden aura's
--    data by its id, raises the client's error.
--  * Secret geometry (a mode, off unless a test asks): see world.secretGeometry.
--
-- Breaking a rule is recorded in stub.violations (one entry per text, counted),
-- and the error guard (scripts/lib/error-guard.mjs) judges those entries with
-- the addon's caught errors: a test fails unless it names each with expectErrors.

local stub = __wfgStub
local methods = stub.methods
local world = stub.world

-- Recorded rule breaks: { text, count, stack }, in the order first seen.
stub.violations = {}
local byText = {}

-- Whether a chunk is one of the addon's files (the TOC loads Core/, Modules/ and Libs/).
local function isAddonSource(src)
  return src:sub(1, 6) == "@Core/" or src:sub(1, 9) == "@Modules/" or src:sub(1, 6) == "@Libs/"
end

-- Whether a stack frame is a call through: a C or host function (pcall, a
-- metamethod), or a hook hooksecurefunc put in front of a function.
local function passThrough(info)
  return (info.what ~= "Lua" and info.what ~= "main") or stub.transparent[info.func] == true
end

-- The code `depth` calls up from the function that asks (1 = its caller),
-- looking through calls that only pass on: { source, currentline }, or nil.
local function callerOf(depth)
  local level = depth + 2
  local info = debug.getinfo(level, "Slf")
  while info and passThrough(info) do
    level = level + 1
    info = debug.getinfo(level, "Slf")
  end
  return info
end
stub.callerOf = callerOf

-- Whether that code is the addon's.
local function byAddon(info)
  return info ~= nil and isAddonSource(info.source)
end

-- "Core/Movers.lua:187" for a stack frame.
local function where(info)
  return info.source:sub(2) .. ":" .. tostring(info.currentline)
end

-- A widget's name for a message: its global name, else its kind and number.
local function label(w)
  return rawget(w, "__name") or (tostring(rawget(w, "__kind")) .. " #" .. tostring(rawget(w, "__id")))
end

-- Records a rule the addon broke: one entry per text, counted, with the stack the first time.
local function violate(text)
  local e = byText[text]
  if not e then
    e = { text = text, count = 0, stack = debug.traceback("", 3) }
    byText[text] = e
    stub.violations[#stub.violations + 1] = e
  end
  e.count = e.count + 1
end

-- Forgets every recorded rule break (the harness's own tests read them, then start over).
function stub.clearViolations()
  stub.violations, byText = {}, {}
end

-- Ownership and field writes ----------------------------------------------------------------

-- A new field on a game widget: stored; recorded when addon code stored it.
-- The stub's own fields (__name) and anything game or test code writes are fine.
local function guardWrite(w, key, value)
  rawset(w, key, value)
  if type(key) == "string" and key:sub(1, 2) == "__" then return end
  local at = callerOf(1)
  if byAddon(at) then violate(string.format("field write: %s stored the field %s on the game's frame %s", where(at), tostring(key), label(w))) end
end

-- Game widgets resolve methods as every widget does (stub.metaFor) and watch their new fields.
stub.gameNewindex = guardWrite

-- Makes a widget the game's.
local function ownByGame(w)
  if rawget(w, "__byGame") then return w end
  rawset(w, "__byGame", true)
  return setmetatable(w, stub.metaFor(w))
end
stub.ownByGame = ownByGame

-- Whether a widget hangs on one of the addon's frames: what the client makes there
-- (a group header's unit buttons, from the addon's template) is the addon's too.
local function onAddonFrame(w)
  local parent = rawget(w, "__parent")
  return type(parent) == "table" and rawget(parent, "__byGame") ~= true
end

-- Gives a new widget to the game unless it hangs on the addon's frame or the code
-- that asked for it (`depth` up) is the addon's.
local function own(w, depth)
  if not onAddonFrame(w) and not byAddon(callerOf(depth + 1)) then ownByGame(w) end
  return w
end

-- Everything the client made before this file: the game's.
for _, w in ipairs(stub.frames) do ownByGame(w) end

local createFrame = CreateFrame
-- CreateFrame, the frame owned by whoever called it. (No tail calls in these
-- wrappers: a tail call drops the wrapper's stack frame, and the owner would be
-- read one call too far up.)
function CreateFrame(...)
  local w = own(createFrame(...), 1)
  return w
end

local newWidget = stub.newWidget
-- Frames the world makes directly (the auction house, a temporary chat window): the game's.
stub.newWidget = function(...) return ownByGame(newWidget(...)) end

-- Wraps a stub method; wrap(orig) returns the new method.
local function rewrap(name, wrap)
  local orig = methods[name]
  if orig then methods[name] = wrap(orig) end
end

-- SetScript on a game widget from addon code: replaces the game's own handler
-- (the addon hooks it instead, with HookScript). Recorded; the script is still set.
local function guardScript(set)
  return function(self, name, fn)
    local at = callerOf(1)
    if rawget(self, "__byGame") and byAddon(at) then
      violate(string.format("script replaced: %s set %s on the game's frame %s", where(at), tostring(name), label(self)))
    end
    return set(self, name, fn)
  end
end
rewrap("SetScript", guardScript)

-- A region made by CreateTexture or CreateFontString belongs to whoever called it.
for _, name in ipairs({ "CreateTexture", "CreateFontString" }) do
  rewrap(name, function(make) return function(self, ...) local r = own(make(self, ...), 1) return r end end)
end

-- Regions the stub makes on first use belong to their frame's owner.
local LAZY = { SetStatusBarTexture = "__barTexture", GetCountdownFontString = "__countdown", SetCheckedTexture = "__checkedTexture", SetThumbTexture = "__thumbTexture" }

-- After the method, the region it made is the game's when its frame is.
local function lazyRegion(field)
  return function(orig)
    return function(self, ...)
      local out = orig(self, ...)
      if rawget(self, "__byGame") and rawget(self, field) then ownByGame(self[field]) end
      return out
    end
  end
end
for name, field in pairs(LAZY) do rewrap(name, lazyRegion(field)) end

-- Combat lockdown ---------------------------------------------------------------------------

-- The methods the client blocks on a protected frame while insecure code runs in combat.
local PROTECTED_CALLS = { "Show", "Hide", "SetShown", "SetPoint", "ClearAllPoints", "SetAllPoints", "SetSize", "SetWidth", "SetHeight", "SetScale", "SetParent", "SetAttribute", "StartMoving", "StopMovingOrSizing" }

-- The game's frames the client protects (secure unit buttons in the real UI).
local GAME_PROTECTED = { "PlayerFrame", "TargetFrame", "FocusFrame", "PetFrame" }
for _, name in ipairs(GAME_PROTECTED) do
  if type(_G[name]) == "table" then rawset(_G[name], "__protected", true) end
end

-- Marks a frame protected (a test's stand-in for one of the game's secure frames).
function stub.protect(w) rawset(w, "__protected", true) end

-- Whether a frame is protected itself: marked, or made from a Secure template.
local function protectedItself(w)
  local template = rawget(w, "__template")
  return rawget(w, "__protected") == true or (type(template) == "string" and template:find("Secure") ~= nil)
end

-- Whether the client protects a frame: itself, or through a protected frame inside it.
local function isProtected(w, depth)
  if protectedItself(w) then return true end
  if depth > 32 or w.__kind == "Texture" or w.__kind == "FontString" then return false end
  for _, child in ipairs({ w:GetChildren() }) do
    if isProtected(child, depth + 1) then return true end
  end
  return false
end

-- IsProtected, as the client answers it: protected at all, and protected itself.
function methods:IsProtected()
  return isProtected(self, 0), protectedItself(self)
end

-- True (and recorded) when addon code calls a protected method on a protected
-- frame in combat: the client blocks it and fires ADDON_ACTION_BLOCKED.
local function blocked(w, name)
  if not stub.inCombat then return false end
  local at = callerOf(2)
  if not byAddon(at) or not isProtected(w, 0) then return false end
  violate(string.format("blocked in combat: %s called %s on the protected frame %s", where(at), name, label(w)))
  stub.fire("ADDON_ACTION_BLOCKED", "Vanguard", name .. "()")
  return true
end

-- A protected method that does nothing when the call is blocked.
local function lockable(name)
  return function(orig)
    return function(self, ...)
      if blocked(self, name) then return end
      return orig(self, ...)
    end
  end
end
for _, name in ipairs(PROTECTED_CALLS) do rewrap(name, lockable(name)) end

-- The addon's code nearest the top of the stack, or nil: a run with any of it is tainted,
-- whatever game or test code it called on the way.
local function addonOnStack()
  local level = 3
  local info = debug.getinfo(level, "Sl")
  while info and not byAddon(info) do
    level = level + 1
    info = debug.getinfo(level, "Sl")
  end
  return info
end

-- ShowUIPanel and HideUIPanel refuse a tainted run in combat, for every frame
-- (UIParentPanelManager.lua CheckProtectedFunctionsAllowed: "We no longer allow addons to
-- show or hide UI panels in combat"). Nothing opens or closes, and the client prints
-- INTERFACE_ACTION_BLOCKED. A test that redefines either replaces the rule too.
local function panelCall(name, call)
  return function(frame, ...)
    local at = stub.inCombat and type(frame) == "table" and addonOnStack()
    if at then
      violate(string.format("blocked in combat: %s reached %s(%s), which refuses addon code in a fight", where(at), name, label(frame)))
      return
    end
    return call(frame, ...)
  end
end
for _, name in ipairs({ "ShowUIPanel", "HideUIPanel" }) do _G[name] = panelCall(name, _G[name]) end

-- Secret arguments --------------------------------------------------------------------------
-- The aura calls Blizzard documents with SecretArguments = "AllowedWhenUntainted" take a
-- secret argument (a hidden aura instance id) only from the game's own code, and the
-- client won't hand addon code a hidden aura's data by its id. Addon code that tries
-- gets the client's error (both texts as 0.7.0 caught them in game), which a pcall
-- around the call only hides.

-- The C_UnitAuras calls that refuse a secret argument from addon code.
local UNTAINTED_ONLY = { "GetAuraDataByIndex", "GetAuraDataBySpellName", "GetAuraDataByAuraInstanceID", "GetAuraApplicationDisplayCount", "GetAuraDispelTypeColor", "GetAuraDuration" }

-- The position of the first secret argument, or nil.
local function firstSecret(...)
  for i = 1, select("#", ...) do
    if issecretvalue((select(i, ...))) then return i end
  end
end

-- Raises the client's error when addon code hands a call a secret, or asks for a hidden aura's data by its id.
local function refuseSecrets(name, ...)
  local i = firstSecret(...)
  if i then error(string.format("bad argument #%d to '?' (Usage: C_UnitAuras.%s(). Secret values are only allowed during untainted execution for this argument.)", i, name), 0) end
  local hidden = C_Secrets and C_Secrets.ShouldUnitAuraInstanceBeSecret
  if name == "GetAuraDataByAuraInstanceID" and type(hidden) == "function" and hidden(...) == true then
    error(name .. "(): Auras cannot be accessed when secret while tainted by 'Vanguard'", 0)
  end
end

-- A call that refuses secrets from addon code (refuseSecrets); the game's and the tests' code pass.
local function untaintedOnly(name, call)
  return function(...)
    if byAddon(callerOf(1)) then refuseSecrets(name, ...) end
    return call(...)
  end
end
for _, name in ipairs(UNTAINTED_ONLY) do C_UnitAuras[name] = untaintedOnly(name, C_UnitAuras[name]) end

-- Secret geometry ---------------------------------------------------------------------------
-- The client hides a region's position and size from addons when they come from a
-- secret: a status bar's fill while its value is secret, a font string showing secret
-- text, and anything anchored to one of those. Reading them gives secrets, and
-- arithmetic or comparison on them fails. stub.secretGeometry turns this on:
--   "derived"  the regions above;
--   "strict"   those, and every frame of the game's but UIParent (code that measures
--              the game's frames fails: anchor to them instead).

-- The getters that answer with a secret when a region's geometry is.
local GEOMETRY = { "GetLeft", "GetRight", "GetTop", "GetBottom", "GetCenter", "GetRect", "GetWidth", "GetHeight", "GetSize", "GetScaledRect", "GetStringWidth" }

-- Whether a value is a secret (the global, which a test may replace).
local function isSecret(v)
  return issecretvalue(v) == true
end

-- A status bar's fill while the bar's value or range is a secret.
local function secretFill(w)
  local bar = rawget(w, "__parent")
  return bar ~= nil and rawget(bar, "__barTexture") == w and (isSecret(bar.__value) or isSecret(bar.__min) or isSecret(bar.__max))
end

-- Whether a region's own geometry is secret: a secret fill, secret text, or (strict) a game frame.
local function secretItself(w)
  if w.__kind == "FontString" and isSecret(w.__text) then return true end
  if secretFill(w) then return true end
  return stub.secretGeometry == "strict" and rawget(w, "__byGame") == true and w ~= UIParent
end

local secretGeometry

-- Whether anything a region is anchored to (its parent when it has no anchor) has secret geometry.
local function secretAnchor(w, depth)
  if next(w.__points) == nil then return secretGeometry(w.__parent, depth + 1) end
  for _, p in pairs(w.__points) do
    if p.rel ~= w and secretGeometry(p.rel, depth + 1) then return true end
  end
  return false
end

-- Whether a region's geometry is secret: its own, or through what it is anchored to.
function secretGeometry(w, depth)
  if type(w) ~= "table" or w == UIParent or depth > 32 then return false end
  return secretItself(w) or secretAnchor(w, depth)
end

-- Whether a region's geometry is secret now (the harness's own tests ask).
stub.secretGeometryOf = function(w) return secretGeometry(w, 0) end

-- Inside a getter the layout reads true values (one getter calls another).
local rawDepth = 0

-- Runs a getter with true values inside it.
local function rawCall(get, w, ...)
  rawDepth = rawDepth + 1
  local out = table.pack(pcall(get, w, ...))
  rawDepth = rawDepth - 1
  if not out[1] then error(out[2], 0) end
  return table.unpack(out, 2, out.n)
end

-- Each value as a secret; nil stays nil (a region with no rect has no position).
local function hidden(...)
  local out = table.pack(...)
  for i = 1, out.n do
    if out[i] ~= nil then out[i] = world.secret(out[i]) end
  end
  return table.unpack(out, 1, out.n)
end

-- A geometry getter that answers with secrets while the region's geometry is secret.
local function secretGetter(get)
  return function(self, ...)
    if rawDepth > 0 or not stub.secretGeometry then return get(self, ...) end
    if not secretGeometry(self, 0) then return rawCall(get, self, ...) end
    return hidden(rawCall(get, self, ...))
  end
end
for _, name in ipairs(GEOMETRY) do rewrap(name, secretGetter) end

-- How far a scroll frame scrolls is worked out from true heights.
rewrap("GetVerticalScrollRange", function(get) return function(self) return rawCall(get, self) end end)

-- Turns secret geometry on ("derived" or "strict") or off (nil, false).
function world.secretGeometry(mode)
  assert(mode == nil or mode == false or mode == "derived" or mode == "strict", "secretGeometry: derived, strict or off")
  stub.secretGeometry = mode or nil
end
