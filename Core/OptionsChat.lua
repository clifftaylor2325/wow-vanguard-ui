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
    check("Chat background", setting("Chat", "background", true)), check("Keep chat in its bottom-left spot (reload)", setting("Chat", "place", true)),
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

-- The Chat page: the chat window, chat watch and the group board (Modules/GroupBoard.lua adds its card).
local function chatPageRows()
  return append(append(chatWindowRows(), chatRows()), chatWatchRows())
end

O.AddPage({ key = "chat", title = "Chat", icon = "NavChat", order = 82, rows = chatPageRows })
