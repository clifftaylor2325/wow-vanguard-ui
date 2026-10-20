-- Game windows, tabs group: Tab buttons on every skinned window, the character pane's inner panels and the game's scroll bars, in the
-- Vanguard look. Filled by stream S7 of docs/handoff/RESKIN-PLAN.md.
--
-- This file registers no windows of its own: it dresses what the other groups registered. At
-- PLAYER_LOGIN it reads GW.ORDER, and when a part of the game loads (ADDON_LOADED) it reads that
-- part's GW.ON_DEMAND windows, so it keeps no list of other streams' windows. Its switch is
-- GW.settings.tabs; a window whose own group is switched off stays the game's, tabs and all.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgTabPadded = ns.FrameState("vgTabPadded")
local vgSeeded = ns.FrameState("vgSeeded")
local vgUnmasked = ns.FrameState("vgUnmasked")

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
-- RightSideTabTemplate (the guild window's) tabs; the professions window's (an overview tab and one for each
-- profession), the cooldown settings' three and the inspect window's guild tab.
GW.SIDE_TABS = {
  "CharacterTab", "ReputationTab", "SkillsTab", "PvPTab", "CurrencyTab", "StatisticsTab",
  "ChatTab", "RosterTab", "GuildBenefitsTab", "GuildInfoTab", "GuildPreferredPlaySettingsTab",
  "LegacyTreeTab", "LegacyChallengeTab", "LegacyRewardTrackTab", "ListingTab", "BrowsingTab", "WhoListingTab",
  "ProfessionsOverviewTab", "Professions1Tab", "Professions2Tab", "Professions3Tab", "Professions4Tab",
  "Professions5Tab", "Professions6Tab", "Professions7Tab", "SpellsTab", "AurasTab", "GroupBuffsTab", "GuildTab",
}
-- The frames a window keeps side tabs in besides itself, by parentKey: the character and inspect windows' ModeTabs and
-- the collections window's TabContainer. Every tab in their Tabs array is a side tab; the container is also moved out
-- past the window's padding as one (its tabs hang from it).
GW.TAB_HOLDERS = { "ModeTabs", "TabContainer" }
-- How many guild bank side tabs there are (GuildBankTab1 ... 8: a frame with a plate, and a .Button holding the icon).
GW.BANK_TABS = 8
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

-- Adds the buttons of a window's parentArray of tabs (Tabs: PanelTabButtonTemplate's), as side tabs when side is set.
local function addArray(list, tabs, side)
  if type(tabs) ~= "table" then return end
  for _, button in ipairs(tabs) do add(list, button, side) end
end

