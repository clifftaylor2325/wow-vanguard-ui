// raid: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { RAID_ENV, UNITS_ENV, button, key, loggedIn, raidButton } from "./helpers.mjs";

it("a unit event reaches only the tile showing that unit", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  addon.eval(`__spawn(1, "raid1") __spawn(2, "raid2") __spawn(3, "raid3")
    local RF = ns.GetModule("RaidFrames") local update, isUnit = RF.Update, UnitIsUnit
    __updates, __asked = {}, 0
    RF.Update = function(b, ...) __updates[#__updates + 1] = b:GetName() return update(b, ...) end
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
