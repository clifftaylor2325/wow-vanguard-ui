-- Game windows, social group: Mail, guild, channels, friends sub-dialogs, the social window (Forever's friends list),
-- guild creation, role poll and the raid tab, in the Vanguard look. Filled by stream S1 of docs/handoff/RESKIN-PLAN.md; registers with
-- GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgSocialSide = ns.FrameState("vgSocialSide")
local vgEmptyNote = ns.FrameState("vgEmptyNote")
local vgInsetFill = ns.FrameState("vgInsetFill")
local vgControlWatched = ns.FrameState("vgControlWatched")
local vgPresenceLabel = ns.FrameState("vgPresenceLabel")

local T = ns.Theme
local GW = ns.GetModule("Windows")

-- Helpers ---------------------------------------------------------------------------------------

-- A font string, when it is one, in a theme text color.
local function paintText(fs, token)
  if type(fs) == "table" and fs.SetTextColor then T.Color(fs, token) end
end

-- Every font string among a frame's own regions in a theme text color (the +, - and count beside an invoice's money).
local function paintRegions(frame, token)
  if type(frame) ~= "table" or not frame.GetRegions then return end
  for _, region in ipairs({ frame:GetRegions() }) do paintText(region, token) end
end

-- One option of a gossip-style list (the registrar's two, QuestTitleButtonTemplate, the source has a third commented out; the
-- rename window's two, GossipTitleButtonTemplate: an icon and a title) as a see-through theme row keeping its icon, its title in
-- the text colour (the game draws it black for its parchment).
local function dressOptionRow(button)
  if type(button) ~= "table" or not button.CreateTexture then return end
  T.Row(button, { fade = true })
  GW.ShowTexture(button.Icon)
  paintText(button.GetFontString and button:GetFontString(), "text")
end

-- Open mail -------------------------------------------------------------------------------------

-- The letter's parchment: the stationery behind the body text.
GW.MAIL_ART = { "OpenStationeryBackgroundLeft", "OpenStationeryBackgroundRight" }
-- The letter window's item buttons: the letter, the money and its attachments.
GW.MAIL_ITEMS = { "OpenMailLetterButton", "OpenMailMoneyButton" }
for i = 1, 16 do GW.MAIL_ITEMS[#GW.MAIL_ITEMS + 1] = "OpenMailAttachmentButton" .. i end

-- The letter's stationery faded and its body text in light text, headings too (the
-- game colors the body for its parchment as each letter loads, so this runs after it).
function GW.LightMailText()
  GW.FadeNamed(GW.MAIL_ART)
  local body = _G.OpenMailBodyText
  if type(body) ~= "table" or type(body.SetTextColor) ~= "function" then return end
  for tag, token in pairs(GW.ITEM_TEXT_TAGS) do body:SetTextColor(tag, T.RGB(token)) end
end

-- The letter, money and attachment buttons with the bags' quality border.
function GW.SkinMailItems()
  for _, name in ipairs(GW.MAIL_ITEMS) do GW.SkinItem(_G[name]) end
end

-- The auction invoice's labels (the game names them; dark brown for its parchment) and its four money lines.
GW.MAIL_INVOICE_TEXTS = {
  "OpenMailInvoiceItemLabel", "OpenMailInvoicePurchaser", "OpenMailInvoiceSalePrice", "OpenMailInvoiceDeposit", "OpenMailInvoiceHouseCut",
  "OpenMailInvoiceAmountReceived", "OpenMailInvoiceNotYetSent", "OpenMailInvoiceMoneyDelay",
}
GW.MAIL_INVOICE_MONEY = { "OpenMailTransactionAmountMoneyFrame", "OpenMailDepositMoneyFrame", "OpenMailHouseCutMoneyFrame", "OpenMailSalePriceMoneyFrame" }

-- The invoice in the theme: its labels and the strings beside its money lines (the + and - the game draws unnamed) in the text
-- colour, the four money lines in the number font, the sum line one pixel of divider.
local function dressInvoice()
  GW.PaintNamed(GW.MAIL_INVOICE_TEXTS, "text")
  for _, name in ipairs(GW.MAIL_INVOICE_MONEY) do
    GW.SkinMoney(_G[name])
    paintRegions(_G[name], "text")
  end
  local line = _G.OpenMailArithmeticLine
  if type(line) == "table" and line.SetAlpha then T.Divider(line) end
end

-- The letter's page as a sunk area (its stationery faded with the rest of its art), the subject and the sender's name in
-- the text colour.
local function dressLetter(frame)
  GW.InsetPanel(frame.ScrollFrame)
  paintText(_G.OpenMailSubject, "text")
  paintText(GW.Part(_G, "OpenMailSender.Name"), "text")
end

-- The letter window: the window skin, the page, the parchment and body text, the invoice, the item buttons; each
-- again after the game redraws the letter (OpenMailFrame:Update).
function GW.SkinOpenMail(frame)
  GW.Skin(frame)
  dressLetter(frame)
  GW.LightMailText()
  dressInvoice()
  GW.SkinMailItems()
  GW.HookAfter(frame, "Update", GW.SkinOpenMail)
end

GW.Add("social", { "OpenMailFrame" }, GW.SkinOpenMail)
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
  GW.HookAfter(row, "UpdatePresence", lightOffline)
  GW.HookAfter(row, "RefreshExpandedColumns", widenRankCell)
end

-- The roster's column headers (ColumnDisplay's pool of buttons) as theme buttons, the game's tab plates faded.
local function dressHeaders(display)
  local pool = display.columnHeaders
  if type(pool) ~= "table" or type(pool.EnumerateActive) ~= "function" then return end
  for header in pool:EnumerateActive() do GW.SkinButton(header) end
end

-- After the roster lays out its column headers: the Rank header wider, every header a theme button.
local function layoutHeaders(display, columns)
  widenRankHeader(display, columns)
  dressHeaders(display)
end

-- The roster's hooks, on once: on the game's row mixin (CommunitiesMemberListEntryMixin), so every row made
-- later has them, on any row made already, and on the roster's column headers. Post-hooks only: nothing of the
-- game's is replaced, so the roster is not tainted.
local function hookRoster(list)
  local mixin = _G.CommunitiesMemberListEntryMixin
  if type(list) ~= "table" or type(mixin) ~= "table" then return end
  GW.HookAfter(mixin, "UpdatePresence", lightOffline)
  GW.HookAfter(mixin, "RefreshExpandedColumns", widenRankCell)
  if type(list.ScrollBox) == "table" and list.ScrollBox.ForEachFrame then list.ScrollBox:ForEachFrame(function(row) hookRow(row, mixin) end) end
  if type(list.ColumnDisplay) == "table" then GW.HookAfter(list.ColumnDisplay, "LayoutColumns", layoutHeaders) end
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
-- Its two dropdowns, which keep their arrows, and its two field labels.
GW.GUILD_PLAY_DROPDOWNS = { "LocaleDropdown", "DatacenterDropdown" }
GW.GUILD_PLAY_LABELS = { "LocaleLabel", "DatacenterLabel" }

-- The page's Apply buttons flat (the flat button follows the game enabling or disabling them: T.Button's disabled look), its
-- title in the heading role, its field labels in the text color and its dropdowns flat.
local function dressPlaySettings(page)
  if type(page) ~= "table" then return end
  GW.EachKey(page, GW.GUILD_APPLY_BUTTONS, GW.SkinButton)
  GW.EachKey(page, GW.GUILD_PLAY_DROPDOWNS, GW.SkinDropdown)
  GW.SkinText(page.Title, "heading", "text")
  for _, key in ipairs(GW.GUILD_PLAY_LABELS) do paintText(page[key], "text") end
end

-- What a roster row keeps of its art: the class icon and the voice chat mark. A profession header bar keeps its fold icons and
-- its profession's icon.
GW.GUILD_ROW_KEEP = { "Class", "VoiceChatStatusIcon" }
GW.GUILD_HEADER_KEEP = { "ExpandedIcon", "CollapsedIcon", "Icon" }

-- A link button's label (the "all recipes" link, pale gold in the game) in a theme text color.
local function paintLink(button, token)
  paintText(type(button) == "table" and type(button.GetFontString) == "function" and button:GetFontString(), token)
end

-- One roster row as the game acquires it: its stripe and hover strip faded under the row primitive, its class icon kept; a
-- profession header (a collapsible bar over its members) a row of its own with its fold and profession icons kept, its name and
-- its "all recipes" link in the text color.
local function dressMemberRow(row)
  GW.DressRow(row, GW.GUILD_ROW_KEEP)
  local header = row.ProfessionHeader
  GW.DressRow(header, GW.GUILD_HEADER_KEEP)
  if type(header) == "table" then paintText(header.Name, "text") paintLink(header.AllRecipes, "text") end
end

-- The roster's parts: its Show Offline box, member count, column strip and headers, and its rows as the game acquires them.
local function dressMemberList(list)
  if type(list) ~= "table" then return end
  GW.SkinCheck(list.ShowOfflineButton)
  paintText(GW.Part(list, "ShowOfflineButton.Text"), "text")
  paintText(list.MemberCount, "text")
  if type(list.ColumnDisplay) == "table" then GW.FadeParts(list.ColumnDisplay, { "Background", "TopTileStreaks" }) dressHeaders(list.ColumnDisplay) end
  GW.WatchRows(list.ScrollBox, dressMemberRow)
