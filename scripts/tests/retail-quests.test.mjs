// retail-quests: the quest tracker's Retail blocks (Modules/RetailQuests.lua) and Retail's quest timers, on the
// TEST-ONLY Retail client (RETAIL_CLIENT, with scripts/lib/wow-retail-quests.lua's stubs).

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { isTok, loggedIn, setCombat } from "./helpers.mjs";

// The tracker expanded, so every block has the room to show.
const EXPANDED = "VanguardDB.profiles = { Default = { QuestTracker = { expanded = true } } }";

// A logged-in Retail client with the tracker expanded; extra Lua runs before login.
const retail = (extra = "") => loggedIn(extra, { client: RETAIL_CLIENT, savedVariables: EXPANDED });

// Each drawn block as [title, lines] (a line's count after its text, as the tracker splits them).
const blocks = (addon) => Object.values(addon.eval(`local f = Vanguard_QuestTrackerFrame
  local out = {}
  for i = 1, f.blocks.used do
    local b, lines = f.blocks[i], {}
    for j = 1, b.lines.used do local l = b.lines[j] lines[j] = l.count:GetText() ~= "" and (l.text:GetText() .. " " .. l.count:GetText()) or l.text:GetText() end
    out[i] = { b.title:GetText(), lines }
  end
  return out`)).map(([title, lines]) => [title, Object.values(lines)]);

// The drawn titles alone.
const titles = (addon) => blocks(addon).map((b) => b[0]);

// Clicks the drawn block whose title is `title` with `button`.
const clickBlock = (addon, title, button) => addon.eval(`local f = Vanguard_QuestTrackerFrame
  for i = 1, f.blocks.used do local b = f.blocks[i] if b.title:GetText() == "${title}" then b.__scripts.OnClick(b, "${button}") end end`);

// Redraws the tracker after the world changed.
const redraw = (addon, event = "QUEST_LOG_UPDATE") => {
  addon.fire(event);
  addon.update(0);
};

// TEST-ONLY quests in the world's log: two watched plain quests and a watched campaign quest between them.
const QUESTS = `
  local w = __wfgWorld
  w.addQuest({ questID = 91001, title = "TEST-ONLY Boars", level = 70, watched = true, objectives = { { text = "2/6 TEST-ONLY Boars slain", finished = false } } })
  w.addQuest({ questID = 91002, title = "TEST-ONLY Crown", level = 70, watched = true, objectives = { { text = "0/1 TEST-ONLY Crown found", finished = false } } })
  w.addQuest({ questID = 91003, title = "TEST-ONLY Herbs", level = 70, watched = true, objectives = { { text = "1/4 TEST-ONLY Herbs", finished = false } } })
  w.campaignQuests[91002] = 501
  w.campaigns[501] = { name = "TEST-ONLY Campaign", chapter = { id = 77, name = "TEST-ONLY Ascent" } }
`;

it("retail quests: a watched campaign quest sits under its campaign and chapter, the rest under a Quests heading", () => {
  const addon = retail(QUESTS);
  expect(blocks(addon), "the campaign block first, then the other quests").toEqual([
    ["TEST-ONLY Campaign: TEST-ONLY Ascent", []], ["[70] TEST-ONLY Crown", ["TEST-ONLY Crown found 0/1"]],
    ["Quests", []], ["[70] TEST-ONLY Boars", ["TEST-ONLY Boars slain 2/6"]], ["[70] TEST-ONLY Herbs", ["TEST-ONLY Herbs 1/4"]]]);
  expect(addon.eval("return Vanguard_QuestTrackerFrame.count:GetText()"), "the count still counts every watched quest").toBe("3");
  addon.eval("__wfgWorld.campaigns[501].chapter = nil");
  redraw(addon);
  expect(titles(addon)[0], "no chapter: the campaign's name alone").toBe("TEST-ONLY Campaign");
  addon.eval("__wfgWorld.campaigns[501] = nil");
  redraw(addon);
  expect(titles(addon)[0], "a campaign the client can't name: Campaign").toBe("Campaign");
  addon.eval("__wfgWorld.campaignQuests = {}");
  redraw(addon);
  expect(titles(addon), "no campaign quest: the plain list, with no heading").toEqual(["[70] TEST-ONLY Boars", "[70] TEST-ONLY Crown", "[70] TEST-ONLY Herbs"]);
});

it("retail quests: a campaign quest is still a quest: a click opens it in the quest log", () => {
  const addon = retail(QUESTS);
  clickBlock(addon, "[70] TEST-ONLY Crown", "LeftButton");
  expect(addon.eval("return ns.GetModule('QuestLog').selected"), "the quest log has it").toBe(91002);
});

// TEST-ONLY scenario: stage 2 of 3, a counted criterion, a done one, a weighted one with the game's own text,
// one the client hides and one with no text.
const SCENARIO = `
  __wfgWorld.scenario = { name = "TEST-ONLY Delve", currentStage = 2, numStages = 3,
    step = { title = "TEST-ONLY The Crypt", numCriteria = 5 },
    criteria = {
      { description = "TEST-ONLY Cultists slain", quantity = 2, totalQuantity = 5, completed = false },
      { description = "TEST-ONLY Gate opened", quantity = 1, totalQuantity = 1, completed = true },
      { description = "TEST-ONLY Enemy forces", quantity = 40, totalQuantity = 100, isWeightedProgress = true, completed = false },
      __wfgWorld.secret(1),
      { description = __wfgWorld.secret("hidden"), quantity = 0, totalQuantity = 1 },
    } }
`;

