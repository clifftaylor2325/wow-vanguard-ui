-- First-run setup: a four-step wizard (layout, screen, look, move things). It
-- opens once per account (ForeverUIDB.setupDone), never in combat (it waits for
-- combat to end, and steps aside if a fight starts while it is open), and
-- /fui setup opens it again. With the defaults, Next, Next, Next, Done finishes it.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local S = {}
ns.Setup = S

local WIDTH, HEIGHT, PAD = 440, 320, 16
local STEPS = { "Layout", "Screen", "Look", "Move things" }

-- Layout presets, in display order; the first is the default.
S.LAYOUTS = {
  { key = "damage", text = "Centered: damage and tanking", hint = "Your frames around your character; party and raid just above your player frame." },
  { key = "healing", text = "Centered: healing", hint = "Party and raid centered above your frames, click casting on." },
  { key = "classic", text = "Like the game's", hint = "Your frames at the top left as the game has them, party and raid down the left side." },
}
-- Like the game's: player and target along the top left (the pet under the
-- player, the target of target beside the target, the focus under that), the
-- party and raid down the left side (the raid grows up from above the bars'
-- height, so a full raid stays clear of the middle), the boss frames on the
-- right under your buffs, and the raid leader's tools and main tanks near the
-- top center, clear of all of it.
S.CLASSIC = {
  uf_player = { "TOPLEFT", "TOPLEFT", 20, -40 }, uf_pet = { "TOPLEFT", "TOPLEFT", 20, -84 },
  uf_target = { "TOPLEFT", "TOPLEFT", 270, -40 }, uf_targettarget = { "TOPLEFT", "TOPLEFT", 520, -46 },
  cast_target = { "TOPLEFT", "TOPLEFT", 270, -108 },
  cast_focus = { "TOPLEFT", "TOPLEFT", 520, -76 }, uf_focus = { "TOPLEFT", "TOPLEFT", 520, -94 },
  raid = { "BOTTOMLEFT", "BOTTOMLEFT", 20, 330 }, uf_party1 = { "TOPLEFT", "TOPLEFT", 20, -310 },
  partyextras = { "TOPLEFT", "TOPLEFT", 190, -310 }, uf_boss1 = { "TOPRIGHT", "TOPRIGHT", -290, -200 },
  raidtools = { "TOP", "TOP", 100, -120 }, maintanks = { "TOP", "TOP", 100, -196 },
}
-- Screen presets, in display order, for the screen each is made for (w x h pixels): the UI
-- scale (the game's own UI scale, whose slider runs 0.65 to 1.15; it sizes the unit frames,
-- whose layouts are drawn in UI units), the action button size, the raid tile size and the text size.
S.SCREENS = {
  { key = "1080", text = "1080p", w = 1920, h = 1080, ui = 0.8, button = 38, tile = { 100, 48 }, textScale = 1 },
  { key = "1440", text = "1440p", w = 2560, h = 1440, ui = 0.7, button = 38, tile = { 110, 48 }, textScale = 1.05 },
  { key = "4k", text = "4K", w = 3840, h = 2160, ui = 0.65, button = 38, tile = { 110, 48 }, textScale = 1.1 },
  { key = "ultrawide", text = "Ultrawide", w = 3440, h = 1440, ui = 0.7, button = 38, tile = { 110, 48 }, textScale = 1.05 },
}
-- The client's UI scale range (its Graphics settings slider).
S.UI_SCALE = { min = 0.65, max = 1.15 }

-- Raid frame styles: the Raid page's Style choices, and the short name under each style's tile in setup.
S.STYLES = { { "soft", "Class colors, softened", "Softened" }, { "dark", "Dark, class-colored names", "Dark" },
  { "class", "Class colors, bright", "Bright" } }
-- The style tiles on the Look step: a raid tile's default size, side by side this far apart.
local TILE_W, TILE_H, TILE_GAP = 100, 48, 16

local frame
local state = { step = 1, layout = S.LAYOUTS[1].key, screen = "keep", paused = false, reload = false }
local waiting = false

-- Presets -------------------------------------------------------------------------------

-- Turns a module on for this profile; one that was off needs a reload.
local function turnOn(name)
  if ns.ModuleEnabled(name) then return end
  ns.SetModuleEnabled(name, true)
  state.reload = true
end

