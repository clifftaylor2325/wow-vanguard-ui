-- Key setup: a three-step window around a drawn keyboard that suggests a key for each of your class's spells and
-- writes them only when you press Apply. Step 1 asks whether to set up recommended keys, with your role and whether
-- your mouse has side buttons; step 2 shows the keyboard with the proposed keys (the None, Shift, Ctrl and Alt tabs,
-- the bar page for each stance or form, "Show what comes later", and a key pressed over the keyboard lights up and
-- says what it will do, casting nothing); step 3 lists every change with a tick box, warns when your keys are shared
-- by all your characters, and applies through the apply engine (Modules/KeybindsApply.lua). Opened from the Your
-- keys card on the Action bars page, and once after first-run setup (VanguardCharDB.keysOffer). WoW Forever only.
-- With a bar addon loaded, Vanguard's action bars off or the gamepad on, step 1 says why it changes nothing.

local ADDON, ns = ...

local L = ns.L
local T, W = ns.Theme, ns.Widgets
local KA, KL, KV, D = ns.KeybindsApply, ns.KeybindsLayouts, ns.KeysView, ns.KeybindsData

local WZ = {}
ns.KeybindsWizard = WZ

-- The window's size, its content's width and the room each step's parts take (units).
WZ.WIDTH, WZ.HEIGHT = 600, 600
local CONTENT_W = WZ.WIDTH - 2 * T.SPACE.pad
local SIZE = { caption = 18, question = 36, note = 48, line = 16, lines = 5, result = 32, intro = 34, footnote = 34 }
-- The steps, in order, with their titles.
WZ.STEPS = { { id = "start", title = L["Your keys"] }, { id = "preview", title = L["Here's what changes"] }, { id = "ready", title = L["Ready"] } }
-- How faint a key that doesn't change is drawn on the preview, so the new keys stand out.
local FADED = 0.55
-- The names of the pet keys' commands; a stance key is named after its form.
local COMMAND_NAMES = { BONUSACTIONBUTTON1 = L["Pet Attack"], BONUSACTIONBUTTON2 = L["Pet Follow"] }
-- What Not now and Keep my keys say once.
local NOT_NOW = L["Nothing has changed. You can open key setup again from Action bars, Your keys."]
-- Listeners told after a successful Apply, with the preset: WZ.onApply[#WZ.onApply + 1] = fn.
WZ.onApply = {}

-- State while the window is open: preset { class, role, sides }, step, tab, page, later (show what comes later),
-- entries and rows (the resolver's entries and the apply engine's plan, one row per entry), off ({ [entry] = true }
-- for an unticked change), scope ("char" or "all"), lit (the chord pressed last).
local state = { step = 1, tab = "none", page = 1, later = false, off = {}, scope = "char" }
WZ.state = state

-- Why key setup changes nothing here ------------------------------------------------------------

-- Whether the game's gamepad interface is on (InputUtil, where the client has it).
local function gamepad()
  return type(InputUtil) == "table" and type(InputUtil.IsGamepadUIEnabled) == "function" and InputUtil.IsGamepadUIEnabled() == true
end

-- Why key setup won't change keys on this character, as step 1 says it; nil when it will.
function WZ.Blocked()
  local bars = ns.GetModule("Coexist").Overlaps("ActionBars")
  if bars[1] then return ns.Format(L["You use {addon} for your bars, so Vanguard won't change your keys. Your keys on the Action bars page still shows what every key does."], { addon = bars[1] }) end
  local AB = ns.GetModule("ActionBars")
  if not (AB and AB.enabled) then return L["Vanguard's action bars are off, so key setup has no bars to put spells on."] end
  if gamepad() then return L["You play with a gamepad, so Vanguard won't change your keys."] end
end

-- Whether key setup offers keys on this character: WoW Forever, Vanguard's bars, no bar addon, no gamepad.
---@return boolean
function WZ.Offered()
  return ns.IsForever() and WZ.Blocked() == nil
end

-- Reading the plan ---------------------------------------------------------------------------------

-- The class's layout for the preset, or nil for a class key setup has none for.
local function classData()
  return state.preset and D.CLASSES[state.preset.class]
end

-- Works the plan out again for the preset: the entries for what the character knows, and what each would do.
local function replan()
  state.entries = KL.Resolve(state.preset)
  state.rows = KA.Plan(state.entries)
  state.laterEntries = state.later and KL.Resolve(state.preset, nil, KL.KnowsLater) or {}
end

-- The bar a slot is on: 2 for 61 to 72, 3 for 49 to 60, else 1.
local function barOf(slot)
  if slot and slot >= 61 and slot <= 72 then return 2 end
  return slot and slot >= 49 and slot <= 60 and 3 or 1
end

-- Whether an entry shows with the bar page picked: a bar 1 key only on its own page, every other key always.
local function onPage(entry)
  local page = classData() and classData().pages[state.page]
  if not entry.slot or barOf(entry.slot) ~= 1 or not page then return true end
  return entry.slot >= page.base and entry.slot < page.base + 12
end

-- The position in a list of entries of the one for a chord on the page picked, or nil.
local function indexFor(entries, chord)
  for i, entry in ipairs(entries or {}) do
    if entry.key == chord and onPage(entry) then return i end
  end
end

-- The tab a chord belongs to: none, shift, ctrl or alt (a chord with two modifiers belongs to none of them).
local function tabOf(chord)
  for _, tab in ipairs(KV.TABS) do
    if tab.prefix ~= "" and chord:sub(1, #tab.prefix) == tab.prefix and not chord:find("-", #tab.prefix + 1, true) then return tab.id end
  end
  return not chord:find("-", 1, true) and "none" or nil
end

-- Words for the plan --------------------------------------------------------------------------------

-- A spell's name, or its ID while the client hasn't named it.
local function spellText(id)
  return ns.SpellName(id) or tostring(id)
end

-- What a stance or pet key presses: the form's name, Pet Attack or Pet Follow.
local function commandText(command)
  local n = tonumber(command:match("^SHAPESHIFTBUTTON(%d+)$"))
  local form = n and ns.PlainNumber(select(4, GetShapeshiftFormInfo(n)))
  if form then return spellText(form) end
  return COMMAND_NAMES[command] or ns.Format(L["Stance {n}"], { n = n or "?" })
end

-- How each kind of change reads ("F: Kick added to your bar"), filled with the key, spell, bar and moved spell.
local CHANGE_TEXT = {
  place = L["{key}: {spell} added to your bar"], bind = L["{key}: your {spell} on bar {bar}"],
  move = L["{key}: {spell}, and {moved} moves to bar 3"], command = L["{key}: {spell}"],
}
-- Why a key stays as it was, by the apply engine's reason; a reason not listed isn't shown.
local KEPT_TEXT = {
  kept = L["{key}: unchanged, its button holds something key setup leaves alone (a macro, an item or a mount)"],
  full = L["{key}: unchanged, bar 3 has no free button to move a spell to"], barOff = L["{key}: unchanged, bar {bar} is off"],
  used = L["{key}: unchanged, another key already uses that button"], keys = L["{key}: unchanged, its button already has two keys"],
}

-- One plan row in words, or nil for a row that needn't be listed (already set, or a spell not known yet).
local function rowText(row, entry)
  local text = CHANGE_TEXT[row.kind] or KEPT_TEXT[row.why]
  if not text then return nil end
  local spell = row.kind == "command" and commandText(row.command) or spellText(row.spell)
  local moved = row.moved and spellText(row.moved)
  return ns.Format(text, { key = KV.KeyText(row.key), spell = spell, bar = barOf(row.slot or entry.slot), moved = moved })
end

-- What a key will do, for the line under the keyboard: its change, or that it stays as it is.
local function keyText(chord)
  local i = indexFor(state.entries, chord)
  local text = i and rowText(state.rows[i], state.entries[i])
  return text or ns.Format(L["{key}: stays as it is"], { key = KV.KeyText(chord) })
end

-- The step frames ------------------------------------------------------------------------------------

-- Puts a part on a step under the parts before it, h units tall (s.y is where the next one goes).
local function stack(s, part, h)
  part:SetPoint("TOPLEFT", 0, -s.y)
  s.y = s.y + h + T.SPACE.tight
  return part
end

-- A wrapping line of text across a step, in a role and colour.
local function textLine(s, role, color, h)
  local fs = T.Text(s:CreateFontString(nil, "OVERLAY"), role, color)
  fs:SetWidth(CONTENT_W)
  fs:SetJustifyH("LEFT")
  return stack(s, fs, h)
end

-- A step's frame, filling the window between the caption and the footer.
local function stepFrame(f)
  local s = CreateFrame("Frame", nil, f)
  s:SetPoint("TOPLEFT", T.SPACE.pad, -(ns.DIALOG.head + SIZE.caption))
  s:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, ns.DIALOG.foot)
  s.y = 0
  return s
end

-- Step 1: the question, your role and your mouse ---------------------------------------------------

-- The role choices for the class: Levelling, then its roles.
local function roleChoices(class)
  local out = { { "levelling", D.ROLE_NAMES.levelling } }
  for _, spec in ipairs(class and class.specs or {}) do out[#out + 1] = { spec[1], D.ROLE_NAMES[spec[1]] } end
  return out
end

-- Step 1's parts: the question, a note, the role choice (classes with roles) and the side-button switch.
local function buildStart(f)
  local s = stepFrame(f)
  s.question = textLine(s, "name", "text", SIZE.question)
  s.note = textLine(s, "label", "text2", SIZE.note)
  s.role = stack(s, W.Choice(s, L["Your role"], roleChoices(classData()), function() return state.preset.role end, function(v) state.preset.role = v end, CONTENT_W), W.ROW_HEIGHT)
  s.sides = stack(s, W.Check(s, L["My mouse has side buttons (4 and 5)"], function() return state.preset.sides end, function(v) state.preset.sides = v end, CONTENT_W), W.ROW_HEIGHT)
  return s
end

-- The class's name as the client gives it, or "character" while it is hidden.
local function className()
  return ns.PlainText((UnitClass("player"))) or L["character"]
end

-- Fills step 1: the question for your class, or why key setup changes nothing here.
local function showStart(s)
  local blocked = WZ.Blocked()
  s.question:SetText(blocked or ns.Format(L["Set up recommended keys for your {class}?"], { class = className() }))
  s.note:SetText(blocked and "" or L["Key setup puts your spells on keys that suit your class. Nothing changes until you press Apply on the last step."])
  s.role:SetShown(not blocked and classData() ~= nil and classData().specs ~= nil)
  s.sides:SetShown(not blocked)
  s.role:Refresh()
  s.sides:Refresh()
end

-- Step 2: the drawn keyboard -------------------------------------------------------------------------

-- A spell's icon, or nil while the client has none.
local function spellIcon(id)
  local icon = ns.CallIf(C_Spell, "GetSpellTexture", id)
  return not ns.IsSecret(icon) and icon or nil
end

-- What a plan row puts on its key, as an icon: the spell's, or the form's for a stance key (a pet key has none).
local function rowIcon(row)
  if row.spell then return spellIcon(row.spell) end
  local n = tonumber(row.command:match("^SHAPESHIFTBUTTON(%d+)$"))
  local icon = n and GetShapeshiftFormInfo(n)
  return not ns.IsSecret(icon) and icon or nil
end

-- Paints a key in one look: its icon (desaturated or not), label colour and alpha.
local function paintAs(cap, icon, grey, color, alpha)
  KV.SetCapIcon(cap, icon)
  cap.icon:SetDesaturated(grey)
  T.Color(cap.label, cap.chord == state.lit and "accent" or color)
  cap:SetAlpha(alpha)
end

-- Paints a key on the preview: a change in full with its new icon; with "Show what comes later", a spell the
-- character will learn, greyed; otherwise what the key does now, faint.
local function paintPreview(cap)
  cap.chord = KV.Chord(KV.TabById(state.tab), cap.key)
  local i = indexFor(state.entries, cap.chord)
  local row = i and state.rows[i]
  if row and KA.WRITES[row.kind] then return paintAs(cap, rowIcon(row), false, "accentText", 1) end
  local later = not i and indexFor(state.laterEntries, cap.chord)
  if later then return paintAs(cap, spellIcon(state.laterEntries[later].spell), true, "disabled", FADED) end
  local now = KV.Lookup(cap.chord)
  paintAs(cap, now and now.icon, false, now and "text" or "disabled", FADED)
end

-- The tooltip over a key on the preview: what it does now, and what key setup will make it do.
local function tipPreview(cap)
  GameTooltip:SetText(KV.KeyText(cap.chord))
  local now = KV.Lookup(cap.chord)
  GameTooltip:AddLine(now and now.place or L["Nothing is bound to this key."], T.RGB("text2"))
  local later = not indexFor(state.entries, cap.chord) and indexFor(state.laterEntries, cap.chord)
  local text = later and ns.Format(L["Later: {spell}, once you learn it"], { spell = spellText(state.laterEntries[later].spell) }) or keyText(cap.chord)
  GameTooltip:AddLine(text, T.RGB("accentText"))
end

-- The changes the preview lists under the keyboard: on the tab and bar page shown.
local function shownChanges()
  local out = {}
  for i, row in ipairs(state.rows) do
    local entry = state.entries[i]
    if KA.WRITES[row.kind] and tabOf(entry.key) == state.tab and onPage(entry) then out[#out + 1] = rowText(row, entry) end
  end
  return out
end

-- Writes the changes into the list's lines: "and N more" on the last line when they don't all fit.
local function fillLines(s)
  local changes = shownChanges()
  for i, fs in ipairs(s.lines) do
    local more = i == SIZE.lines and #changes > SIZE.lines
    fs:SetText(more and ns.Format(L["and {n} more"], { n = #changes - SIZE.lines + 1 }) or changes[i] or "")
  end
  if #changes == 0 then s.lines[1]:SetText(L["No key changes here."]) end
end

-- Repaints step 2: the choices, the keyboard and the list.
local function refreshPreview()
  local s = WZ.frame.steps.preview
  for _, part in ipairs({ s.tabs, s.page, s.later, s.board }) do part:Refresh() end
  fillLines(s)
end

-- A key pressed over the keyboard: its tab shows, its key lights up, and the line says what it will do.
local function pressed(_, chord)
  state.tab = tabOf(chord) or state.tab
  state.lit = chord
  refreshPreview()
  WZ.frame.steps.preview.result:SetText(keyText(chord))
end

-- The bar page choices for the class: each page by its stance or form's name, or its own label.
local function pageChoices()
  local out = {}
  for i, page in ipairs(classData() and classData().pages or {}) do
    local name = page.forms and ns.SpellName(page.forms[1])
    out[i] = { i, name or page.label or ns.Format(L["Page {n}"], { n = i }) }
  end
  return out
end

-- The tab choices: None, Shift, Ctrl and Alt.
local function tabChoices()
  local out = {}
  for i, tab in ipairs(KV.TABS) do out[i] = { tab.id, tab.label } end
  return out
end

-- Picks a value for one of step 2's choices and repaints.
local function chooser(key)
  return function() return state[key] end, function(v) state[key] = v refreshPreview() end
end

-- Step 2's choices: the tab, the bar page (a class with more than one) and Show what comes later.
local function previewChoices(s)
  local tabGet, tabSet = chooser("tab")
  s.tabs = stack(s, W.Choice(s, L["Keys with"], tabChoices(), tabGet, tabSet, CONTENT_W), W.ROW_HEIGHT)
  local pageGet, pageSet = chooser("page")
  s.page = stack(s, W.Choice(s, L["Bar page"], pageChoices(), pageGet, pageSet, CONTENT_W), W.ROW_HEIGHT)
  s.later = stack(s, W.Check(s, L["Show what comes later"], function() return state.later end, function(v) state.later = v replan() refreshPreview() end, CONTENT_W), W.ROW_HEIGHT)
end

-- Step 2's parts: the choices, the keyboard (it reads keys while the pointer is over it), the line about the key
-- pressed, and the list of changes.
local function buildPreview(f)
  local s = stepFrame(f)
  previewChoices(s)
  s.board = stack(s, KV.Keyboard(s, CONTENT_W, { paint = paintPreview, tip = tipPreview }), KV.KEYBOARD_H)
  W.HoverKeys(s.board, pressed)
  s.result = textLine(s, "label", "text", SIZE.result)
  s.lines = {}
  for i = 1, SIZE.lines do s.lines[i] = textLine(s, "label", "text2", SIZE.line) end
  return s
end

-- Fills step 2 for the plan: the bar page choice only for a class with more than one page.
local function showPreview(s)
  s.page:SetShown(#pageChoices() > 1)
  s.result:SetText(L["Hover the keyboard and press a key to see what it will do. Nothing is cast."])
  refreshPreview()
end

-- Step 3: the changes, and Apply -------------------------------------------------------------------

-- The list's width: the view's, less the scroll thumb and a gap.
local LIST_W = CONTENT_W - T.SCROLL.thumb - T.SPACE.gap

-- A tick box row of the list, for whichever change its slot names (slot.i): ticked unless the player unticked it.
local function newCheck(child)
  local slot = {}
  local r = W.Check(child, "", function() return not state.off[slot.i] end, function(v) state.off[slot.i] = not v or nil end, LIST_W)
  r.slot = slot
  return r
end

-- A muted line of the list, for a key that stays as it is; it wraps to two lines.
local function newLine(child)
  local fs = W.Label(child, "", "label", "muted")
  fs:SetWidth(LIST_W)
  fs:SetJustifyH("LEFT")
  return fs
end

-- The list's next part of a kind (a tick box or a line), made the first time it is needed, shown y units down.
local function nextPart(s, kind, y)
  local pool = s.pools[kind]
  pool.used = pool.used + 1
  pool[pool.used] = pool[pool.used] or (kind == "check" and newCheck or newLine)(s.view.child)
  local part = pool[pool.used]
  part:ClearAllPoints()
  part:SetPoint("TOPLEFT", 0, -y)
  part:Show()
  return part
end

-- One listed row y units down: a change with its tick box, or a key that stays. Answers the room it took.
local function listRow(s, i, text, y)
  if not KA.WRITES[state.rows[i].kind] then nextPart(s, "line", y):SetText(text) return 2 * SIZE.line end
  local r = nextPart(s, "check", y)
  r.slot.i = i
  r.label:SetText(text)
  r:Refresh()
  return W.ROW_HEIGHT
end

-- Lists every change and every key that stays, and hides the parts left over from a longer list.
local function fillReady(s)
  for _, pool in pairs(s.pools) do pool.used = 0 end
  local y = 0
  for i, row in ipairs(state.rows) do
    local text = rowText(row, state.entries[i])
    if text then y = y + listRow(s, i, text, y) end
  end
  for _, pool in pairs(s.pools) do
    for n = pool.used + 1, #pool do pool[n]:Hide() end
  end
  s.view:Fit(math.max(y, SIZE.line))
end

-- Step 3's footnote at the bottom: where the keys are saved, and how to put them back.
local function addFootnote(s)
  s.footnote = T.Text(s:CreateFontString(nil, "OVERLAY"), "small", "muted")
  s.footnote:SetPoint("BOTTOMLEFT", 0, 0)
  s.footnote:SetWidth(CONTENT_W)
  s.footnote:SetJustifyH("LEFT")
  s.footnote:SetText(L["The keys are saved in the game's own key bindings, and Put everything back on the Your keys card restores them."])
end

-- Step 3's parts: the intro, the scrolling list, the shared-keys warning with its choice, and the footnote.
local function buildReady(f)
  local s = stepFrame(f)
  s.intro = textLine(s, "label", "text2", SIZE.intro)
  s.intro:SetText(L["Here's what changes. Untick a change to leave that key as it is."])
  s.view = ns.ScrollView(s, { width = CONTENT_W })
  s.pools = { check = {}, line = {} }
  s.view:SetPoint("TOPLEFT", 0, -s.y)
  s.view:SetPoint("BOTTOMRIGHT", 0, SIZE.footnote + W.ROW_HEIGHT + SIZE.line + 3 * T.SPACE.tight)
  addFootnote(s)
  return s
end

-- The scope choice under the list: Only this character or All my characters, for keys shared by every character.
local function addScope(s)
  s.shared = T.Text(s:CreateFontString(nil, "OVERLAY"), "label", "warn")
  s.shared:SetPoint("BOTTOMLEFT", 0, SIZE.footnote + W.ROW_HEIGHT + 2 * T.SPACE.tight)
  s.shared:SetText(L["Your keys are shared: these keys change on all your characters."])
  local choices = { { "char", L["Only this character"] }, { "all", L["All my characters"] } }
  s.scope = W.Choice(s, L["Change keys for"], choices, function() return state.scope end, function(v) state.scope = v end, CONTENT_W)
  s.scope:SetPoint("BOTTOMLEFT", 0, SIZE.footnote + T.SPACE.tight)
end

-- Fills step 3: the list, and the scope choice only while the game uses the account's keys.
local function showReady(s)
  fillReady(s)
  local shared = KA.SharesKeys()
  s.shared:SetShown(shared)
  s.scope:SetShown(shared)
  s.scope:Refresh()
end

-- The window ----------------------------------------------------------------------------------------

-- Fills each step when it shows.
local SHOW = { start = showStart, preview = showPreview, ready = showReady }

-- The footer's buttons for the step: Keep my keys or Not now, Back from step 2, and Show me, Next or Apply.
local function footerFor(f, n)
  local blocked = n == 1 and WZ.Blocked() ~= nil
  f.notNow.text:SetText(blocked and L["Close"] or n == 1 and L["Keep my keys"] or L["Not now"])
  f.back:SetShown(n > 1)
  f.next:SetShown(not blocked)
  f.next.text:SetText(n == 1 and L["Show me"] or n == #WZ.STEPS and L["Apply"] or L["Next"])
end

-- Shows step n: its frame filled, the caption and the footer.
function WZ.Show(n)
  local f, step = WZ.frame, WZ.STEPS[n]
  state.step = n
  for _, s in ipairs(WZ.STEPS) do f.steps[s.id]:SetShown(s.id == step.id) end
  f.caption:SetText(ns.Format(L["Step {step} of {count}: {title}"], { step = n, count = #WZ.STEPS, title = step.title }))
  footerFor(f, n)
  SHOW[step.id](f.steps[step.id])
end

-- The entries the player kept ticked, for Apply.
local function kept()
  local out = {}
  for i, entry in ipairs(state.entries) do
    if not state.off[i] then out[#out + 1] = entry end
  end
  return out
end

-- Applies the kept changes in the scope picked; on success the window closes and the listeners hear of it.
local function apply()
  local set = KA.SharesKeys() and state.scope == "char" and Enum.BindingSet.Character or nil
  if not KA.Apply(kept(), set) then return end
  WZ.frame:Hide()
  for _, fn in ipairs(WZ.onApply) do fn(state.preset) end
end

-- Next: from step 1 the plan is worked out (and every change ticked again); on the last step, Apply.
function WZ.Next()
  if state.step == #WZ.STEPS then return apply() end
  if state.step == 1 then state.off = {} replan() end
  WZ.Show(state.step + 1)
end

-- Not now or Keep my keys: closes, and says once how to come back.
local function notNow()
  WZ.frame:Hide()
  ns.Chat(NOT_NOW)
end

-- The footer: Not now on the left; Back and the step's main button on the right.
local function footer(f)
  f.notNow = ns.DialogButton(f, L["Not now"])
  f.notNow:SetPoint("BOTTOMLEFT", T.SPACE.pad, T.SPACE.pad)
  f.notNow:SetScript("OnClick", ns.Guard("key setup not now", notNow))
  f.next = W.Primary(f, L["Next"], function() WZ.Next() end)
  f.next:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.pad)
  f.back = W.Button(f, L["Back"], function() WZ.Show(state.step - 1) end)
  f.back:SetPoint("RIGHT", f.next, "LEFT", -T.SPACE.gap, 0)
end

-- Builds the window once: a dialog (its X and Escape close it) with the caption, the three steps and the footer.
local function build()
  local f = ns.Dialog("Vanguard_KeysWizard", WZ.WIDTH, WZ.HEIGHT, L["Key setup"])
  f.caption = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "muted")
  f.caption:SetPoint("TOPLEFT", T.SPACE.pad, -ns.DIALOG.head)
  f.steps = { start = buildStart(f), preview = buildPreview(f), ready = buildReady(f) }
  addScope(f.steps.ready)
  footer(f)
  return f
end

-- The game window that changes keys itself and is open now, or nil.
local function keyWindowOpen()
  for _, name in ipairs(KA.KEY_WINDOWS) do
    local w = _G[name]
    if type(w) == "table" and type(w.IsShown) == "function" and w:IsShown() == true then return name end
  end
end

-- Opens key setup on step 1 (WoW Forever only; after the fight when one is on; not while the game's key windows
-- are open). It keeps the answers given earlier this session.
function WZ.Open()
  if not ns.IsForever() then return ns.Chat(L["Vanguard's key setup is for WoW Forever only."]) end
  if ns.InCombat() then return ns.OutOfCombat(WZ.Open, "key setup") end
  if keyWindowOpen() then return ns.Chat(L["Close the game's Settings, Quick Keybind and Click Casting windows first."]) end
  VanguardCharDB.keysOffer = false
  state.preset = state.preset or KL.Preset()
  WZ.frame = WZ.frame or build()
  WZ.Show(1)
  WZ.frame:Show()
end

-- In a fight ----------------------------------------------------------------------------------------

-- The fight is over: key setup comes back on the step it was on.
local function resume()
  if not state.resume then return end
  state.resume = nil
  WZ.Show(state.step)
  WZ.frame:Show()
end

-- A fight starting: key setup steps aside, says so, and comes back after it.
local function stepAside()
  if not (WZ.frame and WZ.frame:IsShown()) then return end
  WZ.frame:Hide()
  state.resume = true
  ns.Chat(L["Key setup steps aside for the fight and comes back after it."])
  ns.AfterCombat(resume, "key setup resume")
end
ns.On("PLAYER_REGEN_DISABLED", stepAside)

-- The offer after first-run setup -------------------------------------------------------------------

-- Whether What's new is on screen.
local function whatsNewShown()
  local f = _G.Vanguard_WhatsNew
  return f ~= nil and f:IsShown()
end

-- At login, once after first-run setup left its note (VanguardCharDB.keysOffer): key setup opens when this
-- character can use it and setup and What's new are both out of the way (else it waits for a later login).
local function offerOnce()
  if VanguardCharDB.keysOffer ~= true or not WZ.Offered() then return end
  if ns.Setup.Step() or whatsNewShown() then return end
  WZ.Open()
end
ns.On("PLAYER_LOGIN", function() ns.OutOfCombat(offerOnce, "key setup offer") end)
