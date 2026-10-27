-- Chat watch: phrases you watch for ("lfm", "wts devilsaur") in the channels
-- you tick. A line says one when it holds all its words, in any order. Then the
-- whisper sound plays and a small toast shows the sender and the line, its
-- watched words marked, at the top of the screen for a few seconds (in a fight,
-- once the fight ends: the newest alert only);
-- click it to whisper the sender, right-click to put it away. When the line
-- links an item the auction house has a price for (Modules/AuctionPrices.lua,
-- this realm and faction), the toast shows it beside the line: "AH 12s 50c".
-- Other modules put their own alerts on the same toast with CW.Notify.
-- Chat is read through ns.On only, never a chat message filter, so no line
-- is changed or hidden. In dungeons, raids and other places where the game
-- hides chat from addons (its text and sender come secret), a line is
-- skipped before anything reads it, so nothing matches and nothing errors.

local ADDON, ns = ...
local L = ns.L

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
CW.LINGER, CW.REPEAT, CW.SOUND_GAP, CW.MAX_LINES, CW.MAX_RECENT = 8, 30, 2, 200, 100
-- The toast's size; how many characters of a long line it keeps before the first watched word.
CW.WIDTH, CW.HEIGHT, CW.LEAD = 300, 44, 24
-- Chat events -> the channel switch that watches them (ChatInfoDocumentation.lua).
CW.EVENTS = {
  CHAT_MSG_CHANNEL = "channel", CHAT_MSG_SAY = "say", CHAT_MSG_YELL = "yell", CHAT_MSG_GUILD = "guild",
  CHAT_MSG_PARTY = "party", CHAT_MSG_PARTY_LEADER = "party", CHAT_MSG_RAID = "raid", CHAT_MSG_RAID_LEADER = "raid",
  CHAT_MSG_WHISPER = "whisper",
}
-- This session's alerts: sender .. "\1" .. phrase -> when it rang; the line IDs seen, and how many.
CW.recent, CW.recentCount, CW.lines, CW.lineCount = {}, 0, {}, 0

-- Matching ------------------------------------------------------------------------------------

-- A phrase's words, in order.
function CW.Words(phrase)
  local words = {}
  for word in phrase:gmatch("%S+") do words[#words + 1] = word end
  return words
end

-- A word as a pattern: its magic characters escaped, and one that starts with a letter or digit held to a
-- word's start ("lfm" doesn't find "alfm").
local function wordPattern(word)
  local escaped = ns.GetModule("ChatExtras").Escape(word)
  return word:find("^%w") and "%f[%w]" .. escaped or escaped
end

-- Each phrase's word patterns, made once per phrase (never per line; forgotten when the list changes).
local patternsOf = setmetatable({}, { __index = function(cache, phrase)
  local patterns = {}
  for i, word in ipairs(CW.Words(phrase)) do patterns[i] = wordPattern(word) end
  cache[phrase] = patterns
  return patterns
end })

-- True when the plain line holds every one of the phrase's words, in any order.
local function holds(line, phrase)
  for _, pattern in ipairs(patternsOf[phrase]) do
    if not line:find(pattern) then return false end
  end
  return true
end

-- The first watched phrase the line holds (all its words, in any order, case-insensitive, as plain
-- text), or nil. With no phrases there is nothing to look for, so the line is not even made plain.
function CW.Match(text)
  if #CW.settings.phrases == 0 then return nil end
  local line = ns.GetModule("ChatExtras").Matchable(text)
  for _, phrase in ipairs(CW.settings.phrases) do
    if holds(line, phrase) then return phrase end
  end
end

-- Forgets the alerts older than CW.REPEAT seconds (they would ring again anyway), once CW.MAX_RECENT are held.
local function sweepRecent(now)
  if CW.recentCount < CW.MAX_RECENT then return end
  CW.recentCount = 0
  for key, at in pairs(CW.recent) do
    if now - at >= CW.REPEAT then CW.recent[key] = nil else CW.recentCount = CW.recentCount + 1 end
  end
end

