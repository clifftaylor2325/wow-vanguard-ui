// plates: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, PLATE_ENV, UNITS_ENV, isTok, loggedIn, plate, setCombat, tok, unitEvents } from "./helpers.mjs";

it("a nameplate first drawn in combat gets the client's aura container after the fight", () => {
  // No plate frames built ahead, so the plate is drawn in the fight.
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + "__units.nameplate2 = nil ns.GetModule('Nameplates').POOL = 0");
  setCombat(addon, true);
  addon.eval("__units.nameplate2 = __units.party1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  // nameplate2's debuff row: on the engine, its frame kind, and its unit.
  const row = () => addon.eval("local f = __plates.nameplate2.fui return { engine = f.debuffsOnEngine, kind = f.debuffs.frame.__kind, unit = f.debuffs.unit or f.debuffs.frame.__unit }");
  expect(row(), "in combat a container can't be made, so the plate gets the fallback icons").toMatchObject({ engine: false, kind: "Frame", unit: "nameplate2" });
  addon.eval("__old = __plates.nameplate2.fui.debuffs.frame");
  setCombat(addon, false);
  expect(row(), "after the fight it gets the client's own container, on the same unit").toMatchObject({ engine: true, kind: "AuraContainer", unit: "nameplate2" });
  expect(addon.eval("return __old:IsShown()"), "and the fallback row is put away").toBe(false);
  const old = loggedIn(UNITS_ENV + PLATE_ENV + "__wfgStub.noAuraContainer = true");
  setCombat(old, true);
  old.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  setCombat(old, false);
  expect(old.eval("return __plates.nameplate2.fui.debuffsOnEngine"), "a client without the container keeps the fallback").toBe(false);
});

// TEST-ONLY plates nameplate<from>..nameplate<to>, each a hostile like the target.
const morePlates = (from, to) => `for i = ${from}, ${to} do
    local p = CreateFrame("Frame", nil, UIParent)
    p.UnitFrame, p.IsForbidden = CreateFrame("Frame", nil, p), function() return false end
    __plates["nameplate" .. i], __units["nameplate" .. i] = p, __units.target
  end`;

it("nameplate frames are built ahead at login, so a pull of 30 plates builds none", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  expect(addon.eval("return #ns.GetModule('Nameplates').pool"), "40 built ahead, two taken by the plates on screen at login").toBe(38);
  addon.eval(morePlates(4, 33));
  const before = addon.eval("return #__wfgStub.frames");
  for (let i = 4; i <= 33; i++) addon.fire("NAME_PLATE_UNIT_ADDED", `nameplate${i}`);
  expect(addon.eval("return #__wfgStub.frames") - before, "30 plates added: no new frame").toBe(0);
  const p = addon.eval(`local plate = __plates.nameplate20 local f = plate.fui local at = f.__points.CENTER
    return { f:IsVisible(), f:GetParent() == plate, at.rel == plate, f.events.__unitEvents.UNIT_HEALTH[1], #ns.GetModule('Nameplates').pool }`);
  expect(p, "each frame moved onto its plate, shown, listening for its unit").toEqual([true, true, true, "nameplate20", 8]);
  addon.eval(morePlates(34, 42));
  for (let i = 34; i <= 42; i++) addon.fire("NAME_PLATE_UNIT_ADDED", `nameplate${i}`);
  expect(addon.eval("return { #ns.GetModule('Nameplates').pool, __plates.nameplate42.fui:IsVisible() }"), "past the pool, a plate still gets a frame").toEqual([0, true]);
  expect(loggedIn(UNITS_ENV).eval("return #ns.GetModule('Nameplates').pool"), "a client without addon nameplates builds none").toBe(0);
});

