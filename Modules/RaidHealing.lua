-- Healer extras on the raid frames:
--   * incoming heals (green) and shields (white) drawn past the health fill
--   * a colored strip along the top while a player has threat (aggro)
--   * a marker when a player is missing a buff you can give (Fortitude...)
--
-- Written for WoW Forever. Every client call is looked up when used, so a
-- missing one just switches that feature off. Heal prediction uses the
-- client's calculator where it has one (it may hand back hidden values,
-- which go straight to the bars), else the older incoming-heals call.
-- Buffs are watched by name: defaults per class, editable in /vg > Healing
-- (check the defaults against your client's spell names).

local ADDON, ns = ...

local T = ns.Theme
local RF = ns.GetModule("RaidFrames")

local RH = ns.Module("RaidHealing", {
  defaults = { healPrediction = true, absorbs = true, aggro = true, buffWatch = true, buffs = "" },
})

-- Buffs each class can give, by name (the single and group versions count alike).
RH.CLASS_BUFFS = {
  PRIEST = { "Power Word: Fortitude", "Prayer of Fortitude" },
  MAGE = { "Arcane Intellect", "Arcane Brilliance" },
  DRUID = { "Mark of the Wild", "Gift of the Wild" },
  WARRIOR = { "Battle Shout" },
  -- Any blessing, normal or greater, counts: a paladin gives one per player.
  PALADIN = {
    "Blessing of Might", "Blessing of Wisdom", "Blessing of Kings", "Blessing of Salvation", "Blessing of Light",
    "Greater Blessing of Might", "Greater Blessing of Wisdom", "Greater Blessing of Kings",
    "Greater Blessing of Salvation", "Greater Blessing of Light",
  },
}

-- Every class's group buffs for the options list, by class, as { name, spellID }.
-- The id finds the icon even for spells you haven't learned (the client can't look those up by name).
RH.ALL_BUFFS = {
  { "PRIEST", { { "Power Word: Fortitude", 1243 }, { "Prayer of Fortitude", 21562 }, { "Divine Spirit", 14752 },
    { "Prayer of Spirit", 27681 }, { "Shadow Protection", 976 }, { "Prayer of Shadow Protection", 27683 } } },
  { "MAGE", { { "Arcane Intellect", 1459 }, { "Arcane Brilliance", 23028 }, { "Amplify Magic", 1008 }, { "Dampen Magic", 604 } } },
  { "DRUID", { { "Mark of the Wild", 1126 }, { "Gift of the Wild", 21849 }, { "Thorns", 467 } } },
  { "PALADIN", { { "Blessing of Might", 19740 }, { "Blessing of Wisdom", 19742 }, { "Blessing of Kings", 20217 },
    { "Blessing of Salvation", 1038 }, { "Blessing of Light", 19977 }, { "Blessing of Sanctuary", 20911 },
    { "Greater Blessing of Might", 25782 }, { "Greater Blessing of Wisdom", 25894 }, { "Greater Blessing of Kings", 25898 },
    { "Greater Blessing of Salvation", 25895 }, { "Greater Blessing of Light", 25890 }, { "Greater Blessing of Sanctuary", 25899 } } },
  { "WARRIOR", { { "Battle Shout", 6673 } } },
  { "HUNTER", { { "Trueshot Aura", 19506 } } },
  { "WARLOCK", { { "Unending Breath", 5697 }, { "Detect Invisibility", 2970 } } },
}

