-- The Map page (/vg): the minimap and waypoints, the info strip under the
-- minimap and other addons' data feeds. Your buffs and debuffs moved to the
-- Unit frames page (Core/OptionsFrames.lua); a note here points there.
-- Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local O = ns.Options
local setting, reloadSetting, liveSetting, check, append = O.Setting, O.ReloadSetting, O.LiveSetting, O.Check, O.Append

-- The minimap's coordinates, icons and drawer, and map waypoints.
local function minimapRows()
  return {
    { "header", "Minimap and waypoints" },
    { "cycle", "Minimap shape (reload)", { { "auto", "Follow the theme" }, { "square", "Square" }, { "round", "Round" } }, reloadSetting("Minimap", "shape") },
    check("Coordinates under the minimap", reloadSetting("Minimap", "coords")), check("Coordinates on the world map (reload)", reloadSetting("Waypoints", "mapCoords")),
    check("/way sets map waypoints, unless another addon has it (reload)", reloadSetting("Waypoints", "slash")),
    check("Vanguard's pin and font on the game's floating waypoint pin (reload)", reloadSetting("Waypoints", "pin")),
    check("Tracking, mail and difficulty on the minimap's corners (reload)", reloadSetting("Minimap", "icons")),
    check("Gather addon minimap buttons into a drawer (reload)", reloadSetting("MinimapButtons", "drawer")),
  }
end

-- get/set for one info strip block, which shows or hides at once.
local function stripSetting(key)
  return liveSetting("InfoStrip", key, function() ns.GetModule("InfoStrip").UpdateAll() end)
end

-- The info strip's auction sales (the sales ledger, Modules/AuctionLedger.lua): off until switched on.
local function ledgerRows()
  return { check("Your auction sales this session", stripSetting("ahgold")) }
end

-- The info strip under the minimap: one switch per block, then the auction sales.
local function stripRows()
  local stripVisibility, stripWhen = O.VisibilityRows("Strip visibility", "InfoStrip", "visibility", "showWhen")
  return append({
    { "header", "Strip under the minimap" }, stripVisibility, stripWhen,
    check("Durability", stripSetting("durability")), check("Free bag slots", stripSetting("bags")),
    check("Frame rate and latency", stripSetting("system")), check("Gold", stripSetting("gold")),
    check("Ammo (hunters, warriors, rogues)", stripSetting("ammo")), check("Clock", stripSetting("clock")), check("Day, date and calendar button", stripSetting("date")),
    check("Soul shards (warlocks)", stripSetting("shards")), check("XP per hour this session", stripSetting("xprate")),
    check("Time to the next level", stripSetting("leveltime")), check("Gold per hour this session", stripSetting("goldrate")),
    check("Your DPS in the last fight (from the game's damage meter)", stripSetting("dps")), check("Your place in the last fight's DPS, in a group", stripSetting("rank")),
  }, ledgerRows())
end

-- Other addons' data feeds for the broker strip: one switch per feed, while any addon shares one.
local function brokerRows()
  local BS = ns.GetModule("BrokerStrip")
  local sources, rows = BS.Sources(), { { "header", "Data from other addons" } }
  if #sources == 0 then return { rows[1], { "text", "No addon shares data through LibDataBroker right now." } } end
  rows[2] = { "text", "Picked feeds show in the broker strip along the top edge (up to " .. BS.MAX .. ", in the order picked)." }
  for _, name in ipairs(sources) do rows[#rows + 1] = check(name, function() return BS.Chosen(name) end, function(v) BS.Choose(name, v) end) end
  return rows
end

-- Where your buffs and debuffs settings went (they sat on this page before).
local AURAS_MOVED = { "text", "Your buffs and debuffs are on the Unit frames page.", "note" }

-- The Map page: the minimap and waypoints, the note on your buffs, the info strip and other addons' feeds.
local function mapPageRows()
  return append(append(append(minimapRows(), { AURAS_MOVED }), stripRows()), brokerRows())
end

O.AddPage({ key = "map", title = "Map", icon = "NavMap", order = 81, rows = mapPageRows })
