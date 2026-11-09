-- The fold on the options window's cards (/vg): a card with rows marked essential shows those, then a "More settings"
-- line with the count of the rest, which opens below it and stays open for this character until it is folded again.
-- The tier rule and the reasons are in docs/design/SETTINGS-SIMPLIFICATION.md (D1). Core/OptionsWindow.lua builds the
-- cards and calls in here; a card with no essential row, or with only essential rows, has no fold.

local ADDON, ns = ...

local L = ns.L

local T, W, O = ns.Theme, ns.Widgets, ns.Options

local Fold = {}
O.Fold = Fold

-- The cards this character opened, by page and card title (true), kept in its saved variables so a card stays open
-- across a reload and the next login.
local function opened()
  VanguardCharDB.openFolds = VanguardCharDB.openFolds or {}
  return VanguardCharDB.openFolds
end

-- Marks a row as essential: it stays in view when its card is folded. Returns the row.
function O.Essential(row)
  row.essential = true
  return row
end

-- Whether a row is shown when the card is folded: an essential row, or a text row (a note) under one. A text row takes
-- the tier of the row above it, so a note stays with its setting.
local function essentialTier(row, above)
  if row[1] == "text" and above ~= nil then return above end
  return row.essential == true
end

-- Splits a card's rows in the shown ones and the folded ones (rows keep their order within each). A card with no
-- essential row, or with nothing to fold, returns its rows whole and nil.
function Fold.Split(rows)
  local shown, folded, tier = {}, {}, nil
  for _, row in ipairs(rows) do
    tier = essentialTier(row, tier)
    table.insert(tier and shown or folded, row)
  end
  if #shown == 0 or #folded == 0 then return rows, nil end
  return shown, folded
end

-- Gives every card of a page's card list its shown rows (card.shown) and the rows folded away (card.folded, or nil).
function Fold.Partition(cards)
  for _, card in ipairs(cards) do
    card.shown, card.folded = Fold.Split(card.rows)
  end
end

-- A card's key in the list of opened ones: its page and its title.
local function keyOf(card)
  return card.child.pageKey .. "\n" .. (card.foldTitle or "")
end

-- Whether a card's fold is open now.
function Fold.IsOpen(card)
  return opened()[keyOf(card)] == true
end

-- Whether any folded row of the card differs from its default (the dot on the fold line).
local function foldedChanged(card)
  for _, w in ipairs(card.foldRows) do
    if w.source and O.RowChanged(w.source) then return true end
  end
  return false
end

-- Shows the accent dot on the fold line while a folded row is changed, in the current accent.
function Fold.Refresh(card)
  card.fold.changed:SetShown(foldedChanged(card))
  T.Tint(card.fold.changed, "accent")
end

-- Shows or hides the folded rows, and sets the card's height to match (the card's span holds both heights).
function Fold.Apply(card)
  local open = Fold.IsOpen(card)
  for _, w in ipairs(card.foldRows) do w:SetShown(open) end
  card.height = (open and card.span.open or card.span.closed) + T.SPACE.gap
end

-- Opens or folds a card, then lets the window fit the new height (card.refit).
function Fold.SetOpen(card, open)
  opened()[keyOf(card)] = open or nil
  card.fold:SetCollapsed(not open)
  Fold.Apply(card)
  card.refit(card)
end

-- The dot on the fold line, at its right end.
local function addDot(line)
  line.changed = O.ChangedDot(line)
  line.changed:SetPoint("RIGHT", -T.SPACE.tight, 0)
end

-- The fold line's header options: collapsible, the count of folded rows, and a press that opens or folds the card.
local function foldOptions(card, count)
  return { collapsible = true, count = tostring(count), onToggle = function(collapsed) Fold.SetOpen(card, not collapsed) end }
end

-- The fold line: a collapsible section header, "More settings" and the count, across the card at y (units from its
-- top) with the card's inset each side. Returns it and the y below it, where the folded rows start.
function Fold.Line(card, spec, y)
  local at = y + T.SPACE.gap
  card.foldTitle = spec.title
  local line = W.SectionHeader(card, L["More settings"], foldOptions(card, #spec.folded))
  line:SetPoint("TOPLEFT", card, "TOPLEFT", T.SPACE.col, -at)
  line:SetPoint("RIGHT", card, "RIGHT", -T.SPACE.col, 0)
  addDot(line)
  return line, at + line:GetHeight() + T.SPACE.gap
end

-- Takes the folded rows' widgets (the list is theirs now) and the two heights of the card (rows' bottom edge, folded and
-- open); the rows show as the card was left. The window calls this once the rows are built.
function Fold.Adopt(card, line, rows, span)
  card.fold, card.foldRows, card.span = line, rows, span
  for _, w in ipairs(rows) do w.folded = true end
  line:SetCollapsed(not Fold.IsOpen(card))
  Fold.Apply(card)
  Fold.Refresh(card)
end

-- Opens the fold that holds row w, if it is in one: the caller wants to show it (a search hit, a link).
function Fold.Reveal(w)
  if w.folded and not Fold.IsOpen(w.card) then Fold.SetOpen(w.card, true) end
end
