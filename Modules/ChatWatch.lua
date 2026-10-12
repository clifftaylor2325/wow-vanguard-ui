-- Chat watch: phrases you watch for ("lfm", "wts devilsaur") in the channels
-- you tick. When a line says one, the whisper sound plays and a small toast
-- shows the sender and the line at the top of the screen for a few seconds;
-- click it to whisper the sender, right-click to put it away. When the line
-- links an item the auction house has a price for (Modules/AuctionPrices.lua,
-- this realm and faction), the toast shows it beside the line: "AH 12s 50c".
-- Other modules put their own alerts on the same toast with CW.Notify.
-- Chat is read through ns.On only, never a chat message filter, so no line
-- is changed or hidden. In dungeons, raids and other places where the game
-- hides chat from addons (its text and sender come secret), a line is
-- skipped before anything reads it, so nothing matches and nothing errors.

local ADDON, ns = ...

local T = ns.Theme

local CW = ns.Module("ChatWatch", {
  defaults = {
    phrases = {}, sound = true, toast = true, prices = true,
    channels = { channel = true, say = false, yell = true, guild = false, party = false, raid = false, whisper = false },
  },
})

-- At most this many phrases, each at most this many characters.
CW.MAX_PHRASES, CW.MAX_LENGTH = 20, 40
-- How long the toast stays (seconds); how long one sender's phrase stays quiet
-- after it rang; the least gap between two sounds; how many line IDs are kept.
CW.LINGER, CW.REPEAT, CW.SOUND_GAP, CW.MAX_LINES = 8, 30, 2, 200
-- The toast's size.
CW.WIDTH, CW.HEIGHT = 300, 44
-- Chat events -> the channel switch that watches them (ChatInfoDocumentation.lua).
CW.EVENTS = {
  CHAT_MSG_CHANNEL = "channel", CHAT_MSG_SAY = "say", CHAT_MSG_YELL = "yell", CHAT_MSG_GUILD = "guild",
  CHAT_MSG_PARTY = "party", CHAT_MSG_PARTY_LEADER = "party", CHAT_MSG_RAID = "raid", CHAT_MSG_RAID_LEADER = "raid",
  CHAT_MSG_WHISPER = "whisper",
}
-- This session's alerts: sender .. "\1" .. phrase -> when it rang; the line IDs seen, and how many.
CW.recent, CW.lines, CW.lineCount = {}, {}, 0

-- Matching ------------------------------------------------------------------------------------

-- A line as plain lower-case text: colour and link codes and brackets gone,
-- so "wts devilsaur" finds "WTS [Devilsaur Leggings]" sent as an item link.
local function plain(text)
  local s = text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|H.-|h", ""):gsub("|[hr]", ""):gsub("[%[%]]", "")
  return s:lower()
end

-- The first watched phrase the line holds (case-insensitive, as plain text), or nil.
function CW.Match(text)
  local line = plain(text)
  for _, phrase in ipairs(CW.settings.phrases) do
    if line:find(phrase, 1, true) then return phrase end
  end
end

-- True (and noted) unless this sender rang for this phrase in the last CW.REPEAT seconds.
local function fresh(sender, phrase, now)
  local key = sender .. "\1" .. phrase
  if CW.recent[key] and now - CW.recent[key] < CW.REPEAT then return false end
  CW.recent[key] = now
  return true
end

-- True for a line ID already seen (noted otherwise; the list starts over past CW.MAX_LINES).
local function seenLine(id)
  if not id then return false end
  if CW.lines[id] then return true end
  if CW.lineCount >= CW.MAX_LINES then CW.lines, CW.lineCount = {}, 0 end
  CW.lines[id], CW.lineCount = true, CW.lineCount + 1
  return false
end

-- True for your own line: only when your name and the sender's are both plain.
local function own(sender)
  local me = UnitName("player")
  if ns.IsSecret(me) or type(me) ~= "string" then return false end
  return sender == me or sender:match("^[^%-]+") == me
end

-- A chat event (ns.On): text and sender, then the payload, whose ninth value
-- after them is the line ID. A secret (or missing) text or sender is skipped
-- before any string is read; a channel you don't watch is skipped too.
function CW.OnChat(event, text, sender, ...)
  local key = CW.EVENTS[event]
  if not (key and CW.settings.channels[key]) then return end
  if ns.IsSecret(text) or ns.IsSecret(sender) or type(text) ~= "string" or type(sender) ~= "string" then return end
  if seenLine(ns.PlainNumber((select(9, ...)))) or own(sender) then return end
  local phrase = CW.Match(text)
  if phrase and fresh(sender, phrase, GetTime()) then CW.Alert(sender, text, phrase) end
