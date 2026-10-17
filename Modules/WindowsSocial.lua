-- Game windows, social group: Mail, guild, channels, friends sub-dialogs, the social window (Forever's friends list),
-- guild creation, role poll and the raid tab, in the Vanguard look. Filled by stream S1 of docs/handoff/RESKIN-PLAN.md; registers with
-- GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgPadded = ns.FrameState("vgPadded")
local vgSocialSide = ns.FrameState("vgSocialSide")
local vgEmptyNote = ns.FrameState("vgEmptyNote")
local vgInsetFill = ns.FrameState("vgInsetFill")

local T = ns.Theme
local GW = ns.GetModule("Windows")

-- Helpers ---------------------------------------------------------------------------------------

-- Frames whose game methods are already hooked here (a skin runs on every show; a hook goes on once).
local hooked = {}

-- Runs fn after the frame's game method (or the table's function) `name` each time it runs, with
-- that call's own arguments (self first, for a method); once per frame and method, a client
-- without the method is skipped. A post-hook (hooksecurefunc): the game's function is kept.
local function afterWith(frame, name, fn)
  local key = tostring(name)
  hooked[frame] = hooked[frame] or {}
  if hooked[frame][key] or type(frame[name]) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  hooked[frame][key] = true
  hooksecurefunc(frame, name, ns.Guard("hook " .. key, fn))
end

-- Runs fn(frame) after the frame's game method `name` each time it runs (see afterWith).
local function after(frame, name, fn)
  afterWith(frame, name, function() fn(frame) end)
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

-- The guild window's panes (parentKeys); each has art to fade and, mostly, an InsetFrame. The Preferred
-- Play Settings page has neither: its inset panel goes on the page itself.
GW.GUILD_PANES = { "CommunitiesList", "MemberList", "Chat", "GuildBenefitsFrame", "GuildDetailsFrame", "GuildPreferredPlaySettingsFrame" }

-- Fades a frame's own textures and its NineSlice (a part's art), by alpha.
local function fadeFrameArt(frame)
  if type(frame) ~= "table" or not frame.GetRegions then return end
  T.FadeRegions(frame)
  if type(frame.NineSlice) == "table" and frame.NineSlice.GetRegions then T.FadeRegions(frame.NineSlice) end
end

-- The fill behind a pane's content, for a pane whose InsetFrame is drawn above that content (the game puts the
-- guild window's insets at frame levels 100 and 200, over the rows, for their border): a frame of its own one
-- level below the pane, so under the rows and the column headers, filling the inset's rectangle. The inset
-- itself then keeps only its border.
local function insetFill(pane, inset)
  if not vgInsetFill[inset] then
    vgInsetFill[inset] = CreateFrame("Frame", nil, pane)
    vgInsetFill[inset]:SetAllPoints(inset)
    vgInsetFill[inset]:SetFrameLevel(math.max(0, pane:GetFrameLevel() - 1))
  end
  T.Panel(vgInsetFill[inset], { inset = true, noSheen = true, noBorder = true })
end

-- One pane in the theme: its art faded and an inset panel behind it (the fill under its content and the border on
-- its InsetFrame when it has one, else the whole panel on the pane itself).
local function dressPane(pane)
  if type(pane) ~= "table" or not pane.GetRegions then return end
  fadeFrameArt(pane)
  local inset = type(pane.InsetFrame) == "table" and pane.InsetFrame.GetRegions and pane.InsetFrame
  if not inset then return T.Panel(pane, { inset = true, noSheen = true }) end
  fadeFrameArt(inset)
  insetFill(pane, inset)
  T.Panel(inset, { inset = true, noBg = true })
end

-- Guild roster: the game lays out its columns from tables local to Blizzard_Communities (GUILD_COLUMN_INFO), so
-- the Rank column is widened after the game's own calls: its header after ColumnDisplay:LayoutColumns, its
-- cells after each row's RefreshExpandedColumns (which sets them back to the game's 75 every time).

