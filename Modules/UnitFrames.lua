-- Unit frames: player, target, target of target, focus, pet and party 1-4.
-- Each is a secure unit button (click to target, right-click for the unit
-- menu) with a health bar, power bar, name and health text, in the theme.
--
-- Midnight hides some unit values from addons ("secret values"). They can
-- be handed to bars and font strings but not compared or computed with, so
-- this file never does arithmetic on health or power: bars get the raw
-- values, and text is formatted only when the value isn't secret.

local ADDON, ns = ...

local L = ns.L

local T, V = ns.Theme, ns.Visibility

local UF = ns.Module("UnitFrames", {
  defaults = { hideBlizzard = true, healthText = true, powerHeight = 6, boss = true,
    -- Each frame's size (units), on the Unit frames page: the sizes the frames had before they were adjustable.
    playerWidth = 240, playerHeight = 36, targetWidth = 240, targettargetWidth = 120, targettargetHeight = 24,
    focusWidth = 160, focusHeight = 30, focustargetWidth = 80, focustargetHeight = 24,
    petWidth = 120, petHeight = 24, partyWidth = 160, partyHeight = 32, calm = false, deck = false, powerFormat = "none", healPrediction = true, absorbs = true, statusMarks = true, targetHeight = 36, tagMark = true, combatMark = true, keystone = "auto", keystoneSweep = false,
    -- Each portrait choice (Modules/UnitPortrait.lua): "off", "portrait" or "class".
    playerPortrait = "off", targetPortrait = "off", focusPortrait = "off",
    -- WoW Forever players read levels and health percent on every frame (as its own UI does),
    -- so a profile that hasn't chosen yet starts that way there.
    showLevel = ns.ClientData(ns.CLIENT_DEFAULTS.UnitFrames.showLevel), healthFormat = ns.ClientData(ns.CLIENT_DEFAULTS.UnitFrames.healthFormat),
    calmFrames = "dim", calmBars = "dim", calmAuras = "dim", calmStrips = "dim", calmXP = "hide", calmMeter = "dim", calmMinimap = "leave" },
})

-- Target classification -> the color of its diamond (none for normal units).
local CLASSIFICATION = { elite = "gold", rareelite = "accent", rare = "text2", worldboss = "bad" }

-- The canvas width under which target of target takes its narrow spot while the meter is off.
UF.NARROW_W = 1365

-- The canvas width under which target of target takes its narrow spot: UF.NARROW_W, or the meter's own
-- wide-spot width (ns.MeterWideFrom, Modules/Meter.lua) while that is more.
function UF.NarrowWidth()
  return math.max(UF.NARROW_W, ns.MeterWideFrom and ns.MeterWideFrom() or 0)
end

-- key (also the unit), size, label and default point (on UIParent) for each frame. The
-- Centered layout: everything anchored to the bottom center, so it keeps its
-- shape at any UI scale. Player and target mirror each other either side of
-- your character, the target of target sits outside the target on the same
-- line, the pet sits over the player frame's right end (combo points take its
-- left end, and the chat reaches up beside the frame), and the focus sits
-- above the player (its debuffs under it, its cast bar over it; Modules/CastBars.lua), and the focus target sits
-- beside it, on its inner side.
-- On a canvas under 1365 wide the target of target would reach the tooltip's corner (and past the
-- edge under 972), so there it sits over the target's cast bar instead, at the target's inner end; while the
-- Vanguard meter is on, on a canvas under 1838 (the meter's narrow spot covers the default one up to there).
local LAYOUT = {
  { key = "player", w = 240, h = 36, label = L["Player"], point = { "BOTTOM", "BOTTOM", -240, 196 } },
  { key = "target", w = 240, h = 36, outer = "RIGHT", label = L["Target"], point = { "BOTTOM", "BOTTOM", 240, 196 } },
  { key = "targettarget", w = 120, h = 24, outer = "RIGHT", label = L["Target of target"], point = { "BOTTOM", "BOTTOM", 426, 196,
    narrow = { w = UF.NarrowWidth, spot = { "BOTTOM", "BOTTOM", 180, 280 } } } },
  { key = "focus", w = 160, h = 30, label = L["Focus"], point = { "BOTTOM", "BOTTOM", -270, 290 } },
  { key = "focustarget", w = 80, h = 24, outer = "RIGHT", label = L["Focus target"], point = { "BOTTOM", "BOTTOM", -146, 290 } },
  { key = "pet", w = 120, h = 24, label = L["Pet"], point = { "BOTTOM", "BOTTOM", -184, 240 } },
}
UF.LAYOUT = LAYOUT
-- The same rows by key (the target's size, for one).
UF.LAYOUT_BY_KEY = {}
for _, def in ipairs(LAYOUT) do UF.LAYOUT_BY_KEY[def.key] = def end
local PARTY_SIZE = 4
-- Party 1 at the top of a column that ends 344 up, just above your player frame and centered on it
-- (where the raid frames sit too).
local PARTY = { w = 160, h = 32, gap = 10, label = L["Party"], point = { "BOTTOM", "BOTTOM", -240, 470 } }
-- The sliders' ranges for a frame's width and height (units); each holds the sizes the frames had before, and a
-- saved number outside is kept inside (a crafted profile can hold any). Height stays above the bars' own room.
UF.RANGES = { width = { min = 80, max = 400, step = 2 }, height = { min = 24, max = 80, step = 1 } }
-- Boss 1-5 in a column down from the empty top-left corner (clear of party and raid below).
UF.BOSS = { count = 5, w = 150, h = 26, gap = 6, label = L["Boss frames"], point = { "TOPLEFT", "TOPLEFT", 20, -20 } }

-- The settings group and layout row of a frame the sliders size: its own key, or "party" for party1-4; nil for the
-- boss frames, which keep their size.
local function sizeBase(key)
  if key:find("^party%d$") then return "party", PARTY end
  return key, UF.LAYOUT_BY_KEY[key]
end

-- A number kept inside a slider's range (the fallback when it isn't a number).
local function withinRange(range, value, fallback)
  return math.min(range.max, math.max(range.min, tonumber(value) or fallback))
end

-- The width and height a frame stands at now: the HUD layout's while it gives one (Core/HudLayout.lua ns.LayoutSize:
-- the keep's frames, Standards' banners), else its sliders' (the layout row's where unset); nil for a frame with no
-- sliders. Setup's role layouts raise the target's height through the same setting (targetHeight).
---@param key string a unit frame's key
---@return number|nil width, number|nil height
function UF.FrameSize(key)
  local group, base = sizeBase(key)
  if not base then return nil end
  local w, h = ns.LayoutSize("uf_" .. key)
  if w then return w, h end
  local s = UF.settings
  return withinRange(UF.RANGES.width, s[group .. "Width"], base.w), withinRange(UF.RANGES.height, s[group .. "Height"], base.h)
end

-- Blizzard frames replaced when hideBlizzard is on (only those this client has).
local BLIZZARD_FRAMES = { "PlayerFrame", "TargetFrame", "FocusFrame", "PetFrame", "PartyFrame" }
-- The game's boss frames: the holder is an ancestor of the secure boss buttons (protected with them, so an
-- insecure Show hook's Hide would be blocked in combat), and the buttons' own INSTANCE_ENCOUNTER_ENGAGE_UNIT
-- handler is what shows the holder, so holder and buttons are silenced and parked together.
local BOSS_FRAMES = { "BossTargetFrameContainer", "Boss1TargetFrame", "Boss2TargetFrame", "Boss3TargetFrame",
  "Boss4TargetFrame", "Boss5TargetFrame" }


UF.frames = {}

-- Values ---------------------------------------------------------------------------------

local isSecret = ns.IsSecret

-- r, g, b for a unit's reaction to the player (hostile, neutral, friendly); no table is made per call, as this
-- runs on every health event of a frame whose unit is not a player.
local function reactionColor(unit)
  local reaction = UnitReaction and UnitReaction(unit, "player")
  local token = "unknown"
  if not isSecret(reaction) and type(reaction) == "number" then
    token = reaction <= 3 and "hostile" or reaction == 4 and "neutral" or "friendly"
  end
  local r, g, b = T.RGB(token)
  return r, g, b
end

-- True for a creature another player or group has tagged (the game's own test, as its target frame greys
-- it): never a player or what a player controls. A hidden or missing answer counts as untagged.
function UF.Tapped(unit)
  return ns.PlainCall("UnitPlayerControlled", unit) ~= true and ns.PlainCall("UnitIsTapDenied", unit) == true
end

-- r, g, b for a unit with no tag grey: class color for players, reaction otherwise (the plates add their
-- own grey, behind their Tag marks switch).
function UF.UnitColor(unit)
  if ns.IsTrue(UnitIsPlayer(unit)) then
    local _, class = UnitClass(unit)
    local c = not isSecret(class) and RAID_CLASS_COLORS and RAID_CLASS_COLORS[class]
    if c then return c.r, c.g, c.b end
  end
  return reactionColor(unit)
end

