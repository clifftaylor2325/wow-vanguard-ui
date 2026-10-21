-- The Unit frames and Raid frames pages (/vg): the unit frames, their
-- readouts, cast bars, your buffs and debuffs and combat timers; the raid frames and their
-- indicators. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local O = ns.Options
local setting, reloadSetting, liveSetting, liveMethod, check, append = O.Setting, O.ReloadSetting, O.LiveSetting, O.LiveMethod, O.Check, O.Append

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
  return liveMethod("UnitFrames", key, "Refresh")
end

-- The Calm HUD switch: your frames dim out of combat (applied at once, also from a situation).
local function calmRow()
  return check("Calm HUD: dim your frames out of combat until a fight, a hostile target or the mouse",
    liveMethod("UnitFrames", "calm", "ApplyCalm"))
end

-- The Versus deck switch: one shield panel behind your frame and your target's, the crest between (at once).
local function deckRow()
  return check("Versus deck: your frame and your target's joined in one panel, the crest between",
    liveMethod("UnitFrames", "deck", "ApplyDeck"))
end

-- Unit frames, and the class bars under the player frame.
local function unitFrameRows()
  return {
    { "header", "Unit frames" },
    check("Replace the default unit frames", reloadSetting("UnitFrames", "hideBlizzard")), calmRow(), deckRow(),
    check("Show health numbers", unitFrameSetting("healthText")), check("Tag mark on your target: a green check if you tagged it, a grey X if another player did", unitFrameSetting("tagMark")),
    { "cycle", "Health as", { { "value", "Value (42.8K)" }, { "percent", "Percent (84%)" } }, unitFrameSetting("healthFormat") },
    check("Show levels (reload)", reloadSetting("UnitFrames", "showLevel")),
    check("Boss frames, top left (reload)", reloadSetting("UnitFrames", "boss")), check("Party pets and targets, above the party (reload)", reloadSetting("PartyExtras", "show")),
    check("Group threat panel: who has the most threat on your target (reload)", reloadSetting("GroupThreat", "show")), check("Shaman totems under the player frame (reload)", reloadSetting("ClassBars", "totems")),
    check("Druid mana under the player frame in bear and cat form (reload)", reloadSetting("ClassBars", "druidMana")),
  }
end

-- Cast bars and the target/focus aura rows.
local function castRows()
  return {
    { "header", "Cast bars" },
    check("Your cast bar (and your pet's)", reloadSetting("CastBars", "player")),
    check("Target cast bar", reloadSetting("CastBars", "target")), check("Focus cast bar", reloadSetting("CastBars", "focus")),
    check("Ring at the cursor: the global cooldown and your cast", liveMethod("CastBars", "ring", "ApplyRing")),
    check("Interrupt mark beside the target and focus cast bars", liveMethod("CastBars", "interruptMark", "RefreshMarks")),
    { "header", "Target and focus auras" },
    check("Only your debuffs (reload)", reloadSetting("FrameAuras", "onlyMine")),
    check("Timer numbers on the icons (reload)", reloadSetting("FrameAuras", "timers")),
  }
end

-- get/set for the weapon enchant cells, which show or hide at once.
local function enchantSetting()
  return liveMethod("PlayerAuras", "enchants", "UpdateEnchants")
end

-- Your own buffs and debuffs (their icons sit by the minimap), after the target and focus auras.
local function playerAuraRows()
  return {
    { "header", "Your buffs and debuffs" },
    check("Timer numbers on your buffs (reload)", reloadSetting("PlayerAuras", "timers")),
    check("Weapon enchants in front of your buffs", enchantSetting()),
    { "cycle", "Icon size (reload)", { { 26, "Small" }, { 30, "Medium" }, { 36, "Large" } }, reloadSetting("PlayerAuras", "size") },
  }
end