end

-- What a communities list row keeps of its art: the community's avatar, a guild's banner (plate and emblem), the favourite star,
-- the unread dot and the invitation mail.
GW.COMMUNITY_ROW_KEEP = { "Icon", "GuildTabardBackground", "GuildTabardEmblem", "FavoriteIcon", "UnreadNotificationIcon", "InvitationIcon" }

-- The atlas of the Join or Create Community row's plus, drawn green by the game.
GW.ADD_COMMUNITY_ATLAS = "communities-icon-addgroupplus"

-- A community row's name in the text colour (the game colours it green), the add row's plus grey instead of green, and its
-- selected look following the game's Selection plate (shown by Init, which the game runs again on every update). The game
-- draws every row from one pool and never tints the icon itself, so any other icon is untinted: the plus's frame may come
-- back as a club's (its desaturation the game resets).
local function paintCommunityRow(row)
  paintText(row.Name, "text")
  local icon = row.Icon
  if type(icon) == "table" and icon.GetAtlas then
    local plus = icon:GetAtlas() == GW.ADD_COMMUNITY_ATLAS
    if plus then icon:SetDesaturated(true) end
    icon:SetVertexColor(T.RGB(plus and "text" or "white"))
  end
  GW.FollowMark(row, row.Selection)
end

-- A guild's banner (plate, then emblem) drawn above the row's selected fill: the game draws them on its background layers, under
-- the fill the row primitive lays on the artwork layer, so the selected guild's banner showed blank.
local function liftBanner(row)
  for sublevel, key in ipairs({ "GuildTabardBackground", "GuildTabardEmblem" }) do
    local part = row[key]
    if type(part) == "table" and part.SetDrawLayer then part:SetDrawLayer("ARTWORK", 3 + sublevel) end
  end
end

-- One communities list row as the game acquires it: its plates and gold ring faded under the row primitive, its icons kept, its
-- selected look following the game's Selection plate (shown by Init, which the game runs again on every update).
local function dressCommunityRow(row)
  if type(row) ~= "table" then return end
  GW.DressRow(row, GW.COMMUNITY_ROW_KEEP)
  liftBanner(row)
  paintCommunityRow(row)
  GW.HookAfter(row, "Init", function() paintCommunityRow(row) end)
end

-- The communities list: its corner filigree faded and its rows dressed as the game acquires them.
local function dressCommunitiesList(list)
  if type(list) ~= "table" then return end
  if type(list.FilligreeOverlay) == "table" then GW.FadeParts(list, { "FilligreeOverlay" }) end
  GW.WatchRows(list.ScrollBox, dressCommunityRow)
end

-- Guild perks and rewards ----------------------------------------------------------------------

-- What a perk row and a reward row keep of their art: the icon, and on a reward the lock and the grey shade over a locked one.
GW.GUILD_PERK_KEEP = { "Icon" }
GW.GUILD_REWARD_KEEP = { "Icon", "Lock", "DisabledBG" }
-- A perk row's two borders (frames of art the game shows by whether the perk is earned).
GW.GUILD_PERK_BORDERS = { "NormalBorder", "DisabledBorder" }

-- A perk row as the game acquires it: its plates and borders faded under the row primitive, its icon kept.
local function dressPerkRow(row)
  if type(row) ~= "table" then return end
  GW.DressRow(row, GW.GUILD_PERK_KEEP)
  GW.FadeParts(row, GW.GUILD_PERK_BORDERS)
end

