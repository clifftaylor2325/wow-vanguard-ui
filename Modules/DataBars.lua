-- Data bars: experience (with rested XP) and the reputation you're
-- watching, as thin themed bars you can move in unlock mode. Hover a bar
-- for the numbers; the XP bar hides at max level, the reputation bar when
-- no faction is watched.

local ADDON, ns = ...

local T = ns.Theme

local DB = ns.Module("DataBars", {
  defaults = { width = 454, height = 6, xp = true, reputation = true, text = "hover" },
})

-- Profiles saved before the Centered layout hold the old size (476 x 10) as
-- values: once, put them back to the new defaults (as wide as the action bars).
ns.Migrate("DataBars", function(saved)
  if (saved.layout or 0) >= 2 then return end
  if saved.width == 476 then saved.width = nil end
  if saved.height == 10 then saved.height = nil end
  saved.layout = 2
end)

-- Reputation bar color tokens by standing (1 hated .. 8 exalted).
local REACTION = {
  "repHostile", "repHostile", "repUnfriendly", "repNeutral",
  "repFriendly", "repFriendly", "repFriendly", "repFriendly",
}

-- A number as short text: 12.3K, 1.2M.
function DB.Short(n)
  if n >= 1e6 then
    return string.format("%.1fM", n / 1e6)
  elseif n >= 1e3 then
    return string.format("%.1fK", n / 1e3)
  end
  return tostring(math.floor(n))
end

-- Values -------------------------------------------------------------------------------

-- A plain number from a client call, or 0.
local function number(fn, ...)
  return type(fn) == "function" and ns.PlainNumber(fn(...)) or 0
end

-- True at the level cap (so the XP bar has nothing to show).
local function atMaxLevel()
  if type(IsPlayerAtEffectiveMaxLevel) == "function" then
    return IsPlayerAtEffectiveMaxLevel() == true
  end
  return type(IsXPUserDisabled) == "function" and IsXPUserDisabled() == true
end

-- { cur, max, rested, level } for the XP bar, or nil when it should hide.
function DB.XP()
  if atMaxLevel() then
    return nil
  end
  local max = number(UnitXPMax, "player")
  if max <= 0 then
    return nil
  end
  return { cur = number(UnitXP, "player"), max = max, rested = number(GetXPExhaustion), level = number(UnitLevel, "player") }
end

-- { name, standing, cur, max } for the watched faction, or nil when none.
function DB.Reputation()
  local get = C_Reputation and C_Reputation.GetWatchedFactionData
  local data = type(get) == "function" and get() or nil
  if type(data) ~= "table" or not data.name then
    return nil
  end
  local low, high = data.currentReactionThreshold or 0, data.nextReactionThreshold or 0
  local cur = (data.currentStanding or 0) - low
  return { name = data.name, standing = data.reaction or 4, cur = cur, max = math.max(1, high - low) }
end

-- "Level 42  12.3K / 40.0K (31%)  rested 5.0K"
function DB.XPText(xp)
  local text = string.format("Level %d  %s / %s (%d%%)", xp.level, DB.Short(xp.cur), DB.Short(xp.max), math.floor(xp.cur / xp.max * 100))
  return xp.rested > 0 and (text .. "  rested " .. DB.Short(xp.rested)) or text
end

-- "Valdrakken Accord  1.2K / 2.5K (48%)"
function DB.ReputationText(rep)
  return string.format("%s  %s / %s (%d%%)", rep.name, DB.Short(rep.cur), DB.Short(rep.max), math.floor(rep.cur / rep.max * 100))
end

-- Building -------------------------------------------------------------------------------

-- Shows the bar's text only while hovered (text = "hover"), or always.
local function wireText(bar, mode)
  bar.text:SetShown(mode == "always")
  if mode == "hover" then
    bar:EnableMouse(true)
    bar:SetScript("OnEnter", function(self) self.text:Show() end)
    bar:SetScript("OnLeave", function(self) self.text:Hide() end)
  end
end

-- A themed status bar with centered text, movable as `key`.
local function createBar(key, label, point, settings)
  local bar = CreateFrame("StatusBar", "ForeverUI_" .. key, UIParent)
  bar:SetSize(settings.width, settings.height)
  T.StyleBar(bar)
  T.Panel(bar, { inset = true })
  bar.text = T.Text(bar:CreateFontString(nil, "OVERLAY"), "small")
  bar.text:SetPoint("CENTER")
  wireText(bar, settings.text)
  ns.Mover(bar, key, label, point)
  return bar
end

-- The rested overlay: a lighter strip from the left edge, drawn under the
-- XP fill (background layer, above the panel), so it shows past the fill.
local function addRested(bar)
  bar.rested = bar:CreateTexture(nil, "BACKGROUND", nil, 2)
  bar.rested:SetTexture(T.WHITE)
  T.Tint(bar.rested, "rested")
  bar.rested:SetPoint("TOPLEFT")
  bar.rested:SetPoint("BOTTOMLEFT")
end

-- Updating -------------------------------------------------------------------------------

-- Fills the XP bar, or hides it at max level.
function DB.UpdateXP()
  local bar, xp = DB.xpBar, DB.XP()
  bar:SetShown(xp ~= nil)
  if not xp then return end
  bar:SetMinMaxValues(0, xp.max)
  bar:SetValue(xp.cur)
  T.BarColor(bar, "xp")
  bar.rested:SetWidth(math.max(1, bar:GetWidth() * math.min(1, (xp.cur + xp.rested) / xp.max)))
  bar.text:SetText(DB.XPText(xp))
end

-- Fills the reputation bar in its standing color, or hides it with no watched faction.
function DB.UpdateReputation()
  local bar, rep = DB.repBar, DB.Reputation()
  bar:SetShown(rep ~= nil)
  if not rep then return end
  bar:SetMinMaxValues(0, rep.max)
  bar:SetValue(rep.cur)
  T.BarColor(bar, REACTION[rep.standing] or REACTION[4])
  bar.text:SetText(DB.ReputationText(rep))
end

-- The XP bar with its rested overlay, kept current.
local function enableXP(settings)
  DB.xpBar = createBar("xpbar", "Experience", { "BOTTOM", "BOTTOM", 0, 4 }, settings)
  addRested(DB.xpBar)
  for _, e in ipairs({ "PLAYER_XP_UPDATE", "PLAYER_LEVEL_UP", "UPDATE_EXHAUSTION", "PLAYER_ENTERING_WORLD" }) do ns.On(e, DB.UpdateXP) end
  DB.UpdateXP()
end

-- The reputation bar for the watched faction, kept current.
local function enableReputation(settings)
  DB.repBar = createBar("repbar", "Reputation", { "BOTTOM", "BOTTOM", 0, 12 }, settings)
  for _, e in ipairs({ "UPDATE_FACTION", "PLAYER_ENTERING_WORLD" }) do ns.On(e, DB.UpdateReputation) end
  DB.UpdateReputation()
end

-- The game's own XP and reputation bars, which these replace (so XP doesn't show twice).
DB.BLIZZARD = { "StatusTrackingBarManager", "MainStatusTrackingBarContainer", "SecondaryStatusTrackingBarContainer" }

-- Module entry point (Core/Modules.lua). Data bars aren't protected, so no combat wait.
function DB.Enable(settings)
  if settings.xp then enableXP(settings) end
  if settings.reputation then enableReputation(settings) end
  if not (settings.xp or settings.reputation) then return end
  for _, name in ipairs(DB.BLIZZARD) do ns.GetModule("UnitFrames").HideBlizzard(name) end
end
