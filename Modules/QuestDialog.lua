-- Vanguard's quest dialog: talking to a quest giver opens a panel sized to
-- what it says, just above the frames around your character, instead of the
-- game's quest and gossip windows. It shows the NPC's portrait (a quest mark
-- when there is none to draw) and name, the text, numbered lines for quests and gossip
-- (click one, or press its number), reward cards with quality borders, and
-- the main button (Space presses it; Escape says goodbye).
--
-- It takes over only the gossip and quest events from the game's own windows
-- (they stay intact for other addons), and calls the game's own functions
-- for everything it does. Text the client hides shows as "…".

local ADDON, ns = ...
local L = ns.L

local QP = ns.QuestParts

local QD = ns.Module("QuestDialog", { defaults = { dialog = true } })

-- The panel's width, its least and greatest height (it is sized to what the page
-- holds; a longer text scrolls), and the reward cards in a row.
QD.W, QD.MIN_H, QD.MAX_H, QD.PER_ROW = 560, 160, 360, 3
-- The game's windows and the events this dialog takes from them.
QD.TAKEN = {
  QuestFrame = { "QUEST_GREETING", "QUEST_DETAIL", "QUEST_PROGRESS", "QUEST_COMPLETE", "QUEST_FINISHED" },
  GossipFrame = { "GOSSIP_SHOW", "GOSSIP_CLOSED" },
  CustomGossipFrameManager = { "GOSSIP_SHOW", "GOSSIP_CLOSED" },
}

-- Calls ----------------------------------------------------------------------------------------

-- Calls a C_GossipInfo function by name, if this client has it.
local function gossip(name, ...)
  return ns.CallIf(C_GossipInfo, name, ...)
end
QD.Gossip = gossip

-- Lines ----------------------------------------------------------------------------------------

-- A quest you can take: "!", in its difficulty color.
local function availableLine(level, title, select, questID)
  return { text = QP.Titled(level, title, questID), icon = QP.ICONS.available, color = { QP.LevelColor(level) }, select = select, quest = true }
end

-- A quest you have: "?" in gold when ready to turn in, gray while still in progress.
local function activeLine(level, title, complete, select, questID)
  local ready = ns.IsTrue(complete)
  return { text = QP.Titled(level, title, questID), icon = ready and QP.ICONS.ready or QP.ICONS.active, color = ready and "gold" or "text2", select = select, quest = true }
end

