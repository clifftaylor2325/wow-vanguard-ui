-- Unit frames: player, target, target of target, focus, pet and party 1-4.
-- Each is a secure unit button (click to target, right-click for the unit
-- menu) with a health bar, power bar, name and health text, in the theme.
--
-- Midnight hides some unit values from addons ("secret values"). They can
-- be handed to bars and font strings but not compared or computed with, so
-- this file never does arithmetic on health or power: bars get the raw
-- values, and text is formatted only when the value isn't secret.

local ADDON, ns = ...

local T, V = ns.Theme, ns.Visibility

local UF = ns.Module("UnitFrames", {
  defaults = { hideBlizzard = true, healthText = true, powerHeight = 6, boss = true, calm = false, deck = false, targetHeight = 36, tagMark = true },
})

-- Target classification -> the color of its diamond (none for normal units).
local CLASSIFICATION = { elite = "gold", rareelite = "accent", rare = "text2", worldboss = "bad" }

-- key, unit, size, label and default point (on UIParent) for each frame. The
-- Centered layout: everything anchored to the bottom center, so it keeps its
-- shape at any UI scale. Player and target mirror each other either side of
-- your character, the target of target sits outside the target on the same
-- line, the pet sits over the player frame's right end (combo points take its
-- left end, and the chat reaches up beside the frame), and the focus sits
-- above the player (its debuffs under it, its cast bar over it; Modules/CastBars.lua).
local LAYOUT = {
  { key = "player", unit = "player", w = 240, h = 36, label = "Player", point = { "BOTTOM", "BOTTOM", -240, 196 } },
  { key = "target", unit = "target", w = 240, h = 36, label = "Target", point = { "BOTTOM", "BOTTOM", 240, 196 } },
  { key = "targettarget", unit = "targettarget", w = 120, h = 24, label = "Target of target", point = { "BOTTOM", "BOTTOM", 426, 196 } },
  { key = "focus", unit = "focus", w = 160, h = 30, label = "Focus", point = { "BOTTOM", "BOTTOM", -270, 290 } },
  { key = "pet", unit = "pet", w = 120, h = 24, label = "Pet", point = { "BOTTOM", "BOTTOM", -184, 240 } },
}
UF.LAYOUT = LAYOUT
local PARTY_SIZE = 4
-- Party 1 at the top of a column that ends 344 up, just above your player frame and centered on it
-- (where the raid frames sit too).
local PARTY = { w = 160, h = 32, gap = 10, label = "Party", point = { "BOTTOM", "BOTTOM", -240, 470 } }
-- Boss 1-5 in a column down from the empty top-left corner (clear of party and raid below).
UF.BOSS = { count = 5, w = 150, h = 26, gap = 6, label = "Boss frames", point = { "TOPLEFT", "TOPLEFT", 20, -20 } }

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

-- A plain boolean from an API that may return a secret: secrets count as false.
local function flag(value)
  return not isSecret(value) and value == true
end

-- A client answer about a unit, or nil when the client lacks the call or hides the answer.
local function asked(name, ...)
  local fn = _G[name]
  if type(fn) ~= "function" then return nil end
  local answer = fn(...)
  if isSecret(answer) then return nil end
  return answer
end

-- The color for a unit's reaction to the player (hostile, neutral, friendly).
local function reactionColor(unit)
  local reaction = UnitReaction and UnitReaction(unit, "player")
  if isSecret(reaction) or type(reaction) ~= "number" then
    return T.TOKENS.unknown
  end
  return { T.RGB(reaction <= 3 and "hostile" or reaction == 4 and "neutral" or "friendly") }
end

-- True for a creature another player or group has tagged (the game's own test, as its target frame greys
-- it): never a player or what a player controls. A hidden or missing answer counts as untagged.
function UF.Tapped(unit)
  return asked("UnitPlayerControlled", unit) ~= true and asked("UnitIsTapDenied", unit) == true
end

-- r, g, b for a unit with no tag grey: class color for players, reaction otherwise (the plates add their
-- own grey, behind their Tag marks switch).
function UF.UnitColor(unit)
  if flag(UnitIsPlayer(unit)) then
    local _, class = UnitClass(unit)
    local c = not isSecret(class) and RAID_CLASS_COLORS and RAID_CLASS_COLORS[class]
    if c then return c.r, c.g, c.b end
  end
  local c = reactionColor(unit)
  return c[1], c[2], c[3]
end

