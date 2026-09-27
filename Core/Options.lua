-- The options pages (/fui, or the addons button by the minimap): a page
-- per area, as tables of rows. Core/OptionsWindow.lua builds the window
-- from them. Most changes apply at once; the ones that rebuild frames
-- light up the reload notice.

local ADDON, ns = ...

local T = ns.Theme

local O = {}
ns.Options = O


-- Settings accessors ------------------------------------------------------------------

-- A module's settings in the active profile, with its defaults.
local function moduleSettings(name)
  local m = ns.GetModule(name)
  return ns.Settings(name, m and m.defaults or {})
end

-- get/set for one module setting; reload marks a change that needs one.
local function setting(module, key, reload)
  return function() return moduleSettings(module)[key] end,
    function(v) moduleSettings(module)[key] = v; if reload then O.NeedReload() end end
end

-- get/set for the raid frame style, repainting the raid frames at once.
local function raidStyle()
  local get, set = setting("RaidFrames", "style")
  return get, function(v)
    set(v)
    local RF = ns.GetModule("RaidFrames")
    if RF and RF.settings then RF.UpdateAll() end
  end
end

-- get/set for whether action bar n is shown (applies on reload).
local function barSetting(n)
  return function() local b = moduleSettings("ActionBars").bars[n] return b and b.enabled end,
    function(v) moduleSettings("ActionBars").bars[n].enabled = v; O.NeedReload() end
end

-- get/set for an unlock-mode option (grid, snap), applied at once.
local function moverOption(key)
  return function() return ns.MoverOptions()[key] end, function(v) ns.MoverOptions()[key] = v end
end

-- Page rows ---------------------------------------------------------------------------

-- A check row: { "check", label, get, set }.
local function check(text, get, set)
  return { "check", text, get, set }
end

