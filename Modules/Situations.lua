-- Situations: a different layout and settings for Solo, Party, Raid, PvP,
-- Instance and Resting. One situation holds at a time, the first of: pvp (a
-- battleground or arena), instance (a dungeon or raid instance), raid, party,
-- resting, solo. Its override, if it has one, goes over the profile's own
-- values (the base) out of combat, and comes off again when you leave it.
--
-- You record an override as you'd set things up anyway: Record for Raid,
-- drag frames and flip settings with their own handles and options, then
-- Stop recording: only what changed is kept, and the base goes back. An
-- override holds mover spots (point, scale, opacity, and a frame's links: what
-- it's anchored to, the sizes it matches, its own size) and the allowlisted
-- live settings in SI.LIVE; nothing else is recorded or applied.
--
-- Applying writes through the movers' and the modules' own setters, so the
-- frames and modules see the override as they'd see a change of yours. The
-- values it replaced are kept for the session (SI.base, with the tables they
-- came from) and written back at logout and for an export, so the profile is
-- saved and exported with its own values, never an override's.

local ADDON, ns = ...
local L = ns.L

local SI = ns.Module("Situations", { defaults = { enabled = true, overrides = {} } })

-- The situations, in precedence order (the first that holds is the one you're in), and their names.
SI.NAMES = { "pvp", "instance", "raid", "party", "resting", "solo" }
SI.LABELS = { pvp = L["PvP"], instance = L["Instance"], raid = L["Raid"], party = L["Party"], resting = L["Resting"], solo = L["Solo"] }
-- The options' Record for choices.
SI.CHOICES = { { "off", L["Off"] }, { "solo", SI.LABELS.solo }, { "party", SI.LABELS.party }, { "raid", SI.LABELS.raid }, { "pvp", SI.LABELS.pvp }, { "instance", SI.LABELS.instance }, { "resting", SI.LABELS.resting } }
-- The client's instance types (ns.Where) that are a situation of their own.
SI.KINDS = { pvp = "pvp", arena = "pvp", party = "instance", raid = "instance" }
-- The settings an override may hold: each module's keys that its apply functions
-- (run once after the writes) re-read at once. Keys that need a reload are left out.
SI.LIVE = {
  InfoStrip = { keys = { "visibility", "showWhen", "durability", "bags", "system", "gold", "ammo", "clock", "shards", "xprate", "leveltime", "goldrate", "dps", "rank", "ahgold", "date" }, apply = { "ApplyVisibility", "UpdateAll" } },
  MenuStrip = { keys = { "menu", "menuWhen" }, apply = { "ApplyVisibility" } },
  DataBars = { keys = { "visibility", "showWhen" }, apply = { "ApplyVisibility" } },
  Nameplates = { keys = { "level", "threat", "targetBorder", "questMarks" }, apply = { "RefreshAll" } },
  UnitFrames = { keys = { "calm", "calmFrames", "calmBars", "calmAuras", "calmStrips", "calmXP", "calmMeter", "calmMinimap" }, apply = { "ApplyCalm" } },
}
-- The live modules in the order the status line names them, and the names it uses.
SI.ORDER = { "InfoStrip", "MenuStrip", "DataBars", "Nameplates", "UnitFrames" }
SI.MODULE_LABELS = { InfoStrip = L["info strip"], MenuStrip = L["menu bar"], DataBars = L["XP bars"], Nameplates = L["nameplates"], UnitFrames = L["unit frames"] }
-- The events after which you may be somewhere else.
SI.EVENTS = { "GROUP_ROSTER_UPDATE", "PLAYER_ENTERING_WORLD", "ZONE_CHANGED_NEW_AREA", "PLAYER_UPDATE_RESTING" }

-- module -> { key = true } from SI.LIVE.
local ALLOWED = {}
for module, live in pairs(SI.LIVE) do
  ALLOWED[module] = {}
  for _, key in ipairs(live.keys) do ALLOWED[module][key] = true end
end

-- Whether an override can hold a module's setting (one in SI.LIVE).
function SI.Holds(module, key)
  return ALLOWED[module] ~= nil and ALLOWED[module][key] == true
end

-- Stands for a setting that was unset in the base (a table can't hold nil).
local NONE = {}

-- Values ---------------------------------------------------------------------------------------

-- t when it is a table, else an empty one (saved data may have been edited by hand).
local function tbl(t)
  return type(t) == "table" and t or {}
end

-- This profile's Situations settings (read each time: a profile change replaces the table).
local function db()
  return ns.Settings("Situations", SI.defaults)
end

-- A value to write: a copy of a table (so an override's own stays apart), nil for NONE.
local function value(v)
  if v == NONE then return nil end
  return type(v) == "table" and ns.Copy(v) or v
end

-- Whether two values are the same (tables compared key by key, both ways).
local function same(a, b)
  if type(a) ~= "table" or type(b) ~= "table" then return a == b end
  for k, v in pairs(a) do
    if not same(v, b[k]) then return false end
  end
  for k in pairs(b) do
    if a[k] == nil then return false end
  end
  return true
end

-- True when the client's yes-or-no query exists and says yes (these answers are never secret).
local function yes(query)
  return type(query) == "function" and query() == true
end

-- The situation you're in (one of SI.NAMES), never nil.
function SI.Where()
  local kind = SI.KINDS[ns.Where()]
  if kind then return kind end
  if yes(IsInRaid) then return "raid" end
  if yes(IsInGroup) then return "party" end
  return yes(IsResting) and "resting" or "solo"
end

-- The settings table a live module reads, or nil while it isn't running.
local function moduleTable(module)
  local def = ns.GetModule(module)
  if def and def.enabled then return ns.Settings(module, def.defaults) end
end

-- A live setting's value now (NONE while unset), or nil while its module isn't running.
local function liveValue(module, key)
  local t = moduleTable(module)
  if not t then return nil end
  if t[key] == nil then return NONE end
  return value(t[key])
end

-- Writes one live setting into the table its module reads.
local function setLive(module, key, v)
  moduleTable(module)[key] = value(v)
end

-- Snapshots --------------------------------------------------------------------------------------

-- A copy of a link table in a saved spot (rel, match), or nil.
local function link(t)
  return type(t) == "table" and ns.Copy(t) or nil
end

-- Every mover's saved spot as plain fields ({} for one at its default), with its links (Core/MoverLinks.lua).
local function spotsNow()
  local out, saved = {}, ns.Settings("positions")
  for _, m in ipairs(ns.MoverList()) do
    local p = tbl(saved[m.key])
    out[m.key] = { point = p.point, relPoint = p.relPoint, x = p.x, y = p.y, scale = p.scale, alpha = p.alpha,
      rel = link(p.rel), match = link(p.match), w = p.w, h = p.h }
  end
  return out
end

-- Every allowlisted setting of the running modules: module -> { key = value }.
local function settingsNow()
  local out = {}
  for module, live in pairs(SI.LIVE) do
    if moduleTable(module) then
      out[module] = {}
      for _, key in ipairs(live.keys) do out[module][key] = liveValue(module, key) end
    end
  end
  return out
end

-- The tables those values live in: positions, and each running module's settings.
local function refsNow()
  local refs = { positions = ns.Settings("positions") }
  for module in pairs(SI.LIVE) do refs[module] = moduleTable(module) end
  return refs
end

-- What an override can change, as it is now: { positions = { key = spot }, settings = { module = { key = value } } },
-- with the tables they were read from (refs), so they can be written back even once the profile's tables are replaced.
function SI.Snapshot()
  return { positions = spotsNow(), settings = settingsNow(), refs = refsNow() }
end

-- Puts v at t[a][b], making t[a] as needed.
local function put(t, a, b, v)
  t[a] = t[a] or {}
  t[a][b] = v
end

-- The settings of one module that differ from before to after go into the override (an unset one can't be recorded).
local function diffModule(ov, module, after, before)
  for key, v in pairs(after) do
    if v ~= NONE and not same(v, before[key]) then
      ov.settings = ov.settings or {}
      put(ov.settings, module, key, v)
    end
  end
end

-- Only what changed from one snapshot to another, as an override: { positions, settings }; nil when nothing did.
function SI.Diff(before, after)
  local ov = {}
  for key, spot in pairs(after.positions) do
    if not same(spot, before.positions[key]) then put(ov, "positions", key, spot) end
  end
  for module, values in pairs(after.settings) do diffModule(ov, module, values, tbl(before.settings[module])) end
  return next(ov) and ov or nil
end

-- The part of a snapshot an override touches (the values it replaces), with the snapshot's tables.
function SI.Pick(snap, ov)
  local out = { positions = {}, settings = {}, refs = snap.refs }
  for key in pairs(tbl(ov.positions)) do out.positions[key] = snap.positions[key] end
  for module, values in pairs(tbl(ov.settings)) do
    local now = tbl(snap.settings[module])
    for key in pairs(tbl(values)) do
      if now[key] ~= nil then put(out.settings, module, key, now[key]) end
    end
  end
  return out
end

-- Counting -------------------------------------------------------------------------------------

-- How many allowlisted settings of a module an override holds.
local function countSettings(ov, module)
  local n = 0
  for key in pairs(tbl(tbl(ov.settings)[module])) do
    if ALLOWED[module][key] then n = n + 1 end
  end
  return n
end

-- How many things an override changes, and what, for the status line: "2 frames", then each module's name.
function SI.Count(ov)
  local frames, parts = 0, {}
  for _ in pairs(tbl(ov.positions)) do frames = frames + 1 end
  if frames > 0 then parts[1] = frames == 1 and L["1 frame"] or ns.Format(L["{count} frames"], { count = frames }) end
  local n = frames
  for _, module in ipairs(SI.ORDER) do
    local c = countSettings(ov, module)
    if c > 0 then n, parts[#parts + 1] = n + c, SI.MODULE_LABELS[module] end
  end
  return n, parts
end

-- A situation's override, or nil when it has none (or nothing in it it could apply).
function SI.Override(name)
  local ov = tbl(db().overrides)[name]
  if type(ov) == "table" and SI.Count(ov) > 0 then return ov end
end

-- "3 overrides (2 frames, info strip)", or "no overrides".
function SI.Describe(ov)
  if not ov then return L["no overrides"] end
  local n, parts = SI.Count(ov)
  return ns.Format(n == 1 and L["1 override ({changes})"] or L["{count} overrides ({changes})"], { count = n, changes = table.concat(parts, ", ") })
end

-- Applying -------------------------------------------------------------------------------------

-- Puts a mover at a spot with the movers' own setters: its default first, then the spot's point
-- (where an anchored frame lands while the frame it's anchored to isn't there), links, scale and opacity.
local function placeSpot(key, spot)
  if not ns.MoverFrame(key) or type(spot) ~= "table" then return end
  ns.ResetMovers(key)
  if spot.point then ns.SetMoverPoint(key, spot.point, spot.relPoint, spot.x or 0, spot.y or 0) end
  ns.RestoreMoverLinks(key, spot)
  if spot.scale then ns.SetMoverScale(key, spot.scale) end
  if spot.alpha then ns.SetMoverAlpha(key, spot.alpha) end
end

-- Writes a module's allowlisted values (any other key is refused), then runs its apply functions once.
local function writeModule(module, values)
  if not ALLOWED[module] or not moduleTable(module) then return end
  for key, v in pairs(tbl(values)) do
    if ALLOWED[module][key] then setLive(module, key, v) end
  end
  local def = ns.GetModule(module)
  for _, fn in ipairs(SI.LIVE[module].apply) do def[fn]() end
end

-- Writes a set of values (an override, or the base) and applies it: spots, then settings.
local function write(values)
  for key, spot in pairs(tbl(values.positions)) do placeSpot(key, spot) end
  for module, settings in pairs(tbl(values.settings)) do writeModule(module, settings) end
end

-- Puts an override on screen, keeping what it replaces as the base (unless one is kept already, as while recording).
function SI.ApplyOverride(ov)
  SI.base = SI.base or SI.Pick(SI.Snapshot(), ov)
  write(ov)
end

-- Puts the base back on screen (what the override replaced) and forgets it.
function SI.RestoreBase()
  local base = SI.base
  SI.base = nil
  if base then write(base) end
end

-- Writes a set of values (a snapshot or a part of one) into the tables they were read from, without touching the screen.
local function putValues(set)
  for key, spot in pairs(set.positions) do set.refs.positions[key] = next(spot) and ns.Copy(spot) or nil end
  for module, values in pairs(set.settings) do
    for key, v in pairs(values) do set.refs[module][key] = value(v) end
  end
end

-- Writes the base's values back into the tables they were read from, without touching the screen:
-- at logout (the profile is saved with its own values) and when the profile's tables are replaced.
function SI.PutBack()
  if SI.base then putValues(SI.base) end
end

-- Packs a call's results with their count.
local function pack(...)
  return { n = select("#", ...), ... }
end

-- Runs fn(...) with the profile holding its own values, as an export must (Core/Profiles.lua): what the
-- active override (or a recording) changed is taken out of the profile's tables for the call and put back after.
function ns.OwnValues(fn, ...)
  if not SI.base then return fn(...) end
  local now = SI.Pick(SI.Snapshot(), SI.base)
  SI.PutBack()
  local out = pack(fn(...))
  putValues(now)
  return unpack(out, 1, out.n)
end

-- Puts the active situation's override on screen, the last one's base back first: nothing
-- while recording or while the module is off under Modules (nothing would take it off again),
-- nothing new while the right one is on. Run out of combat.
function SI.Apply()
  if SI.recording or not SI.settings then return end
  local name = SI.Where()
  local ov = db().enabled and SI.Override(name) or nil
  local want = ov and name or nil
  if want == SI.applied then return end
  SI.RestoreBase()
  SI.applied = want
  if ov then SI.ApplyOverride(ov) end
end

-- Re-reads the options widgets while the window is open; opening it re-reads them anyway, and
-- a raid forming fires enough roster events that re-reading a closed window costs a frame.
local function refreshShownOptions()
  local window = ns.Options.Frame()
  if window and window:IsShown() then ns.Options.Refresh() end
end

-- Applies the situation on the next frame (a burst of roster or zone events is one), out of combat, and updates the page.
-- The page is always dropped: its rows name the situation you're in when they're built.
function SI.Refresh()
  ns.Soon("situations", function()
    ns.OutOfCombat(SI.Apply, "situations")
    refreshShownOptions()
    ns.Options.RebuildPage("situations")
  end)
end

-- Recording ------------------------------------------------------------------------------------

-- Starts recording a situation's override: the base is kept, that situation's override shows, and
-- what you change until SI.StopRecording is kept. Refused in combat (like unlocking). True when started.
function SI.StartRecording(name)
  if not SI.LABELS[name] or ns.InCombat() then return false end
  if SI.recording then SI.StopRecording() end
  SI.RestoreBase()
  SI.applied, SI.base, SI.recording = nil, SI.Snapshot(), name
  write(tbl(tbl(db().overrides)[name]))
  ns.SetMoverSuffix(ns.Format(L[" · recording {situation}"], { situation = SI.LABELS[name] }))
  return true
end

-- Stops recording: what differs from the base is saved as the situation's override (nothing clears it),
-- the base goes back, and the active situation's override applies. Returns false when not recording, else true and the override.
function SI.StopRecording()
  local name = SI.recording
  if not name then return false end
  local ov = SI.Diff(SI.base, SI.Snapshot())
  db().overrides[name] = ov
  SI.base, SI.recording = SI.Pick(SI.base, ov or {}), nil
  SI.RestoreBase()
  ns.SetMoverSuffix(nil)
  ns.OutOfCombat(SI.Apply, "situations")
  return true, ov
end

-- Forgets a situation's override; the active one comes off the screen (out of combat), and the Situations page,
-- if built, is built again.
function SI.Clear(name)
  db().overrides[name] = nil
  ns.OutOfCombat(SI.Apply, "situations")
  ns.Options.RebuildPage("situations")
end

-- At logout: a recording is saved, and the profile gets its own values back before it is written to disk.
function SI.Logout()
  if SI.recording then SI.StopRecording() end
  SI.PutBack()
end
ns.On("PLAYER_LOGOUT", SI.Logout)

-- The profile's tables were replaced (copied, reset, imported): the base goes back into the tables it came
-- from and is forgotten, a recording stops unsaved, and the profile's own override applies.
function SI.ProfileChanged()
  SI.PutBack()
  if SI.recording then ns.SetMoverSuffix(nil) end
  SI.base, SI.applied, SI.recording = nil, nil, nil
  if SI.settings then SI.Refresh() end
end
ns.OnProfileChanged(SI.ProfileChanged)

-- Commands and options ---------------------------------------------------------------------------

-- The page's status line while the module is off under Modules.
SI.OFF_TEXT = L["Situations is off under Modules: overrides don't apply."]

-- The page's status line: the situation you're in and what its override changes, or what's being recorded.
function SI.StatusText()
  if not SI.settings then return SI.OFF_TEXT end
  if SI.recording then
    return ns.Format(L["Recording for {situation}: move frames and change settings, then stop recording."], { situation = SI.LABELS[SI.recording] })
  end
  local name = SI.Where()
  return ns.Format(L["Now: {situation} · {overrides}"], { situation = SI.LABELS[name], overrides = SI.Describe(SI.Override(name)) })
end

-- Prints where you are and every situation's override.
function SI.List()
  ns.Chat(SI.StatusText())
  for _, name in ipairs(SI.NAMES) do
    local ov = SI.Override(name)
    if ov then ns.Chat(SI.LABELS[name] .. ": " .. SI.Describe(ov)) end
  end
end

-- What a command with an unknown situation says.
SI.UNKNOWN = L["Situations: solo, party, raid, pvp, instance or resting."]

-- Starts recording from a command or the options, and says how it went.
local function record(name)
  if not SI.LABELS[name] then return ns.Chat(SI.UNKNOWN) end
  if not SI.StartRecording(name) then return ns.Chat(L["Recording waits until combat ends."]) end
  ns.Chat(ns.Format(L["Recording for {situation}: move frames (/vg unlock) and change settings, then /vg situation stop."], { situation = SI.LABELS[name] }))
  ns.Options.RebuildPage("situations")
end

-- Stops recording from a command or the options, and says what was kept.
local function stop()
  local name = SI.recording
  local stopped, ov = SI.StopRecording()
  if not stopped then return ns.Chat(L["Not recording."]) end
  ns.Chat(ns.Format(L["{situation}: {overrides} saved."], { situation = SI.LABELS[name], overrides = SI.Describe(ov and SI.Override(name)) }))
  ns.Options.RebuildPage("situations")
end

-- Clears a situation's override (the active one's without a name) from a command, and says so.
local function clear(name)
  name = name ~= "" and name or SI.Where()
  if not SI.LABELS[name] then return ns.Chat(SI.UNKNOWN) end
  SI.Clear(name)
  ns.Chat(ns.Format(L["Cleared the overrides for {situation}."], { situation = SI.LABELS[name] }))
end

-- /vg situation [record <name> | stop | clear [name] | list].
function SI.Command(rest)
  local verb, arg = (rest or ""):lower():match("^(%S*)%s*(.-)$")
  if verb == "record" then return record(arg) end
  if verb == "stop" then return stop() end
  if verb == "clear" then return clear(arg) end
  if verb == "" or verb == "list" then return SI.List() end
  ns.Chat(L["Usage: /vg situation [record <name> | stop | clear [name] | list]"])
end

-- The Record for choice: the situation being recorded, or "off".
function SI.GetRecording()
  return SI.recording or "off"
end

-- Picks Record for: a situation starts recording it (stopping, and saving, any other); Off stops and saves.
function SI.SetRecording(name)
  if name == "off" then stop() else record(name) end
end

-- What the page says first, as one note.
SI.INTRO = L["Overrides for Solo, Party, Raid, PvP, Instance and Resting: frame spots, scale, opacity, visibility, info strip blocks and nameplate switches, applied out of combat. A change to something the active override sets lasts until you leave the situation."]
-- What the Your situations card says with no override yet.
SI.EMPTY = L["No overrides yet. Pick Record for to make one."]

-- What an override can hold, in plain words: each live module's settings (SI.ORDER), after frames.
SI.HOLDS = {
  InfoStrip = L["Info strip: when it shows, and each of its blocks."],
  MenuStrip = L["Menu bar: when it shows."],
  DataBars = L["XP bars: when they show."],
  Nameplates = L["Nameplates: levels, threat colors, target border and quest marks."],
  UnitFrames = L["Calm HUD: whether it is on, and what each part does."],
}
-- What the page says about every other setting.
SI.ELSEWHERE = L["Everything else, including any setting that needs a reload, changes your base profile even while recording. While recording, most of them are dimmed and say so when you point at them."]

-- Adds the card that says what an override can hold, and what it can't, to a page's rows; returns them.
function SI.HoldRows(rows)
  rows[#rows + 1] = { "header", L["What an override holds"] }
  rows[#rows + 1] = { "text", L["Frame spots, scale and opacity (move frames with /vg unlock)."] }
  for _, module in ipairs(SI.ORDER) do rows[#rows + 1] = { "text", SI.HOLDS[module] } end
  rows[#rows + 1] = { "text", SI.ELSEWHERE }
  return rows
end

-- Whether a situation's Clear can be clicked: not while it is being recorded or the frames are unlocked.
local function clearable(name)
  return SI.recording ~= name and not ns.Unlocked()
end

-- One situation's override on the Your situations card: "Raid (now): 2 overrides (...)", then its Clear.
-- (The page is built again when you move between situations, record, stop or clear.)
local function situationRows(rows, name, ov, now)
  local label = name == now and ns.Format(L["{situation} (now)"], { situation = SI.LABELS[name] }) or SI.LABELS[name]
  rows[#rows + 1] = { "text", label .. ": " .. SI.Describe(ov) }
  rows[#rows + 1] = { "button", ns.Format(L["Clear {situation}"], { situation = SI.LABELS[name] }), function() clear(name) end, function() return clearable(name) end }
end

-- The Your situations card: every situation with an override, in precedence order, or a line saying there are none.
local function yourRows(rows)
  local before, now = #rows, SI.Where()
  rows[#rows + 1] = { "header", L["Your situations"] }
  for _, name in ipairs(SI.NAMES) do
    local ov = SI.Override(name)
    if ov then situationRows(rows, name, ov, now) end
  end
  if #rows == before + 1 then rows[#rows + 1] = { "text", SI.EMPTY } end
  return rows
end

-- The Situations page's rows.
function SI.Rows()
  return SI.HoldRows(yourRows({
    { "header", L["Situations"] }, { "text", SI.INTRO, "note" },
    { "check", L["Apply situation overrides"], function() return db().enabled end, function(v) db().enabled = v SI.Refresh() end, true },
    { "text", SI.StatusText },
    { "cycle", L["Record for"], SI.CHOICES, SI.GetRecording, SI.SetRecording, "off" },
    { "button", L["Stop recording and save"], stop, function() return SI.recording ~= nil end },
  }))
end

ns.Options.AddPage({ key = "situations", title = L["Situations"], icon = "NavSituations", order = 86, rows = SI.Rows })

-- Module entry point (Core/Modules.lua): follows where you are, and applies the override for it.
function SI.Enable(settings)
  SI.settings = settings
  for _, event in ipairs(SI.EVENTS) do ns.On(event, SI.Refresh) end
  SI.Refresh()
end
