-- Character sheet extras: on the character pane each gear slot shows its item level along the top edge
-- (on by default) and, if you switch it on, a "!" in the warning colour on a worn piece that could carry
-- an enchant and has none. /vg gear says the same in chat: your average item level, your melee damage per
-- second from the game's own damage and speed figures, and the pieces missing an enchant.
--
-- Everything is read from the client (the worn item's link and its item info, UnitDamage and
-- UnitAttackSpeed). Nothing here is protected, so it also works in combat; a value the client hides is
-- left out, never guessed. Which slots take an enchant is CE.ENCHANTABLE; an off-hand counts only when it
-- is a weapon or a shield, and only gear of uncommon quality or better is marked.

local ADDON, ns = ...

local T = ns.Theme

local CE = ns.Module("CharacterExtras", { defaults = { itemLevel = true, enchant = false } })

ns.Options.MODULE_INFO.CharacterExtras = { "Character sheet extras", "Item level on each gear slot of the character pane, optional marks for missing enchants, and /vg gear." }

-- The worn slots that can carry an enchant (inventory slot ids), by the name /vg gear gives them.
CE.ENCHANTABLE = { [5] = "Chest", [7] = "Legs", [8] = "Feet", [9] = "Wrist", [10] = "Hands", [15] = "Back", [16] = "Main hand", [17] = "Off hand" }
-- The off-hand slot, which takes an enchant only as a weapon or a shield (not a held item).
CE.OFF_HAND = 17
-- The item types (the client's equip locations) of an off-hand piece that takes an enchant: the weapons and the shield.
CE.ENCHANTABLE_OFF_HAND = { INVTYPE_WEAPON = true, INVTYPE_WEAPONOFFHAND = true, INVTYPE_WEAPONMAINHAND = true, INVTYPE_2HWEAPON = true, INVTYPE_SHIELD = true }
-- The worn slots that count toward the average item level (everything but the shirt, id 4, and the tabard, id 19).
CE.GEAR = { 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18 }
-- The lowest item quality that gets an enchant mark (2 = uncommon).
CE.MIN_QUALITY = 2

local labels = ns.FrameState("vgGearInfo")

-- Reading the worn item ---------------------------------------------------------------------------

-- The worn item in an inventory slot as { link, level, quality, loc }, or nil when the slot is empty or the client won't say.
function CE.Worn(slot)
  local link = GetInventoryItemLink("player", slot)
  if ns.IsSecret(link) or type(link) ~= "string" then return nil end
  local _, _, quality, level, _, _, _, _, loc = C_Item.GetItemInfo(link)
  return { link = link, level = ns.PlainNumber(level), quality = ns.PlainNumber(quality), loc = loc }
end

-- Whether a worn piece could carry an enchant and has none (the link's enchant field is empty or 0).
function CE.MissingEnchant(slot, item)
  if not (CE.ENCHANTABLE[slot] and item and (item.quality or 0) >= CE.MIN_QUALITY) then return false end
  if slot == CE.OFF_HAND and not CE.ENCHANTABLE_OFF_HAND[item.loc] then return false end
  local enchant = item.link:match("item:%d+:(%d*)")
  return enchant == nil or enchant == "" or enchant == "0"
end

-- The names of the worn pieces missing an enchant, in slot order.
function CE.Missing()
  local out = {}
  for slot = 1, 19 do
    if CE.MissingEnchant(slot, CE.Worn(slot)) then out[#out + 1] = CE.ENCHANTABLE[slot] end
  end
  return out
end

-- The average item level of the gear worn (rounded), and how many pieces it is from; nil with none known.
function CE.Average()
  local sum, n = 0, 0
  for _, slot in ipairs(CE.GEAR) do
    local item = CE.Worn(slot)
    if item and item.level then sum, n = sum + item.level, n + 1 end
  end
  if n == 0 then return nil end
  return math.floor(sum / n + 0.5), n
end

-- Melee damage per second: the average hit (the game's damage figures, with its bonuses) over the swing time.
-- Nil when the client won't say or the swing time is zero.
local function dps(low, high, speed, pos, neg, percent)
  low, high, speed = ns.PlainNumber(low), ns.PlainNumber(high), ns.PlainNumber(speed)
  if not (low and high and speed and speed > 0) then return nil end
  local hit = ((low + high) / 2 + (ns.PlainNumber(pos) or 0) + (ns.PlainNumber(neg) or 0)) * (ns.PlainNumber(percent) or 1)
  return hit / speed
end

-- Your main hand's damage per second and swing time, and your off hand's (nil when you have none); all nil when the client has no figures.
function CE.Melee()
  if type(UnitDamage) ~= "function" or type(UnitAttackSpeed) ~= "function" then return nil end
  local low, high, offLow, offHigh, pos, neg, percent = UnitDamage("player")
  local main, off = UnitAttackSpeed("player")
  local mainDps = dps(low, high, main, pos, neg, percent)
  return mainDps, ns.PlainNumber(main), off and dps(offLow, offHigh, off, pos, neg, percent) or nil
end

-- The slot labels -----------------------------------------------------------------------------------

-- A slot button's two labels (made once): the item level along the top, the enchant mark in the top-right corner.
local function slotLabels(button)
  if not labels[button] then
    local level = T.Text(button:CreateFontString(nil, "OVERLAY"), "auraCount", "text")
    level:SetPoint("TOP", button, "TOP", 0, -2)
    local mark = T.Text(button:CreateFontString(nil, "OVERLAY"), "auraCount", "warn")
    mark:SetPoint("TOPRIGHT", button, "TOPRIGHT", -2, -2)
    mark:SetText("!")
    labels[button] = { level = level, mark = mark }
  end
  return labels[button]
end

-- One gear slot's labels from what it wears and the settings.
function CE.PaintSlot(button)
  local l, slot = slotLabels(button), button:GetID()
  local item = CE.Worn(slot)
  l.level:SetShown(CE.settings.itemLevel and item ~= nil and item.level ~= nil)
  if item and item.level then l.level:SetText(item.level) end
  l.mark:SetShown(CE.settings.enchant and CE.MissingEnchant(slot, item))
end

-- Every gear slot on the character pane, while it is open.
function CE.PaintAll()
  if not (_G.CharacterFrame and _G.CharacterFrame:IsShown()) then return end
  for _, name in ipairs(ns.GetModule("Windows").SLOTS) do
    local b = _G["Character" .. name .. "Slot"]
    if type(b) == "table" and b.GetID then CE.PaintSlot(b) end
  end
end

-- /vg gear ----------------------------------------------------------------------------------------------

-- The lines /vg gear prints.
function CE.Lines()
  local lines, avg, n = {}, CE.Average()
  lines[1] = avg and string.format("Average item level %d (%d pieces).", avg, n) or "No item levels known yet."
  local main, speed, off = CE.Melee()
  if main then lines[#lines + 1] = string.format("Melee %.1f damage per second (%.1f s swing)%s.", main, speed, off and string.format(", off hand %.1f", off) or "") end
  local missing = CE.Missing()
  lines[#lines + 1] = #missing > 0 and ("Missing an enchant: " .. table.concat(missing, ", ") .. ".") or "No worn piece is missing an enchant."
  return lines
end

-- /vg gear: your gear in a few lines.
function CE.Command()
  for _, line in ipairs(CE.Lines()) do ns.Chat(line) end
end

-- Options -----------------------------------------------------------------------------------------------

-- get/set for one of the module's settings (also while it is off), repainting the pane on a change, and the default.
local function setting(key)
  return function() return ns.Settings("CharacterExtras", CE.defaults)[key] end,
    function(v) ns.Settings("CharacterExtras", CE.defaults)[key] = v if CE.settings then CE.PaintAll() end end, CE.defaults[key]
end

-- The module's card on the Game windows page.
function CE.Rows()
  return {
    { "header", "Character sheet extras" },
    { "check", "Item level on each gear slot of the character pane", setting("itemLevel") },
    { "check", "Mark worn pieces missing an enchant with a !", setting("enchant") },
    { "button", "Show my gear summary in chat", CE.Command },
  }
end
ns.Options.AddRows("windows", CE.Rows)

-- Module entry point (Core/Modules.lua): the labels when the pane opens and as gear changes. Nothing without the pane.
function CE.Enable(settings)
  CE.settings = settings
  local pane = _G.CharacterFrame
  if type(pane) ~= "table" or type(GetInventoryItemLink) ~= "function" then return end
  pane:HookScript("OnShow", ns.Guard("character extras", CE.PaintAll))
  for _, e in ipairs({ "PLAYER_EQUIPMENT_CHANGED", "UNIT_INVENTORY_CHANGED", "GET_ITEM_INFO_RECEIVED" }) do ns.On(e, CE.PaintAll) end
end
