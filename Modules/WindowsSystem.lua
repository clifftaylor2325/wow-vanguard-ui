-- Game windows, system group: Game options, addon list, chat config, Edit Mode windows, keybinding, Cooldown Manager settings, help, colour picker, death recap, in the
-- Vanguard look. Filled by stream S3 of docs/handoff/RESKIN-PLAN.md; registers with
-- GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.
-- Each window keeps its own layout and buttons: art faded by alpha, a flat panel behind it,
-- its buttons, edit boxes, tabs and headings themed. Every part is optional (a client may lack it).

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgBack = ns.FrameState("vgBack")
local vgQuickButtons = ns.FrameState("vgQuickButtons")
local vgTabWatched = ns.FrameState("vgTabWatched")

local T = ns.Theme
local GW = ns.GetModule("Windows")

-- Helpers -------------------------------------------------------------------------------------

-- A part of a frame by parentKey path ("Container.SettingsList"), or nil when the client lacks any step of it.
local function part(frame, path)
  local found = frame
  for key in path:gmatch("[^.]+") do
    if type(found) ~= "table" then return nil end
    found = found[key]
  end
  return type(found) == "table" and found or nil
end

-- Fades a part's own textures (its text and children stay), or the texture itself.
local function fadeRegions(p)
  if p.GetRegions then T.FadeRegions(p) elseif p.SetAlpha then p:SetAlpha(0) end
end

-- Fades a part completely (alpha 0): a border or background frame with no text of its own.
local function fadeAll(p)
  if p.SetAlpha then p:SetAlpha(0) end
end

-- A field label inside a window (the text beside a control, which the game draws in gold) in the label role, light text.
local function label(p)
  GW.SkinText(p, "label", "text")
end

-- A hint or placeholder (a mark beside a box, a "nothing here" line) in the label role, secondary text.
local function hint(p)
  GW.SkinText(p, "label", "text2")
end

-- A settings tab's label (MinimalTabTemplate's Text, which the game anchors to the tab's bottom and recolours by font
-- object on every select, enter and leave) centred in the tab, in the text colour while the tab is selected and text2
-- otherwise. A tab without the game's OnSelected (the chat settings' window tabs) keeps its label as T.Tab leaves it.
local function tabLabel(tab)
  if type(tab.OnSelected) ~= "function" or type(tab.Text) ~= "table" or not tab.Text.SetTextColor then return end
  GW.CenterLabel(tab)
  T.Color(tab.Text, T.IsChecked(tab) and "text" or "text2")
end

-- A game tab's selected state: the tab's raised look follows the game's SelectableButton calls.
local function tabSelected(tab, selected)
  T.SetChecked(tab, selected)
  T.Tab(tab)
  tabLabel(tab)
end

-- A panel tab (MinimalTabTemplate) in the theme, its label centred; the first time, its selected state is read from the
-- game (which may have picked it before the skin ran), later selections come through OnSelected, and the label is set
-- again after the game restyles it for the mouse.
local function skinTab(tab)
  if T.IsChecked(tab) == nil and type(tab.IsSelected) == "function" then T.SetChecked(tab, tab:IsSelected()) end
  T.Tab(tab)
  tabLabel(tab)
  if vgTabWatched[tab] or type(tab.OnSelected) ~= "function" then return end
  vgTabWatched[tab] = true
  tab:HookScript("OnEnter", ns.Guard("tab label", tabLabel))
  tab:HookScript("OnLeave", ns.Guard("tab label", tabLabel))
  if type(hooksecurefunc) == "function" then hooksecurefunc(tab, "OnSelected", ns.Guard("hook OnSelected", tabSelected)) end
end

-- An inset panel behind a list or canvas.
local function inset(p)
  T.Panel(p, { inset = true })
end

-- Shows a part again: art the window's fade took that is really content (a tutorial's pictures).
local function restore(p)
  if p.SetAlpha then p:SetAlpha(1) end
end

-- A window's close button in the theme and in its corner (GW.DressClose).
local function close(p, frame)
  GW.DressClose(frame, p)
end

-- An inset panel behind a part of a layout frame (a scrolling well), its pieces kept out of the layout.
local function layoutInset(p)
  GW.InLayout(p, inset)
end

-- A divider line as one pixel of `divider`; the line is drawn on the frame the divider texture is on, which may be a
-- layout frame, so what it adds stays out of that layout.
local function divider(p)
  if type(p.GetParent) == "function" and type(p:GetParent()) == "table" then GW.InLayout(p:GetParent(), function() T.Divider(p) end) else T.Divider(p) end
end

-- The divider textures among a frame's regions (the game draws them with no key: an atlas whose name ends in
-- Divider), each as one pixel of `divider`; a frame without regions is skipped.
local function dividersIn(frame)
  if type(frame) ~= "table" or not frame.GetRegions then return end
  for _, region in ipairs({ frame:GetRegions() }) do
    local atlas = region.GetAtlas and region:GetAtlas()
    if type(atlas) == "string" and atlas:find("Divider$") then divider(region) end
  end
end

-- What a skin spec can list, in order: the parts (parentKey paths) each step is applied to (each
-- step is given the part and the window).
local STEPS = {
  { "art", fadeAll }, { "fade", fadeRegions }, { "close", close }, { "buttons", GW.SkinButton },
  { "edits", T.EditBox }, { "searches", GW.SkinSearch }, { "tabs", skinTab }, { "insets", inset }, { "layoutInsets", layoutInset },
  { "titles", GW.SkinTitle }, { "labels", label }, { "hints", hint }, { "sections", GW.SkinSection },
  { "bars", T.ScrollBar }, { "dropdowns", GW.SkinDropdown }, { "checks", GW.SkinCheck }, { "radios", GW.SkinRadio },
  { "sliders", T.Slider }, { "dividers", divider }, { "plates", GW.SkinPlate }, { "keep", restore },
}

