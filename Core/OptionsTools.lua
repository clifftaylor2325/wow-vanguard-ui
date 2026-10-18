-- The Combat tools page (/vg): the game's damage meter and alerts, boss mods, fight history, the
-- Vanguard meter and the roll tracker. Core/Options.lua has the helpers and
-- the page list.

local ADDON, ns = ...

local O = ns.Options
local setting, liveSetting, check, append = O.Setting, O.LiveSetting, O.Check, O.Append

-- Puts the low-health vignette (Modules/GameAlerts.lua) right after a change of its switch.
local function applyVignette()
  ns.GetModule("GameAlerts").ApplyVignette()
end

-- The game's alerts (Modules/GameAlerts.lua) and the low-health vignette.
local function alertRows()
  return {
    check("Loss of control in the Vanguard look, above your character (reload)", setting("GameAlerts", "lossOfControl", true)),
    { "cycle", "Talking head (reload)", { { "move", "Vanguard look, top center" }, { "hide", "Hidden" }, { "game", "The game's" } }, setting("GameAlerts", "talkingHead", true) },
    check("Hardcore death notices in the Vanguard look (reload)", setting("GameAlerts", "hardcore", true)),
    check("A rare nearby: a sound and a chat line, out of combat", setting("GameAlerts", "rares")),
    check("Low health: a soft tint round the screen edge that grows as your health drops (no pulse)", liveSetting("GameAlerts", "vignette", applyVignette)),
  }
end

-- The game's own tools: the damage meter and the alerts (the Cooldown Manager is on the Cooldowns page).
local function gameToolRows()
  return append({
    { "header", "The game's tools" },
    { "text", "The Cooldown Manager, the gaps row and the buff glow are on the Cooldowns page.", "note" },
    check("Damage meter in the Vanguard look (reload)", setting("GameTools", "meter", true)),
    check("Place them to fit the layout; off leaves them to Edit Mode (reload)", setting("GameTools", "place", true)),
  }, alertRows())
end

-- Boss mods: a button to line their bars up with Vanguard's spots, only while one is loaded.
local function bossDockRows()
  local BD = ns.GetModule("BossDocks")
  if not (BD.HasDBM() or BD.HasBigWigs()) then return {} end
  return { { "header", "Boss mods" }, { "button", "Line up boss mod bars with the Boss timers spots", BD.Command },
    { "text", "Move the Boss timers spots with /vg unlock first. Deadly Boss Mods' bars move at once; for BigWigs, chat says where to drag them." } }
end

-- Fight history under the damage meter: its switch (applied at once) and its visibility.
local function fightRows()
  local FH = ns.GetModule("FightHistory")
  local fightVisibility, fightWhen = O.VisibilityRows("Fight history visibility", "FightHistory", "visibility", "showWhen")
  return {
    { "header", "Fight history" },
    check("Sparkline of your DPS in the last 20 fights, under the damage meter", liveSetting("FightHistory", "strip", function() if FH.enabled then FH.Paint() end end)),
    check("Recap in chat after each fight: interrupts, dispels, damage taken, deaths (/vg recap)", setting("FightHistory", "recap")),
    fightVisibility, fightWhen,
  }
end

-- A cycle's choices ({ key, words } in order) from an order list and its words table.
local function meterChoices(order, words)
  local out = {}
  for i, key in ipairs(order) do out[i] = { key, words[key] } end
  return out
end

-- One of the meter's cycle rows: a setting that picks from an order list and its words.
local function meterCycle(caption, key, order, words, paint)
  return { "cycle", caption, meterChoices(order, words), liveSetting("Meter", key, paint) }
end

-- Draws the meter again, building it first when it was just switched on (when the module is on).
local function paint()
  local MT = ns.GetModule("Meter")
  if MT.enabled then MT.Refresh() end
end

-- The meter's share switch and buttons: its chat report and the reset of the game's segments (also /vg meter report and reset).
local function meterButtons()
  local MT = ns.GetModule("Meter")
  return {
    check("Show each line's share of the total (45%) when the game gives plain figures", liveSetting("Meter", "percent", paint)),
    { "cycle", "Report the meter to", { { "chat", "Your chat" }, { "say", "Say" }, { "party", "Party" }, { "raid", "Raid" }, { "instance", "Instance" }, { "guild", "Guild" } }, liveSetting("Meter", "reportTo", paint) },
    { "button", "Report the meter's top lines (also the Report button on the meter)", MT.ReportClick },
    { "button", "Reset the game's damage meter", MT.Reset },
  }
end

-- Vanguard's own damage and healing meter: its switches (applied at once) and its visibility.
local function meterRows()
  local MT = ns.GetModule("Meter")
  local meterVisibility, meterWhen = O.VisibilityRows("Vanguard meter visibility", "Meter", "visibility", "showWhen")
  return {
    { "header", "Vanguard meter" },
    check("Vanguard's own damage and healing meter: the top lines of the game's meter (/vg meter)", liveSetting("Meter", "on", paint)),
    meterCycle("Meter shows", "kind", MT.KIND_ORDER, MT.KINDS, paint),
    meterCycle("Meter segment", "session", MT.SESSION_ORDER, MT.SESSIONS, paint),
    { "slider", "Lines in the meter", { min = 3, max = MT.MAXROWS, step = 1 }, liveSetting("Meter", "rows", paint) },
    meterVisibility, meterWhen,
  }
end

-- The roll tracker: its switches (applied at once) and its visibility.
local function rollRows()
  local R = ns.GetModule("Rolls")
  local rollVisibility, rollWhen = O.VisibilityRows("Roll tracker visibility", "Rolls", "visibility", "showWhen")
  -- Draws the panel again (when the module is on).
  local function repaint() if R.enabled then R.Paint() end end
  return {
    { "header", "Roll tracker" },
    check("Show the group's /roll results in a small panel", liveSetting("Rolls", "show", repaint)),
    check("Show loot rolls (who rolled what) where the client has them", liveSetting("Rolls", "loot", function() if R.enabled then R.ReadLoot() end end)),
    rollVisibility, rollWhen,
  }
end

-- The Combat tools page: the game's tools, boss mods and the fight panels.
local function toolsPageRows()
  local rows = append(gameToolRows(), bossDockRows())
  return append(append(append(append(rows, fightRows()), meterRows()), meterButtons()), rollRows())
end

O.AddPage({ key = "tools", title = "Combat tools", icon = "NavTools", order = 84, rows = toolsPageRows })
