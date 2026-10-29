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
  out[i] = table.concat({ r.key, r.kind, r.why or "-", tostring(r.slot or "-"), tostring(r.to or "-") }, " ") end return out`);

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

it("Plan: each entry becomes a row by the three-way rule, and nothing changes", () => {
  const addon = rogue();
  const before = state(addon);
  expect(plan(addon), "bind where the spell is, place on empty, move a known spell to bar 3, command for a stance key").toEqual([
    "1 unchanged already 1 -", "F place - 61 -", "2 move - 2 53", "G place - 62 -", "` command - - -",
  ]);
  expect(state(addon), "a plan writes nothing").toEqual(before);
  expect(plan(addon, `{ { key = "H", spell = 1776, slot = 3 }, { key = "J", spell = 2098, slot = 4 }, { key = "K", spell = 1766, slot = 25 },
    { key = "F", spell = 1766, slot = 63 }, { key = "F", spell = 1784, slot = 64 }, { key = "L", spell = 1766, slot = 65 } }`), "the reasons a key stays").toEqual([
    "H unchanged kept 3 -", "J unchanged unknown 4 -", "K unchanged outside 25 -", "F place - 63 -", "F unchanged used 64 -", "L unchanged used 65 -",
  ]);
  addon.eval("__wfgWorld.setAction(50, { id = 1766 })");
  expect(plan(addon, `{ { key = "F", spell = 1766, slot = 61 }, { key = "4", spell = 1752, slot = 4 } }`), "a letter key finds its spell on bar 3; a number key stays on its own button").toEqual(["F bind - 50 -", "4 place - 4 -"]);
  expect(ka(addon, "return { KA.CommandFor(1), KA.CommandFor(80), KA.CommandFor(63), KA.CommandFor(50), KA.CommandFor(25) }"), "each range's command").toEqual(["ACTIONBUTTON1", "ACTIONBUTTON8", "MULTIACTIONBAR1BUTTON3", "MULTIACTIONBAR2BUTTON2"]);
});

it("Plan: a bar that is off keeps its keys, and a full bar 3 keeps a known spell where it is", () => {
  const addon = rogue("VanguardDB.profiles = { Default = { ActionBars = { bars = { [2] = { enabled = false } } } } }");
  expect(plan(addon, `{ { key = "F", spell = 1766, slot = 61 } }`), "bar 2 is off").toEqual(["F unchanged barOff 61 -"]);
  addon.eval("for s = 53, 60 do __wfgWorld.setAction(s, { type = 'item', id = 929 }) end");
  expect(plan(addon, `{ { key = "2", spell = 1776, slot = 2 } }`), "no free slot on bar 3").toEqual(["2 unchanged full 2 -"]);
  addon.eval("__wfgWorld.setAction(4, { type = 'spell', id = 999 })");
  expect(plan(addon, `{ { key = "4", spell = 1776, slot = 4 } }`), "a spell the character doesn't know is never moved").toEqual(["4 unchanged kept 4 -"]);
});

