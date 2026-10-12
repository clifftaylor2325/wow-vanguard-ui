// smoke: the Lua harness cases the pull-request gate runs (npm run
// test:quick, .github/workflows/verify.yml). The addon loads, logs in on a
// finished-setup account, draws its default layout, unlocks and locks its
// frames, plays a couple of seconds, and has caught no error: once as each
// client the TOC declares (WoW Forever 16001, Retail 120007), and once more
// with the client's secret geometry on through a fight. Every case also
// passes the harness's taint rules (scripts/lib/wow-taint.lua): no field
// stored on a game frame, no protected call blocked in combat. Anything
// deeper is the full suite (.github/workflows/full-suite.yml).

import { expect, it } from "vitest";
import { FOREVER_CLIENT, RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { chatHas, loggedIn } from "./helpers.mjs";

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

it("as a Retail 12.x client (interface 120007) it does the same", () => {
  const addon = loadAndPlay(RETAIL_CLIENT);
  addon.slash("status");
  expect(chatHas(addon, /Client Retail/), "it knows it is on Retail").toBe(true);
  expect(addon.eval("return ns.IsForever()"), "the Forever-only defaults stay off").toBe(false);
});

it("with secret geometry, through a fight with hidden numbers, nothing errors and nothing protected is touched", () => {
  const addon = loggedIn();
  addon.world.secretGeometry("strict");
  addon.world.setUnit("target", { name: "TEST-ONLY Boar", hp: addon.world.secret(640), maxhp: addon.world.secret(800), reaction: 2 });
  addon.world.combat(true);
  addon.world.setUnit("player", { hp: addon.world.secret(900), power: addon.world.secret(50) });
  addon.slash("unlock");
  addon.advance(2);
  addon.world.combat(false);
  addon.advance(1);
  expect(addon.eval("return #ns.errors"), "nothing caught by ns.Try").toBe(0);
  expect(addon.frame("Vanguard_target").visible, "the target frame shows a target with hidden numbers").toBe(true);
});
