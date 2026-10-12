-- Action bar layout and visibility (UX round two). Each bar shows its own
-- number of buttons, wraps them into rows, sizes them, and is seen always,
-- on mouseover, only in combat, never, or while any condition of a checklist
-- holds (Core/Visibility.lua). Empty slots stay invisible unless
-- you are dragging a spell or item, so a new character sees no empty squares,
-- and they take no mouse, so blank bar space doesn't eat clicks.
-- While you drag, bars that fade on mouseover are revealed and bars shown on
-- conditions (In combat, a checklist) are shown (the latter only when the drag
-- starts out of combat), so every bar you can drop onto is visible. A Hidden
-- bar is not drawn but its keys still cast.
--
-- Secure frames: showing, hiding, sizing and placing bars and buttons happen
-- out of combat only (ns.OutOfCombat), and visibility is a secure state
-- driver the client runs itself, in combat too. Mouseover and empty slots
-- only change alpha, which is allowed in combat, and never animate, so
-- nothing moves when Reduce motion is on. An empty slot's mouse is the one
-- secure change on that path, and waits for combat to end.

local ADDON, ns = ...

local AB = ns.GetModule("ActionBars")
local T, V = ns.Theme, ns.Visibility

AB.MAX_BUTTONS = 12
-- True while you drag a spell or item (ACTIONBAR_SHOWGRID until HIDEGRID).
AB.grid = false
-- True while In combat bars are shown for a drag that started out of combat.
AB.dragShown = false

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

-- Sizes a bar to fit count buttons of size px, gap apart, in rows of perRow.
local function sizeBar(bar, count, perRow, size, gap)
  local cols, rows = math.min(count, perRow), math.ceil(count / perRow)
  bar:SetSize(cols * (size + gap) - gap, rows * (size + gap) - gap)
end

-- Sizes and places every button, gap apart; shows the first `buttons`, hides the rest.
local function layoutButtons(bar, s, size, gap)
  for i, b in ipairs(bar.vgButtons) do
    b:SetSize(size, size)
    placeButton(b, i, s.perRow, size + gap)
    b:SetShown(i <= s.buttons)
  end
end

-- Lays bar n out from its settings right now, its button size and gap rounded to whole
-- screen pixels at the bar's scale, so every button edge lands on a pixel. Only call out of combat.
function AB.LayoutBar(n)
  local bar, s = AB.bars[n], AB.settings.bars[n]
  if not bar then return end
  local size, gap = T.PixelRound(bar, AB.ButtonSize(n)), T.PixelRound(bar, AB.settings.spacing)
  layoutButtons(bar, s, size, gap)
  sizeBar(bar, s.buttons, s.perRow, size, gap)
end

-- Lays every built bar out again after a scale change (T.OnScale runs it out of combat).
local function relayoutAll()
  for n in pairs(AB.bars) do AB.LayoutBar(n) end
end
T.OnScale(relayoutAll)

-- Lays bar n out again after a settings change, re-stacks the bottom bars
-- (bar 1 stays on top) and re-points the key bindings at the buttons it now
-- shows: now, or when combat ends.
function AB.Layout(n)
  ns.OutOfCombat(function()
    AB.LayoutBar(n)
    AB.Restack()
    AB.ApplyBindings()
  end)
end

-- Visibility --------------------------------------------------------------------------

-- Bar n's visibility setting ("always" when it is unset or unknown).
function AB.Visibility(n)
  return V.Mode(AB.settings.bars[n].visibility)
end

-- Bar n's own secure visibility driver, from its setting and checklist.
function AB.OwnDriver(n)
  return V.Driver(V.State(AB.Visibility(n), AB.settings.bars[n].showWhen))
end

-- Alpha 0 for a bar that fades on mouseover while the mouse isn't over it
-- (unless you are dragging a spell or item), else 1. Alpha only, so it is safe in combat.
function AB.UpdateAlpha(n)
  local bar = AB.bars[n]
  if not bar then return end
  bar.vgReveal = AB.grid
  bar:SetAlpha(V.Alpha(bar))
end

-- Bar n's state driver: its own, or "show" for a bar shown on conditions
-- while a drag that started out of combat is under way.
function AB.Driver(n)
  local own = AB.OwnDriver(n)
  if AB.dragShown and V.Conditional(own) then return "show" end
  return own
end