-- Adds the side tabs a window (or a frame that holds its side tabs) has, by key and in its Tabs array (which is
-- all side tabs when sideArray is set: the window's own Tabs array is its bottom tabs).
local function addSide(list, holder, sideArray)
  if type(holder) ~= "table" then return end
  for _, key in ipairs(GW.SIDE_TABS) do add(list, holder[key], true) end
  addArray(list, holder.Tabs, sideArray)
end

-- Adds the side tabs the window's tab holders keep (GW.TAB_HOLDERS) and, on the character pane, the paper doll's
-- sidebar (the global PaperDollSidebarTabs frame, whose Tabs array holds its four tabs).
local function addHolders(list, frame)
  for _, key in ipairs(GW.TAB_HOLDERS) do addSide(list, frame[key], true) end
  if frame == _G.CharacterFrame then addSide(list, _G.PaperDollSidebarTabs, true) end
end

-- Adds the buttons a tab system holds, by its accessor (TabSystemMixin:GetTabButton(tabID), nil past the last).
local function addSystem(list, system)
  if type(system) ~= "table" or type(system.GetTabButton) ~= "function" then return end
  -- A safety cap, three times the usual count: the loop stops at the first id with no tab, so the cap only matters
  -- for a system that never runs out.
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
  addHolders(list, frame)
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
-- more, so the selected tab is raised from the start.
local function seedChecked(tab)
  if vgSeeded[tab] or type(tab.SetChecked) ~= "function" then return end
  vgSeeded[tab] = true
  local on = checkedNow(tab)
  if on ~= nil then tab:SetChecked(on) end
end

-- The old right-side tab (RightSideTabTemplate) draws its frame as a texture with no key: faded, its icon kept.
local function fadeSideArt(tab)
  if tab.Background or tab.Left or type(tab.Icon) ~= "table" then return end
  T.FadeRegions(tab, { [tab.Icon] = true, [tab.IconOverlay or tab.Icon] = true })
end

-- One axis of a tab's offset from its window: when the tab's `near` side (LEFT, TOP...) is set on the window's
-- opposite `far` edge, the tab is outside the window there and goes `out` units that way; else its offset stays.
local function outside(point, relPoint, near, far, out, offset)
  if point:find(near) and relPoint:find(far) then return out end
  return offset
end

-- One anchor of a tab (as GetPoint gives it) moved out when it is set against an outer edge of its window, as the
-- arguments SetPoint takes; nothing when the anchor is not on the window.
local function movedOut(window, pad, point, rel, relPoint, x, y)
  if rel ~= window or type(point) ~= "string" or type(relPoint) ~= "string" then return end
  x = outside(point, relPoint, "RIGHT", "LEFT", -pad, outside(point, relPoint, "LEFT", "RIGHT", pad, x))
  y = outside(point, relPoint, "BOTTOM", "TOP", pad, outside(point, relPoint, "TOP", "BOTTOM", -pad, y))
  return point, rel, relPoint, x, y
end

-- How far a tab set against an outer edge of its window moves out: its panel's padding, one pixel in so their borders meet.
function GW.TabPad(window)
  return T.Padding(window) - T.Pixel(window)
end

-- Moves a tab (or a holder of tabs, which has two anchors) set against an outer edge of its window out to its
-- panel's padded edge (one pixel in, so their borders meet), once: the panel reaches past the window, and would
-- cover the tab's near end.
function GW.ClearPadding(tab, window)
  local pad, count, moved = GW.TabPad(window), tab:GetNumPoints(), {}
  if vgTabPadded[tab] or pad <= 0 or count < 1 or count > 2 then return end
  vgTabPadded[tab] = true
  for i = 1, count do moved[i] = { movedOut(window, pad, tab:GetPoint(i)) } end
  for _, anchor in ipairs(moved) do if anchor[1] then tab:SetPoint(unpack(anchor)) end end
end

-- Pads a tab again after the game re-anchored it (a refreshed tab set): clears its once-flag, then pads it.
function GW.PadTabAgain(tab, window)
  vgTabPadded[tab] = nil
  GW.ClearPadding(tab, window)
end

-- Takes the game's rounded mask off an icon tab's icon, once (the mask sits a little off the icon's centre, so its
-- art showed off-centre with round corners; the pool reuses the tab, and the mask stays off).
local function unmaskIcon(button)
  if vgUnmasked[button] or type(button.IconMask) ~= "table" then return end
  vgUnmasked[button] = true
  button.Icon:RemoveMaskTexture(button.IconMask)
end

-- An icon tab of a tab system (TabSystemButtonTemplate given an icon: the spellbook's categories) made a square as
-- tall as the tab, its icon filling it one pixel inside the border like an action button's, bevel cropped. The game
-- anchors the icon at the tab's bottom and centre (which stretches it to the tab's height), so it is anchored at the
-- centre alone, the point the game sets again on each selection. The game sizes the tab from its icon as it adds
-- it, so this runs after every AddTab; the spellbook re-adds its tabs and lays them out each time it opens.
local function fitIconTab(button)
  local icon, side = button.Icon, button:GetHeight()
  if not button.tabIcon or type(icon) ~= "table" or not icon.SetTexCoord or side <= 0 then return end
  unmaskIcon(button)
  local inner = T.PixelRound(button, side - 2 * T.Pixel(button))
  button:SetWidth(side)
  icon:ClearAllPoints()
  icon:SetPoint("CENTER", button, "CENTER")
  icon:SetSize(inner, inner)
  T.Crop(icon)
end

-- One tab button of a window in the theme, whichever template it came from: out past the window's padding,
-- and a side tab's or icon tab's icon greyed while another is selected.
local function dressTab(button, window, side)
  GW.ClearPadding(button, window)
  fitIconTab(button)
  T.Tab(button, { dimIcon = side == true or button.tabIcon ~= nil })
  seedChecked(button)
  fadeSideArt(button)
end

-- One guild bank side tab (a frame with a bronze plate and a .Button, the check button that holds the icon): out
-- past the window's padding, the plate faded, the button a tab in the theme with its icon and the search dimmer kept.
local function dressBankTab(tab, window)
  GW.ClearPadding(tab, window)
  T.FadeRegions(tab)
  local button = tab.Button
  if type(button) ~= "table" or not button.HookScript then return end
  T.Tab(button)
  T.FadeRegions(button, GW.KeepKeys(button, { "IconTexture", "SearchOverlay" }))
  seedChecked(button)
end

-- The guild bank window's side tabs, GuildBankTab1 ... 8 (made with the window, shown as the guild has tabs).
local function dressBankTabs(frame)
  if frame ~= _G.GuildBankFrame then return end
  for i = 1, GW.BANK_TABS do
    local tab = _G["GuildBankTab" .. i]
    if type(tab) == "table" and tab.GetRegions then ns.Try("bank tab", dressBankTab, tab, frame) end
  end
end

-- Moves each of the window's tab holders (GW.TAB_HOLDERS) out past the padding, as its tabs are.
local function clearHolders(frame)
  for _, key in ipairs(GW.TAB_HOLDERS) do
    local holder = frame[key]
    if type(holder) == "table" and holder.GetPoint then ns.Try("tab holder", GW.ClearPadding, holder, frame) end
  end
end

-- Puts every tab button the window has now in the theme; a button that fails leaves the others alone.
function GW.DressTabs(frame)
  local list = GW.TabButtons(frame)
  clearHolders(frame)
  for _, button in ipairs(list) do ns.Try("tab button", dressTab, button, frame, list.side[button]) end
  dressBankTabs(frame)
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

-- The character pane's lists (the Camelot pane's sub-frames; statistics loads with Blizzard_Statistics): each has a
-- ScrollBox whose rows are made as they scroll in.
GW.PANE_LISTS = { "ReputationFrame", "SkillsFrame", "TokenFrame", "StatisticsFrame" }
-- The stat boxes (player and pet): scroll boxes of stat category headers and stat lines.
GW.STAT_BOXES = { "CharacterStatsPaneScrollBox", "CharacterStatsPanePetScrollBox" }
-- The parts of a list entry's Content that are a ColoredProgressBar (a reputation bar, a skill bar).
GW.ROW_BARS = { "ReputationBar", "SkillsBar" }
-- What is watched once: a frame the dressers hook or dress for good (side panes, the flyout, the appearances grid).
local watched = setmetatable({}, { __mode = "k" })

-- A reputation or skill bar in the theme. The game's (ColoredProgressBarTemplate) is a frame with a
-- Fill texture it sizes and colours itself: its backdrop is faded and an inset panel put behind the
-- Fill, which stays the game's (its colour says the standing). A real StatusBar gets the theme's bar texture.
function GW.SkinBar(bar)
  if type(bar) ~= "table" then return end
  if type(bar.Fill) == "table" then
    T.Panel(bar, { inset = true, noSheen = true })
    T.FadeRegions(bar, GW.KeepKeys(bar, { "Fill" }))
  elseif type(bar.SetStatusBarTexture) == "function" then
    T.StyleBar(bar)
  end
