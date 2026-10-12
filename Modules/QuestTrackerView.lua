-- The quest tracker's look (Modules/QuestTracker.lua gathers the quests): a
-- "Quests" header with the count, a brass line and a collapse arrow; a block
-- per quest; "+3 more" when they don't all fit; and the quest items as the
-- game's secure item buttons beside their quests (placed out of combat), each with
-- its cooldown, a red tint out of range and the game's tooltip.

local ADDON, ns = ...

local T = ns.Theme
local QP = ns.QuestParts
local QT = ns.GetModule("QuestTracker")

QT.HEADER, QT.TITLE, QT.LINE, QT.GAP, QT.ITEM, QT.MAX_ITEMS, QT.RANGE_EVERY = 22, 16, 14, 6, 22, 8, 0.25
QT.items, QT.shown = {}, {}

-- Building -------------------------------------------------------------------------------------

-- The collapse arrow: down while open, right while collapsed.
local function addToggle(f)
  f.toggle = CreateFrame("Button", nil, f)
  f.toggle:SetSize(14, 14)
  f.toggle:SetPoint("TOPRIGHT", f, "TOPRIGHT", 0, -2)
  f.toggle.icon = T.Tint(f.toggle:CreateTexture(nil, "OVERLAY"), "text2")
  f.toggle.icon:SetAllPoints()
  f.toggle:SetScript("OnClick", ns.Guard("click quest tracker collapse", function() QT.collapsed = not QT.collapsed QT.Refresh() end))
end

-- "Quests", the count beside the arrow, and a brass line under them.
local function addHeader(f)
  f.header = T.Text(f:CreateFontString(nil, "OVERLAY"), "heading", "text")
  f.header:SetPoint("TOPLEFT", f, "TOPLEFT", 0, 0)
  f.header:SetText("Quests")
  f.count = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "text2")
  f.count:SetPoint("TOPRIGHT", f, "TOPRIGHT", -20, -3)
  f.rule = T.Snap(f:CreateTexture(nil, "ARTWORK"))
  f.rule:SetHeight(T.Pixel(f))
  f.rule:SetPoint("TOPLEFT", f, "TOPLEFT", 0, -QT.HEADER + 4)
  f.rule:SetPoint("TOPRIGHT", f, "TOPRIGHT", 0, -QT.HEADER + 4)
end

-- One objective line in a block.
local function objectiveLine(block)
  local fs = T.Text(block:CreateFontString(nil, "OVERLAY"), "small", "text2")
  fs:SetWidth(QT.W - 10)
  fs:SetJustifyH("LEFT")
  fs:SetWordWrap(false)
  return fs
end

-- A quest's block: its title (clickable) and its objective lines.
local function makeBlock(parent)
  local b = CreateFrame("Button", nil, parent)
  b:SetWidth(QT.W)
  b:RegisterForClicks("AnyUp")
  b.title = T.Text(b:CreateFontString(nil, "OVERLAY"), "label", "text")
  b.title:SetPoint("TOPLEFT", b, "TOPLEFT", 0, 0)
  b.title:SetWidth(QT.W)
  b.title:SetJustifyH("LEFT")
  b.lines = QP.Pool(b, objectiveLine)
  b:SetScript("OnClick", ns.Guard("click quest tracker title", function(self, button) QT.OnTitle(self.id, button) end))
  return b
end

-- The quests' area under the header, its blocks and the "+3 more" line.
local function addBody(f)
  f.body = CreateFrame("Frame", nil, f)
  f.body:SetPoint("TOPLEFT", f, "TOPLEFT", 0, -QT.HEADER)
  f.body:SetSize(QT.W, QT.H - QT.HEADER)
  f.blocks = QP.Pool(f.body, makeBlock)
  f.more = T.Text(f.body:CreateFontString(nil, "OVERLAY"), "small", "text2")
end

-- A spot of its own, when the menu strip hasn't made one.
local function ownSpot()
  local spot = CreateFrame("Frame", "Vanguard_QuestTracker", UIParent)
  spot:SetSize(QT.W, QT.H)
  ns.Mover(spot, "questtracker", "Quest tracker", { "TOPRIGHT", "TOPRIGHT", -12, -276 })
  return spot
end

