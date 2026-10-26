-- Other addons' minimap buttons (the LibDBIcon kind that ring the minimap)
-- gathered into one drawer beside the map, so the square map stays clean.
-- A small "..." button on the map's left edge opens and closes the drawer
-- (its tooltip counts the buttons; Escape closes it too); it only shows once
-- there's a button to gather. The buttons sit in name order, and the drawer
-- opens on whichever side of the map has room. The buttons stay the
-- addons' own: they still click, drag and show their tooltips. A button an
-- addon makes later (enabled from its settings, or loaded on demand) joins
-- as LibDBIcon makes it; a protected button is never taken.

local ADDON, ns = ...
local L = ns.L

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgGathered = ns.FrameState("vgGathered")

local T = ns.Theme

local MB = ns.Module("MinimapButtons", { defaults = { drawer = true } })

-- A cell is 31 wide, the size LibDBIcon builds its buttons at, so each icon and its tracking ring keep the
-- places the library gave them.
MB.SIZE, MB.GAP, MB.PER_ROW, MB.PAD = 31, 2, 4, T.SPACE.tight
-- Addon minimap buttons are named after the library that makes them.
MB.NAME = "^LibDBIcon10_"
-- A second look shortly after login, for addons that make their buttons late.
MB.RESCAN_AFTER = 3

MB.buttons = {}

-- Placing ------------------------------------------------------------------------------------

-- Puts the n-th gathered button in its cell of the drawer's grid.
local function cell(b, n)
  local col, row = (n - 1) % MB.PER_ROW, math.floor((n - 1) / MB.PER_ROW)
  b:ClearAllPoints()
  b:SetPoint("TOPLEFT", MB.drawer, "TOPLEFT", MB.PAD + col * (MB.SIZE + MB.GAP), -MB.PAD - row * (MB.SIZE + MB.GAP))
  b:SetSize(MB.SIZE, MB.SIZE)
end

-- Sizes the drawer to its grid, and shows the toggle once there's something in it.
local function fit()
  local n = #MB.buttons
  local cols, rows = math.min(n, MB.PER_ROW), math.ceil(n / MB.PER_ROW)
  MB.drawer:SetSize(2 * MB.PAD + cols * MB.SIZE + (cols - 1) * MB.GAP, 2 * MB.PAD + rows * MB.SIZE + (rows - 1) * MB.GAP)
  MB.toggle:SetShown(n > 0)
end

-- Puts every gathered button in its cell, in name order, each kept there when its addon moves it again.
local function arrange()
  table.sort(MB.buttons, function(a, b) return vgGathered[a] < vgGathered[b] end)
  for n, b in ipairs(MB.buttons) do ns.Pin(b, function(f) cell(f, n) end) end
  fit()
end

