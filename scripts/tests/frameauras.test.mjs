// frameauras: the target and focus auras' settings, applied without a reload (Vanguard's real Lua in the
// TEST-ONLY headless client, scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, UNITS_ENV, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY auras on the target and focus, by the client filter that reads them: a sheep, your dot, someone
// else's debuff, two buffs, a defensive and a buff of yours. __faSet(caption, value) sets a row of the card as
// its control does (the row's own setter); __containers() counts the client's aura containers made so far.
const FRAME_AURAS = `
  __units.focus = { name = "TEST-ONLY Focus", hp = 1, maxhp = 2, power = 0, maxpower = 0, ptype = "MANA", reaction = 5 }
  __frameAuras = { ["HARMFUL|CROWD_CONTROL|INCLUDE_NAME_PLATE_ONLY"] = { { icon = "SHEEP" } }, ["HARMFUL|PLAYER|!CROWD_CONTROL|INCLUDE_NAME_PLATE_ONLY"] = { { icon = "MY-DOT" } },
    ["HARMFUL|!PLAYER|!CROWD_CONTROL|INCLUDE_NAME_PLATE_ONLY"] = { { icon = "ANY-DEBUFF" } }, HELPFUL = { { icon = "BUFF-A" }, { icon = "BUFF-B" } },
    ["HELPFUL|BIG_DEFENSIVE"] = { { icon = "WALL" } }, ["HELPFUL|PLAYER"] = { { icon = "MY-BUFF" } } }
  C_UnitAuras = { GetAuraDataByIndex = function(unit, i, filter) return (__frameAuras[filter] or {})[i] end }
  function __faSet(caption, value)
    for _, row in ipairs(ns.GetModule("FrameAuras").OptionRows()) do
      if row[2] == ns.L[caption] then return (row[1] == "check" and row[4] or row[5])(value) end
    end
    error("TEST-ONLY: no row " .. caption)
  end
  function __containers() local n = 0 for _, w in ipairs(__wfgStub.frames) do if w.__kind == "AuraContainer" then n = n + 1 end end return n end
`;
// A profile with these FrameAuras settings.
const saved = (lua) => ({ savedVariables: `VanguardDB.profiles = { Default = { FrameAuras = { ${lua} } } }` });
// Lets a changed setting hold still past the settle time.
const settle = (addon) => addon.advance(0.4, 0.1);
// A frame's aura rows, as the client's containers hold them: per group its count, icon size, filter and first icon.
const rows = (addon, key) => addon.eval(`local f = Vanguard_${key}
  local function row(c) if not c then return false end
    local out = { shown = c.frame:IsShown(), unit = c.frame.__enabled and c.frame.__unit or false, max = {}, size = {}, filter = {}, icon = {}, timer = false }
    for g, grp in ipairs(c.frame.__groups or {}) do local b = grp.buttons[1]
      out.max[g], out.filter[g], out.size[g] = grp.opts.maxFrameCount, grp.filter, b and b:GetWidth() or false
      out.icon[g], out.timer = b and b.__shown and b.__icon.__texture or false, out.timer or (b ~= nil and b.__durationText ~= nil)
    end
    return out end
  return { debuffs = row(f.debuffs), buffs = row(f.buffs) }`);

it("target and focus auras: the icon size and the counts are sliders that make the rows again once they hold still, with no reload", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + FRAME_AURAS);
  expect(rows(addon, "target"), "the defaults: a crowd-control slot, eight of yours at 20, others' off (that group not added); eight buffs at 18").toMatchObject({
    debuffs: { max: [1, 8], size: [22, 20], unit: "target", timer: false }, buffs: { max: [8], size: [18] } });
  expect(rows(addon, "focus"), "the focus: two smaller, debuffs only").toMatchObject({ debuffs: { size: [20, 18] }, buffs: false });
  addon.eval("__old = Vanguard_target.debuffs.frame");
  const before = addon.eval("return __containers()");
  addon.eval('ns.Options.Show("unitframes") __click("Aura icon size") __click("Aura icon size")');
  expect(addon.eval("return { ns.Settings('FrameAuras').size, __containers(), Vanguard_target.debuffs.frame == __old }"), "stepped twice: saved, and no row made while it still moves").toEqual([22, before, true]);
  settle(addon);
  expect(addon.eval("return __containers()") - before, "once it holds still: one new row each (two on the target, one on the focus)").toBe(3);
  expect(rows(addon, "target"), "the target's rows at the new size, on the target, its auras showing").toMatchObject({
    debuffs: { size: [24, 22], unit: "target", shown: true, icon: ["SHEEP", "MY-DOT"] }, buffs: { size: [20], icon: ["BUFF-A"] } });
  expect(rows(addon, "focus").debuffs.size, "the focus follows, two smaller").toEqual([22, 20]);
  expect(addon.eval("return { __old:IsShown(), __old.__enabled, __old.__unit }"), "the row it replaced is put away: hidden, switched off, on no unit").toEqual([false, false, "none"]);
  expect(addon.eval("return Vanguard_Options.reload:IsShown() or Vanguard_Options.notice:IsShown()"), "no reload is asked for").toBe(false);
  addon.eval('__faSet("Debuffs shown", 3) __faSet("Target\'s buffs shown", 0) __faSet("Timer numbers on the icons", true)');
  settle(addon);
  expect(rows(addon, "target"), "three debuffs with timer numbers, and no buff row at a count of 0").toMatchObject({ debuffs: { max: [1, 3], timer: true }, buffs: false });
  addon.eval('__faSet("Debuffs shown", 0) __faSet("Target\'s buffs shown", 4)');
  settle(addon);
  expect(addon.eval("return #(Vanguard_target.debuffs.frame.__groups or {})"), "no debuffs at 0, the crowd-control slot too: no group is added").toBe(0);
  expect(rows(addon, "target").buffs, "the buff row back with four").toMatchObject({ max: [4], unit: "target" });
});

