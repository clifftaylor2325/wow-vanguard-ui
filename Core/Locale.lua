-- The string table. Every player-facing text is looked up as L["English text"]:
-- the English is the key, so a text with no translation reads as itself and
-- the enUS client needs no locale file. Locales/<locale>.lua fills in the
-- active client's translations. Names the game supplies (spells, items,
-- zones, classes) come from the client already translated and never go here.

local ADDON, ns = ...

-- A key with no translation: the English key itself.
local function english(_, key)
  return key
end

ns.L = setmetatable({}, { __index = english })

-- The client's locale ("enUS", "deDE", ...); "enUS" when it can't say.
---@return string
function ns.Locale()
  local locale = type(GetLocale) == "function" and GetLocale()
  return type(locale) == "string" and locale or "enUS"
end

-- text with each {name} replaced by tostring(values[name]); a name values
-- lacks stays as written. Named slots let a translation reorder its words.
-- Never pass a secret value: tostring would read it.
---@param text string
---@param values table
---@return string
function ns.Format(text, values)
  local filled = text:gsub("{(%w+)}", function(name)
    local value = values[name]
    return value ~= nil and tostring(value) or nil
  end)
  return filled
end

-- Fills in one locale's translations when the client runs that locale; returns
-- the table, or nil on any other client so the locale file stops there.
---@param locale string
---@return table|nil
function ns.NewLocale(locale)
  if ns.Locale() ~= locale then return nil end
  return ns.L
end
