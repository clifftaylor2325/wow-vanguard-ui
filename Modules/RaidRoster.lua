-- Raid roster: a small movable panel listing the group, one line each: the name in the
-- class color, then the role (as set in the game's group tools), a leader or assistant mark,
-- and "Offline" or "Dead" where it applies. It is a view only: nothing is sent, invited or
-- changed. Part of the raid tools (Modules/RaidTools.lua); the button on the Raid frames page, or
-- /vg loot roster, opens and closes it. It listens to the group only while it is open.

local ADDON, ns = ...

local T = ns.Theme
local L = ns.L
local RT = ns.GetModule("RaidTools")

-- The panel's width, a line's height and its padding (UI units; a HUD card's, T.SPACE.gap), and the most members listed.
RT.RWIDTH, RT.RLINE, RT.RPAD, RT.RMAX = 190, 14, T.SPACE.gap, 40
-- How far down from the screen's top the panel starts by default.
RT.RTOP = 200
-- A group role as the roster says it, and the order roles are listed in.
RT.ROLES = { TANK = L["Tank"], HEALER = L["Healer"], DAMAGER = L["DPS"] }
RT.ROLE_ORDER = { TANK = 1, HEALER = 2, DAMAGER = 3 }

-- Reading the group -------------------------------------------------------------------------------

-- The value unless the game hides it (secret), else nil.
local function plain(value)
  if ns.IsSecret(value) then return nil end
  return value
end

-- The unit tokens of the group: you alone, you and the party, or the raid.
function RT.Units()
  local n = IsInGroup() and GetNumGroupMembers() or 1
  local out = {}
  for i = 1, math.min(n, RT.RMAX) do
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
function RT.Member(unit)
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
  local x, y = RT.ROLE_ORDER[a.role] or 4, RT.ROLE_ORDER[b.role] or 4
  if x ~= y then return x < y end
  return a.name:lower() < b.name:lower()
end

-- Everyone in the group, in listing order.
function RT.Roster()
  local out = {}
  for _, unit in ipairs(RT.Units()) do out[#out + 1] = RT.Member(unit) end
  table.sort(out, before)
  return out
end

-- Lines ---------------------------------------------------------------------------------------------

-- What a member's right side says: role, Lead or Asst, then Offline or Dead.
function RT.Note(m)
  local parts = { RT.ROLES[m.role], m.rank == 2 and L["Lead"] or (m.rank == 1 and L["Asst"] or nil), (not m.online) and L["Offline"] or (m.dead and L["Dead"] or nil) }
  local out = {}
  for i = 1, 3 do out[#out + 1] = parts[i] end
  return table.concat(out, " ")
end

-- The panel's lines: a heading with the count, then each member as { name, note, member }.
function RT.RosterLines()
  local members = RT.Roster()
  local off = 0
  for _, m in ipairs(members) do if not m.online then off = off + 1 end end
  local out = { { ns.Format(L["Roster {count}"], { count = #members }), off > 0 and ns.Format(L["{count} offline"], { count = off }) or "" } }
  for _, m in ipairs(members) do out[#out + 1] = { m.name, RT.Note(m), m } end
  return out
end

-- How many lines fit under the panel's top on this screen (at least the heading and one more).
function RT.MaxLines()
  local room = (UIParent:GetHeight() or 0) - RT.RTOP - 2 * RT.RPAD
  return math.max(2, math.floor(room / RT.RLINE))
end

-- The lines cut to the room on this screen: past it, the last line says how many members are not listed.
function RT.Fit(lines)
  local max = RT.MaxLines()
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
  if note == "" then return row.left:SetPoint("RIGHT", row.left:GetParent(), "RIGHT", -RT.RPAD, 0) end
  row.left:SetPoint("RIGHT", row.right, "LEFT", -T.SPACE.tight, 0)
end

-- The name's color: the class color, muted gray when offline; the note red when dead.
local function paintLine(row, line)
  local m = line[3]
  row.left:SetText(line[1])
  row.right:SetText(line[2])
  endName(row, line[2])
  local c = m and m.class and RAID_CLASS_COLORS and RAID_CLASS_COLORS[m.class]
  if m and not m.online then T.Color(row.left, "muted") elseif c then T.Color(row.left, c.r, c.g, c.b) else T.Color(row.left, m and "text2" or "text") end
  T.Color(row.right, m and m.dead and "bad" or (m and "text2" or "muted"))
end

-- Line i: a name at the left and its note at the right, one line height apart down the panel.
local function addRow(f, i)
  local y = -RT.RPAD - (i - 1) * RT.RLINE
  local left = T.Text(f:CreateFontString(nil, "OVERLAY"), "small")
  local right = T.Text(f:CreateFontString(nil, "OVERLAY"), "small")
  left:SetPoint("TOPLEFT", f, "TOPLEFT", RT.RPAD, y) left:SetPoint("RIGHT", f, "RIGHT", -RT.RPAD, 0)
  right:SetPoint("TOPRIGHT", f, "TOPRIGHT", -RT.RPAD, y)
  left:SetJustifyH("LEFT") left:SetWordWrap(false) right:SetJustifyH("RIGHT")
  return { left = left, right = right }
end

-- The movable panel, made the first time it is wanted.
function RT.BuildRoster()
  local f = T.HudPanel(CreateFrame("Frame", "Vanguard_RaidRoster", UIParent))
  RT.rframe = f
  f:SetSize(RT.RWIDTH, 2 * RT.RPAD + RT.RLINE)
  f:Hide()
  -- The mover keeps the key "officerroster" it was saved under, so a dragged spot survives the fold into raid tools.
  ns.Mover(f, "officerroster", L["Raid roster"], { "TOPLEFT", "TOPLEFT", 6, -RT.RTOP })
  f.rows = {}
  for i = 1, RT.RMAX + 1 do f.rows[i] = addRow(f, i) end
  return f
end

-- Draws each line into its row; rows past the last line are hidden.
function RT.DrawRows(f, lines)
  for i, row in ipairs(f.rows) do
    row.left:SetShown(lines[i] ~= nil) row.right:SetShown(lines[i] ~= nil)
    if lines[i] then paintLine(row, lines[i]) end
  end
end

-- Draws the roster: shown while it is open, hidden otherwise.
function RT.PaintRoster()
  local f = RT.rframe
  if not f then return end
  local show = RT.rosterOpen == true
  f:SetShown(show)
  if not show then return end
  local lines = RT.Fit(RT.RosterLines())
  f:SetHeight(#lines * RT.RLINE + 2 * RT.RPAD)
  RT.DrawRows(f, lines)
end

-- The events that change a line: the group, roles, and your own death or return.
RT.ROSTER_EVENTS = { "GROUP_ROSTER_UPDATE", "PLAYER_ROLES_ASSIGNED", "PLAYER_DEAD", "PLAYER_ALIVE", "PLAYER_UNGHOST" }
-- The unit events that change a line: a member going offline or changing flags.
RT.ROSTER_UNIT_EVENTS = { "UNIT_CONNECTION", "UNIT_FLAGS" }

-- Draws the roster on the next frame, once however many events come in before then.
function RT.SoonPaint()
  ns.Soon("raid roster", RT.PaintRoster)
end

-- A unit event: drawn again only for you or a group member (a mob's or a nameplate's flags change all fight).
function RT.SoonPaintMember(_, unit)
  if type(unit) ~= "string" then return end
  if unit == "player" or unit:find("^raid%d") or unit:find("^party%d") then RT.SoonPaint() end
end

-- Starts or stops listening to the group: the roster hears events only while it is open.
function RT.WatchRoster(on)
  local sign = on and ns.On or ns.Off
  for _, event in ipairs(RT.ROSTER_EVENTS) do sign(event, RT.SoonPaint) end
  for _, event in ipairs(RT.ROSTER_UNIT_EVENTS) do sign(event, RT.SoonPaintMember) end
end

-- Opens or closes the roster, listening to the group only while it is open.
function RT.ToggleRoster()
  RT.rframe = RT.rframe or RT.BuildRoster()
  RT.rosterOpen = not RT.rosterOpen
  RT.WatchRoster(RT.rosterOpen)
  RT.PaintRoster()
end

-- The card on the Raid frames page: the button that opens and closes the roster.
function RT.RosterRows()
  return {
    { "header", L["Raid roster"] },
    { "button", L["Show or hide the roster"], RT.ToggleRoster },
  }
end
ns.Options.AddRows("raid", RT.RosterRows)

-- Repaints the roster when the theme changes.
T.OnChanged(RT.PaintRoster)
