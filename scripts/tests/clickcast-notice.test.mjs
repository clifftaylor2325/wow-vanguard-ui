// clickcast-notice: the game's own click bindings against Vanguard's on the Click casting page: the warnings on a
// binding the game runs over, and the menu-click notice (Swap them, Dismiss), in the TEST-ONLY headless client
// (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, GAME_CLICKS_LUA, chatHas, isTok, loggedIn } from "./helpers.mjs";
import { CC, CS, MENU_NOTICE, OLD_SHAPE, applies, bindings, cell, priestly } from "./clickcast-helpers.mjs";

// A logged-in priest with the spellbook above, on the click-casting page when asked.
const priest = (extra = "", opts = {}) => priestly(loggedIn(CLICK_LUA + extra, opts));

it("with a game Spell on the same click, the page marks the binding the game's runs over, and says why", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 139, button = "RightButton", modifiers = __wfgWorld.modifierBits.shift })
    ${CC}.ApplyLayout(ns.ClickCastSpells.Layout()) ns.Options.Show("clickcast")`);
  const why = "the game's own Click Casting window binds a spell or macro to this click, and that runs instead";
  // A cell's name colour as a token.
  const colour = (key, token) => isTok(addon, addon.eval(`return __wfgStub.frames[${cell(addon, key)}].name.__textColor`), token);
  expect([colour("shift-BUTTON2", "warn"), colour("shift-BUTTON1", "text")], "Shift + Right click (Renew) is in the warning colour, the neighbouring cell is not").toEqual([true, true]);
  addon.hover(cell(addon, "shift-BUTTON2"));
  expect(addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out"), "hovering it says why").toEqual(["Renew", `Does nothing: ${why}.`]);
  addon.hover(null);
  addon.clearChat();
  addon.slash("binds");
  expect(chatHas(addon, new RegExp(`Shift \\+ Right click  ->  Renew .*\\(does nothing: ${why.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`)), "/vg binds adds the reason").toBe(true);
});

it("the Click casting page offers to fix the old layouts' dead menu click, and Swap them moves the menu and the spell", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`${CC}.Add("shift-BUTTON2", "spell", "Renew", 139) ${OLD_SHAPE} ns.Options.Show("clickcast")`);
  expect(addon.texts(MENU_NOTICE).length, "the notice shows").toBe(1);
  expect(addon.eval('return __click("Swap them")'), "with its button").toBe(true);
  expect([bindings(addon).BUTTON2, bindings(addon).BUTTON3], "Right click is the menu, Middle click the spell it had").toEqual(["menu:nil:nil:nil", "spell:Flash Heal:2061:nil"]);
  expect(bindings(addon)["shift-BUTTON2"], "nothing else changes").toBe("spell:Renew:139:nil");
  expect(addon.texts(MENU_NOTICE).length, "the notice goes").toBe(0);
});

it("CC.FixMenuClick with nothing to fix changes nothing", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`${OLD_SHAPE} ${CC}.FixMenuClick()`);
  expect(addon.eval(`return ${CC}.MenuClickNeedsFix()`)).toBe(false);
  expect(addon.eval(`return #${CC}.FixMenuClick()`), "it names no list").toBe(0);
  expect(bindings(addon).BUTTON2, "and changes nothing").toBe("menu:nil:nil:nil");
});

it("Swap them in a fight keeps the change and applies it when the fight ends", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`${OLD_SHAPE} ns.Options.Show("clickcast")`);
  addon.world.combat(true);
  const [, during] = applies(addon, () => addon.eval('return __click("Swap them")'));
  expect([bindings(addon).BUTTON2, during], "the list is changed at once, and nothing is applied to the frames in the fight").toEqual(["menu:nil:nil:nil", 0]);
  const [, after] = applies(addon, () => addon.world.combat(false));
  expect(after, "it applies when the fight ends").toBe(1);
});