-- Applies each listed step of a spec to the parts of the frame that exist.
local function dress(frame, spec)
  for _, step in ipairs(STEPS) do
    for _, path in ipairs(spec[step[1]] or {}) do
      local p = part(frame, path)
      if p then step[2](p, frame) end
    end
  end
end

-- Paints the flat panel with a shadow. On one of the game's layout frames (spec.layout: Edit
-- Mode's windows resize themselves from every child region, and the shadow reaches past the
-- edge) the pieces the panel adds stay out of the layout.
local function paint(frame, spec)
  if spec.layout then GW.InLayout(frame, T.Panel, { shadow = true }) else T.Panel(frame, { shadow = true }) end
end

-- Builds a skin from a spec: the frame's own textures faded, a flat panel with a shadow
-- (unless spec.panel is false), then the spec's parts dressed. Runs again on every show.
local function skinner(spec)
  return function(frame)
    T.FadeRegions(frame)
    if spec.panel ~= false then paint(frame, spec) end
    dress(frame, spec)
  end
end

-- Game options -------------------------------------------------------------------------------

-- The options window's parts: SettingsFrameTemplate (NineSlice keeps its title text, Bg is the
-- flat backdrop), two MinimalTabTemplate tabs, the category list, the settings list and canvas.
GW.SETTINGS_SPEC = {
  art = { "Bg" }, fade = { "NineSlice" }, close = { "ClosePanelButton" },
  buttons = { "ApplyButton", "CloseButton", "Container.SettingsList.Header.DefaultsButton" },
  searches = { "SearchBox" }, tabs = { "GameTab", "AddOnsTab" },
  insets = { "CategoryList", "Container.SettingsList" }, titles = { "NineSlice.Text" },
  bars = { "CategoryList.ScrollBar", "Container.SettingsList.ScrollBar" },
}
local skinSettings = skinner(GW.SETTINGS_SPEC)

-- A settings dropdown row's control (a dropdown with a stepper button each side, the loot key's): the dropdown a
-- theme button with a theme chevron, the steppers flat theme arrows.
local function steppedDropdown(control)
  local dropdown = part(control, "Dropdown")
  if dropdown then T.Button(dropdown) GW.Chevron(dropdown) GW.ShowTexture(dropdown.Language) end
  GW.EachKey(control, { "DecrementButton", "IncrementButton" }, function(b)
    if type(b) == "table" and b.CreateTexture then T.ArrowButton(b, b == control.DecrementButton and "left" or "right", { flat = true }) end
  end)
end

-- The voice chat microphone test's play button (VoiceTestMicrophoneTemplate.ToggleTest) as a theme button that keeps
-- its play picture.
local function playButton(button)
  T.Button(button)
  GW.ShowTexture(button.Texture)
end

