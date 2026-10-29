// keybinds-learn: "Place new spells as I learn them" (Modules/KeybindsLearn.lua) in the TEST-ONLY headless client:
// a spell learned after an Apply fills its key, moves the old spell to the next key or bar 3 and says so, a
// replaced spell goes silently, the game's own placement may move, a button or key the player changed stays
// theirs, the one-time question, the switch, the waits, and a walk from level 1 to 60. The resolver, its data and
// the wizard here are test-only stand-ins for Modules/KeybindsLayouts.lua and Modules/KeybindsWizard.lua.

import { expect, it } from "vitest";
import { luaValue } from "../lib/lua-emit.mjs";
import { loggedIn, RETAIL, setCombat } from "./helpers.mjs";

// TEST-ONLY spells and the level each is trained at (remembered vanilla levels; Mortal Strike stands for a talent).
const SPELLS = {
  78: ["Heroic Strike", 1], 6673: ["Battle Shout", 1], 772: ["Rend", 4], 6343: ["Thunder Clap", 6], 168: ["Frost Armor", 1],
  7384: ["Overpower", 12], 72: ["Shield Bash", 12], 7302: ["Ice Armor", 30], 12294: ["Mortal Strike", 40], 71: ["Defensive Stance", 10],
};

// A test-only preset: each key's list, best first; Ice Armor replaces Frost Armor on Shift-W.
const DATA = `{
  { key = "1", slot = 1, list = { 12294, 78 } },
  { key = "2", slot = 2, list = { 772, 78 } },
  { key = "3", slot = 3, list = { 7384, 6343, 78 } },
  { key = "4", slot = 4, list = { 6343, 78 } },
  { key = "F", slot = 61, list = { 72 } },
  { key = "SHIFT-W", slot = 49, list = { 7302, 168 }, replaces = { [7302] = { 168 } } },
  { key = "\`", command = "SHAPESHIFTBUTTON1" },
  { key = "SHIFT-\`", command = "SHAPESHIFTBUTTON2", needs = 71 },
}`;

// The stand-ins: the resolver (each key takes the first spell on its list the character knows that no earlier key
// took; a skipped slot's key takes nothing) and the wizard (offered unless __offered is false; Open counts).
const STANDINS = `__keys = ${DATA}
  ns.KeybindsLayouts = { Resolve = function(preset, skip)
    __resolved = { preset = preset, skip = skip }
    local out, taken, known = {}, {}, ns.SpellKnownCall()
    for _, k in ipairs(__keys) do
      if k.command then
        if not k.needs or known(k.needs) then out[#out + 1] = { key = k.key, command = k.command } end
      elseif not skip[k.slot] then
        for _, id in ipairs(k.list) do
          if not taken[id] and known(id) then
            taken[id] = true
            out[#out + 1] = { key = k.key, spell = id, slot = k.slot, replaces = k.replaces and k.replaces[id] }
            break
          end
        end
      end
    end
    return out
  end }
  for _, command in ipairs({ "ASSISTTARGET", "TOGGLEAUTORUN" }) do __wfgWorld.registerBinding(command, "TEST-ONLY") end
  ns.KeybindsWizard = { Offered = function() return __offered ~= false end, Open = function() __opened = (__opened or 0) + 1 end }`;

// The preset the wizard would keep.
const PRESET = '{ class = "WARRIOR", role = "levelling", sides = true }';

// Teaches a spell without the learned event (world.learn fires SPELLS_CHANGED only).
const teach = (addon, id) => addon.world.learn(Number(id), { name: SPELLS[id][0] });

// Learns a spell as a trainer teaches it, then lets the next frame run.
function learn(addon, id) {
  teach(addon, id);
  addon.fire("LEARNED_SPELL_IN_SKILL_LINE", Number(id), 1);
  addon.advance(0.5);
}

// A logged-in level-1 warrior (Brakk) with Heroic Strike, Battle Shout and Frost Armor, the stand-ins, and login settled.
function warrior({ savedVariables = "", client = "", level = 1 } = {}) {
  const addon = loggedIn("", { savedVariables, client });
  addon.eval(`__wfgWorld.setUnit("player", { name = "Brakk", level = ${level} }) ${STANDINS}`);
  for (const id of [78, 6673, 168]) teach(addon, id);
  addon.advance(4);
  addon.clearChat();
  return addon;
}