it("Dismiss puts the notice away for good: the stamp survives a rebuilt page and a new session", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`${OLD_SHAPE} ns.Options.Show("clickcast")`);
  addon.eval('__click("Dismiss")');
  expect([addon.texts(MENU_NOTICE).length, bindings(addon).BUTTON3], "gone, and nothing was rewritten").toEqual([0, "menu:nil:nil:nil"]);
  expect(addon.eval("return VanguardCharDB.clickcastStamps.menuNotice"), "stamped for the character").toBe(true);
  addon.eval('ns.Options.RebuildPage("clickcast")');
  expect(addon.texts(MENU_NOTICE).length, "a rebuilt page doesn't bring it back").toBe(0);
  const again = priest(GAME_CLICKS_LUA, { savedVariables: 'VanguardCharDB = { clickcastStamps = { menuNotice = true }, clickcast = { [0] = { { key = "BUTTON2", action = "spell", value = "Flash Heal" }, { key = "BUTTON3", action = "menu" } } } }' });
  again.eval('ns.Options.Show("clickcast")');
  expect([again.eval(`return ${CC}.MenuClickNeedsFix()`), again.texts(MENU_NOTICE).length], "the shape is still there, and so is the stamp: no notice").toEqual([true, 0]);
});

it("the menu-click notice shows only for the old shape: a heal on Right and the menu on Middle", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval('ns.Options.Show("clickcast")');
  // Whether the page offers the fix now (the page is built again when that changes).
  const offered = () => addon.texts(MENU_NOTICE).length === 1;
  addon.eval(`${CC}.ApplyLayout(${CS}.Layout()) ns.Options.RebuildPage("clickcast")`);
  expect(offered(), "the starter layout (Target, the menu on Right, the heal on Middle) is fine").toBe(false);
  addon.eval(`${CC}.Clear() ${CC}.Add("BUTTON2", "spell", "Flash Heal", 2061) ns.Options.RebuildPage("clickcast")`);
  expect(offered(), "a spell on Right and no menu on Middle is fine").toBe(false);
  addon.eval(`${CC}.Add("BUTTON3", "menu") ns.Options.RebuildPage("clickcast")`);
  expect(offered(), "a spell on Right and the menu on Middle is the old shape").toBe(true);
  addon.eval(`${CC}.Add("BUTTON2", "macro", "/cast Flash Heal") ns.Options.RebuildPage("clickcast")`);
  expect(offered(), "a macro on Right is a heal too: offered").toBe(true);
  addon.eval(`${CC}.Add("BUTTON2", "focus") ns.Options.RebuildPage("clickcast")`);
  expect(offered(), "Focus on Right is not").toBe(false);
});

it("the menu-click notice is not shown while the game's own bindings are in use, or where the client can't say what they bind", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`${OLD_SHAPE} ns.Options.Show("clickcast")`);
  expect(addon.texts(MENU_NOTICE).length, "to start with it is offered").toBe(1);
  addon.eval(`${CC}.settings.useGame = true ns.Options.RebuildPage("clickcast")`);
  expect(addon.texts(MENU_NOTICE).length, "while the game's own bindings are in use the menu click works").toBe(0);
  addon.eval(`${CC}.settings.useGame = false Enum.ClickBindingType = nil ns.Options.RebuildPage("clickcast")`);
  expect(addon.texts(MENU_NOTICE).length, "a client that can't say what the game binds shows nothing").toBe(0);
  expect(priest(`C_ClickBindings = nil ${OLD_SHAPE} ns.Options.Show("clickcast")`).texts(MENU_NOTICE).length, "nor does a client without the game's click bindings").toBe(0);
});

it("the notice follows the page: it appears when a talent group change brings the old shape, and goes with the fix", () => {
  const addon = priest(GAME_CLICKS_LUA + "__wfgWorld.specGroup = 2");
  addon.eval(`${OLD_SHAPE} __wfgWorld.specGroup = 1 ns.Options.Show("clickcast")`);
  expect(addon.texts(MENU_NOTICE).length, "Primary talents have no bindings: no notice").toBe(0);
  addon.eval("__wfgWorld.specGroup = 2");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 1);
  expect(addon.texts(MENU_NOTICE).length, "Secondary talents hold the old shape: the page offers the fix").toBe(1);
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 2);
  expect(addon.texts(MENU_NOTICE).length, "an event that changes nothing leaves one notice").toBe(1);
  addon.eval('__click("Swap them")');
  expect(addon.texts(MENU_NOTICE).length).toBe(0);
});

