-- Bag sections (part of the Bags module): the combined bag's own item buttons
-- laid out in sections, as AdiBags and Baganator do: quest items, equipment,
-- consumables, trade goods, the rest, junk and the empty slots, each under a
-- header in the theme, packed side by side where they fit. The buttons stay
-- the game's, so using, dragging, search dimming, quality borders and item
-- tooltips work as before; only where they sit changes. Item buttons are
-- protected: they move only out of combat, and a change in combat waits for
-- it to end. A switch under Bars, map, chat gives back the game's plain grid.

local ADDON, ns = ...

local T = ns.Theme
local BG = ns.GetModule("Bags")

-- The game's slot size, spacing and columns in the combined bag (Blizzard_UIPanels_Game ContainerFrame.lua).
local SLOT, GAP, COLS = 37, 5, 10
-- The width of the game's ten columns: the sections fill the same width.
local ROW_W = COLS * SLOT + (COLS - 1) * GAP
-- A header's height, the space between sections side by side and between
-- their rows, and a section's narrowest width in columns (room for its header).
local HEAD, SIDE_GAP, SHELF_GAP, MIN_COLS = 16, 12, 6, 2
-- The game's grid sits this far above the money row (its GetInitialItemAnchor).
local ABOVE_MONEY = 4

-- The sections, in the order they're shown.
BG.SECTIONS = {
  { key = "quest", label = "Quest items" }, { key = "equipment", label = "Equipment" },
  { key = "consumables", label = "Consumables" }, { key = "trade", label = "Trade goods" },
  { key = "other", label = "Other" }, { key = "junk", label = "Junk" }, { key = "empty", label = "Empty" },
}

-- Item classes (Enum.ItemClass: Consumable 0, Weapon 2, Armor 4, Reagent 5,
-- Projectile 6, Tradegoods 7, Recipe 9, Questitem 12) and their sections; any other class is "other".
local CLASS_SECTION = {
  [0] = "consumables", [5] = "consumables", [6] = "consumables", [2] = "equipment", [4] = "equipment",
  [7] = "trade", [9] = "trade", [12] = "quest",
}

-- Items the client hasn't sent the info of yet (itemID -> true): they sit
-- under Other and move when it arrives.
BG.pending = {}
-- Section headers by section key: font strings on the bag window, made as needed.
BG.headers = {}

-- Whether the slot holds a quest item (or one that starts a quest).
local function isQuestItem(bag, slot)
  local get = C_Container.GetContainerItemQuestInfo
  local q = type(get) == "function" and get(bag, slot)
  return type(q) == "table" and (q.isQuestItem == true or q.questID ~= nil)
end

-- The item's class id (Enum.ItemClass), or nil while the client doesn't know the item.
local function classOf(itemID)
  return ns.PlainNumber((select(6, C_Item.GetItemInfoInstant(itemID))))
end

-- The section of what a slot holds: empty, junk (gray), quest, or by the
-- item's class; an item not loaded yet goes to Other until it is.
function BG.Classify(button)
  local bag, slot = button:GetBagID(), button:GetID()
  local info = C_Container.GetContainerItemInfo(bag, slot)
  if not info then return "empty" end
  local quality = ns.PlainNumber(info.quality)
  if quality == 0 then return "junk" end
  if isQuestItem(bag, slot) then return "quest" end
  local class = classOf(info.itemID)
  if quality and class then return CLASS_SECTION[class] or "other" end
  BG.pending[info.itemID] = true
  return "other"
end

-- Reading order: by bag, then slot, as the game's own grid reads.
local function readingOrder(a, b)
  local bagA, bagB = a:GetBagID(), b:GetBagID()
  if bagA ~= bagB then return bagA < bagB end
  return a:GetID() < b:GetID()
end

