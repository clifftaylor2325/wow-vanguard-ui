// fights: Fight history (Modules/FightHistory.lua), your DPS in each fight this session, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, isTok, loggedIn } from "./helpers.mjs";

// TEST-ONLY: the client's damage meter enums (the world has the meter but not these).
const METER_ENV = "Enum.DamageMeterSessionType = { Current = 1 } Enum.DamageMeterType = { Dps = 1 }\n";
// A profile with the strip switched on.
const STRIP_ON = { savedVariables: "ForeverUIDB.profiles = { Default = { FightHistory = { strip = true } } }" };

// The meter's session for a TEST-ONLY fight: you at `dps` (a Lua expression) in place `place` of `n`, lasting `seconds`.
function setFight(addon, dps, seconds, place = 1, n = 1) {
  addon.eval(`local src = {} for i = 1, ${n} do src[i] = { isLocalPlayer = false, amountPerSecond = 1 } end
    src[${place}] = { isLocalPlayer = true, amountPerSecond = ${dps} }
    __wfgWorld.damageSession = { combatSources = src, durationSeconds = ${seconds} }`);
}

// One whole TEST-ONLY fight: in, out, and the meter read half a second later.
function fight(addon, dps, seconds, place, n) {
  addon.world.combat(true);
  setFight(addon, dps, seconds, place, n);
  addon.world.combat(false);
  addon.advance(1);
}

// The fights recorded, oldest first, as [duration, dps, rank, sources] (false for none; an empty Lua table comes back as {}).
const fights = (addon) => {
  const list = addon.eval(`local out = {}
    for i, f in ipairs(ns.GetModule("FightHistory").fights) do out[i] = { f.duration, f.dps or false, f.rank or false, f.sources or false } end
    return out`);
  return Array.isArray(list) ? list : [];
};

// The default tooltip: shown, its anchor, and its lines as [left, right].
const tooltip = (addon) => addon.eval(`local tt, lines = GameTooltip, {}
  for i, l in ipairs(tt.__lines or {}) do lines[i] = { l.text, l.right or false } end
  return { tt:IsShown(), tt.__anchor or false, lines }`);

// Each bar: [shown, height, its vertex colour].
const barsOf = (addon) => addon.eval(`local out = {}
  for i, b in ipairs(ForeverUI_FightHistory.bars) do out[i] = { b:IsShown(), b:GetHeight(), b.__vertexColor or false } end
  return out`);

it("a fight is recorded half a second after combat ends, with its length, your DPS, place and the list's size", () => {
  const addon = loggedIn(METER_ENV);
  addon.world.combat(true);
  setFight(addon, 412, 83, 2, 5);
  addon.world.combat(false);
  const ended = addon.eval("return GetTime()");
  addon.advance(0.25);
  expect(fights(addon), "not before the meter has finished the fight").toEqual([]);
  addon.advance(0.5);
  expect(fights(addon), "83 s, 412 dps, second of five").toEqual([[83, 412, 2, 5]]);
  expect(addon.eval("return ns.GetModule('FightHistory').fights[1].at"), "read half a second after the fight ended").toBe(ended + 0.5);
});

it("20 fights at most: the oldest goes", () => {
  const addon = loggedIn(METER_ENV);
  for (let i = 1; i <= 21; i++) fight(addon, i * 10, 30);
  const kept = fights(addon);
  expect([kept.length, kept[0][1], kept[19][1]], "fights 2 to 21").toEqual([20, 20, 210]);
});

it("a hidden DPS is kept as an empty slot, and the tallest bar ignores it", () => {
  const addon = loggedIn(METER_ENV, STRIP_ON);
  fight(addon, 100, 30);
  fight(addon, "__wfgWorld.secret(900)", 30);
  fight(addon, 50, 30, 0, 2);
  expect(fights(addon), "a hidden figure, then a fight you weren't listed in: both counted").toEqual([[30, 100, 1, 1], [30, false, 1, 1], [30, false, false, false]]);
  expect([addon.eval("return ns.GetModule('FightHistory').Peak()"), addon.eval("return #ns.errors")], "the peak is the plain 100, no error").toEqual([100, 0]);
  expect(barsOf(addon).slice(0, 4).map((b) => b[0]), "the hidden fights draw empty slots").toEqual([true, false, false, false]);
});

