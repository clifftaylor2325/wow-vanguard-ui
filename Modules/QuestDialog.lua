-- ForeverUI's quest dialog: talking to a quest giver opens a panel sized to
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

-- Calls fn if it's a function; nil otherwise.
local function call(fn, ...)
  if type(fn) == "function" then return fn(...) end
end

-- Calls a C_GossipInfo function by name, if this client has it.
local function gossip(name, ...)
  return call(C_GossipInfo and C_GossipInfo[name], ...)
end
QD.Call, QD.Gossip = call, gossip

-- Lines ----------------------------------------------------------------------------------------

-- A quest you can take: "!", in its difficulty color.
local function availableLine(level, title, select)
  return { text = QP.Titled(level, title), icon = QP.ICONS.available, color = { QP.LevelColor(level) }, select = select, quest = true }
end

-- A quest you have: "?" in gold when ready to turn in, gray while still in progress.
local function activeLine(level, title, complete, select)
  local ready = not ns.IsSecret(complete) and complete == true
  return { text = QP.Titled(level, title), icon = ready and QP.ICONS.ready or QP.ICONS.active, color = ready and "gold" or "text2", select = select, quest = true }
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
  for _, q in ipairs(gossip("GetAvailableQuests") or {}) do out[#out + 1] = availableLine(q.questLevel, q.title, function() gossip("SelectAvailableQuest", q.questID) end) end
  for _, q in ipairs(gossip("GetActiveQuests") or {}) do out[#out + 1] = activeLine(q.questLevel, q.title, q.isComplete, function() gossip("SelectActiveQuest", q.questID) end) end
  for _, o in ipairs(sortedOptions()) do out[#out + 1] = optionLine(o) end
  return out
end

-- A quest giver's lines without gossip (the game's greeting window).
function QD.GreetingLines()
  local out = {}
  for i = 1, ns.PlainNumber(call(GetNumAvailableQuests)) or 0 do out[#out + 1] = availableLine(call(GetAvailableLevel, i), call(GetAvailableTitle, i), function() SelectAvailableQuest(i) end) end
  for i = 1, ns.PlainNumber(call(GetNumActiveQuests)) or 0 do
    local title, complete = call(GetActiveTitle, i)
    out[#out + 1] = activeLine(call(GetActiveLevel, i), title, complete, function() SelectActiveQuest(i) end)
  end
  return out
end

-- Rewards --------------------------------------------------------------------------------------

-- The quest's items of one kind ("choice", "reward" or "required").
function QD.Items(kind, count)
  local out = {}
  for i = 1, ns.PlainNumber(count) or 0 do
    local name, texture, n, quality = call(GetQuestItemInfo, kind, i)
    out[#out + 1] = { kind = kind, index = i, name = name, texture = texture, count = n, quality = quality }
  end
  return out
end

-- The money and XP a quest gives, as "+1g 20s 0c · 450 XP" ("" for none).
function QD.MoneyLine()
  local money, xp, parts = ns.PlainNumber(call(GetRewardMoney)), ns.PlainNumber(call(GetRewardXP)), {}
  if money and money > 0 then parts[#parts + 1] = "+" .. ns.GetModule("InfoStrip").Money(money) end
  if xp and xp > 0 then parts[#parts + 1] = xp .. " XP" end
  for _, extra in ipairs(QD.ExtraRewards(ns.PlainNumber(call(GetQuestID)))) do parts[#parts + 1] = extra end
  return table.concat(parts, "  ·  ")
end

-- The spells a quest teaches, as "Teaches: Name".
local function spellRewards(info, questID)
  local out = {}
  for _, spellID in ipairs(call(info.GetQuestRewardSpells, questID) or {}) do
    local spell = call(info.GetQuestRewardSpellInfo, questID, spellID)
    if type(spell) == "table" and spell.name then out[#out + 1] = "Teaches: " .. QP.Plain(spell.name) end
  end
  return out
end

-- A quest's spell and currency rewards as text ("Teaches: Name", "3 Marks"); none without the client's calls.
function QD.ExtraRewards(questID)
  local info = C_QuestInfoSystem
  if type(info) ~= "table" or not questID then return {} end
  local out = spellRewards(info, questID)
  for _, c in ipairs(call(info.GetQuestRewardCurrencies, questID) or {}) do
    out[#out + 1] = (ns.PlainNumber(c.totalRewardAmount) or 0) .. " " .. QP.Plain(c.name)
  end
  return out
end

-- Closing --------------------------------------------------------------------------------------

-- Ends the talk with the NPC (the game's own goodbye for gossip and quests).
local function closeGame()
  gossip("CloseGossip")
  call(CloseQuest)
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

-- Goodbye, as the main button of a page with nothing else to do.
local GOODBYE = { "Goodbye", function() QD.Close() end }

-- Each page: what it shows, from the game's current quest or gossip.
QD.PAGES = {
  -- A gossip NPC: its greeting and lines.
  gossip = function() return { text = gossip("GetText"), lines = QD.GossipLines(), primary = GOODBYE } end,
  -- A quest giver without gossip: its greeting and quests.
  greeting = function() return { text = call(GetGreetingText), lines = QD.GreetingLines(), primary = GOODBYE } end,
  -- A quest's details.
  detail = function() return QD.DetailPage() end,
  -- A quest being handed in.
  progress = function() return QD.ProgressPage() end,
  -- A quest's rewards.
  complete = function() return QD.CompletePage() end,
}

-- A quest's details: accept it (or acknowledge one the game already accepted), or decline.
function QD.DetailPage()
  local auto = call(QuestGetAutoAccept) == true
  return {
    title = call(GetTitleText), text = call(GetQuestText), objectives = call(GetObjectiveText),
    choices = QD.Items("choice", call(GetNumQuestChoices)), rewards = QD.Items("reward", call(GetNumQuestRewards)), money = QD.MoneyLine(),
    primary = auto and { "OK", function() call(AcknowledgeAutoAcceptQuest) end } or { "Accept", function() call(AcceptQuest) end },
    secondary = not auto and { "Decline", function() call(DeclineQuest) end } or nil,
  }
end

-- A quest you're turning in: what it still needs, and Continue once you have it.
function QD.ProgressPage()
  return {
    title = call(GetTitleText), text = call(GetProgressText), rewards = QD.Items("required", call(GetNumQuestItems)),
    primary = { "Continue", function() call(CompleteQuest) end, call(IsQuestCompletable) == true }, secondary = GOODBYE,
  }
end

-- A quest you're finishing: pick a reward (when there's a choice), then Complete.
function QD.CompletePage()
  local choices = QD.Items("choice", call(GetNumQuestChoices))
  return {
    title = call(GetTitleText), text = call(GetRewardText), choices = choices, rewards = QD.Items("reward", call(GetNumQuestRewards)),
    money = QD.MoneyLine(), primary = { "Complete", QD.Complete, #choices <= 1 }, pick = #choices > 1,
  }
end

-- Takes the reward picked (or the only one) and finishes the quest.
function QD.Complete()
  call(GetQuestReward, QD.choice or (QD.page.choices and #QD.page.choices == 1 and 1) or nil)
end

-- Showing --------------------------------------------------------------------------------------

-- Shows a page (unless automation is about to answer it for you).
function QD.Show(key, event)
  local auto = ns.GetModule("QuestAuto")
  if auto and auto.Claims and auto.Claims(event) then return end
  QD.key, QD.page, QD.choice = key, QD.PAGES[key](), nil
  QD.Render(QD.page)
  QD.frame:Show()
  QD.frame:EnableKeyboard(not ns.InCombat())
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

-- Module entry point (Core/Modules.lua).
function QD.Enable(settings)
  if not settings.dialog then return end
  QD.Build()
  takeOver()
  for event, key in pairs(QD.EVENTS) do ns.On(event, function() QD.Show(key, event) end) end
  for _, event in ipairs({ "GOSSIP_CLOSED", "QUEST_FINISHED" }) do ns.On(event, QD.Quiet) end
  ns.On("PLAYER_REGEN_DISABLED", function() QD.frame:EnableKeyboard(false) end)
  ns.On("QUEST_ITEM_UPDATE", QD.Redraw)
end
