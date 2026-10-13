-- Game windows, map group: World map, battlefield map, group finder, Legacy system, queue status and calendar, in the
-- Vanguard look. Filled by stream S4 of docs/handoff/RESKIN-PLAN.md; registers with
-- GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgGlyph = ns.FrameState("vgGlyph")
local vgMapWatched = ns.FrameState("vgMapWatched")
local vgQueueHooked = ns.FrameState("vgQueueHooked")
local vgEmptyNote = ns.FrameState("vgEmptyNote")
local vgEmptyWatched = ns.FrameState("vgEmptyWatched")

local T = ns.Theme
local GW = ns.GetModule("Windows")

-- Small helpers ---------------------------------------------------------------------------

-- The textures a button draws as its icon (normal, pushed, disabled, highlight), which a flat tile keeps.
GW.GLYPH_GETTERS = { "GetNormalTexture", "GetPushedTexture", "GetDisabledTexture", "GetHighlightTexture" }

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

-- Empty lists (also used by Modules/WindowsTabs.lua) --------------------------------------------

-- How far an empty list's note keeps from the list's sides (units).
GW.EMPTY_MARGIN = 16

-- A list's note for when it holds nothing: made once, across the middle of the list, wrapped to its width.
function GW.EmptyNote(list)
  if not vgEmptyNote[list] then
    local note = T.Text(list:CreateFontString(nil, "OVERLAY"), "label", "text2")
    note:SetPoint("LEFT", list, "LEFT", GW.EMPTY_MARGIN, 0)
    note:SetPoint("RIGHT", list, "RIGHT", -GW.EMPTY_MARGIN, 0)
    note:SetJustifyH("CENTER")
    vgEmptyNote[list] = note
  end
  return vgEmptyNote[list]
end

-- Shows a list's note with that text while empty is true, and hides it otherwise.
function GW.SetEmptyNote(list, empty, text)
  local note = GW.EmptyNote(list)
  note:SetText(text or "")
  note:SetShown(empty == true)
end

-- Whether a game ScrollBox holds no rows now (its data provider's size, 0 with none); false when it can't tell.
function GW.BoxEmpty(box)
  return type(box.GetDataProviderSize) == "function" and box:GetDataProviderSize() == 0
end

-- Keeps a ScrollBox's empty note right, now, each time the game hands it new rows (SetDataProvider) and as it
-- shows. text is the note's text, or a function that returns it. Watched once per box.
function GW.WatchEmpty(box, text)
  if not isFrame(box) or vgEmptyWatched[box] then return end
  vgEmptyWatched[box] = true
  -- Shows or hides the note for the rows the box holds now.
  local function update() GW.SetEmptyNote(box, GW.BoxEmpty(box), type(text) == "function" and text() or text) end
  update()
  if type(box.SetDataProvider) == "function" and type(hooksecurefunc) == "function" then hooksecurefunc(box, "SetDataProvider", ns.Guard("hook SetDataProvider", update)) end
  box:HookScript("OnShow", ns.Guard("empty note", update))
end

-- World map -----------------------------------------------------------------------------------

-- The "..." on the nav bar's overflow button, made once: the button's own art is gone.
local function overflowGlyph(button)
  if not isFrame(button) or vgGlyph[button] then return end
  vgGlyph[button] = T.Text(button:CreateFontString(nil, "OVERLAY"), "label", "text2")
  vgGlyph[button]:SetPoint("CENTER")
  vgGlyph[button]:SetText("...")
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
  if vgMapWatched[map] or type(hooksecurefunc) ~= "function" then return end
  vgMapWatched[map] = true
  if type(map.SynchronizeDisplayState) == "function" then hooksecurefunc(map, "SynchronizeDisplayState", ns.Guard("hook SynchronizeDisplayState", GW.SkinWorldMap)) end
  local nav = map.NavBar
  if type(nav) == "table" and type(nav.Refresh) == "function" then hooksecurefunc(nav, "Refresh", ns.Guard("hook Refresh", function() skinNavButtons(nav) end)) end
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

-- Group finder --------------------------------------------------------------------------------

-- Extra art on the finder's pages (listing and browse): the browse backdrop, the roles strip, the divider
-- and the activity view's scroll lines (a frame's key fades its textures).
GW.LFG_PAGE_ART = { "BackgroundArt", "RolesSection", "DividerFrame", "ActivityView" }
-- The pages' push buttons by key (the listing's back and post, the browse page's message and invite).
GW.LFG_PAGE_BUTTONS = { "BackButton", "PostButton", "SendMessageButton", "GroupInviteButton" }
-- Where a page's inset panel goes: its Inset frame, else its list (the who list's page has no Inset).
GW.LFG_WELLS = { "Inset", "ScrollBox" }
-- The finder's pages: listing, browse, and the who list (the search view: a search box, a filter and a list).
GW.LFG_PAGES = { "LFGListingFrame", "LFGBrowseFrame", "LFGWhoListFrame" }
-- The pages whose list gets a note while it is empty, and the game's string the note reads: the who list says
-- what the browse page says over an empty result (its NoResultsFound line, which the browse page keeps).
GW.LFG_EMPTY = { LFGWhoListFrame = "LFG_LIST_NO_RESULTS_FOUND" }

