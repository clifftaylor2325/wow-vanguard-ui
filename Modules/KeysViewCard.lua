-- The "Your keys" card on the Action bars page: a drawn keyboard and mouse where each
-- key shows the icon of the spell, macro or item on it and a short key name, with the
-- None, Shift, Ctrl and Alt tabs over it and the tab's bound keys listed under it. The
-- tabs follow the modifier held. Hover a key for what it does. It only reads: no key is
-- written, so it stays open in combat. On WoW Forever, right-click a key key setup changed to
-- put it back (Modules/KeybindsApply.lua). The drawn keyboard, KV.Keyboard, is shared with key
-- setup (Modules/KeybindsWizard.lua). Data: Modules/KeysView.lua.

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
KV.KEYBOARD_H = (#KV.ROWS + 1) * (SIZE.cap + SIZE.gap) + T.SPACE.gap
-- How faint a free key is drawn, so it reads as free without its colour.
local FREE_ALPHA = 0.55
-- The page's current frames, replaced when the page is built again.
local view = {}

-- Puts a key's label where its state wants it: in the corner over an icon, else in the middle.
local function placeLabel(cap, hasIcon)
  cap.label:ClearAllPoints()
  cap.label:SetPoint(hasIcon and "TOPLEFT" or "CENTER", hasIcon and 3 or 0, hasIcon and -2 or 0)
end

-- Shows an icon on a key (nil for none), with its label in the corner over it or in the middle without.
---@param cap table  a key of KV.Keyboard
---@param icon any|nil
function KV.SetCapIcon(cap, icon)
  cap.icon:SetTexture(icon)
  cap.icon:SetShown(icon ~= nil)
  placeLabel(cap, icon ~= nil)
end

-- A key's scripts: its tooltip under the mouse (hooked, so the button look keeps its hover) and, when the
-- keyboard's owner takes clicks, a left or right click.
local function wireCap(cap, opts)
  cap:HookScript("OnEnter", ns.Guard("enter key", function(self) GameTooltip:SetOwner(self, "ANCHOR_RIGHT") opts.tip(self) GameTooltip:Show() end))
  cap:HookScript("OnLeave", ns.Guard("leave key", function() GameTooltip:Hide() end))
  if not opts.click then return end
  cap:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  cap:SetScript("OnClick", ns.Guard("click key", opts.click))
end

-- A key: a themed button with its icon and short name, wide for the space bar.
local function newCap(r, key, width)
  local cap = T.Button(CreateFrame("Button", nil, r))
  cap:SetSize(width, SIZE.cap)
  cap.key = key
  cap.icon = cap:CreateTexture(nil, "ARTWORK")
  cap.icon:SetSize(SIZE.cap - 12, SIZE.cap - 12)
  cap.icon:SetPoint("CENTER")
  cap.label = T.Text(cap:CreateFontString(nil, "OVERLAY"), "barSmall")
  cap.label:SetText(AB.ShortKey(key))
  wireCap(cap, r.opts)
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

-- Repaints every key with the keyboard's painter.
local function refreshKeyboard(r)
  for _, cap in ipairs(r.caps) do r.opts.paint(cap) end
end

-- The drawn keyboard and mouse, width wide and KV.KEYBOARD_H tall: r.caps holds its keys (each with key, icon and
-- label), r:Refresh() repaints them. opts: paint(cap) paints a key, tip(cap) fills the tooltip GameTooltip shows
-- over it, click(cap, button) (optional) takes a left or right click. Shared by the Your keys card and key setup.
---@param parent table
---@param width number
---@param opts table  paint, tip, click
---@return table r
function KV.Keyboard(parent, width, opts)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, KV.KEYBOARD_H)
  r.caps, r.opts, r.Refresh = {}, opts, refreshKeyboard
  for i, row in ipairs(KV.ROWS) do buildRow(r, row, (i - 1) * (SIZE.cap + SIZE.gap)) end
  buildMouse(r, #KV.ROWS * (SIZE.cap + SIZE.gap) + T.SPACE.gap)
  return r
end

-- The Your keys card ------------------------------------------------------------------------------

-- Whether Vanguard's key setup changed the key, so it can be put back (WoW Forever only).
local function changedHere(chord)
  return ns.IsForever() and ns.KeybindsApply.Changed(chord)
end

-- What a key does, in the tooltip; a key key setup changed says how to put it back.
local function showTip(cap)
  GameTooltip:SetText(KV.KeyText(cap.chord))
  local entry = cap.entry
  GameTooltip:AddLine(entry and entry.place or L["Nothing is bound to this key."], T.RGB("text"))
  if entry and entry.name then GameTooltip:AddLine(entry.name, T.RGB("text2")) end
  if changedHere(cap.chord) then GameTooltip:AddLine(L["Right-click to put back what this key did before key setup."], T.RGB("accentText")) end
end

-- Paints a key for what it holds now: the icon and label of what is on it, or the muted label of a free key.
local function paintCap(cap)
  cap.chord = KV.Chord(KV.TabById(KV.tab), cap.key)
  cap.entry = KV.Lookup(cap.chord)
  local icon = cap.entry and cap.entry.icon
  KV.SetCapIcon(cap, icon)
  T.Color(cap.label, cap.entry and (icon and "text" or "accentText") or "disabled")
  cap:SetAlpha(cap.entry and 1 or FREE_ALPHA)
end

-- A right-click on a key key setup changed asks, then puts back what it did before.
local function clickCap(cap, button)
  if button ~= "RightButton" or not changedHere(cap.chord) then return end
  local chord = cap.chord
  ns.Ask(ns.Format(L["Put back what {key} did before key setup changed it?"], { key = KV.KeyText(chord) }), L["Put back"], function() ns.KeybindsApply.PutBack(chord) end)
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

-- The keyboard row kind: the card's keyboard, painted with what every key does now.
local function keyboardBuilder(parent, _, width)
  local r = KV.Keyboard(parent, width, { paint = paintCap, tip = showTip, click = clickCap })
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
O.AddRowKind("keyboard", keyboardBuilder, KV.KEYBOARD_H + T.SPACE.gap)
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