-- A reward row as the game acquires it: its plate faded under the row primitive, its icon, lock and shade kept, its price in the
-- number font (the reward's name stays gold: a reward is content).
local function dressRewardRow(row)
  if type(row) ~= "table" then return end
  GW.DressRow(row, GW.GUILD_REWARD_KEEP)
  GW.SkinMoney(row.Money)
end

-- A benefits list (Perks or Rewards): its own art faded, its heading in the heading role, its rows as the game acquires them.
local function dressBenefitList(list, skinRow)
  if type(list) ~= "table" or not list.GetRegions then return end
  T.FadeRegions(list)
  GW.SkinText(list.TitleText, "heading", "text")
  GW.WatchRows(list.ScrollBox, skinRow)
end

-- The guild reputation line: its label in the text color, its bar's bronze art faded (the progress fill kept) under an inset.
local function dressFactionBar(faction)
  if type(faction) ~= "table" then return end
  paintText(faction.Label, "text")
  local bar = faction.Bar
  if type(bar) ~= "table" or not bar.GetRegions then return end
  T.FadeRegions(bar, GW.KeepKeys(bar, { "Progress", "Label" }))
  T.Panel(bar, { inset = true, noSheen = true })
end

-- The guild benefits page: the perks and rewards lists and the reputation bar.
local function dressBenefits(page)
  if type(page) ~= "table" then return end
  dressBenefitList(page.Perks, dressPerkRow)
  dressBenefitList(page.Rewards, dressRewardRow)
  dressFactionBar(page.FactionFrame)
end

-- Guild info and news ---------------------------------------------------------------------------

-- The game's strings for the Guild Info page's three headers and the News page's header, which the game draws unnamed.
GW.GUILD_INFO_HEADERS = { "GUILD_FRAME_CHALLENGES", "GUILD_MOTD_LABEL", "GUILD_INFORMATION" }
GW.GUILD_NEWS_HEADERS = { "GUILD_NEWS" }

-- The font strings among a frame's regions that show one of the game's strings named in names (headers the game draws without
-- a key), as section heads; except is a title that shows the same words.
local function sectionRegions(frame, names, except)
  local texts = {}
  for _, name in ipairs(names) do
    if type(_G[name]) == "string" then texts[_G[name]] = true end
  end
  for _, region in ipairs({ frame:GetRegions() }) do
    if region ~= except and region.GetText and texts[region:GetText()] then GW.SkinSection(region) end
  end
end

-- The Guild Info page: its own backdrop, headers and divider bars faded, its title in the heading role, its three headers as
-- section heads, the challenges' counts and the two Edit links in the text color.
local function dressGuildInfo(info)
  if type(info) ~= "table" or not info.GetRegions then return end
  T.FadeRegions(info)
  GW.SkinText(info.TitleText, "heading", "text")
  sectionRegions(info, GW.GUILD_INFO_HEADERS, info.TitleText)
  for _, challenge in ipairs(type(info.Challenges) == "table" and info.Challenges or {}) do paintText(challenge.count, "text") end
  paintLink(info.EditMOTDButton, "text")
  paintLink(info.EditDetailsButton, "text")
end

-- The boss-kill pop-out on the News page: the stone frame faded under a floating panel, its text box an inset, the boss's name in
-- the text color.
local function dressBossModel(model)
  if type(model) ~= "table" or not model.GetRegions then return end
  T.FadeRegions(model)
  T.Panel(model, { shadow = true })
  GW.InsetPanel(model.TextFrame)
  paintText(model.BossName, "text")
end

-- A news row as the game acquires it: its date plate faded under the row primitive, its news icon kept.
local function dressNewsRow(row)
  GW.DressRow(row, { "icon" })
end

-- The Guild News page: its own backdrop and header plate faded, its title in the heading role, its header a section head, the
-- Set filters link in the text color, the boss pop-out and the rows.
local function dressGuildNews(news)
  if type(news) ~= "table" or not news.GetRegions then return end
  T.FadeRegions(news)
  GW.SkinText(news.TitleText, "heading", "text")
  sectionRegions(news, GW.GUILD_NEWS_HEADERS, news.TitleText)
  paintLink(news.SetFiltersButton, "text")
  dressBossModel(news.BossModel)
  GW.WatchRows(news.ScrollBox, dressNewsRow)
end

-- The Guild Info page's parts and note, and the Guild News page's parts.
local function dressGuildDetails(details)
  if type(details) ~= "table" then return end
  dressGuildInfo(details.Info)
  noteGuildInfo(details.Info)
  dressGuildNews(details.News)
end

-- The guild window's pages beyond their panels: the lists and the roster's parts and hooks, the Guild Information box's note
-- (now and after each game fill), the Preferred Play Settings buttons.
local function dressGuildPages(frame)
  hookRoster(frame.MemberList)
  dressMemberList(frame.MemberList)
  dressCommunitiesList(frame.CommunitiesList)
  dressBenefits(frame.GuildBenefitsFrame)
  dressGuildDetails(frame.GuildDetailsFrame)
  GW.HookAfter(_G, "CommunitiesGuildInfoFrame_UpdateText", noteGuildInfo)
  dressPlaySettings(frame.GuildPreferredPlaySettingsFrame)
end

-- The parts of the window's portrait overlay that stay: the community's avatar and the guild's tabard (content).
GW.GUILD_PORTRAIT_KEEP = { "Portrait", "TabardBackground", "TabardEmblem" }

-- The window's portrait overlay with its avatar or tabard kept and the tabard's gold border faded.
local function dressPortrait(frame)
  local overlay = frame.PortraitOverlay
  if type(overlay) ~= "table" or not overlay.GetRegions then return end
  T.FadeRegions(overlay, GW.KeepKeys(overlay, GW.GUILD_PORTRAIT_KEEP))
end

-- The window's dropdowns (the stream's and the member lists', which keep their arrows), its bottom row of buttons and the
-- control frame's three.
GW.GUILD_DROPDOWNS = { "StreamDropdown", "GuildMemberListDropdown", "CommunityMemberListDropdown", "CommunitiesListDropdown", "AddToChatButton" }
GW.GUILD_BUTTONS = { "InviteButton", "GuildLogButton" }
GW.GUILD_CONTROLS = { "CommunitiesSettingsButton", "GuildControlButton", "GuildRecruitmentButton" }

-- A bottom button of the window: its label in the text colour (gold in the game; painted first, as the button skin keeps a
-- disabled label's colour from before), then the theme button.
local function dressGuildButton(button)
  paintLink(button, "text")
  GW.SkinButton(button)
end

-- The window's dropdowns, the chat box, the jump button over the chat and the bottom row of buttons; the calendar button
-- keeps its icon on a tile.
local function dressGuildControls(frame)
  GW.EachKey(frame, GW.GUILD_DROPDOWNS, GW.SkinDropdown)
  paintText(GW.Part(frame, "AddToChatButton.Label"), "text")
  GW.SkinEditBox(frame.ChatEditBox)
  GW.SkinButton(_G.JumpToUnreadButton)
  GW.EachKey(frame, GW.GUILD_BUTTONS, dressGuildButton)
  GW.EachKey(frame.CommunitiesControlFrame, GW.GUILD_CONTROLS, GW.SkinButton)
  GW.SkinPlate(frame.CommunitiesCalendarButton)
end

-- The guild window: the window skin (its maximize and minimize buttons with it), the portrait art faded, each pane
-- dressed, its dropdowns, buttons and pages' parts; again whenever the game switches pages (SetDisplayMode). The side
-- tabs are the tabs stream's.
function GW.SkinGuildWindow(frame)
  GW.Skin(frame)
  dressPortrait(frame)
  for _, key in ipairs(GW.GUILD_PANES) do dressPane(frame[key]) end
  dressGuildControls(frame)
  dressGuildPages(frame)
  GW.SkinCommunitiesDialogs(frame)
  GW.HookAfter(frame, "SetDisplayMode", GW.SkinGuildWindow)
end

GW.Add("social", { "CommunitiesFrame" }, GW.SkinGuildWindow)

-- Dialogs -----------------------------------------------------------------------------------------

-- The art the social dialogs draw behind them (translucent frames, dark dialog borders, headers, list borders).
GW.SOCIAL_DIALOG_ART = { "NineSlice", "Bg", "BG", "Border", "Background", "Header", "ScrollFrameBorder", "Selector" }
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

-- Themes each part of frame named in keys that is a frame with the method `need` (T.Button, or T.EditBox for boxes; a
-- font string such as the member pop-up's Name has SetText too, but no regions).
local function dressKeys(frame, keys, need, skin)
  for _, key in ipairs(keys) do
    local part = frame[key]
    if type(part) == "table" and part[need] and part.GetRegions and part ~= frame.CloseButton then skin(part) end
  end
end

-- The parts a social dialog may have, each only if it has it: title, close control, push buttons, edit boxes.
local function dressDialogParts(frame, name)
  GW.SkinTitle(frame.Title)
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

-- The parts of the social dialogs only some of them have ---------------------------------------------

-- Whether a part is a frame (it has regions); the harness's copy of a window and a real client may differ.
local function isFrame(part)
  return type(part) == "table" and type(part.GetRegions) == "function"
end

-- The font strings of frame under keys in a theme text colour (a gold field label is "text", never gold).
local function paintKeys(frame, keys, token)
  if type(frame) ~= "table" then return end
  for _, key in ipairs(keys) do paintText(frame[key], token) end
end

-- A rule the game draws as a texture (a separator under a heading) as the theme's one-pixel line.
local function dressRule(line)
  if type(line) == "table" and line.SetAlpha then T.Divider(line) end
end

-- A multi-line text area (InputScrollFrameTemplate): its border art faded, its edit box a theme edit box.
local function dressScrollEdit(scroll)
  if not isFrame(scroll) then return end
  T.FadeRegions(scroll)
  GW.SkinEditBox(scroll.EditBox)
end

-- The OK and Cancel buttons of a SelectionFrameTemplate frame (a dialog's Selector; its art is faded with the dialog's).
local function dressSelector(dialog)
  GW.EachKey(dialog.Selector, { "OkayButton", "CancelButton" }, GW.SkinButton)
end

-- The X button of a dialog that names it like its text Close button ($parentCloseButton twice, so the name finds
-- only one): the child with a GetText (a button) and no label.
local function findCross(frame)
  for _, child in ipairs({ frame:GetChildren() }) do
    if type(child) == "table" and type(child.GetText) == "function" and (child:GetText() or "") == "" then return child end
  end
end

-- A skin for one social dialog: the dialog skin, then the parts only that dialog has.
local function dialogWith(extra)
  return function(frame)
    GW.SkinSocialDialog(frame)
    extra(frame)
  end
end

-- The guild log: its box an inset, its title (named, no key) a title, its X button (found among its children) the close cross.
local function dressGuildLog(frame)
  GW.InsetPanel(frame.Container)
  GW.SkinTitle(_G.CommunitiesGuildLogFrameTitle)
  GW.DressClose(frame, findCross(frame))
end

-- The guild text edit dialog: its box an inset, its multi-line edit box a theme edit box, its X button the close cross.
local function dressTextEdit(frame)
  GW.InsetPanel(frame.Container)
  GW.SkinEditBox(GW.Part(frame, "Container.ScrollFrame.EditBox"))
  GW.DressClose(frame, findCross(frame))
end

-- The news filters dialog as a flyout on the guild window's right edge (a pixel under it, so the shared border hides), out of combat.
local function attachNewsFilters(frame)
  local window = _G.CommunitiesFrame
  if type(window) ~= "table" or not frame.SetPoint then return end
  ns.OutOfCombat(function()
    frame:ClearAllPoints()
    frame:SetPoint("TOPLEFT", window, "TOPRIGHT", -1, -T.SPACE.section)
  end, frame)
end

-- The news filters flyout follows the guild window: attached on each show, and hidden with the window.
local function watchNewsFilters(frame)
  local window = _G.CommunitiesFrame
  if type(window) ~= "table" or not window.HookScript or vgSocialSide[frame] then return end
  vgSocialSide[frame] = true
  frame:HookScript("OnShow", ns.Guard("news filters attach", attachNewsFilters))
  window:HookScript("OnHide", ns.Guard("news filters close", function() frame:Hide() end))
end

-- The news filters dialog: its seven check boxes (frame.GuildNewsFilterButtons) as theme check boxes, attached to the window's side.
local function dressNewsFilters(frame)
  local checks = type(frame.GuildNewsFilterButtons) == "table" and frame.GuildNewsFilterButtons or {}
  for _, check in ipairs(checks) do GW.SkinCheck(check) end
  attachNewsFilters(frame)
  watchNewsFilters(frame)
end

-- The guild invite dialog's tabard (the inviting guild's, content) and its two named buttons and guild name.
GW.INVITE_TABARD = { "GuildInviteFrameTabardBackground", "GuildInviteFrameTabardEmblem" }
GW.INVITE_BUTTONS = { "GuildInviteFrameJoinButton", "GuildInviteFrameDeclineButton" }

-- The guild invite dialog: the tabard shown again (the dialog skin fades every texture), Join and Decline themed, the guild's name light.
local function dressGuildInvite()
  for _, name in ipairs(GW.INVITE_TABARD) do GW.ShowTexture(_G[name]) end
  for _, name in ipairs(GW.INVITE_BUTTONS) do GW.SkinButton(_G[name]) end
  paintText(_G.GuildInviteFrameGuildName, "text")
end

-- The community settings dialog's check boxes (paths from the dialog), dropdowns and field labels.
GW.SETTINGS_CHECKS = {
  "CrossFactionToggle.CheckButton", "ShouldListClub.Button", "AutoAcceptApplications.Button", "MaxLevelOnly.Button", "MinIlvlOnly.Button",
}
GW.SETTINGS_DROPDOWNS = { "ClubFocusDropdown", "LookingForDropdown", "LanguageDropdown" }
GW.SETTINGS_LABELS = { "NameLabel", "ShortNameLabel", "DescriptionLabel", "MessageOfTheDayLabel" }

-- The community settings dialog: two text areas and the item level box, five check boxes, three dropdowns, the labels
-- light and the community's avatar (content) shown again.
local function dressSettings(frame)
  dressScrollEdit(frame.MessageOfTheDay)
  dressScrollEdit(frame.Description)
  GW.SkinEditBox(GW.Part(frame, "MinIlvlOnly.EditBox"))
  for _, path in ipairs(GW.SETTINGS_CHECKS) do GW.SkinCheck(GW.Part(frame, path)) end
  GW.EachKey(frame, GW.SETTINGS_DROPDOWNS, GW.SkinDropdown)
  paintKeys(frame, GW.SETTINGS_LABELS, "text")
  GW.ShowTexture(frame.IconPreview)
end

-- The invite links' labels, gold in the game.
GW.TICKET_LABELS = { "LinkInstructions", "ExpandLabel", "ExpiresDropdownLabel", "UsesDropdownLabel" }

-- One row of the invite links list: a hoverable row without its stripe, its two buttons themed (the revoke cross kept).
local function dressTicketRow(row)
  if type(row) ~= "table" then return end
  GW.DressRow(row)
  GW.SkinButton(row.CopyLinkButton)
  GW.SkinButton(row.RevokeButton)
  GW.ShowTexture(GW.Part(row, "RevokeButton.Icon"))
end

-- A part's Background faded; a part the client lacks is skipped.
local function fadeBackground(part)
  if type(part) == "table" then GW.FadeParts(part, { "Background" }) end
end

-- The invite links list: the marble and the bronze corners faded, an inset panel, the column headers flat, its rows dressed.
local function dressInviteManager(list)
  if not isFrame(list) then return end
  GW.FadeParts(list, { "ArtOverlay" })
  GW.EachKey(list, { "ScrollBox", "ScrollBar" }, fadeBackground)
  T.Panel(list, { inset = true, noSheen = true })
  if isFrame(list.ColumnDisplay) then T.FadeRegions(list.ColumnDisplay) dressHeaders(list.ColumnDisplay) end
  GW.WatchRows(list.ScrollBox, dressTicketRow)
end

-- The invite manager dialog: the community's avatar shown again, two dropdowns, the expand tile, the labels light, the
-- separator a line, the links list.
local function dressTicketManager(frame)
  GW.ShowTexture(frame.Icon)
  GW.EachKey(frame, { "ExpiresDropdown", "UsesDropdown" }, GW.SkinDropdown)
  GW.SkinPlate(frame.MaximizeButton)
  paintKeys(frame, GW.TICKET_LABELS, "text")
  dressRule(frame.Separator)
  dressInviteManager(frame.InviteManager)
end

-- The notification list's stream rows come from the game's own pool and are filled on each Refresh: one row's name light,
-- its divider a line, its two radios (hide and show) theme radios.
local function dressStreamEntry(entry)
  paintText(entry.StreamName, "text")
  dressRule(entry.Separator)
  GW.EachKey(entry, { "HideNotificationsButton", "ShowNotificationsButton" }, GW.SkinRadio)
end

-- Every stream row the dialog has now.
local function dressStreams(dialog)
  local pool = dialog.buttonPool
  if type(pool) ~= "table" or type(pool.EnumerateActive) ~= "function" then return end
  for entry in pool:EnumerateActive() do dressStreamEntry(entry) end
end

-- The notification dialog's scroll child: the quick join check box, the None and All buttons, the settings divider.
local function dressNotificationChild(child)
  if type(child) ~= "table" then return end
  GW.SkinCheck(child.QuickJoinButton)
  GW.EachKey(child, { "NoneButton", "AllButton" }, GW.SkinButton)
  dressRule(child.Separator)
end

-- The notification settings dialog (inside the guild window): the dialog skin (the selection frame's nine-slice
-- faded with it), its community dropdown and buttons, the rows now and after each refresh.
local function dressNotifications(dialog)
  if not isFrame(dialog) then return end
  GW.SkinSocialDialog(dialog)
  GW.SkinDropdown(dialog.CommunitiesListDropdown)
  dressSelector(dialog)
  dressNotificationChild(GW.Part(dialog, "ScrollFrame.Child"))
  dressStreams(dialog)
  GW.HookAfter(dialog, "Refresh", dressStreams)
end

-- The channel edit dialog (inside the guild window): the dialog skin, its type check box, its description text area, its labels light.
local function dressEditStream(dialog)
  if not isFrame(dialog) then return end
  GW.SkinSocialDialog(dialog)
  paintKeys(dialog, { "NameLabel", "DescriptionLabel" }, "text")
  GW.SkinCheck(dialog.TypeCheckbox)
  dressScrollEdit(dialog.Description)
end

-- The member detail pop-up (inside the guild window): the dialog skin, its labels light, its buttons and rank dropdown
-- themed, its two note boxes insets.
local function dressMemberDetail(dialog)
  if not isFrame(dialog) then return end
  GW.SkinSocialDialog(dialog)
  paintKeys(dialog, GW.MEMBER_DETAIL_TEXT, "text")
  GW.EachKey(dialog, { "RemoveButton", "GroupInviteButton" }, GW.SkinButton)
  GW.SkinDropdown(dialog.RankDropdown)
  GW.EachKey(dialog, { "NoteBackground", "OfficerNoteBackground" }, GW.InsetPanel)
end

-- The member detail pop-up's gold name and field labels.
GW.MEMBER_DETAIL_TEXT = { "Name", "ZoneLabel", "RankLabel", "OnlineLabel", "NoteLabel", "OfficerNoteLabel" }
-- The community invitation and ticket pages' gold lines.
GW.INVITATION_TEXT = { "InvitationText", "Type", "MemberCount", "Leader" }
-- The reported-name overlays over the guild window (parentKeys).
GW.NAME_CHANGE_FRAMES = { "GuildNameChangeFrame", "CommunityNameChangeFrame", "GuildPostingChangeFrame", "CommunityPostingChangeFrame" }
-- The art of the glow box the name-change alert is made from.
GW.GLOW_BOX_ART = {
  "BG", "GlowTopLeft", "GlowTopRight", "GlowBottomLeft", "GlowBottomRight", "GlowTop", "GlowBottom", "GlowLeft", "GlowRight",
  "ShadowTopLeft", "ShadowTopRight", "ShadowBottomLeft", "ShadowBottomRight", "ShadowTop", "ShadowBottom", "ShadowLeft", "ShadowRight",
}

-- The invitation and ticket pages (the guild window's content area): the wide backdrop faded (the community's avatar
-- kept), the inset an inset panel, Accept and Decline themed, the gold lines light.
local function dressInvitation(page)
  if not isFrame(page) then return end
  T.FadeRegions(page, GW.KeepKeys(page, { "Icon" }))
  GW.InsetPanel(page.InsetFrame)
  GW.EachKey(page, { "AcceptButton", "DeclineButton" }, GW.SkinButton)
  paintKeys(page, GW.INVITATION_TEXT, "text")
end

-- A reported-name overlay: a flat opaque panel over the page below (its yellow border and black plate faded), its close
-- cross, button and edit box themed, its instruction light.
local function dressNameChange(overlay)
  if not isFrame(overlay) then return end
  T.FadeRegions(overlay)
  T.Panel(overlay, { shadow = true, alpha = 1 })
  GW.DressClose(overlay, overlay.CloseButton)
  GW.SkinButton(overlay.Button)
  GW.SkinEditBox(overlay.EditBox)
  paintText(overlay.RenameText, "text")
end

-- The alert button that tells of a reported name: the glow box's art faded, a panel in its place.
local function dressNameAlert(alert)
  if not isFrame(alert) then return end
  GW.FadeParts(alert, GW.GLOW_BOX_ART)
  T.Panel(alert, { shadow = true, alpha = 1 })
end

-- The guild window's own dialogs and overlays: the member detail, channel edit and notification dialogs, the invitation
-- and ticket pages, the reported-name overlays and their alert.
function GW.SkinCommunitiesDialogs(frame)
  dressMemberDetail(frame.GuildMemberDetailFrame)
  dressEditStream(frame.EditStreamDialog)
  dressNotifications(frame.NotificationSettingsDialog)
  dressInvitation(frame.InvitationFrame)
  dressInvitation(frame.TicketFrame)
  GW.EachKey(frame, GW.NAME_CHANGE_FRAMES, dressNameChange)
  dressNameAlert(frame.GuildNameAlertFrame)
end

GW.Add("social", { "CommunitiesGuildLogFrame" }, dialogWith(dressGuildLog))
GW.Add("social", { "CommunitiesGuildTextEditFrame" }, dialogWith(dressTextEdit))
GW.Add("social", { "CommunitiesGuildNewsFiltersFrame" }, dialogWith(dressNewsFilters))
GW.Add("social", { "GuildInviteFrame" }, dialogWith(dressGuildInvite))
GW.Add("social", { "CommunitiesSettingsDialog" }, dialogWith(dressSettings))
GW.Add("social", { "CommunitiesAvatarPickerDialog" }, dialogWith(dressSelector))
GW.Add("social", { "CommunitiesTicketManagerDialog" }, dialogWith(dressTicketManager))
-- The rename window's descriptions and cost label (QuestFont, black for the game's parchment), paths from the window.
GW.RENAME_TEXTS = { "TitleFlow.Description", "RenameFlow.Description", "RenameFlow.CostLabel" }

-- The rename window: the window skin (a ButtonFrameTemplate), its texts light, its two options rows, its name box, button and
-- two money lines themed.
local function dressGuildRename(frame)
  GW.Skin(frame)
  for _, path in ipairs(GW.RENAME_TEXTS) do paintText(GW.Part(frame, path), "text") end
  GW.EachKey(frame.TitleFlow, { "RenameOption", "RefundOption" }, dressOptionRow)
  GW.SkinButton(frame.ContextButton)
  GW.SkinEditBox(GW.Part(frame, "RenameFlow.NameBox"))
  GW.SkinMoney(GW.Part(frame, "RenameFlow.CostFrame"))
  GW.SkinMoney(frame.MoneyFrame)
end

GW.Add("social", { "GuildRenameFrame" }, dressGuildRename)

-- Channels and friends dialogs ------------------------------------------------------------------

-- The add-friend window's boxes and buttons are named by the game, not parented by key.
GW.ADD_FRIEND_BOXES = { "AddFriendNameEditBox" }
GW.ADD_FRIEND_BUTTONS = { "AddFriendEntryFrameAcceptButton", "AddFriendEntryFrameCancelButton" }

-- The add-friend window's five titles (paths from the window), gold in the game: two on the info page, three on the entry page.
GW.ADD_FRIEND_TITLES = {
  "InfoFrame.InfoContainer.LeftTextContainer.Title", "InfoFrame.InfoContainer.RightTextContainer.Title", "EntryFrame.TitleContainer.Title",
  "EntryFrame.OptionsContainer.LeftTextContainer.Title", "EntryFrame.OptionsContainer.RightTextContainer.Title",
}

-- The add-friend window: the dialog skin, its info page's Okay button and five titles, its edit boxes as T.EditBox and its buttons themed.
function GW.SkinAddFriend(frame)
  GW.SkinSocialDialog(frame)
  GW.SkinButton(GW.Part(frame, "InfoFrame.OkayButton"))
  for _, path in ipairs(GW.ADD_FRIEND_TITLES) do GW.SkinTitle(GW.Part(frame, path)) end
  for _, name in ipairs(GW.ADD_FRIEND_BOXES) do
    if type(_G[name]) == "table" and _G[name].SetText then T.EditBox(_G[name]) end
  end
  for _, name in ipairs(GW.ADD_FRIEND_BUTTONS) do
    if type(_G[name]) == "table" and _G[name].CreateTexture then T.Button(_G[name]) end
  end
end

-- The channel list keeps its rows in four pools of its own (category headers and text, voice and community channels).
GW.CHANNEL_POOLS = { "headerButtonPool", "textChannelButtonPool", "voiceChannelButtonPool", "communityChannelButtonPool" }
-- The parts of a channel row that stay: a category header's plus and minus signs.
GW.CHANNEL_ROW_KEEP = { "Collapsed", "Expanded" }

-- A channel list row with its plate faded (the game shows the plate again on each of its own Update).
local function fadeChannelRow(row)
  GW.DressRow(row, GW.CHANNEL_ROW_KEEP)
end

-- A channel list row (a pooled button) as a theme row: the plate faded again after each Update, its selected look following the
-- game's own mark (SetIsSelectedChannel), set now from the list's selection.
local function dressChannelRow(row, list)
  if type(row) ~= "table" or not row.CreateTexture then return end
  fadeChannelRow(row)
  GW.HookAfter(row, "Update", fadeChannelRow)
  GW.FollowSelected(row, "SetIsSelectedChannel")
  if type(list.GetSelectedChannelButton) == "function" then T.SelectRow(row, list:GetSelectedChannelButton() == row) end
end

-- Every row the channel list has now, after each of its Updates.
local function dressChannelList(list)
  for _, key in ipairs(GW.CHANNEL_POOLS) do
    local pool = list[key]
    if type(pool) == "table" and type(pool.EnumerateActive) == "function" then
      for row in pool:EnumerateActive() do dressChannelRow(row, list) end
    end
  end
end

-- One row of the channel roster: a hoverable row, its rank icon kept.
local function dressRosterRow(row)
  GW.DressRow(row, { "Rank" })
end

-- The channels window: the window skin, its two buttons, its two insets, the roster's heading and rows, the channel list's rows.
local function dressChannels(frame)
  GW.Skin(frame)
  GW.EachKey(frame, { "NewButton", "SettingsButton" }, GW.SkinButton)
  GW.EachKey(frame, { "LeftInset", "RightInset" }, GW.InsetPanel)
  paintKeys(frame.ChannelRoster, { "ChannelName", "ChannelCount" }, "text")
  GW.WatchRows(GW.Part(frame, "ChannelRoster.ScrollBox"), dressRosterRow)
  if type(frame.ChannelList) ~= "table" then return end
  dressChannelList(frame.ChannelList)
  GW.HookAfter(frame.ChannelList, "Update", dressChannelList)
end

GW.Add("social", { "ChannelFrame" }, dressChannels)

-- The create channel dialog: its title (on the header when the client has one), its two field labels light, its voice check box.
local function dressCreateChannel(popup)
  GW.SkinTitle(GW.Part(popup, "Header.Text"))
  paintText(GW.Part(popup, "Name.Label"), "text")
  paintText(GW.Part(popup, "Password.Label"), "text")
  GW.SkinCheck(popup.UseVoiceChat)
end

-- The friends of friends dialog: the box round its list an inset.
local function dressFriendsFriends(frame)
  GW.InsetPanel(frame.ScrollFrameBorder)
end

-- The Battle.net invite dialog: the invitee's name light.
local function dressInvitee(frame)
  paintText(frame.InviteeName, "text")
end

GW.Add("social", { "CreateChannelPopup" }, dialogWith(dressCreateChannel))
GW.Add("social", { "FriendsFriendsFrame" }, dialogWith(dressFriendsFriends))
GW.Add("social", { "BattleNetInviteFrame" }, dialogWith(dressInvitee))
GW.Add("social", { "AddFriendFrame" }, GW.SkinAddFriend)

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

-- The status dropdown's label: where it starts (past the game's presence dot, drawn 8 in and 19 wide) and the
-- room kept right of it for the chevron.
GW.PRESENCE_LABEL = { x = 31, chevron = 26 }

