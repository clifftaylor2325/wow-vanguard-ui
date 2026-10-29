// keybinds-harness: the TEST-ONLY client's key binding sets, cursor swap, stances, click bindings and
// combat blocks (scripts/lib/wow-keybinds.lua, scripts/lib/wow-taint.lua), the base the keybind presets are built on.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { expectErrors } from "./helpers.mjs";

// A list of strings as a Lua table literal.
const luaList = (list) => `{ ${list.map((v) => JSON.stringify(v)).join(", ")} }`;

// A client with the addon loaded but no login, and a listener that collects ADDON_ACTION_BLOCKED and the other events a case names.
const client = (events = []) => {
  const addon = createAddon();
  addon.eval(`__seen = {}
    __listen = CreateFrame("Frame")
    for _, e in ipairs(${luaList(["ADDON_ACTION_BLOCKED", "UPDATE_BINDINGS", ...events])}) do __listen:RegisterEvent(e) end
    __listen:SetScript("OnEvent", function(_, e, ...) __seen[#__seen + 1] = table.concat({ e, ... }, " ") end)`);
  return addon;
};

// Runs Lua as if it were a line of one of the addon's files (Modules/TEST-ONLY.lua), and returns its result.
const asAddon = (addon, lua) => addon.eval(`return assert(load(${JSON.stringify(lua)}, "@Modules/TEST-ONLY.lua"))()`);

// The events seen so far, then forgotten.
const seen = (addon) => addon.eval("local out = __seen __seen = {} return out");

// The keys a command holds in the live bindings.
const keysOf = (addon, command) => asList(addon.eval(`return { GetBindingKey("${command}") }`));

// An empty Lua table crosses over as {}; a list is an array.
const asList = (value) => (Array.isArray(value) ? value : []);

it("binding sets: a write is live until SaveBindings keeps it, and loading the current set drops what wasn't saved", () => {
  const addon = client();
  expect(addon.eval("return { GetCurrentBindingSet(), __wfgWorld.bindingsSaved() }"), "the Account set is current and nothing is pending").toEqual([1, true]);
  addon.eval('SetBinding("F", "ACTIONBUTTON4")');
  expect([keysOf(addon, "ACTIONBUTTON4"), addon.eval("return __wfgWorld.bindingsSaved()")], "the key is live and unsaved").toEqual([["F"], false]);
  addon.eval("LoadBindings(GetCurrentBindingSet())");
  expect(keysOf(addon, "ACTIONBUTTON4"), "loading the set forgets the unsaved key").toEqual([]);
  addon.eval('SetBinding("F", "ACTIONBUTTON4") SaveBindings(GetCurrentBindingSet()) SetBinding("G", "ACTIONBUTTON4") LoadBindings(GetCurrentBindingSet())');
  expect(keysOf(addon, "ACTIONBUTTON4"), "the saved key survives the load, the unsaved one does not").toEqual(["F"]);
});

it("binding sets: the Default set loads without changing the current set, and the live bindings come back with LoadBindings", () => {
  const addon = client();
  addon.eval('__wfgWorld.registerBinding("MYADDON_TOGGLE", "MYADDON") SetBinding("F", "MYADDON_TOGGLE") SetBinding("1", "MYADDON_TOGGLE") SaveBindings(1) LoadBindings(Enum.BindingSet.Default)');
  expect([keysOf(addon, "MYADDON_TOGGLE"), keysOf(addon, "ACTIONBUTTON1"), addon.eval("return GetCurrentBindingSet()")], "the placeholder defaults are live, the current set is still Account").toEqual([[], ["1"], 1]);
  addon.eval("LoadBindings(GetCurrentBindingSet())");
  expect(keysOf(addon, "MYADDON_TOGGLE"), "loading the current set restores the player's keys").toEqual(["F", "1"]);
  addon.eval("LoadBindings(Enum.BindingSet.Default) SaveBindings(GetCurrentBindingSet())");
  expect(keysOf(addon, "MYADDON_TOGGLE"), "Blizzard's Reset is Default then Save: the player's keys are gone").toEqual([]);
});

