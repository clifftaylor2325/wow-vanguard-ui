-- The group board's window (Modules/GroupBoard.lua reads the posts): a title
-- with the count, a filter button (all posts, looking for more, looking for a
-- group) and the "only for my level" switch, then a row per post, newest first:
-- the kind, the dungeon and its level range (in its difficulty color), the roles
-- named, who posted and how long ago. Hover a row for the whole line; click it
-- to open a whisper with a message filled in. /vg lfg opens and closes it.

local ADDON, ns = ...

local T = ns.Theme
local QP = ns.QuestParts
local GB = ns.GetModule("GroupBoard")

GB.W, GB.H, GB.ROW_H, GB.ROWS, GB.AGE_EVERY = 460, 330, 20, 10, 10
-- The filter button's choices in order, and its caption for each.
GB.FILTERS = { all = { "LFM", "All posts" }, LFM = { "LFG", "Looking for more" }, LFG = { "all", "Looking for a group" } }

-- Building -------------------------------------------------------------------------------------

-- One cell of a row: a font string from `x` across, `w` wide, cut to one line.
local function cell(row, x, w, role)
  local fs = T.Text(row:CreateFontString(nil, "OVERLAY"), role or "label", "text")
  fs:SetPoint("LEFT", row, "LEFT", x, 0)
  fs:SetWidth(w)
  fs:SetJustifyH("LEFT")
  fs:SetWordWrap(false)
  return fs
end

-- A post's row: kind, dungeon, roles, sender, age; a faint wash under the mouse.
local function makeRow(parent)
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(GB.W - 24, GB.ROW_H)
  b.kind, b.dungeon, b.roles = cell(b, 2, 34, "small"), cell(b, 40, 176), cell(b, 220, 92, "small")
  b.sender, b.age = cell(b, 316, 88), cell(b, 406, 30, "small")
  b.hover = T.Tint(b:CreateTexture(nil, "HIGHLIGHT"), "hover")
  b.hover:SetAllPoints()
  b:SetScript("OnClick", ns.Guard("click group board row", function(self) GB.Whisper(self.entry) end))
  b:SetScript("OnEnter", GB.RowTooltip)
  b:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  return b
end

-- The title, the count and the close button along the top.
local function addTop(f)
  f.title = T.Text(f:CreateFontString(nil, "OVERLAY"), "title", "text")
  f.title:SetPoint("LEFT", f, "TOPLEFT", 14, -T.CONTROL.inset)
  f.title:SetText("Group board")
  f.count = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "text2")
  f.count:SetPoint("LEFT", f.title, "RIGHT", 10, 0)
  f.close = T.PlaceClose(T.CloseButton(CreateFrame("Button", nil, f)), f)
  f.close:SetScript("OnClick", ns.Guard("click close group board", function() f:Hide() end))
end

-- The filter button and the "only for my level" switch under the title.
local function addFilters(f)
  f.filter = ns.Widgets.Button(f, GB.FILTERS.all[2], function() GB.CycleFilter() end, 150)
  f.filter:SetPoint("TOPLEFT", f, "TOPLEFT", 12, -36)
  f.mine = ns.Widgets.Check(f, "Only dungeons for my level", function() return GB.settings.mine end,
    function(v) GB.settings.mine = v GB.Refresh() end, 250)
  f.mine:SetPoint("LEFT", f.filter, "RIGHT", 12, 0)
end

-- The rows' area, the line under the last row, and the hint along the bottom.
local function addBody(f)
  f.body = CreateFrame("Frame", nil, f)
  f.body:SetPoint("TOPLEFT", f, "TOPLEFT", 12, -70)
  f.body:SetSize(GB.W - 24, GB.ROWS * GB.ROW_H)
  f.rows = QP.Pool(f.body, makeRow)
  f.note = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "text2")
  f.note:SetPoint("TOPLEFT", f.body, "BOTTOMLEFT", 2, -6)
  f.note:SetWidth(GB.W - 28)
  f.hint = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "muted")
  f.hint:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", 14, 12)
  f.hint:SetText("Click a post to open a whisper with a message filled in. Nothing is sent until you press Enter.")
end

-- Every few seconds while the board shows: the ages move on and old posts go.
local function ageTick(f, dt)
  f.vgWait = (f.vgWait or 0) - dt
  if f.vgWait > 0 then return end
  f.vgWait = GB.AGE_EVERY
  GB.Refresh()
end

