// clicks: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, GAME_CLICKS_LUA, GAME_ENGINE_LUA, RAID_ENV, UNITS_ENV, chatHas, loggedIn } from "./helpers.mjs";

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
  expect(addon.eval(`return ns.Options.ShowTab("The game's click bindings")`), "the page offers the game's click bindings, on a tab of their own").toBe(true);
  addon.eval("__wfgStub.inCombat = true");
  addon.eval('__click("Use the game\'s click bindings")');
  expect([addon.eval(`return ${CC}.UsesGame()`), state()[0]], "switched on in combat: it waits for the fight to end").toEqual([true, "spell"]);
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(state(), "then Vanguard's attributes and hover snippets go; the target and menu clicks the game's bindings use stay").toEqual(["none", "none", false, "target", "togglemenu"]);
  addon.eval('ns.Options.ShowTab("Click casting")');
  expect(addon.texts("The game's click bindings are in use: these are kept for when you switch back.").length, "the page says Vanguard's bindings rest").toBe(1);
  addon.slash("binds");
  expect(chatHas(addon, /The game's click bindings are in use/) && chatHas(addon, /Shift \+ 1 \(hover\)  ->  TEST-ONLY Flash Heal/), "/vg binds says so, and still lists Vanguard's").toBe(true);
  addon.eval("__wfgStub.inCombat = true");
  addon.eval('__click("Open the game\'s click bindings")');
  expect([addon.eval("return { __gameWindow or 0, Vanguard_Options:IsShown() }"), chatHas(addon, /The game's click bindings window doesn't open from Vanguard in a fight/)],
    "in a fight the button says the window waits, and the options stay open").toEqual([[0, true], true]);
  addon.eval("__wfgStub.inCombat = false");
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
  addon.eval(`${CC}.ApplyLayout(ns.ClickCastSpells.Layout()) ${CC}.Add("BUTTON3", "menu") ${CC}.Add("ctrl-BUTTON1", "target")
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
  addon.eval('table.insert(__gameClicks, { type = 3, actionID = 1, button = "Button1", modifiers = 2 }) table.insert(__gameClicks, { type = 1, actionID = 139, button = "MiddleButton", modifiers = 0 })');
  const covered = lines();
  const overridden = `  ${warn}(does nothing: the game's own Click Casting window binds a spell or macro to this click, and that runs instead)|r`;
  expect([covered.includes("  Ctrl + Left click  ->  Target"), covered.includes(`  Middle click  ->  Unit menu${overridden}`)],
    "a modified Target click in the game's profile covers Ctrl + Left; a spell on the middle click doesn't cover it, it runs instead").toEqual([true, true]);
  addon.eval(`${CC}.settings.useGame = true`);
  expect(lines().some((l) => l.includes("does nothing")), "while the game's bindings are in use, Vanguard's rest and nothing is flagged").toBe(false);
  addon.eval(`${CC}.settings.useGame = false Enum.ClickBindingType = nil`);
  expect(lines().some((l) => l.includes("does nothing")), "a client that can't say what the game binds flags nothing").toBe(false);
  addon.eval("C_ClickBindings = {}");
  expect(lines().some((l) => l.includes("does nothing")), "nor one without the profile call").toBe(false);
});

it("on WoW Forever the two talent groups keep their own click-casting lists, and a group change applies that group's", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + "__wfgWorld.specGroup = 1");
  const CC = 'ns.GetModule("ClickCast")';
  addon.eval(`__spawn(1, "raid1") ${CC}.Add("ctrl-BUTTON2", "spell", "TEST-ONLY Renew")`);
  // The spell the first raid button casts on Ctrl + Right click now.
  const spell = () => addon.eval('return Vanguard_RaidUnitButton1:GetAttribute("ctrl-spell2")');
  expect(spell(), "Primary talents: the binding applies").toBe("TEST-ONLY Renew");
  addon.eval("__wfgWorld.specGroup = 2");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 1);
  expect(spell(), "Secondary talents start with no list of their own, and the frames follow").toBe(null);
  addon.eval(`${CC}.Add("ctrl-BUTTON2", "spell", "TEST-ONLY Shield")`);
  expect(spell(), "a binding made in the Secondary group applies").toBe("TEST-ONLY Shield");
  addon.eval("__wfgWorld.specGroup = 1");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 1, 2);
  expect(spell(), "back in Primary, its own spell is cast again").toBe("TEST-ONLY Renew");
  expect(addon.eval("local c = VanguardCharDB.clickcast return { c[1][1].value, c[2][1].value, c[0] == nil }"), "saved under the groups' own keys").toEqual(["TEST-ONLY Renew", "TEST-ONLY Shield", true]);
});

