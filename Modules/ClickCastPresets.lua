-- Click-casting starter layouts for WoW Forever, for every class: a healer's in two styles ("Click to select": Left
-- targets, Right opens the unit menu and the main heal is on Middle; "Click to heal": heals on Left and Right, with
-- Target and the menu on Shift), and one for damage and tanking. Focus is on Alt + Middle click and Assist on
-- Ctrl + Shift + Middle click in every one, and a healer's emergency spells are two modifiers away (Ctrl + Shift).
--
-- Each click lists its spells best first, by id (the client names each, as in Modules/ClickCastSpells.lua). Applying
-- binds the best one the character knows that no earlier click took, so a level 1 priest gets Lesser Heal on Middle
-- where a level 60 one gets Flash Heal. When a better one is learned, chat says so once and the Click casting page
-- offers it (Use it, or keep what is there); nothing changes by itself. The stored bindings keep their five fields
-- (key, action, value, spellID, rank): the lists of spells stay in this file, and what a list was made from is kept
-- per list in VanguardCharDB.clickcastPresets (the layout, the bindings before it as a CC.Export string for Undo,
-- and the offers told or kept).
--
-- Applying replaces every mouse binding of the list the page shows (hover keys stay), out of combat like any other
-- change. Other clients keep the class layouts of ClickCastSpells, and where another addon draws the raid frames or
-- does click casting (Coexist's list), nothing is offered, since Vanguard's click casting works on its own frames only.

local ADDON, ns = ...

local L = ns.L

local CC, CS = ns.GetModule("ClickCast"), ns.ClickCastSpells

local CP = {}
ns.ClickCastPresets = CP

-- Per class, the clicks of each role in the order they are filled: { key, spell ids best first }. The names in the
-- comments are the English client's, for reading only. UNVERIFIED on a Forever client: the ids are the classic
-- database's (Revive's is a later client's, Forever's own spell); `/vg probe` lists the name the client gives each.
CP.CLASSES = {
  PRIEST = {
    -- Flash Heal, Heal, Lesser Heal; Prayer of Healing; Greater Heal, Heal; Renew; Dispel Magic; Cure Disease;
    -- Power Word: Shield; Resurrection.
    healer = {
      { "BUTTON3", 2061, 2054, 2050 }, { "shift-BUTTON3", 596 }, { "shift-BUTTON1", 2060, 2054 }, { "shift-BUTTON2", 139 },
      { "ctrl-BUTTON1", 527 }, { "ctrl-BUTTON2", 528 }, { "alt-BUTTON1", 17 }, { "alt-BUTTON2", 2006 },
    },
    -- Power Word: Shield, Renew.
    other = { { "shift-BUTTON1", 17 }, { "shift-BUTTON2", 139 } },
  },
  PALADIN = {
    -- Flash of Light, Holy Light; Holy Shock; Holy Light; Cleanse, Purify; Blessing of Wisdom, Blessing of Might;
    -- Redemption; Lay on Hands; Blessing of Protection.
    healer = {
      { "BUTTON3", 19750, 635 }, { "shift-BUTTON3", 20473 }, { "shift-BUTTON1", 635 }, { "ctrl-BUTTON1", 4987, 1152 },
      { "alt-BUTTON1", 19742, 19740 }, { "alt-BUTTON2", 7328 }, { "ctrl-shift-BUTTON1", 633 }, { "ctrl-shift-BUTTON2", 1022 },
    },
    -- Cleanse, Purify; Lay on Hands; Blessing of Protection.
    other = { { "ctrl-BUTTON1", 4987, 1152 }, { "ctrl-shift-BUTTON1", 633 }, { "ctrl-shift-BUTTON2", 1022 } },
  },
  DRUID = {
    -- Rejuvenation, Healing Touch; Healing Touch; Regrowth; Remove Curse; Abolish Poison, Cure Poison; Swiftmend;
    -- Revive; Rebirth.
    healer = {
      { "BUTTON3", 774, 5185 }, { "shift-BUTTON1", 5185 }, { "shift-BUTTON2", 8936 }, { "ctrl-BUTTON1", 2782 },
      { "ctrl-BUTTON2", 2893, 8946 }, { "alt-BUTTON1", 18562 }, { "alt-BUTTON2", 50769 }, { "ctrl-shift-BUTTON1", 20484 },
    },
    -- Rebirth.
    other = { { "ctrl-shift-BUTTON1", 20484 } },
  },
  SHAMAN = {
    -- Lesser Healing Wave, Healing Wave; Riptide; Healing Wave; Chain Heal; Cure Poison; Cure Disease;
    -- Ancestral Spirit; Nature's Swiftness.
    healer = {
      { "BUTTON3", 8004, 331 }, { "shift-BUTTON3", 61295 }, { "shift-BUTTON1", 331 }, { "shift-BUTTON2", 1064 },
      { "ctrl-BUTTON1", 526 }, { "ctrl-BUTTON2", 2870 }, { "alt-BUTTON2", 2008 }, { "ctrl-shift-BUTTON1", 16188 },
    },
    -- Lesser Healing Wave, Healing Wave.
    other = { { "shift-BUTTON1", 8004, 331 } },
  },
  -- Arcane Intellect; Remove Lesser Curse.
  MAGE = { other = { { "shift-BUTTON1", 1459 }, { "ctrl-BUTTON1", 475 } } },
  -- Unending Breath.
  WARLOCK = { other = { { "shift-BUTTON1", 5697 } } },
  WARRIOR = { other = {} },
  ROGUE = { other = {} },
  HUNTER = { other = {} },
}