// Applies the preset as the wizard does: KA.Apply on what the resolver picks now, then KN.Applied.
function applyPreset(addon, placeNew = true) {
  const ok = addon.eval(`local entries = ns.KeybindsLayouts.Resolve(${PRESET}, {})
    local ok = ns.KeybindsApply.Apply(entries) if ok then ns.KeybindsLearn.Applied(${PRESET}, ${placeNew}) end return ok`);
  addon.clearChat();
  return ok;
}

// The spell or action ID on each slot, 0 for an empty one.
const slots = (addon, list) => addon.eval(`local out = {} for i, s in ipairs(${luaValue(list)}) do out[i] = select(2, GetActionInfo(s)) or 0 end return out`);

// Bar 3's spare slots (53 to 60) that hold something.
const spare = (addon) => slots(addon, [53, 54, 55, 56, 57, 58, 59, 60]).filter((id) => id !== 0);

// The commands of a few keys.
const keys = (addon, list) => addon.eval(`local out = {} for i, k in ipairs(${luaValue(list)}) do out[i] = GetBindingAction(k) end return out`);

// The chat lines since the last clear, joined.
const said = (addon) => Array.from(addon.chat()).map((line) => line.replace(/^\|c\w{8}Vanguard:\|r /, "")).join("\n");

// Runs Lua with the module as KN and returns its result.
const kn = (addon, lua) => addon.eval(`local KN = ns.KeybindsLearn ${lua}`);

it("a spell learned onto an empty button: placed on its key, silently", () => {
  const addon = warrior();
  expect(applyPreset(addon)).toBe(true);
  expect(slots(addon, [1, 2, 49]), "Heroic Strike on 1, nothing on 2 yet, Frost Armor on Shift-W").toEqual([78, 0, 168]);
  learn(addon, 772);
  expect([slots(addon, [2]), keys(addon, ["2"])], "Rend goes on 2").toEqual([[772], ["ACTIONBUTTON2"]]);
  expect(said(addon), "nothing moved under the player's fingers").toBe("");
});

it("a better spell for a key: the old one moves to the next key that lists it, and one chat line says both", () => {
  const addon = warrior();
  applyPreset(addon);
  learn(addon, 6343);
  expect(slots(addon, [3, 4]), "Thunder Clap takes 3, the first key that lists it").toEqual([6343, 0]);
  learn(addon, 7384);
  expect(slots(addon, [3, 4]), "Overpower on 3, Thunder Clap moved to 4").toEqual([7384, 6343]);
  expect(spare(addon), "no copy of Thunder Clap is left on bar 3").toEqual([]);
  expect(said(addon)).toBe("Overpower is now on 3. Thunder Clap moved to 4.");
});

it("a spell with no other key left: it moves to bar 3, and chat says so", () => {
  const addon = warrior();
  applyPreset(addon);
  for (const id of [772, 6343, 7384]) learn(addon, id);
  addon.clearChat();
  learn(addon, 12294);
  expect([slots(addon, [1]), spare(addon)], "Mortal Strike on 1, Heroic Strike on bar 3").toEqual([[12294], [78]]);
  expect(said(addon)).toBe("Mortal Strike is now on 1. Heroic Strike moved to bar 3.");
});

it("the replacement for a spell takes its place silently, and the old one isn't kept on bar 3", () => {
  const addon = warrior();
  applyPreset(addon);
  learn(addon, 7302);
  expect([slots(addon, [49]), spare(addon), said(addon)]).toEqual([[7302], [], ""]);
});

it("a learned key is in the record, so putting everything back undoes it too", () => {
  const addon = warrior();
  const before = slots(addon, [1, 2, 3, 4, 49, 53]);
  applyPreset(addon);
  for (const id of [772, 6343, 7384]) learn(addon, id);
  expect(addon.eval("return ns.KeybindsApply.PutBackAll()")).toBe(true);
  expect(slots(addon, [1, 2, 3, 4, 49, 53]), "every button is as before the Apply").toEqual(before);
});

it("put everything back turns the switch off at the next spell, and nothing is written", () => {
  const addon = warrior();
  applyPreset(addon);
  addon.eval("ns.KeybindsApply.PutBackAll()");
  learn(addon, 772);
  expect([kn(addon, "return KN.IsOn()"), slots(addon, [2])]).toEqual([false, [0]]);
});

