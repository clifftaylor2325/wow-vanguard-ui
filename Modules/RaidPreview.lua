-- Raid frames preview: the raid tiles filled with sample players (a party of
-- five, or a raid of 10, 25 or 40), so their size, style and layout can be
-- checked without a group. The preview tiles are plain frames dressed and
-- painted by the raid frames' own parts (Modules/RaidFrames.lua), laid out as
-- the group header would lay out the real ones, from the same settings, and
-- pinned to the raid frames' holder. The secure header and its buttons are
-- never touched. It is a passing state, not a setting: off after a reload,
-- when you join a group, and when combat starts.

local ADDON, ns = ...

local T = ns.Theme
local L = ns.L
local RF = ns.GetModule("RaidFrames")

local RP = { size = 0, tiles = {} }
ns.RaidPreview = RP

-- The preview's sizes as { players, label } (0 is off; 5 is a party on the raid tiles).
RP.CHOICES = { { 0, L["Off"] }, { 5, L["Party (5)"] }, { 10, L["Raid (10)"] }, { 25, L["Raid (25)"] }, { 40, L["Raid (40)"] } }
-- /vg preview's words -> sizes.
RP.WORDS = { off = 0, party = 5, ["5"] = 5, ["10"] = 10, ["25"] = 25, ["40"] = 40 }