it("target and focus auras: which show is a choice among the client's filters, applied without a reload", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + FRAME_AURAS);
  addon.eval('ns.Options.Show("unitframes") __click("Only your debuffs")');
  settle(addon);
  expect(rows(addon, "focus").debuffs, "Only your debuffs off: others' show too").toMatchObject({ max: [1, 8, 8], icon: ["SHEEP", "MY-DOT", "ANY-DEBUFF"] });
  addon.eval('__faSet("Target\'s buffs", "important")');
  settle(addon);
  expect(rows(addon, "target").buffs, "Important: defensives, externals, then important buffs, a group each").toMatchObject({
    filter: ["HELPFUL|BIG_DEFENSIVE", "HELPFUL|EXTERNAL_DEFENSIVE|!BIG_DEFENSIVE", "HELPFUL|IMPORTANT|!BIG_DEFENSIVE|!EXTERNAL_DEFENSIVE"], icon: ["WALL", false, false], max: [8, 8, 8] });
  addon.eval('__faSet("Target\'s buffs", "mine")');
  settle(addon);
  expect(rows(addon, "target").buffs, "Yours: the buffs you cast").toMatchObject({ filter: ["HELPFUL|PLAYER"], icon: ["MY-BUFF"] });
  const odd = loggedIn(UNITS_ENV + FRAME_AURAS, saved('buffFilter = "TEST-ONLY later choice", size = 500, debuffs = 99, buffs = 3'));
  expect(rows(odd, "target"), "a choice this version doesn't know reads as all, and numbers outside the sliders are kept inside them").toMatchObject({
    buffs: { filter: ["HELPFUL"], max: [3], size: [38] }, debuffs: { max: [1, 16], size: [42, 40] } });
});

it("target and focus auras: a setting changed in a fight makes the rows after it", () => {
  const addon = loggedIn(UNITS_ENV + FRAME_AURAS);
  const before = addon.eval("return __containers()");
  setCombat(addon, true);
  addon.eval('__faSet("Aura icon size", 30)');
  settle(addon);
  expect([addon.eval("return __containers()") - before, rows(addon, "target").debuffs.size], "in the fight no row is made or put away").toEqual([0, [22, 20]]);
  setCombat(addon, false);
  expect([addon.eval("return __containers()") - before, rows(addon, "target").debuffs.size], "it follows when the fight ends").toEqual([3, [32, 30]]);
});

it("target and focus auras: a row the client has closed is left, and with the module off a setting is only saved", () => {
  const addon = loggedIn(UNITS_ENV + FRAME_AURAS);
  addon.eval('__closed = Vanguard_target.debuffs.frame __closed.IsForbidden = function() return true end __faSet("Aura icon size", 26)');
  settle(addon);
  expect(addon.eval("return { Vanguard_target.debuffs.frame == __closed, __closed:IsShown(), #ns.errors }"), "the closed row stays the frame's row, untouched").toEqual([true, true, 0]);
  expect(rows(addon, "target").buffs.size, "the open row beside it follows").toEqual([24]);
  addon.eval('__closed.IsForbidden = nil __faSet("Aura icon size", 27)');
  settle(addon);
  expect([addon.eval("return __closed:IsShown()"), rows(addon, "target").debuffs.size], "open again: the next change replaces it").toEqual([false, [29, 27]]);
  const off = loggedIn(UNITS_ENV + FRAME_AURAS, { savedVariables: "VanguardDB.profiles = { Default = { modules = { FrameAuras = false } } }" });
  off.eval('__faSet("Aura icon size", 30)');
  off.advance(0.4, 0.1);
  expect(off.eval("return { ns.Settings('FrameAuras').size, Vanguard_target.debuffs == nil, #ns.errors }"), "saved for when the module is on; no row made").toEqual([30, true, 0]);
});

