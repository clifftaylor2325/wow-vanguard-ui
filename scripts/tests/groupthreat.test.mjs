// groupthreat: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/GroupThreat.lua: a panel of who in the group has the most threat on your target, hidden
// while the client hides threat values.

import { expect, it } from "vitest";
import { CLICK_LUA, loggedIn, setCombat, tok } from "./helpers.mjs";
import { insets } from "./dialogs.mjs";

const ON = { savedVariables: "VanguardDB.profiles = { Default = { GroupThreat = { show = true } } }" };

// A party of you and two others, a hostile target, and threat on it as UnitDetailedThreatSituation gives it.
function party(extra = "") {
  const addon = loggedIn(CLICK_LUA + extra, ON);
  addon.world.setUnit("player", { name: "TEST-ONLY You", threat: 0, threatPct: 30 });
  addon.world.setUnit("party1", { name: "TEST-ONLY Tank", threat: 3, threatPct: 100 });
  addon.world.setUnit("party2", { name: "TEST-ONLY Mage", threat: 1, threatPct: 62.4 });
  addon.world.setUnit("target", { name: "TEST-ONLY Boar", hp: 100, maxhp: 100, reaction: 2 });
  return addon;
}

// What the panel shows: whether it is shown, and each row's [name, percent].
const panel = (addon) => {
  addon.advance(0.3);
  return addon.eval(`local GT = ns.GetModule("GroupThreat") local out = {}
    for _, r in ipairs(GT.panel.rows) do if r:IsShown() then out[#out + 1] = { r.name:GetText(), r.value:GetText() } end end
    return { GT.panel:IsShown(), out }`);
};

it("group threat: off until switched on", () => {
  const addon = loggedIn(CLICK_LUA);
  expect(addon.eval("return { Vanguard_GroupThreat == nil, ns.GetModule('GroupThreat').panel == nil }"), "nothing is built").toEqual([true, true]);
  addon.eval('ns.Options.Show("unitframes")');
  addon.eval('__click("Group threat panel: who has the most threat on your target")');
  expect(addon.eval("return ns.Settings('GroupThreat').show"), "the switch is under Unit frames").toBe(true);
});

it("group threat: lists the group by threat on your target, highest first, in the threat colors", () => {
  const addon = party();
  addon.fire("UNIT_THREAT_LIST_UPDATE", "target");
  expect(panel(addon), "the tank, the mage, then you").toEqual([true, [["TEST-ONLY Tank", "100%"], ["TEST-ONLY Mage", "62%"], ["TEST-ONLY You", "30%"]]]);
  expect(addon.eval("local r = ns.GetModule('GroupThreat').panel.rows return { r[1].value.__textColor, r[2].value.__textColor, r[3].value.__textColor }"), "aggro, some threat, none")
    .toEqual([tok(addon, "threat3"), tok(addon, "threat1"), tok(addon, "text2")]);
  addon.world.setUnit("party1", { threat: 3, threatPct: 10 });
  addon.fire("UNIT_THREAT_SITUATION_UPDATE", "party1");
  expect(panel(addon)[1].map((r) => r[0]), "it re-sorts when threat moves").toEqual(["TEST-ONLY Mage", "TEST-ONLY You", "TEST-ONLY Tank"]);
  addon.world.removeUnit("party2");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(panel(addon)[1].length, "a member who left is gone").toBe(2);
});

it("group threat: shows in combat, a raid is read too, and only the top five show", () => {
  const addon = party();
  setCombat(addon, true);
  addon.eval("local w = __wfgWorld for i = 1, 8 do w.setUnit('raid' .. i, { name = 'TEST-ONLY R' .. i, threat = 0, threatPct = i * 10 }) end w.setUnit('raid1', { name = 'TEST-ONLY R1', threat = 0, threatPct = 10 })");
  addon.fire("GROUP_ROSTER_UPDATE");
  const [shown, rows] = panel(addon);
  expect([shown, rows.length, rows[0]], "five rows, the highest first, in combat").toEqual([true, 5, ["TEST-ONLY R8", "80%"]]);
});