-- Every sample player's maximum health.
local MAX_HEALTH = 4000
-- A class's power as { color token, how full }; everyone else has mana, mostly full.
local POWER = { WARRIOR = { "rage", 0.3 }, ROGUE = { "energy", 1 }, other = { "mana", 0.8 } }
-- Where each role goes when sorted by role (the header's groupingOrder).
local ROLE_ORDER = { TANK = 1, HEALER = 2, DAMAGER = 3 }

-- The sample roster, five to a group: { name, class, role, share of health, "Dead" / "Offline" }.
-- The first group is the party preview, so it has the dead and the offline player.
RP.ROSTER = {
  { "Aldren", "WARRIOR", "TANK", 0.64 }, { "Brielle", "PRIEST", "HEALER", 0.92 }, { "Corwyn", "ROGUE", "DAMAGER", 1 },
  { "Dagny", "MAGE", "DAMAGER", 0, L["Dead"] }, { "Elowen", "HUNTER", "DAMAGER", 1, L["Offline"] },
  { "Fennick", "WARRIOR", "TANK", 0.81 }, { "Galora", "DRUID", "HEALER", 1 }, { "Hesketh", "WARLOCK", "DAMAGER", 0.55 },
  { "Isolde", "MAGE", "DAMAGER", 1 }, { "Jorund", "SHAMAN", "HEALER", 0.88 },
  { "Kestra", "PALADIN", "HEALER", 0.97 }, { "Lorcan", "ROGUE", "DAMAGER", 0.73 }, { "Maelis", "PRIEST", "HEALER", 1 },
  { "Norrin", "HUNTER", "DAMAGER", 0.42 }, { "Orla", "WARLOCK", "DAMAGER", 1 },
  { "Perrin", "WARRIOR", "TANK", 0.69 }, { "Quillan", "DRUID", "DAMAGER", 1 }, { "Rowena", "MAGE", "DAMAGER", 0.86 },
  { "Sorcha", "PRIEST", "HEALER", 1 }, { "Tamsin", "ROGUE", "DAMAGER", 0.94 },
  { "Ulric", "PALADIN", "HEALER", 0.78 }, { "Vesna", "HUNTER", "DAMAGER", 1 }, { "Wystan", "WARLOCK", "DAMAGER", 0.61 },
  { "Xanthe", "MAGE", "DAMAGER", 1 }, { "Yorick", "SHAMAN", "DAMAGER", 0.9 },
  { "Zelda", "WARRIOR", "TANK", 0.83 }, { "Ansel", "DRUID", "HEALER", 1 }, { "Bryony", "ROGUE", "DAMAGER", 0.5 },
  { "Caspian", "PRIEST", "HEALER", 0.95 }, { "Delphine", "HUNTER", "DAMAGER", 1 },
  { "Emrys", "MAGE", "DAMAGER", 0.77 }, { "Freya", "PALADIN", "DAMAGER", 1 }, { "Gideon", "WARLOCK", "DAMAGER", 0.88 },
  { "Haldis", "SHAMAN", "HEALER", 1 }, { "Ivo", "ROGUE", "DAMAGER", 0.66 },
  { "Jessamy", "WARRIOR", "DAMAGER", 1 }, { "Kenric", "HUNTER", "DAMAGER", 0.93 }, { "Liesel", "MAGE", "DAMAGER", 1 },
  { "Merrick", "WARLOCK", "DAMAGER", 0.71 }, { "Nessa", "DRUID", "DAMAGER", 1 },
}
for i, s in ipairs(RP.ROSTER) do s.index = i end

-- Sample players -----------------------------------------------------------------------------

-- A class's color as r, g, b (the friendly color on a client without class colors).
local function classColor(class)
  local c = type(RAID_CLASS_COLORS) == "table" and RAID_CLASS_COLORS[class]
  if c then return c.r, c.g, c.b end
  return T.RGB("friendly")
end

-- True when sample a comes before sample b by role (tanks, healers, damage), then by place in the roster.
local function byRole(a, b)
  local ra, rb = ROLE_ORDER[a[3]], ROLE_ORDER[b[3]]
  if ra ~= rb then return ra < rb end
  return a.index < b.index
end

-- The first n samples in the order the header would show them: by group, or by role.
local function roster(n)
  local list = { unpack(RP.ROSTER, 1, n) }
  if RF.settings.sortByRole then table.sort(list, byRole) end
  return list
end

-- Painting ---------------------------------------------------------------------------------

-- The health bar, the status line (Dead, Offline or the missing health) and the colors for sample s.
local function paintHealth(b, s, r, g, bl)
  local health = math.floor(MAX_HEALTH * s[4] + 0.5)
  b.health:SetMinMaxValues(0, MAX_HEALTH)
  T.SetBarValue(b.health, health)
  RF.PaintStatus(b, s[5], RF.DeficitText(health, MAX_HEALTH))
  RF.PaintColors(b, r, g, bl)
end

-- The power bar for sample s, in its class's power (or hidden with the power bar off).
local function paintPower(b, s)
  if not RF.ShowPower(b) then return end
  local p = POWER[s[2]] or POWER.other
  RF.PaintPower(b, p[2], 1, T.RGB(p[1]))
end

-- Everything on a tile for sample s: name, role mark, top line, health and power.
local function paint(b, s)
  local r, g, bl = classColor(s[2])
  b.name:SetText(s[1])
  RF.PaintRole(b, RF.ROLE_MARKS[s[3]], "text2")
  RF.PaintTopLine(b, r, g, bl)
  paintHealth(b, s, r, g, bl)
  paintPower(b, s)
end

-- Layout -----------------------------------------------------------------------------------

-- Where tile k (counting from 0) sits from the grid's bottom left: groups of five as
-- columns (each growing up, side by side) or rows (each growing right, stacked upward).
local function place(k, s, key)
  local step, group = k % RF.GROUP, math.floor(k / RF.GROUP)
  if key == "rows" then return step * (s.width + s.spacing), group * (s.height + s.spacing) end
  return group * (s.width + s.spacing), step * (s.height + s.spacing)
end

-- The grid's width and height for n tiles.
local function gridSize(n, s)
  local across, up = math.ceil(n / RF.GROUP), math.min(n, RF.GROUP)
  if RF.LayoutFor(n) == "rows" then across, up = up, across end
  return across * (s.width + s.spacing) - s.spacing, up * (s.height + s.spacing) - s.spacing
end

-- Preview tile i, made (and dressed as a raid tile) the first time it's needed.
local function tile(i)
  local b = RP.tiles[i]
  if b then return b end
  b = CreateFrame("Frame", "Vanguard_RaidPreviewTile" .. i, RP.frame)
  b:SetSize(RF.settings.width, RF.settings.height)
  RF.Dress(b)
  RP.tiles[i] = b
  return b
end

-- Sizes, places and paints tile k + 1 for sample s, its texts in zones z.
local function lay(k, s, z)
  local b, set = tile(k + 1), RF.settings
  b:SetSize(set.width, set.height)
  b:ClearAllPoints()
  b:SetPoint("BOTTOMLEFT", RP.frame, "BOTTOMLEFT", place(k, set, RF.LayoutFor(RP.size)))
  RF.PlaceTexts(b, z)
  paint(b, s)
  b:Show()
end

-- Sets the preview's scale; when it changed, borders and pixel sizes are worked out again for it.
local function setScale(frame, scale)
  if frame:GetScale() == scale then return end
  frame:SetScale(scale)
  T.Rescale()
end

-- The preview's frame, sized for n tiles, drawn as large as the real grid for n
-- players, and pinned to the raid frames' holder as their header is (the holder moves to the spot
-- the real grid would take for n players, which RF.Fit puts back when the preview ends).
local function fit(n)
  RF.PlaceFor(n)
  local point = RF.HeaderPoint()
  RP.frame = RP.frame or CreateFrame("Frame", "Vanguard_RaidPreview", UIParent)
  setScale(RP.frame, RF.Scale(n))
  RP.frame:SetSize(gridSize(n, RF.settings))
  RP.frame:ClearAllPoints()
  RP.frame:SetPoint(point, RF.holder, point)
