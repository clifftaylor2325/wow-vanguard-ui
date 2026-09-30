-- A strip of numbers under the minimap, two rows:
--   durability (orange at 25% or less, red at 10% or less) · free bag slots · fps and latency
--   gold · ammo (hunters, warriors, rogues) · clock
-- Each block reads the client when its event fires (fps, latency and the
-- clock once a second on one shared timer), shows only where the client
-- can answer, and sets its text only when it changed. Values the client
-- hides show nothing.

local ADDON, ns = ...

local T = ns.Theme

local IS = ns.Module("InfoStrip", {
  defaults = { durability = true, bags = true, system = true, gold = true, ammo = true, clock = true },
})

IS.WIDTH, IS.ROW = 182, 16
-- Where each block sits: row, and its point along the row.
IS.BLOCKS = {
  durability = { 1, "LEFT" }, bags = { 1, "CENTER" }, system = { 1, "RIGHT" },
  gold = { 2, "LEFT" }, ammo = { 2, "CENTER" }, clock = { 2, "RIGHT" },
}
-- Classes that carry ammo; hunters see 0 when they run out.
IS.AMMO_CLASSES = { HUNTER = true, WARRIOR = true, ROGUE = true }
-- The ammo inventory slot, and the equipment slots durability reads.
IS.AMMO_SLOT, IS.LAST_SLOT = 0, 19

-- Values -------------------------------------------------------------------------------------

-- Calls a client function by name; nil when this client doesn't have it.
local function ask(name, ...)
  local fn = _G[name]
  if type(fn) ~= "function" then return nil end
  return fn(...)
end

-- One slot's durability as a share (current, max), or nil for a slot without durability.
local function slotShare(slot)
  local cur, max = ask("GetInventoryItemDurability", slot)
  cur, max = ns.PlainNumber(cur), ns.PlainNumber(max)
  if cur and max and max > 0 then return cur / max end
end

-- Your most worn item's durability in whole percent, or nil when nothing has durability.
function IS.Durability()
  local low
  for slot = 1, IS.LAST_SLOT do
    local share = slotShare(slot)
    if share and (not low or share < low) then low = share end
  end
  return low and math.floor(low * 100 + 0.5) or nil
end

-- The color token for a durability percent.
function IS.DurabilityColor(percent)
  if percent <= 10 then return "bad" end
  return percent <= 25 and "warn" or "text"
end

-- Free slots across your five bags, or nil when the client can't say.
function IS.FreeSlots()
  local free = C_Container and C_Container.GetContainerNumFreeSlots
  if type(free) ~= "function" then return nil end
  local total = 0
  for bag = 0, 4 do total = total + (ns.PlainNumber(free(bag)) or 0) end
  return total
end

-- Copper as "12g 34s 7c" (no gold part under a gold).
function IS.Money(copper)
  local g, s, c = math.floor(copper / 10000), math.floor(copper / 100) % 100, copper % 100
  if g > 0 then return string.format("%dg %ds %dc", g, s, c) end
  return string.format("%ds %dc", s, c)
end

-- Block texts (text, color token), nil to hide ------------------------------------------------

IS.TEXT = {}

-- Durability, colored as it wears down.
function IS.TEXT.durability()
  local p = IS.Durability()
  if p then return p .. "%", IS.DurabilityColor(p) end
end

-- Free bag slots (red when full).
function IS.TEXT.bags()
  local n = IS.FreeSlots()
  if n then return n .. " free", n == 0 and "bad" or "text" end
end

-- Frame rate and latency.
function IS.TEXT.system()
  local fps = ns.PlainNumber(ask("GetFramerate"))
  local _, _, home, world = ask("GetNetStats")
  local ms = ns.PlainNumber(world) or ns.PlainNumber(home)
  if fps and ms then return string.format("%d fps  %d ms", math.floor(fps), ms), "text2" end
end

-- Your gold.
function IS.TEXT.gold()
  local copper = ns.PlainNumber(ask("GetMoney"))
  if copper then return IS.Money(copper), "gold" end
end

-- Your ammo, for classes that carry it (hunters see 0, in red).
function IS.TEXT.ammo()
  local _, class = UnitClass("player")
  if ns.IsSecret(class) or not IS.AMMO_CLASSES[class] then return nil end
  local n = ns.PlainNumber(ask("GetInventoryItemCount", "player", IS.AMMO_SLOT)) or 0
  if n > 0 or class == "HUNTER" then return "ammo " .. n, n == 0 and "bad" or "text" end
end

-- The time.
function IS.TEXT.clock()
  local t = ask("date", "%H:%M")
  if t then return t, "text" end
end

-- Showing -----------------------------------------------------------------------------------

-- Repaints one block: hidden when off or when the client can't answer.
function IS.Paint(key)
  local fs = IS.texts and IS.texts[key]
  if not fs then return end
  local text, color
  if IS.settings[key] then text, color = IS.TEXT[key]() end
  fs:SetShown(text ~= nil)
  if text and text ~= fs.last then fs:SetText(text) fs.last = text end
  if color then T.Color(fs, color) end
end

-- Repaints every block.
function IS.UpdateAll()
  for key in pairs(IS.BLOCKS) do IS.Paint(key) end
end

-- Building ----------------------------------------------------------------------------------

-- One block's text, at its place in its row.
local function addText(frame, key)
  local row, point = IS.BLOCKS[key][1], IS.BLOCKS[key][2]
  local fs = T.Text(frame:CreateFontString(nil, "OVERLAY"), "small", "text")
  local x = point == "LEFT" and 6 or point == "RIGHT" and -6 or 0
  fs:SetPoint(point, frame, "TOP" .. (point == "CENTER" and "" or point), x, -(row - 0.5) * IS.ROW)
  return fs
end

-- The fps, latency and clock timer: the clock every second, the rest every third.
local function ticker(frame)
  local elapsed, ticks = 0, 0
  frame:SetScript("OnUpdate", function(_, dt)
    elapsed = elapsed + dt
    if elapsed < 1 then return end
    elapsed, ticks = 0, ticks + 1
    IS.Paint("clock")
    if ticks % 3 == 0 then IS.Paint("system") end
  end)
end

-- The movable strip, just under the minimap.
local function build()
  local f = T.Panel(CreateFrame("Frame", "ForeverUI_InfoStrip", UIParent), { shadow = true })
  f:SetSize(IS.WIDTH, IS.ROW * 2 + 4)
  ns.Mover(f, "infostrip", "Info strip", { "TOPRIGHT", "TOPRIGHT", -12, -200 })
  IS.texts = {}
  for key in pairs(IS.BLOCKS) do IS.texts[key] = addText(f, key) end
  ticker(f)
  IS.UpdateAll()
end

-- Event -> the block it repaints.
IS.EVENTS = {
  UPDATE_INVENTORY_DURABILITY = "durability", BAG_UPDATE_DELAYED = "bags",
  PLAYER_MONEY = "gold", UNIT_INVENTORY_CHANGED = "ammo",
}

-- Module entry point (Core/Modules.lua).
function IS.Enable(settings)
  IS.settings = settings
  build()
  for event, key in pairs(IS.EVENTS) do ns.On(event, function() IS.Paint(key) end) end
  ns.On("BAG_UPDATE_DELAYED", function() IS.Paint("ammo") end)
  ns.On("PLAYER_ENTERING_WORLD", IS.UpdateAll)
end
