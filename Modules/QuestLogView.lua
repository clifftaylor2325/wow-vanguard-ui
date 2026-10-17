-- The quest log window (Modules/QuestLog.lua gathers the quests): the list
-- on the left (zone headers you can fold, then the quests), the chosen
-- quest on the right (title, text, objectives, reward cards, money and XP),
-- and its buttons along the bottom. Both columns scroll in the one scroll view
-- (ns.ScrollView), and the chosen quest's line shows the one selected look (W.Row).

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets
local QP = ns.QuestParts
local QL = ns.GetModule("QuestLog")

QL.W, QL.H, QL.LIST_W, QL.PER_ROW = 640, 440, 230, 2

-- The gaps on the details side: under the title, under the text, above the reward cards, around the money line.
local TITLE_GAP, TEXT_GAP, REWARDS_GAP, MONEY_GAP = T.SPACE.gap, 10, T.SPACE.col, 6

-- Layout --------------------------------------------------------------------------------------------

-- Where the columns start, down from the window's top: the title line and a pad under it.
local TOP = T.CONTROL.inset + T.SPACE.pad
-- The room the details buttons take along the bottom: a pad, the buttons and a gap over them.
local FOOT = T.SPACE.pad + T.BUTTON_H + T.SPACE.gap
-- The list, from the window's left pad to its bottom pad; the details, down to the buttons.
local LIST_X, LIST_H, DETAIL_H = T.SPACE.pad, QL.H - TOP - T.SPACE.pad, QL.H - TOP - FOOT
-- The details column: right of the list, the list's scroll thumb and a gutter; two reward cards wide.
local DETAIL_X = LIST_X + QL.LIST_W + 2 * T.SPACE.col
local DETAIL_W = QL.PER_ROW * (QP.CARD_W + QP.GAP) - QP.GAP
-- A zone header sits ZONE_X in from the list's edge (over the quests' icons) and ZONE_GAP under the quests above it.
local ZONE_X, ZONE_GAP = T.SPACE.gap, T.SPACE.gap

-- Building ----------------------------------------------------------------------------------------

-- A scrolling column on the window, w wide and h tall under the title line: its scroll view and the child its contents sit on.
local function scrollArea(f, x, w, h)
  local view = ns.ScrollView(f, { width = w })
  view:SetPoint("TOPLEFT", f, "TOPLEFT", x, -TOP)
  view:SetSize(w, h)
  return view, view.child
end

-- The title with the quest count and the close button along the top (Escape closes the window too), the corner
-- brackets, and the crest behind the top-right corner.
local function addTop(f)
  f.count = ns.WindowTitle(f, "Quest log", { count = "", onClose = function() f:Hide() end, escape = true }).count
  T.Ornament(f, "corners")
  QP.Watermark(f)
end

-- A text on the details side, wrapping to its width.
local function detailText(child, role, color)
  local fs = T.Text(child:CreateFontString(nil, "OVERLAY"), role, color)
  fs:SetWidth(DETAIL_W)
  fs:SetJustifyH("LEFT")
  return fs
end

-- The details side: the quest's title, text and objectives, then its reward cards.
local function addDetails(f)
  f.detailScroll, f.detail = scrollArea(f, DETAIL_X, DETAIL_W, DETAIL_H)
  f.questTitle, f.text = detailText(f.detail, "heading", "gold"), detailText(f.detail, "label", "text")
  f.objectives, f.money = detailText(f.detail, "label", "text2"), detailText(f.detail, "label", "gold")
  f.questTitle:SetPoint("TOPLEFT", f.detail, "TOPLEFT", 0, 0)
  f.text:SetPoint("TOPLEFT", f.questTitle, "BOTTOMLEFT", 0, -TITLE_GAP)
  f.objectives:SetPoint("TOPLEFT", f.text, "BOTTOMLEFT", 0, -TEXT_GAP)
  f.rewards = CreateFrame("Frame", nil, f.detail)
  f.rewards:SetSize(DETAIL_W, 1)
  f.cards = QP.Pool(f.rewards, QP.Card)
end

-- The buttons along the bottom of the details side.
QL.BUTTONS = { { "track", "Track", QL.ToggleTrack }, { "share", "Share", QL.Share }, { "abandon", "Abandon", QL.Abandon }, { "map", "Map", QL.ShowOnMap } }

