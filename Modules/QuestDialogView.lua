-- The quest dialog's panel (Modules/QuestDialog.lua decides what it shows):
-- a header with the NPC's portrait, name and the quest title; a scrolling
-- body with the text, objectives and numbered lines; a row of reward cards;
-- the money and XP line, and the buttons. Keys: 1-9 pick, Space presses the
-- main button, Escape says goodbye.

local ADDON, ns = ...

local T = ns.Theme
local QP = ns.QuestParts
local QD = ns.GetModule("QuestDialog")

-- Building -------------------------------------------------------------------------------------

-- The NPC's portrait, name, and the quest title along the top.
local function addHeader(f)
  f.portrait = f:CreateTexture(nil, "ARTWORK")
  f.portrait:SetSize(40, 40)
  f.portrait:SetPoint("TOPLEFT", f, "TOPLEFT", 10, -10)
  f.npc = T.Text(f:CreateFontString(nil, "OVERLAY"), "heading", "text")
  f.npc:SetPoint("TOPLEFT", f.portrait, "TOPRIGHT", 10, -2)
  f.title = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "gold")
  f.title:SetPoint("TOPLEFT", f.npc, "BOTTOMLEFT", 0, -4)
  -- Your faction's crest, faint, behind the top-right corner.
  f.crest = T.Crest(f, 96, "BORDER", 0.1)
  f.crest:SetPoint("TOPRIGHT", f, "TOPRIGHT", -12, -6)
end

-- Scrolls the body by the mouse wheel, within its range.
local function onWheel(scroll, delta)
  local range = ns.PlainNumber(scroll:GetVerticalScrollRange()) or 0
  scroll:SetVerticalScroll(math.max(0, math.min(range, (scroll:GetVerticalScroll() or 0) - delta * 24)))
end

-- A text in the body, the body's width, wrapping.
local function bodyText(child, color)
  local fs = T.Text(child:CreateFontString(nil, "OVERLAY"), "label", color)
  fs:SetWidth(QD.W - 40)
  fs:SetJustifyH("LEFT")
  return fs
end

-- The scrolling body: the text, the objectives under it, then the numbered lines.
local function addBody(f)
  f.scroll = CreateFrame("ScrollFrame", nil, f)
  f.scroll:SetPoint("TOPLEFT", f, "TOPLEFT", 12, -60)
  f.scroll:SetSize(QD.W - 24, QD.BODY_H)
  f.scroll:SetScript("OnMouseWheel", onWheel)
  f.child = CreateFrame("Frame", nil, f.scroll)
  f.child:SetSize(QD.W - 24, QD.BODY_H)
  f.scroll:SetScrollChild(f.child)
  f.text, f.objectives = bodyText(f.child, "text"), bodyText(f.child, "text2")
  f.text:SetPoint("TOPLEFT", f.child, "TOPLEFT", 4, -2)
  f.objectives:SetPoint("TOPLEFT", f.text, "BOTTOMLEFT", 0, -8)
end

-- The reward cards' row, the money and XP line, and the buttons along the bottom.
local function addFooter(f)
  f.rewards = CreateFrame("Frame", nil, f)
  f.rewards:SetPoint("TOPLEFT", f.scroll, "BOTTOMLEFT", 0, -8)
  f.rewards:SetSize(QD.W - 24, 2 * QP.CARD_H + QP.GAP)
  f.lines, f.cards = QP.Pool(f.child, QP.Line), QP.Pool(f.rewards, QP.Card)
  f.money = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "gold")
  f.money:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", 14, 16)
  f.primary = ns.DialogButton(f, "", 120)
  f.primary:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -12, 10)
  f.secondary = ns.DialogButton(f, "", 100)
  f.secondary:SetPoint("RIGHT", f.primary, "LEFT", -8, 0)
end

-- Builds the dialog (hidden), movable, closed by Escape.
function QD.Build()
  local f = T.Panel(CreateFrame("Frame", "ForeverUI_QuestDialog", UIParent), { alpha = 0.96, shadow = true })
  f:SetSize(QD.W, QD.H)
  f:SetFrameStrata("DIALOG")
  ns.Mover(f, "questdialog", "Quest dialog", { "BOTTOM", "BOTTOM", 0, 250 })
  addHeader(f)
  addBody(f)
  addFooter(f)
  QD.frame = f
  QD.Wire(f)
end

-- Clicks, keys and closing.
function QD.Wire(f)
  f:Hide()
  f:SetScript("OnHide", QD.OnHide)
  f:SetScript("OnKeyDown", QD.OnKey)
  f.primary:SetScript("OnClick", QD.Press)
  f.secondary:SetScript("OnClick", function() QD.page.secondary[2]() end)
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, "ForeverUI_QuestDialog") end
end

-- Drawing --------------------------------------------------------------------------------------

-- The numbered lines under the text (gossip and greeting pages).
local function renderLines(f, lines)
  f.lines.Reset()
  local prev = f.objectives:IsShown() and f.objectives or f.text
  for i, spec in ipairs(lines or {}) do
    local b = f.lines.Next()
    b:SetPoint("TOPLEFT", prev, "BOTTOMLEFT", 0, i == 1 and -10 or 0)
    b:SetWidth(QD.W - 40)
    QP.PaintLine(b, i, spec)
    b:SetScript("OnClick", function() QD.SelectLine(i) end)
    prev = b
  end
