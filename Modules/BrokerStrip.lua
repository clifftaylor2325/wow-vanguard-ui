-- Broker strip: other addons' data feeds (LibDataBroker data sources: gold
-- trackers, durability, guild counts and the like) in a thin strip along the
-- top edge, left of center (clear of the frames that start 20 px down), the
-- way info-bar addons show them. Pick which feeds show
-- under Map (up to MAX, in the order picked); each slot is as wide as the
-- feed's icon and text (growing, never shrinking, while you play, so a ticking
-- figure doesn't make the strip jump), shows its own tooltip on hover (below the
-- strip in the screen's top half, above it in the bottom half), and passes clicks to it.
-- The strip and its icons grow with Text size.
-- Launchers (minimap-style buttons) stay in the minimap drawer.
--
-- Vanguard doesn't bundle LibDataBroker: every addon that shares a feed loads
-- it, so the strip uses the one they loaded, and stays hidden without one.

local ADDON, ns = ...

local T = ns.Theme

local BS = ns.Module("BrokerStrip", { defaults = { feeds = {} } })

-- How many feeds show at most, and the narrowest and widest a slot gets (its width before
-- it is measured, and the strip's with nothing in it, is SLOT_W).
BS.MAX, BS.MIN_W, BS.MAX_W, BS.SLOT_W = 4, 48, 200, 120
-- The strip's height with text at 100 % (taller for larger text), the room around a slot's icon and text,
-- and the strip's own room around its slots.
BS.H, BS.PAD, BS.EDGE = 14, 2, 4
-- The widest each feed's slot has been this session, by feed name.
BS.widths = {}

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

-- One of a feed's fields as text, or nil when it has none or the game keeps it secret (checked before anything
-- compares it).
local function plainText(v)
  if ns.IsSecret(v) or v == nil then return nil end
  return tostring(v)
end

-- What a feed shows: its text, else its label ("" for neither, or a hidden one).
function BS.Text(obj)
  return plainText(obj.text) or plainText(obj.label) or ""
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

-- Where a feed's tooltip opens: below the strip in the screen's top half, above it in the bottom half.
function BS.TipAnchor()
  local _, y = BS.frame:GetCenter()
  y = ns.PlainNumber(y)
  local low = y and y * BS.frame:GetEffectiveScale() < UIParent:GetHeight() * UIParent:GetEffectiveScale() / 2
  return low and "ANCHOR_TOP" or "ANCHOR_BOTTOM"
end

-- Hover: the feed's own tooltip, on the side with room, else its own OnEnter (which places itself).
function BS.OnEnter(slot)
  local obj, tip = slot.obj, _G.GameTooltip
  if obj.OnTooltipShow and tip then
    tip:SetOwner(slot, BS.TipAnchor())
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

-- The strip's slot height at the current Text size: room for the small text, never under BS.H.
function BS.Height()
  return math.max(BS.H, T.RoleSize("small") + 2 * BS.PAD)
end

-- One slot, i-th from the left (placed by chain): the feed's icon and text.
local function makeSlot(i)
  local b = CreateFrame("Button", "Vanguard_BrokerSlot" .. i, BS.frame)
  b.icon = b:CreateTexture(nil, "ARTWORK")
  b.icon:SetPoint("LEFT", b, "LEFT", BS.PAD, 0)
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "small", "text")
  b.text:SetPoint("LEFT", b.icon, "RIGHT", 2 * BS.PAD, 0)
  b.text:SetPoint("RIGHT", b, "RIGHT", -BS.PAD, 0)
  return b
end

-- Wires a slot's hover and clicks to its feed.
local function wireSlot(b)
  b:RegisterForClicks("AnyUp")
  b:SetScript("OnEnter", BS.OnEnter)
  b:SetScript("OnLeave", BS.OnLeave)
  b:SetScript("OnClick", ns.Guard("click broker feed", BS.OnClick))
  b:Hide()
  return b
end

-- One colour channel of a feed's icon tint (LibDataBroker's iconR, iconG, iconB): white unless it gives a number.
local function channel(v)
  return type(v) == "number" and v or 1
end

-- A feed's icon crop (LibDataBroker's iconCoords: left, right, top, bottom), or nil for the whole icon
-- (also when it gives anything but four numbers).
local function crop(obj)
  local c = obj.iconCoords
  if type(c) ~= "table" or #c ~= 4 then return nil end
  for i = 1, 4 do if type(c[i]) ~= "number" then return nil end end
  return c
