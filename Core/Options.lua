-- The options window (/fui, or the addons button by the minimap): a page
-- per area, built from the tables in PAGES. Most changes apply at once;
-- the ones that rebuild frames light up a Reload UI button.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local O = {}
ns.Options = O

local WIDTH, HEIGHT, NAV_WIDTH = 700, 560, 160
local ROW_HEIGHT = { header = 30, check = 26, button = 32, cycle = 32, swatches = 38, text = 20 }

local window
local pages, widgets = {}, {}
local needsReload = false

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
local TEXT_SIZES = { { 0.9, "90%" }, { 1, "100%" }, { 1.1, "110%" }, { 1.25, "125%" } }

-- General, part one: accent, font, text size, scale and theme reset.
local function lookRows()
  return {
    { "header", "Look" },
    { "text", "Accent color (live):" },
    { "swatches" },
    { "cycle", "Font", FONT_CHOICES, themeSetting("font") },
    { "cycle", "Text size", TEXT_SIZES, themeSetting("textScale") },
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
    { "button", "Reset all positions", function() ns.ResetMovers("all") end },
  }
end

-- General: accent, theme reset, moving frames.
local function generalRows()
  return append(lookRows(), layoutRows())
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

local PAGES = {
  { key = "general", title = "General", rows = generalRows },
  { key = "modules", title = "Modules", rows = moduleRows },
  { key = "unitframes", title = "Unit frames", rows = function() return append(unitFrameRows(), castRows()) end },
  { key = "raid", title = "Raid frames", rows = raidPageRows },
  { key = "actionbars", title = "Action bars", rows = actionBarPageRows },
  { key = "more", title = "Bars, map, chat", rows = function() return append(moreRows(), tooltipRows()) end },
  { key = "profiles", title = "Profiles", rows = profileRows },
}
O.PAGES = PAGES

-- Building ------------------------------------------------------------------------------

-- The accent swatches: one per preset.
local function swatches(content)
  local row = CreateFrame("Frame", nil, content)
  row:SetSize(200, 30)
  local i = 0
  for _, name in ipairs(T.PRESET_ORDER) do
    local rgb = T.PRESETS[name]
    W.Swatch(row, rgb, function() T.SetAccent(rgb[1], rgb[2], rgb[3]) end):SetPoint("LEFT", i * 34, 0)
    i = i + 1
  end
  return row
end

-- Row kind -> builder(content, row) returning the widget.
local BUILDERS = {
  -- One builder per row kind; each returns the widget it made.
  header = function(c, r) return W.Header(c, r[2]) end,
  text = function(c, r) return W.Text(c, r[2]) end,
  check = function(c, r) return W.Check(c, r[2], r[3], r[4]) end,
  button = function(c, r) return W.Button(c, r[2], r[3], 220) end,
  cycle = function(c, r) return W.Cycle(c, r[2], r[3], r[4], r[5]) end,
  swatches = function(c) return swatches(c) end,
}

-- Adds a page from another file (e.g. a module's own options), shown in the nav.
function O.AddPage(page)
  PAGES[#PAGES + 1] = page
end

-- Adds a row kind: builder(content, row) returns the widget; height is its row height.
function O.AddRowKind(kind, builder, height)
  BUILDERS[kind] = builder
  ROW_HEIGHT[kind] = height
end

-- Builds rows top to bottom on content.
local function placeRows(content, rows)
  local y = 0
  for _, row in ipairs(rows) do
    local w = BUILDERS[row[1]](content, row)
    w:SetPoint("TOPLEFT", content, "TOPLEFT", 0, -y)
    widgets[#widgets + 1] = w
    y = y + ROW_HEIGHT[row[1]]
  end
end

-- A page's content frame, right of the nav, with its rows.
local function buildPage(page)
  local content = CreateFrame("Frame", nil, window)
  content:SetPoint("TOPLEFT", NAV_WIDTH + 24, -48)
  content:SetPoint("BOTTOMRIGHT", -16, 52)
  placeRows(content, page.rows())
  return content
end

-- The left-hand page buttons.
local function addNav(f)
  f.nav = {}
  for i, page in ipairs(PAGES) do
    local b = W.Button(f, page.title, function() O.Show(page.key) end, NAV_WIDTH)
    b:SetPoint("TOPLEFT", 12, -48 - (i - 1) * 30)
    f.nav[page.key] = b
  end
end

-- The logo and "ForeverUI" in the top left.
local function addTitle(f)
  f.logo = T.Logo(f, 22)
  f.logo:SetPoint("TOPLEFT", 12, -10)
  f.title = T.Text(f:CreateFontString(nil, "OVERLAY"), "title")
  f.title:SetPoint("LEFT", f.logo, "RIGHT", 6, 0)
  f.title:SetText("ForeverUI")
end

-- Title, close and reload buttons.
local function addChrome(f)
  addTitle(f)
  f.close = T.CloseButton(CreateFrame("Button", nil, f))
  f.close:SetSize(24, 24)
  f.close:SetPoint("TOPRIGHT", -6, -6)
  f.close:SetScript("OnClick", function() O.Hide() end)
  f.reload = W.Button(f, "Reload UI to apply", function() if ReloadUI then ReloadUI() end end, 200)
  f.reload:SetPoint("BOTTOMRIGHT", -14, 14)
end

-- Lets the window be dragged around by any empty spot.
local function makeMovable(f)
  f:EnableMouse(true)
  f:SetMovable(true)
  f:RegisterForDrag("LeftButton")
  f:SetScript("OnDragStart", f.StartMoving)
  f:SetScript("OnDragStop", f.StopMovingOrSizing)
end

-- The window, built on first use: movable, closes with Escape.
local function build()
  window = T.Panel(CreateFrame("Frame", "ForeverUI_Options", UIParent), { alpha = 0.98, shadow = true })
  window:SetSize(WIDTH, HEIGHT)
  window:SetPoint("CENTER")
  window:SetFrameStrata("DIALOG")
  makeMovable(window)
  addChrome(window)
  addNav(window)
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, "ForeverUI_Options") end
end

-- Showing ---------------------------------------------------------------------------------

-- Marks a change that applies on reload, and shows the Reload button.
function O.NeedReload()
  needsReload = true
  if window then window.reload:SetShown(true) end
end

-- Re-reads every widget's value (after a change elsewhere, e.g. a profile switch).
function O.Refresh()
  for _, w in ipairs(widgets) do
    if w.Refresh then w:Refresh() end
  end
end

-- Highlights the current page's nav button.
local function markNav(key)
  for k, b in pairs(window.nav) do
    T.Color(b.text, k == key and "accent" or "text")
  end
end

-- Opens the window on a page (default: the last one shown, or General).
function O.Show(key)
  if not window then build() end
  O.current = key or O.current or "general"
  for _, page in ipairs(PAGES) do
    if page.key == O.current and not pages[page.key] then pages[page.key] = buildPage(page) end
    if pages[page.key] then pages[page.key]:SetShown(page.key == O.current) end
  end
  markNav(O.current)
  window.reload:SetShown(needsReload)
  O.Refresh()
  window:Show()
end

-- Closes the window.
function O.Hide()
  if window then window:Hide() end
end

-- Opens or closes the window.
function O.Toggle()
  if window and window:IsShown() then O.Hide() else O.Show() end
end

-- The addons button by the minimap: left-click options, right-click move frames.
function ForeverUI_OnAddonCompartmentClick(_, button)
  if button == "RightButton" then
    if ns.Unlocked() then ns.Lock() else ns.Unlock() end
  else
    O.Toggle()
  end
end
