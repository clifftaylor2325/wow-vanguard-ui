-- Game windows, tabs group: Tab buttons on every skinned window, the character pane's inner panels and the game's scroll bars, in the
-- Vanguard look. Filled by stream S7 of docs/handoff/RESKIN-PLAN.md.
--
-- This file registers no windows of its own: it dresses what the other groups registered. At
-- PLAYER_LOGIN it reads GW.ORDER, and when a part of the game loads (ADDON_LOADED) it reads that
-- part's GW.ON_DEMAND windows, so it keeps no list of other streams' windows. Its switch is
-- GW.settings.tabs; a window whose own group is switched off stays the game's, tabs and all.

local ADDON, ns = ...

local T = ns.Theme

local GW = ns.GetModule("Windows")

-- How many tabs a PanelTemplates window can have (they are named <window>Tab1 ... Tab8).
GW.MAX_TABS = 8
-- Where a window keeps a tab system (TabSystemTemplate, Blizzard_SharedXML/Shared/TabSystem), as a path of
-- parentKeys: the window's own, the spellbook's categories, the talents page, the friends window's header.
GW.TAB_SYSTEMS = {
  { "TabSystem" }, { "CategoryTabSystem" }, { "TabHeaders" }, { "FriendsTabHeader", "TabSystem" },
  { "SpellBookFrame", "CategoryTabSystem" }, { "TalentsFrame", "TabSystem" },
}
-- The windows with side tabs, dressed by name whether or not another group registered them: the
-- character pane, the guild window (Communities), the Legacy window, the inspect window and the group finder.
GW.TAB_WINDOWS = { "CharacterFrame", "CommunitiesFrame", "LegacySystemFrame", "InspectFrame", "LFGParentFrame" }
-- Where those windows keep their side tabs, as parentKeys on the window (the Camelot character pane
-- keeps its own in a ModeTabs frame, which has a Tabs array too). LargeSideTabButtonTemplate and
-- RightSideTabTemplate (the guild window's) tabs.
GW.SIDE_TABS = {
  "CharacterTab", "ReputationTab", "SkillsTab", "PvPTab", "CurrencyTab", "StatisticsTab",
  "ChatTab", "RosterTab", "GuildBenefitsTab", "GuildInfoTab", "GuildPreferredPlaySettingsTab",
  "LegacyTreeTab", "LegacyChallengeTab", "LegacyRewardTrackTab", "ListingTab", "BrowsingTab", "WhoListingTab",
}
-- How many frames deep inside a registered window its scroll bars are looked for (a bar is a ScrollBar
-- key on a frame; the lists and panes of the windows keep theirs within a few levels).
GW.SCROLL_DEPTH = 4
-- The windows already dressed (a window is hooked once).
local dressed = setmetatable({}, { __mode = "k" })

-- The part reached from frame by a path of parentKeys, or nil when a step is missing.
local function walk(frame, path)
  local part = frame
  for _, key in ipairs(path) do
    if type(part) ~= "table" then return nil end
    part = part[key]
  end
  return type(part) == "table" and part or nil
end

-- Adds a tab button to the list, once (anything that takes a script hook is one); side marks a side tab.
local function add(list, button, side)
  if type(button) ~= "table" or not button.HookScript or list.seen[button] then return end
  list.seen[button] = true
  list[#list + 1] = button
  list.side[button] = side
end

-- Adds the buttons of a window's parentArray of tabs (Tabs: PanelTabButtonTemplate's).
local function addArray(list, tabs)
  if type(tabs) ~= "table" then return end
  for _, button in ipairs(tabs) do add(list, button) end
end

-- Adds the side tabs a window (or its ModeTabs frame) holds, by key and in its Tabs array.
local function addSide(list, holder)
  if type(holder) ~= "table" then return end
  for _, key in ipairs(GW.SIDE_TABS) do add(list, holder[key], true) end
  addArray(list, holder.Tabs)
end

-- Adds the buttons a tab system holds, by its accessor (TabSystemMixin:GetTabButton(tabID), nil past the last).
local function addSystem(list, system)
  if type(system) ~= "table" or type(system.GetTabButton) ~= "function" then return end
  for id = 1, GW.MAX_TABS * 3 do
    local button = system:GetTabButton(id)
    if not button then return end
    add(list, button)
  end
end

-- Adds the buttons a PanelTemplates window names <window>Tab1 ... Tab8.
local function addNamed(list, name)
  for i = 1, GW.MAX_TABS do add(list, name and _G[name .. "Tab" .. i]) end
end

-- Every tab button a window has now: its Tabs array and side tabs, its named tabs and its tab systems'.
-- list.side marks the side tabs (by key).
function GW.TabButtons(frame)
  local list = { seen = {}, side = {} }
  addSide(list, frame)
  addSide(list, frame.ModeTabs)
  addNamed(list, frame.GetName and frame:GetName())
  for _, path in ipairs(GW.TAB_SYSTEMS) do addSystem(list, walk(frame, path)) end
  return list
end

-- A side tab's checked state now, or nil when it can't be told (a CheckButton knows; a LargeSideTab shows it).
local function checkedNow(tab)
  if type(tab.GetChecked) == "function" then return tab:GetChecked() == true end
  if type(tab.SelectedTexture) == "table" then return tab.SelectedTexture:IsShown() end
end

-- The game checks a side tab as the window loads, before T.Tab hooks SetChecked: says the state once
-- more, so the accent line starts on the right tab.
local function seedChecked(tab)
  if tab.vgSeeded or type(tab.SetChecked) ~= "function" then return end
  tab.vgSeeded = true
  local on = checkedNow(tab)
  if on ~= nil then tab:SetChecked(on) end
end

-- The old right-side tab (RightSideTabTemplate) draws its frame as a texture with no key: faded, its icon kept.
local function fadeSideArt(tab)
  if tab.Background or tab.Left or type(tab.Icon) ~= "table" then return end
  T.FadeRegions(tab, { [tab.Icon] = true, [tab.IconOverlay or tab.Icon] = true })
end

-- The edge of a tab away from its window, where its accent bar goes: the far side of a tab beside the
-- window, else the bottom of one below the window's middle and the top of one above it (TOP when unplaced).
function GW.OuterEdge(tab, window)
  local x, y = tab:GetCenter()
  local left, right, bottom, top = window:GetLeft(), window:GetRight(), window:GetBottom(), window:GetTop()
  if not (x and y and left and right and bottom and top) then return "TOP" end
  if x > right then return "RIGHT" end
  if x < left then return "LEFT" end
  return y < (bottom + top) / 2 and "BOTTOM" or "TOP"
end

-- One axis of a tab's offset from its window: when the tab's `near` side (LEFT, TOP...) is set on the window's
-- opposite `far` edge, the tab is outside the window there and goes `out` units that way; else its offset stays.
local function outside(point, relPoint, near, far, out, offset)
  if point:find(near) and relPoint:find(far) then return out end
  return offset
end

-- Moves a tab set against an outer edge of its window out to its panel's padded edge (one pixel in,
-- so their borders meet), once: the panel reaches past the window, and would cover the tab's near end.
function GW.ClearPadding(tab, window)
  local pad = T.Padding(window) - T.Pixel(window)
  if tab.vgPadded or pad <= 0 or tab:GetNumPoints() ~= 1 then return end
  tab.vgPadded = true
  local point, rel, relPoint, x, y = tab:GetPoint(1)
  if rel ~= window or type(point) ~= "string" or type(relPoint) ~= "string" then return end
  x = outside(point, relPoint, "RIGHT", "LEFT", -pad, outside(point, relPoint, "LEFT", "RIGHT", pad, x))
  y = outside(point, relPoint, "BOTTOM", "TOP", pad, outside(point, relPoint, "TOP", "BOTTOM", -pad, y))
  tab:SetPoint(point, rel, relPoint, x, y)
