-- A strip of numbers under the minimap, two columns, up to seven rows:
--   durability (orange at 25% or less, red at 10% or less) · free bag slots
--   gold
--   fps and latency · ammo (hunters, warriors, rogues) or soul shards (warlocks)
--   the time as the game's clock shows it and the day and date ("21:04  Tue 13 Oct"), with a calendar button
--     that counts the invites waiting
--   leveling: XP per hour · time to level
--   gold per hour this session · what your auction sales came to (Modules/AuctionLedger.lua, off until you turn it on)
--   your damage per second in the last fight · your place in it in a group (each off until you turn it on)
-- Each block reads the client when its event fires (fps, latency and the
-- clock once a second on one shared timer), shows only where the client
-- can answer, and sets its text only when it changed. Values the client
-- hides show nothing. The strip is seen always unless its visibility setting
-- says otherwise (Core/Visibility.lua): on mouseover, in combat, hidden, or on a checklist.

local ADDON, ns = ...
local L = ns.L

local T = ns.Theme
local V = ns.Visibility

local IS = ns.Module("InfoStrip", {
  defaults = {
    durability = true, bags = true, system = true, gold = true, ammo = true, clock = true, shards = true,
    xprate = true, leveltime = true, goldrate = true, dps = false, rank = false, ahgold = false, date = true,
  },
})

-- The strip's width and row height with text at 100 %; a larger Text size widens and heightens them in step.
IS.WIDTH, IS.ROW = 182, 18
-- Where the strip sits (just under the minimap), the most rows it shows, the room it keeps under its rows,
-- and the gap from its last row down to the quest tracker's spot.
IS.HOME = { "TOPRIGHT", "TOPRIGHT", -12, -200 }
IS.MOST_ROWS, IS.EDGE, IS.TRACKER_GAP = 7, 4, 6
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
-- How far a row's blocks sit in from the strip's sides (units).
IS.SIDE = 6
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

-- Calls a client function by name (ns.Client.Call); nil when this client doesn't have it.
local ask = ns.Client.Call

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

-- Free slots that take anything across your five bags, counted as the menu bar's backpack counts them
-- (a soul bag's or quiver's slots hold only shards or ammo, so they are left out); nil when the client can't say.
function IS.FreeSlots()
  return ns.GetModule("MenuStrip").FreeSlots()
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
  local g, s, c = math.floor(copper / 10000), math.floor(copper / 100) % 100, math.floor(copper % 100)
  if g > 0 then return ns.Format(L["{gold}g {silver}s {copper}c"], { gold = g, silver = s, copper = c }) end
  return ns.Format(L["{silver}s {copper}c"], { silver = s, copper = c })
end

-- Copper in its two biggest parts: "2g 5s", "5s 7c", "7c" (fits the leveling row).
function IS.ShortMoney(copper)
  local g, sv, c = math.floor(copper / 10000), math.floor(copper / 100) % 100, math.floor(copper % 100)
  if g > 0 then return ns.Format(L["{gold}g {silver}s"], { gold = g, silver = sv }) end
  if sv > 0 then return ns.Format(L["{silver}s {copper}c"], { silver = sv, copper = c }) end
  return ns.Format(L["{copper}c"], { copper = c })
end

-- Seconds as "42m" (at least 1m) or "1h 05m".
function IS.Duration(seconds)
  local minutes = math.max(1, math.ceil(seconds / 60))
  if minutes < 60 then return ns.Format(L["{minutes}m"], { minutes = minutes }) end
  return ns.Format(L["{hours}h {minutes}m"], { hours = math.floor(minutes / 60), minutes = string.format("%02d", minutes % 60) })
end

-- Session --------------------------------------------------------------------------------------

-- Your XP into this level and the level's total, or nil when the client hides them.
local function xpNow()
  local cur, max = ns.PlainNumber(ask("UnitXP", "player")), ns.PlainNumber(ask("UnitXPMax", "player"))
  if cur and max and max > 0 then return cur, max end
end

-- Starts this session's counters when the strip is enabled (once). A reload swaps them for the saved
-- ones at PLAYER_ENTERING_WORLD (IS.ResumeSession). GetTime runs on across a reload, so the start stays good.
function IS.StartSession()
  if IS.session then return end
  local cur, max = xpNow()
  local money = ns.PlainNumber(ask("GetMoney"))
  local now = ask("GetTime") or 0
  IS.session = { start = now, saved = now, gained = 0, xp = cur, max = max, money = money, last = money, earned = 0, spent = 0 }
end

