// Portraits on the player, target and focus frames (Modules/UnitPortrait.lua) and the focus target frame
// (Modules/UnitFrames.lua): docs/features/unit-frames.md. Real Lua in the headless client.
import { expect, it } from "vitest";
import { CLICK_LUA, NO_RAID, UNITS_ENV, loggedIn, setCombat } from "./helpers.mjs";

// Hairline gives the unit frames square outer ends, so a portrait has room; the settings turn two on.
const ROOM = (extra = "") => ({ savedVariables: `VanguardDB.profiles.Default = { modules = { RaidFrames = false }, theme = { hudLook = "hairline" }, UnitFrames = { playerPortrait = "class", targetPortrait = "portrait" ${extra} } }` });

// What a frame's portrait and bars do (TEST-ONLY reads): shown, its texture, its square, where it sits, and the
// health bar's left and right insets from the frame.
const READ = (key) => `local f = Vanguard_${key}
  local p = f.portrait
  local hl, hr = (f.health:GetLeft() or 0) - (f:GetLeft() or 0), (f:GetRight() or 0) - (f.health:GetRight() or 0)
  return { p ~= nil and p:IsShown() and "shown" or "hidden", p and p.__texture or "none", p and p:GetWidth() or 0, p and p.__texCoord and p.__texCoord[1] or 0, math.floor(hl * 100 + 0.5) / 100, math.floor(hr * 100 + 0.5) / 100 }`;
// The portrait and bar reads of a frame.
const read = (addon, key) => addon.eval(READ(key));

it("a square-ended look gives the portrait its room: the class icon for a player, the portrait for a creature, the bars stepping in", () => {
  const addon = loggedIn(UNITS_ENV, ROOM());
  const [playerShown, playerTexture, side, left, playerLeft, playerRight] = read(addon, "player");
  expect([playerShown, playerTexture, left], "the player shows its class icon (the mage's square on the sheet)").toEqual(["shown", "Interface\\TargetingFrame\\UI-Classes-Circles", 0.25]);
  expect(side > 20 && side < 36, "a square a little under the frame's height").toBe(true);
  expect([playerLeft > side, playerRight < side], "the bars start past it at the outer (left) end only").toEqual([true, true]);
  const [targetShown, targetTexture, , , targetLeft, targetRight] = read(addon, "target");
  expect([targetShown, targetTexture, targetLeft < targetRight], "the creature shows its portrait, and the target's room is at its right").toEqual(["shown", "TEST-ONLY-PORTRAIT", true]);
  expect(read(addon, "focus")[0], "the focus frame is off: its portrait never shows").toBe("hidden");
});

it("a class icon falls back to the portrait for a creature or a hidden class, and a missing portrait call draws nothing wrong", () => {
  const addon = loggedIn(UNITS_ENV, { savedVariables: ROOM().savedVariables.replace('targetPortrait = "portrait"', 'targetPortrait = "class"') });
  expect(read(addon, "target")[1], "a creature has no class icon").toBe("TEST-ONLY-PORTRAIT");
  addon.eval('__units.target = { name = "TEST-ONLY Friend", hp = 1, maxhp = 2, power = 0, maxpower = 0, ptype = "MANA", player = true, class = { __secret = true } }');
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(read(addon, "target")[1], "a hidden class too").toBe("TEST-ONLY-PORTRAIT");
  addon.eval('__units.target.class = "ROGUE"');
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(read(addon, "target")[1], "a player with a class shows its icon").toBe("Interface\\TargetingFrame\\UI-Classes-Circles");
  addon.eval("SetPortraitTexture = nil CLASS_ICON_TCOORDS = nil");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(read(addon, "target")[0], "a client without either call shows the frame without an error").toBe("shown");
});

it("Shield points the outer end: the portrait is hidden and the bars keep their plain room; the row's tip says so", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA, { savedVariables: ROOM().savedVariables.replace('theme = { hudLook = "hairline" }', 'theme = { hudLook = "shield" }') });
  const plain = addon.eval("return math.floor(((Vanguard_player.health:GetLeft() or 0) - (Vanguard_player:GetLeft() or 0)) * 100 + 0.5) / 100");
  expect([read(addon, "player")[0], read(addon, "player")[4] === plain, addon.eval("return ns.GetModule('UnitFrames').Portrait.Room(Vanguard_player)")], "no portrait, and the bars keep their plain room").toEqual(["hidden", true, 0]);
  const tip = addon.eval('for _, page in ipairs(ns.Options.PAGES) do for _, row in ipairs(ns.Options.RowsOf(page)) do if row[2] == "Player portrait" then return row.tip end end end');
  expect(tip, "the tip names the looks that leave no room").toMatch(/Shield look/);
});

