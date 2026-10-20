-- Parts shared by Vanguard's quest windows (the quest dialog, and the quest
-- log): numbered lines for quests and gossip (W.Row lines, with Vanguard's quest
-- marks), reward cards with the item's icon, count and name in a border of its
-- quality color, and the faint crest behind a reading window's corner.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local QP = {}
ns.QuestParts = QP

-- A line is a list row tall; a reward card is CARD_W by CARD_H (a quality border, the icon, a two-line name);
-- GAP is the gap between cards (and between a card's icon and its edge).
QP.LINE_H, QP.CARD_W, QP.CARD_H, QP.GAP = T.ROW.height, 172, 36, T.SPACE.tight
-- Vanguard's quest marks, not the game's gossip icons: a "!" for a quest you can take, a "?" for one you can
-- turn in and the same "?" for one still in progress (QP.PaintLine tints them: gold, gold, muted).
QP.ICONS = { available = T.Icon("QuestBang"), ready = T.Icon("QuestQuery"), active = T.Icon("QuestQuery") }
-- How big a line's icon is, and how far the watermark crest sits down from the window's top (it sits
-- T.SPACE.col in from the right).
local ICON_SIZE, WATERMARK_DROP = 16, 6

-- Text ---------------------------------------------------------------------------------------

-- Text the client may hide: plain text, else "…" (hidden text is never compared or joined).
function QP.Plain(text)
  if ns.IsSecret(text) then return "…" end
  return type(text) == "string" and text or ""
end

-- r, g, b for a quest of this level, from the game's difficulty colors; the theme's text otherwise.
function QP.LevelColor(level)
  local c = type(GetQuestDifficultyColor) == "function" and ns.PlainNumber(level) and GetQuestDifficultyColor(level)
  if type(c) == "table" and c.r then return c.r, c.g, c.b end
  return T.RGB("text")
end

-- A title (plain, else "…") with Quest guidance's "New" mark after it when the quest is new in WoW Forever.
function QP.WithMark(title, questID)
  local QG = ns.QuestGuide
  return QP.Plain(title) .. (QG and questID and QG.Mark(questID) or "")
end

-- "[12] Title" (just the title for a quest without a level), marked new when it is (QP.WithMark).
function QP.Titled(level, title, questID)
  level = ns.PlainNumber(level)
  if level and level > 0 then return string.format("[%d] %s", level, QP.WithMark(title, questID)) end
  return QP.WithMark(title, questID)
end

-- "1,250 XP" for a quest's XP reward (a whole number, thousands set apart).
function QP.XPText(xp)
  local s, n = tostring(math.floor(xp)), 1
  while n > 0 do s, n = s:gsub("^(-?%d+)(%d%d%d)", "%1,%2") end
  return s .. " XP"
end

-- The money the open quest asks for to hand it in (copper): 0 for none, and 0 when the client can't say or
-- hides it (the game's own reward button asks before paying when this is above 0).
function QP.Cost()
  local cost = type(GetQuestMoneyToGet) == "function" and ns.PlainNumber(GetQuestMoneyToGet())
  return cost or 0
end

-- Lines ----------------------------------------------------------------------------------------

-- An objective's text split into its label and its count ("Wolves slain: 3/8" or "3/8 Wolves slain" give
-- "Wolves slain", "3/8"); the count is nil when it has none. The quest log and the tracker both show it so.
function QP.SplitCount(text)
  local label, count = text:match("^(.-):?%s*(%d+/%d+)$")
  if not count then count, label = text:match("^(%d+/%d+)%s+(.+)$") end
  return label and label ~= "" and label or text, count
end

-- A texture sized square; returns it.
function QP.Square(t, size)
  t:SetSize(size, size)
  return t
end

-- Gives a line its XP text, muted at the right edge (empty unless a window fills it); the line's text stops short of it.
local function addXP(b)
  b.xp = T.Text(b:CreateFontString(nil, "OVERLAY"), "small", "text2")
  b.xp:SetPoint("RIGHT", b, "RIGHT", -T.SPACE.gap, 0)
  b.text:SetPoint("RIGHT", b.xp, "LEFT", -T.SPACE.tight, 0)
  b.text:SetWordWrap(false)
  return b
end

-- A clickable line: a W.Row (a faint wash under the mouse, the rail and wash of a chosen line) holding an
-- icon, then its text.
function QP.Line(parent)
  local b = W.Row(parent, QP.LINE_H)
  b.icon = QP.Square(b:CreateTexture(nil, "ARTWORK"), ICON_SIZE)
  b.icon:SetPoint("LEFT", b, "LEFT", T.SPACE.gap, 0)
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "label", "text")
  b.text:SetPoint("LEFT", b.icon, "RIGHT", T.SPACE.gap, 0)
  b.text:SetJustifyH("LEFT")
  return addXP(b)