it("binding sets: the Character set starts as a copy of Account and then keeps its own keys", () => {
  const addon = client();
  addon.eval('SetBinding("F", "ACTIONBUTTON4") SaveBindings(Enum.BindingSet.Account) LoadBindings(Enum.BindingSet.Character) SaveBindings(Enum.BindingSet.Character)');
  expect([addon.eval("return GetCurrentBindingSet()"), keysOf(addon, "ACTIONBUTTON4")], "Blizzard's switch leaves Character current with Account's keys").toEqual([2, ["F"]]);
  addon.eval('SetBinding("G", "ACTIONBUTTON5") SaveBindings(2) LoadBindings(1)');
  expect([addon.eval("return GetCurrentBindingSet()"), keysOf(addon, "ACTIONBUTTON5")], "Account never saw the character's key").toEqual([1, []]);
  addon.eval("LoadBindings(2)");
  expect(keysOf(addon, "ACTIONBUTTON5"), "Character still has it").toEqual(["G"]);
});

it("binding sets: LoadBindings(Current) reloads the current set, Character included, and SaveBindings(Account) leaves Character alone", () => {
  const addon = client();
  addon.eval('LoadBindings(2) SetBinding("G", "ACTIONBUTTON5") SaveBindings(2) SetBinding("H", "ACTIONBUTTON5") LoadBindings(Enum.BindingSet.Current)');
  expect([addon.eval("return GetCurrentBindingSet()"), keysOf(addon, "ACTIONBUTTON5")], "the unsaved H is dropped, the saved G is back").toEqual([2, ["G"]]);
  addon.eval("SetBinding('J', 'ACTIONBUTTON5') SaveBindings(1) LoadBindings(2)");
  expect(keysOf(addon, "ACTIONBUTTON5"), "saving to Account didn't touch Character").toEqual(["G"]);
  addon.eval("LoadBindings(1)");
  expect(keysOf(addon, "ACTIONBUTTON5"), "and Account holds the live keys it was saved with").toEqual(["G", "J"]);
});

it("binding sets: a wrong set number raises the client's usage error, and a load fires UPDATE_BINDINGS", () => {
  const addon = client();
  expect(addon.eval('return { (pcall(SaveBindings, 0)), (pcall(SaveBindings, 3)), (pcall(LoadBindings, 9)) }'), "Default cannot be saved, nor Current; 9 is no set").toEqual([false, false, false]);
  expect(addon.eval("local _, err = pcall(SaveBindings, 0) return err"), "the error names the call").toMatch(/Usage: SaveBindings\(which\)$/);
  seen(addon);
  addon.eval("LoadBindings(1)");
  expect(seen(addon), "UPDATE_BINDINGS tells the addon").toEqual(["UPDATE_BINDINGS"]);
});

it("SetBinding: an invalid key answers false and changes nothing; a valid one moves from the command that held it", () => {
  const addon = client();
  const bad = ["", "a", "SHIFT-", "SHIFT-SHIFT-A", "HYPER-A", "F25", "F01", "BUTTON32", "NUMPAD10", "AB", 5];
  expect(addon.eval(`local out = {} for i, key in ipairs({ "", "a", "SHIFT-", "SHIFT-SHIFT-A", "HYPER-A", "F25", "F01", "BUTTON32", "NUMPAD10", "AB", 5 }) do out[i] = SetBinding(key, "ACTIONBUTTON4") end return out`),
    `${bad.length} bad keys are refused`).toEqual(bad.map(() => false));
  const good = ["A", "7", "F12", "SHIFT-1", "ALT-CTRL-SHIFT-Q", "CTRL-BUTTON4", "MOUSEWHEELUP", "NUMPAD0", "NUMPADPLUS", "BACKSPACE", "`", "-", "=", "[", "\\", ";", "'", ",", ".", "/"];
  expect(addon.eval(`local out = {} for i, key in ipairs(${luaList(good)}) do out[i] = SetBinding(key, nil) end return out`),
    "the keys the client binds are taken").toEqual(good.map(() => true));
  expect(keysOf(addon, "ACTIONBUTTON4"), "a refused key bound nothing").toEqual([]);
  addon.eval('SetBinding("1", "ACTIONBUTTON9")');
  expect([keysOf(addon, "ACTIONBUTTON1"), keysOf(addon, "ACTIONBUTTON9"), addon.eval('return GetBindingAction("1")')], "a key belongs to one command at a time").toEqual([[], ["1"], "ACTIONBUTTON9"]);
  addon.eval('SetBinding("1", nil)');
  expect(addon.eval('return GetBindingAction("1")'), "nil frees the key").toBe("");
});

