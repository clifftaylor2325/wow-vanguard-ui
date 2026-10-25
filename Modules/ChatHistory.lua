-- Chat history: the lines in your chat windows come back after a /reload or
-- the next login, each in its own tab, in the colour it was. Off until you
-- switch it on. Each window keeps at most 100, 200 or 500 lines and drops
-- lines older than 1 day, 3 days, a week or a month, whichever comes first;
-- they are saved for this character only, never in a profile or its export.
-- Whispers are not kept unless you ask for them. Chat text the game hides
-- from addons (in instances) is never read, so those lines are not kept.

local ADDON, ns = ...

local T = ns.Theme

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgHistory = ns.FrameState("vgHistory")

local CHH = ns.Module("ChatHistory", {
  defaults = { on = false, lines = 200, days = 3, whispers = false },
})

-- Choices for the options: lines kept per window, and how many days they are kept.
CHH.LINE_CHOICES = { { 100, "100 lines" }, { 200, "200 lines" }, { 500, "500 lines" } }
CHH.DAY_CHOICES = { { 1, "1 day" }, { 3, "3 days" }, { 7, "A week" }, { 30, "A month" } }
-- A longer line is not kept; a window is trimmed once it is this many over its limit.
CHH.MAX_LENGTH, CHH.SLACK = 600, 50
-- Seconds in a day (the days setting counts in these).
CHH.DAY = 86400
-- The chat events that carry a whisper.
CHH.WHISPERS = { "CHAT_MSG_WHISPER", "CHAT_MSG_WHISPER_INFORM", "CHAT_MSG_BN_WHISPER", "CHAT_MSG_BN_WHISPER_INFORM" }

-- Saved lines ---------------------------------------------------------------------------------

