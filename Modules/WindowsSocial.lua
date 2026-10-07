-- Game windows, social group: Mail, guild, channels, friends sub-dialogs, the social window (Forever's friends list),
-- guild creation, role poll and the raid tab, in the Vanguard look. Filled by stream S1 of docs/handoff/RESKIN-PLAN.md; registers with
-- GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.

local ADDON, ns = ...

local T = ns.Theme
local GW = ns.GetModule("Windows")

-- Helpers ---------------------------------------------------------------------------------------

-- Frames whose game methods are already hooked here (a skin runs on every show; a hook goes on once).
local hooked = {}

-- Runs fn(frame) after the frame's game method `name` each time it runs, once per
-- frame and method; a client without the method is skipped.
local function after(frame, name, fn)
  local key = tostring(name)
  hooked[frame] = hooked[frame] or {}
  if hooked[frame][key] or type(frame[name]) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  hooked[frame][key] = true
  hooksecurefunc(frame, name, function() fn(frame) end)
end

-- Open mail -------------------------------------------------------------------------------------

-- The letter's parchment: the stationery behind the body text.
GW.MAIL_ART = { "OpenStationeryBackgroundLeft", "OpenStationeryBackgroundRight" }
-- The letter window's item buttons: the letter, the money and its attachments.
GW.MAIL_ITEMS = { "OpenMailLetterButton", "OpenMailMoneyButton" }
for i = 1, 16 do GW.MAIL_ITEMS[#GW.MAIL_ITEMS + 1] = "OpenMailAttachmentButton" .. i end

-- The letter's stationery faded and its body text in light text with gold headings (the
-- game colors the body for its parchment as each letter loads, so this runs after it).
function GW.LightMailText()
  GW.FadeNamed(GW.MAIL_ART)
  local body = _G.OpenMailBodyText
  if type(body) ~= "table" or type(body.SetTextColor) ~= "function" then return end
  for tag, token in pairs(GW.ITEM_TEXT_TAGS) do body:SetTextColor(tag, T.RGB(token)) end
end

-- The letter, money and attachment buttons with the bags' quality border.
function GW.SkinMailItems()
  local bags = ns.GetModule("Bags")
  if type(bags) ~= "table" or type(bags.SkinItem) ~= "function" then return end
  for _, name in ipairs(GW.MAIL_ITEMS) do
    local button = _G[name]
    if type(button) == "table" and button.CreateTexture then bags.SkinItem(button) end
  end
end

-- The letter window: the window skin, the parchment and body text, the item buttons; each
-- again after the game redraws the letter (OpenMailFrame:Update).
function GW.SkinOpenMail(frame)
  GW.Skin(frame)
  GW.LightMailText()
  GW.SkinMailItems()
  after(frame, "Update", GW.SkinOpenMail)
end

GW.Add("social", "framed", { "OpenMailFrame" }, GW.SkinOpenMail)
GW.AddButtons("OpenMailFrame", { "OpenMailReplyButton", "OpenMailDeleteButton", "OpenMailCancelButton", "OpenMailReportSpamButton" })

-- Guild window ----------------------------------------------------------------------------------

-- The guild window's panes (parentKeys); each has art to fade and, mostly, an InsetFrame.
GW.GUILD_PANES = { "CommunitiesList", "MemberList", "Chat", "GuildBenefitsFrame", "GuildDetailsFrame" }

-- Fades a frame's own textures and its NineSlice (a part's art), by alpha.
local function fadeFrameArt(frame)
  if type(frame) ~= "table" or not frame.GetRegions then return end
  T.FadeRegions(frame)
  if type(frame.NineSlice) == "table" and frame.NineSlice.GetRegions then T.FadeRegions(frame.NineSlice) end
end

-- One pane in the theme: its art faded and an inset panel behind it (on its InsetFrame when
-- it has one, else on the pane itself).
local function dressPane(pane)
  if type(pane) ~= "table" or not pane.GetRegions then return end
  fadeFrameArt(pane)
  local inset = type(pane.InsetFrame) == "table" and pane.InsetFrame.GetRegions and pane.InsetFrame or pane
  fadeFrameArt(inset)
  T.Panel(inset, { inset = true, noSheen = true })
end

