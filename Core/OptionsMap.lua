-- The Map page (/vg): the minimap and waypoints, the info strip under the
-- minimap and other addons' data feeds. Your buffs and debuffs moved to the
-- Unit frames page (Core/OptionsFrames.lua); a note here points there.
-- Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local L = ns.L

local O = ns.Options
local reloadSetting, liveMethod, check, append = O.ReloadSetting, O.LiveMethod, O.Check, O.Append

-- The minimap's coordinates, icons and drawer, and map waypoints.
local function minimapRows()
  return {
    { "header", L["Minimap and waypoints"] },
    { "cycle", L["Minimap shape (reload)"], { { "auto", L["Follow the theme"] }, { "square", L["Square"] }, { "round", L["Round"] } }, reloadSetting("Minimap", "shape") },
    check(L["Coordinates under the minimap"], reloadSetting("Minimap", "coords")), check(L["Coordinates on the world map (reload)"], reloadSetting("Waypoints", "mapCoords")),
    check(L["/way sets map waypoints, unless another addon has it (reload)"], reloadSetting("Waypoints", "slash")),
    check(L["Vanguard's pin and font on the game's floating waypoint pin (reload)"], reloadSetting("Waypoints", "pin")),
    check(L["Tracking, mail and difficulty on the minimap's corners (reload)"], reloadSetting("Minimap", "icons")),
    check(L["Gather addon minimap buttons into a drawer (reload)"], reloadSetting("MinimapButtons", "drawer")),
  }
end

-- get/set for one info strip block, which shows or hides at once.
local function stripSetting(key)
  return liveMethod("InfoStrip", key, "UpdateAll")
end

-- The info strip's auction sales (the sales ledger, Modules/AuctionLedger.lua): off until switched on.
local function ledgerRows()
  return { check(L["Your auction sales this session"], stripSetting("ahgold")) }
end

-- The info strip under the minimap: one switch per block, then the auction sales.
local function stripRows()
  local stripVisibility, stripWhen = O.VisibilityRows(L["Strip visibility"], "InfoStrip", "visibility", "showWhen")
  return append({
    { "header", L["Strip under the minimap"] }, stripVisibility, stripWhen,
    check(L["Durability"], stripSetting("durability")), check(L["Free bag slots"], stripSetting("bags")),
    check(L["Frame rate and latency"], stripSetting("system")), check(L["Gold"], stripSetting("gold")),
    check(L["Ammo (hunters, warriors, rogues)"], stripSetting("ammo")), check(L["Clock"], stripSetting("clock")), check(L["Day, date and calendar button"], stripSetting("date")),
    check(L["Soul shards (warlocks)"], stripSetting("shards")), check(L["XP per hour this session"], stripSetting("xprate")),
    check(L["Time to the next level"], stripSetting("leveltime")), check(L["Gold per hour this session"], stripSetting("goldrate")),
    check(L["Your DPS in the last fight (from the game's damage meter)"], stripSetting("dps")), check(L["Your place in the last fight's DPS, in a group"], stripSetting("rank")),
  }, ledgerRows())
end

-- Other addons' data feeds for the broker strip: one switch per feed, while any addon shares one.
local function brokerRows()
  local BS = ns.GetModule("BrokerStrip")
  local sources, rows = BS.Sources(), { { "header", L["Data from other addons"] } }
  if #sources == 0 then return { rows[1], { "text", L["No addon shares data through LibDataBroker right now."] } } end
  rows[2] = { "text", ns.Format(L["Picked feeds show in the broker strip along the top edge (up to {count}, in the order picked)."], { count = BS.MAX }) }
  for _, name in ipairs(sources) do rows[#rows + 1] = check(name, function() return BS.Chosen(name) end, function(v) BS.Choose(name, v) end) end
  return rows
end

-- Where your buffs and debuffs settings went (they sat on this page before).
local AURAS_MOVED = { "text", L["Your buffs and debuffs are on the Unit frames page."], "note" }

-- The Map page: the minimap and waypoints, the note on your buffs, the info strip and other addons' feeds.
local function mapPageRows()
  return append(append(append(minimapRows(), { AURAS_MOVED }), stripRows()), brokerRows())
end

O.AddPage({ key = "map", title = L["Map"], icon = "NavMap", order = 81, rows = mapPageRows })
