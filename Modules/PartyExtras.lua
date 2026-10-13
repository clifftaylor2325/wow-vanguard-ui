-- Party pets and targets (off until you turn it on): for each party member, a
-- small tile for their pet and one for their target, side by side, one row
-- per member, in a column above the party frames. Each tile shows while its
-- unit exists (click it to target that unit), and the whole column shows only
-- in a party, not in a raid. They use the main tank frames' small tile.

local ADDON, ns = ...

local PX = ns.Module("PartyExtras", { defaults = { show = false } })

PX.W, PX.H, PX.GAP, PX.ROWS = 90, 16, 2, 4

-- One secure unit tile at row i, column col (0 = pet, 1 = target).
local function tile(holder, unit, i, col)
  local b = CreateFrame("Button", "Vanguard_" .. unit, holder, "SecureUnitButtonTemplate")
  b:SetSize(PX.W, PX.H)
  b:SetPoint("TOPLEFT", holder, "TOPLEFT", col * (PX.W + 4), -(i - 1) * (PX.H + PX.GAP))
  b:SetAttribute("unit", unit)
  b:SetAttribute("*type1", "target")
  b:RegisterForClicks("AnyUp")
  ns.GetModule("MainTanks").Tile(b)
  if type(RegisterUnitWatch) == "function" then RegisterUnitWatch(b) end
  return b
end

-- The movable column, shown only in a party (a secure state driver, so it follows the group in combat too).
local function build()
  local holder = CreateFrame("Frame", "Vanguard_PartyExtras", UIParent, "SecureHandlerStateTemplate")
  holder:SetSize(2 * PX.W + 4, PX.ROWS * (PX.H + PX.GAP) - PX.GAP)
  ns.Mover(holder, "partyextras", "Party pets and targets", { "BOTTOMLEFT", "BOTTOM", -620, 606 })
  PX.tiles = {}
  for i = 1, PX.ROWS do
    PX.tiles[#PX.tiles + 1] = tile(holder, "partypet" .. i, i, 0)
    PX.tiles[#PX.tiles + 1] = tile(holder, "party" .. i .. "target", i, 1)
  end
  if type(RegisterAttributeDriver) == "function" then RegisterAttributeDriver(holder, "state-visibility", "[group:raid] hide; [group:party] show; hide") end
  PX.holder = holder
end

-- Module entry point (Core/Modules.lua): built out of combat, and only when switched on.
function PX.Enable(settings)
  if settings.show then ns.OutOfCombat(build) end
end
