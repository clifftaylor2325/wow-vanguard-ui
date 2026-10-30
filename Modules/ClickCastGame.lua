-- Click casting against the game's own click bindings: reads the game's profile (C_ClickBindings, set in its Click
-- Casting window) to say when a binding of Vanguard's does nothing on this client (CC.WontRun).
--
-- The units' click handler (SecureUnitButton_OnClick) runs the game's own Spell, Macro or PetAction binding for a
-- click first and returns, moves an Interaction (Target, Open menu) binding to the click it stands for, and drops a
-- Target or menu click its own bindings don't cover. Everything here only reads: a warning is given only when the
-- profile makes the answer certain, and a profile this can't read (hidden fields, an unknown interaction, modifier
-- text in a format it doesn't know) gives none.

local ADDON, ns = ...

local L = ns.L

local CC = ns.GetModule("ClickCast")

-- The actions the units' click handler runs only on a click the game's own click bindings cover, and why a binding
-- does nothing on this client, by where it is (player words, read after "does nothing: "). A mouse binding is also
-- overridden where the game binds a Spell, Macro or PetAction to the same click: the handler runs that first and
-- returns before it reads the frame's attribute.
local GAME_GATED = { target = true, menu = true }
local WONT_RUN = {
  key = L["the game won't run it from a key"],
  click = L["the game runs it only on a click its own Click Casting window binds"],
  override = L["the game's own Click Casting window binds a spell or macro to this click, and that runs instead"],
}
CC.WONT_RUN = WONT_RUN

-- The game's interactions Vanguard knows, by id: the button each stands for (the frames' attributes know only these:
-- Target is Left click, Open menu is Right click, and the engine reads that button's attribute for a click bound to
-- it) and, whole, what the reason says when the game moved it to another click.
local INTERACTIONS = {
  [1] = {
    button = 1,
    remap = L["the game's own Click Casting window puts Target on this click, so it runs your Left click binding instead"],
  },
  [2] = {
    button = 2,
    remap = L["the game's own Click Casting window puts the unit menu on this click, so it runs your Right click binding instead"],
  },
}

-- A mouse button's number from the game's name for it (its profile may use either name).
local GAME_BUTTONS = { LeftButton = 1, RightButton = 2, MiddleButton = 3, Button1 = 1, Button2 = 2, Button3 = 3, Button4 = 4, Button5 = 5 }

-- The game's click-binding profile (C_ClickBindings), or nil on a client that has none or can't list it.
local function gameProfile()
  local api = C_ClickBindings
  if type(api) ~= "table" or type(api.GetProfileInfo) ~= "function" or type(Enum.ClickBindingType) ~= "table" then return nil end
  local list = api.GetProfileInfo()
  return type(list) == "table" and list or nil
end