-- The layouts, in the order the page offers them: a healer's two styles, then damage or tanking (every class).
CP.PRESETS = {
  { id = "select", role = "healer", label = L["Healer: click to select"] },
  { id = "heal", role = "healer", label = L["Healer: click to heal"] },
  { id = "other", role = "other", label = L["Damage or tank"] },
}

-- The clicks each style adds after its spells: Target and the unit menu (Click to heal puts them on Shift, where the
-- game runs them only once its own Click Casting window binds them there), then Focus and Assist, the same in all.
local ACTION_ROWS = {
  select = { { "BUTTON1", action = "target" }, { "BUTTON2", action = "menu" } },
  heal = { { "shift-BUTTON1", action = "target" }, { "shift-BUTTON2", action = "menu" } },
}
local SHARED_ROWS = { { "alt-BUTTON3", action = "focus" }, { "ctrl-shift-BUTTON3", action = "assist" } }

-- Click to heal moves the healer clicks of Click to select: the main heal from Middle to Left, the Shift + Left heal
-- to Right and the Shift + Right one to Middle, freeing Shift for Target and the menu.
local HEAL_MOVES = { BUTTON3 = "BUTTON1", ["shift-BUTTON1"] = "BUTTON2", ["shift-BUTTON2"] = "BUTTON3" }

-- Layouts ---------------------------------------------------------------------------------------

-- The player's class table (an unknown class has a damage layout of only the shared clicks).
local function classData()
  return CP.CLASSES[CS.PlayerClass() or ""] or { other = {} }
end

-- A preset by id, or nil.
local function presetOf(id)
  for _, preset in ipairs(CP.PRESETS) do
    if preset.id == id then return preset end
  end
end

-- A row's copy with its key moved for the style (Click to heal's moves; any other style keeps the key).
local function styledRow(row, id)
  local out = { id == "heal" and HEAL_MOVES[row[1]] or row[1], action = row.action }
  for i = 2, #row do out[i] = row[i] end
  return out
end

