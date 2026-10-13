// meter: Vanguard's own damage and healing meter (Modules/Meter.lua), in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, isTok, loggedIn } from "./helpers.mjs";

// TEST-ONLY: the client's damage meter enums (the world has the meter but not these), a warrior's class color.
const METER_ENV = `Enum.DamageMeterSessionType = { Current = 1 } Enum.DamageMeterType = { Dps = 1, Hps = 3 }
  RAID_CLASS_COLORS.WARRIOR = { r = 0.78, g = 0.61, b = 0.43 }\n`;
// A profile with the meter switched on.
const METER_ON = { savedVariables: "VanguardDB.profiles = { Default = { Meter = { on = true } } }" };

// Sets the meter's session to TEST-ONLY lines given as a Lua list expression, for the kind asked (any kind by default).
function setLines(addon, lines, kind = "nil") {
  addon.eval(`local list = ${lines}
    C_DamageMeter.GetCombatSessionFromType = function(session, what)
      if ${kind} == nil or what == ${kind} then return { combatSources = list } end
      return nil
    end`);
}

// The rows the player sees: [shown, name text, value text, bar value, bar max], top first.
const rows = (addon) => addon.eval(`local out = {}
  for i, row in ipairs(Vanguard_Meter.rows) do out[i] = { row:IsShown(), row.name.__text or false, row.value.__text or false, row.__value or false, row.__max or false } end
  return out`);

// The title's text and the "Nothing to show" note's visibility.
const heads = (addon) => addon.eval("return { Vanguard_Meter.title.__text, Vanguard_Meter.empty:IsShown() }");

