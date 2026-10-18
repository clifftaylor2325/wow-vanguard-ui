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

// The title's text and the "No damage yet this fight" note's visibility.
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
  expect(seen.slice(0, 3), "two lines then an empty row").toEqual([[true, "Tess", "12.3K", 12300, 12300], [true, "Bo", "6.15K", 6150, 12300], [false, false, false, false, false]]);
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
  expect(rows(addon)[0][2], "zero shows as 0").toBe("0");
  setLines(addon, "{ { name = 'Tess', amountPerSecond = 0.31 } }");
  addon.advance(1);
  expect(rows(addon)[0].slice(2), "a lone small figure still fills its bar").toEqual(["0.31", 0.31, 0.31]);
  setLines(addon, "{ { name = 'Tess', amountPerSecond = 2.5263157894737 }, { name = 'Bo', amountPerSecond = 1500000 } }");
  addon.advance(1);
  expect(rows(addon).slice(0, 2).map((r) => r[2]), "rounded to two decimals, no trailing zeros").toEqual(["2.53", "1.5M"]);
  setLines(addon, "{ { name = 'Tess', amountPerSecond = 0 } }");
  addon.advance(1);
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

it("a client without the meter, the kind or a readable list shows the empty-state line and no error", () => {
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
  expect(addon.eval("return Vanguard_Meter.empty.__text"), "the empty-state line follows the kind").toBe("No healing yet this fight");
});

it("the lines setting limits the rows, and the switch and the options apply at once", () => {
  const addon = loggedIn(METER_ENV + CLICK_LUA);
  setLines(addon, "{ { name = 'A', amountPerSecond = 8 }, { name = 'B', amountPerSecond = 7 }, { name = 'C', amountPerSecond = 6 }, { name = 'D', amountPerSecond = 5 }, { name = 'E', amountPerSecond = 4 }, { name = 'F', amountPerSecond = 3 } }");
  addon.slash("");
  addon.eval('ns.Options.Show("tools")');
  expect(addon.eval('return __click("Vanguard\'s own damage and healing meter")'), "the switch is on the meter's section").toBe(true);
  expect(addon.frame("Vanguard_Meter").visible, "on at once").toBe(true);
  expect(rows(addon).filter((r) => r[0]).length, "every line the fight has, up to eight by default").toBe(6);
  addon.eval("ns.GetModule('Meter').settings.rows = 3 ns.GetModule('Meter').Paint()");
  const head = addon.eval("local T = ns.Theme return T.SPACE.gap + T.CONTROL_H");
  expect([rows(addon).filter((r) => r[0]).length, addon.eval("return Vanguard_Meter:GetHeight()")], "three lines, a shorter panel: the title's room (a gap and a control's height), three bars with their gaps, one more gap").toEqual([3, head + 3 * 19 + 1]);
});

it("a line that is hidden or not a table is skipped, and a switched-off meter reads nothing", () => {
  const addon = loggedIn(METER_ENV, METER_ON);
  setLines(addon, "{ __wfgWorld.secret(1), 7, { name = 'Tess', amountPerSecond = 5 } }");
  addon.advance(1);
  expect(rows(addon).slice(0, 3).map((r) => r[0]), "the two unusable lines draw nothing, no error").toEqual([false, false, true]);
  expect(addon.eval("return #ns.errors"), "no error").toBe(0);
  addon.eval("__reads = 0 local get = C_DamageMeter.GetCombatSessionFromType C_DamageMeter.GetCombatSessionFromType = function(...) __reads = __reads + 1 return get(...) end");
  addon.slash("meter off");
  addon.advance(2);
  expect(addon.eval("return __reads"), "off: the game's meter is not asked").toBe(0);
});

it("with the Meter module switched off, /vg meter says so instead of failing", () => {
  const addon = loggedIn(METER_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Meter = false } } }" });
  addon.slash("meter on");
  expect([chatHas(addon, /meter is switched off under Modules/), addon.eval("return #ns.errors"), addon.eval("return Vanguard_Meter == nil")], "a message, no error, no panel").toEqual([true, 0, true]);
});

