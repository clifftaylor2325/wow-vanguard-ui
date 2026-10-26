-- Vanguard's own role presets: the raid frame, raid aura, raid healing and nameplate
-- settings each role plays best with, and the same settings as profile strings (partial
-- strings: those four parts only, so a layout, theme and every other module stay as they
-- are). Core/Integration.lua lists the strings beside the presets other addons register,
-- and setup's Healing and Damage and tanking layouts apply the tables (Core/Setup.lua).
-- The strings are made here from the tables, so the two can't drift apart.

local ADDON, ns = ...
local L = ns.L

-- What each role sets, by module. Healer: frames sorted by role with power bars, raid
-- debuffs, HoTs, incoming heals, shields, a buff watch, and short debuff rows on nameplates
-- without threat colours. Damage: compact frames without power bars or heal overlays, two
-- raid debuffs, no HoTs, longer debuff rows with timers and threat colours on nameplates.
-- Tank: Damage's frames sorted by role, the aggro strip on, and threat colours, a target
-- border and buff rows on nameplates.
ns.ROLE_SETTINGS = {
  Healer = {
    RaidFrames = { showInParty = true, showPlayer = true, showPower = true, sortByRole = true },
    RaidAuras = { dispel = true, debuffs = 3, hots = true },
    RaidHealing = { healPrediction = true, absorbs = true, aggro = true, buffWatch = true },
    Nameplates = { buffs = 0, castBar = true, debuffs = 2, threat = false },
  },
  Damage = {
    RaidFrames = { showPower = false, sortByRole = false },
    RaidAuras = { dispel = true, debuffs = 2, hots = false },
    RaidHealing = { healPrediction = false, absorbs = false, aggro = true, buffWatch = false },
    Nameplates = { buffs = 0, castBar = true, debuffs = 6, threat = true, timers = true },
  },
  Tank = {
    RaidFrames = { showPower = false, sortByRole = true },
    RaidAuras = { dispel = true, debuffs = 2, hots = false },
    RaidHealing = { healPrediction = false, absorbs = false, aggro = true, buffWatch = false },
    Nameplates = { buffs = 3, castBar = true, debuffs = 4, targetBorder = true, threat = true },
  },
}

-- The module parts every role preset carries, in the string's order.
local PARTS = { "Nameplates", "RaidAuras", "RaidFrames", "RaidHealing" }

-- A role's settings as a partial profile string, what /vg export of those parts makes.
local function presetText(role)
  local data = { parts = PARTS }
  for _, part in ipairs(PARTS) do data[part] = ns.ROLE_SETTINGS[role][part] end
  return ns.Serialize.Encode("parts", ns.StampPayload(data))
end

ns.BUILTIN_PRESETS = {
  { name = "Healer", info = L["Raid frames sorted by role with power bars, raid debuffs, HoTs and incoming heals, short debuff rows and no buffs on players' nameplates."], text = presetText("Healer") },
  { name = "Damage", info = L["Compact raid frames without power bars or heal overlays, longer debuff rows, threat colours and no buffs on players' nameplates."], text = presetText("Damage") },
  { name = "Tank", info = L["Raid frames sorted by role with the aggro strip, threat colours, target border and buff rows on nameplates."], text = presetText("Tank") },
}
