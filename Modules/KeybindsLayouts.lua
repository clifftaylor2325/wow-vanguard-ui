-- Key setup's resolver: turns a class layout (Modules/KeybindsData.lua) into the entries the apply engine takes
-- (Modules/KeybindsApply.lua), for what the character knows now. One rule picks every key: each key takes the first
-- spell on its list that the character knows and that no earlier key on the same bar page has taken. The keys every
-- page shares resolve first (the letter keys, the mouse, the Shift row), then each page's number keys. A role only
-- adds the spells marked for it. Nothing here writes anything.
--
-- A preset is { class = "WARRIOR", role = "levelling" or a spec id, sides = true/false }: sides false (a mouse
-- without side buttons) puts Mouse 4 and 5 on Shift-X and Shift-T.

local ADDON, ns = ...

local D = ns.KeybindsData

local KL = {}
ns.KeybindsLayouts = KL

-- The keys every page shares, in the order they resolve, with the button each fires: bar 2's first seven
-- (slots 61 to 67) and bar 3's first four (49 to 52). `plain` is a side button's key on a mouse without them.
KL.SHARED = {
  { key = "F", slot = 61 }, { key = "T", slot = 62 }, { key = "G", slot = 63 }, { key = "X", slot = 64 },
  { key = "CTRL-X", slot = 65 }, { key = "BUTTON4", slot = 66, plain = "SHIFT-X" },
  { key = "BUTTON5", slot = 67, plain = "SHIFT-T" }, { key = "SHIFT-W", slot = 49 }, { key = "SHIFT-A", slot = 50 },
  { key = "SHIFT-D", slot = 51 }, { key = "SHIFT-SPACE", slot = 52 },
}
-- The keys for the first, second and third stance-bar button (or Pet Attack and Pet Follow).
KL.STANCE_KEYS = { "`", "SHIFT-`", "CTRL-`" }
-- The game's commands for the pet bar's Attack and Follow buttons, on a class with pets.
KL.PET_COMMANDS = { "BONUSACTIONBUTTON1", "BONUSACTIONBUTTON2" }

-- Whether the character knows a spell now (a plain yes from the client).
local function knowsNow(spellID)
  local call = ns.SpellKnownCall()
  return call ~= nil and ns.IsTrue(call(spellID))
end

-- Whether it knows a spell now or will from a trainer: every spell but a talent it hasn't taken. For "Show what
-- comes later".
local function knowsLater(spellID)
  return knowsNow(spellID) or not D.TALENTS[spellID]
end
KL.KnowsLater = knowsLater

-- A candidate's spell ID and the roles it is only for (nil for every role).
local function candidate(c)
  if type(c) == "table" then return c[1], c.only end
  return c, nil
end

-- Whether a candidate marked for `only` is on the list for this role.
local function forRole(only, role)
  return only == nil or (" " .. only .. " "):find(" " .. tostring(role) .. " ", 1, true) ~= nil
end

-- The first spell on a key's list the character knows, on the list for its role and not taken; nil for none.
local function pick(ctx, list, taken)
  for _, c in ipairs(list or {}) do
    local id, only = candidate(c)
    if id ~= D.UNKNOWN and forRole(only, ctx.role) and not taken[id] and ctx.knows(id) then return id end
  end
end

-- Adds one key's entry, unless its button is one the player took over: the key takes its list's pick.
local function addSpell(ctx, key, slot, list, taken)
  if ctx.skip[slot] then return end
  local id = pick(ctx, list, taken)
  if not id then return end
  taken[id] = true
  ctx.out[#ctx.out + 1] = { key = key, spell = id, slot = slot, replaces = D.REPLACES[id] }
end

-- The keys every page shares; their spells are taken on every page.
local function addShared(ctx, class)
  for _, k in ipairs(KL.SHARED) do
    local key = (ctx.sides == false and k.plain) or k.key
    addSpell(ctx, key, k.slot, class.keys[k.key], ctx.taken)
  end
end

-- The position on the game's stance bar of a form (one spell, or a list: a form at two ranks), or nil.
function KL.FormIndex(form)
  local wanted = type(form) == "table" and form or { form }
  for i = 1, (ns.PlainNumber(GetNumShapeshiftForms()) or 0) do
    local id = ns.PlainNumber(select(4, GetShapeshiftFormInfo(i)))
    for _, spell in ipairs(wanted) do
      if id == spell then return i end
    end
  end
end

-- The stance keys (bound to the stance bar's buttons the character has) or the pet keys.
local function addCommands(ctx, class)
  if class.pets then
    for i, command in ipairs(KL.PET_COMMANDS) do ctx.out[#ctx.out + 1] = { key = KL.STANCE_KEYS[i], command = command } end
  end
  for i, form in ipairs(class.stances or {}) do
    local at = KL.FormIndex(form)
    if at then ctx.out[#ctx.out + 1] = { key = KL.STANCE_KEYS[i], command = "SHAPESHIFTBUTTON" .. at } end
  end
end

-- Whether a page shows for this character: the normal page always, a stance or form page once it knows the form.
local function pageKnown(ctx, page)
  for _, form in ipairs(page.forms or {}) do
    if ctx.knows(form) then return true end
  end
  return page.forms == nil
end

-- One page's number keys, each on its own button of that page, after the shared keys.
local function addPage(ctx, page)
  if not pageKnown(ctx, page) then return end
  local taken = ns.Copy(ctx.taken)
  for n, list in ipairs(page) do addSpell(ctx, tostring(n), page.base + n - 1, list, taken) end
end

-- The entries for a preset, for what the character knows now (or what `knows` says it knows), in the apply
-- engine's form: { key, spell, slot, replaces } and { key, command }. skip: { [slot] = true } for buttons the
-- player took over, left out so their spells go to the next key that lists them. An unknown class gives none.
---@param preset table  { class, role, sides }
---@param skip table|nil
---@param knows function|nil
---@return table[]
function KL.Resolve(preset, skip, knows)
  local class = D.CLASSES[preset.class]
  if not class then return {} end
  local ctx = { role = preset.role, sides = preset.sides, skip = skip or {}, knows = knows or knowsNow, out = {}, taken = {} }
  addShared(ctx, class)
  addCommands(ctx, class)
  for _, page in ipairs(class.pages) do addPage(ctx, page) end
  return ctx.out
end

-- The player's class, as the client's file name ("WARRIOR"), or nil while it is hidden.
local function playerClass()
  local _, class = UnitClass("player")
  return not ns.IsSecret(class) and class or nil
end

-- The role to pre-pick: the class's tank or healer role for a player in that role, else Levelling.
function KL.GuessRole(class)
  local role = ns.PlayerRole()
  for _, spec in ipairs(class and D.CLASSES[class] and D.CLASSES[class].specs or {}) do
    if spec.role == role then return spec[1] end
  end
  return "levelling"
end

-- A new preset for this character: its class, the role guessed, and a mouse with side buttons.
---@return table preset
function KL.Preset()
  local class = playerClass()
  return { class = class, role = KL.GuessRole(class), sides = true }
end
