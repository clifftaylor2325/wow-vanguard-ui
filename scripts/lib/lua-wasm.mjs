// The harness's second Lua engine: PUC-Rio Lua 5.1.5, the game's Lua, compiled to WebAssembly
// (tools/lua51: the sources, the C shim and the build). VG_LUA_ENGINE=wasm picks it (lua-harness.mjs);
// fengari (Lua 5.3 in JS) stays the default.
//
// Each Lua state gets its own WebAssembly instance (one compiled module per worker), so a client's
// memory is its own and goes when the client does. A call is one crossing into the instance: the
// chunk goes in through the shim's scratch buffer, and its first result comes back as JSON written by
// the shim with toJs's rules (lua-harness.mjs). The instruction budget, the coverage line hook and the
// secret checks run in C (tools/lua51/shim.c, vg_hooks.h).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WASM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tools/lua51/vg-lua51.wasm");

// The compiled module and the compiled chunks, once per worker (Vitest evaluates this module once per test file).
const shared = (globalThis[Symbol.for("vanguard.lua51")] ??= { module: null, chunks: new Map() });

// WASI error numbers the shim's libc may see.
const ERRNO = { SUCCESS: 0, BADF: 8, NOSYS: 52 };

// The text a byte range of the instance's memory holds (UTF-8, as fengari reads Lua strings).
const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

// The compiled module, made on first use.
function wasmModule() {
  shared.module ??= new WebAssembly.Module(fs.readFileSync(WASM));
  return shared.module;
}

// The bytes of the iovecs at iovs (count of them) in the instance's memory.
function ioBuffers(memory, iovs, count) {
  const view = new DataView(memory.buffer);
  return Array.from({ length: count }, (_, i) => Buffer.from(memory.buffer, view.getUint32(iovs + i * 8, true), view.getUint32(iovs + i * 8 + 4, true)));
}

// fd_write for stdout and stderr (Lua's print and io.write).
function fdWrite(box) {
  // Writes each buffer to the process's own stream and stores the byte count.
  return (fd, iovs, count, written) => {
    const buffers = ioBuffers(box.memory, iovs, count);
    for (const b of buffers) (fd === 2 ? process.stderr : process.stdout).write(b);
    new DataView(box.memory.buffer).setUint32(written, buffers.reduce((n, b) => n + b.length, 0), true);
    return ERRNO.SUCCESS;
  };
}

// clock_time_get: wall time for os.time, the process's CPU time for os.clock, in nanoseconds.
function clockTimeGet(box) {
  // Stores the clock's reading as a 64-bit count of nanoseconds.
  return (id, _precision, out) => {
    const ns = id === 0 ? BigInt(Date.now()) * 1000000n : process.hrtime.bigint();
    new DataView(box.memory.buffer).setBigUint64(out, ns, true);
    return ERRNO.SUCCESS;
  };
}

// The WASI functions the shim's libc imports: output, clocks and an empty environment; files are absent.
function wasiImports(box) {
  // Stores two zero counts (no environment variables).
  const zeroPair = (a, b) => { const v = new DataView(box.memory.buffer); v.setUint32(a, 0, true); v.setUint32(b, 0, true); return ERRNO.SUCCESS; };
  // No preopened folders.
  const noFolder = () => ERRNO.BADF;
  // os.exit: refused, as a JS error.
  const exit = (code) => { throw new Error(`Lua 5.1 engine: exit ${code}`); };
  const known = { fd_write: fdWrite(box), clock_time_get: clockTimeGet(box), environ_sizes_get: zeroPair, environ_get: zeroPair, fd_prestat_get: noFolder, proc_exit: exit };
  // Anything else: not supported.
  return new Proxy(known, { get: (t, name) => t[name] ?? (() => ERRNO.NOSYS) });
}

// A fresh instance of the engine, its exports and memory.
function instantiate() {
  const box = {};
  const instance = new WebAssembly.Instance(wasmModule(), { wasi_snapshot_preview1: wasiImports(box) });
  box.memory = instance.exports.memory;
  instance.exports._initialize();
  return { exports: instance.exports, memory: box.memory };
}

// Writes a chunk name and chunk (a string or bytes) into the shim's scratch buffer; returns their byte lengths.
function writeChunk(vm, chunkName, chunk) {
  const name = encoder.encode(chunkName);
  const body = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
  const at = vm.exports.vg_scratch(name.length + 1 + body.length);
  const mem = new Uint8Array(vm.memory.buffer);
  mem.set(name, at);
  mem[at + name.length] = 0;
  mem.set(body, at + name.length + 1);
  return [name.length, body.length];
}

// The shim's output buffer as bytes (a view: copy it before the next call).
function outBytes(vm) {
  return new Uint8Array(vm.memory.buffer, vm.exports.vg_out_ptr(), vm.exports.vg_out_len());
}

