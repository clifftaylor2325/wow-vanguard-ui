// platepaint: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { CLICK_LUA, PLATE_ENV, UNITS_ENV, expectErrors, isTok, loggedIn, plate, tok } from "./helpers.mjs";

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
it("a plate the client hands over at a tiny scale gets its one-pixel border back once the plate grows", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  // The plate's edges' thickness in screen pixels at its scale now (the thickest of the four).
  const edge = (unit) => addon.eval(`local f = ns.FrameState('vgPlate')[__plates.${unit}] local most = 0
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == f and w.__layer == "OVERLAY" and w.__sublevel == 7 then most = math.max(most, math.min(w:GetWidth(), w:GetHeight())) end
    end
    return most / ns.Theme.Pixel(f)`);
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate2");
  addon.eval("__plates.nameplate2:SetScale(0.01)");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  addon.eval("__plates.nameplate2:SetScale(1)");
  expect(edge("nameplate2"), "painted at scale 0.01: some 100 pixels thick at scale 1, a dark box").toBeGreaterThan(50);
  addon.advance(0.5);
  expect(Math.round(edge("nameplate2") * 1000) / 1000, "the scale check paints it again: one pixel").toBe(1);
});

it("a debuff icon the client makes while it has the plate shrunk gets its one-pixel inset and edge back once the plate grows", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + "ns.GetModule('Nameplates').POOL = 0");
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate1");
  addon.eval(`local p = CreateFrame("Frame", nil, UIParent) p:SetSize(110, 45) p:SetPoint("CENTER")
    p.UnitFrame = CreateFrame("Frame", nil, p) p.IsForbidden = function() return false end
    __plates.nameplate1 = p p:SetScale(0.01)`);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.eval("__plates.nameplate1:SetScale(1)");
  // The first debuff icon's inset (its icon from the button's edge) and the thinnest strip of its type
  // edge, in screen pixels at the plate's scale now.
  const sizes = () => addon.eval(`local b = ns.FrameState('vgPlate')[__plates.nameplate1].debuffs.frame.__groups[1].buttons[1]
    local px, thinnest = ns.Theme.Pixel(b), math.huge
    for _, w in ipairs(__wfgStub.frames) do
      local holder = w.__parent
      if holder and holder.__parent == b and w.__layer == "OVERLAY" and w.__sublevel == 7 and w.__texture == ns.Theme.WHITE then
        thinnest = math.min(thinnest, w:GetWidth(), w:GetHeight())
      end
    end
    return { math.floor(b.__icon.__points.TOPLEFT.x / px * 1000 + 0.5) / 1000, math.floor(thinnest / px * 1000 + 0.5) / 1000 }`);
  const [inset, edge] = sizes();
  expect([inset > 50, edge > 20], "made at scale 0.01: the icon pushed in and the type edge grown into a dark square").toEqual([true, true]);
  addon.advance(0.5);
  expect(sizes(), "the scale check places them again: one pixel").toEqual([1, 1]);
  addon.eval("__plates.nameplate1:SetScale(1.1)");
  addon.advance(0.5);
  expect(sizes(), "a drift under NP.SCALE_SLACK leaves them as placed (1.1 of the new, smaller pixel)").toEqual([1.1, 1.1]);
});

// The plate grown to scale 1, its first debuff icon's texture refusing addons as a forbidden object does.
const GROWN_PLATE = `__plates.nameplate1:SetScale(1)
  __debuffs = ns.FrameState('vgPlate')[__plates.nameplate1].debuffs.frame
  __icon = __debuffs.__groups[1].buttons[1].__icon
  -- TEST-ONLY: the client's refusal of a forbidden object, counted.
  __touches = 0 __icon.ClearAllPoints = function() __touches = __touches + 1 error("Attempt to access forbidden object from code tainted by an AddOn") end`;
