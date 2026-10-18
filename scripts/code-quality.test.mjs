// Self-test for the code-quality checker (scripts/lib/code-quality.mjs).
// TEST-ONLY sources below are never loaded. The repo-wide scan stays in
// scripts/check-code-quality.mjs (npm run quality, part of npm run verify).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import fengari from "fengari";
import { describe, expect, it } from "vitest";
import { MAX_TOP_LOCALS, REPORT_RULES, SECURE_ALLOW, checkSource, compareToBaseline, reportSource, sourceFiles, topLevelLocals } from "./lib/code-quality.mjs";
import { root } from "./check-zip.mjs";

// n body lines of Lua, or of JS when js is true.
const body = (n, js = false) => Array.from({ length: n }, (_, i) => `  ${js ? "let" : "local"} v${i} = ${i}${js ? ";" : ""}`).join("\n");

// The problems the checker reports for one TEST-ONLY source.
const problems = (file, src) => checkSource(file, src).map((p) => p.message).join("\n");

// Ten documented Lua lines pass.
function luaTenLines() {
  expect(problems("t.lua", `-- doc\nlocal function f()\n${body(10)}\nend\n`)).toBe("");
}

// Eleven Lua lines fail.
function luaElevenLines() {
  expect(problems("t.lua", `-- doc\nlocal function f()\n${body(11)}\nend\n`)).toMatch(/is 11 lines/);
}

// An undocumented Lua function fails.
function luaUndocumented() {
  expect(problems("t.lua", "local function f()\nend\n")).toMatch(/no comment above/);
}

// A blank line between the comment and the function fails.
function luaBlankBreaksDoc() {
  expect(problems("t.lua", "-- doc\n\nlocal function f()\nend\n")).toMatch(/no comment above/);
}

// Blank lines and comments inside the body do not count.
function luaBlanksDontCount() {
  expect(problems("t.lua", `-- doc\nlocal function f()\n\n  -- note\n${body(10)}\n\nend\n`)).toBe("");
}

// A nested function's lines count toward the parent.
function luaNestedCounts() {
  const src = `-- doc\nlocal function f()\n  local g = function()\n${body(9)}\n  end\nend\n`;
  expect(problems("t.lua", src)).toMatch(/is 11 lines/);
}

// A long string is not code, even when it contains keywords.
function luaLongStrings() {
  const src = `-- doc\nlocal function f()\n  local s = [[\nfunction x() end\nif y then\n]]\n  return s\nend\n`;
  expect(problems("t.lua", src)).toBe("");
}

// One comment covers a run of one-line functions.
function luaOneCommentRun() {
  expect(problems("t.lua", "-- docs\nfunction a() end\nfunction b() end\n")).toBe("");
}

// Ten documented JS lines pass.
function jsTenLines() {
  expect(problems("t.mjs", `// doc\nfunction f() {\n${body(10, true)}\n}\n`)).toBe("");
}

// Eleven JS lines fail.
function jsElevenLines() {
  expect(problems("t.mjs", `// doc\nfunction f() {\n${body(11, true)}\n}\n`)).toMatch(/is 11 lines/);
}

// An undocumented arrow function fails.
function jsUndocumentedArrow() {
  expect(problems("t.mjs", "const f = () => {\n  return 1;\n};\n")).toMatch(/no comment above/);
}

// The callback passed to attempt() is not exempt from the length limit.
function attemptNotExempt() {
  expect(problems("t.mjs", `attempt("case", () => {\n${body(20, true)}\n});\n`)).toMatch(/is 20 lines/);
}

// The callback passed to it() is exempt from the length limit.
function itExempt() {
  expect(problems("t.mjs", `it("case", () => {\n${body(20, true)}\n});\n`)).toBe("");
}

// A nested function inside it() is still length-checked.
function itNestedStillChecked() {
  const src = `it("case", () => {\n  // doc\n  function inner() {\n${body(11, true)}\n  }\n  return inner;\n});\n`;
  expect(problems("t.mjs", src)).toMatch(/is 11 lines/);
}