-- How many seconds after the game saved a session (at the logout or reload, IS.StampSession) it can carry on:
-- a /reload takes a few; anything older was an earlier login, saved while the strip was on and left since.
IS.RESUME_WITHIN = 300
-- A saved session's fields its counters read: the ones that must be numbers, and the ones that may also be
-- missing (the client hid them at the start).
IS.SESSION_NUMBERS = { "start", "gained", "earned", "spent", "saved" }
IS.SESSION_MAYBE = { "xp", "max", "money", "last" }

-- Whether every field a saved session's counters read is of the kind they need (an edited or older file
-- otherwise breaks every count after it).
local function wellFormed(s)
  for _, k in ipairs(IS.SESSION_NUMBERS) do if type(s[k]) ~= "number" then return false end end
  for _, k in ipairs(IS.SESSION_MAYBE) do if s[k] ~= nil and type(s[k]) ~= "number" then return false end end
  return (s.xp == nil) == (s.max == nil)
end

-- This character's saved session (VanguardCharDB.infoSession), or nil when there is none to carry on: it must
-- be whole, and saved moments ago (GetTime runs on across a reload and logins; it starts again after a restart).
local function savedSession()
  local s = type(VanguardCharDB) == "table" and VanguardCharDB.infoSession
  if type(s) ~= "table" or not wellFormed(s) then return nil end
  local now = ask("GetTime") or 0
  local age = now - s.saved
  if s.start <= now and age >= 0 and age <= IS.RESUME_WITHIN then return s end
end

-- Marks the session with when the game saved it (PLAYER_LOGOUT fires at a reload and a logout).
function IS.StampSession()
  if IS.session then IS.session.saved = ask("GetTime") or 0 end
end

-- Keeps the session in the character's saved file, which the game writes at a reload or logout.
local function keepSession()
  if type(VanguardCharDB) == "table" then VanguardCharDB.infoSession = IS.session end
end

-- A reload carries the saved session on; a fresh login (or no saved session) keeps the new one; zoning
-- (neither flag) changes nothing. The game's flags are plain booleans.
function IS.ResumeSession(_, isLogin, isReload)
  if not (isLogin or isReload) then return end
  local saved = isReload and savedSession()
  if saved then IS.session = saved end
  keepSession()
  IS.PaintRates()
end

-- Starts the rates counting again from now (a right-click on a rate); the gold tooltip's earned and spent
-- still count from the login.
function IS.RestartSession()
  local old = IS.session or {}
  IS.session = nil
  IS.StartSession()
  IS.session.earned, IS.session.spent = old.earned or 0, old.spent or 0
  keepSession()
  IS.PaintRates()
end

-- Counts the money earned and spent since the last change (for the gold tooltip).
function IS.CountMoney()
  local s, now = IS.session, ns.PlainNumber(ask("GetMoney"))
  if not (s and now and s.last) then return end
  if now > s.last then s.earned = (s.earned or 0) + now - s.last else s.spent = (s.spent or 0) + s.last - now end
  s.last = now
end

-- Counts the XP gained since the last update; after a level-up, the old level's rest too. A new level
-- shows as a new level total, even when one big gain lands at or above the old XP.
function IS.CountXP()
  local s, cur, max = IS.session, xpNow()
  if not (s and cur and s.xp) then return end
  local sameLevel = max == s.max
  if sameLevel and cur >= s.xp then s.gained = s.gained + cur - s.xp
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
  if p then return ns.Format(L["{percent}% durability"], { percent = p }), IS.DurabilityColor(p) end
end

-- Free bag slots, toned as the backpack's count (amber when few, red when full).
function IS.TEXT.bags()
  local n = IS.FreeSlots()
  if n then return ns.Format(L["{count} free"], { count = n }), ns.GetModule("MenuStrip").FreeTone(n) end
end

-- Frame rate and latency.
function IS.TEXT.system()
  local fps = ns.PlainNumber(ask("GetFramerate"))
  local _, _, home, world = ask("GetNetStats")
  local ms = ns.PlainNumber(world) or ns.PlainNumber(home)
  if fps and ms then return ns.Format(L["{fps} fps · {ms} ms"], { fps = math.floor(fps), ms = math.floor(ms) }), "text2" end
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
  if n > 0 or needed or class == "HUNTER" then return ns.Format(L["ammo {count}"], { count = n }), n == 0 and "bad" or "text" end
end

-- Your soul shards, for warlocks (none is red).
function IS.TEXT.shards()
  local _, class = UnitClass("player")
  if ns.IsSecret(class) or class ~= "WARLOCK" then return nil end
  local n = IS.SoulShards()
  if n then return ns.Format(L["shards {count}"], { count = n }), n == 0 and "bad" or "text" end
end