end

-- The profession rank bar: a real StatusBar is the theme's flat bar. A frame with a Fill (the game's leafy art, sized by the
-- game and wider than its border) gets the same flat track, its overflow clipped so the fill sits inside the box, and its
-- spark and glow hidden. Anything else is skipped.
function GW.SkinRankBar(bar)
  if type(bar) ~= "table" then return end
  if type(bar.SetStatusBarTexture) == "function" then return GW.SkinProgress(bar) end
  if type(bar.Fill) ~= "table" then return end
  GW.SkinBar(bar)
  if bar.SetClipsChildren then bar:SetClipsChildren(true) end
  for _, key in ipairs({ "Spark", "Glow" }) do
    if type(bar[key]) == "table" and bar[key].SetAlpha then bar[key]:SetAlpha(0) end
  end
end

-- A font string coloured by token (text) when it is one; anything else is skipped.
local function colorText(fs, token)
  if type(fs) == "table" and fs.SetTextColor then T.Color(fs, token) end
end

-- The atlases the game sets on a list's fold marks (a header's StateIcon, a sub-header's toggle; Camelot
-- ReputationFrame and StatisticsFrame), each -> whether it says the group is folded. Pressed states are not listed.
GW.FOLD_ATLASES = {
  ["common-button-list-plus"] = true, ["common-button-list-minus"] = false,
  campaign_headericon_closed = true, campaign_headericon_open = false,
}
-- How big the theme chevron drawn in place of a fold mark is (units), as a section header's.
GW.FOLD_GLYPH = 12
-- The chevron drawn for each fold mark (the game's texture -> Vanguard's).
local vgFold = ns.FrameState("vgFold")

-- Points a fold mark's chevron for the atlas the game just set on the mark: Right while folded, Down while open.
local function pointFold(mark, atlas)
  local folded = GW.FOLD_ATLASES[atlas]
  if folded ~= nil then vgFold[mark]:SetTexture(T.Icon(folded and "Right" or "Down")) end
end

-- Hides a game fold mark (the plus and minus) and draws the theme's chevron in text2 over it, on a frame of its own
-- on host (so fading host's art never fades it), following each atlas the game sets on the mark; open (Down) until an
-- atlas says otherwise, so a mark never goes blank. Made once.
local function foldChevron(host, mark)
  if type(mark) ~= "table" or not mark.SetAtlas then return end
  mark:SetAlpha(0)
  if vgFold[mark] then return end
  local holder = CreateFrame("Frame", nil, host)
  holder:SetAllPoints(mark)
  vgFold[mark] = T.Tint(T.Snap(holder:CreateTexture(nil, "OVERLAY")), "text2")
  T.PixelSize(vgFold[mark], GW.FOLD_GLYPH, GW.FOLD_GLYPH, true)
  vgFold[mark]:SetPoint("CENTER")
  pointFold(mark, mark:GetAtlas() or "common-button-list-minus")
  GW.HookAfter(mark, "SetAtlas", pointFold)
end

-- A list's header row (a banner texture, a name and the plus/minus StateIcon) as a flat button with the theme's
-- fold chevron for its plus/minus, its name (the game's gold) in the text colour.
local function skinHeader(row)
  T.Button(row)
  foldChevron(row, row.StateIcon)
  colorText(row.Name, "text")
end

-- A sub-header's fold button (ToggleCollapseButton: the game's red plus and minus squares) faded, the theme's
-- chevron in its place following the atlas the game sets on its normal texture.
local function skinFoldButton(button)
  if type(button) ~= "table" or not button.GetNormalTexture then return end
  T.FadeRegions(button)
  foldChevron(button, button:GetNormalTexture())
end

-- An entry's rounded highlight (Content.BackgroundHighlight, which the game shows at a low alpha under the mouse and
-- on the selected row) hidden for the row's theme look; kept for a faction at war, whose red says so, as a flat band.
-- A row the game has not filled yet (no elementData: IsAtWar would index nil) is left until its first refresh.
local function followHighlight(row)
  if row.elementData == nil then return end
  local atWar = type(row.IsAtWar) == "function" and row:IsAtWar()
  if not atWar then row.Content.BackgroundHighlight:SetAlpha(0) end
  if type(row.IsSelected) == "function" then T.SelectRow(row, row:IsSelected() == true) end
end

-- A list entry (a faction, a statistic, a sub-header) as a theme row: the game's rounded highlight pieces made flat
-- and shown only for a faction at war, the one selected look on the row the game selects, after each refresh (the game
-- refreshes a row as it fills it, which comes after the acquire this runs on).
local function dressEntryRow(row)
  local glow = row.Content.BackgroundHighlight
  if type(glow) ~= "table" or not row.CreateTexture then return end
  T.Row(row)
  for _, piece in ipairs(glow.TextureRegions or {}) do piece:SetTexture(T.WHITE) end
  GW.HookAfter(row, "RefreshBackgroundHighlight", followHighlight)
  followHighlight(row)
end

