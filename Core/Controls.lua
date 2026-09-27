-- Settings rows for the options window, one per kind of setting: a switch,
-- a choice (segments, or a dropdown when the choices don't fit), a slider
-- and a search box. Each row is a full-width button with the caption on
-- the left (row.label) and the control on the right; clicking the caption
-- does the obvious thing (flip the switch, step to the next choice). Every
-- row has :Refresh() to re-read its value.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local ROW_HEIGHT = 28
W.ROW_HEIGHT = ROW_HEIGHT

-- Shared parts -------------------------------------------------------------------------------

-- A full-width row button with a hover wash and the caption on the left.
local function row(parent, caption, width)
  local r = CreateFrame("Button", nil, parent)
  r:SetSize(width or 400, ROW_HEIGHT)
  r.hover = r:CreateTexture(nil, "HIGHLIGHT")
  r.hover:SetTexture(T.WHITE)
  r.hover:SetAllPoints()
  T.Tint(r.hover, "hover")
  r.label = T.Text(r:CreateFontString(nil, "OVERLAY"), "label")
  r.label:SetPoint("LEFT", 8, 0)
  r.label:SetText(caption)
  return r
end

-- A texture in one flat theme color.
local function flat(parent, layer, color)
  local t = parent:CreateTexture(nil, layer)
  t:SetTexture(T.WHITE)
  return T.Tint(t, color)
end
W.Flat = flat

-- Keeps a primary button's fill in the current accent.
local function refreshPrimary(b)
  T.Tint(b.fill, "accent")
end

-- A primary push button: accent fill, dark label. For the one action a view is about.
function W.Primary(parent, text, onClick, width)
  local b = ns.DialogButton(parent, text, width or 120)
  b.fill = b:CreateTexture(nil, "BORDER", nil, -1)
  b.fill:SetTexture(T.WHITE)
  b.fill:SetAllPoints()
  T.Color(b.text, "void")
  b.Refresh = refreshPrimary
  b:SetScript("OnClick", onClick)
  b:Refresh()
  return b
end

-- An icon from Media/Icons, size x size, tinted.
local function icon(parent, name, size, color)
  local t = parent:CreateTexture(nil, "OVERLAY")
  t:SetTexture(T.Icon(name))
  t:SetSize(size, size)
  return T.Tint(t, color)
end
W.IconTexture = icon

-- Switch --------------------------------------------------------------------------------------

-- Shows the switch on (accent track, knob right) or off (dark track, knob left).
local function refreshSwitch(r)
  local on = r.get() == true
  r.fill:SetShown(on)
  T.Tint(r.fill, "accent")
  r.knob:ClearAllPoints()
  r.knob:SetPoint(on and "RIGHT" or "LEFT", r.track, on and "RIGHT" or "LEFT", on and -2 or 2, 0)
  T.Tint(r.knob, on and "white" or "muted")
end

-- The switch itself: an inset track, an accent fill when on, and a square knob.
local function addSwitch(r)
  r.track = T.Panel(CreateFrame("Frame", nil, r), { inset = true, noSheen = true })
  r.track:SetSize(30, 16)
  r.track:SetPoint("RIGHT", -8, 0)
  r.fill = flat(r.track, "ARTWORK", "accent")
  r.fill:SetAllPoints()
  r.knob = flat(r.track, "OVERLAY", "muted")
  r.knob:SetSize(12, 12)
end

-- A switch row: set(on) runs on click, then the row re-reads get().
function W.Check(parent, text, get, set, width)
  local r = row(parent, text, width)
  r.get, r.Refresh = get, refreshSwitch
  addSwitch(r)
  r:SetScript("OnClick", function(self) set(not self.get()); self:Refresh() end)
  r:Refresh()
  return r
end

-- Choices ------------------------------------------------------------------------------------

-- The choice after the current one (wrapping), from a list of { value, text }.
function W.NextChoice(choices, current)
  for i, c in ipairs(choices) do
    if c[1] == current then return choices[i % #choices + 1] end
  end
  return choices[1]
end

-- The text of the current choice (or the first).
local function currentText(choices, current)
  for _, c in ipairs(choices) do
    if c[1] == current then return c[2] end
  end
  return choices[1] and choices[1][2] or ""
end

-- Whether choices fit as segments: four or fewer, with short labels.
local function fitsSegments(choices)
  local chars = 0
  for _, c in ipairs(choices) do chars = chars + #c[2] end
  return #choices <= 4 and chars <= 32
end

-- A segment's width for its label.
local function segmentWidth(text)
  return math.max(44, #text * 7 + 16)
end

-- Highlights the selected segment (accent fill, dark text).
local function refreshSegments(r)
  local current = r.get()
  for _, s in ipairs(r.segments) do
    local on = s.value == current
    s.fill:SetShown(on)
    T.Tint(s.fill, "accent")
    T.Color(s.text, on and "void" or "text2")
  end
end

-- One segment button: its label, an accent fill when selected, set(value) on click.
local function segment(r, choice, set)
  local s = T.Button(CreateFrame("Button", nil, r))
  s:SetSize(segmentWidth(choice[2]), 20)
  s.value = choice[1]
  s.fill = flat(s, "ARTWORK", "accent")
  s.fill:SetAllPoints()
  s.text = T.Text(s:CreateFontString(nil, "OVERLAY"), "small")
  s.text:SetPoint("CENTER")
  s.text:SetText(choice[2])
  s:SetScript("OnClick", function() set(choice[1]); r:Refresh() end)
  return s
end

-- Segments right to left along the row's right edge.
local function addSegments(r, choices, set)
  r.segments = {}
  local x = -8
  for i = #choices, 1, -1 do
    local s = segment(r, choices[i], set)
    s:SetPoint("RIGHT", x, 0)
    x = x - s:GetWidth() + 1
    table.insert(r.segments, 1, s)
  end
end

-- A dropdown on the right of a choice row; its Refresh is the row's.
local function addDropdown(r, choices, get, set)
  r.dropdown = W.Dropdown(r, choices, get, function(v) set(v); r:Refresh() end, 180)
  r.dropdown:SetPoint("RIGHT", -8, 0)
  -- The row shows its value through the dropdown.
  r.Refresh = function(self) self.dropdown:Refresh() end
end

-- A choice row: segments when they fit, else a dropdown. Clicking the caption steps to the next choice.
function W.Choice(parent, caption, choices, get, set, width)
  local r = row(parent, caption, width)
  r.caption, r.choices, r.get = caption, choices, get
  if fitsSegments(choices) then addSegments(r, choices, set) else addDropdown(r, choices, get, set) end
  r.Refresh = r.Refresh or refreshSegments
  r:SetScript("OnClick", function(self) set(W.NextChoice(self.choices, self.get())[1]); self:Refresh() end)
  r:Refresh()
  return r
end

-- Dropdown -----------------------------------------------------------------------------------

local menu

-- Hides the open dropdown menu.
function W.CloseMenu()
  if menu then menu:Hide() end
end

-- One item in the menu: its text, a check on the current choice.
local function menuItem(i)
  local b = CreateFrame("Button", nil, menu)
  b:SetHeight(22)
  b:SetPoint("TOPLEFT", 1, -1 - (i - 1) * 22)
  b:SetPoint("TOPRIGHT", -1, -1 - (i - 1) * 22)
  flat(b, "HIGHLIGHT", "hover"):SetAllPoints()
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "label")
  b.text:SetPoint("LEFT", 8, 0)
  b.check = icon(b, "Check", 12, "accent")
  b.check:SetPoint("RIGHT", -6, 0)
  return b
end

-- The shared menu frame, built once: a raised panel above everything.
local function menuFrame()
  if menu then return menu end
  menu = T.Panel(CreateFrame("Frame", "ForeverUI_Menu", UIParent), { raised = true, shadow = true })
  menu:SetFrameStrata("FULLSCREEN_DIALOG")
  menu:EnableMouse(true)
  menu.items = {}
  menu:Hide()
  return menu
end

-- Fills menu item i with a choice; picking it runs pick(value) and closes the menu.
local function fillItem(i, choice, current, pick)
  menu.items[i] = menu.items[i] or menuItem(i)
  local b = menu.items[i]
  b.text:SetText(choice[2])
  T.Color(b.text, choice[1] == current and "accent" or "text")
  b.check:SetShown(choice[1] == current)
  b:SetScript("OnClick", function() W.CloseMenu(); pick(choice[1]) end)
  b:Show()
end

-- Opens the menu under a dropdown with its choices.
local function openMenu(d)
  menuFrame()
  local choices = type(d.choices) == "function" and d.choices() or d.choices
  for i, choice in ipairs(choices) do fillItem(i, choice, d.get(), d.set) end
  for i = #choices + 1, #menu.items do menu.items[i]:Hide() end
  menu:SetSize(d:GetWidth(), #choices * 22 + 2)
  menu:ClearAllPoints()
  menu:SetPoint("TOPLEFT", d, "BOTTOMLEFT", 0, -2)
  menu.owner = d
  menu:Show()
end

-- Shows the current choice's text.
local function refreshDropdown(d)
  local choices = type(d.choices) == "function" and d.choices() or d.choices
  d.text:SetText(currentText(choices, d.get()))
end

-- A dropdown: shows the current choice; click to pick from a menu. choices
-- is a list of { value, text } or a function returning one.
function W.Dropdown(parent, choices, get, set, width)
  local d = T.Button(CreateFrame("Button", nil, parent))
  d:SetSize(width or 180, 22)
  d.choices, d.get, d.set, d.Refresh = choices, get, set, refreshDropdown
  d.text = T.Text(d:CreateFontString(nil, "OVERLAY"), "label")
  d.text:SetPoint("LEFT", 8, 0)
  d.arrow = icon(d, "Down", 12, "text2")
  d.arrow:SetPoint("RIGHT", -6, 0)
  d:SetScript("OnClick", function(self) if menu and menu:IsShown() and menu.owner == self then W.CloseMenu() else openMenu(self) end end)
  d:Refresh()
  return d
end

-- Slider -------------------------------------------------------------------------------------

-- Places the fill and thumb for the current value, and shows it as text.
local function refreshSlider(r)
  local v = r.get()
  local share = math.max(0, math.min(1, (v - r.min) / (r.max - r.min)))
  r.fill:SetWidth(math.max(1, r.track:GetWidth() * share))
  r.thumb:ClearAllPoints()
  r.thumb:SetPoint("CENTER", r.track, "LEFT", r.track:GetWidth() * share, 0)
  r.value:SetText(r.format(v))
end

-- A value snapped to the slider's step and range.
local function snap(r, v)
  local stepped = r.min + math.floor((v - r.min) / r.step + 0.5) * r.step
  return math.max(r.min, math.min(r.max, stepped))
end

-- Sets the value from where the cursor is along the track (while dragging).
local function dragTo(r)
  local x = type(GetCursorPosition) == "function" and GetCursorPosition()
  local left = r.track:GetLeft()
  if not x or not left then return end
  local share = (x / r.track:GetEffectiveScale() - left) / r.track:GetWidth()
  r.set(snap(r, r.min + share * (r.max - r.min)))
  r:Refresh()
end

-- Moves the value by n steps (clamped).
local function stepBy(r, n)
  r.set(snap(r, r.get() + n * r.step))
  r:Refresh()
end

-- Dragging along the track: follow the cursor from mouse down to mouse up.
local function wireDrag(r)
  r.track:SetScript("OnMouseDown", function() r.track:SetScript("OnUpdate", function() dragTo(r) end) end)
  r.track:SetScript("OnMouseUp", function() r.track:SetScript("OnUpdate", nil) end)
end

-- The track, fill and thumb.
local function addTrack(r)
  r.track = T.Panel(CreateFrame("Button", nil, r), { inset = true, noSheen = true })
  r.track:SetSize(140, 6)
  r.track:SetPoint("RIGHT", -66, 0)
  r.fill = flat(r.track, "ARTWORK", "accent")
  r.fill:SetPoint("TOPLEFT")
  r.fill:SetPoint("BOTTOMLEFT")
  r.thumb = flat(r.track, "OVERLAY", "white")
  r.thumb:SetSize(6, 14)
  wireDrag(r)
end

-- Clicking the caption steps up, wrapping to the minimum after the maximum.
local function stepOrWrap(r)
  if r.get() >= r.max then
    r.set(r.min)
    r:Refresh()
  else
    stepBy(r, 1)
  end
end

-- The wheel steps the value either way; clicking the caption steps up (wrapping).
local function wireSteps(r)
  r:EnableMouseWheel(true)
  r:SetScript("OnMouseWheel", function(self, delta) stepBy(self, delta > 0 and 1 or -1) end)
  r:SetScript("OnClick", stepOrWrap)
end

-- A slider row for a number from min to max in steps; format(v) is its
-- text. Clicking the caption steps up (wrapping to min), the wheel steps
-- either way.
function W.Slider(parent, caption, opts, get, set, width)
  local r = row(parent, caption, width)
  r.min, r.max, r.step, r.format = opts.min, opts.max, opts.step, opts.format or tostring
  r.get, r.set, r.Refresh = get, set, refreshSlider
  addTrack(r)
  r.value = T.Text(r:CreateFontString(nil, "OVERLAY"), "number", "text2")
  r.value:SetPoint("RIGHT", -8, 0)
  wireSteps(r)
  r:Refresh()
  return r
end

-- Search -------------------------------------------------------------------------------------

-- Shows the hint only while the box is empty.
local function refreshHint(e)
  e.hint:SetShown((e:GetText() or "") == "")
end

-- A search box with a magnifier and a hint; onChange(text) runs as you type.
function W.Search(parent, width, hint, onChange)
  local e = W.Input(parent, width)
  e:SetTextInsets(24, 6, 0, 0)
  e.glass = icon(e, "Search", 12, "text2")
  e.glass:SetPoint("LEFT", 7, 0)
  e.hint = T.Text(e:CreateFontString(nil, "OVERLAY"), "label", "muted")
  e.hint:SetPoint("LEFT", 24, 0)
  e.hint:SetText(hint)
  e:SetScript("OnTextChanged", function(self) refreshHint(self); onChange(self:GetText() or "") end)
  return e
end
