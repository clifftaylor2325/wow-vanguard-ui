-- The bug log: what Vanguard caught going wrong and the bugs the player notes by hand, kept in the
-- account's saved variables so they outlast the session. Core/Events.lua keeps a session's errors
-- in memory only; this file copies them into VanguardDB.bugLog the frame after one is kept and
-- again at logout, each with where the character was, the state of the UI, where the movable
-- frames were and what happened just before. The client writes saved variables only at logout or
-- a reload, so a session that ends in a crash keeps nothing.

local _, ns = ...
local L = ns.L
local I = ns.Inspect

local BL = {}
ns.BugLog = BL

-- The most entries kept, and the most characters of a stack and of a note.
BL.MAX, BL.STACK_MAX, BL.NOTE_MAX = 100, 2000, 500
-- The newest entries the Open the bug log window lists; the saved file holds them all.
BL.SHOWN = 40
-- The most lines of the trail, the most arguments of an event it keeps, and the most screenshots of
-- new errors in a session (a storm of errors must not fill the disk).
BL.TRAIL_MAX, BL.TRAIL_ARGS, BL.SHOTS_MAX = 25, 4, 10
-- The most characters of one line of the trail (a long /vg command is cut).
BL.TRAIL_CHARS = 120

-- The log -------------------------------------------------------------------------------------

-- Whether this session has been counted in the log.
local counted = false

-- The account-wide log: VanguardDB.bugLog = { entries = { oldest first }, sessions = logins and reloads that
-- used it, shots = the Screenshot each new error switch }; the first call of a session counts the session.
-- nil before the saved variables load.
function BL.Store()
  if type(VanguardDB) ~= "table" then return nil end
  local saved = type(VanguardDB.bugLog) == "table" and VanguardDB.bugLog or {}
  local store = ns.Fill(saved, { entries = {}, sessions = 0, shots = false })
  VanguardDB.bugLog = store
  if not counted then counted, store.sessions = true, store.sessions + 1 end
  return store
end

-- The wall clock in a date() format, by the computer's time; "" on a client without date().
local function clock(format)
  return type(_G.date) == "function" and tostring(_G.date(format)) or ""
end

-- The wall clock as "2026-11-27 14:03:11".
local function stamp()
  return clock("%Y-%m-%d %H:%M:%S")
end

-- "12.1.5 (70783)": the client's release and build.
local function clientText()
  local release, build = GetBuildInfo()
  return string.format("%s (%s)", tostring(release), tostring(build))
end

-- This character as "Name-Realm"; "?" when the client hides the name.
local function who()
  local name = ns.PlainText(UnitName("player"))
  return name and (name .. "-" .. ns.Home.Realm()) or "?"
end

-- Where the character stands: "Zone, Subzone", the zone alone, or "?" when the client names neither.
local function place()
  return ns.PlaceText(ns.PlainText(GetZoneText()), ns.PlainText(GetSubZoneText())) or "?"
end

-- The facts of this moment an entry starts with: the addon's version and profile, the client's build, who and
-- where the character is, the kind of instance ("none" outside one), whether a fight is on and the group's size.
local function context()
  local inside, kind = IsInInstance()
  local _, class = UnitClass("player")
  return { version = ns.AddonVersion(), profile = ns.ProfileName(), client = clientText(), who = who(),
    class = ns.PlainText(class), level = ns.PlainNumber(UnitLevel("player")), zone = place(),
    instance = inside and kind or "none", combat = ns.InCombat(), group = GetNumGroupMembers() }
end

-- The facts of this moment, or the version and why the rest could not be read: an entry is never lost
-- to a client call that fails.
local function safeContext()
  local ok, facts = pcall(context)
  if ok then return facts end
  return { version = ns.AddonVersion(), unread = ns.IsSecret(facts) and "a hidden error" or tostring(facts) }
end

-- The trail -----------------------------------------------------------------------------------
-- The last things that happened, oldest first, kept in memory and copied onto a new entry, so the log
-- says what led up to a bug: "14:03:11 fight started (Elwynn Forest, Goldshire)".

local trail = {}

