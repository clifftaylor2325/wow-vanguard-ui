// Self-test for the code-quality checker (scripts/lib/code-quality.mjs), then
// the check itself over the repo. TEST-ONLY sources below are never loaded.

import { execFileSync } from "node:child_process";
import { checkSource } from "./lib/code-quality.mjs";

const failures = [];

// Records msg as a failure unless cond holds.
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

// n body lines of Lua (or JS with js = true).
const body = (n, js = false) => Array.from({ length: n }, (_, i) => `  ${js ? "let" : "local"} v${i} = ${i}${js ? ";" : ""}`).join("\n");

// The problems the checker reports for one TEST-ONLY source.
const problems = (file, src) => checkSource(file, src).map((p) => p.message).join("\n");

assert(problems("t.lua", `-- doc\nlocal function f()\n${body(10)}\nend\n`) === "", "Lua: 10 documented lines pass");
assert(/is 11 lines/.test(problems("t.lua", `-- doc\nlocal function f()\n${body(11)}\nend\n`)), "Lua: 11 lines fail");
assert(/no comment above/.test(problems("t.lua", "local function f()\nend\n")), "Lua: undocumented function fails");
assert(/no comment above/.test(problems("t.lua", "-- doc\n\nlocal function f()\nend\n")), "Lua: a blank line breaks the doc");
assert(problems("t.lua", `-- doc\nlocal function f()\n\n  -- note\n${body(10)}\n\nend\n`) === "", "Lua: blank and comment lines don't count");
assert(
  /is 11 lines/.test(problems("t.lua", `-- doc\nlocal function f()\n  local g = function()\n${body(9)}\n  end\nend\n`)),
  "Lua: nested functions count toward the parent",
);
assert(
  problems("t.lua", `-- doc\nlocal function f()\n  local s = [[\nfunction x() end\nif y then\n]]\n  return s\nend\n`) === "",
  "Lua: long strings are not code",
);
assert(problems("t.lua", "-- docs\nfunction a() end\nfunction b() end\n") === "", "Lua: one comment covers a run of one-liners");
assert(problems("t.mjs", `// doc\nfunction f() {\n${body(10, true)}\n}\n`) === "", "JS: 10 documented lines pass");
assert(/is 11 lines/.test(problems("t.mjs", `// doc\nfunction f() {\n${body(11, true)}\n}\n`)), "JS: 11 lines fail");
assert(/no comment above/.test(problems("t.mjs", "const f = () => {\n  return 1;\n};\n")), "JS: undocumented arrow fails");
assert(problems("t.mjs", `attempt("case", () => {\n${body(20, true)}\n});\n`) === "", "JS: attempt() test cases are exempt");
assert(/color numbers/.test(problems("Modules/t.lua", "-- doc\nlocal function f(fs)\n  fs:SetTextColor(1, 1, 1)\nend\n")), "colors: a setter with numbers fails");
assert(/color numbers/.test(problems("Core/t.lua", "local C = { 0.2, 0.6, 1 }\n")), "colors: a 0-1 number table fails");
assert(problems("Modules/t.lua", "-- doc\nlocal function f(fs)\n  T.Color(fs, \"text\")\nend\n") === "", "colors: theme tokens pass");
assert(problems("Modules/t.lua", "local P = { 20, 40, 60 }\n-- { 1, 1, 1 } in a comment\nlocal s = \"{ 0, 0, 1 }\"\n") === "", "colors: big numbers, comments and strings pass");
assert(/color numbers/.test(problems("Core/t.lua", 'local P = "|cff3d9effHi|r"\n')), "colors: a |c escape with a written color fails");
assert(problems("Core/Theme.lua", "local C = { 0.2, 0.6, 1 }\n") === "", "colors: the theme itself may write them");
assert(/font size/.test(problems("Modules/t.lua", "-- doc\nlocal function f(fs)\n  T.SetFont(fs, 12)\nend\n")), "fonts: T.SetFont with a size fails");
assert(/font size/.test(problems("Modules/t.lua", "-- doc\nlocal function f(fs, p)\n  fs:SetFont(p, 12, \"\")\nend\n")), "fonts: SetFont with a written size fails");
assert(problems("Modules/t.lua", "-- doc\nlocal function f(fs, p)\n  fs:SetFont(p, size(fs), \"\")\n  T.Text(fs, \"label\")\nend\n") === "", "fonts: roles and computed sizes pass");
assert(problems("scripts/lib/t.lua", "local C = { 0.2, 0.6, 1 }\n") === "", "colors: only addon Lua is checked");

console.log("ForeverUI — code quality");
if (failures.length) {
  console.error(`FAILED (${failures.length})`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("OK  checker self-test: length, nesting, docs, long strings, test cases, color numbers, font sizes");
execFileSync(process.execPath, ["scripts/check-code-quality.mjs"], { stdio: "inherit" });
