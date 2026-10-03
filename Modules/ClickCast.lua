-- Click casting and hover keys, VuhDo style, on the raid frames (and, if
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
-- Bindings are per character and per specialization. Everything here sets
-- secure attributes and secure enter/leave snippets, so it only changes out
-- of combat; in combat, the bindings you set earlier keep working. Hover keys
-- need secure snippets: when the client can't compile them (Core/Client.lua
-- probes it), they are off and the mouse bindings still work.

local ADDON, ns = ...

local CC = ns.Module("ClickCast", {
  defaults = { unitFrames = false },
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
  ForeverUICharDB.clickcast = type(ForeverUICharDB.clickcast) == "table" and ForeverUICharDB.clickcast or {}
  ForeverUICharDB.clickcast[spec] = ForeverUICharDB.clickcast[spec] or {}
  for _, b in ipairs(ForeverUICharDB.clickcast[spec]) do upgrade(b) end
  return ForeverUICharDB.clickcast[spec]
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

-- Adds (or replaces) the binding for a key in the current spec, then applies.
-- A spell binding may carry its spell id and, for a specific rank, the rank number.
function CC.Add(key, action, value, id, rank)
  local err = problem(key, action, value)
  if err then return false, err end
  CC.Remove(key)
  local list = CC.Bindings()
  list[#list + 1] = { key = key, action = action, value = value, spellID = id, rank = rank }
  ns.OutOfCombat(CC.ApplyAll, "clickcast")
  return true
end

-- Removes the binding for a key in the current spec, then applies.
function CC.Remove(key)
  local list = CC.Bindings()
  for i = #list, 1, -1 do
    if list[i].key == key then table.remove(list, i) end
  end
  ns.OutOfCombat(CC.ApplyAll, "clickcast")
end

-- Moves a binding to another key (swapping with whatever is there).
function CC.Move(from, to)
  local a, b = CC.Binding(from), CC.Binding(to)
  if not a or from == to then return end
  a.key = to
  if b then b.key = from end
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
  for key, b in pairs(layout) do
    CC.Add(key, b.action, b.value, b.action == "spell" and spellID(b.value) or nil)
  end
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

-- Whether a decoded binding has the shape CC.Add accepts.
local function wellFormed(b)
  return type(b) == "table" and type(b.key) == "string" and ACTIONS[b.action] and (b.value == nil or type(b.value) == "string")
end

-- Replaces the current spec's bindings with the ones in a string; nil and a reason when it can't.
function CC.Import(text)
  local scope, data = ns.Serialize.Decode(text)
  if not scope then return nil, data end
  if scope ~= "clickcast" or type(data.bindings) ~= "table" then return nil, "not a click-casting string" end
  CC.Clear()
  for _, b in ipairs(data.bindings) do
    if wellFormed(b) then CC.Add(b.key, b.action, b.value, tonumber(b.spellID), tonumber(b.rank)) end
  end
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

-- A binding key for people: "Ctrl + Right click", "Shift + Q (hover)".
function CC.KeyText(key)
  local prefix, n = CC.MouseParts(key)
  if prefix then return modifierText(prefix) .. MOUSE_NAMES[n] end
  local mods, base = key:match("^(.-%-?)([^%-]+)$")
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

-- Applying ---------------------------------------------------------------------------------

-- Sets an attribute and remembers it, so the next apply can clear it.
local function setAttr(f, name, value)
  f:SetAttribute(name, value)
  f.fuiAttrs[#f.fuiAttrs + 1] = name
end

-- Clears the attributes the last apply set.
local function clearAttrs(f)
  for _, name in ipairs(f.fuiAttrs or {}) do f:SetAttribute(name, nil) end
  f.fuiAttrs = {}
end

-- The secure "type" for an action.
local TYPES = { spell = "spell", macro = "macro", target = "target", menu = "togglemenu", focus = "focus", assist = "assist" }

-- What the secure spell attribute gets: the rank's id when a rank was picked, else the name (highest rank).
local function spellValue(b)
  return b.rank and b.spellID or b.value
end

-- Sets type and spell/macro text for a binding, with the attribute suffix
-- ("2" for mouse button 2, "-fui3" for a hover key's virtual button).
local function setAction(f, prefix, suffix, b)
  setAttr(f, prefix .. "type" .. suffix, TYPES[b.action])
  if b.action == "spell" then setAttr(f, prefix .. "spell" .. suffix, spellValue(b)) end
  if b.action == "macro" then setAttr(f, prefix .. "macrotext" .. suffix, b.value) end
end

-- The secure snippet run on entering a frame: bind each hover key to a
-- click on the frame's virtual button fui<i>. Built from the bindings; no
-- player input ends up in it except keys, which are quoted.
function CC.EnterSnippet(bindings)
  local lines = { "self:ClearBindings()" }
  for i, b in ipairs(bindings) do
    if not CC.MouseParts(b.key) then
      lines[#lines + 1] = string.format("self:SetBindingClick(true, %q, self, %q)", b.key, "fui" .. i)
    end
  end
  return table.concat(lines, "\n")
end

-- (Re)wraps the frame's enter, leave and hide scripts with the hover-key snippets.
local function wrap(f, enter)
  if f.fuiWrapped then
    for _, script in ipairs({ "OnEnter", "OnLeave", "OnHide" }) do SecureHandlerUnwrapScript(f, script) end
  end
  SecureHandlerWrapScript(f, "OnEnter", CC.handler, enter)
  SecureHandlerWrapScript(f, "OnLeave", CC.handler, "self:ClearBindings()")
  SecureHandlerWrapScript(f, "OnHide", CC.handler, "self:ClearBindings()")
  f.fuiWrapped = true
end

-- Whether this client compiles secure snippets (probed on first use, Core/Client.lua); without the probe, assume yes.
function CC.SnippetsOn()
  local probe = ns.Client and ns.Client.ProbeSnippets
  return probe == nil or probe() ~= false
end

-- Applies the current spec's bindings to one frame.
function CC.ApplyFrame(f)
  local bindings = CC.Bindings()
  clearAttrs(f)
  for i, b in ipairs(bindings) do
    local prefix, n = CC.MouseParts(b.key)
    if prefix then setAction(f, prefix, n, b) else setAction(f, "*", "-fui" .. i, b) end
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

-- Module entry point (Core/Modules.lua): a secure handler, the frames, spec changes.
function CC.Enable(settings)
  CC.handler = CreateFrame("Frame", "ForeverUI_ClickCastHandler", UIParent, "SecureHandlerBaseTemplate")
  ns.OutOfCombat(function() registerFrames(settings) end)
  -- A new spec has its own bindings: apply them (spec changes happen out of combat).
  local function reapply() ns.OutOfCombat(CC.ApplyAll, "clickcast") end
  ns.On("PLAYER_SPECIALIZATION_CHANGED", reapply)
  ns.On("ACTIVE_TALENT_GROUP_CHANGED", reapply)
end
