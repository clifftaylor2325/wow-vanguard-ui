-- Game windows, system group: Game options, addon list, chat config, Edit Mode windows, keybinding, Cooldown Manager settings, help, colour picker, death recap, in the
-- Vanguard look. Filled by stream S3 of docs/handoff/RESKIN-PLAN.md; registers with
-- GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.
-- Each window keeps its own layout and buttons: art faded by alpha, a flat panel behind it,
-- its buttons, edit boxes, tabs and headings themed. Every part is optional (a client may lack it).

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgBack = ns.FrameState("vgBack")
local vgChecked = ns.FrameState("vgChecked")
local vgExtraButtons = ns.FrameState("vgExtraButtons")
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

-- A heading font string in the theme font, gold.
local function heading(p)
  if p.SetFont then T.Text(p, "heading", "gold") end
end

-- A game tab's selected state: the tab's raised look follows the game's SelectableButton calls.
local function tabSelected(tab, selected)
  vgChecked[tab] = selected == true
  T.Tab(tab)
end

-- A panel tab (MinimalTabTemplate) in the theme; its selection comes through OnSelected.
local function skinTab(tab)
  T.Tab(tab)
  if vgTabWatched[tab] or type(tab.OnSelected) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  vgTabWatched[tab] = true
  hooksecurefunc(tab, "OnSelected", ns.Guard("hook OnSelected", tabSelected))
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

-- What a skin spec can list, in order: the parts (parentKey paths) each step is applied to (each
-- step is given the part and the window).
local STEPS = {
  { "art", fadeAll }, { "fade", fadeRegions }, { "close", close }, { "buttons", T.Button },
  { "edits", T.EditBox }, { "tabs", skinTab }, { "insets", inset }, { "titles", heading }, { "keep", restore },
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

-- The frame's regions and child frames, as a set.
local function members(frame)
  local set = {}
  for _, r in ipairs({ frame:GetRegions() }) do set[r] = true end
  for _, c in ipairs({ frame:GetChildren() }) do set[c] = true end
  return set
end

-- Paints the flat panel with a shadow. On one of the game's layout frames (spec.layout: Edit
-- Mode's windows resize themselves from every child region, and the shadow reaches past the
-- edge) the pieces the panel adds are marked ignoreInLayout, so Layout() leaves them out.
local function paint(frame, spec)
  local before = spec.layout and members(frame)
  T.Panel(frame, { shadow = true })
  if not before then return end
  for piece in pairs(members(frame)) do
    if not before[piece] then piece.ignoreInLayout = true end
  end
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
  buttons = { "ApplyButton", "CloseButton" }, edits = { "SearchBox" }, tabs = { "GameTab", "AddOnsTab" },
  insets = { "CategoryList", "Container.SettingsList" }, titles = { "NineSlice.Text" },
}
-- Skins the game's options window. (Blizzard_Settings_Shared has no named settings font objects on
-- Forever, so no fonts are set; the pages in Container/SettingsCanvas stay the game's.)
GW.SkinSettings = skinner(GW.SETTINGS_SPEC)

GW.Add("system", "framed", { "SettingsPanel" }, GW.SkinSettings)

-- Addon list, chat config, nameplates tutorial -----------------------------------------------

-- A skin for a window GW.Skin handles (art faded, panel, close button, title) with more parts dressed.
local function withWindowSkin(spec)
  return function(frame)
    GW.Skin(frame)
    dress(frame, spec)
  end
end

-- How many frames deep inside a window its check buttons are looked for: the addon list's rows keep theirs
-- four down (ScrollBox, ScrollTarget, the row, Enabled), the chat settings' boxes five.
GW.CHECK_DEPTH = 5

-- Every check button inside frame, up to depth frames down (GW.CHECK_DEPTH unless given), as a themed check
-- box (T.CheckBox); safe to run again, as these windows make their rows and boxes as they draw.
function GW.DressChecks(frame, depth)
  depth = depth or GW.CHECK_DEPTH
  if type(frame) ~= "table" or not frame.GetChildren then return end
  for _, child in ipairs({ frame:GetChildren() }) do
    if child.GetObjectType and child:GetObjectType() == "CheckButton" then T.CheckBox(child)
    elseif depth > 1 then GW.DressChecks(child, depth - 1) end
  end
