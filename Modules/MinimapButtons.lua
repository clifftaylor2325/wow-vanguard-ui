-- Other addons' minimap buttons (the LibDBIcon kind that ring the minimap)
-- gathered into one drawer beside the map, so the square map stays clean.
-- A small "..." button on the map's left edge opens and closes the drawer;
-- it only shows once there's a button to gather. The buttons stay the
-- addons' own: they still click, drag and show their tooltips. A button an
-- addon makes later (enabled from its settings, or loaded on demand) joins
-- as LibDBIcon makes it; a protected button is never taken.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgGathered = ns.FrameState("vgGathered")

local T = ns.Theme

local MB = ns.Module("MinimapButtons", { defaults = { drawer = true } })

MB.SIZE, MB.GAP, MB.PER_ROW, MB.PAD = 26, 2, 4, T.SPACE.tight
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

-- Takes one addon button into the drawer, kept in its cell when the addon moves it again.
local function gather(b)
  if vgGathered[b] then return end
  vgGathered[b] = true
  MB.buttons[#MB.buttons + 1] = b
  local n = #MB.buttons
  b:SetParent(MB.drawer)
  ns.Pin(b, function(f) cell(f, n) end)
  fit()
end

-- Whether the drawer may take a minimap child: LibDBIcon's kind, and not protected (Vanguard can't
-- reparent another addon's secure button in a fight, and doing it at all would taint it).
local function gatherable(child)
  local name = child.GetName and child:GetName()
  if type(name) ~= "string" or not name:find(MB.NAME) then return false end
  return not (child.IsProtected and child:IsProtected())
end

-- Gathers every addon button on the minimap that isn't in the drawer yet.
function MB.Scan()
  for _, child in ipairs({ Minimap:GetChildren() }) do
    if gatherable(child) then gather(child) end
  end
end

-- Gathers again, now or when the fight ends (a loading screen or a new button can come mid-fight).
local function scanSoon()
  ns.OutOfCombat(MB.Scan, "minimapbuttons")
end

-- Listens for the buttons LibDBIcon makes from now on (LibDBIcon_IconCreated), once an addon has loaded it.
function MB.Hook()
  local lib = type(LibStub) == "table" and LibStub("LibDBIcon-1.0", true)
  if MB.hooked or type(lib) ~= "table" or type(lib.RegisterCallback) ~= "function" then return end
  MB.hooked = true
  lib.RegisterCallback(MB, "LibDBIcon_IconCreated", scanSoon)
end

-- Building ------------------------------------------------------------------------------------

-- The drawer: a panel beside the minimap's left edge, shut until the toggle opens it.
local function buildDrawer(map)
  MB.drawer = T.HudPanel(CreateFrame("Frame", "Vanguard_MinimapDrawer", map))
  MB.drawer:SetPoint("TOPRIGHT", map, "TOPLEFT", -T.SPACE.tight, 0)
  MB.drawer:SetFrameStrata("MEDIUM")
  MB.drawer:Hide()
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
  t:SetScript("OnClick", ns.Guard("click minimap button drawer", function() MB.drawer:SetShown(not MB.drawer:IsShown()) end))
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
  MB.Hook()
  ns.On("ADDON_LOADED", MB.Hook)
end

-- Module entry point (Core/Modules.lua): after the minimap is built (it waits out combat too).
function MB.Enable(settings)
  if settings.drawer then ns.OutOfCombat(build) end
end
