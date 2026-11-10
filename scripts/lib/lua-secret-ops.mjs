// The client's refusals on secret values that Lua 5.1 has no metamethod for, put into the TEST-ONLY VM.
// A harness secret is a table (wow-world.lua's world.secret), so arithmetic, ordering, concatenation,
// length, calls and field reads already raise through its metatable. Three operations never reach a
// metatable: a truth test (`if v`, `v and x`, `v or x`), `not v`, and `==` / `~=` against a value of
// another type. The client refuses all three in tainted code: "attempt to perform boolean test on a
// secret value" (on a secret boolean: a secret number or string tests true, warcraft.wiki.gg Secret
// Values), "attempt to negate a secret value" and "attempt to compare a secret value".
//
// fengari's VM runs those opcodes in lvm.js's luaV_execute, which ldo.js calls through the module's
// exports. So this file compiles a copy of lvm.js with a check in front of OP_TEST, OP_TESTSET, OP_NOT
// and OP_EQ and puts the copy's functions on the module's exports: every Lua state the harness makes
// runs them. A check costs a type test when the operand is not a table, and nothing in Lua
// instructions, so the bench's counts do not move. Only the addon's own functions (chunks named
// @Core/, @Modules/ or @Libs/) are refused: the harness's files stand for the client's C side and the
// tests' Lua for the game's own untainted code, both of which may test and compare secrets.
// Only secrets world.secret made are checked: a test's plain { __secret = true } stand-in has no metatable.

import fs from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import ldebug from "fengari/src/ldebug.js";
import lstring from "fengari/src/lstring.js";
import ltable from "fengari/src/ltable.js";
import lvm from "fengari/src/lvm.js";
import fengari from "fengari";

const { to_luastring } = fengari;
const require = createRequire(import.meta.url);

// The checks the patched VM calls, shared by every copy (Vitest evaluates this module once per test file).
const OPS = (globalThis[Symbol.for("vanguard.secretOps")] ??= { on: false });

// The opcode cases of lvm.js the checks go in front of, as fengari 0.1.5 writes them, and what they become.
const PATCHES = [
  ["let op = L.stack[RB(L, base, i)];\n                L.stack[ra].setbvalue(op.l_isfalse());",
    "let op = L.stack[RB(L, base, i)];\n                if (secretOps.on && op.ttistable()) secretOps.negate(L, op);\n                L.stack[ra].setbvalue(op.l_isfalse());"],
  ["case OP_EQ: {\n                if (luaV_equalobj(L, RKB(L, base, k, i), RKC(L, base, k, i)) !== i.A)",
    "case OP_EQ: {\n                let eb = RKB(L, base, k, i), ec = RKC(L, base, k, i);\n                if (secretOps.on && (eb.ttistable() || ec.ttistable())) secretOps.compare(L, eb, ec);\n                if (luaV_equalobj(L, eb, ec) !== i.A)"],
  ["case OP_TEST: {\n                if (i.C ?",
    "case OP_TEST: {\n                if (secretOps.on && L.stack[ra].ttistable()) secretOps.test(L, L.stack[ra]);\n                if (i.C ?"],
  ["let rb = L.stack[rbIdx];\n                if (i.C ? rb.l_isfalse()",
    "let rb = L.stack[rbIdx];\n                if (secretOps.on && rb.ttistable()) secretOps.test(L, rb);\n                if (i.C ? rb.l_isfalse()"],
];

// lvm.js's source with the checks in, or an Error naming the case that no longer matches (a fengari upgrade).
function patchedSource(file) {
  let src = fs.readFileSync(file, "utf8");
  for (const [from, to] of PATCHES) {
    if (!src.includes(from)) throw new Error(`lua-secret-ops: fengari's lvm.js changed; no match for ${JSON.stringify(from.slice(0, 40))}`);
    src = src.replace(from, to);
  }
  return `const secretOps = globalThis[Symbol.for("vanguard.secretOps")];\n${src}`;
}

