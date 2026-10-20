// status: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { NO_RAID, RAID_ENV, UNITS_ENV, isTok, loggedIn, marks } from "./helpers.mjs";

// TEST-ONLY group status: raid icons, ready check, resurrection, leader, range.
const STATUS_ENV = `
  __status = { icon = { raid1 = 8 }, ready = {}, rez = {}, range = { raid1 = true, raid3 = false } }
  GetRaidTargetIndex = function(unit) return __status.icon[unit] end
  GetReadyCheckStatus = function(unit) return __status.ready[unit] end
  UnitHasIncomingResurrection = function(unit) return __status.rez[unit] == true end
  UnitIsGroupLeader = function(unit) return unit == "raid1" end
  UnitIsGroupAssistant = function(unit) return unit == "raid3" end
  UnitInRange = function(unit) return __status.range[unit], true end
`;

it("raid status marks", () => {
  const addon = loggedIn("C_Timer = nil " + UNITS_ENV + RAID_ENV + STATUS_ENV);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  const one = marks(addon, 1);
  expect(one.icon && one.icon[0] === 0.75 && one.icon[2] === 0.25, "the skull shows from the icon sheet's eighth cell").toBeTruthy();
  expect(/Icons\\Crown$/.test(one.leader) && /Textures\\Diamond$/.test(marks(addon, 3).leader), "leader crown and assistant diamond").toBeTruthy();
  expect(isTok(addon, one.leaderColor, "gold") && isTok(addon, marks(addon, 3).leaderColor, "text2") && one.leaderShadow === true, "in gold and text2, with a dark shadow under them").toBeTruthy();
  expect(marks(addon, 2).leader === false && marks(addon, 2).icon === false, "others get neither").toBeTruthy();
  expect(one.alpha === 1 && marks(addon, 3).alpha === 0.4 && marks(addon, 2).alpha === 1, "out of range fades; you never fade").toBeTruthy();
  addon.eval("__status.range.raid3 = true");
  addon.eval("__wfgStub.advance(0.25)");
  expect(marks(addon, 3).alpha === 1, "range is re-checked on a timer").toBeTruthy();
  addon.eval("__status.range.raid3 = { __secret = true }");
  addon.eval("__wfgStub.advance(0.25)");
  expect(addon.eval("return Vanguard_RaidUnitButton3.__alphaFromBoolean.__secret"), "a hidden range goes to the client's alpha-from-boolean").toBe(true);
  addon.eval("Vanguard_RaidUnitButton3.SetAlphaFromBoolean = false __wfgStub.advance(0.25)");
  expect(marks(addon, 3).alpha === 1, "a hidden range never fades on a client without alpha-from-boolean").toBeTruthy();
  expect(marks(addon, 1).status === true, "the status text shows while nothing covers the center").toBeTruthy();
  addon.eval('__status.ready = { raid1 = "ready", raid3 = "waiting" }');
  addon.fire("READY_CHECK");
  const ready = marks(addon, 1), waiting = marks(addon, 3);
  expect(/Icons\\Check$/.test(ready.ready) && isTok(addon, ready.readyColor, "good") && /Icons\\Waiting$/.test(waiting.ready) && isTok(addon, waiting.readyColor, "text2"), "ready check answers show in the theme's marks").toBeTruthy();
  expect(ready.status === false && waiting.status === false && marks(addon, 2).status === true, "the status text steps aside while the center mark shows").toBeTruthy();
  addon.eval('__status.ready.raid3 = "notready"');
  addon.fire("READY_CHECK_CONFIRM", "raid3");
  expect(/Icons\\Close$/.test(marks(addon, 3).ready) && isTok(addon, marks(addon, 3).readyColor, "bad"), "answers update").toBeTruthy();
  addon.fire("READY_CHECK_FINISHED");
  expect(marks(addon, 1).ready === false && marks(addon, 1).status === true, "and clear when the check ends (no timer on this client), the status text back").toBeTruthy();
  addon.eval("__status.rez.raid3 = true");
  addon.fire("INCOMING_RESURRECT_CHANGED", "raid3");
  expect(marks(addon, 3).rez === true && marks(addon, 1).rez === false && marks(addon, 3).status === false, "a resurrection on the way is marked, over the status text").toBeTruthy();
  addon.eval("__status.icon.raid1 = { __secret = true }");
  addon.fire("RAID_TARGET_UPDATE");
  expect(marks(addon, 1).icon === false, "a hidden raid icon shows nothing").toBeTruthy();
  addon.eval('VanguardDB.profiles.Default.RaidStatus.leader = false; ns.GetModule("RaidStatus").UpdateAll()');
  expect(marks(addon, 1).leader === false, "each mark can be turned off").toBeTruthy();
});

