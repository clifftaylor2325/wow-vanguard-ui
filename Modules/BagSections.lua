-- Bag sections (part of the Bags module): the combined bag's own item buttons
-- laid out in sections: quest items, equipment,
-- consumables, trade goods, the rest, junk and the empty slots, each under a
-- header in the theme, packed side by side where they fit, with the window's
-- padding (Bags.PAD) around them and the money line. The buttons stay
-- the game's, so using, dragging, search dimming, quality borders and item
-- tooltips work as before; only where they sit changes. Item buttons are
-- protected: they move only out of combat, and a change in combat waits for
-- it to end. A switch under Bars, map, chat gives back the game's plain grid.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgSections = ns.FrameState("vgSections")

local T = ns.Theme
local BG = ns.GetModule("Bags")

-- The space between the game's slots (ITEM_SPACING_X and _Y in
-- Blizzard_UIPanels_Game Mainline/ContainerFrame.lua, which Forever loads). The
-- grid's columns and width are the window's own (GetColumns, CalculateWidth).
local GAP = 5
-- On the theme's 4 px grid: the space under a header's text, above its slots;
-- between sections side by side; above a header, under the section before it
-- (more than under the header, so a header reads with its own slots); and a
-- section's narrowest width in columns (room for its header).
local HEAD_GAP, SIDE_GAP, SHELF_GAP, MIN_COLS = 4, 12, 12, 2
-- The game's grid sits this far above the money line (its GetInitialItemAnchor).
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

-- The game's grid in this window: its columns, its width (the window's own
-- width less the game's padding), the slot size that fills that width, and
-- how far below the window's top it starts (under the title and search row).
local function gridOf(frame)
  local cols, w = frame:GetColumns(), frame:CalculateWidth() - frame:GetPaddingWidth()
  return { cols = cols, w = w, slot = (w - (cols - 1) * GAP) / cols, top = frame:GetPaddingHeight() }
end

-- A section's width and height in pixels: its columns (at least room for the
-- header) by its rows, plus the header.
local function blockSize(n, g)
  local cols, rows = math.max(MIN_COLS, math.min(n, g.cols)), math.ceil(n / g.cols)
  return cols * g.slot + (cols - 1) * GAP, g.head + rows * g.slot + (rows - 1) * GAP
end

-- Gives each section its spot (x, y from the top left of the slot area):
-- side by side while they fit the grid's width, then on a new row. Returns the height used.
local function shelve(list, g)
  local x, y, rowH = 0, 0, 0
  for _, s in ipairs(list) do
    local w, h = blockSize(#s.buttons, g)
    if x > 0 and x + w > g.w then x, y, rowH = 0, y + rowH + SHELF_GAP, 0 end
    s.x, s.y, s.w = x, y, w
    x, rowH = x + w + SIDE_GAP, math.max(rowH, h)
  end
  return y + rowH
end

-- Puts a widget at x, y from the slot area's top left: the padding inside the
-- window's left edge, under the game's title and search row.
local function put(widget, frame, g, x, y)
  widget:ClearAllPoints()
  widget:SetPoint("TOPLEFT", frame, "TOPLEFT", BG.PAD + x, -(g.top + y))
end

-- A section's slots, row by row under its header.
local function placeSlots(frame, s, g)
  for i, button in ipairs(s.buttons) do
    local col, row = (i - 1) % g.cols, math.floor((i - 1) / g.cols)
    put(button, frame, g, s.x + col * (g.slot + GAP), s.y + g.head + row * (g.slot + GAP))
  end
end

-- A section's header (made once per section) with its label, in the accent.
local function headerOf(frame, s)
  local fs = BG.headers[s.key] or T.Text(frame:CreateFontString(nil, "OVERLAY"), "cell", "accentText")
  BG.headers[s.key] = fs
  fs:SetText(s.label)
  return fs
end

-- A header line's height: the tallest header's text as drawn (at least its
-- font size, should the client not have measured it yet), and the space under it.
local function headHeight(frame, list)
  local h = T.RoleSize("cell")
  for _, s in ipairs(list) do h = math.max(h, headerOf(frame, s):GetStringHeight()) end
  return math.ceil(h) + HEAD_GAP
end

-- A section's header over its slots, as wide as its section.
local function placeHeader(frame, s, g)
  local fs = BG.headers[s.key]
  fs:SetWidth(s.w)
  fs:SetJustifyH("LEFT")
  put(fs, frame, g, s.x, s.y)
  fs:Show()
end

-- Hides every section header (the plain grid, or sections empty now).
function BG.HideHeaders()
  for _, fs in pairs(BG.headers) do fs:Hide() end
end

-- The bag's bottom row: the currency tracker when the game shows one under
-- the money line (the money line sits on it), else the money line.
local function bottomRow(frame)
  local _, rel = frame.MoneyFrame:GetPoint(1)
  if rel and rel ~= frame then return rel end
  return frame.MoneyFrame
end

-- While the sections show, the money line (with the currency tracker under it)
-- sits the padding inside the window's sides and bottom, as the slots do.
function BG.PadMoney(frame)
  if not vgSections[frame] then return end
  local row = bottomRow(frame)
  row:ClearAllPoints()
  row:SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", BG.PAD, BG.PAD)
  row:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -BG.PAD, BG.PAD)
