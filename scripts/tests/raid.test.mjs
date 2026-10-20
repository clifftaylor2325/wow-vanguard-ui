// raid: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, HEALING_ENV, RAID_ENV, UNITS_ENV, borderOf, chatHas, isTok, loggedIn, overlaps, raidButton, setCombat } from "./helpers.mjs";

it("a unit event reaches only the tile showing that unit", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  addon.eval(`__spawn(1, "raid1") __spawn(2, "raid2") __spawn(3, "raid3")
    local RF = ns.GetModule("RaidFrames") local update, health, isUnit = RF.Update, RF.UpdateHealth, UnitIsUnit
    __updates, __asked = {}, 0
    RF.Update = function(b, ...) __updates[#__updates + 1] = b:GetName() return update(b, ...) end
    RF.UpdateHealth = function(b, ...) __updates[#__updates + 1] = b:GetName() return health(b, ...) end
    UnitIsUnit = function(a, b) if b ~= "target" and b ~= "player" then __asked = __asked + 1 end return isUnit(a, b) end`);
  addon.fire("UNIT_HEALTH", "raid3");
  expect(addon.eval("return { __updates, __asked }"), "one tile is updated, and the client is never asked which tile shows raid3").toEqual([["Vanguard_RaidUnitButton3"], 0]);
  expect(addon.eval('local RF = ns.GetModule("RaidFrames") return RF.byUnit.player == Vanguard_RaidUnitButton2'), "the tile showing you is also found by player").toBe(true);
  addon.eval('__updates = {} Vanguard_RaidUnitButton3:SetAttribute("unit", "raid9")');
  addon.fire("UNIT_HEALTH", "raid3");
  expect(addon.eval('local RF = ns.GetModule("RaidFrames") return { RF.byUnit.raid3 == nil, RF.byUnit.raid9 == Vanguard_RaidUnitButton3, #__updates }'), "a roster change moves the tile to its new unit").toEqual([true, true, 1]);
  addon.eval('Vanguard_RaidUnitButton2:SetAttribute("unit", "raid1")');
  expect(addon.eval('local RF = ns.GetModule("RaidFrames") return RF.byUnit.player == nil'), "and the player entry goes when that tile shows someone else").toBe(true);
});

