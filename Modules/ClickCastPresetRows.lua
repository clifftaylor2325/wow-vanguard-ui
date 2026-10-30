-- The Click casting page's rows for the starter layouts (Modules/ClickCastPresets.lua), over the layout row: the
-- guide shown when a picked layout puts Target or the menu on a click the game's own Click Casting window doesn't bind
-- (Click to heal's Shift clicks, or plain Left and Right moved there), the line that says another addon does the raid
-- frames' job, Undo, and each better spell to use (Use it, or keep what is there). The layout row's dropdown picks
-- through CP.Pick, and the page builds itself again when CP.Signature changes.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets
local L = ns.L
local CC, CP = ns.GetModule("ClickCast"), ns.ClickCastPresets
local O = ns.Options

local PAGE = "clickcast"
local BUTTON_W = 160

-- The layout the guide is for and the list it was picked on (id nil while it doesn't show): the player picked it while
-- the game wouldn't run its Target or menu click (this session only; another talent group's list doesn't show it).
local guide = { id = nil, key = nil }

-- Builds the page again for rows that came or went, then re-reads every page.
local function pageChanged()
  O.RebuildPage(PAGE)
  O.Refresh()
end

-- Whether the guide shows on the list the page shows now.
local function guideShown()
  return guide.id ~= nil and guide.key == CC.CurrentKey()
end

-- Runs fn now, or after asking when the list shown has mouse bindings a layout didn't make (CP.HasOwnClicks).
local function unlessOwn(fn)
  if not CP.HasOwnClicks() then return fn() end
  ns.Ask(L["Replace your own click-casting mouse bindings with this starter layout? Undo puts them back."], L["Replace"], fn, nil, "danger")
end

-- Applies a layout now, puts the guide away and builds the page again.
local function applyNow(id)
  guide.id = nil
  CP.Apply(id)
  T.Sound("on")
  pageChanged()
end

-- Applies a picked starter layout to the list shown, asking first when it would replace mouse bindings of the
-- player's own; or, while the game won't run its Target or menu click, shows its guide first (for this list), whose
-- button applies it the same way.
function CP.Pick(id)
  if #CP.Unbound(id) == 0 then return unlessOwn(function() applyNow(id) end) end
  guide.id, guide.key = id, CC.CurrentKey()
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
  return table.concat({ guideShown() and guide.id or "", guideShown() and #CP.Unbound(guide.id) or 0, tostring(CP.CanUndo()),
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
  if guideShown() then out[#out + 1] = { "bindguide" } end
  if CP.Blocker() then out[#out + 1] = { "text", blockerText } end
  if CP.CanUndo() then out[#out + 1] = { "bindundo" } end
  for _, u in ipairs(CP.Upgrades()) do out[#out + 1] = { "bindupgrade", u } end
  return out
end

-- A wrapped text across a row's top, in a colour role.
local function rowText(r, width, colour)
  r.text = T.Text(r:CreateFontString(nil, "OVERLAY"), "label", colour)
  r.text:SetPoint("TOPLEFT", T.SPACE.gap, -T.SPACE.tight)
  r.text:SetWidth(width - 2 * T.SPACE.gap)
  r.text:SetJustifyH("LEFT")
end

-- Buttons in a line under a row's text (each label shrinks to fit its button, as on every dialog button).
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

-- The guide -----------------------------------------------------------------------------------

-- What the guide says first, by layout: Click to heal's, or the plain clicks' for any other.
local GUIDE_LEADS = {
  heal = L["Click to heal puts your heals on Left and Right click, and Target and the unit menu on Shift + Left and Shift + Right click. The game runs those two only on clicks its own Click Casting window binds."],
  other = L["This layout puts Target on Left click and the unit menu on Right click, and the game runs those two only on clicks its own Click Casting window binds."],
}

-- The guide's words: what the layout does with Target and the menu, then what is still to bind in the game's window
-- and that those clicks do nothing until then (or that both are bound).
local function guideWords()
  local lines = { GUIDE_LEADS[guide.id] or GUIDE_LEADS.other }
  for _, b in ipairs(CP.Unbound(guide.id)) do
    local words = b.unsure and L["Vanguard can't read what the game's window binds to {click}: check that it is {action}."] or L["Still to bind in the game's window: {action} on {click}."]
    lines[#lines + 1] = ns.Format(words, { action = CP.GAME_NAMES[b.action], click = CC.KeyName(b.key) })
  end
  lines[#lines + 1] = #lines == 1 and L["Both are bound in the game's window."] or L["Put on now, the clicks still to bind do nothing until you bind them there."]
  return table.concat(lines, "\n")
end

-- Puts the guide away without changing a binding.
local function cancelGuide()
  guide.id = nil
  pageChanged()
end

-- The guide's text and buttons: open the game's window, put the layout on (whatever the game's window binds), cancel.
local function fillGuide(r)
  r.text:SetText(guideWords())
  r.open = W.Button(r, L["Open the game's window"], CC.OpenGameWindow, BUTTON_W + 20)
  local label = guide.id == "heal" and L["Put heals on Left and Right"] or L["Put the layout on"]
  local id = guide.id
  r.apply = W.Primary(r, label, function() unlessOwn(function() applyNow(id) end) end, BUTTON_W + 20)
  r.accent = r.apply
  r.cancel = W.Button(r, L["Cancel"], cancelGuide, 100)
  return { r.open, r.apply, r.cancel }
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
  ns.Ask(L["Put back the click-casting bindings you had before the starter layouts? Changes made since are lost."], L["Undo"], function()
    local _, why = CP.Undo()
    if why then ns.Chat(ns.Format(L["Can't undo: {why}."], { why = why })) end
    pageChanged()
  end, nil, "danger")
end

-- The Undo row's text (the layout the list was made from) and its button.
local function fillUndo(r)
  r.text:SetText(ns.Format(L["These bindings came from the starter layout “{layout}”."], { layout = CP.Applied().label }))
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

-- The offer row kind: { "bindupgrade", offer } shows that offer (CP.Upgrades' entry).
local function offerBuilder(parent, row, width)
  local u = row[2]
  local r = textAndButtons(parent, width, "text2", function(f) return fillOffer(f, u) end)
  r.Refresh = refreshAccent
  return r
end

O.AddRowKind("bindguide", guideBuilder, 2 * T.BUTTON_H, true)
O.AddRowKind("bindundo", undoBuilder, 2 * T.BUTTON_H, true)
O.AddRowKind("bindupgrade", offerBuilder, 2 * T.BUTTON_H, true)
