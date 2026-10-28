// cooldownkeys: key text on the Cooldown Manager's icons (Modules/CooldownKeys.lua) in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, TOOLS_ENV, UNITS_ENV, chatHas, loggedIn, pageBar1 } from "./helpers.mjs";

const ON = "VanguardDB.profiles = { Default = { CooldownKeys = { keys = true } } }";

// TEST-ONLY: the essential row's first icon stands for spell 1234 (its base spell is 99), the utility row's for 5678.
const ITEMS = `
  EssentialCooldownViewer.items[1].GetSpellID = function() return 1234 end
  EssentialCooldownViewer.items[1].GetBaseSpellID = function() return 99 end
  UtilityCooldownViewer.items[1].GetSpellID = function() return 5678 end
`;

// The text on an icon's key label ("" or false: none made yet).
const key = (addon, viewer) => addon.eval(`local fs = ns.FrameState('vgKey')[${viewer}.items[1]] return fs and fs:GetText() or false`);

it("cooldown keys: off by default, no label is made", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + ITEMS);
  addon.world.setAction(3, { type: "spell", id: 1234 });
  expect(key(addon, "EssentialCooldownViewer"), "off: nothing drawn").toBe(false);
});

it("cooldown keys: the key of the bar button that holds the spell, or a macro that casts it, follows moves and bindings", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + ITEMS + "function GetMacroSpell(id) return id == 7 and 5678 or nil end", { savedVariables: ON });
  addon.world.setAction(3, { type: "spell", id: 1234 });
  addon.world.setAction(2, { type: "macro", id: 7 });
  expect([key(addon, "EssentialCooldownViewer"), key(addon, "UtilityCooldownViewer")], "spell on 3, macro on 2").toEqual(["3", "2"]);
  addon.world.setAction(3, null);
  addon.world.setAction(1, { type: "spell", id: 99 });
  expect(key(addon, "EssentialCooldownViewer"), "the base spell counts; moved to button 1").toBe("1");
  addon.world.setAction(1, null);
  expect(key(addon, "EssentialCooldownViewer"), "off the bars: blank").toBe("");
  addon.world.setAction(4, { type: "item", id: 1234 });
  expect(key(addon, "EssentialCooldownViewer"), "an item with the same number is not the spell").toBe("");
});

it("cooldown keys: the labels follow bar 1 to its new page after a stance change or Shift+number", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + ITEMS, { savedVariables: ON });
  addon.world.setAction(3, { type: "spell", id: 1234 });
  addon.world.setAction(75, { type: "spell", id: 5678 });
  addon.world.setAction(15, { type: "spell", id: 5678 });
  // The labels on the essential and utility rows' first icons.
  const keys = () => [key(addon, "EssentialCooldownViewer"), key(addon, "UtilityCooldownViewer")];
  expect(keys(), "page 1: key 3 casts 1234").toEqual(["3", false]);
  addon.fire("UPDATE_BONUS_ACTIONBAR");
  addon.fire("ACTIONBAR_PAGE_CHANGED");
  pageBar1(addon, 7);
  addon.update(0);
  expect(keys(), "a stance pages bar 1 to 7: key 3 casts 5678").toEqual(["", "3"]);
  pageBar1(addon, 2);
  addon.update(0);
  expect(keys(), "Shift+2: key 3 casts slot 15's 5678").toEqual(["", "3"]);
  pageBar1(addon, 1);
  addon.update(0);
  expect(keys(), "back to page 1").toEqual(["3", ""]);
});

it("cooldown keys: a hidden spell, hidden slot or missing call shows no label and no error", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + ITEMS, { savedVariables: ON });
  addon.eval("EssentialCooldownViewer.items[1].GetSpellID = function() return { __secret = true } end");
  addon.world.setAction(3, { type: "spell", id: 1234 });
  addon.world.setAction(2, { type: "spell", id: { __secret: true } });
  expect(key(addon, "EssentialCooldownViewer"), "a hidden spell: no label").toBe(false);
  addon.eval("EssentialCooldownViewer.items[1].GetSpellID = function() error('refused') end EssentialCooldownViewer.items[1].GetBaseSpellID = nil");
  addon.world.setAction(3, { type: "spell", id: 1234 });
  expect(key(addon, "EssentialCooldownViewer"), "a refused call: no label").toBe(false);
});

it("cooldown keys: /vg cdmkeys and the options switch it at once; the row's layout hook repaints", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + ITEMS + CLICK_LUA);
  addon.world.setAction(3, { type: "spell", id: 1234 });
  addon.slash("cdmkeys on");
  expect([key(addon, "EssentialCooldownViewer"), chatHas(addon, /Cooldown Manager keys on/)]).toEqual(["3", true]);
  addon.eval("local make = __item function __item(v, bar) local i = make(v, bar) i.GetSpellID = function() return 1234 end return i end EssentialCooldownViewer:RefreshLayout()");
  expect(addon.eval("local fs = ns.FrameState('vgKey')[EssentialCooldownViewer.items[#EssentialCooldownViewer.items]] return fs and fs:GetText() or false"), "an icon made later is labelled").toBe("3");
  addon.slash("cdmkeys off");
  expect([key(addon, "EssentialCooldownViewer"), chatHas(addon, /Cooldown Manager keys off/)], "off blanks it").toEqual(["", true]);
  addon.slash("cdmkeys");
  expect(addon.eval("return ns.GetModule('CooldownKeys').settings.keys"), "no word toggles").toBe(true);
  addon.eval('ns.Options.Show("cooldowns")');
  addon.eval('__click("Key text on the manager\'s icons")');
  expect([addon.eval("return ns.GetModule('CooldownKeys').settings.keys"), key(addon, "EssentialCooldownViewer")], "the options switch turns it off").toEqual([false, ""]);
});

it("T2-1 cooldown keys: a row that points its icons at other cooldowns in place is repainted", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + ITEMS, { savedVariables: ON });
  addon.world.setAction(3, { type: "spell", id: 1234 });
  addon.world.setAction(2, { type: "spell", id: 5678 });
  addon.eval("EssentialCooldownViewer.items[1].GetSpellID = function() return 1234 end EssentialCooldownViewer:RefreshData()");
  addon.update(0);
  expect(key(addon, "EssentialCooldownViewer"), "the icon's spell is on key 3").toBe("3");
  addon.eval("EssentialCooldownViewer.items[1].GetSpellID = function() return 5678 end EssentialCooldownViewer:RefreshData()");
  addon.update(0);
  expect(key(addon, "EssentialCooldownViewer"), "the same icon now tracks the spell on key 2").toBe("2");
});

it("cooldown keys: the command says so when the module is off", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + ITEMS + CLICK_LUA);
  addon.eval("ns.GetModule('CooldownKeys').settings = nil");
  addon.slash("cdmkeys on");
  expect(chatHas(addon, /keys module is off/)).toBe(true);
});