it("retail quests: the scenario you are in shows on top under its name, its stage and criteria", () => {
  const addon = retail(SCENARIO);
  expect(blocks(addon), "the heading, then the stage with its criteria; a hidden criterion is left out").toEqual([
    ["TEST-ONLY Delve", []], ["Stage 2/3: TEST-ONLY The Crypt", ["TEST-ONLY Cultists slain 2/5", "TEST-ONLY Gate opened 1/1", "TEST-ONLY Enemy forces 40%"]]]);
  expect(isTok(addon, addon.eval("return Vanguard_QuestTrackerFrame.blocks[2].lines[2].text.__textColor"), "muted"), "a done criterion is muted, as a done objective").toBe(true);
  addon.eval("__wfgWorld.scenario.numStages = 1 __wfgWorld.scenario.currentStage = 1 __wfgWorld.scenario.step = { numCriteria = 0 } __wfgWorld.scenario.name = ''");
  redraw(addon, "SCENARIO_UPDATE");
  expect(blocks(addon), "one stage and no names: Scenario, twice, as heading and stage").toEqual([["Scenario", []], ["Scenario", []]]);
  addon.eval("__wfgWorld.scenario.currentStage = 2");
  redraw(addon, "SCENARIO_COMPLETED");
  expect(addon.eval("return Vanguard_QuestTrackerFrame:IsShown()"), "past its last stage: nothing to track, the tracker hides").toBe(false);
});

it("retail quests: a timed scenario criterion has its countdown under it, ticking each second", () => {
  const addon = retail(`__wfgWorld.scenario = { name = "TEST-ONLY Delve", currentStage = 1, numStages = 2,
    step = { title = "TEST-ONLY Hold", numCriteria = 1 },
    criteria = { { description = "TEST-ONLY Survive", quantity = 0, totalQuantity = 1, completed = false, duration = 180, elapsed = 60 } } }`);
  expect(blocks(addon)[1][1], "the criterion, then its countdown").toEqual(["TEST-ONLY Survive 0/1", "Time left 2:00"]);
  addon.eval("__wfgWorld.scenario.criteria[1].elapsed = 61");
  addon.advance(1, 1);
  expect(blocks(addon)[1][1][1], "a second on: redrawn without an event").toBe("Time left 1:59");
  addon.eval("__wfgWorld.scenario.criteria[1].elapsed = 181");
  addon.advance(1, 1);
  expect(blocks(addon)[1][1], "run out: no line").toEqual(["TEST-ONLY Survive 0/1"]);
  addon.eval("__wfgWorld.scenario.criteria[1].elapsed = 5 __wfgWorld.scenario.criteria[1].duration = __wfgWorld.secret(180)");
  redraw(addon, "SCENARIO_CRITERIA_UPDATE");
  expect(blocks(addon)[1][1], "a hidden limit: no line").toEqual(["TEST-ONLY Survive 0/1"]);
});

it("retail quests: a scenario's hidden stage draws nothing, and a hover shows no clicks line for it", () => {
  const addon = retail(SCENARIO);
  addon.eval("local b = Vanguard_QuestTrackerFrame.blocks[2] b.__scripts.OnClick(b, 'LeftButton') ns.GetModule('QuestTracker').TitleTooltip(b)");
  const tip = Object.values(addon.eval("local t = {} for i, l in ipairs(GameTooltip.__lines) do t[i] = l.text end return t"));
  expect([tip.length, tip[0], tip.some((line) => /Click/.test(line))], "the stage and its three criteria, no clicks line").toEqual([4, "Stage 2/3: TEST-ONLY The Crypt", false]);
  addon.eval("__wfgWorld.scenario.currentStage = __wfgWorld.secret(2)");
  redraw(addon, "SCENARIO_CRITERIA_UPDATE");
  expect(addon.eval("return Vanguard_QuestTrackerFrame:IsShown()"), "a hidden stage: nothing drawn, nothing errors").toBe(false);
});

// TEST-ONLY tasks: a world quest and a bonus objective in your area, a world quest you watch elsewhere, one in
// your area you also watch, a task without objectives, and one the client can't name.
const TASKS = `
  __wfgWorld.tasks = {
    { questID = 92001, title = "TEST-ONLY Storm Spirits", inArea = true, world = true, zone = 2248, objectives = { { text = "3/10 TEST-ONLY Spirits", finished = false } } },
    { questID = 92002, name = "TEST-ONLY Clear the Mine", inArea = true, world = false, objectives = { { text = "40% TEST-ONLY Mine cleared", finished = false } } },
    { questID = 92003, title = "TEST-ONLY Far Rares", inArea = false, world = true, watched = true, zone = 2214, objectives = { { text = "0/1 TEST-ONLY Rare slain", finished = false } } },
    { questID = 92004, title = "TEST-ONLY Both", inArea = true, world = true, watched = true, objectives = { { text = "0/2 TEST-ONLY Both", finished = false } } },
    { questID = 92005, title = "TEST-ONLY Empty", inArea = true, world = false, objectives = {} },
    { questID = 92006, inArea = true, world = true, objectives = { { text = "0/1 TEST-ONLY Nameless", finished = false } } },
  }
`;

