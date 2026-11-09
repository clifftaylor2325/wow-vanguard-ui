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
    for g, grp in ipairs(c.frame.__groups) do local b = grp.buttons[1]
      out.max[g], out.filter[g], out.size[g] = grp.opts.maxFrameCount, grp.filter, b and b:GetWidth() or false
      out.icon[g], out.timer = b and b.__shown and b.__icon.__texture or false, out.timer or (b ~= nil and b.__durationText ~= nil)
    end
    return out end
  return { debuffs = row(f.debuffs), buffs = row(f.buffs) }`);

it("target and focus auras: the icon size and the counts are sliders that make the rows again once they hold still, with no reload", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + FRAME_AURAS);
  expect(rows(addon, "target"), "the defaults: a crowd-control slot, eight of yours at 20, others' off; eight buffs at 18").toMatchObject({
    debuffs: { max: [1, 8, 0], size: [22, 20, false], unit: "target", timer: false }, buffs: { max: [8], size: [18] } });
  expect(rows(addon, "focus"), "the focus: two smaller, debuffs only").toMatchObject({ debuffs: { size: [20, 18, false] }, buffs: false });
  addon.eval("__old = Vanguard_target.debuffs.frame");
  const before = addon.eval("return __containers()");
  addon.eval('ns.Options.Show("unitframes") __click("Aura icon size") __click("Aura icon size")');
  expect(addon.eval("return { ns.Settings('FrameAuras').size, __containers(), Vanguard_target.debuffs.frame == __old }"), "stepped twice: saved, and no row made while it still moves").toEqual([22, before, true]);
  settle(addon);
  expect(addon.eval("return __containers()") - before, "once it holds still: one new row each (two on the target, one on the focus)").toBe(3);
  expect(rows(addon, "target"), "the target's rows at the new size, on the target, its auras showing").toMatchObject({
    debuffs: { size: [24, 22, false], unit: "target", shown: true, icon: ["SHEEP", "MY-DOT", false] }, buffs: { size: [20], icon: ["BUFF-A"] } });
  expect(rows(addon, "focus").debuffs.size, "the focus follows, two smaller").toEqual([22, 20, false]);
  expect(addon.eval("return { __old:IsShown(), __old.__enabled, __old.__unit }"), "the row it replaced is put away: hidden, switched off, on no unit").toEqual([false, false, "none"]);
  expect(addon.eval("return Vanguard_Options.reload:IsShown() or Vanguard_Options.notice:IsShown()"), "no reload is asked for").toBe(false);
  addon.eval('__faSet("Debuffs shown", 3) __faSet("Target\'s buffs shown", 0) __faSet("Timer numbers on the icons", true)');
  settle(addon);
  expect(rows(addon, "target"), "three debuffs with timer numbers, and no buff row at a count of 0").toMatchObject({ debuffs: { max: [1, 3, 0], timer: true }, buffs: false });
  addon.eval('__faSet("Debuffs shown", 0) __faSet("Target\'s buffs shown", 4)');
  settle(addon);
  expect(rows(addon, "target"), "no debuffs at 0, the crowd-control slot too; the buff row back with four").toMatchObject({ debuffs: { max: [0, 0, 0] }, buffs: { max: [4], unit: "target" } });
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
    buffs: { filter: ["HELPFUL"], max: [3], size: [38] }, debuffs: { max: [1, 16, 0], size: [42, 40, false] } });
});

it("target and focus auras: a setting changed in a fight makes the rows after it", () => {
  const addon = loggedIn(UNITS_ENV + FRAME_AURAS);
  const before = addon.eval("return __containers()");
  setCombat(addon, true);
  addon.eval('__faSet("Aura icon size", 30)');
  settle(addon);
  expect([addon.eval("return __containers()") - before, rows(addon, "target").debuffs.size], "in the fight no row is made or put away").toEqual([0, [22, 20, false]]);
  setCombat(addon, false);
  expect([addon.eval("return __containers()") - before, rows(addon, "target").debuffs.size], "it follows when the fight ends").toEqual([3, [32, 30, false]]);
});

it("target and focus auras: a row the client has closed is left, and with the module off a setting is only saved", () => {
  const addon = loggedIn(UNITS_ENV + FRAME_AURAS);
  addon.eval('__closed = Vanguard_target.debuffs.frame __closed.IsForbidden = function() return true end __faSet("Aura icon size", 26)');
  settle(addon);
  expect(addon.eval("return { Vanguard_target.debuffs.frame == __closed, __closed:IsShown(), #ns.errors }"), "the closed row stays the frame's row, untouched").toEqual([true, true, 0]);
  expect(rows(addon, "target").buffs.size, "the open row beside it follows").toEqual([24]);
  addon.eval('__closed.IsForbidden = nil __faSet("Aura icon size", 27)');
  settle(addon);
  expect([addon.eval("return __closed:IsShown()"), rows(addon, "target").debuffs.size], "open again: the next change replaces it").toEqual([false, [29, 27, false]]);
  const off = loggedIn(UNITS_ENV + FRAME_AURAS, { savedVariables: "VanguardDB.profiles = { Default = { modules = { FrameAuras = false } } }" });
  off.eval('__faSet("Aura icon size", 30)');
  off.advance(0.4, 0.1);
  expect(off.eval("return { ns.Settings('FrameAuras').size, Vanguard_target.debuffs == nil, #ns.errors }"), "saved for when the module is on; no row made").toEqual([30, true, 0]);
});
