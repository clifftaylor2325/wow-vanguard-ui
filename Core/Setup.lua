-- First-run setup: a four-step wizard (layout, screen, look, move things). It
-- opens on the account's first login until Done or Skip setup (VanguardDB.setupDone),
-- and on a new character's first login after that, with a profile step first
-- (VanguardCharDB.setupDone false, pickProfile). Closing it early asks again at the
-- next login. Never in combat (it waits for combat to end, and steps aside if a fight
-- starts while it is open). /vg setup and the options open it again, with Keep
-- picked, so Next, Next, Next, Done changes nothing you didn't pick.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local S = {}
ns.Setup = S

local WIDTH, HEIGHT, PAD = 440, 320, 16
-- The pages in order, each with its caption name; a wizard shows STEPS, or PROFILE_STEPS for a new character.
local NAMES = { profile = "Profile", layout = "Layout", screen = "Screen", look = "Look", move = "Move things" }
local STEPS = { "layout", "screen", "look", "move" }
local PROFILE_STEPS = { "profile", "layout", "screen", "look", "move" }
-- In chat when setup ends: after Done or Skip, and after closing it while it is still owed.
local AGAIN = "Run setup again any time: /vg setup, or Run setup on the General page of /vg."
local LATER = "Setup opens again at your next login. /vg setup opens it now; Skip setup on its first page turns it off."