it("the title is a card's heading on the click-to-switch button, the room above the bars fits it, and the empty line is label text2", () => {
  const addon = loggedIn(METER_ENV, METER_ON);
  addon.advance(1);
  const [gap, head, headingSize, labelSize] = addon.eval(`local T = ns.Theme return { T.SPACE.gap, T.SPACE.gap + T.CONTROL_H, T.RoleSize("heading"), T.RoleSize("label") }`);
  const [title, empty, panel, bar] = ["title", "empty", "", "rows[1]"].map((part) => addon.frame(`Vanguard_Meter${part && "."}${part}`));
  expect([title.text, title.font.size, isTok(addon, title.textColor, "text"), title.rect.left - panel.rect.left, panel.rect.top - title.rect.top],
    "the heading role in text, T.SPACE.gap in and down from the card's corner").toEqual(["Damage per second", headingSize, true, gap, gap]);
  const button = addon.eval(`local b = Vanguard_Meter.title:GetParent() return { b:GetObjectType(), b:GetHeight(), b:GetWidth(), b.__scripts.OnClick ~= nil }`);
  expect(button, "the string rides a full-width button head tall that takes the click").toEqual(["Button", head, 300, true]);
  expect([title.rect.bottom >= bar.rect.top, panel.rect.top - bar.rect.top], "the heading ends above the first bar, which starts a head down").toEqual([true, head]);
  expect([empty.visible, empty.text, empty.font.size, isTok(addon, empty.textColor, "muted")], "the empty-state line: label muted").toEqual([true, "No damage yet this fight", labelSize, true]);
});

// TEST-ONLY: every kind and segment key the meter can ask the client for.
const FULL_ENV = `Enum.DamageMeterSessionType = { Overall = 0, Current = 1, Expired = 2 }
  Enum.DamageMeterType = { DamageDone = 0, Dps = 1, HealingDone = 2, Hps = 3, Interrupts = 5, Dispels = 6, DamageTaken = 7, Deaths = 9 }
  RAID_CLASS_COLORS.WARRIOR = { r = 0.78, g = 0.61, b = 0.43 }\n`;

it("the title steps through every kind, a right click through the segments, and totals show for the non-rate kinds", () => {
  const addon = loggedIn(FULL_ENV, METER_ON);
  addon.eval(`__asked = {}
    C_DamageMeter.GetCombatSessionFromType = function(session, what)
      __asked[#__asked + 1] = session .. ":" .. what
      return { combatSources = { { name = 'Tess', classFilename = 'WARRIOR', amountPerSecond = 10, totalAmount = 4500, isLocalPlayer = true } } }
    end`);
  const titles = [];
  for (let i = 0; i < 9; i++) { addon.advance(1); titles.push(heads(addon)[0]); addon.eval("Vanguard_Meter.title:GetParent():GetScript('OnClick')(nil, 'LeftButton')"); }
  expect(titles, "left clicks walk the kinds and wrap").toEqual(["Damage per second", "Healing per second", "Damage done", "Healing done", "Damage taken", "Interrupts", "Dispels", "Deaths", "Damage per second"]);
  addon.advance(1);
  addon.eval("Vanguard_Meter.title:GetParent():GetScript('OnClick')(nil, 'RightButton')");
  addon.slash("meter taken");
  addon.advance(1);
  expect([heads(addon)[0], rows(addon)[0][2], addon.eval("return __asked[#__asked]")], "overall segment, damage taken: the total, asked with both keys").toEqual(["Damage taken · Overall", "4.5K", "0:7"]);
  addon.slash("meter previous");
  addon.slash("meter nonsense");
  expect(chatHas(addon, /showing damage taken · previous fight/), "words pick the segment; an unknown one only reports").toBe(true);
  addon.slash("meter this");
  addon.slash("meter overall");
  addon.slash("meter current");
  addon.eval("ns.GetModule('Meter').SetKind('Gone') ns.GetModule('Meter').SetSession('Gone')");
  addon.eval("ns.GetModule('Meter').ToggleKind() ns.GetModule('Meter').ToggleSession()");
  expect(addon.eval("return ns.GetModule('Meter').settings.kind"), "stepping from an unknown kind starts at the first").toBe("Dps");
  addon.eval("ns.GetModule('Meter').SetKind('Gone') ns.GetModule('Meter').SetSession('Gone')");
  addon.advance(1);
  expect(heads(addon)[0], "an unknown kind or segment falls back to the default words").toBe("Damage per second");
  expect(addon.eval("return ns.GetModule('Meter').EmptyText()"), "and an unnamed kind says Nothing yet").toBe("Nothing yet");
});