end

-- The text and objectives, then the lines; scrolled back to the top.
local function renderBody(f, p)
  f.text:SetText(QP.Plain(p.text))
  f.objectives:SetShown(p.objectives ~= nil)
  f.objectives:SetText(p.objectives and ("Objectives:  " .. QP.Plain(p.objectives)) or "")
  renderLines(f, p.lines)
  f.scroll:SetVerticalScroll(0)
end

-- One reward card's clicks and tooltip.
local function wireCard(c)
  c:SetScript("OnClick", function(self) if self.item.kind == "choice" then QD.Pick(self.item.index) end end)
  c:SetScript("OnEnter", function(self) QD.ItemTooltip(self) end)
  c:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
end

-- Every item the page lists: the choices first, then what you get anyway.
local function pageItems(p)
  local out = {}
  for _, list in ipairs({ p.choices or {}, p.rewards or {} }) do
    for _, item in ipairs(list) do out[#out + 1] = item end
  end
  return out
end

-- Sizes the dialog to its reward rows (none on a gossip page).
local function fitHeight(f, count)
  local rows = math.ceil(count / QD.PER_ROW)
  f:SetHeight(QD.H - (2 - math.min(rows, 2)) * (QP.CARD_H + QP.GAP))
end

-- The reward cards, three to a row.
local function renderCards(f, p)
  f.cards.Reset()
  fitHeight(f, #pageItems(p))
  for n, item in ipairs(pageItems(p)) do
    local c, col, row = f.cards.Next(), (n - 1) % QD.PER_ROW, math.floor((n - 1) / QD.PER_ROW)
    c:SetPoint("TOPLEFT", f.rewards, "TOPLEFT", col * (QP.CARD_W + QP.GAP), -row * (QP.CARD_H + QP.GAP))
    QP.PaintCard(c, item)
    wireCard(c)
    QD.MarkCard(c, false)
  end
end

-- A button from { label, action, enabled } (enabled unless false), or hidden for nil.
local function renderButton(b, spec)
  b:SetShown(spec ~= nil)
  if not spec then return end
  b.text:SetText(spec[1])
  if spec[3] == false then b:Disable() else b:Enable() end
end

-- Everything on a page.
function QD.Render(p)
  local f = QD.frame
  if type(SetPortraitTexture) == "function" then SetPortraitTexture(f.portrait, "npc") end
  f.npc:SetText(QP.Plain(QD.Call(UnitName, "npc")))
  f.title:SetText(QP.Plain(p.title))
  renderBody(f, p)
  renderCards(f, p)
  f.money:SetText(p.money or "")
  renderButton(f.primary, p.primary)
  renderButton(f.secondary, p.secondary)
end

-- Choosing -------------------------------------------------------------------------------------

-- A card's "picked" wash (made the first time), shown or hidden.
function QD.MarkCard(c, on)
  if not c.picked then
    c.picked = T.Tint(c:CreateTexture(nil, "BACKGROUND", nil, 2), "accent", 0.3)
    c.picked:SetAllPoints()
  end
  c.picked:SetShown(on)
end

-- Picks reward choice n: marks its card and lets Complete through. True when there was one to pick.
function QD.Pick(n)
  if not QD.page.pick or not (QD.page.choices or {})[n] then return false end
  QD.choice = n
  for i = 1, QD.frame.cards.used do
    local c = QD.frame.cards[i]
    QD.MarkCard(c, c.item.kind == "choice" and c.item.index == n)
  end
  QD.frame.primary:Enable()
  return true
end

-- Selects line n (a quest or a gossip option), if the page shows it. True when it did.
function QD.SelectLine(n)
  local b = n <= QD.frame.lines.used and QD.frame.lines[n]
  if not (b and b.spec) then return false end
  b.spec.select()
  return true
end

-- Presses the main button, if it's enabled (Complete once a reward is picked).
function QD.Press()
  local spec = QD.page and QD.page.primary
  local ready = spec and (spec[3] ~= false or (QD.page.pick and QD.choice ~= nil))
  if ready then spec[2]() end
end

-- The item's tooltip by its card.
function QD.ItemTooltip(c)
  local tip = GameTooltip
  if not tip or type(tip.SetQuestItem) ~= "function" then return end
  tip:SetOwner(c, "ANCHOR_RIGHT")
  tip:SetQuestItem(c.item.kind, c.item.index)
  tip:Show()
end

-- What a key does here: 1-9 pick a line (or a reward) that exists, Space
-- presses the main button. True when the key was used.
local function useKey(key)
  local n = tonumber(key)
  if n and n >= 1 and n <= 9 then
    if QD.page.pick then return QD.Pick(n) end
    return QD.SelectLine(n)
  end
  if key == "SPACE" then QD.Press() return true end
  return false
end

-- Keys the dialog doesn't use go on to the game (you can still move and use your bars).
function QD.OnKey(f, key)
  local handled = useKey(key)
  if not ns.InCombat() and ns.Client.Has("keyPropagate") then f:SetPropagateKeyboardInput(not handled) end
end
