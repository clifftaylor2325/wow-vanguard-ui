-- The "Click casting" options page: set a key, pick what it does (a spell,
-- a macro, target or the unit menu), type or drop the spell, Add. Below,
-- the current spec's bindings, each with Remove.

local ADDON, ns = ...

local W = ns.Widgets
local CC = ns.GetModule("ClickCast")

local MAX_LISTED = 6
local HINT = "Set a key, then type a spell name or drag one from your spellbook onto the box."
local ACTION_CHOICES = { { "spell", "Spell" }, { "macro", "Macro" }, { "target", "Target" }, { "menu", "Menu" } }

-- The binding being put together in the editor.
local draft = { key = nil, action = "spell" }

-- Spell drops ------------------------------------------------------------------------------

-- A spell's name from its id, or nil.
local function spellName(id)
  if C_Spell and type(C_Spell.GetSpellName) == "function" then return C_Spell.GetSpellName(id) end
  return type(GetSpellInfo) == "function" and (GetSpellInfo(id)) or nil
end

-- A spell dropped on the input (from the spellbook or a bar): its name goes in the box.
local function onDrop(input)
  local kind, _, _, id = GetCursorInfo()
  if kind ~= "spell" then return end
  local name = spellName(id)
  if name then input:SetText(name) end
  ClearCursor()
end

-- Editor -----------------------------------------------------------------------------------

-- Adds the draft binding, or says what's missing.
local function add(editor)
  local ok, err = CC.Add(draft.key, draft.action, editor.input:GetText())
  editor.message:SetText(ok and HINT or ("Can't add: " .. err .. "."))
  if not ok then return end
  draft.key = nil
  editor.input:SetText("")
  editor.keyText:SetText("")
  ns.Options.Refresh()
end

-- The key capture button and the text showing the captured key.
local function addKeyRow(editor)
  editor.capture = W.KeyCapture(editor, "Set key", function(key)
    draft.key = key
    editor.keyText:SetText(CC.KeyText(key))
  end)
  editor.capture:SetPoint("TOPLEFT")
  editor.keyText = W.Text(editor, "")
  editor.keyText:SetPoint("LEFT", editor.capture, "RIGHT", 10, 0)
end

-- The action cycle, the spell/macro input (drop target) and Add.
local function addActionRow(editor)
  editor.action = W.Cycle(editor, "Action", ACTION_CHOICES, function() return draft.action end, function(v) draft.action = v end)
  editor.action:SetPoint("TOPLEFT", 0, -34)
  editor.input = W.Input(editor, 220)
  editor.input:SetPoint("TOPLEFT", 0, -68)
  editor.input:SetScript("OnReceiveDrag", onDrop)
  editor.input:SetScript("OnMouseUp", onDrop)
  editor.add = W.Button(editor, "Add binding", function() add(editor) end, 140)
  editor.add:SetPoint("LEFT", editor.input, "RIGHT", 10, 0)
end

-- The editor block: key, action, spell, Add, and a line for problems.
local function editor(content)
  local e = CreateFrame("Frame", nil, content)
  e:SetSize(480, 118)
  addKeyRow(e)
  addActionRow(e)
  e.message = W.Text(e, HINT)
  e.message:SetPoint("TOPLEFT", 0, -100)
  return e
end

-- Binding list -----------------------------------------------------------------------------

-- One list row: "Ctrl + Right click  ->  Renew" and a Remove button.
local function listRow(list, i)
  local row = CreateFrame("Frame", nil, list)
  row:SetSize(480, 24)
  row:SetPoint("TOPLEFT", 0, -(i - 1) * 26)
  row.text = W.Text(row, "")
  row.text:SetPoint("LEFT")
  row.remove = W.Button(row, "Remove", function() CC.Remove(row.key); ns.Options.Refresh() end, 80)
  row.remove:SetPoint("RIGHT")
  return row
end

-- Shows the current spec's bindings (up to MAX_LISTED; a line says how many more).
local function refreshList(list)
  local bindings = CC.Bindings()
  for i = 1, MAX_LISTED do
    local b, row = bindings[i], list.rows[i]
    row:SetShown(b ~= nil)
    if b then row.key = b.key; row.text:SetText(CC.KeyText(b.key) .. "  ->  " .. CC.ActionText(b)) end
  end
  local extra = #bindings - MAX_LISTED
  list.more:SetText(#bindings == 0 and "No bindings yet for this spec." or extra > 0 and ("+" .. extra .. " more (/fui binds)") or "")
end

-- The list block with its rows built once and refilled on Refresh.
local function bindingList(content)
  local list = CreateFrame("Frame", nil, content)
  list:SetSize(480, MAX_LISTED * 26 + 20)
  list.rows = {}
  for i = 1, MAX_LISTED do list.rows[i] = listRow(list, i) end
  list.more = W.Text(list, "")
  list.more:SetPoint("TOPLEFT", 0, -MAX_LISTED * 26)
  list.Refresh = refreshList
  list:Refresh()
  return list
end

-- Page ---------------------------------------------------------------------------------------

-- Whose bindings these are: this spec's on this character, or (no specs) this character's.
local function title()
  local spec = ns.SpecIndex()
  local whose = spec and ("spec " .. spec .. " on this character") or "this character"
  return "Bindings for " .. whose .. ". Keys work while the pointer is over a raid frame."
end

-- Whether click casting also covers the unit frames.
local function unitFramesOn()
  return ns.Settings("ClickCast", CC.defaults).unitFrames
end

-- Turns click casting on the unit frames on or off (applies on reload).
local function setUnitFrames(on)
  ns.Settings("ClickCast", CC.defaults).unitFrames = on
  ns.Options.NeedReload()
end

ns.Options.AddRowKind("bindeditor", editor, 124)
ns.Options.AddRowKind("bindlist", bindingList, MAX_LISTED * 26 + 24)

ns.Options.AddPage({
  key = "clickcast",
  title = "Click casting",
  icon = "ClickCasting",
  order = 46,
  rows = function()
    return {
      { "header", "Click casting" },
      { "text", title },
      { "bindeditor" },
      { "header", "Your bindings" },
      { "bindlist" },
      { "check", "Also on your player, target and focus frames (reload)", unitFramesOn, setUnitFrames },
    }
  end,
})
