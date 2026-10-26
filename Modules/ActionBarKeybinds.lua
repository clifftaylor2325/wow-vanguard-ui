-- Keybind mode (/vg keybind, or Keybind mode on the Action bars page): hover
-- one of Vanguard's action buttons and press a key, the middle or a side mouse
-- button, or roll the wheel to bind it, as the game's own quick keybind mode
-- does. The key is bound to the button's game command (ACTIONBUTTON1,
-- MULTIACTIONBAR1BUTTON1, ...) in place of the keys it had, and saved in the
-- binding set in use (account or character), so it stays bound without
-- Vanguard too; the button's hotkey text shows it at once. A key taken from
-- something else (Move Forward, another button) is said so in chat. Backspace
-- or Delete clears the button's keys. A tooltip over the button shows its keys.
--
-- While the mode is on, a catcher sits over every button: it takes the mouse,
-- so a click binds instead of casting (left and right click bind nothing, as
-- in the game), and it carries the accent wash under the mouse.
--
-- Escape or the banner's Done button leaves (keys are saved as they are bound, so
-- both keep them); the banner's second line says what the last key did, in the
-- warn colour when it took a key from something else. A modifier pressed alone
-- (Shift, Ctrl, Alt) waits for the key it goes with; a key pressed with no button
-- under the mouse goes on to the game.
-- Bindings are protected, so the mode only runs out of combat and ends when a
-- fight starts. While it is on, empty slots and faded bars show, as they do
-- while you drag a spell, so every button can be bound.

local ADDON, ns = ...

local T = ns.Theme
local L = ns.L
local AB = ns.GetModule("ActionBars")

-- Keys that are only modifiers: pressed alone they bind nothing.
AB.MODIFIER_KEYS = { LSHIFT = true, RSHIFT = true, LCTRL = true, RCTRL = true, LALT = true, RALT = true, LMETA = true, RMETA = true }
-- Keys that clear the button's keys instead of binding one.
AB.CLEAR_KEYS = { BACKSPACE = true, DELETE = true }
-- Mouse buttons as binding keys; left and right click (the game's own) bind nothing.
AB.MOUSE_KEYS = { MiddleButton = "BUTTON3", Button4 = "BUTTON4", Button5 = "BUTTON5" }
-- The banner's size, and the width of its Done button. 720 keeps the how-to-leave line whole in German and French.
AB.BANNER = { w = 720, h = 76, done = 84 }

-- A key as a binding with the modifiers held, in the game's order ("ALT-CTRL-SHIFT-Q").
function AB.KeyChord(key)
  if IsShiftKeyDown() then key = "SHIFT-" .. key end
  if IsControlKeyDown() then key = "CTRL-" .. key end
  if IsAltKeyDown() then key = "ALT-" .. key end
  return key
end

-- "Bar 2 button 5" for a button.
local function buttonLabel(b)
  return ns.Format(L["Bar {bar} button {button}"], { bar = b.vgBar.vgIndex, button = b:GetAttribute("index") })
end

-- A button's keys, joined ("Q, SHIFT-Q"), or "no key".
local function keysText(b)
  local keys = { GetBindingKey(b.binding) }
  return #keys > 0 and table.concat(keys, ", ") or L["no key"]
end

-- What a key does now, for the chat line: one of Vanguard's buttons by its
-- label, else the game's name for the command ("Move Forward", or the command
-- itself when it has none); nil when the key is free or already this button's.
local function keyOwner(key, b)
  local command = type(GetBindingAction) == "function" and GetBindingAction(key) or ""
  if type(command) ~= "string" or command == "" or command == b.binding then return nil end
  for _, other in ipairs(AB.buttons) do
    if other.binding == command then return buttonLabel(other) end
  end
  return _G["BINDING_NAME_" .. command] or command
end

-- The tooltip over a button while the mode is on: its place, its keys, and how to bind or clear.
local function showTip(b)
  GameTooltip_SetDefaultAnchor(GameTooltip, b)
  GameTooltip:SetText(buttonLabel(b))
  GameTooltip:AddLine(ns.Format(L["Keys: {keys}"], { keys = keysText(b) }), T.RGB("text"))
  local r, g, bl = T.RGB("text2")
  GameTooltip:AddLine(L["Press a key, the middle or a side mouse button, or roll the wheel to bind it (with Shift, Ctrl or Alt held, if you like). Backspace clears."], r, g, bl, true)
  GameTooltip:Show()