// A describe() callback is not exempt from the length limit.
function describeNotExempt() {
  expect(problems("t.mjs", `describe("case", () => {\n${body(20, true)}\n});\n`)).toMatch(/is 20 lines/);
}

// A color setter called with numbers fails.
function colorSetterFails() {
  const src = "-- doc\nlocal function f(fs)\n  fs:SetTextColor(1, 1, 1)\nend\n";
  expect(problems("Modules/t.lua", src)).toMatch(/color numbers/);
}

// A table of three 0-1 numbers fails outside the theme.
function colorTableFails() {
  expect(problems("Core/t.lua", "local C = { 0.2, 0.6, 1 }\n")).toMatch(/color numbers/);
}

// A theme token call passes.
function colorTokensPass() {
  const src = "-- doc\nlocal function f(fs)\n  T.Color(fs, \"text\")\nend\n";
  expect(problems("Modules/t.lua", src)).toBe("");
}

// Big numbers, comments and strings are not colors.
function colorNonColorsPass() {
  const src = "local P = { 20, 40, 60 }\n-- { 1, 1, 1 } in a comment\nlocal s = \"{ 0, 0, 1 }\"\n";
  expect(problems("Modules/t.lua", src)).toBe("");
}

// A |c escape with a written color fails.
function colorEscapeFails() {
  expect(problems("Core/t.lua", 'local P = "|cff3d9effHi|r"\n')).toMatch(/color numbers/);
}

// The theme file itself may write color numbers.
function themeMayWriteColors() {
  expect(problems("Core/Theme.lua", "local C = { 0.2, 0.6, 1 }\n")).toBe("");
}

// T.SetFont with a written size fails.
function fontSetFontFails() {
  const src = "-- doc\nlocal function f(fs)\n  T.SetFont(fs, 12)\nend\n";
  expect(problems("Modules/t.lua", src)).toMatch(/font size/);
}

// SetFont with a written size fails.
function fontMethodSizeFails() {
  const src = "-- doc\nlocal function f(fs, p)\n  fs:SetFont(p, 12, \"\")\nend\n";
  expect(problems("Modules/t.lua", src)).toMatch(/font size/);
}

// Text roles and a computed size pass.
function fontRolesPass() {
  const src = "-- doc\nlocal function f(fs, p)\n  fs:SetFont(p, size(fs), \"\")\n  T.Text(fs, \"label\")\nend\n";
  expect(problems("Modules/t.lua", src)).toBe("");
}

// Color numbers outside addon Lua are ignored.
function colorAddonOnly() {
  expect(problems("scripts/lib/t.lua", "local C = { 0.2, 0.6, 1 }\n")).toBe("");
}

// A Lua statement inside a documented function, so only the bare-callback rule can report.
const inFn = (stmt) => `-- doc\nlocal function f(b, fn)\n  ${stmt}\nend\n`;

// A bare hooksecurefunc fails and names ns.Guard.
function hookBareFails() {
  expect(problems("Modules/t.lua", inFn('hooksecurefunc(f, "X", fn)'))).toMatch(/hooksecurefunc.*ns\.Guard/);
}

// A guarded hook passes, in the object form and the global-name form.
function hookGuardedPasses() {
  expect(problems("Modules/t.lua", inFn('hooksecurefunc(f, "X", ns.Guard("hook X", fn))'))).toBe("");
  expect(problems("Modules/t.lua", inFn('hooksecurefunc("X", ns.Guard("hook X", fn))'))).toBe("");
}

// A callback that starts on the next line is read too: guarded passes, bare fails.
function hookNextLine() {
  expect(problems("Modules/t.lua", inFn('hooksecurefunc(f, "X",\n    ns.Guard("hook X", fn))'))).toBe("");
  expect(problems("Modules/t.lua", inFn('hooksecurefunc(f, "X",\n    function() end)'))).toMatch(/bare hooksecurefunc/);
}