-- How much wider the guild roster's Rank column is drawn (header and cells); the Note column gives the room.
GW.GUILD_RANK_EXTRA = 40
-- A Rank cell's width (the game's 75 plus the extra), and a Note cell's beside an extra column such as
-- professions (the game's fixed 93 less the extra; without one the note fills the rest of the row).
GW.GUILD_RANK_CELL, GW.GUILD_NOTE_BESIDE = 75 + GW.GUILD_RANK_EXTRA, 93 - GW.GUILD_RANK_EXTRA
-- A roster row's texts (parentKeys) that the game greys for an offline member, besides the name.
GW.GUILD_ROSTER_TEXTS = { "Level", "Zone", "Rank", "Note", "GuildInfo" }

-- The index of the guild Rank column in a roster column table (other clubs' tables have none).
local function rankColumn(columns)
  if type(columns) ~= "table" then return nil end
  for i, info in ipairs(columns) do
    if type(info) == "table" and info.attribute == "guildRankOrder" then return i end
  end
end

-- After the roster lays out its column headers: the guild Rank header wider by GW.GUILD_RANK_EXTRA (the
-- Note header after it fills what is left, so it gives the room).
local function widenRankHeader(display, columns)
  local index, pool = rankColumn(columns), display.columnHeaders
  if not index or type(pool) ~= "table" or type(pool.EnumerateActive) ~= "function" then return end
  for header in pool:EnumerateActive() do
    if header:GetID() == index then header:SetWidth((columns[index].width or 0) + GW.GUILD_RANK_EXTRA) end
  end
end

-- After the game lays out a guild roster row: its Rank cell as wide as the header, and its Note cell narrower by
-- as much when it has a fixed width (beside an extra column).
local function widenRankCell(row)
  local list = row.expanded and type(row.GetMemberList) == "function" and row:GetMemberList()
  if type(list) ~= "table" or not rankColumn(list.columnInfo) then return end
  if type(row.Rank) == "table" and row.Rank.SetWidth then row.Rank:SetWidth(GW.GUILD_RANK_CELL) end
  if row.guildColumnIndex ~= nil and type(row.Note) == "table" and row.Note.SetWidth then row.Note:SetWidth(GW.GUILD_NOTE_BESIDE) end
end

-- A font string, when it is one, in a theme text color.
local function paintText(fs, token)
  if type(fs) == "table" and fs.SetTextColor then T.Color(fs, token) end
end

-- After the game colors a row for its member's presence: an offline member's texts in the theme's secondary
-- text (the game's grey is hard to read on the dark panel); online rows keep white text and class-colored names.
local function lightOffline(row)
  local info, presence = row.memberInfo, type(Enum) == "table" and Enum.ClubMemberPresence
  local offline = type(presence) == "table" and presence.Offline or nil
  if type(info) ~= "table" or offline == nil or ns.IsSecret(info.presence) or info.presence ~= offline then return end
  for _, key in ipairs(GW.GUILD_ROSTER_TEXTS) do paintText(row[key], "text2") end
  paintText(type(row.NameFrame) == "table" and row.NameFrame.Name, "text2")
end

-- One roster row's hooks, unless it took them from the row mixin when it was made.
local function hookRow(row, mixin)
  if type(row) ~= "table" or row.RefreshExpandedColumns == mixin.RefreshExpandedColumns then return end
  afterWith(row, "UpdatePresence", lightOffline)
  afterWith(row, "RefreshExpandedColumns", widenRankCell)
end

-- The roster's hooks, on once: on the game's row mixin (CommunitiesMemberListEntryMixin), so every row made
-- later has them, on any row made already, and on the roster's column headers. Post-hooks only: nothing of the
-- game's is replaced, so the roster is not tainted.
local function hookRoster(list)
  local mixin = _G.CommunitiesMemberListEntryMixin
  if type(list) ~= "table" or type(mixin) ~= "table" then return end
  afterWith(mixin, "UpdatePresence", lightOffline)
  afterWith(mixin, "RefreshExpandedColumns", widenRankCell)
  if type(list.ScrollBox) == "table" and list.ScrollBox.ForEachFrame then list.ScrollBox:ForEachFrame(function(row) hookRow(row, mixin) end) end
  if type(list.ColumnDisplay) == "table" then afterWith(list.ColumnDisplay, "LayoutColumns", widenRankHeader) end
end

-- The note the Guild Info page shows in its Guild Information box while the guild has none.
GW.GUILD_INFO_EMPTY = "No guild information yet."

-- Vanguard's note in the Guild Information box (made once, where the game draws the text).
local function emptyNote(info, child, details)
  if not vgEmptyNote[info] then
    vgEmptyNote[info] = T.Text(child:CreateFontString(nil, "ARTWORK"), "small", "text2")
    vgEmptyNote[info]:SetPoint("TOPLEFT", details, "TOPLEFT", 0, 0)
    vgEmptyNote[info]:SetText(GW.GUILD_INFO_EMPTY)
  end
  return vgEmptyNote[info]
end

-- The Guild Info page's Guild Information box (the game fills it through CommunitiesGuildInfoFrame_UpdateText, on
-- show, on GUILD_ROSTER_UPDATE and after an edit): Vanguard's note shown while the game's text is empty.
local function noteGuildInfo(info)
  local box = type(info) == "table" and info.DetailsFrame
  local child = type(box) == "table" and box.GetScrollChild and box:GetScrollChild()
  local details = type(child) == "table" and child.Details
  if type(details) ~= "table" or not details.GetText then return end
  local text = details:GetText()
  emptyNote(info, child, details):SetShown(not ns.IsSecret(text) and (text == nil or text == ""))
end

-- The Preferred Play Settings page's Apply buttons (parentKeys); the game disables them for anyone but the guild master.
GW.GUILD_APPLY_BUTTONS = { "LocaleApplyButton", "DatacenterApplyButton" }
-- The page's Apply buttons flat; the flat button follows the game enabling or disabling them (T.Button's disabled look).
local function dressPlaySettings(page)
  if type(page) ~= "table" then return end
  for _, key in ipairs(GW.GUILD_APPLY_BUTTONS) do
    local button = page[key]
    if type(button) == "table" and button.CreateTexture then T.Button(button) end
  end
end

-- The guild window's pages beyond their panels: the roster's hooks, the Guild Information box's note (now and
-- after each game fill), the Preferred Play Settings buttons.
local function dressGuildPages(frame)
  hookRoster(frame.MemberList)
  if type(frame.GuildDetailsFrame) == "table" then noteGuildInfo(frame.GuildDetailsFrame.Info) end
  afterWith(_G, "CommunitiesGuildInfoFrame_UpdateText", noteGuildInfo)
  dressPlaySettings(frame.GuildPreferredPlaySettingsFrame)