-- r, g, b for a unit's health bar: grey for a creature someone else tagged, always, as the game's
-- frames do; else its class or reaction color.
function UF.HealthColor(unit)
  if UF.Tapped(unit) then return T.RGB("tapped") end
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
-- formatter when there is one, since only it may read them.
local function shortNumber(value)
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
  if not UnitIsConnected or not flag(UnitIsPlayer(unit)) then
    return false
  end
  local connected = UnitIsConnected(unit)
  return not isSecret(connected) and connected == false
end

-- "Ghost" for a player who released, "Dead" for anyone else dead, nil for the living and for a hunter
-- feigning death (the client calls them dead too). A hidden answer counts as no.
local function deathWord(unit)
  if asked("UnitIsFeignDeath", unit) == true or not flag(UnitIsDeadOrGhost(unit)) then return nil end
  return asked("UnitIsGhost", unit) == true and "Ghost" or "Dead"
end

-- "Dead", "Ghost", "Offline", or nil when the unit is none of them. Safe with secret
-- values: they count as none, and nothing secret is compared.
function UF.DownState(unit)
  return deathWord(unit) or (isOffline(unit) and "Offline" or nil)
end

-- Health as a percent ("84%"), from the client's own percent with its 0-100
-- curve, so it works while health is hidden; nil where the client can't.
local function percentText(unit)
  local get, curve = _G.UnitHealthPercent, _G.CurveConstants and _G.CurveConstants.ScaleTo100
  if type(get) ~= "function" or not curve then return nil end
  local ok, text = pcall(function() return string.format("%d%%", get(unit, true, curve)) end)
  if not ok then return nil end
  return text
end

-- The health text: Dead, Offline, else the percent (if chosen) or current
-- health shortened. Either may itself be secret: show it, never compare it.
function UF.HealthText(unit)
  local down = UF.DownState(unit)
  if down then return down end
  local percent = UF.settings and UF.settings.healthFormat == "percent" and percentText(unit)
  if isSecret(percent) or type(percent) == "string" then return percent end
  return shortNumber(UnitHealth(unit))
end

-- The unit's level as text ("??" for a boss or a level too far above you), or "".
function UF.LevelText(unit)
  local level = ns.PlainNumber(type(UnitLevel) == "function" and UnitLevel(unit) or nil)
  if not level then return "" end
  return level < 1 and "??" or tostring(level)
end

-- Who has tagged a creature you can attack: "theirs" when the client calls it tap denied (another player
-- or group tagged it), "yours" when it is in combat and not tap denied, nil for anything else (an untouched
-- mob, a player or a player's pet, a friend, a hidden or missing answer). The client has no call that says "yours" outright,
-- so a mob in combat with you (or only with your pet) reads the same.
function UF.TagState(unit)
  if asked("UnitCanAttack", "player", unit) ~= true or asked("UnitIsPlayer", unit) == true then return nil end
  -- Only creatures are tagged: a player's pet or demon never is (the game's own tap greys skip them too).
  if asked("UnitPlayerControlled", unit) == true then return nil end
  local denied = asked("UnitIsTapDenied", unit)
  if denied == true then return "theirs" end
  if denied == false and asked("UnitAffectingCombat", unit) == true then return "yours" end
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
  local kind = type(UnitClassification) == "function" and UnitClassification(unit) or nil
  return not ns.IsSecret(kind) and CLASSIFICATION[kind] or nil
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

-- A font string in a text role on a unit frame's health bar.
local function createText(f, role, point, x)
  local fs = T.Text(f.health:CreateFontString(nil, "OVERLAY"), role)
  fs:SetPoint(point, f.health, point, x, 0)
  return fs
end

