// platebuffs: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, PLATE_ENV, UNITS_ENV, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY plates nameplate<from>..nameplate<to>, each a hostile like the target.
const morePlates = (from, to) => `for i = ${from}, ${to} do
    local p = CreateFrame("Frame", nil, UIParent)
    p.UnitFrame, p.IsForbidden = CreateFrame("Frame", nil, p), function() return false end
    __plates["nameplate" .. i], __units["nameplate" .. i] = p, __units.target
  end`;
// TEST-ONLY hit testing on nameplate1 and nameplate2, as the client's plates have it: the click
// area and stacking frame recorded, __canHit for whether the client lets them change now, and the
// client's own frame setting the area around its own (hidden) bar.
const HIT_ENV = `
  __canHit = true
  for _, unit in ipairs({ "nameplate1", "nameplate2" }) do
    local p = __plates[unit]
    p.CanChangeHitTestPoints = function() return __canHit end
    p.SetAllHitTestPoints = function(self, region) self.__hit = region end
    p.SetStackingBoundsFrame = function(self, frame) self.__stack = frame end
    p.UnitFrame.GetNamePlateFrame = function() return p end
    p.UnitFrame.UpdateHitTestArea = function() p.__hit = "TEST-ONLY default" end
  end
`;
it("a plate's click area and stacking box are our name and bar, padded, whatever the client's own frame sets", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + HIT_ENV);
  // A plate's click area and stacking box: whether each is ours, and the click area as set.
  const hit = (unit) => addon.eval(`local p = __plates.${unit} return { p.__hit == ns.FrameState('vgPlate')[p].hit, p.__stack == ns.FrameState('vgPlate')[p].hit, p.__hit }`);
  expect(hit("nameplate1").slice(0, 2), "on the plates on screen at login: the click area and the stacking box").toEqual([true, true]);
  // The plate laid out as the client would (it places and sizes plates), so its parts can be measured.
  const box = addon.eval(`__plates.nameplate1:SetSize(230, 70) __plates.nameplate1:SetPoint("CENTER")
    local f = ns.FrameState('vgPlate')[__plates.nameplate1] local h = f.hit
    return { h:GetLeft() - f:GetLeft(), f:GetRight() - h:GetRight(), f:GetBottom() - h:GetBottom(), h:GetTop() - f.name:GetTop(), h:IsMouseEnabled() == true }`);
  expect(box, "10 past each side of the bar, half a bar under it, up to the top of the name, taking no mouse itself").toEqual([-10, -10, 5, 0, false]);
  addon.eval("__plates.nameplate1.UnitFrame:UpdateHitTestArea()");
  expect(hit("nameplate1")[0], "the client's own frame setting its area again: ours is put back").toBe(true);
  addon.eval("__canHit = false __plates.nameplate1.UnitFrame:UpdateHitTestArea()");
  expect(hit("nameplate1")[2], "when the client won't let it change (in combat), nothing is tried").toBe("TEST-ONLY default");
  addon.eval("__canHit = true");
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate1");
  addon.eval("__plates.nameplate1.UnitFrame:UpdateHitTestArea()");
  expect(hit("nameplate1")[2], "a plate with no unit is left to the client").toBe("TEST-ONLY default");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  expect(hit("nameplate1")[0], "its next unit gets ours again").toBe(true);
  addon.eval(morePlates(4, 4));
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate4");
  expect(addon.eval("return { ns.FrameState('vgPlate')[__plates.nameplate4]:IsShown(), #ns.errors }"), "a client without hit testing: the plate is drawn, no error").toEqual([true, 0]);
});
// TEST-ONLY buffs: a big defensive and one of yours on any player, through the buff row's filters.
const BUFF_ENV = `
  local debuffs = C_UnitAuras.GetAuraDataByIndex
  __buffs = { ["HELPFUL|BIG_DEFENSIVE"] = "TEST-ONLY-WALL", ["HELPFUL|PLAYER|!IMPORTANT|!BIG_DEFENSIVE|!EXTERNAL_DEFENSIVE"] = "TEST-ONLY-FORT" }
  C_UnitAuras.GetAuraDataByIndex = function(unit, i, filter)
    if i == 1 and __buffs[filter] and __units[unit] and __units[unit].player then return { icon = __buffs[filter], expirationTime = 0, duration = 0 } end
    return debuffs(unit, i, filter)
  end
`;
it("player plates show defensives, important buffs and yours right of the bar; other plates none", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + PLATE_ENV + BUFF_ENV);
  // A plate's buff row: shown, its unit (none: the client's container switched off), the icon
  // on each group's first button, and where it sits.
  const buffs = (unit) => addon.eval(`local f = ns.FrameState('vgPlate')[__plates.${unit}] local c = f.buffs.frame local at = c.__points.BOTTOMLEFT
    local icons = {} for i, g in ipairs(c.__groups) do local b = g.buttons[1] icons[i] = b.__shown and b.__icon.__texture or false end
    return { shown = c:IsShown(), unit = c.__enabled and f.buffs.unit or false, icons = icons, rel = at.rel == f, relPoint = at.relPoint, x = at.x, size = c.__groups[1].buttons[1]:GetWidth() }`);
  const friend = buffs("nameplate2");
  expect(friend, "a friendly player: the defensive first, then yours, right of the bar").toMatchObject({
    shown: true, unit: "nameplate2", icons: ["TEST-ONLY-WALL", false, false, "TEST-ONLY-FORT"], rel: true, relPoint: "BOTTOMRIGHT", size: 16 });
  expect(friend.x, "clear of the target marker").toBeGreaterThan(addon.eval("return 4 + ns.GetModule('Nameplates').MARKER"));
  expect(buffs("nameplate1"), "a mob: no buff row").toMatchObject({ shown: false, unit: false });
  addon.eval("__isPlayer = UnitIsPlayer UnitIsPlayer = function() return { __secret = true } end ns.GetModule('Nameplates').RefreshAll()");
  expect(buffs("nameplate2"), "a hidden answer counts as not a player").toMatchObject({ shown: false, unit: false });
  addon.eval("UnitIsPlayer = __isPlayer ns.GetModule('Nameplates').RefreshAll()");
  expect(buffs("nameplate2"), "a plain answer again: the row is back").toMatchObject({ shown: true, unit: "nameplate2" });
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate2");
  expect(buffs("nameplate2"), "a plate that went away lets go of its unit").toMatchObject({ shown: false, unit: false });
  addon.eval("__units.nameplate2 = __units.target");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  expect(buffs("nameplate2"), "the plate reused for a mob shows none").toMatchObject({ shown: false, unit: false });
  addon.eval('ns.Options.Show("nameplates")');
  addon.eval('__click("Buffs on players (defensives, and yours on friends)")');
  expect(addon.eval("return VanguardDB.profiles.Default.Nameplates.buffs"), "the options page sets how many").toBe(5);
  const off = loggedIn(UNITS_ENV + PLATE_ENV + BUFF_ENV, { savedVariables: "VanguardDB = { profiles = { Default = { Nameplates = { buffs = 0 } } } }" });
  expect(off.eval("return { ns.FrameState('vgPlate')[__plates.nameplate2].buffs == nil, #ns.errors }"), "switched off: no buff row is built").toEqual([true, 0]);
});
it("a player's plate first drawn in combat gets its buff row on the client's container after the fight", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + BUFF_ENV + "__units.nameplate2 = nil ns.GetModule('Nameplates').POOL = 0");
  setCombat(addon, true);
  addon.eval("__units.nameplate2 = __units.party1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  // nameplate2's buff row: on the engine, its frame kind, its unit, and whether it shows.
  const row = () => addon.eval(`local f = ns.FrameState('vgPlate')[__plates.nameplate2]
    return { engine = f.buffsOnEngine, kind = f.buffs.frame.__kind, unit = f.buffs.unit or f.buffs.frame.__unit, shown = f.buffs.frame:IsShown() }`);
  expect(row(), "in combat: the fallback icons, on the player").toMatchObject({ engine: false, kind: "Frame", unit: "nameplate2", shown: true });
  setCombat(addon, false);
  expect(row(), "after the fight: the client's container, on the same player").toMatchObject({ engine: true, kind: "AuraContainer", unit: "nameplate2", shown: true });
  expect(addon.eval("return #ns.GetModule('Nameplates').spare.buffs"), "the fallback row kept for the next fight").toBe(1);
});
it("the plate under the mouse gets a faint wash until the mouse leaves its unit", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  const NP = "ns.GetModule('Nameplates')";
  // Whether each plate is washed, and whether the mouseover watch is on.
  const washed = () => addon.eval(`return { ns.FrameState('vgPlate')[__plates.nameplate1].hover:IsShown(), ns.FrameState('vgPlate')[__plates.nameplate2].hover:IsShown(), ns.ticker.vgJobs['nameplate hover'] ~= nil }`);
  expect(washed(), "no mouseover: no wash, nothing watched").toEqual([false, false, false]);
  addon.eval("__units.mouseover = __units.party1");
  addon.fire("UPDATE_MOUSEOVER_UNIT");
  expect(washed(), "the friend's plate washed, the watch on").toEqual([false, true, true]);
  expect(addon.eval("return ns.FrameState('vgPlate')[__plates.nameplate2].hover.__vertexColor[4]"), "faint").toBe(addon.eval(`return ${NP}.HOVER`));
  addon.eval("__units.mouseover = __units.target");
  addon.fire("UPDATE_MOUSEOVER_UNIT");
  expect(washed(), "onto the boar: the wash moves with it").toEqual([true, false, true]);
  addon.eval("__units.mouseover = nil");
  addon.update(0.05);
  expect(washed(), "the mouse left, but the watch only looks every tenth of a second").toEqual([true, false, true]);
  addon.update(0.06);
  expect(washed(), "then the wash goes and the watch stops").toEqual([false, false, false]);
  addon.eval(`__units.mouseover = __units.party1 local same = UnitIsUnit
    UnitIsUnit = function(a, b) if b == "mouseover" then return { __secret = true } end return same(a, b) end`);
  addon.fire("UPDATE_MOUSEOVER_UNIT");
  expect(washed(), "a hidden answer: no wash").toEqual([false, false, false]);
});