-- The time as the game's clock shows it (realm or local time, 12 or 24 hours, as set in the game's
-- clock window); the computer's 24-hour time on a client without the game's clock helpers.
function IS.TEXT.clock()
  local t = ask("GameTime_GetTime", true) or ask("date", "%H:%M")
  if t then return t, "text" end
end

-- Day and month names for the realm's date, as date("%a %d %b") writes the computer's.
IS.WEEKDAYS = { L["Sun"], L["Mon"], L["Tue"], L["Wed"], L["Thu"], L["Fri"], L["Sat"] }
IS.MONTHS = { L["Jan"], L["Feb"], L["Mar"], L["Apr"], L["May"], L["Jun"], L["Jul"], L["Aug"], L["Sep"], L["Oct"], L["Nov"], L["Dec"] }

-- The realm's date ("Tue 13 Oct", C_DateAndTime) while the game's clock shows realm time, so the date beside
-- the time is that time's day; nil while it shows local time or on a client without these helpers.
local function realmDate()
  local get = C_DateAndTime and C_DateAndTime.GetCurrentCalendarTime
  if type(get) ~= "function" or type(_G.GameTime_GetTime) ~= "function" or ask("GetCVarBool", "timeMgrUseLocalTime") then return nil end
  local d = get()
  local day, month = IS.WEEKDAYS[ns.PlainNumber(d.weekday) or 0], IS.MONTHS[ns.PlainNumber(d.month) or 0]
  if day and month and ns.PlainNumber(d.monthDay) then return string.format("%s %02d %s", day, d.monthDay, month) end
end

-- The day and date, "Tue 13 Oct": the day the time beside it belongs to.
function IS.TEXT.date()
  local t = realmDate() or ask("date", "%a %d %b")
  if t then return t, "text" end
end

-- XP per hour this session (the XP bar shows rested XP).
function IS.TEXT.xprate()
  local rate = not atMaxLevel() and IS.XPRate()
  if rate then return ns.Format(L["{xp} xp/h"], { xp = ns.GetModule("DataBars").Short(math.floor(rate)) }), "text" end
end

-- Time to the next level at this session's pace.
function IS.TEXT.leveltime()
  local rate, cur, max = not atMaxLevel() and IS.XPRate(), xpNow()
  if rate and cur then return ns.Format(L["lvl {time}"], { time = IS.Duration((max - cur) * 3600 / rate) }), "text2" end
end

-- Gold per hour this session (red while you're spending).
function IS.TEXT.goldrate()
  local rate = IS.GoldRate()
  if not rate then return nil end
  local sign = rate < 0 and "-" or "+"
  return ns.Format(L["{money}/h"], { money = sign .. IS.ShortMoney(math.floor(math.abs(rate))) }), rate < 0 and "bad" or "gold"
end

-- Your damage per second in the last fight (it updates when the fight ends).
function IS.TEXT.dps()
  local dps = IS.DPS()
  if dps and dps > 0 then return ns.Format(L["{dps} dps"], { dps = ns.GetModule("DataBars").Short(math.floor(dps)) }), "text" end
end

-- Your place in the last fight's damage, in a group ("#2 of 5"; gold at the top).
function IS.TEXT.rank()
  local place, count = IS.Rank()
  if place and count > 1 then return ns.Format(L["#{place} of {count}"], { place = place, count = count }), place == 1 and "gold" or "text2" end
end

-- What your auction sales noted this session came to ("AH +12g 5s"; the sales ledger, Modules/AuctionLedger.lua).
function IS.TEXT.ahgold()
  local copper = ns.AuctionLedger.SessionSales()
  if copper > 0 then return ns.Format(L["AH +{money}"], { money = IS.ShortMoney(copper) }), "gold" end
end

-- Showing -----------------------------------------------------------------------------------

-- How much larger the strip's text is drawn than at 100 % Text size; never under 1, so smaller text
-- keeps today's strip (the calendar button's 18-unit slot still fits a row).
local function textGrowth()
  return math.max(1, T.RoleSize("small") / T.ROLES.small.size)
end

-- The strip's row height at the current Text size.
function IS.Row()
  return math.floor(IS.ROW * textGrowth() + 0.5)
end

-- The strip's width at the current Text size.
function IS.Width()
  return math.floor(IS.WIDTH * textGrowth() + 0.5)
end

-- How far down from the strip's top a row's middle sits.
local function rowY(row)
  return -(row - 0.5) * IS.Row()
end

-- How many rows have a block showing, counting the fixed rows down to upTo: the rows go up the strip with
-- nothing left blank between, whichever block is off.
local function shownRows(upTo)
  local seen, count = {}, 0
  for key, fs in pairs(IS.fonts) do
    local row = IS.BLOCKS[key][1]
    if fs:IsShown() and row <= upTo and not seen[row] then seen[row] = true count = count + 1 end
  end
  return count
