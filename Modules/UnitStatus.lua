-- The status row on the player, target and party frames: small marks over the frame's outer top corner for the group
-- leader (a crown), a tank or healer role (their raid tile marks), you resting in a city or inn ("Zzz") and a player
-- flagged for PvP ("PvP"). A part of the unit frames module (its statusMarks setting), in a file of its own; UF.build
-- starts it (UF.Status.Attach). Every answer comes from a plain client call; a hidden one shows nothing.

local ADDON, ns = ...

local L = ns.L
local T = ns.Theme

local UF = ns.GetModule("UnitFrames")
local ST = {}
UF.Status = ST

-- The frames that carry it.
ST.KEYS = { player = true, target = true, party1 = true, party2 = true, party3 = true, party4 = true }
-- The marks' size and the gap between them (units), and how far the row stands over the frame's top edge (the party
-- frames stack 10 apart, and under Tabs a tab's height more with the row over the tab, so the row stays inside that gap).
ST.SIZE, ST.GAP, ST.LIFT = 8, 2, 1
-- The marks in the order they read from the outer corner in.
ST.ORDER = { "leader", "role", "rest", "pvp" }
-- A role -> its icon and colour token (the raid tiles' marks; a damage dealer has none).
ST.ROLES = { TANK = { "RoleTank", "info" }, HEALER = { "RoleHealer", "good" } }
-- What changes a mark (the handler repaints every frame: they are few and the events rare).
ST.EVENTS = { "PARTY_LEADER_CHANGED", "GROUP_ROSTER_UPDATE", "PLAYER_ROLES_ASSIGNED", "PLAYER_UPDATE_RESTING",
  "PLAYER_FLAGS_CHANGED", "UNIT_FACTION", "PLAYER_TARGET_CHANGED", "PLAYER_ENTERING_WORLD" }

-- The set of marks of a frame that shows none.
ST.NONE = "0000"

-- The other end of a frame from a side.
local INNER = { LEFT = "RIGHT", RIGHT = "LEFT" }

-- Whether the unit leads the group (a hidden or missing answer counts as no, in each of these).
local function isLeader(unit)
  return ns.PlainCall("UnitIsGroupLeader", unit) == true
end

-- Whether the unit's assigned role has a mark.
local function hasRole(unit)
  return ST.ROLES[ns.PlainCall("UnitGroupRolesAssigned", unit)] ~= nil
end

-- Whether you are resting (the player frame only).
local function isResting(unit)
  return unit == "player" and ns.PlainCall("IsResting") == true
end

-- Whether the unit is a player flagged for PvP.
local function isFlagged(unit)
  return ns.PlainCall("UnitIsPlayer", unit) == true and ns.PlainCall("UnitIsPVP", unit) == true
end

-- The test for each mark.
local WANT = { leader = isLeader, role = hasRole, rest = isResting, pvp = isFlagged }

-- A small icon mark in a colour token.
local function iconMark(row, icon, token)
  local mark = T.Snap(row:CreateTexture(nil, "OVERLAY"), "icon")
  mark:SetTexture(T.Icon(icon))
  mark:SetSize(ST.SIZE, ST.SIZE)
  return T.Tint(mark, token)
end

-- A small word mark in a colour token.
local function wordMark(row, word, token)
  local mark = T.Text(row:CreateFontString(nil, "OVERLAY"), "badge", token)
  mark:SetText(word)
  return mark
end

-- The row and its four marks (hidden until a frame's unit earns one), on the frame's text layer.
local function add(f)
  local row = CreateFrame("Frame", nil, f.layer)
  row:SetSize(1, 1)
  row.leader, row.role = iconMark(row, "Crown", "gold"), iconMark(row, "RoleTank", "info")
  row.rest, row.pvp = wordMark(row, L["Zzz"], "text2"), wordMark(row, L["PvP"], "warn")
  for _, name in ipairs(ST.ORDER) do row[name]:Hide() end
  f.status = row
end

-- Paints the role mark's icon and colour for the unit's role.
local function paintRole(mark, unit)
  local look = ST.ROLES[ns.PlainCall("UnitGroupRolesAssigned", unit)]
  if not look then return end
  mark:SetTexture(T.Icon(look[1]))
  T.Tint(mark, look[2])
end

-- The corner the row stands on and what it stands on: the frame's outer top corner (over its name tab, where the look
-- gives it one), but your player frame's inner top corner while a class row (combo points, totems, class pips) is
-- built on the outer one, so the marks stay clear of the first points. The third value is how far in the first mark
-- starts: past the raid target icon, which stands in from that inner corner on a frame wearing a tab.
local function cornerOf(f)
  if f.key == "player" and UF.ClassRowBuilt() then return INNER[f.outer], f, UF.RaidIconReach(f) end
  return f.outer, UF.StatusHome(f), 0
end

-- Anchors the shown marks one after another from the row's corner inward. Out of combat: the frame is a secure button.
local function layout(f)
  local side, home, reach = cornerOf(f)
  local step, prev = side == "LEFT" and 1 or -1, nil
  for _, name in ipairs(ST.ORDER) do
    local mark = f.status[name]
    mark:ClearAllPoints()
    if mark:IsShown() then
      mark:SetPoint("BOTTOM" .. side, prev or home, prev and "BOTTOM" .. INNER[side] or "TOP" .. side, step * (ST.GAP + (prev and 0 or reach)), prev and 0 or ST.LIFT)
      prev = mark
    end
  end
end

-- Lays a frame's marks out and tells the readout that stands over the player frame's corner (UnitExtras' chip, which
-- lifts past the marks) to place itself again.
local function relayout(f)
  layout(f)
  if f.key == "player" and ST.OnLayout then ST.OnLayout() end
end

-- Shows each mark the unit has (all hidden when `on` is false) and gives the set as a string of 1s and 0s.
local function showMarks(f, on)
  local sig = ""
  for _, name in ipairs(ST.ORDER) do
    local shown = on and WANT[name](f.unit)
    f.status[name]:SetShown(shown)
    sig = sig .. (shown and "1" or "0")
  end
  return sig
end

-- Shows the marks the frame's unit has (none on a standing banner, whose name line takes its top), and lays the row out
-- again when the set changed (in a fight that waits for its end).
-- A frame with nothing shown and nothing to show (an empty party slot, the setting off) asks the client nothing: a
-- roster update reaches every frame, and most of them have no marks.
---@param f table a unit frame with the row
function ST.Update(f)
  if not f.status then return end
  local on = UF.settings.statusMarks == true and ns.IsTrue(UnitExists(f.unit)) and not UF.Standing(f)
  if not on and f.vgStatusSig == ST.NONE then return end
  local sig = showMarks(f, on)
  if f.status.role:IsShown() then paintRole(f.status.role, f.unit) end
  if sig == f.vgStatusSig then return end
  f.vgStatusSig = sig
  ns.OutOfCombat(function() relayout(f) end, "unit status " .. f.key)
end

-- Lays a frame's marks out again from its tab or edge (the look changed), and paints them.
---@param f table a unit frame with the row
function ST.Place(f)
  f.vgStatusSig = nil
  ST.Update(f)
end

-- Paints every frame that carries the row.
function ST.Apply()
  for key in pairs(ST.KEYS) do
    if UF.frames[key] then ST.Update(UF.frames[key]) end
  end
end

-- Adds the row to the frames that carry it (once the unit frames are built) and follows what changes it.
function ST.Attach()
  for key in pairs(ST.KEYS) do
    local f = UF.frames[key]
    if f and not f.status then add(f) end
  end
  if ST.listening then return end
  ST.listening = true
  for _, event in ipairs(ST.EVENTS) do ns.On(event, ST.Apply) end
end
