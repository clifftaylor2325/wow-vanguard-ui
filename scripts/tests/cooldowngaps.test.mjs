// cooldowngaps: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/CooldownGaps.lua: a display-only row for the items, pet abilities and totems the
// game's Cooldown Manager misses; hidden cooldown values show nothing.

import { expect, it } from "vitest";
import { chatHas, loggedIn, setCombat } from "./helpers.mjs";

// Saved settings with the row on and the chosen items given.
const saved = (items) => `VanguardDB.profiles = { Default = { CooldownGaps = { on = true, items = '${items}' } } }`;

// TEST-ONLY client pieces: two trinket slots (one on-use, one passive), a Healthstone in the bags,
// item cooldowns, a pet bar, and one totem. Cooldown tables are { start, length }.
const GAPS_ENV = `
  __worn, __itemCd, __petBar, __petCd, __spellObj, __totems = { [13] = 30001, [14] = 30002 }, {}, {}, {}, {}, {}
  local items = __wfgWorld.items
  items[30001] = { name = "TEST-ONLY Trinket", icon = "TEST-ONLY-ICON-Trinket" }
  items[30002] = { name = "TEST-ONLY Charm", icon = "TEST-ONLY-ICON-Charm" }
  items[5512] = { name = "TEST-ONLY Healthstone", icon = "TEST-ONLY-ICON-Healthstone" }
  __wfgWorld.bags[0][1] = { itemID = 5512, count = 1 }
  GetInventoryItemID = function(_, slot) return __worn[slot] end
  C_Item.GetItemSpell = function(id) if id ~= 30002 then return "TEST-ONLY Use", 1 end end
  C_Item.GetItemCooldown = function(id) local c = __itemCd[id] or { 0, 0 } return c[1], c[2], 1 end
  GetPetActionInfo = function(i) local p = __petBar[i] if p then return p.name, p.icon, p.token, false, false, false, p.spell end end
  GetPetActionCooldown = function(i) local c = __petCd[i] or { 0, 0 } return c[1], c[2], 1 end
  C_Spell.GetSpellCooldownDuration = function(id) return __spellObj[id] end
  GetTotemInfo = function(slot) local t = __totems[slot] if t then return true, "TEST-ONLY Totem", t[1], t[2], "TEST-ONLY-ICON-Totem" end return false, "", 0, 0, nil end
  GetTotemDuration = nil
`;

// An addon with the row on: the TEST-ONLY client pieces, then env, and the chosen items.
const on = (env = "", items = "") => loggedIn(GAPS_ENV + env, { savedVariables: saved(items) });
// Every cell: shown, icon, plain sweep, and the length of a duration object it was given.
const cells = (addon) => addon.eval(`local out = {}
  for i, c in ipairs(ns.GetModule("CooldownGaps").cells or {}) do
    local d = c.cooldown.__durationObject
    out[i] = { shown = c:IsShown(), icon = c.icon.__texture, sweep = c.cooldown.__cooldown, object = d and d.duration }
  end return out`);
// An empty Lua table comes back as an object, not a list.
const list = (v) => (Array.isArray(v) ? v : Object.values(v ?? {}));
const shown = (addon) => list(cells(addon)).filter((c) => c.shown);
const refresh = (addon) => addon.eval('ns.GetModule("CooldownGaps").Refresh()');

it("is off until switched on", () => {
  const addon = loggedIn(GAPS_ENV);
  expect(addon.eval('return Vanguard_CooldownGaps'), "no row").toBeNull();
  addon.slash("gaps");
  expect(chatHas(addon, /cooldown gaps row is off/), "the command says how to turn it on").toBe(true);
});

it("shows an on-use trinket with its sweep and skips one with no use", () => {
  const addon = on('__itemCd[30001] = { 100, 120 }');
  expect(shown(addon), "only the on-use trinket").toEqual([{ shown: true, icon: "TEST-ONLY-ICON-Trinket", sweep: [100, 120] }]);
  addon.eval('__itemCd[30001] = { 0, 0 }');
  refresh(addon);
  expect(shown(addon)[0].sweep, "a finished cooldown clears the sweep").toBeUndefined();
  expect(addon.frame("Vanguard_CooldownGaps").visible, "the row is a movable frame").toBe(true);
});

it("shows chosen items only while carried, once each", () => {
  const addon = on("", "5512 5512 99999");
  expect(shown(addon).map((c) => c.icon), "the trinket and the Healthstone in the bags").toEqual(["TEST-ONLY-ICON-Trinket", "TEST-ONLY-ICON-Healthstone"]);
  addon.eval("__wfgWorld.bags[0][1] = nil");
  refresh(addon);
  expect(shown(addon).map((c) => c.icon), "gone from the bags, gone from the row").toEqual(["TEST-ONLY-ICON-Trinket"]);
});

it("shows nothing for an item whose cooldown the client hides", () => {
  const addon = on("__itemCd[30001] = { { __secret = true }, { __secret = true } }");
  expect(shown(addon), "a secret cooldown draws nothing").toEqual([]);
  addon.eval("__itemCd[30001] = { 100, 120 }");
  refresh(addon);
  expect(shown(addon).length, "readable again, it comes back").toBe(1);
});

it("lacks item APIs without an error", () => {
  const addon = on("C_Item.GetItemCooldown = nil\nC_Container = nil\nGetInventoryItemID = nil\nC_Item.GetItemSpell = nil");
  expect(shown(addon), "no cooldown source, nothing shown").toEqual([]);
  const container = on("C_Item.GetItemCooldown = nil\nC_Container = { GetItemCooldown = function() return 50, 60, 1 end }");
  expect(shown(container)[0].sweep, "C_Container's call stands in").toEqual([50, 60]);
});

