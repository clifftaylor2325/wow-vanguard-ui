-- Group board: WoW Forever has no Dungeon Finder, so groups form in chat.
-- This reads the lines people post in the channels you tick ("LFM SFK need
-- heals", "lvl 24 rogue LFG BFD") and keeps each sender's latest post as a row
-- on a board (Modules/GroupBoardView.lua): looking for more or looking for a
-- group, the dungeon with its level range, the roles named, who and how long
-- ago. Clicking a row opens a whisper to them in the chat box with a short
-- message filled in; nothing is ever sent for you (you press Enter).
-- Chat is read through ns.On only, never changed or hidden. Where the game
-- hides chat from addons (instances), the line comes secret and is skipped
-- before anything reads it. Dungeon names, short names and level ranges are
-- written here by hand (vanilla's), not taken from any addon or database.

local ADDON, ns = ...

local L = ns.L

local GB = ns.Module("GroupBoard", {
  defaults = { role = "auto", minutes = 10, mine = true, channels = { channel = true, yell = true, say = false, guild = false } },
})

-- Every profile saved before "Automatic" held "dps", the old default, whether the player picked it or not:
-- once, it becomes Automatic, which still says DPS for a damage dealer.
ns.Migrate("GroupBoard", function(saved)
  if saved.autoRole then return end
  if saved.role == "dps" then saved.role = nil end
  saved.autoRole = true
end)

ns.Options.MODULE_INFO.GroupBoard = { L["Group board"], L["Looking-for-more and looking-for-group posts from chat in one list by dungeon, role and level; a click opens a whisper you send yourself."] }

-- At most this many posts are kept (the oldest goes first).
GB.MAX = 40
-- Chat events -> the channel switch that reads them.
GB.EVENTS = { CHAT_MSG_CHANNEL = "channel", CHAT_MSG_YELL = "yell", CHAT_MSG_SAY = "say", CHAT_MSG_GUILD = "guild" }
-- The words that make a post one kind or the other; looking for more wins when a line has both.
GB.LFM = { "lfm", "lf1m", "lf2m", "lf3m", "lf4m", "looking for more", "need tank", "need heals", "need healer", "need dps", "lf tank", "lf heals", "lf healer", "lf dps" }
GB.LFG = { "lfg", "looking for group", "lf group", "lf grp" }
-- The roles, in the order a row shows them, and the words that name each.
GB.ROLE_ORDER = { "tank", "healer", "dps" }
GB.ROLE_WORDS = { tank = { "tank", "tanks", "mt" }, healer = { "heal", "heals", "healer", "healers", "healz" }, dps = { "dps", "dd" } }
GB.ROLE_NAMES = { tank = L["Tank"], healer = L["Healer"], dps = L["DPS"] }
-- Your group role (ns.PlayerRole) -> the board's name for it, for the Automatic whisper role.
GB.AUTO_ROLES = { tank = "tank", healer = "healer", damage = "dps" }

-- Vanilla's dungeons and raids, the first that a line names wins (so Dire Maul's
-- short names come before the Deadmines' "dm"): name, level range, short names.
GB.DUNGEONS = {
  { "Ragefire Chasm", 13, 18, { "rfc", "ragefire" } }, { "Wailing Caverns", 17, 24, { "wc", "wailing caverns" } },
  { "Dire Maul", 55, 60, { "dire maul", "dme", "dmw", "dmn", "dm e", "dm w", "dm n", "dm east", "dm west", "dm north", "tribute" } },
  { "The Deadmines", 17, 26, { "deadmines", "vc", "dm" } }, { "Shadowfang Keep", 22, 30, { "sfk", "shadowfang" } },
  { "Blackfathom Deeps", 24, 32, { "bfd", "blackfathom" } }, { "The Stockade", 24, 32, { "stocks", "stockade", "stockades" } },
  { "Gnomeregan", 29, 38, { "gnomer", "gnomeregan" } }, { "Razorfen Kraul", 29, 38, { "rfk", "kraul" } },
  { "Scarlet Monastery", 34, 45, { "sm", "scarlet" } },
  { "Razorfen Downs", 37, 46, { "rfd", "downs" } }, { "Uldaman", 41, 51, { "ulda", "uld", "uldaman" } },
  { "Zul'Farrak", 44, 54, { "zf", "zul farrak", "zulfarrak" } }, { "Maraudon", 46, 55, { "mara", "maraudon" } },
  { "Sunken Temple", 50, 56, { "st", "sunken temple", "atal hakkar" } }, { "Blackrock Depths", 52, 60, { "brd", "blackrock depths" } },
  { "Upper Blackrock Spire", 58, 60, { "ubrs", "upper spire" } }, { "Lower Blackrock Spire", 55, 60, { "lbrs", "lower spire" } },
  { "Stratholme", 58, 60, { "strat", "strath", "stratholme" } }, { "Scholomance", 58, 60, { "scholo", "scholomance" } },
  { "Molten Core", 60, 60, { "mc", "molten core" } }, { "Onyxia's Lair", 60, 60, { "ony", "onyxia" } },
  { "Zul'Gurub", 60, 60, { "zg", "zul gurub" } }, { "Blackwing Lair", 60, 60, { "bwl", "blackwing" } },
  { "Ruins of Ahn'Qiraj", 60, 60, { "aq20", "aq 20" } }, { "Temple of Ahn'Qiraj", 60, 60, { "aq40", "aq 40" } },
  { "Naxxramas", 60, 60, { "naxx", "naxxramas" } },
}
-- Scarlet Monastery's wings, which name it when a line names no dungeon of its own.
GB.SM_WINGS = { "lib", "library", "arms", "armory", "cath", "cathedral", "gy", "graveyard" }

-- The posts on the board, newest first: { kind, dungeon, roles, text, sender, time }.
GB.entries = {}

-- Reading a line --------------------------------------------------------------------------------

-- A line as " word word ": lower-case, colour and link codes and punctuation gone, so a short name only matches a whole word.
-- A line with no escape codes (most of them) skips the three code strips.
function GB.Words(text)
  local s = text:find("|", 1, true) and text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|H.-|h", ""):gsub("|[hr]", "") or text
  return " " .. (s:lower():gsub("[^%w]+", " ")) .. " "
end

-- Each phrase on word edges (" tank "), made once: every line asks again, so a new string per phrase per line would be garbage.
local padded = setmetatable({}, { __index = function(t, p) local v = " " .. p .. " " t[p] = v return v end })

-- Whether the words hold any of the phrases (each on word edges).
local function hasAny(words, phrases)
  for _, p in ipairs(phrases) do
    if words:find(padded[p], 1, true) then return true end
  end
  return false
end

-- "LFM", "LFG", or nil for a line that is neither.
function GB.Kind(words)
  if hasAny(words, GB.LFM) then return "LFM" end
  if hasAny(words, GB.LFG) then return "LFG" end
end

-- The dungeon whose own short names a line uses, as { name, min, max }, or nil.
local function namedDungeon(words)
  for _, d in ipairs(GB.DUNGEONS) do
    if hasAny(words, d[4]) then return { name = d[1], min = d[2], max = d[3] } end
  end
end

-- The dungeon a line names, as { name, min, max }, or nil. Scarlet Monastery's wing names are
-- ordinary chat words too ("60 arms warrior LFG strat"), so they count only when no dungeon is named.
function GB.Dungeon(words)
  local named = namedDungeon(words)
  if named or not hasAny(words, GB.SM_WINGS) then return named end
  return namedDungeon(" sm ")
end

-- The roles a line names, in GB.ROLE_ORDER.
function GB.Roles(words)
  local out = {}
  for _, role in ipairs(GB.ROLE_ORDER) do
    if hasAny(words, GB.ROLE_WORDS[role]) then out[#out + 1] = role end
  end
  return out
end

-- A post from a line: { kind, dungeon, roles, text }, or nil when it isn't one.
function GB.Parse(text)
  local words = GB.Words(text)
  local kind = GB.Kind(words)
  if not kind then return nil end
  return { kind = kind, dungeon = GB.Dungeon(words), roles = GB.Roles(words), text = text }
end

-- The board -------------------------------------------------------------------------------------

-- Drops posts older than the setting's minutes, and the oldest past GB.MAX.
function GB.Prune(now)
  local keep, limit = {}, GB.settings.minutes * 60
  for _, e in ipairs(GB.entries) do
    if now - e.time < limit and #keep < GB.MAX then keep[#keep + 1] = e end
  end
  GB.entries = keep
end

-- Puts a post on top of the board, in place of the sender's earlier one.
function GB.Add(e)
  for i, old in ipairs(GB.entries) do
    if old.sender == e.sender then table.remove(GB.entries, i) break end
  end
  table.insert(GB.entries, 1, e)
  GB.Prune(e.time)
  if GB.Changed then GB.Changed() end
end

-- True for your own line: only when your name and the sender's are both plain.
local function own(sender)
  local me = UnitName("player")
  if ns.IsSecret(me) or type(me) ~= "string" then return false end
  return sender == me or sender:match("^[^%-]+") == me
end

-- What the chat lines did since login: per event, and how many were read, skipped (and why) or became posts.
GB.stats = { events = {}, off = 0, secret = 0, missing = 0, own = 0, plain = 0, posts = 0 }

-- Why a line is skipped ("off", "secret", "missing", "own"), or nil when it is read: a hidden
-- (secret) or missing text or sender is judged before any string is read.
function GB.Why(event, text, sender)
  local key = GB.EVENTS[event]
  if not (key and GB.settings.channels[key]) then return "off" end
  if ns.IsSecret(text) or ns.IsSecret(sender) then return "secret" end
  if type(text) ~= "string" or type(sender) ~= "string" then return "missing" end
  if own(sender) then return "own" end
end

-- A chat event (ns.On): skipped lines (channels you don't read, hidden or missing text, your own) are counted, not read.
function GB.OnChat(event, text, sender)
  if ns.Restricted("Chat") then return end
  local st, why = GB.stats, GB.Why(event, text, sender)
  st.events[event] = (st.events[event] or 0) + 1
  if why then st[why] = st[why] + 1 return end
  local e = GB.Parse(text)
  if not e then st.plain, st.lastPlain = st.plain + 1, ns.TextPrefix(text, 80) return end
  st.posts = st.posts + 1
  e.sender, e.time = sender, GetTime()
  GB.Add(e)
end

-- "Heard 12 chat lines since login: 9 not posts, 3 on posts" (what the board did with them), or why nothing was heard.
function GB.Summary()
  local st, heard = GB.stats, 0
  for _, n in pairs(st.events) do heard = heard + n end
  if heard == 0 then return L["No chat lines reached the board since login."] end
  return ns.Format(L["{heard} chat lines since login: {posts} posts, {other} other, {hidden} hidden by the game, {off} from channels that are off, {own} yours."],
    { heard = heard, posts = st.posts, other = st.plain, hidden = st.secret + st.missing, off = st.off, own = st.own })
end

-- The numbered channels you are in, "1 General, 2 Trade", or "none" (the game's list; a client without it says so).
function GB.Channels()
  if type(GetChannelList) ~= "function" then return "unknown (this client has no channel list)" end
  local out, list = {}, { GetChannelList() }
  for i = 1, #list, 3 do out[#out + 1] = tostring(list[i]) .. " " .. tostring(list[i + 1]) end
  return #out > 0 and table.concat(out, ", ") or "none"
end

-- /vg lfg probe: what the board has heard, the channels you are in and the switches, to say why the board is empty.
function GB.Probe()
  local on = {}
  for key, v in pairs(GB.settings.channels) do if v then on[#on + 1] = key end end
  table.sort(on)
  ns.Chat("Group board: " .. GB.Summary())
  ns.Chat("Reading: " .. (#on > 0 and table.concat(on, ", ") or "no channel") .. ". You are in channels: " .. GB.Channels() .. ".")
  ns.Chat("Last line that was not a post: " .. (GB.stats.lastPlain or "none yet"))
  ns.Chat("Posts kept: " .. #GB.entries .. ", shown: " .. #GB.Shown() .. " (filter " .. GB.filter .. ", only my level " .. tostring(GB.settings.mine) .. ").")
end

-- /vg lfg [probe]: the board, or its probe; with the module off, Toggle says the board is off.
function GB.Command(rest)
  local wantsProbe = (rest or ""):lower():match("^%s*probe") ~= nil
  if wantsProbe and GB.settings then return GB.Probe() end
  GB.Toggle()
end

-- Whether a post fits your level: no dungeon named, or your level from two under its range to its top.
function GB.Fits(e, level)
  if not e.dungeon or not level then return true end
  return level >= e.dungeon.min - 2 and level <= e.dungeon.max
end

-- Your level, or nil when the client won't say.
function GB.Level()
  local level = ns.PlainNumber(UnitLevel("player"))
  return level and level > 0 and level or nil
end

-- The board's filter: "all", "LFM", "LFG" or "role" (Needs my role) (this session; the board's filter button cycles it).
GB.filter = "all"
-- The filters that show one kind of post only, and that kind.
GB.FILTER_KIND = { LFM = "LFM", LFG = "LFG" }

-- Your role for the whisper and the Needs my role filter: the setting, or with Automatic your group role.
function GB.MyRole()
  local role = GB.settings.role
  if role == "auto" then return GB.AUTO_ROLES[ns.PlayerRole()] end
  return role
end

-- Whether a post needs you: a group looking for more that names your role, or names none.
function GB.NeedsMe(e)
  if e.kind ~= "LFM" then return false end
  if #e.roles == 0 then return true end
  local mine = GB.MyRole()
  for _, role in ipairs(e.roles) do
    if role == mine then return true end
  end
  return false
end

-- Whether a row is dimmed: the Needs my role filter shows a post that doesn't need you.
function GB.Dimmed(e)
  return GB.filter == "role" and not GB.NeedsMe(e)
end

-- Whether the board shows a post: its kind passes the filter, and it fits your level when that switch is on.
local function shows(e, level)
  local kind = GB.FILTER_KIND[GB.filter]
  if kind and e.kind ~= kind then return false end
  return not GB.settings.mine or GB.Fits(e, level)
end

-- The posts that need you first, then the rest (dimmed), each newest first.
local function needsFirst(posts)
  local first, rest = {}, {}
  for _, e in ipairs(posts) do table.insert(GB.NeedsMe(e) and first or rest, e) end
  for _, e in ipairs(rest) do first[#first + 1] = e end
  return first
end

-- The posts the board shows, newest first (with Needs my role, the ones that need you come first).
function GB.Shown()
  local out, level = {}, GB.Level()
  for _, e in ipairs(GB.entries) do
    if shows(e, level) then out[#out + 1] = e end
  end
  return GB.filter == "role" and needsFirst(out) or out
end

-- The whisper ---------------------------------------------------------------------------------

-- "Level 24 Mage", as much of it as the client says plainly.
local function whoAmI()
  local level, class, parts = GB.Level(), UnitClass("player"), {}
  if level then parts[#parts + 1] = ns.Format(L["Level {level}"], { level = level }) end
  if not ns.IsSecret(class) and type(class) == "string" then parts[#parts + 1] = class end
  return #parts > 0 and table.concat(parts, " ") or L["A player"]
end

-- What the whisper says: to a group looking for more, you and your role; to a player looking for one, an invitation.
function GB.Template(e)
  local where = e.dungeon and e.dungeon.name or nil
  if e.kind == "LFG" then return ns.Format(L["Hi! We're forming {dungeon}, want to join?"], { dungeon = where or L["a group"] }) end
  local role = GB.ROLE_NAMES[GB.MyRole()] or GB.ROLE_NAMES.dps
  return ns.Format(L["Hi! {who} ({role}) for {dungeon}, if you still need one."], { who = whoAmI(), role = role, dungeon = where or L["your group"] })
end

-- Opens a whisper to the post's sender with the message filled in (the game's own call, from a
-- click only); you read it and press Enter. A client without that call opens an empty whisper.
function GB.Whisper(e)
  local util = type(ChatFrameUtil) == "table" and ChatFrameUtil.SendTellWithMessage
  if type(util) == "function" then return util(e.sender, GB.Template(e)) end
  ns.GetModule("ChatWatch").Whisper(e.sender)
end

-- Options ---------------------------------------------------------------------------------------

-- get/set for one of the board's settings (also while the module is off), and its default.
local function setting(key)
  return function() return ns.Settings("GroupBoard", GB.defaults)[key] end,
    function(v) ns.Settings("GroupBoard", GB.defaults)[key] = v end, GB.defaults[key]
end

-- get/set for one channel switch, and its default.
local function channel(key)
  return function() return ns.Settings("GroupBoard", GB.defaults).channels[key] end,
    function(v) ns.Settings("GroupBoard", GB.defaults).channels[key] = v end, GB.defaults.channels[key]
end

-- The board's card on the Chat page.
function GB.Rows()
  return {
    { "header", L["Group board"] },
    { "text", L["Looking-for-more and looking-for-group posts from chat, by dungeon, role and level (/vg lfg). A click opens a whisper you send yourself."] },
    { "button", L["Open the group board"], function() GB.Toggle() end },
    { "cycle", L["Your role, for the whisper"], { { "auto", L["Automatic"] }, { "tank", L["Tank"] }, { "healer", L["Healer"] }, { "dps", L["DPS"] } }, setting("role") },
    { "cycle", L["Keep posts for"], { { 5, L["5 minutes"] }, { 10, L["10 minutes"] }, { 20, L["20 minutes"] } }, setting("minutes") },
    { "check", L["Numbered channels (General, Trade, LookingForGroup)"], channel("channel") },
    { "check", L["Yell"], channel("yell") }, { "check", L["Say"], channel("say") }, { "check", L["Guild"], channel("guild") },
  }
end
ns.Options.AddRows("chat", GB.Rows)

-- Module entry point (Core/Modules.lua): the window is built the first time it opens.
function GB.Enable(settings)
  GB.settings = settings
  for event in pairs(GB.EVENTS) do ns.On(event, GB.OnChat) end
end
