// calm: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// The Calm HUD (Core/Visibility.lua): one switch that quiets the whole HUD out of combat, each
// part dimmed, faded away until the mouse is over it, or left as it is.

import { expect, it } from "vitest";
import { ACTIONS_ENV, DATA_ENV, STRIP_ENV, UNITS_ENV, loggedIn, setCombat } from "./helpers.mjs";

const ENV = UNITS_ENV + ACTIONS_ENV + STRIP_ENV + DATA_ENV;
const SWITCH = "Calm HUD: quiet the HUD out of combat until a fight, a hostile target or the mouse";
const DIM = "[combat] show; [harm,nodead] show; dim";
const HIDE = "[combat] show; [harm,nodead] show; fade";

// TEST-ONLY: runs the setter of the General page's row `label` (a check row's is its 4th field, a cycle's its 5th) with a Lua value.
const setRow = (addon, label, lua, field = 5) => addon.eval(`
  for _, p in ipairs(ns.Options.PAGES) do
    if p.key == "general" then
      for _, row in ipairs(p.rows()) do if row[2] == "${label}" then row[${field}](${lua}) return true end end
    end
  end
  return false`);

// Turns the Calm HUD on or off from its switch on the General page.
const calmOn = (addon, on = true) => setRow(addon, SWITCH, String(on), 4);

// A frame's Calm HUD: its state driver, its alpha to the hundredth, and whether it feels the mouse without taking clicks.
const calm = (addon, name) => addon.eval(`local f = ${name}
  return { state = f.__states and f.__states.vgvis or "none", alpha = math.floor(f:GetAlpha() * 100 + 0.5) / 100,
    feels = f.__mouseMotion == true and f.__mouseClick == false }`);

it("Calm HUD: one switch quiets the whole HUD out of combat, each part as its default, back for a fight or the mouse", () => {
  const addon = loggedIn(ENV);
  expect(["Vanguard_player", "Vanguard_PlayerAuras", "Vanguard_Minimap", "Vanguard_BrokerStrip"].map((f) => calm(addon, f).state), "off by default: no part is calm")
    .toEqual(["none", "none", "none", "none"]);
  expect(calm(addon, "Vanguard_Bar1"), "a bar keeps its own Always").toMatchObject({ state: "show", alpha: 1 });
  expect(calmOn(addon), "the General page has the switch").toBe(true);
  expect(addon.eval("return VanguardDB.profiles.Default.UnitFrames.calm"), "it is the Calm HUD's own setting").toBe(true);
  expect(calm(addon, "Vanguard_player"), "your frames dim, and keep their clicks").toEqual({ state: DIM, alpha: 0.35, feels: false });
  expect(calm(addon, "Vanguard_Bar1"), "the action bars dim").toMatchObject({ state: DIM, alpha: 0.35 });
  expect(addon.eval("return Vanguard_Bar1.__states.visibility"), "a dimmed bar stays shown, so its keys and clicks work").toBe("show");
  expect(calm(addon, "Vanguard_PlayerAuras"), "your buffs dim, and feel the mouse").toEqual({ state: DIM, alpha: 0.35, feels: true });
  expect(calm(addon, "Vanguard_InfoStrip"), "the info strip dims").toMatchObject({ state: DIM, alpha: 0.35 });
  expect(calm(addon, "Vanguard_BrokerStrip"), "the broker strip dims").toMatchObject({ state: DIM, alpha: 0.35 });
  expect(calm(addon, "Vanguard_xpbar"), "the XP bar hides until the mouse is over it").toMatchObject({ state: HIDE, alpha: 0 });
  expect(calm(addon, "Vanguard_Minimap"), "the minimap is left as it is").toEqual({ state: "none", alpha: 1, feels: false });
  addon.hover("Vanguard_PlayerAuras");
  expect(calm(addon, "Vanguard_PlayerAuras").alpha, "under the mouse a part is at full strength").toBe(1);
  addon.hover(null);
  expect(calm(addon, "Vanguard_PlayerAuras").alpha, "and quiet again when it leaves").toBe(0.35);
  addon.eval('Vanguard_Bar1:SetAttribute("state-vgvis", "show") Vanguard_xpbar:SetAttribute("state-vgvis", "show")');
  expect([calm(addon, "Vanguard_Bar1").alpha, calm(addon, "Vanguard_xpbar").alpha], "a fight or a hostile target: the client says show").toEqual([1, 1]);
});

