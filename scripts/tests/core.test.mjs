// core: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createAddon, root } from "../lib/lua-harness.mjs";
import { luaValue } from "../lib/lua-emit.mjs";
import { ACTIONS_ENV, AFK_ENV, CLICK_LUA, ENGINE_ENV, FOREVER_ENV, HEALING_ENV, MICRO_ENV, QUEST_ENV, RAID_ENV, SETUP_DONE, TIDY_ENV, TOTEMS_ENV, UI_ENV, UNITS_ENV, bars, button, calls, chatHas, healing, isTok, key, lacking, later, loggedIn, putAway, setCombat, totemCell } from "./helpers.mjs";

it("saved variables", () => {
  expect(createAddon().eval("return next(ns.Profile()) == nil"), "before ADDON_LOADED the profile is empty").toBe(true);
  const addon = loggedIn("", { firstRun: true });
  const sv = addon.savedVariables();
  expect(sv.account.version === 2 && typeof sv.account.profiles === "object", "fresh install creates VanguardDB").toBeTruthy();
  expect(sv.char.profile === "Default", "a new character uses the Default profile").toBeTruthy();
  const kept = loggedIn("", { savedVariables: 'VanguardDB = { profiles = { Main = { theme = { accent = { 1, 0, 0 } } } } }\nVanguardCharDB = { profile = "Main" }' });
  expect(kept.eval("return select(1, ns.Theme.Accent())") === 1, "the character's saved profile is used").toBeTruthy();
  expect(kept.eval("return ns.Theme.Settings().panel[4]") === 0.94, "missing theme settings get defaults").toBeTruthy();
});

it("wrong-typed saved values are replaced by their defaults", () => {
  const addon = loggedIn("", {
    savedVariables: `VanguardDB.profiles = { Default = { theme = { textScale = "large", pixelScale = "yes", accent = "arcane", font = "client",
      panel = { "x", 0.1, 0.1, 0.94 } }, movers = { gridSize = true } } }`,
  });
  expect(addon.eval("return ns.Theme.Settings().textScale"), "a word for a number scale gets the default").toBe(1);
  expect(addon.eval("return ns.Theme.ScaledSize(10)"), "so text sizing no longer throws").toBe(10);
  expect(addon.eval("return ns.Theme.Settings().pixelScale"), "a string for a boolean gets the default").toBe(false);
  expect(addon.eval("return ns.Theme.Settings().accent[1] == ns.Theme.PRESETS.brass[1]"), "a string where a table belongs gets the default table").toBe(true);
  expect(addon.eval("return ns.Theme.Settings().panel[1] == ns.Theme.TOKENS.panel[1]"), "a wrong-typed entry inside a table is replaced").toBe(true);
  expect(addon.eval("return ns.Theme.Settings().panel[4]"), "a right-typed sibling is kept").toBe(0.94);
  expect(addon.eval("return ns.Theme.Settings().font"), "a right-typed scalar is kept").toBe("client");
  expect(addon.eval("return ns.MoverOptions().gridSize"), "a boolean for a number gets the default").toBe(32);
  expect(addon.eval('local c = ns.Copy({ a = 1, b = { c = "x" } }) return { c.a, c.b.c }'), "ns.Copy still copies every key").toEqual([1, "x"]);
});

it("a damaged account file: a profile that isn't a table, or a name that isn't a name, is dropped at load", () => {
  const addon = loggedIn("", { savedVariables: 'VanguardDB.profiles = { Default = "TEST-ONLY", Raid = 5, [1] = {}, Main = { theme = { font = "client" } } }' });
  expect(addon.eval("return { type(ns.Profile()), ns.GetModule('UnitFrames').enabled, #ns.errors }"), "the active profile is a table again and every module loads").toEqual(["table", true, 0]);
  expect(addon.eval("return ns.ProfileNames()"), "the profile list holds the good ones only").toEqual(["Default", "Main"]);
  expect(addon.eval("return VanguardDB.profiles.Main.theme.font"), "a good profile is kept as it was").toBe("client");
});

it("settings tables are filled once per profile and key", () => {
  // TEST-ONLY spies: count ns.Fill calls, a migration's runs and profile-change notices.
  const addon = loggedIn(`__fills, __migs, __changes = 0, 0, 0
    local realFill = ns.Fill
    ns.Fill = function(...) __fills = __fills + 1 return realFill(...) end
    ns.Migrate("TESTONLY", function(saved) __migs = __migs + 1 end)
    ns.OnProfileChanged(function() __changes = __changes + 1 end)`);
  addon.eval("__fills = 0");
  expect(addon.eval("local a, b = ns.Theme.Settings(), ns.Settings('theme') return { a == b, a == VanguardDB.profiles.Default.theme, __fills }"), "a second lookup returns the same table without filling it").toEqual([true, true, 0]);
  expect(addon.eval("ns.Theme.Settings().sounds = false VanguardDB.profiles.Default.theme.smoothBars = false return { VanguardDB.profiles.Default.theme.sounds, ns.Theme.Settings().smoothBars, __fills }"), "writes through the cached table and the saved one are the same writes").toEqual([false, false, 0]);
  expect(addon.eval("local old = ns.Theme.Settings() ns.UseProfile('Raid') return { ns.Theme.Settings() == old, old == VanguardDB.profiles.Default.theme, VanguardCharDB.profile, VanguardCharDB.pendingProfile, __fills, __changes }"), "a staged profile switch leaves the cache handing out the running profile's table").toEqual([true, true, "Default", "Raid", 0, 0]);
  expect(addon.eval("local old = ns.Theme.Settings() ns.ApplyPendingProfile() local new = ns.Theme.Settings() return { new ~= old, new == VanguardDB.profiles.Raid.theme, new.sounds, __fills, ns.Theme.Settings() == new, __fills, __changes }"), "once the profile is applied it is a new table, filled once").toEqual([true, true, true, 1, true, 1, 1]);
  expect(addon.eval("ns.Profile().theme = { accent = { 0, 1, 0 } } local t = ns.Theme.Settings() return { t == ns.Profile().theme, t.accent[2], t.panel[4], __fills }"), "a write that replaces the saved table is seen without a notice").toEqual([true, 1, 0.94, 2]);
  expect(addon.eval("local a = ns.Settings('TESTONLY', { x = 1 }) local b = ns.Settings('TESTONLY', { y = 2 }) local c = ns.Settings('TESTONLY') return { a == b, b == c, c.x, c.y, __fills, __migs }"), "other defaults fill the same table again; none reuses it").toEqual([true, true, 1, 2, 4, 1]);
  expect(addon.eval("local a = ns.Settings('TESTONLY') ns.ProfileChanged() local b = ns.Settings('TESTONLY') return { a == b, __fills, __migs, __changes }"), "a notice refills the table, but its migration ran once").toEqual([true, 5, 1, 2]);
  expect(addon.eval("ns.Profile().TESTONLY = {} ns.Settings('TESTONLY') return __migs"), "a new table is migrated").toBe(2);
  addon.eval("ns.Profile().theme.panel = { 1, 0, 0, 1 }");
  expect(addon.eval("ns.CopyProfile('Default') local copied = __changes ns.ResetProfile() local reset = __changes return { copied, reset, ns.Theme.Settings().panel[4] }"), "copy and reset notify, and the settings are filled again").toEqual([3, 4, 0.94]);
  expect(addon.eval(`local text = ns.ExportProfile('theme') ns.Theme.Settings().accent = { 1, 1, 1 } ns.ImportProfile(text) return { __changes, ns.Theme.Settings().accent[1] == ns.Theme.PRESETS.brass[1] }`), "a module import notifies and is used").toEqual([5, true]);
  addon.slash("accent ff0000");
  addon.slash("accent reset");
  expect(addon.eval("return { ns.Theme.Accent() == ns.Theme.PRESETS.brass[1], ns.Theme.Settings().accent[4] }"), "/vg accent reset puts the default accent into the cached table").toEqual([true, 1]);
});

it("the account file's version is read and upgraded", () => {
  const spy = "__mig = {} local real = ns.MigrateDB ns.MigrateDB = function(from, to) __mig[#__mig + 1] = { from, to } return real(from, to) end";
  const stamped = loggedIn(spy, { savedVariables: "VanguardDB.version = nil" });
  expect(stamped.eval("return __mig"), "a file without a stamp is upgraded from 0").toEqual([[0, 2]]);
  expect(stamped.eval("return VanguardDB.version"), "and stamped").toBe(2);
  expect(loggedIn(spy).eval("return __mig"), "a current file runs nothing").toEqual({});
  const newer = loggedIn(spy, { savedVariables: "VanguardDB.version = 7" });
  expect(newer.eval("return __mig"), "a newer addon's file is left alone").toEqual({});
  expect(newer.eval("return VanguardDB.version"), "and never downgraded").toBe(7);
  const fresh = loggedIn(spy, { firstRun: true });
  expect(fresh.eval("return { #__mig, VanguardDB.version }"), "a fresh install is stamped without an upgrade").toEqual([0, 2]);
  expect(fresh.eval('ns.UpgradeDB(2, function(db) db.marker = "a" end) ns.UpgradeDB(3, function(db) db.marker = db.marker .. "b" end) ns.UpgradeDB(4, function() error("boom") end) local ok = ns.MigrateDB(1, 3) return { ok, VanguardDB.marker, VanguardDB.version }'), "registered steps run in order and stamp each").toEqual([true, "ab", 3]);
  expect(fresh.eval("local n = #ns.errors local ok = ns.MigrateDB(3, 4) return { ok, VanguardDB.version, #ns.errors - n }"), "a failing step is logged, stops the chain and leaves the stamp for a retry").toEqual([false, 3, 1]);
  expect(fresh.eval("return ns.MigrateDB(3, 1)"), "a target below the stamp has nothing to run").toBe(true);
});

it("a failing first upgrade step on an unstamped file is retried at the next login", () => {
  const boom = 'ns.UpgradeDB(1, function() error("boom") end)';
  for (const bad of ["VanguardDB.version = nil", 'VanguardDB.version = "old"']) {
    const addon = loggedIn(boom, { savedVariables: bad });
    expect(addon.eval("return VanguardDB.version"), "the stamp stays at 0 so the step runs again: " + bad).toBe(0);
  }
  const ok = loggedIn('ns.UpgradeDB(1, function(db) db.ran = true end)', { savedVariables: "VanguardDB.version = nil" });
  expect(ok.eval("return { VanguardDB.ran, VanguardDB.version }"), "a step that works runs once and stamps").toEqual([true, 2]);
});

