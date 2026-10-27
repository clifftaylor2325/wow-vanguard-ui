-- Chat filter: spam you don't want to read in Trade, General and the other
-- numbered channels, say and yell. Lines that sell gold, sell boosts or
-- recruit for a guild, lines holding a word of your own, and a line the same
-- sender repeats within a minute, go to a chat tab called Filtered (or are
-- hidden, if you like); the tab shows how many it caught. Click a sender's
-- name in that tab and their lines show in the normal chat again until you
-- log out. Off until you switch it on. Whispers, guild, party and raid are
-- never filtered, nor are your own lines. Chat text the game hides from addons
-- (in instances) is never read: those lines pass through as they are.

local ADDON, ns = ...
local L = ns.L

local CF = ns.Module("ChatFilter", {
  defaults = { on = false, mode = "tab", gold = true, boosting = true, recruiting = true, repeats = true, keywords = {} },
})

-- At most this many keywords, each at most this many characters.
CF.MAX_KEYWORDS, CF.MAX_LENGTH = 30, 40
-- How long (seconds) an exact repeat from one sender is filtered, how many lines are remembered,
-- and the least length of a line (as plain text) that counts as a repeat ("inv", "+1" never do).
CF.REPEAT, CF.MAX_RECENT, CF.MIN_REPEAT = 60, 200, 12
-- The tab's name in the game's chat settings. It stays English: the tab is found again by this name,
-- so a translation would leave a player's existing tab behind and make a second one.
CF.TAB = "Filtered"
-- The chat events that are filtered.
CF.EVENTS = { "CHAT_MSG_CHANNEL", "CHAT_MSG_SAY", "CHAT_MSG_YELL" }
-- The link prefix of a sender's name in the Filtered tab (clicking it un-filters them).
local PREFIX = "addon:Vanguard:allow:"

-- A line is in a category when it holds a word from each of the category's groups.
CF.CATEGORIES = {
  { key = "gold", label = L["Gold selling"], groups = {
    { "gold", "coins" },
    { "www.", "http", ".com", ".net", "paypal", "usd", "$", "\226\130\172", "fast delivery" } } },
  { key = "boosting", label = L["Boosting"], groups = {
    { "boost", "power level", "powerlevel" },
    { "wts", "selling", "service", "cheap", "price", "discount", "gold", "usd", "$", "pm me", "whisper me" } } },
  { key = "recruiting", label = L["Recruiting"], groups = {
    { "recruiting", "looking for new members", "accepting applications", "join our guild" },
    { "guild", "raid team", "casual", "social", "community" } } },
}

-- This session's state: the senders let through, the last line judged, who said what lately, and how many
-- lines were caught, in all and by reason.
CF.allowed, CF.recent, CF.recentCount, CF.count, CF.counts = {}, {}, 0, 0, {}

-- Matching ------------------------------------------------------------------------------------

-- True when the line holds any of the words (as plain text).
local function holdsAny(line, words)
  for _, word in ipairs(words) do
    if line:find(ns.Lower(word), 1, true) then return true end
  end
  return false
end

-- True when the line holds a word from every group.
local function holdsAll(line, groups)
  for _, group in ipairs(groups) do
    if not holdsAny(line, group) then return false end
  end
  return true
end

-- The label of the first switched-on category the line is in, or nil.
function CF.Category(line)
  for _, cat in ipairs(CF.CATEGORIES) do
    if CF.settings[cat.key] and holdsAll(line, cat.groups) then return cat.label end
  end
end

-- Forgets the senders' lines older than CF.REPEAT seconds once CF.MAX_RECENT are held.
local function sweepRecent(now)
  if CF.recentCount < CF.MAX_RECENT then return end
  CF.recentCount = 0
  for key, at in pairs(CF.recent) do
    if now - at >= CF.REPEAT then CF.recent[key] = nil else CF.recentCount = CF.recentCount + 1 end
  end
  if CF.recentCount >= CF.MAX_RECENT then CF.recent, CF.recentCount = {}, 0 end
end

-- True when this sender said this line in the last CF.REPEAT seconds (noted either way).
local function repeated(sender, line, now)
  local key = sender .. "\1" .. line
  local again = CF.recent[key] ~= nil and now - CF.recent[key] < CF.REPEAT
  sweepRecent(now)
  if not CF.recent[key] then CF.recentCount = CF.recentCount + 1 end
  CF.recent[key] = now
  return again
end

