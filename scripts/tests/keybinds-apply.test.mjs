// keybinds-apply: key setup's apply engine (Modules/KeybindsApply.lua) in the TEST-ONLY headless client:
// planning, Apply, its refusals and rollback, the split record, putting back one key or everything, the key set
// switch, a second character and the settings guard's backup. The presets here are test-only.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { luaValue } from "../lib/lua-emit.mjs";
import { chatHas, expectErrors, loggedIn, RETAIL, SETUP_DONE, setCombat } from "./helpers.mjs";

// TEST-ONLY spells the rogue knows: Attack, Sinister Strike, Kick, Gouge, Stealth; Eviscerate is not learned.
const SPELLS = [[6603, "Attack"], [1752, "Sinister Strike"], [1766, "Kick"], [1776, "Gouge"], [1784, "Stealth"]];

// The rogue's bars: Sinister Strike on 1, Attack on 2, a macro on 3.
const BARS = `__wfgWorld.setAction(1, { id = 1752 }) __wfgWorld.setAction(2, { id = 6603 }) __wfgWorld.setAction(3, { type = "macro", id = 5 })`;

// A test-only preset: Sinister Strike on 1 (already there), Kick on F (bar 2's first slot, empty),
// Gouge on 2 (Attack moves aside to bar 3), Stealth on G (bar 2's second), and the first stance on `.
const PRESET = `{ { key = "1", spell = 1752, slot = 1 }, { key = "F", spell = 1766, slot = 61 }, { key = "2", spell = 1776, slot = 2 },
  { key = "G", spell = 1784, slot = 62 }, { key = "\`", command = "SHAPESHIFTBUTTON1" } }`;

// A logged-in rogue (Aren of Forever Test) with the spells learned and the starting bars.
function rogue(savedVariables = "", client = "") {
  const addon = loggedIn("", { savedVariables, client });
  addon.eval('__wfgWorld.setUnit("player", { name = "Aren" })');
  for (const [id, name] of SPELLS) addon.world.learn(id, { name });
  addon.eval(BARS);
  addon.clearChat();
  return addon;
}

// Runs Lua with the engine as KA and returns its result.
const ka = (addon, lua) => addon.eval(`local KA = ns.KeybindsApply ${lua}`);

// The plan's rows as "key kind why slot to" strings.
const plan = (addon, preset = PRESET) => ka(addon, `local out = {} for i, r in ipairs(KA.Plan(${preset})) do
  out[i] = table.concat({ r.key or "-", r.kind, r.why or "-", tostring(r.slot or "-"), tostring(r.to or "-") }, " ") end return out`);

// The spell or action ID on each slot, 0 for an empty one.
const slots = (addon, list) => addon.eval(`local out = {} for i, s in ipairs({ ${list.join(",")} }) do out[i] = select(2, GetActionInfo(s)) or 0 end return out`);

// Every bound key and its command, and every filled slot: what a put-back must restore.
const state = (addon) => addon.eval(`local acts = {} for s = 1, 180 do local kind, id = GetActionInfo(s) if kind then acts[#acts + 1] = s .. "=" .. kind .. ":" .. tostring(id) end end
  return { keys = __wfgWorld.keyPreimage(), actions = table.concat(acts, " "), set = GetCurrentBindingSet() }`);

// A saved table as Lua source, number keys kept as numbers (as the game writes SavedVariables).
const dump = (addon, expr) => addon.eval(`local function dump(v)
    if type(v) ~= "table" then return type(v) == "string" and string.format("%q", v) or tostring(v) end
    local out = {} for k, x in pairs(v) do out[#out + 1] = "[" .. dump(k) .. "] = " .. dump(x) end
    return "{ " .. table.concat(out, ", ") .. " }"
  end return dump(${expr})`);

// The commands of a few keys.
const keys = (addon, list) => addon.eval(`local out = {} for i, k in ipairs(${luaValue(list)}) do out[i] = GetBindingAction(k) end return out`);

// Puts the rogue's Kick on a slot and binds F to that slot's button in the Account set, saved.
const kickOn = (addon, slot, command) => addon.eval(`__wfgWorld.setAction(${slot}, { id = 1766 }) SetBinding("F", "${command}") SaveBindings(1)`);

// The text on bar 2's first button's hotkey.
const hotkey = (addon) => addon.eval("return Vanguard_Bar2Button1.hotkey:GetText()");

it("Plan: each entry becomes a row by the three-way rule, and nothing changes", () => {
  const addon = rogue();
  const before = state(addon);
  expect(plan(addon), "already bound, place on empty, move a known spell to bar 3, place, a command for a stance key").toEqual([
    "1 unchanged already 1 -", "F place - 61 -", "2 move - 2 53", "G place - 62 -", "` command - - -",
  ]);
  expect(state(addon), "a plan writes nothing").toEqual(before);
});

it("Plan: a macro, a spell not learned yet, a slot outside bars 1 to 3 and a key or button already used keep their keys", () => {
  const addon = rogue();
  expect(plan(addon, `{ { key = "H", spell = 1776, slot = 3 }, { key = "J", spell = 2098, slot = 4 }, { key = "K", spell = 1766, slot = 25 },
    { key = "F", spell = 1766, slot = 63 }, { key = "F", spell = 1784, slot = 64 }, { key = "L", spell = 1766, slot = 65 } }`)).toEqual([
    "H unchanged kept 3 -", "J unchanged unknown 4 -", "K unchanged outside 25 -", "F place - 63 -", "F unchanged used 64 -", "L unchanged used 65 -",
  ]);
});

it("Plan: a bar 2 or 3 entry finds its spell on its own bar first, then the other; a bar 1 entry stays on its own button", () => {
  const addon = rogue();
  addon.eval("__wfgWorld.setAction(50, { id = 1766 }) __wfgWorld.setAction(64, { id = 1766 })");
  expect(plan(addon, `{ { key = "F", spell = 1766, slot = 61 }, { key = "4", spell = 1752, slot = 4 } }`)).toEqual(["F bind - 64 -", "4 place - 4 -"]);
  addon.eval("__wfgWorld.setAction(64, nil)");
  expect(plan(addon, `{ { key = "F", spell = 1766, slot = 61 } }`), "then bar 3").toEqual(["F bind - 50 -"]);
  expect(ka(addon, "return { KA.CommandFor(1), KA.CommandFor(80), KA.CommandFor(63), KA.CommandFor(50), KA.CommandFor(25) }"), "each range's command")
    .toEqual(["ACTIONBUTTON1", "ACTIONBUTTON8", "MULTIACTIONBAR1BUTTON3", "MULTIACTIONBAR2BUTTON2"]);
});