-- Takes one addon button into the drawer, keeping its place in the name order (its addon's name without
-- the library's prefix, in lower case); true when it was new.
local function gather(b)
  if vgGathered[b] then return false end
  vgGathered[b] = (b:GetName():gsub(MB.NAME, "")):lower()
  MB.buttons[#MB.buttons + 1] = b
  b:SetParent(MB.drawer)
  return true
end

-- Whether the drawer may take a minimap child: LibDBIcon's kind, and not protected (Vanguard can't
-- reparent another addon's secure button in a fight, and doing it at all would taint it).
local function gatherable(child)
  local name = child.GetName and child:GetName()
  if type(name) ~= "string" or not name:find(MB.NAME) then return false end
  return not (child.IsProtected and child:IsProtected())
end

-- Gathers every addon button on the minimap that isn't in the drawer yet, then lays the drawer out once.
function MB.Scan()
  local added = false
  for _, child in ipairs({ Minimap:GetChildren() }) do
    if gatherable(child) and gather(child) then added = true end
  end
  if added then arrange() end
end

-- Gathers again, now or when the fight ends (a loading screen or a new button can come mid-fight).
local function scanSoon()
  ns.OutOfCombat(MB.Scan, "minimapbuttons")
end

-- Listens for the buttons LibDBIcon makes from now on (LibDBIcon_IconCreated), once an addon has loaded it,
-- and gathers the ones it made before (an addon loaded on demand registers before Vanguard hears of it).
function MB.Hook()
  local lib = type(LibStub) == "table" and LibStub("LibDBIcon-1.0", true)
  if MB.hooked or type(lib) ~= "table" or type(lib.RegisterCallback) ~= "function" then return end
  MB.hooked = true
  lib.RegisterCallback(MB, "LibDBIcon_IconCreated", ns.Guard("minimap drawer new button", scanSoon))
  ns.Off("ADDON_LOADED", MB.Hook)
  scanSoon()
end

-- Building ------------------------------------------------------------------------------------

-- The drawer: a panel beside the minimap (MB.PlaceDrawer picks the side), shut until the toggle opens
-- it; Escape closes it.
local function buildDrawer(map)
  MB.map = map
  MB.drawer = T.HudPanel(CreateFrame("Frame", "Vanguard_MinimapDrawer", map))
  MB.drawer:SetFrameStrata("MEDIUM")
  MB.drawer:SetClampedToScreen(true)
  MB.drawer:Hide()
  ns.CloseOnEscape(MB.drawer)
end

-- The map's left edge in screen pixels (so frames at different scales compare), or nil when it has none yet.
local function leftEdge(frame)
  local v = ns.PlainNumber(frame:GetLeft())
  return v and v * frame:GetEffectiveScale()
end

-- The drawer's anchor on each side of the map: its point, the map's point, and which way the gap goes.
MB.SIDES = { LEFT = { "TOPRIGHT", "TOPLEFT", -1 }, RIGHT = { "TOPLEFT", "TOPRIGHT", 1 } }

-- Sets the drawer beside the map, level with its top, on the side with room: left of it unless that would
-- leave the screen, then right. The drawer is held to the screen, so a map near the bottom pushes it up.
function MB.PlaceDrawer()
  local d, gap = MB.drawer, T.SPACE.tight
  local left = leftEdge(MB.map)
  local side = MB.SIDES[left and left < (d:GetWidth() + gap) * d:GetEffectiveScale() and "RIGHT" or "LEFT"]
  d:ClearAllPoints()
  d:SetPoint(side[1], MB.map, side[2], side[3] * gap, 0)
end

-- Opens the drawer on the side with room, or shuts it.
function MB.Toggle()
  if not MB.drawer:IsShown() then MB.PlaceDrawer() end
  MB.drawer:SetShown(not MB.drawer:IsShown())
end

-- The toggle's tooltip: how many addon buttons the drawer holds.
function MB.ToggleTip(t)
  GameTooltip:SetOwner(t, "ANCHOR_LEFT")
  GameTooltip:SetText(ns.Format(L["Addon buttons ({count})"], { count = #MB.buttons }), T.RGB("text"))
  GameTooltip:Show()
end

-- The toggle's click and tooltip.
local function wireToggle(t)
  t:SetScript("OnClick", ns.Guard("click minimap button drawer", MB.Toggle))
  t:SetScript("OnEnter", ns.Guard("minimap drawer tip", MB.ToggleTip))
  t:SetScript("OnLeave", ns.Guard("minimap drawer tip", function() GameTooltip:Hide() end))
end

-- The "..." toggle on the map's left edge (hidden until a button is gathered).
local function buildToggle(map)
  local t = T.Button(CreateFrame("Button", "Vanguard_MinimapDrawerToggle", map))
  t:SetSize(16, 16)
  t:SetPoint("LEFT", map, "LEFT", 2, 0)
  t:SetFrameLevel((map:GetFrameLevel() or 1) + 5)
  t.icon = T.Tint(t:CreateTexture(nil, "OVERLAY"), "text2")
  t.icon:SetTexture(T.Icon("Waiting"))
  t.icon:SetAllPoints()
  wireToggle(t)
  t:Hide()
  MB.toggle = t
end

-- Builds the drawer beside Vanguard's minimap and gathers (now, and once more a little later).
local function build()
  local map = ns.MoverFrame("minimap")
  if type(map) ~= "table" or type(Minimap) ~= "table" then return end
  buildDrawer(map)
  buildToggle(map)
  MB.Scan()
  ns.On("PLAYER_ENTERING_WORLD", scanSoon)
  if type(C_Timer) == "table" and type(C_Timer.After) == "function" then C_Timer.After(MB.RESCAN_AFTER, ns.Guard("timer minimap button rescan", scanSoon)) end
  ns.On("ADDON_LOADED", MB.Hook)
  MB.Hook()
end

-- Module entry point (Core/Modules.lua): after the minimap is built (it waits out combat too).
function MB.Enable(settings)
  if settings.drawer then ns.OutOfCombat(build) end
end
