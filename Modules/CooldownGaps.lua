-- Cooldown gaps: a small, display-only row of icons for what the game's Cooldown
-- Manager misses, in the Vanguard look and in a spot you can move:
--   * on-use trinkets you wear, and the items you choose (a Healthstone, a potion:
--     /vg gaps add <item>) while you carry them;
--   * your pet's abilities (the pet bar);
--   * totems you have down, unless the class bars already show them.
-- It adds to the game's manager and never replaces it. Off until you switch it on.
-- Cooldown values can be hidden from addons: a duration object goes straight to the
-- sweep, a plain number is drawn only when the client hands it over readable, and an
-- icon whose cooldown the client won't say shows nothing. Nothing here is clickable
-- or protected, so it works the same in combat. A source the client lacks adds nothing.

local ADDON, ns = ...

local A = ns.Auras

local CG = ns.Module("CooldownGaps", { defaults = { on = false, items = "" } })

CG.SIZE, CG.GAP, CG.MAX, CG.PET_SLOTS, CG.TOTEM_SLOTS = 24, 3, 12, 10, 4
-- The trinket slots (INVSLOT_TRINKET1, INVSLOT_TRINKET2).
CG.TRINKETS = { 13, 14 }
-- Events that change what the row shows.
CG.EVENTS = { "BAG_UPDATE_COOLDOWN", "BAG_UPDATE_DELAYED", "SPELL_UPDATE_COOLDOWN", "PET_BAR_UPDATE", "PET_BAR_UPDATE_COOLDOWN", "PLAYER_TOTEM_UPDATE", "PLAYER_EQUIPMENT_CHANGED", "PLAYER_ENTERING_WORLD" }

-- Sweeps -----------------------------------------------------------------------------------------

-- Draws a plain start and length when both are readable; false when the client hides them.
local function plainSweep(cd, start, duration)
  local s, d = ns.PlainNumber(start), ns.PlainNumber(duration)
  if not s or not d then return false end
  if d > 0 then cd:SetCooldown(s, d) else cd:Clear() end
  return true
end

-- Gives the client's duration object to the sweep; false when there is none to give.
local function objectSweep(cd, object)
  if object == nil or not ns.Client.Has("cooldownObject") then return false end
  cd:SetCooldownFromDurationObject(object)
  return true
end

-- Items ------------------------------------------------------------------------------------------

-- An item's start, length and enable, from whichever API this client has.
local function itemCooldown(id)
  local get = (C_Item and C_Item.GetItemCooldown) or (C_Container and C_Container.GetItemCooldown)
  if type(get) == "function" then return get(id) end
end