-- The guild window: the window skin (its maximize and minimize buttons with it), the portrait art faded, each pane
-- and the stream dropdown dressed; again whenever the game switches pages (SetDisplayMode). The side tabs are the tabs stream's.
function GW.SkinGuildWindow(frame)
  GW.Skin(frame)
  GW.FadeParts(frame, { "PortraitOverlay" })
  for _, key in ipairs(GW.GUILD_PANES) do dressPane(frame[key]) end
  if type(frame.StreamDropdown) == "table" and frame.StreamDropdown.CreateTexture then T.Button(frame.StreamDropdown) end
  after(frame, "SetDisplayMode", GW.SkinGuildWindow)
end

GW.Add("social", "framed", { "CommunitiesFrame" }, GW.SkinGuildWindow)

-- Dialogs -----------------------------------------------------------------------------------------

-- The art the social dialogs draw behind them (translucent frames, dark dialog borders, headers, list borders).
GW.SOCIAL_DIALOG_ART = { "NineSlice", "Bg", "BG", "Border", "Background", "Header", "ScrollFrameBorder" }
-- Their push buttons by parentKey, and by the name suffix the game gives them ($parentAcceptButton).
GW.SOCIAL_DIALOG_BUTTONS = {
  "Accept", "Cancel", "Delete", "Close", "Copy", "LinkToChat", "GenerateLinkButton", "ChangeAvatarButton", "ContextButton",
  "OKButton", "SendButton", "CancelButton", "SendRequestButton", "FriendsDropdown",
  "UpdateButton", "BlockButton", "UnblockButton", "ExtendButton",
}
GW.SOCIAL_DIALOG_NAMED = { "AcceptButton" }
-- Their edit boxes by parentKey.
GW.SOCIAL_DIALOG_BOXES = { "NameEdit", "ShortNameEdit", "Name", "Password", "EditBox" }

-- Fades one art part named key: a texture, or a frame with its own textures and NineSlice.
local function fadeKey(frame, key)
  GW.FadeParts(frame, { key })
  fadeFrameArt(frame[key])
end

-- A dialog's close control: the game's "Close" text button as a flat button, its X button as the
-- close glyph in the window's corner (GW.DressClose).
local function dressClose(frame, button)
  if type(button) ~= "table" or not button.CreateTexture then return end
  local text = type(button.GetText) == "function" and button:GetText() or ""
  if text ~= "" then T.Button(button) else GW.DressClose(frame, button) end
end

-- Themes each part of frame named in keys that is a widget with the method `need` (T.Button, or T.EditBox for boxes).
local function dressKeys(frame, keys, need, skin)
  for _, key in ipairs(keys) do
    local part = frame[key]
    if type(part) == "table" and part[need] and part ~= frame.CloseButton then skin(part) end
  end
end

-- The parts a social dialog may have, each only if it has it: title, close control, push buttons, edit boxes.
local function dressDialogParts(frame, name)
  if type(frame.Title) == "table" and frame.Title.SetFont then T.Text(frame.Title, "heading", false) end
  dressClose(frame, frame.CloseButton or (name and _G[name .. "CloseButton"]))
  dressKeys(frame, GW.SOCIAL_DIALOG_BUTTONS, "CreateTexture", T.Button)
  dressKeys(frame, GW.SOCIAL_DIALOG_BOXES, "SetText", T.EditBox)
  for _, suffix in ipairs(GW.SOCIAL_DIALOG_NAMED) do
    local button = name and _G[name .. suffix]
    if type(button) == "table" and button.CreateTexture then T.Button(button) end
  end
end

-- A social dialog: its art faded, a flat panel with a soft shadow, its parts themed. (Not GW.Skin: the log and
-- text-edit dialogs have a text "Close" button named $parentCloseButton, which must not get the close glyph.)
function GW.SkinSocialDialog(frame)
  T.FadeRegions(frame)
  for _, key in ipairs(GW.SOCIAL_DIALOG_ART) do fadeKey(frame, key) end
  T.Panel(frame, { shadow = true })
  dressDialogParts(frame, frame.GetName and frame:GetName())
end

GW.Add("social", "framed", {
  "CommunitiesGuildLogFrame", "CommunitiesGuildNewsFiltersFrame", "CommunitiesGuildTextEditFrame", "GuildInviteFrame",
  "CommunitiesSettingsDialog", "CommunitiesAvatarPickerDialog", "CommunitiesTicketManagerDialog",
}, GW.SkinSocialDialog)
-- The rename window is a ButtonFrameTemplate: the window skin does it all.
GW.Add("social", "framed", { "GuildRenameFrame" })

