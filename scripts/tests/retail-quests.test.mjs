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
    ["TEST-ONLY Delve", []], ["Stage 2/3: TEST-ONLY The Crypt", ["TEST-ONLY Cultists slain 2/5", "TEST-ONLY Gate opened 1/1", "TEST-ONLY Enemy forces"]]]);
  expect(isTok(addon, addon.eval("return Vanguard_QuestTrackerFrame.blocks[2].lines[2].text.__textColor"), "muted"), "a done criterion is muted, as a done objective").toBe(true);
  addon.eval("__wfgWorld.scenario.numStages = 1 __wfgWorld.scenario.currentStage = 1 __wfgWorld.scenario.step = { numCriteria = 0 } __wfgWorld.scenario.name = ''");
  redraw(addon, "SCENARIO_UPDATE");
  expect(blocks(addon), "one stage and no names: Scenario, twice, as heading and stage").toEqual([["Scenario", []], ["Scenario", []]]);
  addon.eval("__wfgWorld.scenario.currentStage = 2");
  redraw(addon, "SCENARIO_COMPLETED");
  expect(addon.eval("return Vanguard_QuestTrackerFrame:IsShown()"), "past its last stage: nothing to track, the tracker hides").toBe(false);
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
  expect(blocks(addon), "World quests (the area's first), then Bonus objectives; no empty task, no nameless one").toEqual([
    ["World quests", []], ["TEST-ONLY Storm Spirits", ["TEST-ONLY Spirits 3/10"]], ["TEST-ONLY Both", ["TEST-ONLY Both 0/2"]],
    ["TEST-ONLY Far Rares", ["TEST-ONLY Rare slain 0/1"]], ["Bonus objectives", []], ["TEST-ONLY Clear the Mine", ["40% TEST-ONLY Mine cleared"]]]);
  expect(isTok(addon, addon.eval("return Vanguard_QuestTrackerFrame.blocks[2].title.__textColor"), "text"), "a world quest's title in the text color").toBe(true);
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
  const addon = retail(SCENARIO + QUESTS + TASKS + ACTIVITIES);
  const headings = addon.eval(`local QT = ns.GetModule("QuestTracker") local out = {}
    for _, r in ipairs(QT.Rows((QT.Quests()))) do if r.section then out[#out + 1] = r.section end end return out`);
  expect(Object.values(headings), "the headings in order").toEqual(
    ["TEST-ONLY Delve", "TEST-ONLY Campaign: TEST-ONLY Ascent", "Quests", "World quests", "Bonus objectives", "Traveler's Log"]);
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
