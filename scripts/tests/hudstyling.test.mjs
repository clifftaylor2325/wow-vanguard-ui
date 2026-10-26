// hud styling: the fixes of the 2026-10-26 UI hunt that need a full login (action bars, unit frames and
// their extras), kept in one file so they never need an entry in login-scope.json.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { NO_RAID, SETUP_DONE, UNITS_ENV, loggedIn } from "./helpers.mjs";

// TEST-ONLY pet mood: a content cat.
const HAPPY_ENV = "GetPetHappiness = function() return 2, 0, 0 end\n";

// TEST-ONLY client with the swing timer, shown whatever your class.
const SWING = `C_SwingTimer = {} Enum = Enum or {} Enum.PlayerSwingType = { MainHand = 0, OffHand = 1, Ranged = 2 }`;
const SWING_ALWAYS = "SwingTimer = { show = 'always' }";

// Saved variables for the default profile with the given module settings.
const profile = (settings) => `VanguardDB = { profiles = { Default = { ${settings} } } }`;

it("P4-3: the swing timer rides above the cast bar when the action bar stack grows", () => {
  // The swing holder's default y, the cast bar's top, and bar 1's top, in UI units.
  const edges = (addon) => addon.eval(`local y = function(k) local _, _, _, v = ns.MoverPoint(k) return v end
    return { y("swing"), y("cast_player") + ns.GetModule("CastBars").LAYOUT.player.h, y("bar1") + Vanguard_Bar1:GetHeight() }`);
  const flat = edges(loggedIn(SWING, { savedVariables: profile(SWING_ALWAYS) }));
  expect(flat[0], "over the default three bars the swing rows sit where they always did").toBeCloseTo(170, 0);
  const six = edges(loggedIn(SWING, { savedVariables: profile(`${SWING_ALWAYS}, ActionBars = { bars = { [6] = { enabled = true } } }`) }));
  expect(six[0] - six[1], "with a 4th stacked bar the swing rows are still 11 over the cast bar").toBe(11);
  expect(six[0], "and above bar 1's top").toBeGreaterThan(six[2]);
});

it("P4-3: the swing timer follows a stack that grows after login, and stays at its spot with the action bars off", () => {
  const live = loggedIn(SWING, { savedVariables: profile(SWING_ALWAYS) });
  const swingY = () => live.eval('local _, _, _, y = ns.MoverPoint("swing") return y');
  const before = swingY();
  live.eval('local AB = ns.GetModule("ActionBars") AB.settings.bars[3].perRow = 6 AB.SettingChanged(3, "perRow")');
  expect(swingY() - before, "a second row on bar 3 lifts the swing rows by that row's height").toBeGreaterThan(30);
  const off = loggedIn(SWING, { savedVariables: profile(`${SWING_ALWAYS}, modules = { ActionBars = false }`) });
  expect(off.eval('local _, _, _, y = ns.MoverPoint("swing") return y'), "with the action bars off it sits at its fixed spot").toBe(170);
});

// A rect (left, right, top, bottom) of a frame, font string or texture by ref.
const rectOf = (addon, ref) => addon.frame(ref)?.rect;

it("P4-4: the pet's health text ends left of the happiness glyph", () => {
  const addon = loggedIn(UNITS_ENV + HAPPY_ENV + `__units.pet = { name = "TEST-ONLY Cat", hp = 640, maxhp = 800, power = 0, maxpower = 0, ptype = "FOCUS", reaction = 5 }`);
  addon.fire("UNIT_PET", "player");
  const text = rectOf(addon, "Vanguard_pet.healthText");
  const glyph = addon.eval("local g = ns.GetModule('UnitExtras').happy return { g:GetLeft(), g:GetRight() }");
  expect(text.right, "the last digit sits left of the glyph").toBeLessThanOrEqual(glyph[0]);
});

it("P4-7: the health text of the target, focus and boss frames ends left of the class diamond", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  for (const key of ["target", "focus", "boss1", "boss2"]) {
    addon.eval(`Vanguard_${key}:Show() Vanguard_${key}.class:Show() Vanguard_${key}.healthText:SetText("640")`);
    const text = rectOf(addon, `Vanguard_${key}.healthText`);
    const diamond = rectOf(addon, `Vanguard_${key}.class`);
    expect(text.right, `${key}: the health text clears the diamond`).toBeLessThanOrEqual(diamond.left);
  }
});

