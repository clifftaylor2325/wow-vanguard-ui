// craftqueue: the craft queue (Modules/CraftQueue.lua): off until switched on; queue, next, stock,
// the craft that comes off it, profession cooldowns and the ranking of recipes, at the TEST-ONLY
// profession window of the headless client.

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

// TEST-ONLY: a wall clock, items and recipes. 100 makes a bag from 3 linen and a thread; 102 makes
// 1 to 3 bandages from a linen.
const ENV = `
  __now = 1790000000
  time = function() return __now end
  local items = __wfgWorld.items
  items[2320] = { name = "TEST-ONLY Coarse Thread" }
  items[4238] = { name = "TEST-ONLY Linen Bag" }
  items[1251] = { name = "TEST-ONLY Bandage" }
  local function slot(id, qty) return { reagents = { { itemID = id } }, quantityRequired = qty, reagentType = 1 } end
  -- The schematic call insists on its isRecraft argument, as Forever's docs mark it (Nilable = false).
  local schematic = C_TradeSkillUI.GetRecipeSchematic
  C_TradeSkillUI.GetRecipeSchematic = function(id, isRecraft)
    if type(isRecraft) ~= "boolean" then error("Usage: C_TradeSkillUI.GetRecipeSchematic(recipeSpellID, isRecraft [, recipeLevel])") end
    return schematic(id)
  end
  __wfgWorld.recipes = {
    [100] = { recipeID = 100, name = "TEST-ONLY Linen Bag", outputItemID = 4238, quantityMin = 1, quantityMax = 1, reagentSlotSchematics = { slot(2589, 3), slot(2320, 1) } },
    [102] = { recipeID = 102, name = "TEST-ONLY Bandage", outputItemID = 1251, quantityMin = 1, quantityMax = 3, reagentSlotSchematics = { slot(2589, 1) } },
  }
  function __price(id, copper) ns.AuctionPrices.Record(id, copper, __now) end
`;
const ON = "VanguardDB.profiles = { Default = { CraftQueue = { on = true } } }";
const CQ = "ns.GetModule('CraftQueue')";

// A logged-in character, the queue on unless told otherwise.
function crafter(extra = "", savedVariables = ON) {
  const addon = loggedIn(ENV + extra, { savedVariables });
  addon.world.setUnit("player", { class: "WARRIOR", level: 60 });
  return addon;
}
// Types a /vg command and says whether chat then has a line matching re.
const say = (addon, cmd, re) => (addon.slash(cmd), chatHas(addon, re));
// The queue as [recipe, count] pairs.
const queue = (addon) => addon.eval(`local out = {} for i, e in ipairs(${CQ}.Mine().queue) do out[i] = { e.id, e.n } end return out`);

it("is off until switched on, and says so", () => {
  const addon = crafter("", "");
  expect(say(addon, "craft", /The craft queue is off/), "off by default").toBe(true);
  expect(addon.eval(`return ${CQ}.settings.on`), "the setting").toBe(false);
  addon.world.openProfession(100);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 100);
  expect(addon.eval("return #ns.errors"), "nothing runs, no errors").toBe(0);
});

it("queues the recipe on display, lists it with what's short, and takes crafts off as you make them", () => {
  const addon = crafter("local have = { [2589] = 4 } C_Item.GetItemCount = function(id) return have[id] or 0 end");
  expect(say(addon, "craft add", /Open a recipe in the profession window first/), "no recipe on display").toBe(true);
  expect(say(addon, "craft", /The craft queue is empty/), "empty").toBe(true);
  addon.world.openProfession(100);
  addon.slash("craft add 2");
  addon.slash("craft add nonsense");
  expect(queue(addon), "2, then one more").toEqual([[100, 3]]);
  expect(chatHas(addon, /Queued: 3 x TEST-ONLY Linen Bag \(1 in the queue\)/), "chat says so").toBe(true);
  addon.world.selectRecipe(102);
  addon.slash("craft add");
  addon.slash("craft");
  expect(chatHas(addon, /1\. 3 x TEST-ONLY Linen Bag/) && chatHas(addon, /2\. 1 x TEST-ONLY Bandage/), "the list").toBe(true);
  expect(chatHas(addon, /Short of: TEST-ONLY Coarse Thread x3, Linen Cloth x6\./), "4 linen held of the 10 needed").toBe(true);
  addon.eval("C_Item.GetItemCount = function() return 99 end");
  expect(say(addon, "craft", /You have every reagent\./), "nothing short").toBe(true);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 555);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "party1", "x", 100);
  expect(queue(addon), "another spell, another unit: nothing").toEqual([[100, 3], [102, 1]]);
  addon.world.combat(true);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 100);
  addon.world.combat(false);
  expect(queue(addon), "in combat: nothing").toEqual([[100, 3], [102, 1]]);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 100);
  expect(queue(addon)[0], "your own craft comes off").toEqual([100, 2]);
  expect(chatHas(addon, /Crafted TEST-ONLY Linen Bag\. 2 left in the queue\./), "chat says so").toBe(true);
  addon.slash("craft done");
  addon.slash("craft done");
  expect(queue(addon), "done takes one a time, the entry goes at its last").toEqual([[102, 1]]);
  addon.slash("craft clear");
  expect([Object.keys(queue(addon)).length, chatHas(addon, /Craft queue emptied/)], "clear").toEqual([0, true]);
  addon.slash("craft done");
  expect(addon.eval("return #ns.errors"), "done on an empty queue is quiet").toBe(0);
});