it("target and focus auras: a row woken by switching the module off and on follows the scale again, and is refit for a change made while it slept", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + FRAME_AURAS);
  // Whether the target's debuff row is shown and in the follow set.
  const followed = () => addon.eval("local f = Vanguard_target.debuffs return ns.Auras.followed[f.frame] == true and f.frame:IsShown()");
  addon.eval('ns.SetModuleEnabled("FrameAuras", false)');
  addon.eval("__refits = 0 local refit = ns.Auras.Refit ns.Auras.Refit = function(...) __refits = __refits + 1 return refit(...) end");
  addon.eval('ns.SetModuleEnabled("FrameAuras", true)');
  settle(addon);
  expect([followed(), addon.eval("return __refits > 0")], "shown, followed again, and refit once on waking").toEqual([true, true]);
});

// H48-10-1: Park (hide only) keeps the row in the theme's repaint; Retire (a row replaced for good) forgets it.
it("target and focus auras: a row woken by switching the module off and on is still in the theme's repaint", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + FRAME_AURAS);
  // How many frames the theme repaints.
  const painted = () => addon.eval("return ns.Theme.PaintedCount()");
  const before = painted();
  addon.eval('ns.SetModuleEnabled("FrameAuras", false)');
  expect(painted(), "parked rows stay in the registry").toBe(before);
  addon.eval('ns.SetModuleEnabled("FrameAuras", true)');
  settle(addon);
  expect(painted(), "and still are once shown again").toBe(before);
});

// Modules/UnitExtras.lua puts your threat percent 12 in from the target frame's top right corner, 3 above it, where the
// buff row also starts to grow: the row's line stops short of it while the readout is on.
it("target buffs: the row's line stops short of the threat percent while that readout is on", () => {
  // The target's buff row spec's line width and the frame's width, for a profile.
  const spec = (saved) => loggedIn(UNITS_ENV + FRAME_AURAS, saved).eval(`local FA = ns.GetModule("FrameAuras")
    return { line = FA.BuffSpec(Vanguard_target, FA.Look(FA.settings)).lineSize, width = Vanguard_target:GetWidth() }`);
  const on = spec(saved("size = 30"));
  expect(on.line).toBe(on.width - 48);
  const off = spec({ savedVariables: "VanguardDB.profiles = { Default = { UnitExtras = { threat = false } } }" });
  expect(off.line).toBe(off.width);
});

// H54-31: Unit extras starting or stopping while you play re-makes the buff row for the threat percent's room, and the
// room counts only while Unit extras runs (a switch made in a fight waits for the fight to end).
// The target's buff row as built next to the row the settings now ask for, and the room counted.
const threatState = (addon) => addon.eval(`local FA = ns.GetModule("FrameAuras")
  return { room = FA.ThreatRoom(), made = Vanguard_target.buffs.sig == ns.Auras.Signature(FA.BuffSpec(Vanguard_target, FA.Look(FA.settings))) }`);
// A session with Unit extras switched off and settled.
const withoutUnitExtras = () => {
  const addon = loggedIn(UNITS_ENV + FRAME_AURAS);
  addon.eval('ns.SetModuleEnabled("UnitExtras", false)');
  settle(addon);
  return addon;
};

it("target buffs: switched off and on again out of combat, the row's line stops short of the threat percent", () => {
  const addon = withoutUnitExtras();
  addon.eval('ns.SetModuleEnabled("UnitExtras", true)');
  addon.advance(3, 0.1);
  expect(threatState(addon)).toEqual({ room: 48, made: true });
});

it("target buffs: with Unit extras switched off, the row takes the frame's full width, made again by Frame auras' own listener", () => {
  const addon = loggedIn(UNITS_ENV + FRAME_AURAS);
  addon.eval('__applies = 0 local FA = ns.GetModule("FrameAuras") local apply = FA.Apply FA.Apply = function() __applies = __applies + 1 return apply() end');
  addon.eval('ns.SetModuleEnabled("UnitExtras", false)');
  settle(addon);
  expect([addon.eval("return __applies > 0"), threatState(addon)], "the module switch asked for the rows again").toEqual([true, { room: 0, made: true }]);
});

