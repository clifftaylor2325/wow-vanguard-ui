-- Raid frame status marks, VuhDo style:
--   * players out of your range fade
--   * raid target icons (skull, cross...) along the top
--   * ready check answers in the middle while a check runs
--   * a marker on dead players someone is resurrecting
--   * a crown for the group leader, a smaller mark for assistants
--
-- Written for WoW Forever. Every client call is looked up when used, so a
-- missing one just switches that mark off. Values the client hides are never
-- compared: a hidden range goes to the client's own alpha-from-boolean call
-- where it has one, and anything else hidden simply shows no mark.

local ADDON, ns = ...

local RF = ns.GetModule("RaidFrames")

local RS = ns.Module("RaidStatus", {
  defaults = { rangeFade = true, fadeAlpha = 0.4, raidIcons = true, readyCheck = true, resurrect = true, leader = true },
})

local RANGE_EVERY = 0.2
local READY_LINGER = 6
local ICONS = "Interface\\TargetingFrame\\UI-RaidTargetingIcons"
RS.READY = {
  ready = "Interface\\RaidFrame\\ReadyCheck-Ready",
  notready = "Interface\\RaidFrame\\ReadyCheck-NotReady",
  waiting = "Interface\\RaidFrame\\ReadyCheck-Waiting",
}
RS.REZ = "Interface\\RaidFrame\\Raid-Icon-Rez"
RS.LEADER = "Interface\\GroupFrame\\UI-Group-LeaderIcon"
RS.ASSIST = "Interface\\GroupFrame\\UI-Group-AssistantIcon"

-- Values -----------------------------------------------------------------------------------

-- Calls a client function by name if this client has it; nil otherwise.
local function call(name, ...)
  local fn = _G[name]
  if type(fn) == "function" then return fn(...) end
  return nil
end

-- A plain value, or nil when it is hidden.
local function plain(v)
  if ns.IsSecret(v) then return nil end
  return v
end

-- The raid target icon number (1-8) on a unit, or nil.
function RS.RaidIcon(unit)
  local index = plain(call("GetRaidTargetIndex", unit))
  if type(index) ~= "number" or index < 1 or index > 8 then return nil end
  return index
end

-- The ready check texture for a unit while a check runs, or nil.
function RS.ReadyTexture(unit)
  local status = plain(call("GetReadyCheckStatus", unit))
  return type(status) == "string" and RS.READY[status] or nil
end

-- The leader or assistant texture for a unit, or nil.
function RS.LeaderTexture(unit)
  if plain(call("UnitIsGroupLeader", unit)) == true then return RS.LEADER end
  if plain(call("UnitIsGroupAssistant", unit)) == true then return RS.ASSIST end
  return nil
end

-- True while someone is resurrecting the unit.
function RS.Resurrecting(unit)
  return plain(call("UnitHasIncomingResurrection", unit)) == true
end

-- Range ------------------------------------------------------------------------------------

-- You are always in your own range; UnitInRange doesn't check it.
local function isPlayer(unit)
  return unit == "player" or plain(call("UnitIsUnit", unit, "player")) == true
end

-- Fades a button by a hidden in-range flag, if the client can (else leaves it opaque).
local function fadeHidden(b, inRange)
  if b.SetAlphaFromBoolean then return b:SetAlphaFromBoolean(inRange, 1, RS.settings.fadeAlpha) end
  b:SetAlpha(1)
end

-- Fades the button while its unit is out of range.
function RS.UpdateRange(b, unit)
  if not RS.settings.rangeFade or isPlayer(unit) then return b:SetAlpha(1) end
  local inRange, checked = call("UnitInRange", unit)
  if ns.IsSecret(inRange) then return fadeHidden(b, inRange) end
  local out = not ns.IsSecret(checked) and checked == true and inRange == false
  b:SetAlpha(out and RS.settings.fadeAlpha or 1)
end

-- Parts ------------------------------------------------------------------------------------

-- One hidden texture on the button's overlay (above the health bar and the
-- aura icons), sized and placed.
local function mark(b, size, ...)
  local t = b.overlay:CreateTexture(nil, "OVERLAY", nil, 7)
  t:SetSize(size, size)
  t:SetPoint(...)
  t:Hide()
  return t
end

