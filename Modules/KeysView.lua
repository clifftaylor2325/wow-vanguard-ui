-- What every key does now, read-only (the "Your keys" card on the Action bars page
-- draws it, Modules/KeysViewCard.lua). A key is looked up as the game binds it: the
-- command on it, and when that is one of Vanguard's action buttons, the spell, macro
-- or item in the button's slot with its icon. Nothing here writes a key, so it runs in
-- combat. The keyboard is a picture with the function row and the number pad, in the QWERTY, QWERTZ or AZERTY
-- letter layout (the client locale's unless one is picked), keys by the names the game binds them by.

local ADDON, ns = ...

local L = ns.L

local KV = {}
ns.KeysView = KV

local AB = ns.GetModule("ActionBars")

-- The keyboard's letter rows (Q row, A row, Z row) for each layout. Only the letters move between layouts; the
-- other keys keep their names, as the game names a key by what it prints.
KV.LAYOUTS = {
  { id = "qwerty", label = "QWERTY", rows = {
    { "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]" },
    { "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'" },
    { "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/" },
  } },
  { id = "qwertz", label = "QWERTZ", rows = {
    { "Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "[", "]" },
    { "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'" },
    { "Y", "X", "C", "V", "B", "N", "M", ",", ".", "/" },
  } },
  { id = "azerty", label = "AZERTY", rows = {
    { "A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]" },
    { "Q", "S", "D", "F", "G", "H", "J", "K", "L", "M", "'" },
    { "W", "X", "C", "V", "B", "N", ",", ";", ":", "!" },
  } },
}
-- The layout a client locale types on, when the player has not picked one (QWERTY for any other).
KV.LOCALE_LAYOUT = { deDE = "qwertz", frFR = "azerty" }
-- The rows that do not change with the layout: the function keys, the number row and the space bar.
KV.FUNCTION_ROW = { offset = 0, keys = { "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12" } }
KV.NUMBER_ROW = { offset = 0, keys = { "`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=" } }
KV.SPACE_ROW = { offset = 3.5, keys = { "SPACE" }, wide = 6 }
-- The rows the keyboard draws (the function row, the number row, three letter rows and the space bar), and how many
-- key widths the main block is wide.
KV.ROW_COUNT, KV.MAIN_COLS = 6, 13
-- The number pad, beside the main block from the number row down: how far in each row starts (in key widths), its
-- keys and, for a row's first key, how wide it is (in key widths).
KV.PAD = {
  { offset = 0, keys = { "NUMPADDIVIDE", "NUMPADMULTIPLY", "NUMPADMINUS" } },
  { offset = 0, keys = { "NUMPAD7", "NUMPAD8", "NUMPAD9", "NUMPADPLUS" } },
  { offset = 0, keys = { "NUMPAD4", "NUMPAD5", "NUMPAD6" } },
  { offset = 0, keys = { "NUMPAD1", "NUMPAD2", "NUMPAD3" } },
  { offset = 0, keys = { "NUMPAD0", "NUMPADDECIMAL" }, wide = 2 },
}
-- The mouse's extra buttons and wheel, left to right (left and right click bind nothing).
KV.MOUSE = { "BUTTON3", "BUTTON4", "BUTTON5", "MOUSEWHEELUP", "MOUSEWHEELDOWN" }
-- The modifier tabs: the prefix a chord starts with, and the tab's caption.
KV.TABS = {
  { id = "none", prefix = "", label = L["None"] },
  { id = "shift", prefix = "SHIFT-", label = L["Shift"] },
  { id = "ctrl", prefix = "CTRL-", label = L["Ctrl"] },
  { id = "alt", prefix = "ALT-", label = L["Alt"] },
}
local TAB_BY_ID = {}
for _, tab in ipairs(KV.TABS) do TAB_BY_ID[tab.id] = tab end
-- The tab showing now, by id, and the one the player clicked (what letting go of a modifier goes back to).
KV.tab, KV.picked = "none", "none"

-- The tab's chord for a key ("SHIFT-Q").
---@param tab table one of KV.TABS
---@param key string
---@return string
function KV.Chord(tab, key)
  return tab.prefix .. key
end

-- The tab of the modifier held now, "none" with none held; with two held no tab fits (the key fires a
-- chord the tabs don't list), so it is "none" too.
---@return string
function KV.HeldTab()
  local held = {}
  if IsAltKeyDown() then held[#held + 1] = "alt" end
  if IsControlKeyDown() then held[#held + 1] = "ctrl" end
  if IsShiftKeyDown() then held[#held + 1] = "shift" end
  return #held == 1 and held[1] or "none"
end

-- The tab with this id (every id in KV.TABS).
---@param id string
---@return table
function KV.TabById(id)
  return TAB_BY_ID[id]
end

-- One of Vanguard's action buttons by its game command ("ACTIONBUTTON1"), or by the click override that
-- fires it ("CLICK Vanguard_Bar1Button1:LeftButton"), or nil.
local function buttonFor(command)
  for _, b in ipairs(AB.buttons) do
    if b:IsShown() and (b.binding == command or command == "CLICK " .. b:GetName() .. ":LeftButton") then return b end
  end
  return nil
end

-- A spell's name, nil when the id is hidden or the client has no name call.
local function spellName(id)
  local plain = ns.PlainNumber(id)
  return plain and C_Spell and C_Spell.GetSpellName and C_Spell.GetSpellName(plain) or nil
end

-- A macro's name, nil when it is hidden.
local function macroName(slot)
  local text = AB.CallAction("GetActionText", slot)
  return not ns.IsSecret(text) and text or nil
end

-- The name of what a slot holds: a spell's, a macro's, or "Item" for an item; nil when empty or hidden.
local function slotName(slot)
  local kind, id = GetActionInfo(slot)
  if ns.IsSecret(kind) then return nil end
  if kind == "spell" then return spellName(id) end
  if kind == "macro" then return macroName(slot) end
  return kind == "item" and L["Item"] or nil
end

-- The slot's icon, nil when it is empty or hidden (a secret value is never passed on).
local function slotIcon(slot)
  local texture = AB.CallAction("GetActionTexture", slot)
  return not ns.IsSecret(texture) and texture or nil
end

-- "Bar 2 button 5": where one of Vanguard's buttons sits.
local function placeText(b)
  return ns.Format(L["Bar {bar} button {button}"], { bar = b.vgBar.vgIndex, button = b:GetAttribute("index") })
end

-- An entry for a key on one of Vanguard's buttons.
local function barEntry(chord, b)
  local slot = b.action
  if not slot then return { chord = chord, place = placeText(b) } end
  return { chord = chord, place = placeText(b), name = slotName(slot), icon = slotIcon(slot) }
end

-- An entry for a key on something else: the game's name for the command, or the command itself.
local function gameEntry(chord, command)
  return { chord = chord, place = _G["BINDING_NAME_" .. command] or command }
end

-- What a chord is bound to now: an entry { chord, place, name, icon }, or nil when the key is free.
---@param chord string
---@return table|nil
function KV.Lookup(chord)
  local command = GetBindingAction(chord, true)
  if type(command) ~= "string" or command == "" then return nil end
  local b = buttonFor(command)
  return b and barEntry(chord, b) or gameEntry(chord, command)
end

-- A chord as text for the player: the game's key name when it has one ("Shift-Q"), else the chord.
---@param chord string
---@return string
function KV.KeyText(chord)
  return type(GetBindingText) == "function" and GetBindingText(chord) or chord
end

-- The settings the picture's layout choice is kept in (the Action bars module's, also while it is off).
local function layoutSettings()
  return ns.Settings("ActionBars", AB.defaults)
end

-- The layout with this id, or nil.
local function layoutById(id)
  for _, layout in ipairs(KV.LAYOUTS) do
    if layout.id == id then return layout end
  end
end

-- The layout the keyboard is drawn in: the one picked, else the one the client's locale types on, else QWERTY.
---@return table layout  one of KV.LAYOUTS
function KV.Layout()
  local picked = layoutSettings().keyLayout
  local locale = type(GetLocale) == "function" and GetLocale() or ""
  return layoutById(picked) or layoutById(KV.LOCALE_LAYOUT[locale]) or KV.LAYOUTS[1]
end

-- Picks a layout by its id; anything else goes back to "auto" (the locale's).
---@param id string
function KV.SetLayout(id)
  layoutSettings().keyLayout = layoutById(id) and id or "auto"
end

-- The picked layout's id, or "auto".
---@return string
function KV.LayoutChoice()
  local picked = layoutSettings().keyLayout
  return layoutById(picked) and picked or "auto"
end

-- The keyboard, row by row, in the layout shown: how far in the row starts (in key widths) and its keys.
---@return table[]
function KV.Rows()
  local rows = KV.Layout().rows
  return {
    KV.FUNCTION_ROW, KV.NUMBER_ROW,
    { offset = 0.5, keys = rows[1] }, { offset = 0.75, keys = rows[2] }, { offset = 1.25, keys = rows[3] },
    KV.SPACE_ROW,
  }
end

-- Adds a row's keys to a list.
local function addKeys(out, keys)
  for _, key in ipairs(keys) do out[#out + 1] = key end
end

-- Every key the picture shows, keyboard first, then the number pad and the mouse.
---@return string[]
function KV.AllKeys()
  local out = {}
  for _, row in ipairs(KV.Rows()) do addKeys(out, row.keys) end
  for _, row in ipairs(KV.PAD) do addKeys(out, row.keys) end
  addKeys(out, KV.MOUSE)
  return out
end

-- The tab's bound keys as entries, in the picture's order.
---@param tab table one of KV.TABS
---@return table[]
function KV.List(tab)
  local out = {}
  for _, key in ipairs(KV.AllKeys()) do
    out[#out + 1] = KV.Lookup(KV.Chord(tab, key))
  end
  return out
end