end

-- Where a block's row sits on the strip now: its fixed row less the rows above it with nothing showing.
local function shownRow(key)
  return math.max(1, shownRows(IS.BLOCKS[key][1]))
end

-- The rows that have a block showing (0 when nothing shows).
local function rowsShown()
  return shownRows(IS.MOST_ROWS)
end

-- How wide each row's shown blocks are side by side (units, by row): the edges' insets, each block's text and
-- the gap between two, and the calendar button on the date's row.
local function rowNeeds()
  local need = { [IS.BLOCKS.date[1]] = IS.CALENDAR + IS.CALENDAR_GAP }
  for key, fs in pairs(IS.fonts) do
    local row = IS.BLOCKS[key][1]
    if fs:IsShown() then need[row] = (need[row] or 0) + fs:GetStringWidth() + IS.DATE_GAP end
  end
  return need
end

-- How wide the strip is: its width for the text size, or wider when a row's blocks need more (a translation
-- often runs longer than the English), so a row's left and right blocks never run into each other.
local function stripWidth()
  local widest = 0
  for _, w in pairs(rowNeeds()) do widest = math.max(widest, w) end
  return math.max(IS.Width(), math.ceil(widest + 2 * IS.SIDE - IS.DATE_GAP))
end

-- Sets a block's text at its side of its row (IS.SIDE in from that edge).
local function placeText(fs, key)
  local point = IS.BLOCKS[key][2]
  fs:ClearAllPoints()
  fs:SetPoint(point, IS.frame, "TOP" .. point, point == "LEFT" and IS.SIDE or -IS.SIDE, rowY(shownRow(key)))
end

-- Sets the calendar button at the date row's right end.
local function placeCalendar(b)
  b:ClearAllPoints()
  b:SetPoint("RIGHT", IS.frame, "TOPRIGHT", -IS.CALENDAR_GAP, rowY(shownRow("date")))
end

-- Sits the date right after the time, or at the row's left edge while the time is off.
function IS.PlaceDate()
  local date, clock = IS.fonts.date, IS.fonts.clock
  date:ClearAllPoints()
  if clock:IsShown() then date:SetPoint("LEFT", clock, "RIGHT", IS.DATE_GAP, 0)
  else date:SetPoint("LEFT", IS.frame, "TOPLEFT", IS.SIDE, rowY(shownRow("date"))) end
end

-- Sets every block, and the calendar button beside the date, on its row as the rows now stand.
local function placeBlocks()
  for key, fs in pairs(IS.fonts) do placeText(fs, key) end
  if IS.calendar then placeCalendar(IS.calendar) end
  IS.PlaceDate()
end

-- Hides the strip while it has nothing to show (no empty box on screen) or its
-- visibility hides it, and grows it to a third (or fourth) row only while a block there shows, and wider when
-- a row needs it; the blocks close up the rows that show nothing.
local function fitRows()
  local rows = rowsShown()
  IS.frame:SetShown(rows > 0 and V.Shows(IS.frame))
  IS.frame:SetSize(stripWidth(), IS.Row() * math.max(rows, 2) + IS.EDGE)
  placeBlocks()
end

-- The button that goes with a block, by its key on IS: the calendar with the date, the clock's hit area with the time.
IS.BUTTONS = { date = "calendar", clock = "clockButton" }

-- Shows a block's button (its own, or its hit area) while the block shows.
local function showButton(key, shown)
  local b = IS[IS.BUTTONS[key] or ""] or (IS.hits and IS.hits[key])
  if b then b:SetShown(shown) end
end

-- Repaints one block: hidden when off or when the client can't answer; the strip fits what shows.
function IS.Paint(key)
  local fs = IS.fonts and IS.fonts[key]
  if not fs then return end
  local text, color
  if IS.settings[key] then text, color = IS.TEXT[key]() end
  fs:SetShown(text ~= nil)
  showButton(key, text ~= nil)
  if text and text ~= fs.last then fs:SetText(text) fs.last = text end
  if color then T.Color(fs, color) end
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

-- One block's text, in its place.
local function addText(key)
  local fs = T.Text(IS.frame:CreateFontString(nil, "OVERLAY"), "small", "text")
  placeText(fs, key)
  return fs
end

-- Opens the calendar, unless a fight is on (the game refuses Vanguard there).
local function openCalendar()
  if ns.WindowWaitsForCombat(L["The calendar"]) then return end
  if type(ToggleCalendar) == "function" then ToggleCalendar() end
end

