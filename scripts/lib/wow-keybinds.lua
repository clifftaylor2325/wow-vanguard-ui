-- Key bindings, the cursor and action slots, stances and click bindings for the TEST-ONLY
-- client. Loads after wow-world.lua (it builds on its actions, spells and units) and before
-- wow-taint.lua (which blocks the writes in combat). Never shipped in game.
--
-- Sources: Blizzard's forever branch (KeyBindingsDocumentation.lua, ClickBindingsDocumentation.lua,
-- Blizzard_Keybindings.lua, ActionBarFrameDocumentation.lua) and warcraft.wiki.gg. Where the
-- client's behaviour was not seen, the line says "unverified" and the keybind phases' in-game
-- checks (docs/SMOKE-TEST.md) settle it.

local stub = __wfgStub
local world = stub.world

-- Binding sets ------------------------------------------------------------------------------
-- Enum.BindingSet: Default 0, Account 1, Character 2, Current 3 (KeyBindingsDocumentation.lua).
-- world.bindings (command -> keys) is the live copy the game works on; SaveBindings(set) copies
-- it into a saved set and LoadBindings(set) copies a saved set back, so a write nobody saved
-- is lost on the next load, as in game.

Enum.BindingSet = { Default = 0, Account = 1, Character = 2, Current = 3 }

-- A copy of a binding table, command -> keys.
local function copyBindings(bindings)
  local out = {}
  for command, keys in pairs(bindings) do out[command] = { unpack(keys) } end
  return out
end

-- The commands the game registers, in list order, as { command, category }: what GetBinding(i)
-- lists. A command bound with CLICK, SPELL, MACRO or ITEM is not in it.
world.bindingCommands = {}

