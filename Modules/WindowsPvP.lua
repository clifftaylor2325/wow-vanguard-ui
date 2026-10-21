-- Game windows, pvp group: Battleground scoreboards, queue dialogs, objective widgets and the match timer, in the
-- Vanguard look. Filled by stream S8 of docs/handoff/RESKIN-PLAN.md; registers with
-- GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.
--
-- Frame names, parentKeys and templates are read from Blizzard's Forever source (Blizzard_PVPMatch,
-- Blizzard_LFGUtil's Mainline PVPHelper and PvpPopup, Blizzard_UIWidgets, Blizzard_FrameXML's Timer,
-- Blizzard_UIPanels_Game's PVPBanner and Camelot PVPRankFrame). Every part is optional: a client without one
-- skips it.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgBackdrop = ns.FrameState("vgBackdrop")
local vgTimer = ns.FrameState("vgTimer")

local T = ns.Theme
local GW = ns.GetModule("Windows")

-- Helpers ---------------------------------------------------------------------------------------

-- The first part of frame found under one of keys, or nil.
local function partOf(frame, keys)
  for _, key in ipairs(keys) do
    if type(frame[key]) == "table" then return frame[key] end
  end
end

-- A game font string in the theme font for a text role, at the size the game gave it; its colour left alone unless
-- a theme colour is given.
local function themeFont(fs, role, color)
  local _, size = fs:GetFont()
  T.Text(fs, role, color or false)
  if size then T.TextSize(fs, size) end
end