it("P4-9: the Versus deck stays a pad above a taller target frame", () => {
  const addon = loggedIn(UNITS_ENV, { savedVariables: profile("UnitFrames = { deck = true, targetHeight = 44 }") });
  // How far the deck's top edge stands above the taller of the player and target frames.
  const pad = () => addon.eval("local d, p, t = ns.GetModule('UnitFrames').deck, Vanguard_player, Vanguard_target return d:GetTop() - math.max(p:GetTop(), t:GetTop())");
  expect(pad(), "a 44 tall target is inside the deck with the full 6 unit pad").toBeCloseTo(6, 0);
  addon.eval("local UF = ns.GetModule('UnitFrames') UF.settings.targetHeight = 36 UF.ApplySizes()");
  expect(pad(), "and a target as tall as the player frame leaves the same pad").toBeCloseTo(6, 0);
});

// A logged-in addon in the text-fit client (real font widths, every string a third longer, as a translation runs).
function fitClient(extra = "", saved = "") {
  const addon = createAddon({ savedVariables: SETUP_DONE + saved, textFit: true });
  if (extra) addon.eval(extra);
  addon.login();
  return addon;
}

it("P6-3: the keybind banner shows its whole instruction line in German and French", () => {
  // The real deDE and frFR texts of the banner's instruction line (Locales/deDE.lua, Locales/frFR.lua).
  const lines = [
    "Fahre über einen Knopf und drücke dann eine Taste, eine seitliche Maustaste oder das Mausrad. Rücktaste leert, Escape verlässt.",
    "Survolez un bouton, puis appuyez sur une touche, un bouton latéral de souris ou la molette. Retour arrière efface, Échap quitte.",
  ];
  const addon = fitClient();
  addon.slash("keybind");
  for (const text of lines) {
    addon.eval(`Vanguard_KeybindMode.text:SetText(${JSON.stringify(text)})`);
    expect(addon.textFit("Vanguard_KeybindMode"), `${text.slice(0, 12)}: nothing in the banner is cut`).toEqual([]);
  }
  expect(addon.eval("return Vanguard_KeybindMode:GetWidth() < UIParent:GetWidth()"), "and the banner fits the screen").toBe(true);
});

// A TEST-ONLY LibDataBroker-1.1 with one long feed, picked for the strip.
const LONG_FEED_ENV = `
  local ldb = LibStub:NewLibrary("LibDataBroker-1.1", 4)
  ldb.callbacks = LibStub("CallbackHandler-1.0"):New(ldb)
  ldb.objs = {}
  function ldb:NewDataObject(name, obj) self.objs[name] = obj self.callbacks:Fire("LibDataBroker_DataObjectCreated", name, obj) return obj end
  function ldb:DataObjectIterator() return pairs(self.objs) end
  function ldb:GetDataObjectByName(name) return self.objs[name] end
  ldb:NewDataObject("TEST-ONLY Social", { type = "data source", text = "Guild: 42 online  Friends: 7 online  (Battle.net 3)" })
`;

it("P6-4: the vehicle exit label shrinks to fit its button when a translation runs long", () => {
  const addon = fitClient();
  addon.eval('Vanguard_VehicleExit:Show() Vanguard_VehicleExit.label:SetText("Verlassen")');
  const box = rectOf(addon, "Vanguard_VehicleExit");
  const label = rectOf(addon, "Vanguard_VehicleExit.label");
  expect(label.left, "the label starts inside the button").toBeGreaterThanOrEqual(box.left);
  expect(label.right, "and ends inside it").toBeLessThanOrEqual(box.right);
  expect(addon.textFit("Vanguard_VehicleExit"), "nothing spills over the border").toEqual([]);
});

it("P6-5: a long broker feed stays on one line inside the strip", () => {
  const addon = fitClient(LONG_FEED_ENV);
  addon.eval('ns.GetModule("BrokerStrip").Choose("TEST-ONLY Social", true)');
  const text = rectOf(addon, "Vanguard_BrokerSlot1.text");
  const slot = rectOf(addon, "Vanguard_BrokerSlot1");
  expect(text.top, "the text stays under the slot's top edge").toBeLessThanOrEqual(slot.top);
  expect(text.bottom, "and over its bottom edge").toBeGreaterThanOrEqual(slot.bottom);
});

// ActionBars settings text with bars 4 and 5 on, at a button size.
const rightBars = (size) => profile(`ActionBars = { size = ${size}, bars = { [4] = { enabled = true, visibility = "always", buttons = 12, perRow = 1 }, [5] = { enabled = true, visibility = "always", buttons = 12, perRow = 1 } } }`);

