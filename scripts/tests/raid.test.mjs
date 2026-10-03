// raid: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { HEALING_ENV, RAID_ENV, UNITS_ENV, borderOf, isTok, loggedIn, raidButton, setCombat } from "./helpers.mjs";

it("a unit event reaches only the tile showing that unit", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  addon.eval(`__spawn(1, "raid1") __spawn(2, "raid2") __spawn(3, "raid3")
    local RF = ns.GetModule("RaidFrames") local update, health, isUnit = RF.Update, RF.UpdateHealth, UnitIsUnit
    __updates, __asked = {}, 0
    RF.Update = function(b, ...) __updates[#__updates + 1] = b:GetName() return update(b, ...) end
    RF.UpdateHealth = function(b, ...) __updates[#__updates + 1] = b:GetName() return health(b, ...) end
    UnitIsUnit = function(a, b) if b ~= "target" and b ~= "player" then __asked = __asked + 1 end return isUnit(a, b) end`);
  addon.fire("UNIT_HEALTH", "raid3");
  expect(addon.eval("return { __updates, __asked }"), "one tile is updated, and the client is never asked which tile shows raid3").toEqual([["ForeverUI_RaidUnitButton3"], 0]);
  expect(addon.eval('local RF = ns.GetModule("RaidFrames") return RF.byUnit.player == ForeverUI_RaidUnitButton2'), "the tile showing you is also found by player").toBe(true);
  addon.eval('__updates = {} ForeverUI_RaidUnitButton3:SetAttribute("unit", "raid9")');
  addon.fire("UNIT_HEALTH", "raid3");
  expect(addon.eval('local RF = ns.GetModule("RaidFrames") return { RF.byUnit.raid3 == nil, RF.byUnit.raid9 == ForeverUI_RaidUnitButton3, #__updates }'), "a roster change moves the tile to its new unit").toEqual([true, true, 1]);
  addon.eval('ForeverUI_RaidUnitButton2:SetAttribute("unit", "raid1")');
  expect(addon.eval('local RF = ns.GetModule("RaidFrames") return RF.byUnit.player == nil'), "and the player entry goes when that tile shows someone else").toBe(true);
});

it("raid frames", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  const h = addon.eval(`local h = ForeverUI_Raid return { template = h:GetAttribute("template"), groupBy = h:GetAttribute("groupBy"),
    party = h:GetAttribute("showParty"), start = h:GetAttribute("startingIndex"), vis = h.__drivers["state-visibility"],
    init = h:GetAttribute("initialConfigFunction"), w = h:GetAttribute("fui-width") }`);
  expect(h.template === "SecureUnitButtonTemplate" && h.groupBy === "GROUP" && h.party === true && h.w === 100, "a secure group header, grouped by group, covering the party").toBeTruthy();
  expect(h.start === 1 && /\[group:raid\] show; \[group:party\] show; hide/.test(h.vis), "buttons are precreated, then the header shows in groups only").toBeTruthy();
  expect(/CallMethod\("initialConfigFunction"/.test(h.init) && /\*type2", "togglemenu"/.test(h.init), "each new button is sized, gets target/menu clicks, and is set up").toBeTruthy();
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  const tank = raidButton(addon, 1);
  expect(tank.hp === 300 && tank.max === 1000 && tank.name === "TEST-ONLY Tank" && /Icons\\RoleTank$/.test(tank.role), "health, name and a tank's shield").toBeTruthy();
  expect(tank.nameAfter && raidButton(addon, 3).role === false && raidButton(addon, 3).roleW === 1 && tank.roleW > 1, "no role, no mark: it narrows, so the name after it starts near the row's start").toBeTruthy();
  const soft = 0.78 * 0.7 + (0x12 / 255) * 0.3;
  expect(Math.abs(tank.color[0] - soft) < 1e-6, "class colors, softened into the panel color by default").toBeTruthy();
  expect(tank.status === "-700", "the second row shows missing health").toBeTruthy();
  expect(addon.eval("return ForeverUI_RaidUnitButton1.name.__font[3]") === "OUTLINE", "names over the bar are outlined").toBeTruthy();
  expect(addon.eval("return ForeverUI_RaidUnitButton1.power:IsShown()") === true, "a thin power bar along the bottom").toBeTruthy();
  expect(raidButton(addon, 3).status === "Offline", "offline players say so").toBeTruthy();
  expect(raidButton(addon, 2).status === "-100", "you, too, with your missing health").toBeTruthy();
  addon.eval("__units.raid1.hp = 900");
  addon.fire("UNIT_HEALTH", "raid1");
  expect(raidButton(addon, 1).hp === 900, "UNIT_HEALTH refreshes that member").toBeTruthy();
  addon.eval("__units.raid1.hp = 1000");
  addon.fire("UNIT_HEALTH", "raid1");
  expect(raidButton(addon, 1).status === "", "no text at full health").toBeTruthy();
  addon.eval("__units.raid1.hp = { __secret = true }");
  addon.fire("UNIT_HEALTH", "raid1");
  expect(raidButton(addon, 1).status === "", "no missing-health text when the client keeps health secret").toBeTruthy();
  // In combat the client's shortened health text is a secret string, and comparing
  // it errors. Raid frames must decide Dead/Offline without reading that text.
  addon.eval(`__healthTextCalls = 0
    local UF = ns.GetModule("UnitFrames") local text = UF.HealthText
    UF.HealthText = function(...) __healthTextCalls = __healthTextCalls + 1 return text(...) end`);
  addon.fire("UNIT_HEALTH", "raid1");
  expect(addon.eval("return __healthTextCalls") === 0, "raid frames never compare the (possibly secret) health text").toBeTruthy();
  expect(addon.eval("return ForeverUI_RaidUnitButton1.down") === false, "secret health is not Dead or Offline").toBeTruthy();
  addon.eval("__units.raid1.hp = 900; AbbreviateNumbers = nil");
  addon.fire("UNIT_HEALTH", "raid1");
  expect(raidButton(addon, 1).status === "-100", "plain numbers without the client's formatter").toBeTruthy();
  addon.eval('local s = ForeverUIDB.profiles.Default.RaidFrames s.look = "class" s.showPower = false ns.GetModule("RaidFrames").UpdateAll()');
  expect(raidButton(addon, 1).color[0] === 0.78 && addon.eval("return ForeverUI_RaidUnitButton1.power:IsShown()") === false, "bright class colors and no power bar, by choice").toBeTruthy();
  addon.eval("__units.player.hp = 100");
  addon.fire("UNIT_HEALTH", "player");
  expect(raidButton(addon, 2).hp === 100, "an event for you updates your raid button too").toBeTruthy();
  expect(addon.eval("return CompactRaidFrameContainer:GetParent():IsShown()") === false, "the default raid frames are hidden").toBeTruthy();
  expect(addon.eval("return ForeverUI_party1") === null, "UnitFrames doesn't build party frames the raid frames cover").toBeTruthy();
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = true end return out.raid") === true, "the raid frames are movable").toBeTruthy();
});

it("raid frames: a dark style chosen before 'look' carries over", () => {
  const sv = 'ForeverUIDB = { profiles = { Default = { RaidFrames = { style = "dark" } } }, chars = {} }';
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { savedVariables: sv });
  const s = addon.eval("return ForeverUIDB.profiles.Default.RaidFrames");
  expect(s.look === "dark" && s.style == null, "style = dark becomes look = dark, and the old key goes").toBeTruthy();
});