it("modules", () => {
  const addon = loggedIn(`
    ns.Module("Good", { defaults = { size = 3 }, Enable = function(s) __size = s.size end })
    ns.Module("Bad", { Enable = function() error("boom") end })
    ns.Module("Off", { Enable = function() __off = true end })
  `, { savedVariables: 'VanguardDB = { profiles = { Default = { modules = { Off = false } } } }' });
  expect(addon.eval("return __size") === 3, "a module is enabled with its defaults").toBeTruthy();
  expect(chatHas(addon, /module Bad: .*boom  \(once per error; \/vg errors has the stack\)/), "a failing module is reported once to chat").toBeTruthy();
  expect(addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('module Bad: ') then return e.count end end"), "and kept with a count").toBe(1);
  expect(addon.eval("return ns.GetModule('Bad').enabled") === false, "a failing module is marked not enabled").toBeTruthy();
  expect(addon.eval("return __off") === null, "a module turned off in the profile is not enabled").toBeTruthy();
  addon.slash("disable Good");
  expect(addon.eval("return ns.ModuleEnabled('Good')") === false, "/vg disable turns a module off").toBeTruthy();
});

it("modules: a module whose saved settings fail to upgrade is reported, and the modules after it still load", () => {
  const addon = loggedIn(`
    ns.Migrate("TESTONLY_Broken", function(saved) return saved.layout >= 2 end)
    ns.Module("TESTONLY_Broken", { defaults = {}, Enable = function() __broken = true end })
    ns.Module("TESTONLY_After", { Enable = function() __after = true end })
  `, { savedVariables: 'VanguardDB.profiles = { Default = { TESTONLY_Broken = { layout = "TEST-ONLY" }, DataBars = { layout = "TEST-ONLY" } } }' });
  expect(addon.eval("return { __broken == nil, __after, ns.GetModule('TESTONLY_Broken').enabled, ns.GetModule('TESTONLY_After').enabled }"), "the broken module is off, the next one loads").toEqual([true, true, false, true]);
  expect(addon.eval("return { ns.GetModule('DataBars').enabled, ns.GetModule('Tooltips').enabled, ns.GetModule('ClickCast').enabled }"), "a damaged DataBars table stops DataBars only").toEqual([false, true, true]);
  expect(addon.eval("local t = {} for _, e in ipairs(ns.errors) do t[#t + 1] = e.text:match('^[^:]+') end return t"), "each failure is reported under its module").toEqual(["module DataBars", "module TESTONLY_Broken"]);
});

it("combat queue", () => {
  const addon = loggedIn();
  addon.eval("__wfgStub.inCombat = true; ns.OutOfCombat(function() __ran = (__ran or 0) + 1 end)");
  expect(addon.eval("return __ran") === null, "work waits during combat").toBeTruthy();
  expect(addon.eval("return ns.QueuedCount()") === 1, "queued work is counted").toBeTruthy();
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval("return __ran") === 1, "queued work runs once after combat").toBeTruthy();
  addon.eval("ns.OutOfCombat(function() __ran = __ran + 1 end)");
  expect(addon.eval("return __ran") === 2, "out of combat, work runs at once").toBeTruthy();
});

it("combat queue: a key replaces its entry, in place", () => {
  const addon = loggedIn();
  addon.eval("__wfgStub.inCombat = true __n = 0 for i = 1, 50 do ns.OutOfCombat(function() __n = __n + i end, 'k') end");
  expect(addon.eval("return ns.QueuedCount()"), "50 calls with one key queue one entry").toBe(1);
  setCombat(addon, false);
  expect([addon.eval("return __n"), addon.eval("return ns.QueuedCount()")], "the latest closure runs, once").toEqual([50, 0]);
  addon.eval(`__wfgStub.inCombat = true __o = {}
    ns.OutOfCombat(function() __o[#__o + 1] = 'a' end)
    ns.OutOfCombat(function() __o[#__o + 1] = 'b1' end, 'k')
    ns.OutOfCombat(function() __o[#__o + 1] = 'c' end)
    ns.OutOfCombat(function() __o[#__o + 1] = 'b2' end, 'k')`);
  expect(addon.eval("return ns.QueuedCount()"), "unkeyed calls still append, a repeated key does not").toBe(3);
  setCombat(addon, false);
  expect(addon.eval("return __o"), "a replaced key keeps its slot").toEqual(["a", "b2", "c"]);
  addon.eval("__wfgStub.inCombat = true ns.OutOfCombat(function() __n = 100 end, 'k')");
  expect(addon.eval("return ns.QueuedCount()"), "after the flush the same key queues afresh").toBe(1);
  setCombat(addon, false);
  addon.eval("ns.OutOfCombat(function() __n = __n + 1 end, 'k')");
  expect([addon.eval("return __n"), addon.eval("return ns.QueuedCount()")], "out of combat a keyed call runs at once").toEqual([101, 0]);
});

// How often the pinned test frame's pin ran.
const pinCalls = (addon) => addon.eval("return __calls");

// The pinned test frame's anchor point name ("several" when it has more than one).
const pinPoint = (addon) => addon.eval("local n = next(__pinTarget.__points) return next(__pinTarget.__points, n) == nil and n or 'several'");

// TEST-ONLY pin: the game's hooksecurefunc (a post-hook on a table's method) and a frame Vanguard pins.
const PIN_ENV = `
  hooksecurefunc = function(a, b, c)
    if type(a) == "string" then a, b, c = _G, a, b end
    local orig = a[b]
    if type(orig) ~= "function" then return end
    a[b] = function(...) local r = orig(...) c(...) return r end
  end
  __pinTarget = CreateFrame("Frame", "Vanguard_PinTest", UIParent)
  __calls, __boom = 0, false
  ns.Pin(__pinTarget, function(f)
    __calls = __calls + 1
    if __boom then error("boom") end
    f:ClearAllPoints() f:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  end)
`;

it("pins: a throwing apply is reported and the pin keeps working", () => {
  const addon = loggedIn(PIN_ENV);
  expect([addon.eval("return __pinTarget.vgPinned"), pinCalls(addon), pinPoint(addon)], "the pin is hooked and applied at registration").toEqual([true, 1, "CENTER"]);
  addon.eval("__boom = true __pinTarget:SetPoint('TOPLEFT', UIParent, 'TOPLEFT', 1, 1)");
  expect(addon.eval("return __pinTarget.vgPinning"), "the flag clears after a failing apply").toBe(false);
  expect(addon.eval("return ns.errors[#ns.errors].text"), "the failure is kept for /vg errors under the frame's name").toMatch(/^pin Vanguard_PinTest: .*boom/);
  addon.eval("__boom = false __pinTarget:SetPoint('TOPLEFT', UIParent, 'TOPLEFT', 2, 2)");
  expect([pinCalls(addon), pinPoint(addon)], "the next move of the frame is put back").toEqual([3, "CENTER"]);
  addon.eval("__boom = true __pinTarget:SetPoint('TOPLEFT', UIParent, 'TOPLEFT', 3, 3) __pinTarget:SetPoint('TOPLEFT', UIParent, 'TOPLEFT', 4, 4)");
  expect(addon.eval("local n, c = 0 for _, e in ipairs(ns.errors) do if e.text:find('^pin Vanguard_PinTest') then n, c = n + 1, e.count end end return { n, c }"), "a repeating failure is one entry with a count").toEqual([1, 3]);
  const plain = loggedIn(`hooksecurefunc = function() end __bare = CreateFrame("Frame", nil, UIParent) ns.Pin(__bare, function() error("bare") end)`);
  expect(plain.eval("for _, e in ipairs(ns.errors) do if e.text:find('^pin ') then return e.text end end"), "a frame with no name is reported as 'frame'").toMatch(/^pin frame: .*bare/);
});

it("pins: any number of game moves in combat leave one pending pin", () => {
  const addon = loggedIn(PIN_ENV);
  setCombat(addon, true);
  addon.eval("for i = 1, 50 do __pinTarget:SetPoint('TOPLEFT', UIParent, 'TOPLEFT', i, i) end");
  expect([addon.eval("return ns.QueuedCount()"), pinCalls(addon), pinPoint(addon)], "50 moves queue one pin and run nothing in combat").toEqual([1, 1, "several"]);
  addon.eval("ns.PausePins(true) ns.PausePins(false)");
  expect(addon.eval("return ns.QueuedCount()"), "ending a pause in combat joins the same entry (and queues the chat window's own pin, the one other pinned frame)").toBe(2);
  setCombat(addon, false);
  expect([addon.eval("return ns.QueuedCount()"), pinCalls(addon), pinPoint(addon)], "after combat the pin runs once and puts the frame back").toEqual([0, 2, "CENTER"]);
});

it("slash", () => {
  const addon = loggedIn();
  addon.slash("help");
  expect(chatHas(addon, /unlock \| lock/), "/vg help lists commands").toBeTruthy();
  addon.slash("status");
  expect(chatHas(addon, /profile Default/), "/vg status shows the profile").toBeTruthy();
  addon.slash("profile Raid");
  expect(addon.eval("return { VanguardCharDB.profile, VanguardCharDB.pendingProfile }"), "/vg profile stages this character's switch until the reload").toEqual(["Default", "Raid"]);
  addon.clearChat();
  addon.slash("bogus");
  expect(chatHas(addon, /Unknown command/), "unknown commands say so").toBeTruthy();
});

it("/vg stock with the Errands module off says so instead of failing", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB.profiles = { Default = { modules = { Errands = false } } }" });
  for (const command of ["stock", "stock item:90011 5", "stock clear"]) {
    addon.clearChat();
    addon.slash(command);
    expect(Array.from(addon.chat()), "/vg " + command).toEqual([expect.stringMatching(/Errands are off \(\/vg > Modules\)\.$/)]);
  }
});

// The chat lines printed by one /vg command, without the colored "Vanguard:" prefix.
const said = (addon, command) => {
  addon.clearChat();
  addon.slash(command);
  return Array.from(addon.chat()).map((line) => line.replace(/^.*Vanguard:\S*\s/, ""));
};