it("retail quests: world quests in your area then those you watch, each once, and the area's bonus objectives", () => {
  const addon = retail(TASKS);
  expect(blocks(addon), "Bonus objectives, then World quests (the area's first); no empty task, no nameless one").toEqual([
    ["Bonus objectives", []], ["TEST-ONLY Clear the Mine", ["40% TEST-ONLY Mine cleared"]], ["World quests", []],
    ["TEST-ONLY Storm Spirits", ["TEST-ONLY Spirits 3/10"]], ["TEST-ONLY Both", ["TEST-ONLY Both 0/2"]], ["TEST-ONLY Far Rares", ["TEST-ONLY Rare slain 0/1"]]]);
  expect(isTok(addon, addon.eval("return Vanguard_QuestTrackerFrame.blocks[4].title.__textColor"), "text"), "a world quest's title in the text color").toBe(true);
});

it("retail quests: a world quest's click opens the map on its zone (after a fight), right-click stops watching it", () => {
  const addon = retail(TASKS);
  clickBlock(addon, "TEST-ONLY Far Rares", "LeftButton");
  expect(addon.eval("return __wfgWorld.openedMap"), "the map opens on its zone").toBe(2214);
  setCombat(addon, true);
  addon.eval("__wfgWorld.openedMap = nil");
  clickBlock(addon, "TEST-ONLY Far Rares", "LeftButton");
  expect(addon.eval("return __wfgWorld.openedMap"), "not in a fight").toBeNull();
  setCombat(addon, false);
  clickBlock(addon, "TEST-ONLY Far Rares", "RightButton");
  addon.update(0);
  expect(titles(addon), "unwatched, it goes; the area's stay").not.toContain("TEST-ONLY Far Rares");
  clickBlock(addon, "TEST-ONLY Clear the Mine", "RightButton");
  expect(titles(addon), "a bonus objective takes no clicks").toContain("TEST-ONLY Clear the Mine");
  // The last tooltip line of the drawn block titled `title`.
  const clicksLine = (title) => addon.eval(`local f = Vanguard_QuestTrackerFrame
    for i = 1, f.blocks.used do local b = f.blocks[i] if b.title:GetText() == "${title}" then ns.GetModule('QuestTracker').TitleTooltip(b) end end
    return GameTooltip.__lines[#GameTooltip.__lines].text`);
  expect(clicksLine("TEST-ONLY Both"), "a watched one's tooltip says what the clicks do").toBe("Click: show on the map · Right-click: stop watching");
  expect(clicksLine("TEST-ONLY Storm Spirits"), "one only in your area has nothing to stop watching").toBe("Click: show on the map");
  clickBlock(addon, "TEST-ONLY Storm Spirits", "LeftButton");
  expect(addon.eval("return __wfgWorld.openedMap"), "and its click opens the map on its zone too").toBe(2248);
});

// TEST-ONLY Traveler's Log: a tracked activity with one requirement left, a finished one, and one not tracked.
const ACTIVITIES = `
  __wfgWorld.activities = {
    [301] = { ID = 301, activityName = "TEST-ONLY Run Dungeons", completed = false, requirementsList = {
      { completed = false, requirementText = "2 / 5 TEST-ONLY Dungeons" }, { completed = true, requirementText = "1 / 1 TEST-ONLY Done" }, __wfgWorld.secret(1) } },
    [302] = { ID = 302, activityName = "TEST-ONLY Finished", completed = true, requirementsList = {} },
    [303] = { ID = 303, activityName = "TEST-ONLY Untracked", completed = false, requirementsList = {} },
  }
  __wfgWorld.trackedActivities = { 301, 302, __wfgWorld.secret(303) }
`;

it("retail quests: tracked Traveler's Log activities with what they still ask; right-click stops tracking", () => {
  const addon = retail(ACTIVITIES);
  expect(blocks(addon), "the unfinished tracked activity, its spaced slash closed up, its done step and a hidden id left out").toEqual([
    ["Traveler's Log", []], ["TEST-ONLY Run Dungeons", ["TEST-ONLY Dungeons 2/5"]]]);
  clickBlock(addon, "TEST-ONLY Run Dungeons", "LeftButton");
  expect(addon.eval("return #__wfgWorld.trackedActivities"), "a left-click does nothing").toBe(3);
  clickBlock(addon, "TEST-ONLY Run Dungeons", "RightButton");
  addon.update(0);
  expect([addon.eval("return #__wfgWorld.trackedActivities"), addon.eval("return Vanguard_QuestTrackerFrame:IsShown()")], "untracked: the block goes").toEqual([2, false]);
});

it("retail quests: every block together, in the game's tracker's order", () => {
  const addon = retail(SCENARIO + QUESTS + TASKS + ACTIVITIES + ACHIEVEMENTS);
  const headings = addon.eval(`local QT = ns.GetModule("QuestTracker") local out = {}
    for _, r in ipairs(QT.Rows((QT.Quests()))) do if r.section then out[#out + 1] = r.section end end return out`);
  expect(Object.values(headings), "the headings in order").toEqual(
    ["TEST-ONLY Delve", "TEST-ONLY Campaign: TEST-ONLY Ascent", "Quests", "Achievements", "Traveler's Log", "Bonus objectives", "World quests"]);
});

