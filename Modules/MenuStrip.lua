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
-- The glyph's share of a menu button's shorter side, and the gap (UI units)
-- inside each button's edge so neighbors don't run together.
MS.GLYPH, MS.PAD = 0.7, 2
-- The bag strip, left of the menu strip, and how small the bag buttons are drawn there.
MS.BAG_W, MS.BAG_SCALE = 132, 0.6
-- The game's bag buttons (backpack, bags, reagent bag), styled where the client has them.
MS.BAGS = { "MainMenuBarBackpackButton", "CharacterBag0Slot", "CharacterBag1Slot", "CharacterBag2Slot", "CharacterBag3Slot", "CharacterReagentBag0Slot" }

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

-- Pins one of the game's bars into a strip (at one end, or centered), drawn smaller.
local function pinInto(name, strip, point, x, scale)
  local f = _G[name]
  if type(f) ~= "table" or not f.SetPoint then return end
  ns.Pin(f, function(bar)
    bar:SetParent(strip)
    bar:SetScale(scale)
    bar:ClearAllPoints()
    bar:SetPoint(point, strip, point, x, 0)
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

-- The button's face: a flat inset panel MS.PAD inside its edges (so neighbors
-- keep a gap), with a faint wash while the mouse is over the button.
local function addFace(b)
  local face = T.HudPanel(CreateFrame("Frame", nil, b), { inset = true })
  face:SetPoint("TOPLEFT", b, "TOPLEFT", MS.PAD, -MS.PAD)
  face:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", -MS.PAD, MS.PAD)
  local hover = T.Tint(T.Snap(b:CreateTexture(nil, "HIGHLIGHT")), "hover")
  hover:SetTexture(T.WHITE)
  hover:SetAllPoints(face)
  return face
end

-- The glyph centered on the button's face.
local function addGlyph(b, icon)
  local side = math.min(b:GetWidth(), b:GetHeight()) - 2 * MS.PAD
  b.fuiFace = addFace(b)
  b.fuiGlyph = T.Snap(b.fuiFace:CreateTexture(nil, "OVERLAY"))
  b.fuiGlyph:SetTexture(icon)
  b.fuiGlyph:SetSize((side > 0 and side or 24) * MS.GLYPH, (side > 0 and side or 24) * MS.GLYPH)
  b.fuiGlyph:SetPoint("CENTER", b.fuiFace, "CENTER")
end

-- One of the game's menu buttons in the ForeverUI look: its art faded (alerts
-- kept), a flat inset panel and a line icon that dims while it's disabled.
function MS.SkinButton(b, icon)
  if b.fuiGlyph then return end
  T.FadeRegions(b, alerts(b))
  fadeStates(b)
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

-- Bag buttons ---------------------------------------------------------------------------------

-- A bag button's icon texture, by key or by the game's global name.
local function bagIcon(b)
  local icon = b.icon or b.Icon or _G[(b:GetName() or "") .. "IconTexture"]
  return type(icon) == "table" and icon.SetTexCoord and icon or nil
end

-- The bag's icon, shown, cropped and inset MS.PAD inside the button's border.
local function insetIcon(b, icon)
  icon:SetAlpha(1)
  T.Crop(icon)
  icon:ClearAllPoints()
  icon:SetPoint("TOPLEFT", b, "TOPLEFT", MS.PAD, -MS.PAD)
  icon:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", -MS.PAD, MS.PAD)
end

-- One of the game's bag buttons in the ForeverUI look: its art faded, a thin
-- border, the bag's icon cropped and inset inside it. Once per button.
function MS.SkinBag(b)
  local icon = bagIcon(b)
  if b.fuiBag or not icon then return end
  b.fuiBag = true
  T.FadeRegions(b, alerts(b))
  fadeStates(b)
  T.HudPanel(b, { inset = true })
  insetIcon(b, icon)
end

-- The bag strip, left of the menu strip and always shown, with the game's bag bar centered in it.
local function buildBags(settings)
  MS.bags = T.HudPanel(CreateFrame("Frame", "ForeverUI_BagStrip", UIParent), { inset = true })
  MS.bags:SetSize(MS.BAG_W, MS.HEIGHT)
  ns.Mover(MS.bags, "bagstrip", "Bags", { "BOTTOMRIGHT", "BOTTOMRIGHT", -16 - MS.WIDTH - 6, 20 })
  pinInto("BagsBar", MS.bags, "CENTER", 0, MS.BAG_SCALE)
  if not settings.glyphs then return end
  for _, name in ipairs(MS.BAGS) do if type(_G[name]) == "table" then MS.SkinBag(_G[name]) end end
end

-- The menu strip in the bottom-right corner with the game's micro menu in it.
local function buildStrip(settings)
  MS.strip = T.HudPanel(CreateFrame("Frame", "ForeverUI_MenuStrip", UIParent), { inset = true })
  MS.strip:SetSize(MS.WIDTH, MS.HEIGHT)
  ns.Mover(MS.strip, "menustrip", "Game menu", { "BOTTOMRIGHT", "BOTTOMRIGHT", -16, 20 })
  pinInto("MicroMenuContainer", MS.strip, "LEFT", 4, MS.SCALE)
  buildBags(settings)
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