it("a spell the game placed by itself is the game's: an update may move it", () => {
  const addon = warrior();
  applyPreset(addon);
  learn(addon, 6343);
  teach(addon, 7384);
  addon.eval("__wfgWorld.pushSpellToActionBar(7384, 4)");
  addon.fire("LEARNED_SPELL_IN_SKILL_LINE", 7384, 1);
  addon.advance(0.5);
  expect([slots(addon, [3, 4]), spare(addon)], "Overpower on 3, Thunder Clap over the game's copy on 4").toEqual([[7384, 6343], []]);
});

it("a button the player changed is theirs for good: its key's spell goes to the next key", () => {
  const addon = warrior();
  applyPreset(addon);
  learn(addon, 6343);
  addon.eval('__wfgWorld.setAction(3, { type = "macro", id = 7 })');
  learn(addon, 7384);
  expect(slots(addon, [3, 4]), "the macro stays; Thunder Clap, Overpower's neighbour, takes 4").toEqual([7, 6343]);
  expect(addon.eval("return __resolved.skip[3]"), "the resolver was told to leave 3 out").toBe(true);
  addon.eval("__wfgWorld.setAction(3, nil)");
  learn(addon, 772);
  expect(slots(addon, [3]), "emptied again, it is still the player's").toEqual([0]);
});

it("a key the player rebound is theirs for good: no update binds it again", () => {
  const addon = warrior();
  applyPreset(addon);
  addon.eval('SetBinding("2", "TOGGLEAUTORUN") SaveBindings(GetCurrentBindingSet())');
  learn(addon, 772);
  expect([keys(addon, ["2"]), slots(addon, [2])], "2 keeps the player's command and its button stays empty").toEqual([["TOGGLEAUTORUN"], [0]]);
});

it("a key free at Apply that the player binds later is theirs; one the game had then is Vanguard's to take", () => {
  const addon = warrior();
  addon.eval('SetBinding("F", "ASSISTTARGET") SaveBindings(GetCurrentBindingSet())');
  applyPreset(addon);
  addon.eval('SetBinding("SHIFT-T", "TOGGLEAUTORUN") SaveBindings(GetCurrentBindingSet())');
  learn(addon, 72);
  expect([keys(addon, ["F"]), slots(addon, [61])], "F was the game's at Apply, so Shield Bash takes it").toEqual([["MULTIACTIONBAR1BUTTON1"], [72]]);
  expect(said(addon), "and chat says so, since F did something else").toBe("Shield Bash is now on F.");
});

it("a stance key that did something else before says what it does now", () => {
  const addon = warrior();
  addon.eval('SetBinding("SHIFT-`", "ASSISTTARGET") SaveBindings(GetCurrentBindingSet())');
  applyPreset(addon);
  learn(addon, 71);
  expect([keys(addon, ["SHIFT-`"]), said(addon)]).toEqual([["SHAPESHIFTBUTTON2"], "SHIFT-` now does SHAPESHIFTBUTTON2."]);
});

it("a key the player rebound leaves its button out too, so its spell goes to the next key that lists it", () => {
  const addon = warrior();
  applyPreset(addon);
  addon.eval('SetBinding("3", "TOGGLEAUTORUN") SaveBindings(GetCurrentBindingSet())');
  learn(addon, 6343);
  expect([slots(addon, [3, 4]), keys(addon, ["3"])], "Thunder Clap goes on 4; 3 stays the player's").toEqual([[0, 6343], ["TOGGLEAUTORUN"]]);
});

it("a bar 3 or bar 2 button the player took over is never moved to, nor bound", () => {
  const addon = warrior();
  applyPreset(addon);
  addon.eval("__wfgWorld.setAction(53, { id = 6673 }) __wfgWorld.setAction(62, { id = 72 })");
  for (const id of [772, 6343, 7384]) learn(addon, id);
  addon.eval("__wfgWorld.setAction(53, nil)");
  learn(addon, 72);
  expect([keys(addon, ["F"]), slots(addon, [61, 62])], "F gets its own button, not the player's Shield Bash on 62").toEqual([["MULTIACTIONBAR1BUTTON1"], [72, 72]]);
  learn(addon, 12294);
  expect(slots(addon, [53, 54]), "Heroic Strike skips the emptied 53").toEqual([0, 78]);
});

