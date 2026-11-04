-- Retail's Mythic+ (WoW Retail only: the TOC keeps this file off WoW Forever):
--   * the tracker's top block while a key runs: the dungeon and its level as the heading, the timer against the
--     dungeon's time limit (once a second), deaths and the time they cost, the affixes, then the stage's bosses and
--     enemy forces (a percentage). Outside a key the block is the scenario block (Modules/RetailQuests.lua) as before.
--     The game's own tracker stays parked while Vanguard's shows (Modules/QuestTracker.lua), its key block with it;
--   * the Mythic+ tab of the group finder (ChallengesFrame) and the keystone window (ChallengesKeystoneFrame), both
--     Blizzard_ChallengesUI's, which loads on demand, in the Vanguard look under the group finder switch: the tab's bronze
--     well border faded (the dungeon's painting stays), the keystone window on a theme panel with its runes and slot;
--   * the dungeon card (Modules/DungeonCard.lua) on Retail: the dungeon's Mythic+ timer in the heading in place of
--     vanilla's level range, then your keystone and the affixes (the running key's, else this week's), and the bags
--     scanned from the backpack (Retail has no key ring).
-- Every value comes from C_ChallengeMode, C_MythicPlus, the world timer and C_ScenarioInfo (Blizzard's live API docs,
-- wow-ui-source, live branch) and goes through the plain-value helpers: in a key they can be hidden. It is display
-- only, in combat too, and never compared while hidden.

local ADDON, ns = ...
local L = ns.L

local T = ns.Theme
local QT, RQ, DC, GW = ns.GetModule("QuestTracker"), ns.RetailQuests, ns.DungeonCard, ns.GetModule("Windows")

local RM = {}
ns.RetailMythicPlus = RM

-- The world timer kind of a key (Enum.WorldElapsedTimerTypes.ChallengeMode, when the client lacks the name), how
-- often the timer redraws (seconds), and the first bag the card's key scan reads on Retail (the backpack).
RM.TIMER_KIND, RM.TICK_EVERY, RM.BACKPACK = 1, 1, 0
-- The events the game's own key block follows, each a redraw of Vanguard's tracker.
RM.EVENTS = { "CHALLENGE_MODE_START", "CHALLENGE_MODE_COMPLETED", "CHALLENGE_MODE_RESET", "CHALLENGE_MODE_DEATH_COUNT_UPDATED",
  "WORLD_STATE_TIMER_START", "WORLD_STATE_TIMER_STOP" }

-- A table the client gives plainly (a hidden one counts as none).
local function plainTable(v)
  return not ns.IsSecret(v) and type(v) == "table" and v or nil
end

-- Keys and affixes -----------------------------------------------------------------------------

-- A challenge map's name, time limit (seconds) and instance (GetMapUIInfo's first, third and sixth values), each
-- nil while the client hides or lacks it.
function RM.MapInfo(mapID)
  if not mapID then return nil end
  local name, _, limit, _, _, instance = ns.CallIf(C_ChallengeMode, "GetMapUIInfo", mapID)
  return ns.PlainText(name), ns.PlainNumber(limit), ns.PlainNumber(instance)
end

