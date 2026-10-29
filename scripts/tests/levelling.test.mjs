// levelling: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Phase 9: quest XP on the tracker, the XP bar's tooltip (kills to level, rested, XP waiting in
// the quest log), and the one-time low-supply warning (Modules/InstancePrep.lua).

import { expect, it } from "vitest";
import { CLICK_LUA, DATA_ENV, chatHas, loggedIn, setCombat } from "./helpers.mjs";

// The tooltip's lines as "left | right" text.
const tipLines = (addon) => addon.eval("return GameTooltip.__lines or {}").map?.((l) => (l.right ? `${l.text} | ${l.right}` : l.text)) ?? [];

// Hovers the XP bar.
const hover = (addon) => addon.eval("Vanguard_xpbar:GetScript('OnEnter')(Vanguard_xpbar)");

it("levelling: the tracker shows each quest's XP, and the setting turns it off", () => {
  const addon = loggedIn();
  addon.world.addQuest({ questID: 7, title: "Wolves Across the Border", level: 8, watched: true, xp: 450, objectives: [{ text: "0/8 Wolves slain", finished: false }] });
  addon.world.addQuest({ questID: 8, title: "Free Gift", level: 8, watched: true, isComplete: true, objectives: [] });
  addon.update(0);
  expect(addon.find("450 XP").text, "the XP under the quest").toBe("450 XP");
  expect(addon.find("Free Gift").text, "a quest worth nothing is listed without an XP line").toContain("Free Gift");
  addon.eval("ns.GetModule('QuestTracker').settings.xp = false; ns.GetModule('QuestTracker').Refresh()");
  expect(addon.texts("450 XP").length, "off: no XP line").toBe(0);
  const ready = loggedIn("", { savedVariables: "VanguardDB.profiles = { Default = { QuestTracker = { xp = true } } }" });
  ready.world.addQuest({ questID: 9, title: "Done", level: 8, watched: true, isComplete: true, xp: 90, objectives: [] });
  ready.update(0);
  expect(ready.find("Ready to turn in").text, "ready quests keep their line").toBe("Ready to turn in");
  expect(ready.find("90 XP").text, "and show the XP").toBe("90 XP");
});

it("levelling: the XP bar's tooltip says where you are, rested, and the XP in finished quests", () => {
  const addon = loggedIn(DATA_ENV);
  addon.world.addQuest({ questID: 7, title: "Done", level: 8, isComplete: true, xp: 300, objectives: [] });
  addon.world.addQuest({ questID: 8, title: "Not yet", level: 8, xp: 999, objectives: [] });
  addon.world.addQuest({ isHeader: true, title: "A zone" });
  hover(addon);
  expect(tipLines(addon), "no kill seen yet: no kills line").toEqual([
    "Level 42", "To next level | 27.7K", "Through this level | 30%", "Rested | 5.0K (12% of a level)", "XP in finished quests | 300",
  ]);
  addon.eval("Vanguard_xpbar:GetScript('OnLeave')(Vanguard_xpbar)");
  expect(addon.eval("return GameTooltip:IsShown()"), "leaving hides it").toBe(false);
  addon.eval("ns.GetModule('DataBars').settings.tooltip = false GameTooltip:Hide()");
  hover(addon);
  expect(addon.eval("return GameTooltip:IsShown()"), "off: no tooltip").toBe(false);
});

it("levelling: a kill's XP gives kills to level, in either event order; quests and level-ups don't count", () => {
  const addon = loggedIn(DATA_ENV + "__xp = 12300 UnitXP = function() return __xp end");
  // A gain of n XP, with the kill message before or after it.
  const gain = (n, kill, first) => {
    addon.eval(`__xp = __xp + ${n}`);
    if (kill && first === "kill") addon.fire("CHAT_MSG_COMBAT_XP_GAIN", "x");
    addon.fire("PLAYER_XP_UPDATE", "player");
    if (kill && first !== "kill") addon.fire("CHAT_MSG_COMBAT_XP_GAIN", "x");
  };
  gain(500, false);
  expect(addon.eval("return ns.GetModule('DataBars').killXP"), "a quest's XP is no kill").toBeNull();
  gain(100, true, "kill");
  expect(addon.eval("return ns.GetModule('DataBars').killXP"), "message first").toBe(100);
  gain(200, true, "xp");
  expect(addon.eval("return ns.GetModule('DataBars').killXP"), "XP first").toBe(200);
  addon.eval("__xp = 50"); // a level-up drops the bar
  addon.fire("PLAYER_XP_UPDATE", "player");
  addon.fire("CHAT_MSG_COMBAT_XP_GAIN", "x");
  expect(addon.eval("return ns.GetModule('DataBars').killXP"), "a drop is no gain").toBe(200);
  hover(addon);
  expect(tipLines(addon), "40000 - 50 left at 200 each").toContain("Kills to level | about 200 (200 XP each)");
});