it("bindings the list doesn't show: CLICK, SPELL, MACRO and ITEM keys are bound but not in GetBinding(i), so a plain SetBinding replaces them", () => {
  const addon = client();
  addon.eval(`SetBindingClick("X", "MyBar1Button1", "RightButton") SetBindingSpell("C", "Fireball") SetBindingMacro("V", "Heal") SetBindingItem("B", "Healing Potion") SetBindingClick("N", "MyBar1Button2")`);
  expect(addon.eval('return { GetBindingAction("X"), GetBindingAction("C"), GetBindingAction("V"), GetBindingAction("B"), GetBindingAction("N") }'), "each is bound to its own kind of command")
    .toEqual(["CLICK MyBar1Button1:RightButton", "SPELL Fireball", "MACRO Heal", "ITEM Healing Potion", "CLICK MyBar1Button2:LeftButton"]);
  expect(addon.eval(`local listed = {} for i = 1, GetNumBindings() do listed[(GetBinding(i))] = true end
    return { listed["CLICK MyBar1Button1:RightButton"] == nil, listed["SPELL Fireball"] == nil, GetNumBindings() }`), "GetBinding(i) lists only the registered commands: 12 buttons and 2 bag commands").toEqual([true, true, 14]);
  addon.eval('SetBinding("X", "ACTIONBUTTON6")');
  expect([addon.eval('return GetBindingAction("X")'), keysOf(addon, "CLICK MyBar1Button1:RightButton")], "the CLICK key is replaced, and no list row remembered it").toEqual(["ACTIONBUTTON6", []]);
  addon.eval('SetBindingSpell("C", nil)');
  expect(addon.eval('return GetBindingAction("C")'), "no name unbinds").toBe("");
});

it("GetBinding(i): the command, its category and its first two keys; a third key is not shown", () => {
  const addon = client();
  addon.eval('SetBinding("F", "ACTIONBUTTON1") SetBinding("G", "ACTIONBUTTON1")');
  expect(addon.eval("return { GetBinding(1) }"), "keys 1, F and G are bound; two are listed").toEqual(["ACTIONBUTTON1", "ACTIONBAR", "1", "F"]);
  expect(addon.eval("return { GetBindingKey('ACTIONBUTTON1') }"), "GetBindingKey still returns all three").toEqual(["1", "F", "G"]);
  expect(addon.eval("return { GetBinding(3) }"), "a command with one key lists one").toEqual(["ACTIONBUTTON3", "ACTIONBAR", "3"]);
  expect(asList(addon.eval("return { GetBinding(GetNumBindings() + 1) }")), "past the end there is nothing").toEqual([]);
  addon.eval('__wfgWorld.registerBinding("MYADDON_TOGGLE", "MYADDON")');
  expect(addon.eval("return { GetBinding(GetNumBindings()) }"), "a command an addon registers joins the list").toEqual(["MYADDON_TOGGLE", "MYADDON"]);
});

it("PlaceAction: the cursor's action goes into the slot and the slot's old action comes up on the cursor", () => {
  const addon = client(["ACTIONBAR_SLOT_CHANGED"]);
  addon.eval("__wfgWorld.setAction(5, { id = 133 }) __wfgWorld.cursor = { type = 'spell', id = 116 }");
  seen(addon);
  addon.eval("PlaceAction(5)");
  expect(addon.eval("return { GetActionInfo(5) }"), "Frostbolt is in the slot").toEqual(["spell", 116]);
  expect(addon.eval("return { GetCursorInfo() }"), "Fireball is in hand, as a spell on the cursor").toEqual(["spell", 1, "spell", 133]);
  expect(seen(addon), "the slot changed once").toEqual(["ACTIONBAR_SLOT_CHANGED 5"]);
  addon.eval("PlaceAction(6)");
  expect([addon.eval("return { GetActionInfo(6) }"), addon.eval("return GetCursorInfo()")], "Fireball goes into the empty slot and the hand is empty").toEqual([["spell", 133], null]);
});