// A NaN or infinity the shim wrote as a marked string, back as the number.
function revive(_key, value) {
  if (typeof value !== "string" || value[0] !== "\u0001") return value;
  return Number(value.slice(1));
}

// The first result of the last call, from the shim's JSON.
function outValue(vm) {
  const text = decoder.decode(outBytes(vm));
  return vm.exports.vg_out_special() ? JSON.parse(text, revive) : JSON.parse(text);
}

// Harness files' frames, which a failure's traceback leaves out (as lua-harness.mjs's traceback does).
const HARNESS_FRAME = /\[C\]: in \?$|wow-stub\.lua|wow-world\.lua|wow-keybinds\.lua|wow-layout\.lua|wow-taint\.lua|wow-aspects\.lua|wow-inspect\.lua|wow-retail-[\w-]+\.lua/;

// The error of the last call, labeled with the chunk name; a run error's traceback without the harness's frames.
function outError(vm, chunkName, status) {
  const text = decoder.decode(outBytes(vm));
  if (status === 1) return new Error(`${chunkName}: ${text}`);
  const [first, ...rest] = text.split("\n");
  return new Error(`${chunkName}: ${[first, ...rest.filter((l) => !HARNESS_FRAME.test(l))].join("\n")}`);
}

// Runs a chunk (source or bytecode) on a state; returns its first result as JS when `want` is set, or puts it in
// the global `into`. Errors throw.
function call(vm, chunk, chunkName, withAddonArgs, want, into) {
  const [nameLen, len] = writeChunk(vm, chunkName, chunk);
  const intoPtr = into ? keptString(vm, into) : 0;
  const status = vm.exports.vg_run(nameLen, len, withAddonArgs ? vm.addonName : 0, want ? 1 : 0, intoPtr);
  if (status !== 0) throw outError(vm, chunkName, status);
  return want ? outValue(vm) : undefined;
}

// A file's cache stamp: its modification time and size, so an edit recompiles it.
function stampOf(file) {
  const stat = fs.statSync(file);
  return `${stat.mtimeMs}:${stat.size}`;
}

// A Lua file's bytecode (line info kept), compiled on this state the first time and cached for the worker.
function fileChunk(vm, file, chunkName) {
  const stamp = stampOf(file);
  const cached = shared.chunks.get(file);
  if (cached && cached.stamp === stamp && cached.name === chunkName) return cached.bytes;
  const [nameLen, len] = writeChunk(vm, chunkName, fs.readFileSync(file));
  if (vm.exports.vg_compile(nameLen, len) !== 0) throw outError(vm, chunkName, 1);
  const bytes = outBytes(vm).slice();
  shared.chunks.set(file, { stamp, name: chunkName, bytes });
  return bytes;
}

// A NUL-terminated string kept in the instance's memory for good (the addon's name, a global's name), made once.
function keptString(vm, text) {
  if (vm.kept.has(text)) return vm.kept.get(text);
  const bytes = encoder.encode(`${text}\0`);
  const ptr = vm.exports.vg_alloc(bytes.length);
  new Uint8Array(vm.memory.buffer).set(bytes, ptr);
  vm.kept.set(text, ptr);
  return ptr;
}

// A new Lua 5.1 state: { run, value, runFile, memory } over its own instance. budget: the most instructions one call
// may run (Infinity for none); coverage: the line hook on; addonName: the `ADDON` the addon's files get.
export function newWasmState({ budget, coverage = false, addonName, secretChecks = true }) {
  const vm = instantiate();
  vm.exports.vg_open(coverage ? 1 : 0);
  vm.exports.vg_set_budget(Number.isFinite(budget) ? budget : -1);
  vm.exports.vg_secret_checks(secretChecks ? 1 : 0);
  vm.kept = new Map();
  vm.addonName = keptString(vm, addonName);
  vm.exports.vg_scratch(1 << 16);
  return stateApi(vm);
}

// The calls a harness state answers (see newWasmState).
function stateApi(vm) {
  return {
    // A chunk, for its effects.
    run: (source, chunkName, withAddonArgs = false) => call(vm, source, chunkName, withAddonArgs, false),
    // A chunk's first result as JS.
    value: (source, chunkName, withAddonArgs = false) => call(vm, source, chunkName, withAddonArgs, true),
    // A file through the worker's bytecode cache, its first result put in the global `into` when named.
    runFile: (file, chunkName, withAddonArgs = false, into = null) => call(vm, fileChunk(vm, file, chunkName), chunkName, withAddonArgs, false, into),
    // The instance's linear memory and Lua's own count, in bytes.
    memory: () => ({ linear: vm.memory.buffer.byteLength, lua: vm.exports.vg_memory() }),
    // The lines run since the last take (the shim's text form; lua-coverage.mjs reads it).
    takeHits: () => { vm.exports.vg_take_hits(); return decoder.decode(outBytes(vm)); },
  };
}