-- True when the item has an on-use spell (all items, where the client can't say).
local function onUse(id)
  local spell = C_Item and C_Item.GetItemSpell
  return type(spell) ~= "function" or spell(id) ~= nil
end

-- The item IDs written in the items setting.
function CG.Chosen(settings)
  local out = {}
  for id in tostring(settings.items or ""):gmatch("%d+") do out[#out + 1] = tonumber(id) end
  return out
end

-- The item IDs to show: worn on-use trinkets, then chosen items you carry; each once.
function CG.ItemIDs(settings)
  local ids, seen = {}, {}
  -- Adds an item once, when it is there and has an on-use spell.
  local function add(id) if id and not seen[id] and onUse(id) then seen[id] = true ids[#ids + 1] = id end end
  for _, slot in ipairs(CG.TRINKETS) do add(type(GetInventoryItemID) == "function" and GetInventoryItemID("player", slot) or nil) end
  for _, id in ipairs(CG.Chosen(settings)) do add(C_Item.GetItemCount(id) > 0 and id or nil) end
  return ids
end

-- One item entry: its icon and how its sweep is drawn.
local function itemEntry(id)
  local icon = select(5, C_Item.GetItemInfoInstant(id))
  return { icon = icon, sweep = function(cd) return plainSweep(cd, itemCooldown(id)) end }
end

-- Pets -------------------------------------------------------------------------------------------

-- A pet ability's sweep: the client's duration object for its spell, else the pet bar's plain numbers.
local function petSweep(cd, slot, spellID)
  local get = C_Spell and C_Spell.GetSpellCooldownDuration
  if type(get) == "function" and spellID and objectSweep(cd, get(spellID)) then return true end
  if type(GetPetActionCooldown) ~= "function" then return false end
  return plainSweep(cd, GetPetActionCooldown(slot))
end

-- The pet bar's abilities (not its stance tokens): icon and sweep each.
function CG.PetEntries()
  local out = {}
  if type(GetPetActionInfo) ~= "function" then return out end
  for slot = 1, CG.PET_SLOTS do
    local name, icon, isToken, _, _, _, spellID = GetPetActionInfo(slot)
    if name and not isToken then out[#out + 1] = { icon = icon, sweep = function(cd) return petSweep(cd, slot, spellID) end } end
  end
  return out
end

-- Totems -----------------------------------------------------------------------------------------

-- A totem slot's sweep: the client's duration object where it has one, else its plain numbers.
local function totemSweep(cd, slot, start, duration)
  if type(GetTotemDuration) == "function" and objectSweep(cd, GetTotemDuration(slot)) then return true end
  return plainSweep(cd, start, duration)
end

-- The totems down, as entries; none while a hidden answer says nothing, or when the class bars show them.
function CG.TotemEntries()
  local out, bars = {}, ns.GetModule("ClassBars")
  if type(GetTotemInfo) ~= "function" or (bars and bars.cells) then return out end
  for slot = 1, CG.TOTEM_SLOTS do
    local have, _, start, duration, icon = GetTotemInfo(slot)
    if have == true then out[#out + 1] = { icon = icon, sweep = function(cd) return totemSweep(cd, slot, start, duration) end } end
  end
  return out
end

-- The row --------------------------------------------------------------------------------------

-- Everything the row shows now, in order: items, pet abilities, totems.
function CG.Entries(settings)
  local out = {}
  for _, id in ipairs(CG.ItemIDs(settings)) do out[#out + 1] = itemEntry(id) end
  for _, list in ipairs({ CG.PetEntries(), CG.TotemEntries() }) do
    for _, e in ipairs(list) do out[#out + 1] = e end
  end
  return out
end

-- The theme's countdown numbers on a cell's sweep.
local function dress(cell)
  local parts = A.Dress(cell, { size = CG.SIZE })
  cell.icon, cell.cooldown = parts.icon, parts.cooldown
  A.Countdown(cell.cooldown, CG.SIZE)
  return cell
end

-- The i-th cell, made on first use.
local function cellAt(i)
  CG.cells = CG.cells or {}
  CG.cells[i] = CG.cells[i] or dress(CreateFrame("Frame", nil, CG.holder))
  return CG.cells[i]
end

-- Paints a cell from an entry; false (and the cell stays out) when the client won't say.
local function paint(cell, entry)
  cell.icon:SetTexture(entry.icon)
  return entry.sweep(cell.cooldown) == true
end

-- Centers the first n cells on the holder; hides the rest.
local function place(n)
  local step = CG.SIZE + CG.GAP
  for i, cell in ipairs(CG.cells or {}) do
    cell:ClearAllPoints()
    cell:SetPoint("CENTER", CG.holder, "CENTER", (i - 1) * step - (n - 1) * step / 2, 0)
    if i <= n then cell:Show() else cell:Hide() end
  end
end

-- Repaints the row: one cell per entry the client could read.
function CG.Refresh()
  local n = 0
  for _, entry in ipairs(CG.Entries(CG.settings)) do
    if n < CG.MAX and paint(cellAt(n + 1), entry) then n = n + 1 end
  end
  place(n)
end

-- Commands ---------------------------------------------------------------------------------------

-- The item ID in text: a number, an item link, or an item's name the client knows; nil if none.
local function itemID(text)
  local id = tonumber(text) or tonumber(text:match("item:(%d+)"))
  if id then return id end
  return text ~= "" and C_Item and C_Item.GetItemInfoInstant and (C_Item.GetItemInfoInstant(text)) or nil
end

-- Writes the chosen IDs back into the setting and repaints.
local function save(ids)
  CG.settings.items = table.concat(ids, " ")
  if CG.holder then CG.Refresh() end
end

-- Adds an item to the chosen list (or says why not).
function CG.Add(text)
  local id, ids = itemID(text), CG.Chosen(CG.settings)
  if not id then return ns.Chat("Say an item: a link, an ID, or a name the game knows. /vg gaps add <item>") end
  for _, have in ipairs(ids) do if have == id then return ns.Chat("Already showing item " .. id .. ".") end end
  ids[#ids + 1] = id
  save(ids)
  ns.Chat("Showing item " .. id .. " while you carry it.")
end

-- Takes an item off the chosen list.
function CG.Remove(text)
  local id, ids = itemID(text), CG.Chosen(CG.settings)
  for i, have in ipairs(ids) do
    if have == id then table.remove(ids, i) save(ids) return ns.Chat("No longer showing item " .. id .. ".") end
  end
  ns.Chat("Item " .. tostring(id or text) .. " is not on the list.")
end

-- /vg gaps [add <item> | remove <item> | list | clear].
function CG.Command(rest)
  local verb, arg = (rest or ""):match("^(%S*)%s*(.-)$")
  if not CG.settings then return ns.Chat("The cooldown gaps row is off. Turn it on under /vg > Windows and tools, then /reload.") end
  if verb == "add" then return CG.Add(arg) end
  if verb == "remove" then return CG.Remove(arg) end
  if verb == "clear" then save({}) return ns.Chat("Chosen items forgotten.") end
  ns.Chat("Chosen items: " .. (CG.settings.items ~= "" and CG.settings.items or "none") .. ". /vg gaps add <item> adds one.")
end

-- Module entry point (Core/Modules.lua): off until switched on.
function CG.Enable(settings)
  if not settings.on then return end
  CG.settings = settings
  CG.holder = CreateFrame("Frame", "Vanguard_CooldownGaps", UIParent)
  CG.holder:SetSize(6 * (CG.SIZE + CG.GAP), CG.SIZE)
  ns.Mover(CG.holder, "cdm_gaps", "Cooldown gaps", { "BOTTOM", "BOTTOM", 0, 306 })
  for _, event in ipairs(CG.EVENTS) do ns.On(event, CG.Refresh) end
  CG.Refresh()
end
