-- The export panel (/vg export pick, or Choose what to export on the Profiles page): a
-- switch for each part of the profile, all on when it opens: Layout (positions and
-- movers), Situations overrides, Global settings (theme, modules list, skins) and each
-- module with saved settings. Export shows the string to copy: with every switch on, the
-- whole profile (as /vg export); with some off, a partial string, which imports by merging
-- those parts into the profile it's imported into (Core/ProfileStrings.lua).

local ADDON, ns = ...

local W = ns.Widgets

local WIDTH, HEIGHT, ROW_WIDTH = 420, 440, 360
local TITLE = "Export: what to include"
local panel

-- What the panel calls a part: a group part's label, else the module's name.
local function partLabel(part)
  return ns.PART_LABELS[part] or part
end

-- The switch for the panel's i-th part, made once and reused as the parts change.
local function partRow(i)
  if panel.rows[i] then return panel.rows[i] end
  local r = W.Check(panel.list, "", function() return panel.on[panel.parts[i]] end, function(on) panel.on[panel.parts[i]] = on end, ROW_WIDTH)
  r:SetPoint("TOPLEFT", 0, -(i - 1) * W.ROW_HEIGHT)
  panel.rows[i] = r
  return r
end

-- Fills the panel with a switch for each part of the active profile, every one on.
local function fill()
  panel.parts, panel.on = ns.ProfileParts(), {}
  for i, part in ipairs(panel.parts) do
    panel.on[part] = true
    local r = partRow(i)
    r.label:SetText(partLabel(part))
    r:Show()
    r:Refresh()
  end
  for i = #panel.parts + 1, #panel.rows do panel.rows[i]:Hide() end
  panel.list:SetHeight(math.max(1, #panel.parts) * W.ROW_HEIGHT)
end

-- Turns every switch on or off.
local function setAll(on)
  for _, part in ipairs(panel.parts) do panel.on[part] = on end
  for _, r in ipairs(panel.rows) do r:Refresh() end
end

-- The parts switched on, in the panel's order.
local function ticked()
  local list = {}
  for _, part in ipairs(panel.parts) do
    if panel.on[part] then list[#list + 1] = part end
  end
  return list
end

-- Export: the panel closes and the string for the parts switched on is shown to copy; with
-- none on, the title says so instead.
local function export()
  local parts = ticked()
  if #parts == 0 then return panel.title:SetText("Switch on at least one part to export.") end
  local whole = #parts == #panel.parts
  local text = ns.ExportProfile(not whole and parts or nil)
  panel:Hide()
  ns.ShowText("Vanguard export (" .. (whole and "profile " .. ns.ProfileName() or table.concat(parts, ", ")) .. ")  Ctrl+C to copy", text)
end

-- The scrolling list the switches sit in.
local function addList(f)
  local scroll = CreateFrame("ScrollFrame", "Vanguard_ExportScroll", f, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", 12, -66)
  scroll:SetPoint("BOTTOMRIGHT", -30, 44)
  f.list = CreateFrame("Frame", nil, scroll)
  f.list:SetSize(ROW_WIDTH, 1)
  scroll:SetScrollChild(f.list)
end

-- The buttons along the foot: All and None on the left, Close and Export on the right.
local function addButtons(f)
  f.export = W.Primary(f, "Export", export, 100)
  f.export:SetPoint("BOTTOMRIGHT", -12, 12)
  f.close = W.Button(f, "Close", function() f:Hide() end, 100)
  f.close:SetPoint("RIGHT", f.export, "LEFT", -8, 0)
  f.all = W.Button(f, "All", function() setAll(true) end, 60)
  f.all:SetPoint("BOTTOMLEFT", 12, 12)
  f.none = W.Button(f, "None", function() setAll(false) end, 60)
  f.none:SetPoint("LEFT", f.all, "RIGHT", 8, 0)
end

-- Builds the panel once: its title, a line on what a partial string does, the list and the buttons.
local function build()
  panel = ns.Dialog("Vanguard_ExportDialog", WIDTH, HEIGHT)
  panel.rows = {}
  panel.note = W.Text(panel, "Everything on exports the whole profile. With some parts off, importing the string changes only those parts of the profile it goes into.")
  panel.note:SetPoint("TOPLEFT", 12, -32)
  panel.note:SetWidth(WIDTH - 24)
  addList(panel)
  addButtons(panel)
end

-- Opens the export panel with every part of the active profile switched on.
function ns.ExportDialog()
  if not panel then build() end
  panel.title:SetText(TITLE)
  fill()
  panel:Show()
end
