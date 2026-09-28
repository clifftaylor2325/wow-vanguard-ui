-- Action bar layout and visibility (UX round two). Each bar shows its own
-- number of buttons, wraps them into rows, sizes them, and is seen always,
-- on mouseover, only in combat, or never. Empty slots stay invisible unless
-- you are dragging a spell or item, so a new character sees no empty squares.
--
-- Secure frames: showing, hiding, sizing and placing bars and buttons happen
-- out of combat only (ns.OutOfCombat), and visibility is a secure state
-- driver the client runs itself, in combat too. Mouseover and empty slots
-- only change alpha, which is allowed in combat, and never animate, so
-- nothing moves when Reduce motion is on.

local ADDON, ns = ...

local AB = ns.GetModule("ActionBars")

AB.MAX_BUTTONS = 12
AB.grid = false

-- Visibility setting -> the bar's secure state driver. A mouseover bar is
-- always shown and fades with alpha instead (see AB.UpdateAlpha).
AB.VISIBILITY = {
  always = "show",
  mouseover = "show",
  combat = "[combat] show; hide",
  hidden = "hide",
}

-- Layout ------------------------------------------------------------------------------

-- Bar n's button size: its own, else the shared size older profiles set.
function AB.ButtonSize(n)
  return AB.settings.bars[n].size or AB.settings.size
end

-- Places button i in a grid of perRow columns, step px apart.
local function placeButton(b, i, perRow, step)
  b:ClearAllPoints()
  b:SetPoint("TOPLEFT", ((i - 1) % perRow) * step, -math.floor((i - 1) / perRow) * step)
end

-- Sizes a bar to fit count buttons of size px in rows of perRow.
local function sizeBar(bar, count, perRow, size)
  local gap = AB.settings.spacing
  local cols, rows = math.min(count, perRow), math.ceil(count / perRow)
  bar:SetSize(cols * (size + gap) - gap, rows * (size + gap) - gap)
end

-- Sizes and places every button; shows the first `buttons`, hides the rest.
local function layoutButtons(bar, s, size)
  for i, b in ipairs(bar.fuiButtons) do
    b:SetSize(size, size)
    placeButton(b, i, s.perRow, size + AB.settings.spacing)
    b:SetShown(i <= s.buttons)
  end
end

-- Lays bar n out from its settings right now. Only call out of combat.
function AB.LayoutBar(n)
  local bar, s = AB.bars[n], AB.settings.bars[n]
  if not bar then return end
  local size = AB.ButtonSize(n)
  layoutButtons(bar, s, size)
  sizeBar(bar, s.buttons, s.perRow, size)
end

-- Lays bar n out again after a settings change (and re-points the key
-- bindings at the buttons it now shows): now, or when combat ends.
function AB.Layout(n)
  ns.OutOfCombat(function()
    AB.LayoutBar(n)
    AB.ApplyBindings()
  end)
end

-- Visibility --------------------------------------------------------------------------

-- Bar n's visibility setting ("always" when it is unset or unknown).
function AB.Visibility(n)
  local v = AB.settings.bars[n].visibility
  return AB.VISIBILITY[v] and v or "always"
end

-- Alpha 0 for a mouseover bar the mouse isn't over, else 1. Alpha only, so
-- it is safe in combat.
function AB.UpdateAlpha(n)
  local bar = AB.bars[n]
  if not bar then return end
  local faded = AB.Visibility(n) == "mouseover" and not bar.fuiHover
  bar:SetAlpha(faded and 0 or 1)
end

-- Registers bar n's secure visibility driver and mouse watching right now.
local function visibilityNow(n)
  local bar = AB.bars[n]
  if not bar then return end
  local mode = AB.Visibility(n)
  RegisterStateDriver(bar, "visibility", AB.VISIBILITY[mode])
  bar:EnableMouse(mode == "mouseover")
  AB.UpdateAlpha(n)
end

-- Applies bar n's visibility setting: now, or when combat ends.
function AB.ApplyVisibility(n)
  ns.OutOfCombat(function() visibilityNow(n) end)
end

-- Mouseover ---------------------------------------------------------------------------

-- The mouse came over a bar or one of its buttons: show it if it fades.
local function onEnter(frame)
  local bar = frame.fuiBar or frame
  bar.fuiHover = true
  AB.UpdateAlpha(bar.fuiIndex)
end

-- The mouse left a bar or button: fade the bar unless the mouse is still
-- over it (moving between buttons crosses the bar itself).
local function onLeave(frame)
  local bar = frame.fuiBar or frame
  bar.fuiHover = bar:IsMouseOver() == true
  AB.UpdateAlpha(bar.fuiIndex)
end

-- Watches the mouse over a bar and its buttons for mouseover fading.
function AB.WatchHover(bar)
  bar:SetScript("OnEnter", onEnter)
  bar:SetScript("OnLeave", onLeave)
  for _, b in ipairs(bar.fuiButtons) do
    b:HookScript("OnEnter", onEnter)
    b:HookScript("OnLeave", onLeave)
  end
end

-- Empty slots -------------------------------------------------------------------------

-- A button is seen when it holds an action or the grid is up (while you
-- drag a spell or item). Alpha only, so paging in combat can change it.
function AB.UpdateEmpty(b)
  b:SetAlpha((b.hasAction or AB.grid) and 1 or 0)
end

-- ACTIONBAR_SHOWGRID (on) and ACTIONBAR_HIDEGRID (off): shows or hides the
-- empty slots on every button.
function AB.SetGrid(on)
  AB.grid = on
  for _, b in ipairs(AB.buttons) do
    AB.UpdateEmpty(b)
  end
end

-- Settings changes --------------------------------------------------------------------

-- Keys whose change re-lays a bar out; "visibility" re-applies its driver.
local LAYOUT_KEYS = { buttons = true, perRow = true, size = true }

-- Applies a change to bar n's setting `key` from the options (deferred in combat).
function AB.SettingChanged(n, key)
  if LAYOUT_KEYS[key] then
    AB.Layout(n)
  elseif key == "visibility" then
    AB.ApplyVisibility(n)
  end
end
