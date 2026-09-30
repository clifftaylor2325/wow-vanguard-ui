-- Cast bars for you, your target and your focus: spell icon, name, the
-- bar filling as the cast goes (emptying for a channel), gray when the cast
-- can't be interrupted. Each is movable in unlock mode.
--
-- Timing: where the client gives a cast duration object and the bar can
-- run it (StatusBar:SetTimerDuration), the client animates the bar itself,
-- hidden values and all. Otherwise start/end times in milliseconds drive it,
-- when they're plain numbers; if they're hidden, the bar shows full with
-- the spell's name and icon.

local ADDON, ns = ...

local T = ns.Theme

local CB = ns.Module("CastBars", {
  defaults = { player = true, target = true, focus = true, hideBlizzard = true },
})

-- Unit -> size and default point.
local LAYOUT = {
  player = { w = 240, h = 18, point = { "BOTTOM", "BOTTOM", 0, 200 } },
  -- Target and focus bars sit below their frame's debuff row (Modules/FrameAuras.lua).
  target = { w = 220, h = 16, point = { "CENTER", "CENTER", 260, -230 } },
  focus = { w = 160, h = 14, point = { "CENTER", "CENTER", -260, -110 } },
}
local BLIZZARD = { "PlayerCastingBarFrame", "CastingBarFrame", "PetCastingBarFrame" }

CB.bars = {}

-- Reading casts -----------------------------------------------------------------------

-- A cast from one of the client's cast calls, or nil. The uninterruptible
-- flag is the 8th return for casts and the 7th for channels.
local function castFrom(unit, call, channel)
  local get = _G[call]
  if type(get) ~= "function" then return nil end
  local name, _, icon, startMS, endMS, _, a7, a8 = get(unit)
  if type(name) == "nil" then return nil end
  return { name = name, icon = icon, startMS = startMS, endMS = endMS, channel = channel, shielded = (channel and { a7 } or { a8 })[1] }
end

-- The unit's current cast or channel: { name, icon, startMS, endMS, shielded, channel }, or nil.
-- (Checked with type() so a hidden name is never tested for truth.)
function CB.Cast(unit)
  return castFrom(unit, "UnitCastingInfo", false) or castFrom(unit, "UnitChannelInfo", true)
end

-- A plain true (hidden counts as false).
local function isTrue(v)
  return not ns.IsSecret(v) and v == true
end

-- The client's duration object for a cast, where it has one.
local function castDuration(unit, cast)
  local get = cast.channel and _G.UnitChannelDuration or _G.UnitCastingDuration
  if type(get) ~= "function" then return nil end
  local ok, d = pcall(get, unit)
  return ok and d or nil
end

-- Showing ----------------------------------------------------------------------------

-- Moves the bar by plain times; hidden times leave it full.
local function onUpdate(bar)
  local startMS, endMS = ns.PlainNumber(bar.startMS), ns.PlainNumber(bar.endMS)
  if not startMS or not endMS or endMS <= startMS then return end
  local share = math.max(0, math.min(1, (GetTime() * 1000 - startMS) / (endMS - startMS)))
  bar:SetValue(bar.channel and (1 - share) or share)
end

-- Starts the bar's timing: the client's own timer where it can, else plain times on each frame.
local function startTiming(bar, unit, cast)
  local duration = castDuration(unit, cast)
  if duration and bar.SetTimerDuration and pcall(bar.SetTimerDuration, bar, duration) then
    return bar:SetScript("OnUpdate", nil)
  end
  bar:SetMinMaxValues(0, 1)
  bar:SetValue(1)
  bar.startMS, bar.endMS, bar.channel = cast.startMS, cast.endMS, cast.channel
  bar:SetScript("OnUpdate", onUpdate)
end

-- Shows the unit's cast on a bar made by CB.Build, or hides the bar when it isn't casting.
function CB.Show(bar, unit)
  local cast = CB.Cast(unit)
  if not cast and bar.fuiFinishing then return end
  if cast then bar.fuiFinishing = nil T.StopFade(bar) end
  bar:SetShown(cast ~= nil)
  if not cast then return bar:SetScript("OnUpdate", nil) end
  T.BarColor(bar, isTrue(cast.shielded) and "shielded" or cast.channel and "channel" or "cast")
  bar.icon:SetTexture(cast.icon)
  bar.text:SetText(cast.name)
  startTiming(bar, unit, cast)
end

