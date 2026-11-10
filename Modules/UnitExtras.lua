-- Small vanilla readouts on the unit frames:
--   * your threat on your target, as a percent above the target frame, in
--     the threat colors once you have aggro (a tank watches it climb, a DPS
--     watches it stay under 100);
--   * your pet's happiness as a glyph on the pet frame: a check happy, a
--     triangle content, a cross unhappy, each in its state color (an unhappy
--     hunter pet deals less damage);
--   * a status chip above the player frame (off until switched on): an icon and
--     "Eating", "Drinking" or "Well Fed" while that buff is on you, and, with
--     nothing of those, "Missing: Flask" and so on from the buff checks Instance
--     prep already makes (its Buff checks switch must be on). Out of combat only:
--     in a fight, or while the client hides aura values, it is hidden.
-- Each one shows only where the client answers, and a hidden answer shows
-- nothing.

local ADDON, ns = ...

local T = ns.Theme
local L = ns.L
local UF = ns.GetModule("UnitFrames")

local UX = ns.Module("UnitExtras", {
  clients = { forever = true }, defaults = { threat = true, happiness = true, chip = false },
  live = true, requires = { "UnitFrames" },
})

-- WoW Forever only: on another client the module isn't registered and the rest of this file doesn't load.
if not ns.ClientAllows(UX) then return end

-- Pet happiness (GetPetHappiness: 1 unhappy, 2 content, 3 happy) -> color token.
UX.HAPPINESS = { "bad", "warn", "good" }
-- The mood glyph's size (#235: a shape as well as a color, so it reads without telling red from green).
UX.GLYPH = 10

-- Threat ----------------------------------------------------------------------------------------

-- True while threat can matter to someone else: you are in a group, or you have a pet (solo, every mob you
-- fight is on you at 100%, which says nothing).
function UX.ThreatMatters()
  local grouped, pet = IsInGroup(), UnitExists("pet")
  return ns.IsTrue(grouped) or ns.IsTrue(pet)
end

-- Your threat on your target: "87%" and its color token, or nil when you have none, it's hidden or it can't matter.
function UX.Threat()
  local get = _G.UnitDetailedThreatSituation
  if type(get) ~= "function" or not UX.ThreatMatters() then return nil end
  local _, status, percent = get("player", "target")
  status, percent = ns.PlainNumber(status), ns.PlainNumber(percent)
  if not status or not percent or percent <= 0 then return nil end
  return string.format("%d%%", math.floor(percent + 0.5)), status >= 1 and "threat" .. math.min(status, 3) or "text2"
end

-- Shows your threat above the target frame, or nothing (nothing at all once the module is off).
function UX.UpdateThreat()
  if not UX.scope:Running() then return end
  local text, color = UX.Threat()
  UX.threat:SetText(text or "")
  if color then T.Color(UX.threat, color) end
end

-- Pet happiness ----------------------------------------------------------------------------------

-- The client's pet happiness call: C_PetInfo's (WoW Forever), else the older global, else nil.
function UX.HappinessCall()
  local get = C_PetInfo and C_PetInfo.GetPetHappiness
  if type(get) == "function" then return get end
  return type(GetPetHappiness) == "function" and GetPetHappiness or nil
end

-- Your pet's happiness as a color token, or nil (no pet that has moods, or no answer).
function UX.Happiness()
  local get = UX.HappinessCall()
  if not get then return nil end
  return UX.HAPPINESS[ns.PlainNumber(get()) or 0]
end

-- Pet happiness -> the word the pet frame's tooltip line uses.
UX.MOODS = { L["Unhappy"], L["Content"], L["Happy"] }

-- The pet tooltip's mood line ("Happy: 125% damage") and its color token, or nil (no pet that has moods, or no answer).
function UX.HappinessLine()
  local get = UX.HappinessCall()
  if not get then return nil end
  local mood, damage = get()
  mood, damage = ns.PlainNumber(mood), ns.PlainNumber(damage)
  if not UX.MOODS[mood or 0] then return nil end
  if not damage then return UX.MOODS[mood], UX.HAPPINESS[mood] end
  return ns.Format(L["{mood}: {damage}% damage"], { mood = UX.MOODS[mood], damage = damage }), UX.HAPPINESS[mood]
end

-- Adds the mood line to the pet frame's tooltip, in the mood's color.
function UX.AddHappinessLine(tt)
  local text, token = UX.HappinessLine()
  if text then tt:AddLine(text, T.RGB(token)) end
end

-- Shows the glyph on the pet frame for your pet's mood, in its state color, or hides it.
function UX.UpdateHappiness()
  local token = UX.Happiness()
  UX.happy:SetShown(token ~= nil)
  if not token then return end
  UX.happy:SetTexture(T.Icon(T.STATE_GLYPHS[token]))
  T.Tint(UX.happy, token)
end

-- Status chip ------------------------------------------------------------------------------------

