-- Healer extras on the raid frames:
--   * incoming heals (green) and shields (white) drawn past the health fill
--   * a colored strip along the top while a player has threat (aggro)
--   * a marker when a player is missing a buff you can give (Fortitude...)
--
-- Written for WoW Forever. Every client call is looked up when used, so a
-- missing one just switches that feature off. Heal prediction uses the
-- client's calculator where it has one (it may hand back hidden values,
-- which go straight to the bars), else the older incoming-heals call.
-- Buffs are watched by the client's name for them: defaults per class, listed
-- by spell id and named by the client (so they hold on every client language),
-- editable in /vg > Healing.

local ADDON, ns = ...

local T = ns.Theme
local L = ns.L
local RF = ns.GetModule("RaidFrames")

local RH = ns.Module("RaidHealing", {
  defaults = { healPrediction = true, absorbs = true, aggro = true, buffWatch = true, buffs = "" },
  live = true,
  requires = { "RaidFrames" },
})
local RA = ns.GetModule("RaidAuras")

-- Buffs each class can give, by spell id (the single and group versions count alike); the client names
-- each, and every rank shares that name. The ids are ALL_BUFFS' below.
RH.CLASS_BUFFS = ns.ClientData({
  forever = {
    PRIEST = { 1243, 21562 },
    MAGE = { 1459, 23028 },
    DRUID = { 1126, 21849 },
    WARRIOR = { 6673 },
    -- Any blessing, normal or greater, counts: a paladin gives one per player.
    PALADIN = { 19740, 19742, 20217, 1038, 19977, 20911, 25782, 25894, 25898, 25895, 25890, 25899 },
  },
  -- Retail's raid buffs (12.1.5): Power Word: Fortitude, Arcane Intellect, Mark of the Wild, Battle Shout, Skyfury,
  -- Blessing of the Bronze. Retail ranks nothing and has no group versions, so one id each.
  retail = {
    PRIEST = { 21562 },
    MAGE = { 1459 },
    DRUID = { 1126 },
    WARRIOR = { 6673 },
    SHAMAN = { 462854 },
    EVOKER = { 364342 },
  },
})

-- Every class's group buffs for the options list, by class, as { English name, spellID }. The row shows
-- the client's name for the id; the English one only where the client has none. The id also finds the
-- icon for spells you haven't learned (the client can't look those up by name).
RH.ALL_BUFFS = ns.ClientData({
  forever = {
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
  },
  -- Retail's: the raid buffs above, and Unending Breath.
  retail = {
    { "PRIEST", { { "Power Word: Fortitude", 21562 } } },
    { "MAGE", { { "Arcane Intellect", 1459 } } },
    { "DRUID", { { "Mark of the Wild", 1126 } } },
    { "WARRIOR", { { "Battle Shout", 6673 } } },
    { "SHAMAN", { { "Skyfury", 462854 } } },
    { "EVOKER", { { "Blessing of the Bronze", 364342 } } },
    { "WARLOCK", { { "Unending Breath", 5697 } } },
  },
})

