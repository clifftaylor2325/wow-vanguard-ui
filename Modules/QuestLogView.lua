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
-- What the list says when you have no quests, pointing to where they come from.
QL.EMPTY = "No quests yet. Quest givers show a ! over their heads."

-- The gaps on the details side: under the title, under the text, above the reward cards, around the money line.
local TITLE_GAP, TEXT_GAP, REWARDS_GAP, MONEY_GAP = T.SPACE.gap, T.SPACE.col, T.SPACE.col, T.SPACE.gap

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
-- An objective row's check mark (square) and progress bar (height), in units.
local OBJECTIVE_MARK, OBJECTIVE_BAR = 14, 3

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

-- One objective row's label (between the mark and the count, on one line) and its thin progress bar along the bottom.
local function addObjectiveLabel(row)
  row.label = T.Text(row:CreateFontString(nil, "OVERLAY"), "label", "text")
  row.label:SetPoint("LEFT", row.mark, "RIGHT", T.SPACE.gap, 0)
  row.label:SetPoint("RIGHT", row.count, "LEFT", -T.SPACE.gap, 0)
  row.label:SetJustifyH("LEFT")
  row.label:SetWordWrap(false)
  row.bar = T.BarColor(T.StyleBar(CreateFrame("StatusBar", nil, row)), "accent")
  row.bar:SetPoint("BOTTOMLEFT", row, "BOTTOMLEFT", 0, 0)
  row.bar:SetSize(DETAIL_W, OBJECTIVE_BAR)
  return row
end

-- An objective row made on demand: a check when done, the objective, its count at the right edge and a progress bar.
local function makeObjective(parent)
  local row = CreateFrame("Frame", nil, parent)
  row:SetSize(DETAIL_W, QP.LINE_H)
  row.mark = T.Tint(QP.Square(row:CreateTexture(nil, "ARTWORK"), OBJECTIVE_MARK), "good")
  row.mark:SetTexture(T.Icon("Check"))
  row.mark:SetPoint("LEFT", row, "LEFT", 0, 0)
  row.count = T.Text(row:CreateFontString(nil, "OVERLAY"), "label", "text2")
  row.count:SetPoint("RIGHT", row, "RIGHT", 0, 0)
  return addObjectiveLabel(row)
end

-- The objectives under their header: a box the rows stack in, and the quest history line under it.
local function addObjectives(f)
  f.objectives, f.history = detailText(f.detail, "label", "text2"), detailText(f.detail, "label", "text2")
  f.needs = detailText(f.detail, "label", "text2")
  f.objectives:SetPoint("TOPLEFT", f.text, "BOTTOMLEFT", 0, -TEXT_GAP)
  f.objectiveBox = CreateFrame("Frame", nil, f.detail)
  f.objectiveBox:SetSize(DETAIL_W, 1)
  f.objectiveRows = QP.Pool(f.objectiveBox, makeObjective)
end

-- The details side: the quest's title, text and objectives, then its reward cards.
local function addDetails(f)
  f.detailScroll, f.detail = scrollArea(f, DETAIL_X, DETAIL_W, DETAIL_H)
  f.questTitle, f.text = detailText(f.detail, "heading", "gold"), detailText(f.detail, "label", "text")
  f.money = detailText(f.detail, "label", "gold")
  f.questTitle:SetPoint("TOPLEFT", f.detail, "TOPLEFT", 0, 0)
  f.text:SetPoint("TOPLEFT", f.questTitle, "BOTTOMLEFT", 0, -TITLE_GAP)
  addObjectives(f)
  f.rewards = CreateFrame("Frame", nil, f.detail)
  f.rewards:SetSize(DETAIL_W, 1)
  f.cards, f.captions = QP.Pool(f.rewards, QP.Card), QP.Pool(f.rewards, QP.Caption)
  f.lay = { holder = f.rewards, cards = f.cards, captions = f.captions, perRow = QL.PER_ROW }
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

-- The quest list's scroll area, its line and zone pools, and the line an empty log shows instead.
local function addList(f)
  f.listScroll, f.list = scrollArea(f, LIST_X, QL.LIST_W, LIST_H)
  f.lines, f.zones, f.buttons = QP.Pool(f.list, QP.Line), QP.Pool(f.list, makeZone), {}
  f.empty = T.Text(f.list:CreateFontString(nil, "OVERLAY"), "label", "muted")
  f.empty:SetPoint("TOPLEFT", f.list, "TOPLEFT", 0, 0)
  f.empty:SetWidth(QL.LIST_W)
  f.empty:SetJustifyH("LEFT")
  f.empty:SetText(QL.EMPTY)
end

-- Builds the window (hidden, opaque), movable, closed by Escape.
function QL.Build()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_QuestLog", UIParent), { alpha = T.ALPHA.opaque, shadow = true })
  f:SetSize(QL.W, QL.H)
  f:SetFrameStrata("HIGH")
  ns.Mover(f, "questlog", "Quest log", { "CENTER", "CENTER", -200, 40 })
  addTop(f)
  addList(f)
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

