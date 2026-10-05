-- Broker strip: other addons' data feeds (LibDataBroker data sources: gold
-- trackers, durability, guild counts and the like) in a thin strip at the top
-- center of the screen, the way Titan Panel shows them. Pick which feeds show
-- under Bars, map, chat (up to MAX, in the order picked); each slot shows the
-- feed's icon and text, its own tooltip on hover, and passes clicks to it.
-- Launchers (minimap-style buttons) stay in the minimap drawer.
--
-- Vanguard doesn't bundle LibDataBroker: every addon that shares a feed loads
-- it, so the strip uses the one they loaded, and stays hidden without one.

local ADDON, ns = ...

local T = ns.Theme

local BS = ns.Module("BrokerStrip", { defaults = { feeds = {} } })

-- How many feeds show at most, each slot's width, and the strip's height.
BS.MAX, BS.SLOT_W, BS.H = 4, 120, 20

-- Feeds -------------------------------------------------------------------------------------

-- LibDataBroker-1.1, when an addon that shares data has loaded it; nil otherwise.
function BS.Broker()
  return type(LibStub) == "table" and LibStub("LibDataBroker-1.1", true) or nil
end

-- The data sources other addons share, by name.
function BS.Sources()
  local ldb, out = BS.Broker(), {}
  if not ldb then return out end
  for name, obj in ldb:DataObjectIterator() do
    if obj.type == "data source" then out[#out + 1] = name end
  end
  table.sort(out)
  return out
end

-- What a feed shows: its text, else its label ("" for neither).
function BS.Text(obj)
  local text = obj.text ~= nil and obj.text or obj.label
  return text ~= nil and tostring(text) or ""
end

-- The chosen feeds' list in the active profile (works while the module is off too).
local function chosenList()
  return ns.Settings("BrokerStrip", BS.defaults).feeds
end

-- Whether a feed is chosen.
function BS.Chosen(name)
  for _, n in ipairs(chosenList()) do if n == name then return true end end
  return false
end

-- Chooses a feed (it goes last) or drops it, and lays the strip out again.
function BS.Choose(name, on)
  local list = chosenList()
  for i = #list, 1, -1 do if list[i] == name then table.remove(list, i) end end
  if on then list[#list + 1] = name end
  if BS.frame then BS.Layout() end
end

-- Slots -------------------------------------------------------------------------------------

-- Hover: the feed's own tooltip, else its own OnEnter.
function BS.OnEnter(slot)
  local obj, tip = slot.obj, _G.GameTooltip
  if obj.OnTooltipShow and tip then
    tip:SetOwner(slot, "ANCHOR_BOTTOM")
    obj.OnTooltipShow(tip)
    tip:Show()
  elseif obj.OnEnter then obj.OnEnter(slot) end
end

-- The mouse left: the tooltip goes, else the feed's own OnLeave.
function BS.OnLeave(slot)
  local obj, tip = slot.obj, _G.GameTooltip
  if obj.OnTooltipShow and tip then tip:Hide() elseif obj.OnLeave then obj.OnLeave(slot) end
end

-- A click, passed to the feed.
function BS.OnClick(slot, button)
  if slot.obj.OnClick then slot.obj.OnClick(slot, button) end
end

-- One slot, i-th from the left: the feed's icon and text.
local function makeSlot(i)
  local b = CreateFrame("Button", "Vanguard_BrokerSlot" .. i, BS.frame)
  b:SetSize(BS.SLOT_W, BS.H)
  b:SetPoint("LEFT", BS.frame, "LEFT", 4 + (i - 1) * BS.SLOT_W, 0)
  b.icon = b:CreateTexture(nil, "ARTWORK")
  b.icon:SetSize(14, 14)
  b.icon:SetPoint("LEFT", b, "LEFT", 2, 0)
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "small", "text")
  b.text:SetPoint("LEFT", b.icon, "RIGHT", 4, 0)
  b.text:SetPoint("RIGHT", b, "RIGHT", -2, 0)
  return b
end

-- Wires a slot's hover and clicks to its feed.
local function wireSlot(b)
  b:RegisterForClicks("AnyUp")
  b:SetScript("OnEnter", BS.OnEnter)
  b:SetScript("OnLeave", BS.OnLeave)
  b:SetScript("OnClick", BS.OnClick)
  b:Hide()
  return b
end

-- Puts a feed in a slot and shows it.
function BS.Fill(slot, name, obj)
  slot.name, slot.obj = name, obj
  slot.icon:SetTexture(obj.icon)
  slot.icon:SetShown(obj.icon ~= nil)
  slot.text:SetText(BS.Text(obj))
  slot:Show()
end

-- Shows the chosen feeds that exist, in order, up to MAX; the strip hides when it has none.
function BS.Layout()
  local ldb, shown = BS.Broker(), 0
  for _, name in ipairs(chosenList()) do
    local obj = ldb and ldb:GetDataObjectByName(name)
    if obj and shown < BS.MAX then shown = shown + 1 BS.Fill(BS.slots[shown], name, obj) end
  end
  for i = shown + 1, BS.MAX do BS.slots[i]:Hide() end
  BS.frame:SetWidth(math.max(shown, 1) * BS.SLOT_W + 8)
  BS.frame:SetShown(shown > 0)
end

-- A feed changed (LibDataBroker's callback: event, name, key, value): repaint its slot if it shows.
function BS.OnChanged(_, name)
  for _, slot in ipairs(BS.slots) do
    if slot:IsShown() and slot.name == name then BS.Fill(slot, name, slot.obj) end
  end
end

-- Listens to LibDataBroker once an addon has loaded it: changes repaint, new feeds lay out again.
function BS.Hook()
  local ldb = BS.Broker()
  if BS.hooked or not ldb then return end
  BS.hooked = true
  ldb.RegisterCallback(BS, "LibDataBroker_AttributeChanged", BS.OnChanged)
  ldb.RegisterCallback(BS, "LibDataBroker_DataObjectCreated", BS.Layout)
  BS.Layout()
end

-- Module entry point (Core/Modules.lua): the strip at the top center, its slots, and the feeds.
function BS.Enable(settings)
  BS.settings = settings
  BS.frame = T.HudPanel(CreateFrame("Frame", "Vanguard_BrokerStrip", UIParent))
  BS.frame:SetSize(BS.SLOT_W + 8, BS.H + 4)
  ns.Mover(BS.frame, "brokerstrip", "Broker strip", { "TOP", "TOP", 0, -4 })
  BS.slots = {}
  for i = 1, BS.MAX do BS.slots[i] = wireSlot(makeSlot(i)) end
  BS.Layout()
  BS.Hook()
  ns.On("ADDON_LOADED", BS.Hook)
end
