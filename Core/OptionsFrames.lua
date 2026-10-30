-- The Unit frames and Raid frames pages (/vg): the unit frames, their
-- readouts, cast bars, your buffs and debuffs and combat timers; the raid frames and their
-- indicators. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local L = ns.L

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

-- get/set for a Calm HUD setting (kept with the unit frames' settings), applied to the whole HUD at once.
local function calmSetting(key)
  local get, set, initial = setting("UnitFrames", key)
  return get, function(v) set(v) ns.GetModule("UnitFrames").ApplyCalm() end, initial
end

-- The Calm HUD switch, here and on the General page (applied at once, also from a situation).
local function calmRow()
  return check(L["Calm HUD: quiet the HUD out of combat until a fight, a hostile target or the mouse"], calmSetting("calm"))
end

-- What a part of the HUD does out of combat with the Calm HUD on; your unit frames can't fade away (V.CALM_PARTS).
local CALM_CHOICES = { { "dim", L["Dim"] }, { "hide", L["Hide"] }, { "leave", L["Leave as is"] } }
local CALM_FRAME_CHOICES = { CALM_CHOICES[1], CALM_CHOICES[3] }

-- One part's row: its choice out of combat (CALM_CHOICES unless given), applied at once.
local function calmPart(label, key, choices)
  return { "cycle", label, choices or CALM_CHOICES, calmSetting(key) }
end

-- The Calm HUD card on the General page: the switch, then each part's choice.
function O.CalmRows()
  local part = calmPart
  return {
    { "header", L["Calm HUD"] }, calmRow(),
    { "text", L["Out of combat each part dims, or hides until the mouse is over it. A fight or a living hostile target brings it all back. A part whose own Visibility isn't Always keeps that."], "note" },
    part(L["Unit frames"], "calmFrames", CALM_FRAME_CHOICES), part(L["Action bars"], "calmBars"), part(L["Your buffs and debuffs"], "calmAuras"),
    part(L["Info strip, menu bar and broker strip"], "calmStrips"), part(L["XP and rep bars"], "calmXP"),
    part(L["Damage meter and fight history"], "calmMeter"), part(L["Minimap"], "calmMinimap"),
  }
end

-- The Versus deck switch: one shield panel behind your frame and your target's, the crest between (at once).
local function deckRow()
  return check(L["Versus deck: your frame and your target's joined in one panel, the crest between"],
    liveMethod("UnitFrames", "deck", "ApplyDeck"))
end

-- Unit frames, and the class bars under the player frame.
local function unitFrameRows()
  return {
    { "header", L["Unit frames"] },
    check(L["Replace the default unit frames"], reloadSetting("UnitFrames", "hideBlizzard")), calmRow(), deckRow(),
    check(L["Show health numbers"], unitFrameSetting("healthText")), check(L["Tag mark on your target: a green check if you tagged it, a grey X if another player did"], unitFrameSetting("tagMark")),
    { "cycle", L["Health as"], { { "value", L["Value (42.8K)"] }, { "percent", L["Percent (84%)"] } }, unitFrameSetting("healthFormat") },
    check(L["Show levels (reload)"], reloadSetting("UnitFrames", "showLevel")),
    check(L["Boss frames, top left (reload)"], reloadSetting("UnitFrames", "boss")), check(L["Party pets and targets, above the party (reload)"], reloadSetting("PartyExtras", "show")),
    check(L["Group threat panel: who has the most threat on your target (reload)"], reloadSetting("GroupThreat", "show")), check(L["Shaman totems under the player frame (reload)"], reloadSetting("ClassBars", "totems")),
    check(L["Druid mana under the player frame in bear and cat form (reload)"], reloadSetting("ClassBars", "druidMana")),
  }
end

-- Cast bars and the target/focus aura rows.
local function castRows()
  return {
    { "header", L["Cast bars"] },
    check(L["Your cast bar (and your pet's)"], reloadSetting("CastBars", "player")),
    check(L["Target cast bar"], reloadSetting("CastBars", "target")), check(L["Focus cast bar"], reloadSetting("CastBars", "focus")),
    check(L["Ring at the cursor: the global cooldown and your cast"], liveMethod("CastBars", "ring", "ApplyRing")),
    check(L["Interrupt mark beside the target and focus cast bars"], liveMethod("CastBars", "interruptMark", "RefreshMarks")),
    { "header", L["Target and focus auras"] },
    check(L["Only your debuffs (reload)"], reloadSetting("FrameAuras", "onlyMine")),
    check(L["Timer numbers on the icons (reload)"], reloadSetting("FrameAuras", "timers")),
  }
end

-- get/set for the weapon enchant cells, which show or hide at once.
local function enchantSetting()
  return liveMethod("PlayerAuras", "enchants", "UpdateEnchants")
end

-- Your own buffs and debuffs (their icons sit by the minimap), after the target and focus auras.
local function playerAuraRows()
  return {
    { "header", L["Your buffs and debuffs"] },
    check(L["Timer numbers on your buffs (reload)"], reloadSetting("PlayerAuras", "timers")),
    check(L["Weapon enchants in front of your buffs"], enchantSetting()),
    { "cycle", L["Icon size (reload)"], { { 26, L["Small"] }, { 30, L["Medium"] }, { 36, L["Large"] } }, reloadSetting("PlayerAuras", "size") },
  }
end

-- Small readouts on the unit frames: threat on your target, your pet's mood.
local function readoutRows()
  return {
    { "header", L["Readouts"] },
    check(L["Your threat on your target, above its frame (reload)"], reloadSetting("UnitExtras", "threat")),
    check(L["Your pet's happiness, a dot on the pet frame (reload)"], reloadSetting("UnitExtras", "happiness")),
    check(L["Status chip beside your frame: Eating, Drinking, Well Fed, or a missing buff from Instance prep's checks, out of combat (reload)"], reloadSetting("UnitExtras", "chip")),
  }
end

-- get/set for one power bar spark, which switches at once.
local function sparkSetting(key)
  return liveSetting("PowerTicks", key, function() local PT = ns.GetModule("PowerTicks") if PT.spark then PT.UpdateMode() end end)
end

-- Combat timers: the swing timer, and the sparks on your power bar.
local function timerRows()
  return {
    { "header", L["Combat timers"] },
    { "cycle", L["Swing timer (reload)"], { { "auto", L["Melee and hunters"] }, { "always", L["Always"] }, { "never", L["Never"] } }, reloadSetting("SwingTimer", "show") },
    check(L["Five-second rule spark on your mana bar"], sparkSetting("mana")),
    check(L["Energy tick spark on your energy bar"], sparkSetting("energy")),
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
    { "header", L["Raid frames"] },
    check(L["Use them for your party too"], reloadSetting("RaidFrames", "showInParty")), check(L["Include yourself"], reloadSetting("RaidFrames", "showPlayer")),
    check(L["Sort by role (tanks, healers, damage)"], previewedSetting("sortByRole")),
    { "cycle", L["Groups as (reload)"], { { "columns", L["Columns"] }, { "rows", L["Rows (wide, for big raids)"] } }, previewedSetting("layout") },
    check(L["Stack big raids at the left (more than 10 players)"], stackSetting()), check(L["Hide the default raid frames"], reloadSetting("RaidFrames", "hideBlizzard")),
    { "cycle", L["Style"], { { "soft", L["Class colors, softened"] }, { "dark", L["Dark, class-colored names"] }, { "class", L["Class colors, bright"] } }, raidSetting("look") },
    { "cycle", L["Width"], ns.Widgets.Keep({ { 72, "72" }, { 90, "90" }, { 100, "100" }, { 120, "120" } }), previewedSetting("width") },
    { "cycle", L["Height"], { { 36, "36" }, { 40, "40" }, { 48, "48" }, { 56, "56" } }, previewedSetting("height") },
  }
end

-- The preview: sample players in the raid tiles, to check them without a group (not saved).
local function raidPreviewRows()
  local RP = ns.RaidPreview
  return {
    { "header", L["Preview"] },
    { "text", L["Fills the raid tiles with sample players, so you can check their size, style and layout alone. A new width, height, sorting or Groups as shows in the preview at once (the real frames take a reload). It ends when you join a group, enter combat or reload."] },
    { "cycle", L["Preview with sample players"], RP.CHOICES, function() return RP.size end, RP.Set },
  }
end

-- The raid frames' auras: debuffs, the dispel highlight and your HoTs (after a reload).
local function raidAuraRows()
  return {
    check(L["Highlight debuffs you can dispel (reload)"], reloadSetting("RaidAuras", "dispel")),
    { "cycle", L["Debuff icons (reload)"], { { 0, L["none"] }, { 2, "2" }, { 3, "3" } }, reloadSetting("RaidAuras", "debuffs") },
    check(L["Show your HoTs (reload)"], reloadSetting("RaidAuras", "hots")),
    { "text", L["Small icons down the right edge of each tile, under the missing-buff mark; on short tiles they continue in a column to the left."], "note" },
    { "cycle", L["Right edge, top (reload)"], ns.GetModule("RaidAuras").SOURCE_CHOICES, reloadSetting("RaidAuras", "indicator1") },
    { "cycle", L["Right edge, second (reload)"], ns.GetModule("RaidAuras").SOURCE_CHOICES, reloadSetting("RaidAuras", "indicator2") },
    { "cycle", L["Right edge, third (reload)"], ns.GetModule("RaidAuras").SOURCE_CHOICES, reloadSetting("RaidAuras", "indicator3") },
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
    check(L["Power bar"], raidSetting("showPower")),
    check(L["Fade players out of range"], statusSetting("rangeFade")),
    check(L["Raid target icons"], raidIconSetting()),
    check(L["Ready check answers"], statusSetting("readyCheck")),
    check(L["Mark players being resurrected or summoned"], statusSetting("resurrect")),
    check(L["Leader and assistant marks"], statusSetting("leader")),
  }), raidPreviewRows())
end

O.AddPage({ key = "unitframes", title = L["Unit frames"], icon = "NavUnitFrames", order = 30, rows = function() return append(append(append(append(unitFrameRows(), readoutRows()), castRows()), playerAuraRows()), timerRows()) end })
O.AddPage({ key = "raid", title = L["Raid frames"], icon = "NavRaidFrames", order = 40, rows = raidPageRows })
