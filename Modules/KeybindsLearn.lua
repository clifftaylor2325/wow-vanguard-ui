-- Key setup's new spells: "Place new spells as I learn them". Once the player has applied a key preset (the wizard
-- calls KN.Applied) with the switch on, each spell learned and each level reached runs the preset again through the
-- apply engine's quiet update (KA.Update in Modules/KeybindsApply.lua): the resolver
-- (ns.KeybindsLayouts.Resolve) picks each key's spell for what the character knows now, and the update places it.
-- A spell that lands on an empty button, or takes the place of the spell it replaces (Ice Armor for Frost Armor),
-- changes the key silently. Any other change moves the old spell to the next key that lists it, or to bar 3, and
-- says both in one chat line ("Mortal Strike is now on 1. Heroic Strike moved to 4."). Everything an update changes
-- goes into the apply record, so the Your keys tab's put-back covers it, and Put everything back turns the switch off.
--
-- What is whose. Vanguard remembers what every button of bars 1 to 3 held and what every key did when it last
-- looked: after an Apply, after an update, and when the game places a spell by itself (SPELL_PUSHED_TO_ACTIONBAR),
-- so a spell the game placed counts as the game's and may move. A button that holds something else the next time,
-- or a key that does something else, was changed by the player and is theirs for good: later updates leave it out
-- (a button's spell goes to the next key that lists it). Applying a preset again starts afresh.
--
-- A player who never applied a preset gets one question instead, the first time they train a spell or reach level 10:
-- "Set up keys" opens the wizard with the switch ticked. It is never asked again.
--
-- Nothing runs before login has settled or in combat (it waits for the fight to end), and the apply engine's
-- refusals are checked each time it runs: a refused update tries again at the next spell, level or load screen.
-- WoW Forever only. State: VanguardCharDB.keysLearn.
-- UNVERIFIED on a Forever client (docs/SMOKE-TEST.md): whether the game places new spells on the bars by itself and
-- under which setting, SPELL_PUSHED_TO_ACTIONBAR's payload, and whether a talent's spell fires
-- LEARNED_SPELL_IN_SKILL_LINE.

local _, ns = ...
local L = ns.L

local KA = ns.KeybindsApply

local KN = {}
ns.KeybindsLearn = KN

-- Seconds after the first load screen before a spell event can change keys (logging in sends a burst of them).
KN.SETTLE = 3
-- The level from which the Ready step's box starts unticked, and from which a level reached asks the question.
KN.LEVEL = 10
-- The events that can bring a new spell: one learned (at a trainer, or from a talent) and a level reached.
KN.EVENTS = { "LEARNED_SPELL_IN_SKILL_LINE", "PLAYER_LEVEL_UP" }
-- The tables of the saved state, each reset to empty when it isn't a table (a hand-edited file may hold anything).
KN.TABLES = { "slots", "keys", "ownSlots", "ownKeys" }

-- The saved state ---------------------------------------------------------------------------------

-- This character's state: { preset (what the resolver takes), on (the switch), asked (the question was shown),
-- yes (its answer was "Set up keys"), slots = { [slot] = a spell ID or "other" }, keys = { [key] = command },
-- ownSlots = { [slot] = true }, ownKeys = { [key] = true } }: what each button and key held when Vanguard last
-- looked, and those the player has taken over.
local function state()
  local s = type(VanguardCharDB.keysLearn) == "table" and VanguardCharDB.keysLearn or {}
  for _, name in ipairs(KN.TABLES) do
    if type(s[name]) ~= "table" then s[name] = {} end
  end
  VanguardCharDB.keysLearn = s
  return s
end

-- The player's level, or nil while the client hides it.
local function level()
  return ns.PlainNumber(ns.Client.Call("UnitLevel", "player"))
end

-- Whether the Ready step's "Place new spells as I learn them" starts ticked: below level 10, or when the player
-- answered "Set up keys" to the question.
---@return boolean
function KN.Ticked()
  local now = level()
  return state().yes == true or (now ~= nil and now < KN.LEVEL)
end

-- Whether the switch is on.
---@return boolean
function KN.IsOn()
  return state().on == true
end

-- Turns the switch on or off (the Your keys tab). It does nothing until keys are set up with a preset.
---@param on boolean
function KN.SetOn(on)
  state().on = on == true
end

-- Looking at the bars and keys ---------------------------------------------------------------------