-- Small readouts on the unit frames: threat on your target, your pet's mood.
local function readoutRows()
  return {
    { "header", "Readouts" },
    check("Your threat on your target, above its frame (reload)", reloadSetting("UnitExtras", "threat")),
    check("Your pet's happiness, a dot on the pet frame (reload)", reloadSetting("UnitExtras", "happiness")),
    check("Status chip above your frame: Eating, Drinking, Well Fed, or a missing buff from Instance prep's checks, out of combat (reload)", reloadSetting("UnitExtras", "chip")),
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
    { "cycle", "Swing timer (reload)", { { "auto", "Melee classes and hunters" }, { "always", "Always" }, { "never", "Never" } }, reloadSetting("SwingTimer", "show") },
    check("Five-second rule spark on your mana bar", sparkSetting("mana")),
    check("Energy tick spark on your energy bar", sparkSetting("energy")),
  }
end

-- get/set for a raid frame setting the preview (Modules/RaidPreview.lua) shows at once; the real frames take a reload.
local function previewedSetting(key)
  local get, set, initial = reloadSetting("RaidFrames", key)
  return get, function(v) set(v); ns.RaidPreview.Refresh() end, initial
end

-- get/set for Stack big raids: the real frames and the preview follow at once.
local function stackSetting()
  local get, set, initial = reloadSetting("RaidFrames", "stackBig")
  return get, function(v) set(v); ns.GetModule("RaidFrames").Fit(); ns.RaidPreview.Refresh() end, initial
end

-- Raid frames: party coverage, sorting, size.
local function raidRows()
  return {
    { "header", "Raid frames" },
    check("Use them for your party too", reloadSetting("RaidFrames", "showInParty")), check("Include yourself", reloadSetting("RaidFrames", "showPlayer")),
    check("Sort by role (tanks, healers, damage)", previewedSetting("sortByRole")),
    { "cycle", "Groups as (reload)", { { "columns", "Columns" }, { "rows", "Rows (wide, for big raids)" } }, previewedSetting("layout") },
    check("Stack big raids at the left (more than 10 players)", stackSetting()), check("Hide the default raid frames", reloadSetting("RaidFrames", "hideBlizzard")),
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
    check("Highlight debuffs you can dispel (reload)", reloadSetting("RaidAuras", "dispel")),
    { "cycle", "Debuff icons (reload)", { { 0, "none" }, { 2, "2" }, { 3, "3" } }, reloadSetting("RaidAuras", "debuffs") },
    check("Show your HoTs (reload)", reloadSetting("RaidAuras", "hots")),
    { "text", "Small icons down the right edge of each tile, under the missing-buff mark; on short tiles they continue in a column to the left.", "note" },
    { "cycle", "Right edge, top (reload)", ns.GetModule("RaidAuras").SOURCE_CHOICES, reloadSetting("RaidAuras", "indicator1") },
    { "cycle", "Right edge, second (reload)", ns.GetModule("RaidAuras").SOURCE_CHOICES, reloadSetting("RaidAuras", "indicator2") },
    { "cycle", "Right edge, third (reload)", ns.GetModule("RaidAuras").SOURCE_CHOICES, reloadSetting("RaidAuras", "indicator3") },
  }
end

-- get/set for a raid frame mark switch (range fade, icons, ready check, ...) that repaints the tiles at once.
local function statusSetting(key)
  return liveMethod("RaidStatus", key, "UpdateAll")
end

-- get/set for the Raid target icons switch: it repaints the tiles and the unit frames' marks at once.
local function raidIconSetting()
  return liveSetting("RaidStatus", "raidIcons", function() ns.GetModule("RaidStatus").UpdateAll() ns.GetModule("UnitFrames").RefreshRaidIcons() end)
end

-- Raid frames plus their indicators.
local function raidPageRows()
  return append(append(append(raidRows(), raidAuraRows()), {
    check("Power bar", raidSetting("showPower")),
    check("Fade players out of range", statusSetting("rangeFade")),
    check("Raid target icons", raidIconSetting()),
    check("Ready check answers", statusSetting("readyCheck")),
    check("Mark players being resurrected or summoned", statusSetting("resurrect")),
    check("Leader and assistant marks", statusSetting("leader")),
  }), raidPreviewRows())
end

O.AddPage({ key = "unitframes", title = "Unit frames", icon = "NavUnitFrames", order = 30, rows = function() return append(append(append(append(unitFrameRows(), readoutRows()), castRows()), playerAuraRows()), timerRows()) end })
O.AddPage({ key = "raid", title = "Raid frames", icon = "NavRaidFrames", order = 40, rows = raidPageRows })
