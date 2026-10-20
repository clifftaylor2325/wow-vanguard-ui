-- First-run setup: a four-step wizard (layout, screen, look, move things). It
-- opens on the account's first login until Done or Skip setup (VanguardDB.setupDone),
-- and on a new character's first login after that, with a profile step first
-- (VanguardCharDB.setupDone false, pickProfile). Closing it early asks again at the
-- next login. Never in combat (it waits for combat to end, and steps aside if a fight
-- starts while it is open). It always opens with Keep picked (your role's layout and
-- your screen's preset are marked), so Next, Next, Next, Done changes nothing you didn't
-- pick. Before it changes anything it copies the profile to its backup profile, and Done
-- ends with a reload.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local S = {}
ns.Setup = S

-- The window's size and its inner margin (a dialog's: T.SPACE.pad).
local WIDTH, HEIGHT, PAD = 440, 362, T.SPACE.pad
-- Where the pages start: the title line (T.CONTROL.inset), the title and the step caption under it (about 36
-- units), and a column gap. And where they stop: the footer's pad, button and the gap over it.
local TOP = T.CONTROL.inset + 36 + T.SPACE.col
local FOOT = T.SPACE.pad + T.BUTTON_H + T.SPACE.gap
-- The pages in order, each with its caption name; a wizard shows STEPS, or PROFILE_STEPS for a new character.
local NAMES = { profile = "Profile", layout = "Layout", screen = "Screen", look = "Look", move = "Move things" }
local STEPS = { "layout", "screen", "look", "move" }
local PROFILE_STEPS = { "profile", "layout", "screen", "look", "move" }
-- In chat when setup ends: after Done or Skip, and after closing it while it is still owed.
local AGAIN = "Run setup again any time: /vg setup, or Run setup on the General page of /vg."
local LATER = "Setup opens again at your next login. /vg setup opens it now; Skip setup on its first page turns it off."

-- Layout presets, in display order; Keep (the last) moves nothing and is picked when setup opens.
S.LAYOUTS = {
  { key = "damage", text = "Centered: damage", hint = "For damage dealers: your frames around your character, a taller target frame, compact raid frames without power bars or heal overlays, threat colours and longer debuff rows on nameplates." },
  { key = "tank", text = "Centered: tanking", hint = "For tanks: the tallest target frame, raid frames sorted by role with the aggro strip, threat colours, the target border and buff rows on nameplates." },
  { key = "healing", text = "Centered: healing", hint = "Party and raid above your frames, drawn larger (a big raid stacked at the left of your character), your own and your target's frames a little smaller, raid frames sorted by role with power bars, raid debuffs, HoTs and incoming heals, short debuff rows on nameplates, click casting on." },
  { key = "versus", text = "Versus deck", hint = "Centered for your role, with your frame and your target's joined by one shield panel under your character, the crest between them and your cast bar in the middle." },
  { key = "classic", text = "Like the game's", hint = "Your frames at the top left as the game has them, party and raid down the left side." },
  { key = "keep", text = "Keep my current layout", hint = "Moves nothing: your frames stay where they are." },
}
-- Like the game's: player and target along the top left (the pet under the
-- player, the target of target beside the target, the focus under that), the
-- party and raid down the left side (the raid grows up from above the bars'
-- height, so a full raid stays clear of the middle), the boss frames on the
-- right under your buffs, the raid leader's tools and main tanks near the
-- top center, clear of all of it, and the roll tracker right of center below
-- the raid tools, where its 14 lines grow down into empty space.
S.CLASSIC = {
  uf_player = { "TOPLEFT", "TOPLEFT", 20, -40 }, uf_pet = { "TOPLEFT", "TOPLEFT", 20, -84 },
  uf_target = { "TOPLEFT", "TOPLEFT", 270, -40 }, uf_targettarget = { "TOPLEFT", "TOPLEFT", 520, -46 },
  cast_target = { "TOPLEFT", "TOPLEFT", 270, -108 }, cast_pet = { "TOPLEFT", "TOPLEFT", 20, -112 },
  cast_focus = { "TOPLEFT", "TOPLEFT", 520, -76 }, uf_focus = { "TOPLEFT", "TOPLEFT", 520, -94 },
  raid = { "BOTTOMLEFT", "BOTTOMLEFT", 20, 330 }, uf_party1 = { "TOPLEFT", "TOPLEFT", 20, -310 },
  partyextras = { "TOPLEFT", "TOPLEFT", 190, -310 }, uf_boss1 = { "TOPRIGHT", "TOPRIGHT", -290, -200 },
  raidtools = { "TOP", "TOP", 200, -120 }, maintanks = { "TOP", "TOP", 100, -196 },
  rolls = { "TOP", "TOP", 280, -300 },
}
-- What each centered layout sizes on top of Vanguard's defaults: a mover's scale (it keeps its default
-- spot, so a big raid still moves to the left), and how tall the target frame stands (UnitFrames'
-- targetHeight; it grows up from its bottom edge, so nothing beside it moves). Damage raises the target
-- frame, Tanking raises it more, Healing draws the raid frames larger and your own and your target's
-- frames smaller.
S.ROLE_SPOTS = {
  damage = {},
  tank = {},
  healing = { uf_player = { scale = 0.9 }, uf_target = { scale = 0.9 }, raid = { scale = 1.15 } },
}
S.TARGET_HEIGHT = { damage = 40, tank = 44, healing = 36 }
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
-- The Pixel-perfect choice beside the presets: one UI unit is a whole number of screen pixels, so
-- every line and glyph lands on real pixels; Vanguard's own sizes make up for the smaller scale.
S.PIXEL = { key = "pixel", text = "Pixel-perfect (sharpest)" }