it("raid frames", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  const h = addon.eval(`local h = Vanguard_Raid return { template = h:GetAttribute("template"), groupBy = h:GetAttribute("groupBy"),
    party = h:GetAttribute("showParty"), start = h:GetAttribute("startingIndex"), vis = h.__drivers["state-visibility"],
    init = h:GetAttribute("initialConfigFunction"), w = h:GetAttribute("vg-width") }`);
  expect(h.template === "SecureUnitButtonTemplate" && h.groupBy === "GROUP" && h.party === true && h.w === 100, "a secure group header, grouped by group, covering the party").toBeTruthy();
  expect(h.start === 1 && /\[group:raid\] show; \[group:party\] show; hide/.test(h.vis), "buttons are precreated, then the header shows in groups only").toBeTruthy();
  expect(/CallMethod\("initialConfigFunction"/.test(h.init) && /\*type2", "togglemenu"/.test(h.init), "each new button is sized, gets target/menu clicks, and is set up").toBeTruthy();
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  const tank = raidButton(addon, 1);
  expect(tank.hp === 300 && tank.max === 1000 && tank.name === "TEST-ONLY Tank" && /Icons\\RoleTank$/.test(tank.role), "health, name and a tank's shield").toBeTruthy();
  expect(tank.nameAfter && raidButton(addon, 3).role === false && raidButton(addon, 3).roleW === 1 && tank.roleW > 1, "no role, no mark: it narrows, so the name after it starts near the row's start").toBeTruthy();
  const soft = 0.78 * 0.7 + (0x13 / 255) * 0.3;
  expect(Math.abs(tank.color[0] - soft) < 1e-6, "class colors, softened into the panel color by default").toBeTruthy();
  expect(tank.status === "-700", "the second row shows missing health").toBeTruthy();
  expect(addon.eval("return Vanguard_RaidUnitButton1.name.__font[3]") === "OUTLINE", "names over the bar are outlined").toBeTruthy();
  expect(addon.eval("return Vanguard_RaidUnitButton1.power:IsShown()") === true, "a thin power bar along the bottom").toBeTruthy();
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
  expect(addon.eval("return Vanguard_RaidUnitButton1.down") === false, "secret health is not Dead or Offline").toBeTruthy();
  addon.eval("__units.raid1.hp = 900; AbbreviateNumbers = nil");
  addon.fire("UNIT_HEALTH", "raid1");
  expect(raidButton(addon, 1).status === "-100", "plain numbers without the client's formatter").toBeTruthy();
  addon.eval('local s = VanguardDB.profiles.Default.RaidFrames s.look = "class" s.showPower = false ns.GetModule("RaidFrames").UpdateAll()');
  expect(raidButton(addon, 1).color[0] === 0.78 && addon.eval("return Vanguard_RaidUnitButton1.power:IsShown()") === false, "bright class colors and no power bar, by choice").toBeTruthy();
  addon.eval("__units.player.hp = 100");
  addon.fire("UNIT_HEALTH", "player");
  expect(raidButton(addon, 2).hp === 100, "an event for you updates your raid button too").toBeTruthy();
  expect(addon.eval("return CompactRaidFrameContainer:GetParent():IsShown()") === false, "the default raid frames are hidden").toBeTruthy();
  expect(addon.eval("return Vanguard_party1") === null, "UnitFrames doesn't build party frames the raid frames cover").toBeTruthy();
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = true end return out.raid") === true, "the raid frames are movable").toBeTruthy();
});

it("a new tile size waits for the reload: the tiles' texts and the holder keep the size the tiles were built with", () => {
  const addon = loggedIn("C_Timer = nil " + UNITS_ENV + RAID_ENV);
  addon.eval('__spawn(1, "raid1")');
  // Tile 1's width, its name's right stop, its status width and the holder's size.
  const look = () => addon.eval(`local b = Vanguard_RaidUnitButton1
    return { b:GetWidth(), b.name.__points.TOPRIGHT.x, b.status:GetWidth(), Vanguard_RaidHolder:GetWidth(), Vanguard_RaidHolder:GetHeight() }`);
  const before = look();
  addon.eval(`local _, set = ns.Options.Setting("RaidFrames", "width") set(72)
    local RF = ns.GetModule("RaidFrames") RF.layoutKey = "rows" RF.Arrange(0)`);
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(look(), "texts and holder as they were, for tiles still 100 wide").toEqual(before);
});

it("a 25 or 40 raid at its default spot on a 1365 x 768 UI clears the roll tracker at its tallest", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + "__wfgStub.setScreen(1365, 768) __members = 0 GetNumGroupMembers = function() return __members end");
  // The roll tracker with all R.LINES lines, growing up from its default spot.
  addon.eval("local R = ns.GetModule('Rolls') Vanguard_Rolls:SetHeight(R.LINES * R.LINE + 2 * R.PAD)");
  // A frame's edges on the screen.
  const rect = (name) => addon.eval(`local f = ${name} return { l = f:GetLeft(), b = f:GetBottom(), r = f:GetRight(), t = f:GetTop() }`);
  for (const n of [25, 40]) {
    addon.eval(`__members = ${n}`);
    addon.fire("GROUP_ROSTER_UPDATE");
    // The grid: groups of five as rows stacked up from the holder's left, at the compact scale.
    const { l, b } = rect("Vanguard_RaidHolder");
    const [w, h, sp, scale] = addon.eval(`local s = ns.GetModule('RaidFrames').settings return { s.width, s.height, s.spacing, ns.GetModule('RaidFrames').Scale(${n}) }`);
    const grid = { l, b, r: l + (5 * (w + sp) - sp) * scale, t: b + ((n / 5) * (h + sp) - sp) * scale };
    expect(overlaps(grid, rect("Vanguard_Rolls")), `${n} players`).toBe(false);
  }
});

it("raid role mark: a hidden role shows no mark, no role call or NONE shows none, a healer gets the cross", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  // The role mark RaidFrames gives raid1 after setup: [there is an icon, its color].
  const mark = (setup) => addon.eval(`local RF = ns.GetModule("RaidFrames") ${setup} local icon, color = RF.RoleMark("raid1") return { icon ~= nil, color }`);
  expect(mark('UnitGroupRolesAssigned = function() return __wfgWorld.secret() end'), "a hidden role: no mark").toEqual([false]);
  expect(mark('UnitGroupRolesAssigned = nil'), "a client without the call: no mark").toEqual([false]);
  expect(mark('UnitGroupRolesAssigned = function() return "NONE" end'), "no role: no mark").toEqual([false]);
  expect(mark('UnitGroupRolesAssigned = function() return "HEALER" end'), "a healer: the cross, in the plain text color").toEqual([true, "text2"]);
  expect(addon.eval("return #ns.errors"), "nothing errors").toBe(0);
});