end

-- A feed's icon in a slot: its texture, its own crop and tint (whole and untinted unless it gives them).
local function paintIcon(icon, obj)
  icon:SetTexture(obj.icon)
  icon:SetShown(obj.icon ~= nil)
  local c = crop(obj)
  if c then icon:SetTexCoord(c[1], c[2], c[3], c[4]) else icon:SetTexCoord(0, 1, 0, 1) end
  icon:SetVertexColor(channel(obj.iconR), channel(obj.iconG), channel(obj.iconB))
end

-- Puts a feed in a slot and shows it.
function BS.Fill(slot, name, obj)
  slot.name, slot.obj = name, obj
  paintIcon(slot.icon, obj)
  slot.text:SetText(BS.Text(obj))
  slot:Show()
end

-- A slot's width for its feed: the icon, the text as drawn and the room around them, within MIN_W and
-- MAX_W, and never narrower than that feed's slot was earlier this session. While the text's width is hidden
-- it keeps the width it had (SLOT_W before it was ever measured), and remembers nothing.
local function slotWidth(slot, icon)
  local text, before = ns.PlainNumber(slot.text:GetStringWidth()), BS.widths[slot.name]
  if not text then return before or BS.SLOT_W end
  local fit = math.ceil(icon + text + 4 * BS.PAD)
  local w = math.max(before or 0, math.min(BS.MAX_W, math.max(BS.MIN_W, fit)))
  BS.widths[slot.name] = w
  return w
end

-- Sizes the first `shown` slots for their feeds and the Text size, left to right; the strip fits them.
local function chain(shown)
  local h, x = BS.Height(), BS.EDGE
  for i = 1, shown do
    local slot = BS.slots[i]
    slot.icon:SetSize(h - BS.PAD, h - BS.PAD)
    slot:SetSize(slotWidth(slot, h - BS.PAD), h)
    slot:SetPoint("LEFT", BS.frame, "LEFT", x, 0)
    x = x + slot:GetWidth()
  end
  BS.frame:SetSize(shown > 0 and x + BS.EDGE or BS.SLOT_W + 2 * BS.EDGE, h + 2 * BS.PAD)
end

-- Shows the chosen feeds that exist, in order, up to MAX, each slot fitted to its feed; the strip hides when it has none.
function BS.Layout()
  local ldb, shown = BS.Broker(), 0
  for _, name in ipairs(chosenList()) do
    local obj = ldb and ldb:GetDataObjectByName(name)
    if obj and shown < BS.MAX then shown = shown + 1 BS.Fill(BS.slots[shown], name, obj) end
  end
  for i = shown + 1, BS.MAX do BS.slots[i]:Hide() end
  BS.shown = shown
  chain(shown)
  BS.frame:SetShown(shown > 0)
end

-- The feed changes that can make its slot wider: its text, label or icon.
BS.MEASURED = { text = true, label = true, icon = true }

-- A feed changed (LibDataBroker's callback: event, name, key, value): repaint its slot if it shows, and
-- lay the slots out again when the change made it wider.
function BS.OnChanged(_, name, key)
  for _, slot in ipairs(BS.slots) do
    if slot:IsShown() and slot.name == name then
      local before = slot:GetWidth()
      BS.Fill(slot, name, slot.obj)
      if BS.MEASURED[key] and slotWidth(slot, BS.Height() - BS.PAD) > before then chain(BS.shown) end
    end
  end
end

-- The theme changed (Text size among it): every slot is measured afresh, so slots shrink back with smaller text.
function BS.Restyle()
  BS.widths = {}
  BS.Layout()
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

-- Module entry point (Core/Modules.lua): the strip on the top edge, its slots, and the feeds.
function BS.Enable(settings)
  BS.settings = settings
  BS.frame = T.HudPanel(CreateFrame("Frame", "Vanguard_BrokerStrip", UIParent))
  BS.frame:SetSize(BS.SLOT_W + 2 * BS.EDGE, BS.Height() + 2 * BS.PAD)
  ns.Mover(BS.frame, "brokerstrip", "Broker strip", { "TOP", "TOP", -200, 0 })
  BS.slots = {}
  for i = 1, BS.MAX do BS.slots[i] = wireSlot(makeSlot(i)) end
  BS.Layout()
  BS.Hook()
  ns.On("ADDON_LOADED", BS.Hook)
  T.OnChanged(BS.Restyle)
end
