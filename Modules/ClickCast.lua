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
-- Bindings are per character and per specialization (on WoW Forever, whose dual
-- spec is the talent group, per talent group: CC.CurrentKey, which remembers the
-- group for a client that doesn't name it yet at login). Everything here sets
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

local L = ns.L

local CC = ns.Module("ClickCast", {
  defaults = { unitFrames = false, useGame = false },
})

local MOUSE_NAMES = { L["Left click"], L["Right click"], L["Middle click"], L["Button 4"], L["Button 5"] }
local ACTIONS = { spell = true, macro = true, target = true, menu = true, focus = true, assist = true }
local ACTION_NAMES = { target = L["Target"], menu = L["Unit menu"], focus = L["Focus"], assist = L["Assist"] }
local MODIFIER_ORDER = { "alt", "ctrl", "shift" }
local MODIFIER_NAMES = { alt = L["Alt"], ctrl = L["Ctrl"], shift = L["Shift"] }

CC.frames = {}
CC.ACTION_NAMES = ACTION_NAMES
CC.MODIFIER_ORDER = MODIFIER_ORDER

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

-- A copy of a binding record, so a stored binding never shares a table with the one it came from.
local function copyOf(b)
  return { key = b.key, action = b.action, value = b.value, spellID = b.spellID, rank = b.rank }
end

-- This character's one-time stamps (VanguardCharDB.clickcastStamps): what click casting has already migrated or told them.
local function stamps()
  VanguardCharDB.clickcastStamps = type(VanguardCharDB.clickcastStamps) == "table" and VanguardCharDB.clickcastStamps or {}
  return VanguardCharDB.clickcastStamps
end

-- Whether a one-time step (a migration, a notice) has been done for this character.
function CC.Stamped(name)
  return stamps()[name] == true
end

-- Marks a one-time step as done for this character.
function CC.Stamp(name)
  stamps()[name] = true
end

-- This character's saved lists of bindings, by spec key.
local function savedLists()
  VanguardCharDB.clickcast = type(VanguardCharDB.clickcast) == "table" and VanguardCharDB.clickcast or {}
  return VanguardCharDB.clickcast
end

-- WoW Forever's talent groups (Primary, Secondary): its dual spec, and the keys its bindings are stored under.
CC.TALENT_GROUPS = { 1, 2 }

-- The talent groups as a set of keys, to tell the lists that predate them from the groups' own.
local IS_GROUP = {}
for _, group in ipairs(CC.TALENT_GROUPS) do IS_GROUP[group] = true end

-- Whether a saved list holds a binding.
local function hasBindings(list)
  return type(list) == "table" and #list > 0
end

-- Empties a list in place (the saved table stays the same one).
local function clearList(list)
  for i = #list, 1, -1 do list[i] = nil end
end

-- Replaces a list's bindings with copies of another's, in place.
local function overwriteList(to, from)
  clearList(to)
  for i, b in ipairs(from) do to[i] = copyOf(b) end
end

-- A copy of a saved list of bindings.
local function copyList(list)
  local out = {}
  overwriteList(out, list)
  return out
end

-- The keys of the saved lists that predate the talent groups, in the order they are tried: the specialization index
-- (what the older version used), 0, then any other number that isn't a talent group, lowest first.
local function legacyKeys(lists)
  local keys, others = { ns.SpecIndex() or 0, 0 }, {}
  for key in pairs(lists) do
    if type(key) == "number" and key ~= 0 and not IS_GROUP[key] then others[#others + 1] = key end
  end
  table.sort(others)
  for _, key in ipairs(others) do keys[#keys + 1] = key end
  return keys
end

-- The list saved before the lists were kept per group: the first of legacyKeys that holds a binding, or nil.
local function legacyList(lists)
  for _, key in ipairs(legacyKeys(lists)) do
    if hasBindings(lists[key]) then return lists[key] end
  end
end

-- Whether any talent group's list holds a binding (a character that already uses the groups).
local function groupsInUse(lists)
  for _, group in ipairs(CC.TALENT_GROUPS) do
    if hasBindings(lists[group]) then return true end
  end
  return false
end

-- On a client with talent groups, gives each group that has no bindings a copy of the list saved before the lists were
-- kept per group (legacyList), once. The old list is left where it was, so an older Vanguard still finds it (edits made
-- there are not carried forward, and where the older version used key 1 that list is Primary's own). Until the client
-- names a talent group, and while there is neither an old list nor a group in use, nothing is stamped. Run when the
-- module starts and when the client first names a group (CC.Enable, groupNamed), not on every read.
local function migrateTalentGroups()
  if CC.Stamped("talentGroups") or not ns.TalentGroup() then return end
  local lists = savedLists()
  local old = legacyList(lists)
  for _, group in ipairs(CC.TALENT_GROUPS) do
    if old and not hasBindings(lists[group]) then lists[group] = copyList(old) end
  end
  if old or groupsInUse(lists) then CC.Stamp("talentGroups") end
end

-- Whether this character's lists are kept per talent group: the client names one, or the character was moved to them.
function CC.PerGroup()
  return ns.TalentGroup() ~= nil or CC.Stamped("talentGroups")
end

-- The key of the list the page and the commands show and edit now: the talent group on WoW Forever, else the
-- specialization index, else 0 (a client without specializations). Once the lists are kept per group a client that
-- doesn't name the group yet (at login) gets the group remembered by rememberGroup, so reads and edits never go back
-- to the list that predates the groups.
function CC.CurrentKey()
  if not CC.PerGroup() then return ns.SpecIndex() or 0 end
  return ns.TalentGroup() or VanguardCharDB.clickcastGroup or CC.TALENT_GROUPS[1]
end

-- A sentence about a list, the whole of it in the player's language: the talent group's where the lists are kept per
-- group ({talents} in sentences.talents), else the specialization's ({spec} in sentences.spec).
function CC.ListSentence(sentences, key)
  if CC.PerGroup() then return ns.Format(sentences.talents, { talents = ns.TalentsName(key) }) end
  return ns.Format(sentences.spec, { spec = key })
end

-- Remembers the talent group the client names now (VanguardCharDB.clickcastGroup), for CC.CurrentKey.
local function rememberGroup()
  local group = ns.TalentGroup()
  if group then VanguardCharDB.clickcastGroup = group end
end

-- This character's bindings for a spec key (the current one by default), created empty.
function CC.Bindings(spec)
  spec = spec or CC.CurrentKey()
  local lists = savedLists()
  lists[spec] = lists[spec] or {}
  for _, b in ipairs(lists[spec]) do upgrade(b) end
  return lists[spec]
end

-- A saved list's binding for a key, or nil.
local function inList(list, key)
  for _, b in ipairs(list) do
    if b.key == key then return b end
  end
end

-- The current spec's binding for a key, or nil.
function CC.Binding(key)
  return inList(CC.Bindings(), key)
end

-- For a mouse binding ("ctrl-BUTTON2"): its modifier prefix ("ctrl-") and button number. nil for keys.
function CC.MouseParts(key)
  local prefix, n = (key or ""):match("^([%l%-]*)BUTTON([1-5])$")
  if not prefix then return nil end
  return prefix, tonumber(n)
end

-- Why a binding can't be added, or nil if it can.
local function problem(key, action, value)
  if type(key) ~= "string" or key == "" then return L["press a key or click first"] end
  if not ACTIONS[action] then return L["unknown action"] end
  if (action == "spell" or action == "macro") and (type(value) ~= "string" or value:match("^%s*$")) then
    return action == "spell" and L["pick a spell"] or L["type the macro text"]
  end
  return nil
end

-- Drops the binding for a key from a spec's list (nothing is applied).
local function drop(list, key)
  for i = #list, 1, -1 do
    if list[i].key == key then table.remove(list, i) end
  end
end

-- Puts a checked binding record in a spec's list, replacing the key's old one (nothing is applied).
local function put(list, b)
  drop(list, b.key)
  list[#list + 1] = copyOf(b)
end

-- Applies the bindings to the frames out of combat (when the fight ends, if one is on), once however many changes ask.
local function applySoon()
  ns.OutOfCombat(CC.ApplyAll, "clickcast")
end

-- Adds (or replaces) the binding for a key in the current spec, then applies once.
-- A spell binding may carry its spell id and, for a specific rank, the rank number.
function CC.Add(key, action, value, id, rank)
  local err = problem(key, action, value)
  if err then return false, err end
  put(CC.Bindings(), { key = key, action = action, value = value, spellID = id, rank = rank })
  applySoon()
  return true
end

-- Removes the binding for a key in the current spec, then applies.
function CC.Remove(key)
  drop(CC.Bindings(), key)
  applySoon()
end

-- Removes every binding in the current spec.
function CC.Clear()
  clearList(CC.Bindings())
  applySoon()
end

-- Layouts, copies and strings ---------------------------------------------------------------------

-- Binds a layout ({ key = { action, value } }, from Modules/ClickCastSpells.lua) over the current
-- bindings: its keys are replaced, other keys are kept. A spell binds by name, so one the
-- character hasn't learned yet starts working when it is.
function CC.ApplyLayout(layout)
  local list = CC.Bindings()
  for key, b in pairs(layout) do
    if not problem(key, b.action, b.value) then
      put(list, { key = key, action = b.action, value = b.value, spellID = b.action == "spell" and spellID(b.value) or nil })
    end
  end
  applySoon()
end

-- Copies the current spec's bindings over another spec's (a list copied onto itself is left alone).
function CC.CopyToSpec(spec)
  local from, to = CC.Bindings(), CC.Bindings(spec)
  if from == to then return end
  overwriteList(to, from)
end

-- The current spec's bindings as a string to share.
function CC.Export()
  return ns.Serialize.Encode("clickcast", { bindings = copyList(CC.Bindings()) })
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
    if i > CC.MAX_IMPORT then return nil, ns.Format(L["more than {count} bindings"], { count = CC.MAX_IMPORT }) end
    if type(b) == "table" and type(b.value) == "string" and #b.value > CC.MAX_TEXT then
      return nil, ns.Format(L["a text is longer than {count} characters"], { count = CC.MAX_TEXT })
    end
    if wellFormed(b) then out[#out + 1] = b end
  end
  if #out == 0 then return nil, L["no usable bindings in it"] end
  return out
end

-- Swaps the current spec's bindings for a checked list (the last of two for one key wins) and applies once.
local function replaceAll(list)
  local mine = CC.Bindings()
  clearList(mine)
  for _, b in ipairs(list) do
    put(mine, { key = b.key, action = b.action, value = b.value, spellID = wholeNumber(b.spellID), rank = wholeNumber(b.rank) })
  end
  applySoon()
end

-- Replaces the current spec's bindings with the ones in a string: the whole string is checked first,
-- then the old bindings are swapped for the new ones and applied once. A string that can't be imported
-- changes nothing. Returns the number of bindings now, else nil and a reason.
function CC.Import(text)
  local scope, data = ns.Serialize.Decode(text)
  if not scope then return nil, data end
  if scope ~= "clickcast" or type(data.bindings) ~= "table" then return nil, L["not a click-casting string"] end
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
    if mods:lower():find(m .. "-", 1, true) then out[#out + 1] = MODIFIER_NAMES[m] end
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

-- A binding key's name for people: "Ctrl + Right click", "Shift + Q".
function CC.KeyName(key)
  local prefix, n = CC.MouseParts(key)
  if prefix then return modifierText(prefix) .. MOUSE_NAMES[n] end
  local mods, base = splitKey(key)
  local names = { MOUSEWHEELUP = L["Wheel up"], MOUSEWHEELDOWN = L["Wheel down"] }
  return modifierText(mods) .. (names[base] or base)
end

-- A binding key for people, a hover key marked as one: "Ctrl + Right click", "Shift + Q (hover)".
function CC.KeyText(key)
  if CC.MouseParts(key) then return CC.KeyName(key) end
  return ns.Format(L["{key} (hover)"], { key = CC.KeyName(key) })
end

-- What a binding does: the spell name (with its rank when one was picked), "Macro: ...", "Target", "Unit menu"...
function CC.ActionText(b)
  if b.action == "spell" and b.rank then return ns.Format(L["{spell} (Rank {rank})"], { spell = b.value, rank = b.rank }) end
  if b.action == "spell" then return b.value end
  if b.action == "macro" then return ns.Format(L["Macro: {text}"], { text = b.value }) end
  return ACTION_NAMES[b.action] or ACTION_NAMES.menu
end

-- What a hover key does off the frames ("Action bar 1 slot 2"), or nil when it's free or the client can't say.
function CC.Collision(key)
  if CC.MouseParts(key) or type(GetBindingAction) ~= "function" then return nil end
  local action = GetBindingAction(key)
  if type(action) ~= "string" or action == "" then return nil end
  local bar, slot = action:match("^MULTIACTIONBAR(%d)BUTTON(%d+)$")
  if bar then return ns.Format(L["Action bar {bar} slot {slot}"], { bar = bar + 1, slot = slot }) end
  slot = action:match("^ACTIONBUTTON(%d+)$")
  return slot and ns.Format(L["Action bar {bar} slot {slot}"], { bar = 1, slot = slot }) or action:lower():gsub("_", " ")
end

-- The menu click of the old starter layouts ------------------------------------------------------

-- What may sit on plain Right click for the swap to be offered: a spell or a macro (a heal either way).
local SWAPPABLE = { spell = true, macro = true }

-- Whether a list has a spell or macro on plain Right click and the Unit menu on Middle click, the shape the starter layouts had
-- before "Click to select", where the menu on Middle fails only because the game's profile doesn't cover that click
-- (the units' click handler drops it) and, once the two are swapped, both clicks would run.
local function oldShape(list)
  local right, middle = inList(list, "BUTTON2"), inList(list, "BUTTON3")
  if not (right and middle and SWAPPABLE[right.action] and middle.action == "menu") then return false end
  if CC.WontRun(middle) ~= CC.WONT_RUN.click then return false end
  return CC.WontRun({ key = "BUTTON2", action = "menu" }) == nil and CC.WontRun({ key = "BUTTON3", action = right.action }) == nil
end

-- Whether the current list has the old shape (see oldShape), so the Click casting page offers the swap.
function CC.MenuClickNeedsFix()
  return oldShape(CC.Bindings())
end

-- Moves a list's Unit menu from Middle click to plain Right click and its Right click spell to Middle click.
local function swapMenu(list)
  local heal = copyOf(inList(list, "BUTTON2"))
  heal.key = "BUTTON3"
  put(list, heal)
  put(list, { key = "BUTTON2", action = "menu" })
end

-- The keys of the lists the swap changes: the current one when it has the old shape and, where the lists are kept per
-- talent group, the other group's when it has the shape too (the migration gave both the same list). None otherwise.
function CC.MenuFixKeys()
  local keys = {}
  if not CC.MenuClickNeedsFix() then return keys end
  for _, key in ipairs(CC.PerGroup() and CC.TALENT_GROUPS or { CC.CurrentKey() }) do
    if oldShape(CC.Bindings(key)) then keys[#keys + 1] = key end
  end
  return keys
end

-- Swaps the menu and the Right click binding in every list CC.MenuFixKeys names, then applies (when the fight ends, in
-- one). Nothing else in a list changes. Returns those keys; none, and changes nothing, when the current list doesn't
-- have the shape CC.MenuClickNeedsFix describes.
function CC.FixMenuClick()
  local keys = CC.MenuFixKeys()
  for _, key in ipairs(keys) do swapMenu(CC.Bindings(key)) end
  if #keys > 0 then applySoon() end
  return keys
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
-- A stored name this client doesn't know (made in another client language) gives way to the stored id's name here;
-- the saved name is left alone, so switching back keeps working.
local function spellValue(b)
  if b.rank then return b.spellID or b.value end
  if b.spellID and not spellID(b.value) then return ns.SpellName(b.spellID) or b.value end
  return b.value
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

-- The key of the list the frames were last given, to tell whether a change of talent group needs another apply even
-- while no frame is registered (nil until the first apply).
local appliedKey

-- Applies the bindings to every registered frame (out of combat only).
function CC.ApplyAll()
  appliedKey = CC.CurrentKey()
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
  applySoon()
end

-- Tells a healer once, in chat, that the Click casting page has the menu-click swap to offer: the page opens on the tab
-- it showed last, which may not be the one the notice is on, and a healer who never opens it would not see it.
local function tellMenuNotice()
  if CC.Stamped("menuNotice") or CC.Stamped("menuNoticeTold") or not CC.MenuClickNeedsFix() then return end
  CC.Stamp("menuNoticeTold")
  ns.Chat(L["Click casting: Middle click can't open the unit menu on your raid frames. /vg > Click casting can move the menu to Right click."])
end

-- The client named a talent group or spec: remembers the group, migrates the lists once the group is first known, and
-- applies that list.
local function groupNamed()
  rememberGroup()
  migrateTalentGroups()
  applySoon()
end

-- Entering the world: a client that names the talent group only after login gets that group's list now, and a healer
-- with the old layouts' menu click is told once.
local function enteringWorld()
  rememberGroup()
  migrateTalentGroups()
  if appliedKey ~= CC.CurrentKey() then applySoon() end
  tellMenuNotice()
end

-- Module entry point (Core/Modules.lua): a secure handler, the talent-group migration, the frames, spec changes.
function CC.Enable(settings)
  CC.settings = settings
  CC.handler = CreateFrame("Frame", "Vanguard_ClickCastHandler", UIParent, "SecureHandlerBaseTemplate")
  rememberGroup()
  migrateTalentGroups()
  ns.OutOfCombat(function() registerFrames(settings) end)
  -- A new spec has its own bindings: apply them (spec changes happen out of combat).
  ns.On("PLAYER_SPECIALIZATION_CHANGED", groupNamed)
  ns.On("ACTIVE_TALENT_GROUP_CHANGED", groupNamed)
  ns.On("PLAYER_ENTERING_WORLD", enteringWorld)
end