-- The details buttons' gap and width: all of them span the details column exactly.
QL.BUTTON_GAP = T.SPACE.gap
QL.BUTTON_W = (DETAIL_W - (#QL.BUTTONS - 1) * QL.BUTTON_GAP) / #QL.BUTTONS

-- One details button: it runs its action on the chosen quest. Abandon is the danger kind.
local function addButton(f, spec, x)
  local b = ns.DialogButton(f, spec[2], QL.BUTTON_W, spec[1] == "abandon" and "danger" or nil)
  b:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", DETAIL_X + x, T.SPACE.pad)
  b:SetScript("OnClick", ns.Guard("click quest log button", function() if QL.details then spec[3](QL.details) end end))
  f.buttons[spec[1]] = b
end

-- A zone header made on demand: a collapsible section header (capitals and a chevron); a click folds the
-- zone it shows or opens it.
local function makeZone(parent)
  local zone
  zone = W.SectionHeader(parent, "", { collapsible = true, width = QL.LIST_W - ZONE_X, onToggle = function(folded) QL.Fold(zone.zone, folded) end })
  return zone
end

-- Builds the window (hidden, opaque), movable, closed by Escape.
function QL.Build()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_QuestLog", UIParent), { alpha = T.ALPHA.opaque, shadow = true })
  f:SetSize(QL.W, QL.H)
  f:SetFrameStrata("HIGH")
  ns.Mover(f, "questlog", "Quest log", { "CENTER", "CENTER", -200, 40 })
  addTop(f)
  f.listScroll, f.list = scrollArea(f, LIST_X, QL.LIST_W, LIST_H)
  f.lines, f.zones, f.buttons = QP.Pool(f.list, QP.Line), QP.Pool(f.list, makeZone), {}
  addDetails(f)
  QL.frame = f
  QL.Finish(f)
end

-- Where the details buttons that are not Abandon start (units from the column's left): they end at its right edge.
local RIGHT_X = DETAIL_W - (#QL.BUTTONS - 1) * QL.BUTTON_W - (#QL.BUTTONS - 2) * QL.BUTTON_GAP

-- The details buttons: Abandon alone at the far left of the details column, the others in a row ending at its
-- right edge (the footer rule of docs/THEME.md); the window starts hidden.
function QL.Finish(f)
  local i = 0
  for _, spec in ipairs(QL.BUTTONS) do
    local far = spec[1] == "abandon"
    addButton(f, spec, far and 0 or RIGHT_X + i * (QL.BUTTON_W + QL.BUTTON_GAP))
    if not far then i = i + 1 end
  end
  f:Hide()
end

-- The list ----------------------------------------------------------------------------------------

-- A quest line was clicked: show the quest; Shift-click also tracks or untracks it.
local function pickQuest(id)
  QL.Select(id)
  if IsShiftKeyDown() and QL.details then QL.ToggleTrack(QL.details) end
end

-- Folds a zone's quests away (or opens them again) and redraws the list.
function QL.Fold(zone, folded)
  QL.collapsed[zone] = folded or nil
  QL.Refresh()
end

-- A quest's line: its title in the level's color (a check when ready to turn in); a click shows it.
local function questSpec(e)
  return { id = e.id, text = QP.Titled(e.level, e.title, e.id), icon = e.ready and T.Icon("Check") or nil, color = { QP.LevelColor(e.level) }, select = function() pickQuest(e.id) end }
end

-- A zone header at y (ZONE_GAP lower unless it is the first): its name in capitals, its chevron folded or open;
-- returns where the next entry starts.
local function paintZone(f, e, y)
  y = y > 0 and y + ZONE_GAP or y
  local zone = f.zones.Next()
  zone.zone = e.title
  zone:SetText(QP.Plain(e.title))
  zone:SetCollapsed(QL.collapsed[e.title] == true)
  zone:SetPoint("TOPLEFT", f.list, "TOPLEFT", ZONE_X, -y)
  zone:Show()
  return y + zone:GetHeight()
end

-- A quest line at y, the list's width (no numbers in the log); returns where the next entry starts.
local function paintQuest(f, e, y, i)
  local b, spec = f.lines.Next(), questSpec(e)
  b:SetPoint("TOPLEFT", f.list, "TOPLEFT", 0, -y)
  b:SetWidth(QL.LIST_W)
  QP.PaintLine(b, i, spec)
  b.text:SetText(spec.text)
  b:SetScript("OnClick", ns.Guard("click quest log line", function(self) self.spec.select() end))
  return y + QP.LINE_H
end

-- Lays the entries out from the top, a zone header or a quest line each; returns how tall the list is.
local function paintList(f, entries)
  local y = 0
  for i, e in ipairs(entries) do y = (e.header and paintZone or paintQuest)(f, e, y, i) end
  return y
end

-- The id of the first quest among the entries (nil when there is none).
local function firstQuest(entries)
  for _, e in ipairs(entries) do
    if e.id then return e.id end
  end
end

-- Redraws the list, and shows the chosen quest (the first one when none is chosen yet).
function QL.Refresh()
  local f, entries = QL.frame, QL.Entries()
  f.count:SetText(QL.Count() .. " quests")
  f.lines.Reset()
  f.zones.Reset()
  f.listScroll:Fit(paintList(f, entries))
  QL.Select(QL.selected or firstQuest(entries))
end

-- Details -----------------------------------------------------------------------------------------

-- The reward cards under the objectives, two to a row, then the money line.
local function renderRewards(f, d)
  f.cards.Reset()
  f.rewards:SetPoint("TOPLEFT", f.objectives, "BOTTOMLEFT", 0, -REWARDS_GAP)
  for n, item in ipairs(d.rewards) do
    local c, col, row = f.cards.Next(), (n - 1) % QL.PER_ROW, math.floor((n - 1) / QL.PER_ROW)
    c:SetPoint("TOPLEFT", f.rewards, "TOPLEFT", col * (QP.CARD_W + QP.GAP), -row * (QP.CARD_H + QP.GAP))
    QP.PaintCard(c, item)
  end
  local rows = math.ceil(#d.rewards / QL.PER_ROW)
  f.money:SetPoint("TOPLEFT", f.rewards, "TOPLEFT", 0, -rows * (QP.CARD_H + QP.GAP) - MONEY_GAP)
  f.money:SetText(d.money)
end

-- The objectives as lines: "- 3/8 Wolves slain", each marked done or not.
local function objectivesText(d)
  local lines = {}
  for _, o in ipairs(d.objectives) do lines[#lines + 1] = (o.done and "+ " or "- ") .. o.text end
  return #lines > 0 and ("Objectives\n" .. table.concat(lines, "\n")) or ""
end

-- The details buttons: Track or Untrack, Share only when you can.
local function renderButtons(f, d)
  for _, b in pairs(f.buttons) do b:SetShown(d ~= nil) end
  if not d then return end
  f.buttons.track.text:SetText(d.watched and "Untrack" or "Track")
  if d.shareable then f.buttons.share:Enable() else f.buttons.share:Disable() end
end

-- Marks the chosen quest's line in the list.
local function markChosen(f)
  for i = 1, f.lines.used do
    local b = f.lines[i]
    QP.Mark(b, b.spec.id ~= nil and b.spec.id == QL.selected)
  end
end

-- How tall the details side's contents are: title, text, objectives, reward rows and the money line, with their gaps.
local function detailHeight(f, d)
  local rows = math.ceil(#d.rewards / QL.PER_ROW)
  local h = f.questTitle:GetStringHeight() + TITLE_GAP + f.text:GetStringHeight() + TEXT_GAP + f.objectives:GetStringHeight() + REWARDS_GAP
  return h + rows * (QP.CARD_H + QP.GAP) + MONEY_GAP + f.money:GetStringHeight() + MONEY_GAP
end

-- Fills the details side with a quest and sizes its scroll to fit.
local function renderDetails(f, d)
  f.questTitle:SetText(QP.Titled(d.level, d.title, d.id))
  f.text:SetText(QP.Plain(d.text))
  f.objectives:SetText(objectivesText(d))
  renderRewards(f, d)
  f.detailScroll:Fit(detailHeight(f, d))
end

-- Shows a quest on the details side (or nothing, when it's gone from the log).
-- Another quest starts at the top; the same one, redrawn, keeps its scroll.
function QL.Select(id)
  local f, d = QL.frame, id and QL.Details(id)
  local changed = id ~= QL.selected
  QL.selected, QL.details = d and id or nil, d
  if changed then f.detailScroll:ScrollTo(0) end
  markChosen(f)
  f.detail:SetShown(d ~= nil)
  renderButtons(f, d)
  if d then renderDetails(f, d) end
end