-- The game's word for the status the player has now (Available, Away, Busy), "" on a client without it.
local function presenceWord(dropdown)
  local util = SocialUIUtil
  if type(util) ~= "table" or type(util.GetLabelForPresenceType) ~= "function" then return "" end
  return util.GetLabelForPresenceType(dropdown.presenceTypeSelf) or ""
end

-- The status dropdown's label set to the status now, the dropdown as wide as the dot, the label and the chevron
-- (the battletag beside it is anchored to its right edge and moves along).
local function showPresence(dropdown)
  local label = vgPresenceLabel[dropdown]
  label:SetText(presenceWord(dropdown))
  local width = ns.PlainNumber(label:GetStringWidth())
  if width then dropdown:SetWidth(GW.PRESENCE_LABEL.x + width + GW.PRESENCE_LABEL.chevron) end
end

-- The status dropdown: flat with its arrow, and the status in words after the game's dot (the game shows only
-- the dot), kept up after each of the game's selection updates (a pick, a Battle.net change, a show).
local function dressPresence(dropdown)
  GW.SkinDropdown(dropdown)
  if type(dropdown) ~= "table" or not dropdown.CreateFontString or vgPresenceLabel[dropdown] then return end
  vgPresenceLabel[dropdown] = T.Text(dropdown:CreateFontString(nil, "OVERLAY"), "label")
  vgPresenceLabel[dropdown]:SetPoint("LEFT", dropdown, "LEFT", GW.PRESENCE_LABEL.x, 0)
  showPresence(dropdown)
  GW.HookAfter(dropdown, "UpdateToMenuSelections", showPresence)
