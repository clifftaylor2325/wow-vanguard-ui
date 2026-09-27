// Line coverage for the addon's own Lua, measured inside the fengari harness.
//
// Executable lines come from the compiled functions themselves: every line
// that holds an instruction, except two the compiler adds that can never
// run: each function's implicit final `return` (the `end` line) when it
// always returns early, and the `return` after a tail call. Executed lines
// come from a line hook on every Lua state the harness creates. Only chunks named "@<file>" for files in `files` count,
// so the WoW stub, test code and SavedVariables never do.

import fs from "node:fs";
import path from "node:path";
import fengari from "fengari";

const { lua, lauxlib, to_luastring, to_jsstring } = fengari;

const executed = new Map();

const OP_TAILCALL = 37;
const OP_RETURN = 38;

// Longest TOC path is Modules/ClickCastOptions.lua (28).
const NAME_WIDTH = 28;

// Whether instruction pc can run: not the RETURN the compiler adds after a
// tail call (`return f(...)` never comes back to it).
function reachable(p, pc) {
  return !(p.code[pc].opcode === OP_RETURN && pc > 0 && p.code[pc - 1].opcode === OP_TAILCALL);
}

// Lines with instructions in a compiled function and every function inside it.
function protoLines(p, out) {
  for (let pc = 0; pc < p.code.length - 1; pc++) if (reachable(p, pc)) out.add(p.lineinfo[pc]);
  for (const child of p.p) protoLines(child, out);
  return out;
}

// The executable lines of a Lua source, compiled the same way the harness loads it.
export function executableLines(source, chunkName) {
  const L = lauxlib.luaL_newstate();
  if (lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring(chunkName)) !== lua.LUA_OK) {
    throw new Error(`${chunkName}: ${lua.lua_tojsstring(L, -1)}`);
  }
  return protoLines(L.stack[L.top - 1].value.p, new Set());
}

// Records the line just reached, for addon chunks only.
function onLine(L, ar) {
  lua.lua_getinfo(L, to_luastring("S"), ar);
  const source = to_jsstring(ar.source);
  if (!source.startsWith("@")) return;
  if (!executed.has(source)) executed.set(source, new Set());
  executed.get(source).add(ar.currentline);
}

// The lines recorded so far for a chunk ("@<file>").
export function hitLines(chunkName) {
  return executed.get(chunkName) ?? new Set();
}

// Starts recording executed lines in a Lua state.
export function attachCoverage(L) {
  lua.lua_sethook(L, onLine, lua.LUA_MASKLINE, 0);
}

// Coverage of one file: { file, total, covered, missing[] }.
function fileCoverage(root, file) {
  const lines = executableLines(fs.readFileSync(path.join(root, file), "utf8"), `@${file}`);
  const hit = executed.get(`@${file}`) ?? new Set();
  const missing = [...lines].filter((line) => !hit.has(line)).sort((a, b) => a - b);
  return { file, total: lines.size, covered: lines.size - missing.length, missing };
}

// Coverage of every file, plus the totals.
export function coverageReport(root, files) {
  const perFile = files.map((file) => fileCoverage(root, file));
  const total = perFile.reduce((n, f) => n + f.total, 0);
  const covered = perFile.reduce((n, f) => n + f.covered, 0);
  return { files: perFile, total, covered, pct: total ? (covered / total) * 100 : 100 };
}

// Runs of consecutive numbers as "a-b" ranges, for the missing-lines column.
export function lineRanges(lines) {
  const out = [];
  for (const line of lines) {
    const last = out[out.length - 1];
    if (last && last[1] === line - 1) last[1] = line;
    else out.push([line, line]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(",");
}

// A text table: one row per file below 100%, then the total.
export function formatReport(report) {
  const rows = report.files
    .filter((f) => f.covered < f.total)
    .map((f) => `  ${f.file.padEnd(NAME_WIDTH)} ${String(f.covered).padStart(5)}/${String(f.total).padEnd(5)} missing ${lineRanges(f.missing)}`);
  const total = `  ${"total".padEnd(NAME_WIDTH)} ${String(report.covered).padStart(5)}/${String(report.total).padEnd(5)} ${report.pct.toFixed(2)}%`;
  return [...rows, total].join("\n");
}