-- Static icons by spell id, used when the client has none for the name or id (never a question mark).
RH.FALLBACK_ICONS = ns.ClientData({
  forever = {
    [1243] = "Interface\\Icons\\Spell_Holy_WordFortitude", -- Power Word: Fortitude
    [21562] = "Interface\\Icons\\Spell_Holy_PrayerOfFortitude", -- Prayer of Fortitude
    [14752] = "Interface\\Icons\\Spell_Holy_DivineSpirit", -- Divine Spirit
    [27681] = "Interface\\Icons\\Spell_Holy_PrayerofSpirit", -- Prayer of Spirit
    [976] = "Interface\\Icons\\Spell_Shadow_AntiShadow", -- Shadow Protection
    [27683] = "Interface\\Icons\\Spell_Holy_PrayerofShadowProtection", -- Prayer of Shadow Protection
    [1459] = "Interface\\Icons\\Spell_Holy_MagicalSentry", -- Arcane Intellect
    [23028] = "Interface\\Icons\\Spell_Holy_ArcaneIntellect", -- Arcane Brilliance
    [1008] = "Interface\\Icons\\Spell_Holy_FlashHeal", -- Amplify Magic
    [604] = "Interface\\Icons\\Spell_Nature_AbolishMagic", -- Dampen Magic
    [1126] = "Interface\\Icons\\Spell_Nature_Regeneration", -- Mark of the Wild
    [21849] = "Interface\\Icons\\Spell_Nature_Regeneration", -- Gift of the Wild
    [467] = "Interface\\Icons\\Spell_Nature_Thorns", -- Thorns
    [19740] = "Interface\\Icons\\Spell_Holy_FistOfJustice", -- Blessing of Might
    [19742] = "Interface\\Icons\\Spell_Holy_SealOfWisdom", -- Blessing of Wisdom
    [20217] = "Interface\\Icons\\Spell_Magic_MageArmor", -- Blessing of Kings
    [1038] = "Interface\\Icons\\Spell_Holy_SealOfSalvation", -- Blessing of Salvation
    [19977] = "Interface\\Icons\\Spell_Holy_PrayerOfHealing02", -- Blessing of Light
    [20911] = "Interface\\Icons\\Spell_Nature_LightningShield", -- Blessing of Sanctuary
    [25782] = "Interface\\Icons\\Spell_Holy_GreaterBlessingofKings", -- Greater Blessing of Might
    [25894] = "Interface\\Icons\\Spell_Holy_GreaterBlessingofWisdom", -- Greater Blessing of Wisdom
    [25898] = "Interface\\Icons\\Spell_Holy_GreaterBlessingofKings", -- Greater Blessing of Kings
    [25895] = "Interface\\Icons\\Spell_Holy_GreaterBlessingofSalvation", -- Greater Blessing of Salvation
    [25890] = "Interface\\Icons\\Spell_Holy_GreaterBlessingofLight", -- Greater Blessing of Light
    [25899] = "Interface\\Icons\\Spell_Holy_GreaterBlessingofSanctuary", -- Greater Blessing of Sanctuary
    [6673] = "Interface\\Icons\\Ability_Warrior_BattleShout", -- Battle Shout
    [19506] = "Interface\\Icons\\Ability_TrueShot", -- Trueshot Aura
    [5697] = "Interface\\Icons\\Spell_Shadow_DemonBreath", -- Unending Breath
    [2970] = "Interface\\Icons\\Spell_Shadow_DetectInvisibility", -- Detect Invisibility
  },
  -- Retail's, for the buffs whose icon files are the same as WoW Forever's; Retail names an icon for every id it knows,
  -- so the rest never need one.
  retail = {
    [21562] = "Interface\\Icons\\Spell_Holy_WordFortitude", -- Power Word: Fortitude
    [1459] = "Interface\\Icons\\Spell_Holy_MagicalSentry", -- Arcane Intellect
    [1126] = "Interface\\Icons\\Spell_Nature_Regeneration", -- Mark of the Wild
    [6673] = "Interface\\Icons\\Ability_Warrior_BattleShout", -- Battle Shout
    [5697] = "Interface\\Icons\\Spell_Shadow_DemonBreath", -- Unending Breath
  },
})

-- Values -----------------------------------------------------------------------------------

-- A value that isn't there (nil). Written with type() so a hidden value never gets compared.
local function absent(v)
  return type(v) == "nil"
end

local calc

-- The heal prediction calculator's clamp mode and overflow, as the client takes them (the numbers the calculator is set to),
-- and its shield clamp: shields count up to the missing health less incoming heals, so past that the player is overshielded.
RH.CALC_CLAMP_MODE, RH.CALC_OVERFLOW, RH.CALC_ABSORB_CLAMP_MODE = 0, 1, 0

-- The client's heal prediction calculator (made once), or nil if this client has none.
local function calculator()
  if not calc and type(CreateUnitHealPredictionCalculator) == "function" then
    calc = CreateUnitHealPredictionCalculator()
    pcall(calc.SetIncomingHealClampMode, calc, RH.CALC_CLAMP_MODE)
    pcall(calc.SetIncomingHealOverflowPercent, calc, RH.CALC_OVERFLOW)
    pcall(calc.SetDamageAbsorbClampMode, calc, RH.CALC_ABSORB_CLAMP_MODE)
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

-- Whether the calculator's shields run past its clamp (the player's missing health less incoming heals), so some of
-- the shield sits beyond a full bar; nil on a client whose calculator can't say. It may be hidden: never tested here.
local function overshielded(c)
  if type(c.GetDamageAbsorbs) ~= "function" then return nil end
  local _, clamped = c:GetDamageAbsorbs()
  return clamped
end