-- Adds a line to the trail with the time of day, cut to BL.TRAIL_CHARS characters; the oldest goes past BL.TRAIL_MAX.
---@param text string
function BL.Trail(text)
  trail[#trail + 1] = clock("%H:%M:%S") .. " " .. ns.TextPrefix(text, BL.TRAIL_CHARS)
  if #trail > BL.TRAIL_MAX then table.remove(trail, 1) end
end

-- The game events the trail notes, each by what it is called there.
local TRAILED = { PLAYER_REGEN_DISABLED = "fight started", PLAYER_REGEN_ENABLED = "fight ended", PLAYER_ENTERING_WORLD = "entered the world",
  ZONE_CHANGED_NEW_AREA = "new zone", ENCOUNTER_START = "boss pulled", PLAYER_DEAD = "died" }

-- An event's first arguments as text, each after a space; a hidden one is named, never read.
local function argsText(...)
  local out = ""
  for i = 1, math.min(select("#", ...), BL.TRAIL_ARGS) do
    local v = select(i, ...)
    out = out .. " " .. (ns.IsSecret(v) and "(hidden)" or tostring(v))
  end
  return out
end

-- Notes a trailed event with its arguments and where the character is.
local function trailEvent(event, ...)
  BL.Trail(string.format("%s%s (%s)", TRAILED[event], argsText(...), place()))
end

for event in pairs(TRAILED) do ns.On(event, trailEvent) end
ns.OnProfileChanged(function() BL.Trail("profile settings changed (" .. tostring(ns.ProfileName()) .. ")") end)
ns.OnUnlockChanged(function() BL.Trail(ns.Unlocked() and "frames unlocked" or "frames locked") end)

-- Snapshots -----------------------------------------------------------------------------------
-- What the UI looked like when an entry was made, as lines of plain English (diagnostics, so not
-- translated). Each part is read under pcall: a part that fails says so and never costs the entry.

-- The lines a part of the snapshot gives, or one line saying why it could not be read.
local function part(name, fn)
  local ok, lines = pcall(fn)
  if ok then return lines end
  return { name .. " not read: " .. (ns.IsSecret(lines) and "a hidden error" or tostring(lines)) }
end

-- Adds the name to out when a frame of that name is shown now; each name is looked at once.
local function addShown(out, seen, name)
  local f = _G[name]
  if seen[name] or type(f) ~= "table" then return end
  seen[name] = true
  if I.IsShown(f) then out[#out + 1] = name end
end

-- The windows open now, by name: those the game closes on Escape (Vanguard's own are among them) and
-- those its panel manager lays out; "none" for none.
local function openWindows()
  local out, seen = {}, {}
  for _, name in ipairs(UISpecialFrames) do addShown(out, seen, name) end
  for name in pairs(UIPanelWindows) do addShown(out, seen, name) end
  table.sort(out)
  return #out > 0 and table.concat(out, ", ") or "none"
end

-- "yes" or "no" for a plain answer of the client's; "?" for a hidden one.
local function yesNo(v)
  if ns.IsSecret(v) then return "?" end
  return v and "yes" or "no"
end

-- The group in words: "none" alone, else "raid of 25" or "party of 5".
local function groupText()
  local size = GetNumGroupMembers()
  if size == 0 then return "none" end
  return string.format("%s of %d", IsInRaid() and "raid" or "party", size)
end

-- The character's situation in one line: the group, a target, a pet, dead or not, the frames unlocked or not.
local function situationLine()
  return string.format("Group %s  ·  target %s  ·  pet %s  ·  dead %s  ·  frames %s", groupText(), yesNo(UnitExists("target")),
    yesNo(UnitExists("pet")), yesNo(UnitIsDeadOrGhost("player")), ns.Unlocked() and "unlocked" or "locked")
end

-- The state: what /vg report says before its errors (version, client, restrictions, text, screen, modules
-- off, skins, what was left off), then the character's situation and the open windows.
local function stateLines()
  local lines = ns.ReportHead()
  table.remove(lines, 1)
  lines[#lines + 1] = situationLine()
  lines[#lines + 1] = "Open windows: " .. openWindows()
  return lines
end

-- The layout: each movable frame that is shown with its state in brief (/vg frames order), then the
-- ones not shown in one line.
local function layoutLines()
  local lines, hidden = {}, {}
  for _, m in ipairs(ns.MoverList()) do
    local f = ns.MoverFrame(m.key)
    if I.IsShown(f) then lines[#lines + 1] = m.key .. ": " .. I.Brief(f) else hidden[#hidden + 1] = m.key end
  end
  lines[#lines + 1] = "Not shown: " .. (#hidden > 0 and table.concat(hidden, ", ") or "none")
  return lines
end

-- What the mouse is over, as /vg frame says it (its state, anchors and ancestors), the topmost region
-- only; over the world or off the screen, one line saying so.
local function mouseLines()
  local top = GetMouseFoci()[1]
  if not top then return { "nothing (the world, or off the screen)" } end
  local lines = { I.StateLine(top) }
  I.PointLines(top, lines)
  I.AncestorLines(top, lines)
  return lines
end

-- The snapshot new entries share, read once however many entries one look brings in.
local snapshot

-- The snapshot of now: { state, layout, trail }.
local function snapshotNow()
  snapshot = snapshot or { state = part("state", stateLines), layout = part("layout", layoutLines), trail = ns.Copy(trail) }
  return snapshot
end

-- Entries -------------------------------------------------------------------------------------

-- The kinds of entry that carry a snapshot; a quiet fallback and a skin left off don't need one.
local DETAILED = { error = true, blocked = true, paused = true, mark = true }

-- Past BL.MAX an entry goes: the oldest that Vanguard logged by itself, and the oldest note of the player's
-- own only when nothing else is left. Never the newest entry, which was just added.
local function trim(entries)
  if #entries <= BL.MAX then return end
  for i = 1, #entries - 1 do
    if entries[i].kind ~= "mark" then return table.remove(entries, i) end
  end
  table.remove(entries, 1)
end

-- A new entry at the end of the log, of `kind` with `text`, carrying the facts of this moment and, for a
-- detailed kind, the snapshot.
local function add(store, kind, text)
  local e, snap = safeContext(), DETAILED[kind] and snapshotNow() or {}
  e.kind, e.text, e.count, e.first, e.last, e.session = kind, text, 0, stamp(), stamp(), store.sessions
  e.state, e.layout, e.trail = snap.state, snap.layout, snap.trail
  store.entries[#store.entries + 1] = e
  trim(store.entries)
  return e
end

-- A quiet fallback and a loud error with the same text are one entry: Core/Events.lua turns a quiet
-- one loud when the same text is later reported.
local FAMILY = { quiet = "error" }

-- The log's entry of this kind (or its family) and text made by this version of the addon, or nil: the
-- same error after an update is a new entry, so a fix that didn't hold shows.
local function find(store, kind, text)
  local version, family = ns.AddonVersion(), FAMILY[kind] or kind
  for _, e in ipairs(store.entries) do
    if (FAMILY[e.kind] or e.kind) == family and e.text == text and e.version == version then return e end
  end
end

-- Passive collection --------------------------------------------------------------------------
-- The log watches each thing Core/Events.lua keeps (an ns.errors, ns.blocked or ns.paused entry, a note's
-- line) from the look that first sees it until the look after it has left its list, so the count an
-- error reached before /vg errors clear, or before newer errors pushed it out, is still logged.

-- What is watched, in the order first seen: { key = the kept thing, kind = how READ reads it }.
local watching = {}
-- How much of each watched thing's count the log has taken so far.
local logged = {}
-- How many screenshots of new errors this session has taken, and whether one waits for the next frame.
local shots, shotWaiting = 0, false

-- What a watched thing is in the log, by the kind it is watched under: its entry's kind, its text and
-- this session's count so far.
local READ = {
  -- A caught error: "quiet" while it is only a client call that refused a value and fell back.
  error = function(e) return e.quiet and "quiet" or "error", e.text, e.count end,
  -- A call the game blocked or refused.
  blocked = function(e) return "blocked", e.text, e.count end,
  -- A part paused after repeated errors: once, under its site.
  paused = function(p) return "paused", tostring(p.where), 1 end,
  -- A line of what was left off: once.
  note = function(line) return "note", line, 1 end,
}

-- Takes the screenshot that was asked for.
local function takeShot()
  shotWaiting = false
  Screenshot()
end

-- Asks the client for one screenshot on the next frame, however many ask before then; whether this ask
-- is that frame's first.
local function shootSoon()
  local first = not shotWaiting
  shotWaiting = true
  ns.Soon("bug log screenshot", takeShot)
  return first
end

-- A screenshot with a new loud error, while the switch is on and the session has taken fewer than
-- BL.SHOTS_MAX; errors new in the same frame share one.
local function shootError(store, e)
  if e.kind ~= "error" or not store.shots or shots >= BL.SHOTS_MAX then return end
  e.shot = true
  if shootSoon() then shots = shots + 1 end
end

-- A new entry for a watched thing: an error's gets the top of its stack, and a screenshot when asked.
local function addWatched(store, kind, text, key)
  local e = add(store, kind, text)
  local stack = type(key) == "table" and ns.PlainText(key.stack)
  if stack then e.stack = stack:sub(1, BL.STACK_MAX) end
  shootError(store, e)
  return e
end

-- Brings one watched thing into the log: its entry is made when new, and grows by what came since the
-- last look. A quiet entry turns into an error when its text is now reported loudly.
local function logWatched(store, w)
  local kind, text, count = READ[w.kind](w.key)
  local grown = count - logged[w.key]
  if grown <= 0 then return end
  logged[w.key] = count
  local e = find(store, kind, text) or addWatched(store, kind, text, w.key)
  if e.kind == "quiet" then e.kind = kind end
  e.count, e.last, e.session = e.count + grown, stamp(), store.sessions
end

-- Starts watching what a list keeps now and was not watched yet, under `kind`; marks all of it live.
local function watch(list, kind, live)
  for _, key in ipairs(list) do
    live[key] = true
    if logged[key] == nil then logged[key], watching[#watching + 1] = 0, { key = key, kind = kind } end
  end
end

-- Everything kept now, watched: { [kept thing] = true }.
local function watchLive()
  local live = {}
  watch(ns.errors, "error", live)
  watch(ns.blocked, "blocked", live)
  watch(ns.paused, "paused", live)
  watch(ns.notes, "note", live)
  return live
end

-- Brings everything kept this session into the log: the errors, the calls the game blocked, the parts
-- paused after repeated errors and what was left off. What has left its list since the last look is
-- logged a last time and let go. Nothing before the saved variables load.
function BL.Sync()
  local store = BL.Store()
  if not store then return end
  local live, still = watchLive(), {}
  snapshot = nil
  for _, w in ipairs(watching) do
    logWatched(store, w)
    if live[w.key] then still[#still + 1] = w else logged[w.key] = nil end
  end
  watching = still
end

-- A blocked call is kept without telling the error watchers, so it is brought in on the next frame.
local function syncSoon()
  ns.Soon("bug log", BL.Sync)
end

ns.OnErrorsChanged(BL.Sync)
ns.On("ADDON_ACTION_BLOCKED", syncSoon)
ns.On("ADDON_ACTION_FORBIDDEN", syncSoon)
ns.On("PLAYER_LOGIN", BL.Sync)
ns.On("PLAYER_LOGOUT", BL.Sync)

-- Note a bug ----------------------------------------------------------------------------------

-- Notes a bug by hand: the player's words (the first BL.NOTE_MAX characters) with the facts and snapshot of
-- this moment, what the mouse is over (`mouse`, or read now) and how many errors this session has kept,
-- after everything caught so far, so those sit before the note. The client takes a screenshot on the next
-- frame, once the note's box has closed.
function BL.Mark(note, mouse)
  BL.Sync()
  local e = add(BL.Store(), "mark", ns.TextPrefix(ns.PlainText(note) or "(no words)", BL.NOTE_MAX))
  e.count, e.errors, e.shot, e.mouse = 1, #ns.errors, true, mouse or part("mouse", mouseLines)
  shootSoon()
  ns.Chat(L["Bug noted, with a screenshot. The log is saved when you log out or reload."])
end

-- A box for what went wrong; its Note button closes it and keeps the words with `mouse`, the lines on
-- what the mouse was over.
local function ask(mouse)
  ns.AskText(L["What went wrong? A few words, then Note"], function(text)
    ns.HideText()
    BL.Mark(text, mouse)
  end, L["Note"])
end

-- The Feedback page's Note a bug: the box. The mouse is on that button, so what it is over says nothing.
function BL.Ask()
  ask({ "not read (noted from the Feedback page)" })
end

-- /vg bug [words]: notes a bug with those words; with none, opens the box to type them, with what the
-- mouse is over read now, before it moves to the box.
function BL.Command(rest)
  if rest == "" then return ask(part("mouse", mouseLines)) end
  BL.Mark(rest)
end

-- Reading and clearing ------------------------------------------------------------------------

-- The fields of an entry its line in the window shows after its kind and count, in order.
local SHOWN_FIELDS = { "last", "version", "who", "zone", "instance" }

-- One entry's lines for the window: its number, kind and count, then its last time, version, character,
-- place and instance kind and whether a fight was on when it was first met ("?" for what an entry lacks);
-- then its text.
local function entryLines(i, e)
  local parts = { string.format("[%d] %s  x%s", i, tostring(e.kind), tostring(e.count)) }
  for _, field in ipairs(SHOWN_FIELDS) do parts[#parts + 1] = tostring(e[field] or "?") end
  parts[#parts + 1] = e.combat == nil and "?" or (e.combat and "in a fight" or "out of a fight")
  return table.concat(parts, "  ·  "), "    " .. tostring(e.text)
end

-- The log as text for the copy window (a diagnostic, so not translated): a heading, then the newest
-- BL.SHOWN entries with the newest last. Stacks and snapshots stay in the saved file.
function BL.Text()
  local entries = BL.Store().entries
  local shown = math.min(#entries, BL.SHOWN)
  local count = string.format("%d kept, the newest %d listed, newest last. The saved file has each one's stack and snapshot.", #entries, shown)
  local lines = { "### Vanguard bug log ###", count }
  for i = #entries - shown + 1, #entries do
    local head, text = entryLines(i, entries[i])
    lines[#lines + 1], lines[#lines + 2] = head, text
  end
  return ns.Literal(table.concat(lines, "\n"))
end

-- Open the bug log: everything caught so far brought in, then the log in the copy window, opened on its newest entry.
function BL.Show()
  BL.Sync()
  ns.ShowTextAtEnd(L["Vanguard bug log: Ctrl+C to copy"], BL.Text())
end

-- Empties the log for good. What this session caught so far is counted as logged first, so it doesn't
-- come straight back; /vg errors still lists it.
function BL.Clear()
  BL.Sync()
  BL.Store().entries = {}
  ns.Chat(L["Bug log cleared."])
end

-- Clear the bug log: asks first, since the entries are lost for good.
function BL.AskClear()
  ns.Ask(L["Clear the bug log? Every entry in it is lost."], L["Clear"], BL.Clear, function() end, "danger")
end

-- The Screenshot each new error switch's value, and its setter.
local function shotsOn() return BL.Store().shots end
-- Sets the Screenshot each new error switch.
local function setShots(on) BL.Store().shots = on == true end

-- The Feedback page's Bug log card: note a bug, read the log, empty it, and the screenshot switch.
function BL.Rows()
  return {
    { "header", L["Bug log"] },
    { "text", L["Vanguard keeps the errors it catches after you log out, each with where you were and how the UI stood."] },
    { "text", L["Note a bug adds your own words and a screenshot; /vg bug also notes what the mouse is over."] },
    { "button", L["Note a bug"], BL.Ask },
    { "button", L["Open the bug log"], BL.Show },
    { "button", L["Clear the bug log..."], BL.AskClear },
    { "check", L["Screenshot each new error"], shotsOn, setShots, false },
  }
end
