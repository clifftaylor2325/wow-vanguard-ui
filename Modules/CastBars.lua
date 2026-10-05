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

-- Unit -> size and default point (the Centered layout; Modules/UnitFrames.lua).
local LAYOUT = {
  -- Yours: centered just above the action bars, between the player and target frames.
  player = { w = 220, h = 18, point = { "BOTTOM", "BOTTOM", 0, 146 } },
  -- The target's sits over its buff row (Modules/FrameAuras.lua), the focus's over the focus frame.
  target = { w = 240, h = 16, point = { "BOTTOM", "BOTTOM", 240, 257 } },
  focus = { w = 160, h = 14, point = { "BOTTOM", "BOTTOM", -270, 324 } },
}
-- The default sizes and points, for layouts placed around them (Core/Setup.lua).
CB.LAYOUT = LAYOUT
local BLIZZARD = { "PlayerCastingBarFrame", "CastingBarFrame", "PetCastingBarFrame" }

CB.bars = {}

-- Reading casts -----------------------------------------------------------------------

-- A cast from one of the client's cast calls: name, icon, startMS, endMS,
-- shielded, channel; nothing when there is none. The uninterruptible flag is
-- the 8th return for casts and the 7th for channels.
local function castFrom(unit, call, channel)
  local get = _G[call]
  if type(get) ~= "function" then return nil end
  local name, _, icon, startMS, endMS, _, a7, a8 = get(unit)
  if type(name) == "nil" then return nil end
  if channel then return name, icon, startMS, endMS, a7, true end
  return name, icon, startMS, endMS, a8, false
end

-- The unit's current cast or channel as values (no table each time it's
-- asked): name, icon, startMS, endMS, shielded, channel; nil when there is
-- none. (Checked with type() so a hidden name is never tested for truth.)
function CB.Cast(unit)
  local name, icon, startMS, endMS, shielded, channel = castFrom(unit, "UnitCastingInfo", false)
  if type(name) ~= "nil" then return name, icon, startMS, endMS, shielded, channel end
  return castFrom(unit, "UnitChannelInfo", true)
end

-- Whether the unit is casting or channeling.
local function casting(unit)
  return type((CB.Cast(unit))) ~= "nil"
end

-- A plain true (hidden counts as false).
local function isTrue(v)
  return not ns.IsSecret(v) and v == true
end

-- The client's duration object for a cast, where it has one.
local function castDuration(unit, channel)
  local get = channel and _G.UnitChannelDuration or _G.UnitCastingDuration
  if type(get) ~= "function" then return nil end
  local ok, d = pcall(get, unit)
  return ok and d or nil
end

-- Showing ----------------------------------------------------------------------------