end

-- The guild window: the window skin (its maximize and minimize buttons with it), the portrait art faded, each pane
-- and the stream dropdown dressed, its pages' parts; again whenever the game switches pages (SetDisplayMode). The
-- side tabs are the tabs stream's.
function GW.SkinGuildWindow(frame)
  GW.Skin(frame)
  GW.FadeParts(frame, { "PortraitOverlay" })
  for _, key in ipairs(GW.GUILD_PANES) do dressPane(frame[key]) end
  if type(frame.StreamDropdown) == "table" and frame.StreamDropdown.CreateTexture then T.Button(frame.StreamDropdown) end
  dressGuildPages(frame)
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
  if vgSocialSide[frame] then return end
  vgSocialSide[frame] = true
  frame:HookScript("OnShow", function(f) ns.Try("window SocialUIFrame side", skin, f) end)
end

-- The side tabs the window takes from its pool (anchored again on every RefreshTabs): each in the theme
-- with its icon and count kept, out past the window's padding, raised while it is selected and its icon
-- greyed while another is selected. Left to the game when the tabs group is off.
local function dressSocialTabs(frame)
  if not (GW.settings and GW.settings.tabs) or type(frame.EnumerateTabs) ~= "function" then return end
  for tab in frame:EnumerateTabs() do
    vgPadded[tab] = nil
    if type(GW.ClearPadding) == "function" then GW.ClearPadding(tab, frame) end
    T.Tab(tab, { dimIcon = true })
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

-- The tab's "All assist" check button, as a themed check box.
GW.RAID_CHECK = "RaidFrameAllAssistCheckButton"

