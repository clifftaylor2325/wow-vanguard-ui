-- Officer roster: a small movable panel listing the group, one line each: the name in the
-- class color, then the role (as set in the game's group tools), a leader or assistant mark,
-- and "Offline" or "Dead" where it applies. It is a view only: nothing is sent, invited or
-- changed. Part of the officer loot tools (Modules/OfficerLoot.lua); it opens with
-- /vg loot roster, or from the button under Combat tools, and only while those are on.

local ADDON, ns = ...

local T = ns.Theme
local L = ns.L
local OL = ns.GetModule("OfficerLoot")

-- The panel's width, a line's height and its padding (UI units; a HUD card's, T.SPACE.gap), and the most members listed.
OL.RWIDTH, OL.RLINE, OL.RPAD, OL.RMAX = 190, 14, T.SPACE.gap, 40
-- How far down from the screen's top the panel starts by default.
OL.RTOP = 200
-- A group role as the roster says it, and the order roles are listed in.
OL.ROLES = { TANK = L["Tank"], HEALER = L["Healer"], DAMAGER = L["DPS"] }
OL.ROLE_ORDER = { TANK = 1, HEALER = 2, DAMAGER = 3 }

-- Reading the group -------------------------------------------------------------------------------

-- The value unless the game hides it (secret), else nil.
local function plain(value)
  if ns.IsSecret(value) then return nil end
  return value
end

-- The unit tokens of the group: you alone, you and the party, or the raid.
function OL.Units()
  local n = IsInGroup() and GetNumGroupMembers() or 1
  local out = {}
  for i = 1, math.min(n, OL.RMAX) do
    out[i] = IsInRaid() and ("raid" .. i) or (i == 1 and "player" or ("party" .. (i - 1)))
  end
  return out
end

-- Whether the unit leads (2), assists (1) or neither (0) the group.
local function rank(unit)
  if plain(UnitIsGroupLeader(unit)) == true then return 2 end
  return plain(UnitIsGroupAssistant(unit)) == true and 1 or 0
end

-- One member's facts as { name, class, role, rank, online, dead }, or nil when the unit isn't there or its name is hidden.
function OL.Member(unit)
  local name = plain(UnitName(unit))
  if type(name) ~= "string" then return nil end
  local class = plain(select(2, UnitClass(unit)))
  return {
    name = name, class = type(class) == "string" and class or nil, role = plain(UnitGroupRolesAssigned(unit)),
    rank = rank(unit), online = plain(UnitIsConnected(unit)) ~= false, dead = plain(UnitIsDeadOrGhost(unit)) == true,
  }
end

-- Whether member a is listed before b: by role (tanks, healers, damage, the rest), then name.
local function before(a, b)
  local x, y = OL.ROLE_ORDER[a.role] or 4, OL.ROLE_ORDER[b.role] or 4
  if x ~= y then return x < y end
  return a.name:lower() < b.name:lower()
end

-- Everyone in the group, in listing order.
function OL.Roster()
  local out = {}
  for _, unit in ipairs(OL.Units()) do out[#out + 1] = OL.Member(unit) end
  table.sort(out, before)
  return out
end

-- Lines ---------------------------------------------------------------------------------------------

-- What a member's right side says: role, Lead or Asst, then Offline or Dead.
function OL.Note(m)
  local parts = { OL.ROLES[m.role], m.rank == 2 and L["Lead"] or (m.rank == 1 and L["Asst"] or nil), (not m.online) and L["Offline"] or (m.dead and L["Dead"] or nil) }
  local out = {}
  for i = 1, 3 do out[#out + 1] = parts[i] end
  return table.concat(out, " ")
end

-- The panel's lines: a heading with the count, then each member as { name, note, member }.
function OL.RosterLines()
  local members = OL.Roster()
  local off = 0
  for _, m in ipairs(members) do if not m.online then off = off + 1 end end
  local out = { { ns.Format(L["Roster {count}"], { count = #members }), off > 0 and ns.Format(L["{count} offline"], { count = off }) or "" } }
  for _, m in ipairs(members) do out[#out + 1] = { m.name, OL.Note(m), m } end
  return out
end

-- How many lines fit under the panel's top on this screen (at least the heading and one more).
function OL.MaxLines()
  local room = (UIParent:GetHeight() or 0) - OL.RTOP - 2 * OL.RPAD
  return math.max(2, math.floor(room / OL.RLINE))
end

-- The lines cut to the room on this screen: past it, the last line says how many members are not listed.
function OL.Fit(lines)
  local max = OL.MaxLines()
  if #lines <= max then return lines end
  local out = {}
  for i = 1, max - 1 do out[i] = lines[i] end
  out[max] = { ns.Format(L["+{count} more"], { count = #lines - max + 1 }), "" }
  return out
end

-- Drawing -------------------------------------------------------------------------------------------

-- Ends a line's name before its note, or at the panel's edge when it has none (an empty text takes no
-- room, so nothing is laid out for the name to follow).
local function endName(row, note)
  if note == "" then return row.left:SetPoint("RIGHT", row.left:GetParent(), "RIGHT", -OL.RPAD, 0) end
  row.left:SetPoint("RIGHT", row.right, "LEFT", -T.SPACE.tight, 0)
end

-- The name's color: the class color, gray when offline; the note red when dead.
local function paintLine(row, line)
  local m = line[3]
  row.left:SetText(line[1])
  row.right:SetText(line[2])
  endName(row, line[2])
  local c = m and m.class and RAID_CLASS_COLORS and RAID_CLASS_COLORS[m.class]
  if m and not m.online then T.Color(row.left, "disabled") elseif c then T.Color(row.left, c.r, c.g, c.b) else T.Color(row.left, m and "text2" or "text") end
  T.Color(row.right, m and m.dead and "bad" or (m and "text2" or "muted"))
end

-- Line i: a name at the left and its note at the right, one line height apart down the panel.
local function addRow(f, i)
  local y = -OL.RPAD - (i - 1) * OL.RLINE
  local left = T.Text(f:CreateFontString(nil, "OVERLAY"), "small")
  local right = T.Text(f:CreateFontString(nil, "OVERLAY"), "small")
  left:SetPoint("TOPLEFT", f, "TOPLEFT", OL.RPAD, y) left:SetPoint("RIGHT", f, "RIGHT", -OL.RPAD, 0)
  right:SetPoint("TOPRIGHT", f, "TOPRIGHT", -OL.RPAD, y)
  left:SetJustifyH("LEFT") left:SetWordWrap(false) right:SetJustifyH("RIGHT")
  return { left = left, right = right }
end

-- The movable panel, made the first time it is wanted.
function OL.BuildRoster()
  local f = T.HudPanel(CreateFrame("Frame", "Vanguard_OfficerRoster", UIParent))
  OL.rframe = f
  f:SetSize(OL.RWIDTH, 2 * OL.RPAD + OL.RLINE)
  f:Hide()
  ns.Mover(f, "officerroster", L["Officer roster"], { "TOPLEFT", "TOPLEFT", 6, -OL.RTOP })
  f.rows = {}
  for i = 1, OL.RMAX + 1 do f.rows[i] = addRow(f, i) end
  return f
end

-- Draws each line into its row; rows past the last line are hidden.
function OL.DrawRows(f, lines)
  for i, row in ipairs(f.rows) do
    row.left:SetShown(lines[i] ~= nil) row.right:SetShown(lines[i] ~= nil)
    if lines[i] then paintLine(row, lines[i]) end
  end
end

-- Draws the roster: shown while the tools are on and it was opened; hidden otherwise.
function OL.PaintRoster()
  local f = OL.rframe
  if not f then return end
  local show = OL.On() and OL.rosterOpen == true
  f:SetShown(show)
  if not show then return end
  local lines = OL.Fit(OL.RosterLines())
  f:SetHeight(#lines * OL.RLINE + 2 * OL.RPAD)
  OL.DrawRows(f, lines)
end

-- Opens or closes the roster (only while the tools are on).
function OL.ToggleRoster()
  if not OL.On() then return ns.Chat(L["Officer loot tools are off. /vg loot on switches them on."]) end
  OL.rframe = OL.rframe or OL.BuildRoster()
  OL.rosterOpen = not OL.rosterOpen
  OL.PaintRoster()
end

-- Draws the roster on the next frame, once however many events come in before then.
function OL.SoonPaint()
  ns.Soon("officer roster", OL.PaintRoster)
end

-- A unit event: drawn again only for you or a group member (a mob's or a nameplate's flags change all fight).
function OL.SoonPaintMember(_, unit)
  if type(unit) ~= "string" then return end
  if unit == "player" or unit:find("^raid%d") or unit:find("^party%d") then OL.SoonPaint() end
end

-- Draws the roster again when the group changes.
function OL.WatchRoster()
  for _, event in ipairs({ "GROUP_ROSTER_UPDATE", "PLAYER_ROLES_ASSIGNED", "PLAYER_DEAD", "PLAYER_ALIVE", "PLAYER_UNGHOST" }) do
    ns.On(event, OL.SoonPaint)
  end
  for _, event in ipairs({ "UNIT_CONNECTION", "UNIT_FLAGS" }) do ns.On(event, OL.SoonPaintMember) end
  T.OnChanged(OL.PaintRoster)
end
