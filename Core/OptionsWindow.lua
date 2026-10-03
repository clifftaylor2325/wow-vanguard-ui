-- The options window: a header bar (logo, search, profile, close), icon
-- navigation on the left, the current page as cards of setting rows (it
-- scrolls when long), and a footer that says when a reload is needed. Pages
-- and their rows come from Core/Options.lua and modules' own pages.

local ADDON, ns = ...

local T, W, O = ns.Theme, ns.Widgets, ns.Options

local WIDTH, HEIGHT, NAV_WIDTH, BAR = 780, 560, 176, 40
local CARD_WIDTH, PAD = WIDTH - NAV_WIDTH - 40, 10
-- Height of each row kind (modules add theirs with O.AddRowKind).
local ROW_HEIGHT = { check = 28, cycle = 28, slider = 28, swatches = 30, button = 32, text = 20, preview = 44, module = 40 }
-- Row kinds laid out edge to edge in a card (the rest are indented).
local FULL_WIDTH = { check = true, cycle = true, slider = true, swatches = true, module = true }
-- Where a row kind keeps its setter; the setting's default, if the row has one, comes right after it.
local SETTER_AT = { check = 4, cycle = 5, slider = 5 }

local window
local pages, widgets = {}, {}
-- Each page's rows as the search reads them, kept while the window is open (O.RebuildPage drops a page's).
local rowCache = {}
local needsReload = false

-- Rows ---------------------------------------------------------------------------------------

-- The accent row: a swatch per preset and a hex box (Enter applies).
local function accentRow(parent, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, ROW_HEIGHT.swatches)
  r.label = T.Text(r:CreateFontString(nil, "OVERLAY"), "label")
  r.label:SetPoint("LEFT", 8, 0)
  r.label:SetText("Accent")
  r.hex = W.Input(r, 74)
  r.hex:SetPoint("RIGHT", -8, 0)
  r.hex:SetScript("OnEnterPressed", function(self) local cr, cg, cb = T.ParseHex(self:GetText()) if cr then T.SetAccent(cr, cg, cb) end self:ClearFocus() end)
  -- Shows the current accent as #rrggbb.
  r.Refresh = function(self) self.hex:SetText("#" .. T.Hex("accent"):sub(3):upper()) end
  return r
end