-- One row of a pane list: a header as a flat button; an entry as a theme row with its progress bar in the theme and
-- its fold button (a sub-header's) as a chevron.
local function skinRow(row)
  if type(row) ~= "table" then return end
  if type(row.StateIcon) == "table" then return skinHeader(row) end
  if type(row.Content) ~= "table" then return end
  for _, key in ipairs(GW.ROW_BARS) do GW.SkinBar(row.Content[key]) end
  dressEntryRow(row)
  skinFoldButton(row.ToggleCollapseButton)
end

-- A stat box's plate (its Background) faded and a flat inset panel behind its title or number.
local function flatBox(frame)
  if type(frame) ~= "table" or type(frame.Background) ~= "table" then return end
  frame.Background:SetAlpha(0)
  T.Panel(frame, { inset = true, noSheen = true })
end

-- A stat category's box (it has a Title): its title plate faded, a flat inset panel behind its title.
local function skinCategory(frame)
  if type(frame) == "table" and type(frame.Title) == "table" then flatBox(frame) end
end

-- A row of a stat box: a category header as a flat box, a stat line (a Label and a zebra Background) with its stripe
-- faded, so the box's inset shows through, and its name (the game's gold) in the text colour.
local function skinStatRow(row)
  if type(row) ~= "table" then return end
  skinCategory(row)
  if type(row.Title) == "table" or type(row.Label) ~= "table" then return end
  GW.FadeParts(row, { "Background" })
  colorText(row.Label, "text")
end

-- The ScrollBox of the frame of that name, if the client has one.
local function boxOf(name)
  local frame = _G[name]
  return type(frame) == "table" and frame.ScrollBox or nil
end

-- Watches the rows of every pane list and stat box this client has.
local function watchLists()
  for _, name in ipairs(GW.PANE_LISTS) do GW.WatchRows(boxOf(name), skinRow) end
  for _, name in ipairs(GW.STAT_BOXES) do GW.WatchRows(boxOf(name), skinStatRow) end
end

-- The stat categories the pane keeps as plain frames (the item level, attributes and enhancements boxes), and the
-- item level's plate.
local function skinStatCategories()
  local pane = _G.CharacterStatsPane
  if type(pane) ~= "table" or not pane.GetChildren then return end
  for _, child in ipairs({ pane:GetChildren() }) do skinCategory(child) end
  flatBox(pane.ItemLevelFrame)
end

-- The stat boxes themselves (player and pet): the bronze inside-frame edge, the class crest behind the list and the
-- rule under it faded, a flat inset panel in their place.
local function flattenStatBoxes()
  for _, name in ipairs(GW.STAT_BOXES) do
    local box = _G[name]
    if type(box) == "table" and box.GetRegions then
      T.FadeRegions(box)
      T.Panel(box, { inset = true, noSheen = true })
    end
  end
end

-- The honor tab's gold texts (the season timer, the season's name, the progress line) in the text colour.
local function colorHonorTexts(frame)
  local info = type(frame.MainInfoFrame) == "table" and frame.MainInfoFrame or {}
  colorText(frame.SeasonTimerField, "text")
  colorText(info.CurrentSeasonField, "text")
  colorText(info.CurrentRankProgressField, "text")
end

-- The honor tab's decorative art faded: the line under the rank and the glow behind its ring. The ring,
-- its badge and the rank texts are the content and stay the game's.
local function skinPvPRank(frame)
  colorHonorTexts(frame)
  local info = frame.MainInfoFrame
  if type(info) ~= "table" then return end
  T.FadeRegions(info)
  local ring = info.RankProgressBarDisplay
  if type(ring) == "table" and ring.GetRegions then T.FadeRegions(ring, GW.KeepKeys(ring, { "Background", "Bar", "FactionBadge" })) end
end

-- The side panes (CharacterFrameSidePaneTemplate: the entry you picked, in words, beside the list), each as the path
-- of parentKeys from a global to the pane: reputation, skills, currency and the honor tab.
GW.SIDE_PANES = {
  { "ReputationFrame", "ReputationDetailFrame" }, { "SkillsFrame", "SkillDetailFrame" },
  { "TokenFrame", "DetailFrame" }, { "PVPRankFrame", "DetailFrame" },
}
-- The methods a side pane adds rows with, and which argument is the label's colour (0: it takes none). The game
-- paints a label gold unless it is given another colour; gold goes to the text colour, a given colour is content.
GW.SIDE_ROWS = { AddRow = 3, AddWrappedRow = 2, AddIconRow = 3, AddCategory = 0 }
-- The check boxes and push buttons the reputation and currency panes hold, by key (AtWarCheckbox is dressed apart:
-- its label is red on purpose).
GW.PANE_CHECKS = { "MakeInactiveCheckbox", "WatchFactionCheckbox", "InactiveCheckbox", "BackpackCheckbox" }
GW.PANE_BUTTONS = { "ViewRenownButton", "CurrencyTransferToggleButton" }
-- The slot tile of each side pane icon row (the row's side table, not a field on the game's frame).
local vgSideSlot = ns.FrameState("vgSideSlot")

-- The rows a side pane shows now: the shown children of its Content.
local function paneRows(pane)
  local rows, content = {}, pane.Content
  if type(content) ~= "table" or not content.GetChildren then return rows end
  for _, row in ipairs({ content:GetChildren() }) do
    if row.IsShown and row:IsShown() then rows[#rows + 1] = row end
  end
  return rows
end

-- The row the game added last: the shown one numbered last (layoutIndex, set by AcquireRow).
local function lastRow(pane)
  for _, row in ipairs(paneRows(pane)) do
    if row.layoutIndex == pane.layoutIndex then return row end
  end
end

-- A slot tile behind a side pane row's icon, once (the row's bronze plate is faded): a quiet T.Slot on a frame the
-- size of the icon, a level under the row so the icon the row draws stays on top.
local function iconSlot(row)
  local icon = row.Icon
  if vgSideSlot[row] or type(row.IconSlot) ~= "table" or type(icon) ~= "table" or not row.GetFrameLevel then return end
  local slot = CreateFrame("Frame", nil, row)
  slot:SetFrameLevel(math.max(row:GetFrameLevel() - 1, 0))
  slot:SetAllPoints(icon)
  T.Slot(slot, { quiet = true })
  vgSideSlot[row] = slot
