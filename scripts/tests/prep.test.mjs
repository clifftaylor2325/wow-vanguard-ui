// prep: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/InstancePrep.lua: the checklist card of what's short, at a dungeon or
// raid's door, on a ready check, or with /fui prep.

import { expect, it } from "vitest";
import { CLICK_LUA, isTok, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY instance, ammo and items: an apple (food), a bandage, a potion and
// an ankh, with their item class and subclass as the client reports them.
const PREP_ENV = `
  __inside, __kind, __instanceID, __ammo = false, "none", 389, 0
  IsInInstance = function() return __inside, __kind end
  GetInstanceInfo = function() return "TEST-ONLY Ragefire Chasm", __kind, 1, "Normal", 5, 0, false, __instanceID end
  GetInventoryItemCount = function(_, slot) return slot == 0 and __ammo or 0 end
  local items = __wfgWorld.items
  items[4536] = { name = "TEST-ONLY Apple", classID = 0, subClassID = 5 }
  items[1251] = { name = "TEST-ONLY Bandage", classID = 0, subClassID = 7 }
  items[118] = { name = "TEST-ONLY Potion", classID = 0, subClassID = 1 }
  items[17030] = { name = "TEST-ONLY Ankh", classID = 15, subClassID = 0 }
  items[17057] = { name = "TEST-ONLY Fish Scales", classID = 15, subClassID = 0 }
  items[17058] = { name = "TEST-ONLY Fish Oil", classID = 15, subClassID = 0 }
  -- Puts count of an item in bag 0's next free slot.
  function __carry(itemID, count)
    local bag = __wfgWorld.bags[0]
    bag[#bag + 1] = { itemID = itemID, count = count }
  end
`;

// A character of a class and level with food, bandages and potions to spare unless told otherwise.
function character(cls, level, { packed = true, extra = "" } = {}) {
  const addon = loggedIn(PREP_ENV + CLICK_LUA + extra);
  addon.world.setUnit("player", { class: cls, level });
  if (packed) addon.eval("__carry(4536, 20) __carry(1251, 10) __carry(118, 3)");
  return addon;
}

// The card's shown rows as [label, value] (an empty Lua table comes back as an object).
const rows = (addon) => {
  const out = addon.eval(`local out = {}
    for _, r in ipairs(ns.GetModule("InstancePrep").card.rows) do
      if r:IsShown() then out[#out + 1] = { r.label:GetText(), r.value:GetText() } end
    end
    return out`);
  return Array.isArray(out) ? out : [];
};

// Whether the card is on screen.
const shown = (addon) => addon.frame("ForeverUI_PrepCard").visible;

// Walks into a dungeon (or out of one with inside false): PLAYER_ENTERING_WORLD with the instance set.
const enter = (addon, inside = true, kind = "party", id = 389) => {
  addon.eval(`__inside, __kind, __instanceID = ${inside}, "${kind}", ${id}`);
  addon.fire("PLAYER_ENTERING_WORLD", false, false);
};

it("prep: low ammo and soul shards show as have / want in red", () => {
  const hunter = character("HUNTER", 60, { extra: "__ammo = 120" });
  hunter.slash("prep");
  expect(shown(hunter), "/fui prep shows the card").toBe(true);
  expect(rows(hunter), "the ammo row").toEqual([["Ammo", "120 / 400"]]);
  expect(isTok(hunter, hunter.eval("return ns.GetModule('InstancePrep').card.rows[1].value.__textColor"), "bad"), "the count is red").toBe(true);
  expect(hunter.eval("return ns.GetModule('InstancePrep').card:GetHeight()"), "the card fits its one row").toBe(32 + 18 + 8);
  const warlock = character("WARLOCK", 60, { extra: "__ammo = 120" });
  warlock.eval("__carry(6265, 3)");
  warlock.slash("prep");
  expect(rows(warlock), "a warlock's shards (and no ammo row)").toEqual([["Soul shards", "3 / 10"]]);
});

it("prep: nothing short keeps the card away at the door; /fui prep says everything's packed", () => {
  const addon = character("WARRIOR", 60);
  enter(addon);
  expect(shown(addon), "a dungeon with nothing short: no card").toBe(false);
  addon.slash("prep");
  expect(shown(addon), "/fui prep shows it anyway").toBe(true);
  expect(addon.texts("Everything's packed.").length, "with the packed line").toBe(1);
  expect(isTok(addon, addon.eval("return ns.GetModule('InstancePrep').card.packed.__textColor"), "good"), "in green").toBe(true);
  expect(rows(addon), "and no rows").toEqual([]);
  addon.eval("__wfgWorld.bags[0][1].count = 4");
  addon.slash("prep");
  expect([rows(addon), addon.texts("Everything's packed.").length], "a later check paints over it").toEqual([[["Food & drink", "4 / 20"]], 0]);
});

it("prep: class reagents follow your level", () => {
  const addon = character("SHAMAN", 25);
  addon.slash("prep");
  expect(rows(addon).map((r) => r[0]), "a level 25 shaman: no Ankh row yet (Reincarnation is at 30)").toEqual(["Shiny Fish Scales"]);
  addon.world.setUnit("player", { level: 30 });
  addon.slash("prep");
  expect(rows(addon), "at 30 with no ankhs").toEqual([["Ankh", "0 / 5"], ["Shiny Fish Scales", "0 / 5"], ["Fish Oil", "0 / 5"]]);
  addon.eval("__carry(17030, 5) __carry(17057, 5) __carry(17058, 9)");
  addon.slash("prep");
  expect(rows(addon), "carrying enough").toEqual([]);
  const druid = character("DRUID", 60);
  druid.slash("prep");
  expect(rows(druid).map((r) => r[0]), "a level 60 druid checks the top rank's reagents only").toEqual(["Ironwood Seed", "Wild Thornroot"]);
});

it("prep: food and drink, bandages and potions are counted by their item subclass", () => {
  const addon = character("WARRIOR", 60, { packed: false });
  addon.eval("__carry(4536, 4) __carry(1251, 2) __carry(2589, 40)");
  addon.slash("prep");
  expect(rows(addon), "food, bandages and potions from one bag scan; cloth counts for nothing").toEqual([["Food & drink", "4 / 20"], ["Bandages", "2 / 10"], ["Potions", "0 / 3"]]);
  addon.eval("__carry(1251, __wfgWorld.secret(9))");
  addon.slash("prep");
  expect(rows(addon).map((r) => r[0]), "a hidden stack skips its row, never compared").toEqual(["Food & drink", "Potions"]);
  addon.eval("__wfgWorld.bags[0][1].itemID = __wfgWorld.secret(4536)");
  addon.slash("prep");
  expect(rows(addon).map((r) => r[0]), "a hidden item is not classed").toEqual(["Food & drink", "Potions"]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("prep: Keep-stocked items under their count, and worn gear, are on the card", () => {
  const addon = character("WARRIOR", 60);
  addon.slash("stock 2589 10");
  addon.slash("stock 99999 2");
  addon.eval("__carry(2589, 3) __wfgWorld.inventory[1] = { itemID = 1, durability = 38, maxDurability = 100 }");
  addon.slash("prep");
  expect(rows(addon), "durability under 50%, then the stock list by item ID (an uncached item by its number)").toEqual([["Durability", "38%"], ["Linen Cloth", "3 / 10"], ["item 99999", "0 / 2"]]);
  addon.eval("ns.GetModule('InstancePrep').settings.durability = 30");
  addon.slash("prep");
  expect(rows(addon)[0][0], "durability over the warning is fine").toBe("Linen Cloth");
});

it("prep: a hidden count skips its row without an error", () => {
  const addon = character("HUNTER", 60, { extra: "__ammo = __wfgWorld.secret(120)" });
  addon.slash("prep");
  expect(rows(addon), "hidden ammo: no row").toEqual([]);
  addon.world.setUnit("player", { class: "SHAMAN", level: 30 });
  addon.eval("C_Item.GetItemCount = function() return __wfgWorld.secret(0) end");
  addon.slash("prep");
  expect([rows(addon), addon.eval("return #ns.errors")], "hidden reagent counts: no rows, no errors").toEqual([[], 0]);
  addon.eval("__wfgWorld.units.player.class = __wfgWorld.secret()");
  addon.slash("prep");
  expect(addon.texts("Everything's packed.").length, "a hidden class has no class rows").toBe(1);
});

it("prep: nothing is checked in combat, and /fui prep waits for the fight to end", () => {
  const addon = character("MAGE", 60);
  setCombat(addon, true);
  enter(addon);
  addon.fire("READY_CHECK", "TEST-ONLY Leader", 30);
  addon.slash("prep");
  expect(shown(addon), "nothing in combat").toBe(false);
  setCombat(addon, false);
  expect(shown(addon), "/fui prep shows when the fight ends").toBe(true);
  expect(rows(addon).map((r) => r[0]), "a mage at 60 is short of runes and powder").toEqual(["Rune of Teleportation", "Rune of Portals", "Arcane Powder"]);
});

it("prep: once per visit at the door, gone after Hide after or the close button", () => {
  const addon = character("MAGE", 60);
  enter(addon);
  expect(shown(addon), "at the door of a dungeon with runes short").toBe(true);
  addon.advance(21);
  expect(shown(addon), "gone after 20 s").toBe(false);
  enter(addon);
  expect(shown(addon), "the same instance again (a reload inside): not again").toBe(false);
  enter(addon, false, "none");
  enter(addon, true, "raid", 409);
  expect(shown(addon), "a raid after leaving: again").toBe(true);
  addon.click("ns.GetModule('InstancePrep').card.close");
  expect(shown(addon), "the close button puts it away").toBe(false);
  enter(addon, true, "pvp", 30);
  expect(shown(addon), "a battleground is no door").toBe(false);
  addon.eval("ns.GetModule('InstancePrep').settings.onEnter = false");
  enter(addon, false, "none");
  enter(addon);
  expect(shown(addon), "the door check can be switched off").toBe(false);
});

it("prep: a ready check shows the card, packed or not, unless switched off", () => {
  const addon = character("WARRIOR", 60);
  addon.fire("READY_CHECK", "TEST-ONLY Leader", 30);
  expect([shown(addon), addon.texts("Everything's packed.").length], "a ready check: packed").toEqual([true, 1]);
  addon.advance(21);
  addon.eval("ns.GetModule('InstancePrep').settings.onReadyCheck = false");
  addon.fire("READY_CHECK", "TEST-ONLY Leader", 30);
  expect(shown(addon), "switched off").toBe(false);
});

it("prep: /fui prep want sets the wanted amounts; the options page has the section", () => {
  const addon = character("WARRIOR", 60);
  addon.slash("prep want food 30");
  expect(addon.eval("return ns.Settings('InstancePrep').want.food"), "food wanted").toBe(30);
  expect(addon.chat().at(-1), "said in chat").toMatch(/Instance prep wants 30 food\.$/);
  addon.slash("prep want gold 3");
  expect(addon.chat().at(-1), "an unknown kind: the usage").toMatch(/Usage: \/fui prep want/);
  addon.slash("prep");
  expect(rows(addon), "the new amount counts").toEqual([["Food & drink", "20 / 30"]]);
  addon.eval('ns.Options.Show("more")');
  expect(addon.find("^Checklist when you enter a dungeon or raid").text, "the switches").toMatch(/only when something is low/);
  expect(addon.find("^20 s$").text, "Hide after, in seconds").toBe("20 s");
  expect(addon.find("^50%%$").text, "the durability warning, in percent").toBe("50%");
  addon.eval('__click("Checklist on a ready check")');
  expect(addon.eval("return ns.Settings('InstancePrep').onReadyCheck"), "a switch sets the profile").toBe(false);
  const off = loggedIn("", { savedVariables: "ForeverUIDB.profiles.Default = { modules = { InstancePrep = false } }" });
  off.slash("prep");
  expect(off.chat().at(-1), "the module off").toMatch(/Instance prep is off/);
});

it("prep: a client without the bag, item or instance calls checks what it can", () => {
  const addon = character("SHAMAN", 30, { extra: "C_Container = nil GetInstanceInfo = nil" });
  addon.eval("C_Item.GetItemInfoInstant = nil");
  addon.slash("prep");
  expect(rows(addon).map((r) => r[0]), "no bag scan: reagents only").toEqual(["Ankh", "Shiny Fish Scales", "Fish Oil"]);
  addon.eval("C_Item.GetItemCount = nil C_Item.GetItemInfo = nil");
  addon.slash("stock 2589 10");
  addon.slash("prep");
  expect(rows(addon), "no item counts: nothing to compare").toEqual([]);
  enter(addon);
  enter(addon);
  expect(addon.eval("return #ns.errors"), "no instance ID: no errors").toBe(0);
  const noClient = character("WARRIOR", 60, { packed: false });
  noClient.eval("C_Container.GetContainerItemInfo = function() return nil end");
  noClient.slash("prep");
  expect(rows(noClient).length, "an empty slot is skipped").toBe(3);
});