-- Registers a command the game lists (the binding list's rows).
function world.registerBinding(command, category)
  world.bindingCommands[#world.bindingCommands + 1] = { command = command, category = category }
end

for i = 1, 12 do world.registerBinding("ACTIONBUTTON" .. i, "ACTIONBAR") end
world.registerBinding("TOGGLEBACKPACK", "INTERFACE")
world.registerBinding("OPENALLBAGS", "INTERFACE")

-- The saved sets: the Default set is what the world starts with, Account is the same,
-- and Character is empty until it is first loaded (then it starts as a copy of Account).
-- The Default set is a PLACEHOLDER: the real one binds every ACTIONBUTTON, the bars and many more commands, and
-- is client data nobody has read yet (the keybind phase's probe dumps it). A test must not read a key's absence
-- from it as fact.
world.bindingSets = { [0] = copyBindings(world.bindings), [1] = copyBindings(world.bindings) }
world.bindingSet = 1

-- The set the game saves to and loads from (1 Account or 2 Character; unverified: never 0 or 3).
function GetCurrentBindingSet() return world.bindingSet end

-- A set number that is one of the saved sets, else the client's usage error.
local function checkSet(name, which, allowed)
  if allowed[which] then return which end
  error(string.format("Usage: %s(which)", name), 3)
end

-- Whether two binding tables hold the same keys for every command.
local function sameBindings(a, b)
  for _, pair in ipairs({ { a, b }, { b, a } }) do
    for command, keys in pairs(pair[1]) do
      if table.concat(keys, ",") ~= table.concat(pair[2][command] or {}, ",") then return false end
    end
  end
  return true
end

-- Whether the live bindings are what the current set holds: false until SaveBindings runs.
function world.bindingsSaved()
  return sameBindings(world.bindings, world.bindingSets[world.bindingSet])
end

-- Saves the live bindings as set 1 (Account) or 2 (Character). Which set is current does not
-- change here; LoadBindings switches it (unverified).
function SaveBindings(which)
  checkSet("SaveBindings", which, { [1] = true, [2] = true })
  world.bindingSets[which] = copyBindings(world.bindings)
end

-- Loads set 0 (Default, which leaves the current set as it was), 1 or 2 into the live bindings and
-- makes a saved set the current one; 3 is the current set. A Character set nobody saved starts as the
-- Account set (the copy Blizzard's own switch relies on). UPDATE_BINDINGS fires. That a load switches the
-- current set, and the Character copy, are inferred from Blizzard's Save, Load, Save sequence: unverified.
function LoadBindings(which)
  checkSet("LoadBindings", which, { [0] = true, [1] = true, [2] = true, [3] = true })
  if which == 3 then which = world.bindingSet end
  if which == 2 and not world.bindingSets[2] then world.bindingSets[2] = copyBindings(world.bindingSets[1]) end
  if which ~= 0 then world.bindingSet = which end
  world.bindings = copyBindings(world.bindingSets[which])
  stub.fire("UPDATE_BINDINGS")
end

-- Bindings ----------------------------------------------------------------------------------

-- The keys the client takes as a binding's last part (unverified: the list is the keys Vanguard's
-- keybind mode and the report's tables use).
local NAMED_KEYS = {}
for _, name in ipairs({ "SPACE", "TAB", "ENTER", "ESCAPE", "BACKSPACE", "DELETE", "INSERT", "HOME", "END", "PAGEUP", "PAGEDOWN",
  "UP", "DOWN", "LEFT", "RIGHT", "CAPSLOCK", "NUMLOCK", "SCROLLLOCK", "PRINTSCREEN", "PAUSE", "MOUSEWHEELUP", "MOUSEWHEELDOWN",
  "NUMPADPLUS", "NUMPADMINUS", "NUMPADMULTIPLY", "NUMPADDIVIDE", "NUMPADDECIMAL",
  "LSHIFT", "RSHIFT", "LCTRL", "RCTRL", "LALT", "RALT" }) do NAMED_KEYS[name] = true end

-- The numbered keys: a pattern, then the lowest and highest number.
local NUMBERED_KEYS = { { "^F(%d+)$", 1, 24 }, { "^BUTTON(%d+)$", 1, 31 }, { "^NUMPAD(%d)$", 0, 9 } }

-- Whether a key's last part is one the client binds: a capital letter or a digit, punctuation, a named key,
-- F1 to F24, BUTTON1 to 31 or NUMPAD0 to 9.
local function validBase(base)
  if base:match("^[A-Z0-9]$") or base:match("^[`%-=%[%]\\;',%./]$") or NAMED_KEYS[base] then return true end
  for _, row in ipairs(NUMBERED_KEYS) do
    local digits = base:match(row[1])
    local n = digits and (digits == "0" or digits:sub(1, 1) ~= "0") and tonumber(digits)
    if n and n >= row[2] and n <= row[3] then return true end
  end
  return false
end

-- Whether SetBinding takes a key: modifiers ALT-, CTRL-, SHIFT- (each once) then a base key that validBase accepts.
local function validKey(key)
  if type(key) ~= "string" then return false end
  local seen, rest = {}, key
  while true do
    local mod, after = rest:match("^(%u+)%-(.+)$")
    if not (mod == "ALT" or mod == "CTRL" or mod == "SHIFT") then break end
    if seen[mod] then return false end
    seen[mod], rest = true, after
  end
  return validBase(rest)
end

-- Takes a key off every command (a key is bound to one command at a time).
local function unbindKey(key)
  for _, keys in pairs(world.bindings) do
    for i = #keys, 1, -1 do if keys[i] == key then table.remove(keys, i) end end
  end
end

-- Binds a key to a command ("" or nil frees it), in the live bindings; returns whether the client took the
-- key. Not saved until SaveBindings. The third argument is Blizzard's binding context
-- (C_KeyBindings.GetBindingContextForAction), not modelled. A command takes any number of keys here; whether the
-- client caps it at two, or which key a third one displaces, is unverified. Key order within a chord is not checked.
function SetBinding(key, command)
  if not validKey(key) then return false end
  unbindKey(key)
  if command and command ~= "" then
    world.bindings[command] = world.bindings[command] or {}
    table.insert(world.bindings[command], key)
  end
  stub.fire("UPDATE_BINDINGS")
  return true
end

-- SetBinding as the harness defines it, which the combat rules haven't wrapped: the helpers below count as one call, not two.
local setBinding = SetBinding

-- Binds a key to a spell, macro or item by name, or to a click on a frame ("CLICK name:button"): commands
-- GetBinding(i) doesn't list.
local function bindTo(prefix)
  return function(key, name, button)
    if not name then return setBinding(key, nil) end
    return setBinding(key, prefix .. " " .. name .. (button and (":" .. button) or ""))
  end
end
SetBindingSpell, SetBindingMacro, SetBindingItem = bindTo("SPELL"), bindTo("MACRO"), bindTo("ITEM")
local bindClick = bindTo("CLICK")
-- A click binding names the button; the left one when none is given (unverified).
function SetBindingClick(key, name, button) return bindClick(key, name, name and (button or "LeftButton")) end

-- Every bound key and its command, "" for none: the pre-image a restore must put back, CLICK and SPELL keys
-- included (GetBinding(i) lists neither).
function world.keyPreimage()
  local out = {}
  for command, keys in pairs(world.bindings) do
    for _, key in ipairs(keys) do out[key] = command end
  end
  return out
end

-- How many commands the game lists.
function GetNumBindings() return #world.bindingCommands end

-- The i-th listed command: its name, its category and its first two keys (a third key is not shown: unverified).
function GetBinding(i)
  local row = world.bindingCommands[i]
  if not row then return nil end
  local keys = world.bindings[row.command] or {}
  return row.command, row.category, keys[1], keys[2]
end

-- Modifier keys: MODIFIER_STATE_CHANGED(key, down) fires for each one a test changes ---------

-- The key name each held modifier fires, the left one.
local MODIFIER_KEYS = { shift = "LSHIFT", ctrl = "LCTRL", alt = "LALT", meta = "LMETA" }

-- The modifiers in the order their events fire.
local MODIFIER_ORDER = { "shift", "ctrl", "alt", "meta" }

-- Holds or releases one modifier and fires MODIFIER_STATE_CHANGED(key, 1 or 0) when it changed.
local function setModifier(name, value)
  local changed = (world.keys[name] == true) ~= (value == true)
  world.keys[name] = value
  if changed then stub.fire("MODIFIER_STATE_CHANGED", MODIFIER_KEYS[name], value and 1 or 0) end
end

-- Holds or releases modifier keys ({ shift = true }), in a fixed order; other keys of the table are stored as given.
function world.setKeys(held)
  for _, name in ipairs(MODIFIER_ORDER) do
    if held[name] ~= nil then setModifier(name, held[name]) end
  end
  for name, value in pairs(held) do
    if not MODIFIER_KEYS[name] then world.keys[name] = value end
  end
end

-- The cursor and the action slots -----------------------------------------------------------
-- world.cursor is { type, id, subType } (a spell: "spell", id). A slot's action is world.actions[slot];
-- an action picked up from a slot rides along as cursor.record.

-- The slots the client has: 1 to 180 (ActionBarFrameDocumentation.lua, IsEquippedAction). Raising for a bad slot in
-- PlaceAction and PickupAction is unverified (PutActionInSlot's entry has no RequiresValidActionSlot), and a
-- stance's bonus bar, which remaps ACTIONBUTTON1 to a higher slot, is not modelled: a test on slots 1 to 12 does not
-- cover the page driver.
local function checkSlot(slot)
  if type(slot) ~= "number" or slot < 1 or slot > 180 then error("Invalid action slot", 3) end
end

-- What a slot holds as the cursor holds it, and the slot is left empty.
local function liftFrom(slot)
  local a = world.actions[slot]
  if not a then return nil end
  world.actions[slot] = nil
  return { type = a.type, id = a.id, subType = a.subType, record = a }
end

-- Actions lifted off a slot and then dropped by ClearCursor: nothing brings them back, as in game.
world.discarded = {}

local clearCursor = ClearCursor
-- Empties the cursor; an action that came off a bar is lost, and recorded in world.discarded.
function ClearCursor()
  local held = world.cursor
  if held and held.record then table.insert(world.discarded, held.record) end
  clearCursor()
end

-- Puts what the cursor holds into a slot: a picked-up action as it was, anything else as a new action.
local function dropInto(slot, held)
  if held.record then world.actions[slot] = held.record stub.fire("ACTIONBAR_SLOT_CHANGED", slot) return end
  world.setAction(slot, { type = held.type, id = held.id, subType = held.subType })
end

-- Swaps the cursor with a slot: the cursor's action goes in, what was there comes up (nothing when it was empty).
-- An empty cursor leaves the slot alone.
local function swapWith(slot)
  local held = world.cursor
  if not held then return end
  local old = liftFrom(slot)
  dropInto(slot, held)
  world.cursor = old
end

-- Picks up a slot's action; the cursor's action, if any, goes into the slot (the same swap).
function PickupAction(slot)
  checkSlot(slot)
  if world.cursor then return swapWith(slot) end
  world.cursor = liftFrom(slot)
  if world.cursor then stub.fire("ACTIONBAR_SLOT_CHANGED", slot) end
end

-- Puts the cursor's action into a slot, and what was in the slot comes up on the cursor. world.placed is the last slot asked.
function PlaceAction(slot)
  checkSlot(slot)
  world.placed = slot
  swapWith(slot)
end
C_ActionBar.PutActionInSlot = PlaceAction

-- The starter bar of each class, class -> { [slot] = fields for world.setAction }. Empty until the in-game check on
-- WoW Forever says what a new character starts with.
world.starterBars = {}

-- Fills the slots with a class's starter bar (the player's class unless one is named).
function world.useStarterBar(class)
  local bar = world.starterBars[class or world.units.player.class] or {}
  for slot, fields in pairs(bar) do world.setAction(slot, fields) end
end

-- Spells, levels and stances ----------------------------------------------------------------

-- Puts a spell into a slot as the game's auto-push does, and fires SPELL_PUSHED_TO_ACTIONBAR(spellID, slot)
-- (the payload is unverified on Forever).
function world.pushSpellToActionBar(spellID, slot)
  world.setAction(slot, { id = spellID })
  stub.fire("SPELL_PUSHED_TO_ACTIONBAR", spellID, slot)
end

-- The player reaches a level: UNIT_LEVEL fires with the change, then PLAYER_LEVEL_UP(level).
function world.levelUp(level)
  world.setUnit("player", { level = level })
  stub.fire("PLAYER_LEVEL_UP", level)
end

-- The stance strip as { icon, spellID, active, castable } per form, in strip order; empty for a class with none.
world.stances = {}

-- Sets the strip and fires UPDATE_SHAPESHIFT_FORMS.
function world.setStances(forms)
  world.stances = forms
  stub.fire("UPDATE_SHAPESHIFT_FORMS")
end

-- How many forms the strip holds.
function GetNumShapeshiftForms() return #world.stances end

-- A form's icon, whether it is active, whether it can be cast and its spell.
function GetShapeshiftFormInfo(i)
  local form = world.stances[i]
  if not form then return nil end
  return form.icon, form.active == true, form.castable ~= false, form.spellID
end

-- The active form's place in the strip, 0 for none.
function GetShapeshiftForm()
  for i, form in ipairs(world.stances) do
    if form.active then return i end
  end
  return 0
end

-- Click bindings ----------------------------------------------------------------------------
-- C_ClickBindings as the forever ClickBindingsDocumentation has it. The profile is a list of
-- { type, actionID, button, modifiers }; the game's default is plain Left = Target (Interaction 1) and
-- plain Right = Open menu (Interaction 2). SetProfileByInfo, ResetCurrentProfile and ExecuteBinding carry
-- HasRestrictions, which wow-taint.lua blocks for addon code in combat.

Enum.ClickBindingType = { None = 0, Spell = 1, Macro = 2, Interaction = 3, PetAction = 4 }

-- The game's default profile.
local function defaultClickProfile()
  return { { type = 3, actionID = 1, button = "LeftButton", modifiers = 0 }, { type = 3, actionID = 2, button = "RightButton", modifiers = 0 } }
end

-- A copy of a click profile.
local function copyProfile(profile)
  local out = {}
  for i, info in ipairs(profile) do
    out[i] = {}
    for k, v in pairs(info) do out[i][k] = v end
  end
  return out
end

world.clickProfile = defaultClickProfile()
world.clickExecuted = {}

C_ClickBindings = {
  -- A copy of the profile: changing it changes nothing until SetProfileByInfo.
  GetProfileInfo = function() return copyProfile(world.clickProfile) end,
  -- Replaces the profile.
  SetProfileByInfo = function(infoVec) world.clickProfile = copyProfile(infoVec) end,
  -- Back to the game's default profile.
  ResetCurrentProfile = function() world.clickProfile = defaultClickProfile() end,
  -- Whether a known spell can take a click.
  CanSpellBeClickBound = function(spellID) return world.spells[spellID] ~= nil end,
  -- What a button with these modifiers does now (None when nothing is bound).
  GetBindingType = function(button, modifiers)
    for _, info in ipairs(world.clickProfile) do
      if info.button == button and info.modifiers == modifiers then return info.type end
    end
    return Enum.ClickBindingType.None
  end,
  -- Records the click the game was asked to run: { target, button, modifiers }.
  ExecuteBinding = function(target, button, modifiers) table.insert(world.clickExecuted, { target = target, button = button, modifiers = modifiers }) end,
  GetTutorialShown = function() return world.clickTutorialShown == true end,
  SetTutorialShown = function() world.clickTutorialShown = true end,
}

-- Reset -------------------------------------------------------------------------------------

local resetWorld = world.reset
-- The world's reset also puts the bindings, the stance strip and the click profile back.
function world.reset()
  resetWorld()
  world.bindings = copyBindings(world.bindingSets[0])
  world.bindingSets, world.bindingSet = { [0] = copyBindings(world.bindings), [1] = copyBindings(world.bindings) }, 1
  world.stances, world.clickProfile, world.clickExecuted, world.placed, world.discarded = {}, defaultClickProfile(), {}, nil, {}
  stub.callsUntilCombat = nil
end