// TEST-ONLY default modifier masks of the harness's GetStringFromModifiers (world.modifierBits).
const ALT = 1, CTRL = 2, SHIFT = 4;

it("a Spell, Macro or PetAction the game binds to the same click is flagged: the game runs it before Vanguard's binding", () => {
  const addon = loggedIn(GAME_CLICKS_LUA);
  const CC = 'ns.GetModule("ClickCast")';
  const override = "the game's own Click Casting window binds a spell or macro to this click, and that runs instead";
  addon.eval(`${CC}.Add("shift-BUTTON2", "spell", "TEST-ONLY Renew") ${CC}.Add("ctrl-BUTTON2", "macro", "/cast TEST-ONLY Shield") ${CC}.Add("BUTTON4", "focus")
    ${CC}.Add("ctrl-shift-BUTTON1", "spell", "TEST-ONLY Flash Heal") ${CC}.Add("alt-BUTTON3", "assist") ${CC}.Add("SHIFT-Q", "spell", "TEST-ONLY Renew")`);
  // Why each binding does nothing, by key ("" when it works).
  const why = () => addon.eval(`local out = {} for _, b in ipairs(${CC}.Bindings()) do out[b.key] = ${CC}.WontRun(b) or "" end return out`);
  // Puts a binding in the game's profile: its type (Spell, Macro, PetAction, Interaction), button and modifier mask.
  const game = (type, button, modifiers = 0, actionID = 1) => addon.eval(`table.insert(__gameClicks, { type = Enum.ClickBindingType.${type}, actionID = ${actionID}, button = "${button}", modifiers = ${modifiers} })`);
  const none = { "shift-BUTTON2": "", "ctrl-BUTTON2": "", BUTTON4: "", "ctrl-shift-BUTTON1": "", "alt-BUTTON3": "", "SHIFT-Q": "" };
  expect(why(), "the game's default profile (Target on Left, the menu on Right) flags none of them").toEqual(none);
  game("Interaction", "RightButton", ALT, 2);
  game("Spell", "LeftButton", SHIFT);
  game("Spell", "RightButton", CTRL | SHIFT);
  expect(why(), "an interaction on Alt + Right, a spell on Shift + Left and one on Ctrl + Shift + Right are other clicks").toEqual(none);
  game("Spell", "RightButton", SHIFT);
  expect(why()["shift-BUTTON2"], "a game Spell on Shift + Right while Vanguard binds Renew there").toBe(override);
  game("Macro", "RightButton", CTRL);
  game("PetAction", "Button4");
  game("Spell", "LeftButton", CTRL | SHIFT);
  expect(why(), "a Macro on Ctrl + Right, a PetAction on Button 4 and a combined click are flagged, whatever the Vanguard action").toEqual(
    { ...none, "shift-BUTTON2": override, "ctrl-BUTTON2": override, BUTTON4: override, "ctrl-shift-BUTTON1": override });
  game("Spell", "MiddleButton", ALT);
  expect(why()["alt-BUTTON3"], "the game's names for the buttons (MiddleButton) are read as Button 3").toBe(override);
  addon.eval(`${CC}.settings.useGame = true`);
  expect(Object.values(why()).filter(Boolean), "while the game's bindings are in use, Vanguard's rest and nothing is flagged").toEqual([]);
});

