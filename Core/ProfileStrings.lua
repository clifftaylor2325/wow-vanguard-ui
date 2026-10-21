-- Profile strings as a public API, under Core/Profiles.lua's export and import:
-- the format number and addon version every string carries, the parts a string
-- can hold (layout, Situations overrides, global settings, each module), an
-- older string upgraded (its tables through ns.Migrate) before anything is saved,
-- a partial string merged into the profile key by key, the profile a whole
-- string matches, the fonts and bar textures a string names that this client
-- lacks, and a large string imported a frame's work at a time.

local ADDON, ns = ...

local S = ns.Serialize

-- The string format this version writes and reads. 1: no format field (Vanguard 0.5.0
-- and older, ForeverUI's FUI1 strings); a module's string held that module's table alone,
-- under the module's name as its scope. 2: format and addonVersion in every payload; a
-- partial string has the scope "parts", its tables, and the list of parts it holds.
ns.PROFILE_FORMAT = 2

-- Keys a payload carries beside the settings tables: never saved into a profile.
local META = { format = true, addonVersion = true, parts = true, display = true }

-- Settings that record this computer's own state rather than a choice, by table: they never go in a
-- string, and a string's are dropped as it is read, so they never reach another client.
-- Graphics.undo: the game settings /vg graphics apply changed here, which its undo puts back.
-- Bags.applied and Bags.prior: what Vanguard set the game's combined bags to here, and the player's value before.
-- Quiet.cameraPrior: the player's own furthest camera zoom here, from before Vanguard first changed it.
-- Chat.sized and Chat.widened: whether the chat window got its first size, from before those flags
-- moved to each character's own file.
local CLIENT_STATE = { Graphics = { undo = true }, Bags = { applied = true, prior = true }, Quiet = { cameraPrior = true }, Chat = { sized = true, widened = true } }

-- The group parts, in the export panel's order, and what it calls them. Every other
-- table is a module's own part (its name), or global when no module goes by its name.
local GROUPS = { "layout", "situations", "global" }
ns.PART_LABELS = { layout = "Layout (positions and movers)", situations = "Situations overrides", global = "Global settings (theme, modules list, skins)" }
-- The tables in the layout and situations parts.
local KEY_PART = { positions = "layout", movers = "layout", editMode = "layout", Situations = "situations" }
-- Core tables a module string from before format 2 may hold, besides a module's.
local CORE = { theme = true, modules = true, skins = true, positions = true, movers = true, editMode = true }

-- How many levels deep a table merges key by key; below that the string's table replaces
-- the local one whole (a frame's spot, a situation's override). Lists are always replaced.
local MERGE_DEPTH = { positions = 1, Situations = 2 }
local DEEP = 20

-- Parts ------------------------------------------------------------------------------------

-- The part a profile table belongs to: layout, situations, its module's own, or global.
local function partOf(key)
  if KEY_PART[key] then return KEY_PART[key] end
  return ns.GetModule(key) and key or "global"
end

-- The module parts the profile has tables for, sorted, after the group parts it has.
local function orderedParts(has)
  local list, modules = {}, {}
  for _, group in ipairs(GROUPS) do
    if has[group] then list[#list + 1] = group end
  end
  for part in pairs(has) do
    if not ns.PART_LABELS[part] then modules[#modules + 1] = part end
  end
  table.sort(modules)
  for _, m in ipairs(modules) do list[#list + 1] = m end
  return list
end

-- The parts the profile (the active one when nil) has settings in: the group parts, then
-- each module with saved settings, by name.
function ns.ProfileParts(profile)
  local has = {}
  for key in pairs(profile or ns.Profile()) do
    if type(key) == "string" then has[partOf(key)] = true end
  end
  return orderedParts(has)
end

-- The part a typed name stands for (any case): a group part, or a table the profile has.
local function findPart(name, profile)
  local lower = type(name) == "string" and name:lower() or ""
  if ns.PART_LABELS[lower] then return lower end
  for key in pairs(profile) do
    if type(key) == "string" and key:lower() == lower then return key end
  end
end

-- True when parts names every part the profile has settings in.
local function everyPart(parts, profile)
  local named = {}
  for _, p in ipairs(parts) do named[p] = true end
  for _, p in ipairs(ns.ProfileParts(profile)) do
    if not named[p] then return false end
  end
  return true
end

-- What an export asks for: nil for the whole profile (scope nil or "profile", or a list
-- naming every part it has), else the list of parts (scope a part's name or a list of
-- names, matched in any case). A name the profile has nothing for comes back second.
function ns.FindParts(scope, profile)
  if scope == nil or scope == "profile" then return nil end
  local parts = {}
  for _, name in ipairs(type(scope) == "table" and scope or { scope }) do
    local part = findPart(name, profile)
    if not part then return nil, tostring(name) end
    parts[#parts + 1] = part
  end
  if everyPart(parts, profile) then return nil end
  return parts
end

-- Payloads ---------------------------------------------------------------------------------

-- The addon version from the TOC, or "?".
local function addonVersion()
  local get = (C_AddOns and C_AddOns.GetAddOnMetadata) or GetAddOnMetadata
  return type(get) == "function" and get(ADDON, "Version") or "?"
end

-- Adds the format and addon version every string carries to a payload; returns it.
function ns.StampPayload(data)
  data.format, data.addonVersion = ns.PROFILE_FORMAT, addonVersion()
  return data
end

-- A partial string's payload: the profile's tables in those parts (a part may also be a
-- table's own name, as "theme"), the list of parts, the format and version.
function ns.PartsPayload(profile, parts)
  local want, data = {}, { parts = parts }
  for _, p in ipairs(parts) do want[p] = true end
  for key, t in pairs(profile) do
    if want[key] or want[partOf(key)] then data[key] = t end
  end
  return ns.StampPayload(ns.WithoutClientState(data))
end

-- A copy of t without the keys in leave.
local function without(t, leave)
  local out = {}
  for k, v in pairs(t) do
    if not leave[k] then out[k] = v end
  end
  return out
end

-- Leaves this computer's own state (CLIENT_STATE) out of a payload or a top-level copy of a profile:
-- each table holding some is replaced by a copy without it, so the profile's tables are untouched. Returns data.
function ns.WithoutClientState(data)
  for key, leave in pairs(CLIENT_STATE) do
    if type(data[key]) == "table" then data[key] = without(data[key], leave) end
  end
  return data
end

-- Takes the payload's own keys (format, version, parts, display) out; returns it.
function ns.StripPayload(data)
  for key in pairs(META) do data[key] = nil end
  return data
end

-- The parts a partial payload says it holds, as text ("layout, theme").
function ns.PartsText(data)
  local names = {}
  for _, p in ipairs(type(data.parts) == "table" and data.parts or {}) do
    if type(p) == "string" then names[#names + 1] = p end
  end
  return #names > 0 and table.concat(names, ", ") or "its"
end

-- Reading ----------------------------------------------------------------------------------

-- A module string from before format 2 (its scope a table's name): a partial payload holding
-- that table, or nil and why not for another kind of Vanguard string (talents, weights...).
local function moduleString(scope, data)
  if not (ns.GetModule(scope) or CORE[scope] or ns.Profile()[scope] ~= nil) then
    return nil, "it's a " .. scope .. " string, not a profile string"
  end
  return "parts", { [scope] = data, parts = { scope } }
end

-- Runs each table's registered upgrade (ns.Migrate) on the payload's settings tables, so a
-- value an older version saved under an old name or meaning is upgraded before it is saved.
local function migrate(data)
  for key, t in pairs(data) do
    if not META[key] and type(t) == "table" then ns.MigrateTable(key, t) end
  end
end

-- A decoded string (scope and settings, or nil and why not) as this version's payload:
-- "profile" (a whole profile) or "parts" (a partial string), and the payload, its tables
-- upgraded; or nil and why not (a newer format, or not a profile string). An import from another
-- computer also leaves out that computer's own state (ns.WithoutClientState, Core/Profiles.lua).
function ns.ReadPayload(scope, data)
  if not scope then return nil, data end
  local kind, payload = scope, data
  if scope ~= "profile" and scope ~= "parts" then kind, payload = moduleString(scope, data) end
  if not kind then return nil, payload end
  local format, why = S.Format(payload, ns.PROFILE_FORMAT)
  if not format then return nil, why end
  migrate(payload)
  return kind, payload
end

-- Fonts and bar textures -------------------------------------------------------------------

-- The bar textures Vanguard draws itself (Core/Theme.lua's T.BarTexture).
local OWN_BARS = { vanguard = true, soft = true, flat = true }

-- True when a font name is one this client can't find: not the bundled font, the game's,
-- or a font path, and nothing shares it through LibSharedMedia (Core/SharedMedia.lua).
local function missingFont(name)
  if type(name) ~= "string" or name == "" or name == "client" or name:find("\\", 1, true) then return false end
  return not ns.Theme.SharedPath("font", name)
end

-- True when a bar texture name is neither Vanguard's own nor shared through LibSharedMedia.
local function missingBar(name)
  return type(name) == "string" and not OWN_BARS[name] and not ns.Theme.SharedPath("statusbar", name)
end

-- A line for each font and bar texture the string's theme names that this client doesn't
-- have, and what Vanguard draws instead (the name stays saved, for when it comes back).
function ns.MissingMedia(data)
  local theme, lines = type(data.theme) == "table" and data.theme or {}, {}
  if missingFont(theme.font) then
    lines[#lines + 1] = "Font not found: " .. theme.font .. " (no addon here shares it). Vanguard uses its default font instead."
  end
  if missingBar(theme.barTexture) then
    lines[#lines + 1] = "Bar texture not found: " .. theme.barTexture .. " (no addon here shares it). Vanguard uses its Vanguard bar texture instead."
  end
  return lines
end

-- Merging and matching ---------------------------------------------------------------------

-- A copy of v when it is a table, else v.
local function copied(v)
  return type(v) == "table" and ns.Copy(v) or v
end

-- Merges from into into, from's values winning, depth levels deep; a list (it has [1]) is
-- replaced whole. Keys only into has stay. Returns into.
local function merge(into, from, depth)
  for k, v in pairs(from) do
    local mine = into[k]
    if depth > 1 and type(v) == "table" and type(mine) == "table" and v[1] == nil then
      merge(mine, v, depth - 1)
    else
      into[k] = copied(v)
    end
  end
  return into
end

-- Merges a partial payload's tables into the profile, key by key: the string's values win,
-- and settings it doesn't carry keep their local values. The listeners hear of it before
-- (Situations puts the profile's own values back under an active override) and after.
function ns.MergeParts(profile, data)
  ns.ProfileChanged()
  for key, t in pairs(data) do
    if not META[key] and type(t) == "table" then
      profile[key] = merge(type(profile[key]) == "table" and profile[key] or {}, t, MERGE_DEPTH[key] or DEEP)
    end
  end
  ns.ProfileChanged()
end

-- True when a and b hold the same settings, all the way down.
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

-- True when a profile's settings equal a payload's, as a string carries them (this computer's own state left out).
local function sameAsCarried(data, profile)
  local carried = {}
  for k, v in pairs(profile) do carried[k] = v end
  return same(data, ns.WithoutClientState(carried))
end

-- The profile a whole imported profile's settings equal (its display block and format left
-- out), or nil: the active one first, compared with its own values (no Situations override).
function ns.MatchingProfile(data)
  local own = ns.OwnValues or function(fn, ...) return fn(...) end
  if own(sameAsCarried, data, ns.Profile()) then return ns.ProfileName() end
  for _, name in ipairs(ns.ProfileNames()) do
    if sameAsCarried(data, VanguardDB.profiles[name]) then return name end
  end
end

-- Importing across frames ------------------------------------------------------------------

-- Why an import ended early when a step of it failed (the error is in /vg errors).
local STEP_FAILED = "something went wrong while importing it (see /vg errors)"
local running = false

-- Ends the import, handing its outcome to the job's done.
local function finish(job, ...)
  running = false
  job.done(...)
end

local nextStep

-- One frame's share of an import: decoding until it has finished, then the import itself
-- (ns.ApplyImport). Without the client's timer every step runs at once.
local function step(job)
  local done, a, b = job.decode()
  if done then return finish(job, ns.ApplyImport(a, b)) end
  job.progress(math.floor(a * 100))
  if ns.HasTimer() then return nextStep(job) end
  return step(job)
end

-- Runs a step; one that fails ends the import with a reason.
local function run(job)
  if not ns.Try("profile import", step, job) then finish(job, nil, STEP_FAILED) end
end

-- Runs the import's next step on the next frame.
nextStep = function(job)
  C_Timer.After(0, ns.Guard("profile import step", function() run(job) end))
end

-- Imports a pasted string a frame's work at a time (S.BUDGET; the first step runs at once,
-- so a small string is imported before this returns). progress(percent) runs after each step
-- that isn't the last; done(message, result) or done(nil, why not) at the end. Returns
-- false, doing nothing, while another import is still running.
function ns.StartImport(text, progress, done)
  if running then return false end
  running = true
  run({ decode = S.Decoder(text), progress = progress, done = done })
  return true
end
