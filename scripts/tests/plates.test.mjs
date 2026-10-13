// plates: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { AURA_FALLBACK, CLICK_LUA, PLATE_ENV, UNITS_ENV, expectErrors, isTok, loggedIn, plate, setCombat, unitEvents } from "./helpers.mjs";

it("a nameplate first drawn in combat gets the client's aura container after the fight", () => {
  // The client built last (noAuraContainer) has no AuraContainer: its probe leaves the D-06 notice.
  expectErrors(AURA_FALLBACK);
  // No plate frames built ahead, so the plate is drawn in the fight.
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + "__units.nameplate2 = nil ns.GetModule('Nameplates').POOL = 0");
  setCombat(addon, true);
  addon.eval("__units.nameplate2 = __units.party1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  // nameplate2's debuff row: on the engine, its frame kind, and its unit.
  const row = () => addon.eval("local f = ns.FrameState('vgPlate')[__plates.nameplate2] return { engine = f.debuffsOnEngine, kind = f.debuffs.frame.__kind, unit = f.debuffs.unit or f.debuffs.frame.__unit }");
  expect(row(), "in combat a container can't be made, so the plate gets the fallback icons").toMatchObject({ engine: false, kind: "Frame", unit: "nameplate2" });
  addon.eval("__old = ns.FrameState('vgPlate')[__plates.nameplate2].debuffs.frame");
  setCombat(addon, false);
  expect(row(), "after the fight it gets the client's own container, on the same unit").toMatchObject({ engine: true, kind: "AuraContainer", unit: "nameplate2" });
  expect(addon.eval("return __old:IsShown()"), "and the fallback row is put away").toBe(false);
  const old = loggedIn(UNITS_ENV + PLATE_ENV + "__wfgStub.noAuraContainer = true");
  setCombat(old, true);
  old.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  setCombat(old, false);
  expect(old.eval("return ns.FrameState('vgPlate')[__plates.nameplate2].debuffsOnEngine"), "a client without the container keeps the fallback").toBe(false);
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
  const p = addon.eval(`local plate = __plates.nameplate20 local f = ns.FrameState('vgPlate')[plate] local at = f.__points.CENTER
    return { f:IsVisible(), f:GetParent() == plate, at.rel == plate, f.events.__unitEvents.UNIT_HEALTH[1], #ns.GetModule('Nameplates').pool }`);
  expect(p, "each frame moved onto its plate, shown, listening for its unit").toEqual([true, true, true, "nameplate20", 8]);
  addon.eval(morePlates(34, 42));
  for (let i = 34; i <= 42; i++) addon.fire("NAME_PLATE_UNIT_ADDED", `nameplate${i}`);
  expect(addon.eval("return { #ns.GetModule('Nameplates').pool, ns.FrameState('vgPlate')[__plates.nameplate42]:IsVisible() }"), "past the pool, a plate still gets a frame").toEqual([0, true]);
  expect(loggedIn(UNITS_ENV).eval("return #ns.GetModule('Nameplates').pool"), "a client without addon nameplates builds none").toBe(0);
});
it("a fallback debuff row put away after a fight is reused by the next plate drawn in one", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + "ns.GetModule('Nameplates').POOL = 0");
  addon.eval(morePlates(5, 6));
  setCombat(addon, true);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate5");
  addon.eval("__row = ns.FrameState('vgPlate')[__plates.nameplate5].debuffs");
  setCombat(addon, false);
  expect(addon.eval("return { #ns.GetModule('Nameplates').spare.debuffs, ns.FrameState('vgPlate')[__plates.nameplate5].debuffsOnEngine }"), "after the fight the plate gets the engine row and the fallback row is kept").toEqual([1, true]);
  setCombat(addon, true);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate6");
  const row = addon.eval(`local f = ns.FrameState('vgPlate')[__plates.nameplate6] local at = __row.frame.__points.BOTTOMLEFT
    return { f.debuffs == __row, __row.frame:GetParent() == f, at.rel == f, at.relPoint, __row.frame:IsShown(), __row.unit, #ns.GetModule('Nameplates').spare.debuffs }`);
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
  const row = addon.eval(`local c = ns.FrameState('vgPlate')[__plates.nameplate1].debuffs.frame local b = c.__groups[1].buttons[1]
    return { unit = c.__unit, timer = b.__durationText ~= nil, mouse = b.__mouse, sort = c.__groups[1].opts.sortMethod, point = c.__points.BOTTOMLEFT.relPoint }`);
  expect(row.unit === "nameplate1" && row.timer && row.mouse === false && row.point === "TOPLEFT", "a row over the plate that follows its unit, with timers, letting clicks through").toBeTruthy();
  expect(same(one.edge, accent), "your target gets an accent border (over the fill)").toBeTruthy();
  expect(addon.eval("return ns.FrameState('vgPlate')[__plates.nameplate1].glow[1]:IsShown()"), "and an accent glow around it").toBe(true);
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
  expect(addon.eval('return __click("Threat colors while you have aggro")') && addon.eval("return VanguardDB.profiles.Default.Nameplates.threat") === false, "the options page works").toBeTruthy();
});
it("each nameplate asks the client for its own unit's events, once", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  expect(unitEvents(addon, "UNIT_HEALTH").subs, "health: one subscription per plate, for its unit").toBe("nameplate1 nameplate2");
  expect(unitEvents(addon, "UNIT_SPELLCAST_START"), "casts: each plate's own, beside the cast bars' units; nothing takes every unit's").toEqual({ subs: "nameplate1 nameplate2 player,target,focus", plain: 0 });
  addon.eval("__units.party1 = { name = 'TEST-ONLY Friend', hp = 120, maxhp = 500, reaction = 5 } __units.nameplate2 = __units.party1");
  addon.fire("UNIT_HEALTH", "nameplate2");
  expect(addon.eval("return ns.FrameState('vgPlate')[__plates.nameplate2]:GetValue()"), "a plate's own unit event repaints it").toBe(120);
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate1");
  expect(unitEvents(addon, "UNIT_HEALTH").subs, "a removed plate stops listening").toBe("nameplate2");
  addon.eval("__plates.nameplate5, __units.nameplate5 = __plates.nameplate1, __units.target");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate5");
  expect(unitEvents(addon, "UNIT_FACTION").subs, "the client reuses a plate for another unit: it listens for that one").toBe("nameplate2 nameplate5");
});