end

-- A side pane row's art: its plate (a category's Background, an icon row's IconSlot) faded, the icon on a slot tile.
local function dressRowArt(row)
  GW.FadeParts(row, { "Background", "IconSlot" })
  iconSlot(row)
end

-- Hooks one row-adding method of a side pane: the row it added is dressed, and its label goes to the text colour
-- when the game left it gold (no colour given, or the game's own gold).
local function hookRows(pane, method, at)
  if type(pane[method]) ~= "function" then return end
  hooksecurefunc(pane, method, ns.Guard("hook " .. method, function(_, ...)
    local row, color = lastRow(pane), at > 0 and (select(at, ...)) or nil
    if not row then return end
    dressRowArt(row)
    if color == nil or color == _G.NORMAL_FONT_COLOR then colorText(row.Label, "text") end
  end))
end

-- A side pane's heading (the game's gold, set again by SetPaneTitleColor) in the heading role and the text colour.
local function dressPaneTitle(pane)
  local title = pane.Title
  if type(title) ~= "table" or not title.SetFont then return end
  T.Text(title, "heading", "text")
  if type(pane.SetPaneTitleColor) ~= "function" then return end
  hooksecurefunc(pane, "SetPaneTitleColor", ns.Guard("hook SetPaneTitleColor", function() T.Color(title, "text") end))
end

-- How close a colour channel must be to the game's gold to count as it (colours come back as floats).
GW.GOLD_TOLERANCE = 0.01

-- Whether a font string is in the game's gold (NORMAL_FONT_COLOR); no when it can't be read.
local function isGold(fs)
  local gold = _G.NORMAL_FONT_COLOR
  if type(gold) ~= "table" or type(gold.GetRGB) ~= "function" or type(fs) ~= "table" or not fs.GetTextColor then return false end
  local r, g, b = fs:GetTextColor()
  r, g, b = ns.PlainNumber(r), ns.PlainNumber(g), ns.PlainNumber(b)
  if not (r and g and b) then return false end
  local gr, gg, gb = gold:GetRGB()
  return math.abs(r - gr) + math.abs(g - gg) + math.abs(b - gb) < GW.GOLD_TOLERANCE
end

-- A side pane's check box (T.CheckBox), its label in the text colour while the game has it gold (a grey one, for a
-- box that can't be used, stays grey), unless keepLabel is set.
local function paneCheck(box, keepLabel)
  if type(box) ~= "table" or not box.GetChecked or not box.HookScript then return end
  T.CheckBox(box)
  if not keepLabel and isGold(box.Label) then colorText(box.Label, "text") end
end

-- A side pane's push button as a theme button.
local function paneButton(button)
  if type(button) == "table" and button.CreateTexture then T.Button(button) end
end

-- The parts the reputation and currency panes hold besides the common ones: check boxes (At war keeps its red
-- label), the standing bar and the push buttons.
local function paneParts(pane)
  paneCheck(pane.AtWarCheckbox, true)
  for _, key in ipairs(GW.PANE_CHECKS) do paneCheck(pane[key]) end
  for _, key in ipairs(GW.PANE_BUTTONS) do paneButton(pane[key]) end
  GW.SkinBar(pane.StandingBar)
end