-- A quest line was clicked: Ctrl-click marks or unmarks it for Abandon; else show the quest, and
-- Shift-click also tracks or untracks it.
local function pickQuest(id)
  if IsControlKeyDown() then QL.marked[id] = not QL.marked[id] or nil return QL.Select(QL.selected) end
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
  local xp = QL.XP(e.id)
  b.xp:SetText(xp > 0 and QP.XPText(xp) or "")
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
  f.empty:SetShown(#entries == 0)
  f.lines.Reset()
  f.zones.Reset()
  f.listScroll:Fit(paintList(f, entries))
  QL.Select(QL.selected or firstQuest(entries))
end

-- Details -----------------------------------------------------------------------------------------

-- A quest's reward items split into its choices and what it gives anyway, in their order.
local function splitRewards(rewards)
  local choices, fixed = {}, {}
  for _, item in ipairs(rewards) do table.insert(item.kind == "choice" and choices or fixed, item) end
  return choices, fixed
end

-- The reward sections under the objectives, each caption over its cards two to a row, then the money line.
local function renderRewards(f, d)
  f.rewards:SetPoint("TOPLEFT", f.history, "BOTTOMLEFT", 0, -REWARDS_GAP)
  local choices, fixed = splitRewards(d.rewards)
  f.rewardsH = QP.LayoutRewards(f.lay, QP.RewardSections(choices, fixed, false))
  f.money:SetPoint("TOPLEFT", f.rewards, "TOPLEFT", 0, -f.rewardsH - (f.rewardsH > 0 and QP.GAP or 0) - MONEY_GAP)
  f.money:SetText(d.money)
end

-- Fills a row's progress bar from its count ("3/8"): shown while the objective is not done.
local function paintProgress(row, count, done)
  local have, need = (count or ""):match("^(%d+)/(%d+)$")
  row.bar:SetMinMaxValues(0, math.max(tonumber(need) or 1, 1))
  row.bar:SetValue(tonumber(have) or 0)
  row.bar:SetShown(have ~= nil and not done)
end

-- Fills an objective row from { text, done }: a check and muted text when done, else the text, its count and a bar.
local function paintObjective(row, o)
  local label, count = QP.SplitCount(o.text)
  row.label:SetText(label)
  row.count:SetText(count or "")
  T.Color(row.label, o.done and "text2" or "text")
  row.mark:SetShown(o.done == true)
  paintProgress(row, count, o.done)
  row:Show()
end

-- Places the objectives box under its header, the needs line under the box and the history line under that,
-- each with its gap only when there is something to separate; returns the gaps added.
local function placeObjectives(f, rows, needs, history)
  local boxGap = rows > 0 and T.SPACE.tight or 0
  local needsGap, historyGap = needs ~= "" and TITLE_GAP or 0, history ~= "" and TITLE_GAP or 0
  f.objectiveBox:SetPoint("TOPLEFT", f.objectives, "BOTTOMLEFT", 0, -boxGap)
  f.needs:SetPoint("TOPLEFT", f.objectiveBox, "BOTTOMLEFT", 0, -needsGap)
  f.history:SetPoint("TOPLEFT", f.needs, "BOTTOMLEFT", 0, -historyGap)
  return boxGap + needsGap + historyGap
end

-- The objectives' header: "Objectives" over their rows, "Failed" in the danger colour for a quest that failed
-- (its rows left out), nothing for a quest without objectives.
local function objectivesHeader(f, d, rows)
  f.objectives:SetText(d.failed and "Failed" or rows > 0 and "Objectives" or "")
  T.Color(f.objectives, d.failed and "bad" or "text2")
end

-- One row per objective in the objectives box, which takes their height.
local function renderObjectiveRows(f, shown)
  f.objectiveRows.Reset()
  for i, o in ipairs(shown) do
    local row = f.objectiveRows.Next()
    row:SetPoint("TOPLEFT", f.objectiveBox, "TOPLEFT", 0, -(i - 1) * QP.LINE_H)
    paintObjective(row, o)
  end
  f.objectiveBox:SetHeight(#shown * QP.LINE_H)
end

-- The objectives as rows under their header, then the needs line and the quest history line under them.
local function renderObjectives(f, d)
  local shown = d.failed and {} or d.objectives
  renderObjectiveRows(f, shown)
  objectivesHeader(f, d, #shown)
  QP.PaintNeeds(f.needs, d.needs or "", d.short)
  f.history:SetText(d.done or "")
  f.objectiveGaps = placeObjectives(f, #shown, d.needs or "", d.done or "")
end

-- The details buttons: Track or Untrack, Share only when you can.
local function renderButtons(f, d)
  for _, b in pairs(f.buttons) do b:SetShown(d ~= nil) end
  if not d then return end
  f.buttons.track.text:SetText(d.watched and "Untrack" or "Track")
  local marked = QL.MarkedCount()
  f.buttons.abandon.text:SetText(marked > 0 and ("Abandon " .. marked) or "Abandon")
  if d.shareable then f.buttons.share:Enable() else f.buttons.share:Disable() end
end

-- Marks the chosen quest's line in the list.
local function markChosen(f)
  for i = 1, f.lines.used do
    local b = f.lines[i]
    QP.Mark(b, b.spec.id ~= nil and (b.spec.id == QL.selected or QL.marked[b.spec.id] == true))
  end
end

-- How tall the details side's contents are: title, text, objectives, reward rows and the money line, with their gaps.
-- Read after renderObjectives and renderRewards, which leave f.objectiveGaps and f.rewardsH.
local function detailHeight(f)
  local h = f.questTitle:GetStringHeight() + TITLE_GAP + f.text:GetStringHeight() + TEXT_GAP + f.objectives:GetStringHeight() + f.objectiveBox:GetHeight() + f.objectiveGaps + f.needs:GetStringHeight() + f.history:GetStringHeight() + REWARDS_GAP
  return h + f.rewardsH + (f.rewardsH > 0 and QP.GAP or 0) + MONEY_GAP + f.money:GetStringHeight() + MONEY_GAP
end

-- Fills the details side with a quest and sizes its scroll to fit.
local function renderDetails(f, d)
  f.questTitle:SetText(QP.Titled(d.level, d.title, d.id))
  f.text:SetText(QP.Plain(d.text))
  renderObjectives(f, d)
  renderRewards(f, d)
  f.detailScroll:Fit(detailHeight(f))
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