-- r, g, b for a unit's health bar: grey for a creature someone else tagged, always, as the game's
-- frames do; else its class or reaction color.
function UF.HealthColor(unit)
  if not ns.IsTrue(UnitIsPlayer(unit)) and UF.Tapped(unit) then return T.RGB("tapped") end
  return UF.UnitColor(unit)
end

-- Power types with a Vanguard color; others use the client's PowerBarColor.
local POWER_TOKENS = { MANA = "mana", RAGE = "rage", ENERGY = "energy", FOCUS = "focus" }

-- r, g, b for a unit's power bar (mana, rage, energy...).
function UF.PowerColor(unit)
  local _, token = UnitPowerType(unit)
  if isSecret(token) or type(token) ~= "string" then return T.RGB("mana") end
  if POWER_TOKENS[token] then return T.RGB(POWER_TOKENS[token]) end
  local c = PowerBarColor and PowerBarColor[token]
  if c then return c.r, c.g, c.b end
  return T.RGB("mana")
end

-- A number as short text (12.3K). Secret values go to the client's own
-- formatter when there is one, since only it may read them. Nameplates' health value uses it too.
function UF.ShortNumber(value)
  if type(AbbreviateNumbers) == "function" then
    local ok, text = pcall(AbbreviateNumbers, value)
    if ok then
      return text
    end
  end
  return not isSecret(value) and tostring(value) or ""
end

-- True for a player who is known to be offline (secret or unknown counts as online).
local function isOffline(unit)
  if not UnitIsConnected or not ns.IsTrue(UnitIsPlayer(unit)) then
    return false
  end
  local connected = UnitIsConnected(unit)
  return not isSecret(connected) and connected == false
end

-- "Ghost" for a player who released, "Dead" for anyone else dead, nil for the living and for a hunter
-- feigning death (the client calls them dead too). A hidden answer counts as no.
local function deathWord(unit)
  if ns.PlainCall("UnitIsFeignDeath", unit) == true or not ns.IsTrue(UnitIsDeadOrGhost(unit)) then return nil end
  return ns.PlainCall("UnitIsGhost", unit) == true and L["Ghost"] or L["Dead"]
end

