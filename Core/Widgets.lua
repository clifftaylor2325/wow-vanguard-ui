-- A small kit of themed controls for the options window: header, text,
-- check box, cycle button (steps through a list of choices), push button
-- and color swatch. Each control has :Refresh() to re-read its value.

local ADDON, ns = ...

local T = ns.Theme

local W = {}
ns.Widgets = W

-- A left-aligned label in the theme font.
local function label(parent, text, size)
  local fs = T.SetFont(parent:CreateFontString(nil, "OVERLAY"), size or 12)
  fs:SetJustifyH("LEFT")
  fs:SetText(text)
  fs:SetTextColor(0.9, 0.9, 0.9)
  return fs
end

-- A section title in the accent color.
function W.Header(parent, text)
  local fs = label(parent, text, 14)
  T.Color(fs)
  return fs
end

-- A line of gray text (help or status); :Refresh() re-reads it when text is a function.
function W.Text(parent, text)
  local fs = label(parent, type(text) == "function" and text() or text, 11)
  fs:SetTextColor(0.7, 0.7, 0.7)
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
  box.mark:SetVertexColor(T.Accent())
end

-- A check box with a label; set(on) runs on click, then the box re-reads get().
function W.Check(parent, text, get, set)
  local box = T.Button(CreateFrame("Button", nil, parent))
  box:SetSize(18, 18)
  box.get, box.Refresh = get, refreshCheck
  addMark(box)
  box.label = label(box, text)
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