-- The rows of b appended to a; returns a.
local function append(a, b)
  for _, row in ipairs(b) do a[#a + 1] = row end
  return a
end

-- get/set for a theme setting; changes apply on reload.
local function themeSetting(key)
  return function() return T.Settings()[key] end, function(v) T.Settings()[key] = v; O.NeedReload() end
end

local FONT_CHOICES = { { "", "Fira Sans Condensed" }, { "client", "the game's font" } }
local BAR_TEXTURES = { { "forever", "Forever" }, { "flat", "Flat" } }
-- Text size: 80% to 130% in steps of 5.
local TEXT_SIZES = { min = 0.8, max = 1.3, step = 0.05, format = function(v) return string.format("%d%%", math.floor(v * 100 + 0.5)) end }

-- General, part one: accent, font, text size, scale and theme reset.
local function lookRows()
  return {
    { "header", "Look" },
    { "preview" },
    { "swatches" },
    { "cycle", "Font", FONT_CHOICES, themeSetting("font") },
    { "slider", "Text size", TEXT_SIZES, themeSetting("textScale") },
    check("Pixel-perfect UI scale (768 / screen height)", function() return T.Settings().pixelScale end,
      function(v) T.SetPixelScale(v); if not v then O.NeedReload() end end),
    { "button", "Reset theme", function() T.Reset() end },
  }
end

-- General, part two: moving frames.
local function layoutRows()
  return {
    { "header", "Layout" },
    { "button", "Move frames", function() O.Hide(); ns.Unlock() end },
    check("Show a grid while moving", moverOption("grid")),
    check("Snap to other frames", moverOption("snap")),
    { "text", "While moving frames, right-click one for its exact anchor and offsets." },
    { "button", "Reset all positions", function() ns.ResetMovers("all") end },
  }
end

-- General, bars: texture and smoothing.
local function barRows()
  return {
    { "header", "Bars" },
    { "cycle", "Bar texture", BAR_TEXTURES, themeSetting("barTexture") },
    check("Smooth health and power bars", function() return T.Settings().smoothBars end, function(v) T.Settings().smoothBars = v end),
  }
end

-- General, motion and sound.
local function motionRows()
  return {
    { "header", "Motion and sound" },
    check("Reduce motion (no fades or flashes)", function() return T.Settings().reduceMotion end, function(v) T.Settings().reduceMotion = v end),
    check("Interface sounds", function() return T.Settings().sounds end, function(v) T.Settings().sounds = v end),
  }
end

-- General: look, bars, motion and layout.
local function generalRows()
  return append(append(append(lookRows(), barRows()), motionRows()), layoutRows())
end

-- Modules: one check per module (applies on reload).
local function moduleRows()
  local rows = { { "header", "Modules" }, { "text", "A module that's off builds nothing and costs nothing." } }
  for _, name in ipairs(ns.ModuleNames()) do
    rows[#rows + 1] = check(name, function() return ns.ModuleEnabled(name) end,
      function(v) ns.SetModuleEnabled(name, v); O.NeedReload() end)
  end
  return rows
end

-- Unit frames.
local function unitFrameRows()
  return {
    { "header", "Unit frames" },
    check("Replace the default unit frames", setting("UnitFrames", "hideBlizzard", true)),
    check("Show health numbers", setting("UnitFrames", "healthText", true)),
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
    check("Only your debuffs", setting("FrameAuras", "onlyMine")),
  }
end

-- Action bars: which bars, locking, range tint, button size.
local function actionBarRows()
  local rows = { { "header", "Action bars" } }
  for n = 1, 8 do rows[#rows + 1] = check("Bar " .. n, barSetting(n)) end
  rows[#rows + 1] = check("Lock buttons (Shift-drag to move actions)", setting("ActionBars", "lockButtons"))
  rows[#rows + 1] = check("Red when out of range", setting("ActionBars", "rangeTint"))
  rows[#rows + 1] = check("Hide the default bars", setting("ActionBars", "hideBlizzard", true))
  rows[#rows + 1] = { "cycle", "Button size", { { 32, "32" }, { 36, "36" }, { 40, "40" }, { 44, "44" } }, setting("ActionBars", "size", true) }
  return rows
end

-- get/set for restyling all three of the client's special bars at once (applies on reload).
local function skinSpecial()
  return function() return moduleSettings("SpecialBars").skinPet end, function(v)
    local s = moduleSettings("SpecialBars")
    s.skinPet, s.skinStance, s.skinExtra = v, v, v
    O.NeedReload()
  end
end

-- Action bars plus the client's special buttons and the vehicle exit.
local function actionBarPageRows()
  return append(actionBarRows(), {
    check("Restyle the pet, stance and extra action buttons (reload)", skinSpecial()),
    check("Vehicle exit button (reload)", setting("SpecialBars", "vehicleExit", true)),
  })
end

-- XP and reputation bars, minimap, chat and bags.
local function moreRows()
  return {
    { "header", "XP and reputation" },
    check("Experience bar", setting("DataBars", "xp", true)),
    check("Reputation bar", setting("DataBars", "reputation", true)),
    { "cycle", "Numbers", { { "hover", "on hover" }, { "always", "always" } }, setting("DataBars", "text", true) },
    { "header", "Minimap, chat, bags" },
    check("Coordinates under the minimap", setting("Minimap", "coords", true)),
    check("Chat background", setting("Chat", "background", true)),
    check("Combined bag", setting("Bags", "combined", true)),
  }
end

-- Tooltips: where they sit and what they add.
local function tooltipRows()
  return {
    { "header", "Tooltips" },
    { "cycle", "Tooltip position", { { "corner", "corner (movable)" }, { "cursor", "at the cursor" }, { "default", "client default" } }, setting("Tooltips", "anchor") },
    check("Border in the unit's class color", setting("Tooltips", "classBorder")),
    check("Show who the unit is targeting", setting("Tooltips", "targetLine")),
    check("Hide unit tooltips in combat", setting("Tooltips", "hideInCombat")),
  }
end

-- "Spec 2 uses Healer." or why there's no spec profile.
local function specText()
  local spec = ns.SpecIndex()
  if not spec then return "No specialization yet." end
  return string.format("Spec %d uses %s.", spec, ns.SpecProfile(spec) or "the character's profile")
end

-- Buttons to switch to each other profile (up to five).
local function profileButtons(rows)
  local shown = 0
  for _, name in ipairs(ns.ProfileNames()) do
    if name ~= ns.ProfileName() and shown < 5 then
      shown = shown + 1
      rows[#rows + 1] = { "button", "Use " .. name, function() ns.UseProfile(name); O.NeedReload() end }
    end
  end
end

-- Profiles, part one: which profile, export/import, reset.
local function currentProfileRows()
  return {
    { "header", "Profile" },
    { "text", function() return "This character uses " .. ns.ProfileName() .. "." end },
    { "button", "Export profile", function() ns.ShowText("ForeverUI export  Ctrl+C to copy", ns.ExportProfile()) end },
    { "button", "Import", function() ns.ImportDialog() end },
    { "button", "Reset profile", function() ns.ResetProfile(); O.NeedReload() end },
  }
end

-- Profiles, part two: the spec profile.
local function specRows()
  return {
    { "header", "Specialization" },
    { "text", specText },
    { "button", "Use this profile for this spec", function() ns.SetSpecProfile(ns.ProfileName()); O.Refresh() end },
    { "button", "Stop spec switching", function() ns.SetSpecProfile(nil); O.Refresh() end },
  }
end

-- Profiles: export/import, reset, spec profiles, switching.
local function profileRows()
  local rows = append(currentProfileRows(), specRows())
  rows[#rows + 1] = { "header", "Switch profile" }
  profileButtons(rows)
  return rows
end

-- Raid frames: party coverage, sorting, size.
local function raidRows()
  return {
    { "header", "Raid frames" },
    check("Use them for your party too", setting("RaidFrames", "showInParty", true)),
    check("Include yourself", setting("RaidFrames", "showPlayer", true)),
    check("Sort by role (tanks, healers, damage)", setting("RaidFrames", "sortByRole", true)),
    check("Hide the default raid frames", setting("RaidFrames", "hideBlizzard", true)),
    { "cycle", "Style", { { "class", "Class colors" }, { "dark", "Dark" } }, raidStyle() },
    { "cycle", "Width", { { 72, "72" }, { 90, "90" }, { 110, "110" } }, setting("RaidFrames", "width", true) },
    { "cycle", "Height", { { 32, "32" }, { 40, "40" }, { 48, "48" } }, setting("RaidFrames", "height", true) },
  }
end

-- Raid frames plus their indicators.
local function raidPageRows()
  return append(raidRows(), {
    check("Highlight debuffs you can dispel", setting("RaidAuras", "dispel")),
    check("Show your HoTs", setting("RaidAuras", "hots")),
    check("Fade players out of range", setting("RaidStatus", "rangeFade")),
    check("Raid target icons", setting("RaidStatus", "raidIcons")),
    check("Ready check answers", setting("RaidStatus", "readyCheck")),
    check("Mark players being resurrected", setting("RaidStatus", "resurrect")),
    check("Leader and assistant marks", setting("RaidStatus", "leader")),
  })
end

-- Pages: key, title, nav icon (Media/Icons) and order in the nav (groups: under 30, under 90, the rest).
local PAGES = {
  { key = "general", title = "General", icon = "General", order = 10, rows = generalRows },
  { key = "modules", title = "Modules", icon = "Modules", order = 20, rows = moduleRows },
  { key = "unitframes", title = "Unit frames", icon = "UnitFrames", order = 30, rows = function() return append(unitFrameRows(), castRows()) end },
  { key = "raid", title = "Raid frames", icon = "RaidFrames", order = 40, rows = raidPageRows },
  { key = "actionbars", title = "Action bars", icon = "ActionBars", order = 60, rows = actionBarPageRows },
  { key = "more", title = "Bars, map, chat", icon = "Map", order = 80, rows = function() return append(moreRows(), tooltipRows()) end },
  { key = "profiles", title = "Profiles", icon = "Profiles", order = 90, rows = profileRows },
}
O.PAGES = PAGES

-- Adds a page from another file (e.g. a module's own options): key, title, icon, order, rows.
function O.AddPage(page)
  PAGES[#PAGES + 1] = page
end

-- The addons button by the minimap: left-click options, right-click move frames.
function ForeverUI_OnAddonCompartmentClick(_, button)
  if button == "RightButton" then
    if ns.Unlocked() then ns.Lock() else ns.Unlock() end
  else
    O.Toggle()
  end
end
