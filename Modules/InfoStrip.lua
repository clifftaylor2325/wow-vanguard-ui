-- A strip of numbers under the minimap, two columns, up to seven rows:
--   durability (orange at 25% or less, red at 10% or less) · free bag slots
--   gold
--   fps and latency · ammo (hunters, warriors, rogues) or soul shards (warlocks)
--   the time and the day and date ("21:04  Tue 13 Oct"), with a calendar button
--   leveling: XP per hour · time to level
--   gold per hour this session · what your auction sales came to (Modules/AuctionLedger.lua, off until you turn it on)
--   your damage per second in the last fight · your place in it in a group (each off until you turn it on)
-- Each block reads the client when its event fires (fps, latency and the
-- clock once a second on one shared timer), shows only where the client
-- can answer, and sets its text only when it changed. Values the client
-- hides show nothing. The strip is seen always unless its visibility setting
-- says otherwise (Core/Visibility.lua): on mouseover, in combat, hidden, or on a checklist.

local ADDON, ns = ...

local T = ns.Theme
local V = ns.Visibility

local IS = ns.Module("InfoStrip", {
  defaults = {
    durability = true, bags = true, system = true, gold = true, ammo = true, clock = true, shards = true,
    xprate = true, leveltime = true, goldrate = true, dps = false, rank = false, ahgold = false, date = true,
  },
})