-- Layout presets, in display order: damage is the default, Keep (the last) moves nothing.
S.LAYOUTS = {
  { key = "damage", text = "Centered: damage and tanking", hint = "Your frames around your character; party and raid just above your player frame." },
  { key = "healing", text = "Centered: healing", hint = "Party and raid centered above your frames, click casting on." },
  { key = "classic", text = "Like the game's", hint = "Your frames at the top left as the game has them, party and raid down the left side." },
  { key = "keep", text = "Keep my current layout", hint = "Moves nothing: your frames stay where they are." },
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
-- order: the pages showing; floor: the first step Back reaches; owed: setup opened owing a run;
-- complete: Done or Skip was clicked (closing otherwise doesn't count as setup having run).
local state = { step = 1, order = STEPS, floor = 1, profile = "share", layout = S.LAYOUTS[1].key, screen = "keep",
  owed = false, complete = false, paused = false, reload = false }
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

-- Puts everything a preset moves back at Vanguard's defaults, so picking
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
  -- Damage and tanking: Vanguard's defaults.
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
  -- Keep: moves nothing.
  keep = function() end,
}

-- Applies a layout preset by key.
function S.ApplyLayout(key)
  APPLY[key]()
end

-- Your role: the specialization's where the client has them, else your group role; nil when neither says.
local function playerRole()
  local spec, get = ns.SpecIndex(), _G.GetSpecializationRole
  local role = spec and type(get) == "function" and get(spec) or nil
  if not role and type(UnitGroupRolesAssigned) == "function" then role = UnitGroupRolesAssigned("player") end
  return ns.GetModule("Upgrades").ROLES[role or "NONE"]
end

-- The layout for your role: Centered: healing for a healer, else Centered: damage and tanking.
function S.GuessLayout()
  return playerRole() == "healer" and "healing" or "damage"
end

-- Applies the profile step: "new" gives this character a profile of its own, picks your role's
-- layout on the next step and keeps Back from returning to it, so the new profile stays; "share" changes nothing.
function S.ApplyProfile(key)
  if key ~= "new" then return end
  ns.ForkProfile(UnitName("player"))
  state.layout, state.floor = S.GuessLayout(), state.step + 1
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
-- uiScale and useUiScale settings, as its Graphics options set them. Vanguard's
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

-- Re-marks the chosen profile, layout and screen (and shows their hints), accent and style (its tiles redrawn).
local function refresh()
  local look = frame.pages.look
  markChoice(frame.pages.profile, state.profile)
  markChoice(frame.pages.layout, state.layout)
  markChoice(frame.pages.screen, state.screen)
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

-- The profile choices for a new character: share the profile it loaded with, or one of its own.
local function profileChoices()
  local shared = ns.ProfileName()
  return { { key = "share", text = "Share profile " .. shared .. " with your other characters", hint = "Changes here change them too." },
    { key = "new", text = "A profile of its own: " .. ns.ForkName(UnitName("player")),
      hint = "Starts as a copy of " .. shared .. "; changes here stay on this character." } }
end

-- A new character's first step: which profile it uses.
local function profilePage(page)
  choicePage(page, "Vanguard is set up on this account. Profiles in /vg switches this later.", profileChoices(), "profile")
end

-- The layout step: a button per layout, then the chosen one's hint.
local function layoutPage(page)
  choicePage(page, "How do you mostly play? You can change it all later in /vg.", S.LAYOUTS, "layout")
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

-- The screen step: a button per screen preset and Keep, then the chosen one's hint.
local function screenPage(page)
  choicePage(page, "Sizes for your screen. You can change them later in /vg.", screenChoices(), "screen")
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

-- The look step: the accent presets, then the raid frame style.
local function lookPage(page)
  text(page, "label", "text", "Accent"):SetPoint("TOPLEFT")
  page.swatches = {}
  for i, name in ipairs(T.PRESET_ORDER) do
    page.swatches[i] = swatch(page, i, T.PRESETS[name])
  end
  stylePicker(page)
end

-- The last step: how to move frames (they are unlocked while this step shows).
local function movePage(page)
  local lines = { "Your frames are unlocked: drag a handle to move that frame.",
    "Click a handle, then the arrow keys nudge it (Shift: 10 px).", "Done locks them. /vg unlock moves them any time." }
  for i, line in ipairs(lines) do
    text(page, "label", i == 1 and "text" or "text2", line):SetPoint("TOPLEFT", 0, -(i - 1) * 22)
  end
end

-- The title, the step caption under it, and your faction's crest left of the close button.
local function addTitle(f)
  f.title = text(f, "title", "text", "Set up Vanguard")
  f.title:SetPoint("TOPLEFT", PAD, -14)
  f.caption = text(f, "small", "accent", "")
  f.caption:SetPoint("TOPLEFT", f.title, "BOTTOMLEFT", 0, -4)
  f.crest = T.Crest(f, 28)
  f.crest:SetPoint("TOPRIGHT", -PAD - 32, -12)
end

-- The window: a floating panel with a title and the step caption.
local function window()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_Setup", UIParent), { alpha = 0.98, shadow = true })
  f:SetSize(WIDTH, HEIGHT)
  f:SetPoint("CENTER")
  f:SetFrameStrata("DIALOG")
  f:EnableMouse(true)
  addTitle(f)
  return f
end

-- Done or Skip setup: setup ran, so closing it now counts.
local function complete()
  state.complete = true
  frame:Hide()
end

-- The close button (top right) and the footer: Skip setup (first step only), then Back, then Next or Done.
local function controls(f)
  f.close = T.CloseButton(CreateFrame("Button", nil, f))
  f.close:SetSize(22, 22)
  f.close:SetPoint("TOPRIGHT", -8, -8)
  f.close:SetScript("OnClick", function() f:Hide() end)
  f.next = W.Primary(f, "Next", function() S.Next() end)
  f.next:SetPoint("BOTTOMRIGHT", -PAD, PAD)
  f.back = W.Button(f, "Back", function() S.Back() end, 100)
  f.back:SetPoint("RIGHT", f.next, "LEFT", -8, 0)
  f.skip = W.Button(f, "Skip setup", complete, 110)
  f.skip:SetPoint("BOTTOMLEFT", PAD, PAD)
end

-- Why setup offers a reload (a module turned on, new raid tile sizes), or nil.
local function reloadReason()
  if state.reload then return "Setup turned on a module that was off." end
  if state.retile then return "The new raid tile size shows after a reload." end
end

-- Remembers that setup ran, on the account and for this character, and says how to run it again.
local function markDone()
  VanguardDB.setupDone, VanguardCharDB.setupDone, VanguardCharDB.pickProfile = true, true, nil
  ns.Chat(AGAIN)
end

-- Setup ended (Done, Skip setup, the close button or Escape): lock the frames; after Done or Skip
-- remember that setup ran, else (when it was owed) say it opens again; offer a reload when a
-- module was turned on or the raid tiles changed size.
local function finished()
  if state.paused then return end
  if ns.Unlocked() then ns.Lock() end
  if state.complete then markDone() elseif state.owed then ns.Chat(LATER) end
  local why = reloadReason()
  if why then ns.OfferReload(why) end
  state.reload, state.retile = false, false
end

local BUILDERS = { profile = profilePage, layout = layoutPage, screen = screenPage, look = lookPage, move = movePage }

-- A page per step, between the caption and the footer, by key.
local function addPages(f)
  f.pages = {}
  for key, builder in pairs(BUILDERS) do
    f.pages[key] = CreateFrame("Frame", nil, f)
    f.pages[key]:SetPoint("TOPLEFT", PAD, -62)
    f.pages[key]:SetPoint("BOTTOMRIGHT", -PAD, 48)
    builder(f.pages[key])
  end
end

-- Builds the wizard once: the window, its controls and pages; Escape closes it.
local function build()
  local f = window()
  controls(f)
  addPages(f)
  f:SetScript("OnHide", finished)
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, "Vanguard_Setup") end
  return f
