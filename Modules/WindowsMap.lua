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
local vgHeaderGlyph = ns.FrameState("vgHeaderGlyph")
local vgHeadersWatched = ns.FrameState("vgHeadersWatched")
local vgRewardsWatched = {}

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

-- A button's template art faded, its label kept, as a flat button (the nav bar's crumbs).
local function skinFlatButton(button)
  if isFrame(button) then T.Button(button) end
end

-- A button whose picture is a texture under `key` (an Icon, an Art, a Texture): a theme button that keeps it shown.
local function keepArt(button, key)
  if not isFrame(button) then return end
  T.Button(button)
  GW.ShowTexture(button[key])
end

-- A button whose picture is its normal and pushed textures (the quest panel's toggle): a theme button that keeps both.
local function glyphButton(button)
  GW.SkinGlyph(button)
  GW.ShowTexture(type(button) == "table" and type(button.GetPushedTexture) == "function" and button:GetPushedTexture() or nil)
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

-- One nav bar button (home, the overflow, a crumb): flat, its label in the text colour, and its dropdown arrow (the
-- MenuArrowButton, whose Art is the arrow) a theme button that keeps it.
local function skinCrumb(button)
  skinFlatButton(button)
  if not isFrame(button) then return end
  GW.SkinText(button.text, "label", "text")
  GW.SkinGlyph(button.MenuArrowButton)
  GW.ShowTexture(GW.Part(button, "MenuArrowButton.Art"))
end

-- The nav bar's buttons: home, overflow, and every crumb it holds now.
local function skinNavButtons(nav)
  local overflow = nav.overflowButton or nav.overflow
  for _, button in ipairs({ nav.homeButton or nav.home, overflow }) do skinCrumb(button) end
  for _, button in ipairs(nav.navList or {}) do skinCrumb(button) end
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

-- The map's quest log toggle (open and close buttons) as theme buttons keeping their arrows.
function GW.SkinSideToggle(toggle)
  if type(toggle) ~= "table" then return end
  glyphButton(toggle.OpenButton)
  glyphButton(toggle.CloseButton)
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

-- The map's floor dropdown: a child the game makes without a key (WorldMapFloorNavigationFrameTemplate), found by
-- one of its mixin's methods.
local function floorDropdown(map)
  for _, child in ipairs({ map:GetChildren() }) do
    if type(child.ShouldShowTrackingIconOnFloor) == "function" then return child end
  end
end

-- The map's overlay buttons: the floor dropdown (its arrow kept), the tracking filter and the tracking pin (its disc
-- and ring faded, its pin kept), the last two on a control tile each.
local function skinMapButtons(map)
  GW.SkinDropdown(floorDropdown(map))
  GW.SkinPlate(map.WorldMapTrackingOptionsButton)
  if type(map.WorldMapTrackingPinButton) == "table" then GW.FadeParts(map.WorldMapTrackingPinButton, { "Background", "Border" }) end
  GW.SkinPlate(map.WorldMapTrackingPinButton)
end

-- The world map: its border, the fill behind the canvas, the overscroll art, nav bar, overlay buttons and quest toggle.
-- The canvas (ScrollContainer) and the coordinate line Modules/Waypoints.lua adds stay as they are.
function GW.SkinWorldMap(map)
  GW.SkinMapBorder(map.BorderFrame)
  T.Panel(map, { noBorder = true, noSheen = true })
  GW.FadeParts(map, { "OverscrollBG" })
  GW.SkinNavBar(map.NavBar)
  skinMapButtons(map)
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

-- The quest list's tools: the search box (its magnifier kept), the settings gear on a control tile, and the quest count's
-- box (QuestLogCount, a frame of search-box art) with its figure small and light.
local function skinQuestTools(scroll)
  if type(scroll) ~= "table" then return end
  GW.SkinSearch(scroll.SearchBox)
  GW.SkinPlate(scroll.SettingsDropdown)
  if isFrame(_G.QuestLogCount) then T.EditBox(_G.QuestLogCount) end
  GW.SkinText(_G.QuestLogQuestCount, "small", "text2")
end

-- The quest list's panel: its ornate border, scroll background and edge faded, an inset panel, its tools in the theme.
local function skinQuestList(list)
  if not isFrame(list) then return end
  GW.FadeParts(list, { "BorderFrame" })
  if type(list.ScrollFrame) == "table" then GW.FadeParts(list.ScrollFrame, { "Background", "Edge" }) end
  T.Panel(list, { inset = true, noSheen = true })
  skinQuestTools(list.ScrollFrame)
end

-- One details button flat, its label in the label role: light text, or `bad` for the danger kind (Abandon).
local function skinDetailButton(button, token)
  if not isFrame(button) then return end
  T.Button(button)
  GW.SkinText(button.GetFontString and button:GetFontString(), "label", token)
end

-- The details panel's buttons (abandon, share, track, back) flat; Abandon is the danger kind.
local function skinDetailButtons(details)
  for _, key in ipairs(GW.QUEST_DETAIL_BUTTONS) do skinDetailButton(details[key], key == "AbandonButton" and "bad" or "text") end
  if type(details.BackFrame) == "table" then skinDetailButton(details.BackFrame.BackButton, "text") end