it("a game binding whose modifier text can't be read raises no warning, and a client without the call still sees plain clicks", () => {
  const addon = loggedIn(GAME_CLICKS_LUA);
  const CC = 'ns.GetModule("ClickCast")';
  addon.eval(`${CC}.Add("shift-BUTTON2", "spell", "TEST-ONLY Renew") ${CC}.Add("BUTTON2", "spell", "TEST-ONLY Shield") ${CC}.Add("alt-shift-BUTTON1", "focus")`);
  // Whether the binding for a key is flagged.
  const flagged = (key) => addon.eval(`return ${CC}.WontRun(${CC}.Binding("${key}")) ~= nil`);
  addon.eval(`table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 1, button = "RightButton", modifiers = ${SHIFT} })
    table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 1, button = "LeftButton", modifiers = ${ALT | SHIFT} })`);
  expect(flagged("shift-BUTTON2"), "its text is made of the modifier names").toBe(true);
  addon.eval('__wfgWorld.modifierNames.shift = "HYPER"');
  expect(flagged("shift-BUTTON2"), "a name it doesn't know: not sure, so no warning").toBe(false);
  addon.eval('__wfgWorld.modifierNames = { alt = "Alt", ctrl = "Strg", shift = "Umschalt" }');
  expect([flagged("shift-BUTTON2"), flagged("alt-shift-BUTTON1")], "German names the addon doesn't have: 'Umschalt' holds 'alt', so it is not read at all").toEqual([false, false]);
  addon.eval('ALT_KEY_TEXT, CTRL_KEY_TEXT, SHIFT_KEY_TEXT = "Alt", "Strg", "Umschalt"');
  expect([flagged("shift-BUTTON2"), flagged("alt-shift-BUTTON1")], "with the client's own key texts it reads 'Umschalt' as Shift before the 'alt' inside it").toEqual([true, true]);
  addon.eval('__wfgWorld.modifierNames = { alt = "ALT", ctrl = "CTRL", shift = "SHIFT" } GetStringFromModifiers = function() return { __secret = true } end issecretvalue = function(v) return type(v) == "table" and v.__secret == true end');
  expect(flagged("shift-BUTTON2"), "a secret text is no text").toBe(false);
  addon.eval('GetStringFromModifiers = function() return 5 end');
  expect(flagged("shift-BUTTON2"), "nor is a number").toBe(false);
  addon.eval("GetStringFromModifiers = nil table.remove(__gameClicks, 2) table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 1, button = \"RightButton\", modifiers = 0 })");
  expect([flagged("shift-BUTTON2"), flagged("BUTTON2")], "without the call a modified click can't be told, but a plain one needs no decoding").toEqual([false, true]);
  addon.eval("C_ClickBindings = nil");
  expect(flagged("BUTTON2"), "a client without the game's click bindings flags nothing").toBe(false);
});

// A raid button with a class's starter layout applied over the game's default click profile; answers what a click on it does.
function layoutClicks(klass, apply) {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + GAME_CLICKS_LUA + GAME_ENGINE_LUA);
  const ids = addon.eval(`local out = {} for _, id in pairs(ns.ClickCastSpells.CLASSES.${klass}.layout) do out[#out + 1] = id end return out`);
  for (const id of ids) addon.world.learn(id, { name: `TEST-ONLY Spell ${id}`, helpful: true });
  addon.eval(`__units.player.class = "${klass}" __spawn(1, "raid1")
    Vanguard_RaidUnitButton1:SetAttribute("*type1", "target") Vanguard_RaidUnitButton1:SetAttribute("*type2", "togglemenu")`);
  addon.eval(apply);
  // What a click does: the button's name (Left, Right, Middle) and the held modifiers ("shift-").
  return (button, prefix = "") => addon.eval(`return __engineClick(Vanguard_RaidUnitButton1, "${button}Button", "${prefix}")`);
}