it("PlaceAction: an empty cursor leaves the slot alone, and a slot outside 1 to 180 raises the client's error", () => {
  const addon = client();
  addon.eval("__wfgWorld.setAction(5, { id = 133 }) PlaceAction(5)");
  expect([addon.eval("return { GetActionInfo(5) }"), addon.eval("return GetCursorInfo()")], "nothing in hand: nothing changes").toEqual([["spell", 133], null]);
  expect(addon.eval("return { (pcall(PlaceAction, 0)), (pcall(PlaceAction, 181)), (pcall(PlaceAction, 'x')), (pcall(PickupAction, 181)) }"), "bad slots raise").toEqual([false, false, false, false]);
  expect(addon.eval("local _, err = pcall(PlaceAction, 181) return err"), "with the text IsEquippedAction uses (a guess for PlaceAction: unverified)").toMatch(/Invalid action slot$/);
  expect(addon.eval("return __wfgWorld.placed"), "the last slot asked for is kept").toBe(5);
});

it("PickupAction: a slot's action rides the cursor whole, and swaps with what the cursor held", () => {
  const addon = client();
  addon.eval("__wfgWorld.setAction(5, { id = 133, count = 3 }) __wfgWorld.setAction(7, { id = 116 }) PickupAction(5)");
  expect([addon.eval("return HasAction(5)"), addon.eval("return { GetCursorInfo() }")], "the slot is empty and the spell is in hand").toEqual([false, ["spell", 1, "spell", 133]]);
  addon.eval("PlaceAction(9)");
  expect(addon.eval("return { GetActionInfo(9), GetActionCount(9) }"), "dropped elsewhere it is the same action with its fields").toEqual(["spell", 3]);
  addon.eval("PickupAction(9) PickupAction(7)");
  expect([addon.eval("return { GetActionInfo(7) }"), addon.eval("return { GetCursorInfo() }")], "picking up onto a held action swaps them").toEqual([["spell", 133], ["spell", 1, "spell", 116]]);
  addon.eval("ClearCursor()");
  expect(addon.eval("return GetCursorInfo()"), "ClearCursor drops what was in hand").toBe(null);
});

it("PlaceAction: item and macro cursors become actions of their own type, and C_ActionBar.PutActionInSlot does the same", () => {
  const addon = client();
  addon.eval("__wfgWorld.cursor = { type = 'item', id = 929 } C_ActionBar.PutActionInSlot(20)");
  expect(addon.eval("return { GetActionInfo(20) }"), "a potion in slot 20").toEqual(["item", 929]);
  addon.eval("__wfgWorld.cursor = { type = 'macro', id = 3 } PlaceAction(21)");
  expect(addon.eval("return { GetActionInfo(21) }"), "a macro in slot 21").toEqual(["macro", 3]);
});

it("starter bars: a class's table fills its slots, and the world starts with none until the in-game check lists them", () => {
  const addon = client();
  addon.eval("__wfgWorld.useStarterBar()");
  expect(addon.eval("return HasAction(1)"), "no class has a starter bar yet").toBe(false);
  addon.eval("__wfgWorld.starterBars.MAGE = { [1] = { id = 133 }, [2] = { id = 116 } } __wfgWorld.starterBars.WARRIOR = { [1] = { id = 118 } } __wfgWorld.useStarterBar()");
  expect([addon.eval("return select(2, GetActionInfo(1))"), addon.eval("return select(2, GetActionInfo(2))")], "the player is a mage").toEqual([133, 116]);
  addon.eval("__wfgWorld.useStarterBar('WARRIOR')");
  expect(addon.eval("return select(2, GetActionInfo(1))"), "a class can be named").toBe(118);
});

it("events: several modifiers changing at once fire in a fixed order", () => {
  const addon = client(["MODIFIER_STATE_CHANGED"]);
  seen(addon);
  addon.keys({ alt: true, shift: true, ctrl: true });
  expect(seen(addon), "shift, ctrl, alt").toEqual(["MODIFIER_STATE_CHANGED LSHIFT 1", "MODIFIER_STATE_CHANGED LCTRL 1", "MODIFIER_STATE_CHANGED LALT 1"]);
});