// A function body with commas of its own is one argument, not several.
function hookBodyCommas() {
  const bare = inFn('hooksecurefunc(f, "X", function(a, b)\n    local c, d = 1, 2\n  end)');
  expect(problems("Modules/t.lua", bare)).toMatch(/bare hooksecurefunc/);
  expect(problems("Modules/t.lua", inFn('hooksecurefunc(f, "X", ns.Guard("hook X", function(a)\n    local c, d = 1, 2\n  end))'))).toBe("");
}

// Checking that hooksecurefunc exists is not a call.
function hookTypeCheck() {
  expect(problems("Modules/t.lua", inFn('if type(hooksecurefunc) == "function" then fn() end'))).toBe("");
}

// A bare OnClick fails, a guarded one and a literal nil pass, and another script kind is out of scope.
function clickRule() {
  expect(problems("Modules/t.lua", inFn('b:SetScript("OnClick", fn)'))).toMatch(/bare OnClick/);
  expect(problems("Modules/t.lua", inFn('b:SetScript("OnClick", ns.Guard("click", fn))'))).toBe("");
  expect(problems("Modules/t.lua", inFn('b:SetScript("OnClick", nil)'))).toBe("");
  expect(problems("Modules/t.lua", inFn('b:SetScript("OnEnter", fn)'))).toBe("");
}

// Bare timers fail, in each of the three forms; guarded ones pass.
function timerRule() {
  expect(problems("Modules/t.lua", inFn("C_Timer.After(1, fn)"))).toMatch(/bare C_Timer\.After/);
  expect(problems("Modules/t.lua", inFn("C_Timer.NewTicker(5, fn)"))).toMatch(/bare C_Timer\.NewTicker/);
  expect(problems("Modules/t.lua", inFn("C_Timer.NewTimer(5, fn)"))).toMatch(/bare C_Timer\.NewTimer/);
  expect(problems("Modules/t.lua", inFn('C_Timer.After(1, ns.Guard("later", fn))'))).toBe("");
  expect(problems("Modules/t.lua", inFn('C_Timer.NewTicker(5, ns.Guard("tick", fn))'))).toBe("");
}

// ns.Soon's timer in Core/Combat.lua passes; another bare timer there, or the same one elsewhere, fails.
function soonException() {
  expect(problems("Core/Combat.lua", inFn("C_Timer.After(0, function() runSoon(key) end)"))).toBe("");
  expect(problems("Core/Combat.lua", inFn("C_Timer.After(1, fn)"))).toMatch(/bare C_Timer\.After/);
  expect(problems("Modules/t.lua", inFn("C_Timer.After(0, function() runSoon(key) end)"))).toMatch(/bare C_Timer\.After/);
}

// Mentions in comments and strings are ignored, and files outside Core/ and Modules/ are not checked.
function bareIgnored() {
  expect(problems("Modules/t.lua", inFn('-- hooksecurefunc(f, "X", fn)\n  local s = "C_Timer.After(1, fn)"'))).toBe("");
  expect(problems("scripts/lib/t.lua", inFn("C_Timer.After(1, fn)"))).toBe("");
}

// An off-scale padding constant fails; scale values and T.SPACE pass.
function spacingScale() {
  expect(problems("Modules/t.lua", "local PAD = 10\n")).toMatch(/spacing constant/);
  expect(problems("Modules/t.lua", "local PAD = 12\n")).toBe("");
  expect(problems("Core/Layout.lua", "L.GAP = 6\n")).toBe("");
}

describe(
  "code quality",
  // Hooks, clicks and timers run under ns.Guard.
  () => {
    it("hooks: a bare hooksecurefunc fails", hookBareFails);
    it("hooks: a guarded hook passes", hookGuardedPasses);
    it("hooks: a callback on the next line is read", hookNextLine);
    it("hooks: commas inside the callback do not split it", hookBodyCommas);
    it("hooks: a type check is not a call", hookTypeCheck);
    it("clicks: OnClick needs a guard, nil and other scripts pass", clickRule);
    it("timers: bare C_Timer calls fail, guarded ones pass", timerRule);
    it("timers: only ns.Soon's timer in Core/Combat.lua is excepted", soonException);
    it("hooks: comments, strings and other folders are ignored", bareIgnored);
  },
);