it("retail quests: collections follow the quests and Endeavors follow the Traveler's Log, before bonus objectives", () => {
  const addon = retail(QUESTS + TASKS + ACTIVITIES + ACHIEVEMENTS + COLLECTABLES + ENDEAVORS);
  const headings = addon.eval(`local QT = ns.GetModule("QuestTracker") local out = {}
    for _, r in ipairs(QT.Rows((QT.Quests()))) do if r.section then out[#out + 1] = r.section end end return out`);
  expect(Object.values(headings), "the headings in order").toEqual(
    ["TEST-ONLY Campaign: TEST-ONLY Ascent", "Quests", "Collections", "Achievements", "Traveler's Log", "Endeavors", "Bonus objectives", "World quests"]);
});

it("retail quests: without the Retail calls (a hidden answer or none) the blocks draw nothing and nothing errors", () => {
  const addon = retail("C_ScenarioInfo = nil C_CampaignInfo = nil C_TaskQuest = nil C_PerksActivities = nil GetTasksTable = nil GetTaskInfo = nil" + QUESTS);
  expect(titles(addon), "the plain quest list").toEqual(["[70] TEST-ONLY Boars", "[70] TEST-ONLY Crown", "[70] TEST-ONLY Herbs"]);
  const hidden = retail("C_PerksActivities.GetTrackedPerksActivities = function() return { trackedIDs = __wfgWorld.secret(1) } end" + ACTIVITIES);
  expect(hidden.eval("return Vanguard_QuestTrackerFrame:IsShown()"), "a hidden tracked list: nothing").toBe(false);
});

// A watched timed quest in the world's log with `total` seconds allowed and `gone` used.
const timedQuest = (addon, total, gone) => {
  addon.world.addQuest({ questID: 93001, title: "TEST-ONLY Hurry", level: 70, watched: true, objectives: [{ text: "0/1 TEST-ONLY Parcel", finished: false }] });
  addon.eval(`__wfgWorld.setTimeAllowed(93001, ${total}, ${gone})`);
  addon.update(0);
};

it("retail quests: a timed quest counts down from the game's time allowed, once a second, and stops when it runs out", () => {
  const addon = retail();
  timedQuest(addon, 300, 28);
  expect(blocks(addon)[0], "time left is the whole time less what is gone").toEqual(["[70] TEST-ONLY Hurry", ["Time left 4:32", "TEST-ONLY Parcel 0/1"]]);
  addon.advance(2);
  expect(blocks(addon)[0][1][0], "two seconds later").toBe("Time left 4:30");
  addon.advance(271);
  expect(blocks(addon)[0][1], "run out: the line goes").toEqual(["TEST-ONLY Parcel 0/1"]);
  addon.eval("__wfgWorld.setTimeAllowed(93001, __wfgWorld.secret(300), 0)");
  addon.update(0);
  expect(blocks(addon)[0][1], "a hidden timer: no line, no error").toEqual(["TEST-ONLY Parcel 0/1"]);
});

// TEST-ONLY currency reward choice: the second of three choices is a currency (loot type 1) the client names
// through its currency calls, as Retail's quest frame reads them.
const CURRENCY_CHOICE = `
  GetQuestItemInfoLootType = function(kind, i) return i == 2 and 1 or 0 end
  C_QuestOffer = { GetQuestRewardCurrencyInfo = function(kind, i) if kind == "choice" and i == 2 then return { currencyID = 1, name = "TEST-ONLY Marks", texture = "TEST-ONLY-ICON", quality = 2, totalRewardAmount = 30 } end end }
`;

it("retail quests: a currency reward choice is a named card in the dialog, hovered as a currency and picked by its slot", () => {
  const addon = retail(CURRENCY_CHOICE);
  addon.eval(`__wfgWorld.openNpc({ quest = { title = "TEST-ONLY Pay", questID = 91050, text = "x", complete = true, choices = { { name = "TEST-ONLY Boots" }, { currency = true }, { name = "TEST-ONLY Cloak" } } } })`);
  const names = addon.eval("local f, out = Vanguard_QuestDialog, {} for i = 1, f.cards.used do out[i] = f.cards[i].name:GetText() end return out");
  expect(Object.values(names), "the currency's card has its name").toEqual(["TEST-ONLY Boots", "TEST-ONLY Marks", "TEST-ONLY Cloak"]);
  addon.eval("local c = Vanguard_QuestDialog.cards[2] c.__scripts.OnEnter(c)");
  expect(addon.eval("return GameTooltip.__questCurrency"), "its tooltip is the currency's, by the overall slot").toBe("choice 2");
  addon.eval("local QD = ns.GetModule('QuestDialog') QD.Pick(2) QD.Complete()");
  expect(addon.eval("return __wfgWorld.rewardChosen"), "picking it hands in the overall slot").toBe(2);
  expect(addon.eval("return ns.QuestParts.TopChoice(ns.GetModule('QuestDialog').CompletePage().choices)"), "no crown on a section holding a currency").toBe(null);
});