it("levelling: the quest and reward calls a client may lack are skipped", () => {
  const addon = loggedIn(DATA_ENV);
  addon.eval("GetQuestLogRewardXP = nil");
  expect(addon.eval("return ns.GetModule('DataBars').RewardXP(7)"), "no call: no XP").toBe(0);
  addon.eval("C_QuestLog.IsComplete = nil");
  expect(addon.eval("return ns.GetModule('DataBars').QuestXP()"), "no call: nothing waiting").toBe(0);
  addon.eval("C_QuestLog = nil");
  expect(addon.eval("return ns.GetModule('DataBars').QuestXP()"), "no log: nothing waiting").toBe(0);
});

// A character with food to spare unless told otherwise; an apple is food (see prep.test.mjs).
const SUPPLY_ENV = `
  __inside, __kind = false, "none"
  IsInInstance = function() return __inside, __kind end
  __wfgWorld.items[4536] = { name = "TEST-ONLY Apple", classID = 0, subClassID = 5 }
  __wfgWorld.items[1251] = { name = "TEST-ONLY Bandage", classID = 0, subClassID = 7 }
  function __setFood(n) __wfgWorld.bags[0] = { { itemID = 4536, count = n }, { itemID = 1251, count = 10 } } end
  __setFood(25)
`;

// Changes the food count and lets the bags settle.
const food = (addon, n) => {
  addon.eval(`__setFood(${n})`);
  addon.fire("BAG_UPDATE_DELAYED");
  addon.update(0);
};

it("levelling: a supply running low is said once, and again only after it recovered", () => {
  const addon = loggedIn(SUPPLY_ENV + CLICK_LUA);
  addon.update(0); // the first look, with food to spare
  addon.clearChat();
  food(addon, 15);
  expect(chatHas(addon, /Running low: Food & drink 15 \/ 20\./), "dropping under the wanted count warns").toBe(true);
  addon.clearChat();
  food(addon, 10);
  food(addon, 15);
  expect(chatHas(addon, /Running low/), "still low: not again").toBe(false);
  food(addon, 25);
  food(addon, 5);
  expect(chatHas(addon, /Running low: Food & drink 5 \/ 20\./), "back above, then low again: warns again").toBe(true);
});

it("levelling: supplies already low at login are not warned of, and a fight waits", () => {
  const addon = loggedIn(SUPPLY_ENV + CLICK_LUA + "__setFood(3)");
  addon.update(0);
  expect(chatHas(addon, /Running low/), "the first look only notes what is low").toBe(false);
  food(addon, 25);
  setCombat(addon, true);
  food(addon, 4);
  expect(chatHas(addon, /Running low/), "nothing is said in combat").toBe(false);
  setCombat(addon, false);
  addon.update(0);
  expect(chatHas(addon, /Running low: Food & drink 4 \/ 20\./), "said when the fight ends").toBe(true);
});

it("levelling: Warn in chat off keeps quiet", () => {
  const addon = loggedIn(SUPPLY_ENV + CLICK_LUA, { savedVariables: "VanguardDB.profiles = { Default = { InstancePrep = { lowWarn = false } } }" });
  addon.update(0);
  addon.clearChat();
  food(addon, 3);
  expect(chatHas(addon, /Running low/)).toBe(false);
});

// Quests in the log: 6925 XP each, one header; the second is not watched.
const addLogQuests = (addon) => {
  addon.world.addQuest({ questID: 7, title: "Wolves", level: 8, watched: true, xp: 6925, objectives: [] });
  addon.world.addQuest({ questID: 8, title: "Boars", level: 8, xp: 6925, objectives: [] });
  addon.world.addQuest({ isHeader: true, title: "A zone" });
  addon.update(0);
};
const LEVEL_LINE = "Quests: 50% of the XP to level";
const noTrack = { savedVariables: "VanguardDB.profiles = { Default = { QuestTracker = { autoTrack = false } } }" };

it("levelling: the tracker's foot adds up every quest in the log against the XP this level needs", () => {
  const addon = loggedIn(DATA_ENV, noTrack);
  addLogQuests(addon);
  expect(addon.texts(LEVEL_LINE).length, "13850 of the 27700 still needed, the unwatched quest counted too").toBe(1);
  expect(addon.eval("return Vanguard_QuestTrackerFrame.levelXp:GetTop() < Vanguard_QuestTrackerFrame.blocks[1]:GetTop()"), "under the quests").toBe(true);
  addon.eval("ns.GetModule('QuestTracker').settings.levelXp = false ns.GetModule('QuestTracker').Refresh()");
  expect(addon.texts(LEVEL_LINE).length, "off: no line").toBe(0);
  addon.eval("ns.GetModule('QuestTracker').settings.levelXp = true __maxLevel = true ns.GetModule('QuestTracker').Refresh()");
  expect(addon.texts(LEVEL_LINE).length, "no line at the level cap").toBe(0);
  addon.eval("__maxLevel = false UnitXP = function() return __wfgWorld.secret() end ns.GetModule('QuestTracker').Refresh()");
  expect(addon.texts(LEVEL_LINE).length, "no line while the client hides your XP").toBe(0);
  addon.eval("UnitXP = function() return 12300 end GetQuestLogRewardXP = function() return 0 end ns.GetModule('QuestTracker').Refresh()");
  expect(addon.texts(LEVEL_LINE).length, "no line when no quest gives XP").toBe(0);
  addon.eval("UnitXP = function() return 40000 end GetQuestLogRewardXP = function() return 5 end ns.GetModule('QuestTracker').Refresh()");
  expect(addon.texts(LEVEL_LINE).length, "no line when the level needs nothing more").toBe(0);
});