// A login with one plate whose debuff icons the client made while it had the plate shrunk to 0.01, then grew.
const shrunkPlate = () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + "ns.GetModule('Nameplates').POOL = 0");
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate1");
  addon.eval(`local p = CreateFrame("Frame", nil, UIParent) p:SetSize(110, 45) p:SetPoint("CENTER")
    p.UnitFrame = CreateFrame("Frame", nil, p) p.IsForbidden = function() return false end
    __plates.nameplate1 = p p:SetScale(0.01)`);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.eval(GROWN_PLATE);
  return addon;
};
// The kept errors: how many, and how often the first was reported (0 with none).
const kept = (addon) => addon.eval("return { #ns.errors, ns.errors[1] and ns.errors[1].count or 0 }");

it("an aura icon the client has closed to addons is left alone by the plate scale check", () => {
  const addon = shrunkPlate();
  addon.eval("__icon.IsForbidden = function() return true end");
  addon.advance(2);
  expect([addon.eval("return __touches"), kept(addon)], "a forbidden icon: never touched, nothing reported").toEqual([0, [0, 0]]);
});

it("a theme refresh leaves the aura icon parts the client has closed alone, forgets them and still tells the listeners", () => {
  const addon = shrunkPlate();
  addon.eval(`local button = __debuffs.__groups[1].buttons[1]
    __bar = CreateFrame("StatusBar", nil, UIParent) ns.Theme.BarColor(__bar, "accent")
    -- TEST-ONLY: every method but IsForbidden refuses, as the client does on a forbidden object.
    local function close(w)
      for name in pairs(__wfgWidgetApi.methods[w:GetObjectType()]) do w[name] = function() __touches = __touches + 1 error("Attempt to access forbidden object from code tainted by an AddOn") end end
      w.IsForbidden = function() __asked = __asked + 1 return true end
    end
    -- TEST-ONLY: whether w sits under the aura button.
    local function under(w) local p = w.__parent while p do if p == button then return true end p = p.__parent end end
    for _, w in ipairs(__wfgStub.frames) do if under(w) then close(w) end end
    close(__bar)
    __asked, __listened = 0, 0 ns.Theme.OnChanged(function() __listened = __listened + 1 end)`);
  // One theme refresh: whether it ran to the end, the refused calls, the listener runs, and whether a closed part was asked.
  const refresh = () => addon.eval("__asked = 0 local ok = pcall(ns.Theme.Refresh) return { ok, __touches, __listened, __asked > 0 }");
  expect(refresh(), "the icon, its edge, its text, its badge and a closed bar: untouched, the listeners told").toEqual([true, 0, 1, true]);
  expect(refresh(), "forgotten: a second refresh asks them nothing").toEqual([true, 0, 2, false]);
  expect(kept(addon), "nothing reported").toEqual([0, 0]);
});

it("a plate's aura holder the client has closed is not asked its scale", () => {
  const addon = shrunkPlate();
  addon.eval("__debuffs.IsForbidden = function() return true end");
  addon.advance(2);
  expect([addon.eval("return __touches"), kept(addon)], "a forbidden holder: no icon touched, nothing reported").toEqual([0, [0, 0]]);
});

it("an aura icon that fails to place is reported once and not tried again every scale check", () => {
  expectErrors("aura icon pixels: eval:6: Attempt to access forbidden object from code tainted by an AddOn");
  const addon = shrunkPlate();
  addon.advance(2);
  expect([addon.eval("return __touches"), kept(addon)], "four checks, one try, one report").toEqual([1, [1, 1]]);
});

it("a plate's border is not painted again while its scale drifts less than NP.SCALE_SLACK", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + `__borders = 0
    local setBorder = ns.Theme.SetBorder
    -- TEST-ONLY spy: counts border repaints of nameplates (the frames with a target marker).
    ns.Theme.SetBorder = function(f, rgb) if f.marker then __borders = __borders + 1 end return setBorder(f, rgb) end`);
  // How many times a plate border has been painted.
  const borders = () => addon.eval("return __borders");
  addon.eval("__plates.nameplate2:SetScale(1.1)");
  addon.advance(1);
  expect(borders(), "10 % off: the two borders painted at login stand").toBe(2);
  addon.eval("__plates.nameplate2:SetScale(0.8)");
  addon.advance(0.5);
  expect(borders(), "20 % smaller than painted: that plate's border is painted again").toBe(3);
});

