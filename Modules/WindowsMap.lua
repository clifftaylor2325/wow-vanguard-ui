-- Game windows, map group: World map, battlefield map, group finder, Legacy system, queue status and calendar, in the
-- Vanguard look. Filled by stream S4 of docs/handoff/RESKIN-PLAN.md; registers with
-- GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.

local ADDON, ns = ...

local T = ns.Theme
local GW = ns.GetModule("Windows")

-- Small helpers ---------------------------------------------------------------------------

-- The textures a button draws as its icon (normal, pushed, highlight), which a flat tile keeps.
GW.GLYPH_GETTERS = { "GetNormalTexture", "GetPushedTexture", "GetHighlightTexture" }

-- Whether a value is a frame (a table with regions) this client has.
local function isFrame(part)
  return type(part) == "table" and part.GetRegions ~= nil
end

-- The icon textures of a button (see GW.GLYPH_GETTERS), as a set.
local function glyphTextures(button)
  local keep = {}
  for _, getter in ipairs(GW.GLYPH_GETTERS) do
    local texture = type(button[getter]) == "function" and button[getter](button)
    if type(texture) == "table" then keep[texture] = true end
  end
  return keep
end

-- A small icon button as a flat tile: its template art faded, the icon it draws kept.
function GW.SkinGlyphButton(button)
  if not isFrame(button) then return end
  T.FadeRegions(button, glyphTextures(button))
  T.Panel(button, { inset = true, noSheen = true })
end

-- A button's template art faded, its label kept, as a flat button (the nav bar's crumbs).
local function skinFlatButton(button)
  if isFrame(button) then T.Button(button) end
end

-- World map -----------------------------------------------------------------------------------

-- The "..." on the nav bar's overflow button, made once: the button's own art is gone.
local function overflowGlyph(button)
  if not isFrame(button) or button.vgGlyph then return end
  button.vgGlyph = T.Text(button:CreateFontString(nil, "OVERLAY"), "label", "text2")
  button.vgGlyph:SetPoint("CENTER")
  button.vgGlyph:SetText("...")
end

-- The nav bar's buttons: home, overflow, and every crumb it holds now.
local function skinNavButtons(nav)
  local overflow = nav.overflowButton or nav.overflow
  for _, button in ipairs({ nav.homeButton or nav.home, overflow }) do skinFlatButton(button) end
  for _, button in ipairs(nav.navList or {}) do skinFlatButton(button) end
  overflowGlyph(overflow)
end

-- The map's nav bar (made in Lua on load): its strip and overlay faded, an inset panel, its buttons flat.
function GW.SkinNavBar(nav)
  if not isFrame(nav) then return end
  T.FadeRegions(nav)
  GW.FadeParts(nav, { "overlay" })
  T.Panel(nav, { inset = true, noSheen = true })
  skinNavButtons(nav)
end

-- The map's quest log toggle (open and close buttons) as flat tiles keeping their arrows.
function GW.SkinSideToggle(toggle)
  if type(toggle) ~= "table" then return end
  GW.SkinGlyphButton(toggle.OpenButton)
  GW.SkinGlyphButton(toggle.CloseButton)
end

-- A map's border (world map, battlefield map): the window skin with only its edge and
-- shadow painted, because the border sits over the whole map and a fill would cover it.
function GW.SkinMapBorder(border)
  if not isFrame(border) then return end
  T.Panel(border, { noBg = true, shadow = true })
  GW.Skin(border)
  if type(border.Tutorial) == "table" then GW.FadeParts(border.Tutorial, { "Ring" }) end
end

-- Follows the game's redraws of the map: the nav bar's crumbs (rebuilt on each map change) and
-- the display state (minimising rebuilds the border). Hooked once.
local function watchMap(map)
  if map.vgMapWatched or type(hooksecurefunc) ~= "function" then return end
  map.vgMapWatched = true
  if type(map.SynchronizeDisplayState) == "function" then hooksecurefunc(map, "SynchronizeDisplayState", GW.SkinWorldMap) end
  local nav = map.NavBar
  if type(nav) == "table" and type(nav.Refresh) == "function" then hooksecurefunc(nav, "Refresh", function() skinNavButtons(nav) end) end
end