end

-- Marks a line as the chosen one (the row's accent rail and wash), or clears it.
function QP.Mark(b, on)
  b:SetSelected(on)
end

-- The tint of a line's icon: a quest mark by its state (QP.ICONS), gold for a quest to take and one to turn in
-- and muted for one in progress (the same "?", told apart by its line's gold); white for any other icon.
local function iconTint(spec)
  if not spec.quest then return "white" end
  if spec.icon == QP.ICONS.available then return "gold" end
  return spec.color == "gold" and "gold" or "muted"
end

-- Fills a line from { text, icon, color = { r, g, b } or token, select, quest }; number n before the text.
function QP.PaintLine(b, n, spec)
  b.text:SetText(n .. ".  " .. spec.text)
  if type(spec.color) == "table" then T.Color(b.text, spec.color[1], spec.color[2], spec.color[3]) else T.Color(b.text, spec.color or "text") end
  b.icon:SetTexture(spec.icon)
  T.Tint(b.icon, iconTint(spec))
  b.icon:SetShown(spec.icon ~= nil)
  b.spec = spec
  b:Show()
end

-- Reward cards ---------------------------------------------------------------------------------

-- The crown's size on the reward choice that sells for most.
QP.CROWN_SIZE = 12

-- A card's crown: the gold mark in its top-right corner for the choice that sells for most, hidden until
-- the layout picks one (the upgrade arrow keeps the icon's top-left). Returns the card.
local function addCrown(c)
  c.crown = T.Tint(QP.Square(c:CreateTexture(nil, "OVERLAY"), QP.CROWN_SIZE), "gold")
  c.crown:SetTexture(T.Icon("Crown"))
  c.crown:SetPoint("TOPRIGHT", c, "TOPRIGHT", -2, -2)
  c.crown:Hide()
  return c
end

-- A reward card: the icon (cropped, with its count), the name beside it, a border for its quality.
function QP.Card(parent)
  local c = T.Button(CreateFrame("Button", nil, parent))
  c:SetSize(QP.CARD_W, QP.CARD_H)
  c.icon = QP.Square(T.Crop(c:CreateTexture(nil, "ARTWORK")), QP.CARD_H - 6)
  c.icon:SetPoint("LEFT", c, "LEFT", 3, 0)
  c.count = T.Text(c:CreateFontString(nil, "OVERLAY"), "auraCount", "text")
  c.count:SetPoint("BOTTOMRIGHT", c.icon, "BOTTOMRIGHT", -1, 1)
  c.name = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text")
  c.name:SetPoint("LEFT", c.icon, "RIGHT", 6, 0)
  c.name:SetPoint("RIGHT", c, "RIGHT", -T.SPACE.tight, 0)
  return QP.WireTooltip(addCrown(c))
end

-- Shows a card's item tooltip: a quest log reward by its quest, a quest dialog reward by its slot (nothing when the client lacks the call).
function QP.ItemTooltip(c)
  local tip, item = GameTooltip, c.item
  local log = item and item.questID
  if not (tip and item and type(tip[log and "SetQuestLogItem" or "SetQuestItem"]) == "function") then return end
  tip:SetOwner(c, "ANCHOR_RIGHT")
  if log then tip:SetQuestLogItem(item.kind, item.index, item.questID) else tip:SetQuestItem(item.kind, item.index) end
  tip:Show()
end

-- Hovering a card shows its item's tooltip; leaving hides it. Returns the card.
function QP.WireTooltip(c)
  c:HookScript("OnEnter", function(self) QP.ItemTooltip(self) end)
  c:HookScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  return c
end

-- r, g, b for an item quality (nil for poor and common: they keep the theme's border).
function QP.QualityColor(quality)
  quality = ns.PlainNumber(quality)
  local get = C_Item and C_Item.GetItemQualityColor
  if not quality or quality < 2 or type(get) ~= "function" then return nil end
  local r, g, b = get(quality)
  if r then return { r, g, b } end
end

-- Functions run on every card as it's painted, each fn(card, item) (Modules/Upgrades.lua marks upgrades).
QP.cardHooks = {}

-- Adds fn(card, item) to run on every reward card as it's painted.
function QP.OnPaintCard(fn)
  QP.cardHooks[#QP.cardHooks + 1] = fn
end

-- Fills a card from { name, texture, count, quality, link } and shows it.
function QP.PaintCard(c, item)
  c.icon:SetTexture(item.texture)
  c.name:SetText(QP.Plain(item.name))
  local count = ns.PlainNumber(item.count)
  c.count:SetText(count and count > 1 and count or "")
  T.SetBorder(c, QP.QualityColor(item.quality))
  c.item = item
  for _, fn in ipairs(QP.cardHooks) do ns.Try("reward card", fn, c, item) end
  c:Show()
end

-- Reward sections --------------------------------------------------------------------------------

-- What an item sells to a vendor for (copper, C_Item.GetItemInfo's 11th return), or nil while the client
-- doesn't know it yet or hides it.
---@param link string|nil
---@return number|nil
function QP.SellPrice(link)
  local info = C_Item and C_Item.GetItemInfo
  if type(link) ~= "string" or type(info) ~= "function" then return nil end
  return ns.PlainNumber((select(11, info(link))))
end

-- The place of the one price above the rest, from n prices (nil for unknown): nil while any is unknown,
-- when two share the top, or when none is above 0. Quest automation and the reward crown both use it.
---@param prices table
---@param n number
---@return number|nil
function QP.TopSeller(prices, n)
  local best, bestPrice, tied = nil, 0, false
  for i = 1, n do
    local price = prices[i]
    if not price then return nil end
    if price > bestPrice then best, bestPrice, tied = i, price, false elseif price == bestPrice then tied = true end
  end
  return not tied and best or nil
end

-- The place of the choice that sells for most among a section's items (QP.TopSeller); nil for a section of
-- other rewards or of a single choice.
function QP.TopChoice(items)
  if #items < 2 or items[1].kind ~= "choice" then return nil end
  local prices = {}
  for i, item in ipairs(items) do prices[i] = QP.SellPrice(item.link) end
  return QP.TopSeller(prices, #items)
end

-- A section caption's line height, and the gap between two sections.
QP.CAPTION_H, QP.SECTION_GAP = 16, T.SPACE.gap

-- The client's own caption text by its global name, or nil when this client lacks it.
local function caption(name)
  local text = _G[name]
  return type(text) == "string" and text or nil
end

-- The choices' caption, worded as the game's quest frame words it (Mainline/QuestInfo.lua): one choice is
-- just received; two or more are chosen from now (choosing) or later.
local function choiceCaption(n, choosing)
  if n == 1 then return caption("REWARD_ITEMS_ONLY") end
  return caption(choosing and "REWARD_CHOOSE" or "REWARD_CHOICES")
end

-- A page's reward sections, { caption, items } each: the choices, then what you get anyway ("You will also
-- receive:" after choices, else "You will receive:"). choosing is true where you pick one now.
function QP.RewardSections(choices, rewards, choosing)
  local out = {}
  if #choices > 0 then out[1] = { caption = choiceCaption(#choices, choosing), items = choices } end
  if #rewards > 0 then out[#out + 1] = { caption = caption(#choices > 0 and "REWARD_ITEMS" or "REWARD_ITEMS_ONLY"), items = rewards } end
  return out
end

-- The required items' one section, captioned as the game's progress page is ("Required items:").
function QP.RequiredSection(items)
  return #items > 0 and { { caption = caption("TURN_IN_ITEMS"), items = items } } or {}
end

-- Requirements ---------------------------------------------------------------------------------

-- The money part of a needs line in the client's words ("Required Money: 1g 50s"), and whether you have
-- less than it (only when both figures are plain); nil for no money.
local function moneyPart(copper)
  if copper <= 0 then return nil, false end
  local have = ns.PlainNumber(type(GetMoney) == "function" and GetMoney() or nil)
  local text = (caption("REQUIRED_MONEY") or "Needs") .. " " .. ns.GetModule("InfoStrip").Money(copper)
  return text, have ~= nil and have < copper
end

-- The group size part in the client's words ("Suggested Players [3]"), or nil.
local function groupPart(players)
  local fmt = caption("QUEST_SUGGESTED_GROUP_NUM")
  if players <= 0 or not fmt then return nil end
  return (fmt:gsub("%%d", tostring(players)))
end

-- What a quest asks of you beside its objectives, as one line: the money it needs and the group it suggests
-- (plain numbers, 0 for none). Returns the text ("" for nothing) and whether you are short of the money.
function QP.Needs(copper, players)
  local money, short = moneyPart(ns.PlainNumber(copper) or 0)
  local parts = {}
  for _, part in ipairs({ money or false, groupPart(ns.PlainNumber(players) or 0) or false }) do
    if part then parts[#parts + 1] = part end
  end
  return table.concat(parts, "  ·  "), short
end

-- Paints a needs line from QP.Needs: muted, or in the danger colour while you are short of the money.
function QP.PaintNeeds(fs, text, short)
  fs:SetText(text)
  T.Color(fs, short and "bad" or "text2")
end

-- A section's caption at y down the holder's left edge (none when the client has no words for it); returns the y under it.
local function placeCaption(lay, text, y)
  if not text then return y end
  local fs = lay.captions.Next()
  fs:SetPoint("TOPLEFT", lay.holder, "TOPLEFT", 0, -y)
  fs:SetText(text)
  fs:Show()
  return y + QP.CAPTION_H
end

-- A section's cards, lay.perRow to a row from y down, each painted (the crown on card top, if any), then
-- lay.onCard(card, item); returns the y under them.
local function placeCards(lay, items, y, top)
  for n, item in ipairs(items) do
    local c, col, row = lay.cards.Next(), (n - 1) % lay.perRow, math.floor((n - 1) / lay.perRow)
    c:SetPoint("TOPLEFT", lay.holder, "TOPLEFT", col * (QP.CARD_W + QP.GAP), -y - row * (QP.CARD_H + QP.GAP))
    QP.PaintCard(c, item)
    c.crown:SetShown(n == top)
    if lay.onCard then lay.onCard(c, item) end
  end
  return y + math.ceil(#items / lay.perRow) * (QP.CARD_H + QP.GAP) - QP.GAP
end

-- A reward caption: small muted text over a section's cards.
function QP.Caption(parent)
  return T.Text(parent:CreateFontString(nil, "OVERLAY"), "small", "text2")
end

-- Lays reward sections out from the holder's top, each caption over its cards. lay is { holder, cards and
-- captions (QP.Pool), perRow, onCard (optional) }. Returns how tall they are (0 for none).
function QP.LayoutRewards(lay, sections)
  lay.cards.Reset()
  lay.captions.Reset()
  local y = 0
  for i, sec in ipairs(sections) do
    y = placeCaption(lay, sec.caption, y + (i > 1 and QP.SECTION_GAP or 0))
    y = placeCards(lay, sec.items, y, QP.TopChoice(sec.items))
  end
  return y
end

-- Your faction's crest, faint (T.CREST.watermark at T.CREST.wash), behind a reading window's top-right corner:
-- the quest dialog's and the quest log's. Hidden while the faction look is off.
function QP.Watermark(f)
  f.crest = T.Crest(f, T.CREST.watermark, "BORDER", T.CREST.wash)
  f.crest:SetPoint("TOPRIGHT", f, "TOPRIGHT", -T.SPACE.col, -WATERMARK_DROP)
  return f.crest
end

-- A pool of widgets made on demand by make(parent), shown in order, the rest hidden.
function QP.Pool(parent, make)
  local pool = { used = 0 }
  -- The next widget (made the first time it's needed).
  function pool.Next()
    pool.used = pool.used + 1
    pool[pool.used] = pool[pool.used] or make(parent)
    return pool[pool.used]
  end
  -- Hides every widget and starts over.
  function pool.Reset() for i = 1, #pool do pool[i]:Hide() end pool.used = 0 end
  return pool
end