it("a hidden or unknown scale counts as holding, and a plate never painted as not", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  // NP.ScaleHolds on two Lua values.
  const holds = (scale, painted) => addon.eval(`return ns.GetModule('Nameplates').ScaleHolds(${scale}, ${painted})`);
  expect([holds("{ __secret = true }", 1), holds(1, "nil"), holds(1, 0), holds(1, 1)]).toEqual([true, false, false, true]);
});

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

// A plate's soft-target icon: shown, and its art (false when not drawn).
const softIcon = (addon, unit) => addon.eval(`local f = ns.FrameState('vgPlate')[__plates.${unit}] return { f.soft:IsShown(), f.soft:IsShown() and f.soft.__texture or false }`);
// The game's soft-target update over every plate, as its driver runs it (size, enemy, friend, interact icons).
const softUpdate = (addon, args = "32, true, false, true") => addon.eval(`for _, p in pairs(__plates) do NamePlateDriverFrame:UpdateSoftTargetIconInternal(p, ${args}) end`);

it("the game's soft-target icon shows above Vanguard's plate of a soft enemy, in the client's art (H22-2-1)", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  addon.eval("__units.target.cursorIcon = 'TEST-ONLY-SWORD' __units.softenemy = __units.target");
  softUpdate(addon);
  expect(softIcon(addon, "nameplate1"), "the soft enemy's plate: the client's icon for it").toEqual([true, "TEST-ONLY-SWORD"]);
  expect(softIcon(addon, "nameplate2")[0], "another plate: none").toBe(false);
  expect(addon.eval("return { __cursorArgs.n, __cursorArgs[3] }"), "Forever's plates ask for the gamepad icon, as the game's own do").toEqual([3, true]);
  const f = addon.frame("ns.FrameState('vgPlate')[__plates.nameplate1]").rect;
  const icon = addon.frame("ns.FrameState('vgPlate')[__plates.nameplate1].soft").rect;
  expect([icon.width, icon.bottom - (f.bottom + f.height)], "24 square, clear above the debuff row").toEqual([24, 36]);
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  expect(softIcon(addon, "nameplate1")[0], "a plate drawn again while it is the soft enemy gets the icon from the game's last switches").toBe(true);
});

it("the soft-target icon goes when the unit stops being a soft target or the game's icons are off (H22-2-1)", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  addon.eval("__units.party1.cursorIcon = 'TEST-ONLY-BUBBLE' __units.softinteract = __units.party1");
  softUpdate(addon);
  expect(softIcon(addon, "nameplate2"), "a friend you can talk to: the speech bubble").toEqual([true, "TEST-ONLY-BUBBLE"]);
  softUpdate(addon, "32, true, false, false");
  expect(softIcon(addon, "nameplate2")[0], "the game's interact icon switched off: gone").toBe(false);
  softUpdate(addon);
  addon.eval("__units.softinteract = nil");
  softUpdate(addon);
  expect(softIcon(addon, "nameplate2")[0], "no longer the soft target: gone").toBe(false);
  addon.eval("__units.softinteract = __units.party1");
  softUpdate(addon, "0, true, true, true");
  expect(softIcon(addon, "nameplate2")[0], "an icon size of 0 turns them all off").toBe(false);
  addon.eval("__units.party1.cursorIcon = nil");
  softUpdate(addon);
  expect(softIcon(addon, "nameplate2")[0], "the client has no icon for the unit: none").toBe(false);
});

