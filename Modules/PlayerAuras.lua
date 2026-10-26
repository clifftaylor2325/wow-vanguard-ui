-- Your own buffs and debuffs, in place of the game's buff frame: one aura
-- container (Core/Auras.lua) left of the minimap, buffs first and your
-- debuffs from a new row under them, with timers. Right-click a buff to
-- cancel it (the client's own click on its aura containers).
-- Weapon enchants (poisons, stones, oils, and a shaman's imbues on WoW
-- Forever) are cells in front of the buffs, which move over to make room.
-- They're read here per weapon (C_Item.GetWeaponEnchantInfo), since the
-- client's own enchant cells miss Forever's imbues. The container's groups
-- are fixed once built, so the settings apply after a reload.

local ADDON, ns = ...

local L = ns.L

local A = ns.Auras
local UF = ns.GetModule("UnitFrames")

local PA = ns.Module("PlayerAuras", {
  defaults = { size = 30, perRow = 12, buffs = 32, debuffs = 16, timers = true, enchants = true },
})

PA.GAP = 4
-- The Masque group your buffs, debuffs and weapon enchants are in, when Masque is loaded (Core/Masque.lua).
PA.MASQUE = "Buffs and debuffs"
-- The game's frames this replaces: the buff and debuff frames, and their newer companions
-- (external defensives cast on you, the deadly debuff warning), where the client has them.
PA.BLIZZARD = { "BuffFrame", "DebuffFrame", "ExternalDefensivesFrame", "DeadlyDebuffFrame" }
-- Weapon slot name (Enum.WeaponSlot) and inventory slot, in cell order from the right.
PA.WEAPONS = { { "MainHand", 16 }, { "OffHand", 17 }, { "Ranged", 18 } }

-- The default spot, left of the minimap, and the room it keeps clear on its left: the main tanks' right
-- edge (TOPLEFT 400, 236 wide; Modules/MainTanks.lua) and a gap.
PA.SPOT = { "TOPRIGHT", "TOPRIGHT", -210, -14 }
PA.LEFT_CLEAR = 640
-- Never fewer buffs in a row than this, so the block doesn't run down the screen: 32 buffs take 7 rows. Under
-- 1020 wide that row reaches the main tanks' spot (shown only in a raid).
PA.MIN_PER_ROW = 5

-- The container -----------------------------------------------------------------------------

-- Buffs in a row: the setting, or fewer (down to PA.MIN_PER_ROW) on a canvas too narrow for a whole row between
-- the main tanks and the default spot (under 1254 wide at the default 12), so the block grows down instead of
-- over them; the setting as it is once your buffs have a spot of their own.
function PA.PerRow(s)
  local w = ns.PlainNumber(UIParent:GetWidth())
  if ns.MoverSaved("playerauras") or not w or w == 0 then return s.perRow end
  local fit = math.floor((w + PA.SPOT[3] - PA.LEFT_CLEAR) / (s.size + PA.GAP))
  return math.min(s.perRow, math.max(PA.MIN_PER_ROW, fit))
end

-- Buffs from the top-right corner, growing left and down; debuffs start a new row after them.
function PA.Spec(holder, s)
  return { point = { "TOPRIGHT", holder, "TOPRIGHT", 0, 0 }, grow = "LEFT", growY = "DOWN",
    lineSize = PA.PerRow(s) * (s.size + PA.GAP), gap = PA.GAP, timer = s.timers, cancel = true, masque = PA.MASQUE,
    groups = { { filter = "HELPFUL", max = s.buffs, size = s.size },
      { filter = "HARMFUL", max = s.debuffs, size = s.size, debuff = true, newLine = true } } }
end

-- Moves the container over to leave room for n enchant cells at the right.
function PA.PlaceAuras(n)
  local frame = PA.auras.frame
  frame:ClearAllPoints()
  frame:SetPoint("TOPRIGHT", PA.holder, "TOPRIGHT", -n * (PA.settings.size + PA.GAP), 0)
end

-- Weapon enchants ---------------------------------------------------------------------------

-- A plain value, or nil when the client hides it.
local function plain(v)
  if ns.IsSecret(v) then return nil end
  return v
end

-- A weapon's timed enchant from the client's list for it, or nil.
local function timedEnchant(list)
  for _, e in ipairs(type(list) == "table" and list or {}) do
    if plain(e.hasEnchant) == true and (ns.PlainNumber(e.timeLeft) or 0) > 0 then return e end
  end
end

-- The icon for an enchant: its own, else the weapon's.
local function enchantIcon(e, inv)
  local icon = plain(e.enchantIconID)
  if icon and icon ~= 0 then return icon end
  return type(GetInventoryItemTexture) == "function" and GetInventoryItemTexture("player", inv) or nil
end

-- The enchants to show: { inv, icon, left (seconds) } per weapon with a timed one.
function PA.Enchants()
  local out, slots, get = {}, Enum and Enum.WeaponSlot, C_Item and C_Item.GetWeaponEnchantInfo
  if not slots or type(get) ~= "function" then return out end
  for _, w in ipairs(PA.WEAPONS) do
    local e = slots[w[1]] ~= nil and timedEnchant(get(slots[w[1]])) or nil
    if e then out[#out + 1] = { inv = w[2], icon = enchantIcon(e, w[2]), left = e.timeLeft / 1000 } end
  end
  return out
end

-- The weapon's tooltip over its enchant cell.
local function showTooltip(c)
  if not GameTooltip or not c.inv then return end
  GameTooltip:SetOwner(c, "ANCHOR_BOTTOMLEFT")
  GameTooltip:SetInventoryItem("player", c.inv)
  GameTooltip:Show()
end

-- Hides the weapon's tooltip.
local function hideTooltip()
  if GameTooltip then GameTooltip:Hide() end
end

-- One enchant cell, dressed like the buffs, with the client's countdown numbers.
local function enchantCell(holder, i, size)
  local c = CreateFrame("Frame", nil, holder)
  local parts = A.Dress(c, { size = size, masque = PA.MASQUE })
  c.icon, c.cooldown = parts.icon, parts.cooldown
  A.Countdown(c.cooldown, size)
  c:SetPoint("TOPRIGHT", holder, "TOPRIGHT", -(i - 1) * (size + PA.GAP), 0)
  c:SetScript("OnEnter", showTooltip)
  c:SetScript("OnLeave", hideTooltip)
  c.cooldown:SetScript("OnCooldownDone", function() PA.UpdateEnchants() end)
  c:Hide()
  return c
end

-- Each shown enchant's sweep, by the weapon's inventory slot: { total, left }, its full
-- length from when it was put on and the seconds left when last seen.
PA.sweeps = {}

-- Keeps each enchant's sweep length by weapon, not by cell (the cells shift when an enchant
-- ends), so it empties as the enchant runs out; a fresh or longer one starts again.
local function keepSweeps(list)
  local kept = {}
  for _, e in ipairs(list) do
    local seen = PA.sweeps[e.inv]
    local fresh = not seen or e.left > seen.left + 1
    e.total = fresh and e.left or seen.total
    kept[e.inv] = { total = e.total, left = e.left }
  end
  PA.sweeps = kept
end

-- Fills a cell from an enchant, or hides it.
local function paintCell(c, e)
  c:SetShown(e ~= nil)
  if not e then c.inv = nil return end
  c.inv = e.inv
  c.icon:SetTexture(e.icon)
  c.cooldown:SetCooldown(GetTime() - (e.total - e.left), e.total)
end

-- Shows the enchant cells and moves the buffs over to make room for them.
function PA.UpdateEnchants()
  if not PA.cells then return end
  local list = PA.settings.enchants and PA.Enchants() or {}
  keepSweeps(list)
  for i, c in ipairs(PA.cells) do paintCell(c, list[i]) end
  PA.PlaceAuras(#list)
end

-- Building ----------------------------------------------------------------------------------

-- The movable holder left of the minimap, the container and the enchant cells.
local function build(s)
  PA.holder = CreateFrame("Frame", "Vanguard_PlayerAuras", UIParent)
  PA.holder:SetSize(PA.PerRow(s) * (s.size + PA.GAP), s.size)
  ns.Mover(PA.holder, "playerauras", L["Your buffs and debuffs"], PA.SPOT)
  PA.auras = A.Container(PA.holder, PA.Spec(PA.holder, s), "player")
  PA.cells = {}
  for i = 1, #PA.WEAPONS do PA.cells[i] = enchantCell(PA.holder, i, s.size) end
  PA.UpdateEnchants()
end

-- A weapon or inventory event: only yours matters.
local function onWeapons(_, unit)
  if unit == nil or unit == "player" then PA.UpdateEnchants() end
end

-- Module entry point (Core/Modules.lua): hide the game's buff frames, build
-- out of combat, and follow weapon changes (the container follows UNIT_AURA itself).
function PA.Enable(settings)
  PA.settings = settings
  for _, name in ipairs(PA.BLIZZARD) do UF.HideBlizzard(name) end
  ns.OutOfCombat(function() build(settings) end)
  for _, e in ipairs({ "UNIT_INVENTORY_CHANGED", "WEAPON_ENCHANT_CHANGED", "WEAPON_SLOT_CHANGED", "PLAYER_ENTERING_WORLD" }) do ns.On(e, onWeapons) end
end
