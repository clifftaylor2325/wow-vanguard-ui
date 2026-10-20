// clicks: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, GAME_CLICKS_LUA, RAID_ENV, UNITS_ENV, chatHas, loggedIn } from "./helpers.mjs";

it("click casting", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + "GetSpecialization = function() return __spec end __spec = 1");
  const CC = 'ns.GetModule("ClickCast")';
  expect(addon.eval(`return ${CC}.KeyText("ctrl-shift-BUTTON2")`) === "Ctrl + Shift + Right click", "mouse keys read as Ctrl + Shift + Right click").toBeTruthy();
  expect(addon.eval(`return ${CC}.KeyText("SHIFT-MOUSEWHEELUP")`) === "Shift + Wheel up (hover)", "hover keys read as Shift + Wheel up (hover)").toBeTruthy();
  addon.eval(`${CC}.Add("ctrl-BUTTON2", "spell", "TEST-ONLY Renew")
    ${CC}.Add("SHIFT-1", "spell", "TEST-ONLY Flash Heal")
    ${CC}.Add("MOUSEWHEELUP", "macro", "/cast [@mouseover] TEST-ONLY Heal")
    __spawn(1, "raid1")`);
  const b = addon.eval(`local b = Vanguard_RaidUnitButton1 return { t = b:GetAttribute("ctrl-type2"), s = b:GetAttribute("ctrl-spell2"),
    ht = b:GetAttribute("*type-vg2"), hs = b:GetAttribute("*spell-vg2"), mt = b:GetAttribute("*type-vg3"), mx = b:GetAttribute("*macrotext-vg3"),
    enter = b.__wraps.OnEnter, leave = b.__wraps.OnLeave, hide = b.__wraps.OnHide }`);
  expect(b.t === "spell" && b.s === "TEST-ONLY Renew", "Ctrl + Right click on a raid frame casts the spell (ctrl-type2 / ctrl-spell2)").toBeTruthy();
  expect(b.ht === "spell" && b.hs === "TEST-ONLY Flash Heal" && b.mt === "macro" && /@mouseover/.test(b.mx), "hover keys click virtual buttons that cast the spell or run the macro").toBeTruthy();
  expect(/SetBindingClick\(true, "SHIFT-1", self, "vg2"\)/.test(b.enter) && /"MOUSEWHEELUP", self, "vg3"/.test(b.enter), "entering a frame binds the hover keys to it").toBeTruthy();
  // The game's lookup for <prefix>type<suffix>: the prefixed name, then "*", then the bare name (the order SecureButton_GetModifiedAttribute uses).
  const lookup = (prefix, name, suffix) => addon.eval(`local b = Vanguard_RaidUnitButton1
    return b:GetAttribute(${JSON.stringify(prefix + name + suffix)}) or b:GetAttribute(${JSON.stringify("*" + name + suffix)}) or b:GetAttribute(${JSON.stringify(name)})`);
  expect(["", "shift-", "ctrl-shift-"].map((held) => lookup(held, "spell", "-vg2")), "a hover key finds its spell whatever modifiers are held").toEqual(Array(3).fill("TEST-ONLY Flash Heal"));
  expect(addon.eval('return Vanguard_RaidUnitButton1:GetAttribute("type-vg2")'), "no unprefixed hover attribute is left behind").toBe(null);
  expect(!/BUTTON2/.test(b.enter), "mouse bindings aren't key bindings").toBeTruthy();
  expect(b.leave === "self:ClearBindings()" && b.hide === "self:ClearBindings()", "leaving or hiding the frame releases the keys").toBeTruthy();
  addon.eval(`${CC}.Remove("ctrl-BUTTON2")`);
  expect(addon.eval('return Vanguard_RaidUnitButton1:GetAttribute("ctrl-type2")') === null, "removing a binding clears it from the frames").toBeTruthy();
  addon.eval("__wfgStub.inCombat = true");
  addon.eval(`${CC}.Add("ctrl-BUTTON1", "spell", "TEST-ONLY Shield")`);
  expect(addon.eval('return Vanguard_RaidUnitButton1:GetAttribute("ctrl-type1")') === null, "in combat, changes wait").toBeTruthy();
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval('return Vanguard_RaidUnitButton1:GetAttribute("ctrl-spell1")') === "TEST-ONLY Shield", "and apply when combat ends").toBeTruthy();
  addon.eval("__spec = 2");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect(addon.eval('return Vanguard_RaidUnitButton1:GetAttribute("ctrl-spell1")') === null, "each spec has its own bindings").toBeTruthy();
  addon.clearChat();
  addon.eval("__spec = 1");
  addon.slash("binds");
  expect(chatHas(addon, /Shift \+ 1 \(hover\)  ->  TEST-ONLY Flash Heal/), "/vg binds lists this spec's bindings").toBeTruthy();
});