it("raid frames: a dark style chosen before 'look' carries over", () => {
  const sv = 'VanguardDB = { profiles = { Default = { RaidFrames = { style = "dark" } } }, chars = {} }';
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { savedVariables: sv });
  const s = addon.eval("return VanguardDB.profiles.Default.RaidFrames");
  expect(s.look === "dark" && s.style == null, "style = dark becomes look = dark, and the old key goes").toBeTruthy();
});

// The tank's tile: its top line (shown, color, height in screen pixels) and its
// status text (font size in tile units, size on screen, justification, text).
const TILE_LOOK = `local b = Vanguard_RaidUnitButton1 local t, fs = b.topLine, b.status local _, size = fs:GetFont()
  return { line = t:IsShown(), color = t.__vertexColor or false, px = t:GetHeight() / ns.Theme.Pixel(b), size = size,
    onScreen = size * b:GetEffectiveScale() / UIParent:GetEffectiveScale(), justify = fs.__justifyH, text = fs:GetText() }`;

it("raid tiles: a class-colored top line in the softened look, and missing health that stays readable on a 40-player grid", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + "__members = 5 GetNumGroupMembers = function() return __members end");
  addon.eval('__spawn(1, "raid1") __spawn(3, "raid3")');
  // The tank's tile now (TILE_LOOK).
  const tile = () => addon.eval(TILE_LOOK);
  // A number to three places, for sizes worked out in fractions of a pixel.
  const r3 = (n) => Math.round(n * 1000) / 1000;
  let t = tile();
  expect([t.line, t.color, r3(t.px)], "the softened look: a 1 px line in the tank's own (unsoftened) class color").toEqual([true, [0.78, 0.61, 0.43, 1], 1]);
  expect(addon.frame("Vanguard_RaidUnitButton1.topLine").rect.top, "along the top of the health bar").toBe(addon.frame("Vanguard_RaidUnitButton1.health").rect.top);
  expect(addon.eval("local t = Vanguard_RaidUnitButton1.topLine return { t:GetParent() == Vanguard_RaidUnitButton1.health, t.__layer, t.__sublevel }"),
    "on the health bar, one sublevel under the aggro strip, which covers it while the player has aggro").toEqual([true, "OVERLAY", -1]);
  expect([t.size, t.justify, t.text], "a 10-player grid: the missing health at its usual size, under the name").toEqual([10, "CENTER", "-700"]);
  // The grid fitted to n players: the status size in tile units and on screen, its justification, the line's pixels.
  const fit = (n) => { addon.eval(`__members = ${n}`); addon.fire("GROUP_ROSTER_UPDATE"); t = tile(); return [r3(t.size), r3(t.onScreen), t.justify, r3(t.px)]; };
  expect(fit(25), "25 players (drawn at 80%): 10 px on screen, the floor (#258), beside the name, the line still 1 px").toEqual([12.5, 10, "RIGHT", 1]);
  expect(fit(40), "40 players (drawn at 72%): still 10 px on screen").toEqual([13.889, 10, "RIGHT", 1]);
  expect(t.text, "with the missing health in it").toBe("-700");
  setCombat(addon, true);
  addon.eval("ns.Theme.Settings().textScale = 1.2 ns.Theme.Refresh() __units.raid1.hp = { __secret = true }");
  addon.fire("UNIT_HEALTH", "raid1");
  t = tile();
  expect([r3(t.size), t.text], "a text size change in a fight keeps the size until the fight ends; hidden health shows no number").toEqual([13.889, ""]);
  setCombat(addon, false);
  expect(r3(tile().onScreen), "then the text size applies (the smallest text is 12 at 120%)").toBe(12);
  addon.eval("ns.Theme.Settings().textScale = 1 ns.Theme.Refresh()");
  expect(fit(10).slice(0, 3), "back to 10 players: full size again").toEqual([10, 10, "CENTER"]);
  for (const look of ["dark", "class"]) {
    addon.eval(`VanguardDB.profiles.Default.RaidFrames.look = "${look}" ns.GetModule("RaidFrames").UpdateAll()`);
    expect(tile().line, `no top line in the ${look} look`).toBe(false);
  }
  const tall = loggedIn(UNITS_ENV + RAID_ENV, { savedVariables: "VanguardDB = { profiles = { Default = { RaidFrames = { height = 56 } } } }" });
  tall.eval('__spawn(1, "raid1")');
  expect(tall.eval(TILE_LOOK).size, "a taller tile: bigger missing-health text").toBe(12);
  const short = loggedIn(UNITS_ENV + RAID_ENV, { savedVariables: "VanguardDB = { profiles = { Default = { RaidFrames = { height = 36 } } } }" });
  short.eval('__spawn(1, "raid1")');
  expect(short.eval(TILE_LOOK).size, "a shorter one: never under the smallest text (10, #258)").toBe(10);
});