// Lua 5.3 syntax in addon Lua fails: integer division, bit operators, goto and labels.
function lua53Fails() {
  const bad = { "//": "local x = 7 // 2", "&": "local x = 1 & 3", "|": "local x = 1 | 2", "~": "local x = ~5", "<<": "local x = 1 << 2", ">>": "local x = 8 >> 1", goto: "goto done", "::": "::done::" };
  for (const [what, stmt] of Object.entries(bad)) {
    expect(problems("Modules/t.lua", `${stmt}\n`), what).toContain(`Lua 5.3 syntax (${what})`);
  }
}

// Lua 5.1's own spellings pass: ~=, .., comments, strings, a field named goto, a division.
function lua53Passes() {
  const ok = 'local a = x ~= y\nlocal b = "a // b & c" .. [[ | ~ ]]\n-- 1 // 2 & goto x\nlocal c = t.goto\nlocal d = 6 / 2 < 4\n';
  expect(problems("Modules/t.lua", ok)).toBe("");
}

// The rule covers addon Lua only, and reports the line.
function lua53Scope() {
  expect(problems("scripts/lib/t.lua", "local x = 7 // 2\n")).toBe("");
  expect(checkSource("Core/t.lua", "local a = 1\n\nlocal x = 7 // 2\n")[0].line).toBe(3);
}

// The rule agrees with the real Lua 5.1 compiler where it is installed.
function lua53MatchesLuac() {
  if (spawnSync("luac5.1", ["-v"]).error) return;
  for (const src of ["local x = 7 // 2", "local x = 1 & 3", "goto done", "::done::", "local x = 1 << 2", "local x = ~1", "local a = 1 ~= 2"]) {
    const compiles = spawnSync("luac5.1", ["-p", "-"], { input: src }).status === 0;
    expect(problems("Core/t.lua", `${src}\n`) === "", src).toBe(compiles);
  }
}

describe(
  "code quality",
  // Lua 5.1 only.
  () => {
    it("Lua 5.3 syntax fails", lua53Fails);
    it("Lua 5.1 syntax passes", lua53Passes);
    it("Lua 5.3 syntax is judged in addon Lua only", lua53Scope);
    it("Lua 5.3 syntax agrees with luac5.1", lua53MatchesLuac);
  },
);

describe(
  "code quality",
  // Lua length, nesting, long strings and doc comments.
  () => {
    it("Lua: 10 documented lines pass", luaTenLines);
    it("Lua: 11 lines fail", luaElevenLines);
    it("Lua: undocumented function fails", luaUndocumented);
    it("Lua: a blank line breaks the doc", luaBlankBreaksDoc);
    it("Lua: blank and comment lines don't count", luaBlanksDontCount);
    it("Lua: nested functions count toward the parent", luaNestedCounts);
    it("Lua: long strings are not code", luaLongStrings);
    it("Lua: one comment covers a run of one-liners", luaOneCommentRun);
  },
);

describe(
  "code quality",
  // JS length, doc comments, and the it() exemption.
  () => {
    it("JS: 10 documented lines pass", jsTenLines);
    it("JS: 11 lines fail", jsElevenLines);
    it("JS: undocumented arrow fails", jsUndocumentedArrow);
    it("JS: attempt() test cases are not exempt", attemptNotExempt);
    it("JS: it() test cases are exempt", itExempt);
    it("JS: it() does not exempt a nested function", itNestedStillChecked);
    it("JS: describe() callbacks are not exempt", describeNotExempt);
  },
);

describe(
  "code quality",
  // Color numbers and font sizes outside Core/Theme.lua.
  () => {
    it("colors: a setter with numbers fails", colorSetterFails);
    it("colors: a 0-1 number table fails", colorTableFails);
    it("colors: theme tokens pass", colorTokensPass);
    it("colors: big numbers, comments and strings pass", colorNonColorsPass);
    it("colors: a |c escape with a written color fails", colorEscapeFails);
    it("colors: the theme itself may write them", themeMayWriteColors);
    it("fonts: T.SetFont with a size fails", fontSetFontFails);
    it("fonts: SetFont with a written size fails", fontMethodSizeFails);
    it("fonts: roles and computed sizes pass", fontRolesPass);
    it("colors: only addon Lua is checked", colorAddonOnly);
  },
);

