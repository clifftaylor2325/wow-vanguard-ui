-- The game's always-on extras, put where they don't clutter the screen:
--   * the micro menu (character, spellbook, talents, ...) and the bag bar,
--     side by side in one small strip in the bottom-right corner, which shows
--     only while the mouse is over it (or always, if you prefer);
--   * the quest tracker, under the info strip on the right, no taller than its spot.
-- The menu buttons keep working as the game's own (alerts included), drawn as
-- ForeverUI line icons on flat panels unless that's switched off.
-- Both stay where they're put when the game lays out its own frames again
-- (ns.Pin), re-fit whenever the game resizes or re-lays out their bars, hide the
-- bars' own frame art (the brass box), and a client without one of these frames
-- simply keeps its own.

local ADDON, ns = ...

local T = ns.Theme

local MS = ns.Module("MenuStrip", { defaults = { menu = "mouseover", tracker = true, glyphs = true, trackerLook = true } })

MS.WIDTH, MS.HEIGHT, MS.SCALE = 300, 36, 0.8
-- The space between a strip's edge and the buttons in it (UI units): sideways, and the
-- thinner top and bottom one, so a 40-tall micro menu drawn at 0.8 fits the 36-unit strip.
MS.MARGIN_X, MS.MARGIN_Y = 6, 2
-- The space between the menu strip and the bag strip (UI units).
MS.GAP = 6
-- The quest tracker's spot: its width and the most height it gets (it ends above the
-- target of target at UI scale 1.0).
MS.TRACKER_W, MS.TRACKER_H = 260, 248
-- A glyph's side in screen pixels at UI scale 1, and the gap (UI units) inside each
-- button's edge so neighbors don't run together (the game's micro buttons sit on a
-- 27-unit pitch, its grid pads them by -5, so 4 leaves a 3-unit gap between faces).
MS.GLYPH_PX, MS.PAD = 16, 4
-- The bag strip, above the menu strip, and how big the bag buttons are drawn there (45 * 0.7 = 31.5).
MS.BAG_W, MS.BAG_SCALE = 132, 0.7
-- The game's bag buttons (backpack, bags, reagent bag, and the key ring Forever adds), styled where the client has them.
MS.BAGS = { "MainMenuBarBackpackButton", "CharacterBag0Slot", "CharacterBag1Slot", "CharacterBag2Slot", "CharacterBag3Slot", "CharacterReagentBag0Slot", "KeyRingButton" }
-- The bars' own frame art on Forever (the brass box), faded: the strips' panels are the only frame.
MS.BAR_ART = { MicroMenu = { "BorderArt", "BackgroundArt" }, BagsBar = { "BorderArt" } }

-- The game's menu buttons -> ForeverUI's icon for each. A client without one skips it.
MS.GLYPHS = {
  CharacterMicroButton = T.Icon("Character"), PlayerSpellsMicroButton = T.Icon("Spellbook"),
  SpellbookMicroButton = T.Icon("Spellbook"), TalentMicroButton = T.Icon("Talents"),
  ProfessionMicroButton = T.Icon("Professions"), AchievementMicroButton = T.Icon("Achievements"),
  QuestLogMicroButton = T.Icon("Quests"), GuildMicroButton = T.Icon("Social"), SocialsMicroButton = T.Icon("Social"),
  LFDMicroButton = T.Icon("Group"), CollectionsMicroButton = T.Icon("Collections"), EJMicroButton = T.Icon("Journal"),
  StoreMicroButton = T.Icon("Shop"), MainMenuMicroButton = T.Icon("MenuCog"), HelpMicroButton = T.Icon("Help"),
  WorldMapMicroButton = T.Icon("Map"), HousingMicroButton = T.Icon("House"), LegacyMicroButton = T.Icon("Legacy"),
}
-- A menu button's alert textures (new talents, mail...), kept when its art is faded.
MS.ALERTS = { "Flash", "FlashBorder", "FlashContent" }
-- The button state textures that are faded.
local STATES = { "GetNormalTexture", "GetPushedTexture", "GetDisabledTexture", "GetHighlightTexture" }

-- The menu strip ---------------------------------------------------------------------------

-- Sizes a strip to hold its bar (drawn at scale) with MS.MARGIN_X and MS.MARGIN_Y
-- around it, never smaller than its default size.
function MS.FitStrip(strip, bar, scale, minWidth)
  local w, h = (bar:GetWidth() or 0) * scale, (bar:GetHeight() or 0) * scale
  strip:SetSize(math.max(minWidth, w + 2 * MS.MARGIN_X), math.max(MS.HEIGHT, h + 2 * MS.MARGIN_Y))
end