IS.WIDTH, IS.ROW = 182, 18
-- Where each block sits: row, and its side of the row (two columns, so no two blocks run together).
IS.BLOCKS = {
  durability = { 1, "LEFT" }, bags = { 1, "RIGHT" },
  gold = { 2, "LEFT" },
  system = { 3, "LEFT" }, ammo = { 3, "RIGHT" },
  -- Soul shards share ammo's place: no class carries both.
  shards = { 3, "RIGHT" },
  -- The time, then the day and date beside it (IS.PlaceDate), with the calendar button at the row's right end.
  clock = { 4, "LEFT" }, date = { 4, "LEFT" },
  xprate = { 5, "LEFT" }, leveltime = { 5, "RIGHT" },
  -- Gold per hour shares its row with the auction sales (off by default).
  goldrate = { 6, "LEFT" }, ahgold = { 6, "RIGHT" },
  dps = { 7, "LEFT" }, rank = { 7, "RIGHT" },
}
-- The calendar button beside the date: its side and icon size (UI units) and the gap to the strip's edge.
IS.CALENDAR, IS.CALENDAR_GLYPH, IS.CALENDAR_GAP = 18, 14, 3
IS.DATE_GAP = 8
IS.CALENDAR_ICON = { slot = "Calendar" }
-- The session's rates wait this long (seconds) before showing: early numbers jump about.
IS.SETTLE = 60
-- The leveling blocks, repainted every few seconds as the session's rates change.
IS.RATES = { "xprate", "leveltime", "goldrate" }
-- Classes that carry ammo; hunters see 0 when they run out.
IS.AMMO_CLASSES = { HUNTER = true, WARRIOR = true, ROGUE = true }
-- The ammo inventory slot, and the equipment slots durability reads.
IS.AMMO_SLOT, IS.LAST_SLOT = 0, 19
-- The Soul Shard item (vanilla's, 6265), and the last bag counted: the reagent bag
-- (Enum.BagIndex.ReagentBag), where Forever lets shards go.
IS.SHARD_ITEMS, IS.LAST_BAG = { [6265] = true }, 5

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

-- How many soul shards one bag slot's item is (0 for anything else or a hidden item).
local function shardsIn(item)
  if type(item) ~= "table" or ns.IsSecret(item.itemID) or not IS.SHARD_ITEMS[item.itemID] then return 0 end
  return ns.PlainNumber(item.stackCount) or 1
end

-- Soul shards across your bags and the reagent bag, or nil when the client can't say.
function IS.SoulShards()
  local info, slots = C_Container and C_Container.GetContainerItemInfo, C_Container and C_Container.GetContainerNumSlots
  if type(info) ~= "function" or type(slots) ~= "function" then return nil end
  local n = 0
  for bag = 0, IS.LAST_BAG do
    for slot = 1, ns.PlainNumber(slots(bag)) or 0 do n = n + shardsIn(info(bag, slot)) end
  end
  return n
end

-- Copper as "12g 34s 7c" (no gold part under a gold).
function IS.Money(copper)
  local g, s, c = math.floor(copper / 10000), math.floor(copper / 100) % 100, copper % 100
  if g > 0 then return string.format("%dg %ds %dc", g, s, c) end
  return string.format("%ds %dc", s, c)
end

-- Copper in its two biggest parts: "2g 5s", "5s 7c", "7c" (fits the leveling row).
function IS.ShortMoney(copper)
  local g, sv, c = math.floor(copper / 10000), math.floor(copper / 100) % 100, copper % 100
  if g > 0 then return string.format("%dg %ds", g, sv) end
  if sv > 0 then return string.format("%ds %dc", sv, c) end
  return c .. "c"
end

-- Seconds as "42m" (at least 1m) or "1h 05m".
function IS.Duration(seconds)
  local minutes = math.max(1, math.ceil(seconds / 60))
  if minutes < 60 then return minutes .. "m" end
  return string.format("%dh %02dm", math.floor(minutes / 60), minutes % 60)
end

-- Session --------------------------------------------------------------------------------------

-- Your XP into this level and the level's total, or nil when the client hides them.
local function xpNow()
  local cur, max = ns.PlainNumber(ask("UnitXP", "player")), ns.PlainNumber(ask("UnitXPMax", "player"))
  if cur and max and max > 0 then return cur, max end
end

-- Starts this session's counters (at login or a reload; once).
function IS.StartSession()
  if IS.session then return end
  local cur, max = xpNow()
  IS.session = { start = ask("GetTime") or 0, gained = 0, xp = cur, max = max, money = ns.PlainNumber(ask("GetMoney")) }
end

-- Counts the XP gained since the last update; after a level-up, the old level's rest too.
function IS.CountXP()
  local s, cur, max = IS.session, xpNow()
  if not (s and cur and s.xp) then return end
  if cur >= s.xp then s.gained = s.gained + cur - s.xp
  else s.gained = s.gained + (s.max - s.xp) + cur end
  s.xp, s.max = cur, max
end

-- Seconds this session has run, or nil while it's still settling.
local function sessionTime()
  local s = IS.session
  local elapsed = s and (ask("GetTime") or 0) - s.start
  if elapsed and elapsed >= IS.SETTLE then return elapsed end
end

-- XP per hour this session, or nil (settling, nothing gained yet).
function IS.XPRate()
  local elapsed = sessionTime()
  if not elapsed or IS.session.gained <= 0 then return nil end
  return IS.session.gained * 3600 / elapsed
end

-- Copper per hour this session (negative when spending), or nil (settling, unchanged, hidden).
function IS.GoldRate()
  local elapsed, now = sessionTime(), ns.PlainNumber(ask("GetMoney"))
  local start = IS.session and IS.session.money
  if not (elapsed and now and start) or now == start then return nil end
  return (now - start) * 3600 / elapsed
end

-- Damage meter ---------------------------------------------------------------------------------

-- An Enum value from the client, or nil when it has none.
local function enum(kind, key)
  local t = Enum and Enum[kind]
  return t and t[key] or nil
end

-- The current (or last) fight's session of one kind of the game's damage meter (an Enum.DamageMeterType
-- key such as "Dps"), and the session type it was asked with; nil in combat and wherever the client keeps it hidden.
local function meterSession(what)
  local get = C_DamageMeter and C_DamageMeter.GetCombatSessionFromType
  local kind, which = enum("DamageMeterSessionType", "Current"), enum("DamageMeterType", what)
  if type(get) ~= "function" or kind == nil or which == nil or ns.InCombat() then return nil end
  local session = get(kind, which)
  if type(session) ~= "table" or ns.IsSecret(session) then return nil end
  return session, kind
end

-- The damage per second session.
local function dpsSession()
  return meterSession("Dps")
end

-- One kind of meter's list of lines for the current (or last) fight, top first (the fight recap
-- reads Interrupts, Dispels and so on); nil where the client has none.
function IS.MeterSources(what)
  local session = meterSession(what)
  if session and type(session.combatSources) == "table" then return session.combatSources end
end

-- That session's list of lines, top first; nil where there's none.
local function dpsSources()
  local session = dpsSession()
  if session and type(session.combatSources) == "table" then return session.combatSources end
end

-- Your line in that list, its place in it and how many lines it has (nil without yours).
-- Fight history (Modules/FightHistory.lua) reads it too.
function IS.MyLine()
  local sources = dpsSources()
  for i, source in ipairs(sources or {}) do
    if source.isLocalPlayer == true then return source, i, #sources end
  end