-- "Fortified, Bursting" from a list of affix ids, by the client's own names; nil when none is named.
function RM.AffixText(ids)
  local names = {}
  for _, id in ipairs(plainTable(ids) or {}) do
    local name = ns.PlainNumber(id) and ns.PlainText((ns.CallIf(C_ChallengeMode, "GetAffixInfo", id)))
    if name then names[#names + 1] = name end
  end
  return #names > 0 and table.concat(names, ", ") or nil
end

-- This week's affix ids (C_MythicPlus.GetCurrentAffixes: { id, seasonID } each).
local function weekAffixes()
  local ids = {}
  for _, affix in ipairs(plainTable(ns.CallIf(C_MythicPlus, "GetCurrentAffixes")) or {}) do
    if plainTable(affix) then ids[#ids + 1] = affix.id end
  end
  return ids
end

-- The running key's affix ids (GetActiveKeystoneInfo's second value).
local function keyAffixes()
  local _, ids = ns.CallIf(C_ChallengeMode, "GetActiveKeystoneInfo")
  return ids
end

-- Whether a key is running in the dungeon you are in.
function RM.Active()
  return ns.IsTrue(ns.CallIf(C_ChallengeMode, "IsChallengeModeActive"))
end

-- Seconds the running key's world timer has run, or nil while the client hides it or runs none.
function RM.Elapsed()
  local kinds = type(Enum) == "table" and Enum.WorldElapsedTimerTypes or {}
  local kind = kinds.ChallengeMode or RM.TIMER_KIND
  for _, id in ipairs({ ns.CallIf(_G, "GetWorldElapsedTimers") }) do
    local _, elapsed, timerKind = ns.CallIf(_G, "GetWorldElapsedTime", id)
    if ns.PlainNumber(timerKind) == kind then return ns.PlainNumber(elapsed) end
  end
end

-- The running key: { level, name, limit, elapsed, deaths, lost, affixes }, each nil while the client hides it.
function RM.Key()
  local level, ids = ns.CallIf(C_ChallengeMode, "GetActiveKeystoneInfo")
  local name, limit = RM.MapInfo(ns.PlainNumber(ns.CallIf(C_ChallengeMode, "GetActiveChallengeMapID")))
  local deaths, lost = ns.CallIf(C_ChallengeMode, "GetDeathCount")
  return { level = ns.PlainNumber(level), name = name, limit = limit, elapsed = RM.Elapsed(),
    deaths = ns.PlainNumber(deaths), lost = ns.PlainNumber(lost), affixes = RM.AffixText(ids) }
end

-- A key's name: "The Stonevault +12", the dungeon alone while the level is hidden, "Mythic+" while the name is.
function RM.KeyName(key)
  local name = key.name or L["Mythic+"]
  if not key.level then return name end
  return ns.Format(L["{dungeon} +{level}"], { dungeon = name, level = key.level })
end

-- The tracker block ---------------------------------------------------------------------------

-- The timer: "12:34 / 33:00" ("· over time" once past the limit), the time alone without a limit, and "Mythic+
-- timer" while the client hides it.
function RM.TimerText(key)
  if not key.elapsed then return L["Mythic+ timer"] end
  if not key.limit then return QT.Clock(key.elapsed) end
  local text = ns.Format(L["{elapsed} / {limit}"], { elapsed = QT.Clock(key.elapsed), limit = QT.Clock(key.limit) })
  if key.elapsed > key.limit then text = ns.Format(L["{time} · over time"], { time = text }) end
  return text
end

-- "Deaths: 3 (15 s lost)", "Deaths: 0" before any, nil while the client hides them.
function RM.DeathText(key)
  if not key.deaths then return nil end
  if (key.lost or 0) <= 0 then return ns.Format(L["Deaths: {count}"], { count = key.deaths }) end
  return ns.Format(L["Deaths: {count} ({seconds} s lost)"], { count = key.deaths, seconds = key.lost })
end

-- The stage's criteria (the bosses and the enemy forces) as lines, in the game's order.
local function criteria()
  local out, step = {}, plainTable(ns.CallIf(C_ScenarioInfo, "GetScenarioStepInfo")) or {}
  for i = 1, ns.PlainNumber(step.numCriteria) or 0 do
    local c = plainTable(ns.CallIf(C_ScenarioInfo, "GetCriteriaInfo", i))
    local line = c and RQ.Criterion(c)
    if line then out[#out + 1] = line end
  end
  return out
end

-- The key's row: the timer as its title, then deaths, the affixes and the stage's criteria.
function RM.Row(key)
  local lines, deaths = {}, RM.DeathText(key)
  if deaths then lines[#lines + 1] = { text = deaths, done = false } end
  if key.affixes then lines[#lines + 1] = { text = ns.Format(L["Affixes: {affixes}"], { affixes = key.affixes }), done = false } end
  for _, line in ipairs(criteria()) do lines[#lines + 1] = line end
  return { title = RM.TimerText(key), objectives = lines, kind = "mythicplus" }
end

-- The tracker's top block: the running key under its name, redrawn once a second while it runs (and the tracker
-- shows); outside a key, the scenario block as before.
function RM.Block(quests, taken)
  local active = RM.Active()
  ns.Every("mythic plus timer", active and RM.TICK_EVERY or nil, QT.Refresh, QT.frame)
  if not active then return RQ.Scenario(quests, taken) end
  local key = RM.Key()
  return { { section = RM.KeyName(key) }, RM.Row(key) }
end

-- The dungeon card -----------------------------------------------------------------------------

-- The challenge map of the dungeon you stand in (the one whose instance is GetInstanceInfo's eighth value), or nil.
function RM.MapHere()
  local here = ns.PlainNumber((select(8, ns.CallIf(_G, "GetInstanceInfo"))))
  for _, mapID in ipairs(here and plainTable(ns.CallIf(C_ChallengeMode, "GetMapTable")) or {}) do
    local _, _, instance = RM.MapInfo(ns.PlainNumber(mapID))
    if instance == here then return mapID end
  end
end

-- The card heading's detail: "Mythic+ timer 33:00" in a dungeon with a Mythic+ timer, else nothing (Retail's
-- dungeons scale to you, so a level range says nothing).
function RM.Detail()
  local _, limit = RM.MapInfo(RM.MapHere())
  return limit and ns.Format(L["Mythic+ timer {time}"], { time = QT.Clock(limit) }) or nil
end

-- "Your keystone: The Stonevault +12", or nil when you carry none.
function RM.OwnedKey()
  local level = ns.PlainNumber(ns.CallIf(C_MythicPlus, "GetOwnedKeystoneLevel"))
  if not (level and level > 0) then return nil end
  local name = RM.MapInfo(ns.PlainNumber(ns.CallIf(C_MythicPlus, "GetOwnedKeystoneChallengeMapID")))
  return ns.Format(L["Your keystone: {key}"], { key = RM.KeyName({ level = level, name = name }) })
end

-- The card's lines under its heading: your keystone, then the affixes (the running key's in one, else this week's).
function RM.CardLines()
  local out, owned = {}, RM.OwnedKey()
  local affixes = RM.AffixText(RM.Active() and keyAffixes() or weekAffixes())
  if owned then out[#out + 1] = { owned } end
  if affixes then out[#out + 1] = { ns.Format(L["Affixes: {affixes}"], { affixes = affixes }) } end
  return out
end

-- The windows ---------------------------------------------------------------------------------

-- The keystone window's art that stays (Blizzard_ChallengesUI.xml): the rune circle, the runes, the slot's ring and
-- frame. Its backdrop, divider and the instructions' band fade for the theme panel; the glows its slotting animates
-- come up with their animations.
RM.KEYSTONE_KEEP = { "RuneBG", "RunesLarge", "RunesSmall", "SlotBG", "KeystoneFrame" }

-- The keystone window: on a theme panel, its runes and slot kept, the close button and Start in the theme.
function RM.SkinKeystone(frame)
  T.FadeRegions(frame, GW.KeepKeys(frame, RM.KEYSTONE_KEEP))
  T.Panel(frame, { shadow = true, pad = GW.PAD, alpha = 1 })
  GW.DressClose(frame, frame.CloseButton)
  GW.SkinButton(frame.StartButton)
end

-- The Mythic+ tab, inside the group finder: its well's bronze border faded. The dungeon's painting behind the
-- affixes and the dungeon icons are the tab's content and stay the game's.
function RM.SkinTab()
  GW.FadeFrame(GW.Part(_G, "ChallengesFrameInset.NineSlice"))
end

GW.AddOnDemand("finder", "Blizzard_ChallengesUI", { "ChallengesFrame" }, RM.SkinTab)
GW.AddOnDemand("finder", "Blizzard_ChallengesUI", { "ChallengesKeystoneFrame" }, RM.SkinKeystone)

-- The tracker's scenario block becomes the key block (which draws the scenario block outside a key), and the
-- tracker follows the key's events.
for i, block in ipairs(QT.BLOCKS.above) do
  if block == RQ.Scenario then QT.BLOCKS.above[i] = RM.Block end
end
for _, event in ipairs(RM.EVENTS) do table.insert(QT.EVENTS, event) end

-- The dungeon card on Retail.
DC.Detail, DC.FIRST_BAG = RM.Detail, RM.BACKPACK
DC.LABEL = L["Dungeon card: your keystone, the affixes and the Mythic+ timer on the checklist"]
table.insert(DC.EXTRA, RM.CardLines)
