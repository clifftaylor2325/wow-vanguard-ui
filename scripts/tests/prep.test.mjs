// prep: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/InstancePrep.lua: the checklist card of what's short, at a dungeon or
// raid's door, on a ready check, or with /vg prep.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { BUFF_NAMES, BUFF_NAMES_DE, CLICK_LUA, SETUP_DONE, chatHas, isTok, loggedIn, setCombat, spellNames } from "./helpers.mjs";
import { alphaOf, closeOf, insets } from "./dialogs.mjs";

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
const shown = (addon) => addon.frame("Vanguard_PrepCard").visible;

// Walks into a dungeon (or out of one with inside false): PLAYER_ENTERING_WORLD with the instance set.
const enter = (addon, inside = true, kind = "party", id = 389) => {
  addon.eval(`__inside, __kind, __instanceID = ${inside}, "${kind}", ${id}`);
  addon.fire("PLAYER_ENTERING_WORLD", false, false);
};

it("prep: low ammo and soul shards show as have / want in red", () => {
  const hunter = character("HUNTER", 60, { extra: "__ammo = 120" });
  hunter.slash("prep");
  expect(shown(hunter), "/vg prep shows the card").toBe(true);
  expect(rows(hunter), "the ammo row").toEqual([["Ammo", "120 / 400"]]);
  expect(isTok(hunter, hunter.eval("return ns.GetModule('InstancePrep').card.rows[1].value.__textColor"), "bad"), "the count is red").toBe(true);
  expect(hunter.eval("return ns.GetModule('InstancePrep').card:GetHeight()"), "the card fits its one row").toBe(40 + 18 + 8);
  const warlock = character("WARLOCK", 60, { extra: "__ammo = 120" });
  warlock.eval("__carry(6265, 3)");
  warlock.slash("prep");
  expect(rows(warlock), "a warlock's shards (and no ammo row)").toEqual([["Soul shards", "3 / 10"]]);
});

