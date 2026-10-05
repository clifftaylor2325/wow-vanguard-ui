-- Main tank frames: in a raid, the players set as main tank or main assist get
-- a small tile each (health in their class color, their name), with what
-- they're targeting written beside it in its reaction color. Click a tile to
-- target that player. A secure group header picks the players (the raid's own
-- main tank and assist marks), so the list changes safely even in combat.
-- Also the small tile both this and the party pets and targets use.

local ADDON, ns = ...

local T = ns.Theme

local MT = ns.Module("MainTanks", { defaults = {} })

MT.W, MT.H, MT.GAP, MT.TARGET_W, MT.MAX = 140, 22, 4, 90, 4
-- How often the tiles read their units (they have no events of their own), in seconds.
MT.POLL = 0.2

-- Runs in the secure environment for every tile the header creates: size and
-- clicks, then the insecure setup below via CallMethod.
MT.INIT = [[
  local header = self:GetParent()
  self:SetWidth(header:GetAttribute("vg-width"))
  self:SetHeight(header:GetAttribute("vg-height"))
  self:SetAttribute("*type1", "target")
  self:SetAttribute("*type2", "togglemenu")
  header:CallMethod("initialConfigFunction", self:GetName())
]]

-- A plain true from the client (hidden values count as false).
local function yes(v)
  return not ns.IsSecret(v) and v == true
end

-- The small tile -------------------------------------------------------------------------

-- A target line just right of a tile: whom its unit is targeting.
local function addTargetLine(b)
  b.target = T.Text(b:CreateFontString(nil, "OVERLAY"), "small")
  b.target:SetPoint("LEFT", b, "RIGHT", 6, 0)
  b.target:SetWidth(MT.TARGET_W)
  b.target:SetJustifyH("LEFT")
  b.target:SetWordWrap(false)
end

-- Paints a tile's target line: the target's name in its reaction (or class) color, empty when there's none.
local function paintTarget(b, unit)
  if not yes(UnitExists(unit)) then return b.target:SetText("") end
  b.target:SetText(UnitName(unit))
  b.target:SetTextColor(ns.GetModule("UnitFrames").HealthColor(unit))
end

-- Paints a tile from its unit: health in its color, its name, and its target line if it has one.
function MT.Paint(b)
  local unit = b:GetAttribute("unit")
  if not unit or not yes(UnitExists(unit)) then return end
  b.bar:SetMinMaxValues(0, UnitHealthMax(unit))
  T.SetBarValue(b.bar, UnitHealth(unit))
  b.bar:SetStatusBarColor(ns.GetModule("UnitFrames").HealthColor(unit))
  b.name:SetText(UnitName(unit))
  if b.target then paintTarget(b, unit .. "target") end
end

-- Reads the tile's unit a few times a second while it shows.
local function poll(b)
  local elapsed = 0
  b:SetScript("OnUpdate", function(self, dt)
    elapsed = elapsed + dt
    if elapsed < MT.POLL then return end
    elapsed = 0
    MT.Paint(self)
  end)
end

-- Dresses a unit button as a small tile: a flat panel, a health bar one pixel
-- inside it, and the name on the bar (cut off, never wrapped).
function MT.Tile(b)
  local px = T.Pixel(b)
  T.HudPanel(b)
  b.bar = T.StyleBar(CreateFrame("StatusBar", nil, b))
  b.bar:SetPoint("TOPLEFT", px, -px)
  b.bar:SetPoint("BOTTOMRIGHT", -px, px)
  b.name = T.Text(b.bar:CreateFontString(nil, "OVERLAY"), "small")
  b.name:SetPoint("LEFT", 4, 0) b.name:SetPoint("RIGHT", -4, 0)
  b.name:SetJustifyH("LEFT") b.name:SetWordWrap(false)
  poll(b)
end

-- Main tanks ------------------------------------------------------------------------------

MT.tiles = {}

-- Insecure setup for a tile the header created (called from MT.INIT).
function MT.Setup(b)
  MT.Tile(b)
  addTargetLine(b)
  b:RegisterForClicks("AnyUp")
  b:HookScript("OnShow", MT.Paint)
  MT.tiles[#MT.tiles + 1] = b
end

-- Who shows and how: the raid's main tanks and assists, in a column down from the top.
local function layout(header)
  header:SetAttribute("showRaid", true)
  header:SetAttribute("groupFilter", "MAINTANK,MAINASSIST")
  header:SetAttribute("point", "TOP")
  header:SetAttribute("yOffset", -MT.GAP)
  header:SetAttribute("unitsPerColumn", MT.MAX)
  header:SetAttribute("maxColumns", 1)
end

-- The secure group header, its tile template and setup hook.
local function createHeader()
  local header = CreateFrame("Frame", "Vanguard_MainTanks", UIParent, "SecureGroupHeaderTemplate")
  header:SetAttribute("template", "SecureUnitButtonTemplate")
  header:SetAttribute("vg-width", MT.W)
  header:SetAttribute("vg-height", MT.H)
  -- Called by MT.INIT (CallMethod) with the new tile's name.
  header.initialConfigFunction = function(_, name) MT.Setup(_G[name]) end
  if ns.Client.ProbeSnippets() ~= false then header:SetAttribute("initialConfigFunction", MT.INIT) end
  layout(header)
  return header
end

-- Makes every tile now, out of combat (shown briefly with a negative start index).
local function precreate(header)
  header:SetAttribute("startingIndex", 1 - MT.MAX)
  header:Show()
  header:SetAttribute("startingIndex", 1)
end

-- The movable holder (room for four tiles and their target lines), the header pinned in it.
local function build()
  local holder = CreateFrame("Frame", "Vanguard_MainTanksHolder", UIParent)
  holder:SetSize(MT.W + 6 + MT.TARGET_W, MT.MAX * (MT.H + MT.GAP) - MT.GAP)
  ns.Mover(holder, "maintanks", "Main tanks", { "TOPLEFT", "TOPLEFT", 400, -20 })
  MT.holder, MT.header = holder, createHeader()
  MT.header:SetPoint("TOPLEFT", holder, "TOPLEFT")
  precreate(MT.header)
  if type(RegisterAttributeDriver) == "function" then RegisterAttributeDriver(MT.header, "state-visibility", "[group:raid] show; hide") end
  ns.Client.WhenSnippetsKnown(function(worked) if worked == false then MT.WithoutSnippets() end end)
end

-- Sets up the tiles the header made without its init snippet (out of combat).
function MT.SetupTiles()
  ns.Client.SetupHeaderButtons(MT.header, MT.Setup)
end

-- The main tank header on a client that can't run snippets: the header copies
-- the clicks, the tiles are made (again) and set up from here, now and on every
-- roster change, out of combat.
function MT.WithoutSnippets()
  ns.Client.HeaderWithoutSnippets(MT.header)
  precreate(MT.header)
  MT.SetupTiles()
  ns.On("GROUP_ROSTER_UPDATE", function() ns.OutOfCombat(MT.SetupTiles, "maintanktiles") end)
end

-- Module entry point (Core/Modules.lua): secure frames are made out of combat.
function MT.Enable()
  ns.OutOfCombat(build)
end