it("the portrait rows apply without a reload and follow the HUD look", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA, NO_RAID);
  addon.slash("");
  addon.eval('__click("Unit frames") __click("Player portrait")');
  expect(addon.eval("return ns.GetModule('UnitFrames').settings.playerPortrait"), "the cycle row picks the 2D portrait").toBe("portrait");
  expect(addon.eval("return Vanguard_Options.reload:IsShown()"), "with no reload").toBe(false);
  expect(addon.eval("return Vanguard_player.portrait:IsShown()"), "under the default Shield look there is no room").toBe(false);
  addon.eval('__click("General") __click("HUD look") __click("Unit frames")');
  expect([addon.eval("return ns.Theme.HudLook()"), addon.eval("return Vanguard_player.portrait:IsShown()")], "Hairline's square end gives it room at once").toEqual(["hairline", true]);
  addon.eval('__click("General") __click("HUD look") __click("HUD look") __click("HUD look")');
  expect([addon.eval("return ns.Theme.HudLook()"), addon.eval("return Vanguard_player.portrait:IsShown()")], "Plain's cut corners take it back").toEqual(["plain", false]);
});

it("a portrait choice waits for the fight's end", () => {
  const addon = loggedIn(UNITS_ENV, ROOM());
  setCombat(addon, true);
  addon.eval('local UF = ns.GetModule("UnitFrames") UF.settings.playerPortrait = "off" UF.ApplyPortraits()');
  expect(addon.eval("return Vanguard_player.portrait:IsShown()"), "in a fight nothing is laid out").toBe(true);
  setCombat(addon, false);
  expect(addon.eval("return Vanguard_player.portrait:IsShown()"), "when it ends the portrait goes and the bars take the room back").toBe(false);
});

it("a portrait follows its unit: the target's changes and a gone focus hides it", () => {
  const addon = loggedIn(UNITS_ENV, ROOM(', focusPortrait = "portrait"'));
  expect(read(addon, "focus")[0], "no focus, no portrait").toBe("hidden");
  addon.eval('__units.focus = { name = "TEST-ONLY Focus", hp = 1, maxhp = 2, power = 0, maxpower = 0, ptype = "MANA" }');
  addon.fire("PLAYER_FOCUS_CHANGED");
  expect(read(addon, "focus")[0], "a focus shows it").toBe("shown");
  addon.eval("Vanguard_focus.portrait.__texture = nil");
  addon.fire("UNIT_PORTRAIT_UPDATE", "focus");
  expect(read(addon, "focus")[1], "the client's portrait event repaints it").toBe("TEST-ONLY-PORTRAIT");
  expect(addon.eval("return Vanguard_party1.portrait == nil and ns.GetModule('UnitFrames').Portrait.Room(Vanguard_party1)"), "a frame that carries none has none").toBe(0);
});

it("the focus target frame: its own mover and sliders, shown by the unit watch, its target polled", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA, NO_RAID);
  expect(addon.eval("return { Vanguard_focustarget.__watched, Vanguard_focustarget.vgWidth, Vanguard_focustarget.vgHeight }"), "a unit watch shows it, at its default size").toEqual([true, 80, 24]);
  expect(addon.eval("return ns.MoverFrame('uf_focustarget') == Vanguard_focustarget"), "its own mover").toBe(true);
  addon.eval('__units.focustarget = { guid = "TEST-ONLY-F", name = "TEST-ONLY FT", hp = 1, maxhp = 2, power = 0, maxpower = 0, ptype = "MANA" }');
  addon.advance(1);
  expect(addon.eval("return Vanguard_focustarget.name:GetText()"), "its name follows the focus's target on the timer").toBe("TEST-ONLY FT");
  addon.slash("");
  addon.eval('__click("Unit frames") __click("Focus target: width")');
  expect(addon.eval("return ns.GetModule('UnitFrames').FrameSize('focustarget')"), "the sliders size it").toBeTypeOf("number");
  expect(addon.eval("local UF = ns.GetModule('UnitFrames') UF.settings.focustargetWidth = 140 UF.ApplySizes() return Vanguard_focustarget:GetWidth()"), "a width applies at once")
    .toBeCloseTo(140, 0);
  expect(addon.eval("return ns.GetModule('UnitFrames').CALM_KEYS[6]"), "and it dims with the Calm HUD's frames").toBe("focustarget");
});