it("/vg perf: says what it can without the game's counters", () => {
  const addon = loggedIn("GetCVar = nil C_CVar = nil SetCVar = nil C_Timer = nil");
  expect(said(addon, "perf"), "no profiling setting and no memory counter: it says so, and lists nothing").toEqual(["CPU off (/vg perf cpu turns the game's profiling on)  ·  memory: the client can't say"]);
  expect(said(addon, "perf cpu"), "no way to switch profiling").toEqual(["This client can't switch script profiling."]);
  expect(said(addon, "perf watch"), "no timers to print with").toEqual(["This client has no timers to print with."]);
  expect(said(addon, "perf bogus"), "anything else: the usage").toEqual(["Usage: /vg perf [cpu | watch]"]);
});

it("/vg frame: a frame's state, anchors and parents, and with deep its textures and child frames", () => {
  const addon = loggedIn();
  addon.eval(`local f = CreateFrame("Frame", "ProbeFrame", UIParent) f:SetSize(30, 20) f:SetPoint("CENTER", UIParent, "CENTER", 1, -2.5) f:SetAlpha(0.5) f:SetScale(2)
    local t = f:CreateTexture(nil, "ARTWORK") t:SetTexture("Probe/Art") t:SetAlpha(0) t:SetSize(10, 10) t:SetPoint("CENTER")
    local c = CreateFrame("Frame", "ProbeChild", f) c:Hide() f.Child = c`);
  const lines = said(addon, "frame ProbeFrame deep");
  expect(lines[0], "the first line: the frame's own state, where its rect is, and its parent").toMatch(/^ProbeFrame \(Frame\): shown yes, visible yes, alpha 0\.5 \(effective .*\), scale 2 \(effective 2\), 30 x 20 at 466, 257\.5, strata .* level \d+, under UIParent$/);
  expect(lines[1], "then each anchor").toBe("  CENTER to UIParent CENTER 1, -2.5");
  expect(lines[2], "then every ancestor's shown state").toBe("  under UIParent: shown yes, alpha 1, scale 1");
  expect(lines.slice(3), "deep: the regions and child frames, counted, one line each").toEqual([
    "  1 region(s):",
    expect.stringMatching(/^  \(unnamed Texture\) \(Texture\): shown yes, alpha 0, 10 x 10 at 476, 262\.5, layer ARTWORK, file Probe\/Art$/),
    "  1 child frame(s):",
    expect.stringMatching(/^  ProbeChild \(Frame\): shown no, alpha 1, 0 x 0 no rect, level \d+$/),
  ]);
  expect(said(addon, "frame ProbeFrame.Child"), "a dotted name follows keys from the global; an unanchored frame has no rect; without deep, no parts").toEqual([
    expect.stringMatching(/^ProbeChild \(Frame\): shown no, visible no, .*, 0 x 0 no rect, .*, under ProbeFrame$/), "  no anchors",
    "  under ProbeFrame: shown yes, alpha 0.5, scale 2", "  under UIParent: shown yes, alpha 1, scale 1"]);
  expect(said(addon, "frame Nope"), "a name that leads nowhere says so").toEqual(["No frame called Nope (a global name; dots follow keys: MinimapCluster.Tracking)."]);
  expect(said(addon, "frame"), "no name: the usage").toEqual(["Usage: /vg frame <name> [deep]   (a global frame name; dots follow keys: MinimapCluster.Tracking)"]);
});

// TEST-ONLY counters: Vanguard's CPU total (__cpu ms) and memory (2048 KB), each refreshed by its Update call (counted).
const PERF_ENV = `
  __cpu, __updates = 0, { cpu = 0, mem = 0 }
  UpdateAddOnCPUUsage = function() __updates.cpu = __updates.cpu + 1 end
  GetAddOnCPUUsage = function(name) return name == "Vanguard" and __cpu or 0 end
  UpdateAddOnMemoryUsage = function() __updates.mem = __updates.mem + 1 end
  GetAddOnMemoryUsage = function(name) return name == "Vanguard" and 2048 or 0 end
`;

it("/vg perf: CPU and memory with the change since the last report, the busiest functions, profiling and the watch", () => {
  const addon = loggedIn(PERF_ENV);
  expect(said(addon, "perf"), "profiling off: memory only").toEqual(["CPU off (/vg perf cpu turns the game's profiling on)  ·  memory 2.0 MB"]);
  addon.eval("ns.OfferReload = function(why) __reload = why end");
  said(addon, "perf cpu");
  expect(addon.eval("return { GetCVar('scriptProfile'), __reload:find('starts after a reload') ~= nil }"), "perf cpu turns profiling on, with a reload offered").toEqual(["1", true]);
  expect(said(addon, "perf")[0], "on, but not yet reloaded: the counter is still 0").toBe("CPU: profiling starts after a reload  ·  memory 2.0 MB");
  // Every named function costs 1 ms, two of them more (callees included).
  addon.eval(`__busy = { [ns.Theme.Panel] = 50, [ns.GetModule("Bags").SkinWindow] = 20 }
    GetFunctionCPUUsage = function(fn, callees) __callees = callees return __busy[fn] or 1, 1 end
    __cpu = 120`);
  const report = said(addon, "perf");
  expect(report.slice(0, 3), "the total, then the busiest functions, most first").toEqual(["CPU 120.0 ms in all  ·  memory 2.0 MB", "  1. Theme.Panel  50.0 ms", "  2. Bags.SkinWindow  20.0 ms"]);
  expect([report.length, addon.eval("return __callees"), addon.eval("return { __updates.cpu, __updates.mem }")], "ten of them at most, with what they call, after refreshing both counters").toEqual([11, true, [2, 3]]);
  addon.eval("__cpu = 150");
  addon.advance(60, 5);
  expect(said(addon, "perf")[0], "the change since the last report, and its rate").toBe("CPU 150.0 ms in all, +30.0 ms in the last 60 s (0.50 ms/s)  ·  memory 2.0 MB");
  expect(said(addon, "perf watch"), "watch says how often it prints").toEqual(["Printing Vanguard's CPU and memory every 60 s; /vg perf watch again stops."]);
  addon.clearChat();
  addon.eval("__cpu = 156");
  addon.advance(60, 5);
  expect(Array.from(addon.chat()).length, "a minute later: one line, no function list").toBe(1);
  expect(said(addon, "perf watch"), "asked again, it stops").toEqual(["Stopped printing Vanguard's CPU and memory."]);
  addon.advance(120, 5);
  expect(Array.from(addon.chat()).length, "and prints nothing more").toBe(1);
  addon.eval("GetAddOnCPUUsage = nil");
  expect(said(addon, "perf")[0], "profiling on with no counter").toBe("CPU: the client has no counter  ·  memory 2.0 MB");
  said(addon, "perf cpu");
  expect(addon.eval("return { GetCVar('scriptProfile'), __reload }"), "perf cpu again turns it off").toEqual(["0", "CPU profiling stops after a reload."]);
});

// Every distinct command word that follows "/vg " in the text, in order of first use.
const vgWords = (text) => [...new Set([...text.matchAll(/\/vg ([a-z]+)/g)].map((m) => m[1]))];

// The owner's checklist, as text.
const smokeText = () => fs.readFileSync(path.join(root, "docs", "SMOKE-TEST.md"), "utf8");

it("smoke-test checklist: every /vg command it names is real", () => {
  const words = vgWords(smokeText());
  expect(words).toEqual(expect.arrayContaining(["status", "errors", "setup", "unlock", "lock", "profile", "import", "export", "binds", "reset", "frames", "quests"]));
  const addon = loggedIn();
  const unknown = words.filter((word) => {
    addon.clearChat();
    addon.slash(word);
    return chatHas(addon, /Unknown command/);
  });
  expect(unknown).toEqual([]);
});

// How many lines of the text start with this label (the checklist's "- Do:" lines and so on).
const lineCount = (text, label) => text.split("\n").filter((l) => l.startsWith(label)).length;

it("smoke-test checklist: every step has its Do, Expect and paste lines", () => {
  const text = smokeText();
  const steps = lineCount(text, "### ");
  expect(lineCount(text, "- Do:")).toBe(steps);
  expect(lineCount(text, "- Expect:")).toBe(steps);
  expect(lineCount(text, "- If it fails, paste:")).toBe(steps);
  expect(steps).toBeGreaterThanOrEqual(30);
});

// Whether any shown font string reads exactly `text`.
const shownText = (addon, text) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  local shown, f = true, w
  while f do if not f.__shown then shown = false end f = f.__parent end
  if shown and w.__kind == "FontString" and w.__text == "${text}" then return true end