it("the meter is off by default and /vg meter on shows it", () => {
  const addon = loggedIn(METER_ENV);
  setLines(addon, "{ { name = 'Tess', classFilename = 'WARRIOR', amountPerSecond = 300 } }");
  expect(addon.eval("return Vanguard_Meter == nil"), "off until you turn it on: not even built, so no mover").toBe(true);
  addon.slash("meter on");
  expect(addon.frame("Vanguard_Meter").visible, "on at once").toBe(true);
  expect(chatHas(addon, /Vanguard's meter is on, showing damage per second/), "chat says how it stands").toBe(true);
  addon.slash("meter dps");
  addon.slash("meter off");
  expect([addon.frame("Vanguard_Meter").visible, chatHas(addon, /Vanguard's meter is off/)], "and off again").toEqual([false, true]);
});

it("each line is a class-colored bar scaled to the top line, with a name and a short figure; yours is in the accent", () => {
  const addon = loggedIn(METER_ENV, METER_ON);
  setLines(addon, `{ { name = 'Tess', classFilename = 'WARRIOR', amountPerSecond = 12300, isLocalPlayer = true },
    { name = 'Bo', classFilename = 'NOPE', amountPerSecond = 6150, isLocalPlayer = false } }`);
  addon.advance(1);
  const seen = rows(addon);
  expect(seen.slice(0, 3), "two lines then an empty row").toEqual([[true, "Tess", "12.3K", 12300, 12300], [true, "Bo", "6.2K", 6150, 12300], [false, false, false, false, false]]);
  const warrior = addon.eval("return Vanguard_Meter.rows[1].__barColor");
  expect(warrior.slice(0, 3).map((c) => Math.round(c * 100)), "a known class in its color").toEqual([78, 61, 43]);
  expect(isTok(addon, addon.eval("return Vanguard_Meter.rows[2].__barColor"), "accent"), "the accent for an unknown class").toBe(true);
  expect(isTok(addon, addon.eval("return Vanguard_Meter.rows[1].name.__textColor"), "accent"), "your name in the accent").toBe(true);
  expect(isTok(addon, addon.eval("return Vanguard_Meter.rows[2].name.__textColor"), "text"), "another's in the text color").toBe(true);
});

it("the figures follow the fight, in combat too, and a fight with no damage still has a one-unit scale", () => {
  const addon = loggedIn(METER_ENV, METER_ON);
  setLines(addon, "{ { name = 'Tess', amountPerSecond = 0 } }");
  addon.advance(1);
  expect(rows(addon)[0].slice(3), "a zero top line scales to 1").toEqual([0, 1]);
  addon.world.combat(true);
  setLines(addon, "{ { name = 'Tess', amountPerSecond = 400 } }");
  addon.advance(1);
  expect([rows(addon)[0][2], addon.eval("return #ns.errors")], "read in combat, no error").toEqual(["400", 0]);
});

it("hidden figures go straight into the bars and texts and are never compared", () => {
  const addon = loggedIn(METER_ENV, METER_ON);
  setLines(addon, `{ { name = __wfgWorld.secret('Hidden'), classFilename = __wfgWorld.secret('MAGE'), amountPerSecond = __wfgWorld.secret(900), isLocalPlayer = __wfgWorld.secret(true) },
    { name = 'Plain', amountPerSecond = __wfgWorld.secret(450) } }`);
  addon.advance(1);
  expect(addon.eval("return #ns.errors"), "no error from any hidden field").toBe(0);
  const seen = rows(addon);
  expect([seen[0][0], seen[1][0]], "both lines are drawn").toEqual([true, true]);
  expect(addon.eval("return { issecretvalue(Vanguard_Meter.rows[1].__value), issecretvalue(Vanguard_Meter.rows[1].__max), issecretvalue(Vanguard_Meter.rows[1].name.__text) }"), "the hidden figure, the hidden scale and the hidden name were handed to the widgets as they are").toEqual([true, true, true]);
  expect(isTok(addon, addon.eval("return Vanguard_Meter.rows[1].__barColor"), "accent"), "a hidden class falls back to the accent").toBe(true);
});

it("a widget that refuses a hidden value leaves the row as it was, with no error", () => {
  const addon = loggedIn(METER_ENV, METER_ON);
  addon.eval("local row = Vanguard_Meter.rows[1] row.SetValue = function() error('refused') end row.name.SetText = function() error('refused') end");
  setLines(addon, "{ { name = 'Tess', amountPerSecond = 5 } }");
  addon.advance(1);
  expect([rows(addon)[0][0], addon.eval("return #ns.errors")], "the row is drawn, the refusals are not errors").toEqual([true, 0]);
});

it("a client without the meter, the kind or a readable list shows 'Nothing to show' and no error", () => {
  const addon = loggedIn(METER_ENV, METER_ON);
  addon.advance(1);
  expect(heads(addon), "no lines in the world's session").toEqual(["Damage per second", true]);
  setLines(addon, "{ { name = 'Tess', amountPerSecond = 1 } }");
  addon.advance(1);
  expect(heads(addon)[1], "lines: no note").toBe(false);
  addon.eval("C_DamageMeter.GetCombatSessionFromType = function() return __wfgWorld.secret(1) end");
  addon.advance(1);
  expect(heads(addon)[1], "a hidden session").toBe(true);
  addon.eval("C_DamageMeter.GetCombatSessionFromType = function() return { combatSources = __wfgWorld.secret(1) } end");
  addon.advance(1);
  expect(heads(addon)[1], "a hidden list").toBe(true);
  addon.eval("C_DamageMeter.GetCombatSessionFromType = function() error('no') end");
  addon.advance(1);
  expect(heads(addon)[1], "a call that errors counts as hidden").toBe(true);
  addon.eval("Enum.DamageMeterType.Dps = nil");
  addon.advance(1);
  expect(heads(addon)[1], "a client without the kind").toBe(true);
  addon.eval("C_DamageMeter = nil");
  addon.advance(1);
  expect([heads(addon)[1], addon.eval("return #ns.errors")], "a client without a meter").toEqual([true, 0]);
});

it("the title and /vg meter hps switch to healing and back; the lines come from that kind", () => {
  const addon = loggedIn(METER_ENV + CLICK_LUA, METER_ON);
  setLines(addon, "{ { name = 'Dmg', amountPerSecond = 10 } }", "1");
  addon.eval("local hps = C_DamageMeter.GetCombatSessionFromType local f = hps C_DamageMeter.GetCombatSessionFromType = function(s, what) if what == 3 then return { combatSources = { { name = 'Heal', amountPerSecond = 20 } } } end return f(s, what) end");
  addon.advance(1);
  expect([heads(addon)[0], rows(addon)[0][1]], "damage first").toEqual(["Damage per second", "Dmg"]);
  addon.eval("Vanguard_Meter.title:GetParent() local t for _, w in ipairs(__wfgStub.frames) do if w.__scripts and w.__scripts.OnClick and w == Vanguard_Meter.title:GetParent() then t = w end end t.__scripts.OnClick(t, 'LeftButton')");
  expect([heads(addon)[0], rows(addon)[0][1]], "a click on the title shows healing").toEqual(["Healing per second", "Heal"]);
  addon.slash("meter dps");
  expect([heads(addon)[0], rows(addon)[0][1]], "/vg meter dps goes back").toEqual(["Damage per second", "Dmg"]);
  addon.slash("meter hps");
  expect(heads(addon)[0], "/vg meter hps").toBe("Healing per second");
});

it("the lines setting limits the rows, and the switch and the options apply at once", () => {
  const addon = loggedIn(METER_ENV + CLICK_LUA);
  setLines(addon, "{ { name = 'A', amountPerSecond = 8 }, { name = 'B', amountPerSecond = 7 }, { name = 'C', amountPerSecond = 6 }, { name = 'D', amountPerSecond = 5 }, { name = 'E', amountPerSecond = 4 }, { name = 'F', amountPerSecond = 3 } }");
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Vanguard\'s own damage and healing meter")'), "the switch is on the meter's section").toBe(true);
  expect(addon.frame("Vanguard_Meter").visible, "on at once").toBe(true);
  expect(rows(addon).filter((r) => r[0]).length, "five lines by default").toBe(5);
  addon.eval("ns.GetModule('Meter').settings.rows = 3 ns.GetModule('Meter').Paint()");
  expect([rows(addon).filter((r) => r[0]).length, addon.eval("return Vanguard_Meter:GetHeight()")], "three lines, a shorter panel").toEqual([3, 16 + 3 * 17 + 1]);
});