-- Adds the marks to a raid button (RF setup hook): raid icon and leader crown
-- on the top edge; the ready check and resurrection, which come and go, big
-- in the center over everything (as the client's own raid frames do).
local function setup(b)
  local big = RF.TileZones().icon + 4
  b.raidIcon = mark(b, 12, "TOP", 0, 3)
  b.ready = mark(b, big, "CENTER", 0, 0)
  b.rez = mark(b, big, "CENTER", 0, 0)
  b.rez:SetTexture(RS.REZ)
  b.leader = mark(b, 10, "TOPLEFT", 2, 4)
end

-- Updating ---------------------------------------------------------------------------------

-- Shows a mark with a texture, or hides it when the texture is nil (or the mark is off).
local function showTexture(t, on, texture)
  t:SetShown(on and texture ~= nil)
  if on and texture then t:SetTexture(texture) end
end

-- Shows raid target icon `index` (1-8, a cell of the 4 x 4 icon sheet) on a texture, or hides it for nil.
function RS.PaintIcon(t, index)
  t:SetShown(index ~= nil and index ~= false)
  if not index then return end
  local col, row = (index - 1) % 4, math.floor((index - 1) / 4)
  t:SetTexture(ICONS)
  t:SetTexCoord(col / 4, (col + 1) / 4, row / 4, (row + 1) / 4)
end

-- The raid target icon on a raid button.
local function updateRaidIcon(b, unit)
  RS.PaintIcon(b.raidIcon, RS.settings.raidIcons and RS.RaidIcon(unit))
end

-- Every mark on one button (RF update hook).
local function update(b, unit)
  local s = RS.settings
  updateRaidIcon(b, unit)
  showTexture(b.ready, s.readyCheck and RS.readyRunning, RS.ReadyTexture(unit))
  b.rez:SetShown(s.resurrect and RS.Resurrecting(unit))
  showTexture(b.leader, s.leader, RS.LeaderTexture(unit))
  RS.UpdateRange(b, unit)
end

-- Runs fn(button, unit) on every shown raid button that has the marks.
local function each(fn)
  for _, b in ipairs(RF.buttons) do
    local unit = b:GetAttribute("unit")
    if b.raidIcon and b:IsShown() and unit then fn(b, unit) end
  end
end

-- Refreshes every mark on every shown button.
function RS.UpdateAll()
  each(update)
end

-- Events -----------------------------------------------------------------------------------

-- A ready check started or someone answered: show the answers.
local function onReadyCheck()
  RS.readyRunning = true
  RS.UpdateAll()
end

-- Hides every ready check answer.
local function clearReady()
  RS.readyRunning = false
  RS.UpdateAll()
end

-- The check ended: leave the answers up a few seconds, then clear them.
local function onReadyFinished()
  if type(C_Timer) == "table" and type(C_Timer.After) == "function" then return C_Timer.After(READY_LINGER, clearReady) end
  clearReady()
end

-- A unit's resurrection state changed: refresh the buttons showing it.
local function onUnit(_, unit)
  each(function(b, own) if RF.Shows(b, unit) then update(b, own) end end)
end

-- Checks range five times a second (range has no dependable event).
local function pollRange()
  local elapsed = 0
  RS.ticker = CreateFrame("Frame")
  RS.ticker:SetScript("OnUpdate", function(_, dt)
    elapsed = elapsed + dt
    if elapsed < RANGE_EVERY then return end
    elapsed = 0
    each(RS.UpdateRange)
  end)
end

-- Event -> handler.
local EVENTS = {
  RAID_TARGET_UPDATE = RS.UpdateAll, PARTY_LEADER_CHANGED = RS.UpdateAll, GROUP_ROSTER_UPDATE = RS.UpdateAll,
  READY_CHECK = onReadyCheck, READY_CHECK_CONFIRM = onReadyCheck, READY_CHECK_FINISHED = onReadyFinished,
  INCOMING_RESURRECT_CHANGED = onUnit,
}

-- Module entry point (Core/Modules.lua): hook into raid buttons (existing and new), then listen.
function RS.Enable(settings)
  RS.settings = settings
  for _, b in ipairs(RF.buttons) do setup(b) end
  table.insert(RF.setupHooks, setup)
  table.insert(RF.updateHooks, update)
  for event, fn in pairs(EVENTS) do ns.On(event, fn) end
  pollRange()
end
