// fallbacks: what ForeverUI does where a client lacks an API, a frame isn't
// laid out yet, or queued work fails. The headless client has these APIs and
// real layout, so each case takes one away.

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

it("without issecretvalue nothing is secret, and a failing after-combat update is reported while the rest run", () => {
  const addon = loggedIn("issecretvalue = nil");
  expect(addon.eval("return ns.IsSecret(5)")).toBe(false);
  addon.world.combat(true);
  addon.eval("ns.OutOfCombat(function() error('TEST-ONLY boom') end) ns.OutOfCombat(function() __ran = true end)");
  addon.clearChat();
  addon.world.combat(false);
  expect(addon.chat().join("\n")).toMatch(/after-combat update: .*TEST-ONLY boom/);
  expect(addon.eval("return __ran")).toBe(true);
});

it("a mover dropped before the client has laid it out keeps the point the client reports", () => {
  const addon = loggedIn();
  addon.eval("ns.Unlock(true)");
  const point = addon.eval(`local h for _, w in ipairs(__wfgStub.frames) do if w.mover then h = w break end end
    h.GetLeft = function() return nil end
    h:ClearAllPoints() h:SetPoint("CENTER", UIParent, "CENTER", 12, 34)
    h:GetScript("OnDragStop")(h)
    return { ns.MoverPoint(h.mover.key) }`);
  expect(point).toEqual(["CENTER", "CENTER", 12, 34]);
});

it("raid status reads nothing from a client without the API", () => {
  const addon = loggedIn("GetRaidTargetIndex = nil");
  expect(addon.eval('return ns.GetModule("RaidStatus").RaidIcon("player") == nil')).toBe(true);
});

it("the XP bar hides at the cap on a client with only IsXPUserDisabled, and with no XP to earn", () => {
  const addon = loggedIn("IsPlayerAtEffectiveMaxLevel = nil IsXPUserDisabled = function() return true end");
  expect(addon.eval('return ns.GetModule("DataBars").XP() == nil')).toBe(true);
  addon.eval("IsXPUserDisabled = function() return false end UnitXPMax = function() return 0 end");
  expect(addon.eval('return ns.GetModule("DataBars").XP() == nil')).toBe(true);
});
