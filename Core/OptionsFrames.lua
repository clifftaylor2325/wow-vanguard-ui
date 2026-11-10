-- The Unit frames and Raid frames pages (/vg): the unit frames, their
-- readouts, cast bars, your buffs and debuffs and combat timers; the raid frames and their
-- indicators. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local L = ns.L

local O = ns.Options
local setting, reloadSetting, liveSetting, liveMethod, check, append = O.Setting, O.ReloadSetting, O.LiveSetting, O.LiveMethod, O.Check, O.Append
local essential = O.Essential

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

-- The Calm HUD switch, on the General page (applied at once, also from a situation).
local function calmRow()
  return check(L["Calm HUD out of combat"], calmSetting("calm"))
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
  return check(L["Versus deck"],
    liveMethod("UnitFrames", "deck", "ApplyDeck"))
end

-- The in-combat mark switch: crossed swords and a red edge on your frame, the edge on your target's (at once).
local function combatRow()
  return check(L["In-combat mark"],
    liveMethod("UnitFrames", "combatMark", "RefreshCombat"))
end

-- When the keystone shows: with the Shield look (the default), always, or never.
local KEYSTONE_CHOICES = { { "auto", L["With the Shield look"] }, { "on", L["Always"] }, { "off", L["Never"] } }

-- The keystone card: when it shows, and whether the global cooldown sweeps its ring (both at once).
local function keystoneRows()
  return {
    { "header", L["Keystone"] },
    { "cycle", L["Show the keystone"], KEYSTONE_CHOICES, liveMethod("UnitFrames", "keystone", "ApplyKeystone") },
    check(L["Global cooldown on the keystone"], liveMethod("UnitFrames", "keystoneSweep", "ApplyKeystone")),
  }
end

-- The mana bar switch's name, and its tip (its caption before the names were shortened): druids only on WoW
-- Forever, three more specs on Retail.
O.MANA_BAR_NAME = ns.ClientData({
  forever = L["Druid mana in bear and cat form (reload)"],
  retail = L["Mana under the player frame (reload)"],
})
O.MANA_BAR_LABEL = ns.ClientData({
  forever = L["Druid mana under the player frame in bear and cat form (reload)"],
  retail = L["Mana under the player frame when your power bar shows another power: druid forms, Shadow, Elemental and Balance (reload)"],
})

-- The text formats of the health and power numbers (Modules/UnitFrames.lua, UF.FORMATS); a hidden value falls back to
-- the value, or the percent alone, as the page's note says.
local TEXT_FORMATS = {
  { "value", L["Value (42.8K)"] }, { "percent", L["Percent (84%)"] },
  { "both", L["Both (42.8K  84%)"] }, { "deficit", L["Missing (-7.1K)"] },
}

-- The power text's choices: the same formats, and none (the default).
local POWER_FORMAT_CHOICES = { { "none", L["Off"] }, TEXT_FORMATS[1], TEXT_FORMATS[2], TEXT_FORMATS[3], TEXT_FORMATS[4] }

-- The frames the sliders size, in the order the page lists them: the settings group (UF.FrameSize), its caption, and
-- whether its sliders show on the folded card (the frames a player resizes most; the rest sit under More settings).
local SIZED_FRAMES = {
  { "player", L["Player"], true }, { "target", L["Target"], true }, { "targettarget", L["Target of target"] },
  { "focus", L["Focus"] }, { "pet", L["Pet"] }, { "party", L["Party"], true },
}

-- A width or height slider for one frame (range from UnitFrames.RANGES), applied at once, out of combat.
local function sizeSlider(frame, dimension)
  local group, caption = frame[1], frame[2]
  local label = dimension == "width" and L["{frame}: width"] or L["{frame}: height"]
  local key = group .. (dimension == "width" and "Width" or "Height")
  local range = ns.GetModule("UnitFrames").RANGES[dimension]
  local row = { "slider", ns.Format(label, { frame = caption }), range, liveMethod("UnitFrames", key, "ApplySizes") }
  row.essential = frame[3] == true
  return row
end