end return false`);

it("WoW Forever client: interface, hidden auras, no specializations", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + HEALING_ENV + FOREVER_ENV);
  expect(addon.eval("return ns.IsForever()") === true, "a 1.x interface number (16001) is WoW Forever").toBeTruthy();
  addon.eval('__spawn(1, "raid1")');
  expect(healing(addon, 1).missing === "TEST-ONLY-ICON-Arcane Intellect", "readable auras: a missing buff is marked").toBeTruthy();
  addon.eval("__secretAuras = true");
  addon.fire("UNIT_AURA", "raid1");
  expect(healing(addon, 1).missing === false, "while auras are hidden, an unseen buff is unknown, not missing").toBeTruthy();
  addon.eval("__secretAuras = { __secret = true }");
  addon.fire("UNIT_AURA", "raid1");
  expect(healing(addon, 1).missing === false, "a hidden answer to 'are auras hidden?' counts as hidden").toBeTruthy();
  addon.eval("C_Secrets.ShouldAurasBeSecret = function() error('TEST-ONLY') end");
  expect(addon.eval("return ns.AurasSecret()") === true, "an error counts as hidden").toBeTruthy();
  addon.eval("C_Secrets.ShouldAurasBeSecret = function() return __secretAuras end __secretAuras = false");
  setCombat(addon, false);
  expect(healing(addon, 1).missing === "TEST-ONLY-ICON-Arcane Intellect", "leaving combat looks at every buff again").toBeTruthy();
  addon.slash("status");
  expect(chatHas(addon, /Client WoW Forever {2}· {2}build 1\.16\.0 \(TEST-ONLY\) {2}· {2}auras on the engine {2}· {2}aura values readable/), "/vg status names the client, its build and the aura state").toBeTruthy();
  expect(chatHas(addon, /aura values readable {2}· {2}secure snippets: yes/), "and whether secure snippets work").toBe(true);
  addon.slash("spec Default");
  expect(chatHas(addon, /no specializations/), "/vg spec explains there are no specializations").toBeTruthy();
  addon.eval('ns.Options.Show("profiles")');
  expect(shownText(addon, "YOUR PROFILES") && !shownText(addon, "SPECIALIZATION"), "the Profiles page has no spec section").toBeTruthy();
  // The names are read once per login (or list change), so a paladin is a new login here.
  addon.eval('UnitClass = function() return "Paladin", "PALADIN" end ns.GetModule("RaidHealing").Forget()');
  expect(addon.eval('for _, n in ipairs(ns.GetModule("RaidHealing").BuffNames()) do if n == "Greater Blessing of Kings" then return true end end'), "any blessing counts for a paladin").toBeTruthy();
});

it("a retail client is not WoW Forever and keeps its aura state readable", () => {
  const addon = loggedIn('GetBuildInfo = function() return "12.0.7", "TEST-ONLY", "Sep 1 2026", 120007 end');
  expect(addon.eval("return ns.IsForever()") === false && addon.eval("return ns.AurasSecret()") === false, "120007 is retail; no C_Secrets means readable").toBeTruthy();
  addon.slash("status");
  expect(chatHas(addon, /Client Retail/), "/vg status says Retail").toBeTruthy();
});

// The reload overlay on a button as [type, macro, key-down, sits above the button, template, clicks], or false.
const reloadOverlay = (addon, path) => addon.eval(`local b = ${path} local o = b.reloadOverlay
  return o and { o:GetAttribute("type"), o:GetAttribute("macrotext"), o:GetAttribute("useOnKeyDown"), o:GetFrameLevel() > b:GetFrameLevel(), o.__template, o.__clicks } or false`);

// The next session of an addon: the client writes SavedVariables at logout and
// loads them back before ADDON_LOADED; extra Lua runs before login.
function nextSession(addon, extra = "") {
  addon.fire("PLAYER_LOGOUT");
  const sv = addon.savedVariables();
  const next = createAddon({ savedVariables: `VanguardDB = ${luaValue(sv.account)}\nVanguardCharDB = ${luaValue(sv.char)}\n` });
  if (extra) next.eval(extra);
  next.login();
  return next;
}

it("a session: what you set in one login comes back in the next", () => {
  const staged = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA);
  staged.slash("profile TEST-ONLY Alt");
  // The switch applies at the next load, so the settings below are made on that profile.
  const first = nextSession(staged, UNITS_ENV + RAID_ENV + CLICK_LUA);
  first.slash("accent arcane");
  first.slash("disable Minimap");
  first.eval('ns.Settings("UnitFrames").healthFormat = "percent" ns.Settings("RaidFrames").look = "dark"');
  first.eval('ns.SetMoverPoint("uf_player", "TOPLEFT", "TOPLEFT", 40, -60)');
  const next = nextSession(first, UNITS_ENV + RAID_ENV + CLICK_LUA);
  expect(next.eval("return ns.ProfileName()"), "the character is still on its profile").toBe("TEST-ONLY Alt");
  expect(next.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]"), "the accent is kept").toBe(true);
  expect(next.eval("return ns.ModuleEnabled('Minimap')"), "a module turned off stays off").toBe(false);
  expect(next.eval('return { ns.Settings("UnitFrames").healthFormat, ns.Settings("RaidFrames").look }'), "module settings are kept").toEqual(["percent", "dark"]);
  expect(next.eval('return { ns.MoverPoint("uf_player") }'), "a moved frame stays where you put it").toEqual(["TOPLEFT", "TOPLEFT", 40, -60]);
  expect(next.eval("return Vanguard_Setup == nil or not Vanguard_Setup:IsShown()"), "setup doesn't come back").toBe(true);
  const third = nextSession(next, UNITS_ENV + RAID_ENV + CLICK_LUA);
  expect(third.eval("return ns.ProfileName()"), "and it holds for a third session").toBe("TEST-ONLY Alt");
});

const CLIENT_KEYS = ["auraContainer", "pixelUtil", "eventValid", "barEase", "cooldownObject", "cooldownMin", "countdownText", "keyPropagate", "damageMeter", "cooldownViewer", "swingTimer", "meterEnums"];

// TEST-ONLY: a client whose Enum lacks the four tables the capability probe asks about (the rest of the stub's Enum stays, as on the client).
const NO_PROBE_ENUMS = "Enum.StatusBarInterpolation, Enum.PlayerSwingType, Enum.DamageMeterSessionType, Enum.DamageMeterType = nil, nil, nil, nil ";

// TEST-ONLY: a client that has every optional call the probe asks about.
const CLIENT_FULL_ENV = `
  Enum.StatusBarInterpolation.ExponentialEaseOut = 1
  Enum.DamageMeterSessionType, Enum.DamageMeterType = { Current = 1 }, { Dps = 1 }
  PixelUtil = { GetNearestPixelSize = function() return 1 end }
  C_EventUtils = { IsEventValid = function() return true end }
  C_DamageMeter = { GetCombatSessionFromType = function() end }
  C_CooldownViewer = { IsCooldownViewerAvailable = function() return true end }
  C_SwingTimer = {}
`;

it("client capability probe: what this client has, and /vg status says so", () => {
  const full = loggedIn(UNITS_ENV + CLIENT_FULL_ENV);
  expect(full.eval("return ns.Client.has"), "a client with everything: every flag is true").toEqual({ ...Object.fromEntries(CLIENT_KEYS.map((k) => [k, true])), secureSnippets: true });
  full.slash("status");
  expect(chatHas(full, /Client has: auraContainer, pixelUtil, eventValid, barEase, cooldownObject, cooldownMin, countdownText, keyPropagate, damageMeter, cooldownViewer, swingTimer, meterEnums {2}· {2}lacks: none/), "/vg status lists them in a fixed order").toBe(true);
  const bare = loggedIn();
  expect(bare.eval("return ns.Client.has"), "the default test world: its namespaces are found, the widget flags come from the widget list, what it lacks is false").toEqual({
    auraContainer: true, pixelUtil: false, eventValid: true, barEase: false, cooldownObject: true, cooldownMin: true, countdownText: true,
    keyPropagate: true, damageMeter: true, cooldownViewer: true, swingTimer: true, meterEnums: false, secureSnippets: true });
  bare.slash("status");
  expect(chatHas(bare, /Client has: auraContainer, eventValid, cooldownObject, cooldownMin, countdownText, keyPropagate, damageMeter, cooldownViewer, swingTimer {2}· {2}lacks: pixelUtil, barEase, meterEnums$/), "and the lacking ones are named").toBe(true);
  const noCooldown = loggedIn(`local real = CreateFrame
    CreateFrame = function(kind, ...) if kind == "Cooldown" then error("TEST-ONLY: no cooldown frames") end return real(kind, ...) end`);
  expect(noCooldown.eval("return { ns.Client.has.cooldownObject, ns.Client.has.cooldownMin, ns.Client.has.countdownText, ns.Client.has.keyPropagate }"), "a client that cannot make a Cooldown frame has none of its methods, and the probe does not fail").toEqual([false, false, false, true]);
  // [barEase, meterEnums, swingTimer] on a client with this Lua defined.
  const half = (lua) => loggedIn(NO_PROBE_ENUMS + lua).eval("return { ns.Client.has.barEase, ns.Client.has.meterEnums, ns.Client.has.swingTimer }");
  expect(half("Enum.StatusBarInterpolation, Enum.DamageMeterSessionType, Enum.DamageMeterType = {}, {}, { Dps = 1 }"), "enums without the values asked for do not count").toEqual([false, false, false]);
  expect(half("Enum.DamageMeterSessionType, Enum.DamageMeterType = { Current = 1 }, {}"), "the damage meter needs both enum values").toEqual([false, false, false]);
  expect(half("Enum.StatusBarInterpolation = { ExponentialEaseOut = 1 } C_SwingTimer = {}"), "the swing timer needs its enum as well").toEqual([true, false, false]);
});

// TEST-ONLY: a client with none of them: no aura container, no cooldown calls, no key propagation.
const CLIENT_NONE_ENV = `
  __wfgStub.noAuraContainer = true
  for _, m in ipairs({ "SetCooldownFromDurationObject", "SetMinimumCountdownDuration", "GetCountdownFontString" }) do __wfgWidgetApi.methods.Cooldown[m] = nil end
  for _, kind in pairs(__wfgWidgetApi.methods) do kind.SetPropagateKeyboardInput = nil end
  C_EventUtils, C_DamageMeter, C_CooldownViewer, C_SwingTimer = nil, nil, nil, nil