-- Lays out the bars inside a frame: health on top, power along the bottom,
-- one screen pixel inside the border (not one UI unit, which shows a sliver
-- of panel when the UI scale isn't pixel-perfect).
local function layoutBars(f, powerHeight)
  local px = T.Pixel(f)
  f.health:SetPoint("TOPLEFT", px, -px)
  f.health:SetPoint("BOTTOMRIGHT", -px, powerHeight + 2 * px)
  f.power:SetPoint("TOPLEFT", f.health, "BOTTOMLEFT", 0, -px)
  f.power:SetPoint("BOTTOMRIGHT", -px, px)
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

-- The level left of the name (where levels are shown).
local function addLevel(f)
  f.level = createText(f, "name", "LEFT", 4)
  f.name:ClearAllPoints()
  f.name:SetPoint("LEFT", f.level, "RIGHT", 4, 0)
end

-- A small diamond (the Vanguard mark) over the top-right corner: elite, rare or boss.
local function addClassMark(f)
  f.class = T.Snap(f.health:CreateTexture(nil, "OVERLAY"))
  f.class:SetTexture(T.Texture("LogoLeft"))
  f.class:SetSize(14, 14)
  f.class:SetPoint("CENTER", f, "TOPRIGHT", -2, -2)
  f.class:Hide()
end

-- A small tag mark left of the classification diamond (UF.TAG_LOOK: whose tag the target carries).
local function addTagMark(f)
  f.tag = T.Snap(f.health:CreateTexture(nil, "OVERLAY"))
  f.tag:SetSize(12, 12)
  f.tag:SetPoint("CENTER", f, "TOPRIGHT", -18, -2)
  f.tag:Hide()
end

-- The raid target icon's size: the raid tiles' 12 grown to the unit frames' scale.
UF.RAID_ICON = 16

-- The raid target icon, centred on the frame's top edge (hidden until UF.UpdateRaidIcon paints it).
local function addRaidIcon(f)
  f.raidIcon = f.health:CreateTexture(nil, "OVERLAY")
  f.raidIcon:SetSize(UF.RAID_ICON, UF.RAID_ICON)
  f.raidIcon:SetPoint("CENTER", f, "TOP")
  f.raidIcon:Hide()
end

-- The name (with the level left of it, where shown), the health text and the raid icon. The
-- name stops short of the health text: a long one is cut off, not overlapped.
local function addTextsAndIcon(f, settings)
  f.name, f.healthText = createText(f, "name", "LEFT", 4), createText(f, "number", "RIGHT", -4)
  if settings.showLevel then addLevel(f) end
  f.name:SetPoint("RIGHT", f.healthText, "LEFT", -4, 0)
  f.name:SetJustifyH("LEFT")
  f.name:SetWordWrap(false)
  addRaidIcon(f)
end

-- Cuts the bars to the shield corners: the health bar at the frame's top corners, the power bar at its bottom ones.
local function shieldBars(f)
  T.ShieldMask(f, { f.health:GetStatusBarTexture(), f.health.bg }, "TOP")
  T.ShieldMask(f, { f.power:GetStatusBarTexture(), f.power.bg }, "BOTTOM")
end

-- Creates one unit frame (a secure unit button) with its bars and texts, its corners cut to the
-- shield look (the bars cut with it) while the shield setting is on.
local function createUnitFrame(key, unit, w, h, settings)
  local f = CreateFrame("Button", "Vanguard_" .. key, UIParent, "SecureUnitButtonTemplate")
  f.unit, f.key = unit, key
  T.PixelSize(f, w, h)
  makeSecure(f, unit)
  T.HudPanel(f, { shield = true })
  f.health, f.power = createBar(f), createBar(f)
  layoutBars(f, settings.powerHeight)
  shieldBars(f)
  addTextsAndIcon(f, settings)
  return f
end

-- Updating ------------------------------------------------------------------------------

-- Health bar value, color and text. Raw values go straight to the bar; the
-- text may be secret, so it goes to the font string untested.
function UF.UpdateHealth(f)
  local unit = f.unit
  f.health:SetMinMaxValues(0, UnitHealthMax(unit))
  T.SetBarValue(f.health, UnitHealth(unit))
  f.health:SetStatusBarColor(UF.HealthColor(unit))
  if UF.settings.healthText then f.healthText:SetText(UF.HealthText(unit)) else f.healthText:SetText("") end
end

-- Power bar value and color.
function UF.UpdatePower(f)
  local unit = f.unit
  f.power:SetMinMaxValues(0, UnitPowerMax(unit))
  T.SetBarValue(f.power, UnitPower(unit))
  f.power:SetStatusBarColor(UF.PowerColor(unit))
end

-- The level asked about for a ?? unit (UnitLevel -1: a boss, or one far above you): so far
-- above yours that the client answers with its hardest color, not the trivial gray -1 would get.
UF.SKULL_LEVEL = 999

-- r, g, b for how hard a unit is for you (the client's level color), or nil when it can't say.
function UF.LevelColor(unit)
  local get = _G.GetCreatureDifficultyColor
  local level = ns.PlainNumber(type(UnitLevel) == "function" and UnitLevel(unit) or nil)
  if level and level < 1 then level = UF.SKULL_LEVEL end
  local c = type(get) == "function" and level and get(level)
  if c then return c.r, c.g, c.b end
end

-- Paints a level text: the unit's level in its difficulty color (secondary text when there's none).
function UF.PaintLevel(fs, unit)
  fs:SetText(UF.LevelText(unit))
  local r, g, b = UF.LevelColor(unit)
  if r then fs:SetTextColor(r, g, b) else T.Color(fs, "text2") end
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
end

-- The target frame's tag mark: a green check while the target looks tagged by you, a grey X while
-- another player has it (and the switch is on).
function UF.UpdateTag(f)
  if f.tag then UF.PaintTagMark(f.tag, UF.settings.tagMark == true and UF.TagState(f.unit) or nil) end
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
  if not flag(UnitExists(f.unit)) then
    return
  end
  UF.UpdateHealth(f)
  UF.UpdatePower(f)
  UF.UpdateName(f)
  UF.UpdateTag(f)
  UF.UpdateRaidIcon(f)
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

-- Listens for its own unit's events through ns.OnUnit (the client sends that
-- unit's only, and the target its tag mark's too); the subscription is its own frame, not the secure unit button.
local function listen(f)
  f.vgUnitEvents = ns.OnUnit(UNIT_EVENT_LIST, function(event) UNIT_EVENTS[event](f) end, f.unit)
  if f.tag then f.vgTagEvents = ns.OnUnit(TAG_EVENTS, function() UF.UpdateTag(f) end, f.unit) end
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
  if not flag(UnitExists(f.unit)) then return end
  UF.UpdateHealth(f)
  UF.UpdatePower(f)
  if identityChanged(f) then UF.UpdateName(f) UF.UpdateRaidIcon(f) end
