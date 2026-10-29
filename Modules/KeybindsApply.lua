-- Key setup's apply engine: what a key preset writes, and how it is put back.
-- The wizard calls KA.Apply; Modules/KeybindsLearn.lua calls KA.Update quietly
-- as new spells are learned, with the same plan, record and rollback.
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
-- as it was. A moved spell that another row of the plan places on its own key,
-- or that the entry's spell replaces, is overwritten instead of kept on bar 3.
-- One key may take several bar 1 pages (the same game command).
--
-- Apply and putting back are refused, never queued: in combat, under an
-- add-on restriction, on a client that isn't WoW Forever, while the game's
-- Settings, Quick Keybind or Click Casting window or Vanguard's keybind mode is
-- open, and while the cursor holds something. Inside Apply the order is fixed: switch the
-- key set when asked ("Only this character"), work the plan out in that set,
-- take the record, place spells, set keys, save. A step that fails or errors,
-- or a write the client blocks, puts back everything this Apply changed (after
-- the fight, if one began) and saves nothing; a button that can't be put back
-- then is kept in the record, for "Put everything back".
--
-- The record is split by where things live: key rows go with the key set
-- (VanguardDB.keyRestore for the Account set, VanguardCharDB.keyRestore for
-- the Character set), slot rows always with the character
-- (VanguardCharDB.slotRestore: per button, its first pre-image and a layer for
-- each key that changed it, with its key set). A key or button that a later
-- Apply changes again keeps its first pre-image while it still held what
-- Vanguard put there, and takes the new one when the player changed it in
-- between; putting one key back peels its layer, so the button shows what that
-- key found, and a button a later key still uses keeps its spell. Putting back
-- skips a key or slot the player changed since, and refuses when the game now
-- uses the other key set. An account key another character set puts back here,
-- and its spells go back on every character the record names at its next login
-- (VanguardDB.keyPending), unless the key was set again since. At logout this character keeps a copy of both,
-- which comes back at login when the settings guard finds the account's saved
-- settings didn't load.
-- UNVERIFIED on a Forever client (docs/SMOKE-TEST.md): which of these calls the
-- client refuses in combat, that LoadBindings switches the key set, and whether
-- a command takes a third key (a preset never gives one a third), and that the
-- action slots are readable at the load screen.

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
KA.RESTRICTIONS = { "Combat", "Encounter", "ChallengeMode", "PvPMatch", "Map" }
KA.KEY_WINDOWS = { "SettingsPanel", "QuickKeybindFrame", "ClickBindingFrame" }
-- The modifiers of a key chord, in the order the game writes them ("ALT-CTRL-SHIFT-META-1", BindingUtil.lua).
KA.MODIFIERS = { "ALT", "CTRL", "SHIFT", "META" }
-- The row kinds that write: bind a key to a button that already holds the spell, place the spell on an empty slot,
-- move a known spell aside and place, or bind a key to a game command.
KA.WRITES = { bind = true, place = true, move = true, command = true }
-- The account file's tables this character's file keeps a copy of at logout (VanguardCharDB.keyBackup).
KA.BACKED_UP = { "keyRestore", "keyPending" }

-- Reading the bars ---------------------------------------------------------------------------

-- The range a slot is in, or nil when a preset may not write it.
local function rangeOf(slot)
  for _, r in ipairs(KA.RANGES) do
    if type(slot) == "number" and slot % 1 == 0 and slot >= r.first and slot <= r.last then return r end
  end
end

-- The game command whose key fires a slot ("MULTIACTIONBAR1BUTTON3" for slot 63), or nil outside bars 1 to 3.
---@param slot number
---@return string|nil
function KA.CommandFor(slot)
  local r = rangeOf(slot)
  return r and r.command .. ((slot - r.first) % 12 + 1)
end

-- Whether Vanguard draws a slot's button now: its action bars are on, the profile has the slot's bar (1, 2 or 3)
-- switched on, and the bar shows that many buttons (a hidden button gets no key).
local function buttonOn(slot)
  local AB, r = ns.GetModule("ActionBars"), rangeOf(slot)
  local bars = r and AB and AB.settings and AB.settings.bars
  local bar = type(bars) == "table" and bars[r.bar]
  if type(bar) ~= "table" or bar.enabled ~= true then return false end
  return (slot - r.first) % 12 + 1 <= (tonumber(bar.buttons) or 12)
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

