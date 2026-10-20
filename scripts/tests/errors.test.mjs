// errors: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import path from "node:path";
import { CLICK_LUA, FOREVER_ENV, MICRO_ENV, TIDY_ENV, UI_ENV, UNITS_ENV, calls, chatHas, expectErrors, isTok, loggedIn, putAway, setCombat } from "./helpers.mjs";

// The reload overlay on a button as [type, macro, key-down, sits above the button, template, clicks], or false.
const reloadOverlay = (addon, path) => addon.eval(`local b = ${path} local o = b.reloadOverlay
  return o and { o:GetAttribute("type"), o:GetAttribute("macrotext"), o:GetAttribute("useOnKeyDown"), o:GetFrameLevel() > b:GetFrameLevel(), o.__template, o.__clicks } or false`);
it("/vg errors: what Vanguard caught this session", () => {
  expectErrors(/^TEST-ONLY: \d+$/);
  const addon = loggedIn();
  addon.eval("ns.ClearErrors()");
  addon.slash("errors");
  expect(chatHas(addon, /No errors caught this session/), "with nothing caught, it says so").toBe(true);
  const broken = loggedIn(`__wfgStub.noAuraContainer = true
    local M = ns.Module("TEST-ONLY Broken", {}) function M.Enable() error("TEST-ONLY boom") end`);
  broken.eval("ns.ShowErrors = function(title, text) __shown = { title, text } end");
  broken.slash("errors");
  const text = broken.eval("return __shown[2]");
  expect(chatHas(broken, /\d+ error\(s\), opened in the copy window\./) && /\d+ error\(s\) caught this session \(\d+ in all\), newest last/.test(text) && /aura containers \(using Vanguard's own icons\)/.test(text) && /module TEST-ONLY Broken: .*TEST-ONLY boom  \(x1\)/.test(text), "a module that failed and a missing aura container are both listed").toBe(true);
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
  expectErrors("TEST-ONLY site: boom", "TEST-ONLY try: eval:2: bad x", "TEST-ONLY inner: in", "TEST-ONLY outer: eval:2: out");
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
  expectErrors("TEST-ONLY live: eval:2: TEST-ONLY deep", "event TEST_ONLY_LIVE: eval:2: TEST-ONLY deep", "TEST-ONLY late: x");
  const addon = loggedIn(LIVE_STACK_ENV);
  addon.eval('ns.ClearErrors() __failer = function() error("TEST-ONLY deep") end ns.Try("TEST-ONLY live", function() __failer() end)');
  expect(addon.eval("return ns.errors[1].stack"), "ns.Try keeps a stack that still has the failing function in it").toBe("TEST-ONLY failing frame live");
  addon.eval('ns.ClearErrors() ns.On("TEST_ONLY_LIVE", function() __failer() end) __wfgStub.fire("TEST_ONLY_LIVE")');
  expect(addon.eval("return ns.errors[1].stack"), "so does an event handler's").toBe("TEST-ONLY failing frame live");
  addon.eval('ns.ClearErrors() ns.Report("TEST-ONLY late", "x")');
  expect(addon.eval("return ns.errors[1].stack"), "while a report made outside any failure does not have it (the probe tells them apart)").toBe("TEST-ONLY failing frame gone");
});
it("caught errors: without debugstack or an error handler (this stub), and a hidden error value", () => {
  expectErrors("TEST-ONLY bare: x", "TEST-ONLY: (a hidden error message)");
  const addon = loggedIn("GetBuildInfo = nil debugstack = nil geterrorhandler = nil CallErrorHandler = nil");
  addon.eval('ns.ClearErrors() ns.Report("TEST-ONLY bare", "x")');
  expect(addon.eval("return { ns.errors[1].text, ns.errors[1].stack, ns.errors[1].count }"), "the error is kept without a stack").toEqual(["TEST-ONLY bare: x", "", 1]);
  addon.eval("ns.ShowErrors = function(title, text) __shown = { title, text } end");
  addon.clearChat();
  addon.slash("errors");
  const lines = addon.eval("return __shown[2]").split("\n");
  expect(lines[0], "the header names the version, an unknown interface version and the counts").toMatch(/^Vanguard \S+  ·  interface \?  ·  1 error\(s\) caught this session \(1 in all\), newest last:$/);
  expect(lines[1], "then the client line").toMatch(/^Client Retail  ·  auras on the/);
  expect(lines.slice(2), "then the error with its count and no stack lines").toEqual([expect.stringMatching(/^TEST-ONLY bare: x  \(x1\)$/)]);
  const secret = loggedIn('issecretvalue = function(v) return type(v) == "table" and v.__secret == true end');
  expect(secret.eval('ns.Report("TEST-ONLY", { __secret = true }) return ns.errors[#ns.errors].text'), "a hidden error value is named, never read").toBe("TEST-ONLY: (a hidden error message)");
});
it("caught errors: a game handler that fails or reports again cannot loop, and an empty handler slot", () => {
  expectErrors("TEST-ONLY outer: x", "TEST-ONLY inner: TEST-ONLY outer: x", "TEST-ONLY none: y");
  const broken = loggedIn(`__handled = 0 geterrorhandler = function() return function(msg) __handled = __handled + 1 ns.Report("TEST-ONLY inner", msg) error("TEST-ONLY handler broke") end end`);
  expect(broken.eval('ns.ClearErrors() __handled = 0 ns.Report("TEST-ONLY outer", "x") return { __handled, #ns.errors, ns.errors[1].text, ns.errors[2].text }'), "the inner report is kept but not handed back to the handler").toEqual([1, 2, "TEST-ONLY outer: x", "TEST-ONLY inner: TEST-ONLY outer: x"]);
  const none = loggedIn("geterrorhandler = function() return nil end");
  expect(none.eval('ns.ClearErrors() ns.Report("TEST-ONLY none", "y") return { #ns.errors, ns.errors[1].count }'), "no handler installed: kept, nothing forwarded").toEqual([1, 1]);
});
it("caught errors: an after-combat update that fails is reported and the rest still run", () => {
  expectErrors("after-combat update: eval:2: TEST-ONLY late");
  const addon = loggedIn();
  setCombat(addon, true);
  addon.eval('ns.OutOfCombat(function() error("TEST-ONLY late") end) ns.OutOfCombat(function() __after = true end)');
  setCombat(addon, false);
  expect(addon.eval("return __after"), "the second queued function ran").toBe(true);
  expect(addon.eval("return ns.errors[#ns.errors].text"), "the failure is kept under its site").toMatch(/^after-combat update: .*TEST-ONLY late$/);
  expect(chatHas(addon, /after-combat update: .*TEST-ONLY late/), "and told").toBe(true);
});
it("/vg errors: counts, build, interface version and the aura backend, then clear", () => {
  expectErrors("TEST-ONLY twice: x", "TEST-ONLY once: y");
  const addon = loggedIn(FOREVER_ENV + ERRORS_ENV);
  addon.eval('ns.ClearErrors() ns.Report("TEST-ONLY twice", "x") ns.Report("TEST-ONLY twice", "x") ns.Report("TEST-ONLY once", "y")');
  addon.eval("ns.ShowErrors = function(title, text) __shown = { title, text } end");
  addon.clearChat();
  addon.slash("errors");
  expect(chatHas(addon, /2 error\(s\), opened in the copy window\./), "chat gets a one-line note").toBe(true);
  expect(addon.eval("return __shown[1]"), "the copy window is titled").toMatch(/^Vanguard errors/);
  const shown = addon.eval("return __shown[2]").split("\n");
  expect(shown[0], "the first line has the interface version and both counts").toMatch(/interface 16001  ·  2 error\(s\) caught this session \(3 in all\), newest last:/);
  expect(shown[1], "the client line names the build and the aura backend").toMatch(/Client WoW Forever  ·  build 1\.16\.0 \(TEST-ONLY\)  ·  auras on the (engine|fallback)/);
  expect(shown.slice(2), "each error with its count, then its stack lines indented").toEqual([
    expect.stringMatching(/^TEST-ONLY twice: x  \(x2\)$/), expect.stringMatching(/^ {4}TEST-ONLY stack level 4$/), expect.stringMatching(/^ {4}TEST-ONLY frame 2$/),
    expect.stringMatching(/^TEST-ONLY once: y  \(x1\)$/), expect.stringMatching(/^ {4}TEST-ONLY stack level 4$/), expect.stringMatching(/^ {4}TEST-ONLY frame 2$/),
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
  // Reload's overlay: shown, anchored, and whether the dialog is protected (it holds or hangs on one).
  const cover = () => addon.eval(`local d = Vanguard_Reload local o = d.accept.reloadOverlay
    return { o:IsShown(), o:GetNumPoints() > 0 and o.__points.TOPLEFT.rel == d.accept, (d:IsProtected()) }`);
  addon.eval('ns.OfferReload("TEST-ONLY change.")');
  expect(cover(), "out of combat the overlay covers the shown button, and the dialog itself is not protected").toEqual([true, true, false]);
  addon.eval("Vanguard_Reload:Hide()");
  expect(cover()[0], "it hides with the button").toBe(false);
  addon.world.combat(true);
  expect(cover(), "a fight puts it away: hidden and let go of").toEqual([false, false, false]);
  addon.eval('ns.OfferReload("TEST-ONLY change.")');
  expect(addon.eval("return Vanguard_Reload:IsShown()"), "so the dialog still opens in combat").toBe(true);
  addon.world.combat(false);
  expect(cover(), "after the fight it covers the button again").toEqual([true, true, false]);
  addon.eval("Vanguard_Reload:Hide()");
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
  expectErrors("event TEST_ONLY_EVENT: eval:5: TEST-ONLY first");
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
  expectErrors("event TEST_ONLY_EVENT: eval:5: TEST-ONLY first");
  const out = loggedIn("debugstack = nil").eval(THROWING_HANDLERS + "return { ran = #__ran, last = ns.errors[#ns.errors] }");
  expect(out.ran, "the second handler ran").toBe(1);
  expect(out.last, "the record has no stack and nothing was forwarded").toMatchObject({ text: expect.stringMatching(/^event TEST_ONLY_EVENT: .*TEST-ONLY first$/), stack: "" });
});
it("events: a broken game error handler cannot lose the record", () => {
  expectErrors("event TEST_ONLY_EVENT: eval:5: TEST-ONLY first");
  const broken = loggedIn('geterrorhandler = function() return function() error("TEST-ONLY handler broke") end end');
  const last = broken.eval(THROWING_HANDLERS + "return ns.errors[#ns.errors].text");
  expect(last, "the handler's own failure is swallowed").toMatch(/TEST-ONLY first$/);
  expect(last).not.toMatch(/handler broke|error in error handling/);
  const none = loggedIn("geterrorhandler = function() return nil end");
  expect(none.eval(THROWING_HANDLERS + "return { #__ran, ns.errors[#ns.errors].text }"), "a client whose handler slot is empty is treated like one without").toEqual([1, expect.stringMatching(/^event TEST_ONLY_EVENT: .*TEST-ONLY first$/)]);
});
it("events: Blizzard's CallErrorHandler is preferred, and called straight from the failing stack's handler", () => {
  expectErrors("event TEST_ONLY_EVENT: eval:5: TEST-ONLY first");
  const addon = loggedIn(`__called = nil CallErrorHandler = function(err) __called = err __caller = debug.getinfo(2, "S").what end
    geterrorhandler = function() return function() __wrong = true end end`);
  const out = addon.eval(THROWING_HANDLERS + "return { called = __called, wrong = __wrong, caller = __caller }");
  expect(out.called, "CallErrorHandler got the raw error").toMatch(/TEST-ONLY first$/);
  expect(out.wrong, "and geterrorhandler was not called as well").toBeUndefined();
  expect(out.caller, "its caller is a Lua function (the message handler), not pcall, so the popup's stack starts at the failing frames").toBe("Lua");
});
it("events: a game handler that fails inside a failing handler keeps the record, loses nothing after, and is not told twice", () => {
  expectErrors("event TEST_ONLY_EVENT: eval:5: TEST-ONLY first", "TEST-ONLY again: second");
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
  expectErrors("event UNIT_LEVEL: eval:2: TEST-ONLY unit handler", "event TEST_ONLY_GONE: not on this client");
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
  addon.slash("skins testonly OFF");
  expect([chatHas(addon, /Skin for TESTONLY off/), addon.eval("return ns.Settings('skins').TESTONLY")], "the skin's name and on|off are read in any case").toEqual([true, false]);
  addon.slash("skins TESTONLY maybe");
  expect([chatHas(addon, /Usage: \/vg skins TESTONLY on\|off/), addon.eval("return ns.Settings('skins').TESTONLY")], "a word that isn't on or off changes nothing").toEqual([true, false]);
  addon.slash("skins NoSuchSkin on");
  expect([chatHas(addon, /No skin called NoSuchSkin/), addon.eval("return ns.Settings('skins').NoSuchSkin")], "a skin nobody registered is refused and not stored").toEqual([true, null]);
  addon.slash("disable unitframes");
  expect([chatHas(addon, /UnitFrames disabled/), addon.eval("return ns.ModuleEnabled('UnitFrames')")], "a module's name is read in any case").toEqual([true, false]);
  addon.slash("enable UNITFRAMES");
  expect(addon.eval("return ns.ModuleEnabled('UnitFrames')"), "and enabled again the same way").toBe(true);
  addon.slash("profile");
  expect(chatHas(addon, /Profile: Default/), "/vg profile with no name shows the current profile").toBeTruthy();
  addon.slash("spec");
  expect(chatHas(addon, /Spec 2 uses the character's profile/), "/vg spec with no name shows that no spec profile is set").toBeTruthy();
});
it("a bare /vg that fails is caught and kept for /vg errors, like any other command", () => {
  expectErrors("slash options: eval:2: TEST-ONLY toggle broke");
  const addon = loggedIn();
  addon.eval('ns.Options.Toggle = function() error("TEST-ONLY toggle broke") end');
  addon.slash("");
  expect(addon.eval("return ns.errors[#ns.errors].text"), "the error is reported under slash options").toMatch(/^slash options: .*TEST-ONLY toggle broke/);
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
  expect(/Icons\\House$/.test(addon.eval("return ns.FrameState('vgGlyph')[HousingMicroButton].__texture")), "the housing button gets the house icon").toBe(true);
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
  expectErrors("TEST-ONLY site: TEST-ONLY failure", "TEST-ONLY site: TEST-ONLY other");
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
  expect(chatHas(addon, /2 error\(s\), opened in the copy window/), "clicking the footer line opens them (/vg errors)").toBe(true);
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

it("A-14 the errors window: Report a bug opens the feedback form on a bug, Clear empties the list, and other text windows don't show them", () => {
  expectErrors("TEST-ONLY shown: x");
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.ClearErrors() ns.Report("TEST-ONLY shown", "x")');
  addon.slash("errors");
  // The text window's shown buttons, left to right as the player reads them.
  const buttons = () => addon.eval(`local f, out = Vanguard_TextDialog, {}
    for _, b in ipairs({ f.clear, f.close, f.primary }) do if b and b:IsShown() then out[#out + 1] = b.text:GetText() end end
    return out`);
  expect(buttons(), "Clear, Close and the accent Report a bug").toEqual(["Clear", "Close", "Report a bug"]);
  expect(addon.eval('return __click("Report a bug")'), "the button is there").toBe(true);
  expect(addon.eval("return { Vanguard_TextDialog:IsShown(), Vanguard_Feedback:IsShown(), Vanguard_Feedback.kind }"), "the errors window gives way to the form, on a bug").toEqual([false, true, "bug"]);
  addon.eval("Vanguard_Feedback:Hide()");
  addon.slash("errors");
  addon.clearChat();
  expect(addon.eval('return __click("Clear")'), "Clear is there").toBe(true);
  expect([addon.eval("return { #ns.errors, Vanguard_TextDialog:IsShown() }"), chatHas(addon, /Errors cleared\./)], "the list emptied, the window closed, chat says so").toEqual([[0, false], true]);
  addon.slash("errors");
  addon.eval('ns.ShowText("TEST-ONLY", "TEST-ONLY text")');
  expect(buttons(), "a plain text window opened over it shows Close only").toEqual(["Close"]);
});
