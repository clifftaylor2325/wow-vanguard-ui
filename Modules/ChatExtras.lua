-- Chat extras:
--   * web addresses in chat become links in the accent color; clicking one
--     opens a box with the address selected, ready to copy (Ctrl+C);
--   * a small Copy button over the main chat window (and /vg copy) opens the
--     recent chat as plain text, ready to copy;
--   * short channel names: "[2. Trade - City]" shows as "[T]", "[Guild]" as "[G]";
--   * Ctrl + mouse wheel jumps to the top or the bottom of a chat window;
--   * the game's own timestamp and class-colored name settings, offered in /vg.
-- Chat text the game hides from addons (in instances) is never read or
-- changed: those lines pass through as they are and are left out of the copy.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgWatched = ns.FrameState("vgWatched")

local T = ns.Theme

local CX = ns.Module("ChatExtras", { defaults = { links = true, copy = true, shortChannels = false, ctrlScroll = true } })

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
local PREFIX = "addon:Vanguard:url:"

-- Links -----------------------------------------------------------------------------------

-- The accent's text variant as a chat color code.
local function accentCode()
  local r, g, b = T.RGB("accentText")
  return string.format("|cff%02x%02x%02x", math.floor(r * 255), math.floor(g * 255), math.floor(b * 255))
end

-- A message with each web address made a clickable accent link (hidden text is returned as is).
function CX.LinkURLs(text)
  if ns.IsSecret(text) or type(text) ~= "string" then return text end
  if not (text:find("://", 1, true) or text:find("www.", 1, true)) then return text end
  local color = accentCode()
  for _, pattern in ipairs(CX.PATTERNS) do
    text = text:gsub(pattern, function(url) return color .. "|H" .. PREFIX .. url .. "|h[" .. url .. "]|h|r" end)
  end
  return text
end

-- Chat filter: hands the game the message with its addresses linked (or unchanged).
local function filter(_, _, text, ...)
  if ns.Restricted("Chat") then return false end
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
  if type(ChatFrame_AddMessageEventFilter) ~= "function" or type(registry) ~= "table" or type(registry.RegisterCallback) ~= "function" then return end
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

-- A small Copy button in the main chat window's tab row, at its right end.
local function addCopyButton()
  local frame = _G.ChatFrame1
  if type(frame) ~= "table" or type(frame.GetNumMessages) ~= "function" then return end
  CX.copyButton = ns.DialogButton(frame, "Copy", 40)
  CX.copyButton:SetHeight(16)
  CX.copyButton:SetPoint("BOTTOMRIGHT", frame, "TOPRIGHT", 0, T.SPACE.tight)
  CX.copyButton:SetScript("OnClick", ns.Guard("click copy chat", CX.ShowCopy))
end

-- Short channel names ---------------------------------------------------------------------

-- A channel's short name: the capitals of its name, without the number and the
-- zone ("2. Trade - City" -> "T", "LookingForGroup" -> "LFG", "Raid Leader" -> "RL");
-- a name with no capital letters keeps its first letter.
function CX.ShortName(label)
  local name = label:gsub("^%d+%.%s*", ""):gsub("%s+%-%s+.*$", "")
  local caps = name:gsub("[^%u]", "")
  return caps ~= "" and caps or name:match("^[\1-\127\194-\244][\128-\191]*") or name
end

-- A chat line with each channel tag shortened ("|Hchannel:...|h[2. Trade - City]|h"
-- -> "...|h[T]|h"), the link kept so clicking the tag still opens the channel.
-- Text the game hides from addons is returned as it is.
function CX.ShortChannels(text)
  if ns.IsSecret(text) or type(text) ~= "string" then return text end
  return (text:gsub("(|Hchannel:[^|]+|h)%[([^%]]+)%](|h)", function(link, label, close) return link .. "[" .. CX.ShortName(label) .. "]" .. close end))
end

-- The line a window just added, with its channel tags short: the game's own
-- TransformMessages rewrites it (no addon code runs inside the game's chat handler).
local function shortenAdded(frame, text)
  if not CX.settings.shortChannels or ns.IsSecret(text) or type(text) ~= "string" then return end
  local short = CX.ShortChannels(text)
  if short == text then return end
  frame:TransformMessages(function(message) return not ns.IsSecret(message) and message == text end, function(_, ...) return short, ... end)
end

-- Ctrl + wheel: the top of the window (wheel up) or the bottom (wheel down), after the game's own scroll.
local function jump(frame, delta)
  if not CX.settings.ctrlScroll or not IsControlKeyDown() then return end
  if delta > 0 then frame:ScrollToTop() else frame:ScrollToBottom() end
end

-- Follows a chat window's new lines and wheel, once per window.
local function watchWindow(frame)
  if type(frame) ~= "table" or vgWatched[frame] then return end
  vgWatched[frame] = true
  if type(frame.TransformMessages) == "function" and type(hooksecurefunc) == "function" then hooksecurefunc(frame, "AddMessage", ns.Guard("hook AddMessage", shortenAdded)) end
  frame:HookScript("OnMouseWheel", jump)
end

-- Follows every chat window, the temporary ones (whispers) too.
function CX.WatchWindows()
  for i = 1, NUM_CHAT_WINDOWS or 10 do watchWindow(_G["ChatFrame" .. i]) end
  for _, name in ipairs(CHAT_FRAMES or {}) do watchWindow(_G[name]) end
end

-- The game's chat settings ------------------------------------------------------------------

-- The client's CVar function by name (C_CVar's, or the old global), or nil.
local function cvarCall(name)
  local fn = C_CVar and C_CVar[name] or _G[name]
  return type(fn) == "function" and fn or nil
end

-- get/set for one of the game's own chat settings (a CVar), read and written
-- straight through so the game's options and Vanguard's agree; read(value)
-- turns the stored value into a choice. A failing call is ignored.
function CX.CVarSetting(name, read)
  return function() local get = cvarCall("GetCVar") return read(get and get(name)) end,
    function(v) local set = cvarCall("SetCVar") if set then pcall(set, name, v) end end
end

-- The game's timestamp formats as choices, each shown as the time it would print.
local TIMESTAMP_FORMATS = { "HHMM_24HR", "HHMMSS_24HR", "HHMM", "HHMMSS", "HHMM_AMPM", "HHMMSS_AMPM" }
-- 15:27:32 on 15 Dec 2010, the sample the game's own options show.
local SAMPLE = { year = 2010, month = 12, day = 15, hour = 15, min = 27, sec = 32 }

-- How a timestamp format prints the sample time (the game's own formatter), or the format itself.
local function sampleText(format)
  if type(TimeUtil) ~= "table" or type(TimeUtil.BetterDate) ~= "function" or type(time) ~= "function" then return format end
  return TimeUtil.BetterDate(format, time(SAMPLE))
end

-- The choices for the game's chat timestamps: off, then each format this client has.
function CX.TimestampChoices()
  local out = { { "none", "Off" } }
  for _, key in ipairs(TIMESTAMP_FORMATS) do
    local format = _G["TIMESTAMP_FORMAT_" .. key]
    if type(format) == "string" then out[#out + 1] = { format, sampleText(format) } end
  end
  return out
end

-- Module entry point (Core/Modules.lua).
function CX.Enable(settings)
  CX.settings = settings
  if settings.links then watchLinks() end
  if settings.copy then addCopyButton() end
  CX.WatchWindows()
  if type(hooksecurefunc) == "function" and type(FCF_OpenTemporaryWindow) == "function" then hooksecurefunc("FCF_OpenTemporaryWindow", ns.Guard("hook FCF_OpenTemporaryWindow", CX.WatchWindows)) end
end
