// A sampling profiler for the addon's Lua, run inside the fengari harness.
//
// The harness's one debug hook already fires every COUNT_EVERY (1000) Lua VM
// instructions to check the budget. When LUA_PROFILE is set it also calls the
// sampler here, which walks the Lua stack and records where those 1000
// instructions were spent: the file and line of the running function (self),
// and every file and function on the stack (inclusive). One sample is 1000
// instructions, so the counts are a share of instruction work. Time inside
// JS-implemented functions (the stub's host functions) is not counted.
//
// The accumulator lives on globalThis because Vitest evaluates this module once
// per test file while the worker (and the hook) is shared.

import fs from "node:fs";
import path from "node:path";
import fengari from "fengari";

const { lua, to_luastring, to_jsstring } = fengari;

// Instructions per sample: the harness's COUNT_EVERY.
export const PER_SAMPLE = 1000;
// Stack levels walked per sample.
const DEPTH = 40;
// What lua_getinfo reads: source, current line and name.
const SLN = to_luastring("Sln");
// lua_getinfo `what` for a Lua function (a JS-implemented one is "J", a C one "C").
const LUA_KINDS = new Set(["Lua", "main"]);
const KEY = Symbol.for("vanguard.profile");

// An empty accumulator.
function fresh() {
  return { samples: 0, files: {}, functions: {}, lines: {} };
}

// The accumulator for this process.
export function profileData() {
  return (globalThis[KEY] ??= fresh());
}

// Forgets every sample (after a warm-up, say).
export function resetProfile() {
  globalThis[KEY] = fresh();
}

// The Lua frame at a stack level as { file, line, defined, name }; null for a
// JS- or C-implemented function, undefined once past the bottom of the stack.
function frameAt(L, ar, level) {
  if (!lua.lua_getstack(L, level, ar)) return undefined;
  lua.lua_getinfo(L, SLN, ar);
  if (!LUA_KINDS.has(to_jsstring(ar.what))) return null;
  return { file: to_jsstring(ar.short_src), line: ar.currentline, defined: ar.linedefined, name: ar.name ? to_jsstring(ar.name) : "?" };
}

// The Lua frames on the stack, innermost first, up to DEPTH levels.
function luaFrames(L, ar) {
  const frames = [];
  for (let level = 0; level < DEPTH; level++) {
    const frame = frameAt(L, ar, level);
    if (frame === undefined) break;
    if (frame) frames.push(frame);
  }
  return frames;
}

// Adds one to a counter object's key.
function bump(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

// Adds one to a file's self or inclusive count.
function bumpFile(data, file, field) {
  (data.files[file] ??= { self: 0, incl: 0 })[field]++;
}

// The name a function is counted under: file, line defined and name.
function functionKey(frame) {
  return `${frame.file}:${frame.defined} ${frame.name}`;
}

// Records one sample: self on the innermost frame, inclusive once per distinct file and function.
function record(data, frames) {
  const top = frames[0];
  data.samples++;
  bumpFile(data, top.file, "self");
  bump(data.lines, `${top.file}:${top.line}`);
  for (const file of new Set(frames.map((f) => f.file))) bumpFile(data, file, "incl");
  for (const key of new Set(frames.map(functionKey))) bump(data.functions, key);
}

// A sampler for the count hook of one Lua state: (L) => void.
export function profileSampler() {
  const ar = new lua.lua_Debug();
  return (L) => {
    const frames = luaFrames(L, ar);
    if (frames.length) record(profileData(), frames);
  };
}

// The top n rows of a count map as [key, count], largest first. `field` picks
// the number out of an object value (the files map); without it the value is the count.
export function topRows(map, field, n) {
  return Object.entries(map)
    .map(([key, value]) => [key, field ? value[field] : value])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, n);
}

// The tables of the report: title, which map, which field, how many rows.
const SECTIONS = [
  { title: "self by file", map: "files", field: "self", n: 12 },
  { title: "inclusive by file", map: "files", field: "incl", n: 25 },
  { title: "inclusive by function", map: "functions", field: null, n: 20 },
  { title: "self by line", map: "lines", field: null, n: 10 },
];

// One row: samples, percent of all samples to one decimal, and the key.
function row([key, count], samples) {
  const pct = samples ? ((count / samples) * 100).toFixed(1) : "0.0";
  return `${String(count).padStart(8)}  ${pct.padStart(5)}%  ${key}`;
}

// One titled table of the report.
function section(data, spec) {
  const rows = topRows(data[spec.map], spec.field, spec.n).map((r) => row(r, data.samples));
  return [spec.title, "  samples    pct  key", ...rows, ""].join("\n");
}

// The report header: area, samples, wall time and what a sample means.
function header(data, { area, wallMs }) {
  return [
    `Lua profile: ${area}`,
    `samples ${data.samples}`,
    `instructions per sample ${PER_SAMPLE}`,
    `wall ms ${Math.round(wallMs)}`,
    `one sample = ${PER_SAMPLE} Lua VM instructions; time inside JS-implemented functions is not counted`,
    "",
  ].join("\n");
}

// The printed report: the header, then the four tables.
export function formatProfile(data, info) {
  return [header(data, info), ...SECTIONS.map((spec) => section(data, spec))].join("\n");
}

// The JSON written beside the report: every row, as arrays sorted by count.
export function profileJson(data, { area, wallMs }) {
  const all = Number.MAX_SAFE_INTEGER;
  const files = topRows(data.files, "incl", all).map(([key]) => [key, data.files[key].self, data.files[key].incl]);
  const functions = topRows(data.functions, null, all);
  const lines = topRows(data.lines, null, all);
  return { area, samples: data.samples, perSample: PER_SAMPLE, wallMs: Math.round(wallMs), files, functions, lines };
}

// Writes the JSON for a profile to a file, creating its folder.
export function writeProfileJson(file, data, info) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(profileJson(data, info))}\n`);
}