end

-- The plates behind a reward tile's name and the XP tile's figure (the dark boxes with a gold edge): faded.
GW.QUEST_REWARD_PLATES = { "NameFrame", "ReputationBG" }
-- How many reward tiles (QuestInfoItem1-10) the quest panels can show.
GW.QUEST_REWARD_TILES = 10

-- One reward tile (an item the quest gives or lets you choose): its plate faded, the item look on its icon.
local function skinRewardTile(tile)
  if not isFrame(tile) then return end
  GW.FadeParts(tile, GW.QUEST_REWARD_PLATES)
  if tile.CreateTexture and tile.Icon then GW.SkinItem(tile) end
end

-- Every reward tile the game has made so far, and the XP tile (QuestInfoXPFrame), flat like the item slots (the game
-- makes them as a quest is shown, so this runs after QuestInfo_Display).
function GW.SkinQuestRewards()
  for i = 1, GW.QUEST_REWARD_TILES do skinRewardTile(_G["QuestInfoItem" .. i]) end
  skinRewardTile(_G.QuestInfoXPFrame)
end

-- Keeps the reward tiles dressed after each QuestInfo_Display, hooked once.
local function watchQuestRewards()
  GW.SkinQuestRewards()
  if vgRewardsWatched.done or type(_G.QuestInfo_Display) ~= "function" then return end
  vgRewardsWatched.done = true
  hooksecurefunc("QuestInfo_Display", ns.Guard("hook QuestInfo_Display rewards", GW.SkinQuestRewards))
end

-- One quest's details: the art faded (the rewards' tile too), an inset panel, the buttons flat, the Rewards heading light.
local function skinQuestDetails(details)
  if not isFrame(details) then return end
  GW.FadeParts(details, GW.QUEST_DETAIL_ART)
  if type(details.RewardsFrameContainer) == "table" then GW.FadeParts(details.RewardsFrameContainer, { "RewardsFrame" }) end
  T.Panel(details, { inset = true, noSheen = true })
  skinDetailButtons(details)
  GW.SkinText(GW.Part(details, "RewardsFrameContainer.RewardsFrame.Label"), "heading", "text")
  watchQuestRewards()
end

-- A zone header row of the game's quest list: a button with its title (ButtonText) and a CollapseButton.
local function isZoneHeader(row)
  return type(row) == "table" and type(row.ButtonText) == "table" and type(row.CollapseButton) == "table"
end

-- Whether the zone under a header is folded, from the quest log entry the header stands for (false when unknown).
local function headerCollapsed(header)
  local index = header.questLogIndex
  local info = type(index) == "number" and C_QuestLog and C_QuestLog.GetInfo and C_QuestLog.GetInfo(index)
  return type(info) == "table" and info.isCollapsed == true
end

-- A header's chevron (made once, over its collapse button): Down while the zone is open, Right while folded.
local function headerGlyph(header)
  if not vgHeaderGlyph[header] then
    vgHeaderGlyph[header] = T.Tint(T.Snap(header:CreateTexture(nil, "OVERLAY")), "text")
    T.PixelSize(vgHeaderGlyph[header], 12, 12, true)
    vgHeaderGlyph[header]:SetPoint("CENTER", header.CollapseButton, "CENTER")
  end
  vgHeaderGlyph[header]:SetTexture(T.Icon(headerCollapsed(header) and "Right" or "Down"))
end

-- One zone header in the theme: the game's yellow bar (the collapseExpand atlas) and its button's art faded, the chevron.
local function skinZoneHeader(header)
  T.FadeRegions(header)
  T.FadeRegions(header.CollapseButton)
  headerGlyph(header)
end

-- The pictures a quest title row keeps (its quest type tag, storyline mark and task icon): the rest of its art is faded.
GW.TITLE_KEEP = { "TagTexture", "StorylineTexture", "TaskIcon" }

-- Whether a row is a quest title row (a button with a track Checkbox and a TagTexture; a zone header has neither).
local function isTitleRow(row)
  return type(row) == "table" and type(row.Checkbox) == "table" and type(row.TagTexture) == "table"
end

