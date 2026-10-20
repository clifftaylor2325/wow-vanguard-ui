-- Raid frame status marks:
--   * players out of your range fade
--   * raid target icons (skull, cross...) along the top
--   * ready check answers in the middle while a check runs
--   * a marker on dead players someone is resurrecting, and on players being
--     summoned (pending, accepted or declined: the game's own raid frame icons)
--   * a crown for the group leader, a smaller mark for assistants
-- The ready check, leader and assist marks are Vanguard's own icons in
-- theme colors; the missing-health text steps aside while a center mark shows.
--
-- Written for WoW Forever. Every client call is looked up when used, so a
-- missing one just switches that mark off. Values the client hides are never
-- compared: a hidden range goes to the client's own alpha-from-boolean call
-- where it has one, and anything else hidden simply shows no mark.

local ADDON, ns = ...

local T = ns.Theme
local RF = ns.GetModule("RaidFrames")

local RS = ns.Module("RaidStatus", {
  defaults = { rangeFade = true, fadeAlpha = 0.4, raidIcons = true, readyCheck = true, resurrect = true, leader = true },
})

local RANGE_EVERY = 0.2
local READY_LINGER = 6
local ICONS = "Interface\\TargetingFrame\\UI-RaidTargetingIcons"
-- Marks as { texture, color name }: ready check answers, leader and assistant.
RS.READY = {
  ready = { T.Icon("Check"), "good" },
  notready = { T.Icon("Close"), "bad" },
  waiting = { T.Icon("Waiting"), "text2" },
}
RS.REZ = "Interface\\RaidFrame\\Raid-Icon-Rez"
-- The game's summon atlases by Enum.SummonStatus (1 pending, 2 accepted, 3 declined), drawn untinted.
RS.SUMMON = { "RaidFrame-Icon-SummonPending", "RaidFrame-Icon-SummonAccepted", "RaidFrame-Icon-SummonDeclined" }
RS.LEADER = { T.Icon("Crown"), "gold" }
RS.ASSIST = { T.Texture("Diamond"), "text2" }

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

-- The ready check mark { texture, color } for a unit while a check runs, or nil.
function RS.ReadyMark(unit)
  local status = plain(call("GetReadyCheckStatus", unit))
  return type(status) == "string" and RS.READY[status] or nil
end

-- The leader or assistant mark { texture, color } for a unit, or nil.
function RS.LeaderMark(unit)
  if plain(call("UnitIsGroupLeader", unit)) == true then return RS.LEADER end
  if plain(call("UnitIsGroupAssistant", unit)) == true then return RS.ASSIST end
  return nil
end

-- True while someone is resurrecting the unit.
function RS.Resurrecting(unit)
  return plain(call("UnitHasIncomingResurrection", unit)) == true
end

-- The summon atlas for a unit someone is summoning, or nil (none, a hidden answer, or a client without the calls).
function RS.SummonAtlas(unit)
  local summons = C_IncomingSummon
  if type(summons) ~= "table" or type(summons.HasIncomingSummon) ~= "function" then return nil end
  if type(summons.IncomingSummonStatus) ~= "function" or plain(summons.HasIncomingSummon(unit)) ~= true then return nil end
  local status = plain(summons.IncomingSummonStatus(unit))
  return type(status) == "number" and RS.SUMMON[status] or nil
end

-- Range ------------------------------------------------------------------------------------

-- You are always in your own range; UnitInRange doesn't check it. An encounter can hide UnitIsUnit's
-- answer (a comparison): then the unit's GUID, while the client still gives it plainly, is compared with
-- yours. With both hidden the unit counts as not you; nothing is kept per tile, since a roster change
-- can give the tile's token to someone else.
local function isPlayer(unit)
  if unit == "player" then return true end
  local same = call("UnitIsUnit", unit, "player")
  if not ns.IsSecret(same) then return same == true end
  local guid, mine = call("UnitGUID", unit), call("UnitGUID", "player")
  return not ns.IsSecret(guid) and not ns.IsSecret(mine) and guid ~= nil and guid == mine
end

-- Sets a button's alpha, only when it changes (b.rangeAlpha remembers it).
local function setAlpha(b, alpha)
  if b.rangeAlpha == alpha then return end
  b.rangeAlpha = alpha
  b:SetAlpha(alpha)
end

-- Fades a button by a hidden in-range flag, if the client can (else leaves it opaque).
local function fadeHidden(b, inRange)
  if not b.SetAlphaFromBoolean then return setAlpha(b, 1) end
  b.rangeAlpha = nil
  b:SetAlphaFromBoolean(inRange, 1, RS.settings.fadeAlpha)
end

-- Fades the button while its unit is out of range. Whether the unit is you
-- is remembered on the button (b.isPlayer) when it gets its unit.
function RS.UpdateRange(b, unit)
  if not RS.settings.rangeFade or b.isPlayer then return setAlpha(b, 1) end
  local inRange, checked = call("UnitInRange", unit)
  if ns.IsSecret(inRange) then return fadeHidden(b, inRange) end
  local out = not ns.IsSecret(checked) and checked == true and inRange == false
  setAlpha(b, out and RS.settings.fadeAlpha or 1)
end

-- The range of every shown tile, by the unit the raid frames track for it.
local function checkRange()
  for _, b in ipairs(RF.buttons) do
    if b.raidIcon and b.tracked and b:IsShown() then RS.UpdateRange(b, b.tracked) end
  end
end

-- Checks range five times a second (range has no dependable event), only while the raid header is
-- visible. Nothing runs until the header exists: with the raid frames off there are no tiles to fade.
local function followHeader()
  local header = RF.header
  if not header or RS.following then return end
  RS.following = true
  ns.Every("raid range", RANGE_EVERY, checkRange, header)
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

-- A dark copy of a mark one pixel down and right, under it, so a flat icon
-- reads over a bright bar (showMark shows and hides it with the mark).
local function addShadow(b, t, size)
  local px = T.Pixel(b)
  t.shadow = T.Tint(b.overlay:CreateTexture(nil, "OVERLAY", nil, 6), "textShadow")
  t.shadow:SetSize(size, size)
  t.shadow:SetPoint("TOPLEFT", t, "TOPLEFT", px, -px)
  t.shadow:Hide()
end

-- The marks that come and go, `big`, in the center over everything (as the client's own raid frames do):
-- the ready check (with its shadow), the resurrection and the summon.
local function centerMarks(b, big)
  b.ready = mark(b, big, "CENTER", 0, 0)
  b.rez = mark(b, big, "CENTER", 0, 0)
  b.rez:SetTexture(RS.REZ)
  b.summon = mark(b, big, "CENTER", 0, 0)
  addShadow(b, b.ready, big)
end

-- Adds the marks to a raid button (RF setup hook): raid icon and leader crown
-- on the top edge, and the center marks.
local function setup(b)
  followHeader()
  b.raidIcon = mark(b, 12, "TOP", 0, 3)
  centerMarks(b, RF.TileZones().icon + 4)
  b.leader = mark(b, 10, "TOPLEFT", 2, 5)
  addShadow(b, b.leader, 10)
end

-- Updating ---------------------------------------------------------------------------------

-- Shows a texture with a picture, or hides it.
local function showTexture(t, shown, texture)
  t:SetShown(shown)
  if shown then t:SetTexture(texture) end
end

-- Shows a mark { texture, color } tinted, with its shadow, or hides both when
-- there's none (or the mark is off).
local function showMark(t, on, spec)
  local shown = on and spec ~= nil
  showTexture(t, shown, shown and spec[1])
  showTexture(t.shadow, shown, shown and spec[1])
  if shown then T.Tint(t, spec[2]) end
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

-- Shows a game atlas on a texture, or hides it for nil or an atlas the client doesn't have (SetAtlas says false).
local function showAtlas(t, atlas)
  t:SetShown(atlas ~= nil and t:SetAtlas(atlas) ~= false)
end

-- The marks that come and go in the center, one at a time: the ready check answer, else the summon,
-- else the resurrection (the last two under one switch). The status text (missing health, Dead) hides while one shows.
local function updateCenter(b, unit)
  local s = RS.settings
  showMark(b.ready, s.readyCheck and RS.readyRunning, RS.ReadyMark(unit))
  local summon = s.resurrect and not b.ready:IsShown() and RS.SummonAtlas(unit) or nil
  showAtlas(b.summon, summon)
  b.rez:SetShown(s.resurrect and not summon and RS.Resurrecting(unit))
  b.status:SetShown(not (b.ready:IsShown() or b.rez:IsShown() or b.summon:IsShown()))
end

-- The leader crown or assistant mark.
local function updateLeader(b, unit)
  showMark(b.leader, RS.settings.leader, RS.LeaderMark(unit))
end

-- Every mark on one button (RF update hook: a roster change, a new tile).
local function update(b, unit)
  b.isPlayer = isPlayer(unit)
  updateRaidIcon(b, unit)
  updateCenter(b, unit)
  updateLeader(b, unit)
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

-- Refreshes one kind of mark on every shown button: icons, leader or center.
local function eachPart(part)
  return function() each(part) end
end

-- Events -----------------------------------------------------------------------------------

-- Ready checks seen so far: a finished check's linger timer clears only if no newer check began.
RS.readyChecks = 0

-- A ready check started or someone answered: show the answers.
local function onReadyCheck(event)
  if event == "READY_CHECK" then RS.readyChecks = RS.readyChecks + 1 end
  RS.readyRunning = true
  each(updateCenter)
end

-- Hides every ready check answer.
local function clearReady()
  RS.readyRunning = false
  each(updateCenter)
end

-- The check ended: leave the answers up a few seconds, then clear them
-- (unless another check has started by then).
local function onReadyFinished()
  if type(C_Timer) ~= "table" or type(C_Timer.After) ~= "function" then return clearReady() end
  local check = RS.readyChecks
  C_Timer.After(READY_LINGER, ns.Guard("timer ready check linger", function() if RS.readyChecks == check then clearReady() end end))
end

-- Refreshes a tile's center marks, if it has them.
local function updateMarks(b, unit)
  if b.raidIcon then updateCenter(b, unit) end
end

-- A unit's resurrection or summon state changed: refresh the tile showing it.
local function onUnit(_, unit)
  RF.ForUnit(unit, updateMarks)
end

-- Event -> handler.
local EVENTS = {
  -- A roster change refreshes every tile, marks included, through RF.RosterChanged.
  RAID_TARGET_UPDATE = eachPart(updateRaidIcon), PARTY_LEADER_CHANGED = eachPart(updateLeader),
  READY_CHECK = onReadyCheck, READY_CHECK_CONFIRM = onReadyCheck, READY_CHECK_FINISHED = onReadyFinished,
  INCOMING_RESURRECT_CHANGED = onUnit, INCOMING_SUMMON_CHANGED = onUnit,
}

-- Module entry point (Core/Modules.lua): hook into raid buttons (existing and new), then listen.
function RS.Enable(settings)
  RS.settings = settings
  for _, b in ipairs(RF.buttons) do setup(b) end
  table.insert(RF.setupHooks, setup)
  table.insert(RF.updateHooks, update)
  for event, fn in pairs(EVENTS) do ns.On(event, fn) end
  followHeader()
end