end

-- Draws the preview for RP.size players; tiles past them hide.
local function draw()
  local n = RP.size
  fit(n)
  local z = RF.Zones(RF.settings.width, RF.settings.height, RF.Scale(n))
  for k, s in ipairs(roster(n)) do lay(k - 1, s, z) end
  for i = n + 1, #RP.tiles do RP.tiles[i]:Hide() end
  RP.frame:Show()
end

-- Turning it on and off ---------------------------------------------------------------------

-- True while you're in a party or raid (a hidden answer counts as no).
local function inGroup()
  local yes = type(IsInGroup) == "function" and IsInGroup()
  return ns.IsTrue(yes)
end

-- Why the preview can't start now, or nil when it can.
local function blocked()
  if not RF.holder then return L["The raid frames are off (/vg > Modules), so there is nothing to preview."] end
  if ns.InCombat() then return L["In combat. Try the preview again once combat ends."] end
  if inGroup() then return L["You're in a group: your real party or raid frames are showing."] end
end

-- Turns the preview off: the sample frames hidden, refit() fits the real grid, then a chat line saying so
-- (said, when given: one that says why).
local function stop(said, refit)
  if RP.size == 0 then return end
  RP.size = 0
  RP.frame:Hide()
  refit()
  ns.Chat(said or L["Raid frames preview off."])
end

-- Turns the preview off and fits the real grid at once.
function RP.Stop(said)
  stop(said, RF.Fit)
end

-- Fits the real grid once the fight ends (the combat handler runs before the lockdown starts).
local function fitAfterCombat()
  ns.AfterCombat(RF.Fit, "raidfit")
end

-- Turns the preview off from the PLAYER_REGEN_DISABLED handler, and fits the real grid after the fight.
function RP.StopAtCombatStart(said)
  stop(said, fitAfterCombat)
end

-- Shows the preview with n sample players (5: a party; 10, 25 or 40: a raid), or turns
-- it off with 0. When it can't start, chat says why.
function RP.Set(n)
  if n == 0 then return RP.Stop() end
  local why = blocked()
  if why then return ns.Chat(why) end
  if RP.size == 0 then ns.Chat(L["Raid frames preview on, with sample players. /vg preview off, joining a group or combat ends it."]) end
  RP.size = n
  draw()
end

-- Draws the preview again (a raid frame setting changed); nothing while it's off.
function RP.Refresh()
  if RP.size > 0 then draw() end
end

-- /vg preview [party|10|25|40|off]; with nothing after it, a raid of 10, or off when it's on.
function RP.Command(rest)
  local word = (rest or ""):lower()
  if word == "" then return RP.Set(RP.size > 0 and 0 or 10) end
  local n = RP.WORDS[word]
  if not n then return ns.Chat(L["Usage: /vg preview [party | 10 | 25 | 40 | off]"]) end
  RP.Set(n)
end

-- A roster change: once you're in a real group, the preview ends.
ns.On("GROUP_ROSTER_UPDATE", function() if RP.size > 0 and inGroup() then RP.Stop(L["Raid frames preview off: you joined a group."]) end end)
-- Combat ends it at once.
ns.On("PLAYER_REGEN_DISABLED", function() RP.StopAtCombatStart(L["Raid frames preview off: combat started."]) end)
-- A new text size or UI scale: the preview is drawn again.
T.OnChanged(RP.Refresh)
