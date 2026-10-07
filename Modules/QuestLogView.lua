-- The quest log window (Modules/QuestLog.lua gathers the quests): the list
-- on the left (zone headers you can fold, then the quests), the chosen
-- quest on the right (title, text, objectives, reward cards, money and XP),
-- and its buttons along the bottom.

local ADDON, ns = ...

local T = ns.Theme
local QP = ns.QuestParts
local QL = ns.GetModule("QuestLog")

QL.W, QL.H, QL.LIST_W, QL.PER_ROW = 640, 440, 230, 2

-- The gaps on the details side: under the title, under the text, above the reward cards, around the money line.
local TITLE_GAP, TEXT_GAP, REWARDS_GAP, MONEY_GAP = 8, 10, 12, 6

-- Building ----------------------------------------------------------------------------------------

-- A scrolling area on the window: its scroll frame and the child its contents sit on.
local function scrollArea(f, x, w)
  local scroll = CreateFrame("ScrollFrame", nil, f)
  scroll:SetPoint("TOPLEFT", f, "TOPLEFT", x, -40)
  scroll:SetSize(w, QL.H - 84)
  local child = CreateFrame("Frame", nil, scroll)
  child:SetSize(w, QL.H - 84)
  scroll:SetScrollChild(child)
  scroll:EnableMouseWheel(true)
  scroll:SetScript("OnMouseWheel", QP.Wheel)
  return scroll, child
end

-- Sizes a scroll area's child to its contents (never shorter than the view) and
-- keeps the scroll inside the new range (a zone folded away shortens the list).
local function fitScroll(scroll, child, height)
  child:SetHeight(math.max(height, scroll:GetHeight()))
  scroll:SetVerticalScroll(math.min(scroll:GetVerticalScroll() or 0, child:GetHeight() - scroll:GetHeight()))
end

-- The title, the quest count and the close button along the top.
local function addTop(f)
  f.title = T.Text(f:CreateFontString(nil, "OVERLAY"), "title", "text")
  f.title:SetPoint("TOPLEFT", f, "TOPLEFT", 14, -12)
  f.title:SetText("Quest log")
  f.count = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "text2")
  f.count:SetPoint("LEFT", f.title, "RIGHT", 10, 0)
  f.close = T.PlaceClose(T.CloseButton(CreateFrame("Button", nil, f)), f)
  f.close:SetScript("OnClick", function() f:Hide() end)
end

-- A text on the details side, wrapping to its width.
local function detailText(child, role, color)
  local fs = T.Text(child:CreateFontString(nil, "OVERLAY"), role, color)
  fs:SetWidth(QL.W - QL.LIST_W - 50)
  fs:SetJustifyH("LEFT")
  return fs
end

-- The details side: the quest's title, text and objectives, then its reward cards.
local function addDetails(f)
  f.detailScroll, f.detail = scrollArea(f, QL.LIST_W + 26, QL.W - QL.LIST_W - 40)
  f.questTitle, f.text = detailText(f.detail, "heading", "gold"), detailText(f.detail, "label", "text")
  f.objectives, f.money = detailText(f.detail, "label", "text2"), detailText(f.detail, "label", "gold")
  f.questTitle:SetPoint("TOPLEFT", f.detail, "TOPLEFT", 0, 0)
  f.text:SetPoint("TOPLEFT", f.questTitle, "BOTTOMLEFT", 0, -8)
  f.objectives:SetPoint("TOPLEFT", f.text, "BOTTOMLEFT", 0, -10)
  f.rewards = CreateFrame("Frame", nil, f.detail)
  f.rewards:SetSize(QL.W - QL.LIST_W - 40, 1)
  f.cards = QP.Pool(f.rewards, QP.Card)
end

-- The details buttons' width and the gap between them: four span the details column exactly, so the last keeps the window's margin.
QL.BUTTON_W, QL.BUTTON_GAP = 88, 6

-- The buttons along the bottom of the details side.
QL.BUTTONS = { { "track", "Track", QL.ToggleTrack }, { "share", "Share", QL.Share }, { "abandon", "Abandon", QL.Abandon }, { "map", "Map", QL.ShowOnMap } }

-- One details button: it runs its action on the chosen quest.
local function addButton(f, spec, x)
  local b = ns.DialogButton(f, spec[2], QL.BUTTON_W)
  b:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", QL.LIST_W + 26 + x, 12)
  b:SetScript("OnClick", function() if QL.details then spec[3](QL.details) end end)
  f.buttons[spec[1]] = b