-- The words each modifier may be written as in the game's modifier text, in lower case: English names. The client's own
-- key text (Blizzard's ALT_KEY_TEXT and so on, read when needed) is added to them.
local MODIFIER_WORDS = { alt = { "alt" }, ctrl = { "ctrl", "control" }, shift = { "shift" } }
local KEY_TEXTS = { alt = "ALT_KEY_TEXT", ctrl = "CTRL_KEY_TEXT", shift = "SHIFT_KEY_TEXT" }
local MODIFIER_ORDER = CC.MODIFIER_ORDER

-- The client's own key texts for Alt, Ctrl and Shift as one string: what the cached word list was made from. They are
-- read when needed because the client may set them after this file loads.
local function keyTexts()
  local out = {}
  for _, modifier in ipairs(MODIFIER_ORDER) do
    local own = _G[KEY_TEXTS[modifier]]
    out[#out + 1] = type(own) == "string" and own or ""
  end
  return table.concat(out, "\n")
end

-- Every word a modifier may be written as, as { word, modifier }, longest first so that a word hiding another (German
-- "Umschalt" holds "alt") is taken out before the one inside it.
local function buildWords()
  local words = {}
  for _, modifier in ipairs(MODIFIER_ORDER) do
    local own = _G[KEY_TEXTS[modifier]]
    for _, word in ipairs(MODIFIER_WORDS[modifier]) do words[#words + 1] = { word, modifier } end
    if type(own) == "string" and own ~= "" then words[#words + 1] = { ns.Lower(own), modifier } end
  end
  table.sort(words, function(a, b) return #a[1] > #b[1] or (#a[1] == #b[1] and a[1] < b[1]) end)
  return words
end

local wordCache = {}

-- The word list (see buildWords), made again only when the client's key texts change.
local function modifierWords()
  local texts = keyTexts()
  if wordCache.texts ~= texts then wordCache.texts, wordCache.words = texts, buildWords() end
  return wordCache.words
end

-- Takes each modifier's words out of a lower-case text; returns the modifiers found ({ shift = true }) and what is left.
local function stripWords(text)
  local found = {}
  for _, entry in ipairs(modifierWords()) do
    local from, to = text:find(entry[1], 1, true)
    if from then found[entry[2]], text = true, text:sub(1, from - 1) .. " " .. text:sub(to + 1) end
  end
  return found, text
end

-- A set of modifiers as the mouse prefix the secure attributes use ("alt-ctrl-shift-" order, "" for none).
local function prefixOf(found)
  local out = ""
  for _, modifier in ipairs(MODIFIER_ORDER) do out = out .. (found[modifier] and (modifier .. "-") or "") end
  return out
end

-- The game's modifier text as a mouse prefix, or nil when it holds more than the Alt, Ctrl and Shift names and
-- separators. Its format isn't documented, so a text this can't read is no basis for a warning.
local function readModifierText(text)
  local found, rest = stripWords(ns.Lower(text))
  if rest:gsub("[%s%-%+_%.]", "") ~= "" then return nil end
  return prefixOf(found)
end

-- The mouse prefix for the modifier mask of a game click binding, or nil when this client can't say, the mask is hidden,
-- or its text isn't one this can read (or reads as no modifier for a mask that has some). The mask is decoded by
-- GetStringFromModifiers, never MakeModifiers (which reads the keys held now).
local function modifierPrefix(modifiers)
  modifiers = ns.PlainNumber(modifiers)
  if modifiers == 0 then return "" end
  if not modifiers or type(GetStringFromModifiers) ~= "function" then return nil end
  local text = GetStringFromModifiers(modifiers)
  if ns.IsSecret(text) or type(text) ~= "string" then return nil end
  local prefix = readModifierText(text)
  return prefix ~= "" and prefix or nil
end

-- A profile entry as plain values ({ kind, n, modifiers, interaction }: its type, the button's number, its modifier mask
-- and, for an interaction, its id), or nil when it isn't a table or a field it needs is hidden or of another type.
-- That the button and type guards hold is reviewed by eye: the harness's secret raises on arithmetic and calls but not
-- on ==, so a test can't tell them from nothing.
local function plainEntry(info)
  if type(info) ~= "table" then return nil end
  local button, kind = info.button, ns.PlainNumber(info.type)
  if ns.IsSecret(button) or type(button) ~= "string" or not kind then return nil end
  return { kind = kind, n = GAME_BUTTONS[button], modifiers = info.modifiers, interaction = ns.PlainNumber(info.actionID) }
end

-- What the game does with one profile entry on the click being asked about: "override" (a Spell, Macro or PetAction
-- runs, and the engine returns before reading any attribute), "covered" (its interaction is on its own default button,
-- so the frame's attribute runs), "remap" (an interaction the game moved here: the engine reads the default button's
-- attribute instead), "unsure" (an interaction this doesn't know), or "unbound" (an entry that binds nothing).
local function verdictOf(entry, n)
  local kind = Enum.ClickBindingType
  if entry.kind == kind.Spell or entry.kind == kind.Macro or entry.kind == kind.PetAction then return "override" end
  if entry.kind ~= kind.Interaction then return "unbound" end
  local interaction = INTERACTIONS[entry.interaction]
  if not interaction then return "unsure" end
  return interaction.button == n and "covered" or "remap"
end

-- How the game's profile treats a click (a mouse prefix and button number), by the exact modifiers of its entries:
-- verdictOf for the entry on it (and the entry), "unsure" when no entry is exact but one on that button has modifiers this can't read
-- (it may be the one), else "unbound". Only a sure answer gives a warning.
local function gameVerdict(profile, prefix, n)
  local unsure = false
  for _, info in ipairs(profile) do
    local entry = plainEntry(info)
    if entry and entry.n == n then
      local own = modifierPrefix(entry.modifiers)
      if own == prefix then return verdictOf(entry, n), entry end
      unsure = unsure or own == nil
    end
  end
  return unsure and "unsure" or "unbound"
end

-- Why a binding does nothing on this client, or nil when it works (or the client can't say). Where the game has
-- click bindings of its own, a Spell, Macro or PetAction it binds to the same click runs instead of a mouse binding,
-- an interaction it moved to the click makes the engine read another button's attribute, and the units' click handler
-- drops Target and Unit menu on a click its own bindings don't cover (a hover key's virtual button is never covered).
-- While the game's bindings are in use, Vanguard's rest.
function CC.WontRun(b)
  local profile = not CC.UsesGame() and gameProfile()
  if not profile then return nil end
  local prefix, n = CC.MouseParts(b.key)
  if not prefix then return GAME_GATED[b.action] and WONT_RUN.key or nil end
  local verdict, entry = gameVerdict(profile, prefix, n)
  if verdict == "unbound" and GAME_GATED[b.action] then return WONT_RUN.click end
  if verdict == "remap" then return INTERACTIONS[entry.interaction].remap end
  return verdict == "override" and WONT_RUN.override or nil
end

-- Opens the game's own Click Casting window (it loads on demand), closing Vanguard's options window first; a client
-- without one says so in chat, and in a fight chat says the window waits.
function CC.OpenGameWindow()
  if type(ToggleClickBindingFrame) ~= "function" then return ns.Chat(L["This client has no click bindings window."]) end
  if ns.WindowWaitsForCombat(L["The game's click bindings window"]) then return end
  ns.Options.Hide()
  ToggleClickBindingFrame()
end
