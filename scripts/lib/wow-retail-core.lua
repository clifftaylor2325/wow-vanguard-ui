-- TEST-ONLY Retail stubs, core area. The harness runs every scripts/lib/wow-retail-<area>.lua, in
-- name order, after RETAIL_CLIENT has made the world Retail (wow-world.lua's world.becomeRetail) and
-- before the addon's files load; a Forever client never runs them. Each area keeps what Retail has
-- and WoW Forever lacks (or the reverse, beyond the documented API) here or in its own file
-- (wow-retail-classbars.lua, ...), so wow-world.lua stays the shared client. Check a Retail API in
-- Blizzard's live docs (wow-ui-source, live branch) before stubbing it.

-- Pet happiness left Retail in 4.1.0. The world keeps the old global beside WoW Forever's documented
-- C_PetInfo.GetPetHappiness (which forever-only-api.json removes), so Retail drops it here too.
GetPetHappiness = nil

-- Live Retail has no C_Item.GetWeaponEnchantInfo (PlayerAuras reads C_PaperDollInfo there) and its
-- Enum.WeaponSlot has no Ranged.
C_Item.GetWeaponEnchantInfo = nil
Enum.WeaponSlot = { MainHand = 0, OffHand = 1 }