it("levelling: the log's XP sum skips headers, hidden ids and a client without the log", () => {
  const addon = loggedIn(DATA_ENV, noTrack);
  addLogQuests(addon);
  expect(addon.eval("return ns.GetModule('DataBars').LogXP()"), "both quests, not the header").toBe(13850);
  addon.eval("C_QuestLog.GetInfo = function() return { questID = __wfgWorld.secret() } end");
  expect(addon.eval("return ns.GetModule('DataBars').LogXP()"), "a hidden quest id gives nothing").toBe(0);
  addon.eval("C_QuestLog.GetInfo = nil");
  expect(addon.eval("return ns.GetModule('DataBars').LogXP()"), "no call: nothing").toBe(0);
  addon.eval("C_QuestLog = nil");
  expect(addon.eval("return ns.GetModule('DataBars').LogXP()"), "no log: nothing").toBe(0);
});

it("levelling: a quest you accept is watched, unless it is watched already or the switch is off", () => {
  const addon = loggedIn();
  addon.eval("__adds = 0 local add = C_QuestLog.AddQuestWatch C_QuestLog.AddQuestWatch = function(id) __adds = __adds + 1 return add(id) end");
  addon.world.addQuest({ questID: 21, title: "New", level: 5, objectives: [] });
  expect(addon.eval("return { C_QuestLog.GetNumQuestWatches(), __adds }"), "the new quest is watched").toEqual([1, 1]);
  addon.fire("QUEST_ACCEPTED", 21);
  expect(addon.eval("return __adds"), "a quest already watched is left alone").toBe(1);
  addon.world.addQuest({ questID: 22, title: "Older client", level: 5, objectives: [], watched: true });
  addon.eval("__adds = 0 C_QuestLog.RemoveQuestWatch(22)");
  addon.fire("QUEST_ACCEPTED", 3, 22);
  expect(addon.eval("return { C_QuestLog.GetNumQuestWatches(), __adds }"), "an older client sends the log index first, then the id").toEqual([2, 1]);
  addon.eval("__adds = 0");
  addon.fire("QUEST_ACCEPTED", addon.eval("return __wfgWorld.secret()"));
  expect(addon.eval("return __adds"), "a hidden id is ignored").toBe(0);
  addon.eval("ns.GetModule('QuestTracker').settings.autoTrack = false");
  addon.world.addQuest({ questID: 23, title: "Not watched", level: 5, objectives: [] });
  expect(addon.eval("return __adds"), "switched off: not watched").toBe(0);
});
it("levelling: a world quest or a bounty you accept is not watched, as the game's own tracker leaves them out", () => {
  const addon = loggedIn();
  addon.eval("__tasks, __bounties = { [31] = true }, { [32] = true } C_QuestLog.IsQuestTask = function(id) return __tasks[id] == true end C_QuestLog.IsQuestBounty = function(id) return __bounties[id] == true end");
  for (const id of [31, 32, 33]) addon.world.addQuest({ questID: id, title: `Quest ${id}`, level: 5, objectives: [] });
  // Whether the tracker watches the quest.
  const watched = (id) => addon.eval(`return ns.GetModule('QuestTracker').IsWatched(${id})`);
  expect([watched(31), watched(32), watched(33)], "only the ordinary quest is watched").toEqual([false, false, true]);
  addon.eval("C_QuestLog.IsQuestTask = function() return __wfgWorld.secret() end");
  addon.fire("QUEST_ACCEPTED", 31);
  expect(watched(31), "a hidden answer counts as no: the quest is watched").toBe(true);
});
it("levelling: a new area puts the watch list in the game's order again, unless the tracker orders by distance", () => {
  const addon = loggedIn();
  addon.eval("__sorts = 0 C_QuestLog.SortQuestWatches = function() __sorts = __sorts + 1 end");
  addon.fire("ZONE_CHANGED_NEW_AREA");
  expect(addon.eval("return __sorts"), "sorted on a new area").toBe(1);
  addon.eval("ns.GetModule('QuestTracker').settings.order = 'nearest'");
  addon.fire("ZONE_CHANGED_NEW_AREA");
  expect(addon.eval("return __sorts"), "nearest first sorts itself: the game's sort is left alone").toBe(1);
  addon.eval("C_QuestLog.SortQuestWatches = nil ns.GetModule('QuestTracker').settings.order = 'game'");
  addon.fire("ZONE_CHANGED_NEW_AREA");
  expect(addon.eval("return #ns.errors"), "a client without the call is fine").toBe(0);
});