-- How many calendar invites wait for your answer (0 when the client can't say or hides it).
function IS.PendingInvites()
  local get = C_Calendar and C_Calendar.GetNumPendingInvites
  return type(get) == "function" and ns.PlainNumber(get()) or 0
end

-- The calendar button's tooltip: "Calendar", and how many invites wait.
function IS.CalendarTip(b)
  GameTooltip:SetOwner(b, "ANCHOR_LEFT")
  GameTooltip:SetText(L["Calendar"], T.RGB("text"))
  local n = IS.PendingInvites()
  local r, g, bl = T.RGB("text2")
  if n > 0 then GameTooltip:AddLine(n == 1 and L["1 invite waiting"] or ns.Format(L["{count} invites waiting"], { count = n }), r, g, bl) end
  GameTooltip:Show()
end

-- The invite count in the calendar button's corner, shown only while invites wait; its backing with it.
function IS.PaintInvites()
  local n = IS.PendingInvites()
  IS.invites:SetText(n > 0 and tostring(n) or "")
  IS.invitesBack:SetShown(n > 0)
end

-- The calendar button's invite count: the badge text over a dark backing, in its bottom-right corner, in the
-- backpack count's look (Modules/MenuStrip.lua; the strip is at the UI's scale, so no scale correction).
local function addInvites(b)
  local pad, back = ns.GetModule("MenuStrip").COUNT_PAD, T.Snap(b:CreateTexture(nil, "OVERLAY", nil, 7))
  back:SetTexture(T.WHITE)
  T.Tint(back, "edge", ns.GetModule("MenuStrip").COUNT_BACK)
  local fs = T.Text(b:CreateFontString(nil, "OVERLAY"), "badge")
  fs:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", -pad, pad)
  back:SetPoint("TOPLEFT", fs, "TOPLEFT", -pad, pad)
  back:SetPoint("BOTTOMRIGHT", fs, "BOTTOMRIGHT", pad, -pad)
  IS.invites, IS.invitesBack = fs, back
end

-- The calendar button (shown with the date): a slot button of the minimap's kind at the date row's right end,
-- opening the calendar like /calendar, with a count of the invites waiting. None where the realm has no calendar.
local function addCalendar(frame)
  if IS.CalendarOff() then return end
  local b = CreateFrame("Button", "Vanguard_InfoStripCalendar", frame)
  placeCalendar(b)
  b:SetScript("OnClick", ns.Guard("click info strip calendar", openCalendar))
  b:SetScript("OnEnter", ns.Guard("info strip calendar tip", IS.CalendarTip))
  b:SetScript("OnLeave", ns.Guard("info strip calendar tip", function() GameTooltip:Hide() end))
  ns.GetModule("Minimap").SlotButton(b, IS.CALENDAR_ICON.slot, IS.CALENDAR, IS.CALENDAR_GLYPH)
  addInvites(b)
  IS.calendar = b
end

-- A click on the time: turns off the game's alarm while it rings, else opens or closes the game's clock window
-- (the alarm, local or realm time, the stopwatch switch), which the put-away minimap clock opened.
function IS.ClockClick()
  if ask("TimeManager_IsAlarmFiring") == true then return ask("TimeManager_TurnOffAlarm") end
  ask("ToggleTimeManager")
end

-- The time tooltip's lines: a label and the game's helper that gives that time in the clock's format.
IS.CLOCK_TIMES = { { L["Realm time"], "GameTime_GetGameTime" }, { L["Local time"], "GameTime_GetLocalTime" } }

-- The time's tooltip: realm and local time (with AM/PM in 12-hour mode), and what a click does.
function IS.ClockTip(b)
  GameTooltip:SetOwner(b, "ANCHOR_LEFT")
  GameTooltip:SetText(L["Time"], T.RGB("text"))
  local r, g, bl = T.RGB("text2")
  for _, line in ipairs(IS.CLOCK_TIMES) do
    local t = ask(line[2], true)
    if type(t) == "string" then GameTooltip:AddDoubleLine(line[1], t, r, g, bl, T.RGB("text")) end
  end
  GameTooltip:AddLine(L["Click: the game's clock and alarm"], r, g, bl)
  GameTooltip:Show()
end

-- The time's hit area: the text takes the mouse, so a click reaches the game's clock window.
local function addClock(frame)
  local b = CreateFrame("Button", "Vanguard_InfoStripClock", frame)
  b:SetAllPoints(IS.fonts.clock)
  b:SetScript("OnClick", ns.Guard("click info strip clock", IS.ClockClick))
  b:SetScript("OnEnter", ns.Guard("info strip clock tip", IS.ClockTip))
  b:SetScript("OnLeave", ns.Guard("info strip clock tip", function() GameTooltip:Hide() end))
  IS.clockButton = b