it("shows pet abilities, with the game's duration object where it gives one", () => {
  const addon = on(`__petBar[1] = { name = "Attack", icon = "TEST-ONLY-ICON-Attack", token = true }
    __petBar[2] = { name = "Growl", icon = "TEST-ONLY-ICON-Growl", spell = 2649 }
    __petBar[3] = { name = "Bite", icon = "TEST-ONLY-ICON-Bite", spell = 17253 }
    __petCd[3] = { 200, 5 }
    __spellObj[2649] = __wfgWorld.durationObject(0, 5)`);
  const pets = shown(addon).filter((c) => c.icon.includes("Growl") || c.icon.includes("Bite"));
  expect(pets.map((c) => [c.icon, c.object, c.sweep]), "Growl takes the object, Bite the pet bar's numbers; the stance token is left out").toEqual([
    ["TEST-ONLY-ICON-Growl", 5, undefined], ["TEST-ONLY-ICON-Bite", undefined, [200, 5]],
  ]);
});

it("shows nothing for a pet ability the client hides", () => {
  const addon = on(`__petBar[1] = { name = "Bite", icon = "TEST-ONLY-ICON-Bite", spell = 17253 }
    __petCd[1] = { { __secret = true }, { __secret = true } }`);
  expect(shown(addon).filter((c) => c.icon.includes("Bite")), "secret numbers and no object").toEqual([]);
  addon.eval("__spellObj[17253] = __wfgWorld.durationObject(0, { __secret = true })");
  refresh(addon);
  expect(shown(addon).filter((c) => c.icon.includes("Bite")).length, "a secret-length duration object still goes to the sweep").toBe(1);
  const bare = on("GetPetActionInfo = nil");
  expect(shown(bare).length, "a client without a pet bar adds nothing").toBe(1);
  const noCd = on(`__petBar[1] = { name = "Bite", icon = "TEST-ONLY-ICON-Bite" }\nGetPetActionCooldown = nil`);
  expect(shown(noCd).filter((c) => c.icon.includes("Bite")), "no object, no pet bar cooldown").toEqual([]);
});

it("shows totems that are down", () => {
  const addon = on("__totems[2] = { 300, 60 }");
  expect(shown(addon).filter((c) => c.icon.includes("Totem")).map((c) => c.sweep), "a plain sweep").toEqual([[300, 60]]);
  addon.eval("GetTotemDuration = function() return __wfgWorld.durationObject(0, 60) end");
  refresh(addon);
  expect(shown(addon).filter((c) => c.icon.includes("Totem")).map((c) => c.object), "the client's duration object").toEqual([60]);
  addon.eval("__totems[2] = { { __secret = true }, { __secret = true } }\nGetTotemDuration = nil");
  refresh(addon);
  expect(shown(addon).filter((c) => c.icon.includes("Totem")), "hidden values show nothing").toEqual([]);
  expect(shown(on("GetTotemInfo = nil")).length, "a client without totems adds nothing").toBe(1);
});

it("leaves totems to the class bars when they show them", () => {
  const addon = on("__totems[1] = { 300, 60 }");
  expect(shown(addon).filter((c) => c.icon.includes("Totem")).length, "shown until the class bars take over").toBe(1);
  addon.eval('ns.GetModule("ClassBars").cells = {}');
  refresh(addon);
  expect(shown(addon).filter((c) => c.icon.includes("Totem")), "the class bars own the totems").toEqual([]);
});

it("keeps at most twelve icons, and updates in combat", () => {
  const many = Array.from({ length: 10 }, (_, i) => `__petBar[${i + 1}] = { name = "P${i}", icon = "TEST-ONLY-ICON-P${i}", spell = ${i + 1} }`).join("\n");
  const addon = on(many + "\n__totems[1] = { 1, 2 }\n__totems[2] = { 1, 2 }\n__totems[3] = { 1, 2 }", "5512");
  expect(list(cells(addon)).length, "capped").toBe(12);
  setCombat(addon, true);
  addon.eval("__itemCd[30001] = { 100, 120 }");
  addon.fire("BAG_UPDATE_COOLDOWN");
  expect(shown(addon)[0].sweep, "the sweep follows in combat").toEqual([100, 120]);
});

it("/vg gaps chooses items by ID, link or name", () => {
  const addon = on("", "");
  addon.slash("gaps add 5512");
  addon.slash("gaps add 5512");
  expect(chatHas(addon, /Already showing item 5512/), "twice says so").toBe(true);
  expect(shown(addon).map((c) => c.icon), "added at once").toContain("TEST-ONLY-ICON-Healthstone");
  addon.slash("gaps remove 5512");
  addon.slash("gaps remove 5512");
  expect(chatHas(addon, /not on the list/), "removing what isn't there says so").toBe(true);
  addon.slash("gaps add |cffffffff|Hitem:5512::::::::|h[x]|h|r");
  addon.slash("gaps add TEST-ONLY Healthstone");
  addon.slash("gaps");
  expect(chatHas(addon, /Chosen items: 5512\./), "listed").toBe(true);
  addon.slash("gaps add nonsense");
  expect(chatHas(addon, /Say an item/), "an unknown name is refused").toBe(true);
  addon.slash("gaps add");
  addon.slash("gaps clear");
  addon.slash("gaps");
  expect(chatHas(addon, /Chosen items: none/), "cleared").toBe(true);
});