-- A preset's rows for the player's class, in the order they are filled: its spells (moved for Click to heal), then
-- Target and the menu for its style, then Focus and Assist.
function CP.Rows(id)
  local preset, out = presetOf(id), {}
  for _, row in ipairs(classData()[preset.role] or {}) do out[#out + 1] = styledRow(row, id) end
  for _, row in ipairs(ACTION_ROWS[id] or ACTION_ROWS.select) do out[#out + 1] = row end
  for _, row in ipairs(SHARED_ROWS) do out[#out + 1] = row end
  return out
end

-- The client's name for a spell id when the character knows that spell (any rank of it is in the spellbook), else nil.
local function knownName(id)
  local name = ns.SpellName(id)
  return name and CS.Spell(name) and name or nil
end

-- The best spell of a row the character knows that isn't in taken (a set of names): its name, or nil.
local function bestOf(row, taken)
  for i = 2, #row do
    local name = knownName(row[i])
    if name and not taken[name] then return name end
  end
end

-- A row as a binding: an action as it is, a spell row as its best spell (bestOf), by name with its top rank's id; nil
-- when the character knows none it may take.
local function resolved(row, taken)
  if row.action then return { key = row[1], action = row.action } end
  local name = bestOf(row, taken)
  return name and { key = row[1], action = "spell", value = name, spellID = CS.Spell(name).spellID } or nil
end

-- A preset as the bindings it makes now, in order: each spell row takes the best spell it may, a spell an earlier
-- row took passed over (Heal goes on Middle until Flash Heal is learned, not on Shift + Left too).
function CP.Resolve(id)
  local out, taken = {}, {}
  for _, row in ipairs(CP.Rows(id)) do
    local b = resolved(row, taken)
    if b then out[#out + 1], taken[b.value or ""] = b, true end
  end
  return out
end

-- Offered where ------------------------------------------------------------------------------

-- The first addon (by name) that does the raid frames' or click casting's job instead, as { addon, what }, or nil.
function CP.Blocker()
  local CX = ns.GetModule("Coexist")
  local found = CX.Overlaps("RaidFrames")
  for _, o in ipairs(CX.Overlaps("ClickCast")) do found[#found + 1] = o end
  table.sort(found, function(a, b) return a.addon < b.addon end)
  return found[1]
end

-- Whether the page offers the presets: on WoW Forever, while no other addon does the raid frames' or click casting's job.
function CP.Offered()
  return ns.IsForever() and CP.Blocker() == nil
end

-- The presets the player's class has, as { id, label } choices for the page's dropdown (none where not offered).
function CP.Choices()
  local out, data = {}, classData()
  for _, preset in ipairs(CP.Offered() and CP.PRESETS or {}) do
    if data[preset.role] then out[#out + 1] = { preset.id, preset.label } end
  end
  return out
end

-- The record -----------------------------------------------------------------------------------

-- This character's preset records, by list key (VanguardCharDB.clickcastPresets).
local function records()
  VanguardCharDB.clickcastPresets = type(VanguardCharDB.clickcastPresets) == "table" and VanguardCharDB.clickcastPresets or {}
  return VanguardCharDB.clickcastPresets
end

-- The record of the list the page shows, or nil when no preset made it: { preset (its id), undo (the list before it as
-- a CC.Export string, "" for an empty one; nil once undone), undoPreset (the preset that made that list), told and
-- kept (the offers chat named and the ones the player turned down, as "key:spell" sets) }.
function CP.Record()
  local rec = records()[CC.CurrentKey()]
  return type(rec) == "table" and rec or nil
end

-- The preset the list shown was made from, as its entry in CP.PRESETS, or nil.
function CP.Applied()
  local rec = CP.Record()
  return rec and presetOf(rec.preset)
end

-- Removes every mouse binding from the list shown (hover keys stay).
local function dropMouse()
  local keys = {}
  for _, b in ipairs(CC.Bindings()) do
    if CC.MouseParts(b.key) then keys[#keys + 1] = b.key end
  end
  for _, key in ipairs(keys) do CC.Remove(key) end
end

-- Applies a preset to the list the page shows: the list as it was is kept for Undo ("" when it was empty) with the
-- preset it came from, if any, then every mouse binding is replaced with the preset's (CP.Resolve); hover keys stay.
-- The frames take it once, out of combat.
function CP.Apply(id)
  local old, list = CP.Record(), CC.Bindings()
  local undo = #list > 0 and CC.Export() or ""
  records()[CC.CurrentKey()] = { preset = id, undo = undo, undoPreset = old and old.preset, told = {}, kept = {} }
  dropMouse()
  for _, b in ipairs(CP.Resolve(id)) do CC.Add(b.key, b.action, b.value, b.spellID) end
end

-- Whether the list shown can go back to what it was before its preset.
function CP.CanUndo()
  local rec = CP.Record()
  return rec ~= nil and type(rec.undo) == "string"
end

-- Puts back the list as it was before the last preset (empty, if it was), and the record of the preset that made that
-- one, if any, with no Undo of its own (one step back). Changes made since are lost. False when there is nothing to undo.
function CP.Undo()
  if not CP.CanUndo() then return false end
  local rec = CP.Record()
  if rec.undo == "" then CC.Clear() else CC.Import(rec.undo) end
  records()[CC.CurrentKey()] = rec.undoPreset and { preset = rec.undoPreset, told = {}, kept = {} } or nil
  return true
end

-- Upgrades -------------------------------------------------------------------------------------

-- Where a spell name stands in a row's list (1 for the best), or nil when the row doesn't list it.
local function rankIn(row, name)
  for i = 2, #row do
    if ns.SpellName(row[i]) == name then return i - 1 end
  end
end

-- The names bound to spells in the list shown, but on another key than this one.
local function takenElsewhere(key)
  local taken = {}
  for _, b in ipairs(CC.Bindings()) do
    if b.key ~= key and b.action == "spell" then taken[b.value] = true end
  end
  return taken
end

-- Whether a row's best spell now (best) beats what the key holds (b): an empty key, a spell the character doesn't
-- know, or one lower in the row's list.
local function beats(row, best, b)
  if not b then return true end
  if b.value == best then return false end
  return CS.Spell(b.value) == nil or rankIn(row, b.value) > rankIn(row, best)
end

-- A row's offer, or nil: its best spell now when that beats what the key holds, unless the key holds something the row
-- doesn't list (the player's own choice) or the player kept what is there.
local function offerOf(row, kept)
  local b = CC.Binding(row[1])
  if b and (b.action ~= "spell" or not rankIn(row, b.value)) then return nil end
  local best = bestOf(row, takenElsewhere(row[1]))
  if not best or not beats(row, best, b) or kept[row[1] .. ":" .. best] then return nil end
  return { key = row[1], from = b and b.value, to = best, spellID = CS.Spell(best).spellID }
end

-- The offers on the list shown, in the preset's order: { key, from (nil for an empty key), to, spellID } each. One at
-- a time per spell: a spell two rows could take is offered on the first.
function CP.Upgrades()
  local rec, out, offered = CP.Record(), {}, {}
  if not rec or not presetOf(rec.preset) then return out end
  for _, row in ipairs(CP.Rows(rec.preset)) do
    local u = not row.action and offerOf(row, rec.kept or {})
    if u and not offered[u.to] then out[#out + 1], offered[u.to] = u, true end
  end
  return out
end

-- Puts an offered spell on its key (out of combat, like any change).
function CP.Use(u)
  CC.Add(u.key, "spell", u.to, u.spellID)
end

-- Keeps what the key holds: this spell isn't offered on it again.
function CP.Keep(u)
  local rec = CP.Record()
  rec.kept = rec.kept or {}
  rec.kept[u.key .. ":" .. u.to] = true
end

-- Says an offer in chat once (rec.told keeps the ones said); true when it was new.
local function tellOnce(rec, u)
  local mark = u.key .. ":" .. u.to
  if rec.told[mark] then return false end
  rec.told[mark] = true
  ns.Chat(ns.Format(L["Click casting: you can put {spell} on {click} now. /vg > Click casting offers it."], { spell = u.to, click = CC.KeyName(u.key) }))
  return true
end

-- Says each offer chat hasn't told yet, once, and has an open options window read its rows again (the Click casting
-- page holds the buttons, and builds itself again for them).
local function tellUpgrades()
  local rec = CC.settings and ns.IsForever() and CP.Record()
  if not rec then return end
  rec.told = rec.told or {}
  local told = false
  for _, u in ipairs(CP.Upgrades()) do told = tellOnce(rec, u) or told end
  if told then ns.Options.Refresh() end
end

-- The spellbook changed (a spell learned, a talent taken): tell the new offers once the catalog is read again.
ns.On("SPELLS_CHANGED", function() ns.Soon("clickcast upgrades", tellUpgrades) end)

-- Click to heal ---------------------------------------------------------------------------------

-- Where Click to heal puts Target and the unit menu, as bindings, for the page's guide.
CP.HEAL_CLICKS = { { key = "shift-BUTTON1", action = "target" }, { key = "shift-BUTTON2", action = "menu" } }

-- Whether the game runs Target and the unit menu where Click to heal puts them: its own Click Casting window binds them
-- there (CC.WontRun has no reason). A client without the game's click bindings needs nothing.
function CP.HealReady()
  for _, b in ipairs(CP.HEAL_CLICKS) do
    if CC.WontRun(b) then return false end
  end
  return true
end

-- The probe -----------------------------------------------------------------------------------

-- Every spell id the presets list, once, lowest first.
local function presetIds()
  local seen, out = {}, {}
  for _, data in pairs(CP.CLASSES) do
    for _, rows in pairs(data) do
      for _, row in ipairs(rows) do
        for i = 2, #row do if not seen[row[i]] then seen[row[i]], out[#out + 1] = true, row[i] end end
      end
    end
  end
  table.sort(out)
  return out
end

-- `/vg probe`'s lines for the presets: the name this client gives each spell id ("present") or none ("missing").
function CP.ProbeLines()
  local out = {}
  for _, id in ipairs(presetIds()) do
    local name = ns.SpellName(id)
    out[#out + 1] = name and string.format("spell %d: present, %s", id, name) or string.format("spell %d: missing", id)
  end
  return out
end

table.insert(ns.Probe.SECTIONS, { "Click-casting starter layout spells", CP.ProbeLines })
