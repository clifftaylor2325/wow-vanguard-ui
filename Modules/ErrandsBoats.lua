-- Boat and zeppelin timers, part of the errands (Modules/Errands.lua). Off until switched
-- on. A ride is spotted when the game gives no map position for you outside an instance,
-- a flight or the afterlife, three checks running. Landing saves the ride's time by route
-- (where you boarded > where you got off); the next ride from the same place counts down
-- from the time of the route you took last from there. Nothing here is read in combat.

local ADDON, ns = ...

local T = ns.Theme
local ER = ns.GetModule("Errands")

-- Seconds between checks, the checks that confirm a ride, and the shortest and longest ride saved.
ER.BOAT_POLL, ER.BOAT_CONFIRM, ER.BOAT_MIN, ER.BOAT_MAX = 1, 3, 20, 1800

-- Seconds as "1:05".
local function clock(seconds)
  seconds = math.max(0, math.ceil(seconds))
  return string.format("%d:%02d", math.floor(seconds / 60), seconds % 60)
end

-- The client's time now.
local function now()
  return ER.ask("GetTime") or 0
end

-- The name of the place you stand in (the sub-zone, else the zone), or nil.
local function placeName()
  local sub, zone = ER.ask("GetSubZoneText"), ER.ask("GetZoneText")
  if type(sub) == "string" and sub ~= "" then return sub end
  if type(zone) == "string" and zone ~= "" then return zone end
end

-- True when the game gives no map position for you: on a boat or zeppelin, outside an
-- instance, a flight and the afterlife.
local function mapless()
  local map = C_Map
  if type(map) ~= "table" or type(map.GetBestMapForUnit) ~= "function" or type(map.GetPlayerMapPosition) ~= "function" then return false end
  local id = map.GetBestMapForUnit("player")
  if not id or ns.IsSecret(id) then return false end
  if ER.ask("UnitOnTaxi", "player") == true or ER.ask("UnitIsDeadOrGhost", "player") == true or ER.ask("IsInInstance") then return false end
  return map.GetPlayerMapPosition(id, "player") == nil
end

-- The destination of the route you took last from a place, and its saved seconds (either may be nil).
function ER.BoatGuess(from)
  local to = from and ER.settings.boatLast[from]
  return to, to and ER.settings.boats[from .. " > " .. to]
end

-- The bar: a countdown on a route taken before, else "timing".
function ER.PaintBoat(b)
  local bar, left = ER.boatBar, (b.known or 0) - (now() - b.start)
  bar:Show()
  bar:SetMinMaxValues(0, b.known or 1)
  bar:SetValue(b.known and math.max(0, left) or 1)
  bar.text:SetText(b.known and (b.to .. "  " .. clock(left)) or "Timing this ride")
end

-- Off the boat: save a sane ride's time under its route, and put the bar away.
local function land(b)
  local took, to = now() - b.start, placeName()
  if b.from and to and b.from ~= to and took >= ER.BOAT_MIN and took <= ER.BOAT_MAX then
    ER.settings.boats[b.from .. " > " .. to] = math.floor(took + 0.5)
    ER.settings.boatLast[b.from] = to
  end
  ER.boat = nil
  ER.boatBar:Hide()
end

-- Still afloat: count the checks, and once enough agree, start (or go on painting) the ride.
local function afloat(b)
  b.seen = b.seen + 1
  if b.seen < ER.BOAT_CONFIRM then return end
  b.start = b.start or b.at
  ER.PaintBoat(b)
end

-- Ashore: a confirmed ride ends; a flicker is forgotten; walking about remembers where you are.
local function ashore(b)
  if b and b.start then return land(b) end
  ER.boat, ER.place = nil, placeName() or ER.place
end

-- One check, every ER.BOAT_POLL seconds (never in combat, where positions may be hidden).
function ER.PollBoat()
  if ns.InCombat() then return end
  if not mapless() then return ashore(ER.boat) end
  ER.boat = ER.boat or { from = ER.place, seen = 0, at = now() }
  if not ER.boat.known then ER.boat.to, ER.boat.known = ER.BoatGuess(ER.boat.from) end
  afloat(ER.boat)
end

-- The movable boat bar, hidden until a ride.
local function buildBar()
  local bar = T.BarColor(T.StyleBar(CreateFrame("StatusBar", "Vanguard_BoatTimer", UIParent)), "accent")
  T.HudPanel(bar)
  bar:SetSize(ER.BAR_W, ER.BAR_H)
  ns.Mover(bar, "boattimer", "Boat timer", { "BOTTOM", "BOTTOM", 0, 334 })
  bar.text = T.Text(bar:CreateFontString(nil, "OVERLAY"), "barSmall")
  bar.text:SetPoint("CENTER")
  bar:Hide()
  ER.boatBar = bar
end

-- Starts watching for boat and zeppelin rides, on a client that has the map calls.
function ER.WatchBoats()
  if type(C_Map) ~= "table" then return end
  buildBar()
  ER.place = placeName()
  ns.Every("boat poll", ER.BOAT_POLL, ER.PollBoat)
end