-- What a settings row can hold, by key path, and how each part is dressed (a row holds one or two): its check
-- box, its slider with steppers, its dropdown, its push button (an expandable section's bar is one too), and the
-- microphone test's play button, level meter box (an inset) and meter (a theme bar).
local SETTING_PARTS = {
  { "Checkbox", GW.SkinCheck }, { "SliderWithSteppers", T.Slider }, { "Control", steppedDropdown }, { "Button", GW.SkinButton },
  { "ToggleTest", playButton }, { "VUMeter", GW.InsetPanel }, { "VUMeter.Status", GW.SkinProgress },
}

-- The parts of one settings control (a row, or one control inside the graphics quality section) in the theme.
local function settingParts(row)
  for _, spec in ipairs(SETTING_PARTS) do
    local control = part(row, spec[1])
    if control then spec[2](control) end
  end
end

-- The graphics quality section's two control sets (Base, Raid and Battleground), each a Controls array of rows.
GW.GRAPHICS_QUALITY_SETS = { "BaseQualityControls", "RaidQualityControls" }

-- The graphics quality section's tabs as the game sizes and anchors them (MinimalTabTemplate: 37 tall; 10 up from the
-- section's top), so the box's top can meet their bottom without measuring a game frame.
GW.QUALITY_TAB = { height = 37, rise = 10 }

-- The graphics quality section's box and tabs lined up: the box from the section's left edge (the game draws it 12 out,
-- past the section's title) down from the tabs' bottom (the game's tabs hang 13 into it), its bottom-right corner as the
-- game anchors it; the Raid tab on the box's top-right corner (the game sets it 30 in, over its border art) and the Base
-- tab beside it, as the game anchors it.
local function placeQualityBox(row, box, raid)
  if type(raid) ~= "table" or not raid.SetPoint then return end
  box:SetPoint("TOPLEFT", row, "TOPLEFT", 0, GW.QUALITY_TAB.rise - GW.QUALITY_TAB.height)
  raid:ClearAllPoints()
  raid:SetPoint("BOTTOMRIGHT", box, "TOPRIGHT")
end

-- The graphics quality section's framed box (a NineSlicePanelTemplate, which the game raises to frame level 500, over
-- the section's tabs and controls) brought down to the row's own level, under them, lined up with the tabs
-- (placeQualityBox) and painted as an inset.
local function qualityBox(row)
  local box = part(row, "NineSlice")
  if not box or type(box.SetFrameLevel) ~= "function" then return end
  box:SetFrameLevel(row:GetFrameLevel())
  placeQualityBox(row, box, row.RaidTab)
  GW.InsetPanel(box)
end

-- The graphics quality section (SettingsAdvancedQualitySectionTemplate, one settings row): its box an inset under
-- its Base and Raid tabs (theme tabs) and every control in both sets (quality steppers, sliders, the raid check box).
local function graphicsSection(row)
  qualityBox(row)
  GW.EachKey(row, { "BaseTab", "RaidTab" }, function(tab) if type(tab) == "table" and tab.CreateTexture then skinTab(tab) end end)
  for _, key in ipairs(GW.GRAPHICS_QUALITY_SETS) do
    local set = part(row, key)
    for _, control in ipairs(set and type(set.Controls) == "table" and set.Controls or {}) do settingParts(control) end
  end
end

-- One row of the settings page (pooled: the game makes a row's controls once, then reuses the row) in the theme.
local function settingRow(row)
  settingParts(row)
  if part(row, "BaseQualityControls") then graphicsSection(row) end
end

-- Whether a nav entry's plate is the game's selected one (it shows the active atlas).
local function navLit(plate)
  return type(plate.GetAtlas) == "function" and plate:GetAtlas() == "Options_List_Active" and plate:IsShown() == true
end

-- A nav entry's selected look, following the game's own state change (UpdateStateInternal(selected), which runs
-- for a click, for the mouse and for a new row alike).
local function navSelected(row, selected)
  T.SelectRow(row, selected == true)
end

-- One nav entry of the category list: the game's selected and hover plates faded for the theme's row washes, the
-- selected look following the game.
local function navEntry(row)
  GW.DressRow(row)
  T.SelectRow(row, navLit(row.Texture))
  GW.HookAfter(row, "UpdateStateInternal", navSelected)
end

-- A group header of the category list (its plate faded, its label a section head; the game sets the label again
-- each time it takes the row).
local function navHeader(row)
  GW.FadeArt(row)
  GW.SkinSection(row.Label)
  GW.HookAfter(row, "Init", function(r) GW.SkinSection(r.Label) end)
end

-- One row of the category list: an entry has the selected and hover plate (Texture), a group header does not.
local function categoryRow(row)
  if type(row.Texture) == "table" then navEntry(row) else navHeader(row) end
end

-- The settings window's lists: the nav's rows and the page's rows dressed as the game takes them, and the line
-- under the page title.
local function watchSettings(frame)
  GW.WatchRows(part(frame, "CategoryList.ScrollBox"), categoryRow)
  GW.WatchRows(part(frame, "Container.SettingsList.ScrollBox"), settingRow)
  dividersIn(part(frame, "Container.SettingsList.Header"))
end

-- Skins the game's options window. (Blizzard_Settings_Shared has no named settings font objects on
-- Forever, so no fonts are set; the pages in Container/SettingsCanvas stay the game's.)
function GW.SkinSettings(frame)
  skinSettings(frame)
  watchSettings(frame)
end

GW.Add("system", "framed", { "SettingsPanel" }, GW.SkinSettings)

-- Addon list, chat config, nameplates tutorial -----------------------------------------------

-- A skin for a window GW.Skin handles (art faded, panel, close button, title) with more parts dressed.
local function withWindowSkin(spec)
  return function(frame)
    GW.Skin(frame)
    dress(frame, spec)
  end
end

-- The game's functions already hooked to dress a window's check buttons, by name.
local vgCheckMakers = {}

-- The game's functions that make a window's check buttons as it draws (the addon list's update and the
-- initialiser its scroll box runs on each row it takes into view, the chat settings' box makers), by the
-- window's global name.
GW.CHECK_MAKERS = {
  AddonList = { "AddonList_Update", "AddonList_InitAddon" },
  ChatConfigFrame = { "ChatConfig_CreateCheckboxes", "ChatConfig_CreateTieredCheckboxes", "ChatConfig_CreateColorSwatches" },
}

-- Dresses what a function that makes a window's parts just made, in the frame the function was handed (a row, a box
-- group) when it takes one, else the whole window (a global frame name), by apply(target); hooked once per
-- function (a post-hook; the game's function is kept), while the system group is on.
local function watchCheckMakers(window, names, apply)
  for _, name in ipairs(names) do
    if not vgCheckMakers[name] and type(hooksecurefunc) == "function" and type(_G[name]) == "function" then
      vgCheckMakers[name] = true
      hooksecurefunc(name, ns.Guard("hook " .. name, function(frame)
        local target = type(frame) == "table" and frame.GetChildren and frame or _G[window]
        if GW.settings and GW.settings.system and type(target) == "table" then apply(target) end
      end))
    end
  end
end

-- The addon list: its push buttons and search box, its character dropdown, scroll bar and performance block (a
-- section head and its line), and each row's check button (the rows' other parts keep the game's look).
local skinAddonList = withWindowSkin({
  buttons = { "CancelButton", "OkayButton", "EnableAllButton", "DisableAllButton" }, searches = { "SearchBox" },
  bars = { "ScrollBar" }, dropdowns = { "Dropdown" }, sections = { "Performance.Header" }, dividers = { "Performance.Divider" },
})
-- Skins the addon list (see skinAddonList), then its rows' check buttons, now and as the game makes rows.
function GW.SkinAddonList(frame)
  skinAddonList(frame)
  GW.DressChecks(frame, GW.CHECK_DEPTH)
  watchCheckMakers("AddonList", GW.CHECK_MAKERS.AddonList, GW.DressChecks)
end
-- The nameplates tutorial: the window skin, but its four picture cards are the content, so they stay.
GW.SkinNamePlatesTutorial = withWindowSkin({ keep = { "StyleOptions", "Aggro", "BuffsDebuffs", "EnemyVsFriendly" } })

-- Whether a child of the chat settings window is one of its boxes: it has the game's NineSlice
-- (ChatConfigBoxTemplate), or its name ends in Backdrop or Background.
local function isChatBox(child)
  local name = child.GetName and child:GetName() or ""
  return type(child.NineSlice) == "table" or name:find("Backdrop$") ~= nil or name:find("Background$") ~= nil
end

-- Runs fn on each chat settings box under frame, up to depth levels down (the pages, then the boxes on them); a
-- box's insides are not searched.
local function eachChatBox(frame, depth, fn)
  for _, child in ipairs({ frame:GetChildren() }) do
    if isChatBox(child) then fn(child) elseif depth > 1 then eachChatBox(child, depth - 1, fn) end
  end
end

-- The rings the game draws round the rows inside a box (a check box's NineSlice border), faded: a row on the box's
-- inset has no fill of its own.
local function fadeRings(frame, depth)
  for _, child in ipairs({ frame:GetChildren() }) do
    GW.FadeParts(child, { "NineSlice" })
    if depth > 1 then fadeRings(child, depth - 1) end
  end
end

-- A chat settings box's heading and its color column's heading as section heads (the game sets their text each time
-- it draws the box, so this runs again then).
local function chatBoxHeads(box)
  GW.SkinSection(box.header)
  if box.GetName and box:GetName() then GW.SkinSection(_G[box:GetName() .. "ColorHeader"]) end
end

-- One box of the chat settings in the theme: its border art faded, an inset panel behind it, its heads, and the
-- rings round its rows faded.
local function skinChatBox(box)
  if type(box.NineSlice) == "table" then fadeRegions(box.NineSlice) end
  fadeRegions(box)
  inset(box)
  chatBoxHeads(box)
  fadeRings(box, 2)
end

-- What the game has just drawn into a chat settings box (or the window): its rings faded, its heads, its check
-- buttons.
local function chatInside(target)
  fadeRings(target, 2)
  chatBoxHeads(target)
  GW.DressChecks(target)
end

-- The chat settings' radio buttons (the combat colors' by source or by target choice), by global name: they are
-- dressed before GW.DressChecks walks the window, which would paint them as square boxes.
GW.CHAT_RADIOS = { "CombatConfigColorsColorizeEntireLineBySource", "CombatConfigColorsColorizeEntireLineByTarget" }
-- The scroll bars the chat settings' pages keep, as global paths.
GW.CHAT_BARS = { "ChatConfigCombatSettingsFilters.ScrollBar", "ChatConfigTextToSpeechSettings.ScrollBar", "ChatConfigTextToSpeechMessageSettingsScroll.ScrollBar" }

-- The chat settings' parts the game names globally: the radios, the pages' scroll bars, the filter's name box and
-- the arrows that move a filter up and down.
local function chatNamed()
  for _, name in ipairs(GW.CHAT_RADIOS) do GW.SkinRadio(_G[name]) end
  for _, path in ipairs(GW.CHAT_BARS) do
    local bar = GW.Part(_G, path)
    if bar then T.ScrollBar(bar) end
  end
  GW.SkinEditBox(_G.CombatConfigSettingsNameEditBox)
  GW.SkinArrow(_G.ChatConfigMoveFilterUpButton, "up")
  GW.SkinArrow(_G.ChatConfigMoveFilterDownButton, "down")
end

-- The window tabs along the top of the chat settings in the theme (the game pools them), the one for the chat
-- window being set up selected.
local function chatTabs(manager, selected)
  local pool = manager.tabPool
  if type(pool) ~= "table" or type(pool.EnumerateActive) ~= "function" then return end
  for tab in pool:EnumerateActive() do tabSelected(tab, selected == tab:GetID()) end
end

-- The chat window tabs, now and each time the game picks one (it also runs when the game rebuilds them).
local function watchChatTabs(frame)
  local manager = frame.ChatTabManager
  if type(manager) ~= "table" then return end
  chatTabs(manager, _G.CURRENT_CHAT_FRAME_ID)
  GW.HookAfter(manager, "UpdateSelection", chatTabs)
end

-- The chat settings window: the window skin, its header plate faded with the title kept, each box (the category
-- list and settings area, and the boxes on its pages) an inset panel with section heads, and its radios, scroll
-- bars, filter controls, tabs and check buttons, now and as the game makes boxes.
function GW.SkinChatConfig(frame)
  GW.Skin(frame)
  dress(frame, { fade = { "Header" }, titles = { "Header.Text" } })
  chatNamed()
  eachChatBox(frame, 2, skinChatBox)
  watchChatTabs(frame)
  GW.DressChecks(frame, GW.CHECK_DEPTH)
  watchCheckMakers("ChatConfigFrame", GW.CHECK_MAKERS.ChatConfigFrame, chatInside)
end
GW.AddButtons("ChatConfigFrame", {
  "ChatConfigFrameDefaultButton", "ChatConfigFrameCancelButton", "ChatConfigFrameOkayButton",
  "CombatLogDefaultButton", "TextToSpeechDefaultButton", "ChatConfigCombatSettingsFiltersDeleteButton",
  "ChatConfigCombatSettingsFiltersAddFilterButton", "ChatConfigCombatSettingsFiltersCopyFilterButton",
  "CombatConfigSettingsSaveButton", "ChatConfigFrameRedockButton",
})

GW.Add("system", "framed", { "AddonList" }, GW.SkinAddonList)
GW.Add("system", "framed", { "ChatConfigFrame" }, GW.SkinChatConfig)
GW.Add("system", "framed", { "NamePlatesTutorial" }, GW.SkinNamePlatesTutorial)

-- Edit Mode windows ---------------------------------------------------------------------------

-- The account settings' section titles (the Frames, Combat and Misc groups), under the options container's scroll child.
local EDIT_SECTIONS = "AccountSettings.SettingsContainer.ScrollChild.AdvancedOptionsContainer."

-- Edit Mode's main window (a ResizeLayoutFrame): Border faded, the title in the theme font, the layout label light,
-- the layout dropdown, the close and the Save and Revert buttons themed, the grid spacing slider, the options well
-- (its ring faded, an inset panel kept out of the layout, its scroll bar), the section titles as section heads and
-- the line over the expander. Vanguard's note under it (Core/Movers.lua) is its own child frame and is left as it is.
local editMode = skinner({
  layout = true, art = { "Border", "AccountSettings.SettingsContainer.BorderArt" }, titles = { "Title" }, labels = { "LayoutLabel" },
  close = { "CloseButton" }, buttons = { "SaveChangesButton", "RevertAllChangesButton" }, dropdowns = { "LayoutDropdown" },
  sliders = { "GridSpacingSlider.Slider" }, layoutInsets = { "AccountSettings.SettingsContainer" },
  bars = { "AccountSettings.SettingsContainer.ScrollBar" }, dividers = { "AccountSettings.Expander.Divider" },
  sections = { EDIT_SECTIONS .. "FramesTitle.Title", EDIT_SECTIONS .. "CombatTitle.Title", EDIT_SECTIONS .. "MiscTitle.Title" },
})
-- How many frames deep inside Edit Mode's window its check buttons are looked for (the account settings' rows keep
-- theirs seven down).
GW.EDIT_CHECK_DEPTH = 7
-- Skins Edit Mode's window (see editMode), then every check button in it: the grid and snap switches and the
-- account settings' rows.
function GW.SkinEditMode(frame)
  editMode(frame)
  GW.DressChecks(frame, GW.EDIT_CHECK_DEPTH)
end

-- The other Edit Mode dialogs: Border faded, the title in the theme font, their field labels light, their name box,
-- character-specific check box and buttons themed, and the import box (its ring faded, an inset panel, its scroll bar).
GW.SkinEditDialog = skinner({
  art = { "Border" }, titles = { "Title" }, labels = { "EditBoxLabel", "NameEditBoxLabel" }, edits = { "LayoutNameEditBox" },
  checks = { "CharacterSpecificLayoutCheckButton.Button" }, fade = { "ImportBox" }, insets = { "ImportBox" }, bars = { "ImportBox.ScrollBar" },
  buttons = { "AcceptButton", "CancelButton", "SaveAndProceedButton", "ProceedButton" },
})

-- The buttons in a system's settings dialog (its Revert button, and the extra ones a system adds), themed.
local function dressExtraButtons(dialog)
  local box = dialog.Buttons
  if type(box) ~= "table" or not box.GetChildren then return end
  for _, child in ipairs({ box:GetChildren() }) do
    if child.GetObjectType and child:GetObjectType() == "Button" then T.Button(child) end
  end
end

-- One setting of a system's settings dialog (pooled: a check box, a dropdown or a slider with steppers, each under
-- its key) in the theme; a part the setting lacks is skipped.
local function dressSetting(setting)
  GW.SkinCheck(setting.Button)
  GW.SkinDropdown(setting.Dropdown)
  if type(setting.Slider) == "table" then T.Slider(setting.Slider) end
end

-- The settings the dialog shows now in the theme (the game takes them from pools, so this runs after each UpdateSettings).
local function dressSettings(dialog)
  local box = dialog.Settings
  if type(box) ~= "table" or not box.GetChildren then return end
  for _, setting in ipairs({ box:GetChildren() }) do dressSetting(setting) end
end

-- A system's settings dialog (also a ResizeLayoutFrame): Border faded, title and close button, the line between
-- Revert and the extra buttons.
local editSettings = skinner({
  layout = true, art = { "Border" }, titles = { "Title" }, close = { "CloseButton" }, dividers = { "Buttons.Divider" },
})
-- The dialog's skin, its settings and its buttons, again whenever the game rebuilds them (UpdateSettings, UpdateExtraButtons).
function GW.SkinEditSettings(dialog)
  editSettings(dialog)
  dressSettings(dialog)
  dressExtraButtons(dialog)
  GW.HookAfter(dialog, "UpdateSettings", dressSettings)
  GW.HookAfter(dialog, "UpdateExtraButtons", dressExtraButtons)
end

GW.Add("system", "framed", { "EditModeManagerFrame" }, GW.SkinEditMode)
GW.Add("system", "framed", { "EditModeSystemSettingsDialog" }, GW.SkinEditSettings)
GW.Add("system", "framed", {
  "EditModeLayoutDialog", "EditModeImportLayoutDialog", "EditModeImportLayoutLinkDialog", "EditModeUnsavedChangesDialog",
}, GW.SkinEditDialog)

-- Keybinding, Cooldown Manager settings, click bindings ----------------------------------------

-- The quick keybind banner: its dialog border and header plate faded (its white texts kept), a panel
-- behind it, its three push buttons, its character-specific check box and the header title themed. The banner
-- is a protected frame, so only textures and font strings are touched, and not in combat (it waits until combat ends).
local quickKeybind = skinner({
  art = { "BG" }, fade = { "Header" }, titles = { "Header.Text" }, buttons = { "DefaultsButton", "CancelButton", "OkayButton" },
  checks = { "UseCharacterBindingsButton" },
})
-- Skins the banner now, or right after combat.
function GW.SkinQuickKeybind(frame)
  ns.OutOfCombat(function() quickKeybind(frame) end, "WindowsSystem.QuickKeybind")
end

-- The Cooldown Manager's settings window: the window skin, its search box (magnifier kept), scroll bar, layout
-- dropdown, gear dropdown on a control tile and Revert button (its side tabs are the tabs stream's).
local cooldownSettings = withWindowSkin({
  searches = { "SearchBox" }, bars = { "CooldownScroll.ScrollBar" }, dropdowns = { "LayoutDropdown" },
  plates = { "SettingsDropdown" }, buttons = { "UndoButton" },
})

-- The header bar of each category the window shows (the game pools the category frames and fills them again in
-- RefreshLayout) as a theme button.
local function cooldownHeaders(window)
  local content = part(window, "CooldownScroll.Content")
  if not content then return end
  for _, category in ipairs({ content:GetChildren() }) do GW.SkinButton(category.Header) end
end

-- Skins the Cooldown Manager's settings window, and its category headers now and after each RefreshLayout.
function GW.SkinCooldownSettings(window)
  cooldownSettings(window)
  cooldownHeaders(window)
  GW.HookAfter(window, "RefreshLayout", cooldownHeaders)
end

-- What a click binding row keeps of the art the theme fades: its spell icon and the marks that say it is new or
-- being bound, which are state.
GW.BINDING_KEEP = { "Icon", "IconHighlight", "NewOutline", "EmptySlotIconHighlight" }

-- A row of the click bindings (the game pools them): a theme row (its plate and gold hover glow faded for the
-- washes), its delete button on a control tile with its red cross kept.
local function bindingRow(row)
  GW.DressRow(row, GW.BINDING_KEEP)
  GW.SkinPlate(row.DeleteButton)
end

-- The tutorial card over the list (a small window of its own): the window skin, its picture kept.
local function bindingTutorial(window)
  local card = window.TutorialFrame
  if type(card) ~= "table" or not card.GetRegions then return end
  GW.Skin(card)
  GW.ShowTexture(card.Tutorial)
end

-- The click-casting window (the game's own binding list): the window skin, its three buttons, the list's backdrop,
-- the scroll bar, the mouseover cast box, key dropdown and its label.
local clickBinding = withWindowSkin({
  buttons = { "SaveButton", "AddBindingButton", "ResetButton" }, fade = { "ScrollBoxBackground.NineSlice" },
  insets = { "ScrollBoxBackground" }, bars = { "ScrollBar" }, checks = { "EnableMouseoverCastCheckbox" },
  dropdowns = { "MouseoverCastKeyDropdown" }, labels = { "MouseoverCastKeyDropdown.Label" },
})
-- Skins the click binding window (see clickBinding), its rows as the game takes them, and the tutorial card.
function GW.SkinClickBinding(window)
  clickBinding(window)
  GW.WatchRows(window.ScrollBox, bindingRow)
  bindingTutorial(window)
end

-- The Cooldown Manager's two alert dialogs (the sound alert and the group buff visual alert, one base template): the
-- dark border faded, title and close button, the cooldown's name light, the group labels over the dropdowns as
-- section heads, the dropdowns and the Add button themed. The spell icon stays the game's.
GW.SkinCooldownAlert = skinner({
  art = { "BG" }, titles = { "Title" }, close = { "CloseButton" }, labels = { "Name" }, buttons = { "AddButton" },
  sections = { "PrimaryLabel", "EventLabel", "PayloadLabel" }, keep = { "Icon" },
  dropdowns = { "TypeDropdown", "EventDropdown", "PayloadDropdown", "VisualDropdown" },
})

-- The movement pad (Blizzard_MovePad, off until ticked in the game's options) --------------------

-- The pad's seven buttons by name: the six movement toggles (check buttons) and the jump button.
GW.MOVE_BUTTONS = {
  "MovePadForward", "MovePadBackward", "MovePadStrafeLeft", "MovePadStrafeRight", "MovePadRotateLeft", "MovePadRotateRight", "MovePadJump",
}

-- The pad toggles whose clicks are followed, by button.
local vgMoveClicks = ns.FrameState("vgMoveClicks")

-- One pad button as a theme row with its arrow or jump picture kept; a toggle (a check button) shows the one selected look
-- while the game has it checked, in place of the game's glow: after a click (the client flips the check itself, and the
-- pad only reads it) and after the game's own SetChecked (it unchecks the opposite direction).
local function moveButton(button)
  GW.DressRow(button, { "icon" })
  if type(button) ~= "table" or type(button.GetChecked) ~= "function" then return end
  T.SelectRow(button, button:GetChecked() == true)
  GW.HookAfter(button, "SetChecked", function(b, on) T.SelectRow(b, on == true) end)
  if vgMoveClicks[button] then return end
  vgMoveClicks[button] = true
  button:HookScript("OnClick", ns.Guard("move pad click", function(b) T.SelectRow(b, b:GetChecked() == true) end))
end

-- The movement pad: the tooltip-style backdrop faded under a HUD panel, the seven buttons and the settings gear on a
-- control tile. Its dragging, locking and the keys it holds down stay the game's.
function GW.SkinMovePad(frame)
  T.FadeRegions(frame)
  GW.FadeFrame(frame.NineSlice)
  T.HudPanel(frame, { alpha = 0.9 })
  GW.SkinPlate(frame.SettingsDropdown)
  for _, name in ipairs(GW.MOVE_BUTTONS) do moveButton(_G[name]) end
end

-- The Lua error window ----------------------------------------------------------------------

-- The error window's close cross (the dialog template's own button, named after the window; its bottom Close is a push
-- button under CloseButton) in the theme and its corner.
local function errorsClose(frame)
  local name = frame.GetName and frame:GetName()
  GW.DressClose(frame, name and _G[name .. "Close"])
end

-- The error window's parts: title and index in the theme, the text well's scroll bar, the Reload and Close buttons.
local scriptErrors = skinner({
  titles = { "Title" }, labels = { "IndexLabel" }, buttons = { "Reload", "CloseButton" }, bars = { "ScrollFrame.ScrollBar" },
})
-- The error window: the dialog template's border and title strip faded under a panel, its parts (see scriptErrors), the
-- cross, and the previous and next arrows. The error text keeps the game's colour codes; the window stays the game's own
-- dialog, in the same place.
function GW.SkinScriptErrors(frame)
  scriptErrors(frame)
  errorsClose(frame)
  GW.SkinArrow(frame.PreviousError, "left")
  GW.SkinArrow(frame.NextError, "right")
end

GW.Add("system", "framed", { "QuickKeybindFrame" }, GW.SkinQuickKeybind)
GW.Add("system", "framed", { "CooldownViewerSettings" }, GW.SkinCooldownSettings)
GW.Add("system", "framed", { "CooldownViewerLayoutDialog", "CooldownViewerImportLayoutDialog" }, GW.SkinEditDialog)
GW.Add("system", "framed", { "CooldownViewerSettingsEditAlert", "GroupBuffFilterEditVisualAlert" }, GW.SkinCooldownAlert)
GW.Add("system", "onDemand", "Blizzard_MovePad", { "MovePadFrame" }, GW.SkinMovePad)
GW.Add("system", "framed", { "ScriptErrorsFrame" }, GW.SkinScriptErrors)
GW.Add("system", "onDemand", "Blizzard_ClickBindingUI", { "ClickBindingFrame" }, GW.SkinClickBinding)

-- Help, report, splash, colour picker, death recap, combat log bar ---------------------------

-- The report window's field labels, as parts of it (the reason's label, the details and screenshot texts).
GW.REPORT_LABELS = {
  "ReportingMajorCategoryDropdown.Label", "MinorReportDescription", "ScreenshotReportingFrame.ScreenshotDescription",
  "ScreenshotReportingFrame.ScreenshotEmptyText",
}

-- The report window (a ResizeLayoutFrame, so its panel stays out of the layout): the inset plates
-- and watermark faded, Border faded, the title and close button, the reason dropdown, the labels light, the
-- comment box (its ring faded, an inset panel, its scroll bar), the Report and screenshot buttons.
local reportFrame = skinner({
  layout = true, art = { "Border" }, titles = { "TitleText" }, close = { "CloseButton" }, dropdowns = { "ReportingMajorCategoryDropdown" },
  labels = GW.REPORT_LABELS, fade = { "Comment" }, insets = { "Comment" }, bars = { "Comment.ScrollBar" },
  buttons = { "ReportButton", "ScreenshotReportingFrame.TakeScreenshotButton" },
})

-- One minor-category button of the report window (a pooled check button that is a row of the list): a theme row, its
-- selected look following the game's SetChecked (the choice is many-of-many).
local function minorButton(button)
  GW.DressRow(button)
  T.SelectRow(button, button:GetChecked() == true)
  GW.HookAfter(button, "SetChecked", function(b, on) T.SelectRow(b, on == true) end)
end

-- The minor-category buttons the window shows now, in the theme (the game pools them, and runs AnchorMinorCategory for each).
local function minorButtons(frame)
  local pool = frame.MinorCategoryButtonPool
  if type(pool) ~= "table" or type(pool.EnumerateActive) ~= "function" then return end
  for button in pool:EnumerateActive() do minorButton(button) end
end

-- Skins the report window (see reportFrame), and its minor-category buttons now and as the game anchors them.
function GW.SkinReport(frame)
  reportFrame(frame)
  minorButtons(frame)
  GW.HookAfter(frame, "AnchorMinorCategory", minorButtons)
end

-- Lifts the help browser's bottom edge off the window's, so the page has the same breathing room below as beside it.
local function padHelpBrowser(frame)
  local browser = part(frame, "Browser")
  if type(browser) ~= "table" or not browser.SetPoint then return end
  browser:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -T.SPACE.tight, T.SPACE.pad)
end

-- The help window: the window skin and the ring round its browser (a well faded for an inset; the page is content),
-- and the browser's bottom edge lifted (out of combat) so the page does not run to the window's edge.
function GW.SkinHelp(frame)
  GW.Skin(frame)
  GW.InsetPanel(part(frame, "Browser.BrowserInset"))
  ns.OutOfCombat(function() padHelpBrowser(frame) end, "WindowsSystem.HelpBrowserPad")
end

-- The help ticket status: the frame's art faded except the ticket icon, a panel, and its button's backdrop faded.
function GW.SkinTicketStatus(frame)
  local icon = _G.TicketStatusFrameIcon
  T.FadeRegions(frame, type(icon) == "table" and { [icon] = true } or nil)
  T.Panel(frame, { shadow = true })
  local button = _G.TicketStatusFrameButton
  if type(button) == "table" and type(button.NineSlice) == "table" then fadeRegions(button.NineSlice) end
  GW.SkinText(_G.TicketStatusTitleText, "small", "text")
end

-- The report-cheating dialog: the window skin, its comment box an inset panel, and its title (a named string).
local reportCheating = withWindowSkin({ buttons = { "reportButton" }, fade = { "CommentFrame" }, insets = { "CommentFrame" } })
-- Skins the dialog, and its title in the title role.
function GW.SkinReportCheating(frame)
  reportCheating(frame)
  local title = _G.ReportCheatingDialogTitle
  GW.SkinTitle(title)
end
GW.AddButtons("ReportCheatingDialog", { "ReportCheatingDialogCancelButton" })

-- The splash window (what's new): its big art stays; a panel goes behind it, on a child frame one
-- level below the window so it draws under the art, and its two close buttons and buttons are themed.
function GW.SkinSplash(frame)
  if not vgBack[frame] then
    vgBack[frame] = CreateFrame("Frame", nil, frame)
    vgBack[frame]:SetAllPoints(frame)
    vgBack[frame]:SetFrameLevel(math.max(0, frame:GetFrameLevel() - 1))
  end
  T.Panel(vgBack[frame], { shadow = true })
  dress(frame, { close = { "TopCloseButton" }, buttons = { "BottomCloseButton" } })
end

-- The colour picker: Border and header plate faded, a panel, the title, Cancel/Okay and the hex box
-- themed, the # beside the box a quiet hint. The wheel, value and alpha bars and the swatches are untouched.
GW.SkinColorPicker = skinner({
  art = { "Border" }, fade = { "Header" }, titles = { "Header.Text" }, hints = { "Content.HexBox.Hash" },
  buttons = { "Footer.CancelButton", "Footer.OkayButton" }, edits = { "Content.HexBox" },
})

-- The opacity slider's "+" and "-" (unnamed font strings among its regions) in the secondary text color.
local function opacityMarks(slider)
  for _, region in ipairs({ slider:GetRegions() }) do
    if region.SetTextColor and region ~= _G.OpacityFrameSliderText then T.Color(region, "text2") end
  end
end

-- The opacity slider window: Border faded, a panel, its (global) slider in the theme, its OPACITY label light and the
-- two marks quiet.
local opacityFrame = skinner({ art = { "Border" } })
-- Skins the opacity window (see opacityFrame), then its slider and texts.
function GW.SkinOpacity(frame)
  opacityFrame(frame)
  local slider = _G.OpacityFrameSlider
  if type(slider) ~= "table" then return end
  T.Slider(slider)
  opacityMarks(slider)
  GW.SkinText(_G.OpacityFrameSliderText, "label", "text")
end

-- The death recap window: its border pieces, background and divider faded (the rows keep the game's
-- look), a panel, the title, the X close button and the Close push button, the list on an inset with its scroll
-- bar, the divider line under the title and the "unavailable" message quiet.
GW.SkinDeathRecap = skinner({
  titles = { "Title" }, close = { "CloseXButton" }, buttons = { "CloseButton" }, insets = { "ScrollBox" },
  bars = { "ScrollBar" }, dividers = { "Divider" }, hints = { "Unavailable" },
})

-- Themes the combat log bar's filter buttons (the game makes them as it needs them).
local function dressQuickButtons()
  local i = 1
  while type(_G["CombatLogQuickButtonFrameButton" .. i]) == "table" do
    T.Button(_G["CombatLogQuickButtonFrameButton" .. i])
    i = i + 1
  end
end

-- The combat log bar's own parts: the additional filters button (a down arrow) as a theme arrow button, and the
-- progress bar it shows while filtering in the theme's bar texture and the accent.
local function dressLogParts()
  GW.SkinArrow(_G.CombatLogQuickButtonFrame_CustomAdditionalFilterButton, "down")
  local bar = _G.CombatLogQuickButtonFrame_CustomProgressBar
  if type(bar) ~= "table" or not bar.SetStatusBarTexture then return end
  T.StyleBar(bar)
  T.BarColor(bar, "accent")
end

-- The combat log's filter bar: its black strip faded, an inset panel (a borderless band while the
-- Chat module is on, whose panel seats it under the bar's rule; with Chat off the game's own layout
-- stands and the strip keeps its border), its own parts, its filter buttons themed now and whenever
-- the game shows or refreshes the bar or picks a filter (that is when it makes buttons).
function GW.SkinCombatLogBar(frame)
  local band = ns.ModuleEnabled("Chat")
  T.FadeRegions(frame)
  T.Panel(frame, { inset = true, noBorder = band, noSheen = band })
  dressLogParts()
  dressQuickButtons()
  if vgQuickButtons[frame] or type(hooksecurefunc) ~= "function" then return end
  vgQuickButtons[frame] = true
  for _, script in ipairs({ "OnShow", "OnEvent" }) do frame:HookScript(script, dressQuickButtons) end
  if type(_G.Blizzard_CombatLog_QuickButton_OnClick) == "function" then hooksecurefunc("Blizzard_CombatLog_QuickButton_OnClick", ns.Guard("hook Blizzard_CombatLog_QuickButton_OnClick", dressQuickButtons)) end
end

GW.Add("system", "framed", { "HelpFrame" }, GW.SkinHelp)
GW.Add("system", "framed", { "TicketStatusFrame" }, GW.SkinTicketStatus)
GW.Add("system", "framed", { "ReportFrame" }, GW.SkinReport)
GW.Add("system", "framed", { "ReportCheatingDialog" }, GW.SkinReportCheating)
GW.Add("system", "framed", { "SplashFrame" }, GW.SkinSplash)
GW.Add("system", "framed", { "ColorPickerFrame" }, GW.SkinColorPicker)
GW.Add("system", "framed", { "OpacityFrame" }, GW.SkinOpacity)
GW.Add("system", "onDemand", "Blizzard_DeathRecap", { "DeathRecapFrame" }, GW.SkinDeathRecap)
GW.Add("system", "onDemand", "Blizzard_CombatLog", { "CombatLogQuickButtonFrame_Custom" }, GW.SkinCombatLogBar)