it("click-casting validation, labels and unit frames", () => {
  const addon = loggedIn("", {
    // TEST-ONLY saved profile: unit-frame click casting starts on.
    savedVariables: "VanguardDB = { profiles = { Default = { ClickCast = { unitFrames = true } } } }",
  });
  const CC = 'ns.GetModule("ClickCast")';
  const bad = addon.eval(`local ok, err = ${CC}.Add("1", "spell", "   ") return err`);
  expect(bad === "pick a spell", "a spell binding with no spell is refused").toBeTruthy();
  expect(addon.eval(`local _, err = ${CC}.Add("1", "macro", "") return err`) === "type the macro text", "a macro binding with no text is refused").toBeTruthy();
  expect(addon.eval(`return ${CC}.ActionText({ action = "target" })`) === "Target", "a target binding reads as Target").toBeTruthy();
  expect(addon.eval(`return ${CC}.ActionText({ action = "menu" })`) === "Unit menu", "a menu binding reads as Unit menu").toBeTruthy();
  expect(addon.eval(`return ${CC}.ActionText({ action = "what" })`) === "Unit menu", "anything unknown reads as Unit menu").toBeTruthy();
  const frames = addon.eval(`local n = 0 for _ in pairs(ns.GetModule("UnitFrames").frames) do n = n + 1 end return n`);
  expect(addon.eval(`return #${CC}.frames`) >= frames && frames > 0, "unit frames are registered when that setting is on").toBeTruthy();
});

it("the game's click bindings: Vanguard's own step aside out of combat, and come back", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + `C_ClickBindings = {}
    ToggleClickBindingFrame = function() __gameWindow = (__gameWindow or 0) + 1 end`);
  const CC = 'ns.GetModule("ClickCast")';
  addon.eval(`${CC}.Add("ctrl-BUTTON2", "spell", "TEST-ONLY Renew") ${CC}.Add("SHIFT-1", "spell", "TEST-ONLY Flash Heal") __spawn(1, "raid1")
    Vanguard_RaidUnitButton1:SetAttribute("*type1", "target") Vanguard_RaidUnitButton1:SetAttribute("*type2", "togglemenu")`);
  // The raid button's click-casting state: Vanguard's attributes and snippet, and the frame's own target and menu
  // clicks (RF.INIT sets them in the header's snippet, which the test client doesn't run, so they are set above).
  const state = () => addon.eval(`local b = Vanguard_RaidUnitButton1 return { b:GetAttribute("ctrl-type2") or "none", b:GetAttribute("*type-vg2") or "none",
    b.vgWrapped == true, b:GetAttribute("*type1"), b:GetAttribute("*type2") }`);
  expect(state(), "off by default: Vanguard's bindings").toEqual(["spell", "spell", true, "target", "togglemenu"]);
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.texts("THE GAME'S CLICK BINDINGS").length, "the page offers the game's click bindings").toBe(1);
  addon.eval("__wfgStub.inCombat = true");
  addon.eval('__click("Use the game\'s click bindings")');
  expect([addon.eval(`return ${CC}.UsesGame()`), state()[0]], "switched on in combat: it waits for the fight to end").toEqual([true, "spell"]);
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(state(), "then Vanguard's attributes and hover snippets go; the target and menu clicks the game's bindings use stay").toEqual(["none", "none", false, "target", "togglemenu"]);
  expect(addon.texts("The game's click bindings are in use (below): these are kept for when you switch back.").length, "the page says Vanguard's bindings rest").toBe(1);
  addon.slash("binds");
  expect(chatHas(addon, /The game's click bindings are in use/) && chatHas(addon, /Shift \+ 1 \(hover\)  ->  TEST-ONLY Flash Heal/), "/vg binds says so, and still lists Vanguard's").toBe(true);
  addon.eval('__click("Open the game\'s click bindings")');
  expect(addon.eval("return { __gameWindow, Vanguard_Options:IsShown() }"), "the button opens the game's Click Casting window").toEqual([1, false]);
  addon.eval('ToggleClickBindingFrame = nil ns.Options.Show("clickcast")');
  addon.clearChat();
  addon.eval('__click("Open the game\'s click bindings")');
  expect(chatHas(addon, /no click bindings window/), "a client without that window says so").toBe(true);
  addon.eval(`__click("Use the game's click bindings")`);
  expect(state(), "switched off: Vanguard's bindings are back").toEqual(["spell", "spell", true, "target", "togglemenu"]);
  const old = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + "C_ClickBindings = nil ToggleClickBindingFrame = nil", { savedVariables: "VanguardDB.profiles = { Default = { ClickCast = { useGame = true } } }" });
  old.eval('ns.GetModule("ClickCast").Add("ctrl-BUTTON2", "spell", "TEST-ONLY Renew") __spawn(1, "raid1") ns.Options.Show("clickcast")');
  expect([old.eval('return Vanguard_RaidUnitButton1:GetAttribute("ctrl-type2")'), old.texts("THE GAME'S CLICK BINDINGS").length], "a client without the game's click bindings keeps Vanguard's, and the page doesn't offer them").toEqual(["spell", 0]);
});