-- The font string under a path of keys from frame (the game's gold headings and labels), in a role and the text colour
-- at the game's size; a part this client lacks is skipped.
local function textAt(frame, path, role)
  local fs = GW.Part(frame, path)
  if fs and fs.GetFont then themeFont(fs, role, "text") end
end

-- Scoreboards -----------------------------------------------------------------------------------

-- Where the scoreboard (Content) and the match results (content) keep the table, and its tab strip.
GW.PVP_CONTENT = { "Content", "content" }
GW.PVP_TAB_STRIP = { "TabContainer", "tabContainer" }
-- The match results' push buttons (Queue again, Leave), which its OnLoad keeps on the window.
GW.PVP_PUSH = { "requeueButton", "leaveButton" }
-- The light the results play over their reward band when rewards come in: kept, it is an animation.
GW.PVP_BURST = { "OrangeGlow", "OrangeSmoke" }
-- Where the table's tab strip keeps the matchmaking line (the scoreboard's and the results' spellings).
GW.PVP_MATCHMAKING = { "MatchmakingText", "matchmakingText" }

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

-- The reward item tiles the results make as the match ends (PVPMatchResultsLoot, from a pool), what a tile keeps:
-- the item's picture and quality ring, its overlays and spec icon, the light and arrows the game plays on it.
local REWARD_KEEP = { "Icon", "IconBorder", "IconOverlay", "IconOverlay2", "SpecIcon", "ItemBurst", "ItemBorderGlow", "GlowSmokeBurst" }
-- The reward tiles already dressed (the pool hands the same buttons out again).
local vgRewards = ns.FrameState("vgRewards")

-- One reward tile as a quiet slot: its drop shadow and spec ring faded, the picture, quality ring and effects kept.
local function dressReward(button)
  if type(button) ~= "table" or not button.GetRegions or vgRewards[button] then return end
  vgRewards[button] = true
  local keep = GW.KeepKeys(button, REWARD_KEEP)
  for _, arrow in ipairs(button.arrows or {}) do keep[arrow] = true end
  T.FadeRegions(button, keep)
  T.Slot(button, { quiet = true })
end

-- Every reward tile the results hold now (run after the game adds one, since the pool gives no event).
local function dressRewards(frame)
  GW.EachActive(frame.itemPool, dressReward)
end

-- The results' title (Victory, Defeat): the heading font and the text colour at the game's big size, its place unchanged.
local function skinMatchTitle(title)
  if type(title) ~= "table" or not title.GetFont then return end
  local _, size = title:GetFont()
  GW.SkinTitle(title)
  if size then T.TextSize(title, size) end
end

-- The results' texts: the title, the Rewards and Progress headings, and the matchmaking line under the table (the
-- scoreboard's has the same).
local function skinMatchTexts(frame, content)
  skinMatchTitle(frame.header)
  textAt(content, "earningsContainer.rewardsContainer.header", "heading")
  textAt(content, "earningsContainer.progressContainer.header", "heading")
  local strip = partOf(content, GW.PVP_TAB_STRIP)
  local line = strip and partOf(strip, GW.PVP_MATCHMAKING)
  if line and line.GetFont then themeFont(line, "label", "text") end
end

-- The scoreboard and the match results: the window skin hugging the frame (the room its border art had is
-- inside the frame), the table, the reward band, the faction banner over the top edge, the scroll bar and the push
-- buttons; again after the game lays the match's faction border on the frame (SetupArtwork). The tabs are dressed by
-- WindowsTabs.lua.
function GW.SkinPvPMatch(frame)
  GW.Skin(frame, 0)
  GW.FadeParts(frame.overlay or {}, { "decorator" })
  local content = partOf(frame, GW.PVP_CONTENT)
  if content then skinTable(content) skinEarnings(content) skinMatchTexts(frame, content) end
  local bar = frame.ScrollBar or frame.scrollBar
  if type(bar) == "table" then T.ScrollBar(bar) end
  GW.EachKey(frame, GW.PVP_PUSH, GW.SkinButton)
  dressRewards(frame)
  GW.HookAfter(frame, "SetupArtwork", GW.SkinPvPMatch)
  GW.HookAfter(frame, "AddItemReward", dressRewards)
end

-- Blizzard_PVPMatch loads at login on Forever (LoadOnDemand 0); registered on demand as well, so a client
-- that loads it later is covered too.
GW.AddOnDemand("pvp", "Blizzard_PVPMatch", { "PVPMatchScoreboard", "PVPMatchResults" }, GW.SkinPvPMatch)

-- Queue dialogs ---------------------------------------------------------------------------------

-- The art the dialogs keep as content: the battleground's picture on the ready dialog, the battleground's
-- icon and its ring on the war game and arena invite.
GW.CONTENT_ART.PVPReadyDialog = { "background" }
GW.CONTENT_ART.PVPFramePopup = { "ringIcon", "PVPFramePopupRing" }
GW.AddButtons("PVPReadyDialog", { "PVPReadyDialogEnterBattleButton", "PVPReadyDialogLeaveQueueButton" })
GW.AddButtons("PVPRoleCheckPopup", { "PVPRoleCheckPopupAcceptButton", "PVPRoleCheckPopupDeclineButton" })
GW.AddButtons("PVPFramePopup", { "PVPFramePopupAcceptButton", "PVPFramePopupDeclineButton" })

-- The ready dialog's battleground heading and status line under it, and its role's name beside the role icon.
local READY_TEXTS = { { "instanceInfo.name", "heading" }, { "instanceInfo.statusText", "label" }, { "roleLabel", "name" } }
-- The role check popup's three role buttons, each holding a check box.
local ROLE_BUTTONS = { "TankIcon", "HealerIcon", "DPSIcon" }

-- The ready dialog's parts: the rule under the battleground's name faded (the child holds only that texture) and its
-- gold texts in the text colour.
local function skinReadyParts(frame)
  GW.FadeParts(frame, { "instanceInfo" })
  for _, text in ipairs(READY_TEXTS) do GW.SkinText(GW.Part(frame, text[1]), text[2], "text") end
end

-- A role button's check box (the role icon and its shortage and lock art stay) as a theme check box.
local function skinRoleCheck(role)
  local box = type(role) == "table" and role.checkButton
  if type(box) == "table" and box.GetRegions and box.HookScript then T.CheckBox(box) end
end

-- A queue dialog: its dialog border and art faded (its content art kept), a flat panel with a soft shadow hugging
-- it, the close and push buttons themed (the ready dialog's close button is a hide button: GW.HIDE_BUTTONS), the invite's
-- hide button as a window control with the Minimize glyph, the ready dialog's heading and texts, and the role check
-- popup's check boxes. The role buttons keep their art (it is their role icon).
function GW.SkinPvPDialog(frame)
  GW.Skin(frame, 0)
  local hide = frame.minimizeButton
  if type(hide) == "table" and hide.CreateTexture then T.WindowControl(hide, "Minimize") end
  skinReadyParts(frame)
  GW.EachKey(frame, ROLE_BUTTONS, skinRoleCheck)
end

-- The ready popup draws itself on a child (ReadyStatus: the border, the title and the close button): every child
-- of it that has a dialog border is skinned as a dialog.
function GW.SkinPvPReadyPopup(frame)
  for _, child in ipairs({ frame:GetChildren() }) do
    if type(child.Border) == "table" then GW.SkinPvPDialog(child) end
  end
end

GW.Add("pvp", { "PVPReadyDialog", "PVPRoleCheckPopup", "PVPFramePopup" }, GW.SkinPvPDialog)
GW.Add("pvp", { "PVPReadyPopup" }, GW.SkinPvPReadyPopup)

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
  vgBackdrop[box]:SetShown(hasWidgets(box))
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
  vgBackdrop[box] = vgBackdrop[box] or makeBackdrop(box)
  fitBackdrop(box)
  GW.HookScriptOnce(box, "OnSizeChanged", "hook OnSizeChanged", fitBackdrop)
  GW.HookAfter(box, "UpdateWidgetLayout", fitBackdrop)
end

GW.Add("pvp", { "UIWidgetTopCenterContainerFrame", "UIWidgetBelowMinimapContainerFrame" }, GW.SkinWidgetBox)

-- One countdown bar of the match timer, once: the theme's bar texture, its border and backdrop faded, a flat HUD
-- panel, and the time in the theme font at the game's size. The big numbers stay the game's.
local function skinTimerBar(timer)
  local bar = timer.bar
  if type(bar) ~= "table" or vgTimer[bar] or not bar.SetStatusBarTexture then return end
  vgTimer[bar] = true
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
  GW.HookScriptOnce(frame, "OnEvent", "hook OnEvent", GW.SkinTimerTracker)
end

GW.Add("pvp", { "TimerTracker" }, GW.SkinTimerTracker)

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

GW.Add("pvp", { "PvPObjectiveBannerFrame" }, GW.SkinPvPBanner)

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

GW.Add("pvp", { "PVPRankFrame" }, GW.SkinPvPRankPane)