-- Registers bar n's secure visibility driver, its state and mouse watching right now.
local function visibilityNow(n)
  local bar = AB.bars[n]
  if not bar then return end
  RegisterStateDriver(bar, "visibility", AB.Driver(n))
  V.ApplyNow(bar, AB.Visibility(n), AB.settings.bars[n].showWhen)
  bar:EnableMouse(V.Fades(bar))
  AB.UpdateAlpha(n)
end

-- Re-registers the visibility driver of every bar shown on conditions right now (out of combat only).
local function conditionalBarsNow()
  for n, bar in pairs(AB.bars) do
    if V.Conditional(AB.OwnDriver(n)) then RegisterStateDriver(bar, "visibility", AB.Driver(n)) end
  end
end

-- Applies bar n's visibility setting: now, or when combat ends (also on every
-- zone change while it checks In an instance).
function AB.ApplyVisibility(n)
  local bar = AB.bars[n]
  if bar then V.Track(bar, function() visibilityNow(n) end) end
  ns.OutOfCombat(function() visibilityNow(n) end)
end

-- Mouseover ---------------------------------------------------------------------------

-- The mouse came over a bar or one of its buttons: show it if it fades.
local function onEnter(frame)
  local bar = frame.vgBar or frame
  bar.vgHover = true
  AB.UpdateAlpha(bar.vgIndex)
end

-- The mouse left a bar or button: fade the bar unless the mouse is still
-- over it (moving between buttons crosses the bar itself).
local function onLeave(frame)
  local bar = frame.vgBar or frame
  bar.vgHover = bar:IsMouseOver() == true
  AB.UpdateAlpha(bar.vgIndex)
end

-- Watches the mouse over a bar and its buttons for mouseover fading.
function AB.WatchHover(bar)
  bar:SetScript("OnEnter", onEnter)
  bar:SetScript("OnLeave", onLeave)
  for _, b in ipairs(bar.vgButtons) do
    b:HookScript("OnEnter", onEnter)
    b:HookScript("OnLeave", onLeave)
  end
end

-- Empty slots -------------------------------------------------------------------------

-- A button is seen when it holds an action or the grid is up (while you
-- drag a spell or item). Seen changes its alpha, which paging in combat can
-- do, and takes the mouse, which a blank slot doesn't, so a click or a
-- right-drag camera turn over blank bar space reaches the world. The mouse is
-- a secure change: out of combat only, the latest state kept (one entry per button).
function AB.UpdateEmpty(b)
  local seen = (b.hasAction or AB.grid) and true or false
  b:SetAlpha(seen and 1 or 0)
  if b.vgSeen == seen then return end
  b.vgSeen = seen
  ns.OutOfCombat(function() b:EnableMouse(seen) end, b)
end

-- A drag started: out of combat, bars shown on conditions show (through the
-- out-of-combat path). A drag that starts in combat leaves secure
-- visibility alone.
local function showCombatBars()
  if ns.InCombat() then return end
  AB.dragShown = true
  ns.OutOfCombat(conditionalBarsNow)
end

-- The drag ended: bars shown for it get their own driver back
-- (after combat if it started meanwhile). Otherwise nothing secure changes.
local function restoreCombatBars()
  if not AB.dragShown then return end
  AB.dragShown = false
  ns.OutOfCombat(conditionalBarsNow)
end

-- Re-reads whether the mouse is over each bar and repaints its alpha, so a
-- mouseover bar revealed for a drag stays shown only if the mouse is on it.
local function refreshBarAlpha()
  for n, bar in pairs(AB.bars) do
    bar.vgHover = bar:IsMouseOver() == true
    AB.UpdateAlpha(n)
  end
end

-- ACTIONBAR_SHOWGRID (on) and ACTIONBAR_HIDEGRID (off): shows or hides the
-- empty slots and reveals or restores the mouseover and In combat bars.
function AB.SetGrid(on)
  AB.grid = on
  for _, b in ipairs(AB.buttons) do
    AB.UpdateEmpty(b)
  end
  refreshBarAlpha()
  if on then showCombatBars() else restoreCombatBars() end
end

-- Settings changes --------------------------------------------------------------------

-- Keys whose change re-lays a bar out; "visibility" (and its checklist) re-applies its driver.
local LAYOUT_KEYS = { buttons = true, perRow = true, size = true }

-- Applies a change to bar n's setting `key` from the options (deferred in combat).
function AB.SettingChanged(n, key)
  if LAYOUT_KEYS[key] then
    AB.Layout(n)
  elseif key == "visibility" or key == "showWhen" then
    AB.ApplyVisibility(n)
  end
end