-- Static icons by buff name, used when the client has none for the name or spell id (never a question mark).
RH.FALLBACK_ICONS = {
  ["Power Word: Fortitude"] = "Interface\\Icons\\Spell_Holy_WordFortitude",
  ["Prayer of Fortitude"] = "Interface\\Icons\\Spell_Holy_PrayerOfFortitude",
  ["Divine Spirit"] = "Interface\\Icons\\Spell_Holy_DivineSpirit",
  ["Prayer of Spirit"] = "Interface\\Icons\\Spell_Holy_PrayerofSpirit",
  ["Shadow Protection"] = "Interface\\Icons\\Spell_Shadow_AntiShadow",
  ["Prayer of Shadow Protection"] = "Interface\\Icons\\Spell_Holy_PrayerofShadowProtection",
  ["Arcane Intellect"] = "Interface\\Icons\\Spell_Holy_MagicalSentry",
  ["Arcane Brilliance"] = "Interface\\Icons\\Spell_Holy_ArcaneIntellect",
  ["Amplify Magic"] = "Interface\\Icons\\Spell_Holy_FlashHeal",
  ["Dampen Magic"] = "Interface\\Icons\\Spell_Nature_AbolishMagic",
  ["Mark of the Wild"] = "Interface\\Icons\\Spell_Nature_Regeneration",
  ["Gift of the Wild"] = "Interface\\Icons\\Spell_Nature_Regeneration",
  ["Thorns"] = "Interface\\Icons\\Spell_Nature_Thorns",
  ["Blessing of Might"] = "Interface\\Icons\\Spell_Holy_FistOfJustice",
  ["Blessing of Wisdom"] = "Interface\\Icons\\Spell_Holy_SealOfWisdom",
  ["Blessing of Kings"] = "Interface\\Icons\\Spell_Magic_MageArmor",
  ["Blessing of Salvation"] = "Interface\\Icons\\Spell_Holy_SealOfSalvation",
  ["Blessing of Light"] = "Interface\\Icons\\Spell_Holy_PrayerOfHealing02",
  ["Blessing of Sanctuary"] = "Interface\\Icons\\Spell_Nature_LightningShield",
  ["Greater Blessing of Might"] = "Interface\\Icons\\Spell_Holy_GreaterBlessingofKings",
  ["Greater Blessing of Wisdom"] = "Interface\\Icons\\Spell_Holy_GreaterBlessingofWisdom",
  ["Greater Blessing of Kings"] = "Interface\\Icons\\Spell_Holy_GreaterBlessingofKings",
  ["Greater Blessing of Salvation"] = "Interface\\Icons\\Spell_Holy_GreaterBlessingofSalvation",
  ["Greater Blessing of Light"] = "Interface\\Icons\\Spell_Holy_GreaterBlessingofLight",
  ["Greater Blessing of Sanctuary"] = "Interface\\Icons\\Spell_Holy_GreaterBlessingofSanctuary",
  ["Battle Shout"] = "Interface\\Icons\\Ability_Warrior_BattleShout",
  ["Trueshot Aura"] = "Interface\\Icons\\Ability_TrueShot",
  ["Unending Breath"] = "Interface\\Icons\\Spell_Shadow_DemonBreath",
  ["Detect Invisibility"] = "Interface\\Icons\\Spell_Shadow_DetectInvisibility",
}

-- Values -----------------------------------------------------------------------------------

-- A value that isn't there (nil). Written with type() so a hidden value never gets compared.
local function absent(v)
  return type(v) == "nil"
end

local calc

-- The client's heal prediction calculator (made once), or nil if this client has none.
local function calculator()
  if not calc and type(CreateUnitHealPredictionCalculator) == "function" then
    calc = CreateUnitHealPredictionCalculator()
    pcall(calc.SetIncomingHealClampMode, calc, 0)
    pcall(calc.SetIncomingHealOverflowPercent, calc, 1)
  end
  return calc
end

-- A number a client call gives for a unit, or a hidden value untouched (it goes straight to a bar,
-- never tested or compared); nil on a client without the call, or for anything else.
local function ask(fn, unit)
  if type(fn) ~= "function" then return nil end
  local value = fn(unit)
  if ns.IsSecret(value) or type(value) == "number" then return value end
  return nil
end

-- max health, incoming heals and shields for a unit (any may be hidden or nil).
function RH.Prediction(unit)
  local c = calculator()
  if c and type(UnitGetDetailedHealPrediction) == "function" then
    UnitGetDetailedHealPrediction(unit, "player", c)
    return c:GetMaximumHealth(), c:GetIncomingHeals(), c:GetTotalDamageAbsorbs()
  end
  return UnitHealthMax(unit), ask(UnitGetIncomingHeals, unit), ask(UnitGetTotalAbsorbs, unit)