it("Apply: places the spells, binds and saves the keys, and keeps the split record", () => {
  const addon = rogue();
  expect(ka(addon, `return KA.SharesKeys()`), "the Account set is in use").toBe(true);
  expect(ka(addon, `return KA.Apply(${PRESET})`)).toBe(true);
  expect(slots(addon, [1, 2, 3, 53, 61, 62]), "Gouge on 2, Attack moved to 53, Kick and Stealth on bar 2, the macro untouched").toEqual([1752, 1776, 5, 6603, 1766, 1784]);
  expect(keys(addon, ["F", "G", "2", "`", "1"]), "the keys fire their buttons").toEqual(["MULTIACTIONBAR1BUTTON1", "MULTIACTIONBAR1BUTTON2", "ACTIONBUTTON2", "SHAPESHIFTBUTTON1", "ACTIONBUTTON1"]);
  expect(addon.eval("return __wfgWorld.bindingsSaved()"), "saved in the set in use").toBe(true);
  expect(chatHas(addon, /4 key\(s\) set\. Vanguard kept what they did before/), "chat says so").toBe(true);
  const sv = addon.savedVariables();
  expect(Object.keys(sv.account.keyRestore.keys).sort(), "the key rows go with the Account set").toEqual(["2", "F", "G", "`"]);
  expect(sv.account.keyRestore.keys["2"], "a key row: what it did, what it does, who applied it, the slots it changed").toEqual({ before: "ACTIONBUTTON2", after: "ACTIONBUTTON2", by: "Aren-ForeverTest", slots: [53, 2] });
  expect(sv.char.slotRestore["53"] ?? sv.char.slotRestore[53], "a slot row: empty before").toEqual({ before: false, after: 6603 });
  expect(addon.eval("return __wfgWorld.discarded[1].id"), "the only action dropped is the known spell that moved").toBe(6603);
  expect(ka(addon, 'return { KA.Changed("F"), KA.Changed("1") }'), "the record marks what Vanguard changed").toEqual([true, false]);
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
  expect(keys(addon, ["2", "F"]), "key 2 still fires button 2; F keeps Kick").toEqual(["ACTIONBUTTON2", "MULTIACTIONBAR1BUTTON1"]);
  expect(ka(addon, 'return { KA.PutBack("2"), KA.PutBack("1") }'), "neither is Vanguard's now").toEqual([false, false]);
  expect(chatHas(addon, /Vanguard didn't change that key\.$/)).toBe(true);
  expect(ka(addon, 'return KA.PutBack("F")')).toBe(true);
  expect([keys(addon, ["F"]), slots(addon, [61])], "F is free again and its slot empty").toEqual([[""], [0]]);
});

it("Put back skips a key or slot the player changed since, and says which", () => {
  const addon = rogue();
  ka(addon, `KA.Apply(${PRESET})`);
  addon.eval('SetBinding("F", "ACTIONBUTTON9") __wfgWorld.setAction(62, { type = "macro", id = 7 })');
  ka(addon, "KA.PutBackAll()");
  expect(keys(addon, ["F", "G"]), "F stays as the player set it; G goes back").toEqual(["ACTIONBUTTON9", ""]);
  expect(slots(addon, [61, 62]), "Kick's slot goes back (the key was the player's, the spell Vanguard's), the macro stays").toEqual([0, 7]);
  expect(chatHas(addon, /Changed since, so left as you set them: F\.$/)).toBe(true);
});

it("Apply twice: the first pre-image is kept, so putting back returns to before the first", () => {
  const addon = rogue();
  const before = state(addon);
  ka(addon, `KA.Apply({ { key = "F", spell = 1766, slot = 61 } })`);
  ka(addon, `KA.Apply({ { key = "F", spell = 1784, slot = 62 }, { key = "G", spell = 1776, slot = 61 } })`);
  expect(plan(addon, `{ { key = "F", spell = 1784, slot = 62 } }`), "F already fires Stealth").toEqual(["F unchanged already 62 -"]);
  expect(ka(addon, `return KA.Apply({ { key = "F", spell = 1784, slot = 62 } })`), "nothing to do still succeeds").toBe(true);
  expect(chatHas(addon, /No key needs changing\.$/)).toBe(true);
  ka(addon, "KA.PutBackAll()");
  expect(state(addon), "both applies undone").toEqual(before);
});

it("Apply refuses, never queues: in combat, under a restriction, with the key windows or keybind mode open, with a full cursor", () => {
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
  refused('SettingsPanel = CreateFrame("Frame", "SettingsPanel", UIParent)', "SettingsPanel:Hide()", /Close the game's Settings and Quick Keybind windows first\.$/);
  refused('ns.GetModule("ActionBars").KeybindMode(true)', 'ns.GetModule("ActionBars").KeybindMode(false)', /Leave keybind mode first\.$/);
  refused("C_Spell.PickupSpell(1766)", "ClearCursor()", /Put down what's on your cursor first\.$/);
  expect(state(addon), "nothing changed").toEqual(before);
  expect(ka(addon, "return KA.PutBackAll()"), "put-back refuses the same way").toBe(false);
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

it("a fight that starts in the middle of an Apply: the blocked write fails it, and the rest goes back after the fight", () => {
  const addon = rogue();
  const before = state(addon);
  addon.eval("__wfgWorld.combatAfterCalls(4)");
  expectErrors(/^blocked in combat: Core\/Client\.lua:\d+ called PlaceAction\(\), which the client refuses addon code in a fight$/);
  expect(ka(addon, `return KA.Apply(${PRESET})`)).toBe(false);
  expect(state(addon).actions, "in the fight, what was placed stays").not.toEqual(before.actions);
  setCombat(addon, false);
  expect(state(addon), "after it, everything is as before").toEqual(before);
  expect(addon.eval("return __wfgWorld.bindingsSaved()")).toBe(true);
});

it("a save the client blocks fails the Apply, so no record is kept", () => {
  const addon = rogue();
  const before = state(addon);
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

it("a set switch that fails goes back to the set the player had", () => {
  const addon = rogue();
  const before = state(addon);
  expect(ka(addon, `return KA.Apply({ { key = "f", spell = 1766, slot = 61 } }, Enum.BindingSet.Character)`)).toBe(false);
  expect(state(addon), "Account again, keys and slots as before").toEqual(before);
});

it("a set mismatch: keys set in the Account set can't be put back while the character set is in use", () => {
  const addon = rogue();
  ka(addon, `KA.Apply(${PRESET})`);
  addon.eval("SaveBindings(1) LoadBindings(2)");
  expect(ka(addon, "return KA.PutBackAll()")).toBe(false);
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
  expect(second.savedVariables().account.keyPending["Aren-ForeverTest"], "Aren's slots wait").toBeTruthy();
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
  const addon = rogue("VanguardDB.keyPending = { ['Aren-ForeverTest'] = { [61] = true } }\nVanguardCharDB = { slotRestore = { [61] = { before = false, after = 1766 } } }\n");
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
  expect(saved.char.keyRestoreBackup, "the copy").toEqual(saved.account.keyRestore);
  // The account file comes back blank: no guard stamp for this character, so the guard reports a loss.
  const lost = loggedIn('__wfgWorld.setUnit("player", { name = "Aren" })', { savedVariables: `VanguardDB = { version = 2, profiles = {}, setupDone = true }\nVanguardCharDB = ${luaValue(saved.char)}\n` });
  expect(lost.eval("return ns.SettingsGuard.Lost()")).toBe("account");
  expect(lost.savedVariables().account.keyRestore, "the record is back").toEqual(saved.account.keyRestore);
  const fine = loggedIn("", { savedVariables: `VanguardDB = ${luaValue(saved.account)}\nVanguardCharDB = { keyRestoreBackup = { set = 1, keys = {} } }\n` });
  expect(Object.keys(fine.savedVariables().account.keyRestore.keys).length, "no loss: the account's own record stays").toBe(4);
});
