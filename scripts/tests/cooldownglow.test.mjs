// cooldownglow: the Cooldown Manager refresh-window glow (Modules/CooldownGlow.lua) in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, TOOLS_ENV, UNITS_ENV, chatHas, loggedIn } from "./helpers.mjs";

const ON = "VanguardDB.profiles = { Default = { CooldownGlow = { glow = true } } }";

// TEST-ONLY: the buff row's first item tracks aura 77 on the player.
const ITEM = "BuffIconCooldownViewer.items[1].auraInstanceID = 77\n";

// TEST-ONLY curves: a step curve, and a duration object that evaluates itself against one (a hidden answer with __hidden).
const CURVE_ENV = `
  Enum = Enum or {}
  Enum.LuaCurveType = { Step = 1 }
  C_CurveUtil.CreateCurve = function()
    local c = { pts = {} }
    function c:SetType(t) self.kind = t end
    function c:AddPoint(x, y) self.pts[#self.pts + 1] = { x = x, y = y } end
    function c:Evaluate(x) local y for _, p in ipairs(self.pts) do if p.x <= x then y = p.y end end return y end
    return c
  end
  local get = C_UnitAuras.GetAuraDuration
  C_UnitAuras.GetAuraDuration = function(unit, id)
    local d = get(unit, id)
    if d then function d:EvaluateRemainingPercent(curve)
      local y = curve:Evaluate(self:GetRemainingDuration() / self:GetTotalDuration())
      return __hidden and { __secret = true, n = y } or y
    end end
    return d
  end
`;

// The glow ring state of the buff row's first item: shown and its opacity.
const ring = (addon) => addon.eval("local g = ns.FrameState('vgGlow')[BuffIconCooldownViewer.items[1]] return g and { g[1]:IsShown(), g[1]:GetAlpha() } or false");

// Whether the ring is lit.
const lit = (addon) => { const r = ring(addon); return Boolean(r && r[0]); };

// A player buff of 20 seconds with `left` seconds still to run.
const buff = (addon, left) => {
  addon.world.addAura("player", { name: "TEST-ONLY Rejuvenation", duration: 20, auraInstanceID: 77 });
  addon.advance(20 - left);
};

it("cooldown glow: off by default, nothing looks at the buffs", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + ITEM);
  buff(addon, 2);
  addon.advance(1);
  expect([ring(addon), addon.eval("return ns.GetModule('CooldownGlow').ticker == nil")], "no ring, no timer").toEqual([false, true]);
});

it("cooldown glow: plain numbers light the ring under the share and put it out above it or when the aura ends", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + ITEM, { savedVariables: ON });
  buff(addon, 15);
  expect(lit(addon), "15 of 20 seconds left: dark").toBe(false);
  addon.advance(10);
  expect(lit(addon), "5 of 20 left (25 %): lit").toBe(true);
  addon.world.removeAura("player", "TEST-ONLY Rejuvenation");
  addon.advance(1);
  expect(lit(addon), "the aura gone: dark").toBe(false);
  addon.eval("BuffIconCooldownViewer.items[1].auraInstanceID = nil");
  addon.advance(1);
  expect(lit(addon), "an item with no aura: dark").toBe(false);
});

it("cooldown glow: secret times show no glow and no error; a hidden item has none", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + ITEM, { savedVariables: ON });
  addon.world.addAura("player", { name: "TEST-ONLY Hidden", duration: { __secret: true }, expirationTime: { __secret: true }, auraInstanceID: 77 });
  addon.advance(2);
  expect(lit(addon), "hidden times: no glow").toBe(false);
  addon.eval("BuffIconCooldownViewer.items[1].auraInstanceID = { __secret = true }");
  addon.advance(1);
  expect(lit(addon), "a hidden aura id: still no glow").toBe(false);
  addon.eval("C_UnitAuras.GetAuraDataByAuraInstanceID = nil");
  addon.advance(1);
  expect(lit(addon), "a client without aura data: no glow").toBe(false);
});

it("cooldown glow: where the client has curves, the duration object goes to the game and a hidden answer lights the ring", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + CURVE_ENV + ITEM, { savedVariables: ON });
  buff(addon, 15);
  expect(lit(addon), "above the share: curve says 0, ring dark").toBe(false);
  addon.advance(10);
  expect(ring(addon), "under the share: curve says 1, ring lit at full strength").toEqual([true, 1]);
  addon.eval("__hidden = true");
  addon.advance(1);
  expect(lit(addon), "a hidden answer is handed to the ring as it is").toBe(true);
  addon.eval("BuffIconCooldownViewer.items[1]:Hide()");
  addon.advance(1);
  expect(lit(addon), "a hidden item has no ring lit").toBe(false);
});

it("cooldown glow: a curve the client can't evaluate falls back to plain numbers", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + CURVE_ENV + ITEM + "Enum.LuaCurveType = nil\nC_UnitAuras.GetAuraDuration = nil", { savedVariables: ON });
  buff(addon, 5);
  addon.advance(1);
  expect(lit(addon), "plain numbers still light it").toBe(true);
  const none = loggedIn(UNITS_ENV + TOOLS_ENV + ITEM + "C_CurveUtil = nil", { savedVariables: ON });
  buff(none, 5);
  none.advance(1);
  expect(lit(none), "no curves: plain numbers").toBe(true);
});

it("cooldown glow: /vg cdmglow and the options switch it at once, and the share is kept to 10 to 60", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + ITEM + CLICK_LUA);
  buff(addon, 5);
  addon.slash("cdmglow on");
  expect([lit(addon), chatHas(addon, /Cooldown Manager glow on: under 30 percent left/)], "on lights it now").toEqual([true, true]);
  addon.slash("cdmglow 80");
  expect(addon.eval("return VanguardDB.profiles.Default.CooldownGlow.percent"), "the share stops at 60").toBe(60);
  addon.slash("cdmglow 1");
  expect(addon.eval("return VanguardDB.profiles.Default.CooldownGlow.percent"), "and at 10").toBe(10);
  addon.slash("cdmglow off");
  expect([lit(addon), chatHas(addon, /Cooldown Manager glow off/)], "off puts it out").toEqual([false, true]);
  addon.slash("cdmglow");
  expect(addon.eval("return ns.GetModule('CooldownGlow').settings.glow"), "no word toggles").toBe(true);
  addon.slash("");
  addon.eval('ns.Options.Show("tools")');
  addon.eval('__click("Glow a Cooldown Manager buff")');
  expect(addon.eval("return ns.GetModule('CooldownGlow').settings.glow"), "the options switch turns it off again").toBe(false);
});

it("cooldown glow: a client without timers or without the Cooldown Manager loads cleanly", () => {
  const plain = loggedIn(ITEM.replace(/.*/, "") + "C_Timer = nil", { savedVariables: ON });
  expect(plain.eval("return ns.GetModule('CooldownGlow').ticker == nil"), "no timer, no ticker, no error").toBe(true);
  const noTools = loggedIn("", { savedVariables: ON });
  expect(noTools.eval("return #ns.GetModule('CooldownGlow').Items()"), "no rows, no items").toBe(0);
});