-- After the pane's Refresh (each entry picked), its check box labels the game painted gold again go back to the
-- text colour; a grey one (a faction that can't be made inactive) stays the game's grey.
local function keepCheckLabels(pane)
  if type(pane.Refresh) ~= "function" then return end
  hooksecurefunc(pane, "Refresh", ns.Guard("hook pane Refresh", function()
    for _, key in ipairs(GW.PANE_CHECKS) do
      local label = type(pane[key]) == "table" and pane[key].Label
      if isGold(label) then colorText(label, "text") end
    end
  end))
end

-- One side pane in the theme, once: its heading, its rule faded, its rows as the game adds them (those it has now
-- too) and its own parts. The description's scroll bar is reached with the window's (GW.SCROLL_KEYS).
local function dressSidePane(pane)
  if type(pane) ~= "table" or watched[pane] then return end
  watched[pane] = true
  GW.FadeParts(pane, { "Divider" })
  dressPaneTitle(pane)
  for _, row in ipairs(paneRows(pane)) do dressRowArt(row) end
  for method, at in pairs(GW.SIDE_ROWS) do hookRows(pane, method, at) end
  paneParts(pane)
  keepCheckLabels(pane)
end

-- The side panes this client has (the currency one once its part of the game has loaded).
local function dressSidePanes()
  for _, path in ipairs(GW.SIDE_PANES) do dressSidePane(walk(_G, path)) end
end

-- The flyout's page arrows (NavigationFrame.PrevButton and NextButton: pictures on a button) as theme arrow buttons.
local function skinFlyoutNav(nav)
  if type(nav) ~= "table" then return end
  GW.SkinArrow(nav.PrevButton, "left")
  GW.SkinArrow(nav.NextButton, "right")
end

-- The equipment flyout (the items you can swap into a slot): its art faded, flat panels behind the
-- item grid and the page bar, its page arrows flat, and its item buttons skinned as the bags' are.
local function skinFlyout()
  local flyout = _G.EquipmentFlyoutFrame
  if type(flyout) ~= "table" then return end
  for _, key in ipairs({ "buttonFrame", "NavigationFrame" }) do
    local part = flyout[key]
    if type(part) == "table" then T.FadeRegions(part) T.Panel(part, { shadow = true }) end
  end
  skinFlyoutNav(flyout.NavigationFrame)
  for _, button in ipairs(flyout.buttons or {}) do GW.SkinItem(button) end
end

-- Dresses the flyout on show and after the game fills it again (it makes its buttons and pages as needed), once.
local function watchFlyout()
  local flyout = _G.EquipmentFlyoutFrame
  if type(flyout) ~= "table" or not flyout.HookScript or watched[flyout] then return end
  watched[flyout] = true
  flyout:HookScript("OnShow", ns.Guard("show equipment flyout", skinFlyout))
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

-- A pane list's rule frame (a plain Frame holding one ScrollLine texture): each texture as one pixel of divider.
local function dividerLines(frame)
  for _, region in ipairs({ frame:GetRegions() }) do
    if region.GetObjectType and region:GetObjectType() == "Texture" then T.Divider(region) end
  end
end

-- The rules over and under a pane list (the ScrollBox's two unnamed child frames, each holding a ScrollLine), as one
-- pixel of divider each. A plain Frame only: the rows the box holds are buttons and keep their art.
local function fadeLines(box)
  if not box.GetChildren then return end
  for _, child in ipairs({ box:GetChildren() }) do
    if child.GetObjectType and child:GetObjectType() == "Frame" and child.GetRegions then dividerLines(child) end
  end
end

-- Each pane list in a flat inset panel, its rules as one pixel of divider.
local function flattenLists()
  for _, name in ipairs(GW.PANE_LISTS) do
    local box = boxOf(name)
    if type(box) == "table" and box.GetRegions then
      T.Panel(box, { inset = true, noSheen = true })
      fadeLines(box)
    end
  end
end

-- The pane's flat look: its hosts' art faded, each list in a flat inset panel, and the currency list's empty note.
local function flattenPane()
  local frame = _G.CharacterFrame
  if type(frame) == "table" then
    for _, key in ipairs(GW.PANE_HOSTS) do fadeHost(frame[key]) end
  end
  flattenLists()
  flattenStatBoxes()
  if boxOf("TokenFrame") then GW.WatchEmpty(boxOf("TokenFrame"), GW.CURRENCY_EMPTY) end
end

-- Points the right-pane toggle's chevron the way a click moves the pane's edge: left while the right half shows (a
-- click hides it), right while it is hidden. The game swaps its page-arrow art on every change (UpdateRightPaneToggleButton).
local function pointPaneToggle(frame)
  local glyph = T.ControlGlyph(frame.RightPaneToggleButton)
  local hidden = type(frame.IsRightPaneCollapsed) == "function" and frame:IsRightPaneCollapsed() == true
  if glyph then glyph:SetTexCoord(hidden and 0 or 1, hidden and 1 or 0, 0, 1) end
end

-- The button that shows and hides the pane's right half (CharacterFrame.RightPaneToggleButton: a plain Button, not
-- protected, that the game never moves; it sat below the title row on the left pane's corner) put in the title row,
-- T.CONTROL.step left of the close button, as a window's maximize box is (GW.PlaceControls): a window control with the
-- theme's chevron in place of the game's gold page arrow, following the pane.
local function placePaneToggle(frame)
  local toggle = type(frame) == "table" and frame.RightPaneToggleButton
  if type(toggle) ~= "table" or not toggle.SetPoint or type(frame.CloseButton) ~= "table" then return end
  toggle:ClearAllPoints()
  toggle:SetPoint("CENTER", frame.CloseButton, "CENTER", -T.CONTROL.step, 0)
  if not toggle.CreateTexture then return end
  T.WindowControl(toggle, "Right")
  pointPaneToggle(frame)
  GW.HookAfter(frame, "UpdateRightPaneToggleButton", pointPaneToggle)
end

-- Every gear slot the pane shows, by the name of its item button (Camelot PaperDollFrame.xml). The shirt, tabard and
-- ammo are there too; a slot the client lacks is skipped.
GW.EQUIP_SLOTS = {
  "Head", "Neck", "Shoulder", "Back", "Chest", "Shirt", "Tabard", "Wrist", "Hands", "Waist", "Legs", "Feet",
  "Finger0", "Finger1", "Trinket0", "Trinket1", "MainHand", "SecondaryHand", "Ranged", "Ammo",
}

-- A gear slot's other frame (BorderFrame, the Camelot pane's bronze slot frame, a child that holds its own texture) faded.
local function fadeSlotFrame(button)
  local frame = type(button) == "table" and button.BorderFrame
  if type(frame) == "table" and frame.GetRegions then T.FadeRegions(frame) end
end

-- The ammo slot's small bronze plate (an unnamed background texture on the button) faded; its icon, count, pressed and
-- highlight pictures and the ignored-slot mark stay.
local function fadeAmmoPlate(slot)
  if type(slot) ~= "table" or not slot.GetRegions then return end
  local keep = GW.KeepKeys(slot, { "icon", "Icon", "IconBorder", "ignoreTexture" })
  GW.KeepAlso(keep, _G.CharacterAmmoSlotIconTexture)
  GW.KeepAlso(keep, slot.GetPushedTexture and slot:GetPushedTexture())
  GW.KeepAlso(keep, slot.GetHighlightTexture and slot:GetHighlightTexture())
  T.FadeRegions(slot, keep)
end

-- Each gear slot's item button in the theme, as the bags' are: the bronze frame the game draws (NormalTexture,
-- IconBorder and the BorderFrame child) faded, a flat panel behind the icon and the item's quality border
-- (Modules/Bags.lua skinItem), and the ammo slot's plate faded.
local function skinSlots()
  for _, slot in ipairs(GW.EQUIP_SLOTS) do
    local button = _G["Character" .. slot .. "Slot"]
    GW.SkinItem(button)
    fadeSlotFrame(button)
  end
  fadeAmmoPlate(_G.CharacterAmmoSlot)
end

-- The model area's art: the strip above the model (its rock tile and edge) and the model scene's backdrop
-- textures faded, with a flat inset panel behind the model. The model and its controls stay the game's.
local function skinModelArea()
  local paper = _G.PaperDollFrame
  if type(paper) ~= "table" then return end
  fadeHost(paper.TopBackgroundStripHost)
  local scene = paper.CharacterModelScene
  if type(scene) == "table" and scene.GetRegions then
    T.FadeRegions(scene)
    T.Panel(scene, { inset = true, noSheen = true })
  end
end

-- What stays on a gear set row (GearSetButtonTemplate): the set's icon, the equipped tick and the spec icon. The card's
-- hover and selected art (HighlightBar, SelectedBar) is faded: the row shows the one hover and selected look.
GW.SET_ROW_KEEP = { "icon", "Check", "SpecIcon" }

-- A pane's edge and rule faded for a flat inset panel behind its list.
local function insetPane(pane)
  if type(pane) ~= "table" or not pane.GetRegions then return end
  T.FadeRegions(pane)
  T.Panel(pane, { inset = true, noSheen = true })
end

-- Has a row's selected look follow the game's global that marks a row selected or not (called with the row and a flag at
-- every init and click; a row not dressed is left alone). Hooked once, when the game has the function.
local function watchSelection(name)
  GW.FollowSelected(_G, name)
end

-- A title row (PlayerTitleButtonTemplate): a theme row (its zebra stripe, hover and selected bars faded, the tick kept)
-- showing the selected look the game's SelectedBar stands for, its text (the game's gold) in the text colour.
local function skinTitleRow(row)
  if type(row) ~= "table" then return end
  GW.DressRow(row, { "Check" })
  GW.FollowMark(row, row.SelectedBar)
  colorText(row.text, "text")
