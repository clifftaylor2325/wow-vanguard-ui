-- The Chat page (/vg): the chat window, its extras and the game's own
-- timestamp and class-color settings, chat watch and the group board.
-- Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local O = ns.Options
local moduleSettings, setting, liveSetting, check, append = O.ModuleSettings, O.Setting, O.LiveSetting, O.Check, O.Append

-- get/set for the chat text size, which chat windows take at once.
local function chatSizeSetting()
  return liveSetting("Chat", "textSize", function() local CH = ns.GetModule("Chat") if CH.settings then CH.Refresh() end end)
end

-- The game's class-colored names in chat: always, never, or as each chat type is set.
local CLASS_NAMES = { { "0", "Always" }, { "1", "Never" }, { "2", "As each chat type is set" } }
-- chatClassColorOverride: "0" and "1" force class colors on or off; anything else leaves them to each chat type.
local function classNameChoice(v) return (v == "0" or v == "1") and v or "2" end
-- showTimestamps: "none" (or unset) is off, anything else a time format.
local function timestampChoice(v) return v or "none" end

-- Chat's window: its background, its spot and its text size.
local function chatWindowRows()
  return {
    { "header", "Chat" },
    check("Chat background", setting("Chat", "background", true)),
    { "cycle", "Chat background strength", ns.GetModule("Chat").BACKDROPS, liveSetting("Chat", "backdrop", function() local CH = ns.GetModule("Chat") if CH.settings then CH.Refresh() end end) },
    check("Keep chat in its bottom-left spot (reload)", setting("Chat", "place", true)),
    { "cycle", "Chat window size", ns.GetModule("Chat").WINDOW_SCALES, liveSetting("Chat", "windowScale", function() local CH = ns.GetModule("Chat") if CH.settings then CH.ApplySize() end end) },
    { "cycle", "Chat text size (follows Text size)", ns.GetModule("Chat").SIZES, chatSizeSetting() },
  }
end

-- Chat: the extras, and the game's own timestamp and class-color settings.
local function chatRows()
  local CX = ns.GetModule("ChatExtras")
  return {
    check("Clickable web links in chat (reload)", setting("ChatExtras", "links", true)),
    check("Copy button over the chat (reload)", setting("ChatExtras", "copy", true)),
    check("Short channel names: [2. Trade] shows as [T]", setting("ChatExtras", "shortChannels")),
    check("Ctrl + mouse wheel jumps to the top or bottom of chat", setting("ChatExtras", "ctrlScroll")),
    { "cycle", "Chat timestamps (the game's setting)", CX.TimestampChoices(), CX.CVarSetting("showTimestamps", timestampChoice) },
    { "cycle", "Class-colored names in chat (the game's setting)", CLASS_NAMES, CX.CVarSetting("chatClassColorOverride", classNameChoice) },
  }
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

-- Chat watch: add a phrase, a Remove button per phrase, then the switches.
local function chatWatchRows()
  local CW = ns.GetModule("ChatWatch")
  local rows = { { "header", "Chat watch" }, { "text", "Phrases to watch for: a sound and a toast when one is said; click the toast to whisper." },
    { "button", "Add a phrase", function() ns.AskText("Watch for", CW.AddFromDialog, "Add") end } }
  for _, p in ipairs(moduleSettings("ChatWatch").phrases) do rows[#rows + 1] = { "button", "Remove: " .. p, function() CW.Remove(p) end } end
  return append(rows, chatWatchSwitches(CW))
end

-- Chat filter: the switches, where caught lines go, then a Remove button per word of your own.
local function chatFilterRows()
  local CF = ns.GetModule("ChatFilter")
  local changed = CF.Changed
  local rows = { { "header", "Chat filter" }, { "text", "Spam in Trade and the other channels goes to a Filtered tab (click a sender there to let them through)." },
    check("Filter chat", liveSetting("ChatFilter", "on", changed)),
    { "cycle", "Caught lines", { { "tab", "Go to the Filtered tab" }, { "hide", "Are hidden" } }, liveSetting("ChatFilter", "mode", changed) },
    check("Gold selling", setting("ChatFilter", "gold")), check("Boosting", setting("ChatFilter", "boosting")),
    check("Guild recruiting", setting("ChatFilter", "recruiting")), check("Same line again within a minute", setting("ChatFilter", "repeats")),
    { "button", "Add a word", function() ns.AskText("Filter lines with", CF.AddFromDialog, "Add") end } }
  for _, w in ipairs(moduleSettings("ChatFilter").keywords) do rows[#rows + 1] = { "button", "Remove: " .. w, function() CF.Remove(w) end } end
  return rows
end

-- Chat windows: the game's lock, the movers for floating windows, then a width and a height for each window showing.
local function chatWindowsRows()
  local CW = ns.GetModule("ChatWindows")
  local rows = { { "header", "Chat windows" }, { "text", "Size each chat window here instead of dragging its corner. Lock stops the game's drag." },
    check("Lock chat windows", CW.LockSetting()), check("Move floating windows with /vg unlock (reload)", setting("ChatWindows", "movers", true)) }
  for _, w in ipairs(CW.Windows()) do
    local wGet, wSet = CW.SizeSetting(w[2], false)
    local hGet, hSet = CW.SizeSetting(w[2], true)
    append(rows, { { "slider", w[3] .. ": width", CW.WIDTH, wGet, wSet }, { "slider", w[3] .. ": height", CW.HEIGHT, hGet, hSet } })
  end
  return rows
end

-- Chat tabs: pick a tab, make, rename or close one, and choose what it shows.
local function chatTabRows()
  local CW = ns.GetModule("ChatWindows")
  local rows = { { "header", "Chat tabs" }, { "text", "Pick a tab, then rename or close it, or choose what it shows." },
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
    { "button", "Clear saved chat", CHH.Clear },
  }
end

-- The Chat page: the chat window, chat watch, the chat filter and the group board (Modules/GroupBoard.lua adds its card).
local function chatPageRows()
  return append(append(append(append(append(append(chatWindowRows(), chatWindowsRows()), chatTabRows()), chatRows()), chatHistoryRows()), chatWatchRows()), chatFilterRows())
end

O.AddPage({ key = "chat", title = "Chat", icon = "NavChat", order = 82, rows = chatPageRows })
