// platelayout: the Nameplates page's sizes and counts, applied without a reload (Vanguard's real Lua in the
// TEST-ONLY headless client, scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, PLATE_ENV, UNITS_ENV, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY: __plateSet(caption, value) sets a row of the Nameplates page as its control does (the row's own
// setter); __plateOf(unit) is Vanguard's frame on a unit's plate; __row(unit, key) reads one of its aura rows.
const SET_LUA = `
  function __plateSet(caption, value)
    for _, row in ipairs(ns.GetModule("Nameplates").OptionRows()) do
      if row[2] == ns.L[caption] then return (row[1] == "check" and row[4] or row[5])(value) end
    end
    error("TEST-ONLY: no row " .. caption)
  end
  function __plateOf(unit) return ns.FrameState('vgPlate')[__plates[unit]] end
  function __row(unit, key)
    local row = __plateOf(unit)[key]
    if not row then return false end
    local c, at = row.frame, row.frame.__points.BOTTOMLEFT
    local g, b = c.__groups and c.__groups[1], c.__groups and c.__groups[1].buttons[1]
    return { kind = c.__kind, max = g and g.opts.maxFrameCount, size = b and b:GetWidth(), line = c.__flowLine, y = at.y, shown = c:IsShown(),
      unit = c.__enabled and c.__unit or false, timer = b ~= nil and b.__durationText ~= nil }
  end
  function __containers() local n = 0 for _, w in ipairs(__wfgStub.frames) do if w.__kind == "AuraContainer" then n = n + 1 end end return n end
`;
// No plate frames built ahead, so the only plates built are the two on screen (the boar and the friend).
const NO_POOL = " ns.GetModule('Nameplates').POOL = 0";
// A profile with these Nameplates settings.
const saved = (lua) => ({ savedVariables: `VanguardDB.profiles = { Default = { Nameplates = { ${lua} } } }` });
// Lets a changed setting hold still past the settle time, then plays the frames the catch-up is spread over.
const settle = (addon) => { addon.advance(0.4, 0.1); for (let i = 0; i < 30; i++) addon.update(0.016); };
// A plate's sizes: the bar's, the click area's width, the cast bar's width and its icon's.
const sizes = (addon, unit) => addon.eval(`local f = __plateOf("${unit}") return { f:GetWidth(), f:GetHeight(), f.hit:GetWidth(), f.cast:GetWidth(), f.cast.icon:GetWidth() }`);

it("plate width and height are sliders: a size saved from the old choices is kept, and a change sizes the plates on screen at once", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + PLATE_ENV + SET_LUA + NO_POOL, saved("width = 160, height = 14"));
  expect(sizes(addon, "nameplate1"), "the widest and tallest of the old choices, as saved").toEqual([160, 14, 180, 143, 14]);
  addon.eval('ns.Options.Show("nameplates") __click("Width")');
  expect([addon.eval("return ns.Settings('Nameplates').width"), sizes(addon, "nameplate1")], "a click on the slider steps it, and the plate follows at once").toEqual([162, [162, 14, 182, 145, 14]]);
  addon.eval('__plateSet("Height", 9)');
  expect(sizes(addon, "nameplate2"), "the height too, with the cast bar and its icon").toEqual([162, 9, 182, 150, 9]);
  expect(addon.eval("local at = __plateOf('nameplate1').hit.__points.BOTTOM return at.y"), "the click area still ends half a bar under the bar").toBe(-4.5);
  expect(addon.eval("return Vanguard_Options.reload:IsShown() or Vanguard_Options.notice:IsShown()"), "no reload is asked for").toBe(false);
});

it("a plate size changed in a fight waits for the fight to end", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + SET_LUA + NO_POOL);
  setCombat(addon, true);
  addon.eval('__plateSet("Width", 180) __plateSet("Width", 100) __plateSet("Height", 12)');
  expect(sizes(addon, "nameplate1").slice(0, 2), "in combat nothing is resized").toEqual([130, 10]);
  setCombat(addon, false);
  expect(sizes(addon, "nameplate1"), "after it the last values asked for apply, once").toEqual([100, 12, 120, 85, 12]);
});

