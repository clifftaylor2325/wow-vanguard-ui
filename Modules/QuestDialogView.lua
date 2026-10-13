-- The quest dialog's panel (Modules/QuestDialog.lua decides what it shows):
-- a header with the NPC's portrait, name and the quest title; a scrolling
-- body with the text, objectives and numbered lines; a row of reward cards;
-- the money and XP line, and the buttons. Keys: 1-9 pick, Space presses the
-- main button, Escape says goodbye.

local ADDON, ns = ...

local T = ns.Theme
local QP = ns.QuestParts
local QD = ns.GetModule("QuestDialog")

-- The body's gaps: around its content, above the objectives, above the numbered lines.
local BODY_PAD, OBJECTIVES_GAP, LINES_GAP = 2, 8, 10
-- The panel's fixed parts: the header above the body, the gap above the reward
-- cards, the footer (money and buttons) under them; and where the text starts
-- across (the body's 12 plus the text's 4), which the cards and money line up with.
local HEADER_H, CARDS_GAP, FOOTER_H, INSET = 60, 8, 44, 16

-- Building -------------------------------------------------------------------------------------

-- The NPC's portrait on an inset square that frames it, with a quest mark on
-- the square instead when there is no portrait to draw (see paintPortrait).
local function addPortrait(f)
  local box = T.Panel(CreateFrame("Frame", nil, f), { inset = true, noSheen = true })
  box:SetSize(40, 40)
  box:SetPoint("TOPLEFT", f, "TOPLEFT", 10, -10)
  f.portrait = box:CreateTexture(nil, "ARTWORK")
  f.portrait:SetPoint("TOPLEFT", box, "TOPLEFT", 1, -1)
  f.portrait:SetPoint("BOTTOMRIGHT", box, "BOTTOMRIGHT", -1, 1)
  f.placeholder = QP.Square(box:CreateTexture(nil, "ARTWORK"), 24)
  f.placeholder:SetTexture(T.Icon("Quests"))
  f.placeholder:SetPoint("CENTER", box, "CENTER", 0, 0)
  f.portraitBox = box
end

-- The NPC's portrait, name, and the quest title along the top.
local function addHeader(f)
  addPortrait(f)
  f.npc = T.Text(f:CreateFontString(nil, "OVERLAY"), "heading", "text")
  f.npc:SetPoint("TOPLEFT", f.portraitBox, "TOPRIGHT", 10, -2)
  f.title = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "gold")
  f.title:SetPoint("TOPLEFT", f.npc, "BOTTOMLEFT", 0, -4)
  -- Your faction's crest, faint, behind the top-right corner.
  f.crest = T.Crest(f, 96, "BORDER", 0.1)
  f.crest:SetPoint("TOPRIGHT", f, "TOPRIGHT", -12, -6)
end

-- A text in the body, the body's width, wrapping.
local function bodyText(child, color)
  local fs = T.Text(child:CreateFontString(nil, "OVERLAY"), "label", color)
  fs:SetWidth(QD.W - 40)
  fs:SetJustifyH("LEFT")
  return fs
end

-- The scroll frame for the body (the wheel scrolls it) and the child its contents sit on.
local function addScroll(f)
  f.scroll = CreateFrame("ScrollFrame", nil, f)
  f.scroll:SetPoint("TOPLEFT", f, "TOPLEFT", 12, -HEADER_H)
  f.scroll:SetSize(QD.W - 24, QD.MAX_H - HEADER_H - FOOTER_H)
  f.scroll:EnableMouseWheel(true)
  f.scroll:SetScript("OnMouseWheel", QP.Wheel)
  f.child = CreateFrame("Frame", nil, f.scroll)
  f.child:SetSize(QD.W - 24, QD.MAX_H - HEADER_H - FOOTER_H)
  f.scroll:SetScrollChild(f.child)
end

-- The scrolling body: the text, the objectives under it, then the numbered lines.
local function addBody(f)
  addScroll(f)
  f.text, f.objectives = bodyText(f.child, "text"), bodyText(f.child, "text2")
  f.text:SetPoint("TOPLEFT", f.child, "TOPLEFT", 4, -2)
  f.objectives:SetPoint("TOPLEFT", f.text, "BOTTOMLEFT", 0, -8)
end

-- The reward cards under the text (their left edge on the text's), the money
-- and XP line, and the buttons along the bottom.
local function addFooter(f)
  f.rewards = CreateFrame("Frame", nil, f)
  f.rewards:SetPoint("TOPLEFT", f.scroll, "BOTTOMLEFT", INSET - 12, -CARDS_GAP)
  f.rewards:SetSize(QD.PER_ROW * (QP.CARD_W + QP.GAP) - QP.GAP, QP.CARD_H)
  f.lines, f.cards = QP.Pool(f.child, QP.Line), QP.Pool(f.rewards, QP.Card)
  f.money = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "gold")
  f.money:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", INSET, 16)
  f.primary = ns.DialogButton(f, "", 120)
  f.primary:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -12, 10)
  f.secondary = ns.DialogButton(f, "", 100)
  f.secondary:SetPoint("RIGHT", f.primary, "LEFT", -8, 0)
end