-- Runs a pinned bar's placement again after the game resized it or laid it out
-- again; through the pin, so pauses, combat and the pinning flag are honored.
function MS.Refit(bar)
  if bar.fuiPinning or type(bar.fuiPin) ~= "function" then return end
  ns.Pin(bar, bar.fuiPin)
end

-- Re-fits the strip whenever the game changes the bar's size or lays it out again.
local function watchBar(f)
  f:HookScript("OnSizeChanged", MS.Refit)
  if type(f.Layout) == "function" and type(hooksecurefunc) == "function" then hooksecurefunc(f, "Layout", MS.Refit) end
end

-- Seats one of the game's bars centered in a strip, drawn at scale.
local function seat(bar, strip, scale)
  bar:SetParent(strip)
  bar:SetScale(scale)
  bar:ClearAllPoints()
  bar:SetPoint("CENTER", strip, "CENTER", 0, 0)
end

-- Pins one of the game's bars centered in a strip, drawn smaller, sizes the strip
-- around it and then calls after (if given), now and at every re-fit.
local function pinInto(name, strip, scale, minWidth, after)
  local f = _G[name]
  if type(f) ~= "table" or not f.SetPoint then return end
  ns.Pin(f, function(bar)
    seat(bar, strip, scale)
    MS.FitStrip(strip, bar, scale, minWidth)
    if after then after() end
  end)
  watchBar(f)
end

-- The mouse came over the menu strip or one of its buttons: the strip shows.
local function stripEnter()
  MS.strip:SetAlpha(1)
end

-- The mouse left the strip or one of its buttons: the strip hides unless the
-- mouse is still over it (moving between buttons crosses the strip itself).
local function stripLeave()
  MS.strip:SetAlpha(MS.strip:IsMouseOver() and 1 or 0)
end

-- Follows the mouse entering and leaving a frame and every frame inside it.
local function watchHover(f)
  f:HookScript("OnEnter", stripEnter)
  f:HookScript("OnLeave", stripLeave)
  for _, child in ipairs({ f:GetChildren() }) do watchHover(child) end
end

-- Shows the strip while the mouse is over it or its buttons, from the mouse's own
-- enter and leave events (nothing polls): the strip takes mouse motion but lets
-- clicks through, and every frame in it (the micro menu's buttons) reports too.
local function watchMouse(strip)
  strip:SetMouseMotionEnabled(true)
  strip:SetMouseClickEnabled(false)
  watchHover(strip)
end

-- Fades the bars' own border and background art, whichever of it this client has.
function MS.FadeArt()
  for name, keys in pairs(MS.BAR_ART) do
    local f = _G[name]
    for _, key in ipairs(keys) do
      local t = type(f) == "table" and f[key]
      if type(t) == "table" and t.SetAlpha then t:SetAlpha(0) end
    end
  end
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

-- Tints a button's glyph: muted while the button is disabled, else accent
-- while the mouse is over it, else text.
local function paintGlyph(b)
  T.Tint(b.fuiGlyph, not b:IsEnabled() and "muted" or (b.fuiHover and "accent" or "text"))
end

-- Notes whether the mouse is over a button and repaints its glyph.
local function hover(b, over)
  b.fuiHover = over
  paintGlyph(b)
end

-- The side of a button's square face (UI units): its shorter side less MS.PAD
-- all round, or 24 for a button with no size yet.
local function faceSide(b)
  local side = math.min(b:GetWidth(), b:GetHeight()) - 2 * MS.PAD
  return side > 0 and side or 24
end

-- The button's face: a flat inset square MS.PAD in from its shorter side (so
-- neighbors keep a gap) with no border of its own (the strip has one), and a
-- faint wash while the mouse is over the button.
local function addFace(b)
  local face = T.HudPanel(CreateFrame("Frame", nil, b), { inset = true, noBorder = true })
  face:SetSize(faceSide(b), faceSide(b))
  face:SetPoint("CENTER", b, "CENTER")
  local wash = T.Tint(T.Snap(b:CreateTexture(nil, "HIGHLIGHT")), "hover")
  wash:SetTexture(T.WHITE)
  wash:SetAllPoints(face)
  return face
end

