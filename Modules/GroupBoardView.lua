-- The group board's window (Modules/GroupBoard.lua reads the posts): a title
-- with the count, a filter button (all posts, looking for more, looking for a
-- group, needs my role: posts that need your role first, the rest dimmed) and
-- the "only for my level" switch, then a row per post, newest first:
-- the kind, the dungeon and its level range (in its difficulty color), the roles
-- named, who posted and how long ago. Hover a row for the whole line; click it
-- to open a whisper with a message filled in. /vg lfg opens and closes it.

local ADDON, ns = ...

local L = ns.L

local T, W = ns.Theme, ns.Widgets
local QP = ns.QuestParts
local GB = ns.GetModule("GroupBoard")

-- The board's inset from its edges (T.SPACE.pad, a floating window's), how far across a row its cells run (the
-- kind's left edge to the age's right edge) and how far in the first cell sits, which the note lines up with.
local PAD, SPAN, INDENT = T.SPACE.pad, 436, 2
-- Where the filter row starts, down from the top (a column under the title's line), where the rows start (a gap
-- under its buttons), and the room under the rows for the note's two lines of small text and the hint's two
-- (a translation of the hint wraps onto a second line).
local FILTER_TOP = T.CONTROL.inset + T.SPACE.col
local BODY_TOP = FILTER_TOP + T.BUTTON_H + T.SPACE.gap
local NOTE_H, HINT_H = 24, 24

-- The board's width and height (the rows are T.ROW.height tall), the rows shown at most and the seconds between age updates.
GB.W, GB.ROW_H, GB.ROWS, GB.AGE_EVERY = SPAN + 2 * PAD, T.ROW.height, 10, 10
GB.H = BODY_TOP + GB.ROWS * GB.ROW_H + T.SPACE.tight + NOTE_H + T.SPACE.gap + HINT_H + PAD
-- The filter button's choices in order, and its caption for each.
GB.FILTERS = {
  all = { "LFM", L["All posts"] }, LFM = { "LFG", L["Looking for more"] }, LFG = { "role", L["Looking for a group"] },
  role = { "all", L["Needs my role"] },
}
-- The row's cells drawn in the text colour (the kind and the dungeon have colours of their own).
GB.PLAIN_CELLS = { "roles", "sender", "age" }

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

-- A post's row (W.Row: a faint wash under the mouse): kind, dungeon, roles, sender, age.
local function makeRow(parent)
  local b = W.Row(parent, GB.ROW_H, { width = SPAN })
  b.kind, b.dungeon, b.roles = cell(b, INDENT, 34, "small"), cell(b, 40, 164), cell(b, 208, 92, "small")
  b.sender, b.age = cell(b, 304, 82), cell(b, 388, 48, "small")
  b:SetScript("OnClick", ns.Guard("click group board row", function(self) GB.Whisper(self.entry) end))
  b:SetScript("OnEnter", GB.RowTooltip)
  b:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  return b
end

-- The title, the count and the close button along the top (ns.WindowTitle: a window's title; Escape closes the board).
local function addTop(f)
  f.count = ns.WindowTitle(f, L["Group board"], { count = "", onClose = function() f:Hide() end, escape = true }).count
end

-- The filter button and the "only for my level" switch under the title.
local function addFilters(f)
  f.filter = W.Button(f, GB.FILTERS.all[2], function() GB.CycleFilter() end, 150)
  f.filter:SetPoint("TOPLEFT", f, "TOPLEFT", PAD, -FILTER_TOP)
  f.mine = W.Check(f, L["Only dungeons for my level"], function() return GB.settings.mine end,
    function(v) GB.settings.mine = v GB.Refresh() end, 250)
  f.mine:SetPoint("LEFT", f.filter, "RIGHT", T.SPACE.gap, 0)
end

-- The rows' area and the line under the last row (a count or status: small text2).
local function addBody(f)
  f.body = CreateFrame("Frame", nil, f)
  f.body:SetPoint("TOPLEFT", f, "TOPLEFT", PAD, -BODY_TOP)
  f.body:SetSize(SPAN, GB.ROWS * GB.ROW_H)
  f.rows = QP.Pool(f.body, makeRow)
  f.note = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "text2")
  f.note:SetPoint("TOPLEFT", f.body, "BOTTOMLEFT", INDENT, -T.SPACE.tight)
  f.note:SetWidth(SPAN - INDENT)
end

-- The hint along the bottom: a note (small muted), wrapped inside the board's width.
local function addHint(f)
  f.hint = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "muted")
  f.hint:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", PAD, PAD)
  f.hint:SetWidth(SPAN)
  f.hint:SetJustifyH("LEFT")
  f.hint:SetText(L["Click a post to open a whisper with a message filled in. Nothing is sent until you press Enter."])
end