it("reset clears the game's segments out of combat only", () => {
  const addon = loggedIn(FULL_ENV, METER_ON);
  addon.eval("C_DamageMeter.ResetAllCombatSessions = function() __reset = true end");
  addon.slash("meter reset");
  expect([addon.eval("return __reset"), chatHas(addon, /meter was reset/)], "asks the client and says so").toEqual([true, true]);
  addon.world.combat(true);
  addon.clearChat();
  addon.slash("meter reset");
  expect(chatHas(addon, /can't be reset now/), "not in combat").toBe(true);
  addon.world.combat(false);
  addon.eval("C_DamageMeter.ResetAllCombatSessions = nil");
  addon.clearChat();
  addon.slash("meter reset");
  expect(chatHas(addon, /can't be reset now/), "a client without the call").toBe(true);
  addon.eval("C_DamageMeter.ResetAllCombatSessions = function() error('no') end");
  addon.clearChat();
  addon.slash("meter reset");
  expect(chatHas(addon, /can't be reset now/), "a refusal is caught").toBe(true);
});

it("a click on a line opens that player's spells, in the game's order; again or the title closes it", () => {
  const addon = loggedIn(FULL_ENV, METER_ON);
  setLines(addon, "{ { name = 'Tess', classFilename = 'WARRIOR', amountPerSecond = 300, sourceGUID = 'g1' }, { name = 'Bo', amountPerSecond = 100, sourceGUID = 'g2' } }");
  addon.eval(`C_Spell.GetSpellName = function(id) return 'Spell' .. id end
    C_DamageMeter.GetCombatSessionSourceFromType = function(session, what, guid)
      __guid = guid
      return { combatSpells = { { spellID = 1, totalAmount = 900 }, { spellID = 2, totalAmount = 300 } } }
    end`);
  addon.advance(1);
  // Clicks meter line i.
  const click = (i) => addon.eval(`Vanguard_Meter.rows[${i}]:GetScript('OnMouseUp')(Vanguard_Meter.rows[${i}])`);
  click(1);
  // The spell panel's state.
  const panel = () => addon.eval(`local d = Vanguard_MeterDetail
    return { d:IsShown(), d.title.__text, d.rows[1].name.__text, d.rows[1].value.__text, d.rows[2].name.__text, d.rows[3]:IsShown(), d.empty:IsShown() }`);
  expect([panel(), addon.eval("return __guid")], "Tess's spells, asked by her GUID").toEqual([[true, "Tess", "Spell1", "900", "Spell2", false, false], "g1"]);
  click(2);
  expect(panel()[1], "another line switches the panel").toBe("Bo");
  click(2);
  expect(panel()[0], "the same line again closes it").toBe(false);
  click(1);
  addon.eval("Vanguard_MeterDetail.title:GetParent():GetScript('OnClick')()");
  expect(panel()[0], "the panel's title closes it").toBe(false);
  addon.eval("ns.GetModule('Meter').CloseDetail()");
  addon.eval("C_DamageMeter.GetCombatSessionSourceFromType = function() return nil end");
  click(1);
  addon.advance(1);
  expect(panel()[6], "a list the client keeps back shows the empty note").toBe(true);
  addon.eval("Vanguard_Meter.rows[1].src = nil");
  addon.eval("Vanguard_Meter.rows[1]:GetScript('OnMouseUp')(Vanguard_Meter.rows[1])");
  addon.eval("C_DamageMeter.GetCombatSessionSourceFromType = function() error('x') end");
  addon.advance(1);
  expect(addon.eval("return #ns.errors"), "no error from a refused call").toBe(0);
});

it("spell lists fall back safely: no call, hidden list, hidden spells, unknown names", () => {
  const addon = loggedIn(FULL_ENV, METER_ON);
  const MT = "ns.GetModule('Meter')";
  expect(addon.eval(`${MT}.CloseDetail() return ${MT}.SpellList({}) == nil`), "no spell call: nil").toBe(true);
  addon.eval("C_DamageMeter.GetCombatSessionSourceFromType = function() return __wfgWorld.secret({}) end");
  expect(addon.eval(`return ${MT}.SpellList({}) == nil`), "a hidden answer: nil").toBe(true);
  addon.eval("C_DamageMeter.GetCombatSessionSourceFromType = function() return { combatSpells = __wfgWorld.secret({}) } end");
  expect(addon.eval(`return ${MT}.SpellList({}) == nil`), "hidden spells: nil").toBe(true);
  addon.eval("Enum.DamageMeterType.Hps = nil ns.GetModule('Meter').settings.kind = 'Hps'");
  expect(addon.eval(`return ${MT}.SpellList({}) == nil`), "a kind the client lacks: nil").toBe(true);
  addon.eval("ns.GetModule('Meter').settings.kind = 'Dps' C_Spell.GetSpellName = nil");
  addon.eval("C_DamageMeter.GetCombatSessionSourceFromType = function() return { combatSpells = { { spellID = 7, totalAmount = __wfgWorld.secret(5) } } } end");
  addon.eval(`${MT}.OpenDetail({ name = 'Tess' })`);
  expect(addon.eval("return Vanguard_MeterDetail.rows[1].name.__text"), "without a name call the ID stands in").toBe("7");
  expect(addon.eval("return #ns.errors"), "hidden totals raise nothing").toBe(0);
});

it("a report holds plain names and figures only, out of combat, to chat or a channel", () => {
  const addon = loggedIn(FULL_ENV, METER_ON);
  setLines(addon, `{ { name = 'Tess', amountPerSecond = 12300 }, { name = __wfgWorld.secret('Hid'), amountPerSecond = 500 }, { name = 'Bo', amountPerSecond = __wfgWorld.secret(9) }, { name = 'Cy', amountPerSecond = 40 } }`);
  addon.eval("__sent = {} SendChatMessage = function(text, channel) __sent[#__sent + 1] = channel .. ': ' .. text end");
  addon.slash("meter report");
  expect(chatHas(addon, /Damage per second: 1\. Tess 12\.3K {2}4\. Cy 40$/), "hidden lines are left out, plain ones keep their place").toBe(true);
  addon.slash("meter report party 1");
  addon.slash("meter report guild 99");
  expect(addon.eval("return __sent"), "to a channel, at most ten lines").toEqual(["PARTY: Damage per second: 1. Tess 12.3K", "GUILD: Damage per second: 1. Tess 12.3K  4. Cy 40"]);
  addon.clearChat();
  addon.slash("meter report bogus");
  addon.slash("meter report say 0");
  expect([chatHas(addon, /Send the report to say/), chatHas(addon, /No report to show/)], "an unknown channel and zero lines").toEqual([true, true]);
  setLines(addon, "{}");
  addon.clearChat();
  addon.slash("meter report");
  addon.world.combat(true);
  addon.slash("meter report");
  expect([chatHas(addon, /No report to show/), chatHas(addon, /Not in combat/)], "an empty meter, and no report in combat").toEqual([true, true]);
});

it("the options page has buttons for the report and the reset", () => {
  const addon = loggedIn(FULL_ENV, METER_ON);
  setLines(addon, "{ { name = 'Tess', amountPerSecond = 300 } }");
  addon.eval("C_DamageMeter.ResetAllCombatSessions = function() __reset = true end");
  addon.slash("");
  addon.eval(CLICK_LUA + "__click(\"Combat tools\")");
  addon.eval("__click(\"Report the meter's top lines\")");
  addon.eval("__click(\"Reset the game's damage meter\")");
  expect([chatHas(addon, /Damage per second: 1\. Tess 300/), addon.eval("return __reset")], "both buttons do what the commands do").toEqual([true, true]);
});

it("the meter's title row has Report and Reset buttons; Report goes where the options say", () => {
  const addon = loggedIn(FULL_ENV, METER_ON);
  setLines(addon, "{ { name = 'Tess', amountPerSecond = 300 } }");
  addon.eval("C_DamageMeter.ResetAllCombatSessions = function() __reset = true end __sent = {} SendChatMessage = function(text, channel) __sent[#__sent + 1] = channel end");
  // Presses a header button of the meter.
  const press = (name) => addon.eval(`Vanguard_Meter.${name}:GetScript('OnClick')(Vanguard_Meter.${name})`);
  press("report");
  press("reset");
  expect([chatHas(addon, /Damage per second: 1\. Tess 300/), addon.eval("return __reset"), addon.eval("return #__sent")], "to your chat by default").toEqual([true, true, 0]);
  addon.eval("ns.GetModule('Meter').settings.reportTo = 'party'");
  press("report");
  expect(addon.eval("return __sent"), "then to the party").toEqual(["PARTY"]);
});

it("on the Deaths view a click puts the game's death recap link in chat", () => {
  const addon = loggedIn(FULL_ENV, METER_ON);
  const MT = "ns.GetModule('Meter')";
  expect(addon.eval(`return ${MT}.RecapLink({ deathRecapID = 5 }) == nil`), "no recap call: nil").toBe(true);
  addon.eval("C_DeathRecap = { GetRecapLink = function(id) if id == 7 then return '[recap7]' end if id == 8 then error('x') end return '' end }");
  expect(addon.eval(`return ${MT}.RecapLink({ deathRecapID = 7 })`), "a plain ID gives the link").toBe("[recap7]");
  const none = addon.eval(`return { ${MT}.RecapLink({ deathRecapID = 0 }) == nil, ${MT}.RecapLink({ deathRecapID = __wfgWorld.secret(7) }) == nil, ${MT}.RecapLink({ deathRecapID = 8 }) == nil, ${MT}.RecapLink({ deathRecapID = 9 }) == nil, ${MT}.RecapLink({}) == nil }`);
  expect(none, "no ID, a hidden ID, a refusal, an empty link: nil").toEqual([true, true, true, true, true]);
  setLines(addon, "{ { name = 'Tess', classFilename = 'WARRIOR', totalAmount = 1, deathRecapID = 7 } }");
  addon.slash("meter deaths");
  addon.advance(1);
  addon.eval("Vanguard_Meter.rows[1]:GetScript('OnMouseUp')(Vanguard_Meter.rows[1])");
  expect(chatHas(addon, /Death recap: \[recap7\]/), "Deaths view: the link is said").toBe(true);
  addon.clearChat();
  addon.eval("Vanguard_Meter.rows[1]:GetScript('OnMouseUp')(Vanguard_Meter.rows[1])");
  addon.slash("meter dps");
  addon.eval("Vanguard_Meter.rows[1]:GetScript('OnMouseUp')(Vanguard_Meter.rows[1])");
  expect(chatHas(addon, /Death recap/), "closing the panel, or another view: nothing said").toBe(false);
});

it("a line shows its share of the total when the figures are plain, and not when hidden or switched off", () => {
  const addon = loggedIn(FULL_ENV, METER_ON);
  addon.eval(`C_DamageMeter.GetCombatSessionFromType = function()
    return { totalAmount = 400, combatSources = { { name = 'Tess', amountPerSecond = 100, totalAmount = 300 }, { name = 'Bo', amountPerSecond = __wfgWorld.secret(50), totalAmount = __wfgWorld.secret(100) } } }
  end
  C_DamageMeter.GetCombatSessionSourceFromType = function()
    return { totalAmount = 200, combatSpells = { { spellID = 1, totalAmount = 50 }, { spellID = 2, totalAmount = 0 } } }
  end`);
  addon.advance(1);
  expect(rows(addon).slice(0, 2).map((r) => r[2]), "plain: 'figure  share'; hidden: the game's figure only").toEqual(["100  75%", addon.eval("return Vanguard_Meter.rows[2].value.__text")]);
  addon.eval("Vanguard_Meter.rows[1]:GetScript('OnMouseUp')(Vanguard_Meter.rows[1])");
  expect(addon.eval("return Vanguard_MeterDetail.rows[1].value.__text"), "the spell panel too").toBe("50  25%");
  addon.eval("ns.GetModule('Meter').settings.percent = false");
  addon.advance(1);
  expect(rows(addon)[0][2], "switched off: just the figure").toBe("100");
  addon.eval("ns.GetModule('Meter').settings.percent = true C_DamageMeter.GetCombatSessionFromType = function() return { totalAmount = 0, combatSources = { { name = 'Tess', amountPerSecond = 100, totalAmount = 0 } } } end");
  addon.advance(1);
  expect(rows(addon)[0][2], "a total of 0: just the figure").toBe("100");
});
