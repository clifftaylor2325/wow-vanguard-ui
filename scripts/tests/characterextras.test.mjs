// characterextras: item levels, missing-enchant marks and /vg gear (Modules/CharacterExtras.lua), in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

// The enchant switch on (it starts off).
const ENCHANTS = "VanguardDB.profiles = { Default = { CharacterExtras = { enchant = true } } }";

// TEST-ONLY character pane with a head, chest and off-hand slot, and worn gear of known level, quality and enchant.
const ENV = `
  CharacterFrame = CreateFrame("Frame", "CharacterFrame", UIParent) CharacterFrame:Hide()
  for slot, id in pairs({ Head = 1, Chest = 5, SecondaryHand = 17 }) do
    CreateFrame("Button", "Character" .. slot .. "Slot", CharacterFrame).GetID = function() return id end
  end
  local items = __wfgWorld.items
  items[1001] = { name = "TEST-ONLY Helm", quality = 3, level = 40, equipLoc = "INVTYPE_HEAD" }
  items[1005] = { name = "TEST-ONLY Plate", quality = 2, level = 30, equipLoc = "INVTYPE_CHEST" }
  items[1017] = { name = "TEST-ONLY Shield", quality = 3, level = 35, equipLoc = "INVTYPE_SHIELD" }
  items[1018] = { name = "TEST-ONLY Dagger", quality = 3, level = 20, equipLoc = "INVTYPE_WEAPONOFFHAND" }
  items[1019] = { name = "TEST-ONLY Rag Vest", quality = 1, level = 5, equipLoc = "INVTYPE_CHEST" }
  items[1020] = { name = "TEST-ONLY Orb", quality = 3, level = 30, equipLoc = "INVTYPE_HOLDABLE" }
  __wfgWorld.worn[1], __wfgWorld.worn[5], __wfgWorld.worn[17] = "item:1001:0", "item:1005:0:0", "item:1017::"
  UnitDamage = function() return 10, 20, 4, 8, 1, -1, 1.1 end
  UnitAttackSpeed = function() return 2, 1.5 end
`;

// A pane slot's label (level or mark) and whether it shows.
const label = (addon, slot, key) => addon.eval(`local l = ns.FrameState('vgGearInfo')[Character${slot}Slot].${key} return { l:IsShown(), l:GetText() }`);
// Repaints the pane after the world changed.
const repaint = (addon) => addon.eval("ns.GetModule('CharacterExtras').PaintAll()");

it("shows the item level on each worn slot and no mark until the enchant switch is on", () => {
  const addon = loggedIn(ENV);
  addon.eval("CharacterFrame:Show()");
  expect(label(addon, "Head", "level")).toEqual([true, 40]);
  expect(label(addon, "Chest", "mark")[0], "marks are off by default").toBe(false);
});

it("marks unenchanted enchantable pieces once switched on, an off hand when it is a weapon or a shield", () => {
  const addon = loggedIn(ENV, { savedVariables: ENCHANTS });
  addon.eval("CharacterFrame:Show()");
  expect(label(addon, "Chest", "mark")[0], "an uncommon chest piece with enchant 0").toBe(true);
  expect(label(addon, "Head", "mark")[0], "head is not an enchantable slot").toBe(false);
  expect(label(addon, "SecondaryHand", "mark")[0], "an unenchanted shield").toBe(true);
  addon.eval("__wfgWorld.worn[17] = 'item:1017:929'");
  repaint(addon);
  expect(label(addon, "SecondaryHand", "mark")[0], "an enchanted shield").toBe(false);
  addon.eval("__wfgWorld.worn[17] = 'item:1020:0'");
  repaint(addon);
  expect(label(addon, "SecondaryHand", "mark")[0], "a held off-hand item takes no enchant").toBe(false);
  addon.eval("__wfgWorld.worn[17] = 'item:1018:2564'");
  repaint(addon);
  expect(label(addon, "SecondaryHand", "mark")[0], "an enchanted off-hand weapon").toBe(false);
  addon.eval("__wfgWorld.worn[17] = 'item:1018:0'");
  repaint(addon);
  expect(label(addon, "SecondaryHand", "mark")[0], "an unenchanted off-hand weapon").toBe(true);
  addon.eval("__wfgWorld.worn[5] = 'item:1019:0'");
  repaint(addon);
  expect(label(addon, "Chest", "mark")[0], "a common piece is not marked").toBe(false);
});

it("follows the options switches and empties its label when a slot empties", () => {
  const addon = loggedIn(ENV);
  addon.eval("CharacterFrame:Show()");
  const rows = addon.eval("local r = ns.GetModule('CharacterExtras').Rows() return { #r, r[2][5], r[3][5] }");
  expect(rows, "a header, two switches (level on, marks off by default) and the summary button").toEqual([4, true, false]);
  addon.eval("ns.GetModule('CharacterExtras').Rows()[4][3]()");
  expect(chatHas(addon, /Average item level/), "the button prints the summary").toBe(true);
  addon.eval("ns.GetModule('CharacterExtras').Rows()[2][4](false)");
  expect(label(addon, "Head", "level")[0], "item level switched off").toBe(false);
  addon.eval("ns.GetModule('CharacterExtras').Rows()[2][4](true) ns.GetModule('CharacterExtras').Rows()[3][4](true)");
  expect(label(addon, "Chest", "mark")[0], "marks switched on").toBe(true);
  addon.eval("__wfgWorld.worn[1] = nil");
  repaint(addon);
  expect(label(addon, "Head", "level")[0], "an empty slot has no level").toBe(false);
});

it("says the average level, melee damage and missing enchants for /vg gear", () => {
  const addon = loggedIn(ENV);
  addon.slash("gear");
  expect(chatHas(addon, /Average item level 35 \(3 pieces\)\./)).toBe(true);
  expect(chatHas(addon, /Melee 7\.5 damage per second \(2\.0 s swing\), off hand 4\.0\./)).toBe(true);
  expect(chatHas(addon, /Missing an enchant: Chest, Off hand\./)).toBe(true);
});

it("copes with no gear and no damage figures, and does nothing without the character pane", () => {
  const addon = loggedIn("UnitDamage = nil");
  addon.slash("gear");
  expect(chatHas(addon, /No item levels known yet\./)).toBe(true);
  expect(chatHas(addon, /No worn piece is missing an enchant\./)).toBe(true);
  expect(addon.eval("return ns.GetModule('CharacterExtras').PaintAll()")).toBeNull();
});