-- True (and noted) unless this sender rang for this phrase in the last CW.REPEAT seconds.
local function fresh(sender, phrase, now)
  local key = sender .. "\1" .. phrase
  if CW.recent[key] and now - CW.recent[key] < CW.REPEAT then return false end
  sweepRecent(now)
  if not CW.recent[key] then CW.recentCount = CW.recentCount + 1 end
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

-- A chat event (ns.On): text and sender, then the payload, whose ninth value
-- after them is the line ID. A secret (or missing) text or sender is skipped
-- before any string is read; a channel you don't watch is skipped too.
function CW.OnChat(event, text, sender, ...)
  local key = CW.EVENTS[event]
  if not (key and CW.settings.channels[key]) or ns.Restricted("Chat") then return end
  if ns.IsSecret(text) or ns.IsSecret(sender) or type(text) ~= "string" or type(sender) ~= "string" then return end
  if seenLine(ns.PlainNumber((select(9, ...)))) or ns.Home.IsMe(sender) then return end
  local phrase = CW.Match(text)
  if phrase then CW.Alert(sender, text, phrase) end
end

-- The alert sound, at most every CW.SOUND_GAP seconds (a phrase's and other modules' alerts alike).
local function ring()
  local now = GetTime()
  if now - (CW.lastSound or -CW.SOUND_GAP) < CW.SOUND_GAP then return end
  CW.lastSound = now
  T.Sound("alert")
end

-- The alert sound and the toast for a phrase, as switched on, unless this sender rang for it lately (noted
-- when it shows, so an alert a fight's newer one replaced never mutes its sender).
local function alertNow(sender, text, phrase)
  if not fresh(sender, phrase, GetTime()) then return end
  if CW.settings.sound then ring() end
  if CW.settings.toast then CW.ShowToast(sender, text, phrase) end
end

-- A phrase was said: the alert sound and the toast; in a fight both wait until it ends, and a later alert
-- replaces one waiting (the chat line itself is never held).
function CW.Alert(sender, text, phrase)
  ns.OutOfCombat(function() alertNow(sender, text, phrase) end, "chatwatch toast")
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
    if p then return ns.Format(L["AH {price}"], { price = ns.AuctionPrices.Money(p.min) }) end
  end
end

-- The line's right edge: just before the price when there is one, else the toast's edge.
local function fitLine(f, price)
  f.price:SetText(price or "")
  if price then f.line:SetPoint("RIGHT", f.price, "LEFT", -6, 0) else f.line:SetPoint("RIGHT", -8, 0) end
end

-- Shows the toast with its title, line and price (or none); it goes after CW.LINGER seconds.
local function present(f, title, line, price)
  f.sender:SetText(title)
  f.line:SetText(line)
  fitLine(f, price)
  T.FadeIn(f)
  ns.AutoHide(f, CW.LINGER)
end

-- Where a long line starts on the toast: after the space CW.LEAD characters or so before the first
-- match of the word patterns, so it shows (at the match itself when no space is there); 1 when it is
-- near the start or nothing is found.
local function leadStart(lower, patterns)
  local first = #lower + 1
  for _, pattern in ipairs(patterns) do first = math.min(first, lower:find(pattern) or first) end
  if first <= CW.LEAD or first > #lower then return 1 end
  local space = lower:find(" ", first - CW.LEAD, true)
  return space and space < first and space + 1 or first
end

-- The toast's line: plain, the phrase's words marked in the accent's text colour, and a long line
-- starting at "…" a few words before the first of them.
function CW.ToastLine(text, phrase)
  local CX, patterns = ns.GetModule("ChatExtras"), patternsOf[phrase]
  local line = CX.Plain(text)
  local start = leadStart(line:lower(), patterns)
  return (start > 1 and "\226\128\166" or "") .. CX.Marked(line:sub(start), patterns)
end

-- Shows the toast for a line: the sender in the accent, the line under it (CW.ToastLine) with an
-- item's auction price beside it.
function CW.ShowToast(sender, text, phrase)
  local f = CW.toast
  f.vgSender, f.vgClick = sender, nil
  present(f, ns.Home.Display(sender), CW.ToastLine(text, phrase), CW.PriceText(text))
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
  ns.Mover(f, "chatwatch", L["Chat alert"], { "TOP", "TOP", 0, -216 })
end

-- Rings and shows another module's alert on the toast.
local function notifyNow(title, text, price, onClick)
  ring()
  CW.toast.vgSender, CW.toast.vgClick = nil, onClick
  present(CW.toast, title, text, price)
end

-- Another module's alert (Auction helper's price alerts) with the alert sound, on the same toast,
-- built here when Chat watch is off: a title in the sender's place, a line with a price beside it
-- (or none), and onClick, what a left click does (right-click puts it away). As a phrase's alert, it
-- waits out a fight, and the newest waiting alert of either kind wins.
function CW.Notify(title, text, price, onClick)
  if not CW.toast then buildToast() end
  ns.OutOfCombat(function() notifyNow(title, text, price, onClick) end, "chatwatch toast")