end

-- One tab button of a window in the theme, whichever template it came from: out past the window's padding,
-- its accent bar on its outer edge, and a side tab's icon greyed while another is selected.
local function dressTab(button, window, side)
  GW.ClearPadding(button, window)
  T.Tab(button, { bar = GW.OuterEdge(button, window), dimIcon = side == true })
  seedChecked(button)
  fadeSideArt(button)
end

-- Puts every tab button the window has now in the theme; a button that fails leaves the others alone.
-- The character pane's ModeTabs holder moves out past the padding like a tab.
function GW.DressTabs(frame)
  local list = GW.TabButtons(frame)
  if type(frame.ModeTabs) == "table" and frame.ModeTabs.GetPoint then ns.Try("tab holder", GW.ClearPadding, frame.ModeTabs, frame) end
  for _, button in ipairs(list) do ns.Try("tab button", dressTab, button, frame, list.side[button]) end
  GW.FadeParts(frame, { "TabIndicators" })
end

-- Dresses the tabs a window's tab systems add later (they make their buttons as pages are set up).
local function watchSystems(frame)
  for _, path in ipairs(GW.TAB_SYSTEMS) do
    local system = walk(frame, path)
    if system and type(system.AddTab) == "function" then hooksecurefunc(system, "AddTab", ns.Guard("hook AddTab", function() GW.DressTabs(frame) end)) end
  end