-- The raid roster tab: its group boxes, member buttons, push buttons, labels and check box, in that order,
-- so a disabled box greys its label last. (The tab sits inside the friends window, which is panelled already.)
function GW.SkinRaidTab()
  for i = 1, GW.RAID_GROUPS do dressRaidGroup(i) end
  ns.OutOfCombat(dressRaidButtons, "vgSocialRaidButtons")
  for _, name in ipairs(GW.RAID_PUSH_BUTTONS) do
    if type(_G[name]) == "table" and _G[name].CreateTexture then T.Button(_G[name]) end
  end
  GW.PaintNamed(GW.RAID_LABELS, "text")
  if type(_G[GW.RAID_CHECK]) == "table" and _G[GW.RAID_CHECK].GetChecked then T.CheckBox(_G[GW.RAID_CHECK]) end
end

-- The group boxes and buttons are made when Blizzard_RaidUI loads, after the tab itself is skinned.
local function onRaidUILoaded(_, addon)
  if addon == "Blizzard_RaidUI" and GW.settings and GW.settings.social then GW.SkinRaidTab() end
end
ns.On("ADDON_LOADED", onRaidUILoaded)

GW.Add("social", "onDemand", "Blizzard_RaidUI", { "RaidFrame" }, GW.SkinRaidTab)
GW.Add("social", "framed", { "RaidParentFrame" })

-- Toasts ----------------------------------------------------------------------------------------

-- The toasts' lines (parentKeys) with their text role and colour. Top and middle lines keep the game's
-- colour (a friend's name in Battle.net blue); the bottom line's grey is hard to read on the dark panel,
-- so it goes to the theme's secondary text on each show (the game greys it again before every toast,
-- by SetTextColor or, for a friend coming online, by a colour code inside the text itself).
-- Text is the time-played alert's one line.
GW.TOAST_LINES = { TopLine = { "label", false }, MiddleLine = { "small", false }, BottomLine = { "small", "text2" }, DoubleLine = { "label", false }, Text = { "label", false } }

-- A line's text with the game's inline colour codes stripped, so the role colour can show: SetTextColor
-- cannot override a colour the game wrote into the text. Text the client hides is left alone.
local function uncolourText(fs)
  local text = fs:GetText()
  if ns.IsSecret(text) or type(text) ~= "string" or not text:find("|c", 1, true) then return end
  fs:SetText((text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")))
end

-- A toast's texts in their roles, those this toast has; a line given a role colour loses the game's inline colour first.
local function dressToastLines(frame)
  for key, role in pairs(GW.TOAST_LINES) do
    local fs = frame[key]
    if type(fs) == "table" and type(fs.SetFont) == "function" then
      if role[2] then uncolourText(fs) end
      T.Text(fs, role[1], role[2])
    end
  end
end

-- The toast's hover tooltip (the Battle.net toast has one): a themed tooltip panel with light text.
local function dressToastTooltip(tip)
  if type(tip) ~= "table" or not tip.GetRegions then return end
  fadeFrameArt(tip)
  T.Tooltip(tip)
  if type(tip.Text) == "table" and type(tip.Text.SetFont) == "function" then T.Text(tip.Text, "small") end
end

-- A social toast (a Battle.net friend or invite toast, the time-played alert): its backdrop and glow
-- faded (the glow's own flare animation still plays over the panel), a tooltip-style panel, the
-- Battle.net icon kept, its lines in theme roles and its X as the theme's close glyph where the game
-- put it (the toast is too small for the window corner inset). The game reuses one frame per kind of
-- toast and sets its lines in ShowToast before each one, so this runs on each show and after each
-- ShowToast (a toast that arrives while one is up is shown again without an OnShow), and the lines
-- are dressed again every time.
function GW.SkinToast(frame)
  if type(frame) ~= "table" or not frame.GetRegions then return end
  after(frame, "ShowToast", GW.SkinToast)
  local icon = frame.IconTexture
  T.FadeRegions(frame, { [type(icon) == "table" and icon or false] = true })
  T.Tooltip(frame)
  dressToastLines(frame)
  if type(frame.CloseButton) == "table" and frame.CloseButton.CreateTexture then T.CloseButton(frame.CloseButton) end
  dressToastTooltip(frame.TooltipFrame)
end

GW.Add("social", "popups", { "BNToastFrame", "TimeAlertFrame" }, GW.SkinToast)
