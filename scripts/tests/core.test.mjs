// core: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs): saved
// variables and upgrades, modules, the combat queue, pins, unit events, the slash commands, the
// Forever fixes and the error badge.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { FOREVER_ENV, MICRO_ENV, TIDY_ENV, UI_ENV, UNITS_ENV, chatHas, isTok, loggedIn, putAway, setCombat } from "./helpers.mjs";

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
  hooksecurefunc = function(a, b, c) local orig = a[b] a[b] = function(...) local r = orig(...) c(...) return r end end
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