-- Fades the art a window's template draws (GW.ART, its own textures too), with no panel: for windows
-- made of several frames, where one panel goes on the outer frame.
function GW.FadeWindowArt(frame)
  T.FadeRegions(frame)
  GW.FadeParts(frame, GW.ART)
  for _, key in ipairs(GW.ART) do
    local part = frame[key]
    if key ~= "Inset" and type(part) == "table" and part.SetAlpha then part:SetAlpha(0) end
  end
  if type(frame.Inset) == "table" and type(frame.Inset.NineSlice) == "table" then frame.Inset.NineSlice:SetAlpha(0) end
end

-- A page's title text in the heading font.
local function dressTitle(page)
  local title = type(page.TitleContainer) == "table" and page.TitleContainer.TitleText
  if type(title) == "table" and title.SetFont then T.Text(title, "heading", false) end
end

-- A page's push buttons and its edit box (the listing's group description), in the theme.
local function dressPage(page)
  for _, key in ipairs(GW.LFG_PAGE_BUTTONS) do skinFlatButton(page[key]) end
  if type(page.GroupRoleButtons) == "table" then skinFlatButton(page.GroupRoleButtons.RolePollButton) end
  local view = page.ActivityView
  if type(view) == "table" and isFrame(view.Comment) then T.EditBox(view.Comment) end
end

-- The inset panel under a page's content, on the first part of GW.LFG_WELLS the page has.
local function panelWell(page)
  for _, key in ipairs(GW.LFG_WELLS) do
    if isFrame(page[key]) then return T.Panel(page[key], { inset = true, noSheen = true }) end
  end
end

-- A page's settings gear (the browse page's OptionsButton) in the finder's control row: T.CONTROL.step left
-- of the close button, level with it, as GW.PlaceControls lines up a window's controls (the game set it under
-- the close button's corner, where Vanguard's close button now sits), on a control's plate.
local function placeGear(page)
  local gear, close = page.OptionsButton, _G.LFGParentFrameCloseButton
  if not isFrame(gear) or not isFrame(close) then return end
  gear:ClearAllPoints()
  gear:SetPoint("CENTER", close, "CENTER", -T.CONTROL.step, 0)
  if gear.CreateTexture then T.ControlPlate(gear) end
end

-- A page's list note for when it is empty (GW.LFG_EMPTY), on the pages that have one.
local function watchEmptyPage(page)
  local key = GW.LFG_EMPTY[page:GetName() or ""]
  if key then GW.WatchEmpty(page.ScrollBox, function() return _G[key] end) end
