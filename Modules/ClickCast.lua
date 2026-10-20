-- Click casting and hover keys on the raid frames (and, if
-- you like, the unit frames).
--
--   Mouse: a button plus Shift/Ctrl/Alt on a frame casts on that player
--          (e.g. Ctrl + Right click = Renew). Stored as "ctrl-BUTTON2".
--   Keys:  while the pointer is over a frame, a key (1, Shift-Q, the mouse
--          wheel...) casts on that player; off the frames the key does its
--          usual job. Stored as a binding string ("SHIFT-Q", "MOUSEWHEELUP").
--
-- A binding is { key, action, value, spellID, rank }: a spell is cast by name
-- (its highest rank) unless a rank was picked, then by that rank's spell id.
-- Hover keys click the frame's virtual button vg<i> (SetBindingClick), so the
-- frame needs no extra click registration: SecureUnitButton_OnClick (the unit
-- button template) acts on whichever phase the button is registered for and
-- ignores ActionButtonUseKeyDown, so registering AnyDown as well would cast
-- twice (key down and key up); the raid buttons stay AnyUp.
--
-- Bindings are per character and per specialization. Everything here sets
-- secure attributes and secure enter/leave snippets, so it only changes out
-- of combat; in combat, the bindings you set earlier keep working. Hover keys
-- need secure snippets: when the client can't compile them (Core/Client.lua
-- probes it), they are off and the mouse bindings still work.
--
-- "Use the game's click bindings" (off by default) turns all of this off on
-- clients with the game's own system (C_ClickBindings): the frames are
-- SecureUnitButtonTemplate buttons, whose SecureUnitButton_OnClick runs the
-- game's binding for a click, so with Vanguard's attributes and snippets
-- cleared the game's bindings (set in its Click Casting window) work on the
-- raid and unit frames. Vanguard's bindings are kept for switching back.

local ADDON, ns = ...

local CC = ns.Module("ClickCast", {
  defaults = { unitFrames = false, useGame = false },
})

local MOUSE_NAMES = { "Left click", "Right click", "Middle click", "Button 4", "Button 5" }
local ACTIONS = { spell = true, macro = true, target = true, menu = true, focus = true, assist = true }
local ACTION_NAMES = { target = "Target", menu = "Unit menu", focus = "Focus", assist = "Assist" }
local MODIFIER_ORDER = { "alt", "ctrl", "shift" }

CC.frames = {}
CC.ACTION_NAMES = ACTION_NAMES

-- Bindings --------------------------------------------------------------------------------

-- A spell's id from its name, where the client can say (C_Spell, then the old global).
local function spellID(name)
  if C_Spell and type(C_Spell.GetSpellInfo) == "function" then
    local info = C_Spell.GetSpellInfo(name)
    return type(info) == "table" and info.spellID or nil
  end
  if type(GetSpellInfo) == "function" then return select(7, GetSpellInfo(name)) end
end

-- Gives a spell binding that has no spell id (an older one, or a typed name) the id the
-- client knows for its name, so the grid can show its icon and tooltip.
local function upgrade(b)
  if b.action == "spell" and b.spellID == nil then b.spellID = spellID(b.value) end
end

-- This character's bindings for a spec (the current one by default), created empty.
function CC.Bindings(spec)
  spec = spec or ns.SpecIndex() or 0
  VanguardCharDB.clickcast = type(VanguardCharDB.clickcast) == "table" and VanguardCharDB.clickcast or {}
  VanguardCharDB.clickcast[spec] = VanguardCharDB.clickcast[spec] or {}
  for _, b in ipairs(VanguardCharDB.clickcast[spec]) do upgrade(b) end
  return VanguardCharDB.clickcast[spec]
end

-- The current spec's binding for a key, or nil.
function CC.Binding(key)
  for _, b in ipairs(CC.Bindings()) do
    if b.key == key then return b end
  end
end

-- For a mouse binding ("ctrl-BUTTON2"): its modifier prefix ("ctrl-") and button number. nil for keys.
function CC.MouseParts(key)
  local prefix, n = (key or ""):match("^([%l%-]*)BUTTON([1-5])$")
  if not prefix then return nil end
  return prefix, tonumber(n)