// Report-only rules (#263) ----------------------------------------------------------------

// The report-only rules each finding of one TEST-ONLY source hit, in order.
const reported = (src, file = "Modules/t.lua") => reportSource(file, src).map((f) => f.rule);
const SECURE = "secure-outside-combat-guard";
const ONUPDATE = "unbounded-onupdate";
const HANDLER = "unguarded-script-handler";

// A bare SetAttribute in a function is reported with its line and fix, and does not block.
function secureBare() {
  const src = inFn('b:SetAttribute("type", "macro")');
  expect(reported(src)).toEqual([SECURE]);
  expect(reportSource("Modules/t.lua", src)[0]).toMatchObject({ line: 3, message: expect.stringMatching(/^SetAttribute\(\) outside a combat guard: run it through ns\.OutOfCombat/) });
  expect(problems("Modules/t.lua", src)).toBe("");
}

// Each kind of protected call is read.
function secureKinds() {
  const calls = ['RegisterStateDriver(b, "visibility", "show")', "RegisterAttributeDriver(b, 'x', 'y')", "SecureHandlerWrapScript(b, 'OnClick', h, '')", "RegisterUnitWatch(b)", "ClearOverrideBindings(b)", 'SetOverrideBindingClick(b, true, "F", "B")'];
  for (const call of calls) expect(reported(inFn(call)), call).toEqual([SECURE]);
}

// A function passed to ns.OutOfCombat passes.
function secureDeferred() {
  expect(reported(inFn('ns.OutOfCombat(function() b:SetAttribute("x", 1) end, "key")'))).toEqual([]);
}

// A function named inside ns.OutOfCombat passes, and so does one it calls.
function secureDeferredByName() {
  const src = "-- doc\nlocal function set(b)\n  b:SetAttribute('x', 1)\nend\n-- doc\nlocal function apply(b)\n  set(b)\nend\n-- doc\nfunction M.Go(b)\n  ns.OutOfCombat(function() apply(b) end)\nend\n";
  expect(reported(src)).toEqual([]);
  expect(reported("-- doc\nfunction M.Apply(b)\n  b:SetAttribute('x', 1)\nend\nns.OutOfCombat(M.Apply)\n")).toEqual([]);
}

// A combat check before the call passes; one after it does not.
function secureChecked() {
  expect(reported(inFn('if InCombatLockdown() then return end\n  b:SetAttribute("x", 1)'))).toEqual([]);
  expect(reported(inFn('if ns.InCombat() then return end\n  RegisterStateDriver(b, "x", "y")'))).toEqual([]);
  expect(reported(inFn('b:SetAttribute("x", 1)\n  if InCombatLockdown() then return end'))).toEqual([SECURE]);
}

// Top-level (load time) calls, snippets in strings, mentions and other folders pass.
function secureIgnored() {
  expect(reported('local b = CreateFrame("Button")\nb:SetAttribute("type", "macro")\n')).toEqual([]);
  expect(reported(inFn('SecureHandlerExecute(b, "self:SetAttribute(\'x\', 1)")'))).toEqual([SECURE]);
  expect(reported(inFn('-- b:SetAttribute("x", 1)\n  local s = "RegisterStateDriver(b)"'))).toEqual([]);
  expect(reported(inFn("if type(RegisterStateDriver) == 'function' then fn() end"))).toEqual([]);
  expect(reported(inFn('b:SetAttribute("x", 1)'), "scripts/lib/t.lua")).toEqual([]);
  expect(reported(inFn('b:SetAttribute("x", 1)'), "Modules/t.mjs")).toEqual([]);
}

// The allow-list is explicit and starts empty.
function secureAllowList() {
  expect([...SECURE_ALLOW]).toEqual([]);
}