-- A button's scale relative to the screen's (1 when the client can't say).
local function relScale(b)
  local s = b:GetEffectiveScale() / UIParent:GetEffectiveScale()
  return s > 0 and s or 1
end

-- Sizes a button's glyph to MS.GLYPH_PX screen pixels at UI scale 1, never bigger than its face.
local function sizeGlyph(b)
  local side = math.min(faceSide(b), MS.GLYPH_PX / relScale(b))
  b.fuiGlyph:SetSize(side, side)
end

-- Sizes every skinned menu glyph again (after the menu's scale changed).
function MS.SizeGlyphs()
  for name in pairs(MS.GLYPHS) do
    local b = _G[name]
    if type(b) == "table" and b.fuiGlyph then sizeGlyph(b) end
  end
end

-- The glyph centered on the button's face.
local function addGlyph(b, icon)
  b.fuiFace = addFace(b)
  b.fuiGlyph = T.Snap(b.fuiFace:CreateTexture(nil, "OVERLAY"))
  b.fuiGlyph:SetTexture(icon)
  b.fuiGlyph:SetPoint("CENTER", b.fuiFace, "CENTER")
  sizeGlyph(b)
end

-- One of the game's menu buttons in the ForeverUI look: its art faded (alerts
-- kept), a flat inset square and a line icon that dims while it's disabled
-- and lights up in the accent under the mouse.
function MS.SkinButton(b, icon)
  if b.fuiGlyph then return end
  T.FadeRegions(b, alerts(b))
  fadeStates(b)
  addGlyph(b, icon)
  paintGlyph(b)
  b:HookScript("OnEnable", paintGlyph)
  b:HookScript("OnDisable", paintGlyph)
  b:HookScript("OnEnter", function(self) hover(self, true) end)
  b:HookScript("OnLeave", function(self) hover(self, false) end)
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

-- The bag strip's y for a spot MS.GAP above the menu strip, whose anchor
-- point is point at y (the strips share that point and its x).
local function above(point, y, hMenu, hBags)
  if point:find("BOTTOM") then return y + hMenu + MS.GAP end
  if point:find("TOP") then return y + hBags + MS.GAP end
  return y + (hMenu + hBags) / 2 + MS.GAP
end

-- The bag strip's default spot: MS.GAP above the menu strip, lined up on the
-- same edge (so the pair stays as narrow as the menu strip and clear of the bars).
function MS.BagsDefault()
  local point, relPoint, x, y = ns.MoverPoint("menustrip")
  return { point, relPoint, x, above(point, y, MS.strip:GetHeight(), MS.bags:GetHeight()) }
end

-- The bag strip's default follows the menu strip's size and spot (on a re-fit,
-- and when the menu strip is moved or reset); a saved position of its own wins
-- (ns.SetMoverDefault).
function MS.PlaceBags()
  if MS.bags then ns.SetMoverDefault("bagstrip", MS.BagsDefault()) end
end

-- The menu strip was fitted again: its glyphs and the bag strip follow.
function MS.OnMenuFit()
  MS.SizeGlyphs()
  MS.PlaceBags()
end

-- The bag strip, just above the menu strip (however tall it grew) and always
-- shown, with the game's bag bar centered in it.
local function buildBags(settings)
  MS.bags = T.HudPanel(CreateFrame("Frame", "ForeverUI_BagStrip", UIParent), { inset = true })
  MS.bags:SetSize(MS.BAG_W, MS.HEIGHT)
  ns.Mover(MS.bags, "bagstrip", "Bags", MS.BagsDefault())
  pinInto("BagsBar", MS.bags, MS.BAG_SCALE, MS.BAG_W, MS.PlaceBags)
  if not settings.glyphs then return end
  for _, name in ipairs(MS.BAGS) do if type(_G[name]) == "table" then MS.SkinBag(_G[name]) end end
end

-- The menu strip in the bottom-right corner with the game's micro menu in it.
local function buildStrip(settings)
  MS.strip = T.HudPanel(CreateFrame("Frame", "ForeverUI_MenuStrip", UIParent), { inset = true })
  MS.strip:SetSize(MS.WIDTH, MS.HEIGHT)
  ns.Mover(MS.strip, "menustrip", "Game menu", { "BOTTOMRIGHT", "BOTTOMRIGHT", -16, 20 })
  ns.WatchMover("menustrip", MS.PlaceBags)
  pinInto("MicroMenuContainer", MS.strip, MS.SCALE, MS.WIDTH, MS.OnMenuFit)
  MS.FadeArt()
  buildBags(settings)
  if settings.glyphs then skinGlyphs() end
  if settings.menu == "mouseover" then watchMouse(MS.strip) MS.strip:SetAlpha(0) end
end

-- The quest tracker -------------------------------------------------------------------------

-- The tracker's spot under the info strip, and the game's tracker pinned into it.
local function buildTracker()
  MS.trackerSpot = CreateFrame("Frame", "ForeverUI_QuestTracker", UIParent)
  MS.trackerSpot:SetSize(MS.TRACKER_W, MS.TRACKER_H)
  ns.Mover(MS.trackerSpot, "questtracker", "Quest tracker", { "TOPRIGHT", "TOPRIGHT", -12, -276 })
  local tracker = _G.ObjectiveTrackerFrame
  if type(tracker) ~= "table" or not tracker.SetPoint then return end
  ns.Pin(tracker, function(f)
    f:ClearAllPoints()
    f:SetPoint("TOPRIGHT", MS.trackerSpot, "TOPRIGHT", 0, 0)
    f:SetHeight(MS.TRACKER_H)
  end)
end

-- The quest tracker's look ------------------------------------------------------------------

-- Tracker header art that's faded ("All Objectives", "Quests"... each have their own).
MS.HEADER_ART = { "Background", "Shine", "Glow" }
-- The tracker's font objects -> { size before Text size, bold }.
MS.TRACKER_FONTS = { ObjectiveTrackerLineFont = { 12 }, ObjectiveTrackerHeaderFont = { 13, true } }
-- The accent lines under the tracker's headers (repainted when the accent changes).
MS.rules = {}

-- Paints every header's accent line in the current accent.
local function paintRules()
  for _, rule in ipairs(MS.rules) do T.Tint(rule, "accent") end
end

-- A one-pixel accent line along a header's bottom edge.
local function addRule(header)
  local rule = T.Snap(header:CreateTexture(nil, "ARTWORK"))
  rule:SetTexture(T.WHITE)
  rule:SetPoint("BOTTOMLEFT", header, "BOTTOMLEFT")
  rule:SetPoint("BOTTOMRIGHT", header, "BOTTOMRIGHT")
  rule:SetHeight(T.Pixel(header))
  MS.rules[#MS.rules + 1] = rule
  T.Tint(rule, "accent")
end

-- Shows a header's collapse arrow: Down while open, Right while collapsed.
function MS.PaintArrow(header, collapsed)
  header.fuiArrow:SetTexture(T.Icon(collapsed and "Right" or "Down"))
end

-- A header's collapse button: the game's art faded, the theme's arrow drawn on
-- it, following the header as it collapses and opens.
local function skinToggle(header)
  local b = header.MinimizeButton
  fadeStates(b)
  header.fuiArrow = T.Tint(T.Snap(b:CreateTexture(nil, "OVERLAY")), "text2")
  header.fuiArrow:SetSize(12, 12)
  header.fuiArrow:SetPoint("CENTER", b, "CENTER")
  MS.PaintArrow(header, false)
  if type(header.SetCollapsed) == "function" then hooksecurefunc(header, "SetCollapsed", MS.PaintArrow) end
end

-- One tracker header in the theme: its art faded, a flat band with an accent
-- line along the bottom, its title in the heading font (its color kept). Once.
function MS.SkinHeader(header)
  if header.fuiHeader then return end
  header.fuiHeader = true
  for _, key in ipairs(MS.HEADER_ART) do if type(header[key]) == "table" then header[key]:SetAlpha(0) end end
  T.HudPanel(header, { inset = true, alpha = 0.6 })
  addRule(header)
  if type(header.Text) == "table" then T.Text(header.Text, "heading", false) end
  if type(header.MinimizeButton) == "table" then skinToggle(header) end
end

-- Every tracker header there is now: the tracker's own and each section's.
function MS.SkinTracker()
  local tracker = _G.ObjectiveTrackerFrame
  if type(tracker.Header) == "table" then MS.SkinHeader(tracker.Header) end
  for _, section in ipairs(type(tracker.modules) == "table" and tracker.modules or {}) do
    if type(section.Header) == "table" then MS.SkinHeader(section.Header) end
  end
end

-- The theme font, scaled by Text size, on the tracker's font objects (the
-- quest titles and objectives keep the game's colors).
function MS.TrackerFonts()
  for name, spec in pairs(MS.TRACKER_FONTS) do
    local font, path, outline = _G[name], T.Font(spec[2])
    if type(font) == "table" and font.SetFont then font:SetFont(path, T.ScaledSize(spec[1]), outline) end
  end
end

-- The quest tracker in the ForeverUI look, kept up as the game adds sections
-- and as Text size or the accent changes.
local function lookTracker()
  local tracker = _G.ObjectiveTrackerFrame
  if type(tracker) ~= "table" or type(hooksecurefunc) ~= "function" then return end
  MS.SkinTracker()
  MS.TrackerFonts()
  T.OnChanged(MS.TrackerFonts)
  T.OnChanged(paintRules)
  if type(tracker.Update) == "function" then hooksecurefunc(tracker, "Update", MS.SkinTracker) end
end

-- Module entry point (Core/Modules.lua): out of combat, since some of these hold secure buttons.
function MS.Enable(settings)
  ns.OutOfCombat(function()
    buildStrip(settings)
    if settings.tracker then buildTracker() end
    if settings.trackerLook then lookTracker() end
  end)
end