// TEST-ONLY: a client whose secure snippets fail to compile (the probe's call throws).
const NO_SNIPPETS = 'SecureHandlerExecute = function() error("TEST-ONLY: snippets do not compile") end\n';

// A raid button made the way the header would on a client without snippets (no init call).
const headerMakes = (addon, i, unit) => addon.eval(`local b = CreateFrame("Button", "Vanguard_RaidUnitButton${i}", Vanguard_Raid, "SecureUnitButtonTemplate") b:SetAttribute("unit", "${unit}") return b:GetName()`);

it("raid frames without secure snippets: the header copies the clicks; buttons are sized and set up out of combat", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + NO_SNIPPETS);
  expect(addon.eval("local h = Vanguard_Raid return { h:GetAttribute('initialConfigFunction') == nil, h:GetAttribute('_initialAttributeNames'), h:GetAttribute('_initialAttribute-*type1'), h:GetAttribute('_initialAttribute-*type2') }"),
    "no init snippet; the header's own attribute copy carries the clicks").toEqual([true, "*type1,*type2", "target", "togglemenu"]);
  headerMakes(addon, 1, "raid1");
  addon.eval('CreateFrame("Frame", "TESTONLY_NotAButton", Vanguard_Raid)');
  setCombat(addon, true);
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(addon.eval("return Vanguard_RaidUnitButton1.vgHeaderSetup == nil"), "in a fight the new button waits").toBe(true);
  setCombat(addon, false);
  const w = addon.eval('return ns.Settings("RaidFrames").width'), h = addon.eval('return ns.Settings("RaidFrames").height');
  expect(addon.eval("local b = Vanguard_RaidUnitButton1 return { b:GetWidth(), b:GetHeight(), b:GetAttribute('*type1'), b:GetAttribute('*type2'), b.health ~= nil }"),
    "after it, the button has its size, its clicks and the raid tile setup").toEqual([w, h, "target", "togglemenu", true]);
  expect(raidButton(addon, 1).name, "and shows its unit").toBe("TEST-ONLY Tank");
  expect(addon.eval("return TESTONLY_NotAButton.vgHeaderSetup == nil"), "a child that is not a unit button is left alone").toBe(true);
  addon.eval('__setups = 0 local RF = ns.GetModule("RaidFrames") local s = RF.Setup RF.Setup = function(...) __setups = __setups + 1 return s(...) end RF.SetupButtons()');
  expect(addon.eval("return __setups"), "a button is set up once").toBe(0);
});

it("raid frames with secure snippets keep the init snippet", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  expect(addon.eval('local h = Vanguard_Raid return { h:GetAttribute("initialConfigFunction") == ns.GetModule("RaidFrames").INIT, h:GetAttribute("_initialAttributeNames") == nil }'),
    "the snippet, and no attribute copy").toEqual([true, true]);
  headerMakes(addon, 1, "raid1");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(addon.eval("return Vanguard_RaidUnitButton1.vgHeaderSetup == nil"), "the module leaves set-up to the snippet").toBe(true);
});

// TEST-ONLY: logs what the raid header is told, in order (its attributes, the visibility driver, Show); the driver hides the header, as it does for a player who is not in a group.
const HEADER_LOG = `__log = {}
  local create, drive = CreateFrame, RegisterAttributeDriver
  CreateFrame = function(kind, name, ...)
    local f = create(kind, name, ...)
    if name == "Vanguard_Raid" then
      local set, show = f.SetAttribute, f.Show
      f.SetAttribute = function(self, k, v) __log[#__log + 1] = k .. "=" .. tostring(v) return set(self, k, v) end
      f.Show = function(self) __log[#__log + 1] = "show" return show(self) end
    end
    return f
  end
  RegisterAttributeDriver = function(f, attr, v)
    if f:GetName() == "Vanguard_Raid" then __log[#__log + 1] = "driver " .. attr f:Hide() end
    return drive(f, attr, v)
  end
  __wfgStub.transparent[CreateFrame] = true
`;

