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

local QA = ns.Module("QuestAuto", { defaults = { accept = false, acceptShared = false, turnIn = false, bestReward = false, skipGossip = false } })

-- Calls fn if it's a function; nil otherwise.
local function call(fn, ...)
  if type(fn) == "function" then return fn(...) end
end

-- Calls a C_GossipInfo function by name, if this client has it.
local function gossip(name, ...)
  return call(C_GossipInfo and C_GossipInfo[name], ...)
end

-- A count from the client (0 when it can't say).
local function count(n)
  return ns.PlainNumber(n) or 0
end

-- Holding Shift skips the automation for this NPC.
local function skipped()
  return call(IsShiftKeyDown) == true
end

-- Whether the quest on offer comes from a player (one shared in your group) rather than an NPC.
local function fromPlayer()
  local v = call(UnitIsPlayer, "npc")
  return not ns.IsSecret(v) and v == true
end

-- The quest's title for the chat line.
local function title()
  return ns.QuestParts.Plain(call(GetTitleText))
end

-- Rewards ---------------------------------------------------------------------------------------

-- What reward choice i sells for (copper), or nil when the client doesn't know yet.
local function choicePrice(i)
  local link, info = call(GetQuestItemLink, "choice", i), C_Item and C_Item.GetItemInfo
  if type(link) ~= "string" or type(info) ~= "function" then return nil end
  return ns.PlainNumber((select(11, info(link))))
end

-- The reward choice that sells for the most, or nil (you choose) while any price is unknown, when two
-- share the top price, or when none sells for anything.
function QA.BestChoice()
  local best, bestPrice, tied = nil, 0, false
  for i = 1, count(call(GetNumQuestChoices)) do
    local price = choicePrice(i)
    if not price then return nil end
    if price > bestPrice then best, bestPrice, tied = i, price, false elseif price == bestPrice then tied = true end
  end
  return not tied and best or nil
end

-- The reward to take: the only one (or none), else the best seller when that switch is on; nil to let you choose.
function QA.RewardChoice()
  local n = count(call(GetNumQuestChoices))
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
  local available, active = count(call(GetNumAvailableQuests)), count(call(GetNumActiveQuests))
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
  QUEST_PROGRESS = function() return QA.TurnsIn() and call(IsQuestCompletable) == true and QA.Continue or nil end,
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

-- Accepts the offered quest (or acknowledges one the game accepted already).
function QA.Accept()
  if call(QuestGetAutoAccept) == true then call(AcknowledgeAutoAcceptQuest) else call(AcceptQuest) end
  ns.Chat("Accepted: " .. title() .. (fromPlayer() and (" (shared by " .. ns.QuestParts.Plain(call(UnitName, "npc")) .. ")") or ""))
end

-- Hands in a finished quest's items (the reward page comes next).
function QA.Continue()
  call(CompleteQuest)
end

-- Takes the reward (the only one, or the best seller) and finishes the quest.
function QA.Finish()
  local choice = QA.RewardChoice()
  local name = choice > 0 and ns.QuestParts.Plain((call(GetQuestItemInfo, "choice", choice)))
  call(GetQuestReward, choice > 0 and choice or nil)
  ns.Chat("Turned in: " .. title() .. (count(call(GetNumQuestChoices)) > 1 and name and (" (took " .. name .. ")") or ""))
end

-- Module entry point (Core/Modules.lua): each switch is read when its event comes.
function QA.Enable(settings)
  QA.settings = settings
  for event in pairs(QA.ACTIONS) do
    ns.On(event, function() local act = actionFor(event) if act then act() end end)
  end
end
