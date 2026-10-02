-- Parts shared by ForeverUI's quest windows (the quest dialog, and the quest
-- log): numbered lines for quests and gossip, and reward cards with the
-- item's icon, count and name in a border of its quality color.

local ADDON, ns = ...

local T = ns.Theme

local QP = {}
ns.QuestParts = QP

QP.LINE_H, QP.CARD_W, QP.CARD_H, QP.GAP = 20, 172, 36, 4
-- The game's quest marks: a quest you can take, one you can turn in, one still in progress.
QP.ICONS = {
  available = "Interface\\GossipFrame\\AvailableQuestIcon",
  ready = "Interface\\GossipFrame\\ActiveQuestIcon",
  active = "Interface\\GossipFrame\\IncompleteQuestIcon",
}

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

-- "[12] Title" (just the title for a quest without a level).
function QP.Titled(level, title)
  level = ns.PlainNumber(level)
  if level and level > 0 then return string.format("[%d] %s", level, QP.Plain(title)) end
  return QP.Plain(title)
end

-- Lines ----------------------------------------------------------------------------------------

-- A texture sized square; returns it.
function QP.Square(t, size)
  t:SetSize(size, size)
  return t
end

-- A clickable line: an icon, then its text; a faint wash under the mouse.
function QP.Line(parent)
  local b = CreateFrame("Button", nil, parent)
  b:SetHeight(QP.LINE_H)
  b.icon = QP.Square(b:CreateTexture(nil, "ARTWORK"), 16)
  b.icon:SetPoint("LEFT", b, "LEFT", 2, 0)
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "label", "text")
  b.text:SetPoint("LEFT", b.icon, "RIGHT", 6, 0)
  b.text:SetJustifyH("LEFT")
  b.hover = T.Tint(b:CreateTexture(nil, "HIGHLIGHT"), "hover")
  b.hover:SetAllPoints()
  return b
end

-- Marks a line as the chosen one with a faint accent wash (made the first time), or clears it.
function QP.Mark(b, on)
  if not b.mark then
    b.mark = T.Tint(b:CreateTexture(nil, "BACKGROUND"), "accent", 0.22)
    b.mark:SetAllPoints()
  end
  b.mark:SetShown(on)
end

-- Fills a line from { text, icon, color = { r, g, b } or token, select }; number n before the text.
function QP.PaintLine(b, n, spec)
  b.text:SetText(n .. ".  " .. spec.text)
  if type(spec.color) == "table" then T.Color(b.text, spec.color[1], spec.color[2], spec.color[3]) else T.Color(b.text, spec.color or "text") end
  b.icon:SetTexture(spec.icon)
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
  c.name:SetPoint("RIGHT", c, "RIGHT", -4, 0)
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

-- Fills a card from { name, texture, count, quality } and shows it.
function QP.PaintCard(c, item)
  c.icon:SetTexture(item.texture)
  c.name:SetText(QP.Plain(item.name))
  local count = ns.PlainNumber(item.count)
  c.count:SetText(count and count > 1 and count or "")
  T.SetBorder(c, QP.QualityColor(item.quality))
  c.item = item
  c:Show()
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
