-- First-run setup: a three-step wizard (layout, look, move things). It opens
-- once per account (ForeverUIDB.setupDone), never in combat (it waits for
-- combat to end, and steps aside if a fight starts while it is open), and
-- /fui setup opens it again. With the defaults, Next, Next, Done finishes it.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local S = {}
ns.Setup = S

local WIDTH, HEIGHT, PAD = 440, 300, 16
local STEPS = { "Layout", "Look", "Move things" }

-- Layout presets, in display order; the first is the default.
S.LAYOUTS = {
  { key = "damage", text = "Damage and tanking" },
  { key = "healing", text = "Healing", hint = "Raid frames under your character, click casting on." },
  { key = "blizzard", text = "Close to Blizzard's" },
}
-- Raid frame styles: the Raid page's Style choices.
S.STYLES = { { "soft", "Class colors, softened" }, { "dark", "Dark, class-colored names" }, { "class", "Class colors, bright" } }
-- Healing: the raid frames' top edge centered on the screen, under the player frame.
S.HEALING_RAID = { "TOP", "CENTER", 0, -200 }

local frame
local state = { step = 1, layout = S.LAYOUTS[1].key, paused = false, reload = false }
local waiting = false

-- Presets -------------------------------------------------------------------------------

-- Turns a module on for this profile; one that was off needs a reload.
local function turnOn(name)
  if ns.ModuleEnabled(name) then return end
  ns.SetModuleEnabled(name, true)
  state.reload = true
end

-- Saves the raid frames' spot, moving them now (or after combat) when they are built.
local function placeRaid(p)
  if ns.MoverPoint("raid") then return ns.SetMoverPoint("raid", p[1], p[2], p[3], p[4]) end
  ns.Settings("positions").raid = { point = p[1], relPoint = p[2], x = p[3], y = p[4] }
end

-- Puts everything a preset moves (today only the raid frames) back at
-- ForeverUI's defaults, so picking Damage and tanking undoes Healing.
local function restoreDefaults()
  ns.Settings("positions").raid = nil
  ns.ResetMovers("raid")
end

-- What each layout changes. Close to Blizzard's is not specified yet and
-- leaves every setting as it is.
local APPLY = {
  -- Damage and tanking: ForeverUI's defaults.
  damage = restoreDefaults,
  -- Healing: raid frames centered under the player frame, click casting on.
  healing = function()
    placeRaid(S.HEALING_RAID)
    turnOn("RaidFrames")
    turnOn("ClickCast")
  end,
}

-- Applies a layout preset by key.
function S.ApplyLayout(key)
  local apply = APPLY[key]
  if apply then apply() end
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

-- Re-marks the chosen layout (and shows its hint), accent and style.
local function refresh()
  local p1, p2 = frame.pages[1], frame.pages[2]
  for _, b in ipairs(p1.choices) do
    mark(b, b.value == state.layout)
    if b.value == state.layout then p1.hint:SetText(b.hint) end
  end
  for _, s in ipairs(p2.swatches) do mark(s, isAccent(s.rgb)) end
  for _, b in ipairs(p2.styles) do mark(b, b.value == raidSettings().look) end
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

-- Step 1: a button per layout, then the chosen one's hint.
local function layoutPage(page)
  text(page, "label", "text2", "How do you mostly play? You can change it all later in /fui."):SetPoint("TOPLEFT")
  page.choices = {}
  for i, l in ipairs(S.LAYOUTS) do
    page.choices[i] = choice(page, l.text, l.key, -24 - (i - 1) * 32, function() state.layout = l.key; refresh() end)
    page.choices[i].hint = l.hint or ""
  end
  page.hint = text(page, "small", "text2", "")
  page.hint:SetPoint("TOPLEFT", 0, -24 - #S.LAYOUTS * 32)
end

-- The raid frame style buttons under the accent swatches.
local function stylePicker(page)
  text(page, "label", "text", "Raid frame style"):SetPoint("TOPLEFT", 0, -62)
  page.styles = {}
  for i, s in ipairs(S.STYLES) do
    page.styles[i] = choice(page, s[2], s[1], -82 - (i - 1) * 30, function() S.SetStyle(s[1]); refresh() end)
  end
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

-- Step 2: the accent presets, then the raid frame style.
local function lookPage(page)
  text(page, "label", "text", "Accent"):SetPoint("TOPLEFT")
  page.swatches = {}
  for i, name in ipairs(T.PRESET_ORDER) do
    page.swatches[i] = swatch(page, i, T.PRESETS[name])
  end
  stylePicker(page)
end

-- Step 3: how to move frames (they are unlocked while this step shows).
local function movePage(page)
  local lines = { "Your frames are unlocked: drag a handle to move that frame.",
    "Click a handle, then the arrow keys nudge it (Shift: 10 px).", "Done locks them. /fui unlock moves them any time." }
  for i, line in ipairs(lines) do
    text(page, "label", i == 1 and "text" or "text2", line):SetPoint("TOPLEFT", 0, -(i - 1) * 22)
  end
end

-- The window: a floating panel with a title and the step caption.
local function window()
  local f = T.Panel(CreateFrame("Frame", "ForeverUI_Setup", UIParent), { alpha = 0.98, shadow = true })
  f:SetSize(WIDTH, HEIGHT)
  f:SetPoint("CENTER")
  f:SetFrameStrata("DIALOG")
  f:EnableMouse(true)
  f.title = text(f, "title", "text", "Set up ForeverUI")
  f.title:SetPoint("TOPLEFT", PAD, -14)
  f.caption = text(f, "small", "accent", "")
  f.caption:SetPoint("TOPLEFT", f.title, "BOTTOMLEFT", 0, -4)
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

-- Setup ended (Done, the close button or Escape): lock the frames, remember
-- that setup ran, and offer a reload when a module was turned on.
local function finished()
  if state.paused then return end
  if ns.Unlocked() then ns.Lock() end
  ForeverUIDB.setupDone = true
  if state.reload then ns.OfferReload("Setup turned on a module that was off.") end
  state.reload = false
end

local BUILDERS = { layoutPage, lookPage, movePage }

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

-- Next: leaving step 1 applies the layout; on the last step it is Done.
function S.Next()
  if state.step == 1 then S.ApplyLayout(state.layout) end
  if state.step == #STEPS then return frame:Hide() end
  showStep(state.step + 1)
end

-- Back one step.
function S.Back()
  showStep(math.max(state.step - 1, 1))
end

-- The step showing (1 to 3), or nil while setup is closed.
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

-- Opens setup at step 1 with the default layout; in combat it waits.
function S.Open()
  if ns.InCombat() then return S.Defer() end
  frame = frame or build()
  state.layout, state.reload, state.paused = S.LAYOUTS[1].key, false, false
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
