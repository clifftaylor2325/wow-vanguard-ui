-- Group threat (off until you switch it on): a small movable panel listing who
-- in your group has the most threat on your target, highest first (up to five
-- rows, "Name  87%", in the threat colors once a member has aggro). It shows
-- only in a group, with a hostile target, and only while the client lets
-- addons read threat: when it hides threat values (C_Secrets says so, or a
-- value comes back secret) the panel hides itself, and a hidden value is never
-- compared or added up. Nothing here is protected, so it updates in combat.
-- UNVERIFIED: whether Forever hides threat in combat is not known (issue #215);
-- the in-game test decides whether this ever shows during a fight.

local ADDON, ns = ...

local T = ns.Theme

local GT = ns.Module("GroupThreat", { defaults = { show = false } })

-- The panel's width, a line's height, its padding (a HUD card's, T.SPACE.gap), and most rows.
GT.WIDTH, GT.ROW, GT.PAD, GT.MAX = 150, 16, T.SPACE.gap, 5
-- The events that move threat or change who is compared.
GT.EVENTS = { "UNIT_THREAT_LIST_UPDATE", "UNIT_THREAT_SITUATION_UPDATE", "PLAYER_TARGET_CHANGED", "GROUP_ROSTER_UPDATE" }

-- Reading -------------------------------------------------------------------------------------

-- Whether the client says threat values against your target are hidden now. An error or a hidden answer
-- counts as hidden; a client without the call (an older one) is taken as readable, and the values themselves
-- are still checked. The client requires both units: asked with none, it always errors.
function GT.Hidden()
  local ask = C_Secrets and C_Secrets.ShouldUnitThreatValuesBeSecret
  if type(ask) ~= "function" then return false end
  local ok, secret = pcall(ask, "player", "target")
  return not ok or ns.IsSecret(secret) or secret == true
end

-- The units to compare: you, then your party or raid.
function GT.Units()
  local units = { "player" }
  local raid = type(IsInRaid) == "function" and IsInRaid()
  local n = (type(GetNumGroupMembers) == "function" and ns.PlainNumber(GetNumGroupMembers()) or 1) - (raid and 0 or 1)
  for i = 1, n do units[#units + 1] = (raid and "raid" or "party") .. i end
  return units
end

-- True when the client says so with a plain true (a hidden answer counts as no).
local function isTrue(v)
  return not ns.IsSecret(v) and v == true
end

-- One unit's row { name, percent, status } on your target, nil when it has none; false when the client hid a value.
local function read(unit)
  if not isTrue(UnitExists(unit)) or isTrue(UnitIsUnit(unit, "player")) and unit ~= "player" then return nil end
  local _, status, percent = UnitDetailedThreatSituation(unit, "target")
  local name = UnitName(unit)
  if ns.IsSecret(status) or ns.IsSecret(percent) or ns.IsSecret(name) then return false end
  if type(status) ~= "number" or type(percent) ~= "number" or percent <= 0 then return nil end
  return { name = name, percent = percent, status = status }
end

-- The rows, highest threat first and at most GT.MAX, or nil when any value is hidden.
function GT.Rows()
  local rows = {}
  for _, unit in ipairs(GT.Units()) do
    local row = read(unit)
    if row == false then return nil end
    rows[#rows + 1] = row
  end
  table.sort(rows, function(a, b) return a.percent > b.percent end)
  return { unpack(rows, 1, GT.MAX) }
end

-- Whether there is something to compare against: a client that has the call, a group and a hostile target.
function GT.CanShow()
  if type(UnitDetailedThreatSituation) ~= "function" or type(IsInGroup) ~= "function" then return false end
  if not IsInGroup() or not isTrue(UnitExists("target")) then return false end
  return type(UnitCanAttack) ~= "function" or UnitCanAttack("player", "target") == true
end

-- Drawing ---------------------------------------------------------------------------------------

-- Row i of the panel: the name at the left, the percent at the right.
local function rowFrame(i)
  local r = CreateFrame("Frame", nil, GT.panel)
  r:SetSize(GT.WIDTH - 2 * GT.PAD, GT.ROW)
  r:SetPoint("TOPLEFT", GT.PAD, -GT.PAD - (i - 1) * GT.ROW)
  r.name = T.Text(r:CreateFontString(nil, "OVERLAY"), "label")
  r.name:SetPoint("LEFT", 0, 0)
  r.value = T.Text(r:CreateFontString(nil, "OVERLAY"), "number")
  r.value:SetPoint("RIGHT", 0, 0)
  return r
end

-- Puts one row's name and percent (in the threat color for its status) on a row frame.
local function paintRow(r, row)
  r:Show()
  r.name:SetText(row.name)
  r.value:SetText(string.format("%d%%", math.floor(row.percent + 0.5)))
  T.Color(r.value, row.status >= 1 and "threat" .. math.min(row.status, 3) or "text2")
end

-- Shows the rows on the panel and sizes it to fit; nothing to show hides it.
function GT.Paint(rows)
  local panel = GT.panel
  panel:SetShown(#rows > 0)
  for i = #panel.rows + 1, #rows do panel.rows[i] = rowFrame(i) end
  for i, r in ipairs(panel.rows) do
    if rows[i] then paintRow(r, rows[i]) else r:Hide() end
  end
  panel:SetHeight(2 * GT.PAD + math.max(#rows, 1) * GT.ROW)
end

-- Reads threat now and draws it; hides itself when threat is hidden, or there is no group or target.
function GT.Update()
  local rows = not GT.Hidden() and GT.CanShow() and GT.Rows()
  GT.Paint(rows or {})
end

-- The movable panel, hidden until there is something to show.
local function build()
  local f = CreateFrame("Frame", "Vanguard_GroupThreat", UIParent)
  T.Panel(f, { shadow = true })
  f:SetSize(GT.WIDTH, 2 * GT.PAD + GT.ROW)
  f.rows = {}
  f:Hide()
  GT.panel = f
  ns.Mover(f, "groupthreat", "Group threat", { "TOPLEFT", "TOPLEFT", 20, -186 })
end

-- Module entry point (Core/Modules.lua): built, and listening, only when switched on.
function GT.Enable(settings)
  if not settings.show then return end
  build()
  for _, event in ipairs(GT.EVENTS) do ns.On(event, function() ns.Soon("group threat", GT.Update) end) end
end