end

-- Why a binding can't be added, or nil if it can.
local function problem(key, action, value)
  if type(key) ~= "string" or key == "" then return "press a key or click first" end
  if not ACTIONS[action] then return "unknown action" end
  if (action == "spell" or action == "macro") and (type(value) ~= "string" or value:match("^%s*$")) then
    return action == "spell" and "pick a spell" or "type the macro text"
  end
  return nil
end

-- Drops the binding for a key from a spec's list (nothing is applied).
local function drop(list, key)
  for i = #list, 1, -1 do
    if list[i].key == key then table.remove(list, i) end
  end
end

-- Puts a checked binding in a spec's list, replacing the key's old one (nothing is applied).
local function put(list, key, action, value, id, rank)
  drop(list, key)
  list[#list + 1] = { key = key, action = action, value = value, spellID = id, rank = rank }
end

-- Adds (or replaces) the binding for a key in the current spec, then applies once.
-- A spell binding may carry its spell id and, for a specific rank, the rank number.
function CC.Add(key, action, value, id, rank)
  local err = problem(key, action, value)
  if err then return false, err end
  put(CC.Bindings(), key, action, value, id, rank)
  ns.OutOfCombat(CC.ApplyAll, "clickcast")
  return true
end

-- Removes the binding for a key in the current spec, then applies.
function CC.Remove(key)
  drop(CC.Bindings(), key)
  ns.OutOfCombat(CC.ApplyAll, "clickcast")
end

-- Removes every binding in the current spec.
function CC.Clear()
  local list = CC.Bindings()
  for i = #list, 1, -1 do list[i] = nil end
  ns.OutOfCombat(CC.ApplyAll, "clickcast")
end

-- Layouts, copies and strings ---------------------------------------------------------------------

-- Binds a layout ({ key = { action, value } }, from Modules/ClickCastSpells.lua) over the current
-- bindings: its keys are replaced, other keys are kept. A spell binds by name, so one the
-- character hasn't learned yet starts working when it is.
function CC.ApplyLayout(layout)
  local list = CC.Bindings()
  for key, b in pairs(layout) do
    if not problem(key, b.action, b.value) then put(list, key, b.action, b.value, b.action == "spell" and spellID(b.value) or nil) end
  end
  ns.OutOfCombat(CC.ApplyAll, "clickcast")
end

-- Copies the current spec's bindings over another spec's.
function CC.CopyToSpec(spec)
  local from, to = CC.Bindings(), CC.Bindings(spec)
  for i = #to, 1, -1 do to[i] = nil end
  for i, b in ipairs(from) do
    to[i] = { key = b.key, action = b.action, value = b.value, spellID = b.spellID, rank = b.rank }
  end
end

-- The current spec's bindings as a string to share.
function CC.Export()
  local list = {}
  for i, b in ipairs(CC.Bindings()) do
    list[i] = { key = b.key, action = b.action, value = b.value, spellID = b.spellID, rank = b.rank }
  end
  return ns.Serialize.Encode("clickcast", { bindings = list })
end

-- The most bindings a string may carry, and the longest text (a macro's, or a spell's name) in one: the game's macro limit.
CC.MAX_IMPORT, CC.MAX_TEXT = 200, 255

-- Whether a decoded binding has the shape CC.Add accepts.
local function wellFormed(b)
  return type(b) == "table" and type(b.key) == "string" and ACTIONS[b.action] and (b.value == nil or type(b.value) == "string")
    and not problem(b.key, b.action, b.value)
end

-- A decoded spell id or rank as a whole number the client could hold, else nil (so inf, NaN and text are dropped).
local function wholeNumber(v)
  local n = tonumber(v)
  return n and n == math.floor(n) and n >= 0 and n < 1e7 and n or nil
end

-- The usable bindings of a decoded string, in order, or nil and why the string can't be imported.
-- Nothing is changed here: a string that is too big, holds an over-long text or no usable binding is
-- refused as a whole, and an entry of the wrong shape is skipped.
local function importable(list)
  local out = {}
  for i, b in ipairs(list) do
    if i > CC.MAX_IMPORT then return nil, "more than " .. CC.MAX_IMPORT .. " bindings" end
    if type(b) == "table" and type(b.value) == "string" and #b.value > CC.MAX_TEXT then return nil, "a text is longer than " .. CC.MAX_TEXT .. " characters" end
    if wellFormed(b) then out[#out + 1] = b end
  end
  if #out == 0 then return nil, "no usable bindings in it" end
  return out
end

-- Swaps the current spec's bindings for a checked list (the last of two for one key wins) and applies once.
local function replaceAll(list)
  local mine = CC.Bindings()
  for i = #mine, 1, -1 do mine[i] = nil end
  for _, b in ipairs(list) do put(mine, b.key, b.action, b.value, wholeNumber(b.spellID), wholeNumber(b.rank)) end
  ns.OutOfCombat(CC.ApplyAll, "clickcast")
end

-- Replaces the current spec's bindings with the ones in a string: the whole string is checked first,
-- then the old bindings are swapped for the new ones and applied once. A string that can't be imported
-- changes nothing. Returns the number of bindings now, else nil and a reason.
function CC.Import(text)
  local scope, data = ns.Serialize.Decode(text)
  if not scope then return nil, data end
  if scope ~= "clickcast" or type(data.bindings) ~= "table" then return nil, "not a click-casting string" end
  local list, why = importable(data.bindings)
  if not list then return nil, why end
  replaceAll(list)
  return #CC.Bindings()
end

-- Descriptions -----------------------------------------------------------------------------

-- "Ctrl + Shift + " from a mouse prefix ("ctrl-shift-") or binding modifiers ("CTRL-SHIFT-").
local function modifierText(mods)
  local out = {}
  for _, m in ipairs(MODIFIER_ORDER) do
    if mods:lower():find(m .. "-", 1, true) then out[#out + 1] = m:sub(1, 1):upper() .. m:sub(2) end
  end
  return #out > 0 and (table.concat(out, " + ") .. " + ") or ""
end

-- A binding key split into its modifiers ("CTRL-SHIFT-", in binding order) and the
-- key itself, which may be the minus key ("SHIFT--" is Shift and "-").
local function splitKey(key)
  local mods, base = "", key
  for _, m in ipairs({ "ALT-", "CTRL-", "SHIFT-", "META-" }) do
    if #base > #m and base:sub(1, #m) == m then mods, base = mods .. m, base:sub(#m + 1) end
  end
  return mods, base
end

-- A binding key for people: "Ctrl + Right click", "Shift + Q (hover)".
function CC.KeyText(key)
  local prefix, n = CC.MouseParts(key)
  if prefix then return modifierText(prefix) .. MOUSE_NAMES[n] end
  local mods, base = splitKey(key)
  local names = { MOUSEWHEELUP = "Wheel up", MOUSEWHEELDOWN = "Wheel down" }
  return modifierText(mods) .. (names[base] or base) .. " (hover)"
end

-- What a binding does: the spell name (with its rank when one was picked), "Macro: ...", "Target", "Unit menu"...
function CC.ActionText(b)
  if b.action == "spell" then return b.value .. (b.rank and (" (Rank " .. b.rank .. ")") or "") end
  if b.action == "macro" then return "Macro: " .. b.value end
  return ACTION_NAMES[b.action] or "Unit menu"
end

-- What a hover key does off the frames ("Action bar 1 slot 2"), or nil when it's free or the client can't say.
function CC.Collision(key)
  if CC.MouseParts(key) or type(GetBindingAction) ~= "function" then return nil end
  local action = GetBindingAction(key)
  if type(action) ~= "string" or action == "" then return nil end
  local bar, slot = action:match("^MULTIACTIONBAR(%d)BUTTON(%d+)$")
  if bar then return "Action bar " .. (bar + 1) .. " slot " .. slot end
  slot = action:match("^ACTIONBUTTON(%d+)$")
  return slot and ("Action bar 1 slot " .. slot) or action:lower():gsub("_", " ")
end

-- The actions the units' click handler (SecureUnitButton_OnClick) runs only on a click the game's own click
-- bindings cover, and why such a binding does nothing, by where it is (player words, read after "does nothing: ").
local GAME_GATED = { target = true, menu = true }
local WONT_RUN = {
  key = "the game won't run it from a key",
  click = "the game runs it only on a click its own Click Casting window binds",
}
-- A mouse button's number from the game's name for it (its profile may use either name).
local GAME_BUTTONS = { LeftButton = 1, RightButton = 2, MiddleButton = 3, Button1 = 1, Button2 = 2, Button3 = 3, Button4 = 4, Button5 = 5 }

-- The game's click-binding profile (C_ClickBindings), or nil on a client that has none or can't list it.
local function gameProfile()
  local api = C_ClickBindings
  if type(api) ~= "table" or type(api.GetProfileInfo) ~= "function" or type(Enum.ClickBindingType) ~= "table" then return nil end
  local list = api.GetProfileInfo()
  return type(list) == "table" and list or nil
end

-- Whether the game binds a click (a mouse prefix and button number) to one of its interactions (Target, Open menu).
-- Its modifier bits aren't documented, so a modified click counts as bound when the game binds any modified click
-- on that button: a warning is only given when it is sure.
local function gameCovers(profile, prefix, n)
  local interaction, modified = Enum.ClickBindingType.Interaction, prefix ~= ""
  for _, info in ipairs(profile) do
    if info.type == interaction and GAME_BUTTONS[info.button] == n and (info.modifiers ~= 0) == modified then return true end
  end
  return false
end

-- Why a binding does nothing on this client, or nil when it works (or the client can't say). Where the game has
-- click bindings of its own, the units' click handler drops Target and Unit menu on a click those don't cover,
-- and a hover key's virtual button is never covered. While the game's bindings are in use, Vanguard's rest.
function CC.WontRun(b)
  local profile = GAME_GATED[b.action] and not CC.UsesGame() and gameProfile()
  if not profile then return nil end
  local prefix, n = CC.MouseParts(b.key)
  if not prefix then return WONT_RUN.key end
  if gameCovers(profile, prefix, n) then return nil end
  return WONT_RUN.click
end

-- Applying ---------------------------------------------------------------------------------

-- Sets an attribute and remembers it, so the next apply can clear it.
local function setAttr(f, name, value)
  f:SetAttribute(name, value)
  f.vgAttrs[#f.vgAttrs + 1] = name
end

-- Clears the attributes the last apply set.
local function clearAttrs(f)
  for _, name in ipairs(f.vgAttrs or {}) do f:SetAttribute(name, nil) end
  f.vgAttrs = {}
end

-- The secure "type" for an action.
local TYPES = { spell = "spell", macro = "macro", target = "target", menu = "togglemenu", focus = "focus", assist = "assist" }

-- What the secure spell attribute gets: the rank's id when a rank was picked, else the name (highest rank).
local function spellValue(b)
  return b.rank and b.spellID or b.value
end

-- Sets type and spell/macro text for a binding, with the attribute prefix
-- ("ctrl-" for a mouse binding, "*" for a hover key: SecureButton_GetModifiedAttribute
-- looks up <modifiers>type-vg3, then *type-vg3, never the bare type-vg3, so a
-- hover key bound with Shift held only finds the "*" form) and the suffix
-- ("2" for mouse button 2, "-vg3" for a hover key's virtual button).
local function setAction(f, prefix, suffix, b)
  setAttr(f, prefix .. "type" .. suffix, TYPES[b.action])
  if b.action == "spell" then setAttr(f, prefix .. "spell" .. suffix, spellValue(b)) end
  if b.action == "macro" then setAttr(f, prefix .. "macrotext" .. suffix, b.value) end
end

-- The secure snippet run on entering a frame: bind each hover key to a
-- click on the frame's virtual button vg<i>. Built from the bindings; no
-- player input ends up in it except keys, which are quoted.
function CC.EnterSnippet(bindings)
  local lines = { "self:ClearBindings()" }
  for i, b in ipairs(bindings) do
    if not CC.MouseParts(b.key) then
      lines[#lines + 1] = string.format("self:SetBindingClick(true, %q, self, %q)", b.key, "vg" .. i)
    end
  end
  return table.concat(lines, "\n")
end

-- Takes the hover-key snippets off a frame, and any keys they bound while the pointer was over it.
local function unwrap(f)
  if not f.vgWrapped then return end
  for _, script in ipairs({ "OnEnter", "OnLeave", "OnHide" }) do SecureHandlerUnwrapScript(f, script) end
  ClearOverrideBindings(f)
  f.vgWrapped = false
end

-- (Re)wraps the frame's enter, leave and hide scripts with the hover-key snippets.
local function wrap(f, enter)
  unwrap(f)
  SecureHandlerWrapScript(f, "OnEnter", CC.handler, enter)
  SecureHandlerWrapScript(f, "OnLeave", CC.handler, "self:ClearBindings()")
  SecureHandlerWrapScript(f, "OnHide", CC.handler, "self:ClearBindings()")
  f.vgWrapped = true
end

-- Whether this client compiles secure snippets (probed on first use, Core/Client.lua); without the probe, assume yes.
function CC.SnippetsOn()
  local probe = ns.Client and ns.Client.ProbeSnippets
  return probe == nil or probe() ~= false
end

-- Whether the game's own click bindings are used instead of Vanguard's: switched
-- on, on a client that has them (C_ClickBindings, which SecureUnitButton_OnClick reads).
function CC.UsesGame()
  return CC.settings ~= nil and CC.settings.useGame == true and type(C_ClickBindings) == "table"
end

-- Applies the current spec's bindings to one frame, or (using the game's click bindings) clears Vanguard's.
function CC.ApplyFrame(f)
  clearAttrs(f)
  if CC.UsesGame() then return unwrap(f) end
  local bindings = CC.Bindings()
  for i, b in ipairs(bindings) do
    local prefix, n = CC.MouseParts(b.key)
    if prefix then setAction(f, prefix, n, b) else setAction(f, "*", "-vg" .. i, b) end
  end
  if CC.SnippetsOn() then wrap(f, CC.EnterSnippet(bindings)) end
end

-- Applies the bindings to every registered frame (out of combat only).
function CC.ApplyAll()
  for _, f in ipairs(CC.frames) do CC.ApplyFrame(f) end
  if CC.OnApplied then CC.OnApplied() end
end

-- Adds a frame to click casting and applies the bindings to it.
function CC.Register(f)
  CC.frames[#CC.frames + 1] = f
  ns.OutOfCombat(function() CC.ApplyFrame(f) end)
end

-- Setup ------------------------------------------------------------------------------------

-- The raid buttons (existing and future) and, if turned on, the unit frames.
local function registerFrames(settings)
  local raid = ns.GetModule("RaidFrames")
  for _, b in ipairs(raid.buttons) do CC.Register(b) end
  raid.OnButtonCreated = CC.Register
  if not settings.unitFrames then return end
  for _, f in pairs(ns.GetModule("UnitFrames").frames) do CC.Register(f) end
end

-- Switches between the game's click bindings and Vanguard's (applied out of combat).
function CC.SetUseGame(on)
  CC.settings.useGame = on
  ns.OutOfCombat(CC.ApplyAll, "clickcast")
end

-- Module entry point (Core/Modules.lua): a secure handler, the frames, spec changes.
function CC.Enable(settings)
  CC.settings = settings
  CC.handler = CreateFrame("Frame", "Vanguard_ClickCastHandler", UIParent, "SecureHandlerBaseTemplate")
  ns.OutOfCombat(function() registerFrames(settings) end)
  -- A new spec has its own bindings: apply them (spec changes happen out of combat).
  local function reapply() ns.OutOfCombat(CC.ApplyAll, "clickcast") end
  ns.On("PLAYER_SPECIALIZATION_CHANGED", reapply)
  ns.On("ACTIVE_TALENT_GROUP_CHANGED", reapply)
end