it("a fallback debuff row put away after a fight is reused by the next plate drawn in one", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + "ns.GetModule('Nameplates').POOL = 0");
  addon.eval(morePlates(5, 6));
  setCombat(addon, true);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate5");
  addon.eval("__row = __plates.nameplate5.fui.debuffs");
  setCombat(addon, false);
  expect(addon.eval("return { #ns.GetModule('Nameplates').spare, __plates.nameplate5.fui.debuffsOnEngine }"), "after the fight the plate gets the engine row and the fallback row is kept").toEqual([1, true]);
  setCombat(addon, true);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate6");
  const row = addon.eval(`local f = __plates.nameplate6.fui local at = __row.frame.__points.BOTTOMLEFT
    return { f.debuffs == __row, __row.frame:GetParent() == f, at.rel == f, at.relPoint, __row.frame:IsShown(), __row.unit, #ns.GetModule('Nameplates').spare }`);
  expect(row, "the next plate drawn in a fight takes it, over its own frame, on its unit").toEqual([true, true, true, "TOPLEFT", true, "nameplate6", 0]);
});

it("nameplates", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + PLATE_ENV);
  const accent = addon.eval("return { ns.Theme.Accent() }");
  // Whether two colors have the same r, g, b.
  const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate3");
  let one = plate(addon, "nameplate1");
  expect(one.drawn && one.default === false, "our frame is drawn and the default one hidden").toBeTruthy();
  expect(one.hp?.__secret, "hidden health goes to the bar untouched").toBeTruthy();
  expect(isTok(addon, one.color, "hostile") && one.name === "TEST-ONLY Boar", "reaction color and name").toBeTruthy();
  expect(one.dot === "TEST-ONLY-DOT", "your debuffs show over the name").toBeTruthy();
  const row = addon.eval(`local c = __plates.nameplate1.fui.debuffs.frame local b = c.__groups[1].buttons[1]
    return { unit = c.__unit, timer = b.__durationText ~= nil, mouse = b.__mouse, sort = c.__groups[1].opts.sortMethod, point = c.__points.BOTTOMLEFT.relPoint }`);
  expect(row.unit === "nameplate1" && row.timer && row.mouse === false && row.point === "TOPLEFT", "a row over the plate that follows its unit, with timers, letting clicks through").toBeTruthy();
  expect(same(one.edge, accent), "your target gets an accent border (over the fill)").toBeTruthy();
  expect(addon.eval("return __plates.nameplate1.fui.glow[1]:IsShown()"), "and an accent glow around it").toBe(true);
  expect(plate(addon, "nameplate3").drawn === false && plate(addon, "nameplate3").default === true, "a plate kept from addons is left alone").toBeTruthy();
  addon.eval("__plates.nameplate1.UnitFrame:Show()");
  expect(plate(addon, "nameplate1").default === false, "the default frame stays hidden").toBeTruthy();
  addon.eval("__threat.nameplate1 = 3");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "nameplate1");
  expect(isTok(addon, plate(addon, "nameplate1").color, "threat3"), "red while you have aggro").toBeTruthy();
  addon.eval("__threat.nameplate1 = { __secret = true }");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "nameplate1");
  expect(isTok(addon, plate(addon, "nameplate1").color, "hostile"), "hidden threat: back to the reaction color").toBeTruthy();
  addon.eval("__cast.nameplate1 = true");
  addon.fire("UNIT_SPELLCAST_START", "nameplate1");
  expect(plate(addon, "nameplate1").cast === "TEST-ONLY Spell", "casts show under the plate").toBeTruthy();
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate1");
  expect(plate(addon, "nameplate1").drawn === false, "a removed plate is hidden until reused").toBeTruthy();
  addon.fire("PLAYER_ENTERING_WORLD");
  const two = plate(addon, "nameplate2");
  expect(two.drawn && two.color[0] === 1 && two.color[1] === 0.96, "after a reload, plates on screen are picked up (class color)").toBeTruthy();
  expect(!same(two.edge, accent), "only your target has the accent border").toBeTruthy();
  addon.eval('ns.Options.Show("nameplates")');
  expect(addon.eval('return __click("Threat colors while you have aggro")') && addon.eval("return ForeverUIDB.profiles.Default.Nameplates.threat") === false, "the options page works").toBeTruthy();
});

