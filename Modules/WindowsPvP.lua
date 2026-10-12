-- Game windows, pvp group: Battleground scoreboards, queue dialogs, objective widgets and the match timer, in the
-- Vanguard look. Filled by stream S8 of docs/handoff/RESKIN-PLAN.md; registers with
-- GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.
--
-- Frame names, parentKeys and templates are read from Blizzard's Forever source (Blizzard_PVPMatch,
-- Blizzard_LFGUtil's Mainline PVPHelper and PvpPopup, Blizzard_UIWidgets, Blizzard_FrameXML's Timer,
-- Blizzard_UIPanels_Game's PVPBanner and Camelot PVPRankFrame). Every part is optional: a client without one
-- skips it.

local ADDON, ns = ...

local T = ns.Theme
local GW = ns.GetModule("Windows")

-- Helpers ---------------------------------------------------------------------------------------

-- Frames whose game methods or scripts are already hooked here (a skin runs on every show; a hook goes on once).
local hooked = setmetatable({}, { __mode = "k" })

-- Runs fn(frame) after the frame's game method `name` each time it runs (with script set, after its script
-- handler of that name), once per frame and name; a frame without the method is skipped.
local function after(frame, name, fn, script)
  hooked[frame] = hooked[frame] or {}
  if hooked[frame][name] then return end
  if not script and (type(frame[name]) ~= "function" or type(hooksecurefunc) ~= "function") then return end
  hooked[frame][name] = true
  -- Runs fn on the frame.
  local function run() fn(frame) end
  if script then return frame:HookScript(name, ns.Guard("hook " .. name, run)) end
  hooksecurefunc(frame, name, ns.Guard("hook " .. name, run))
end

-- The first part of frame found under one of keys, or nil.
local function partOf(frame, keys)
  for _, key in ipairs(keys) do
    if type(frame[key]) == "table" then return frame[key] end
  end
end

-- Themes the push buttons a frame keeps under those keys.
local function dressKeys(frame, keys)
  for _, key in ipairs(keys) do
    local button = frame[key]
    if type(button) == "table" and button.CreateTexture then T.Button(button) end
  end
end

-- Scoreboards -----------------------------------------------------------------------------------

-- Where the scoreboard (Content) and the match results (content) keep the table, and its tab strip.
GW.PVP_CONTENT = { "Content", "content" }
GW.PVP_TAB_STRIP = { "TabContainer", "tabContainer" }
-- The match results' push buttons (Queue again, Leave), which its OnLoad keeps on the window.
GW.PVP_PUSH = { "requeueButton", "leaveButton" }
-- The light the results play over their reward band when rewards come in: kept, it is an animation.
GW.PVP_BURST = { "OrangeGlow", "OrangeSmoke" }

-- The table's frame: its backdrop and inset border faded, a flat inset panel behind the rows (the rows, their
-- column headers and the team colour wash over them stay the game's), the edge lines of its tab strip faded.
local function skinTable(content)
  T.FadeRegions(content)
  T.Panel(content, { inset = true, noSheen = true })
  local strip = partOf(content, GW.PVP_TAB_STRIP)
  if strip and strip.GetRegions then T.FadeRegions(strip) end
end

-- The results' reward band: its backdrop and shadow faded, the burst of light the game plays over it kept.
local function skinEarnings(content)
  local band = content.earningsArt
  if type(band) ~= "table" or not band.GetRegions then return end
  local keep = {}
  for _, key in ipairs(GW.PVP_BURST) do
    if type(band[key]) == "table" then keep[band[key]] = true end
  end
  T.FadeRegions(band, keep)
end

-- The scoreboard and the match results: the window skin hugging the frame (the room its border art had is
-- inside the frame), the table, the reward band, the scroll bar and the push buttons; again after the game
-- lays the match's faction border on the frame (SetupArtwork). The tabs are dressed by WindowsTabs.lua.
function GW.SkinPvPMatch(frame)
  GW.Skin(frame, 0)
  local content = partOf(frame, GW.PVP_CONTENT)
  if content then skinTable(content) skinEarnings(content) end
  local bar = frame.ScrollBar or frame.scrollBar
  if type(bar) == "table" then T.ScrollBar(bar) end
  dressKeys(frame, GW.PVP_PUSH)
  after(frame, "SetupArtwork", GW.SkinPvPMatch)
end

-- Blizzard_PVPMatch loads at login on Forever (LoadOnDemand 0); registered on demand as well, so a client
-- that loads it later is covered too.
GW.Add("pvp", "onDemand", "Blizzard_PVPMatch", { "PVPMatchScoreboard", "PVPMatchResults" }, GW.SkinPvPMatch)

-- Queue dialogs ---------------------------------------------------------------------------------

-- The art the dialogs keep as content: the battleground's picture on the ready dialog, the battleground's
-- icon and its ring on the war game and arena invite.
GW.CONTENT_ART.PVPReadyDialog = { "background" }
GW.CONTENT_ART.PVPFramePopup = { "ringIcon", "PVPFramePopupRing" }
GW.AddButtons("PVPReadyDialog", { "PVPReadyDialogEnterBattleButton", "PVPReadyDialogLeaveQueueButton" })
GW.AddButtons("PVPRoleCheckPopup", { "PVPRoleCheckPopupAcceptButton", "PVPRoleCheckPopupDeclineButton" })
GW.AddButtons("PVPFramePopup", { "PVPFramePopupAcceptButton", "PVPFramePopupDeclineButton" })

