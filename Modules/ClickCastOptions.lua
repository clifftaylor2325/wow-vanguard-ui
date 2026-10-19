-- The "Click casting" options page, built so a healer never types a spell:
--   * a starter layout for the class, one click;
--   * a grid of mouse buttons by modifier, each cell the spell's icon: click a
--     cell to pick from the spellbook, right-click to clear, drop a spell on it;
--   * hover keys: press a key, pick a spell; a note when the key is also an
--     action-bar binding;
--   * a test tile: hover it and press to see what would happen, without casting;
--   * export, import and copy to another spec.
-- The spell picker is a popup listing the character's own spells in groups
-- (Heals, Protect & cleanse, Buffs, Other) with their ranks under a chevron,
-- then the plain actions (Target, Unit menu, Focus, Assist, a macro, a typed name).

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets
local CC, CS = ns.GetModule("ClickCast"), ns.ClickCastSpells
local O = ns.Options

local PAGE = "clickcast"
local MOUSE = { "Left", "Right", "Middle", "Button 4", "Button 5" }
local MODS = { { "", "Plain" }, { "shift-", "Shift" }, { "ctrl-", "Ctrl" }, { "alt-", "Alt" } }
local MORE_MODS = { { "ctrl-shift-", "Ctrl + Shift" }, { "alt-shift-", "Alt + Shift" }, { "alt-ctrl-", "Alt + Ctrl" } }
local CELL_H, LABEL_W, MAX_KEYS, PICKER_ROWS, ICON_SIZE = 40, 92, 8, 12, 24
-- How far down its cell a grid row's label sits, to be about centred in it (units).
local LABEL_DROP = 12
-- The picker's and the hover-key list's rows are list rows.
local ROW_H = T.ROW.height
-- The hover-key list's top line (Add key, a standalone button, with a tight gap over and under it): its height
-- above the rows; and the whole list's height (its rows and a gap under them).
local KEYS_TOP = T.BUTTON_H + 2 * T.SPACE.tight
local KEYS_HEIGHT = KEYS_TOP + MAX_KEYS * ROW_H + T.SPACE.gap
-- The spell picker's width, and where its rows start: the search box (T.CONTROL_H) with a gap over and under it.
local PICKER_W, PICKER_TOP = 280, T.CONTROL_H + 2 * T.SPACE.gap
local PLAIN_ACTIONS = { { "target", "Target" }, { "menu", "Unit menu" }, { "focus", "Focus" }, { "assist", "Assist" } }

-- Page state: whether the extra modifier columns show, and the key the picker is for.
local state = { more = false, pickKey = nil }

-- Shared pieces -----------------------------------------------------------------------------

-- A spell's icon from a binding, or nil for actions and spells the client doesn't know.
local function iconOf(b)
  if not b or b.action ~= "spell" then return nil end
  local s = CS.Spell(b.value)
  if s then return s.icon end
  return C_Spell and type(C_Spell.GetSpellTexture) == "function" and C_Spell.GetSpellTexture(b.spellID or b.value) or nil
end

-- A cropped icon texture in a thin border, size x size.
local function iconFrame(parent, size)
  local f = T.Panel(CreateFrame("Frame", nil, parent), { inset = true, noSheen = true })
  f:SetSize(size, size)
  f.icon = f:CreateTexture(nil, "ARTWORK")
  f.icon:SetPoint("TOPLEFT", 1, -1)
  f.icon:SetPoint("BOTTOMRIGHT", -1, 1)
  T.Crop(f.icon)
  return f
end

-- Shows a binding on an icon frame: the spell's icon, or a letter for an action, or nothing.
local function setIcon(f, b)
  local icon = iconOf(b)
  f.icon:SetTexture(icon)
  f.icon:SetShown(icon ~= nil)
  f.letter:SetText(b and not icon and CC.ActionText(b):sub(1, 1) or "")
  f:SetShown(b ~= nil)
end

-- An icon frame with a letter for actions that have no icon; :Set(binding) fills it.
local function bindingIcon(parent, size)
  local f = iconFrame(parent, size)
  f.letter = T.Text(f:CreateFontString(nil, "OVERLAY"), "name", "accentText")
  f.letter:SetPoint("CENTER")
  f.Set = setIcon
  return f
end

-- A spell's name from its id, through C_Spell or the old global; nil when the client doesn't know it.
local function spellName(id)
  if C_Spell and type(C_Spell.GetSpellName) == "function" then return C_Spell.GetSpellName(id) end
  return type(GetSpellInfo) == "function" and (GetSpellInfo(id)) or nil
end

