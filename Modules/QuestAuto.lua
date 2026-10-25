-- Quest automation, each switch off until you turn it on (hold Shift while
-- talking to an NPC to skip all of it that time):
--   * accept quests you're offered;
--   * accept quests a party member shares with you (its own switch: the offer comes from a player, not an NPC);
--   * turn in finished quests: Continue, then Complete when there's no reward
--     to choose (it never chooses for you, unless the next switch is on, and
--     it leaves a quest that costs money to you);
--   * with a choice of rewards, take the one that sells for the most (on a tie,
--     or when none sells, you choose);
--   * skip the gossip when an NPC has exactly one quest for you and nothing else to say.
-- Each says in chat what it did. The quest dialog asks Claims(event) first,
-- so a page that's about to be answered for you isn't shown.

local ADDON, ns = ...
local L = ns.L

local QA = ns.Module("QuestAuto", { defaults = { accept = false, acceptShared = false, turnIn = false, bestReward = false, skipGossip = false } })

-- Calls a C_GossipInfo function by name, if this client has it.
local function gossip(name, ...)
  return ns.CallIf(C_GossipInfo, name, ...)
end

-- A count from the client (0 when it can't say).
local function count(n)
  return ns.PlainNumber(n) or 0
end

-- Holding Shift skips the automation for this NPC.
local function skipped()
  return ns.CallIf(_G, "IsShiftKeyDown") == true
end

-- Whether the quest on offer comes from a player (one shared in your group) rather than an NPC.
local function fromPlayer()
  local v = ns.CallIf(_G, "UnitIsPlayer", "npc")
  return ns.IsTrue(v)
end

-- The quest's title for the chat line.
local function title()
  return ns.QuestParts.Plain(ns.CallIf(_G, "GetTitleText"))
end

-- Rewards ---------------------------------------------------------------------------------------

-- The reward choice that sells for the most, or nil (you choose) while any price is unknown, when two
-- share the top price, or when none sells for anything: the choice the quest windows crown.
function QA.BestChoice()
  local QP, prices, n = ns.QuestParts, {}, count(ns.CallIf(_G, "GetNumQuestChoices"))
  for i = 1, n do prices[i] = QP.SellPrice(ns.CallIf(_G, "GetQuestItemLink", "choice", i)) end
  return QP.TopSeller(prices, n)
end

-- The reward to take: the only one (or none), else the best seller when that switch is on; nil to let you choose.
function QA.RewardChoice()
  local n = count(ns.CallIf(_G, "GetNumQuestChoices"))
  if n <= 1 then return n end
  return QA.settings.bestReward and QA.BestChoice() or nil
end

-- Gossip ----------------------------------------------------------------------------------------

-- The NPC's only line, when it has exactly one quest and nothing else to say: a function selecting it.
function QA.OnlyQuest()
  local available, active = gossip("GetAvailableQuests") or {}, gossip("GetActiveQuests") or {}
  if #available + #active ~= 1 or #(gossip("GetOptions") or {}) > 0 then return nil end
  local q = available[1] or active[1]
  local pick = available[1] and "SelectAvailableQuest" or "SelectActiveQuest"
  return function() gossip(pick, q.questID) end
end

-- The same for a quest giver without gossip (the game's greeting window).
function QA.OnlyGreeting()
  local available, active = count(ns.CallIf(_G, "GetNumAvailableQuests")), count(ns.CallIf(_G, "GetNumActiveQuests"))
  if available + active ~= 1 then return nil end
  if available == 1 then return function() SelectAvailableQuest(1) end end
  return function() SelectActiveQuest(1) end
end

-- Whether turn-in automation answers this quest: switched on, and the quest costs no money (the game asks
-- before paying, so automation never pays for you).
function QA.TurnsIn()
  return QA.settings.turnIn and ns.QuestParts.Cost() <= 0
end

-- What each event's automation would do, or nil when it leaves the page to you.
QA.ACTIONS = {
  -- A quest offered: accept it (a quest shared by a player follows its own switch).
  QUEST_DETAIL = function() return QA.settings[fromPlayer() and "acceptShared" or "accept"] and QA.Accept or nil end,
  -- A finished quest's hand-in: continue (a quest that costs money is left to you).
  QUEST_PROGRESS = function() return QA.TurnsIn() and ns.CallIf(_G, "IsQuestCompletable") == true and QA.Continue or nil end,
  -- The reward page: finish, when the reward is settled (a quest that costs money is left to you).
  QUEST_COMPLETE = function() return QA.TurnsIn() and QA.RewardChoice() and QA.Finish or nil end,
  -- Gossip with one quest and nothing else: pick it.
  GOSSIP_SHOW = function() return QA.settings.skipGossip and QA.OnlyQuest() or nil end,
  -- The same without gossip.
  QUEST_GREETING = function() return QA.settings.skipGossip and QA.OnlyGreeting() or nil end,
}

-- The action automation would take for an event right now, or nil.
local function actionFor(event)
  local pick = QA.settings and QA.ACTIONS[event]
  if not pick or skipped() then return nil end
  return pick()
end

-- True when automation is about to answer this event (the quest dialog then stays shut).
function QA.Claims(event)
  return actionFor(event) ~= nil
end

-- Actions ---------------------------------------------------------------------------------------

-- The accept line waiting for the game to confirm the quest ({ id, line }), and the listeners that end the wait.
local waiting
local confirmAccept, dropAccept

-- Forgets the waiting accept line: the game refused the quest (a full log, say) and another quest dialog opened.
function dropAccept()
  waiting = nil
  ns.Off("QUEST_ACCEPTED", confirmAccept)
end

-- Says the waiting accept line once the game takes that quest into the log.
function confirmAccept(_, questId)
  local line = waiting and ns.PlainNumber(questId) == waiting.id and waiting.line
  if not line then return end
  dropAccept()
  ns.Chat(line)
end

-- Waits for the game to take the quest before saying so (it refuses some, such as with a full log); a
-- quest the client can't name is said at once, as no confirmation could be matched to it.
local function awaitAccept(line)
  local id = ns.PlainNumber(ns.CallIf(_G, "GetQuestID"))
  if not id or id == 0 then return ns.Chat(line) end
  waiting = { id = id, line = line }
  ns.On("QUEST_ACCEPTED", confirmAccept)
end

-- The accept line: the quest, and who shared it when a player did.
local function acceptLine()
  if not fromPlayer() then return ns.Format(L["Accepted: {quest}"], { quest = title() }) end
  return ns.Format(L["Accepted: {quest} (shared by {name})"], { quest = title(), name = ns.QuestParts.Plain(ns.CallIf(_G, "UnitName", "npc")) })
end

-- Accepts the offered quest (or acknowledges one the game accepted already, said at once).
function QA.Accept()
  local line = acceptLine()
  if ns.CallIf(_G, "QuestGetAutoAccept") == true then
    ns.CallIf(_G, "AcknowledgeAutoAcceptQuest")
    return ns.Chat(line)
  end
  awaitAccept(line)
  ns.CallIf(_G, "AcceptQuest")
end

-- Hands in a finished quest's items (the reward page comes next).
function QA.Continue()
  ns.CallIf(_G, "CompleteQuest")
end

-- Takes the reward (the only one, or the best seller) and finishes the quest; from a choice it says which
-- it took and why (a reward taken is for good).
function QA.Finish()
  local choice = QA.RewardChoice()
  local name = choice > 0 and ns.QuestParts.Plain((ns.CallIf(_G, "GetQuestItemInfo", "choice", choice)))
  ns.CallIf(_G, "GetQuestReward", choice > 0 and choice or nil)
  if count(ns.CallIf(_G, "GetNumQuestChoices")) > 1 and name then
    return ns.Chat(ns.Format(L["Turned in: {quest} (took {reward}: sells for most)"], { quest = title(), reward = name }))
  end
  ns.Chat(ns.Format(L["Turned in: {quest}"], { quest = title() }))
end

-- Module entry point (Core/Modules.lua): each switch is read when its event comes. A new quest offer first
-- forgets an accept line still waiting, before automation may answer the offer.
function QA.Enable(settings)
  QA.settings = settings
  ns.On("QUEST_DETAIL", dropAccept)
  for event in pairs(QA.ACTIONS) do
    ns.On(event, function() local act = actionFor(event) if act then act() end end)
  end
end
