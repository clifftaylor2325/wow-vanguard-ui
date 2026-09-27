-- A small kit of themed controls for the options window: header, text,
-- check box, cycle button (steps through a list of choices), push button
-- and color swatch. Each control has :Refresh() to re-read its value.

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

-- A section title in the accent color.
function W.Header(parent, text)
  return label(parent, text, "heading", "accent")
end

-- A line of gray text (help or status); :Refresh() re-reads it when text is a function.
function W.Text(parent, text)
  local fs = label(parent, type(text) == "function" and text() or text, "label", "text2")
  -- Re-reads a text given as a function.
  fs.Refresh = function(self) if type(text) == "function" then self:SetText(text()) end end
  return fs
end

-- A themed push button that runs onClick.
function W.Button(parent, text, onClick, width)
  local b = ns.DialogButton(parent, text, width or 160)
  b:SetScript("OnClick", onClick)
  return b
end

-- Shows the check mark when the value is on.
local function refreshCheck(box)
  box.mark:SetShown(box.get() == true)
end

-- The check mark: an accent square inset in the box.
local function addMark(box)
  box.mark = box:CreateTexture(nil, "OVERLAY")
  box.mark:SetTexture(T.WHITE)
  box.mark:SetPoint("TOPLEFT", 4, -4)
  box.mark:SetPoint("BOTTOMRIGHT", -4, 4)
  T.Tint(box.mark, "accent")
end

-- A check box with a label; set(on) runs on click, then the box re-reads get().
function W.Check(parent, text, get, set)
  local box = T.Button(CreateFrame("Button", nil, parent))
  box:SetSize(18, 18)
  box.get, box.Refresh = get, refreshCheck
  addMark(box)
  box.label = label(box, text, "label")
  box.label:SetPoint("LEFT", box, "RIGHT", 8, 0)
  box:SetScript("OnClick", function(self) set(not self.get()); self:Refresh() end)
  box:Refresh()
  return box
end

-- The choice after the current one (wrapping), from a list of { value, text }.
local function nextChoice(choices, current)
  for i, c in ipairs(choices) do
    if c[1] == current then return choices[i % #choices + 1] end
  end
  return choices[1]
end

-- Shows "Label: choice" for the current value.
local function refreshCycle(b)
  local current = b.get()
  for _, c in ipairs(b.choices) do
    if c[1] == current then b.text:SetText(b.caption .. ": " .. c[2]) end
  end
end

-- A button that steps through choices ({ value, text } pairs) on each click.
function W.Cycle(parent, caption, choices, get, set)
  local b = ns.DialogButton(parent, caption, 220)
  b.caption, b.choices, b.get, b.Refresh = caption, choices, get, refreshCycle
  b:SetScript("OnClick", function(self) set(nextChoice(self.choices, self.get())[1]); self:Refresh() end)
  b:Refresh()
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
  s:SetScript("OnClick", onClick)
  return s
end

-- Key capture ------------------------------------------------------------------------------

local MODIFIER_KEYS = { LSHIFT = true, RSHIFT = true, LCTRL = true, RCTRL = true, LALT = true, RALT = true, LMETA = true, RMETA = true }
local MOUSE_BUTTONS = { LeftButton = 1, RightButton = 2, MiddleButton = 3, Button4 = 4, Button5 = 5 }

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
  b:SetScript("OnClick", function(self) self.capturing = true; self:EnableKeyboard(true); self.text:SetText("Press a key, click or scroll...") end)
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
