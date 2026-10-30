-- The Click casting page's rows for the starter layouts (Modules/ClickCastPresets.lua), over the layout row: the
-- Click to heal guide (bind Target and the menu on Shift in the game's own Click Casting window first), the line that
-- says another addon does the raid frames' job, Undo for the last layout, and each better spell to use (Use it, or
-- keep what is there). The layout row's dropdown picks through CP.Pick, and the page builds itself again when
-- CP.Signature changes.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets
local L = ns.L
local CC, CP = ns.GetModule("ClickCast"), ns.ClickCastPresets
local O = ns.Options

local PAGE = "clickcast"
local BUTTON_W = 160

-- Whether the Click to heal guide shows: the player picked Click to heal before the game ran Target and the menu on
-- Shift (this session only).
local guide = { shown = false }

-- Builds the page again for rows that came or went, then re-reads every page.
local function pageChanged()
  O.RebuildPage(PAGE)
  O.Refresh()
end

-- Applies a picked starter layout to the list shown; Click to heal shows its guide first while the game won't run
-- Target and the menu where it puts them.
function CP.Pick(id)
  guide.shown = id == "heal" and not CP.HealReady()
  if not guide.shown then
    CP.Apply(id)
    T.Sound("on")
  end
  pageChanged()
end

-- The offers as one text ("BUTTON3:Flash Heal,..."), for the signature.
local function offersText()
  local out = {}
  for _, u in ipairs(CP.Upgrades()) do out[#out + 1] = u.key .. ":" .. u.to end
  return table.concat(out, ",")
end

-- What the rows below depend on, as a short text that changes when they would.
function CP.Signature()
  local blocker = CP.Blocker()
  return table.concat({ tostring(guide.shown), tostring(guide.shown and CP.HealReady()), tostring(CP.CanUndo()),
    blocker and blocker.addon or "", offersText() }, ";")
end

-- The line for another addon doing the raid frames' or click casting's job.
local function blockerText()
  local o = CP.Blocker()
  return ns.Format(L["You use {addon} for {what}. Vanguard's click casting works only on its own frames, so no starter layout is offered."], { addon = o.addon, what = o.what })
end

-- The rows that apply now, in order: the guide, the other addon's line, Undo, then one row per offer.
function CP.PageRows()
  local out = {}
  if guide.shown then out[#out + 1] = { "bindguide" } end
  if CP.Blocker() then out[#out + 1] = { "text", blockerText } end
  if CP.CanUndo() then out[#out + 1] = { "bindundo" } end
  for i in ipairs(CP.Upgrades()) do out[#out + 1] = { "bindupgrade", i } end
  return out
end

-- A wrapped text across a row's top, in a colour role.
local function rowText(r, width, colour)
  r.text = T.Text(r:CreateFontString(nil, "OVERLAY"), "label", colour)
  r.text:SetPoint("TOPLEFT", T.SPACE.gap, -T.SPACE.tight)
  r.text:SetWidth(width - 2 * T.SPACE.gap)
  r.text:SetJustifyH("LEFT")
end

-- Buttons in a line under a row's text (each label already fits its button, as on every dialog button).
local function rowButtons(r, buttons)
  local last
  for _, b in ipairs(buttons) do
    if last then b:SetPoint("LEFT", last, "RIGHT", T.SPACE.gap, 0) else b:SetPoint("TOPLEFT", r.text, "BOTTOMLEFT", 0, -T.SPACE.gap) end
    last = b
  end
end

-- A row of a text and buttons under it, as tall as they need: fill(r) sets the text and makes the buttons.
local function textAndButtons(parent, width, colour, fill)
  local r = CreateFrame("Frame", nil, parent)
  r:SetWidth(width)
  rowText(r, width, colour)
  rowButtons(r, fill(r))
  r.grownHeight = r.text:GetStringHeight() + T.BUTTON_H + 3 * T.SPACE.gap
  r:SetHeight(r.grownHeight)
  return r
end

-- Click to heal's guide ----------------------------------------------------------------------

-- The guide's words: what Click to heal does and what to bind first, then what is still to bind (or that it's done).
local function guideWords()
  local lines = { L["Click to heal puts your heals on Left and Right click, and Target and the unit menu on Shift + Left and Shift + Right click. The game runs those two only on clicks its own Click Casting window binds, so bind Target to Shift + Left click and Open menu to Shift + Right click there first."] }
  for _, b in ipairs(CP.HEAL_CLICKS) do
    if CC.WontRun(b) then lines[#lines + 1] = ns.Format(L["Still to bind in the game's window: {action} on {click}."], { action = CC.ActionText(b), click = CC.KeyName(b.key) }) end
  end
  if #lines == 1 then lines[2] = L["Both are bound in the game's window."] end
  return table.concat(lines, "\n")
end

-- Puts the heals on Left and Right (Click to heal), whatever the game's window binds, and puts the guide away.
local function healNow()
  guide.shown = false
  CP.Apply("heal")
  T.Sound("on")
  pageChanged()
end

-- Puts the guide away without changing a binding.
local function cancelGuide()
  guide.shown = false
  pageChanged()
end

-- The guide's text and buttons: open the game's window, put the heals on, cancel.
local function fillGuide(r)
  r.text:SetText(guideWords())
  r.open = W.Button(r, L["Open the game's window"], CC.OpenGameWindow, BUTTON_W + 20)
  r.heal = W.Primary(r, L["Put heals on Left and Right"], healNow, BUTTON_W + 20)
  r.accent = r.heal
  r.cancel = W.Button(r, L["Cancel"], cancelGuide, 100)
  return { r.open, r.heal, r.cancel }
end

-- Puts a row's accent button (r.accent) in the current accent again (the options window refreshes its rows after a
-- theme change).
local function refreshAccent(r)
  r.accent:Refresh()
end

-- The guide row kind: its words with the buttons under them.
local function guideBuilder(parent, _, width)
  local r = textAndButtons(parent, width, "warn", fillGuide)
  r.Refresh = refreshAccent
  return r
end

-- Undo ------------------------------------------------------------------------------------------

-- Puts back the bindings from before the last starter layout, after asking.
local function askUndo()
  ns.Ask(L["Put back the click-casting bindings you had before this starter layout? Changes made since are lost."], L["Undo"], function()
    CP.Undo()
    pageChanged()
  end, nil, "danger")
end

-- The Undo row's text (the layout the list was made from) and its button.
local function fillUndo(r)
  r.text:SetText(ns.Format(L["Starter layout applied: {layout}."], { layout = CP.Applied().label }))
  r.undo = W.Button(r, L["Undo"], askUndo, 100)
  return { r.undo }
end

-- The Undo row kind.
local function undoBuilder(parent, _, width)
  return textAndButtons(parent, width, "text2", fillUndo)
end

-- Better spells -------------------------------------------------------------------------------

-- An offer's words: the click and the spell it could cast, and what it casts now, if anything.
local function offerWords(u)
  local words = { click = CC.KeyName(u.key), spell = u.to, old = u.from }
  return ns.Format(u.from and L["{click} could cast {spell} instead of {old}."] or L["{click} could cast {spell}."], words)
end

-- Runs an offer's answer (Use it or Keep as it is), then builds the page again.
local function answer(fn, u)
  fn(u)
  pageChanged()
end

-- An offer row's text and buttons: Use the spell (in the accent), or keep what is there.
local function fillOffer(r, u)
  r.text:SetText(offerWords(u))
  r.use = W.Primary(r, ns.Format(L["Use {spell}"], { spell = u.to }), function() answer(CP.Use, u) end, BUTTON_W)
  r.accent = r.use
  r.keep = W.Button(r, L["Keep as it is"], function() answer(CP.Keep, u) end, BUTTON_W)
  return { r.use, r.keep }
end

-- The offer row kind: { "bindupgrade", i } shows the i-th offer.
local function offerBuilder(parent, row, width)
  local u = CP.Upgrades()[row[2]]
  local r = textAndButtons(parent, width, "text2", function(f) return fillOffer(f, u) end)
  r.Refresh = refreshAccent
  return r
end

O.AddRowKind("bindguide", guideBuilder, 2 * T.BUTTON_H, true)
O.AddRowKind("bindundo", undoBuilder, 2 * T.BUTTON_H, true)
O.AddRowKind("bindupgrade", offerBuilder, 2 * T.BUTTON_H, true)