it("retail quests: the quest log lists a currency reward choice, with each type's own count for the tooltip", () => {
  const addon = retail(CURRENCY_CHOICE + `
    __wfgWorld.addQuest({ questID = 91051, title = "TEST-ONLY Pay", level = 70 })
    GetQuestLogChoiceInfoLootType = function(i) return i == 2 and 1 or 0 end
    GetNumQuestLogChoices = function(id, withCurrency) return withCurrency and 3 or 2 end
    GetQuestLogChoiceInfo = function(i) return "TEST-ONLY Item " .. i, "TEST-ONLY-ICON", 1, 1 end
    C_QuestLog.GetQuestRewardCurrencyInfo = function(id, i, isChoice) if id == 91051 and i == 2 and isChoice then return { currencyID = 1, name = "TEST-ONLY Marks", texture = "TEST-ONLY-ICON", quality = 2, totalRewardAmount = 30 } end end
  `);
  const rewards = addon.eval("return ns.GetModule('QuestLog').Details(91051).rewards");
  expect(Object.values(rewards).map((r) => r.name), "items and the currency, in the game's order").toEqual(["TEST-ONLY Item 1", "TEST-ONLY Marks", "TEST-ONLY Item 3"]);
  addon.eval("local QP, r = ns.QuestParts, ns.GetModule('QuestLog').Details(91051).rewards QP.ItemTooltip({ item = r[2] }) QP.ItemTooltip({ item = r[3] })");
  expect(addon.eval("return { GameTooltip.__questLogCurrency, GameTooltip.__questLogItem }"), "the currency is the first of its type, the last item the second of its own").toEqual(["choice 1", "choice 2 91051"]);
});

// TEST-ONLY tracked achievements: one with no criteria, one earned by you, one with a criterion.
const ACHIEVEMENTS = `
  local tracked = C_ContentTracking.GetTrackedIDs
  C_ContentTracking.GetTrackedIDs = function(kind) return kind == 2 and { 8001, 8002, 8003 } or tracked(kind) end
  local info = { [8001] = { "TEST-ONLY Feat", false, "TEST-ONLY Do the feat", false }, [8002] = { "TEST-ONLY Earned", true, "x", true }, [8003] = { "TEST-ONLY Meta", false, "y", false } }
  GetAchievementInfo = function(id) local a = info[id] if a then return id, a[1], 10, a[2], 1, 1, 1, a[3], 0, "TEST-ONLY-ICON", "", false, a[4] end end
  GetAchievementNumCriteria = function(id) return id == 8003 and 1 or 0 end
  GetAchievementCriteriaInfo = function() return "TEST-ONLY Step", 0, false end
`;

it("retail quests: tracked achievements sit under an Achievements heading, a bare one shows its description, an earned one is gone", () => {
  const addon = retail(ACHIEVEMENTS);
  expect(blocks(addon), "the Retail heading, the description line, the criterion; the earned one left out").toEqual([
    ["Achievements", []], ["TEST-ONLY Feat", ["TEST-ONLY Do the feat"]], ["TEST-ONLY Meta", ["TEST-ONLY Step"]]]);
});

// TEST-ONLY tracked collectables: an appearance with a source, a decor piece still loading its text, one with no
// target, one whose title the client hides, and a hidden id.
const COLLECTABLES = `
  local w = __wfgWorld
  w.collectables[0] = { { id = 501, title = "TEST-ONLY Helm", target = { 4, 9001 }, objective = "TEST-ONLY Drops from the Boss" },
    { id = 502, title = "TEST-ONLY No Target" }, { id = 503, title = w.secret("hidden"), target = { 4, 9003 } } }
  w.collectables[3] = { { id = 601, title = "TEST-ONLY Lamp", target = { 5, 9002 } } }
`;

it("retail quests: tracked appearances and decor show under Collections with their source; right-click stops tracking", () => {
  const addon = retail(COLLECTABLES);
  expect(blocks(addon), "the appearance with its source line, the decor without one; no target and a hidden title left out").toEqual([
    ["Collections", []], ["TEST-ONLY Helm", ["TEST-ONLY Drops from the Boss"]], ["TEST-ONLY Lamp", []]]);
  clickBlock(addon, "TEST-ONLY Helm", "LeftButton");
  expect(addon.eval("return #__wfgWorld.stopped"), "a left-click does nothing").toBe(0);
  clickBlock(addon, "TEST-ONLY Lamp", "RightButton");
  addon.update(0);
  expect(addon.eval("return __wfgWorld.stopped"), "stopped by hand, with its type").toEqual([[3, 601, 2]]);
  expect(titles(addon), "the stopped one goes").not.toContain("TEST-ONLY Lamp");
  expect(retail("C_ContentTracking = nil" + COLLECTABLES).eval("return Vanguard_QuestTrackerFrame:IsShown()"), "no content tracking: nothing").toBe(false);
  const hidden = retail("C_ContentTracking.GetCollectableSourceTypes = function() return { __wfgWorld.secret(0), 0 } end C_ContentTracking.GetTrackedIDs = function() return { __wfgWorld.secret(1) } end" + COLLECTABLES);
  expect(hidden.eval("return Vanguard_QuestTrackerFrame:IsShown()"), "hidden types and ids: nothing").toBe(false);
  addon.eval("ns.RetailQuests.OnCollectable(1, 'RightButton')");
  expect(addon.eval("return #__wfgWorld.stopped"), "a click with no row stops nothing").toBe(1);
});

