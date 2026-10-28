// core: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createAddon, root } from "../lib/lua-harness.mjs";
import { CLICK_LUA, FOREVER_ENV, HEALING_ENV, RAID_ENV, UNITS_ENV, chatHas, expectErrors, healing, isTok, loggedIn, px, setCombat } from "./helpers.mjs";
import { alphaOf, closeOf, escapes, insets, pressEscape, thumbOf, titleOf, titleSize } from "./dialogs.mjs";

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
  expect(chatHas(addon, /unlock \|\| lock/), "/vg help lists commands").toBeTruthy();
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
  expect(said(addon, "perf bogus"), "anything else: the usage").toEqual(["Usage: /vg perf [cpu | watch | slow [reset]]"]);
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
  expect(said(addon, "frame"), "no name: the usage").toEqual(["Usage: /vg frame <name> [deep]   (a global frame name; dots follow keys: MinimapCluster.Tracking; #3 is the third child frame)"]);
  expect(said(addon, "frame ProbeFrame.#1")[0], "#n is the nth child frame, for one with no key").toMatch(/^ProbeChild \(Frame\)/);
  expect(said(addon, "frame ProbeFrame.#9")[0], "a child that isn't there leads nowhere").toMatch(/^No frame called/);
});
it("/vg frame: #0 leads nowhere, and a frame that refuses its parent and parts still prints", () => {
  const addon = loggedIn();
  addon.eval(`local f = CreateFrame("Frame", "ProbeLocked", UIParent)
    local function refuse() error("TEST-ONLY forbidden") end
    f.GetParent, f.GetRegions, f.GetChildren = refuse, refuse, refuse`);
  expect(said(addon, "frame UIParent.#0")[0], "a child step of 0 says no frame, not an error").toMatch(/^No frame called UIParent\.#0/);
  expect(said(addon, "frame ProbeLocked.#1")[0], "a child step on a frame that refuses its children says no frame").toMatch(/^No frame called ProbeLocked\.#1/);
  expect(said(addon, "frame ProbeLocked deep"), "no parent, no ancestors, and no parts").toEqual([
    expect.stringMatching(/^ProbeLocked \(Frame\): .*, under nothing$/), "  no anchors", "  0 region(s):", "  0 child frame(s):"]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
it("/vg frame: a secret text, anchor point, offset or anchor frame prints as ?, never as the value or an error", () => {
  const addon = loggedIn();
  addon.eval(`local f = CreateFrame("Frame", "ProbeSecret", UIParent) f:SetSize(30, 20)
    local text = f:CreateFontString() text.GetText = function() return __wfgWorld.secret("hidden") end
    f.GetPoint = function(_, i) if i == 1 then return __wfgWorld.secret("TOP"), __wfgWorld.secret(UIParent), __wfgWorld.secret("TOP"), __wfgWorld.secret(1), __wfgWorld.secret(2) end end`);
  expect(said(addon, "frame ProbeSecret deep").filter((l) => /^  \? to|text/.test(l)), "each secret part is a ?, and the anchor frame is its parent").toEqual([
    "  ? to its parent ? ?, ?", expect.stringMatching(/layer \S+, text \?$/)]);
  expect(addon.eval("return #ns.errors"), "and no error").toBe(0);
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
// TEST-ONLY always-on profiler: Vanguard's and all addons' metrics by the documented metric numbers, and whether it's on.
const PROFILER_ENV = PERF_ENV + `
  __mine = { [0] = 0.25, [1] = 0.4, [4] = 12.5, [6] = 3 }
  __on = true
  C_AddOnProfiler = { IsEnabled = function() return __on end,
    GetAddOnMetric = function(name, m) if name ~= "Vanguard" then return 99 end return __mine[m] end,
    GetOverallMetric = function(m) return m == 1 and 1.6 or 0 end }
`;
it("/vg perf: the game's always-on profiler gives the CPU line without script profiling, else the old counter", () => {
  const addon = loggedIn(PROFILER_ENV);
  expect(said(addon, "perf"), "ms a frame now, on average, the peak, the share of all addons and the slow frames").toEqual(["CPU 0.40 ms a frame now (0.25 on average, peak 12.5 ms, 25 % of all addons; 3 frames over 5 ms)  ·  memory 2.0 MB"]);
  addon.eval("Enum.AddOnProfilerMetric = { RecentAverageTime = 6, SessionAverageTime = 0, PeakTime = 4, CountTimeOver5Ms = 1 } C_AddOnProfiler.GetOverallMetric = nil");
  expect(said(addon, "perf")[0], "the client's own metric numbers win; no total, no share").toBe("CPU 3.00 ms a frame now (0.25 on average, peak 12.5 ms; 0 frames over 5 ms)  ·  memory 2.0 MB");
  addon.eval("Enum.AddOnProfilerMetric = nil __mine[1] = nil");
  expect(said(addon, "perf")[0], "a hidden value reads 0").toBe("CPU 0.00 ms a frame now (0.25 on average, peak 12.5 ms; 3 frames over 5 ms)  ·  memory 2.0 MB");
  addon.eval("__on = false");
  expect(said(addon, "perf")[0], "profiler off: the script profiler's line").toBe("CPU off (/vg perf cpu turns the game's profiling on)  ·  memory 2.0 MB");
  addon.eval("C_AddOnProfiler = { GetAddOnMetric = function() return 1 end }");
  expect(said(addon, "perf")[0], "a profiler with no switch counts as on").toBe("CPU 1.00 ms a frame now (1.00 on average, peak 1.0 ms; 1 frames over 5 ms)  ·  memory 2.0 MB");
});
// TEST-ONLY fine clock: debugprofilestop answers __clock (ms), which a test moves.
const CLOCK_ENV = "__clock = 0 debugprofilestop = function() return __clock end\n";
it("/vg perf slow: each guarded handler's longest call, slow calls and time in all; reset; a cap on sites", () => {
  const bare = loggedIn("");
  expect(said(bare, "perf slow"), "no fine clock: nothing timed").toEqual(["No handler timings yet (the client has no fine clock, or nothing has run)."]);
  const addon = loggedIn(CLOCK_ENV);
  said(addon, "perf slow reset");
  addon.eval(`local function took(ms) return function() __clock = __clock + ms end end
    ns.Try("TEST-ONLY heavy", took(12)) ns.Try("TEST-ONLY heavy", took(3)) ns.Try("TEST-ONLY light", took(1))
    ns.Try("TEST-ONLY tie", took(1)) ns.Try("TEST-ONLY outer", function() ns.Try("TEST-ONLY inner", took(7)) end)`);
  const lines = said(addon, "perf slow");
  expect(lines.slice(0, 5), "the slowest first: the outer call includes the inner").toEqual([
    "Vanguard's slowest handlers since login or /vg perf slow reset (calls over 5 ms):",
    "  1. TEST-ONLY heavy  longest 12.0 ms, 1 over 5 ms, 2 calls, 15 ms in all",
    "  2. TEST-ONLY inner  longest 7.0 ms, 1 over 5 ms, 1 calls, 7 ms in all",
    "  3. TEST-ONLY outer  longest 7.0 ms, 1 over 5 ms, 1 calls, 7 ms in all",
    "  4. TEST-ONLY light  longest 1.0 ms, 0 over 5 ms, 1 calls, 1 ms in all",
  ]);
  expect(said(addon, "perf slow reset"), "reset").toEqual(["Vanguard's handler timings start over."]);
  addon.eval(`ns.MAX_TIMINGS = 2 for i = 1, 5 do ns.Try("TEST-ONLY site " .. i, function() end) end`);
  expect(addon.eval("local n = 0 for _ in pairs(ns.timings) do n = n + 1 end return { n, ns.timingCount }"), "past the cap new sites are not kept").toEqual([2, 2]);
  addon.eval("ns.Try('TEST-ONLY site 1', function() end)");
  expect(addon.eval("return ns.timings['TEST-ONLY site 1'].calls"), "a kept site still counts").toBe(2);
});
// TEST-ONLY memory counter: Vanguard's KB follow the list __mem, one reading each call of the game's Update;
// a client that refuses a full garbage collection, so the run judges by its low point (LIVE_ENV allows it).
const MEM_ENV = `
  collectgarbage = function() error("TEST-ONLY: collection refused") end
  __mem, __reads = { 1000 }, 0
  UpdateAddOnMemoryUsage = function() __reads = __reads + 1 end
  GetAddOnMemoryUsage = function(name) return name == "Vanguard" and __mem[math.min(__reads, #__mem)] or 0 end
`;
// What /vg mem says besides the saved-data lines it starts with (SettingsGuard.SizeReport, tested in profileguard).
const memSaid = (addon) => said(addon, "mem").filter((l) => !/^(Saved data|This character's file|Saved data sizes)/.test(l));
it("/vg mem: says why it can't measure (no counter, no timers, in combat)", () => {
  const addon = loggedIn("GetAddOnMemoryUsage = nil");
  expect(memSaid(addon), "no memory counter").toEqual(["Vanguard's memory can't be read on this client."]);
  const noTimers = loggedIn(MEM_ENV + "C_Timer = nil");
  expect(memSaid(noTimers), "no timers").toEqual(["This client has no timers to measure with."]);
  const fight = loggedIn(MEM_ENV);
  fight.eval("__wfgStub.inCombat = true");
  expect(memSaid(fight), "in combat the game's counter is not read").toEqual(["Vanguard's memory can't be read in combat; try again out of combat."]);
  expect([said(fight, "perf")[0], fight.eval("return __reads")], "/vg perf leaves the counter alone in combat too").toEqual(["CPU off (/vg perf cpu turns the game's profiling on)  ·  memory: not read in combat", 0]);
});
it("/vg mem: a minute of readings; a rising low point means kept memory, a wobble is garbage", () => {
  const addon = loggedIn(MEM_ENV);
  addon.eval("__mem = { 1000, 1300, 1100, 1500, 1020, 1600, 1040, 1700, 1030, 1800, 1010, 1900, 1050 }");
  expect(memSaid(addon), "it starts and says how long").toEqual(["Measuring Vanguard's memory for 60 s (a reading every 5 s). Stand still out of combat; /vg mem again ends it early."]);
  addon.clearChat();
  addon.advance(60, 5);
  expect(Array.from(addon.chat()).map((l) => l.replace(/^.*Vanguard:\S*\s/, "")), "after a minute: the readings, then the low point's verdict").toEqual([
    "Vanguard's memory over 60 s: 0.98 MB to 1.03 MB (+50 KB, +0.8 KB/s), low 0.98, high 1.86 MB.",
    "The low point held: the rise and fall is garbage the game collects, not memory kept.",
  ]);
  addon.advance(60, 5);
  expect(Array.from(addon.chat()).length, "and nothing more").toBe(2);
  addon.eval("__reads = 0 __mem = { 1000, 1000, 1100, 1100, 1300, 1300, 1500, 1500, 1700, 1700, 1900, 1900, 2100 }");
  said(addon, "mem");
  addon.clearChat();
  addon.advance(60, 5);
  expect(Array.from(addon.chat()).pop().replace(/^.*Vanguard:\S*\s/, ""), "a low point that keeps rising is memory kept").toMatch(/^The low point rose 500 KB: Vanguard is keeping memory/);
});
// MEM_ENV on a client that allows a full collection, each counted in __collects.
const LIVE_ENV = MEM_ENV + "__collects = 0 collectgarbage = function(opt) if opt == 'collect' then __collects = __collects + 1 end return 0 end\n";
it("/vg mem: a garbage collection before the first reading and after the last gives live memory and what was kept", () => {
  const addon = loggedIn(LIVE_ENV);
  addon.eval("__mem = { 1000, 1300, 1100, 1500, 1020, 1600, 1040, 1700, 1030, 1800, 1010, 1900, 1050, 1200 }");
  said(addon, "mem");
  expect(addon.eval("return __collects"), "one collection as it starts").toBe(1);
  addon.clearChat();
  addon.advance(60, 5);
  expect(Array.from(addon.chat()).map((l) => l.replace(/^.*Vanguard:\S*\s/, "")), "the readings, then the clean start and end and what was kept").toEqual([
    "Vanguard's memory over 60 s: 0.98 MB to 1.03 MB (+50 KB, +0.8 KB/s), low 0.98, high 1.86 MB.",
    "After a garbage collection: 0.98 MB at the start, 1.17 MB at the end (+200 KB); Vanguard kept memory it hasn't let go.",
  ]);
  expect(addon.eval("return __collects"), "and one as it ends").toBe(2);
  addon.eval("__reads = 0 __mem = { 1000, 1300, 1020 }");
  said(addon, "mem");
  addon.advance(5, 5);
  expect(said(addon, "mem").pop(), "asked again early: a clean end that held").toBe("After a garbage collection: 0.98 MB at the start, 1.00 MB at the end (+20 KB); nothing kept: the rest was garbage.");
  addon.eval("__reads = 0 __mem = { 1000, 1100, 1200 }");
  said(addon, "mem");
  addon.advance(5, 5);
  addon.eval("__wfgStub.inCombat = true");
  expect([said(addon, "mem").pop(), addon.eval("return __collects")], "ended in combat: no collection, the low point judges").toEqual(["Too few readings to tell garbage from kept memory (readings are skipped in combat).", 5]);
});
it("/vg mem: asked again it ends early; readings missed in combat leave too few to judge", () => {
  const addon = loggedIn(MEM_ENV);
  addon.eval("__mem = { 1000, 1000, 1200, 1200 }");
  said(addon, "mem");
  addon.advance(10, 5);
  expect(said(addon, "mem")[0], "ended after two ticks: three readings").toBe("Vanguard's memory over 10 s: 0.98 MB to 1.17 MB (+200 KB, +20.0 KB/s), low 0.98, high 1.17 MB.");
  said(addon, "mem");
  addon.eval("__wfgStub.inCombat = true");
  addon.advance(60, 5);
  expect(Array.from(addon.chat()).pop().replace(/^.*Vanguard:\S*\s/, ""), "a fight skips every reading").toBe("Vanguard's memory: too few readings (the game's counter is not read in combat).");
  addon.eval("__wfgStub.inCombat = false __reads = 0 __mem = { 1000, 1100, 1200 }");
  said(addon, "mem");
  addon.advance(10, 5);
  addon.eval("__wfgStub.inCombat = true");
  addon.advance(50, 5);
  expect(Array.from(addon.chat()).pop().replace(/^.*Vanguard:\S*\s/, ""), "three readings are too few to split").toMatch(/^Too few readings to tell/);
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
  expect(addon.eval('return { ns.Options.ShowTab("Your profiles"), ns.Options.ShowTab("Specialization") }'), "the Profiles page has no spec tab").toEqual([true, false]);
  // The names are read once per login (or list change), so a paladin is a new login here.
  addon.eval('__names[25898] = "Greater Blessing of Kings" UnitClass = function() return "Paladin", "PALADIN" end ns.GetModule("RaidHealing").Forget()');
  expect(addon.eval('for _, n in ipairs(ns.GetModule("RaidHealing").BuffNames()) do if n == "Greater Blessing of Kings" then return true end end'), "any blessing counts for a paladin").toBeTruthy();
});
// TEST-ONLY restriction calls as Forever documents them: the six kinds and three states, each kind's state in __restricted by number.
const RESTRICT_ENV = `
  Enum.AddOnRestrictionType = { Combat = 0, Encounter = 1, ChallengeMode = 2, PvPMatch = 3, Map = 4, Chat = 5 }
  Enum.AddOnRestrictionState = { Inactive = 0, Activating = 1, Active = 2 }
  __restricted = {}
  C_RestrictedActions = { GetAddOnRestrictionState = function(t) return __restricted[t] or 0 end }
  C_ChatInfo = { InChatMessagingLockdown = function() return __lock == true end }
`;
it("add-on restrictions: ns.Restricted reads one kind, starting counts, chat adds its lockdown, and an unsure client is unrestricted", () => {
  const addon = loggedIn(RESTRICT_ENV);
  // The active restriction kinds as one comma-joined string.
  const active = () => addon.eval("return table.concat(ns.ActiveRestrictions(), ',')");
  expect([addon.eval("return ns.Restricted('Map')"), active()], "all inactive").toEqual([false, ""]);
  addon.eval("__restricted[4] = 2 __restricted[1] = 1");
  expect([addon.eval("return ns.Restricted('Map')"), active()], "active, and starting (Activating), in /vg status order").toEqual([true, "Encounter,Map"]);
  addon.slash("status");
  expect(chatHas(addon, /Game restrictions: Encounter, Map/), "/vg status lists them").toBe(true);
  addon.eval("__restricted = {} __lock = true");
  expect(active(), "the chat messaging lockdown counts as Chat").toEqual("Chat");
  addon.eval("__lock = false C_ChatInfo.InChatMessagingLockdown = function() return __wfgWorld.secret(true) end");
  expect(addon.eval("return ns.Restricted('Chat')"), "a hidden lockdown answer is not a restriction").toBe(false);
  addon.eval("C_ChatInfo.InChatMessagingLockdown = function() error('TEST-ONLY') end C_RestrictedActions.GetAddOnRestrictionState = function() error('TEST-ONLY') end");
  expect([addon.eval("return ns.Restricted('Chat')"), addon.eval("return ns.Restricted('Map')"), addon.eval("return #ns.errors")], "errors read as unrestricted, quietly").toEqual([false, false, 0]);
  addon.eval("C_RestrictedActions.GetAddOnRestrictionState = function() return __wfgWorld.secret(2) end");
  expect(addon.eval("return ns.Restricted('Map')"), "a hidden state too").toBe(false);
  addon.eval("C_RestrictedActions = nil C_ChatInfo = nil");
  expect([addon.eval("return ns.Restricted('Chat')"), active()], "a client without the calls").toEqual([false, ""]);
  addon.slash("status");
  expect(chatHas(addon, /Game restrictions: none/), "/vg status says none").toBe(true);
  const kinds = loggedIn(RESTRICT_ENV);
  expect(kinds.eval("return ns.Restricted('Nonsense')"), "a kind the client doesn't name").toBe(false);
});
it("a 12.x build with the Forever ruleset call still reads as WoW Forever", () => {
  const addon = loggedIn('GetBuildInfo = function() return "12.1.5", "TEST-ONLY", "Nov 4 2026", 120105 end C_GameRules = { GetForeverExperiencePreset = function() return 1 end }');
  expect(addon.eval("return ns.IsForever()"), "120105 plus the ruleset call is Forever").toBe(true);
  addon.eval("C_GameRules = {}");
  expect(addon.eval("return ns.IsForever()"), "120105 without the call is Retail").toBe(false);
});
it("a retail client is not WoW Forever and keeps its aura state readable", () => {
  const addon = loggedIn('GetBuildInfo = function() return "12.0.7", "TEST-ONLY", "Sep 1 2026", 120007 end');
  expect(addon.eval("return ns.IsForever()") === false && addon.eval("return ns.AurasSecret()") === false, "120007 is retail; no C_Secrets means readable").toBeTruthy();
  addon.slash("status");
  expect(chatHas(addon, /Client Retail/), "/vg status says Retail").toBeTruthy();
});

it("the text dialog: a window title with its X and Escape at the dialog alpha, its text in a scroll view whose thumb shows only when the text overflows", () => {
  const addon = loggedIn();
  addon.eval("ns.AskText('Paste it', function() end) __selected = 0 Vanguard_TextEdit.HighlightText = function() __selected = __selected + 1 end");
  const name = "Vanguard_TextDialog";
  expect(titleOf(addon, name), "the title role in the text colour, hung T.SPACE.pad in and down (its middle half a line, 7 here, below that: on the close button's line)").toEqual({ size: titleSize(addon), text: true, left: 16, mid: -23 });
  expect(closeOf(addon, name), "the X where every window has it").toEqual([px(addon, 24), px(addon, 24), true]);
  expect([escapes(addon, name), alphaOf(addon, name), addon.frame(name).strata], "Escape closes it, at the dialog alpha, above the options window").toEqual([true, 0.98, "FULLSCREEN_DIALOG"]);
  expect(insets(addon, `${name}.view`, name), "the text area T.SPACE.pad in, under the head (40), its thumb's gutter (12) on the right, over the foot (50)").toEqual([16, 40, 28, 50]);
  expect(thumbOf(addon, `${name}.view`, name), "a short text fits: no thumb").toEqual([false, false, false]);
  expect(["fadeTop", "fadeBottom"].map((edge) => isTok(addon, addon.eval(`return ${name}.view.${edge}.__vertexColor`), "inset")), "the soft edges are the inset the box sits in, not the panel's colour").toEqual([true, true]);
  addon.eval("Vanguard_TextEdit:SetHeight(900) Vanguard_TextEdit:GetScript('OnSizeChanged')(Vanguard_TextEdit)");
  expect(thumbOf(addon, `${name}.view`, name), "the box grows past the view: the thumb shows, in the right pad").toEqual([true, true, 16]);
  addon.eval("Vanguard_TextEdit:GetScript('OnCursorChanged')(Vanguard_TextEdit, 0, -800, 1, 14)");
  expect(addon.eval(`return ${name}.view:GetVerticalScroll()`), "the view follows the cursor down to the line").toBe(584);
  addon.eval("Vanguard_TextEdit:SetHeight(100) Vanguard_TextEdit:GetScript('OnSizeChanged')(Vanguard_TextEdit)");
  expect([thumbOf(addon, `${name}.view`, name)[0], addon.eval(`return ${name}.view:GetVerticalScroll()`)], "the text shrinks to fit: the thumb goes and the view is back at the top").toEqual([false, 0]);
  addon.eval(`Vanguard_TextEdit:SetHeight(900) ${name}.view:GetScript('OnSizeChanged')(${name}.view)`);
  expect(thumbOf(addon, `${name}.view`, name)[0], "and the view's own resize (its first layout) finds the overflow too").toBe(true);
  addon.eval('ns.ShowText("A string", "VG1:...")');
  expect([addon.eval("return __selected"), addon.eval(`return ${name}.view:GetVerticalScroll()`)], "showing text selects it for Ctrl+C, from its start").toEqual([1, 0]);
  addon.click(`${name}.chrome.close`);
  expect(addon.frame(name).visible, "the X closes it").toBe(false);
  addon.eval('ns.AskText("Paste it", function() end)');
  pressEscape(addon);
  expect(addon.frame(name).visible, "so does Escape").toBe(false);
});

it("the text dialog's title wraps short of the X, two lines at most, and a second line pushes the text area down", () => {
  const addon = loggedIn("__wfgStub.methods.SetMaxLines = function(self, n) self.__maxLines = n end");
  const name = "Vanguard_TextDialog";
  addon.eval('ns.ShowText("Vanguard export (profile Default)  Ctrl+C to copy", "VG1:...")');
  expect(addon.eval(`return { ${name}.title:GetWidth(), ${name}.title:GetStringHeight() }`), "T.SPACE.pad in, the X's room (42) out; a short title is one line").toEqual([462, 14]);
  expect(insets(addon, `${name}.view`, name)[1], "the text area stays at the head").toBe(40);
  // The title's top and bottom, down from the dialog's top.
  const spans = () => addon.eval(`return { ${name}.title:GetTop() - ${name}:GetTop(), ${name}.title:GetBottom() - ${name}:GetTop() }`);
  expect(spans(), "a one-line title hangs from T.SPACE.pad down").toEqual([-16, -30]);
  addon.eval(`ns.ShowText(("A long title that says what to do with the box. "):rep(3), "VG1:...")`);
  expect(addon.eval(`return ${name}.title.__maxLines`), "two lines at most").toBe(2);
  expect(spans(), "a second line grows down, not up: the top stays put (never above the X's tile top, 14 down)").toEqual([-16, -44]);
  expect(insets(addon, `${name}.view`, name)[1], "a title of two lines keeps the area a gap (8) under its bottom: 16 + 28 + 8").toBe(52);
  addon.eval("ns.TextProgress('Importing… 40%')");
  expect([spans(), insets(addon, `${name}.view`, name)[1]], "a short title brings it back to the head").toEqual([[-16, -30], 40]);
});

it("ns.Dialog keeps every dialog's title short of the X itself: the dialog's width less a pad and the X's room, whatever the caller does", () => {
  const addon = loggedIn();
  // A dialog's title width, and the gap between the title's right edge and the X's left edge (the X sits on a whole pixel).
  const room = (w) => addon.eval(`local f = ns.Dialog("Vanguard_TestOnly${w}", ${w}, 100, "A title") f:Show()
    return { f.title:GetWidth(), math.floor(f.chrome.close:GetLeft() - f.title:GetRight() + 0.5) }`);
  expect(room(300), "300 less the pad (16) and the X's room (42); a gap (8) clear of the X").toEqual([242, 8]);
  expect(room(480), "and the same at another width").toEqual([422, 8]);
  expect(addon.eval('return ns.Dialog("Vanguard_TestOnlyBare", 300, 100).title:GetWidth()'), "a dialog with no title yet has the width too").toBe(242);
});

it("the question dialog: its text is the title, wrapped short of the X, the dialog grows to fit, and the X and Escape answer No", () => {
  const addon = loggedIn();
  const name = "Vanguard_Question";
  addon.eval("__answers = {} function __ask(text) ns.Ask(text, 'Yes', function() __answers[#__answers + 1] = 'yes' end, function() __answers[#__answers + 1] = 'no' end) end __ask('Sure?')");
  expect(titleOf(addon, name), "the title role in the text colour, T.SPACE.pad in").toMatchObject({ size: titleSize(addon), text: true, left: 16 });
  expect(addon.eval(`return { ${name}.title:GetWidth(), ${name}:GetWidth(), ${name}:GetHeight() }`), "wrapped at the X's room (400 less 16 and 42); a pad, one line, a section gap, the buttons, a pad").toEqual([342, 400, 96]);
  expect(closeOf(addon, name), "the X where every window has it").toEqual([px(addon, 24), px(addon, 24), true]);
  expect([escapes(addon, name), alphaOf(addon, name), insets(addon, `${name}.yes`, name).slice(2)], "Escape closes it, at the dialog alpha, the buttons a pad from the corner").toEqual([true, 0.98, [16, 16]]);
  addon.eval(`__ask(("A long question that goes on and on. "):rep(5))`);
  const grown = addon.eval(`local f = ${name} return { f:GetHeight(), 16 + f.title:GetStringHeight() + 24 + 26 + 16, f.title:GetStringHeight() }`);
  expect(grown[0], "a pad, the wrapped title, a section gap, the buttons and a pad").toBe(grown[1]);
  expect(grown[2], "four lines of title").toBe(56);
  addon.click(`${name}.chrome.close`);
  expect([addon.frame(name).visible, addon.eval("return __answers")], "the X closes it and answers No").toEqual([false, ["no"]]);
  addon.eval("__ask('Again?')");
  pressEscape(addon);
  expect([addon.frame(name).visible, addon.eval("return __answers")], "Escape answers No too, once").toEqual([false, ["no", "no"]]);
  addon.eval("__answers = {} __ask('Again?')");
  addon.eval(`${name}:GetScript("OnHide")(${name})`);
  expect([addon.frame(name).visible, addon.eval("return #__answers")], "a hide that leaves it shown (the UI put away from above) answers nothing").toEqual([true, 0]);
  addon.click(`${name}.no`);
  expect(addon.eval("return __answers"), "the No button answers No once (hiding it is not a second answer)").toEqual(["no"]);
  addon.eval("__answers = {} __ask('Again?')");
  addon.click(`${name}.yes`);
  expect([addon.frame(name).visible, addon.eval("return __answers")], "Yes answers Yes and never No").toEqual([false, ["yes"]]);
  addon.eval("__answers = {} ns.Ask('Next?', 'Yes', function() end, function() __answers[#__answers + 1] = 'no' __ask('Then this?') end) Vanguard_Question.no:GetScript('OnClick')(Vanguard_Question.no)");
  expect([addon.frame(name).visible, addon.eval("return __answers"), addon.eval(`return ${name}.title:GetText()`)], "a No that asks the next question leaves that one open, and answers it on its own").toEqual([true, ["no"], "Then this?"]);
  pressEscape(addon);
  expect(addon.eval("return __answers"), "the next question is answered by its own No").toEqual(["no", "no"]);
});

it("the question dialog: Enter presses a Yes that is not a danger button, out of combat only; other keys go on", () => {
  const addon = loggedIn();
  const name = "Vanguard_Question";
  // Asks the question (kind: "danger" or undefined) and keeps the answers.
  const ask = (kind) => addon.eval(`__answers = {} __passed = {} ns.Ask("Sure?", "Go", function() __answers[#__answers + 1] = "yes" end, function() end, ${kind}) `);
  // Presses a key on the question.
  const press = (k) => addon.eval(`${name}.__scripts.OnKeyDown(${name}, "${k}") return {}`);
  ask(undefined);
  addon.eval(`${name}.SetPropagateKeyboardInput = function(self, v) __passed[#__passed + 1] = v end`);
  expect(addon.eval(`return ${name}:GetScript("OnKeyDown") ~= nil`), "the dialog reads keys").toBe(true);
  press("A");
  expect([addon.eval("return #__answers"), addon.eval("return __passed")], "another key is passed on").toEqual([0, [true]]);
  press("ENTER");
  expect([addon.eval("return __answers"), addon.frame(name).visible, addon.eval("return __passed[2]")], "Enter presses the primary Yes and is not passed on").toEqual([["yes"], false, false]);
  ask('"danger"');
  press("NUMPADENTER");
  expect([addon.eval("return #__answers"), addon.frame(name).visible], "Enter never presses a danger button").toEqual([0, true]);
  ask(undefined);
  setCombat(addon, true);
  press("ENTER");
  expect([addon.eval("return #__answers"), addon.eval("return #__passed")], "in combat no key is caught and propagation is not touched").toEqual([0, 0]);
  setCombat(addon, false);
  addon.click(`${name}.no`);
});

it("the question dialog does not keep swallowing keys: the pass-on flag is reset when it hides, and a question shown in a fight reads no keys until it ends", () => {
  const addon = loggedIn();
  const name = "Vanguard_Question";
  addon.eval(`ns.Ask("Sure?", "Go", function() end, function() end)
    __passed, __kb = {}, {}
    ${name}.SetPropagateKeyboardInput = function(self, v) __passed[#__passed + 1] = v end
    ${name}.EnableKeyboard = function(self, on) __kb[#__kb + 1] = on end
    ${name}.__scripts.OnKeyDown(${name}, "TAB")`);
  expect(addon.eval("return __passed"), "Tab is the dialog's: the flag goes to take it").toEqual([false]);
  addon.eval(`${name}:Hide()`);
  expect([addon.eval("return __passed"), addon.eval("return __kb")], "hiding resets the flag to pass keys on, and the keyboard goes off").toEqual([[false, true], [false]]);
  addon.eval("__passed, __kb = {}, {}");
  setCombat(addon, true);
  addon.eval(`ns.Ask("In a fight?", "Go", function() end, function() end)`);
  expect(addon.eval("return { #__passed, __kb[#__kb] == false, #__kb > 0, Vanguard_Question:IsShown() }"), "shown in a fight: the keyboard is let go and the barred call is not made").toEqual([0, true, true, true]);
  setCombat(addon, false);
  expect(addon.eval("return { __passed[#__passed], __kb[#__kb] }"), "after the fight it takes the keyboard back with the flag reset").toEqual([true, true]);
  addon.eval(`${name}.EnableKeyboard = function(self, on) __kb[#__kb + 1] = on end ${name}:Hide()`);
  addon.click(`${name}.no`);
  setCombat(addon, true);
  addon.eval(`ns.Ask("Again?", "Go", function() end, function() end) ${name}:Hide()`);
  setCombat(addon, false);
  expect(addon.eval(`return ${name}:IsShown()`), "a question hidden before the fight ends stays hidden").toBe(false);
});

it("the reload dialog: the reason is the title and the dialog grows to fit it; the X is Later and the covering overlay goes with it", () => {
  const addon = loggedIn();
  const name = "Vanguard_Reload";
  addon.eval("ns.OfferReload('Changed.')");
  expect(titleOf(addon, name), "the title role in the text colour, T.SPACE.pad in").toMatchObject({ size: titleSize(addon), text: true, left: 16 });
  expect(addon.eval(`return { ${name}.title:GetText(), ${name}:GetHeight() }`), "the reason and the question, one line").toEqual(["Changed. Reload the UI now to apply it?", 96]);
  expect(closeOf(addon, name), "the X where every window has it").toEqual([px(addon, 24), px(addon, 24), true]);
  expect([escapes(addon, name), alphaOf(addon, name), insets(addon, `${name}.accept`, name).slice(2)], "Escape closes it, at the dialog alpha, the Reload button a pad from the corner").toEqual([true, 0.98, [16, 16]]);
  addon.eval(`ns.OfferReload(("Copied the whole profile into another one. "):rep(4))`);
  expect(addon.eval(`return ${name}:GetHeight() == 16 + ${name}.title:GetStringHeight() + 24 + 26 + 16 and ${name}:GetHeight() > 96`), "a long reason makes it taller").toBe(true);
  expect(addon.eval(`return ${name}.accept.reloadOverlay:IsShown()`), "the overlay covers Reload while it shows").toBe(true);
  addon.click(`${name}.chrome.close`);
  expect([addon.frame(name).visible, addon.eval(`return ${name}.accept.reloadOverlay:IsShown()`)], "the X hides it and the overlay with it").toEqual([false, false]);
});

it("string table: a text with no translation reads as its English key; a locale's file fills in only on that client", () => {
  const addon = loggedIn('GetLocale = function() return "deDE" end');
  expect(addon.eval('return { ns.L["Experience bar"], ns.Locale() }'), "no translation: the English key").toEqual(["Experience bar", "deDE"]);
  expect(addon.eval('local L = ns.NewLocale("deDE") L["TEST-ONLY Bags"] = "TEST-ONLY Taschen" return { ns.L["TEST-ONLY Bags"], ns.NewLocale("frFR") == nil }'), "the client's own locale gets the table, another locale nothing").toEqual(["TEST-ONLY Taschen", true]);
  const english = loggedIn('GetLocale = nil');
  expect(english.eval('return { ns.Locale(), ns.NewLocale("deDE") == nil }'), "a client that can't say its locale counts as enUS").toEqual(["enUS", true]);
});

it("string table: ns.English gives back the English key of a translation, and any other text as it is", () => {
  const addon = loggedIn('GetLocale = function() return "deDE" end');
  addon.eval('local L = ns.NewLocale("deDE") L["TEST-ONLY Bags"] = "TEST-ONLY Taschen"');
  expect(addon.eval('return { ns.English("TEST-ONLY Taschen"), ns.English("TEST-ONLY Bags"), ns.English("TEST-ONLY anything") }')).toEqual(["TEST-ONLY Bags", "TEST-ONLY Bags", "TEST-ONLY anything"]);
});

it("string table: ns.Format fills each {name} from its values, in any order, and leaves an unknown name as written", () => {
  const addon = loggedIn();
  expect(addon.eval('return ns.Format("{count} items sold for {money}", { count = 3, money = "1g" })')).toBe("3 items sold for 1g");
  expect(addon.eval('return ns.Format("für {money}: {count}", { count = 3, money = "1g" })'), "a translation may reorder the slots").toBe("für 1g: 3");
  expect(addon.eval('return ns.Format("{count} of {total}", { count = 0 })'), "a value missing stays as its slot; false and 0 fill in").toBe("0 of {total}");
});

it("command syntax in chat doubles its pipes, so the chat frame doesn't eat |r, |c or |t (\"<name>|remove\" printed as \"<name>emove\")", () => {
  const addon = loggedIn();
  expect(addon.eval('return ns.Literal("a|b||c")'), "every pipe doubled, already-doubled ones too").toBe("a||b||||c");
  addon.slash("help");
  const lines = Array.from(addon.chat());
  expect(lines.some((l) => l.includes("watch [add||remove <phrase>||list||clear]")), "/vg help's syntax column").toBe(true);
  expect(lines.some((l) => /\|[a-z<[]/.test(l.replace(/\|\|/g, "").replace(/\|c[0-9a-fA-F]{8}|\|r/g, ""))), "no bare pipe left before a letter in /vg help").toBe(false);
  addon.slash("corners sideways");
  expect(chatHas(addon, /Usage: \/vg corners square\|\|rounded/), "a usage line too").toBe(true);
});
