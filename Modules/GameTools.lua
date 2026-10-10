-- The game's own new tools in the Vanguard look, and placed to fit the
-- Centered layout:
--   * the Cooldown Manager's rows sit in the gap between the player and
--     target frames, above the swing timer, with square icons in thin borders
--     and their numbers (charges, stacks, cooldown timers) in the theme font;
--     one switch (off by default) turns the game's Cooldown Manager on, so its
--     essential row shows there without a trip to the game's options;
--   * the damage meter sits in the bottom-right corner above the menu strip,
--     on a flat panel with theme bars and text.
-- Each one stays the game's own (Edit Mode settings, what it tracks, how it
-- counts); Vanguard only restyles it and gives it a spot you can move with
-- /vg unlock. While Edit Mode is open, Vanguard stands aside (Core/Movers.lua
-- pauses every pin) and puts things back when it closes. A client without
-- one of these tools simply has nothing to style.

local ADDON, ns = ...

local T = ns.Theme

local GT = ns.Module("GameTools", { defaults = { cooldowns = true, meter = true, place = true, cdmHint = true, essential = false } })

-- Each placed frame's mover: key, label, default point, and the spot's size
-- (UI units; the rows fit the 240-unit gap between the unit frames).
GT.SPOTS = {
  EssentialCooldownViewer = { "cdm_essential", "Cooldowns", { "BOTTOM", "BOTTOM", 0, 210 }, 236, 32 },
  UtilityCooldownViewer = { "cdm_utility", "Utility cooldowns", { "BOTTOM", "BOTTOM", 0, 248 }, 206, 24 },
  BuffIconCooldownViewer = { "cdm_buffs", "Tracked buffs", { "BOTTOM", "BOTTOM", 0, 278 }, 206, 24 },
  DamageMeter = { "damagemeter", "Damage meter", { "BOTTOMRIGHT", "BOTTOMRIGHT", -16, 118 }, 300, 78 },
}
-- The Cooldown Manager's rows, in the order they're placed (the buff bars are styled only).
GT.VIEWERS = { "EssentialCooldownViewer", "UtilityCooldownViewer", "BuffIconCooldownViewer", "BuffBarCooldownViewer" }

-- Placing -------------------------------------------------------------------------------------

-- Puts one of the game's frames on its spot: the meter fills it; a cooldown
-- row is centered on it (the row sizes itself to its icons).
function GT.Fit(frame, spot, fill)
  frame:ClearAllPoints()
  if not fill then return frame:SetPoint("CENTER", spot, "CENTER") end
  frame:SetPoint("TOPLEFT", spot, "TOPLEFT")
  frame:SetPoint("BOTTOMRIGHT", spot, "BOTTOMRIGHT")
end

-- A movable spot for one of the game's frames, with the frame kept on it.
local function place(name)
  local f, spot = _G[name], GT.SPOTS[name]
  if type(f) ~= "table" or not f.SetPoint or not spot then return end
  local holder = CreateFrame("Frame", "Vanguard_" .. name .. "Spot", UIParent)
  holder:SetSize(spot[4], spot[5])
  ns.Mover(holder, spot[1], spot[2], spot[3])
  ns.Pin(f, function(frame) GT.Fit(frame, holder, name == "DamageMeter") end)
end

-- Cooldown Manager ---------------------------------------------------------------------------

-- An item's icon texture (buff bar items keep theirs inside an Icon frame).
local function iconOf(item)
  local icon = item.Icon
  if type(icon) == "table" and type(icon.Icon) == "table" then return icon.Icon end
  return icon
end