// Compiles the patched copy beside the original (its requires reach the same, already loaded fengari
// modules) and puts its functions on the original's exports, once per worker.
function installPatchedVm() {
  if (lvm.__wfgSecretOps) return;
  const file = require.resolve("fengari/src/lvm.js");
  const copy = new Module(file, null);
  copy.filename = file;
  copy.paths = Module._nodeModulePaths(path.dirname(file));
  copy._compile(patchedSource(file), file);
  Object.assign(lvm, copy.exports, { __wfgSecretOps: true });
}
installPatchedVm();

// Whether a table is a secret world.secret made (its metatable carries the mark markSecretMeta put on it).
function isSecret(tv) {
  const meta = tv.value.metatable;
  return meta !== null && meta.__wfgSecret === true;
}

// Whether a secret table hides a boolean (its raw field n).
function hidesBoolean(L, tv) {
  return ltable.luaH_getstr(tv.value, lstring.luaS_newliteral(L, "n")).ttisboolean();
}

// The addon's chunks: "@Core/", "@Modules/" and "@Libs/" as bytes.
const ADDON_PREFIXES = ["@Core/", "@Modules/", "@Libs/"].map((p) => to_luastring(p));

// Whether a chunk name (bytes) starts with one of the addon's prefixes.
function isAddonChunk(name) {
  return ADDON_PREFIXES.some((p) => p.every((b, i) => name[i] === b));
}

// Whether the Lua function running on L is the addon's (kept on its prototype after the first ask).
function addonRunning(L) {
  const proto = L.ci.func.value.p;
  if (proto.__wfgAddon === undefined) proto.__wfgAddon = proto.source ? isAddonChunk(proto.source.getstr()) : false;
  return proto.__wfgAddon;
}

// Raises the client's error at the running line, when the addon's code is the one doing it.
function refuse(L, message) {
  if (addonRunning(L)) ldebug.luaG_runerror(L, to_luastring(message));
}

// A truth test (if, while, and, or) on a secret boolean.
OPS.test = (L, tv) => {
  if (isSecret(tv) && hidesBoolean(L, tv)) refuse(L, "attempt to perform boolean test on a secret value");
};

// `not` on a secret boolean.
OPS.negate = (L, tv) => {
  if (isSecret(tv) && hidesBoolean(L, tv)) refuse(L, "attempt to negate a secret value");
};

// `==` or `~=` with a secret on either side.
OPS.compare = (L, a, b) => {
  if ((a.ttistable() && isSecret(a)) || (b.ttistable() && isSecret(b))) refuse(L, "attempt to compare a secret value");
};

// Marks the table given as the secrets' metatable: wow-world.lua calls __wfgMarkSecretMeta(SECRET) once per state.
export function markSecretMeta(L) {
  fengari.lua.lua_topointer(L, 1).__wfgSecret = true;
  return 0;
}

// Whether the value at a stack index is a secret: a table under a marked metatable, or one with a raw __secret
// field set to true (a test's plain { __secret = true } stand-in).
function secretAtIndex(L, i) {
  if (fengari.lua.lua_type(L, i) !== fengari.lua.LUA_TTABLE) return false;
  const meta = fengari.lua.lua_topointer(L, i).metatable;
  if (meta !== null && meta.__wfgSecret === true) return true;
  fengari.lua.lua_pushliteral(L, "__secret");
  const marked = fengari.lua.lua_rawget(L, i) === fengari.lua.LUA_TBOOLEAN && fengari.lua.lua_toboolean(L, -1);
  fengari.lua.lua_pop(L, 1);
  return marked;
}

// __wfgSecretAt(...): the position of the first secret argument, or nothing. wow-aspects.lua asks it on every
// widget setter call, so the scan runs here rather than as Lua instructions.
export function secretArgAt(L) {
  const n = fengari.lua.lua_gettop(L);
  for (let i = 1; i <= n; i++) {
    if (secretAtIndex(L, i)) {
      fengari.lua.lua_pushinteger(L, i);
      return 1;
    }
  }
  return 0;
}

// Turns the checks on or off for every state in this worker (on by default; the harness's own tests turn them off to compare).
export function secretOpsChecks(on) {
  OPS.on = on;
}
secretOpsChecks(process.env.VG_SECRET_OPS !== "off");
