// core-errors: /vg errors and the caught errors, reload buttons, events and their failing handlers,
// and secret checks, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { default as path } from "node:path";
import { FOREVER_ENV, calls, chatHas, loggedIn, setCombat } from "./helpers.mjs";

// The reload overlay on a button as [type, macro, key-down, sits above the button, template, clicks], or false.
const reloadOverlay = (addon, path) => addon.eval(`local b = ${path} local o = b.reloadOverlay
  return o and { o:GetAttribute("type"), o:GetAttribute("macrotext"), o:GetAttribute("useOnKeyDown"), o:GetFrameLevel() > b:GetFrameLevel(), o.__template, o.__clicks } or false`);

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