end

-- The height of the bag's bottom rows: the money line, and when the currency
-- tracker shows under it, the tracker and the game's space between them.
local function bottomHeight(frame)
  local money, row = frame.MoneyFrame, bottomRow(frame)
  if row == money then return money:GetHeight() end
  local _, _, _, _, y = money:GetPoint(1)
  return money:GetHeight() + y + row:GetHeight()
end

-- The window fitted to the sections: the grid's width with the padding each
-- side; the title and search row, the sections, the game's space above the
-- money line, the bottom rows and the padding under them. Then the search row fitted.
local function fitWindow(frame, g, height)
  BG.PadMoney(frame)
  frame:SetSize(g.w + 2 * BG.PAD, g.top + height + ABOVE_MONEY + bottomHeight(frame) + BG.PAD)
  BG.FitSearch(frame)
end

-- Lays the sections out: slots and headers placed, and the window fitted to them.
function BG.Place(frame, list)
  local g = gridOf(frame)
  g.head = headHeight(frame, list)
  local height = shelve(list, g)
  BG.HideHeaders()
  for _, s in ipairs(list) do
    placeSlots(frame, s, g)
    placeHeader(frame, s, g)
  end
  fitWindow(frame, g, height)
end

-- The game's plain grid back (sections switched off): its own money line, size and layout.
function BG.PlainBag(frame)
  BG.HideHeaders()
  if not vgSections[frame] then return end
  vgSections[frame] = nil
  frame:UpdateCurrencyFrames()
  frame:UpdateFrameSize()
  frame:UpdateItemLayout()
  BG.FitSearch(frame)
end

-- Sections in the open bag window (when switched on); a layout already
-- showing the same sections is left as it is.
function BG.LayOutSections(frame)
  if not ns.Settings("Bags", BG.defaults).sections then return BG.PlainBag(frame) end
  if not frame:IsShown() then return end
  local buttons = buttonsOf(frame)
  local list, sig = BG.Group(buttons)
  if sig == vgSections[frame] then return end
  vgSections[frame] = sig
  BG.Place(frame, list)
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
  vgSections[frame] = nil
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
  for _, fs in pairs(BG.headers) do T.Color(fs, "accentText") end
end

-- Whether the client has the item calls the sections classify with.
local function itemAPI()
  return type(C_Container) == "table" and type(C_Container.GetContainerItemInfo) == "function"
    and type(C_Item) == "table" and type(C_Item.GetItemInfoInstant) == "function"
end

-- The bag window's calls the sections use (ContainerFrameCombinedBagsMixin).
local FRAME_CALLS = {
  "UpdateItemLayout", "UpdateItems", "UpdateFrameSize", "UpdateCurrencyFrames",
  "CalculateWidth", "GetPaddingWidth", "GetPaddingHeight", "GetColumns",
}

-- Whether the client's bag window can be laid out in sections.
local function canSection(frame)
  if not (itemAPI() and type(hooksecurefunc) == "function" and type(frame.MoneyFrame) == "table") then return false end
  for _, name in ipairs(FRAME_CALLS) do
    if type(frame[name]) ~= "function" then return false end
  end
  return true
end

-- Sections in the combined bag window (Bags.Enable): after the game lays out
-- its grid or fills its slots, and when an item's info arrives, the sections are
-- laid out again; when the game puts its money line back, it gets the padding again.
function BG.WatchSections(frame)
  if not canSection(frame) then return end
  BG.sectionFrame = frame
  hooksecurefunc(frame, "UpdateItemLayout", ns.Guard("hook UpdateItemLayout", BG.AfterGameLayout))
  hooksecurefunc(frame, "UpdateItems", ns.Guard("hook UpdateItems", BG.QueueSections))
  hooksecurefunc(frame, "UpdateCurrencyFrames", ns.Guard("hook UpdateCurrencyFrames", BG.PadMoney))
  ns.On("ITEM_DATA_LOAD_RESULT", itemLoaded)
  T.OnChanged(paintHeaders)
end