end

-- Builds the window (hidden), movable, closed by Escape.
function QL.Build()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_QuestLog", UIParent), { alpha = 0.97, shadow = true })
  f:SetSize(QL.W, QL.H)
  f:SetFrameStrata("HIGH")
  ns.Mover(f, "questlog", "Quest log", { "CENTER", "CENTER", -200, 40 })
  addTop(f)
  f.listScroll, f.list = scrollArea(f, 12, QL.LIST_W)
  f.lines, f.buttons = QP.Pool(f.list, QP.Line), {}
  addDetails(f)
  QL.frame = f
  QL.Finish(f)
end

-- The details buttons; the window starts hidden, and Escape closes it.
function QL.Finish(f)
  for i, spec in ipairs(QL.BUTTONS) do addButton(f, spec, (i - 1) * (QL.BUTTON_W + QL.BUTTON_GAP)) end
  f:Hide()
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, "Vanguard_QuestLog") end
end

-- The list ----------------------------------------------------------------------------------------

-- A list line for a zone header (folds its quests) or a quest (shows it).
local function lineSpec(e)
  if e.header then
    return { text = QP.Plain(e.title), icon = T.Icon(QL.collapsed[e.title] and "Right" or "Down"), color = "gold",
      select = function() QL.collapsed[e.title] = not QL.collapsed[e.title] QL.Refresh() end }
  end
  return { id = e.id, text = QP.Titled(e.level, e.title), icon = e.ready and T.Icon("Check") or nil, color = { QP.LevelColor(e.level) }, select = function() QL.Select(e.id) end }
end

-- One list line (quests indented under their zone; no numbers in the log).
local function paintEntry(f, i, e)
  local b, spec = f.lines.Next(), lineSpec(e)
  b:SetPoint("TOPLEFT", f.list, "TOPLEFT", e.header and 0 or 10, -(i - 1) * QP.LINE_H)
  b:SetWidth(QL.LIST_W - 10)
  QP.PaintLine(b, i, spec)
  b.text:SetText(spec.text)
  b:SetScript("OnClick", function(self) self.spec.select() end)
end

-- Redraws the list, and shows the chosen quest (the first one when none is chosen yet).
function QL.Refresh()
  local f, first = QL.frame, nil
  f.count:SetText(QL.Count() .. " quests")
  f.lines.Reset()
  local entries = QL.Entries()
  for i, e in ipairs(entries) do
    paintEntry(f, i, e)
    first = first or e.id
  end
  fitScroll(f.listScroll, f.list, #entries * QP.LINE_H)
  QL.Select(QL.selected or first)
end

-- Details -----------------------------------------------------------------------------------------

-- The reward cards under the objectives, two to a row, then the money line.
local function renderRewards(f, d)
  f.cards.Reset()
  f.rewards:SetPoint("TOPLEFT", f.objectives, "BOTTOMLEFT", 0, -12)
  for n, item in ipairs(d.rewards) do
    local c, col, row = f.cards.Next(), (n - 1) % QL.PER_ROW, math.floor((n - 1) / QL.PER_ROW)
    c:SetPoint("TOPLEFT", f.rewards, "TOPLEFT", col * (QP.CARD_W + QP.GAP), -row * (QP.CARD_H + QP.GAP))
    QP.PaintCard(c, item)
  end
  local rows = math.ceil(#d.rewards / QL.PER_ROW)
  f.money:SetPoint("TOPLEFT", f.rewards, "TOPLEFT", 0, -rows * (QP.CARD_H + QP.GAP) - 6)
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
  f.questTitle:SetText(QP.Titled(d.level, d.title))
  f.text:SetText(QP.Plain(d.text))
  f.objectives:SetText(objectivesText(d))
  renderRewards(f, d)
  fitScroll(f.detailScroll, f.detail, detailHeight(f, d))
end

-- Shows a quest on the details side (or nothing, when it's gone from the log).
-- Another quest starts at the top; the same one, redrawn, keeps its scroll.
function QL.Select(id)
  local f, d = QL.frame, id and QL.Details(id)
  local changed = id ~= QL.selected
  QL.selected, QL.details = d and id or nil, d
  if changed then f.detailScroll:SetVerticalScroll(0) end
  markChosen(f)
  f.detail:SetShown(d ~= nil)
  renderButtons(f, d)
  if d then renderDetails(f, d) end
end
