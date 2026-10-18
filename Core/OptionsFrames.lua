-- The Unit frames and Raid frames pages (/vg): the unit frames, their
-- readouts, cast bars and combat timers; the raid frames and their
-- indicators. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local O = ns.Options
local setting, liveSetting, check, append = O.Setting, O.LiveSetting, O.Check, O.Append

-- get/set for a raid frame setting that repaints the raid frames at once (look, power bar).
local function raidSetting(key)
  local get, set, initial = setting("RaidFrames", key)
  return get, function(v)
    set(v)
    local RF = ns.GetModule("RaidFrames")
    if RF and RF.settings then RF.UpdateAll() end
    ns.RaidPreview.Refresh()
  end, initial
end

-- get/set for a unit frame setting that repaints the frames at once.
local function unitFrameSetting(key)
  return liveSetting("UnitFrames", key, function() ns.GetModule("UnitFrames").Refresh() end)
end

-- The Calm HUD switch: your frames dim out of combat (applied at once, also from a situation).
local function calmRow()
  return check("Calm HUD: dim your frames out of combat until a fight, a hostile target or the mouse",
    liveSetting("UnitFrames", "calm", function() ns.GetModule("UnitFrames").ApplyCalm() end))
end

-- Unit frames, and the class bars under the player frame.
local function unitFrameRows()
  return {
    { "header", "Unit frames" },
    check("Replace the default unit frames", setting("UnitFrames", "hideBlizzard", true)), calmRow(),
    check("Show health numbers", unitFrameSetting("healthText")),
    { "cycle", "Health as", { { "value", "Value (42.8K)" }, { "percent", "Percent (84%)" } }, unitFrameSetting("healthFormat") },
    check("Show levels (reload)", setting("UnitFrames", "showLevel", true)),
    check("Boss frames, top left (reload)", setting("UnitFrames", "boss", true)), check("Party pets and targets, above the party (reload)", setting("PartyExtras", "show", true)),
    check("Group threat panel: who has the most threat on your target (reload)", setting("GroupThreat", "show", true)), check("Shaman totems under the player frame (reload)", setting("ClassBars", "totems", true)),
    check("Druid mana under the player frame in bear and cat form (reload)", setting("ClassBars", "druidMana", true)),
  }
end

-- Cast bars and the target/focus aura rows.
local function castRows()
  return {
    { "header", "Cast bars" },
    check("Your cast bar", setting("CastBars", "player", true)),
    check("Target cast bar", setting("CastBars", "target", true)),
    check("Focus cast bar", setting("CastBars", "focus", true)),
    { "header", "Target and focus auras" },
    check("Only your debuffs (reload)", setting("FrameAuras", "onlyMine", true)),
    check("Timer numbers on the icons (reload)", setting("FrameAuras", "timers", true)),
  }
end

-- Small readouts on the unit frames: threat on your target, your pet's mood.
local function readoutRows()
  return {
    { "header", "Readouts" },
    check("Your threat on your target, above its frame (reload)", setting("UnitExtras", "threat", true)),
    check("Your pet's happiness, a dot on the pet frame (reload)", setting("UnitExtras", "happiness", true)),
    check("Status chip above your frame: Eating, Drinking, Well Fed, or a missing buff from Instance prep's checks, out of combat (reload)", setting("UnitExtras", "chip", true)),
  }
end

-- get/set for one power bar spark, which switches at once.
local function sparkSetting(key)
  return liveSetting("PowerTicks", key, function() local PT = ns.GetModule("PowerTicks") if PT.spark then PT.UpdateMode() end end)
end

-- Combat timers: the swing timer, and the sparks on your power bar.
local function timerRows()
  return {
    { "header", "Combat timers" },
    { "cycle", "Swing timer (reload)", { { "auto", "Warriors, rogues, hunters" }, { "always", "Always" }, { "never", "Never" } }, setting("SwingTimer", "show", true) },
    check("Five-second rule spark on your mana bar", sparkSetting("mana")),
    check("Energy tick spark on your energy bar", sparkSetting("energy")),
  }