-- Why a line is filtered ("Gold selling", "Your word", "Repeat"), or nil to let it through.
function CF.Reason(text, sender, now)
  local line = ns.GetModule("ChatExtras").Matchable(text)
  local why = CF.Category(line)
  if not why and holdsAny(line, CF.settings.keywords) then why = L["Your word"] end
  if not why and CF.settings.repeats and #line >= CF.MIN_REPEAT and ns.TextLength(line) >= CF.MIN_REPEAT and repeated(sender, line, now) then why = L["Repeat"] end
  return why
end

-- The Filtered tab ----------------------------------------------------------------------------

-- Whether a chat window is open: shown, docked behind another tab, or minimized. The game keeps a closed
-- window's name, so a closed Filtered tab is still found by name.
local function isOpen(frame)
  return frame:IsShown() or frame.isDocked or frame.minimized
end

-- The chat window called Filtered, an open one first, or nil.
function CF.FindWindow()
  if type(GetChatWindowInfo) ~= "function" then return nil end
  local closed
  for i = 1, NUM_CHAT_WINDOWS or 10 do
    local frame = _G["ChatFrame" .. i]
    if GetChatWindowInfo(i) == CF.TAB and frame then
      if isOpen(frame) then return frame end
      closed = closed or frame
    end
  end
  return closed
end

-- A new window called Filtered that hears no chat of its own (FCF_OpenNewWindow's second argument takes
-- every message group and channel off it), or nil on a client without the call.
local function openWindow()
  if type(FCF_OpenNewWindow) ~= "function" then return nil end
  local frame = FCF_OpenNewWindow(CF.TAB, true)
  return type(frame) == "table" and frame or nil
end

-- Finds or makes the Filtered window when the filter is on and sends to the tab; out of combat only.
-- Nothing while the module has not been enabled (switched off from login: no settings yet).
function CF.Prepare()
  local s = CF.settings
  if not (s and s.on and s.mode == "tab") or CF.window then return end
  ns.OutOfCombat(function() CF.window = CF.FindWindow() or openWindow() end, "chatfilter window")
end

-- The tab's text with the count of lines caught, "Filtered (12)", and the tab refit to it (the
-- Chat module sizes every tab to its label; a longer count would otherwise be cut).
function CF.UpdateTab()
  local frame = CF.window
  local tab = frame and _G[frame:GetName() .. "Tab"]
  if not (tab and type(tab.SetText) == "function") then return end
  tab:SetText(string.format("%s (%d)", CF.TAB, CF.count))
  local CH = ns.GetModule("Chat")
  if CH and CH.RefitTabs then CH.RefitTabs() end
end

-- A caught line's addon links made inert (a spammer's could pose as the tab's own sender links), except the
-- web addresses Chat extras linked before this filter ran, which still open the copy box.
local function inertLinks(text)
  return (text:gsub("|Haddon:", "|H"):gsub("|HVanguard:url:", "|Haddon:Vanguard:url:"))
end

-- Counts a caught line, in all and under its reason.
local function countCaught(why)
  CF.count = CF.count + 1
  CF.counts[why] = (CF.counts[why] or 0) + 1
end

-- Puts a caught line in the Filtered tab: why, the sender (a link that un-filters them), the text.
function CF.Send(why, sender, text)
  countCaught(why)
  ns.Soon("chatfilter tab", CF.UpdateTab)
  text = inertLinks(text)
  CF.window:AddMessage(string.format("(%s) |H%s%s|h[%s]|h: %s|r", why, PREFIX, sender, ns.Home.Display(sender), text))
end

-- The game's filter ---------------------------------------------------------------------------

-- Takes another open window called Filtered, or makes one, after the tab was closed or renamed; out of combat.
local function reopen()
  CF.window = nil
  ns.OutOfCombat(function()
    local found = CF.FindWindow()
    CF.window = found and isOpen(found) and found or openWindow()
  end, "chatfilter window")
end

-- Whether a caught line can go anywhere: hidden, or to a Filtered tab that is still there (a closed
-- or renamed one is let go and made again when the fight is over).
local function canCatch()
  if CF.settings.mode == "hide" then return true end
  if CF.window and (CF.FindWindow() ~= CF.window or not isOpen(CF.window)) then reopen() end
  return CF.window ~= nil
end

-- Catches a line: sent to the Filtered tab, or just counted when hidden.
local function catch(why, sender, text)
  if CF.settings.mode == "tab" then return CF.Send(why, sender, text) end
  countCaught(why)
end

-- Why a line is caught ("Gold selling", ...), or nil to let it through: a sender let through, the player's own
-- line, or a filtered tab that can't take the line let it through; otherwise CF.Reason decides.
local function verdict(text, sender)
  if CF.allowed[sender] or ns.Home.IsMe(sender) then return nil end
  if not canCatch() then return nil end
  return CF.Reason(text, sender, GetTime())