-- The world map: its border, the fill behind the canvas, the overscroll art, nav bar and quest toggle.
-- The canvas (ScrollContainer) and the coordinate line Modules/Waypoints.lua adds stay as they are.
function GW.SkinWorldMap(map)
  GW.SkinMapBorder(map.BorderFrame)
  T.Panel(map, { noBorder = true, noSheen = true })
  GW.FadeParts(map, { "OverscrollBG" })
  GW.SkinNavBar(map.NavBar)
  GW.SkinSideToggle(map.SidePanelToggle)
  watchMap(map)
end

GW.Add("map", "framed", { "WorldMapFrame" }, GW.SkinWorldMap)
GW.Add("map", "onDemand", "Blizzard_WorldMap", { "WorldMapFrame" }, GW.SkinWorldMap)

-- Quest log inside the map -------------------------------------------------------------------

-- The parts of the quest details panel whose art is faded (the rewards tile and the buttons' strip included).
GW.QUEST_DETAIL_ART = { "Bg", "SealMaterialBG", "BorderFrame", "BackFrame" }
-- The details panel's push buttons.
GW.QUEST_DETAIL_BUTTONS = { "AbandonButton", "ShareButton", "TrackButton" }

-- Whether Vanguard's own quest log is on, standing in for the game's quest panel (it is built only when on).
local function ownQuestLog()
  local log = ns.GetModule("QuestLog")
  return log ~= nil and log.frame ~= nil
end

-- The quest list's panel: its ornate border, scroll background and edge faded, an inset panel.
local function skinQuestList(list)
  if not isFrame(list) then return end
  GW.FadeParts(list, { "BorderFrame" })
  if type(list.ScrollFrame) == "table" then GW.FadeParts(list.ScrollFrame, { "Background", "Edge" }) end
  T.Panel(list, { inset = true, noSheen = true })
end

-- The details panel's buttons (abandon, share, track, back) flat.
local function skinDetailButtons(details)
  for _, key in ipairs(GW.QUEST_DETAIL_BUTTONS) do skinFlatButton(details[key]) end
  if type(details.BackFrame) == "table" then skinFlatButton(details.BackFrame.BackButton) end
end

-- One quest's details: the art faded (the rewards' tile too), an inset panel, the buttons flat.
local function skinQuestDetails(details)
  if not isFrame(details) then return end
  GW.FadeParts(details, GW.QUEST_DETAIL_ART)
  if type(details.RewardsFrameContainer) == "table" then GW.FadeParts(details.RewardsFrameContainer, { "RewardsFrame" }) end
  T.Panel(details, { inset = true, noSheen = true })
  skinDetailButtons(details)
end

-- The quest panel in the world map, when Vanguard's own quest log is off (the tabs and scroll bars are
-- other streams'): the list and the details of one quest. Left alone while Vanguard's log is on.
function GW.SkinQuestMap(panel)
  if ownQuestLog() then return end
  local list = panel.QuestsFrame
  skinQuestList(list)
  skinQuestDetails(panel.DetailsFrame or (type(list) == "table" and list.DetailsFrame))
end

-- The quest details window (the game's pop-out of one quest): the window skin, when Vanguard's log is off.
function GW.SkinQuestPopup(frame)
  if not ownQuestLog() then GW.Skin(frame) end
end

GW.AddButtons("QuestLogPopupDetailFrame", { "QuestLogPopupDetailFrameAbandonButton", "QuestLogPopupDetailFrameShareButton", "QuestLogPopupDetailFrameTrackButton" })
GW.Add("map", "framed", { "QuestMapFrame" }, GW.SkinQuestMap)
GW.Add("map", "framed", { "QuestLogPopupDetailFrame" }, GW.SkinQuestPopup)

-- Battlefield map -----------------------------------------------------------------------------

-- The battlefield map (loads on demand): its ornate border as the map border (an edge and shadow
-- only, as the border sits over the map), and its tab, the strip that moves it, as a flat button.
function GW.SkinBattlefieldMap(map)
  GW.SkinMapBorder(map.BorderFrame)
  skinFlatButton(_G.BattlefieldMapTab)
end

GW.Add("map", "onDemand", "Blizzard_BattlefieldMap", { "BattlefieldMapFrame" }, GW.SkinBattlefieldMap)