it("Plan: a bar Vanguard doesn't draw is never written, nor searched", () => {
  const addon = rogue("VanguardDB.profiles = { Default = { ActionBars = { bars = { [2] = { enabled = false } } } } }");
  addon.eval("__wfgWorld.setAction(61, { id = 1766 })");
  expect(plan(addon, `{ { key = "F", spell = 1766, slot = 62 }, { key = "G", spell = 1766, slot = 49 } }`), "bar 2 is off; Kick on it isn't found from bar 3")
    .toEqual(["F unchanged barOff 62 -", "G place - 49 -"]);
});

it("Plan: with bar 3 off or full, a known spell stays where it is, and a spell the character doesn't know is never moved", () => {
  const off = rogue("VanguardDB.profiles = { Default = { ActionBars = { bars = { [3] = { enabled = false } } } } }");
  expect(plan(off, `{ { key = "2", spell = 1776, slot = 2 } }`), "bar 3 off: nowhere to move Attack").toEqual(["2 unchanged full 2 -"]);
  const full = rogue();
  full.eval("for s = 53, 60 do __wfgWorld.setAction(s, { type = 'item', id = 929 }) end __wfgWorld.setAction(4, { id = 999 })");
  expect(plan(full, `{ { key = "2", spell = 1776, slot = 2 }, { key = "4", spell = 1776, slot = 4 } }`)).toEqual(["2 unchanged full 2 -", "4 unchanged kept 4 -"]);
});

it("Plan: one key takes the same button on several bar 1 pages, but no other command", () => {
  const addon = rogue();
  expect(plan(addon, `{ { key = "3", spell = 1766, slot = 75 }, { key = "3", spell = 1776, slot = 87 }, { key = "3", spell = 1784, slot = 63 } }`))
    .toEqual(["3 place - 75 -", "3 place - 87 -", "3 unchanged used 63 -"]);
});

it("Plan: a key already set keeps its button from later rows", () => {
  const addon = rogue();
  kickOn(addon, 62, "MULTIACTIONBAR1BUTTON2");
  expect(plan(addon, `{ { key = "F", spell = 1766, slot = 61 }, { key = "G", spell = 1784, slot = 62 }, { key = "F", spell = 1784, slot = 63 } }`))
    .toEqual(["F unchanged already 62 -", "G unchanged used 62 -", "F unchanged used 63 -"]);
});

it("Apply: places the spells, binds and saves the keys, and the buttons show them", () => {
  const addon = rogue();
  expect(ka(addon, `return KA.SharesKeys()`), "the Account set is in use").toBe(true);
  expect(ka(addon, `return KA.Apply(${PRESET})`)).toBe(true);
  expect(slots(addon, [1, 2, 3, 53, 61, 62]), "Gouge on 2, Attack moved to 53, Kick and Stealth on bar 2, the macro untouched").toEqual([1752, 1776, 5, 6603, 1766, 1784]);
  expect(keys(addon, ["F", "G", "2", "`", "1"])).toEqual(["MULTIACTIONBAR1BUTTON1", "MULTIACTIONBAR1BUTTON2", "ACTIONBUTTON2", "SHAPESHIFTBUTTON1", "ACTIONBUTTON1"]);
  expect(addon.eval("return __wfgWorld.bindingsSaved()"), "saved in the set in use").toBe(true);
  expect(hotkey(addon), "the button's hotkey repaints").toBe("F");
  expect(chatHas(addon, /4 key\(s\) set\. Vanguard kept what the keys did before/)).toBe(true);
  expect(addon.eval("return __wfgWorld.discarded[1].id"), "the only action dropped is the known spell that moved").toBe(6603);
});

it("Apply: the record is split, keys with the Account set and slots with the character", () => {
  const addon = rogue();
  ka(addon, `KA.Apply(${PRESET})`);
  const sv = addon.savedVariables();
  expect(Object.keys(sv.account.keyRestore.keys).sort()).toEqual(["2", "F", "G", "`"]);
  expect(sv.account.keyRestore.keys["2"], "a key row: what it did, what it does, who applied it").toEqual({ before: "ACTIONBUTTON2", after: "ACTIONBUTTON2", by: { "Aren-ForeverTest": true } });
  expect(sv.char.slotRestore["53"] ?? sv.char.slotRestore[53], "a slot row: empty before, then a layer for its key and key set").toEqual({ before: false, layers: [{ key: "2", after: 6603, set: 1 }] });
  expect(ka(addon, 'return { KA.Changed("F"), KA.Changed("1") }'), "the record marks what Vanguard changed").toEqual([true, false]);
});

it("Apply on bar 1's stance pages: one key on two pages, and putting it back clears both", () => {
  const addon = rogue();
  const before = state(addon);
  expect(ka(addon, `return KA.Apply({ { key = "3", spell = 1766, slot = 75 }, { key = "3", spell = 1776, slot = 87 } })`)).toBe(true);
  expect([slots(addon, [75, 87]), keys(addon, ["3"])]).toEqual([[1766, 1776], ["ACTIONBUTTON3"]]);
  ka(addon, 'KA.PutBack("3")');
  expect(state(addon)).toEqual(before);
});