-- Saves a frame's spot, moving it now (or after combat) when it is built; the
-- raid grid is pinned to its new spot's side.
local function place(key, p)
  ns.Settings("positions")[key] = { point = p[1], relPoint = p[2], x = p[3], y = p[4] }
  if not ns.MoverPoint(key) then return end
  ns.SetMoverPoint(key, p[1], p[2], p[3], p[4])
  if key == "raid" then ns.GetModule("RaidFrames").Fit() end
end

-- Puts everything a preset moves back at ForeverUI's defaults, so picking
-- Damage and tanking undoes Healing and Like the game's.
local function restoreDefaults()
  for key in pairs(S.CLASSIC) do
    ns.Settings("positions")[key] = nil
    ns.ResetMovers(key)
  end
  if ns.MoverPoint("raid") then ns.GetModule("RaidFrames").Fit() end
end

-- Healing's raid frame spot: centered, four units above the focus cast
-- bar's default spot (the top of the cluster around your character), so the
-- grid grows upward from there and never covers your frames.
function S.HealingPoint()
  local cast = ns.GetModule("CastBars").LAYOUT.focus
  return { "BOTTOM", "BOTTOM", 0, cast.point[4] + cast.h + 4 }
end

-- What each layout changes.
local APPLY = {
  -- Damage and tanking: ForeverUI's defaults.
  damage = restoreDefaults,
  -- Healing: party and raid centered above your frames, click casting on.
  healing = function()
    restoreDefaults()
    place("raid", S.HealingPoint())
    turnOn("RaidFrames")
    turnOn("ClickCast")
  end,
  -- Like the game's: every spot in S.CLASSIC.
  classic = function()
    restoreDefaults()
    for key, p in pairs(S.CLASSIC) do place(key, p) end
  end,
}

-- Applies a layout preset by key.
function S.ApplyLayout(key)
  APPLY[key]()
end

-- The raid frames' settings in the active profile, with their defaults.
local function raidSettings()
  return ns.Settings("RaidFrames", ns.GetModule("RaidFrames").defaults)
end

-- Sets the raid frame style, repainting the raid frames when they are built.
function S.SetStyle(look)
  raidSettings().look = look
  local RF = ns.GetModule("RaidFrames")
  if RF.settings then RF.UpdateAll() end
end

-- Screen ----------------------------------------------------------------------------------

-- The screen's size in pixels, or 0, 0 when the client can't say.
local function screenSize()
  local get = _G.GetPhysicalScreenSize
  if type(get) ~= "function" then return 0, 0 end
  local w, h = get()
  return tonumber(w) or 0, tonumber(h) or 0
end

-- The preset for this screen: ultrawide for anything wider than 2.2 : 1, else by height
-- (4K from 2000 pixels, 1440p from 1300, 1080p from 1000); "keep" below that.
function S.DetectScreen()
  local w, h = screenSize()
  if h < 1000 then return "keep" end
  if w / h >= 2.2 then return "ultrawide" end
  if h >= 2000 then return "4k" end
  return h >= 1300 and "1440" or "1080"
end

-- A screen preset by key, or nil ("keep").
function S.ScreenPreset(key)
  for _, p in ipairs(S.SCREENS) do
    if p.key == key then return p end
  end
end

-- Sets the game's UI scale (clamped to its own slider's range), out of combat: the client's
-- uiScale and useUiScale settings, as its Graphics options set them. ForeverUI's
-- pixel-perfect scale is switched off, since it would replace this one.
function ns.SetUIScale(scale)
  local set = (C_CVar and C_CVar.SetCVar) or _G.SetCVar
  if type(set) ~= "function" or type(scale) ~= "number" then return end
  scale = math.max(S.UI_SCALE.min, math.min(S.UI_SCALE.max, scale))
  T.Settings().pixelScale = false
  ns.OutOfCombat(function()
    set("useUiScale", "1")
    set("uiScale", tostring(scale))
  end)
end

-- Sets the action buttons' shared size and lays the built bars out again (a bar's own size still wins).
local function setButtons(size)
  local AB = ns.GetModule("ActionBars")
  ns.Settings("ActionBars", AB.defaults).size = size
  for n in pairs(AB.enabled and AB.bars or {}) do AB.SettingChanged(n, "size") end
end

-- Sets the raid tile size; a new size takes effect on reload.
local function setTiles(tile)
  local s = ns.Settings("RaidFrames", ns.GetModule("RaidFrames").defaults)
  if s.width == tile[1] and s.height == tile[2] then return end
  s.width, s.height = tile[1], tile[2]
  state.retile = true
