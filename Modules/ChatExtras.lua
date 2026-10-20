-- Chat extras:
--   * web addresses in chat (and in the guild message of the day) become links in the accent
--     color, "discord.gg/abc" too; clicking one opens a box with the address selected, ready to
--     copy (Ctrl+C);
--   * a small Copy button in the main chat window's tab bar (and /vg copy) opens
--     the recent chat of the tab you are looking at as plain text, at its newest line, ready to copy;
--   * short channel names (on by default): "[2. Trade - City]" shows as "[2]", "[Guild]" as
--     "[G]", beside the channel's colour; a profile that turned it off keeps that;
--   * the mouse wheel moves four lines a tick (the game's three and one more), and
--     Ctrl + wheel jumps to the top or the bottom of a chat window;
--   * the game's own timestamp and class-colored name settings, offered in /vg.
-- Chat text the game hides from addons (in instances) is never read or
-- changed: those lines pass through as they are and are left out of the copy.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgWatched = ns.FrameState("vgWatched")

local T = ns.Theme

local CX = ns.Module("ChatExtras", { defaults = { links = true, copy = true, shortChannels = true, ctrlScroll = true } })

-- The chat message events whose text may hold a web address.
CX.EVENTS = {
  "CHAT_MSG_SAY", "CHAT_MSG_YELL", "CHAT_MSG_GUILD", "CHAT_MSG_OFFICER", "CHAT_MSG_PARTY", "CHAT_MSG_PARTY_LEADER",
  "CHAT_MSG_RAID", "CHAT_MSG_RAID_LEADER", "CHAT_MSG_INSTANCE_CHAT", "CHAT_MSG_INSTANCE_CHAT_LEADER",
  "CHAT_MSG_WHISPER", "CHAT_MSG_WHISPER_INFORM", "CHAT_MSG_BN_WHISPER", "CHAT_MSG_BN_WHISPER_INFORM", "CHAT_MSG_CHANNEL",
}
-- Web addresses: a word starting http(s):// or www. (up to a space or an escape code).
CX.PATTERNS = { "%f[%S]https?://[^%s|]+", "%f[%S]www%.[^%s|]+" }
-- The web endings a bare address ("discord.gg/abc", "site.com") must have to become a link.
CX.TLDS = { com = true, net = true, org = true, gg = true, tv = true, io = true, eu = true }
CX.COPY_LINES = 100
-- The link's prefix: the game hands "addon:" links to addons instead of the item tooltip.
local PREFIX = "addon:Vanguard:url:"

-- Links -----------------------------------------------------------------------------------

-- The accent's text variant as a chat color code.
local function accentCode()
  local r, g, b = T.RGB("accentText")
  return string.format("|cff%02x%02x%02x", math.floor(r * 255), math.floor(g * 255), math.floor(b * 255))
end

-- The punctuation after an address that is left out of its link: "site.com/x." links "site.com/x".
local TRAIL = "[%.,!%?;:%)]+$"

-- An address as a clickable link in the accent color, with the punctuation after it (TRAIL) left outside.
local function linkText(url, color)
  local bare = url:gsub(TRAIL, "")
  return color .. "|H" .. PREFIX .. bare .. "|h[" .. bare .. "]|h|r" .. url:sub(#bare + 1)
end

-- The address at the start of a bare word ("discord.gg/abc," -> "discord.gg/abc,"), or nil: a host ending in
-- one of CX.TLDS, then an optional path. A word holding a bracket or an escape (a link made already) is never one.
function CX.BareAddress(word)
  local host = not word:find("[%[%]|]") and word:match("^[%w%-%.]+")
  if not host then return nil end
  host = host:gsub("%.+$", "")
  local ending = host:match("%w%.(%a+)$")
  if not (ending and CX.TLDS[ending:lower()]) then return nil end
  return host .. (word:sub(#host + 1):match("^/[^%s]*") or "")
end

-- A word with its bare address made a link (an opening bracket or quote before it, and the rest of the word, a
-- comma say, after it, kept outside), or the word as it was.
local function linkBare(word, color)
  local lead = word:match("^[%(\"']*")
  local url = CX.BareAddress(word:sub(#lead + 1))
  if not url then return word end
  return lead .. linkText(url, color) .. word:sub(#lead + #url + 1)
end

-- Whether a piece of chat holds a word with one of CX.TLDS as its ending ("site.com", "discord.gg/abc"):
-- only then is it read word by word.
local function hasEnding(text)
  for ending in text:gmatch("%w%.(%a+)") do
    if CX.TLDS[ending:lower()] then return true end
  end
  return false
end

-- A piece of chat outside any link, with its addresses linked: http(s):// and www. words, then bare addresses.
local function linkPiece(text, color)
  for _, pattern in ipairs(CX.PATTERNS) do
    text = text:gsub(pattern, function(url) return linkText(url, color) end)
  end
  if not hasEnding(text) then return text end
  return (text:gsub("%S+", function(word) return linkBare(word, color) end))
end

-- A line with fn applied to the text between its links ("|H...|h[name]|h"), the links themselves kept as they
-- are, so a dotted word in an item's or a quest's name is never made a link inside the link.
local function outsideLinks(text, fn)
  local out, at = {}, 1
  for first, last in function() return text:find("|H.-|h.-|h", at) end do
    out[#out + 1] = fn(text:sub(at, first - 1)) .. text:sub(first, last)
    at = last + 1
  end
  out[#out + 1] = fn(text:sub(at))
  return table.concat(out)
end

-- Whether a line may hold an address: "://", or a letter, a dot and two letters ("www.", "site.com").
local function mayLink(text)
  return text:find("://", 1, true) or text:find("%w%.%a%a")
end

-- A message with each web address made a clickable accent link (hidden text is returned as is). Only a line that
-- may hold one (mayLink) is read, and only between its links.
function CX.LinkURLs(text)
  if ns.IsSecret(text) or type(text) ~= "string" or not mayLink(text) then return text end
  local color = accentCode()
  return outsideLinks(text, function(piece) return linkPiece(piece, color) end)
end

-- Chat filter: hands the game the message with its addresses linked (or unchanged; links off
-- leaves every line as it is, so the switch applies at once).
-- Hidden or missing text passes before anything reads it (comparing it could raise inside the game's chat handler).
function CX.Filter(_, _, text, ...)
  if not CX.settings.links or ns.Restricted("Chat") then return false end
  if ns.IsSecret(text) or type(text) ~= "string" then return false end
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
  if type(registry) ~= "table" or type(registry.RegisterCallback) ~= "function" then return end
  if not ns.AddChatFilters(CX.EVENTS, ns.GuardResult("chat filter links", CX.Filter, false)) then return end
  registry:RegisterCallback("SetItemRef", ns.Guard("chat link click", CX.OnLink), CX)
end

-- Copy ------------------------------------------------------------------------------------

-- A chat line as plain text: colors, links and icons stripped down to their words.
function CX.Plain(text)
  text = text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
  text = text:gsub("|H.-|h(.-)|h", "%1"):gsub("|T.-|t", ""):gsub("|A.-|a", "")
  return text
end

-- A chat window's last lines as plain text (lines the game hides are left out).
function CX.RecentText(frame)
  local lines, count = {}, ns.PlainNumber(frame:GetNumMessages()) or 0
  for i = math.max(1, count - CX.COPY_LINES + 1), count do
    local text = frame:GetMessageInfo(i)
    if type(text) == "string" and not ns.IsSecret(text) then lines[#lines + 1] = CX.Plain(text) end
  end
  return table.concat(lines, "\n")
end

-- The chat window you are looking at (the shown tab), or the main one.
local function shownWindow()
  local frame = _G.SELECTED_CHAT_FRAME
  if type(frame) == "table" and type(frame.GetNumMessages) == "function" then return frame end
  return _G.ChatFrame1
end

-- The copy box's title, naming the tab ("Copy Trade (Ctrl+C)"), or "Copy chat" when the game gives no plain name.
local function copyTitle(frame)
  local name = type(frame.GetID) == "function" and type(GetChatWindowInfo) == "function" and GetChatWindowInfo(frame:GetID())
  if ns.IsSecret(name) or type(name) ~= "string" or name == "" then name = "chat" end
  return "Copy " .. name .. " (Ctrl+C)"
end

-- Opens the recent chat of the shown tab in the copy box, at its newest line.
function CX.ShowCopy()
  local frame = shownWindow()
  if type(frame) ~= "table" or type(frame.GetNumMessages) ~= "function" then return ns.Chat("This client can't read the chat back.") end
  ns.ShowTextAtEnd(copyTitle(frame), CX.RecentText(frame))
end

-- A small Copy button in the main chat window's tab bar, at its right end.
local function addCopyButton()
  local frame = _G.ChatFrame1
  if type(frame) ~= "table" or type(frame.GetNumMessages) ~= "function" then return end
  CX.copyButton = ns.GetModule("Chat").AddBarButton(frame, "Copy", "click copy chat", CX.ShowCopy)
end

-- Shows or hides the Copy button as its switch is set (made now when it was off at login), at once;
-- the bar's other tiles and the dock close up over it (Modules/Chat.lua CH.PlaceBarButtons).
function CX.ApplyCopy()
  if CX.settings.copy and not CX.copyButton then addCopyButton() end
  if not CX.copyButton then return end
  CX.copyButton:SetShown(CX.settings.copy == true)
  ns.GetModule("Chat").PlaceBarButtons(_G.ChatFrame1)
end

-- Short channel names ---------------------------------------------------------------------

-- A channel's short name: its number when it has one ("2. Trade - City" -> "2"), else the
-- capitals of its name ("Guild" -> "G", "Raid Leader" -> "RL"); a name with no capital letters
-- keeps its first letter.
function CX.ShortName(label)
  local number = label:match("^(%d+)%.")
  if number then return number end
  local name = label:gsub("^%d+%.%s*", ""):gsub("%s+%-%s+.*$", "")
  local caps = name:gsub("[^%u]", "")
  return caps ~= "" and caps or name:match("^[\1-\127\194-\244][\128-\191]*") or name
end

-- A chat line with each channel tag shortened ("|Hchannel:...|h[2. Trade - City]|h"
-- -> "...|h[2]|h"), the link kept so clicking the tag still opens the channel.
-- Text the game hides from addons is returned as it is.
function CX.ShortChannels(text)
  if ns.IsSecret(text) or type(text) ~= "string" then return text end
  return (text:gsub("(|Hchannel:[^|]+|h)%[([^%]]+)%](|h)", function(link, label, close) return link .. "[" .. CX.ShortName(label) .. "]" .. close end))
end

-- The game's guild message of the day words ("Guild Message of the Day: "), or nil.
local function motdStart()
  return type(GUILD_MOTD_TEMPLATE) == "string" and GUILD_MOTD_TEMPLATE:match("^(.-)%%s") or nil
end

-- The guild message of the day line with its addresses linked (no chat filter sees it: the game adds it to the
-- window itself; a timestamp may come before its words); any other line as it is, and every line while chat is
-- restricted, as the link filter does.
function CX.LinkMotd(text)
  local words = CX.settings.links and motdStart()
  if not (words and words ~= "" and text:find(words, 1, true)) or ns.Restricted("Chat") then return text end
  return CX.LinkURLs(text)
end

-- A line as Vanguard shows it: its channel tags short (switched on), and the guild message of the day linked.
local function rewrite(text)
  if CX.settings.shortChannels then text = CX.ShortChannels(text) end
  return CX.LinkMotd(text)
end

-- The line a window just added, rewritten (rewrite): the game's own TransformMessages swaps it in
-- (no addon code runs inside the game's chat handler). Hidden text is never read.
local function rewriteAdded(frame, text)
  if not (CX.settings.shortChannels or CX.settings.links) or ns.IsSecret(text) or type(text) ~= "string" then return end
  local shown = rewrite(text)
  if shown == text then return end
  frame:TransformMessages(function(message) return not ns.IsSecret(message) and message == text end, function(_, ...) return shown, ... end)
end

-- How many lines a wheel tick moves in all, and how many of them the game's own handler moves
-- (ScrollUtil's ScrollByAmount(delta * 3), whatever the modifiers): the rest are added here.
CX.WHEEL_LINES, CX.GAME_WHEEL_LINES = 4, 3

-- Ctrl + wheel (switched on): the top of the window (wheel up) or the bottom (wheel down).
local function jump(frame, delta)
  if not CX.settings.ctrlScroll then return end
  if delta > 0 then frame:ScrollToTop() else frame:ScrollToBottom() end
end

-- The wheel, after the game's own scroll (its three lines; it reads no modifiers): Ctrl then jumps
-- to the end, and any other tick gets the lines that make it CX.WHEEL_LINES in all.
local function wheel(frame, delta)
  if IsControlKeyDown() then return jump(frame, delta) end
  local step = delta > 0 and frame.ScrollUp or frame.ScrollDown
  for _ = CX.GAME_WHEEL_LINES + 1, CX.WHEEL_LINES do step(frame) end
end

-- Follows a chat window's new lines and wheel, once per window.
local function watchWindow(frame)
  if type(frame) ~= "table" or vgWatched[frame] then return end
  vgWatched[frame] = true
  if type(frame.TransformMessages) == "function" and type(hooksecurefunc) == "function" then hooksecurefunc(frame, "AddMessage", ns.Guard("hook AddMessage", rewriteAdded)) end
  frame:HookScript("OnMouseWheel", wheel)
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
  watchLinks()
  CX.ApplyCopy()
  CX.WatchWindows()
  if type(hooksecurefunc) == "function" and type(FCF_OpenTemporaryWindow) == "function" then hooksecurefunc("FCF_OpenTemporaryWindow", ns.Guard("hook FCF_OpenTemporaryWindow", CX.WatchWindows)) end
end