-- Builds the tracker over its spot.
function QT.Build(spot)
  local f = CreateFrame("Frame", "Vanguard_QuestTrackerFrame", spot or ownSpot())
  f:SetAllPoints()
  addHeader(f)
  addToggle(f)
  addBody(f)
  QT.frame = f
  T.OnChanged(function() T.Tint(f.rule, "accent") end)
  T.Tint(f.rule, "accent")
end

-- Blocks ---------------------------------------------------------------------------------------

-- A quest's lines under its title: { text, color } for each objective, or "Ready to turn in".
function QT.LineSpecs(q)
  if q.ready then return { { "Ready to turn in", "good" } } end
  local out = {}
  for _, o in ipairs(q.objectives) do out[#out + 1] = { "- " .. o.text, o.done and "good" or "text2" } end
  return out
end

-- A block's height for a quest.
function QT.BlockHeight(q)
  return QT.TITLE + #QT.LineSpecs(q) * QT.LINE
end

-- A block's lines under its title.
local function paintLines(b, q)
  b.lines.Reset()
  for i, spec in ipairs(QT.LineSpecs(q)) do
    local fs = b.lines.Next()
    fs:SetPoint("TOPLEFT", b, "TOPLEFT", 8, -QT.TITLE - (i - 1) * QT.LINE)
    fs:SetText(spec[1])
    T.Color(fs, spec[2])
    fs:Show()
  end
end

-- Fills a block: the title in the quest's difficulty color, then its lines.
function QT.PaintBlock(b, q)
  b.id = q.id
  b.title:SetText(QP.Titled(q.level, q.title))
  T.Color(b.title, QP.LevelColor(q.level))
  paintLines(b, q)
  b:SetHeight(QT.BlockHeight(q))
  b:Show()
end

-- Lays the quests out from the top until the spot is full; "+N more" for the rest.
local function layout(f, quests)
  local y, shown, room = 0, {}, f.body:GetHeight() - QT.LINE
  for _, q in ipairs(quests) do
    if y + QT.BlockHeight(q) > room then break end
    local b = f.blocks.Next()
    b:SetPoint("TOPLEFT", f.body, "TOPLEFT", 0, -y)
    QT.PaintBlock(b, q)
    shown[#shown + 1] = { block = b, quest = q }
    y = y + QT.BlockHeight(q) + QT.GAP
  end
  return shown, y
end

-- The "+N more" line under the last block, when some quests don't fit.
local function showMore(f, hidden, y)
  f.more:SetShown(hidden > 0)
  f.more:SetText("+" .. hidden .. " more")
  f.more:SetPoint("TOPLEFT", f.body, "TOPLEFT", 0, -y)
end

-- Redraws the tracker from the quests you watch (also in combat, so counts keep
-- up with a fight), then places the quest items: those are secure buttons that
-- can't be moved in combat, so they keep their places until combat ends and one
-- keyed placement runs then, however many redraws asked for it.
function QT.Refresh()
  local f, quests = QT.frame, QT.Quests()
  f.count:SetText(#quests > 0 and tostring(#quests) or "")
  f.toggle.icon:SetTexture(T.Icon(QT.collapsed and "Right" or "Down"))
  f.blocks.Reset()
  f.body:SetShown(not QT.collapsed)
  f:SetShown(#quests > 0)
  local shown, y = layout(f, QT.collapsed and {} or quests)
  QT.shown = shown
  showMore(f, QT.collapsed and 0 or #quests - #QT.shown, y)
  ns.OutOfCombat(QT.PlaceItems, "questitems")
end

-- Item buttons ---------------------------------------------------------------------------------

-- A quest item's place in the log, for the button showing it (nil when the log no longer has it).
local function indexOf(b)
  return b.questID and QT.LogIndex(b.questID)
end

-- Draws an item's cooldown: the swipe while one runs, nothing otherwise (hidden numbers go straight to the widget).
local function paintCooldown(b, start, duration)
  if ns.IsSecret(start) or ns.IsSecret(duration) then return b.cooldown:SetCooldown(start, duration) end
  if type(start) == "number" and type(duration) == "number" and duration > 0 then b.cooldown:SetCooldown(start, duration) else b.cooldown:Clear() end
end

-- Shows the game's cooldown for the button's quest item (a child frame: fine in combat).
function QT.UpdateCooldown(b)
  local index = indexOf(b)
  if index and type(GetQuestLogSpecialItemCooldown) == "function" then return paintCooldown(b, GetQuestLogSpecialItemCooldown(index)) end
  b.cooldown:Clear()
end

-- Every shown item button's cooldown (the bags' cooldowns changed).
function QT.UpdateCooldowns()
  for _, b in ipairs(QT.items) do
    if b:IsShown() then QT.UpdateCooldown(b) end
  end
end

-- Tints the item's icon red while it is out of range of its target (the game says 0 out of range, 1 in range, nothing when it has no range).
function QT.UpdateRange(b)
  local index = indexOf(b)
  local range = index and type(IsQuestLogSpecialItemInRange) == "function" and IsQuestLogSpecialItemInRange(index)
  T.Tint(b.icon, not ns.IsSecret(range) and range == 0 and "outOfRange" or "white")
end

-- The game's tooltip for the quest item.
function QT.ItemTooltip(b)
  local tip, index = GameTooltip, indexOf(b)
  if not index or not tip or type(tip.SetQuestLogSpecialItem) ~= "function" then return end
  tip:SetOwner(b, "ANCHOR_RIGHT")
  tip:SetQuestLogSpecialItem(index)
  tip:Show()
end

-- The button's cooldown swipe over the icon, its tooltip and its range check (a few times a second while it shows).
local function wireItem(b)
  b.cooldown = CreateFrame("Cooldown", nil, b, "CooldownFrameTemplate")
  b.cooldown:SetAllPoints()
  b:SetScript("OnEnter", QT.ItemTooltip)
  b:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  ns.Every(b, QT.RANGE_EVERY, QT.UpdateRange, b, true)
end

-- Item button i (made the first time): the game's secure button that uses an item. It sits on
-- UIParent, not in the tracker, so the tracker can hide in combat without touching it.
local function itemButton(i)
  if QT.items[i] then return QT.items[i] end
  local b = T.Button(CreateFrame("Button", "Vanguard_QuestItem" .. i, UIParent, "SecureActionButtonTemplate"))
  b:SetSize(QT.ITEM, QT.ITEM)
  b:RegisterForClicks("AnyUp", "AnyDown")
  b.icon = T.Crop(b:CreateTexture(nil, "ARTWORK"))
  b.icon:SetPoint("TOPLEFT", 2, -2)
  b.icon:SetPoint("BOTTOMRIGHT", -2, 2)
  wireItem(b)
  QT.items[i] = b
  return b
end

-- The button for a quest's item: the one it had before, else a free one, else a new one.
local function buttonFor(id)
  for _, b in ipairs(QT.items) do
    if b.questID == id then return b end
  end
  for _, b in ipairs(QT.items) do
    if b.questID == nil then return b end
  end
  return itemButton(#QT.items + 1)
end

-- Gives a button a quest's item and puts it beside the quest's block.
local function placeItem(b, shown)
  b.questID = shown.quest.id
  b:SetAttribute("type", "item")
  b:SetAttribute("item", shown.quest.item.link)
  b.icon:SetTexture(shown.quest.item.texture)
  b:ClearAllPoints()
  b:SetPoint("TOPRIGHT", shown.block, "TOPLEFT", -4, 0)
  b:Show()
  QT.UpdateCooldown(b)
  QT.UpdateRange(b)
end

-- The shown quests that have an item (as many as there are buttons for), and their ids as a set.
local function itemQuests()
  local list, ids = {}, {}
  for _, shown in ipairs(QT.shown) do
    if shown.quest.item and #list < QT.MAX_ITEMS then
      list[#list + 1] = shown
      ids[shown.quest.id] = true
    end
  end
  return list, ids
end

-- Hides every item button, and frees those whose quest no longer has an item showing.
local function release(ids)
  for _, b in ipairs(QT.items) do
    b:Hide()
    if not ids[b.questID] then b.questID = nil end
  end
end

-- Puts each shown quest's item beside it. Each quest keeps its own button while it
-- has an item showing (secure buttons: this runs only out of combat).
function QT.PlaceItems()
  local list, ids = itemQuests()
  release(ids)
  for _, shown in ipairs(list) do placeItem(buttonFor(shown.quest.id), shown) end
end