-- The window's item buttons in reading order.
local function buttonsOf(frame)
  local list = {}
  for _, button in frame:EnumerateValidItems() do list[#list + 1] = button end
  table.sort(list, readingOrder)
  return list
end

-- The sections that have buttons, in order: { key, label, buttons }.
local function ordered(bySection)
  local list = {}
  for _, s in ipairs(BG.SECTIONS) do
    if bySection[s.key] then list[#list + 1] = { key = s.key, label = s.label, buttons = bySection[s.key] } end
  end
  return list
end

-- The buttons grouped into sections, and a signature of which section each
-- slot is in (the same signature: the same layout).
function BG.Group(buttons)
  local bySection, keys = {}, {}
  for i, button in ipairs(buttons) do
    local key = BG.Classify(button)
    keys[i] = key
    bySection[key] = bySection[key] or {}
    table.insert(bySection[key], button)
  end
  return ordered(bySection), table.concat(keys, ",")
end

-- A section's width and height in pixels: its columns (at least room for the
-- header) by its rows, plus the header.
local function blockSize(n)
  local cols, rows = math.max(MIN_COLS, math.min(n, COLS)), math.ceil(n / COLS)
  return cols * SLOT + (cols - 1) * GAP, HEAD + rows * SLOT + (rows - 1) * GAP
end

-- Gives each section its spot (x, y from the top left of the slot area):
-- side by side while they fit the width, then on a new row. Returns the height used.
local function shelve(list)
  local x, y, rowH = 0, 0, 0
  for _, s in ipairs(list) do
    local w, h = blockSize(#s.buttons)
    if x > 0 and x + w > ROW_W then x, y, rowH = 0, y + rowH + SHELF_GAP, 0 end
    s.x, s.y, s.w = x, y, w
    x, rowH = x + w + SIDE_GAP, math.max(rowH, h)
  end
  return y + rowH
end

-- The height of the game's own grid of n slots.
local function gridHeight(n)
  local rows = math.ceil(n / COLS)
  return rows * SLOT + (rows - 1) * GAP
end

-- Puts a widget at x, y from the slot area's top left, which sits top pixels
-- above the money row (the bottom stays where the game's grid ends).
local function put(widget, frame, x, y, top)
  widget:ClearAllPoints()
  widget:SetPoint("TOPLEFT", frame.MoneyFrame, "TOPRIGHT", x - ROW_W, top - y)
end

-- A section's slots, row by row under its header.
local function placeSlots(frame, s, top)
  for i, button in ipairs(s.buttons) do
    local col, row = (i - 1) % COLS, math.floor((i - 1) / COLS)
    put(button, frame, s.x + col * (SLOT + GAP), s.y + HEAD + row * (SLOT + GAP), top)
  end
end

-- A section's header (made once per section) over its slots, in the accent.
local function placeHeader(frame, s, top)
  local fs = BG.headers[s.key] or T.Text(frame:CreateFontString(nil, "OVERLAY"), "cell", "accent")
  BG.headers[s.key] = fs
  fs:SetText(s.label)
  fs:SetWidth(s.w)
  fs:SetJustifyH("LEFT")
  put(fs, frame, s.x, s.y, top)
  fs:Show()
end

-- Hides every section header (the plain grid, or sections empty now).
function BG.HideHeaders()
  for _, fs in pairs(BG.headers) do fs:Hide() end
end

-- Lays the sections out: slots and headers placed, and the window's height
-- fitted to them (the game's height for its grid of n slots, less that grid).
function BG.Place(frame, list, n)
  local height = shelve(list)
  local top = ABOVE_MONEY + height
  BG.HideHeaders()
  for _, s in ipairs(list) do
    placeSlots(frame, s, top)
    placeHeader(frame, s, top)
  end
  frame:SetHeight(frame:CalculateHeight() - gridHeight(n) + height)
end

-- The game's plain grid back (sections switched off): its own size and layout.
function BG.PlainBag(frame)
  BG.HideHeaders()
  if not frame.fuiSections then return end
  frame.fuiSections = nil
  frame:UpdateFrameSize()
  frame:UpdateItemLayout()
end

-- Sections in the open bag window (when switched on); a layout already
-- showing the same sections is left as it is.
function BG.LayOutSections(frame)
  if not ns.Settings("Bags", BG.defaults).sections then return BG.PlainBag(frame) end
  if not frame:IsShown() then return end
  local buttons = buttonsOf(frame)
  local list, sig = BG.Group(buttons)
  if sig == frame.fuiSections then return end
  frame.fuiSections = sig
  BG.Place(frame, list, #buttons)
end

-- Lays the sections out now, or once combat ends (the item buttons are
-- protected); until then the bag keeps the layout it has.
function BG.QueueSections()
  local frame = BG.sectionFrame
  ns.OutOfCombat(function() BG.LayOutSections(frame) end, "bagSections")
end

-- The game laid out its plain grid again (the window opened): in combat the
-- headers go with it until combat ends; the sections come back when they can.
function BG.AfterGameLayout(frame)
  frame.fuiSections = nil
  if ns.InCombat() then BG.HideHeaders() end
  BG.QueueSections()
end

-- The client sent an item's info: an item waiting under Other moves to its section.
local function itemLoaded(_, itemID)
  if not BG.pending[itemID] then return end
  BG.pending[itemID] = nil
  BG.QueueSections()
end

-- The sections switch changed (options): sections at once, or the plain grid back.
function BG.SectionsChanged()
  if BG.sectionFrame then BG.QueueSections() end
end

-- Headers take a new accent at once.
local function paintHeaders()
  for _, fs in pairs(BG.headers) do T.Color(fs, "accent") end
end

-- Whether the client has the item calls the sections classify with.
local function itemAPI()
  return type(C_Container) == "table" and type(C_Container.GetContainerItemInfo) == "function"
    and type(C_Item) == "table" and type(C_Item.GetItemInfoInstant) == "function"
end

-- Whether the client's bag window can be laid out in sections.
local function canSection(frame)
  return itemAPI() and type(hooksecurefunc) == "function" and type(frame.MoneyFrame) == "table"
    and type(frame.UpdateItemLayout) == "function" and type(frame.UpdateItems) == "function"
    and type(frame.UpdateFrameSize) == "function" and type(frame.CalculateHeight) == "function"
end

-- Sections in the combined bag window (Bags.Enable): after the game lays out
-- its grid or fills its slots, and when an item's info arrives, the sections are laid out again.
function BG.WatchSections(frame)
  if not canSection(frame) then return end
  BG.sectionFrame = frame
  hooksecurefunc(frame, "UpdateItemLayout", BG.AfterGameLayout)
  hooksecurefunc(frame, "UpdateItems", BG.QueueSections)
  ns.On("ITEM_DATA_LOAD_RESULT", itemLoaded)
  T.OnChanged(paintHeaders)
end