-- Builds the board (hidden), movable, closed by Escape.
function GB.Build()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_GroupBoard", UIParent), { alpha = 0.97, shadow = true })
  f:SetSize(GB.W, GB.H)
  f:SetFrameStrata("HIGH")
  ns.Mover(f, "groupboard", "Group board", { "CENTER", "CENTER", 220, 60 })
  addTop(f)
  addFilters(f)
  addBody(f)
  GB.frame = f
  GB.Finish(f)
end

-- The age tick while it shows; the board starts hidden, and Escape closes it.
function GB.Finish(f)
  f:SetScript("OnUpdate", ageTick)
  f:Hide()
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, "Vanguard_GroupBoard") end
end

-- Rows -----------------------------------------------------------------------------------------

-- "now" under a minute, else "4m".
function GB.Age(e, now)
  local minutes = math.floor((now - e.time) / 60)
  return minutes < 1 and "now" or (minutes .. "m")
end

-- "Shadowfang Keep 22-30", or "Any dungeon" for a post that names none.
local function dungeonText(e)
  if not e.dungeon then return "Any dungeon" end
  if e.dungeon.min == e.dungeon.max then return string.format("%s %d", e.dungeon.name, e.dungeon.min) end
  return string.format("%s %d-%d", e.dungeon.name, e.dungeon.min, e.dungeon.max)
end

-- "Tank, Healer", or "" when the post names no role.
local function rolesText(e)
  local names = {}
  for _, role in ipairs(e.roles) do names[#names + 1] = GB.ROLE_NAMES[role] end
  return table.concat(names, ", ")
end

-- Fills a row from a post: the kind in the accent (LFM) or info blue (LFG), the dungeon in its difficulty color.
function GB.PaintRow(b, e, now)
  b.entry = e
  b.kind:SetText(e.kind)
  T.Color(b.kind, e.kind == "LFM" and "accent" or "info")
  b.dungeon:SetText(dungeonText(e))
  if e.dungeon then T.Color(b.dungeon, QP.LevelColor(math.floor((e.dungeon.min + e.dungeon.max) / 2))) else T.Color(b.dungeon, "text2") end
  b.roles:SetText(rolesText(e))
  b.sender:SetText((e.sender:match("^[^%-]+")))
  b.age:SetText(GB.Age(e, now))
  b:Show()
end

-- The whole line, who posted it (with the realm or ruleset part) and what a click does.
function GB.RowTooltip(b)
  local tip = GameTooltip
  if not tip or not b.entry then return end
  tip:SetOwner(b, "ANCHOR_RIGHT")
  tip:SetText(b.entry.sender)
  tip:AddLine(b.entry.text, 1, 1, 1, true)
  tip:AddLine(T.Paint("Click: whisper with a message filled in", "text2"))
  tip:Show()
end

-- Under the rows: "+3 more" when they don't all fit, or why the board is empty.
local function noteText(shown, total)
  if shown > GB.ROWS then return "+" .. (shown - GB.ROWS) .. " more" end
  if shown > 0 then return "" end
  if total > 0 then return "No posts match. Show all posts, or turn off Only dungeons for my level." end
  return "No posts yet. " .. GB.Summary() .. " More: /vg lfg probe."
end

-- The rows that fit, from the top.
local function paintRows(f, shown, now)
  f.rows.Reset()
  for i = 1, math.min(#shown, GB.ROWS) do
    local b = f.rows.Next()
    b:SetPoint("TOPLEFT", f.body, "TOPLEFT", 0, -(i - 1) * GB.ROW_H)
    GB.PaintRow(b, shown[i], now)
  end
end

-- Redraws the board, if it is built: old posts go, then the rows that fit and the line under them.
function GB.Refresh()
  local f = GB.frame
  if not f then return end
  local now = GetTime()
  GB.Prune(now)
  local shown = GB.Shown()
  f.count:SetText(#shown .. " posts")
  paintRows(f, shown, now)
  f.note:SetText(noteText(#shown, #GB.entries))
end

-- A new post came in: redraw on the next frame while the board shows (a burst is one redraw).
function GB.Changed()
  if GB.frame and GB.frame:IsShown() then ns.Soon("groupboard", GB.Refresh) end
end

-- The filter button: all posts, then looking for more, then looking for a group.
function GB.CycleFilter()
  GB.filter = GB.FILTERS[GB.filter][1]
  GB.frame.filter.text:SetText(GB.FILTERS[GB.filter][2])
  GB.Refresh()
end

-- Opens or closes the board (built the first time); says so when the module is off.
function GB.Toggle()
  if not GB.settings then return ns.Chat("The group board is off (/vg > Modules).") end
  if not GB.frame then GB.Build() end
  if GB.frame:IsShown() then return GB.frame:Hide() end
  GB.frame:Show()
  GB.Refresh()
end
