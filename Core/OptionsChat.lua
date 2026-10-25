-- The Chat page (/vg): the chat window, its tabs, its extras (with the game's own timestamp and
-- class-color settings), chat watch, the chat filter, history, the windows' sizes and the group board.
-- Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local O = ns.Options
local moduleSettings, setting, reloadSetting, liveSetting, check, append = O.ModuleSettings, O.Setting, O.ReloadSetting, O.LiveSetting, O.Check, O.Append

-- get/set for one of the Chat module's settings, which it applies at once through its `method` (by
-- name: Refresh, ApplySize, ApplyFades...) while it runs.
local function chatLive(key, method)
  return liveSetting("Chat", key, function() local CH = ns.GetModule("Chat") if CH.settings then CH[method]() end end)
end

-- The game's class-colored names in chat: always, never, or as each chat type is set.
local CLASS_NAMES = { { "0", "Always" }, { "1", "Never" }, { "2", "As each chat type is set" } }
-- chatClassColorOverride: "0" and "1" force class colors on or off; anything else leaves them to each chat type.
local function classNameChoice(v) return (v == "0" or v == "1") and v or "2" end
-- showTimestamps: "none" (or unset) is off, anything else a time format.
local function timestampChoice(v) return v or "none" end

-- Chat's text and bar, under the Chat header: the text size, how long lines stay, the tabs, the
-- hidden-until-hover bar and the bubbles over heads (on reload: the engine reuses its bubble
-- frames, and one already dressed keeps its look).
local function chatTextRows()
  local CH = ns.GetModule("Chat")
  return {
    { "cycle", "Chat text size (follows Text size)", CH.SIZES, chatLive("textSize", "Refresh") },
    { "cycle", "Chat text fades", CH.LINE_FADES, chatLive("lineFade", "ApplyFades") },
    check("Keep chat tabs visible (the game fades them until the mouse comes near)", chatLive("tabsVisible", "ApplyTabAlpha")),
    check("Hide the tab bar until the mouse is over the chat", chatLive("barHover", "ApplyBarHover")),
    check("Text-only bubbles: no panel behind the words over heads (reload)", reloadSetting("ChatBubbles", "textOnly")),
  }
end

-- Chat's window: its background, its spot and its size, then its text and bar (chatTextRows).
local function chatWindowRows()
  local CH = ns.GetModule("Chat")
  return append({
    { "header", "Chat" },
    check("Chat background", reloadSetting("Chat", "background")),
    { "cycle", "Chat background strength", CH.BACKDROPS, chatLive("backdrop", "Refresh") },
    check("Keep chat in its bottom-left spot (reload)", reloadSetting("Chat", "place")),
    { "cycle", "Chat window size", CH.WINDOW_SCALES, chatLive("windowScale", "ApplySize") },
  }, chatTextRows())
end

-- The Copy tile's switch, then Find in chat and the Find tile's switch, together (each applies at once).
local function copyFindRows(CX)
  local CW = ns.GetModule("ChatWindows")
  return {
    check("Copy button in the chat's tab bar", liveSetting("ChatExtras", "copy", CX.ApplyCopy)),
    { "button", "Find in chat", CW.AskFind },
    check("Find button in the chat's tab bar", liveSetting("ChatWindows", "find", CW.ApplyFind)),
  }
end

-- Chat extras: links, the Copy and Find rows (copyFindRows), short channel names, the wheel, and the game's own
-- timestamp and class-color settings. Links and the buttons apply at once.
local function chatRows()
  local CX = ns.GetModule("ChatExtras")
  local rows = { { "header", "Chat extras" }, check("Clickable web links in chat", setting("ChatExtras", "links")) }
  append(rows, copyFindRows(CX))
  return append(rows, {
    check("Short channel names: [2. Trade] shows as [2]", setting("ChatExtras", "shortChannels")),
    check("Ctrl + mouse wheel jumps to the top or bottom of chat", setting("ChatExtras", "ctrlScroll")),
    { "cycle", "Chat timestamps (the game's setting)", CX.TimestampChoices(), CX.CVarSetting("showTimestamps", timestampChoice) },
    { "cycle", "Class-colored names in chat (the game's setting)", CLASS_NAMES, CX.CVarSetting("chatClassColorOverride", classNameChoice) },
  })
end

-- Chat watch's switches: the channels it reads, its sound, its toast and the toast's auction price.
local function chatWatchSwitches(CW)
  return {
    check("Numbered channels (General, Trade, LFG)", CW.ChannelSetting("channel")),
    check("Say", CW.ChannelSetting("say")), check("Yell", CW.ChannelSetting("yell")), check("Guild", CW.ChannelSetting("guild")),
    check("Party and raid", CW.ChannelSetting("party", "raid")), check("Whispers", CW.ChannelSetting("whisper")),
    check("Sound", setting("ChatWatch", "sound")), check("Toast", setting("ChatWatch", "toast")),
    check("Auction price of a linked item on the toast", setting("ChatWatch", "prices")),
  }
end