it("a menu on Middle click is dropped over the game's default click profile, a spell on Right click taking its place (the old layouts)", () => {
  const click = layoutClicks("PRIEST", 'local CC = ns.GetModule("ClickCast") CC.Add("BUTTON2", "spell", "TEST-ONLY Spell 2061") CC.Add("BUTTON3", "menu")');
  expect([click("Left"), click("Right"), click("Middle")], "Right casts, and the Middle menu click is thrown away by the engine").toEqual(["target", "spell", "dropped"]);
});

it("every starter layout leaves a unit menu the game's default click profile runs, and the healers' main heal on Middle click", () => {
  for (const klass of ["PRIEST", "DRUID", "PALADIN", "SHAMAN", "MAGE", "WARLOCK"]) {
    const click = layoutClicks(klass, 'local CS = ns.ClickCastSpells ns.GetModule("ClickCast").ApplyLayout(CS.Layout())');
    expect([klass, click("Left"), click("Right")], "Left targets and Right opens the menu").toEqual([klass, "target", "togglemenu"]);
    if (klass !== "MAGE" && klass !== "WARLOCK") expect([klass, click("Middle")], "the main heal is on Middle click").toEqual([klass, "spell"]);
  }
});

// A raid button with Vanguard's bindings for a Lua list of Add calls, over the game's default click profile (changed by
// setup, Lua); answers what the game's SecureUnitButton_OnClick does with a click on it (see GAME_ENGINE_LUA).
function bindingClicks(adds, setup = "") {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + GAME_CLICKS_LUA + GAME_ENGINE_LUA);
  addon.eval(`__spawn(1, "raid1") ${setup} local CC = ns.GetModule("ClickCast") ${adds}
    Vanguard_RaidUnitButton1:SetAttribute("*type1", "target") Vanguard_RaidUnitButton1:SetAttribute("*type2", "togglemenu")`);
  // The reason Vanguard gives for a binding by its key, then what a click does (button name, held modifiers).
  const why = (key) => addon.eval(`local CC = ns.GetModule("ClickCast") return CC.WontRun(CC.Binding("${key}"))`);
  const click = (button, prefix = "") => addon.eval(`return __engineClick(Vanguard_RaidUnitButton1, "${button}", "${prefix}")`);
  return { addon, why, click };
}

it("an interaction the game moved to another click remaps that click: Vanguard says so, and the engine runs the other button's binding", () => {
  const remap = "the game's own Click Casting window puts Target or the unit menu on this click, so your binding for the click it stands for runs instead";
  const { why, click } = bindingClicks('CC.Add("BUTTON2", "spell", "TEST-ONLY Renew") CC.Add("BUTTON3", "menu")',
    'table.remove(__gameClicks, 2) table.insert(__gameClicks, { type = Enum.ClickBindingType.Interaction, actionID = 2, button = "MiddleButton", modifiers = 0 })');
  expect(click("MiddleButton"), "the engine reads the Right click's binding for a Middle click: the heal, not the menu").toBe("spell");
  expect([why("BUTTON3"), why("BUTTON2")], "the Middle menu is flagged as remapped; the Right click is no longer the game's, and it casts only if it is bound").toEqual([remap, null]);
});

it("the game's coverage is by the exact modifiers: a Target on Ctrl + Left does not cover Shift + Left", () => {
  const { why, click } = bindingClicks('CC.Add("shift-BUTTON1", "target") CC.Add("ctrl-BUTTON1", "target")',
    'table.insert(__gameClicks, { type = Enum.ClickBindingType.Interaction, actionID = 1, button = "LeftButton", modifiers = __wfgWorld.modifierBits.ctrl })');
  const click_ = "the game runs it only on a click its own Click Casting window binds";
  expect([why("shift-BUTTON1"), why("ctrl-BUTTON1")], "Shift + Left is not covered, Ctrl + Left is").toEqual([click_, null]);
  expect([click("LeftButton", "shift-"), click("LeftButton", "ctrl-")], "and the engine agrees").toEqual(["dropped", "target"]);
});