// TEST-ONLY: a client whose secure snippets fail to compile (the probe's call throws).
const NO_SNIPPETS = 'SecureHandlerExecute = function() error("TEST-ONLY: snippets do not compile") end\n';

// A raid button made the way the header would on a client without snippets (no init call).
const headerMakes = (addon, i, unit) => addon.eval(`local b = CreateFrame("Button", "ForeverUI_RaidUnitButton${i}", ForeverUI_Raid, "SecureUnitButtonTemplate") b:SetAttribute("unit", "${unit}") return b:GetName()`);

it("raid frames without secure snippets: the header copies the clicks; buttons are sized and set up out of combat", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + NO_SNIPPETS);
  expect(addon.eval("local h = ForeverUI_Raid return { h:GetAttribute('initialConfigFunction') == nil, h:GetAttribute('_initialAttributeNames'), h:GetAttribute('_initialAttribute-*type1'), h:GetAttribute('_initialAttribute-*type2') }"),
    "no init snippet; the header's own attribute copy carries the clicks").toEqual([true, "*type1,*type2", "target", "togglemenu"]);
  headerMakes(addon, 1, "raid1");
  addon.eval('CreateFrame("Frame", "TESTONLY_NotAButton", ForeverUI_Raid)');
  setCombat(addon, true);
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(addon.eval("return ForeverUI_RaidUnitButton1.fuiHeaderSetup == nil"), "in a fight the new button waits").toBe(true);
  setCombat(addon, false);
  const w = addon.eval('return ns.Settings("RaidFrames").width'), h = addon.eval('return ns.Settings("RaidFrames").height');
  expect(addon.eval("local b = ForeverUI_RaidUnitButton1 return { b:GetWidth(), b:GetHeight(), b:GetAttribute('*type1'), b:GetAttribute('*type2'), b.health ~= nil }"),
    "after it, the button has its size, its clicks and the raid tile setup").toEqual([w, h, "target", "togglemenu", true]);
  expect(raidButton(addon, 1).name, "and shows its unit").toBe("TEST-ONLY Tank");
  expect(addon.eval("return TESTONLY_NotAButton.fuiHeaderSetup == nil"), "a child that is not a unit button is left alone").toBe(true);
  addon.eval('__setups = 0 local RF = ns.GetModule("RaidFrames") local s = RF.Setup RF.Setup = function(...) __setups = __setups + 1 return s(...) end RF.SetupButtons()');
  expect(addon.eval("return __setups"), "a button is set up once").toBe(0);
});