it("events: keys() fires MODIFIER_STATE_CHANGED for each change and not for a repeat", () => {
  const addon = client(["MODIFIER_STATE_CHANGED"]);
  seen(addon);
  addon.keys({ shift: true });
  addon.keys({ shift: true });
  addon.keys({ shift: false, ctrl: true });
  expect(seen(addon), "LSHIFT down, then LSHIFT up and LCTRL down").toEqual(["MODIFIER_STATE_CHANGED LSHIFT 1", "MODIFIER_STATE_CHANGED LSHIFT 0", "MODIFIER_STATE_CHANGED LCTRL 1"]);
  expect(addon.eval("return { IsShiftKeyDown(), IsControlKeyDown() }"), "the modifier reads follow").toEqual([false, true]);
});

it("events: levelUp fires UNIT_LEVEL then PLAYER_LEVEL_UP, and pushSpellToActionBar places the spell and fires SPELL_PUSHED_TO_ACTIONBAR", () => {
  const addon = client(["UNIT_LEVEL", "PLAYER_LEVEL_UP", "SPELL_PUSHED_TO_ACTIONBAR"]);
  seen(addon);
  addon.eval("__wfgWorld.levelUp(61)");
  expect([seen(addon), addon.eval('return UnitLevel("player")')], "the level changes and both events say so").toEqual([["UNIT_LEVEL player", "PLAYER_LEVEL_UP 61"], 61]);
  addon.eval("__wfgWorld.pushSpellToActionBar(133, 3)");
  expect([seen(addon), addon.eval("return select(2, GetActionInfo(3))")], "the slot holds the spell").toEqual([["SPELL_PUSHED_TO_ACTIONBAR 133 3"], 133]);
});

it("stances: the strip answers GetNumShapeshiftForms, GetShapeshiftFormInfo and GetShapeshiftForm, and a change fires UPDATE_SHAPESHIFT_FORMS", () => {
  const addon = client(["UPDATE_SHAPESHIFT_FORMS"]);
  expect(addon.eval("return { GetNumShapeshiftForms(), GetShapeshiftForm(), GetShapeshiftFormInfo(1) }"), "a class with no stances has none").toEqual([0, 0]);
  seen(addon);
  addon.eval("__wfgWorld.setStances({ { icon = 'A', spellID = 2457, active = true }, { icon = 'B', spellID = 71, castable = false } })");
  expect(seen(addon)).toEqual(["UPDATE_SHAPESHIFT_FORMS"]);
  expect(addon.eval("return { GetNumShapeshiftForms(), GetShapeshiftForm(), GetShapeshiftFormInfo(1) }"), "Battle Stance is active").toEqual([2, 1, "A", true, true, 2457]);
  expect(addon.eval("return { GetShapeshiftFormInfo(2) }"), "the second form is not castable").toEqual(["B", false, false, 71]);
});

it("C_ClickBindings: the game's profile is plain Left = Target and Right = Open menu; the list handed out is a copy; Set and Reset change it", () => {
  const addon = client();
  expect(addon.eval("local p = C_ClickBindings.GetProfileInfo() return { #p, p[1].button, p[1].type, p[2].button, p[2].actionID }"), "two interaction bindings").toEqual([2, "LeftButton", 3, "RightButton", 2]);
  addon.eval("C_ClickBindings.GetProfileInfo()[1].button = 'MiddleButton'");
  expect(addon.eval("return C_ClickBindings.GetProfileInfo()[1].button"), "changing the copy changes nothing").toBe("LeftButton");
  addon.eval("C_ClickBindings.SetProfileByInfo({ { type = Enum.ClickBindingType.Spell, actionID = 2061, button = 'RightButton', modifiers = 0 } })");
  expect(addon.eval("return { #C_ClickBindings.GetProfileInfo(), C_ClickBindings.GetBindingType('RightButton', 0), C_ClickBindings.GetBindingType('LeftButton', 0) }"), "the new profile answers by button").toEqual([1, 1, 0]);
  addon.eval("C_ClickBindings.ResetCurrentProfile()");
  expect(addon.eval("return #C_ClickBindings.GetProfileInfo()"), "reset restores the game's two").toBe(2);
  expect(addon.eval("return { C_ClickBindings.CanSpellBeClickBound(133), C_ClickBindings.CanSpellBeClickBound(999999) }"), "a known spell can be bound").toEqual([true, false]);
});