it("fights under two seconds, hidden lengths and fights in combat are skipped", () => {
  const addon = loggedIn(METER_ENV);
  fight(addon, 100, 1.5);
  fight(addon, 100, "__wfgWorld.secret(30)");
  expect(fights(addon), "too short, and a length the client hides").toEqual([]);
  addon.world.combat(true);
  setFight(addon, 100, 30);
  addon.advance(2);
  expect(fights(addon), "nothing is read in combat").toEqual([]);
  addon.world.combat(false);
  addon.world.combat(true);
  addon.advance(1);
  expect(fights(addon), "a new pull before the read: nothing is read in that one either").toEqual([]);
  addon.world.combat(false);
  addon.world.combat(true);
  addon.world.combat(false);
  addon.advance(1);
  expect(fights(addon), "two ends of combat within half a second: one read").toEqual([[30, 100, 1, 1]]);
});

it("the strip is off by default; switched on, the latest bar is in the accent and heights follow the DPS", () => {
  const addon = loggedIn(METER_ENV + CLICK_LUA);
  fight(addon, 200, 30);
  fight(addon, 100, 30);
  expect(addon.frame("ForeverUI_FightHistory").visible, "off until you turn it on, though the fights are kept").toBe(false);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Sparkline of your DPS in the last 20 fights")'), "the switch is on the strip's section").toBe(true);
  expect(addon.frame("ForeverUI_FightHistory").visible, "on at once").toBe(true);
  const bars = barsOf(addon);
  expect(bars.slice(0, 3).map((b) => [b[0], b[1]]), "the 200 fight is 10 tall, the 100 one 5; no third").toEqual([[true, 10], [true, 5], [false, 0]]);
  expect([isTok(addon, bars[0][2], "muted"), isTok(addon, bars[1][2], "accent")], "the latest in the accent, the rest muted").toEqual([true, true]);
  addon.slash("accent fel");
  expect(isTok(addon, barsOf(addon)[1][2], "accent"), "a new accent repaints it").toBe(true);
  fight(addon, 0, 30);
  expect(barsOf(addon)[2][1] > 0 && barsOf(addon)[2][1] < 1, "a fight with no damage still shows a one-pixel bar").toBe(true);
});

it("the strip's visibility setting hides it, and an empty history shows nothing", () => {
  const addon = loggedIn(METER_ENV, STRIP_ON);
  expect(addon.frame("ForeverUI_FightHistory").visible, "no fights yet: no empty box").toBe(false);
  fight(addon, 100, 30);
  expect(addon.frame("ForeverUI_FightHistory").visible, "a fight: it shows").toBe(true);
  addon.eval("local FH = ns.GetModule('FightHistory') FH.settings.visibility = 'hidden' FH.ApplyVisibility()");
  expect(addon.frame("ForeverUI_FightHistory").visible, "Hidden hides it").toBe(false);
});

it("the tooltip and /fui fights list the fights, newest first", () => {
  const addon = loggedIn(METER_ENV, STRIP_ON);
  addon.slash("fights");
  expect(chatHas(addon, /No fights recorded this session yet\./), "none yet").toBe(true);
  fight(addon, 412, 83, 2, 5);
  fight(addon, "__wfgWorld.secret(1)", 9);
  fight(addon, 1500, 125, 1, 1);
  addon.hover("ForeverUI_FightHistory");
  expect(tooltip(addon), "a title, then the fights").toEqual([true, "ANCHOR_TOP", [["Fight history", false], ["#1  2:05", "1.5K dps"], ["#2  0:09", "no dps"], ["#3  1:23", "412 dps  #2 of 5"]]]);
  expect(addon.eval("return ForeverUI_FightHistory.wash:IsShown()"), "a hover wash while the mouse is over it").toBe(true);
  addon.hover(null);
  expect([tooltip(addon)[0], addon.eval("return ForeverUI_FightHistory.wash:IsShown()")], "both go with the mouse").toEqual([false, false]);
  addon.slash("fights");
  const lines = addon.chat().slice(-4).map((l) => l.replace(/^.*?: /, ""));
  expect(lines.some((l) => /#1 {2}2:05 {2}1\.5K dps$/.test(l)) && lines.some((l) => /#3 {2}1:23 {2}412 dps {2}#2 of 5$/.test(l)), "/fui fights prints the same lines").toBe(true);
});

it("a client without the damage meter: the module loads, records nothing and shows nothing", () => {
  const addon = loggedIn("C_DamageMeter = nil", STRIP_ON);
  fight(addon, 100, 30);
  expect([fights(addon), addon.frame("ForeverUI_FightHistory").visible, addon.eval("return #ns.errors")]).toEqual([[], false, 0]);
});

it("a client without timers reads the fight as combat ends", () => {
  const addon = loggedIn(METER_ENV + "C_Timer = nil");
  addon.world.combat(true);
  setFight(addon, 100, 30);
  addon.world.combat(false);
  expect(fights(addon)).toEqual([[30, 100, 1, 1]]);
});
