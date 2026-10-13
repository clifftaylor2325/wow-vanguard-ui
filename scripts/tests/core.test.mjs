// core: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createAddon, root } from "../lib/lua-harness.mjs";
import { CLICK_LUA, FOREVER_ENV, HEALING_ENV, RAID_ENV, UNITS_ENV, chatHas, expectErrors, healing, loggedIn, setCombat } from "./helpers.mjs";

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
  expect(addon.eval(`local text = ns.ExportProfile('theme') ns.Theme.Settings().accent = { 1, 1, 1 } ns.ImportProfile(text) return { __changes, ns.Theme.Settings().accent[1] == ns.Theme.PRESETS.brass[1] }`), "a module import notifies (before its merge, so an active Situations override comes off first, and after) and is used").toEqual([6, true]);
  addon.slash("accent ff0000");
  addon.slash("accent reset");
  expect(addon.eval("return { ns.Theme.Accent() == ns.Theme.PRESETS.brass[1], ns.Theme.Settings().accent[4] }"), "/vg accent reset puts the default accent into the cached table").toEqual([true, 1]);
});
it("the account file's version is read and upgraded", () => {
  expectErrors("DB upgrade 4: eval:2: boom");
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
  expectErrors("DB upgrade 1: eval:2: boom");
  const boom = 'ns.UpgradeDB(1, function() error("boom") end)';
  for (const bad of ["VanguardDB.version = nil", 'VanguardDB.version = "old"']) {
    const addon = loggedIn(boom, { savedVariables: bad });
    expect(addon.eval("return VanguardDB.version"), "the stamp stays at 0 so the step runs again: " + bad).toBe(0);
  }
  const ok = loggedIn('ns.UpgradeDB(1, function(db) db.ran = true end)', { savedVariables: "VanguardDB.version = nil" });
  expect(ok.eval("return { VanguardDB.ran, VanguardDB.version }"), "a step that works runs once and stamps").toEqual([true, 2]);
});
it("modules", () => {
  expectErrors("module Bad: eval:4: boom");
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
  expectErrors(/^module DataBars: Modules\/DataBars\.lua:\d+: attempt to compare number with string$/, "module TESTONLY_Broken: eval:3: attempt to compare number with string");
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
  expectErrors(/^pin Vanguard_PinTest: eval:\d+: boom$/, "pin frame: eval:2: bare");
  const addon = loggedIn(PIN_ENV);
  expect([pinCalls(addon), pinPoint(addon)], "the pin is applied at registration").toEqual([1, "CENTER"]);
  addon.eval("__boom = true __pinTarget:SetPoint('TOPLEFT', UIParent, 'TOPLEFT', 1, 1)");
  expect(pinCalls(addon), "the game's move runs the pin through the hook").toBe(2);
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
it("an error inside a /vg command is caught and kept for /vg errors, not thrown at the player", () => {
  const addon = loggedIn();
  expectErrors("slash rolls: boom");
  addon.eval('ns.GetModule("Rolls").Command = function() error("boom", 0) end');
  addon.slash("rolls");
  expect(addon.eval("return #ns.errors")).toBe(1);
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
