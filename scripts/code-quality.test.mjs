// Self-test for the code-quality checker (scripts/lib/code-quality.mjs).
// TEST-ONLY sources below are never loaded. The repo-wide scan stays in
// scripts/check-code-quality.mjs (npm run quality, part of npm run verify).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { checkSource, sourceFiles } from "./lib/code-quality.mjs";

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
