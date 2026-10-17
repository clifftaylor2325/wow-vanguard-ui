-- Settings rows for the options window, one per kind of setting: a switch,
-- a choice (segments, or a dropdown when the choices don't fit), a slider
-- and a search box. Each row is a full-width button with the caption on
-- the left (row.label) and the control on the right; clicking the caption
-- does the obvious thing (flip the switch, step to the next choice). The
-- mouse wheel never changes a value: over a row it scrolls the page (the
-- rows don't take it, so it goes on to the page's scroll view). Every row
-- has :Refresh() to re-read its value.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local ROW_HEIGHT = 28
W.ROW_HEIGHT = ROW_HEIGHT
-- The switch track's size (a pill, twice as wide as it is tall) and its round knob's diameter; a caption stops short of the track.
local SWITCH_WIDTH, SWITCH_HEIGHT, KNOB_SIZE = 36, 18, 14
-- The slider track's height (a pill) and its round thumb's diameter.
local SLIDER_HEIGHT, SLIDER_THUMB = T.SLIDER.height, T.SLIDER.thumb

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
  T.TintFill(b.fill, "accent")
end

-- A primary push button: an accent fill (T.FillParts, so it follows rounded corners) and a dark label,
-- T.BUTTON_H tall and 120 wide unless told otherwise. For the one action a view is about.
function W.Primary(parent, text, onClick, width)
  local b = ns.DialogButton(parent, text, width)
  b.fill = T.FillParts(b, "BORDER", -1, "accent")
  T.Color(b.text, "void")
  b.Refresh = refreshPrimary
  b:SetScript("OnClick", ns.Guard(W.ClickLabel(text), onClick))
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

-- Tints a track's pill and outline again in the track and line tokens: a theme variant recolours the tokens, and
-- the options window refreshes every row after a theme change, so the tracks follow it like the panels around them.
local function tintTrack(r, track, line)
  for _, part in ipairs(r.trackArt) do T.Tint(part, track) end
  for _, part in ipairs(r.outline) do T.Tint(part, line) end
end

-- Shows the switch: on (accent fill, bright knob right) or off (dark track, dim knob left); the knob is bright under the mouse, the fill darker while pressed.
local function refreshSwitch(r)
  local on = r.get() == true
  tintTrack(r, "inset", "borderHi")
  r.fill:SetShown(on)
  T.Tint(r.fill, r.pressed and "accentDim" or "accent")
  for _, part in ipairs({ r.knob, r.shade }) do
    part:ClearAllPoints()
    part:SetPoint(on and "RIGHT" or "LEFT", r.track, on and "RIGHT" or "LEFT", on and -2 or 2, 0)
  end
  T.Tint(r.knob, (on or r.hot) and "white" or "muted")
end

-- Keeps r.hot (mouse over) and r.pressed (button down) up to date, redrawing the switch on each change.
local function trackMouse(r)
  for event, field, value in ([[OnEnter hot true OnLeave hot false OnMouseDown pressed true OnMouseUp pressed false]]):gmatch("(%w+) (%w+) (%w+)") do
    r:HookScript(event, function(self) self[field] = value == "true"; if self.get then self:Refresh() end end)
  end
end

-- A texture of Media/Textures in one theme color (the art is white or grayscale, so the color tints it), at a
-- sublevel of its layer when parts of one layer must stack in a set order.
local function art(parent, layer, name, color, sublevel)
  local t = parent:CreateTexture(nil, layer, nil, sublevel)
  t:SetTexture(T.Texture(name))
  return T.Tint(t, color)
end

-- The switch's round knob, and the shade under its lit edge (refreshSwitch places both): the knob above the
-- track's outline, the shade above the knob.
local function addKnob(r)
  r.knob = art(r.track, "OVERLAY", "Knob", "muted", 1)
  r.knob:SetSize(KNOB_SIZE, KNOB_SIZE)
  r.shade = art(r.track, "OVERLAY", "KnobShade", "shade", 2)
  r.shade:SetSize(KNOB_SIZE, KNOB_SIZE)
end

-- The switch track's art: the pill in the inset color, the accent fill inside its outline (shown when on) and the outline.
local function addSwitchArt(r)
  r.trackArt = { art(r.track, "BORDER", "Pill", "inset") }
  r.trackArt[1]:SetAllPoints()
  r.fill = art(r.track, "ARTWORK", "Pill", "accent")
  r.fill:SetPoint("TOPLEFT", 1, -1)
  r.fill:SetPoint("BOTTOMRIGHT", -1, 1)
  r.outline = { art(r.track, "OVERLAY", "PillLine", "borderHi") }
  r.outline[1]:SetAllPoints()
end

-- The switch itself: a pill track in the inset color with its outline, an accent fill when on, and a round knob with its shade.
local function addSwitch(r)
  r.track = CreateFrame("Frame", nil, r)
  r.track:SetSize(SWITCH_WIDTH, SWITCH_HEIGHT)
  r.track:SetPoint("RIGHT", -8, 0)
  addSwitchArt(r)
  addKnob(r)
end

-- A switch row: set(on) runs on click, then the row re-reads get(). A long caption wraps left of the switch.
function W.Check(parent, text, get, set, width)
  local r = row(parent, text, width)
  r.label:SetWidth((width or 400) - SWITCH_WIDTH - 24)
  r.label:SetJustifyH("LEFT")
  r.get, r.Refresh = get, refreshSwitch
  addSwitch(r)
  trackMouse(r)
  r:SetScript("OnClick", ns.Guard("click switch", function(self) set(not self.get()); T.Sound(self.get() and "on" or "off"); self:Refresh() end))
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

-- A choice list marked by W.Keep also lists the value in use when that isn't one of its choices, so
-- the row can show it. A copy is made: the list as written stays as it was.
local function withValue(choices, value)
  if not choices.keep or value == nil then return choices end
  for _, c in ipairs(choices) do
    if c[1] == value then return choices end
  end
  local out = {}
  for i, c in ipairs(choices) do out[i] = c end
  out[#out + 1] = { value, tostring(value) }
  return out
end

-- Marks a choice list so its row keeps in view a value that isn't one of the choices (see withValue).
function W.Keep(choices)
  choices.keep = true
  return choices
end

-- Whether choices fit as segments: four or fewer, with short labels.
local function fitsSegments(choices)
  local chars = 0
  for _, c in ipairs(choices) do chars = chars + #c[2] end
  return #choices <= 4 and chars <= 32
end

-- A segment's width for its label as drawn (so it follows the font and the text size), 8 of air each side.
local function segmentWidth(s)
  return math.max(44, math.ceil(s.text:GetStringWidth()) + 16)
end

-- Sizes the segments to their labels and lays them right to left along the row's right edge.
local function layoutSegments(r)
  local x = -8
  for i = #r.segments, 1, -1 do
    local s = r.segments[i]
    s:SetWidth(segmentWidth(s))
    s:ClearAllPoints()
    s:SetPoint("RIGHT", x, 0)
    x = x - s:GetWidth() + 1
  end
end

-- Highlights the selected segment (accent fill, dark text), with the segments sized to their labels.
local function refreshSegments(r)
  layoutSegments(r)
  local current = r.get()
  for _, s in ipairs(r.segments) do
    local on = s.value == current
    T.ShowFill(s.fill, on)
    T.TintFill(s.fill, "accent")
    T.Color(s.text, on and "void" or "text2")
  end
end

-- One segment button, T.CONTROL_H tall: its label, an accent fill when selected (T.FillParts, so it
-- follows rounded corners), set(value) on click.
local function segment(r, choice, set)
  local s = T.Button(CreateFrame("Button", nil, r))
  s:SetSize(44, T.CONTROL_H)
  s.value = choice[1]
  s.fill = T.FillParts(s, "ARTWORK", nil, "accent")
  s.text = T.Text(s:CreateFontString(nil, "OVERLAY"), "label")
  s.text:SetPoint("CENTER")
  s.text:SetText(choice[2])
  s:SetScript("OnClick", ns.Guard("click segment", function() set(choice[1]); r:Refresh() end))
  return s
end

-- One segment per choice, laid out along the row's right edge.
local function addSegments(r, choices, set)
  r.segments = {}
  for i, choice in ipairs(choices) do r.segments[i] = segment(r, choice, set) end
  layoutSegments(r)
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
  choices = withValue(choices, get())
  r.caption, r.choices, r.get = caption, choices, get
  if fitsSegments(choices) then addSegments(r, choices, set) else addDropdown(r, choices, get, set) end
  r.Refresh = r.Refresh or refreshSegments
  r:SetScript("OnClick", ns.Guard("click choice", function(self) set(W.NextChoice(self.choices, self.get())[1]); self:Refresh() end))
  r:Refresh()
  return r
end

-- Dropdown -----------------------------------------------------------------------------------

local menu
-- The most items a dropdown menu shows at once; the mouse wheel scrolls a
-- longer list (every bar texture other addons share, say).
local MENU_ROWS = 16
-- How tall a menu item is: an inline control's height.
local MENU_ROW = T.CONTROL_H

-- Hides the open dropdown menu.
function W.CloseMenu()
  if menu then menu:Hide() end
end

-- One item in the menu: its text, a check on the current choice.
local function menuItem(i)
  local b = CreateFrame("Button", nil, menu)
  b:SetHeight(MENU_ROW)
  b:SetPoint("TOPLEFT", 1, -1 - (i - 1) * MENU_ROW)
  b:SetPoint("TOPRIGHT", -1, -1 - (i - 1) * MENU_ROW)
  flat(b, "HIGHLIGHT", "hover"):SetAllPoints()
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "label")
  b.text:SetPoint("LEFT", 8, 0)
  b.check = icon(b, "Check", 12, "accent")
  b.check:SetPoint("RIGHT", -6, 0)
  return b
end

-- Fills menu item i with a choice; picking it runs pick(value) and closes the menu.
local function fillItem(i, choice, current, pick)
  menu.items[i] = menu.items[i] or menuItem(i)
  local b = menu.items[i]
  b.text:SetText(choice[2])
  T.Color(b.text, choice[1] == current and "accentText" or "text")
  b.check:SetShown(choice[1] == current)
  b:SetScript("OnClick", ns.Guard("click menu item", function() W.CloseMenu(); pick(choice[1]) end))
  b:Show()
end

-- Fills the menu's items from its choices, from the one after menu.offset.
local function fillMenu()
  local d, shown = menu.owner, math.min(#menu.choices, MENU_ROWS)
  for i = 1, shown do fillItem(i, menu.choices[menu.offset + i], d.get(), d.set) end
  for i = shown + 1, #menu.items do menu.items[i]:Hide() end
  menu:SetSize(d:GetWidth(), shown * MENU_ROW + 2)
end

-- Scrolls a long menu one item per wheel step, within its list.
local function scrollMenu(_, delta)
  menu.offset = math.max(0, math.min(#menu.choices - MENU_ROWS, menu.offset - delta))
  fillMenu()
end

-- The shared menu frame, built once: a raised panel above everything.
local function menuFrame()
  if menu then return menu end
  menu = T.Panel(CreateFrame("Frame", "Vanguard_Menu", UIParent), { raised = true, shadow = true })
  menu:SetFrameStrata("FULLSCREEN_DIALOG")
  menu:EnableMouse(true)
  menu:SetClampedToScreen(true)
  menu:EnableMouseWheel(true)
  menu:SetScript("OnMouseWheel", scrollMenu)
  menu.items = {}
  menu:Hide()
  return menu
end

-- How far a menu starts scrolled: enough to show the current choice.
local function startOffset(choices, current)
  for i, c in ipairs(choices) do
    if c[1] == current then return math.max(0, i - MENU_ROWS) end
  end
  return 0
end

-- Opens the menu under a dropdown with its choices (scrolled to the current one).
local function openMenu(d)
  menuFrame()
  menu.owner = d
  menu.choices = type(d.choices) == "function" and d.choices() or d.choices
  menu.offset = startOffset(menu.choices, d.get())
  fillMenu()
  menu:ClearAllPoints()
  menu:SetPoint("TOPLEFT", d, "BOTTOMLEFT", 0, -2)
  menu:Show()
  menu:Raise() -- over a dialog in the same strata (ns.Dialog's), whichever was made first
end

-- Shows the current choice's text.
local function refreshDropdown(d)
  local choices = type(d.choices) == "function" and d.choices() or d.choices
  d.text:SetText(currentText(choices, d.get()))
end

-- The dropdown's arrow at its right edge, and the current choice on one line
-- between the left edge and the arrow; a choice too long for the box ends in "...".
local function addDropdownText(d)
  d.arrow = icon(d, "Down", 12, "text2")
  d.arrow:SetPoint("RIGHT", -6, 0)
  d.text = T.Text(d:CreateFontString(nil, "OVERLAY"), "label")
  d.text:SetPoint("LEFT", 8, 0)
  d.text:SetPoint("RIGHT", d.arrow, "LEFT", -4, 0)
  d.text:SetJustifyH("LEFT")
  d.text:SetWordWrap(false)
end

-- A dropdown, T.CONTROL_H tall: shows the current choice; click to pick from a menu. choices
-- is a list of { value, text } or a function returning one.
function W.Dropdown(parent, choices, get, set, width)
  local d = T.Button(CreateFrame("Button", nil, parent))
  d:SetSize(width or 180, T.CONTROL_H)
  d.choices, d.get, d.set, d.Refresh = choices, get, set, refreshDropdown
  addDropdownText(d)
  d:SetScript("OnClick", ns.Guard("click dropdown", function(self) if menu and menu:IsShown() and menu.owner == self then W.CloseMenu() else openMenu(self) end end))
  d:Refresh()
  return d
end

-- Slider -------------------------------------------------------------------------------------

-- Runs the fill to w units from the track's left end: its right end moves and the middle stretches between
-- the two round ends, which narrow when there is no room for both. Under one unit it hides (the thumb sits there).
local function placeFill(r, w)
  local p, cap = r.fillParts, math.min(SLIDER_HEIGHT / 2, math.max(w, 1) / 2)
  for _, part in ipairs(p) do part:SetShown(w >= 1) end
  p[1]:SetWidth(cap)
  p[3]:SetWidth(cap)
  p[3]:SetPoint("TOPLEFT", r.track, "TOPLEFT", w - cap, 0)
  p[3]:SetPoint("BOTTOMLEFT", r.track, "BOTTOMLEFT", w - cap, 0)
end

-- Centres the thumb, its shade and its outline x units along the track.
local function placeThumb(r, x)
  for _, part in ipairs({ r.thumb, r.thumbShade, r.thumbLine }) do
    part:ClearAllPoints()
    part:SetPoint("CENTER", r.track, "LEFT", x, 0)
  end
end

-- Places the fill and thumb for the current value, and shows it as text; a locked slider's
-- thumb dims (T.SLIDER.thumbOff) and its caption is muted.
local function refreshSlider(r)
  local v, locked = r.get(), r.locked and r.locked()
  local share = math.max(0, math.min(1, (v - r.min) / (r.max - r.min)))
  tintTrack(r, T.SLIDER.track, T.SLIDER.line)
  for _, part in ipairs(r.fillParts) do T.Tint(part, T.SLIDER.fill) end
  T.Tint(r.thumb, locked and T.SLIDER.thumbOff or T.SLIDER.thumbColor)
  T.Color(r.label, locked and "muted" or "text")
  placeFill(r, r.track:GetWidth() * share)
  placeThumb(r, r.track:GetWidth() * share)
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

-- A pill of Media/Textures/<name> on frame, in three parts: a round left end, a flat middle and a round right end, so it
-- stretches to any width. Returns the parts.
local function pillParts(frame, layer, name, color)
  local parts = {}
  for i, cut in ipairs({ { 0, 0.25 }, { 0.25, 0.75 }, { 0.75, 1 } }) do
    parts[i] = art(frame, layer, name, color)
    parts[i]:SetTexCoord(cut[1], cut[2], 0, 1)
  end
  return parts
end

-- Lays a pill's parts across frame: each round end half the frame's height wide, the middle between them.
local function placePill(parts, frame)
  local cap = SLIDER_HEIGHT / 2
  parts[1]:SetPoint("TOPLEFT", frame)
  parts[1]:SetPoint("BOTTOMLEFT", frame)
  parts[1]:SetWidth(cap)
  parts[2]:SetPoint("TOPLEFT", frame, "TOPLEFT", cap, 0)
  parts[2]:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -cap, 0)
  parts[3]:SetPoint("TOPRIGHT", frame)
  parts[3]:SetPoint("BOTTOMRIGHT", frame)
  parts[3]:SetWidth(cap)
end

-- The fill (T.SLIDER.fill): a pill on the track itself (its ARTWORK, under the thumb and the outline) from the track's
-- left end, its left end fixed, its middle between the ends; placeFill runs its right end to the thumb.
local function addFill(r)
  r.fillParts = pillParts(r.track, "ARTWORK", "Pill", T.SLIDER.fill)
  local p = r.fillParts
  p[1]:SetPoint("TOPLEFT")
  p[1]:SetPoint("BOTTOMLEFT")
  p[2]:SetPoint("TOPLEFT", p[1], "TOPRIGHT")
  p[2]:SetPoint("BOTTOMRIGHT", p[3], "BOTTOMLEFT")
  placeFill(r, 0)
end

-- The round thumb, its shade and its dark outline (refreshSlider places them), stacked in that order above the
-- track's outline, so the thumb reads as a solid disc with a defined edge over the fill.
local function addThumb(r)
  r.thumb = art(r.track, "OVERLAY", "Knob", T.SLIDER.thumbColor, 1)
  r.thumbShade = art(r.track, "OVERLAY", "KnobShade", T.SLIDER.shade, 2)
  r.thumbLine = art(r.track, "OVERLAY", "KnobLine", "edge", 3)
  for _, part in ipairs({ r.thumb, r.thumbShade, r.thumbLine }) do part:SetSize(SLIDER_THUMB, SLIDER_THUMB) end
end

-- The track: an inset pill with its outline (SliderLine, one pixel at the track's height). The fill and thumb
-- go on it, and dragging sets the value.
local function addTrack(r)
  r.track = CreateFrame("Button", nil, r)
  r.track:SetSize(140, SLIDER_HEIGHT)
  r.track:SetPoint("RIGHT", -66, 0)
  r.trackArt = pillParts(r.track, "BORDER", "Pill", T.SLIDER.track)
  placePill(r.trackArt, r.track)
  addFill(r)
  r.outline = pillParts(r.track, "OVERLAY", "SliderLine", T.SLIDER.line)
  placePill(r.outline, r.track)
  addThumb(r)
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

-- A locked slider's tooltip: why it's locked, and how to unlock it.
local function lockTip(f)
  local why = f.slider.locked()
  if not why or not GameTooltip then return end
  GameTooltip:SetOwner(f, "ANCHOR_RIGHT")
  GameTooltip:SetText(why, nil, nil, nil, nil, true)
  GameTooltip:Show()
end

-- A slider that can lock (opts.locked() gives why, or nil): while it does, its value can't be
-- changed, and hovering it (the row or its track) shows why.
local function addLock(r, locked)
  local set = r.set
  r.locked = locked
  -- A value is set only while the slider isn't locked.
  r.set = function(v) if not locked() then set(v) end end
  for _, f in ipairs({ r, r.track }) do
    f.slider = r
    f:SetScript("OnEnter", lockTip)
    f:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  end
end

-- The default slider text: v rounded to the step's decimals (whole numbers for whole steps), so float noise never shows.
local function roundedText(step)
  local places = 0
  while places < 4 and math.abs(step * 10 ^ places - math.floor(step * 10 ^ places + 0.5)) > 1e-6 do places = places + 1 end
  return function(v) return string.format("%." .. places .. "f", v) end
end

-- The value text, right-aligned in a fixed slot so a long number can't run over the track.
local function addValueText(r)
  r.value = T.Text(r:CreateFontString(nil, "OVERLAY"), "number", "text2")
  r.value:SetPoint("RIGHT", -8, 0)
  r.value:SetWidth(52)
  r.value:SetJustifyH("RIGHT")
end

-- A slider row for a number from min to max in steps; format(v) is its
-- text. Clicking the caption steps up (wrapping to min); dragging along the
-- track sets it. The wheel over it scrolls the page, as over any row.
-- With opts.locked, it locks while that says why (see addLock).
function W.Slider(parent, caption, opts, get, set, width)
  local r = row(parent, caption, width)
  r.min, r.max, r.step, r.format = opts.min, opts.max, opts.step, opts.format or roundedText(opts.step)
  r.get, r.set, r.Refresh = get, set, refreshSlider
  addTrack(r)
  if opts.locked then addLock(r, opts.locked) end
  addValueText(r)
  r:SetScript("OnClick", ns.Guard("click slider", stepOrWrap))
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
  e.hint = T.Text(e:CreateFontString(nil, "OVERLAY"), "label", "disabled")
  e.hint:SetPoint("LEFT", 24, 0)
  e.hint:SetText(hint)
  e:SetScript("OnTextChanged", function(self) refreshHint(self); onChange(self:GetText() or "") end)
  return e
end