it("world.reset: bindings, sets, stances and the click profile go back to the start", () => {
  const addon = client();
  addon.eval(`SetBinding("F", "ACTIONBUTTON4") SaveBindings(1) LoadBindings(2) __wfgWorld.setStances({ { icon = "A" } })
    C_ClickBindings.SetProfileByInfo({}) C_ClickBindings.ExecuteBinding("player", "LeftButton", 0)
    __wfgWorld.cursor = { type = "item", id = 1 } PlaceAction(5) __wfgWorld.cursor = { type = "item", id = 1 } __wfgWorld.reset()`);
  expect(addon.eval("return { GetCurrentBindingSet(), GetBindingKey('ACTIONBUTTON4') == nil, GetNumShapeshiftForms(), #C_ClickBindings.GetProfileInfo(), __wfgWorld.bindingsSaved(), __wfgWorld.cursor == nil, __wfgWorld.placed == nil, #__wfgWorld.clickExecuted }"), "all back").toEqual([1, true, 0, 2, true, true, true, 0]);
});

// Combat blocks (scripts/lib/wow-taint.lua) -------------------------------------------------

// Each call the client refuses addon code in combat, as the addon writes it, with the state it would change.
const REFUSED = [
  ["SetBinding", 'SetBinding("F", "ACTIONBUTTON4")'],
  ["SetBindingSpell", 'SetBindingSpell("F", "Fireball")'],
  ["SetBindingMacro", 'SetBindingMacro("F", "Heal")'],
  ["SetBindingItem", 'SetBindingItem("F", "Potion")'],
  ["SetBindingClick", 'SetBindingClick("F", "Frame1")'],
  ["SaveBindings", "SaveBindings(1)"],
  ["LoadBindings", "LoadBindings(0)"],
  ["PlaceAction", "PlaceAction(5)"],
  ["C_ActionBar.PutActionInSlot", "C_ActionBar.PutActionInSlot(5)"],
  ["C_Spell.PickupSpell", "C_Spell.PickupSpell(133)"],
  ["C_ClickBindings.SetProfileByInfo", "C_ClickBindings.SetProfileByInfo({})"],
  ["C_ClickBindings.ResetCurrentProfile", "C_ClickBindings.ResetCurrentProfile()"],
  ["C_ClickBindings.ExecuteBinding", "C_ClickBindings.ExecuteBinding('player', 'LeftButton', 0)"],
];

// What a call could change: the live key, the saved set, slot 5, the cursor, the click profile.
const STATE = `return { GetBindingAction("F"), __wfgWorld.bindingsSaved(), select(2, GetActionInfo(5)), (select(4, GetCursorInfo())), #C_ClickBindings.GetProfileInfo(), #__wfgWorld.clickExecuted }`;

it("combat blocks: addon code's binding, placement and click-profile writes do nothing in combat and fire ADDON_ACTION_BLOCKED", () => {
  const addon = client();
  addon.eval("__wfgWorld.setAction(5, { id = 133 }) __wfgWorld.cursor = { type = 'spell', id = 116 } SaveBindings(1)");
  const before = addon.eval(STATE);
  addon.world.combat(true);
  expectErrors(...REFUSED.map(([name]) => `blocked in combat: Modules/TEST-ONLY.lua:1 called ${name}(), which the client refuses addon code in a fight`));
  // (A call in tail position drops the caller's stack frame, so the harness cannot tell it from test code: the cases below call and then return.)
  for (const [, call] of REFUSED) expect(asAddon(addon, `local out = ${call} return out`), `${call} answers nothing`).toBe(null);
  expect(addon.eval(STATE), "no state moved").toEqual(before);
  expect(seen(addon).filter((e) => e !== "UPDATE_BINDINGS"), "the client says so once per call").toEqual(REFUSED.map(([name]) => `ADDON_ACTION_BLOCKED Vanguard ${name}()`));
});