it("prep: nothing short keeps the card away at the door; /vg prep says everything's packed", () => {
  const addon = character("WARRIOR", 60);
  enter(addon);
  expect(shown(addon), "a dungeon with nothing short: no card").toBe(false);
  addon.slash("prep");
  expect(shown(addon), "/vg prep shows it anyway").toBe(true);
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
  expect(rows(addon).map((r) => r[0]), "a level 25 shaman: no Ankh row yet (Reincarnation is at 30)").toEqual(["TEST-ONLY Fish Scales"]);
  addon.world.setUnit("player", { level: 30 });
  addon.slash("prep");
  expect(rows(addon), "at 30 with no ankhs, each named as the client names it").toEqual([["TEST-ONLY Ankh", "0 / 5"], ["TEST-ONLY Fish Scales", "0 / 5"], ["TEST-ONLY Fish Oil", "0 / 5"]]);
  addon.eval("__carry(17030, 5) __carry(17057, 5) __carry(17058, 9)");
  addon.slash("prep");
  expect(rows(addon), "carrying enough").toEqual([]);
  const druid = character("DRUID", 60);
  druid.slash("prep");
  expect(rows(druid).map((r) => r[0]), "a level 60 druid checks the top rank's reagents only").toEqual(["Ironwood Seed", "Wild Thornroot"]);
  // Its card's chrome: a card's heading and X at the corner, Buy list beside the X, the rows T.SPACE.gap in.
  const card = "ns.GetModule('InstancePrep').card";
  const [gap, tight, buttonH, headingSize] = druid.eval('local T = ns.Theme return { T.SPACE.gap, T.SPACE.tight, T.BUTTON_H, T.RoleSize("heading") }');
  const [panel, title, close, buy] = ["", ".title", ".close", ".buy"].map((part) => druid.frame(card + part));
  expect([title.text, title.font.size, isTok(druid, title.textColor, "text"), title.rect.left - panel.rect.left, panel.rect.top - title.rect.top],
    "the heading role in text, T.SPACE.gap in and down from the card's corner").toEqual(["Instance prep", headingSize, true, gap, gap]);
  expect(closeOf(druid, card, "close"), "the X T.SPACE.gap in from the top-right corner").toEqual([gap, gap, true]);
  expect([buy.visible, buy.rect.height, buy.rect.top, close.rect.left - buy.rect.right], "Buy list (T.BUTTON_H tall) beside the X, level with its top").toEqual([true, buttonH, close.rect.top, expect.closeTo(tight, 5)]);
  expect(insets(druid, `${card}.rows[1]`, card).filter((_, i) => i !== 1 && i !== 3), "the rows T.SPACE.gap in from the sides").toEqual([gap, gap]);
  expect(alphaOf(druid, card), "the card keeps the panel token's own alpha, T.ALPHA.overlay").toBe(druid.eval("return ns.Theme.ALPHA.overlay"));
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

it("prep: nothing is checked in combat, and /vg prep waits for the fight to end", () => {
  const addon = character("MAGE", 60);
  setCombat(addon, true);
  enter(addon);
  addon.fire("READY_CHECK", "TEST-ONLY Leader", 30);
  addon.slash("prep");
  expect(shown(addon), "nothing in combat").toBe(false);
  setCombat(addon, false);
  expect(shown(addon), "/vg prep shows when the fight ends").toBe(true);
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
  addon.slash("prep");
  expect(shown(addon), "/vg prep brings it back").toBe(true);
  addon.eval("for _, name in ipairs(UISpecialFrames) do if _G[name] and _G[name]:IsShown() then _G[name]:Hide() end end");
  expect(shown(addon), "Escape puts it away (the game hides every listed special frame)").toBe(false);
  enter(addon, true, "pvp", 30);
  expect(shown(addon), "a battleground is no door").toBe(false);
  addon.eval("ns.GetModule('InstancePrep').settings.onEnter = false");
  enter(addon, false, "none");
  enter(addon);
  expect(shown(addon), "the door check can be switched off").toBe(false);
});

it("prep: a /reload inside the dungeon does not bring the door card back", () => {
  const addon = character("MAGE", 60);
  addon.eval(`__inside, __kind, __instanceID = true, "party", 389`);
  addon.fire("PLAYER_ENTERING_WORLD", false, true);
  expect(shown(addon), "after a reload inside (a fresh UI that has not seen this visit): not again").toBe(false);
  enter(addon);
  expect(shown(addon), "nor at the next loading screen inside").toBe(false);
  enter(addon, false, "none");
  enter(addon);
  expect(shown(addon), "back through the door after leaving: again").toBe(true);
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

it("prep: /vg prep want sets the wanted amounts; the options page has the section", () => {
  const addon = character("WARRIOR", 60);
  addon.slash("prep want food 30");
  expect(addon.eval("return ns.Settings('InstancePrep').want.food"), "food wanted").toBe(30);
  expect(addon.chat().at(-1), "said in chat").toMatch(/Instance prep wants 30 food\.$/);
  addon.slash("prep want gold 3");
  expect(addon.chat().at(-1), "an unknown kind: the usage").toMatch(/Usage: \/vg prep want/);
  addon.slash("prep");
  expect(rows(addon), "the new amount counts").toEqual([["Food & drink", "20 / 30"]]);
  addon.eval('ns.Options.Show("town") ns.Options.ShowTab("Instance prep")');
  expect(addon.find("^Checklist when you enter a dungeon or raid").text, "the switches").toMatch(/only when something is low/);
  expect(addon.find("^20 s$").text, "Hide after, in seconds").toBe("20 s");
  expect(addon.find("^50%%$").text, "the durability warning, in percent").toBe("50%");
  addon.eval('__click("Checklist on a ready check")');
  expect(addon.eval("return ns.Settings('InstancePrep').onReadyCheck"), "a switch sets the profile").toBe(false);
  const off = loggedIn("", { savedVariables: "VanguardDB.profiles.Default = { modules = { InstancePrep = false } }" });
  off.slash("prep");
  expect(off.chat().at(-1), "the module off").toMatch(/Instance prep is off/);
});

it("prep: a client without the bag, item or instance calls checks what it can", () => {
  const addon = character("SHAMAN", 30, { extra: "C_Container = nil GetInstanceInfo = nil" });
  addon.eval("C_Item.GetItemInfoInstant = nil");
  addon.slash("prep");
  expect(rows(addon).map((r) => r[0]), "no bag scan: reagents only").toEqual(["TEST-ONLY Ankh", "TEST-ONLY Fish Scales", "TEST-ONLY Fish Oil"]);
  addon.eval("local info = C_Item.GetItemInfo C_Item.GetItemInfo = function() return nil end __info = info");
  addon.slash("prep");
  expect(rows(addon).map((r) => r[0]), "items the client has no data for yet keep their English names").toEqual(["Ankh", "Shiny Fish Scales", "Fish Oil"]);
  addon.eval("C_Item.GetItemInfo = __info");
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

// TEST-ONLY weapons worn (item class 2) and their timed enchants as the client lists them per weapon slot,
// and the names the client gives the buff ids the checks look for.
const BUFF_ENV = spellNames(BUFF_NAMES) + `
  __wfgWorld.items[2000] = { name = "TEST-ONLY Sword", classID = 2, subClassID = 7 }
  __wfgWorld.items[2001] = { name = "TEST-ONLY Shield", classID = 4, subClassID = 6 }
  __wfgWorld.worn[16] = "|cffffffff|Hitem:2000|h[TEST-ONLY Sword]|h|r"
  __wfgWorld.worn[17] = "|cffffffff|Hitem:2000|h[TEST-ONLY Sword]|h|r"
  __enchants = {}
  C_Item.GetWeaponEnchantInfo = function(slot) return __enchants[slot] end
`;

// The Instance prep card with buff checks on, and the aura names added to the player.
function buffed(extra = "") {
  const addon = character("WARRIOR", 60, { extra: BUFF_ENV + extra });
  addon.eval("ns.GetModule('InstancePrep').settings.buffs = true");
  return addon;
}
// Gives the player a helpful aura by name.
const buff = (addon, name) => addon.world.addAura("player", { name, duration: 3600, isHelpful: true });

it("prep buffs: off until switched on", () => {
  const addon = character("WARRIOR", 60, { extra: BUFF_ENV });
  addon.slash("prep");
  expect(addon.texts("Everything's packed.").length, "no buff rows by default").toBe(1);
});

it("prep buffs: a packed character with buffs missing walks into a dungeon and the door card stays away", () => {
  const addon = buffed();
  enter(addon);
  expect(shown(addon), "buff checks belong to a ready check and /vg prep, not the door").toBe(false);
});

it("prep buffs: a ready check lists the flask, food, enchants and raid buffs you lack", () => {
  const addon = buffed();
  addon.fire("READY_CHECK", "TEST-ONLY Leader", 30);
  expect(rows(addon).map((r) => r[0]), "everything missing").toEqual(["Flask", "Food buff", "Fortitude", "Mark of the Wild", "Arcane Intellect", "Weapon oil or poison", "Off-hand oil or poison"]);
  expect(rows(addon)[0][1], "said in red as missing").toBe("missing");
  // The labels of the aura rows now.
  const labels = () => addon.eval("local out = {} for i, r in ipairs(ns.GetModule('InstancePrep').AuraRows()) do out[i] = r.label end return out");
  ["Flask of the Titans", "Prayer of Fortitude"].forEach((n) => buff(addon, n));
  expect(labels(), "a buff you have leaves no gap: the food, Mark of the Wild and Arcane Intellect still show").toEqual(["Food buff", "Mark of the Wild", "Arcane Intellect"]);
  ["Well Fed", "Gift of the Wild", "Arcane Brilliance"].forEach((n) => buff(addon, n));
  addon.eval("__enchants[0] = { { hasEnchant = true, timeLeft = 900000 } } __enchants[1] = { { hasEnchant = true, timeLeft = 900000 } }");
  addon.advance(21);
  addon.slash("prep");
  expect(addon.texts("Everything's packed.").length, "all there: packed").toBe(1);
});

it("prep buffs: world buffs only when asked for, an off hand only when it holds a weapon", () => {
  const addon = buffed("__wfgWorld.worn[17] = '|Hitem:2001|h' __enchants[0] = { { hasEnchant = true, timeLeft = 900000 } }");
  ["Flask of Supreme Power", "Well Fed", "Power Word: Fortitude", "Mark of the Wild", "Arcane Intellect"].forEach((n) => buff(addon, n));
  addon.slash("prep");
  expect(addon.texts("Everything's packed.").length, "a shield needs no oil; no world buffs asked").toBe(1);
  addon.eval("ns.GetModule('InstancePrep').settings.worldBuffs = true");
  addon.advance(21);
  addon.slash("prep");
  expect(rows(addon), "none of the world buffs").toEqual([["World buffs", "missing"]]);
  buff(addon, "Songflower Serenade");
  addon.advance(21);
  addon.slash("prep");
  expect(addon.texts("Everything's packed.").length, "one is enough").toBe(1);
});

it("prep buffs: a buff holding a check's name counts (a camp variant), an unrelated buff does not", () => {
  const addon = buffed();
  // The labels of the aura rows now (an empty Lua table comes back as an object).
  const labels = () => {
    const out = addon.eval("local out = {} for i, r in ipairs(ns.GetModule('InstancePrep').AuraRows()) do out[i] = r.label end return out");
    return Array.isArray(out) ? out : [];
  };
  ["Haste of the Camp", "Flask of Forever Fortitude"].forEach((n) => buff(addon, n));
  expect(labels(), "a buff named like no check counts for nothing: a flask the client calls something else is no flask").toEqual(["Flask", "Food buff", "Fortitude", "Mark of the Wild", "Arcane Intellect"]);
  buff(addon, "Camp Well Fed Feast");
  buff(addon, "Gift of the Wild (camp)");
  expect(labels(), "a camp food and a camp class buff holding the client's names count").toEqual(["Flask", "Fortitude", "Arcane Intellect"]);
  addon.eval("C_UnitAuras.GetAuraDataByIndex = nil");
  expect(labels(), "without the index read only the exact names count: back to missing").toEqual(["Flask", "Food buff", "Fortitude", "Mark of the Wild", "Arcane Intellect"]);
  addon.eval("C_Spell.GetSpellName = nil GetSpellInfo = nil");
  expect(labels(), "a client that names none of a check's spells makes no row for it: never a guess").toEqual([]);
  addon.slash("prep buffs");
  expect(chatHas(addon, /Flask: none this client knows, so no row; Food buff: none/), "and the buff report says so").toBe(true);
});

it("prep buffs: on a German client the checks find the German names", () => {
  const addon = buffed(`__wfgWorld.locale = "deDE" ${spellNames(BUFF_NAMES_DE)}`);
  // The labels of the aura rows now (an empty Lua table comes back as an object).
  const labels = () => {
    const out = addon.eval("local out = {} for i, r in ipairs(ns.GetModule('InstancePrep').AuraRows()) do out[i] = r.label end return out");
    return Array.isArray(out) ? out : [];
  };
  ["Flask of the Titans", "Well Fed", "Power Word: Fortitude"].forEach((n) => buff(addon, n));
  expect(labels(), "the English names count for nothing on a German client").toEqual(["Flask", "Food buff", "Fortitude", "Mark of the Wild", "Arcane Intellect"]);
  ["Fläschchen der Titanen", "Satt", "Gebet der Seelenstärke", "Gabe der Wildnis", "Arkane Intelligenz"].forEach((n) => buff(addon, n));
  expect(labels(), "the German flask, food and raid buffs count").toEqual([]);
  addon.eval("ns.GetModule('InstancePrep').settings.worldBuffs = true");
  expect(labels(), "no world buff yet").toEqual(["World buffs"]);
  buff(addon, "Liedblumenserenade");
  expect(labels(), "Songflower under its German name counts").toEqual([]);
  addon.slash("prep buffs");
  expect(chatHas(addon, /Fläschchen der Titanen -> Flask/), "the buff report names the German flask's check").toBe(true);
});

it("prep buffs: /vg prep buffs lists your buffs with the check each counts for, out of combat", () => {
  const addon = buffed();
  ["Flask of the Titans", "Haste of the Camp"].forEach((n) => buff(addon, n));
  addon.slash("prep buffs");
  expect(chatHas(addon, /Your 2 buff\(s\), and the Instance prep check each counts for:/), "the count").toBe(true);
  expect(chatHas(addon, /Flask of the Titans -> Flask/), "a flask counts for the Flask row").toBe(true);
  expect(chatHas(addon, /Haste of the Camp -> no check/), "another buff counts for none").toBe(true);
  expect(chatHas(addon, /The checks count any buff with one of these names in its name: Flask: Flask of the Titans, .*; Food buff: Well Fed; Fortitude: Power Word: Fortitude, Prayer of Fortitude; .*World buffs: Rallying Cry of the Dragonslayer/), "and what the checks expect, in the client's names").toBe(true);
  setCombat(addon, true);
  addon.slash("prep buffs");
  expect(chatHas(addon, /Buffs are listed out of combat, and not while the game hides aura values\./), "in combat it waits").toBe(true);
});

it("prep buffs: nothing is guessed when the client hides auras or can't list them", () => {
  const addon = buffed();
  // How many buff rows the card would get now.
  const count = () => addon.eval("return #ns.GetModule('InstancePrep').BuffRows()");
  addon.eval("__wfgWorld.aurasSecret = true");
  expect(count(), "auras hidden: no rows").toBe(0);
  addon.eval("__wfgWorld.aurasSecret = false");
  setCombat(addon, true);
  expect(count(), "in combat: no rows").toBe(0);
  setCombat(addon, false);
  addon.eval("C_Item.GetWeaponEnchantInfo = nil");
  expect(count(), "the five aura rows, but no enchant rows without the call").toBe(5);
  addon.eval("C_UnitAuras = nil");
  expect(count(), "no aura call: no aura rows").toBe(0);
  addon.eval("C_UnitAuras = { GetAuraDataBySpellName = function() end } Enum.WeaponSlot = nil C_Item.GetWeaponEnchantInfo = function() end");
  expect(count(), "no weapon slots: no enchant rows").toBe(5);
  addon.eval("Enum.WeaponSlot = { MainHand = 0, OffHand = 1 } GetInventoryItemLink = function() return __wfgWorld.secret() end");
  expect(count(), "a hidden weapon link: no enchant rows").toBe(5);
  addon.eval("GetInventoryItemLink = function() return nil end");
  expect(count(), "nothing worn: no enchant rows").toBe(5);
  addon.eval("GetInventoryItemLink = function() return '|Hitem:2000|h' end C_Item.GetItemInfoInstant = nil");
  expect(count(), "no item info: no enchant rows").toBe(5);
});

it("prep buffs: the options page has the switches", () => {
  const addon = character("WARRIOR", 60);
  addon.eval('ns.Options.Show("town")');
  addon.eval('__click("Buff checks on the card: flask, food, oil or poison, raid buffs")');
  expect(addon.eval("return ns.Settings('InstancePrep').buffs"), "a switch sets the profile").toBe(true);
  addon.eval('__click("World buffs among them")');
  expect(addon.eval("return ns.Settings('InstancePrep').worldBuffs"), "and the other").toBe(true);
});

it("prep: the card is clamped to the screen, so a long list never pushes its title past the top", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE });
  addon.eval(PREP_ENV + "__wfgStub.methods.SetClampedToScreen = function(self, on) self.__testClamped = on end");
  addon.login();
  addon.world.setUnit("player", { class: "MAGE", level: 60 });
  for (let id = 2589; id < 2601; id++) addon.slash(`stock ${id} 10`);
  addon.slash("prep");
  expect(rows(addon).length, "a dozen Keep-stocked items short").toBeGreaterThanOrEqual(12);
  expect(addon.eval("return ns.GetModule('InstancePrep').card.__testClamped"), "the card keeps itself on the screen").toBe(true);
});