-- max health, incoming heals, shields, and whether shields run past a full bar, for a unit (any may be hidden or nil).
function RH.Prediction(unit)
  local c = calculator()
  if c and type(UnitGetDetailedHealPrediction) == "function" then
    UnitGetDetailedHealPrediction(unit, "player", c)
    return c:GetMaximumHealth(), c:GetIncomingHeals(), c:GetTotalDamageAbsorbs(), overshielded(c)
  end
  return UnitHealthMax(unit), ask(UnitGetIncomingHeals, unit), ask(UnitGetTotalAbsorbs, unit)
end

-- The threat strip color for a unit, or nil when it has no aggro (or its threat is hidden).
function RH.ThreatColor(unit)
  local level = ns.ThreatLevel(unit)
  return level and T.TOKENS["threat" .. level]
end

-- Buff watch -------------------------------------------------------------------------------

-- The watched buff names from the settings: your own list if you set one, else your class's defaults.
-- Read through ns.Settings, so the options page works while this module is off.
local function readNames()
  local names = {}
  for name in (ns.Settings("RaidHealing", RH.defaults).buffs or ""):gmatch("[^,]+") do
    local trimmed = name:match("^%s*(.-)%s*$")
    if trimmed ~= "" then names[#names + 1] = trimmed end
  end
  if #names > 0 then return names end
  local _, class = UnitClass("player")
  return ns.SpellNames(RH.CLASS_BUFFS[class] or {})
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

-- Whether a unit has any watched buff: by name where the client has that lookup (it builds no list, and this
-- runs on every aura change of every raid member), else one pass over the client's all-at-once list of its
-- buffs, matched against the watched names.
local function hasWatched(unit, w)
  local auras = C_UnitAuras
  if auras and type(auras.GetAuraDataBySpellName) == "function" then return hasByName(unit) end
  local list = auras and type(auras.GetUnitAuras) == "function" and auras.GetUnitAuras(unit, "HELPFUL")
  if type(list) ~= "table" then return hasByName(unit) end
  for _, aura in ipairs(list) do
    if not ns.IsSecret(aura.name) and w.set[aura.name] then return true end
  end
  return false
end

-- Whether the client plainly says it can't see the unit (far away, another phase): it sends no
-- auras for one, so an empty list there proves nothing. A client without the call, or a hidden answer, counts as seen.
local function outOfSight(unit)
  local seen = ns.CallIf(_G, "UnitIsVisible", unit)
  return not ns.IsSecret(seen) and seen == false
end

-- The first watched buff you know, if the unit has none of the watched buffs; else nil.
-- While the client hides auras, or can't see the unit, a lookup can't see a buff, so an absent
-- buff proves nothing: unknown shows no marker rather than a false alarm.
function RH.MissingBuff(unit)
  if ns.AurasSecret() or outOfSight(unit) then return nil end
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

-- The missing-buff marker: the buff's icon in the tile's top-right corner zone (anchored to the corner, so a new width moves it).
local function addBuffMarker(b)
  local zones = RF.TileZones()
  local z = zones.missing
  b.missing = T.Snap(b.overlay:CreateTexture(nil, "OVERLAY"))
  b.missing:SetSize(z[3], z[4])
  b.missing:SetPoint("TOPRIGHT", b, "TOPRIGHT", z[1] + z[3] - zones.width, -z[2])
  T.Crop(b.missing)
  b.missing:Hide()
end

-- The overshield mark's width in pixels.
RH.OVERSHIELD_WIDTH = 2

-- The overshield mark: a thin bright line at the health bar's right end, over the bars, for shields past a full bar.
local function addOvershield(b)
  b.overshield = T.Tint(T.Snap(b.overlay:CreateTexture(nil, "ARTWORK")), "text")
  b.overshield:SetTexture(T.WHITE)
  b.overshield:SetPoint("TOPRIGHT", b.health, "TOPRIGHT")
  b.overshield:SetPoint("BOTTOMRIGHT", b.health, "BOTTOMRIGHT")
  b.overshield:SetWidth(RH.OVERSHIELD_WIDTH)
  b.overshield:Hide()
end

-- Adds the heal, shield, threat and buff parts to a raid button (RF setup hook).
local function setup(b)
  b.health:SetClipsChildren(true)
  b.heal = overlay(b, b.health, "heal", T.BarTexture())
  b.shield = overlay(b, b.heal, "shield", T.Texture("Stripes"))
  b.shield:GetStatusBarTexture():SetHorizTile(true)
  b.shield:GetStatusBarTexture():SetVertTile(true)
  b.power:SetFrameLevel(b.shield:GetFrameLevel() + 1)
  addThreat(b)
  addBuffMarker(b)
  addOvershield(b)
end

-- Updating ----------------------------------------------------------------------------------

-- Fills an overlay from a value; hides it when the value isn't there, emptied, so the
-- shield anchored after the heal fill starts at the health edge. It is as wide as the
-- whole health bar (the button less its 1 px border), so the same max gives the same
-- scale as the health fill.
-- An overlay as wide as the tile's health bar; set only when the tile's width changed (this runs on every
-- health event of every raid member).
local function fitWidth(b, bar)
  local width = math.max(0, (b:GetWidth() or 0) - 2)
  if bar.vgWidth == width then return end
  bar.vgWidth = width
  bar:SetWidth(width)
end

-- Fills an overlay from a value (see above): shown and scaled while on and the value is there.
local function fill(b, bar, max, value, on)
  bar:SetShown(on and not absent(value))
  if not on or absent(value) then return bar:SetValue(0) end
  fitWidth(b, bar)
  bar:SetMinMaxValues(0, max)
  bar:SetValue(value)
end

-- Lights the overshield mark when shields run past a full bar (a hidden answer goes to its opacity as it is);
-- shown only while shields are on.
local function paintOvershield(b, over)
  local mark = b.overshield
  mark:SetShown(RH.settings.absorbs == true)
  if ns.IsSecret(over) and mark.SetAlphaFromBoolean then return mark:SetAlphaFromBoolean(over, 1, 0) end
  mark:SetAlpha(ns.IsTrue(over) and 1 or 0)
end

-- Incoming heals, shields and the overshield mark.
local function updatePrediction(b, unit)
  local max, incoming, shields, over = RH.Prediction(unit)
  fill(b, b.heal, max, incoming, RH.settings.healPrediction)
  fill(b, b.shield, max, shields, RH.settings.absorbs)
  paintOvershield(b, over)
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

-- The missing-buff marker on every tile this module has set up (none once it stopped: a job asked for before the
-- stop may still come).
local function refreshBuffs()
  if not RH.scope.on then return end
  RF.EachTile(function(b, unit) if b.heal then updateBuff(b, unit) end end)
end

-- Your spells changed: work out which watched buffs you know again, and mark
-- the tiles once on the next frame (the client sends this in bursts).
local function onSpells()
  RH.Forget()
  ns.Soon("raidbuffs", refreshBuffs)
end

-- Whether a UNIT_AURA's update info says auras were only refreshed (none added or removed, no full update):
-- that can't change whether a watched buff is on, so the buff list isn't read again.
function RH.RefreshOnly(info)
  if type(info) ~= "table" or ns.IsSecret(info.isFullUpdate) or info.isFullUpdate then return false end
  return not (info.addedAuras and info.addedAuras[1]) and not (info.removedAuraInstanceIDs and info.removedAuraInstanceIDs[1])
end

-- A tile's unit event -> the part it refreshes (a health change refreshes the heal bars through RF.healthHooks:
-- incoming heals are clamped to the missing health). The buff marker follows the unit's auras and the roster
-- (RF.Update), not health.
RH.TILE_EVENTS = {
  UNIT_HEAL_PREDICTION = updatePrediction, UNIT_ABSORB_AMOUNT_CHANGED = updatePrediction,
  UNIT_THREAT_SITUATION_UPDATE = updateThreat, UNIT_AURA = updateBuff,
}

