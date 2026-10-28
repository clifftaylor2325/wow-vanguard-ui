-- A small kit of themed controls for the options window: text, push button,
-- cycle button, color swatch, key capture and text input. Switches, sliders
-- and the other rows live in Core/Controls.lua. Each control has :Refresh()
-- to re-read its value.

local ADDON, ns = ...
local L = ns.L

local T = ns.Theme

local W = {}
ns.Widgets = W

-- A left-aligned line of text in a role and color: W.Label(parent, text, role, color).
function W.Label(parent, text, role, color)
  local fs = T.Text(parent:CreateFontString(nil, "OVERLAY"), role, color)
  fs:SetJustifyH("LEFT")
  fs:SetText(text)
  return fs
end

-- A line of gray text (help or status); :Refresh() re-reads it when text is a function.
function W.Text(parent, text)
  local fs = W.Label(parent, type(text) == "function" and text() or text, "label", "text2")
  -- Re-reads a text given as a function.
  fs.Refresh = function(self) if type(text) == "function" then self:SetText(text()) end end
  return fs
end

-- The report label for a push button's click: its caption when it has one, else "button".
function W.ClickLabel(text)
  return "click " .. (type(text) == "string" and text or "button")
end

-- A themed push button (T.BUTTON_H tall, 120 wide unless told otherwise) that runs onClick (a failure
-- in it is reported under the button's caption).
function W.Button(parent, text, onClick, width)
  local b = ns.DialogButton(parent, text, width)
  b:SetScript("OnClick", ns.Guard(W.ClickLabel(text), onClick))
  return b
end

-- A small square of color that runs onClick.
function W.Swatch(parent, rgb, onClick)
  local s = T.Button(CreateFrame("Button", nil, parent))
  s:SetSize(28, 28)
  s.fill = s:CreateTexture(nil, "ARTWORK")
  s.fill:SetTexture(T.WHITE)
  s.fill:SetPoint("TOPLEFT", 3, -3)
  s.fill:SetPoint("BOTTOMRIGHT", -3, 3)
  s.fill:SetVertexColor(rgb[1], rgb[2], rgb[3])
  s:SetScript("OnClick", ns.Guard("click swatch", onClick))
  return s
end

-- Key capture ------------------------------------------------------------------------------

local MODIFIER_KEYS = { LSHIFT = true, RSHIFT = true, LCTRL = true, RCTRL = true, LALT = true, RALT = true, LMETA = true, RMETA = true }
local MOUSE_BUTTONS = { LeftButton = 1, RightButton = 2, MiddleButton = 3, Button4 = 4, Button5 = 5 }
W.MODIFIER_KEYS, W.MOUSE_BUTTONS = MODIFIER_KEYS, MOUSE_BUTTONS

-- True when a modifier-key query (IsShiftKeyDown...) exists and says held.
local function held(fn)
  return type(fn) == "function" and fn() == true
end

-- The held modifiers, in binding order: "ALT-CTRL-SHIFT-" (only those held).
function W.Modifiers()
  return (held(IsAltKeyDown) and "ALT-" or "") .. (held(IsControlKeyDown) and "CTRL-" or "") .. (held(IsShiftKeyDown) and "SHIFT-" or "")
end

-- The captures armed right now (weak keys: one that is gone drops out), each stopped when a fight starts.
local armed = setmetatable({}, { __mode = "k" })

-- Ends capturing: keyboard off, caption back.
local function stopCapture(b)
  armed[b] = nil
  b.capturing = false
  b:EnableKeyboard(false)
  b.text:SetText(b.caption)
end

-- Starts capturing: keyboard on, the caption says what to press. Not in a fight: the keyboard can't be set
-- to pass keys on then, so an armed capture would eat the fight's first key.
local function startCapture(b)
  if ns.InCombat() then return end
  armed[b] = true
  b.capturing = true
  b:EnableKeyboard(true)
  b.text:SetText(L["Press a key, click or scroll..."])
end

-- A fight starting ends every armed capture, so no key of the fight is swallowed.
ns.On("PLAYER_REGEN_DISABLED", function() for b in pairs(armed) do stopCapture(b) end end)

-- Captured one binding: hand it over and stop.
local function captured(b, key)
  stopCapture(b)
  b.onKey(key)
end

-- A key while capturing: Escape cancels, lone modifiers wait, anything else is the key.
local function onKeyDown(b, key)
  if not b.capturing then return end
  if key == "ESCAPE" then return stopCapture(b) end
  if not MODIFIER_KEYS[key] then captured(b, W.Modifiers() .. key) end
end

-- A mouse button while capturing: "ctrl-BUTTON2" (mouse bindings use lower-case modifiers). The left
-- button is taken on its click instead (onClick), or its release would arm the button again.
local function onMouseDown(b, button)
  if b.capturing and button ~= "LeftButton" and MOUSE_BUTTONS[button] then
    captured(b, W.Modifiers():lower() .. "BUTTON" .. MOUSE_BUTTONS[button])
  end
end

-- The wheel while capturing: "SHIFT-MOUSEWHEELUP".
local function onWheel(b, delta)
  if b.capturing then captured(b, W.Modifiers() .. (delta > 0 and "MOUSEWHEELUP" or "MOUSEWHEELDOWN")) end
end

-- A left click: arms an idle button, and is the captured BUTTON1 on an armed one.
local function onClick(b)
  if b.capturing then return captured(b, W.Modifiers():lower() .. "BUTTON1") end
  startCapture(b)
end

-- A button that, once clicked, takes the next key, mouse click or wheel turn
-- (with Shift/Ctrl/Alt) and passes it to onKey. Escape cancels.
function W.KeyCapture(parent, caption, onKey)
  local b = ns.DialogButton(parent, caption, 220)
  b.caption, b.onKey = caption, onKey
  b:SetScript("OnClick", ns.Guard("click key capture", onClick))
  b:SetScript("OnKeyDown", ns.Guard("key capture key", onKeyDown))
  b:SetScript("OnMouseDown", ns.Guard("key capture mouse", onMouseDown))
  b:EnableMouseWheel(true)
  b:SetScript("OnMouseWheel", ns.Guard("key capture wheel", onWheel))
  b:HookScript("OnHide", ns.Guard("key capture hide", stopCapture))
  return b
end

-- Text input -------------------------------------------------------------------------------

-- A one-line themed text input, T.CONTROL_H tall.
function W.Input(parent, width)
  local e = T.EditBox(CreateFrame("EditBox", nil, parent))
  e:SetSize(width or 220, T.CONTROL_H)
  e:SetAutoFocus(false)
  e:SetTextInsets(6, 6, 0, 0)
  T.Text(e, "label")
  e:SetScript("OnEscapePressed", e.ClearFocus)
  e:SetScript("OnEnterPressed", e.ClearFocus)
  return e
end