end

-- Inside the character pane -----------------------------------------------------------------

-- The character pane's lists (the Camelot pane's sub-frames): each has a ScrollBox whose rows are made as they scroll in.
GW.PANE_LISTS = { "ReputationFrame", "SkillsFrame", "TokenFrame" }
-- The stat boxes (player and pet): scroll boxes of stat category headers and stat lines.
GW.STAT_BOXES = { "CharacterStatsPaneScrollBox", "CharacterStatsPanePetScrollBox" }
-- The parts of a list entry's Content that are a ColoredProgressBar (a reputation bar, a skill bar).
GW.ROW_BARS = { "ReputationBar", "SkillsBar" }
-- Where rows are watched: scroll box -> true (a box is watched once), and the owner of our callbacks on the game's boxes.
local watched, rowOwner = setmetatable({}, { __mode = "k" }), {}

-- A table of the parts of frame named in keys that it has, as a keep list for T.FadeRegions.
local function keepKeys(frame, keys)
  local keep = {}
  for _, key in ipairs(keys) do
    if type(frame[key]) == "table" then keep[frame[key]] = true end
  end
  return keep
end

-- A reputation or skill bar in the theme. The game's (ColoredProgressBarTemplate) is a frame with a
-- Fill texture it sizes and colours itself: its backdrop is faded and an inset panel put behind the
-- Fill, which stays the game's (its colour says the standing). A real StatusBar gets the theme's bar texture.
function GW.SkinBar(bar)
  if type(bar) ~= "table" then return end
  if type(bar.Fill) == "table" then
    T.Panel(bar, { inset = true, noSheen = true })
    T.FadeRegions(bar, keepKeys(bar, { "Fill" }))
  elseif type(bar.SetStatusBarTexture) == "function" then
    T.StyleBar(bar)
  end
end

-- A list's header row (a banner texture, a name and the plus/minus StateIcon) as a flat button, its icon kept.
local function skinHeader(row)
  T.Button(row)
  row.StateIcon:SetAlpha(1)
end

-- One row of a pane list: a header as a flat button, an entry's progress bar in the theme.
local function skinRow(row)
  if type(row) ~= "table" then return end
  if type(row.StateIcon) == "table" then return skinHeader(row) end
  if type(row.Content) ~= "table" then return end
  for _, key in ipairs(GW.ROW_BARS) do GW.SkinBar(row.Content[key]) end
end

-- A stat category's box: its title plate faded, a flat inset panel behind its title.
local function skinCategory(frame)
  if type(frame) ~= "table" or type(frame.Title) ~= "table" or type(frame.Background) ~= "table" then return end
  frame.Background:SetAlpha(0)
  T.Panel(frame, { inset = true, noSheen = true })
end

-- Dresses a ScrollBox's rows now and as the game acquires them (a pooled row comes back dressed). The game's
-- own iterateExisting argument calls back with other arguments than the event does, so it is not used.
local function watchRows(box, skin)
  if type(box) ~= "table" or watched[box] or type(box.ForEachFrame) ~= "function" then return end
  watched[box] = true
  box:ForEachFrame(function(row) skin(row) end)
  local util = _G.ScrollUtil
  if type(util) == "table" and type(util.AddAcquiredFrameCallback) == "function" then
    util.AddAcquiredFrameCallback(box, function(_, row) skin(row) end, rowOwner)
  end
