// range: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { ACTIONS_ENV, CLICK_LUA, button, isTok, loggedIn, pageBar1 } from "./helpers.mjs";

it("range tint", () => {
  const polled = loggedIn(ACTIONS_ENV + "C_ActionBar = nil IsActionInRange = function(slot) if slot == 1 then return false end if slot == 3 then return { __secret = true } end return true end");
  expect(isTok(polled, button(polled, 1, 1).color, "outOfRange"), "out of range tints red (asked directly on clients without range events)").toBeTruthy();
  expect(button(polled, 1, 3).color[0] === 0.4, "a secret range answer never tints red").toBeTruthy();
  const evented = loggedIn(ACTIONS_ENV + "__rangeSlots = {} C_ActionBar = { EnableActionRangeCheck = function(slot, on) __rangeSlots[slot] = on end }");
  expect(evented.eval("return __rangeSlots[1]") === true, "clients with range events are asked to watch each slot").toBeTruthy();
  evented.fire("ACTION_RANGE_CHECK_UPDATE", 1, false, true);
  expect(isTok(evented, button(evented, 1, 1).color, "outOfRange"), "ACTION_RANGE_CHECK_UPDATE out of range tints red").toBeTruthy();
  evented.fire("ACTION_RANGE_CHECK_UPDATE", 1, true, true);
  expect(button(evented, 1, 1).color[0] === 1, "back in range, back to normal").toBeTruthy();
  evented.fire("ACTION_RANGE_CHECK_UPDATE", 1, false, false);
  expect(button(evented, 1, 1).color[0] === 1, "an action without a range is never red").toBeTruthy();
});

it("range tint: a page change turns the old slot's watch off and does not keep its red", () => {
  const addon = loggedIn(ACTIONS_ENV + `__watching = {}
    C_ActionBar = { EnableActionRangeCheck = function(slot, on) __watching[slot] = (__watching[slot] or 0) + (on and 1 or -1) end }
    IsActionInRange = function(slot) return slot ~= 73 end`);
  // How many watches the client holds on bar 1 button 1's slots, page 1's and page 7's.
  const watching = () => addon.eval("return { __watching[1] or 0, __watching[73] or 0 }");
  // Whether bar 1 button 1's icon is tinted out of range.
  const red = () => isTok(addon, button(addon, 1, 1).color, "outOfRange");
  pageBar1(addon, 7);
  expect([red(), watching()], "page 7: slot 73 is out of range, red at once; slot 1 no longer watched").toEqual([true, [0, 1]]);
  pageBar1(addon, 1);
  expect(red(), "back on slot 1, in range: not red, with no range event").toBe(false);
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(watching(), "one watch per button, however often the buttons refresh").toEqual([1, 0]);
});

it("range tint: Red when out of range repaints the buttons at once, both ways", () => {
  const addon = loggedIn(ACTIONS_ENV + CLICK_LUA + "C_ActionBar = { EnableActionRangeCheck = function() end }");
  addon.fire("ACTION_RANGE_CHECK_UPDATE", 1, false, true);
  addon.eval('ns.Options.Show("actionbars")');
  addon.eval('__click("Red when out of range")');
  expect([addon.eval('return ns.GetModule("ActionBars").settings.rangeTint'), isTok(addon, button(addon, 1, 1).color, "outOfRange")], "unticked: saved, and the red is gone").toEqual([false, false]);
  addon.eval('__click("Red when out of range")');
  expect(isTok(addon, button(addon, 1, 1).color, "outOfRange"), "ticked again: red at once").toBe(true);
});