-- A cast ended on a showing bar: flash it full (good: green; otherwise red
-- with the reason), then fade it out. A new cast cancels the flash.
function CB.Finish(bar, reason)
  if not bar:IsShown() or bar.fuiFinishing then return end
  bar.fuiFinishing = true
  bar:SetScript("OnUpdate", nil)
  bar:SetMinMaxValues(0, 1)
  bar:SetValue(1)
  T.BarColor(bar, reason == "good" and "good" or "bad")
  if reason ~= "good" then bar.text:SetText(reason) end
  T.FadeOut(bar, 0.35, function() bar.fuiFinishing = nil end)
end

-- Shows the unit's cast on its own bar (player, target, focus), if it has one.
function CB.Update(unit)
  if CB.bars[unit] then CB.Show(CB.bars[unit], unit) end
end

-- Building ---------------------------------------------------------------------------

-- The icon to the left and the spell name on the bar.
local function addParts(bar, h)
  bar.icon = T.Crop(bar:CreateTexture(nil, "ARTWORK"))
  bar.icon:SetSize(h, h)
  bar.icon:SetPoint("RIGHT", bar, "LEFT", -3, 0)
  bar.text = T.Text(bar:CreateFontString(nil, "OVERLAY"), h >= 18 and "label" or "small")
  bar.text:SetPoint("LEFT", 4, 0)
  T.Color(bar.text, "text")
end

-- Makes a status bar a themed cast bar (w x h), hidden until CB.Show finds a cast.
function CB.Build(bar, w, h)
  bar:SetSize(w, h)
  T.StyleBar(bar)
  T.Panel(bar, { inset = true, shadow = true })
  addParts(bar, h)
  bar:Hide()
  return bar
end

-- A themed cast bar for a unit, hidden until it casts; movable.
local function createBar(unit)
  local def = LAYOUT[unit]
  local bar = CB.Build(CreateFrame("StatusBar", "ForeverUI_CastBar_" .. unit, UIParent), def.w, def.h)
  ns.Mover(bar, "cast_" .. unit, unit:sub(1, 1):upper() .. unit:sub(2) .. " cast bar", def.point)
  return bar
end

local hiddenParent

-- Hides a default cast bar for good: no events, parented to a hidden frame.
local function hideBlizzard(name)
  local f = _G[name]
  if type(f) ~= "table" or not f.UnregisterAllEvents then return end
  hiddenParent = hiddenParent or CreateFrame("Frame")
  hiddenParent:Hide()
  f:UnregisterAllEvents()
  f:SetParent(hiddenParent)
end

-- Events ------------------------------------------------------------------------------

-- Every event that can start, change or end a cast.
local CAST_EVENTS = {
  "UNIT_SPELLCAST_START", "UNIT_SPELLCAST_STOP", "UNIT_SPELLCAST_FAILED", "UNIT_SPELLCAST_INTERRUPTED",
  "UNIT_SPELLCAST_DELAYED", "UNIT_SPELLCAST_CHANNEL_START", "UNIT_SPELLCAST_CHANNEL_UPDATE",
  "UNIT_SPELLCAST_CHANNEL_STOP", "UNIT_SPELLCAST_INTERRUPTIBLE", "UNIT_SPELLCAST_NOT_INTERRUPTIBLE",
}
CB.EVENTS = CAST_EVENTS

-- Events that end a cast, and how the bar says so.
local FINISH = {
  UNIT_SPELLCAST_STOP = "good", UNIT_SPELLCAST_CHANNEL_STOP = "good",
  UNIT_SPELLCAST_INTERRUPTED = "Interrupted", UNIT_SPELLCAST_FAILED = "Failed",
}

-- A cast event for one of our units: an end flashes the bar, anything else refreshes it.
local function onCast(event, unit)
  local bar = CB.bars[unit]
  if bar and FINISH[event] and not CB.Cast(unit) then return CB.Finish(bar, FINISH[event]) end
  CB.Update(unit)
end

-- Module entry point (Core/Modules.lua).
function CB.Enable(settings)
  for unit in pairs(LAYOUT) do
    if settings[unit] then CB.bars[unit] = createBar(unit) end
  end
  if settings.hideBlizzard then ns.OutOfCombat(function() for _, n in ipairs(BLIZZARD) do hideBlizzard(n) end end) end
  for _, e in ipairs(CAST_EVENTS) do ns.On(e, onCast) end
  ns.On("PLAYER_TARGET_CHANGED", function() CB.Update("target") end)
  ns.On("PLAYER_FOCUS_CHANGED", function() CB.Update("focus") end)
  ns.On("PLAYER_ENTERING_WORLD", function() for unit in pairs(CB.bars) do CB.Update(unit) end end)
end
