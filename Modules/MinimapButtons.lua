-- Other addons' minimap buttons (the LibDBIcon kind that ring the minimap)
-- gathered into one drawer beside the map, so the square map stays clean.
-- A small "..." button on the map's left edge opens and closes the drawer;
-- it only shows once there's a button to gather. The buttons stay the
-- addons' own: they still click, drag and show their tooltips.

local ADDON, ns = ...

local T = ns.Theme

local MB = ns.Module("MinimapButtons", { defaults = { drawer = true } })

MB.SIZE, MB.GAP, MB.PER_ROW, MB.PAD = 26, 2, 4, 4
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
  if b.fuiGathered then return end
  b.fuiGathered = true
  MB.buttons[#MB.buttons + 1] = b
  local n = #MB.buttons
  b:SetParent(MB.drawer)
  ns.Pin(b, function(f) cell(f, n) end)
  fit()
end

-- Gathers every addon button on the minimap that isn't in the drawer yet.
function MB.Scan()
  for _, child in ipairs({ Minimap:GetChildren() }) do
    local name = child.GetName and child:GetName()
    if type(name) == "string" and name:find(MB.NAME) then gather(child) end
  end
end

-- Building ------------------------------------------------------------------------------------

-- The drawer: a panel beside the minimap's left edge, shut until the toggle opens it.
local function buildDrawer(map)
  MB.drawer = T.HudPanel(CreateFrame("Frame", "ForeverUI_MinimapDrawer", map))
  MB.drawer:SetPoint("TOPRIGHT", map, "TOPLEFT", -4, 0)
  MB.drawer:SetFrameStrata("MEDIUM")
  MB.drawer:Hide()
end

-- The "..." toggle on the map's left edge (hidden until a button is gathered).
local function buildToggle(map)
  local t = T.Button(CreateFrame("Button", "ForeverUI_MinimapDrawerToggle", map))
  t:SetSize(16, 16)
  t:SetPoint("LEFT", map, "LEFT", 2, 0)
  t:SetFrameLevel((map:GetFrameLevel() or 1) + 5)
  t.icon = T.Tint(t:CreateTexture(nil, "OVERLAY"), "text2")
  t.icon:SetTexture(T.Icon("Waiting"))
  t.icon:SetAllPoints()
  t:SetScript("OnClick", function() MB.drawer:SetShown(not MB.drawer:IsShown()) end)
  t:Hide()
  MB.toggle = t
end

-- Builds the drawer beside ForeverUI's minimap and gathers (now, and once more a little later).
local function build()
  local map = ns.MoverFrame("minimap")
  if type(map) ~= "table" or type(Minimap) ~= "table" then return end
  buildDrawer(map)
  buildToggle(map)
  MB.Scan()
  ns.On("PLAYER_ENTERING_WORLD", MB.Scan)
  if type(C_Timer) == "table" and type(C_Timer.After) == "function" then C_Timer.After(MB.RESCAN_AFTER, MB.Scan) end
end

-- Module entry point (Core/Modules.lua): after the minimap is built (it waits out combat too).
function MB.Enable(settings)
  if settings.drawer then ns.OutOfCombat(build) end
end