end

-- The alert sound, at most every CW.SOUND_GAP seconds (a phrase's and other modules' alerts alike).
local function ring()
  local now = GetTime()
  if now - (CW.lastSound or -CW.SOUND_GAP) < CW.SOUND_GAP then return end
  CW.lastSound = now
  T.Sound("alert")
end

-- A phrase was said: the alert sound and the toast, as switched on.
function CW.Alert(sender, text, phrase)
  if CW.settings.sound then ring() end
  if CW.settings.toast then CW.ShowToast(sender, text, phrase) end
end

-- The toast --------------------------------------------------------------------------------------

-- Opens a whisper to name in the chat box (the game's own, from a click only).
function CW.Whisper(name)
  local util = type(ChatFrameUtil) == "table" and ChatFrameUtil.SendTell
  local tell = type(util) == "function" and util or ChatFrame_SendTell
  if type(tell) == "function" and type(name) == "string" then tell(name) end
end

-- "AH 12s 50c": the auction price (the cheapest unit price last seen on this realm and faction) of
-- the first item the line links that has one, or nil: prices switched off, a hidden line, no priced
-- item. Only the links' item IDs are read; the line itself is never changed.
function CW.PriceText(text)
  if not CW.settings.prices or ns.IsSecret(text) or type(text) ~= "string" then return nil end
  local prices = ns.AuctionPrices.House().prices
  for id in text:gmatch("|Hitem:(%d+)") do
    local p = prices[tonumber(id)]
    if p then return "AH " .. ns.AuctionPrices.Money(p.min) end
  end
end

-- The line's right edge: just before the price when there is one, else the toast's edge.
local function fitLine(f, price)
  f.price:SetText(price or "")
  if price then f.line:SetPoint("RIGHT", f.price, "LEFT", -6, 0) else f.line:SetPoint("RIGHT", -8, 0) end
end

-- Shows the toast for a line: the sender in the accent, the line under it with an item's auction
-- price beside it; it goes after CW.LINGER seconds.
function CW.ShowToast(sender, text)
  local f = CW.toast
  f.vgSender, f.vgClick = sender, nil
  f.sender:SetText(sender)
  f.line:SetText(text)
  fitLine(f, CW.PriceText(text))
  T.FadeIn(f)
  ns.AutoHide(f, CW.LINGER)
end

-- Puts the toast away.
function CW.HideToast()
  T.FadeOut(CW.toast)
end

-- A click on the toast: left whispers the sender (or, on another module's alert, does what it
-- asked for), right just dismisses it.
function CW.OnToastClick(f, button)
  if button ~= "RightButton" then (f.vgClick or CW.Whisper)(f.vgSender) end
  CW.HideToast()
end

-- The toast's two lines: the sender, and the line cut to one row.
local function toastText(f)
  f.sender = T.Text(f:CreateFontString(nil, "OVERLAY"), "name", "accentText")
  f.sender:SetPoint("TOPLEFT", 8, -7)
  f.sender:SetPoint("RIGHT", -8, 0)
  f.sender:SetJustifyH("LEFT")
  f.line = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "text")
  f.line:SetPoint("TOPLEFT", f.sender, "BOTTOMLEFT", 0, -4)
  f.line:SetPoint("RIGHT", -8, 0)
  f.line:SetJustifyH("LEFT")
  f.line:SetWordWrap(false)
end

-- The price beside the line, at the toast's right edge (anchored under the sender, as the line is,
-- so the line can end at the price's left).
local function toastPrice(f)
  f.price = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "gold")
  f.price:SetPoint("TOPRIGHT", f.sender, "BOTTOMRIGHT", 0, -4)
end

-- The toast: an accent-edged panel you can move (/vg unlock), hidden until a phrase is said.
local function buildToast()
  local f = CreateFrame("Button", "Vanguard_ChatWatchToast", UIParent)
  T.Panel(f, { accent = true, shadow = true })
  f:SetSize(CW.WIDTH, CW.HEIGHT)
  f:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  f:SetScript("OnClick", ns.Guard("click chat watch toast", CW.OnToastClick))
  toastText(f)
  toastPrice(f)
  f:Hide()
  CW.toast = f
  ns.Mover(f, "chatwatch", "Chat alert", { "TOP", "TOP", 0, -160 })