it("each nameplate asks the client for its own unit's events, once", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  expect(unitEvents(addon, "UNIT_HEALTH").subs, "health: one subscription per plate, for its unit").toBe("nameplate1 nameplate2");
  expect(unitEvents(addon, "UNIT_SPELLCAST_START"), "casts: each plate's own, beside the cast bars' units; nothing takes every unit's").toEqual({ subs: "nameplate1 nameplate2 player,target,focus", plain: 0 });
  addon.eval("__units.party1 = { name = 'TEST-ONLY Friend', hp = 120, maxhp = 500, reaction = 5 } __units.nameplate2 = __units.party1");
  addon.fire("UNIT_HEALTH", "nameplate2");
  expect(addon.eval("return __plates.nameplate2.fui:GetValue()"), "a plate's own unit event repaints it").toBe(120);
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate1");
  expect(unitEvents(addon, "UNIT_HEALTH").subs, "a removed plate stops listening").toBe("nameplate2");
  addon.eval("__plates.nameplate5, __units.nameplate5 = __plates.nameplate1, __units.target");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate5");
  expect(unitEvents(addon, "UNIT_FACTION").subs, "the client reuses a plate for another unit: it listens for that one").toBe("nameplate2 nameplate5");
});

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
  const glow = (unit) => addon.eval(`local f = __plates.${unit}.fui local px = ns.Theme.Pixel(f)
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
  const name = addon.frame("__plates.nameplate1.fui.name").font;
  expect([name.size, name.flags, addon.eval('return ns.Theme.RoleSize("world")')], "the name: outlined 11 px world text").toEqual([11, "OUTLINE", 11]);
  const cast = addon.frame("__plates.nameplate1.fui.cast").rect;
  const icon = addon.frame("__plates.nameplate1.fui.cast.icon").rect;
  const bar = addon.frame("__plates.nameplate1.fui").rect;
  expect([icon.width, icon.height, icon.left], "the cast icon: as tall as the cast bar, square, at the plate's left edge").toEqual([cast.height, cast.height, bar.left]);
  addon.slash("");
  addon.eval('__click("Nameplates")');
  addon.eval('__click("Accent border, glow and marker on your target")');
  expect(glow("nameplate1")[0], "switched off, the glow goes at once").toBe(false);
  const tall = loggedIn(UNITS_ENV + PLATE_ENV, { savedVariables: "ForeverUIDB = { profiles = { Default = { Nameplates = { height = 14 } } } }" });
  expect(tall.frame("__plates.nameplate1.fui.cast.icon").rect.height, "taller plates: a taller cast icon").toBe(14);
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
  const level = (unit) => addon.eval(`local fs = __plates.${unit}.fui.level return { fs:GetText(), fs.__textColor }`);
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
  expect(addon.eval('return __click("Levels, colored") and __plates.nameplate1.fui.level:GetText()'), "switched off, the levels clear at once").toBe("");
});

it("NP.RefreshAll repaints every plate on screen from the settings as they are now", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + LEVELS_ENV);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  // Both plates' level texts.
  const levels = () => addon.eval("return { __plates.nameplate1.fui.level:GetText(), __plates.nameplate2.fui.level:GetText() }");
  expect(levels(), "levels on").toEqual(["12", "14"]);
  addon.eval("ns.Settings('Nameplates').level = false");
  expect(levels(), "a setting written alone repaints nothing").toEqual(["12", "14"]);
  addon.eval("ns.GetModule('Nameplates').RefreshAll()");
  expect(levels(), "RefreshAll clears both").toEqual(["", ""]);
  addon.eval("ns.Settings('Nameplates').level = true ns.GetModule('Nameplates').RefreshAll()");
  expect(levels(), "and paints them back").toEqual(["12", "14"]);
});
