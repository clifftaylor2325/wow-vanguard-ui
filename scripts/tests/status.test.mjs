// status: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { RAID_ENV, UNITS_ENV, isTok, loggedIn, marks } from "./helpers.mjs";

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
  expect(addon.eval("return ForeverUI_RaidUnitButton3.__alphaFromBoolean.__secret"), "a hidden range goes to the client's alpha-from-boolean").toBe(true);
  addon.eval("ForeverUI_RaidUnitButton3.SetAlphaFromBoolean = false __wfgStub.advance(0.25)");
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
  addon.eval('ForeverUIDB.profiles.Default.RaidStatus.leader = false; ns.GetModule("RaidStatus").UpdateAll()');
  expect(marks(addon, 1).leader === false, "each mark can be turned off").toBeTruthy();
});

// TEST-ONLY counters for the range ticker: UnitInRange and UnitIsUnit calls, and each tile's SetAlpha calls.
const RANGE_COUNT = `__rangeCalls, __isUnitCalls, __alphaCalls = 0, 0, 0
  local inRange, isUnit = UnitInRange, UnitIsUnit
  UnitInRange = function(...) __rangeCalls = __rangeCalls + 1 return inRange(...) end
  UnitIsUnit = function(...) __isUnitCalls = __isUnitCalls + 1 return isUnit(...) end
  for i = 1, 3 do local b = _G["ForeverUI_RaidUnitButton" .. i] local set = b.SetAlpha b.SetAlpha = function(...) __alphaCalls = __alphaCalls + 1 return set(...) end end`;

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
  addon.eval("ForeverUI_Raid:Hide() __wfgStub.advance(1)");
  expect(rangeCalls(addon), "while the raid frames are hidden, no range checks at all").toEqual({ range: 0, isUnit: 0, alpha: 0 });
  addon.eval("ForeverUI_Raid:Show() __wfgStub.advance(0.25)");
  expect(rangeCalls(addon).range, "shown again, the checks resume").toBe(2);
});