it("a saved size outside a slider's range is kept inside it", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + SET_LUA + NO_POOL, saved("width = 5000, height = 1, auraSize = 2, debuffs = 40"));
  expect(sizes(addon, "nameplate1").slice(0, 2), "the widest and the shortest the sliders give").toEqual([200, 6]);
  expect(addon.eval('return __row("nameplate1", "debuffs")'), "and the smallest icons, eight at most").toMatchObject({ size: 12, max: 8 });
});

it("debuff and buff counts and the icon size make a plate's rows again once the setting holds still, without a reload", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + SET_LUA + NO_POOL);
  expect(addon.eval('return { __row("nameplate1", "debuffs"), __row("nameplate2", "buffs") }'), "the defaults: four 18 debuffs wrapping at the bar, three 16 buffs").toMatchObject([{ max: 4, size: 18, line: 130, y: 16, unit: "nameplate1" }, { max: 3, size: 16, unit: "nameplate2" }]);
  addon.eval("__old = __plateOf('nameplate1').debuffs.frame");
  const before = addon.eval("return __containers()");
  addon.eval('__plateSet("Aura icon size", 20) __plateSet("Aura icon size", 22) __plateSet("Your debuffs shown", 6)');
  expect(addon.eval("return { __containers(), __plateOf('nameplate1').debuffs.frame == __old }"), "while the sliders still move no row is made").toEqual([before, true]);
  settle(addon);
  expect(addon.eval("return __containers()") - before, "once they hold still: one new row each, for the two rows of the two plates").toBe(4);
  expect(addon.eval('return __row("nameplate1", "debuffs")'), "the boar's debuffs: six of 22, on its unit").toMatchObject({ kind: "AuraContainer", max: 6, size: 22, unit: "nameplate1", shown: true });
  expect(addon.eval('return __row("nameplate2", "buffs")'), "the friend's buffs follow the icon size, two smaller").toMatchObject({ max: 3, size: 20, unit: "nameplate2" });
  expect(addon.eval("return { __old:IsShown(), __old.__enabled, __old.__unit }"), "the row it replaced is put away: hidden, switched off, on no unit").toEqual([false, false, "none"]);
  expect(addon.eval("local f = __plateOf('nameplate1') return f.soft.__points.BOTTOM.y"), "the soft-target icon sits clear of the taller row").toBe(40);
  expect(addon.eval("return Vanguard_Options == nil or not Vanguard_Options.reload:IsShown()"), "no reload is asked for").toBe(true);
});

it("the buff row goes at a count of 0 and comes back, the timers switch at once, and a wider bar gives a wider debuff row", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + SET_LUA + NO_POOL);
  addon.eval('__plateSet("Buffs on players", 0) __plateSet("Timer numbers on your debuffs", false) __plateSet("Width", 150)');
  settle(addon);
  expect(addon.eval('return { __row("nameplate2", "buffs"), __row("nameplate1", "debuffs") }'), "no buff row, no timer text, the row as wide as the bar").toMatchObject([false, { timer: false, line: 150 }]);
  addon.eval('__plateSet("Buffs on players", 5) __plateSet("Timer numbers on your debuffs", true)');
  settle(addon);
  expect(addon.eval('return { __row("nameplate2", "buffs"), __row("nameplate1", "debuffs") }'), "five buffs on the friend again, and the timers back").toMatchObject([{ max: 5, unit: "nameplate2", shown: true }, { timer: true }]);
});