end

-- The game's functions already hooked to dress a window's check buttons, by name.
local vgCheckMakers = {}

-- The game's functions that make a window's check buttons as it draws (the addon list's update and the
-- initialiser its scroll box runs on each row it takes into view, the chat settings' box makers), by the
-- window's global name.
GW.CHECK_MAKERS = {
  AddonList = { "AddonList_Update", "AddonList_InitButton" },
  ChatConfigFrame = { "ChatConfig_CreateCheckboxes", "ChatConfig_CreateTieredCheckboxes" },
}

-- Dresses check buttons after each of the game's functions in names runs: those inside the frame the function
-- was handed (a row, a box group) when it takes one, else the whole window (a global frame name). Hooked once
-- per function (a post-hook; the game's function is kept), while the system group is on.
local function watchCheckMakers(window, names)
  for _, name in ipairs(names) do
    if not vgCheckMakers[name] and type(hooksecurefunc) == "function" and type(_G[name]) == "function" then
      vgCheckMakers[name] = true
      hooksecurefunc(name, ns.Guard("hook " .. name, function(frame)
        local target = type(frame) == "table" and frame.GetChildren and frame or _G[window]
        if GW.settings and GW.settings.system and type(target) == "table" then GW.DressChecks(target) end
      end))
    end
  end
end

-- The addon list: its push buttons and search box, and each row's check button (the rows' other parts keep the game's look).
local skinAddonList = withWindowSkin({
  buttons = { "CancelButton", "OkayButton", "EnableAllButton", "DisableAllButton" }, edits = { "SearchBox" },
})
-- Skins the addon list (see skinAddonList), then its rows' check buttons, now and as the game makes rows.
function GW.SkinAddonList(frame)
  skinAddonList(frame)
  GW.DressChecks(frame, GW.CHECK_DEPTH)
  watchCheckMakers("AddonList", GW.CHECK_MAKERS.AddonList)
end
-- The nameplates tutorial: the window skin, but its four picture cards are the content, so they stay.
GW.SkinNamePlatesTutorial = withWindowSkin({ keep = { "StyleOptions", "Aggro", "BuffsDebuffs", "EnemyVsFriendly" } })

-- Whether a child of the chat settings window is one of its boxes: it has the game's NineSlice
-- (ChatConfigBoxTemplate), or its name ends in Backdrop or Background.
local function isChatBox(child)
  local name = child.GetName and child:GetName() or ""
  return type(child.NineSlice) == "table" or name:find("Backdrop$") ~= nil or name:find("Background$") ~= nil
end

-- One box of the chat settings in the theme: its border art faded, an inset panel behind it.
local function skinChatBox(box)
  if type(box.NineSlice) == "table" then fadeRegions(box.NineSlice) end
  fadeRegions(box)
  inset(box)
end

-- The chat settings window: the window skin, its header plate faded with the title kept, each box
-- directly under it (the category list and the settings area) an inset panel, and its check buttons, now
-- and as the game makes boxes.
function GW.SkinChatConfig(frame)
  GW.Skin(frame)
  dress(frame, { fade = { "Header" }, titles = { "Header.Text" } })
  for _, child in ipairs({ frame:GetChildren() }) do
    if isChatBox(child) then skinChatBox(child) end
  end
  GW.DressChecks(frame, GW.CHECK_DEPTH)
  watchCheckMakers("ChatConfigFrame", GW.CHECK_MAKERS.ChatConfigFrame)
end
GW.AddButtons("ChatConfigFrame", {
  "ChatConfigFrameDefaultButton", "ChatConfigFrameCancelButton", "ChatConfigFrameOkayButton",
  "CombatLogDefaultButton", "TextToSpeechDefaultButton",
})

GW.Add("system", "framed", { "AddonList" }, GW.SkinAddonList)
GW.Add("system", "framed", { "ChatConfigFrame" }, GW.SkinChatConfig)
GW.Add("system", "framed", { "NamePlatesTutorial" }, GW.SkinNamePlatesTutorial)

-- Edit Mode windows ---------------------------------------------------------------------------

-- Edit Mode's main window (a ResizeLayoutFrame): Border faded, the title and layout label in the
-- theme font, the close and the Save and Revert buttons themed. Vanguard's note under it
-- (Core/Movers.lua) is its own child frame and is left as it is.
GW.SkinEditMode = skinner({
  layout = true, art = { "Border" }, titles = { "Title", "LayoutLabel" }, close = { "CloseButton" },
  buttons = { "SaveChangesButton", "RevertAllChangesButton" },
})

-- The other Edit Mode dialogs: Border faded, the title in the theme font, their name box and buttons themed.
GW.SkinEditDialog = skinner({
  art = { "Border" }, titles = { "Title" }, edits = { "LayoutNameEditBox" },
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

-- A system's settings dialog (also a ResizeLayoutFrame): Border faded, title and close button.
local editSettings = skinner({ layout = true, art = { "Border" }, titles = { "Title" }, close = { "CloseButton" } })
-- The dialog's skin, and its buttons, again whenever the game rebuilds the extra ones (UpdateExtraButtons).
function GW.SkinEditSettings(dialog)
  editSettings(dialog)
  dressExtraButtons(dialog)
  if vgExtraButtons[dialog] or type(dialog.UpdateExtraButtons) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  vgExtraButtons[dialog] = true
  hooksecurefunc(dialog, "UpdateExtraButtons", ns.Guard("hook UpdateExtraButtons", dressExtraButtons))
end

GW.Add("system", "framed", { "EditModeManagerFrame" }, GW.SkinEditMode)
GW.Add("system", "framed", { "EditModeSystemSettingsDialog" }, GW.SkinEditSettings)
GW.Add("system", "framed", {
  "EditModeLayoutDialog", "EditModeImportLayoutDialog", "EditModeImportLayoutLinkDialog", "EditModeUnsavedChangesDialog",
}, GW.SkinEditDialog)

-- Keybinding, Cooldown Manager settings, click bindings ----------------------------------------

-- The quick keybind banner: its dialog border and header plate faded (its white texts kept), a panel
-- behind it, its three push buttons and the header title themed. The banner is a protected frame, so
-- only textures and font strings are touched, and not in combat (it waits until combat ends).
local quickKeybind = skinner({
  art = { "BG" }, fade = { "Header" }, titles = { "Header.Text" }, buttons = { "DefaultsButton", "CancelButton", "OkayButton" },
})
-- Skins the banner now, or right after combat.
function GW.SkinQuickKeybind(frame)
  ns.OutOfCombat(function() quickKeybind(frame) end, "WindowsSystem.QuickKeybind")
end

-- The Cooldown Manager's settings window: the window skin and its search box (its side tabs are the tabs stream's).
GW.SkinCooldownSettings = withWindowSkin({ edits = { "SearchBox" } })
-- The click-casting window (the game's own binding list): the window skin, its three buttons, the list's backdrop.
GW.SkinClickBinding = withWindowSkin({
  buttons = { "SaveButton", "AddBindingButton", "ResetButton" },
  fade = { "ScrollBoxBackground.NineSlice" }, insets = { "ScrollBoxBackground" },
})

GW.Add("system", "framed", { "QuickKeybindFrame" }, GW.SkinQuickKeybind)
GW.Add("system", "framed", { "CooldownViewerSettings" }, GW.SkinCooldownSettings)
GW.Add("system", "framed", { "CooldownViewerLayoutDialog", "CooldownViewerImportLayoutDialog" }, GW.SkinEditDialog)
GW.Add("system", "onDemand", "Blizzard_ClickBindingUI", { "ClickBindingFrame" }, GW.SkinClickBinding)

-- Help, report, splash, colour picker, death recap, combat log bar ---------------------------

-- The report window (a ResizeLayoutFrame, so its panel stays out of the layout): the inset plates
-- and watermark faded, Border faded, the title and close button, the Report and screenshot buttons.
GW.SkinReport = skinner({
  layout = true, art = { "Border" }, titles = { "TitleText" }, close = { "CloseButton" },
  buttons = { "ReportButton", "ScreenshotReportingFrame.TakeScreenshotButton" },
})

-- The help ticket status: the frame's art faded except the ticket icon, a panel, and its button's backdrop faded.
function GW.SkinTicketStatus(frame)
  local icon = _G.TicketStatusFrameIcon
  T.FadeRegions(frame, type(icon) == "table" and { [icon] = true } or nil)
  T.Panel(frame, { shadow = true })
  local button = _G.TicketStatusFrameButton
  if type(button) == "table" and type(button.NineSlice) == "table" then fadeRegions(button.NineSlice) end
end

-- The report-cheating dialog: the window skin, its comment box an inset panel, and its title (a named string).
local reportCheating = withWindowSkin({ buttons = { "reportButton" }, fade = { "CommentFrame" }, insets = { "CommentFrame" } })
-- Skins the dialog, and its title in the theme font.
function GW.SkinReportCheating(frame)
  reportCheating(frame)
  local title = _G.ReportCheatingDialogTitle
  if type(title) == "table" then heading(title) end
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
-- themed. The wheel, value and alpha bars and the swatches are untouched.
GW.SkinColorPicker = skinner({
  art = { "Border" }, fade = { "Header" }, titles = { "Header.Text" },
  buttons = { "Footer.CancelButton", "Footer.OkayButton" }, edits = { "Content.HexBox" },
})
-- The opacity slider window: Border faded, a panel (the slider is the game's).
GW.SkinOpacity = skinner({ art = { "Border" } })

-- The death recap window: its border pieces, background and divider faded (the rows keep the game's
-- look), a panel, the title, the X close button and the Close push button.
GW.SkinDeathRecap = skinner({ titles = { "Title" }, close = { "CloseXButton" }, buttons = { "CloseButton" } })

-- Themes the combat log bar's filter buttons (the game makes them as it needs them).
local function dressQuickButtons()
  local i = 1
  while type(_G["CombatLogQuickButtonFrameButton" .. i]) == "table" do
    T.Button(_G["CombatLogQuickButtonFrameButton" .. i])
    i = i + 1
  end
end

-- The combat log's filter bar: its black strip faded, an inset panel, its filter buttons themed now
-- and whenever the game shows or refreshes the bar or picks a filter (that is when it makes buttons).
function GW.SkinCombatLogBar(frame)
  T.FadeRegions(frame)
  T.Panel(frame, { inset = true })
  dressQuickButtons()
  if vgQuickButtons[frame] or type(hooksecurefunc) ~= "function" then return end
  vgQuickButtons[frame] = true
  for _, script in ipairs({ "OnShow", "OnEvent" }) do frame:HookScript(script, dressQuickButtons) end
  if type(_G.Blizzard_CombatLog_QuickButton_OnClick) == "function" then hooksecurefunc("Blizzard_CombatLog_QuickButton_OnClick", ns.Guard("hook Blizzard_CombatLog_QuickButton_OnClick", dressQuickButtons)) end
end

GW.Add("system", "framed", { "HelpFrame" })
GW.Add("system", "framed", { "TicketStatusFrame" }, GW.SkinTicketStatus)
GW.Add("system", "framed", { "ReportFrame" }, GW.SkinReport)
GW.Add("system", "framed", { "ReportCheatingDialog" }, GW.SkinReportCheating)
GW.Add("system", "framed", { "SplashFrame" }, GW.SkinSplash)
GW.Add("system", "framed", { "ColorPickerFrame" }, GW.SkinColorPicker)
GW.Add("system", "framed", { "OpacityFrame" }, GW.SkinOpacity)
GW.Add("system", "onDemand", "Blizzard_DeathRecap", { "DeathRecapFrame" }, GW.SkinDeathRecap)
GW.Add("system", "onDemand", "Blizzard_CombatLog", { "CombatLogQuickButtonFrame_Custom" }, GW.SkinCombatLogBar)