end

-- The ScrollBox of the frame of that name, if the client has one.
local function boxOf(name)
  local frame = _G[name]
  return type(frame) == "table" and frame.ScrollBox or nil
end

-- Watches the rows of every pane list and stat box this client has.
local function watchLists()
  for _, name in ipairs(GW.PANE_LISTS) do watchRows(boxOf(name), skinRow) end
  for _, name in ipairs(GW.STAT_BOXES) do watchRows(boxOf(name), skinCategory) end
end

-- The stat categories the pane keeps as plain frames (the item level, attributes and enhancements boxes).
local function skinStatCategories()
  local pane = _G.CharacterStatsPane
  if type(pane) ~= "table" or not pane.GetChildren then return end
  for _, child in ipairs({ pane:GetChildren() }) do skinCategory(child) end
end

-- The honor tab's decorative art faded: the line under the rank and the glow behind its ring. The ring,
-- its badge and the rank texts are the content and stay the game's.
local function skinPvPRank(frame)
  local info = frame.MainInfoFrame
  if type(info) ~= "table" then return end
  T.FadeRegions(info)
  local ring = info.RankProgressBarDisplay
  if type(ring) == "table" and ring.GetRegions then T.FadeRegions(ring, keepKeys(ring, { "Background", "Bar", "FactionBadge" })) end
end

-- The equipment flyout (the items you can swap into a slot): its art faded, flat panels behind the
-- item grid and the page bar, and its item buttons skinned as the bags' are.
local function skinFlyout()
  local flyout, bags = _G.EquipmentFlyoutFrame, ns.GetModule("Bags")
  if type(flyout) ~= "table" then return end
  for _, key in ipairs({ "buttonFrame", "NavigationFrame" }) do
    local part = flyout[key]
    if type(part) == "table" then T.FadeRegions(part) T.Panel(part, { shadow = true }) end
  end
  for _, button in ipairs(flyout.buttons or {}) do
    if bags and bags.SkinItem then bags.SkinItem(button) end
  end
end

-- Dresses the flyout on show and after the game fills it again (it makes its buttons and pages as needed), once.
local function watchFlyout()
  local flyout = _G.EquipmentFlyoutFrame
  if type(flyout) ~= "table" or not flyout.HookScript or watched[flyout] then return end
  watched[flyout] = true
  flyout:HookScript("OnShow", skinFlyout)
  if type(_G.EquipmentFlyout_UpdateItems) == "function" then hooksecurefunc("EquipmentFlyout_UpdateItems", ns.Guard("hook EquipmentFlyout_UpdateItems", skinFlyout)) end
end

-- The pane's own backdrops, as parentKeys of CharacterFrame (Camelot CharacterFrame.xml): the wooden background
-- behind the left pane (every tab's list sits on it) and the stat backdrop and stone plate behind the right one.
GW.PANE_HOSTS = { "LeftPaneHost", "RightPaneHost" }

-- What the currency list says while it holds nothing (the game has no line of its own for that).
GW.CURRENCY_EMPTY = "You have no currencies yet."

-- A pane host's art faded: its own textures and those of the frames it holds (the right one's divider line).
local function fadeHost(host)
  if type(host) ~= "table" or not host.GetRegions then return end
  T.FadeRegions(host)
  for _, child in ipairs({ host:GetChildren() }) do T.FadeRegions(child) end
end

-- The pane's flat look: its hosts' art faded, each list in a flat inset panel, and the currency list's empty note.
local function flattenPane()
  local frame = _G.CharacterFrame
  if type(frame) == "table" then
    for _, key in ipairs(GW.PANE_HOSTS) do fadeHost(frame[key]) end
  end
  for _, name in ipairs(GW.PANE_LISTS) do
    local box = boxOf(name)
    if type(box) == "table" and box.GetRegions then T.Panel(box, { inset = true, noSheen = true }) end
  end
  if boxOf("TokenFrame") then GW.WatchEmpty(boxOf("TokenFrame"), GW.CURRENCY_EMPTY) end
end