// TEST-ONLY tracked Housing Endeavor tasks: one with a done and an open requirement, a completed one, a nameless one.
const ENDEAVORS = `
  local w = __wfgWorld
  w.endeavors = {
    [701] = { taskName = "TEST-ONLY Gather Wood", completed = false, requirementsList = {
      { completed = false, requirementText = "3 / 9 TEST-ONLY Logs" }, { completed = true, requirementText = "1 / 1 TEST-ONLY Done" }, w.secret(1) } },
    [702] = { taskName = "TEST-ONLY Finished", completed = true, requirementsList = {} },
    [703] = { taskName = "", completed = false, requirementsList = {} },
  }
  w.trackedEndeavors = { 701, 702, 703, w.secret(704) }
`;

it("retail quests: tracked Housing Endeavor tasks show what they still ask; right-click stops tracking", () => {
  const addon = retail(ENDEAVORS);
  expect(blocks(addon), "the open task, its spaced slash closed up; a finished, a nameless and a hidden one left out").toEqual([
    ["Endeavors", []], ["TEST-ONLY Gather Wood", ["TEST-ONLY Logs 3/9"]]]);
  clickBlock(addon, "TEST-ONLY Gather Wood", "LeftButton");
  expect(addon.eval("return #__wfgWorld.trackedEndeavors"), "a left-click does nothing").toBe(4);
  clickBlock(addon, "TEST-ONLY Gather Wood", "RightButton");
  addon.update(0);
  expect(addon.eval("return #__wfgWorld.trackedEndeavors"), "untracked").toBe(3);
  expect(retail("C_NeighborhoodInitiative = nil" + ENDEAVORS).eval("return Vanguard_QuestTrackerFrame:IsShown()"), "no Endeavors calls: nothing").toBe(false);
  const hidden = retail("C_NeighborhoodInitiative.GetTrackedInitiativeTasks = function() return { trackedIDs = __wfgWorld.secret(1) } end" + ENDEAVORS);
  expect(hidden.eval("return Vanguard_QuestTrackerFrame:IsShown()"), "a hidden tracked list: nothing").toBe(false);
});

// TEST-ONLY item buttons for tasks: the bonus objective (92002) and the world quest (92001) are in the log, each
// with a quest item that goes once the quest is ready; the world quest is also ready-proof (the game keeps it).
const TASK_ITEMS = `
  local w = __wfgWorld
  w.addQuest({ questID = 92001, title = "TEST-ONLY Storm Spirits", level = 70, objectives = {} })
  w.addQuest({ questID = 92002, title = "TEST-ONLY Clear the Mine", level = 70, objectives = {} })
  w.ready = {}
  C_QuestLog.ReadyForTurnIn = function(id) return w.ready[id] == true end
  GetQuestLogSpecialItemInfo = function(index)
    local id = C_QuestLog.GetInfo(index).questID
    return "|Hitem:" .. id .. "|h[TEST-ONLY Tool]|h", "TEST-ONLY-ICON", 0, id == 92001
  end
`;

// Each shown item button's quest.
const shownItems = (addon) => Object.values(addon.eval(`local out = {}
  for _, b in ipairs(ns.GetModule("QuestTracker").items) do if b:IsShown() then out[#out + 1] = b.questID end end return out`));

it("retail quests: a world quest and a bonus objective with a usable item get its button, which goes with the task", () => {
  const addon = retail(TASKS + TASK_ITEMS);
  expect(shownItems(addon).sort(), "one button per task").toEqual([92001, 92002]);
  addon.eval("__wfgWorld.ready[92001] = true __wfgWorld.ready[92002] = true");
  redraw(addon);
  expect(shownItems(addon), "ready: only the item the game keeps showing").toEqual([92001]);
  addon.eval("__wfgWorld.tasks[1].inArea = false __wfgWorld.tasks[2].inArea = false");
  redraw(addon);
  expect(shownItems(addon), "the tasks leave the area: no buttons").toEqual([]);
});

it("retail quests: a weighted stage shows its description with its percent, a hidden percent falls back to the criteria", () => {
  const addon = retail(`__wfgWorld.scenario = { name = "TEST-ONLY Delve", currentStage = 1, numStages = 2,
    step = { title = "TEST-ONLY Hold", description = "TEST-ONLY Hold the line", numCriteria = 1, weightedProgress = 45.7 },
    criteria = { { description = "TEST-ONLY Wave", quantity = 1, totalQuantity = 3, completed = false } } }`);
  expect(blocks(addon)[1], "the description with the percent, no criteria").toEqual(["Stage 1/2: TEST-ONLY Hold", ["TEST-ONLY Hold the line 45%"]]);
  addon.eval("__wfgWorld.scenario.step.weightedProgress = __wfgWorld.secret(45)");
  redraw(addon, "SCENARIO_UPDATE");
  expect(blocks(addon)[1][1], "a hidden percent: the criteria").toEqual(["TEST-ONLY Wave 1/3"]);
  addon.eval("__wfgWorld.scenario.step.weightedProgress = 45 __wfgWorld.scenario.step.description = ''");
  redraw(addon, "SCENARIO_UPDATE");
  expect(blocks(addon)[1][1], "no description: the criteria").toEqual(["TEST-ONLY Wave 1/3"]);
});