-- A unit event on a tile: its part, except for an aura event that only refreshed auras.
local function onTileEvent(b, unit, event, info)
  if not RH.scope.on then return end
  if event == "UNIT_AURA" and RH.RefreshOnly(info) then return end
  RH.TILE_EVENTS[event](b, unit)
end

-- Has a tile listen for its own unit's events only (RF.OnTileUnit), so a nameplate's or the target's aura, heal
-- or threat never runs anything here, and nothing is registered while there are no raid tiles.
local function listen(b)
  local events = {}
  for event in pairs(RH.TILE_EVENTS) do events[#events + 1] = event end
  RF.OnTileUnit(b, events, onTileEvent)
end

-- The events that are not about one unit -> what each refreshes.
local EVENTS = {
  SPELLS_CHANGED = onSpells,
  -- Logging in or zoning: read the list and your spells again.
  PLAYER_ENTERING_WORLD = function() RH.Forget() end,
  -- Entering combat may hide auras: the markers go rather than linger unchecked.
  PLAYER_REGEN_DISABLED = refreshBuffs,
  -- Leaving combat usually lifts the aura restriction: look at every buff again.
  PLAYER_REGEN_ENABLED = function() RF.UpdateAll() end,
}

-- Gives a raid button its parts and its own unit's events, once (a tile made while the module was off gets them at
-- the next start, and a tile that has them keeps them).
local function attach(b)
  if b.heal then return end
  setup(b)
  listen(b)