-- The saved lines of every window (this character's file, window number -> lines), made on first use.
function CHH.Store()
  if type(VanguardCharDB) ~= "table" then return {} end
  if type(VanguardCharDB.chatHistory) ~= "table" then VanguardCharDB.chatHistory = {} end
  return VanguardCharDB.chatHistory
end

-- The lines saved for one window, made on first use.
local function listFor(index)
  local store = CHH.Store()
  if type(store[index]) ~= "table" then store[index] = {} end
  return store[index]
end

-- Now in seconds (0 on a client without the clock call).
local function now()
  return type(time) == "function" and ns.PlainNumber(time()) or 0
end

-- A colour part (0 to 1, plain or not) as 0 to 255.
local function hex(v)
  return math.floor(math.max(0, math.min(1, ns.PlainNumber(v) or 1)) * 255 + 0.5)
end

-- One line as it is saved: when, its colour and its text, "1760000000|ffd100|text".
local function pack(text, r, g, b)
  return string.format("%d|%02x%02x%02x|%s", now(), hex(r), hex(g), hex(b), text)
end

-- A saved line's time, colour (r, g, b) and text, or nil for anything that isn't one.
function CHH.Unpack(line)
  local at, hexText, text = (type(line) == "string" and line or ""):match("^(%d+)|(%x%x%x%x%x%x)|(.*)$")
  if not at then return nil end
  -- The colour part starting at character i of the hex text, 0 to 1.
  local function part(i) return tonumber(hexText:sub(i, i + 1), 16) / 255 end
  return tonumber(at), part(1), part(3), part(5), text
end

-- The newest `cap` lines that are not older than `cutoff`, as a new list.
local function kept(list, cutoff, cap)
  local out = {}
  for i = math.max(1, #list - cap + 1), #list do
    local at = CHH.Unpack(list[i])
    if at and at >= cutoff then out[#out + 1] = list[i] end
  end
  return out
end

-- A window's lines to keep: the newest, and none older than the days setting.
local function trimmed(list)
  return kept(list, now() - CHH.settings.days * CHH.DAY, CHH.settings.lines)
end

-- Drops the old and the surplus lines of every window (and a window left empty).
function CHH.Prune()
  local store = CHH.Store()
  for index, list in pairs(store) do
    store[index] = type(list) == "table" and trimmed(list) or nil
    if store[index] and #store[index] == 0 then store[index] = nil end
  end
end

-- Recording -----------------------------------------------------------------------------------

-- True when the text holds a whisper's sender link (the game's player links carry the chat type).
local function whisperLine(text)
  return text:find(":WHISPER:", 1, true) ~= nil or text:find(":BN_WHISPER:", 1, true) ~= nil
end

-- Whether this line is a whisper: the game just asked for one to be shown (this frame), or it carries a whisper link.
local function isWhisper(text)
  if CHH.whisperAt == GetTime() then CHH.whisperAt = nil return true end
  return whisperLine(text)
end

-- Whether a window is left out: the combat log, and the chat filter's Filtered tab (it holds spam, and its window can move).
function CHH.Skipped(index)
  local frame, CF = _G["ChatFrame" .. index], ns.GetModule("ChatFilter")
  if frame ~= nil and frame == _G.COMBATLOG then return true end
  return type(GetChatWindowInfo) == "function" and GetChatWindowInfo(index) == CF.TAB
end

-- Whether a line may be saved: plain text of a sane length, and a whisper only when asked for.
local function keepable(text)
  if ns.IsSecret(text) or type(text) ~= "string" or text == "" or #text > CHH.MAX_LENGTH then return false end
  return CHH.settings.whispers or not isWhisper(text)
end

-- Saves a line a window just showed (nothing while history is off or while old lines are being put back).
function CHH.Record(index, text, r, g, b)
  if not (CHH.active and CHH.settings.on) or CHH.restoring or CHH.Skipped(index) or not keepable(text) then return end
  local list = listFor(index)
  list[#list + 1] = pack(text, r, g, b)
  if #list > CHH.settings.lines + CHH.SLACK then CHH.Store()[index] = trimmed(list) end
end

-- The game is about to show a whisper: lines shown in this same frame are not kept.
function CHH.NoteWhisper()
  CHH.whisperAt = GetTime()
  return false
end

-- Follows one chat window's new lines, once.
local function watchWindow(index)
  local frame = _G["ChatFrame" .. index]
  if type(frame) ~= "table" or vgHistory[frame] or type(hooksecurefunc) ~= "function" then return end
  vgHistory[frame] = true
  hooksecurefunc(frame, "AddMessage", ns.Guard("hook AddMessage history", function(_, text, r, g, b) CHH.Record(index, text, r, g, b) end))
end

-- Follows every permanent chat window and the game's whisper events.
function CHH.Watch()
  for i = 1, NUM_CHAT_WINDOWS or 10 do watchWindow(i) end
  if CHH.watching then return end
  CHH.watching = true
  local guarded = ns.GuardResult("chat history whisper", CHH.NoteWhisper, false)
  ns.AddChatFilters(CHH.WHISPERS, guarded)
end

-- Restoring -----------------------------------------------------------------------------------

-- A saved time as the weekday and the clock ("Mon 14:32"), or "then" on a client without the call.
local function when(at)
  return type(date) == "function" and date("%a %H:%M", at) or "then"
end

-- A run of em dashes (U+2014, in the addon's font): the rule that brackets the earlier chat, since
-- no texture can go in a chat window.
CHH.RULE = string.rep("\226\128\148", 8)

-- A bracket line: its words between two rules, in the muted colour, so it reads as a divider.
local function rule(text)
  return T.Paint(CHH.RULE .. " " .. text .. " " .. CHH.RULE, "muted")
end

-- Puts one window's saved lines back, between a rule that says when they are from and a closing rule.
local function restoreWindow(index, list)
  local frame = _G["ChatFrame" .. index]
  if type(frame) ~= "table" or type(frame.AddMessage) ~= "function" or #list == 0 or CHH.Skipped(index) then return end
  local newest = CHH.Unpack(list[#list])
  frame:AddMessage(rule(string.format("Chat from your last session (%d lines, until %s)", #list, when(newest))))
  for _, line in ipairs(list) do
    local _, r, g, b, text = CHH.Unpack(line)
    frame:AddMessage(text, r, g, b)
  end
  frame:AddMessage(rule("End of the earlier chat"))
end

-- Puts every window's saved lines back (old ones are dropped first).
function CHH.Restore()
  CHH.Prune()
  CHH.restoring = true
  ns.Try("restore chat history", function()
    for index, list in pairs(CHH.Store()) do restoreWindow(index, list) end
  end)
  CHH.restoring = false
end

-- Commands ------------------------------------------------------------------------------------

-- How many lines are saved, in how many windows.
function CHH.Counts()
  local lines, windows = 0, 0
  for _, list in pairs(CHH.Store()) do
    lines, windows = lines + #list, windows + 1
  end
  return lines, windows
end

-- Forgets every saved line; says so (the answer Yes to CHH.AskClear).
function CHH.Clear()
  if type(VanguardCharDB) == "table" then VanguardCharDB.chatHistory = {} end
  ns.Chat("Saved chat history cleared.")
end

-- /vg history clear and Clear saved chat: asks first (a "danger" question: it can't be undone), then forgets it all.
function CHH.AskClear()
  local question = string.format("Forget the %d saved chat lines in %d windows? This can't be undone.", CHH.Counts())
  ns.Ask(question, "Clear", CHH.Clear, nil, "danger")
end

-- Prints whether history is on, its limits, whether whispers are kept and what is saved.
local function status()
  local s, lines, windows = ns.Settings("ChatHistory", CHH.defaults), CHH.Counts()
  ns.Chat(string.format("Chat history is %s: up to %d lines per window for %d days; whispers %s.", s.on and "on" or "off", s.lines, s.days, s.whispers and "are kept" or "are not kept"))
  ns.Chat(string.format("%d lines saved in %d windows.", lines, windows))
end

-- /vg history [on | off | whispers | nowhispers | clear].
function CHH.Command(rest)
  local verb, s = (rest or ""):match("^(%S*)"), ns.Settings("ChatHistory", CHH.defaults)
  if verb == "on" or verb == "off" then s.on = verb == "on" return ns.Chat(s.on and "Chat history on. Your chat comes back after a reload or the next login." or "Chat history off. What is saved stays until it ages out or you clear it.") end
  if verb == "whispers" or verb == "nowhispers" then s.whispers = verb == "whispers" return ns.Chat(s.whispers and "Whispers are kept too." or "Whispers are not kept.") end
  if verb == "clear" then return CHH.AskClear() end
  if verb == "" then return status() end
  ns.Chat("Usage: /vg history [on | off | whispers | nowhispers | clear]")
end

-- Logout: the old and surplus lines go before the file is written.
function CHH.Logout()
  if CHH.settings then CHH.Prune() end
end
ns.On("PLAYER_LOGOUT", CHH.Logout)

-- Module switched off: nothing more is saved.
function CHH.Disable()
  CHH.active = false
end

-- Module entry point (Core/Modules.lua).
function CHH.Enable(settings)
  CHH.settings, CHH.active = settings, true
  CHH.Watch()
  ns.On("PLAYER_ENTERING_WORLD", CHH.Arrived)
end

-- The first time the world is entered (the game has set its chat windows up by then): the saved lines come back.
function CHH.Arrived()
  if CHH.arrived then return end
  CHH.arrived = true
  if CHH.settings.on then CHH.Restore() end
end
