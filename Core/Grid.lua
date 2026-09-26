-- The unlock-mode grid: thin lines every `size` pixels across the screen,
-- with the center lines in the accent color. Built on first show; changing
-- the size reuses the line textures.

local ADDON, ns = ...

local T = ns.Theme

local grid
local lines = {}

-- The full-screen frame the lines are drawn on (behind the mover handles).
local function gridFrame()
  if not grid then
    grid = CreateFrame("Frame", nil, UIParent)
    grid:SetAllPoints(UIParent)
    grid:SetFrameStrata("BACKGROUND")
  end
  return grid
end

-- The i-th line texture, created on first use.
local function line(i)
  if not lines[i] then
    lines[i] = gridFrame():CreateTexture(nil, "BACKGROUND")
    lines[i]:SetTexture(T.WHITE)
  end
  return lines[i]
end

-- Places line i: vertical at x (from center) or horizontal at y; accent for the center.
local function place(i, vertical, offset)
  local t = line(i)
  t:ClearAllPoints()
  t:SetSize(vertical and 1 or UIParent:GetWidth(), vertical and UIParent:GetHeight() or 1)
  t:SetPoint("CENTER", grid, "CENTER", vertical and offset or 0, vertical and 0 or offset)
  if offset == 0 then t:SetVertexColor(T.Accent()) else t:SetVertexColor(1, 1, 1, 0.12) end
  t:Show()
  return i + 1
end

-- Lines out from the center every `size` pixels up to `half`, both directions.
local function placeAxis(i, vertical, size, half)
  i = place(i, vertical, 0)
  for offset = size, half, size do
    i = place(place(i, vertical, offset), vertical, -offset)
  end
  return i
end

-- Shows the grid with lines every `size` pixels.
function ns.ShowGrid(size)
  local f = gridFrame()
  local i = placeAxis(1, true, size, (UIParent:GetWidth() or 0) / 2)
  i = placeAxis(i, false, size, (UIParent:GetHeight() or 0) / 2)
  for j = i, #lines do
    lines[j]:Hide()
  end
  f:Show()
end

-- Hides the grid.
function ns.HideGrid()
  if grid then
    grid:Hide()
  end
end

-- How many grid lines are showing (for tests and /fui status).
function ns.GridLineCount()
  local n = 0
  for _, t in ipairs(lines) do
    n = n + (t:IsShown() and 1 or 0)
  end
  return grid and grid:IsShown() and n or 0
end