`;

it("client capability probe: every flag off, every module still enables", () => {
  const addon = loggedIn(UNITS_ENV + ACTIONS_ENV + TOTEMS_ENV + ENGINE_ENV + CLIENT_NONE_ENV);
  expect(addon.eval("return ns.Client.has"), "a client with none of the optional calls").toEqual({ ...Object.fromEntries(CLIENT_KEYS.map((k) => [k, false])), secureSnippets: true });
  // The modules that are on in the settings but did not enable, on a client with and without the calls.
  const notEnabled = (a) => a.eval(`local out = {} for _, n in ipairs(ns.ModuleNames()) do
    local d = ns.GetModule(n) if d.Enable and ns.ModuleEnabled(n) and d.enabled ~= true then out[#out + 1] = n end end return out`);
  const baseline = loggedIn(UNITS_ENV + ACTIONS_ENV + TOTEMS_ENV + ENGINE_ENV);
  expect(notEnabled(addon), "every module enables as it does on a client with the calls").toEqual(notEnabled(baseline));
  expect(addon.eval("return Vanguard_Bar1Button1.cooldown.__countdown == nil"), "an action button asks for no cooldown number font").toBe(true);
  expect(totemCell(addon, 1), "a totem is timed by its start and length").toMatchObject({ sweep: [100, 120] });
  expect(totemCell(addon, 1).object, "and is given no duration object").toBeUndefined();
  expect(addon.eval(`local b = CreateFrame("StatusBar") ns.Theme.Settings().smoothBars = true ns.Theme.SetBarValue(b, 5) return { v = b:GetValue(), ease = b.__ease or "none" }`), "a bar is set without easing").toEqual({ v: 5, ease: "none" });
  // The texts of the errors an addon has caught.
  // An empty Lua table comes back as {} in the headless client, so read the values either way.
  const errs = (a) => Object.values(a.eval("local o = {} for _, e in ipairs(ns.errors) do o[#o + 1] = e.text end return o"));
  expect(errs(addon).filter((e) => !errs(baseline).includes(e)), "the missing aura container is the one thing reported more").toEqual([expect.stringMatching(/^aura containers \(using Vanguard's own icons\): .*unknown frame type AuraContainer$/)]);
  expect(addon.eval(`local h
    UIParent:SetSize(1920, 1080)
    local f = CreateFrame("Frame", nil, UIParent) f:SetSize(100, 20)
    ns.Mover(f, "a", "A", { "CENTER", "CENTER", 0, 0 }) ns.Unlock()
    for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "a" then h = w end end
    h:GetScript("OnMouseDown")(h) h:GetScript("OnKeyDown")(h, "UP")
    local p = VanguardDB.profiles.Default.positions.a
    return p and p.y`), "unlock mode: the arrow keys still nudge").toBe(1);
  const quest = loggedIn(QUEST_ENV + CLIENT_NONE_ENV);
  key(quest, "ESCAPE");
  expect(quest.eval("return ns.ModuleEnabled('QuestDialogView') and Vanguard_QuestDialog ~= nil"), "the quest dialog takes keys without propagation").toBe(true);
  const afk = loggedIn(UNITS_ENV + AFK_ENV + CLIENT_NONE_ENV);
  afk.eval("Vanguard_AfkScreen.__scripts.OnKeyDown(Vanguard_AfkScreen, 'ENTER')");
  expect(afk.eval("return Vanguard_AfkScreen ~= nil and ns.GetModule('AfkScreen').enabled"), "the away screen is built and put away by a key").toBe(true);
});

it("client capability probe: in a fight the aura container waits; first use probes early", () => {
  const combat = createAddon({ savedVariables: SETUP_DONE });
  combat.eval(UNITS_ENV);
  setCombat(combat, true);
  combat.login();
  expect([combat.eval("return ns.Client.has.auraContainer"), combat.eval("return ns.Client.has.cooldownMin"), combat.eval("return ns.Client.probed")], "logged in during a fight: the plain frames are probed, the aura container waits").toEqual([null, true, true]);
  expect(combat.eval("return ns.Client.Has('auraContainer')"), "a flag still waiting reads as false").toBe(false);
  combat.slash("status");
  expect(chatHas(combat, /lacks: auraContainer\?/), "and /vg status marks it as not yet known").toBe(true);
  setCombat(combat, false);
  expect(combat.eval("return ns.Client.has.auraContainer"), "after the fight it is asked").toBe(true);
  const early = createAddon({ savedVariables: SETUP_DONE });
  expect(early.eval("return ns.Client.Has('cooldownMin')"), "a call before ADDON_LOADED probes right then").toBe(true);
  early.eval("ns.Client.has.cooldownMin = 'TEST-ONLY-kept'");
  early.login();
  expect(early.eval("return ns.Client.has.cooldownMin"), "and the probe is not run again").toBe("TEST-ONLY-kept");
});

// How many lines of chat mention secure snippets (or the probe's own error report, "secure snippet probe: ...").
const snippetLines = (addon) => addon.chat().filter((l) => /secure snippet/.test(l)).length;

it("secure snippets: a client that compiles them keeps hover keys and says so in /vg status", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + "GetSpecialization = function() return 1 end");
  expect(addon.eval("return ns.Client.has.secureSnippets"), "the stub runs the probe's snippet, so the flag is true").toBe(true);
  expect(addon.eval('return Vanguard_SnippetProbe:GetAttribute("vgprobe")'), "the probe frame got the attribute the snippet wrote").toBe("ok");
  expect(snippetLines(addon), "nothing is said at login").toBe(0);
  addon.eval('ns.GetModule("ClickCast").Add("SHIFT-1", "spell", "TEST-ONLY Flash Heal") __spawn(1, "raid1")');
  expect(addon.eval("return Vanguard_RaidUnitButton1.__wraps.OnEnter"), "hover keys are wrapped").toMatch(/SetBindingClick\(true, "SHIFT-1", self, "vg1"\)/);
  addon.slash("status");
  expect(chatHas(addon, /secure snippets: yes/), "/vg status says yes").toBe(true);
});

// The caught errors that came from the snippet probe.
const probeErrors = (addon) => addon.eval(`local o = {} for _, e in ipairs(ns.errors) do
  if e.text:find("secure snippet probe", 1, true) then o[#o + 1] = e.text end end o.n = #o return o`);

it("secure snippets: a client whose snippets fail to compile turns hover keys off, once, and keeps mouse bindings", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + `GetSpecialization = function() return 1 end
    SecureHandlerExecute = function() error("TEST-ONLY: snippets do not compile") end
    __wraps = 0 local w = SecureHandlerWrapScript SecureHandlerWrapScript = function(...) __wraps = __wraps + 1 return w(...) end`);
  expect(addon.eval("return ns.Client.has.secureSnippets"), "the probe answers no").toBe(false);
  expect(snippetLines(addon), "one chat line at login").toBe(1);
  expect(addon.chat().find((l) => /secure snippets/.test(l)), "it carries the probe's error in the same line").toMatch(/\(probe: .*TEST-ONLY: snippets do not compile\)$/);
  expect(addon.chat().find((l) => /secure snippets/.test(l)), "it names the consequence").toMatch(/hover keys are off; bar 1 pages and the raid frames are set up without them/);
  addon.eval('local CC = ns.GetModule("ClickCast") CC.Add("ctrl-BUTTON2", "spell", "TEST-ONLY Renew") CC.Add("SHIFT-1", "spell", "TEST-ONLY Flash Heal") __spawn(1, "raid1")');
  expect(addon.eval('return Vanguard_RaidUnitButton1:GetAttribute("ctrl-type2")'), "mouse bindings are still set").toBe("spell");
  expect(addon.eval('return Vanguard_RaidUnitButton1:GetAttribute("*type-vg2")'), "and so is the inert virtual button").toBe("spell");
  expect(addon.eval("return __wraps"), "no SecureHandlerWrapScript call").toBe(0);
  expect(addon.eval("return Vanguard_RaidUnitButton1.vgWrapped"), "the frame is not marked wrapped").toBe(null);
  expect(addon.eval("return ns.Client.ProbeSnippets()"), "asking again answers the same").toBe(false);
  expect(snippetLines(addon), "and does not warn again").toBe(1);
  expect(probeErrors(addon).n, "the error is in the one warning, not reported to chat a second time").toBe(0);
  addon.slash("status");
  expect(chatHas(addon, /secure snippets: no \(hover keys off\)/), "/vg status says no, and what it costs").toBe(true);
});

it("secure snippets: a snippet that runs but writes nothing, and a client without the handler API, count as no", () => {
  const silent = loggedIn("SecureHandlerExecute = function() end");
  expect(silent.eval("return ns.Client.has.secureSnippets"), "no attribute came back").toBe(false);
  expect(chatHas(silent, /can't run secure snippets/), "so it says so").toBe(true);
  expect(probeErrors(silent).n, "without an error entry: nothing threw").toBe(0);
  const missing = loggedIn("SecureHandlerExecute = nil");
  expect(missing.eval("return ns.Client.has.secureSnippets"), "no API, no snippets").toBe(false);
  expect(missing.eval("return Vanguard_SnippetProbe"), "and no probe frame was made").toBe(null);
  expect(snippetLines(missing), "one warning").toBe(1);
});

it("secure snippets: logging in during a fight defers the probe, and it runs before click casting applies", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE });
  addon.eval(UNITS_ENV + RAID_ENV + CLICK_LUA + "GetSpecialization = function() return 1 end");
  setCombat(addon, true);
  addon.login();
  expect(addon.eval("return ns.Client.has.secureSnippets"), "not probed in a fight").toBe(null);
  addon.slash("status");
  expect(snippetLines(addon), "/vg status says nothing about snippets before the probe ran").toBe(0);
  expect(addon.eval("return ns.Client.ProbeSnippets()"), "asking in a fight does not probe either").toBe(null);
  setCombat(addon, false);
  expect(addon.eval("return ns.Client.has.secureSnippets"), "after the fight it is asked").toBe(true);
  addon.clearChat();
  addon.slash("status");
  expect(chatHas(addon, /secure snippets: yes/), "and /vg status then says yes").toBe(true);
  addon.eval('ns.GetModule("ClickCast").Add("SHIFT-1", "spell", "TEST-ONLY Flash Heal") __spawn(1, "raid1")');
  expect(addon.eval("return Vanguard_RaidUnitButton1.__wraps.OnLeave"), "and click casting wraps the frame").toBe("self:ClearBindings()");
});

it("secure snippets: what waits for the probe's answer runs once, after the fight, and one that fails does not stop the rest", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE });
  setCombat(addon, true);
  addon.login();
  addon.eval(`__answers = {}
    ns.Client.WhenSnippetsKnown(function() error("TEST-ONLY waiter broke") end)
    ns.Client.WhenSnippetsKnown(function(worked) __answers[#__answers + 1] = worked end)`);
  expect(addon.eval("return #__answers"), "in the fight, before the probe, nothing runs").toBe(0);
  setCombat(addon, false);
  expect(addon.eval("return __answers"), "after it, the waiter gets the answer once").toEqual([true]);
  expect(addon.eval('for _, e in ipairs(ns.errors) do if e.text:find("TEST-ONLY waiter broke", 1, true) then return e.text end end'), "the failing one is reported").toMatch(/^secure snippet fallback: .*TEST-ONLY waiter broke/);
  addon.eval("ns.Client.WhenSnippetsKnown(function(worked) __answers[#__answers + 1] = worked end)");
  expect(addon.eval("return __answers"), "a later caller is answered at once").toEqual([true, true]);
});