-- One quest title row: a theme row (the game's yellow glow faded, the hover wash in its place) keeping its icons, and its
-- track box (QuestLogTrackCheckboxTemplate, a frame whose CheckMark the game shows) a theme check box following that mark.
local function skinTitleRow(row)
  GW.DressRow(row, GW.TITLE_KEEP)
  local box = row.Checkbox
  if isFrame(box) then T.CheckBox(box, { mark = box.CheckMark }) end
end

-- The rule between quest groups (Contents.Separator.Divider, which the game shows as it lays the list out) as one pixel of `divider`.
local function skinSeparator(contents)
  local divider = GW.Part(contents, "Separator.Divider")
  if divider then T.Divider(divider) end
end

-- Every zone header and quest title row the quest list holds now (the game makes and reuses them as the list is drawn),
-- and the rule between groups.
function GW.SkinQuestHeaders(contents)
  if type(contents) ~= "table" or not contents.GetChildren then return end
  for _, row in ipairs({ contents:GetChildren() }) do
    if isZoneHeader(row) then skinZoneHeader(row) elseif isTitleRow(row) then skinTitleRow(row) end
  end
  skinSeparator(contents)
end

-- Keeps the headers dressed: now, each time the list shows, and after each redraw of the quest list. Watched once.
local function watchQuestHeaders(scroll)
  local contents = type(scroll) == "table" and scroll.Contents
  if type(contents) ~= "table" or vgHeadersWatched[contents] then return end
  vgHeadersWatched[contents] = true
  GW.SkinQuestHeaders(contents)
  if scroll.HookScript then scroll:HookScript("OnShow", ns.Guard("quest headers", function() GW.SkinQuestHeaders(contents) end)) end
  if type(QuestLogQuests_Update) ~= "function" then return end
  hooksecurefunc("QuestLogQuests_Update", ns.Guard("hook QuestLogQuests_Update", function() GW.SkinQuestHeaders(contents) end))
end

-- The quest panel in the world map (the tabs and scroll bars are other streams'): the list and the details of one
-- quest. Dressed whether or not Vanguard's quest log is on, as its Map button opens the game's details here.
function GW.SkinQuestMap(panel)
  local list = panel.QuestsFrame
  skinQuestList(list)
  skinQuestDetails(panel.DetailsFrame or (type(list) == "table" and list.DetailsFrame))
  watchQuestHeaders(type(list) == "table" and list.ScrollFrame or QuestScrollFrame)
end

-- The pop-out's text area on an inset, and its Show Map button keeping its map glyph with a light label.
local function skinPopupParts(frame)
  if isFrame(frame.ScrollFrame) then T.Panel(frame.ScrollFrame, { inset = true, noSheen = true }) end
  keepArt(frame.ShowMapButton, "Texture")
  GW.SkinText(GW.Part(frame, "ShowMapButton.Text"), "label", "text")
end

-- The quest details window (the game's pop-out of one quest): the window skin and its parts, when Vanguard's log is off.
function GW.SkinQuestPopup(frame)
  if ownQuestLog() then return end
  GW.Skin(frame)
  skinPopupParts(frame)
end

GW.AddButtons("QuestLogPopupDetailFrame", { "QuestLogPopupDetailFrameAbandonButton", "QuestLogPopupDetailFrameShareButton", "QuestLogPopupDetailFrameTrackButton" })
GW.Add("map", "framed", { "QuestMapFrame" }, GW.SkinQuestMap)
GW.Add("map", "framed", { "QuestLogPopupDetailFrame" }, GW.SkinQuestPopup)

-- Battlefield map -----------------------------------------------------------------------------

-- The battlefield map (loads on demand): its ornate border as the map border (an edge and shadow
-- only, as the border sits over the map), and its tab, the strip that moves it, as a flat button with a light label.
function GW.SkinBattlefieldMap(map)
  GW.SkinMapBorder(map.BorderFrame)
  skinFlatButton(_G.BattlefieldMapTab)
  GW.SkinText(GW.Part(_G, "BattlefieldMapTab.Text"), "small", "text")
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

-- A page's title text in the title role.
local function dressTitle(page)
  GW.SkinTitle(type(page.TitleContainer) == "table" and page.TitleContainer.TitleText)
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

-- The listing page -------------------------------------------------------------------------------

-- A role button (tank, healer, damage; the group's one): the game's plate faded, its icon (the normal texture) and the dimming
-- cover kept on a raised tile, its check box (the solo roles have one) in the theme.
local function skinRole(role)
  if not isFrame(role) then return end
  local keep = glyphTextures(role)
  if type(role.cover) == "table" then keep[role.cover] = true end
  T.FadeRegions(role, keep)
  T.Panel(role, { raised = true, noSheen = true })
  GW.SkinCheck(role.CheckButton)
end

-- The roles strip: the solo role buttons, or the group's role icon with its role dropdown (its arrow kept).
local function skinRoles(page)
  local solo, group = page.SoloRoleButtons, page.GroupRoleButtons
  for _, role in ipairs(type(solo) == "table" and type(solo.RoleButtons) == "table" and solo.RoleButtons or {}) do skinRole(role) end
  if type(group) ~= "table" then return end
  skinRole(group.RoleIcon)
  GW.SkinDropdown(group.RoleDropdown)
end

-- One category picker: the game's frame art faded (its picture kept) under a raised tile, its name a heading.
local function skinCategoryButton(button)
  if not isFrame(button) then return end
  T.FadeRegions(button, GW.KeepKeys(button, { "Icon" }))
  T.Panel(button, { raised = true, noSheen = true })
  GW.SkinText(button.Label, "heading", "text")
end

-- The category pickers the view holds now (the game makes one for each category as they appear).
local function skinCategories(view)
  if type(view) ~= "table" or type(view.CategoryButtons) ~= "table" then return end
  for _, button in ipairs(view.CategoryButtons) do skinCategoryButton(button) end
end

-- Whether the game's category updater is hooked (a global it runs on the listing's category view).
local categoriesHooked = false

-- Dresses the category pickers now and after each time the game lays them out. Hooked once.
local function watchCategories(page)
  skinCategories(page.CategoryView)
  if categoriesHooked or type(_G.LFGListingCategorySelection_UpdateCategoryButtons) ~= "function" then return end
  categoriesHooked = true
  hooksecurefunc("LFGListingCategorySelection_UpdateCategoryButtons", ns.Guard("hook category buttons", skinCategories))
end

-- The group description box's old scroll bar (UIPanelScrollFrameTemplate: a slider with a thumb picture and arrow buttons).
local function skinCommentBar(view)
  local bar = type(view.Comment) == "table" and view.Comment.ScrollBar
  if type(bar) == "table" then T.ScrollBar(bar) end
end

-- The activity view: its play style and voice chat dropdowns (arrows kept), the voice chat label, the level box, the
-- description's scroll bar and the check box of each activity row (as the list acquires it).
local function skinActivityView(view)
  if type(view) ~= "table" then return end
  skinCommentBar(view)
  GW.SkinDropdown(view.PlayStyleDropdown)
  GW.SkinDropdown(view.VoiceChatDropdown)
  GW.SkinText(view.VoiceChatLabel, "small", "text")
  GW.SkinCheck(GW.Part(view, "LevelRangesCheckbox.Checkbox"))
  GW.WatchRows(view.ScrollBox, function(row) GW.SkinCheck(row.CheckButton) end)
end

-- The line between the roles strip and the list as one pixel of `divider` (the page's art was faded with its frame).
local function skinDivider(page)
  local divider = GW.Part(page, "DividerFrame.Divider")
  if divider then T.Divider(divider) end
end

-- The listing page's own parts: the roles, the new player check box, the category pickers, the activity view and the divider.
local function skinListing(page)
  skinRoles(page)
  GW.SkinCheck(GW.Part(page, "NewPlayerFriendlyButton.CheckButton"))
  watchCategories(page)
  skinActivityView(page.ActivityView)
  skinDivider(page)
end

-- The browse and who pages -------------------------------------------------------------------------

-- The pictures a browse row keeps: the leader, class and newcomer marks, the discord mark and the group header's plus and minus.
GW.BROWSE_KEEP = { "PartyIcon", "DiscordIcon", "ClassIcon", "NewPlayerFriendlyIcon", "ExpandIcon", "CollapseIcon" }

-- One browse row (a group, a nested group or a group header): a theme row, its plate and glows faded, showing the selected
-- look the game's Selected glow stands for, and its delist button keeping its X.
local function skinBrowseRow(row)
  GW.DressRow(row, GW.BROWSE_KEEP)
  GW.FollowMark(row, row.Selected)
  keepArt(GW.Part(row, "DataDisplay.DelistButton"), "Icon")
end

-- Whether the game's browse row selection is hooked (a global it runs when a row is selected or unselected).
local browseHooked = false

-- Has a browse row's selected look follow the game's SetSelection of it (a row not dressed is left alone). Hooked once.
local function watchBrowseSelection()
  if browseHooked or type(_G.LFGBrowseSearchEntry_SetSelection) ~= "function" then return end
  browseHooked = true
  hooksecurefunc("LFGBrowseSearchEntry_SetSelection", ns.Guard("hook browse selection", function(row, on) T.SelectRow(row, on == true) end))
end

-- The browse page's own parts: its two dropdowns (arrows kept), the refresh button (its picture kept) and its rows.
local function skinBrowse(page)
  GW.SkinDropdown(page.CategoryDropdown)
  GW.SkinDropdown(page.ActivityDropdown)
  keepArt(page.RefreshButton, "Icon")
  GW.WatchRows(page.ScrollBox, skinBrowseRow)
  watchBrowseSelection()
end

-- One who-list row: a theme row (its plate and glows faded) showing the selected look the game's SetSelected sets, and its
-- invite button keeping its picture.
local function skinWhoRow(row)
  GW.DressRow(row)
  GW.FollowMark(row, row.Selected)
  GW.HookAfter(row, "SetSelected", function(r, on) T.SelectRow(r, on == true) end)
  keepArt(row.InviteButton, "Icon")
end

-- The who page's own parts: the search box (magnifier kept), the search button (picture kept), the filter dropdown with a
-- light label, the total line and the rows.
local function skinWho(page)
  GW.SkinSearch(page.EditBox)
  keepArt(page.WhoSearch, "Icon")
  skinFlatButton(page.FilterDropdown)
  GW.SkinText(GW.Part(page, "FilterDropdown.Text"), "label", "text")
  GW.SkinText(page.WhoFrameTotals, "small", "text2")
  GW.WatchRows(page.ScrollBox, skinWhoRow)
end

-- Each page's own parts, by the page's name.
local LFG_OWN = { LFGListingFrame = skinListing, LFGBrowseFrame = skinBrowse, LFGWhoListFrame = skinWho }

-- The parts only the page of that name has, in the theme.
local function dressOwnParts(page)
  local skin = LFG_OWN[page:GetName() or ""]
  if skin then skin(page) end
end

-- One page of the group finder (listing, browse or who list), which fills the finder's window: its template
-- art (the portrait badge and the border too) and extras faded, an inset panel, title, buttons and edit box
-- in the theme, its gear beside the close button and the who list's empty note, and the parts only that page has (the roles
-- and categories, the browse rows, the who rows). The outer window has the panel.
function GW.SkinLFGPage(page)
  GW.FadeWindowArt(page)
  GW.FadeParts(page, GW.LFG_PAGE_ART)
  panelWell(page)
  dressTitle(page)
  dressPage(page)
  placeGear(page)
  watchEmptyPage(page)
  dressOwnParts(page)
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
-- The art each page draws and loses: its background (the divider between its list and content is T.Divider's).
GW.LEGACY_PAGE_ART = { "Background" }
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

-- One page's background art faded, the divider between its list and content one pixel of `divider`, an inset panel
-- under each of its panes and the challenge list's empty note. The talent tree's node buttons are the game's.
local function skinLegacyPage(page)
  if not isFrame(page) then return end
  GW.FadeParts(page, GW.LEGACY_PAGE_ART)
  if isFrame(page.VerticalDivider) then T.Divider(page.VerticalDivider, { vertical = true }) end
  for _, key in ipairs(GW.LEGACY_PANES) do
    if isFrame(page[key]) then T.Panel(page[key], { inset = true, noSheen = true }) end
  end
  if isFrame(page.DetailPane) then GW.WatchEmpty(page.DetailPane.ScrollBox, challengeNote(page.DetailPane)) end
end

-- The art of a tree card the theme keeps: the icon (its normal, highlight and pushed textures) and the ring round it.
GW.LEGACY_CARD_KEEP = { "NormalTexture", "HighlightTexture", "PushedTexture", "Ring" }

-- A tree card's selected look (the rail and fill of a selected row) while it is the picked tree (the game's checked state).
local function markTreeCard(card)
  if type(card.GetChecked) == "function" then T.SelectRow(card, card:GetChecked() and true or false) end
end

-- One tree card (a ringed icon button on a plate): the plate and glow faded, the icon and ring kept, on a raised tile
-- that shows the selected look while its tree is the picked one (the game refreshes that in RefreshSelectionVisuals).
local function skinTreeCard(card)
  if not isFrame(card) then return end
  T.FadeRegions(card, GW.KeepKeys(card, GW.LEGACY_CARD_KEEP))
  T.Panel(card, { raised = true, noSheen = true })
  T.Row(card)
  markTreeCard(card)
  GW.HookAfter(card, "RefreshSelectionVisuals", markTreeCard)
end

-- Every tree card the picker holds now (the game keeps them in a pool under TreeSelections).
local function skinTreeCards(panel)
  if not isFrame(panel.TreeSelections) then return end
  for _, card in ipairs({ panel.TreeSelections:GetChildren() }) do skinTreeCard(card) end
end

-- The tree picker: its cards now, and again each time the game rebuilds them (RefreshTreeButtons).
local function skinTreePicker(panel)
  if not isFrame(panel) then return end
  skinTreeCards(panel)
  GW.HookAfter(panel, "RefreshTreeButtons", skinTreeCards)
end

-- The trait panel's controls: Apply a theme button, Reset and Undo icon buttons keeping their pictures, the search
-- box with its magnifier. The panel itself is the game's: it spans the page and would cover the close button's corner.
local function skinTraitPanel(panel)
  if not isFrame(panel) then return end
  skinFlatButton(panel.ApplyButton)
  keepArt(panel.ResetButton, "Icon")
  keepArt(panel.UndoButton, "Icon")
  GW.SkinSearch(panel.SearchBox)
end

-- The tree page: the picker's cards, the points badge as an inset (its plate faded) and the trait panel's controls.
local function skinTreePage(page)
  if not isFrame(page) then return end
  skinTreePicker(page.LegacyTreeSelectionPanel)
  skinTraitPanel(page.LegacyTreeTraitPanel)
  local summary = page.LegacyTreePointSummary
  if not isFrame(summary) then return end
  GW.FadeParts(summary, { "Border" })
  T.Panel(summary, { inset = true, noSheen = true })
end

-- A category row's selected look, following the flag the game keeps on it (SetSelected).
local function followCategory(row)
  T.SelectRow(row, row.selected == true)
end

-- A category row's plus or minus in the text colour, the game's art on its button faded.
local function skinCollapse(button)
  if not isFrame(button) then return end
  T.FadeRegions(button, GW.KeepKeys(button, { "Icon" }))
  if type(button.Icon) == "table" then T.Tint(button.Icon, "text") end
end

-- One category row of the challenge list: a theme row (the game's bars faded, the unseen-challenges dot kept) lit while
-- the game has the category selected, its plus or minus in the text colour.
local function skinCategory(row)
  GW.DressRow(row, { "NotificationIcon" })
  skinCollapse(row.CollapseButton)
  followCategory(row)
  GW.HookAfter(row, "SetSelected", followCategory)
end

-- The challenge list's top: the filter dropdown (its label light), the search box and the no-challenges line, and
-- every row the box holds or is given.
local function skinCategoryList(list)
  if not isFrame(list) then return end
  GW.SkinDropdown(list.FilterDropdown)
  GW.SkinText(GW.Part(list, "FilterDropdown.Text"), "label", "text")
  GW.SkinSearch(list.SearchBox)
  GW.SkinText(list.NoResultsText, "label", "text2")
  GW.WatchRows(list.ScrollBox, skinCategory)
end

-- The art of a challenge card that is replaced by the card's own panel: its plates, tiles, selection glow and ribbon.
GW.CHALLENGE_ART = { "Background", "BackgroundTop", "BackgroundMiddle", "BackgroundBottom", "SelectedOverlay", "TitleBar" }

-- A challenge card's selected look (the rail and fill of a selected row) while the game has it selected (opened).
local function markChallenge(card)
  T.SelectRow(card, type(card.IsSelected) == "function" and card:IsSelected() == true)
end

-- One challenge card: its plates faded, a card in the theme with the selected look while selected (the game refreshes
-- that in RefreshStateArt), and its Track box a theme check box. The icon, points badge and texts are the game's.
local function skinChallenge(card)
  if not isFrame(card) then return end
  GW.FadeParts(card, GW.CHALLENGE_ART)
  T.Panel(card)
  T.Row(card)
  GW.SkinCheck(card.Tracked)
  markChallenge(card)
  GW.HookAfter(card, "RefreshStateArt", markChallenge)
end

-- One objective of an open challenge: its bar art faded and, for a counted one, the progress bar a theme track.
local function skinCriteria(row)
  GW.FadeParts(row, { "Background", "ProgressBarBackground" })
  GW.SkinProgress(row.ProgressBar)
end

-- The objectives the game shows under an open challenge (one frame it moves between cards, its rows pooled): each active row.
local function skinObjectives(objectives)
  local pool = objectives.criteriaPool
  if type(pool) ~= "table" or type(pool.EnumerateActive) ~= "function" then return end
  for row in pool:EnumerateActive() do skinCriteria(row) end
end

-- The challenges page: the category list, the cards, and the points bar (its track art faded, a theme bar).
local function skinChallengesPage(page)
  if not isFrame(page) then return end
  skinCategoryList(page.CategoryList)
  if isFrame(page.DetailPane) then GW.WatchRows(page.DetailPane.ScrollBox, skinChallenge) end
  local summary = page.LegacyChallengePointSummary
  if not isFrame(summary) then return end
  GW.FadeParts(summary, { "ProgressBarBackground" })
  GW.SkinProgress(summary.PointsBar)
end

-- One reward card: the plate, level diamond and icon ring faded, the reward's icon and the earned tick kept, on a raised tile.
local function skinRewardCard(card)
  if not isFrame(card) then return end
  T.FadeRegions(card, GW.KeepKeys(card, { "Icon", "EarnedCheckmark" }))
  T.Panel(card, { raised = true, noSheen = true })
end

-- The reward cards the track holds now (the game fills it in Init, from a pool).
local function skinRewardCards(track)
  local cards = type(track.GetElements) == "function" and track:GetElements()
  for _, card in ipairs(type(cards) == "table" and cards or {}) do skinRewardCard(card) end
end

-- The reward page: its progress bar a theme bar on an inset track, and the cards, again each time the track is set up.
local function skinRewardPage(page)
  if not isFrame(page) then return end
  GW.FadeParts(page, { "ProgressBarBackground" })
  GW.SkinProgress(page.LegacyRewardProgressBar)
  local track = page.LegacyRewardProgressFrame
  if not isFrame(track) then return end
  skinRewardCards(track)
  GW.HookAfter(track, "Init", skinRewardCards)
end

-- The Legacy system window (Forever's own: the Adventure, Professions and Progression trees, challenges
-- and a reward track): the window skin, and its three pages with their cards, rows, bars and controls. The side
-- tabs and their indicators are another stream's. Decided (design 6.1, option c): this skins the window only;
-- Vanguard's tracker does not list Legacy challenges and the game's tracker is not brought back for them.
function GW.SkinLegacy(frame)
  GW.Skin(frame)
  for _, key in ipairs(GW.LEGACY_PAGES) do skinLegacyPage(frame[key]) end
  skinTreePage(frame.TreePage)
  skinChallengesPage(frame.ChallengesPage)
  skinRewardPage(frame.RewardTrackPage)
  local objectives = _G.LegacyChallengeObjectives
  if type(objectives) ~= "table" then return end
  skinObjectives(objectives)
  GW.HookAfter(objectives, "Display", skinObjectives)
end

GW.Add("map", "onDemand", "Blizzard_LegacySystem", { "LegacySystemFrame" }, GW.SkinLegacy)

-- Queue status ---------------------------------------------------------------------------------

-- One queue entry: the gold ring round its assigned spec's icon faded, the grey line under it one pixel of `divider`.
local function skinQueueEntry(entry)
  if type(entry.AssignedSpec) == "table" then GW.FadeParts(entry.AssignedSpec, { "Border" }) end
  if type(entry.EntrySeparator) == "table" then T.Divider(entry.EntrySeparator) end
end

-- The queue entries showing now (read-only on the game's pool), each dressed.
local function skinQueueEntries(frame)
  local pool = frame.statusEntriesPool
  if type(pool) ~= "table" or type(pool.EnumerateActive) ~= "function" then return end
  for entry in pool:EnumerateActive() do skinQueueEntry(entry) end
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
-- The month buttons, theme buttons round the arrow they show.
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
-- The event dialogs' tooltip-style boxes (the description, the invite list), which the window skin leaves as the game
-- draws them, and their ornamental dividers.
GW.CALENDAR_BOXES = {
  CalendarViewEventFrame = { "CalendarViewEventDescriptionContainer", "CalendarViewEventInviteList" },
  CalendarCreateEventFrame = { "CalendarCreateEventDescriptionContainer", "CalendarCreateEventInviteList" },
}
GW.CALENDAR_DIVIDERS = { CalendarViewEventFrame = "CalendarViewEventDivider", CalendarCreateEventFrame = "CalendarCreateEventDivider" }
-- The dialogs' dropdowns (parentKeys, the game's arrows kept) and check boxes.
GW.CALENDAR_DROPDOWNS = {
  CalendarCreateEventFrame = { "EventTypeDropdown", "HourDropdown", "MinuteDropdown", "AMPMDropdown", "DifficultyOptionDropdown", "CommunityDropdown" },
  CalendarMassInviteFrame = { "CommunityDropdown", "RankDropdown" },
}
GW.CALENDAR_CHECKS = { CalendarCreateEventFrame = { "CalendarCreateEventAutoApproveCheck", "CalendarCreateEventLockEventCheck" } }
-- The dialogs' gold text, each group as { role, colour, names }: the event's name, then the small lines under it and the labels.
GW.CALENDAR_TEXTS = {
  CalendarViewEventFrame = { { "name", "text", { "CalendarViewEventTitle" } },
    { "small", "text2", { "CalendarViewEventCommunityName", "CalendarViewEventTypeName", "CalendarViewEventCreatorName" } } },
  CalendarCreateEventFrame = { { "small", "text2", { "CalendarCreateEventCommunityName", "CalendarCreateEventTextureName", "CalendarCreateEventCreatorName" } } },
  CalendarMassInviteFrame = { { "small", "text", { "CalendarMassInviteLevelText", "CalendarMassInviteFrameLevelDivider", "CalendarMassInviteRankText" } } },
}
-- The invite list of each event dialog (it holds a ScrollBox and three sort buttons named "<list>NameSortButton" and so on).
GW.CALENDAR_LISTS = { CalendarViewEventFrame = "CalendarViewEventInviteList", CalendarCreateEventFrame = "CalendarCreateEventInviteList" }
GW.CALENDAR_SORTS = { "NameSortButton", "ClassSortButton", "StatusSortButton" }
-- What an invite row keeps of its own art: the moderator and group marks.
GW.CALENDAR_ROW_KEEP = { "ModIcon", "PartyIcon" }
-- The two dialogs that pick from a list (an event, an event picture).
GW.CALENDAR_PICKERS = { CalendarEventPickerFrame = true, CalendarTexturePickerFrame = true }
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

-- The filter dropdown as a flat button with its label light, and the class-totals buttons (the totals, then one per
-- class) as theme buttons keeping their class icons; each is skipped when this client has no such button.
local function skinCalendarStrip(frame)
  local filter = _G.CalendarFilterButton or frame.FilterButton
  skinFlatButton(filter)
  if type(filter) == "table" then GW.SkinText(filter.Text, "label", "text") end
  glyphButton(_G.CalendarClassTotalsButton)
  for i = 1, GW.CALENDAR_CLASS_BUTTONS do glyphButton(_G["CalendarClassButton" .. i]) end
end

-- The weekday headings (CalendarWeekday1Name to 7) in light label text and the year in small grey text.
local function skinCalendarTexts()
  for i = 1, 7 do GW.SkinText(_G["CalendarWeekday" .. i .. "Name"], "label", "text") end
  GW.SkinText(_G.CalendarYearName, "small", "text2")
end

-- The calendar window: every texture of its frame faded but the two it keeps (see GW.CALENDAR_KEEP), a panel with a
-- shadow, the close button with the filter button clear of it, the month buttons as theme buttons keeping their arrows,
-- the filter and class buttons, the weekday and year texts, and the day grid as inset panels.
function GW.SkinCalendar(frame)
  T.FadeRegions(frame, namedSet(GW.CALENDAR_KEEP))
  T.Panel(frame, { shadow = true })
  GW.DressClose(frame, _G.CalendarCloseButton)
  GW.BesideClose(_G.CalendarFilterButton or frame.FilterButton, _G.CalendarCloseButton)
  for _, name in ipairs(GW.CALENDAR_MONTH_BUTTONS) do glyphButton(_G[name]) end
  skinCalendarStrip(frame)
  skinCalendarTexts()
  for i = 1, GW.CALENDAR_DAYS do skinDay(_G["CalendarDayButton" .. i]) end
end

-- A calendar dialog's header: its plate faded and its title in the title role.
local function dressHeader(header)
  if not isFrame(header) then return end
  GW.FadeParts(header, GW.MENU_PLATE)
  GW.SkinTitle(header.Text)
end

-- The window skin with the dialog's pictures (see GW.CALENDAR_PICTURES) left as the game has them.
local function skinKeepingPictures(frame)
  local kept = namedSet(GW.CALENDAR_PICTURES)
  if type(frame.Texture) == "table" then kept[frame.Texture] = true end
  for part in pairs(kept) do kept[part] = part:GetAlpha() end
  GW.Skin(frame)
  for part, alpha in pairs(kept) do part:SetAlpha(alpha) end
end

-- A tooltip-style box in a dialog (a description or an invite list): its game backdrop faded, an inset panel in the theme.
local function dressBox(box)
  if not isFrame(box) then return end
  T.FadeRegions(box)
  if type(box.NineSlice) == "table" then box.NineSlice:SetAlpha(0) end
  T.Panel(box, { inset = true, noSheen = true })
end

-- A dialog's text boxes it has, its tooltip-style boxes and its divider as one pixel of `divider`
-- (see GW.CALENDAR_EDITS, GW.CALENDAR_BOXES, GW.CALENDAR_DIVIDERS).
local function skinDialogBoxes(name)
  for _, edit in ipairs(GW.CALENDAR_EDITS[name] or {}) do
    if isFrame(_G[edit]) then T.EditBox(_G[edit]) end
  end
  for _, box in ipairs(GW.CALENDAR_BOXES[name] or {}) do dressBox(_G[box]) end
  local divider = _G[GW.CALENDAR_DIVIDERS[name] or ""]
  if type(divider) == "table" and divider.SetAlpha then T.Divider(divider) end
end

-- A dialog's gold texts (see GW.CALENDAR_TEXTS) in their roles and colours.
local function skinDialogTexts(name)
  for _, group in ipairs(GW.CALENDAR_TEXTS[name] or {}) do
    for _, fs in ipairs(group[3]) do GW.SkinText(_G[fs], group[1], group[2]) end
  end
end

-- A row lit while the game holds its highlight (it locks the picked invite, event or picture), as its selected look.
local function followLock(row)
  GW.HookAfter(row, "LockHighlight", function(r) T.SelectRow(r, true) end)
  GW.HookAfter(row, "UnlockHighlight", function(r) T.SelectRow(r, false) end)
end

-- One invite row: a theme row (the game's highlight bar faded, the moderator and group marks kept) lit while picked.
local function skinInviteRow(row)
  GW.DressRow(row, GW.CALENDAR_ROW_KEEP)
  followLock(row)
end

-- A column heading of an invite list (a sort button) in small grey text, its direction arrow the game's.
local function skinSortButton(button)
  if type(button) == "table" and type(button.GetFontString) == "function" then GW.SkinText(button:GetFontString(), "cell", "text2") end
end

-- An invite list (by name): its column headings and every row it holds or is given.
local function skinInviteList(name)
  for _, suffix in ipairs(GW.CALENDAR_SORTS) do skinSortButton(_G[name .. suffix]) end
  if isFrame(_G[name]) then GW.WatchRows(_G[name].ScrollBox, skinInviteRow) end
end

-- One row of a picker dialog: a theme row keeping its picture, its title light, lit while picked.
local function skinPickerRow(row)
  GW.DressRow(row, { "Icon" })
  GW.SkinText(row.Title, "label", "text")
  followLock(row)
end

-- A picker dialog's list: an inset panel under its rows, which are themed as the game makes them.
local function skinPicker(frame)
  if not isFrame(frame.ScrollBox) then return end
  T.Panel(frame.ScrollBox, { inset = true, noSheen = true })
  GW.WatchRows(frame.ScrollBox, skinPickerRow)
end

-- A dialog's dropdowns (arrows kept), check boxes and texts, its invite list or picker list, and a text area
-- (the holiday and raid dialogs' ScrollingFont) as an inset panel.
local function skinDialogControls(frame, name)
  for _, key in ipairs(GW.CALENDAR_DROPDOWNS[name] or {}) do GW.SkinDropdown(frame[key]) end
  for _, check in ipairs(GW.CALENDAR_CHECKS[name] or {}) do GW.SkinCheck(_G[check]) end
  skinDialogTexts(name)
  skinInviteList(GW.CALENDAR_LISTS[name] or "")
  if GW.CALENDAR_PICKERS[name] then skinPicker(frame) end
  if isFrame(frame.ScrollingFont) then T.Panel(frame.ScrollingFont, { inset = true, noSheen = true }) end
end

-- One of the calendar's dialogs: the window skin keeping its pictures, the header, the close button, and its text
-- boxes, boxes, divider, dropdowns, check boxes, texts and lists.
function GW.SkinCalendarDialog(frame)
  local name = frame:GetName()
  skinKeepingPictures(frame)
  dressHeader(frame.Header)
  GW.DressClose(frame, _G[GW.CALENDAR_CLOSE[name] or ""])
  skinDialogBoxes(name)
  skinDialogControls(frame, name)
end

GW.Add("map", "onDemand", "Blizzard_Calendar", { "CalendarFrame" }, GW.SkinCalendar)
GW.Add("map", "onDemand", "Blizzard_Calendar", {
  "CalendarViewHolidayFrame", "CalendarViewRaidFrame", "CalendarViewEventFrame", "CalendarCreateEventFrame",
  "CalendarMassInviteFrame", "CalendarEventPickerFrame", "CalendarTexturePickerFrame",
}, GW.SkinCalendarDialog)
