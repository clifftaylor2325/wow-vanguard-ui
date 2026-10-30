-- Click-casting starter layouts for WoW Forever, for every class: a healer's in two styles ("Click to select": Left
-- targets, Right opens the unit menu and the main heal is on Middle; "Click to heal": heals on Left and Right, with
-- Target and the menu on Shift), and one for damage and tanking. Focus is on Alt + Middle click and Assist on
-- Ctrl + Shift + Middle click in every one, and a healer's emergency spells are two modifiers away (Ctrl + Shift).
--
-- Each click lists its spells best first, by id (the client names each, as in Modules/ClickCastSpells.lua). Applying
-- binds the best one the character knows that no earlier click took, so a level 1 priest gets Lesser Heal on Middle
-- where a level 60 one gets Flash Heal. When a better one is learned (or one for a click the layout left empty), chat
-- says so once and the Click casting page offers it (Use it, or keep what is there); nothing changes by itself. The
-- stored bindings keep their five fields (key, action, value, spellID, rank): the lists of spells stay in this file,
-- and what a list was made from is kept per list in VanguardCharDB.clickcastPresets (the layout, the bindings before
-- the first layout as a CC.Export string for Undo, the mouse bindings it made, the clicks it left empty, and the
-- offers told or kept). Emptying, importing or copying over a list drops its record.
--
-- Applying replaces every mouse binding of the list the page shows (hover keys stay), out of combat like any other
-- change; the page asks first when those aren't the ones a layout made (the player's own, or a layout's they changed
-- since). Other clients keep the class layouts of ClickCastSpells, and where another addon draws the raid frames or
-- does click casting (Coexist's list, whatever its card's answer), nothing is offered, since Vanguard's click casting
-- works on its own frames only.

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

-- The other-addon answer, read once (Coexist asks the client about some forty addons) and again after an addon loads.
local blockerCache = {}