end

-- Whether items of the gear set row are missing (the game paints the name red then, which says so).
local function setLost(row)
  local sets = _G.C_EquipmentSet
  if type(sets) ~= "table" or type(sets.GetEquipmentSetInfo) ~= "function" or not row.setID then return false end
  local _, _, _, _, _, _, _, numLost = sets.GetEquipmentSetInfo(row.setID)
  return (numLost or 0) > 0
end

-- A gear set row (GearSetButtonTemplate): a theme row (its card plate, rings and hover and selected cards faded, the icon,
-- tick and spec icon kept) showing the selected look the game's SelectedBar stands for, its name in the text colour
-- unless the game marked it red.
local function skinSetRow(row)
  if type(row) ~= "table" or not row.GetRegions then return end
  GW.DressRow(row, GW.SET_ROW_KEEP)
  GW.FollowMark(row, row.SelectedBar)
  if not setLost(row) then colorText(row.text, "text") end
end

-- The textures of a button drawn on its ARTWORK layer (a glyph beside its label).
local function artworkOf(button)
  local found = {}
  for _, region in ipairs({ button:GetRegions() }) do
    if region.GetObjectType and region:GetObjectType() == "Texture" and region.GetDrawLayer and region:GetDrawLayer() == "ARTWORK" then found[#found + 1] = region end
  end
  return found
end

-- The New set button (PaperDollTertiaryButtonTemplate: a state plate and a plus glyph) as a theme button that keeps
-- its plus and its green label.
local function newSetButton(button)
  if type(button) ~= "table" or not button.GetRegions then return end
  local glyphs = artworkOf(button)
  T.Button(button)
  for _, glyph in ipairs(glyphs) do glyph:SetAlpha(1) end
end

-- One of the equipment manager's panes dressed: a flat inset panel and its rows watched.
local function dressGearPane(pane, skin)
  if type(pane) ~= "table" then return end
  insetPane(pane)
  GW.WatchRows(pane.ScrollBox, skin)
end

-- The two lists' selected looks following the game's marking of a title or a set (hooked once).
local function watchGearSelection()
  watchSelection("PaperDollTitlesPane_SetButtonSelected")
  watchSelection("PaperDollEquipmentManagerPane_SetButtonSelected")
end

-- The titles list and equipment sets list in the theme: their panels and rows, and the set buttons.
local function skinGearPanes()
  local paper = _G.PaperDollFrame
  if type(paper) ~= "table" then return end
  watchGearSelection()
  dressGearPane(paper.TitleManagerPane, skinTitleRow)
  dressGearPane(paper.EquipmentManagerPane, skinSetRow)
  local sets = paper.EquipmentManagerPane
  if type(sets) ~= "table" then return end
  paneButton(sets.EquipSet)
  paneButton(sets.SaveSet)
  newSetButton(sets.NewSet)
end

-- The pet's experience bar and the level lines over the model (the game's gold) in the theme.
local function skinLevels()
  GW.SkinBar(_G.PetPaperDollFrameExpBar)
  for _, name in ipairs({ "CharacterLevelText", "PetCharacterLevelText" }) do
    local line = _G[name]
    if type(line) == "table" and line.SetFont then T.Text(line, "heading", "text") end
  end
end

-- The paper doll's own parts: the level lines and pet bar, the titles list and the equipment sets list.
local function skinPaperDoll()
  skinLevels()
  skinGearPanes()
end

-- The skill rank bar and the honor tab.
local function skinSkillsAndHonor()
  local skills, honor = _G.SkillsFrame, _G.PVPRankFrame
  if type(skills) == "table" and type(skills.SkillDetailFrame) == "table" then GW.SkinBar(skills.SkillDetailFrame.RankBar) end
  if type(honor) == "table" then skinPvPRank(honor) end
end

-- Dresses the inside of the character pane: its backdrops, right-pane toggle, lists' rows and side panes, the stat
-- boxes, the gear slots, the model area, the paper doll's level lines, pet bar, titles and sets lists, the skill rank
-- bar, the honor tab and the equipment flyout. Safe to run again: lists, side panes and the flyout are watched once,
-- and a slot is skinned once.
local function dressCharacterPane()
  watchLists()
  flattenPane()
  placePaneToggle(_G.CharacterFrame)
  skinStatCategories()
  skinSlots()
  skinModelArea()
  skinPaperDoll()
  skinSkillsAndHonor()
  dressSidePanes()
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