// The header's log split at its first Show: what came before, what came after, and how many Shows there were.
const splitAtShow = (addon) => {
  const log = addon.eval("return __log");
  const first = log.indexOf("show");
  return { before: log.slice(0, first), after: log.slice(first), shows: log.filter((entry) => entry === "show").length };
};

it("the raid header is configured before the first precreate shows it, and stays hidden if the driver hid it", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEADER_LOG);
  const { before, after, shows } = splitAtShow(addon);
  expect(["showRaid=true", "showParty=true", "showPlayer=true", "showSolo=false", "driver state-visibility", "groupBy=GROUP", "unitsPerColumn=5"].filter((entry) => !before.includes(entry)),
    "what the header shows, how it groups and the visibility driver are all set before the first Show").toEqual([]);
  expect([before[before.length - 1], after.slice(0, 2), shows], "then it is shown once, with the negative start index, and the index goes back to 1").toEqual(["startingIndex=-39", ["show", "startingIndex=1"], 1]);
  expect(addon.eval("return { Vanguard_Raid:GetAttribute('startingIndex'), Vanguard_Raid:IsShown() }"), "the header the driver hid stays hidden").toEqual([1, false]);
});

it("without snippets the header is configured before each precreate, and the one that shows it again leaves it as it was", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + NO_SNIPPETS + HEADER_LOG);
  const { before, after, shows } = splitAtShow(addon);
  expect([before.includes("showRaid=true"), before.includes("showPlayer=true"), before.includes("driver state-visibility"), shows], "configured before the first Show, which runs again once the probe says no snippets").toEqual([true, true, true, 2]);
  expect(after.lastIndexOf("show") > after.indexOf("_initialAttributeNames=*type1,*type2"), "the second Show comes after the header copies the clicks itself").toBe(true);
  expect(addon.eval("return { Vanguard_Raid:GetAttribute('startingIndex'), Vanguard_Raid:IsShown() }"), "start index back to 1, and still hidden").toEqual([1, false]);
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
  expect([addon.eval("return Vanguard_RaidUnitButton1.power.__value"), power.UnitPower, power.UnitPowerMax], "a power event: the power bar").toEqual([40, 1, 1]);
  expect({ ...power, UnitPower: 0, UnitPowerMax: 0 }, "only").toEqual(none(power));
  addon.eval('__units.raid1.role = "HEALER"');
  addon.fire("PLAYER_ROLES_ASSIGNED");
  const roles = counted(addon);
  expect([/RoleHealer$/.test(raidButton(addon, 1).role), roles.UnitGroupRolesAssigned], "roles assigned: the role mark on each tile").toEqual([true, 3]);
  expect({ ...roles, UnitGroupRolesAssigned: 0 }, "only").toEqual(none(roles));
  addon.eval("__units.target = __units.raid1");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect([counted(addon).SetBorder, isTok(addon, borderOf(addon, "Vanguard_RaidUnitButton1"), "accent")], "a new target: only the tile whose edge changes is repainted, in the accent").toEqual([1, true]);
  addon.eval("ns.Theme.Settings().accent = { 0.1, 0.2, 0.3, 1 } ns.Theme.Refresh()");
  expect(borderOf(addon, "Vanguard_RaidUnitButton1"), "the target's edge follows an accent change").toEqual([0.1, 0.2, 0.3, 1]);
  addon.eval("__units.raid1.hp = 0 __units.raid1.dead = true");
  addon.fire("UNIT_HEALTH", "raid1");
  expect([raidButton(addon, 1).status, counted(addon).GetRaidTargetIndex, addon.eval("return Vanguard_RaidUnitButton1.debuffRow.frame:IsShown()")],
    "a death refreshes the whole tile: Dead, the marks read again, the aura rows hidden").toEqual(["Dead", 1, false]);
});