-- The preset swatches, right to left before the hex box.
local function addSwatches(r)
  for i, name in ipairs(T.PRESET_ORDER) do
    local rgb = T.PRESETS[name]
    local s = W.Swatch(r, rgb, function() T.SetAccent(rgb[1], rgb[2], rgb[3]) end)
    s:SetSize(22, 22)
    s:SetPoint("RIGHT", r.hex, "LEFT", -12 - (#T.PRESET_ORDER - i) * 26, 0)
  end
end

-- A live sample: a unit bar with the bar texture and the bundled font.
local function previewRow(parent, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, ROW_HEIGHT.preview)
  r.bar = T.Panel(CreateFrame("StatusBar", nil, r), { shadow = true })
  r.bar:SetSize(220, 26)
  r.bar:SetPoint("LEFT", 8, 0)
  T.StyleBar(r.bar)
  r.bar:SetMinMaxValues(0, 100)
  r.bar:SetValue(72)
  r.bar.name = T.Text(r.bar:CreateFontString(nil, "OVERLAY"), "name")
  return r
end

-- Fills the sample: its colors and texts follow the theme.
local function refreshPreview(r)
  T.BarColor(r.bar, "friendly")
  r.bar.name:SetPoint("LEFT", 6, 0)
  r.bar.name:SetText("<name>  72%")
end

-- A module's switch: its name, and under it what the module does, in small muted text.
local function moduleRow(parent, row, width)
  local r = W.Check(parent, row[2], row[3], row[4], width)
  r:SetHeight(ROW_HEIGHT.module)
  r.label:ClearAllPoints()
  r.label:SetPoint("TOPLEFT", 8, -6)
  r.desc = T.Text(r:CreateFontString(nil, "OVERLAY"), "small", "muted")
  r.desc:SetPoint("TOPLEFT", r.label, "BOTTOMLEFT", 0, -3)
  r.desc:SetText(row[6])
  return r
end

-- Row kind -> builder(parent, row, width) returning the widget.
local BUILDERS = {
  -- One builder per row kind; each returns the widget it made.
  -- Header rows are card titles (groupRows), not widgets.
  text = function(c, r) return W.Text(c, r[2]) end,
  check = function(c, r, w) return W.Check(c, r[2], r[3], r[4], w) end,
  button = function(c, r) return W.Button(c, r[2], r[3], 220) end,
  cycle = function(c, r, w) return W.Choice(c, r[2], r[3], r[4], r[5], w) end,
  slider = function(c, r, w) return W.Slider(c, r[2], r[3], r[4], r[5], w) end,
  swatches = function(c, _, w) local r = accentRow(c, w) addSwatches(r) return r end,
  preview = function(c, _, w) local r = previewRow(c, w) r.Refresh = refreshPreview return r end,
  module = moduleRow,
}

-- Adds a row kind: builder(parent, row, width) returns the widget; height is its row height.
function O.AddRowKind(kind, builder, height)
  BUILDERS[kind] = builder
  ROW_HEIGHT[kind] = height
end

-- Changed from the default ------------------------------------------------------------------

-- The reset dot's tooltip, where the client has one.
local function dotTooltip(d)
  if not GameTooltip then return end
  GameTooltip:SetOwner(d, "ANCHOR_RIGHT")
  GameTooltip:SetText("Changed from the default. Click to put it back.")
  GameTooltip:Show()
end

-- A small accent dot left of a row's caption; clicking it puts the default back.
local function resetDot(w, set, initial)
  local d = CreateFrame("Button", nil, w)
  d:SetSize(8, 16)
  d:SetPoint("LEFT", 0, 0)
  d.mark = W.Flat(d, "OVERLAY", "accent")
  d.mark:SetSize(4, 4)
  d.mark:SetPoint("CENTER")
  d:SetScript("OnClick", function() set(initial); T.Sound("off"); w:Refresh() end)
  d:SetScript("OnEnter", dotTooltip)
  d:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  return d
end

-- Gives a row with a default its reset dot, shown while the setting differs from the default.
local function markChanges(w, row)
  local at = SETTER_AT[row[1]]
  local initial = at and row[at + 1]
  if initial == nil then return end
  w.reset = resetDot(w, row[at], initial)
  local refresh = w.Refresh
  -- The row's own refresh, then the dot: shown while changed, in the current accent.
  w.Refresh = function(self) refresh(self) self.reset:SetShown(row[at - 1]() ~= initial) T.Tint(self.reset.mark, "accent") end
  w:Refresh()
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

-- The card's title in small muted capitals; returns where rows start.
local function addCardTitle(card, title)
  card.title = T.Text(card:CreateFontString(nil, "OVERLAY"), "small", "muted")
  card.title:SetPoint("TOPLEFT", PAD + 2, -PAD)
  card.title:SetText(title:upper())
  return PAD + 18
end

-- Builds a card's rows top to bottom from y; returns the y below them. Each
-- row keeps its card, its caption and where it sits on the page (for search).
local function placeRows(card, rows, y, cardY)
  for _, row in ipairs(rows) do
    local full = FULL_WIDTH[row[1]]
    local w = BUILDERS[row[1]](card, row, CARD_WIDTH - 8)
    markChanges(w, row)
    w.card, w.caption, w.pageY = card, row[2], cardY + y
    w:SetPoint("TOPLEFT", card, "TOPLEFT", full and 4 or PAD + 2, -y)
    widgets[#widgets + 1] = w
    y = y + (ROW_HEIGHT[row[1]] or 28)
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
  local height = placeRows(card, spec.rows, top, y) + PAD - 2
  card:SetHeight(height)
  return height
end

-- Scrolling ----------------------------------------------------------------------------------

-- Sizes and places the scroll thumb for a page (hidden when it all fits).
local function updateThumb(view)
  local vh, ch = view:GetHeight(), view.child:GetHeight()
  window.thumb:SetShown(vh > 0 and ch > vh + 1)
  if not window.thumb:IsShown() then return end
  local h = math.max(24, vh * vh / ch)
  window.thumb:SetHeight(h)
  window.thumb:ClearAllPoints()
  window.thumb:SetPoint("TOPRIGHT", view, "TOPRIGHT", 12, -(view:GetVerticalScroll() or 0) / (ch - vh) * (vh - h))
end

-- How far a page can scroll.
local function maxScroll(view)
  return math.max(0, view.child:GetHeight() - view:GetHeight())
end

-- The soft edges: the top one once scrolled down, the bottom one while there's more below.
local function updateEdges(view)
  local scroll, max = view:GetVerticalScroll() or 0, maxScroll(view)
  view.fadeTop:SetShown(scroll > 1)
  view.fadeBottom:SetShown(scroll < max - 1)
end

-- Scrolls a page to y (kept within its content), with its thumb and edges.
local function scrollTo(view, y)
  view:SetVerticalScroll(math.max(0, math.min(maxScroll(view), y)))
  updateThumb(view)
  updateEdges(view)
end

-- Scrolls a page 40 units per wheel notch.
local function onWheel(view, delta)
  scrollTo(view, (view:GetVerticalScroll() or 0) - delta * 40)
end

-- A soft edge in the window's color over one end of a page (rows fade into it).
local function fadeEdge(holder, side)
  local t = T.Snap(holder:CreateTexture(nil, "OVERLAY"))
  t:SetTexture(T.Texture("Fade"))
  T.Tint(t, "panel")
  if side == "TOP" then t:SetTexCoord(0, 1, 1, 0) end
  t:SetPoint(side .. "LEFT")
  t:SetPoint(side .. "RIGHT")
  t:SetHeight(24)
  return t
end

-- The two edges, on a layer above the page's rows; the wheel scrolls the page.
local function addEdges(view)
  view:EnableMouseWheel(true)
  local holder = CreateFrame("Frame", nil, view)
  holder:SetAllPoints(view)
  holder:SetFrameLevel(view:GetFrameLevel() + 10)
  view.fadeTop, view.fadeBottom = fadeEdge(holder, "TOP"), fadeEdge(holder, "BOTTOM")
end

-- Pages --------------------------------------------------------------------------------------

-- Stacks a page's cards down its scroll child and sizes the child to fit.
local function placeCards(child, rows)
  local y = 0
  for _, spec in ipairs(groupRows(rows)) do y = y + buildCard(child, spec, y) + PAD end
  child:SetHeight(math.max(1, y - PAD))
end

-- A page: a scroll view right of the nav holding its cards.
local function buildPage(page)
  local view = CreateFrame("ScrollFrame", nil, window)
  view:SetPoint("TOPLEFT", NAV_WIDTH + 14, -(BAR + 12))
  view:SetPoint("BOTTOMRIGHT", -26, BAR + 12)
  view.child = CreateFrame("Frame", nil, view)
  view.child:SetWidth(CARD_WIDTH)
  view:SetScrollChild(view.child)
  placeCards(view.child, page.rows())
  addEdges(view)
  view:SetScript("OnMouseWheel", onWheel)
  return view
end

-- Header, nav and footer ---------------------------------------------------------------------

-- A full-width raised bar along the top or bottom edge.
local function bar(f, edge)
  local b = T.Panel(CreateFrame("Frame", nil, f), { raised = true })
  b:SetHeight(BAR)
  b:SetPoint(edge .. "LEFT")
  b:SetPoint(edge .. "RIGHT")
  return b
end

-- Every profile as a dropdown choice.
local function profileChoices()
  local out = {}
  for _, n in ipairs(ns.ProfileNames()) do out[#out + 1] = { n, "Profile: " .. n } end
  return out
end

-- The profile picker: picking one switches on reload.
local function profileDropdown(parent)
  return W.Dropdown(parent, profileChoices, ns.ProfileName, function(v) ns.UseProfile(v); O.NeedReload(); O.RebuildPage("profiles") end, 150)
end

-- Enter in the search box: opens the first page that matches and jumps to the row.
local function searchEnter(self)
  self:ClearFocus()
  if not (O.matches and O.matches[1]) then return end
  O.Show(O.matches[1])
  O.JumpTo(self:GetText())
end

-- The title, with your faction's crest just right of it while the faction look is on.
local function addTitle(f)
  f.title = T.Text(f.header:CreateFontString(nil, "OVERLAY"), "title")
  f.title:SetPoint("LEFT", f.logo, "RIGHT", 6, 0)
  f.title:SetText("ForeverUI")
  f.crest = T.Crest(f.header, 20, "OVERLAY")
  f.crest:SetPoint("LEFT", f.title, "RIGHT", 8, 0)
end

-- The header: logo and title, search, profile, close.
local function addHeader(f)
  f.header = bar(f, "TOP")
  f.logo = T.Logo(f.header, 22)
  f.logo:SetPoint("LEFT", 10, 0)
  addTitle(f)
  f.close = T.CloseButton(CreateFrame("Button", nil, f.header))
  f.close:SetSize(24, 24)
  f.close:SetPoint("RIGHT", -8, 0)
  f.close:SetScript("OnClick", function() O.Hide() end)
end

-- Search and profile, right of the title.
local function addHeaderControls(f)
  f.profile = profileDropdown(f.header)
  f.profile:SetPoint("RIGHT", f.close, "LEFT", -10, 0)
  f.search = W.Search(f.header, 190, "Search settings", function(text) O.Search(text) end)
  f.search:SetPoint("RIGHT", f.profile, "LEFT", -8, 0)
  f.search:SetScript("OnEnterPressed", searchEnter)
end

-- The addon's version from its TOC, or nil.
local function version()
  local get = (C_AddOns and C_AddOns.GetAddOnMetadata) or GetAddOnMetadata
  return type(get) == "function" and get(ADDON, "Version") or nil
end

-- The footer: version on the left; a reload notice and button on the right when needed.
local function addFooter(f)
  f.footer = bar(f, "BOTTOM")
  f.version = T.Text(f.footer:CreateFontString(nil, "OVERLAY"), "small", "muted")
  f.version:SetPoint("LEFT", 12, 0)
  f.version:SetText(version() and ("ForeverUI " .. version() .. "  ·  /fui") or "ForeverUI  ·  /fui")
  f.reload = ns.ReloadButton(W.Primary(f.footer, "Reload now", nil, 110))
  f.reload:SetPoint("RIGHT", -10, 0)
  f.notice = T.Text(f.footer:CreateFontString(nil, "OVERLAY"), "label", "warn")
  f.notice:SetPoint("RIGHT", f.reload, "LEFT", -12, 0)
  f.notice:SetText("Some changes need a reload")
end

-- One nav entry: icon and title; the active one gets an accent rail and wash.
local function navItem(nav, y)
  local b = CreateFrame("Button", nil, nav)
  b:SetSize(NAV_WIDTH - 2, 30)
  b:SetPoint("TOPLEFT", 1, -y)
  b.wash, b.rail = W.Flat(b, "BACKGROUND", "accent"), W.Flat(b, "ARTWORK", "accent")
  b.wash:SetAllPoints()
  b.rail:SetPoint("TOPLEFT")
  b.rail:SetPoint("BOTTOMLEFT")
  b.rail:SetWidth(2)
  W.Flat(b, "HIGHLIGHT", "hover"):SetAllPoints()
  return b
end

-- Fills a nav entry with the page's icon and title; clicking opens the page.
local function fillNavItem(b, page)
  b.icon = W.IconTexture(b, page.icon or "General", 16, "text2")
  b.icon:SetPoint("LEFT", 14, 0)
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "label", "text2")
  b.text:SetPoint("LEFT", b.icon, "RIGHT", 9, 0)
  b.text:SetText(page.title)
  b:SetScript("OnClick", function() O.Show(page.key) end)
end

-- Pages in nav order.
local function navOrder()
  local list = {}
  for _, page in ipairs(O.PAGES) do list[#list + 1] = page end
  table.sort(list, function(a, b) return (a.order or 70) < (b.order or 70) end)
  return list
end

-- A thin divider across the nav at y.
local function divider(nav, y)
  local d = W.Flat(nav, "ARTWORK", "divider")
  d:SetHeight(1)
  d:SetPoint("TOPLEFT", 12, -y)
  d:SetPoint("TOPRIGHT", -12, -y)
end

-- A page's nav group: 1 (under order 30), 2 (under 90), 3 (the rest).
local function navGroup(page)
  local order = page.order or 70
  return order < 30 and 1 or order < 90 and 2 or 3
end

-- One entry per page down the nav, with a divider where the group changes.
local function addNavItems(f)
  local y, group = 8, nil
  for _, page in ipairs(navOrder()) do
    if group and navGroup(page) ~= group then divider(f.navPanel, y + 3) y = y + 7 end
    group = navGroup(page)
    f.nav[page.key] = navItem(f.navPanel, y)
    fillNavItem(f.nav[page.key], page)
    y = y + 30
  end
end

-- The nav: a shaded strip down the left under the header.
local function addNav(f)
  f.nav, f.navPanel = {}, CreateFrame("Frame", nil, f)
  f.navPanel:SetPoint("TOPLEFT", 0, -BAR)
  f.navPanel:SetPoint("BOTTOMLEFT", 0, BAR)
  f.navPanel:SetWidth(NAV_WIDTH)
  W.Flat(f.navPanel, "BACKGROUND", "shade"):SetAllPoints()
  addNavItems(f)
end

-- Building and showing -----------------------------------------------------------------------

-- Lets the window be dragged around by its header.
local function makeMovable(f)
  f:SetMovable(true)
  f.header:EnableMouse(true)
  f.header:RegisterForDrag("LeftButton")
  f.header:SetScript("OnDragStart", function() f:StartMoving() end)
  f.header:SetScript("OnDragStop", function() f:StopMovingOrSizing() end)
end

-- The scroll thumb: a thin bar right of the pages.
local function addThumb(f)
  f.thumb = W.Flat(f, "OVERLAY", "text2")
  f.thumb:SetWidth(3)
  f.thumb:SetAlpha(0.5)
  f.thumb:Hide()
end

-- The window frame: centered, above other windows, closes with Escape.
local function windowFrame()
  local f = T.Panel(CreateFrame("Frame", "ForeverUI_Options", UIParent), { alpha = 0.98, shadow = true })
  f:SetSize(WIDTH, HEIGHT)
  f:SetPoint("CENTER")
  f:SetFrameStrata("DIALOG")
  f:EnableMouse(true)
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, "ForeverUI_Options") end
  return f
end

-- The window, built on first use: header, footer, nav and scroll thumb.
local function build()
  window = windowFrame()
  addHeader(window)
  addHeaderControls(window)
  addFooter(window)
  addNav(window)
  addThumb(window)
  makeMovable(window)
end

-- Marks a change that applies on reload, and shows the reload notice.
function O.NeedReload()
  needsReload = true
  if window then window.reload:SetShown(true) window.notice:SetShown(true) end
end

-- Re-reads every widget's value (after a change elsewhere, e.g. a profile switch).
function O.Refresh()
  for _, w in ipairs(widgets) do
    if w.Refresh then w:Refresh() end
  end
  if window then window.profile:Refresh() window.reload:Refresh() end
end

-- Marks the current page's nav entry (accent rail, wash, text and icon) and dims pages the search misses.
local function markNav(key)
  for k, b in pairs(window.nav) do
    local on, hit = k == key, not O.matches or O.matched[k]
    b.rail:SetShown(on)
    b.wash:SetShown(on)
    b.wash:SetAlpha(0.14)
    T.Color(b.text, on and "text" or "text2")
    T.Tint(b.icon, on and "accent" or "text2")
    b:SetAlpha(hit and 1 or 0.35)
  end
end

-- Builds the current page on first view and shows only it.
local function showPage()
  for _, page in ipairs(O.PAGES) do
    if page.key == O.current and not pages[page.key] then pages[page.key] = buildPage(page) end
    if pages[page.key] then pages[page.key]:SetShown(page.key == O.current) end
  end
end

-- Brings the window up (fading in, with a sound) or, when it was already
-- open, plays the page sound for a new page.
local function appear(previous)
  if not previous then T.Sound("open") elseif previous ~= O.current then T.Sound("page") end
  if previous then T.StopFade(window) else T.FadeIn(window) end
  if pages[O.current] then scrollTo(pages[O.current], pages[O.current]:GetVerticalScroll() or 0) end
end

-- Opens the window on a page (default: the last one shown, or General).
function O.Show(key)
  if not window then build() end
  local previous = window:IsShown() and O.current
  if not previous then rowCache = {} end
  O.current = key or O.current or "general"
  showPage()
  markNav(O.current)
  window.reload:SetShown(needsReload)
  window.notice:SetShown(needsReload)
  O.Refresh()
  appear(previous)
end

-- A page's rows, built once per opening of the window rather than per search keystroke.
local function rowsOf(page)
  rowCache[page.key] = rowCache[page.key] or page.rows()
  return rowCache[page.key]
end

-- Whether a page's title or any row's caption contains the (lower-case) text.
local function pageMatches(page, text)
  if page.title:lower():find(text, 1, true) then return true end
  for _, row in ipairs(rowsOf(page)) do
    if type(row[2]) == "string" and row[2]:lower():find(text, 1, true) then return true end
  end
  return false
end

-- Drops a thrown-away page's rows from the widget list (so they're no longer refreshed or searched).
local function forgetRows(view)
  for i = #widgets, 1, -1 do
    if widgets[i].card.child == view.child then table.remove(widgets, i) end
  end
end

-- How many rows the built pages hold (for tests).
function O.RowCount()
  return #widgets
end

-- Throws a built page away so it's built again from its rows (its list
-- changed), showing it again if it's the current one.
function O.RebuildPage(key)
  rowCache[key] = nil
  if pages[key] then forgetRows(pages[key]) pages[key]:Hide() pages[key] = nil end
  if window and window:IsShown() and O.current == key then O.Show(key) end
end

-- The first row on a page whose caption has the (lower-case) text.
local function firstRow(view, text)
  for _, w in ipairs(widgets) do
    if w.card and w.card.child == view.child and type(w.caption) == "string" and w.caption:lower():find(text, 1, true) then return w end
  end
end

-- Marks a found row with an accent wash (the last one found loses its mark).
local function markFound(w)
  if window.found then window.found:Hide() end
  w.found = w.found or W.Flat(w, "BACKGROUND", "accent")
  w.found:SetAllPoints()
  w.found:SetAlpha(0.18)
  w.found:Show()
  window.found = w.found
end

-- Scrolls the current page to the first row with the text in its caption, and marks it.
function O.JumpTo(text)
  local view = pages[O.current]
  local w = view and firstRow(view, (text or ""):lower())
  if not w then return end
  scrollTo(view, w.pageY - 40)
  markFound(w)
end

-- Filters the nav by search text: pages that don't match fade; Enter opens the first match.
function O.Search(text)
  text = (text or ""):lower()
  if window and window.found then window.found:Hide() end
  O.matches, O.matched = nil, nil
  if text ~= "" then
    O.matches, O.matched = {}, {}
    for _, page in ipairs(navOrder()) do
      if pageMatches(page, text) then table.insert(O.matches, page.key) O.matched[page.key] = true end
    end
  end
  if window then markNav(O.current) end
end

-- Closes the window (and any open dropdown).
function O.Hide()
  W.CloseMenu()
  if not window or not window:IsShown() then return end
  T.Sound("close")
  T.FadeOut(window)
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
