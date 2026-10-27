// cooldowngaps: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/CooldownGaps.lua: a display-only row for the items, pet abilities and totems the
// game's Cooldown Manager misses; hidden cooldown values show nothing.

import fs from "node:fs";
import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { CLICK_LUA, SETUP_DONE, chatHas, loggedIn, setCombat } from "./helpers.mjs";

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
  expect(chatHas(addon, /cooldown gaps row is off\. Tick Gaps row under \/vg > Cooldowns, then \/reload\.$/), "the command names the page its switch is on").toBe(true);
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

it("a totem slot whose 'down' answer the client hides adds nothing and raises nothing", () => {
  const addon = on(`__totems[2] = { 300, 60 }
    local real = GetTotemInfo
    GetTotemInfo = function(slot) local have, name, start, length, icon = real(slot) return __wfgWorld.secret(have), name, start, length, icon end`);
  expect([shown(addon).filter((c) => c.icon.includes("Totem")), addon.eval("return #ns.errors")], "a hidden answer is never compared: no totem").toEqual([[], 0]);
});

it("leaves totems to the class bars when they show them", () => {
  const addon = on("__totems[1] = { 300, 60 }");
  expect(shown(addon).filter((c) => c.icon.includes("Totem")).length, "shown until the class bars take over").toBe(1);
  addon.eval('ns.GetModule("ClassBars").cells = {}');
  refresh(addon);
  expect(shown(addon).filter((c) => c.icon.includes("Totem")), "the class bars own the totems").toEqual([]);
});