end

-- The Battle.net bar: its plate and the band behind the status dropdown and battletag faded, the status
-- dropdown flat with its status in words, the menu button flat with its icon.
local function dressBattleNetBar(bar)
  if type(bar) ~= "table" or not bar.GetRegions then return end
  T.FadeRegions(bar)
  local box = bar.ControlsContainer
  if type(box) ~= "table" or not box.GetRegions then return end
  T.FadeRegions(box)
  dressPresence(box.OnlineStatusDropdown)
  iconButton(box.BattleNetMenuButton)
end

-- The parts of a list card that stay: the role or class icon on the recruit and quick join cards.
GW.CARD_KEEP = { "Icon" }

-- A square icon button on a card (invite to group, summon): the game's square plate faded, the control tile behind its icon.
local function dressCardAction(button)
  if type(button) ~= "table" or not button.CreateTexture then return end
  T.FadeRegions(button, GW.KeepKeys(button, { "ActionIcon" }))
  T.ControlPlate(button)
end

-- The gold names on a quick join card (its Members and Queues arrays) in the text colour.
local function dressCardNames(card)
  for _, list in ipairs({ type(card.Members) == "table" and card.Members or {}, type(card.Queues) == "table" and card.Queues or {} }) do
    for _, fs in ipairs(list) do paintText(fs, "text") end
  end
end

-- How the game placed a card's presence dot and its name block (the dot's centre from the card's top-left
-- corner, the block's top-left from the dot's bottom-right), or nil once they are placed otherwise (centred already).
local function gamePresenceAnchors(card, dot, text)
  local _, dotRel, _, dx, dy = dot:GetPointByName("CENTER")
  local _, textRel, _, _, ty = text:GetPointByName("TOPLEFT")
  if dotRel ~= card or textRel ~= dot then return nil end
  return dx, dy, ty
end

-- A friends or recent allies card's presence dot centred on its name block: the game hangs the block off the dot's
-- bottom-right corner, so the dot sat above the first name. The block keeps the game's height and starts just past the
-- dot, which then centres on the block's left edge. After each of the game's layouts, before it fits the names in.
local function centrePresence(card)
  local dot, text = card.PresenceHolder, card.TextHolder
  if not (isFrame(dot) and isFrame(text)) then return end
  local dx, dy, ty = gamePresenceAnchors(card, dot, text)
  local width, height = ns.PlainNumber(dot:GetWidth()), ns.PlainNumber(dot:GetHeight())
  if not (dx and width and height) then return end
  local half = width / 2
  text:SetPoint("TOPLEFT", card, "TOPLEFT", dx + half + T.SPACE.tight, dy - height / 2 + ty)
  dot:ClearAllPoints()
  dot:SetPoint("CENTER", text, "LEFT", -half - T.SPACE.tight, 0)
