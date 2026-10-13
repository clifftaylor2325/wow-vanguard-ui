// docks: boss mod docks (Modules/BossDocks.lua) in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY Deadly Boss Mods bars: every setting DBM is given is recorded.
const DBM_ENV = `
  DBT = { opts = {} }
  function DBT:SetOption(key, value) self.opts[key] = value end
  function DBT:Rearrange() self.rearranged = true end
`;

it("boss docks: two movable spots, and /vg dock lines up DBM's bars with them", () => {
  const addon = loggedIn(DBM_ENV);
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = m.label end return { out.bossbars, out.bossbarssoon }"), "both spots move in unlock mode").toEqual(["Boss timers", "Boss timers, soon"]);
  const spot = addon.eval("local x, y = ns.GetModule('BossDocks').Offset(Vanguard_bossbars) return { x, y }");
  expect(spot[0], "Boss timers sits right of center").toBe(360);
  addon.slash("dock");
  const opts = addon.eval("return DBT.opts");
  expect([opts.TimerPoint, opts.TimerX, opts.TimerY, opts.HugeTimerPoint, addon.eval("return DBT.rearranged")], "DBM's normal bars on Boss timers, then placed again").toEqual(["CENTER", spot[0], spot[1], "CENTER", true]);
  expect(addon.eval("local x, y = ns.GetModule('BossDocks').Offset(Vanguard_bossbarssoon) return { DBT.opts.HugeTimerX == x, DBT.opts.HugeTimerY == y }"), "its big bars on Boss timers, soon").toEqual([true, true]);
  expect(chatHas(addon, /Lined up Deadly Boss Mods' bars/), "and says so").toBe(true);
  addon.eval("DBT.opts = {}");
  setCombat(addon, true);
  addon.slash("dock");
  expect([addon.eval("return next(DBT.opts) == nil"), chatHas(addon, /After the fight/)], "nothing moves in combat").toEqual([true, true]);
});

it("boss docks: BigWigs gets directions, neither loaded says so, and the module off says so", () => {
  const bigwigs = loggedIn("BigWigs = {}");
  bigwigs.slash("dock");
  expect([chatHas(bigwigs, /BigWigs: drag its normal bars' anchor to Boss timers \(360, -?\d+ from the middle of the screen\)\./), chatHas(bigwigs, /emphasized bars' anchor to Boss timers, soon/)], "where to drag each kind").toEqual([true, true]);
  const none = loggedIn();
  none.slash("dock");
  expect(chatHas(none, /Neither Deadly Boss Mods nor BigWigs is loaded\./), "neither").toBe(true);
  const off = loggedIn(DBM_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { BossDocks = false } } }" });
  off.slash("dock");
  expect([chatHas(off, /boss docks are off/), off.eval("return next(DBT.opts) == nil")], "module off").toEqual([true, true]);
  const old = loggedIn("DBT = { opts = {}, SetOption = function(self, k, v) self.opts[k] = v end }");
  old.slash("dock");
  expect(old.eval("return DBT.opts.TimerPoint"), "a DBM without Rearrange still takes the settings").toBe("CENTER");
});

it("boss docks: the options button shows only while a boss mod is loaded", () => {
  const without = loggedIn(CLICK_LUA);
  without.eval('ns.Options.Show("tools")');
  expect(without.eval('return __click("Line up boss mod bars") == true'), "no boss mod: no button").toBe(false);
  const withDbm = loggedIn(CLICK_LUA + DBM_ENV);
  withDbm.eval('ns.Options.Show("tools")');
  withDbm.eval('__click("Line up boss mod bars")');
  expect(withDbm.eval("return DBT.opts.TimerPoint"), "the button docks DBM's bars").toBe("CENTER");
});