it("keeps at most twenty icons, and updates in combat", () => {
  const many = Array.from({ length: 10 }, (_, i) => `__petBar[${i + 1}] = { name = "P${i}", icon = "TEST-ONLY-ICON-P${i}", spell = ${i + 1} }`).join("\n");
  const spells = Array.from({ length: 8 }, (_, i) => `__wfgWorld.spells[${600 + i}] = { name = "S${i}", icon = "TEST-ONLY-ICON-S${i}" }`).join("\n");
  const addon = on(SPELLS_ENV + many + "\n" + spells + "\n__totems[1] = { 1, 2 }\n__totems[2] = { 1, 2 }\n__totems[3] = { 1, 2 }", "5512");
  addon.eval("ns.GetModule('CooldownGaps').settings.spells = '600 601 602 603 604 605 606 607' ns.GetModule('CooldownGaps').Refresh()");
  expect(list(cells(addon)).length, "capped").toBe(20);
  setCombat(addon, true);
  addon.eval("__itemCd[30001] = { 100, 120 }");
  addon.fire("BAG_UPDATE_COOLDOWN");
  expect(shown(addon).find((c) => c.icon.includes("Trinket"))?.sweep, "the sweep follows in combat").toEqual([100, 120]);
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

// TEST-ONLY: spells the player knows, spell cooldown tables, and the Cooldown Manager's essential and utility rows.
const SPELLS_ENV = `
  Enum.CooldownViewerCategory = { Essential = 0, Utility = 1 }
  __wfgWorld.spells[501] = { name = "Strike", icon = "TEST-ONLY-ICON-Strike" }
  __wfgWorld.spells[502] = { name = "Guard", icon = "TEST-ONLY-ICON-Guard" }
  __wfgWorld.spells[503] = { name = "Rush", icon = "TEST-ONLY-ICON-Rush" }
  __spellCd, __sets, __infos = {}, { [0] = { 11, 12 }, [1] = { 13, 14 } }, {
    [11] = { spellID = 501, isKnown = true }, [12] = { spellID = 502, overrideSpellID = 503, isKnown = true },
    [13] = { spellID = 999, isKnown = false }, [14] = { spellID = 501, isKnown = true },
  }
  C_Spell.GetSpellCooldown = function(id) local c = __spellCd[id] or { 0, 0 } return { startTime = c[1], duration = c[2], isOnGCD = c[3] } end
  C_CooldownViewer.GetCooldownViewerCategorySet = function(category) return __sets[category] end
  C_CooldownViewer.GetCooldownViewerCooldownInfo = function(id) return __infos[id] end
`;

it("draws the spells you choose, with the game's duration object or plain numbers, and a ready spell without a sweep", () => {
  const addon = on(SPELLS_ENV + "__spellObj[501] = __wfgWorld.durationObject(0, 30)\n__spellCd[502] = { 400, 8 }\n__spellCd[503] = { 0, 0 }");
  addon.slash("gaps spell add 501");
  addon.slash("gaps spell add Guard");
  addon.slash("gaps spell add 503");
  expect(shown(addon).filter((c) => c.icon.includes("Strike") || c.icon.includes("Guard") || c.icon.includes("Rush")).map((c) => [c.icon, c.object, c.sweep]), "Strike takes the object, Guard the numbers, Rush has no cooldown running").toEqual([
    ["TEST-ONLY-ICON-Strike", 30, undefined], ["TEST-ONLY-ICON-Guard", undefined, [400, 8]], ["TEST-ONLY-ICON-Rush", undefined, undefined],
  ]);
  expect(chatHas(addon, /Showing spell 501\./), "says so").toBe(true);
});

it("a spell with hidden numbers and no object shows nothing; a hidden-length object still sweeps; the global cooldown is not a sweep", () => {
  const addon = on(SPELLS_ENV + "__spellCd[501] = { { __secret = true }, { __secret = true } }");
  addon.slash("gaps spell add 501");
  expect(shown(addon).map((c) => c.icon), "no object and hidden numbers: no icon, no guess").toEqual(["TEST-ONLY-ICON-Trinket"]);
  addon.eval("__spellObj[501] = __wfgWorld.durationObject(0, { __secret = true })");
  refresh(addon);
  expect(shown(addon)[0].object === undefined, "a hidden-length object goes to the sweep").toBe(false);
  expect(addon.eval("return #ns.errors"), "no error").toBe(0);
  const noObj = on(SPELLS_ENV + "C_Spell.GetSpellCooldownDuration = nil\n__spellCd[501] = { { __secret = true }, 5 }");
  noObj.slash("gaps spell add 501");
  expect(shown(noObj).map((c) => c.icon), "a client without duration objects and hidden numbers draws nothing for it").toEqual(["TEST-ONLY-ICON-Trinket"]);
  const gcd = on(SPELLS_ENV + "__spellCd[501] = { 100, 1.5, true }");
  gcd.slash("gaps spell add 501");
  expect([shown(gcd)[0].icon, shown(gcd)[0].sweep], "the global cooldown alone leaves the icon ready").toEqual(["TEST-ONLY-ICON-Strike", undefined]);
});

it("with the switch on, the manager's essential and utility spells are drawn once each, known ones only, overrides first", () => {
  const addon = on(SPELLS_ENV, "");
  addon.eval("ns.GetModule('CooldownGaps').settings.tracked = true ns.GetModule('CooldownGaps').Rebuild()");
  expect(shown(addon).slice(0, 2).map((c) => c.icon), "Strike, then Guard's override Rush; the unknown one and the repeat are left out").toEqual(["TEST-ONLY-ICON-Strike", "TEST-ONLY-ICON-Rush"]);
  addon.eval("__sets[0] = { 14 } ns.GetModule('CooldownGaps').Rebuild()");
  expect(shown(addon)[0].icon, "the list is read again on a change").toBe("TEST-ONLY-ICON-Strike");
  addon.eval("ns.GetModule('CooldownGaps').settings.tracked = false ns.GetModule('CooldownGaps').Rebuild()");
  expect(shown(addon).map((c) => c.icon), "switched off: only the trinket").toEqual(["TEST-ONLY-ICON-Trinket"]);
});

it("a client without the manager's calls, or that refuses them, adds nothing and raises no error", () => {
  const settings = "ns.GetModule('CooldownGaps').settings.tracked = true ns.GetModule('CooldownGaps').Rebuild()";
  const none = on("");
  none.eval(settings);
  expect(shown(none).map((c) => c.icon), "no Enum.CooldownViewerCategory").toEqual(["TEST-ONLY-ICON-Trinket"]);
  const refuses = on(SPELLS_ENV + "C_CooldownViewer.GetCooldownViewerCategorySet = function() error('no') end");
  refuses.eval(settings);
  expect(shown(refuses).map((c) => c.icon), "a refused set").toEqual(["TEST-ONLY-ICON-Trinket"]);
  const hidden = on(SPELLS_ENV + "C_CooldownViewer.GetCooldownViewerCategorySet = function() return __wfgWorld.secret(1) end");
  hidden.eval(settings);
  expect(shown(hidden).map((c) => c.icon), "a hidden set").toEqual(["TEST-ONLY-ICON-Trinket"]);
  const badInfo = on(SPELLS_ENV + "__infos[11] = __wfgWorld.secret(1) __infos[12] = 5 __infos[14] = { spellID = __wfgWorld.secret(1) }");
  badInfo.eval(settings);
  expect(shown(badInfo).map((c) => c.icon), "hidden or odd info").toEqual(["TEST-ONLY-ICON-Trinket"]);
  const missing = on(SPELLS_ENV + "C_CooldownViewer.GetCooldownViewerCooldownInfo = nil");
  missing.eval(settings);
  expect([shown(missing).length, missing.eval("return #ns.errors")], "a client without the info call").toEqual([1, 0]);
});

it("the tracked spells follow a spec or spellbook change, and the spell commands list, remove and refuse", () => {
  const addon = on(SPELLS_ENV, "");
  addon.eval("ns.GetModule('CooldownGaps').settings.tracked = true");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect(shown(addon).length, "read on a spec change").toBe(3);
  addon.eval("__sets[0] = {} __sets[1] = {}");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "party1");
  expect(shown(addon).length, "another unit's spec change is not read").toBe(3);
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(shown(addon).length, "the end of a fight reads the manager's list again").toBe(1);
  addon.eval("__sets[0] = { 11 }");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED");
  expect(shown(addon).length, "an event naming no unit counts").toBe(2);
  addon.slash("gaps spell add 501");
  addon.slash("gaps spell add 501");
  expect(chatHas(addon, /Already showing spell 501/), "twice says so").toBe(true);
  addon.slash("gaps spell");
  addon.slash("gaps");
  expect(chatHas(addon, /Chosen spells: 501\. \/vg gaps spell add/), "listed").toBe(true);
  addon.slash("gaps spell add |cff71d5ff|Hspell:502|h[Guard]|h|r");
  addon.slash("gaps spell add nonsense");
  expect(chatHas(addon, /Say a spell/), "an unknown name is refused").toBe(true);
  addon.slash("gaps spell remove 501");
  addon.slash("gaps spell remove 501");
  expect(chatHas(addon, /Spell 501 is not on the list/), "removing what isn't there says so").toBe(true);
  addon.slash("gaps spell add");
  addon.slash("gaps clear");
  addon.slash("gaps spell");
  expect(chatHas(addon, /Chosen spells: none/), "cleared").toBe(true);
});

// TEST-ONLY: finds the Gaps card's rows on the open options page (their tab shown). __entry(name) is a chosen entry's row,
// __addRow() the add row; __chosen() the saved lists.
const CARD_LUA = `
  function __entry(name)
    for _, w in ipairs(__wfgStub.frames) do if w.remove and w.label and w.label.__text == name and ns.Options.RevealRow(w) then return w end end
  end
  function __addRow()
    for _, w in ipairs(__wfgStub.frames) do if w.input and w.spell and ns.Options.RevealRow(w) then return w end end
  end
  function __chosen() local s = ns.GetModule("CooldownGaps").settings return { s.items, s.spells } end
`;
// The Gaps card's rows as the page lists them: each row's kind and caption.
const cardRows = (addon) => addon.eval(`local out = {} for i, r in ipairs(ns.GetModule("CooldownGaps").CardRows()) do out[i] = { r[1], r[2] or false } end return out`);
// An addon with the row on, SPELLS_ENV and the chosen items, on the open Cooldowns page.
function card(items, spells = "") {
  const addon = on(SPELLS_ENV + CLICK_LUA + CARD_LUA, items);
  addon.eval(`ns.GetModule("CooldownGaps").settings.spells = "${spells}" ns.Options.Show("cooldowns")`);
  return addon;
}

it("the Gaps card lists the chosen items and spells with their icons, and × takes one off", () => {
  const addon = card("5512 30001", "501");
  expect(cardRows(addon), "items first, then spells, then the add row").toEqual([["gapentry", "TEST-ONLY Healthstone"], ["gapentry", "TEST-ONLY Trinket"], ["gapentry", "Strike"], ["gapadd", false]]);
  expect(addon.eval('return { __entry("TEST-ONLY Healthstone").icon.__texture, __entry("Strike").icon.__texture }'), "each with its icon").toEqual(["TEST-ONLY-ICON-Healthstone", "TEST-ONLY-ICON-Strike"]);
  addon.eval('local r = __entry("TEST-ONLY Healthstone") r.remove.__scripts.OnClick(r.remove)');
  expect(addon.eval("return __chosen()"), "× takes the item off").toEqual(["30001", "501"]);
  expect(addon.eval('return __entry("TEST-ONLY Healthstone") == nil and __entry("TEST-ONLY Trinket") ~= nil'), "and the card lists the rest at once").toBe(true);
  addon.eval('local r = __entry("Strike") r.remove.__scripts.OnClick(r.remove)');
  expect(addon.eval("return __chosen()[2]"), "a spell too").toBe("");
});

it("the Gaps card's add row takes a dragged item or spell, or a typed name", () => {
  const addon = card("");
  expect(cardRows(addon), "nothing chosen: the note, then the add row").toEqual([["text", "Nothing chosen yet. Drag an item or spell here, or type its name."], ["gapadd", false]]);
  addon.eval('__wfgWorld.cursor = { type = "item", id = 30001 } local r = __addRow() r.__scripts.OnReceiveDrag(r)');
  expect(addon.eval("return { __chosen()[1], __wfgWorld.cursor == nil }"), "a dragged trinket goes on the list and leaves the cursor").toEqual(["30001", true]);
  addon.eval('__wfgWorld.cursor = { type = "spell", id = 502 } local r = __addRow() r.__scripts.OnMouseUp(r, "RightButton")');
  expect(addon.eval("return { __chosen()[2], __wfgWorld.cursor ~= nil }"), "a right-click on the row leaves the cursor alone").toEqual(["", true]);
  addon.eval('local r = __addRow() r.__scripts.OnMouseUp(r, "LeftButton")');
  expect(addon.eval("return __chosen()[2]"), "a spell from the spellbook, dropped with a click").toBe("502");
  addon.eval('local r = __addRow() r.__scripts.OnReceiveDrag(r)');
  expect(addon.eval("return __chosen()"), "an empty cursor adds nothing").toEqual(["30001", "502"]);
  addon.eval('local r = __addRow() r.input:SetText("TEST-ONLY Healthstone") r.item.__scripts.OnClick(r.item)');
  addon.eval('local r = __addRow() r.input:SetText("Strike") r.spell.__scripts.OnClick(r.spell)');
  addon.eval('local r = __addRow() r.input:SetText("") r.spell.__scripts.OnClick(r.spell)');
  expect(addon.eval("return __chosen()"), "typed names go on as an item and a spell; an empty box adds nothing").toEqual(["30001 5512", "502 501"]);
  expect(addon.eval('return __entry("Strike") ~= nil'), "and show on the card").toBe(true);
  addon.slash("gaps clear");
  expect(cardRows(addon)[0][0], "a /vg gaps change shows on the card too").toBe("text");
  expect(addon.eval('return __entry("Strike") == nil'), "with the page redrawn").toBe(true);
});

it("the Gaps card says to switch the row on while it is off", () => {
  const addon = loggedIn(GAPS_ENV);
  expect(cardRows(addon), "only the note: the chosen lists load with the row").toEqual([["text", "The gaps row is off. Tick Gaps row and reload to choose its items and spells."]]);
});

// A string's real translation, read from Locales/<locale>.lua (the line `L["key"] = "text"`).
function realText(locale, key) {
  const source = fs.readFileSync(new URL(`../../Locales/${locale}.lua`, import.meta.url), "utf8");
  const line = source.split("\n").find((l) => l.startsWith(`L[${JSON.stringify(key)}] = `));
  return JSON.parse(line.slice(line.indexOf("] = ") + 4));
}

it("the Gaps card's add row shows its buttons whole in German and Russian, and the box takes the room left", () => {
  const keys = ["Add spell", "Add item", "Drag here, or type"];
  for (const [locale, scale] of [["deDE", 1], ["deDE", 1.3], ["ruRU", 1.3]]) {
    const addon = createAddon({ savedVariables: SETUP_DONE + saved(""), textFit: true });
    addon.eval(GAPS_ENV + SPELLS_ENV + CLICK_LUA + CARD_LUA);
    addon.eval(keys.map((key) => `ns.L[${JSON.stringify(key)}] = ${JSON.stringify(realText(locale, key))}`).join(" "));
    addon.login();
    addon.eval(`ns.Theme.Settings().textScale = ${scale} ns.Theme.Refresh() ns.Options.Show("cooldowns")`);
    const row = addon.eval(`local r = __addRow() return { r.label:GetRight(), r.input:GetLeft(), r.input:GetRight(), r.item:GetLeft(), r.input:GetWidth() }`);
    expect(row[1], `${locale} ${scale}: the box starts after the label`).toBeGreaterThanOrEqual(row[0]);
    expect(row[2], `${locale} ${scale}: and ends before the buttons`).toBeLessThanOrEqual(row[3]);
    const mine = [...keys, ...keys.map((key) => realText(locale, key))];
    const cut = addon.textFit(null).filter((f) => mine.includes(f.text));
    expect(cut, `${locale} ${scale}: nothing on the add row is cut or overlapping`).toEqual([]);
  }
});