it("P6-2: bar 5 keeps clear of bar 4 at big button sizes and when bar 4 gets wider", () => {
  const gap = (addon) => addon.eval("return Vanguard_Bar4:GetLeft() - Vanguard_Bar5:GetRight()");
  const big = loggedIn("", { savedVariables: rightBars(48) });
  expect(gap(big), "at size 48 bar 5 ends before bar 4 starts").toBeGreaterThanOrEqual(0);
  const dflt = loggedIn("", { savedVariables: rightBars(38) });
  expect(gap(dflt), "at the default size they sit 4 units apart, as before").toBeCloseTo(4, 0);
  dflt.eval('local AB = ns.GetModule("ActionBars") AB.settings.bars[4].perRow = 6 AB.Layout(4)');
  expect(gap(dflt), "two columns on bar 4 push bar 5 over, live").toBeCloseTo(4, 0);
  dflt.eval("ns.SetMoverPoint('bar5', 'RIGHT', 'RIGHT', -300, 0)");
  dflt.eval('local AB = ns.GetModule("ActionBars") AB.settings.bars[4].perRow = 12 AB.Layout(4)');
  expect(dflt.eval("return Vanguard_Bar5.__points.RIGHT.x"), "a spot you dragged bar 5 to stays").toBe(-300);
});

// TEST-ONLY: the client's damage meter enums, and a meter switched on.
const METER_ENV = "Enum.DamageMeterSessionType = { Current = 1 } Enum.DamageMeterType = { Dps = 1, Hps = 3 }\n";
const METER_ON = "VanguardDB.profiles = { Default = { Meter = { on = true } } }\n";

it("P5-5: the meter title ends before the Report and Reset buttons, at any width", () => {
  const addon = fitClient(METER_ENV, METER_ON);
  for (const width of [200, 300]) {
    addon.eval(`ns.SetMoverSize("meter", "width", ${width}) Vanguard_Meter.title:SetText("Schaden pro Sekunde · Vorheriger Kampf")`);
    const overlaps = addon.textFit("Vanguard_Meter").filter((f) => f.kind === "overlap");
    expect(overlaps, `width ${width}: the title overlaps no button`).toEqual([]);
  }
});

it("P5-6: the roll tracker's names stop before their figures, however long the figures run", () => {
  const addon = fitClient('RANDOM_ROLL_RESULT = "%s rolls %d (%d-%d)"');
  addon.fire("CHAT_MSG_SYSTEM", "Alexandrina-Elsewhere rolls 87 (1-1000)");
  const name = rectOf(addon, "Vanguard_Rolls.rows[2].left");
  const figures = addon.eval("local f = Vanguard_Rolls.rows[2].right return { f:GetLeft(), f:GetText() }");
  expect(figures[1], "the figures are '87 (1-1000)'").toBe("87 (1-1000)");
  expect(name.right, "the name ends before them").toBeLessThanOrEqual(figures[0]);
});

it("P5-6: the officer roster's names stop before their notes", () => {
  const addon = fitClient("", "VanguardDB.profiles = { Default = { OfficerLoot = { on = true } } }\n");
  addon.world.setUnit("raid1", { name: "Alexandrina", class: "PRIEST", className: "Priest", role: "HEALER", leader: true, connected: false, isPlayer: true });
  addon.slash("loot roster");
  const name = rectOf(addon, "Vanguard_OfficerRoster.rows[2].left");
  const note = addon.eval("local f = Vanguard_OfficerRoster.rows[2].right return { f:GetLeft(), f:GetText() }");
  expect(name.right, "the name ends before it").toBeLessThanOrEqual(note[0]);
});

it("P5-9: the group board's hint wraps inside the window in French and German", () => {
  // The real frFR and deDE hints (Locales/frFR.lua, Locales/deDE.lua), 571 and 547 wide on one line.
  const hints = [
    "Cliquez sur une annonce pour ouvrir un chuchotement avec un message prérempli. Rien n’est envoyé avant que vous appuyiez sur Entrée.",
    "Klicke auf einen Beitrag, um ein Flüsterfenster mit vorausgefüllter Nachricht zu öffnen. Nichts wird gesendet, bis du Eingabe drückst.",
  ];
  const addon = fitClient();
  addon.slash("lfg");
  for (const hint of hints) {
    addon.eval(`Vanguard_GroupBoard.hint:SetText(${JSON.stringify(hint)})`);
    const mine = addon.textFit("Vanguard_GroupBoard").filter((f) => f.text.startsWith(hint.slice(0, 12)));
    expect(mine, `${hint.slice(0, 12)}: the hint is not cut or spilling`).toEqual([]);
    const [board, text] = ["Vanguard_GroupBoard", "Vanguard_GroupBoard.hint"].map((ref) => rectOf(addon, ref));
    expect([text.left >= board.left, text.right <= board.right, text.bottom >= board.bottom, text.height], `${hint.slice(0, 12)}: inside the window, on two lines`).toEqual([true, true, true, 20]);
  }
});