-- The first addon (by name) that does the raid frames' or click casting's job instead, as { addon, what }, or nil.
local function findBlocker()
  local CX = ns.GetModule("Coexist")
  local found = CX.Overlaps("RaidFrames")
  for _, o in ipairs(CX.Overlaps("ClickCast")) do found[#found + 1] = o end
  table.sort(found, function(a, b) return a.addon < b.addon end)
  return found[1] or false
end

-- The other addon doing the raid frames' or click casting's job (see findBlocker), on WoW Forever only (other clients
-- keep their class layouts as before), or nil.
function CP.Blocker()
  if not ns.IsForever() then return nil end
  if blockerCache.value == nil then blockerCache.value = findBlocker() end
  return blockerCache.value or nil
end

-- An addon loaded: ask again.
ns.On("ADDON_LOADED", function() blockerCache.value = nil end)

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

-- The record of the list the page shows, or nil when no preset made it: { preset (its id), undo (the list before the
-- first preset as a CC.Export string, "" for an empty one), made (its mouse bindings as the preset and its offers left
-- them, see mouseText), open (the keys the preset left empty, for want of a known spell, until bound), told and kept
-- (the offers chat named and the ones the player turned down, as "key:spell" sets) }.
function CP.Record()
  local rec = records()[CC.CurrentKey()]
  return type(rec) == "table" and rec or nil
end

-- A list was emptied, imported or copied over (ClickCast.lua): it isn't a preset's any more, and its Undo would throw
-- the new list away, so its record goes.
CC.OnReplaced = function(key) records()[key] = nil end

-- A key of the list shown was bound (ClickCast.lua): one the preset left empty is an ordinary one from now on.
CC.OnAdded = function(key)
  local rec = CP.Record()
  if rec and rec.open then rec.open[key] = nil end
end

-- The list shown's mouse bindings as one text, in key order, to tell whether they are still the ones a preset made.
local function mouseText()
  local out = {}
  for _, b in ipairs(CC.Bindings()) do
    if CC.MouseParts(b.key) then out[#out + 1] = table.concat({ b.key, b.action, tostring(b.value) }, "=") end
  end
  table.sort(out)
  return table.concat(out, ";")
end

-- The preset the list shown was made from, as its entry in CP.PRESETS, or nil.
function CP.Applied()
  local rec = CP.Record()
  return rec and presetOf(rec.preset)
end

-- Whether the list shown has mouse bindings other than the ones a preset (and the offers taken since) made: the
-- player's own, or a preset's changed since. Picking a preset asks before it replaces those.
function CP.HasOwnClicks()
  local rec, now = CP.Record(), mouseText()
  if rec and rec.made == now then return false end
  return now ~= ""
end

-- Removes every mouse binding from the list shown (hover keys stay).
local function dropMouse()
  local keys = {}
  for _, b in ipairs(CC.Bindings()) do
    if CC.MouseParts(b.key) then keys[#keys + 1] = b.key end
  end
  for _, key in ipairs(keys) do CC.Remove(key) end
end

-- The keys of a preset's spell rows that its bindings (CP.Resolve) leave empty, as a set.
local function openKeys(id, bound)
  local filled, open = {}, {}
  for _, b in ipairs(bound) do filled[b.key] = true end
  for _, row in ipairs(CP.Rows(id)) do
    if not filled[row[1]] then open[row[1]] = true end
  end
  return open
end

-- Applies a preset to the list the page shows: the list as it was is kept for Undo ("" when it was empty), unless an
-- earlier preset already kept the one from before it, then every mouse binding is replaced with the preset's
-- (CP.Resolve); hover keys stay. The frames take it once, out of combat.
function CP.Apply(id)
  local old, bound = CP.Record() or {}, CP.Resolve(id)
  local undo = old.undo or (#CC.Bindings() > 0 and CC.Export() or "")
  records()[CC.CurrentKey()] = { preset = id, undo = undo, open = openKeys(id, bound), told = old.told or {}, kept = old.kept or {} }
  dropMouse()
  for _, b in ipairs(bound) do CC.Add(b.key, b.action, b.value, b.spellID) end
  CP.Record().made = mouseText()
  if CP.OnApplied then CP.OnApplied() end
end

-- Whether the list shown can go back to what it was before its first preset (a record of a preset this version
-- doesn't know, from a newer one, offers nothing).
function CP.CanUndo()
  local rec = CP.Record()
  return CP.Applied() ~= nil and type(rec.undo) == "string"
end

-- Puts back the list as it was before the first preset (empty, if it was); the record goes. Changes made since are
-- lost. False (and why, for a saved list that no longer imports) when it can't: then nothing changes.
function CP.Undo()
  if not CP.CanUndo() then return false end
  local key, undo = CC.CurrentKey(), CP.Record().undo
  local ok, why = true, nil
  if undo == "" then CC.Clear() else ok, why = CC.Import(undo) end
  if not ok then return false, why end
  records()[key] = nil
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

-- Whether a row's best spell now (best) beats what the key holds (b): one lower in the row's list. A better one the
-- character doesn't know (a talent not taken, or a spellbook not read in full yet) is never offered down.
local function beats(row, best, b)
  return rankIn(row, b.value) > rankIn(row, best)
end

-- Whether a key may take an offer: it holds one of the row's spells, or it is empty because the preset left it so (a
-- key the player emptied, or bound to something else, is the player's own).
local function offerable(row, b, rec)
  if b then return b.action == "spell" and rankIn(row, b.value) ~= nil end
  return rec.open ~= nil and rec.open[row[1]] == true
end

-- A row's offer, or nil: its best spell now when the key may take one (offerable) and it beats what is there, unless
-- the player kept what is there.
local function offerOf(row, rec)
  local b = CC.Binding(row[1])
  if not offerable(row, b, rec) then return nil end
  local best = bestOf(row, takenElsewhere(row[1]))
  if not best or (b and not beats(row, best, b)) or (rec.kept or {})[row[1] .. ":" .. best] then return nil end
  return { key = row[1], from = b and b.value, to = best, spellID = CS.Spell(best).spellID }
end

-- The offers on the list shown, in the preset's order: { key, from (nil for an empty key), to, spellID } each. One at
-- a time per spell: a spell two rows could take is offered on the first. None where the presets aren't offered (another
-- addon does the job) or while the game's click bindings are in use (Vanguard's rest).
function CP.Upgrades()
  local rec, out, offered = CP.Record(), {}, {}
  if not rec or not presetOf(rec.preset) or not CP.Offered() or CC.UsesGame() then return out end
  for _, row in ipairs(CP.Rows(rec.preset)) do
    local u = not row.action and offerOf(row, rec)
    if u and not offered[u.to] then out[#out + 1], offered[u.to] = u, true end
  end
  return out
end

-- Puts an offered spell on its key (out of combat, like any change), as the preset's own: picking a preset after it
-- doesn't ask. An offer the list no longer has (its record went) does nothing.
function CP.Use(u)
  local rec = CP.Record()
  if not rec then return end
  CC.Add(u.key, "spell", u.to, u.spellID)
  rec.made = mouseText()
end

-- Keeps what the key holds: this spell isn't offered on it again.
function CP.Keep(u)
  local rec = CP.Record()
  if not rec then return end
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
-- page holds the buttons, and builds itself again for them). Not before the module has started.
local function tellUpgrades()
  local rec = CC.settings and CP.Record()
  if not rec then return end
  rec.told = rec.told or {}
  local told = false
  for _, u in ipairs(CP.Upgrades()) do told = tellOnce(rec, u) or told end
  if told then ns.Options.Refresh() end
end

-- The spellbook changed (a spell learned, a talent taken): tell the new offers once the catalog is read again.
ns.On("SPELLS_CHANGED", function() ns.Soon("clickcast upgrades", tellUpgrades) end)

-- Target and the menu -----------------------------------------------------------------------

-- The game's name for each interaction, as its Click Casting window shows it, for the page's guide.
CP.GAME_NAMES = { target = L["Target"], menu = L["Open menu"] }

-- Where a preset puts Target and the unit menu ({ key, action, unsure } each) that the game isn't sure to run there:
-- its own Click Casting window doesn't bind that interaction to that click, or (unsure) binds something there this
-- can't read (CC.GameCovers). None on a client without the game's click bindings.
function CP.Unbound(id)
  local out = {}
  for _, row in ipairs(ACTION_ROWS[id] or ACTION_ROWS.select) do
    local b = { key = row[1], action = row.action }
    local covered, why = CC.GameCovers(b)
    if not covered then b.unsure, out[#out + 1] = why == "unsure", b end
  end
  return out
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
