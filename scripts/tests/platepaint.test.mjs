// platepaint: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, PLATE_ENV, UNITS_ENV, isTok, loggedIn, plate, tok } from "./helpers.mjs";

it("nameplates repaint only what an event changed, and the border only when the target or the scale does", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + `__borders = 0
    local setBorder = ns.Theme.SetBorder
    -- TEST-ONLY spy: counts border repaints of nameplates (the frames with a target marker).
    ns.Theme.SetBorder = function(f, rgb) if f.marker then __borders = __borders + 1 end return setBorder(f, rgb) end`);
  // How many times a plate border has been painted.
  const borders = () => addon.eval("return __borders");
  expect(borders(), "the two plates on screen at login paint their borders once each").toBe(2);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  expect(borders(), "the client hands the same plate again: its border is already right").toBe(2);
  addon.eval("__units.target.hp, __units.target.maxhp, __units.target.name = 300, 800, 'TEST-ONLY Renamed'");
  for (let i = 0; i < 10; i++) addon.fire("UNIT_HEALTH", "nameplate1");
  let one = plate(addon, "nameplate1");
  expect([borders(), one.hp, one.name], "10 health events: the fill moves, no border repaint, the name is left alone").toEqual([2, 300, "TEST-ONLY Boar"]);
  addon.fire("UNIT_NAME_UPDATE", "nameplate1");
  expect(plate(addon, "nameplate1").name, "a name event repaints the name").toBe("TEST-ONLY Renamed");
  addon.eval("__threat.nameplate1 = 2");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "nameplate1");
  expect([isTok(addon, plate(addon, "nameplate1").color, "threat2"), borders()], "threat recolors the bar only").toEqual([true, 2]);
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(borders(), "the same target again: nothing to repaint").toBe(2);
  addon.eval("__units.target = __units.party1");
  addon.fire("PLAYER_TARGET_CHANGED");
  const accent = addon.eval("return { ns.Theme.Accent() }");
  one = plate(addon, "nameplate1");
  const two = plate(addon, "nameplate2");
  expect([borders(), isTok(addon, one.edge, "accent"), two.edge.slice(0, 3)], "a new target: both plates whose state flipped repaint").toEqual([4, false, accent.slice(0, 3)]);
  addon.eval("__plates.nameplate2:SetScale(1.4)");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(borders(), "a plate whose scale changed repaints its edge at the new pixel size").toBe(5);
  addon.eval("ns.Theme.SetAccent(0.1, 0.9, 0.2)");
  expect(plate(addon, "nameplate2").edge.slice(0, 3), "a new accent repaints your target's border").toEqual([0.1, 0.9, 0.2]);
});
it("your target's plate glows 2 px in the accent, names are outlined world text, the cast icon is as tall as its bar", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + PLATE_ENV);
  // A plate's glow: shown, its tint, and its left and top sides' widths in screen pixels.
  const glow = (unit) => addon.eval(`local f = ns.FrameState('vgPlate')[__plates.${unit}] local px = ns.Theme.Pixel(f)
    return { f.glow[1]:IsShown(), f.glow[5].__vertexColor or false, f.glow[7]:GetWidth() / px, f.glow[5]:GetHeight() / px }`);
  const [shown, tint, left, top] = glow("nameplate1");
  expect([shown, tint], "your target's plate: a glow in the accent").toEqual([true, tok(addon, "accent")]);
  expect([left, top].map((n) => Math.round(n * 1000) / 1000), "2 screen pixels wide").toEqual([2, 2]);
  expect(glow("nameplate2")[0], "another plate: no glow").toBe(false);
  addon.eval("__plates.nameplate1:SetScale(1.5)");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(Math.round(glow("nameplate1")[2] * 1000) / 1000, "a plate drawn at another scale keeps a 2 px glow").toBe(2);
  addon.eval("ns.Theme.SetAccent(0.1, 0.9, 0.2)");
  expect(glow("nameplate1")[1], "the glow follows a new accent").toEqual([0.1, 0.9, 0.2, 1]);
  const name = addon.frame("ns.FrameState('vgPlate')[__plates.nameplate1].name").font;
  expect([name.size, name.flags, addon.eval('return ns.Theme.RoleSize("world")')], "the name: outlined 11 px world text").toEqual([11, "OUTLINE", 11]);
  const cast = addon.frame("ns.FrameState('vgPlate')[__plates.nameplate1].cast").rect;
  const icon = addon.frame("ns.FrameState('vgPlate')[__plates.nameplate1].cast.icon").rect;
  const bar = addon.frame("ns.FrameState('vgPlate')[__plates.nameplate1]").rect;
  expect([icon.width, icon.height, icon.left], "the cast icon: as tall as the cast bar, square, at the plate's left edge").toEqual([cast.height, cast.height, bar.left]);
  addon.slash("");
  addon.eval('__click("Nameplates")');
  addon.eval('__click("Accent border, glow and marker on your target")');
  expect(glow("nameplate1")[0], "switched off, the glow goes at once").toBe(false);
  const tall = loggedIn(UNITS_ENV + PLATE_ENV, { savedVariables: "VanguardDB = { profiles = { Default = { Nameplates = { height = 14 } } } }" });
  expect(tall.frame("ns.FrameState('vgPlate')[__plates.nameplate1].cast.icon").rect.height, "taller plates: a taller cast icon").toBe(14);
});
// TEST-ONLY levels: the boar is level 12 (a yellow, even fight), the friend 14 (no color from the client).
const LEVELS_ENV = `
  UnitLevel = function(unit) return ({ target = 12, nameplate1 = 12, party1 = 14, nameplate2 = 14 })[unit] or 10 end
  GetCreatureDifficultyColor = function(level) if level == 12 then return { r = 1, g = 0.82, b = 0 } end end
`;
it("nameplates show levels in the difficulty color", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + PLATE_ENV + LEVELS_ENV);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  // A plate's level text and its color.
  const level = (unit) => addon.eval(`local fs = ns.FrameState('vgPlate')[__plates.${unit}].level return { fs:GetText(), fs.__textColor }`);
  expect(level("nameplate1"), "the boar's level, in the client's difficulty color, left of its name").toEqual(["12", [1, 0.82, 0, 1]]);
  expect(level("nameplate2")[0], "a level the client gives no color for still shows").toBe("14");
  expect(level("nameplate2")[1], "in the secondary text color").toEqual(tok(addon, "text2"));
  addon.eval("__units.party1.level = nil UnitLevel = function(unit) return unit == 'nameplate2' and 15 or 12 end");
  addon.fire("UNIT_LEVEL", "nameplate2");
  expect(level("nameplate2")[0], "a unit that levels shows its new level").toBe("15");
  addon.eval("UnitLevel = function() return 13 end");
  addon.fire("PLAYER_LEVEL_UP", 61);
  expect(level("nameplate1")[0], "your own level up repaints every plate").toBe("13");
  addon.slash("");
  addon.eval('__click("Nameplates")');
  expect(addon.eval('return __click("Levels, colored") and ns.FrameState("vgPlate")[__plates.nameplate1].level:GetText()'), "switched off, the levels clear at once").toBe("");
});
it("NP.RefreshAll repaints every plate on screen from the settings as they are now", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + LEVELS_ENV);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  // Both plates' level texts.
  const levels = () => addon.eval("return { ns.FrameState('vgPlate')[__plates.nameplate1].level:GetText(), ns.FrameState('vgPlate')[__plates.nameplate2].level:GetText() }");
  expect(levels(), "levels on").toEqual(["12", "14"]);
  addon.eval("ns.Settings('Nameplates').level = false");
  expect(levels(), "a setting written alone repaints nothing").toEqual(["12", "14"]);
  addon.eval("ns.GetModule('Nameplates').RefreshAll()");
  expect(levels(), "RefreshAll clears both").toEqual(["", ""]);
  addon.eval("ns.Settings('Nameplates').level = true ns.GetModule('Nameplates').RefreshAll()");
  expect(levels(), "and paints them back").toEqual(["12", "14"]);
});
