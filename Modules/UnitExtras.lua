-- Two small vanilla readouts on the unit frames:
--   * your threat on your target, as a percent above the target frame, in
--     the threat colors once you have aggro (a tank watches it climb, a DPS
--     watches it stay under 100);
--   * your pet's happiness as a dot on the pet frame: green happy, orange
--     content, red unhappy (an unhappy hunter pet deals less damage).
-- Each one shows only where the client answers, and a hidden answer shows
-- nothing.

local ADDON, ns = ...

local T = ns.Theme
local UF = ns.GetModule("UnitFrames")

local UX = ns.Module("UnitExtras", { defaults = { threat = true, happiness = true } })

-- Pet happiness (GetPetHappiness: 1 unhappy, 2 content, 3 happy) -> color token.
UX.HAPPINESS = { "bad", "warn", "good" }
UX.DOT = 6

-- Threat ----------------------------------------------------------------------------------------

-- Your threat on your target: "87%" and its color token, or nil when you have none (or it's hidden).
function UX.Threat()
  local get = _G.UnitDetailedThreatSituation
  if type(get) ~= "function" then return nil end
  local _, status, percent = get("player", "target")
  status, percent = ns.PlainNumber(status), ns.PlainNumber(percent)
  if not status or not percent or percent <= 0 then return nil end
  return string.format("%d%%", math.floor(percent + 0.5)), status >= 1 and "threat" .. math.min(status, 3) or "text2"
end

-- Shows your threat above the target frame, or nothing.
function UX.UpdateThreat()
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

-- Shows the dot on the pet frame in your pet's mood, or hides it.
function UX.UpdateHappiness()
  local token = UX.Happiness()
  UX.happy:SetShown(token ~= nil)
  if token then UX.happy:SetColorTexture(T.RGB(token)) end
end

-- Building ---------------------------------------------------------------------------------------

-- The threat text above the target frame, clear of its corner diamond,
-- following threat and target changes: your target's threat list, and your
-- own threat situation (the client names you, not the mob, when it changes).
local function addThreat(target)
  UX.threat = T.Text(target:CreateFontString(nil, "OVERLAY"), "small", "text2")
  UX.threat:SetPoint("BOTTOMRIGHT", target, "TOPRIGHT", -12, 3)
  ns.OnUnit("UNIT_THREAT_LIST_UPDATE", UX.UpdateThreat, "target")
  ns.OnUnit("UNIT_THREAT_SITUATION_UPDATE", UX.UpdateThreat, "player")
  for _, e in ipairs({ "PLAYER_TARGET_CHANGED", "PLAYER_REGEN_ENABLED" }) do ns.On(e, UX.UpdateThreat) end
  UX.UpdateThreat()
end

-- The mood dot in the pet frame's top-right corner, following your pet.
local function addHappiness(pet)
  UX.happy = T.Snap(pet.health:CreateTexture(nil, "OVERLAY"))
  UX.happy:SetSize(UX.DOT, UX.DOT)
  UX.happy:SetPoint("TOPRIGHT", pet, "TOPRIGHT", -3, -3)
  for _, e in ipairs({ "UNIT_HAPPINESS", "UNIT_PET" }) do ns.On(e, UX.UpdateHappiness) end
  UX.UpdateHappiness()
end

-- Adds what's switched on and what the client can answer, to the frames that exist.
local function attach()
  local s, frames = UX.settings, UF.frames
  if s.threat and frames.target and type(_G.UnitDetailedThreatSituation) == "function" then addThreat(frames.target) end
  if s.happiness and frames.pet and UX.HappinessCall() then addHappiness(frames.pet) end
end

-- Module entry point (Core/Modules.lua): out of combat, once the unit frames are built.
function UX.Enable(settings)
  UX.settings = settings
  ns.OutOfCombat(attach)
end