end

-- Applies a screen preset by key: UI scale, action button size, raid tile size and
-- text size. "keep" changes nothing.
function S.ApplyScreen(key)
  local p = S.ScreenPreset(key)
  if not p then return end
  ns.SetUIScale(p.ui)
  setButtons(p.button)
  setTiles(p.tile)
  T.Settings().textScale = p.textScale
  T.Refresh()
end

-- A share as a whole percent.
local function percent(v)
  return math.floor(v * 100 + 0.5)
end

-- What a preset sets, in a line under the choices.
local function screenHint(p)
  if not p then return "Changes nothing: your UI scale and frame, button, tile and text sizes stay as they are." end
  return string.format("UI scale %d%%, action buttons %d px, raid tiles %d x %d, text %d%%.",
    percent(p.ui), p.button, p.tile[1], p.tile[2], percent(p.textScale))
end

-- Marks -----------------------------------------------------------------------------------

-- Outlines a choice (and colors its label) in the accent when it is the chosen one.
local function mark(b, on)
  T.SetBorder(b, on and { T.Accent() } or nil)
  if b.text then T.Color(b.text, on and "accent" or "text") end
  if b.check then b.check:SetShown(on) end
end

-- True when the accent is this preset color.
local function isAccent(rgb)
  local r, g, b = T.Accent()
  return r == rgb[1] and g == rgb[2] and b == rgb[3]
end

-- Marks the chosen button on a page of choices and shows its hint.
local function markChoice(page, value)
  for _, b in ipairs(page.choices) do
    mark(b, b.value == value)
    if b.value == value then page.hint:SetText(b.hint) end
  end
end

-- Draws a style tile as the raid frames draw that style, in your class color: a softened or
-- bright bar with a light name, or a dark bar with the name in the class color.
local function paintTile(b)
  local r, g, bl = ns.GetModule("UnitFrames").HealthColor("player")
  b.name:SetText(UnitName("player"))
  if b.value == "dark" then
    T.BarColor(b.bar, "darkBar")
    return b.name:SetTextColor(r, g, bl)
  end
  if b.value == "soft" then r, g, bl = ns.GetModule("RaidFrames").Soften(r, g, bl) end
  b.bar:SetStatusBarColor(r, g, bl)
  T.Color(b.name, "text")
end

-- Re-marks the chosen layout and screen (and shows their hints), accent and style (its tiles redrawn).
local function refresh()
  local look = frame.pages[3]
  markChoice(frame.pages[1], state.layout)
  markChoice(frame.pages[2], state.screen)
  for _, s in ipairs(look.swatches) do mark(s, isAccent(s.rgb)) end
  for _, b in ipairs(look.styles) do mark(b, b.value == raidSettings().look) paintTile(b) end
  T.Color(frame.caption, "accent")
end

-- Building ------------------------------------------------------------------------------

-- A left-aligned line of text on the wizard.
local function text(parent, role, color, value)
  local fs = T.Text(parent:CreateFontString(nil, "OVERLAY"), role, color)
  fs:SetJustifyH("LEFT")
  fs:SetText(value)
  return fs
end

-- A full-width choice button at row i below y; value is what it picks.
local function choice(page, label, value, y, onClick)
  local b = W.Button(page, label, onClick, WIDTH - 2 * PAD)
  b:SetPoint("TOPLEFT", 0, y)
  b.value = value
  return b
end