-- The Frame sizes card: a width and a height slider for each frame (the target's height is the one setup's role layouts raise).
local function sizeRows()
  local rows = { { "header", L["Frame sizes"] } }
  for _, frame in ipairs(SIZED_FRAMES) do
    rows[#rows + 1] = sizeSlider(frame, "width")
    rows[#rows + 1] = sizeSlider(frame, "height")
  end
  return rows
end

-- The Power text card: its format, and what a format does while the client hides the numbers.
local function powerTextRows()
  return {
    { "header", L["Power text"] },
    { "cycle", L["Show power as"], POWER_FORMAT_CHOICES, liveMethod("UnitFrames", "powerFormat", "ApplyPowerText") },
    { "text", L["Where the game hides numbers, Both shows the percent alone and Missing leaves out the minus sign."], "note" },
  }
end

-- The Heals and shields card: the bars on the player, target and party frames and the status row (leader, role, resting,
-- PvP) over their corner, each applied at once.
local function predictionRows()
  return {
    { "header", L["Heals, shields and status marks"] },
    check(L["Incoming heals on your frames"], liveMethod("UnitFrames", "healPrediction", "ApplyPrediction")),
    check(L["Shields on your frames"], liveMethod("UnitFrames", "absorbs", "ApplyPrediction")),
    check(L["Leader, role, resting and PvP marks"], liveMethod("UnitFrames", "statusMarks", "ApplyStatus")),
  }
end

-- Unit frames, and the class bars under the player frame.
local function unitFrameRows()
  return append({
    { "header", L["Unit frames"] },
    check(L["Replace the default unit frames"], reloadSetting("UnitFrames", "hideBlizzard")), deckRow(), combatRow(),
    check(L["Show health numbers"], unitFrameSetting("healthText")), check(L["Tag mark on your target"], unitFrameSetting("tagMark")),
    { "cycle", L["Health as"], TEXT_FORMATS, unitFrameSetting("healthFormat") },
    check(L["Show levels (reload)"], reloadSetting("UnitFrames", "showLevel")),
    check(L["Boss frames, top left (reload)"], reloadSetting("UnitFrames", "boss")), check(L["Party pets and targets, above the party (reload)"], reloadSetting("PartyExtras", "show")),
    check(L["Group threat panel (reload)"], reloadSetting("GroupThreat", "show")), check(L["Shaman totems above the player frame (reload)"], reloadSetting("ClassBars", "totems")),
    O.Renamed(check(O.MANA_BAR_NAME, reloadSetting("ClassBars", "druidMana")), O.MANA_BAR_LABEL),
  }, append(append(powerTextRows(), predictionRows()), sizeRows()))
end

-- Cast bars, and the target and focus auras' card (its rows are Modules/FrameAuras.lua's).
local function castRows()
  return append({
    { "header", L["Cast bars"] },
    check(L["Your cast bar (and your pet's)"], reloadSetting("CastBars", "player")),
    check(L["Target cast bar"], reloadSetting("CastBars", "target")), check(L["Focus cast bar"], reloadSetting("CastBars", "focus")),
    check(L["Cast ring at the cursor"], liveMethod("CastBars", "ring", "ApplyRing")),
    check(L["Interrupt mark on cast bars"], liveMethod("CastBars", "interruptMark", "RefreshMarks")),
    { "header", L["Target and focus auras"] },
  }, ns.GetModule("FrameAuras").OptionRows())
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
local function readoutCard()
  return {
    { "header", L["Readouts"] },
    check(L["Your threat on your target (reload)"], reloadSetting("UnitExtras", "threat")),
    check(L["Pet happiness dot (reload)"], reloadSetting("UnitExtras", "happiness")),
    check(L["Status chip beside your frame (reload)"], reloadSetting("UnitExtras", "chip")),
  }
end

-- The readouts' card, on the clients that have them (WoW Forever).
local function readoutRows()
  return O.ModuleRows("UnitExtras", readoutCard)
end

-- get/set for one power bar spark, which switches at once.
local function sparkSetting(key)
  return liveSetting("PowerTicks", key, function() local PT = ns.GetModule("PowerTicks") if PT.spark then PT.UpdateMode() end end)
end

-- The swing timer's row.
local function swingRows()
  return { { "cycle", L["Swing timer (reload)"], { { "auto", L["Melee and hunters"] }, { "always", L["Always"] }, { "never", L["Never"] } }, reloadSetting("SwingTimer", "show") } }
end

-- The power bar sparks' rows.
local function sparkRows()
  return { check(L["Five-second rule spark on your mana bar"], sparkSetting("mana")), check(L["Energy tick spark on your energy bar"], sparkSetting("energy")) }
end

-- Combat timers: the swing timer, and the sparks on your power bar, each where the client has it (no card without either).
local function timerRows()
  local rows = append(O.ModuleRows("SwingTimer", swingRows), O.ModuleRows("PowerTicks", sparkRows))
  if #rows == 0 then return rows end
  table.insert(rows, 1, { "header", L["Combat timers"] })
  return rows
end

-- get/set for a raid frame setting the preview (Modules/RaidPreview.lua) shows at once; the real frames take a reload.
local function previewedSetting(key)
  local get, set, initial = reloadSetting("RaidFrames", key)
  return get, function(v) set(v); ns.RaidPreview.Refresh() end, initial
end

-- get/set for the raid tiles' width or height: the real tiles resize at once (out of combat) and so does the preview.
local function sizeSetting(key)
  local get, set, initial = setting("RaidFrames", key)
  return get, function(v) set(v); ns.GetModule("RaidFrames").ApplySize(); ns.RaidPreview.Refresh() end, initial
end

-- The raid tiles' width and height sliders: every step the choices used to have (72, 90, 100, 120 wide; 36, 40, 48, 56 tall)
-- lies on them, so no saved size changes.
local RAID_WIDTHS = { min = 72, max = 120, step = 2 }
local RAID_HEIGHTS = { min = 36, max = 56, step = 2 }

-- get/set for Stack big raids: the real frames and the preview follow at once.
local function stackSetting()
  local get, set, initial = reloadSetting("RaidFrames", "stackBig")
  return get, function(v) set(v); ns.GetModule("RaidFrames").Fit(); ns.RaidPreview.Refresh() end, initial
end

-- Raid frames: party coverage, sorting, size. The essential rows (Core/OptionsFold.lua) are the ones that lay the
-- whole feature out or replace the game's.
local function raidRows()
  return {
    { "header", L["Raid frames"] },
    check(L["Use them for your party too"], reloadSetting("RaidFrames", "showInParty")), check(L["Include yourself (in a party)"], reloadSetting("RaidFrames", "showPlayer")),
    essential(check(L["Sort by role (tanks, healers, damage)"], previewedSetting("sortByRole"))),
    essential({ "cycle", L["Groups as (reload)"], { { "columns", L["Columns"] }, { "rows", L["Rows (wide, for big raids)"] } }, previewedSetting("layout") }),
    essential(check(L["Stack big raids at the left"], stackSetting())), essential(check(L["Hide the default raid frames"], reloadSetting("RaidFrames", "hideBlizzard"))),
    essential({ "cycle", L["Style"], { { "soft", L["Class colors, softened"] }, { "dark", L["Dark, class-colored names"] }, { "class", L["Class colors, bright"] } }, raidSetting("look") }),
    essential({ "slider", L["Width"], RAID_WIDTHS, sizeSetting("width") }),
    essential({ "slider", L["Height"], RAID_HEIGHTS, sizeSetting("height") }),
  }
end

-- The preview: sample players in the raid tiles, to check them without a group (not saved).
local function raidPreviewRows()
  local RP = ns.RaidPreview
  return {
    { "header", L["Preview"] },
    { "text", L["Fills the raid tiles with sample players, so you can check their size, style and layout alone. A new width or height shows in the preview and on the real tiles at once (out of combat); sorting and Groups as show in the preview at once, the real frames take a reload. It ends when you join a group, enter combat or reload."] },
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
    check(L["Mark resurrections and summons"], statusSetting("resurrect")),
    check(L["Leader and assistant marks"], statusSetting("leader")),
  }), raidPreviewRows())
end

O.AddPage({ key = "unitframes", title = L["Unit frames"], icon = "NavUnitFrames", order = 30, rows = function() return append(append(append(append(append(unitFrameRows(), keystoneRows()), readoutRows()), castRows()), playerAuraRows()), timerRows()) end })
O.AddPage({ key = "raid", title = L["Raid frames"], icon = "NavRaidFrames", order = 40, rows = raidPageRows })
