-- Class resources on Retail (only Retail loads this file): what the game's player frame draws for a
-- class or spec, which hiding that frame took with it. A row of pips just above the player frame
-- (holy power, soul shards, chi, arcane charges, essence, runes), or a Brewmaster's stagger bar
-- just under it; a Devourer's soul fragments and an Augmentation's Ebon Might get a thin bar there too. CB.Enable (Modules/ClassBars.lua) calls CB.EnableResources at login.
--
-- Display only: nothing here is secure. Each pip is a status bar holding one point (pip i runs
-- from i - 1 to i), and the power goes to every pip as it is, so a value the client hides still
-- fills the right pips without being compared. A Destruction warlock's shards fill by tenths; the
-- essence on its way, and runes coming back, fill as they recharge, from plain numbers only.

local ADDON, ns = ...

local T = ns.Theme
local CB = ns.GetModule("ClassBars")
local UF = ns.GetModule("UnitFrames")

-- The resource of each class, for every spec, or by spec number (the game's SPEC_* values).
CB.RESOURCE_KINDS = {
  DEATHKNIGHT = "runes", PALADIN = "holyPower", WARLOCK = "soulShards", EVOKER = "essence",
  MAGE = { [1] = "arcaneCharges" }, MONK = { [1] = "stagger", [3] = "chi" },
}

-- The bar under the frame (the game's alternate power bar) of a class by spec number, besides its resource above.
CB.ALT_BARS = { DEMONHUNTER = { [3] = "soulFragments" }, EVOKER = { [3] = "ebonMight" } }

-- The auras those bars read (Blizzard_APIDocumentationGenerated/SpellIDDocumentation.lua; Ebon Might's is
-- EvokerEbonMightBar.lua's), and the fullest each bar shows while the client won't say (Ebon Might's is the game's 20 s).
CB.ALT_AURAS = {
  voidMetamorphosis = 1217607, darkHeart = 1225789, silenceTheWhispers = 1227702, ebonMight = 395296,
  fallbackMax = { soulFragments = 30, ebonMight = 20 },
}

-- How each resource is drawn: pips of a power type (Enum.PowerType's key) in a theme colour, with
-- the most it usually has (used while the client won't say), or a builder of its own. A minLevel is the level the
-- game's own bar starts showing at (requiredShownLevel in ShardBar.xml).
CB.RESOURCES = {
  holyPower = { power = "HolyPower", token = "holyPower", max = 5 },
  soulShards = { power = "SoulShards", token = "soulShards", max = 5, fractionSpec = 3, minLevel = 10 },
  chi = { power = "Chi", token = "chi", max = 5 },
  arcaneCharges = { power = "ArcaneCharges", token = "arcaneCharges", max = 4 },
  essence = { power = "Essence", token = "essence", max = 5, recharges = true },
  runes = { token = "runes", max = 6, runes = true },
  stagger = { stagger = true },
}

-- Sizes in units: a pip (as wide as a combo point), the gap between pips, the stagger bar's height.
CB.PIP = { size = 14, gap = 3, staggerHeight = 6 }
-- Stagger past these shares of your health turns the bar amber, then vermilion (the game's own steps).
CB.STAGGER_STEPS = { warn = 0.3, bad = 0.6 }
-- How often the stagger bar is read (the client sends no event for it), in seconds.
CB.STAGGER_PERIOD = 0.1
-- The ticker job that counts an Ebon Might bar down while the aura runs.
CB.EBON_MIGHT_JOB = "class ebon might"
-- Essence recharges at one point every five seconds when the client gives no rate (as its own bar does).
CB.ESSENCE_RATE = 0.2

-- Your spec number, or nil when the client has none to give.
local function spec()
  return ns.PlainNumber(C_SpecializationInfo.GetSpecialization())
end

-- Your resource's kind for a class (CB.RESOURCE_KINDS), or nil when it has none in this spec.
function CB.ResourceKind(class)
  local kind = CB.RESOURCE_KINDS[class]
  if type(kind) == "table" then return kind[spec() or 0] end
  return kind
end

-- Pips -------------------------------------------------------------------------------------

-- One pip: a small inset panel and a status bar holding point i, in the resource's colour.
local function pip(row, i, token)
  local p = T.HudPanel(CreateFrame("Frame", nil, row), { inset = true })
  p:SetSize(CB.PIP.size, math.floor(CB.PIP.size / 2))
  p:SetPoint("LEFT", row, "LEFT", (i - 1) * (CB.PIP.size + CB.PIP.gap), 0)
  local px = T.Pixel(p)
  p.bar = T.BarColor(T.StyleBar(CreateFrame("StatusBar", nil, p)), token)
  p.bar:SetPoint("TOPLEFT", px, -px); p.bar:SetPoint("BOTTOMRIGHT", -px, px)
  p.bar:SetMinMaxValues(i - 1, i)
  return p
end

-- The most points of a resource (the client's maximum where it says, else the usual one).
local function maxPoints(def)
  local power = def.power and Enum.PowerType[def.power]
  return power and ns.PlainNumber(UnitPowerMax("player", power)) or def.max
end

-- Sizes a row to its resource's most points: builds the pips it lacks and shows only that many.
local function fitPips(row)
  local most = maxPoints(row.def)
  for i = #row.pips + 1, most do row.pips[i] = pip(row, i, row.def.token) end
  for i, p in ipairs(row.pips) do p:SetShown(i <= most) end
  row:SetWidth(most * (CB.PIP.size + CB.PIP.gap))
end

-- A row of pips just above the player frame (over its tab, where the look gives it one: UF.Crown), as the combo points sit.
local function buildPips(player, def)
  local row = CreateFrame("Frame", nil, player)
  row:SetHeight(CB.PIP.size)
  row:SetPoint("BOTTOMLEFT", UF.Crown(player), "TOPLEFT", 0, 2)
  row.def, row.pips = def, {}
  fitPips(row)
  return row
end

-- Fills the row's pips from one value, each pip holding `scale` of it (a tenth-shard power holds ten).
local function fillPips(row, value, scale)
  for i, p in ipairs(row.pips) do
    p.bar:SetMinMaxValues((i - 1) * scale, i * scale)
    T.SetBarValue(p.bar, value)
  end
end

-- A row's power and how much of it one pip holds: whole points, or for a Destruction warlock's soul
-- shards the unmodified power, ten to a shard (UnitPowerDisplayMod), so a shard fills by tenths.
local function pipValue(def, power)
  local fraction = def.fractionSpec ~= nil and def.fractionSpec == spec()
  local scale = fraction and ns.PlainNumber(UnitPowerDisplayMod(power)) or nil
  if not scale or scale <= 0 then return UnitPower("player", power), 1 end
  return UnitPower("player", power, true), scale
end

-- Essence -----------------------------------------------------------------------------------

-- The client's essence recharge rate in points a second (CB.ESSENCE_RATE when it gives none).
local function essenceRate(power)
  local rate = ns.PlainNumber(GetPowerRegenForPowerType(power))
  return rate and rate > 0 and rate or CB.ESSENCE_RATE
end

-- Notes where the essence on its way stood just now (its share of a point), so the row can fill it as time goes.
local function stampEssence(row, power)
  local partial = ns.PlainNumber(UnitPartialPower("player", power)) or 0
  row.share, row.since, row.rate = partial / 1000, GetTime(), essenceRate(power)
end

-- Your essence and whether a point is on its way: the whole points plus the share of the next one
-- recharged so far (just the points as they come, with none on its way, while the client hides them).
local function essenceValue(row, power)
  local count = UnitPower("player", power)
  local plain = ns.PlainNumber(count)
  if not plain or plain >= maxPoints(row.def) then return count, false end
  return plain + math.min(0.99, row.share + (GetTime() - row.since) * row.rate), true
end

-- Fills the essence row, and again each frame while a point recharges (each power change restamps it).
local function fillEssence()
  local row = CB.resourceFrames.essence
  local value, recharging = essenceValue(row, Enum.PowerType.Essence)
  fillPips(row, value, 1)
  CB.scope:Every("class essence", recharging and 0 or nil, fillEssence, row)
end

-- Runes ------------------------------------------------------------------------------------

-- How far one rune has come back, 0 to 1 (1 when ready; 0 while the client hides its times).
local function runeShare(i, now)
  local start, duration, ready = GetRuneCooldown(i)
  if not ns.IsSecret(ready) and ready == true then return 1 end
  start, duration = ns.PlainNumber(start), ns.PlainNumber(duration)
  if not start or not duration or duration <= 0 then return 0 end
  return math.max(0, math.min(1, (now - start) / duration))
end

-- Sorts shares with the most ready first; one function, so a frame's sort allocates no closure.
CB.MOST_READY_FIRST = function(a, b) return a > b end

-- Every rune's share, most ready first (ready runes on the left, as the game sorts them), in the row's own table.
local function runeShares(row)
  local now = GetTime()
  row.shares = row.shares or {}
  for i = 1, #row.pips do row.shares[i] = runeShare(i, now) end
  table.sort(row.shares, CB.MOST_READY_FIRST)
  return row.shares
end

-- Fills the rune row; the ticker runs only while a rune is coming back.
local function fillRunes()
  local row = CB.resourceFrames.runes
  local shares, back = runeShares(row), true
  for i, p in ipairs(row.pips) do
    p.bar:SetMinMaxValues(0, 1)
    p.bar:SetValue(shares[i])
    back = back and shares[i] >= 1
  end
  CB.scope:Every("class runes", not back and 0 or nil, fillRunes, row)
end

-- Stagger ----------------------------------------------------------------------------------

-- A thin bar just under the player frame, as thin as the druid mana bar, in a theme colour.
local function thinBar(player, token)
  local holder = T.HudPanel(CreateFrame("Frame", nil, player), { inset = true })
  holder:SetPoint("TOPLEFT", player, "BOTTOMLEFT", 0, -3)
  holder:SetPoint("TOPRIGHT", player, "BOTTOMRIGHT", 0, -3)
  holder:SetHeight(CB.PIP.staggerHeight)
  local px = T.Pixel(holder)
  holder.bar = T.BarColor(T.StyleBar(CreateFrame("StatusBar", nil, holder)), token)
  holder.bar:SetPoint("TOPLEFT", px, -px); holder.bar:SetPoint("BOTTOMRIGHT", -px, px)
  return holder
end

-- The stagger bar just under the player frame, read on a timer (the client sends no event for it).
local function buildStagger(player)
  local holder = thinBar(player, "good")
  CB.scope:Every("class stagger", CB.STAGGER_PERIOD, CB.UpdateStagger, holder)
  return holder
end

-- The stagger bar's colour for the share of your health it holds (plain numbers only; else it keeps its colour).
local function staggerToken(amount, health)
  local a, h = ns.PlainNumber(amount), ns.PlainNumber(health)
  if not a or not h or h <= 0 then return nil end
  local share = a / h
  return share >= CB.STAGGER_STEPS.bad and "bad" or share >= CB.STAGGER_STEPS.warn and "warn" or "good"
end

-- Fills the stagger bar from your stagger against your health (values go straight to the bar).
function CB.UpdateStagger()
  local holder = CB.resourceFrames.stagger
  local amount, health = UnitStagger("player"), UnitHealthMax("player")
  holder.bar:SetMinMaxValues(0, health)
  T.SetBarValue(holder.bar, amount)
  local token = staggerToken(amount, health)
  if token then T.BarColor(holder.bar, token) end
end

-- Alternate bars -----------------------------------------------------------------------------

-- Your alternate bar's kind (CB.ALT_BARS) for a class, or nil when it has none in this spec.
function CB.AltKind(class)
  local kinds = CB.ALT_BARS[class]
  return kinds and kinds[spec() or 0]
end

-- One of your auras by spell id, or nil without it or while the client hides it (the result is
-- checked with type() and ns.IsSecret, never compared, since the client may hand back a secret).
local function ownAura(spellID)
  local aura = C_UnitAuras.GetPlayerAuraBySpellID(spellID)
  if type(aura) ~= "table" or ns.IsSecret(aura) then return nil end
  return aura
end

-- The stack count of one of your auras (a hidden count goes to the bar as it is), 0 without it.
local function stacks(spellID)
  local aura = ownAura(spellID)
  if not aura then return 0 end
  return aura.applications
end

-- The most soul fragments to show: the Collapsing Star's cost in Void Metamorphosis, else the Dark Heart's cap.
-- Only the one in use is asked for, and neither is truth-tested: either may be secret.
local function soulFragmentsMax(meta)
  local most
  if meta then most = GetCollapsingStarCost() else most = C_Spell.GetSpellMaxCumulativeAuraApplications(CB.ALT_AURAS.darkHeart) end
  return ns.PlainNumber(most) or CB.ALT_AURAS.fallbackMax.soulFragments
end

-- Fills the soul fragments bar from the aura the game reads: Silence the Whispers in Void Metamorphosis, else Dark Heart.
local function fillSoulFragments(bar)
  local auras = CB.ALT_AURAS
  local meta = ownAura(auras.voidMetamorphosis) ~= nil
  bar:SetMinMaxValues(0, soulFragmentsMax(meta))
  T.SetBarValue(bar, stacks(meta and auras.silenceTheWhispers or auras.darkHeart))
end

-- The seconds left on your Ebon Might (0 without it, or while the client hides its time).
local function ebonMightLeft()
  local aura = ownAura(CB.ALT_AURAS.ebonMight)
  local expires = aura and ns.PlainNumber(aura.expirationTime)
  return expires and math.max(0, expires - GetTime()) or 0
end

-- Fills the Ebon Might bar, and again each tenth of a second while it runs.
local function fillEbonMight(bar)
  local left = ebonMightLeft()
  bar:SetMinMaxValues(0, CB.ALT_AURAS.fallbackMax.ebonMight)
  T.SetBarValue(bar, left)
  CB.scope:Every(CB.EBON_MIGHT_JOB, left > 0 and CB.STAGGER_PERIOD or nil, CB.UpdateAlt, CB.altFrame)
end

-- How each alternate bar is filled (its kind is also its theme colour token).
CB.ALT_FILLS = { soulFragments = fillSoulFragments, ebonMight = fillEbonMight }

-- Repaints the alternate bar showing now (an aura change, or its own timer). A hidden bar (another spec)
-- stops the Ebon Might countdown, which would otherwise stay on the ticker.
function CB.UpdateAlt()
  local holder = CB.altFrame
  if holder and holder:IsShown() then return CB.ALT_FILLS[CB.altKind](holder.bar) end
  CB.scope:Every(CB.EBON_MIGHT_JOB, nil)
end

-- Shows the alternate bar of your spec now (building it the first time) and hides it in other specs.
function CB.ShowAlt(player)
  CB.altKind = CB.AltKind(CB.class)
  if CB.altKind and not CB.altFrame then CB.altFrame = thinBar(player, CB.altKind) end
  if CB.altFrame then CB.scope:Frame(CB.altFrame):SetShown(CB.altKind ~= nil) end
  CB.UpdateAlt()
end

-- Showing ----------------------------------------------------------------------------------

-- Builds a resource's frame on the player frame: the stagger bar, or a row of pips.
local function buildResource(player, def)
  if def.stagger then return buildStagger(player) end
  return buildPips(player, def)
end

-- Repaints a row of pips from its power (runes from their cooldowns, essence and shards in parts).
local function fillRow(row)
  local def = row.def
  if def.runes then return fillRunes() end
  local power = Enum.PowerType[def.power]
  fitPips(row)
  if def.recharges then
    stampEssence(row, power)
    return fillEssence()
  end
  fillPips(row, pipValue(def, power))
end

-- Repaints the resource showing now (a power, rune or spec change).
function CB.UpdateResource()
  local frame = CB.kind and CB.resourceFrames[CB.kind]
  if not frame then return end
  if frame.def then return fillRow(frame) end
  CB.UpdateStagger()
end

-- Whether you are high enough for a resource the game shows only from a level.
local function levelled(def)
  return def.minLevel == nil or (ns.PlainNumber(UnitLevel("player")) or 0) >= def.minLevel
end

-- Shows the resource of your spec now (building it the first time) and hides the others; none below its level.
function CB.ShowResource()
  local player = UF.frames.player
  if not (player and CB.scope:Running()) then return end
  CB.kind = CB.ResourceKind(CB.class)
  local def = CB.kind and CB.RESOURCES[CB.kind]
  if def and not levelled(def) then CB.kind, def = nil, nil end
  if def and not CB.resourceFrames[CB.kind] then CB.resourceFrames[CB.kind] = buildResource(player, def) end
  for kind, frame in pairs(CB.resourceFrames) do CB.scope:Frame(frame):SetShown(kind == CB.kind) end
  CB.UpdateResource()
  CB.ShowAlt(player)
end

-- The power events that change a resource, all your own.
CB.RESOURCE_EVENTS = { "UNIT_POWER_FREQUENT", "UNIT_MAXPOWER", "UNIT_DISPLAYPOWER" }

-- A spec change (yours; the event names the unit) shows the new spec's resource, out of combat.
local function onSpec(_, unit)
  if unit == nil or unit == "player" then ns.OutOfCombat(CB.ShowResource) end
end

-- A level-up (yours) may bring a resource into view, out of combat.
local function onLevelUp()
  ns.OutOfCombat(CB.ShowResource)
end

-- Your class resource (CB.Enable, Modules/ClassBars.lua): built out of combat after the unit frames
-- (it hangs off the player frame), repainted on your power and rune changes, rebuilt on a spec change.
function CB.EnableResources(class, scope)
  if not (CB.RESOURCE_KINDS[class] or CB.ALT_BARS[class]) then return end
  CB.class, CB.scope, CB.resourceFrames = class, scope, CB.resourceFrames or {}
  ns.OutOfCombat(CB.ShowResource)
  scope:OnUnit(CB.RESOURCE_EVENTS, CB.UpdateResource, "player")
  scope:On("RUNE_POWER_UPDATE", CB.UpdateResource)
  scope:On("PLAYER_SPECIALIZATION_CHANGED", onSpec)
  scope:On("PLAYER_LEVEL_UP", onLevelUp)
  if CB.ALT_BARS[class] then scope:OnUnit("UNIT_AURA", CB.UpdateAlt, "player") end
end
