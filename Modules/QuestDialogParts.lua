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

-- Lines ----------------------------------------------------------------------------------------

-- A texture sized square; returns it.
function QP.Square(t, size)
  t:SetSize(size, size)
  return t
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
  return b
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
  return QP.WireTooltip(c)
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