-- Channels and friends dialogs ------------------------------------------------------------------

-- The add-friend window's boxes and buttons are named by the game, not parented by key.
GW.ADD_FRIEND_BOXES = { "AddFriendNameEditBox" }
GW.ADD_FRIEND_BUTTONS = { "AddFriendEntryFrameAcceptButton", "AddFriendEntryFrameCancelButton" }

-- The add-friend window: the dialog skin, its edit boxes as T.EditBox and its buttons themed.
function GW.SkinAddFriend(frame)
  GW.SkinSocialDialog(frame)
  for _, name in ipairs(GW.ADD_FRIEND_BOXES) do
    if type(_G[name]) == "table" and _G[name].SetText then T.EditBox(_G[name]) end
  end
  for _, name in ipairs(GW.ADD_FRIEND_BUTTONS) do
    if type(_G[name]) == "table" and _G[name].CreateTexture then T.Button(_G[name]) end
  end
end

-- The channels window is a ButtonFrameTemplate; the dialogs are dialog frames.
GW.Add("social", "framed", { "ChannelFrame" })
GW.Add("social", "framed", { "CreateChannelPopup", "FriendsFriendsFrame", "BattleNetInviteFrame" }, GW.SkinSocialDialog)
GW.Add("social", "framed", { "AddFriendFrame" }, GW.SkinAddFriend)

-- The social window -----------------------------------------------------------------------------

-- On Forever the friends list is the game's social window (Blizzard_SocialUI's SocialUIFrame, a
-- PortraitFrameTemplate; the old FriendsFrame stays registered for a client that still opens it): a
-- Battle.net bar under the title, a column of side tabs taken from a pool (friends, recent allies, quick
-- join, requests, recruit a friend, raid), a content pane per tab made at load, and side windows beside it.

-- Its content panes (parentKeys), one per tab; all but the raid tab's share one template.
GW.SOCIAL_PANES = { "FriendsList", "RecentAlliesList", "QuickJoinFrame", "FriendRequestsList", "RecruitAFriendFrame", "RaidFrame" }
-- A pane's push buttons (parentKeys): the action button under its list, the raid tab's two.
GW.SOCIAL_PANE_BUTTONS = { "ActionButton", "RaidInfoButton", "ConvertToRaidButton" }
-- A pane's dividers above and below its list: faded, the window's panel is its room.
GW.SOCIAL_PANE_ART = { "TopDivider", "BottomDivider" }
-- Its side windows (parentKeys): dialogs beside the window, and the ignore list (a ButtonFrameTemplate).
GW.SOCIAL_SIDE = { "BattleNetUnavailableNoticeFrame", "BattleNetBroadcastFrame", "RaidInfoFrame" }
GW.SOCIAL_SIDE_FRAMED = { "IgnoreListFrame" }

-- A button whose icon is its label (the Battle.net menu button): a flat button, its icon shown again
-- (the flat button fades every texture the game gave it).
local function iconButton(button)
  if type(button) ~= "table" or not button.CreateTexture then return end
  T.Button(button)
  if type(button.Icon) == "table" and button.Icon.SetAlpha then button.Icon:SetAlpha(1) end
end

-- A search box (SearchBoxNineSliceTemplate) as T.EditBox, its magnifier shown again.
local function searchBox(box)
  if type(box) ~= "table" or not box.SetText then return end
  T.EditBox(box)
  if type(box.searchIcon) == "table" and box.searchIcon.SetAlpha then box.searchIcon:SetAlpha(1) end
end

-- The Battle.net bar: its plate and the band behind the status dropdown and battletag faded, the status
-- dropdown flat (its presence dot is in its text), the menu button flat with its icon.
local function dressBattleNetBar(bar)
  if type(bar) ~= "table" or not bar.GetRegions then return end
  T.FadeRegions(bar)
  local box = bar.ControlsContainer
  if type(box) ~= "table" or not box.GetRegions then return end
  T.FadeRegions(box)
  dressKeys(box, { "OnlineStatusDropdown" }, "CreateTexture", T.Button)
  iconButton(box.BattleNetMenuButton)
end