// TEST-ONLY: GUIDs by unit (UnitGUID), and an encounter that hides UnitIsUnit's answer.
const GUIDS = `UnitGUID = function(unit) local u = __units[unit] return u and "TEST-ONLY-GUID-" .. u.name end
  __status.range.raid2 = __wfgWorld.secret(false)`;
const HIDE_COMPARE = "UnitIsUnit = function() return __wfgWorld.secret(true) end";
// Tile 2's alpha, and whether it follows a hidden range.
const tile2 = (addon) => addon.eval("local b = Vanguard_RaidUnitButton2 return { alpha = b:GetAlpha(), follows = b.__alphaFromBoolean ~= nil }");
// A roster refresh in a fight: GROUP_ROSTER_UPDATE, then the queued update of every tile.
const rosterInFight = (addon) => { addon.world.combat(true); addon.fire("GROUP_ROSTER_UPDATE"); addon.eval("__wfgStub.advance(0.3)"); };

it("the Raid frames page's mark switches repaint the tiles at once", () => {
  const addon = loggedIn("C_Timer = nil " + UNITS_ENV + RAID_ENV + STATUS_ENV);
  addon.eval('__spawn(1, "raid1")');
  // Unticks the Raid frames page's row captioned `cap` through its own setter.
  const untick = (cap) => addon.eval(`for _, p in ipairs(ns.Options.PAGES) do if p.key == "raid" then
    for _, row in ipairs(p.rows()) do if row[2] == "${cap}" then row[4](false) end end end end`);
  untick("Raid target icons");
  untick("Leader and assistant marks");
  const after = marks(addon, 1);
  expect([after.icon, after.leader], "both marks go as they are unticked").toEqual([false, false]);
});

it("your own tile stays opaque when an encounter hides UnitIsUnit's answer on a roster refresh", () => {
  const addon = loggedIn("C_Timer = nil " + UNITS_ENV + RAID_ENV + STATUS_ENV + GUIDS);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2")');
  expect(tile2(addon).alpha, "you never fade").toBe(1);
  addon.eval(HIDE_COMPARE);
  rosterInFight(addon);
  expect(tile2(addon), "your GUID still says it is you: no fade from a hidden range").toEqual({ alpha: 1, follows: false });
  addon.world.combat(false);
});

it("a tile whose token now names someone else fades by range again, even while UnitIsUnit is hidden", () => {
  const addon = loggedIn("C_Timer = nil " + UNITS_ENV + RAID_ENV + STATUS_ENV + GUIDS);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2")');
  addon.eval(HIDE_COMPARE + ' __units.raid2 = { name = "TEST-ONLY Moved Up", hp = 500, maxhp = 1000, power = 0, maxpower = 0, ptype = "MANA", player = true, class = "MAGE" }');
  rosterInFight(addon);
  expect(tile2(addon).follows, "raid2 is another member now: its tile follows the hidden range").toBe(true);
  addon.world.combat(false);
});

it("with UnitIsUnit and the GUIDs both hidden, a tile is not taken for you", () => {
  const addon = loggedIn("C_Timer = nil " + UNITS_ENV + RAID_ENV + STATUS_ENV + GUIDS);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2")');
  addon.eval(HIDE_COMPARE + " UnitGUID = function() return __wfgWorld.secret('g') end");
  rosterInFight(addon);
  expect(tile2(addon).follows, "nothing plain says who it is: no remembered answer").toBe(true);
  addon.world.combat(false);
});