end

-- One list card (friends, recent allies, quick join, requests, recruits; each has a Background plate): a see-through theme
-- row with the plate faded and its icon kept, its presence dot centred on its names, its selected look following the game's
-- own SetSelected, its icon buttons on control tiles, its Accept button flat, its quick join names light. Anything without a
-- plate (a spacer) is left alone.
local function dressCard(card)
  if type(card) ~= "table" or not card.CreateTexture or type(card.Background) ~= "table" then return end
  GW.DressRow(card, GW.CARD_KEEP)
  centrePresence(card)
  GW.HookAfter(card, "LayoutScaledTextHolderAnchors", centrePresence)
  GW.FollowSelected(card, "SetSelected")
  dressCardAction(card.PartyButton)
  dressCardAction(card.RAFSummonButton)
  GW.SkinButton(card.AcceptButton)
  dressCardNames(card)
end

-- The reward card above the recruit list: its backdrop faded (the watermark kept) under a panel, its claim button flat, its gold counts light.
GW.REWARD_TEXTS = { "MonthCount.Text", "NextRewardName.Text" }

-- The recruit tab's reward card (RewardClaiming).
local function dressRewardClaiming(card)
  if not isFrame(card) then return end
  T.FadeRegions(card, GW.KeepKeys(card, { "Watermark" }))
  T.Panel(card, { noSheen = true })
  GW.SkinButton(card.ClaimOrViewRewardButton)
  for _, path in ipairs(GW.REWARD_TEXTS) do paintText(GW.Part(card, path), "text") end
end