it("group threat: hides while threat is hidden, and with no group, no target or nobody with threat", () => {
  const addon = party();
  // Whether the panel shows now.
  const shown = () => panel(addon)[0];
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(shown(), "readable: shown").toBe(true);
  addon.eval("C_Secrets.ShouldUnitThreatValuesBeSecret = function() return true end");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "target");
  expect(shown(), "the client says threat is hidden").toBe(false);
  addon.eval("C_Secrets.ShouldUnitThreatValuesBeSecret = function() error('no') end");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "target");
  expect(shown(), "an error counts as hidden").toBe(false);
  addon.eval("C_Secrets.ShouldUnitThreatValuesBeSecret = function() return __wfgWorld.secret() end");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "target");
  expect(shown(), "a hidden answer counts as hidden").toBe(false);
  addon.eval("C_Secrets.ShouldUnitThreatValuesBeSecret = function() return false end");
  addon.eval("local real = UnitDetailedThreatSituation UnitDetailedThreatSituation = function(u, t) if u == 'party2' then return false, __wfgWorld.secret(1), __wfgWorld.secret(50) end return real(u, t) end");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "target");
  expect([shown(), addon.eval("return #ns.errors")], "one hidden value hides the whole panel, without an error").toEqual([false, 0]);
  addon.eval("UnitDetailedThreatSituation = function(u, t) if u == 'party2' then return nil end return false, 1, 40 end");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "target");
  expect(shown(), "a member with no threat is left out, the rest show").toBe(true);
  addon.eval("UnitName = function(u) return __wfgWorld.secret() end");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "target");
  expect(shown(), "a hidden name hides it too").toBe(false);
  addon.eval("UnitName = nil UnitDetailedThreatSituation = function() return false, 'x', 'y' end");
  addon.eval("UnitName = function(u) return u end");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "target");
  expect(shown(), "values that are not numbers: nothing to show").toBe(false);
});

it("group threat: a hidden 'exists' or 'is you' answer counts as no, without an error", () => {
  const addon = party();
  addon.eval("realExists, realIs = UnitExists, UnitIsUnit");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "target");
  expect(panel(addon)[1].length, "all three listed").toBe(3);
  addon.eval("UnitExists = function(u) if u == 'party2' then return __wfgWorld.secret() end return realExists(u) end");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "target");
  expect(panel(addon)[1].map((r) => r[0]), "a member the client won't confirm is left out").toEqual(["TEST-ONLY Tank", "TEST-ONLY You"]);
  addon.eval("UnitExists = realExists UnitIsUnit = function() return __wfgWorld.secret() end");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "target");
  expect(panel(addon)[1].length, "a hidden 'is you' counts as no: everyone is listed").toBe(3);
  addon.eval("UnitIsUnit = realIs UnitExists = function(u) if u == 'target' then return __wfgWorld.secret() end return realExists(u) end");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect([panel(addon)[0], addon.eval("return #ns.errors")], "a target the client won't confirm: no panel, no error").toEqual([false, 0]);
});

it("group threat: no group, no target, a friendly target or a client without the calls show nothing", () => {
  const addon = party();
  // Whether the panel shows now.
  const shown = () => panel(addon)[0];
  addon.eval("UnitCanAttack = function() return false end");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(shown(), "a friendly target").toBe(false);
  addon.eval("UnitCanAttack = function() return true end");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(shown(), "a hostile target").toBe(true);
  addon.world.removeUnit("target");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(shown(), "no target").toBe(false);
  addon.world.setUnit("target", { name: "TEST-ONLY Boar", reaction: 2 });
  addon.world.removeUnit("party1");
  addon.world.removeUnit("party2");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(shown(), "no group").toBe(false);
  addon.eval("IsInGroup = nil");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(shown(), "no group call").toBe(false);
  addon.eval("UnitDetailedThreatSituation = nil");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect([shown(), addon.eval("return #ns.errors")], "no threat call").toEqual([false, 0]);
});

it("group threat: the panel is movable", () => {
  const addon = party();
  expect(addon.eval("return { ns.MoverPoint('groupthreat') }"), "a mover at the right").toEqual(["RIGHT", "RIGHT", -20, 120]);
});

it("group threat: T.SPACE.gap in from the panel's edge on every side (a HUD card's padding), and as tall as its padding and rows", () => {
  const addon = party();
  addon.fire("UNIT_THREAT_LIST_UPDATE", "target");
  panel(addon);
  const gap = addon.eval("return ns.Theme.SPACE.gap");
  const [first, last] = [1, 3].map((i) => insets(addon, `ns.GetModule("GroupThreat").panel.rows[${i}]`, "ns.GetModule('GroupThreat').panel"));
  expect([first[0], first[1], first[2], last[3]], "the first row a gap in from the left, top and right; the last row a gap above the bottom").toEqual([gap, gap, gap, gap]);
  expect(addon.eval("local GT = ns.GetModule('GroupThreat') return GT.panel:GetHeight() - 3 * GT.panel.rows[1]:GetHeight()"), "two gaps and three rows").toBe(2 * gap);
});