-- The NPC's gossip options in the game's order.
local function sortedOptions()
  local options = {}
  for _, o in ipairs(gossip("GetOptions") or {}) do options[#options + 1] = o end
  table.sort(options, function(a, b) return (a.orderIndex or 0) < (b.orderIndex or 0) end)
  return options
end

-- A gossip option line.
local function optionLine(o)
  return { text = QP.Plain(o.name), icon = o.icon, color = "text", select = function() gossip("SelectOption", o.gossipOptionID) end }
end

-- A gossip NPC's lines: quests to take, quests to turn in, then its options.
function QD.GossipLines()
  local out = {}
  for _, q in ipairs(gossip("GetAvailableQuests") or {}) do out[#out + 1] = availableLine(q.questLevel, q.title, function() gossip("SelectAvailableQuest", q.questID) end, ns.PlainNumber(q.questID)) end
  for _, q in ipairs(gossip("GetActiveQuests") or {}) do out[#out + 1] = activeLine(q.questLevel, q.title, q.isComplete, function() gossip("SelectActiveQuest", q.questID) end, ns.PlainNumber(q.questID)) end
  for _, o in ipairs(sortedOptions()) do out[#out + 1] = optionLine(o) end
  return out
end

-- The NPC's one option when the game goes to it directly instead of showing gossip (a flight master, a
-- vendor), or nil: as GossipFrameSharedMixin:HandleShow does, no quests to show, a single option flagged
-- selectOptionWhenOnlyOption, and an NPC that doesn't force its gossip (C_GossipInfo.ForceGossip).
local function directOption()
  local options = sortedOptions()
  local quests = #(gossip("GetAvailableQuests") or {}) + #(gossip("GetActiveQuests") or {})
  if quests > 0 or #options ~= 1 or ns.IsTrue(gossip("ForceGossip")) then return nil end
  return ns.IsTrue(options[1].selectOptionWhenOnlyOption) and options[1] or nil
end

-- Goes straight to the NPC's one option when the game would (the dialog doesn't open); true when it did.
function QD.SkipGossip()
  local option = directOption()
  if option then gossip("SelectOptionByIndex", option.orderIndex) end
  return option ~= nil
end

-- A quest giver's lines without gossip (the game's greeting window).
function QD.GreetingLines()
  local out = {}
  for i = 1, ns.PlainNumber(ns.CallIf(_G, "GetNumAvailableQuests")) or 0 do out[#out + 1] = availableLine(ns.CallIf(_G, "GetAvailableLevel", i), ns.CallIf(_G, "GetAvailableTitle", i), function() SelectAvailableQuest(i) end) end
  for i = 1, ns.PlainNumber(ns.CallIf(_G, "GetNumActiveQuests")) or 0 do
    local title, complete = ns.CallIf(_G, "GetActiveTitle", i)
    out[#out + 1] = activeLine(ns.CallIf(_G, "GetActiveLevel", i), title, complete, function() SelectActiveQuest(i) end)
  end
  return out
end

-- Rewards --------------------------------------------------------------------------------------

-- The quest's items of one kind ("choice", "reward" or "required").
function QD.Items(kind, count)
  local out = {}
  for i = 1, ns.PlainNumber(count) or 0 do
    local name, texture, n, quality = ns.CallIf(_G, "GetQuestItemInfo", kind, i)
    out[#out + 1] = { kind = kind, index = i, name = name, texture = texture, count = n, quality = quality, link = ns.CallIf(_G, "GetQuestItemLink", kind, i) }
  end
  return out
end

-- The money and XP a quest gives, as "+1g 20s 0c · 450 XP" ("" for none).
function QD.MoneyLine()
  return QP.MoneyText(ns.PlainNumber(ns.CallIf(_G, "GetRewardMoney")), ns.PlainNumber(ns.CallIf(_G, "GetRewardXP")))
end

-- The spells a quest teaches, as "Teaches: Name".
local function spellRewards(info, questID)
  local out = {}
  for _, spellID in ipairs(ns.CallIf(info, "GetQuestRewardSpells", questID) or {}) do
    local spell = ns.CallIf(info, "GetQuestRewardSpellInfo", questID, spellID)
    if type(spell) == "table" and spell.name then out[#out + 1] = ns.Format(L["Teaches: {spell}"], { spell = QP.Plain(spell.name) }) end
  end
  return out
end

-- A quest's spell and currency rewards as text ("Teaches: Name", "3 Marks"); none without the client's calls.
function QD.ExtraRewards(questID)
  local info = C_QuestInfoSystem
  if type(info) ~= "table" or not questID then return {} end
  local out = spellRewards(info, questID)
  for _, c in ipairs(ns.CallIf(info, "GetQuestRewardCurrencies", questID) or {}) do
    out[#out + 1] = (ns.PlainNumber(c.totalRewardAmount) or 0) .. " " .. QP.Plain(c.name)
  end
  return out
end

-- The open quest's spell and currency rewards, for the page to show under its text (QD.ExtraRewards).
function QD.PageExtras()
  return QD.ExtraRewards(ns.PlainNumber(ns.CallIf(_G, "GetQuestID")))
end

-- Closing --------------------------------------------------------------------------------------

-- Ends the talk with the NPC (the game's own goodbye for gossip and quests).
local function closeGame()
  gossip("CloseGossip")
  ns.CallIf(_G, "CloseQuest")
end

-- The player closed the dialog (Goodbye, Escape): the NPC talk ends too (see QD.OnHide).
function QD.Close()
  QD.frame:Hide()
end

-- The game ended the talk (or moved to the next page): hide without closing it again.
function QD.Quiet()
  QD.quiet = true
  QD.frame:Hide()
  QD.quiet = false
end

-- The dialog hid: the talk ends only when the player closed it (Goodbye, Escape).
-- Not when the game ended the talk (QD.Quiet), and not when the whole UI went
-- away (Alt-Z hides UIParent, which runs OnHide on its children): the dialog is
-- still marked shown then, so it comes back with the UI and the talk goes on.
function QD.OnHide()
  if QD.quiet or QD.frame:IsShown() then return end
  closeGame()
end

-- Pages ----------------------------------------------------------------------------------------

-- Goodbye: the button that leaves, alone at the far left of the dialog.
local GOODBYE = { L["Goodbye"], function() QD.Close() end }

-- Each page: what it shows, from the game's current quest or gossip.
QD.PAGES = {
  -- A gossip NPC: its greeting and lines.
  gossip = function() return { text = gossip("GetText"), lines = QD.GossipLines(), escape = GOODBYE } end,
  -- A quest giver without gossip: its greeting and quests.
  greeting = function() return { text = ns.CallIf(_G, "GetGreetingText"), lines = QD.GreetingLines(), escape = GOODBYE } end,
  -- A quest's details.
  detail = function() return QD.DetailPage() end,
  -- A quest being handed in.
  progress = function() return QD.ProgressPage() end,
  -- A quest's rewards.
  complete = function() return QD.CompletePage() end,
}

-- A quest's details: accept it (or acknowledge one the game already accepted), or decline.
function QD.DetailPage()
  local auto = ns.CallIf(_G, "QuestGetAutoAccept") == true
  return {
    title = QP.WithMark(ns.CallIf(_G, "GetTitleText"), ns.PlainNumber(ns.CallIf(_G, "GetQuestID"))), text = ns.CallIf(_G, "GetQuestText"), objectives = ns.CallIf(_G, "GetObjectiveText"),
    needs = QP.Needs(0, ns.CallIf(_G, "GetSuggestedGroupSize")),
    done = ns.GetModule("QuestHistory").Line(ns.PlainNumber(ns.CallIf(_G, "GetQuestID"))),
    choices = QD.Items("choice", ns.CallIf(_G, "GetNumQuestChoices")), rewards = QD.Items("reward", ns.CallIf(_G, "GetNumQuestRewards")), money = QD.MoneyLine(),
    extras = QD.PageExtras(), primary = auto and { L["OK"], function() ns.CallIf(_G, "AcknowledgeAutoAcceptQuest") end } or { L["Accept"], function() ns.CallIf(_G, "AcceptQuest") end },
    secondary = not auto and { L["Decline"], function() ns.CallIf(_G, "DeclineQuest") end } or nil,
  }
end

-- What the quest asks for to hand it in, as "Costs 5g 0s 0c" ("" for nothing).
function QD.CostLine()
  local cost = QP.Cost()
  return cost > 0 and ns.Format(L["Costs {money}"], { money = ns.GetModule("InfoStrip").Money(cost) }) or ""
end

-- A quest you're turning in: what it still needs (items, and the money it costs), and Continue once you have it.
function QD.ProgressPage()
  return {
    title = ns.CallIf(_G, "GetTitleText"), text = ns.CallIf(_G, "GetProgressText"), rewards = QD.Items("required", ns.CallIf(_G, "GetNumQuestItems")), money = QD.CostLine(),
    primary = { L["Continue"], function() ns.CallIf(_G, "CompleteQuest") end, ns.CallIf(_G, "IsQuestCompletable") == true }, escape = GOODBYE,
  }
end

-- A quest you're finishing: pick a reward (when there's a choice), then Complete.
function QD.CompletePage()
  local choices = QD.Items("choice", ns.CallIf(_G, "GetNumQuestChoices"))
  return {
    title = ns.CallIf(_G, "GetTitleText"), text = ns.CallIf(_G, "GetRewardText"), choices = choices, rewards = QD.Items("reward", ns.CallIf(_G, "GetNumQuestRewards")),
    money = QD.MoneyLine(), extras = QD.PageExtras(), primary = { L["Complete"], QD.Complete, #choices <= 1 }, pick = #choices > 1,
  }
end

-- Takes the reward picked (or the only one) and finishes the quest. A quest that costs money asks first,
-- naming the cost, as the game's own Complete does; No declines the hand-in, as the game's does.
function QD.Complete()
  local choice, cost = QD.choice or (QD.page.choices and #QD.page.choices == 1 and 1) or 0, QP.Cost()
  -- Pays (when it costs) and takes the reward; no choice is 0, as the game's own window passes.
  local function take() ns.CallIf(_G, "GetQuestReward", choice) end
  if cost <= 0 then return take() end
  local text = ns.Format(L["Completing {quest} costs {money}. Complete it?"], { quest = QP.Plain(ns.CallIf(_G, "GetTitleText")), money = ns.GetModule("InfoStrip").Money(cost) })
  ns.Ask(text, L["Complete"], take, function() ns.CallIf(_G, "DeclineQuest") end)
end

-- Showing --------------------------------------------------------------------------------------

-- Gives the dialog the keyboard while it shows. Run out of combat: a key caught in a fight could not be
-- handed on to the game, so the dialog has no keys then.
local function takeKeys()
  QD.frame:EnableKeyboard(QD.frame:IsShown())
end

-- Shows a page (unless automation is about to answer it for you).
function QD.Show(key, event)
  local auto = ns.GetModule("QuestAuto")
  if auto and auto.Claims and auto.Claims(event) then return end
  if key == "gossip" and QD.SkipGossip() then return end
  QD.key, QD.page, QD.choice = key, QD.PAGES[key](), nil
  QD.Render(QD.page)
  QD.frame:Show()
  ns.OutOfCombat(takeKeys, "quest dialog keys")
end

-- The game finished loading an item's details: redraw the page (keeping a reward already picked).
function QD.Redraw()
  if not (QD.frame:IsShown() and QD.key) then return end
  local choice = QD.choice
  QD.page = QD.PAGES[QD.key]()
  QD.Render(QD.page)
  if choice then QD.Pick(choice) end
end

-- Event -> the page it shows.
QD.EVENTS = { GOSSIP_SHOW = "gossip", QUEST_GREETING = "greeting", QUEST_DETAIL = "detail", QUEST_PROGRESS = "progress", QUEST_COMPLETE = "complete" }

-- Takes the gossip and quest events away from the game's windows.
local function takeOver()
  for name, events in pairs(QD.TAKEN) do
    local f = _G[name]
    if type(f) == "table" and f.UnregisterEvent then
      for _, e in ipairs(events) do f:UnregisterEvent(e) end
    end
  end
end

-- A fight starts: the dialog lets go of the keyboard, and takes it back when the fight ends if it still shows.
local function releaseKeys()
  QD.frame:EnableKeyboard(false)
  ns.AfterCombat(takeKeys, "quest dialog keys")
end

-- An item's info arrived (a reward's sell price, say, which settles the crown): redraw on the next frame,
-- once for a burst.
local function itemArrived()
  ns.Soon("questdialog items", QD.Redraw)
end

-- Module entry point (Core/Modules.lua).
function QD.Enable(settings)
  if not settings.dialog then return end
  QD.Build()
  takeOver()
  for event, key in pairs(QD.EVENTS) do ns.On(event, function() QD.Show(key, event) end) end
  for _, event in ipairs({ "GOSSIP_CLOSED", "QUEST_FINISHED" }) do ns.On(event, QD.Quiet) end
  ns.On("PLAYER_REGEN_DISABLED", releaseKeys)
  ns.On("QUEST_ITEM_UPDATE", QD.Redraw)
  ns.On("GET_ITEM_INFO_RECEIVED", itemArrived)
end