-- The number texts an item has: charges, stacks, and a buff bar's name and time.
function GT.Texts(item)
  local out = {}
  -- Adds holder[key] when the item has it.
  local function add(holder, key) if type(holder) == "table" and type(holder[key]) == "table" then out[#out + 1] = holder[key] end end
  add(item.ChargeCount, "Current")
  add(item.Applications, "Applications")
  add(item.Icon, "Applications")
  add(item.Bar, "Name")
  add(item.Bar, "Duration")
  return out
end

-- A square icon inset one pixel inside a thin theme border.
local function frameIcon(item, icon)
  local px = T.Pixel(item)
  T.HudPanel(item, { inset = true })
  icon:ClearAllPoints()
  icon:SetPoint("TOPLEFT", item, "TOPLEFT", px, -px)
  icon:SetPoint("BOTTOMRIGHT", item, "BOTTOMRIGHT", -px, px)
end

-- An item's cooldown timer numbers in the theme's timer font (where the client hands them over).
local function themeTimer(item)
  local cd = item.Cooldown
  local fs = type(cd) == "table" and ns.Client.Has("countdownText") and cd:GetCountdownFontString()
  if fs then T.Text(fs, "cooldown", "white") end
end

-- One cooldown or buff item in the theme: icon cropped and framed (a buff bar
-- gets the theme's bar instead), its numbers in the theme font. Once per item.
function GT.SkinItem(item)
  if item.vgSkinned then return end
  item.vgSkinned = true
  local icon = iconOf(item)
  if type(icon) == "table" and icon.SetTexCoord then T.Crop(icon) end
  if type(item.Bar) == "table" then T.StyleBar(item.Bar)
  elseif type(icon) == "table" and icon.SetPoint then frameIcon(item, icon) end
  for _, fs in ipairs(GT.Texts(item)) do T.Text(fs, item.Bar and "barSmall" or "auraCount", false) end
  if not item.Bar then themeTimer(item) end
end

-- Every item a cooldown row shows right now, in the theme.
function GT.SkinViewer(viewer)
  local items = type(viewer.GetItemFrames) == "function" and viewer:GetItemFrames()
  if type(items) ~= "table" then return end
  for _, item in ipairs(items) do GT.SkinItem(item) end
end

-- Styles a cooldown row now and each time the game lays it out again (it
-- makes its items as you set what it tracks).
local function watchViewer(name)
  local viewer = _G[name]
  if type(viewer) ~= "table" then return end
  GT.SkinViewer(viewer)
  if type(viewer.RefreshLayout) == "function" and type(hooksecurefunc) == "function" then hooksecurefunc(viewer, "RefreshLayout", ns.Guard("hook RefreshLayout", GT.SkinViewer)) end
end

-- Damage meter -------------------------------------------------------------------------------

-- One meter line (a player or a spell): the theme's bar over a dark inset, its
-- name and amount in the theme font, its icon cropped. Once per line.
function GT.SkinEntry(entry)
  local bar = entry.StatusBar
  if entry.vgSkinned or type(bar) ~= "table" then return end
  entry.vgSkinned = true
  T.StyleBar(bar)
  for _, region in ipairs(bar.BackgroundRegions or {}) do region:SetAlpha(0) end
  T.HudPanel(bar, { inset = true })
  for _, key in ipairs({ "Name", "Value" }) do if type(bar[key]) == "table" then T.Text(bar[key], "small", false) end end
  if type(entry.Icon) == "table" and type(entry.Icon.Icon) == "table" then T.Crop(entry.Icon.Icon) end
end

-- Every line a meter window's list shows right now.
local function skinLines(win)
  local box = win.ScrollBox
  if type(box) == "table" and box.ForEachFrame then box:ForEachFrame(GT.SkinEntry) end
  if type(win.LocalPlayerEntry) == "table" then GT.SkinEntry(win.LocalPlayerEntry) end
end

-- One meter window in the theme: its header art faded, a flat panel, its
-- lines restyled whenever the list redraws. Once per window.
function GT.SkinWindow(win)
  if win.vgSkinned then return end
  win.vgSkinned = true
  if type(win.Header) == "table" then win.Header:SetAlpha(0) end
  T.HudPanel(win, { alpha = 0.9 })
  skinLines(win)
  local box = win.ScrollBox
  if type(box) == "table" and type(box.Update) == "function" then hooksecurefunc(box, "Update", ns.Guard("hook Update", function() skinLines(win) end)) end
end

-- Every meter window, now and whenever the game opens another.
local function watchMeter()
  local meter = _G.DamageMeter
  if type(meter) ~= "table" or type(meter.ForEachSessionWindow) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  meter:ForEachSessionWindow(GT.SkinWindow)
  if type(meter.SetupSessionWindow) == "function" then
    hooksecurefunc(meter, "SetupSessionWindow", ns.Guard("hook SetupSessionWindow", function(self) self:ForEachSessionWindow(GT.SkinWindow) end))
  end
end

-- Where to turn the Cooldown Manager on, said once when it's off.
GT.HINT = "The game's Cooldown Manager is off. Turn it on in Options > Gameplay Enhancements > Enable Cooldown Manager, and Vanguard places it between your frames."

-- True when this client has the Cooldown Manager but it's switched off.
function GT.CooldownsOff()
  local viewer, cvar = C_CooldownViewer, C_CVar
  local available = type(viewer) == "table" and type(viewer.IsCooldownViewerAvailable) == "function" and viewer.IsCooldownViewerAvailable()
  if available ~= true or type(cvar) ~= "table" or type(cvar.GetCVarBool) ~= "function" then return false end
  return cvar.GetCVarBool("cooldownViewerEnabled") == false
end

-- Says where to turn the Cooldown Manager on, once (per profile), while it's off.
function GT.Hint(settings)
  if not settings.cdmHint or not GT.CooldownsOff() then return end
  settings.cdmHint = false
  ns.Chat(GT.HINT)
end

-- Turns the game's Cooldown Manager on or off (its own setting, the one its
-- Options checkbox sets), where the client has one; out of combat.
function GT.SetCooldownManager(on)
  local set = C_CVar and C_CVar.SetCVar
  if not ns.Client.Has("cooldownViewer") or type(set) ~= "function" then return end
  ns.OutOfCombat(function() set("cooldownViewerEnabled", on and "1" or "0") end, "cooldownmanager")
end

-- Module entry point (Core/Modules.lua): style what's switched on, then place
-- it (out of combat: the cooldown rows are laid out by the game's frame manager).
function GT.Enable(settings)
  if settings.essential then GT.SetCooldownManager(true) end
  if settings.cooldowns then ns.On("PLAYER_ENTERING_WORLD", function() GT.Hint(settings) end) end
  if settings.cooldowns then for _, name in ipairs(GT.VIEWERS) do watchViewer(name) end end
  if settings.meter then watchMeter() end
  if not settings.place then return end
  ns.OutOfCombat(function()
    if settings.cooldowns then for _, name in ipairs(GT.VIEWERS) do place(name) end end
    if settings.meter then place("DamageMeter") end
  end)
end
