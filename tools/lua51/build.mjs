// Builds tools/lua51/vg-lua51.wasm: PUC-Rio Lua 5.1.5 with the harness's C shim (shim.c), for the
// test harness's Lua 5.1 engine (scripts/lib/lua-wasm.mjs). TEST-ONLY tooling: never shipped
// (.pkgmeta leaves tools/ out). Usage: node tools/lua51/build.mjs [--check]
//
// Source: lua-5.1.5.tar.gz, SHA-256 2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333,
// as lua.org/ftp publishes it (2012-02-13, 221213 bytes); fetched as Ubuntu's lua5.1_5.1.5.orig.tar.gz
// (archive.ubuntu.com), which has the same SHA-256. Its COPYRIGHT and src/ are in lua-5.1.5/ unchanged;
// lua-5.1.5.sha256 lists each file's SHA-256 from that tarball and this script refuses to build when one
// differs. The only changes to Lua are made here, on a copy: the secret checks in lvm.c (PATCHES below) and no
// tail calls in the addon's chunks in lparser.c (PARSER_PATCHES).
//
// Compiler: zig cc 0.17.1 (pip install ziglang==0.17.1), whose wasm32-wasi target bundles a libc; setjmp/longjmp,
// which Lua's errors use, compile to WebAssembly exception handling (Node 22 runs it). Another zig version is
// refused: the same sources and version give the same bytes, which is what makes the binary checkable.
// A build writes vg-lua51.wasm.sha256 beside the binary (scripts/lua51-wasm.test.mjs holds the committed binary to
// it). --check rebuilds into a temporary file and fails unless it matches the committed .wasm byte for byte.

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const LUA = path.join(here, "lua-5.1.5");
export const WASM = path.join(here, "vg-lua51.wasm");
// The binary's SHA-256 as its last build wrote it.
export const RECORDED = path.join(here, "vg-lua51.wasm.sha256");
// The zig release the committed binary was built with.
const ZIG_VERSION = "0.17.1";

// Lua's library and VM sources (the stand-alone interpreter and compiler left out).
const SKIP = new Set(["lua.c", "luac.c", "print.c"]);

// The checks put in front of lvm.c's opcodes and comparisons (tools/lua51/vg_hooks.h says why).
const PATCHES = [
  ['#include "lvm.h"\n', '#include "lvm.h"\n#include "vg_hooks.h"\n'],
  ["int luaV_lessthan (lua_State *L, const TValue *l, const TValue *r) {\n", "int luaV_lessthan (lua_State *L, const TValue *l, const TValue *r) {\n  VG_ORDER(L, l, r);\n"],
  ["static int lessequal (lua_State *L, const TValue *l, const TValue *r) {\n", "static int lessequal (lua_State *L, const TValue *l, const TValue *r) {\n  VG_ORDER(L, l, r);\n"],
  ["        int res = l_isfalse(RB(i));", "        VG_TRUTH(L, RB(i), pc, 1);\n        int res = l_isfalse(RB(i));"],
  ["          case LUA_TTABLE: {\n            setnvalue(ra, cast_num(luaH_getn(hvalue(rb))));", "          case LUA_TTABLE: {\n            VG_USE(L, rb, pc);\n            setnvalue(ra, cast_num(luaH_getn(hvalue(rb))));"],
  ["        TValue *rc = RKC(i);\n        Protect(\n          if (equalobj(L, rb, rc)", "        TValue *rc = RKC(i);\n        VG_COMPARE(L, rb, rc, pc);\n        Protect(\n          if (equalobj(L, rb, rc)"],
  ["      case OP_TEST: {\n", "      case OP_TEST: {\n        VG_TRUTH(L, ra, pc, 0);\n"],
  ["        TValue *rb = RB(i);\n        if (l_isfalse(rb) != GETARG_C(i)) {", "        TValue *rb = RB(i);\n        VG_TRUTH(L, rb, pc, 0);\n        if (l_isfalse(rb) != GETARG_C(i)) {"],
];

// The addon's chunks compile without tail calls, so each addon function keeps its stack entry for the guards
// (scripts/lib/lua-keep-frames.mjs makes the same change to fengari and says why).
const PARSER_PATCHES = [
  ['#include "lparser.h"\n', '#include "lparser.h"\n#include "vg_hooks.h"\n'],
  ["      if (e.k == VCALL && nret == 1) {  /* tail call? */", "      if (e.k == VCALL && nret == 1 && !vg_keep_frames(ls->source)) {  /* tail call? */"],
];