// TEST-ONLY counters for the range ticker: UnitInRange and UnitIsUnit calls, and each tile's SetAlpha calls.
const RANGE_COUNT = `__rangeCalls, __isUnitCalls, __alphaCalls = 0, 0, 0
  local inRange, isUnit = UnitInRange, UnitIsUnit
  UnitInRange = function(...) __rangeCalls = __rangeCalls + 1 return inRange(...) end
  UnitIsUnit = function(...) __isUnitCalls = __isUnitCalls + 1 return isUnit(...) end
  for i = 1, 3 do local b = _G["Vanguard_RaidUnitButton" .. i] local set = b.SetAlpha b.SetAlpha = function(...) __alphaCalls = __alphaCalls + 1 return set(...) end end`;

// The range ticker's calls since the last look (then forgets them): { range, isUnit, alpha }.
const rangeCalls = (addon) => addon.eval("local c = { range = __rangeCalls, isUnit = __isUnitCalls, alpha = __alphaCalls } __rangeCalls, __isUnitCalls, __alphaCalls = 0, 0, 0 return c");

it("range ticker: only while the raid frames show, no repeat questions, no repaint when nothing changed", () => {
  const addon = loggedIn("C_Timer = nil " + UNITS_ENV + RAID_ENV + STATUS_ENV);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  addon.eval(RANGE_COUNT);
  addon.eval("__wfgStub.advance(0.25)");
  expect(rangeCalls(addon), "a tick asks the range of the two others, never asks again who you are, and repaints nothing unchanged").toEqual({ range: 2, isUnit: 0, alpha: 0 });
  addon.eval("__status.range.raid1 = false __wfgStub.advance(0.25)");
  expect([rangeCalls(addon).alpha, marks(addon, 1).alpha], "a change of range repaints that tile only").toEqual([1, 0.4]);
  addon.eval("Vanguard_Raid:Hide() __wfgStub.advance(1)");
  expect(rangeCalls(addon), "while the raid frames are hidden, no range checks at all").toEqual({ range: 0, isUnit: 0, alpha: 0 });
  addon.eval("Vanguard_Raid:Show()");
  rangeCalls(addon); // the tiles repaint as they come back into view
  addon.eval("__wfgStub.advance(0.25)");
  expect(rangeCalls(addon).range, "shown again, the checks resume").toBe(2);
});

it("range ticker: with the raid frames off there is no header to follow, so no range job runs", () => {
  const addon = loggedIn("", NO_RAID);
  expect(addon.eval('return { ns.GetModule("RaidStatus").enabled == true, ns.ticker.vgJobs["raid range"] ~= nil }'), "raid status on, no range job").toEqual([true, false]);
});

it("ready check: a new check started while the last one's answers linger keeps its answers up", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + STATUS_ENV);
  addon.eval('__spawn(1, "raid1"); __spawn(3, "raid3")');
  addon.eval('__status.ready = { raid1 = "ready", raid3 = "ready" }');
  addon.fire("READY_CHECK");
  addon.fire("READY_CHECK_FINISHED");
  addon.eval("__wfgStub.advance(2)");
  expect(marks(addon, 1).ready !== false, "the answers linger after the check ends").toBe(true);
  addon.eval('__status.ready = { raid1 = "ready", raid3 = "waiting" }');
  addon.fire("READY_CHECK");
  addon.eval("__wfgStub.advance(5)");
  expect([/Icons\\Waiting$/.test(marks(addon, 3).ready), marks(addon, 3).status], "the old check's timer doesn't clear the new check").toEqual([true, false]);
  addon.fire("READY_CHECK_FINISHED");
  addon.eval("__wfgStub.advance(6.5)");
  expect([marks(addon, 3).ready, marks(addon, 3).status], "the new check's answers go a few seconds after it ends").toEqual([false, true]);
});
