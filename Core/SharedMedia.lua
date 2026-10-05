-- Shared fonts and bar textures through LibSharedMedia-3.0 (bundled in Libs/
-- and loaded first by the TOC): Vanguard shares its own font and bar
-- textures with other addons, and the Font and Bar texture pickers offer
-- what other addons share. Every call works without the library: then only
-- the built-ins are offered, and a saved name falls back to them.

local ADDON, ns = ...

local T = ns.Theme

-- Vanguard's own media under its LibSharedMedia names: media type -> name -> path.
T.SHARED_MEDIA = {
  font = { ["Vanguard Fira Sans"] = T.FONTS.regular, ["Vanguard Fira Sans SemiBold"] = T.FONTS.bold },
  statusbar = { ["Vanguard"] = T.Texture("Bar"), ["Vanguard Soft"] = T.Texture("BarSoft"), ["Vanguard Flat"] = T.WHITE },
}

-- LibSharedMedia-3.0, or nil when it isn't loaded.
function T.SharedMedia()
  return type(LibStub) == "table" and LibStub("LibSharedMedia-3.0", true) or nil
end

-- The path shared under a name for a media type ("font", "statusbar"), or
-- nil when the library is missing or nothing is registered under that name.
function T.SharedPath(kind, name)
  local lsm = T.SharedMedia()
  return lsm and lsm:Fetch(kind, name, true) or nil
end

-- A picker's choices: the built-ins ({ value, text }), then every name shared
-- for the media type, Vanguard's own left out (the built-ins are those).
function T.SharedChoices(kind, builtIns)
  local list, lsm = {}, T.SharedMedia()
  for _, c in ipairs(builtIns) do list[#list + 1] = c end
  for _, name in ipairs(lsm and lsm:List(kind) or {}) do
    if not T.SHARED_MEDIA[kind][name] then list[#list + 1] = { name, name } end
  end
  return list
end

-- Shares Vanguard's font (it has Latin, Greek and Cyrillic, so western and
-- Russian clients) and its three bar textures.
local function share(lsm)
  local scripts = lsm.LOCALE_BIT_western + lsm.LOCALE_BIT_ruRU
  for name, path in pairs(T.SHARED_MEDIA.font) do lsm:Register("font", name, path, scripts) end
  for name, path in pairs(T.SHARED_MEDIA.statusbar) do lsm:Register("statusbar", name, path) end
end

if T.SharedMedia() then share(T.SharedMedia()) end
