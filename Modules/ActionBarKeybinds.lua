-- Keybind mode (/fui keybind, or Keybind mode on the Action bars page): hover
-- one of ForeverUI's action buttons and press a key to bind it, as the game's
-- own quick keybind mode does. The key is bound to the button's game command
-- (ACTIONBUTTON1, MULTIACTIONBAR1BUTTON1, ...) in place of the keys it had, and
-- saved in the binding set in use (account or character), so it stays bound
-- without ForeverUI too; the button's hotkey text shows it at once.
--
-- Escape leaves; a modifier pressed alone (Shift, Ctrl, Alt) waits for the key it
-- goes with; a key pressed with no button under the mouse goes on to the game.
-- Bindings are protected, so the mode only runs out of combat and ends when a
-- fight starts. While it is on, empty slots and faded bars show, as they do
-- while you drag a spell, so every button can be bound.

local ADDON, ns = ...

local T = ns.Theme
local AB = ns.GetModule("ActionBars")

-- Keys that are only modifiers: pressed alone they bind nothing.
AB.MODIFIER_KEYS = { LSHIFT = true, RSHIFT = true, LCTRL = true, RCTRL = true, LALT = true, RALT = true, LMETA = true, RMETA = true }

-- A key as a binding with the modifiers held, in the game's order ("ALT-CTRL-SHIFT-Q").
function AB.KeyChord(key)
  if IsShiftKeyDown() then key = "SHIFT-" .. key end
  if IsControlKeyDown() then key = "CTRL-" .. key end
  if IsAltKeyDown() then key = "ALT-" .. key end
  return key
end

-- "Bar 2 button 5" for a button.
local function buttonLabel(b)
  return string.format("Bar %d button %d", b.fuiBar.fuiIndex, b:GetAttribute("index"))
end

-- Binds key to the button's command in place of its keys, saves the binding
-- set in use and repaints the hotkeys. Out of combat only; false in a fight.
function AB.BindKey(b, key)
  if ns.InCombat() then return false end
  for _, old in ipairs({ GetBindingKey(b.binding) }) do SetBinding(old, nil) end
  SetBinding(key, b.binding)
  SaveBindings(GetCurrentBindingSet())
  AB.ApplyBindings()
  ns.Chat(string.format("%s bound to %s.", key, buttonLabel(b)))
  return true
end

-- A key while keybind mode is on: Escape leaves, a modifier alone waits for its
-- key, any other key binds the button under the mouse; with none, the key goes
-- on to the game (passing keys on is restricted in combat, when the mode is off).
function AB.OnBindKey(f, key)
  local hovered = AB.bindHover
  if not ns.InCombat() then f:SetPropagateKeyboardInput(key ~= "ESCAPE" and not hovered) end
  if key == "ESCAPE" then return AB.KeybindMode(false) end
  if hovered and not AB.MODIFIER_KEYS[key] then AB.BindKey(hovered, AB.KeyChord(key)) end
end

-- The accent wash over the button under the mouse while the mode is on.
local function addMark(f)
  f.mark = CreateFrame("Frame", nil, f)
  f.mark.wash = T.Tint(f.mark:CreateTexture(nil, "OVERLAY"), "accent")
  f.mark.wash:SetTexture(T.WHITE)
  f.mark.wash:SetAllPoints()
  f.mark.wash:SetAlpha(0.35)
  f.mark:Hide()
end

-- The mode's banner at the top center, built on first use; it takes the keyboard.
local function build()
  local f = T.Panel(CreateFrame("Frame", "ForeverUI_KeybindMode", UIParent), { raised = true, shadow = true })
  f:SetSize(460, 40) f:SetPoint("TOP", UIParent, "TOP", 0, -120)
  f:SetFrameStrata("DIALOG")
  f.text = T.Text(f:CreateFontString(nil, "OVERLAY"), "label")
  f.text:SetPoint("CENTER")
  f.text:SetText("Keybind mode: hover a button and press a key. Escape leaves.")
  f:EnableKeyboard(true)
  f:SetScript("OnKeyDown", AB.OnBindKey)
  addMark(f)
  return f
end

-- The mouse came over a button while the mode is on: it is the one a key binds.
local function onEnter(b)
  if not AB.binding then return end
  AB.bindHover = b
  AB.binder.mark:SetAllPoints(b)
  AB.binder.mark:Show()
end

-- The mouse left the button: no button to bind until it is over another.
local function onLeave(b)
  if AB.bindHover ~= b then return end
  AB.bindHover = nil
  AB.binder.mark:Hide()
end

-- Follows the mouse over every action button (once).
local function hookButtons()
  for _, b in ipairs(AB.buttons) do
    if not b.fuiBindHooked then
      b.fuiBindHooked = true
      b:HookScript("OnEnter", onEnter)
      b:HookScript("OnLeave", onLeave)
    end
  end
end

-- Whether the mode can start now; says why not in chat.
local function canStart()
  if #AB.buttons == 0 then ns.Chat("Keybind mode needs ForeverUI's action bars (/fui > Modules).") return false end
  if ns.InCombat() then ns.Chat("Keybind mode waits until you're out of combat.") return false end
  return true
end

-- Turns keybind mode on or off (on only out of combat, with the bars built).
function AB.KeybindMode(on)
  if on and not canStart() then return end
  AB.binder = AB.binder or build()
  hookButtons()
  AB.binding, AB.bindHover = on, nil
  AB.binder:SetShown(on)
  AB.binder.mark:Hide()
  AB.SetGrid(on)
  if not on then ns.Chat("Keybind mode off.") end
end

-- /fui keybind: on, or off again.
function AB.ToggleKeybindMode()
  AB.KeybindMode(not AB.binding)
end

-- A fight ends keybind mode (bindings can't change in combat).
ns.On("PLAYER_REGEN_DISABLED", function() if AB.binding then AB.KeybindMode(false) end end)