end

-- How long the current (or last) fight lasted, in seconds: the session's own figure,
-- else the meter's; nil in combat, when hidden, or when the client can't say.
function IS.FightSeconds()
  local session, kind = dpsSession()
  if not session then return nil end
  local seconds = C_DamageMeter.GetSessionDurationSeconds
  return ns.PlainNumber(session.durationSeconds) or (type(seconds) == "function" and ns.PlainNumber(seconds(kind)) or nil)
end

-- Your damage per second in the current (or last) fight; nil in combat and where it's hidden.
function IS.DPS()
  local line = IS.MyLine()
  return line and ns.PlainNumber(line.amountPerSecond)
end

-- Your place in the last fight's damage per second and how many were listed, or nil. The
-- client has no rank field: the game's own meter numbers its lines in the list's order.
function IS.Rank()
  if not (ns.Client.Has("damageMeter") and ns.Client.Has("meterEnums")) then return nil end
  local line, place, count = IS.MyLine()
  if line then return place, count end
end

-- True at the level cap, where XP stops.
local function atMaxLevel()
  local level, cap = ns.PlainNumber(ask("UnitLevel", "player")), ns.PlainNumber(ask("GetMaxPlayerLevel"))
  return level ~= nil and cap ~= nil and level >= cap
end

-- Block texts (text, color token), nil to hide ------------------------------------------------

IS.TEXT = {}

-- Durability, colored as it wears down.
function IS.TEXT.durability()
  local p = IS.Durability()
  if p then return p .. "% durability", IS.DurabilityColor(p) end
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
  if fps and ms then return string.format("%d fps · %d ms", math.floor(fps), ms), "text2" end
end

-- Your gold.
function IS.TEXT.gold()
  local copper = ns.PlainNumber(ask("GetMoney"))
  if copper then return IS.Money(copper), "gold" end
end

-- Whether your ranged weapon needs ammo, as C_PaperDollInfo.AmmoNeeded says (Forever's
-- PaperDollInfoDocumentation.lua); nil where the client can't say.
function IS.AmmoNeeded()
  local api = C_PaperDollInfo and C_PaperDollInfo.AmmoNeeded
  local needed
  if type(api) == "function" then needed = api() end
  if type(needed) == "boolean" then return needed end
end

-- Your ammo: for any class whose ranged weapon needs it (0 in red), else for classes that carry it
-- (hunters see 0, in red).
function IS.TEXT.ammo()
  local _, class = UnitClass("player")
  local needed = IS.AmmoNeeded()
  if needed == false or ns.IsSecret(class) or (needed == nil and not IS.AMMO_CLASSES[class]) then return nil end
  local n = ns.PlainNumber(ask("GetInventoryItemCount", "player", IS.AMMO_SLOT)) or 0
  if n > 0 or needed or class == "HUNTER" then return "ammo " .. n, n == 0 and "bad" or "text" end
end

-- Your soul shards, for warlocks (none is red).
function IS.TEXT.shards()
  local _, class = UnitClass("player")
  if ns.IsSecret(class) or class ~= "WARLOCK" then return nil end
  local n = IS.SoulShards()
  if n then return "shards " .. n, n == 0 and "bad" or "text" end
end

-- The time.
function IS.TEXT.clock()
  local t = ask("date", "%H:%M")
  if t then return t, "text" end
end

-- The day and date, "Tue 13 Oct".
function IS.TEXT.date()
  local t = ask("date", "%a %d %b")
  if t then return t, "text" end
end

-- XP per hour this session (the XP bar shows rested XP).
function IS.TEXT.xprate()
  local rate = not atMaxLevel() and IS.XPRate()
  if rate then return ns.GetModule("DataBars").Short(math.floor(rate)) .. " xp/h", "text" end
end

-- Time to the next level at this session's pace.
function IS.TEXT.leveltime()
  local rate, cur, max = not atMaxLevel() and IS.XPRate(), xpNow()
  if rate and cur then return "lvl " .. IS.Duration((max - cur) * 3600 / rate), "text2" end
end

