-- Game windows, social group: Mail, guild, channels, friends sub-dialogs, guild creation, role poll and the raid tab, in the
-- Vanguard look. Filled by stream S1 of docs/handoff/RESKIN-PLAN.md; registers with
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

-- The maximize and minimize buttons: their glyph is their art, so they get a flat inset panel behind it
-- (T.Button would fade the glyph away).
local function dressMaxMin(box)
  if type(box) ~= "table" then return end
  for _, key in ipairs({ "MaximizeButton", "MinimizeButton" }) do
    local button = box[key]
    if type(button) == "table" and button.CreateTexture then T.Panel(button, { inset = true, noSheen = true }) end
  end
end

-- The guild window: the window skin, the portrait art faded, each pane and the stream
-- dropdown dressed; again whenever the game switches pages (SetDisplayMode). The side tabs are the tabs stream's.
function GW.SkinGuildWindow(frame)
  GW.Skin(frame)
  GW.FadeParts(frame, { "PortraitOverlay" })
  for _, key in ipairs(GW.GUILD_PANES) do dressPane(frame[key]) end
  dressMaxMin(frame.MaximizeMinimizeFrame)
  if type(frame.StreamDropdown) == "table" and frame.StreamDropdown.CreateTexture then T.Button(frame.StreamDropdown) end
  after(frame, "SetDisplayMode", GW.SkinGuildWindow)
end

GW.Add("social", "framed", { "CommunitiesFrame" }, GW.SkinGuildWindow)

-- Guild dialogs ---------------------------------------------------------------------------------

-- The art the guild dialogs draw behind them (translucent frames, dark dialog borders).
GW.GUILD_DIALOG_ART = { "NineSlice", "Bg", "BG", "Border", "Background" }
-- Their push buttons by parentKey, and by the name suffix the game gives them ($parentAcceptButton).
GW.GUILD_DIALOG_BUTTONS = { "Accept", "Cancel", "Delete", "Close", "Copy", "LinkToChat", "GenerateLinkButton", "ChangeAvatarButton", "ContextButton" }
GW.GUILD_DIALOG_NAMED = { "AcceptButton" }
-- Their edit boxes by parentKey.
GW.GUILD_DIALOG_BOXES = { "NameEdit", "ShortNameEdit" }

-- Fades one art part named key: a texture, or a frame with its own textures and NineSlice.
local function fadeKey(frame, key)
  GW.FadeParts(frame, { key })
  fadeFrameArt(frame[key])
end

-- A dialog's close control: the game's "Close" text button as a flat button, its X button as the close glyph.
local function dressClose(button)
  if type(button) ~= "table" or not button.CreateTexture then return end
  local text = type(button.GetText) == "function" and button:GetText() or ""
  if text ~= "" then T.Button(button) else T.CloseButton(button) end
end

-- Themes each part of frame named in keys that is a widget with the method `need` (T.Button, or T.EditBox for boxes).
local function dressKeys(frame, keys, need, skin)
  for _, key in ipairs(keys) do
    local part = frame[key]
    if type(part) == "table" and part[need] and part ~= frame.CloseButton then skin(part) end
  end
end

-- The parts a guild dialog may have, each only if it has it: title, close control, push buttons, edit boxes.
local function dressDialogParts(frame, name)
  if type(frame.Title) == "table" and frame.Title.SetFont then T.Text(frame.Title, "heading", false) end
  dressClose(frame.CloseButton or (name and _G[name .. "CloseButton"]))
  dressKeys(frame, GW.GUILD_DIALOG_BUTTONS, "CreateTexture", T.Button)
  dressKeys(frame, GW.GUILD_DIALOG_BOXES, "SetText", T.EditBox)
  for _, suffix in ipairs(GW.GUILD_DIALOG_NAMED) do
    local button = name and _G[name .. suffix]
    if type(button) == "table" and button.CreateTexture then T.Button(button) end
  end
end

-- A guild dialog: its art faded, a flat panel with a soft shadow, its parts themed. (Not GW.Skin: the log and
-- text-edit dialogs have a text "Close" button named $parentCloseButton, which must not get the close glyph.)
function GW.SkinGuildDialog(frame)
  T.FadeRegions(frame)
  for _, key in ipairs(GW.GUILD_DIALOG_ART) do fadeKey(frame, key) end
  T.Panel(frame, { shadow = true })
  dressDialogParts(frame, frame.GetName and frame:GetName())
end

GW.Add("social", "framed", {
  "CommunitiesGuildLogFrame", "CommunitiesGuildNewsFiltersFrame", "CommunitiesGuildTextEditFrame", "GuildInviteFrame",
  "CommunitiesSettingsDialog", "CommunitiesAvatarPickerDialog", "CommunitiesTicketManagerDialog",
}, GW.SkinGuildDialog)
-- The rename window is a ButtonFrameTemplate: the window skin does it all.
GW.Add("social", "framed", { "GuildRenameFrame" })