-- Raid frame styles: the Raid page's Style choices, and the short name under each style's tile in setup.
S.STYLES = { { "soft", "Class colors, softened", "Softened" }, { "dark", "Dark, class-colored names", "Dark" },
  { "class", "Class colors, bright", "Bright" } }
-- The style tiles on the Look step: a raid tile's default size, side by side this far apart.
local TILE_W, TILE_H, TILE_GAP = 100, 48, 16

local frame
-- Functions run each time setup ends, after it has locked the frames and saved (What's new waits for it).
S.onEnd = {}
-- order: the pages showing; floor: the first step Back reaches; owed: setup opened owing a run;
-- complete: Done or Skip was clicked (closing otherwise doesn't count as setup having run).
local state = { step = 1, order = STEPS, floor = 1, profile = "share", layout = S.LAYOUTS[1].key, screen = "keep",
  owed = false, complete = false, paused = false, reload = false, role = false, backup = nil }
local waiting = false

-- Presets -------------------------------------------------------------------------------

-- Turns a module on for this profile; one that was off needs a reload.
local function turnOn(name)
  if ns.ModuleEnabled(name) then return end
  ns.SetModuleEnabled(name, true)
  state.reload = true
end

-- Before setup's first change in a run: copies the profile in use to its backup profile (once
-- per run) and says so in chat.
function S.Backup()
  if state.backup then return end
  state.backup = ns.BackupProfile()
  ns.Chat(string.format("Profile %s as it was before setup is saved as profile %s.", ns.ProfileName(), state.backup))
end

-- Saves a frame's spot, moving it now (or after combat) when it is built; the
-- raid grid is pinned to its new spot's side.
local function place(key, p)
  ns.Settings("positions")[key] = { point = p[1], relPoint = p[2], x = p[3], y = p[4], scale = p.scale }
  if not ns.MoverPoint(key) then return end
  if p[1] then ns.SetMoverPoint(key, p[1], p[2], p[3], p[4]) end
  if p.scale then ns.SetMoverScale(key, p.scale) end
  if key == "raid" then ns.GetModule("RaidFrames").Fit() end
end

-- Every mover a preset moves or sizes: Like the game's spots and the role layouts' ones.
local function presetKeys()
  local keys = {}
  for key in pairs(S.CLASSIC) do keys[key] = true end
  for _, spots in pairs(S.ROLE_SPOTS) do
    for key in pairs(spots) do keys[key] = true end
  end
  return keys
end

-- Puts everything a preset moves or sizes back at Vanguard's defaults, so picking one
-- layout undoes the others, Versus deck and Like the game's (the deck goes off too).
local function restoreDefaults()
  for key in pairs(presetKeys()) do
    ns.Settings("positions")[key] = nil
    ns.ResetMovers(key)
  end
  if ns.MoverPoint("raid") then ns.GetModule("RaidFrames").Fit() end
  S.SetTargetHeight(nil)
  S.SetDeck(false)
end

-- The role preset each layout applies (Core/PresetStrings.lua).
local ROLE = { damage = "Damage", tank = "Tank", healing = "Healer" }

-- One module's saved settings, whether or not it is on.
local function moduleSettings(name)
  local m = ns.GetModule(name)
  return ns.Settings(name, m and m.defaults or {})
end

-- Sets a role layout's spots and sizes, and its raid frame, raid aura, raid healing and nameplate settings
-- (its preset's); the frames on screen repaint now, the rest shows after the reload Done offers.
local function applyRole(key)
  for mover, p in pairs(S.ROLE_SPOTS[key]) do place(mover, p) end
  S.SetTargetHeight(S.TARGET_HEIGHT[key])
  for name, values in pairs(ns.ROLE_SETTINGS[ROLE[key]]) do
    local saved = moduleSettings(name)
    for k, v in pairs(values) do saved[k] = v end
  end
  local RF, NP = ns.GetModule("RaidFrames"), ns.GetModule("Nameplates")
  if RF and RF.settings then RF.UpdateAll() end
  if NP and NP.settings then NP.RefreshAll() end
  state.role = true
end

-- What each layout changes.
local APPLY = {
  -- Damage: Vanguard's defaults, its spots and sizes and the Damage preset's settings.
  damage = function()
    restoreDefaults()
    applyRole("damage")
  end,
  -- Tanking: Vanguard's defaults, its spots and sizes and the Tank preset's settings.
  tank = function()
    restoreDefaults()
    applyRole("tank")
  end,
  -- Healing: Vanguard's defaults (a big raid sits at the left of your character), its sizes, click
  -- casting on, the Healer preset's settings.
  healing = function()
    restoreDefaults()
    applyRole("healing")
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

-- Versus deck: your role's centered layout with the deck on: its spots are the centered ones, so
-- everything between your frames stays where it is, and your frame and your target's stay one size and height.
function APPLY.versus()
  APPLY[S.GuessLayout()]()
  for _, key in ipairs({ "uf_player", "uf_target" }) do
    local p = ns.Settings("positions")[key]
    if p then p.scale = nil end
    ns.SetMoverScale(key, 1)
  end
  S.SetTargetHeight(nil)
  S.SetDeck(true)
end

-- Applies a layout preset by key, backing the profile up first unless it is Keep.
function S.ApplyLayout(key)
  if key ~= "keep" then S.Backup() end
  APPLY[key]()
end

-- Your role: the specialization's where the client has them, else your group role (ns.PlayerRole).
local function playerRole()
  local spec, get = ns.SpecIndex(), _G.GetSpecializationRole
  local role = spec and type(get) == "function" and get(spec) or nil
  return ns.RoleKey(role) or ns.PlayerRole()
end

-- Each role's centered layout (anyone else gets Centered: damage).
S.ROLE_LAYOUT = { healer = "healing", tank = "tank" }

-- The layout for your role (marked on the layout step): Centered: healing for a healer, Centered: tanking
-- for a tank, else Centered: damage.
function S.GuessLayout()
  return S.ROLE_LAYOUT[playerRole()] or "damage"
end

-- Applies the profile step: "new" gives this character a profile of its own and keeps Back
-- from returning to it, so the new profile stays (setup opened again doesn't ask again, either);
-- "share" changes nothing.
function S.ApplyProfile(key)
  if key ~= "new" then return end
  ns.ForkProfile(UnitName("player"))
  state.floor = state.step + 1
  VanguardCharDB.pickProfile = nil
end

-- The raid frames' settings in the active profile, with their defaults.
local function raidSettings()
  return ns.Settings("RaidFrames", ns.GetModule("RaidFrames").defaults)
end

-- Sets the raid frame style, repainting the raid frames when they are built.
function S.SetStyle(look)
  S.Backup()
  raidSettings().look = look
  local RF = ns.GetModule("RaidFrames")
  if RF.settings then RF.UpdateAll() end
end

-- Whether the Calm HUD is on (Modules/UnitFrames.lua).
function S.Calm()
  return ns.Settings("UnitFrames", ns.GetModule("UnitFrames").defaults).calm == true
end

-- Turns the Calm HUD on or off, applying it at once when the unit frames are built.
function S.SetCalm(on)
  S.Backup()
  ns.Settings("UnitFrames", ns.GetModule("UnitFrames").defaults).calm = on == true
  local UF = ns.GetModule("UnitFrames")
  if UF.settings then UF.ApplyCalm() end
end

-- The Text size setup's "Larger text" switch sets: 115%, against the normal 100%.
local LARGER = 1.15

-- Whether Text size is the larger one or more.
function S.Larger()
  return (T.Settings().textScale or 1) >= LARGER
end

-- Turns larger text on (115%) or off (100%); every styled text is re-fonted at once.
function S.SetLarger(on)
  S.Backup()
  T.Settings().textScale = on and LARGER or 1
  T.Refresh()
end

-- Whether Safer colours (the colorAssist setting: hostile, neutral and friendly colors kept apart) is on.
function S.Assist()
  return T.Settings().colorAssist == true
end

-- Turns Safer colours on or off; the colors it changes settle at the reload Done offers.
function S.SetAssist(on)
  S.Backup()
  T.Settings().colorAssist = on == true
  T.Refresh()
end

-- Turns the Versus deck on or off (UnitFrames' deck setting), applying it at once when the unit frames are built.
function S.SetDeck(on)
  local UF = ns.GetModule("UnitFrames")
  ns.Settings("UnitFrames", UF.defaults).deck = on == true
  if UF.settings then UF.ApplyDeck() end
end

-- Sets how tall the target frame stands (UnitFrames' targetHeight), sizing it at once when the unit frames are built.
function S.SetTargetHeight(h)
  local UF = ns.GetModule("UnitFrames")
  ns.Settings("UnitFrames", UF.defaults).targetHeight = h
  if UF.settings then UF.ApplySizes() end
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

-- A screen preset by key (S.PIXEL's for "pixel"), or nil ("keep").
function S.ScreenPreset(key)
  if key == S.PIXEL.key then return S.PixelPreset() end
  for _, p in ipairs(S.SCREENS) do
    if p.key == key then return p end
  end
end

-- How many screen pixels one UI unit covers at pixel-perfect scale on a screen h pixels tall:
-- 1 up to about 1600 pixels tall, 2 at 4K, so things never get smaller than 1080p's.
function S.PixelMultiple(h)
  return T.AutoPixelMultiple(h)
end

-- A size grown by ratio, in whole units.
local function grown(size, ratio)
  return math.floor(size * ratio + 0.5)
end

-- What Pixel-perfect sets on this screen: the scale (768 / height times the whole multiple), this
-- screen's preset (1080p's on a small screen) with its buttons and text grown by how much smaller
-- that scale is than the preset's (the text in steps of 5%, within the slider's range). Raid tiles
-- keep the preset's size: the grid sits among frames drawn in UI units, so growing it alone crowds them.
function S.PixelPreset()
  local base, _, h = S.ScreenPreset(S.DetectScreen()) or S.SCREENS[1], screenSize()
  local n = S.PixelMultiple(h > 0 and h or 768)
  local ui = T.PixelPerfectScale() * n
  local r = base.ui / ui
  local text = math.max(0.7, math.min(1.3, math.floor(base.textScale * r * 20 + 0.5) / 20))
  return { key = S.PIXEL.key, ui = ui, pixel = n, button = grown(base.button, r), tile = base.tile, textScale = text }
end

-- Sets the game's UI scale (clamped to its own slider's range), out of combat: the client's
-- uiScale and useUiScale settings, as its Graphics options set them. Returns true when it can.
-- The caller turns Vanguard's pixel-perfect scale off where this scale is meant to run.
---@param scale number
---@return boolean
function ns.SetGameUIScale(scale)
  local set = (C_CVar and C_CVar.SetCVar) or _G.SetCVar
  if type(set) ~= "function" or type(scale) ~= "number" then return false end
  scale = math.max(S.UI_SCALE.min, math.min(S.UI_SCALE.max, scale))
  ns.OutOfCombat(function()
    set("useUiScale", "1")
    set("uiScale", tostring(scale))
  end)
  return true
end

-- Sets the game's UI scale (ns.SetGameUIScale) and switches the profile in use's pixel-perfect
-- scale off, since it would replace this one.
function ns.SetUIScale(scale)
  if ns.SetGameUIScale(scale) then T.Settings().pixelScale = false end
end

-- Sets a screen preset's scale: Pixel-perfect's whole multiple with Vanguard's pixel-perfect scale,
-- else the game's UI scale (which turns pixel-perfect off).
local function setScale(p)
  if not p.pixel then return ns.SetUIScale(p.ui) end
  T.Settings().pixelMultiple = p.pixel
  T.SetPixelScale(true)
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
  S.Backup()
  setScale(p)
  setButtons(p.button)
  setTiles(p.tile)
  T.Settings().textScale = p.textScale
  T.Refresh()
end

-- A share as a whole percent.
local function percent(v)
  return math.floor(v * 100 + 0.5)
end

-- Who sets the UI scale now: Vanguard's pixel-perfect scale while it is on, else the game's own slider.
function S.ScaleOwner()
  if T.Settings().pixelScale then return "Vanguard's pixel-perfect scale (General, Look)" end
  return "the game's UI Scale slider (Options, Graphics)"
end

-- What a preset sets, under the choices: a preset moves the game's own UI Scale slider (and
-- turns Vanguard's pixel-perfect scale off), Pixel-perfect turns that scale on, and Keep leaves
-- the scale with whichever sets it now.
local function screenHint(p)
  if not p then return "Changes nothing: your UI scale stays with " .. S.ScaleOwner() .. ", your sizes as they are." end
  local scale = p.pixel and "Sharpest: every line on whole screen pixels. Vanguard's pixel-perfect scale at %d%%"
    or "Moves the game's UI Scale slider to %d%% (Vanguard's pixel-perfect scale goes off)"
  return string.format(scale .. "; action buttons %d px, raid tiles %d x %d, text %d%%.", percent(p.ui), p.button, p.tile[1], p.tile[2], percent(p.textScale))
end

-- Marks -----------------------------------------------------------------------------------

-- Marks a choice when it is the chosen one: a row takes the selected look (rail and lighter fill, label
-- unchanged); a swatch or tile is outlined in the accent (its label too).
local function mark(b, on)
  if b.SetSelected then return b:SetSelected(on) end
  T.SetBorder(b, on and { T.Accent() } or nil)
  if b.text then T.Color(b.text, on and "accentText" or "text") end
  if b.check then b.check:SetShown(on) end
end

-- True when the accent is this preset color.
local function isAccent(rgb)
  local r, g, b = T.Accent()
  return r == rgb[1] and g == rgb[2] and b == rgb[3]
end

-- Marks the chosen button on a page of choices and shows its hint (a function's answer, for one that changes).
local function markChoice(page, value)
  for _, b in ipairs(page.choices) do
    mark(b, b.value == value)
    if b.value == value then page.hint:SetText(type(b.hint) == "function" and b.hint() or b.hint) end
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
  look.calm:Refresh()
  look.larger:Refresh()
  look.assist:Refresh()
end

-- Building ------------------------------------------------------------------------------

-- A left-aligned line of text on the wizard.
local function text(parent, role, color, value)
  local fs = T.Text(parent:CreateFontString(nil, "OVERLAY"), role, color)
  fs:SetJustifyH("LEFT")
  fs:SetText(value)
  return fs
end

-- A full-width choice row at y (a negative offset down the page); value is what it picks. It rests flat
-- and lifts under the mouse; the chosen one wears the selected look.
local function choice(page, label, value, y, onClick)
  local b = W.Row(page, T.BUTTON_H, { width = WIDTH - 2 * PAD })
  b.text = text(b, "label", "text", label)
  b.text:SetPoint("LEFT", T.SPACE.section, 0)
  b:SetScript("OnClick", ns.Guard(W.ClickLabel(label), onClick))
  b:SetPoint("TOPLEFT", 0, y)
  b.value = value
  return b
end

-- How far down a page the i-th choice sits: under the question, a button and a tight gap apart.
local function choiceY(i)
  return -(T.SPACE.section + (i - 1) * (T.BUTTON_H + T.SPACE.tight))
end

-- A page of choices under a question: a button per { key, text, hint }; picking one
-- sets state[field]. The chosen one's hint shows under them.
local function choicePage(page, question, list, field)
  text(page, "label", "text2", question):SetPoint("TOPLEFT")
  page.choices = {}
  for i, l in ipairs(list) do
    page.choices[i] = choice(page, l.text, l.key, choiceY(i), function() state[field] = l.key; refresh() end)
    page.choices[i].hint = l.hint or ""
  end
  page.hint = text(page, "small", "text2", "")
  page.hint:SetPoint("TOPLEFT", 0, choiceY(#list + 1))
  page.hint:SetWidth(WIDTH - 2 * PAD)
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

-- Names the profile step's choices after the profile in use now (the page is built once, at setup's first open).
local function relabelProfile()
  for i, l in ipairs(profileChoices()) do
    local b = frame.pages.profile.choices[i]
    b.text:SetText(l.text)
    b.hint = l.hint
  end
end

-- The layout choices, the one for your role marked.
local function layoutChoices()
  local mine, out = S.GuessLayout(), {}
  for i, l in ipairs(S.LAYOUTS) do
    out[i] = { key = l.key, hint = l.hint, text = l.text .. (l.key == mine and "  ·  your role" or "") }
  end
  return out
end

-- The layout step: a button per layout, then the chosen one's hint.
local function layoutPage(page)
  choicePage(page, "How do you mostly play? You can change it all later in /vg.", layoutChoices(), "layout")
end

-- The screen choices: each preset (the one for this screen marked), then Keep.
local function screenChoices()
  local detected, out = S.DetectScreen(), {}
  for i, p in ipairs(S.SCREENS) do
    local mine = p.key == detected and "  ·  your screen" or ""
    out[i] = { key = p.key, hint = screenHint(p), text = string.format("%s (%d x %d)%s", p.text, p.w, p.h, mine) }
  end
  out[#out + 1] = { key = S.PIXEL.key, text = S.PIXEL.text, hint = screenHint(S.PixelPreset()) }
  out[#out + 1] = { key = "keep", text = "Keep my current sizes", hint = function() return screenHint(nil) end }
  return out
end

-- The screen step: a button per screen preset and Keep, then the chosen one's hint.
local function screenPage(page)
  choicePage(page, "Sizes for your screen (yours is marked). /vg graphics checks your frame rate.", screenChoices(), "screen")
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
  b.text:SetPoint("TOP", b, "BOTTOM", 0, -T.SPACE.tight)
  b:SetScript("OnClick", ns.Guard("click setup style", function() S.SetStyle(s[1]); refresh() end))
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
  local s = W.Swatch(page, rgb, function() S.Backup(); T.SetAccent(rgb[1], rgb[2], rgb[3]); refresh() end)
  s:SetPoint("TOPLEFT", (i - 1) * 34, -20)
  s.rgb = rgb
  s.check = W.IconTexture(s, "Check", 14, "void")
  s.check:SetPoint("CENTER")
  return s
end

-- The Calm HUD switch and the two readability switches (larger text, safer colours) under the style tiles.
local function lookSwitches(page)
  page.calm = W.Check(page, "Calm HUD: dim your frames out of combat", S.Calm, S.SetCalm, WIDTH - 2 * PAD)
  page.calm:SetPoint("TOPLEFT", 0, -154)
  page.larger = W.Check(page, "Larger text (115%)", S.Larger, S.SetLarger, WIDTH - 2 * PAD)
  page.larger:SetPoint("TOPLEFT", 0, -182)
  page.assist = W.Check(page, "Colour vision: Safer colours (colour blindness)", S.Assist, S.SetAssist, WIDTH - 2 * PAD)
  page.assist:SetPoint("TOPLEFT", 0, -210)
end

-- The look step: the accent presets, the raid frame style, then Calm HUD and the readability switches.
local function lookPage(page)
  text(page, "label", "text", "Accent"):SetPoint("TOPLEFT")
  page.swatches = {}
  for i, name in ipairs(T.PRESET_ORDER) do
    page.swatches[i] = swatch(page, i, T.PRESETS[name])
  end
  stylePicker(page)
  lookSwitches(page)
end

-- The last step: how to move frames (they are unlocked while this step shows).
local function movePage(page)
  local lines = { "Your frames are unlocked: drag a handle to move that frame.",
    "Click a handle, then the arrow keys nudge it (Shift: 10 px).", "Done locks them. /vg unlock moves them any time." }
  for i, line in ipairs(lines) do
    text(page, "label", i == 1 and "text" or "text2", line):SetPoint("TOPLEFT", 0, -(i - 1) * 22)
  end
end

-- The title and the step caption under it, centred across the window (as the game's own titles are), with the
-- close button and Escape (ns.WindowTitle), and your faction's crest (T.CREST.title) just right of the title.
local function addTitle(f)
  local parts = ns.WindowTitle(f, "Set up Vanguard", { align = "center", count = "", escape = true,
    onClose = function(window) window:Hide() end })
  f.caption = parts.count
  f.crest = T.Crest(f, T.CREST.title)
  f.crest:SetPoint("LEFT", f.title, "RIGHT", T.SPACE.gap, 0)
end

-- The window: a floating panel at the dialog alpha with a title and the step caption.
local function window()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_Setup", UIParent), { alpha = T.ALPHA.dialog, shadow = true })
  T.PixelSize(f, WIDTH, HEIGHT, true)
  f:SetPoint("CENTER")
  -- Above the unlock handles (DIALOG), so their labels and grid never draw over the steps.
  f:SetFrameStrata("FULLSCREEN_DIALOG")
  f:EnableMouse(true)
  addTitle(f)
  T.Ornament(f, "corners")
  return f
end

-- Done or Skip setup: setup ran, so closing it now counts (done: it was Done, not Skip).
local function complete(done)
  state.complete, state.done = true, done == true
  frame:Hide()
end

-- The footer: Skip setup (first step only), then Back, then Next or Done, all the usual button width.
local function controls(f)
  f.next = W.Primary(f, "Next", function() S.Next() end)
  f.next:SetPoint("BOTTOMRIGHT", -PAD, PAD)
  f.back = W.Button(f, "Back", function() S.Back() end)
  f.back:SetPoint("RIGHT", f.next, "LEFT", -T.SPACE.gap, 0)
  f.skip = W.Button(f, "Skip setup", function() complete(false) end)
  f.skip:SetPoint("BOTTOMLEFT", PAD, PAD)
end

-- Why setup offers a reload: a module turned on, new raid tile sizes, or Done (setup always ends
-- with one, so everything it set shows as it will from now on); nil otherwise.
local function reloadReason()
  if state.reload then return "Setup turned on a module that was off." end
  if state.retile then return "The new raid tile size shows after a reload." end
  if state.role then return "The layout's raid frame, raid aura and nameplate settings show after a reload." end
  if state.complete and state.done then return "Setup is done." end
end

-- Remembers that setup ran, on the account and for this character, and says how to run it again.
local function markDone()
  VanguardDB.setupDone, VanguardCharDB.setupDone, VanguardCharDB.pickProfile = true, true, nil
  ns.Chat(AGAIN)
end

-- After a first run's Done: the question that suggests keeping a profile string outside the game.
S.EXPORT_ASK = "Keep a copy of these settings outside the game? Export a profile string and save it somewhere safe; /vg import brings it back."

-- Shows the whole profile's export string, selected to copy; with a reload owed, chat says to reload after.
local function exportNow(why)
  ns.ShowText("Vanguard export (profile " .. ns.ProfileName() .. ")  Ctrl+C to copy", ns.ExportProfile())
  if why then ns.Chat(why .. " Type /reload once you've copied the string.") end
end

-- After a first run's Done: asks whether to export a profile string, then offers the reload (when one is owed) on Not now.
local function suggestExport(why)
  ns.Ask(S.EXPORT_ASK, "Export", function() exportNow(why) end, function() if why then ns.OfferReload(why) end end)
end

-- What follows the end of setup: the export question after a first run's Done, else the reload offer when one is owed.
local function afterSetup(firstRun, why)
  if firstRun then return suggestExport(why) end
  if why then ns.OfferReload(why) end
end

-- Setup ended (Done, Skip setup, the close button or Escape): lock the frames; after Done or Skip
-- remember that setup ran, else (when it was owed) say it opens again; after a first run's Done
-- suggest exporting a profile string; offer a reload when a module was turned on or the raid tiles changed size.
local function finished()
  if state.paused then return end
  if ns.Unlocked() then ns.Lock() end
  if state.complete then markDone() elseif state.owed then ns.Chat(LATER) end
  afterSetup(state.complete and state.owed and state.done, reloadReason())
  state.reload, state.retile, state.role, state.backup = false, false, false, nil
  for _, fn in ipairs(S.onEnd) do fn() end
end

local BUILDERS = { profile = profilePage, layout = layoutPage, screen = screenPage, look = lookPage, move = movePage }

-- A page per step, between the caption and the footer, by key.
local function addPages(f)
  f.pages = {}
  for key, builder in pairs(BUILDERS) do
    f.pages[key] = CreateFrame("Frame", nil, f)
    f.pages[key]:SetPoint("TOPLEFT", PAD, -TOP)
    f.pages[key]:SetPoint("BOTTOMRIGHT", -PAD, FOOT)
    builder(f.pages[key])
  end
end

-- What Tab reaches in the wizard: the showing page's choices, then Skip, Back and Next.
local function focusList()
  local out = {}
  local page = frame.pages[state.order[state.step]]
  for _, b in ipairs(page and page.choices or {}) do out[#out + 1] = b end
  for _, b in ipairs({ frame.skip, frame.back, frame.next }) do out[#out + 1] = b end
  return out
end

-- Builds the wizard once: the window (whose title line closes it on Escape), its controls and pages.
local function build()
  local f = window()
  controls(f)
  addPages(f)
  f:SetScript("OnHide", finished)
  ns.TabFocus(f, focusList)
  return f
end

-- Steps -----------------------------------------------------------------------------------

-- Shows step n: its page, caption and buttons. The last step (move things) unlocks the frames.
local function showStep(n)
  local key, last = state.order[n], #state.order
  state.step = n
  ns.FocusClear(frame)
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
  if state.step == #state.order then return complete(true) end
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

-- Opens setup at step 1 (the profile step for a new character); in combat it waits. Keep and Keep
-- are picked, the first time too, so Vanguard starts from where you are and clicking through
-- changes nothing; your role's layout and your screen's preset are marked.
function S.Open()
  if ns.InCombat() then return S.Defer() end
  frame = frame or build()
  local owe, pick = owed(), VanguardCharDB.pickProfile == true
  state.order, state.floor, state.owed, state.complete, state.profile = pick and PROFILE_STEPS or STEPS, 1, owe, false, "share"
  state.layout, state.screen, state.backup = "keep", "keep", nil
  state.reload, state.paused, state.done, state.role = false, false, false, false
  relabelProfile()
  T.OpenWindow(frame)
  showStep(1)
end

-- Combat ----------------------------------------------------------------------------------

-- The fight ended: bring setup back on the step it was on.
local function resume()
  if not state.paused then return end
  state.paused = false
  T.OpenWindow(frame)
  showStep(state.step)
end

-- A fight started with setup open: step aside, and come back through the combat queue when it ends.
local function pause()
  if not S.Step() then return end
  state.paused = true
  frame:Hide()
  ns.AfterCombat(resume, "setup")
end

ns.On("PLAYER_REGEN_DISABLED", pause)

-- A new character on an account that has run setup owes it, starting with which profile to use
-- (after Core/DB.lua's handler has read the saved tables).
ns.On("ADDON_LOADED", function(_, name)
  if name ~= ADDON or not ns.NewCharacter() or not VanguardDB.setupDone then return end
  VanguardCharDB.setupDone, VanguardCharDB.pickProfile = false, true
end)

-- A login while setup is owed (the account's first, a new character's, or after closing it early
-- or starting over) opens it, after the modules have built.
-- Not while the saved settings didn't load (Core/SettingsGuard.lua offers the restore; Start fresh opens setup).
ns.On("PLAYER_LOGIN", function()
  if owed() and not ns.SettingsGuard.Lost() then S.Open() end
end)