it("Put everything back: every key and slot returns to what it was, and the records go", () => {
  const addon = rogue();
  const before = state(addon);
  ka(addon, `KA.Apply(${PRESET})`);
  expect(ka(addon, "return KA.PutBackAll()")).toBe(true);
  expect(state(addon), "keys, CLICK keys included, and slots are as before").toEqual(before);
  expect(addon.eval("return __wfgWorld.bindingsSaved()"), "and saved").toBe(true);
  expect(chatHas(addon, /Put back 4 key\(s\)\.$/)).toBe(true);
  const sv = addon.savedVariables();
  expect([sv.account.keyRestore, sv.char.slotRestore], "nothing is left to put back").toEqual([undefined, {}]);
  expect(ka(addon, "return KA.PutBackAll()"), "a second press has nothing to do").toBe(false);
  expect(chatHas(addon, /Vanguard hasn't changed any of your keys\.$/)).toBe(true);
});

it("Put back one key: only that key and the spells it moved go back", () => {
  const addon = rogue();
  ka(addon, `KA.Apply(${PRESET})`);
  expect(ka(addon, 'return KA.PutBack("2")')).toBe(true);
  expect(slots(addon, [2, 53, 61]), "Attack is back on 2, bar 3's slot is empty again, Kick stays").toEqual([6603, 0, 1766]);
  expect(keys(addon, ["2", "F"])).toEqual(["ACTIONBUTTON2", "MULTIACTIONBAR1BUTTON1"]);
  expect(ka(addon, 'return { KA.PutBack("2"), KA.PutBack("1") }'), "neither is Vanguard's now").toEqual([false, false]);
  expect(chatHas(addon, /Vanguard didn't change that key\.$/)).toBe(true);
});

it("Put back skips a key or slot the player changed since, and says which", () => {
  const addon = rogue();
  ka(addon, `KA.Apply(${PRESET})`);
  addon.eval('SetBinding("F", "ACTIONBUTTON9") __wfgWorld.setAction(62, { type = "macro", id = 7 })');
  ka(addon, 'KA.PutBack("F")');
  expect([keys(addon, ["F"]), slots(addon, [61])], "F stays as the player set it; Kick, Vanguard's, comes off").toEqual([["ACTIONBUTTON9"], [0]]);
  expect(chatHas(addon, /Changed since, so left as you set them: F\.$/)).toBe(true);
  ka(addon, "KA.PutBackAll()");
  expect([keys(addon, ["G"]), slots(addon, [62])], "G goes back, the macro stays").toEqual([[""], [7]]);
});

it("Put back keeps a key the game refuses, and says so", () => {
  const addon = rogue();
  ka(addon, `KA.Apply(${PRESET})`);
  addon.eval('local set = SetBinding SetBinding = function(key, command) if key == "F" then return false end return set(key, command) end');
  expect(ka(addon, 'return KA.PutBack("F")')).toBe(false);
  expect(chatHas(addon, /The game refused to put back: F\.$/)).toBe(true);
  expect([ka(addon, 'return KA.Changed("F")'), slots(addon, [61])], "the row stays, and so does Kick").toEqual([true, [1766]]);
});

it("Apply twice: the first pre-image is kept, so putting back returns to before the first", () => {
  const addon = rogue();
  const before = state(addon);
  ka(addon, `KA.Apply({ { key = "F", spell = 1766, slot = 61 } })`);
  ka(addon, `KA.Apply({ { key = "F", spell = 1784, slot = 62 }, { key = "G", spell = 1776, slot = 61 } })`);
  ka(addon, "KA.PutBackAll()");
  expect(state(addon), "both applies undone").toEqual(before);
});

it("Apply twice: what the player changed in between is what goes back", () => {
  const addon = rogue();
  ka(addon, `KA.Apply({ { key = "F", spell = 1766, slot = 61 } })`);
  addon.eval('__wfgWorld.setAction(61, { id = 2983 }) SetBinding("F", "TOGGLEWORLDMAP") SaveBindings(1)');
  addon.world.learn(2983, { name: "Sprint" });
  const between = state(addon);
  ka(addon, `KA.Apply({ { key = "F", spell = 1776, slot = 61 } })`);
  expect(slots(addon, [61, 53]), "Gouge on 61, Sprint moved aside").toEqual([1776, 2983]);
  ka(addon, "KA.PutBackAll()");
  expect(state(addon), "Sprint and the world map key are back").toEqual(between);
});

it("Apply twice on one slot: putting one key back never empties a button another key now uses", () => {
  const addon = rogue();
  const before = state(addon);
  ka(addon, `KA.Apply({ { key = "F", spell = 1766, slot = 61 } })`);
  ka(addon, `KA.Apply({ { key = "V", spell = 1776, slot = 61 } })`);
  ka(addon, 'KA.PutBack("F")');
  expect([slots(addon, [61, 53]), keys(addon, ["V", "F"])], "V keeps Gouge; F is free").toEqual([[1776, 1766], ["MULTIACTIONBAR1BUTTON1", ""]]);
  ka(addon, "KA.PutBackAll()");
  expect(state(addon)).toEqual(before);
});

it("Apply with nothing to change says so and keeps no record", () => {
  const addon = rogue();
  expect(ka(addon, `return KA.Apply({ { key = "1", spell = 1752, slot = 1 } })`)).toBe(true);
  expect(chatHas(addon, /No key needs changing\.$/)).toBe(true);
  expect(addon.savedVariables().account.keyRestore).toBe(undefined);
});

it("Apply and put-back refuse, never queue: in combat, under a restriction, with the key windows or keybind mode open, with a full cursor", () => {
  const addon = rogue();
  const before = state(addon);
  // Sets a state up, checks that Apply refuses with its chat line, and sets it back.
  const refused = (setup, undo, re) => {
    addon.eval(setup);
    expect(ka(addon, `return KA.Apply(${PRESET})`), String(re)).toBe(false);
    expect(chatHas(addon, re), String(re)).toBe(true);
    addon.eval(undo);
  };
  refused("__wfgStub.inCombat = true", "__wfgStub.inCombat = false", /Keys can't change in combat\./);
  refused("Enum.AddOnRestrictionType = { Combat = 0, Encounter = 1 } Enum.AddOnRestrictionState = { Inactive = 0 } C_RestrictedActions = { GetAddOnRestrictionState = function(k) return k == 1 and 2 or 0 end }",
    "C_RestrictedActions = nil", /Keys can't change while the game restricts add-ons\./);
  refused('SettingsPanel = CreateFrame("Frame", "SettingsPanel", UIParent)', "SettingsPanel:Hide()", /Close the game's Settings, Quick Keybind and Click Casting windows first\.$/);
  refused('ns.GetModule("ActionBars").KeybindMode(true)', 'ns.GetModule("ActionBars").KeybindMode(false)', /Leave keybind mode first\.$/);
  refused("C_Spell.PickupSpell(1766)", "ClearCursor()", /Put down what's on your cursor first\.$/);
  expect(state(addon), "nothing changed").toEqual(before);
  ka(addon, `KA.Apply(${PRESET})`);
  addon.clearChat();
  addon.eval("C_Spell.PickupSpell(1766)");
  expect(ka(addon, 'return { KA.PutBackAll(), KA.PutBack("F") }'), "put-back refuses the same way").toEqual([false, false]);
  expect(chatHas(addon, /Put down what's on your cursor first\.$/)).toBe(true);
  expect([ka(addon, 'return KA.Changed("F")'), slots(addon, [61])], "the record and the bars are as they were").toEqual([true, [1766]]);
});

it("Apply on a retail client offers nothing and writes nothing", () => {
  const addon = rogue("", RETAIL);
  const before = state(addon);
  expect(ka(addon, `return KA.Apply(${PRESET})`)).toBe(false);
  expect(chatHas(addon, /Vanguard's key setup is for WoW Forever only\.$/)).toBe(true);
  expect(state(addon), "nothing written").toEqual(before);
  expect(addon.savedVariables().account.keyRestore, "no record").toBe(undefined);
});

it("a key the client refuses fails the Apply: every slot and key goes back, and nothing is saved", () => {
  const addon = rogue();
  const before = state(addon);
  expect(ka(addon, `return KA.Apply({ { key = "F", spell = 1766, slot = 61 }, { key = "2", spell = 1776, slot = 2 }, { key = "f", spell = 1784, slot = 62 } })`)).toBe(false);
  expect(state(addon), "slots and keys as before").toEqual(before);
  expect(addon.eval("return __wfgWorld.bindingsSaved()"), "the unsaved keys were dropped").toBe(true);
  expect(chatHas(addon, /No key changed: the game refused one of the changes, so Vanguard put everything back\.$/)).toBe(true);
  expect(addon.savedVariables().account.keyRestore, "no record").toBe(undefined);
});

it("a spell that won't come off the spellbook fails the Apply before any key is set", () => {
  const addon = rogue();
  const before = state(addon);
  addon.eval("local pickup = C_Spell.PickupSpell C_Spell.PickupSpell = function(id) if id ~= 1784 then pickup(id) end end");
  expect(ka(addon, `return KA.Apply(${PRESET})`)).toBe(false);
  expect(state(addon), "Kick and Gouge came off again, Attack is back on 2").toEqual(before);
});

it("a forbidden call while an Apply runs fails it too", () => {
  const addon = rogue();
  const before = state(addon);
  addon.eval('local set = SetBinding SetBinding = function(...) __wfgStub.fire("ADDON_ACTION_FORBIDDEN", "Vanguard", "SetBinding()") return set(...) end');
  expect(ka(addon, `return KA.Apply(${PRESET})`)).toBe(false);
  expect(state(addon)).toEqual(before);
});

it("an error in the middle of an Apply is reported and puts everything back", () => {
  const addon = rogue();
  const before = state(addon);
  addon.eval('SetBinding = function() error("TEST-ONLY binding error") end');
  expectErrors("key setup apply: eval:2: TEST-ONLY binding error");
  expect(ka(addon, `return KA.Apply(${PRESET})`)).toBe(false);
  expect(state(addon).actions).toEqual(before.actions);
});

// combatAfterCalls counts the guarded calls: each spell placed is a pickup and a PlaceAction, each key a SetBinding.
it("a fight that starts in the middle of an Apply: the blocked write fails it, and the rest goes back after the fight", () => {
  const addon = rogue();
  const before = state(addon);
  addon.eval("__wfgWorld.combatAfterCalls(4)");
  expectErrors(/^blocked in combat: Core\/Client\.lua:\d+ called PlaceAction\(\), which the client refuses addon code in a fight$/);
  expect(ka(addon, `return KA.Apply(${PRESET})`)).toBe(false);
  expect(chatHas(addon, /No key changed: a fight began, so Vanguard puts your buttons back after it\.$/)).toBe(true);
  expect(slots(addon, [61]), "in the fight, Kick stays").toEqual([1766]);
  setCombat(addon, false);
  expect(state(addon), "after it, everything is as before").toEqual(before);
  expect(addon.eval("return __wfgWorld.bindingsSaved()")).toBe(true);
});

it("the rollback after a fight leaves what the player changed in it, and keeps a button it can't put back yet", () => {
  const addon = rogue();
  addon.eval("__wfgWorld.combatAfterCalls(4)");
  expectErrors(/^blocked in combat: Core\/Client\.lua:\d+ called PlaceAction\(\), which the client refuses addon code in a fight$/);
  ka(addon, `KA.Apply(${PRESET})`);
  addon.eval("__wfgWorld.cursor = { type = 'item', id = 929 }");
  setCombat(addon, false);
  expect([slots(addon, [61]), addon.eval("return #__wfgWorld.discarded")], "the cursor's item wasn't swapped onto a button").toEqual([[1766], 0]);
  expect(chatHas(addon, /1 button\(s\) couldn't be put back yet\. Put everything back restores them\.$/)).toBe(true);
  addon.eval("ClearCursor()");
  expect(ka(addon, "return KA.PutBackAll()")).toBe(true);
  expect(slots(addon, [61]), "now it goes").toEqual([0]);
  const macro = rogue();
  macro.eval("__wfgWorld.combatAfterCalls(4)");
  ka(macro, `KA.Apply(${PRESET})`);
  macro.eval('__wfgWorld.setAction(61, { type = "macro", id = 9 })');
  setCombat(macro, false);
  expect([slots(macro, [61]), macro.eval("return #__wfgWorld.discarded")], "a macro the player put there in the fight stays").toEqual([[9], 0]);
});

it("a save the client blocks fails the Apply, so no record is kept", () => {
  const addon = rogue();
  const before = state(addon);
  // 8 placement calls (three spells and Attack's move), 4 keys, then the save.
  addon.eval("__wfgWorld.combatAfterCalls(13)");
  expectErrors(/^blocked in combat: Modules\/KeybindsApply\.lua:\d+ called SaveBindings\(\), which the client refuses addon code in a fight$/);
  expect(ka(addon, `return KA.Apply(${PRESET})`)).toBe(false);
  setCombat(addon, false);
  expect(state(addon), "put back after the fight").toEqual(before);
  expect(addon.savedVariables().account.keyRestore).toBe(undefined);
});

it("Only this character: the set switches first, Account keeps its keys, and the key rows go in the character's file", () => {
  const addon = rogue();
  const account = state(addon).keys;
  expect(ka(addon, `return KA.Apply(${PRESET}, Enum.BindingSet.Character)`)).toBe(true);
  expect([addon.eval("return GetCurrentBindingSet()"), keys(addon, ["F"])], "Character is in use, with F").toEqual([2, ["MULTIACTIONBAR1BUTTON1"]]);
  const sv = addon.savedVariables();
  expect([sv.account.keyRestore, sv.char.keyRestore.set], "the record is the character's").toEqual([undefined, 2]);
  expect(ka(addon, "return KA.SharesKeys()")).toBe(false);
  addon.eval("LoadBindings(1)");
  expect(state(addon).keys, "the Account set never saw the change").toEqual(account);
});

it("Only this character: the plan is worked out in the character's own keys", () => {
  const addon = rogue();
  kickOn(addon, 61, "MULTIACTIONBAR1BUTTON1");
  addon.eval('__wfgWorld.bindingSets[2] = { ACTIONBUTTON1 = { "1" } }');
  expect(ka(addon, `return KA.Apply({ { key = "F", spell = 1766, slot = 61 } }, Enum.BindingSet.Character)`)).toBe(true);
  expect([addon.eval("return GetCurrentBindingSet()"), keys(addon, ["F"])], "F is bound in the character's set, which lacked it").toEqual([2, ["MULTIACTIONBAR1BUTTON1"]]);
});

it("Apply won't switch this character's own keys back to the account's", () => {
  const addon = rogue();
  addon.eval("SaveBindings(1) LoadBindings(2) SaveBindings(2)");
  expect(ka(addon, `return KA.Apply(${PRESET}, Enum.BindingSet.Account)`)).toBe(false);
  expect(chatHas(addon, /This character uses its own keys\. Switch to account keys in the game's key bindings first\.$/)).toBe(true);
  expect(addon.eval("return GetCurrentBindingSet()")).toBe(2);
});

it("a set switch that fails goes back to the set the player had, saved", () => {
  const addon = rogue();
  const before = state(addon);
  expect(ka(addon, `return KA.Apply({ { key = "f", spell = 1766, slot = 61 } }, Enum.BindingSet.Character)`)).toBe(false);
  expect(state(addon), "Account again, keys and slots as before").toEqual(before);
  expect(addon.eval("return __wfgWorld.bindingsSaved()")).toBe(true);
});

it("a set mismatch: keys set in the Account set can't be put back while the character set is in use", () => {
  const addon = rogue();
  ka(addon, `KA.Apply(${PRESET})`);
  addon.eval("SaveBindings(1) LoadBindings(2)");
  expect(ka(addon, 'return { KA.PutBackAll(), KA.PutBack("F") }')).toEqual([false, false]);
  expect(chatHas(addon, /Vanguard set these keys in your other key set/)).toBe(true);
  expect([ka(addon, 'return KA.Changed("F")'), slots(addon, [61])], "nothing changed").toEqual([false, [1766]]);
});

it("a second character puts the account's keys back; the first one's spells go back at its next login", () => {
  const first = rogue();
  const before = state(first);
  ka(first, `KA.Apply(${PRESET})`);
  const accountKeys = dump(first, "__wfgWorld.bindingSets[1]");
  const saved = { account: dump(first, "VanguardDB"), char: dump(first, "VanguardCharDB") };
  // Thrall, another character on the account: the same account file and key set, his own bars.
  const second = loggedIn('__wfgWorld.setUnit("player", { name = "Thrall" })', { savedVariables: `VanguardDB = ${saved.account}\nVanguardCharDB = {}\n` });
  second.eval(`__wfgWorld.bindingSets[1] = ${accountKeys} LoadBindings(1)`);
  expect(ka(second, "return KA.PutBackAll()")).toBe(true);
  expect(keys(second, ["F", "2", "`"]), "the keys are back").toEqual(["", "ACTIONBUTTON2", ""]);
  expect(chatHas(second, /Spells moved on Aren's bars go back when you log in as Aren\.$/)).toBe(true);
  expect(second.savedVariables().account.keyPending["Aren-ForeverTest"], "Aren's spells wait").toBeTruthy();
  const after = dump(second, "VanguardDB");
  // Aren logs in again: the account file as Thrall left it, Aren's own file and bars as Aren left them.
  const again = createAddon({ savedVariables: `${SETUP_DONE}VanguardDB = ${after}\nVanguardCharDB = ${saved.char}\n` });
  again.eval('__wfgWorld.setUnit("player", { name = "Aren" })');
  for (const [id, name] of SPELLS) again.world.learn(id, { name });
  again.eval("for s, id in pairs({ [1] = 1752, [2] = 1776, [53] = 6603, [61] = 1766, [62] = 1784 }) do __wfgWorld.setAction(s, { id = id }) end __wfgWorld.setAction(3, { type = 'macro', id = 5 })");
  again.login();
  expect(state(again).actions, "Aren's bars are as before the Apply").toEqual(before.actions);
  expect(chatHas(again, /The spells Vanguard moved on this character's bars are back where they were\.$/)).toBe(true);
  expect(again.savedVariables().account.keyPending["Aren-ForeverTest"], "nothing waits").toBe(undefined);
});

it("waiting spells stay waiting while the cursor holds something, and go back at the next load screen", () => {
  const addon = rogue("VanguardDB.keyPending = { ['Aren-ForeverTest'] = { F = true } }\nVanguardCharDB = { slotRestore = { [61] = { before = false, layers = { { key = 'F', after = 1766, set = 1 } } } } }\n");
  addon.eval("__wfgWorld.setAction(61, { id = 1766 }) C_Spell.PickupSpell(1784)");
  addon.fire("PLAYER_ENTERING_WORLD", false, false);
  expect(slots(addon, [61]), "the cursor is full: it waits").toEqual([1766]);
  addon.eval("ClearCursor()");
  addon.fire("PLAYER_ENTERING_WORLD", false, false);
  expect(slots(addon, [61]), "then it goes back").toEqual([0]);
});

it("the settings guard's backup: logout keeps a copy of the account's key record, and a lost account file gets it back", () => {
  const addon = rogue();
  ka(addon, `KA.Apply(${PRESET})`);
  addon.fire("PLAYER_LOGOUT");
  const saved = addon.savedVariables();
  expect(saved.char.keyBackup.keyRestore, "the copy").toEqual(saved.account.keyRestore);
  // The account file comes back blank: no guard stamp for this character, so the guard reports a loss.
  const lost = loggedIn('__wfgWorld.setUnit("player", { name = "Aren" })', { savedVariables: `VanguardDB = { version = 2, profiles = {}, setupDone = true }\nVanguardCharDB = ${dump(addon, "VanguardCharDB")}\n` });
  expect(lost.eval("return ns.SettingsGuard.Lost()")).toBe("account");
  expect(lost.savedVariables().account.keyRestore, "the record is back").toEqual(saved.account.keyRestore);
  const fine = loggedIn("", { savedVariables: `VanguardDB = ${dump(addon, "VanguardDB")}\nVanguardCharDB = { keyBackup = { keyRestore = { set = 1, keys = {} } } }\n` });
  expect(Object.keys(fine.savedVariables().account.keyRestore.keys).length, "no loss: the account's own record stays").toBe(4);
});

it("two characters set the same account key: putting it back reaches both", () => {
  const first = rogue();
  ka(first, `KA.Apply({ { key = "F", spell = 1766, slot = 61 } })`);
  const second = loggedIn('__wfgWorld.setUnit("player", { name = "Thrall" })', { savedVariables: `VanguardDB = ${dump(first, "VanguardDB")}\nVanguardCharDB = {}\n` });
  second.eval(`__wfgWorld.bindingSets[1] = ${dump(first, "__wfgWorld.bindingSets[1]")} LoadBindings(1)`);
  second.world.learn(1766, { name: "Kick" });
  ka(second, `KA.Apply({ { key = "F", spell = 1766, slot = 61 } })`);
  expect(second.savedVariables().account.keyRestore.keys.F.by, "both are named").toEqual({ "Aren-ForeverTest": true, "Thrall-ForeverTest": true });
  ka(second, "KA.PutBackAll()");
  expect([slots(second, [61]), keys(second, ["F"])], "Thrall's bars and the key are back").toEqual([[0], [""]]);
  expect(chatHas(second, /Spells moved on Aren's bars go back when you log in as Aren\.$/)).toBe(true);
});

it("a key bound to a button another key placed a spell on keeps it when the first key is put back", () => {
  const addon = rogue();
  ka(addon, `KA.Apply({ { key = "F", spell = 1766, slot = 61 } })`);
  ka(addon, `KA.Apply({ { key = "V", spell = 1766, slot = 62 } })`);
  expect(keys(addon, ["V"]), "V found Kick on bar 2's first button").toEqual(["MULTIACTIONBAR1BUTTON1"]);
  ka(addon, 'KA.PutBack("F")');
  expect([slots(addon, [61]), keys(addon, ["F", "V"])], "Kick stays for V").toEqual([[1766], ["", "MULTIACTIONBAR1BUTTON1"]]);
  ka(addon, 'KA.PutBack("V")');
  expect(slots(addon, [61]), "then it goes").toEqual([0]);
});

it("one key put back after chained moves brings back what that key found", () => {
  const addon = rogue();
  const before = state(addon);
  ka(addon, `KA.Apply({ { key = "2", spell = 1776, slot = 2 } })`);
  ka(addon, `KA.Apply({ { key = "X", spell = 1766, slot = 53 } })`);
  expect(slots(addon, [2, 53, 54]), "Attack moved twice").toEqual([1776, 1766, 6603]);
  ka(addon, 'KA.PutBack("X")');
  expect(slots(addon, [2, 53, 54]), "Attack is back on 53, where X found it").toEqual([1776, 6603, 0]);
  ka(addon, 'KA.PutBack("2")');
  expect(state(addon)).toEqual(before);
});

it("Put everything back leaves a key the game refuses with its spells, so it can still go back later", () => {
  const addon = rogue();
  const before = state(addon);
  ka(addon, `KA.Apply(${PRESET})`);
  addon.eval('__set = SetBinding SetBinding = function(key, command) if key == "F" then return false end return __set(key, command) end');
  expect(ka(addon, "return KA.PutBackAll()")).toBe(false);
  expect([slots(addon, [61]), ka(addon, 'return KA.Changed("F")')], "Kick stays for F").toEqual([[1766], true]);
  addon.eval("SetBinding = __set");
  expect(ka(addon, "return KA.PutBackAll()")).toBe(true);
  expect(state(addon)).toEqual(before);
});

it("put-back matches the exact spell: a rank the player put on the button stays", () => {
  const addon = rogue();
  ka(addon, `KA.Apply({ { key = "F", spell = 1766, slot = 61 } })`);
  addon.world.learn(1767, { name: "Kick", rank: 2 });
  addon.eval("__wfgWorld.setAction(61, { id = 1767 })");
  ka(addon, "KA.PutBackAll()");
  expect([slots(addon, [61]), addon.eval("return #__wfgWorld.discarded")]).toEqual([[1767], 0]);
});

it("a rollback that can't finish keeps the earlier Apply's pre-image", () => {
  const addon = rogue();
  const before = state(addon);
  ka(addon, `KA.Apply({ { key = "F", spell = 1766, slot = 61 } })`);
  // Stealth's move of Kick to 53 takes four calls; the fifth, its key, starts the fight.
  addon.eval("__wfgWorld.combatAfterCalls(5)");
  expectErrors(/^blocked in combat: Modules\/KeybindsApply\.lua:\d+ called SetBinding\(\), which the client refuses addon code in a fight$/);
  ka(addon, `KA.Apply({ { key = "G", spell = 1784, slot = 61 } })`);
  addon.eval("__wfgWorld.cursor = { type = 'item', id = 929 }");
  setCombat(addon, false);
  addon.eval("ClearCursor()");
  ka(addon, "KA.PutBackAll()");
  expect(state(addon), "61 is empty again, as before the first Apply").toEqual(before);
});

it("a waiting key set again since keeps its spells, and the next put-back reaches this character again", () => {
  const addon = rogue("VanguardDB.keyPending = { ['Aren-ForeverTest'] = { F = true } }\nVanguardDB.keyRestore = { set = 1, keys = { F = { before = '', after = 'MULTIACTIONBAR1BUTTON1', by = { ['Thrall-ForeverTest'] = true } } } }\nVanguardCharDB = { slotRestore = { [61] = { before = false, layers = { { key = 'F', after = 1766, set = 1 } } } } }\n");
  addon.eval("__wfgWorld.setAction(61, { id = 1766 })");
  addon.fire("PLAYER_ENTERING_WORLD", false, false);
  const sv = addon.savedVariables().account;
  expect([slots(addon, [61]), sv.keyPending, sv.keyRestore.keys.F.by["Aren-ForeverTest"]]).toEqual([[1766], {}, true]);
});

it("the slot must take the spell: a button the client declines fails the Apply", () => {
  const addon = rogue();
  const before = state(addon);
  addon.eval("local place = PlaceAction PlaceAction = function(slot) if slot ~= 62 then place(slot) end end");
  expect(ka(addon, `return KA.Apply(${PRESET})`)).toBe(false);
  expect(state(addon)).toEqual(before);
});

it("Plan: a command with two other keys takes no third, a chord is written in the game's order, and an entry with no key is invalid", () => {
  const addon = rogue();
  addon.eval('SetBinding("N", "MULTIACTIONBAR1BUTTON1") SetBinding("M", "MULTIACTIONBAR1BUTTON1")');
  expect(plan(addon, `{ { key = "F", spell = 1766, slot = 61 }, { key = "SHIFT-CTRL-G", spell = 1784, slot = 62 }, { spell = 1776, slot = 63 } }`))
    .toEqual(["F unchanged keys 61 -", "CTRL-SHIFT-G place - 62 -", "- unchanged invalid 63 -"]);
  expect(() => ka(addon, `KA.Apply(${PRESET}, 3)`), "a set Apply doesn't take is the caller's mistake").toThrow(/set is Enum\.BindingSet\.Account, Character or nil/);
});

it("Only this character with nothing to change leaves the key set as it was", () => {
  const addon = rogue();
  expect(ka(addon, `return KA.Apply({ { key = "1", spell = 1752, slot = 1 } }, Enum.BindingSet.Character)`)).toBe(true);
  expect([addon.eval("return GetCurrentBindingSet()"), chatHas(addon, /No key needs changing\.$/)]).toEqual([1, true]);
});

it("a waiting button the client hides keeps waiting for the next load screen", () => {
  const addon = rogue("VanguardDB.keyPending = { ['Aren-ForeverTest'] = { F = true } }\nVanguardCharDB = { slotRestore = { [61] = { before = false, layers = { { key = 'F', after = 1766, set = 1 } } } } }\n");
  addon.eval("__wfgWorld.setAction(61, { id = 1766 }) __info = GetActionInfo GetActionInfo = function(s) if s == 61 then return __wfgWorld.secret(1) end return __info(s) end");
  addon.fire("PLAYER_ENTERING_WORLD", false, false);
  expect(addon.savedVariables().account.keyPending["Aren-ForeverTest"], "still waiting").toEqual({ F: true });
  addon.eval("GetActionInfo = __info");
  addon.fire("PLAYER_ENTERING_WORLD", false, false);
  expect([slots(addon, [61]), addon.savedVariables().account.keyPending], "then it goes back").toEqual([[0], {}]);
});

it("Plan: a button a bar doesn't show is never written: bar 3 with 4 buttons has no spare slot, bar 2 with 6 no 12th", () => {
  const addon = rogue("VanguardDB.profiles = { Default = { ActionBars = { bars = { [2] = { buttons = 6 }, [3] = { buttons = 4 } } } } }");
  expect(plan(addon, `{ { key = "2", spell = 1776, slot = 2 }, { key = "F", spell = 1766, slot = 72 } }`)).toEqual(["2 unchanged full 2 -", "F unchanged barOff 72 -"]);
});

it("Plan: one preset gives a command no third key across stance pages", () => {
  const addon = rogue();
  expect(plan(addon, `{ { key = "Q", spell = 1766, slot = 73 }, { key = "E", spell = 1776, slot = 85 } }`)).toEqual(["Q place - 73 -", "E unchanged keys 85 -"]);
});

it("Plan: a spell this plan moved aside can still get its own key", () => {
  const addon = rogue();
  expect(plan(addon, `{ { key = "2", spell = 1776, slot = 2 }, { key = "Q", spell = 6603, slot = 61 } }`)).toEqual(["2 move - 2 53", "Q bind - 53 -"]);
  ka(addon, `KA.Apply({ { key = "2", spell = 1776, slot = 2 }, { key = "Q", spell = 6603, slot = 61 } })`);
  ka(addon, 'KA.PutBack("2")');
  expect([slots(addon, [2, 53]), keys(addon, ["Q"])], "Attack stays on 53 for Q while Q is Vanguard's").toEqual([[6603, 6603], ["MULTIACTIONBAR2BUTTON5"]]);
});

it("put-back leaves a macro whose number matches the spell Vanguard placed", () => {
  const addon = rogue();
  ka(addon, `KA.Apply({ { key = "F", spell = 1766, slot = 61 } })`);
  addon.eval('__wfgWorld.setAction(61, { type = "macro", id = 1766 })');
  ka(addon, "KA.PutBackAll()");
  expect([addon.eval("return GetActionInfo(61)"), addon.eval("return #__wfgWorld.discarded")]).toEqual(["macro", 0]);
});

it("a spell the client puts on the button at another rank fails the Apply, and comes off again", () => {
  const addon = rogue();
  const before = state(addon);
  addon.world.learn(1777, { name: "Gouge", rank: 2 });
  addon.eval("local pickup = C_Spell.PickupSpell C_Spell.PickupSpell = function(id) pickup(id == 1776 and 1777 or id) end");
  expect(ka(addon, `return KA.Apply(${PRESET})`)).toBe(false);
  expect(state(addon)).toEqual(before);
});

it("a key that doesn't read back after SetBinding fails the Apply", () => {
  const addon = rogue();
  const before = state(addon);
  addon.eval('local set = SetBinding SetBinding = function(key, command) if key == "G" then return true end return set(key, command) end');
  expect(ka(addon, `return KA.Apply(${PRESET})`)).toBe(false);
  expect(state(addon)).toEqual(before);
});

it("a key is put back and looked up however its modifiers are written", () => {
  const addon = rogue();
  ka(addon, `KA.Apply({ { key = "SHIFT-CTRL-G", spell = 1766, slot = 61 } })`);
  expect([keys(addon, ["CTRL-SHIFT-G"]), ka(addon, 'return KA.Changed("SHIFT-CTRL-G")')]).toEqual([["MULTIACTIONBAR1BUTTON1"], true]);
  expect(ka(addon, 'return KA.PutBack("SHIFT-CTRL-G")')).toBe(true);
  expect(keys(addon, ["CTRL-SHIFT-G"])).toEqual([""]);
});

it("leftover buttons on a character with its own keys go back even when another character's account keys are recorded", () => {
  const addon = rogue("VanguardDB.keyRestore = { set = 1, keys = { F = { before = '', after = 'MULTIACTIONBAR1BUTTON1', by = { ['Thrall-ForeverTest'] = true } } } }\nVanguardCharDB = { slotRestore = { [61] = { before = false, layers = { { after = 1766, set = 2 } } } } }\n");
  addon.eval("SaveBindings(1) LoadBindings(2) SaveBindings(2) __wfgWorld.setAction(61, { id = 1766 })");
  expect(ka(addon, "return KA.PutBackAll()")).toBe(true);
  expect(slots(addon, [61])).toEqual([0]);
});

it("Plan: a known spell another row places isn't copied to bar 3, and one the entry replaces is overwritten", () => {
  const addon = rogue();
  expect(plan(addon, `{ { key = "1", spell = 1766, slot = 1 }, { key = "4", spell = 1752, slot = 4 } }`), "Sinister Strike goes to 4, not bar 3")
    .toEqual(["1 place - 1 -", "4 place - 4 -"]);
  expect(ka(addon, `local r = KA.Plan({ { key = "2", spell = 1776, slot = 2, replaces = { 6603 } } })[1] return { r.kind, r.over, r.replaced }`), "Gouge replaces Attack")
    .toEqual(["place", 6603, true]);
  expect(plan(addon, `{ { key = "2", spell = 1776, slot = 2 }, { key = "Z", spell = 6603, slot = 49 }, { key = "5", spell = 6603, slot = 5 } }`),
    "a key binds to Attack where it moved, so it stays there").toEqual(["2 move - 2 53", "Z bind - 53 -", "5 place - 5 -"]);
  expect(plan(addon, `{ { key = "2", spell = 1776, slot = 2 }, { key = "5", spell = 6603, slot = 77 } }`), "Attack on a stealth page only still goes to bar 3")
    .toEqual(["2 move - 2 53", "5 place - 77 -"]);
  expect(plan(addon, `{ { key = "1", spell = 1766, slot = 1 }, { key = "4", spell = 1752, slot = 4 }, { key = "Z", spell = 1776, slot = 53 } }`),
    "no bar 3 slot is held for a move that isn't needed").toEqual(["1 place - 1 -", "4 place - 4 -", "Z place - 53 -"]);
  expect(ka(addon, `local out = {} for i, r in ipairs(KA.Plan({ { key = "2", spell = 1776, slot = 2 }, { key = "G", spell = 1784, slot = 62 } }, { [53] = true, [62] = true })) do
    out[i] = r.kind .. " " .. (r.why or "-") .. " " .. tostring(r.to or "-") end return out`), "skipped slots are never written nor moved to").toEqual(["move - 54", "unchanged owned -"]);
});

it("Apply: a spell another row places goes straight there, with no copy on bar 3, and putting back restores both buttons", () => {
  const addon = rogue();
  const before = state(addon);
  expect(ka(addon, `return KA.Apply({ { key = "1", spell = 1766, slot = 1 }, { key = "4", spell = 1752, slot = 4 } })`)).toBe(true);
  expect(slots(addon, [1, 4, 53]), "Kick on 1, Sinister Strike on 4, bar 3 empty").toEqual([1766, 1752, 0]);
  ka(addon, "KA.PutBackAll()");
  expect(state(addon)).toEqual(before);
});

it("Update: quiet on success and on failure, nil when refused, false when it fails", () => {
  const addon = rogue();
  expect(ka(addon, `return KA.Recorded()`), "no record yet").toBe(false);
  ka(addon, `KA.Apply({ { key = "F", spell = 1766, slot = 61 } })`);
  addon.clearChat();
  expect(ka(addon, `local rows = KA.Update({ { key = "G", spell = 1784, slot = 62 } }) return { rows[1].kind, KA.Recorded(), KA.Changed("G") }`)).toEqual(["place", true, true]);
  expect(Array.from(addon.chat()), "no chat line").toEqual([]);
  setCombat(addon, true);
  expect(ka(addon, `return KA.Update({ { key = "T", spell = 1776, slot = 63 } })`), "refused in combat").toBe(null);
  setCombat(addon, false);
  addon.eval('local set = SetBinding SetBinding = function(key, command) if key == "T" then return false end return set(key, command) end');
  addon.clearChat();
  expect(ka(addon, `return KA.Update({ { key = "T", spell = 1776, slot = 63 } })`), "the game refused T").toBe(false);
  expect([slots(addon, [63]), Array.from(addon.chat())], "and Gouge came off again, quietly").toEqual([[0], []]);
  expect(ka(addon, 'return { KA.Ours("G"), KA.Ours("F"), KA.Ours("T") }'), "G and F do what Vanguard set").toEqual([true, true, false]);
});