-- The dialog's default spot: centered, a little above the focus cast bar's
-- default spot (the top of the cluster around your character), so the panel
-- grows upward clear of your frames, the cast bars and the action bars.
function QD.DefaultPoint()
  local cast = ns.GetModule("CastBars").LAYOUT.focus
  return { "BOTTOM", "BOTTOM", 0, cast.point[4] + cast.h + 8 }
end

-- Builds the dialog (hidden, at its greatest height until a page sizes it), movable, closed by Escape.
function QD.Build()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_QuestDialog", UIParent), { alpha = 0.96, shadow = true })
  f:SetSize(QD.W, QD.MAX_H)
  f:SetFrameStrata("DIALOG")
  ns.Mover(f, "questdialog", "Quest dialog", QD.DefaultPoint())
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
  f.primary:SetScript("OnClick", ns.Guard("click quest dialog primary", QD.Press))
  f.secondary:SetScript("OnClick", ns.Guard("click quest dialog secondary", function() QD.page.secondary[2]() end))
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, "Vanguard_QuestDialog") end
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
    b:SetScript("OnClick", ns.Guard("click quest dialog line", function() QD.SelectLine(i) end))
    prev = b
  end
end

-- How tall the body's contents are: the text, the objectives under it, then the lines.
local function bodyHeight(f, lineCount)
  local h = BODY_PAD + f.text:GetStringHeight()
  if f.objectives:IsShown() then h = h + OBJECTIVES_GAP + f.objectives:GetStringHeight() end
  if lineCount > 0 then h = h + LINES_GAP + lineCount * QP.LINE_H end
  return h + BODY_PAD
end

-- The text and objectives, then the lines, scrolled back to the top; returns how tall they are.
local function renderBody(f, p)
  f.text:SetText(QP.Plain(p.text))
  f.objectives:SetShown(p.objectives ~= nil)
  f.objectives:SetText(p.objectives and ("Objectives:  " .. QP.Plain(p.objectives)) or "")
  renderLines(f, p.lines)
  f.scroll:SetVerticalScroll(0)
  return bodyHeight(f, #(p.lines or {}))
end

-- One reward card's clicks (its tooltip is the card's own, QP.WireTooltip).
local function wireCard(c)
  c:SetScript("OnClick", ns.Guard("click quest reward choice", function(self) if self.item.kind == "choice" then QD.Pick(self.item.index) end end))
end

-- Every item the page lists: the choices first, then what you get anyway.
local function pageItems(p)
  local out = {}
  for _, list in ipairs({ p.choices or {}, p.rewards or {} }) do
    for _, item in ipairs(list) do out[#out + 1] = item end
  end
  return out
end

-- How tall the reward cards' rows are with the gap above them (none on a page without rewards).
local function cardsHeight(count)
  local rows = math.ceil(count / QD.PER_ROW)
  if rows == 0 then return 0 end
  return CARDS_GAP + rows * QP.CARD_H + (rows - 1) * QP.GAP
end

-- The reward cards, three to a row, from the text's left edge; returns how many.
local function renderCards(f, p)
  f.cards.Reset()
  local items = pageItems(p)
  for n, item in ipairs(items) do
    local c, col, row = f.cards.Next(), (n - 1) % QD.PER_ROW, math.floor((n - 1) / QD.PER_ROW)
    c:SetPoint("TOPLEFT", f.rewards, "TOPLEFT", col * (QP.CARD_W + QP.GAP), -row * (QP.CARD_H + QP.GAP))
    QP.PaintCard(c, item)
    wireCard(c)
    QD.MarkCard(c, false)
  end
  return #items
end

-- Sizes the panel to its page, between its least and greatest height: the body
-- gets what the header, the cards and the footer leave (at least its contents'
-- height while the panel stays under its greatest), and the wheel scrolls the rest.
local function fitPanel(f, content, cards)
  local fixed = HEADER_H + cards + FOOTER_H
  local view = math.max(QD.MIN_H - fixed, math.min(content, QD.MAX_H - fixed))
  f.scroll:SetHeight(view)
  f.child:SetHeight(math.max(view, content))
  f:SetHeight(fixed + view)
end

-- A button from { label, action, enabled } (enabled unless false), or hidden for nil.
local function renderButton(b, spec)
  b:SetShown(spec ~= nil)
  if not spec then return end
  b.text:SetText(spec[1])
  if spec[3] == false then b:Disable() else b:Enable() end
end

-- The NPC's portrait when the client can draw one (it has the call, and there
-- is an NPC: not for a quest started from an item), else the quest mark in the accent.
local function paintPortrait(f)
  local drawn = type(SetPortraitTexture) == "function" and QD.Call(UnitExists, "npc") == true
  if drawn then SetPortraitTexture(f.portrait, "npc") end
  f.portrait:SetShown(drawn)
  f.placeholder:SetShown(not drawn)
  T.Tint(f.placeholder, "accent")
end

-- Everything on a page, the panel sized to it.
function QD.Render(p)
  local f = QD.frame
  paintPortrait(f)
  f.npc:SetText(QP.Plain(QD.Call(UnitName, "npc")))
  f.title:SetText(QP.Plain(p.title))
  local content = renderBody(f, p)
  fitPanel(f, content, cardsHeight(renderCards(f, p)))
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