-- Binds the spell on the cursor (dragged from the spellbook or a bar) to a key; true when it did.
local function dropSpell(key)
  local kind, _, _, id = GetCursorInfo()
  if kind ~= "spell" then return false end
  local name = spellName(id)
  if type(name) ~= "string" then return false end
  CC.Add(key, "spell", name, id)
  ClearCursor()
  return true
end

-- The spell tooltip for a spell id over a frame, where the client has one.
local function spellTooltip(f, id)
  if not GameTooltip or not id or type(GameTooltip.SetSpellByID) ~= "function" then return end
  GameTooltip:SetOwner(f, "ANCHOR_RIGHT")
  GameTooltip:SetSpellByID(id)
  GameTooltip:Show()
end

-- Hides the game tooltip.
local function hideTooltip()
  if GameTooltip then GameTooltip:Hide() end
end

-- Re-reads every row on the page after a binding changed.
local function changed()
  O.Refresh()
end

-- A hover wash over a button.
local function wash(b)
  W.Flat(b, "HIGHLIGHT", "hover"):SetAllPoints()
end

-- Spell picker --------------------------------------------------------------------------------

local picker

-- The spells of one group that match the search text.
local function matching(spells, q)
  local out = {}
  for _, s in ipairs(spells) do
    if q == "" or s.name:lower():find(q, 1, true) then out[#out + 1] = s end
  end
  return out
end

-- Appends a group's header, its spells and the ranks of the open ones to the items.
local function spellItems(items, g, spells)
  if #spells == 0 then return end
  items[#items + 1] = { header = CS.GROUP_NAMES[g] }
  for _, s in ipairs(spells) do
    items[#items + 1] = { spell = s }
    for _, r in ipairs(picker.open[s.name] and s.ranks or {}) do items[#items + 1] = { spell = s, rank = r } end
  end
end

-- Appends the plain actions, the macro and the typed-name entries.
local function actionItems(items)
  items[#items + 1] = { header = "Actions" }
  for _, a in ipairs(PLAIN_ACTIONS) do items[#items + 1] = { action = a[1], text = a[2] } end
  items[#items + 1] = { action = "macro", text = "Macro..." }
  items[#items + 1] = { action = "typed", text = "Type a spell name..." }
end

-- The picker's items: headers, spells (with their ranks when open) and actions, filtered by the search text.
local function pickerItems()
  local items, groups, q = {}, CS.Groups(), (picker.search:GetText() or ""):lower()
  for _, g in ipairs(CS.GROUPS) do spellItems(items, g, matching(groups[g], q)) end
  actionItems(items)
  return items
end

-- Closes the picker.
local function closePicker()
  if picker then picker:Hide() end
  state.pickKey = nil
end

-- Binds the picked spell (a rank's id when a rank was picked, else the name) to the picker's key.
local function pickSpell(s, r)
  CC.Add(state.pickKey, "spell", s.name, r and r.spellID or s.spellID, r and r.rank or nil)
  closePicker()
  changed()
end

-- Text without the spaces around it.
local function trim(text)
  return (text:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- Asks for a macro's text or a spell's name in the text dialog; Bind adds it to the key.
local function askText(key, action)
  local what = action == "macro" and "Macro for " or "Spell for "
  ns.AskText(what .. CC.KeyText(key), function(text)
    if CC.Add(key, action, trim(text)) then ns.HideText() changed() end
  end, "Bind")
end

-- Binds a plain action to the picker's key, or asks for the macro text or spell name.
local function pickAction(action)
  local key = state.pickKey
  closePicker()
  if action == "macro" then return askText(key, "macro") end
  if action == "typed" then return askText(key, "spell") end
  CC.Add(key, action, nil)
  changed()
end

-- What clicking a picker row does: a header nothing, a spell or rank binds, an action binds or asks.
local function pickItem(item)
  if item.header then return end
  if item.spell then return pickSpell(item.spell, item.rank) end
  pickAction(item.action)
end

-- Opens or closes a spell's ranks under it.
local function toggleRanks(item)
  picker.open[item.spell.name] = not picker.open[item.spell.name] or nil
  picker:Refresh()
end

-- A picker row's parts: an icon, text, the section header a group's name shows in, and a rank chevron.
local function rowParts(b)
  b.icon = iconFrame(b, ROW_H - T.SPACE.tight)
  b.icon:SetPoint("LEFT", 2, 0)
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "label")
  b.section = W.SectionHeader(b, "")
  b.section:SetPoint("LEFT", 2, 0)
  b.section:SetPoint("RIGHT", -2, 0)
  b.chevron = W.Button(b, "", nil, 56)
  b.chevron:SetPoint("RIGHT", -2, 0)
end

-- One picker row's frame, at slot i: a list row (W.Row) across the picker.
local function pickerRow(i)
  local top = -(PICKER_TOP + (i - 1) * ROW_H)
  local b = W.Row(picker, ROW_H)
  b:SetPoint("TOPLEFT", T.SPACE.gap, top)
  b:SetPoint("TOPRIGHT", -T.SPACE.gap, top)
  rowParts(b)
  return b
end

-- A row's text: nothing for a header (its section header shows the name), "Rank n" for a rank, else the action or spell name.
local function rowText(item)
  if item.header then return "" end
  if item.rank then return "Rank " .. item.rank.rank end
  return item.text or item.spell.name
end

-- Puts a row's text where its kind has it: a rank line indented under its spell, the rest after the icon.
local function placeRowText(b, item)
  b.text:ClearAllPoints()
  b.text:SetPoint("LEFT", item.rank and ROW_H + 20 or ROW_H + 6, 0)
  b.text:SetText(rowText(item))
end

-- Lays a row out as a group's section header (no icon), a spell, a rank line or an action.
local function fillRow(b, item)
  b.item = item
  b.section:SetShown(item.header ~= nil)
  b.section:SetText(item.header or "")
  b.icon:SetShown(item.spell ~= nil and not item.rank)
  b.icon.icon:SetTexture(item.spell and item.spell.icon or nil)
  placeRowText(b, item)
  b.chevron:SetShown(item.spell ~= nil and not item.rank and #item.spell.ranks > 1)
  b.chevron.text:SetText(item.spell and picker.open[item.spell.name] and "Ranks ^" or "Ranks v")
end

-- Fills the visible rows from the scroll offset; hides the rest.
local function refreshPicker()
  picker.items = pickerItems()
  picker.offset = math.max(0, math.min(picker.offset, #picker.items - PICKER_ROWS))
  for i = 1, PICKER_ROWS do
    local item = picker.items[picker.offset + i]
    picker.rows[i]:SetShown(item ~= nil)
    if item then fillRow(picker.rows[i], item) end
  end
  picker.more:SetText(#picker.items > picker.offset + PICKER_ROWS and "scroll for more" or "")
end

-- The spell a row's tooltip shows: the rank picked, else the spell's highest rank.
local function rowTooltip(b)
  local s = b.item and b.item.spell
  if s then spellTooltip(b, b.item.rank and b.item.rank.spellID or s.spellID) end
end

-- A row's scripts: click picks, the chevron opens ranks, hovering shows the spell's tooltip.
local function wireRow(b)
  b:SetScript("OnClick", ns.Guard("click spell picker item", function(self) pickItem(self.item) end))
  b.chevron:SetScript("OnClick", ns.Guard("click spell picker ranks", function() toggleRanks(b.item) end))
  b:SetScript("OnEnter", rowTooltip)
  b:SetScript("OnLeave", hideTooltip)
end

-- The picker's search box and the "more" line under the rows.
local function pickerParts()
  picker.search = W.Search(picker, PICKER_W - 2 * T.SPACE.gap, "Search your spells", function() picker.offset = 0 picker:Refresh() end)
  picker.search:SetPoint("TOPLEFT", T.SPACE.gap, -T.SPACE.gap)
  picker.more = T.Text(picker:CreateFontString(nil, "OVERLAY"), "small", "muted")
  picker.more:SetPoint("BOTTOMLEFT", T.SPACE.gap, T.SPACE.tight)
  picker:EnableMouseWheel(true)
  picker:SetScript("OnMouseWheel", function(self, delta) self.offset = self.offset - delta * 3 self:Refresh() end)
end

-- How the picker closes besides picking: Escape (only the picker, not the window), a click
-- anywhere outside it, or its parent hiding.
local function pickerDismissals()
  picker:EnableKeyboard(true)
  picker:SetScript("OnKeyDown", function(self, k)
    if not ns.InCombat() and ns.Client.Has("keyPropagate") then self:SetPropagateKeyboardInput(k ~= "ESCAPE") end
    if k == "ESCAPE" then closePicker() end
  end)
  picker.catcher = CreateFrame("Button", nil, UIParent)
  picker.catcher:SetAllPoints(UIParent)
  picker.catcher:SetFrameStrata("FULLSCREEN_DIALOG")
  picker.catcher:SetScript("OnClick", ns.Guard("click close spell picker", closePicker))
  picker:SetScript("OnHide", function(self) self.catcher:Hide() state.pickKey = nil end)
end

-- The picker's frame settings: above every window, kept on screen, takes the mouse.
local function pickerSettings()
  picker:SetFrameStrata("FULLSCREEN_DIALOG")
  picker:SetClampedToScreen(true)
  picker:EnableMouse(true)
end

-- Builds the picker once: a raised panel with the search, the rows and the more line.
local function pickerFrame()
  if picker then return picker end
  picker = T.Panel(CreateFrame("Frame", "Vanguard_SpellPicker", UIParent), { raised = true, shadow = true })
  picker:SetSize(PICKER_W, PICKER_TOP + PICKER_ROWS * ROW_H + T.SPACE.section)
  pickerSettings()
  pickerDismissals()
  picker.open, picker.offset, picker.rows, picker.Refresh = {}, 0, {}, refreshPicker
  pickerParts()
  for i = 1, PICKER_ROWS do picker.rows[i] = pickerRow(i) wireRow(picker.rows[i]) end
  return picker
end

-- Shows the catcher just under the picker, so a click anywhere else closes it.
local function showCatcher()
  picker.catcher:SetFrameLevel(math.max(0, picker:GetFrameLevel() - 1))
  picker.catcher:Show()
end

-- Closes the picker when its anchor hides (the page or window closed). The picker stays a child
-- of UIParent: reparenting it under the anchor let the game move it below the click catcher.
local function followAnchor(anchor)
  picker.anchor = anchor
  if anchor.vgPickerHook then return end
  anchor.vgPickerHook = true
  anchor:HookScript("OnHide", ns.Guard("hide spell picker anchor", function() if picker.anchor == anchor then closePicker() end end))
end

-- Opens the picker beside an anchor frame, for a key.
local function openPicker(anchor, key)
  pickerFrame()
  state.pickKey = key
  picker.offset = 0
  picker.search:SetText("")
  followAnchor(anchor)
  picker:ClearAllPoints()
  picker:SetPoint("TOPLEFT", anchor, "TOPRIGHT", T.SPACE.gap, 0)
  picker:Refresh()
  picker:Show()
  showCatcher()
end

-- Grid ------------------------------------------------------------------------------------------

-- The modifier columns shown: the plain four, plus the combinations when asked for.
local function columns()
  local cols = {}
  for _, m in ipairs(MODS) do cols[#cols + 1] = m end
  for _, m in ipairs(state.more and MORE_MODS or {}) do cols[#cols + 1] = m end
  return cols
end

-- Re-reads a cell: the binding's icon and name, or an empty mark.
local function refreshCell(c)
  local b = CC.Binding(c.key)
  c.iconFrame:Set(b)
  c.name:SetText(b and CC.ActionText(b) or "")
  c.empty:SetShown(b == nil)
end

-- A click on a cell: a dropped spell binds, right-click clears, left opens the picker.
local function cellClick(c, button)
  if dropSpell(c.key) then return changed() end
  if button == "RightButton" then
    CC.Remove(c.key)
    return changed()
  end
  openPicker(c, c.key)
end

-- A cell's scripts: clicks, drops and the spell tooltip.
local function wireCell(c)
  c:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  c:SetScript("OnClick", ns.Guard("click click-cast cell", cellClick))
  c:SetScript("OnReceiveDrag", function(self) if dropSpell(self.key) then changed() end end)
  c:SetScript("OnEnter", function(self) local b = CC.Binding(self.key) spellTooltip(self, b and b.spellID) end)
  c:SetScript("OnLeave", hideTooltip)
end

-- A cell's texts: the binding's name beside the icon and an empty mark in the middle.
local function cellTexts(c)
  c.name = T.Text(c:CreateFontString(nil, "OVERLAY"), "small")
  c.name:SetPoint("LEFT", c.iconFrame, "RIGHT", 5, 0)
  c.name:SetPoint("RIGHT", -2, 0)
  c.empty = T.Text(c:CreateFontString(nil, "OVERLAY"), "label", "disabled")
  c.empty:SetPoint("CENTER")
  c.empty:SetText("-")
end

-- One grid cell: a button with a hover wash, the binding's icon, its name and an empty mark.
local function cell(grid, key, width)
  local c = CreateFrame("Button", nil, grid)
  c:SetSize(width - 4, CELL_H - 4)
  c.key = key
  wash(c)
  c.iconFrame = bindingIcon(c, ICON_SIZE)
  c.iconFrame:SetPoint("LEFT", 4, 0)
  cellTexts(c)
  wireCell(c)
  return c
end

-- The column headers (modifier names) across the top of the grid: section headers, each centred over its column.
local function gridHeaders(grid, cols, cellW)
  for i, col in ipairs(cols) do
    local h = W.SectionHeader(grid, col[2], { width = cellW })
    h:SetPoint("TOPLEFT", LABEL_W + (i - 1) * cellW, 0)
    h.text:ClearAllPoints()
    h.text:SetPoint("CENTER")
  end
end

-- One grid row: the mouse button's name and a cell per column.
local function gridRow(grid, row, cols, cellW)
  local y = -(18 + (row - 1) * CELL_H)
  local l = T.Text(grid:CreateFontString(nil, "OVERLAY"), "label")
  l:SetPoint("TOPLEFT", T.SPACE.gap, y - LABEL_DROP)
  l:SetText(MOUSE[row] .. " click")
  for i, col in ipairs(cols) do
    local c = cell(grid, col[1] .. "BUTTON" .. row, cellW)
    c:SetPoint("TOPLEFT", LABEL_W + (i - 1) * cellW + 2, y - 2)
    grid.cells[#grid.cells + 1] = c
  end
end

-- Re-reads every cell.
local function refreshGrid(grid)
  for _, c in ipairs(grid.cells) do refreshCell(c) end
end

-- The grid row kind: headers, five mouse rows, cells for the current columns.
local function gridBuilder(parent, _, width)
  local grid = CreateFrame("Frame", nil, parent)
  local cols = columns()
  local cellW = math.floor((width - LABEL_W - 4) / #cols)
  grid:SetSize(width, 18 + #MOUSE * CELL_H + 4)
  grid.cells, grid.Refresh = {}, refreshGrid
  gridHeaders(grid, cols, cellW)
  for row = 1, #MOUSE do gridRow(grid, row, cols, cellW) end
  grid:Refresh()
  return grid
end

-- Hover keys ------------------------------------------------------------------------------------

-- The current spec's hover-key bindings (not mouse buttons), in order.
local function hoverBindings()
  local out = {}
  for _, b in ipairs(CC.Bindings()) do
    if not CC.MouseParts(b.key) then out[#out + 1] = b end
  end
  return out
end

-- A hover-key row's texts: the key, the binding beside its icon, the collision note.
local function keyRowTexts(row)
  row.keyText = T.Text(row:CreateFontString(nil, "OVERLAY"), "label")
  row.keyText:SetPoint("LEFT", T.SPACE.tight, 0)
  row.iconFrame = bindingIcon(row, 20)
  row.iconFrame:SetPoint("LEFT", 150, 0)
  row.text = T.Text(row:CreateFontString(nil, "OVERLAY"), "label")
  row.text:SetPoint("LEFT", 176, 0)
  row.note = T.Text(row:CreateFontString(nil, "OVERLAY"), "small", "muted")
  row.note:SetPoint("RIGHT", -90, 0)
end

-- One hover-key row (under the Add key line): a list row (W.Row) with the key, the spell's icon and name, the
-- collision note, Remove.
local function keyRow(list, i)
  local row = W.Row(list, ROW_H, { width = list:GetWidth() - 2 * T.SPACE.tight })
  row:SetPoint("TOPLEFT", T.SPACE.tight, -(KEYS_TOP + (i - 1) * ROW_H))
  keyRowTexts(row)
  row.remove = W.Button(row, "Remove", function() CC.Remove(row.key) changed() end, 80)
  row.remove:SetPoint("RIGHT")
  return row
end

-- A key's name without the "(hover)" tail.
local function keyName(key)
  return (CC.KeyText(key):gsub(" %(hover%)$", ""))
end

-- Fills a hover-key row from its binding.
local function fillKeyRow(row, b)
  row.key = b.key
  row.keyText:SetText(keyName(b.key))
  row.iconFrame:Set(b)
  row.text:SetText(CC.ActionText(b))
  local hit = CC.Collision(b.key)
  row.note:SetText(hit and ("also " .. hit) or "")
end

-- The count beside the Add key button: how many more keys there are than rows, or nothing.
local function keysNote(count)
  local extra = count - MAX_KEYS
  return extra > 0 and ("+" .. extra .. " more (/vg binds)") or ""
end

-- The top line's texts: the empty-state line while there are no keys (and keys can be made), the count after it.
local function refreshHead(list, count)
  local on = CC.SnippetsOn()
  list.empty:SetShown(count == 0 and on)
  list.more:SetText(keysNote(count))
  list.add:SetShown(on)
  list.off:SetShown(not on)
end

-- Re-reads the hover-key rows and the line over them.
local function refreshKeys(list)
  local bindings = hoverBindings()
  for i = 1, MAX_KEYS do
    local b, row = bindings[i], list.rows[i]
    row:SetShown(b ~= nil)
    if b then fillKeyRow(row, b) end
  end
  refreshHead(list, #bindings)
end

-- A captured key: a mouse click belongs in the grid; a key opens the picker.
local function keyCaptured(list, key)
  if CC.MouseParts(key) then
    list.empty:Hide()
    list.more:SetText("That's a mouse button: it lives in the grid above.")
    return
  end
  openPicker(list.add, key)
end

-- A line of text beside the Add key button (wrapping inside the card), in a role and the text2 colour.
local function headLine(list, role)
  local fs = T.Text(list:CreateFontString(nil, "OVERLAY"), role, "text2")
  fs:SetPoint("LEFT", list.add, "RIGHT", T.SPACE.gap, 0)
  fs:SetPoint("RIGHT", list, "RIGHT", -T.SPACE.gap, 0)
  fs:SetJustifyH("LEFT")
  return fs
end

-- The list's top line, right under the card's title (so it shows before any row, and before the
-- page is scrolled): the Add key capture with, beside it, the empty-state line (label text2) while there are no
-- keys, or the count (small text2); or the no-snippets note (small muted) in their place.
local function keysHead(list)
  list.add = W.KeyCapture(list, "Add key", function(key) keyCaptured(list, key) end)
  list.add:SetPoint("TOPLEFT", T.SPACE.tight, -T.SPACE.tight)
  list.empty = headLine(list, "label")
  list.empty:SetText("No hover keys yet. Add one, press the key, pick the spell.")
  list.more = headLine(list, "small")
  list.off = T.Text(list:CreateFontString(nil, "OVERLAY"), "small", "muted")
  list.off:SetPoint("TOPLEFT", T.SPACE.gap, -T.SPACE.gap)
  list.off:SetPoint("RIGHT", list, "RIGHT", -T.SPACE.gap, 0)
  list.off:SetText("This client can't compile the secure code hover keys need; mouse bindings still work.")
end

-- The hover-key list row kind: the Add key capture and its line on top, then the rows.
local function keysBuilder(parent, _, width)
  local list = CreateFrame("Frame", nil, parent)
  list:SetSize(width, KEYS_HEIGHT)
  list.rows, list.Refresh = {}, refreshKeys
  for i = 1, MAX_KEYS do list.rows[i] = keyRow(list, i) end
  keysHead(list)
  list:Refresh()
  return list
end

-- Test tile ------------------------------------------------------------------------------------

-- The player's name, or "you" where the client can't say.
local function playerName()
  local name = type(UnitName) == "function" and UnitName("player")
  return type(name) == "string" and name or "you"
end

-- What a key or click would do on the tile: "Shift + Right click -> Renew on Tester", or that nothing is bound.
local function describe(key)
  local b = CC.Binding(key)
  if not b then return keyName(key) .. " -> nothing bound" end
  return keyName(b.key) .. " -> " .. CC.ActionText(b) .. " on " .. playerName()
end

-- A key on the tile, as the binding it would be. A key the tile reads is kept from the game (so testing 1 casts
-- nothing); Escape, which still closes the window, and a lone modifier, which waits, go on to the game.
local function tileKey(tile, k)
  local keep = k ~= "ESCAPE" and not W.MODIFIER_KEYS[k]
  if not ns.InCombat() and ns.Client.Has("keyPropagate") then tile:SetPropagateKeyboardInput(not keep) end
  if keep then tile.result:SetText(describe(W.Modifiers() .. k)) end
end

-- A click on the tile, as the mouse binding it would be.
local function tileClick(tile, button)
  tile.result:SetText(describe(W.Modifiers():lower() .. "BUTTON" .. (W.MOUSE_BUTTONS[button] or 1)))
end

-- The pointer is over the tile: it reads keys until the pointer leaves.
local function tileEnter(tile)
  tile:EnableKeyboard(true)
  tile.result:SetText("Press a key or click...")
end

-- The pointer left the tile: it stops reading keys, so the game has them all again.
local function tileLeave(tile)
  tile:EnableKeyboard(false)
end

-- The wheel over the tile, as the wheel binding it would be.
local function tileWheel(tile, delta)
  tile.result:SetText(describe(W.Modifiers() .. (delta > 0 and "MOUSEWHEELUP" or "MOUSEWHEELDOWN")))
end

-- The tile's scripts: keyboard while hovered; keys, clicks and the wheel resolve against the bindings.
local function wireTile(tile)
  tile:RegisterForClicks("AnyUp")
  tile:EnableMouseWheel(true)
  tile:SetScript("OnEnter", ns.Guard("enter click-cast test tile", tileEnter))
  tile:SetScript("OnLeave", ns.Guard("leave click-cast test tile", tileLeave))
  tile:SetScript("OnKeyDown", ns.Guard("key click-cast test tile", tileKey))
  tile:SetScript("OnClick", ns.Guard("click click-cast test tile", tileClick))
  tile:SetScript("OnMouseWheel", ns.Guard("wheel click-cast test tile", tileWheel))
end

-- The tile's health bar, mostly full, with the name over it.
local function tileBar(tile)
  tile.bar = CreateFrame("StatusBar", nil, tile)
  tile.bar:SetPoint("TOPLEFT", 2, -2)
  tile.bar:SetPoint("BOTTOMRIGHT", -2, 2)
  T.StyleBar(tile.bar)
  tile.bar:SetMinMaxValues(0, 100)
  tile.bar:SetValue(78)
  tile.name = T.Text(tile.bar:CreateFontString(nil, "OVERLAY"), "name")
  tile.name:SetPoint("TOP", 0, -4)
end

-- A sample raid tile with a health bar and the player's name; insecure, so nothing is ever cast.
local function sampleTile(parent)
  local tile = T.Panel(CreateFrame("Button", nil, parent), { shadow = true })
  tile:SetSize(100, 48)
  tileBar(tile)
  return tile
end

-- Re-reads the tile: its colors and the player's name follow the theme and character.
local function refreshTile(r)
  T.BarColor(r.tile.bar, "friendly")
  r.tile.name:SetText(playerName())
end

-- The test row kind: the tile, and the line saying what the last press would do.
local function testBuilder(parent, _, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, 60)
  r.tile = sampleTile(r)
  r.tile:SetPoint("LEFT", T.SPACE.gap, 0)
  r.tile.result = T.Text(r:CreateFontString(nil, "OVERLAY"), "label", "text2")
  r.tile.result:SetPoint("LEFT", r.tile, "RIGHT", T.SPACE.col, 0)
  r.tile.result:SetText("Hover the tile, then press a key or click: it says what would happen. Nothing is cast.")
  wireTile(r.tile)
  r.Refresh = refreshTile
  return r
end

-- Layout, sharing and page -------------------------------------------------------------------------

-- Fills the grid with the class's starter layout.
local function applyLayout()
  CC.ApplyLayout(CS.Layout())
  T.Sound("on")
  changed()
end

-- Shows or hides the extra modifier columns (the page is built again for the new width).
local function toggleMore()
  state.more = not state.more
  O.RebuildPage(PAGE)
end

-- The layout row kind: the class layout button (when the class has one), Clear all, and the modifier columns switch.
local function layoutBuilder(parent, _, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, 32)
  r.layout = W.Button(r, CS.ClassName() .. " healing layout", applyLayout, 200)
  r.layout:SetPoint("LEFT", T.SPACE.gap, 0)
  r.layout:SetShown(CS.HasLayout())
  r.clear = W.Button(r, "Clear all", function() CC.Clear() changed() end)
  r.clear:SetPoint("LEFT", r.layout, "RIGHT", T.SPACE.gap, 0)
  r.more = W.Button(r, state.more and "Fewer modifiers" or "More modifiers", toggleMore, 140)
  r.more:SetPoint("RIGHT", -T.SPACE.gap, 0)
  return r
end

-- Imports a bindings string from the text dialog, saying how it went in chat.
local function importText(text)
  local n, err = CC.Import(text)
  ns.Chat(n and ("Imported " .. n .. " click-casting bindings.") or ("Can't import: " .. err .. "."))
  if n then ns.HideText() changed() end
end

-- The other specs (as { index, "Copy to spec n" } choices), where the client has specializations.
local function otherSpecs()
  local out, n = {}, type(GetNumSpecializations) == "function" and GetNumSpecializations() or 0
  for i = 1, n do
    if i ~= ns.SpecIndex() then out[#out + 1] = { i, "Copy to spec " .. i } end
  end
  return out
end

-- Copies the bindings to another spec and says so.
local function copyToSpec(spec)
  CC.CopyToSpec(spec)
  ns.Chat("Click-casting bindings copied to spec " .. spec .. ".")
end

-- Shows the copy dropdown's caption, and the dropdown only while there is another spec.
local function refreshCopy(d)
  d.text:SetText("Copy to spec...")
  d:SetShown(#otherSpecs() > 0)
end

-- The copy-to-spec dropdown, beside the Import button.
local function copyDropdown(r)
  r.copy = W.Dropdown(r, otherSpecs, function() return nil end, copyToSpec, 160)
  r.copy:SetPoint("LEFT", r.import, "RIGHT", T.SPACE.gap, 0)
  r.copy.Refresh = refreshCopy
end

-- The sharing row kind: Export, Import, and a copy-to-spec dropdown where there are specs.
local function shareBuilder(parent, _, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, 32)
  r.export = W.Button(r, "Export", function() ns.ShowText("Click-casting bindings", CC.Export()) end)
  r.export:SetPoint("LEFT", T.SPACE.gap, 0)
  r.import = W.Button(r, "Import", function() ns.AskText("Paste a click-casting string", importText) end)
  r.import:SetPoint("LEFT", r.export, "RIGHT", T.SPACE.gap, 0)
  copyDropdown(r)
  -- The row re-reads through its dropdown (the buttons never change).
  r.Refresh = function(self) self.copy:Refresh() end
  r:Refresh()
  return r
end

-- The line over the grid: whose bindings, or the combat notice while a fight is on.
local function title()
  if ns.InCombat() then return "In combat: changes are kept and apply when the fight ends." end
  if CC.UsesGame() then return "The game's click bindings are in use (below): these are kept for when you switch back." end
  local spec = ns.SpecIndex()
  local whose = spec and ("spec " .. spec .. " on this character") or "this character"
  return "Bindings for " .. whose .. ". Click a cell to pick a spell, right-click to clear, or drop a spell on it."
end

-- Whether click casting also covers the unit frames.
local function unitFramesOn()
  return ns.Settings("ClickCast", CC.defaults).unitFrames
end

-- Turns click casting on the unit frames on or off (applies on reload).
local function setUnitFrames(on)
  ns.Settings("ClickCast", CC.defaults).unitFrames = on
  O.NeedReload()
end

O.AddRowKind("bindlayout", layoutBuilder, 36)
O.AddRowKind("bindgrid", gridBuilder, 18 + #MOUSE * CELL_H + 8)
O.AddRowKind("bindkeys", keysBuilder, KEYS_HEIGHT + T.SPACE.tight)
O.AddRowKind("bindtest", testBuilder, 64)
O.AddRowKind("bindshare", shareBuilder, 36)

-- The page's rows: the grid and its tools, the hover keys, the test tile, sharing, the unit-frame switch.
local ROWS = {
  { "header", "Click casting" },
  { "text", title },
  { "bindlayout" },
  { "bindgrid" },
  { "header", "Keys while hovering a frame" },
  { "bindkeys" },
  { "header", "Try it" },
  { "bindtest" },
  { "header", "Share" },
  { "bindshare" },
  { "check", "Also on your player, target and focus frames (reload)", unitFramesOn, setUnitFrames },
}

-- Whether the game's click bindings are switched on.
local function useGameOn()
  return ns.Settings("ClickCast", CC.defaults).useGame
end

-- Switches to the game's click bindings or back (out of combat), then re-reads the page.
local function setUseGame(on)
  if CC.settings then CC.SetUseGame(on) else ns.Settings("ClickCast", CC.defaults).useGame = on end
  changed()
end

-- Opens the game's own Click Casting window (it loads on demand).
local function openGameBindings()
  if type(ToggleClickBindingFrame) ~= "function" then return ns.Chat("This client has no click bindings window.") end
  O.Hide()
  ToggleClickBindingFrame()
end

-- The page's rows on a client with the game's click bindings: Vanguard's, then the switch to the game's.
local WITH_GAME = {}
for _, row in ipairs(ROWS) do WITH_GAME[#WITH_GAME + 1] = row end
for _, row in ipairs({
  { "header", "The game's click bindings" },
  { "text", "The game has click casting of its own (its Click Casting window). Switched on, it works on the raid and unit frames and Vanguard's bindings and hover keys above rest.", "note" },
  { "check", "Use the game's click bindings instead", useGameOn, setUseGame, false },
  { "button", "Open the game's click bindings", openGameBindings },
}) do WITH_GAME[#WITH_GAME + 1] = row end

-- The page's rows (built again after the modifier columns change); the game's
-- click bindings are offered where the client has them.
local function rows()
  return type(C_ClickBindings) == "table" and WITH_GAME or ROWS
end

O.AddPage({ key = PAGE, title = "Click casting", icon = "NavClickCasting", order = 46, rows = rows })

-- An open picker follows the bindings once they apply.
local function pickerFollows()
  if picker and picker:IsShown() then picker:Refresh() end
end

-- When a fight ends the queued changes apply: re-read the page; the picker follows the bindings too.
ns.On("PLAYER_REGEN_ENABLED", changed)
CC.OnApplied = pickerFollows