-- The button that shows and hides the pane's right half (CharacterFrame.RightPaneToggleButton: a plain Button, not
-- protected, that the game never moves; it sat below the title row on the left pane's corner) put in the title row,
-- T.CONTROL.step left of the close button, as a window's maximize box is (GW.PlaceControls).
local function placePaneToggle(frame)
  local toggle = type(frame) == "table" and frame.RightPaneToggleButton
  if type(toggle) ~= "table" or not toggle.SetPoint or type(frame.CloseButton) ~= "table" then return end
  toggle:ClearAllPoints()
  toggle:SetPoint("CENTER", frame.CloseButton, "CENTER", -T.CONTROL.step, 0)
end

-- Dresses the inside of the character pane: its backdrops, right-pane toggle and lists' rows, the skill rank bar,
-- the stat boxes, the honor tab and the equipment flyout. Safe to run again: lists and the flyout are watched once.
function GW.DressCharacterPane()
  watchLists()
  flattenPane()
  placePaneToggle(_G.CharacterFrame)
  skinStatCategories()
  local skills, honor = _G.SkillsFrame, _G.PVPRankFrame
  if type(skills) == "table" and type(skills.SkillDetailFrame) == "table" then GW.SkinBar(skills.SkillDetailFrame.RankBar) end
  if type(honor) == "table" then skinPvPRank(honor) end
  watchFlyout()
end

-- Inside the collections window -------------------------------------------------------------

-- The appearances tab's backdrops inside WardrobeCollectionFrame (Blizzard_Collections), as parentKey paths: the
-- item grid and the sets tab's preview (CollectionsBackgroundTemplate: a leather tile and shadows on an inset
-- frame), and the sets tab's list (InsetFrameTemplate).
GW.WARDROBE_BACKDROPS = { { "ItemsCollectionFrame" }, { "SetsCollectionFrame", "RightInset" }, { "SetsCollectionFrame", "LeftInset" } }