end

-- Target of target has no events of its own; refresh it a few times a second while it shows.
local function pollTargetOfTarget(f)
  ns.Every(f, 0.2, refreshTargetOfTarget, f)
end

-- Updates every frame whose key is listed (all frames with no list).
function UF.Refresh(keys)
  for key, f in pairs(UF.frames) do
    if not keys or keys[key] then
      UF.UpdateFrame(f)
    end
  end
end

-- Global event -> which frames it refreshes (nil = all).
local GLOBAL_EVENTS = {
  PLAYER_ENTERING_WORLD = false,
  PLAYER_TARGET_CHANGED = { target = true, targettarget = true },
  PLAYER_FOCUS_CHANGED = { focus = true },
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
  UF.Refresh(GLOBAL_EVENTS[event] or nil)
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

-- Creates, places and wires one frame.
local function addFrame(key, unit, w, h, label, point)
  local f = createUnitFrame(key, unit, w, h, UF.settings)
  if key == "target" or key == "focus" then addClassMark(f) end
  if key == "target" then addTagMark(f) end
  UF.frames[key] = f
  listen(f)
  watch(f)
  if point then
    ns.Mover(f, "uf_" .. key, label, point)
  end
  return f
end

-- True when the raid frames module also shows the party, so these party frames aren't built.
function UF.RaidCoversParty()
  local raid = ns.GetModule("RaidFrames")
  return raid ~= nil and ns.ModuleEnabled("RaidFrames") and ns.Settings("RaidFrames", raid.defaults).showInParty == true
end

-- Party 1-4: the first is movable, the rest stack below it.
local function addParty()
  local first = addFrame("party1", "party1", PARTY.w, PARTY.h, PARTY.label, PARTY.point)
  local prev = first
  for i = 2, PARTY_SIZE do
    local f = addFrame("party" .. i, "party" .. i, PARTY.w, PARTY.h)
    f:SetPoint("TOPLEFT", prev, "BOTTOMLEFT", 0, -PARTY.gap)
    prev = f
  end
end

-- Boss 1-5: the first is movable, the rest stack below it (each shows while its boss exists).
local function addBosses()
  local b = UF.BOSS
  local prev = addFrame("boss1", "boss1", b.w, b.h, b.label, b.point)
  addClassMark(prev)
  for i = 2, b.count do
    local f = addFrame("boss" .. i, "boss" .. i, b.w, b.h)
    f:SetPoint("TOPLEFT", prev, "BOTTOMLEFT", 0, -b.gap)
    addClassMark(f)
    prev = f
  end
end

local hiddenParent

-- Hides one of the game's frames for good: no events, parented to a hidden frame.
local function hideBlizzard(name)
  local f = _G[name]
  if type(f) ~= "table" or not f.UnregisterAllEvents then
    return
  end
  hiddenParent = hiddenParent or CreateFrame("Frame")
  hiddenParent:Hide()
  f:UnregisterAllEvents()
  f:Hide()
  f:SetParent(hiddenParent)
  ns.EditModeReplaced(f)
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

-- Builds every frame. Secure frames can't be set up in combat, so this waits.
local function build(settings)
  for _, def in ipairs(LAYOUT) do
    addFrame(def.key, def.unit, def.w, def.h, def.label, def.point)
  end
  if not UF.RaidCoversParty() then addParty() end
  if settings.boss then addBosses() end
  pollTargetOfTarget(UF.frames.targettarget)
  if settings.hideBlizzard then hideReplaced(settings) end
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

-- Shows or hides the deck (made the first time it shows) and mirrors the target's bars with it.
local function deckNow()
  local on, player, target = UF.settings.deck == true, UF.frames.player, UF.frames.target
  if not (player and target) then return end
  if on and not UF.deck then UF.deck = deckPanel(player, target) end
  if UF.deck then UF.deck:SetShown(on) end
  UF.ApplySizes()
  for _, f in ipairs({ player, target }) do UF.DeckText(f, on) T.SetRound(f, on) end
  target.health:SetReverseFill(on)
  target.power:SetReverseFill(on)
end

-- Gives a deck frame's name and health text the deck's larger role while it is on, their own otherwise.
function UF.DeckText(f, on)
  T.Text(f.name, on and UF.DECK.text or "name")
  T.Text(f.healthText, on and UF.DECK.text or "number")
end

-- How tall the target frame stands: its targetHeight setting (setup's role layouts raise it, a taller
-- target for damage dealers and tanks), else its layout's height. It grows up from its bottom edge.
function UF.TargetHeight()
  return tonumber(UF.settings.targetHeight) or LAYOUT[2].h
end

-- Sizes the target frame to UF.TargetHeight (out of combat: it is a secure button).
function UF.ApplySizes()
  local target = UF.frames.target
  if not target then return end
  ns.OutOfCombat(function() T.PixelSize(target, LAYOUT[2].w, UF.TargetHeight()) end)
end

-- Applies the Versus deck setting: now, or when combat ends (a new deck joins the Calm HUD).
function UF.ApplyDeck()
  if not UF.settings then return end
  ns.OutOfCombat(deckNow)
  UF.ApplyCalm()
end

-- Calm HUD ---------------------------------------------------------------------------------

-- The Calm HUD (off unless switched on): your frames dim out of combat and come back in a
-- fight, on a living hostile target or under the mouse. The client runs the state (macro
-- conditions, in combat too) and only alpha changes, so the secure buttons stay clickable.
UF.CALM_STATE = "[combat] show; [harm,nodead] show; dim"
UF.CALM_KEYS = { "player", "pet", "target", "targettarget", "focus" }

-- Gives one calm frame its state (a frame never made calm is left alone while it is off).
local function calmOne(f, state)
  if not f or not (UF.settings.calm or f.vgStateString) then return end
  if not f.vgHoverRoot then V.WatchHover(f) end
  V.ApplyState(f, state)
  V.Refresh(f)
end

-- Gives each calm frame (and the Versus deck) its state now (out of combat only): dimmed, or shown again when off.
local function calmNow()
  local state = UF.settings.calm and UF.CALM_STATE or "show"
  for _, key in ipairs(UF.CALM_KEYS) do calmOne(UF.frames[key], state) end
  calmOne(UF.deck, state)
end

-- Applies the Calm HUD setting: now, or when combat ends.
function UF.ApplyCalm()
  if UF.settings then ns.OutOfCombat(calmNow) end
end

-- WoW Forever players read levels and health percent on every frame (as its
-- own UI does), so a profile that hasn't chosen yet starts that way there.
local function clientDefaults(settings)
  if settings.showLevel == nil then settings.showLevel = ns.IsForever() end
  if settings.healthFormat == nil then settings.healthFormat = ns.IsForever() and "percent" or "value" end
end

-- Module entry point (Core/Modules.lua): build once out of combat, then listen.
function UF.Enable(settings)
  UF.settings = settings
  clientDefaults(settings)
  ns.OutOfCombat(function() build(settings) end)
  for event in pairs(GLOBAL_EVENTS) do
    ns.On(event, onGlobalEvent)
  end
  ns.On("RAID_TARGET_UPDATE", UF.RefreshRaidIcons)
end