-- Every few seconds while the board shows: the ages move on and old posts go.
local function ageTick(f, dt)
  f.vgWait = (f.vgWait or 0) - dt
  if f.vgWait > 0 then return end
  f.vgWait = GB.AGE_EVERY
  GB.Refresh()
end

-- Builds the board (hidden), movable, closed by Escape; at a dialog's opacity (T.ALPHA.dialog), since a click hands you to the chat box.
function GB.Build()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_GroupBoard", UIParent), { alpha = T.ALPHA.dialog, shadow = true })
  f:SetSize(GB.W, GB.H)
  f:SetFrameStrata("HIGH")
  ns.Mover(f, "groupboard", L["Group board"], { "CENTER", "CENTER", 220, 60 })
  addTop(f)
  addFilters(f)
  addBody(f)
  addHint(f)
  GB.frame = f
  GB.Finish(f)
end

-- The age tick while it shows; the board starts hidden.
function GB.Finish(f)
  f:SetScript("OnUpdate", ageTick)
  f:Hide()
end

-- Rows -----------------------------------------------------------------------------------------

-- "now" under a minute, else "4m".
function GB.Age(e, now)
  local minutes = math.floor((now - e.time) / 60)
  return minutes < 1 and L["now"] or ns.Format(L["{minutes}m"], { minutes = minutes })
end

-- "Shadowfang Keep 22-30", or "Any dungeon" for a post that names none.
local function dungeonText(e)
  if not e.dungeon then return L["Any dungeon"] end
  if e.dungeon.min == e.dungeon.max then return string.format("%s %d", e.dungeon.name, e.dungeon.min) end
  return string.format("%s %d-%d", e.dungeon.name, e.dungeon.min, e.dungeon.max)
end

-- "Tank, Healer", or "" when the post names no role.
local function rolesText(e)
  local names = {}
  for _, role in ipairs(e.roles) do names[#names + 1] = GB.ROLE_NAMES[role] end
  return table.concat(names, ", ")
end

-- The dungeon's difficulty color, or text2 for a post that names none.
local function dungeonColor(e)
  if not e.dungeon then return "text2" end
  return QP.LevelColor(math.floor((e.dungeon.min + e.dungeon.max) / 2))
end

-- A row's colors: the kind in the accent (LFM) or info blue (LFG), the dungeon in its difficulty color, the
-- rest in the text color; every cell muted for a post that Needs my role dims.
local function paintColors(b, e)
  local dim = GB.Dimmed(e)
  T.Color(b.kind, dim and "muted" or (e.kind == "LFM" and "accent" or "info"))
  T.Color(b.dungeon, dim and "muted" or dungeonColor(e))
  for _, key in ipairs(GB.PLAIN_CELLS) do T.Color(b[key], dim and "muted" or "text") end
end

-- Fills a row from a post (paintColors colors it).
function GB.PaintRow(b, e, now)
  b.entry = e
  b.kind:SetText(e.kind)
  b.dungeon:SetText(dungeonText(e))
  paintColors(b, e)
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
  local r, g, bl = T.RGB("white")
  tip:AddLine(b.entry.text, r, g, bl, true)
  tip:AddLine(T.Paint(L["Click: whisper with a message filled in"], "text2"))
  tip:Show()
end

-- Under the rows: "+3 more" when they don't all fit, or why the board is empty.
local function noteText(shown, total)
  if shown > GB.ROWS then return ns.Format(L["+{count} more"], { count = shown - GB.ROWS }) end
  if shown > 0 then return "" end
  if total > 0 then return L["No posts match. Show all posts, or turn off Only dungeons for my level."] end
  return ns.Format(L["No posts yet. {summary} More: /vg lfg probe."], { summary = GB.Summary() })
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
  f.count:SetText(ns.Format(L["{count} posts"], { count = #shown }))
  paintRows(f, shown, now)
  f.note:SetText(noteText(#shown, #GB.entries))
end

-- A new post came in: redraw on the next frame while the board shows (a burst is one redraw).
function GB.Changed()
  if GB.frame and GB.frame:IsShown() then ns.Soon("groupboard", GB.Refresh) end
end

-- The filter button: all posts, then looking for more, then looking for a group, then needs my role.
function GB.CycleFilter()
  GB.filter = GB.FILTERS[GB.filter][1]
  GB.frame.filter.text:SetText(GB.FILTERS[GB.filter][2])
  GB.Refresh()
end

-- Opens or closes the board (built the first time); says so when the module is off.
function GB.Toggle()
  if not GB.settings then return ns.Chat(L["The group board is off (/vg > Modules)."]) end
  if not GB.frame then GB.Build() end
  if GB.frame:IsShown() then return GB.frame:Hide() end
  GB.frame:Show()
  GB.Refresh()
end