-- One content pane: its dividers faded, its search bar and filter button themed, its push buttons flat.
-- (Its scroll bar is the tabs stream's; the raid tab's role buttons and group cards keep the game's art.)
local function dressSocialPane(pane)
  if type(pane) ~= "table" or not pane.GetRegions then return end
  GW.FadeParts(pane, GW.SOCIAL_PANE_ART)
  local bar = pane.FilterBar
  if type(bar) == "table" then
    searchBox(bar.SearchBar)
    dressKeys(bar, { "SearchFilterDropdown" }, "CreateTexture", T.Button)
  end
  dressKeys(pane, GW.SOCIAL_PANE_BUTTONS, "CreateTexture", T.Button)
end

-- The ignore list (a ButtonFrameTemplate beside the window): the window skin, its two buttons flat.
local function skinIgnoreList(frame)
  GW.Skin(frame)
  dressKeys(frame, GW.SOCIAL_DIALOG_BUTTONS, "CreateTexture", T.Button)
end

-- A side window: skinned now, and again on each of its own shows (it opens while the window is
-- already open, and the game lays it out then); the hook goes on once.
local function watchSide(frame, skin)
  if type(frame) ~= "table" or not frame.HookScript then return end
  skin(frame)
  if frame.vgSocialSide then return end
  frame.vgSocialSide = true
  frame:HookScript("OnShow", function(f) ns.Try("window SocialUIFrame side", skin, f) end)
end

-- The side tabs the window takes from its pool (anchored again on every RefreshTabs): each in the theme
-- with its icon and count kept, out past the window's padding, the accent bar on its outer (right) edge,
-- greyed while another is selected. Left to the game when the tabs group is off.
local function dressSocialTabs(frame)
  if not (GW.settings and GW.settings.tabs) or type(frame.EnumerateTabs) ~= "function" then return end
  for tab in frame:EnumerateTabs() do
    tab.vgPadded = nil
    if type(GW.ClearPadding) == "function" then GW.ClearPadding(tab, frame) end
    T.Tab(tab, { bar = "RIGHT", dimIcon = true })
  end
end

-- The social window: the window skin, the Battle.net bar, every pane, its side windows and its tabs; the
-- tabs again whenever the game makes them again (RefreshTabs, on every show and status change).
function GW.SkinSocial(frame)
  GW.Skin(frame)
  dressBattleNetBar(frame.BattleNetBar)
  for _, key in ipairs(GW.SOCIAL_PANES) do dressSocialPane(frame[key]) end
  for _, key in ipairs(GW.SOCIAL_SIDE) do watchSide(frame[key], GW.SkinSocialDialog) end
  for _, key in ipairs(GW.SOCIAL_SIDE_FRAMED) do watchSide(frame[key], skinIgnoreList) end
  dressSocialTabs(frame)
  after(frame, "RefreshTabs", dressSocialTabs)
end

GW.Add("social", "framed", { "SocialUIFrame" }, GW.SkinSocial)

-- Guild creation --------------------------------------------------------------------------------

-- The registrar's and the petition's body texts (the game colors them dark for its parchment) and headings.
GW.CREATION_BODY = {
  "GuildRegistrarText", "GuildRegistrarPurchaseText", "PetitionFrameCharterName", "PetitionFrameMasterName", "PetitionFrameInstructions",
}
for i = 1, 9 do GW.CREATION_BODY[#GW.CREATION_BODY + 1] = "PetitionFrameMemberName" .. i end
GW.CREATION_HEADS = { "PetitionFrameCharterTitle", "PetitionFrameMasterTitle", "PetitionFrameMemberTitle" }
-- The game functions that set those texts; the look goes on again after each.
GW.CREATION_REDRAWS = { "GuildRegistrar_OnShow", "GuildRegistrar_ShowPurchaseFrame", "PetitionFrame_Update" }

-- The registrar and petition texts in light body text with gold headings.
function GW.LightCreationText()
  GW.PaintNamed(GW.CREATION_BODY, "text")
  GW.PaintNamed(GW.CREATION_HEADS, "gold")
end

-- A guild creation window: the window skin, its texts light, its name box themed; the texts again
-- after each game call that sets them. The tabard's model and colour pickers are left as the game's.
function GW.SkinGuildCreation(frame)
  GW.Skin(frame)
  GW.LightCreationText()
  for _, name in ipairs(GW.CREATION_REDRAWS) do after(_G, name, GW.LightCreationText) end
  if type(_G.GuildRegistrarFrameEditBox) == "table" and _G.GuildRegistrarFrameEditBox.SetText then T.EditBox(_G.GuildRegistrarFrameEditBox) end
end

GW.Add("social", "framed", { "GuildRegistrarFrame", "PetitionFrame", "TabardFrame" }, GW.SkinGuildCreation)
GW.AddButtons("GuildRegistrarFrame", { "GuildRegistrarFrameGoodbyeButton", "GuildRegistrarFrameCancelButton", "GuildRegistrarFramePurchaseButton" })
GW.AddButtons("PetitionFrame", { "PetitionFrameCancelButton", "PetitionFrameSignButton", "PetitionFrameRequestButton", "PetitionFrameRenameButton" })
GW.AddButtons("TabardFrame", { "TabardFrameAcceptButton", "TabardFrameCancelButton" })

-- Role poll and invite popups -------------------------------------------------------------------

-- The popups' push buttons: by parentKey, and by the suffix the game names them with ($parentAcceptButton).
GW.POPUP_BUTTON_KEYS = { "acceptButton" }
GW.POPUP_BUTTON_NAMES = { "AcceptButton", "DeclineButton" }

-- The role poll and the dungeon invite popups: the dialog border faded, a flat panel with a soft shadow, the
-- close and accept/decline buttons themed. The role buttons keep their art (it is their role icon and check).
function GW.SkinRolePopup(frame)
  local name = frame.GetName and frame:GetName()
  T.FadeRegions(frame)
  fadeKey(frame, "Border")
  T.Panel(frame, { shadow = true })
  dressClose(frame, frame.CloseButton)
  dressKeys(frame, GW.POPUP_BUTTON_KEYS, "CreateTexture", T.Button)
  for _, suffix in ipairs(GW.POPUP_BUTTON_NAMES) do
    local button = name and _G[name .. suffix]
    if type(button) == "table" and button.CreateTexture then T.Button(button) end
  end
end

GW.Add("social", "popups", { "RolePollPopup", "LFGInvitePopup" }, GW.SkinRolePopup)

-- Raid tab --------------------------------------------------------------------------------------

-- How many group boxes and member buttons the raid tab has (RaidGroup1-8, RaidGroupButton1-40).
GW.RAID_GROUPS, GW.RAID_BUTTONS = 8, 40
-- The tab's own push buttons, and its labels the game colors for its own look.
GW.RAID_PUSH_BUTTONS = { "RaidFrameRaidInfoButton", "RaidFrameConvertToRaidButton" }
GW.RAID_LABELS = { "RaidFrameAllAssistCheckButtonText" }

-- One group box: its outline and title art faded, an inset panel behind its slots.
local function dressRaidGroup(i)
  local group = _G["RaidGroup" .. i]
  if type(group) ~= "table" or not group.GetRegions then return end
  T.FadeRegions(group)
  fadeFrameArt(_G["RaidGroup" .. i .. "Label"])
  T.Panel(group, { inset = true, noSheen = true })
end

-- The member buttons as flat buttons. They are secure unit buttons: only textures are touched, and
-- never in combat (the game recolors each button's name text itself, so the class color stays).
local function dressRaidButtons()
  for i = 1, GW.RAID_BUTTONS do
    local button = _G["RaidGroupButton" .. i]
    if type(button) == "table" and button.CreateTexture then T.Button(button) end
  end
end

-- The raid roster tab: its group boxes, member buttons, push buttons and labels. (The tab sits inside the
-- friends window, which is panelled already; the checkbox keeps the game's art.)
function GW.SkinRaidTab()
  for i = 1, GW.RAID_GROUPS do dressRaidGroup(i) end
  ns.OutOfCombat(dressRaidButtons, "vgSocialRaidButtons")
  for _, name in ipairs(GW.RAID_PUSH_BUTTONS) do
    if type(_G[name]) == "table" and _G[name].CreateTexture then T.Button(_G[name]) end
  end
  GW.PaintNamed(GW.RAID_LABELS, "text")
end

-- The group boxes and buttons are made when Blizzard_RaidUI loads, after the tab itself is skinned.
local function onRaidUILoaded(_, addon)
  if addon == "Blizzard_RaidUI" and GW.settings and GW.settings.social then GW.SkinRaidTab() end
end
ns.On("ADDON_LOADED", onRaidUILoaded)

GW.Add("social", "onDemand", "Blizzard_RaidUI", { "RaidFrame" }, GW.SkinRaidTab)
GW.Add("social", "framed", { "RaidParentFrame" })