end

-- One page of the group finder (listing, browse or who list), which fills the finder's window: its template
-- art (the portrait badge and the border too) and extras faded, an inset panel, title, buttons and edit box
-- in the theme, its gear beside the close button and the who list's empty note. The outer window has the panel.
function GW.SkinLFGPage(page)
  GW.FadeWindowArt(page)
  GW.FadeParts(page, GW.LFG_PAGE_ART)
  panelWell(page)
  dressTitle(page)
  dressPage(page)
  placeGear(page)
  watchEmptyPage(page)
end

-- The finder's window: a panel with a shadow, the close button in the theme, and the eye (its portrait)
-- without its static picture (the animations it plays while you are listed stay).
function GW.SkinLFGParent(frame)
  T.Panel(frame, { shadow = true })
  GW.DressClose(frame, _G.LFGParentFrameCloseButton)
  if type(_G.LFGParentFramePortrait) == "table" then GW.FadeParts(_G.LFGParentFramePortrait, { "texture" }) end
end

-- The tooltip the browse list shows for a group.
function GW.SkinLFGTooltip(frame)
  T.Tooltip(frame)
end

GW.Add("map", "onDemand", "Blizzard_GroupFinder_VanillaStyle", { "LFGParentFrame" }, GW.SkinLFGParent)
GW.Add("map", "onDemand", "Blizzard_GroupFinder_VanillaStyle", GW.LFG_PAGES, GW.SkinLFGPage)
GW.Add("map", "onDemand", "Blizzard_GroupFinder_VanillaStyle", { "LFGBrowseSearchEntryTooltip" }, GW.SkinLFGTooltip)

-- Legacy system -------------------------------------------------------------------------------

-- The Legacy window's pages, by key.
GW.LEGACY_PAGES = { "TreePage", "ChallengesPage", "RewardTrackPage" }
-- The art each page draws: its background, and the divider between its list and content.
GW.LEGACY_PAGE_ART = { "Background", "VerticalDivider" }
-- The challenge page's two panes, which get an inset panel.
GW.LEGACY_PANES = { "CategoryList", "DetailPane" }
-- What the challenge list (the detail pane) says while it is empty: a prompt until a category is picked (the game
-- has no line for that), then the game's own no-challenges line (LEGACY_NO_CHALLENGES, its category list's), or ours.
GW.LEGACY_EMPTY = { pick = "Select a category to view its challenges.", none = "No challenges to show here." }

-- The detail pane's empty note, by whether a category is picked (the game keeps the picked one as the pane's info).
local function challengeNote(pane)
  return function()
    if pane.info == nil then return GW.LEGACY_EMPTY.pick end
    return _G.LEGACY_NO_CHALLENGES or GW.LEGACY_EMPTY.none
  end
end

-- One page's background art faded, and an inset panel under each of its panes, the challenge list with its
-- empty note. The talent tree's node buttons, the cards and every other part of the page are the game's.
local function skinLegacyPage(page)
  if not isFrame(page) then return end
  GW.FadeParts(page, GW.LEGACY_PAGE_ART)
  for _, key in ipairs(GW.LEGACY_PANES) do
    if isFrame(page[key]) then T.Panel(page[key], { inset = true, noSheen = true }) end
  end
  if isFrame(page.DetailPane) then GW.WatchEmpty(page.DetailPane.ScrollBox, challengeNote(page.DetailPane)) end
end

-- The Legacy system window (Forever's own: the Adventure, Professions and Progression trees, challenges
-- and a reward track): the window skin, and its three pages. The side tabs and their indicators are
-- another stream's. Decided (design 6.1, option c): this skins the window only; Vanguard's tracker
-- does not list Legacy challenges and the game's tracker is not brought back for them.
function GW.SkinLegacy(frame)
  GW.Skin(frame)
  for _, key in ipairs(GW.LEGACY_PAGES) do skinLegacyPage(frame[key]) end
