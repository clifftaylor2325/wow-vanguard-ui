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