// The old shape's bindings (Flash Heal on Right, the menu on Middle) over a game profile changed by Lua, the page open;
// answers whether the swap is offered, what MenuClickNeedsFix says, and the two bindings after trying CC.FixMenuClick.
function offeredOver(profileLua) {
  const addon = priest(GAME_CLICKS_LUA + profileLua);
  addon.eval(`${OLD_SHAPE} ns.Options.Show("clickcast")`);
  const needs = addon.eval(`return ${CC}.MenuClickNeedsFix()`);
  const offered = addon.texts(MENU_NOTICE).length === 1;
  addon.eval(`${CC}.FixMenuClick()`);
  return { needs, offered, after: [bindings(addon).BUTTON2, bindings(addon).BUTTON3] };
}

it("the swap is offered only where the Middle menu fails for want of cover and both clicks would then run", () => {
  const before = ["spell:Flash Heal:2061:nil", "menu:nil:nil:nil"];
  expect(offeredOver(""), "the default profile: offered").toMatchObject({ needs: true, offered: true, after: [before[1], before[0]] });
  const spellOnMiddle = offeredOver('table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 139, button = "MiddleButton", modifiers = 0 })');
  expect(spellOnMiddle, "a game Spell on Middle would stay in the way: not offered, and nothing is swapped").toEqual({ needs: false, offered: false, after: before });
  const rightIsSpell = offeredOver('table.remove(__gameClicks, 2) table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 139, button = "RightButton", modifiers = 0 })');
  expect(rightIsSpell, "the game's Spell on Right: the menu would not open there either: not offered").toEqual({ needs: false, offered: false, after: before });
});

it("a talent group change brings the notice to a Click casting page the window isn't showing", () => {
  const addon = priest(GAME_CLICKS_LUA + "__wfgWorld.specGroup = 1");
  addon.eval(`ns.Options.Show("clickcast") ns.Options.Show("general") __wfgWorld.specGroup = 2 ${OLD_SHAPE}`);
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 1);
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.texts(MENU_NOTICE).length, "the page was rebuilt when the group changed, not a frame later").toBe(1);
});

it("a healer with the old layouts' menu click is told once in chat at login, and not after a dismissal or for a list without the shape", () => {
  const old = 'VanguardCharDB = { clickcast = { [0] = { { key = "BUTTON2", action = "spell", value = "Flash Heal" }, { key = "BUTTON3", action = "menu" } } } }';
  const told = /Middle click can't open the unit menu on your raid frames\. \/vg > Click casting/;
  const addon = priest(GAME_CLICKS_LUA, { savedVariables: old });
  expect(chatHas(addon, told), "told at login").toBe(true);
  addon.clearChat();
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(chatHas(addon, told), "and only once").toBe(false);
  const dismissed = priest(GAME_CLICKS_LUA, { savedVariables: old + ' VanguardCharDB.clickcastStamps = { menuNotice = true }' });
  expect(chatHas(dismissed, told), "not after a dismissal").toBe(false);
  expect(chatHas(priest(GAME_CLICKS_LUA), told), "not for a list that doesn't have the shape").toBe(false);
});

it("the notice comes back when its stamp is cleared and the window is opened again", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`${OLD_SHAPE} ns.Options.Show("clickcast")`);
  addon.eval('__click("Dismiss")');
  addon.eval('VanguardCharDB.clickcastStamps.menuNotice = nil ns.Options.Hide() ns.Options.Show("clickcast")');
  addon.advance(1);
  expect(addon.texts(MENU_NOTICE).length, "the page built without it is built again").toBe(1);
});

it("the notice goes when the game's own bindings come to cover the Middle click while the window is closed", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`${OLD_SHAPE} ns.Options.Show("clickcast") ns.Options.Hide()
    table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 139, button = "MiddleButton", modifiers = 0 }) ns.Options.Show("clickcast")`);
  addon.advance(1);
  expect(addon.texts(MENU_NOTICE).length, "a page built with the notice is built again without it").toBe(0);
});

it("Swap them on a notice that went out of date changes nothing and says so", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`${OLD_SHAPE} ns.Options.Show("clickcast")`);
  addon.eval('table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 139, button = "MiddleButton", modifiers = 0 })');
  addon.clearChat();
  addon.eval('__click("Swap them")');
  expect([bindings(addon).BUTTON2, bindings(addon).BUTTON3], "the bindings stay").toEqual(["spell:Flash Heal:2061:nil", "menu:nil:nil:nil"]);
  expect(chatHas(addon, /Nothing was swapped: your bindings or the game's click bindings changed since this notice\./), "and chat says why").toBe(true);
  expect(addon.texts(MENU_NOTICE).length, "the notice goes").toBe(0);
});
