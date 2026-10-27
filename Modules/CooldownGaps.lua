-- Cooldown gaps: a small, display-only row of icons for what the game's Cooldown
-- Manager misses, in the Vanguard look and in a spot you can move:
--   * on-use trinkets you wear, and the items you choose (a Healthstone, a potion: dragged
--     onto the Gaps card on the Cooldowns page, or /vg gaps add <item>) while you carry them;
--   * your pet's abilities (the pet bar);
--   * totems you have down, unless the class bars already show them;
--   * spells you choose (on the Gaps card too, or /vg gaps spell add <spell>), and with "Cooldown Manager's cooldowns"
--     ticked, the spells the game's manager tracks in its essential and utility rows, each drawn
--     here as an icon with its sweep (a Vanguard-drawn cooldown row; charges and buff rows stay
--     with the game's manager).
-- It adds to the game's manager and never replaces it. Off until you switch it on.
-- Cooldown values can be hidden from addons: a duration object goes straight to the
-- sweep, a plain number is drawn only when the client hands it over readable, and an
-- icon whose cooldown the client won't say shows nothing. Nothing here is clickable
-- or protected, so it works the same in combat. A source the client lacks adds nothing.

local ADDON, ns = ...

local L = ns.L

local A = ns.Auras
local T, W = ns.Theme, ns.Widgets

local CG = ns.Module("CooldownGaps", { defaults = { on = false, items = "", spells = "", tracked = false } })

CG.SIZE, CG.GAP, CG.MAX, CG.PET_SLOTS, CG.TOTEM_SLOTS = 24, 3, 20, 10, 4
-- The trinket slots (INVSLOT_TRINKET1, INVSLOT_TRINKET2).
CG.TRINKETS = { 13, 14 }
-- Events that change what the row shows.
CG.EVENTS = { "BAG_UPDATE_COOLDOWN", "BAG_UPDATE_DELAYED", "SPELL_UPDATE_COOLDOWN", "PET_BAR_UPDATE", "PET_BAR_UPDATE_COOLDOWN", "PLAYER_TOTEM_UPDATE", "PLAYER_EQUIPMENT_CHANGED" }
-- Events that change the spells the game's manager tracks.
CG.REREAD = { "SPELLS_CHANGED", "PLAYER_SPECIALIZATION_CHANGED", "PLAYER_ENTERING_WORLD", "PLAYER_REGEN_ENABLED" }
-- The manager's rows drawn here, as Enum.CooldownViewerCategory keys.
CG.CATEGORIES = { "Essential", "Utility" }
-- The spells the game's manager tracks now, read when they change (not on every cooldown event).
CG.tracked = {}

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

-- The IDs written in a setting ("items" by default, or "spells").
function CG.Chosen(settings, key)
  local out = {}
  for id in tostring(settings[key or "items"] or ""):gmatch("%d+") do out[#out + 1] = tonumber(id) end
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

-- Spells -----------------------------------------------------------------------------------------

-- A plain start and length for a spell, from the table the client's cooldown call gives; false when hidden or missing.
local function plainSpell(cd, id)
  local info = C_Spell and C_Spell.GetSpellCooldown and C_Spell.GetSpellCooldown(id)
  if type(info) ~= "table" or ns.IsSecret(info) then return false end
  if not ns.IsSecret(info.isOnGCD) and info.isOnGCD == true then cd:Clear() return true end
  return plainSweep(cd, info.startTime, info.duration)
end

-- A spell's sweep: the client's duration object (global cooldown left out) where it has one, else
-- its plain numbers; false (no icon) when the client gives neither.
local function spellSweep(cd, id)
  local get = C_Spell and C_Spell.GetSpellCooldownDuration
  if type(get) ~= "function" or not ns.Client.Has("cooldownObject") then return plainSpell(cd, id) end
  return objectSweep(cd, get(id, true)) or plainSpell(cd, id)
end

-- The cooldown IDs of one of the manager's rows (a category), or none when the client refuses.
local function categoryIDs(category)
  local ok, ids = pcall(C_CooldownViewer.GetCooldownViewerCategorySet, category)
  if ok and not ns.IsSecret(ids) and type(ids) == "table" then return ids end
  return {}
end

-- True when the game's manager leaves a cooldown out of its rows until the player adds it (the
-- HideByDefault flag, as the manager's own settings read it). A hidden or missing flag counts as no.
local function hiddenByDefault(info)
  local flags = ns.PlainNumber(info.flags)
  local mask = Enum.CooldownSetSpellFlags and Enum.CooldownSetSpellFlags.HideByDefault
  return flags ~= nil and mask ~= nil and math.floor(flags / mask) % 2 == 1
end

-- The spell a manager cooldown stands for (its override first), or nil when unknown to you, hidden
-- by default in the manager, or refused.
local function trackedSpell(cooldownID)
  local ok, info = pcall(C_CooldownViewer.GetCooldownViewerCooldownInfo, cooldownID)
  if not ok or type(info) ~= "table" or ns.IsSecret(info) or info.isKnown == false then return nil end
  if hiddenByDefault(info) then return nil end
  return ns.PlainNumber(info.overrideSpellID) or ns.PlainNumber(info.spellID)
end

-- Reads the spells the game's manager tracks in the rows of CG.CATEGORIES, in its order.
function CG.ReadTracked()
  local out, viewer, enum = {}, C_CooldownViewer, Enum and Enum.CooldownViewerCategory
  CG.tracked = out
  if type(viewer) ~= "table" or type(enum) ~= "table" or type(viewer.GetCooldownViewerCategorySet) ~= "function" or type(viewer.GetCooldownViewerCooldownInfo) ~= "function" then return end
  for _, key in ipairs(CG.CATEGORIES) do
    for _, id in ipairs(enum[key] ~= nil and categoryIDs(enum[key]) or {}) do out[#out + 1] = trackedSpell(id) end
  end
end

-- The spell entries to show: the chosen spells, then the manager's, each once, when the client has an icon.
function CG.SpellEntries(settings)
  local out, seen = {}, {}
  local ids = CG.Chosen(settings, "spells")
  for _, id in ipairs(settings.tracked and CG.tracked or {}) do ids[#ids + 1] = id end
  for _, id in ipairs(ids) do
    local icon = not seen[id] and C_Spell and C_Spell.GetSpellTexture and C_Spell.GetSpellTexture(id)
    seen[id] = true
    if icon then out[#out + 1] = { icon = icon, sweep = function(cd) return spellSweep(cd, id) end } end
  end
  return out
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
    if not ns.IsSecret(have) and have == true then out[#out + 1] = { icon = icon, sweep = function(cd) return totemSweep(cd, slot, start, duration) end } end
  end
  return out
end

-- The row --------------------------------------------------------------------------------------

-- Everything the row shows now, in order: spells, items, pet abilities, totems.
function CG.Entries(settings)
  local out = CG.SpellEntries(settings)
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

-- The spell ID in text: a number, a spell link, or a spell's name the client knows; nil if none.
local function spellID(text)
  local id = tonumber(text) or tonumber(text:match("spell:(%d+)"))
  if id then return id end
  local info = text ~= "" and C_Spell and C_Spell.GetSpellInfo and C_Spell.GetSpellInfo(text)
  return type(info) == "table" and info.spellID or nil
end

-- The two chosen lists: the setting each is kept in, how its text becomes an ID, and its sentences.
CG.KINDS = {
  items = {
    read = itemID, ask = L["Say an item: a link, an ID, or a name the game knows. /vg gaps add <item>"],
    already = L["Already showing item {id}."], added = L["Showing item {id} while you carry it."],
    removed = L["No longer showing item {id}."], missing = L["Item {id} is not on the list."],
  },
  spells = {
    read = spellID, ask = L["Say a spell: a link, an ID, or a name the game knows. /vg gaps spell add <spell>"],
    already = L["Already showing spell {id}."], added = L["Showing spell {id}."],
    removed = L["No longer showing spell {id}."], missing = L["Spell {id} is not on the list."],
  },
}

-- Writes the chosen IDs of one kind back into the setting, repaints, and has the Cooldowns page's
-- Gaps card list them afresh (from its buttons and from /vg gaps alike).
local function save(kind, ids)
  CG.settings[kind] = table.concat(ids, " ")
  if CG.holder then CG.Refresh() end
  ns.Options.RebuildPage("cooldowns")
end

-- Adds an item or a spell (kind "items" or "spells") to the chosen list (or says why not).
function CG.Add(text, kind)
  kind = kind or "items"
  local k = CG.KINDS[kind]
  local id, ids = k.read(text), CG.Chosen(CG.settings, kind)
  if not id then return ns.Chat(k.ask) end
  for _, have in ipairs(ids) do if have == id then return ns.Chat(ns.Format(k.already, { id = id })) end end
  ids[#ids + 1] = id
  save(kind, ids)
  ns.Chat(ns.Format(k.added, { id = id }))
end

-- Takes an item or a spell off the chosen list.
function CG.Remove(text, kind)
  kind = kind or "items"
  local k = CG.KINDS[kind]
  local id, ids = k.read(text), CG.Chosen(CG.settings, kind)
  for i, have in ipairs(ids) do
    if have == id then table.remove(ids, i) save(kind, ids) return ns.Chat(ns.Format(k.removed, { id = id })) end
  end
  ns.Chat(ns.Format(k.missing, { id = tostring(id or text) }))
end

-- Says what is chosen, items first, then spells when there are any.
local function list()
  local s = CG.settings
  ns.Chat(ns.Format(L["Chosen items: {list}. /vg gaps add <item> adds one."], { list = s.items ~= "" and s.items or L["none"] }))
  if s.spells ~= "" then ns.Chat(ns.Format(L["Chosen spells: {list}. /vg gaps spell add <spell> adds one."], { list = s.spells })) end
end

-- /vg gaps spell [add <spell> | remove <spell>]: the chosen spells.
local function spellCommand(rest)
  local verb, arg = rest:match("^(%S*)%s*(.-)$")
  if verb == "add" then return CG.Add(arg, "spells") end
  if verb == "remove" then return CG.Remove(arg, "spells") end
  local chosen = CG.settings.spells ~= "" and CG.settings.spells or L["none"]
  ns.Chat(ns.Format(L["Chosen spells: {list}. /vg gaps spell add <spell> adds one."], { list = chosen }))
end

-- /vg gaps [add <item> | remove <item> | spell ... | list | clear].
function CG.Command(rest)
  local verb, arg = (rest or ""):match("^(%S*)%s*(.-)$")
  if not CG.settings then return ns.Chat(L["The cooldown gaps row is off. Tick Gaps row under /vg > Cooldowns, then /reload."]) end
  if verb == "add" then return CG.Add(arg) end
  if verb == "remove" then return CG.Remove(arg) end
  if verb == "spell" then return spellCommand(arg) end
  if verb == "clear" then save("items", {}) save("spells", {}) return ns.Chat(L["Chosen items and spells forgotten."]) end
  list()
end

-- A re-read event: only the player's own spec change counts (the event names the unit).
function CG.Reread(_, unit)
  if unit == nil or unit == "player" then CG.Rebuild() end
end

-- Reads the manager's spells again and repaints.
function CG.Rebuild()
  CG.ReadTracked()
  CG.Refresh()
end

-- Module entry point (Core/Modules.lua): off until switched on.
function CG.Enable(settings)
  if not settings.on then return end
  CG.settings = settings
  CG.holder = CreateFrame("Frame", "Vanguard_CooldownGaps", UIParent)
  CG.holder:SetSize(6 * (CG.SIZE + CG.GAP), CG.SIZE)
  ns.Mover(CG.holder, "cdm_gaps", L["Cooldown gaps"], { "BOTTOM", "BOTTOM", 0, 306 })
  for _, event in ipairs(CG.EVENTS) do ns.On(event, CG.Refresh) end
  for _, event in ipairs(CG.REREAD) do ns.On(event, CG.Reread) end
  CG.Rebuild()
end

-- Options rows: the Cooldowns page's Gaps card ---------------------------------------------------

-- The card's note with nothing chosen, and its note while the row is off (its settings load only then).
CG.EMPTY = L["Nothing chosen yet. Drag an item or spell here, or type its name."]
CG.OFF = L["The gaps row is off. Tick Gaps row and reload to choose its items and spells."]
-- A chosen entry's icon size and the add buttons' width before they widen to their labels on the card's rows.
CG.ROW_ICON, CG.ROW_BUTTON = 20, 84

-- A chosen entry's icon and name; an item the client hasn't loaded yet reads "Item <id>".
local function entryLook(kind, id)
  if kind == "spells" then return C_Spell.GetSpellTexture(id), C_Spell.GetSpellName(id) or ns.Format(L["Spell {id}"], { id = id }) end
  local name = C_Item.GetItemInfo(id)
  return select(5, C_Item.GetItemInfoInstant(id)), name or ns.Format(L["Item {id}"], { id = id })
end

-- One row per chosen item, then per chosen spell: { "gapentry", name, kind =, id =, icon = }.
local function entryRows(settings)
  local rows = {}
  for _, kind in ipairs({ "items", "spells" }) do
    for _, id in ipairs(CG.Chosen(settings, kind)) do
      local icon, name = entryLook(kind, id)
      rows[#rows + 1] = { "gapentry", name, kind = kind, id = id, icon = icon }
    end
  end
  return rows
end

-- The Gaps card's list: the chosen entries (or the empty note) and the add row; only the off
-- note while the row is off, since CG.settings is set only while it is on.
function CG.CardRows()
  if not CG.settings then return { { "text", CG.OFF, "note" } } end
  local rows = entryRows(CG.settings)
  if #rows == 0 then rows[1] = { "text", CG.EMPTY, "note" } end
  rows[#rows + 1] = { "gapadd" }
  return rows
end

-- Takes an entry off the list (the card then lists the rest).
local function removeEntry(kind, id)
  CG.Remove(tostring(id), kind)
end

-- A chosen entry's icon at the left of its row.
local function entryIcon(r, icon)
  r.icon = r:CreateTexture(nil, "ARTWORK")
  r.icon:SetSize(CG.ROW_ICON, CG.ROW_ICON)
  r.icon:SetPoint("LEFT", T.SPACE.gap, 0)
  r.icon:SetTexture(icon)
end

-- One chosen item or spell: its icon and name, and × to take it off the list.
local function entryRow(parent, row, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, T.ROW.height)
  entryIcon(r, row.icon)
  r.remove = W.Button(r, "×", function() removeEntry(row.kind, row.id) end, T.ROW.height)
  r.remove:SetPoint("RIGHT", -T.SPACE.gap, 0)
  -- A long name stops short of ×.
  r.label = W.Text(r, row[2])
  r.label:SetPoint("LEFT", r.icon, "RIGHT", T.SPACE.gap, 0)
  r.label:SetPoint("RIGHT", r.remove, "LEFT", -T.SPACE.gap, 0)
  return r
end

-- The list kind and ID of what is on the cursor (an item, or a spell from the spellbook or a bar), or nil.
local function cursorEntry()
  local kind, id, _, spell = GetCursorInfo()
  if kind == "item" then return "items", ns.PlainNumber(id) end
  if kind == "spell" then return "spells", ns.PlainNumber(spell) end
end

-- Something was dropped on the add row: an item or spell goes on the list and leaves the cursor.
local function onDrop()
  local kind, id = cursorEntry()
  if not id then return end
  CG.Add(tostring(id), kind)
  ClearCursor()
end

-- A click on the add row drops what the cursor holds, with the left button only.
local function onClickDrop(_, button)
  if button == "LeftButton" then onDrop() end
end

-- Adds what is typed in the add row's box as kind (CG.Add reads a name, link or ID), then lists it.
local function addTyped(r, kind)
  local text = r.input:GetText()
  if text == "" then return end
  CG.Add(text, kind)
end

-- The add row's Add item and Add spell buttons, right to left, each widened to its label.
local function addButtons(r)
  r.spell = ns.WidenToLabel(W.Button(r, L["Add spell"], function() addTyped(r, "spells") end, CG.ROW_BUTTON))
  r.spell:SetPoint("RIGHT", -T.SPACE.gap, 0)
  r.item = ns.WidenToLabel(W.Button(r, L["Add item"], function() addTyped(r, "items") end, CG.ROW_BUTTON))
  r.item:SetPoint("RIGHT", r.spell, "LEFT", -T.SPACE.gap, 0)
end

-- The add row's box and buttons: the box takes the room between the row's label and the buttons.
local function addControls(r)
  addButtons(r)
  r.input = W.Input(r)
  r.input:SetWidth(0)
  r.input:SetPoint("RIGHT", r.item, "LEFT", -T.SPACE.gap, 0)
  r.input:SetPoint("LEFT", r.label, "RIGHT", T.SPACE.gap, 0)
end

-- The add row: the whole row takes a dragged item or spell, and the box takes a typed name or ID.
local function addRow(parent, _, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, T.ROW.height)
  r:EnableMouse(true)
  r:SetScript("OnReceiveDrag", ns.Guard("drop on gaps add row", onDrop))
  r:SetScript("OnMouseUp", ns.Guard("click-drop on gaps add row", onClickDrop))
  r.label = W.Text(r, L["Drag here, or type"])
  r.label:SetPoint("LEFT", T.SPACE.gap, 0)
  addControls(r)
  return r
end

ns.Options.AddRowKind("gapentry", entryRow, T.ROW.height)
ns.Options.AddRowKind("gapadd", addRow, T.ROW.height)
