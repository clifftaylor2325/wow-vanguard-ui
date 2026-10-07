// Line coverage for the addon's own Lua, measured inside the fengari harness.
//
// Executable lines come from the compiled functions themselves: every line
// that holds an instruction, except two the compiler adds that can never
// run: each function's implicit final `return` (the `end` line) when it
// always returns early, and the `return` after a tail call. Executed lines
// come from a line hook on every Lua state the harness creates. The hook
// runs on every line reached, so it does the least it can: it notes the line
// on the running function's compiled prototype and returns. The prototypes
// are folded into per-chunk sets when the hits are read. Only chunks named
// "@<file>" for files in `files` count, so the WoW stub, test code and
// SavedVariables never do.

import fs from "node:fs";
import path from "node:path";
import fengari from "fengari";

const { lua, lauxlib, to_luastring, to_jsstring } = fengari;

// Chunk name ("@<file>") -> the lines executed in it.
const executed = new Map();
// The compiled prototypes that have hits not yet folded into `executed`.
// A prototype keeps its last closure, and through it the Lua state, alive,
// so they are folded (and let go) early: on every new state, and past this many.
const protos = [];
const FOLD_AT = 20000;

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

// Records the line just reached on the running function's prototype. The
// line hook only fires inside Lua functions, so the prototype is always there.
function onLine(L, ar) {
  const p = ar.i_ci.func.value.p;
  let hits = p.__wfgHits;
  if (!hits) {
    if (protos.length >= FOLD_AT) fold();
    hits = p.__wfgHits = new Set();
    protos.push(p);
  }
  hits.add(ar.currentline);
}

// The chunk name a prototype was compiled from, or null when stripped.
function sourceOf(p) {
  return p.source ? to_jsstring(p.source.getstr()) : null;
}

// Moves the prototypes' hits into `executed`, keeping only addon-style chunk names.
function fold() {
  for (const p of protos) {
    const source = sourceOf(p);
    if (source && source.startsWith("@")) {
      if (!executed.has(source)) executed.set(source, new Set());
      const lines = executed.get(source);
      for (const line of p.__wfgHits) lines.add(line);
    }
    p.__wfgHits = undefined;
  }
  protos.length = 0;
}

// The lines recorded so far for a chunk ("@<file>").
export function hitLines(chunkName) {
  fold();
  return executed.get(chunkName) ?? new Set();
}

// Writes recorded hits so a parent process can apply the coverage floor.
export function dumpHits(file) {
  fold();
  const out = {};
  for (const [name, lines] of executed) out[name] = [...lines];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(out)}\n`);
}

// Adds one dumped hits file to the record.
function mergeHits(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [name, lines] of Object.entries(data)) {
    if (!executed.has(name)) executed.set(name, new Set());
    for (const line of lines) executed.get(name).add(line);
  }
}

// Loads the hits workers dumped: one file, or every .json in a directory.
// A missing file or an empty directory is a failure, not a pass.
export function loadHits(target) {
  fold();
  executed.clear();
  const isDir = fs.existsSync(target) && fs.statSync(target).isDirectory();
  const files = isDir ? fs.readdirSync(target).filter((f) => f.endsWith(".json")).map((f) => path.join(target, f)) : [target];
  if (files.length === 0 || !fs.existsSync(files[0])) throw new Error(`Lua coverage hits file is missing: ${target}`);
  for (const file of files) mergeHits(file);
}

// The line hook, for a state whose debug hook the harness sets (it lets go of the last state's prototypes first).
export function lineHook() {
  fold();
  return onLine;
}

// Starts recording executed lines in a Lua state (and lets go of the last one's prototypes).
export function attachCoverage(L) {
  lua.lua_sethook(L, lineHook(), lua.LUA_MASKLINE, 0);
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
  fold();
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
