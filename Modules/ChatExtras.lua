-- Chat extras:
--   * web addresses in chat become links in the accent color; clicking one
--     opens a box with the address selected, ready to copy (Ctrl+C);
--   * a small Copy button over the main chat window (and /fui copy) opens the
--     recent chat as plain text, ready to copy.
-- Chat text the game hides from addons (in instances) is never read or
-- changed: those lines pass through as they are and are left out of the copy.

local ADDON, ns = ...

local T = ns.Theme

local CX = ns.Module("ChatExtras", { defaults = { links = true, copy = true } })

-- The chat message events whose text may hold a web address.
CX.EVENTS = {
  "CHAT_MSG_SAY", "CHAT_MSG_YELL", "CHAT_MSG_GUILD", "CHAT_MSG_OFFICER", "CHAT_MSG_PARTY", "CHAT_MSG_PARTY_LEADER",
  "CHAT_MSG_RAID", "CHAT_MSG_RAID_LEADER", "CHAT_MSG_INSTANCE_CHAT", "CHAT_MSG_INSTANCE_CHAT_LEADER",
  "CHAT_MSG_WHISPER", "CHAT_MSG_WHISPER_INFORM", "CHAT_MSG_BN_WHISPER", "CHAT_MSG_BN_WHISPER_INFORM", "CHAT_MSG_CHANNEL",
}
-- Web addresses: a word starting http(s):// or www. (up to a space or an escape code).
CX.PATTERNS = { "%f[%S]https?://[^%s|]+", "%f[%S]www%.[^%s|]+" }
CX.COPY_LINES = 100
-- The link's prefix: the game hands "addon:" links to addons instead of the item tooltip.
local PREFIX = "addon:ForeverUI:url:"

-- Links -----------------------------------------------------------------------------------

-- The accent as a chat color code.
local function accentCode()
  local r, g, b = T.RGB("accent")
  return string.format("|cff%02x%02x%02x", math.floor(r * 255), math.floor(g * 255), math.floor(b * 255))
end

-- A message with each web address made a clickable accent link (hidden text is returned as is).
function CX.LinkURLs(text)
  if ns.IsSecret(text) or type(text) ~= "string" then return text end
  local color = accentCode()
  for _, pattern in ipairs(CX.PATTERNS) do
    text = text:gsub(pattern, function(url) return color .. "|H" .. PREFIX .. url .. "|h[" .. url .. "]|h|r" end)
  end
  return text
end

-- Chat filter: hands the game the message with its addresses linked (or unchanged).
local function filter(_, _, text, ...)
  local linked = CX.LinkURLs(text)
  if linked ~= text then return false, linked, ... end
  return false
end

-- A link was clicked: an address of ours opens in the copy box.
function CX.OnLink(_, link)
  if type(link) ~= "string" or link:sub(1, #PREFIX) ~= PREFIX then return end
  ns.ShowText("Copy the address (Ctrl+C)", link:sub(#PREFIX + 1))
end

-- Links addresses in chat, where the game hands addon links back to addons.
local function watchLinks()
  local registry = _G.EventRegistry
  if type(ChatFrame_AddMessageEventFilter) ~= "function" or type(registry) ~= "table" then return end
  for _, event in ipairs(CX.EVENTS) do ChatFrame_AddMessageEventFilter(event, filter) end
  registry:RegisterCallback("SetItemRef", CX.OnLink, CX)
end

-- Copy ------------------------------------------------------------------------------------

-- A chat line as plain text: colors, links and icons stripped down to their words.
function CX.Plain(text)
  text = text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
  text = text:gsub("|H.-|h(.-)|h", "%1"):gsub("|T.-|t", ""):gsub("|A.-|a", "")
  return text
end

-- The main chat window's last lines as plain text (lines the game hides are left out).
function CX.RecentText(frame)
  local lines, count = {}, ns.PlainNumber(frame:GetNumMessages()) or 0
  for i = math.max(1, count - CX.COPY_LINES + 1), count do
    local text = frame:GetMessageInfo(i)
    if type(text) == "string" and not ns.IsSecret(text) then lines[#lines + 1] = CX.Plain(text) end
  end
  return table.concat(lines, "\n")
end

-- Opens the recent chat in the copy box.
function CX.ShowCopy()
  local frame = _G.ChatFrame1
  if type(frame) ~= "table" or type(frame.GetNumMessages) ~= "function" then return ns.Chat("This client can't read the chat back.") end
  ns.ShowText("Copy chat (Ctrl+C)", CX.RecentText(frame))
end

-- A small Copy button over the main chat window's top-right corner.
local function addCopyButton()
  local frame = _G.ChatFrame1
  if type(frame) ~= "table" or type(frame.GetNumMessages) ~= "function" then return end
  CX.copyButton = ns.DialogButton(frame, "Copy", 40)
  CX.copyButton:SetHeight(16)
  CX.copyButton:SetPoint("BOTTOMRIGHT", frame, "TOPRIGHT", 0, 4)
  CX.copyButton:SetScript("OnClick", CX.ShowCopy)
end

-- Module entry point (Core/Modules.lua).
function CX.Enable(settings)
  if settings.links then watchLinks() end
  if settings.copy then addCopyButton() end
end