-- The appearances page's Items and Sets tabs (PanelTopTabButtonTemplate, keys on the page: the game selects one by
-- disabling it, which T.Tab follows).
local function dressWardrobeTabs(wardrobe)
  for _, key in ipairs({ "ItemsTab", "SetsTab" }) do
    local tab = wardrobe[key]
    if type(tab) == "table" and tab.HookScript then T.Tab(tab) end
  end
end

-- The appearances page's search box and its filter and class dropdowns.
local function dressWardrobeControls(wardrobe)
  GW.SkinSearch(wardrobe.SearchBox)
  GW.SkinDropdown(wardrobe.FilterButton)
  GW.SkinDropdown(wardrobe.ClassDropdown)
end

-- The item grid's weapon dropdown and its page arrows and count.
local function dressItemsControls(items)
  if type(items) ~= "table" then return end
  GW.SkinDropdown(items.WeaponDropdown)
  GW.SkinPaging(items.PagingFrame)
end

-- What stays on a sets list row (WardrobeSetsScrollFrameButtonTemplate): the progress line and the new-set glow.
GW.SETS_ROW_KEEP = { "ProgressBar", "New" }

-- A sets list row (WardrobeSetsScrollFrameButtonTemplate): a theme row (its plate, hover and selected art faded) showing
-- the selected look the game's SelectedTexture stands for and following its SetSelected; the name keeps its collected,
-- in-progress or none colour, which says how far the set is.
local function skinSetsRow(row)
  if type(row) ~= "table" then return end
  GW.DressRow(row, GW.SETS_ROW_KEEP)
  GW.FollowMark(row, row.SelectedTexture)
  GW.FollowSelected(row, "SetSelected")
end

-- The sets tab's variant dropdown, the plate behind the set's icons and the fade over its model, and its list's rows.
local function dressSetsControls(sets)
  if type(sets) ~= "table" then return end
  GW.SkinDropdown(sets.DetailsFrame and sets.DetailsFrame.VariantSetsDropdown)
  if type(sets.DetailsFrame) == "table" then GW.FadeParts(sets.DetailsFrame, { "IconRowBackground", "ModelFadeTexture" }) end
  if type(sets.ListContainer) == "table" then GW.WatchRows(sets.ListContainer.ScrollBox, skinSetsRow) end
end

-- Dresses the inside of the collections window: the mount, pet, toy and heirloom journals (GW.DressJournals), and the
-- appearances tab's backdrops, tabs, search box, dropdowns, page arrows and sets list, and the grid's empty note. Safe
-- to run again.
local function dressCollections()
  GW.DressJournals()
  local wardrobe = _G.WardrobeCollectionFrame
  if type(wardrobe) ~= "table" then return end
  for _, path in ipairs(GW.WARDROBE_BACKDROPS) do skinBackdrop(walk(wardrobe, path)) end
  dressWardrobeTabs(wardrobe)
  dressWardrobeControls(wardrobe)
  dressItemsControls(wardrobe.ItemsCollectionFrame)
  dressSetsControls(wardrobe.SetsCollectionFrame)
  watchAppearances(wardrobe.ItemsCollectionFrame)
end

-- What a window holds besides tabs that is dressed with it, by window name: a function that takes no argument.
GW.INSIDE = { CharacterFrame = dressCharacterPane, CollectionsJournal = dressCollections }

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
-- ScrollBar keys (GW.SCROLL_KEYS), and the bar paired with its ScrollBox. A bar that is not one of the game's 12.x
-- scroll bars (an old scroll frame's slider) is left alone by T.ScrollBar itself. A frame the game
-- keeps from addons is skipped, and so is the inside of one that holds such a frame (the game refuses
-- to list its children then).
local function dressBars(frame, depth)
  if frame.IsForbidden and frame:IsForbidden() then return end
  for _, key in ipairs(GW.SCROLL_KEYS) do dressBar(frame[key]) end
  dressBar(pairedBar(frame))
  if depth <= 0 or not frame.GetChildren then return end
  local ok, children = pcall(function() return { frame:GetChildren() } end)
  if not ok then return end
  for _, child in ipairs(children) do dressBars(child, depth - 1) end
end

-- What runs when a window shows: its tabs, and its scroll bars if it is a registered window.
local function dressWindow(frame)
  GW.DressTabs(frame)
  local name = frame:GetName() or ""
  if GW.REGISTERED[name] then ns.Try("scroll bars " .. name, dressBars, frame, GW.SCROLL_DEPTH) end
end

-- Dresses a window's tabs and scroll bars now and every time it shows, once per window, and what it holds inside.
local function dress(frame)
  if type(frame) ~= "table" or not frame.HookScript or dressed[frame] then return end
  dressed[frame] = true
  dressWindow(frame)
  frame:HookScript("OnShow", ns.Guard("show window tabs", dressWindow))
  watchSystems(frame)
  dressInside(frame)
end

-- Whether the tabs of the window of that name are Vanguard's to dress: the switch is on and the
-- window's own group is on if it is registered (a window left to the game keeps the game's tabs).
local function wanted(name)
  local entry = GW.REGISTERED[name]
  return GW.GroupOn("tabs") and (not entry or GW.GroupOn(entry.group)) or false
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
  if not GW.GroupOn("tabs") then return end
  dressAll(GW.ORDER)
  dressAll(GW.TAB_WINDOWS)
  ns.On("ADDON_LOADED", onLoaded)
end

ns.On("PLAYER_LOGIN", enable)