-- One content pane: its dividers faded, its search bar and filter button themed, its push buttons flat, its list in an
-- inset with its cards as theme rows. (Its scroll bar is the tabs stream's.)
local function dressSocialPane(pane)
  if type(pane) ~= "table" or not pane.GetRegions then return end
  GW.FadeParts(pane, GW.SOCIAL_PANE_ART)
  local bar = pane.FilterBar
  if type(bar) == "table" then
    GW.SkinSearch(bar.SearchBar)
    dressKeys(bar, { "SearchFilterDropdown" }, "CreateTexture", GW.SkinDropdown)
  end
  dressKeys(pane, GW.SOCIAL_PANE_BUTTONS, "CreateTexture", T.Button)
  GW.InsetPanel(pane.ScrollBox)
  GW.WatchRows(pane.ScrollBox, dressCard)
end

-- One raid group card (the raid tab's, made on each update): its atlas plate faded under an inset panel.
local function dressSocialRaidGroup(group)
  if not isFrame(group) then return end
  T.FadeRegions(group)
  T.Panel(group, { inset = true, noSheen = true })
end

-- One raid member card (a secure unit button): a flat button, the game's drag look kept to show while it is dragged.
local function dressSocialRaidPlayer(player)
  GW.SkinButton(player)
  GW.ShowTexture(player.DragBackground)
end

-- Every member card the raid tab has now, in each group's own (secure) pool.
local function dressSocialRaidPlayers(raid)
  for _, group in ipairs(raid.groups) do
    local pool = type(group) == "table" and group.playerPool
    if type(pool) == "table" and type(pool.EnumerateActive) == "function" then
      for player in pool:EnumerateActive() do dressSocialRaidPlayer(player) end
    end
  end
end

-- The raid tab's groups (made again by every UpdateContents): the group cards now, the member buttons out of combat.
local function dressSocialRaidGroups(raid)
  if type(raid.groups) ~= "table" then return end
  for _, group in ipairs(raid.groups) do dressSocialRaidGroup(group) end
  ns.OutOfCombat(function() dressSocialRaidPlayers(raid) end, "vgSocialRaidPlayers")
end

-- The social raid tab's own parts: the All assist box (its icon kept) with its label, the not-in-raid description, and its
-- group cards, dressed again after each of the game's UpdateContents.
local function dressSocialRaid(raid)
  if not isFrame(raid) then return end
  GW.SkinCheck(raid.AllAssistCheckButton)
  GW.ShowTexture(GW.Part(raid, "AllAssistCheckButton.Icon"))
  paintText(GW.Part(raid, "AllAssistCheckButton.AllText"), "text")
  paintText(raid.RaidDescription, "text")
  dressSocialRaidGroups(raid)
  GW.HookAfter(raid, "UpdateContents", dressSocialRaidGroups)
end

-- A row of a side window's list: its name (the ignore list's Name, the saved instances' name) in the text colour.
local function dressNamedRow(row)
  if type(row) ~= "table" then return end
  paintText(row.Name, "text")
  paintText(row.name, "text")
end

-- The ignore list (a ButtonFrameTemplate beside the window): the window skin, its two buttons flat, its names light.
local function skinIgnoreList(frame)
  GW.Skin(frame)
  dressKeys(frame, GW.SOCIAL_DIALOG_BUTTONS, "CreateTexture", T.Button)
  GW.WatchRows(frame.ScrollBox, dressNamedRow)
end

-- The Battle.net unavailable notice: its heading (gold in the game) as a title.
local function dressNotice(frame)
  GW.SkinTitle(GW.Part(frame, "Header.HeaderText"))
end

-- The saved-instance list of a raid info frame: its list in an inset, the names light.
local function dressRaidInfoList(frame)
  GW.InsetPanel(frame.ScrollBox)
  GW.WatchRows(frame.ScrollBox, dressNamedRow)
end

-- The skin of each side window (parentKeys): the dialog skin and the parts only that window has.
local sideSkins = {
  BattleNetUnavailableNoticeFrame = dialogWith(dressNotice), BattleNetBroadcastFrame = GW.SkinSocialDialog, RaidInfoFrame = dialogWith(dressRaidInfoList),
}

-- How far a side window moves out (units): by what GW.ClearPadding moved the side tabs out (to the window's padded
-- edge, while the tabs group dresses them) and by the side window's own panel padding, so the game's gap between the
-- tab column and the side window (SocialUIFrameMixin:GetTabColumnWidth, 7 past the tab) holds.
local function sideShift(window, side)
  local tabs = GW.settings and GW.settings.tabs and T.Padding(window) - T.Pixel(window) or 0
  return math.max(tabs, 0) + T.Padding(side)
end

-- Moves a side window out by sideShift from the one anchor the game gave it (TOPLEFT on the window's TOPRIGHT, set
-- once at load), its column offset kept; one with other anchors, or a hidden offset, stays where it is.
local function pushSide(side, window)
  if side:GetNumPoints() ~= 1 then return end
  local point, rel, relPoint, x, y = side:GetPoint(1)
  x, y = ns.PlainNumber(x), ns.PlainNumber(y)
  if not (x and y) then return end
  side:ClearAllPoints()
  side:SetPoint(point, rel, relPoint, x + sideShift(window, side), y)
end

-- A side window of `window`: skinned now, and again on each of its own shows (it opens while the window is
-- already open, and the game lays it out then); the hook goes on, and it moves out past the tabs, once (out of
-- combat: the social window is a UI panel).
local function watchSide(window, frame, skin)
  if type(frame) ~= "table" or not frame.HookScript then return end
  skin(frame)
  if vgSocialSide[frame] then return end
  vgSocialSide[frame] = true
  frame:HookScript("OnShow", function(f) ns.Try("window SocialUIFrame side", skin, f) end)
  ns.OutOfCombat(function() pushSide(frame, window) end, frame)
end

-- The side tabs the window takes from its pool (anchored again on every RefreshTabs): each in the theme
-- with its icon and count kept, out past the window's padding, raised while it is selected and its icon
-- greyed while another is selected. Left to the game when the tabs group is off.
local function dressSocialTabs(frame)
  if not (GW.settings and GW.settings.tabs) or type(frame.EnumerateTabs) ~= "function" then return end
  for tab in frame:EnumerateTabs() do
    GW.PadTabAgain(tab, frame)
    T.Tab(tab, { dimIcon = true })
  end
end

-- The social window: the window skin, the Battle.net bar, every pane, its side windows and its tabs; the
-- tabs again whenever the game makes them again (RefreshTabs, on every show and status change).
function GW.SkinSocial(frame)
  GW.Skin(frame)
  dressBattleNetBar(frame.BattleNetBar)
  for _, key in ipairs(GW.SOCIAL_PANES) do dressSocialPane(frame[key]) end
  dressSocialRaid(frame.RaidFrame)
  dressRewardClaiming(GW.Part(frame, "RecruitAFriendFrame.RewardClaiming"))
  for _, key in ipairs(GW.SOCIAL_SIDE) do watchSide(frame, frame[key], sideSkins[key]) end
  for _, key in ipairs(GW.SOCIAL_SIDE_FRAMED) do watchSide(frame, frame[key], skinIgnoreList) end
  dressSocialTabs(frame)
  GW.HookAfter(frame, "RefreshTabs", dressSocialTabs)
end

GW.Add("social", { "SocialUIFrame" }, GW.SkinSocial)

-- Guild creation --------------------------------------------------------------------------------

-- The registrar's and the petition's body texts (the game colors them dark for its parchment, or gold as chrome), the tabard
-- vendor's name and the registrar's cost label, and the headings.
GW.CREATION_BODY = {
  "GuildRegistrarText", "GuildRegistrarPurchaseText", "GuildRegistrarCostLabel", "TabardFrameNameText",
  "PetitionFrameCharterName", "PetitionFrameMasterName", "PetitionFrameInstructions",
}
for i = 1, 9 do GW.CREATION_BODY[#GW.CREATION_BODY + 1] = "PetitionFrameMemberName" .. i end
GW.CREATION_HEADS = { "PetitionFrameCharterTitle", "PetitionFrameMasterTitle", "PetitionFrameMemberTitle" }
-- The registrar's "Available services" heading (QuestTitleFont, black for its parchment).
GW.CREATION_TITLE = "AvailableServicesText"
-- The game functions that set those texts; the look goes on again after each.
GW.CREATION_REDRAWS = { "GuildRegistrar_OnShow", "GuildRegistrar_ShowPurchaseFrame", "PetitionFrame_Update" }

-- The registrar and petition texts in light body text and light headings.
function GW.LightCreationText()
  GW.PaintNamed(GW.CREATION_BODY, "text")
  GW.PaintNamed(GW.CREATION_HEADS, "text")
  GW.TextNamed({ GW.CREATION_TITLE }, "heading", "text")
end

-- The registrar's options and the charter's price in the number font.
local function dressRegistrar()
  for i = 1, 3 do dressOptionRow(_G["GuildRegistrarButton" .. i]) end
  GW.SkinMoney(_G.GuildRegistrarMoneyFrame)
end

-- One of the tabard's five pickers (TabardFrameCustomization1-5: a label plate between two page arrows): the plate faded
-- under an inset (its caption kept), the arrows as theme arrows.
local function dressTabardPicker(i)
  local name = "TabardFrameCustomization" .. i
  local picker = _G[name]
  if type(picker) ~= "table" or not picker.GetRegions then return end
  T.FadeRegions(picker)
  T.Panel(picker, { inset = true, noSheen = true })
  GW.SkinArrow(_G[name .. "LeftButton"], "left")
  GW.SkinArrow(_G[name .. "RightButton"], "right")
end

-- The tabard window's pickers, its cost box (a tooltip backdrop) and money strip (a marble inset and a gold edge) as insets,
-- and its two price lines in the number font. The model and its rotate buttons stay the game's.
local function dressTabard()
  GW.FadeNamed({ "TabardFrameCustomizationBorder" })
  for i = 1, 5 do dressTabardPicker(i) end
  GW.InsetPanel(_G.TabardFrameCostFrame)
  GW.InsetPanel(_G.TabardFrameMoneyInset)
  GW.FadeArt(_G.TabardFrameMoneyBg)
  GW.SkinMoney(_G.TabardFrameCostMoneyFrame)
  GW.SkinMoney(_G.TabardFrameMoneyFrame)
end

-- A guild creation window: the window skin, its texts light, its name box themed, the registrar's options and the tabard's
-- pickers; the texts again after each game call that sets them.
function GW.SkinGuildCreation(frame)
  GW.Skin(frame)
  GW.LightCreationText()
  for _, name in ipairs(GW.CREATION_REDRAWS) do GW.HookAfter(_G, name, GW.LightCreationText) end
  if type(_G.GuildRegistrarFrameEditBox) == "table" and _G.GuildRegistrarFrameEditBox.SetText then T.EditBox(_G.GuildRegistrarFrameEditBox) end
  dressRegistrar()
  dressTabard()
end

GW.Add("social", { "GuildRegistrarFrame", "PetitionFrame", "TabardFrame" }, GW.SkinGuildCreation)
GW.AddButtons("GuildRegistrarFrame", { "GuildRegistrarFrameGoodbyeButton", "GuildRegistrarFrameCancelButton", "GuildRegistrarFramePurchaseButton" })
GW.AddButtons("PetitionFrame", { "PetitionFrameCancelButton", "PetitionFrameSignButton", "PetitionFrameRequestButton", "PetitionFrameRenameButton" })
GW.AddButtons("TabardFrame", { "TabardFrameAcceptButton", "TabardFrameCancelButton" })

-- Role poll and invite popups -------------------------------------------------------------------

-- The popups' push buttons: by parentKey, and by the suffix the game names them with ($parentAcceptButton).
GW.POPUP_BUTTON_KEYS = { "acceptButton" }
GW.POPUP_BUTTON_NAMES = { "AcceptButton", "DeclineButton" }

-- The role buttons of the two popups (name suffixes; the buttons are named $parentRoleButtonTank and so on) and how each popup
-- draws the box under a role icon: a radio on the role poll (one role), a check box on the dungeon invite (several).
GW.ROLE_BUTTONS = { "RoleButtonTank", "RoleButtonHealer", "RoleButtonDPS" }
GW.ROLE_CHECKS = { RolePollPopup = GW.SkinRadio, LFGInvitePopup = GW.SkinCheck }

-- The box under each role icon (its checkButton) as the popup draws it; the icons stay as the game draws them.
local function dressRoleChecks(name)
  local skin = GW.ROLE_CHECKS[name or ""]
  if not skin then return end
  for _, suffix in ipairs(GW.ROLE_BUTTONS) do skin(GW.Part(_G[name .. suffix], "checkButton")) end
end

-- The role poll and the dungeon invite popups: the dialog border faded, a flat panel with a soft shadow, the
-- close and accept/decline buttons themed, the box under each role icon (a radio or a check box). The role icons keep their art.
function GW.SkinRolePopup(frame)
  local name = frame.GetName and frame:GetName()
  T.FadeRegions(frame)
  fadeKey(frame, "Border")
  T.Panel(frame, { shadow = true })
  dressClose(frame, frame.CloseButton)
  dressKeys(frame, GW.POPUP_BUTTON_KEYS, "CreateTexture", T.Button)
  for _, suffix in ipairs(GW.POPUP_BUTTON_NAMES) do GW.SkinButton(name and _G[name .. suffix]) end
  dressRoleChecks(name)
end

GW.Add("social", { "RolePollPopup", "LFGInvitePopup" }, GW.SkinRolePopup)

-- Raid tab --------------------------------------------------------------------------------------

-- How many group boxes and member buttons the raid tab has (RaidGroup1-8, RaidGroupButton1-40).
GW.RAID_GROUPS, GW.RAID_BUTTONS = 8, 40
-- The tab's own push buttons, and its labels the game colors for its own look.
GW.RAID_PUSH_BUTTONS = { "RaidFrameRaidInfoButton", "RaidFrameConvertToRaidButton" }
GW.RAID_LABELS = { "RaidFrameAllAssistCheckButtonText" }

-- One group box: its outline and title art faded, an inset panel behind its slots, its "Group n" caption in the text colour.
local function dressRaidGroup(i)
  local group = _G["RaidGroup" .. i]
  if type(group) ~= "table" or not group.GetRegions then return end
  T.FadeRegions(group)
  local label = _G["RaidGroup" .. i .. "Label"]
  fadeFrameArt(label)
  paintText(type(label) == "table" and type(label.GetFontString) == "function" and label:GetFontString(), "text")
  T.Panel(group, { inset = true, noSheen = true })
end

-- How many class count buttons run along the raid tab's edge (RaidClassButton1-16).
GW.RAID_CLASS_BUTTONS = 16

-- One class count button: the spellbook tab plate faded (its class icon kept) under a raised tile.
local function dressRaidClassButton(i)
  local button = _G["RaidClassButton" .. i]
  if type(button) ~= "table" or not button.GetRegions then return end
  T.FadeRegions(button, GW.KeepAlso({}, _G["RaidClassButton" .. i .. "IconTexture"]))
  T.Panel(button, { raised = true, noSheen = true })
end

-- The old raid info pop-out's column headers (own frames with a three-piece tab) and the buttons it names.
GW.RAID_INFO_HEADERS = { "RaidInfoInstanceLabel", "RaidInfoIDLabel" }
GW.RAID_INFO_BUTTONS = { "RaidInfoExtendButton", "RaidInfoCancelButton" }

-- A raid info column header: its tab art faded under a raised panel.
local function dressRaidInfoHeader(header)
  if type(header) ~= "table" or not header.GetRegions then return end
  T.FadeRegions(header)
  T.Panel(header, { raised = true, noSheen = true })
end

-- The old raid tab's saved-instance pop-out (RaidInfoFrame, its close cross and buttons named, not keyed): the dialog skin, the
-- close cross in its corner, the headers, the buttons, the list in an inset, the instance names light.
local function dressRaidInfo(frame)
  if type(frame) ~= "table" or not frame.GetRegions then return end
  GW.SkinSocialDialog(frame)
  GW.DressClose(frame, _G.RaidInfoCloseButton)
  for _, name in ipairs(GW.RAID_INFO_HEADERS) do dressRaidInfoHeader(_G[name]) end
  for _, name in ipairs(GW.RAID_INFO_BUTTONS) do GW.SkinButton(_G[name]) end
  dressRaidInfoList(frame)
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
  for i = 1, GW.RAID_CLASS_BUTTONS do dressRaidClassButton(i) end
  dressRaidInfo(_G.RaidInfoFrame)
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

GW.AddOnDemand("social", "Blizzard_RaidUI", { "RaidFrame" }, GW.SkinRaidTab)
GW.Add("social", { "RaidParentFrame" })

-- Guild control window ----------------------------------------------------------------------------

-- How many rank rows and bank tabs the game makes at most (MAX_GUILDRANKS, MAX_GUILDBANK_TABS); it makes each as it needs it.
GW.CONTROL_RANKS, GW.CONTROL_TABS = 10, 8
-- The game's page updates (global functions): each makes rows, tabs or prompts the first time its page needs them.
GW.CONTROL_UPDATES = {
  "GuildControlUI_RankOrder_Update", "GuildControlUI_RankPermissions_Update",
  "GuildControlUI_BankTabPermissions_Update", "GuildControlUI_Discord_Update",
}
-- The gold captions the game draws unnamed beside its dropdowns, and the gold-per-day caption of the withdraw box.
GW.CONTROL_CAPTIONS = { "GUILDCONTROL_SELECTRANK", "DISCORD_SELECT_SERVER", "DISCORD_SELECT_CHANNEL" }
GW.CONTROL_GOLD_PER_DAY = { "GOLD_PER_DAY" }
-- The game's name for the Bank heading over the bank permission boxes, and for the Costs caption of a tab on offer.
GW.CONTROL_BANK_HEADING = "GuildControlUIRankSettingsFrameBankLabel"
GW.CONTROL_COSTS = { "COSTS_LABEL" }

-- A dropdown (a flat button that keeps its arrow) with its caption, which the game draws gold beside it, in the text colour.
local function dressControlDropdown(dropdown)
  if type(dropdown) ~= "table" then return end
  GW.SkinDropdown(dropdown)
  GW.TextRegions(dropdown, GW.CONTROL_CAPTIONS, "label", "text")
end

-- One rank row (RankChangeTemplate): its name a theme edit box, its "Rank n:" caption in the text colour, its move buttons theme
-- arrows (up and down) and its delete button a theme button that keeps its cross.
local function dressRankRow(row)
  if type(row) ~= "table" then return end
  GW.SkinEditBox(row.nameBox)
  GW.SkinText(row.rankLabel, "label", "text")
  GW.SkinArrow(row.upButton, "up")
  GW.SkinArrow(row.downButton, "down")
  GW.SkinButton(row.deleteButton)
  GW.ShowTexture(GW.Part(row, "deleteButton.icon"))
end

-- The rank order page: every rank row the game has made so far, and the New rank and (hidden) Duplicate buttons.
local function dressRankOrder(page)
  for i = 1, GW.CONTROL_RANKS do dressRankRow(_G["GuildControlUIRankOrderFrameRank" .. i]) end
  GW.EachKey(page, { "newButton", "dupButton" }, GW.SkinButton)
end

-- The rank permissions page: its rank dropdown, every permission check box, the gold-per-day box with its caption, the list of what
-- an officer may do in the text colour and the Bank heading as a section head. The tinted plates behind the groups are the game's
-- own flat colour, not art, and stay.
local function dressRankPermissions(page)
  if not isFrame(page) then return end
  dressControlDropdown(page.dropdown)
  GW.DressChecks(page, 1)
  GW.SkinEditBox(page.goldBox)
  GW.TextRegions(page.goldBox, GW.CONTROL_GOLD_PER_DAY, "small", "text")
  GW.SkinText(page.OfficerPermissions, "label", "text")
  GW.SkinSection(_G[GW.CONTROL_BANK_HEADING])
end

-- The part of a bank tab the player owns: its name in the small text colour, its view and deposit check boxes, its withdraw box.
local function dressOwnedTab(owned)
  if type(owned) ~= "table" then return end
  GW.SkinText(owned.tabName, "small", "text")
  GW.SkinCheck(owned.viewCB)
  GW.SkinCheck(owned.depositCB)
  GW.SkinEditBox(owned.editBox)
end

-- The part of a bank tab on offer: its Costs caption in the text colour, the price in the number font, the Purchase button.
local function dressBuyTab(buy)
  if type(buy) ~= "table" then return end
  GW.TextRegions(buy, GW.CONTROL_COSTS, "label", "text")
  GW.SkinMoney(buy.money)
  GW.SkinButton(buy.button)
end

-- The bank tab permissions page: its rank dropdown, the inset behind the list (its scroll bar is the tabs stream's) and every tab
-- row the game has made so far (BankTabPermissionTemplate).
local function dressBankTabs(page)
  if not isFrame(page) then return end
  dressControlDropdown(page.dropdown)
  GW.InsetPanel(page.inset)
  for i = 1, GW.CONTROL_TABS do
    local tab = _G["GuildControlBankTab" .. i]
    if type(tab) == "table" then dressOwnedTab(tab.owned) dressBuyTab(tab.buy) end
  end
end

-- The Discord status shown when the guild is linked (made the first time it is needed): its title, server, channel, the
-- separate-stream box and the Unlink button.
local function dressDiscordLinked(linked)
  if type(linked) ~= "table" then return end
  GW.SkinText(linked.linkedTitle, "heading", "text")
  GW.EachKey(linked, { "linkedServer", "linkedChannel" }, function(fs) GW.SkinText(fs, "small", "text") end)
  GW.SkinCheck(GW.Part(linked, "SeparateStream.Button"))
  GW.SkinButton(linked.button)
end

-- The Discord status shown when the user has not signed in (made the first time it is needed): its prompt and button.
local function dressDiscordUnlinked(unlinked)
  if type(unlinked) ~= "table" then return end
  GW.SkinText(unlinked.unlinkedTitle, "label", "text")
  GW.SkinButton(unlinked.button)
end

-- The Discord page: its server and channel dropdowns, its link button, and the two link statuses.
local function dressDiscord(page)
  if isFrame(page) then
    dressControlDropdown(page.serverDropdown)
    dressControlDropdown(page.channelDropdown)
    GW.SkinButton(page.channelButton)
  end
  dressDiscordLinked(_G.DiscordLinkFrame)
  dressDiscordUnlinked(_G.DiscordUnlinkFrame)
end

-- The guild control window's four pages, with what the game has made on each so far.
local function dressControlPages(frame)
  dressRankOrder(frame.orderFrame)
  dressRankPermissions(frame.rankPermFrame)
  dressBankTabs(frame.bankTabFrame)
  dressDiscord(frame.discordFrame)
end

-- Keeps the pages dressed: the game makes rank rows, bank tabs and the Discord prompts inside its page updates (global functions,
-- stored by the window as the page changes) and redraws them on its events, so the pages are dressed again after each of those. Post-hooks
-- only, once per window.
local function watchControl(frame)
  if vgControlWatched[frame] then return end
  vgControlWatched[frame] = true
  -- Dresses the pages again.
  local function redress() dressControlPages(frame) end
  for _, name in ipairs(GW.CONTROL_UPDATES) do GW.HookAfter(_G, name, redress) end
  frame:HookScript("OnEvent", ns.Guard("guild control event", redress))
end

-- The guild control window (officers' ranks and permissions, load on demand): the window skin, its title, the divider under the
-- header, the page dropdown, the four pages, and the watch that dresses what the game makes later.
function GW.SkinGuildControl(frame)
  GW.Skin(frame)
  GW.SkinTitle(_G.GuildControlUITitle)
  dressRule(_G.GuildControlUIHbar)
  GW.SkinDropdown(frame.dropdown)
  dressControlPages(frame)
  watchControl(frame)
end

GW.AddOnDemand("social", "Blizzard_GuildControlUI", { "GuildControlUI" }, GW.SkinGuildControl)

-- Toasts ----------------------------------------------------------------------------------------

-- The toasts' lines (parentKeys) with their text role and colour. Top and middle lines keep the game's
-- colour (a friend's name in Battle.net blue); the bottom line's grey (and the single-line variant's) is hard to read on
-- the dark panel, so it goes to the theme's secondary text on each show (the game greys it again before every toast,
-- by SetTextColor or, for a friend coming online, by a colour code inside the text itself).
-- Text is the time-played alert's one line, and the voice chat prompts' (Text2 is the second line of a voice channel
-- notification, which keeps the game's colour codes: they colour the channel's name).
GW.TOAST_LINES = {
  TopLine = { "label", false }, MiddleLine = { "small", false }, BottomLine = { "small", "text2" }, DoubleLine = { "label", "text2" },
  Text = { "label", false }, Text2 = { "small", false },
}

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
  GW.HookAfter(frame, "ShowToast", GW.SkinToast)
  local icon = frame.IconTexture or frame.Icon
  T.FadeRegions(frame, GW.KeepAlso({}, icon))
  T.Tooltip(frame)
  dressToastLines(frame)
  if type(frame.CloseButton) == "table" and frame.CloseButton.CreateTexture then T.CloseButton(frame.CloseButton) end
  dressToastTooltip(frame.TooltipFrame)
end

GW.Add("social", { "BNToastFrame", "TimeAlertFrame" }, GW.SkinToast)

-- The voice chat prompts (the offer to join a party's or raid's voice channel, the note that it is on) are the same
-- kind of toast, with their icon under Icon: the toast skin, and the offer's Join button themed.
function GW.SkinVoicePrompt(frame)
  GW.SkinToast(frame)
  if type(frame) == "table" then GW.SkinButton(frame.AcceptButton) end
end

GW.Add("social", { "VoiceChatPromptActivateChannel", "VoiceChatChannelActivatedNotification" }, GW.SkinVoicePrompt)