// Compiler flags: wasm32-wasi as a library (no main), setjmp through exception handling, Lua's %d as long long,
// and what WASI lacks for os.tmpname and os.clock (the harness uses neither; they must only compile).
const FLAGS = ["-target", "wasm32-wasi", "-O2", "-mexec-model=reactor", "-mexception-handling", "-mllvm", "-wasm-enable-sjlj",
  "-DLUA_USELONGLONG", "-DL_tmpnam=32", "-D_WASI_EMULATED_PROCESS_CLOCKS", "-lwasi-emulated-process-clocks", "-Wno-deprecated-declarations",
  "-Wl,-z,stack-size=1048576", "-Wl,--strip-debug"];

// The SHA-256 of a file, hex.
export function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// Throws unless every vendored file matches the tarball's (lua-5.1.5.sha256); returns how many there are.
export function verifySources() {
  const lines = fs.readFileSync(path.join(here, "lua-5.1.5.sha256"), "utf8").trim().split("\n");
  for (const line of lines) {
    const [want, file] = line.split(/\s+/);
    if (sha256(path.join(LUA, file)) !== want) throw new Error(`tools/lua51/lua-5.1.5/${file} differs from the Lua 5.1.5 tarball`);
  }
  return lines.length;
}

// A Lua source file with its patches in; throws naming a patch that no longer matches.
function patched(file, patches) {
  let src = fs.readFileSync(path.join(LUA, "src", file), "utf8");
  for (const [from, to] of patches) {
    if (src.split(from).length !== 2) throw new Error(`${file}: no single match for ${JSON.stringify(from.slice(0, 50))}`);
    src = src.replace(from, to);
  }
  return src;
}

// A build folder: Lua's sources with the patched lvm.c and lparser.c, and the shim.
function stage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vg-lua51-"));
  for (const f of fs.readdirSync(path.join(LUA, "src"))) fs.copyFileSync(path.join(LUA, "src", f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, "lvm.c"), patched("lvm.c", PATCHES));
  fs.writeFileSync(path.join(dir, "lparser.c"), patched("lparser.c", PARSER_PATCHES));
  for (const f of ["shim.c", "vg_hooks.h", "tag.s"]) fs.copyFileSync(path.join(here, f), path.join(dir, f));
  return dir;
}

// The zig command: $ZIG, else zig from pip's ziglang package.
function zig() {
  return process.env.ZIG ? [process.env.ZIG] : ["python3", "-m", "ziglang"];
}

// Compiles the staged folder into `target`, with the pinned zig only.
function compile(dir, target) {
  const [cmd, ...pre] = zig();
  const version = execFileSync(cmd, [...pre, "version"], { encoding: "utf8" }).trim();
  if (version !== ZIG_VERSION) throw new Error(`zig ${version}: the binary is built with zig ${ZIG_VERSION} (pip install ziglang==${ZIG_VERSION}, or ZIG=<path>)`);
  const sources = fs.readdirSync(dir).filter((f) => (f.endsWith(".c") && !SKIP.has(f)) || f === "tag.s").sort();
  execFileSync(cmd, [...pre, "cc", ...FLAGS, "-I", dir, "-o", target, ...sources.map((f) => path.join(dir, f))], { cwd: dir, stdio: "inherit" });
}

// Builds and records the binary's SHA-256 (or, with --check, rebuilds and compares); prints the SHA-256.
function main(argv) {
  const files = verifySources();
  const dir = stage();
  const check = argv.includes("--check");
  compile(dir, check ? path.join(dir, "check.wasm") : WASM);
  if (check && sha256(path.join(dir, "check.wasm")) !== sha256(WASM)) throw new Error("tools/lua51/vg-lua51.wasm is not what its sources build: run node tools/lua51/build.mjs");
  if (!check) fs.writeFileSync(RECORDED, `${sha256(WASM)}  vg-lua51.wasm\n`);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${files} source files verified; ${path.relative(process.cwd(), WASM)} sha256 ${sha256(WASM)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