it("raid frames with secure snippets keep the init snippet", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  expect(addon.eval('local h = ForeverUI_Raid return { h:GetAttribute("initialConfigFunction") == ns.GetModule("RaidFrames").INIT, h:GetAttribute("_initialAttributeNames") == nil }'),
    "the snippet, and no attribute copy").toEqual([true, true]);
  headerMakes(addon, 1, "raid1");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(addon.eval("return ForeverUI_RaidUnitButton1.fuiHeaderSetup == nil"), "the module leaves set-up to the snippet").toBe(true);
});

// TEST-ONLY group status calls for the marks (no icons, checks or leaders), so their reads can be counted.
const MARK_CALLS = `
  GetRaidTargetIndex = function() return nil end
  GetReadyCheckStatus = function() return nil end
  UnitHasIncomingResurrection = function() return false end
  UnitIsGroupLeader = function() return false end
  UnitIsGroupAssistant = function() return false end
  UnitInRange = function() return true, true end
`;

// The game calls counted below: every client read a raid tile's parts make.
const COUNTED = ["UnitHealth", "UnitHealthMax", "UnitName", "UnitGroupRolesAssigned", "UnitPower", "UnitPowerMax", "GetRaidTargetIndex",
  "GetReadyCheckStatus", "UnitHasIncomingResurrection", "UnitIsGroupLeader", "UnitInRange", "UnitThreatSituation", "UnitGetDetailedHealPrediction"];

// TEST-ONLY counters: each named global, the theme's SetBorder and the by-name aura lookup add to __counts[name] when called.
const COUNT_LUA = `__counts = {}
  local function count(t, key, name) local f = t[key] t[key] = function(...) __counts[name] = (__counts[name] or 0) + 1 return f(...) end end
  for _, name in ipairs({ "${COUNTED.join('", "')}" }) do count(_G, name, name) end
  count(ns.Theme, "SetBorder", "SetBorder") count(C_UnitAuras, "GetAuraDataBySpellName", "auras")`;

// The calls counted since the last look (then forgets them), every counted name present (0 when not called).
const counted = (addon) => {
  const c = addon.eval("local c = __counts __counts = {} return c");
  return Object.fromEntries([...COUNTED, "SetBorder", "auras"].map((name) => [name, (c && c[name]) || 0]));
};

// The same counts with every call zeroed: what "nothing else was asked" looks like.
const none = (c) => Object.fromEntries(Object.keys(c).map((name) => [name, 0]));

it("raid tiles: each event refreshes only its own part of the tile", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV + MARK_CALLS);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  addon.eval(COUNT_LUA);
  addon.eval("__units.raid1.hp = 650");
  addon.fire("UNIT_HEALTH", "raid1");
  const health = counted(addon);
  expect([raidButton(addon, 1).hp, raidButton(addon, 1).status, health.UnitGetDetailedHealPrediction], "a health event: the bar, the missing health and the heal bars").toEqual([650, "-350", 1]);
  expect({ ...health, UnitHealth: 0, UnitHealthMax: 0, UnitGetDetailedHealPrediction: 0 }, "and nothing else: no name, role, power, edge, marks, range, threat or buff lookups").toEqual(none(health));
  addon.eval("__units.raid1.power = 40 __units.raid1.maxpower = 100");
  addon.fire("UNIT_POWER_UPDATE", "raid1");
  const power = counted(addon);
  expect([addon.eval("return ForeverUI_RaidUnitButton1.power.__value"), power.UnitPower, power.UnitPowerMax], "a power event: the power bar").toEqual([40, 1, 1]);
  expect({ ...power, UnitPower: 0, UnitPowerMax: 0 }, "only").toEqual(none(power));
  addon.eval('__units.raid1.role = "HEALER"');
  addon.fire("PLAYER_ROLES_ASSIGNED");
  const roles = counted(addon);
  expect([/RoleHealer$/.test(raidButton(addon, 1).role), roles.UnitGroupRolesAssigned], "roles assigned: the role mark on each tile").toEqual([true, 3]);
  expect({ ...roles, UnitGroupRolesAssigned: 0 }, "only").toEqual(none(roles));
  addon.eval("__units.target = __units.raid1");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect([counted(addon).SetBorder, isTok(addon, borderOf(addon, "ForeverUI_RaidUnitButton1"), "accent")], "a new target: only the tile whose edge changes is repainted, in the accent").toEqual([1, true]);
  addon.eval("ns.Theme.Settings().accent = { 0.1, 0.2, 0.3, 1 } ns.Theme.Refresh()");
  expect(borderOf(addon, "ForeverUI_RaidUnitButton1"), "the target's edge follows an accent change").toEqual([0.1, 0.2, 0.3, 1]);
  addon.eval("__units.raid1.hp = 0 __units.raid1.dead = true");
  addon.fire("UNIT_HEALTH", "raid1");
  expect([raidButton(addon, 1).status, counted(addon).GetRaidTargetIndex, addon.eval("return ForeverUI_RaidUnitButton1.debuffRow.frame:IsShown()")],
    "a death refreshes the whole tile: Dead, the marks read again, the aura rows hidden").toEqual(["Dead", 1, false]);
});