it("raid bursts: a roster burst is one refresh of every tile; a new target repaints edges only", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + MARK_CALLS + "__members = 5 GetNumGroupMembers = function() return __members end");
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  addon.eval(`__updates = 0 local RF = ns.GetModule("RaidFrames") local update = RF.Update
    RF.Update = function(...) __updates = __updates + 1 return update(...) end`);
  addon.eval(COUNT_LUA);
  addon.eval('__units.raid1.name = "TEST-ONLY Renamed"');
  for (let i = 0; i < 20; i++) addon.fire("GROUP_ROSTER_UPDATE");
  expect([addon.eval("return __updates"), raidButton(addon, 1).name], "within the burst's frame, no tile is refreshed").toEqual([0, "TEST-ONLY Tank"]);
  addon.update(0);
  expect([addon.eval("return __updates"), counted(addon).GetRaidTargetIndex, raidButton(addon, 1).name], "the next frame: each tile once, its marks once, with the news").toEqual([3, 3, "TEST-ONLY Renamed"]);
  addon.update(0);
  expect(addon.eval("return __updates"), "and no more after").toBe(3);
  setCombat(addon, true);
  addon.eval("__members = 40");
  addon.eval("__scales = 0 local set = Vanguard_Raid.SetScale Vanguard_Raid.SetScale = function(...) __scales = __scales + 1 return set(...) end");
  for (let i = 0; i < 20; i++) addon.fire("GROUP_ROSTER_UPDATE");
  setCombat(addon, false);
  expect([addon.eval("return __scales"), addon.eval("return Vanguard_Raid:GetScale()")], "in combat the grid's fit waits once, not once per event, and fits the raid after").toEqual([1, 0.72]);
  addon.eval("__updates = 0 __units.target = __units.raid3");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect([addon.eval("return __updates"), counted(addon).SetBorder, isTok(addon, borderOf(addon, "Vanguard_RaidUnitButton3"), "accent")], "a new target: no tile refresh, one edge repainted").toEqual([0, 1, true]);
});

it("the hidden default raid frames are silenced", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + `CompactRaidFrameContainer:RegisterEvent("GROUP_ROSTER_UPDATE")
    CompactRaidFrameManager = CreateFrame("Frame", "CompactRaidFrameManager", UIParent) CompactRaidFrameManager:RegisterEvent("GROUP_ROSTER_UPDATE")`);
  expect(addon.eval(`local out = {} for _, f in ipairs({ CompactRaidFrameContainer, CompactRaidFrameManager }) do
    out[#out + 1] = { f:IsEventRegistered("GROUP_ROSTER_UPDATE"), f:GetParent():IsShown() } end return out`),
    "the manager and the container: hidden away, and no longer listening").toEqual([[false, false], [false, false]]);
});

it("raid tools: a burst of roster events in combat queues one update of the bar, not one per event", () => {
  const addon = loggedIn(UNITS_ENV + "IsInGroup = function() return true end IsInRaid = function() return __inRaid end UnitIsGroupLeader = function() return true end __inRaid = false");
  setCombat(addon, true);
  addon.eval("__inRaid = true __shows = 0 local show = Vanguard_RaidTools.SetShown Vanguard_RaidTools.SetShown = function(...) __shows = __shows + 1 return show(...) end");
  addon.fire("GROUP_ROSTER_UPDATE");
  const once = addon.eval("return ns.QueuedCount()");
  for (let i = 0; i < 39; i++) addon.fire("GROUP_ROSTER_UPDATE");
  expect(addon.eval("return ns.QueuedCount()"), "the waiting work is no more after 40 events than after one").toBe(once);
  setCombat(addon, false);
  expect([addon.eval("return __shows"), addon.eval("return Vanguard_RaidTools.actions.Raid:IsShown()")], "after the fight the bar is updated once, for the raid").toEqual([1, false]);
});

// TEST-ONLY: counts every attribute set on the raid header and its buttons from here on, so a test can show the preview never touches them.
const SECURE_WATCH = `__secureSets = 0
  for _, f in ipairs({ Vanguard_Raid, unpack(ns.GetModule("RaidFrames").buttons) }) do
    local set = f.SetAttribute f.SetAttribute = function(...) __secureSets = __secureSets + 1 return set(...) end
  end`;

// Preview tile i: shown, name, status, role texture, bar color, power shown and color, top line.
const previewTile = (addon, i) => addon.eval(`local b = Vanguard_RaidPreviewTile${i}
  return { shown = b:IsVisible(), name = b.name:GetText(), status = b.status:GetText(), role = b.role:IsShown() and b.role.__texture or false,
    bar = b.health.__barColor, value = b.health.__value, power = b.power:IsShown(), powerColor = b.power.__barColor, line = b.topLine:IsShown() }`);

// How many preview tiles are visible.
const shownTiles = (addon) => addon.eval("local n = 0 for _, b in ipairs(ns.RaidPreview.tiles) do if b:IsVisible() then n = n + 1 end end return n");

