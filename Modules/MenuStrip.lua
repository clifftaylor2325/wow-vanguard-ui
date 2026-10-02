-- The game's always-on extras, put where they don't clutter the screen:
--   * the micro menu (character, spellbook, talents, ...) and the bag bar,
--     side by side in one small strip in the bottom-right corner, which shows
--     only while the mouse is over it (or always, if you prefer);
--   * the quest tracker, under the info strip on the right, no taller than its spot.
-- The menu buttons keep working as the game's own (alerts included), drawn as
-- ForeverUI line icons on flat panels unless that's switched off.
-- Both stay where they're put when the game lays out its own frames again
-- (ns.Pin), and a client without one of these frames simply keeps its own.

local ADDON, ns = ...

local T = ns.Theme

local MS = ns.Module("MenuStrip", { defaults = { menu = "mouseover", tracker = true, glyphs = true } })

MS.WIDTH, MS.HEIGHT, MS.SCALE = 300, 36, 0.8
-- The quest tracker's spot: its width and the most height it gets (it ends above the
-- target of target at UI scale 1.0).
MS.TRACKER_W, MS.TRACKER_H = 260, 280
-- How often the strip checks for the mouse (seconds).
MS.POLL = 0.15
-- The glyph's share of a menu button's shorter side.
MS.GLYPH = 0.7

-- The game's menu buttons -> ForeverUI's icon for each. A client without one skips it.
MS.GLYPHS = {
  CharacterMicroButton = T.Icon("Character"), PlayerSpellsMicroButton = T.Icon("Spellbook"),
  SpellbookMicroButton = T.Icon("Spellbook"), TalentMicroButton = T.Icon("Talents"),
  ProfessionMicroButton = T.Icon("Professions"), AchievementMicroButton = T.Icon("Achievements"),
  QuestLogMicroButton = T.Icon("Quests"), GuildMicroButton = T.Icon("Social"), SocialsMicroButton = T.Icon("Social"),
  LFDMicroButton = T.Icon("Group"), CollectionsMicroButton = T.Icon("Collections"), EJMicroButton = T.Icon("Journal"),
  StoreMicroButton = T.Icon("Shop"), MainMenuMicroButton = T.Icon("MenuCog"), HelpMicroButton = T.Icon("Help"),
  WorldMapMicroButton = T.Icon("Map"), HousingMicroButton = T.Icon("House"),
}
-- A menu button's alert textures (new talents, mail...), kept when its art is faded.
MS.ALERTS = { "Flash", "FlashBorder", "FlashContent" }
-- The button state textures that are faded.
local STATES = { "GetNormalTexture", "GetPushedTexture", "GetDisabledTexture", "GetHighlightTexture" }

-- The menu strip ---------------------------------------------------------------------------

-- Pins one of the game's bars into the strip at one end, drawn smaller.
local function pinInto(name, point, x)
  local f = _G[name]
  if type(f) ~= "table" or not f.SetPoint then return end
  ns.Pin(f, function(bar)
    bar:SetParent(MS.strip)
    bar:SetScale(MS.SCALE)
    bar:ClearAllPoints()
    bar:SetPoint(point, MS.strip, point, x, 0)
  end)
end

-- Shows the strip while the mouse is over it (checked a few times a second).
local function watchMouse(strip)
  local elapsed = 0
  strip:SetScript("OnUpdate", function(self, dt)
    elapsed = elapsed + dt
    if elapsed < MS.POLL then return end
    elapsed = 0
    self:SetAlpha(self:IsMouseOver() and 1 or 0)
  end)
end

-- Menu glyphs ---------------------------------------------------------------------------------

-- A button's alert textures, as a set for T.FadeRegions to keep.
local function alerts(b)
  local keep = {}
  for _, key in ipairs(MS.ALERTS) do
    if type(b[key]) == "table" then keep[b[key]] = true end
  end
  return keep
end

-- Fades the button's state textures (the game swaps their art, never their alpha).
local function fadeStates(b)
  for _, get in ipairs(STATES) do
    local t = b[get] and b[get](b)
    if t then t:SetAlpha(0) end
  end
end

-- Tints a button's glyph: text2, or muted while the button is disabled.
local function paintGlyph(b)
  T.Tint(b.fuiGlyph, b:IsEnabled() and "text2" or "muted")
end

-- The glyph centered on a button, and a faint wash under the mouse.
local function addGlyph(b, icon)
  local side = math.min(b:GetWidth(), b:GetHeight())
  b.fuiGlyph = T.Snap(b:CreateTexture(nil, "OVERLAY"))
  b.fuiGlyph:SetTexture(icon)
  b.fuiGlyph:SetSize((side > 0 and side or 24) * MS.GLYPH, (side > 0 and side or 24) * MS.GLYPH)
  b.fuiGlyph:SetPoint("CENTER")
  local hover = T.Tint(T.Snap(b:CreateTexture(nil, "HIGHLIGHT")), "hover")
  hover:SetTexture(T.WHITE)
  hover:SetAllPoints()
end

-- One of the game's menu buttons in the ForeverUI look: its art faded (alerts
-- kept), a flat inset panel and a line icon that dims while it's disabled.
function MS.SkinButton(b, icon)
  if b.fuiGlyph then return end
  T.FadeRegions(b, alerts(b))
  fadeStates(b)
  T.HudPanel(b, { inset = true })
  addGlyph(b, icon)
  paintGlyph(b)
  b:HookScript("OnEnable", paintGlyph)
  b:HookScript("OnDisable", paintGlyph)
end

-- Every menu button this client has, in the ForeverUI look.
local function skinGlyphs()
  for name, icon in pairs(MS.GLYPHS) do
    local b = _G[name]
    if type(b) == "table" and b.CreateTexture then MS.SkinButton(b, icon) end
  end
end

-- The strip in the bottom-right corner with the micro menu and bag bar in it.
local function buildStrip(settings)
  MS.strip = T.HudPanel(CreateFrame("Frame", "ForeverUI_MenuStrip", UIParent), { inset = true })
  MS.strip:SetSize(MS.WIDTH, MS.HEIGHT)
  ns.Mover(MS.strip, "menustrip", "Menu and bags", { "BOTTOMRIGHT", "BOTTOMRIGHT", -16, 20 })
  pinInto("MicroMenuContainer", "LEFT", 4)
  pinInto("BagsBar", "RIGHT", -4)
  if settings.glyphs then skinGlyphs() end
  if settings.menu == "mouseover" then watchMouse(MS.strip) MS.strip:SetAlpha(0) end
end

-- The quest tracker -------------------------------------------------------------------------

-- The tracker's spot under the info strip, and the game's tracker pinned into it.
local function buildTracker()
  MS.trackerSpot = CreateFrame("Frame", "ForeverUI_QuestTracker", UIParent)
  MS.trackerSpot:SetSize(MS.TRACKER_W, MS.TRACKER_H)
  ns.Mover(MS.trackerSpot, "questtracker", "Quest tracker", { "TOPRIGHT", "TOPRIGHT", -12, -244 })
  local tracker = _G.ObjectiveTrackerFrame
  if type(tracker) ~= "table" or not tracker.SetPoint then return end
  ns.Pin(tracker, function(f)
    f:ClearAllPoints()
    f:SetPoint("TOPRIGHT", MS.trackerSpot, "TOPRIGHT", 0, 0)
    f:SetHeight(MS.TRACKER_H)
  end)
end

-- Module entry point (Core/Modules.lua): out of combat, since some of these hold secure buttons.
function MS.Enable(settings)
  ns.OutOfCombat(function()
    buildStrip(settings)
    if settings.tracker then buildTracker() end
  end)
end
