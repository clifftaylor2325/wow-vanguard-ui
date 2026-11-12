// TEST-ONLY: the addon's own chunks compile without tail calls, so every addon function keeps its stack entry.
// The taint, combat and secret guards (scripts/lib/wow-taint.lua, wow-aspects.lua) ask debug.getinfo whose code
// made a guarded call. A call in tail position (`return frame:Hide()`) reuses the caller's stack entry (Lua 5.1
// manual 2.5.8, "Proper tail calls"), so the addon's line was gone and the guard read the code above it: the
// client's event or timer dispatch, or a test's own Lua, which the guards treat as the game's. The client judges
// the execution, not the stack (Blizzard_UIParentPanelManager/Shared/UIParentPanelManager.lua
// CheckProtectedFunctionsAllowed: `InCombatLockdown() and not issecure()`), so a tail call never hides addon code.
//
// fengari's parser marks a tail call in lparser.js's retstat, which ldo.js reaches through the module's exports.
// This file compiles a copy of lparser.js that leaves the call an ordinary OP_CALL (followed by the OP_RETURN
// the parser emits anyway) when the chunk is the addon's (@Core/, @Modules/, @Libs/), and puts the copy's
// functions on the module's exports, as lua-secret-ops.mjs does for lvm.js. Results are the same; only the
// stack depth differs. The harness's own files and the tests' Lua keep their tail calls: the harness's wrappers
// count their stack depth with them. tools/lua51/build.mjs makes the same change to the Lua 5.1 engine's lparser.c.

import fs from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import lparser from "fengari/src/lparser.js";
import fengari from "fengari";

const require = createRequire(import.meta.url);

// The addon's chunk names as bytes.
const ADDON_PREFIXES = ["@Core/", "@Modules/", "@Libs/"].map((p) => fengari.to_luastring(p));

// The tail-call test in retstat, as fengari 0.1.5 writes it, and what it becomes.
const FROM = "if (e.k === expkind.VCALL && nret === 1) {  /* tail call? */";
const TO = "if (e.k === expkind.VCALL && nret === 1 && !keepFrames(ls.source)) {  /* tail call? */";

// Whether a chunk (its source name, a TString) keeps its stack entries: the addon's do.
function keepFrames(source) {
  const name = source ? source.getstr() : null;
  return name !== null && ADDON_PREFIXES.some((p) => p.every((b, i) => name[i] === b));
}

// lparser.js's source with the change in, or an Error when the line no longer matches (a fengari upgrade).
function patchedSource(file) {
  const src = fs.readFileSync(file, "utf8");
  if (src.split(FROM).length !== 2) throw new Error("lua-keep-frames: fengari's lparser.js changed; no single tail-call test in retstat");
  return `const keepFrames = globalThis[Symbol.for("vanguard.keepFrames")];\n${src.replace(FROM, TO)}`;
}

// Compiles the patched copy beside the original and puts its functions on the original's exports, once per worker.
function installPatchedParser() {
  if (lparser.__wfgKeepFrames) return;
  globalThis[Symbol.for("vanguard.keepFrames")] = keepFrames;
  const file = require.resolve("fengari/src/lparser.js");
  const copy = new Module(file, null);
  copy.filename = file;
  copy.paths = Module._nodeModulePaths(path.dirname(file));
  copy._compile(patchedSource(file), file);
  Object.assign(lparser, copy.exports, { __wfgKeepFrames: true });
}
installPatchedParser();