it("rows changed in a fight are made after it, and a fallback row put away for other settings is not reused", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + SET_LUA + NO_POOL + " __units.nameplate2 = nil");
  setCombat(addon, true);
  addon.eval("__units.nameplate2 = __units.party1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  setCombat(addon, false);
  expect(addon.eval("local NP = ns.GetModule('Nameplates') return { #NP.spare.debuffs, #NP.spare.buffs }"), "the friend's plate, drawn in the fight, left its two fallback rows for the next fight").toEqual([1, 1]);
  setCombat(addon, true);
  const before = addon.eval("return __containers()");
  addon.eval('__plateSet("Aura icon size", 24)');
  settle(addon);
  expect([addon.eval("return __containers()") - before, addon.eval('return __row("nameplate1", "debuffs").size')], "in the fight no row is made").toEqual([0, 18]);
  addon.eval("__units.nameplate4, __plates.nameplate4 = __units.target, CreateFrame('Frame', nil, UIParent) __plates.nameplate4.UnitFrame, __plates.nameplate4.IsForbidden = CreateFrame('Frame', nil, __plates.nameplate4), function() return false end");
  setCombat(addon, false);
  settle(addon);
  expect(addon.eval('return __row("nameplate1", "debuffs")'), "after it the rows are made at the new size").toMatchObject({ kind: "AuraContainer", size: 24 });
  setCombat(addon, true);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate4");
  expect(addon.eval('return { __row("nameplate4", "debuffs"), #ns.GetModule("Nameplates").spare.debuffs }'), "a plate drawn in the next fight gets a new fallback row at that size, not the old spare").toMatchObject([{ kind: "Frame", shown: true }, 0]);
  expect(addon.eval("return __plateOf('nameplate4').debuffs.frame:GetParent() == __plateOf('nameplate4')"), "on its own frame").toBe(true);
});

it("every plate built ahead follows a changed layout, two plates a frame", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + SET_LUA + " ns.GetModule('Nameplates').POOL = 6");
  for (let i = 0; i < 6; i++) addon.update(0.016);
  // How many of the plates built are at the layout now, and how many were built.
  const current = () => addon.eval("local NP, n = ns.GetModule('Nameplates'), 0 for _, f in ipairs(NP.built) do if f.version == NP.version then n = n + 1 end end return { n, #NP.built }");
  expect(current(), "the two on screen and six ahead, all at the layout they were built for").toEqual([8, 8]);
  addon.eval('__plateSet("Aura icon size", 16) __plateSet("Width", 140)');
  expect(current()[0], "a change leaves them all behind until it holds still").toBe(0);
  addon.advance(0.25, 0.05);
  const seen = [current()[0]];
  for (let i = 0; i < 10; i++) { addon.update(0.05); seen.push(current()[0]); }
  expect(seen.slice(1).map((n, i) => n - seen[i]).filter((d) => d !== 0), "once it holds still: two plates a frame, until all are done").toEqual([2, 2, 2, 2]);
  expect(current()).toEqual([8, 8]);
  expect(addon.eval("local f = ns.GetModule('Nameplates').pool[1] return { f:GetWidth(), f.debuffs.frame.__groups[1].buttons[1]:GetWidth(), f.debuffs.frame.__flowLine }"), "a plate still waiting in the pool has the new width and icons").toEqual([140, 16, 140]);
});

it("a plate put away while the layout changed is left alone and catches up when it is next drawn, out of combat", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + SET_LUA + NO_POOL);
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate1");
  addon.eval('__f = __plateOf("nameplate1") __old = __f.debuffs.frame __plateSet("Aura icon size", 20) __plateSet("Width", 150)');
  settle(addon);
  expect(addon.eval("return { __f:GetWidth(), __f.debuffs.frame == __old }"), "put away: neither sized nor given new rows").toEqual([130, true]);
  setCombat(addon, true);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  expect(addon.eval("return { __f:GetWidth(), __f.debuffs.frame == __old }"), "drawn again in a fight: still as it was").toEqual([130, true]);
  setCombat(addon, false);
  settle(addon);
  expect([addon.eval("return __f:GetWidth()"), addon.eval('return __row("nameplate1", "debuffs")')], "after the fight it is brought up to the layout").toMatchObject([150, { size: 20, line: 150, unit: "nameplate1" }]);
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate1");
  addon.eval('__plateSet("Width", 120)');
  settle(addon);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  expect([addon.eval("return __f:GetWidth()"), addon.eval('return __row("nameplate1", "debuffs").line')], "drawn again out of combat: brought up to it there and then").toEqual([120, 120]);
});

