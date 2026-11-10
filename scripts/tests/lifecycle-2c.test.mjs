// The lifecycle of the A4-2c modules (listeners and stored data): each switches off and on without a reload. The three
// standard cases (scripts/tests/lifecycle-helpers.mjs) on the real module, plus a case for anything its Disable does,
// and for what it does for the player or keeps (stopped means it does nothing, and the stored data stays).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { HEAVY, modulesOffLua } from "../lib/login-scope.mjs";
import { QUEST_ENV, SETUP_DONE, calls, chatHas } from "./helpers.mjs";
import { lifecycleCases } from "./lifecycle-helpers.mjs";

// A login with the heavy modules off (except those in `keep`) and `settings` Lua run on the saved variables, then
// `saved` (a module switch from moduleOff).
const loginWith = (settings = "", keep = []) => (saved = "") => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY.filter((n) => !keep.includes(n))) + settings + saved });
  addon.login();
  return addon;
};

// AutoAccept ----------------------------------------------------------------------------------------------------

const AUTO_ACCEPT = loginWith("\nVanguardDB.profiles.Default.AutoAccept = { summons = true, resurrect = true, loot = true }");

// The game's answers to its prompts, logged in __answers.
const PROMPTS = `
  __answers = {}
  local function log(text) return function() __answers[#__answers + 1] = text end end
  C_SummonInfo = { ConfirmSummon = log("summon"), GetSummonConfirmSummoner = function() return "<name>" end, GetSummonConfirmAreaName = function() return "TEST-ONLY Vale" end }
  AcceptResurrect = log("resurrect")
  StaticPopup_Hide = function(which) __answers[#__answers + 1] = "close " .. which end
`;

lifecycleCases("AutoAccept", AUTO_ACCEPT);

it("lifecycle: auto-accept switched off does nothing at all, and on again answers the prompts as before", () => {
  const addon = AUTO_ACCEPT();
  addon.eval(PROMPTS);
  addon.eval('ns.SetModuleEnabled("AutoAccept", false)');
  addon.fire("CONFIRM_SUMMON");
  addon.fire("RESURRECT_REQUEST", "<name>");
  addon.eval('ns.GetModule("AutoAccept").AcceptSummon()');
  addon.advance(1);
  expect(addon.eval("return #__answers"), "nothing answered, nothing closed").toBe(0);
  expect(chatHas(addon, /Accepted a/), "and nothing said").toBe(false);
  addon.eval('ns.SetModuleEnabled("AutoAccept", true)');
  addon.fire("RESURRECT_REQUEST", "<name>");
  expect(addon.eval("return __answers[1]")).toBe("resurrect");
});

// QuestAuto -----------------------------------------------------------------------------------------------------

// A login with the quest dialog's test world, and every automation switch on.
const QUEST_AUTO = (saved = "") => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) + "\nVanguardDB.profiles.Default.QuestAuto = { accept = true, turnIn = true, skipGossip = true }" + saved });
  addon.eval(QUEST_ENV);
  addon.login();
  return addon;
};

lifecycleCases("QuestAuto", QUEST_AUTO);

it("lifecycle: quest automation switched off does nothing at all and claims no page, and on again accepts as before", () => {
  const addon = QUEST_AUTO();
  addon.eval('ns.SetModuleEnabled("QuestAuto", false)');
  addon.fire("QUEST_DETAIL");
  addon.fire("QUEST_PROGRESS");
  addon.fire("QUEST_COMPLETE");
  expect(calls(addon), "nothing accepted, continued or completed").toEqual([]);
  expect(addon.eval("return ns.GetModule('QuestAuto').Claims('QUEST_DETAIL')"), "and no page claimed").toBe(false);
  expect(addon.eval("return Vanguard_QuestDialog:IsShown()"), "the quest dialog shows the offer").toBe(true);
  addon.eval('ns.SetModuleEnabled("QuestAuto", true)');
  addon.fire("QUEST_DETAIL");
  expect(calls(addon)).toEqual(["accept nil"]);
});

it("lifecycle: an accept line waiting for the game's confirmation is never said once quest automation is switched off", () => {
  const addon = QUEST_AUTO();
  addon.eval("GetQuestID = function() return 90001 end");
  addon.fire("QUEST_DETAIL");
  addon.eval('ns.SetModuleEnabled("QuestAuto", false)');
  addon.fire("QUEST_ACCEPTED", 90001);
  expect(chatHas(addon, /Accepted: /)).toBe(false);
});

// VendorMemory --------------------------------------------------------------------------------------------------