-- "Offline", "Dead", "Ghost", or nil when the unit is none of them; offline first, as the game's own raid
-- frames read it (a player who died and then left still has the last dead flag, and can't be raised).
-- Safe with secret values: they count as none, and nothing secret is compared.
function UF.DownState(unit)
  return isOffline(unit) and L["Offline"] or deathWord(unit)
end

-- Health as a percent ("84%"), from the client's own percent with its 0-100
-- curve, so it works while health is hidden (the text is then hidden too, and
-- only ever shown); nil where the client can't. No closure: plates call it on
-- every health change.
function UF.PercentText(unit)
  local get, curve = _G.UnitHealthPercent, _G.CurveConstants and _G.CurveConstants.ScaleTo100
  if type(get) ~= "function" or not curve then return nil end
  local ok, percent = pcall(get, unit, true, curve)
  if not ok then return nil end
  local formatted, text = pcall(string.format, "%d%%", percent)
  if formatted then return text end
end

-- Text formats -----------------------------------------------------------------------------------

-- The health or power text each format gives; a hidden value is never read, added up or compared (Midnight hides
-- some in instances): the client's own formatters (AbbreviateNumbers, UnitHealthPercent) make the text, and a text
-- that still comes back hidden can only be handed to the font string whole. So "both" and "deficit" fall back there:
-- "both" shows the percent alone and "deficit" shows the missing amount without its minus sign.
UF.FORMATS = { "value", "percent", "both", "deficit" }

-- Two texts side by side ("42.8K  84%"), or the second alone when either is hidden (a hidden text can't be joined).
function UF.JoinText(first, second)
  if isSecret(first) or isSecret(second) or not first or not second then return second or first end
  return first .. "  " .. second
end

-- A missing amount's text with its minus sign, or the text as it is when hidden; "" for nothing missing.
-- `missing` may be hidden: only the client's formatter reads it.
function UF.DeficitText(missing)
  if isSecret(missing) then return UF.ShortNumber(missing) end
  if type(missing) ~= "number" or missing <= 0 then return "" end
  return "-" .. UF.ShortNumber(missing)
end

-- The unit's health as the client shortens it (12.3K), possibly hidden.
local function healthValue(unit)
  return UF.ShortNumber(UnitHealth(unit))
end

-- Health as a percent, or its value where the client has no percent.
local function healthPercent(unit)
  return UF.PercentText(unit) or healthValue(unit)
end

-- Value and percent together (the percent alone while either is hidden).
local function healthBoth(unit)
  return UF.JoinText(healthValue(unit), UF.PercentText(unit))
end

-- What the unit is missing, from the client's own call (the value on a client without it).
local function healthDeficit(unit)
  if type(UnitHealthMissing) ~= "function" then return healthValue(unit) end
  return UF.DeficitText(UnitHealthMissing(unit))
end

local HEALTH_FORMATS = { value = healthValue, percent = healthPercent, both = healthBoth, deficit = healthDeficit }

-- The health text: Dead, Offline, else the chosen format of the health. Either may itself be secret: show it,
-- never compare it. `down` is the unit's DownState when the caller has it already (false for none); nil asks again.
function UF.HealthText(unit, down)
  if down == nil then down = UF.DownState(unit) end
  if down then return down end
  return (HEALTH_FORMATS[UF.settings and UF.settings.healthFormat] or healthValue)(unit)
end

-- A power value's percent text from plain numbers ("42%"); nil for a hidden or zero maximum.
local function powerPercent(cur, max)
  if not (cur and max and max > 0) then return nil end
  return string.format("%d%%", math.floor(cur / max * 100))
end

-- Power as the formats give it: the client's shortened value always; the percent and the missing amount only from
-- plain numbers (there is no hidden-safe client call for them here), the value while either is hidden.
local function powerValue(unit)
  return UF.ShortNumber(UnitPower(unit))
end

-- The plain current and maximum power of a unit, nil for each hidden one.
local function plainPower(unit)
  return ns.PlainNumber(UnitPower(unit)), ns.PlainNumber(UnitPowerMax(unit))
end

-- Power as a percent; nil while a number is hidden (the caller shows the value then).
local function powerPercentText(unit)
  local cur, max = plainPower(unit)
  return powerPercent(cur, max)
end

-- The power a unit is missing; nil while a number is hidden.
local function powerDeficit(unit)
  local cur, max = plainPower(unit)
  return cur and max and UF.DeficitText(max - cur) or nil
end

-- Value and percent together (the value alone while the percent can't be made).
local function powerBoth(unit)
  return UF.JoinText(powerValue(unit), powerPercentText(unit))
end

local POWER_FORMATS = { value = powerValue, percent = powerPercentText, deficit = powerDeficit, both = powerBoth }

-- The power text for the unit's powerFormat: "" for none (the default) or no power; the value where the chosen
-- format needs plain numbers and they are hidden.
function UF.PowerText(unit)
  local format = POWER_FORMATS[UF.settings and UF.settings.powerFormat]
  if not format or ns.PlainNumber(UnitPowerMax(unit)) == 0 then return "" end
  return format(unit) or powerValue(unit)
end

-- The unit's level as text ("??" for a boss or a level too far above you), or "".
function UF.LevelText(unit)
  local level = ns.PlainNumber(ns.PlainCall("UnitLevel", unit))
  if not level then return "" end
  return level < 1 and "??" or tostring(level)
end

-- Who has tagged a creature you can attack: "theirs" when the client calls it tap denied (another player
-- or group tagged it), "yours" when it is in combat and not tap denied, nil for anything else (an untouched
-- mob, a player or a player's pet, a friend, a hidden or missing answer). The client has no call that says "yours" outright,
-- so a mob in combat with you (or only with your pet) reads the same.
function UF.TagState(unit)
  if ns.PlainCall("UnitCanAttack", "player", unit) ~= true or ns.PlainCall("UnitIsPlayer", unit) == true then return nil end
  -- Only creatures are tagged: a player's pet or demon never is (the game's own tap greys skip them too).
  if ns.PlainCall("UnitPlayerControlled", unit) == true then return nil end
  local denied = ns.PlainCall("UnitIsTapDenied", unit)
  if denied == true then return "theirs" end
  if denied == false and ns.PlainCall("UnitAffectingCombat", unit) == true then return "yours" end
  return nil
end

-- Tag state -> the mark's icon and colour: a green check on yours, a grey X on another player's.
UF.TAG_LOOK = { yours = { "Check", "good" }, theirs = { "Close", "tapped" } }

-- Shows a tag mark in the look of `state`, or hides it (nil state).
function UF.PaintTagMark(tex, state)
  local look = UF.TAG_LOOK[state]
  tex:SetShown(look ~= nil)
  if not look then return end
  tex:SetTexture(T.Icon(look[1]))
  T.Tint(tex, look[2])
end

-- The color token of a unit's classification diamond, or nil for a normal unit.
function UF.ClassToken(unit)
  local kind = ns.PlainCall("UnitClassification", unit)
  return CLASSIFICATION[kind]
end

-- Building ------------------------------------------------------------------------------

-- A themed status bar filling part of a unit frame.
local function createBar(parent)
  local bar = T.StyleBar(CreateFrame("StatusBar", nil, parent))
  bar:SetMinMaxValues(0, 1)
  bar.bg = bar:CreateTexture(nil, "BACKGROUND")
  bar.bg:SetAllPoints()
  bar.bg:SetColorTexture(T.RGB("shade"))
  return bar
end

-- A font string in a text role on a unit frame's health bar (drawn on its layer, over the heal and shield bars).
local function createText(f, role, point, x)
  local fs = T.Text(f.layer:CreateFontString(nil, "OVERLAY"), role)
  fs:SetPoint(point, f.health, point, x, 0)
  return fs
end

-- The height of the name row over the bars on a frame drawn bare (the Hairline look), in units.
UF.NAME_ROW = 14

-- A unit frame's name tab under the Tabs look (Core/HudLook.lua): its height in units, and its least width.
UF.TAB = { height = 18, min = 48 }

-- Whether a frame stands as a banner now: the Standards HUD layout (Core/HudLayout.lua) is in force and sizes the
-- frame, one of the five it plants (Modules/UnitFrameLayouts.lua lays its parts out).
---@param f table a unit frame
---@return boolean
function UF.Standing(f)
  return ns.HudLayout() == "standards" and ns.LayoutSize("uf_" .. f.key) ~= nil
end

-- Whether the Versus deck is on now: switched on, under the Centered layout (the keep and Standards leave it off).
local function deckOn()
  return UF.settings.deck == true and ns.HudLayout() == "centered"
end

-- Whether the Versus deck holds a frame now (your frame and your target's while the deck is on).
local function decked(f)
  return deckOn() and UF.COMBAT.keys[f.key] == true
end

-- Whether a frame wears its name tab now: the look gives one (T.HudTab), the deck doesn't hold the frame and it
-- doesn't stand as a banner.
local function tabbed(f)
  return f.tab ~= nil and T.HudTab() and not decked(f) and not UF.Standing(f)
end

-- How far the bars sit inside a frame's edge: a screen pixel (not one UI unit, which shows a sliver of panel when
-- the UI scale isn't pixel-perfect), or two on a frame with a hairline (drawn a pixel inside the border).
local function barInset(f)
  local px = T.Pixel(f)
  if T.HairlineOf(f) then return 2 * px end
  return px
end

-- How far below a frame's top its health bar starts: the bar inset, or the name row on a frame drawn bare.
local function barsTop(f)
  if T.BareOf(f) then return UF.NAME_ROW end
  return barInset(f)
end

-- The health bar's height on a frame h units tall (from the height the frame was given: a fight may hide the one it
-- reports).
local function healthHeight(f, h)
  return h - barsTop(f) - UF.settings.powerHeight - 2 * barInset(f)
end

-- The width of a frame's health bar (units), from the width the frame was given, as the bars were last laid out
-- (layoutBars keeps it: the frame's width less the bar insets and the portrait's room).
---@param f table a unit frame
---@return number
function UF.BarWidth(f)
  return f.vgBarWidth
end

-- How far the bars sit inside a frame's edge (units).
---@param f table a unit frame
---@return number
function UF.BarInset(f)
  return barInset(f)
end

-- Lays out the bars inside a frame: health on top (under the name row on a bare frame), power along the bottom, each
-- the bar inset from the border (the outer end's also clear of a portrait, UF.Portrait); both filling along (a banner
-- stood them on end).
local function layoutBars(f, powerHeight)
  local inset, room = barInset(f), UF.Portrait.Measure(f)
  local left, right = inset + (f.outer == "LEFT" and room or 0), inset + (f.outer == "RIGHT" and room or 0)
  f.vgBarWidth = f.vgWidth - left - right
  f.health:SetOrientation("HORIZONTAL") f.power:SetOrientation("HORIZONTAL")
  f.health:ClearAllPoints() f.power:ClearAllPoints()
  f.health:SetPoint("TOPLEFT", left, -barsTop(f))
  f.health:SetPoint("BOTTOMRIGHT", -right, powerHeight + 2 * inset)
  f.power:SetPoint("TOPLEFT", f.health, "BOTTOMLEFT", 0, -inset)
  f.power:SetPoint("BOTTOMRIGHT", -right, inset)
end

-- Lines a readout adds under a frame's unit tooltip, by frame key: a function given the tooltip (UnitExtras: the pet's mood).
UF.TOOLTIP_LINES = {}

-- Shows the frame's unit in the game's tooltip, as the game's own unit frames do, then the lines a readout
-- adds. A forbidden tooltip is left alone, and one the Tooltips module hid (its in-combat switch) stays hidden.
function UF.ShowTooltip(f)
  local tt = GameTooltip
  if tt:IsForbidden() then return end
  GameTooltip_SetDefaultAnchor(tt, f)
  tt:SetUnit(f.unit)
  local addLines = UF.TOOLTIP_LINES[f.key]
  if addLines and tt:IsShown() then addLines(tt) tt:Show() end
end

-- Hides the tooltip when the mouse leaves the frame, if the frame still owns it.
function UF.HideTooltip(f)
  local tt = GameTooltip
  if not tt:IsForbidden() and tt:GetOwner() == f then tt:Hide() end
end

-- The secure part: which unit, left-click targets, right-click opens the menu; and the unit's tooltip on
-- hover, kept fresh while the mouse stays (the tooltip calls UpdateTooltip on its owner).
local function makeSecure(f, unit)
  f:SetAttribute("unit", unit)
  f:SetAttribute("*type1", "target")
  f:SetAttribute("*type2", "togglemenu")
  f:RegisterForClicks("AnyUp")
  f:HookScript("OnEnter", ns.Guard("unit frame tooltip", UF.ShowTooltip))
  f:HookScript("OnLeave", ns.Guard("unit frame tooltip", UF.HideTooltip))
  f.UpdateTooltip = ns.Guard("unit frame tooltip", UF.ShowTooltip)
end

-- The level beside the name, at the frame's outer end (where levels are shown; UF.PlaceParts anchors it).
local function addLevel(f)
  f.level = createText(f, "name", "LEFT", UF.TEXT_INSET)
end

-- How far from the inner edge the health text ends on a frame with the diamond, so it stays clear.
UF.CLASS_MARK_ROOM = 10

-- A small diamond (the Vanguard mark) over the top corner at the frame's inner end: elite, rare or boss. The health
-- text ends short of it (UF.PlaceParts places both).
local function addClassMark(f)
  f.class = T.Snap(f.layer:CreateTexture(nil, "OVERLAY"))
  f.class:SetTexture(T.Texture("LogoLeft"))
  f.class:SetSize(14, 14)
  f.class:Hide()
end

-- A small tag mark beside the classification diamond (UF.TAG_LOOK: whose tag the target carries).
local function addTagMark(f)
  f.tag = T.Snap(f.layer:CreateTexture(nil, "OVERLAY"))
  f.tag:SetSize(12, 12)
  f.tag:Hide()
end

-- In-combat mark ------------------------------------------------------------------------------

-- The frames that show whether their unit is fighting: yours gets crossed swords on its top-right corner (where
-- the target has its diamond) and a vermilion edge, your target's the edge alone. Off with the combatMark switch.
UF.COMBAT = { keys = { player = true, target = true }, icon = 14, color = "bad" }

-- The crossed swords over the player frame's inner top corner (hidden until a fight). The health text ends short of
-- them, fight or not, so it never jumps (UF.PlaceParts places both).
local function addCombatMark(f)
  f.combat = T.Snap(f.layer:CreateTexture(nil, "OVERLAY"), "icon")
  f.combat:SetTexture(T.Icon("Combat"))
  f.combat:SetSize(UF.COMBAT.icon, UF.COMBAT.icon)
  T.Tint(f.combat, UF.COMBAT.color)
  f.combat:Hide()
end

-- The raid target icon's size: the raid tiles' 12 grown to the unit frames' scale.
UF.RAID_ICON = 16

-- Frames shorter than this (the 24-26 tall target of target, pet and boss frames) lift their raid target icon
-- until its bottom clears the top of the name; taller ones keep it centred on the top edge. Boss frames stack only
-- 6 apart, so a lifted mark would cover the power bar of the frame above: they keep it centred (B4-3).
UF.RAID_ICON_SHORT = 30

-- How far the raid target icon's centre sits above the top edge of a frame h tall: on a short frame, enough for its
-- bottom to clear the top of the name (centred on the health bar, which stops over the power bar); on a bare frame,
-- whose name row is its top, clear of the frame; else 0.
local function raidIconLift(f, h)
  if T.BareOf(f) then return UF.RAID_ICON / 2 end
  if h >= UF.RAID_ICON_SHORT or f.key:match("^boss%d$") then return 0 end
  local nameGap = barsTop(f) + (healthHeight(f, h) - f.name:GetLineHeight()) / 2
  return math.max(0, UF.RAID_ICON / 2 - nameGap)
end

-- The raid target icon over the frame's top edge (hidden until UF.UpdateRaidIcon paints it; UF.PlaceParts places it).
local function addRaidIcon(f)
  f.raidIcon = f.layer:CreateTexture(nil, "OVERLAY")
  f.raidIcon:SetSize(UF.RAID_ICON, UF.RAID_ICON)
  f.raidIcon:Hide()
end

-- How far in from a frame's ends its texts sit (units).
UF.TEXT_INSET = 4

-- The power text: a small readout over the health bar's inner bottom corner (UF.PlaceParts places it, and shows it only
-- where the bar is tall enough to hold it under the health text); empty while the powerFormat is none.
local function addPowerText(f)
  f.powerText = createText(f, "small", "RIGHT", -UF.TEXT_INSET)
  f.powerText:Hide()
end

-- The name (with the level beside it, where shown) and the health text, anchored by UF.PlaceParts: the name stops
-- short of the health text, so a long one is cut off, not overlapped.
local function addTexts(f, settings)
  f.name, f.healthText = createText(f, "name", "LEFT", UF.TEXT_INSET), createText(f, "number", "RIGHT", -UF.TEXT_INSET)
  if settings.showLevel then addLevel(f) end
  addPowerText(f)
  f.name:SetWordWrap(false)
end

-- Cuts the bars to the shield corners: the health bar at the frame's top corners, the power bar at its bottom ones.
local function shieldBars(f)
  T.ShieldMask(f, { f.health:GetStatusBarTexture(), f.health.bg }, "TOP")
  T.ShieldMask(f, { f.power:GetStatusBarTexture(), f.power.bg }, "BOTTOM")
end

-- How far above the health bar its text layer stands: over the heal and shield bars (Modules/UnitPrediction.lua) that
-- sit just over the fill, so the name, the numbers and the marks are never covered.
UF.LAYER_LEVEL = 5

-- The layer over the health bar that carries the texts and the marks, the size of the bar.
local function addLayer(f)
  f.layer = CreateFrame("Frame", nil, f.health)
  f.layer:SetAllPoints()
  f.layer:SetFrameLevel(f.health:GetFrameLevel() + UF.LAYER_LEVEL)
end

-- The health and power bars, laid out and cut to the shield corners.
local function addBars(f, settings)
  f.health, f.power = createBar(f), createBar(f)
  addLayer(f)
  layoutBars(f, settings.powerHeight)
  shieldBars(f)
end

-- The name tab over a frame's outer corner (the Tabs look): a painted panel in the "tab" role, square and open at
-- the bottom under that look, without the HUD shadow (it would fall on the frame), hidden until UF.PlaceParts shows
-- it; made before the bars so the name (on the health bar) draws over it.
local function addTab(f)
  f.tab = CreateFrame("Frame", nil, f)
  T.PixelSize(f.tab, UF.TAB.min, UF.TAB.height)
  T.Panel(f.tab, { role = "tab", noSheen = true, noSurface = true })
  f.tab:Hide()
end

-- Creates one unit frame (a secure unit button, its unit the same as its key) with its bars and texts, shaped by
-- the HUD look (Core/HudLook.lua): a shield pointing from its outer side (`outer`, "LEFT" unless the row says
-- "RIGHT") under the Shield look, its corners cut while the shield setting is on under Plain, a name tab over the
-- outer corner under Tabs; the bars cut with it.
local function createUnitFrame(key, w, h, outer)
  local f = CreateFrame("Button", "Vanguard_" .. key, UIParent, "SecureUnitButtonTemplate")
  f.unit, f.key, f.outer, f.vgWidth, f.vgHeight = key, key, outer or "LEFT", w, h
  T.PixelSize(f, w, h)
  makeSecure(f, key)
  T.HudPanel(f, { shield = true, role = "unit", outer = f.outer })
  addTab(f)
  addBars(f, UF.settings)
  addTexts(f, UF.settings)
  addRaidIcon(f)
  return f
end

-- The HUD look ---------------------------------------------------------------------------------

-- The other end of a frame from a side.
local INNER = { LEFT = "RIGHT", RIGHT = "LEFT" }

-- The side a frame's shield points from ("LEFT" or "RIGHT"), or nil while its corners are not a shield's points (the
-- Plain look, or the Versus deck rounding it).
local function pointedSide(f)
  if T.CornerLook(f, "TOP" .. f.outer) == "point" then return f.outer end
  return nil
end

-- Whether a frame's bars fill from its right edge: your target's while the Versus deck mirrors it (their fills
-- anchored at the deck's ends); else a shield's when it points left, so its fill grows from its inner edge toward
-- the point (the Shield look: every fill reads toward your character).
local function fillsFromRight(f)
  if decked(f) then return f.key == "target" end
  return pointedSide(f) == "LEFT"
end
UF.FillsFromRight = fillsFromRight

-- An offset `x` pointing in from `side` (positive from the left edge, negative from the right).
local function inward(side, x)
  if side == "RIGHT" then return -x end
  return x
end

-- How far in from a frame's inner top corner the raid target icon's centre sits under the Tabs look: past the marks.
UF.RAID_ICON_BESIDE = 34

-- Places the raid target icon: in from the inner top corner, past the marks, on a frame wearing a tab (the tab may
-- cover the top's middle); else on the frame's top edge, lifted on a short or bare frame (UF.PlaceParts, for the look).
local function placeRaidIcon(f, side)
  local far = INNER[side]
  f.raidIcon:ClearAllPoints()
  if tabbed(f) then return f.raidIcon:SetPoint("CENTER", f, "TOP" .. far, inward(far, UF.RAID_ICON_BESIDE), 0) end
  f.raidIcon:SetPoint("CENTER", f, "TOP", 0, raidIconLift(f, f.vgHeight))
end

-- The frame a frame's name sits in: its tab while it wears one, else its health bar.
local function nameHome(f)
  if tabbed(f) then return f.tab end
  return f.health
end

-- Where a frame's name stops: at its tab's far end while it wears one, else short of the health text.
local function endName(f, side)
  local far = INNER[side]
  if tabbed(f) then return f.name:SetPoint(far, f.tab, far, inward(far, UF.TEXT_INSET), 0) end
  f.name:SetPoint(far, f.healthText, side, inward(far, UF.TEXT_INSET), 0)
end

-- How far in from a frame's `side` its name starts: the text inset, plus what a shield point takes at the health
-- bar's middle (nothing at a square or 8-pixel cut corner). From the height the frame was given (f.vgHeight): a
-- fight may hide the one it reports.
local function nameInset(f, side)
  local middle = barsTop(f) + healthHeight(f, f.vgHeight) / 2
  return UF.TEXT_INSET + math.max(0, T.CornerAt(f, "TOP" .. side) - middle)
end

-- How far above the health bar's middle a frame's texts sit: on a bare frame, the middle of the name row over the
-- bars (the Hairline look reads the name over its lines); else on the bar.
local function textLift(f)
  if T.BareOf(f) then return (healthHeight(f, f.vgHeight) + UF.NAME_ROW) / 2 end
  return 0
end

-- The name (with the level outside it, where shown) from `side` of its home (the health bar, or the tab), reading
-- toward the health text at the other end, or the tab's end.
local function placeName(f, side)
  local far, first = INNER[side], f.level or f.name
  first:ClearAllPoints()
  first:SetPoint(side, nameHome(f), side, inward(side, nameInset(f, side)), textLift(f))
  if f.level then
    f.name:ClearAllPoints()
    f.name:SetPoint(side, f.level, far, inward(side, UF.TEXT_INSET), 0)
  end
  endName(f, side)
  f.name:SetJustifyH(side)
end

-- How tall the health bar must be (units) to hold the power text under the health text, and how far in from the bar's top
-- and bottom edges the two sit then.
UF.POWER_TEXT = { room = 22, pad = 2 }

-- Whether a frame shows power text: its format is not none, and either the frame is drawn bare (its health text then sits
-- in the name row over the bars) or its health bar is tall enough for two lines.
local function powerTextOn(f)
  if not POWER_FORMATS[UF.settings.powerFormat] then return false end
  return T.BareOf(f) or healthHeight(f, f.vgHeight) >= UF.POWER_TEXT.room
end

-- The health text at the other end from the name, short of the marks on a frame that has them; on the bar's top line
-- while the power text takes the bottom one.
local function placeHealthText(f, side)
  local far = INNER[side]
  local room = (f.class or f.combat) and UF.CLASS_MARK_ROOM or UF.TEXT_INSET
  f.healthText:ClearAllPoints()
  if powerTextOn(f) and not T.BareOf(f) then
    f.healthText:SetPoint("TOP" .. far, f.health, "TOP" .. far, inward(far, room), -UF.POWER_TEXT.pad)
  else
    f.healthText:SetPoint(far, f.health, far, inward(far, room), textLift(f))
  end
  f.healthText:SetJustifyH(far)
end

-- The power text at the health bar's inner bottom corner (mid-bar on a bare frame), shown where powerTextOn says.
local function placePowerText(f, side)
  local far, on = INNER[side], powerTextOn(f)
  f.powerText:SetShown(on)
  if not on then return end
  f.powerText:ClearAllPoints()
  if T.BareOf(f) then f.powerText:SetPoint(far, f.health, far, inward(far, UF.TEXT_INSET), 0)
  else f.powerText:SetPoint("BOTTOM" .. far, f.health, "BOTTOM" .. far, inward(far, UF.TEXT_INSET), UF.POWER_TEXT.pad) end
  f.powerText:SetJustifyH(far)
  UF.PaintPowerText(f)
end

-- The marks (the classification diamond, the tag mark, the swords) over the frame's top corner at the health text's end.
local function placeMarks(f, side)
  local far = INNER[side]
  local point = "TOP" .. far
  if f.class then f.class:ClearAllPoints() f.class:SetPoint("CENTER", f, point, inward(far, 2), -2) end
  if f.combat then f.combat:ClearAllPoints() f.combat:SetPoint("CENTER", f, point, inward(far, 2), -2) end
  if f.tag then f.tag:ClearAllPoints() f.tag:SetPoint("CENTER", f, point, inward(far, 18), -2) end
end

-- The hairline token for a frame: brass in your and your target's rims while they are shields or banners or the look
-- lines every frame (Hairline, Rimmed), brighter in a fight (UF.PaintCombat); none otherwise (the look's own line, if
-- any, stays on the other frames).
local function hairToken(f)
  if not (UF.COMBAT.keys[f.key] and (pointedSide(f) or UF.Standing(f) or T.LookHairOf(f))) then return nil end
  if f.vgFighting then return "accent" end
  return "accentDim"
end

-- The roles a frame's name (and level) and health text take: the deck's while it holds the frame, the outlined HUD
-- roles under a look that draws them on the world or a fill, or on a banner (its name stands over the world, its
-- number on the fill), else their own.
local function textRoles(f)
  if decked(f) then return UF.DECK.text, UF.DECK.text end
  if T.HudOutlined() or UF.Standing(f) then return "hudName", "hudNumber" end
  return "name", "number"
end

-- Gives a frame's texts their roles for the look and the deck (the level and the health text keep their colours).
function UF.TextRoles(f)
  local name, number = textRoles(f)
  T.Text(f.name, name)
  if f.level then T.Text(f.level, name, false) end
  T.Text(f.healthText, number, T.ColorToken(f.healthText))
  T.Text(f.powerText, T.HudOutlined() and "barSmall" or "small", "text2")
end

-- The frame a crown's top follows: the tab while the frame wears one, the name line over a big banner (Standards),
-- else the frame itself.
local function crownTop(f)
  if tabbed(f) then return f.tab end
  if UF.Standing(f) and UF.Layouts.Big(f) then return f.name end
  return f
end

-- Spans a frame's crown from its bottom corners up to its tab's or name line's top while it wears one, else to its own top.
local function placeCrown(f)
  local crown = f.crown
  if not crown then return end
  crown:ClearAllPoints()
  crown:SetPoint("BOTTOMLEFT") crown:SetPoint("BOTTOMRIGHT")
  crown:SetPoint("TOP", crownTop(f), "TOP")
end

-- What the status row stands on: the frame's name tab while it wears one, else the frame.
---@param f table a unit frame
---@return table
function UF.StatusHome(f)
  if tabbed(f) then return f.tab end
  return f
end

-- The frame the rows over a unit frame anchor to (the combo points, the totems, the target's buffs and threat text):
-- the frame's own span, its top raised to the tab's while the frame wears one. Made the first time a module asks.
---@param f table a unit frame
---@return table
function UF.Crown(f)
  if not f.crown then
    f.crown = CreateFrame("Frame", nil, f)
    placeCrown(f)
  end
  return f.crown
end

-- The width a frame's tab needs: the name (and the level before it, where shown) with the text inset at each end, or
-- nil while the client hides a text's width (a fight with secret geometry).
local function tabWidth(f)
  local name = ns.PlainNumber(f.name:GetUnboundedStringWidth())
  local level = f.level and ns.PlainNumber(f.level:GetUnboundedStringWidth()) or 0
  if not (name and level) then return nil end
  if level > 0 then level = level + UF.TEXT_INSET end
  return 2 * UF.TEXT_INSET + name + level
end

-- Sizes a frame's tab to its name, no narrower than UF.TAB.min nor wider than half the frame (a longer name is cut
-- off at the tab's end), while the frame wears one; a width the client hides leaves the tab as it was.
---@param f table a unit frame
function UF.FitTab(f)
  if not tabbed(f) then return end
  local width = tabWidth(f)
  if not width then return end
  T.PixelSize(f.tab, math.min(f.vgWidth / 2, math.max(UF.TAB.min, width)), UF.TAB.height)
end

-- Shows a frame's tab at its outer top corner, a pixel down over the body's top border so the two read as one shape,
-- sized to the name (UF.FitTab), while the look gives it one; hides it otherwise. The crown follows.
local function placeTab(f)
  local on = tabbed(f)
  f.tab:SetShown(on)
  if on then
    f.tab:ClearAllPoints()
    f.tab:SetPoint("BOTTOM" .. f.outer, f, "TOP" .. f.outer, 0, -T.Pixel(f))
    UF.FitTab(f)
  end
  placeCrown(f)
end

-- The side a frame's name reads from: the side its shield points from, its outer side while it wears a tab (the tab
-- sits over that corner), else the left.
local function readSide(f)
  if tabbed(f) then return f.outer end
  return pointedSide(f) or "LEFT"
end

-- The health text, the power text and the name, which reads toward them.
local function placeTexts(f, side)
  placeHealthText(f, side)
  placePowerText(f, side)
  placeName(f, side)
end

-- Lays out the heal and shield bars, the status row and the portrait on the frames that carry them (they follow the
-- fill's side and the tab; on a standing banner each stays off, Modules/UnitPrediction.lua, UnitStatus.lua, UnitPortrait.lua).
local function placeExtras(f)
  if f.heal then UF.Prediction.Place(f) end
  if f.status then UF.Status.Place(f) end
  if f.portrait then UF.Portrait.Place(f) end
end

-- Shows a frame's texts (a small banner hid its name and number).
local function showTexts(f)
  f.name:Show() f.healthText:Show()
  if f.level then f.level:Show() end
end

-- Lays a frame's parts out across it (Centered and the keep): the bars (under the name row on a bare frame), the
-- texts, the name reading from the side its shield points from or its tab sits over (the left otherwise), the health
-- text and marks at the other end, the raid icon, the bars filling toward your character, and the parts riding them.
local function placeAcross(f)
  layoutBars(f, UF.settings.powerHeight)
  showTexts(f)
  local side = readSide(f)
  placeTexts(f, side)
  placeMarks(f, side)
  placeRaidIcon(f, side)
  f.health:SetReverseFill(fillsFromRight(f)) f.power:SetReverseFill(fillsFromRight(f))
  placeExtras(f)
end

-- The marks' placing and the riding parts' (the heal and shield bars, the status row, the portrait), for the layouts'
-- banners (Modules/UnitFrameLayouts.lua).
UF.PlaceMarks, UF.PlaceExtras = placeMarks, placeExtras

-- Lays a frame's parts out for the HUD look and layout: the hairline (the bars step in past it), the texts' roles,
-- the tab (sized to the name in its role), then the parts on end while the frame stands as a banner
-- (UF.Layouts.PlaceStandard), else across the frame.
function UF.PlaceParts(f)
  T.SetHairline(f, hairToken(f))
  UF.TextRoles(f)
  placeTab(f)
  if UF.Standing(f) then return UF.Layouts.PlaceStandard(f) end
  placeAcross(f)
end

-- How far the Tabs look lifts what sits over a unit frame (a cast bar's default spot, the target of target's narrow
-- spot): the tab's height while the unit frames are live and wear tabs, else 0.
---@return number
function UF.TabLift()
  if ns.ModuleLive("UnitFrames") and T.HudTab() then return UF.TAB.height end
  return 0
end

-- The target of target's default spot for the look: on a narrow canvas it sits over the target's cast bar, so its
-- narrow spot rises with that bar's under Tabs (Modules/CastBars.lua CB.FitLook).
local function targetOfTargetDefault()
  local def, spot = UF.LAYOUT_BY_KEY.targettarget.point, {}
  for k, v in pairs(def) do spot[k] = v end
  spot.narrow = { w = def.narrow.w, spot = ns.RaisedDefault(def.narrow.spot, UF.TabLift()) }
  return spot
end

-- Lays every frame out for the HUD look again (the look, the deck or a frame's size changed), and moves the target
-- of target's narrow spot with the look.
function UF.ApplyLook()
  for _, f in pairs(UF.frames) do UF.PlaceParts(f) end
  ns.SetMoverDefault("uf_targettarget", targetOfTargetDefault())
end

-- Updating ------------------------------------------------------------------------------

-- The health bar's colour: the dark bar for an offline or dead unit (as on the raid
-- tiles), else its class or reaction colour. `down` is the unit's DownState, read once by the caller.
function UF.PaintHealth(f, down)
  if down then return T.BarColor(f.health, "darkBar") end
  f.health:SetStatusBarColor(UF.HealthColor(f.unit))
end

-- The status colour for a down word: bad for Dead or Ghost, text2 for Offline (as on the raid tiles).
function UF.DownToken(down)
  return (down == L["Dead"] or down == L["Ghost"]) and "bad" or "text2"
end

-- The health text a frame shows: on a banner the percent (its top is too narrow for a number; secret, it is shown
-- untested), a down word still; else the health text setting's form (UF.HealthText).
local function healthWord(f, down)
  if down or not UF.Standing(f) then return UF.HealthText(f.unit, down or false) end
  local percent = UF.PercentText(f.unit)
  if isSecret(percent) or type(percent) == "string" then return percent end
  return UF.HealthText(f.unit, false)
end

-- The health text and its colour: a down word keeps its status colour. The text may be secret: it goes to the font
-- string untested.
local function paintHealthText(f, down)
  local text = ""
  if UF.settings.healthText then text = healthWord(f, down) end
  f.healthText:SetText(text)
  local token = down and UF.DownToken(down) or "text"
  if T.ColorToken(f.healthText) ~= token then T.Color(f.healthText, token) end
end

-- Health bar value, color and text. Raw values go straight to the bar; the
-- text may be secret, so it goes to the font string untested. A down word keeps its status colour.
function UF.UpdateHealth(f)
  local unit, down = f.unit, UF.DownState(f.unit)
  f.health:SetMinMaxValues(0, UnitHealthMax(unit))
  T.SetBarValue(f.health, UnitHealth(unit))
  f.vgDown = down
  if f.heal then UF.Prediction.Update(f) end
  UF.PaintHealth(f, down)
  paintHealthText(f, down)
end

-- Power bar value and color.
function UF.UpdatePower(f)
  local unit = f.unit
  f.power:SetMinMaxValues(0, UnitPowerMax(unit))
  T.SetBarValue(f.power, UnitPower(unit))
  f.power:SetStatusBarColor(UF.PowerColor(unit))
  UF.PaintPowerText(f)
end

-- The power text, while the frame shows one: empty for the dead and the offline (their health text says so).
function UF.PaintPowerText(f)
  if not (f.powerText:IsShown() and ns.IsTrue(UnitExists(f.unit))) then return end
  f.powerText:SetText(f.vgDown and "" or UF.PowerText(f.unit))
end

-- The heal prediction or shield switch changed (Unit frames page): the player, target and party frames paint again.
function UF.ApplyPrediction()
  UF.Prediction.Apply()
end

-- The status marks switch changed (Unit frames page): the marks show or go at once.
function UF.ApplyStatus()
  UF.Status.Apply()
end

-- A portrait choice changed (Unit frames page): the bars make room or take it back, and the portrait paints, out of combat.
function UF.ApplyPortraits()
  if not UF.frames.player then return end
  ns.OutOfCombat(UF.Portrait.Apply, "unit frame portraits")
end

-- The power format changed (Unit frames page): every frame lays its texts out again and repaints, out of combat.
function UF.ApplyPowerText()
  if not UF.frames.player then return end
  ns.OutOfCombat(function() UF.ApplyLook() UF.Refresh() end, "unit frame power text")
end

-- The level asked about for a ?? unit (UnitLevel -1: a boss, or one far above you): so far
-- above yours that the client answers with its hardest color, not the trivial gray -1 would get.
UF.SKULL_LEVEL = 999

-- r, g, b for how hard a unit is for you (the client's level color), or nil when it can't say.
function UF.LevelColor(unit)
  local get = _G.GetCreatureDifficultyColor
  local level = ns.PlainNumber(ns.PlainCall("UnitLevel", unit))
  if level and level < 1 then level = UF.SKULL_LEVEL end
  local c = type(get) == "function" and level and get(level)
  if c then return c.r, c.g, c.b end
end

-- Paints a level text: the unit's level in its difficulty color (secondary text when there's none).
function UF.PaintLevel(fs, unit)
  fs:SetText(UF.LevelText(unit))
  local r, g, b = UF.LevelColor(unit)
  if r then T.ColorRGB(fs, r, g, b) else T.Color(fs, "text2") end
end

-- The level, colored by how hard the unit is for you.
local function updateLevel(f)
  UF.PaintLevel(f.level, f.unit)
end

-- The classification diamond: shown in its color for elite, rare and boss units.
local function updateClass(f)
  local token = UF.ClassToken(f.unit)
  f.class:SetShown(token ~= nil)
  if token then T.Tint(f.class, token) end
end

-- The unit's name (passed through as is: it may be secret, and nil clears),
-- its level and its classification where the frame shows them.
function UF.UpdateName(f)
  f.name:SetText(UnitName(f.unit))
  if f.level then updateLevel(f) end
  if f.class then updateClass(f) end
  UF.FitTab(f)
end

-- The target frame's tag mark: a green check while the target looks tagged by you, a grey X while
-- another player has it (and the switch is on).
function UF.UpdateTag(f)
  if f.tag then UF.PaintTagMark(f.tag, UF.settings.tagMark == true and UF.TagState(f.unit) or nil) end
end

-- True while the unit is in combat: the client's answer (a hidden or missing one counts as no), and for you
-- also the client's combat lockdown.
function UF.InCombat(unit)
  if unit == "player" and ns.InCombat() then return true end
  return ns.PlainCall("UnitAffectingCombat", unit) == true
end

-- Shows or hides a frame's in-combat mark: the vermilion edge, and the swords where it has them (never with the
-- switch off). Painted only on a change, since the edge repaints the whole frame.
function UF.PaintCombat(f, fighting)
  local on = fighting == true and UF.settings.combatMark == true
  if f.vgFighting == on then return end
  f.vgFighting = on
  T.SetBorder(f, on and UF.COMBAT.color or nil)
  T.SetHairline(f, hairToken(f))
  if f.combat then f.combat:SetShown(on) end
end

-- Repaints the in-combat mark of a frame that has one (UF.COMBAT.keys), from its unit.
function UF.UpdateCombat(f)
  if UF.COMBAT.keys[f.key] then UF.PaintCombat(f, UF.InCombat(f.unit)) end
end

-- Repaints every frame's in-combat mark (a fight ended, or the switch changed).
function UF.RefreshCombat()
  for _, f in pairs(UF.frames) do UF.UpdateCombat(f) end
end

-- A fight is starting: your mark shows at once, before the client's lockdown begins.
function UF.CombatStarts()
  local f = UF.frames.player
  if f then UF.PaintCombat(f, true) end
end

-- The raid mark on the frame's unit, painted as Raid status paints the raid tiles' and following its
-- Raid target icons switch (read even while that module is off). A hidden mark shows nothing.
function UF.UpdateRaidIcon(f)
  local RS = ns.GetModule("RaidStatus")
  local on = ns.Settings("RaidStatus", RS.defaults).raidIcons == true
  RS.PaintIcon(f.raidIcon, on and RS.RaidIcon(f.unit) or nil)
end

-- Repaints every frame's raid mark (a mark was set or cleared, or the switch changed).
function UF.RefreshRaidIcons()
  for _, f in pairs(UF.frames) do UF.UpdateRaidIcon(f) end
end

-- Everything on a frame, if its unit exists.
function UF.UpdateFrame(f)
  if not ns.IsTrue(UnitExists(f.unit)) then
    return
  end
  UF.UpdateHealth(f)
  UF.UpdatePower(f)
  UF.UpdateName(f)
  UF.UpdateTag(f)
  UF.UpdateRaidIcon(f)
  UF.UpdateCombat(f)
  if f.status then UF.Status.Update(f) end
end

-- Unit event -> what it updates.
local UNIT_EVENTS = {
  UNIT_HEALTH = UF.UpdateHealth,
  UNIT_MAXHEALTH = UF.UpdateHealth,
  UNIT_CONNECTION = UF.UpdateHealth,
  UNIT_FACTION = UF.UpdateHealth,
  UNIT_POWER_UPDATE = UF.UpdatePower,
  UNIT_MAXPOWER = UF.UpdatePower,
  UNIT_DISPLAYPOWER = UF.UpdatePower,
  UNIT_NAME_UPDATE = UF.UpdateName,
  -- A unit's level changed (you dinged, or your target did): its level text.
  UNIT_LEVEL = UF.UpdateName,
}

-- What the target frame's tag mark also hears: a mob was tagged or let go (its flags, or its faction, which is
-- what the game's target frame re-greys on), or its threat list changed.
local TAG_EVENTS = { "UNIT_FLAGS", "UNIT_FACTION", "UNIT_THREAT_LIST_UPDATE" }

-- The unit events, as a list for ns.OnUnit.
local UNIT_EVENT_LIST = {}
for event in pairs(UNIT_EVENTS) do UNIT_EVENT_LIST[#UNIT_EVENT_LIST + 1] = event end

-- Listens for its own unit's events through ns.OnUnit (the client sends that unit's only, the target its tag
-- mark's too, and a frame with an in-combat mark UNIT_FLAGS, which comes as its unit starts or stops fighting);
-- the subscription is its own frame, not the secure unit button.
local function listen(f)
  f.vgUnitEvents = ns.OnUnit(UNIT_EVENT_LIST, function(event) UNIT_EVENTS[event](f) end, f.unit)
  if f.tag then f.vgTagEvents = ns.OnUnit(TAG_EVENTS, function() UF.UpdateTag(f) end, f.unit) end
  if UF.COMBAT.keys[f.key] then f.vgCombatEvents = ns.OnUnit("UNIT_FLAGS", function() UF.UpdateCombat(f) end, f.unit) end
end

-- Whether the frame's unit is someone else, or shows another name or level,
-- than at the last look (a secret answer counts as a change); notes what it saw.
local function identityChanged(f)
  local guid, name, level = UnitGUID(f.unit), UnitName(f.unit), UnitLevel(f.unit)
  local seen = f.vgSeen or {}
  f.vgSeen = seen
  if isSecret(guid) or isSecret(name) or isSecret(level) then seen[1] = nil return true end
  local changed = seen[1] == nil or seen[1] ~= guid or seen[2] ~= name or seen[3] ~= level
  seen[1], seen[2], seen[3] = guid, name, level
  return changed
end

-- One look at the target of target: health and power every time (they change
-- with no event to say so), its name, level and class only when it's someone else.
local function refreshTargetOfTarget(f)
  if not ns.IsTrue(UnitExists(f.unit)) then return end
  UF.UpdateHealth(f)
  UF.UpdatePower(f)
  if identityChanged(f) then UF.UpdateName(f) UF.UpdateRaidIcon(f) end
end

-- The frames of a unit that has no events of its own (the target's target, the focus's): they refresh a few times a
-- second while they show.
local POLLED = { "targettarget", "focustarget" }

-- Refreshes the target of target and the focus target a few times a second while they show.
local function pollTargetsOfTargets()
  for _, key in ipairs(POLLED) do ns.Every(UF.frames[key], 0.2, refreshTargetOfTarget, UF.frames[key]) end
end

-- Updates every frame whose key is listed (all frames with no list). A list is walked by its own keys, so an event
-- for a few frames does not look at the rest.
function UF.Refresh(keys)
  local frames = UF.frames
  if not keys then
    for _, f in pairs(frames) do UF.UpdateFrame(f) end
    return
  end
  for key in pairs(keys) do
    if frames[key] then UF.UpdateFrame(frames[key]) end
  end
end

-- Global event -> which frames it refreshes (false = every frame; the key must stay, so UF.Enable registers the event).
local GLOBAL_EVENTS = {
  PLAYER_ENTERING_WORLD = false,
  PLAYER_TARGET_CHANGED = { target = true, targettarget = true },
  PLAYER_FOCUS_CHANGED = { focus = true, focustarget = true },
  UNIT_PET = { pet = true },
  -- The party frames, and the target's tag mark: joining or leaving the tagger's group changes who tagged it.
  GROUP_ROSTER_UPDATE = { party1 = true, party2 = true, party3 = true, party4 = true, target = true },
  -- A boss joined or left the fight, or became attackable.
  INSTANCE_ENCOUNTER_ENGAGE_UNIT = { boss1 = true, boss2 = true, boss3 = true, boss4 = true, boss5 = true },
  UNIT_TARGETABLE_CHANGED = { boss1 = true, boss2 = true, boss3 = true, boss4 = true, boss5 = true },
  -- Your new level changes how hard every other unit is for you (the level colors).
  PLAYER_LEVEL_UP = false,
}

-- Refreshes the frames a global event affects.
local function onGlobalEvent(event)
  UF.Refresh(GLOBAL_EVENTS[event])
end

-- Setup ---------------------------------------------------------------------------------

-- Shows the frame while its unit exists (the client does this securely). A party frame also hides in a
-- raid, where party1-4 still exist (your subgroup) but the raid frames show them: one driver does both,
-- since a unit watch beside it would fight it over the frame's visibility.
local function watch(f)
  if f.unit:find("^party") then
    return RegisterAttributeDriver(f, "state-visibility", "[group:raid] hide; [@" .. f.unit .. ",exists] show; hide")
  end
  if f.unit ~= "player" and type(RegisterUnitWatch) == "function" then RegisterUnitWatch(f) end
end

-- Creates and wires one frame, its unit the same as its key. size has w and h (a LAYOUT row, PARTY or UF.BOSS).
local function addFrame(key, size)
  local w, h = UF.FrameSize(key)
  local f = createUnitFrame(key, w or size.w, h or size.h, size.outer)
  if key == "target" or key == "focus" then addClassMark(f) end
  if key == "target" then addTagMark(f) end
  if key == "player" then addCombatMark(f) end
  UF.PlaceParts(f)
  UF.frames[key] = f
  listen(f)
  watch(f)
  return f
end

-- A frame that also gets a mover, labelled and placed by spec (a LAYOUT row, PARTY or UF.BOSS).
local function addMovable(key, spec)
  local f = addFrame(key, spec)
  ns.Mover(f, "uf_" .. key, spec.label, spec.point)
  return f
end

-- True when the raid frames module also shows the party, so these party frames aren't built.
function UF.RaidCoversParty()
  local raid = ns.GetModule("RaidFrames")
  return raid ~= nil and ns.ModuleEnabled("RaidFrames") and ns.Settings("RaidFrames", raid.defaults).showInParty == true
end

-- Party 1-4: the first is movable, the rest stack below it.
local function addParty()
  local first = addMovable("party1", PARTY)
  local prev = first
  for i = 2, PARTY_SIZE do
    local f = addFrame("party" .. i, PARTY)
    f:SetPoint("TOPLEFT", prev, "BOTTOMLEFT", 0, -PARTY.gap)
    prev = f
  end
end

-- Boss 1-5: the first is movable, the rest stack below it (each shows while its boss exists).
local function addBosses()
  local b = UF.BOSS
  local prev = addMovable("boss1", b)
  addClassMark(prev)
  for i = 2, b.count do
    local f = addFrame("boss" .. i, b)
    f:SetPoint("TOPLEFT", prev, "BOTTOMLEFT", 0, -b.gap)
    addClassMark(f)
    prev = f
  end
end

local hiddenParent

-- Hides a game frame and puts it under the hidden frame (protected frames: out of combat only).
local function park(f)
  f:Hide()
  f:SetParent(hiddenParent)
end

-- Parks a frame the game showed again, unless it is still parked.
local function repark(f)
  if not f:IsShown() and f:GetParent() == hiddenParent then return end
  ns.OutOfCombat(function() park(f) end, f)
end

-- Parks again a frame the game shows by itself: Edit Mode closing runs UpdateShownState on the
-- managed frames (PetFrame, DurabilityFrame) with their events gone. Hooked once per frame.
local function keepParked(f)
  if type(f.UpdateShownState) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  UF.parked = UF.parked or {}
  if UF.parked[f] then return end
  UF.parked[f] = true
  hooksecurefunc(f, "UpdateShownState", ns.Guard("hook UpdateShownState", function() repark(f) end))
end

-- Game frames with no UpdateShownState that the managed-frame system or Edit Mode still moves
-- out of the hidden frame (SetParent) while they are shown.
UF.REPARENTED = { ObjectiveTrackerFrame = true }

-- Parks the frame again whenever the game gives it a parent other than the hidden frame. Its own
-- once-per-frame table, so a frame keepParked has hooked still gets this hook.
local function keepUnderHidden(f, name)
  if not UF.REPARENTED[name] or type(hooksecurefunc) ~= "function" then return end
  UF.reparentHooked = UF.reparentHooked or {}
  if UF.reparentHooked[f] then return end
  UF.reparentHooked[f] = true
  hooksecurefunc(f, "SetParent", ns.Guard("hook SetParent", function(_, parent)
    if parent ~= hiddenParent then repark(f) end
  end))
end

-- Hides one of the game's frames for good: no events, parented to a hidden frame.
local function hideBlizzard(name)
  local f = _G[name]
  if type(f) ~= "table" or not f.UnregisterAllEvents then return end
  hiddenParent = hiddenParent or CreateFrame("Frame")
  hiddenParent:Hide()
  f:UnregisterAllEvents()
  park(f)
  ns.EditModeReplaced(f)
  keepParked(f)
  keepUnderHidden(f, name)
end
-- Shared with modules that replace other game frames (PlayerAuras).
UF.HideBlizzard = hideBlizzard

-- Hides the game's frames Vanguard replaces, the boss holder and buttons too when
-- Vanguard draws bosses. Runs from build, so out of combat, with no Show hook.
local function hideReplaced(settings)
  for _, name in ipairs(BLIZZARD_FRAMES) do hideBlizzard(name) end
  if not settings.boss then return end
  for _, name in ipairs(BOSS_FRAMES) do hideBlizzard(name) end
end

-- Gives the frames that carry them their heal and shield bars and their status row.
local function attachExtras()
  UF.Prediction.Attach()
  UF.Status.Attach()
  UF.Portrait.Attach()
end

-- Builds every frame. Secure frames can't be set up in combat, so this waits.
local function build(settings)
  for _, def in ipairs(LAYOUT) do
    addMovable(def.key, def)
  end
  if not UF.RaidCoversParty() then addParty() end
  if settings.boss then addBosses() end
  pollTargetsOfTargets()
  if settings.hideBlizzard then hideReplaced(settings) end
  attachExtras()
  UF.Refresh()
  UF.ApplyDeck()
end

-- Versus deck -------------------------------------------------------------------------------

-- The Versus deck (off unless switched on, or picked in setup): one rounded panel joining the player
-- and target frames across the middle, the Vanguard crest at its top centre, and the target's bars
-- filling from the right, so the pair reads as a duel. The panel is a plain frame anchored to the two
-- secure buttons (it never moves them), on the background strata so it stays under everything between
-- them (cast bar, swing timer, cooldowns), and the crest with it.
-- The panel reaches UF.DECK.pad past the two frames with an accent border, and their names and health
-- read in UF.DECK.text, so the pair reads from across the screen. The panel and the two frames round
-- their corners while it is on (Cliff, 2026-10-19: no cut corners on the deck), their bars with them.
UF.DECK = { crest = 28, pad = 6, text = "title" }

-- How far the rows the player frame carries stand past its top and bottom edges (combo points, totems,
-- the druid's mana bar, the status chip); the deck's panel reaches that much further so none lies on its
-- border. A row raises it once, when built, and it stays (moving the panel on every shapeshift would lag in a fight).
UF.DeckReach = { top = 0, bottom = 0 }

-- Raises the deck's reach on a side ("top" or "bottom") to at least extent and refits a live panel.
function UF.RaiseDeckReach(side, extent)
  if extent <= UF.DeckReach[side] then return end
  UF.DeckReach[side] = extent
  UF.ApplySizes()
end

-- Makes the deck's panel from the player frame to the target frame, reaching UF.DECK.pad past them,
-- with an accent border and the crest centred on its top edge.
local function deckPanel(player, target)
  local d, pad = CreateFrame("Frame", nil, UIParent), UF.DECK.pad
  d:SetFrameStrata("BACKGROUND")
  d:SetPoint("TOPLEFT", player, "TOPLEFT", -pad, pad)
  d:SetPoint("BOTTOMRIGHT", target, "BOTTOMRIGHT", pad, -pad)
  T.HudPanel(d, { round = true, accent = true })
  d.crest = T.Logo(d, UF.DECK.crest)
  d.crest:SetPoint("CENTER", d, "TOP")
  return d
end

-- Shows or hides the deck (made the first time it shows); the two frames round with it, and every frame's parts
-- follow (the target's bars mirror on the deck).
local function deckNow()
  local on, player, target = deckOn(), UF.frames.player, UF.frames.target
  if not (player and target) then return end
  if on and not UF.deck then UF.deck = deckPanel(player, target) end
  if UF.deck then UF.deck:SetShown(on) end
  UF.ApplySizes()
  for _, f in ipairs({ player, target }) do T.SetRound(f, on) end
  UF.ApplyLook()
end

-- Gives a frame's name and health text the deck's larger role (on), or the roles the look gives them (UF.TextRoles).
function UF.DeckText(f, on)
  if not on then return UF.TextRoles(f) end
  T.Text(f.name, UF.DECK.text)
  T.Text(f.healthText, UF.DECK.text, T.ColorToken(f.healthText))
end

-- How tall the target frame stands: its targetHeight setting (setup's role layouts raise it, a taller
-- target for damage dealers and tanks, and its slider sets it), else its layout's height. It grows up from its bottom edge.
function UF.TargetHeight()
  return select(2, UF.FrameSize("target"))
end

-- Lifts the deck's top edge by the taller of the target frame's extra height and the rows above the player
-- frame, and drops its bottom edge by the rows under it, so the panel keeps its UF.DECK.pad clear of all.
local function fitDeckTop(player)
  if not UF.deck then return end
  local pad, reach = UF.DECK.pad, UF.DeckReach
  local taller = math.max(0, UF.TargetHeight() - select(2, UF.FrameSize("player")), reach.top)
  UF.deck:SetPoint("TOPLEFT", player, "TOPLEFT", -pad, pad + taller)
  UF.deck:SetPoint("BOTTOMRIGHT", UF.frames.target, "BOTTOMRIGHT", pad, -(pad + reach.bottom))
end

-- Sizes one frame to its sliders (a secure button: out of combat only), its shield point and texts with it.
local function sizeFrame(f)
  local w, h = UF.FrameSize(f.key)
  if not w then return end
  f.vgWidth, f.vgHeight = w, h
  T.PixelSize(f, w, h)
  T.RepaintFrame(f)
  UF.PlaceParts(f)
end

-- The target's and focus's aura rows wrap at their frame's width: they are made again for a new one.
local function refitAuras()
  local FA = ns.GetModule("FrameAuras")
  if FA and FA.settings then FA.Apply() end
end

-- Sizes every frame to its sliders (out of combat, or when it ends; a dragged slider keeps only the last ask), the
-- deck and the aura rows with them. The party column stacks from its first frame, so it follows.
function UF.ApplySizes()
  if not UF.frames.target then return end
  ns.OutOfCombat(function()
    for _, f in pairs(UF.frames) do sizeFrame(f) end
    fitDeckTop(UF.frames.player)
    refitAuras()
  end, "unit frame sizes")
end

-- Lays the HUD layout out again (Core/HudLayout.lua: it changed, or the canvas did and the keep holds on wide
-- canvases only): the frames' sizes and the deck (UF.ApplyDeck, the keystone with it), then the keep's wall.
function UF.ApplyLayout()
  UF.ApplyDeck()
  if UF.Layouts then UF.Layouts.ApplyKeep() end
end

-- Applies the Versus deck setting: now, or when combat ends (a new deck joins the Calm HUD); the keystone steps
-- aside for the deck.
function UF.ApplyDeck()
  if not UF.settings then return end
  ns.OutOfCombat(deckNow)
  UF.ApplyCalm()
  if UF.Keystone then UF.Keystone.Apply() end
end

-- Calm HUD ---------------------------------------------------------------------------------

-- Your frames and the Versus deck are the Calm HUD's "frames" part (Core/Visibility.lua): they
-- dim out of combat and come back in a fight, on a living hostile target or under the mouse.
UF.CALM_KEYS = { "player", "pet", "target", "targettarget", "focus", "focustarget" }
-- The Calm HUD's choices for the rest of the HUD (V.CALM_PARTS), which a profile saved before they came keeps on Leave.
UF.CALM_OTHERS = { "calmBars", "calmAuras", "calmStrips", "calmXP", "calmMeter", "calmMinimap" }

-- After 0.7.5: the Calm HUD grew from your frames to the whole HUD. A profile that had it on keeps it on
-- your frames only, so nothing else changes under the player until they pick it.
ns.Migrate("UnitFrames", function(saved)
  if saved.calm ~= true or saved.calmBars ~= nil then return end
  for _, key in ipairs(UF.CALM_OTHERS) do saved[key] = "leave" end
end)

-- Hands one frame to the Calm HUD, once.
local function calmFrame(f)
  if f and not f.vgCalm then V.Calm(f, "frames") end
end

-- Hands your frames and the Versus deck (once it is built) to the Calm HUD.
local function joinCalm()
  for _, key in ipairs(UF.CALM_KEYS) do calmFrame(UF.frames[key]) end
  calmFrame(UF.deck)
end

-- Applies the Calm HUD to the whole HUD: now, or when combat ends (after a Versus deck waiting for it is built).
function UF.ApplyCalm()
  if UF.settings then ns.OutOfCombat(joinCalm, "join calm") end
  V.ApplyCalm()
end

-- Module entry point (Core/Modules.lua): the layouts' part first (the frames take their shape as they are built),
-- build once out of combat, then listen; the keystone last (it stands between the built frames). The parts are files
-- of their own, loaded after this one.
function UF.Enable(settings)
  UF.settings = settings
  if UF.Layouts then UF.Layouts.Enable() end
  ns.OutOfCombat(function() build(settings) end)
  for event in pairs(GLOBAL_EVENTS) do ns.On(event, onGlobalEvent) end
  ns.On("RAID_TARGET_UPDATE", UF.RefreshRaidIcons)
  ns.On("PLAYER_REGEN_DISABLED", UF.CombatStarts)
  ns.On("PLAYER_REGEN_ENABLED", UF.RefreshCombat)
  T.OnChanged(function() ns.OutOfCombat(UF.ApplyLook, "unit frame look") end)
  if UF.Keystone then UF.Keystone.Enable() end
end