-- A saved list's rows: its Add button, a hint while it is empty, then a Remove button per item.
-- spec: { add = a button row, items = the list, empty = the hint, remove = function(item) }.
local function listRows(spec)
  local rows = { spec.add }
  if #spec.items == 0 then rows[#rows + 1] = { "text", spec.empty } end
  for _, item in ipairs(spec.items) do
    rows[#rows + 1] = { "button", "Remove: " .. item, function() spec.remove(item) end }
  end
  return rows
end

-- Chat watch: its prose, the phrases (listRows), then the switches.
local function chatWatchRows()
  local CW = ns.GetModule("ChatWatch")
  local rows = { { "header", "Chat watch" }, { "text", "Phrases to watch for: a sound and a toast when one is said (all the words, in any order; in a fight, once it ends). Click the toast to whisper." } }
  append(rows, listRows({ add = { "button", "Add a phrase", function() ns.AskText("Watch for", CW.AddFromDialog, "Add") end },
    items = moduleSettings("ChatWatch").phrases, empty = "No phrases yet. Add one, such as LFM or a dungeon's name.", remove = CW.Remove }))
  return append(rows, chatWatchSwitches(CW))
end

-- What the chat filter caught this session, by reason, the hint while caught lines are hidden, and the senders let
-- through with a button that filters them again: live lines, re-read each time the window shows or a setting changes.
local function chatFilterStatusRows(CF)
  return {
    { "text", CF.CaughtText },
    { "text", CF.HiddenHint },
    { "text", CF.LetThroughText },
    { "button", "Filter them again", CF.FilterAgain },
  }
end

-- Chat filter's words of your own: Add a word, then a Remove button per word (or a hint while there are none).
local function chatFilterWordRows(CF)
  return listRows({ add = { "button", "Add a word", function() ns.AskText("Filter lines with", CF.AddFromDialog, "Add") end },
    items = moduleSettings("ChatFilter").keywords, empty = "No words of your own yet.", remove = CF.Remove })
end

-- Chat filter: the switches, where caught lines go, what it caught (chatFilterStatusRows), then your words.
local function chatFilterRows()
  local CF = ns.GetModule("ChatFilter")
  local changed = CF.Changed
  local rows = { { "header", "Chat filter" }, { "text", "Spam in Trade and the other channels goes to a Filtered tab (click a sender there to let them through)." },
    check("Filter chat", liveSetting("ChatFilter", "on", changed)),
    { "cycle", "Caught lines", { { "tab", "Go to the Filtered tab" }, { "hide", "Are hidden" } }, liveSetting("ChatFilter", "mode", changed) },
    check("Gold selling", setting("ChatFilter", "gold")), check("Boosting", setting("ChatFilter", "boosting")),
    check("Guild recruiting", setting("ChatFilter", "recruiting")), check("Same line again within a minute", setting("ChatFilter", "repeats")) }
  return append(append(rows, chatFilterStatusRows(CF)), chatFilterWordRows(CF))
end

-- Chat windows: the game's lock, the movers for floating windows, then a width and a height for each window showing.
local function chatWindowsRows()
  local CW = ns.GetModule("ChatWindows")
  local rows = { { "header", "Chat windows" }, { "text", "Size each chat window here instead of dragging its corner. Lock stops the game's drag." },
    check("Lock chat windows", CW.LockSetting()), check("Move floating windows with /vg unlock (reload)", reloadSetting("ChatWindows", "movers")) }
  for _, w in ipairs(CW.Shown()) do
    local wGet, wSet = CW.WidthSetting(w.frame)
    local hGet, hSet = CW.HeightSetting(w.frame)
    append(rows, { { "slider", w.name .. ": width", CW.WIDTH, wGet, wSet }, { "slider", w.name .. ": height", CW.HEIGHT, hGet, hSet } })
  end
  return rows
end

-- Chat tabs: pick a tab, make, rename or close one, and choose what it shows.
local function chatTabRows()
  local CW = ns.GetModule("ChatWindows")
  local rows = { { "header", "Chat tabs" }, { "text", "Pick a tab, then rename or close it, or choose what it shows. Channels: right-click the tab, then Settings." },
    { "cycle", "Tab", CW.TabChoices(), CW.TabSetting() },
    { "button", "New chat tab", function() ns.AskText("Name the new tab", CW.New, "Make") end },
    { "button", "Rename this tab", function() ns.AskText("New name for this tab", CW.Rename, "Rename") end },
    { "button", "Close this tab", CW.Close } }
  for _, g in ipairs(CW.GROUPS) do rows[#rows + 1] = check("Show " .. g[2], CW.GroupSetting(g[1])) end
  return rows
end

-- Chat history: the switch, how much is kept, whispers and a Clear button.
local function chatHistoryRows()
  local CHH = ns.GetModule("ChatHistory")
  return {
    { "header", "Chat history" }, { "text", "Your chat comes back after a reload or the next login. Saved for this character only." },
    check("Keep chat history", setting("ChatHistory", "on")),
    { "cycle", "Lines kept per chat window", CHH.LINE_CHOICES, setting("ChatHistory", "lines") },
    { "cycle", "Keep lines for", CHH.DAY_CHOICES, setting("ChatHistory", "days") },
    check("Keep whispers", setting("ChatHistory", "whispers")),
    { "button", "Clear saved chat", CHH.AskClear },
  }
end

-- The Chat page's cards, in the order players look for things: the chat window, its tabs, the extras (Copy and
-- Find together), chat watch, the chat filter, history and the windows' sizes; the group board's card comes
-- last (Modules/GroupBoard.lua adds it).
local CHAT_CARDS = { chatWindowRows, chatTabRows, chatRows, chatWatchRows, chatFilterRows, chatHistoryRows, chatWindowsRows }

-- The Chat page's rows: each card's (CHAT_CARDS), in order.
local function chatPageRows()
  local rows = {}
  for _, card in ipairs(CHAT_CARDS) do append(rows, card()) end
  return rows
end

O.AddPage({ key = "chat", title = "Chat", icon = "NavChat", order = 82, rows = chatPageRows })