end

-- get/set for a raid frame setting the preview (Modules/RaidPreview.lua) shows at once; the real frames take a reload.
local function previewedSetting(key)
  local get, set, initial = setting("RaidFrames", key, true)
  return get, function(v) set(v); ns.RaidPreview.Refresh() end, initial
end

-- get/set for Stack big raids: the real frames and the preview follow at once.
local function stackSetting()
  local get, set, initial = setting("RaidFrames", "stackBig", true)
  return get, function(v) set(v); ns.GetModule("RaidFrames").Fit(); ns.RaidPreview.Refresh() end, initial
end

-- Raid frames: party coverage, sorting, size.
local function raidRows()
  return {
    { "header", "Raid frames" },
    check("Use them for your party too", setting("RaidFrames", "showInParty", true)), check("Include yourself", setting("RaidFrames", "showPlayer", true)),
    check("Sort by role (tanks, healers, damage)", previewedSetting("sortByRole")),
    { "cycle", "Groups as (reload)", { { "columns", "Columns" }, { "rows", "Rows (wide, for big raids)" } }, previewedSetting("layout") },
    check("Stack big raids at the left (more than 10 players)", stackSetting()), check("Hide the default raid frames", setting("RaidFrames", "hideBlizzard", true)),
    { "cycle", "Style", { { "soft", "Class colors, softened" }, { "dark", "Dark, class-colored names" }, { "class", "Class colors, bright" } }, raidSetting("look") },
    { "cycle", "Width", ns.Widgets.Keep({ { 72, "72" }, { 90, "90" }, { 100, "100" }, { 120, "120" } }), previewedSetting("width") },
    { "cycle", "Height", { { 36, "36" }, { 40, "40" }, { 48, "48" }, { 56, "56" } }, previewedSetting("height") },
  }
end

-- The preview: sample players in the raid tiles, to check them without a group (not saved).
local function raidPreviewRows()
  local RP = ns.RaidPreview
  return {
    { "header", "Preview" },
    { "text", "Fills the raid tiles with sample players, so you can check their size, style and layout alone. A new width, height, sorting or Groups as shows in the preview at once (the real frames take a reload). It ends when you join a group, enter combat or reload." },
    { "cycle", "Preview with sample players", RP.CHOICES, function() return RP.size end, RP.Set },
  }
end

-- The raid frames' auras: debuffs, the dispel highlight and your HoTs (after a reload).
local function raidAuraRows()
  return {
    check("Highlight debuffs you can dispel (reload)", setting("RaidAuras", "dispel", true)),
    { "cycle", "Debuff icons (reload)", { { 0, "none" }, { 2, "2" }, { 3, "3" } }, setting("RaidAuras", "debuffs", true) },
    check("Show your HoTs (reload)", setting("RaidAuras", "hots", true)),
  }
end

-- Raid frames plus their indicators.
local function raidPageRows()
  return append(append(append(raidRows(), raidAuraRows()), {
    check("Power bar", raidSetting("showPower")),
    check("Fade players out of range", setting("RaidStatus", "rangeFade")),
    check("Raid target icons", setting("RaidStatus", "raidIcons")),
    check("Ready check answers", setting("RaidStatus", "readyCheck")),
    check("Mark players being resurrected", setting("RaidStatus", "resurrect")),
    check("Leader and assistant marks", setting("RaidStatus", "leader")),
  }), raidPreviewRows())
end

O.AddPage({ key = "unitframes", title = "Unit frames", icon = "NavUnitFrames", order = 30, rows = function() return append(append(append(unitFrameRows(), readoutRows()), castRows()), timerRows()) end })
O.AddPage({ key = "raid", title = "Raid frames", icon = "NavRaidFrames", order = 40, rows = raidPageRows })
