-- The Action bars page (/vg): the shared card (locking, range, the
-- default and special bars, keybind mode), the Your keys card, then one card per bar.
-- Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local L = ns.L

local O = ns.Options
local moduleSettings, setting, reloadSetting, liveSetting, liveMethod, check, append = O.ModuleSettings, O.Setting, O.ReloadSetting, O.LiveSetting, O.LiveMethod, O.Check, O.Append

-- get/set for whether action bar n is shown (applies on reload).
local function barSetting(n)
  return O.Tag(function() local b = moduleSettings("ActionBars").bars[n] return b and b.enabled end, "ActionBars", "bars"),
    function(v) moduleSettings("ActionBars").bars[n].enabled = v; O.NeedReload() end
end

-- Tells the action bars that bar n's `key` changed, if they are running.
local function barChanged(n, key)
  local AB = ns.GetModule("ActionBars")
  if AB and AB.enabled then AB.SettingChanged(n, key) end
end

-- get/set for one of action bar n's settings (button count, per row,
-- visibility); applies at once, or when combat ends.
local function barOption(n, key)
  return O.Tag(function() return moduleSettings("ActionBars").bars[n][key] end, "ActionBars", "bars"),
    function(v) moduleSettings("ActionBars").bars[n][key] = v; barChanged(n, key) end
end

-- get/set for action bar n's button size (the shared size until the bar has its own).
local function barSizeOption(n)
  local _, set = barOption(n, "size")
  return function() local s = moduleSettings("ActionBars") return s.bars[n].size or s.size end, set
end

-- get/set for restyling the client's special bars (pet, stance, possess, extra) at once (applies on reload).
local function skinSpecial()
  return function() return moduleSettings("SpecialBars").skinPet end, function(v)
    local s = moduleSettings("SpecialBars")
    s.skinPet, s.skinStance, s.skinPossess, s.skinExtra = v, v, v, v
    O.NeedReload()
  end
end

-- Keybind mode (Modules/ActionBarKeybinds.lua): the options window steps aside for it.
local function keybindMode()
  O.Hide()
  ns.GetModule("ActionBars").KeybindMode(true)
end

-- get/set for the bar backing, which shows or hides at once (out of combat).
local function backingSetting()
  return liveSetting("ActionBars", "backing", function() ns.OutOfCombat(ns.GetModule("ActionBars").UpdateBackings) end)
end

-- Action bars, shared: locking, range tint, the default bars, the client's special buttons, keybind mode.
local function actionBarRows()
  return {
    { "header", L["Action bars"] },
    check(L["Lock buttons (Shift-drag to move actions)"], setting("ActionBars", "lockButtons")), check(L["Red when out of range"], liveMethod("ActionBars", "rangeTint", "RepaintIcons")),
    { "cycle", L["Bar backing"], { { "auto", L["Follow the theme"] }, { "on", L["Always"] }, { "off", L["Never"] } }, backingSetting() },
    check(L["Hide the default bars"], reloadSetting("ActionBars", "hideBlizzard")),
    check(L["Restyle the pet, stance, possess and extra action buttons (reload)"], skinSpecial()),
    check(L["Pet and stance bars in their own movable spots (reload)"], reloadSetting("SpecialBars", "place")),
    check(L["Vehicle exit button (reload)"], reloadSetting("SpecialBars", "vehicleExit")),
    { "text", L["Empty slots stay hidden until you drag a spell or item onto the bars."] }, { "button", L["Keybind mode"], keybindMode },
  }
end

-- Your keys (Modules/KeysViewCard.lua): what every key does now, read-only.
local function yourKeysRows()
  return {
    { "header", L["Your keys"] },
    { "text", L["What every key does now. Hold Shift, Ctrl or Alt to see those keys, and hover a key for what it does."] },
    { "keystabs" }, { "keyboard" }, { "keylist" },
  }
end

-- Buttons on a bar, and per row: 1 to 12.
local BAR_BUTTONS = { min = 1, max = 12, step = 1 }
-- Button size: 24 to 48 px in steps of 2.
local BAR_SIZES = { min = 24, max = 48, step = 2, format = function(v) return ns.Format(L["{size} px"], { size = v }) end }

-- Bar n's card title ("Bar 4, right edge" for the bars on the right edge).
local function barTitle(n)
  local AB = ns.GetModule("ActionBars")
  local title = (AB and AB.RightEdge(n)) and L["Bar {n}, right edge"] or L["Bar {n}"]
  return ns.Format(title, { n = n })
end

-- When bar n is seen (Core/Visibility.lua): Always, On mouseover (only while the
-- mouse is over it), In combat, Hidden, or while a condition checked below holds.
-- Bars shown on mouseover or on conditions also show while you drag a spell or
-- item. "Hidden" doesn't draw the bar, but its keys still cast (a keybind-only bar).
local function barVisibilityRows(n)
  local mode, when = ns.Visibility.Rows({
    caption = L["Visibility"],
    tbl = function() return moduleSettings("ActionBars").bars[n] end,
    modeKey = "visibility",
    whenKey = "showWhen",
    after = function() barChanged(n, "visibility") end,
  })
  O.Tag(mode[4], "ActionBars", "bars")
  return mode, when
end

-- One action bar's card: on/off, visibility, button count, per row and size.
local function oneBarRows(n)
  local visibility, showWhen = barVisibilityRows(n)
  return {
    { "header", barTitle(n) }, check(ns.Format(L["Show bar {n}"], { n = n }), barSetting(n)),
    visibility,
    { "text", L["Hidden bars keep their keys: a bound key still casts."] },
    showWhen,
    { "slider", L["Buttons"], BAR_BUTTONS, barOption(n, "buttons") },
    { "slider", L["Buttons per row"], BAR_BUTTONS, barOption(n, "perRow") },
    { "slider", L["Button size"], BAR_SIZES, barSizeOption(n) },
  }
end

-- The action bar page: the shared card, then one card per bar.
local function actionBarPageRows()
  local rows = actionBarRows()
  append(rows, yourKeysRows())
  for n = 1, 8 do append(rows, oneBarRows(n)) end
  return rows
end

O.AddPage({ key = "actionbars", title = L["Action bars"], icon = "NavActionBars", order = 60, rows = actionBarPageRows })