end

-- Another module's alert (Auction helper's price alerts) with the alert sound, on the same toast,
-- built here when Chat watch is off: a title in the sender's place, a line with a price beside it
-- (or none), and onClick, what a left click does (right-click puts it away). It goes after CW.LINGER seconds.
function CW.Notify(title, text, price, onClick)
  if not CW.toast then buildToast() end
  local f = CW.toast
  ring()
  f.vgSender, f.vgClick = nil, onClick
  f.sender:SetText(title)
  f.line:SetText(text)
  fitLine(f, price)
  T.FadeIn(f)
  ns.AutoHide(f, CW.LINGER)
end

-- Phrases ----------------------------------------------------------------------------------------

-- The watched phrases in this profile (also while the module is off, for the options).
local function phrases()
  return ns.Settings("ChatWatch", CW.defaults).phrases
end

-- The options page lists a Remove button per phrase: built again after a change.
local function phrasesChanged()
  ns.Options.RebuildPage("more")
end

-- Why a phrase can't be added, or nil when it can.
local function refusal(phrase, list)
  if phrase == "" then return "Type a phrase to watch for." end
  if #phrase > CW.MAX_LENGTH then return string.format("A phrase can be at most %d characters.", CW.MAX_LENGTH) end
  if #list >= CW.MAX_PHRASES then return string.format("Chat watch keeps at most %d phrases; remove one first.", CW.MAX_PHRASES) end
  for _, p in ipairs(list) do
    if p == phrase then return string.format('Already watching for "%s".', phrase) end
  end
end

-- Adds a phrase to watch for (trimmed, lower-cased); says in chat what happened. True when added.
function CW.Add(text)
  local phrase, list = (type(text) == "string" and text or ""):match("^%s*(.-)%s*$"):lower(), phrases()
  local why = refusal(phrase, list)
  if why then ns.Chat(why) return false end
  list[#list + 1] = phrase
  ns.Chat(string.format('Watching chat for "%s".', phrase))
  phrasesChanged()
  return true
end

-- Stops watching for a phrase (any case); says in chat what happened.
function CW.Remove(text)
  local phrase, list = (type(text) == "string" and text or ""):match("^%s*(.-)%s*$"):lower(), phrases()
  for i, p in ipairs(list) do
    if p == phrase then
      table.remove(list, i)
      phrasesChanged()
      return ns.Chat(string.format('No longer watching for "%s".', phrase))
    end
  end
  ns.Chat(string.format('Not watching for "%s".', phrase))
end

-- The options' Add a phrase dialog: adds what was typed, and closes once it's added.
function CW.AddFromDialog(text)
  if CW.Add(text) then ns.HideText() end
end

-- Prints the watched phrases.
local function list()
  local all = phrases()
  if #all == 0 then return ns.Chat("Chat watch has no phrases. /vg watch add <phrase> adds one.") end
  ns.Chat("Watching chat for: " .. table.concat(all, ", "))
end

-- /vg watch [add <phrase> | remove <phrase> | list | clear].
function CW.Command(rest)
  local verb, arg = (rest or ""):match("^(%S*)%s*(.-)$")
  if verb == "add" then return CW.Add(arg) end
  if verb == "remove" then return CW.Remove(arg) end
  if verb == "clear" then ns.Settings("ChatWatch", CW.defaults).phrases = {} phrasesChanged() return ns.Chat("Chat watch has no phrases now.") end
  if verb == "" or verb == "list" then return list() end
  ns.Chat("Usage: /vg watch [add <phrase> | remove <phrase> | list | clear]")
end

-- get/set (and the default) for one channel switch; more keys follow the first (Party and raid).
function CW.ChannelSetting(key, ...)
  local also = { key, ... }
  return function() return ns.Settings("ChatWatch", CW.defaults).channels[key] end,
    function(v) for _, k in ipairs(also) do ns.Settings("ChatWatch", CW.defaults).channels[k] = v end end,
    CW.defaults.channels[key]
end

-- Module entry point (Core/Modules.lua).
function CW.Enable(settings)
  CW.settings = settings
  buildToast()
  for event in pairs(CW.EVENTS) do ns.On(event, CW.OnChat) end
end