-- What a slot holds as Vanguard compares it: a spell's ID, "other" for anything else, nil when empty; and whether
-- it could be read (a hidden answer can't).
local function look(slot)
  local kind, id = ns.Client.Call("GetActionInfo", slot)
  if ns.IsSecret(kind) or (kind == "spell" and ns.PlainNumber(id) == nil) then return nil, false end
  if kind == nil then return nil, true end
  return kind == "spell" and ns.PlainNumber(id) or "other", true
end

-- Whether two slot contents are the same: equal, or two spells of one name (a rank SpellRanks swapped in).
local function same(a, b)
  if a == b then return true end
  local name = type(a) == "number" and type(b) == "number" and ns.SpellName(a)
  return name ~= nil and name ~= false and name == ns.SpellName(b)
end

-- Calls fn(slot) for every slot a preset may write (KA.RANGES).
local function eachSlot(fn)
  for _, r in ipairs(KA.RANGES) do
    for slot = r.first, r.last do fn(slot) end
  end
end

-- Remembers what every slot a preset may write holds now (a slot that can't be read keeps what it had).
local function rememberSlots(s)
  eachSlot(function(slot)
    local now, readable = look(slot)
    if readable then s.slots[slot] = now end
  end)
end

-- What a key does now ("" for nothing).
local function action(key)
  return GetBindingAction(key) or ""
end

-- Remembers what every key does now: each key bound to one of the game's listed commands, and each key of the
-- entries (a key bound to a spell, a macro or a click isn't listed).
local function rememberKeys(s, entries)
  s.keys = {}
  for i = 1, GetNumBindings() do
    local command, _, key1, key2 = GetBinding(i)
    for _, key in ipairs({ key1, key2 }) do s.keys[key] = command end
  end
  for _, entry in ipairs(entries) do
    local key = KA.Chord(entry.key)
    if key then s.keys[key] = action(key) end
  end
end

-- A preset was applied (the wizard, after KA.Apply succeeded): keeps the preset and the switch, forgets what the
-- player had taken over before, and remembers the bars and keys as they are now.
---@param preset table  what ns.KeybindsLayouts.Resolve takes
---@param placeNew boolean  the Ready step's "Place new spells as I learn them"
function KN.Applied(preset, placeNew)
  local s = state()
  s.preset, s.on, s.ownSlots, s.ownKeys = ns.Copy(preset), placeNew == true, {}, {}
  rememberSlots(s)
  rememberKeys(s, ns.KeybindsLayouts.Resolve(s.preset, {}))
end

-- Marks as the player's every slot that holds something else than when Vanguard last looked.
local function claimSlots(s)
  eachSlot(function(slot)
    local now, readable = look(slot)
    if readable and not same(now, s.slots[slot]) then s.ownSlots[slot] = true end
  end)
end

-- Marks as the player's every key of the entries that does something else than when Vanguard last looked.
local function claimKeys(s, entries)
  for _, entry in ipairs(entries) do
    local key = KA.Chord(entry.key)
    if key and action(key) ~= (s.keys[key] or "") then s.ownKeys[key] = true end
  end
end

-- The entries whose key the player hasn't taken over.
local function withoutOwnKeys(s, entries)
  local out = {}
  for _, entry in ipairs(entries) do
    if not s.ownKeys[KA.Chord(entry.key) or ""] then out[#out + 1] = entry end
  end
  return out
end

-- Telling the player ---------------------------------------------------------------------------------

-- A key's name as the player reads it.
local function keyName(key)
  return ns.KeysView.KeyText(key)
end

-- The key of the row that places or binds a spell, or nil.
local function landsOn(rows, spellID)
  for _, row in ipairs(rows) do
    if KA.WRITES[row.kind] and row.spell and same(row.spell, spellID) then return row.key end
  end
end

-- The clauses for a row's own spell, unless an earlier clause already said it moved there.
local function newOn(row, told, out)
  if told[row.spell .. "@" .. row.key] then return end
  out[#out + 1] = ns.Format(L["{spell} is now on {key}."], { spell = ns.SpellName(row.spell) or "?", key = keyName(row.key) })
end

-- The clause for the spell a row moved off its slot: to the key that now holds it, or to bar 3.
local function movedOff(rows, old, told, out)
  local key = landsOn(rows, old)
  local name = ns.SpellName(old) or "?"
  if key then told[old .. "@" .. key] = true end
  out[#out + 1] = key and ns.Format(L["{spell} moved to {key}."], { spell = name, key = keyName(key) })
    or ns.Format(L["{spell} moved to bar 3."], { spell = name })
end

-- What a row tells the player: nothing for a spell on an empty button, a command or a replaced spell; else where
-- the new spell is and where the old one went.
local function tell(rows, row, told, out)
  local old = row.moved or (not row.replaced and row.over)
  if row.kind == "bind" then return newOn(row, told, out) end
  if not old then return end
  newOn(row, told, out)
  movedOff(rows, old, told, out)
end

-- Says in one chat line what an update moved under the player's fingers (nothing when it only filled empty buttons).
local function report(rows)
  local out, told = {}, {}
  for _, row in ipairs(rows) do tell(rows, row, told, out) end
  if #out > 0 then ns.Chat(table.concat(out, " ")) end
end

-- Updating -----------------------------------------------------------------------------------------

-- Remembers what an update set: every button, and the keys it wrote.
local function rememberUpdate(s, rows)
  rememberSlots(s)
  for _, row in ipairs(rows) do
    if KA.WRITES[row.kind] then s.keys[row.key] = row.command end
  end
end

-- Runs the preset again for the spells known now, without the buttons and keys the player took over. Put
-- everything back (no keys left in the record) turns the switch off; a refused update waits (KN.pending).
local function update(s)
  local entries = ns.KeybindsLayouts.Resolve(s.preset, s.ownSlots)
  claimKeys(s, entries)
  local rows = KA.Update(withoutOwnKeys(s, entries))
  KN.pending = rows == nil and KA.Refusal() ~= nil
  if rows == nil and not KN.pending then s.on = false end
  if rows then rememberUpdate(s, rows) report(rows) end
end

-- The one question -----------------------------------------------------------------------------------

-- Asks a player who never applied a preset, once, whether Vanguard should put their new spells on keys, when the
-- wizard would be offered: a spell was learned, or a level of 10 or more reached. "Set up keys" opens the wizard.
local function ask(s, learned)
  local KW, now = ns.KeybindsWizard, level()
  if s.asked or not (learned or (now ~= nil and now >= KN.LEVEL)) then return end
  if not (KW and KW.Offered()) then return end
  s.asked = true
  ns.Ask(L["Want Vanguard to put your new spells on keys? It won't ask again: you can set up keys any time from Action bars, Your keys."],
    L["Set up keys"], function() state().yes = true KW.Open() end)
end

-- Running ------------------------------------------------------------------------------------------------

-- Looks at the bars once spells or the level changed (out of combat): asks a player who never applied a preset,
-- or takes note of what the player changed and, with the switch on, updates the keys. `learned`: a spell was
-- learned since the last look. WoW Forever only.
function KN.Check(learned)
  local s = state()
  if not ns.IsForever() or not ns.KeybindsLayouts then return end
  if not s.preset then return ask(s, learned) end
  claimSlots(s)
  if s.on then update(s) end
end

-- Whether a spell was learned since the last look (a level reached alone doesn't ask the question below level 10).
KN.learned = false

-- Looks once the burst of events is over, and out of combat (after the fight when one is on).
local function soon()
  ns.Soon("keys learn", function()
    ns.OutOfCombat(function() local learned = KN.learned KN.learned = false KN.Check(learned) end, "keys learn")
  end)
end

-- A spell learned or a level reached, once login has settled.
local function onSpells(event)
  if not KN.settled then return end
  if event == "LEARNED_SPELL_IN_SKILL_LINE" then KN.learned = true end
  soon()
end
for _, event in ipairs(KN.EVENTS) do ns.On(event, onSpells) end

-- The game placed a spell on a button by itself: it counts as the game's, so a later update may move it.
local function onPushed(_, spellID, slot)
  if type(VanguardCharDB) ~= "table" or not state().preset then return end
  local id, place = ns.PlainNumber(spellID), ns.PlainNumber(slot)
  if id and place and KA.CommandFor(place) then state().slots[place] = id end
end
ns.On("SPELL_PUSHED_TO_ACTIONBAR", onPushed)

-- The first load screen starts the settling time; a later one tries a refused update again.
local function onWorld()
  if not KN.settled then return C_Timer.After(KN.SETTLE, ns.Guard("keys learn settle", function() KN.settled = true end)) end
  if KN.pending then soon() end
end
ns.On("PLAYER_ENTERING_WORLD", onWorld)