it("raid preview: sample players in the raid tiles, laid out by the raid frame settings, and the secure header left alone", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA);
  addon.eval('__spawn(1, "raid1")');
  addon.eval(SECURE_WATCH);
  addon.slash("preview party");
  expect([shownTiles(addon), chatHas(addon, /Vanguard:\S*\sRaid frames preview on, with sample players/)], "a party: five sample players, and chat says how it ends").toEqual([5, true]);
  const tank = previewTile(addon, 1);
  expect([tank.name, /Icons\\RoleTank$/.test(tank.role), tank.value, tank.status, tank.line], "the tank: name, shield, health, missing health, top line").toEqual(["Aldren", true, 2560, addon.eval("return '-' .. AbbreviateNumbers(1440)"), true]);
  expect(Math.abs(tank.bar[0] - addon.eval("return (ns.GetModule('RaidFrames').Soften(0.78, 0.61, 0.43))")) < 1e-6 && isTok(addon, tank.powerColor, "rage"), "softened class color as on a real tile; rage for a warrior").toBe(true);
  expect([previewTile(addon, 4).status, isTok(addon, previewTile(addon, 4).bar, "darkBar"), previewTile(addon, 5).status, previewTile(addon, 3).role], "one dead, one offline (dark bars); no mark for damage").toEqual(["Dead", true, "Offline", false]);
  // Preview tile i's rect on screen.
  const r = (i) => addon.frame(`Vanguard_RaidPreviewTile${i}`).rect;
  const holder = addon.frame("Vanguard_RaidHolder").rect;
  expect([r(1).width, r(1).height, r(2).bottom - r(1).top, r(1).bottom, r(1).left + r(1).width / 2], "100 x 48 tiles in a column growing up from the holder, 4 apart, centered on it").toEqual([100, 48, 4, holder.bottom, holder.left + holder.width / 2]);
  addon.slash("preview 40");
  expect([shownTiles(addon), addon.eval("return Vanguard_RaidPreview:GetScale()"), Math.round((r(6).bottom - r(1).top) * 1000) / 1000], "a raid of 40: drawn at 72%, groups stacked as rows (a bigger raid does)").toEqual([40, 0.72, 2.88]);
  addon.eval('ns.Options.Show("raid") __click("Width") __click("Sort by role") __click("Style")');
  expect([Math.round(r(1).width / 0.72), addon.eval("return { Vanguard_RaidPreviewTile1.name:GetText(), Vanguard_RaidPreviewTile4.name:GetText(), Vanguard_RaidPreviewTile5.name:GetText() }"), addon.eval("return Vanguard_Options.reload:IsShown()")],
    "a new width and sorting by role show at once (tanks first, then healers); the real frames wait for a reload").toEqual([120, ["Aldren", "Zelda", "Brielle"], true]);
  expect([isTok(addon, previewTile(addon, 1).bar, "darkBar"), previewTile(addon, 1).line], "a new style too").toEqual([true, false]);
  addon.eval('local s = VanguardDB.profiles.Default.RaidFrames s.layout = "rows" s.showPower = false RAID_CLASS_COLORS = nil ns.Theme.Refresh()');
  expect([r(2).bottom === r(1).bottom && r(2).left > r(1).right, r(6).bottom > r(1).top, previewTile(addon, 1).power], "groups as rows; the power bar off; redrawn on a theme change").toEqual([true, true, false]);
  expect(previewTile(addon, 1).name, "with no class colors the tiles still draw").toBe("Aldren");
  expect([addon.eval("return __secureSets"), addon.eval('return #ns.GetModule("RaidFrames").buttons'), raidButton(addon, 1).name], "the secure header and its buttons are never touched").toEqual([0, 1, "TEST-ONLY Tank"]);
  addon.eval('__click("Preview with sample players")');
  expect([shownTiles(addon), chatHas(addon, /Vanguard:\S*\sRaid frames preview off\.$/), addon.eval("return ns.RaidPreview.size")], "the options row steps from Raid (40) to Off").toEqual([0, true, 0]);
});