end

-- Block tooltips -----------------------------------------------------------------------------

-- The worn slots durability reads, by inventory slot, with the names the tooltip gives them.
IS.SLOT_NAMES = {
  [1] = L["Head"], [3] = L["Shoulders"], [5] = L["Chest"], [6] = L["Waist"], [7] = L["Legs"], [8] = L["Feet"], [9] = L["Wrists"],
  [10] = L["Hands"], [16] = L["Main hand"], [17] = L["Off hand"], [18] = L["Ranged"],
}
-- What a bag that holds one kind of thing is called, by the game's bag family number; any other family is a "special bag".
IS.BAG_KINDS = { [1] = L["quiver"], [2] = L["ammo pouch"], [4] = L["soul bag"] }

-- Each worn item under full durability, most worn first: { name, percent }.
function IS.WornSlots()
  local out = {}
  for slot, name in pairs(IS.SLOT_NAMES) do
    local share = slotShare(slot)
    if share and share < 1 then out[#out + 1] = { name, math.floor(share * 100 + 0.5) } end
  end
  table.sort(out, function(a, b) return a[2] < b[2] or (a[2] == b[2] and a[1] < b[1]) end)
  return out
end

-- A tooltip line in two parts: the label muted, the value in a colour token.
local function tipLine(tt, label, value, token)
  local r, g, b = T.RGB("text2")
  tt:AddDoubleLine(label, value, r, g, b, T.RGB(token or "text"))
end

-- Durability's tooltip: each worn item under 100 %, most worn first, coloured as the strip colours it.
local function durabilityTip(tt)
  local worn = IS.WornSlots()
  for _, item in ipairs(worn) do tipLine(tt, item[1], item[2] .. "%", IS.DurabilityColor(item[2])) end
  local r, g, b = T.RGB("text2")
  if #worn == 0 then tt:AddLine(L["Everything at 100%"], r, g, b) end
end

-- A bag's name in the tooltip: the backpack, or "Bag 3", with what it holds when it takes only one kind of thing.
local function bagName(bag, family)
  local name = bag == 0 and L["Backpack"] or ns.Format(L["Bag {number}"], { number = bag })
  if family == 0 then return name end
  return ns.Format(L["{bag} ({kind})"], { bag = name, kind = IS.BAG_KINDS[family] or L["special bag"] })
end

-- Free space's tooltip: each bag's slots used of its total (a soul bag or quiver named as such).
local function bagsTip(tt)
  local MS = ns.GetModule("MenuStrip")
  for bag = 0, MS.LAST_BAG do
    local total, free = MS.BagSpace(bag)
    if total and total > 0 then
      local _, family = C_Container.GetContainerNumFreeSlots(bag)
      tipLine(tt, bagName(bag, ns.PlainNumber(family) or 0), ns.Format(L["{used} / {total} used"], { used = total - free, total = total }))
    end
  end
end

-- Gold's tooltip: what came in and went out since you logged in.
local function goldTip(tt)
  local s = IS.session or {}
  tipLine(tt, L["Earned this session"], IS.Money(s.earned or 0), "gold")
  tipLine(tt, L["Spent this session"], IS.Money(s.spent or 0), "gold")
end

-- How often the tooltip reads Vanguard's memory at most: the read walks every loaded addon's memory.
IS.MEMORY_EVERY = 10

-- Vanguard's memory in KB for the tooltip: the last reading while it is fresh, else a new one (nil in a fight).
function IS.Memory()
  local now = ask("GetTime") or 0
  if IS.memoryAt and now - IS.memoryAt < IS.MEMORY_EVERY then return IS.memory end
  local kb = ns.Perf.Memory()
  if kb then IS.memory, IS.memoryAt = kb, now end
  return kb
end

-- Frame rate and latency's tooltip: home and world latency, and Vanguard's memory (not read in a fight).
local function systemTip(tt)
  local _, _, home, world = ask("GetNetStats")
  home, world = ns.PlainNumber(home), ns.PlainNumber(world)
  if home then tipLine(tt, L["Home latency"], ns.Format(L["{ms} ms"], { ms = home })) end
  if world then tipLine(tt, L["World latency"], ns.Format(L["{ms} ms"], { ms = world })) end
  local kb = IS.Memory()
  if kb then tipLine(tt, L["Vanguard's memory"], ns.Format(L["{mb} MB"], { mb = string.format("%.1f", kb / 1024) })) end
end

-- The session rates' tooltip: how long the session has run, the XP gained and the gold made or spent in it.
local function ratesTip(tt)
  local s = IS.session or {}
  tipLine(tt, L["Session"], IS.Duration((ask("GetTime") or 0) - (s.start or 0)))
  tipLine(tt, L["XP gained"], ns.GetModule("DataBars").Short(s.gained or 0))
  local now, start = ns.PlainNumber(ask("GetMoney")), s.money
  if now and start then tipLine(tt, L["Gold"], (now < start and "-" or "+") .. IS.ShortMoney(math.abs(now - start)), now < start and "bad" or "gold") end
end

-- A fight's length: "42s", or "3m 05s".
function IS.FightLength(seconds)
  local whole = math.floor(seconds + 0.5)
  if whole < 60 then return ns.Format(L["{seconds}s"], { seconds = whole }) end
  return ns.Format(L["{minutes}m {seconds}s"], { minutes = math.floor(whole / 60), seconds = string.format("%02d", whole % 60) })
end

-- The last fight's tooltip (DPS and place): how long it lasted; in a fight, that the figure waits for its end.
local function fightTip(tt)
  local seconds = IS.FightSeconds()
  if seconds then tipLine(tt, L["Fight length"], IS.FightLength(seconds)) end
  local r, g, b = T.RGB("text2")
  if ns.InCombat() then tt:AddLine(L["Updates when this fight ends"], r, g, b) end
end

-- Each block's tooltip: its title, and the function that adds its lines.
IS.TIPS = {
  durability = { L["Durability"], durabilityTip }, bags = { L["Bag space"], bagsTip }, gold = { L["Gold"], goldTip },
  system = { L["Frame rate and latency"], systemTip },
  xprate = { L["This session"], ratesTip }, leveltime = { L["This session"], ratesTip }, goldrate = { L["This session"], ratesTip },
  dps = { L["Last fight"], fightTip }, rank = { L["Last fight"], fightTip },
}

-- What a left-click on a block opens, out of a fight: the window's name (for the in-a-fight line), the
-- game's function and its argument, and the tooltip's hint.
IS.CLICKS = {
  durability = { L["The character window"], "ToggleCharacter", "PaperDollFrame", hint = L["Click: the character window"] },
  bags = { L["The bag window"], "ToggleAllBags", hint = L["Click: the bag window"] },
  gold = { L["The bag window"], "ToggleAllBags", hint = L["Click: the bag window"] },
}
-- The blocks a right-click starts counting again from now (the session's rates).
IS.RESTARTS = { xprate = true, leveltime = true, goldrate = true }

-- The muted hint lines at a tooltip's end: what a click opens (not in a fight), and the restart.
local function clickHints(tt, key)
  local click, r, g, b = IS.CLICKS[key], T.RGB("text2")
  local hint = click and (ns.InCombat() and ns.Format(L["{hint} (not in a fight)"], { hint = click.hint }) or click.hint)
  if hint then tt:AddLine(hint, r, g, b) end
  if IS.RESTARTS[key] then tt:AddLine(L["Right-click: start counting again"], r, g, b) end
end

-- Shows a block's tooltip, beside the strip.
function IS.ShowTip(hit)
  local tip = IS.TIPS[hit.key]
  GameTooltip:SetOwner(hit, "ANCHOR_LEFT")
  GameTooltip:SetText(tip[1], T.RGB("text"))
  tip[2](GameTooltip)
  clickHints(GameTooltip, hit.key)
  GameTooltip:Show()
end

-- A click on a block: a right-click on a rate starts the session again; a left-click opens the block's
-- window, except in a fight (chat says it waits; the game refuses Vanguard there).
function IS.Click(hit, button)
  if button == "RightButton" and IS.RESTARTS[hit.key] then return IS.RestartSession() end
  local click = IS.CLICKS[hit.key]
  if button ~= "LeftButton" or not click or ns.WindowWaitsForCombat(click[1]) then return end
  ask(click[2], click[3])
end

-- One block's hit area over its text (the text takes no mouse): its tooltip on hover, and its clicks.
local function addHit(frame, key)
  local hit = CreateFrame("Button", nil, frame)
  hit.key = key
  hit:SetAllPoints(IS.fonts[key])
  hit:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  hit:SetScript("OnEnter", ns.Guard("info strip tip", IS.ShowTip))
  hit:SetScript("OnLeave", ns.Guard("info strip tip", function() GameTooltip:Hide() end))
  hit:SetScript("OnClick", ns.Guard("click info strip", IS.Click))
  hit:Hide()
  return hit
end

-- The strip's buttons: the calendar at the date row's end, the time's hit area, and every other block's.
local function addButtons(frame)
  addCalendar(frame)
  addClock(frame)
  IS.hits = {}
  for key in pairs(IS.TIPS) do IS.hits[key] = addHit(frame, key) end
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

-- The quest tracker's default spot: under the strip's last row at the current Text size, so a larger Text
-- size never runs the strip into the tracker.
function IS.TrackerPoint()
  local y = IS.HOME[4] - IS.Row() * IS.MOST_ROWS - IS.EDGE - IS.TRACKER_GAP
  return { "TOPRIGHT", "TOPRIGHT", IS.HOME[3], y }
end

-- Moves the quest tracker's default spot to follow the strip's height (a spot the player saved wins). Out of
-- a fight only: the game's tracker, with its item buttons, is pinned to that spot.
function IS.MoveTracker()
  ns.SetMoverDefault("questtracker", IS.TrackerPoint())
end

-- Lays the strip out again for the current Text size: its width, every block on its row and the
-- calendar button beside the date (plain frames, so this is fine in a fight), then the rows that show.
function IS.Layout()
  IS.frame:SetWidth(IS.Width())
  fitRows()
  ns.OutOfCombat(IS.MoveTracker, "infostrip-tracker")
end

-- The movable strip, just under the minimap.
local function build()
  local f = T.HudPanel(CreateFrame("Frame", "Vanguard_InfoStrip", UIParent))
  IS.frame = f
  f:SetSize(IS.Width(), IS.Row() * 2 + IS.EDGE)
  ns.Mover(f, "infostrip", L["Info strip"], IS.HOME)
  IS.fonts = {}
  for key in pairs(IS.BLOCKS) do IS.fonts[key] = addText(key) end
  addButtons(f)
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
-- button (/calendar still opens it, and the strip prints the calendar's event reminders the button did).
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

-- Whether the realm's rules switch the in-game calendar off (C_GameRules); no when the client can't say.
function IS.CalendarOff()
  local rule = Enum and Enum.GameRule and Enum.GameRule.IngameCalendarDisabled
  if rule == nil or type(C_GameRules) ~= "table" or type(C_GameRules.IsGameRuleActive) ~= "function" then return false end
  local on = C_GameRules.IsGameRuleActive(rule)
  return not ns.IsSecret(on) and on == true
end

-- A calendar event's reminder, as the game's calendar button prints it (GameTime.lua): with that button put
-- away nothing else would, so the strip prints the game's line in the system chat colour.
function IS.CalendarAlarm(_, title)
  if ns.IsSecret(title) or type(title) ~= "string" or type(CALENDAR_EVENT_ALARM_MESSAGE) ~= "string" then return end
  local info = type(ChatTypeInfo) == "table" and ChatTypeInfo.SYSTEM or {}
  DEFAULT_CHAT_FRAME:AddMessage(string.format(CALENDAR_EVENT_ALARM_MESSAGE, title), info.r, info.g, info.b)
end

-- While the clock block puts the game's calendar button away, its event reminders still reach chat.
local function keepReminders(settings)
  if settings.clock and not IS.CalendarOff() then ns.On("CALENDAR_EVENT_ALARM", IS.CalendarAlarm) end
end

-- The events that change how many calendar invites wait (the game's calendar button listens for the same).
IS.INVITE_EVENTS = { "CALENDAR_UPDATE_PENDING_INVITES", "PLAYER_ENTERING_WORLD" }

-- Keeps the calendar button's invite count up to date; nothing to keep where the realm has no calendar.
local function watchInvites()
  if not IS.calendar then return end
  IS.PaintInvites()
  for _, event in ipairs(IS.INVITE_EVENTS) do ns.On(event, IS.PaintInvites) end
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
  ns.On("PLAYER_MONEY", function() IS.CountMoney() IS.Paint("goldrate") end)
  ns.On("PLAYER_ENTERING_WORLD", IS.ResumeSession)
  ns.On("PLAYER_LOGOUT", IS.StampSession)
  ns.On("PLAYER_XP_UPDATE", onXP)
  ns.On("PLAYER_LEVEL_UP", IS.PaintRates)
  ns.On("PLAYER_ENTERING_WORLD", IS.UpdateAll)
  -- Your DPS is readable once a fight ends (and gone when the meter resets).
  for _, event in ipairs({ "PLAYER_REGEN_ENABLED", "DAMAGE_METER_RESET" }) do ns.On(event, function() IS.Paint("dps") IS.Paint("rank") end) end
end

-- Module entry point (Core/Modules.lua): the strip, laid out again whenever the Text size changes.
function IS.Enable(settings)
  IS.settings = settings
  hideReplaced(settings)
  keepReminders(settings)
  IS.StartSession()
  build()
  T.OnChanged(IS.Layout)
  watch()
  watchInvites()
end
