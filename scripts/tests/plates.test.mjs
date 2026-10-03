// plates: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, PLATE_ENV, UNITS_ENV, isTok, loggedIn, plate, setCombat, tok } from "./helpers.mjs";

it("a nameplate first drawn in combat gets the client's aura container after the fight", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + "__units.nameplate2 = nil");
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
  expect(addon.eval(`local f = __plates.nameplate1.fui
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == f and type(w.__texture) == "string" and w.__texture:find("Glow$") then return true end end
    return f.glow ~= nil`), "and no glow: the border is enough").toBe(false);
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