-- Gold per hour this session (red while you're spending).
function IS.TEXT.goldrate()
  local rate = IS.GoldRate()
  if not rate then return nil end
  local sign = rate < 0 and "-" or "+"
  return sign .. IS.ShortMoney(math.floor(math.abs(rate))) .. "/h", rate < 0 and "bad" or "gold"
end

-- Your damage per second in the last fight (it updates when the fight ends).
function IS.TEXT.dps()
  local dps = IS.DPS()
  if dps and dps > 0 then return ns.GetModule("DataBars").Short(math.floor(dps)) .. " dps", "text" end
end

-- Your place in the last fight's damage, in a group ("#2 of 5"; gold at the top).
function IS.TEXT.rank()
  local place, count = IS.Rank()
  if place and count > 1 then return string.format("#%d of %d", place, count), place == 1 and "gold" or "text2" end
end

-- What your auction sales noted this session came to ("AH +12g 5s"; the sales ledger, Modules/AuctionLedger.lua).
function IS.TEXT.ahgold()
  local copper = ns.AuctionLedger.SessionSales()
  if copper > 0 then return "AH +" .. IS.ShortMoney(copper), "gold" end
end

-- Showing -----------------------------------------------------------------------------------

-- The lowest row with a block showing (0 when nothing shows).
local function rowsShown()
  local rows = 0
  for key, fs in pairs(IS.texts) do
    if fs:IsShown() then rows = math.max(rows, IS.BLOCKS[key][1]) end
  end
  return rows
end

-- Hides the strip while it has nothing to show (no empty box on screen) or its
-- visibility hides it, and grows it to a third (or fourth) row only while a block there shows.
local function fitRows()
  local rows = rowsShown()
  IS.frame:SetShown(rows > 0 and V.Shows(IS.frame))
  IS.frame:SetHeight(IS.ROW * math.max(rows, 2) + 4)
end

-- Sits the date right after the time, or at the row's left edge while the time is off.
function IS.PlaceDate()
  local date, clock = IS.texts.date, IS.texts.clock
  date:ClearAllPoints()
  if clock:IsShown() then date:SetPoint("LEFT", clock, "RIGHT", IS.DATE_GAP, 0)
  else date:SetPoint("LEFT", IS.frame, "TOPLEFT", 6, -(IS.BLOCKS.date[1] - 0.5) * IS.ROW) end
end

-- Repaints one block: hidden when off or when the client can't answer; the strip fits what shows.
function IS.Paint(key)
  local fs = IS.texts and IS.texts[key]
  if not fs then return end
  local text, color
  if IS.settings[key] then text, color = IS.TEXT[key]() end
  fs:SetShown(text ~= nil)
  if key == "date" and IS.calendar then IS.calendar:SetShown(text ~= nil) end
  if text and text ~= fs.last then fs:SetText(text) fs.last = text end
  if color then T.Color(fs, color) end
  if key == "clock" or key == "date" then IS.PlaceDate() end
  fitRows()
end

-- Repaints every block.
function IS.UpdateAll()
  for key in pairs(IS.BLOCKS) do IS.Paint(key) end
end

-- Repaints the leveling blocks.
function IS.PaintRates()
  for _, key in ipairs(IS.RATES) do IS.Paint(key) end
end

-- Building ----------------------------------------------------------------------------------

-- One block's text, at its side of its row (left blocks 6 in from the left edge, right ones 6 from the right).
local function addText(frame, key)
  local row, point = IS.BLOCKS[key][1], IS.BLOCKS[key][2]
  local fs = T.Text(frame:CreateFontString(nil, "OVERLAY"), "small", "text")
  local x = point == "LEFT" and 6 or -6
  fs:SetPoint(point, frame, "TOP" .. point, x, -(row - 0.5) * IS.ROW)
  return fs
end

-- The calendar button (shown with the date): a slot button of the minimap's kind at the date row's right end,
-- opening the calendar like /calendar.
local function addCalendar(frame)
  local b = CreateFrame("Button", "Vanguard_InfoStripCalendar", frame)
  b:SetPoint("RIGHT", frame, "TOPRIGHT", -IS.CALENDAR_GAP, -(IS.BLOCKS.date[1] - 0.5) * IS.ROW)
  b:SetScript("OnClick", ns.Guard("click info strip calendar", function() if type(ToggleCalendar) == "function" then ToggleCalendar() end end))
  b:SetScript("OnEnter", ns.Guard("info strip calendar tip", function(self) GameTooltip:SetOwner(self, "ANCHOR_LEFT") GameTooltip:SetText("Calendar", T.RGB("text")) GameTooltip:Show() end))
  b:SetScript("OnLeave", ns.Guard("info strip calendar tip", function() GameTooltip:Hide() end))
  ns.GetModule("Minimap").SlotButton(b, IS.CALENDAR_ICON.slot, IS.CALENDAR, IS.CALENDAR_GLYPH)
  IS.calendar = b
end

-- The strip's timer while it shows: the clock every second, fps and latency every third, the rates every fifth.
local function ticker(frame)
  local ticks = 0
  ns.Every("info strip", 1, function()
    ticks = ticks + 1
    IS.Paint("clock")
    if ticks % 3 == 0 then IS.Paint("system") end
    if ticks % 5 == 0 then IS.PaintRates() end
    if ticks % 60 == 0 then IS.Paint("date") end
  end, frame)
end

-- Applies the strip's visibility setting: now, or when combat ends (the client's
-- state driver shows or hides it from then on, and it fades on mouseover).
function IS.ApplyVisibility()
  ns.OutOfCombat(function() V.ApplyNow(IS.frame, IS.settings.visibility, IS.settings.showWhen) end, IS.frame)