it("a unit the client shows only a widget for keeps the game's plate, and its frame is hidden again on a normal unit (H22-2-1)", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate2");
  addon.eval("__units.nameplate2 = { name = 'TEST-ONLY Herald', hp = 100, maxhp = 100, power = 0, maxpower = 0, ptype = 'MANA', widgetsOnly = true }");
  addon.eval("__plates.nameplate2.UnitFrame:Show()");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  expect(plate(addon, "nameplate2"), "the game's frame shows (with its widget), Vanguard's plate does not").toMatchObject({ drawn: false, default: true });
  expect(addon.eval("return ns.GetModule('Nameplates').plates.nameplate2 == nil"), "and Vanguard does not count it as drawn").toBe(true);
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate2");
  addon.eval("__units.nameplate2 = __units.party1 __plates.nameplate2.UnitFrame:Hide() __plates.nameplate2.UnitFrame:Show()");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  expect(plate(addon, "nameplate2"), "the same frame on a normal unit: Vanguard's plate, the game's hidden").toMatchObject({ drawn: true, default: false });
  addon.eval("__plates.nameplate2.UnitFrame:Show()");
  expect(plate(addon, "nameplate2").default, "and kept hidden while Vanguard owns it").toBe(false);
});

it("a frame the game moves to a plate it keeps is not hidden by the hook Vanguard left on it (H22-2-1)", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  addon.eval("__moved = __plates.nameplate1.UnitFrame");
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate1");
  addon.eval("__moved:Show()");
  expect(addon.eval("return __moved:IsShown()"), "let go when its plate's unit went: the game may show it elsewhere").toBe(true);
});

it("the soft-target hook skips plates Vanguard leaves alone, and Retail's plates ask for the plain icon (H22-2-1)", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  addon.eval("__units.party1.cursorIcon = 'TEST-ONLY-BUBBLE' __units.softfriend = __units.party1 __cursorArgs = nil");
  softUpdate(addon, "32, false, true, false");
  expect(addon.eval("return ns.FrameState('vgPlate')[__plates.nameplate3] == nil and __cursorArgs.n"), "the forbidden plate is not dressed or asked; the friend's is").toBe(3);
  const retail = loggedIn(UNITS_ENV + PLATE_ENV, { client: RETAIL_CLIENT });
  retail.eval("__units.party1.cursorIcon = 'TEST-ONLY-BUBBLE' __units.softfriend = __units.party1");
  softUpdate(retail, "32, false, true, false");
  expect([softIcon(retail, "nameplate2")[0], retail.eval("return __cursorArgs.n")], "Retail: the icon, with no gamepad preference").toEqual([true, 0]);
});

it("H27-3-1: a plate's level keeps its difficulty colour through a look and text-size change", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + PLATE_ENV + LEVELS_ENV);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.slash("variant classic");
  addon.eval("ns.Theme.Settings().textScale = 1.1 ns.Theme.Refresh()");
  expect(addon.eval("return ns.FrameState('vgPlate')[__plates.nameplate1].level.__textColor"), "the boar's level stays yellow").toEqual([1, 0.82, 0, 1]);
});

it("H28-4-2: a colour variant repaints every plate's bar colour at once, with no unit event", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  const before = plate(addon, "nameplate1").color;
  addon.slash("variant contrast"); // High contrast turns Safer colours on: the hostile red moves to vermilion
  const after = plate(addon, "nameplate1").color;
  expect([isTok(addon, after, "hostile"), after.join() === before.join()], "the bar takes the new reaction colour").toEqual([true, false]);
});

it("H28-I: your focus's plate gets a quieter border and diamond, no glow; your target's wins", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  // A plate's marker: shown, its tint; and whether its glow shows.
  const marks = (unit) => addon.eval(`local f = ns.FrameState('vgPlate')[__plates.${unit}] return { f.marker:IsShown(), f.marker.__vertexColor or false, f.glow[1]:IsShown() }`);
  addon.eval("__units.focus = __units.party1");
  addon.fire("PLAYER_FOCUS_CHANGED");
  const focus = marks("nameplate2");
  expect([focus[0], isTok(addon, focus[1], "text2"), focus[2], isTok(addon, plate(addon, "nameplate2").edge, "text2")], "the focus plate: a text2 diamond and border, no glow").toEqual([true, true, false, true]);
  addon.eval("__units.focus = __units.target");
  addon.fire("PLAYER_FOCUS_CHANGED");
  expect([marks("nameplate2")[0], isTok(addon, marks("nameplate1")[1], "accent"), marks("nameplate1")[2]], "focus on your target: the target's look; the old focus plate is plain again").toEqual([false, true, true]);
});