-- Shows seconds left ("2.4") on a font string, formatting only when the text
-- would read differently: the key changes exactly when "%.1f" would (a value
-- on a half tenth gets a key of its own, so the rounding there stays the
-- formatter's). Saves a new string per bar per frame. Plain numbers only.
function CB.ShowSeconds(fs, seconds)
  local t = seconds * 10 + 0.5
  local key = math.floor(t)
  if key == t then key = -key - 1 end
  if key == fs.vgTenth then return end
  fs.vgTenth = key
  fs:SetText(string.format("%.1f", seconds))
end

-- Clears a font string CB.ShowSeconds writes to, so the next call writes again.
function CB.ClearSeconds(fs)
  fs.vgTenth = nil
  fs:SetText("")
end

-- Moves the bar by plain times and shows the seconds left; hidden times leave it full.
local function onUpdate(bar)
  local startMS, endMS = ns.PlainNumber(bar.startMS), ns.PlainNumber(bar.endMS)
  if not startMS or not endMS or endMS <= startMS then return end
  local now = GetTime() * 1000
  local share = math.max(0, math.min(1, (now - startMS) / (endMS - startMS)))
  bar:SetValue(bar.channel and (1 - share) or share)
  CB.ShowSeconds(bar.time, math.max(0, endMS - now) / 1000)
end

-- Your latency in ms (to the world server, else home), or nil where the client can't say.
local function latency()
  if type(GetNetStats) ~= "function" then return nil end
  local _, _, home, world = GetNetStats()
  return ns.PlainNumber(world) or ns.PlainNumber(home)
end

-- Your own latency at the end of your cast bar (plain times only): the part
-- of the cast the server may already count as done, so you can queue the next.
local function showLatency(bar, startMS, endMS, channel)
  startMS, endMS = ns.PlainNumber(startMS), ns.PlainNumber(endMS)
  local lag = latency()
  bar.lag:SetShown(bar.unit == "player" and not channel and lag ~= nil and startMS ~= nil and endMS ~= nil and endMS > startMS)
  if bar.lag:IsShown() then bar.lag:SetWidth(bar:GetWidth() * math.min(1, lag / (endMS - startMS))) end
end

-- How the client's timer fills the bar: at once (no easing), by the time gone for a
-- cast and by the time left for a channel, so a channel empties as it does on plain
-- times. Its default is the time gone (SimpleStatusBarAPIDocumentation, SetTimerDuration).
local function timerArgs(channel)
  local dirs, ease = Enum and Enum.StatusBarTimerDirection, Enum and Enum.StatusBarInterpolation
  return ease and ease.Immediate, dirs and (channel and dirs.RemainingTime or dirs.ElapsedTime)
end

-- Starts the bar's timing: the client's own timer where it can, else plain times on each frame.
local function startTiming(bar, unit, startMS, endMS, channel)
  local duration = castDuration(unit, channel)
  CB.ClearSeconds(bar.time)
  showLatency(bar, startMS, endMS, channel)
  if duration and bar.SetTimerDuration and pcall(bar.SetTimerDuration, bar, duration, timerArgs(channel)) then
    return bar:SetScript("OnUpdate", nil)
  end
  bar:SetMinMaxValues(0, 1)
  bar:SetValue(1)
  bar.startMS, bar.endMS, bar.channel = startMS, endMS, channel
  bar:SetScript("OnUpdate", onUpdate)
end

-- A cast's look on its bar: the color and edge for its kind, its icon and name.
local function paintCast(bar, name, icon, shielded, channel)
  T.BarColor(bar, isTrue(shielded) and "shielded" or channel and "channel" or "cast")
  T.SetBorder(bar, isTrue(shielded) and { T.RGB("shielded") } or nil)
  bar.icon:SetTexture(icon)
  bar.text:SetText(name)
end

-- Shows the unit's cast on a bar made by CB.Build, or hides the bar when it isn't casting.
function CB.Show(bar, unit)
  local name, icon, startMS, endMS, shielded, channel = CB.Cast(unit)
  local cast = type(name) ~= "nil"
  if not cast and bar.vgFinishing then return end
  if cast then bar.vgFinishing = nil T.StopFade(bar) end
  bar:SetShown(cast)
  if not cast then return bar:SetScript("OnUpdate", nil) end
  paintCast(bar, name, icon, shielded, channel)
  startTiming(bar, unit, startMS, endMS, channel)
end

-- A cast ended on a showing bar: flash it full (good: green; otherwise red
-- with the reason), then fade it out. A new cast cancels the flash.
function CB.Finish(bar, reason)
  if not bar:IsShown() or bar.vgFinishing then return end
  bar.vgFinishing = true
  bar:SetScript("OnUpdate", nil)
  bar:SetMinMaxValues(0, 1)
  bar:SetValue(1)
  T.BarColor(bar, reason == "good" and "good" or "bad")
  if reason ~= "good" then bar.text:SetText(reason) end
  T.FadeOut(bar, 0.35, function() bar.vgFinishing = nil end)
end

-- Shows the unit's cast on its own bar (player, target, focus), if it has one.
function CB.Update(unit)
  if CB.bars[unit] then CB.Show(CB.bars[unit], unit) end
end

-- Building ---------------------------------------------------------------------------

-- The icon to the left, the spell name on the bar and the seconds left at its right.
local function addParts(bar, h)
  bar.icon = T.Snap(T.Crop(bar:CreateTexture(nil, "ARTWORK")))
  bar.icon:SetSize(h, h)
  bar.icon:SetPoint("RIGHT", bar, "LEFT", -3, 0)
  local role = h >= 18 and "label" or "small"
  bar.text = T.Text(bar:CreateFontString(nil, "OVERLAY"), role)
  bar.text:SetPoint("LEFT", 4, 0)
  bar.time = T.Text(bar:CreateFontString(nil, "OVERLAY"), role, "text2")
  bar.time:SetPoint("RIGHT", -4, 0)
end

-- A soft spark riding the fill's edge, and the latency shade at the bar's end.
local function addSpark(bar)
  local fill = bar:GetStatusBarTexture()
  bar.spark = T.Tint(T.Spark(bar, 8), "white", 0.8)
  bar.spark:SetPoint("TOP", fill, "TOPRIGHT")
  bar.spark:SetPoint("BOTTOM", fill, "BOTTOMRIGHT")
  bar.lag = T.Tint(T.Snap(bar:CreateTexture(nil, "ARTWORK", nil, 2)), "shade")
  bar.lag:SetTexture(T.WHITE)
  bar.lag:SetPoint("TOPRIGHT"); bar.lag:SetPoint("BOTTOMRIGHT")
  bar.lag:Hide()
end

-- Makes a status bar a themed cast bar (w x h), hidden until CB.Show finds a cast.
function CB.Build(bar, w, h)
  bar:SetSize(w, h)
  T.StyleBar(bar)
  T.HudPanel(bar, { inset = true })
  addParts(bar, h)
  addSpark(bar)
  bar:Hide()
  return bar
end

-- A themed cast bar for a unit, hidden until it casts; movable.
local function createBar(unit)
  local def = LAYOUT[unit]
  local bar = CB.Build(CreateFrame("StatusBar", "Vanguard_CastBar_" .. unit, UIParent), def.w, def.h)
  bar.unit = unit
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
  ns.EditModeReplaced(f)
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

-- How an ending event says the cast went. A channel's stop names who interrupted
-- it (nil when it ran its course; a hidden name is still someone), as the
-- client's own cast bar reads it (CastingBarFrame.lua, UNIT_SPELLCAST_CHANNEL_STOP).
local function finishReason(event, interruptedBy)
  if event == "UNIT_SPELLCAST_CHANNEL_STOP" and type(interruptedBy) ~= "nil" then return "Interrupted" end
  return FINISH[event]
end

-- A cast event for one of our units: an end flashes the bar, anything else refreshes it.
local function onCast(event, unit, _, _, interruptedBy)
  local bar = CB.bars[unit]
  if bar and FINISH[event] and not casting(unit) then return CB.Finish(bar, finishReason(event, interruptedBy)) end
  CB.Update(unit)
end

-- Builds the bars switched on (yours, your target's, your focus's); returns their units.
local function createBars(settings)
  local units = {}
  for _, unit in ipairs({ "player", "target", "focus" }) do
    if settings[unit] then CB.bars[unit], units[#units + 1] = createBar(unit), unit end
  end
  return units
end

-- Module entry point (Core/Modules.lua). Cast events come only for the units
-- with a bar (the client sends every nameplate's casts to whoever asks for all).
function CB.Enable(settings)
  local units = createBars(settings)
  if settings.hideBlizzard then ns.OutOfCombat(function() for _, n in ipairs(BLIZZARD) do hideBlizzard(n) end end) end
  ns.OnUnit(CAST_EVENTS, onCast, unpack(units))
  ns.On("PLAYER_TARGET_CHANGED", function() CB.Update("target") end)
  ns.On("PLAYER_FOCUS_CHANGED", function() CB.Update("focus") end)
  ns.On("PLAYER_ENTERING_WORLD", function() for unit in pairs(CB.bars) do CB.Update(unit) end end)
end