it("target buffs: Unit extras switched on in a fight counts no room until the fight ends, then the row is made for it", () => {
  const addon = withoutUnitExtras();
  setCombat(addon, true);
  addon.eval('ns.SetModuleEnabled("UnitExtras", true)');
  expect(threatState(addon).room, "Unit extras is not running yet").toBe(0);
  setCombat(addon, false);
  addon.advance(3, 0.1);
  expect(threatState(addon)).toEqual({ room: 48, made: true });
});

it("target buffs: a module switch while Frame auras is off asks for no rows and raises no error", () => {
  const addon = loggedIn(UNITS_ENV + FRAME_AURAS);
  addon.eval('ns.SetModuleEnabled("FrameAuras", false)');
  settle(addon);
  addon.eval('__applies = 0 local FA = ns.GetModule("FrameAuras") local apply = FA.Apply FA.Apply = function() __applies = __applies + 1 return apply() end');
  addon.eval('ns.SetModuleEnabled("UnitExtras", false)');
  settle(addon);
  expect([addon.eval("return __applies"), addon.eval("return #ns.errors")]).toEqual([0, 0]);
});

// H47-6-1 (decide: option 1 built): the target's cast bar rises with the buff row's extra height, so a second line of
// buffs, or larger icons, are never covered by it while the target casts. TEST-ONLY: sixteen buffs, a casting target.
const CASTING_TARGET = `
  __buffs = {} for i = 1, 16 do __buffs[i] = { icon = "BUFF-" .. i } end
  C_UnitAuras = { GetAuraDataByIndex = function(unit, i, filter) if filter == "HELPFUL" then return __buffs[i] end end }
  UnitCastingInfo = function(unit) if unit == "target" then return "TEST-ONLY Spell", "", "ICON", 999000, 1003000, false, nil, false end end
  UnitChannelInfo = function() return nil end
`;
// The top of the target's highest buff icon and the bottom of its cast bar, with a profile's FrameAuras settings.
const buffsAndBar = (lua) => {
  const addon = loggedIn(UNITS_ENV + CASTING_TARGET, saved(lua));
  addon.fire("PLAYER_TARGET_CHANGED");
  addon.fire("UNIT_SPELLCAST_START", "target");
  addon.update(0.01);
  return addon.eval(`local top = -1
    for _, grp in ipairs(Vanguard_target.buffs.frame.__groups) do for _, b in ipairs(grp.buttons) do
      if b.__shown ~= false and b:IsShown() and b:GetTop() > top then top = b:GetTop() end end end
    return { top = top, bar = Vanguard_CastBar_target:GetBottom(), shown = Vanguard_CastBar_target:IsShown() }`);
};

it("H47-6-1 the target's cast bar stands over every buff icon, with a second line of buffs or larger icons", () => {
  const plain = buffsAndBar("");
  expect(plain.shown, "it casts").toBe(true);
  expect(plain.bar - plain.top, "defaults: clear as before").toBeGreaterThanOrEqual(0);
  for (const lua of ["buffs = 16", "size = 40", "size = 40, buffs = 16"]) {
    const row = buffsAndBar(lua);
    expect(row.bar - row.top, `${lua}: the bar's bottom is over the highest icon`).toBeGreaterThanOrEqual(0);
  }
});

it("H47-6-1 the cast bar's default spot comes back down when the buffs shrink, and a dragged spot still wins", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + CASTING_TARGET, saved("buffs = 16"));
  // How much the target's buff row lifts its cast bar now.
  const spot = () => addon.eval("return ns.GetModule('FrameAuras').BuffLift()");
  expect(spot(), "16 buffs at the default size: a second line").toBeGreaterThan(0);
  addon.eval("ns.Settings('FrameAuras').buffs = 8 ns.GetModule('FrameAuras').Apply()");
  settle(addon);
  expect(spot(), "eight buffs again: one line, no lift").toBe(0);
});

it("H47-6-1 a frame resize settles the rows and stops: the cast bar's spot is re-placed only when the lift changes", () => {
  const addon = loggedIn(UNITS_ENV, saved(""));
  addon.eval('__applies = 0 local FA = ns.GetModule("FrameAuras") local apply = FA.Apply FA.Apply = function() __applies = __applies + 1 return apply() end');
  addon.eval('ns.GetModule("UnitFrames").ApplySizes()');
  addon.advance(2, 0.1);
  addon.eval("__applies = 0");
  addon.advance(5, 0.1);
  expect(addon.eval("return __applies"), "no longer asked again by its own rescale").toBe(0);
  expect(addon.eval('return ns.ticker.vgJobs["frame auras settle"] == nil'), "nothing waits to settle").toBe(true);
});