// TEST-ONLY recipe with a two-rank reagent slot (rank 1 item 90201, rank 2 item 90202, 4 needed).
const RANK_ENV = `
  __wfgWorld.items[90201] = { name = "TEST-ONLY Ore", icon = "TEST-ONLY-ICON", quality = 1 }
  __wfgWorld.items[90202] = { name = "TEST-ONLY Ore R2", icon = "TEST-ONLY-ICON", quality = 1 }
  __wfgWorld.recipes[90200] = { recipeID = 90200, name = "TEST-ONLY Ingot", reagentSlotSchematics = {
    { reagents = { { itemID = 90201 }, { itemID = 90202 } }, quantityRequired = 4, reagentType = 1 } } }
  __wfgWorld.trackRecipe(90200)
`;
it("retail quest tracker: a tracked recipe counts every quality rank and the banks, as the game's tracker does", () => {
  const addon = retail(RANK_ENV);
  addon.eval("__wfgWorld.bags[1][1] = { itemID = 90202, count = 3 }");
  redraw(addon, "BAG_UPDATE_DELAYED");
  expect(blocks(addon).slice(-1), "rank 2 in the bags counts for the slot").toEqual([["TEST-ONLY Ingot", ["TEST-ONLY Ore 3/4"]]]);
  addon.eval("__wfgWorld.warbandCounts[90201] = 1");
  redraw(addon, "BAG_UPDATE_DELAYED");
  expect(blocks(addon).slice(-1)[0][1], "a rank in the warband bank counts too").toEqual(["TEST-ONLY Ore 4/4"]);
  const done = addon.eval("local f = Vanguard_QuestTrackerFrame local b = f.blocks[f.blocks.used] return b.lines[1].text.__textColor");
  expect(isTok(addon, done, "muted"), "and the line is done").toBe(true);
});
it("retail quest tracker: a tracked recraft is drawn as 'Recrafting: Name' with its reagents, takes no left-click, and untracks as a recraft", () => {
  const addon = retail(RANK_ENV + "\n__wfgWorld.recraftTracked = { 90300 } __wfgWorld.recipes[90300] = { recipeID = 90300, name = 'TEST-ONLY Helm', reagentSlotSchematics = { { reagents = { { itemID = 90201 } }, quantityRequired = 2, reagentType = 1 } } }");
  redraw(addon, "TRACKED_RECIPE_UPDATE");
  expect(blocks(addon).slice(-3), "the recraft sits first under the heading, then the plain recipe").toEqual([
    ["Recipes", []], ["Recrafting: TEST-ONLY Helm", ["TEST-ONLY Ore 0/2"]], ["TEST-ONLY Ingot", ["TEST-ONLY Ore 0/4"]]]);
  clickBlock(addon, "Recrafting: TEST-ONLY Helm", "LeftButton");
  expect(addon.eval("return __wfgWorld.openedRecipe"), "a left-click on a recraft opens nothing").toBe(null);
  clickBlock(addon, "TEST-ONLY Ingot", "RightButton");
  expect(addon.eval("local c = __wfgWorld.lastTrackCall return { c[1], c[2], c[3] }"), "a plain recipe untracks as one").toEqual([90200, false, false]);
  clickBlock(addon, "Recrafting: TEST-ONLY Helm", "RightButton");
  expect(addon.eval("local c = __wfgWorld.lastTrackCall return { c[1], c[2], c[3] }"), "a recraft untracks as a recraft").toEqual([90300, false, true]);
  addon.eval("__wfgStub.hover(Vanguard_QuestTrackerFrame.blocks[2])");
  const lines = addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines or {}) do out[i] = l.text end return out");
  expect(lines[lines.length - 1], "its tooltip names the one click").toBe("Right-click: stop tracking");
});

// TEST-ONLY scenario stage that gives two spells, the second also on a cooldown the client reports.
const STAGE_SPELLS = `
  __wfgWorld.spells[91501] = { name = "TEST-ONLY Free Prisoner", icon = "TEST-ONLY-ICON-Free" }
  __wfgWorld.spells[91502] = { name = "TEST-ONLY Light Beacon", icon = "TEST-ONLY-ICON-Beacon" }
  __wfgWorld.scenario = { name = "TEST-ONLY Scen", currentStage = 1, numStages = 1,
    step = { title = "TEST-ONLY Rescue", numCriteria = 1, spells = { { spellID = 91501 }, { spellID = 91502 } } },
    criteria = { { description = "TEST-ONLY Prisoners freed", quantity = 1, totalQuantity = 3, completed = false } } }
  C_Spell.GetSpellCooldown = function(id) if id == 91502 then return { startTime = 5, duration = 30 } end return { startTime = 0, duration = 0 } end
`;

// Each shown item button as [type, the spell it casts, the title of the block beside it, its cooldown start].
const spellButtons = (addon) => Object.values(addon.eval(`local out = {}
  for _, b in ipairs(ns.GetModule("QuestTracker").items) do if b:IsShown() then
    out[#out + 1] = { b:GetAttribute("type"), b:GetAttribute("spell"), b.__points.TOPRIGHT.rel.title:GetText(), (b.cooldown.__cooldown or {})[1] or false }
  end end
  return out`)).map((b) => Object.values(b));