it("a hover key's virtual button is never covered by the game's profile, and a game binding stored under Button2 is the Right click", () => {
  const { addon, why, click } = bindingClicks('CC.Add("SHIFT-Q", "target") CC.Add("SHIFT-E", "spell", "TEST-ONLY Renew") CC.Add("shift-BUTTON2", "spell", "TEST-ONLY Renew")',
    'table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 139, button = "Button2", modifiers = __wfgWorld.modifierBits.shift })');
  expect([click("vg1"), click("vg2")], "the Target hover key is dropped by the engine, the spell hover key casts").toEqual(["dropped", "spell"]);
  expect(why("SHIFT-Q"), "and Vanguard says so").toBe("the game won't run it from a key");
  expect([click("RightButton", "shift-"), why("shift-BUTTON2") !== null], "the alias is the Right click for the engine and for the warning").toEqual(["game:1", true]);
  expect(addon.eval("return #ns.errors"), "no error on the way").toBe(0);
});

it("once the lists are kept per talent group a client that doesn't name the group yet never sends edits to the list that predates it", () => {
  const stamped = 'VanguardCharDB = { clickcastStamps = { talentGroups = true }, clickcastGroup = 2, clickcast = { [0] = { { key = "ctrl-BUTTON2", action = "spell", value = "TEST-ONLY Old" } }, [1] = { { key = "ctrl-BUTTON2", action = "spell", value = "TEST-ONLY Primary" } }, [2] = { { key = "ctrl-BUTTON2", action = "spell", value = "TEST-ONLY Secondary" } } } }';
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA, { savedVariables: stamped });
  const CCm = 'ns.GetModule("ClickCast")';
  addon.eval('__spawn(1, "raid1")');
  // The spell the first raid button casts on Ctrl + Right click now, and the saved spell of a list.
  const cast = () => addon.eval('return Vanguard_RaidUnitButton1:GetAttribute("ctrl-spell2")');
  const saved = (key) => addon.eval(`return VanguardCharDB.clickcast[${key}][1].value`);
  expect(cast(), "the client names no group at login: the last known one (Secondary) applies, not the old list").toBe("TEST-ONLY Secondary");
  addon.eval(`${CCm}.Add("ctrl-BUTTON1", "focus")`);
  expect([addon.eval("return #VanguardCharDB.clickcast[2]"), addon.eval("return #VanguardCharDB.clickcast[0]")], "an edit goes to that group's list").toEqual([2, 1]);
  addon.eval("__wfgWorld.specGroup = 1");
  addon.fire("PLAYER_ENTERING_WORLD");
  expect([cast(), addon.eval("return VanguardCharDB.clickcastGroup"), saved(0)], "when the group is named the frames follow it, and the old list is untouched").toEqual(["TEST-ONLY Primary", 1, "TEST-ONLY Old"]);
});

it("a client that names the talent group only after login applies that group's list then", () => {
  const own = 'VanguardCharDB = { clickcast = { [0] = { { key = "ctrl-BUTTON2", action = "spell", value = "TEST-ONLY Old" } }, [2] = { { key = "ctrl-BUTTON2", action = "spell", value = "TEST-ONLY Own" } } } }';
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA, { savedVariables: own });
  addon.eval('__spawn(1, "raid1")');
  // The spell the first raid button casts on Ctrl + Right click now.
  const cast = () => addon.eval('return Vanguard_RaidUnitButton1:GetAttribute("ctrl-spell2")');
  expect(cast(), "before the migration the single list applies").toBe("TEST-ONLY Old");
  addon.eval("__wfgWorld.specGroup = 2");
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(cast(), "the group named, its own list applies").toBe("TEST-ONLY Own");
});