it("a plate or a row the client has closed to addons is not touched by a layout change, and follows once it is open again", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + SET_LUA + NO_POOL);
  // TEST-ONLY: the friend's plate closed as the client closes one it keeps, and the boar's debuff row answering
  // that it is closed; the calls a layout change would make on that row are counted.
  addon.eval(`__touches = 0 __plates.nameplate2.IsForbidden = function() return true end
    __closed = __plateOf("nameplate1").debuffs.frame
    for _, name in ipairs({ "ClearAllPoints", "SetPoint", "Hide" }) do __closed[name] = function() __touches = __touches + 1 end end
    __closed.IsForbidden = function() return true end`);
  addon.eval('__plateSet("Aura icon size", 20) __plateSet("Width", 150)');
  settle(addon);
  expect(addon.eval("return { __touches, #ns.errors, __plateOf('nameplate1').debuffs.frame == __closed }"), "the closed row is neither moved nor put away, and stays the plate's row").toEqual([0, 0, true]);
  expect(addon.eval("return { __plateOf('nameplate2'):GetWidth(), __plateOf('nameplate1'):GetWidth() }"), "the closed plate keeps its size; the open one is sized").toEqual([130, 150]);
  addon.eval("for _, name in ipairs({ 'ClearAllPoints', 'SetPoint', 'Hide', 'IsForbidden' }) do __closed[name] = nil end __plates.nameplate2.IsForbidden = function() return false end");
  addon.fire("PLAYER_REGEN_ENABLED");
  settle(addon);
  expect(addon.eval('return { __row("nameplate1", "debuffs").size, __plateOf("nameplate2"):GetWidth(), __closed:IsShown() }'), "open again: the next pass (after a fight) brings both up to the layout").toEqual([20, 150, false]);
});

it("the Cast bar switch shows and hides plate cast bars without a reload, and builds one for a plate that had none", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + PLATE_ENV + SET_LUA + NO_POOL + " __cast.nameplate1 = true");
  // Whether the boar's plate shows its cast.
  const casting = () => addon.eval("local f = __plateOf('nameplate1') return f.cast ~= nil and f.cast:IsShown()");
  expect(casting(), "a casting unit's plate shows the cast").toBe(true);
  addon.eval('ns.Options.Show("nameplates") __click("Cast bar")');
  expect([casting(), addon.eval("return Vanguard_Options.reload:IsShown()")], "switched off: hidden at once, no reload asked").toEqual([false, false]);
  addon.fire("UNIT_SPELLCAST_START", "nameplate1");
  expect(casting(), "and a new cast does not bring it back").toBe(false);
  addon.eval('__click("Cast bar")');
  expect(casting(), "switched on again: the cast shows").toBe(true);
  const off = loggedIn(UNITS_ENV + PLATE_ENV + SET_LUA + NO_POOL + " __cast.nameplate1 = true", saved("castBar = false"));
  expect(off.eval("return __plateOf('nameplate1').cast == nil"), "a profile with the cast bar off builds none").toBe(true);
  off.eval('__plateSet("Cast bar", true)');
  expect(off.eval("local f = __plateOf('nameplate1') return { f.cast:IsShown(), f.cast:GetWidth() }"), "switching it on builds one at the plate's size and shows the cast").toEqual([true, 117]);
});

it("the debuff row sits clear of the name at any theme text size, and the module off only saves a size", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + SET_LUA + NO_POOL);
  addon.eval("ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()");
  settle(addon);
  expect(addon.eval('return { ns.Theme.RoleSize("world"), __row("nameplate1", "debuffs").y }'), "a larger text size lifts the row by as much").toEqual([14, 19]);
  const off = loggedIn(UNITS_ENV + PLATE_ENV + SET_LUA, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Nameplates = false } } }" });
  off.eval('__plateSet("Width", 150)');
  expect(off.eval("return { ns.Settings('Nameplates').width, #ns.errors }"), "with the module off the value is saved for later, nothing else").toEqual([150, 0]);
});