it("combat blocks: game and test code, and addon code out of combat, are not blocked", () => {
  const addon = client();
  addon.world.combat(true);
  expect(addon.eval('return SetBinding("F", "ACTIONBUTTON4")'), "test code (standing in for the game's) binds a key in combat").toBe(true);
  addon.world.combat(false);
  expect(asAddon(addon, 'return SetBinding("G", "ACTIONBUTTON5")'), "the addon binds a key out of combat").toBe(true);
  asAddon(addon, "SaveBindings(1) C_ClickBindings.ResetCurrentProfile()");
  expect(keysOf(addon, "ACTIONBUTTON5"), "and it is kept").toEqual(["G"]);
  expect(seen(addon).filter((e) => e.startsWith("ADDON_ACTION_BLOCKED")), "nothing was blocked").toEqual([]);
});

it("combat blocks: a call made through pcall or a hook still counts as the addon's", () => {
  const addon = client();
  addon.world.combat(true);
  expectErrors("blocked in combat: Core/TEST-ONLY.lua:1 called PlaceAction(), which the client refuses addon code in a fight");
  addon.eval(`hooksecurefunc("PlaceAction", function() end) __wfgWorld.cursor = { type = 'spell', id = 116 }
    assert(load("pcall(PlaceAction, 5)", "@Core/TEST-ONLY.lua"))()`);
  expect(addon.eval("return HasAction(5)"), "the slot stayed empty").toBe(false);
});

it("keyPreimage: every bound key and its command, CLICK and SPELL keys included, to compare a restore against", () => {
  const addon = client();
  addon.eval('SetBindingClick("X", "MyBtn", "RightButton") SetBindingSpell("C", "Fireball")');
  expect(addon.eval("return __wfgWorld.keyPreimage()"), "the keys GetBinding(i) lists and those it doesn't")
    .toEqual({ 1: "ACTIONBUTTON1", 2: "ACTIONBUTTON2", 3: "ACTIONBUTTON3", B: "OPENALLBAGS", X: "CLICK MyBtn:RightButton", C: "SPELL Fireball" });
});

it("ClearCursor: an action lifted off a bar and cleared is recorded in world.discarded; one that never sat on a bar is not", () => {
  const addon = client();
  addon.eval("__wfgWorld.setAction(5, { id = 133 }) PickupAction(5) ClearCursor() __wfgWorld.cursor = { type = 'spell', id = 116 } ClearCursor()");
  expect(addon.eval("local out = {} for i, a in ipairs(__wfgWorld.discarded) do out[i] = a.id end return out"), "only Fireball was lost").toEqual([133]);
});

it("combatAfterCalls: the fight starts at the n-th guarded call, which is the first one refused", () => {
  const addon = client();
  addon.eval("__wfgWorld.combatAfterCalls(2)");
  expectErrors("blocked in combat: Modules/TEST-ONLY.lua:1 called SetBinding(), which the client refuses addon code in a fight");
  asAddon(addon, 'SetBinding("F", "ACTIONBUTTON4") SetBinding("G", "ACTIONBUTTON5") SetBinding("H", "ACTIONBUTTON6")');
  expect([keysOf(addon, "ACTIONBUTTON4"), keysOf(addon, "ACTIONBUTTON5"), addon.eval("return InCombatLockdown()")], "one write landed, then combat began").toEqual([["F"], [], true]);
});

it("combatAfterCalls: SetBindingSpell and the other helpers count as one call each", () => {
  const addon = client();
  addon.eval("__wfgWorld.combatAfterCalls(2)");
  expectErrors("blocked in combat: Modules/TEST-ONLY.lua:1 called SetBindingMacro(), which the client refuses addon code in a fight");
  asAddon(addon, 'SetBindingSpell("F", "Fireball") SetBindingMacro("G", "Heal")');
  expect([addon.eval('return GetBindingAction("F")'), addon.eval('return GetBindingAction("G")')], "the second helper was the one refused").toEqual(["SPELL Fireball", ""]);
});