-- The first slot on a shown bar that holds the spell, by searchSlots, or nil (a slot the player took over is skipped).
local function foundAt(plan, row)
  for _, s in ipairs(searchSlots(row.slot)) do
    if buttonOn(s) and not plan.skip[s] and holdsSpell(viewOf(plan, s), row.spell) then return s end
  end
end

-- A free slot of bar 3's 5 to 12 (empty, shown, not taken by this plan nor by the player), or nil.
local function spareSlot(plan)
  for s = KA.SPARE.first, KA.SPARE.last do
    if buttonOn(s) and not viewOf(plan, s) and not plan.taken[s] and not plan.claimed[s] and not plan.skip[s] then return s end
  end
end

-- The checks that decide a row, in order. Each answers a kind (with why, for "unchanged"), or nil to go on.

-- A row with a command and no spell binds the key to the game's command (a stance or pet key).
local function commandOnly(_, row)
  if row.spell == nil and type(row.command) == "string" then return "command" end
end

-- A slot outside bars 1 to 3, on one Vanguard doesn't draw, or one the player took over, is left alone.
local function slotShown(plan, row)
  local r = rangeOf(row.slot)
  if not r then return "unchanged", "outside" end
  if not buttonOn(row.slot) then return "unchanged", "barOff" end
  if plan.skip[row.slot] then return "unchanged", "owned" end
end

-- A spell the character doesn't know yet gets no key.
local function spellKnown(_, row)
  if not knows(row.spell) then return "unchanged", "unknown" end
end

