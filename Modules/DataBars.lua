-- Data bars: experience (with rested XP) and the reputation you're
-- watching, as thin themed bars you can move in unlock mode. Hover a bar
-- for the numbers; the XP bar hides at max level, the reputation bar when
-- no faction is watched. Both are seen always unless their visibility setting
-- says otherwise (Core/Visibility.lua): on mouseover, in combat, hidden, or on a checklist.
-- On Retail the XP bar shows honor at max level when the game would (watched,
-- or in a battleground), and the reputation bar a major faction's renown.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgSuppressed = ns.FrameState("vgSuppressed")

local T = ns.Theme
local L = ns.L
local V = ns.Visibility

local DB = ns.Module("DataBars", {
  defaults = { width = 478, height = 6, xp = true, reputation = true, text = "hover", tooltip = true },
  live = true,
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

-- A number as short text: 12.3K, 1.2M. Thousands are rounded first, so one that rounds up to
-- a thousand reads in millions ("1.0M", not "1000.0K").
function DB.Short(n)
  if n < 1e3 then return tostring(math.floor(n)) end
  local thousands = string.format("%.1fK", n / 1e3)
  if n >= 1e6 or thousands == "1000.0K" then return string.format("%.1fM", n / 1e6) end
  return thousands
end

-- The events that can change what the XP bar shows, or whether it shows (XP gain locked or unlocked, the cap moved);
-- on Retail also its honor at the cap (honor gained, a new honor level, into or out of a battleground).
DB.XP_EVENTS = ns.ClientData({
  forever = { "PLAYER_XP_UPDATE", "PLAYER_LEVEL_UP", "UPDATE_EXHAUSTION", "PLAYER_ENTERING_WORLD",
    "ENABLE_XP_GAIN", "DISABLE_XP_GAIN", "PLAYER_MAX_LEVEL_UPDATE" },
  retail = { "PLAYER_XP_UPDATE", "PLAYER_LEVEL_UP", "UPDATE_EXHAUSTION", "PLAYER_ENTERING_WORLD",
    "ENABLE_XP_GAIN", "DISABLE_XP_GAIN", "PLAYER_MAX_LEVEL_UPDATE", "HONOR_XP_UPDATE", "HONOR_LEVEL_UPDATE", "ZONE_CHANGED_NEW_AREA" },
})
-- The CVars, lower-cased, whose change repaints the XP bar: on Retail the "Show honor as experience" switch
-- (IsWatchingHonorAsXP reads showHonorAsExperience, PVPHonorSystem.lua). Every other CVar write is left alone.
DB.XP_CVARS = ns.ClientData({ forever = {}, retail = { showhonorasexperience = true } })
-- The events that can change the watched faction or its standing; on Retail also a major faction's renown level.
DB.REP_EVENTS = ns.ClientData({
  forever = { "UPDATE_FACTION", "PLAYER_ENTERING_WORLD" },
  retail = { "UPDATE_FACTION", "PLAYER_ENTERING_WORLD", "MAJOR_FACTION_RENOWN_LEVEL_CHANGED" },
})

-- Values -------------------------------------------------------------------------------

-- A plain number from a client call, or 0.
local function number(fn, ...)
  return type(fn) == "function" and ns.PlainNumber(fn(...)) or 0
end

-- Whether you are at the level cap, as the game's own bars judge it (GameRulesUtil); a client without it
-- compares your level with the maximum.
local function atCap()
  local rules = GameRulesUtil
  if type(rules) == "table" and type(rules.IsPlayerAtEffectiveMaxLevel) == "function" then
    return rules.IsPlayerAtEffectiveMaxLevel() == true
  end
  local level, max = ns.PlainNumber(UnitLevel("player")), number(GetMaxPlayerLevel)
  return level ~= nil and max > 0 and level >= max
end

-- True when XP has nothing to show, as the game's own bar judges it (GameRulesUtil.CanShowExperienceBar): at the
-- level cap, with XP gain turned off at the XP-lock NPC, or with the realm's rules switching the bar off.
local function xpHidden()
  local locked = type(IsXPUserDisabled) == "function" and IsXPUserDisabled() == true
  return atCap() or locked or ns.GameRuleOn("ExperienceBarDisabled")
end
-- The same rule for the info strip's XP rows.
DB.XPHidden = xpHidden

-- { cur, max, rested, level } for the XP bar, or nil when it should hide.
function DB.XP()
  if xpHidden() then
    return nil
  end
  local max = number(UnitXPMax, "player")
  if max <= 0 then
    return nil
  end
  return { cur = number(UnitXP, "player"), max = max, rested = number(GetXPExhaustion), level = number(UnitLevel, "player") }
end

-- Honor (Retail) ------------------------------------------------------------------------

-- Whether the game shows honor in place of XP now, by its own rule: watched as XP, in a battleground, or in world PvP.
local function honorShown()
  local pvp = type(C_PvP) == "table" and type(C_PvP.IsActiveBattlefield) == "function" and C_PvP.IsActiveBattlefield() == true
  local watched = type(IsWatchingHonorAsXP) == "function" and IsWatchingHonorAsXP() == true
  return watched or pvp or (type(IsInActiveWorldPVP) == "function" and IsInActiveWorldPVP() == true)
end

-- { cur, max, rested = 0, level, honor = true } for the honor line, or nil when the game wouldn't show it or the
-- client hides a value.
function DB.Honor()
  if not honorShown() then return nil end
  local max = number(UnitHonorMax, "player")
  if max <= 0 then return nil end
  return { cur = number(UnitHonor, "player"), max = max, rested = 0, level = number(UnitHonorLevel, "player"), honor = true }
end

-- Nothing: WoW Forever has neither honor levels nor renown, so its bars show what they always have.
local function none()
  return nil
end

-- What the XP bar shows at the level cap: Retail's honor, nothing on WoW Forever.
DB.AtCap = ns.ClientData({ forever = none, retail = DB.Honor })

-- What the XP bar shows: { cur, max, rested, level } for XP (honor = true at Retail's cap), or nil when it should hide.
function DB.Line()
  return DB.XP() or (xpHidden() and DB.AtCap() or nil)
end

-- The XP this level still needs, or nil at the level cap or when the client hides a value.
function DB.XPToLevel()
  if xpHidden() then return nil end
  local cur, max = ns.PlainNumber(UnitXP("player")), ns.PlainNumber(UnitXPMax("player"))
  return cur and max and max > cur and max - cur or nil
end

-- The top standing (Exalted): the game's own reputation list counts a faction there as capped
-- (MAX_REPUTATION_REACTION), whatever range it still gives.
DB.TOP_STANDING = 8

-- The watched faction with no numbers to show, the bar filled to `fill` (0 to 1): full at the top
-- standing, empty while the client hides its range (so a hidden range never reads as maxed).
local function noNumbers(name, standing, fill)
  return { name = name, standing = standing, cur = fill, max = 1, noNumbers = true }
end

-- True when the client's watched-faction answer names one: the game's own bar takes an empty name or
-- faction 0 for none watched.
local function namesFaction(data)
  if type(data) ~= "table" or ns.PlainNumber(data.factionID) == 0 then return false end
  return ns.IsSecret(data.name) or (type(data.name) == "string" and data.name ~= "")
end

-- { name, standing, cur, max } for a watched faction's standing.
local function standingOf(data)
  local standing = ns.PlainNumber(data.reaction)
  local low, high = ns.PlainNumber(data.currentReactionThreshold), ns.PlainNumber(data.nextReactionThreshold)
  local top = standing and standing >= DB.TOP_STANDING
  local readable = low and high and high > low
  if top or not readable then return noNumbers(data.name, standing, (top or (low and high)) and 1 or 0) end
  local cur = (ns.PlainNumber(data.currentStanding) or low) - low
  return { name = data.name, standing = standing, cur = cur, max = high - low }
end

-- Renown (Retail) ------------------------------------------------------------------------

-- A major faction's renown data from the client and its id, or nil for a faction that isn't one (or a client without them).
local function majorFaction(data)
  local id = ns.PlainNumber(data.factionID)
  local is = type(C_Reputation) == "table" and C_Reputation.IsMajorFaction
  if not id or type(is) ~= "function" or not ns.IsTrue(is(id)) then return nil end
  local info = C_MajorFactions.GetMajorFactionData(id)
  return type(info) == "table" and info or nil, id
end

-- Whether a major faction is at its top renown level (no where the client can't say).
local function topRenown(id)
  local top = C_MajorFactions.HasMaximumRenown
  return type(top) == "function" and ns.IsTrue(top(id))
end

-- "Renown 12", for a renown level.
local function renownWord(level)
  return ns.Format(L["Renown {level}"], { level = level })
end

-- The watched faction's renown when it is a major faction (Retail): its level as the standing's word, the reputation
-- earned towards the next level as the bar; full and without numbers at the top level or while a value is hidden.
function DB.Renown(data)
  local info, id = majorFaction(data)
  local level = info and ns.PlainNumber(info.renownLevel)
  if not level then return nil end
  local rep = noNumbers(data.name, ns.PlainNumber(data.reaction), 1)
  rep.word, rep.nextWord, rep.color = renownWord(level), renownWord(level + 1), DB.RENOWN_COLOR
  local cur, max = ns.PlainNumber(info.renownReputationEarned), ns.PlainNumber(info.renownLevelThreshold)
  if topRenown(id) or not (cur and max and max > 0) then return rep end
  rep.cur, rep.max, rep.noNumbers = cur, max, nil
  return rep
end

-- A watched faction's renown on Retail; WoW Forever has none.
DB.RenownOf = ns.ClientData({ forever = none, retail = DB.Renown })

-- { name, standing, cur, max } for the watched faction, or nil when none (a major faction's renown on Retail, with its
-- word). The standing is nil while the client hides it (the bar then takes Neutral's colour, and names no standing).
function DB.Reputation()
  local get = C_Reputation and C_Reputation.GetWatchedFactionData
  local data = type(get) == "function" and get() or nil
  if not namesFaction(data) then return nil end
  return DB.RenownOf(data) or standingOf(data)
end

-- The game's word for a standing (1 Hated .. 8 Exalted, "Honored"), in your character's form of it; nil
-- where the game has none (a hidden standing, past Exalted, or a client without the labels).
function DB.StandingName(standing)
  if not standing or standing > DB.TOP_STANDING then return nil end
  local key = "FACTION_STANDING_LABEL" .. standing
  local word = type(GetText) == "function" and GetText(key, number(UnitSex, "player")) or _G[key]
  return type(word) == "string" and word or nil
end

-- "Level 42  12.3K / 40.0K (31%)  rested 5.0K", or "Honor level 12  1.2K / 2.5K (48%)" for Retail's honor.
function DB.XPText(xp)
  local values = { level = xp.level, cur = DB.Short(xp.cur), max = DB.Short(xp.max), percent = math.floor(xp.cur / xp.max * 100), rested = DB.Short(xp.rested) }
  if xp.honor then return ns.Format(L["Honor level {level}  {cur} / {max} ({percent}%)"], values) end
  if xp.rested > 0 then return ns.Format(L["Level {level}  {cur} / {max} ({percent}%)  rested {rested}"], values) end
  return ns.Format(L["Level {level}  {cur} / {max} ({percent}%)"], values)
end

-- "Valdrakken Accord  Honored  1.2K / 2.5K (48%)", or "Valdrakken Accord  Exalted" at the top standing (a major
-- faction's "Renown 12" in place of the standing).
function DB.ReputationText(rep)
  local word = rep.word or DB.StandingName(rep.standing)
  local head = word and rep.name .. "  " .. word or rep.name
  if rep.noNumbers then return head end
  return string.format("%s  %s / %s (%d%%)", head, DB.Short(rep.cur), DB.Short(rep.max), math.floor(rep.cur / rep.max * 100))
end

-- Levelling detail -----------------------------------------------------------------------

-- A quest's XP reward, or 0 (the client takes the quest's id).
function DB.RewardXP(id)
  if type(GetQuestLogRewardXP) ~= "function" then return 0 end
  local xp = ns.PlainNumber(GetQuestLogRewardXP(id))
  return xp and xp > 0 and xp or 0
end

-- The XP a log entry is worth when it is a quest the game's log lists and it is ready to turn in, else 0.
local function readyXP(info)
  local id = ns.GetModule("QuestTracker").Listed(info)
  return id and ns.IsTrue(C_QuestLog.IsComplete(id)) and DB.RewardXP(id) or 0
end

-- The XP waiting in the quest log: every quest ready to turn in, added up.
function DB.QuestXP()
  local log, total = C_QuestLog, 0
  if type(log) ~= "table" or type(log.GetNumQuestLogEntries) ~= "function" or type(log.IsComplete) ~= "function" then return 0 end
  for i = 1, ns.PlainNumber((log.GetNumQuestLogEntries())) or 0 do total = total + readyXP(log.GetInfo(i)) end
  return total
end

-- The XP a log entry gives when it is a quest the game's log lists (a header, hidden row or task gives 0).
local function entryXP(info)
  local id = ns.GetModule("QuestTracker").Listed(info)
  return id and DB.RewardXP(id) or 0
end

-- The XP every quest in your log gives, added up (0 on a client without the log).
function DB.LogXP()
  local log, total = C_QuestLog, 0
  if type(log) ~= "table" or type(log.GetNumQuestLogEntries) ~= "function" or type(log.GetInfo) ~= "function" then return 0 end
  for i = 1, ns.PlainNumber((log.GetNumQuestLogEntries())) or 0 do total = total + entryXP(log.GetInfo(i)) end
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
  local lines = { { L["To next level"], DB.Short(xp.max - xp.cur) }, { L["Through this level"], math.floor(xp.cur / xp.max * 100) .. "%" } }
  if xp.rested > 0 then
    lines[#lines + 1] = { L["Rested"], ns.Format(L["{amount} ({percent}% of a level)"], { amount = DB.Short(xp.rested), percent = math.floor(xp.rested / xp.max * 100) }) }
  end
  if DB.killXP then
    lines[#lines + 1] = { L["Kills to level"], ns.Format(L["about {count} ({xp} XP each)"], { count = math.ceil((xp.max - xp.cur) / DB.killXP), xp = DB.killXP }) }
  end
  local waiting = DB.QuestXP()
  if waiting > 0 then lines[#lines + 1] = { L["XP in finished quests"], DB.Short(waiting) } end
  return lines
end

-- The honor tooltip's lines as { left, right } (Retail, at the cap): what is left in the honor level, how far through.
function DB.HonorLines(honor)
  return { { L["To next level"], DB.Short(honor.max - honor.cur) }, { L["Through this level"], math.floor(honor.cur / honor.max * 100) .. "%" } }
end

-- The XP bar tooltip's title and lines: "Level 42" and the XP lines, or Retail's honor level and its lines.
local function lineTip(xp)
  if xp.honor then return ns.Format(L["Honor level {level}"], { level = xp.level }), DB.HonorLines(xp) end
  return ns.Format(L["Level {level}"], { level = xp.level }), DB.XPLines(xp)
end

-- Shows the XP bar's tooltip, when it is on and the bar has something to say.
function DB.ShowXPTooltip(bar)
  local xp = DB.settings.tooltip and DB.Line()
  if not xp then return end
  local title, lines = lineTip(xp)
  GameTooltip_SetDefaultAnchor(GameTooltip, bar)
  GameTooltip:SetText(title, T.RGB("text"))
  for _, l in ipairs(lines) do GameTooltip:AddDoubleLine(l[1], l[2]) end
  GameTooltip:Show()
end

-- The reputation tooltip's lines as { left, right }: the standing, and (below the top) what the next one needs.
function DB.ReputationLines(rep)
  local word, lines = rep.word or DB.StandingName(rep.standing), {}
  if word then lines[1] = { L["Standing"], word } end
  if rep.noNumbers then return lines end
  local nextWord = rep.nextWord or (rep.standing and DB.StandingName(rep.standing + 1))
  lines[#lines + 1] = { nextWord and ns.Format(L["To {standing}"], { standing = nextWord }) or L["To the next standing"], DB.Short(rep.max - rep.cur) }
  lines[#lines + 1] = { L["Through this standing"], math.floor(rep.cur / rep.max * 100) .. "%" }
  return lines
end

-- Shows the reputation bar's tooltip, when it is on: the faction, its lines, and what a click does.
function DB.ShowReputationTooltip(bar)
  local rep = DB.settings.tooltip and DB.Reputation()
  if not rep then return end
  GameTooltip_SetDefaultAnchor(GameTooltip, bar)
  GameTooltip:SetText(rep.name, T.RGB("text"))
  for _, l in ipairs(DB.ReputationLines(rep)) do GameTooltip:AddDoubleLine(l[1], l[2]) end
  local r, g, b = T.RGB("text2")
  GameTooltip:AddLine(ns.InCombat() and L["Click: the reputation list (not in a fight)"] or L["Click: the reputation list"], r, g, b)
  GameTooltip:Show()
end

-- A left-click on the reputation bar opens the game's reputation list, out of a fight (it is a protected panel).
function DB.OpenReputation(_, button)
  if button ~= "LeftButton" or ns.WindowWaitsForCombat(L["The reputation list"]) then return end
  if type(ToggleCharacter) == "function" then ToggleCharacter("ReputationFrame") end
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

-- Where a bar's text goes while the bar is thinner than a line of it: centred on the XP bar, and centred
-- just above the reputation bar, a cell gap up, so with the two bars stacked 8 apart the two lines never meet.
-- Each is { text point, bar point, gaps up }.
DB.THIN_TEXT = { xpbar = { "CENTER", "CENTER", 0 }, repbar = { "BOTTOM", "TOP", 1 } }

-- Puts a thin bar's text where DB.THIN_TEXT says, held to the bar's width less a cell gap at each end: it is
-- cut short with an ellipsis in that room.
local function thinText(bar, spot)
  local width = (ns.PlainNumber(bar:GetWidth()) or 0) - 2 * T.SPACE.tight
  bar.text:SetWidth(math.max(0, width))
  bar.text:SetJustifyH("CENTER")
  bar.text:SetPoint(spot[1], bar, spot[2], 0, spot[3] * T.SPACE.tight)
end

-- Places a bar's text on one line: centred on the bar while the bar is at least as tall as its font (or its
-- height is hidden), else as DB.THIN_TEXT says.
function DB.PlaceText(bar)
  local _, size = bar.text:GetFont()
  local height = ns.PlainNumber(bar:GetHeight())
  local spot = height and height < (size or 0) and DB.THIN_TEXT[bar.vgKey]
  bar.text:ClearAllPoints()
  bar.text:SetWordWrap(false)
  if spot then return thinText(bar, spot) end
  bar.text:SetWidth(0)
  bar.text:SetJustifyH("CENTER")
  bar.text:SetPoint("CENTER")
end

-- The bar's text, shown as the text setting says (always, or on hover).
local function addText(bar, mode)
  bar.text = T.Text(bar:CreateFontString(nil, "OVERLAY"), "small")
  DB.PlaceText(bar)
  wireText(bar, mode)
end

-- A bar Vanguard resized: its fill (and the XP bar's rested strip) is drawn again, and its text placed for the new height.
local function resized(bar)
  DB.PlaceText(bar)
  if bar.vgOnState then bar.vgOnState() end
end

-- Gives a bar the mouse and a tooltip on hover, hooked so the text's own hover scripts (wireText) stay. The hooks
-- are on the module's own bar and go in once a session, through the scope's gate.
local function hoverTip(bar, label, show, scope)
  bar:EnableMouse(true)
  scope:Gate(label, show, function(gate)
    bar:HookScript("OnEnter", ns.Guard(label, gate))
    bar:HookScript("OnLeave", function() GameTooltip:Hide() end)
  end)
end

-- A themed status bar with its text; Vanguard may set its size. Made once a session (a frame is never freed).
local function makeBar(key, settings)
  local bar = CreateFrame("StatusBar", "Vanguard_" .. key, UIParent)
  bar.vgKey, bar.vgCalm = key, "xp"
  bar:SetSize(settings.width, settings.height)
  T.StyleBar(bar)
  T.HudPanel(bar, { inset = true })
  addText(bar, settings.text)
  V.WatchHover(bar)
  return bar
end

-- The bar made for `key` (once a session), movable and sizable through the scope: its mover leaves unlock mode and
-- the bar is hidden when the module stops.
local function createBar(key, label, point, settings, scope)
  DB.made = DB.made or {}
  DB.made[key] = DB.made[key] or makeBar(key, settings)
  scope:Mover(DB.made[key], key, label, point)
  ns.MoverSizable(key, DB.SIZES, resized)
  return DB.made[key]
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

-- Each bar's default spot: the XP bar along the bottom edge, the reputation bar just above it. Both keep to the
-- edge (`edge`) while the block around your character rises on a tall screen (Core/Layout.lua, HudLift).
DB.POINTS = { xpbar = { "BOTTOM", "BOTTOM", 0, 4, edge = true }, repbar = { "BOTTOM", "BOTTOM", 0, 12, edge = true } }

-- The reputation bar's default spot, given the XP bar's figures (nil when it has nothing to show): above
-- the XP bar, or the XP bar's own spot at the level cap or with that bar turned off, so no gap is left.
function DB.RepPoint(xp)
  return DB.xpBar and xp and DB.POINTS.repbar or DB.POINTS.xpbar
end

-- Moves the reputation bar's default spot when the XP bar comes or goes (a spot the player saved wins).
-- Movers place frames out of a fight, so a ding in one moves it when the fight ends.
function DB.PlaceRepBar(xp)
  local point = DB.RepPoint(xp)
  if not DB.repBar or point == DB.repPoint then return end
  DB.repPoint = point
  ns.SetMoverDefault("repbar", point)
end

-- Honor's bar colour: the theme's orange (the game paints honor orange; the theme has no honor token).
DB.HONOR_COLOR = "focus"
-- The renown bar's color token: the game draws a major faction's bar blue whatever its reaction.
DB.RENOWN_COLOR = "info"

-- Fills the XP bar (with honor at Retail's cap, in its own colour), or hides it at max level (or while its
-- visibility hides it).
function DB.UpdateXP()
  local bar, xp = DB.xpBar, DB.Line()
  if not bar then return end
  DB.PlaceRepBar(xp)
  bar:SetShown(xp ~= nil and V.Shows(bar))
  if not xp then return end
  bar:SetMinMaxValues(0, xp.max)
  bar:SetValue(xp.cur)
  T.BarColor(bar, xp.honor and DB.HONOR_COLOR or "xp")
  bar.rested:SetWidth(math.max(1, bar:GetWidth() * math.min(1, (xp.cur + xp.rested) / xp.max)))
  bar.text:SetText(DB.XPText(xp))
end

-- Fills the reputation bar in its standing color, or hides it with no watched
-- faction (or while its visibility hides it).
function DB.UpdateReputation()
  local bar, rep = DB.repBar, DB.Reputation()
  if not bar then return end
  bar:SetShown(rep ~= nil and V.Shows(bar))
  if not rep then return end
  bar:SetMinMaxValues(0, rep.max)
  bar:SetValue(rep.cur)
  T.BarColor(bar, rep.color or REACTION[rep.standing] or REACTION[4])
  bar.text:SetText(DB.ReputationText(rep))
end

-- A CVar changed: the XP bar repaints only for one of DB.XP_CVARS (the client sends every CVar's change; the name
-- is matched without case, as it may come as registered).
local function onXPCVar(_, name)
  if type(name) == "string" and DB.XP_CVARS[name:lower()] then DB.UpdateXP() end
end

-- The XP bar with its rested overlay, kept current.
local function enableXP(settings, scope)
  DB.xpBar = createBar("xpbar", L["Experience"], DB.POINTS.xpbar, settings, scope)
  DB.xpBar.vgOnState = DB.UpdateXP
  if not DB.xpBar.rested then addRested(DB.xpBar) end
  for _, e in ipairs(DB.XP_EVENTS) do scope:On(e, DB.UpdateXP) end
  if next(DB.XP_CVARS) then scope:On("CVAR_UPDATE", onXPCVar) end
  scope:On("PLAYER_XP_UPDATE", DB.OnXPChange)
  scope:On("CHAT_MSG_COMBAT_XP_GAIN", DB.OnKillMessage)
  hoverTip(DB.xpBar, "show XP tooltip", DB.ShowXPTooltip, scope)
  DB.UpdateXP()
end

-- The reputation bar for the watched faction, kept current, with its tooltip and a click to the reputation list.
local function enableReputation(settings, scope)
  DB.repPoint = DB.RepPoint(DB.Line())
  DB.repBar = createBar("repbar", L["Reputation"], DB.repPoint, settings, scope)
  DB.repBar.vgOnState = DB.UpdateReputation
  hoverTip(DB.repBar, "show reputation tooltip", DB.ShowReputationTooltip, scope)
  local bar = DB.repBar
  scope:Gate("open reputation list", DB.OpenReputation, function(gate) bar:HookScript("OnMouseUp", ns.Guard("open reputation list", gate)) end)
  for _, e in ipairs(DB.REP_EVENTS) do scope:On(e, DB.UpdateReputation) end
  DB.UpdateReputation()
end

-- The game's own XP and reputation bars, which these replace (so XP doesn't show twice).
DB.BLIZZARD = { "StatusTrackingBarManager", "MainStatusTrackingBarContainer", "SecondaryStatusTrackingBarContainer" }

-- True for a frame the client protects (itself, or through a secure child).
local function protected(f)
  return type(f.IsProtected) == "function" and f:IsProtected() == true
end

-- The gates of the hooks Suppress puts on the game's frames: a scope of its own that is always open, because
-- GameAlerts holds a frame with Suppress too, with this module off. A gate installs its hook once a session.
local holds = ns.NewScope("DataBars frames")
holds.on = true

-- Hides a frame again when the game shows it, while Suppress holds it (a Suppress released since lets it show).
local function holdHidden(f)
  if vgSuppressed[f] then f:Hide() end
end

-- Hooks the frame's Show and SetShown to hold it hidden, once a session.
local function holdFrame(name, f)
  holds:Gate("Show " .. name, holdHidden, function(gate) hooksecurefunc(f, "Show", ns.Guard("hook Show", gate)) end)
  holds:Gate("SetShown " .. name, holdHidden, function(gate) hooksecurefunc(f, "SetShown", ns.Guard("hook SetShown", gate)) end)
end

-- Keeps one of the game's frames hidden where it is. An XP bar frame isn't moved
-- under another parent (the game and Edit Mode call methods on its own parent;
-- moving it broke Edit Mode), and whenever the game shows it, it's hidden again.
-- A protected frame gets no hook (the hook's Hide is blocked in combat): it is
-- hidden once, out of combat. Its state is true while held and false once released (DB.Release): the hooks
-- go in only the first time, and do nothing while it is released.
function DB.Suppress(name)
  local f = _G[name]
  if type(f) ~= "table" or not f.Hide or vgSuppressed[f] then return end
  vgSuppressed[f] = true
  ns.EditModeReplaced(f)
  if protected(f) then return ns.OutOfCombat(function() f:Hide() end, f) end
  f:Hide()
  if type(hooksecurefunc) == "function" then holdFrame(name, f) end
end

-- Lets a frame Suppress hid show again (its hooks stay and do nothing): the game's frame is shown, out of combat.
-- The game's frame kept its events, so it fills itself again. Nothing for a frame that was never suppressed.
function DB.Release(name)
  local f = _G[name]
  if type(f) ~= "table" or not vgSuppressed[f] then return end
  vgSuppressed[f] = false
  ns.OutOfCombat(function() f:Show() end, f)
end

-- Applies the bars' visibility setting (one for both): now, or when combat ends
-- (registering a state driver is), and again on zone changes for In an instance.
function DB.ApplyVisibility()
  for _, bar in pairs({ DB.xpBar, DB.repBar }) do
    V.Track(bar, DB.ApplyVisibility)
    ns.OutOfCombat(function() V.ApplyNow(bar, DB.settings.visibility, DB.settings.showWhen) end, bar)
  end
end

-- Places both bars' texts again (the text size changed, so a line may now be taller than a bar).
function DB.PlaceTexts()
  for _, bar in pairs({ DB.xpBar, DB.repBar }) do DB.PlaceText(bar) end
end

-- The module switched off (Core/Modules.lua): the game's own status bars Suppress hid are shown again (their events
-- were never taken). Needs an in-game look: that they come back in their Edit Mode spot, and that showing them from
-- here taints nothing. The bars, their movers and handlers go with the scope.
function DB.Disable()
  for _, name in ipairs(DB.BLIZZARD) do DB.Release(name) end
end

-- Module entry point (Core/Modules.lua). Data bars aren't protected, so no combat wait. The bars are made once a
-- session; a bar whose switch is off is not kept (DB.xpBar is nil), and everything else goes through the scope.
function DB.Enable(settings, scope)
  DB.settings, DB.xpBar, DB.repBar = settings, nil, nil
  if settings.xp then enableXP(settings, scope) end
  if settings.reputation then enableReputation(settings, scope) end
  DB.ApplyVisibility()
  if not (settings.xp or settings.reputation) then return end
  scope:Gate("theme", DB.PlaceTexts, T.OnChanged)
  for _, name in ipairs(DB.BLIZZARD) do DB.Suppress(name) end
end
