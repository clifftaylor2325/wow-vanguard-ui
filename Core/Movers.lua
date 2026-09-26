-- Movers: every ForeverUI frame that can be placed registers here. /fui
-- unlock shows a labeled handle over each; drag one and the frame follows
-- (protected frames after combat). Positions are saved per profile.

local ADDON, ns = ...

local T = ns.Theme

local movers, order = {}, {}
local unlocked = false

-- Saved positions in the active profile: key -> { point, relPoint, x, y }.
local function saved()
  return ns.Settings("positions")
end

-- The point to use for a mover: saved, else its default.
local function pointFor(m)
  local p = saved()[m.key]
  if type(p) == "table" and p.point then
    return p.point, p.relPoint or p.point, p.x or 0, p.y or 0
  end
  return m.default[1], m.default[2], m.default[3], m.default[4]
end

-- Anchors a frame (or a mover handle) at the mover's point on UIParent.
local function anchor(frame, m)
  local point, relPoint, x, y = pointFor(m)
  frame:ClearAllPoints()
  frame:SetPoint(point, UIParent, relPoint, x, y)
end

-- Puts a mover's frame at its point; protected frames wait for combat to end.
local function place(m)
  ns.OutOfCombat(function() anchor(m.frame, m) end)
end

-- Registers a placeable frame. default = { point, relPoint, x, y } on UIParent.
function ns.Mover(frame, key, label, default)
  local m = { frame = frame, key = key, label = label or key, default = default }
  if not movers[key] then
    order[#order + 1] = key
  end
  movers[key] = m
  place(m)
  return m
end

-- Handles ------------------------------------------------------------------------

-- Saves where a handle was dropped and moves its frame there.
local function onDragStop(handle)
  handle:StopMovingOrSizing()
  local point, _, relPoint, x, y = handle:GetPoint(1)
  if point then
    saved()[handle.mover.key] = { point = point, relPoint = relPoint, x = x, y = y }
    place(handle.mover)
  end
end

-- Builds the draggable handle for a mover: accent-bordered panel with its label.
local function createHandle(m)
  local h = CreateFrame("Frame", nil, UIParent)
  h.mover = m
  h:SetFrameStrata("DIALOG")
  h:SetMovable(true)
  h:SetClampedToScreen(true)
  h:EnableMouse(true)
  h:RegisterForDrag("LeftButton")
  h:SetScript("OnDragStart", h.StartMoving)
  h:SetScript("OnDragStop", onDragStop)
  return h
end

-- Adds the handle's label in the theme font.
local function addLabel(h, text)
  h.label = h:CreateFontString(nil, "OVERLAY")
  h.label:SetPoint("CENTER")
  T.SetFont(h.label, 11)
  h.label:SetText(text)
end

-- The handle for a mover, created on first use; sized and placed over its frame.
local function handleFor(m)
  if not m.handle then
    m.handle = T.Panel(createHandle(m), { accent = true })
    addLabel(m.handle, m.label)
  end
  local f = m.frame
  m.handle:SetScale(f:GetScale() or 1)
  m.handle:SetSize(math.max(f:GetWidth() or 0, 40), math.max(f:GetHeight() or 0, 20))
  anchor(m.handle, m)
  return m.handle
end

-- Lock / unlock -----------------------------------------------------------------------

-- Shows every handle. Refused in combat (frames can't follow until it ends).
function ns.Unlock()
  if ns.InCombat() then
    return false
  end
  unlocked = true
  for _, key in ipairs(order) do
    handleFor(movers[key]):Show()
  end
  return true
end

-- Hides every handle.
function ns.Lock()
  unlocked = false
  for _, m in pairs(movers) do
    if m.handle then
      m.handle:Hide()
    end
  end
end

-- True while the handles are showing.
function ns.Unlocked()
  return unlocked
end

-- Forgets a saved position (or all with "all") and puts frames back. Returns how many.
function ns.ResetMovers(key)
  local n = 0
  for _, k in ipairs(order) do
    if key == "all" or key == k then
      saved()[k] = nil
      place(movers[k])
      n = n + 1
    end
  end
  return n
end

-- Mover keys and labels, in registration order.
function ns.MoverList()
  local out = {}
  for i, key in ipairs(order) do
    out[i] = { key = key, label = movers[key].label }
  end
  return out
end

-- Entering combat locks: dragging can't move protected frames mid-fight.
ns.On("PLAYER_REGEN_DISABLED", function()
  if unlocked then
    ns.Lock()
    ns.Chat("Locked for combat. /fui unlock again afterwards.")
  end
end)