end

-- The threat strip color for a unit, or nil when it has no aggro (or its threat is hidden).
function RH.ThreatColor(unit)
  local status = ask(UnitThreatSituation, unit)
  if ns.IsSecret(status) or type(status) ~= "number" or status < 1 then return nil end
  return T.TOKENS["threat" .. math.min(status, 3)]
end

-- Buff watch -------------------------------------------------------------------------------

-- The watched buff names from the settings: your own list if you set one, else your class's defaults.
-- Read through ns.Settings, so the options page works while this module is off.
local function readNames()
  local names = {}
  for name in (ns.Settings("RaidHealing", RH.defaults).buffs or ""):gmatch("[^,]+") do
    names[#names + 1] = name:match("^%s*(.-)%s*$")
  end
  if #names > 0 then return names end
  local _, class = UnitClass("player")
  return RH.CLASS_BUFFS[class] or {}
end

-- The watched buff names, read once and kept until the list changes (RH.Forget).
function RH.BuffNames()
  RH.names = RH.names or readNames()
  return RH.names
end

-- Whether the client knows you can cast a spell by name.
local function known(name)
  local info = C_Spell and type(C_Spell.GetSpellInfo) == "function" and C_Spell.GetSpellInfo(name)
  if not absent(info) and info then return true end
  return type(GetSpellInfo) == "function" and not absent(GetSpellInfo(name))
end

-- What the buff watch looks for: { set = name -> true, give = the first
-- watched buff you know, or nil }. Worked out once and kept until the list or
-- your spells change (RH.Forget), not per unit or per update.
local function watched()
  if RH.watch then return RH.watch end
  local w = { set = {} }
  for _, name in ipairs(RH.BuffNames()) do
    w.set[name] = true
    w.give = w.give or (known(name) and name or nil)
  end
  RH.watch = w
  return w
end

-- Forgets the watched names and the spells you know (the list or your spells changed).
function RH.Forget()
  RH.names, RH.watch = nil, nil
end

-- Whether a unit has an aura by name (HELPFUL).
local function hasBuff(unit, name)
  if C_UnitAuras and type(C_UnitAuras.GetAuraDataBySpellName) == "function" then
    return not absent(C_UnitAuras.GetAuraDataBySpellName(unit, name, "HELPFUL"))
  end
  return AuraUtil and type(AuraUtil.FindAuraByName) == "function" and not absent(AuraUtil.FindAuraByName(name, unit, "HELPFUL"))
end

-- Whether a unit has any watched buff, one by-name lookup per watched name
-- (for a client without the all-at-once aura list).
local function hasByName(unit)
  for _, name in ipairs(RH.BuffNames()) do
    if hasBuff(unit, name) then return true end
  end
  return false
end

-- Whether a unit has any watched buff: one pass over its buffs, from the
-- client's all-at-once list, matched against the watched names.
local function hasWatched(unit, w)
  local list = C_UnitAuras and type(C_UnitAuras.GetUnitAuras) == "function" and C_UnitAuras.GetUnitAuras(unit, "HELPFUL")
  if type(list) ~= "table" then return hasByName(unit) end
  for _, aura in ipairs(list) do
    if not ns.IsSecret(aura.name) and w.set[aura.name] then return true end
  end
  return false
end

-- The first watched buff you know, if the unit has none of the watched buffs; else nil.
-- While the client hides auras a lookup can't see a hidden buff, so an absent
-- buff proves nothing: unknown shows no marker rather than a false alarm.
function RH.MissingBuff(unit)
  if ns.AurasSecret() then return nil end
  local w = watched()
  if not w.give or hasWatched(unit, w) then return nil end
  return w.give
end

-- Parts ------------------------------------------------------------------------------------

-- An overlay bar that starts where `after` ends (the health fill, or the heal
-- bar), in a texture: the bar texture for heals, tiled stripes for shields.
local function overlay(b, after, color, texture)
  local bar = CreateFrame("StatusBar", nil, b.health)
  bar:SetStatusBarTexture(texture)
  T.BarColor(bar, color)
  bar:SetPoint("TOPLEFT", after:GetStatusBarTexture(), "TOPRIGHT")
  bar:SetPoint("BOTTOMLEFT", after:GetStatusBarTexture(), "BOTTOMRIGHT")
  bar:Hide()
  return bar
end

-- The threat strip along the top edge.
local function addThreat(b)
  b.threat = b.health:CreateTexture(nil, "OVERLAY")
  b.threat:SetTexture(T.WHITE)
  b.threat:SetPoint("TOPLEFT")
  b.threat:SetPoint("TOPRIGHT")
  b.threat:SetHeight(3)
  b.threat:Hide()
end

-- The missing-buff marker: the buff's icon in the tile's top-right corner zone.
local function addBuffMarker(b)
  local z = RF.TileZones().missing
  b.missing = T.Snap(b.overlay:CreateTexture(nil, "OVERLAY"))
  b.missing:SetSize(z[3], z[4])
  b.missing:SetPoint("TOPLEFT", b, "TOPLEFT", z[1], -z[2])
  T.Crop(b.missing)
  b.missing:Hide()
end

-- Adds the heal, shield, threat and buff parts to a raid button (RF setup hook).
local function setup(b)
  b.health:SetClipsChildren(true)
  b.heal = overlay(b, b.health, "heal", T.BarTexture())
  b.shield = overlay(b, b.heal, "shield", T.Texture("Stripes"))
  b.shield:GetStatusBarTexture():SetHorizTile(true)
  b.shield:GetStatusBarTexture():SetVertTile(true)
  addThreat(b)
  addBuffMarker(b)
end

-- Updating ----------------------------------------------------------------------------------

-- Fills an overlay from a value; hides it when the value isn't there. It is
-- as wide as the whole health bar (the button less its 1 px border), so the
-- same max gives the same scale as the health fill.
local function fill(b, bar, max, value, on)
  bar:SetShown(on and not absent(value))
  if not on or absent(value) then return end
  bar:SetWidth(math.max(0, (b:GetWidth() or 0) - 2))
  bar:SetMinMaxValues(0, max)
  bar:SetValue(value)
end

-- Incoming heals and shields.
local function updatePrediction(b, unit)
  local max, incoming, shields = RH.Prediction(unit)
  fill(b, b.heal, max, incoming, RH.settings.healPrediction)
  fill(b, b.shield, max, shields, RH.settings.absorbs)
end

-- The threat strip.
local function updateThreat(b, unit)
  local color = RH.settings.aggro and RH.ThreatColor(unit)
  b.threat:SetShown(color ~= nil and color ~= false)
  if color then b.threat:SetVertexColor(color[1], color[2], color[3]) end
end

-- The missing-buff marker (not on the dead or offline).
local function updateBuff(b, unit)
  local missing = RH.settings.buffWatch and not b.down and RH.MissingBuff(unit)
  b.missing:SetShown(missing ~= nil and missing ~= false)
  if missing and C_Spell and type(C_Spell.GetSpellTexture) == "function" then b.missing:SetTexture(C_Spell.GetSpellTexture(missing)) end
end

-- Everything (RF update hook).
local function update(b, unit)
  updatePrediction(b, unit)
  updateThreat(b, unit)
  updateBuff(b, unit)
end

-- The missing-buff marker on every tile this module has set up.
local function refreshBuffs()
  RF.EachTile(function(b, unit) if b.heal then updateBuff(b, unit) end end)
end

-- Your spells changed: work out which watched buffs you know again, and mark
-- the tiles once on the next frame (the client sends this in bursts).
local function onSpells()
  RH.Forget()
  ns.Soon("raidbuffs", refreshBuffs)
end

-- An event handler that runs fn(b, unit) on the tile showing the event's unit.
local function onTile(fn)
  -- Only tiles this module has set up (they have the heal bar).
  local run = function(b, unit) if b.heal then fn(b, unit) end end
  return function(_, unit) RF.ForUnit(unit, run) end
end

-- Event -> which part it refreshes (a health change refreshes the heal bars
-- through RF.healthHooks: incoming heals are clamped to the missing health).
local EVENTS = {
  -- Each handler refreshes one part for the unit named in the event.
  UNIT_HEAL_PREDICTION = onTile(updatePrediction),
  UNIT_ABSORB_AMOUNT_CHANGED = onTile(updatePrediction),
  UNIT_THREAT_SITUATION_UPDATE = onTile(updateThreat),
  -- The buff marker follows the unit's auras and the roster (RF.Update), not health.
  UNIT_AURA = onTile(updateBuff),
  SPELLS_CHANGED = onSpells,
  -- Logging in or zoning: read the list and your spells again.
  PLAYER_ENTERING_WORLD = function() RH.Forget() end,
  -- Entering combat may hide auras: the markers go rather than linger unchecked.
  PLAYER_REGEN_DISABLED = refreshBuffs,
  -- Leaving combat usually lifts the aura restriction: look at every buff again.
  PLAYER_REGEN_ENABLED = function() RF.UpdateAll() end,
}

-- Module entry point (Core/Modules.lua): hook into raid buttons (existing and new).
function RH.Enable(settings)
  RH.settings = settings
  for _, b in ipairs(RF.buttons) do setup(b) end
  table.insert(RF.setupHooks, setup)
  table.insert(RF.updateHooks, update)
  table.insert(RF.healthHooks, updatePrediction)
  for event, fn in pairs(EVENTS) do ns.On(event, fn) end
end

-- Options ------------------------------------------------------------------------------------

local W = ns.Widgets

-- get/set for one of this module's switches (applies at the next refresh).
local function switch(key)
  return function() return ns.Settings("RaidHealing", RH.defaults)[key] end,
    function(v) ns.Settings("RaidHealing", RH.defaults)[key] = v; RF.UpdateAll() end
end

-- Stores the buff list (empty = class defaults), then refreshes the frames and the page.
local function storeBuffs(text)
  ns.Settings("RaidHealing", RH.defaults).buffs = text
  RH.Forget()
  RF.UpdateAll()
end

-- Saves the typed buff list and rebuilds the page, so new names get their own rows.
local function saveBuffs(input)
  input:ClearFocus()
  storeBuffs(input:GetText())
  ns.Options.RebuildPage("healing")
end

-- Appends the names not seen yet to out, in order.
local function addNames(out, seen, names)
  for _, name in ipairs(names) do
    if not seen[name] then seen[name], out[#out + 1] = true, name end
  end
end

-- The names in your spellbook's Buffs group (the click-cast catalog), or none.
local function bookBuffs()
  local CS, names = ns.ClickCastSpells, {}
  if not CS then return names end
  for _, s in ipairs(CS.Groups().buffs) do names[#names + 1] = s.name end
  return names
end

-- A class's readable name ("Priest"), from the client or the token.
local function className(token)
  local names = LOCALIZED_CLASS_NAMES_MALE
  if type(names) == "table" and names[token] then return names[token] end
  return token:sub(1, 1) .. token:sub(2):lower()
end

-- The class buff lists in order, yours first.
local function classOrder()
  local _, mine = UnitClass("player")
  local out = {}
  for _, c in ipairs(RH.ALL_BUFFS) do
    if c[1] == mine then table.insert(out, 1, c) else out[#out + 1] = c end
  end
  return out
end

-- Appends a class's name and a row per buff it gives, marking each name seen.
local function addClass(rows, seen, c)
  rows[#rows + 1] = { "header", className(c[1]) }
  for _, b in ipairs(c[2]) do
    seen[b[1]] = true
    rows[#rows + 1] = { "buffpick", b[1], b[2] }
  end
end

-- Appends rows for buffs no class list has: your spellbook's Buffs group, then any other saved name.
local function addOthers(rows, seen)
  local names = {}
  addNames(names, seen, bookBuffs())
  addNames(names, seen, RH.BuffNames())
  if #names > 0 then rows[#rows + 1] = { "header", "Other" } end
  for _, name in ipairs(names) do rows[#rows + 1] = { "buffpick", name } end
end

-- Appends every buff row: each class's buffs (yours first) under its name, then the others.
local function addBuffRows(rows)
  local seen = {}
  for _, c in ipairs(classOrder()) do addClass(rows, seen, c) end
  addOthers(rows, seen)
end

-- Whether a buff is on the watched list now.
local function watching(name)
  for _, n in ipairs(RH.BuffNames()) do
    if n == name then return true end
  end
  return false
end

-- Watches or stops watching one buff, saves the list and refreshes the page.
local function setWatched(name, on)
  local names = {}
  for _, n in ipairs(RH.BuffNames()) do
    if n ~= name then names[#names + 1] = n end
  end
  if on then names[#names + 1] = name end
  storeBuffs(table.concat(names, ", "))
  ns.Options.Refresh()
end

-- A buff's icon: the spellbook's, else the client's by name, then by spell id, else the static fallback.
local function buffIcon(name, id)
  local s = ns.ClickCastSpells and ns.ClickCastSpells.Spell(name)
  if s and s.icon then return s.icon end
  local get = C_Spell and type(C_Spell.GetSpellTexture) == "function" and C_Spell.GetSpellTexture
  local live = get and (get(name) or (id and get(id)))
  return live or RH.FALLBACK_ICONS[name] or 134400
end

-- One buff's row: its icon and name, and a switch that watches it. Inset like the
-- page's other indented rows, so the switch lines up with the switches above.
local function buffRow(content, row, width)
  local name = row[2]
  local r = W.Check(content, name, function() return watching(name) end, function(on) setWatched(name, on) end, width - 8)
  r.icon = r:CreateTexture(nil, "ARTWORK")
  r.icon:SetSize(20, 20)
  r.icon:SetPoint("LEFT", 0, 0)
  r.icon:SetTexture(buffIcon(name, row[3]))
  T.Crop(r.icon)
  r.label:SetPoint("LEFT", r.icon, "RIGHT", 8, 0)
  return r
end

ns.Options.AddRowKind("buffpick", buffRow, W.ROW_HEIGHT)

-- The buff-list editor: names separated by commas, and Save.
local function buffEditor(content)
  local row = CreateFrame("Frame", nil, content)
  row:SetSize(480, 28)
  row.input = W.Input(row, 330)
  row.input:SetPoint("LEFT")
  row.save = W.Button(row, "Save", function() saveBuffs(row.input) end, 80)
  row.save:SetPoint("LEFT", row.input, "RIGHT", 8, 0)
  -- Shows the saved list, or your class's defaults when you haven't set one.
  row.Refresh = function(self) self.input:SetText(table.concat(RH.BuffNames(), ", ")) end
  row:Refresh()
  return row
end

ns.Options.AddRowKind("buffnames", buffEditor, 34)

-- The switches at the top of the Healing page, one per thing drawn on the raid frames,
-- ending with the header the buff rows go under.
local function switchRows()
  return {
    { "header", "On the raid frames" },
    { "check", "Incoming heals (green, past the health)", switch("healPrediction") },
    { "check", "Shields (white, after incoming heals)", switch("absorbs") },
    { "check", "Aggro strip along the top (yellow, orange, red)", switch("aggro") },
    { "check", "Mark players missing a buff you can give", switch("buffWatch") },
    { "header", "Buffs to watch" },
  }
end

-- The Healing page's rows: the switches, a row per buff you could watch, then the typed list.
local function pageRows()
  local rows = switchRows()
  addBuffRows(rows)
  rows[#rows + 1] = { "text", "Other buffs: names, separated by commas. None on = your class's usual buffs." }
  rows[#rows + 1] = { "buffnames" }
  return rows
end

ns.Options.AddPage({ key = "healing", title = "Healing", icon = "NavHealing", order = 45, rows = pageRows })