-- A queue dialog: its dialog border and art faded (its content art kept), a flat panel with a soft shadow hugging
-- it, the close and push buttons themed, and the invite's hide button as a window control with the Minimize glyph.
-- The role buttons keep their art (it is their role icon and check).
function GW.SkinPvPDialog(frame)
  GW.Skin(frame, 0)
  local hide = frame.minimizeButton
  if type(hide) == "table" and hide.CreateTexture then T.WindowControl(hide, "Minimize") end
end

-- The ready popup draws itself on a child (ReadyStatus: the border, the title and the close button): every child
-- of it that has a dialog border is skinned as a dialog.
function GW.SkinPvPReadyPopup(frame)
  for _, child in ipairs({ frame:GetChildren() }) do
    if type(child.Border) == "table" then GW.SkinPvPDialog(child) end
  end
end

GW.Add("pvp", "popups", { "PVPReadyDialog", "PVPRoleCheckPopup", "PVPFramePopup" }, GW.SkinPvPDialog)
GW.Add("pvp", "popups", { "PVPReadyPopup" }, GW.SkinPvPReadyPopup)

-- Objectives and the match timer ----------------------------------------------------------------

-- How far the panel behind a widget container reaches out past its widgets (units).
GW.WIDGET_PAD = 4

-- Whether a widget container shows any widget now: its own count, else whether it holds a frame besides
-- Vanguard's backdrop.
local function hasWidgets(box)
  if type(box.HasAnyWidgetsShowing) == "function" then return box:HasAnyWidgetsShowing() == true end
  return select("#", box:GetChildren()) > 1
end

-- Shows the panel behind a widget container while it shows widgets, and hides it while it is empty.
local function fitBackdrop(box)
  box.vgBackdrop:SetShown(hasWidgets(box))
end

-- Vanguard's backdrop for a widget container: a frame of its own filling the container, at the container's level
-- (the widgets sit above it), left out of the container's layout (else the container could never shrink), with a
-- flat HUD panel.
local function makeBackdrop(box)
  local back = CreateFrame("Frame", nil, box)
  back.ignoreInLayout = true
  back:SetAllPoints(box)
  back:SetFrameLevel(box:GetFrameLevel())
  T.HudPanel(back, { pad = GW.WIDGET_PAD })
  return back
end

-- A widget container (the flags, bases and scores at the top of the screen, the capture bars under the minimap):
-- the panel behind its widgets, shown only while it has some, checked again as the container resizes and after
-- the game lays its widgets out. The widgets themselves stay the game's.
function GW.SkinWidgetBox(box)
  box.vgBackdrop = box.vgBackdrop or makeBackdrop(box)
  fitBackdrop(box)
  after(box, "OnSizeChanged", fitBackdrop, true)
  after(box, "UpdateWidgetLayout", fitBackdrop)
end

GW.Add("pvp", "framed", { "UIWidgetTopCenterContainerFrame", "UIWidgetBelowMinimapContainerFrame" }, GW.SkinWidgetBox)

-- A game font string in the theme font for a text role, at the size the game gave it; its colour left alone.
local function themeFont(fs, role)
  local _, size = fs:GetFont()
  T.Text(fs, role, false)
  if size then T.TextSize(fs, size) end
end

-- One countdown bar of the match timer, once: the theme's bar texture, its border and backdrop faded, a flat HUD
-- panel, and the time in the theme font at the game's size. The big numbers stay the game's.
local function skinTimerBar(timer)
  local bar = timer.bar
  if type(bar) ~= "table" or bar.vgTimer or not bar.SetStatusBarTexture then return end
  bar.vgTimer = true
  T.StyleBar(bar)
  T.FadeRegions(bar, { [bar:GetStatusBarTexture()] = true })
  T.HudPanel(bar)
  if type(bar.timeText) == "table" then themeFont(bar.timeText, "number") end
end

-- The match timer (the countdown before a battleground or arena starts): every bar it holds, now and after each
-- of its events (it makes a bar as a timer starts). Its OnEvent script is hooked: the game set it from XML, so a
-- hook on the global TimerTracker_OnEvent would never run.
function GW.SkinTimerTracker(frame)
  for _, timer in ipairs(frame.timerList or {}) do skinTimerBar(timer) end
  after(frame, "OnEvent", GW.SkinTimerTracker, true)
end

GW.Add("pvp", "framed", { "TimerTracker" }, GW.SkinTimerTracker)

-- The objective banner's texts and their text roles: the objective's name and its flash, and the line under it.
GW.BANNER_TEXTS = { Title = "title", TitleFlash = "title", BonusLabel = "label" }

-- The objective banner (a flag taken, a base assaulted) in the theme font at the game's sizes; its art and its
-- animation stay the game's (the animation sets their alpha).
function GW.SkinPvPBanner(frame)
  for key, role in pairs(GW.BANNER_TEXTS) do
    local fs = frame[key]
    if type(fs) == "table" and fs.SetFont then themeFont(fs, role) end
  end
end

GW.Add("pvp", "framed", { "PvPObjectiveBannerFrame" }, GW.SkinPvPBanner)

-- Honor tab -------------------------------------------------------------------------------------

-- The honor tab's side pane (the rank details): its divider faded and its description's scroll bar in the theme.
-- The tab's own art is faded by WindowsTabs.lua; its rank ring is a Cooldown swipe on Forever, not a status
-- bar, and stays the game's.
function GW.SkinPvPRankPane(frame)
  local pane = frame.DetailFrame
  if type(pane) ~= "table" then return end
  GW.FadeParts(pane, { "Divider" })
  if type(pane.DescriptionScrollBar) == "table" then T.ScrollBar(pane.DescriptionScrollBar) end
end

GW.Add("pvp", "framed", { "PVPRankFrame" }, GW.SkinPvPRankPane)