it("/vg craft add caps a count at 999 crafts and takes nan as one", () => {
  const addon = crafter();
  addon.world.openProfession(100);
  addon.slash("craft add 1e999");
  addon.slash("craft add nan");
  expect(queue(addon), "999, then one more").toEqual([[100, 1000]]);
});

it("next opens the first recipe with its count typed in; stock raises Keep stocked and makes the Restock list", () => {
  const addon = crafter();
  expect(say(addon, "craft next", /The craft queue is empty/), "empty").toBe(true);
  addon.eval(`${CQ}.Add(100, 4)`);
  expect(chatHas(addon, /Queued: 4 x recipe 100 \(1 in the queue\)/), "an entry without a name").toBe(true);
  addon.slash("craft next");
  expect(chatHas(addon, /Next: 4 x recipe 100\. Press Create/), "no panel yet: still says it").toBe(true);
  expect(addon.world.openedRecipe ?? addon.eval("return __wfgWorld.openedRecipe"), "the recipe opened").toBe(100);
  addon.world.openProfession(100);
  addon.eval(`${CQ}.Mine().queue[1].name = "TEST-ONLY Linen Bag"`);
  addon.slash("craft next");
  expect(addon.eval("return Vanguard_CraftingPanel.crafts:GetText()"), "the count in the panel").toBe("4");
  addon.slash("craft stock");
  expect(addon.eval("local s = VanguardCharDB.stockList return { s[2589], s[2320] }"), "Keep stocked fits the queue").toEqual([12, 4]);
  expect(chatHas(addon, /Keep stocked now covers the queue/), "chat says so").toBe(true);
  const noErrands = crafter("", "VanguardDB.profiles = { Default = { CraftQueue = { on = true }, modules = { Errands = false } } }");
  expect(say(noErrands, "craft stock", /Keep stocked is part of Errands, which is off/), "Errands off").toBe(true);
  const old = crafter("C_TradeSkillUI.OpenRecipe = nil");
  old.eval(`${CQ}.Add(100, 1)`);
  old.slash("craft next");
  expect([chatHas(old, /Next: 1 x recipe 100/), old.eval("return #ns.errors")], "no OpenRecipe: told which, no error").toEqual([true, 0]);
});

it("/vg craft stock with the Auction helper off raises Keep stocked but makes no Restock list", () => {
  const addon = crafter("", "VanguardDB.profiles = { Default = { CraftQueue = { on = true }, modules = { AuctionHelper = false } } }");
  addon.eval(`${CQ}.Add(100, 4)`);
  addon.slash("craft stock");
  const lines = Array.from(addon.chat());
  expect([addon.eval("return VanguardCharDB.stockList[2589]"), chatHas(addon, /The auction helper is off \(\/vg > Modules\)\./)], "Keep stocked still fits the queue, and chat says why there is no list").toEqual([12, true]);
  expect([lines.some((l) => /Lists tab|Shopping list Restock/.test(l)), addon.eval("return ns.AuctionPrices.Store().lists.Restock == nil")], "no Restock list, and no direction to a Lists tab that isn't there").toEqual([false, true]);
});