it("raid preview: a real group or combat ends it; it won't start in a group, in combat or with the raid frames off; not saved", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + "__grouped = false IsInGroup = function() return __grouped end");
  addon.slash("preview");
  expect(shownTiles(addon), "/vg preview with nothing after it: a raid of 10").toBe(10);
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(shownTiles(addon), "a roster event while you're still solo leaves it").toBe(10);
  addon.eval("__grouped = true");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect([shownTiles(addon), chatHas(addon, /Vanguard:\S*\sRaid frames preview off: you joined a group\.$/)], "a real group ends it").toEqual([0, true]);
  addon.slash("preview 25");
  expect([shownTiles(addon), chatHas(addon, /Vanguard:\S*\sYou're in a group: your real party or raid frames are showing\.$/)], "and it won't start in one").toEqual([0, true]);
  addon.eval("__grouped = false");
  addon.slash("preview 25");
  addon.fire("PLAYER_REGEN_DISABLED");
  expect([shownTiles(addon), chatHas(addon, /Vanguard:\S*\sRaid frames preview off: combat started\.$/)], "combat ends it").toEqual([0, true]);
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "and the real grid isn't re-anchored at that edge, before the lockdown").toEqual(["BOTTOMLEFT", "BOTTOM", -500, 344]);
  setCombat(addon, true);
  addon.slash("preview 10");
  expect([shownTiles(addon), chatHas(addon, /Vanguard:\S*\sIn combat\. Try the preview again once combat ends\.$/)], "and it won't start in combat").toEqual([0, true]);
  setCombat(addon, false);
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "it is fitted when the fight ends").toEqual(["BOTTOM", "BOTTOM", -240, 344]);
  addon.slash("preview 10");
  addon.slash("preview");
  expect([shownTiles(addon), chatHas(addon, /Vanguard:\S*\sRaid frames preview off\.$/)], "/vg preview again turns it off").toEqual([0, true]);
  addon.clearChat();
  addon.slash("preview off");
  addon.slash("preview 7");
  expect(Array.from(addon.chat()).map((l) => l.replace(/^.*Vanguard:\S*\s/, "")), "off when off says nothing; a size it doesn't offer gets the usage").toEqual(["Usage: /vg preview [party | 10 | 25 | 40 | off]"]);
  expect(addon.eval("return VanguardDB.profiles.Default.RaidFrames.preview == nil and ns.RaidPreview.size == 0"), "nothing saved: after a reload it starts off").toBe(true);
  const off = loggedIn(UNITS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { RaidFrames = false } } }" });
  off.slash("preview party");
  expect(chatHas(off, /Vanguard:\S*\sThe raid frames are off \(\/vg > Modules\), so there is nothing to preview\.$/), "with the raid frames off there is nothing to preview").toBe(true);
});

it("a softened bar is never brighter than the light name on it can be read against", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  // The relative luminance of an r, g, b list.
  const luma = (c) => addon.eval(`local RF = ns.GetModule("RaidFrames") return RF.Luminance(${c.join(", ")})`);
  // The softened r, g, b of an r, g, b list.
  const soft = (c) => addon.eval(`return { ns.GetModule("RaidFrames").Soften(${c.join(", ")}) }`);
  expect([luma([0, 0, 0]), luma([1, 1, 1])], "black is 0 and white is 1").toEqual([0, 1]);
  expect(luma([0.04, 0.04, 0.04]), "the dark end of the curve is linear").toBeCloseTo(0.04 / 12.92, 6);
  const priest = soft([1, 1, 1]);
  expect(Math.abs(luma(priest) - 0.3) < 0.01, "a white Priest is dimmed to about the cap, still a light gray").toBe(true);
  expect(priest[0] > 0.5 && Math.abs(priest[0] - priest[2]) < 0.02, "gray, not dark").toBe(true);
  const warrior = soft([0.78, 0.61, 0.43]);
  expect(luma(warrior) < 0.3, "a darker class is left as the plain mix").toBe(true);
});

it("raid frames: the indicators are named by where they sit, with a note, and their choices in sentence case", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA);
  addon.eval('ns.Options.Show("raid")');
  // Whether some font string on the page has this text.
  const has = (text) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
    if w.__kind == "FontString" and w:GetText() == ${JSON.stringify(text)} then return true end
  end return false`);
  expect(["Right edge, top", "Right edge, second", "Right edge, third"].map(has), "the three captions (each with its reload tag)").toEqual([true, true, true]);
  expect(has("Small icons down the right edge of each tile, under the missing-buff mark; on short tiles they continue in a column to the left."), "the note").toBe(true);
  expect(addon.eval('local out = {} for i, c in ipairs(ns.GetModule("RaidAuras").SOURCE_CHOICES) do out[i] = c[2] end return out'), "sentence case").toEqual(
    ["None", "External defensive", "Big defensive", "Important buff", "Your buffs", "Crowd control", "Dispellable debuff"]);
});
