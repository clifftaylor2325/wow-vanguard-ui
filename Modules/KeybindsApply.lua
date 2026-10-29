-- Key setup's apply engine: what a key preset writes, and how it is put back.
-- Nothing here runs by itself yet: the presets and the wizard that will call
-- it, and the Your keys card's put-back buttons, come in later keybind phases.
--
-- A preset is a list of entries, { key, spell, slot } (bind the key to the
-- button on that slot, holding that spell) or { key, command } (a stance or pet
-- key, bound to the game's own command). KA.Plan works out what each entry
-- would do without changing anything; KA.Apply does it. Presets write only to
-- bars 1 to 3 while Vanguard draws them: bar 1's page and its stance, form and
-- stealth pages, bar 2 (slots 61 to 72) and bar 3 (49 to 60). For each entry,
-- in order: when its slot is on bar 2 or 3 and the spell is already on bar 2
-- or 3, the key is bound to that button (a bar 1 key always stays on its own
-- button, since bar 1 pages with the stance); else when the slot is empty, the
-- spell goes there; else when it holds a spell the character knows, that spell
-- moves to a free slot of bar 3's 5 to 12 and the new one takes its place;
-- anything else (a macro, an item, a mount) is never touched and the key stays
-- as it was. One key may take several bar 1 pages (the same game command).
--
-- Apply and putting back are refused, never queued: in combat, under an
-- add-on restriction, on a client that isn't WoW Forever, while the game's
-- Settings or Quick Keybind window or Vanguard's keybind mode is open, and
-- while the cursor holds something. Inside Apply the order is fixed: switch the
-- key set when asked ("Only this character"), work the plan out in that set,
-- take the record, place spells, set keys, save. A step that fails or errors,
-- or a write the client blocks, puts back everything this Apply changed (after
-- the fight, if one began) and saves nothing; a button that can't be put back
-- then is kept in the record, for "Put everything back".
--
-- The record is split by where things live: key rows go with the key set
-- (VanguardDB.keyRestore for the Account set, VanguardCharDB.keyRestore for
-- the Character set), slot rows always with the character
-- (VanguardCharDB.slotRestore, each naming its key and key set). A key or slot
-- that a later Apply changes again keeps its first pre-image while it still
-- held what Vanguard put there, and takes the new one when the player changed
-- it in between. Putting back skips a key or slot the player changed since, and
-- refuses when the game now uses the other key set. A key another character set
-- puts back here, and its spells go back on that character's bars at its next
-- login (VanguardDB.keyPending). At logout this character keeps a copy of both,
-- which comes back at login when the settings guard finds the account's saved
-- settings didn't load.
-- UNVERIFIED on a Forever client (docs/SMOKE-TEST.md): which of these calls the
-- client refuses in combat, that LoadBindings switches the key set, and whether
-- a command takes a third key (if the client drops one, putting back can't
-- bring the dropped key back).

local ADDON, ns = ...
local L = ns.L

local KA = {}
ns.KeybindsApply = KA

-- The slots a preset may write, by range: the bar each is on and the game command its keys fire. Bar 1 is its
-- page (1 to 12) and its stance, form and stealth pages (73 to 120); 121 to 144 are never written.
KA.RANGES = {
  { first = 1, last = 12, bar = 1, command = "ACTIONBUTTON" },
  { first = 73, last = 120, bar = 1, command = "ACTIONBUTTON" },
  { first = 61, last = 72, bar = 2, command = "MULTIACTIONBAR1BUTTON" },
  { first = 49, last = 60, bar = 3, command = "MULTIACTIONBAR2BUTTON" },
}
-- Bar 3's slots 5 to 12: where a known spell moved off its slot goes. Bars 3 and 2 (49 to 72) are searched for a
-- spell already on the bars, after the entry's own bar.
KA.SPARE = { first = 53, last = 60, bar = 3 }
KA.SEARCH = { first = 49, last = 72 }
-- The add-on restrictions that refuse an Apply (ns.Restricted), and the game windows that change keys themselves.
KA.RESTRICTIONS = { "Combat", "Encounter", "ChallengeMode", "PvPMatch" }
KA.KEY_WINDOWS = { "SettingsPanel", "QuickKeybindFrame" }
-- The row kinds that write: bind a key to a button that already holds the spell, place the spell on an empty slot,
-- move a known spell aside and place, or bind a key to a game command.
KA.WRITES = { bind = true, place = true, move = true, command = true }
-- The account file's tables this character's file keeps a copy of at logout (VanguardCharDB.keyBackup).
KA.BACKED_UP = { "keyRestore", "keyPending" }

-- Reading the bars ---------------------------------------------------------------------------

-- The range a slot is in, or nil when a preset may not write it.
local function rangeOf(slot)
  for _, r in ipairs(KA.RANGES) do
    if type(slot) == "number" and slot >= r.first and slot <= r.last then return r end
  end
end

-- The game command whose key fires a slot ("MULTIACTIONBAR1BUTTON3" for slot 63), or nil outside bars 1 to 3.
---@param slot number
---@return string|nil
function KA.CommandFor(slot)
  local r = rangeOf(slot)
  return r and r.command .. ((slot - r.first) % 12 + 1)
end

-- Whether Vanguard draws bar 1, 2 or 3 now: its action bars are on and the profile has the bar switched on.
local function barOn(bar)
  local AB = ns.GetModule("ActionBars")
  local bars = AB and AB.settings and AB.settings.bars
  return type(bars) == "table" and type(bars[bar]) == "table" and bars[bar].enabled == true
end

-- What a slot holds, as { kind, id } with the id plain (nil when hidden); nil for an empty slot. A hidden kind
-- counts as something Vanguard never touches.
local function readSlot(slot)
  local kind, id = ns.Client.Call("GetActionInfo", slot)
  if ns.IsSecret(kind) then return { kind = "hidden" } end
  if kind == nil then return nil end
  return { kind = kind, id = ns.PlainNumber(id) }
end

-- Whether the cursor is plainly empty (a hidden answer counts as holding something).
local function cursorEmpty()
  local held = ns.Client.Call("GetCursorInfo")
  return not ns.IsSecret(held) and held == nil
end

-- Whether the player knows a spell (a plain yes from the client).
local function knows(spellID)
  local call = ns.SpellKnownCall()
  return type(spellID) == "number" and call ~= nil and ns.IsTrue(call(spellID))
end

-- Whether a slot's content is this spell: the same ID, or a spell of the same name (another rank).
local function holdsSpell(content, spellID)
  if not content or content.kind ~= "spell" or not content.id then return false end
  if content.id == spellID then return true end
  local name = ns.SpellName(content.id)
  return name ~= nil and name == ns.SpellName(spellID)
end

-- Working out a plan --------------------------------------------------------------------------
-- A plan reads each slot once and then keeps what it will hold once the rows so far are applied (view), with the
-- keys (key -> command) and slots those rows take, so a later row sees the bars as the earlier ones leave them.

-- What a slot will hold once the rows so far are applied (nil for empty).
local function viewOf(plan, slot)
  if plan.view[slot] == nil then plan.view[slot] = readSlot(slot) or false end
  return plan.view[slot] or nil
end

-- The slots searched for a spell already on the bars. A bar 1 entry only ever fires its own button (bar 1 pages
-- with the stance, so the key must stay on its slot): its own slot alone. A bar 2 or 3 entry: its own slot, its
-- bar, then the other of bars 2 and 3.
local function searchSlots(slot)
  local first, out = slot - (slot - 1) % 12, { slot }
  if rangeOf(slot).bar == 1 then return out end
  for s = first, first + 11 do
    if s ~= slot then out[#out + 1] = s end
  end
  for s = KA.SEARCH.first, KA.SEARCH.last do
    if s < first or s > first + 11 then out[#out + 1] = s end
  end
  return out
end

-- The first slot on a shown bar that holds the spell, by searchSlots, or nil.
local function foundAt(plan, row)
  for _, s in ipairs(searchSlots(row.slot)) do
    if barOn(rangeOf(s).bar) and holdsSpell(viewOf(plan, s), row.spell) then return s end
  end
end

-- A free slot of bar 3's 5 to 12 (empty, and not taken by this plan) while Vanguard draws bar 3, or nil.
local function spareSlot(plan)
  if not barOn(KA.SPARE.bar) then return nil end
  for s = KA.SPARE.first, KA.SPARE.last do
    if not viewOf(plan, s) and not plan.taken[s] then return s end
  end
end

-- The checks that decide a row, in order. Each answers a kind (with why, for "unchanged"), or nil to go on.

-- A row with a command and no spell binds the key to the game's command (a stance or pet key).
local function commandOnly(_, row)
  if row.spell == nil and type(row.command) == "string" then return "command" end
end

-- A slot outside bars 1 to 3, or on one Vanguard doesn't draw, is left alone.
local function slotShown(_, row)
  local r = rangeOf(row.slot)
  if not r then return "unchanged", "outside" end
  if not barOn(r.bar) then return "unchanged", "barOff" end
end

-- A spell the character doesn't know yet gets no key.
local function spellKnown(_, row)
  if not knows(row.spell) then return "unchanged", "unknown" end
end

-- A spell already on the bars: the key is bound to that button (its slot becomes the row's), unless this plan
-- already uses it.
local function alreadyOnBars(plan, row)
  local s = foundAt(plan, row)
  if not s then return nil end
  if plan.taken[s] then return "unchanged", "used" end
  row.slot = s
  return "bind"
end

-- The entry's own slot: taken by this plan, empty (the spell goes there), or a known spell (moved aside when bar
-- 3 has room; the row notes where to and what); anything else is kept.
local function ownSlot(plan, row)
  if plan.taken[row.slot] then return "unchanged", "used" end
  local content = viewOf(plan, row.slot)
  if not content then return "place" end
  if content.kind ~= "spell" or not knows(content.id) then return "unchanged", "kept" end
  local to = spareSlot(plan)
  if not to then return "unchanged", "full" end
  row.to, row.moved = to, content.id
  return "move"
end

local CHECKS = { commandOnly, slotShown, spellKnown, alreadyOnBars, ownSlot }

-- The kind of a row (and why, when it is "unchanged"), by the first check that answers.
local function classify(plan, row)
  for _, check in ipairs(CHECKS) do
    local kind, why = check(plan, row)
    if kind then return kind, why end
  end
end

-- The slots a row writes, in order, with the spell each gets: a moved spell's spare slot first, then the row's own.
local function changesOf(row)
  if row.kind == "move" then
    return { { slot = row.to, spell = row.moved }, { slot = row.slot, spell = row.spell } }
  end
  if row.kind == "place" then return { { slot = row.slot, spell = row.spell } } end
  return {}
end

-- A writing row's last word: a key this plan gave another command stays with that ("used"); a row that writes no
-- slot and binds a key to the command it already has is "unchanged" ("already").
local function settle(plan, row)
  if not KA.WRITES[row.kind] then return end
  local taken = plan.keys[row.key]
  if taken and taken ~= row.command then row.kind, row.why = "unchanged", "used" return end
  if #changesOf(row) == 0 and GetBindingAction(row.key) == row.command then row.kind, row.why = "unchanged", "already" end
end

-- Takes a row's key and button in the plan (an "already" row too, so no later row takes them), and its slots' new
-- contents into the view.
local function commit(plan, row)
  plan.keys[row.key] = row.command
  if row.slot then plan.taken[row.slot] = true end
  for _, change in ipairs(changesOf(row)) do
    plan.taken[change.slot] = true
    plan.view[change.slot] = { kind = "spell", id = change.spell }
  end
end

-- Works out one entry into a row: { key, spell, slot, command, kind, why, to, moved }.
local function planEntry(plan, entry)
  local row = { key = entry.key, spell = entry.spell, slot = entry.slot, command = entry.command }
  row.kind, row.why = classify(plan, row)
  row.command = row.command or KA.CommandFor(row.slot)
  settle(plan, row)
  if KA.WRITES[row.kind] or row.why == "already" then commit(plan, row) end
  plan.rows[#plan.rows + 1] = row
end

-- What a preset's entries would do now, in the key set in use, one row per entry, in order; nothing changes.
---@param entries table[]  { key, spell, slot } or { key, command }
---@return table[] rows  { key, spell, slot, command, kind, why, to, moved }; kind: bind, place, move, command, unchanged
function KA.Plan(entries)
  local plan = { rows = {}, view = {}, keys = {}, taken = {} }
  for _, entry in ipairs(entries) do planEntry(plan, entry) end
  return plan.rows
end

-- When it can run ------------------------------------------------------------------------------

-- Whether a game window by that name is shown.
local function windowShown(name)
  local f = _G[name]
  return type(f) == "table" and type(f.IsShown) == "function" and f:IsShown() == true
end

-- Not on WoW Forever: the presets are built on Forever's keys and class kits.
local function notForever()
  if not ns.IsForever() then return L["Vanguard's key setup is for WoW Forever only."] end
end

-- In a fight, or under an add-on restriction.
local function restricted()
  if ns.InCombat() then return L["Keys can't change in combat. Try again after the fight."] end
  for _, kind in ipairs(KA.RESTRICTIONS) do
    if ns.Restricted(kind) then return L["Keys can't change while the game restricts add-ons. Try again later."] end
  end
end

-- The game's own key windows, or Vanguard's keybind mode, open.
local function bindingOpen()
  for _, name in ipairs(KA.KEY_WINDOWS) do
    if windowShown(name) then return L["Close the game's Settings and Quick Keybind windows first."] end
  end
  local AB = ns.GetModule("ActionBars")
  if AB and AB.binding then return L["Leave keybind mode first."] end
end

-- Something on the cursor (placing a spell would drop it).
local function cursorFull()
  if not cursorEmpty() then return L["Put down what's on your cursor first."] end
end

local REFUSALS = { notForever, restricted, bindingOpen, cursorFull }

-- Why keys can't be applied or put back now, as a chat line; nil when they can.
---@return string|nil
function KA.Refusal()
  for _, check in ipairs(REFUSALS) do
    local why = check()
    if why then return why end
  end
end

-- Whether the game uses the account-wide key set, so a change here reaches every character (the Ready step will
-- warn about it).
---@return boolean
function KA.SharesKeys()
  return GetCurrentBindingSet() == Enum.BindingSet.Account
end

-- A key set Apply won't switch to: from this character's own keys back to the account's, which the game's own
-- switch warns deletes the character's keys. Nil for any other set.
local function switchRefusal(set)
  local sets = Enum.BindingSet
  if set == sets.Account and GetCurrentBindingSet() == sets.Character then
    return L["This character uses its own keys. Switch to account keys in the game's key bindings first."]
  end
end

-- Who is who -------------------------------------------------------------------------------------

-- This character's name in the account file ("Name-Realm"), or "?" while the client won't say.
local function me()
  return ns.SettingsGuard.CharKey() or "?"
end

-- The saved file a key set's record lives in: the account's for the Account set, this character's for its own.
local function storeFor(set)
  return set == Enum.BindingSet.Account and VanguardDB or VanguardCharDB
end

-- The key record kept for a set, { set, keys = { [key] = { before, after, by } } }, or nil.
local function recordFor(set)
  local rec = storeFor(set).keyRestore
  return type(rec) == "table" and rec.set == set and type(rec.keys) == "table" and rec or nil
end

-- The key record for a set, started when there is none.
local function ensureRecord(set)
  local rec = recordFor(set) or { set = set, keys = {} }
  storeFor(set).keyRestore = rec
  return rec
end

-- This character's slot record, { [slot] = { before = a spell ID or false for empty, after = a spell ID, key,
-- set } }; a row with no key is a button a failed Apply couldn't put back.
local function slotRecord()
  if type(VanguardCharDB.slotRestore) ~= "table" then VanguardCharDB.slotRestore = {} end
  return VanguardCharDB.slotRestore
end

-- Whether Vanguard's record says it changed this key, in the key set the game uses now (Your keys will mark it).
---@param key string
---@return boolean
function KA.Changed(key)
  local rec = recordFor(GetCurrentBindingSet())
  return rec ~= nil and rec.keys[key] ~= nil
end

-- Writing slots -----------------------------------------------------------------------------------

-- Empties a slot: its action comes up on the cursor and is dropped (only ever a spell Vanguard put there). Refuses
-- while the cursor holds something, which the pickup would swap onto the slot.
local function clearSlot(slot)
  if not cursorEmpty() then return false end
  ns.Client.Call("PickupAction", slot)
  ns.Client.Call("ClearCursor")
  return true
end

-- Puts a slot back to a pre-image: empty (false), or the spell picked up again from the spellbook. Whether it did.
local function restoreSlot(slot, before)
  if before then return ns.PlaceSpell(slot, before) end
  return clearSlot(slot)
end

-- A slot's content as a pre-image: its spell ID, or false when empty (Apply only ever writes those two).
local function preimage(content)
  return content and content.id or false
end

-- Puts back this character's slot rows that `matches` picks, each only while it still holds what Vanguard put
-- there (else it is the player's now), and forgets them. Answers how many went back.
local function restoreRows(matches)
  local slots, count = slotRecord(), 0
  for slot, row in pairs(slots) do
    if type(row) == "table" and matches(row) then
      if holdsSpell(readSlot(slot), row.after) and restoreSlot(slot, row.before) then count = count + 1 end
      slots[slot] = nil
    end
  end
  return count
end

-- Applying ----------------------------------------------------------------------------------------
-- A run is one Apply in progress: { entries, rows, set, from (the set it switched from), keys = { [key] = old
-- command }, slots = { [slot] = pre-image }, placed = { [slot] = the spell it put there }, blocked }. KA.run is set
-- while it runs, so a blocked call can fail it.

-- A blocked or forbidden call while an Apply runs fails it (the client refused one of its writes).
local function onBlocked(_, addon)
  if KA.run and addon == ADDON then KA.run.blocked = true end
end
ns.On("ADDON_ACTION_BLOCKED", onBlocked)
ns.On("ADDON_ACTION_FORBIDDEN", onBlocked)

-- Switches to the key set the Apply asked for as the game's own switch does (save the old, load, save the new),
-- noting the old one for a rollback; nothing when it is the set in use already.
local function switchSet(run)
  local from = GetCurrentBindingSet()
  run.set = run.set or from
  if run.set == from then return true end
  run.from = from
  SaveBindings(from)
  LoadBindings(run.set)
  SaveBindings(run.set)
  return GetCurrentBindingSet() == run.set
end

-- Works the plan out in the key set the run now uses.
local function planRows(run)
  run.rows = KA.Plan(run.entries)
  return true
end

-- Takes the pre-image of every key and slot the rows write, before anything changes.
local function takeRecord(run)
  for _, row in ipairs(run.rows) do
    if KA.WRITES[row.kind] and run.keys[row.key] == nil then run.keys[row.key] = GetBindingAction(row.key) end
    for _, change in ipairs(changesOf(row)) do run.slots[change.slot] = preimage(readSlot(change.slot)) end
  end
  return true
end

-- Places every row's spells, in order, noting each; false at the first that doesn't take or is blocked.
local function placeSpells(run)
  for _, row in ipairs(run.rows) do
    for _, change in ipairs(changesOf(row)) do
      if not ns.PlaceSpell(change.slot, change.spell) or run.blocked then return false end
      run.placed[change.slot] = change.spell
    end
  end
  return true
end

-- Binds every writing row's key to its command; false at the first the client refuses.
local function setKeys(run)
  for _, row in ipairs(run.rows) do
    if KA.WRITES[row.kind] and (not SetBinding(row.key, row.command) or run.blocked) then return false end
  end
  return true
end

-- Saves the keys in the set in use (a blocked save is caught by onBlocked).
local function saveKeys()
  SaveBindings(GetCurrentBindingSet())
  return true
end

local STEPS = { switchSet, planRows, takeRecord, placeSpells, setKeys, saveKeys }

-- Runs the steps in order; false when one fails or the client blocked a write.
local function runSteps(run)
  for _, step in ipairs(STEPS) do
    if not step(run) or run.blocked then return false end
  end
  return true
end

-- Keeps the buttons a rollback couldn't put back as slot rows with no key, for "Put everything back".
local function keepLeft(run, left)
  local slots = slotRecord()
  for _, slot in ipairs(left) do
    slots[slot] = { before = run.slots[slot], after = run.placed[slot], set = run.from or run.set }
  end
end

-- Puts back what a failed run changed: each slot that still holds the spell it put there, then the keys by loading
-- the saved set (which drops the unsaved ones); a run that switched loads and saves the old set again.
local function undoRun(run)
  local left = {}
  for slot, placed in pairs(run.placed) do
    if holdsSpell(readSlot(slot), placed) and not restoreSlot(slot, run.slots[slot]) then left[#left + 1] = slot end
  end
  LoadBindings(run.from or GetCurrentBindingSet())
  if run.from then SaveBindings(run.from) end
  keepLeft(run, left)
  if #left == 0 then return ns.Chat(L["No key changed: the game refused one of the changes, so Vanguard put everything back."]) end
  ns.Chat(ns.Format(L["No key changed, but {count} button(s) couldn't be put back yet. Put everything back restores them."], { count = #left }))
end

-- Records one applied key: its first pre-image while the key still did what Vanguard last set, else the one this
-- run took (the player changed it in between).
local function keepKey(run, rec, row)
  local old, now = rec.keys[row.key], run.keys[row.key]
  local before = now
  if old and now == old.after then before = old.before end
  rec.keys[row.key] = { before = before, after = row.command, by = me() }
end

-- Records the slots one applied row changed, each keeping its first pre-image the same way.
local function keepSlots(run, slots, row)
  for _, change in ipairs(changesOf(row)) do
    local old, before = slots[change.slot], run.slots[change.slot]
    if type(old) == "table" and before == old.after then before = old.before end
    slots[change.slot] = { before = before, after = change.spell, key = row.key, set = run.set }
  end
end

-- Saves the record of a run that succeeded, and says how many keys changed.
local function keep(run)
  local rec, slots, count = ensureRecord(run.set), slotRecord(), 0
  for _, row in ipairs(run.rows) do
    if KA.WRITES[row.kind] then
      keepKey(run, rec, row)
      keepSlots(run, slots, row)
      count = count + 1
    end
  end
  ns.Chat(ns.Format(L["{count} key(s) set. Vanguard kept what the keys did before, so you can put them back."], { count = count }))
end

-- Whether any row writes.
local function writes(rows)
  for _, row in ipairs(rows or {}) do
    if KA.WRITES[row.kind] then return true end
  end
  return false
end

-- Ends a run: keeps its record when it succeeded (none when nothing needed changing); else puts it back, after the
-- fight if one began. Answers whether it succeeded.
local function finish(run, ok)
  KA.run = nil
  if ok and not writes(run.rows) then ns.Chat(L["No key needs changing."]) return true end
  if ok then keep(run) return true end
  if ns.InCombat() then ns.Chat(L["No key changed: a fight began, so Vanguard puts your buttons back after it."]) end
  ns.OutOfCombat(function() undoRun(run) end)
  return false
end

-- Applies a preset's entries as KA.Plan works them out in key set `set` (Enum.BindingSet.Character for "Only this
-- character", Account for all characters; the set in use when nil). Refused, with a chat line, when KA.Refusal says
-- so, or to switch from this character's own keys back to the account's. True when every change was made and saved.
---@param entries table[]
---@param set number|nil
---@return boolean
function KA.Apply(entries, set)
  local why = KA.Refusal() or switchRefusal(set)
  if why then ns.Chat(why) return false end
  local run = { entries = entries, set = set, keys = {}, slots = {}, placed = {} }
  KA.run = run
  local done, ok = ns.Try("key setup apply", runSteps, run)
  return finish(run, done and ok)
end

-- Putting back ------------------------------------------------------------------------------------
-- A put-back fills a result: { back = keys put back, kept = keys the player changed since, failed = keys the game
-- refused, others = characters whose spells go back at their next login }.

-- The command a pre-image names, or nil for a key that did nothing.
local function commandOrNil(before)
  return type(before) == "string" and before ~= "" and before or nil
end

-- Notes another character's key whose spells go back at that character's next login.
local function markPending(by, key, result)
  VanguardDB.keyPending = type(VanguardDB.keyPending) == "table" and VanguardDB.keyPending or {}
  local pending = type(VanguardDB.keyPending[by]) == "table" and VanguardDB.keyPending[by] or {}
  pending[key] = true
  VanguardDB.keyPending[by] = pending
  result.others[by] = true
end

-- Puts one recorded key back to its old command while it still does what Vanguard set (else it stays as the player
-- set it), and its spells: here, or at the next login of the character that applied it. False, with the row kept,
-- when the game refuses the key.
local function putBackKey(rec, key, row, result)
  local ours = GetBindingAction(key) == row.after
  if ours and not SetBinding(key, commandOrNil(row.before)) then result.failed[#result.failed + 1] = key return false end
  if row.by == me() then
    restoreRows(function(r) return r.set == rec.set and r.key == key end)
  else
    markPending(row.by, key, result)
  end
  if ours then result.back = result.back + 1 else result.kept[#result.kept + 1] = key end
  return true
end

-- Whether this character has buttons a failed Apply couldn't put back (slot rows with no key).
local function hasLeftovers()
  for _, row in pairs(slotRecord()) do
    if type(row) == "table" and row.key == nil then return true end
  end
  return false
end

-- The record a put-back works on: the one for the key set in use (an empty one when only a failed Apply's buttons
-- are left). Nil and why when keys can't change now, when Vanguard set its keys in the other set (the player
-- switched since), or when there is nothing to put back.
local function usableRecord()
  local why = KA.Refusal()
  if why then return nil, why end
  local set, sets = GetCurrentBindingSet(), Enum.BindingSet
  local rec = recordFor(set)
  if rec then return rec end
  local other = set == sets.Account and sets.Character or sets.Account
  if recordFor(other) then return nil, L["Vanguard set these keys in your other key set (account-wide, or this character's own). Switch back in the game's key bindings to put them back."] end
  if hasLeftovers() then return { set = set, keys = {} } end
  return nil, L["Vanguard hasn't changed any of your keys."]
end

-- Says what a put-back did.
local function report(result)
  ns.Chat(ns.Format(L["Put back {count} key(s)."], { count = result.back }))
  if #result.kept > 0 then
    ns.Chat(ns.Format(L["Changed since, so left as you set them: {keys}."], { keys = table.concat(result.kept, ", ") }))
  end
  if #result.failed > 0 then
    ns.Chat(ns.Format(L["The game refused to put back: {keys}."], { keys = table.concat(result.failed, ", ") }))
  end
  for by in pairs(result.others) do
    ns.Chat(ns.Format(L["Spells moved on {name}'s bars go back when you log in as {name}."], { name = by:match("^[^-]+") or by }))
  end
end

-- Saves the keys, forgets an emptied record, and says what happened.
local function finishPutBack(rec, result)
  SaveBindings(GetCurrentBindingSet())
  if next(rec.keys) == nil and recordFor(rec.set) then storeFor(rec.set).keyRestore = nil end
  report(result)
end

-- Puts one key back as it was before Vanguard changed it ("Put back what I had"), with the spells it moved.
-- False, after a chat line, when it can't now or Vanguard didn't change that key.
---@param key string
---@return boolean
function KA.PutBack(key)
  local rec, why = usableRecord()
  local row = rec and rec.keys[key]
  if not row then ns.Chat(why or L["Vanguard didn't change that key."]) return false end
  local result = { back = 0, kept = {}, failed = {}, others = {} }
  if putBackKey(rec, key, row, result) then rec.keys[key] = nil end
  finishPutBack(rec, result)
  return #result.failed == 0
end

-- Puts back every key Vanguard changed in the key set in use, and every spell it moved on this character's bars
-- for that set, with any button a failed Apply left ("Put everything back"). False, after a chat line, when it
-- can't now or there is nothing to put back.
---@return boolean
function KA.PutBackAll()
  local rec, why = usableRecord()
  if not rec then ns.Chat(why) return false end
  local result = { back = 0, kept = {}, failed = {}, others = {} }
  for key, row in pairs(rec.keys) do
    if putBackKey(rec, key, row, result) then rec.keys[key] = nil end
  end
  restoreRows(function(r) return r.set == rec.set or r.key == nil end)
  finishPutBack(rec, result)
  return #result.failed == 0
end

-- Login and logout --------------------------------------------------------------------------------

-- This character's spells another character's put-back left waiting go back, when nothing refuses it now (else
-- they wait for the next load screen).
function KA.RestorePending()
  local pending = type(VanguardDB.keyPending) == "table" and VanguardDB.keyPending[me()]
  if type(pending) ~= "table" or KA.Refusal() then return end
  VanguardDB.keyPending[me()] = nil
  local account = Enum.BindingSet.Account
  local count = restoreRows(function(r) return r.set == account and pending[r.key] == true end)
  if count > 0 then ns.Chat(L["The spells Vanguard moved on this character's bars are back where they were."]) end
end

-- Each load screen tries the waiting spells again, out of combat.
ns.On("PLAYER_ENTERING_WORLD", function() ns.OutOfCombat(KA.RestorePending, "keys pending") end)

-- At logout this character keeps a copy of the account's key record and waiting spells (the settings guard's
-- backup carries them).
function KA.BackUp()
  local copy = {}
  for _, name in ipairs(KA.BACKED_UP) do
    copy[name] = type(VanguardDB[name]) == "table" and ns.Copy(VanguardDB[name]) or nil
  end
  VanguardCharDB.keyBackup = copy
end
ns.On("PLAYER_LOGOUT", KA.BackUp)

-- At login, after the settings guard: when the account's saved settings didn't load, its key record and waiting
-- spells are this character's copy from its last logout (none when it had none then).
function KA.RestoreBackup()
  if not ns.SettingsGuard.Lost() then return end
  local copy = type(VanguardCharDB.keyBackup) == "table" and VanguardCharDB.keyBackup or {}
  for _, name in ipairs(KA.BACKED_UP) do
    VanguardDB[name] = type(copy[name]) == "table" and ns.Copy(copy[name]) or nil
  end
end
ns.On("PLAYER_LOGIN", KA.RestoreBackup)