end

-- Unbinds every key of a button's command.
local function dropKeys(b)
  for _, old in ipairs({ GetBindingKey(b.binding) }) do SetBinding(old, nil) end
end

-- After a change: saves the binding set in use, repaints the hotkeys, and
-- refreshes the tooltip when the button is still under the mouse.
local function saved(b)
  SaveBindings(GetCurrentBindingSet())
  AB.ApplyBindings()
  if AB.bindHover == b then showTip(b) end
end

-- What the last key did, in chat and on the banner's second line (in tone, the plain
-- second text colour unless given).
function AB.ShowResult(text, tone)
  ns.Chat(text)
  if not AB.binder then return end
  AB.binder.result:SetText(text)
  T.Color(AB.binder.result, tone or "text2")
end

-- Binds key to the button's command in place of its keys, saves the binding
-- set in use and repaints the hotkeys; says in chat what the key did before,
-- if anything. Out of combat only; false in a fight.
function AB.BindKey(b, key)
  if ns.InCombat() then return false end
  local owner = keyOwner(key, b)
  dropKeys(b)
  SetBinding(key, b.binding)
  saved(b)
  AB.ShowResult(ns.Format(owner and L["{key} bound to {button}, taken from {owner}."] or L["{key} bound to {button}."], { key = key, button = buttonLabel(b), owner = owner }), owner and "warn")
  return true
end

-- Unbinds every key of a button (Backspace or Delete over it) and saves. Out
-- of combat only, and only when it has a key; false otherwise.
function AB.ClearKeys(b)
  if ns.InCombat() then return false end
  if not GetBindingKey(b.binding) then AB.ShowResult(ns.Format(L["{button} has no key."], { button = buttonLabel(b) })) return false end
  local had = keysText(b)
  dropKeys(b)
  saved(b)
  AB.ShowResult(ns.Format(L["{button} unbound (was {keys})."], { button = buttonLabel(b), keys = had }))
  return true
end

-- A key while keybind mode is on: Escape leaves, a modifier alone waits for its
-- key, Backspace or Delete clears the button under the mouse, any other key
-- binds it; with no button under the mouse, the key goes on to the game
-- (passing keys on is restricted in combat, when the mode is off).
function AB.OnBindKey(f, key)
  local hovered = AB.bindHover
  if not ns.InCombat() then f:SetPropagateKeyboardInput(key ~= "ESCAPE" and not hovered) end
  if key == "ESCAPE" then return AB.KeybindMode(false) end
  if not hovered or AB.MODIFIER_KEYS[key] then return end
  if AB.CLEAR_KEYS[key] then AB.ClearKeys(hovered) else AB.BindKey(hovered, AB.KeyChord(key)) end
end

-- A mouse button pressed over a button: the middle and side buttons bind it
-- (with the modifiers held); left and right click bind nothing, and cast
-- nothing either, since the catcher is over the button.
local function onMouseDown(c, button)
  local key = AB.MOUSE_KEYS[button]
  if key then AB.BindKey(c.vgButton, AB.KeyChord(key)) end
end

-- The wheel over a button binds wheel up or down (with the modifiers held).
local function onMouseWheel(c, delta)
  AB.BindKey(c.vgButton, AB.KeyChord(delta > 0 and "MOUSEWHEELUP" or "MOUSEWHEELDOWN"))
end

-- The mouse came over a button's catcher: that button is the one a key binds;
-- it gets the wash and the tooltip.
local function onEnter(c)
  AB.bindHover = c.vgButton
  c.wash:Show()
  showTip(c.vgButton)
end

-- The mouse left the catcher: no button to bind until it is over another.
local function onLeave(c)
  if AB.bindHover ~= c.vgButton then return end
  AB.bindHover = nil
  c.wash:Hide()
  GameTooltip:Hide()
end

-- The accent wash on a catcher, shown while the mouse is over it.
local function addWash(c)
  c.wash = T.Tint(c:CreateTexture(nil, "OVERLAY"), "accent")
  c.wash:SetTexture(T.WHITE)
  c.wash:SetAllPoints()
  c.wash:SetAlpha(0.35)
  c.wash:Hide()
end

-- A catcher takes the mouse and the wheel: hover, clicks and the wheel are its.
local function wireCatcher(c)
  c:EnableMouse(true)
  c:EnableMouseWheel(true)
  c:SetScript("OnEnter", onEnter)
  c:SetScript("OnLeave", onLeave)
  c:SetScript("OnMouseDown", onMouseDown)
  c:SetScript("OnMouseWheel", onMouseWheel)