it("Calm HUD: each part's choice applies at once, a part's own Visibility wins, and a change in combat waits", () => {
  const addon = loggedIn(ENV);
  calmOn(addon);
  expect(setRow(addon, "Action bars", '"hide"'), "the General page has a row per part").toBe(true);
  expect(calm(addon, "Vanguard_Bar1"), "Hide: the bar fades away until the mouse is over it").toMatchObject({ state: HIDE, alpha: 0 });
  setRow(addon, "Minimap", '"dim"');
  expect(calm(addon, "Vanguard_Minimap"), "Dim: the minimap dims, its holder feeling the mouse").toEqual({ state: DIM, alpha: 0.35, feels: true });
  setRow(addon, "Unit frames", '"leave"');
  expect(calm(addon, "Vanguard_player"), "Leave as is: your frames come back").toMatchObject({ state: "show", alpha: 1 });
  addon.eval('VanguardDB.profiles.Default.InfoStrip.visibility = "combat" ns.GetModule("InfoStrip").ApplyVisibility()');
  expect(calm(addon, "Vanguard_InfoStrip").state, "a strip shown In combat keeps its own setting").toBe("[combat] show; hide");
  setCombat(addon, true);
  calmOn(addon, false);
  expect(calm(addon, "Vanguard_Bar1").state, "switching it off in combat waits").toBe(HIDE);
  setCombat(addon, false);
  expect(["Vanguard_Bar1", "Vanguard_Minimap", "Vanguard_PlayerAuras", "Vanguard_xpbar"].map((f) => calm(addon, f)), "and brings every part back when the fight ends")
    .toEqual([{ state: "show", alpha: 1, feels: false }, { state: "show", alpha: 1, feels: true }, { state: "show", alpha: 1, feels: true }, { state: "show", alpha: 1, feels: false }]);
});

it("Calm HUD: a profile that had it on keeps it on your frames only, and your frames never fade away", () => {
  const before = loggedIn(ENV, { savedVariables: "VanguardDB.profiles.Default = { UnitFrames = { calm = true } }" });
  expect(before.eval("local s = VanguardDB.profiles.Default.UnitFrames return { s.calmFrames, s.calmBars, s.calmAuras, s.calmXP, s.calmMinimap }"), "the rest of the HUD is left as it is")
    .toEqual(["dim", "leave", "leave", "leave", "leave"]);
  expect([calm(before, "Vanguard_player").state, calm(before, "Vanguard_Bar1").state], "so only your frames dim").toEqual([DIM, "show"]);
  const picked = loggedIn(ENV, { savedVariables: 'VanguardDB.profiles.Default = { UnitFrames = { calm = true, calmBars = "dim", calmFrames = "hide" } }' });
  expect(picked.eval("return VanguardDB.profiles.Default.UnitFrames.calmBars"), "choices already made stay").toBe("dim");
  expect([calm(picked, "Vanguard_player").state, calm(picked, "Vanguard_Bar1").state], "Hide isn't a choice for your frames: left as they are").toEqual(["none", DIM]);
});

it("Calm HUD: a Versus deck turned on in a fight joins it when the fight ends", () => {
  const addon = loggedIn(ENV);
  calmOn(addon);
  setCombat(addon, true);
  addon.eval('local UF = ns.GetModule("UnitFrames") UF.settings.deck = true UF.ApplyDeck()');
  expect(addon.eval('return ns.GetModule("UnitFrames").deck == nil'), "nothing is built in the fight").toBe(true);
  setCombat(addon, false);
  expect(calm(addon, 'ns.GetModule("UnitFrames").deck').state, "built after it, and dimmed with your frames").toBe(DIM);
});
