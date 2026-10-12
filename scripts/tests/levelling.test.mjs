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
