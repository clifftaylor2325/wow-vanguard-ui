// smoke: the Lua harness cases of the fast local run (npm run test:quick,
// and the pre-push hook). The addon loads, logs in on a
// finished-setup account, draws its default layout, unlocks and locks its
// frames, plays a couple of seconds, and has caught no error: once as each
// client the TOC declares (WoW Forever 16001, Retail 120105), and once more
// as each client with the client's secret geometry on through a fight. Every case also
// passes the harness's taint rules (scripts/lib/wow-taint.lua): no field
// stored on a game frame, no protected call blocked in combat. Anything
// deeper is the full suite (.github/workflows/full-suite.yml).

import { expect, it } from "vitest";
import { FOREVER_CLIENT, RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { PLATE_ENV, UNITS_ENV, chatHas, loggedIn } from "./helpers.mjs";

// The frames the default layout always draws.
const DEFAULT_FRAMES = ["Vanguard_player", "Vanguard_Bar1", "Vanguard_Minimap"];

// Logs in as one client, checks the layout, unlocks and locks, plays two seconds; returns the addon.
function loadAndPlay(client) {
  const addon = loggedIn("", { client });
  expect(addon.screen().map((f) => f.name), "the default layout is drawn").toEqual(expect.arrayContaining(DEFAULT_FRAMES));
  addon.slash("unlock");
  expect(addon.frames("w.mover ~= nil and w:IsShown()").length, "unlock shows the movers").toBeGreaterThan(0);
  addon.slash("lock");
  expect(addon.frames("w.mover ~= nil and w:IsShown()").length, "lock hides them").toBe(0);
  addon.advance(2);
  expect(addon.eval("return #ns.errors"), "nothing caught by ns.Try").toBe(0);
  return addon;
}

it("the addon loads, logs in, unlocks and locks its frames, and catches no error", () => {
  const addon = loadAndPlay(FOREVER_CLIENT);
  addon.slash("status");
  expect(chatHas(addon, /Client WoW Forever/), "it knows it is on WoW Forever").toBe(true);
});

it("as a Retail 12.1.5 client (interface 120105) it does the same", () => {
  const addon = loadAndPlay(RETAIL_CLIENT);
  expect(addon.eval("return select(4, GetBuildInfo())"), "the client reports Retail's interface").toBe(120105);
  addon.slash("status");
  expect(chatHas(addon, /Client Retail/), "it knows it is on Retail").toBe(true);
  expect(addon.eval("return ns.IsForever()"), "the Forever-only defaults stay off").toBe(false);
});

// Logs in as one client and fights with secret geometry and hidden numbers; returns the addon.
function hiddenNumbersFight(client) {
  const addon = loggedIn("", { client });
  addon.world.secretGeometry("strict");
  addon.world.setUnit("target", { name: "TEST-ONLY Boar", hp: addon.world.secret(640), maxhp: addon.world.secret(800), reaction: 2 });
  addon.world.combat(true);
  addon.world.setUnit("player", { hp: addon.world.secret(900), power: addon.world.secret(50) });
  addon.slash("unlock");
  addon.advance(2);
  addon.world.combat(false);
  addon.advance(1);
  return addon;
}

// Nothing errored and the target frame showed its target, hidden numbers and all.
function expectCalmFight(addon) {
  expect(addon.eval("return #ns.errors"), "nothing caught by ns.Try").toBe(0);
  expect(addon.frame("Vanguard_target").visible, "the target frame shows a target with hidden numbers").toBe(true);
}

it("with secret geometry, through a fight with hidden numbers, nothing errors and nothing protected is touched", () => {
  expectCalmFight(hiddenNumbersFight(FOREVER_CLIENT));
});

it("as a Retail client, through the same fight with hidden numbers, nothing errors and nothing protected is touched", () => {
  expectCalmFight(hiddenNumbersFight(RETAIL_CLIENT));
});

// The safe mode a friend turns to when a module breaks the launch: every module off in the profile.
const ALL_OFF = `for _, name in ipairs(ns.ModuleNames()) do ns.SetModuleEnabled(name, false) end`;

it("with every module switched off the addon still logs in, opens its options and reports no error", () => {
  const addon = loggedIn(ALL_OFF);
  expect(addon.eval("local n = 0 for _, name in ipairs(ns.ModuleNames()) do if ns.GetModule(name).enabled then n = n + 1 end end return n"), "no module is built").toBe(0);
  addon.slash("");
  expect(addon.frame("Vanguard_Options").visible, "the options window opens").toBe(true);
  addon.slash("status");
  addon.slash("errors");
  addon.advance(2);
  expect(addon.eval("return #ns.errors"), "nothing caught by ns.Try").toBe(0);
});

// Logs in as one client inside an instance: an enemy plate and a friendly one dressed, then the client
// closes the friendly plate to addons (it keeps friendly plates for itself in an instance; a plate
// dressed outside comes back closed) and a fight runs with the scale check, aura refits and a theme refresh.
function forbiddenPlates(client) {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV, { client });
  for (const unit of ["nameplate1", "nameplate2"]) addon.fire("NAME_PLATE_UNIT_ADDED", unit);
  expect(addon.eval("return ns.FrameState('vgPlate')[__plates.nameplate2] ~= nil"), "the friendly plate was dressed outside").toBe(true);
  addon.eval("__wfgWorld.forbid(__plates.nameplate2)");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate3");
  addon.eval('__wfgWorld.combat(true) __plates.nameplate2:SetScale(0.6) __wfgStub.fire("UNIT_AURA", "nameplate2")');
  addon.advance(2);
  addon.eval("ns.Theme.Refresh() __wfgWorld.combat(false)");
  addon.advance(1);
  return addon;
}

it("in an instance with the friendly plates closed to addons, nothing errors and nothing closed is touched", () => {
  expect(forbiddenPlates(FOREVER_CLIENT).eval("return #ns.errors"), "nothing caught by ns.Try").toBe(0);
});

it("as a Retail client, with the friendly plates closed the same way, nothing errors", () => {
  expect(forbiddenPlates(RETAIL_CLIENT).eval("return #ns.errors"), "nothing caught by ns.Try").toBe(0);
});