-- The chip's icon size and its padding, and the gap between its icon and its text (units).
UX.CHIP_ICON, UX.CHIP_PAD, UX.CHIP_GAP, UX.CHIP_HEIGHT = 14, 4, 4, 20
-- Where the chip sits over the player frame's top left corner when there is no room left of it (units across and up).
UX.CHIP_ABOVE_X, UX.CHIP_ABOVE_Y = 12, 3
-- The buffs eating and drinking give, by spell id: Food and Drink (every food and drink shares the one name the
-- client gives these ids). UNVERIFIED on a Forever client: check with the chip in game.
UX.EATING, UX.DRINKING = { 433 }, { 430 }
-- The events that can change what the chip says besides your auras and your gear: the fight ending, a new zone, death and rising.
UX.CHIP_EVENTS = { "PLAYER_REGEN_ENABLED", "PLAYER_ENTERING_WORLD", "PLAYER_DEAD", "PLAYER_ALIVE", "PLAYER_UNGHOST" }

-- The states the chip names, in the order they win: text, the buff names that mean it, and its text color token.
function UX.States()
  return { { L["Eating"], UX.EATING, "text" }, { L["Drinking"], UX.DRINKING, "text" }, { L["Well Fed"], ns.GetModule("InstancePrep").FOOD, "good" } }
end

-- The first of your buffs named as these spell ids are (by the client), as its aura data, or nil (none, or the
-- client can't say).
function UX.Aura(ids)
  local get = C_UnitAuras and C_UnitAuras.GetAuraDataBySpellName
  if type(get) ~= "function" then return nil end
  for _, name in ipairs(ns.SpellNames(ids)) do
    local aura = get("player", name, "HELPFUL")
    if type(aura) == "table" then return aura end
  end
end

-- "Missing: Flask" (and " +2" for two more) from Instance prep's buff rows, or nil when it has none or its checks are off.
function UX.Missing()
  local PR = ns.GetModule("InstancePrep")
  local rows = PR.settings and PR.BuffRows and PR.BuffRows() or {}
  if #rows == 0 then return nil end
  if #rows > 1 then return ns.Format(L["Missing: {buff} +{more}"], { buff = rows[1].label, more = #rows - 1 }) end
  return ns.Format(L["Missing: {buff}"], { buff = rows[1].label })
end

-- The chip's text, color token and icon (nil for the warning glyph): what you are doing or have, else what is missing.
-- Nothing in a fight, while aura values are hidden or while you are dead.
function UX.Status()
  local dead = type(UnitIsDeadOrGhost) == "function" and UnitIsDeadOrGhost("player")
  if ns.InCombat() or ns.AurasSecret() or ns.IsSecret(dead) or dead then return nil end
  for _, state in ipairs(UX.States()) do
    local aura = UX.Aura(state[2])
    if aura then return state[1], state[3], not ns.IsSecret(aura.icon) and aura.icon or nil end
  end
  local missing = UX.Missing()
  return missing, "warn", nil
end

-- The frame whose top edge the chip sits over: your class's row on the player frame (the totems, else the combo
-- points) when it is made, else the player frame itself.
local function aboveRow(player)
  local totems = ns.ModuleLive("ClassBars") and ns.GetModule("ClassBars").totems
  local points = ns.ModuleLive("ComboPoints") and ns.GetModule("ComboPoints").bar
  return totems or points or player
end

-- Puts the chip level with the player frame, a gap to its left when the chip fits there on the screen, else
-- just above the frame's left end (the Classic layout puts the frame 20 from the edge; a narrow canvas too).
local function placeChip(chip, player)
  chip:ClearAllPoints()
  if (player:GetLeft() or 0) >= chip:GetWidth() + T.SPACE.gap then
    return chip:SetPoint("RIGHT", player, "LEFT", -T.SPACE.gap, 0)
  end
  local row = aboveRow(player)
  local lift = math.max(0, (row:GetTop() or 0) - (player:GetTop() or 0))
  chip:SetPoint("BOTTOMLEFT", row, "TOPLEFT", UX.CHIP_ABOVE_X, UX.CHIP_ABOVE_Y)
  UF.RaiseDeckReach("top", lift + UX.CHIP_ABOVE_Y + UX.CHIP_HEIGHT)
end

-- Shows the chip with its icon and text, sized to them, or hides it for no text.
function UX.PaintChip(text, token, icon)
  local f = UX.chip
  f:SetShown(text ~= nil)
  if not text then return end
  f.text:SetText(text)
  T.Color(f.text, token)
  f.icon:SetTexture(icon or T.Icon(T.STATE_GLYPHS.warn))
  T.Tint(f.icon, icon and "white" or "warn")
  T.PixelSize(f, 2 * UX.CHIP_PAD + UX.CHIP_ICON + UX.CHIP_GAP + math.ceil(f.text:GetStringWidth()), UX.CHIP_HEIGHT)
  placeChip(f, UF.frames.player)
end

-- Says what the chip should say now (nothing once the module is off: a draw still waiting runs after the stop).
function UX.UpdateChip()
  if UX.scope:Running() then UX.PaintChip(UX.Status()) end
end

-- A fight is starting: the chip goes at once (the lockdown has not begun, so the status would still read as out of combat).
function UX.HideChip()
  UX.chip:Hide()
end

-- Building ---------------------------------------------------------------------------------------