it("an update the game refuses goes back, says so, and tries again at the next load screen", () => {
  const addon = warrior();
  applyPreset(addon);
  addon.eval('__set = SetBinding SetBinding = function(key, command) if key == "2" then return false end return __set(key, command) end');
  learn(addon, 772);
  expect([slots(addon, [2]), said(addon)]).toEqual([[0], expect.stringContaining("Vanguard couldn't put your new spells on keys this time.")]);
  expect(said(addon), "one line, from key setup's new spells only").not.toContain("No key changed");
  addon.eval("SetBinding = __set");
  addon.fire("PLAYER_ENTERING_WORLD", false, false);
  addon.advance(0.5);
  expect(slots(addon, [2])).toEqual([772]);
});

it("three refused updates in a row turn the switch off, and say so", () => {
  const addon = warrior();
  applyPreset(addon);
  addon.eval('local set = SetBinding SetBinding = function(key, command) if key == "2" then return false end return set(key, command) end');
  for (const id of [772, 6343]) learn(addon, id);
  expect(kn(addon, "return KN.IsOn()"), "two refusals: still on").toBe(true);
  learn(addon, 7384);
  expect([kn(addon, "return KN.IsOn()"), said(addon)]).toEqual([false, expect.stringContaining("Vanguard stopped putting new spells on keys.")]);
  kn(addon, "KN.SetOn(true)");
  learn(addon, 12294);
  expect(kn(addon, "return KN.IsOn()"), "on again, the count starts afresh").toBe(true);
});

it("the switch turns on only for keys set up with a preset and still there", () => {
  const bare = warrior();
  kn(bare, "KN.SetOn(true)");
  expect([kn(bare, "return KN.IsOn()"), said(bare)]).toEqual([false, "Set up keys first: Vanguard places new spells on the keys it set up."]);
  const addon = warrior();
  applyPreset(addon);
  addon.eval("ns.KeybindsApply.PutBackAll()");
  kn(addon, "KN.SetOn(true)");
  expect(kn(addon, "return KN.IsOn()"), "after putting everything back").toBe(false);
});

