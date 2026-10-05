-- The public skin API: other addons hand Vanguard their frames and get the
-- Vanguard look. Registered callbacks run once at PLAYER_LOGIN (or at once
-- if registered later) with S, the theme primitives. A callback that errors
-- is reported (chat, /vg errors, the game's error handler) and never breaks
-- Vanguard or other skins.
--
--   ## OptionalDeps: Vanguard
--   if Vanguard and Vanguard.RegisterSkin then
--     Vanguard.RegisterSkin("MyAddon", function(S) S.Panel(MyFrame) end)
--   end

local ADDON, ns = ...

local T = ns.Theme

-- What a skin callback gets. Only ever grows; signatures never change.
local S = {
  apiVersion = 1,
  Panel = T.Panel,
  Button = T.Button,
  EditBox = T.EditBox,
  CloseButton = T.CloseButton,
  FadeRegions = T.FadeRegions,
  SetFont = T.SetFont,
  Text = T.Text,
  Color = T.Color,
  RGB = T.RGB,
  Tint = T.Tint,
  BarColor = T.BarColor,
  Pixel = T.Pixel,
  Accent = T.Accent,
  PanelColor = T.PanelColor,
  Font = T.Font,
  OnChanged = T.OnChanged,
}

local skins, order = {}, {}
local loggedIn = false

-- Whether skinning is on for an addon (on unless /vg skins <name> off).
local function skinEnabled(name)
  return ns.Settings("skins")[name] ~= false
end

-- Runs one skin callback, isolated; an error is reported (see ns.Report), not raised.
local function runSkin(name)
  local entry = skins[name]
  if entry.ran or not skinEnabled(name) then
    return
  end
  entry.ran = true
  local ok, err = ns.Try("skin for " .. name, entry.fn, S)
  entry.error = not ok and tostring(err) or nil
end

Vanguard = Vanguard or {}
ns.Public = Vanguard
Vanguard.apiVersion = S.apiVersion

-- Registers a skin callback for an addon. The first registration of a name wins.
function Vanguard.RegisterSkin(name, fn)
  if type(name) ~= "string" or type(fn) ~= "function" or skins[name] then
    return false
  end
  skins[name] = { fn = fn }
  order[#order + 1] = name
  if loggedIn then
    runSkin(name)
  end
  return true
end

-- Registered skin names, in registration order, with whether each ran.
function ns.SkinList()
  local out = {}
  for i, name in ipairs(order) do
    out[i] = { name = name, ran = skins[name].ran == true, enabled = skinEnabled(name), error = skins[name].error }
  end
  return out
end

ns.On("PLAYER_LOGIN", function()
  loggedIn = true
  for _, name in ipairs(order) do
    runSkin(name)
  end
end)