end

-- The parent's tile hook lists -> what this module keeps on each while it runs.
local function hooks()
  return { { RF.setupHooks, attach }, { RF.updateHooks, update }, { RF.healthHooks, updatePrediction } }
end

-- Module entry point (Core/Modules.lua): hook into raid buttons (existing and new). The hooks stay on the parent's
-- lists only while the module runs (RH.Disable), so the health path pays nothing for the lifecycle.
function RH.Enable(settings, scope)
  RH.settings, RH.scope = settings, scope
  for _, b in ipairs(RF.buttons) do attach(b) end
  for _, hook in ipairs(hooks()) do RA.AddHook(hook[1], hook[2]) end
  for event, fn in pairs(EVENTS) do scope:On(event, fn) end
  if ns.ModulesBuilt() then RF.UpdateAll() end
end

-- Hides a tile's heal, shield, threat, buff and overshield marks.
local function clearTile(b)
  for _, part in ipairs({ b.heal, b.shield, b.threat, b.missing, b.overshield }) do part:Hide() end
end

-- Switched off: the hooks leave the parent's lists and every tile that has the parts shows none of them (they
-- stay, with their unit events inert, for the next start).
function RH.Disable()
  for _, hook in ipairs(hooks()) do RA.RemoveHook(hook[1], hook[2]) end
  for _, b in ipairs(RF.buttons) do
    if b.heal then clearTile(b) end
  end
end

-- Options ------------------------------------------------------------------------------------

local W = ns.Widgets

-- get/set and the default for one of this module's switches (applies at the next refresh).
local function switch(key)
  -- The switch's saved value.
  local function get() return ns.Settings("RaidHealing", RH.defaults)[key] end
  return ns.Options.Tag(get, "RaidHealing", key),
    function(v) ns.Settings("RaidHealing", RH.defaults)[key] = v; RF.UpdateAll() end, RH.defaults[key]
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

-- Appends a class's name and a row per buff it gives (named by the client; one row per name, as a newer
-- client may give two ids one name), marking each name seen.
local function addClass(rows, seen, c)
  rows[#rows + 1] = { "header", className(c[1]) }
  for _, b in ipairs(c[2]) do
    local name = ns.SpellName(b[2]) or b[1]
    if not seen[name] then rows[#rows + 1] = { "buffpick", name, b[2] } end
    seen[name] = true
  end
end

-- Appends rows for buffs no class list has: your spellbook's Buffs group, then any other saved name.
local function addOthers(rows, seen)
  local names = {}
  addNames(names, seen, bookBuffs())
  addNames(names, seen, RH.BuffNames())
  if #names > 0 then rows[#rows + 1] = { "header", L["Other"] } end
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
  return live or RH.FALLBACK_ICONS[id] or 134400
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
  row.save = W.Button(row, L["Save"], function() saveBuffs(row.input) end, 80)
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
    { "header", L["On the raid frames"] },
    { "check", L["Incoming heals (green, past the health)"], switch("healPrediction") },
    { "check", L["Shields (white, after incoming heals)"], switch("absorbs") },
    { "check", L["Aggro strip along the top"], switch("aggro") },
    { "check", L["Mark players missing a buff you can give"], switch("buffWatch") },
    { "header", L["Buffs to watch"] },
  }
end

-- The Healing page's rows: the switches, a row per buff you could watch, then the typed list.
local function pageRows()
  local rows = switchRows()
  addBuffRows(rows)
  rows[#rows + 1] = { "text", L["Other buffs: names, separated by commas. None on = your class's usual buffs."] }
  rows[#rows + 1] = { "buffnames" }
  return rows
end

ns.Options.AddPage({ key = "healing", title = L["Healing"], icon = "NavHealing", order = 45, rows = pageRows })
