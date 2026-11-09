#!/usr/bin/env node
// Writes scripts/fixtures/savedvariables/<version>.lua: the SavedVariables a released version of
// Vanguard writes, from that version's own code. It fetches the tag v<version>, unpacks it into a
// scratch folder, logs it in once in its own TEST-ONLY harness (setup finished, every module on),
// unlocks and locks the frames, logs out, and prints VanguardDB and VanguardCharDB as Lua source.
// scripts/tests/savedvariables.test.mjs loads every fixture into today's addon on both clients.
//
//   node scripts/savedvariables-fixture.mjs 0.9.3 [0.9.2 ...]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { root } from "./check-zip.mjs";
import { SERIALIZE_SV } from "./lib/sv-serialize.mjs";

const OUT = "scripts/fixtures/savedvariables";

// The script run inside the unpacked version: its own harness, one login, the tables as Lua.
const RUN = `
import { createAddon } from "./scripts/lib/lua-harness.mjs";
const addon = createAddon({ savedVariables: "VanguardDB = { version = 2, profiles = {}, setupDone = true }\\nVanguardCharDB = {}\\n" });
addon.login();
addon.slash("unlock"); addon.slash("lock"); addon.advance(2);
addon.fire("PLAYER_LOGOUT");
process.stdout.write(addon.eval(${JSON.stringify(SERIALIZE_SV)}));`;

// The released tree of a version in a scratch folder, sharing this clone's node_modules.
function unpack(version, scratch) {
  execFileSync("git", ["fetch", "-q", "--depth", "1", "origin", "tag", `v${version}`], { cwd: root });
  const dir = path.join(scratch, version);
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("sh", ["-c", `git archive v${version} | tar -x -C "${dir}"`], { cwd: root });
  fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
  return dir;
}

// The fixture's text: a header saying what made it, then the tables.
function fixture(version, lua) {
  const head = [
    `-- TEST-ONLY SavedVariables as Vanguard ${version} wrote them: the released v${version} logged in once in its own`,
    "-- harness (setup finished, every module on), unlocked and locked, then logged out. Made by",
    "-- scripts/savedvariables-fixture.mjs; never edit by hand. Loaded by scripts/tests/savedvariables.test.mjs.",
  ];
  return `${head.join("\n")}\n${lua}`;
}

// Writes one version's fixture.
function write(version, scratch) {
  const dir = unpack(version, scratch);
  fs.writeFileSync(path.join(dir, "fixture-run.mjs"), RUN);
  const lua = execFileSync(process.execPath, ["fixture-run.mjs"], { cwd: dir, encoding: "utf8", maxBuffer: 1 << 26 });
  fs.writeFileSync(path.join(root, OUT, `${version}.lua`), fixture(version, lua));
  console.log(`wrote ${OUT}/${version}.lua`);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vg-svfixture-"));
try {
  for (const version of process.argv.slice(2)) write(version, scratch);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
