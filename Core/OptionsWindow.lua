-- The options window: a header bar (logo, search, profile, close), icon
-- navigation on the left (a dot marks pages with changed settings), the
-- current page as cards of setting rows (it scrolls when long), and a footer
-- that says when a reload is needed. Up and Down walk the pages, Tab and
-- Shift-Tab the rows, Enter or Space presses the row. Pages and their rows
-- come from Core/Options.lua, its area files and modules' own pages.

local ADDON, ns = ...

local L = ns.L

local T, W, O = ns.Theme, ns.Widgets, ns.Options

local WIDTH, HEIGHT, NAV_WIDTH = 780, 600, 176

-- How tall the window opens on a big screen: this share of the screen's height (never under HEIGHT), and at least
-- this much of the screen left free.
local FIT = { share = 0.75, margin = 50 }
-- The header bar is centred on the title line (T.CONTROL.inset down, where every window's title and close button sit);
-- the footer bar holds a standalone button (T.BUTTON_H) with air above and below.
local HEAD, FOOT = 2 * T.CONTROL.inset, T.BUTTON_H + 14
-- The logo beside the title, a nav icon, and the dot that marks a page or a row with a changed setting (units);
-- and how far the nav dims a page the search misses.
local LOGO, NAV_ICON, DOT, DIM = 28, 16, 4, 0.35
-- Right of a page: its scroll thumb sits T.SPACE.col out from the view (ns.ScrollView) and T.SPACE.col in from the window's edge.
local VIEW_RIGHT = 2 * T.SPACE.col
-- A card's width (the page is T.SPACE.col in from the nav), its inset (T.SPACE.col: a card inside a window) and its
-- inside width (what a card title or a note spans, the inset kept on both sides).
local CARD_WIDTH, PAD = WIDTH - NAV_WIDTH - T.SPACE.col - VIEW_RIGHT, T.SPACE.col
local INNER = CARD_WIDTH - 2 * PAD
-- The air above and below a wrapped caption or note; a text line's height; how far above a found row a jump scrolls
-- (the card's title and a little air).
local AIR, LINE, JUMP_ABOVE = 6, 20, 40
-- Height of each row kind (Core/OptionsPreview.lua and modules add theirs with O.AddRowKind): a check, cycle or
-- slider row is a list row (T.ROW.height); a button row has a standalone button (T.BUTTON_H) with 3 units of air
-- each side; a module row two lines.
local ROW_HEIGHT = { check = T.ROW.height, cycle = T.ROW.height, slider = T.ROW.height, button = T.BUTTON_H + 6, text = LINE, module = 54 }
-- Row kinds laid out edge to edge in a card (the rest are indented).
local FULL_WIDTH = { check = true, cycle = true, slider = true, swatches = true, module = true }
-- Where a row kind keeps its setter; the setting's default, if the row has one, comes right after it.
local SETTER_AT = { check = 4, cycle = 5, slider = 5 }

local window
local pages, widgets = {}, {}
-- Each page's rows as the search reads them, kept while the window is open (O.RebuildPage drops a page's).
local rowCache = {}
local needsReload = false
-- What the footer's notice says while a change waits for the reload (O.ProfileReplaced words it more strongly).
local reloadNotice = L["Some changes need a reload"]
-- True while every row is being refreshed at once (the nav's dots are marked once after).
local quiet = false

-- Rows ---------------------------------------------------------------------------------------

-- Under a module's name, what the module does, in small muted text.
local function addDescription(r, text, width)
  r.desc = T.Text(r:CreateFontString(nil, "OVERLAY"), "small", "muted")
  r.desc:SetPoint("TOPLEFT", r.label, "BOTTOMLEFT", 0, -T.SPACE.tight)
  r.desc:SetJustifyH("LEFT")
  r.desc:SetWidth(width - 62)
  r.desc:SetText(text)
end

-- Places the own-switch note just after the row's reload tag (dressRow adds it once the row is built), or just after
-- the name as it measures now (a font change moves it) while there is no tag yet.
local function placeOwnSwitch(r)
  if r.tag then r.ownSwitch:SetPoint("LEFT", r.tag, "RIGHT", T.SPACE.gap, 0) return end
  r.ownSwitch:SetPoint("LEFT", r.label, "LEFT", r.label:GetStringWidth() + T.SPACE.gap, 0)
end

-- Beside a module's name, a quiet note while the module is on but its own switch inside is off (O.OwnSwitchNote).
local function addOwnSwitchNote(r, name)
  if not O.MODULE_LINKS[name] then return end
  r.ownSwitch = T.Text(r:CreateFontString(nil, "OVERLAY"), "small", "muted")
  local refresh = r.Refresh
  -- The switch's own refresh, then the note, read again each time (the own switch is on another page), placed after
  -- the name and its tag.
  r.Refresh = function(self)
    refresh(self)
    self.ownSwitch:SetText(O.OwnSwitchNote(name) or "")
    placeOwnSwitch(self)
  end
  r:Refresh()
end

-- A module's switch: its name (and the own-switch note), and under it what the module does.
local function moduleRow(parent, row, width)
  local r = W.Check(parent, row[2], row[3], row[4], width)
  r:SetHeight(ROW_HEIGHT.module)
  r.label:ClearAllPoints()
  r.label:SetPoint("TOPLEFT", T.SPACE.gap, -AIR)
  addDescription(r, row[6], width)
  addOwnSwitchNote(r, row[7])
  return r
end

-- Disables a button row (the themed button's disabled look) while its enabled() says false.
local function followEnabled(b)
  if b.enabled() == true then b:Enable() else b:Disable() end
end

-- A button row's button width (units) unless a label in its card needs more, and the air a label keeps each side.
local BUTTON = { width = 220, air = 12 }

-- The width a button's label takes as drawn (it follows the font and the text size), with its air each side.
local function labelNeed(b)
  return math.ceil(T.FullWidth(b.text)) + 2 * BUTTON.air
end

-- Gives every button row in a card one width: BUTTON.width, or what its widest label needs, never past the card's
-- inside width. Each label is fitted to its button (T.FitText), so one too long even for that shrinks, then is cut short.
local function fitCardButtons(card)
  local width = BUTTON.width
  for _, b in ipairs(card.buttons) do width = math.max(width, labelNeed(b)) end
  width = math.min(width, INNER)
  for _, b in ipairs(card.buttons) do
    b:SetWidth(width)
    T.Refit(b.text)
  end
end

-- A button row's refresh: the card's buttons fit their labels again, then the row follows its enabled() (if any),
-- read again each time.
local function refitButton(b)
  fitCardButtons(b.card)
  if b.enabled then followEnabled(b) end
end

-- A button row: { "button", label, onClick, enabled }; enabled (optional) disables it while it says false. Its card
-- keeps its buttons, which share one width that fits their labels (each new one fits them all again).
local function buttonRow(c, r)
  local b = W.Button(c, r[2], r[3], BUTTON.width)
  T.FitText(b.text, b, BUTTON.air)
  b.card, b.enabled, b.Refresh = c, r[4], refitButton
  c.buttons = c.buttons or {}
  c.buttons[#c.buttons + 1] = b
  b:Refresh()
  return b
end

-- A text row { "text", words, tier }: a line in label text2 (a status line), or with tier "note" a note in
-- small muted under the row it explains; it wraps to the card's inside width, as far from the right edge as it
-- starts from the left (its row grows to fit; see rowHeight).
local function textRow(c, r)
  local fs = W.Text(c, r[2])
  if r[3] == "note" then T.Text(fs, "small", "muted") end
  fs:SetWidth(INNER)
  return fs
end

-- Row kind -> builder(parent, row, width) returning the widget.
local BUILDERS = {
  -- One builder per row kind; each returns the widget it made.
  -- Header rows are card titles (groupRows), not widgets.
  text = textRow,
  check = function(c, r, w) return W.Check(c, r[2], r[3], r[4], w) end,
  button = buttonRow,
  cycle = function(c, r, w) return W.Choice(c, r[2], r[3], r[4], r[5], w) end,
  slider = function(c, r, w) return W.Slider(c, r[2], r[3], r[4], r[5], w) end,
  module = moduleRow,
}

-- Adds a row kind: builder(parent, row, width) returns the widget; height is its row height.
function O.AddRowKind(kind, builder, height)
  BUILDERS[kind] = builder
  ROW_HEIGHT[kind] = height
end

-- Changed from the default ------------------------------------------------------------------

-- The reset dot's tooltip, where the client has one: what a click does, then the default in the row's words.
local function dotTooltip(d)
  if not GameTooltip then return end
  GameTooltip:SetOwner(d, "ANCHOR_RIGHT")
  GameTooltip:SetText(L["Changed from the default. Click to put it back."])
  GameTooltip:AddLine(ns.Format(L["Default: {value}"], { value = d.defaultText }), T.RGB("text2"))
  GameTooltip:Show()
end

-- The label of the choice holding this value, if one does.
local function choiceLabel(choices, value)
  for _, choice in ipairs(choices) do
    if choice[1] == value then return choice[2] end
  end
end

-- A row's default as the row shows values: On or Off, the slider's text, or the choice's label.
local function defaultText(w, kind, initial)
  if kind == "check" then return initial and L["On"] or L["Off"] end
  if kind == "slider" then return w.format(initial) end
  return choiceLabel(w.choices, initial) or tostring(initial)
end

-- A small accent dot left of a row's caption; clicking it puts the default back.
local function resetDot(w, set, initial)
  local d = CreateFrame("Button", nil, w)
  d:SetSize(8, 16)
  d:SetPoint("LEFT", 0, 0)
  d.mark = W.Flat(d, "OVERLAY", "accent")
  d.mark:SetSize(DOT, DOT)
  d.mark:SetPoint("CENTER")
  d:SetScript("OnClick", ns.Guard("click reset setting", function() set(initial); T.Sound("off"); w:Refresh() end))
  d:SetScript("OnEnter", ns.Guard("reset dot tip", dotTooltip))
  d:SetScript("OnLeave", ns.Guard("reset dot tip", function() if GameTooltip then GameTooltip:Hide() end end))
  return d
end

-- A row's setter, getter and default: nil where its kind has none. The kind's SETTER_AT index holds the setter,
-- the getter sits just before it and the default just after.
local function setterOf(row)
  local at = SETTER_AT[row[1]]
  return at and row[at]
end

-- The function that reads a row's setting (see setterOf), or nil.
local function getterOf(row)
  local at = SETTER_AT[row[1]]
  return at and row[at - 1]
end

-- A row's default (see setterOf), which may be false; nil where the row has none.
local function defaultOf(row)
  local at = SETTER_AT[row[1]]
  return at and row[at + 1]
end

-- Whether a row with a default holds another value now.
local function rowChanged(row)
  local initial = defaultOf(row)
  return initial ~= nil and getterOf(row)() ~= initial
end

-- Whether any of the rows differs from its default.
local function anyChanged(rows)
  for _, row in ipairs(rows) do
    if rowChanged(row) then return true end
  end
  return false
end

-- A row changed or was reset: its page's nav dot and reset button follow (unless every row is being refreshed).
local function rowRefreshed(w)
  if quiet or not w.card then return end
  O.MarkChanged(w.card.child.pageKey)
  if w.card.child.resetButton then w.card.child.resetButton:Refresh() end
end

-- Gives a row with a default its reset dot, shown while the setting differs from the default.
local function markChanges(w, row)
  local initial = defaultOf(row)
  if initial == nil then return end
  w.reset = resetDot(w, setterOf(row), initial)
  w.reset.defaultText = defaultText(w, row[1], initial)
  local refresh = w.Refresh
  -- The row's own refresh, then the dot: shown while changed, in the current accent; then the page's dot.
  w.Refresh = function(self) refresh(self) self.reset:SetShown(rowChanged(row)) T.Tint(self.reset.mark, "accent") rowRefreshed(self) end
  w:Refresh()
end

-- Notes on settings -------------------------------------------------------------------------

-- The note on a row's setting now (O.SettingNote, from Modules/SituationsBanner.lua: a setting
-- a recording can't hold), or nil. The setting is the one its getter is tagged with (O.Tag).
local function noteOf(row)
  local module, key = O.SettingOf(getterOf(row))
  return module and O.SettingNote and O.SettingNote(module, key) or nil
end

-- Shows a row's note as its tooltip while it has one.
local function noteTooltip(w)
  local note = noteOf(w.row)
  if not note or not GameTooltip then return end
  GameTooltip:SetOwner(w, "ANCHOR_RIGHT")
  GameTooltip:SetText(note)
  GameTooltip:Show()
end

-- Hides the note's tooltip.
local function hideNote()
  if GameTooltip then GameTooltip:Hide() end
end

-- Gives a tagged setting's row its note: the tooltip on hover, and a muted caption while it has one.
local function addNote(w, row)
  local getter = getterOf(row)
  if not (getter and O.SettingOf(getter) and w.label) then return end
  w.row = row
  w:HookScript("OnEnter", ns.Guard("row note", noteTooltip))
  w:HookScript("OnLeave", ns.Guard("row note", hideNote))
  local refresh = w.Refresh
  -- The row's own refresh, then its caption: muted while the setting has a note.
  w.Refresh = function(self) refresh(self) T.Color(self.label, noteOf(row) and "muted" or "text") end
  w:Refresh()
end

-- Gives a row that carries a tip (row.tip) that tip as its tooltip on hover.
local function addTip(w, row)
  if not row.tip then return end
  w:HookScript("OnEnter", ns.Guard("show row tip", function()
    if not GameTooltip then return end
    GameTooltip:SetOwner(w, "ANCHOR_RIGHT")
    GameTooltip:SetText(row.tip, nil, nil, nil, nil, true)
    GameTooltip:Show()
  end))
  w:HookScript("OnLeave", ns.Guard("hide row tip", hideNote))
end

-- The tag a row whose setting applies on reload wears after its caption, by row kind (a module's switch, which never
-- builds or unbuilds a module until the reload, has room to say so in full), and the line its tip gains.
local RELOAD_TAG, RELOAD_TIP = { module = L["Reload to apply"], setting = L["reload"] }, L["Takes effect after /reload."]

-- Gives a row whose setting applies on reload a small muted tag just after its caption (a wrapping caption gives up the
-- tag's room), and a line in its tip.
local function addReloadTag(w, row)
  if not (row.reload and w.label) then return end
  w.tag = T.Text(w:CreateFontString(nil, "OVERLAY"), "small", "muted")
  w.tag:SetText(RELOAD_TAG[row[1]] or RELOAD_TAG.setting)
  local room = w.tag:GetStringWidth() + T.SPACE.gap
  if w.fixedLabel then w.label:SetWidth(w.label:GetWidth() - room) end
  w.tag:SetPoint("LEFT", w.label, "LEFT", math.min(w.label:GetStringWidth(), w.label:GetWidth()) + T.SPACE.gap, 0)
  row.tip = row.tip and (row.tip .. "\n" .. RELOAD_TIP) or RELOAD_TIP
end

-- Gives a row its reset dot (a setting with a default), its reload tag, its tip and its note (a tagged setting; last,
-- so it is the tooltip that shows).
local function dressRow(w, row)
  if row.isReset then w.card.child.resetButton = w end
  markChanges(w, row)
  addReloadTag(w, row)
  addTip(w, row)
  addNote(w, row)
end

-- Cards --------------------------------------------------------------------------------------

-- Splits rows into cards: each header starts one; rows before the first header make an untitled card.
local function groupRows(rows)
  local cards = {}
  for _, row in ipairs(rows) do
    if row[1] == "header" or #cards == 0 then cards[#cards + 1] = { title = row[1] == "header" and row[2] or nil, rows = {} } end
    if row[1] ~= "header" then table.insert(cards[#cards].rows, row) end
  end
  return cards
end

-- The card's title: a section header (W.SectionHeader, small muted capitals) along its top; returns where rows start.
local function addCardTitle(card, title)
  card.header = W.SectionHeader(card, title, { width = INNER })
  card.header:SetPoint("TOPLEFT", PAD, -PAD)
  card.title = card.header.text
  return PAD + card.header:GetHeight()
end

-- A row's height: its kind's, except a note or a switch with a long caption, which take the height of their wrapped text (with a little air).
local function rowHeight(w, kind)
  if kind == "text" then return math.max(ROW_HEIGHT.text, w:GetStringHeight() + AIR) end
  if kind == "check" and w.label then return math.max(ROW_HEIGHT.check, w.label:GetStringHeight() + 2 * AIR) end
  return ROW_HEIGHT[kind] or T.ROW.height
end

-- Builds a card's rows top to bottom from y; returns the y below them. Each
-- row keeps its card, its caption and where it sits on the page (for search).
local function placeRows(card, rows, y, cardY)
  for _, row in ipairs(rows) do
    local full = FULL_WIDTH[row[1]]
    local w = BUILDERS[row[1]](card, row, CARD_WIDTH - 2 * T.SPACE.tight)
    w.card, w.caption, w.pageY, w.source = card, row[2], cardY + y, row
    dressRow(w, row)
    w:SetPoint("TOPLEFT", card, "TOPLEFT", full and T.SPACE.tight or PAD, -y)
    widgets[#widgets + 1] = w
    y = y + rowHeight(w, row[1])
  end
  return y
end

-- One card (a raised panel) at y on the page; returns its height.
local function buildCard(child, spec, y)
  local card = T.Panel(CreateFrame("Frame", nil, child), { raised = true })
  card:SetPoint("TOPLEFT", 0, -y)
  card:SetWidth(CARD_WIDTH)
  card.child = child
  local top = spec.title and addCardTitle(card, spec.title) or PAD
  local height = placeRows(card, spec.rows, top, y) + T.SPACE.gap
  card:SetHeight(height)
  return height
end

-- Pages --------------------------------------------------------------------------------------

-- Stacks a page's cards down its view's content and sizes the content to fit.
local function placeCards(view, rows)
  local y = 0
  quiet = true
  for _, spec in ipairs(groupRows(rows)) do y = y + buildCard(view.child, spec, y) + PAD end
  quiet = false
  view:Fit(y - PAD)
end

-- A caption whose English ends in " (reload)": the window shows that as a tag beside the caption instead.
local RELOAD_SUFFIX = " (reload)"
-- What a reload caption keeps before its last bracket, half-width or full-width (Chinese, Korean): a translation
-- keeps the reload words in a bracket at its end.
local LAST_BRACKET = { "^(.*)%(.-%)$", "^(.*)（.-）$" }

-- The caption without its last bracket (the reload words, in any language), or as it is when no bracket ends it.
local function withoutReload(caption)
  for _, pattern in ipairs(LAST_BRACKET) do
    local kept = caption:match(pattern)
    if kept then return (kept:gsub("%s+$", "")) end
  end
  return caption
end

-- Notes a row's English caption (row.english, for the search) and moves a setting row's reload bracket from its
-- caption to row.reload (the tag). The English says whether it has one, so a translated caption loses its bracket too.
local function moveReload(row)
  if type(row[2]) ~= "string" then return end
  row.english = ns.English(row[2])
  if setterOf(row) and row.english:sub(-#RELOAD_SUFFIX) == RELOAD_SUFFIX then
    row[2], row.english, row.reload = withoutReload(row[2]), row.english:sub(1, -#RELOAD_SUFFIX - 1), true
  end
end

-- Whether a row has a default to go back to.
local function hasDefault(row)
  return defaultOf(row) ~= nil
end

-- Puts back the default of every changed row in the list, then refreshes the window.
local function resetRows(rows)
  for _, row in ipairs(rows) do
    if hasDefault(row) and rowChanged(row) then setterOf(row)(defaultOf(row)) end
  end
  O.Refresh()
end

-- The "Reset this page" button row: after asking, every changed setting on the page goes back to its default.
local function resetPageRow(page, rows)
  local ask = ns.Format(L["Put the settings on the {page} page back to their defaults?"], { page = page.title })
  return { "button", L["Reset this page"], function()
    ns.Ask(ask, L["Reset"], function() resetRows(rows) end, function() end)
  end, function() return anyChanged(rows) end, isReset = true }
end

-- A copy of a page's row list, each row copied too, "(reload)" moved off each caption: a page may hand back the same
-- tables at every opening (Click casting's), and the window's own marks (the reload tag, the tip) must not pile up in them.
local function copiedRows(page)
  local rows = {}
  for i, source in ipairs(page.rows()) do
    local row = {}
    for key, value in pairs(source) do row[key] = value end
    moveReload(row)
    rows[i] = row
  end
  return rows
end

-- A page's rows as the window uses them (copiedRows), and a reset button at the foot of a page that has
-- settings with defaults (a card of its own).
local function preparedRows(page)
  local rows, defaults = copiedRows(page), false
  for _, row in ipairs(rows) do defaults = defaults or hasDefault(row) end
  if defaults then
    rows[#rows + 1] = { "header", L["This page"] }
    rows[#rows + 1] = resetPageRow(page, rows)
  end
  return rows
end

-- A page's rows, read once per opening of the window (for its nav dot, the
-- search and building it) rather than per search keystroke.
local function rowsOf(page)
  rowCache[page.key] = rowCache[page.key] or preparedRows(page)
  return rowCache[page.key]
end

-- A page's rows for the search (Core/OptionsSearch.lua), and whether one differs from its default.
O.RowsOf, O.RowChanged = rowsOf, rowChanged

-- A page: the shared scroll view (ns.ScrollView: the T.SCROLL thumb, soft edges, the wheel) right of the nav, holding its cards.
local function buildPage(page)
  local view = ns.ScrollView(window, { width = CARD_WIDTH })
  view:SetPoint("TOPLEFT", NAV_WIDTH + T.SPACE.col, -(HEAD + T.SPACE.col))
  view:SetPoint("BOTTOMRIGHT", -VIEW_RIGHT, FOOT + T.SPACE.col)
  view.child.pageKey = page.key
  placeCards(view, rowsOf(page))
  return view
end

-- Header, nav and footer ---------------------------------------------------------------------

-- A full-width raised bar, `height` tall, along the top or bottom edge.
local function bar(f, edge, height)
  local b = T.Panel(CreateFrame("Frame", nil, f), { raised = true })
  b:SetHeight(height)
  b:SetPoint(edge .. "LEFT")
  b:SetPoint(edge .. "RIGHT")
  return b
end

-- The width of the header's profile picker (units).
local PROFILE_WIDTH = 150

-- Every profile as a dropdown choice.
local function profileChoices()
  local out = {}
  for _, n in ipairs(ns.ProfileNames()) do out[#out + 1] = { n, ns.Format(L["Profile: {profile}"], { profile = n }) } end
  return out
end

-- The profile picker: picking one switches on reload.
local function profileDropdown(parent)
  return W.Dropdown(parent, profileChoices, ns.SelectedProfileName, function(v) ns.UseProfile(v); O.NeedReload(); O.RebuildPage("profiles") end, PROFILE_WIDTH)
end

-- Enter in the search box: opens the first page that matches and jumps to the row.
local function searchEnter(self)
  self:ClearFocus()
  if O.hits and O.hits[1] then O.HideHits() O.OpenHit(O.hits[1]) return end
  if not (O.matches and O.matches[1]) then return end
  O.Show(O.matches[1])
  O.JumpTo(self:GetText())
end

-- The title, in the window tier's role and the text colour, with your faction's crest (T.CREST.title) just right
-- of it while the faction look is on.
local function addTitle(f)
  f.title = T.Text(f.header:CreateFontString(nil, "OVERLAY"), "title", "text")
  f.title:SetPoint("LEFT", f.logo, "RIGHT", T.SPACE.gap, 0)
  f.title:SetText("Vanguard")
  f.crest = T.Crest(f.header, T.CREST.title, "OVERLAY")
  f.crest:SetPoint("LEFT", f.title, "RIGHT", T.SPACE.gap, 0)
end

-- The header: logo and title, search, profile, and the close button where every window has it (T.PlaceClose).
local function addHeader(f)
  f.header = bar(f, "TOP", HEAD)
  f.logo = T.Logo(f.header, LOGO)
  f.logo:SetPoint("LEFT", T.SPACE.pad, 0)
  addTitle(f)
  f.close = T.PlaceClose(T.CloseButton(CreateFrame("Button", nil, f.header)), f)
  f.close:SetScript("OnClick", ns.Guard("click close options", function() O.Hide() end))
end

-- The width of the header's search box (units).
local SEARCH_WIDTH = 190

-- Search and profile, right of the title.
local function addHeaderControls(f)
  f.profile = profileDropdown(f.header)
  f.profile:SetPoint("RIGHT", f.close, "LEFT", -T.SPACE.gap, 0)
  f.search = W.Search(f.header, SEARCH_WIDTH, L["Search settings"], function(text) O.Search(text) end)
  f.search:SetPoint("RIGHT", f.profile, "LEFT", -T.SPACE.gap, 0)
  f.search:SetScript("OnEnterPressed", ns.Guard("search enter", searchEnter))
  T.Ornament(f, "rule", f.header)
end

-- The addon's version from its TOC, or nil.
local function version()
  local get = (C_AddOns and C_AddOns.GetAddOnMetadata) or GetAddOnMetadata
  return type(get) == "function" and get(ADDON, "Version") or nil
end

-- The footer: version on the left; a reload notice and button on the right when needed.
local function addFooter(f)
  f.footer = bar(f, "BOTTOM", FOOT)
  f.version = T.Text(f.footer:CreateFontString(nil, "OVERLAY"), "small", "muted")
  f.version:SetPoint("LEFT", T.SPACE.pad, 0)
  f.version:SetText(version() and ("Vanguard " .. version() .. "  ·  /vg") or "Vanguard  ·  /vg")
  f.reload = ns.ReloadButton(W.Primary(f.footer, L["Reload now"]))
  f.reload:SetPoint("RIGHT", -T.SPACE.pad, 0)
  f.notice = T.Text(f.footer:CreateFontString(nil, "OVERLAY"), "label", "warn")
  f.notice:SetPoint("RIGHT", f.reload, "LEFT", -T.SPACE.col, 0)
  f.notice:SetText(reloadNotice)
end

-- One nav entry (h tall): a list row (W.Row), one pixel in from the nav's edge; the current page wears its selected look.
local function navItem(nav, y, h)
  local b = W.Row(nav, h, { width = NAV_WIDTH - 2 })
  b:SetPoint("TOPLEFT", 1, -y)
  return b
end

-- Fills a nav entry with the page's icon and title; clicking opens the page.
local function fillNavItem(b, page)
  b.icon = W.IconTexture(b, page.icon or "NavGeneral", NAV_ICON, "text2")
  b.icon:SetPoint("LEFT", T.SPACE.pad, 0)
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "label", "text2")
  b.text:SetPoint("LEFT", b.icon, "RIGHT", T.SPACE.gap, 0)
  b.text:SetText(page.title)
  b:SetScript("OnClick", ns.Guard("click options page", function() O.Show(page.key) end))
  b.changed = W.Flat(b, "OVERLAY", "accent")
  b.changed:SetSize(DOT, DOT)
  b.changed:SetPoint("RIGHT", -T.SPACE.col, 0)
end

-- Pages in nav order.
local function navOrder()
  local list = {}
  for _, page in ipairs(O.PAGES) do list[#list + 1] = page end
  table.sort(list, function(a, b) return (a.order or 70) < (b.order or 70) end)
  return list
end
O.NavOrder = navOrder

-- A thin divider across the nav at y.
local function divider(nav, y)
  local d = W.Flat(nav, "ARTWORK", "divider")
  d:SetHeight(1)
  d:SetPoint("TOPLEFT", T.SPACE.col, -y)
  d:SetPoint("TOPRIGHT", -T.SPACE.col, -y)
end

-- A page's nav group: 1 (under order 30), 2 (under 90), 3 (the rest).
local function navGroup(page)
  local order = page.order or 70
  return order < 30 and 1 or order < 90 and 2 or 3
end

-- The nav's air above its first entry and below its last, and what a divider between groups takes (the
-- divider, with 3 units of air above it and 3 below).
local NAV_TOP, NAV_FOOT, GROUP_GAP = T.SPACE.gap, T.SPACE.tight, T.SPACE.gap

-- How tall one nav entry is: a list row (T.ROW.height), or less when that many pages and dividers would run past the nav's foot.
local function navStep(list)
  local gaps = -1
  for i, page in ipairs(list) do
    if i == 1 or navGroup(page) ~= navGroup(list[i - 1]) then gaps = gaps + 1 end
  end
  return math.min(T.ROW.height, math.floor((HEIGHT - HEAD - FOOT - NAV_TOP - NAV_FOOT - GROUP_GAP * gaps) / #list))
end

-- One entry per page down the nav, with a divider where the group changes.
local function addNavItems(f)
  local y, group, list = NAV_TOP, nil, navOrder()
  local step = navStep(list)
  for _, page in ipairs(list) do
    if group and navGroup(page) ~= group then divider(f.navPanel, y + 3) y = y + GROUP_GAP end
    group = navGroup(page)
    f.nav[page.key] = navItem(f.navPanel, y, step)
    fillNavItem(f.nav[page.key], page)
    y = y + step
  end
end

-- The nav: a shaded strip down the left under the header.
local function addNav(f)
  f.nav, f.navPanel = {}, CreateFrame("Frame", nil, f)
  f.navPanel:SetPoint("TOPLEFT", 0, -HEAD)
  f.navPanel:SetPoint("BOTTOMLEFT", 0, FOOT)
  f.navPanel:SetWidth(NAV_WIDTH)
  W.Flat(f.navPanel, "BACKGROUND", "shade"):SetAllPoints()
  addNavItems(f)
end

-- Keys -----------------------------------------------------------------------------------------

-- Opens the page before (dir -1) or after (dir 1) the current one in the nav, wrapping.
local function stepPage(dir)
  local list, at = navOrder(), 1
  for i, page in ipairs(list) do
    if page.key == O.current then at = i end
  end
  O.Show(list[(at - 1 + dir) % #list + 1].key)
end

-- The current page's rows that do something when pressed (switches, choices, sliders, buttons), top to bottom.
local function pressableRows()
  local view, out = pages[O.current], {}
  for _, w in ipairs(widgets) do
    local button = w.GetObjectType and w:GetObjectType() == "Button"
    if view and button and w.card.child == view.child and w:IsVisible() then out[#out + 1] = w end
  end
  return out
end

-- Scrolls the current page just enough to show a row.
local function scrollToRow(view, w)
  local top, h = view:GetVerticalScroll() or 0, view:GetHeight()
  if w.pageY < top then view:ScrollTo(w.pageY - T.SPACE.gap) end
  if w.pageY + w:GetHeight() > top + h then view:ScrollTo(w.pageY + w:GetHeight() - h + T.SPACE.gap) end
end

-- Moves the keyboard's row to w (or to none), its focus ring with it.
local function setFocus(w)
  if window.focusRow then T.FocusRing(window.focusRow, false) end
  window.focusRow = w
  if w then T.FocusRing(w, true) end
end

-- Moves the keyboard's row to the next (dir 1) or previous (dir -1) one, wrapping, marked and in view.
local function stepRow(dir)
  local rows, at = pressableRows(), 0
  if #rows == 0 then return end
  for i, w in ipairs(rows) do
    if w == window.focusRow then at = i end
  end
  if at == 0 and dir < 0 then at = 1 end
  setFocus(rows[(at - 1 + dir) % #rows + 1])
  O.MarkRow(window.focusRow)
  scrollToRow(pages[O.current], window.focusRow)
end

-- What a key does in the window; true when it used it.
local function useKey(key)
  if key == "UP" or key == "DOWN" then stepPage(key == "UP" and -1 or 1) return true end
  if key == "TAB" then stepRow(IsShiftKeyDown and IsShiftKeyDown() and -1 or 1) return true end
  local w = window.focusRow
  if (key == "LEFT" or key == "RIGHT") and w and w.Step then w:Step(key == "RIGHT" and 1 or -1) return true end
  if not ((key == "ENTER" or key == "SPACE") and w) then return false end
  w:GetScript("OnClick")(w, "LeftButton")
  return true
end

-- A key while the window is open: the ones it uses stop here, every other one
-- goes on to the game; none is used while a box (search, a value) has the typing.
-- Escape closes the window itself (the keyboard it holds would otherwise swallow it); a box with the typing clears first.
local function onKey(f, key)
  local typing = type(GetCurrentKeyBoardFocus) == "function" and GetCurrentKeyBoardFocus() ~= nil
  if key == "ESCAPE" and not typing then
    if ns.Widgets.MenuOpen() then ns.Widgets.CloseMenu() else f:Hide() end
    if not ns.InCombat() and ns.Client.Has("keyPropagate") then f:SetPropagateKeyboardInput(false) end
    return
  end
  local used = not typing and useKey(key)
  if not ns.InCombat() and ns.Client.Has("keyPropagate") then f:SetPropagateKeyboardInput(not used) end
end

-- Takes the keyboard while shown and out of combat (it can't pass keys on in a fight), never while hidden;
-- a fight lets it go, and the combat queue takes it back when the fight ends.
local function wireKeys(f)
  f:SetScript("OnKeyDown", ns.Guard("key options", onKey))
  f:SetScript("OnHide", ns.Guard("hide options", function(self) self:EnableKeyboard(false) setFocus(nil) O.HideHits() end))
  ns.On("PLAYER_REGEN_DISABLED", function()
    f:EnableKeyboard(false)
    ns.AfterCombat(function() f:EnableKeyboard(f:IsShown()) end, "options keyboard")
  end)
end

-- Building and showing -----------------------------------------------------------------------

-- The window's place is kept with the game windows' (the Windows module's settings, Modules/WindowsMove.lua) under this name.
local PLACE_KEY = "Vanguard_Options"

-- The window dropped: it stops and its place is saved.
local function dropped(f)
  f:StopMovingOrSizing()
  ns.GetModule("Windows").SavePlace(PLACE_KEY, f)
end

-- Lets the window be dragged around by its header, kept on the screen; where it is dropped is remembered.
local function makeMovable(f)
  f:SetMovable(true)
  f:SetClampedToScreen(true)
  f.header:EnableMouse(true)
  f.header:RegisterForDrag("LeftButton")
  f.header:SetScript("OnDragStart", ns.Guard("drag options", function() f:StartMoving() end))
  f.header:SetScript("OnDragStop", ns.Guard("drop options", function() dropped(f) end))
end

-- Puts the window where it was last dropped, or in the middle of the screen (after Reset window positions too).
function O.PlaceWindow()
  if not window then return end
  window:ClearAllPoints()
  window:SetPoint("CENTER")
  ns.GetModule("Windows").PutBack(PLACE_KEY, window)
end

-- The window's height for the screen now: FIT.share of it, no more than the screen less FIT.margin, and never
-- under HEIGHT (the nav's entries are sized for HEIGHT).
local function fitHeight()
  local screen = UIParent:GetHeight()
  return math.max(HEIGHT, math.min(math.floor(screen * FIT.share), screen - FIT.margin))
end

-- After a UI scale or screen change, a window whose fitting height changed takes it; a closed one is placed again
-- too (an open one stays under the mouse, e.g. after the Pixel-perfect scale switch in it).
T.OnScale(function()
  if not window or fitHeight() == window.fitted then return end
  window.fitted = fitHeight()
  T.PixelSize(window, WIDTH, window.fitted, true)
  if not window:IsShown() then O.PlaceWindow() end
end)

-- The window frame: opaque (T.ALPHA.opaque: no world shows through, under short pages either), above other windows,
-- closes with Escape (O.PlaceWindow places it).
local function windowFrame()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_Options", UIParent), { alpha = T.ALPHA.opaque, shadow = true })
  f.fitted = fitHeight()
  T.PixelSize(f, WIDTH, f.fitted, true)
  f:SetFrameStrata("DIALOG")
  f:EnableMouse(true)
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, "Vanguard_Options") end
  return f
end

-- The window, built on first use: header, footer and nav (each page brings its own scroll view).
local function build()
  window = windowFrame()
  addHeader(window)
  addHeaderControls(window)
  addFooter(window)
  ns.ErrorBadge.Footer(window)
  addNav(window)
  makeMovable(window)
  O.PlaceWindow()
  wireKeys(window)
end

-- Marks a change that applies on reload, and shows the reload notice.
function O.NeedReload()
  needsReload = true
  if window then window.reload:SetShown(true) window.notice:SetShown(true) window.notice:SetText(reloadNotice) end
end

-- The profile in use had its settings replaced (Copy here, Reset profile): the running modules keep the
-- tables they read at login until the reload, so a setting changed before it does nothing yet, and the notice says so.
function O.ProfileReplaced()
  reloadNotice = L["Profile replaced: reload before you change more"]
  O.NeedReload()
end

-- After ns.CopyProfile copied into `into`: the profile in use replaced (O.ProfileReplaced), or a staged one (O.NeedReload).
function O.ProfileCopied(into)
  if into == ns.ProfileName() then return O.ProfileReplaced() end
  O.NeedReload()
end

-- Re-reads every widget's value (after a change elsewhere, e.g. a profile switch), then marks the nav's dots.
function O.Refresh()
  quiet = true
  for _, w in ipairs(widgets) do
    if w.Refresh then w:Refresh() end
  end
  quiet = false
  if window then window.profile:Refresh() window.reload:Refresh() O.MarkChanged() end
end

-- Marks the current page's nav entry (the row's selected look, and its text and icon) and dims pages the search misses.
local function markNav(key)
  for k, b in pairs(window.nav) do
    local on, hit = k == key, not O.matches or O.matched[k]
    b:SetSelected(on)
    T.Color(b.text, on and "text" or "text2")
    T.Tint(b.icon, on and "accent" or "text2")
    b:SetAlpha(hit and 1 or DIM)
  end
end

-- Builds the current page on first view and shows only it.
local function showPage()
  for _, page in ipairs(O.PAGES) do
    if page.key == O.current and not pages[page.key] then pages[page.key] = buildPage(page) end
    if pages[page.key] then pages[page.key]:SetShown(page.key == O.current) end
  end
end

-- Brings the window up (fading in as it rises into place, with a sound) or, when it was already
-- open, plays the page sound for a new page.
local function appear(previous)
  if not previous then T.Sound("open") elseif previous ~= O.current then T.Sound("page") end
  if previous then T.StopFade(window) else T.OpenWindow(window) end
  if pages[O.current] then pages[O.current]:ScrollTo(pages[O.current]:GetVerticalScroll() or 0) end
end

-- The window takes the keyboard (out of combat); a new page starts without a keyboard row.
local function takeKeys(previous)
  if previous ~= O.current then setFocus(nil) end
  window:EnableKeyboard(not ns.InCombat())
end

-- Shows the reload notice and button while a change needs a reload.
local function showReloadNotice()
  window.reload:SetShown(needsReload)
  window.notice:SetShown(needsReload)
end

-- Forgets the rows of the pages not built yet, so a new opening reads them afresh. A built page keeps
-- the rows it shows: its widgets point at them, and a search hit finds its widget by them.
local function forgetUnbuiltRows()
  for key in pairs(rowCache) do
    if not pages[key] then rowCache[key] = nil end
  end
end

-- Opens the window on a page (default: the last one shown, or General).
function O.Show(key)
  if not window then build() end
  local previous = window:IsShown() and O.current
  if not previous then forgetUnbuiltRows() end
  O.current = key or O.current or "general"
  takeKeys(previous)
  showPage()
  markNav(O.current)
  showReloadNotice()
  O.Refresh()
  appear(previous)
end

-- Whether any of a page's settings differs from its default.
local function pageChanged(page)
  return anyChanged(rowsOf(page))
end

-- Shows the "Changed" dot on the nav entry of the page with this key (every page without one)
-- while that page has a setting changed from its default, in the current accent.
function O.MarkChanged(key)
  for _, page in ipairs(O.PAGES) do
    local b = window.nav[page.key]
    if b and (key == nil or key == page.key) then b.changed:SetShown(pageChanged(page)) T.Tint(b.changed, "accent") end
  end
end

-- Whether a row's caption, as shown or in English (row.english), contains the (lower-case) text.
local function captionHas(row, text)
  return type(row[2]) == "string" and (row[2] .. " " .. (row.english or "")):lower():find(text, 1, true) ~= nil
end

-- Whether a page's title (or its English) or any row's caption (a card title is no row's) contains the (lower-case)
-- text, or the search lists one of its rows (O.RowMatches: keywords, choice names, a note), so the nav never dims a
-- hit's page.
local function pageMatches(page, text)
  if O.BothTongues(page.title):lower():find(text, 1, true) then return true end
  local rows = rowsOf(page)
  for i, row in ipairs(rows) do
    if row[1] ~= "header" and captionHas(row, text) then return true end
    if O.RowMatches(rows, i, text) then return true end
  end
  return false
end

-- Drops a thrown-away page's rows from the widget list (so they're no longer refreshed or searched).
local function forgetRows(view)
  for i = #widgets, 1, -1 do
    if widgets[i].card.child == view.child then table.remove(widgets, i) end
  end
end

-- The window's frame (Vanguard_Options), or nil until it is first opened.
function O.Frame()
  return window
end

-- Throws a built page away so it's built again from its rows (its list
-- changed), showing it again if it's the current one, scrolled where it was.
function O.RebuildPage(key)
  rowCache[key] = nil
  local old = pages[key]
  local scroll = old and old:GetVerticalScroll() or 0
  if old then forgetRows(old) old:Hide() pages[key] = nil end
  if not (window and window:IsShown() and O.current == key) then return end
  O.Show(key)
  if pages[key] then pages[key]:ScrollTo(scroll) end
end

-- The first row on a page whose caption, as shown or in English, has the (lower-case) text.
local function firstRow(view, text)
  for _, w in ipairs(widgets) do
    if w.card and w.card.child == view.child and captionHas(w.source, text) then return w end
  end
end

-- Marks a row (found by search, or the keyboard's) with an accent wash (the last one marked loses its mark).
-- A text row is a font string, which can't hold a texture: its card holds the wash, laid over the text.
function O.MarkRow(w)
  if window.found then window.found:Hide() end
  w.found = w.found or (w.CreateTexture and W.Flat(w, "BACKGROUND", "accent") or W.Flat(w.card, "BORDER", "accent"))
  w.found:SetAllPoints(w)
  w.found:SetAlpha(0.18)
  w.found:Show()
  window.found = w.found
end

-- Scrolls the current page to the first row with the text in its caption (a trailing " (reload)" is ignored), and marks it.
function O.JumpTo(text)
  local view = pages[O.current]
  local w = view and firstRow(view, ((text or ""):gsub(" %(reload%)$", "")):lower())
  if not w then return end
  view:ScrollTo(w.pageY - JUMP_ABOVE)
  O.MarkRow(w)
end

-- Opens a search hit: its page, scrolled to its row, which is marked.
function O.OpenHit(hit)
  O.Show(hit.page)
  local view = pages[O.current]
  for _, w in ipairs(widgets) do
    if view and w.source == hit.row and w:IsVisible() then view:ScrollTo(w.pageY - JUMP_ABOVE) O.MarkRow(w) return end
  end
end

-- The pages (and which) that match the (lower-case) text, for the nav to dim the others.
local function matchPages(text)
  O.matches, O.matched = nil, nil
  if text == "" then return end
  O.matches, O.matched = {}, {}
  for _, page in ipairs(navOrder()) do
    if pageMatches(page, text) then table.insert(O.matches, page.key) O.matched[page.key] = true end
  end
end

-- Filters the nav by search text: pages that don't match fade; the settings that match are listed under the box
-- (Core/OptionsSearch.lua); Enter opens the first.
function O.Search(text)
  text = (text or ""):lower()
  if window and window.found then window.found:Hide() end
  matchPages(text)
  O.ShowHits(text)
  if window then markNav(O.current) end
end

-- Closes the window (and any open dropdown).
function O.Hide()
  W.CloseMenu()
  if not window or not window:IsShown() then return end
  T.Sound("close")
  T.CloseWindow(window)
end

-- Opens or closes the window.
function O.Toggle()
  if window and window:IsShown() then O.Hide() else O.Show() end
end

-- Accent changes recolor the window's switches, segments and nav at once.
T.OnChanged(function()
  if window and window:IsShown() then
    O.Refresh()
    markNav(O.current)
  end
end)