-- A page of choices under a question: a button per { key, text, hint }; picking one
-- sets state[field]. The chosen one's hint shows under them.
local function choicePage(page, question, list, field)
  text(page, "label", "text2", question):SetPoint("TOPLEFT")
  page.choices = {}
  for i, l in ipairs(list) do
    page.choices[i] = choice(page, l.text, l.key, -24 - (i - 1) * 30, function() state[field] = l.key; refresh() end)
    page.choices[i].hint = l.hint or ""
  end
  page.hint = text(page, "small", "text2", "")
  page.hint:SetPoint("TOPLEFT", 0, -24 - #list * 30)
end

-- Step 1: a button per layout, then the chosen one's hint.
local function layoutPage(page)
  choicePage(page, "How do you mostly play? You can change it all later in /fui.", S.LAYOUTS, "layout")
end

-- The screen choices: each preset (the one for this screen marked), then Keep.
local function screenChoices()
  local detected, out = S.DetectScreen(), {}
  for i, p in ipairs(S.SCREENS) do
    local mine = p.key == detected and "  ·  your screen" or ""
    out[i] = { key = p.key, hint = screenHint(p), text = string.format("%s (%d x %d)%s", p.text, p.w, p.h, mine) }
  end
  out[#out + 1] = { key = "keep", text = "Keep my current sizes", hint = screenHint(nil) }
  return out
end

-- Step 2: a button per screen preset and Keep, then the chosen one's hint.
local function screenPage(page)
  choicePage(page, "Sizes for your screen. You can change them later in /fui.", screenChoices(), "screen")
end

-- A style tile's health bar, three quarters full, one pixel inside the border, with your name over it.
local function tileBar(b)
  local px = T.Pixel(b)
  b.bar = T.StyleBar(CreateFrame("StatusBar", nil, b))
  b.bar:SetPoint("TOPLEFT", px, -px)
  b.bar:SetPoint("BOTTOMRIGHT", -px, px)
  b.bar:SetMinMaxValues(0, 1)
  b.bar:SetValue(0.75)
  b.name = T.Text(b.bar:CreateFontString(nil, "OVERLAY"), "barName")
  b.name:SetPoint("TOP", 0, -6)
end

-- One raid frame style as a small raid tile drawn in it, with its short name under it;
-- picking it sets the style at once.
local function styleTile(page, i, s)
  local b = T.Panel(CreateFrame("Button", nil, page))
  b:SetSize(TILE_W, TILE_H)
  b:SetPoint("TOPLEFT", (i - 1) * (TILE_W + TILE_GAP), -82)
  b.value = s[1]
  tileBar(b)
  b.text = text(page, "small", "text", s[3])
  b.text:SetPoint("TOP", b, "BOTTOM", 0, -4)
  b:SetScript("OnClick", function() S.SetStyle(s[1]); refresh() end)
  return b
end

-- The raid frame styles under the accent swatches: a tile drawn in each, side by side.
local function stylePicker(page)
  text(page, "label", "text", "Raid frame style"):SetPoint("TOPLEFT", 0, -62)
  page.styles = {}
  for i, s in ipairs(S.STYLES) do page.styles[i] = styleTile(page, i, s) end
end

-- One accent swatch, with a check when chosen: picking it sets the accent at once.
local function swatch(page, i, rgb)
  local s = W.Swatch(page, rgb, function() T.SetAccent(rgb[1], rgb[2], rgb[3]); refresh() end)
  s:SetPoint("TOPLEFT", (i - 1) * 34, -20)
  s.rgb = rgb
  s.check = W.IconTexture(s, "Check", 14, "void")
  s.check:SetPoint("CENTER")
  return s
end

-- Step 3: the accent presets, then the raid frame style.
local function lookPage(page)
  text(page, "label", "text", "Accent"):SetPoint("TOPLEFT")
  page.swatches = {}
  for i, name in ipairs(T.PRESET_ORDER) do
    page.swatches[i] = swatch(page, i, T.PRESETS[name])
  end
  stylePicker(page)
end

-- Step 4: how to move frames (they are unlocked while this step shows).
local function movePage(page)
  local lines = { "Your frames are unlocked: drag a handle to move that frame.",
    "Click a handle, then the arrow keys nudge it (Shift: 10 px).", "Done locks them. /fui unlock moves them any time." }
  for i, line in ipairs(lines) do
    text(page, "label", i == 1 and "text" or "text2", line):SetPoint("TOPLEFT", 0, -(i - 1) * 22)
  end
end

-- The title, the step caption under it, and your faction's crest left of the close button.
local function addTitle(f)
  f.title = text(f, "title", "text", "Set up ForeverUI")
  f.title:SetPoint("TOPLEFT", PAD, -14)
  f.caption = text(f, "small", "accent", "")
  f.caption:SetPoint("TOPLEFT", f.title, "BOTTOMLEFT", 0, -4)
  f.crest = T.Crest(f, 28)
  f.crest:SetPoint("TOPRIGHT", -PAD - 32, -12)
end

-- The window: a floating panel with a title and the step caption.
local function window()
  local f = T.Panel(CreateFrame("Frame", "ForeverUI_Setup", UIParent), { alpha = 0.98, shadow = true })
  f:SetSize(WIDTH, HEIGHT)
  f:SetPoint("CENTER")
  f:SetFrameStrata("DIALOG")
  f:EnableMouse(true)
  addTitle(f)
  return f
end

-- The close button (top right) and the footer: Back, then Next or Done.
local function controls(f)
  f.close = T.CloseButton(CreateFrame("Button", nil, f))
  f.close:SetSize(22, 22)
  f.close:SetPoint("TOPRIGHT", -8, -8)
  f.close:SetScript("OnClick", function() f:Hide() end)
  f.next = W.Primary(f, "Next", function() S.Next() end)
  f.next:SetPoint("BOTTOMRIGHT", -PAD, PAD)
  f.back = W.Button(f, "Back", function() S.Back() end, 100)
  f.back:SetPoint("RIGHT", f.next, "LEFT", -8, 0)
end

-- Why setup offers a reload (a module turned on, new raid tile sizes), or nil.
local function reloadReason()
  if state.reload then return "Setup turned on a module that was off." end
  if state.retile then return "The new raid tile size shows after a reload." end
end

-- Setup ended (Done, the close button or Escape): lock the frames, remember that setup
-- ran, and offer a reload when a module was turned on or the raid tiles changed size.
local function finished()
  if state.paused then return end
  if ns.Unlocked() then ns.Lock() end
  ForeverUIDB.setupDone = true
  local why = reloadReason()
  if why then ns.OfferReload(why) end
  state.reload, state.retile = false, false
end

local BUILDERS = { layoutPage, screenPage, lookPage, movePage }

-- A page per step, between the caption and the footer.
local function addPages(f)
  f.pages = {}
  for i, builder in ipairs(BUILDERS) do
    f.pages[i] = CreateFrame("Frame", nil, f)
    f.pages[i]:SetPoint("TOPLEFT", PAD, -62)
    f.pages[i]:SetPoint("BOTTOMRIGHT", -PAD, 48)
    builder(f.pages[i])
  end
end

-- Builds the wizard once: the window, its controls and pages; Escape closes it.
local function build()
  local f = window()
  controls(f)
  addPages(f)
  f:SetScript("OnHide", finished)
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, "ForeverUI_Setup") end
  return f
end

-- Steps -----------------------------------------------------------------------------------

-- Shows step n: its page, caption and buttons. The last step unlocks the frames.
local function showStep(n)
  state.step = n
  for i, page in ipairs(frame.pages) do page:SetShown(i == n) end
  frame.caption:SetText(string.format("Step %d of %d · %s", n, #STEPS, STEPS[n]))
  frame.back:SetShown(n > 1)
  frame.next.text:SetText(n == #STEPS and "Done" or "Next")
  if n == #STEPS then ns.Unlock() elseif ns.Unlocked() then ns.Lock() end
  refresh()
end

-- Next: leaving step 1 applies the layout, leaving step 2 the screen preset; on the last step it is Done.
function S.Next()
  if state.step == 1 then S.ApplyLayout(state.layout) end
  if state.step == 2 then S.ApplyScreen(state.screen) end
  if state.step == #STEPS then return frame:Hide() end
  showStep(state.step + 1)
end

-- Back one step.
function S.Back()
  showStep(math.max(state.step - 1, 1))
end

-- The step showing (1 to 4), or nil while setup is closed.
function S.Step()
  return frame and frame:IsShown() and state.step or nil
end

-- Opens setup once combat ends, however often it was asked for meanwhile.
function S.Defer()
  if waiting then return end
  waiting = true
  ns.Chat("Setup opens when combat ends.")
  ns.OutOfCombat(function() waiting = false; S.Open() end)
end

-- Opens setup at step 1 with the default layout and this screen's preset; in combat it waits.
function S.Open()
  if ns.InCombat() then return S.Defer() end
  frame = frame or build()
  state.layout, state.screen, state.reload, state.paused = S.LAYOUTS[1].key, S.DetectScreen(), false, false
  T.FadeIn(frame)
  showStep(1)
end

-- Combat ----------------------------------------------------------------------------------

-- A fight started with setup open: step aside until it ends.
local function pause()
  if not S.Step() then return end
  state.paused = true
  frame:Hide()
end

-- The fight ended: bring setup back on the step it was on.
local function resume()
  if not state.paused then return end
  state.paused = false
  T.FadeIn(frame)
  showStep(state.step)
end

ns.On("PLAYER_REGEN_DISABLED", pause)
ns.On("PLAYER_REGEN_ENABLED", resume)

-- The first login on this account opens setup (after the modules have built).
ns.On("PLAYER_LOGIN", function()
  if not ForeverUIDB.setupDone then S.Open() end
end)