-- One backdrop: its tile, shadows and inset background faded, its NineSlice edge too, and a flat inset panel behind
-- what it holds (the models and buttons on it are its children and stay the game's).
local function skinBackdrop(frame)
  if type(frame) ~= "table" or not frame.GetRegions then return end
  T.FadeRegions(frame)
  if type(frame.NineSlice) == "table" and frame.NineSlice.SetAlpha then frame.NineSlice:SetAlpha(0) end
  T.Panel(frame, { inset = true, noSheen = true })
end

-- What the appearances grid says while it shows nothing (on Forever it lists only collected appearances, so a
-- slot can be empty; the game has no line of its own for that).
GW.APPEARANCES_EMPTY = "No appearances to show for this slot."

-- The appearances grid's empty note: shown while the game's filtered list for the slot and search is empty
-- (not before the game has made that list).
local function noteAppearances(items)
  local list = type(items.GetFilteredVisualsList) == "function" and items:GetFilteredVisualsList()
  GW.SetEmptyNote(items, type(list) == "table" and #list == 0, GW.APPEARANCES_EMPTY)
end

-- Keeps the grid's note right now and after each redraw (UpdateItems: a slot, page, filter or search change), once.
local function watchAppearances(items)
  if type(items) ~= "table" or not items.CreateFontString or watched[items] then return end
  watched[items] = true
  noteAppearances(items)
  if type(items.UpdateItems) == "function" then hooksecurefunc(items, "UpdateItems", ns.Guard("hook UpdateItems", noteAppearances)) end
end

-- Dresses the inside of the collections window: the appearances tab's backdrops and the grid's empty note.
-- Safe to run again.
function GW.DressCollections()
  local wardrobe = _G.WardrobeCollectionFrame
  if type(wardrobe) ~= "table" then return end
  for _, path in ipairs(GW.WARDROBE_BACKDROPS) do skinBackdrop(walk(wardrobe, path)) end
  watchAppearances(wardrobe.ItemsCollectionFrame)
end

-- What a window holds besides tabs that is dressed with it, by window name: a function that takes no argument.
GW.INSIDE = { CharacterFrame = GW.DressCharacterPane, CollectionsJournal = GW.DressCollections }

-- Dresses what the window holds besides tabs (GW.INSIDE), now and every time it shows; a failure is reported.
local function dressInside(frame)
  local inside = GW.INSIDE[frame.GetName and frame:GetName() or ""]
  if not inside then return end
  -- Runs the window's dresser under ns.Try.
  local function run() ns.Try("window parts", inside) end
  run()
  frame:HookScript("OnShow", run)
end

-- Scroll bars -----------------------------------------------------------------------------------

-- The scroll bar of a frame that holds a ScrollBox: the ScrollBar key beside it (the game pairs them as
-- siblings), taken from the box's parent when that is not the frame itself.
local function pairedBar(frame)
  local box = frame.ScrollBox
  local parent = type(box) == "table" and box.GetParent and box:GetParent()
  return type(parent) == "table" and parent.ScrollBar or nil
end

-- One scroll bar in the theme, if there is one.
local function dressBar(bar)
  if type(bar) == "table" then T.ScrollBar(bar) end
end

-- Puts the scroll bars of a frame and of the frames inside it (depth levels down) in the theme: its
-- ScrollBar key, and the bar paired with its ScrollBox. A bar that is not one of the game's 12.x
-- scroll bars (an old scroll frame's slider) is left alone by T.ScrollBar itself. A frame the game
-- keeps from addons is skipped, and so is the inside of one that holds such a frame (the game refuses
-- to list its children then).
function GW.DressBars(frame, depth)
  if frame.IsForbidden and frame:IsForbidden() then return end
  dressBar(frame.ScrollBar)
  dressBar(pairedBar(frame))
  if depth <= 0 or not frame.GetChildren then return end
  local ok, children = pcall(function() return { frame:GetChildren() } end)
  if not ok then return end
  for _, child in ipairs(children) do GW.DressBars(child, depth - 1) end
end

-- What runs when a window shows: its tabs, and its scroll bars if it is a registered window.
function GW.DressWindow(frame)
  GW.DressTabs(frame)
  local name = frame:GetName() or ""
  if GW.REGISTERED[name] then ns.Try("scroll bars " .. name, GW.DressBars, frame, GW.SCROLL_DEPTH) end
end

-- Dresses a window's tabs and scroll bars now and every time it shows, once per window, and what it holds inside.
local function dress(frame)
  if type(frame) ~= "table" or not frame.HookScript or dressed[frame] then return end
  dressed[frame] = true
  GW.DressWindow(frame)
  frame:HookScript("OnShow", GW.DressWindow)
  watchSystems(frame)
  dressInside(frame)
end

-- Whether the tabs of the window of that name are Vanguard's to dress: the switch is on and the
-- window's own group is on if it is registered (a window left to the game keeps the game's tabs).
local function wanted(name)
  local entry = GW.REGISTERED[name]
  return GW.settings and GW.settings.tabs and (not entry or GW.settings[entry.group]) or false
end

-- Dresses the tabs of the window of that name again, when they are Vanguard's to dress: for a
-- Vanguard part that adds tabs to a window after it was dressed (the auction helper's).
function GW.DressTabsOf(name)
  if wanted(name) and type(_G[name]) == "table" then GW.DressTabs(_G[name]) end
end

-- Dresses the window of that name, if the client has it and its tabs are wanted.
local function dressNamed(name)
  if wanted(name) then dress(_G[name]) end
end

-- Dresses the windows of those names.
local function dressAll(names)
  for _, name in ipairs(names) do dressNamed(name) end
end

-- Runs the inside dressers of the windows already dressed again: a part they hold may have loaded (the currencies list).
local function refreshInside()
  for name, inside in pairs(GW.INSIDE) do
    if dressed[_G[name]] then ns.Try("window parts", inside) end
  end
end

-- A part of the game loaded: dress the tabs of the windows registered for it, and the side-tab windows.
local function onLoaded(_, addon)
  dressAll(GW.ON_DEMAND[addon] or {})
  dressAll(GW.TAB_WINDOWS)
  refreshInside()
end

-- At login, after the Windows module enabled: every window registered now and the side-tab windows,
-- and later those that load with their part of the game.
local function enable()
  if not (GW.settings and GW.settings.tabs) then return end
  dressAll(GW.ORDER)
  dressAll(GW.TAB_WINDOWS)
  ns.On("ADDON_LOADED", onLoaded)
end

ns.On("PLAYER_LOGIN", enable)
