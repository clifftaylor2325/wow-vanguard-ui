-- What every key does now, read-only (the "Your keys" card on the Action bars page
-- draws it, Modules/KeysViewCard.lua). A key is looked up as the game binds it: the
-- command on it, and when that is one of Vanguard's action buttons, the spell, macro
-- or item in the button's slot with its icon. Nothing here writes a key, so it runs in
-- combat and on every client. The keyboard is a QWERTY picture, keys by the names the
-- game binds them by.

local ADDON, ns = ...

local L = ns.L

local KV = {}
ns.KeysView = KV

local AB = ns.GetModule("ActionBars")

-- The keyboard, row by row: how far in the row starts (in key widths) and its keys.
KV.ROWS = {
  { offset = 0, keys = { "`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=" } },
  { offset = 0.5, keys = { "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]" } },
  { offset = 0.75, keys = { "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'" } },
  { offset = 1.25, keys = { "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/" } },
  { offset = 3.5, keys = { "SPACE" }, wide = 6 },
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
  local text = GetActionText(slot)
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
  local texture = GetActionTexture(slot)
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

-- Every key the picture shows, keyboard first and then the mouse.
---@return string[]
function KV.AllKeys()
  local out = {}
  for _, row in ipairs(KV.ROWS) do
    for _, key in ipairs(row.keys) do out[#out + 1] = key end
  end
  for _, key in ipairs(KV.MOUSE) do out[#out + 1] = key end
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