it("retail quests: a scenario stage's spells each get a row under the stage and a button beside it that casts the spell", () => {
  const addon = retail(STAGE_SPELLS);
  expect(titles(addon), "the stage, then one row per spell").toEqual(["TEST-ONLY Scen", "TEST-ONLY Rescue", "TEST-ONLY Free Prisoner", "TEST-ONLY Light Beacon"]);
  expect(spellButtons(addon), "secure spell buttons by id, the second showing its cooldown").toEqual([
    ["spell", 91501, "TEST-ONLY Free Prisoner", false], ["spell", 91502, "TEST-ONLY Light Beacon", 5]]);
  expect(addon.eval("local b = Vanguard_QuestItem1 b:GetScript('OnEnter')(b) return { GameTooltip.__spellId, GameTooltip:IsShown(), b.icon.__texture }"),
    "a hover shows the spell's tooltip; the icon is the spell's").toEqual([91501, true, "TEST-ONLY-ICON-Free"]);
  addon.eval("C_Spell.GetSpellCooldown = function() return { startTime = 9, duration = 30 } end");
  addon.fire("SPELL_UPDATE_COOLDOWN");
  expect(spellButtons(addon)[0][3], "a spell cooldown event repaints the cooldown").toBe(9);
  addon.eval("C_Spell.GetSpellCooldown = function() return __wfgWorld.secret(1) end");
  addon.fire("SPELL_UPDATE_COOLDOWN");
  expect(spellButtons(addon)[0][3], "a hidden cooldown table: no swipe").toBe(false);
  expect(addon.eval("local QT = ns.GetModule('QuestTracker') QT.UpdateRange(Vanguard_QuestItem1) return { Vanguard_QuestItem1.icon:GetVertexColor() }"),
    "no range check for a spell: the icon stays white").toEqual([1, 1, 1, 1]);
});

it("retail quests: a stage's spell list or spell id the client hides, or a stage drawn as one bar, gets no spell rows", () => {
  const addon = retail(STAGE_SPELLS);
  addon.eval("__wfgWorld.scenario.step.spells = __wfgWorld.secret(1)");
  redraw(addon, "SCENARIO_SPELL_UPDATE");
  expect([titles(addon), spellButtons(addon)], "a hidden list: the stage alone, no button").toEqual([["TEST-ONLY Scen", "TEST-ONLY Rescue"], []]);
  addon.eval("__wfgWorld.scenario.step.spells = { { spellID = __wfgWorld.secret(91501) }, __wfgWorld.secret(2) }");
  redraw(addon, "SCENARIO_SPELL_UPDATE");
  expect(titles(addon), "a hidden id or entry: no row").toEqual(["TEST-ONLY Scen", "TEST-ONLY Rescue"]);
  addon.eval("__wfgWorld.scenario.step.spells = { { spellID = 91501 } } __wfgWorld.scenario.step.description = 'TEST-ONLY Hold' __wfgWorld.scenario.step.weightedProgress = 40");
  redraw(addon, "SCENARIO_SPELL_UPDATE");
  expect([titles(addon), spellButtons(addon)], "drawn as one bar: no spell row, as in the game's tracker").toEqual([["TEST-ONLY Scen", "TEST-ONLY Rescue"], []]);
  addon.eval("__wfgWorld.scenario.step.weightedProgress = __wfgWorld.secret(40)");
  redraw(addon, "SCENARIO_SPELL_UPDATE");
  expect(spellButtons(addon), "a hidden percent still counts as a bar: no button").toEqual([]);
});

it("retail quests: a stage spell given in a fight gets its row at once and its button once the fight ends", () => {
  const addon = retail(STAGE_SPELLS.replace("spells = { { spellID = 91501 }, { spellID = 91502 } }", "spells = {}"));
  setCombat(addon, true);
  addon.eval("__wfgWorld.scenario.step.spells = { { spellID = 91501 } }");
  redraw(addon, "SCENARIO_SPELL_UPDATE");
  expect([titles(addon)[2], spellButtons(addon)], "in combat: the row, no button yet").toEqual(["TEST-ONLY Free Prisoner", []]);
  setCombat(addon, false);
  addon.update(0);
  expect(spellButtons(addon), "the fight over: the button, casting the spell").toEqual([["spell", 91501, "TEST-ONLY Free Prisoner", false]]);
});

// The title of the block that shows the followed quest's accent line ("" when none does).
const edgeTitle = (addon) => addon.eval(`local f = Vanguard_QuestTrackerFrame
  for i = 1, f.blocks.used do if f.blocks[i].edge:IsShown() then return f.blocks[i].title:GetText() end end
  return ""`);

it("retail quests: tracking another quest on the map moves the accent line at once", () => {
  const addon = retail(`${QUESTS}
    __wfgWorld.superTracked = 91001
    C_SuperTrack = { GetSuperTrackedQuestID = function() return __wfgWorld.superTracked end, IsSuperTrackingAnything = function() return true end }`);
  addon.update(0);
  expect(edgeTitle(addon), "the super-tracked quest first").toBe("[70] TEST-ONLY Boars");
  addon.eval("__wfgWorld.superTracked = 91003");
  addon.fire("SUPER_TRACKING_CHANGED");
  addon.update(0);
  expect(edgeTitle(addon), "the map's pick without another quest event").toBe("[70] TEST-ONLY Herbs");
});
