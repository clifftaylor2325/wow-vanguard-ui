// fallbacks: what Vanguard does where a client lacks an API, a frame isn't
// laid out yet, or queued work fails. The headless client has these APIs and
// real layout, so each case takes one away.

import { expect, it } from "vitest";
import { expectErrors, loggedIn } from "./helpers.mjs";

it("without issecretvalue nothing is secret, and a failing after-combat update is reported while the rest run", () => {
  const addon = loggedIn("issecretvalue = nil");
  expectErrors("after-combat update: eval:2: TEST-ONLY boom");
  expect(addon.eval("return ns.IsSecret(5)")).toBe(false);
  addon.world.combat(true);
  addon.eval("ns.OutOfCombat(function() error('TEST-ONLY boom') end) ns.OutOfCombat(function() __ran = true end)");
  addon.clearChat();
  addon.world.combat(false);
  expect(addon.chat().join("\n")).toMatch(/after-combat update: .*TEST-ONLY boom/);
  expect(addon.eval("return __ran")).toBe(true);
});

it("the shared client-call helpers read nothing from a missing call or a hidden answer, and keep every value of a plain call", () => {
  const addon = loggedIn();
  addon.eval("__TwoValues = function() return 1, 2 end __Hidden = function() return __wfgWorld.secret(5) end");
  expect(addon.eval("return { ns.PlainCall('__NoSuchCall') == nil, ns.PlainCall('__Hidden') == nil }")).toEqual([true, true]);
  expect(addon.eval("return ns.PlainCall('__TwoValues')")).toBe(1);
  expect(addon.eval("return select('#', ns.CallGlobal('__TwoValues'))")).toBe(2);
});

it("ns.IsTrue passes only a plain true, and ns.PlainText only a plain non-empty string", () => {
  const addon = loggedIn();
  expect(addon.eval("return { ns.IsTrue(true), ns.IsTrue(__wfgWorld.secret(true)), ns.IsTrue(1) }")).toEqual([true, false, false]);
  expect(addon.eval('return { ns.PlainText("x"), ns.PlainText("") == nil, ns.PlainText(__wfgWorld.secret("x")) == nil }')).toEqual(["x", true, true]);
});

it("a mover dropped before the client has laid it out keeps the point the client reports", () => {
  const addon = loggedIn();
  addon.eval("ns.UnlockForEditMode()");
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