it("/vg binds says which Target and Unit menu bindings the game's own click bindings won't run, and why", () => {
  const addon = loggedIn(GAME_CLICKS_LUA);
  const CC = 'ns.GetModule("ClickCast")';
  addon.eval(`${CC}.ApplyLayout(ns.ClickCastSpells.Layout()) ${CC}.Add("BUTTON2", "menu") ${CC}.Add("ctrl-BUTTON1", "target")
    ${CC}.Add("SHIFT-Q", "menu") ${CC}.Add("BUTTON4", "focus") ${CC}.Add("alt-BUTTON3", "spell", "TEST-ONLY Renew")`);
  const warn = addon.eval('return "|c" .. ns.Theme.Hex("warn")');
  const click = `  ${warn}(does nothing: the game runs it only on a click its own Click Casting window binds)|r`;
  const key = `  ${warn}(does nothing: the game won't run it from a key)|r`;
  // The /vg binds lines for the bindings above (the mage layout adds Arcane Intellect), without the chat prefix, sorted.
  const lines = () => {
    addon.clearChat();
    addon.slash("binds");
    return Array.from(addon.chat()).filter((l) => l.includes("  ->  ")).map((l) => l.replace(/^.*?Vanguard:\|r /, "")).sort();
  };
  expect(lines(), "with the game's default clicks (Left = Target, Right = menu), middle, Ctrl + Left and a hover key do nothing").toEqual([
    "  Alt + Middle click  ->  TEST-ONLY Renew",
    "  Button 4  ->  Focus",
    `  Ctrl + Left click  ->  Target${click}`,
    "  Left click  ->  Target",
    `  Middle click  ->  Unit menu${click}`,
    "  Right click  ->  Unit menu",
    "  Shift + Left click  ->  Arcane Intellect",
    `  Shift + Q (hover)  ->  Unit menu${key}`,
  ]);
  addon.eval('table.insert(__gameClicks, { type = 3, actionID = 1, button = "Button1", modifiers = 4 }) table.insert(__gameClicks, { type = 1, actionID = 139, button = "MiddleButton", modifiers = 0 })');
  const covered = lines();
  expect([covered.includes("  Ctrl + Left click  ->  Target"), covered.includes(`  Middle click  ->  Unit menu${click}`)],
    "a modified Target click in the game's profile covers Ctrl + Left; a spell there doesn't cover the middle click").toEqual([true, true]);
  addon.eval(`${CC}.settings.useGame = true`);
  expect(lines().some((l) => l.includes("does nothing")), "while the game's bindings are in use, Vanguard's rest and nothing is flagged").toBe(false);
  addon.eval(`${CC}.settings.useGame = false Enum.ClickBindingType = nil`);
  expect(lines().some((l) => l.includes("does nothing")), "a client that can't say what the game binds flags nothing").toBe(false);
  addon.eval("C_ClickBindings = {}");
  expect(lines().some((l) => l.includes("does nothing")), "nor one without the profile call").toBe(false);
});
