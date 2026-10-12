-- A small kit of themed controls for the options window: text, push button,
-- cycle button, color swatch, key capture and text input. Switches, sliders
-- and the other rows live in Core/Controls.lua. Each control has :Refresh()
-- to re-read its value.

local ADDON, ns = ...

local T = ns.Theme

local W = {}
ns.Widgets = W

-- A left-aligned string in a text role and color.
local function label(parent, text, role, color)
  local fs = T.Text(parent:CreateFontString(nil, "OVERLAY"), role, color)
  fs:SetJustifyH("LEFT")
  fs:SetText(text)
  return fs
end

-- A line of gray text (help or status); :Refresh() re-reads it when text is a function.
function W.Text(parent, text)
  local fs = label(parent, type(text) == "function" and text() or text, "label", "text2")
  -- Re-reads a text given as a function.
  fs.Refresh = function(self) if type(text) == "function" then self:SetText(text()) end end
  return fs
end

-- The report label for a push button's click: its caption when it has one, else "button".
function W.ClickLabel(text)
  return "click " .. (type(text) == "string" and text or "button")
end

-- A themed push button that runs onClick (a failure in it is reported under the button's caption).
function W.Button(parent, text, onClick, width)
  local b = ns.DialogButton(parent, text, width or 160)
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

-- Ends capturing: keyboard off, caption back.
local function stopCapture(b)
  b.capturing = false
  b:EnableKeyboard(false)
  b.text:SetText(b.caption)
end

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

-- A mouse button while capturing: "ctrl-BUTTON2" (mouse bindings use lower-case modifiers).
local function onMouseDown(b, button)
  if b.capturing and MOUSE_BUTTONS[button] then
    captured(b, W.Modifiers():lower() .. "BUTTON" .. MOUSE_BUTTONS[button])
  end
end

-- The wheel while capturing: "SHIFT-MOUSEWHEELUP".
local function onWheel(b, delta)
  if b.capturing then captured(b, W.Modifiers() .. (delta > 0 and "MOUSEWHEELUP" or "MOUSEWHEELDOWN")) end
end

-- A button that, once clicked, takes the next key, mouse click or wheel turn
-- (with Shift/Ctrl/Alt) and passes it to onKey. Escape cancels.
function W.KeyCapture(parent, caption, onKey)
  local b = ns.DialogButton(parent, caption, 220)
  b.caption, b.onKey = caption, onKey
  b:SetScript("OnClick", ns.Guard("click key capture", function(self) self.capturing = true; self:EnableKeyboard(true); self.text:SetText("Press a key, click or scroll...") end))
  b:SetScript("OnKeyDown", onKeyDown)
  b:SetScript("OnMouseDown", onMouseDown)
  b:EnableMouseWheel(true)
  b:SetScript("OnMouseWheel", onWheel)
  return b
end

-- Text input -------------------------------------------------------------------------------

-- A one-line themed text input.
function W.Input(parent, width)
  local e = T.EditBox(CreateFrame("EditBox", nil, parent))
  e:SetSize(width or 220, 24)
  e:SetAutoFocus(false)
  e:SetTextInsets(6, 6, 0, 0)
  T.Text(e, "label")
  e:SetScript("OnEscapePressed", e.ClearFocus)
  e:SetScript("OnEnterPressed", e.ClearFocus)
  return e
end