end

-- The catcher over a button, built once: a frame above the button's regions
-- that takes the mouse and the wheel, with the accent wash on it.
local function catcher(b)
  if b.vgCatcher then return b.vgCatcher end
  local c = CreateFrame("Frame", nil, b)
  c:SetAllPoints()
  c:SetFrameLevel(b:GetFrameLevel() + 5)
  c.vgButton = b
  addWash(c)
  wireCatcher(c)
  c:Hide()
  b.vgCatcher = c
  return c
end

-- The banner's two lines: how the mode works on top, the last key's result under it, left of Done.
local function addBannerText(f)
  f.text = T.Text(f:CreateFontString(nil, "OVERLAY"), "label")
  f.text:SetPoint("TOPLEFT", T.SPACE.pad, -T.SPACE.pad)
  f.text:SetPoint("TOPRIGHT", -T.SPACE.pad, -T.SPACE.pad)
  f.text:SetWordWrap(false)
  f.text:SetText(L["Hover a button, then press a key, a side mouse button or the wheel. Backspace clears, Escape leaves."])
  f.result = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "text2")
  f.result:SetPoint("BOTTOMLEFT", T.SPACE.pad, T.SPACE.pad)
  f.result:SetPoint("RIGHT", f.done, "LEFT", -T.SPACE.gap, 0)
  f.result:SetJustifyH("LEFT")
  f.result:SetWordWrap(false)
end

-- Done, at the banner's bottom right: leaves the mode, keeping every key bound (each saved as it was bound).
-- The banner takes keys, not mouse buttons, so a click on it never becomes a bind.
local function addDone(f)
  f.done = ns.DialogButton(f, L["Done"], AB.BANNER.done)
  f.done:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.gap)
  f.done:SetScript("OnClick", ns.Guard("click keybind Done", function() AB.KeybindMode(false) end))
end

-- The mode's banner at the top center, built on first use; it takes the keyboard.
local function build()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_KeybindMode", UIParent), { raised = true, shadow = true })
  f:SetSize(AB.BANNER.w, AB.BANNER.h) f:SetPoint("TOP", UIParent, "TOP", 0, -120)
  f:SetFrameStrata("DIALOG")
  addDone(f)
  addBannerText(f)
  f:EnableKeyboard(true)
  f:SetScript("OnKeyDown", AB.OnBindKey)
  return f
end

-- Shows or hides every button's catcher (the one under the mouse lets go first).
local function setCatchers(on)
  if AB.bindHover then onLeave(AB.bindHover.vgCatcher) end
  for _, b in ipairs(AB.buttons) do
    catcher(b):SetShown(on)
  end
end

-- Whether the mode can start now; says why not in chat.
local function canStart()
  if #AB.buttons == 0 then ns.Chat(L["Keybind mode needs Vanguard's action bars (/vg > Modules)."]) return false end
  if ns.InCombat() then ns.Chat(L["Keybind mode waits until you're out of combat."]) return false end
  return true
end

-- Widens the banner to its instruction line at the current Text size (never narrower than AB.BANNER.w,
-- never wider than the screen less a margin each side). No T.FitText: the line is the one to read whole.
local function fitBanner(f)
  local line = math.ceil(T.FullWidth(f.text)) + 2 * T.SPACE.pad
  f:SetWidth(math.min(UIParent:GetWidth() - 2 * T.SPACE.section, math.max(AB.BANNER.w, line)))
end

-- Turns keybind mode on or off (on only out of combat, with the bars built).
function AB.KeybindMode(on)
  if on and not canStart() then return end
  AB.binder = AB.binder or build()
  AB.binder.result:SetText(on and L["Nothing bound yet."] or "")
  T.Color(AB.binder.result, "text2")
  setCatchers(on)
  AB.binding = on
  AB.binder:SetShown(on)
  if on then fitBanner(AB.binder) end
  AB.SetGrid(on)
  if not on then ns.Chat(L["Keybind mode off."]) end
end

-- /vg keybind: on, or off again.
function AB.ToggleKeybindMode()
  AB.KeybindMode(not AB.binding)
end

-- A fight ends keybind mode (bindings can't change in combat).
ns.On("PLAYER_REGEN_DISABLED", function() if AB.binding then AB.KeybindMode(false) end end)