it("the Your keys tab's switch, once the wizard is in, turns it on and off", () => {
  const addon = warrior();
  applyPreset(addon, false);
  addon.eval('ns.Options.Show("actionbars") ns.Options.ShowTab("Your keys")');
  // Clicks the switch row, and answers whether it was there.
  const click = () => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
    if w.track and w.label and w.label:GetText() == "Place new spells as I learn them" then w:GetScript("OnClick")(w) return true end end`);
  expect(click(), "the row is there").toBe(true);
  expect(kn(addon, "return KN.IsOn()")).toBe(true);
  click();
  expect(kn(addon, "return KN.IsOn()")).toBe(false);
});

it("an Apply with nothing to change still places new spells", () => {
  const addon = warrior();
  addon.eval(`__wfgWorld.setAction(1, { id = 78 }) __wfgWorld.setAction(49, { id = 168 })
    SetBinding("1", "ACTIONBUTTON1") SetBinding("SHIFT-W", "MULTIACTIONBAR2BUTTON1") SetBinding("\`", "SHAPESHIFTBUTTON1") SaveBindings(1)`);
  expect(applyPreset(addon), "the bars and keys already match").toBe(true);
  expect([addon.eval("return ns.KeybindsApply.Recorded()"), kn(addon, "return KN.IsOn()")], "nothing recorded, the switch on").toEqual([false, true]);
  learn(addon, 772);
  expect(slots(addon, [2])).toEqual([772]);
});

it("a key another character's key setup set in the account's keys isn't taken for the player's", () => {
  const addon = warrior();
  applyPreset(addon);
  addon.eval(`SetBinding("F", "MULTIACTIONBAR1BUTTON3") SaveBindings(1)
    VanguardDB.keyRestore.keys["F"] = { before = "", after = "MULTIACTIONBAR1BUTTON3", by = { ["Other-ForeverTest"] = true } }`);
  learn(addon, 72);
  expect([keys(addon, ["F"]), slots(addon, [61])]).toEqual([["MULTIACTIONBAR1BUTTON1"], [72]]);
});

it("the game's placement arriving after the look still counts as the game's", () => {
  const addon = warrior();
  applyPreset(addon);
  learn(addon, 6343);
  addon.eval("__wfgWorld.setAction(4, { id = 6673 })");
  learn(addon, 772);
  expect(addon.savedVariables().char.keysLearn.ownSlots["4"], "a change before the event").toBe(true);
  addon.eval("__wfgWorld.pushSpellToActionBar(6673, 4)");
  expect(addon.savedVariables().char.keysLearn.ownSlots["4"], "the event gives it back to the game").toBe(undefined);
  learn(addon, 7384);
  expect(slots(addon, [3, 4]), "so Thunder Clap may take 4 over the game's Battle Shout").toEqual([7384, 6343]);
});

it("an update left waiting is saved, and runs once a later login settles", () => {
  const addon = warrior();
  applyPreset(addon);
  addon.eval('__wfgWorld.cursor = { type = "item", id = 929 }');
  learn(addon, 772);
  expect(addon.savedVariables().char.keysLearn.pending, "saved").toBe(true);
  addon.eval("__wfgWorld.cursor = nil ns.KeybindsLearn.settled = false");
  addon.fire("PLAYER_ENTERING_WORLD", true, false);
  addon.advance(4);
  expect(slots(addon, [2])).toEqual([772]);
});

it("put everything back shows the switch off at once", () => {
  const addon = warrior();
  applyPreset(addon);
  expect(kn(addon, "return KN.IsOn()")).toBe(true);
  addon.eval("ns.KeybindsApply.PutBackAll()");
  expect(kn(addon, "return KN.IsOn()")).toBe(false);
});

it("with the switch off, learning a spell changes nothing; the Your keys switch turns it on", () => {
  const addon = warrior();
  applyPreset(addon, false);
  learn(addon, 772);
  expect(slots(addon, [2])).toEqual([0]);
  kn(addon, "KN.SetOn(true)");
  learn(addon, 6343);
  expect(slots(addon, [2, 3]), "the next spell catches up on both").toEqual([772, 6343]);
});

it("waits: nothing before login has settled, and a spell learned in a fight lands after it", () => {
  const addon = loggedIn("");
  addon.eval(`__wfgWorld.setUnit("player", { name = "Brakk", level = 1 }) ${STANDINS}`);
  teach(addon, 78);
  addon.eval(`ns.KeybindsLearn.Applied(${PRESET}, true) ns.KeybindsApply.Apply({ { key = "1", spell = 78, slot = 1 } })`);
  learn(addon, 772);
  expect(slots(addon, [2]), "login hasn't settled").toEqual([0]);
  addon.advance(4);
  setCombat(addon, true);
  learn(addon, 6343);
  expect(slots(addon, [2, 3]), "in combat").toEqual([0, 0]);
  setCombat(addon, false);
  expect(slots(addon, [2, 3]), "after the fight, both").toEqual([772, 6343]);
});

it("a refused update waits for the next load screen", () => {
  const addon = warrior();
  applyPreset(addon);
  addon.eval('__wfgWorld.cursor = { type = "item", id = 929 }');
  learn(addon, 772);
  expect(slots(addon, [2]), "the cursor holds a potion").toEqual([0]);
  addon.eval("__wfgWorld.cursor = nil");
  addon.fire("PLAYER_ENTERING_WORLD", false, false);
  addon.advance(0.5);
  expect(slots(addon, [2])).toEqual([772]);
});

it("the question: asked once, when a player who never applied trains a spell; Set up keys opens the wizard ticked", () => {
  const addon = warrior({ level: 12 });
  expect(kn(addon, "return KN.Ticked()"), "level 12: unticked").toBe(false);
  learn(addon, 772);
  expect(addon.eval("return { Vanguard_Question:IsShown(), Vanguard_Question.title:GetText() }")).toEqual([true,
    "Want Vanguard to put your new spells on keys? It won't ask again: you can set up keys any time from Action bars, Your keys."]);
  addon.click("Vanguard_Question.confirm");
  expect([addon.eval("return __opened"), kn(addon, "return KN.Ticked()")], "the wizard opens, its box ticked").toEqual([1, true]);
  learn(addon, 6343);
  expect([addon.eval("return Vanguard_Question:IsShown()"), addon.eval("return __opened")], "never again").toEqual([false, 1]);
});

it("the question waits while the wizard is due after first-run setup, or while another question shows", () => {
  const addon = warrior({ level: 12, savedVariables: "VanguardCharDB.keysOffer = true" });
  learn(addon, 772);
  expect(addon.eval("return Vanguard_Question and Vanguard_Question:IsShown() or false"), "the wizard opens by itself").toBe(false);
  addon.eval('VanguardCharDB.keysOffer = false ns.Ask("Another question?", "Yes", function() end)');
  learn(addon, 6343);
  expect(addon.eval("return Vanguard_Question.title:GetText()"), "the other question stays").toBe("Another question?");
  addon.click("Vanguard_Question.no");
  learn(addon, 7384);
  expect(addon.eval("return Vanguard_Question.title:GetText()")).toMatch(/^Want Vanguard to put your new spells on keys\?/);
});

it("the question: a level below 10 alone doesn't ask, reaching 10 does; never when the wizard isn't offered", () => {
  const addon = warrior();
  expect(kn(addon, "return KN.Ticked()"), "level 1: ticked").toBe(true);
  addon.eval("__wfgWorld.levelUp(9)");
  addon.advance(0.5);
  expect(addon.eval("return Vanguard_Question and Vanguard_Question:IsShown() or false")).toBe(false);
  addon.eval("__offered = false __wfgWorld.levelUp(10)");
  addon.advance(0.5);
  expect(addon.eval("return Vanguard_Question and Vanguard_Question:IsShown() or false"), "a bar addon, say").toBe(false);
  addon.eval("__offered = true __wfgWorld.levelUp(11)");
  addon.advance(0.5);
  expect(addon.eval("return Vanguard_Question:IsShown()")).toBe(true);
});

it("on a retail client nothing is asked or written", () => {
  const addon = warrior({ client: RETAIL, level: 12 });
  kn(addon, `KN.Applied(${PRESET}, true)`);
  learn(addon, 772);
  expect([slots(addon, [2]), addon.eval("return Vanguard_Question and Vanguard_Question:IsShown() or false")]).toEqual([[0], false]);
});

it("the saved state survives a hand-edited file, and the game's placement is noted only for a preset's bars", () => {
  const addon = warrior({ savedVariables: 'VanguardCharDB.keysLearn = { slots = 5, keys = "x" }' });
  addon.eval("__wfgWorld.pushSpellToActionBar(6673, 25)");
  expect(applyPreset(addon)).toBe(true);
  addon.eval("__wfgWorld.pushSpellToActionBar(6673, 5) __wfgWorld.pushSpellToActionBar(6673, 25)");
  const sv = addon.savedVariables().char.keysLearn;
  expect([sv.slots["5"] ?? sv.slots[5], sv.slots["25"] ?? sv.slots[25], sv.on, sv.preset.class]).toEqual([6673, undefined, true, "WARRIOR"]);
});

// The resolver's pick for every key now, as "key=spell".
const picks = (addon) => addon.eval(`local out = {} for _, e in ipairs(ns.KeybindsLayouts.Resolve(${PRESET}, {})) do
  if e.spell then out[#out + 1] = e.key .. "=" .. e.spell end end return out`);

it("the walk from level 1 to 60: at every level each key holds the resolver's pick, no spell twice, and bar 3 only what lost its key", () => {
  const addon = warrior();
  applyPreset(addon);
  const SLOT = { 1: 1, 2: 2, 3: 3, 4: 4, F: 61, "SHIFT-W": 49 };
  for (let level = 2; level <= 60; level++) {
    addon.eval(`__wfgWorld.levelUp(${level})`);
    for (const [id, [, at]] of Object.entries(SPELLS)) if (at === level) learn(addon, id);
    addon.advance(0.5);
    const want = picks(addon);
    const have = want.map((p) => `${p.split("=")[0]}=${slots(addon, [SLOT[p.split("=")[0]]])[0]}`);
    expect(have, `level ${level}`).toEqual(want);
    const onKeys = want.map((p) => Number(p.split("=")[1]));
    expect(new Set(onKeys).size, `level ${level}: no spell on two keys`).toBe(onKeys.length);
    expect(spare(addon).filter((id) => onKeys.includes(id)), `level ${level}: bar 3 holds no copy`).toEqual([]);
  }
  expect(spare(addon), "Heroic Strike lost its key to Mortal Strike").toEqual([78]);
  expect(said(addon)).toContain("Overpower is now on 3. Thunder Clap moved to 4.");
});