end

-- Judges one line (once per line ID, or per sender and text without one: the game asks once per chat
-- window). True to keep it out of the chat.
function CF.Judge(text, sender, lineID)
  local id = lineID or (sender .. "\1" .. text)
  if id == CF.lastID then return CF.lastVerdict end
  local why = verdict(text, sender)
  if why then catch(why, sender, text) end
  CF.lastID, CF.lastVerdict = id, why ~= nil
  return CF.lastVerdict
end

-- The chat filter (ns.AddChatFilters): true keeps the line out of the window it was asked for.
-- A hidden (or missing) text or sender passes before anything reads it.
function CF.Filter(_, _, text, sender, ...)
  if not (CF.active and CF.settings.on) or ns.Restricted("Chat") or ns.IsSecret(text) or ns.IsSecret(sender) or type(text) ~= "string" or type(sender) ~= "string" then return false end
  return CF.Judge(text, sender, ns.PlainNumber((select(9, ...)))) == true
end

-- A click on a sender's name in the Filtered tab: their lines show in the normal chat again this session.
function CF.OnLink(_, link)
  if type(link) ~= "string" or link:sub(1, #PREFIX) ~= PREFIX then return end
  local sender = link:sub(#PREFIX + 1)
  CF.allowed[sender] = true
  ns.Chat(ns.Format(L["{name}'s lines show in chat again until you log out."], { name = ns.Home.Display(sender) }))
end

-- What it caught -----------------------------------------------------------------------------

-- What the filter caught this session, for its card: "Caught this session: 12 (Gold selling 5, Repeat 7)", the
-- reasons in a fixed order (the categories, your words, repeats).
function CF.CaughtText()
  if CF.count == 0 then return L["Nothing caught this session."] end
  local parts = {}
  for _, why in ipairs(CF.Reasons()) do
    if CF.counts[why] then parts[#parts + 1] = string.format("%s %d", why, CF.counts[why]) end
  end
  return ns.Format(L["Caught this session: {count} ({reasons})"], { count = CF.count, reasons = table.concat(parts, ", ") })
end

-- Every reason a line can be caught for, in the card's order.
function CF.Reasons()
  local out = {}
  for _, cat in ipairs(CF.CATEGORIES) do out[#out + 1] = cat.label end
  out[#out + 1], out[#out + 2] = L["Your word"], L["Repeat"]
  return out
end

-- The senders let through this session, for the card: "Let through: Goldy, Seller" (each shown name once, sorted),
-- or that there are none.
function CF.LetThroughText()
  local seen, names = {}, {}
  for sender in pairs(CF.allowed) do seen[ns.Home.Display(sender)] = true end
  for name in pairs(seen) do names[#names + 1] = name end
  if #names == 0 then return L["Nobody let through this session."] end
  table.sort(names)
  return ns.Format(L["Let through: {names}"], { names = table.concat(names, ", ") })
end

-- Filters the senders let through again (the card's Filter them again button); says so.
function CF.FilterAgain()
  CF.allowed = {}
  ns.Options.Refresh()
  ns.Chat(L["Every sender is filtered again."])
end

-- The card's hint while caught lines are hidden (they can't be seen or let through), else nothing.
function CF.HiddenHint()
  if ns.Settings("ChatFilter", CF.defaults).mode ~= "hide" then return "" end
  return L["Hidden lines can't be seen or let through: set Caught lines to the Filtered tab for that."]
end

-- Keywords ------------------------------------------------------------------------------------

-- The keywords in this profile (also while the module is off, for the options).
local function keywords()
  return ns.Settings("ChatFilter", CF.defaults).keywords
end

-- Why a keyword can't be added, or nil when it can.
local function refusal(word, list)
  if word == "" then return L["Type a word to filter."] end
  if ns.TextLength(word) > CF.MAX_LENGTH then return ns.Format(L["A word can be at most {max} characters."], { max = CF.MAX_LENGTH }) end
  if #list >= CF.MAX_KEYWORDS then return ns.Format(L["Chat filter keeps at most {max} words; remove one first."], { max = CF.MAX_KEYWORDS }) end
  for _, w in ipairs(list) do
    if ns.Lower(w) == word then return ns.Format(L['Already filtering "{word}".'], { word = word }) end
  end
end

-- A keyword as typed: trimmed and lower-cased.
local function clean(text)
  return ns.Lower(((type(text) == "string" and text or ""):gsub("[%[%]|]", ""):match("^%s*(.-)%s*$")))
end

-- Adds a keyword; says in chat what happened. True when added.
function CF.Add(text)
  local word, list = clean(text), keywords()
  local why = refusal(word, list)
  if why then ns.Chat(why) return false end
  list[#list + 1] = word
  ns.Chat(ns.Format(L['Filtering lines with "{word}".'], { word = word }))
  ns.Options.RebuildPage("chat")
  return true
end

-- Stops filtering a keyword; says in chat what happened.
function CF.Remove(text)
  local word = clean(text)
  if not ns.GetModule("ChatExtras").RemoveValue(keywords(), word) then return ns.Chat(ns.Format(L['Not filtering "{word}".'], { word = word })) end
  ns.Options.RebuildPage("chat")
  ns.Chat(ns.Format(L['No longer filtering "{word}".'], { word = word }))
end

-- The options' Add a word dialog: adds what was typed, and closes once it's added.
function CF.AddFromDialog(text)
  if CF.Add(text) then ns.HideText() end
end

-- Commands ------------------------------------------------------------------------------------

-- Switches the filter on or off (and makes the tab when it is needed); says so.
function CF.SetOn(on)
  ns.Settings("ChatFilter", CF.defaults).on = on
  CF.Prepare()
  ns.Chat(on and L["Chat filter on."] or L["Chat filter off."])
end

-- Sets where caught lines go ("tab" or "hide"); says so.
function CF.SetMode(mode)
  ns.Settings("ChatFilter", CF.defaults).mode = mode
  CF.Changed()
  ns.Chat(mode == "tab" and L["Caught lines go to the Filtered tab."] or L["Caught lines are hidden."])
end

-- The status line by whether the filter is on, then where caught lines go: whole sentences to translate.
local STATUS = {
  [true] = {
    tab = L["Chat filter is on; caught lines go to the Filtered tab; {count} caught this session."],
    hide = L["Chat filter is on; caught lines are hidden; {count} caught this session."],
  },
  [false] = {
    tab = L["Chat filter is off; caught lines go to the Filtered tab; {count} caught this session."],
    hide = L["Chat filter is off; caught lines are hidden; {count} caught this session."],
  },
}

-- Prints whether the filter is on, where lines go, how many it caught and the keywords.
local function status()
  local s = ns.Settings("ChatFilter", CF.defaults)
  ns.Chat(ns.Format(STATUS[s.on == true][s.mode == "tab" and "tab" or "hide"], { count = CF.count }))
  if #s.keywords > 0 then ns.Chat(ns.Format(L["Your words: {words}"], { words = table.concat(s.keywords, ", ") })) end
end

-- Forgets every keyword; says so.
function CF.ClearWords()
  ns.Settings("ChatFilter", CF.defaults).keywords = {}
  ns.Options.RebuildPage("chat")
  ns.Chat(L["Chat filter has no words now."])
end

-- What each /vg filter verb does with the rest of the line; no verb at all prints the status.
local VERBS = {
  -- Switches the filter on.
  on = function() return CF.SetOn(true) end,
  -- Switches the filter off.
  off = function() return CF.SetOn(false) end,
  -- Caught lines go to the Filtered tab.
  tab = function() return CF.SetMode("tab") end,
  -- Caught lines are hidden.
  hide = function() return CF.SetMode("hide") end,
  add = CF.Add,
  remove = CF.Remove,
  clear = CF.ClearWords,
  [""] = status,
}

-- /vg filter [on | off | tab | hide | add <word> | remove <word> | clear].
function CF.Command(rest)
  local verb, arg = (rest or ""):match("^(%S*)%s*(.-)$")
  local run = VERBS[verb]
  if not run then return ns.Chat(L["Usage: /vg filter [on | off | tab | hide | add <word> | remove <word> | clear]"]) end
  return run(arg)
end

-- Follows a setting changed in the options: the Filtered tab is made when it is first needed, and the card's
-- live lines (the hidden-lines hint) are read again.
function CF.Changed()
  CF.Prepare()
  ns.Options.Refresh()
end

-- Module switched off: the filter lets everything through (it stays registered with the game until a reload).
function CF.Disable()
  CF.active = false
end

-- Module entry point (Core/Modules.lua).
function CF.Enable(settings)
  CF.settings, CF.active = settings, true
  if CF.registered then return CF.Prepare() end
  CF.registered = true
  local guarded = ns.GuardResult("chat filter", CF.Filter, false)
  ns.AddChatFilters(CF.EVENTS, guarded)
  local registry = _G.EventRegistry
  if type(registry) == "table" and type(registry.RegisterCallback) == "function" then registry:RegisterCallback("SetItemRef", ns.Guard("chat filter link click", CF.OnLink), CF) end
  ns.On("PLAYER_ENTERING_WORLD", CF.Prepare)
end