it("name and health text sizes are shares of the theme's sizes, applied at once out of combat, with the debuff row kept clear of the name", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + SET_LUA + NO_POOL, saved("healthSize = 500"));
  // The sizes of the boar's name, level, health percent and health value texts, and how high its debuff row sits.
  const texts = () => addon.eval(`local f = __plateOf("nameplate1") local function size(fs) return (select(2, fs:GetFont())) end
    return { size(f.name), size(f.level), size(f.healthPercent), size(f.healthValue), __row("nameplate1", "debuffs").y }`);
  expect(texts(), "the theme's 11 for the name; a saved share past the slider is kept to its 160%").toEqual([11, 11, 16, 16, 16]);
  addon.eval('__plateSet("Name text size", 150) __plateSet("Health text size", 120)');
  expect(texts(), "150% of 11 and 120% of 10, the level with the name, the row lifted clear").toEqual([17, 17, 12, 12, 22]);
  expect(addon.eval("return __plateOf('nameplate1').soft.__points.BOTTOM.y"), "and the soft-target icon above the row").toBe(42);
  expect(addon.eval('for _, row in ipairs(ns.GetModule("Nameplates").OptionRows()) do if row[2] == ns.L["Name text size"] then return row[3].format(150) end end'), "the slider reads in percent").toBe("150%");
  addon.eval("ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()");
  expect(texts(), "the theme's Text size carries through: shares of 14 and 13").toEqual([21, 21, 16, 16, 26]);
  setCombat(addon, true);
  addon.eval('__plateSet("Name text size", 100)');
  expect(texts()[0], "in a fight the texts wait").toBe(21);
  setCombat(addon, false);
  expect(texts(), "at 100% the name is the theme's size again").toEqual([14, 14, 16, 16, 19]);
});

it("your target's plate is drawn larger by the Target plate size slider, and goes back when you target something else", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + SET_LUA + NO_POOL);
  // The boar's (your target's) and the friend's plate scale, and the scale the boar's first debuff icon was last placed at.
  const scales = () => addon.eval(`local f = __plateOf("nameplate1") local parts
    for _, w in ipairs(__wfgStub.frames) do if w.__kind == "Cooldown" and w:GetParent() == f.debuffs.frame.__groups[1].buttons[1] then parts = w end end
    return { f:GetScale(), __plateOf("nameplate2"):GetScale(), f.vgScale / f:GetParent():GetEffectiveScale(), parts ~= nil }`);
  expect(scales().slice(0, 2), "at the default 100% no plate is larger").toEqual([1, 1]);
  addon.eval('__plateSet("Target plate size", 130)');
  expect(scales().slice(0, 3), "your target's plate at 130%, its border painted for that scale; the others as they were").toEqual([1.3, 1, 1.3]);
  expect(addon.eval("return __plateOf('nameplate1').glow[1]:IsShown()"), "it keeps its accent glow").toBe(true);
  addon.eval("__units.target = __units.party1 ns.Settings('Nameplates').targetBorder = false");
  setCombat(addon, true);
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(scales().slice(0, 3), "a new target in a fight: the larger plate moves to it, with the border switch off too, each border painted at its plate's scale").toEqual([1, 1.3, 1]);
  setCombat(addon, false);
  addon.eval('__plateSet("Target plate size", 100)');
  expect(scales().slice(0, 2), "back at 100%: no plate larger").toEqual([1, 1]);
  expect(addon.eval("return { ns.GetModule('Nameplates').ScaleSame({ __secret = true }, 1), ns.GetModule('Nameplates').ScaleSame(1.3, 1), #ns.errors }"), "a hidden scale counts as unchanged, another scale as changed").toEqual([true, false, 0]);
});
