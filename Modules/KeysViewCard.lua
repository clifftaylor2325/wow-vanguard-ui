-- The "Your keys" card on the Action bars page: a drawn keyboard and mouse where each
-- key shows the icon of the spell, macro or item on it and a short key name, with the
-- None, Shift, Ctrl and Alt tabs over it and the tab's bound keys listed under it. The
-- tabs follow the modifier held. Hover a key for what it does. It only reads: no key is
-- written, so it stays open in combat. Data: Modules/KeysView.lua.

local ADDON, ns = ...

local T = ns.Theme
local L = ns.L
local W = ns.Widgets
local O = ns.Options
local KV = ns.KeysView
local AB = ns.GetModule("ActionBars")

-- Sizes (units): a key, the gap between keys, a tab's width, and the list's lines and line height.
local SIZE = { cap = 34, gap = 3, tab = 84, tabRow = 30, lines = 8, line = 16 }
-- The keyboard picture's height: its rows (the space bar's included), then the mouse row.
local KEYBOARD_H = (#KV.ROWS + 1) * (SIZE.cap + SIZE.gap) + T.SPACE.gap
-- How faint a free key is drawn, so it reads as free without its colour.
local FREE_ALPHA = 0.55
-- The page's current frames, replaced when the page is built again.
local view = {}

-- Shows what a key does in a tooltip beside it.
local function showTip(cap)
  GameTooltip:SetOwner(cap, "ANCHOR_RIGHT")
  GameTooltip:SetText(KV.KeyText(cap.chord))
  local entry = cap.entry
  GameTooltip:AddLine(entry and entry.place or L["Nothing is bound to this key."], T.RGB("text"))
  if entry and entry.name then GameTooltip:AddLine(entry.name, T.RGB("text2")) end
  GameTooltip:Show()
end

-- Puts a key's label where its state wants it: in the corner over an icon, else in the middle.
local function placeLabel(cap, hasIcon)
  cap.label:ClearAllPoints()
  cap.label:SetPoint(hasIcon and "TOPLEFT" or "CENTER", hasIcon and 3 or 0, hasIcon and -2 or 0)
end

-- Paints a key for what it holds now: the icon and label of what is on it, or the muted label of a free key.
local function paintCap(cap)
  cap.chord = KV.Chord(KV.TabById(KV.tab), cap.key)
  cap.entry = KV.Lookup(cap.chord)
  local icon = cap.entry and cap.entry.icon
  cap.icon:SetTexture(icon)
  cap.icon:SetShown(icon ~= nil)
  placeLabel(cap, icon ~= nil)
  T.Color(cap.label, cap.entry and (icon and "text" or "accentText") or "disabled")
  cap:SetAlpha(cap.entry and 1 or FREE_ALPHA)
end

-- A key shows its tooltip under the mouse (hooked, so the button look keeps its hover).
local function wireTip(cap)
  cap:HookScript("OnEnter", ns.Guard("enter key", showTip))
  cap:HookScript("OnLeave", ns.Guard("leave key", function() GameTooltip:Hide() end))
end

-- A key: a themed button with its icon and short name, wide for the space bar.
local function newCap(parent, key, width)
  local cap = T.Button(CreateFrame("Button", nil, parent))
  cap:SetSize(width, SIZE.cap)
  cap.key = key
  cap.icon = cap:CreateTexture(nil, "ARTWORK")
  cap.icon:SetSize(SIZE.cap - 12, SIZE.cap - 12)
  cap.icon:SetPoint("CENTER")
  cap.label = T.Text(cap:CreateFontString(nil, "OVERLAY"), "barSmall")
  cap.label:SetText(AB.ShortKey(key))
  wireTip(cap)
  return cap
end

-- One keyboard row's keys, from its offset; the space bar is wide.
local function buildRow(r, row, y)
  local x = row.offset * (SIZE.cap + SIZE.gap)
  for _, key in ipairs(row.keys) do
    local width = row.wide and row.wide * SIZE.cap or SIZE.cap
    local cap = newCap(r, key, width)
    cap:SetPoint("TOPLEFT", x, -y)
    r.caps[#r.caps + 1] = cap
    x = x + width + SIZE.gap
  end
end

-- The mouse row under the keyboard: the middle and side buttons and the wheel, wider keys.
local function buildMouse(r, y)
  for i, key in ipairs(KV.MOUSE) do
    local cap = newCap(r, key, SIZE.cap * 2)
    cap:SetPoint("TOPLEFT", (i - 1) * (SIZE.cap * 2 + SIZE.gap), -y)
    r.caps[#r.caps + 1] = cap
  end
end

-- Repaints every key for the tab showing now.
local function refreshKeyboard(r)
  for _, cap in ipairs(r.caps) do paintCap(cap) end
end

-- The tab to show now: the modifier held, else the one picked.
local function wantedTab()
  local held = KV.HeldTab()
  return held ~= "none" and held or KV.picked
end

-- Whether the card is on screen.
local function cardShown()
  return view.keyboard ~= nil and view.keyboard:IsVisible()
end

-- The card was opened: shows the tab for the modifier held now (one let go while it was closed).
local function syncTab()
  KV.tab = wantedTab()
end

-- The keyboard row kind: the letter rows, the space bar and the mouse.
local function keyboardBuilder(parent, _, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, KEYBOARD_H)
  r.caps = {}
  for i, row in ipairs(KV.ROWS) do buildRow(r, row, (i - 1) * (SIZE.cap + SIZE.gap)) end
  buildMouse(r, #KV.ROWS * (SIZE.cap + SIZE.gap) + T.SPACE.gap)
  r.Refresh = refreshKeyboard
  r:HookScript("OnShow", ns.Guard("show keys card", syncTab))
  view.keyboard = r
  return r
end

-- Repaints the card's three rows (not the whole page).
local function refreshCard()
  for _, r in ipairs({ view.tabs, view.keyboard, view.list }) do r:Refresh() end
end

-- Picks a tab, which stays the one shown after a modifier is let go.
local function pickTab(id)
  KV.tab, KV.picked = id, id
  refreshCard()
end

-- A tab: a list row with its caption that shows the selected look while it is the tab showing.
local function newTab(parent, tab)
  local row = W.Row(parent, SIZE.tabRow - T.SPACE.tight, { width = SIZE.tab })
  row.label = T.Text(row:CreateFontString(nil, "OVERLAY"), "label")
  row.label:SetPoint("CENTER")
  row.label:SetText(tab.label)
  row:SetScript("OnClick", ns.Guard("click keys tab", function() pickTab(tab.id) end))
  row.tabId = tab.id
  return row
end

-- Marks the tab showing.
local function refreshTabs(r)
  for _, row in ipairs(r.tabs) do row:SetSelected(row.tabId == KV.tab) end
end

-- The tabs row kind: None, Shift, Ctrl, Alt.
local function tabsBuilder(parent, _, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, SIZE.tabRow)
  r.tabs = {}
  for i, tab in ipairs(KV.TABS) do
    r.tabs[i] = newTab(r, tab)
    r.tabs[i]:SetPoint("LEFT", (i - 1) * (SIZE.tab + SIZE.gap), 0)
  end
  r.Refresh = refreshTabs
  view.tabs = r
  return r
end

-- One list line for an entry: "Shift-Q: Bar 1 button 3 · Fireball".
local function lineText(entry)
  local what = entry.name and ns.Format(L["{place} · {name}"], { place = entry.place, name = entry.name }) or entry.place
  return ns.Format(L["{key}: {what}"], { key = KV.KeyText(entry.chord), what = what })
end

-- What the list line i says for the entries: the entry, "and N more" on the last line, or nothing.
local function lineFor(entries, i)
  if i == SIZE.lines and #entries > SIZE.lines then
    return ns.Format(L["and {n} more"], { n = #entries - SIZE.lines + 1 })
  end
  return entries[i] and lineText(entries[i]) or ""
end

-- Writes the tab's bound keys into the list's lines; a note when none is bound.
local function refreshList(r)
  local entries = KV.List(KV.TabById(KV.tab))
  for i, fs in ipairs(r.lines) do fs:SetText(lineFor(entries, i)) end
  if #entries == 0 then r.lines[1]:SetText(L["No keys are bound here."]) end
end

-- One list line, placed under the lines before it.
local function newLine(r, i)
  local fs = W.Label(r, "", "label", "text2")
  fs:SetPoint("TOPLEFT", 0, -(i - 1) * SIZE.line)
  fs:SetPoint("RIGHT", r)
  fs:SetWordWrap(false)
  return fs
end

-- The list row kind: the tab's bound keys, one per line.
local function listBuilder(parent, _, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, SIZE.lines * SIZE.line)
  r.lines = {}
  for i = 1, SIZE.lines do r.lines[i] = newLine(r, i) end
  r.Refresh = refreshList
  view.list = r
  return r
end

O.AddRowKind("keystabs", tabsBuilder, SIZE.tabRow)
O.AddRowKind("keyboard", keyboardBuilder, KEYBOARD_H + T.SPACE.gap)
O.AddRowKind("keylist", listBuilder, SIZE.lines * SIZE.line + T.SPACE.gap)

-- Holding one of Shift, Ctrl or Alt shows that tab and letting go goes back to the one picked, while the
-- card is on screen. The card's rows repaint only when the tab changes.
local function followModifier()
  if not cardShown() or wantedTab() == KV.tab then return end
  KV.tab = wantedTab()
  refreshCard()
end
ns.On("MODIFIER_STATE_CHANGED", followModifier)

-- A key or a slot changed while the card is open: repaint it (once, however many events come in a frame).
local function keysChanged()
  if cardShown() then ns.Soon("keys view", refreshCard) end
end
ns.On("UPDATE_BINDINGS", keysChanged)
ns.On("ACTIONBAR_SLOT_CHANGED", keysChanged)