-- A spell already on the bars (a spell this plan moved aside too): the key is bound to that button (its slot
-- becomes the row's), unless this plan already gave that button a key.
local function alreadyOnBars(plan, row)
  local s = foundAt(plan, row)
  if not s then return nil end
  if plan.claimed[s] then return "unchanged", "used" end
  row.slot = s
  return "bind"
end

-- The entry's own slot: taken by this plan, empty (the spell goes there), or a known spell: overwritten when the
-- first pass found its move needless (`over`), else moved aside when bar 3 has room (the row notes where to and
-- what); anything else is kept.
local function ownSlot(plan, row)
  if plan.taken[row.slot] or plan.claimed[row.slot] then return "unchanged", "used" end
  local content = viewOf(plan, row.slot)
  if not content then return "place" end
  if content.kind ~= "spell" or not knows(content.id) then return "unchanged", "kept" end
  local needless = plan.needless[plan.index]
  if needless then row.over, row.replaced = content.id, needless == "replaced" return "place" end
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

-- Whether a command already has two keys, counting those this plan gives it, and this isn't one of them: the game
-- shows two keys a command, and a third may push one out (unverified), which a put-back couldn't bring back.
local function keysFull(plan, row)
  local keys, count = {}, 0
  for _, key in ipairs({ GetBindingKey(row.command) }) do keys[key] = true end
  for key in pairs(plan.added[row.command] or {}) do keys[key] = true end
  if keys[row.key] then return false end
  for _ in pairs(keys) do count = count + 1 end
  return count >= 2
end

-- A writing row's last word: a key this plan gave another command stays with that ("used"); a row that writes no
-- slot and binds a key to the command it already has is "unchanged" ("already"); a command with two other keys
-- takes no third ("keys").
local function settle(plan, row)
  if not KA.WRITES[row.kind] then return end
  local taken = plan.keys[row.key]
  if taken and taken ~= row.command then row.kind, row.why = "unchanged", "used" return end
  if #changesOf(row) == 0 and GetBindingAction(row.key) == row.command then row.kind, row.why = "unchanged", "already" return end
  if keysFull(plan, row) then row.kind, row.why = "unchanged", "keys" end
end

-- Takes a row's key, its command's new key and its button in the plan (an "already" row too, so no later row takes
-- them), and its slots' new contents into the view: `claimed` buttons have a key, `taken` slots were written.
local function commit(plan, row)
  plan.keys[row.key] = row.command
  plan.added[row.command] = plan.added[row.command] or {}
  plan.added[row.command][row.key] = true
  if row.slot then plan.claimed[row.slot] = true end
  for _, change in ipairs(changesOf(row)) do
    plan.taken[change.slot] = true
    plan.view[change.slot] = { kind = "spell", id = change.spell }
  end
end

-- A key chord with its modifiers in the game's order ("SHIFT-CTRL-1" becomes "CTRL-SHIFT-1"), or nil when it isn't
-- a key (not a string, or nothing after the modifiers).
local function chord(key)
  if type(key) ~= "string" then return nil end
  local held, base = {}, key
  for _, mod in ipairs(KA.MODIFIERS) do
    base = base:gsub("%f[%w]" .. mod .. "%-", function() held[#held + 1] = mod return "" end)
  end
  if base == "" then return nil end
  held[#held + 1] = base
  return table.concat(held, "-")
end

-- A key chord with its modifiers in the game's order, or nil when it isn't a key (KeybindsLearn compares keys).
---@param key any
---@return string|nil
function KA.Chord(key)
  return chord(key)
end

-- Works out one entry into a row: { key, spell, slot, command, replaces, kind, why, to, moved }. An entry without a
-- key is "unchanged" ("invalid").
local function planEntry(plan, entry)
  local row = { key = chord(entry.key), spell = entry.spell, slot = entry.slot, command = entry.command, replaces = entry.replaces }
  if not row.key then row.kind, row.why = "unchanged", "invalid" plan.rows[#plan.rows + 1] = row return end
  row.kind, row.why = classify(plan, row)
  row.command = row.command or KA.CommandFor(row.slot)
  settle(plan, row)
  if KA.WRITES[row.kind] or row.why == "already" then commit(plan, row) end
  plan.rows[#plan.rows + 1] = row
end

-- Whether two spell IDs are the same spell: the same ID, or the same name (another rank).
local function sameSpell(a, b)
  return holdsSpell({ kind = "spell", id = a }, b)
end

-- Whether any item of a list passes `test`.
local function any(list, test)
  for _, item in ipairs(list) do
    if test(item) then return true end
  end
  return false
end

-- Whether a row's entry lists a spell among those it replaces.
local function replaces(row, spellID)
  return type(row.replaces) == "table" and any(row.replaces, function(id) return sameSpell(id, spellID) end)
end

-- The first slot of the 12-slot page a slot is on.
local function pageOf(slot)
  return slot - (slot - 1) % 12
end

-- Whether a spell on slot `to` can be reached wherever one on slot `from` could: `to` on bar 2 or 3, or on the
-- same bar 1 page as `from` (a spell placed on another stance page only works in that stance).
local function inReach(to, from)
  local r = rangeOf(to)
  if not r or r.bar ~= 1 then return r ~= nil end
  return rangeOf(from) ~= nil and rangeOf(from).bar == 1 and pageOf(to) == pageOf(from)
end

-- Whether another row of the plan places the spell a row moves, in reach of where it was.
local function placedElsewhere(rows, row)
  return any(rows, function(r)
    return r ~= row and (r.kind == "place" or r.kind == "move") and sameSpell(r.spell, row.moved) and inReach(r.slot, row.slot)
  end)
end

-- Why a moved spell needn't go to bar 3, while no row binds a key to the bar 3 slot it would go to: "replaced" when
-- the row's entry replaces it (Ice Armor for Frost Armor), "placed" when another row places it in reach; nil when
-- it must go.
local function moveNeedless(rows, row)
  if any(rows, function(r) return r.kind == "bind" and r.slot == row.to end) then return nil end
  if replaces(row, row.moved) then return "replaced" end
  if placedElsewhere(rows, row) then return "placed" end
end

-- The moves of a pass that needn't go to bar 3, by entry index (see moveNeedless), or nil when there are none.
local function needlessMoves(rows)
  local out
  for i, row in ipairs(rows) do
    local why = row.kind == "move" and moveNeedless(rows, row)
    if why then out = out or {} out[i] = why end
  end
  return out
end

-- One pass over the entries, with the slots the player took over (`skip`) and the moves an earlier pass found
-- needless (`needless`, by entry index).
local function planPass(entries, skip, needless)
  local plan = { rows = {}, view = {}, keys = {}, added = {}, taken = {}, claimed = {}, skip = skip or {}, needless = needless or {} }
  for i, entry in ipairs(entries) do
    plan.index = i
    planEntry(plan, entry)
  end
  return plan.rows
end

-- What a preset's entries would do now, in the key set in use, one row per entry, in order; nothing changes. An
-- entry may list the spells it replaces (`replaces`, spell IDs). A known spell moved off its slot is overwritten
-- instead (kind "place", `over`) when the entry replaces it (`replaced`) or another row places it in reach: the
-- plan is worked out a second time so no bar 3 slot is held for it. Slots in `skip` (the player's) are never
-- written, searched or moved to.
---@param entries table[]  { key, spell, slot, replaces } or { key, command }
---@param skip table|nil  { [slot] = true }
---@return table[] rows  { key, spell, slot, command, kind, why, to, moved, over, replaced }; kind: bind, place, move, command, unchanged
function KA.Plan(entries, skip)
  local rows = planPass(entries, skip)
  local needless = needlessMoves(rows)
  return needless and planPass(entries, skip, needless) or rows
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
    if windowShown(name) then return L["Close the game's Settings, Quick Keybind and Click Casting windows first."] end
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

-- The key record kept for a set, { set, keys = { [key] = { before, after, by = { [character] = true } } } }, or
-- nil. `by` names every character whose bars hold spells Vanguard placed for that key.
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

-- This character's slot record: { [slot] = { before = the first pre-image (a spell ID, or false for empty),
-- layers = { { key, after = a spell ID, set }, ... } } }, the top layer being what Vanguard last put there and
-- which key it was for. A layer with no key is a button a failed Apply couldn't put back.
local function slotRecord()
  if type(VanguardCharDB.slotRestore) ~= "table" then VanguardCharDB.slotRestore = {} end
  return VanguardCharDB.slotRestore
end

-- Whether a slot row is whole (a hand-edited file may hold anything).
local function rowOk(row)
  return type(row) == "table" and type(row.layers) == "table" and type(row.layers[1]) == "table"
end

-- What Vanguard last put on a slot row's button.
local function shownBy(row)
  return row.layers[#row.layers].after
end

-- Whether a key still does what Vanguard last set it to, by its record in the key set the game uses now (another
-- character's Apply in the account set counts).
---@param key string
---@return boolean
function KA.Ours(key)
  local rec, name = recordFor(GetCurrentBindingSet()), chord(key)
  local row = rec and name and rec.keys[name]
  return type(row) == "table" and row.after ~= nil and GetBindingAction(name) == row.after
end

-- Whether Vanguard's record says it changed this key, in the key set the game uses now (Your keys will mark it).
---@param key string
---@return boolean
function KA.Changed(key)
  local rec, name = recordFor(GetCurrentBindingSet()), chord(key)
  return rec ~= nil and name ~= nil and rec.keys[name] ~= nil
end

-- Writing slots -----------------------------------------------------------------------------------

-- A slot's content as a pre-image: its spell ID, false when empty, or "other" for anything else (a macro, an item,
-- a spell whose ID is hidden), which never matches what Vanguard put there.
local function preimage(content)
  if not content then return false end
  return content.kind == "spell" and content.id or "other"
end

-- Whether a slot's content can't be read plainly now (a hidden kind, or a spell whose ID is hidden).
local function unreadable(content)
  return content ~= nil and (content.kind == "hidden" or (content.kind == "spell" and content.id == nil))
end

-- Whether a slot now holds exactly this pre-image (a spell ID, or false for empty).
local function slotIs(slot, want)
  return preimage(readSlot(slot)) == want
end

-- Empties a slot: its action comes up on the cursor and is dropped (only ever a spell Vanguard put there). Refuses
-- while the cursor holds something, which the pickup would swap onto the slot.
local function clearSlot(slot)
  if not cursorEmpty() then return false end
  ns.Client.Call("PickupAction", slot)
  ns.Client.Call("ClearCursor")
  return true
end

-- Puts a spell on a slot and checks the slot took it (the client may decline a spell, a passive one say).
local function placeExactly(slot, spellID)
  return ns.PlaceSpell(slot, spellID) and slotIs(slot, spellID)
end

-- Puts a slot back to a pre-image: empty (false), or the spell picked up again from the spellbook. Whether it did.
local function restoreSlot(slot, before)
  if before then return placeExactly(slot, before) end
  return clearSlot(slot) and slotIs(slot, false)
end

-- The layers `matches` doesn't pick, in order.
local function without(layers, matches)
  local kept = {}
  for _, layer in ipairs(layers) do
    if type(layer) ~= "table" or not matches(layer) then kept[#kept + 1] = layer end
  end
  return kept
end

-- Takes off a slot row's layers that `matches` picks and shows the new top (or the first pre-image) on the button,
-- while it still shows what Vanguard last put there; a row the player changed since is forgotten, and one whose
-- button can't be read or written now is kept as it was. Answers whether the button went back.
local function peel(slots, slot, row, matches)
  local kept, shown, content = without(row.layers, matches), shownBy(row), readSlot(slot)
  if #kept == #row.layers or unreadable(content) then return false end
  if preimage(content) ~= shown then slots[slot] = nil return false end
  local want = kept[1] and kept[#kept].after or row.before
  if want ~= shown and not restoreSlot(slot, want) then return false end
  row.layers = kept
  if #kept == 0 then slots[slot] = nil end
  return true
end

-- Peels the layers `matches` picks off every row of this character's slot record (see peel); a broken row is
-- dropped. Answers how many buttons went back.
local function restoreRows(matches)
  local slots, count = slotRecord(), 0
  for slot, row in pairs(slots) do
    if not rowOk(row) then slots[slot] = nil elseif peel(slots, slot, row, matches) then count = count + 1 end
  end
  return count
end

-- Puts a layer on a slot's row: on top while the button still showed what Vanguard last put there (pre, its
-- pre-image now), else a new row whose first pre-image is pre (the player changed it, or Vanguard never had it).
local function addLayer(slots, slot, pre, layer)
  local row = slots[slot]
  if rowOk(row) and shownBy(row) == pre then
    row.layers[#row.layers + 1] = layer
  else
    slots[slot] = { before = pre, layers = { layer } }
  end
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

-- Switches to the key set the Apply asked for as the game's own switch does (Settings.SelectCharacterBindings:
-- save the old, load, save the new), noting the old one for a rollback; nothing when it is the set in use already.
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
  run.rows = KA.Plan(run.entries, run.skip)
  return true
end

-- Takes the pre-image of every key and slot the rows write, before anything changes (a writing row keeps what its
-- key did as `was`, for KeybindsLearn's chat line).
local function takeRecord(run)
  for _, row in ipairs(run.rows) do
    if KA.WRITES[row.kind] then row.was = GetBindingAction(row.key) run.keys[row.key] = run.keys[row.key] or row.was end
    for _, change in ipairs(changesOf(row)) do run.slots[change.slot] = preimage(readSlot(change.slot)) end
  end
  return true
end

-- Places one spell and notes what the slot holds after, whenever that changed (even a spell it didn't ask for), so
-- a rollback finds it; whether the slot holds exactly the spell.
local function placeOne(run, change)
  local placed = ns.PlaceSpell(change.slot, change.spell)
  local now = preimage(readSlot(change.slot))
  if now ~= run.slots[change.slot] then run.placed[change.slot] = now end
  return placed and now == change.spell
end

-- Places every row's spells, in order; false at the first that doesn't take or is blocked.
local function placeSpells(run)
  for _, row in ipairs(run.rows) do
    for _, change in ipairs(changesOf(row)) do
      if not placeOne(run, change) or run.blocked then return false end
    end
  end
  return true
end

-- Binds a key to its command and reads it back (a blocked write whose event comes later still shows here).
local function bindOne(row)
  return SetBinding(row.key, row.command) and GetBindingAction(row.key) == row.command
end

-- Binds every writing row's key to its command; false at the first the client refuses.
local function setKeys(run)
  for _, row in ipairs(run.rows) do
    if KA.WRITES[row.kind] and (not bindOne(row) or run.blocked) then return false end
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

-- Goes back to the key set a run switched from, as the game's own switch does (load it, save it).
local function switchBack(run)
  if not run.from then return end
  LoadBindings(run.from)
  SaveBindings(run.from)
end

-- Keeps the buttons a rollback couldn't put back as layers with no key, for "Put everything back".
local function keepLeft(run, left)
  local slots = slotRecord()
  for _, slot in ipairs(left) do
    addLayer(slots, slot, run.slots[slot], { after = run.placed[slot], set = run.from or run.set })
  end
end

-- Puts back what a failed run changed: each slot that still holds exactly the spell it put there, then the keys by
-- loading the saved set (which drops the unsaved ones), or the set it switched from. A quiet run (an update) says
-- nothing; its caller does.
local function undoRun(run)
  local left = {}
  for slot, placed in pairs(run.placed) do
    if slotIs(slot, placed) and not restoreSlot(slot, run.slots[slot]) then left[#left + 1] = slot end
  end
  if run.from then switchBack(run) else LoadBindings(GetCurrentBindingSet()) end
  keepLeft(run, left)
  if run.quiet then return end
  if #left == 0 then return ns.Chat(L["No key changed: the game refused one of the changes, so Vanguard put everything back."]) end
  ns.Chat(ns.Format(L["No key changed, but {count} button(s) couldn't be put back yet. Put everything back restores them."], { count = #left }))
end

-- Records one applied key: its first pre-image, and every character it placed spells for, while the key still did
-- what Vanguard last set; else the pre-image this run took (the player changed it in between).
local function keepKey(run, rec, row)
  local old, now, by = rec.keys[row.key], run.keys[row.key], { [me()] = true }
  local before = now
  if type(old) == "table" and now == old.after then
    before = old.before
    for name in pairs(type(old.by) == "table" and old.by or {}) do by[name] = true end
  end
  rec.keys[row.key] = { before = before, after = row.command, by = by }
end

-- Records the slots one applied row changed as layers for its key; a bind row also takes a layer on a button
-- Vanguard placed a spell on before, so putting back the earlier key leaves the button to this one.
local function keepSlots(run, slots, row)
  for _, change in ipairs(changesOf(row)) do
    addLayer(slots, change.slot, run.slots[change.slot], { key = row.key, after = change.spell, set = run.set })
  end
  local shared = row.kind == "bind" and slots[row.slot]
  if rowOk(shared) and slotIs(row.slot, shownBy(shared)) then
    shared.layers[#shared.layers + 1] = { key = row.key, after = shownBy(shared), set = run.set }
  end
end

-- Saves the record of a run that succeeded (each key once); answers how many keys changed.
local function keep(run)
  local rec, slots, seen, count = ensureRecord(run.set), slotRecord(), {}, 0
  for _, row in ipairs(run.rows) do
    if KA.WRITES[row.kind] then
      if not seen[row.key] then keepKey(run, rec, row) count = count + 1 end
      seen[row.key] = true
      keepSlots(run, slots, row)
    end
  end
  return count
end

-- Whether any row writes.
local function writes(rows)
  for _, row in ipairs(rows or {}) do
    if KA.WRITES[row.kind] then return true end
  end
  return false
end

-- Ends a run: keeps its record when it succeeded (run.count, the keys it set); with nothing to change, no record and
-- no set switch. Else puts it back, after the fight if one began. Sets run.ok, whether it succeeded.
local function finish(run, ok)
  KA.run, run.ok, run.count = nil, ok, 0
  if ok and not writes(run.rows) then return switchBack(run) end
  if ok then run.count = keep(run) return end
  if ns.InCombat() and not run.quiet then ns.Chat(L["No key changed: a fight began, so Vanguard puts your buttons back after it."]) end
  ns.OutOfCombat(function() undoRun(run) end)
end

-- Runs a preset's entries in key set `set` (nil: the one in use), leaving out the slots in `skip`, as one
-- all-or-nothing run (`quiet`: no chat line when it fails), and returns the run.
local function execute(entries, set, where, skip)
  local run = { entries = entries, set = set, skip = skip, quiet = where == "key setup update", keys = {}, slots = {}, placed = {} }
  KA.run = run
  local done, ok = ns.Try(where, runSteps, run)
  finish(run, done and ok == true)
  return run
end

-- The key sets Apply takes: the one in use (nil), Account or Character.
local function knownSet(set)
  return set == nil or set == Enum.BindingSet.Account or set == Enum.BindingSet.Character
end

-- Applies a preset's entries as KA.Plan works them out in key set `set` (Enum.BindingSet.Character for "Only this
-- character", Account for all characters; the set in use when nil). Refused, with a chat line, when KA.Refusal says
-- so, or to switch from this character's own keys back to the account's. True when every change was made and saved.
---@param entries table[]
---@param set number|nil
---@return boolean
function KA.Apply(entries, set)
  if not knownSet(set) then error("KA.Apply: set is Enum.BindingSet.Account, Character or nil", 2) end
  local why = KA.Refusal() or switchRefusal(set)
  if why then ns.Chat(why) return false end
  local run = execute(entries, set, "key setup apply")
  if run.ok and run.count == 0 then ns.Chat(L["No key needs changing."]) end
  if run.count > 0 then ns.Chat(ns.Format(L["{count} key(s) set. Vanguard kept what the keys did before, so you can put them back."], { count = run.count })) end
  return run.ok
end

-- Whether Vanguard's record holds keys it set in the key set the game uses now.
---@return boolean
function KA.Recorded()
  local rec = recordFor(GetCurrentBindingSet())
  return rec ~= nil and next(rec.keys) ~= nil
end

-- Applies entries again in the key set in use, quietly, as new spells are learned (Modules/KeybindsLearn.lua): the
-- same plan, record and all-or-nothing run as Apply, with no chat line (the caller tells the player), never
-- writing, searching or moving to a slot in `skip` (the player's). Nil, with nothing changed, when KA.Refusal says
-- no; else the rows (each writing row's old command as `was`) when it succeeded, false when it didn't (and
-- everything it changed goes back).
---@param entries table[]
---@param skip table|nil  { [slot] = true }
---@return table[]|false|nil
function KA.Update(entries, skip)
  if KA.Refusal() then return nil end
  local run = execute(entries, nil, "key setup update", skip)
  return run.ok and run.rows
end

-- Putting back ------------------------------------------------------------------------------------
-- A put-back fills a result: { back = keys put back, kept = keys the player changed since, failed = keys the game
-- refused, others = characters whose spells go back at their next login }.

-- The command a pre-image names, or nil for a key that did nothing.
local function commandOrNil(before)
  return type(before) == "string" and before ~= "" and before or nil
end

-- Notes, for every other character a key placed spells for, that they go back at its next login.
local function markOthers(by, key, result)
  VanguardDB.keyPending = type(VanguardDB.keyPending) == "table" and VanguardDB.keyPending or {}
  for name in pairs(type(by) == "table" and by or {}) do
    if name ~= me() then
      local pending = type(VanguardDB.keyPending[name]) == "table" and VanguardDB.keyPending[name] or {}
      pending[key], VanguardDB.keyPending[name], result.others[name] = true, pending, true
    end
  end
end

-- Puts one recorded key back to its old command while it still does what Vanguard set (else it stays as the player
-- set it), and its spells: on this character's bars now, on the others' at their next login. False, with the row
-- and its spells kept, when the game refuses the key.
local function putBackKey(rec, key, row, result)
  local ours = GetBindingAction(key) == row.after
  if ours and not SetBinding(key, commandOrNil(row.before)) then result.failed[#result.failed + 1] = key return false end
  restoreRows(function(layer) return layer.key == key and layer.set == rec.set end)
  markOthers(row.by, key, result)
  if ours then result.back = result.back + 1 else result.kept[#result.kept + 1] = key end
  return true
end

-- Whether this character has buttons a failed Apply couldn't put back (layers with no key).
local function hasLeftovers()
  for _, row in pairs(slotRecord()) do
    for _, layer in ipairs(rowOk(row) and row.layers or {}) do
      if layer.key == nil then return true end
    end
  end
  return false
end

-- Whether a key record holds a key this character set: any key of its own set's record, a key that names it in the
-- account's.
local function mine(rec)
  if not rec then return false end
  for _, row in pairs(rec.keys) do
    if rec.set == Enum.BindingSet.Character or (type(row.by) == "table" and row.by[me()]) then return true end
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
  if mine(recordFor(other)) then return nil, L["Vanguard set these keys in your other key set (account-wide, or this character's own). Switch back in the game's key bindings to put them back."] end
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
  for name in pairs(result.others) do
    ns.Chat(ns.Format(L["Spells moved on {name}'s bars go back when you log in as {name}."], { name = name:match("^[^-]+") or name }))
  end
end

-- Saves the keys, forgets an emptied record, and says what happened.
local function finishPutBack(rec, result)
  SaveBindings(GetCurrentBindingSet())
  if next(rec.keys) == nil and recordFor(rec.set) then storeFor(rec.set).keyRestore = nil end
  report(result)
end

-- Puts one key back as it was before Vanguard changed it ("Put back what I had"), with the spells it placed or moved.
-- False, after a chat line, when it can't now, Vanguard didn't change that key, or the game refused it.
---@param key string
---@return boolean
function KA.PutBack(key)
  local rec, why = usableRecord()
  key = chord(key)
  local row = rec and key and rec.keys[key]
  if not row then ns.Chat(why or L["Vanguard didn't change that key."]) return false end
  local result = { back = 0, kept = {}, failed = {}, others = {} }
  if putBackKey(rec, key, row, result) then rec.keys[key] = nil end
  finishPutBack(rec, result)
  return #result.failed == 0
end

-- Puts back every key Vanguard changed in the key set in use, and every spell it changed on this character's bars
-- for that set, with any button a failed Apply left ("Put everything back"); a key the game refuses keeps its spells.
-- False, after a chat line, when it can't now, there is nothing to put back, or the game refused a key.
---@return boolean
function KA.PutBackAll()
  local rec, why = usableRecord()
  if not rec then ns.Chat(why) return false end
  local result = { back = 0, kept = {}, failed = {}, others = {} }
  for key, row in pairs(rec.keys) do
    if putBackKey(rec, key, row, result) then rec.keys[key] = nil end
  end
  restoreRows(function(layer) return layer.key == nil or (layer.set == rec.set and rec.keys[layer.key] == nil) end)
  finishPutBack(rec, result)
  return #result.failed == 0
end

-- Login and logout --------------------------------------------------------------------------------

-- Whether this character's slot record still has an Account layer for a key.
local function hasLayerFor(key)
  for _, row in pairs(slotRecord()) do
    for _, layer in ipairs(rowOk(row) and row.layers or {}) do
      if layer.key == key and layer.set == Enum.BindingSet.Account then return true end
    end
  end
  return false
end

-- A waiting key some character set again since (it is in the account's record): its spells stay, and the record
-- names this character again so the next put-back reaches it. Answers whether the key is live.
local function relink(live, key)
  local row = live[key]
  if type(row) ~= "table" then return false end
  if type(row.by) ~= "table" then row.by = {} end
  row.by[me()] = true
  return true
end

-- This character's spells another character's put-back left waiting go back, when nothing refuses it now; a key
-- whose buttons can't be read or written yet keeps waiting for the next load screen.
function KA.RestorePending()
  local pending = type(VanguardDB.keyPending) == "table" and VanguardDB.keyPending[me()]
  if type(pending) ~= "table" or KA.Refusal() then return end
  local live, account = (recordFor(Enum.BindingSet.Account) or { keys = {} }).keys, Enum.BindingSet.Account
  for key in pairs(pending) do pending[key] = not relink(live, key) or nil end
  local count = restoreRows(function(layer) return layer.set == account and pending[layer.key] == true end)
  for key in pairs(pending) do pending[key] = hasLayerFor(key) or nil end
  if next(pending) == nil then VanguardDB.keyPending[me()] = nil end
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