end

-- Phrases ----------------------------------------------------------------------------------------

-- The watched phrases in this profile (also while the module is off, for the options).
local function phrases()
  return ns.Settings("ChatWatch", CW.defaults).phrases
end

-- The options page lists a Remove button per phrase: built again after a change; the patterns made for
-- the old list are forgotten.
local function phrasesChanged()
  for phrase in pairs(patternsOf) do patternsOf[phrase] = nil end
  ns.Options.RebuildPage("chat")
end

-- Why a phrase can't be added, or nil when it can.
local function refusal(phrase, list)
  if phrase == "" then return L["Type a phrase to watch for."] end
  if phrase:find("|", 1, true) then return L["A phrase can't hold the | character."] end
  if ns.TextLength(phrase) > CW.MAX_LENGTH then return ns.Format(L["A phrase can be at most {max} characters."], { max = CW.MAX_LENGTH }) end
  if #list >= CW.MAX_PHRASES then return ns.Format(L["Chat watch keeps at most {max} phrases; remove one first."], { max = CW.MAX_PHRASES }) end
  for _, p in ipairs(list) do
    if p == phrase then return ns.Format(L['Already watching for "{phrase}".'], { phrase = phrase }) end
  end
end

-- Adds a phrase to watch for (trimmed, lower-cased); says in chat what happened. True when added.
function CW.Add(text)
  local phrase, list = (type(text) == "string" and text or ""):match("^%s*(.-)%s*$"):lower(), phrases()
  local why = refusal(phrase, list)
  if why then ns.Chat(why) return false end
  list[#list + 1] = phrase
  ns.Chat(ns.Format(L['Watching chat for "{phrase}".'], { phrase = phrase }))
  phrasesChanged()
  return true
end

-- Stops watching for a phrase (any case); says in chat what happened.
function CW.Remove(text)
  local phrase = (type(text) == "string" and text or ""):match("^%s*(.-)%s*$"):lower()
  if not ns.GetModule("ChatExtras").RemoveValue(phrases(), phrase) then return ns.Chat(ns.Format(L['Not watching for "{phrase}".'], { phrase = phrase })) end
  phrasesChanged()
  ns.Chat(ns.Format(L['No longer watching for "{phrase}".'], { phrase = phrase }))
end

-- The options' Add a phrase dialog: adds what was typed, and closes once it's added.
function CW.AddFromDialog(text)
  if CW.Add(text) then ns.HideText() end
end

-- Prints the watched phrases.
local function list()
  local all = phrases()
  if #all == 0 then return ns.Chat(L["Chat watch has no phrases. /vg watch add <phrase> adds one."]) end
  ns.Chat(ns.Format(L["Watching chat for: {phrases}"], { phrases = table.concat(all, ", ") }))
end

-- /vg watch [add <phrase> | remove <phrase> | list | clear].
function CW.Command(rest)
  local verb, arg = (rest or ""):match("^(%S*)%s*(.-)$")
  if verb == "add" then return CW.Add(arg) end
  if verb == "remove" then return CW.Remove(arg) end
  if verb == "clear" then ns.Settings("ChatWatch", CW.defaults).phrases = {} phrasesChanged() return ns.Chat(L["Chat watch has no phrases now."]) end
  if verb == "" or verb == "list" then return list() end
  ns.Chat(L["Usage: /vg watch [add <phrase> | remove <phrase> | list | clear]"])
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