end

-- Follows the strip's visibility from the start: the mouse over it, the state's
-- changes (fitRows shows or hides it), and zone changes for In an instance.
local function watchVisibility(f)
  f.vgOnState = fitRows
  V.WatchHover(f)
  V.Track(f, IS.ApplyVisibility)
  IS.ApplyVisibility()
end

-- The movable strip, just under the minimap.
local function build()
  local f = T.HudPanel(CreateFrame("Frame", "Vanguard_InfoStrip", UIParent))
  IS.frame = f
  f:SetSize(IS.WIDTH, IS.ROW * 2 + 4)
  ns.Mover(f, "infostrip", "Info strip", { "TOPRIGHT", "TOPRIGHT", -12, -200 })
  IS.texts = {}
  for key in pairs(IS.BLOCKS) do IS.texts[key] = addText(f, key) end
  addCalendar(f)
  ticker(f)
  IS.UpdateAll()
  watchVisibility(f)
end

-- Event -> the block it repaints.
IS.EVENTS = {
  UPDATE_INVENTORY_DURABILITY = "durability", BAG_UPDATE_DELAYED = "bags",
  PLAYER_MONEY = "gold", UNIT_INVENTORY_CHANGED = "ammo",
}

-- The game's frames the strip stands in for whenever the module is on, whatever its blocks say: the
-- armoured-man durability figure (the strip's durability block and the character pane's gear labels
-- carry the warning; a player who wants the game's own figure turns the module off).
IS.HIDES = { "DurabilityFrame" }
-- The game's frames a block replaces, hidden while that block is on: the minimap clock and calendar
-- button (/calendar still opens it).
IS.REPLACES = { clock = { "TimeManagerClockButton", "GameTimeFrame" } }

-- Hides the game's frames the strip stands in for, and those that switched-on blocks replace.
local function hideReplaced(settings)
  for _, name in ipairs(IS.HIDES) do ns.GetModule("UnitFrames").HideBlizzard(name) end
  for key, names in pairs(IS.REPLACES) do
    if settings[key] then
      for _, name in ipairs(names) do ns.GetModule("UnitFrames").HideBlizzard(name) end
    end
  end
end

-- XP came in: count it and repaint the leveling blocks.
local function onXP()
  IS.CountXP()
  IS.PaintRates()
end

-- Repaints each block when its event fires.
local function watch()
  for event, key in pairs(IS.EVENTS) do ns.On(event, function() IS.Paint(key) end) end
  ns.On("BAG_UPDATE_DELAYED", function() IS.Paint("ammo") IS.Paint("shards") end)
  ns.On("PLAYER_MONEY", function() IS.Paint("goldrate") end)
  ns.On("PLAYER_XP_UPDATE", onXP)
  ns.On("PLAYER_LEVEL_UP", IS.PaintRates)
  ns.On("PLAYER_ENTERING_WORLD", IS.UpdateAll)
  -- Your DPS is readable once a fight ends (and gone when the meter resets).
  for _, event in ipairs({ "PLAYER_REGEN_ENABLED", "DAMAGE_METER_RESET" }) do ns.On(event, function() IS.Paint("dps") IS.Paint("rank") end) end
end

-- Module entry point (Core/Modules.lua).
function IS.Enable(settings)
  IS.settings = settings
  hideReplaced(settings)
  IS.StartSession()
  build()
  watch()
end