end

GW.Add("map", "onDemand", "Blizzard_LegacySystem", { "LegacySystemFrame" }, GW.SkinLegacy)

-- Queue status ---------------------------------------------------------------------------------

-- The queue entries showing now (read-only on the game's pool): the gold ring round each assigned spec's icon faded.
local function skinQueueEntries(frame)
  local pool = frame.statusEntriesPool
  if type(pool) ~= "table" or type(pool.EnumerateActive) ~= "function" then return end
  for entry in pool:EnumerateActive() do
    if type(entry.AssignedSpec) == "table" then GW.FadeParts(entry.AssignedSpec, { "Border" }) end
  end
end

-- The queue status panel (the group finder eye's tooltip-like window): a themed tooltip, and again for the entries
-- each time the game rebuilds them (Update, which takes them from a pool). The game's hook is set once.
function GW.SkinQueueStatus(frame)
  T.Tooltip(frame)
  skinQueueEntries(frame)
  if vgQueueHooked[frame] or type(frame.Update) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  vgQueueHooked[frame] = true
  hooksecurefunc(frame, "Update", ns.Guard("hook Update", skinQueueEntries))
end

GW.Add("map", "framed", { "QueueStatusFrame" }, GW.SkinQueueStatus)

-- Calendar ---------------------------------------------------------------------------------------

-- The textures the calendar keeps visible: the selected weekday's glow and the shadow on the month's last day.
GW.CALENDAR_KEEP = { "CalendarWeekdaySelectedTexture", "CalendarLastDayDarkTexture" }
-- The day grid's size (the game makes CalendarDayButton1 to 42).
GW.CALENDAR_DAYS = 42
-- The month buttons, drawn as flat tiles round the icon they show.
GW.CALENDAR_MONTH_BUTTONS = { "CalendarPrevMonthButton", "CalendarNextMonthButton" }
-- The class-totals strip: the totals button and the most class buttons the game makes (CalendarClassButton1 to 11).
GW.CALENDAR_CLASS_BUTTONS = 11
-- Each dialog's close button (the game names them without "Frame", so the registry's lookup misses them).
GW.CALENDAR_CLOSE = {
  CalendarViewHolidayFrame = "CalendarViewHolidayCloseButton", CalendarViewRaidFrame = "CalendarViewRaidCloseButton",
  CalendarViewEventFrame = "CalendarViewEventCloseButton", CalendarCreateEventFrame = "CalendarCreateEventCloseButton",
  CalendarMassInviteFrame = "CalendarMassInviteCloseButton",
}
-- The dialogs' push buttons (themed with the window by the registry) and text boxes.
GW.CALENDAR_BUTTONS = {
  CalendarViewEventFrame = { "CalendarViewEventAcceptButton", "CalendarViewEventTentativeButton", "CalendarViewEventDeclineButton", "CalendarViewEventRemoveButton" },
  CalendarCreateEventFrame = { "CalendarCreateEventInviteButton", "CalendarCreateEventMassInviteButton", "CalendarCreateEventRaidInviteButton", "CalendarCreateEventCreateButton" },
  CalendarMassInviteFrame = { "CalendarMassInviteAcceptButton" }, CalendarEventPickerFrame = { "CalendarEventPickerCloseButton" },
  CalendarTexturePickerFrame = { "CalendarTexturePickerCancelButton", "CalendarTexturePickerAcceptButton" },
}
GW.CALENDAR_EDITS = {
  CalendarCreateEventFrame = { "CalendarCreateEventTitleEdit", "CalendarCreateEventInviteEdit" },
  CalendarMassInviteFrame = { "CalendarMassInviteMinLevelEdit", "CalendarMassInviteMaxLevelEdit" },
}
-- The pictures a dialog keeps: the holiday's art (key Texture of its frame) and the icon on the create dialog.
GW.CALENDAR_PICTURES = { "CalendarCreateEventIcon" }
for name, list in pairs(GW.CALENDAR_BUTTONS) do GW.AddButtons(name, list) end

-- One day of the grid: the parchment on its normal texture faded (the event icons, the date, the highlight and
-- the shadow stay), and an inset panel behind them.
local function skinDay(button)
  if not isFrame(button) then return end
  local back = type(button.GetNormalTexture) == "function" and button:GetNormalTexture()
  if type(back) == "table" then back:SetAlpha(0) end
  T.Panel(button, { inset = true, noSheen = true })
end

-- The textures named in names that this client has, as a set.
local function namedSet(names)
  local set = {}
  for _, name in ipairs(names) do
    if type(_G[name]) == "table" then set[_G[name]] = true end
  end
  return set
end

-- The filter dropdown as a flat button and the class-totals buttons (the totals, then one per class) as icon tiles;
-- each is skipped when this client has no such button.
local function skinCalendarStrip(frame)
  skinFlatButton(_G.CalendarFilterButton or frame.FilterButton)
  GW.SkinGlyphButton(_G.CalendarClassTotalsButton)
  for i = 1, GW.CALENDAR_CLASS_BUTTONS do GW.SkinGlyphButton(_G["CalendarClassButton" .. i]) end
end

-- The calendar window: every texture of its frame faded but the two it keeps (see GW.CALENDAR_KEEP), a panel with a
-- shadow, the close button with the filter button clear of it, the month buttons as tiles, the filter and class
-- buttons and the day grid as inset panels.
function GW.SkinCalendar(frame)
  T.FadeRegions(frame, namedSet(GW.CALENDAR_KEEP))
  T.Panel(frame, { shadow = true })
  GW.DressClose(frame, _G.CalendarCloseButton)
  GW.BesideClose(_G.CalendarFilterButton or frame.FilterButton, _G.CalendarCloseButton)
  for _, name in ipairs(GW.CALENDAR_MONTH_BUTTONS) do GW.SkinGlyphButton(_G[name]) end
  skinCalendarStrip(frame)
  for i = 1, GW.CALENDAR_DAYS do skinDay(_G["CalendarDayButton" .. i]) end
end

-- A calendar dialog's header: its plate faded and its title in the heading font.
local function dressHeader(header)
  if not isFrame(header) then return end
  GW.FadeParts(header, GW.MENU_PLATE)
  if type(header.Text) == "table" then T.Text(header.Text, "heading", false) end
end

-- The window skin with the dialog's pictures (see GW.CALENDAR_PICTURES) left as the game has them.
local function skinKeepingPictures(frame)
  local kept = namedSet(GW.CALENDAR_PICTURES)
  if type(frame.Texture) == "table" then kept[frame.Texture] = true end
  for part in pairs(kept) do kept[part] = part:GetAlpha() end
  GW.Skin(frame)
  for part, alpha in pairs(kept) do part:SetAlpha(alpha) end
end

-- One of the calendar's dialogs: the window skin, the header, the close button and the text boxes it has.
function GW.SkinCalendarDialog(frame)
  local name = frame:GetName()
  skinKeepingPictures(frame)
  dressHeader(frame.Header)
  GW.DressClose(frame, _G[GW.CALENDAR_CLOSE[name] or ""])
  for _, edit in ipairs(GW.CALENDAR_EDITS[name] or {}) do
    if isFrame(_G[edit]) then T.EditBox(_G[edit]) end
  end
end

GW.Add("map", "onDemand", "Blizzard_Calendar", { "CalendarFrame" }, GW.SkinCalendar)
GW.Add("map", "onDemand", "Blizzard_Calendar", {
  "CalendarViewHolidayFrame", "CalendarViewRaidFrame", "CalendarViewEventFrame", "CalendarCreateEventFrame",
  "CalendarMassInviteFrame", "CalendarEventPickerFrame", "CalendarTexturePickerFrame",
}, GW.SkinCalendarDialog)
