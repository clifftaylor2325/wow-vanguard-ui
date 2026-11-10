// bossspots: the two boss timer spots (Core/BossSpots.lua) in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, loggedIn } from "./helpers.mjs";

it("boss timer spots: two movable spots, always there, and nothing in another addon is touched", () => {
  const addon = loggedIn("DBT = { opts = {}, SetOption = function(self, k, v) self.opts[k] = v end } BigWigs = {}");
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = m.label end return { out.bossbars, out.bossbarssoon }"), "both spots move in unlock mode").toEqual(["Boss timers", "Boss timers, soon"]);
  expect(addon.eval("local x = Vanguard_bossbars:GetCenter() return math.floor(x - UIParent:GetCenter() + 0.5)"), "Boss timers sits right of center").toBe(360);
  expect(addon.eval("return next(DBT.opts) == nil"), "a boss mod's settings are never written").toBe(true);
  addon.slash("dock");
  expect(chatHas(addon, /Unknown command/), "/vg dock is retired").toBe(true);
});

it("boss timer spots: the Combat tools page says where they are, with or without a boss mod", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("tools")');
  expect(addon.eval('return __click("Line up boss mod bars") == true'), "no button writes another addon's bars").toBe(false);
  expect(addon.eval("return ns.GetModule('BossDocks') == nil"), "no module of that name").toBe(true);
});

it("boss timer spots: on a narrow canvas Boss timers stays on screen and left of the quest tracker's column; 1365 wide keeps its spot", () => {
  // Boss timers' rect on a w x h canvas, and the quest tracker's left edge there.
  const at = (w, h) => {
    const addon = loggedIn(`__wfgStub.setScreen(${w}, ${h})`);
    const r = addon.frame("Vanguard_bossbars").rect;
    return { left: r.left, right: r.left + r.width, bottom: r.bottom, tracker: addon.frame("Vanguard_QuestTracker").rect.left };
  };
  expect(at(1365, 768).left, "1365 wide: 360 right of the middle, as before").toBe(1365 / 2 + 260);
  for (const [w, h] of [[1229, 768], [1024, 768], [835, 668]]) {
    const r = at(w, h);
    expect([r.left >= 0, r.right <= r.tracker, r.bottom], `${w} x ${h}: on screen, left of the tracker, over the target of target`).toEqual([true, true, 304]);
  }
});
