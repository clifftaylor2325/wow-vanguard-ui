-- The public integration surface beyond skins and auction prices (docs/API.md):
--   Vanguard.OpenOptions(page, setting)       opens the options window on a page and row
--   Vanguard.RegisterPreset(name, text, info) offers a profile string on the Profiles page
--   Vanguard.GetPresets()                     the presets on offer, built-in ones first
-- Nothing here changes a setting by itself: a preset waits on the Profiles page (or /vg preset
-- <name>) until the player picks it and says yes, and it is applied like /vg import (a backup
-- first, parts merged key by key). A call with the wrong kind of argument returns false and why,
-- and none of them reads a game value or touches a protected frame.

local ADDON, ns = ...

local O = ns.Options

local MAX_PRESETS, MAX_TEXT, MAX_INFO = 20, 20000, 200

-- The presets on offer, in order: { name, text, info, source } (source: "Vanguard" or the registering addon).
local presets = {}

-- The preset with this name (any case) and its place in the list, or nil.
local function find(name)
  for i, p in ipairs(presets) do
    if p.name:lower() == name:lower() then return p, i end
  end
end

-- Whether the arguments of RegisterPreset are usable, and if not what is wrong with them.
local function problem(name, text, info)
  if type(name) ~= "string" or name:gsub("%s", "") == "" or #name > 32 then return "name must be a string of 1 to 32 characters" end
  if type(text) ~= "string" or #text > MAX_TEXT or not text:find("^%s*VG1:") then return "text must be a Vanguard profile string" end
  if info ~= nil and type(info) ~= "string" then return "info must be a string" end
  if not find(name) and #presets >= MAX_PRESETS then return "too many presets" end
end

-- Adds or replaces a preset by name (its escape codes dropped, as the info's are); returns the same results as Vanguard.RegisterPreset.
local function add(name, text, info, source)
  if type(name) == "string" then name = (name:gsub("|", "")) end
  local why = problem(name, text, info)
  if why then return false, why end
  local old, at = find(name)
  if old and old.source == "Vanguard" and source ~= "Vanguard" then return false, "a built-in preset has that name" end
  local entry = { name = name, text = text, info = (info or ""):gsub("|", ""):sub(1, MAX_INFO), source = source }
  presets[at or (#presets + 1)] = entry
  return true
end

-- Offers a profile string (from /vg export, partial or whole) on the Profiles page as `name`,
-- with an optional one-line `info` (at most 200 characters). A name already offered is
-- replaced. Returns true, or false and why not. The string is checked when the player applies it.
function Vanguard.RegisterPreset(name, text, info)
  return add(name, text, info, "addon")
end

-- The presets on offer, a copy: { name, info, builtIn } in order.
function Vanguard.GetPresets()
  local out = {}
  for i, p in ipairs(presets) do out[i] = { name = p.name, info = p.info, builtIn = p.source == "Vanguard" } end
  return out
end

-- The page keys the options had before they were split, and where their rows went first.
local OLD_PAGES = { more = "bars" }

-- Opens the options window on a page (its key, as the options window's page list names them: general, modules, raid,
-- profiles, ...; the old "more" opens "bars"), scrolled to the first row whose caption holds `setting` (optional). Returns true,
-- or false for a page that doesn't exist.
function Vanguard.OpenOptions(page, setting)
  if type(page) ~= "string" then return false end
  page = OLD_PAGES[page] or page
  local known = false
  for _, p in ipairs(O.PAGES) do known = known or p.key == page end
  if not known then return false end
  O.Show(page)
  if type(setting) == "string" then O.JumpTo(setting) end
  return true
end

-- The preset a player asks for, or nil.
---@param name any
---@return table|nil
function ns.FindPreset(name)
  return type(name) == "string" and (find(name)) or nil
end

-- Applies a preset's string like /vg import does, once the player has said yes; refused in combat.
local function apply(preset)
  if ns.InCombat() then return ns.Chat("Presets can't be applied in combat: try again after the fight.") end
  local ok = ns.StartImport(preset.text, function() end, ns.ImportDone)
  if not ok then ns.Chat("Import failed: an import is still running.") end
end

-- Asks, then applies the preset.
---@param preset table
function ns.AskPreset(preset)
  ns.Ask("Apply preset " .. preset.name .. "? Your profile is backed up first.", "Apply", function() apply(preset) end, function() end)
end

-- The Profiles page's rows for the presets: a button each, with its info under it.
local function presetRows()
  local rows = { { "header", "Presets" }, { "text", "Settings other people made, applied like an import: a backup of this profile first, your layout and everything a preset leaves out kept." } }
  for _, p in ipairs(presets) do
    rows[#rows + 1] = { "button", "Apply " .. p.name, function() ns.AskPreset(p) end }
    if p.info ~= "" then rows[#rows + 1] = { "text", p.info } end
  end
  return rows
end

for _, p in ipairs(ns.BUILTIN_PRESETS) do add(p.name, p.text, p.info, "Vanguard") end
O.AddRows("profiles", presetRows)