// TEST-ONLY: a wall clock, the tooltip data API the Tooltips module hooks, a way to show an item's tooltip, and a visit to a merchant.
const VENDOR_ENV = `
  __now = 1000
  time = function() return __now end
  __post = {}
  TooltipDataProcessor = { AddTooltipPostCall = function(kind, fn) __post[kind] = fn end }
  GameTooltip.GetItem = function(self) return "TEST-ONLY Item", self.__link end
  function __showItem(link)
    local tt = GameTooltip
    tt.__link, tt.__lines, tt.shownMoneyFrames = link, {}, 1
    __post[Enum.TooltipDataType.Item](tt)
    return #tt.__lines
  end
  function __visit(name)
    __wfgWorld.units.npc = { name = name }
    __wfgWorld.merchant = { items = { { itemID = 159, name = "TEST-ONLY Water" } } }
  end
`;

// A login with Tooltips on (the item lines hang on it) and the merchant world.
const VENDOR = (saved = "") => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) + saved });
  addon.eval(VENDOR_ENV);
  addon.login();
  return addon;
};

lifecycleCases("VendorMemory", VENDOR);

it("lifecycle: vendor memory switched off remembers and says nothing new, keeps what it had, and on again remembers", () => {
  const addon = VENDOR();
  addon.eval('__visit("Thomas Miller")');
  addon.fire("MERCHANT_SHOW");
  addon.advance(0.25);
  expect(addon.eval('return __showItem("item:159")'), "a line for the remembered merchant").toBeGreaterThan(0);
  addon.eval('ns.SetModuleEnabled("VendorMemory", false) __visit("Innkeeper Heather")');
  addon.fire("MERCHANT_SHOW");
  addon.advance(0.25);
  expect(addon.eval("return #VanguardDB.vendors.items[159]"), "the first merchant is kept, the second not added").toBe(1);
  expect(addon.eval('return __showItem("item:159")'), "no 'Sold by' line while it is off").toBe(0);
  addon.eval('ns.SetModuleEnabled("VendorMemory", true)');
  addon.fire("MERCHANT_SHOW");
  addon.advance(0.25);
  expect(addon.eval("return #VanguardDB.vendors.items[159]")).toBe(2);
});

// Inventory -----------------------------------------------------------------------------------------------------

lifecycleCases("Inventory", loginWith());

it("lifecycle: inventory switched off reads nothing new and keeps its records, and on again reads the bags", () => {
  const addon = loginWith()();
  addon.eval('ns.GetModule("Inventory").Mine().money = -1 ns.SetModuleEnabled("Inventory", false)');
  addon.fire("BAG_UPDATE_DELAYED");
  addon.advance(2);
  expect(addon.eval('return ns.GetModule("Inventory").Mine().money'), "the record is not touched while it is off").toBe(-1);
  addon.eval('ns.SetModuleEnabled("Inventory", true)');
  expect(addon.eval('return ns.GetModule("Inventory").Mine().money ~= -1'), "read again at the start").toBe(true);
});

// QuestHistory --------------------------------------------------------------------------------------------------

lifecycleCases("QuestHistory", loginWith());

it("lifecycle: quest history switched off records no turn-in and says nothing of the stored ones, which stay", () => {
  const addon = loginWith()();
  addon.fire("QUEST_TURNED_IN", 90101);
  addon.eval('ns.SetModuleEnabled("QuestHistory", false)');
  addon.fire("QUEST_TURNED_IN", 90102);
  expect(addon.eval("local q = VanguardDB.questHistory.quests return { q[90101] ~= nil, q[90102] ~= nil }"), "the first is kept, the second not recorded").toEqual([true, false]);
  expect(addon.eval("local QH = ns.GetModule('QuestHistory') return { QH.On(), QH.Line(90101) == nil }"), "no line on the quest windows while it is off").toEqual([false, true]);
  addon.eval('ns.SetModuleEnabled("QuestHistory", true)');
  expect(addon.eval("return ns.GetModule('QuestHistory').Line(90101) ~= nil"), "back on, the stored turn-in shows again").toBe(true);
});

// SpellRanks ----------------------------------------------------------------------------------------------------

const SPELL_RANKS = loginWith("\nVanguardDB.profiles.Default.SpellRanks = { barNotice = true, trainerMemory = true }");

lifecycleCases("SpellRanks", SPELL_RANKS);

it("lifecycle: spell ranks switched off says nothing about your bars, and on again says it", () => {
  const addon = SPELL_RANKS();
  const notices = () => Array.from(addon.chat()).filter((l) => /hold an older spell rank/.test(l)).length;
  addon.eval('ns.SetModuleEnabled("SpellRanks", false)');
  addon.world.learn(100, { name: "TEST-ONLY Frostbolt", rank: 1 });
  addon.world.learn(101, { name: "TEST-ONLY Frostbolt", rank: 2 });
  addon.eval("__wfgWorld.setAction(3, { id = 100 })");
  addon.advance(0.5);
  expect(notices(), "nothing said while it is off").toBe(0);
  addon.eval('ns.SetModuleEnabled("SpellRanks", true)');
  addon.world.learn(300, { name: "TEST-ONLY Other", rank: 1 });
  addon.advance(0.5);
  expect(notices(), "said once it listens again").toBe(1);
});
