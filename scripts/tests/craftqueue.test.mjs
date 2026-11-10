// craftqueue: the craft queue (Modules/CraftQueue.lua): off until switched on; queue, next, stock,
// the craft that comes off it, profession cooldowns and the ranking of recipes, at the TEST-ONLY
// profession window of the headless client.

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { chatHas, expectErrors, loggedIn } from "./helpers.mjs";

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

// A logged-in character, the queue on unless told otherwise (on WoW Forever, or the client given).
function crafter(extra = "", savedVariables = ON, client = undefined) {
  const addon = loggedIn(ENV + extra, { savedVariables, client });
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

it("with the Auction helper off, the queue still sees the recipe on display and notes its cooldown", () => {
  const off = "VanguardDB.profiles = { Default = { CraftQueue = { on = true }, modules = { AuctionHelper = false } } }";
  const addon = crafter("C_TradeSkillUI.GetAllRecipeIDs = nil __wfgWorld.cooldowns = { [100] = 72000 }", off);
  addon.world.openProfession(100);
  addon.slash("craft add 2");
  addon.fire("TRADE_SKILL_LIST_UPDATE");
  addon.slash("craft cd");
  expect([queue(addon), chatHas(addon, /TEST-ONLY Linen Bag, 20h 0m/)], "queued, and the cooldown noted").toEqual([[[100, 2]], true]);
  expect([addon.eval("return _G.Vanguard_CraftingPanel == nil"), addon.eval("return #ns.errors")], "no cost panel, no errors").toEqual([true, 0]);
});

it("/vg craft stock with the Auction helper off raises Keep stocked but makes no Restock list", () => {
  const addon = crafter("", "VanguardDB.profiles = { Default = { CraftQueue = { on = true }, modules = { AuctionHelper = false } } }");
  addon.eval(`${CQ}.Add(100, 4)`);
  addon.slash("craft stock");
  const lines = Array.from(addon.chat());
  expect([addon.eval("return VanguardCharDB.stockList[2589]"), chatHas(addon, /The auction helper is off \(\/vg > Modules\)\./)], "Keep stocked still fits the queue, and chat says why there is no list").toEqual([12, true]);
  expect([lines.some((l) => /Lists tab|Shopping list Restock/.test(l)), addon.eval("return ns.AuctionPrices.Store().lists.Restock == nil")], "no Restock list, and no direction to a Lists tab that isn't there").toEqual([false, true]);
});

it("a recipe with a charge left is not on cooldown, though the game gives the time to its next charge", () => {
  const addon = crafter("C_TradeSkillUI.GetRecipeCooldown = function() return 18000, false, __charges, 3 end __charges = 2");
  addon.fire("TRADE_SKILL_LIST_UPDATE");
  expect(addon.eval(`return ${CQ}.Mine().cooldowns[100]`), "2 of 3 charges: craftable now, nothing listed").toBe(null);
  addon.eval("__charges = 0");
  addon.fire("TRADE_SKILL_LIST_UPDATE");
  expect(addon.eval(`return ${CQ}.Mine().cooldowns[100].ready - __now`), "no charge left: the five hours show").toBe(18000);
});

it("one recipe the client cannot answer for does not end the cooldown scan of the others", () => {
  expectErrors("craft cooldown: eval:23: no such recipe");
  const addon = crafter(`C_TradeSkillUI.GetAllRecipeIDs = function() return { 102, 100 } end
    local schematic = C_TradeSkillUI.GetRecipeSchematic
    C_TradeSkillUI.GetRecipeSchematic = function(id, r) if id == 102 then error("no such recipe") end return schematic(id, r) end`);
  addon.eval("__wfgWorld.cooldowns = { [100] = 7500, [102] = 300000 }");
  addon.fire("TRADE_SKILL_LIST_UPDATE");
  expect(addon.eval(`return ${CQ}.Mine().cooldowns[100] ~= nil and ${CQ}.Mine().cooldowns[102] == nil`), "the recipe after the failing one is noted").toBe(true);
  expect(addon.eval("return ns.LoudErrorCount()"), "and the failure is kept quietly, not flooded").toBe(0);
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
  expect(addon.find("^Craft queue and recipe ranking").text, "under Town and gear").toMatch(/^Craft queue/);
  expect(addon.find("^Seconds per craft").text, "the pace").toBe("Seconds per craft");
});

it("on WoW Retail, reads the client's recipe list and recipe cooldowns as on Forever", () => {
  const addon = crafter("", ON, RETAIL_CLIENT);
  addon.world.openProfession(100);
  addon.eval("__wfgWorld.cooldowns = { [102] = 7200 }");
  addon.fire("TRADE_SKILL_LIST_UPDATE");
  addon.slash("craft cd");
  expect([chatHas(addon, /TEST-ONLY Bandage, 2h 0m/), addon.eval("return #ns.errors")], "a recipe not on display, found through the recipe list, with its cooldown").toEqual([true, 0]);
});

// The account and character files as Lua, to log in again with what the last session saved.
const savedFiles = (addon) => addon.eval(`
  local function dump(v)
    if type(v) ~= "table" then return type(v) == "string" and string.format("%q", v) or tostring(v) end
    local parts = {}
    for k, x in pairs(v) do parts[#parts + 1] = "[" .. dump(k) .. "] = " .. dump(x) end
    return "{ " .. table.concat(parts, ", ") .. " }"
  end
  return "VanguardDB = " .. dump(VanguardDB) .. "\\nVanguardCharDB = " .. dump(VanguardCharDB)`);

it("the queue is the character's own: it stays through a switch to another profile", () => {
  const addon = crafter();
  addon.world.openProfession(100);
  addon.slash("craft add 2");
  addon.eval('ns.UseProfile("Beta") VanguardDB.profiles.Beta.CraftQueue = { on = true }');
  const next = crafter("", savedFiles(addon));
  expect([next.eval("return VanguardCharDB.profile"), queue(next)], "on Beta, the queue is still there").toEqual(["Beta", [[100, 2]]]);
});

it("an old profile's queue and cooldowns move out of every profile once; /vg craft cd lists an alt noted on another profile", () => {
  const me = crafter().eval("return ns.SettingsGuard.CharKey()");
  const mine = `["${me}"] = { queue = { { id = 100, n = 3, name = "TEST-ONLY Linen Bag" }, "junk" }, cooldowns = {} }`;
  const alt = `["Alt-Realm"] = { queue = { { id = 102, n = 1 } }, cooldowns = { [100] = { name = "TEST-ONLY Alt Bag", ready = 1790003600 }, [5] = "bad" } }`;
  const beta = `Beta = { CraftQueue = { chars = { ${alt}, ["${me}"] = { queue = { { id = 100, n = 5 }, { id = 102, n = 1 } } } } } }`;
  const saved = `VanguardDB.profiles = { Default = { CraftQueue = { on = true, chars = { ${mine} } } }, ${beta}, Odd = { CraftQueue = { chars = "bad" } }, Plain = {} }`;
  const addon = crafter("", saved);
  expect(queue(addon), "both profiles' queues join this character's, each recipe once at its larger count").toEqual([[100, 5], [102, 1]]);
  const left = "local p = VanguardDB.profiles return { p.Default.CraftQueue.chars == nil, p.Odd.CraftQueue.chars == nil, p.Beta.CraftQueue.chars['Alt-Realm'] ~= nil, p.Beta.CraftQueue.chars[ns.SettingsGuard.CharKey()] == nil }";
  expect(addon.eval(left), "this character's part leaves every profile; the alt's queue waits for the alt").toEqual([true, true, true, true]);
  expect(say(addon, "craft cd", / Alt-Realm: TEST-ONLY Alt Bag, 1h 0m$/), "the alt's cooldown, noted under Beta, is listed on Default").toBe(true);
  const again = crafter("", savedFiles(addon));
  expect([queue(again), say(again, "craft cd", / Alt-Realm: TEST-ONLY Alt Bag, 1h 0m$/)], "the next login moves nothing twice").toEqual([[[100, 5], [102, 1]], true]);
});

it("a hand-edited queue or cooldown list starts empty, without an error", () => {
  const addon = crafter("", `${ON} VanguardCharDB.craftQueue = 7 VanguardDB.craftCooldowns = { [5] = {}, ["Alt-Realm"] = { [1] = "bad" }, ["Odd-Realm"] = "bad" }`);
  expect([say(addon, "craft", /The craft queue is empty/), say(addon, "craft cd", /No profession cooldowns noted yet/), addon.eval("return #ns.errors")], "empty, and no error").toEqual([true, true, 0]);
  addon.eval("VanguardDB.craftCooldowns = 'oops'");
  expect(say(addon, "craft clear", /Craft queue emptied/) && say(addon, "craft cd", /No profession cooldowns noted yet/), "a damaged account list too").toBe(true);
});

it("H34-17-1 two profiles holding one alt recipe keep the note ready later, not the first profile's", () => {
  const old = `["Alt-Realm"] = { queue = {}, cooldowns = { [100] = { name = "TEST-ONLY Alt Bag", ready = 1789996400 } } }`;
  const newer = `["Alt-Realm"] = { queue = {}, cooldowns = { [100] = { name = "TEST-ONLY Alt Bag", ready = 1790036000 } } }`;
  const saved = `VanguardDB.profiles = { Default = { CraftQueue = { on = true } }, Arms = { CraftQueue = { chars = { ${old} } } }, Fury = { CraftQueue = { chars = { ${newer} } } } }`;
  const addon = crafter("", saved);
  expect(say(addon, "craft cd", / Alt-Realm: TEST-ONLY Alt Bag, 10h 0m$/), "the newer cast shows its 10 hours").toBe(true);
  expect(chatHas(addon, /Alt Bag, ready/), "the stale note is not kept").toBe(false);
});

// The panel beside the profession window, as the player sees it: [shown, row texts, note, add/next/clear enabled].
const panel = (addon) => addon.eval(`
  local f = ${CQ}.frame
  if not f then return { false } end
  local rows = {}
  for i = 1, f.rows.used do rows[i] = f.rows[i].text:GetText() end
  return { f:IsShown(), rows, f.note:GetText(), f.next:IsEnabled() and true or false, f.clear:IsEnabled() and true or false }
`);

it("shows a panel beside the profession window: rows, what is short, remove, add, next and clear", () => {
  const addon = crafter("C_Item.GetItemCount = function() return 0 end");
  expect(panel(addon)[0], "no panel before a profession opens").toBe(false);
  addon.world.openProfession(100);
  expect(panel(addon).slice(0, 3).map((v) => (typeof v === "object" ? Object.values(v) : v)), "shown, empty").toEqual([true, [], "Nothing queued. Pick a recipe, then Add to queue."]);
  expect(panel(addon).slice(3), "next and clear wait for something queued").toEqual([false, false]);
  addon.eval(`${CQ}.frame.add:Click()`);
  addon.eval(`${CQ}.frame.add:Click()`);
  addon.world.selectRecipe(102);
  addon.eval(`${CQ}.frame.add:Click()`);
  const [shown, rows, note, next, clear] = panel(addon);
  expect([shown, Object.values(rows), next, clear], "two recipes").toEqual([true, ["2 x TEST-ONLY Linen Bag", "1 x TEST-ONLY Bandage"], true, true]);
  expect(note, "the shortage").toMatch(/^Short of: .*Coarse Thread x2/);
  addon.eval(`${CQ}.frame.next:Click()`);
  expect(chatHas(addon, /Next: 2 x TEST-ONLY Linen Bag/), "Next").toBe(true);
  addon.eval(`${CQ}.frame.rows[1].remove:Click()`);
  expect(queue(addon), "the first entry is removed").toEqual([[102, 1]]);
  expect(Object.values(panel(addon)[1]), "the row went").toEqual(["1 x TEST-ONLY Bandage"]);
  addon.eval(`${CQ}.frame.clear:Click()`);
  expect(Object.values(queue(addon)), "cleared").toEqual([]);
  addon.slash("craft add");
  expect(Object.values(panel(addon)[1]), "a command repaints it too").toEqual(["1 x TEST-ONLY Bandage"]);
  addon.world.closeProfession();
  expect(panel(addon)[0], "hidden with the window").toBe(false);
});

it("docks the panel under the cost panel while that shows, and builds nothing in combat or while off", () => {
  const off = crafter("", "");
  off.world.openProfession(100);
  expect(panel(off)[0], "off: no panel").toBe(false);
  const addon = loggedIn(ENV, { savedVariables: ON });
  addon.world.combat(true);
  addon.world.openProfession(100);
  expect(panel(addon)[0], "no panel is made in a fight").toBe(false);
  addon.world.combat(false);
  expect(panel(addon)[0], "made when the fight ends").toBe(true);
  addon.eval("__price(2589, 10) ns.AuctionPrices.Record(4238, 500, __now)");
  addon.world.selectRecipe(100);
  expect(addon.eval(`local _, rel = ${CQ}.frame:GetPoint() return rel:GetName()`), "under the cost panel").toBe("Vanguard_CraftingPanel");
});
