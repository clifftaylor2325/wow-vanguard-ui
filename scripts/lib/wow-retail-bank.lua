-- TEST-ONLY Retail stubs, bank and auras area (see wow-retail-core.lua for when these run): the private aura
-- spots the game draws hidden auras in, as UnitAuraDocumentation.lua (live branch) gives them. Both clients'
-- docs list these two calls; only the Retail code uses them, so they live here.

local world = __wfgWorld

-- world.privateAnchors[id] = the AddPrivateAuraAnchorArgs handed for that spot (UnitConstantsDocumentation.lua),
-- until it is taken back; world.privateAnchorCount = how many were ever handed.
world.privateAnchors, world.privateAnchorCount = {}, 0

-- Records a spot and gives back its id.
function C_UnitAuras.AddPrivateAuraAnchor(args)
  world.privateAnchorCount = world.privateAnchorCount + 1
  world.privateAnchors[world.privateAnchorCount] = args
  return world.privateAnchorCount
end

-- Takes a spot back.
function C_UnitAuras.RemovePrivateAuraAnchor(id)
  world.privateAnchors[id] = nil
end