end

-- Steps -----------------------------------------------------------------------------------

-- Shows step n: its page, caption and buttons. The last step (move things) unlocks the frames.
local function showStep(n)
  local key, last = state.order[n], #state.order
  state.step = n
  for k, page in pairs(frame.pages) do page:SetShown(k == key) end
  frame.caption:SetText(string.format("Step %d of %d · %s", n, last, NAMES[key]))
  frame.back:SetShown(n > state.floor)
  frame.skip:SetShown(n == 1)
  frame.next.text:SetText(n == last and "Done" or "Next")
  if n == last then ns.Unlock() elseif ns.Unlocked() then ns.Lock() end
  refresh()
end

-- What leaving a page applies (pages not listed apply as you click).
local LEAVE = {
  -- The profile choice, the layout, the screen preset.
  profile = function() S.ApplyProfile(state.profile) end,
  layout = function() S.ApplyLayout(state.layout) end,
  screen = function() S.ApplyScreen(state.screen) end,
}

-- Next: applies what the page leaves behind (LEAVE); on the last step it is Done.
function S.Next()
  local leave = LEAVE[state.order[state.step]]
  if leave then leave() end
  if state.step == #state.order then return complete() end
  showStep(state.step + 1)
end

-- Back one step (never before a profile this setup made).
function S.Back()
  showStep(math.max(state.step - 1, state.floor))
end

-- The step showing (1 to 4, or 5 with the profile step), or nil while setup is closed.
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

-- True when setup still owes a run: the account never finished it, or this character is new
-- (or started over) since.
local function owed()
  return not VanguardDB.setupDone or VanguardCharDB.setupDone == false
end

-- Opens setup at step 1 (the profile step for a new character); in combat it waits. When setup is
-- owed on this profile, your role's layout and this screen's preset are picked; otherwise (running it
-- again, or sharing a profile that ran it) Keep and Keep, so clicking through changes nothing.
function S.Open()
  if ns.InCombat() then return S.Defer() end
  frame = frame or build()
  local owe, pick = owed(), VanguardCharDB.pickProfile == true
  local guess = owe and not pick
  state.order, state.floor, state.owed, state.complete, state.profile = pick and PROFILE_STEPS or STEPS, 1, owe, false, "share"
  state.layout, state.screen = guess and S.GuessLayout() or "keep", guess and S.DetectScreen() or "keep"
  state.reload, state.paused = false, false
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

-- A new character on an account that has run setup owes it, starting with which profile to use
-- (after Core/DB.lua's handler has read the saved tables).
ns.On("ADDON_LOADED", function(_, name)
  if name ~= ADDON or not ns.NewCharacter() or not VanguardDB.setupDone then return end
  VanguardCharDB.setupDone, VanguardCharDB.pickProfile = false, true
end)

-- A login while setup is owed (the account's first, a new character's, or after closing it early
-- or starting over) opens it, after the modules have built.
ns.On("PLAYER_LOGIN", function()
  if owed() then S.Open() end
end)
