-- /fui factionart: which of the game's own faction pictures this client has.
-- ForeverUI never copies Blizzard's faction art; this only checks what the
-- client already ships, so the faction look can point at it where it exists
-- (and use the open-licensed crests where it doesn't).

local ADDON, ns = ...

local T = ns.Theme

local FA = {}
ns.FactionArt = FA

-- Atlases the game's own UI uses for each faction (from its unit frames and mount journal).
FA.ATLASES = {
  "UI-HUD-UnitFrame-Player-PVP-AllianceIcon", "UI-HUD-UnitFrame-Player-PVP-HordeIcon",
  "MountJournalIcons-Alliance", "MountJournalIcons-Horde",
}
-- Texture files older clients use for each faction (the PvP badge and the battleground timer).
FA.FILES = {
  "Interface\\TargetingFrame\\UI-PVP-Alliance", "Interface\\TargetingFrame\\UI-PVP-Horde",
  "Interface\\Timer\\Alliance-Logo", "Interface\\Timer\\Horde-Logo",
}

-- True when the client knows an atlas by this name.
function FA.HasAtlas(name)
  local get = C_Texture and C_Texture.GetAtlasInfo
  return type(get) == "function" and type((get(name))) == "table"
end

-- True when a texture file loads (a hidden test texture takes it; the client says whether it could).
function FA.HasFile(file)
  FA.tester = FA.tester or UIParent:CreateTexture(nil, "BACKGROUND")
  FA.tester:Hide()
  return FA.tester:SetTexture(file) == true
end

-- Your faction ("Alliance", "Horde", or "none" for neutral and hidden answers).
function FA.Faction()
  local faction = type(UnitFactionGroup) == "function" and UnitFactionGroup("player")
  if ns.IsSecret(faction) or (faction ~= "Alliance" and faction ~= "Horde") then return "none" end
  return faction
end

-- One line of the report: a name, and whether the client has it.
local function line(kind, name, found)
  ns.Chat(string.format("  %s %s  %s", kind, name, found and T.Paint("yes", "good") or T.Paint("missing", "muted")))
end

-- A neutral character who just picked a side gets the faction look at once.
ns.On("NEUTRAL_FACTION_SELECT_RESULT", function() T.Refresh() end)

-- Prints the report: your faction, then each atlas and file and whether it's there.
function FA.Report()
  ns.Chat("Faction art on this client (you're " .. FA.Faction() .. "):")
  for _, name in ipairs(FA.ATLASES) do line("atlas", name, FA.HasAtlas(name)) end
  for _, file in ipairs(FA.FILES) do line("file", file, FA.HasFile(file)) end
end