-- What else redraws the threat text: a new target, the fight ending, and joining or leaving a group
-- (whether threat can matter; your own pet coming or going is heard with your threat situation).
UX.THREAT_EVENTS = { "PLAYER_TARGET_CHANGED", "PLAYER_REGEN_ENABLED", "GROUP_ROSTER_UPDATE" }

-- The threat text above the target frame, clear of its corner diamond; made once a session.
local function makeThreat(target)
  UX.threat = T.Text(target:CreateFontString(nil, "OVERLAY"), "small", "text2")
  UX.threat:SetPoint("BOTTOMRIGHT", UF.Crown(target), "TOPRIGHT", -12, 3)
end

-- Follows threat and target changes: your target's threat list, and your own threat situation (the client names you,
-- not the mob, when it changes).
local function addThreat(target, scope)
  if not UX.threat then makeThreat(target) end
  scope:OnUnit("UNIT_THREAT_LIST_UPDATE", UX.UpdateThreat, "target")
  scope:OnUnit({ "UNIT_THREAT_SITUATION_UPDATE", "UNIT_PET" }, UX.UpdateThreat, "player")
  for _, e in ipairs(UX.THREAT_EVENTS) do scope:On(e, UX.UpdateThreat) end
  UX.UpdateThreat()
end

-- The mood glyph in the pet frame's top-right corner; made once a session.
local function makeHappiness(pet)
  UX.happy = T.Snap(pet.health:CreateTexture(nil, "OVERLAY"), "icon")
  UX.happy:SetSize(UX.GLYPH, UX.GLYPH)
  UX.happy:SetPoint("TOPRIGHT", pet, "TOPRIGHT", -3, -3)
end

-- The glyph, following your pet, and its line on the pet's tooltip. The pet's health text ends left of the glyph.
local function addHappiness(pet, scope)
  if not UX.happy then makeHappiness(pet) end
  pet.healthText:ClearAllPoints()
  pet.healthText:SetPoint("RIGHT", pet.health, "RIGHT", -(UX.GLYPH + 7), 0)
  for _, e in ipairs({ "UNIT_HAPPINESS", "UNIT_PET" }) do scope:On(e, UX.UpdateHappiness) end
  UF.TOOLTIP_LINES.pet = UX.AddHappinessLine
  UX.UpdateHappiness()
end

-- The status chip frame, left of the player frame (clear of the pet frame, its cast bar and the combo points above
-- it); made once a session.
local function makeChip()
  local f = CreateFrame("Frame", "Vanguard_StatusChip", UIParent)
  T.HudPanel(f, { alpha = 0.9 })
  f.icon = T.Snap(f:CreateTexture(nil, "ARTWORK"), "icon")
  f.icon:SetSize(UX.CHIP_ICON, UX.CHIP_ICON)
  f.icon:SetPoint("LEFT", f, "LEFT", UX.CHIP_PAD, 0)
  f.text = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "text")
  f.text:SetPoint("LEFT", f.icon, "RIGHT", UX.CHIP_GAP, 0)
  f:SetClampedToScreen(true)
  return f
end

-- The chip, above the player frame's left end where there is no room left of it; following your auras, your gear
-- and the fight.
local function addChip(scope)
  UX.chip = UX.chip or makeChip()
  scope:Frame(UX.chip)
  UX.WatchChip(scope)
end

-- Says what the chip should say once a frame, however often your auras or gear change.
function UX.SoonChip()
  ns.Soon("status chip", UX.UpdateChip)
end

-- Follows what changes the chip: your auras and gear, the fight and the life events.
function UX.WatchChip(scope)
  scope:OnUnit({ "UNIT_AURA", "UNIT_INVENTORY_CHANGED" }, UX.SoonChip, "player")
  for _, e in ipairs(UX.CHIP_EVENTS) do scope:On(e, UX.UpdateChip) end
  scope:On("PLAYER_REGEN_DISABLED", UX.HideChip)
  UX.UpdateChip()
end

-- Adds what's switched on and what the client can answer, to the frames that exist.
local function attach(scope)
  local s, frames = UX.settings, UF.frames
  if not scope:Running() then return end
  if s.threat and frames.target and type(_G.UnitDetailedThreatSituation) == "function" then addThreat(frames.target, scope) end
  if s.happiness and frames.pet and UX.HappinessCall() then addHappiness(frames.pet, scope) end
  if s.chip and frames.player then addChip(scope) end
end

-- Module entry point (Core/Modules.lua): out of combat, once the unit frames are built.
function UX.Enable(settings, scope)
  UX.settings, UX.scope = settings, scope
  ns.OutOfCombat(function() attach(scope) end)
end

-- Switched off: the threat text is cleared, the mood glyph hidden and its tooltip line taken off, and the pet's health
-- text goes back where the unit frames put it (the chip and the handlers go with the scope).
function UX.Disable()
  if UX.threat then UX.threat:SetText("") end
  if UX.happy then UX.happy:Hide() end
  UF.TOOLTIP_LINES.pet = nil
  if UX.happy and UF.frames.pet then UF.PlaceParts(UF.frames.pet) end
end