it("notes profession cooldowns for each character and says when they are ready", () => {
  const addon = crafter();
  expect(say(addon, "craft cd", /No profession cooldowns noted yet/), "none yet").toBe(true);
  addon.eval("__wfgWorld.cooldowns = { [100] = 7500, [102] = 300000 }");
  addon.world.openProfession(100);
  addon.fire("TRADE_SKILL_LIST_UPDATE");
  addon.slash("craft cd");
  expect(chatHas(addon, /TEST-ONLY Linen Bag, 2h 5m/) && chatHas(addon, /TEST-ONLY Bandage, 3d 11h/), "hours and minutes, days and hours").toBe(true);
  addon.eval("__wfgWorld.cooldowns = { [100] = 1500 }");
  addon.fire("TRADE_SKILL_LIST_UPDATE");
  addon.slash("craft cd");
  expect(chatHas(addon, /TEST-ONLY Linen Bag, 25m/), "minutes").toBe(true);
  addon.eval("__now = __now + 1470");
  addon.slash("craft cd");
  expect(chatHas(addon, /TEST-ONLY Linen Bag, <1m$/), "under a minute: <1m, not 0m").toBe(true);
  addon.eval("__now = __now - 1470");
  addon.eval("__now = __now + 4000");
  addon.slash("craft cd");
  expect(chatHas(addon, /TEST-ONLY Linen Bag, ready/), "past its time: ready").toBe(true);
  addon.eval("__wfgWorld.cooldowns = {}");
  addon.fire("TRADE_SKILL_LIST_UPDATE");
  expect(addon.eval(`return next(${CQ}.Mine().cooldowns)`), "no cooldown: cleared").toBe(null);
  addon.world.combat(true);
  addon.eval("__wfgWorld.cooldowns = { [100] = 60 }");
  addon.fire("TRADE_SKILL_LIST_UPDATE");
  addon.world.combat(false);
  expect(addon.eval(`return next(${CQ}.Mine().cooldowns)`), "in combat: not read").toBe(null);
  const old = crafter("C_TradeSkillUI.GetRecipeCooldown = nil C_TradeSkillUI.GetAllRecipeIDs = nil");
  old.world.openProfession(100);
  old.fire("TRADE_SKILL_LIST_UPDATE");
  expect([old.eval(`return next(${CQ}.Mine().cooldowns)`), old.eval("return #ns.errors")], "no calls and no spell cooldown: nothing, no error").toEqual([null, 0]);
  expect(old.eval(`return #${CQ}.Ranked()`), "no list: nothing is ranked").toBe(0);
  const SPELL = "C_Spell = C_Spell or {} __spellCd = {} C_Spell.GetSpellCooldown = function(id) return __spellCd[id] end GetTime = function() return 1000 end";
  const spell = crafter(`C_TradeSkillUI.GetRecipeCooldown = nil C_TradeSkillUI.GetAllRecipeIDs = nil ${SPELL}`);
  spell.world.openProfession(100);
  spell.eval("__spellCd[100] = { startTime = 400, duration = 7600, isOnGCD = false } __spellCd[102] = { startTime = 999, duration = 1.5, isOnGCD = true }");
  spell.slash("craft cd");
  expect(chatHas(spell, /TEST-ONLY Linen Bag, 1h 56m/), "no list call: the recipe on display is read by its spell's cooldown, 400 + 7600 - 1000 = 7000 s left").toBe(true);
  spell.world.selectRecipe(102);
  spell.slash("craft cd");
  expect(spell.eval(`return ${CQ}.Mine().cooldowns[102]`), "a global cooldown is not a recipe cooldown").toBe(null);
  spell.eval("__spellCd[100] = { startTime = __wfgWorld.secret(1), duration = 7600 }");
  spell.slash("craft cd");
  expect(spell.eval(`return ${CQ}.Mine().cooldowns[100]`), "a hidden start clears it").toBe(null);
  spell.eval("__spellCd[100] = __wfgWorld.secret({})");
  spell.eval(`${CQ}.Add(100, 1)`);
  spell.slash("craft cd");
  spell.eval("__spellCd[100] = { startTime = 1, duration = 2 }");
  spell.slash("craft cd");
  expect(spell.eval("return #ns.errors"), "odd answers raise nothing").toBe(0);
  const off = crafter("", "");
  off.eval("__wfgWorld.cooldowns = { [100] = 60 }");
  off.fire("TRADE_SKILL_LIST_UPDATE");
  expect(off.eval(`return next(${CQ}.Mine().cooldowns)`), "switched off: not read").toBe(null);
});

it("ranks the recipes whose prices are all known, by profit, per craft and per hour", () => {
  const addon = crafter();
  expect(say(addon, "craft top", /Nothing to rank/), "no prices").toBe(true);
  addon.eval("__price(2589, 10) __price(2320, 20) __price(4238, 500) __price(1251, 40)");
  addon.slash("craft top");
  expect(chatHas(addon, /1\. TEST-ONLY Linen Bag: 4s 50c a craft, 27g \d+s \d+c an hour at 6s a craft/), "the bag: 500 - 50 = 450c").toBe(true);
  expect(chatHas(addon, /2. TEST-ONLY Bandage: 70c a craft/), "bandages: 2 x 40 - 10 = 70c").toBe(true);
  addon.eval("ns.Settings('CraftQueue').secs = 36");
  addon.slash("craft top");
  expect(chatHas(addon, /TEST-ONLY Linen Bag: 4s 50c a craft, 4g 50s 0c an hour at 36s a craft/), "the pace is the setting").toBe(true);
});

it("/vg craft top shows a losing recipe's loss with a minus, never as a profit", () => {
  const addon = crafter();
  addon.eval("__price(2589, 10) __price(2320, 20) __price(4238, 500) __price(1251, 2)");
  addon.slash("craft top");
  expect(chatHas(addon, /2\. TEST-ONLY Bandage: -6c a craft, -36s 0c an hour at 6s a craft/), "bandages: 2 x 2 - 10 = -6c").toBe(true);
  expect(addon.eval("local AP = ns.AuctionPrices return { AP.Money(-500), AP.Money(-15000), AP.Money(-25), AP.Money(0) }"), "every size of loss").toEqual(["-5s 0c", "-1g 50s 0c", "-25c", "0c"]);
});

it("the options have the switch and the pace", () => {
  const addon = crafter();
  addon.eval('ns.Options.Show("town") ns.Options.ShowTab("Craft queue")');
  expect(addon.find("^Craft queue, profession cooldowns and recipe ranking").text, "under Town and gear").toMatch(/^Craft queue/);
  expect(addon.find("^Seconds a craft takes").text, "the pace").toMatch(/^Seconds a craft takes/);
});
