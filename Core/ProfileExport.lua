-- The export panel (/vg export pick, or Choose what to export on the Profiles page): a
-- switch for each part of the profile, all on when it opens: Layout (positions and
-- movers), Situations overrides, Global settings (theme, modules list, skins) and each
-- module with saved settings. Export shows the string to copy: with every switch on, the
-- whole profile (as /vg export); with some off, a partial string, which imports by merging
-- those parts into the profile it's imported into (Core/ProfileStrings.lua).

local ADDON, ns = ...
local L = ns.L

local T, W = ns.Theme, ns.Widgets

local WIDTH, HEIGHT = 420, 440
-- The width of a switch row, which is the list's: the panel less its insets and the thumb's gutter.
local ROW_WIDTH = WIDTH - 2 * T.SPACE.pad - T.SPACE.col
-- The width of the All and None buttons (the foot's two small ones; Cancel and Export take the standard 120).
local SMALL_BUTTON = 60
local TITLE = L["Export: what to include"]
local panel

-- What the panel calls a part: a group part's label, else the module's name.
local function partLabel(part)
  return ns.PART_LABELS[part] or part
end

-- The switch for the panel's i-th part, made once and reused as the parts change.
local function partRow(i)
  if panel.rows[i] then return panel.rows[i] end
  local r = W.Check(panel.list, "", function() return panel.on[panel.parts[i]] end, function(on) panel.on[panel.parts[i]] = on end, ROW_WIDTH)
  r:SetPoint("TOPLEFT", 0, -(i - 1) * T.ROW.height)
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
  panel.view:Fit(#panel.parts * T.ROW.height)
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
  if #parts == 0 then return panel.title:SetText(L["Switch on at least one part to export."]) end
  local whole = #parts == #panel.parts
  local text = ns.ExportProfile(not whole and parts or nil)
  panel:Hide()
  ns.ShowText(ns.ExportTitle(not whole and table.concat(parts, ", ") or nil), text)
end

-- The scrolling list the switches sit in: a dialog scroll view under the note, over the buttons, with the
-- thumb in the right pad; its content (panel.list) is as wide as a switch row.
local function addList(f)
  f.view = ns.ScrollView(f, { width = ROW_WIDTH })
  f.view:SetPoint("TOPLEFT", f.note, "BOTTOMLEFT", 0, -T.SPACE.gap)
  f.view:SetPoint("BOTTOMRIGHT", -(T.SPACE.pad + T.SPACE.col), ns.DIALOG.foot)
  f.list = f.view.child
end

-- The buttons along the foot: All and None on the left, Cancel and the Export primary on the right.
local function addButtons(f)
  f.export = W.Primary(f, L["Export"], export)
  f.export:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.pad)
  f.cancel = W.Button(f, L["Cancel"], function() f:Hide() end)
  f.cancel:SetPoint("RIGHT", f.export, "LEFT", -T.SPACE.gap, 0)
  f.all = W.Button(f, L["All"], function() setAll(true) end, SMALL_BUTTON)
  f.all:SetPoint("BOTTOMLEFT", T.SPACE.pad, T.SPACE.pad)
  f.none = W.Button(f, L["None"], function() setAll(false) end, SMALL_BUTTON)
  f.none:SetPoint("LEFT", f.all, "RIGHT", T.SPACE.gap, 0)
end

-- Builds the panel once: its title, a line on what a partial string does, the list and the buttons.
local function build()
  panel = ns.Dialog("Vanguard_ExportDialog", WIDTH, HEIGHT)
  panel.rows = {}
  panel.note = T.Text(W.Text(panel, L["Everything on exports the whole profile. With some parts off, importing the string changes only those parts of the profile it goes into."]), "small", "muted")
  panel.note:SetPoint("TOPLEFT", T.SPACE.pad, -ns.DIALOG.head)
  panel.note:SetWidth(WIDTH - 2 * T.SPACE.pad)
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
