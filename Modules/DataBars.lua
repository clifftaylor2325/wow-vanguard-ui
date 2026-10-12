-- Data bars: experience (with rested XP) and the reputation you're
-- watching, as thin themed bars you can move in unlock mode. Hover a bar
-- for the numbers; the XP bar hides at max level, the reputation bar when
-- no faction is watched. Both are seen always unless their visibility setting
-- says otherwise (Core/Visibility.lua): on mouseover, in combat, hidden, or on a checklist.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgSuppressed = ns.FrameState("vgSuppressed")

local T = ns.Theme
local V = ns.Visibility

local DB = ns.Module("DataBars", {
  defaults = { width = 478, height = 6, xp = true, reputation = true, text = "hover", tooltip = true },
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

-- Levelling detail -----------------------------------------------------------------------

-- A quest's XP reward, or 0 (the client takes the quest's id).
function DB.RewardXP(id)
  if type(GetQuestLogRewardXP) ~= "function" then return 0 end
  local xp = ns.PlainNumber(GetQuestLogRewardXP(id))
  return xp and xp > 0 and xp or 0
end

-- True when the client says so with a plain true (a hidden value counts as no).
local function isTrue(v)
  return not ns.IsSecret(v) and v == true
end

-- The XP a log entry is worth when it is a quest ready to turn in, else 0.
local function readyXP(info)
  if type(info) ~= "table" or info.isHeader == true or not info.questID then return 0 end
  return isTrue(C_QuestLog.IsComplete(info.questID)) and DB.RewardXP(info.questID) or 0
end

-- The XP waiting in the quest log: every quest ready to turn in, added up.
function DB.QuestXP()
  local log, total = C_QuestLog, 0
  if type(log) ~= "table" or type(log.GetNumQuestLogEntries) ~= "function" or type(log.IsComplete) ~= "function" then return 0 end
  for i = 1, ns.PlainNumber((log.GetNumQuestLogEntries())) or 0 do total = total + readyXP(log.GetInfo(i)) end
  return total
end

-- A kill's XP is the gain that lands within a second of the game's XP message for a kill (the two
-- events' order isn't known, so either may come first). Quests and discoveries give no such message.
DB.KILL_WINDOW = 1

-- Pairs a kill message with an XP gain that came with it: that gain is what a kill gives now.
function DB.PairKill()
  local kill, gain = DB.killAt, DB.gainAt
  if not (kill and gain and math.abs(kill - gain) <= DB.KILL_WINDOW) then return end
  DB.killXP, DB.killAt, DB.gainAt = DB.gain, nil, nil
end

-- The XP message for a kill came.
function DB.OnKillMessage()
  DB.killAt = number(GetTime)
  DB.PairKill()
end

-- Experience changed: a rise is a gain (a level-up's drop isn't).
function DB.OnXPChange()
  local now = number(UnitXP, "player")
  if DB.lastXP and now > DB.lastXP then DB.gain, DB.gainAt = now - DB.lastXP, number(GetTime) end
  DB.lastXP = now
  DB.PairKill()
end

-- The tooltip's lines as { left, right }: what is left in the level, how far through, rested, kills.
function DB.XPLines(xp)
  local lines = { { "To next level", DB.Short(xp.max - xp.cur) }, { "Through this level", math.floor(xp.cur / xp.max * 100) .. "%" } }
  if xp.rested > 0 then lines[#lines + 1] = { "Rested", DB.Short(xp.rested) .. " (" .. math.floor(xp.rested / xp.max * 100) .. "% of a level)" } end
  if DB.killXP then lines[#lines + 1] = { "Kills to level", "about " .. math.ceil((xp.max - xp.cur) / DB.killXP) .. " (" .. DB.killXP .. " XP each)" } end
  local waiting = DB.QuestXP()
  if waiting > 0 then lines[#lines + 1] = { "XP in finished quests", DB.Short(waiting) } end
  return lines
end

-- Shows the XP bar's tooltip, when it is on and the bar has something to say.
function DB.ShowXPTooltip(bar)
  local xp = DB.settings.tooltip and DB.XP()
  if not xp then return end
  GameTooltip_SetDefaultAnchor(GameTooltip, bar)
  GameTooltip:SetText("Level " .. xp.level, T.RGB("text"))
  for _, l in ipairs(DB.XPLines(xp)) do GameTooltip:AddDoubleLine(l[1], l[2]) end
  GameTooltip:Show()
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

-- The sizes an XP or reputation bar may be given in unlock mode (matched to another frame, or
-- set under General → Layout).
DB.SIZES = { width = { 60, 1600 }, height = { 2, 40 } }

-- The bar's centered text, shown as the text setting says (always, or on hover).
local function addText(bar, mode)
  bar.text = T.Text(bar:CreateFontString(nil, "OVERLAY"), "small")
  bar.text:SetPoint("CENTER")
  wireText(bar, mode)
end

-- A bar Vanguard resized: its fill (and the XP bar's rested strip) is drawn again.
local function resized(bar)
  if bar.vgOnState then bar.vgOnState() end
end

-- A themed status bar with centered text, movable as `key`; Vanguard may set its size.
local function createBar(key, label, point, settings)
  local bar = CreateFrame("StatusBar", "Vanguard_" .. key, UIParent)
  bar:SetSize(settings.width, settings.height)
  T.StyleBar(bar)
  T.HudPanel(bar, { inset = true })
  addText(bar, settings.text)
  V.WatchHover(bar)
  ns.Mover(bar, key, label, point)
  ns.MoverSizable(key, DB.SIZES, resized)
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

-- Fills the XP bar, or hides it at max level (or while its visibility hides it).
function DB.UpdateXP()
  local bar, xp = DB.xpBar, DB.XP()
  bar:SetShown(xp ~= nil and V.Shows(bar))
  if not xp then return end
  bar:SetMinMaxValues(0, xp.max)
  bar:SetValue(xp.cur)
  T.BarColor(bar, "xp")
  bar.rested:SetWidth(math.max(1, bar:GetWidth() * math.min(1, (xp.cur + xp.rested) / xp.max)))
  bar.text:SetText(DB.XPText(xp))
end

-- Fills the reputation bar in its standing color, or hides it with no watched
-- faction (or while its visibility hides it).
function DB.UpdateReputation()
  local bar, rep = DB.repBar, DB.Reputation()
  bar:SetShown(rep ~= nil and V.Shows(bar))
  if not rep then return end
  bar:SetMinMaxValues(0, rep.max)
  bar:SetValue(rep.cur)
  T.BarColor(bar, REACTION[rep.standing] or REACTION[4])
  bar.text:SetText(DB.ReputationText(rep))
end

-- The XP bar with its rested overlay, kept current.
local function enableXP(settings)
  DB.xpBar = createBar("xpbar", "Experience", { "BOTTOM", "BOTTOM", 0, 4 }, settings)
  DB.xpBar.vgOnState = DB.UpdateXP
  addRested(DB.xpBar)
  for _, e in ipairs({ "PLAYER_XP_UPDATE", "PLAYER_LEVEL_UP", "UPDATE_EXHAUSTION", "PLAYER_ENTERING_WORLD" }) do ns.On(e, DB.UpdateXP) end
  ns.On("PLAYER_XP_UPDATE", DB.OnXPChange)
  ns.On("CHAT_MSG_COMBAT_XP_GAIN", DB.OnKillMessage)
  DB.xpBar:EnableMouse(true)
  DB.xpBar:HookScript("OnEnter", ns.Guard("show XP tooltip", function(self) DB.ShowXPTooltip(self) end))
  DB.xpBar:HookScript("OnLeave", function() GameTooltip:Hide() end)
  DB.UpdateXP()
end

-- The reputation bar for the watched faction, kept current.
local function enableReputation(settings)
  DB.repBar = createBar("repbar", "Reputation", { "BOTTOM", "BOTTOM", 0, 12 }, settings)
  DB.repBar.vgOnState = DB.UpdateReputation
  for _, e in ipairs({ "UPDATE_FACTION", "PLAYER_ENTERING_WORLD" }) do ns.On(e, DB.UpdateReputation) end
  DB.UpdateReputation()
end

-- The game's own XP and reputation bars, which these replace (so XP doesn't show twice).
DB.BLIZZARD = { "StatusTrackingBarManager", "MainStatusTrackingBarContainer", "SecondaryStatusTrackingBarContainer" }

-- True for a frame the client protects (itself, or through a secure child).
local function protected(f)
  return type(f.IsProtected) == "function" and f:IsProtected() == true
end

-- Keeps one of the game's frames hidden where it is. An XP bar frame isn't moved
-- under another parent (the game and Edit Mode call methods on its own parent;
-- moving it broke Edit Mode), and whenever the game shows it, it's hidden again.
-- A protected frame gets no hook (the hook's Hide is blocked in combat): it is
-- hidden once, out of combat.
function DB.Suppress(name)
  local f = _G[name]
  if type(f) ~= "table" or not f.Hide or vgSuppressed[f] then return end
  vgSuppressed[f] = true
  ns.EditModeReplaced(f)
  if protected(f) then return ns.OutOfCombat(function() f:Hide() end, f) end
  f:Hide()
  if type(hooksecurefunc) ~= "function" then return end
  hooksecurefunc(f, "Show", ns.Guard("hook Show", f.Hide))
  hooksecurefunc(f, "SetShown", ns.Guard("hook SetShown", f.Hide))
end

-- Applies the bars' visibility setting (one for both): now, or when combat ends
-- (registering a state driver is), and again on zone changes for In an instance.
function DB.ApplyVisibility()
  for _, bar in pairs({ DB.xpBar, DB.repBar }) do
    V.Track(bar, DB.ApplyVisibility)
    ns.OutOfCombat(function() V.ApplyNow(bar, DB.settings.visibility, DB.settings.showWhen) end, bar)
  end
end

-- Module entry point (Core/Modules.lua). Data bars aren't protected, so no combat wait.
function DB.Enable(settings)
  DB.settings = settings
  if settings.xp then enableXP(settings) end
  if settings.reputation then enableReputation(settings) end
  DB.ApplyVisibility()
  if not (settings.xp or settings.reputation) then return end
  for _, name in ipairs(DB.BLIZZARD) do DB.Suppress(name) end
end