// A handler that runs every frame is reported, and does not block.
function onUpdateBare() {
  const src = inFn('b:SetScript("OnUpdate", function(self, dt) fn() end)');
  expect(reported(src)).toEqual([ONUPDATE]);
  expect(reportSource("Modules/t.lua", src)[0].message).toMatch(/neither throttled nor cleared/);
  expect(problems("Modules/t.lua", src)).toBe("");
}

// Adding up (or counting down) elapsed time and acting past a threshold passes, as does GetTime().
function onUpdateThrottled() {
  expect(reported(inFn('b:SetScript("OnUpdate", function(_, dt)\n    t = t + dt\n    if t >= 0.2 then t = 0 fn() end\n  end)'))).toEqual([]);
  expect(reported(inFn('b:SetScript("OnUpdate", function(s, e)\n    s.wait = s.wait - e\n    if s.wait > 0 then return end\n  end)'))).toEqual([]);
  expect(reported(inFn('b:SetScript("OnUpdate", function()\n    if GetTime() < nextAt then return end\n  end)'))).toEqual([]);
}

// Adding up time without acting on it, or sums of another parameter, are not a throttle.
function onUpdateNotThrottled() {
  expect(reported(inFn('b:SetScript("OnUpdate", function(_, dt) t = t + dt end)'))).toEqual([ONUPDATE]);
  expect(reported(inFn('b:SetScript("OnUpdate", function(_, dt, x) if x + 1 then return end end)'))).toEqual([ONUPDATE]);
}

// A file with a local tick(_, dt) of this body that sets it as an OnUpdate handler.
const withTick = (body) => `-- doc\nlocal function tick(_, dt)\n${body}\nend\n${inFn('b:SetScript("OnUpdate", tick)')}`;

// A named handler is looked up in the file; one defined elsewhere is reported.
function onUpdateNamed() {
  expect(reported(withTick("  t = t + dt\n  if t < 1 then return end"))).toEqual([]);
  expect(reported(withTick("  fn()"))).toEqual([ONUPDATE]);
  expect(reported(inFn('b:SetScript("OnUpdate", Elsewhere.Tick)'))).toEqual([ONUPDATE]);
}

// A file that clears its handler passes, also with a conditional nil.
function onUpdateCleared() {
  expect(reported(inFn('b:SetScript("OnUpdate", fn)\n  b:SetScript("OnUpdate", nil)'))).toEqual([]);
  expect(reported(inFn('b:SetScript("OnUpdate", on and fn or nil)'))).toEqual([]);
}

// HookScript is read, a guarded literal is looked into, other scripts and folders are not.
function onUpdateForms() {
  expect(reported(inFn('b:HookScript("OnUpdate", function() fn() end)'))).toEqual([ONUPDATE]);
  expect(reported(inFn('b:SetScript("OnUpdate", ns.Guard("tick", function(_, dt) t = t + dt if t > 1 then fn() end end))'))).toEqual([]);
  expect(reported(inFn('b:SetScript("OnShow", function() fn() end)'))).toEqual([HANDLER]);
  expect(reported(inFn('b:SetScript("OnUpdate", fn)'), "scripts/lib/t.lua")).toEqual([]);
}

describe(
  "code quality, report-only",
  // Secure calls outside a combat guard.
  () => {
    it("secure: a bare SetAttribute is reported, and does not block", secureBare);
    it("secure: each kind of protected call is read", secureKinds);
    it("secure: a function passed to ns.OutOfCombat passes", secureDeferred);
    it("secure: a function named under ns.OutOfCombat passes, and one it calls", secureDeferredByName);
    it("secure: a combat check before the call passes, after it does not", secureChecked);
    it("secure: load time, strings, mentions and other folders pass", secureIgnored);
    it("secure: the allow-list is explicit and starts empty", secureAllowList);
  },
);

// A bare OnEnter or OnShow handler is reported with its line and fix, on SetScript and HookScript, and does not block.
function handlerBare() {
  const src = inFn('b:SetScript("OnEnter", function() fn() end)');
  expect(reported(src)).toEqual([HANDLER]);
  expect(reportSource("Modules/t.lua", src)[0]).toMatchObject({ line: 3, message: expect.stringMatching(/^OnEnter handler is not an ns\.Guard/) });
  expect(reported(inFn('f:HookScript("OnShow", GW.Light)'))).toEqual([HANDLER]);
  expect(problems("Modules/t.lua", src)).toBe("");
}

