// The harness's Lua 5.1 engine (tools/lua51): the committed binary is the one its build recorded, and the vendored
// Lua sources are the Lua 5.1.5 tarball's. Needs no compiler; node tools/lua51/build.mjs --check rebuilds the
// binary and compares it byte for byte.

import fs from "node:fs";
import { expect, it } from "vitest";
import { RECORDED, WASM, sha256, verifySources } from "../tools/lua51/build.mjs";

it("the committed vg-lua51.wasm has the SHA-256 its build recorded", () => {
  const [recorded] = fs.readFileSync(RECORDED, "utf8").split(/\s+/);
  expect(sha256(WASM), "rebuild with node tools/lua51/build.mjs and commit the binary with its .sha256").toBe(recorded);
});

it("the vendored Lua sources are the Lua 5.1.5 tarball's, file for file", () => {
  expect(verifySources(), "COPYRIGHT and the 56 files of src/").toBe(57);
});