it("/vg errors: what Vanguard caught this session", () => {
  const addon = loggedIn();
  addon.eval("ns.ClearErrors()");
  addon.slash("errors");
  expect(chatHas(addon, /No errors caught this session/), "with nothing caught, it says so").toBe(true);
  const broken = loggedIn(`__wfgStub.noAuraContainer = true
    local M = ns.Module("TEST-ONLY Broken", {}) function M.Enable() error("TEST-ONLY boom") end`);
  broken.slash("errors");
  expect(chatHas(broken, /\d+ error\(s\) caught this session \(\d+ in all\), newest last/) && chatHas(broken, /aura containers \(using Vanguard's own icons\)/) && chatHas(broken, /module TEST-ONLY Broken: .*TEST-ONLY boom  \(x1\)/), "a module that failed and a missing aura container are both listed").toBe(true);
  broken.eval('for i = 1, 25 do ns.Report("TEST-ONLY", i) end');
  expect(broken.eval("return { #ns.errors, ns.errors[1].text }"), "only the last 20 distinct errors are kept").toEqual([20, "TEST-ONLY: 6"]);
  broken.eval('ns.Report("TEST-ONLY", 1)');
  expect(broken.eval("return { #ns.errors, ns.errors[1].text, ns.errors[20].text, ns.errors[20].count }"), "a dropped error comes back as a new entry, its old count gone").toEqual([20, "TEST-ONLY: 7", "TEST-ONLY: 1", 1]);
  expect(broken.chat().filter((l) => /TEST-ONLY: 1  \(once per error/.test(l)).length, "but chat heard of it only once, though it was dropped from the list").toBe(1);
  broken.eval("ns.ClearErrors()");
  broken.clearChat();
  broken.eval('ns.Report("TEST-ONLY", 1)');
  expect(broken.chat().filter((l) => /TEST-ONLY: 1  \(once per error/.test(l)).length, "/vg errors clear starts the session's chat lines over").toBe(1);
});

// The game's error handler and debugstack as a client has them, recording what each was given.
const ERRORS_ENV = `
  __handled = {} geterrorhandler = function() return function(msg) __handled[#__handled + 1] = msg end end
  debugstack = function(level) return "TEST-ONLY stack level " .. tostring(level) .. "\\nTEST-ONLY frame 2" end
`;

it("caught errors: one entry per distinct error, counted, with its stack, told once", () => {
  const addon = loggedIn(ERRORS_ENV);
  addon.clearChat();
  addon.eval('ns.ClearErrors() __handled = {} ns.Report("TEST-ONLY site", "boom") ns.Report("TEST-ONLY site", "boom")');
  expect(addon.eval("return { #ns.errors, ns.errors[1].text, ns.errors[1].count }"), "the same error twice is one entry with count 2").toEqual([1, "TEST-ONLY site: boom", 2]);
  expect(addon.eval("return ns.errors[1].stack"), "with the stack read from ns.Report's caller").toBe("TEST-ONLY stack level 4\nTEST-ONLY frame 2");
  expect(addon.chat().filter((l) => /TEST-ONLY site: boom/.test(l)), "chat hears about it once").toEqual([expect.stringMatching(/TEST-ONLY site: boom  \(once per error; \/vg errors has the stack\)$/)]);
  expect(addon.eval("return __handled"), "the game's handler gets the labelled text every time").toEqual(["TEST-ONLY site: boom", "TEST-ONLY site: boom"]);
  expect(addon.eval("return { ns.Try('TEST-ONLY try', function(a) error('bad ' .. a) end, 'x') }"), "ns.Try returns what pcall would on a failure").toEqual([false, expect.stringMatching(/bad x$/)]);
  expect(addon.eval("return ns.errors[#ns.errors].stack"), "and its stack is read inside xpcall's handler, before the frames unwind").toBe("TEST-ONLY stack level 4\nTEST-ONLY frame 2");
  expect(addon.eval("return { ns.Try('TEST-ONLY sum', function(a, b) return a + b end, 1, 2) }"), "a call that works passes its arguments and results through").toEqual([true, 3]);
  expect(addon.eval("local r = { ns.Try('TEST-ONLY two', function() return nil, 'two' end) } return { r[1], r[2] == nil, r[3] }"), "a nil result included").toEqual([true, true, "two"]);
  expect(addon.eval("return { ns.Try('TEST-ONLY outer', function() ns.Try('TEST-ONLY inner', error, 'in') error('out') end) }"), "a nested ns.Try's failure doesn't take the outer one's label").toEqual([false, expect.stringMatching(/out$/)]);
  expect(addon.eval("return { ns.errors[#ns.errors - 1].text, ns.errors[#ns.errors].text }"), "each is kept under its own site").toEqual(["TEST-ONLY inner: in", expect.stringMatching(/^TEST-ONLY outer: .*out$/)]);
});

// A debugstack that says whether the function in __failer is still on the call stack when it is read.
const LIVE_STACK_ENV = `
  debugstack = function()
    local i = 1
    while debug.getinfo(i, "f") do
      if debug.getinfo(i, "f").func == __failer then return "TEST-ONLY failing frame live" end
      i = i + 1
    end
    return "TEST-ONLY failing frame gone"
  end
`;

it("caught errors: the stack is read while the failing frames are still live", () => {
  const addon = loggedIn(LIVE_STACK_ENV);
  addon.eval('ns.ClearErrors() __failer = function() error("TEST-ONLY deep") end ns.Try("TEST-ONLY live", function() __failer() end)');
  expect(addon.eval("return ns.errors[1].stack"), "ns.Try keeps a stack that still has the failing function in it").toBe("TEST-ONLY failing frame live");
  addon.eval('ns.ClearErrors() ns.On("TEST_ONLY_LIVE", function() __failer() end) __wfgStub.fire("TEST_ONLY_LIVE")');
  expect(addon.eval("return ns.errors[1].stack"), "so does an event handler's").toBe("TEST-ONLY failing frame live");
  addon.eval('ns.ClearErrors() ns.Report("TEST-ONLY late", "x")');
  expect(addon.eval("return ns.errors[1].stack"), "while a report made outside any failure does not have it (the probe tells them apart)").toBe("TEST-ONLY failing frame gone");
});

it("caught errors: without debugstack or an error handler (this stub), and a hidden error value", () => {
  const addon = loggedIn("GetBuildInfo = nil debugstack = nil geterrorhandler = nil CallErrorHandler = nil");
  addon.eval('ns.ClearErrors() ns.Report("TEST-ONLY bare", "x")');
  expect(addon.eval("return { ns.errors[1].text, ns.errors[1].stack, ns.errors[1].count }"), "the error is kept without a stack").toEqual(["TEST-ONLY bare: x", "", 1]);
  addon.clearChat();
  addon.slash("errors");
  const lines = addon.chat();
  expect(lines[0], "the header names the version, an unknown interface version and the counts").toMatch(/ Vanguard \S+  ·  interface \?  ·  1 error\(s\) caught this session \(1 in all\), newest last:$/);
  expect(lines[1], "then the client line").toMatch(/ Client Retail  ·  auras on the/);
  expect(lines.slice(2), "then the error with its count and no stack lines").toEqual([expect.stringMatching(/TEST-ONLY bare: x  \(x1\)$/)]);
  const secret = loggedIn('issecretvalue = function(v) return type(v) == "table" and v.__secret == true end');
  expect(secret.eval('ns.Report("TEST-ONLY", { __secret = true }) return ns.errors[#ns.errors].text'), "a hidden error value is named, never read").toBe("TEST-ONLY: (a hidden error message)");
});

it("caught errors: a game handler that fails or reports again cannot loop, and an empty handler slot", () => {
  const broken = loggedIn(`__handled = 0 geterrorhandler = function() return function(msg) __handled = __handled + 1 ns.Report("TEST-ONLY inner", msg) error("TEST-ONLY handler broke") end end`);
  expect(broken.eval('ns.ClearErrors() __handled = 0 ns.Report("TEST-ONLY outer", "x") return { __handled, #ns.errors, ns.errors[1].text, ns.errors[2].text }'), "the inner report is kept but not handed back to the handler").toEqual([1, 2, "TEST-ONLY outer: x", "TEST-ONLY inner: TEST-ONLY outer: x"]);
  const none = loggedIn("geterrorhandler = function() return nil end");
  expect(none.eval('ns.ClearErrors() ns.Report("TEST-ONLY none", "y") return { #ns.errors, ns.errors[1].count }'), "no handler installed: kept, nothing forwarded").toEqual([1, 1]);
});

it("caught errors: an after-combat update that fails is reported and the rest still run", () => {
  const addon = loggedIn();
  setCombat(addon, true);
  addon.eval('ns.OutOfCombat(function() error("TEST-ONLY late") end) ns.OutOfCombat(function() __after = true end)');
  setCombat(addon, false);
  expect(addon.eval("return __after"), "the second queued function ran").toBe(true);
  expect(addon.eval("return ns.errors[#ns.errors].text"), "the failure is kept under its site").toMatch(/^after-combat update: .*TEST-ONLY late$/);
  expect(chatHas(addon, /after-combat update: .*TEST-ONLY late/), "and told").toBe(true);
});

it("/vg errors: counts, build, interface version and the aura backend, then clear", () => {
  const addon = loggedIn(FOREVER_ENV + ERRORS_ENV);
  addon.eval('ns.ClearErrors() ns.Report("TEST-ONLY twice", "x") ns.Report("TEST-ONLY twice", "x") ns.Report("TEST-ONLY once", "y")');
  addon.clearChat();
  addon.slash("errors");
  expect(chatHas(addon, /interface 16001  ·  2 error\(s\) caught this session \(3 in all\), newest last:/), "the header has the interface version and both counts").toBe(true);
  expect(chatHas(addon, /Client WoW Forever  ·  build 1\.16\.0 \(TEST-ONLY\)  ·  auras on the (engine|fallback)/), "the client line names the build and the aura backend").toBe(true);
  expect(addon.chat().slice(2), "each error with its count, then its stack lines indented").toEqual([
    expect.stringMatching(/TEST-ONLY twice: x  \(x2\)$/), expect.stringMatching(/ {4}TEST-ONLY stack level 4$/), expect.stringMatching(/ {4}TEST-ONLY frame 2$/),
    expect.stringMatching(/TEST-ONLY once: y  \(x1\)$/), expect.stringMatching(/ {4}TEST-ONLY stack level 4$/), expect.stringMatching(/ {4}TEST-ONLY frame 2$/),
  ]);
  addon.slash("errors clear");
  expect(chatHas(addon, /Cleared\./) && addon.eval("return #ns.errors"), "clear empties the list").toBe(0);
  addon.slash("errors");
  expect(chatHas(addon, /No errors caught this session/), "so a bug can be reproduced cleanly").toBe(true);
});

// What a reload overlay reads: a macro run on release, above its button, on the secure template, clicked down and up.
const SECURE_RELOAD = ["macro", "/reload", false, true, "SecureActionButtonTemplate", ["AnyDown", "AnyUp"]];

it("reload buttons: a /reload macro overlay, since the Forever client blocks ReloadUI()", () => {
  const addon = loggedIn(FOREVER_ENV + "ReloadUI = function() __reloaded = true end");
  addon.eval('ns.OfferReload("TEST-ONLY change.")');
  expect(addon.eval("return Vanguard_Reload:IsShown() and Vanguard_Reload.title:GetText()"), "a reload is offered with its reason").toBe("TEST-ONLY change. Reload the UI now to apply it?");
  expect(reloadOverlay(addon, "Vanguard_Reload.accept"), "Reload carries a secure action button overlay with a /reload macro, run on mouse-up, above the button").toEqual(SECURE_RELOAD);
  addon.eval('local a = Vanguard_Reload.accept a:SetScript("OnEnter", function() __hover = "in" end) a:SetScript("OnLeave", function() __hover = "out" end)');
  addon.eval("local o = Vanguard_Reload.accept.reloadOverlay o:GetScript('OnEnter')(o)");
  expect(addon.eval("return __hover"), "hovering the overlay lights the button under it").toBe("in");
  addon.eval("local o = Vanguard_Reload.accept.reloadOverlay o:GetScript('OnLeave')(o)");
  expect(addon.eval("return __hover"), "and leaving it lets go").toBe("out");
  addon.eval("local a = Vanguard_Reload.accept a:SetScript('OnEnter', nil) a.reloadOverlay:GetScript('OnEnter')(a.reloadOverlay)");
  addon.eval("Vanguard_Reload.cancel:GetScript('OnClick')(Vanguard_Reload.cancel)");
  expect(addon.eval("return Vanguard_Reload:IsShown()"), "Later closes it").toBe(false);
  setCombat(addon, true);
  addon.slash("");
  expect(reloadOverlay(addon, "Vanguard_Options.reload"), "a reload button built in combat has no overlay yet").toBe(false);
  addon.eval("Vanguard_Options.reload:GetScript('OnClick')(Vanguard_Options.reload)");
  expect(addon.eval("return __reloaded") === null && chatHas(addon, /Type \/reload in chat/), "clicked then, it says to type /reload (ReloadUI would be blocked)").toBe(true);
  setCombat(addon, false);
  expect(reloadOverlay(addon, "Vanguard_Options.reload"), "the overlay arrives when combat ends, as the same secure button").toEqual(SECURE_RELOAD)
  expect(addon.eval("local n = 0 for _, w in ipairs(__wfgStub.frames) do if w.__template == 'InsecureActionButtonTemplate' then n = n + 1 end end return n"), "no reload button is left on the insecure template").toBe(0);
});

it("events unsubscribe and a delivered event with no listeners", () => {
  const addon = loggedIn();
  const out = addon.eval(`
    local n = 0
    local function fn() n = n + 1 end
    -- TEST-ONLY event, not one the addon registers itself.
    ns.On("TEST_ONLY_EVENT", fn)
    ns.On("TEST_ONLY_EVENT", fn)
    local frame
    for _, w in ipairs(__wfgStub.frames) do
      if w.__events.TEST_ONLY_EVENT and w.__scripts.OnEvent then frame = w end
    end
    __wfgStub.fire("TEST_ONLY_EVENT")
    local once = n
    ns.Off("TEST_ONLY_EVENT", fn)
    __wfgStub.fire("TEST_ONLY_EVENT")
    frame:RegisterEvent("TEST_ONLY_EVENT")
    frame:GetScript("OnEvent")(frame, "TEST_ONLY_EVENT")
    -- TEST-ONLY event nobody subscribed to.
    return { once = once, after = n, offMissing = ns.Off("NO_SUCH_EVENT", fn) == nil }
  `);
  expect(out.once === 1 && out.after === 1 && out.offMissing === true, "a listener is registered once, Off removes it, and Off of nothing is a no-op").toBeTruthy();
});

// Two handlers on a TEST-ONLY event, the first throwing, fired once into an
// emptied error ring (the stub's login already fills it) so counts are exact.
const THROWING_HANDLERS = `
  ns.ClearErrors()
  __ran, __handled = {}, {}
  ns.On("TEST_ONLY_EVENT", function() error("TEST-ONLY first") end)
  ns.On("TEST_ONLY_EVENT", function(event, arg) __ran[#__ran + 1] = event .. ":" .. tostring(arg) end)
  __wfgStub.fire("TEST_ONLY_EVENT", "payload")
`;

it("events: a handler that throws does not stop the others, and the error is kept with its stack", () => {
  const addon = loggedIn(`debugstack = function(level) return "TEST-ONLY stack " .. tostring(level) end
    __handled = {} geterrorhandler = function() return function(err) __handled[#__handled + 1] = err end end`);
  const out = addon.eval(THROWING_HANDLERS + "return { ran = __ran, last = ns.errors[#ns.errors], handled = __handled, n = #ns.errors }");
  expect(out.ran, "the second handler still ran, with the event's arguments").toEqual(["TEST_ONLY_EVENT:payload"]);
  expect(out.last, "the error is recorded under the event's name, with the stack read inside xpcall's handler").toMatchObject({ text: expect.stringMatching(/^event TEST_ONLY_EVENT: .*TEST-ONLY first$/), stack: "TEST-ONLY stack 4", count: 1 });
  expect(out.handled, "the game's error handler got the labelled error text").toEqual([expect.stringMatching(/^event TEST_ONLY_EVENT: .*TEST-ONLY first$/)]);
  expect(() => addon.fire("TEST_ONLY_EVENT"), "a handler error no longer escapes the event frame").not.toThrow();
  expect([out.n, addon.eval("return { #ns.errors, ns.errors[1].count }")], "and each delivery that fails is counted on the one entry").toEqual([1, [1, 2]]);
});

it("events: on a client without debugstack or an error handler, the error is still kept", () => {
  const out = loggedIn().eval(THROWING_HANDLERS + "return { ran = #__ran, last = ns.errors[#ns.errors] }");
  expect(out.ran, "the second handler ran").toBe(1);
  expect(out.last, "the record has no stack and nothing was forwarded").toMatchObject({ text: expect.stringMatching(/^event TEST_ONLY_EVENT: .*TEST-ONLY first$/), stack: "" });
});

it("events: a broken game error handler cannot lose the record", () => {
  const broken = loggedIn('geterrorhandler = function() return function() error("TEST-ONLY handler broke") end end');
  const last = broken.eval(THROWING_HANDLERS + "return ns.errors[#ns.errors].text");
  expect(last, "the handler's own failure is swallowed").toMatch(/TEST-ONLY first$/);
  expect(last).not.toMatch(/handler broke|error in error handling/);
  const none = loggedIn("geterrorhandler = function() return nil end");
  expect(none.eval(THROWING_HANDLERS + "return { #__ran, ns.errors[#ns.errors].text }"), "a client whose handler slot is empty is treated like one without").toEqual([1, expect.stringMatching(/^event TEST_ONLY_EVENT: .*TEST-ONLY first$/)]);
});

it("events: Blizzard's CallErrorHandler is preferred, and called straight from the failing stack's handler", () => {
  const addon = loggedIn(`__called = nil CallErrorHandler = function(err) __called = err __caller = debug.getinfo(2, "S").what end
    geterrorhandler = function() return function() __wrong = true end end`);
  const out = addon.eval(THROWING_HANDLERS + "return { called = __called, wrong = __wrong, caller = __caller }");
  expect(out.called, "CallErrorHandler got the raw error").toMatch(/TEST-ONLY first$/);
  expect(out.wrong, "and geterrorhandler was not called as well").toBeUndefined();
  expect(out.caller, "its caller is a Lua function (the message handler), not pcall, so the popup's stack starts at the failing frames").toBe("Lua");
});

it("events: a game handler that fails inside a failing handler keeps the record, loses nothing after, and is not told twice", () => {
  const addon = loggedIn(`__calls = 0 geterrorhandler = function() return function() __calls = __calls + 1 error("TEST-ONLY handler broke") end end`);
  const out = addon.eval("__calls = 0 " + THROWING_HANDLERS + "return { ran = #__ran, n = #ns.errors, text = ns.errors[1].text, calls = __calls }");
  expect(out, "the record is kept once, the second handler ran, the broken handler was called once").toEqual({ ran: 1, n: 1, text: expect.stringMatching(/TEST-ONLY first$/), calls: 1 });
  expect(addon.eval('ns.Try("TEST-ONLY again", error, "second") return __calls'), "the next failure is forwarded again (the guard did not stay set)").toBe(2);
});

it("secret checks: the client's check is chosen once and called bare, with no pcall per value", () => {
  const addon = loggedIn(`__asked = 0
    -- TEST-ONLY check: counts each question.
    issecretvalue = function(v) __asked = __asked + 1 return type(v) == "table" and v.__secret == true end`);
  const out = addon.eval(`local calls, raw = 0, pcall
    __asked = 0
    pcall = function(...) calls = calls + 1 return raw(...) end
    local answers = { ns.IsSecret({ __secret = true }), ns.IsSecret(5), ns.PlainNumber(7) }
    pcall = raw
    return { calls, __asked, answers }`);
  expect(out, "three values asked: three calls to the client's check, none through pcall").toEqual([0, 3, [true, false, 7]]);
});

// TEST-ONLY unit-event listener: notes "event:unit:arg" for each event it hears; __took() hands the notes over.
const NOTE_LUA = `
  __heard = {}
  function __note(event, unit, arg) __heard[#__heard + 1] = event .. ":" .. unit .. ":" .. tostring(arg) end
  function __took() local out = table.concat(__heard, " ") __heard = {} return out end
`;

it("unit events: a subscription hears only the units it asked the client for, and can be pointed at others", () => {
  const addon = loggedIn(NOTE_LUA);
  addon.eval('__sub = ns.OnUnit({ "UNIT_HEALTH", "UNIT_MAXHEALTH" }, __note, "target", "focus")');
  expect(addon.eval("return { __sub.__unitEvents.UNIT_HEALTH, __sub.__unitEvents.UNIT_MAXHEALTH }"), "each event is registered with the client's unit filter").toEqual([["target", "focus"], ["target", "focus"]]);
  addon.fire("UNIT_HEALTH", "target", 1);
  addon.fire("UNIT_HEALTH", "nameplate1", 2);
  addon.fire("UNIT_MAXHEALTH", "focus", 3);
  expect(addon.eval("return __took()"), "its units' events reach the handler with their arguments; another unit's never do").toBe("UNIT_HEALTH:target:1 UNIT_MAXHEALTH:focus:3");
  addon.eval('ns.SetUnits(__sub, "nameplate1")');
  addon.fire("UNIT_HEALTH", "target", 4);
  addon.fire("UNIT_HEALTH", "nameplate1", 5);
  expect(addon.eval("return __took()"), "pointed at another unit, it hears that one instead").toBe("UNIT_HEALTH:nameplate1:5");
  addon.eval("ns.SetUnits(__sub)");
  addon.fire("UNIT_HEALTH", "nameplate1", 6);
  expect([addon.eval("return __took()"), addon.eval("return next(__sub.__events) == nil")], "pointed at no unit, it hears nothing and holds no registration").toEqual(["", true]);
  addon.eval('ns.OnUnit("UNIT_LEVEL", __note, "player", "target", "focus")');
  addon.fire("UNIT_LEVEL", "focus", 7);
  expect(addon.eval("return __took()"), "up to three units").toBe("UNIT_LEVEL:focus:7");
});

it("unit events: a failing handler is reported, an event the client lacks is skipped, and an old client is filtered here", () => {
  const addon = loggedIn(NOTE_LUA + "__wfgWorld.invalidEvents.TEST_ONLY_GONE = true");
  addon.eval('ns.ClearErrors() ns.OnUnit("UNIT_LEVEL", function() error("TEST-ONLY unit handler") end, "player") ns.OnUnit("UNIT_LEVEL", __note, "player")');
  addon.fire("UNIT_LEVEL", "player", 1);
  expect(addon.eval("return __took()"), "another subscription still runs").toBe("UNIT_LEVEL:player:1");
  expect(addon.eval("return ns.errors[1].text"), "the failure is kept under its event").toMatch(/^event UNIT_LEVEL: .*TEST-ONLY unit handler$/);
  addon.eval('ns.ClearErrors() __gone = ns.OnUnit({ "TEST_ONLY_GONE", "UNIT_FACTION" }, __note, "player")');
  expect(addon.eval("return { ns.errors[1].text, __gone.__events.TEST_ONLY_GONE == nil, __gone.__events.UNIT_FACTION }"), "an event this client lacks is noted and left out; the rest are kept").toEqual(["event TEST_ONLY_GONE: not on this client", true, true]);
  addon.eval(`local frame = __wfgWidgetApi.methods.Frame
    frame.RegisterUnitEvent = nil
    __old = ns.OnUnit("UNIT_PORTRAIT_UPDATE", __note, "target", "focus")
    frame.RegisterUnitEvent = true`);
  expect(addon.eval("return { __old.__events.UNIT_PORTRAIT_UPDATE, __old.__unitEvents == nil }"), "a client without RegisterUnitEvent: the plain event").toEqual([true, true]);
  for (const unit of ["player", "focus", "nameplate4", "target"]) addon.fire("UNIT_PORTRAIT_UPDATE", unit, unit.length);
  expect(addon.eval("return __took()"), "and other units are dropped here").toBe("UNIT_PORTRAIT_UPDATE:focus:5 UNIT_PORTRAIT_UPDATE:target:6");
});

it("slash commands for frames, accent, grid, theme, modules, skins, profile and spec", () => {
  const addon = loggedIn(`
    -- TEST-ONLY spec index the slash command prints.
    GetSpecialization = function() return 2 end
    -- TEST-ONLY version from C_AddOns.GetAddOnMetadata.
    C_AddOns = { GetAddOnMetadata = function() return "0.3.0" end }
  `);
  // TEST-ONLY skin name. The slash assertion matches this exact string.
  addon.eval('Vanguard.RegisterSkin("TESTONLY", function() end)');
  addon.slash("frames");
  expect(chatHas(addon, /Movable frames:/), "/vg frames lists movers").toBeTruthy();
  addon.slash("accent reset");
  expect(chatHas(addon, /Accent back to default/), "/vg accent reset clears a custom accent").toBeTruthy();
  addon.slash("grid 1");
  expect(chatHas(addon, /Usage: \/vg grid/), "a grid size outside 8-256 is refused").toBeTruthy();
  addon.slash("theme");
  expect(chatHas(addon, /Usage: \/vg theme reset/), "/vg theme without reset is refused").toBeTruthy();
  addon.slash("modules");
  expect(chatHas(addon, /UnitFrames/), "/vg modules lists modules").toBeTruthy();
  // TEST-ONLY module name that does not exist.
  addon.slash("enable NoSuch");
  expect(chatHas(addon, /No module called NoSuch/), "an unknown module is refused").toBeTruthy();
  addon.slash("skins TESTONLY on");
  expect(chatHas(addon, /Skin for TESTONLY on/), "/vg skins on stores the choice").toBeTruthy();
  addon.slash("profile");
  expect(chatHas(addon, /Profile: Default/), "/vg profile with no name shows the current profile").toBeTruthy();
  addon.slash("spec");
  expect(chatHas(addon, /Spec 2 uses the character's profile/), "/vg spec with no name shows that no spec profile is set").toBeTruthy();
});

// TEST-ONLY WoW Forever calls: only the newer C_ functions and frames, none of the older globals.
const NEWER_ENV = `
  GetZonePVPInfo = nil
  __pvp = "sanctuary"
  C_PvP = { GetZonePVPInfo = function() return __pvp end }
  CreateFrame("Button", "QueueStatusButton", UIParent)
  CreateFrame("Button", "ExpansionLandingPageMinimapButton", UIParent)
  __micro("HousingMicroButton")
  MirrorTimerContainer = CreateFrame("Frame", "MirrorTimerContainer", UIParent)
  __timers = {}
  function MirrorTimerContainer:GetChildren() return unpack(__timers) end
  function MirrorTimerContainer:SetupTimer()
    local t = CreateFrame("Frame", nil, self) t.StatusBar = CreateFrame("StatusBar", nil, t) __timers[#__timers + 1] = t
  end
  MirrorTimerContainer:SetupTimer()
`;

it("Forever fixes: the newer calls for zone color, pet moods, breath bars, the minimap eye, the house icon and the build line", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + NEWER_ENV, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = true } }" });
  expect(isTok(addon, addon.eval("return ns.GetModule('Minimap').zone.__textColor"), "zoneSanctuary"), "the zone name takes its PvP color from C_PvP").toBe(true);
  addon.eval("__pvp = { __secret = true } ns.GetModule('Minimap').UpdateZone()");
  expect(isTok(addon, addon.eval("return ns.GetModule('Minimap').zone.__textColor"), "gold"), "a hidden answer is plain gold").toBe(true);
  expect(addon.eval("local f = QueueStatusButton local p = f.__points.BOTTOMRIGHT return { f:GetParent() == ns.GetModule('Minimap').overlay, p.y, f:GetScale() }"), "the group finder eye sits small on the map's bottom-right, above the compartment").toEqual([true, 42, 0.6]);
  expect(putAway(addon, "ExpansionLandingPageMinimapButton"), "the expansion button is put away").toBe(true);
  expect(/Icons\\House$/.test(addon.eval("return HousingMicroButton.vgGlyph.__texture")), "the housing button gets the house icon").toBe(true);
  // Whether the breath bar container's i-th timer has the theme's bar texture.
  const barStyled = (i) => addon.eval(`return __timers[${i}].StatusBar:GetStatusBarTexture() ~= nil`);
  expect(barStyled(1), "a breath bar the container already holds is styled").toBe(true);
  addon.eval("MirrorTimerContainer:SetupTimer()");
  expect(barStyled(2), "and so is one it sets up later").toBe(true);
  const pets = loggedIn(UNITS_ENV + "C_PetInfo = { GetPetHappiness = function() return 3 end }");
  expect(pets.eval("local d = ns.GetModule('UnitExtras').happy return d and d:IsShown()"), "the pet's mood comes from C_PetInfo").toBe(true);
  // The /vg status client line for a WoW Forever client reporting this build (or no build call at all).
  const status = (build) => { const a = loggedIn(FOREVER_ENV + (build ? `GetBuildInfo = function() return "1.60.1", "${build}", "Sep 1 2026", 16001 end` : "")); a.slash("status"); return a; };
  expect(chatHas(status("69893"), /build 1\.60\.1 \(69893\) {2}· {2}update the game: this build loses settings at every launch/), "a build before the fix says to update").toBe(true);
  expect(chatHas(status("70009"), /update the game/), "a fixed build doesn't").toBe(false);
  const noBuild = loggedIn(FOREVER_ENV);
  noBuild.eval("ns.IsForever = function() return true end GetBuildInfo = nil");
  noBuild.slash("status");
  expect(chatHas(noBuild, /Client WoW Forever {2}· {2}auras/), "a client that can't say its build just leaves it out").toBe(true);
});

it("the error badge: a count on the addons button and in the options footer, gone at zero", () => {
  const addon = loggedIn('AddonCompartmentFrame = CreateFrame("Frame", "AddonCompartmentFrame", UIParent)');
  // Both badges: the addons button's count and shown state, the footer's text and shown state.
  const badges = () => addon.eval(`local f = Vanguard_OptionsErrors return { Vanguard_ErrorBadge:IsShown(), Vanguard_ErrorBadge.text:GetText() or "",
    f and f:IsShown() or false, f and f.text:GetText() or "" }`);
  expect(badges(), "no errors: no badge").toEqual([false, "0", false, ""]);
  addon.eval('ns.Report("TEST-ONLY site", "TEST-ONLY failure")');
  expect(badges()[0], "the badge waits for the next frame, never drawn from inside the error").toBe(false);
  addon.advance(0.5);
  expect(badges().slice(0, 2), "one error: 1 on the addons button").toEqual([true, "1"]);
  addon.eval('ns.Report("TEST-ONLY site", "TEST-ONLY failure") ns.Report("TEST-ONLY site", "TEST-ONLY other")');
  addon.advance(0.5);
  addon.eval("ns.Options.Show()");
  expect(badges(), "the same error again counts once; a new one makes 2, in the footer too").toEqual([true, "2", true, "2 errors caught this session: click to list them"]);
  addon.clearChat();
  addon.click("Vanguard_OptionsErrors");
  expect(chatHas(addon, /2 error\(s\) caught this session/), "clicking the footer line lists them (/vg errors)").toBe(true);
  addon.slash("errors clear");
  addon.advance(0.5);
  expect(badges(), "/vg errors clear: both badges go").toEqual([false, "0", false, "0 errors caught this session: click to list them"]);
  addon.eval('ns.Report("TEST-ONLY site", "TEST-ONLY failure")');
  addon.advance(0.5);
  expect(badges().slice(0, 3), "and come back with the next error").toEqual([true, "1", true]);
  const plain = loggedIn("AddonCompartmentFrame = nil");
  plain.eval('ns.Report("TEST-ONLY site", "TEST-ONLY failure")');
  plain.advance(0.5);
  plain.eval("ns.Options.Show()");
  expect(plain.eval('return { Vanguard_ErrorBadge == nil, Vanguard_OptionsErrors.text:GetText() }'), "a client without the addons button: the footer still counts").toEqual([true, "1 error caught this session: click to list them"]);
});