// A guarded handler, a cleared one, and the scripts other rules own pass; other folders are not read.
function handlerPasses() {
  expect(reported(inFn('b:SetScript("OnEnter", ns.Guard("enter", function() fn() end))'))).toEqual([]);
  expect(reported(inFn('b:SetScript("OnKeyDown", nil)\n  b:SetScript("OnHide", on and fn or nil)'))).toEqual([]);
  expect(reported(inFn('b:SetScript("OnClick", ns.Guard("click", fn))'))).toEqual([]);
  expect(reported(inFn('b:SetScript("OnEnter", fn)'), "scripts/lib/t.lua")).toEqual([]);
  expect(reported(inFn('b:SetScript("OnEnter", fn)'), "Core/t.mjs")).toEqual([]);
}

// OnClick on SetScript is the blocking rule's; on HookScript it is this rule's. OnUpdate has its own rule.
function handlerOverlap() {
  expect(reported(inFn('b:SetScript("OnClick", fn)'))).toEqual([]);
  expect(reported(inFn('b:HookScript("OnClick", fn)'))).toEqual([HANDLER]);
  expect(reported(inFn('b:SetScript("OnUpdate", fn)'))).toEqual([ONUPDATE]);
}

describe(
  "code quality, report-only",
  // Script handlers are ns.Guard calls.
  () => {
    it("handlers: a bare OnEnter or OnShow is reported, and does not block", handlerBare);
    it("handlers: guarded, cleared, other folders and the blocking rule's scripts pass", handlerPasses);
    it("handlers: OnClick and OnUpdate belong to the other rules", handlerOverlap);
  },
);

describe(
  "code quality, report-only",
  // OnUpdate handlers are throttled or cleared.
  () => {
    it("OnUpdate: an every-frame handler is reported, and does not block", onUpdateBare);
    it("OnUpdate: elapsed-time and GetTime throttles pass", onUpdateThrottled);
    it("OnUpdate: adding time without a threshold is not a throttle", onUpdateNotThrottled);
    it("OnUpdate: a named handler is looked up in the file", onUpdateNamed);
    it("OnUpdate: a file that clears its handler passes", onUpdateCleared);
    it("OnUpdate: HookScript, guarded literals, other scripts and folders", onUpdateForms);
  },
);

it("baseline: a count above fails, below asks to lower it, a missing rule counts as 0", () => {
  const rows = compareToBaseline({ [SECURE]: 3, [ONUPDATE]: 1 }, { [SECURE]: 2 });
  expect(rows).toEqual([
    { rule: SECURE, count: 3, baseline: 2, status: "above" },
    { rule: ONUPDATE, count: 1, baseline: 0, status: "above" },
    { rule: HANDLER, count: 0, baseline: 0, status: "at" },
  ]);
  expect(compareToBaseline({ [SECURE]: 1 }, { [SECURE]: 2, [ONUPDATE]: 0, [HANDLER]: 0 }).map((r) => r.status)).toEqual(["below", "at", "at"]);
});

it("baseline: the committed file lists every report-only rule as a whole number", () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, "scripts/code-quality-baseline.json"), "utf8"));
  expect(Object.keys(baseline).sort()).toEqual([...REPORT_RULES].sort());
  for (const n of Object.values(baseline)) expect(Number.isInteger(n) && n >= 0).toBe(true);
});

it("npm run quality passes on the repo and prints each report-only count against its baseline", () => {
  const out = execFileSync(process.execPath, [path.join(root, "scripts/check-code-quality.mjs")], { encoding: "utf8" });
  for (const rule of REPORT_RULES) expect(out).toMatch(new RegExp(`^ {2}${rule} +\\d+ {2}\\(baseline \\d+\\)`, "m"));
});

// A new file nobody has added to git yet is checked too; ignored and deleted ones aren't.
it("the scan covers new files, not ignored or deleted ones", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vg-quality-"));
  // Runs git in the scratch repo.
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  for (const [f, text] of [["tracked.lua", "-- x\n"], ["gone.lua", "-- x\n"], [".gitignore", "ignored.lua\n"]]) fs.writeFileSync(path.join(dir, f), text);
  git("add", "tracked.lua", "gone.lua", ".gitignore");
  fs.rmSync(path.join(dir, "gone.lua"));
  for (const f of ["new.lua", "ignored.lua", "notes.txt"]) fs.writeFileSync(path.join(dir, f), "-- x\n");
  expect(sourceFiles(dir).sort()).toEqual(["new.lua", "tracked.lua"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

// Padding constants off T.SPACE's scale.
describe("code quality: spacing", () => {
  it("off-scale padding constants fail", spacingScale);
});

// Top-level locals (Lua allows 200 active in a file's main chunk) ------------------------------

const { lauxlib, to_luastring } = fengari;

// n lines `local vK = K`, or n names in one statement when `one` is true.
const locals = (n, one = false) => (one ? `local ${Array.from({ length: n }, (_, i) => `v${i}`).join(", ")}\n` : Array.from({ length: n }, (_, i) => `local v${i} = ${i}\n`).join(""));

// True when fengari (Lua's 200-local limit, like the game's) compiles the source.
const compiles = (src) => lauxlib.luaL_loadstring(lauxlib.luaL_newstate(), to_luastring(src)) === 0;

// How many locals the main chunk of src has active at its end: 200 minus the most `local` lines that still compile.
function probedLocals(src) {
  let extra = 0;
  while (compiles(src + locals(extra + 1).replace(/v/g, "probe"))) extra++;
  return 200 - extra;
}

// Counts names in every form of local statement, and skips functions, do blocks and loops.
function topLocalsCounted() {
  const src = [
    "local a, b = 1, 2", "local function f() local inner = 1 end", "local c = function() local x end",
    "do local hidden = 1 end", "if a then local x end", "for i = 1, 2 do local y end",
    "while false do local z end", "repeat local w until true", "local d -- local ghost", 'local e = "local no"',
  ].join("\n");
  expect(topLevelLocals(src).map((l) => l.name)).toEqual(["a", "b", "f", "c", "d", "e"]);
  expect(probedLocals(src)).toBe(6);
}

// The scan fails a file one local above the limit and passes one at the limit.
function topLocalsRule() {
  expect(problems("Core/T.lua", locals(MAX_TOP_LOCALS))).toBe("");
  expect(problems("Core/T.lua", locals(MAX_TOP_LOCALS - 1) + "local a, b\n")).toMatch(/186 top-level locals/);
  expect(checkSource("Core/T.lua", locals(MAX_TOP_LOCALS + 1))[0].line).toBe(MAX_TOP_LOCALS + 1);
  expect(problems("scripts/lib/x.lua", locals(MAX_TOP_LOCALS + 5))).toBe("");
}

// A do ... end block frees its locals, so grouping them there brings a file back under the limit.
function topLocalsBlock() {
  expect(problems("Modules/M.lua", `do\n${locals(MAX_TOP_LOCALS + 20)}end\n${locals(MAX_TOP_LOCALS)}`)).toBe("");
}

// The counter agrees with the compiler on the real Core/Theme.lua, which keeps clear of the limit.
function topLocalsTheme() {
  const src = fs.readFileSync(path.join(root, "Core/Theme.lua"), "utf8");
  const counted = topLevelLocals(src).length;
  expect(probedLocals(src)).toBe(counted);
  expect(counted).toBeLessThanOrEqual(170);
}

describe("code quality: top-level locals", () => {
  it("counts every local form and skips nested scopes, as the compiler does", topLocalsCounted);
  it("fails an addon file above the limit and passes one at it", topLocalsRule);
  it("a do block frees its locals", topLocalsBlock);
  it("agrees with the compiler on Core/Theme.lua, which stays at or below 170", topLocalsTheme);
});
